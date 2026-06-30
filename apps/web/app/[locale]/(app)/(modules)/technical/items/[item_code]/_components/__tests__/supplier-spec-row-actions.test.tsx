/**
 * @vitest-environment jsdom
 *
 * ITEM SUPPLIER MANAGEMENT — Item Detail · supplier-spec EDIT modal RTL.
 *
 * BUG3 + price coverage:
 *   - price + currency inputs render in the edit modal and prefill from the spec row;
 *   - Save passes unitPrice + priceCurrency into updateItemSupplierSpec;
 *   - a file <input type="file"> renders; submitting with a file calls
 *     uploadSupplierSpecDoc with the spec id (the spec already exists in edit mode);
 *   - the current document link ("View") renders when spec.specDocumentUrl is set;
 *   - a failed upload surfaces honestly inline (the field changes still saved).
 *
 * i18n: all visible copy comes from the injected labels bundle (no inline strings).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import {
  SupplierSpecRowActions,
  type SupplierSpecRowActionsLabels,
} from '../supplier-spec-row-actions.client';
import type { SupplierSpecRow } from '../../_actions/list-supplier-specs';

const L: SupplierSpecRowActionsLabels = {
  edit: 'Edit',
  deactivate: 'Deactivate',
  editTitle: 'Edit supplier specification',
  editSubtitle: 'Update dates, version, price and approval.',
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
  documentHint: 'Optional. PDF or image — replaces the current document.',
  documentCurrent: 'Current document:',
  documentView: 'View',
  uploading: 'Uploading document…',
  uploadFailed: 'Changes saved, but the document upload failed.',
  submit: 'Save changes',
  submitting: 'Saving…',
  cancel: 'Cancel',
  success: 'Supplier specification updated.',
  deactivateTitle: 'Deactivate supplier specification',
  deactivateBody: 'This will supersede the supplier specification.',
  deactivateWarnActive: 'This spec is active and approved.',
  deactivateConfirm: 'Deactivate',
  deactivateCancel: 'Cancel',
  deactivateSuccess: 'Supplier specification deactivated.',
  errors: {
    invalid_input: 'Check the dates and price.',
    forbidden: 'You do not have permission.',
    item_not_found: 'This item no longer exists.',
    supplier_not_found: 'Supplier could not be found.',
    already_exists: 'An approved supplier spec already exists.',
    persistence_failed: 'Could not save. Try again.',
  },
};

function makeSpec(over: Partial<SupplierSpecRow & { unitPrice?: string | null; priceCurrency?: string | null }> = {}): SupplierSpecRow {
  return {
    id: 'spec-1',
    itemCode: 'RM-1',
    itemName: 'Pork Belly',
    supplierCode: 'SUP-A',
    supplierStatus: 'approved',
    lifecycleStatus: 'active',
    reviewStatus: 'approved',
    specVersion: 'v2',
    issuedDate: '2026-01-01',
    effectiveFrom: '2026-01-01',
    expiryDate: '2027-01-01',
    specDocumentUrl: null,
    documentSha256: null,
    documentMimeType: null,
    certificateRefs: [],
    uploadedAt: null,
    ...over,
  } as SupplierSpecRow;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SupplierSpecRowActions edit modal — price + document (BUG3 + price)', () => {
  async function openEdit(props: Partial<React.ComponentProps<typeof SupplierSpecRowActions>> = {}) {
    const user = userEvent.setup();
    const updateSpec = vi.fn().mockResolvedValue({ ok: true, data: { id: 'spec-1' } });
    const deactivateSpec = vi.fn();
    const uploadSupplierSpecDoc = vi.fn().mockResolvedValue({ ok: true, data: { url: 'org-x/spec-1/doc.pdf' } });
    render(
      <SupplierSpecRowActions
        spec={makeSpec()}
        labels={L}
        updateSpec={updateSpec}
        deactivateSpec={deactivateSpec}
        uploadSupplierSpecDoc={uploadSupplierSpecDoc}
        {...props}
      />,
    );
    await user.click(screen.getByText(L.edit));
    return { user, updateSpec, uploadSupplierSpecDoc };
  }

  it('renders price + currency inputs and a file input in the edit modal', async () => {
    await openEdit();
    expect(screen.getByTestId('supplier-spec-edit-unit-price')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-spec-edit-price-currency')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-spec-edit-document')).toHaveAttribute('type', 'file');
    // Still the shadcn modal — no raw <select> leaked in.
    expect(document.querySelector('select')).toBeNull();
  });

  it('prefills price + currency from the spec row when present', async () => {
    const spec = makeSpec({ unitPrice: '9.99', priceCurrency: 'GBP' });
    const user = userEvent.setup();
    render(
      <SupplierSpecRowActions spec={spec} labels={L} updateSpec={vi.fn()} deactivateSpec={vi.fn()} />,
    );
    await user.click(screen.getByText(L.edit));
    expect(screen.getByTestId('supplier-spec-edit-unit-price')).toHaveValue('9.99');
    expect(screen.getByTestId('supplier-spec-edit-price-currency')).toHaveValue('GBP');
  });

  it('passes unitPrice + priceCurrency into updateSpec on save', async () => {
    const { user, updateSpec } = await openEdit();
    // fireEvent.change sets the whole value (avoids the controlled-Input per-keystroke
    // cursor reset that drops chars under userEvent.type).
    fireEvent.change(screen.getByTestId('supplier-spec-edit-unit-price'), { target: { value: '7.25' } });
    fireEvent.change(screen.getByTestId('supplier-spec-edit-price-currency'), { target: { value: 'eur' } });
    await user.click(screen.getByTestId('supplier-spec-edit-submit'));

    await waitFor(() => expect(updateSpec).toHaveBeenCalledTimes(1));
    expect(updateSpec).toHaveBeenCalledWith(
      expect.objectContaining({ specId: 'spec-1', unitPrice: '7.25', priceCurrency: 'EUR' }),
    );
  });

  it('uploads a chosen document against the existing spec id on save', async () => {
    const { user, uploadSupplierSpecDoc } = await openEdit();
    const file = new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByTestId('supplier-spec-edit-document') as HTMLInputElement, file);
    await user.click(screen.getByTestId('supplier-spec-edit-submit'));

    await waitFor(() => expect(uploadSupplierSpecDoc).toHaveBeenCalledTimes(1));
    const fd = uploadSupplierSpecDoc.mock.calls[0][0] as FormData;
    expect(fd.get('specId')).toBe('spec-1');
    expect(fd.get('file')).toBeInstanceOf(File);
  });

  it('shows the current-document link when spec.specDocumentUrl is set', async () => {
    const spec = makeSpec({ specDocumentUrl: 'org-x/spec-1/existing.pdf' });
    const user = userEvent.setup();
    render(
      <SupplierSpecRowActions spec={spec} labels={L} updateSpec={vi.fn()} deactivateSpec={vi.fn()} />,
    );
    await user.click(screen.getByText(L.edit));
    expect(screen.getByTestId('supplier-spec-edit-document-current')).toHaveTextContent(L.documentCurrent);
    expect(screen.getByTestId('supplier-spec-edit-document-view')).toHaveAttribute('href', 'org-x/spec-1/existing.pdf');
  });

  it('surfaces an inline error when the document upload fails (changes still saved)', async () => {
    const uploadSupplierSpecDoc = vi.fn().mockResolvedValue({ ok: false, error: 'storage failed' });
    const { user } = await openEdit({ uploadSupplierSpecDoc });
    const file = new File(['x'], 'spec.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('supplier-spec-edit-document') as HTMLInputElement, file);
    await user.click(screen.getByTestId('supplier-spec-edit-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.uploadFailed);
  });
});
