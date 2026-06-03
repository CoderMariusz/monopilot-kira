import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { installBrowserErrorSpies } from './_helpers/shell-parity';

/**
 * SET-034 / T-128 — Schema Shadow Preview parity evidence.
 *
 * SET-034 has NO JSX prototype: it is document/spec-driven. The nearest
 * reusable design language (per UI-PROTOTYPE-PARITY-POLICY.md §1.2) is the
 * settings schema admin screens (settings/admin-screens.jsx:414-469) + the
 * existing schema admin page structure.
 *
 * Previously this spec was an unconditional `test.skip(true)` stub. Wave 6
 * un-skips it: it now RUNS for real when an authenticated preview is provided
 * (PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE) and captures per-state
 * screenshots + a parity report against the real route. When that infra is
 * absent it `test.skip(...)`s honestly with a BLOCKED_AUTH note instead of
 * faking artifacts. The RTL suite
 *   app/[locale]/(app)/(admin)/settings/schema/preview/page.test.tsx
 * remains the real 5-state + real-data unit evidence.
 */

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const evidenceDir = path.join(webRoot, 'e2e/parity-evidence/SET-034');
const targetRoute = '/en/settings/schema/preview';
const prototypeAnchor = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:414-469';
const viewport = { width: 1440, height: 1000 };

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [
    explicit,
    path.join(webRoot, 'e2e/.auth/user.json'),
    path.join(webRoot, 'e2e/auth-storage.json'),
    path.join(webRoot, 'playwright/.auth/user.json'),
  ].filter((v): v is string => Boolean(v));
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
}

test.describe('SET-034 schema shadow preview parity evidence', () => {
  test('captures per-state screenshots and a parity report against the real route', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: SET-034 schema shadow preview parity needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated admin session on the live preview. RTL suite (page.test.tsx, 5 states) is the unit-level real evidence; screenshot capture is deferred to the live-preview run.',
    );

    mkdirSync(evidenceDir, { recursive: true });
    const context = await browser.newContext({ viewport, storageState: authStorage });
    const page = await context.newPage();
    const spy = installBrowserErrorSpies(page);
    spy.setRoute(targetRoute);

    try {
      const response = await page.goto(`${baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await shot(page, 'target-default-desktop.png');

      // Spec-driven query-param states the page understands.
      for (const state of ['loading', 'no-drafts', 'permission-denied'] as const) {
        await page.goto(`${baseURL}${targetRoute}?state=${state}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await shot(page, `target-${state}-desktop.png`);
      }

      const finalPathname = new URL(page.url()).pathname;
      const browserFailures = spy.failuresFor(targetRoute);
      const report = {
        task_id: 'SET-034',
        prototype_anchor: prototypeAnchor,
        spec_driven: true,
        target_route: targetRoute,
        base_url: baseURL,
        viewport: 'desktop-1440x1000',
        generated_at: new Date().toISOString(),
        target_http_status: response?.status() ?? null,
        final_pathname: finalPathname,
        browser_failures: browserFailures,
        states_captured: ['default', 'loading', 'no-drafts', 'permission-denied'],
        status: browserFailures.length === 0 ? 'CAPTURED' : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(report, null, 2)}\n`);

      expect(response?.status() ?? 500).toBeLessThan(500);
      expect(browserFailures, 'schema preview route must not emit console/network/page errors').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
