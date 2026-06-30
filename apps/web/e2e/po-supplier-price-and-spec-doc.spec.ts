/**
 * P2-PLANNING + TECHNICAL-ITEMS — supplier-scoped PO line picker + price pre-fill
 * (BUG2 + BUG1) and supplier-spec price/currency + document upload (BUG3) E2E
 * (Playwright) stub — happy path + per-state screenshots + trace.
 *
 * Prototype anchors:
 *   - BUG2 (supplier-filtered product picker): po-screens.jsx:66 (supplier select),
 *       modals.jsx:196 (product list — supplier-attributed). Translated to the
 *       supplier-scoped ItemPicker (no raw <select>).
 *   - BUG1 (price auto-fill): modals.jsx:212 — Field "Unit price"
 *       help="Auto-filled from supplier_products · editable". po-screens.jsx:233
 *       shows £ line prices (GBP source). On item select the line unit price is
 *       pre-filled from getItemSupplierPrice (spec by date → items.list_price_gbp),
 *       editable, with a subtle source hint.
 *   - BUG3 (supplier-spec price + document): the Item Detail supplier-specs tab
 *       add/edit modals gain unit price + currency inputs and a document attach
 *       (uploadSupplierSpecDoc). Spec-driven (no dedicated JSX modal — mirrors the
 *       attach pattern in the item-detail tabs).
 *
 * The /planning + /technical routes are org-scoped (RLS) and the write paths are
 * RBAC-gated (npd.planning.write / technical.items.edit) server-side, so live capture
 * requires an authenticated Supabase session against a running app server. When
 * PLAYWRIGHT_BASE_URL is unset (default in this isolated worktree) live capture is
 * SKIPPED and the accepted fallback evidence is the RTL coverage in:
 *   - planning/purchase-orders/__tests__/purchase-orders.test.tsx
 *       (CreatePoModal — supplier-filtered picker + price pre-fill, 3 BUG1/BUG2 tests)
 *   - technical/items/[item_code]/_components/__tests__/supplier-spec-add.test.tsx
 *       (price/currency render + default, save passes them, document upload, 3 new tests)
 *   - technical/items/[item_code]/_components/__tests__/supplier-spec-row-actions.test.tsx
 *       (edit-modal price/currency + document upload + current-doc link, 6 tests)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace.
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/PO-SUPPLIER-PRICE-SPEC-DOC');

test.describe('PO supplier-scoped picker + price pre-fill (BUG2 + BUG1)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('create PO: supplier filters the line picker + selecting an item pre-fills the price', async ({ page }) => {
    await page.goto(`${baseURL}/en/planning/purchase-orders?new=1`);
    await expect(page.getByTestId('create-po-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'bug12-01-create-modal-open.png'), fullPage: true });

    // Choose a supplier (first combobox in the form).
    const form = page.getByTestId('create-po-form');
    await form.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();

    // Open the line picker — options are now restricted to the supplier's items (BUG2).
    await page.getByTestId('item-picker-trigger').click();
    await expect(page.getByTestId('item-picker-options')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'bug2-02-supplier-filtered-picker.png') });
    await page.getByTestId('item-picker-option').first().click();

    // The unit price is pre-filled + the source hint is shown (BUG1), still editable.
    await expect(page.getByTestId('create-po-line-price-source')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'bug1-03-price-prefilled.png') });
  });
});

test.describe('Supplier-spec price/currency + document upload (BUG3)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  test('item detail: add supplier spec with price/currency + attach a document', async ({ page }) => {
    // Replace RM-EXAMPLE with a real seeded RM code for the live preview run.
    await page.goto(`${baseURL}/en/technical/items/RM-EXAMPLE`);
    await page.getByRole('tab', { name: /supplier/i }).click();
    await page.getByTestId('supplier-spec-add-cta').click();
    await expect(page.getByTestId('supplier-spec-add-modal')).toBeVisible();

    await page.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();
    await page.getByTestId('supplier-spec-add-unit-price').fill('12.50');
    // Currency defaults to the supplier's currency; document attach is optional.
    await page.getByTestId('supplier-spec-add-document').setInputFiles(
      path.join(__dirname, 'fixtures', 'sample-spec.pdf'),
    );
    await page.screenshot({ path: path.join(evidenceDir, 'bug3-01-add-spec-with-price-doc.png') });
    await page.getByTestId('supplier-spec-add-submit').click();
    await expect(page.getByRole('status')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'bug3-02-spec-saved.png') });
  });
});
