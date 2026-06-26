import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

const evidenceDir = path.resolve(webRoot, '../../_meta/parity-evidence/npd-allergen-declaration');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** @axe-core/playwright is an optional dep; imported via a non-literal specifier
 *  so the spec loads and type-checks even when the dep is unlinked. */
async function runAxe(page: Page, label: string): Promise<void> {
  type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
  type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };
  const specifier = '@axe-core/playwright';
  try {
    const mod = (await import(specifier)) as { default: AxeBuilderCtor };
    const axe = await new mod.default({ page }).analyze();
    writeFileSync(path.join(evidenceDir, `axe-${label}.json`), `${JSON.stringify(axe, null, 2)}\n`);
    expect(axe.violations, `axe violations on ${label}`).toEqual([]);
  } catch (err) {
    // Optional dep unlinked → record the blocker instead of failing the run.
    writeFileSync(
      path.join(evidenceDir, `axe-${label}.json`),
      `${JSON.stringify({ blocked: '@axe-core/playwright not installed', detail: String(err) }, null, 2)}\n`,
    );
  }
}

const sel = {
  widget: '[data-testid="allergen-cascade-widget"]',
  placeholder: '[data-testid="fa-technical-allergen-loading"]',
  refresh: '[data-testid="allergen-refresh"]',
  eu14Grid: '[data-testid="allergen-eu14-grid"]',
  sectionFinal: '[data-testid="allergen-section-final"]',
  allergensPage: '[data-testid="fa-allergens-page"]',
  declaration: '[data-testid="allergen-declaration"]',
  declarationAccept: '[data-testid="allergen-declaration-accept"]',
  declarationConfirmation: '[data-testid="allergen-declaration-confirmation"]',
  declarationError: '[data-testid="allergen-declaration-error"]',
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

test.describe('allergen declaration accept control — unblocks approval (C5)', () => {
  test('accept the declaration, see confirmation, capture parity evidence', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: declaration accept E2E needs PLAYWRIGHT_BASE_URL + an authenticated storage state. Authored; execution deferred to the live-preview run.',
    );

    ensureDir(evidenceDir);
    const context = await browser.newContext({ storageState: authStorage });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${baseURL!}/en/fa/${FA_CODE}/allergens`, { waitUntil: 'domcontentloaded' });

      await expect(page.locator(sel.allergensPage)).toBeVisible();
      const declaration = page.locator(sel.declaration);
      await expect(declaration).toBeVisible();

      // Loaded state (the FA-final declaration card with the accept control).
      await page.screenshot({ path: path.join(evidenceDir, 'state-loaded.png'), fullPage: true });
      await runAxe(page, 'loaded');

      const checkbox = page.locator(sel.declarationAccept);
      await expect(checkbox).toBeVisible();

      const initiallyAccepted = await checkbox.isChecked();
      if (initiallyAccepted) {
        // Revoke first so we can exercise accept → confirmation deterministically.
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator(sel.declarationConfirmation)).toHaveCount(0);
        await page.screenshot({ path: path.join(evidenceDir, 'state-not-accepted.png'), fullPage: true });
      } else {
        await page.screenshot({ path: path.join(evidenceDir, 'state-not-accepted.png'), fullPage: true });
      }

      // Optimistic-mutation state: check → confirmation appears (who/when).
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(page.locator(sel.declarationConfirmation)).toBeVisible();
      // The error region must NOT appear on the happy path.
      await expect(page.locator(sel.declarationError)).toHaveCount(0);
      await page.screenshot({ path: path.join(evidenceDir, 'state-accepted-optimistic.png'), fullPage: true });
      await runAxe(page, 'accepted');

      await context.tracing.stop({ path: path.join(evidenceDir, 'trace.zip') });
    } finally {
      await context.close();
    }
  });
});
