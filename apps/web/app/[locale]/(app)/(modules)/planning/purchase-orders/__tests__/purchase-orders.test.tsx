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
import { normalizePage, toPaginatedResult } from '../../../../../../../lib/shared/pagination';
import { PoDetailView, type PoDetailLabels, type PoDetail } from '../_components/po-detail-view';
import type { PoSupplierOption } from '../_actions/po-form-data-types';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));
vi.mock('../_actions/actions', () => ({
  listPoWarehouses: vi.fn(async () => [{ id: 'wh-1', code: 'WH-A', name: 'Main warehouse' }]),
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
  po_has_receipts: 'This purchase order already has receipts and cannot be reopened to draft.',
  line_uom_not_convertible:
    'A priced line cannot be converted to kg for valuation. For pieces or boxes, set a mass Base UoM (kg/g), choose Each/Box as Output UoM, and enter Net content per each.',
  unsupported_currency:
    'This purchase order cannot be sent because inventory valuation supports GBP only and no FX-rate mechanism exists.',
  persistence_failed: 'save failed',
};

const listLabels: PoListLabels = {
  createPo: 'Create PO',
  exportLabel: 'Export',
  exporting: 'Exporting…',
  exportError: 'Export failed. Please retry.',
  importLabel: 'Import',
  bulkImportLabel: 'Import POs',
  searchPlaceholder: 'Search PO number or supplier…',
  rowsCount: '{n} rows',
  supplierFilterLabel: 'Supplier',
  allSuppliers: 'All suppliers',
  clearFilters: 'Clear all filters',
  tabsAll: 'All',
  tabArchive: 'Archive',
  archivedHint: 'Showing archived purchase orders.',
  backToActive: 'Back to active',
  pagination: {
    showing: 'Showing {shown} of {total}',
    previous: 'Previous',
    next: 'Next',
  },
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
    poNumberPlaceholder: 'Auto (e.g. PO-202606-0007)',
    poNumberHelp: 'Leave empty to auto-number (format in Settings → Documents).',
    supplierLabel: 'Supplier',
    supplierPlaceholder: 'Select a supplier',
    destinationWarehouseLabel: 'Destination warehouse',
    destinationWarehousePlaceholder: 'No destination warehouse',
    destinationWarehouseLoading: 'Loading warehouses...',
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
    lineTaxPct: 'Tax %',
    taxPctPlaceholder: '0',
    priceSource: { spec: 'From supplier spec', list_price: 'From list price' },
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
      priceInvalid: 'Enter a unit price with at most 4 decimal places, using a dot separator (e.g. 0.0199).',
      priceRequired: 'Line {line}: enter a unit price (type 0 for a free line).',
      linePriceInvalid:
        'Line {line}: enter a unit price with at most 4 decimal places, using a dot separator (e.g. 0.0199).',
      lineItemRequired: 'Line {line}: select an item.',
      lineQtyInvalid: 'Line {line}: enter a positive quantity (up to 6 decimals).',
      lineUomRequired: 'Line {line}: select a unit of measure.',
      lineTaxInvalid: 'Line {line}: tax must be between 0 and 100 (up to 4 decimals).',
      no_active_site:
        'Select a site before creating a purchase order. This organisation has no active site yet — add one in Settings → Sites.',
      ambiguous_site: 'Select a site in the top bar before creating a purchase order.',
      warehouse_site_mismatch: "Destination warehouse must belong to the purchase order's site.",
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
    siteRequired: {
      bannerTitle: 'Select a site to create this purchase order',
      bannerBody:
        'Purchase orders are stamped with a site. Pick one below — it updates the top-bar site filter for this browser.',
      pickerLabel: 'Site',
      allSites: 'All sites',
      pickerTooltip: 'Sets the top-bar site used for site-scoped screens.',
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
    destinationWarehouse: 'Destination warehouse',
    total: 'Total',
    netTotal: 'Net',
    taxTotal: 'Tax',
    created: 'Created',
  },
  relatedGrns: {
    title: 'Related GRNs',
    empty: 'No GRNs yet.',
  },
  lines: {
    title: 'PO lines',
    seq: '#',
    item: 'Item',
    qty: 'Qty',
    uom: 'UoM',
    unitPrice: 'Unit price',
    taxPct: 'Tax',
    lineTotal: 'Line total',
    received: 'Received',
    receivedFull: 'Received',
    receivedPartial: 'Partial',
    empty: 'No lines on this purchase order.',
  },
  receivedSummary: {
    title: 'Receipt progress',
    lines: '{received} / {total} lines',
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
    cancelConfirmTitle: 'Cancel {po}?',
    cancelConfirmBody: 'Cancel this purchase order?',
    cancelSuccess: 'Purchase order cancelled.',
    cancelPoHasReceipts: 'This purchase order has receipts.',
  },
  reopen: {
    button: 'Reopen to draft',
    pending: 'Reopening…',
    confirmPrompt: 'Reopen {po} to draft?',
    confirmTitle: 'Reopen {po} to draft?',
    confirmBody: 'This returns the cancelled purchase order to draft for corrections.',
    success: 'Purchase order reopened to draft.',
    error: 'Could not reopen this purchase order.',
  },
  notesTitle: 'Notes',
  errors,
  // Wave R1 DRAFT-only edit affordances. This suite never wires the edit seams
  // (updatePurchaseOrder* are optional props), but `edit` is REQUIRED on
  // PoDetailLabels, so the fixture carries the real en copy — values mirror
  // apps/web/i18n/en.json → Planning.purchaseOrders.edit 1:1.
  edit: {
    editOrder: 'Edit order',
    addLine: '+ Add line',
    editLine: 'Edit',
    deleteLine: 'Delete',
    deleteLinePrompt: "Delete line {line}? This can't be undone.",
    lastLineRefused: 'A purchase order must keep at least one line.',
    modal: {
      title: 'Edit purchase order',
      supplierLabel: 'Supplier',
      supplierPlaceholder: 'Select a supplier',
      expectedLabel: 'Expected delivery',
      currencyLabel: 'Currency',
      notesLabel: 'Notes',
      notesPlaceholder: 'Optional notes',
      submit: 'Save changes',
      submitting: 'Saving…',
      cancel: 'Cancel',
      errors: {
        supplierRequired: 'Select a supplier.',
        ...errors,
        invalid_state: "This purchase order is no longer a draft, so it can't be edited.",
      },
    },
    lineModal: {
      addTitle: 'Add PO line',
      editTitle: 'Edit PO line',
      lineItem: 'Item',
      lineQty: 'Qty',
      lineUom: 'UoM',
      lineUnitPrice: 'Unit price',
      lineTaxPct: 'Tax %',
      taxPctPlaceholder: '0',
      uomPlaceholder: 'Unit',
      uomOptions: listLabels.create.uomOptions,
      qtyPlaceholder: '0',
      unitPricePlaceholder: '0.00',
      submitAdd: 'Add line',
      submitEdit: 'Save line',
      submitting: 'Saving…',
      cancel: 'Cancel',
      errors: {
        itemRequired: 'Select an item.',
        qtyRequired: 'Enter a quantity greater than zero and pick a unit.',
        priceInvalid: listLabels.create.errors.priceInvalid,
        priceRequired: 'Enter a unit price (type 0 for a free line).',
        ...errors,
        invalid_state: "This purchase order is no longer a draft, so it can't be edited.",
      },
      picker: listLabels.create.picker,
    },
  },
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

const SITES = [
  { id: 'site-warsaw', siteCode: 'PL-WAW', name: 'Plant Warsaw', isDefault: true },
  { id: 'site-krakow', siteCode: 'PL-KRK', name: 'Plant Krakow', isDefault: false },
];

const defaultPoPagination = toPaginatedResult(ROWS, ROWS.length, normalizePage({ page: 1, defaultLimit: 50 }));
const defaultFilters = { status: '', search: '', supplierId: '' };
const defaultStatusCounts = {
  all: 3,
  draft: 1,
  sent: 1,
  confirmed: 1,
  partially_received: 0,
  received: 0,
  cancelled: 0,
};

// Mock signatures are DERIVED from the real component props (vitest 4 takes the
// whole function type, not the old [args], return pair). Deriving keeps the
// fixtures from drifting away from the props the way the labels above did.
type ListProps = React.ComponentProps<typeof PoListView>;
type DetailProps = React.ComponentProps<typeof PoDetailView>;

function renderList(props: Partial<ListProps> = {}) {
  const searchPoItemsAction = vi.fn<ListProps['searchPoItemsAction']>().mockResolvedValue([
    { id: 'item-1', itemCode: 'RM-001', name: 'Pork Belly', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]);
  const getItemSupplierPriceAction = vi
    .fn<NonNullable<ListProps['getItemSupplierPriceAction']>>()
    .mockResolvedValue({ ok: true, data: { unitPrice: '3.75', currency: 'GBP', source: 'spec' } });
  const createPurchaseOrderAction = vi.fn<ListProps['createPurchaseOrderAction']>();
  const setSiteAction = vi.fn<ListProps['setSiteAction']>().mockResolvedValue({ ok: true });
  const createExportJobAction = vi
    .fn<ListProps['createExportJobAction']>()
    .mockResolvedValue({ ok: true, data: { jobId: 'job-1', filename: 'purchase-orders-2026-06-18.csv', csv: 'po_number\r\nPO-DRAFT', rows: 1 } });
  const utils = render(
    <PoListView
      locale="en"
      purchaseOrders={ROWS}
      pagination={defaultPoPagination}
      filters={defaultFilters}
      statusCounts={defaultStatusCounts}
      suppliers={suppliers}
      labels={listLabels}
      archivedCount={2}
      searchPoItemsAction={searchPoItemsAction}
      getItemSupplierPriceAction={getItemSupplierPriceAction}
      createPurchaseOrderAction={createPurchaseOrderAction}
      createExportJobAction={createExportJobAction}
      activeSiteId="site-warsaw"
      sites={SITES}
      setSiteAction={setSiteAction}
      {...props}
    />,
  );
  return { ...utils, searchPoItemsAction, getItemSupplierPriceAction, createPurchaseOrderAction, createExportJobAction, setSiteAction };
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
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

  it('navigates to the sent status tab via URL', () => {
    renderList();
    fireEvent.click(screen.getByTestId('po-list-tab-sent'));
    expect(push).toHaveBeenCalledWith('/en/planning/purchase-orders?status=sent');
  });

  it('debounces search navigation to the URL', () => {
    vi.useFakeTimers();
    renderList();
    fireEvent.change(screen.getByTestId('po-list-search'), { target: { value: 'Baltic' } });
    expect(push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(push).toHaveBeenCalledWith('/en/planning/purchase-orders?q=Baltic');
    vi.useRealTimers();
  });

  it('shows the empty-state when the server returns no rows', () => {
    renderList({
      purchaseOrders: [],
      pagination: toPaginatedResult([], 0, normalizePage({ page: 1, defaultLimit: 50 })),
    });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent('No purchase orders yet');
  });

  it('renders the empty-state when the org has zero purchase orders (RLS-denied = empty)', () => {
    renderList({ purchaseOrders: [] });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent('No purchase orders yet');
    expect(screen.queryByTestId('po-list-table')).toBeNull();
  });
});

describe('PoListView — archive tab (server re-fetch via ?archived=1)', () => {
  it('renders an Archive tab carrying the archivedCount chip and linking to ?archived=1', () => {
    renderList({ archivedCount: 7 });
    const archiveTab = screen.getByTestId('po-list-tab-archive');
    expect(archiveTab).toHaveTextContent('Archive');
    expect(archiveTab).toHaveTextContent('7');
    expect(archiveTab).toHaveAttribute('href', '/en/planning/purchase-orders?archived=1');
    expect(archiveTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the archived rows + archived-mode chrome when archived data is passed', () => {
    const archivedRows: PoRow[] = [
      makeRow({ id: 'po-arch-1', poNumber: 'PO-ARCH-1', status: 'received' }),
      makeRow({ id: 'po-arch-2', poNumber: 'PO-ARCH-2', status: 'cancelled' }),
    ];
    renderList({ purchaseOrders: archivedRows, archived: true, archivedCount: 2 });
    // archived rows render
    expect(screen.getByTestId('po-row-po-arch-1')).toBeInTheDocument();
    expect(screen.getByTestId('po-row-po-arch-2')).toBeInTheDocument();
    // archive tab is the active one + hint + back-to-active affordance
    expect(screen.getByTestId('po-list-tab-archive')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('po-list-archived-hint')).toBeInTheDocument();
    expect(screen.getByTestId('po-list-back-active')).toHaveAttribute('href', '/en/planning/purchase-orders');
    // status tabs become links back to the active list (not client-filter buttons)
    expect(screen.getByTestId('po-list-tab-all')).toHaveAttribute('href', '/en/planning/purchase-orders');
  });
});

describe('PoListView — Export to file (Wave E-IO)', () => {
  it('renders an Export button beside the create action', () => {
    renderList();
    const exportBtn = screen.getByTestId('po-list-export');
    expect(exportBtn).toHaveTextContent('Export');
    expect(screen.getByTestId('po-list-create')).toBeInTheDocument();
  });

  it('calls createExportJob with the CURRENT filters and triggers a CSV download', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:po-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { createExportJobAction } = renderList({
      filters: { status: 'sent', search: 'PO-SENT', supplierId: '' },
    });

    fireEvent.click(screen.getByTestId('po-list-export'));

    await waitFor(() => expect(createExportJobAction).toHaveBeenCalledTimes(1));
    expect(createExportJobAction).toHaveBeenCalledWith({
      status: 'sent',
      q: 'PO-SENT',
      supplierId: undefined,
      archived: false,
    });
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('surfaces an inline error when the export action fails', async () => {
    const createExportJobAction = vi
      .fn<ListProps['createExportJobAction']>()
      .mockResolvedValue({ ok: false, error: 'persistence_failed' });
    renderList({ createExportJobAction });
    fireEvent.click(screen.getByTestId('po-list-export'));
    await waitFor(() => expect(screen.getByTestId('po-list-export-error')).toBeInTheDocument());
    expect(screen.getByTestId('po-list-export-error')).toHaveTextContent('Export failed. Please retry.');
  });
});

describe('PoListView — create modal (parity: po-screens.jsx:45 + modals create-PO)', () => {
  it('shows a site-required guidance banner with inline picker when top bar is on All sites', () => {
    renderList({ activeSiteId: null });
    fireEvent.click(screen.getByTestId('po-list-create'));
    const banner = screen.getByTestId('create-po-site-required');
    expect(banner).toHaveTextContent('Select a site to create this purchase order');
    expect(banner).toHaveTextContent('Purchase orders are stamped with a site');
    expect(within(banner).getByTestId('app-topbar-site-switcher-select')).toBeInTheDocument();
    expect(screen.getByTestId('create-po-submit')).toBeDisabled();
  });

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

    await waitFor(() => expect(screen.getByText('Destination warehouse')).toBeInTheDocument());
    fireEvent.click(within(form1).getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByRole('option', { name: 'WH-A — Main warehouse' }));

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
          destinationWarehouseId: 'wh-1',
          currency: 'EUR',
          lines: [expect.objectContaining({ itemId: 'item-1', qty: '500', uom: 'kg', unitPrice: '2.50', lineNo: 1 })],
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('renders the optional destination warehouse dropdown in the create form', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('po-list-create'));

    expect(await screen.findByText('Destination warehouse')).toBeInTheDocument();
    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[1]);
    expect(await screen.findByRole('option', { name: 'WH-A — Main warehouse' })).toBeInTheDocument();
  });

  it('submits WITHOUT a PO number (auto-numbered) — poNumber omitted from the payload', async () => {
    const { createPurchaseOrderAction } = renderList();
    createPurchaseOrderAction.mockResolvedValue({ ok: true, data: {} });

    fireEvent.click(screen.getByTestId('po-list-create'));
    // The number field shows the auto-number placeholder + the helper copy.
    expect(screen.getByTestId('create-po-number')).toHaveAttribute('placeholder', 'Auto (e.g. PO-202606-0007)');
    expect(screen.getByTestId('create-po-number-help')).toHaveTextContent(
      'Leave empty to auto-number (format in Settings → Documents).',
    );

    // Leave the number BLANK — only supplier + a line are filled.
    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-po-line-item')).toHaveTextContent('RM-001'));
    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '5' } });

    fireEvent.click(screen.getByTestId('create-po-submit'));

    await waitFor(() => expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1));
    const payload = createPurchaseOrderAction.mock.calls[0][0] as { poNumber?: string };
    expect(payload.poNumber).toBeUndefined();
    expect(screen.queryByTestId('create-po-error')).toBeNull();
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
    // A blank unit price is NOT consent to zero (R07-01): the line stays invalid and
    // submit is blocked client-side, so price it explicitly to reach the RBAC surface.
    fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: '2.50' } });

    fireEvent.click(screen.getByTestId('create-po-submit'));
    await waitFor(() => expect(screen.getByTestId('create-po-error')).toHaveTextContent(errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });

  // Regression: the labels type promises `string`, an i18n bundle can still be missing
  // the key. A missing line-error label must degrade to readable text, never throw and
  // take the whole modal down mid-edit (create-po-modal.tsx lineFieldErrorMessage).
  it('degrades to readable text when a line-error translation key is missing', () => {
    const { lineQtyInvalid: _missing, ...withoutQtyLabel } = listLabels.create.errors;
    renderList({
      labels: {
        ...listLabels,
        create: { ...listLabels.create, errors: withoutQtyLabel as PoListLabels['create']['errors'] },
      },
    });
    fireEvent.click(screen.getByTestId('po-list-create'));
    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '0' } });

    expect(screen.getByTestId('create-po-line-qty-error')).toHaveTextContent('Line 1: qty (invalid)');
    expect(screen.getByTestId('create-po-form')).toBeInTheDocument();
  });
});

