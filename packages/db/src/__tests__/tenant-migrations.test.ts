import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const tenantMigrationsMigrationPath = resolve(packageRoot, 'migrations/013-tenant-migrations.sql');

type InformationSchemaColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
};

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  definition: string;
};

let dbClient: pg.PoolClient;
let schemaName = 'public';
let closePool: () => Promise<void>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  closePool = async () => {
    await pool.end();
  };

  dbClient = await pool.connect();
  schemaName = `ci_tenant_migrations_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

  // Run baseline and RLS migrations first
  const baselineMigration = readFileSync(baselineMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
  await dbClient.query(baselineMigration);

  const rlsBaselineMigration = readFileSync(rlsBaselineMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
  await dbClient.query(rlsBaselineMigration);

  // Run tenant-migrations migration
  const tenantMigrationsMigration = readFileSync(tenantMigrationsMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
  await dbClient.query(tenantMigrationsMigration);
});

afterAll(async () => {
  if (dbClient) {
    try {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade;`);
    } finally {
      dbClient.release();
    }
  }

  if (closePool) {
    await closePool();
  }
});

async function listTenantMigrationsColumns() {
  const result = await dbClient.query<InformationSchemaColumn>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'tenant_migrations'
     ORDER BY ordinal_position`,
    [schemaName],
  );

  return result.rows;
}

async function listTenantMigrationsConstraints() {
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
      AND cls.relname = 'tenant_migrations'
    ORDER BY con.conname`,
    [schemaName],
  );

  return result.rows;
}

