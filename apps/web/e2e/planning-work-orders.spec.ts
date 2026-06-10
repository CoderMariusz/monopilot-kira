/**
 * P2-PLANNING — Work Orders list + create + detail E2E (Playwright) — happy path +
 * per-state screenshots.
 *
 * Prototype anchors:
 *   - prototypes/design/Monopilot Design System/planning/wo-list.jsx:4-279 (plan_wo_list)
 *   - prototypes/design/Monopilot Design System/planning/wo-detail.jsx:4-588 (plan_wo_detail)
 *
 * The /planning/work-orders routes are org-scoped (RLS) and create/release are
 * RBAC-gated (npd.planning.write) server-side, so live capture requires an
 * authenticated Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in this
 * isolated worktree) the live capture is SKIPPED and the accepted fallback evidence
 * is the RTL coverage in
 * app/[locale]/(app)/(modules)/planning/work-orders/__tests__/work-orders.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P2-PLANNING-WO');
const listRoute = '/en/planning/work-orders';

test.describe('Work Orders list + create + detail parity (wo-list.jsx / wo-detail.jsx)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('list: tabs, search, dense table, Create WO modal', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const view = page.getByTestId('wo-list-view');
    await expect(view).toBeVisible();
    await expect(page.getByTestId('wo-list-tabs')).toBeVisible();
    await expect(page.getByTestId('wo-list-tab-DRAFT')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-list-ready.png'), fullPage: true });

    // Create WO modal opens.
    await page.getByTestId('wo-list-create').click();
    await expect(page.getByTestId('create-wo-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-create-modal.png') });
  });

  test('deep link ?new=1 auto-opens the create modal', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}?new=1`);
    await expect(page.getByTestId('create-wo-form')).toBeVisible();
  });

  test('onboarding /new redirects to ?new=1 and opens the modal', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/work-orders/new`);
    await expect(page).toHaveURL(/\/planning\/work-orders\?new=1/);
    await expect(page.getByTestId('create-wo-form')).toBeVisible();
  });

  test('detail: 7 tabs incl. honest not-live panels', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    const firstLink = page.locator('[data-testid^="wo-link-"]').first();
    await firstLink.click();

    await expect(page.getByTestId('wo-detail-view')).toBeVisible();
    await expect(page.getByTestId('wo-detail-tabs')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-detail-overview.png'), fullPage: true });

    await page.getByTestId('wo-tab-reservations').click();
    await expect(page.getByTestId('wo-reservations-not-live')).toBeVisible();
    await page.getByTestId('wo-tab-d365').click();
    await expect(page.getByTestId('wo-d365-not-live')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-detail-not-live.png'), fullPage: true });
  });
});
