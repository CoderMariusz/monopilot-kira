import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

/**
 * T-002 — bom_lines.item_id FK + bom_co_products + bom_snapshots (migration 159).
 *
 * RED-first DB tests for the shared BOM SSOT extension. Models the structure of
 * shared-bom-ssot.test.ts (090). Requires DATABASE_URL — integration blocks are
 * skipped otherwise.
 */
const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/159-bom-items-fk-coproducts-snapshots.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '15900000-0000-4000-8000-000000000001';
const orgA = '15900000-0000-4000-8000-0000000000aa';
const orgB = '15900000-0000-4000-8000-0000000000bb';
const orgARole = '15900000-0000-4000-8000-00000000a111';
const orgBRole = '15900000-0000-4000-8000-00000000b222';
const orgAUser = '15900000-0000-4000-8000-00000000aaaa';
const orgBUser = '15900000-0000-4000-8000-00000000bbbb';
const productA = 'FG-T002-A';
const productB = 'FG-T002-B';

async function ensureAppUser(pool: pg.Pool) {
  await pool.query(`
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

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-002 BOM Test Tenant', 'eu', 'https://t002-bom.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-002 Org A', 'bakery'),
            ($3, $2, 'T-002 Org B', 'fmcg')
     on conflict (id) do nothing`,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 't002_bom_user', 'T-002 Role A', '[]'::jsonb, true),
            ($3, $4, 't002_bom_user', 'T-002 Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't002-a@example.test', 'T-002 User A', $3),
            ($4, $5, 't002-b@example.test', 'T-002 User B', $6)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  // Idempotent product seed. We never delete bom_headers here — bom_snapshots is immutable
  // (DELETE blocked by trigger), so destructive header cleanup would fail on a re-seed.
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'T-002 FG A', 1, $3),
            ($4, $5, 'T-002 FG B', 1, $6)
     on conflict (org_id, product_code) do nothing`,
    [productA, orgA, orgAUser, productB, orgB, orgBUser],
  );
}

/** Returns the created item id (an active RM item usable as a BOM component/co-product). */
async function createItem(pool: pg.Pool, orgId: string, itemType: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
     values ($1, $2, $3, $4, $5, 'kg', 'active')`,
    [id, orgId, `T002-${itemType}-${id.slice(0, 8)}`, itemType, `T-002 ${itemType}`],
  );
  return id;
}

/**
 * Creates a draft bom_headers tied to a product and returns its id. A unique version per
 * call avoids colliding on bom_headers_org_product_version_unique across tests.
 */