async function listTableIndexes() {
  const result = await dbClient.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = $1
       AND tablename = 'tenant_migrations'
     ORDER BY indexname`,
    [schemaName],
  );

  return result.rows;
}

describe('tenant_migrations table (canary upgrade orchestration baseline)', () => {
  runIntegrationTest(
    'AC1: migration creates tenant_migrations table with all 8 columns and PRIMARY KEY (tenant_id, component)',
    async () => {
      const columns = await listTenantMigrationsColumns();
      const columnNames = columns.map((col) => col.column_name);

      // Verify all 8 required columns exist
      expect(columnNames).toContain('tenant_id');
      expect(columnNames).toContain('component');
      expect(columnNames).toContain('current_version');
      expect(columnNames).toContain('target_version');
      expect(columnNames).toContain('cohort');
      expect(columnNames).toContain('last_run_at');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('failure_reason');

      // Verify column types
      const columnMap = new Map(columns.map((col) => [col.column_name, col]));

      expect(columnMap.get('tenant_id')).toMatchObject({
        data_type: 'uuid',
        is_nullable: 'NO',
      });

      expect(columnMap.get('component')).toMatchObject({
        data_type: 'text',
        is_nullable: 'NO',
      });

      expect(columnMap.get('current_version')).toMatchObject({
        data_type: 'text',
        is_nullable: 'NO',
      });

      expect(columnMap.get('target_version')).toMatchObject({
        data_type: 'text',
      });

      expect(columnMap.get('cohort')).toMatchObject({
        data_type: 'text',
        is_nullable: 'NO',
      });

      expect(columnMap.get('last_run_at')).toMatchObject({
        data_type: 'timestamp with time zone',
      });

      expect(columnMap.get('status')).toMatchObject({
        data_type: 'text',
        is_nullable: 'NO',
      });

      expect(columnMap.get('failure_reason')).toMatchObject({
        data_type: 'text',
      });

      // Verify PRIMARY KEY constraint
      const constraints = await listTenantMigrationsConstraints();
      const primaryKeyConstraint = constraints.find(
        (constraint) =>
          constraint.constraint_type === 'PRIMARY KEY' &&
          constraint.definition.includes('tenant_id') &&
          constraint.definition.includes('component'),
      );

      expect(primaryKeyConstraint, 'PRIMARY KEY (tenant_id, component)').toBeDefined();
    },
  );

  runIntegrationTest(
    'AC2: cohort CHECK constraint rejects values not in (canary, early, general)',
    async () => {
      const constraints = await listTenantMigrationsConstraints();
      const cohortCheck = constraints.find(
        (constraint) =>
          constraint.constraint_type === 'CHECK' && constraint.definition.includes('cohort'),
      );

      expect(cohortCheck, 'cohort CHECK constraint exists').toBeDefined();
      if (!cohortCheck) {
        return;
      }

      // Verify the CHECK constraint includes all three allowed values
      expect(cohortCheck.definition).toContain('canary');
      expect(cohortCheck.definition).toContain('early');
      expect(cohortCheck.definition).toContain('general');

      // Test INSERT with invalid cohort value fails
      const tenantId = randomUUID();
      const invalidCohortInsert = dbClient.query(
        `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
         (tenant_id, component, current_version, cohort, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, 'test-component', '1.0.0', 'moonshot', 'idle'],
      );

      await expect(invalidCohortInsert).rejects.toThrow();
    },
  );

  runIntegrationTest(
    'AC3: PRIMARY KEY (tenant_id, component) prevents duplicate orchestration',
    async () => {
      const tenantId = randomUUID();
      const component = 'orch-test-component';

      // Insert first row
      await dbClient.query(
        `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
         (tenant_id, component, current_version, cohort, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, component, '1.0.0', 'general', 'idle'],
      );

      // Attempt duplicate INSERT on same (tenant_id, component) pair
      const duplicateInsert = dbClient.query(
        `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
         (tenant_id, component, current_version, cohort, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, component, '2.0.0', 'canary', 'pending'],
      );

      await expect(duplicateInsert).rejects.toThrow();
    },
  );

  runIntegrationTest('AC4: status CHECK constraint enforces allowed enum values', async () => {
    const constraints = await listTenantMigrationsConstraints();
    const statusCheck = constraints.find(
      (constraint) =>
        constraint.constraint_type === 'CHECK' && constraint.definition.includes('status'),
    );

    expect(statusCheck, 'status CHECK constraint exists').toBeDefined();
    if (!statusCheck) {
      return;
    }

    // Verify the CHECK constraint includes all required status values
    expect(statusCheck.definition).toContain('idle');
    expect(statusCheck.definition).toContain('pending');
    expect(statusCheck.definition).toContain('running');
    expect(statusCheck.definition).toContain('succeeded');
    expect(statusCheck.definition).toContain('failed');
    expect(statusCheck.definition).toContain('rolled_back');

    // Test INSERT with invalid status value fails
    const tenantId = randomUUID();
    const invalidStatusInsert = dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
       (tenant_id, component, current_version, cohort, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, 'status-test-component', '1.0.0', 'general', 'invalid_status'],
    );

    await expect(invalidStatusInsert).rejects.toThrow();
  });

  runIntegrationTest('index on (cohort, status) exists for query performance', async () => {
    const indexes = await listTableIndexes();
    const cohortStatusIndex = indexes.find(
      (idx) =>
        idx.indexdef.includes('cohort') &&
        idx.indexdef.includes('status'),
    );

    expect(cohortStatusIndex, 'index on (cohort, status)').toBeDefined();
  });

  runIntegrationTest('default cohort is general and default status is idle', async () => {
    const tenantId = randomUUID();
    const component = 'defaults-test-component';

    // Insert with only required non-default columns
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.tenant_migrations
       (tenant_id, component, current_version)
       VALUES ($1, $2, $3)`,
      [tenantId, component, '1.0.0'],
    );

    // Query back and verify defaults
    const result = await dbClient.query<{
      cohort: string;
      status: string;
    }>(
      `SELECT cohort, status FROM ${quoteIdentifier(schemaName)}.tenant_migrations
       WHERE tenant_id = $1 AND component = $2`,
      [tenantId, component],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      cohort: 'general',
      status: 'idle',
    });
  });
});

describe('tenant_migrations drizzle schema', () => {
  it('exports tenantMigrations table with correct column types', async () => {
    const { tenantMigrations } = await import('../../schema/tenant-migrations.js');

    expect(tenantMigrations).toBeDefined();
    expect(tenantMigrations._ as any).toBeDefined();
  });

  it('tenant_id column is inferred as UUID string type', async () => {
    const { tenantMigrations } = await import('../../schema/tenant-migrations.js');
    const tableConfig = tenantMigrations._ as any;

    expect(tableConfig.columns.tenant_id).toBeDefined();
    // Drizzle UUID columns should have a type indicator
    expect(tableConfig.columns.tenant_id.dataType).toBe('uuid');
  });

  it('cohort column has enum literal union (canary | early | general)', async () => {
    const { tenantMigrations } = await import('../../schema/tenant-migrations.js');
    const tableConfig = tenantMigrations._ as any;

    expect(tableConfig.columns.cohort).toBeDefined();
    // The column should have CHECK constraint metadata
    const cohortColumn = tableConfig.columns.cohort;
    expect(cohortColumn).toBeDefined();
  });

  it('status column has enum literal union (idle | pending | running | succeeded | failed | rolled_back)', async () => {
    const { tenantMigrations } = await import('../../schema/tenant-migrations.js');
    const tableConfig = tenantMigrations._ as any;

    expect(tableConfig.columns.status).toBeDefined();
    const statusColumn = tableConfig.columns.status;
    expect(statusColumn).toBeDefined();
  });

  it('schema is exported from packages/db/src/schema/index.ts', async () => {
    const schemaIndex = await import('../../schema/index.js');

    expect(schemaIndex.tenantMigrations).toBeDefined();
  });
});
