/**
 * Walking Skeleton (Wave 0) — the executable Definition of Done.
 *
 * Proves a user can: reach the login screen → land on the app shell when
 * authenticated → click through every menu item (no dead links) → see the
 * data-wiring on each page (live-data panel on real-data modules, honest stub
 * notice elsewhere, org summary on the dashboard).
 *
 * Two modes:
 *  - Default (local parity harness OR any PLAYWRIGHT_BASE_URL): asserts the
 *    clickable skeleton + that the data-wiring renders. The parity harness runs
 *    with a fake Supabase + no Postgres, so the live counts degrade to the
 *    honest "unavailable" state — that is still a real render, not a mock.
 *  - WALKING_SKELETON_REQUIRE_DB=1 (point PLAYWRIGHT_BASE_URL + auth storage at
 *    a real Supabase-backed deploy/preview): additionally asserts the counts
 *    are live numbers — the strict DoD #4 "DB-backed value renders".
 */
import { expect, test } from '@playwright/test';

import { APP_NAV_GROUPS } from '../lib/navigation/app-nav';
import {
  resolveAuthStorageState,
  startLocalShellParityHarness,
  type ShellParityHarness,
} from './_helpers/shell-parity';

// Modules wired to a real org-scoped Supabase table in Wave 0 (the rest are
// honest stubs until their module ships).
const REAL_DATA_MODULES = new Set(['technical', 'production', 'quality', 'shipping', 'warehouse']);
const requireDbValues = process.env.WALKING_SKELETON_REQUIRE_DB === '1';

let activeBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const authStorageState = resolveAuthStorageState();
let harness: ShellParityHarness | undefined;

if (authStorageState) {
  test.use({ storageState: authStorageState });
}

const menuItems = APP_NAV_GROUPS.flatMap((group) => group.items);

test.describe('Walking Skeleton — clickable, DB-backed product (Wave 0 DoD)', () => {
  test.beforeAll(async () => {
    if (!authStorageState) {
      harness = await startLocalShellParityHarness();
      activeBaseURL = harness.baseURL;
    }
  });

  test.afterAll(async () => {
    await harness?.close();
    harness = undefined;
  });

  test('login → shell → full menu click-through → data renders', async ({ page }) => {
    await harness?.installAuthCookie(page.context());
    const url = (route: string) => new URL(route, activeBaseURL).toString();

    // DoD #1 — the login screen serves (auth entry point exists).
    const login = await page.goto(url('/en/login'), { waitUntil: 'domcontentloaded' });
    expect(login?.status() ?? 0, 'login route must serve').toBeLessThan(400);

    // DoD #1 + #2 — authenticated home lands on the full app shell.
    await page.goto(url('/en/'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible();

    // DoD #3 — click EVERY sidebar item; each routes to a real page with the
    // shell intact and the expected data-wiring rendered.
    for (const item of menuItems) {
      const link = page.locator(`[data-testid="app-sidebar-item-${item.key}"]`);
      await expect(link, `sidebar must expose item ${item.key}`).toBeVisible();
      await link.click();
      await page.waitForURL(`**/en${item.route}`, { timeout: 30_000 });

      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

      if (item.module_id && item.module_id !== 'settings') {
        await expect(
          page.locator(`[data-testid="module-landing-${item.module_id}"]`),
          `${item.route} must render its module landing`,
        ).toBeVisible();
      }

      if (item.module_id && REAL_DATA_MODULES.has(item.module_id)) {
        await expect(
          page.locator('[data-testid="module-live-data"]'),
          `${item.route} must render the live-data panel`,
        ).toBeVisible();
      }
    }

    // DoD #4 — dashboard renders the live org summary with all metric tiles.
    await page.goto(url('/en/dashboard'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="dashboard-org-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid^="dashboard-metric-"]')).toHaveCount(6);

    // DoD #4 (strict) — against a real Supabase-backed target, the counts must
    // be live numbers, not the "unavailable" fallback.
    if (requireDbValues) {
      await page.goto(url('/en/production'), { waitUntil: 'domcontentloaded' });
      const liveText = await page.locator('[data-testid="module-live-data"]').innerText();
      expect(liveText, 'production live panel must show a real record count').toMatch(/\d/);

      await page.goto(url('/en/dashboard'), { waitUntil: 'domcontentloaded' });
      const usersTile = await page.locator('[data-testid="dashboard-metric-users"]').innerText();
      expect(usersTile, 'dashboard users metric must be a live number').toMatch(/\d/);
    }
  });
});
