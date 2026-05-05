import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgAUser = 'aaaaaaaa-1111-4111-8111-111111111111';
const orgBUser = 'bbbbbbbb-2222-4222-8222-222222222222';
const appUserPassword = ['app', 'user', 'test', 'password'].join('_');

function appUserDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set for RLS integration tests');
  }

  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function assertRequiredColumns(adminPool: pg.Pool) {
  const expectedColumns = [
    ['tenants', 'region_cluster'],
    ['tenants', 'data_plane_url'],
    ['organizations', 'tenant_id'],
    ['organizations', 'industry_code'],
    ['users', 'org_id'],
  ] as const;

  const rows = await adminPool.query('select table_name, column_name from information_schema.columns where table_schema = $1', ['public']);
  const seen = new Set(rows.rows.map((row: { table_name: string; column_name: string }) => `${row.table_name}.${row.column_name}`));

  for (const [tableName, columnName] of expectedColumns) {
    if (!seen.has(`${tableName}.${columnName}`)) {
      throw new Error(`Expected baseline schema column missing: public.${tableName}.${columnName}`);
    }
  }
}

async function seedBaselineData(adminPool: pg.Pool) {
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

  await adminPool.query('truncate table public.users, public.organizations, public.tenants cascade');
  await adminPool.query('insert into public.tenants (id, name, region_cluster, data_plane_url) values ($1, $2, $3, $4)', [
    tenantId,
    'Tenant A',
    'eu',
    'https://tenant-a.example.test',
  ]);
  await adminPool.query(
    'insert into public.organizations (id, tenant_id, name, industry_code) values ($1, $2, $3, $4), ($5, $2, $6, $7)',
    [orgA, tenantId, 'Org A', 'bakery', orgB, tenantId, 'pharma'],
  );
  await adminPool.query(
    'insert into public.users (id, org_id, email) values ($1, $2, $3), ($4, $5, $6)',
    [
      orgAUser,
      orgA,
      'user-a@example.test',
      orgBUser,
      orgB,
      'user-b@example.test',
    ],
  );

  await adminPool.query('grant usage on schema public to app_user');
  await adminPool.query('grant select, insert, update, delete on public.organizations, public.users to app_user');
}

async function cleanupContextState(adminPool: pg.Pool) {
  await adminPool.query('truncate table if exists app.session_org_contexts, app.active_org_contexts cascade');
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [sessionToken, orgId]);
}

describe('002 RLS baseline migration contract', () => {
  it('uses org-scoped policies through app.current_org_id without tenant_id GUC spoofing', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/002-rls-baseline.sql to implement T-007').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/alter\s+table\s+(?:public\.)?organizations\s+enable\s+row\s+level\s+security/i);
    expect(migration).toMatch(/alter\s+table\s+(?:public\.)?users\s+enable\s+row\s+level\s+security/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).toMatch(/create\s+(?:or\s+replace\s+)?function\s+app\.set_org_context\s*\(/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.tenant_id['"]/i);
    expect(migration).not.toMatch(/\bleakproof\b/i);
  });
});

runIntegrationTest('002 RLS baseline app-role behavior', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl });
    appPool = new Pool({ connectionString: appUserDatabaseUrl() });

    await adminPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await assertRequiredColumns(adminPool);
    await seedBaselineData(adminPool);
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await cleanupContextState(adminPool);
  });
  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('connects as app_user and proves the test role is not a superuser', async () => {
    const result = await appPool.query<{ current_user: string; rolsuper: boolean }>(`
      select current_user, rolsuper
      from pg_roles
      where rolname = current_user
    `);

    expect(result.rows).toEqual([{ current_user: 'app_user', rolsuper: false }]);
  });

  it('scopes SELECT to the trusted org context and rejects cross-org INSERTs', async () => {
    const sessionToken = randomUUID();
    await seedTrustedOrgContext(adminPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visibleUsers = await client.query<{ id: string; org_id: string }>('select id, org_id from public.users order by id');
      expect(visibleUsers.rows).toEqual([{ id: orgAUser, org_id: orgA }]);

      const crossOrgUsers = await client.query('select id from public.users where org_id = $1::uuid', [orgB]);
      expect(crossOrgUsers.rowCount).toBe(0);

      await expect(
        client.query('insert into public.users (id, org_id, email) values ($1::uuid, $2::uuid, $3)', [
          randomUUID(),
          orgB,
          'spoofed-org-b@example.test',
        ]),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('does not grant org B access when app_user spoofs a custom GUC directly', async () => {
    const sessionToken = randomUUID();
    await seedTrustedOrgContext(adminPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await client.query("set local app.current_org_id = '22222222-2222-4222-8222-222222222222'");

      const spoofedRows = await client.query('select id from public.users where org_id = $1::uuid', [orgB]);
      expect(spoofedRows.rowCount).toBe(0);

      const stillCurrentOrgA = await client.query<{ current_org_id: string }>('select app.current_org_id() as current_org_id');
      expect(stillCurrentOrgA.rows[0]?.current_org_id).toBe(orgA);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('publishes pg_policies that call app.current_org_id and do not authorize via raw app.tenant_id settings', async () => {
    const result = await appPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(`
      select tablename, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in ('organizations', 'users')
      order by tablename, policyname
    `);

    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.rows.every((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);
    expect(result.rows.every((row) => !`${row.qual ?? ''} ${row.with_check ?? ''}`.includes("current_setting('app.tenant_id'"))).toBe(true);
  });
});
