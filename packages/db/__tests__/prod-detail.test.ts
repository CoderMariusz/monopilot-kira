import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ownerQueryWithOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '77777777-0002-4777-8002-777777777777';
const orgA = '77777777-0021-4777-8021-777777777777';
const orgB = '77777777-0022-4777-8022-777777777777';
const orgAUser = '77777777-02aa-4777-82aa-777777777777';
const orgBUser = '77777777-02bb-4777-82bb-777777777777';
const orgARole = '77777777-0211-4777-8211-777777777777';
const orgBRole = '77777777-0222-4777-8222-777777777777';

async function ensureAppUser(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedBaseOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Prod Detail Test Tenant', 'eu', 'https://prod-detail-test.example.test')
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
      values ($1, $2, 'Prod Detail Test Org A', 'bakery'),
             ($3, $2, 'Prod Detail Test Org B', 'fmcg')
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
      values ($1, $2, 'prod_detail_user', 'Prod Detail Test Role A', '[]'::jsonb, true),
             ($3, $4, 'prod_detail_user', 'Prod Detail Test Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'prod-detail-test-a@example.test', 'Prod Detail Test User A', $3),
             ($4, $5, 'prod-detail-test-b@example.test', 'Prod Detail Test User B', $6)
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
    'insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id',
    [sessionToken, orgId],
  );
}

async function seedProducts(adminPool: pg.Pool, productCodes: string[]) {
  // Migration 222: deleting a product that still has prod_detail children
  // raises (the cascade-fired refresh cannot find the deleted product), so
  // delete the children first, then the products — each under its own org
  // context (productCodes[0] belongs to orgA, [1] to orgB).
  await ownerQueryWithOrgContext(adminPool, orgA, 'delete from public.prod_detail where product_code = $1', [
    productCodes[0],
  ]);
  await ownerQueryWithOrgContext(adminPool, orgB, 'delete from public.prod_detail where product_code = $1', [
    productCodes[1],
  ]);
  await ownerQueryWithOrgContext(adminPool, orgA, 'delete from public.product where product_code = $1', [
    productCodes[0],
  ]);
  await ownerQueryWithOrgContext(adminPool, orgB, 'delete from public.product where product_code = $1', [
    productCodes[1],
  ]);
  // One wrapped insert per org: the org-context trigger validates each row
  // against app.current_org_id(), so a single statement cannot span orgs.
  await ownerQueryWithOrgContext(adminPool, orgA,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Prod Detail Org A Product', 1, $3)
    `,
    [productCodes[0], orgA, orgAUser],
  );
  await ownerQueryWithOrgContext(adminPool, orgB,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Prod Detail Org B Product', 1, $3)
    `,
    [productCodes[1], orgB, orgBUser],
  );
}

async function selectProdDetailForOrg(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  orgId: string,
  productCodes: string[],
) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await client.query<{ product_code: string; org_id: string; component_index: number }>(
      `
        select product_code, org_id, component_index
        from public.prod_detail
        where product_code = any($1::text[])
        order by product_code, component_index
      `,
      [productCodes],
    );
    await client.query('rollback');
    return result.rows;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

