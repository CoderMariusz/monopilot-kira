/**
 * C-R2 — Reversibility UI on the WO Execution detail Output + Waste tabs
 * (Playwright) — per-state screenshots / trace harness.
 *
 * Source: spec-driven. No void/correction screen exists in
 * prototypes/design/Monopilot Design System/production/ (verified — production
 * prototypes are app/dashboard/data/modals/new-screens/other-screens/shell/
 * wo-detail/wo-list .jsx, none contains void/correction); the e-sign modal block
 * mirrors the in-repo precedent quality/holds/_components/hold-release-modal.client.tsx
 * (anchored to modals.jsx:98-156). The Output/Waste tab rows are the wo-detail.jsx
 * Output (:347) / Waste (:409) tables this lane extends with void affordances.
 *
 * The route is org-scoped + RBAC-gated (production.oee.read to view;
 * production.waste.correct / output-void permission server-side to submit), so
 * live capture requires an authenticated Supabase session against a running app
 * server (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is
 * unset (the default in this isolated worktree) the live capture is SKIPPED and
 * the accepted fallback evidence is the RTL component coverage in:
 *   app/[locale]/(app)/(modules)/production/wos/[id]/_components/__tests__/wo-void-correction.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs
 * unchanged against a preview to produce pixel screenshots + trace + axe report.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/C-R2-void-correction');
const listRoute = '/en/production/wos';

test.describe('WO void/correction parity (Output :347 / Waste :409, e-sign per holds modal)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('Output tab → "Void output…" → e-sign modal (reason + note + password)', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await page.getByTestId(/^wo-link-/).first().click();
    await expect(page).toHaveURL(/\/production\/wos\/[0-9a-f-]+$/);

    await page.getByTestId('wo-detail-tab-output').click();
    await page.screenshot({ path: path.join(evidenceDir, 'output-tab.png'), fullPage: true });

    // Open the OUTPUT void modal from a row affordance → e-sign password present.
    await page.getByTestId(/^wo-output-void-/).first().click();
    await expect(page.getByTestId('wo-void-esign')).toBeVisible();
    await expect(page.getByTestId('wo-void-password')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'output-void-modal-esign.png') });

    // Optimistic / pending: pick reason + password and submit.
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Wrong quantity' }).click();
    await page.getByTestId('wo-void-password').fill('test-password');
    await page.getByTestId('wo-void-submit').click();
    await page.screenshot({ path: path.join(evidenceDir, 'output-void-submitting.png') });
  });

  test('Waste tab → "Void entry…" → modal WITHOUT e-sign', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await page.getByTestId(/^wo-link-/).first().click();

    await page.getByTestId('wo-detail-tab-waste').click();
    await page.getByTestId(/^wo-waste-void-/).first().click();

    // Waste void has NO e-sign block (no password field).
    await expect(page.getByTestId('wo-void-form')).toBeVisible();
    await expect(page.getByTestId('wo-void-password')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidenceDir, 'waste-void-modal-no-esign.png') });
  });

  test('Corrected rows render the Voided badge + "Correction of #…" label', async ({ page }) => {
    await page.goto(`${baseURL}${listRoute}`);
    await page.getByTestId(/^wo-link-/).first().click();
    await page.getByTestId('wo-detail-tab-output').click();

    // When the read exposes correctionOfId, a voided original + its counter row
    // are visible; capture whichever the live data presents (no-op otherwise).
    const voided = page.getByTestId(/^wo-output-voided-/).first();
    if (await voided.count()) {
      await expect(voided).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'output-corrected-rows.png'), fullPage: true });
    }
  });
});
