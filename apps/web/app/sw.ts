/// <reference lib="webworker" />
import { Serwist, NetworkFirst } from 'serwist';
import { defaultCache } from '@serwist/next/worker';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// __WB_MANIFEST is injected by @serwist/next webpack plugin at build time.
// Guard for non-SW environments (e.g. unit tests running in Node).
const precacheEntries: (string | { url: string; revision: string | null })[] =
  typeof self !== 'undefined' && '__WB_MANIFEST' in self
    ? (self as unknown as { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }).__WB_MANIFEST
    : [];

// Only instantiate and wire event listeners in a real service worker context
if (typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in globalThis) {
  const serwist = new Serwist({
    precacheEntries,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
      // Override defaultCache's 10s NetworkFirst for /api/ routes with 5s timeout (T-041 AC3 / T-042 carry-forward)
      {
        matcher: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
        handler: new NetworkFirst({ networkTimeoutSeconds: 5 }),
      },
      ...defaultCache,
    ],
  });

  serwist.addEventListeners();
}
