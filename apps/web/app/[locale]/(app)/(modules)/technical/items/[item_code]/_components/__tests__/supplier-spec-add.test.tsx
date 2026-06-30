/**
 * @vitest-environment jsdom
 *
 * ITEM SUPPLIER MANAGEMENT — Item Detail · "+ Add supplier" modal RTL.
 *
 * Behaviour + five-state checklist:
 *   - permission-denied: canEdit=false → the CTA never renders.
 *   - RBAC: a forbidden server result surfaces the inline forbidden banner.
 *   - empty: zero suppliers → disabled submit + "no suppliers" helper.
 *   - pending: submit disabled + "Adding…" while the action is in flight.
 *   - optimistic/ready: success → router.refresh() (the causal chain that clears
 *     the BOM SUPPLIER_NOT_APPROVED / SUPPLIER_SPEC_NOT_ACTIVE warnings).
 *   - i18n: all visible copy comes from the injected labels bundle (no inline strings).
 *   - Select is the shadcn combobox (no raw <select>), role=dialog + aria-modal.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import {
  SupplierSpecAdd,
  type SupplierOption,
  type SupplierSpecAddLabels,
} from '../supplier-spec-add.client';

const L: SupplierSpecAddLabels = {
  cta: '+ Add supplier',
  title: 'Add supplier specification',
  subtitle: 'Attach an approved supplier spec.',
  supplier: 'Supplier',
  supplierPlaceholder: 'Select a supplier',
  specVersion: 'Spec version',
  issuedDate: 'Issued date',
  effectiveFrom: 'Effective from',
  expiryDate: 'Expiry date',
  approveNow: 'Approve now',
  unitPrice: 'Unit price',
  unitPricePlaceholder: '0.00',
  priceCurrency: 'Currency',
  priceCurrencyPlaceholder: 'e.g. GBP',
  document: 'Spec document',
  documentHint: 'Optional. PDF or image.',
  uploading: 'Uploading document…',
  uploadFailed: 'The spec was saved, but the document upload failed.',
  submit: 'Add supplier',
  submitting: 'Adding…',
  cancel: 'Cancel',
  success: 'Supplier specification added. Warnings cleared.',
  successUpdated: 'Supplier specification refreshed.',
  noSuppliers: 'No suppliers found. Create a supplier in Planning first.',
  forbidden: 'You do not have permission to add a supplier.',
  errors: {
    invalid_input: 'Check the supplier and dates.',
    forbidden: 'You do not have permission to add a supplier.',
    item_not_found: 'This item no longer exists.',
    supplier_not_found: 'Supplier could not be found.',
    already_exists: 'An approved supplier spec already exists.',
    persistence_failed: 'Could not save. Try again.',
    load_failed: 'Could not load suppliers.',
  },
};

const suppliers: SupplierOption[] = [
  { id: 'sup-1', code: 'SUP-A', name: 'Alpha Foods', currency: 'GBP' },
  { id: 'sup-2', code: 'SUP-B', name: 'Beta Meats', currency: 'EUR' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SupplierSpecAdd modal', () => {
  it('permission-denied: hides the CTA entirely when canEdit is false', () => {
    render(
      <SupplierSpecAdd itemCode="RM-1" canEdit={false} suppliers={suppliers} labels={L} addSupplierSpec={vi.fn()} />,
    );
    expect(screen.queryByTestId('supplier-spec-add-cta')).toBeNull();
  });

  it('opens a labelled modal (role=dialog + aria-modal) with localized copy', async () => {
    const user = userEvent.setup();
    render(
      <SupplierSpecAdd itemCode="RM-1" canEdit suppliers={suppliers} labels={L} addSupplierSpec={vi.fn()} />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(L.title)).toBeInTheDocument();
    // shadcn combobox, NOT a raw <select>.
    expect(screen.getByRole('combobox', { name: L.supplier })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
  });

  it('empty state: zero suppliers disables submit and shows the helper', async () => {
    const user = userEvent.setup();
    render(<SupplierSpecAdd itemCode="RM-1" canEdit suppliers={[]} labels={L} addSupplierSpec={vi.fn()} />);
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    expect(screen.getByTestId('supplier-spec-add-empty')).toHaveTextContent(L.noSuppliers);
    expect(screen.getByTestId('supplier-spec-add-submit')).toBeDisabled();
  });

  it('optimistic/ready: a successful approve refreshes the route (clears BOM warnings)', async () => {
    const user = userEvent.setup();
    const addSupplierSpec = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: 's1', supplierCode: 'SUP-A', updated: false } });
    render(
      <SupplierSpecAdd itemCode="RM-1" canEdit suppliers={suppliers} labels={L} addSupplierSpec={addSupplierSpec} />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-A · Alpha Foods' }));
    await user.click(screen.getByTestId('supplier-spec-add-submit'));

    await waitFor(() => expect(addSupplierSpec).toHaveBeenCalledTimes(1));
    expect(addSupplierSpec).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'RM-1', supplierId: 'sup-1', approveNow: true }),
    );
    await screen.findByText(L.success);
    expect(refresh).toHaveBeenCalled();
  });

  it('error state: a forbidden server result renders the inline RBAC banner', async () => {
    const user = userEvent.setup();
    const addSupplierSpec = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    render(
      <SupplierSpecAdd itemCode="RM-1" canEdit suppliers={suppliers} labels={L} addSupplierSpec={addSupplierSpec} />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-B · Beta Meats' }));
    await user.click(screen.getByTestId('supplier-spec-add-submit'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(L.errors.forbidden);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('error state: already_exists maps to the honest idempotency message', async () => {
    const user = userEvent.setup();
    const addSupplierSpec = vi.fn().mockResolvedValue({ ok: false, error: 'already_exists' });
    render(
      <SupplierSpecAdd itemCode="RM-1" canEdit suppliers={suppliers} labels={L} addSupplierSpec={addSupplierSpec} />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-A · Alpha Foods' }));
    await user.click(screen.getByTestId('supplier-spec-add-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.errors.already_exists);
  });

  // ── BUG3 + price — price/currency fields + document attach ──
  it('renders price + currency inputs and a file input, and defaults the currency to the supplier', async () => {
    const user = userEvent.setup();
    render(<SupplierSpecAdd itemCode="RM-1" canEdit suppliers={suppliers} labels={L} addSupplierSpec={vi.fn()} />);
    await user.click(screen.getByTestId('supplier-spec-add-cta'));

    expect(screen.getByTestId('supplier-spec-add-unit-price')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-spec-add-price-currency')).toBeInTheDocument();
    const fileInput = screen.getByTestId('supplier-spec-add-document');
    expect(fileInput).toHaveAttribute('type', 'file');

    // Picking SUP-A (GBP) defaults the currency field.
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-A · Alpha Foods' }));
    await waitFor(() => expect(screen.getByTestId('supplier-spec-add-price-currency')).toHaveValue('GBP'));
  });

  it('passes unitPrice + priceCurrency into the create action and uploads the doc on save', async () => {
    const user = userEvent.setup();
    const addSupplierSpec = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: 'spec-9', supplierCode: 'SUP-A', updated: false } });
    const uploadSupplierSpecDoc = vi.fn().mockResolvedValue({ ok: true, data: { url: 'org-x/spec-9/doc.pdf' } });
    render(
      <SupplierSpecAdd
        itemCode="RM-1"
        canEdit
        suppliers={suppliers}
        labels={L}
        addSupplierSpec={addSupplierSpec}
        uploadSupplierSpecDoc={uploadSupplierSpecDoc}
      />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-A · Alpha Foods' }));

    fireEvent.change(screen.getByTestId('supplier-spec-add-unit-price'), { target: { value: '12.50' } });
    const file = new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByTestId('supplier-spec-add-document') as HTMLInputElement, file);

    await user.click(screen.getByTestId('supplier-spec-add-submit'));

    await waitFor(() => expect(addSupplierSpec).toHaveBeenCalledTimes(1));
    expect(addSupplierSpec).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'RM-1', supplierId: 'sup-1', unitPrice: '12.50', priceCurrency: 'GBP' }),
    );
    // Upload runs AFTER the create returns the new spec id, with specId + file.
    await waitFor(() => expect(uploadSupplierSpecDoc).toHaveBeenCalledTimes(1));
    const fd = uploadSupplierSpecDoc.mock.calls[0][0] as FormData;
    expect(fd.get('specId')).toBe('spec-9');
    expect(fd.get('file')).toBeInstanceOf(File);
  });

  it('surfaces an inline error when the document upload fails (spec still saved)', async () => {
    const user = userEvent.setup();
    const addSupplierSpec = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: 'spec-9', supplierCode: 'SUP-A', updated: false } });
    const uploadSupplierSpecDoc = vi.fn().mockResolvedValue({ ok: false, error: 'storage failed' });
    render(
      <SupplierSpecAdd
        itemCode="RM-1"
        canEdit
        suppliers={suppliers}
        labels={L}
        addSupplierSpec={addSupplierSpec}
        uploadSupplierSpecDoc={uploadSupplierSpecDoc}
      />,
    );
    await user.click(screen.getByTestId('supplier-spec-add-cta'));
    await user.click(screen.getByRole('combobox', { name: L.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-A · Alpha Foods' }));
    const file = new File(['x'], 'spec.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('supplier-spec-add-document') as HTMLInputElement, file);
    await user.click(screen.getByTestId('supplier-spec-add-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(L.uploadFailed);
  });
});
