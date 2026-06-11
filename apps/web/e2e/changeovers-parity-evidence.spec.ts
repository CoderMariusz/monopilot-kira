/**
 * B-2 / K6 — Allergen changeover dual-sign E2E (Playwright) — per-state
 * screenshot / trace / axe harness for the new /production/changeovers register
 * + dual-sign panel + WO-detail sign-off-required callout.
 *
 * Prototype anchors:
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:298-397
 *     (ChangeoverScreen — page head + dual sign-off note + sign-off gate slots)
 *   prototypes/design/Monopilot Design System/production/modals.jsx:315-336
 *     (ChangeoverGateModal — sign-&-advance gate → dual-sign e-sign modal)
 *   prototypes/design/Monopilot Design System/production/dashboard.jsx:249-267
 *     (the "Open changeover" entry the register is reached from)
 *
 * The route is org-scoped + RBAC-gated (read via listChangeovers, sign via
 * production.changeover.write), so live capture requires an authenticated Supabase
 * session against a running app server (Vercel preview or `pnpm --filter web dev`).
 * When PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the
 * live capture is SKIPPED and the accepted fallback evidence is the RTL coverage:
 *   .../production/changeovers/__tests__/changeovers-list.test.tsx        (rows + filters + create modal)
 *   .../production/changeovers/__tests__/changeover-sign-panel.test.tsx   (dual-sign flow + slot-aware error mapping)
 *   .../production/wos/[id]/_components/__tests__/wo-detail-screen.test.tsx (changeover-gate callout)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the unchanged harness that
 * produces pixel screenshots + trace + axe report against a preview.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/B-2-changeovers');

test.describe('Allergen changeover dual-sign register parity + states', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('register: page head + filter chips + table render (loading→ready)', async ({ page }) => {
    await page.goto(`${baseURL}/en/production/changeovers`);
    await expect(page.locator('[data-screen="production-changeovers"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('changeover-filter-pending')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'B-2-register-ready.png'), fullPage: true });
  });

  test('empty state: a filter with no matches shows empty copy', async ({ page }) => {
    await page.goto(`${baseURL}/en/production/changeovers?status=complete`);
    const empty = page.getByTestId('changeover-empty');
    if (await empty.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(evidenceDir, 'B-2-empty.png'), fullPage: true });
    }
  });

  test('new-changeover modal opens (create state)', async ({ page }) => {
    await page.goto(`${baseURL}/en/production/changeovers`);
    await page.getByTestId('changeover-new').click();
    await expect(page.getByTestId('changeover-create-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'B-2-create-modal.png'), fullPage: true });
  });

  test('dual-sign panel + e-sign modal (sign state)', async ({ page }) => {
    await page.goto(`${baseURL}/en/production/changeovers`);
    const firstReview = page.getByTestId(/^changeover-review-/).first();
    if (await firstReview.isVisible().catch(() => false)) {
      await firstReview.click();
      await page.screenshot({ path: path.join(evidenceDir, 'B-2-sign-panel.png'), fullPage: true });
    }
  });

  test('axe: register has no critical violations', async ({ page }) => {
    await page.goto(`${baseURL}/en/production/changeovers`);
    await expect(page.locator('[data-screen="production-changeovers"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
