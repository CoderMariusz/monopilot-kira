import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const tenantL2SchemaPath = resolve(packageRoot, 'schema/tenant-l2.ts');

let dbClient: pg.PoolClient;
let schemaName = 'public';
let closePool: (() => Promise<void>) | undefined;
let tenantL2MigrationFile: string | undefined;
let tenantL2MigrationSql: string | undefined;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function schemaScopedSql(sql: string): string {
  return sql.split('public.').join(`${schemaName}.`);
}

function findTenantL2MigrationFile(): string | undefined {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .find((file) => {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      return (
        sql.includes('tenant_variations') &&
        sql.includes('tenant_migrations') &&
        sql.includes('force_scheduled') &&
        sql.includes('scheduled_by')
      );
    });
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await dbClient.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    )`,
    [schemaName, tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function expectTableExists(tableName: string): Promise<void> {
  const exists = await tableExists(tableName);
  expect(exists, `${tableName} should exist after the tenant L2 migration is applied`).toBe(true);
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
};

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'CHECK' | 'UNIQUE' | string;
  definition: string;
};

async function listTenantL2Columns(): Promise<ColumnRow[]> {
  const result = await dbClient.query<ColumnRow>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name IN ('tenant_variations', 'tenant_migrations')
     ORDER BY table_name, ordinal_position`,
    [schemaName],
  );
  return result.rows;
}

async function listTenantL2Constraints(): Promise<ConstraintRow[]> {
  const result = await dbClient.query<ConstraintRow>(
    `SELECT
       cls.relname AS table_name,
       con.conname AS constraint_name,
       CASE con.contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'c' THEN 'CHECK'
         ELSE con.contype::text
       END AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con
     JOIN pg_class cls ON cls.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
     WHERE nsp.nspname = $1
       AND cls.relname IN ('tenant_variations', 'tenant_migrations')
     ORDER BY cls.relname, con.conname`,
    [schemaName],
  );
  return result.rows;
}

function columnsFor(columns: ColumnRow[], tableName: string): Map<string, ColumnRow> {
  return new Map(columns.filter((column) => column.table_name === tableName).map((column) => [column.column_name, column]));
}

async function createTenantOrgAndUser(): Promise<{ tenantId: string; orgId: string; userId: string }> {
  const tenantId = randomUUID();
  const orgId = randomUUID();
  const userId = randomUUID();

  await dbClient.query(
    `INSERT INTO ${quoteIdentifier(schemaName)}.tenants (id, name, region_cluster, data_plane_url)
     VALUES ($1, $2, 'eu', $3)`,
    [tenantId, `tenant-${tenantId.slice(0, 8)}`, 'https://example.com'],
  );
  await dbClient.query(
    `INSERT INTO ${quoteIdentifier(schemaName)}.organizations (id, tenant_id, name, industry_code)
     VALUES ($1, $2, $3, 'generic')`,
    [orgId, tenantId, `org-${orgId.slice(0, 8)}`],
  );
  await dbClient.query(
    `INSERT INTO ${quoteIdentifier(schemaName)}.users (id, org_id, email)
     VALUES ($1, $2, $3)`,
    [userId, orgId, `user-${userId.slice(0, 8)}@example.com`],
  );

  return { tenantId, orgId, userId };
}

beforeAll(async () => {
  tenantL2MigrationFile = findTenantL2MigrationFile();
  tenantL2MigrationSql = tenantL2MigrationFile ? readFileSync(resolve(migrationsDir, tenantL2MigrationFile), 'utf8') : undefined;

  if (!hasDatabaseUrl) {
    return;
  }

  const pool = getOwnerConnection();
  closePool = async () => {
    await pool.end();
  };

  dbClient = await pool.connect();
  schemaName = `ci_tenant_l2_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)};`);
  await dbClient.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public;`);

  await dbClient.query(schemaScopedSql(readFileSync(baselineMigrationPath, 'utf8')));

  if (tenantL2MigrationSql) {
    await dbClient.query(schemaScopedSql(tenantL2MigrationSql));
  }
});

afterAll(async () => {
  if (dbClient) {
    try {
      await dbClient.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE;`);
    } finally {
      dbClient.release();
    }
  }

  if (closePool) {
    await closePool();
  }
});

describe('tenant L2 Drizzle schema contract', () => {
  it('exports tenantVariations and tenantMigrations from packages/db/schema/tenant-l2.ts', async () => {
    const schemaExists = existsSync(tenantL2SchemaPath);
    expect(schemaExists, 'packages/db/schema/tenant-l2.ts should define the ADR-031 Drizzle tables').toBe(true);
    if (!schemaExists) {
      return;
    }

    const tenantL2Schema = (await import(pathToFileURL(tenantL2SchemaPath).href)) as Record<string, unknown>;
    expect(tenantL2Schema.tenantVariations).toBeDefined();
    expect(tenantL2Schema.tenantMigrations).toBeDefined();
  });
});

