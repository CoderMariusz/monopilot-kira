/**
 * IDLE-2 (task #62) — unit tests for the global session-expiry fetch guard.
 *
 * Exercises `installSessionExpiryFetchGuard` directly via injected seams
 * (fake fetch target, fake location, fake assign) rather than rendering the
 * component — the seam is the load-bearing logic and is cleaner to assert.
 *
 * Runs under the UI vitest config (jsdom). Filename ends in `.test.tsx` so it
 * matches the config `include` (`app/**\/*.test.tsx`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installSessionExpiryFetchGuard } from '../session-expiry-guard.client';

type FetchLike = typeof globalThis.fetch;

const SESSION_EXPIRED_HEADER = 'x-monopilot-auth';

function makeResponse(init: { status?: number; headers?: Record<string, string> } = {}): Response {
  // Header-only contract — body content is irrelevant to detection. Use a real
  // Response so `.headers.get(...)` behaves exactly as in production.
  return new Response('{}', {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function sessionExpiredResponse(): Response {
  return makeResponse({ status: 401, headers: { [SESSION_EXPIRED_HEADER]: 'session_expired' } });
}

type Harness = {
  target: { fetch: FetchLike };
  originalFetch: FetchLike;
  assign: ReturnType<typeof vi.fn>;
  location: { pathname: string; search: string };
  setNextResponse: (res: Response) => void;
};

function makeHarness(location?: { pathname: string; search: string }): Harness {
  let nextResponse: Response = makeResponse();
  const originalFetch = vi.fn(async () => nextResponse) as unknown as FetchLike;
  const target = { fetch: originalFetch };
  const assign = vi.fn();
  const loc = location ?? { pathname: '/en/warehouse/grns/abc', search: '?tab=lines' };

  return {
    target,
    originalFetch,
    assign,
    location: loc,
    setNextResponse: (res: Response) => {
      nextResponse = res;
    },
  };
}

describe('installSessionExpiryFetchGuard', () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects exactly once on a response carrying the session_expired header', async () => {
    const uninstall = installSessionExpiryFetchGuard({
      locale: 'en',
      getLocation: () => h.location,
      assign: h.assign,
      fetchTarget: h.target,
    });

    h.setNextResponse(sessionExpiredResponse());
    await h.target.fetch('/whatever', { method: 'POST' });

    expect(h.assign).toHaveBeenCalledTimes(1);
    const href = h.assign.mock.calls[0][0] as string;
    expect(href).toContain('/en/login?reason=idle&returnTo=');
    // returnTo is URL-encoded from the injected location.
    expect(href).toContain(encodeURIComponent('/en/warehouse/grns/abc?tab=lines'));

    uninstall();
  });

  it('navigates exactly once when two session_expired responses arrive in a row (idempotent latch)', async () => {
    const uninstall = installSessionExpiryFetchGuard({
      locale: 'pl',
      getLocation: () => h.location,
      assign: h.assign,
      fetchTarget: h.target,
    });

    h.setNextResponse(sessionExpiredResponse());
    await h.target.fetch('/a', { method: 'POST' });
    h.setNextResponse(sessionExpiredResponse());
    await h.target.fetch('/b', { method: 'POST' });

    expect(h.assign).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it('does NOT redirect on a normal 200 and returns the SAME response object', async () => {
    const uninstall = installSessionExpiryFetchGuard({
      locale: 'en',
      getLocation: () => h.location,
      assign: h.assign,
      fetchTarget: h.target,
    });

    const ok = makeResponse({ status: 200 });
    h.setNextResponse(ok);
    const returned = await h.target.fetch('/ok', { method: 'POST' });

    expect(h.assign).not.toHaveBeenCalled();
    // Response is passed through untouched (not swallowed / cloned away).
    expect(returned).toBe(ok);

    uninstall();
  });

  it('does NOT redirect on a 403, nor a 401 WITHOUT the unique header (strict header gate)', async () => {
    const uninstall = installSessionExpiryFetchGuard({
      locale: 'en',
      getLocation: () => h.location,
      assign: h.assign,
      fetchTarget: h.target,
    });

    // RBAC denial.
    h.setNextResponse(makeResponse({ status: 403 }));
    await h.target.fetch('/forbidden', { method: 'POST' });

    // A 401 from some OTHER cause — no x-monopilot-auth header.
    h.setNextResponse(makeResponse({ status: 401 }));
    await h.target.fetch('/other-401', { method: 'POST' });

    expect(h.assign).not.toHaveBeenCalled();

    uninstall();
  });

  it('uninstall restores the original fetch on the target', () => {
    const uninstall = installSessionExpiryFetchGuard({
      locale: 'en',
      getLocation: () => h.location,
      assign: h.assign,
      fetchTarget: h.target,
    });

    expect(h.target.fetch).not.toBe(h.originalFetch);

    uninstall();

    expect(h.target.fetch).toBe(h.originalFetch);
  });
});
