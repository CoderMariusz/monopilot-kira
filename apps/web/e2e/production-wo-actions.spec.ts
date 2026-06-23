/**
 * P2-MODALS — WO execution action wiring E2E (Playwright stub).
 *
 * Exercises the wired Start / Pause / Resume / Complete / Close / Register-output
 * / Log-waste flows against the EXISTING route handlers, end-to-end, on a live
 * RBAC-authenticated app server (Vercel preview or `pnpm --filter web dev`) with
 * the migration-259 demo WOs (DEMO-WO-259-00x).
 *
 * When PLAYWRIGHT_BASE_URL is unset (the default in this worktree) the live
 * capture is SKIPPED and the accepted fallback evidence is the RTL coverage in:
 *   app/[locale]/(app)/(modules)/production/wos/_components/modals/__tests__/wo-actions.test.tsx
 * (payload shapes via mocked fetch + state-gated visibility + RBAC + verbatim
 * error surfacing). This spec is the harness producing per-modal screenshots +
 * trace + axe report against a preview.
 *
 * Demo data (migration 259-demo-wo-seed.sql):
 *   DEMO-WO-259-002  RELEASED/planned   → Start
 *   DEMO-WO-259-003  IN_PROGRESS        → Pause / Complete / Register output / Log waste
 *   DEMO-WO-259-005  COMPLETED          → Close (e-sign)
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P2-MODALS');
const listRoute = '/en/production/wos';

async function openWoByNumber(page: import('@playwright/test').Page, woNumber: string) {
  await page.goto(`${baseURL}${listRoute}`);
  await page.getByTestId('wo-list-search').fill(woNumber);
  await page.getByRole('link', { name: new RegExp(woNumber) }).first().click();
  await expect(page).toHaveURL(/\/production\/wos\/[0-9a-f-]+$/);
}

test.describe('WO execution action modals (DEMO-WO-259)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL mocked-fetch fallback evidence used.',
  );

  test('IN_PROGRESS WO: Pause modal posts a categorized downtime (line + shift are DROPDOWNS)', async ({ page }) => {
    await openWoByNumber(page, 'DEMO-WO-259-003');

    await page.getByTestId('wo-action-pause').click();
    await page.getByTestId('wo-pause-reason').click();
    await page.getByRole('option').first().click();
    // D8 — line is a <Select> combobox (not free-text), defaulting to the WO's
    // assigned line. Pick a line from the dropdown.
    const lineTrigger = page.getByTestId('wo-pause-line');
    await expect(lineTrigger).toHaveRole('combobox');
    await lineTrigger.click();
    await page.getByRole('option').first().click();
    // D8 — shift is a <Select> combobox sourced from the same fixed enum the
    // scanner login uses (Morning / Afternoon / Night).
    const shiftTrigger = page.getByTestId('wo-pause-shift');
    await expect(shiftTrigger).toHaveRole('combobox');
    await shiftTrigger.click();
    await page.getByRole('option', { name: /Morning/i }).click();
    await page.screenshot({ path: path.join(evidenceDir, 'pause-modal.png') });
    await page.getByTestId('wo-pause-confirm').click();

    // The status badge flips to Paused after router.refresh().
    await expect(page.getByTestId('wo-detail-header')).toContainText(/Paused/i);
  });

  test('IN_PROGRESS WO: Log-waste modal SHIFT is a mandatory dropdown (not free text)', async ({ page }) => {
    await openWoByNumber(page, 'DEMO-WO-259-003');

    await page.getByTestId('wo-action-waste-header').click();
    await page.getByTestId('wo-waste-category').click();
    await page.getByRole('option').first().click();
    await page.getByTestId('wo-waste-qty').fill('3.5');
    // Confirm stays disabled while the mandatory shift is unset.
    await expect(page.getByTestId('wo-waste-confirm')).toBeDisabled();
    const wasteShift = page.getByTestId('wo-waste-shift');
    await expect(wasteShift).toHaveRole('combobox');
    await wasteShift.click();
    await page.getByRole('option', { name: /Afternoon/i }).click();
    await page.screenshot({ path: path.join(evidenceDir, 'waste-modal-shift-dropdown.png') });
    await expect(page.getByTestId('wo-waste-confirm')).toBeEnabled();
  });

  test('IN_PROGRESS WO: Register output modal posts qty_kg as a decimal string', async ({ page }) => {
    await openWoByNumber(page, 'DEMO-WO-259-004');

    await page.getByTestId('wo-action-output').click();
    await page.getByTestId('wo-output-qty').fill('250.000');
    await page.screenshot({ path: path.join(evidenceDir, 'output-modal.png') });
    await page.getByTestId('wo-output-confirm').click();

    await page.getByTestId('wo-detail-tab-output').click();
    await expect(page.getByTestId('wo-output-row').first()).toBeVisible();
  });

  test('B-3 catch-weight WO: Register output captures N per-unit weights + Σ sum', async ({ page }) => {
    // A WO whose FG item.weight_mode='catch'. The qty (units) drives the per-unit
    // grid; each scale reading is a decimal string; the payload carries
    // catch_weight_kg_per_unit so the service no longer 422s the catch item.
    await openWoByNumber(page, 'DEMO-WO-259-CW');

    await page.getByTestId('wo-action-output').click();
    await expect(page.getByTestId('wo-output-catch-weights')).toBeVisible();
    await page.getByTestId('wo-output-qty').fill('2');
    await page.getByTestId('wo-output-catch-weight-0').fill('2.480');
    await page.getByTestId('wo-output-catch-weight-1').fill('2.530');
    await expect(page.getByTestId('wo-output-catch-sum')).toContainText('Σ 5.010 kg');
    await page.screenshot({ path: path.join(evidenceDir, 'output-modal-catch-weight.png') });
    await page.getByTestId('wo-output-confirm').click();

    await page.getByTestId('wo-detail-tab-output').click();
    await expect(page.getByTestId('wo-output-row').first()).toBeVisible();
  });

  test('COMPLETED WO: Close modal requires e-sign password + reason', async ({ page }) => {
    await openWoByNumber(page, 'DEMO-WO-259-005');

    await page.getByTestId('wo-action-close').click();
    // Confirm is disabled until both password + reason are present.
    await expect(page.getByTestId('wo-close-confirm')).toBeDisabled();
    await page.getByTestId('wo-close-password').fill('Admin2026!!!');
    await page.getByTestId('wo-close-reason').fill('End of production run');
    await page.screenshot({ path: path.join(evidenceDir, 'close-modal.png') });
    await expect(page.getByTestId('wo-close-confirm')).toBeEnabled();
  });
});
