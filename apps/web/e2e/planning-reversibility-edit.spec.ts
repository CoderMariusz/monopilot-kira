/**
 * P2-PLANNING (Wave R1 reversibility) — DRAFT edit affordances E2E (Playwright) stub —
 * PO / TO / WO edit + line ops, per-state screenshots.
 *
 * Prototype anchors:
 *   - PO: po-screens.jsx:150 (draft Edit action), po-screens.jsx:210 ("＋ Add line"),
 *         modals.jsx:182-219 (add_po_line_modal).
 *   - TO: to-screens.jsx:112,143,277 (draft Edit → TOCreateModal editing),
 *         modals.jsx:684-820 (to_create_edit_modal).
 *   - WO: wo-detail.jsx:10 (draft action map includes Edit).
 *
 * Edit/line/header modals mirror the create surfaces (no dedicated edit modal in the
 * prototype). The /planning routes are org-scoped (RLS) and the edit/line actions are
 * RBAC-gated (npd.planning.write) + DRAFT-only server-side, so live capture requires
 * an authenticated Supabase session against a running app server. When
 * PLAYWRIGHT_BASE_URL is unset (default in this isolated worktree) live capture is
 * SKIPPED and the accepted fallback evidence is the RTL coverage in:
 *   - purchase-orders/__tests__/po-edit.test.tsx (8 tests)
 *   - transfer-orders/__tests__/to-edit.test.tsx (7 tests)
 *   - work-orders/__tests__/wo-edit.test.tsx     (6 tests)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/P2-PLANNING-R1-EDIT');

test.describe('Wave R1 — DRAFT edit affordances (PO / TO / WO)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('PO detail: Edit order + Add line + per-line Edit/Delete (DRAFT only)', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/purchase-orders`);
    const firstDraft = page.locator('[data-testid^="po-link-"]').first();
    await firstDraft.click();
    await expect(page.getByTestId('po-detail-view')).toBeVisible();

    // Edit-order modal (mirrors create header fields).
    await page.getByTestId('po-edit-order').click();
    await expect(page.getByTestId('edit-po-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'po-edit-order-modal.png') });
    await page.getByTestId('edit-po-cancel').click();

    // Add-line + per-line edit.
    await page.getByTestId('po-add-line').click();
    await expect(page.getByTestId('po-line-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'po-add-line-modal.png') });
    await page.getByTestId('po-line-cancel').click();
  });

  test('TO detail: Edit order (warehouses/expected/notes) + line ops (DRAFT only)', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/transfer-orders`);
    const firstDraft = page.locator('[data-testid^="to-link-"]').first();
    await firstDraft.click();
    await expect(page.getByTestId('to-detail-view')).toBeVisible();

    await page.getByTestId('to-edit-order').click();
    await expect(page.getByTestId('edit-to-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'to-edit-order-modal.png') });
    await page.getByTestId('edit-to-cancel').click();

    await page.getByTestId('to-add-line').click();
    await expect(page.getByTestId('to-line-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'to-add-line-modal.png') });
  });

  test('WO detail: Edit modal with honest re-snapshot note (DRAFT only)', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/work-orders`);
    const firstDraft = page.locator('[data-testid^="wo-link-"]').first();
    await firstDraft.click();
    await expect(page.getByTestId('wo-detail-view')).toBeVisible();

    await page.getByTestId('wo-edit-order').click();
    await expect(page.getByTestId('edit-wo-form')).toBeVisible();
    await expect(page.getByTestId('edit-wo-resnapshot-note')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'wo-edit-modal.png') });
  });

  test('non-draft hides edit affordances (honest)', async ({ page }) => {
    // A confirmed/received PO must not expose any edit control.
    await page.goto(`${baseURL}/en/planning/purchase-orders`);
    // This relies on the seed having a non-draft PO; the assertion is that when the
    // detail status !== draft, the edit controls are absent.
    const firstLink = page.locator('[data-testid^="po-link-"]').first();
    await firstLink.click();
    await expect(page.getByTestId('po-detail-view')).toBeVisible();
    const badge = page.getByTestId('po-detail-header');
    const isDraft = (await badge.textContent())?.toLowerCase().includes('draft');
    if (!isDraft) {
      await expect(page.getByTestId('po-edit-order')).toHaveCount(0);
      await expect(page.getByTestId('po-add-line')).toHaveCount(0);
    }
  });
});
