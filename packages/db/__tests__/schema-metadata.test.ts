import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(packageRoot, 'schema/schema-metadata.ts');
const migrationsDir = resolve(packageRoot, 'migrations');
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;

const referenceSchemaColumns = [
  'id',
  'org_id',
  'table_code',
  'column_code',
  'dept_code',
  'data_type',
  'tier',
  'storage',
  'dropdown_source',
  'blocking_rule',
  'required_for_done',
  'validation_json',
  'presentation_json',
  'schema_version',
  'deprecated_at',
  'created_by',
  'created_at',
] as const;

const schemaMigrationColumns = [
  'id',
  'org_id',
  'table_code',
  'column_code',
  'action',
  'tier_before',
  'tier_after',
  'migration_script',
  'approved_by',
  'approved_at',
  'executed_at',
  'status',
  'result_notes',
  'created_at',
] as const;

const dataTypeValues = ['text', 'number', 'date', 'enum', 'formula', 'relation'] as const;
const tierValues = ['L1', 'L2', 'L3', 'L4'] as const;

type Queryable = { query: <T = Record<string, unknown>>(queryText: string, values?: unknown[]) => Promise<{ rows: T[] }> };
type PgPool = Queryable & { connect: () => Promise<Queryable & { release: () => void }>; end: () => Promise<void> };

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

function expectSql(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(true);
}

function expectTableColumn(sql: string, tableName: string, columnName: string, columnPattern: RegExp) {
  expectSql(sql, new RegExp(`create\\s+table[\\s\\S]{0,120}${tableName}[\\s\\S]*?\\b${columnName}\\b[\\s\\S]{0,140}${columnPattern.source}`, 'i'), `${tableName}.${columnName}`);
}

