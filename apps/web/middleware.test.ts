import { beforeEach, describe, expect, it, vi } from 'vitest';

type MiddlewareHandler = (req: TestNextRequest) => Response | Promise<Response>;

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

vi.mock('./lib/auth/session-check', () => ({
  checkIdleTimeout: checkIdleTimeoutMock,
}));

vi.mock('./lib/auth/edge-middleware-policy', () => ({
  auditAdminIpBlocked: auditAdminIpBlockedMock,
  establishOrgContext: establishOrgContextMock,
  isRequestIpAllowed: isRequestIpAllowedMock,
  resolveEdgeSecurityContext: resolveEdgeSecurityContextMock,
  verifyScimBearer: verifyScimBearerMock,
}));

interface TestRequestOptions {
  authorization?: string;
  cookie?: string;
  forwardedFor?: string;
}

function makeRequest(pathname: string, opts: TestRequestOptions = {}): TestNextRequest {
  const headers = new Headers();
  headers.set('host', 'localhost:3000');
  if (opts.authorization) headers.set('authorization', opts.authorization);
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.forwardedFor) headers.set('x-forwarded-for', opts.forwardedFor);

  return new TestNextRequest(`http://localhost:3000${pathname}`, { headers });
}

async function loadMiddleware() {
  vi.resetModules();
  const mod = (await import('./middleware.js')) as unknown as {
    default: MiddlewareHandler;
    config: { matcher: Array<string | { source: string }> };
  };
  return mod;
}

function matcherAllows(pathname: string, matcher: string | { source: string }): boolean {
  const source = typeof matcher === 'string' ? matcher : matcher.source;
  return new RegExp(`^${source}$`).test(pathname);
}

function expectRedirectPath(response: Response, pathname: string): void {
  expect(response.status).toBe(307);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  expect(new URL(location!, 'http://localhost:3000').pathname).toBe(pathname);
}

describe('T-035 edge middleware security composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('keeps the public bypass list reachable and bypasses guards for a valid SCIM bearer request', async () => {
    const { config, default: middleware } = await loadMiddleware();
    const publicRoutes = ['/login', '/invite/accept', '/scim/v2/Users', '/api/auth/saml/callback', '/onboarding'];

    for (const route of publicRoutes) {
      expect(config.matcher.some((matcher) => matcherAllows(route, matcher))).toBe(true);
    }

    verifyScimBearerMock.mockResolvedValueOnce(true);
    const response = await middleware(
      makeRequest('/scim/v2/Users', {
        authorization: 'Bearer valid-scim-token',
        forwardedFor: '198.51.100.42',
      }),
    );

    expect(response.status).not.toBe(403);
    expect(verifyScimBearerMock).toHaveBeenCalledWith('Bearer valid-scim-token');
    expect(resolveEdgeSecurityContextMock).not.toHaveBeenCalled();
    expect(isRequestIpAllowedMock).not.toHaveBeenCalled();
    expect(auditAdminIpBlockedMock).not.toHaveBeenCalled();
    expect(checkIdleTimeoutMock).not.toHaveBeenCalled();
    expect(establishOrgContextMock).not.toHaveBeenCalled();
  });

  it('returns 403 IP_NOT_ALLOWED and writes a sanitized audit row when admin IP allowlist denies /admin', async () => {
    resolveEdgeSecurityContextMock.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      adminIpAllowlistCidrs: ['203.0.113.0/24'],
      onboardingCompletedAt: '2026-05-01T00:00:00.000Z',
      orgId: '22222222-2222-2222-2222-222222222222',
      role: 'admin',
      sessionIdleTimeoutMinutes: 60,
    });
    isRequestIpAllowedMock.mockReturnValueOnce(false);
    const { default: middleware } = await loadMiddleware();

    const response = await middleware(
      makeRequest('/admin/users', {
        authorization: 'Bearer secret-scim-or-user-token',
        cookie: 'sb-access-token=secret-cookie-value',
        forwardedFor: '198.51.100.42',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain('IP_NOT_ALLOWED');
    expect(auditAdminIpBlockedMock).toHaveBeenCalledWith({
      attemptedRoute: '/admin/users',
      eventType: 'admin_ip_blocked',
      orgId: '22222222-2222-2222-2222-222222222222',
      sourceIp: '198.51.100.42',
    });
    expect(JSON.stringify(auditAdminIpBlockedMock.mock.calls[0])).not.toMatch(/secret|authorization|cookie/i);
    expect(intlHandlerMock).not.toHaveBeenCalled();
  });

  it('redirects users with incomplete onboarding before idle timeout or org context resolution', async () => {
    const { default: middleware } = await loadMiddleware();

    resolveEdgeSecurityContextMock.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      adminIpAllowlistCidrs: [],
      onboardingCompletedAt: null,
      orgId: '33333333-3333-3333-3333-333333333333',
      role: 'admin',
      sessionIdleTimeoutMinutes: 60,
    });
    const adminResponse = await middleware(makeRequest('/admin/users'));
    expectRedirectPath(adminResponse, '/onboarding');

    resolveEdgeSecurityContextMock.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      adminIpAllowlistCidrs: [],
      onboardingCompletedAt: null,
      orgId: '44444444-4444-4444-4444-444444444444',
      role: 'viewer',
      sessionIdleTimeoutMinutes: 60,
    });
    const memberResponse = await middleware(makeRequest('/production/work-orders'));
    expectRedirectPath(memberResponse, '/onboarding/in-progress');

    expect(checkIdleTimeoutMock).not.toHaveBeenCalled();
    expect(establishOrgContextMock).not.toHaveBeenCalled();
    expect(intlHandlerMock).not.toHaveBeenCalled();
  });

  it('forces logout on idle timeout before resolving org_id for protected routes', async () => {
    checkIdleTimeoutMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const { default: middleware } = await loadMiddleware();

    const response = await middleware(
      makeRequest('/admin/users', {
        cookie: 'sb-access-token=stale-cookie-value',
        forwardedFor: '203.0.113.10',
      }),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/login?reason=idle');
    expect(response.headers.get('set-cookie')).toMatch(/sb-access-token=;/);
    expect(checkIdleTimeoutMock).toHaveBeenCalledWith({
      accessToken: 'fresh-access-token',
      idleTimeoutMin: 60,
      path: '/admin/users',
    });
    expect(establishOrgContextMock).not.toHaveBeenCalled();
    expect(intlHandlerMock).not.toHaveBeenCalled();
  });
});