describe('CreatePoModal — supplier-filtered picker + price pre-fill (BUG2 + BUG1)', () => {
  // BUG2 — modals.jsx:196 product list is supplier-attributed → the picker search
  // must carry the chosen supplier so searchPoItems filters to that supplier's items.
  it('threads the selected supplierId into the line picker search (BUG2)', async () => {
    const { searchPoItemsAction } = renderList();
    fireEvent.click(screen.getByTestId('po-list-create'));

    // Choose a supplier (first combobox in the form).
    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

    // Open the picker → it searches. Every call must include supplierId: 'sup-1'.
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(searchPoItemsAction).toHaveBeenCalled());
    const lastCall = searchPoItemsAction.mock.calls.at(-1)?.[0];
    expect(lastCall?.supplierId).toBe('sup-1');
  });

  // BUG1 — modals.jsx:212 "Auto-filled from supplier_products · editable": on item
  // select the line unit price is pre-filled from getItemSupplierPrice, editable, and
  // a subtle source hint is shown.
  it('pre-fills the line unit price from getItemSupplierPrice + shows the source hint (BUG1)', async () => {
    const { getItemSupplierPriceAction } = renderList();
    fireEvent.click(screen.getByTestId('po-list-create'));

    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);

    await waitFor(() =>
      expect(getItemSupplierPriceAction).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1', supplierId: 'sup-1' }),
      ),
    );
    // The price input is pre-filled (still editable) and the source hint reads "spec".
    await waitFor(() => expect(screen.getByTestId('create-po-line-price')).toHaveValue('3.75'));
    expect(screen.getByTestId('create-po-line-price-source')).toHaveTextContent('From supplier spec');

    // Editable — a manual change clears the source hint.
    fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: '4.00' } });
    expect(screen.getByTestId('create-po-line-price')).toHaveValue('4.00');
    expect(screen.queryByTestId('create-po-line-price-source')).toBeNull();
  });

  // BUG2 — switching the supplier re-filters: the already-picked line item is cleared
  // (it may not belong to the new supplier) and a fresh search carries the new id.
  it('clears the picked line item + re-filters when the supplier changes (BUG2)', async () => {
    const { searchPoItemsAction } = renderList();
    fireEvent.click(screen.getByTestId('po-list-create'));

    const form = screen.getByTestId('create-po-form');
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-po-line-item')).toHaveTextContent('RM-001'));

    // Switch supplier → the picked item is dropped (picker trigger returns).
    fireEvent.click(within(form).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('BALT — Baltic Pork Co.'));
    await waitFor(() => expect(screen.queryByTestId('create-po-line-item')).toBeNull());
    expect(screen.getByTestId('item-picker-trigger')).toBeInTheDocument();

    // A new picker search now carries the new supplier id.
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => {
      const lastCall = searchPoItemsAction.mock.calls.at(-1)?.[0];
      expect(lastCall?.supplierId).toBe('sup-2');
    });
  });
});

