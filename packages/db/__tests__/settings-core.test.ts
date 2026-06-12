import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';
type QueryResult<T> = { rows: T[]; rowCount: number | null };
type Queryable = { query: <T = Record<string, unknown>>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> };
type PgClient = Queryable & { release: () => void };
type PgPool = Queryable & { connect: () => Promise<PgClient>; end: () => Promise<void> };

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(packageRoot, 'schema/settings-core.ts');
const migrationsDir = resolve(packageRoot, 'migrations');

const coreTables = ['organizations', 'users', 'roles', 'modules', 'organization_modules'] as const;
const orgScopedRlsTables = ['organizations', 'users', 'roles', 'organization_modules'] as const;
const appUserPassword = ['app', 'user', 'settings', 'core', 'test'].join('_');

type CoreTable = (typeof coreTables)[number];

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
};

type PolicyRow = {
  tablename: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
};

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function migrationCorpus() {
  return migrationFiles()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n\n');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function expectSqlMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(true);
}

function expectSqlNotMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(false);
}

function expectColumn(columns: ColumnRow[], tableName: CoreTable, columnName: string, expected: Partial<ColumnRow>) {
  const column = columns.find((row) => row.table_name === tableName && row.column_name === columnName);
  expect(column, `${tableName}.${columnName}`).toBeDefined();
  if (column) {
    expect(column).toMatchObject(expected);
  }
}

function findSettingsCoreMigrationPaths() {
  return migrationFiles().filter((file) => {
    const sql = readFileSync(file, 'utf8').toLowerCase();
    return (
      sql.includes('organization_modules') ||
      (sql.includes('create table') && sql.includes('roles') && sql.includes('modules')) ||
      sql.includes('invite_token_expires_at') ||
      sql.includes('seat_limit')
    );
  });
}

async function applySqlFile(client: PgClient, filePath: string) {
  await client.query(readFileSync(filePath, 'utf8'));
}

async function tableColumns(client: PgClient, tableNames: readonly string[]) {
  const result = await client.query<ColumnRow>(
    `select table_name, column_name, data_type, udt_name, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public'
       and table_name = any($1::text[])
     order by table_name, ordinal_position`,
    [tableNames],
  );
  return result.rows;
}

async function columnExists(client: Queryable, tableName: string, columnName: string) {
  const result = await client.query<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = $1
         and column_name = $2
     )`,
    [tableName, columnName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function seedCoreRows(adminPool: PgPool, orgA: string, orgB: string, roleA: string, roleB: string) {
  const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tenantExists = await adminPool.query<{ exists: boolean }>(
    "select to_regclass('public.tenants') is not null as exists",
  );
  if (tenantExists.rows[0]?.exists) {
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Settings Core Tenant', 'eu', 'https://settings-core.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
  }

  const orgHasTenantId = await columnExists(adminPool, 'organizations', 'tenant_id');
  const orgHasSlug = await columnExists(adminPool, 'organizations', 'slug');
  const orgHasIndustryCode = await columnExists(adminPool, 'organizations', 'industry_code');
  const orgColumns = ['id', 'name'];
  const orgAValues: unknown[] = [orgA, 'Org A'];
  const orgBValues: unknown[] = [orgB, 'Org B'];
  if (orgHasTenantId) {
    orgColumns.push('tenant_id');
    orgAValues.push(tenantId);
    orgBValues.push(tenantId);
  }
  if (orgHasSlug) {
    orgColumns.push('slug');
    orgAValues.push('org-a');
    orgBValues.push('org-b');
  }
  if (orgHasIndustryCode) {
    orgColumns.push('industry_code');
    orgAValues.push('bakery');
    orgBValues.push('pharma');
  }
  const placeholders = orgColumns.map((_, index) => `$${index + 1}`).join(', ');
  await adminPool.query(
    `insert into public.organizations (${orgColumns.join(', ')}) values (${placeholders}) on conflict (id) do nothing`,
    orgAValues,
  );
  await adminPool.query(
    `insert into public.organizations (${orgColumns.join(', ')}) values (${placeholders}) on conflict (id) do nothing`,
    orgBValues,
  );

  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'admin', 'Admin', '[]'::jsonb, false), ($3, $4, 'operator', 'Operator', '[]'::jsonb, false)
     on conflict do nothing`,
    [roleA, orgA, roleB, orgB],
  );

  const userNameColumn = (await columnExists(adminPool, 'users', 'name')) ? 'name' : 'display_name';
  await adminPool.query(
    `insert into public.users (id, org_id, email, ${userNameColumn}, role_id)
     values ($1, $2, 'user-a@example.test', 'User A', $3), ($4, $5, 'user-b@example.test', 'User B', $6)
     on conflict do nothing`,
    [randomUUID(), orgA, roleA, randomUUID(), orgB, roleB],
  );

  await adminPool.query(
    `insert into public.modules (code, name, dependencies, can_disable, phase, display_order)
     values ('02-settings', 'Settings', '{}'::text[], false, 1, 2)
     on conflict (code) do nothing`,
  );
  await adminPool.query(
    `insert into public.organization_modules (org_id, module_code, enabled)
     values ($1, '02-settings', true), ($2, '02-settings', true)
     on conflict do nothing`,
    [orgA, orgB],
  );
}