let headerVersionSeq = 1000 + Math.floor(Math.random() * 100000);
async function createDraftHeader(pool: pg.Pool, orgId: string, productCode: string, userId: string): Promise<string> {
  const id = randomUUID();
  const version = ++headerVersionSeq;
  await pool.query(
    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version, created_by_user)
     values ($1, $2, $3, 'technical', 'draft', $4, $5)`,
    [id, orgId, productCode, version, userId],
  );
  return id;
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

describe('159 BOM co-products + snapshots migration contract', () => {
  it('declares item_id FK, both new tables, RLS, day-1 site_id, and no stale tenant patterns', () => {
    expect(existsSync(migrationPath), 'expected migrations/159-bom-items-fk-coproducts-snapshots.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/alter table public\.bom_lines\s+add column if not exists item_id uuid/i);
    expect(sql).toMatch(/bom_lines_item_id_fkey[\s\S]*references public\.items\(id\)/i);
    expect(sql).toMatch(/create table if not exists public\.bom_co_products/i);
    expect(sql).toMatch(/create table if not exists public\.bom_snapshots/i);
    expect(sql).toMatch(/snapshot_json jsonb not null/i);
    expect(sql).toMatch(/create index if not exists idx_bom_snapshots_wo/i);
    // Day-1 multi-site: site_id uuid NULL (no NOT NULL, no FK) on each new operational table.
    expect(sql).toMatch(/bom_co_products[\s\S]*site_id uuid,/i);
    expect(sql).toMatch(/bom_snapshots[\s\S]*site_id uuid,/i);
    expect(sql).not.toMatch(/site_id uuid not null/i);
    expect(sql).not.toMatch(/site_id[^\n]*references public\.sites/i);
    expect(sql).toMatch(/enable row level security[\s\S]*bom_co_products|bom_co_products[\s\S]*enable row level security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    // No work_order FK here — 08-PRODUCTION owns work_orders.
    expect(sql).not.toMatch(/work_order_id[^\n]*references public\.work_orders/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('159 BOM co-products + snapshots schema behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('adds bom_lines.item_id with a FK to public.items and a supporting index', async () => {
    const cols = await ownerPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
       from information_schema.columns
       where table_schema = 'public' and table_name = 'bom_lines' and column_name = 'item_id'`,
    );
    expect(cols.rows).toEqual([{ column_name: 'item_id', is_nullable: 'YES' }]);
    // component_code stays for display / back-compat.
    const compat = await ownerPool.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'bom_lines' and column_name = 'component_code'`,
    );
    expect(compat.rows).toHaveLength(1);

    const fk = await ownerPool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint where conname = 'bom_lines_item_id_fkey'`,
    );
    expect(fk.rows[0]?.definition).toMatch(/FOREIGN KEY \(item_id\) REFERENCES items\(id\)/i);

    const idx = await ownerPool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public' and tablename = 'bom_lines' and indexname = 'bom_lines_org_item_idx'`,
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('creates bom_co_products + bom_snapshots with day-1 site_id, forced RLS, and org policies', async () => {
    for (const tableName of ['bom_co_products', 'bom_snapshots']) {
      const site = await ownerPool.query<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = 'site_id'`,
        [tableName],
      );
      expect(site.rows, `${tableName}.site_id must exist`).toEqual([{ is_nullable: 'YES' }]);
    }

    const rls = await ownerPool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where oid in ('public.bom_co_products'::regclass, 'public.bom_snapshots'::regclass)
       order by relname`,
    );
    expect(rls.rows).toEqual([
      { relname: 'bom_co_products', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'bom_snapshots', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const policies = await ownerPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check
       from pg_policies
       where schemaname = 'public' and tablename in ('bom_co_products', 'bom_snapshots')`,
    );
    expect(policies.rows.length).toBeGreaterThanOrEqual(2);
    expect(policies.rows.every((r) => `${r.qual ?? ''} ${r.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);

    const idx = await ownerPool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public' and tablename = 'bom_snapshots'
       order by indexname`,
    );
    expect(idx.rows.map((r) => r.indexname)).toEqual(expect.arrayContaining(['idx_bom_snapshots_wo']));
  });

  it('cascades co-products on header delete and rejects negative / byproduct allocation violations', async () => {
    const headerId = await createDraftHeader(ownerPool, orgA, productA, orgAUser);
    const coItemId = await createItem(ownerPool, orgA, 'co_product');
    const bypItemId = await createItem(ownerPool, orgA, 'byproduct');

    await ownerPool.query(
      `insert into public.bom_co_products
         (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct)
       values ($1, $2, $3, 10.000000, 'kg', 20.000, false),
              ($1, $2, $4, 5.000000, 'kg', 0.000, true)`,
      [orgA, headerId, coItemId, bypItemId],
    );

    // V-TEC: byproduct with non-zero allocation is rejected.
    await expect(
      ownerPool.query(
        `insert into public.bom_co_products
           (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct)
         values ($1, $2, $3, 1.0, 'kg', 12.5, true)`,
        [orgA, headerId, await createItem(ownerPool, orgA, 'byproduct')],
      ),
    ).rejects.toThrow(/bom_co_products_byproduct_allocation_check|check constraint/i);

    const before = await ownerPool.query<{ count: string }>(
      'select count(*)::text as count from public.bom_co_products where bom_header_id = $1',
      [headerId],
    );
    expect(before.rows[0]?.count).toBe('2');

    // ON DELETE CASCADE — deleting the header removes its co-products.
    await ownerPool.query('delete from public.bom_headers where id = $1', [headerId]);
    const after = await ownerPool.query<{ count: string }>(
      'select count(*)::text as count from public.bom_co_products where bom_header_id = $1',
      [headerId],
    );
    expect(after.rows[0]?.count).toBe('0');
  });

  it('stores immutable bom_snapshots — UPDATE/DELETE are rejected, INSERT requires a JSON object', async () => {
    const headerId = await createDraftHeader(ownerPool, orgA, productA, orgAUser);
    const snapId = randomUUID();
    await ownerPool.query(
      `insert into public.bom_snapshots (id, org_id, work_order_id, bom_header_id, snapshot_json)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [snapId, orgA, randomUUID(), headerId, JSON.stringify({ header: {}, lines: [], co_products: [] })],
    );

    await expect(
      ownerPool.query(`update public.bom_snapshots set snapshot_json = '{}'::jsonb where id = $1`, [snapId]),
    ).rejects.toThrow(/bom_snapshots rows are immutable/i);
    await expect(
      ownerPool.query('delete from public.bom_snapshots where id = $1', [snapId]),
    ).rejects.toThrow(/bom_snapshots rows are immutable/i);

    // snapshot_json must be a JSON object, not an array/scalar.
    await expect(
      ownerPool.query(
        `insert into public.bom_snapshots (org_id, bom_header_id, snapshot_json)
         values ($1, $2, '[]'::jsonb)`,
        [orgA, headerId],
      ),
    ).rejects.toThrow(/bom_snapshots_snapshot_json_object_check|check constraint/i);

    await ownerPool.query('delete from public.bom_headers where id = $1', [headerId]).catch(() => undefined);
  });

  it('isolates co-products + snapshots by org and rejects cross-org app_user inserts via WITH CHECK', async () => {
    const headerA = await createDraftHeader(ownerPool, orgA, productA, orgAUser);
    const headerB = await createDraftHeader(ownerPool, orgB, productB, orgBUser);
    const coItemA = await createItem(ownerPool, orgA, 'co_product');
    const coItemB = await createItem(ownerPool, orgB, 'co_product');
    const sessionToken = randomUUID();

    await ownerPool.query(
      `insert into public.bom_co_products
         (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct)
       values ($1, $2, $3, 1.0, 'kg', 10.0),
              ($4, $5, $6, 1.0, 'kg', 10.0)`,
      [orgA, headerA, coItemA, orgB, headerB, coItemB],
    );
    await ownerPool.query(
      `insert into public.bom_snapshots (org_id, bom_header_id, snapshot_json)
       values ($1, $2, '{"o":"a"}'::jsonb), ($3, $4, '{"o":"b"}'::jsonb)`,
      [orgA, headerA, orgB, headerB],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const co = await client.query<{ org_id: string }>(
        'select org_id from public.bom_co_products where bom_header_id in ($1, $2)',
        [headerA, headerB],
      );
      expect(co.rows).toEqual([{ org_id: orgA }]);

      const snaps = await client.query<{ org_id: string }>(
        'select org_id from public.bom_snapshots where bom_header_id in ($1, $2)',
        [headerA, headerB],
      );
      expect(snaps.rows).toEqual([{ org_id: orgA }]);

      // Cross-org write is blocked by WITH CHECK.
      await expect(
        client.query(
          `insert into public.bom_co_products
             (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct)
           values ($1, $2, $3, 1.0, 'kg', 5.0)`,
          [orgB, headerB, coItemB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
