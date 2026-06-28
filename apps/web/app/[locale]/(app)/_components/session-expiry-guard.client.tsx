'use client';

/**
 * IDLE-2 (task #62) — GLOBAL client-side "session expired" handler for ALL
 * Server Actions.
 *
 * When a Server Action POST hits the edge proxy on an idle/expired session,
 * `apps/web/proxy.ts` (`idleServerActionResponse`) returns HTTP 401 with body
 * `{ ok: false, reason: 'session_expired' }` AND the response header
 * `x-monopilot-auth: session_expired`. That header is UNIQUE to the
 * idle/expired response — RBAC 403s and other 401s do NOT set it.
 *
 * Next.js App Router dispatches Server Actions through the global
 * `window.fetch`, so a fetch wrapper installed once at the authenticated
 * app-shell mount observes every Server-Action response without touching the
 * ~300 individual call sites. On detecting the unique header we perform a
 * ONE-TIME hard redirect to the idle-login page (a full reload intentionally
 * clears stale client state on session loss).
 *
 * Detection is HEADER-ONLY: we never read `res.body` / `res.json()` (that would
 * consume the stream the Next runtime still needs) and we always return the
 * original response object unchanged.
 */

import { useEffect } from 'react';

type Locale = 'en' | 'pl' | 'uk' | 'ro';

const SESSION_EXPIRED_HEADER = 'x-monopilot-auth';
const SESSION_EXPIRED_VALUE = 'session_expired';

type FetchLike = typeof globalThis.fetch;

type LocationLike = {
  pathname: string;
  search: string;
};

type InstallGuardOptions = {
  locale: Locale;
  /** Source of the current location (injected for tests; real = window.location). */
  getLocation: () => LocationLike;
  /** Hard-navigation primitive (real = window.location.assign). */
  assign: (href: string) => void;
  /**
   * The fetch implementation to patch and to delegate to. Defaults to the
   * ambient `window.fetch` when omitted (production). Tests inject a fake.
   */
  fetchTarget?: { fetch: FetchLike };
};

/**
 * Build the idle-login href, preserving where the user was so the login flow
 * can return them after re-authentication. Mirrors the edge proxy's
 * `?reason=idle` contract (see proxy.ts `redirectToIdleLogin`).
 */
function buildIdleLoginHref(locale: Locale, location: LocationLike): string {
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return `/${locale}/login?reason=idle&returnTo=${returnTo}`;
}

function isSessionExpired(res: Response): boolean {
  // STRICT gate: trigger ONLY on the unique header, never on status code alone,
  // so RBAC/other 401s do not bounce the user to login.
  return res.headers.get(SESSION_EXPIRED_HEADER) === SESSION_EXPIRED_VALUE;
}

/**
 * Patch the target's `fetch` so every Server-Action response is observed. On
 * detecting the session-expired signal exactly ONE redirect is performed even
 * if many concurrent actions fail at once.
 *
 * Returns an uninstall function that restores the original fetch (and resets
 * the redirect-once latch) — used by the component's effect cleanup and by
 * tests.
 *
 * The redirect-once latch is scoped to this install call so each install gets
 * a fresh latch; concurrent failing actions within one install still navigate
 * exactly once.
 */
export function installSessionExpiryFetchGuard(options: InstallGuardOptions): () => void {
  const { locale, getLocation, assign } = options;
  const target = options.fetchTarget ?? (globalThis as unknown as { fetch: FetchLike });

  const originalFetch = target.fetch;

  // Per-install latch: ensures exactly one navigation across concurrent failing
  // Server Actions.
  let redirecting = false;

  function redirectOnce(): void {
    if (redirecting) return;
    redirecting = true;
    const href = buildIdleLoginHref(locale, getLocation());
    assign(href);
  }

  function maybeHandle(res: Response): void {
    if (isSessionExpired(res)) {
      redirectOnce();
    }
  }

  const patchedFetch = async (...args: Parameters<FetchLike>): Promise<Response> => {
    const res = await originalFetch(...args);
    // Header-only inspection — NEVER consume the body. Always return the
    // untouched response so the Next runtime can read it.
    maybeHandle(res);
    return res;
  };

  target.fetch = patchedFetch as FetchLike;

  return function uninstall(): void {
    // Only restore if nobody else re-patched on top of us (defensive).
    if (target.fetch === (patchedFetch as FetchLike)) {
      target.fetch = originalFetch;
    }
    redirecting = false;
  };
}

export type SessionExpiryGuardProps = {
  locale: Locale;
};

/**
 * Mounts once inside the authenticated app shell. Renders no DOM. All `window`
 * access is confined to the effect (SSR-safe).
 */
export function SessionExpiryGuard({ locale }: SessionExpiryGuardProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const uninstall = installSessionExpiryFetchGuard({
      locale,
      getLocation: () => ({
        pathname: window.location.pathname,
        search: window.location.search,
      }),
      assign: (href) => window.location.assign(href),
      fetchTarget: window as unknown as { fetch: FetchLike },
    });

    return uninstall;
  }, [locale]);

  return null;
}

export default SessionExpiryGuard;
