import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 10-Finance SCHEMA foundation (migration 199). RED-first contract test.
// Covers: tables + org_id NOT NULL; FK indexes; RLS enabled+forced + app.current_org_id()
// cross-org isolation; canonical-owner separation (199 creates NO wo_outputs / schedule_outputs /
// oee_snapshots / downtime_events / license_plates / item_cost_history); NUMERIC-exact valuation
// round-trip (WAC avg_cost generated, FIFO layer) + variance generated column; RBAC seed to the
// org-admin family in BOTH role_permissions + roles.permissions jsonb; idempotent.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const FINANCE_TABLES = [
  'standard_costs',
  'wo_actual_costing',
  'inventory_cost_layers',
  'item_wac_state',
  'cost_variances',
  'finance_outbox_events',
  'd365_finance_dlq',
] as const;

// Canonical-owner tables that 199 must NOT create (owned by other modules).
const FOREIGN_OWNED_TABLES = [
  'wo_outputs', // 08-production
  'oee_snapshots', // 08-production
  'downtime_events', // 08-production
  'schedule_outputs', // 04-planning-basic
  'license_plates', // 05-warehouse
  'item_cost_history', // 03-technical (dual-owned, Technical's table)
] as const;

const FINANCE_PERMISSIONS = [
  'fin.actual_cost.view',
  'fin.d365.view',
  'fin.d365_dlq.replay',
  'fin.dashboard.view',
  'fin.reports.view',
  'fin.settings.edit',
  'fin.settings.view',
  'fin.standard_cost.approve',
  'fin.standard_cost.edit',
  'fin.standard_cost.view',
  'fin.valuation.close',
  'fin.valuation.view',
  'fin.variance.finalize',
  'fin.variance.view',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

const tenantId = randomUUID();
const orgAId = randomUUID();
const orgBId = randomUUID();
const newOrgId = randomUUID();

function bindOrg(adminPool: pg.Pool, appClient: pg.PoolClient, orgId: string): Promise<unknown> {
  const sessionToken = randomUUID();
  return adminPool
    .query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    )
    .then(() =>
      appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]),
    );
}

