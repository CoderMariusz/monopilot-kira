/**
 * P2-PLANNING — Desktop "Receive" PO line affordance: RTL parity tests.
 *
 * Prototype: po-screens.jsx:204-251 (PO lines table + per-line received column).
 * The desktop receive surface is an ADDITIVE affordance (receiving otherwise lives
 * in the scanner GRN flow); its modal mirrors the established PO line/edit modals
 * (modals.jsx:182-219 — Modal.Header + grid fields + Modal.Footer cancel/submit).
 *
 * The async RSC page reads Supabase + threads receivePoLineDesktop live; here we
 * test the client detail view + its receive modal against the Server Action SEAM:
 *   - the "Receive" button shows ONLY on confirmed / partially_received POs and only
 *     for a line that is not fully received (honest — hidden otherwise);
 *   - the modal prefills qty = ordered − received and submits the exact
 *     receivePoLineDesktop payload;
 *   - on { ok:true } it shows the new GRN/LP success line + refreshes the page;
 *   - on { ok:false } it maps the error to an inline role="alert", special-casing
 *     over_receive_cap + no_warehouse;
 *   - RBAC is never client-trusted — the page passes the seam and the action
 *     enforces warehouse.grn.receive server-side (asserted: no client flag gates the
 *     button beyond status + seam presence).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PoDetailView, type PoDetail, type PoDetailLabels, type PoTransitionResult } from '../_components/po-detail-view';
import type { ReceiveLocationOption } from '../_components/receive-po-line-modal';
import type { DesktopReceiveInput, DesktopReceiveResult } from '../_actions/receive-po-line.types';

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

const receiveLabels: NonNullable<PoDetailLabels['receive']> = {
  button: 'Receive',
  modal: {
    title: 'Receive PO line',
    forLine: 'Ordered {item}',
    qtyLabel: 'Qty received',
    qtyHelp: 'Ordered {ordered}, already received {received}.',
    qtyPlaceholder: '0',
    batchLabel: 'Batch / Lot',
    batchPlaceholder: 'Optional',
    bestBeforeLabel: 'Best before',
    locationLabel: 'Destination location',
    locationPlaceholder: 'Default warehouse',
    submit: 'Receive into stock',
    submitting: 'Receiving…',
    cancel: 'Cancel',
    success: 'Received {qty} {uom} — GRN {grn}, LP {lp}.',
    overReceivedNote: 'Over-received vs the ordered quantity.',
    qcRaisedNote: 'A QC inspection was raised.',
    errors: {
      qtyRequired: 'Enter a quantity greater than zero.',
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_qty: 'invalid qty',
      over_receive_cap: 'Cannot exceed 110% of the ordered quantity.',
      no_warehouse: 'No warehouse configured — set one up in Settings.',
      invalid_location: 'That location is invalid.',
      invalid_state: 'no longer a draft',
      error: 'save failed',
    },
  },
};

const detailLabels: PoDetailLabels = {
  status: statusLabels,
  summary: { title: 'PO summary', supplier: 'Supplier', status: 'Status', expected: 'Expected delivery', currency: 'Currency', total: 'Total', created: 'Created' },
  lines: { title: 'PO lines', seq: '#', item: 'Item', qty: 'Qty', uom: 'UoM', unitPrice: 'Unit price', lineTotal: 'Line total', received: 'Received', receivedFull: 'Received', receivedPartial: 'Partial', empty: 'No lines.' },
  receivedSummary: { title: 'Receipt progress', lines: '{received} / {total} lines' },
  transitions: { title: 'Status', send: 'Submit', confirm: 'Confirm', receivePartial: 'Mark partial', receive: 'Mark received', cancel: 'Cancel PO', pending: 'Updating…', confirmPrompt: 'Change status of {po} to {status}?', cancelConfirmTitle: 'Cancel {po}?', cancelConfirmBody: 'cancel body', cancelSuccess: 'cancelled', cancelPoHasReceipts: 'has receipts' },
  reopen: { button: 'Reopen', pending: 'Reopening…', confirmPrompt: 'Reopen {po}?', confirmTitle: 'Reopen {po}?', confirmBody: 'body', success: 'reopened', error: 'failed' },
  notesTitle: 'Notes',
  errors,
  edit: {
    editOrder: 'Edit order', addLine: '+ Add line', editLine: 'Edit', deleteLine: 'Delete',
    deleteLinePrompt: 'Delete line {line}?', lastLineRefused: 'must keep one line',
    modal: {
      title: 'Edit purchase order', supplierLabel: 'Supplier', supplierPlaceholder: 'Select a supplier',
      expectedLabel: 'Expected delivery', currencyLabel: 'Currency', notesLabel: 'Notes', notesPlaceholder: 'Optional',
      submit: 'Save changes', submitting: 'Saving…', cancel: 'Cancel',
      errors: { supplierRequired: 'Select a supplier.', invalid_input: 'invalid', forbidden: 'no permission', not_found: 'gone', invalid_state: 'no longer a draft', persistence_failed: 'save failed' },
    },
    lineModal: {
      addTitle: 'Add PO line', editTitle: 'Edit PO line', lineItem: 'Item', lineQty: 'Qty', lineUom: 'UoM', lineUnitPrice: 'Unit price',
      uomPlaceholder: 'Unit', uomOptions: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
      qtyPlaceholder: '0', unitPricePlaceholder: '0.00', submitAdd: 'Add line', submitEdit: 'Save line', submitting: 'Saving…', cancel: 'Cancel',
      errors: { itemRequired: 'Pick an item.', qtyRequired: 'Enter a quantity.', invalid_input: 'invalid', forbidden: 'no permission', not_found: 'gone', invalid_state: 'no longer a draft', persistence_failed: 'save failed' },
      picker: { trigger: '+ Add item', searchLabel: 'Search items', searchPlaceholder: 'Search…', loading: 'Searching…', empty: 'No matches', cancel: 'Cancel', error: 'Search failed' },
    },
  },
  receive: receiveLabels,
};

function makePo(over: Partial<PoDetail> = {}): PoDetail {
  return {
    id: 'po-1',
    poNumber: 'PO-CONF-1',
    supplierId: 'sup-1',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh',
    status: 'confirmed',
    expectedDelivery: '2026-07-01',
    currency: 'EUR',
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      { id: 'line-1', itemCode: 'RM-001', itemName: 'Pork Belly', qty: '100', uom: 'kg', unitPrice: '5.50', lineNo: 1, receivedQty: '0' },
      { id: 'line-2', itemCode: 'RM-002', itemName: 'Casing', qty: '40', uom: 'm', unitPrice: '0.20', lineNo: 2, receivedQty: '40' },
    ],
    ...over,
  };
}

const OK_RESULT: DesktopReceiveResult = {
  ok: true,
  grnId: 'grn-1',
  grnNumber: 'GRN-20260626-0001',
  lpId: 'lp-1',
  lpNumber: 'LP-ABC-123456',
  qty: '100',
  uom: 'kg',
  overReceived: false,
  poStatus: 'partially_received',
  qcInspectionRequired: false,
  inspectionId: null,
};

function renderDetail(over: { po?: PoDetail; receive?: ReturnType<typeof vi.fn>; locations?: ReceiveLocationOption[] } = {}) {
  const transition = vi.fn<[string, string], Promise<PoTransitionResult>>().mockResolvedValue({ ok: true, data: {} });
  const receive = (over.receive ?? vi.fn().mockResolvedValue(OK_RESULT)) as unknown as (input: DesktopReceiveInput) => Promise<DesktopReceiveResult>;
  const utils = render(
    <PoDetailView
      locale="en"
      po={over.po ?? makePo()}
      labels={detailLabels}
      transitionPurchaseOrderStatusAction={transition}
      receivePoLineAction={receive}
      receiveLocations={over.locations ?? []}
    />,
  );
  return { ...utils, transition, receive };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Desktop PO line receive affordance', () => {
  it('shows Receive ONLY for not-fully-received lines on a confirmed PO', () => {
    renderDetail();
    // line-1 (0/100) → receivable; line-2 (40/40) → fully received, no button.
    expect(screen.getByTestId('po-line-receive-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('po-line-receive-line-2')).not.toBeInTheDocument();
  });

  it('shows Receive on a partially_received PO', () => {
    renderDetail({ po: makePo({ status: 'partially_received' }) });
    expect(screen.getByTestId('po-line-receive-line-1')).toBeInTheDocument();
  });

  it('hides Receive entirely on a draft / sent / received / cancelled PO (honest)', () => {
    for (const status of ['draft', 'sent', 'received', 'cancelled']) {
      const { unmount } = renderDetail({ po: makePo({ status }) });
      expect(screen.queryByTestId('po-line-receive-line-1')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('hides Receive when the seam is not wired (RBAC-driven by the page, never a client flag)', () => {
    render(<PoDetailView locale="en" po={makePo()} labels={detailLabels} transitionPurchaseOrderStatusAction={vi.fn()} />);
    expect(screen.queryByTestId('po-line-receive-line-1')).not.toBeInTheDocument();
  });

  it('opens the modal prefilled with the remaining qty and submits the exact payload', async () => {
    const { receive } = renderDetail();
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    expect(within(form).getByTestId('po-receive-qty')).toHaveValue('100');

    fireEvent.change(within(form).getByTestId('po-receive-batch'), { target: { value: 'LOT-7' } });
    fireEvent.change(within(form).getByTestId('po-receive-best-before'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    await waitFor(() => expect(receive).toHaveBeenCalledTimes(1));
    expect(receive).toHaveBeenCalledWith({
      poLineId: 'line-1',
      qty: '100',
      batchNumber: 'LOT-7',
      bestBefore: '2026-12-31',
      toLocationId: null,
    });
  });

  it('shows the GRN/LP success line and refreshes the page on { ok:true }', async () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    await screen.findByTestId('po-receive-form');
    fireEvent.click(screen.getByTestId('po-receive-submit'));
    const ok = await screen.findByTestId('po-receive-success');
    expect(ok).toHaveTextContent('GRN-20260626-0001');
    expect(ok).toHaveTextContent('LP-ABC-123456');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('maps over_receive_cap to its dedicated inline alert', async () => {
    const receive = vi.fn().mockResolvedValue({ ok: false, error: 'over_receive_cap' } satisfies DesktopReceiveResult);
    renderDetail({ receive });
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    await screen.findByTestId('po-receive-form');
    fireEvent.click(screen.getByTestId('po-receive-submit'));
    const alert = await screen.findByTestId('po-receive-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Cannot exceed 110% of the ordered quantity.');
  });

  it('maps no_warehouse to the "configure a warehouse in Settings" alert', async () => {
    const receive = vi.fn().mockResolvedValue({ ok: false, error: 'no_warehouse' } satisfies DesktopReceiveResult);
    renderDetail({ receive });
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    await screen.findByTestId('po-receive-form');
    fireEvent.click(screen.getByTestId('po-receive-submit'));
    expect(await screen.findByTestId('po-receive-error')).toHaveTextContent('No warehouse configured — set one up in Settings.');
  });

  it('validates qty locally before calling the action (never submits an empty qty)', async () => {
    const { receive } = renderDetail();
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    fireEvent.change(within(form).getByTestId('po-receive-qty'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('po-receive-submit'));
    expect(await screen.findByTestId('po-receive-error')).toHaveTextContent('Enter a quantity greater than zero.');
    expect(receive).not.toHaveBeenCalled();
  });

  it('renders the destination picker when locations are supplied and threads toLocationId', async () => {
    const receive = vi.fn().mockResolvedValue(OK_RESULT);
    renderDetail({
      receive,
      locations: [
        { id: 'loc-1', code: 'A-01', name: 'Aisle A-01', warehouseId: 'wh-1', warehouseCode: 'MAIN', warehouseName: 'Main' },
      ],
    });
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    await screen.findByTestId('po-receive-form');

    // The shared Select renders a combobox trigger; opening it surfaces the
    // warehouse-grouped option, and choosing it threads toLocationId.
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('MAIN · A-01'));
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    await waitFor(() => expect(receive).toHaveBeenCalledTimes(1));
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ poLineId: 'line-1', toLocationId: 'loc-1' }));
  });

  it('omits the destination picker when no locations are available (falls back to default warehouse)', async () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('po-line-receive-line-1'));
    await screen.findByTestId('po-receive-form');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
