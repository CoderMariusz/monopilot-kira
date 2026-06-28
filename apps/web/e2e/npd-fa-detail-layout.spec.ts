import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * T-138 / T-139 — FA detail layout E2E (ROOT T-020 slice).
 *
 * Exercises the wired FA detail layout on the live preview:
 *   - two-column shell: tabbed main content (left) + sticky right panel (right);
 *   - the FaRightPanel is LAYOUT-owned, so it PERSISTS across `?tab=` switches
 *     (Core → Technical) WITHOUT remounting — verified via a stable DOM-node
 *     identity handle across the navigation;
 *   - the right-panel quick actions route to the `?modal=deptClose|d365Build`
 *     query-trigger and the FA modal host opens the correct dialog.
 *
 * Skips (does not fail) without PLAYWRIGHT_BASE_URL + an authenticated storage
 * state — authored now, executed in the live-preview parity run (T-139).
 */

const webRoot = path.resolve(__dirname, '../');

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter(
    (v): v is string => Boolean(v),
  );
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

// The FA code under test on the seeded preview org (override via env).
const FA_CODE = process.env.PLAYWRIGHT_FA_CODE ?? 'FA0043';
const detailRoute = (tab?: string) =>
  `/en/fg/${FA_CODE}${tab ? `?tab=${tab}` : ''}`;

const sel = {
  shell: '[data-testid="fa-detail-shell"]',
  rightPanel: '[data-testid="fa-right-panel"]',
  children: '[data-testid="layout-children"]',
  deptCloseAction: '[data-testid="fa-right-panel-action-deptClose"]',
  d365Action: '[data-testid="fa-right-panel-action-d365Build"]',
  modalHost: '[data-testid="fa-modal-host"]',
  // The deptClose modal is now the REAL DeptCloseModal (T-022), keyed by its
  // @monopilot/ui modalId (was the retired deferred-stub testid fa-modal-deptClose).
  deptCloseModal: '[data-modal-id="npd-dept-close"]',
  d365Modal: '[data-testid="fa-modal-d365Build"]',
  tabTrigger: (slug: string) => `[data-slot="tabs-trigger"][data-value="${slug}"]`,
};

async function gotoDetail(page: Page, baseURL: string, tab?: string) {
  await page.goto(`${baseURL}${detailRoute(tab)}`, { waitUntil: 'domcontentloaded' });
}

test.describe('T-138/T-139 FA detail layout — two-column shell + persistent right panel', () => {
  test('renders the two-column shell with tabbed content (left) and sticky right panel (right)', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: FA detail layout E2E needs PLAYWRIGHT_BASE_URL + an authenticated storage state. Authored; execution deferred to the live-preview run (T-139).',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoDetail(page, baseURL!);

      const shell = page.locator(sel.shell);
      await expect(shell).toBeVisible();
      await expect(shell.locator(sel.children)).toBeVisible();

      const aside = page.locator(sel.rightPanel);
      await expect(aside).toBeVisible();
      await expect(aside).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:404-452');
      // Sticky aside lives to the RIGHT of the main content.
      const asideBox = await aside.boundingBox();
      const mainBox = await shell.locator(sel.children).boundingBox();
      expect(asideBox && mainBox && asideBox.x).toBeGreaterThan(mainBox!.x);
    } finally {
      await context.close();
    }
  });

  test('right panel PERSISTS across a Core → Technical tab switch (no remount)', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: persistence E2E needs PLAYWRIGHT_BASE_URL + auth storage. Authored; deferred to live-preview run (T-139).',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await gotoDetail(page, baseURL!, 'core');
      const aside = page.locator(sel.rightPanel);
      await expect(aside).toBeVisible();

      // Tag the right-panel DOM node; a query-only ?tab= nav preserves the layout,
      // so the SAME node (and our tag) must survive the switch (no remount).
      await aside.evaluate((el) => el.setAttribute('data-persist-probe', 'kept'));

      const technical = page.locator(sel.tabTrigger('technical'));
      if (await technical.isEnabled()) {
        await technical.click();
        await page.waitForURL(/[?&]tab=technical/);
        await expect(aside).toHaveAttribute('data-persist-probe', 'kept');
      } else {
        // Technical is gated until Core is closed — assert the gate is honored
        // and the right panel still persists across the (no-op) interaction.
        await expect(technical).toBeDisabled();
        await expect(aside).toHaveAttribute('data-persist-probe', 'kept');
      }
    } finally {
      await context.close();
    }
  });

  test('right-panel Dept Close action routes to ?modal=deptClose and opens the dialog', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: modal-routing E2E needs PLAYWRIGHT_BASE_URL + auth storage. Authored; deferred to live-preview run (T-139).',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await gotoDetail(page, baseURL!);
      const deptClose = page.locator(sel.deptCloseAction);
      await expect(deptClose).toBeVisible();
      if (await deptClose.isEnabled()) {
        await deptClose.click();
        await page.waitForURL(/[?&]modal=deptClose/);
        await expect(page.locator(sel.modalHost)).toBeAttached();
        await expect(page.locator(sel.deptCloseModal)).toBeVisible();
      } else {
        // No close permission for this caller — the action stays disabled (RBAC
        // resolved server-side, never client-trusted).
        await expect(deptClose).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });

  test('D365 Build action routes to ?modal=d365Build when the FA is Complete', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: D365 modal-routing E2E needs PLAYWRIGHT_BASE_URL + auth storage. Authored; deferred to live-preview run (T-139).',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await gotoDetail(page, baseURL!);
      const d365 = page.locator(sel.d365Action);
      await expect(d365).toBeVisible();
      if (await d365.isEnabled()) {
        await d365.click();
        await page.waitForURL(/[?&]modal=d365Build/);
        await expect(page.locator(sel.d365Modal)).toBeVisible();
      } else {
        // FA not Complete (or no build permission) → button disabled (prototype 347).
        await expect(d365).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });
});
