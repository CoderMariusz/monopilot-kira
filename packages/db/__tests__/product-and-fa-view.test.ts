import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '77777777-7777-4777-8777-777777777777';
const orgA = '77777777-1111-4777-8111-777777777777';
const orgB = '77777777-2222-4777-8222-777777777777';
const orgAUser = '77777777-aaaa-4777-8aaa-777777777777';
const orgBUser = '77777777-bbbb-4777-8bbb-777777777777';
const orgARole = '77777777-a111-4777-8111-777777777777';
const orgBRole = '77777777-b222-4777-8222-777777777777';

const businessColumns = [
  'product_code',
  'product_name',
  'pack_size',
  'number_of_cases',
  'recipe_components',
  'ingredient_codes',
  'template',
  'closed_core',
  'primary_ingredient_pct',
  'runs_per_week',
  'date_code_per_week',
  'closed_planning',
  'launch_date',
  'department_number',
  'article_number',
  'bar_codes',
  'cases_per_week_w1',
  'cases_per_week_w2',
  'cases_per_week_w3',
  'closed_commercial',
  'process_1',
  'yield_p1',
  'process_2',
  'yield_p2',
  'process_3',
  'yield_p3',
  'process_4',
  'yield_p4',
  'line',
  'dieset',
  'yield_line',
  'staffing',
  'rate',
  'pr_code_p1',
  'pr_code_p2',
  'pr_code_p3',
  'pr_code_p4',
  'pr_code_final',
  'closed_production',
  'shelf_life',
  'closed_technical',
  'box',
  'top_label',
  'bottom_label',
  'web',
  'mrp_box',
  'mrp_labels',
  'mrp_films',
  'mrp_sleeves',
  'mrp_cartons',
  'tara_weight',
  'pallet_stacking_plan',
  'box_dimensions',
  'closed_mrp',
  'price',
  'lead_time',
  'supplier',
  'proc_shelf_life',
  'closed_procurement',
  'done_core',
  'done_planning',
  'done_commercial',
  'done_production',
  'done_technical',
  'done_mrp',
  'done_procurement',
  'status_overall',
  'days_to_launch',
  'built',
] as const;

async function ensureAppUser(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedBaseOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Product Test Tenant', 'eu', 'https://product-test.example.test')
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
      values ($1, $2, 'Product Test Org A', 'bakery'),
             ($3, $2, 'Product Test Org B', 'fmcg')
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
      values ($1, $2, 'legacy_user', 'Product Test Role A', '[]'::jsonb, true),
             ($3, $4, 'legacy_user', 'Product Test Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'product-test-a@example.test', 'Product Test User A', $3),
             ($4, $5, 'product-test-b@example.test', 'Product Test User B', $6)
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

async function seedProductRows(adminPool: pg.Pool) {
  await adminPool.query(
    `
      delete from public.product
      where product_code in ('FA-T001-A', 'FA-T001-B')
    `,
  );
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(adminPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, ingredient_codes, status_overall, launch_date,
        days_to_launch, built, schema_version, created_by_user
      )
      values ('FA-T001-A', $1, 'Org A Product', '200g', 24, 'PR1939H', 'RM1939', 'Pending', current_date + 14, 14, false, 1, $2)
    `,
    [orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(adminPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, ingredient_codes, status_overall, launch_date,
        days_to_launch, built, schema_version, created_by_user
      )
      values ('FA-T001-B', $1, 'Org B Product', '150g', 12, 'PR2045A', 'RM2045', 'Complete', current_date + 30, 30, false, 1, $2)
    `,
    [orgB, orgBUser],
  );
}

async function selectFaRowsForOrg(appPool: pg.Pool, adminPool: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await client.query<{ product_code: string; org_id: string }>(
      'select product_code, org_id from public.fa order by product_code',
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

async function expectOwnerFaWriteRejected(adminPool: pg.Pool, query: string, params: unknown[]) {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await expect(client.query(query, params)).rejects.toThrow(/fa is a read-only compatibility view/);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

runIntegrationTest('075 product table and fa compatibility view', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseOrgData(adminPool);
    await seedProductRows(adminPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('creates product with all 69 business columns, extension columns, schema_version, R13 audit columns, and forced RLS', async () => {
    const columns = await adminPool.query<{
      column_name: string;
      is_nullable: 'YES' | 'NO';
    }>(
      `
        select column_name, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'product'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    for (const column of businessColumns) {
      expect(columnNames.has(column), `product is missing ${column}`).toBe(true);
    }
    for (const column of [
      'org_id',
      'ext_jsonb',
      'private_jsonb',
      'schema_version',
      'model_prediction_id',
      'epcis_event_id',
      'external_id',
      'created_at',
      'created_by_user',
      'created_by_device',
      'app_version',
      'deleted_at',
    ]) {
      expect(columnNames.has(column), `product is missing ${column}`).toBe(true);
    }

    expect(columns.rows.find((row) => row.column_name === 'org_id')?.is_nullable).toBe('NO');
    expect(columnNames.has('tenant_id')).toBe(false);

    const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = 'public.product'::regclass
      `,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('exposes fa as a security_invoker view scoped by product RLS for each org context', async () => {
    const viewOptions = await adminPool.query<{ reloptions: string[] | null }>(
      "select reloptions from pg_class where oid = 'public.fa'::regclass",
    );
    expect(viewOptions.rows[0]?.reloptions ?? []).toContain('security_invoker=true');

    await expect(selectFaRowsForOrg(appPool, adminPool, orgA)).resolves.toEqual([
      { product_code: 'FA-T001-A', org_id: orgA },
    ]);
    await expect(selectFaRowsForOrg(appPool, adminPool, orgB)).resolves.toEqual([
      { product_code: 'FA-T001-B', org_id: orgB },
    ]);

    await adminPool.query("update public.product set deleted_at = now() where product_code = 'FA-T001-A'");
    await expect(selectFaRowsForOrg(appPool, adminPool, orgA)).resolves.toEqual([]);
    await adminPool.query("update public.product set deleted_at = null where product_code = 'FA-T001-A'");
  });

  it('keeps fa structurally read-only for owner inserts, updates, and deletes', async () => {
    await expectOwnerFaWriteRejected(
      adminPool,
      `
        insert into public.fa (product_code, org_id, product_name, schema_version, created_by_user)
        values ('FA-T001-VIEW', $1::uuid, 'View Insert', 1, $2::uuid)
      `,
      [orgA, orgAUser],
    );
    await expectOwnerFaWriteRejected(
      adminPool,
      "update public.fa set product_name = 'View Update' where product_code = 'FA-T001-A'",
      [],
    );
    await expectOwnerFaWriteRejected(
      adminPool,
      "delete from public.fa where product_code = 'FA-T001-A'",
      [],
    );
  });

  it('publishes product_org_context policy through app.current_org_id without raw tenant/current-org GUC reads', async () => {
    const policies = await appPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `
        select policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'product'
      `,
    );

    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.policyname).toBe('product_org_context');

    const policyText = policies.rows.map((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`).join('\n');
    expect(policyText).toMatch(/app\.current_org_id\(\)/);
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });
});
