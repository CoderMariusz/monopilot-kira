/**
 * Minimal scanner service worker — READ-ONLY cache only.
 *
 * Served from /public so Turbopack production builds can register a real
 * JavaScript asset (Serwist's webpack plugin does not emit under Turbopack).
 *
 * Strategies:
 *   - App shell / static assets → cache-first (offline last-known screens)
 *   - Navigations + /api/ GET   → network-first with cache fallback
 *   - Non-GET                   → pass through (NO offline write-queue / sync)
 */
/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'monopilot-scanner-ro-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/**
 * @param {Request} request
 * @returns {boolean}
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/_next/static/')) return true;
  return /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(url.pathname);
}

/**
 * @param {Request} request
 * @returns {boolean}
 */
function isSameOriginGet(request) {
  if (request.method !== 'GET') return false;
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

/**
 * Cache-first: serve cached static asset; populate cache on miss.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    void cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first: try network, fall back to cache (last-known screen / data).
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new TypeError('network failed and no cache match');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Fail closed on writes: never intercept non-GET (no offline queue).
  if (request.method !== 'GET') return;
  if (!isSameOriginGet(request)) return;

  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigations + API GETs + same-origin reads: network-first, cache fallback.
  event.respondWith(networkFirst(request));
});
