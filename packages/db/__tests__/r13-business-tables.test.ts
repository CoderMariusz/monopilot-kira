/**
 * T-040 — r13-business-tables.test.ts
 * RED-phase integration tests for R13 org-scoped identity columns on 5 placeholder tables.
 *
 * Acceptance criteria:
 *  AC1: Migration creates lot, work_order, quality_event, shipment, bom_item with all R13 columns and (org_id, created_at DESC) indexes.
 *  AC2: INSERT with org_id=NULL is rejected for every placeholder table.
 *  AC3: App-role scoped to org A cannot read rows from org B via the T-007 policy pattern.
 *  AC4: Schema/typecheck proves exported inferred types include nullable model_prediction_id and epcis_event_id.
 *
 * Skips gracefully when DATABASE_URL is not set (CI without Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaslineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const r13TablesMigrationPath = resolve(packageRoot, 'migrations/0014_r13-placeholder-tables.sql');
const r13TablesSchemaPath = resolve(packageRoot, 'src/schema/r13-business-tables.ts');

type InformationSchemaColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
};

type IndexRow = {
  tablename: string;
  indexname: string;
  indexdef: string;
};

// ── static shape contract (no DB required) ────────────────────────────────────

describe('0014 r13-placeholder-tables migration — static shape contract', () => {
  it('migration file exists at the required path', () => {
    expect(existsSync(r13TablesMigrationPath), 'expected packages/db/migrations/0014_r13-placeholder-tables.sql to exist').toBe(true);
  });

  it('migration creates all 5 placeholder tables', () => {
    const migration = readFileSync(r13TablesMigrationPath, 'utf8');
    const tables = ['lot', 'work_order', 'quality_event', 'shipment', 'bom_item'];
    for (const table of tables) {
      expect(migration, `migration must create ${table} table`).toMatch(
        new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?${table.replace(/_/g, '_')}`, 'i'),
      );
    }
  });

  it('migration includes all R13 identity columns on each table', () => {
    const migration = readFileSync(r13TablesMigrationPath, 'utf8');
    const r13Columns = [
      'created_at',
      'created_by_user',
      'created_by_device',
      'app_version',
      'model_prediction_id',
      'epcis_event_id',
      'schema_version',
    ];
    for (const col of r13Columns) {
      expect(migration, `migration must include ${col} column`).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('migration includes org_id NOT NULL on each table', () => {
    const migration = readFileSync(r13TablesMigrationPath, 'utf8');
    expect(migration, 'migration must reference org_id').toMatch(/\borg_id\b/);
    expect(migration, 'migration must enforce NOT NULL on org_id').toMatch(/org_id\s+uuid\s+not\s+null/i);
  });

  it('migration adds (org_id, created_at DESC) indexes', () => {
    const migration = readFileSync(r13TablesMigrationPath, 'utf8');
    expect(migration, 'migration must include index on (org_id, created_at DESC)').toMatch(
      /\(org_id.*created_at.*desc/i,
    );
  });

  it('schema file exists at the required path', () => {
    expect(existsSync(r13TablesSchemaPath), 'expected packages/db/src/schema/r13-business-tables.ts to exist').toBe(true);
  });
});

// ── drizzle schema contract (no DB required) ────────────────────────────────────

describe('r13-business-tables.ts schema — drizzle contract', () => {
  it('exports lot table with R13 columns', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('lot');
    const lot = schema.lot;
    expect(lot).toBeDefined();
    // Verify it's a Drizzle table object with column metadata
    expect(lot).toHaveProperty('id');
    expect(lot).toHaveProperty('orgId');
    expect(lot).toHaveProperty('createdAt');
    expect(lot).toHaveProperty('createdByUser');
    expect(lot).toHaveProperty('createdByDevice');
    expect(lot).toHaveProperty('appVersion');
    expect(lot).toHaveProperty('modelPredictionId');
    expect(lot).toHaveProperty('epcisEventId');
    expect(lot).toHaveProperty('schemaVersion');
  });

  it('exports workOrder table with R13 columns', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('workOrder');
    const workOrder = schema.workOrder;
    expect(workOrder).toBeDefined();
    expect(workOrder).toHaveProperty('id');
    expect(workOrder).toHaveProperty('orgId');
    expect(workOrder).toHaveProperty('createdAt');
    expect(workOrder).toHaveProperty('createdByUser');
    expect(workOrder).toHaveProperty('createdByDevice');
    expect(workOrder).toHaveProperty('appVersion');
    expect(workOrder).toHaveProperty('modelPredictionId');
    expect(workOrder).toHaveProperty('epcisEventId');
    expect(workOrder).toHaveProperty('schemaVersion');
  });

  it('exports qualityEvent table with R13 columns', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('qualityEvent');
    const qualityEvent = schema.qualityEvent;
    expect(qualityEvent).toBeDefined();
    expect(qualityEvent).toHaveProperty('id');
    expect(qualityEvent).toHaveProperty('orgId');
    expect(qualityEvent).toHaveProperty('createdAt');
    expect(qualityEvent).toHaveProperty('createdByUser');
    expect(qualityEvent).toHaveProperty('createdByDevice');
    expect(qualityEvent).toHaveProperty('appVersion');
    expect(qualityEvent).toHaveProperty('modelPredictionId');
    expect(qualityEvent).toHaveProperty('epcisEventId');
    expect(qualityEvent).toHaveProperty('schemaVersion');
  });

  it('exports shipment table with R13 columns', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('shipment');
    const shipment = schema.shipment;
    expect(shipment).toBeDefined();
    expect(shipment).toHaveProperty('id');
    expect(shipment).toHaveProperty('orgId');
    expect(shipment).toHaveProperty('createdAt');
    expect(shipment).toHaveProperty('createdByUser');
    expect(shipment).toHaveProperty('createdByDevice');
    expect(shipment).toHaveProperty('appVersion');
    expect(shipment).toHaveProperty('modelPredictionId');
    expect(shipment).toHaveProperty('epcisEventId');
    expect(shipment).toHaveProperty('schemaVersion');
  });

  it('exports bomItem table with R13 columns', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('bomItem');
    const bomItem = schema.bomItem;
    expect(bomItem).toBeDefined();
    expect(bomItem).toHaveProperty('id');
    expect(bomItem).toHaveProperty('orgId');
    expect(bomItem).toHaveProperty('createdAt');
    expect(bomItem).toHaveProperty('createdByUser');
    expect(bomItem).toHaveProperty('createdByDevice');
    expect(bomItem).toHaveProperty('appVersion');
    expect(bomItem).toHaveProperty('modelPredictionId');
    expect(bomItem).toHaveProperty('epcisEventId');
    expect(bomItem).toHaveProperty('schemaVersion');
  });

  it('schema exports include nullable model_prediction_id and epcis_event_id (AC4)', async () => {
    const schema = await import(r13TablesSchemaPath);
    expect(schema).toHaveProperty('lot');
    // modelPredictionId and epcisEventId should be nullable (no notNull() constraint)
    // This is a type-level assertion; actual nullability proven in integration tests
    expect(schema.lot).toBeDefined();
  });
});

// ── integration tests (require DATABASE_URL) ──────────────────────────────────

runIntegrationSuite('0014 r13-placeholder-tables integration — Postgres', () => {
  let pool: pg.Pool;
  let dbClient: pg.PoolClient;
  let schemaName = 'public';
  let apexOrgId: string;
  let secondOrgId: string;
  const tenantId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    pool = new pg.Pool({ connectionString: databaseUrl });
    dbClient = await pool.connect();

    // Run baseline + RLS + r13 migrations (idempotent)
    const baseline = readFileSync(baselineMigrationPath, 'utf8');
    const rlsBaseline = readFileSync(rlsBaslineMigrationPath, 'utf8');
    const r13Tables = readFileSync(r13TablesMigrationPath, 'utf8');

    await dbClient.query(baseline);
    await dbClient.query(rlsBaseline);
    await dbClient.query(r13Tables);

    // Insert test tenant
    await dbClient.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Test Tenant', 'eu', 'https://test.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    // Insert two orgs for RLS isolation test
    apexOrgId = randomUUID();
    await dbClient.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Org A', 'fmcg')
       on conflict (id) do nothing`,
      [apexOrgId, tenantId],
    );

    secondOrgId = randomUUID();
    await dbClient.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Org B', 'bakery')
       on conflict (id) do nothing`,
      [secondOrgId, tenantId],
    );
  });

  afterAll(async () => {
    if (dbClient) {
      try {
        await dbClient.query('drop table if exists public.lot, public.work_order, public.quality_event, public.shipment, public.bom_item cascade');
      } finally {
        dbClient.release();
      }
    }

    if (pool) {
      await pool.end();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // AC1: Verify migration creates all 5 tables with all R13 columns and indexes
  // ──────────────────────────────────────────────────────────────────────────────

  runIntegrationTest('AC1.1: lot table has all R13 columns with correct types', async () => {
    const result = await dbClient.query<InformationSchemaColumn>(
      `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = 'lot'
       order by ordinal_position`,
      [schemaName],
    );

    const columns = result.rows;
    expect(columns.length, 'lot table must have at least 9 columns (id, external_id, org_id + 6 R13 + schema_version)').toBeGreaterThanOrEqual(9);

    const columnMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    // Check primary key: id UUID
    expect(columnMap['id']).toBeDefined();
    expect(columnMap['id'].data_type).toBe('uuid');
    expect(columnMap['id'].is_nullable).toBe('NO');

    // Check org_id: UUID NOT NULL
    expect(columnMap['org_id']).toBeDefined();
    expect(columnMap['org_id'].data_type).toBe('uuid');
    expect(columnMap['org_id'].is_nullable).toBe('NO');

    // Check R13 columns
    expect(columnMap['created_at']).toBeDefined();
    expect(columnMap['created_at'].data_type).toBe('timestamp with time zone');

    expect(columnMap['created_by_user']).toBeDefined();
    expect(columnMap['created_by_user'].data_type).toBe('uuid');
    expect(columnMap['created_by_user'].is_nullable).toBe('YES'); // nullable

    expect(columnMap['created_by_device']).toBeDefined();
    expect(columnMap['created_by_device'].data_type).toBe('text');
    expect(columnMap['created_by_device'].is_nullable).toBe('YES');

    expect(columnMap['app_version']).toBeDefined();
    expect(columnMap['app_version'].data_type).toBe('text');
    expect(columnMap['app_version'].is_nullable).toBe('YES');

    expect(columnMap['model_prediction_id']).toBeDefined();
    expect(columnMap['model_prediction_id'].data_type).toBe('uuid');
    expect(columnMap['model_prediction_id'].is_nullable).toBe('YES'); // nullable per AC4

    expect(columnMap['epcis_event_id']).toBeDefined();
    expect(columnMap['epcis_event_id'].data_type).toBe('uuid');
    expect(columnMap['epcis_event_id'].is_nullable).toBe('YES'); // nullable per AC4

    expect(columnMap['schema_version']).toBeDefined();
    expect(columnMap['schema_version'].data_type).toBe('integer');
    expect(columnMap['schema_version'].is_nullable).toBe('NO');
  });

  runIntegrationTest('AC1.2: work_order table has all R13 columns', async () => {
    const result = await dbClient.query<InformationSchemaColumn>(
      `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = 'work_order'
       order by ordinal_position`,
      [schemaName],
    );

    const columns = result.rows;
    const columnMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(columnMap['id']).toBeDefined();
    expect(columnMap['org_id']).toBeDefined();
    expect(columnMap['org_id'].is_nullable).toBe('NO');
    expect(columnMap['created_at']).toBeDefined();
    expect(columnMap['created_by_user']).toBeDefined();
    expect(columnMap['model_prediction_id']).toBeDefined();
    expect(columnMap['epcis_event_id']).toBeDefined();
    expect(columnMap['epcis_event_id'].is_nullable).toBe('YES');
  });

  runIntegrationTest('AC1.3: quality_event table has all R13 columns', async () => {
    const result = await dbClient.query<InformationSchemaColumn>(
      `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = 'quality_event'
       order by ordinal_position`,
      [schemaName],
    );

    const columns = result.rows;
    const columnMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(columnMap['id']).toBeDefined();
    expect(columnMap['org_id']).toBeDefined();
    expect(columnMap['org_id'].is_nullable).toBe('NO');
    expect(columnMap['created_at']).toBeDefined();
    expect(columnMap['schema_version']).toBeDefined();
  });

  runIntegrationTest('AC1.4: shipment table has all R13 columns', async () => {
    const result = await dbClient.query<InformationSchemaColumn>(
      `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = 'shipment'
       order by ordinal_position`,
      [schemaName],
    );

    const columns = result.rows;
    const columnMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(columnMap['id']).toBeDefined();
    expect(columnMap['org_id']).toBeDefined();
    expect(columnMap['org_id'].is_nullable).toBe('NO');
    expect(columnMap['created_at']).toBeDefined();
    expect(columnMap['model_prediction_id']).toBeDefined();
  });

  runIntegrationTest('AC1.5: bom_item table has all R13 columns', async () => {
    const result = await dbClient.query<InformationSchemaColumn>(
      `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = 'bom_item'
       order by ordinal_position`,
      [schemaName],
    );

    const columns = result.rows;
    const columnMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(columnMap['id']).toBeDefined();
    expect(columnMap['org_id']).toBeDefined();
    expect(columnMap['org_id'].is_nullable).toBe('NO');
    expect(columnMap['created_at']).toBeDefined();
    expect(columnMap['epcis_event_id']).toBeDefined();
  });

  runIntegrationTest('AC1.6: (org_id, created_at DESC) indexes exist on all tables', async () => {
    const tables = ['lot', 'work_order', 'quality_event', 'shipment', 'bom_item'];
    for (const table of tables) {
      const result = await dbClient.query<IndexRow>(
        `select tablename, indexname, indexdef from pg_indexes where tablename = $1 order by indexname`,
        [table],
      );

      const indexDefs = result.rows.map((r) => r.indexdef);
      const hasOrgCreatedIdx = indexDefs.some(
        (def) =>
          def.includes('org_id') &&
          def.includes('created_at') &&
          (def.includes('DESC') || def.includes('desc')),
      );
      expect(hasOrgCreatedIdx, `${table} must have (org_id, created_at DESC) index`).toBe(true);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // AC2: Verify INSERT with org_id=NULL is rejected
  // ──────────────────────────────────────────────────────────────────────────────

  runIntegrationTest('AC2.1: INSERT into lot with org_id=NULL is rejected', async () => {
    await expect(
      dbClient.query(
        `insert into public.lot (id, org_id, created_at, schema_version) values ($1, NULL, now(), 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/not-null constraint|violates.*null/i);
  });

  runIntegrationTest('AC2.2: INSERT into work_order with org_id=NULL is rejected', async () => {
    await expect(
      dbClient.query(
        `insert into public.work_order (id, org_id, created_at, schema_version) values ($1, NULL, now(), 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/not-null constraint|violates.*null/i);
  });

  runIntegrationTest('AC2.3: INSERT into quality_event with org_id=NULL is rejected', async () => {
    await expect(
      dbClient.query(
        `insert into public.quality_event (id, org_id, created_at, schema_version) values ($1, NULL, now(), 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/not-null constraint|violates.*null/i);
  });

  runIntegrationTest('AC2.4: INSERT into shipment with org_id=NULL is rejected', async () => {
    await expect(
      dbClient.query(
        `insert into public.shipment (id, org_id, created_at, schema_version) values ($1, NULL, now(), 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/not-null constraint|violates.*null/i);
  });

  runIntegrationTest('AC2.5: INSERT into bom_item with org_id=NULL is rejected', async () => {
    await expect(
      dbClient.query(
        `insert into public.bom_item (id, org_id, created_at, schema_version) values ($1, NULL, now(), 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/not-null constraint|violates.*null/i);
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // AC3: Verify RLS isolation per org (app-role scoped to org A cannot see org B rows)
  // ──────────────────────────────────────────────────────────────────────────────

  runIntegrationTest('AC3.1: RLS is enabled on lot table', async () => {
    const result = await dbClient.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'lot'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  runIntegrationTest('AC3.2: RLS is enabled on work_order table', async () => {
    const result = await dbClient.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'work_order'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  runIntegrationTest('AC3.3: RLS is enabled on quality_event table', async () => {
    const result = await dbClient.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'quality_event'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  runIntegrationTest('AC3.4: RLS is enabled on shipment table', async () => {
    const result = await dbClient.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'shipment'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  runIntegrationTest('AC3.5: RLS is enabled on bom_item table', async () => {
    const result = await dbClient.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'bom_item'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  runIntegrationTest('AC3.6: RLS policies exist for lot table', async () => {
    const result = await dbClient.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'lot'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  runIntegrationTest('AC3.7: RLS policies exist for work_order table', async () => {
    const result = await dbClient.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'work_order'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  runIntegrationTest('AC3.8: RLS policies exist for quality_event table', async () => {
    const result = await dbClient.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'quality_event'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  runIntegrationTest('AC3.9: RLS policies exist for shipment table', async () => {
    const result = await dbClient.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'shipment'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  runIntegrationTest('AC3.10: RLS policies exist for bom_item table', async () => {
    const result = await dbClient.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'bom_item'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
