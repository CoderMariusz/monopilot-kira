import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/099-npd-shared-bom-builder.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '09300000-0000-4000-8000-000000000000';
const orgA = '09300000-0000-4000-8000-00000000000a';
const orgB = '09300000-0000-4000-8000-00000000000b';
const orgAUser = '09300000-0000-4000-8000-0000000000aa';
const orgBUser = '09300000-0000-4000-8000-0000000000bb';
const orgARole = '09300000-0000-4000-8000-0000000001aa';
const orgBRole = '09300000-0000-4000-8000-0000000001bb';

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
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-093 Tenant', 'eu', 'https://t-093.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-093 Org A', 'bakery'),
             ($3, $2, 'T-093 Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'npd_shared_bom_user', 'T-093 Role A', '[]'::jsonb, true),
             ($3, $4, 'npd_shared_bom_user', 'T-093 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 't-093-a@example.test', 'T-093 User A', $3),
             ($4, $5, 't-093-b@example.test', 'T-093 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function seedProductWithDetails(
  pool: pg.Pool,
  input: { orgId: string; userId: string; productCode: string; projectCode: string; componentCodes: string[]; built?: boolean },
) {
  const projectId = randomUUID();

  await pool.query('delete from public.bom_headers where product_id = $1', [input.productCode]);
  await pool.query('delete from public.product where product_code = $1', [input.productCode]);
  await pool.query('delete from public.npd_projects where code = $1', [input.projectCode]);

  await pool.query(
    `
      insert into public.product
        (product_code, org_id, product_name, status_overall, built, schema_version, created_by_user)
      values ($1, $2, $3, 'Released', $4, 1, $5)
    `,
    [input.productCode, input.orgId, `${input.productCode} FG`, input.built ?? true, input.userId],
  );
  await pool.query(
    `
      insert into public.npd_projects
        (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
      values ($1, $2, $3, $4, 'Recipe', 'G4', 'handoff', $5, $6)
    `,
    [projectId, input.orgId, input.projectCode, `${input.projectCode} Project`, input.productCode, input.userId],
  );

  for (const [index, componentCode] of input.componentCodes.entries()) {
    await pool.query(
      `
        insert into public.prod_detail
          (product_code, org_id, component_index, intermediate_code, component_weight, manufacturing_operation_1)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [input.productCode, input.orgId, index + 1, componentCode, `${index + 1}.250000`, `OP-${index + 1}`],
    );
  }

  return projectId;
}

async function withOrgClient<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
  options: { commit?: boolean } = {},
) {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query(options.commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('099 NPD shared BOM builder migration contract', () => {
  it('uses the required 099 filename, shared BOM SSOT, app.current_org_id RLS, and no D365/tenant authority', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/099-npd-shared-bom-builder.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.create_initial_shared_bom_version_for_npd_project/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.get_fa_bom/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.request_npd_released_bom_edit/i);
    expect(sql).toMatch(/public\.bom_headers/i);
    expect(sql).toMatch(/public\.bom_lines/i);
    expect(sql).toMatch(/public\.prod_detail/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).toMatch(/bom\.initial_version_created/);
    expect(sql).toMatch(/fg\.bom\.released/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(sql).not.toMatch(/from\s+public\.d365_import_cache|join\s+public\.d365_import_cache/i);
  });
});

runIntegrationTest('099 NPD shared BOM builder behavior', () => {
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

  it('creates one initial shared BOM header and one line per component, idempotently', async () => {
    const productCode = `FG-T093-IDEM-${randomUUID()}`;
    const projectId = await seedProductWithDetails(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode,
      projectCode: `T093-IDEM-${randomUUID()}`,
      componentCodes: ['WIP-T093-A', 'WIP-T093-B', 'WIP-T093-C'],
    });

    const first = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ bom_header_id: string; status: string; version: number; line_count: string }>(
        'select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)',
        [projectId, productCode, orgAUser],
      ),
    { commit: true });
    const second = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ bom_header_id: string; status: string; version: number; line_count: string }>(
        'select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)',
        [projectId, productCode, orgAUser],
      ),
    { commit: true });

    expect(first.rows[0]).toMatchObject({ status: 'in_review', version: 1, line_count: '3' });
    expect(second.rows[0]?.bom_header_id).toBe(first.rows[0]?.bom_header_id);
    expect(second.rows[0]?.line_count).toBe('3');

    const counts = await ownerPool.query<{ header_count: string; line_count: string; event_count: string }>(
      `
        select
          (select count(*)::text from public.bom_headers where product_id = $1 and origin_module = 'npd') as header_count,
          (select count(*)::text from public.bom_lines where bom_header_id = $2) as line_count,
          (select count(*)::text from public.outbox_events where org_id = $3 and event_type = 'bom.initial_version_created' and aggregate_id = $2) as event_count
      `,
      [productCode, first.rows[0]?.bom_header_id, orgA],
    );
    expect(counts.rows[0]).toEqual({ header_count: '1', line_count: '3', event_count: '1' });
  });

  it('get_fa_bom reads header-driven shared BOM lines and not the legacy computed view', async () => {
    const productCode = `FG-T093-READ-${randomUUID()}`;
    const projectId = await seedProductWithDetails(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode,
      projectCode: `T093-READ-${randomUUID()}`,
      componentCodes: ['WIP-T093-R1', 'WIP-T093-R2'],
    });

    await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query('select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)', [
        projectId,
        productCode,
        orgAUser,
      ]),
    { commit: true });

    const rows = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ product_code: string; component_code: string; line_no: number; source: string }>(
        'select product_code, component_code, line_no, source from public.get_fa_bom($1::text) order by line_no',
        [productCode],
      ),
    );
    expect(rows.rows).toEqual([
      { product_code: productCode, component_code: 'WIP-T093-R1', line_no: 1, source: 'prod_detail' },
      { product_code: productCode, component_code: 'WIP-T093-R2', line_no: 2, source: 'prod_detail' },
    ]);

    const source = await ownerPool.query<{ src: string }>(
      "select pg_get_functiondef('public.get_fa_bom(text)'::regprocedure) as src",
    );
    expect(source.rows[0]?.src).toMatch(/bom_headers/i);
    expect(source.rows[0]?.src).toMatch(/bom_lines/i);
    expect(source.rows[0]?.src).not.toMatch(/fa_bom_view/i);
  });

  it('post-release NPD edits create a pending Technical version without mutating the active version', async () => {
    const productCode = `FG-T093-EDIT-${randomUUID()}`;
    await seedProductWithDetails(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode,
      projectCode: `T093-EDIT-${randomUUID()}`,
      componentCodes: ['WIP-T093-E1'],
    });
    const activeHeaderId = randomUUID();

    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, product_id, origin_module, status, version, created_by_user)
        values ($1, $2, $3, 'technical', 'draft', 1, $4)
      `,
      [activeHeaderId, orgA, productCode, orgAUser],
    );
    await ownerPool.query(
      `
        insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom, source)
        values ($1, $2, 1, 'WIP-T093-ACTIVE', 1.000000, 'kg', 'approved')
      `,
      [orgA, activeHeaderId],
    );
    await ownerPool.query(
      `
        update public.bom_headers
        set status = 'active', approved_by = $1, approved_at = now()
        where id = $2
      `,
      [orgAUser, activeHeaderId],
    );

    const pending = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ bom_header_id: string; status: string; version: number; supersedes_bom_header_id: string }>(
        'select * from public.request_npd_released_bom_edit($1::uuid, $2::uuid, $3::text)',
        [activeHeaderId, orgAUser, 'Authorized NPD edit'],
      ),
    { commit: true });

    expect(pending.rows[0]).toMatchObject({
      status: 'in_review',
      version: 2,
      supersedes_bom_header_id: activeHeaderId,
    });

    const activeRead = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ bom_header_id: string; component_code: string; status: string; version: number }>(
        'select bom_header_id, component_code, status, version from public.get_factory_active_bom($1::text)',
        [productCode],
      ),
    );
    expect(activeRead.rows).toEqual([
      { bom_header_id: activeHeaderId, component_code: 'WIP-T093-ACTIVE', status: 'active', version: 1 },
    ]);

    await expect(
      ownerPool.query('update public.bom_headers set notes = $1 where id = $2', ['illegal in-place edit', activeHeaderId]),
    ).rejects.toThrow(/immutable|superseding/i);
  });

  it('does not treat D365 cache mismatch as canonical during BOM creation', async () => {
    const productCode = `FG-T093-D365-${randomUUID()}`;
    const projectId = await seedProductWithDetails(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode,
      projectCode: `T093-D365-${randomUUID()}`,
      componentCodes: ['WIP-T093-MONO'],
    });

    await ownerPool.query(
      `
        insert into public.d365_import_cache (org_id, code, status, comment)
        values ($1, $2, 'Found', 'D365-SHOULD-NOT-APPLY')
        on conflict (org_id, code) do update
          set status = excluded.status,
              comment = excluded.comment
      `,
      [orgA, productCode],
    );

    const created = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ bom_header_id: string }>(
        'select bom_header_id from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)',
        [projectId, productCode, orgAUser],
      ),
    { commit: true });
    const lines = await ownerPool.query<{ component_code: string }>(
      'select component_code from public.bom_lines where bom_header_id = $1 order by line_no',
      [created.rows[0]?.bom_header_id],
    );
    expect(lines.rows).toEqual([{ component_code: 'WIP-T093-MONO' }]);
  });

  it('backfills released or built FGs exactly once without duplicates', async () => {
    const products = Array.from({ length: 5 }, () => `FG-T093-BACKFILL-${randomUUID()}`);
    for (const productCode of products) {
      await seedProductWithDetails(ownerPool, {
        orgId: orgA,
        userId: orgAUser,
        productCode,
        projectCode: `T093-BACKFILL-${randomUUID()}`,
        componentCodes: [`WIP-${productCode}`],
        built: true,
      });
    }

    await ownerPool.query('select public.backfill_initial_shared_boms_from_legacy_npd()');
    await ownerPool.query('select public.backfill_initial_shared_boms_from_legacy_npd()');

    const result = await ownerPool.query<{ product_id: string; header_count: string; line_count: string }>(
      `
        select h.product_id, count(distinct h.id)::text as header_count, count(l.id)::text as line_count
        from public.bom_headers h
        join public.bom_lines l on l.bom_header_id = h.id
        where h.product_id = any($1::text[])
        group by h.product_id
        order by h.product_id
      `,
      [products],
    );
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.header_count === '1' && row.line_count === '1')).toBe(true);
  });

  it('keeps initial BOM creation non-vacuously isolated by org under RLS', async () => {
    const productA = `FG-T093-RLS-A-${randomUUID()}`;
    const productB = `FG-T093-RLS-B-${randomUUID()}`;
    const projectA = await seedProductWithDetails(ownerPool, {
      orgId: orgA,
      userId: orgAUser,
      productCode: productA,
      projectCode: `T093-RLS-A-${randomUUID()}`,
      componentCodes: ['WIP-T093-RLS-A'],
    });
    const projectB = await seedProductWithDetails(ownerPool, {
      orgId: orgB,
      userId: orgBUser,
      productCode: productB,
      projectCode: `T093-RLS-B-${randomUUID()}`,
      componentCodes: ['WIP-T093-RLS-B'],
    });

    await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query('select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)', [
        projectA,
        productA,
        orgAUser,
      ]),
    { commit: true });
    await withOrgClient(appPool, ownerPool, orgB, (client) =>
      client.query('select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)', [
        projectB,
        productB,
        orgBUser,
      ]),
    { commit: true });

    const visibleToA = await withOrgClient(appPool, ownerPool, orgA, (client) =>
      client.query<{ product_code: string; component_code: string }>(
        'select product_code, component_code from public.get_fa_bom($1::text)',
        [productB],
      ),
    );
    expect(visibleToA.rows).toEqual([]);

    await expect(
      withOrgClient(appPool, ownerPool, orgA, (client) =>
        client.query('select * from public.create_initial_shared_bom_version_for_npd_project($1::uuid, $2::text, $3::uuid)', [
          projectB,
          productB,
          orgAUser,
        ]),
      ),
    ).rejects.toThrow(/NPD project not found|row-level security|violates/i);
  });
});
