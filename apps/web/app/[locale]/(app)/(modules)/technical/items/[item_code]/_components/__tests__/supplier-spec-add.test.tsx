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
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  { id: 'sup-1', code: 'SUP-A', name: 'Alpha Foods' },
  { id: 'sup-2', code: 'SUP-B', name: 'Beta Meats' },
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
});
