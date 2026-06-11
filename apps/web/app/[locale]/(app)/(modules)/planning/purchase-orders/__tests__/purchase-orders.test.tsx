/**
 * P2-PLANNING — Purchase Orders list + create + detail: RTL parity + state tests.
 *
 * Prototype: prototypes/planning/po-screens.jsx:1-351 (PlanPOList + PlanPODetail)
 * and prototypes/planning/modals.jsx (create-PO modal mechanics).
 *
 * The async RSC pages read Supabase via withOrgContext and are exercised live
 * (manual + Playwright). Here we test the client views + modal against Server
 * Action SEAMS:
 *   - list: status-tab + search + supplier filtering, empty-state, "+ Create PO"
 *     opens the modal, ?new=1 auto-open, rows link to detail;
 *   - create: the modal builds the exact PurchaseOrderCreateInput payload passed to
 *     createPurchaseOrder and surfaces validation + forbidden (RBAC) errors;
 *   - detail: header + lines table + computed total + the real status transitions
 *     wired to transitionPurchaseOrderStatus (with the confirm gate + forbidden
 *     surface).
 *
 * Labels are passed directly (the page composes these from next-intl in prod). The
 * en values mirror _meta/i18n-staging/purchase-orders.json (Planning.purchaseOrders)
 * 1:1 — that file is the merge source for the real i18n bundle (this task may not
 * edit apps/web/messages/**).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PoListView, type PoListLabels, type PoRow } from '../_components/po-list-view';
import { PoDetailView, type PoDetailLabels, type PoDetail } from '../_components/po-detail-view';
import type { CreatePoResult } from '../_components/create-po-modal';
import type { PoTransitionResult } from '../_components/po-detail-view';
import type { PoSupplierOption } from '../_actions/po-form-data';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

// ── Labels (mirror _meta/i18n-staging/purchase-orders.json en) ──
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
  forbidden: 'You don’t have permission to do that.',
  not_found: 'gone',
  already_exists: 'A purchase order with that number already exists.',
  invalid_state: 'invalid state',
  persistence_failed: 'save failed',
};

const listLabels: PoListLabels = {
  createPo: 'Create PO',
  searchPlaceholder: 'Search PO number or supplier…',
  rowsCount: '{n} rows',
  supplierFilterLabel: 'Supplier',
  allSuppliers: 'All suppliers',
  clearFilters: 'Clear all filters',
  tabsAll: 'All',
  status: statusLabels,
  columns: {
    po: 'PO number',
    supplier: 'Supplier',
    expected: 'Expected delivery',
    lines: 'Lines',
    status: 'Status',
    currency: 'Currency',
    actions: 'Actions',
  },
  view: 'View',
  empty: { title: 'No purchase orders yet', body: 'Create your first purchase order.', clear: 'Clear filters' },
  create: {
    title: 'Create purchase order',
    poNumberLabel: 'PO number',
    poNumberPlaceholder: 'e.g. PO-2026-0001',
    supplierLabel: 'Supplier',
    supplierPlaceholder: 'Select a supplier',
    expectedLabel: 'Expected delivery',
    currencyLabel: 'Currency',
    notesLabel: 'Notes',
    notesPlaceholder: 'Optional notes',
    linesTitle: 'Lines',
    addLine: '+ Add line',
    removeLine: 'Remove line',
    lineItem: 'Item',
    lineQty: 'Qty',
    lineUom: 'UoM',
    lineUnitPrice: 'Unit price',
    uomPlaceholder: 'Unit',
    uomOptions: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
    qtyPlaceholder: '0',
    unitPricePlaceholder: '0.00',
    submit: 'Create PO',
    submitting: 'Creating…',
    cancel: 'Cancel',
    errors: {
      poNumberRequired: 'Enter a PO number.',
      supplierRequired: 'Select a supplier.',
      linesRequired: 'Add at least one line with an item and a positive quantity.',
      ...errors,
    },
    picker: {
      trigger: '+ Add item',
      searchLabel: 'Search items',
      searchPlaceholder: 'Search by code or name…',
      loading: 'Searching…',
      empty: 'No matching items',
      cancel: 'Cancel',
      error: 'Item search failed',
    },
  },
};

const detailLabels: PoDetailLabels = {
  status: statusLabels,
  summary: {
    title: 'PO summary',
    supplier: 'Supplier',
    status: 'Status',
    expected: 'Expected delivery',
    currency: 'Currency',
    total: 'Total',
    created: 'Created',
  },
  lines: {
    title: 'PO lines',
    seq: '#',
    item: 'Item',
    qty: 'Qty',
    uom: 'UoM',
    unitPrice: 'Unit price',
    lineTotal: 'Line total',
    empty: 'No lines on this purchase order.',
  },
  transitions: {
    title: 'Status',
    send: 'Submit',
    confirm: 'Confirm',
    receivePartial: 'Mark partially received',
    receive: 'Mark received',
    cancel: 'Cancel PO',
    pending: 'Updating…',
    confirmPrompt: 'Change status of {po} to {status}?',
  },
  notesTitle: 'Notes',
  errors,
};

const suppliers: PoSupplierOption[] = [
  { id: 'sup-1', code: 'AGRO', name: 'Agro-Fresh Ltd.', currency: 'EUR' },
  { id: 'sup-2', code: 'BALT', name: 'Baltic Pork Co.', currency: 'PLN' },
];

function makeRow(over: Partial<PoRow>): PoRow {
  return {
    id: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierId: 'sup-1',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh Ltd.',
    status: 'draft',
    expectedDelivery: '2026-07-01',
    currency: 'EUR',
    notes: null,
    lineCount: 0,
    ...over,
  };
}

const ROWS: PoRow[] = [
  makeRow({ id: 'po-1', poNumber: 'PO-DRAFT', status: 'draft', supplierId: 'sup-1', supplierCode: 'AGRO', supplierName: 'Agro-Fresh Ltd.' }),
  makeRow({ id: 'po-2', poNumber: 'PO-SENT', status: 'sent', supplierId: 'sup-2', supplierCode: 'BALT', supplierName: 'Baltic Pork Co.' }),
  makeRow({ id: 'po-3', poNumber: 'PO-CONF', status: 'confirmed', supplierId: 'sup-1', supplierCode: 'AGRO', supplierName: 'Agro-Fresh Ltd.' }),
];

function renderList(props: Partial<React.ComponentProps<typeof PoListView>> = {}) {
  const searchPoItemsAction = vi.fn<[unknown], Promise<ItemPickerOption[]>>().mockResolvedValue([
    { id: 'item-1', itemCode: 'RM-001', name: 'Pork Belly', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]);
  const createPurchaseOrderAction = vi.fn<[unknown], Promise<CreatePoResult>>();
  const utils = render(
    <PoListView
      locale="en"
      purchaseOrders={ROWS}
      suppliers={suppliers}
      labels={listLabels}
      searchPoItemsAction={searchPoItemsAction}
      createPurchaseOrderAction={createPurchaseOrderAction}
      {...props}
    />,
  );
  return { ...utils, searchPoItemsAction, createPurchaseOrderAction };
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PoListView — structure + filtering (parity: po-screens.jsx:56-126)', () => {
  it('renders status tabs with live counts and a dense PO table', () => {
    renderList();
    expect(screen.getByTestId('po-list-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('po-list-tab-all')).toHaveTextContent('3');
    expect(screen.getByTestId('po-list-tab-draft')).toHaveTextContent('1');
    expect(screen.getByTestId('po-list-tab-sent')).toHaveTextContent('1');
    expect(screen.getByTestId('po-list-tab-confirmed')).toHaveTextContent('1');
    expect(screen.getByTestId('po-link-po-1')).toHaveAttribute('href', '/en/planning/purchase-orders/po-1');
    expect(within(screen.getByTestId('po-row-po-1')).getByText('Agro-Fresh Ltd.')).toBeInTheDocument();
  });

  it('filters by status tab', () => {
    renderList();
    fireEvent.click(screen.getByTestId('po-list-tab-sent'));
    expect(screen.queryByTestId('po-row-po-1')).toBeNull();
    expect(screen.getByTestId('po-row-po-2')).toBeInTheDocument();
  });

  it('filters by search over PO number and supplier', () => {
    renderList();
    fireEvent.change(screen.getByTestId('po-list-search'), { target: { value: 'Baltic' } });
    expect(screen.getByTestId('po-row-po-2')).toBeInTheDocument();
    expect(screen.queryByTestId('po-row-po-1')).toBeNull();
  });

  it('shows the empty-state when no rows match (parity: po-screens.jsx empty list)', () => {
    renderList();
    fireEvent.change(screen.getByTestId('po-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent('No purchase orders yet');
  });

  it('renders the empty-state when the org has zero purchase orders (RLS-denied = empty)', () => {
    renderList({ purchaseOrders: [] });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent('No purchase orders yet');
    expect(screen.queryByTestId('po-list-table')).toBeNull();
  });
});

describe('PoListView — create modal (parity: po-screens.jsx:45 + modals create-PO)', () => {
  it('auto-opens the create modal on ?new=1 deep-link', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-po-form')).toBeInTheDocument();
  });

  it('builds the createPurchaseOrder payload (supplier + line) and refreshes on success', async () => {
    const { createPurchaseOrderAction } = renderList();
    createPurchaseOrderAction.mockResolvedValue({ ok: true, data: {} });

    fireEvent.click(screen.getByTestId('po-list-create'));
    expect(screen.getByTestId('create-po-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('create-po-number'), { target: { value: 'PO-NEW-1' } });

    // Supplier select (shadcn-family @monopilot/ui Select — no raw <select>),
    // scoped to the modal form. The form now also contains a per-line UoM
    // dropdown (combobox), so the supplier is the FIRST combobox in the form.
    const form1 = screen.getByTestId('create-po-form');
    fireEvent.click(within(form1).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

    // Pick a real item via the ItemPicker combobox seam.
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-po-line-item')).toHaveTextContent('RM-001'));

    // PARITY: the UoM field is the shared constrained dropdown (no free-text
    // <input>), and it defaults to the picked item's base UoM (kg) — changeable.
    const uomCell = screen.getByTestId('create-po-line-uom');
    expect(within(uomCell).queryByRole('textbox')).toBeNull();
    const uomTrigger = within(uomCell).getByRole('combobox');
    expect(uomTrigger).toHaveTextContent('kg');

    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '500' } });
    fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: '2.50' } });

    fireEvent.click(screen.getByTestId('create-po-submit'));

    await waitFor(() =>
      expect(createPurchaseOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({
          poNumber: 'PO-NEW-1',
          supplierId: 'sup-1',
          currency: 'EUR',
          lines: [expect.objectContaining({ itemId: 'item-1', qty: '500', uom: 'kg', unitPrice: '2.50', lineNo: 1 })],
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('lets the user override the defaulted UoM via the dropdown (no free text)', async () => {
    const { createPurchaseOrderAction } = renderList();
    createPurchaseOrderAction.mockResolvedValue({ ok: true, data: {} });

    fireEvent.click(screen.getByTestId('po-list-create'));
    fireEvent.change(screen.getByTestId('create-po-number'), { target: { value: 'PO-NEW-2' } });

    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-po-line-item')).toHaveTextContent('RM-001'));

    // Change the unit from the defaulted kg to pcs via the dropdown.
    const uomCell = screen.getByTestId('create-po-line-uom');
    fireEvent.click(within(uomCell).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'pcs' }));

    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('create-po-submit'));

    await waitFor(() =>
      expect(createPurchaseOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({ itemId: 'item-1', qty: '12', uom: 'pcs', lineNo: 1 })],
        }),
      ),
    );
  });

  it('blocks submit and shows an error when no supplier is selected', async () => {
    const { createPurchaseOrderAction } = renderList();
    fireEvent.click(screen.getByTestId('po-list-create'));
    fireEvent.change(screen.getByTestId('create-po-number'), { target: { value: 'PO-X' } });
    fireEvent.click(screen.getByTestId('create-po-submit'));
    await waitFor(() => expect(screen.getByTestId('create-po-error')).toHaveTextContent('Select a supplier.'));
    expect(createPurchaseOrderAction).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden RBAC result inline (server-enforced, not client-trusted)', async () => {
    const { createPurchaseOrderAction } = renderList();
    createPurchaseOrderAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('po-list-create'));
    fireEvent.change(screen.getByTestId('create-po-number'), { target: { value: 'PO-X' } });
    const form2 = screen.getByTestId('create-po-form');
    fireEvent.click(within(form2).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '10' } });

    fireEvent.click(screen.getByTestId('create-po-submit'));
    await waitFor(() => expect(screen.getByTestId('create-po-error')).toHaveTextContent(errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('PoDetailView — header + lines + transitions (parity: po-screens.jsx:166-249,290-312)', () => {
  const detail: PoDetail = {
    id: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh Ltd.',
    status: 'draft',
    expectedDelivery: '2026-07-01',
    currency: 'EUR',
    notes: 'Deliver to dock 3',
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      { id: 'l1', itemCode: 'RM-001', itemName: 'Pork Belly', qty: '500', uom: 'kg', unitPrice: '2.50', lineNo: 1 },
      { id: 'l2', itemCode: 'RM-002', itemName: 'Salt', qty: '10', uom: 'kg', unitPrice: '1.00', lineNo: 2 },
    ],
  };

  function renderDetail(over: Partial<PoDetail> = {}) {
    const transitionAction = vi.fn<[string, string], Promise<PoTransitionResult>>();
    const utils = render(
      <PoDetailView po={{ ...detail, ...over }} labels={detailLabels} locale="en" transitionPurchaseOrderStatusAction={transitionAction} />,
    );
    return { ...utils, transitionAction };
  }

  it('renders the header, lines table and the computed order total', () => {
    renderDetail();
    expect(screen.getByTestId('po-detail-header')).toHaveTextContent('PO-2026-0001');
    expect(screen.getByTestId('po-lines-table')).toHaveTextContent('Pork Belly');
    // 500*2.50 + 10*1.00 = 1260.00
    expect(screen.getByTestId('po-detail-total')).toHaveTextContent('1,260.00 EUR');
  });

  it('exposes the real draft transitions (send + cancel) and not received/confirm', () => {
    renderDetail({ status: 'draft' });
    expect(screen.getByTestId('po-transition-sent')).toBeInTheDocument();
    expect(screen.getByTestId('po-transition-cancelled')).toBeInTheDocument();
    expect(screen.queryByTestId('po-transition-confirmed')).toBeNull();
    expect(screen.queryByTestId('po-transition-received')).toBeNull();
  });

  it('exposes confirmed → partially_received / received / cancelled', () => {
    renderDetail({ status: 'confirmed' });
    expect(screen.getByTestId('po-transition-partially_received')).toBeInTheDocument();
    expect(screen.getByTestId('po-transition-received')).toBeInTheDocument();
    expect(screen.getByTestId('po-transition-cancelled')).toBeInTheDocument();
  });

  it('confirms then calls transitionPurchaseOrderStatus and refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionAction } = renderDetail({ status: 'draft' });
    transitionAction.mockResolvedValue({ ok: true, data: {} });

    fireEvent.click(screen.getByTestId('po-transition-sent'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(transitionAction).toHaveBeenCalledWith('po-1', 'sent'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces a forbidden transition inline (server-enforced RBAC)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionAction } = renderDetail({ status: 'draft' });
    transitionAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('po-transition-sent'));
    await waitFor(() => expect(screen.getByTestId('po-detail-error')).toHaveTextContent(errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders an honest empty lines panel when the PO has no lines', () => {
    renderDetail({ lines: [] });
    expect(screen.getByTestId('po-lines-empty')).toHaveTextContent('No lines on this purchase order.');
  });

  it('renders no transition buttons for terminal statuses (received / cancelled)', () => {
    renderDetail({ status: 'received' });
    expect(screen.queryByTestId('po-detail-transitions')).toBeNull();
  });
});
