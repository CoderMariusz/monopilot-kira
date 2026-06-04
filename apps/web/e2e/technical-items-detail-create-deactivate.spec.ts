/**
 * E2E — 03-technical Items Master: detail (TEC-012 / T-034), create wizard
 * (TEC-011 / T-033) and deactivate modal (TEC-081 / T-035).
 *
 * Deferred to module Gate-5 (live-deploy verification): this worktree has no
 * local Postgres + no Supabase env, so the authenticated click-through runs
 * against the deployed PREVIEW per docs/workflow/02-QUALITY-GATES.md Gate 5
 * (green-local ≠ live). The RTL suites
 * (items/_components/__tests__/item-create-wizard.test.tsx,
 *  items/_components/__tests__/deactivate-modal.test.tsx,
 *  items/[item_code]/_components/__tests__/item-detail-tabs.test.tsx)
 * already cover structure + the 5 UI states + interaction in jsdom; this spec
 * captures the live screenshots + trace for parity evidence.
 *
 * Run (against the preview, authenticated):
 *   pnpm --filter web exec playwright test e2e/technical-items-detail-create-deactivate.spec.ts --trace on
 */
import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@monopilot.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

test.describe('03-technical Items Master — detail / create / deactivate', () => {
  test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD not set — Gate-5 live run only');

  test.beforeEach(async ({ page }) => {
    await page.goto('/en/login');
    await page.fill('[name=email]', ADMIN_EMAIL);
    await page.fill('[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/en(\/|$)/);
  });

  test('items list deep-links to the detail page (TEC-012)', async ({ page }) => {
    await page.goto('/en/technical/items');
    const firstCode = page.locator('[data-screen="technical-items"] tbody tr td a').first();
    await firstCode.click();
    await expect(page.locator('[data-screen="technical-item-detail"]')).toBeVisible();
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(8);
    await page.screenshot({ path: 'test-results/T-034-item-detail-overview.png', fullPage: true });
    // switch to a deferred tab → bookmarkable + Coming-soon placeholder
    await page.getByRole('tab', { name: /BOM/i }).click();
    await expect(page).toHaveURL(/tab=bom/);
    await page.screenshot({ path: 'test-results/T-034-item-detail-deferred-tab.png', fullPage: true });
  });

  test('create wizard runs the 4 steps (TEC-011)', async ({ page }) => {
    await page.goto('/en/technical/items');
    await page.getByRole('button', { name: /New item/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab')).toHaveCount(4);
    await page.screenshot({ path: 'test-results/T-033-create-step-basic.png' });
    await dialog.locator('input[name="itemCode"]').fill(`E2E-${Date.now()}`);
    await dialog.locator('input[name="name"]').fill('E2E wizard item');
    await dialog.getByRole('button', { name: /Next/i }).click(); // classification
    await dialog.getByRole('button', { name: /Next/i }).click(); // weight
    await page.screenshot({ path: 'test-results/T-033-create-step-weight.png' });
    await dialog.getByRole('button', { name: /Next/i }).click(); // review
    await page.screenshot({ path: 'test-results/T-033-create-step-review.png' });
    await dialog.getByRole('button', { name: /Create item/i }).click();
    await expect(dialog).toBeHidden();
  });

  test('deactivate modal requires reason + type-to-confirm (TEC-081)', async ({ page }) => {
    await page.goto('/en/technical/items');
    await page.locator('tbody tr td a').first().click();
    await page.getByRole('button', { name: /Deactivate/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('data-modal-id', 'TEC-081');
    await page.screenshot({ path: 'test-results/T-035-deactivate-modal.png' });
    // confirm disabled until reason + code typed (asserted structurally in RTL)
    await expect(dialog.getByRole('button', { name: /^Deactivate$/i })).toBeDisabled();
  });
});
