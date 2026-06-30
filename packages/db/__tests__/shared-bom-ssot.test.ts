import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/090-shared-bom-ssot-npd-origin.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '09200000-0000-4000-8000-000000000000';
const orgA = '09200000-0000-4000-8000-00000000000a';
const orgB = '09200000-0000-4000-8000-00000000000b';
const orgAUser = '09200000-0000-4000-8000-0000000000aa';
const orgBUser = '09200000-0000-4000-8000-0000000000bb';
const orgARole = '09200000-0000-4000-8000-0000000001aa';
const orgBRole = '09200000-0000-4000-8000-0000000001bb';
const productA = 'FG-T092-A';
const productB = 'FG-T092-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Shared BOM Test Tenant', 'eu', 'https://shared-bom.example.test')
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
      values ($1, $2, 'Shared BOM Org A', 'bakery'),
             ($3, $2, 'Shared BOM Org B', 'fmcg')
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
      values ($1, $2, 'shared_bom_user', 'Shared BOM Role A', '[]'::jsonb, true),
             ($3, $4, 'shared_bom_user', 'Shared BOM Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'shared-bom-a@example.test', 'Shared BOM User A', $3),
             ($4, $5, 'shared-bom-b@example.test', 'Shared BOM User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.bom_headers where product_id in ($1, $2)', [productA, productB]);
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Shared BOM FG A', 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Shared BOM FG B', 1, $3)
    `,
    [productB, orgB, orgBUser],
  );
}

async function createProject(pool: pg.Pool, orgId: string, code: string, userId: string) {
  const projectId = randomUUID();
  await pool.query(
    `
      insert into public.npd_projects (id, org_id, code, name, type, current_gate, current_stage, created_by_user)
      values ($1, $2, $3, $4, 'Recipe', 'G2', 'approval', $5)
    `,
    [projectId, orgId, code, `${code} project`, userId],
  );
  return projectId;
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

describe('090 shared BOM SSOT migration contract', () => {
  it('declares shared BOM lifecycle, origin, RLS, comments, and no stale tenant/D365 SSOT patterns', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/090-shared-bom-ssot-npd-origin.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.bom_headers/i);
    expect(sql).toMatch(/create table if not exists public\.bom_lines/i);
    expect(sql).toMatch(/status[\s\S]*draft[\s\S]*in_review[\s\S]*technical_approved[\s\S]*active[\s\S]*superseded[\s\S]*archived/i);
    expect(sql).toMatch(/origin_module[\s\S]*npd[\s\S]*technical[\s\S]*imported/i);
    expect(sql).toMatch(/npd_project_id[\s\S]*references public\.npd_projects/i);
    expect(sql).toMatch(/product_id[\s\S]*references public\.product/i);
    expect(sql).toMatch(/supersedes_bom_header_id[\s\S]*references public\.bom_headers/i);
    expect(sql).toMatch(/bom_headers_not_orphaned_check/i);
    expect(sql).toMatch(/alter table public\.bom_headers enable row level security/i);
    expect(sql).toMatch(/alter table public\.bom_headers force row level security/i);
    expect(sql).toMatch(/alter table public\.bom_lines enable row level security/i);
    expect(sql).toMatch(/alter table public\.bom_lines force row level security/i);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.bom_headers to app_user/i);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.bom_lines to app_user/i);
    expect(sql).toMatch(/create trigger bom_lines_reject_approved_header_update[\s\S]*before insert or update or delete/i);
    expect(sql).toMatch(/shared BOM SSOT/i);
    expect(sql).toMatch(/D365 is integration only/i);
    expect(sql).toMatch(/DEPRECATED\/preview-only/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('090 shared BOM SSOT schema behavior', () => {
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

  it('publishes lifecycle/origin columns, approval fields, comments, indexes, and forced RLS', async () => {
    const columns = await ownerPool.query<{ column_name: string; data_type: string; column_default: string | null }>(
      `
        select column_name, data_type, column_default
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bom_headers'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    for (const column of [
      'org_id',
      'product_id',
      'npd_project_id',
      'fa_code',
      'origin_module',
      'status',
      'version',
      'supersedes_bom_header_id',
      'effective_from',
      'approved_by',
      'approved_at',
    ]) {
      expect(columnNames.has(column), `${column} must exist on bom_headers`).toBe(true);
    }
    expect(columnNames.has('tenant_id')).toBe(false);

    const checks = await ownerPool.query<{ constraint_name: string; definition: string }>(
      `
        select con.conname as constraint_name, pg_get_constraintdef(con.oid) as definition
        from pg_constraint con
        where con.conrelid = 'public.bom_headers'::regclass
          and con.contype = 'c'
        order by con.conname
      `,
    );
    const checkText = checks.rows.map((row) => `${row.constraint_name}: ${row.definition}`).join('\n');
    expect(checkText).toContain('bom_headers_status_check');
    expect(checkText).toContain('draft');
    expect(checkText).toContain('technical_approved');
    expect(checkText).toContain('active');
    expect(checkText).toContain('bom_headers_origin_module_check');
    expect(checkText).toContain('npd');
    expect(checkText).toContain('technical');
    expect(checkText).toContain('imported');
    expect(checkText).toContain('bom_headers_not_orphaned_check');

    const indexNames = await ownerPool.query<{ indexname: string }>(
      `
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('bom_headers', 'bom_lines')
        order by indexname
      `,
    );
    expect(indexNames.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'bom_headers_org_npd_project_idx',
        'bom_headers_org_product_idx',
        'bom_headers_active_version_idx',
        'bom_headers_technical_approval_queue_idx',
        'bom_lines_org_header_idx',
      ]),
    );

    const rls = await ownerPool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relname, relrowsecurity, relforcerowsecurity
        from pg_class
        where oid in ('public.bom_headers'::regclass, 'public.bom_lines'::regclass)
        order by relname
      `,
    );
    expect(rls.rows).toEqual([
      { relname: 'bom_headers', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'bom_lines', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const policies = await ownerPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `
        select tablename, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename in ('bom_headers', 'bom_lines')
        order by tablename, policyname
      `,
    );
    expect(policies.rows).toHaveLength(2);
    expect(policies.rows.every((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);

    const comments = await ownerPool.query<{ object_name: string; description: string | null }>(
      `
        select c.relname as object_name, obj_description(c.oid, 'pg_class') as description
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('bom_headers', 'bom_lines')
        order by c.relname
      `,
    );
    const commentText = comments.rows.map((row) => row.description ?? '').join('\n');
    expect(commentText).toContain('shared BOM SSOT');
    expect(commentText).toContain('D365 is integration only');
  });

  it('allows NPD pre-release BOMs, supports superseding versions, and blocks approved line inserts while allowing draft lines', async () => {
    const projectId = await createProject(ownerPool, orgA, `T092-${randomUUID()}`, orgAUser);
    const draftId = randomUUID();

    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, npd_project_id, fa_code, origin_module, status, version, yield_pct, created_by_user)
        values ($1, $2, $3, 'FA-COMPAT-T092', 'npd', 'in_review', 1, 98.500, $4)
      `,
      [draftId, orgA, projectId, orgAUser],
    );

    const draft = await ownerPool.query<{ id: string; product_id: string | null; status: string }>(
      'select id, product_id, status from public.bom_headers where id = $1',
      [draftId],
    );
    expect(draft.rows).toEqual([{ id: draftId, product_id: null, status: 'in_review' }]);

    await expect(
      ownerPool.query(
        `
          insert into public.bom_headers (org_id, origin_module, status, version)
          values ($1, 'npd', 'draft', 1)
        `,
        [orgA],
      ),
    ).rejects.toThrow(/bom_headers_not_orphaned_check|check constraint/i);

    const activeId = randomUUID();
    const nextVersionId = randomUUID();
    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, product_id, origin_module, status, version, approved_by, approved_at, created_by_user)
        values ($1, $2, $3, 'technical', 'active', 1, $4, now(), $4)
      `,
      [activeId, orgA, productA, orgAUser],
    );
    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, product_id, origin_module, status, version, supersedes_bom_header_id, created_by_user)
        values ($1, $2, $3, 'technical', 'in_review', 2, $4, $5)
      `,
      [nextVersionId, orgA, productA, activeId, orgAUser],
    );

    const versions = await ownerPool.query<{ id: string; status: string; supersedes_bom_header_id: string | null }>(
      `
        select id, status, supersedes_bom_header_id
        from public.bom_headers
        where id in ($1, $2)
        order by version
      `,
      [activeId, nextVersionId],
    );
    expect(versions.rows).toEqual([
      { id: activeId, status: 'active', supersedes_bom_header_id: null },
      { id: nextVersionId, status: 'in_review', supersedes_bom_header_id: activeId },
    ]);

    await expect(
      ownerPool.query('update public.bom_headers set notes = $1 where id = $2', ['mutate active content', activeId]),
    ).rejects.toThrow(/approved or active BOM versions are immutable|cannot update/i);

    await expect(
      ownerPool.query(
        `
          insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
          values ($1, $2, 1, 'RM-T092-ACTIVE-REJECTED', 1.000000, 'kg')
        `,
        [orgA, activeId],
      ),
    ).rejects.toThrow(/approved or active BOM line content is immutable/i);

    const technicalApprovedId = randomUUID();
    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, fa_code, origin_module, status, version, approved_by, approved_at, created_by_user)
        values ($1, $2, $3, 'technical', 'technical_approved', 1, $4, now(), $4)
      `,
      [technicalApprovedId, orgA, `FA-T092-APPROVED-${randomUUID()}`, orgAUser],
    );
    await expect(
      ownerPool.query(
        `
          insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
          values ($1, $2, 1, 'RM-T092-APPROVED-REJECTED', 1.000000, 'kg')
        `,
        [orgA, technicalApprovedId],
      ),
    ).rejects.toThrow(/approved or active BOM line content is immutable/i);

    const mutableDraftId = randomUUID();
    await ownerPool.query(
      `
        insert into public.bom_headers
          (id, org_id, fa_code, origin_module, status, version, created_by_user)
        values ($1, $2, $3, 'technical', 'draft', 1, $4)
      `,
      [mutableDraftId, orgA, `FA-T092-DRAFT-${randomUUID()}`, orgAUser],
    );
    await ownerPool.query(
      `
        insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
        values ($1, $2, 1, 'RM-T092-DRAFT-ACCEPTED', 1.000000, 'kg')
      `,
      [orgA, mutableDraftId],
    );
    const draftLine = await ownerPool.query<{ line_count: string }>(
      'select count(*)::text as line_count from public.bom_lines where bom_header_id = $1',
      [mutableDraftId],
    );
    expect(draftLine.rows).toEqual([{ line_count: '1' }]);
  });

  it('isolates headers and lines by org and rejects cross-org app_user inserts through WITH CHECK', async () => {
    const orgAProject = await createProject(ownerPool, orgA, `T092-RLS-A-${randomUUID()}`, orgAUser);
    const orgBProject = await createProject(ownerPool, orgB, `T092-RLS-B-${randomUUID()}`, orgBUser);
    const orgAHeader = randomUUID();
    const orgBHeader = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        insert into public.bom_headers (id, org_id, npd_project_id, origin_module, status, version, created_by_user)
        values ($1, $2, $3, 'npd', 'draft', 1, $4),
               ($5, $6, $7, 'npd', 'draft', 1, $8)
      `,
      [orgAHeader, orgA, orgAProject, orgAUser, orgBHeader, orgB, orgBProject, orgBUser],
    );
    await ownerPool.query(
      `
        insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
        values ($1, $2, 1, 'RM-T092-A', 1.250000, 'kg'),
               ($3, $4, 1, 'RM-T092-B', 2.500000, 'kg')
      `,
      [orgA, orgAHeader, orgB, orgBHeader],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const headers = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.bom_headers
          where id in ($1, $2)
          order by id
        `,
        [orgAHeader, orgBHeader],
      );
      expect(headers.rows).toEqual([{ id: orgAHeader, org_id: orgA }]);

      const lines = await client.query<{ bom_header_id: string; component_code: string }>(
        `
          select bom_header_id, component_code
          from public.bom_lines
          where bom_header_id in ($1, $2)
          order by bom_header_id
        `,
        [orgAHeader, orgBHeader],
      );
      expect(lines.rows).toEqual([{ bom_header_id: orgAHeader, component_code: 'RM-T092-A' }]);

      await expect(
        client.query(
          `
            insert into public.bom_headers
              (org_id, npd_project_id, origin_module, status, version)
            values ($1, $2, 'npd', 'draft', 2)
          `,
          [orgB, orgBProject],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
