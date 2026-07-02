import { expect, test } from '@playwright/test';

/**
 * Wave F1 / lane C1 — platform super-admin fast-follow E2E (STUB).
 *
 * Covers the three enabled console controls: Export (client CSV), Add platform
 * admin (modal), and View full log (guarded /platform/audit page). Requires a
 * platform-admin authenticated session (admin@monopilot.test — the mig-410
 * bootstrap row) and a running app.
 *
 * Gated behind PLATFORM_E2E=1 so the default suite (which has no platform-admin
 * storage state wired yet) does not fail. The orchestrator flips the flag +
 * supplies auth storage state when promoting this from a stub. Parity anchors:
 * prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 * (.plat-top 82-90, .btn-primary/.btn-secondary 37-41, .audit-action 104-108).
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, baseURL).toString();
const enabled = process.env.PLATFORM_E2E === '1';

test.describe('PLATFORM-FASTFOLLOW-001 console controls', () => {
  test.skip(!enabled, 'set PLATFORM_E2E=1 + platform-admin storage state to run');

  test('Add platform admin opens a modal and reports a result', async ({ page }) => {
    await page.goto(routeUrl('/en/platform'));
    await expect(page.getByTestId('platform-topbar')).toBeVisible();

    await page.getByTestId('platform-add-admin').click();
    const modal = page.getByTestId('platform-add-admin-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');

    await page.getByTestId('platform-add-admin-email').fill('does-not-exist@example.com');
    await page.getByTestId('platform-add-admin-submit').click();
    // A no-such-user reports the not-found error (server-resolved).
    await expect(page.getByTestId('platform-add-admin-error')).toBeVisible();
  });

  test('Export downloads a CSV of the organizations table', async ({ page }) => {
    await page.goto(routeUrl('/en/platform'));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('platform-export').click(),
    ]);
    expect(download.suggestedFilename()).toBe('monopilot-organizations.csv');
  });

  test('View full log navigates to the guarded /platform/audit page', async ({ page }) => {
    await page.goto(routeUrl('/en/platform'));
    await page.getByTestId('platform-view-full-log').click();
    await expect(page).toHaveURL(/\/platform\/audit/);
    await expect(page.getByTestId('platform-audit-topbar')).toBeVisible();
    await expect(page.getByTestId('platform-audit-back')).toBeVisible();
  });

  test('non-platform-admin is redirected away from /platform', async ({ browser }) => {
    // Fresh context with no platform-admin session → layout redirects to dashboard.
    const context = await browser.newContext();
    const anon = await context.newPage();
    await anon.goto(routeUrl('/en/platform'));
    await expect(anon).not.toHaveURL(/\/platform(\/|$)/);
    await context.close();
  });
});
