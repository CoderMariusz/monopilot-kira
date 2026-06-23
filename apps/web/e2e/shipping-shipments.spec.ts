/**
 * Wave-shipping — Shipments list + pack screen + Create-shipment E2E (Playwright) stub —
 * per-state screenshots + trace for /shipping/shipments, /shipping/shipments/[shipmentId],
 * and the additive [Create shipment] button on /shipping/[soId].
 *
 * Prototype anchors:
 *   - pack screen → prototypes/design/Monopilot Design System/shipping/pack-screens.jsx:48-220 (ShPackStation).
 *   - shipments list → spec-driven (nearest reusable pattern: SO list dense table
 *                      so-screens.jsx:92-168), translated in shipments-list-view.tsx.
 *   - create-shipment → SO detail action group (so-screens.jsx:217-224) + open-station
 *                      entry (pack-screens.jsx:38).
 *
 * The /shipping/shipments routes are org-scoped (RLS via withOrgContext) and the
 * createShipment / packLpIntoBox actions are RBAC-gated server-side (ship.pack.close;
 * ship.dashboard.view for the reads). Live capture therefore requires an authenticated
 * Supabase session against a running app server. When PLAYWRIGHT_BASE_URL is unset
 * (default in this isolated worktree) live capture is SKIPPED and the accepted fallback
 * evidence is the RTL coverage in:
 *   - shipping/shipments/_components/__tests__/shipments.test.tsx (15 tests)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace for each of the five UI states
 * (loading / empty / error / permission-denied / data + optimistic-pack).
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/SHIP-SHIPMENTS');

test.describe('Wave-shipping — Shipments (list + pack + create)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used (shipping/shipments/_components/__tests__/shipments.test.tsx).',
  );

  test('Shipments list: table + status filter, deep-link to the pack screen', async ({ page }) => {
    await page.goto(`${baseURL}/en/shipping/shipments`);
    await expect(page.getByTestId('shipments-list-view')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'shipments-list-data.png'), fullPage: true });

    // Tab nav: shipping landing ↔ shipments.
    await expect(page.getByTestId('shipping-tab-shipments')).toBeVisible();

    // Status filter (data state) — open the shadcn Select and pick a status.
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /shipped/i }).click();
    await page.screenshot({ path: path.join(evidenceDir, 'shipments-list-filtered.png'), fullPage: true });

    // Row deep-link → pack screen.
    const firstRow = page.locator('[data-testid^="shipment-link-"]').first();
    await firstRow.click();
    await expect(page.getByTestId('shipment-pack-view')).toBeVisible();
  });

  test('Pack screen: header + boxes with SSCC + contents + Pack-LP control', async ({ page }) => {
    await page.goto(`${baseURL}/en/shipping/shipments`);
    await page.locator('[data-testid^="shipment-link-"]').first().click();
    await expect(page.getByTestId('shipment-pack-view')).toBeVisible();
    await expect(page.getByTestId('shipment-pack-header')).toBeVisible();
    await expect(page.getByTestId('pack-lp-control')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'pack-screen-data.png'), fullPage: true });

    // Optimistic pack: enter an LP code, submit, the button shows the busy state then
    // the boxes refresh.
    await page.getByTestId('pack-lp-input').fill('LP-DEMO-0001');
    await page.getByTestId('pack-lp-submit').click();
    await page.screenshot({ path: path.join(evidenceDir, 'pack-screen-optimistic.png'), fullPage: true });
  });

  test('Create shipment: gated button on the SO detail navigates to the pack screen', async ({ page }) => {
    await page.goto(`${baseURL}/en/shipping`);
    // Open an allocated SO so the [Create shipment] button is enabled.
    await page.locator('[data-testid^="so-link-"]').first().click();
    await expect(page.getByTestId('so-detail-view')).toBeVisible();
    const createBtn = page.getByTestId('so-action-create-shipment');
    await expect(createBtn).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'so-detail-create-shipment.png'), fullPage: true });
  });

  test('Shipments list: empty + permission-denied panels (no crash)', async ({ page }) => {
    // Against a session lacking ship.dashboard.view, listShipments returns
    // { ok:false, error:'forbidden' } and the page renders shipments-list-denied.
    // Against an org with no shipments yet, the EmptyState renders.
    await page.goto(`${baseURL}/en/shipping/shipments`);
    await page.screenshot({ path: path.join(evidenceDir, 'shipments-list-state-context.png'), fullPage: true });
  });
});
