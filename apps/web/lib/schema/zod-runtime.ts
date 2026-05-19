import { z, ZodType, ZodTypeAny } from 'zod';

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

type SchemaScope = {
  orgId: string;
  tableCode: string;
  schemaVersion: number;
};

type CacheEntry = {
  schema: ZodType;
  expiresAt: number;
  touchedAt: number;
};

export type GetZodRuntimeSchemaInput = SchemaScope & {
  loadColumns: (scope: SchemaScope) => Promise<RuntimeColumn[]>;
};

const schemaCache = new Map<string, CacheEntry>();
let accessCounter = 0;

export async function getZodRuntimeSchema(input: GetZodRuntimeSchemaInput): Promise<ZodType> {
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

function compileRuntimeSchema(columns: RuntimeColumn[]): ZodType {
  const shape: Record<string, ZodTypeAny> = {};
  for (const column of columns) {
    if (column.deprecated_at) continue;
    const baseSchema = columnSchema(column);
    shape[column.column_code] = column.required_for_done ? baseSchema : baseSchema.optional();
  }
  // strip unknown keys to keep the schema strict but tolerant: deprecated keys
  // submitted by stale clients are dropped without failing.
  return z.object(shape).strip();
}

function columnSchema(column: RuntimeColumn): ZodTypeAny {
  const validation = (column.validation_json ?? {}) as Record<string, unknown>;
  switch (column.data_type) {
    case 'text':
    case 'formula':
    case 'relation': {
      let s = z.string({ message: `${column.column_code} must be a string` });
      const regex = safeRegex(validation.regex);
      if (regex) s = s.regex(regex, { message: `${column.column_code} does not match required pattern` });
      const minLen = numberOrNull((validation.length as Record<string, unknown> | undefined)?.min);
      const maxLen = numberOrNull((validation.length as Record<string, unknown> | undefined)?.max);
      if (minLen !== null) s = s.min(minLen);
      if (maxLen !== null) s = s.max(maxLen);
      return s;
    }
    case 'number': {
      let n = z.number({ message: `${column.column_code} must be a number` });
      const range = (validation.range ?? {}) as Record<string, unknown>;
      const min = numberOrNull(range.min);
      const max = numberOrNull(range.max);
      if (min !== null) n = n.min(min);
      if (max !== null) n = n.max(max);
      return n;
    }
    case 'date': {
      // Accept ISO8601 string; parseable by Date.parse. We use z.string().refine to keep
      // the public API plain-JSON-shaped while still rejecting malformed dates.
      return z.string({ message: `${column.column_code} must be an ISO date string` }).refine(
        (value) => !Number.isNaN(Date.parse(value)),
        { message: `${column.column_code} must be a parseable ISO date string` },
      );
    }
    case 'enum': {
      const options = enumOptions(validation);
      if (options.length === 0) {
        // No allow-list yet: accept any string until UI/admin defines dropdown options.
        return z.string({ message: `${column.column_code} must be a string` });
      }
      return z.enum(options as [string, ...string[]]);
    }
    default:
      return z.unknown();
  }
}

function enumOptions(validation: Record<string, unknown>): string[] {
  const direct = validation.options ?? validation.enum;
  if (!Array.isArray(direct)) return [];
  return direct.filter((value): value is string => typeof value === 'string');
}

function safeRegex(pattern: unknown): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 512) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
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
