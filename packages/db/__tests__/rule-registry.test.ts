import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type QueryResult<T> = { rows: T[]; rowCount: number | null };
type Queryable = { query: <T = Record<string, unknown>>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> };
type PgClient = Queryable & { release: () => void };
type PgPool = Queryable & { connect: () => Promise<PgClient>; end: () => Promise<void> };

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(packageRoot, 'schema/rule-registry.ts');
const migrationsDir = resolve(packageRoot, 'migrations');
const ruleRegistryTables = ['rule_definitions', 'rule_dry_runs'] as const;

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function findRuleRegistryMigrationPaths() {
  return migrationFiles().filter((file) => {
    const sql = readFileSync(file, 'utf8').toLowerCase();
    return sql.includes('rule_definitions') && sql.includes('rule_dry_runs');
  });
}

function ruleRegistrySql() {
  const paths = findRuleRegistryMigrationPaths();
  expect(
    paths.map((path) => basename(path)),
    'a new rule registry migration must define rule_definitions and rule_dry_runs',
  ).not.toHaveLength(0);
  return paths.map((file) => readFileSync(file, 'utf8')).join('\n\n');
}

function expectSqlMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(true);
}

function expectSqlNotMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(false);
}

async function applySqlFile(client: PgClient, filePath: string) {
  await client.query(readFileSync(filePath, 'utf8'));
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

async function seedOrganization(client: Queryable, orgId: string) {
  const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await client.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Rule Registry Tenant', 'eu', 'https://rule-registry.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );

  const orgColumns = ['id', 'name'];
  const orgValues: unknown[] = [orgId, 'Rule Registry Org'];
  if (await columnExists(client, 'organizations', 'tenant_id')) {
    orgColumns.push('tenant_id');
    orgValues.push(tenantId);
  }
  if (await columnExists(client, 'organizations', 'slug')) {
    orgColumns.push('slug');
    orgValues.push(`rule-registry-${orgId.slice(0, 8)}`);
  }
  if (await columnExists(client, 'organizations', 'industry_code')) {
    orgColumns.push('industry_code');
    orgValues.push('bakery');
  }

  const placeholders = orgColumns.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `insert into public.organizations (${orgColumns.join(', ')}) values (${placeholders}) on conflict (id) do nothing`,
    orgValues,
  );
}

