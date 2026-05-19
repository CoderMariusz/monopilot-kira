const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 128;

export type RuntimeDataType = 'text' | 'number' | 'date' | 'enum' | 'formula' | 'relation';

export type RuntimeColumn = {
  org_id: string;
  table_code: string;
  column_code: string;
  data_type: RuntimeDataType;
  required_for_done: boolean;
  validation_json?: Record<string, unknown> | null;
  presentation_json?: Record<string, unknown> | null;
  schema_version: number;
  deprecated_at?: string | null;
};

export type RuntimeIssue = {
  path: Array<string | number>;
  message?: string;
};

export type RuntimeParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: { issues: RuntimeIssue[] } };

export type RuntimeSchema = {
  safeParse: (value: unknown) => RuntimeParseResult;
};

type SchemaScope = {
  orgId: string;
  tableCode: string;
  schemaVersion: number;
};

type CacheEntry = {
  schema: RuntimeSchema;
  expiresAt: number;
  touchedAt: number;
};

export type GetZodRuntimeSchemaInput = SchemaScope & {
  loadColumns: (scope: SchemaScope) => Promise<RuntimeColumn[]>;
};

const schemaCache = new Map<string, CacheEntry>();
let accessCounter = 0;

export async function getZodRuntimeSchema(input: GetZodRuntimeSchemaInput): Promise<RuntimeSchema> {
  const scope = {
    orgId: input.orgId,
    tableCode: input.tableCode,
    schemaVersion: input.schemaVersion,
  };
  const key = cacheKey(scope);
  const now = Date.now();
  const cached = schemaCache.get(key);

  if (cached && cached.expiresAt > now) {
    cached.touchedAt = ++accessCounter;
    return cached.schema;
  }
  if (cached) schemaCache.delete(key);

  const columns = await input.loadColumns(scope);
  const schema = compileRuntimeSchema(columns);
  schemaCache.set(key, {
    schema,
    expiresAt: now + CACHE_TTL_MS,
    touchedAt: ++accessCounter,
  });
  evictExpiredAndLru(now);
  return schema;
}

export function clearZodRuntimeSchemaCache(): void {
  schemaCache.clear();
}

export function invalidateZodRuntimeSchemaCache(scope?: Partial<SchemaScope>): void {
  if (!scope) {
    clearZodRuntimeSchemaCache();
    return;
  }

  for (const [key] of Array.from(schemaCache.entries())) {
    const parsed = parseCacheKey(key);
    if (!parsed) continue;
    const orgMatches = scope.orgId === undefined || scope.orgId === parsed.orgId;
    const tableMatches = scope.tableCode === undefined || scope.tableCode === parsed.tableCode;
    const versionMatches = scope.schemaVersion === undefined || scope.schemaVersion === parsed.schemaVersion;
    if (orgMatches && tableMatches && versionMatches) schemaCache.delete(key);
  }
}

function compileRuntimeSchema(columns: RuntimeColumn[]): RuntimeSchema {
  const activeColumns = columns.filter((column) => !column.deprecated_at);

  return {
    safeParse(value: unknown): RuntimeParseResult {
      if (!isRecord(value)) {
        return { success: false, error: { issues: [{ path: [], message: 'Expected an object payload' }] } };
      }

      const data: Record<string, unknown> = {};
      const issues: RuntimeIssue[] = [];
      for (const column of activeColumns) {
        const hasValue = Object.prototype.hasOwnProperty.call(value, column.column_code);
        const rawValue = value[column.column_code];

        if (!hasValue || rawValue === undefined || rawValue === null || rawValue === '') {
          if (column.required_for_done) {
            issues.push({ path: [column.column_code], message: 'Required' });
          }
          continue;
        }

        const parsedValue = parseColumnValue(column, rawValue);
        if (parsedValue.ok === false) {
          issues.push({ path: [column.column_code], message: parsedValue.message });
          continue;
        }
        data[column.column_code] = parsedValue.value;
      }

      if (issues.length > 0) return { success: false, error: { issues } };
      return { success: true, data };
    },
  };
}

function parseColumnValue(column: RuntimeColumn, value: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  switch (column.data_type) {
    case 'text':
    case 'enum':
    case 'formula':
    case 'relation': {
      if (typeof value !== 'string') return { ok: false, message: 'Expected a string' };
      const regex = safeRegex(column.validation_json?.regex);
      if (regex && !regex.test(value)) return { ok: false, message: 'Invalid format' };
      return { ok: true, value };
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return { ok: false, message: 'Expected a number' };
      return { ok: true, value };
    }
    case 'date': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        return { ok: false, message: 'Expected an ISO date string' };
      }
      return { ok: true, value };
    }
    default:
      return { ok: false, message: 'Unsupported data type' };
  }
}

function safeRegex(pattern: unknown): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 512) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function cacheKey(scope: SchemaScope): string {
  return JSON.stringify([scope.orgId, scope.tableCode, scope.schemaVersion]);
}

function parseCacheKey(key: string): SchemaScope | null {
  try {
    const [orgId, tableCode, schemaVersion] = JSON.parse(key) as unknown[];
    if (typeof orgId !== 'string' || typeof tableCode !== 'string' || typeof schemaVersion !== 'number') return null;
    return { orgId, tableCode, schemaVersion };
  } catch {
    return null;
  }
}

function evictExpiredAndLru(now: number): void {
  for (const [key, entry] of Array.from(schemaCache.entries())) {
    if (entry.expiresAt <= now) schemaCache.delete(key);
  }

  while (schemaCache.size > CACHE_MAX_ENTRIES) {
    let lruKey: string | null = null;
    let oldestTouch = Number.POSITIVE_INFINITY;
    for (const [key, entry] of Array.from(schemaCache.entries())) {
      if (entry.touchedAt < oldestTouch) {
        oldestTouch = entry.touchedAt;
        lruKey = key;
      }
    }
    if (lruKey === null) break;
    schemaCache.delete(lruKey);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
