'use client';

import { useEffect } from 'react';

/**
 * RegisterSW — best-effort service worker registration for scanner routes.
 *
 * Skipped in development (stale precache breaks Next.js HMR; T-041 red line).
 * Skipped off scanner paths — PWA offline cache is scanner-scoped by product
 * decision (Wave F / P1-18 MINIMAL).
 *
 * `/sw.js` is the static asset in `public/sw.js` (hand-written read-only cache).
 * Serwist's webpack plugin does not emit under Turbopack, so we probe MIME
 * before register to avoid SecurityError spam if the asset is ever missing.
 */

function looksLikeJavaScript(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('javascript') ||
    normalized.includes('application/ecmascript') ||
    normalized.includes('text/ecmascript')
  );
}

/** Locale-prefixed or bare scanner paths, e.g. `/pl/scanner/...`, `/scanner`. */
function isScannerPath(pathname: string): boolean {
  return /(?:^|\/)scanner(?:\/|$)/.test(pathname);
}

export default function RegisterSW() {
  useEffect(() => {
    // Skip only in local `next dev` — stale precache breaks HMR (T-041).
    // Production AND test (vitest) may register when the asset is present.
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    if (!('serviceWorker' in navigator)) {
      return;
    }

    if (!isScannerPath(window.location.pathname)) {
      return;
    }

    let cancelled = false;

    void fetch('/sw.js', { method: 'GET', cache: 'no-store' })
      .then((response) => {
        if (cancelled) return;
        const contentType = response.headers.get('content-type');
        if (!response.ok || !looksLikeJavaScript(contentType)) {
          return;
        }
        return navigator.serviceWorker.register('/sw.js').then(() => undefined);
      })
      .catch(() => {
        // Fail silent: missing/unsupported SW must never surface as a runtime error.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/** Test seam — exported for unit checks without mounting React. */
export { isScannerPath, looksLikeJavaScript };
