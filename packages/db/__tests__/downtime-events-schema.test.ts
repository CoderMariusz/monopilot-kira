import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production T-005 — downtime_events schema (migration 183).
// Asserts: downtime_source_enum values, GENERATED duration_min (V-PROD-06, not user-settable),
// idx_downtime_open partial WHERE ended_at IS NULL, RLS forced + app.current_org_id().

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08050000-0000-4000-8000-000000000001';
const orgId = '08050000-0000-4000-8000-0000000000a0';

async function seed(admin: pg.Pool) {
  await admin.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-005 Downtime Tenant', 'eu', 'https://t-005.example.test') on conflict (id) do nothing`,
    [tenantId],
  );
  await admin.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, 'Downtime Org', 'fmcg', 't-005-dt') on conflict (id) do nothing`,
    [orgId, tenantId],
  );
}

async function cleanup(admin: pg.Pool) {
  await admin.query(`delete from public.downtime_events where org_id = $1`, [orgId]).catch(() => undefined);
  await admin.query(`delete from public.downtime_categories where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('08-production downtime_events schema (migration 183)', () => {
  let admin: pg.Pool;
  let categoryId: string;

  beforeAll(async () => {
    admin = getOwnerConnection();
    await seed(admin);
    await cleanup(admin);
    categoryId = randomUUID();
    await admin.query(
      `insert into public.downtime_categories (id, org_id, code, name, kind) values ($1, $2, 'BRK', 'Breakdown', 'unplanned')`,
      [categoryId, orgId],
    );
  });

  afterAll(async () => {
    await cleanup(admin);
    await admin.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await admin.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await admin.end();
  });

  it('AC0 — downtime_source_enum has exactly the 4 values', async () => {
    const { rows } = await admin.query<{ enumlabel: string }>(
      `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'downtime_source_enum' order by e.enumsortorder`,
    );
    expect(rows.map((r) => r.enumlabel)).toEqual(['manual', 'wo_pause', 'plc_auto', 'changeover']);
  });

  it('AC1 — duration_min computed by GENERATED column matches minute diff (V-PROD-06)', async () => {
    const id = randomUUID();
    await admin.query(
      `insert into public.downtime_events (id, org_id, line_id, category_id, source, started_at, ended_at)
       values ($1, $2, 'LINE-1', $3, 'manual', '2026-01-01T10:00:00Z', '2026-01-01T10:45:00Z')`,
      [id, orgId, categoryId],
    );
    const { rows } = await admin.query<{ duration_min: number | null }>(
      `select duration_min from public.downtime_events where id = $1`,
      [id],
    );
    expect(rows[0].duration_min).toBe(45);
  });

  it('AC2 — attempting to SET duration_min is rejected (generated column)', async () => {
    await expect(
      admin.query(
        `insert into public.downtime_events (org_id, line_id, category_id, source, started_at, ended_at, duration_min)
         values ($1, 'LINE-2', $2, 'manual', now(), now(), 99)`,
        [orgId, categoryId],
      ),
    ).rejects.toThrow(/generated|cannot insert/i);
  });

  it('AC3 — idx_downtime_open partial WHERE ended_at IS NULL exists; RLS forced + app.current_org_id()', async () => {
    const { rows: idx } = await admin.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'idx_downtime_open'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef.toLowerCase()).toContain('ended_at is null');

    const { rows: rls } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'downtime_events' and relkind = 'r'`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    expect(rls[0].relforcerowsecurity).toBe(true);

    const { rows: pol } = await admin.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check from pg_policies where tablename = 'downtime_events'`,
    );
    const blob = `${pol[0]?.qual ?? ''} ${pol[0]?.with_check ?? ''}`;
    expect(blob).toContain('app.current_org_id()');
    expect(blob).not.toMatch(/current_setting\(\s*'app\.current_org_id'/);
  });
});
