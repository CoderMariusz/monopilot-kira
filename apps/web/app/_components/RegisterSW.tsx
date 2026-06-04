'use client';

import { useEffect } from 'react';

/**
 * RegisterSW — mounts in root layout and (best-effort) registers the service
 * worker.
 *
 * Registration is intentionally skipped in development to avoid stale precache
 * breaking Next.js HMR (T-041 risk red line).
 *
 * In production the app is bundled with Turbopack, which `@serwist/next`
 * (a webpack plugin) does not support — so `/sw.js` is NOT emitted by the build.
 * Requesting a non-existent `/sw.js` returns the HTML 404 document
 * (`text/html`), and `navigator.serviceWorker.register('/sw.js')` then throws
 * `SecurityError: ... unsupported MIME type ('text/html')` on EVERY page load.
 *
 * To eliminate that console spam without coupling the UI to the bundler choice,
 * this component PROBES `/sw.js` first and only registers when the server
 * actually serves a JavaScript asset. When the worker isn't emitted (Turbopack
 * build) the probe fails the content-type check and registration is skipped
 * silently — no SecurityError, no error-level logging. Once a Turbopack-
 * compatible SW pipeline emits a real `/sw.js`, registration resumes
 * automatically with no further code change.
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

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (!('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;

    // Probe the SW asset before registering. If the build did not emit /sw.js
    // (e.g. Turbopack), the server returns the HTML 404 page; registering that
    // would throw a SecurityError (unsupported MIME type) on every load.
    void fetch('/sw.js', { method: 'GET', cache: 'no-store' })
      .then((response) => {
        if (cancelled) return;
        const contentType = response.headers.get('content-type');
        if (!response.ok || !looksLikeJavaScript(contentType)) {
          // No usable service worker asset — skip registration silently.
          return;
        }
        return navigator.serviceWorker.register('/sw.js').then(() => undefined);
      })
      .catch(() => {
        // Fail silent: a missing/unsupported SW must never surface as a runtime
        // error to the user or spam the console.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
