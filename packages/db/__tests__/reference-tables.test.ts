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
const schemaPath = resolve(packageRoot, 'schema/reference-tables.ts');
const migrationsDir = resolve(packageRoot, 'migrations');

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function findReferenceTablesMigrationPaths() {
  return migrationFiles().filter((file) => {
    const sql = readFileSync(file, 'utf8').toLowerCase();
    return sql.includes('reference_tables') && sql.includes('table_code') && sql.includes('row_data');
  });
}

function referenceTablesSql() {
  const paths = findReferenceTablesMigrationPaths();
  expect(
    paths.map((path) => basename(path)),
    'a new reference tables migration must define generic public.reference_tables storage',
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
     values ($1, 'Reference Tables Tenant', 'eu', 'https://reference-tables.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );

  const orgColumns = ['id', 'name'];
  const orgValues: unknown[] = [orgId, 'Reference Tables Org'];
  if (await columnExists(client, 'organizations', 'tenant_id')) {
    orgColumns.push('tenant_id');
    orgValues.push(tenantId);
  }
  if (await columnExists(client, 'organizations', 'slug')) {
    orgColumns.push('slug');
    orgValues.push(`reference-tables-${orgId.slice(0, 8)}`);
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

describe('reference tables schema contract (T-008 RED)', () => {
  it('adds a Drizzle reference-tables schema for generic storage with no tenant/GUC drift', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/reference-tables.ts must define generic reference_tables').toBe(true);
    if (!existsSync(schemaPath)) {
      return;
    }

    const source = readFileSync(schemaPath, 'utf8');
    expect(source).toMatch(/export\s+const\s+referenceTables\s*=\s*pgTable\(\s*['"]reference_tables['"]/i);
    expect(source).toMatch(/orgId:\s*uuid\(\s*['"]org_id['"]\s*\)[\s\S]{0,180}references\(/i);
    expect(source).toMatch(/tableCode:\s*text\(\s*['"]table_code['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/rowKey:\s*text\(\s*['"]row_key['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/rowData:\s*jsonb\(\s*['"]row_data['"]\s*\)\.notNull\(\)/i);
    expect(source).toMatch(/version:\s*integer\(\s*['"]version['"]\s*\)\.notNull\(\)\.default\(\s*1\s*\)/i);
    expect(source).toMatch(/isActive:\s*boolean\(\s*['"]is_active['"]\s*\)\.notNull\(\)\.default\(\s*true\s*\)/i);
    expect(source).toMatch(/primaryKey\s*\([\s\S]{0,120}orgId[\s\S]{0,120}tableCode[\s\S]{0,120}rowKey/i);
    expect(source).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('adds one generic SQL table with the §5.5 columns, composite PK, forced RLS, and no dedicated reference tables', () => {
    const sql = referenceTablesSql();
    if (!sql) {
      return;
    }

    expectSqlMatch(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?reference_tables\b/i, 'reference_tables table is created');
    for (const [columnName, pattern] of [
      ['org_id', /\borg_id\s+uuid\s+not\s+null[\s\S]{0,140}references\s+(?:public\.)?organizations\s*\(\s*id\s*\)/i],
      ['table_code', /\btable_code\s+text\s+not\s+null/i],
      ['row_key', /\brow_key\s+text\s+not\s+null/i],
      ['row_data', /\brow_data\s+jsonb\s+not\s+null/i],
      ['version', /\bversion\s+int(?:eger)?\s+not\s+null\s+default\s+1/i],
      ['is_active', /\bis_active\s+boolean\s+not\s+null\s+default\s+true/i],
      ['display_order', /\bdisplay_order\s+int(?:eger)?\s+default\s+0/i],
      ['created_by', /\bcreated_by\s+uuid[\s\S]{0,120}references\s+(?:public\.)?users\s*\(\s*id\s*\)/i],
      ['created_at', /\bcreated_at\s+timestamptz\s+(?:not\s+null\s+)?default\s+(?:pg_catalog\.)?now\s*\(\s*\)/i],
      ['updated_at', /\bupdated_at\s+timestamptz\s+(?:not\s+null\s+)?default\s+(?:pg_catalog\.)?now\s*\(\s*\)/i],
    ] as const) {
      expectSqlMatch(sql, pattern, `${columnName} shape`);
    }

    expectSqlMatch(sql, /primary\s+key\s*\(\s*org_id\s*,\s*table_code\s*,\s*row_key\s*\)/i, 'composite primary key');
    expectSqlMatch(sql, /alter\s+table\s+(?:public\.)?reference_tables\s+enable\s+row\s+level\s+security/i, 'RLS enabled');
    expectSqlMatch(sql, /alter\s+table\s+(?:public\.)?reference_tables\s+force\s+row\s+level\s+security/i, 'RLS forced');
    expectSqlMatch(sql, /create\s+policy[\s\S]{0,160}reference_tables[\s\S]{0,500}app\.current_org_id\s*\(\s*\)/i, 'RLS uses app.current_org_id()');
    expectSqlNotMatch(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(?:pack_sizes|templates|allergens|d365_constants)\b/i, 'no dedicated per-reference tables');
    expectSqlNotMatch(sql, /current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i, 'no raw tenant/current_org_id GUC reads');
  });

  it('adds a row_data-sensitive version trigger that does not increment on unrelated UPDATEs', () => {
    const sql = referenceTablesSql();
    if (!sql) {
      return;
    }

    expectSqlMatch(sql, /create\s+(?:or\s+replace\s+)?function\s+(?:app\.)?reference_tables_set_version\s*\(/i, 'version trigger function exists');
    expectSqlMatch(sql, /new\.row_data\s+is\s+distinct\s+from\s+old\.row_data/i, 'trigger checks row_data changes');
    expectSqlMatch(sql, /new\.version\s*:=\s*old\.version\s*\+\s*1/i, 'trigger increments from old version');
    expectSqlMatch(sql, /create\s+trigger\s+reference_tables_set_version[\s\S]{0,160}before\s+update[\s\S]{0,160}on\s+(?:public\.)?reference_tables[\s\S]{0,160}execute\s+function\s+(?:app\.)?reference_tables_set_version\s*\(\s*\)/i, 'BEFORE UPDATE trigger is attached');
  });

  it('adds an opt-in materialized-view refresh function callable by org_id and table_code', () => {
    const sql = referenceTablesSql();
    if (!sql) {
      return;
    }

    expectSqlMatch(sql, /create\s+(?:or\s+replace\s+)?function\s+(?:app\.)?refresh_reference_table_mv\s*\([\s\S]{0,220}org_id[\s\S]{0,120}uuid[\s\S]{0,220}table_code[\s\S]{0,120}text/i, 'refresh function accepts org_id and table_code');
    expectSqlMatch(sql, /refresh\s+materialized\s+view(?:\s+concurrently)?/i, 'refresh function refreshes a materialized view');
    expectSqlMatch(sql, /grant\s+execute\s+on\s+function\s+(?:app\.)?refresh_reference_table_mv\s*\([^)]*uuid[^)]*text[^)]*\)\s+to\s+app_user/i, 'refresh function is callable by app_user');
    expectSqlMatch(sql, /to_regclass\s*\(|pg_matviews|pg_class/i, 'refresh function checks that an opt-in MV exists before refresh');
    expectSqlNotMatch(sql, /create\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?reference_tables_/i, 'migration must not auto-create per-org/table materialized views');
  });
});

runIntegrationSuite('reference tables migration behavior', () => {
  let adminPool: PgPool | undefined;
  let adminClient: PgClient | undefined;

  beforeAll(async () => {
    const referenceMigrations = findReferenceTablesMigrationPaths();
    if (referenceMigrations.length === 0) {
      return;
    }

    const { getOwnerConnection } = await import('../test-utils/test-pool.js');
    adminPool = getOwnerConnection();
    adminClient = await adminPool.connect();
    await applySqlFile(adminClient, resolve(migrationsDir, '001-baseline.sql'));
    await applySqlFile(adminClient, resolve(migrationsDir, '002-rls-baseline.sql'));
    for (const migrationPath of referenceMigrations) {
      await applySqlFile(adminClient, migrationPath);
    }
  });

  afterAll(async () => {
    adminClient?.release();
    await adminPool?.end();
  });

  it('increments version only when row_data changes and keeps the refresh function callable', async () => {
    const referenceMigrations = findReferenceTablesMigrationPaths();
    expect(
      referenceMigrations.map((path) => basename(path)),
      'reference tables migration must exist before behavior can be verified',
    ).not.toHaveLength(0);
    if (!adminClient || referenceMigrations.length === 0) {
      return;
    }

    const orgId = randomUUID();
    await adminClient.query('truncate table public.reference_tables cascade');
    await seedOrganization(adminClient, orgId);
    await adminClient.query(
      `insert into public.reference_tables (org_id, table_code, row_key, row_data)
       values ($1, 'pack_sizes', '20x30cm', '{"width":20,"height":30}'::jsonb)`,
      [orgId],
    );

    await adminClient.query(
      `update public.reference_tables
       set display_order = 10
       where org_id = $1 and table_code = 'pack_sizes' and row_key = '20x30cm'`,
      [orgId],
    );
    const afterMetadataOnly = await adminClient.query<{ version: number }>(
      `select version from public.reference_tables where org_id = $1 and table_code = 'pack_sizes' and row_key = '20x30cm'`,
      [orgId],
    );
    expect(afterMetadataOnly.rows[0]?.version).toBe(1);

    await adminClient.query(
      `update public.reference_tables
       set row_data = '{"width":25,"height":30}'::jsonb
       where org_id = $1 and table_code = 'pack_sizes' and row_key = '20x30cm'`,
      [orgId],
    );
    const afterRowDataChange = await adminClient.query<{ version: number }>(
      `select version from public.reference_tables where org_id = $1 and table_code = 'pack_sizes' and row_key = '20x30cm'`,
      [orgId],
    );
    expect(afterRowDataChange.rows[0]?.version).toBe(2);

    await expect(adminClient.query('select app.refresh_reference_table_mv($1::uuid, $2::text)', [orgId, 'pack_sizes'])).resolves.toBeDefined();
  });
});
