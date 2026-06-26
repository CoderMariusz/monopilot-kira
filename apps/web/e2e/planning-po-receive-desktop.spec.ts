/**
 * P2-PLANNING — Desktop "Receive" PO line affordance E2E (Playwright) stub +
 * per-state screenshots.
 *
 * Prototype anchor: po-screens.jsx:204-251 (PO lines table + per-line received
 * column). The desktop receive modal is an ADDITIVE affordance (receiving otherwise
 * lives in the scanner GRN flow); its form mirrors the established PO line/edit
 * modals (modals.jsx:182-219).
 *
 * The receive action (receivePoLineDesktop) is RBAC-gated server-side on
 * warehouse.grn.receive and only valid on a confirmed / partially_received PO, so
 * live capture requires an authenticated Supabase session against a running app
 * server. When PLAYWRIGHT_BASE_URL is unset (default in this isolated worktree) live
 * capture is SKIPPED and the accepted fallback evidence is the RTL coverage in
 * purchase-orders/__tests__/po-receive-line.test.tsx (11 tests), per
 * UI-PROTOTYPE-PARITY-POLICY.md. This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace for the modal, success,
 * and error states.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P2-PLANNING-PO-RECEIVE-DESKTOP');

test.describe('Desktop PO line receive', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('PO detail: per-line Receive → modal → submit into stock (confirmed PO)', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/purchase-orders`);
    // Open a confirmed / partially_received PO (the receive affordance is hidden on
    // draft/sent/received/cancelled).
    const firstPo = page.locator('[data-testid^="po-link-"]').first();
    await firstPo.click();
    await expect(page.getByTestId('po-detail-view')).toBeVisible();

    // Per-line Receive button (first not-fully-received line).
    const receiveBtn = page.locator('[data-testid^="po-line-receive-"]').first();
    await expect(receiveBtn).toBeVisible();
    await receiveBtn.click();

    // Modal — prefilled remaining qty.
    await expect(page.getByTestId('po-receive-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'po-receive-modal.png') });

    // Submit into stock and capture the GRN/LP success line.
    await page.getByTestId('po-receive-submit').click();
    await expect(page.getByTestId('po-receive-success')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'po-receive-success.png') });
  });
});