describe('rule registry schema contract (T-006 RED)', () => {
  it('adds a Drizzle rule-registry schema with the two §5.3 tables and no tenant/GUC drift', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/rule-registry.ts must define the rule registry tables').toBe(true);
    if (!existsSync(schemaPath)) {
      return;
    }

    const source = readFileSync(schemaPath, 'utf8');
    expect(source).toMatch(/export\s+const\s+ruleDefinitions\s*=\s*pgTable\(\s*['"]rule_definitions['"]/i);
    expect(source).toMatch(/export\s+const\s+ruleDryRuns\s*=\s*pgTable\(\s*['"]rule_dry_runs['"]/i);
    expect(source).toMatch(/ruleCode:\s*text\(\s*['"]rule_code['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/ruleType:\s*text\(\s*['"]rule_type['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/tier:\s*text\(\s*['"]tier['"]\s*\)\.notNull\(\)\.default\(\s*['"]L1['"]\s*\)/i);
    expect(source).toMatch(/definitionJson:\s*jsonb\(\s*['"]definition_json['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/ruleDefinitionId:\s*uuid\(\s*['"]rule_definition_id['"]\s*\)[\s\S]{0,160}references\(/i);
    expect(source).toMatch(/unique\s*\([\s\S]{0,80}orgId[\s\S]{0,80}ruleCode[\s\S]{0,80}version/i);
    expect(source).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('adds a SQL migration with §5.3 table shape, rule/tier checks, unique index, and cascade FK', () => {
    const sql = ruleRegistrySql();
    if (!sql) {
      return;
    }

    for (const tableName of ruleRegistryTables) {
      expectSqlMatch(sql, new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tableName}\\b`, 'i'), `${tableName} is created`);
      expectSqlMatch(sql, new RegExp(`${tableName}[\\s\\S]{0,500}\\bid\\s+uuid\\s+primary\\s+key\\s+default\\s+gen_random_uuid\\s*\\(\\s*\\)`, 'i'), `${tableName}.id default`);
      expectSqlMatch(sql, new RegExp(`${tableName}[\\s\\S]{0,700}\\borg_id\\s+uuid[\\s\\S]{0,120}references\\s+(?:public\\.)?organizations\\s*\\(\\s*id\\s*\\)`, 'i'), `${tableName}.org_id FK`);
    }

    for (const [columnName, pattern] of [
      ['rule_code', /\brule_code\s+text\s+not\s+null/i],
      ['rule_type', /\brule_type\s+text\s+not\s+null/i],
      ['tier', /\btier\s+text\s+not\s+null\s+default\s+'L1'/i],
      ['definition_json', /\bdefinition_json\s+jsonb\s+not\s+null/i],
      ['version', /\bversion\s+int(?:eger)?\s+not\s+null\s+default\s+1/i],
      ['active_from', /\bactive_from\s+timestamptz\s+not\s+null\s+default\s+(?:pg_catalog\.)?now\s*\(\s*\)/i],
      ['active_to', /\bactive_to\s+timestamptz\b/i],
      ['deployed_by', /\bdeployed_by\s+uuid[\s\S]{0,120}references\s+(?:public\.)?users\s*\(\s*id\s*\)/i],
      ['deploy_ref', /\bdeploy_ref\s+text\b/i],
      ['sample_input_json', /\bsample_input_json\s+jsonb\s+not\s+null/i],
      ['result_json', /\bresult_json\s+jsonb\s+not\s+null/i],
      ['ran_at', /\bran_at\s+timestamptz\s+default\s+(?:pg_catalog\.)?now\s*\(\s*\)/i],
      ['ran_by', /\bran_by\s+uuid[\s\S]{0,120}references\s+(?:public\.)?users\s*\(\s*id\s*\)/i],
    ] as const) {
      expectSqlMatch(sql, pattern, `${columnName} shape`);
    }

    expectSqlMatch(sql, /check\s*\([\s\S]{0,160}rule_type[\s\S]{0,220}'cascading'[\s\S]{0,80}'conditional'[\s\S]{0,80}'gate'[\s\S]{0,80}'workflow'/i, 'rule_type CHECK values');
    expectSqlMatch(sql, /check\s*\([\s\S]{0,120}tier[\s\S]{0,160}'L1'[\s\S]{0,60}'L2'[\s\S]{0,60}'L3'[\s\S]{0,60}'L4'/i, 'tier CHECK values');
    expectSqlMatch(sql, /unique\s*\(\s*org_id\s*,\s*rule_code\s*,\s*version\s*\)/i, 'unique org_id/rule_code/version');
    expectSqlMatch(sql, /create\s+(?:unique\s+)?index[\s\S]{0,180}on\s+(?:public\.)?rule_definitions\s*\(\s*org_id\s*,\s*rule_code\s*\)/i, 'registry list index on org_id/rule_code');
    expectSqlMatch(sql, /rule_definition_id\s+uuid[\s\S]{0,220}references\s+(?:public\.)?rule_definitions\s*\(\s*id\s*\)[\s\S]{0,80}on\s+delete\s+cascade/i, 'dry run cascade FK');
  });

  it('enables forced RLS on both rule registry tables via app.current_org_id()', () => {
    const sql = ruleRegistrySql();
    if (!sql) {
      return;
    }

    for (const tableName of ruleRegistryTables) {
      expectSqlMatch(sql, new RegExp(`alter\\s+table\\s+(?:public\\.)?${tableName}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${tableName} enables RLS`);
      expectSqlMatch(sql, new RegExp(`alter\\s+table\\s+(?:public\\.)?${tableName}\\s+force\\s+row\\s+level\\s+security`, 'i'), `${tableName} forces RLS`);
      expectSqlMatch(sql, new RegExp(`create\\s+policy[\\s\\S]{0,120}${tableName}[\\s\\S]{0,500}using\\s*\\([\\s\\S]{0,220}app\\.current_org_id\\s*\\(\\s*\\)`, 'i'), `${tableName} policy uses app.current_org_id()`);
    }
    expectSqlNotMatch(sql, /current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i, 'no raw tenant/current_org_id GUC reads');
  });
});

runIntegrationSuite('rule registry migration behavior', () => {
  let adminPool: PgPool | undefined;
  let adminClient: PgClient | undefined;

  beforeAll(async () => {
    const registryMigrations = findRuleRegistryMigrationPaths();
    if (registryMigrations.length === 0) {
      return;
    }

    const { getOwnerConnection } = await import('../test-utils/test-pool.js');
    adminPool = getOwnerConnection();
    adminClient = await adminPool.connect();
    await applySqlFile(adminClient, resolve(migrationsDir, '001-baseline.sql'));
    await applySqlFile(adminClient, resolve(migrationsDir, '002-rls-baseline.sql'));
    for (const migrationPath of registryMigrations) {
      await applySqlFile(adminClient, migrationPath);
    }
  });

  afterAll(async () => {
    adminClient?.release();
    await adminPool?.end();
  });

  it('rejects duplicate (org_id, rule_code, version) inserts with PostgreSQL 23505', async () => {
    const registryMigrations = findRuleRegistryMigrationPaths();
    expect(
      registryMigrations.map((path) => basename(path)),
      'rule registry migration must exist before duplicate constraint behavior can be verified',
    ).not.toHaveLength(0);
    if (!adminClient || registryMigrations.length === 0) {
      return;
    }

    const orgId = randomUUID();
    await adminClient.query('truncate table public.rule_dry_runs, public.rule_definitions cascade');
    await seedOrganization(adminClient, orgId);

    const insertRule = (id: string) =>
      adminClient?.query(
        `insert into public.rule_definitions
           (id, org_id, rule_code, rule_type, tier, definition_json, version)
         values ($1, $2, 'allergen_changeover_gate', 'gate', 'L1', '{"dsl":"sample"}'::jsonb, 1)`,
        [id, orgId],
      );

    await insertRule(randomUUID());
    let error: unknown;
    try {
      await insertRule(randomUUID());
    } catch (caught) {
      error = caught;
    }

    expect((error as { code?: string } | undefined)?.code).toBe('23505');
  });
});
