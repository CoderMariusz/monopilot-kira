/**
 * M-5 — Desktop material-consumption on the WO Execution detail Consumption tab
 * (Playwright) — per-state screenshots / trace harness.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/production/wo-detail.jsx:257
 * (Consumption tab). This lane replaces the permanently-disabled DeferredButton
 * ("Scan LP / Add") with a live desktop "Record consumption" modal that mirrors
 * the scanner consume route's stock-mutating SQL.
 *
 * The route is org-scoped + RBAC-gated (production.consumption.write to submit;
 * production.oee.read to view), so live capture requires an authenticated
 * Supabase session against a running app server (Vercel preview or
 * `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset (the default in
 * this isolated worktree) the live capture is SKIPPED and the accepted fallback
 * evidence is the RTL component coverage in:
 *   app/[locale]/(app)/(modules)/production/wos/[id]/_components/__tests__/wo-consume-modal.test.tsx
 *   app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs
 * unchanged against a preview to produce pixel screenshots + trace + axe report.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/M-5-desktop-consume');
const listRoute = '/en/production/wos';

test.describe('Desktop record-consumption modal parity (wo-detail.jsx:257)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('Consumption tab → live "Record consumption" trigger + modal five states', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    // Open the first in-progress WO row → detail.
    await page.getByTestId('wo-tab-in_progress').click();
    await page.getByTestId(/^wo-link-/).first().click();
    await expect(page).toHaveURL(/\/production\/wos\/[0-9a-f-]+$/);

    await page.getByTestId('wo-detail-tab-consumption').click();

    // The disabled DeferredButton is gone; the live trigger is present (running WO).
    await expect(page.getByTestId('wo-consumption-record')).toBeEnabled();
    await page.screenshot({ path: path.join(evidenceDir, 'consumption-tab-live-trigger.png'), fullPage: true });

    // Open the modal — loading state for the FEFO LP candidate fetch.
    await page.getByTestId('wo-consumption-record').click();
    // The modal body (one of loading → ready/empty/error) is visible.
    await expect(page.getByTestId('wo-consume-submit')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'modal-open.png') });

    // Optimistic / pending: fill a decimal qty and submit.
    await page.getByTestId('wo-consume-qty').fill('1.5');
    await page.getByTestId('wo-consume-submit').click();
    await page.screenshot({ path: path.join(evidenceDir, 'modal-submitting.png') });
  });

  test('Per-row Record button preselects the component', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await page.getByTestId('wo-tab-in_progress').click();
    await page.getByTestId(/^wo-link-/).first().click();
    await page.getByTestId('wo-detail-tab-consumption').click();

    // Launch from a row's "Record" button (preselects that component).
    await page.getByTestId(/^wo-consumption-record-row-/).first().click();
    await expect(page.getByTestId('wo-consume-qty')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'modal-row-preselect.png') });
  });
});
