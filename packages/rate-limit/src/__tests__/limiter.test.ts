import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryStore,
  RateLimitError,
  createRateLimiter,
  getClientIp,
  withRateLimit,
  withRateLimitAction,
} from '../index.js';

function request(path = '/api/auth/login', init: RequestInit = {}): Request {
  return new Request(`https://app.monopilot.test${path}`, init);
}

describe('@monopilot/rate-limit limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'));
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies the 6th request from the same IP for a 5/min limiter', async () => {
    const limiter = createRateLimiter({
      name: 'auth-login',
      store: new InMemoryStore(),
      limits: { capacity: 5, refillPerSec: 5 / 60 },
      keyFn: (req) => `auth-login:${getClientIp(req)}`,
    });
    const req = request('/api/auth/login', {
      headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1' },
    });

    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(await limiter.check(req));
    }

    expect(results.slice(0, 5).every((result) => result.allowed)).toBe(true);
    expect(results[5]).toMatchObject({ allowed: false, remaining: 0 });
    expect(results[5].resetAt).toBeGreaterThan(Date.now());
  });

  it('uses IP-based keys for login without including auth tokens', async () => {
    const limiter = createRateLimiter({
      name: 'auth-login',
      store: new InMemoryStore(),
      limits: { capacity: 5, refillPerSec: 5 / 60 },
      keyFn: (req) => `auth-login:${getClientIp(req)}`,
    });
    const req = request('/api/auth/login', {
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'sb-access-token=secret-cookie',
        'x-real-ip': '203.0.113.9',
      },
    });

    await limiter.check(req);

    expect(limiter.keyFor(req)).toBe('auth-login:203.0.113.9');
    expect(limiter.keyFor(req)).not.toMatch(/secret|token|cookie/i);
  });

  it('withRateLimit returns 429 with numeric Retry-After when denied', async () => {
    const limiter = createRateLimiter({
      name: 'auth-login',
      store: new InMemoryStore(),
      limits: { capacity: 1, refillPerSec: 1 / 60 },
      keyFn: () => 'auth-login:198.51.100.10',
    });
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withRateLimit(handler, { limiter });

    expect((await wrapped(request())).status).toBe(200);
    const denied = await wrapped(request());

    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('withRateLimitAction throws RateLimitError carrying resetAt and name', async () => {
    const limiter = createRateLimiter({
      name: 'pin-verify',
      store: new InMemoryStore(),
      limits: { capacity: 1, refillPerSec: 1 / 60 },
      keyFn: () => 'pin-verify:user-123',
    });
    const action = vi.fn(async () => 'ok');
    const wrapped = withRateLimitAction(action, { limiter, request: request('/pin') });

    await expect(wrapped()).resolves.toBe('ok');
    await expect(wrapped()).rejects.toMatchObject({
      name: 'RateLimitError',
      limiterName: 'pin-verify',
      resetAt: expect.any(Number),
    });
    await expect(wrapped()).rejects.toBeInstanceOf(RateLimitError);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('falls back to InMemoryStore in tests with one warning when env is unset', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const warn = vi.fn();

    const first = createRateLimiter({
      name: 'auth-login',
      limits: { capacity: 5, refillPerSec: 5 / 60 },
      keyFn: () => 'auth-login:ip',
      logger: { warn },
    });
    const second = createRateLimiter({
      name: 'auth-login',
      limits: { capacity: 5, refillPerSec: 5 / 60 },
      keyFn: () => 'auth-login:ip-2',
      logger: { warn },
    });

    expect(first.store).toBeInstanceOf(InMemoryStore);
    expect(second.store).toBeInstanceOf(InMemoryStore);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('throws in production when Upstash env is missing and no explicit store is supplied', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    expect(() =>
      createRateLimiter({
        name: 'auth-login',
        limits: { capacity: 5, refillPerSec: 5 / 60 },
        keyFn: () => 'auth-login:ip',
      }),
    ).toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});
