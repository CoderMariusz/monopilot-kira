/// <reference lib="webworker" />
import { Serwist } from 'serwist';
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
    runtimeCaching: defaultCache
  });

  serwist.addEventListeners();
}
