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
const migrationPath = resolve(packageRoot, 'migrations/112-fa-builder-outputs.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '04300000-0000-4000-8000-000000000000';
const orgA = '04300000-0000-4000-8000-00000000000a';
const orgB = '04300000-0000-4000-8000-00000000000b';
const orgAUser = '04300000-0000-4000-8000-0000000000aa';
const orgBUser = '04300000-0000-4000-8000-0000000000bb';
const orgARole = '04300000-0000-4000-8000-0000000001aa';
const orgBRole = '04300000-0000-4000-8000-0000000001bb';
const productA = 'FA-T043-A';
const productB = 'FA-T043-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Builder Outputs Tenant', 'eu', 'https://builder-output.example.test')
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
      values ($1, $2, 'Builder Outputs Org A', 'bakery'),
             ($3, $2, 'Builder Outputs Org B', 'fmcg')
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
      values ($1, $2, 'builder_output_user', 'Builder Output Role A', '[]'::jsonb, true),
             ($3, $4, 'builder_output_user', 'Builder Output Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'builder-output-a@example.test', 'Builder Output User A', $3),
             ($4, $5, 'builder-output-b@example.test', 'Builder Output User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.fa_builder_outputs where product_code in ($1, $2)', [productA, productB]);
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Builder Output Product A', true, 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Builder Output Product B', true, 1, $3)
    `,
    [productB, orgB, orgBUser],
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

describe('112 fa_builder_outputs migration contract', () => {
  it('creates org-scoped storage metadata with forced RLS and no stale tenant GUCs', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/112-fa-builder-outputs.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.fa_builder_outputs/i);
    expect(sql).toMatch(/product_code[\s\S]*references public\.product\s*\(\s*product_code\s*\)/i);
    expect(sql).toMatch(/\bfile_path\b/i);
    expect(sql).toMatch(/\bgenerated_at\b/i);
    expect(sql).toMatch(/\bgenerated_by_user\b/i);
    expect(sql).toMatch(/\bapp_version\b/i);
    expect(sql).toMatch(/\bsuperseded_at\b/i);
    expect(sql).toMatch(/alter table public\.fa_builder_outputs enable row level security/i);
    expect(sql).toMatch(/alter table public\.fa_builder_outputs force row level security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('112 fa_builder_outputs schema behavior', () => {
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

  it('publishes expected columns, constraints, forced RLS, and app_user grants', async () => {
    const columns = await ownerPool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'fa_builder_outputs'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    expect([...columnNames]).toEqual(
      expect.arrayContaining([
        'id',
        'org_id',
        'product_code',
        'file_path',
        'generated_at',
        'generated_by_user',
        'app_version',
        'superseded_at',
      ]),
    );
    expect(columnNames.has('tenant_id')).toBe(false);

    const foreignKeys = await ownerPool.query<{ constraint_name: string; foreign_table: string }>(
      `
        select con.conname as constraint_name, confrelid::regclass::text as foreign_table
        from pg_constraint con
        where con.conrelid = 'public.fa_builder_outputs'::regclass
          and con.contype = 'f'
        order by con.conname
      `,
    );
    expect(foreignKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ foreign_table: 'product' }),
        expect.objectContaining({ foreign_table: 'users' }),
        expect.objectContaining({ foreign_table: 'organizations' }),
      ]),
    );

    const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = 'public.fa_builder_outputs'::regclass
      `,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await ownerPool.query<{ qual: string | null; with_check: string | null }>(
      `
        select qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'fa_builder_outputs'
      `,
    );
    expect(policies.rows).toHaveLength(1);
    expect(`${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`).toContain('app.current_org_id()');
  });

  it('supersedes prior active outputs for the same org and product on insert', async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();

    await ownerPool.query('delete from public.fa_builder_outputs where product_code = $1', [productA]);
    await ownerPool.query(
      `
        insert into public.fa_builder_outputs
          (id, org_id, product_code, file_path, generated_by_user, app_version)
        values ($1, $2, $3, 'org/a/builder/first.xlsx', $4, 'test-a')
      `,
      [firstId, orgA, productA, orgAUser],
    );
    await ownerPool.query(
      `
        insert into public.fa_builder_outputs
          (id, org_id, product_code, file_path, generated_by_user, app_version)
        values ($1, $2, $3, 'org/a/builder/second.xlsx', $4, 'test-b')
      `,
      [secondId, orgA, productA, orgAUser],
    );

    const rows = await ownerPool.query<{ id: string; superseded_at: Date | null }>(
      `
        select id, superseded_at
        from public.fa_builder_outputs
        where id in ($1, $2)
        order by file_path
      `,
      [firstId, secondId],
    );
    expect(rows.rows).toEqual([
      { id: firstId, superseded_at: expect.any(Date) },
      { id: secondId, superseded_at: null },
    ]);
  });

  it('enforces non-vacuous org RLS isolation and rejects cross-org WITH CHECK inserts', async () => {
    const orgAOutput = randomUUID();
    const orgBOutput = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query('delete from public.fa_builder_outputs where product_code in ($1, $2)', [productA, productB]);
    await ownerPool.query(
      `
        insert into public.fa_builder_outputs
          (id, org_id, product_code, file_path, generated_by_user, app_version)
        values ($1, $2, $3, 'org/a/builder/a.xlsx', $4, 'rls-a'),
               ($5, $6, $7, 'org/b/builder/b.xlsx', $8, 'rls-b')
      `,
      [orgAOutput, orgA, productA, orgAUser, orgBOutput, orgB, productB, orgBUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.fa_builder_outputs
          where id in ($1, $2)
          order by id
        `,
        [orgAOutput, orgBOutput],
      );
      expect(visible.rows).toEqual([{ id: orgAOutput, org_id: orgA }]);

      await expect(
        client.query(
          `
            insert into public.fa_builder_outputs
              (org_id, product_code, file_path, generated_by_user, app_version)
            values ($1, $2, 'org/b/builder/rejected.xlsx', $3, 'rls-reject')
          `,
          [orgB, productB, orgBUser],
        ),
      ).rejects.toThrow(/does not belong to current org|does not exist|row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
