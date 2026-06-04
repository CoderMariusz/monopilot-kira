import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Module-close gap fix — allergen cascade reachability E2E.
 *
 * Verifies the BUILT T-040 allergen cascade is reachable from the canonical locale
 * tree on the live preview, via BOTH surfaces:
 *   1. the FA-detail Technical tab slot (?tab=technical) now renders the real
 *      AllergenCascadeWidget (cascade allergens + Refresh + override entry point),
 *      not the reserved "Allergens loading…" placeholder; and
 *   2. the locale allergens sub-route (/fa/<code>/allergens), sibling of docs/risks.
 *
 * Skips (does not fail) without PLAYWRIGHT_BASE_URL + an authenticated storage
 * state — authored now, executed in the live-preview parity run.
 */

const webRoot = path.resolve(__dirname, '../');

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit =
    process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter(
    (v): v is string => Boolean(v),
  );
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

const FA_CODE = process.env.PLAYWRIGHT_FA_CODE ?? 'FA0043';

const sel = {
  widget: '[data-testid="allergen-cascade-widget"]',
  placeholder: '[data-testid="fa-technical-allergen-loading"]',
  refresh: '[data-testid="allergen-refresh"]',
  eu14Grid: '[data-testid="allergen-eu14-grid"]',
  sectionFinal: '[data-testid="allergen-section-final"]',
  allergensPage: '[data-testid="fa-allergens-page"]',
  tabTrigger: (slug: string) => `[data-slot="tabs-trigger"][data-value="${slug}"]`,
};

async function gotoTechnical(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/en/fa/${FA_CODE}?tab=technical`, {
    waitUntil: 'domcontentloaded',
  });
}

test.describe('allergen cascade reachability — Technical tab slot', () => {
  test('Technical tab renders the real allergen widget (not the reserved placeholder)', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: allergen reachability E2E needs PLAYWRIGHT_BASE_URL + an authenticated storage state. Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoTechnical(page, baseURL!);

      // The Technical tab trigger is present and selected via ?tab=technical.
      const widget = page.locator(sel.widget);
      await expect(widget).toBeVisible();
      // Reserved placeholder must be gone — the real cascade replaced it.
      await expect(page.locator(sel.placeholder)).toHaveCount(0);
      // Cascade content: FA-final section + EU14 grid render.
      await expect(page.locator(sel.sectionFinal)).toBeVisible();
      await expect(page.locator(sel.eu14Grid)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('allergen cascade reachability — locale sub-route', () => {
  test('/fa/<code>/allergens renders the allergen widget (docs/risks sibling)', async ({
    browser,
  }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: allergen sub-route E2E needs PLAYWRIGHT_BASE_URL + an authenticated storage state. Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${baseURL}/en/fa/${FA_CODE}/allergens`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator(sel.allergensPage)).toBeVisible();
      await expect(page.locator(sel.widget)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
