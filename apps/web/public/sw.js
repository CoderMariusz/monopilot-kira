/**
 * Minimal no-op service worker (statically served from /public).
 *
 * WHY THIS FILE EXISTS: the Serwist entry (app/sw.ts) is a webpack-plugin
 * artifact and the production build runs Turbopack, so no /sw.js is ever
 * emitted by the bundler. RegisterSW.tsx probes GET /sw.js on every page load;
 * without this file that probe 404s on EVERY page (the owner's live finding)
 * and registration is skipped. Serving this no-op worker makes the probe and
 * registration succeed with zero caching behaviour.
 *
 * INTENTIONALLY NO fetch handler and NO caching: stale precache must never
 * shadow fresh deploys. When a Turbopack-compatible Serwist pipeline lands,
 * its emitted worker replaces this file (same /sw.js URL — clients update on
 * the next navigation per the SW lifecycle).
 */
self.addEventListener('install', () => {
  // Activate immediately — do not wait for old workers/clients.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of uncontrolled clients right away.
  event.waitUntil(self.clients.claim());
});