describe('tenant L2 migration SQL contract', () => {
  it('appends tenant_variations with PRIMARY KEY (org_id) and ON DELETE CASCADE to organizations', () => {
    expect(tenantL2MigrationFile, 'a new migration should define tenant_variations and tenant_migrations').toBeDefined();
    const migrationSql = (tenantL2MigrationSql ?? '').toLowerCase().replace(/\s+/g, ' ');

    expect(migrationSql).toContain('tenant_variations');
    expect(migrationSql).toMatch(/org_id\s+uuid\s+primary key/);
    expect(migrationSql).toMatch(/references\s+(public\.)?organizations\s*\(\s*id\s*\)\s+on delete cascade/);
  });

  it('appends tenant_migrations with numeric canary_pct, scheduled_by FK, and exact status CHECK values', () => {
    expect(tenantL2MigrationFile, 'a new migration should define tenant_variations and tenant_migrations').toBeDefined();
    const migrationSql = (tenantL2MigrationSql ?? '').toLowerCase().replace(/\s+/g, ' ');

    expect(migrationSql).toContain('tenant_migrations');
    expect(migrationSql).toMatch(/canary_pct\s+numeric\b/);
    expect(migrationSql).toMatch(/scheduled_by\s+uuid\s+references\s+(public\.)?users\s*\(\s*id\s*\)/);
    for (const status of ['scheduled', 'canary', 'progressive', 'completed', 'rolled_back', 'force_scheduled']) {
      expect(migrationSql, `status CHECK should include ${status}`).toContain(status);
    }
  });
});

describe('tenant L2 migration contract (ADR-031)', () => {
  runIntegrationTest('creates tenant_variations and tenant_migrations with org_id scope and required constraints', async () => {
    expect(tenantL2MigrationFile, 'migration should append tenant_variations and tenant_migrations, including force_scheduled status').toBeDefined();

    const columns = await listTenantL2Columns();
    const tableNames = new Set(columns.map((column) => column.table_name));
    expect(tableNames).toEqual(new Set(['tenant_variations', 'tenant_migrations']));

    const variationColumns = columnsFor(columns, 'tenant_variations');
    expect(variationColumns.get('org_id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(variationColumns.get('dept_overrides')).toMatchObject({ data_type: 'jsonb' });
    expect(variationColumns.get('rule_variant_overrides')).toMatchObject({ data_type: 'jsonb' });
    expect(variationColumns.get('feature_flags')).toMatchObject({ data_type: 'jsonb' });

    const migrationColumns = columnsFor(columns, 'tenant_migrations');
    expect(migrationColumns.get('id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(migrationColumns.get('org_id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(migrationColumns.get('component')).toMatchObject({ data_type: 'text', is_nullable: 'NO' });
    expect(migrationColumns.get('current_version')).toMatchObject({ data_type: 'text', is_nullable: 'NO' });
    expect(migrationColumns.get('target_version')).toMatchObject({ data_type: 'text', is_nullable: 'NO' });
    expect(migrationColumns.get('status')).toMatchObject({ data_type: 'text', is_nullable: 'NO' });
    expect(migrationColumns.get('canary_pct')).toMatchObject({ data_type: 'numeric' });
    expect(migrationColumns.get('scheduled_by')).toMatchObject({ data_type: 'uuid' });

    const constraints = await listTenantL2Constraints();
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: 'tenant_variations',
          constraint_type: 'PRIMARY KEY',
          definition: expect.stringMatching(/PRIMARY KEY \(org_id\)/),
        }),
        expect.objectContaining({
          table_name: 'tenant_variations',
          constraint_type: 'FOREIGN KEY',
          definition: expect.stringMatching(/FOREIGN KEY \(org_id\).*organizations\(id\).*ON DELETE CASCADE/),
        }),
        expect.objectContaining({
          table_name: 'tenant_migrations',
          constraint_type: 'FOREIGN KEY',
          definition: expect.stringMatching(/FOREIGN KEY \(scheduled_by\).*users\(id\)/),
        }),
      ]),
    );
  });

  runIntegrationTest('rejects tenant_migrations.status values outside scheduled/canary/progressive/completed/rolled_back/force_scheduled', async () => {
    await expectTableExists('tenant_migrations');

    const constraints = await listTenantL2Constraints();
    const statusCheck = constraints.find(
      (constraint) =>
        constraint.table_name === 'tenant_migrations' &&
        constraint.constraint_type === 'CHECK' &&
        constraint.definition.includes('status'),
    );
    expect(statusCheck, 'tenant_migrations.status CHECK constraint should exist').toBeDefined();
    const statusCheckSql = statusCheck?.definition.toLowerCase() ?? '';
    for (const status of ['scheduled', 'canary', 'progressive', 'completed', 'rolled_back', 'force_scheduled']) {
      expect(statusCheckSql, `status CHECK should allow ${status}`).toContain(status);
    }
    for (const status of ['idle', 'pending', 'running', 'succeeded', 'failed']) {
      expect(statusCheckSql, `status CHECK should not allow old status ${status}`).not.toContain(status);
    }

    const { orgId, userId } = await createTenantOrgAndUser();
    const invalidInsert = dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
       (org_id, component, current_version, target_version, status, canary_pct, scheduled_by)
       VALUES ($1, 'rule_engine', 'v1', 'v2', 'not_a_valid_status', 10.5, $2)`,
      [orgId, userId],
    );

    await expect(invalidInsert).rejects.toMatchObject({ code: '23514' });
  });

  runIntegrationTest('cascades tenant_variations when the owning organization is deleted', async () => {
    await expectTableExists('tenant_variations');

    const { orgId } = await createTenantOrgAndUser();
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_variations (org_id)
       VALUES ($1)`,
      [orgId],
    );

    await dbClient.query(`DELETE FROM ${quoteIdentifier(schemaName)}.organizations WHERE id = $1`, [orgId]);

    const result = await dbClient.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM ${quoteIdentifier(schemaName)}.tenant_variations
       WHERE org_id = $1`,
      [orgId],
    );
    expect(Number(result.rows[0]?.count ?? '0')).toBe(0);
  });
});
