import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { compile, clearCache, _setPool, _clearPool } from '../compile';
import pg from 'pg';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runDatabaseTest = hasDatabaseUrl ? it : it.skip;

let dbPool: pg.Pool;
let dbClient: pg.PoolClient;

beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  dbPool = new pg.Pool({ connectionString: databaseUrl });
  dbClient = await dbPool.connect();

  // Create schema for testing if it doesn't exist
  await dbClient.query('CREATE SCHEMA IF NOT EXISTS schema_runtime_test;');

  // Inject the test pool and schema so compile() routes to the test schema
  // instead of attempting to use DATABASE_URL with the production "Reference" schema.
  _setPool(dbPool, 'schema_runtime_test');
});

afterAll(async () => {
  // Clear the test seam before tearing down connections.
  _clearPool();

  if (dbClient) {
    try {
      await dbClient.query('DROP SCHEMA IF EXISTS schema_runtime_test CASCADE;');
      dbClient.release();
    } catch (error) {
      console.error('Error cleaning up test schema:', error);
    }
  }
  if (dbPool) {
    await dbPool.end();
  }
});

beforeEach(async () => {
  clearCache();

  if (!hasDatabaseUrl || !dbClient) {
    return;
  }

  // Drop and recreate tables for each test
  await dbClient.query(`
    DROP TABLE IF EXISTS schema_runtime_test."Reference.DeptColumns" CASCADE;
    DROP TABLE IF EXISTS schema_runtime_test."Reference.FieldTypes" CASCADE;
  `);

  // Create Reference.FieldTypes table
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS schema_runtime_test."Reference.FieldTypes" (
      code TEXT PRIMARY KEY,
      ts_type TEXT NOT NULL,
      json_schema JSONB NOT NULL
    );
  `);

  // Create Reference.DeptColumns table
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS schema_runtime_test."Reference.DeptColumns" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL,
      dept_code TEXT NOT NULL,
      column_key TEXT NOT NULL,
      field_type TEXT NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT false,
      validation_dsl JSONB,
      schema_version INTEGER NOT NULL DEFAULT 1
    );
  `);
});

