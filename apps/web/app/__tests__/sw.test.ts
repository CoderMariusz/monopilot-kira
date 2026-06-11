import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-parse helpers: read sw.ts as text so assertions don't require a SW runtime.
// These tests verify the static shape of the service-worker entry file.
// Runtime behaviour (SW lifecycle, offline fallback, cache hits) is tested in T-042 E2E.
//
// REALITY CHECK (wave 8a, fix K5-7): app/sw.ts is a @serwist/next (webpack-plugin)
// entry, but the production build runs Turbopack, which never emits it — so
// nothing below describes what production actually serves at /sw.js. The
// `import('../sw.js')` in the first test is resolved BY VITE to ../sw.ts
// (standard .js→.ts extension rewriting), which is why this suite was green
// while every live page 404'd on /sw.js. The worker production actually serves
// is the static no-op public/sw.js — covered by its own describe block below.
const swSource = readFileSync(resolve(__dirname, '../sw.ts'), 'utf8');

describe('sw.ts (Serwist entry — NOT emitted by the Turbopack production build)', () => {
  it('should export a valid service worker module', async () => {
    // Guard is in sw.ts: new Serwist() is only called inside a ServiceWorkerGlobalScope
    // check, so importing in Node/Vitest is safe. NOTE: '../sw.js' resolves to
    // ../sw.ts under Vite — this does NOT prove a /sw.js asset exists.
    const sw = await import('../sw.js');
    expect(sw).toBeDefined();
  });

  it('should import defaultCache from @serwist/next/worker (AC3 — runtime caching configured)', () => {
    // Confirms the sw entry pulls in the recommended Next.js caching strategy set.
    expect(swSource).toMatch(/import\s*\{[^}]*defaultCache[^}]*\}\s*from\s*['"]@serwist\/next\/worker['"]/);
  });

  it('should pass defaultCache as runtimeCaching to Serwist constructor', () => {
    // After T-042: runtimeCaching is an array that spreads defaultCache (to add the /api/ override);
    // confirm defaultCache is still wired into the runtime cache configuration.
    expect(swSource).toContain('defaultCache');
    expect(swSource).toMatch(/runtimeCaching\s*:/);
  });

  it('should configure skipWaiting: true (AC2 — SW activates immediately)', () => {
    expect(swSource).toContain('skipWaiting: true');
  });

  it('should configure clientsClaim: true (AC2 — SW controls existing clients)', () => {
    expect(swSource).toContain('clientsClaim: true');
  });

  it('should wire __WB_MANIFEST precache entries (AC1 — app shell precached at build time)', () => {
    // The __WB_MANIFEST injection guard ensures the build plugin replaces this token
    // with the real precache manifest; in non-SW envs the array falls back to [].
    expect(swSource).toContain('__WB_MANIFEST');
    expect(swSource).toContain('precacheEntries');
  });

  it('should include a NetworkFirst handler for /api/ routes in defaultCache (AC3)', async () => {
    // Import defaultCache directly to assert the strategy present at runtime.
    // NOTE — PRD-vs-code drift (tracked for T-042):
    //   T-041 AC3 specifies networkTimeoutSeconds: 5.
    //   @serwist/next defaultCache ships networkTimeoutSeconds: 10 for the /api/ route.
    //   The correct strategy class (NetworkFirst) is in place; only the timeout value
    //   deviates from the PRD. Reconciling 10s → 5s requires a custom runtimeCaching
    //   entry in sw.ts overriding defaultCache for /api/. This is a carry-forward to T-042.
    const { defaultCache } = await import('@serwist/next/worker');
    // defaultCache entries differ by env; in non-production (test) it collapses to
    // a single NetworkOnly catch-all. Import the production list from the package source.
    const workerSrc = readFileSync(
      resolve(__dirname, '../../node_modules/@serwist/next/dist/index.worker.mjs'),
      'utf8'
    );
    // Assert: a NetworkFirst entry targeting /api/ exists and carries networkTimeoutSeconds: 10
    expect(workerSrc).toMatch(/pathname\.startsWith\(["']\/api\/["']\)/);
    expect(workerSrc).toMatch(/new NetworkFirst\(/);
    expect(workerSrc).toMatch(/networkTimeoutSeconds:\s*10/);
  });

  it('should include a CacheFirst handler for _next/static JS assets in defaultCache', () => {
    const workerSrc = readFileSync(
      resolve(__dirname, '../../node_modules/@serwist/next/dist/index.worker.mjs'),
      'utf8'
    );
    // CacheFirst for /_next/static JS is the long-lived immutable asset strategy.
    // The .mjs source has regex literals serialised with escaped slashes.
    expect(workerSrc).toContain('next-static-js-assets');
    expect(workerSrc).toMatch(/new CacheFirst\(/);
  });

  // AC3 offline-fallback behaviour (SW serves cached /api/health when network is down)
  // requires a real browser SW lifecycle and cannot be exercised in a Node/Vitest unit test.
  it.skip('offline fallback: SW serves /api/health from cache within timeout — moved to T-042 E2E', () => {
    // Verify in apps/web/e2e/pwa.spec.ts using Playwright page.context().setOffline(true).
    // T-042 AC3: "Given /api/health was hit twice online, when offline + third fetch runs,
    // then the SW returns the cached response with header X-Served-By='sw' and status 200."
  });
});

// What production ACTUALLY serves at /sw.js: the static no-op worker in
// public/. It exists so RegisterSW's probe stops 404ing on every page and
// registration succeeds; it must do NOTHING beyond the lifecycle handshake.
describe('public/sw.js (the worker production actually serves)', () => {
  const publicSwSource = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

  it('exists and activates immediately (skipWaiting on install)', () => {
    expect(publicSwSource).toMatch(/addEventListener\(\s*['"]install['"]/);
    expect(publicSwSource).toContain('self.skipWaiting()');
  });

  it('claims clients on activate', () => {
    expect(publicSwSource).toMatch(/addEventListener\(\s*['"]activate['"]/);
    expect(publicSwSource).toContain('self.clients.claim()');
  });

  it('is a no-op: NO fetch handler and NO caching (stale precache must never shadow deploys)', () => {
    expect(publicSwSource).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
    expect(publicSwSource).not.toMatch(/caches\.(open|match|keys)/);
  });
});
