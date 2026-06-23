import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = {
  sql: string;
};

type FakeClient = {
  calls: QueryCall[];
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

type FakePool = {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

type FakeMatview = {
  matviewname: string;
  has_unique_index: boolean;
};

let currentPool: FakePool;
let currentClient: FakeClient;

vi.mock('@monopilot/db/system-actor-connection.js', () => ({
  cronBearerMatches: (provided: string, expected: string | undefined) =>
    typeof expected === 'string' &&
    expected.length > 0 &&
    provided === expected,
  getSystemActorConnection: () => currentPool,
}));

beforeEach(() => {
  vi.resetModules();
  currentClient = makeClient([]);
  currentPool = makePool(currentClient);
});

type RouteModule = typeof import('./route.ts');

async function loadRoute(): Promise<RouteModule> {
  const path = `${__dirname}/route.ts`;
  return (await import(path)) as RouteModule;
}

function makeRequest(headers?: HeadersInit): Request {
  return new Request(
    'https://web.test/api/internal/cron/reporting-refresh',
    {
      method: 'POST',
      headers,
    },
  );
}

function makeClient(
  matviews: FakeMatview[],
  refreshFailures: Record<string, Error> = {},
): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    query: vi.fn(async (sql: string) => {
      calls.push({ sql });

      if (sql.includes('from pg_matviews')) {
        return {
          rows: matviews,
          rowCount: matviews.length,
        };
      }

      const concurrentRefreshPrefix = 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.';
      const plainRefreshPrefix = 'REFRESH MATERIALIZED VIEW public.';
      if (sql.startsWith(concurrentRefreshPrefix) || sql.startsWith(plainRefreshPrefix)) {
        const refreshPrefix = sql.startsWith(concurrentRefreshPrefix)
          ? concurrentRefreshPrefix
          : plainRefreshPrefix;
        const name = sql
          .slice(refreshPrefix.length)
          .replace(/^"/, '')
          .replace(/"$/, '')
          .replaceAll('""', '"');
        const failure = refreshFailures[name];
        if (failure) throw failure;
        return { rows: [], rowCount: null };
      }

      throw new Error(`unexpected query: ${sql}`);
    }),
    release: vi.fn(),
  };
  return client;
}

function makePool(client: FakeClient): FakePool {
  return {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('POST /api/internal/cron/reporting-refresh', () => {
  it('returns 401 for an unauthorized request', async () => {
    const route = await loadRoute();

    const response = await route.POST(makeRequest());

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: 'unauthorized' });
    expect(currentPool.connect).not.toHaveBeenCalled();
  });

  it('refreshes each discovered reporting materialized view', async () => {
    currentClient = makeClient([
      { matviewname: 'mv_reporting_inventory_aging', has_unique_index: true },
      { matviewname: 'mv_reporting_oee_rollup', has_unique_index: true },
    ]);
    currentPool = makePool(currentClient);
    const route = await loadRoute();

    const response = await route.POST(
      makeRequest({ 'x-vercel-cron': '1' }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      refreshed: 2,
      errors: [],
    });
    const discoverySql = normalizeSql(currentClient.calls[0]!.sql);
    expect(discoverySql).toContain('from pg_matviews mv');
    expect(discoverySql).toContain("mv.matviewname like 'mv\\_reporting\\_%' escape '\\'");
    expect(discoverySql).not.toContain('v_mv_reporting');
    expect(currentClient.calls.slice(1).map((call) => call.sql)).toEqual([
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public."mv_reporting_inventory_aging"',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public."mv_reporting_oee_rollup"',
    ]);
    expect(currentClient.release).toHaveBeenCalledTimes(1);
    expect(currentPool.end).toHaveBeenCalledTimes(1);
  });

  it('uses plain refresh when a discovered reporting materialized view has no unique index', async () => {
    currentClient = makeClient([
      { matviewname: 'mv_reporting_inventory_aging', has_unique_index: false },
    ]);
    currentPool = makePool(currentClient);
    const route = await loadRoute();

    const response = await route.POST(
      makeRequest({ 'x-vercel-cron': '1' }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      refreshed: 1,
      errors: [],
    });
    expect(currentClient.calls.slice(1).map((call) => call.sql)).toEqual([
      'REFRESH MATERIALIZED VIEW public."mv_reporting_inventory_aging"',
    ]);
  });

  it('continues refreshing remaining materialized views when one refresh fails', async () => {
    currentClient = makeClient(
      [
        { matviewname: 'mv_reporting_broken', has_unique_index: true },
        { matviewname: 'mv_reporting_good', has_unique_index: true },
      ],
      { mv_reporting_broken: new Error('refresh failed') },
    );
    currentPool = makePool(currentClient);
    const route = await loadRoute();

    const response = await route.POST(
      makeRequest({ 'x-vercel-cron': '1' }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      refreshed: 1,
      errors: [{ name: 'mv_reporting_broken', message: 'refresh failed' }],
    });
    expect(currentClient.calls.slice(1).map((call) => call.sql)).toEqual([
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public."mv_reporting_broken"',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public."mv_reporting_good"',
    ]);
    expect(currentClient.release).toHaveBeenCalledTimes(1);
    expect(currentPool.end).toHaveBeenCalledTimes(1);
  });
});
