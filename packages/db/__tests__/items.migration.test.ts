import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/153-items-master.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '15300000-0000-4000-8000-000000000001';
const orgA = '15300000-0000-4000-8000-0000000000aa';
const orgB = '15300000-0000-4000-8000-0000000000bb';
const orgARole = '15300000-0000-4000-8000-00000000a111';
const orgBRole = '15300000-0000-4000-8000-00000000b222';
const orgAUser = '15300000-0000-4000-8000-00000000aaaa';
const orgBUser = '15300000-0000-4000-8000-00000000bbbb';

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
      values ($1, 'Items Master Tenant', 'eu', 'https://items-master.example.test')
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
      values ($1, $2, 'Items Master Org A', 'bakery'),
             ($3, $2, 'Items Master Org B', 'fmcg')
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
      values ($1, $2, 'items_master_user', 'Items Master Role A', '[]'::jsonb, true),
             ($3, $4, 'items_master_user', 'Items Master Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'items-master-a@example.test', 'Items Master User A', $3),
             ($4, $5, 'items-master-b@example.test', 'Items Master User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
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
  await adminPool.query(`delete from public.items where item_code like 'T153-%'`);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('153 items master migration file', () => {
  it('exists and uses app.current_org_id without raw tenant/current_org GUC reads', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/153-items-master.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.items/i);
    expect(migration).toMatch(/items_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('153 items master table', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await cleanupRows(adminPool);
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

  it('creates the explicit PRD column set with item_type/status checks and per-org identity', async () => {
    const columns = await adminPool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'items'
        order by ordinal_position
      `,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'id',
      'org_id',
      'item_code',
      'item_type',
      'name',
      'description',
      'status',
      'product_group',
      'uom_base',
      'uom_secondary',
      'gs1_gtin',
      'weight_mode',
      'nominal_weight',
      'tare_weight',
      'gross_weight_max',
      'variance_tolerance_pct',
      'shelf_life_days',
      'shelf_life_mode',
      'date_code_format',
      'cost_per_kg',
      'd365_item_id',
      'd365_last_sync_at',
      'd365_sync_status',
      'ext_jsonb',
      'private_jsonb',
      'schema_version',
      'created_by',
      'created_at',
      'updated_at',
    ]);

    const constraints = await adminPool.query<{ conname: string; def: string }>(
      `
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.items'::regclass
        order by conname
      `,
    );
    const constraintText = constraints.rows.map((row) => `${row.conname}: ${row.def}`).join('\n');
    expect(constraintText).toContain("CHECK ((item_type = ANY (ARRAY['rm'::text, 'intermediate'::text, 'fg'::text, 'co_product'::text, 'byproduct'::text])))");
    expect(constraintText).toContain("CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'blocked'::text])))");
    expect(constraintText).toContain('UNIQUE (org_id, item_code)');
  });

  it('creates required indexes and forced RLS', async () => {
    const indexes = await adminPool.query<{ indexname: string; indexdef: string }>(
      `
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public' and tablename = 'items'
        order by indexname
      `,
    );
    const indexMap = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]));
    expect(indexMap.get('idx_items_org_type')).toContain('(org_id, item_type, status)');
    expect(indexMap.get('idx_items_d365')).toContain('WHERE (d365_item_id IS NOT NULL)');
    expect(indexMap.get('idx_items_ext_jsonb')).toContain('USING gin (ext_jsonb)');

    const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
      `
        select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
        from pg_class
        where oid = 'public.items'::regclass
      `,
    );
    expect(rls.rows).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);
  });

  it('publishes the items_org_isolation policy through app.current_org_id only', async () => {
    const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `
        select policyname, qual, with_check
        from pg_policies
        where schemaname = 'public' and tablename = 'items'
      `,
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.policyname).toBe('items_org_isolation');
    const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
    expect(policyText).toContain('app.current_org_id()');
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });

  it('denies app_user visibility without an org context', async () => {
    await adminPool.query(
      `
        insert into public.items (org_id, item_code, item_type, name, uom_base)
        values ($1, 'T153-OWNER-NULL', 'rm', 'Owner seeded item', 'kg')
        on conflict (org_id, item_code) do nothing
      `,
      [orgA],
    );

    const rows = await appPool.query(`select item_code from public.items where item_code = 'T153-OWNER-NULL'`);
    expect(rows.rowCount).toBe(0);
  });

  it('isolates item rows between two organizations under app_user', async () => {
    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      await clientA.query(
        `
          insert into public.items (org_id, item_code, item_type, name, uom_base, cost_per_kg)
          values ($1, 'T153-RM-A', 'rm', 'Org A RM', 'kg', '12.3456')
        `,
        [orgA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      await clientB.query(
        `
          insert into public.items (org_id, item_code, item_type, name, uom_base)
          values ($1, 'T153-RM-B', 'rm', 'Org B RM', 'kg')
        `,
        [orgB],
      );

      const visibleToA = await clientA.query<{ item_code: string; cost_per_kg: string | null }>(
        `select item_code, cost_per_kg from public.items where item_code like 'T153-RM-%' order by item_code`,
      );
      expect(visibleToA.rows).toEqual([{ item_code: 'T153-RM-A', cost_per_kg: '12.345600' }]);

      const visibleToB = await clientB.query<{ item_code: string }>(
        `select item_code from public.items where item_code like 'T153-RM-%' order by item_code`,
      );
      expect(visibleToB.rows).toEqual([{ item_code: 'T153-RM-B' }]);

      await expect(
        clientA.query(
          `
            insert into public.items (org_id, item_code, item_type, name, uom_base)
            values ($1, 'T153-SPOOF-B', 'rm', 'Spoofed Org B RM', 'kg')
          `,
          [orgB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await clientA.query('rollback').catch(() => undefined);
      await clientB.query('rollback').catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });
});
