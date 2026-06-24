/**
 * WAVE W11 — direct stock-adjustment (/warehouse/adjustments/new) per-state
 * screenshot / trace / axe harness.
 *
 * Spec-driven; nearest reusable prototype = the warehouse M-03 stock-move modal
 * (prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499), per
 * UI-PROTOTYPE-PARITY-POLICY.md §1.2. DS conformance: PageHeader + shadcn Select
 * + search comboboxes (item / supervisor) + the count-session e-sign block
 * idiom; no raw <select>.
 *
 * The route is org-scoped + RBAC-gated (warehouse.stock.adjust), so live capture
 * requires an authenticated Supabase session against a running app server
 * (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset
 * (the default in this isolated worktree) the live capture is SKIPPED and the
 * accepted fallback evidence is the RTL coverage:
 *   .../warehouse/adjustments/_components/__tests__/direct-adjust-form.test.tsx
 *     (core parity fields; INCREASE batch/expiry + NO supervisor/LP; DECREASE
 *      supervisor-block + PIN + specific-LP picker, batch/expiry hidden; pl
 *      i18n; forbidden surfaces inline; decrease submit carries
 *      supervisorUserId+supervisorPin; increase submit carries neither +
 *      generated clientOpId).
 * This spec is the harness that produces pixel screenshots + trace + axe report
 * against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/W11-direct-adjustment');

test.describe('Direct stock-adjustment parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('hub: warehouse landing shows the Stock adjustments nav card', async ({ page }) => {
    await page.goto(`${baseURL}/en/warehouse`);
    await expect(page.getByTestId('warehouse-nav-adjustments')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'W11-warehouse-hub-card.png'), fullPage: true });
  });

  test('form: permission-denied OR the increase form renders', async ({ page }) => {
    await page.goto(`${baseURL}/en/warehouse/adjustments/new`);
    await expect(page.locator('[data-screen="warehouse-stock-adjustment"]')).toBeVisible();

    const denied = page.getByTestId('adjust-denied');
    const form = page.getByTestId('adjust-form');
    await expect(denied.or(form)).toBeVisible();

    if (await denied.isVisible().catch(() => false)) {
      // permission-denied state.
      await page.screenshot({ path: path.join(evidenceDir, 'W11-adjust-denied.png'), fullPage: true });
      return;
    }

    // INCREASE (default): batch + expiry present, no supervisor block / LP picker.
    await expect(page.getByTestId('adjust-batch')).toBeVisible();
    await expect(page.getByTestId('adjust-expiry')).toBeVisible();
    await expect(page.getByTestId('adjust-supervisor-block')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidenceDir, 'W11-adjust-increase.png'), fullPage: true });

    // DECREASE: supervisor countersignature block + PIN + specific-LP picker appear.
    await page.getByTestId('adjust-direction-decrease').click();
    await expect(page.getByTestId('adjust-supervisor-block')).toBeVisible();
    await expect(page.getByTestId('adjust-supervisor-pin')).toBeVisible();
    await expect(page.getByTestId('adjust-lp-picker')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'W11-adjust-decrease-supervisor.png'), fullPage: true });
  });

  test('axe: the adjustment screen has no critical / serious violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/warehouse/adjustments/new`);
    await expect(page.locator('main[data-screen]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
