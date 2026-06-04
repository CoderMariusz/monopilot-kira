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
const migrationPath = resolve(packageRoot, 'migrations/125-factory-release-status.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '09700000-0000-4000-8000-000000000000';
const orgA = '09700000-0000-4000-8000-00000000000a';
const orgB = '09700000-0000-4000-8000-00000000000b';
const orgAUser = '09700000-0000-4000-8000-0000000000aa';
const orgBUser = '09700000-0000-4000-8000-0000000000bb';
const orgARole = '09700000-0000-4000-8000-0000000001aa';
const orgBRole = '09700000-0000-4000-8000-0000000001bb';
const productA = 'FG-T097-A';
const productB = 'FG-T097-B';
const projectA = '09700000-0000-4000-8000-00000000aaa1';
const projectB = '09700000-0000-4000-8000-00000000bbb1';
const bomA = '09700000-0000-4000-8000-00000000aaa2';
const bomB = '09700000-0000-4000-8000-00000000bbb2';
const specA = '09700000-0000-4000-8000-00000000aaa3';
const specB = '09700000-0000-4000-8000-00000000bbb3';

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
      values ($1, 'T-097 Tenant', 'eu', 'https://t097.example.test')
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
      values ($1, $2, 'T-097 Org A', 'bakery'),
             ($3, $2, 'T-097 Org B', 'fmcg')
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
      values ($1, $2, 't097_user', 'T097 Role A', '[]'::jsonb, true),
             ($3, $4, 't097_user', 'T097 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, display_name, role_id)
      values ($1, $2, 't097-a@example.test', 'T097 User A', 'T097 User A', $3),
             ($4, $5, 't097-b@example.test', 'T097 User B', 'T097 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            display_name = excluded.display_name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query(`delete from public.factory_release_status where product_code in ($1, $2)`, [productA, productB]).catch(() => undefined);
  await pool.query(`delete from public.bom_headers where id in ($1, $2)`, [bomA, bomB]);
  await pool.query(`delete from public.npd_projects where id in ($1, $2)`, [projectA, projectB]);
  await pool.query(`delete from public.product where product_code in ($1, $2)`, [productA, productB]);
  await pool.query(
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'T097 Product A', false, 1, $3),
             ($4, $5, 'T097 Product B', false, 1, $6)
    `,
    [productA, orgA, orgAUser, productB, orgB, orgBUser],
  );
  await pool.query(
    `
      insert into public.npd_projects (id, org_id, code, name, type, product_code, created_by_user)
      values ($1, $2, 'NPD-T097-A', 'T097 Project A', 'standard', $3, $4),
             ($5, $6, 'NPD-T097-B', 'T097 Project B', 'standard', $7, $8)
    `,
    [projectA, orgA, productA, orgAUser, projectB, orgB, productB, orgBUser],
  );
  await pool.query(
    `
      insert into public.bom_headers
        (id, org_id, product_id, npd_project_id, origin_module, status, version, approved_by, approved_at)
      values
        ($1, $2, $3, $4, 'npd', 'technical_approved', 1, $5, now()),
        ($6, $7, $8, $9, 'npd', 'technical_approved', 1, $10, now())
    `,
    [bomA, orgA, productA, projectA, orgAUser, bomB, orgB, productB, projectB, orgBUser],
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

describe('125 factory_release_status migration contract', () => {
  it('defines the canonical factory release read model without tenant leakage or D365/Built coupling', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/125-factory-release-status.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.factory_release_status/i);
    for (const column of [
      'factory_available_at',
      'factory_approved_by',
      'release_event_id',
      'active_bom_header_id',
      'active_factory_spec_id',
      'release_blockers',
      'project_id',
      'product_code',
    ]) {
      expect(sql).toContain(column);
    }
    for (const status of [
      'pending_npd_release',
      'pending_technical_approval',
      'approved_for_factory',
      'released_to_factory',
      'blocked',
    ]) {
      expect(sql).toContain(status);
    }
    expect(sql).toMatch(/references public\.npd_projects\s*\(\s*id\s*\)/i);
    expect(sql).toMatch(/references public\.product\s*\(\s*product_code\s*\)/i);
    expect(sql).toMatch(/references public\.bom_headers\s*\(\s*id\s*,\s*org_id\s*\)/i);
    expect(sql).toMatch(/references public\.outbox_events\s*\(\s*id\s*\)/i);
    expect(sql).toMatch(/alter table public\.factory_release_status enable row level security/i);
    expect(sql).toMatch(/alter table public\.factory_release_status force row level security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(sql).not.toMatch(/status_overall\s*=\s*['"]Built['"]|built\s*=\s*true/i);
  });
});

runIntegrationTest('125 factory_release_status schema behavior', () => {
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

  it('publishes expected columns, constraints, forced RLS, app_user grants, and event CHECK values', async () => {
    const columns = await ownerPool.query<{ column_name: string; data_type: string }>(
      `
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'factory_release_status'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    expect([...columnNames]).toEqual(
      expect.arrayContaining([
        'id',
        'org_id',
        'project_id',
        'product_code',
        'release_status',
        'factory_available_at',
        'factory_approved_by',
        'release_event_id',
        'active_bom_header_id',
        'active_factory_spec_id',
        'release_blockers',
      ]),
    );
    expect(columnNames.has('tenant_id')).toBe(false);

    const foreignKeys = await ownerPool.query<{ foreign_table: string }>(
      `
        select confrelid::regclass::text as foreign_table
        from pg_constraint
        where conrelid = 'public.factory_release_status'::regclass
          and contype = 'f'
      `,
    );
    expect(foreignKeys.rows).toEqual(
      expect.arrayContaining([
        { foreign_table: 'organizations' },
        { foreign_table: 'npd_projects' },
        { foreign_table: 'product' },
        { foreign_table: 'bom_headers' },
        { foreign_table: 'users' },
        { foreign_table: 'outbox_events' },
      ]),
    );

    const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = 'public.factory_release_status'::regclass
      `,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await ownerPool.query<{ qual: string | null; with_check: string | null }>(
      `
        select qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'factory_release_status'
      `,
    );
    expect(policies.rows).toHaveLength(1);
    expect(`${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`).toContain('app.current_org_id()');

    const eventCheck = await ownerPool.query<{ definition: string }>(
      `
        select pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conrelid = 'public.outbox_events'::regclass
          and conname = 'outbox_events_event_type_check'
      `,
    );
    for (const eventType of [
      'npd.project.release_requested',
      'npd.builder.released_records_created',
      'technical.factory_spec.approved',
      'fg.released_to_factory',
      'fg.release_blocked',
    ]) {
      expect(eventCheck.rows[0]?.definition).toContain(eventType);
    }
  });

  it('enforces non-vacuous org RLS isolation and rejects cross-org WITH CHECK inserts', async () => {
    const rowA = randomUUID();
    const rowB = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query(`delete from public.factory_release_status where id in ($1, $2)`, [rowA, rowB]).catch(() => undefined);
    await ownerPool.query(
      `
        insert into public.factory_release_status
          (id, org_id, project_id, product_code, release_status, active_bom_header_id, active_factory_spec_id, release_blockers)
        values
          ($1, $2, $3, $4, 'pending_technical_approval', $5, $6, '[]'::jsonb),
          ($7, $8, $9, $10, 'pending_technical_approval', $11, $12, '[]'::jsonb)
      `,
      [rowA, orgA, projectA, productA, bomA, specA, rowB, orgB, projectB, productB, bomB, specB],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.factory_release_status
          where id in ($1, $2)
          order by id
        `,
        [rowA, rowB],
      );
      expect(visible.rows).toEqual([{ id: rowA, org_id: orgA }]);

      await expect(
        client.query(
          `
            insert into public.factory_release_status
              (org_id, project_id, product_code, release_status, active_bom_header_id, active_factory_spec_id, release_blockers)
            values ($1, $2, $3, 'pending_technical_approval', $4, $5, '[]'::jsonb)
          `,
          [orgB, projectB, productB, bomB, specB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied|does not belong|does not exist/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('rejects factory-usable statuses without Technical-approved BOM/spec evidence', async () => {
    await expect(
      ownerPool.query(
        `
          insert into public.factory_release_status
            (org_id, project_id, product_code, release_status, active_bom_header_id, active_factory_spec_id, release_blockers)
          values ($1, $2, $3, 'approved_for_factory', $4, null, '[]'::jsonb)
        `,
        [orgA, projectA, productA, bomA],
      ),
    ).rejects.toThrow(/factory-usable|violates check constraint/i);
  });
});
