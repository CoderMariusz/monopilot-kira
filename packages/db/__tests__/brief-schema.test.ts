import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '03000000-0000-4030-8030-000000000000';
const orgA = '03000000-0000-4030-8030-00000000000a';
const orgB = '03000000-0000-4030-8030-00000000000b';
const orgAUser = '03000000-0000-4030-8030-0000000000aa';
const orgBUser = '03000000-0000-4030-8030-0000000000bb';
const orgARole = '03000000-0000-4030-8030-000000000aaa';
const orgBRole = '03000000-0000-4030-8030-000000000bbb';

const briefColumns = [
  'brief_id',
  'org_id',
  'npd_project_id',
  'template',
  'dev_code',
  'status',
  'product_name',
  'volume',
  'converted_at',
  'converted_by_user',
  'created_at',
  'created_by_user',
  'created_by_device',
  'app_version',
  'model_prediction_id',
  'epcis_event_id',
  'external_id',
  'schema_version',
] as const;

const briefLineColumns = [
  'id',
  'brief_id',
  'org_id',
  'line_type',
  'line_index',
  'product',
  'volume',
  'dev_code',
  'component',
  'slice_count',
  'supplier',
  'code',
  'price',
  'weights',
  'pct',
  'packs_per_case',
  'comments',
  'benchmark_identified',
  'primary_packaging',
  'secondary_packaging',
  'base_web_code',
  'base_web_price',
  'top_web_type',
  'sleeve_carton_code',
  'sleeve_carton_price',
  'packaging_ext',
  'created_at',
] as const;

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

