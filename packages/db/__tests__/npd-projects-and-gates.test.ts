import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '54545454-0000-4000-8000-000000000054';
const orgA = '54545454-1111-4000-8111-000000000054';
const orgB = '54545454-2222-4000-8222-000000000054';
const orgAUser = '54545454-aaaa-4000-8aaa-000000000054';
const orgBUser = '54545454-bbbb-4000-8bbb-000000000054';
const orgARole = '54545454-a111-4000-8111-000000000054';
const orgBRole = '54545454-b222-4000-8222-000000000054';
const productA = 'NPD-FA-T054-A';
const projectCodeA = 'NPD-T054-A';
const projectCodeB = 'NPD-T054-B';

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
      values ($1, 'NPD T054 Tenant', 'eu', 'https://npd-t054.example.test')
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
      values ($1, $2, 'NPD T054 Org A', 'bakery'),
             ($3, $2, 'NPD T054 Org B', 'fmcg')
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
      values ($1, $2, 'npd_t054_user', 'NPD T054 Role A', '[]'::jsonb, true),
             ($3, $4, 'npd_t054_user', 'NPD T054 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `
      insert into public.users (id, org_id, email, name, display_name, role_id)
      values ($1, $2, 'npd-t054-a@example.test', 'NPD T054 User A', 'NPD T054 User A', $3),
             ($4, $5, 'npd-t054-b@example.test', 'NPD T054 User B', 'NPD T054 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            display_name = excluded.display_name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await adminPool.query(
    `
      insert into public.product (
        product_code, org_id, product_name, schema_version, created_by_user
      )
      values ($1, $2, 'NPD T054 Product A', 1, $3)
      on conflict (org_id, product_code) do update
        set org_id = excluded.org_id,
            product_name = excluded.product_name,
            schema_version = excluded.schema_version,
            created_by_user = excluded.created_by_user
    `,
    [productA, orgA, orgAUser],
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

async function selectGateApprovalsForOrg(appPool: pg.Pool, adminPool: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await client.query<{ org_id: string; gate_code: string; decision: string }>(
      `
        select org_id, gate_code, decision
        from public.gate_approvals
        where esign_hash like 't054-rls-%'
        order by org_id, gate_code
      `,
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

runIntegrationTest('085 NPD stage-gate core tables', () => {
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

  it('creates npd_projects with required columns, per-org code uniqueness, FA FK, and forced org RLS', async () => {
    const columns = await adminPool.query<{ column_name: string; is_nullable: 'YES' | 'NO' }>(
      `
        select column_name, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'npd_projects'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    for (const column of [
      'id',
      'org_id',
      'code',
      'name',
      'type',
      'current_gate',
      'current_stage',
      'prio',
      'owner',
      'target_launch',
      'notes',
      'product_code',
      'start_from',
      'clone_source',
      'created_at',
      'created_by_user',
      'created_by_device',
      'app_version',
      'model_prediction_id',
      'epcis_event_id',
      'external_id',
      'schema_version',
    ]) {
      expect(columnNames.has(column), `npd_projects is missing ${column}`).toBe(true);
    }

    expect(columnNames.has('tenant_id')).toBe(false);
    expect(columns.rows.find((row) => row.column_name === 'org_id')?.is_nullable).toBe('NO');

    const codeUnique = await adminPool.query<{ constraint_name: string; columns: string[] }>(
      `
        select tc.constraint_name,
               array_agg(kcu.column_name::text order by kcu.ordinal_position) as columns
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_schema = tc.constraint_schema
         and kcu.constraint_name = tc.constraint_name
         and kcu.table_schema = tc.table_schema
         and kcu.table_name = tc.table_name
        where tc.table_schema = 'public'
          and tc.table_name = 'npd_projects'
          and tc.constraint_type = 'UNIQUE'
        group by tc.constraint_name
      `,
    );
    expect(codeUnique.rows).toContainEqual({
      constraint_name: 'npd_projects_org_code_unique',
      columns: ['org_id', 'code'],
    });

    const productFk = await adminPool.query<{ foreign_table_name: string; foreign_column_name: string }>(
      `
        select ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.constraint_schema = kcu.constraint_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
         and ccu.constraint_schema = tc.constraint_schema
        where tc.table_schema = 'public'
          and tc.table_name = 'npd_projects'
          and tc.constraint_type = 'FOREIGN KEY'
          and kcu.column_name = 'product_code'
      `,
    );
    expect(productFk.rows).toContainEqual({ foreign_table_name: 'product', foreign_column_name: 'product_code' });

    const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.npd_projects'::regclass",
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('cascades checklist items but retains immutable gate approvals when a project is deleted', async () => {
    const projectId = randomUUID();
    const checklistId = randomUUID();
    const approvalId = randomUUID();

    await adminPool.query(
      `
        insert into public.npd_projects (
          id, org_id, code, name, type, product_code, created_by_user
        )
        values ($1, $2, $3, 'T054 Project A', 'Recipe · Standard', $4, $5)
      `,
      [projectId, orgA, `${projectCodeA}-${randomUUID()}`, productA, orgAUser],
    );
    await adminPool.query(
      `
        insert into public.gate_checklist_items (
          id, org_id, project_id, gate_code, category_code, item_text, required
        )
        values ($1, $2, $3, 'G0', 'technical', 'Brief complete', true)
      `,
      [checklistId, orgA, projectId],
    );
    await adminPool.query(
      `
        insert into public.gate_approvals (
          id, org_id, project_id, gate_code, decision, approver_user_id, esigned_at, esign_hash
        )
        values ($1, $2, $3, 'G0', 'approved', $4, now(), 't054-hash')
      `,
      [approvalId, orgA, projectId, orgAUser],
    );

    await adminPool.query('delete from public.npd_projects where id = $1', [projectId]);

    const checklistCount = await adminPool.query<{ count: string }>(
      'select count(*) from public.gate_checklist_items where id = $1',
      [checklistId],
    );
    expect(checklistCount.rows[0]?.count).toBe('0');

    const approvalCount = await adminPool.query<{ count: string }>(
      'select count(*) from public.gate_approvals where id = $1',
      [approvalId],
    );
    expect(approvalCount.rows[0]?.count).toBe('1');
  });

  it('enforces org-scoped RLS on gate_approvals through app.current_org_id()', async () => {
    const projectAId = randomUUID();
    const projectBId = randomUUID();

    await adminPool.query(
      `
        delete from public.gate_approvals
        where esign_hash like 't054-rls-%'
      `,
    );
    await adminPool.query(
      `
        insert into public.npd_projects (id, org_id, code, name, type, created_by_user)
        values ($1, $2, $3, 'T054 RLS Project A', 'Recipe · Standard', $4),
               ($5, $6, $7, 'T054 RLS Project B', 'Recipe · Premium', $8)
      `,
      [projectAId, orgA, `${projectCodeA}-RLS-${randomUUID()}`, orgAUser, projectBId, orgB, `${projectCodeB}-RLS-${randomUUID()}`, orgBUser],
    );
    await adminPool.query(
      `
        insert into public.gate_approvals (
          org_id, project_id, gate_code, decision, approver_user_id, esigned_at, esign_hash
        )
        values ($1, $2, 'G1', 'approved', $3, now(), 't054-rls-a'),
               ($4, $5, 'G2', 'rejected', $6, now(), 't054-rls-b')
      `,
      [orgA, projectAId, orgAUser, orgB, projectBId, orgBUser],
    );

    await expect(selectGateApprovalsForOrg(appPool, adminPool, orgA)).resolves.toEqual([
      { org_id: orgA, gate_code: 'G1', decision: 'approved' },
    ]);
  });

  it('creates required gate indexes and app.current_org_id policies without raw tenant/current-org GUC reads', async () => {
    const indexes = await adminPool.query<{ tablename: string; indexdef: string }>(
      `
        select tablename, indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('gate_checklist_items', 'gate_approvals')
      `,
    );
    expect(indexes.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tablename: 'gate_checklist_items',
          indexdef: expect.stringMatching(/\(org_id, project_id, gate_code\)/),
        }),
        expect.objectContaining({
          tablename: 'gate_approvals',
          indexdef: expect.stringMatching(/\(org_id, project_id, gate_code\)/),
        }),
      ]),
    );

    const policies = await adminPool.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `
        select tablename, policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename in ('npd_projects', 'gate_checklist_items', 'gate_approvals')
        order by tablename, policyname
      `,
    );
    expect(policies.rows).toHaveLength(3);

    const policyText = policies.rows.map((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`).join('\n');
    expect(policyText).toMatch(/app\.current_org_id\(\)/);
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });
});
