import { describe, expect, it, vi } from 'vitest';

type ManufacturingOperationRow = {
  operation_name: string;
  process_suffix: string;
  operation_seq: number;
};

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  rows: Map<string, ManufacturingOperationRow>;
  query: <T = ManufacturingOperationRow>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

type LookupResult = {
  operationName: string;
  processSuffix: string;
  operationSeq: number | null;
  intermediateCode: string;
  source: 'db' | 'cache' | 'fallback';
};

type ManufacturingOpsLookup = {
  resolve(input: { orgId: string; operationName: string; client: FakeClient }): Promise<LookupResult>;
};

type CreateLookup = (options?: {
  ttlMs?: number;
  maxEntries?: number;
  fallbackSuffix?: string;
  now?: () => number;
  warn?: (event: { code: string; orgId: string; operationName: string; reason: string }) => void;
}) => ManufacturingOpsLookup;

async function loadCreateLookup(): Promise<CreateLookup> {
  try {
    const modulePath = `${__dirname}/manufacturing-ops-lookup.ts`;
    const mod = (await import(modulePath)) as Record<string, unknown>;
    const createLookup = mod.createManufacturingOpsLookup;
    if (typeof createLookup !== 'function') {
      expect.fail('manufacturing-ops-lookup.ts must export createManufacturingOpsLookup(options).');
    }
    return createLookup as CreateLookup;
  } catch (error) {
    expect.fail(
      `manufacturing-ops-lookup.ts must implement createManufacturingOpsLookup; got ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function makeClient(rows: Array<{ orgId: string } & ManufacturingOperationRow>): FakeClient {
  const client: FakeClient = {
    calls: [],
    rows: new Map(rows.map((row) => [`${row.orgId}:${row.operation_name}`, row])),
    async query<T = ManufacturingOperationRow>(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();
      expect(normalizedSql, 'lookup must query Reference.ManufacturingOperations by org_id, never tenant_id').toContain('org_id');
      expect(normalizedSql, 'Wave0 correction: lookup SQL must not use tenant_id').not.toContain('tenant_id');
      const orgId = String(params[0] ?? '');
      const operationName = String(params[1] ?? '');
      const row = client.rows.get(`${orgId}:${operationName}`);
      return { rows: (row ? [row] : []) as T[], rowCount: row ? 1 : 0 };
    },
  };
  return client;
}

describe('manufacturing ops cascade lookup (T-040 RED)', () => {
  it('caches successful lookup hits by org_id and operation_name, without leaking same-name operations across orgs', async () => {
    const createLookup = await loadCreateLookup();
    const client = makeClient([
      { orgId: 'org-apex', operation_name: 'Mix', process_suffix: 'MX', operation_seq: 1 },
      { orgId: 'org-beta', operation_name: 'Mix', process_suffix: 'BM', operation_seq: 7 },
    ]);
    const lookup = createLookup({ ttlMs: 60_000, fallbackSuffix: 'UNK' });

    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Mix', client })).resolves.toMatchObject({
      processSuffix: 'MX',
      operationSeq: 1,
      intermediateCode: 'WIP-MX-00001',
      source: 'db',
    });
    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Mix', client })).resolves.toMatchObject({
      processSuffix: 'MX',
      intermediateCode: 'WIP-MX-00001',
      source: 'cache',
    });
    await expect(lookup.resolve({ orgId: 'org-beta', operationName: 'Mix', client })).resolves.toMatchObject({
      processSuffix: 'BM',
      operationSeq: 7,
      intermediateCode: 'WIP-BM-00007',
      source: 'db',
    });

    expect(client.calls, 'second same-org lookup must be served from cache; other-org same name must miss cache').toHaveLength(2);
    expect(client.calls.map((call) => call.params.slice(0, 2))).toEqual([
      ['org-apex', 'Mix'],
      ['org-beta', 'Mix'],
    ]);
  });

  it('emits a fallback warning and returns configurable placeholder suffix/code when the operation name is missing', async () => {
    const createLookup = await loadCreateLookup();
    const warn = vi.fn();
    const client = makeClient([]);
    const lookup = createLookup({ ttlMs: 60_000, fallbackSuffix: 'ZZ', warn });

    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Unknown Op', client })).resolves.toMatchObject({
      operationName: 'Unknown Op',
      processSuffix: 'ZZ',
      operationSeq: null,
      intermediateCode: 'WIP-ZZ-00000',
      source: 'fallback',
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      code: 'manufacturing_operation_lookup_fallback',
      orgId: 'org-apex',
      operationName: 'Unknown Op',
      reason: 'not_found',
    });
    expect(client.calls).toHaveLength(1);
  });

  it('invalidates cached operation suffixes after the configured TTL expires', async () => {
    let now = 1_000;
    const createLookup = await loadCreateLookup();
    const client = makeClient([{ orgId: 'org-apex', operation_name: 'Bake', process_suffix: 'BK', operation_seq: 4 }]);
    const lookup = createLookup({ ttlMs: 50, fallbackSuffix: 'UNK', now: () => now });

    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Bake', client })).resolves.toMatchObject({
      processSuffix: 'BK',
      intermediateCode: 'WIP-BK-00004',
      source: 'db',
    });
    client.rows.set('org-apex:Bake', { operation_name: 'Bake', process_suffix: 'B2', operation_seq: 8 });
    now = 1_030;
    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Bake', client })).resolves.toMatchObject({
      processSuffix: 'BK',
      intermediateCode: 'WIP-BK-00004',
      source: 'cache',
    });
    now = 1_051;
    await expect(lookup.resolve({ orgId: 'org-apex', operationName: 'Bake', client })).resolves.toMatchObject({
      processSuffix: 'B2',
      operationSeq: 8,
      intermediateCode: 'WIP-B2-00008',
      source: 'db',
    });

    expect(client.calls, 'lookup must re-query after ttlMs expires').toHaveLength(2);
  });
});