runIntegrationTest('076 prod_detail table', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseOrgData(adminPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('creates prod_detail with required indexes, forced RLS, non-null component_index, and cascade FK to product', async () => {
    const indexes = await adminPool.query<{ indexname: string; columns: string[] }>(
      `
        select
          c.relname as indexname,
          array_agg(a.attname::text order by ord.ordinality)::text[] as columns
        from pg_index i
        join pg_class t on t.oid = i.indrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_class c on c.oid = i.indexrelid
        join unnest(i.indkey) with ordinality as ord(attnum, ordinality) on true
        join pg_attribute a on a.attrelid = t.oid and a.attnum = ord.attnum
        where n.nspname = 'public'
          and t.relname = 'prod_detail'
        group by c.relname
      `,
    );

    expect(indexes.rows).toContainEqual({
      indexname: 'prod_detail_product_code_idx',
      columns: ['product_code'],
    });
    expect(indexes.rows).toContainEqual({
      indexname: 'prod_detail_org_product_code_idx',
      columns: ['org_id', 'product_code'],
    });

    const componentIndex = await adminPool.query<{ is_nullable: 'YES' | 'NO' }>(
      `
        select is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'prod_detail'
          and column_name = 'component_index'
      `,
    );
    expect(componentIndex.rows[0]?.is_nullable).toBe('NO');

    const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.prod_detail'::regclass",
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const fk = await adminPool.query<{ delete_rule: string; target_table: string; target_column: string }>(
      `
        select rc.delete_rule, ccu.table_name as target_table, ccu.column_name as target_column
        from information_schema.referential_constraints rc
        join information_schema.table_constraints tc
          on tc.constraint_catalog = rc.constraint_catalog
         and tc.constraint_schema = rc.constraint_schema
         and tc.constraint_name = rc.constraint_name
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_catalog = rc.unique_constraint_catalog
         and ccu.constraint_schema = rc.unique_constraint_schema
         and ccu.constraint_name = rc.unique_constraint_name
        where tc.table_schema = 'public'
          and tc.table_name = 'prod_detail'
      `,
    );

    expect(fk.rows).toContainEqual({
      delete_rule: 'CASCADE',
      target_table: 'product',
      target_column: 'product_code',
    });

    const policies = await appPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `
        select policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'prod_detail'
      `,
    );
    const policyText = policies.rows.map((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`).join('\n');
    expect(policyText).toMatch(/app\.current_org_id\(\)/);
    expect(policyText).not.toMatch(/tenant_id|current_setting\('app\.(tenant_id|current_org_id)'/);
  });

  it('deletes prod_detail rows through ON DELETE CASCADE when the product is deleted', async () => {
    const productCodes = ['PD-T002-CASCADE-A', 'PD-T002-CASCADE-B'];
    await seedProducts(adminPool, productCodes);
    await ownerQueryWithOrgContext(adminPool, orgA,
      `
        insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
        values ($1, $2, 1, 'INT-A1'),
               ($1, $2, 2, 'INT-A2')
      `,
      [productCodes[0], orgA],
    );
    await ownerQueryWithOrgContext(adminPool, orgB,
      `
        insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
        values ($1, $2, 1, 'INT-B1')
      `,
      [productCodes[1], orgB],
    );

    await ownerQueryWithOrgContext(adminPool, orgA, 'delete from public.product where product_code = $1', [
      productCodes[0],
    ]);

    const remaining = await adminPool.query<{ product_code: string; count: string }>(
      `
        select product_code, count(*)::text
        from public.prod_detail
        where product_code = any($1::text[])
        group by product_code
        order by product_code
      `,
      [productCodes],
    );
    expect(remaining.rows).toEqual([{ product_code: productCodes[1], count: '1' }]);
  });

  it('isolates prod_detail rows by org under app_user RLS', async () => {
    const productCodes = ['PD-T002-RLS-A', 'PD-T002-RLS-B'];
    await seedProducts(adminPool, productCodes);
    await ownerQueryWithOrgContext(adminPool, orgA,
      `
        insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
        values ($1, $2, 1, 'INT-A1')
      `,
      [productCodes[0], orgA],
    );
    await ownerQueryWithOrgContext(adminPool, orgB,
      `
        insert into public.prod_detail (product_code, org_id, component_index, intermediate_code)
        values ($1, $2, 1, 'INT-B1')
      `,
      [productCodes[1], orgB],
    );

    await expect(selectProdDetailForOrg(appPool, adminPool, orgA, productCodes)).resolves.toEqual([
      { product_code: productCodes[0], org_id: orgA, component_index: 1 },
    ]);
    await expect(selectProdDetailForOrg(appPool, adminPool, orgB, productCodes)).resolves.toEqual([
      { product_code: productCodes[1], org_id: orgB, component_index: 1 },
    ]);
  });
});
