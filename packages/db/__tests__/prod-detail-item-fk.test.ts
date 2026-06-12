import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext } from './owner-org-context.js';

// Migration 157 — prod_detail.item_id / formulation_ingredients.item_id FKs +
// public.sync_prod_detail_rows(product_code, app_version) recipe→prod_detail sync.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const tenantId = '77777777-1570-4777-8157-777777777777';
const orgA = '77777777-1571-4777-8157-777777777777';
const orgARole = '77777777-1572-4777-8157-777777777777';
const orgAUser = '77777777-157a-4777-8157-777777777777';

async function seedBaseOrgData(adminPool: pg.Pool) {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Item FK Test Tenant', 'eu', 'https://item-fk-test.example.test')
       on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Item FK Test Org', 'fmcg')
       on conflict (id) do update set name = excluded.name`,
    [orgA, tenantId],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
       values ($1, $2, 'item_fk_user', 'Item FK Role', '[]'::jsonb, true)
       on conflict (org_id, code) do update set name = excluded.name`,
    [orgARole, orgA],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'item-fk-test@example.test', 'Item FK User', $3)
       on conflict (id) do update set org_id = excluded.org_id`,
    [orgAUser, orgA, orgARole],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

/** Run a callback inside an app_user transaction pinned to orgA (RLS engaged). */
async function withApp<T>(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, orgA);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

runIntegrationTest('157 prod_detail/formulation item_id + sync_prod_detail_rows', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  const productCode = 'FAITEMFK1';

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseOrgData(adminPool);
    await ownerQueryWithInferredOrgContext(adminPool,'delete from public.prod_detail where product_code = $1', [productCode]);
    await adminPool.query('delete from public.product where product_code = $1', [productCode]);
    await adminPool.query(`delete from public.items where org_id = $1 and item_code like 'PR99%'`, [orgA]);
    await ownerQueryWithInferredOrgContext(adminPool,
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
         values ($1, $2, 'Item FK Product', 1, $3)`,
      [productCode, orgA, orgAUser],
    );
    // Two real items the sync can wire by code.
    await adminPool.query(
      `insert into public.items (org_id, item_code, item_type, name, uom_base, created_by)
         values ($1, 'PR9901', 'intermediate', 'Prosciutto Crudo', 'kg', $2),
                ($1, 'PR9902', 'intermediate', 'Salami Milano',    'kg', $2)`,
      [orgA, orgAUser],
    );
  });

  afterAll(async () => {
    await adminPool?.query('delete from public.prod_detail where product_code = $1', [productCode]);
    await adminPool?.query('delete from public.product where product_code = $1', [productCode]);
    await adminPool?.query(`delete from public.items where org_id = $1 and item_code like 'PR99%'`, [orgA]);
    await appPool?.end();
    await adminPool?.end();
  });

  it('adds nullable item_id FK columns to prod_detail and formulation_ingredients', async () => {
    const cols = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and column_name = 'item_id'
          and table_name in ('prod_detail', 'formulation_ingredients')
        order by table_name`,
    );
    expect(cols.rows).toEqual([
      { table_name: 'formulation_ingredients', is_nullable: 'YES' },
      { table_name: 'prod_detail', is_nullable: 'YES' },
    ]);

    const fk = await adminPool.query<{ conname: string }>(
      `select conname from pg_constraint where conname = 'prod_detail_item_id_fkey'`,
    );
    expect(fk.rows).toHaveLength(1);
  });

  it('materializes prod_detail rows from recipe_components and wires item_id by code', async () => {
    // Set the free-text recipe list, then sync — rows should appear with item_id.
    const rows = await withApp(appPool, adminPool, async (client) => {
      await client.query(
        `update public.product set recipe_components = $2
           where org_id = app.current_org_id() and product_code = $1`,
        [productCode, 'PR9901, PR9902'],
      );
      const changed = await client.query<{ sync_prod_detail_rows: number }>(
        `select public.sync_prod_detail_rows($1, 'test') as sync_prod_detail_rows`,
        [productCode],
      );
      expect(changed.rows[0].sync_prod_detail_rows).toBe(2);

      const out = await client.query<{ intermediate_code: string; component_index: number; item_id: string | null }>(
        `select intermediate_code, component_index, item_id::text
           from public.prod_detail
          where org_id = app.current_org_id() and product_code = $1
          order by component_index`,
        [productCode],
      );
      return out.rows;
    });

    expect(rows.map((r) => r.intermediate_code)).toEqual(['PR9901', 'PR9902']);
    expect(rows.map((r) => r.component_index)).toEqual([1, 2]);
    // Both components resolved to a real item.
    expect(rows.every((r) => r.item_id !== null)).toBe(true);
  });

  it('is idempotent and removes rows dropped from the recipe', async () => {
    const rows = await withApp(appPool, adminPool, async (client) => {
      // Re-run with the same recipe → no spurious changes.
      const again = await client.query<{ n: number }>(
        `select public.sync_prod_detail_rows($1, 'test') as n`,
        [productCode],
      );
      expect(again.rows[0].n).toBe(0);

      // Drop the second component, re-sync → only PR9901 remains.
      await client.query(
        `update public.product set recipe_components = 'PR9901'
           where org_id = app.current_org_id() and product_code = $1`,
        [productCode],
      );
      await client.query(`select public.sync_prod_detail_rows($1, 'test')`, [productCode]);
      const out = await client.query<{ intermediate_code: string }>(
        `select intermediate_code from public.prod_detail
          where org_id = app.current_org_id() and product_code = $1
          order by component_index`,
        [productCode],
      );
      return out.rows;
    });
    expect(rows.map((r) => r.intermediate_code)).toEqual(['PR9901']);
  });
});