describe('schema metadata contract (T-005 RED)', () => {
  it('adds a Drizzle schema-metadata module with both §5.2 tables and no tenant/GUC drift', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/schema-metadata.ts must define schema metadata tables').toBe(true);
    if (!existsSync(schemaPath)) {
      return;
    }

    const source = readFileSync(schemaPath, 'utf8');
    expect(source).toMatch(/export\s+const\s+referenceSchemas\s*=\s*pgTable\(\s*['"]reference_schemas['"]/i);
    expect(source).toMatch(/export\s+const\s+schemaMigrations\s*=\s*pgTable\(\s*['"]schema_migrations['"]/i);
    expect(source).not.toMatch(/pgEnum\s*\(/i);
    expect(source).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('creates reference_schemas and schema_migrations with the §5.2 column shape', () => {
    const sql = migrationCorpus();
    expectSql(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.reference_schemas\b/i, 'reference_schemas table exists');
    expectSql(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.schema_migrations\b/i, 'schema_migrations table exists');

    for (const column of referenceSchemaColumns) {
      expectSql(sql, new RegExp(`\\breference_schemas[\\s\\S]*\\b${column}\\b`, 'i'), `reference_schemas.${column} exists`);
    }
    for (const column of schemaMigrationColumns) {
      expectSql(sql, new RegExp(`\\bschema_migrations[\\s\\S]*\\b${column}\\b`, 'i'), `schema_migrations.${column} exists`);
    }

    expectTableColumn(sql, 'reference_schemas', 'data_type', /text\s+not\s+null/);
    expectTableColumn(sql, 'reference_schemas', 'tier', /text\s+not\s+null/);
    expectTableColumn(sql, 'reference_schemas', 'storage', /text\s+not\s+null/);
    expectTableColumn(sql, 'reference_schemas', 'required_for_done', /boolean\s+not\s+null\s+default\s+false/);
    expectTableColumn(sql, 'reference_schemas', 'schema_version', /int(?:eger)?\s+not\s+null\s+default\s+1/);
    expectSql(sql, /unique\s*\(\s*org_id\s*,\s*table_code\s*,\s*column_code\s*\)/i, 'reference_schemas unique org/table/column');
    expectTableColumn(sql, 'schema_migrations', 'action', /text\s+not\s+null/);
    expectTableColumn(sql, 'schema_migrations', 'status', /text\s+not\s+null\s+default\s+'pending'/);
  });

  it('uses Postgres CHECK constraints for allowed reference_schemas data_type and tier values', () => {
    const sql = migrationCorpus();
    for (const value of dataTypeValues) {
      expectSql(sql, new RegExp(`data_type[\\s\\S]{0,260}check[\\s\\S]{0,260}'${value}'`, 'i'), `data_type allows ${value}`);
    }
    for (const value of tierValues) {
      expectSql(sql, new RegExp(`\\btier\\b[\\s\\S]{0,260}check[\\s\\S]{0,260}'${value}'`, 'i'), `tier allows ${value}`);
    }
    expect(sql).not.toMatch(/create\s+type\s+[^;]*(?:data_type|tier)|pgEnum\s*\(/i);
  });

  it('adds org_id/table_code indexes and reference_schemas RLS via app.current_org_id()', () => {
    const sql = migrationCorpus();
    for (const tableName of ['reference_schemas', 'schema_migrations'] as const) {
      expectSql(sql, new RegExp(`create\\s+(?:unique\\s+)?index[\\s\\S]{0,180}on\\s+public\\.${tableName}\\s*\\([^)]*org_id`, 'i'), `${tableName} org_id index`);
      expectSql(sql, new RegExp(`create\\s+(?:unique\\s+)?index[\\s\\S]{0,180}on\\s+public\\.${tableName}\\s*\\([^)]*table_code`, 'i'), `${tableName} table_code index`);
    }

    expectSql(sql, /alter\s+table\s+public\.reference_schemas\s+enable\s+row\s+level\s+security/i, 'reference_schemas enables RLS');
    expectSql(sql, /alter\s+table\s+public\.reference_schemas\s+force\s+row\s+level\s+security/i, 'reference_schemas forces RLS');
    expectSql(sql, /create\s+policy[\s\S]{0,260}on\s+public\.reference_schemas[\s\S]{0,400}org_id\s*=\s*app\.current_org_id\s*\(\s*\)/i, 'reference_schemas policy scopes org_id with app.current_org_id()');
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationSuite('schema metadata migration behavior (requires DATABASE_URL)', () => {
  let adminPool: PgPool;
  let appPool: PgPool;

  runIntegrationTest('rejects invalid data_type/tier and hides other-org reference_schemas rows from app_user', async () => {
    const { getOwnerConnection, getAppConnection } = await import('../test-utils/test-pool.js');
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    try {
      const orgA = '55555555-5555-4555-8555-555555555555';
      const orgB = '66666666-6666-4666-8666-666666666666';
      const sessionToken = '77777777-7777-4777-8777-777777777777';

      for (const filePath of migrationFiles()) {
        await adminPool.query(readFileSync(filePath, 'utf8'));
      }
      await adminPool.query(`insert into public.organizations (id, slug, name) values ($1, 'schema-meta-a', 'Schema Meta A'), ($2, 'schema-meta-b', 'Schema Meta B') on conflict (id) do nothing`, [orgA, orgB]);

      await expect(
        adminPool.query(`insert into public.reference_schemas (org_id, table_code, column_code, data_type, tier, storage) values ($1, 'main_table', 'bad_type', 'json', 'L2', 'ext_jsonb')`, [orgA]),
      ).rejects.toThrow(/check|constraint/i);
      await expect(
        adminPool.query(`insert into public.reference_schemas (org_id, table_code, column_code, data_type, tier, storage) values ($1, 'main_table', 'bad_tier', 'text', 'enterprise', 'ext_jsonb')`, [orgA]),
      ).rejects.toThrow(/check|constraint/i);

      await adminPool.query(`insert into public.reference_schemas (org_id, table_code, column_code, data_type, tier, storage) values ($1, 'main_table', 'visible', 'text', 'L2', 'ext_jsonb'), ($2, 'main_table', 'hidden', 'text', 'L2', 'ext_jsonb')`, [orgA, orgB]);
      await adminPool.query(`insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id`, [sessionToken, orgA]);

      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
        const rows = await client.query<{ column_code: string }>(`select column_code from public.reference_schemas order by column_code`);
        expect(rows.rows.map((row) => row.column_code)).toEqual(['visible']);
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    } finally {
      await appPool?.end();
      await adminPool?.end();
    }
  });
});
