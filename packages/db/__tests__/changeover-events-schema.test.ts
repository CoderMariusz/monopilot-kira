import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production T-006 — changeover_events schema (migration 184).
// Asserts: risk_level CHECK, chk_changeover_time (V-PROD-23), ext_jsonb (D9 L3), RLS forced.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08060000-0000-4000-8000-000000000001';
const orgId = '08060000-0000-4000-8000-0000000000a0';

async function seed(admin: pg.Pool) {
  await admin.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-006 Changeover Tenant', 'eu', 'https://t-006.example.test') on conflict (id) do nothing`,
    [tenantId],
  );
  await admin.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, 'Changeover Org', 'fmcg', 't-006-co') on conflict (id) do nothing`,
    [orgId, tenantId],
  );
}

async function cleanup(admin: pg.Pool) {
  await admin.query(`delete from public.changeover_events where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('08-production changeover_events schema (migration 184)', () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    admin = getOwnerConnection();
    await seed(admin);
    await cleanup(admin);
  });

  afterAll(async () => {
    await cleanup(admin);
    await admin.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await admin.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await admin.end();
  });

  it('AC1 — risk_level = unknown is rejected by CHECK', async () => {
    await expect(
      admin.query(
        `insert into public.changeover_events (org_id, line_id, risk_level, started_at)
         values ($1, 'LINE-1', 'unknown', now())`,
        [orgId],
      ),
    ).rejects.toThrow(/check|risk_level/i);
  });

  it('AC2 — completed_at < started_at is rejected by chk_changeover_time (V-PROD-23)', async () => {
    await expect(
      admin.query(
        `insert into public.changeover_events (org_id, line_id, risk_level, started_at, completed_at)
         values ($1, 'LINE-1', 'high', '2026-01-01T10:00:00Z', '2026-01-01T09:00:00Z')`,
        [orgId],
      ),
    ).rejects.toThrow(/check|chk_changeover_time/i);

    // valid (completed_at NULL) is accepted
    await admin.query(
      `insert into public.changeover_events (org_id, line_id, risk_level, started_at)
       values ($1, 'LINE-1', 'segregated', now())`,
      [orgId],
    );
  });

  it('AC3 — ext_jsonb JSONB column exists (D9 L3); RLS forced + app.current_org_id()', async () => {
    const { rows: col } = await admin.query<{ data_type: string }>(
      `select data_type from information_schema.columns
       where table_name = 'changeover_events' and column_name = 'ext_jsonb'`,
    );
    expect(col[0]?.data_type).toBe('jsonb');

    const { rows: rls } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'changeover_events' and relkind = 'r'`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    expect(rls[0].relforcerowsecurity).toBe(true);

    const { rows: pol } = await admin.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check from pg_policies where tablename = 'changeover_events'`,
    );
    const blob = `${pol[0]?.qual ?? ''} ${pol[0]?.with_check ?? ''}`;
    expect(blob).toContain('app.current_org_id()');
  });
});
