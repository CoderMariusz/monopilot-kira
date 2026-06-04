import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production T-007 — allergen_changeover_validations schema (migration 184).
// Asserts: retention_until = validated_at + 7y (V-PROD-09 trigger), chk_allergen_signatures
// (V-PROD-08, >=2 for risk>=medium; low accepts 1), RLS forced.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08070000-0000-4000-8000-000000000001';
const orgId = '08070000-0000-4000-8000-0000000000a0';

async function seed(admin: pg.Pool) {
  await admin.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-007 Allergen Tenant', 'eu', 'https://t-007.example.test') on conflict (id) do nothing`,
    [tenantId],
  );
  await admin.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, 'Allergen Org', 'fmcg', 't-007-al') on conflict (id) do nothing`,
    [orgId, tenantId],
  );
}

async function cleanup(admin: pg.Pool) {
  await admin.query(`delete from public.allergen_changeover_validations where org_id = $1`, [orgId]).catch(() => undefined);
  await admin.query(`delete from public.changeover_events where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('08-production allergen_changeover_validations schema (migration 184)', () => {
  let admin: pg.Pool;
  let changeoverId: string;

  beforeAll(async () => {
    admin = getOwnerConnection();
    await seed(admin);
    await cleanup(admin);
    changeoverId = randomUUID();
    await admin.query(
      `insert into public.changeover_events (id, org_id, line_id, risk_level, started_at)
       values ($1, $2, 'LINE-1', 'high', now())`,
      [changeoverId, orgId],
    );
  });

  afterAll(async () => {
    await cleanup(admin);
    await admin.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await admin.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await admin.end();
  });

  it('AC1 — retention_until = validated_at + 7y set by trigger (V-PROD-09)', async () => {
    const id = randomUUID();
    await admin.query(
      `insert into public.allergen_changeover_validations
         (id, org_id, changeover_event_id, validation_result, risk_level, cleaning_evidence, signatures, validated_at, retention_until)
       values ($1, $2, $3, 'pass', 'high', '{"checklist":[]}'::jsonb,
               '[{"u":"a"},{"u":"b"}]'::jsonb, '2026-01-01T00:00:00Z', '2026-01-02')`,
      [id, orgId, changeoverId],
    );
    const { rows } = await admin.query<{ retention_until: string; validated_at: string }>(
      `select retention_until::text, validated_at::text from public.allergen_changeover_validations where id = $1`,
      [id],
    );
    // Supplied retention_until (2026-01-02) is below 7y and is clamped up to 2033-01-01.
    expect(rows[0].retention_until).toBe('2033-01-01');
  });

  it('AC2 — risk_level=high with 1 signature is rejected by chk_allergen_signatures (V-PROD-08)', async () => {
    await expect(
      admin.query(
        `insert into public.allergen_changeover_validations
           (org_id, changeover_event_id, validation_result, risk_level, cleaning_evidence, signatures)
         values ($1, $2, 'pass', 'high', '{}'::jsonb, '[{"u":"a"}]'::jsonb)`,
        [orgId, changeoverId],
      ),
    ).rejects.toThrow(/check|chk_allergen_signatures/i);
  });

  it('AC3 — risk_level=low with 1 signature is accepted; RLS forced', async () => {
    await admin.query(
      `insert into public.allergen_changeover_validations
         (org_id, changeover_event_id, validation_result, risk_level, cleaning_evidence, signatures)
       values ($1, $2, 'pass', 'low', '{}'::jsonb, '[{"u":"a"}]'::jsonb)`,
      [orgId, changeoverId],
    );

    const { rows: rls } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class
       where relname = 'allergen_changeover_validations' and relkind = 'r'`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    expect(rls[0].relforcerowsecurity).toBe(true);
  });
});
