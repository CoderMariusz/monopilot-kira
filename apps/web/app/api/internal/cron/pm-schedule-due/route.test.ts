import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakePool = {
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

let currentPool: FakePool;

vi.mock('@monopilot/db/system-actor-connection.js', () => ({
  cronBearerMatches: (provided: string, expected: string | undefined) =>
    typeof expected === 'string' && expected.length > 0 && provided === expected,
  getSystemActorConnection: () => currentPool,
}));

vi.mock('../../../../../lib/cron/pm-schedule-due', () => ({
  runPmScheduleDueForOrg: vi.fn(async (_pool: unknown, orgId: string) => ({
    orgId,
    status: 'completed' as const,
    schedulesScanned: 1,
    created: 1,
    skippedOpen: 0,
    skippedNotDue: 0,
    errors: 0,
  })),
}));

beforeEach(() => {
  vi.resetModules();
  currentPool = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('from public.organizations')) {
        return { rows: [{ id: 'org-a' }, { id: 'org-b' }], rowCount: 2 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
    end: vi.fn(async () => undefined),
  };
});

type RouteModule = typeof import('./route.ts');

async function loadRoute(): Promise<RouteModule> {
  return (await import(`${__dirname}/route.ts`)) as RouteModule;
}

function makeRequest(method: 'GET' | 'POST', headers?: HeadersInit): Request {
  return new Request('https://web.test/api/internal/cron/pm-schedule-due', {
    method,
    headers,
  });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe('/api/internal/cron/pm-schedule-due', () => {
  it('GET returns 401 for an unauthorized request', async () => {
    const route = await loadRoute();

    const response = await route.GET(makeRequest('GET'));

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: 'unauthorized' });
    expect(currentPool.query).not.toHaveBeenCalled();
  });

  it('GET runs the PM due engine when x-vercel-cron is present (Vercel Cron)', async () => {
    const route = await loadRoute();
    const { runPmScheduleDueForOrg } = await import('../../../../../lib/cron/pm-schedule-due');

    const response = await route.GET(makeRequest('GET', { 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      orgs: 2,
      completed: 2,
      created: 2,
      results: [
        {
          orgId: 'org-a',
          status: 'completed',
          schedulesScanned: 1,
          created: 1,
          skippedOpen: 0,
          skippedNotDue: 0,
          errors: 0,
        },
        {
          orgId: 'org-b',
          status: 'completed',
          schedulesScanned: 1,
          created: 1,
          skippedOpen: 0,
          skippedNotDue: 0,
          errors: 0,
        },
      ],
    });
    expect(runPmScheduleDueForOrg).toHaveBeenCalledTimes(2);
    expect(currentPool.end).toHaveBeenCalledTimes(1);
  });

  it('GET accepts Bearer CRON_SECRET', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    const route = await loadRoute();

    const response = await route.GET(
      makeRequest('GET', { Authorization: 'Bearer test-cron-secret' }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ ok: true, orgs: 2 });
    process.env.CRON_SECRET = prev;
  });

  it('POST shares the same handler as GET', async () => {
    const route = await loadRoute();

    const response = await route.POST(makeRequest('POST', { 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ ok: true, orgs: 2, created: 2 });
  });
});
