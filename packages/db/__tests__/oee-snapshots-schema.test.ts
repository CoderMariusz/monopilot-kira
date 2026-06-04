import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production T-008 — oee_snapshots schema (migration 184). D-OEE-1: 08 is the sole producer.
// Asserts: UNIQUE per (org,line,shift,snapshot_minute) (V-PROD-10), A/P/Q BETWEEN 0..100
// (V-PROD-25), GENERATED oee_pct = A*P*Q/10000, RLS forced.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08080000-0000-4000-8000-000000000001';
const orgId = '08080000-0000-4000-8000-0000000000a0';

async function seed(admin: pg.Pool) {
  await admin.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-008 OEE Tenant', 'eu', 'https://t-008.example.test') on conflict (id) do nothing`,
    [tenantId],
  );
  await admin.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, 'OEE Org', 'fmcg', 't-008-oee') on conflict (id) do nothing`,
    [orgId, tenantId],
  );
}

async function cleanup(admin: pg.Pool) {
  await admin.query(`delete from public.oee_snapshots where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('08-production oee_snapshots schema (migration 184)', () => {
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

  it('AC1 — duplicate (org,line,shift,snapshot_minute) raises unique_violation (V-PROD-10)', async () => {
    const minute = '2026-01-01T10:00:00Z';
    await admin.query(
      `insert into public.oee_snapshots (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct)
       values ($1, 'L1', 'A', $2, 90.00, 95.00, 98.00)`,
      [orgId, minute],
    );
    await expect(
      admin.query(
        `insert into public.oee_snapshots (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct)
         values ($1, 'L1', 'A', $2, 80.00, 90.00, 99.00)`,
        [orgId, minute],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('AC2 — availability_pct=120 is rejected by CHECK BETWEEN 0 AND 100 (V-PROD-25)', async () => {
    await expect(
      admin.query(
        `insert into public.oee_snapshots (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct)
         values ($1, 'L2', 'A', now(), 120.00, 90.00, 99.00)`,
        [orgId],
      ),
    ).rejects.toThrow(/check|availability/i);
  });

  it('AC3 — oee_pct equals A*P*Q/10000 within +/-0.01 (GENERATED) and is not user-settable', async () => {
    const id = (
      await admin.query<{ id: number }>(
        `insert into public.oee_snapshots (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct)
         values ($1, 'L3', 'A', now(), 90.00, 80.00, 95.00) returning id`,
        [orgId],
      )
    ).rows[0].id;
    const { rows } = await admin.query<{ oee_pct: string }>(
      `select oee_pct from public.oee_snapshots where id = $1`,
      [id],
    );
    // 90 * 80 * 95 / 10000 = 68.40
    expect(Math.abs(Number(rows[0].oee_pct) - 68.4)).toBeLessThanOrEqual(0.01);

    await expect(
      admin.query(
        `insert into public.oee_snapshots (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct, oee_pct)
         values ($1, 'L4', 'A', now(), 90.00, 80.00, 95.00, 50.00)`,
        [orgId],
      ),
    ).rejects.toThrow(/generated|cannot insert/i);
  });

  it('AC4 — RLS forced + app.current_org_id(); idx_oee_line_time exists', async () => {
    const { rows: rls } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'oee_snapshots' and relkind = 'r'`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    expect(rls[0].relforcerowsecurity).toBe(true);

    const { rows: idx } = await admin.query<{ indexname: string }>(
      `select indexname from pg_indexes where indexname = 'idx_oee_line_time'`,
    );
    expect(idx).toHaveLength(1);

    const { rows: pol } = await admin.query<{ qual: string | null }>(
      `select qual from pg_policies where tablename = 'oee_snapshots'`,
    );
    expect(`${pol[0]?.qual ?? ''}`).toContain('app.current_org_id()');
  });
});
