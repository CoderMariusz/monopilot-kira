/** @vitest-environment jsdom */
/**
 * Wave-shipping — Sales Orders list + create + detail: RTL parity + state tests.
 *
 * Prototype: shipping/so-screens.jsx:1-366 (ShSOList + ShSODetail) and
 * shipping/modals.jsx:115-271 (so_create_wizard_modal mechanics).
 *
 * The async RSC pages read Supabase via withOrgContext and are exercised live
 * (manual + Playwright). Here we test the client views + modal against Server Action
 * SEAMS:
 *   - list: status-tab + customer filter + search, empty-with-CTA, "+ New sales
 *     order" opens the modal, ?new=1 auto-open, rows deep-link to detail, NO raw
 *     UUIDs leak;
 *   - create: the modal exposes every createSalesOrder field and builds the exact
 *     { customer_id, requested_date?, notes?, lines:[{item_id,qty,uom}] } payload,
 *     surfacing customer/line validation + forbidden (RBAC);
 *   - detail: header + allocation badges + lines table + the Allocate / Confirm /
 *     Cancel actions wired to the right seam, with permission/status gating
 *     (disabled + tooltip) and the forbidden surface;
 *   - the page-level forbidden branch renders a denied panel (no crash).
 *
 * Labels are passed directly (the page composes these from next-intl in prod). The
 * en values mirror the Shipping.salesOrders namespace added to apps/web/i18n.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SoListView, type SoListLabels, type SoRow } from '../_components/so-list-view';
import { SoDetailView, type SoDetailLabels, type SoDetail, type SoCaps } from '../_components/so-detail-view';
import type { CreateSoResult } from '../_components/create-so-modal';
import type { SoActionResult } from '../_components/so-detail-view';
import type { SoCustomerOption } from '../_actions/so-form-data';
import type { ItemPickerOption } from '../../../../../(npd)/fa/actions/search-items-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ── Shared labels (mirror apps/web/i18n/en.json Shipping.salesOrders) ──
const statusLabels: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  allocated: 'Allocated',
  partially_picked: 'Partially picked',
  picked: 'Picked',
  partially_packed: 'Partially packed',
  packed: 'Packed',
  manifested: 'Manifested',
  shipped: 'Shipped',
  partially_delivered: 'Partially delivered',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const allocationLabels: Record<string, string> = {
  unallocated: 'Unallocated',
  partially_allocated: 'Partially allocated',
  allocated: 'Allocated',
};

const createLabels: SoListLabels['create'] = {
  title: 'New sales order',
  customerLabel: 'Customer',
  customerPlaceholder: 'Select a customer',
  newCustomer: 'New customer',
  newCustomerNamePlaceholder: 'Customer name',
  createCustomerSubmit: 'Create',
  creatingCustomer: 'Creating…',
  cancelCustomerCreate: 'Cancel',
  requestedLabel: 'Requested ship date',
  notesLabel: 'Notes',
  notesPlaceholder: 'Optional notes',
  linesTitle: 'Lines',
  addLine: '+ Add line',
  removeLine: 'Remove line',
  lineItem: 'Item',
  lineQty: 'Qty',
  lineUom: 'UoM',
  lineUnitPrice: 'Unit price',
  lineDiscount: 'Discount %',
  lineTax: 'Tax %',
  lineCurrency: 'Currency',
  lineTotal: 'Line total',
  foreignPriceHint: 'Customer price {currency}{price}/{uom} — set GBP unit price',
  uomPlaceholder: 'Unit',
  uomOptions: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
  qtyPlaceholder: '0',
  submit: 'Create sales order',
  submitting: 'Creating…',
  cancel: 'Cancel',
  errors: {
    customerRequired: 'Select a customer.',
    linesRequired: 'Add at least one line with an item and a positive quantity.',
    invalid_input: 'invalid',
    forbidden: "You don't have permission to do that.",
    already_exists: 'already exists',
    persistence_failed: 'save failed',
  },
  picker: {
    trigger: '+ Add finished good',
    searchLabel: 'Search finished goods',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching finished goods',
    cancel: 'Cancel',
    error: 'Item search failed',
  },
};

const listLabels: SoListLabels = {
  createSo: 'New sales order',
  searchPlaceholder: 'Search SO number or customer…',
  rowsCount: '{n} rows',
  customerFilterLabel: 'Customer',
  allCustomers: 'All customers',
  clearFilters: 'Clear all filters',
  tabsAll: 'All',
  status: statusLabels,
  columns: {
    so: 'SO number',
    customer: 'Customer',
    status: 'Status',
    expected: 'Expected ship date',
    lines: 'Lines',
    total: 'Total',
    actions: 'Actions',
  },
  view: 'View',
  empty: { title: 'No sales orders yet', body: 'Create your first sales order.', clear: 'Clear filters' },
  create: createLabels,
  pagination: {
    showing: 'Showing {from}–{to} of {total}',
    previous: 'Previous',
    next: 'Next',
  },
};

const defaultListFilters = { status: '', search: '', customerCode: '' };
const defaultListPagination = {
  items: [] as SoRow[],
  total: 2,
  page: 1,
  limit: 50,
  offset: 0,
  hasMore: false,
};

const detailLabels: SoDetailLabels = {
  status: statusLabels,
  allocation: allocationLabels,
  summary: {
    title: 'Summary',
    customer: 'Customer',
    status: 'Status',
    allocation: 'Allocation',
    expected: 'Expected ship date',
    created: 'Created',
    lines: 'Lines',
    total: 'Total',
  },
  lines: {
    title: 'Order lines',
    seq: 'Line',
    item: 'Item',
    qty: 'Ordered',
    uom: 'UoM',
    unitPrice: 'Unit price',
    discount: 'Discount %',
    tax: 'Tax %',
    currency: 'Currency',
    lineTotal: 'Line total',
    allocated: 'Allocated',
    allocationStatus: 'Allocation',
    empty: 'This sales order has no lines.',
  },
  actions: {
    title: 'Actions',
    allocate: 'Allocate',
    deallocate: 'Deallocate',
    confirm: 'Confirm',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deletePrompt: 'Delete draft sales order {so}?',
    pending: 'Working…',
    confirmPrompt: 'Move sales order {so} to {status}?',
    noPermission: 'You do not have permission to perform this action.',
    notAvailable: 'This action is not available in the current status.',
  },
  edit: {
    title: 'Edit sales order',
    requestedLabel: 'Requested ship date',
    notesLabel: 'Notes',
    lineItem: 'Item',
    lineQty: 'Qty',
    lineUom: 'UoM',
    lineUnitPrice: 'Unit price',
    lineDiscount: 'Discount %',
    lineTax: 'Tax %',
    lineCurrency: 'Currency',
    lineTotal: 'Line total',
    lineNotes: 'Line notes',
    submit: 'Save changes',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errors: {
      linesInvalid: 'Enter a positive quantity on every line.',
      priceInvalid: 'Unit price must be greater than zero on every line.',
      termsInvalid: 'Invalid terms.',
      invalid_input: 'invalid',
      forbidden: "You don't have permission to do that.",
      not_draft: 'Only draft sales orders can be edited or deleted.',
      persistence_failed: 'save failed',
    },
  },
  notesTitle: 'Notes',
  errors: {
    invalid_input: 'invalid',
    forbidden: "You don't have permission to do that.",
    ILLEGAL_TRANSITION: 'illegal transition',
    INSUFFICIENT_STOCK: 'not enough stock',
    persistence_failed: 'save failed',
  },
};

// UUID-shaped ids to assert no leak into the rendered output.
const SO_ID = '33333333-3333-4333-8333-333333333333';
const SO_ID_2 = '99999999-9999-4999-8999-999999999999';
const LINE_ID = '55555555-5555-4555-8555-555555555555';

const customers: SoCustomerOption[] = [
  { id: 'cust-uuid-1111-2222-3333-444455556666', code: 'CUST-01', name: 'Acme Foods' },
  { id: 'cust-uuid-2222-3333-4444-555566667777', code: 'CUST-02', name: 'Bistro Co' },
];

const rows: SoRow[] = [
  {
    id: SO_ID,
    soNumber: 'SO-202606-00001',
    customerName: 'Acme Foods',
    customerCode: 'CUST-01',
    status: 'draft',
    lineCount: 2,
    total: '120.00',
    expectedShipDate: '2026-07-01',
    createdAt: '2026-06-20T10:00:00Z',
  },
  {
    id: SO_ID_2,
    soNumber: 'SO-202606-00002',
    customerName: 'Bistro Co',
    customerCode: 'CUST-02',
    status: 'confirmed',
    lineCount: 1,
    total: '50.00',
    expectedShipDate: null,
    createdAt: '2026-06-21T10:00:00Z',
  },
];

const searchSoItemsAction = vi.fn(async (): Promise<ItemPickerOption[]> => [
  { id: 'item-uuid-1111', itemCode: 'FG-100', name: 'Sausage roll', itemType: 'fg', status: 'active', costPerKgEur: null, uomBase: 'kg' },
]);

const resolveSoLinePricesAction = vi.fn(async () => [{ item_id: 'item-uuid-1111', unitPriceGbp: '3.5000' }]);

function renderList(overrides: Partial<React.ComponentProps<typeof SoListView>> = {}) {
  const createSalesOrderAction = vi.fn(async (): Promise<CreateSoResult> => ({ ok: true, data: {} }));
  render(
    <SoListView
      locale="en"
      salesOrders={rows}
      pagination={{ ...defaultListPagination, items: overrides.salesOrders ?? rows }}
      filters={defaultListFilters}
      customers={customers}
      labels={listLabels}
      searchSoItemsAction={searchSoItemsAction}
      resolveSoLinePricesAction={resolveSoLinePricesAction}
      createSalesOrderAction={createSalesOrderAction}
      {...overrides}
    />,
  );
  return { createSalesOrderAction };
}

describe('SoListView — list states + parity', () => {
  it('renders the SO table with so_number, customer, status badge, lines, total, expected ship date (no raw UUID)', () => {
    renderList();
    const table = screen.getByTestId('so-list-table');
    expect(within(table).getByText('SO-202606-00001')).toBeInTheDocument();
    expect(within(table).getByText('Acme Foods')).toBeInTheDocument();
    expect(within(table).getByText('CUST-01')).toBeInTheDocument();
    // status badge
    expect(screen.getByTestId('so-status-draft')).toBeInTheDocument();
    expect(screen.getByTestId('so-status-confirmed')).toBeInTheDocument();
    // GBP total formatted, line count
    expect(within(table).getByText('£120.00')).toBeInTheDocument();
    // No raw SO UUID anywhere on screen.
    expect(document.body.textContent).not.toContain(SO_ID);
    expect(document.body.textContent).not.toContain(SO_ID_2);
  });

  // ── Bug-3 honesty: the SO money model is GBP-denominated at the schema level
  // (sales_orders.total_amount_gbp / sales_order_lines.*_gbp). A genuine 0 total — when
  // the SO lines carry no unit price — formats as £0.00, which is the honest number, not
  // a placeholder or a faked value. The £ symbol is correct for the stored GBP amount.
  it('formats a genuine zero total as £0.00 (honest GBP, not a placeholder)', () => {
    renderList({
      salesOrders: [{ ...rows[0], total: '0' }],
    });
    const table = screen.getByTestId('so-list-table');
    expect(within(table).getByText('£0.00')).toBeInTheDocument();
  });

  it('deep-links each row to /<locale>/shipping/<soId>', () => {
    renderList();
    const link = screen.getByTestId(`so-link-${SO_ID}`);
    expect(link).toHaveAttribute('href', `/en/shipping/${SO_ID}`);
    expect(screen.getByTestId(`so-view-${SO_ID}`)).toHaveAttribute('href', `/en/shipping/${SO_ID}`);
  });

  it('reflects server-side status tab filter in the active tab and row set', () => {
    renderList({
      filters: { status: 'confirmed', search: '', customerCode: '' },
      salesOrders: [rows[1]!],
      pagination: { ...defaultListPagination, total: 1, items: [rows[1]!] },
    });
    expect(screen.getByTestId('so-list-tab-confirmed')).toHaveAttribute('aria-selected', 'true');
    const table = screen.getByTestId('so-list-table');
    expect(within(table).queryByText('SO-202606-00001')).not.toBeInTheDocument();
    expect(within(table).getByText('SO-202606-00002')).toBeInTheDocument();
  });

  it('renders the empty-with-CTA state when no rows match', () => {
    renderList({ salesOrders: [] });
    expect(screen.getByText('No sales orders yet')).toBeInTheDocument();
    expect(screen.queryByTestId('so-list-table')).not.toBeInTheDocument();
  });

  it('auto-opens the create modal on ?new=1 (autoOpenCreate)', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-so-form')).toBeInTheDocument();
  });
});

describe('CreateSoModal — exposes all createSalesOrder fields + validation + RBAC', () => {
  it('opening the modal exposes price, discount, tax, currency, and total per line', () => {
    renderList();
    fireEvent.click(screen.getByTestId('so-list-create'));
    const form = screen.getByTestId('create-so-form');
    // customer select + per-line UoM select are shadcn comboboxes (NO raw <select>).
    expect(within(form).getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('create-so-requested')).toBeInTheDocument();
    expect(screen.getByTestId('create-so-notes')).toBeInTheDocument();
    // line editor
    expect(screen.getByTestId('create-so-lines')).toBeInTheDocument();
    expect(screen.getByTestId('create-so-line-qty')).toBeInTheDocument();
    expect(screen.getByTestId('create-so-line-uom')).toBeInTheDocument();
    expect(screen.getByTestId('create-so-line-price')).toBeInTheDocument();
    expect(screen.getByTestId('create-so-line-discount')).toHaveValue('0');
    expect(screen.getByTestId('create-so-line-tax')).toHaveValue('0');
    expect(screen.getByTestId('create-so-line-currency')).toHaveValue('GBP');
    expect(screen.getByTestId('create-so-line-total')).toBeInTheDocument();
  });

  it('blocks submit without a customer', async () => {
    const { createSalesOrderAction } = renderList({ autoOpenCreate: true });
    fireEvent.click(screen.getByTestId('create-so-submit'));
    expect(await screen.findByTestId('create-so-error')).toHaveTextContent('Select a customer.');
    expect(createSalesOrderAction).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden (RBAC) result from createSalesOrder inline', async () => {
    const createSalesOrderAction = vi.fn(async (): Promise<CreateSoResult> => ({ ok: false, error: 'forbidden' }));
    render(
      <SoListView
        locale="en"
        salesOrders={rows}
        pagination={{ ...defaultListPagination, items: rows }}
        filters={defaultListFilters}
        customers={customers}
        labels={listLabels}
        autoOpenCreate
        searchSoItemsAction={searchSoItemsAction}
        resolveSoLinePricesAction={vi.fn(async () => [
          {
            item_id: 'item-uuid-1111',
            unitPriceGbp: '3.5000',
            foreignCustomerPrice: { unit_price: '2.404800', currency: 'EUR' },
          },
        ])}
        createSalesOrderAction={createSalesOrderAction}
      />,
    );
    // Pick a customer (scope to the modal form; the customer select is the first
    // combobox in DOM order, before the per-line UoM select).
    const form = screen.getByTestId('create-so-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(screen.getByRole('option', { name: /CUST-01/ }));
    // Add a line item via the picker.
    fireEvent.click(screen.getByRole('button', { name: '+ Add finished good' }));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), { target: { value: 'FG' } });
    fireEvent.click(await screen.findByText(/Sausage roll/));
    fireEvent.change(screen.getByTestId('create-so-line-qty'), { target: { value: '5' } });
    await waitFor(() => {
      expect(screen.getByTestId('create-so-line-price')).toHaveValue('2.4048');
      expect(screen.getByTestId('create-so-line-currency')).toHaveValue('EUR');
    });
    fireEvent.click(screen.getByTestId('create-so-submit'));
    expect(await screen.findByTestId('create-so-error')).toHaveTextContent("You don't have permission to do that.");
    expect(createSalesOrderAction).toHaveBeenCalledTimes(1);
    const payload = createSalesOrderAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      customer_id: customers[0].id,
      lines: [
        {
          item_id: 'item-uuid-1111',
          qty: '5',
          uom: 'kg',
          unit_price_gbp: '2.4048',
          discount_pct: '0',
          tax_pct: '0',
          currency: 'EUR',
        },
      ],
    });
  });

  it('previews discount and tax in the selected line currency', async () => {
    renderList({ autoOpenCreate: true });
    const form = screen.getByTestId('create-so-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(screen.getByRole('option', { name: /CUST-01/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add finished good' }));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), { target: { value: 'FG' } });
    fireEvent.click(await screen.findByText(/Sausage roll/));
    fireEvent.change(screen.getByTestId('create-so-line-qty'), { target: { value: '3.25' } });
    fireEvent.change(screen.getByTestId('create-so-line-price'), { target: { value: '3.50' } });
    fireEvent.change(screen.getByTestId('create-so-line-discount'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('create-so-line-tax'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('create-so-line-currency'), { target: { value: 'EUR' } });

    expect(screen.getByTestId('create-so-line-total')).toHaveTextContent('€10.75');
  });
});

// ── Detail view ──
function makeSo(overrides: Partial<SoDetail> = {}): SoDetail {
  return {
    id: SO_ID,
    soNumber: 'SO-202606-00001',
    status: 'confirmed',
    customerName: 'Acme Foods',
    customerCode: 'CUST-01',
    expectedShipDate: '2026-07-01',
    notes: 'Deliver before noon',
    createdAt: '2026-06-20T10:00:00Z',
    allocationStatus: 'unallocated',
    lines: [
      {
        id: LINE_ID,
        lineNo: 1,
        itemCode: 'FG-100',
        itemName: 'Sausage roll',
        qty: '10',
        uom: 'kg',
        allocatedQty: '0',
        allocationStatus: 'unallocated',
        unitPriceGbp: '3.50',
        lineTotalGbp: '33.0750',
        discountPct: '10',
        taxPct: '5',
        currency: 'EUR',
        notes: null,
      },
    ],
    ...overrides,
  };
}

const allCaps: SoCaps = { canAllocate: true, canConfirm: true, canCancel: true, canEdit: true };

function renderDetail(
  so: SoDetail,
  caps: SoCaps = allCaps,
  seams: Partial<{
    allocate: (id: string) => Promise<SoActionResult>;
    deallocate: (id: string) => Promise<SoActionResult>;
    transition: (id: string, status: string) => Promise<SoActionResult>;
    update: (soId: string, input: Record<string, unknown>) => Promise<SoActionResult>;
    remove: (id: string) => Promise<SoActionResult>;
  }> = {},
) {
  const allocate = vi.fn(seams.allocate ?? (async (): Promise<SoActionResult> => ({ ok: true, data: {} })));
  const deallocate = vi.fn(seams.deallocate ?? (async (): Promise<SoActionResult> => ({ ok: true, data: {} })));
  const transition = vi.fn(seams.transition ?? (async (): Promise<SoActionResult> => ({ ok: true, data: {} })));
  const update = vi.fn(seams.update ?? (async (): Promise<SoActionResult> => ({ ok: true, data: {} })));
  const remove = vi.fn(seams.remove ?? (async (): Promise<SoActionResult> => ({ ok: true, data: {} })));
  render(
    <SoDetailView
      so={so}
      labels={detailLabels}
      locale="en"
      caps={caps}
      allocateSalesOrderAction={allocate}
      deallocateSalesOrderAction={deallocate}
      transitionSalesOrderStatusAction={transition}
      updateSalesOrderAction={update}
      deleteSalesOrderAction={remove}
    />,
  );
  return { allocate, deallocate, transition, update, remove };
}

describe('SoDetailView — header, lines, allocation badges + gated actions', () => {
  it('renders header (so_number, customer, status + allocation badge) and lines with per-line allocation badge (no raw UUID)', () => {
    renderDetail(makeSo());
    const header = screen.getByTestId('so-detail-header');
    expect(within(header).getByText('SO-202606-00001')).toBeInTheDocument();
    expect(within(header).getByText('Acme Foods')).toBeInTheDocument();
    expect(within(header).getByTestId('so-status-confirmed')).toBeInTheDocument();
    // header allocation badge + per-line allocation badge
    expect(within(header).getByTestId('so-alloc-unallocated')).toBeInTheDocument();
    expect(screen.getByTestId(`so-line-alloc-${LINE_ID}`)).toBeInTheDocument();
    // line content
    const lines = screen.getByTestId('so-lines-table');
    expect(within(lines).getByText('FG-100')).toBeInTheDocument();
    expect(within(lines).getByText('Sausage roll')).toBeInTheDocument();
    expect(screen.getByTestId(`so-line-unit-price-${LINE_ID}`)).toHaveTextContent('€3.50');
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByTestId(`so-line-total-${LINE_ID}`)).toHaveTextContent('€33.08');
    // no raw UUID leak
    expect(document.body.textContent).not.toContain(SO_ID);
    expect(document.body.textContent).not.toContain(LINE_ID);
  });

  it('[Allocate] calls allocateSalesOrder for a confirmed SO and refreshes', async () => {
    const { allocate, transition } = renderDetail(makeSo({ status: 'confirmed' }));
    const btn = screen.getByTestId('so-action-allocate');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(allocate).toHaveBeenCalledWith(SO_ID));
    expect(transition).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('[Confirm] calls transitionSalesOrderStatus(id, "confirmed") for a draft SO', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transition } = renderDetail(makeSo({ status: 'draft', allocationStatus: 'unallocated' }));
    fireEvent.click(screen.getByTestId('so-action-confirm'));
    await waitFor(() => expect(transition).toHaveBeenCalledWith(SO_ID, 'confirmed'));
    confirmSpy.mockRestore();
  });

  it('[Cancel] calls transitionSalesOrderStatus(id, "cancelled")', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transition } = renderDetail(makeSo({ status: 'confirmed' }));
    fireEvent.click(screen.getByTestId('so-action-cancel'));
    await waitFor(() => expect(transition).toHaveBeenCalledWith(SO_ID, 'cancelled'));
    confirmSpy.mockRestore();
  });

  it('disables Allocate with a tooltip when status disallows it (draft SO)', () => {
    renderDetail(makeSo({ status: 'draft', allocationStatus: 'unallocated' }));
    const btn = screen.getByTestId('so-action-allocate');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'This action is not available in the current status.');
  });

  it('disables an action with a permission tooltip when the user lacks the capability', () => {
    renderDetail(makeSo({ status: 'confirmed' }), { canAllocate: false, canConfirm: false, canCancel: false });
    const btn = screen.getByTestId('so-action-allocate');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'You do not have permission to perform this action.');
    // every disabled action keeps a tooltip
    expect(screen.getByTestId('so-action-cancel')).toHaveAttribute('title');
    expect(screen.getByTestId('so-action-confirm')).toHaveAttribute('title');
    expect(screen.getByTestId('so-action-deallocate')).toHaveAttribute('title');
  });

  it('surfaces a forbidden result inline without crashing', async () => {
    const { allocate } = renderDetail(makeSo({ status: 'confirmed' }), allCaps, {
      allocate: async () => ({ ok: false, error: 'forbidden' }),
    });
    fireEvent.click(screen.getByTestId('so-action-allocate'));
    expect(await screen.findByTestId('so-detail-error')).toHaveTextContent("You don't have permission to do that.");
    expect(allocate).toHaveBeenCalledWith(SO_ID);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('enables Deallocate when the order is allocated, and calls deallocateSalesOrder', async () => {
    const { deallocate } = renderDetail(makeSo({ status: 'allocated', allocationStatus: 'allocated' }));
    const btn = screen.getByTestId('so-action-deallocate');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(deallocate).toHaveBeenCalledWith(SO_ID));
  });
});