describe('PoDetailView — header + lines + transitions (parity: po-screens.jsx:166-249,290-312)', () => {
  const detail: PoDetail = {
    id: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierId: 'sup-1',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh Ltd.',
    status: 'draft',
    expectedDelivery: '2026-07-01',
    currency: 'EUR',
    destinationWarehouseName: null,
    notes: 'Deliver to dock 3',
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      { id: 'l1', itemCode: 'RM-001', itemName: 'Pork Belly', qty: '500', uom: 'kg', unitPrice: '2.50', taxPct: '0', lineNo: 1, receivedQty: '500' },
      { id: 'l2', itemCode: 'RM-002', itemName: 'Salt', qty: '10', uom: 'kg', unitPrice: '1.00', taxPct: '0', lineNo: 2, receivedQty: '4' },
    ],
    relatedGrns: [],
  };

  function renderDetail(over: Partial<PoDetail> = {}) {
    const transitionAction = vi.fn<DetailProps['transitionPurchaseOrderStatusAction']>();
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

  it('exposes confirmed → cancelled only (receive status rolls up from line receipts)', () => {
    renderDetail({ status: 'confirmed' });
    expect(screen.getByTestId('po-transition-cancelled')).toBeInTheDocument();
    expect(screen.queryByTestId('po-transition-partially_received')).toBeNull();
    expect(screen.queryByTestId('po-transition-received')).toBeNull();
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

  it('surfaces the GBP-only valuation gate when sending a foreign-currency draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionAction } = renderDetail({ status: 'draft', currency: 'EUR' });
    transitionAction.mockResolvedValue({ ok: false, error: 'unsupported_currency' });

    fireEvent.click(screen.getByTestId('po-transition-sent'));

    await waitFor(() =>
      expect(screen.getByTestId('po-detail-error')).toHaveTextContent('inventory valuation supports GBP only'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces the mass-base and net-content fix when a priced pcs line cannot be valued', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionAction } = renderDetail({ status: 'draft', currency: 'GBP' });
    transitionAction.mockResolvedValue({ ok: false, error: 'line_uom_not_convertible' });

    fireEvent.click(screen.getByTestId('po-transition-sent'));

    await waitFor(() =>
      expect(screen.getByTestId('po-detail-error')).toHaveTextContent('mass Base UoM (kg/g)'),
    );
    expect(screen.getByTestId('po-detail-error')).toHaveTextContent('Net content per each');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders an honest empty lines panel when the PO has no lines', () => {
    renderDetail({ lines: [] });
    expect(screen.getByTestId('po-lines-empty')).toHaveTextContent('No lines on this purchase order.');
  });

  it('shows per-line received qty + chip (full/partial) from the grn_items aggregate', () => {
    renderDetail();
    // l1: 500/500 received → qty + "Received" chip.
    expect(screen.getByTestId('po-line-received-l1')).toHaveTextContent('500 kg');
    expect(screen.getByTestId('po-line-received-l1')).toHaveTextContent('Received');
    // l2: 4/10 received → qty + "Partial" chip.
    expect(screen.getByTestId('po-line-received-l2')).toHaveTextContent('4 kg');
    expect(screen.getByTestId('po-line-received-l2')).toHaveTextContent('Partial');
  });

  it('shows an em-dash and no chip for a line with nothing received', () => {
    renderDetail({
      lines: [
        { id: 'l3', itemCode: 'RM-003', itemName: 'Pepper', qty: '5', uom: 'kg', unitPrice: '3.00', taxPct: '0', lineNo: 1, receivedQty: '0' },
      ],
    });
    expect(screen.getByTestId('po-line-received-l3')).toHaveTextContent('—');
    expect(screen.getByTestId('po-line-received-l3')).not.toHaveTextContent('Partial');
    expect(screen.getByTestId('po-line-received-l3')).not.toHaveTextContent('Received');
  });

  it('summarises receipt progress line-based in the header panel (1/2 fully received)', () => {
    renderDetail();
    expect(screen.getByTestId('po-detail-received-summary')).toHaveTextContent('Receipt progress');
    expect(screen.getByTestId('po-detail-received-summary')).toHaveTextContent('1 / 2 lines');
  });

  it('renders no transition buttons for terminal statuses (received / cancelled)', () => {
    renderDetail({ status: 'received' });
    expect(screen.queryByTestId('po-detail-transitions')).toBeNull();
  });

  // ── Wave-R reversibility — cancelled→draft reopen (parity: po-screens.jsx:184-186
  //    header danger/secondary action group; RBAC npd.planning.write + the
  //    no-receipts guard are enforced server-side inside reopenPurchaseOrder). ──
  function renderDetailWithReopen(over: Partial<PoDetail> = {}) {
    const transitionAction = vi.fn<DetailProps['transitionPurchaseOrderStatusAction']>();
    const reopenAction = vi.fn<NonNullable<DetailProps['reopenPurchaseOrderAction']>>();
    const utils = render(
      <PoDetailView
        po={{ ...detail, ...over }}
        labels={detailLabels}
        locale="en"
        transitionPurchaseOrderStatusAction={transitionAction}
        reopenPurchaseOrderAction={reopenAction}
      />,
    );
    return { ...utils, transitionAction, reopenAction };
  }

  it('shows [Reopen to draft] for sent/cancelled POs and hides it for draft', () => {
    const { rerender } = renderDetailWithReopen({ status: 'cancelled' });
    expect(screen.getByTestId('po-reopen-draft')).toHaveTextContent('Reopen to draft');
    rerender(
      <PoDetailView
        po={{ ...detail, status: 'sent' }}
        labels={detailLabels}
        locale="en"
        transitionPurchaseOrderStatusAction={vi.fn()}
        reopenPurchaseOrderAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('po-reopen-draft')).toHaveTextContent('Reopen to draft');
    rerender(
      <PoDetailView
        po={{ ...detail, status: 'draft' }}
        labels={detailLabels}
        locale="en"
        transitionPurchaseOrderStatusAction={vi.fn()}
        reopenPurchaseOrderAction={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('po-reopen-draft')).toBeNull();
  });

  it('confirms then calls reopenPurchaseOrder(id) and refreshes on success', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { reopenAction } = renderDetailWithReopen({ status: 'cancelled' });
    reopenAction.mockResolvedValue({ ok: true, data: {} });
    fireEvent.click(screen.getByTestId('po-reopen-draft'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(reopenAction).toHaveBeenCalledWith('po-1'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces po_has_receipts honestly inline and does not refresh', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { reopenAction } = renderDetailWithReopen({ status: 'cancelled' });
    reopenAction.mockResolvedValue({ ok: false, error: 'po_has_receipts' });
    fireEvent.click(screen.getByTestId('po-reopen-draft'));
    await waitFor(() =>
      expect(screen.getByTestId('po-detail-error')).toHaveTextContent(errors.po_has_receipts),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