async function seedOrg(adminPool: pg.Pool, id: string, name: string) {
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, name, slug, industry_code)
     values ($1, $2, $3, $4, 'fmcg')
     on conflict (id) do nothing`,
    [id, tenantId, name, `fin-${id.slice(0, 8)}`],
  );
}

async function cleanupOrg(adminPool: pg.Pool, orgId: string) {
  for (const t of FINANCE_TABLES) {
    await adminPool.query(`delete from public.${t} where org_id = $1`, [orgId]).catch(() => undefined);
  }
  await adminPool
    .query(
      `delete from public.role_permissions rp using public.roles r
       where rp.role_id = r.id and r.org_id = $1`,
      [orgId],
    )
    .catch(() => undefined);
  await adminPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
}

runIntegrationSuite('10-finance schema foundation (migration 199)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Finance schema tenant', 'eu', 'https://fin.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await seedOrg(adminPool, orgAId, 'Finance Org A');
    await seedOrg(adminPool, orgBId, 'Finance Org B');
    // newOrgId is inserted INSIDE the trigger test so the AFTER INSERT seed fires end-to-end.
  });

  afterAll(async () => {
    for (const orgId of [orgAId, orgBId, newOrgId]) {
      await cleanupOrg(adminPool, orgId);
      await adminPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    }
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — all 7 finance tables exist with org_id NOT NULL + RLS enabled+forced', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...FINANCE_TABLES].sort());

    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(FINANCE_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }

    const { rows: rls } = await adminPool.query<{
      tablename: string;
      rowsecurity: boolean;
      forcerowsecurity: boolean;
    }>(
      `select tablename, rowsecurity, forcerowsecurity from pg_tables
       where schemaname = 'public' and tablename = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    for (const row of rls) {
      expect(row.rowsecurity, `${row.tablename} RLS enabled`).toBe(true);
      expect(row.forcerowsecurity, `${row.tablename} RLS forced`).toBe(true);
    }
  });

  it('AC1b — each finance table has an org-context policy referencing app.current_org_id()', async () => {
    const { rows } = await adminPool.query<{ tablename: string; qual: string | null }>(
      `select tablename, qual from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    const byTable = new Map<string, string>();
    for (const r of rows) byTable.set(r.tablename, r.qual ?? '');
    for (const t of FINANCE_TABLES) {
      expect(byTable.has(t), `${t} has a policy`).toBe(true);
      expect(byTable.get(t), `${t} policy references app.current_org_id()`).toContain(
        'app.current_org_id()',
      );
    }
  });

  it('AC1c — site_id is day-1 NULLABLE on every finance table', async () => {
    const { rows } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'site_id' and table_name = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    expect(rows).toHaveLength(FINANCE_TABLES.length);
    for (const row of rows) {
      expect(row.is_nullable, `${row.table_name}.site_id nullable`).toBe('YES');
    }
  });

  it('AC2 — FK indexes + FIFO partial consume index exist; money/qty columns are NUMERIC (no float)', async () => {
    const { rows: idx } = await adminPool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public' and tablename = any($1::text[])`,
      [FINANCE_TABLES as unknown as string[]],
    );
    const names = idx.map((r) => r.indexname);
    for (const expected of [
      'standard_costs_org_item_idx',
      'wo_actual_costing_org_wo_idx',
      'inventory_cost_layers_org_item_idx',
      'inventory_cost_layers_fifo_consume_idx',
      'item_wac_state_org_idx',
      'cost_variances_org_wo_idx',
      'finance_outbox_events_consolidator_idx',
    ]) {
      expect(names, `index ${expected}`).toContain(expected);
    }

    // No float/double/real for any finance money/qty column.
    const { rows: floats } = await adminPool.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])
         and data_type in ('double precision', 'real')`,
      [FINANCE_TABLES as unknown as string[]],
    );
    expect(floats, 'no float/real money or qty columns').toEqual([]);
  });

  it('AC3 — canonical-owner separation: migration 199 must NOT create foreign-owned tables it did not already inherit', async () => {
    // These tables may exist from their owning modules' migrations (181/183/177/191/160) — that is
    // fine. The contract here is that NONE of them carry a finance-owned audit/updated_at trigger
    // installed by 199's finance_set_updated_at helper, i.e. finance did not adopt them.
    const { rows } = await adminPool.query<{ relname: string; tgfoid: string }>(
      `select c.relname, p.proname as tgfoid
       from pg_trigger tg
       join pg_class c on c.oid = tg.tgrelid
       join pg_proc p on p.oid = tg.tgfoid
       where not tg.tgisinternal
         and c.relname = any($1::text[])
         and p.proname = 'finance_set_updated_at'`,
      [FOREIGN_OWNED_TABLES as unknown as string[]],
    );
    expect(rows, 'no finance updated_at trigger on a foreign-owned table').toEqual([]);
  });

  it('AC4 — RLS cross-org isolation: org B cannot see org A standard_costs / WAC / variances', async () => {
    const stdId = randomUUID();
    const wacItemId = randomUUID();
    const varWoId = randomUUID();
    const currencyId = randomUUID();

    await adminPool.query(
      `insert into public.standard_costs (id, org_id, item_id, currency_id, total_cost, status)
       values ($1, $2, $3, $4, 12.5000, 'approved')`,
      [stdId, orgAId, randomUUID(), currencyId],
    );
    await adminPool.query(
      `insert into public.item_wac_state (org_id, item_id, currency_id, total_qty_kg, total_value)
       values ($1, $2, $3, 100.000, 250.0000)`,
      [orgAId, wacItemId, currencyId],
    );
    await adminPool.query(
      `insert into public.cost_variances (org_id, wo_id, currency_id, category, standard_amount, actual_amount)
       values ($1, $2, $3, 'material', 100.0000, 130.0000)`,
      [orgAId, varWoId, currencyId],
    );

    const appClient = await appPool.connect();
    try {
      await bindOrg(adminPool, appClient, orgBId);
      const sc = await appClient.query(`select count(*)::int as n from public.standard_costs`);
      const wac = await appClient.query(`select count(*)::int as n from public.item_wac_state`);
      const cv = await appClient.query(`select count(*)::int as n from public.cost_variances`);
      expect(sc.rows[0].n, 'org B sees zero org A standard_costs').toBe(0);
      expect(wac.rows[0].n).toBe(0);
      expect(cv.rows[0].n).toBe(0);

      await bindOrg(adminPool, appClient, orgAId);
      const scA = await appClient.query(`select count(*)::int as n from public.standard_costs`);
      expect(scA.rows[0].n, 'org A sees its own row').toBeGreaterThanOrEqual(1);
    } finally {
      appClient.release();
    }
  });

  it('AC5 — NUMERIC-exact valuation round-trip: WAC avg_cost is GENERATED, variance_amount is GENERATED', async () => {
    const currencyId = randomUUID();
    const itemId = randomUUID();
    const woId = randomUUID();

    // WAC: 333.333 kg @ total 1000.0000 → avg 3.000003 (round-trip exact, no float drift).
    await adminPool.query(
      `insert into public.item_wac_state (org_id, item_id, currency_id, total_qty_kg, total_value)
       values ($1, $2, $3, 333.333, 1000.0000)`,
      [orgAId, itemId, currencyId],
    );
    const { rows: wac } = await adminPool.query<{ avg_cost: string }>(
      `select avg_cost from public.item_wac_state where org_id = $1 and item_id = $2`,
      [orgAId, itemId],
    );
    expect(wac).toHaveLength(1);
    expect(Number(wac[0].avg_cost)).toBeCloseTo(1000 / 333.333, 6);

    // FIFO layer: qty_remaining must default-equal and round-trip exactly.
    const lpId = randomUUID();
    await adminPool.query(
      `insert into public.inventory_cost_layers
         (org_id, item_id, license_plate_id, currency_id, qty_received_kg, qty_remaining_kg, unit_cost, total_value)
       values ($1, $2, $3, $4, 50.000, 50.000, 2.500000, 125.0000)`,
      [orgAId, itemId, lpId, currencyId],
    );
    const { rows: layer } = await adminPool.query<{ qty_remaining_kg: string; total_value: string }>(
      `select qty_remaining_kg, total_value from public.inventory_cost_layers where license_plate_id = $1`,
      [lpId],
    );
    expect(layer[0].qty_remaining_kg).toBe('50.000');
    expect(layer[0].total_value).toBe('125.0000');

    // Variance generated column: actual - standard.
    await adminPool.query(
      `insert into public.cost_variances (org_id, wo_id, currency_id, category, standard_amount, actual_amount)
       values ($1, $2, $3, 'labour', 200.0000, 175.5000)`,
      [orgAId, woId, currencyId],
    );
    const { rows: v } = await adminPool.query<{ variance_amount: string }>(
      `select variance_amount from public.cost_variances where org_id = $1 and wo_id = $2`,
      [orgAId, woId],
    );
    expect(v[0].variance_amount).toBe('-24.5000');
  });

  it('AC5b — V-FIN-INV-04: a negative qty_remaining_kg layer is rejected (no negative inventory)', async () => {
    await expect(
      adminPool.query(
        `insert into public.inventory_cost_layers
           (org_id, item_id, currency_id, qty_received_kg, qty_remaining_kg, unit_cost)
         values ($1, $2, $3, 10.000, -1.000, 1.000000)`,
        [orgAId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('AC6 — RBAC seed: a newly inserted org grants the full fin.* family to the org-admin family in BOTH stores', async () => {
    await seedOrg(adminPool, newOrgId, 'Finance Seed Org');

    const { rows } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'fin.%'
       order by rp.permission`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.map((r) => r.permission)).toEqual(FINANCE_PERMISSIONS);

    const { rows: jsonbRows } = await adminPool.query<{ code: string; perms: string[] }>(
      `select r.code,
              (select array_agg(p order by p)
               from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
               where p like 'fin.%') as perms
       from public.roles r
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(jsonbRows.length).toBeGreaterThan(0);
    for (const row of jsonbRows) {
      expect(row.perms ?? []).toEqual(FINANCE_PERMISSIONS);
    }
  });

  it('AC6b — RBAC seed is idempotent (re-running the seed function yields no duplicates)', async () => {
    await adminPool.query(`select public.seed_finance_permissions_for_org($1)`, [newOrgId]);
    await adminPool.query(`select public.seed_finance_permissions_for_org($1)`, [newOrgId]);

    const { rows: dupes } = await adminPool.query<{ copies: string }>(
      `select count(*)::text as copies
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'fin.%'
       group by rp.role_id, rp.permission
       having count(*) > 1`,
      [newOrgId],
    );
    expect(dupes).toEqual([]);
  });

  it('AC6c — non-admin functional roles do NOT receive the elevated fin.* approve/finalize/close strings', async () => {
    const { rows } = await adminPool.query<{ permission: string }>(
      `select rp.permission
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and r.code not in ('org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin')
         and rp.permission in ('fin.standard_cost.approve', 'fin.valuation.close', 'fin.variance.finalize', 'fin.d365_dlq.replay')`,
      [newOrgId],
    );
    expect(rows).toEqual([]);
  });
});
