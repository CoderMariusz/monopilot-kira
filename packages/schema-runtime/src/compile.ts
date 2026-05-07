import { z, ZodSchema, ZodTypeAny } from 'zod';
import pg from 'pg';
import { RefTables } from '../../../lib/reference/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldTypeRow {
  code: string;
  ts_type: string;
  json_schema: Record<string, unknown>;
}

interface DeptColumnRow {
  column_key: string;
  field_type: string;
  is_required: boolean;
  validation_dsl: Record<string, unknown> | null;
  schema_version: number;
}

// ---------------------------------------------------------------------------
// Schema / table resolution
//
// Production:   schema = "Reference", tables are "Reference"."DeptColumns"
// Test (Vitest): tables are created in schema_runtime_test as
//                schema_runtime_test."Reference.DeptColumns"
//                The VITEST env flag set by Vitest allows auto-detection.
// ---------------------------------------------------------------------------

function getSchemaConfig(): { schemaName: string; isTestMode: boolean } {
  const isTestMode = Boolean(process.env.VITEST);
  return { schemaName: isTestMode ? 'schema_runtime_test' : 'Reference', isTestMode };
}

function deptColumnsTable(schemaName: string, isTestMode: boolean): string {
  if (isTestMode) {
    // test schema uses table literally named "Reference.DeptColumns"
    return `"${schemaName}"."${RefTables.DeptColumns}"`;
  }
  return `"${schemaName}"."DeptColumns"`;
}

function fieldTypesTable(schemaName: string, isTestMode: boolean): string {
  if (isTestMode) {
    return `"${schemaName}"."${RefTables.FieldTypes}"`;
  }
  return `"${schemaName}"."FieldTypes"`;
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

// Simple in-process LRU cache keyed by `${orgId}:${schemaVersion}`
// Max size 100 entries; LRU eviction on overflow.
const CACHE_MAX = 100;
const cacheOrder: string[] = [];
const cache = new Map<string, ZodSchema>();

function cacheGet(key: string): ZodSchema | undefined {
  if (!cache.has(key)) return undefined;
  // Move to front (most-recently-used)
  const idx = cacheOrder.indexOf(key);
  if (idx !== -1) cacheOrder.splice(idx, 1);
  cacheOrder.unshift(key);
  return cache.get(key);
}

function cacheSet(key: string, schema: ZodSchema): void {
  if (cache.has(key)) {
    const idx = cacheOrder.indexOf(key);
    if (idx !== -1) cacheOrder.splice(idx, 1);
  } else if (cache.size >= CACHE_MAX) {
    // Evict least-recently-used
    const lru = cacheOrder.pop();
    if (lru) cache.delete(lru);
  }
  cache.set(key, schema);
  cacheOrder.unshift(key);
}

/**
 * Clear the LRU cache (mainly for testing / schema_version bump detection).
 */
export function clearCache(): void {
  cache.clear();
  cacheOrder.length = 0;
}

// ---------------------------------------------------------------------------
// JSON Schema → Zod schema conversion
// ---------------------------------------------------------------------------

function jsonSchemaToZodType(jsonSchema: Record<string, unknown>): ZodTypeAny {
  const type = jsonSchema['type'] as string | undefined;
  const format = jsonSchema['format'] as string | undefined;
  const enumValues = jsonSchema['enum'] as unknown[] | undefined;

  if (enumValues && enumValues.length > 0) {
    // z.enum requires a non-empty string tuple
    const stringValues = enumValues.filter(v => typeof v === 'string') as string[];
    if (stringValues.length >= 1) {
      return z.enum(stringValues as [string, ...string[]]);
    }
  }

  switch (type) {
    case 'string':
      if (format === 'date' || format === 'date-time') {
        // Accept any string for date fields (Zod doesn't have native date-string validation by default)
        return z.string();
      }
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(z.unknown());
    case 'object':
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

// ---------------------------------------------------------------------------
// DB query helpers
// ---------------------------------------------------------------------------

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    _pool = new pg.Pool({ connectionString });
  }
  return _pool;
}

async function queryDeptColumns(
  orgId: string,
  deptCode: string,
): Promise<{ rows: DeptColumnRow[]; schemaVersion: number }> {
  const pool = getPool();
  const { schemaName, isTestMode } = getSchemaConfig();
  const table = deptColumnsTable(schemaName, isTestMode);

  const result = await pool.query<DeptColumnRow>(
    `SELECT column_key, field_type, is_required, validation_dsl, schema_version
     FROM ${table}
     WHERE org_id = $1 AND dept_code = $2
     ORDER BY column_key`,
    [orgId, deptCode],
  );

  if (result.rows.length === 0) {
    return { rows: [], schemaVersion: 0 };
  }

  const schemaVersion = result.rows[0]!.schema_version;
  return { rows: result.rows, schemaVersion };
}

async function queryFieldTypes(): Promise<Map<string, FieldTypeRow>> {
  const pool = getPool();
  const { schemaName, isTestMode } = getSchemaConfig();
  const table = fieldTypesTable(schemaName, isTestMode);

  const result = await pool.query<FieldTypeRow>(
    `SELECT code, ts_type, json_schema FROM ${table}`,
  );

  const map = new Map<string, FieldTypeRow>();
  for (const row of result.rows) {
    map.set(row.code, row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a Zod schema resolver from DeptColumns and FieldTypes.
 *
 * Given an org_id and dept_code, queries the Reference.DeptColumns and
 * Reference.FieldTypes tables, builds a JSON schema, converts it to a Zod
 * object schema, and returns a Zod resolver.
 *
 * Results are LRU-cached keyed by `${orgId}:${schemaVersion}`.
 *
 * @param orgId    - Organization ID to scope the column set
 * @param deptCode - Department code to identify the column configuration
 * @returns A Zod schema validator that accepts typed payloads
 */
export async function compile(orgId: string, deptCode: string): Promise<ZodSchema> {
  // 1. Fetch the current schema_version to check cache
  const { rows: deptRows, schemaVersion } = await queryDeptColumns(orgId, deptCode);

  // 2. Check LRU cache
  const cacheKey = `${orgId}:${schemaVersion}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  // 3. Fetch field type definitions
  const fieldTypes = await queryFieldTypes();

  // 4. Build a Zod object schema from the column set
  const shape: Record<string, ZodTypeAny> = {};
  const requiredKeys = new Set<string>();

  for (const row of deptRows) {
    const fieldType = fieldTypes.get(row.field_type);
    let zodType: ZodTypeAny;

    if (fieldType) {
      zodType = jsonSchemaToZodType(fieldType.json_schema as Record<string, unknown>);
    } else {
      // Fallback for unknown field types (e.g. 'formula')
      zodType = z.string();
    }

    if (!row.is_required) {
      zodType = zodType.optional();
    } else {
      requiredKeys.add(row.column_key);
    }

    shape[row.column_key] = zodType;
  }

  // Build strict-enough object schema (passthrough allows extra keys by default,
  // but strip unknown keys so safeParse succeeds on exact-match payloads)
  const schema = z.object(shape);

  // 5. Store in cache
  cacheSet(cacheKey, schema);

  return schema;
}
