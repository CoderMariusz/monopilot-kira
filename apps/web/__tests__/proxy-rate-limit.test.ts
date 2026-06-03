import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProxyHandler = (req: TestNextRequest) => Response | Promise<Response>;

class TestNextRequest extends Request {
  nextUrl: URL;

  constructor(input: string, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(input);
  }
}

const TestNextResponse = {
  next: () => new Response(null, { status: 200 }),
  redirect: (url: string | URL, init?: ResponseInit) =>
    new Response(null, {
      status: init?.status ?? 307,
      headers: { location: url.toString(), ...(init?.headers as Record<string, string> | undefined) },
    }),
};

vi.mock('next/server', () => ({
  NextRequest: TestNextRequest,
  NextResponse: TestNextResponse,
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (routing: unknown) => routing,
}));

vi.mock('../i18n/routing', () => ({
  routing: {
    locales: ['pl', 'en', 'uk', 'ro'],
    defaultLocale: 'en',
  },
}));

const {
  auditAdminIpBlockedMock,
  checkIdleTimeoutMock,
  establishOrgContextMock,
  intlHandlerMock,
  isRequestIpAllowedMock,
  resolveEdgeSecurityContextMock,
  verifyScimBearerMock,
} = vi.hoisted(() => ({
  auditAdminIpBlockedMock: vi.fn(),
  checkIdleTimeoutMock: vi.fn(),
  establishOrgContextMock: vi.fn(),
  intlHandlerMock: vi.fn(),
  isRequestIpAllowedMock: vi.fn(),
  resolveEdgeSecurityContextMock: vi.fn(),
  verifyScimBearerMock: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: vi.fn(() => intlHandlerMock),
}));

vi.mock('../lib/auth/session-check', () => ({
  checkIdleTimeout: checkIdleTimeoutMock,
}));

vi.mock('../lib/auth/edge-middleware-policy', () => ({
  auditAdminIpBlocked: auditAdminIpBlockedMock,
  establishOrgContext: establishOrgContextMock,
  isRequestIpAllowed: isRequestIpAllowedMock,
  resolveEdgeSecurityContext: resolveEdgeSecurityContextMock,
  verifyScimBearer: verifyScimBearerMock,
}));

function makeRequest(pathname: string, init: RequestInit = {}): TestNextRequest {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:3000');
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', '198.51.100.42');

  return new TestNextRequest(`http://localhost:3000${pathname}`, {
    ...init,
    headers,
  });
}

async function loadProxy(): Promise<ProxyHandler> {
  vi.resetModules();
  const mod = (await import('../proxy.js')) as unknown as { default: ProxyHandler };
  return mod.default;
}

describe('T-121 proxy rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    intlHandlerMock.mockReturnValue(TestNextResponse.next());
    verifyScimBearerMock.mockResolvedValue(false);
    resolveEdgeSecurityContextMock.mockResolvedValue({
      accessToken: 'fresh-access-token',
      adminIpAllowlistCidrs: [],
      onboardingCompletedAt: '2026-05-01T00:00:00.000Z',
      orgId: '11111111-1111-1111-1111-111111111111',
      role: 'admin',
      sessionIdleTimeoutMinutes: 60,
    });
    isRequestIpAllowedMock.mockReturnValue(true);
    checkIdleTimeoutMock.mockResolvedValue(new Response(null, { status: 200 }));
    establishOrgContextMock.mockResolvedValue(undefined);
    auditAdminIpBlockedMock.mockResolvedValue(undefined);
  });

  it('returns 429 on the 6th POST to /api/auth/login from one IP', async () => {
    const proxy = await loadProxy();
    const responses = [];

    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await proxy(
          makeRequest('/api/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '198.51.100.42' },
          }),
        ),
      );
    }

    expect(responses.slice(0, 5).map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[5].status).toBe(429);
    expect(responses[5].headers.get('retry-after')).toMatch(/^\d+$/);
    expect(resolveEdgeSecurityContextMock).not.toHaveBeenCalled();
    expect(intlHandlerMock).not.toHaveBeenCalled();
  });
});
