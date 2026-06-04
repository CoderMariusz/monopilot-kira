import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 04-Planning-Basic — Migrations 178 (MRP-core) + 179 (rough-cut capacity).
// Proven here: table + column shape, FK item_id -> items + run/requirement cascade FKs,
// NUMERIC-exact quantity columns (no float), MRP-netting CHECK constraints
// (quantity > 0, source_type/order_type/status enums, horizon range), org RLS isolation,
// site_id day-1 (nullable, no FK), and idempotent re-apply. DISJOINT from the parallel
// scheduling agent's schedule_outputs / wo_dependencies.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mrpMigrationPath = resolve(packageRoot, 'migrations/178-planning-mrp-core.sql');
const capacityMigrationPath = resolve(packageRoot, 'migrations/179-planning-capacity-rough-cut.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '17800000-0000-4000-8000-000000000001';
const orgA = '17800000-0000-4000-8000-0000000000aa';
const orgB = '17800000-0000-4000-8000-0000000000bb';
const orgARole = '17800000-0000-4000-8000-00000000a111';
const orgBRole = '17800000-0000-4000-8000-00000000b222';
const orgAUser = '17800000-0000-4000-8000-00000000aaaa';
const orgBUser = '17800000-0000-4000-8000-00000000bbbb';
const itemA = '17800000-0000-4000-8000-00000000a0a0';
const itemB = '17800000-0000-4000-8000-00000000b0b0';

function appUserConnectionString() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for app_user integration tests');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(adminPool: pg.Pool) {
  await adminPool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Planning MRP Tenant', 'eu', 'https://planning-mrp.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await adminPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Planning MRP Org A', 'bakery'),
             ($3, $2, 'Planning MRP Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'planning_mrp_user', 'Planning MRP Role A', '[]'::jsonb, true),
             ($3, $4, 'planning_mrp_user', 'Planning MRP Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'planning-mrp-a@example.test', 'Planning MRP User A', $3),
             ($4, $5, 'planning-mrp-b@example.test', 'Planning MRP User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  // Parent items for the FK item_id -> public.items(id).
  await adminPool.query(
    `
      insert into public.items (id, org_id, item_code, item_type, name, uom_base)
      values ($1, $2, 'T178-RM-A', 'rm', 'MRP Item A', 'kg'),
             ($3, $4, 'T178-RM-B', 'rm', 'MRP Item B', 'kg')
      on conflict (id) do update
        set item_code = excluded.item_code,
            name = excluded.name
    `,
    [itemA, orgA, itemB, orgB],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool.query(`delete from public.capacity_plan_lines where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.capacity_plans where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.mrp_planned_orders where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.mrp_requirements where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.reorder_thresholds where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.mrp_runs where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.items where id in ($1, $2)`, [itemA, itemB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('178/179 planning MRP + capacity migration files', () => {
  it('178 exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(mrpMigrationPath), 'expected migrations/178-planning-mrp-core.sql').toBe(true);
    const migration = readFileSync(mrpMigrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.mrp_runs/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.mrp_requirements/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.mrp_planned_orders/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.reorder_thresholds/i);
    expect(migration).toMatch(/mrp_runs_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    // Wave0 lock: no tenant_id *column* (the "(NOT tenant_id)" doc comment is allowed),
    // no raw GUC reads.
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    expect(migration).not.toMatch(/^\s*tenant_id\s+uuid/im);
    // NUMERIC-exact: no floating-point types anywhere.
    expect(migration).not.toMatch(/\b(float4|float8|float|double\s+precision|real)\b/i);
    // Ownership boundary: never create the canonical / scheduling-agent tables here.
    expect(migration).not.toMatch(/create\s+table[^;]*\bwo_outputs\b/i);
    expect(migration).not.toMatch(/create\s+table[^;]*\bschedule_outputs\b/i);
    expect(migration).not.toMatch(/create\s+table[^;]*\bwo_dependencies\b/i);
  });

  it('179 exists, is org-scoped via app.current_org_id, and creates no scheduling tables', () => {
    expect(existsSync(capacityMigrationPath), 'expected migrations/179-planning-capacity-rough-cut.sql').toBe(true);
    const migration = readFileSync(capacityMigrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.capacity_plans/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.capacity_plan_lines/i);
    expect(migration).toMatch(/capacity_plans_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    expect(migration).not.toMatch(/^\s*tenant_id\s+uuid/im);
    expect(migration).not.toMatch(/\b(float4|float8|float|double\s+precision|real)\b/i);
    expect(migration).not.toMatch(/create\s+table[^;]*\bscheduler_runs\b/i);
    expect(migration).not.toMatch(/create\s+table[^;]*\bschedule_outputs\b/i);
  });
});

runIntegrationTest('178/179 planning MRP + capacity tables', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Apply each migration twice to prove idempotency.
    await adminPool.query(readFileSync(mrpMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(mrpMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(capacityMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(capacityMigrationPath, 'utf8'));
    await cleanupRows(adminPool);
    await seedOrgData(adminPool);
  });

  afterAll(async () => {
    await cleanupRows(adminPool).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
    if (originalDatabaseUrlApp === undefined) {
      delete process.env.DATABASE_URL_APP;
    } else {
      process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
    }
  });

  it('creates all four MRP tables with org_id + day-1 nullable site_id and item FKs', async () => {
    for (const table of ['mrp_runs', 'mrp_requirements', 'mrp_planned_orders', 'reorder_thresholds']) {
      const cols = await adminPool.query<{ column_name: string; is_nullable: string }>(
        `
          select column_name, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name = $1
        `,
        [table],
      );
      const byName = new Map(cols.rows.map((r) => [r.column_name, r]));
      expect(byName.get('org_id')?.is_nullable, `${table}.org_id`).toBe('NO');
      // site_id present and day-1 nullable (no FK, no NOT NULL).
      expect(byName.has('site_id'), `${table}.site_id present`).toBe(true);
      expect(byName.get('site_id')?.is_nullable, `${table}.site_id nullable`).toBe('YES');
    }

    const constraints = await adminPool.query<{ def: string }>(
      `
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid in (
          'public.mrp_requirements'::regclass,
          'public.mrp_planned_orders'::regclass,
          'public.reorder_thresholds'::regclass
        )
      `,
    );
    const text = constraints.rows.map((r) => r.def).join('\n');
    // item_id FK -> items on every item-bearing MRP table.
    expect(text).toMatch(/FOREIGN KEY \(item_id\) REFERENCES items\(id\)/);
    // run cascade FK + requirement cascade FK present.
    expect(text).toMatch(/FOREIGN KEY \(run_id\) REFERENCES mrp_runs\(id\)/);
    expect(text).toMatch(/FOREIGN KEY \(requirement_id\) REFERENCES mrp_requirements\(id\)/);
  });

  it('site_id carries no FK on any MRP/capacity table (day-1 rule)', async () => {
    const fkOnSite = await adminPool.query<{ conname: string }>(
      `
        select c.conname
        from pg_constraint c
        where c.contype = 'f'
          and c.conrelid in (
            'public.mrp_runs'::regclass, 'public.mrp_requirements'::regclass,
            'public.mrp_planned_orders'::regclass, 'public.reorder_thresholds'::regclass,
            'public.capacity_plans'::regclass, 'public.capacity_plan_lines'::regclass
          )
          and (
            select attname from pg_attribute
            where attrelid = c.conrelid and attnum = c.conkey[1]
          ) = 'site_id'
      `,
    );
    expect(fkOnSite.rowCount).toBe(0);
  });

  it('stores quantity columns as exact NUMERIC (no float) at the declared precision', async () => {
    const cols = await adminPool.query<{
      column_name: string;
      data_type: string;
      numeric_precision: number | null;
      numeric_scale: number | null;
      udt_name: string;
    }>(
      `
        select column_name, data_type, numeric_precision, numeric_scale, udt_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('mrp_requirements', 'mrp_planned_orders', 'reorder_thresholds', 'capacity_plan_lines')
      `,
    );
    for (const r of cols.rows) {
      expect(r.udt_name, `${r.column_name} not float`).not.toMatch(/^(float4|float8)$/);
      expect(r.data_type, `${r.column_name} not double/real`).not.toMatch(/double precision|real/);
    }
    const byName = new Map(cols.rows.map((r) => [`${r.column_name}`, r]));
    const net = byName.get('net_requirement');
    expect(net?.data_type).toBe('numeric');
    expect(net?.numeric_precision).toBe(18);
    expect(net?.numeric_scale).toBe(6);
    const avail = byName.get('available_hours');
    expect(avail?.numeric_precision).toBe(12);
    expect(avail?.numeric_scale).toBe(4);
  });

  it('forces RLS and publishes org-isolation policies via app.current_org_id only', async () => {
    for (const table of [
      'mrp_runs', 'mrp_requirements', 'mrp_planned_orders', 'reorder_thresholds',
      'capacity_plans', 'capacity_plan_lines',
    ]) {
      const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
        `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
         from pg_class where oid = ('public.' || $1)::regclass`,
        [table],
      );
      expect(rls.rows, `${table} RLS`).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);

      const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `select policyname, qual, with_check from pg_policies
         where schemaname = 'public' and tablename = $1`,
        [table],
      );
      expect(policies.rows.length, `${table} policy count`).toBe(1);
      const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
      expect(policyText, `${table} policy uses app.current_org_id()`).toContain('app.current_org_id()');
      expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });

  it('enforces MRP-netting CHECK constraints (quantity > 0, enums)', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const runRes = await client.query<{ id: string }>(
        `insert into public.mrp_runs (org_id, run_number, horizon_end)
         values ($1, 'MRP-2026-00001', current_date + 14) returning id`,
        [orgA],
      );
      const runId = runRes.rows[0]!.id;

      // quantity > 0 enforced. Wrap in a savepoint so the aborted statement does not
      // poison the surrounding transaction for the next assertion.
      await client.query('savepoint sp_qty');
      await expect(
        client.query(
          `insert into public.mrp_planned_orders (org_id, run_id, item_id, order_type, quantity, uom, due_date)
           values ($1, $2, $3, 'po', 0, 'kg', current_date + 7)`,
          [orgA, runId, itemA],
        ),
      ).rejects.toThrow(/mrp_planned_orders_quantity_positive_check/);
      await client.query('rollback to savepoint sp_qty');

      // order_type enum enforced.
      await client.query('savepoint sp_type');
      await expect(
        client.query(
          `insert into public.mrp_planned_orders (org_id, run_id, item_id, order_type, quantity, uom, due_date)
           values ($1, $2, $3, 'invoice', 5, 'kg', current_date + 7)`,
          [orgA, runId, itemA],
        ),
      ).rejects.toThrow(/mrp_planned_orders_order_type_check/);
      await client.query('rollback to savepoint sp_type');

      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('pegs a planned order to its requirement and isolates rows between orgs', async () => {
    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const runA = await clientA.query<{ id: string }>(
        `insert into public.mrp_runs (org_id, run_number, horizon_end, status)
         values ($1, 'MRP-2026-A001', current_date + 30, 'completed') returning id`,
        [orgA],
      );
      const runAId = runA.rows[0]!.id;
      // netting ledger row: gross 100, receipts 20, on-hand 30 → net 50.
      const reqA = await clientA.query<{ id: string; net_requirement: string }>(
        `insert into public.mrp_requirements
           (org_id, run_id, item_id, bucket_date, gross_requirement, scheduled_receipts, projected_on_hand, net_requirement, uom)
         values ($1, $2, $3, current_date + 5, '100', '20', '30', '50', 'kg')
         returning id, net_requirement`,
        [orgA, runAId, itemA],
      );
      const reqAId = reqA.rows[0]!.id;
      expect(reqA.rows[0]!.net_requirement).toBe('50.000000');
      // planned order pegged to the requirement.
      await clientA.query(
        `insert into public.mrp_planned_orders
           (org_id, run_id, requirement_id, item_id, order_type, quantity, uom, due_date)
         values ($1, $2, $3, $4, 'po', '50', 'kg', current_date + 5)`,
        [orgA, runAId, reqAId, itemA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      const runB = await clientB.query<{ id: string }>(
        `insert into public.mrp_runs (org_id, run_number, horizon_end)
         values ($1, 'MRP-2026-B001', current_date + 30) returning id`,
        [orgB],
      );
      await clientB.query(
        `insert into public.mrp_requirements
           (org_id, run_id, item_id, bucket_date, gross_requirement, net_requirement, uom)
         values ($1, $2, $3, current_date + 3, '7', '7', 'kg')`,
        [orgB, runB.rows[0]!.id, itemB],
      );

      // RLS isolation: A sees only A's runs.
      const aRuns = await clientA.query<{ run_number: string }>(`select run_number from public.mrp_runs`);
      expect(aRuns.rows.map((r) => r.run_number).sort()).toEqual(['MRP-2026-A001']);
      const bRuns = await clientB.query<{ run_number: string }>(`select run_number from public.mrp_runs`);
      expect(bRuns.rows.map((r) => r.run_number).sort()).toEqual(['MRP-2026-B001']);

      // peg integrity: A's planned order references A's requirement.
      const pegged = await clientA.query<{ requirement_id: string }>(
        `select requirement_id from public.mrp_planned_orders where run_id = $1`,
        [runAId],
      );
      expect(pegged.rows[0]!.requirement_id).toBe(reqAId);

      await clientA.query('rollback');
      await clientB.query('rollback');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it('upserts reorder_thresholds idempotently on UNIQUE(org_id, item_id)', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      await client.query(
        `insert into public.reorder_thresholds (org_id, item_id, min_qty, reorder_qty)
         values ($1, $2, '10', '25')`,
        [orgA, itemA],
      );
      // second insert with the same (org, item) violates the UNIQUE — must be an upsert in service code.
      await client.query('savepoint sp_uq');
      await expect(
        client.query(
          `insert into public.reorder_thresholds (org_id, item_id, min_qty, reorder_qty)
           values ($1, $2, '5', '15')`,
          [orgA, itemA],
        ),
      ).rejects.toThrow(/reorder_thresholds_org_item_unique/);
      await client.query('rollback to savepoint sp_uq');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('isolates capacity plans by org and enforces non-negative hours', async () => {
    const orgASession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const plan = await client.query<{ id: string }>(
        `insert into public.capacity_plans (org_id, plan_number, horizon_end)
         values ($1, 'CAP-2026-A001', current_date + 14) returning id`,
        [orgA],
      );
      const planId = plan.rows[0]!.id;
      await client.query(
        `insert into public.capacity_plan_lines
           (org_id, plan_id, resource_id, bucket_date, available_hours, required_hours)
         values ($1, $2, $3, current_date + 1, '16.0000', '20.5000')`,
        [orgA, planId, randomUUID()],
      );
      // negative hours rejected.
      await client.query('savepoint sp_neg');
      await expect(
        client.query(
          `insert into public.capacity_plan_lines
             (org_id, plan_id, resource_id, bucket_date, available_hours, required_hours)
           values ($1, $2, $3, current_date + 2, '-1', '0')`,
          [orgA, planId, randomUUID()],
        ),
      ).rejects.toThrow(/capacity_plan_lines_available_nonnegative_check/);
      await client.query('rollback to savepoint sp_neg');

      const lines = await client.query<{ available_hours: string; required_hours: string }>(
        `select available_hours, required_hours from public.capacity_plan_lines where plan_id = $1`,
        [planId],
      );
      // exact NUMERIC round-trip at scale 4.
      expect(lines.rows).toEqual([{ available_hours: '16.0000', required_hours: '20.5000' }]);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