async function seedBaseOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Brief Test Tenant', 'eu', 'https://brief-test.example.test')
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
      values ($1, $2, 'Brief Test Org A', 'bakery'),
             ($3, $2, 'Brief Test Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  const userColumns = await adminPool.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
      and table_name = 'users'
    `,
  );
  const presentUserColumns = new Set(userColumns.rows.map((row) => row.column_name));
  if (presentUserColumns.has('role_id')) {
    await adminPool.query(
      `
        insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
        values
          ($1::uuid, $2::uuid, 'brief-test-role', true, 'brief_test_role', 'Brief Test Role A', '[]'::jsonb, true),
          ($3::uuid, $4::uuid, 'brief-test-role', true, 'brief_test_role', 'Brief Test Role B', '[]'::jsonb, true)
        on conflict (id) do update
          set org_id = excluded.org_id,
              slug = excluded.slug,
              system = excluded.system,
              code = excluded.code,
              name = excluded.name,
              permissions = excluded.permissions,
              is_system = excluded.is_system
      `,
      [orgARole, orgA, orgBRole, orgB],
    );
  }

  const displayColumns = ['display_name', 'name'].filter((column) => presentUserColumns.has(column));
  const roleColumnSql = presentUserColumns.has('role_id') ? ', role_id' : '';
  const roleValueSql = presentUserColumns.has('role_id') ? ', $6::uuid' : '';
  const roleBValueSql = presentUserColumns.has('role_id') ? ', $7::uuid' : '';
  const roleUpdateSql = presentUserColumns.has('role_id') ? ', role_id = excluded.role_id' : '';
  const displayColumnSql = displayColumns.map((column) => `, ${column}`).join('');
  const displayValueSql = displayColumns.map(() => ', $5').join('');
  const displayUpdateSql = displayColumns.map((column) => `, ${column} = excluded.${column}`).join('');

  await adminPool.query(
    `
      insert into public.users (id, org_id, email${displayColumnSql}${roleColumnSql})
      values ($1, $2, 'brief-test-a@example.test'${displayValueSql}${roleValueSql}),
             ($3, $4, 'brief-test-b@example.test'${displayValueSql}${roleBValueSql})
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email
            ${displayUpdateSql}
            ${roleUpdateSql}
    `,
    [orgAUser, orgA, orgBUser, orgB, 'Brief Test User', orgARole, orgBRole],
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

async function createBrief(adminPool: pg.Pool, orgId: string, userId: string, code: string) {
  const projectId = randomUUID();
  const briefId = randomUUID();

  await adminPool.query(
    `
      insert into public.brief (brief_id, org_id, npd_project_id, template, dev_code, status, product_name, volume, created_by_user)
      values ($1::uuid, $2::uuid, $3::uuid, 'multi_component', $4, 'draft', $5, 1200, $6::uuid)
    `,
    [briefId, orgId, projectId, code, `${code} product`, userId],
  );

  return { briefId, projectId };
}

async function selectBriefsForOrg(appPool: pg.Pool, adminPool: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await client.query<{ dev_code: string; org_id: string }>(
      'select dev_code, org_id from public.brief order by dev_code',
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

runIntegrationTest('081 brief and brief_lines schema', () => {
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

  it('creates brief and brief_lines with forced RLS and no tenant_id leakage', async () => {
    const columns = await adminPool.query<{ table_name: string; column_name: string; is_nullable: 'YES' | 'NO' }>(
      `
        select table_name, column_name, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('brief', 'brief_lines')
      `,
    );
    const seen = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));

    for (const column of briefColumns) {
      expect(seen.has(`brief.${column}`), `brief is missing ${column}`).toBe(true);
    }
    for (const column of briefLineColumns) {
      expect(seen.has(`brief_lines.${column}`), `brief_lines is missing ${column}`).toBe(true);
    }

    expect(seen.has('brief.tenant_id')).toBe(false);
    expect(seen.has('brief_lines.tenant_id')).toBe(false);
    expect(seen.has('brief.product_code')).toBe(false);
    expect(columns.rows.find((row) => row.table_name === 'brief' && row.column_name === 'npd_project_id')?.is_nullable).toBe('YES');

    for (const table of ['brief', 'brief_lines']) {
      const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `
          select relrowsecurity, relforcerowsecurity
          from pg_class
          where oid = $1::regclass
        `,
        [`public.${table}`],
      );
      expect(rls.rows[0], `${table} must enable and force RLS`).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });

      const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `
          select policyname, qual, with_check
          from pg_policies
          where schemaname = 'public'
            and tablename = $1
        `,
        [table],
      );
      const policyText = policies.rows.map((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`).join('\n');
      expect(policyText, `${table} policy must use app.current_org_id()`).toMatch(/app\.current_org_id\(\)/);
      expect(policyText, `${table} policy must not read raw app GUCs`).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });

  it('defines brief_lines.brief_id as ON DELETE CASCADE and deletes all component rows with the owning brief', async () => {
    const fk = await adminPool.query<{ confdeltype: string }>(
      `
        select c.confdeltype
        from pg_constraint c
        where c.conrelid = 'public.brief_lines'::regclass
          and c.confrelid = 'public.brief'::regclass
          and c.contype = 'f'
      `,
    );
    expect(fk.rows).toContainEqual({ confdeltype: 'c' });

    const { briefId } = await createBrief(adminPool, orgA, orgAUser, `DEV30-${randomUUID().slice(0, 8)}`);
    await adminPool.query(
      `
        insert into public.brief_lines (
          brief_id, org_id, line_type, line_index, product, component, code, weights, pct, packaging_ext
        )
        values
          ($1::uuid, $2::uuid, 'component', 1, 'Test Product', 'Component A', 'RM-A', 10, 40, '{"open_item":"packaging-a"}'::jsonb),
          ($1::uuid, $2::uuid, 'component', 2, 'Test Product', 'Component B', 'RM-B', 8, 32, '{"open_item":"packaging-b"}'::jsonb),
          ($1::uuid, $2::uuid, 'component', 3, 'Test Product', 'Component C', 'RM-C', 7, 28, '{"open_item":"packaging-c"}'::jsonb)
      `,
      [briefId, orgA],
    );

    await adminPool.query('delete from public.brief where brief_id = $1::uuid', [briefId]);

    const remaining = await adminPool.query<{ count: string }>(
      'select count(*) from public.brief_lines where brief_id = $1::uuid',
      [briefId],
    );
    expect(remaining.rows[0]?.count).toBe('0');
  });

  it('isolates brief rows by org through app.set_org_context', async () => {
    const orgACode = `DEV30-A-${randomUUID().slice(0, 8)}`;
    const orgBCode = `DEV30-B-${randomUUID().slice(0, 8)}`;
    await createBrief(adminPool, orgA, orgAUser, orgACode);
    await createBrief(adminPool, orgB, orgBUser, orgBCode);

    await expect(selectBriefsForOrg(appPool, adminPool, orgA)).resolves.toContainEqual({
      dev_code: orgACode,
      org_id: orgA,
    });
    await expect(selectBriefsForOrg(appPool, adminPool, orgA)).resolves.not.toContainEqual({
      dev_code: orgBCode,
      org_id: orgB,
    });
    await expect(selectBriefsForOrg(appPool, adminPool, orgB)).resolves.toContainEqual({
      dev_code: orgBCode,
      org_id: orgB,
    });
  });

});