describe('settings core schema contract (T-004 RED)', () => {
  it('adds a Drizzle settings-core schema with the five §5.1 core identity tables and no tenant/GUC drift', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/settings-core.ts must define settings core tables').toBe(true);
    if (!existsSync(schemaPath)) {
      return;
    }

    const source = readFileSync(schemaPath, 'utf8');
    for (const [exportName, tableName] of [
      ['organizations', 'organizations'],
      ['users', 'users'],
      ['roles', 'roles'],
      ['modules', 'modules'],
      ['organizationModules', 'organization_modules'],
    ] as const) {
      expect(
        new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*pgTable\\(\\s*['"]${tableName}['"]`, 'i').test(
          source,
        ),
        `${exportName} pgTable(${tableName})`,
      ).toBe(true);
    }
    expect(source).toMatch(/customType[\s\S]*citext/i);
    expect(source).toMatch(/seatLimit:\s*integer\(\s*['"]seat_limit['"]\s*\)(?![\s\S]{0,30}\.notNull\()/i);
    expect(source).toMatch(/inviteTokenExpiresAt:\s*timestamp\(\s*['"]invite_token_expires_at['"]\s*,\s*\{\s*withTimezone:\s*true/i);
    expect(source).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('creates §5.1 columns, CITEXT enablement, nullable seat_limit, and invite token expiry in migrations', () => {
    const sql = migrationCorpus();
    const expectedPatterns = [
      /create\s+extension\s+if\s+not\s+exists\s+citext/i,
      /\bslug\s+text\s+unique\s+not\s+null/i,
      /\blogo_url\s+text\b/i,
      /\btimezone\s+text\s+not\s+null\s+default\s+'Europe\/Warsaw'/i,
      /\blocale\s+text\s+not\s+null\s+default\s+'pl'/i,
      /\bcurrency\s+char\s*\(\s*3\s*\)\s+not\s+null\s+default\s+'PLN'/i,
      /\bgs1_prefix\s+text\b/i,
      /\bregion\s+text\s+not\s+null\s+default\s+'eu'/i,
      /\btier\s+text\s+not\s+null\s+default\s+'L2'/i,
      /\bseat_limit\s+int(?:eger)?\b(?!\s+not\s+null)/i,
      /\bonboarding_state\s+jsonb\s+default\s+'\{\}'/i,
      /\bemail\s+citext\s+unique\s+not\s+null/i,
      /\bname\s+text\s+not\s+null/i,
      /\brole_id\s+uuid\s+not\s+null\s+references\s+(?:public\.)?roles\s*\(\s*id\s*\)/i,
      /\binvite_token\s+text\b/i,
      /\binvite_token_expires_at\s+timestamptz\b/i,
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?roles\b/i,
      /\bpermissions\s+jsonb\s+not\s+null/i,
      /unique\s*\(\s*org_id\s*,\s*code\s*\)/i,
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?modules\b/i,
      /\bcode\s+text\s+primary\s+key/i,
      /\bdependencies\s+text\s*\[\]\s+default\s+'\{\}'/i,
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?organization_modules\b/i,
      /primary\s+key\s*\(\s*org_id\s*,\s*module_code\s*\)/i,
    ];

    for (const pattern of expectedPatterns) {
      expectSqlMatch(sql, pattern, `migration should match ${pattern}`);
    }
  });

  it('enables forced RLS and app.current_org_id policies for org-scoped core tables without raw current_setting patterns', () => {
    const sql = migrationCorpus();
    for (const tableName of orgScopedRlsTables) {
      expectSqlMatch(
        sql,
        new RegExp(`alter\\s+table\\s+(?:public\\.)?${tableName}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
        `${tableName} enables RLS`,
      );
      expectSqlMatch(
        sql,
        new RegExp(`alter\\s+table\\s+(?:public\\.)?${tableName}\\s+force\\s+row\\s+level\\s+security`, 'i'),
        `${tableName} forces RLS`,
      );
    }

    expectSqlMatch(
      sql,
      /organizations[\s\S]{0,400}using\s*\(\s*id\s*=\s*app\.current_org_id\s*\(\s*\)\s*\)/i,
      'organizations id policy uses app.current_org_id()',
    );
    for (const tableName of ['users', 'roles', 'organization_modules'] as const) {
      expectSqlMatch(
        sql,
        new RegExp(`${tableName}[\\s\\S]{0,500}using\\s*\\(\\s*org_id\\s*=\\s*app\\.current_org_id\\s*\\(\\s*\\)\\s*\\)[\\s\\S]{0,300}with\\s+check\\s*\\(\\s*org_id\\s*=\\s*app\\.current_org_id\\s*\\(\\s*\\)\\s*\\)`, 'i'),
        `${tableName} org_id policy`,
      );
    }
    expectSqlNotMatch(
      sql,
      /current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i,
      'no raw tenant/current_org_id GUC reads',
    );
  });

  it('revokes execute on the SECURITY DEFINER seed_system_roles_on_org_insert from public', () => {
    const sql = migrationCorpus();
    expectSqlMatch(
      sql,
      /create\s+or\s+replace\s+function\s+public\.seed_system_roles_on_org_insert[\s\S]{0,400}security\s+definer/i,
      'seed_system_roles_on_org_insert is SECURITY DEFINER',
    );
    expectSqlMatch(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.seed_system_roles_on_org_insert\s*\(\s*\)\s+from\s+public/i,
      'SECURITY DEFINER function revokes execute from public',
    );
  });

  it('guards users.display_name backfill with a column-existence check', () => {
    const sql = migrationCorpus();
    const settingsCorePath = findSettingsCoreMigrationPaths().find((p) => p.endsWith('037-settings-core.sql'));
    expect(settingsCorePath, '037-settings-core.sql located').toBeDefined();
    const settingsCore = readFileSync(settingsCorePath as string, 'utf8');

    if (/u\.display_name/.test(settingsCore)) {
      expectSqlMatch(
        settingsCore,
        /information_schema\.columns[\s\S]{0,400}'display_name'/i,
        '037 references display_name so it must guard with information_schema.columns existence check',
      );
      expectSqlMatch(
        settingsCore,
        /coalesce\s*\(\s*u\.name\s*,\s*u\.email::text\s*\)/i,
        '037 contains a no-display_name fallback branch',
      );
    }
    expectSqlNotMatch(sql, /current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i, 'no raw GUC reads');
  });
});

runIntegrationSuite('settings core migration behavior as app_user', () => {
  let adminPool: PgPool;
  let appPool: PgPool;
  let adminClient: PgClient;
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';
  const roleA = '33333333-3333-4333-8333-333333333333';
  const roleB = '44444444-4444-4444-8444-444444444444';

  beforeAll(async () => {
    const settingsMigrations = findSettingsCoreMigrationPaths();
    expect(settingsMigrations.length, 'settings core migration must exist').toBeGreaterThan(0);

    const { getOwnerConnection, getAppConnection } = await import('../test-utils/test-pool.js');
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    adminClient = await adminPool.connect();
    await ensureAppUserWithAdvisoryLock(adminClient, appUserPassword);
    await applySqlFile(adminClient, resolve(migrationsDir, '001-baseline.sql'));
    await applySqlFile(adminClient, resolve(migrationsDir, '002-rls-baseline.sql'));
    for (const migrationPath of settingsMigrations) {
      await applySqlFile(adminClient, migrationPath);
    }
    await adminClient.query('truncate table app.session_org_contexts, app.active_org_contexts cascade');
    await adminClient.query('truncate table public.organization_modules, public.users, public.roles, public.modules, public.organizations cascade');
    await seedCoreRows(adminPool, orgA, orgB, roleA, roleB);
    await adminClient.query('grant usage on schema public to app_user');
    await adminClient.query('grant select, insert, update, delete on public.organizations, public.users, public.roles, public.modules, public.organization_modules to app_user');
  });

  afterAll(async () => {
    adminClient?.release();
    await appPool?.end();
    await adminPool?.end();
  });

  it('materializes the five tables with required §5.1/S-U7/S-U8 columns', async () => {
    const columns = await tableColumns(adminClient, coreTables);
    expect(new Set(columns.map((row) => row.table_name))).toEqual(new Set(coreTables));

    expectColumn(columns, 'organizations', 'slug', { data_type: 'text', is_nullable: 'NO' });
    expectColumn(columns, 'organizations', 'seat_limit', { data_type: 'integer', is_nullable: 'YES' });
    expectColumn(columns, 'users', 'email', { udt_name: 'citext', is_nullable: 'NO' });
    expectColumn(columns, 'users', 'role_id', { data_type: 'uuid', is_nullable: 'NO' });
    expectColumn(columns, 'users', 'invite_token', { data_type: 'text', is_nullable: 'YES' });
    expectColumn(columns, 'users', 'invite_token_expires_at', { data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expectColumn(columns, 'roles', 'permissions', { data_type: 'jsonb', is_nullable: 'NO' });
    expectColumn(columns, 'modules', 'dependencies', { data_type: 'ARRAY' });
    expectColumn(columns, 'organization_modules', 'module_code', { data_type: 'text', is_nullable: 'NO' });
  });

  it('publishes pg_policies using app.current_org_id and denies app_user without app.set_org_context', async () => {
    const policies = await adminClient.query<PolicyRow>(
      `select tablename, policyname, qual, with_check
       from pg_policies
       where schemaname = 'public'
         and tablename = any($1::text[])
       order by tablename, policyname`,
      [orgScopedRlsTables],
    );

    for (const tableName of orgScopedRlsTables) {
      const tablePolicies = policies.rows.filter((row) => row.tablename === tableName);
      expect(tablePolicies.length, `${tableName} policy count`).toBeGreaterThanOrEqual(1);
      expect(tablePolicies.some((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);
    }
    expect(policies.rows.every((row) => !`${row.qual ?? ''} ${row.with_check ?? ''}`.includes("current_setting('app.tenant_id'"))).toBe(true);
    expect(policies.rows.every((row) => !`${row.qual ?? ''} ${row.with_check ?? ''}`.includes("current_setting('app.current_org_id'"))).toBe(true);

    for (const tableName of ['organizations', 'users', 'roles', 'organization_modules'] as const) {
      const visibleRows = await appPool.query<{ count: string }>(`select count(*)::int as count from public.${tableName}`);
      expect(Number(visibleRows.rows[0]?.count ?? 0), `${tableName} default deny`).toBe(0);
    }
  });

  it('connects as app_user and scopes rows after app.set_org_context(session_token, org_id)', async () => {
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [sessionToken, orgA]);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visibleUsers = await client.query<{ org_id: string }>('select org_id from public.users order by org_id');
      expect(visibleUsers.rows.map((row) => row.org_id)).toEqual([orgA]);

      const visibleModules = await client.query<{ org_id: string }>('select org_id from public.organization_modules order by org_id');
      expect(visibleModules.rows.map((row) => row.org_id)).toEqual([orgA]);

      await expect(
        client.query('insert into public.organization_modules (org_id, module_code, enabled) values ($1, $2, true)', [
          orgB,
          '02-settings',
        ]),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
