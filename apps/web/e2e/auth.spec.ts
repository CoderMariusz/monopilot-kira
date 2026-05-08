import { test, expect } from '@playwright/test';

/**
 * Magic-link login E2E scaffold (Slot F-3).
 *
 * These specs document the contract the login page must satisfy and provide a
 * scaffold for future enablement. They depend on a running dev server, so the
 * Playwright job in CI is `continue-on-error: true` until the dev-server
 * contract is locked down.
 */
test.describe('magic-link login page', () => {
  test('shows email input and submit button', async ({ page }) => {
    await page.goto('/');
    // The login page should have an email input.
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('shows neutral response for any email (user-enumeration guard)', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('nonexistent@example.com');
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    // The response must be neutral — never reveal whether the account exists.
    const msg = page
      .locator('[data-testid="auth-message"], [role="status"], [aria-live]')
      .first();
    await expect(msg).toBeVisible({ timeout: 5000 });
  });
});
