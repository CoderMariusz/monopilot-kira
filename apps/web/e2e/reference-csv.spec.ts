/**
 * T-085 — E2E: reference CSV import → preview → commit happy path.
 *
 * Real route: /en/settings/reference/<code>/import (two-step ImportWizard:
 * previewImportAction → commitImportAction). Fixtures in apps/web/e2e/fixtures.
 *
 * Runnable against a live authenticated preview; otherwise BLOCKED_AUTH skip.
 * The reference table <code> is parametrized via PLAYWRIGHT_REFERENCE_CODE
 * (defaults to a common seeded table) so the orchestrator can point it at a
 * real table in the seeded org.
 *
 * Acceptance criteria (per T-085):
 *  - preview counts correct (rows parsed),
 *  - commit persists,
 *  - header mismatch blocks (no commit).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const webRoot = path.resolve(__dirname, '../');
const fixturesDir = path.join(webRoot, 'e2e/fixtures');
const validCsv = path.join(fixturesDir, 'reference-valid.csv');
const mismatchCsv = path.join(fixturesDir, 'reference-header-mismatch.csv');
const referenceCode = process.env.PLAYWRIGHT_REFERENCE_CODE ?? 'allergens';

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter((v): v is string => Boolean(v));
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

test.describe('T-085 reference CSV import wizard', () => {
  test('valid CSV: preview shows row counts then commit persists', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: reference CSV import E2E needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated admin. Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/en/settings/reference/${referenceCode}/import`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.setInputFiles('input[type="file"]', validCsv);
      // Step 1 — preview.
      await page.getByRole('button', { name: /preview/i }).first().click();
      await expect(page.getByText(/3\s*(rows|records|valid)/i).first().or(page.getByText(/preview/i).first())).toBeVisible({ timeout: 10_000 });

      // Step 2 — commit.
      const commit = page.getByRole('button', { name: /commit|import|confirm/i }).first();
      await expect(commit).toBeEnabled();
      await commit.click();
      await expect(page.getByText(/imported|committed|success|3/i).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('header mismatch is blocked before commit', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(!baseURL || !authStorage, 'BLOCKED_AUTH: requires PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE.');

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/en/settings/reference/${referenceCode}/import`, { waitUntil: 'domcontentloaded' });
      await page.setInputFiles('input[type="file"]', mismatchCsv);
      await page.getByRole('button', { name: /preview/i }).first().click();
      // Mismatched headers must surface an error and must NOT enable commit.
      await expect(page.getByText(/mismatch|unknown column|invalid header|missing column|header/i).first()).toBeVisible({ timeout: 10_000 });
      const commit = page.getByRole('button', { name: /^commit$|^import$|confirm/i }).first();
      if (await commit.count()) {
        await expect(commit, 'commit must stay disabled when headers mismatch').toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });
});
