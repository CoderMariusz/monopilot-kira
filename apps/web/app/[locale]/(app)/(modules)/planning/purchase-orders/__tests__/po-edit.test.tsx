/**
 * P2-PLANNING (Wave R1 reversibility) — PO DRAFT edit affordances: RTL parity tests.
 *
 * Prototype: po-screens.jsx:150 (draft Edit action), po-screens.jsx:210 ("＋ Add line"),
 * modals.jsx:182-219 (add_po_line_modal). Edit/header modals mirror the create surface.
 *
 * The async RSC page reads Supabase + the reviewed update actions live; here we test
 * the client detail view + its edit/line modals against Server Action SEAMS:
 *   - Edit affordances render only on DRAFT (non-draft hides them — honest);
 *   - "Edit order" opens the header modal PREFILLED and submits the exact
 *     updatePurchaseOrder payload;
 *   - per-line Edit opens the line modal prefilled + submits updatePurchaseOrderLine;
 *   - "+ Add line" submits addPurchaseOrderLine;
 *   - Delete maps the last-line refusal (client hint + server `last_line`) and the
 *     `invalid_state` error.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PoDetailView, type PoDetail, type PoDetailLabels, type PoTransitionResult } from '../_components/po-detail-view';
import type { PoSupplierOption } from '../_actions/po-form-data';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const statusLabels = {
  draft: 'Draft',
  sent: 'Sent',
  confirmed: 'Confirmed',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
};

const errors = {
  invalid_input: 'invalid',
  forbidden: 'no permission',
  not_found: 'gone',
  already_exists: 'dup',
  invalid_state: 'no longer a draft',
  last_line: 'must keep one line',
  po_has_receipts: 'PO already has receipts',
  persistence_failed: 'save failed',
};

const suppliers: PoSupplierOption[] = [
  { id: 'sup-1', code: 'AGRO', name: 'Agro-Fresh', currency: 'EUR' },
  { id: 'sup-2', code: 'BALT', name: 'Baltic Pork', currency: 'PLN' },
];

const editLabels: PoDetailLabels['edit'] = {
  editOrder: 'Edit order',
  addLine: '+ Add line',
  editLine: 'Edit',
  deleteLine: 'Delete',
  deleteLinePrompt: 'Delete line {line}?',
  lastLineRefused: 'must keep one line',
  modal: {
    title: 'Edit purchase order',
    supplierLabel: 'Supplier',
    supplierPlaceholder: 'Select a supplier',
    expectedLabel: 'Expected delivery',
    currencyLabel: 'Currency',
    notesLabel: 'Notes',
    notesPlaceholder: 'Optional',
    submit: 'Save changes',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errors: {
      supplierRequired: 'Select a supplier.',
      invalid_input: 'invalid',
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_state: 'no longer a draft',
      persistence_failed: 'save failed',
    },
  },
  lineModal: {
    addTitle: 'Add PO line',
    editTitle: 'Edit PO line',
    lineItem: 'Item',
    lineQty: 'Qty',
    lineUom: 'UoM',
    lineUnitPrice: 'Unit price',
    uomPlaceholder: 'Unit',
    uomOptions: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
    qtyPlaceholder: '0',
    unitPricePlaceholder: '0.00',
    submitAdd: 'Add line',
    submitEdit: 'Save line',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errors: {
      itemRequired: 'Pick an item.',
      qtyRequired: 'Enter a quantity.',
      invalid_input: 'invalid',
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_state: 'no longer a draft',
      persistence_failed: 'save failed',
    },
    picker: {
      trigger: '+ Add item',
      searchLabel: 'Search items',
      searchPlaceholder: 'Search…',
      loading: 'Searching…',
      empty: 'No matches',
      cancel: 'Cancel',
      error: 'Search failed',
    },
  },
};

const detailLabels: PoDetailLabels = {
  status: statusLabels,
  summary: { title: 'PO summary', supplier: 'Supplier', status: 'Status', expected: 'Expected delivery', currency: 'Currency', total: 'Total', created: 'Created' },
  lines: { title: 'PO lines', seq: '#', item: 'Item', qty: 'Qty', uom: 'UoM', unitPrice: 'Unit price', lineTotal: 'Line total', received: 'Received', receivedFull: 'Received', receivedPartial: 'Partial', empty: 'No lines.' },
  receivedSummary: { title: 'Receipt progress', lines: '{received} / {total} lines' },
  transitions: { title: 'Status', send: 'Submit', confirm: 'Confirm', receivePartial: 'Mark partial', receive: 'Mark received', cancel: 'Cancel PO', pending: 'Updating…', confirmPrompt: 'Change status of {po} to {status}?' },
  reopen: { button: 'Reopen to draft', pending: 'Reopening…', confirmPrompt: 'Reopen {po} to draft?' },
  notesTitle: 'Notes',
  errors,
  edit: editLabels,
};

function makePo(over: Partial<PoDetail> = {}): PoDetail {
  return {
    id: 'po-1',
    poNumber: 'PO-DRAFT-1',
    supplierId: 'sup-1',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh',
    status: 'draft',
    expectedDelivery: '2026-07-01',
    currency: 'EUR',
    notes: 'hello',
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      { id: 'line-1', itemCode: 'RM-001', itemName: 'Pork Belly', qty: '100', uom: 'kg', unitPrice: '5.50', lineNo: 1, receivedQty: '0' },
      { id: 'line-2', itemCode: 'RM-002', itemName: 'Casing', qty: '40', uom: 'm', unitPrice: '0.20', lineNo: 2, receivedQty: '0' },
    ],
    ...over,
  };
}

function renderDetail(over: {
  po?: PoDetail;
  update?: ReturnType<typeof vi.fn>;
  addLine?: ReturnType<typeof vi.fn>;
  updateLine?: ReturnType<typeof vi.fn>;
  deleteLine?: ReturnType<typeof vi.fn>;
} = {}) {
  const transition = vi.fn<[string, string], Promise<PoTransitionResult>>().mockResolvedValue({ ok: true, data: {} });
  const update = over.update ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const addLine = over.addLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const updateLine = over.updateLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const deleteLine = over.deleteLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const search = vi.fn<[unknown], Promise<ItemPickerOption[]>>().mockResolvedValue([
    { id: 'item-9', itemCode: 'RM-009', name: 'New Item', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]);
  const utils = render(
    <PoDetailView
      locale="en"
      po={over.po ?? makePo()}
      labels={detailLabels}
      transitionPurchaseOrderStatusAction={transition}
      suppliers={suppliers}
      searchPoItemsAction={search}
      updatePurchaseOrderAction={update}
      addPurchaseOrderLineAction={addLine}
      updatePurchaseOrderLineAction={updateLine}
      deletePurchaseOrderLineAction={deleteLine}
    />,
  );
  return { ...utils, transition, update, addLine, updateLine, deleteLine, search };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('PO DRAFT edit affordances (Wave R1)', () => {
  it('hides edit affordances on a non-draft PO (honest)', () => {
    renderDetail({ po: makePo({ status: 'confirmed' }) });
    expect(screen.queryByTestId('po-edit-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('po-add-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('po-line-edit-line-1')).not.toBeInTheDocument();
  });

  it('shows edit affordances on a DRAFT PO', () => {
    renderDetail();
    expect(screen.getByTestId('po-edit-order')).toBeInTheDocument();
    expect(screen.getByTestId('po-add-line')).toBeInTheDocument();
    expect(screen.getByTestId('po-line-edit-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('po-line-delete-line-1')).toBeInTheDocument();
  });

  it('opens the header edit modal PREFILLED and submits the updatePurchaseOrder payload', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('po-edit-order'));

    const form = await screen.findByTestId('edit-po-form');
    // Prefilled: expected date + currency from the PO.
    expect(within(form).getByTestId('edit-po-expected')).toHaveValue('2026-07-01');
    expect(within(form).getByTestId('edit-po-currency')).toHaveValue('EUR');
    expect(within(form).getByTestId('edit-po-notes')).toHaveValue('hello');

    fireEvent.click(screen.getByTestId('edit-po-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      id: 'po-1',
      supplierId: 'sup-1',
      expectedDelivery: '2026-07-01',
      currency: 'EUR',
      notes: 'hello',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('maps invalid_state from updatePurchaseOrder (no longer a draft)', async () => {
    const update = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_state' });
    renderDetail({ update });
    fireEvent.click(screen.getByTestId('po-edit-order'));
    await screen.findByTestId('edit-po-form');
    fireEvent.click(screen.getByTestId('edit-po-submit'));
    expect(await screen.findByTestId('edit-po-error')).toHaveTextContent('no longer a draft');
  });

  it('opens the per-line edit modal prefilled and submits updatePurchaseOrderLine', async () => {
    const { updateLine } = renderDetail();
    fireEvent.click(screen.getByTestId('po-line-edit-line-1'));
    const form = await screen.findByTestId('po-line-form');
    expect(within(form).getByTestId('po-line-qty')).toHaveValue('100');
    expect(within(form).getByTestId('po-line-price')).toHaveValue('5.50');
    // existing item shown read-only (no itemId change in the contract)
    expect(within(form).getByTestId('po-line-item-readonly')).toHaveTextContent('RM-001');

    fireEvent.change(within(form).getByTestId('po-line-qty'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('po-line-submit'));
    await waitFor(() => expect(updateLine).toHaveBeenCalledTimes(1));
    expect(updateLine).toHaveBeenCalledWith({ poId: 'po-1', lineId: 'line-1', qty: '120', uom: 'kg', unitPrice: '5.50' });
  });

  it('opens the add-line modal and submits addPurchaseOrderLine after picking an item', async () => {
    const { addLine, search } = renderDetail();
    fireEvent.click(screen.getByTestId('po-add-line'));
    const form = await screen.findByTestId('po-line-form');
    expect(within(form).queryByTestId('po-line-item-readonly')).not.toBeInTheDocument();

    // open the picker, search, select the result (ItemPicker combobox seam)
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('po-line-item-picked')).toHaveTextContent('RM-009'));

    fireEvent.change(within(form).getByTestId('po-line-qty'), { target: { value: '12' } });
    fireEvent.change(within(form).getByTestId('po-line-price'), { target: { value: '1.25' } });
    fireEvent.click(screen.getByTestId('po-line-submit'));
    await waitFor(() => expect(addLine).toHaveBeenCalledTimes(1));
    expect(addLine).toHaveBeenCalledWith({ poId: 'po-1', itemId: 'item-9', qty: '12', uom: 'kg', unitPrice: '1.25' });
  });

  it('refuses deleting the last line with the dedicated message (client hint)', async () => {
    const deleteLine = vi.fn();
    renderDetail({ po: makePo({ lines: [makePo().lines[0]] }), deleteLine });
    fireEvent.click(screen.getByTestId('po-line-delete-line-1'));
    expect(await screen.findByTestId('po-detail-error')).toHaveTextContent('must keep one line');
    expect(deleteLine).not.toHaveBeenCalled();
  });

  it('confirms then deletes a line, mapping the server last_line refusal', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const deleteLine = vi.fn().mockResolvedValue({ ok: false, error: 'last_line' });
    renderDetail({ deleteLine });
    fireEvent.click(screen.getByTestId('po-line-delete-line-1'));
    await waitFor(() => expect(deleteLine).toHaveBeenCalledWith({ poId: 'po-1', lineId: 'line-1' }));
    expect(await screen.findByTestId('po-detail-error')).toHaveTextContent('must keep one line');
  });
});