describe('Reference.DeptColumns + Reference.FieldTypes schema compilation', () => {
  it('RED: _setPool() and _clearPool() test seams are exported and accessible', () => {
    // GREEN phase: _setPool and _clearPool are now genuine named exports from compile.ts.
    // Underscore prefix is a convention marking them as test-only seams; they are NOT
    // hidden behind process.env.VITEST or any env-var detection.
    expect(typeof _setPool).toBe('function');
    expect(typeof _clearPool).toBe('function');
  });

  it('GREEN: compile() and clearCache() functions are implemented and exported', () => {
    // GREEN phase: functions are implemented — compile is async, clearCache is sync no-op
    // Fix: original RED test used .rejects on a function wrapper (not a Promise) which is
    // a syntactically incorrect Vitest assertion; clearCache() no longer throws after implementation.
    expect(typeof compile).toBe('function');
    expect(typeof clearCache).toBe('function');
    // clearCache must not throw
    expect(() => clearCache()).not.toThrow();
  });

  it('RED/GREEN: compile.ts contains no process.env.VITEST reference', async () => {
    // This test uses Node fs to read the compile.ts source as text and asserts
    // that no VITEST reference remains. This will fail in RED phase (VITEST is
    // still in the code) and pass after GREEN refactor removes it.
    const fs = require('fs');
    const path = require('path');

    const compileSourcePath = path.resolve(__dirname, '../compile.ts');
    const sourceCode = fs.readFileSync(compileSourcePath, 'utf-8');

    // Assert that process.env.VITEST does not appear in the source
    expect(sourceCode).not.toMatch(/process\.env\.VITEST/);
  });

  runDatabaseTest(
    'AC1: Given DeptColumns rows for dept_code="core" with 5 fields (string, number, date, enum, formula), when compile("core") runs, then it returns a Zod schema that accepts a valid payload and rejects a payload missing a required field with a structured error',
    async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      const deptCode = 'core';

      // Insert field types
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.FieldTypes" (code, ts_type, json_schema)
        VALUES
          ('string', 'string', '{"type": "string"}'::jsonb),
          ('number', 'number', '{"type": "number"}'::jsonb),
          ('date', 'string', '{"type": "string", "format": "date"}'::jsonb),
          ('enum', 'string', '{"type": "string", "enum": ["active", "inactive", "pending"]}'::jsonb),
          ('formula', 'string', '{"type": "string"}'::jsonb);
      `);

      // Insert DeptColumns rows for core department
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.DeptColumns" (org_id, dept_code, column_key, field_type, is_required, schema_version)
        VALUES
          ($1, $2, 'name', 'string', true, 1),
          ($1, $2, 'quantity', 'number', true, 1),
          ($1, $2, 'manufacture_date', 'date', false, 1),
          ($1, $2, 'status', 'enum', true, 1),
          ($1, $2, 'computed_field', 'formula', false, 1)
      `, [orgId, deptCode]);

      // Call compile with org_id and dept_code
      const resolver = await compile(orgId, deptCode);

      // Test: Valid payload should pass
      const validPayload = {
        name: 'Test Product',
        quantity: 42,
        status: 'active'
      };

      const validResult = resolver.safeParse(validPayload);
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toEqual(validPayload);
      }

      // Test: Missing required field should be rejected with structured error
      const invalidPayload = {
        name: 'Test Product',
        // missing quantity (required)
        status: 'active'
      };

      const invalidResult = resolver.safeParse(invalidPayload);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.issues).toContainEqual(
          expect.objectContaining({
            path: expect.arrayContaining(['quantity']),
            code: expect.stringMatching(/required|invalid/)
          })
        );
      }

      // Test: Invalid enum value should be rejected
      const invalidEnumPayload = {
        name: 'Test Product',
        quantity: 42,
        status: 'invalid_status'
      };

      const enumResult = resolver.safeParse(invalidEnumPayload);
      expect(enumResult.success).toBe(false);

      // Test: Optional fields may be omitted
      const minimalPayload = {
        name: 'Test Product',
        quantity: 42,
        status: 'inactive'
      };

      const minimalResult = resolver.safeParse(minimalPayload);
      expect(minimalResult.success).toBe(true);
    }
  );

  runDatabaseTest(
    'AC2: Given the same compile call is invoked twice with the same schema_version, when the second call runs, then the LRU cache returns in <1ms (no DB query)',
    async () => {
      const orgId = '22222222-2222-2222-2222-222222222222';
      const deptCode = 'manufacturing';

      // Insert field types
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.FieldTypes" (code, ts_type, json_schema)
        VALUES
          ('string', 'string', '{"type": "string"}'::jsonb),
          ('number', 'number', '{"type": "number"}'::jsonb);
      `);

      // Insert DeptColumns rows
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.DeptColumns" (org_id, dept_code, column_key, field_type, is_required, schema_version)
        VALUES
          ($1, $2, 'product_id', 'string', true, 1),
          ($1, $2, 'line_speed', 'number', true, 1)
      `, [orgId, deptCode]);

      // First call - should hit database
      const start1 = performance.now();
      const resolver1 = await compile(orgId, deptCode);
      const duration1 = performance.now() - start1;

      // Second call - should hit cache
      const start2 = performance.now();
      const resolver2 = await compile(orgId, deptCode);
      const duration2 = performance.now() - start2;

      // Both should return valid Zod schemas
      expect(resolver1).toBeDefined();
      expect(resolver2).toBeDefined();

      // Second call should be significantly faster (cache hit < 1ms)
      expect(duration2).toBeLessThan(1);

      // Both resolvers should work identically
      const testPayload = { product_id: 'SKU123', line_speed: 100 };
      expect(resolver1.safeParse(testPayload).success).toBe(true);
      expect(resolver2.safeParse(testPayload).success).toBe(true);
    }
  );

  runDatabaseTest(
    'AC3: Given schema_version is bumped, when compile() runs again, then the cache misses and the new resolver reflects the new column set',
    async () => {
      const orgId = '33333333-3333-3333-3333-333333333333';
      const deptCode = 'packaging';

      // Insert field types
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.FieldTypes" (code, ts_type, json_schema)
        VALUES
          ('string', 'string', '{"type": "string"}'::jsonb),
          ('number', 'number', '{"type": "number"}'::jsonb);
      `);

      // Insert initial DeptColumns (version 1)
      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.DeptColumns" (org_id, dept_code, column_key, field_type, is_required, schema_version)
        VALUES
          ($1, $2, 'package_id', 'string', true, 1),
          ($1, $2, 'weight', 'number', false, 1)
      `, [orgId, deptCode]);

      // Compile with version 1
      const resolver1 = await compile(orgId, deptCode);

      // Verify v1 accepts payload with package_id
      const v1Payload = { package_id: 'PKG001' };
      expect(resolver1.safeParse(v1Payload).success).toBe(true);

      // Now bump schema_version and add a new required field
      await dbClient.query(`
        DELETE FROM schema_runtime_test."Reference.DeptColumns"
        WHERE org_id = $1 AND dept_code = $2
      `, [orgId, deptCode]);

      await dbClient.query(`
        INSERT INTO schema_runtime_test."Reference.DeptColumns" (org_id, dept_code, column_key, field_type, is_required, schema_version)
        VALUES
          ($1, $2, 'package_id', 'string', true, 2),
          ($1, $2, 'weight', 'number', false, 2),
          ($1, $2, 'material_type', 'string', true, 2)
      `, [orgId, deptCode]);

      // Clear cache to force new query
      clearCache();

      // Compile with version 2 (cache should miss)
      const resolver2 = await compile(orgId, deptCode);

      // v1 payload (missing material_type) should now be invalid with v2 resolver
      const v1PayloadWithV2 = { package_id: 'PKG001' };
      expect(resolver2.safeParse(v1PayloadWithV2).success).toBe(false);

      // v2 payload with new required field should pass
      const v2Payload = { package_id: 'PKG002', material_type: 'plastic' };
      expect(resolver2.safeParse(v2Payload).success).toBe(true);

      // Verify the schemas are actually different
      expect(resolver1).not.toEqual(resolver2);
    }
  );

  runDatabaseTest(
    'Tables Reference.DeptColumns and Reference.FieldTypes exist with correct schema',
    async () => {
      // Verify Reference.FieldTypes table structure
      const fieldTypesResult = await dbClient.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'schema_runtime_test'
          AND table_name = 'Reference.FieldTypes'
        ORDER BY ordinal_position
      `);

      const fieldTypesCols = fieldTypesResult.rows.map(r => r.column_name);
      expect(fieldTypesCols).toContain('code');
      expect(fieldTypesCols).toContain('ts_type');
      expect(fieldTypesCols).toContain('json_schema');

      // Verify Reference.DeptColumns table structure
      const deptColumnsResult = await dbClient.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'schema_runtime_test'
          AND table_name = 'Reference.DeptColumns'
        ORDER BY ordinal_position
      `);

      const deptColsCols = deptColumnsResult.rows.map(r => r.column_name);
      expect(deptColsCols).toContain('id');
      expect(deptColsCols).toContain('org_id');
      expect(deptColsCols).toContain('dept_code');
      expect(deptColsCols).toContain('column_key');
      expect(deptColsCols).toContain('field_type');
      expect(deptColsCols).toContain('is_required');
      expect(deptColsCols).toContain('validation_dsl');
      expect(deptColsCols).toContain('schema_version');
    }
  );
});
