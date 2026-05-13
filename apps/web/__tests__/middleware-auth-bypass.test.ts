import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type MiddlewareHandler = (req: NextRequest) => Promise<NextResponse>;

const { checkIdleTimeoutMock, intlHandlerMock } = vi.hoisted(() => {
  return {
    checkIdleTimeoutMock: vi.fn(),
    intlHandlerMock: vi.fn(),
  };
});

vi.mock('../lib/auth/session-check', () => ({
  checkIdleTimeout: checkIdleTimeoutMock,
}));

vi.mock('next-intl/middleware', () => ({
  default: vi.fn(() => intlHandlerMock),
}));

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      Authorization: 'Bearer fake',
    },
  });
}

async function loadMiddleware() {
  vi.resetModules();
  const mod = (await import('../middleware.js')) as unknown as { default: MiddlewareHandler };
  return mod.default;
}

describe('middleware DEV_AUTH_BYPASS', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    checkIdleTimeoutMock.mockResolvedValue(
      new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      }),
    );
    intlHandlerMock.mockReturnValue(NextResponse.next());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('passes stale bearer requests to next-intl when DEV_AUTH_BYPASS=true in development', async () => {
    vi.stubEnv('DEV_AUTH_BYPASS', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const middleware = await loadMiddleware();

    const response = await middleware(makeRequest('/en/settings'));

    expect(response.status).not.toBe(401);
    expect(checkIdleTimeoutMock).not.toHaveBeenCalled();
    expect(intlHandlerMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DEV_AUTH_BYPASS] Auth middleware disabled. NEVER set this in production.',
    );
  });

  it('still returns 401 when DEV_AUTH_BYPASS=true in production', async () => {
    vi.stubEnv('DEV_AUTH_BYPASS', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const middleware = await loadMiddleware();

    const response = await middleware(makeRequest('/en/settings'));

    expect(response.status).toBe(401);
    expect(checkIdleTimeoutMock).toHaveBeenCalledTimes(1);
    expect(intlHandlerMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DEV_AUTH_BYPASS] Ignored because NODE_ENV=production. Auth middleware remains enabled.',
    );
  });

  it('keeps returning 401 for stale bearer requests in development when DEV_AUTH_BYPASS is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const middleware = await loadMiddleware();

    const response = await middleware(makeRequest('/en/settings'));

    expect(response.status).toBe(401);
    expect(checkIdleTimeoutMock).toHaveBeenCalledTimes(1);
    expect(intlHandlerMock).not.toHaveBeenCalled();
  });

  it.each([
    ['development with bypass', 'development', 'true'],
    ['production with bypass', 'production', 'true'],
    ['development without bypass', 'development', undefined],
  ])('keeps public paths routed through next-intl in %s', async (_label, nodeEnv, bypass) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    if (bypass) vi.stubEnv('DEV_AUTH_BYPASS', bypass);
    const middleware = await loadMiddleware();

    const response = await middleware(makeRequest('/login'));

    expect(response.status).not.toBe(401);
    expect(checkIdleTimeoutMock).not.toHaveBeenCalled();
    expect(intlHandlerMock).toHaveBeenCalledTimes(1);
  });
});
