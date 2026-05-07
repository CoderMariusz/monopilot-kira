import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');

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

  const pool = getOwnerConnection();
  closePool = async () => {
    await pool.end();
  };

  dbClient = await pool.connect();
  schemaName = `ci_baseline_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

  const migration = readFileSync(baselineMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
  await dbClient.query(migration);
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

async function listBaselineColumns() {
  const result = await dbClient.query<InformationSchemaColumn>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name IN ('tenants', 'organizations', 'users')
     ORDER BY table_name, ordinal_position`,
    [schemaName],
  );

  return result.rows;
}

async function listBaselineConstraints() {
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
      AND cls.relname IN ('tenants', 'organizations', 'users')
    ORDER BY cls.relname, con.conname`,
    [schemaName],
  );

  return result.rows;
}

function columnsFor(columns: InformationSchemaColumn[], tableName: string) {
  return columns.filter((column) => column.table_name === tableName);
}

function columnMap(columns: InformationSchemaColumn[], tableName: string) {
  return new Map(columnsFor(columns, tableName).map((column) => [column.column_name, column]));
}

describe('baseline tenant/control-plane and org-scoped schema migration', () => {
  runIntegrationTest('creates tenants, organizations, and users with organizations.id as the org identifier and users.org_id required', async () => {
    const columns = await listBaselineColumns();
    const tableNames = new Set(columns.map((column) => column.table_name));

    expect(tableNames).toEqual(new Set(['tenants', 'organizations', 'users']));

    const organizationColumns = columnMap(columns, 'organizations');
    expect(organizationColumns.get('id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });

    const userColumns = columnMap(columns, 'users');
    expect(userColumns.get('org_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
  });

  runIntegrationTest('keeps tenant_id out of org-scoped users while allowing only organizations.tenant_id as the control-plane parent', async () => {
    const columns = await listBaselineColumns();
    const organizationColumns = columnMap(columns, 'organizations');
    const userColumns = columnMap(columns, 'users');

    expect(organizationColumns.get('tenant_id')).toMatchObject({
      data_type: 'uuid',
    });
    expect(userColumns.has('tenant_id')).toBe(false);
    expect(userColumns.get('org_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
  });

  runIntegrationTest('enforces region, industry, org ownership, and per-org email constraints at the database level', async () => {
    const constraints = await listBaselineConstraints();

    const organizationIndustryCheck = constraints.find(
      (constraint) =>
        constraint.table_name === 'organizations' &&
        constraint.constraint_type === 'CHECK' &&
        constraint.definition.includes('industry_code'),
    );
    expect(organizationIndustryCheck, 'organizations.industry_code CHECK constraint').toBeDefined();
    if (!organizationIndustryCheck) {
      return;
    }
    expect(organizationIndustryCheck.definition).toContain("'bakery'");
    expect(organizationIndustryCheck.definition).toContain("'pharma'");
    expect(organizationIndustryCheck.definition).toContain("'fmcg'");
    expect(organizationIndustryCheck.definition).toContain("'generic'");

    const tenantRegionCheck = constraints.find(
      (constraint) =>
        constraint.table_name === 'tenants' &&
        constraint.constraint_type === 'CHECK' &&
        constraint.definition.includes('region_cluster'),
    );
    expect(tenantRegionCheck, 'tenants.region_cluster CHECK constraint').toBeDefined();
    if (!tenantRegionCheck) {
      return;
    }
    expect(tenantRegionCheck.definition).toContain("'eu'");
    expect(tenantRegionCheck.definition).toContain("'us'");

    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: 'organizations',
          constraint_type: 'FOREIGN KEY',
          definition: expect.stringContaining('tenant_id'),
        }),
        expect.objectContaining({
          table_name: 'users',
          constraint_type: 'FOREIGN KEY',
          definition: expect.stringContaining('org_id'),
        }),
        expect.objectContaining({
          table_name: 'users',
          constraint_type: 'UNIQUE',
          definition: expect.stringMatching(/org_id.*email|email.*org_id/),
        }),
      ]),
    );
  });

  runIntegrationTest('asserts R13 identity/audit columns on organizations and users', async () => {
    const columns = await listBaselineColumns();
    const organizationColumnNames = columnsFor(columns, 'organizations').map((column) => column.column_name);
    const userColumnNames = columnsFor(columns, 'users').map((column) => column.column_name);

    expect(organizationColumnNames).toEqual(
      expect.arrayContaining([
        'id',
        'external_id',
        'created_at',
        'created_by_user',
        'created_by_device',
        'app_version',
        'model_prediction_id',
        'epcis_event_id',
        'schema_version',
      ]),
    );
    expect(userColumnNames).toEqual(
      expect.arrayContaining([
        'id',
        'org_id',
        'external_id',
        'created_at',
        'created_by_user',
        'created_by_device',
        'app_version',
        'model_prediction_id',
        'epcis_event_id',
        'schema_version',
      ]),
    );
  });
});
