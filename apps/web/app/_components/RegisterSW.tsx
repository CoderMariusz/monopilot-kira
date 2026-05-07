'use client';

import { useEffect } from 'react';

/**
 * RegisterSW — mounts in root layout and registers the service worker.
 * Registration is intentionally skipped in development to avoid stale
 * precache breaking Next.js HMR (T-041 risk red line).
 */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => {
        console.error('[RegisterSW] Service worker registration failed:', err);
      });
  }, []);

  return null;
}
