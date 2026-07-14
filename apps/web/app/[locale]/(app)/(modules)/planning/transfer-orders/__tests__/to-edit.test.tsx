/**
 * P2-PLANNING (Wave R1 reversibility) — TO DRAFT edit affordances: RTL parity tests.
 *
 * Prototype: to-screens.jsx:112,143,277 (draft Edit → TOCreateModal editing),
 * modals.jsx:684-820/791-829 (to_create_edit_modal + line editor).
 *
 * Tests the client detail view + its edit/line modals against Server Action SEAMS:
 *   - Edit affordances render only on DRAFT (non-draft hides them);
 *   - "Edit order" opens the header modal PREFILLED (from/to/expected/notes) and
 *     submits the exact updateTransferOrder payload (with `expectedDate`);
 *   - the distinct-warehouse client hint surfaces (To === From);
 *   - per-line Edit/Add submit update/addTransferOrderLine (positional contract);
 *   - the last-line refusal is honored.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToDetailView, type ToDetailLabels, type TransferOrderDetail } from '../_components/to-detail-view';
import type { WarehouseOption } from '../_actions/to-form-data';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const errors = {
  invalid_input: 'invalid',
  forbidden: 'no permission',
  not_found: 'gone',
  already_exists: 'dup',
  invalid_state: 'no longer a draft',
  last_line: 'must keep one line',
  persistence_failed: 'save failed',
};

const warehouses: WarehouseOption[] = [
  { id: 'wh-1', code: 'WH-A', name: 'Factory A' },
  { id: 'wh-2', code: 'WH-B', name: 'Dist Central' },
];

const editLabels: ToDetailLabels['edit'] = {
  editOrder: 'Edit order',
  addLine: '+ Add line',
  editLine: 'Edit',
  deleteLine: 'Delete',
  deleteLinePrompt: 'Delete line {line}?',
  lastLineRefused: 'must keep one line',
  modal: {
    title: 'Edit transfer order',
    fromWarehouseLabel: 'From warehouse',
    toWarehouseLabel: 'To warehouse',
    warehousePlaceholder: 'Select warehouse',
    expectedDateLabel: 'Scheduled date',
    notesLabel: 'Notes',
    notesPlaceholder: 'Optional',
    submit: 'Save changes',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errors: {
      warehousesRequired: 'Both warehouses are required.',
      sameWarehouse: 'To warehouse must differ from From warehouse.',
      invalid_input: 'invalid',
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_state: 'no longer a draft',
      persistence_failed: 'save failed',
    },
  },
  lineModal: {
    addTitle: 'Add TO line',
    editTitle: 'Edit TO line',
    lineItem: 'Product',
    lineQty: 'Qty',
    lineUom: 'UoM',
    uomPlaceholder: 'Unit',
    uomOptions: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
    qtyPlaceholder: '0',
    submitAdd: 'Add line',
    submitEdit: 'Save line',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errors: {
      itemRequired: 'Pick a product.',
      qtyRequired: 'Enter a quantity.',
      invalid_input: 'invalid',
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_state: 'no longer a draft',
      persistence_failed: 'save failed',
    },
    picker: {
      trigger: 'Select product',
      searchLabel: 'Search products',
      searchPlaceholder: 'Search…',
      loading: 'Searching…',
      empty: 'No matches',
      cancel: 'Cancel',
      error: 'Search failed',
    },
  },
};

const reverseReceiptLabels: ToDetailLabels['reverseReceipt'] = {
  received: 'Received',
  destLp: 'Destination pallet',
  action: 'Reverse receipt…',
  permissionTooltip: 'You need the warehouse transfer correction permission to reverse a received line.',
  notReceivableTooltip: 'Only received lines with a destination pallet can be reversed.',
  modal: {
    title: 'Reverse receipt · line {line}',
    intro: 'Reversing returns the destination pallet to the source and reopens this line.',
    summary: { toNumber: 'Transfer order', product: 'Product', destLp: 'Destination pallet', quantity: 'Quantity to reverse' },
    reasonCode: 'Reason',
    reasonPlaceholder: 'Select a reason',
    reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
    note: 'Note',
    noteOptional: 'optional',
    notePlaceholder: 'Add context for the reversal',
    esign: { title: 'Electronic signature', meaning: 'Enter your e-sign PIN to sign this reversal — or your account password while you have no PIN enrolled. Your identity and the server time are recorded.', password: 'E-sign PIN or account password', passwordPlaceholder: 'E-sign PIN or account password', passwordHelp: 'Your account password is accepted only while you have no e-sign PIN enrolled.' },
    cancel: 'Cancel',
    submit: 'Reverse receipt',
    submitting: 'Reversing…',
    formIncomplete: 'Pick a reason and enter your password or PIN.',
    errors: {
      forbidden: 'You do not have permission to reverse this receipt.',
      not_found: 'This received line no longer exists.',
      invalid_input: 'Check the fields and try again.',
      invalid_state: 'This transfer order is no longer in a state that allows reversing a receipt.',
      invalid_quantity: 'The reverse quantity must equal the received destination pallet quantity.',
      lp_active: "This pallet is reserved, allocated, consumed or shipped and can't be reversed.",
      esign_failed: 'Signature failed — check your password or PIN and retry.',
      persistence_failed: 'Unable to reverse this receipt.',
      generic: 'Unable to reverse this receipt.',
    },
  },
};

const labels: ToDetailLabels = {
  status: { draft: 'Draft', in_transit: 'In transit', received: 'Received', cancelled: 'Cancelled' },
  summary: { title: 'TO summary', toNumber: 'TO number', from: 'From', to: 'To', status: 'Status', scheduled: 'Scheduled', created: 'Created', updated: 'Updated', notes: 'Notes', none: '—' },
  lines: { title: 'TO lines', seq: '#', product: 'Product', qty: 'Qty', uom: 'UoM', empty: 'No lines.' },
  transitions: { title: 'Status', ship: 'Ship', receive: 'Receive', cancel: 'Cancel', confirm: 'Change {to} to {status}?', pending: 'Updating…', none: 'No actions' },
  errors,
  edit: editLabels,
  reverseReceipt: reverseReceiptLabels,
};

function makeTo(over: Partial<TransferOrderDetail> = {}): TransferOrderDetail {
  return {
    id: 'to-1',
    toNumber: 'TO-DRAFT-1',
    fromWarehouseId: 'wh-1',
    toWarehouseId: 'wh-2',
    status: 'draft',
    scheduledDate: '2026-07-02',
    notes: 'move it',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    lines: [
      { id: 'line-1', toId: 'to-1', itemId: 'item-1', itemCode: 'RM-001', itemName: 'Pork', qty: '50', uom: 'kg', lineNo: 1, receivedDestLpId: null, receivedDestLpNumber: null, receivedQty: null, canReverse: false, reverseBlockReason: null },
      { id: 'line-2', toId: 'to-1', itemId: 'item-2', itemCode: 'RM-002', itemName: 'Casing', qty: '10', uom: 'm', lineNo: 2, receivedDestLpId: null, receivedDestLpNumber: null, receivedQty: null, canReverse: false, reverseBlockReason: null },
    ],
    ...over,
  };
}

function renderDetail(over: {
  to?: TransferOrderDetail;
  update?: ReturnType<typeof vi.fn>;
  addLine?: ReturnType<typeof vi.fn>;
  updateLine?: ReturnType<typeof vi.fn>;
  deleteLine?: ReturnType<typeof vi.fn>;
} = {}) {
  const transition = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const update = over.update ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const addLine = over.addLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const updateLine = over.updateLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const deleteLine = over.deleteLine ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const search = vi.fn<[unknown], Promise<ItemPickerOption[]>>().mockResolvedValue([
    { id: 'item-9', itemCode: 'RM-009', name: 'New Item', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]);
  const utils = render(
    <ToDetailView
      locale="en"
      transferOrder={over.to ?? makeTo()}
      warehouses={warehouses}
      labels={labels}
      transitionTransferOrderStatusAction={transition}
      searchTransferItemsAction={search}
      updateTransferOrderAction={update}
      addTransferOrderLineAction={addLine}
      updateTransferOrderLineAction={updateLine}
      deleteTransferOrderLineAction={deleteLine}
    />,
  );
  return { ...utils, update, addLine, updateLine, deleteLine, search };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('TO DRAFT edit affordances (Wave R1)', () => {
  it('hides edit affordances on a non-draft TO', () => {
    renderDetail({ to: makeTo({ status: 'in_transit' }) });
    expect(screen.queryByTestId('to-edit-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('to-add-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('to-line-edit-line-1')).not.toBeInTheDocument();
  });

  it('shows edit affordances on a DRAFT TO', () => {
    renderDetail();
    expect(screen.getByTestId('to-edit-order')).toBeInTheDocument();
    expect(screen.getByTestId('to-add-line')).toBeInTheDocument();
    expect(screen.getByTestId('to-line-edit-line-1')).toBeInTheDocument();
  });

  it('opens the header edit modal PREFILLED and submits the updateTransferOrder payload (expectedDate)', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('to-edit-order'));
    const form = await screen.findByTestId('edit-to-form');
    expect(within(form).getByTestId('edit-to-expected')).toHaveValue('2026-07-02');
    expect(within(form).getByTestId('edit-to-notes')).toHaveValue('move it');

    fireEvent.click(screen.getByTestId('edit-to-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      id: 'to-1',
      fromWarehouseId: 'wh-1',
      toWarehouseId: 'wh-2',
      expectedDate: '2026-07-02',
      notes: 'move it',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('submits an explicitly empty notes string when the operator clears notes', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('to-edit-order'));
    const form = await screen.findByTestId('edit-to-form');
    const notesInput = within(form).getByTestId('edit-to-notes');

    fireEvent.change(notesInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-to-submit'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      id: 'to-1',
      fromWarehouseId: 'wh-1',
      toWarehouseId: 'wh-2',
      expectedDate: '2026-07-02',
      notes: '',
    });
  });

  it('surfaces the distinct-warehouse client hint when To === From', async () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('to-edit-order'));
    const form = await screen.findByTestId('edit-to-form');
    // Set the To select to the same value as From (first combobox = From, second = To).
    const combos = within(form).getAllByRole('combobox');
    fireEvent.click(combos[1]);
    fireEvent.click(screen.getByRole('option', { name: 'WH-A — Factory A' }));
    expect(await screen.findByTestId('edit-to-same-warehouse-hint')).toBeInTheDocument();
  });

  it('opens the per-line edit modal prefilled and submits updateTransferOrderLine (positional)', async () => {
    const { updateLine } = renderDetail();
    fireEvent.click(screen.getByTestId('to-line-edit-line-1'));
    const form = await screen.findByTestId('to-line-form');
    expect(within(form).getByTestId('to-line-qty')).toHaveValue('50');
    expect(within(form).getByTestId('to-line-item-readonly')).toHaveTextContent('RM-001');

    fireEvent.change(within(form).getByTestId('to-line-qty'), { target: { value: '75' } });
    fireEvent.click(screen.getByTestId('to-line-submit'));
    await waitFor(() => expect(updateLine).toHaveBeenCalledTimes(1));
    expect(updateLine).toHaveBeenCalledWith('to-1', 'line-1', { quantity: '75', uom: 'kg' });
  });

  it('adds a line via addTransferOrderLine after picking a product', async () => {
    const { addLine } = renderDetail();
    fireEvent.click(screen.getByTestId('to-add-line'));
    const form = await screen.findByTestId('to-line-form');
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('to-line-item-picked')).toHaveTextContent('RM-009'));

    fireEvent.change(within(form).getByTestId('to-line-qty'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('to-line-submit'));
    await waitFor(() => expect(addLine).toHaveBeenCalledTimes(1));
    expect(addLine).toHaveBeenCalledWith('to-1', { itemId: 'item-9', quantity: '8', uom: 'kg' });
  });

  it('refuses deleting the last line (client hint)', async () => {
    const deleteLine = vi.fn();
    renderDetail({ to: makeTo({ lines: [makeTo().lines[0]] }), deleteLine });
    fireEvent.click(screen.getByTestId('to-line-delete-line-1'));
    expect(await screen.findByTestId('to-detail-error')).toHaveTextContent('must keep one line');
    expect(deleteLine).not.toHaveBeenCalled();
  });
});
