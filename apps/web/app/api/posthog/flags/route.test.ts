import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { _mockWithOrgContext } = vi.hoisted(() => ({
  _mockWithOrgContext: vi.fn(),
}));

vi.mock('../../../../lib/auth/with-org-context', () => ({
  withOrgContext: _mockWithOrgContext,
}));

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};
type OrgContext = {
  userId: string;
  orgId: string;
  sessionToken: string;
  client: FakeClient;
};
type RouteModule = { GET: (request: Request) => Promise<Response> };

const routePath = resolve(__dirname, 'route.ts');
const ORG_ID = 'org_42';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_CONTEXT_ID = '33333333-3333-4333-8333-333333333333';
const FIXED_NOW = '2026-05-19T12:00:00.000Z';

let currentContext: OrgContext | null;
let fakeClient: FakeClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW));
  vi.stubEnv('POSTHOG_PROJECT_API_KEY', 'phc_test_project_key_not_secret');
  vi.stubEnv('POSTHOG_HOST', 'https://posthog.example.test');

  fakeClient = makeFakeClient();
  currentContext = {
    userId: USER_ID,
    orgId: ORG_ID,
    sessionToken: SESSION_CONTEXT_ID,
    client: fakeClient,
  };
  _mockWithOrgContext.mockImplementation(async (action: (ctx: OrgContext) => Promise<unknown>) => {
    if (!currentContext) throw new Error('UNAUTHENTICATED');
    return action(currentContext);
  });

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/posthog/flags (TASK-000204 RED)', () => {
  it('posts to PostHog decide with groups.organization from the authenticated org and returns flags with fetched_at', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { featureFlags: { 'settings.audit_view': true, 'ops.banner': 'control' } }),
    );
    const { GET } = await loadRoute();

    const response = await GET(new Request('https://app.example.com/api/posthog/flags', { method: 'GET' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      flags: { 'settings.audit_view': true, 'ops.banner': 'control' },
      fetched_at: FIXED_NOW,
    });
    expect(_mockWithOrgContext, 'route must resolve authenticated org via withOrgContext').toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const decide = decideCall();
    expect(String(decide.input), 'upstream URL must call the PostHog decide API').toContain('/decide');
    expect(decide.init?.method).toBe('POST');
    expect(decide.body.groups?.organization).toBe(ORG_ID);
    expect(decide.body.groups?.tenant, 'tenant_id-style group key must not replace organization').toBeUndefined();
  });

  it('serves a t0+30s cache hit for the same org without a second upstream fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { featureFlags: { cached_flag: true } }));
    const { GET } = await loadRoute();

    const first = await GET(new Request('https://app.example.com/api/posthog/flags', { method: 'GET' }));
    const firstBody = await first.json();

    vi.setSystemTime(new Date('2026-05-19T12:00:30.000Z'));
    const second = await GET(new Request('https://app.example.com/api/posthog/flags', { method: 'GET' }));
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondBody).toEqual(firstBody);
    expect(secondBody).toEqual({ flags: { cached_flag: true }, fetched_at: FIXED_NOW });
  });

  it('returns POSTHOG_UPSTREAM_ERROR with 502 and writes an audit_log row when PostHog returns 5xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'service unavailable' }));
    const { GET } = await loadRoute();

    const response = await GET(new Request('https://app.example.com/api/posthog/flags', { method: 'GET' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error_code: 'POSTHOG_UPSTREAM_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auditLogInserts(), 'upstream failures must emit an org-scoped tenant audit_log entry').toHaveLength(1);
    expect(auditLogInserts()[0]?.params).toContain(ORG_ID);
  });

  it('returns 401 for an unauthenticated caller and never fetches PostHog', async () => {
    currentContext = null;
    const { GET } = await loadRoute();

    const response = await GET(new Request('https://app.example.com/api/posthog/flags', { method: 'GET' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error_code: 'UNAUTHENTICATED' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auditLogInserts()).toHaveLength(0);
  });
});

async function loadRoute(): Promise<RouteModule> {
  expect(existsSync(routePath), 'apps/web/app/api/posthog/flags/route.ts must exist at the real Next.js route path').toBe(
    true,
  );
  const mod = (await import(routePath)) as Partial<RouteModule>;
  expect(typeof mod.GET, 'route.ts must export GET(request)').toBe('function');
  return mod as RouteModule;
}

function makeFakeClient(): FakeClient {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function decideCall(): { input: RequestInfo | URL; init?: RequestInit; body: Record<string, any> } {
  const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
  const rawBody = init?.body;
  expect(typeof rawBody, 'PostHog decide payload must be a JSON request body').toBe('string');
  return { input, init, body: JSON.parse(rawBody as string) };
}

function auditLogInserts(): QueryCall[] {
  return fakeClient.calls.filter((call) => /insert\s+into\s+(public\.)?audit_log\b/i.test(call.sql));
}
