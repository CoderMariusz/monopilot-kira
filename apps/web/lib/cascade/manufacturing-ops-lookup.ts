type QueryableClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

type ManufacturingOperationRow = {
  operation_name: string;
  process_suffix: string;
  operation_seq: number | null;
};

export type ManufacturingOpsLookupResult = {
  operationName: string;
  processSuffix: string;
  operationSeq: number | null;
  intermediateCode: string;
  source: 'db' | 'cache' | 'fallback';
};

type WarningEvent = {
  code: 'manufacturing_operation_lookup_fallback';
  orgId: string;
  operationName: string;
  reason: 'not_found';
};

export type ManufacturingOpsLookupOptions = {
  ttlMs?: number;
  maxEntries?: number;
  fallbackSuffix?: string;
  now?: () => number;
  warn?: (event: WarningEvent) => void;
};

type ResolveInput = {
  orgId: string;
  operationName: string;
  client: QueryableClient;
};

type CacheEntry = {
  value: Omit<ManufacturingOpsLookupResult, 'source'>;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_FALLBACK_SUFFIX = 'UNK';

function formatIntermediateCode(processSuffix: string, operationSeq: number | null): string {
  const paddedSeq = operationSeq === null ? '00000' : String(operationSeq).padStart(5, '0');
  return `WIP-${processSuffix}-${paddedSeq}`;
}

function defaultWarn(event: WarningEvent): void {
  console.warn('[manufacturing-ops-lookup] fallback', event);
}

export function createManufacturingOpsLookup(options: ManufacturingOpsLookupOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const fallbackSuffix = options.fallbackSuffix ?? DEFAULT_FALLBACK_SUFFIX;
  const now = options.now ?? Date.now;
  const warn = options.warn ?? defaultWarn;
  const cache = new Map<string, CacheEntry>();

  function cacheKey(orgId: string, operationName: string): string {
    return `${orgId}\u0000${operationName}`;
  }

  function remember(key: string, value: CacheEntry): void {
    if (maxEntries <= 0) return;
    cache.delete(key);
    cache.set(key, value);

    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  return {
    async resolve(input: ResolveInput): Promise<ManufacturingOpsLookupResult> {
      const key = cacheKey(input.orgId, input.operationName);
      const currentTime = now();
      const cached = cache.get(key);

      if (cached && cached.expiresAt > currentTime) {
        cache.delete(key);
        cache.set(key, cached);
        return { ...cached.value, source: 'cache' };
      }
      if (cached) {
        cache.delete(key);
      }

      const result = await input.client.query<ManufacturingOperationRow>(
        `select operation_name, process_suffix, operation_seq
           from "Reference.ManufacturingOperations"
          where org_id = $1
            and operation_name = $2
            and coalesce(is_active, true) = true
          limit 1`,
        [input.orgId, input.operationName],
      );
      const row = result.rows[0];

      if (!row) {
        warn({
          code: 'manufacturing_operation_lookup_fallback',
          orgId: input.orgId,
          operationName: input.operationName,
          reason: 'not_found',
        });
        return {
          operationName: input.operationName,
          processSuffix: fallbackSuffix,
          operationSeq: null,
          intermediateCode: formatIntermediateCode(fallbackSuffix, null),
          source: 'fallback',
        };
      }

      const value = {
        operationName: row.operation_name,
        processSuffix: row.process_suffix,
        operationSeq: row.operation_seq,
        intermediateCode: formatIntermediateCode(row.process_suffix, row.operation_seq),
      };
      remember(key, { value, expiresAt: currentTime + ttlMs });

      return { ...value, source: 'db' };
    },
  };
}
