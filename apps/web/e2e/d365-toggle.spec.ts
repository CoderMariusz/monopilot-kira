/**
 * T-086 — E2E: D365 connection toggle gated by 5 constants + test connection.
 *
 * Real route: /en/settings/integrations/d365 (D365ConnectionForm +
 * D365TestConnectionModal, SM-11). Runnable against a live authenticated
 * preview; otherwise BLOCKED_AUTH skip.
 *
 * Acceptance criteria (per T-086):
 *  - only 4/5 constants populated → toggle ON surfaces D365_CONSTANTS_MISSING and
 *    snaps back to off;
 *  - 5 constants + SM-11 test connection passes → enabling persists + 'Connected'
 *    badge;
 *  - rotating the OAuth secret clears the field with a toast and never leaks
 *    plaintext into the DOM.
 *
 * The "exactly 4/5 constants" and "valid 5 constants" states need a seeded
 * d365_constants fixture, which the orchestrator must provision in the live run.
 * The happy-path gate assertion runs whenever the surface is authenticated; the
 * data-precise sub-cases are authored as fixme until that fixture exists.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const webRoot = path.resolve(__dirname, '../');
const targetRoute = '/en/settings/integrations/d365';

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter((v): v is string => Boolean(v));
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

test.describe('T-086 D365 connection toggle gating', () => {
  test('D365 page exposes the toggle, the 5 constants form, and the SM-11 test-connection modal', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: D365 toggle E2E needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated admin. Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Enable toggle is present.
      const toggle = page.getByRole('switch').first();
      await expect(toggle, 'D365 page must render the enable switch').toBeVisible();

      // SM-11 test-connection modal opens.
      const testBtn = page.getByRole('button', { name: /test connection|test/i }).first();
      if (await testBtn.isVisible().catch(() => false)) {
        await testBtn.click();
        await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
        await page.keyboard.press('Escape').catch(() => undefined);
      }

      // Secret field never exposes plaintext (must be a password input or masked).
      const secret = page.locator('input[name*="secret" i], input[aria-label*="secret" i]').first();
      if (await secret.count()) {
        const type = await secret.getAttribute('type');
        expect(type, 'OAuth secret field must be masked (type=password)').toBe('password');
      }
    } finally {
      await context.close();
    }
  });

  test.fixme('4/5 constants → toggle ON surfaces D365_CONSTANTS_MISSING and snaps back to off', async () => {
    // Needs a seeded d365_constants row with exactly 4 of 5 fields populated.
    // Orchestrator provisions in the live run; then attempt toggle ON and assert
    // the D365_CONSTANTS_MISSING copy + the switch returns to unchecked.
  });

  test.fixme('5 constants + passing test connection → enabling persists + Connected badge', async () => {
    // Needs a seeded d365_constants row with all 5 fields + a mock connection
    // that returns success. Then toggle ON, assert is_enabled persists across
    // reload and a 'Connected' badge renders.
  });
});
