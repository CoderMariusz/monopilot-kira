import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

// T-003 — Migration 160: item_cost_history (03-Technical cost rolls).
// DUAL-OWNED with 10-finance: Technical owns the cost master edit + history table.
// Hard constraints proven here: NUMERIC-exact cost columns (exact decimal round-trip),
// the four-value `source` CHECK enum, FK item_id → public.items(id), org RLS isolation,
// site_id day-1 (nullable, no FK), and idempotent re-apply.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/160-item-cost-history.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16000000-0000-4000-8000-000000000001';
const orgA = '16000000-0000-4000-8000-0000000000aa';
const orgB = '16000000-0000-4000-8000-0000000000bb';
const orgARole = '16000000-0000-4000-8000-00000000a111';
const orgBRole = '16000000-0000-4000-8000-00000000b222';
const orgAUser = '16000000-0000-4000-8000-00000000aaaa';
const orgBUser = '16000000-0000-4000-8000-00000000bbbb';
const itemA = '16000000-0000-4000-8000-00000000a0a0';
const itemB = '16000000-0000-4000-8000-00000000b0b0';

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
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Item Cost History Tenant', 'eu', 'https://item-cost-history.example.test')
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
      values ($1, $2, 'Item Cost History Org A', 'bakery'),
             ($3, $2, 'Item Cost History Org B', 'fmcg')
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
      values ($1, $2, 'item_cost_history_user', 'Item Cost History Role A', '[]'::jsonb, true),
             ($3, $4, 'item_cost_history_user', 'Item Cost History Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'item-cost-a@example.test', 'Item Cost User A', $3),
             ($4, $5, 'item-cost-b@example.test', 'Item Cost User B', $6)
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
      values ($1, $2, 'T160-ITEM-A', 'rm', 'Cost History Item A', 'kg'),
             ($3, $4, 'T160-ITEM-B', 'rm', 'Cost History Item B', 'kg')
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
  await adminPool.query(`delete from public.item_cost_history where item_id in ($1, $2)`, [itemA, itemB]);
  await adminPool.query(`delete from public.items where id in ($1, $2)`, [itemA, itemB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('160 item_cost_history migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/160-item-cost-history.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.item_cost_history/i);
    expect(migration).toMatch(/item_cost_history_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    // No floating-point types anywhere — NUMERIC-exact mandatory for cost columns.
    expect(migration).not.toMatch(/\b(float4|float8|float|double\s+precision|real)\b/i);
  });
});

runIntegrationTest('160 item_cost_history table', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Apply twice to prove idempotency (AC: idempotent re-apply).
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
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

  it('creates the explicit PRD column set with the source CHECK enum and FK to items', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'item_cost_history'
        order by ordinal_position
      `,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'id',
      'org_id',
      'site_id',
      'item_id',
      'cost_per_kg',
      'currency',
      'effective_from',
      'effective_to',
      'source',
      'created_by',
      'created_at',
      'updated_at',
    ]);

    const constraints = await adminPool.query<{ conname: string; def: string }>(
      `
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.item_cost_history'::regclass
        order by conname
      `,
    );
    const constraintText = constraints.rows.map((row) => `${row.conname}: ${row.def}`).join('\n');
    // source CHECK enforces exactly the four allowed enum values.
    expect(constraintText).toContain(
      "source = ANY (ARRAY['manual'::text, 'd365_sync'::text, 'supplier_update'::text, 'variance_roll'::text])",
    );
    // FK item_id -> public.items(id).
    expect(constraintText).toMatch(/FOREIGN KEY \(item_id\) REFERENCES items\(id\)/);
    // org FK present.
    expect(constraintText).toMatch(/FOREIGN KEY \(org_id\) REFERENCES organizations\(id\)/);
  });

  it('stores cost columns as exact NUMERIC (no floating point) with the PRD precision', async () => {
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
        where table_schema = 'public' and table_name = 'item_cost_history'
        order by ordinal_position
      `,
    );
    const byName = new Map(cols.rows.map((r) => [r.column_name, r]));

    const cost = byName.get('cost_per_kg');
    expect(cost?.data_type).toBe('numeric');
    expect(cost?.numeric_precision).toBe(10);
    expect(cost?.numeric_scale).toBe(4);

    const currency = byName.get('currency');
    expect(currency?.udt_name).toBe('bpchar'); // CHAR(3)

    // Hard guard: NO float/double/real anywhere in the table.
    for (const r of cols.rows) {
      expect(r.udt_name).not.toMatch(/^(float4|float8)$/);
      expect(r.data_type).not.toMatch(/double precision|real/);
    }
  });

  it('creates idx_item_cost_active ordered effective_from DESC and forces RLS', async () => {
    const indexes = await adminPool.query<{ indexname: string; indexdef: string }>(
      `
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public' and tablename = 'item_cost_history'
        order by indexname
      `,
    );
    const indexMap = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]));
    expect(indexMap.get('idx_item_cost_active')).toContain('(org_id, item_id, effective_from DESC)');
    // FK index covering item_id required by the org_id Wave0 conventions.
    const hasItemIdx = [...indexMap.values()].some((def) => /\(item_id\)/.test(def) || /\(org_id, item_id/.test(def));
    expect(hasItemIdx).toBe(true);

    const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
      `
        select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
        from pg_class
        where oid = 'public.item_cost_history'::regclass
      `,
    );
    expect(rls.rows).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);
  });

  it('publishes the item_cost_history_org_isolation policy through app.current_org_id only', async () => {
    const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `
        select policyname, qual, with_check
        from pg_policies
        where schemaname = 'public' and tablename = 'item_cost_history'
      `,
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.policyname).toBe('item_cost_history_org_isolation');
    const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
    expect(policyText).toContain('app.current_org_id()');
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });

  it('denies app_user visibility without an org context', async () => {
    await adminPool.query(
      `
        insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
        values ($1, $2, '1.2345', 'PLN', current_date, 'manual')
      `,
      [orgA, itemA],
    );

    const rows = await appPool.query(`select id from public.item_cost_history where item_id = $1`, [itemA]);
    expect(rows.rowCount).toBe(0);
  });

  it('isolates rows between orgs under app_user and round-trips NUMERIC cost exactly', async () => {
    // Clear any history rows left by earlier tests so the ordering assertion is deterministic.
    await adminPool.query(`delete from public.item_cost_history where item_id in ($1, $2)`, [itemA, itemB]);

    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      // Two rolls for the SAME item across effective dates — AC2 ordering check.
      await clientA.query(
        `
          insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
          values ($1, $2, '12.3456', 'PLN', date '2026-01-01', 'manual'),
                 ($1, $2, '13.9999', 'PLN', date '2026-06-01', 'd365_sync')
        `,
        [orgA, itemA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `
          insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
          values ($1, $2, '99.0001', 'EUR', date '2026-03-15', 'supplier_update')
        `,
        [orgB, itemB],
      );

      // AC2: idx_item_cost_active ordering — effective_from DESC.
      const visibleToA = await clientA.query<{ cost_per_kg: string; effective_from: string; source: string }>(
        `
          select cost_per_kg, to_char(effective_from, 'YYYY-MM-DD') as effective_from, source
          from public.item_cost_history
          where item_id = $1
          order by effective_from desc
        `,
        [itemA],
      );
      // Exact decimal round-trip retained at scale 4.
      expect(visibleToA.rows).toEqual([
        { cost_per_kg: '13.9999', effective_from: '2026-06-01', source: 'd365_sync' },
        { cost_per_kg: '12.3456', effective_from: '2026-01-01', source: 'manual' },
      ]);

      // RLS isolation: A cannot see B's row.
      const aSeesB = await clientA.query(`select id from public.item_cost_history where item_id = $1`, [itemB]);
      expect(aSeesB.rowCount).toBe(0);

      const visibleToB = await clientB.query<{ cost_per_kg: string }>(
        `select cost_per_kg from public.item_cost_history where item_id = $1`,
        [itemB],
      );
      expect(visibleToB.rows).toEqual([{ cost_per_kg: '99.0001' }]);

      // Cross-org spoof on insert is blocked by WITH CHECK.
      await expect(
        clientA.query(
          `
            insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
            values ($1, $2, '1.0000', 'PLN', current_date, 'manual')
          `,
          [orgB, itemB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await clientA.query('rollback').catch(() => undefined);
      await clientB.query('rollback').catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });

  it('rejects a source value outside the four-value enum', async () => {
    await expect(
      adminPool.query(
        `
          insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
          values ($1, $2, '1.0000', 'PLN', current_date, 'bogus_source')
        `,
        [orgA, itemA],
      ),
    ).rejects.toThrow(/item_cost_history_source_check|violates check constraint/i);
  });

  it('accepts a NULL site_id (day-1 nullable, no FK) on the operational table', async () => {
    const siteCol = await adminPool.query<{ is_nullable: string; column_default: string | null }>(
      `
        select is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = 'item_cost_history' and column_name = 'site_id'
      `,
    );
    expect(siteCol.rows[0]?.is_nullable).toBe('YES');

    // No FK constraint should reference site_id (registry comes in 14/T-030).
    const fks = await adminPool.query<{ def: string }>(
      `
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.item_cost_history'::regclass and contype = 'f'
      `,
    );
    for (const r of fks.rows) {
      expect(r.def).not.toMatch(/\(site_id\)/);
    }
  });
});
