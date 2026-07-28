/**
 * FALA 7 / T1 + FIX-T1 — PO unit-price precision (R07-01 + R07-07).
 *
 * R07-01: purchase_order_lines.unit_price is numeric(12,4). A price the column
 * cannot hold exactly (0.005432, 6.20000, "1,50", -3) used to be SILENTLY replaced
 * with '0' in the payload — the PO was created with £0.0000 and understated totals.
 * The line must now be refused AT THE FIELD before any write, in both surfaces:
 * CreatePoModal (create) and PoLineModal (add/edit line on a draft).
 *
 * FIX-T1 P-1: a BLANK price on a started line is also refused (not coerced to '0').
 * An explicitly typed `0` is a real zero and passes.
 *
 * FIX-T1 P-2: any started line with ANY invalid field blocks create; messages name
 * the line and field. Trailing blank rows do not block.
 *
 * R07-07: unit price on the detail table always shows 4 dp (numeric 12,4 scale).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatePoModal, type CreatePoLabels, type CreatePoResult } from '../_components/create-po-modal';
import { PoLineModal, type PoLineModalLabels, type PoLineMutationResult } from '../_components/po-line-modal';
import { PoDetailView, type PoDetail, type PoDetailLabels, type PoTransitionResult } from '../_components/po-detail-view';
import type { PoSupplierOption } from '../_actions/po-form-data-types';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));
vi.mock('../_actions/actions', () => ({
  listPoWarehouses: vi.fn(async () => [{ id: 'wh-1', code: 'WH-A', name: 'Main warehouse' }]),
}));

const PRICE_INVALID_LINE =
  'Line 1: enter a unit price with at most 4 decimal places, using a dot separator (e.g. 0.0199).';
const PRICE_REQUIRED_LINE = 'Line 1: enter a unit price (type 0 for a free line).';
const QTY_INVALID_LINE = 'Line 1: enter a positive quantity (up to 6 decimals).';
const PRICE_INVALID_SINGLE = 'Enter a unit price with at most 4 decimal places, using a dot separator (e.g. 0.0199).';
const PRICE_REQUIRED_SINGLE = 'Enter a unit price (type 0 for a free line).';

/** Values a numeric(12,4) column cannot hold as typed — every one of these used to
 *  land in the database as 0.0000. */
const UNSTORABLE_PRICES = ['0.005432', '6.20000', '1,50', '-3'];

const suppliers: PoSupplierOption[] = [{ id: 'sup-1', code: 'AGRO', name: 'Agro-Fresh Ltd.', currency: 'GBP' }];
const items: ItemPickerOption[] = [
  { id: 'item-1', itemCode: 'RM-BUTTER', name: 'Butter', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'g' },
];
const uomOptions = { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' };
const picker = {
  trigger: '+ Add item',
  searchLabel: 'Search items',
  searchPlaceholder: 'Search…',
  loading: 'Searching…',
  empty: 'No matches',
  cancel: 'Cancel',
  error: 'Search failed',
};

const createLabels: CreatePoLabels = {
  title: 'Create purchase order',
  poNumberLabel: 'PO number',
  poNumberPlaceholder: 'Auto',
  poNumberHelp: 'Leave empty to auto-number.',
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
  uomOptions,
  qtyPlaceholder: '0',
  unitPricePlaceholder: '0.00',
  submit: 'Create PO',
  submitting: 'Creating…',
  cancel: 'Cancel',
  errors: {
    poNumberRequired: 'Enter a PO number.',
    supplierRequired: 'Select a supplier.',
    linesRequired: 'Add at least one line with an item and a positive quantity.',
    priceInvalid: PRICE_INVALID_SINGLE,
    priceRequired: PRICE_REQUIRED_LINE,
    linePriceInvalid: PRICE_INVALID_LINE,
    lineItemRequired: 'Line {line}: select an item.',
    lineQtyInvalid: 'Line {line}: enter a positive quantity (up to 6 decimals).',
    lineUomRequired: 'Line {line}: select a unit of measure.',
    lineTaxInvalid: 'Line {line}: tax must be between 0 and 100 (up to 4 decimals).',
    invalid_input: 'invalid',
    forbidden: 'no permission',
    not_found: 'gone',
    already_exists: 'dup',
    invalid_state: 'invalid state',
    no_active_site: 'no site',
    ambiguous_site: 'pick a site',
    warehouse_site_mismatch: 'wrong site',
    persistence_failed: 'save failed',
  },
  picker,
  siteRequired: {
    bannerTitle: 'Select a site',
    bannerBody: 'Purchase orders are stamped with a site.',
    pickerLabel: 'Site',
    allSites: 'All sites',
    pickerTooltip: 'Sets the top-bar site.',
  },
};

const lineLabels: PoLineModalLabels = {
  addTitle: 'Add PO line',
  editTitle: 'Edit PO line',
  lineItem: 'Item',
  lineQty: 'Qty',
  lineUom: 'UoM',
  lineUnitPrice: 'Unit price',
  lineTaxPct: 'Tax %',
  taxPctPlaceholder: '0',
  uomPlaceholder: 'Unit',
  uomOptions,
  qtyPlaceholder: '0',
  unitPricePlaceholder: '0.00',
  submitAdd: 'Add line',
  submitEdit: 'Save line',
  submitting: 'Saving…',
  cancel: 'Cancel',
  errors: {
    itemRequired: 'Pick an item.',
    qtyRequired: 'Enter a quantity.',
    priceInvalid: PRICE_INVALID_SINGLE,
    priceRequired: PRICE_REQUIRED_SINGLE,
    invalid_input: 'invalid',
    forbidden: 'no permission',
    not_found: 'gone',
    invalid_state: 'no longer a draft',
    persistence_failed: 'save failed',
  },
  picker,
};

function renderCreate() {
  const createPurchaseOrderAction = vi.fn<[unknown], Promise<CreatePoResult>>().mockResolvedValue({ ok: true, data: {} });
  const searchPoItemsAction = vi.fn<[unknown], Promise<ItemPickerOption[]>>().mockResolvedValue(items);
  const utils = render(
    <CreatePoModal
      open
      onOpenChange={vi.fn()}
      labels={createLabels}
      suppliers={suppliers}
      searchPoItemsAction={searchPoItemsAction}
      createPurchaseOrderAction={createPurchaseOrderAction}
      onCreated={vi.fn()}
      activeSiteId="site-1"
      sites={[{ id: 'site-1', code: 'S1', name: 'Site One' }]}
      setSiteAction={vi.fn().mockResolvedValue({ ok: true })}
    />,
  );
  return { ...utils, createPurchaseOrderAction, searchPoItemsAction };
}

/** Fills a complete, otherwise-valid single line: supplier → item → qty → price. */
async function fillValidLine(unitPrice = '1.0000') {
  const form = screen.getByTestId('create-po-form');
  fireEvent.click(within(form).getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByText('AGRO — Agro-Fresh Ltd.'));

  fireEvent.click(screen.getByTestId('item-picker-trigger'));
  await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
  await waitFor(() => expect(screen.getByTestId('create-po-line-item')).toHaveTextContent('RM-BUTTER'));

  fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '789.123' } });
  fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: unitPrice } });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CreatePoModal — unit price precision (R07-01)', () => {
  it('refuses an unstorable price AT THE FIELD and blocks the create button', async () => {
    renderCreate();
    await fillValidLine('1.0000');

    const priceInput = screen.getByTestId('create-po-line-price');
    for (const value of UNSTORABLE_PRICES) {
      fireEvent.change(priceInput, { target: { value } });
      expect(screen.getByTestId('create-po-line-price-error')).toHaveTextContent(PRICE_INVALID_LINE);
      expect(priceInput).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('create-po-submit')).toBeDisabled();
    }
  });

  it('does NOT create the purchase order while a price is unstorable (no silent 0)', async () => {
    const { createPurchaseOrderAction } = renderCreate();
    await fillValidLine('1.0000');

    fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: '0.005432' } });
    fireEvent.click(screen.getByTestId('create-po-submit'));
    fireEvent.submit(screen.getByTestId('create-po-form'));

    await waitFor(() => expect(screen.getByTestId('create-po-line-price-error')).toBeInTheDocument());
    expect(createPurchaseOrderAction).not.toHaveBeenCalled();
  });

  it('clears the field error as soon as the price becomes storable', async () => {
    renderCreate();
    await fillValidLine('1.0000');

    const priceInput = screen.getByTestId('create-po-line-price');
    fireEvent.change(priceInput, { target: { value: '0.005432' } });
    expect(screen.getByTestId('create-po-line-price-error')).toBeInTheDocument();

    fireEvent.change(priceInput, { target: { value: '0.0054' } });
    expect(screen.queryByTestId('create-po-line-price-error')).toBeNull();
    expect(screen.getByTestId('create-po-submit')).toBeEnabled();
  });

  it('ANTI-REGRESSION: a 4-decimal price passes through verbatim (0.0199)', async () => {
    const { createPurchaseOrderAction } = renderCreate();
    await fillValidLine('0.0199');

    expect(screen.queryByTestId('create-po-line-price-error')).toBeNull();
    fireEvent.click(screen.getByTestId('create-po-submit'));

    await waitFor(() => expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1));
    expect(createPurchaseOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ itemId: 'item-1', qty: '789.123', uom: 'g', unitPrice: '0.0199', lineNo: 1 })],
      }),
    );
  });

  it('accepts an EXPLICITLY typed 0 as a real zero price', async () => {
    const { createPurchaseOrderAction } = renderCreate();
    await fillValidLine('0');

    expect(screen.queryByTestId('create-po-line-price-error')).toBeNull();
    fireEvent.click(screen.getByTestId('create-po-submit'));

    await waitFor(() => expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1));
    expect(createPurchaseOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ unitPrice: '0' })] }),
    );
  });

  it('refuses a BLANK price on a started line (no silent 0)', async () => {
    const { createPurchaseOrderAction } = renderCreate();
    await fillValidLine('1.0000');

    fireEvent.change(screen.getByTestId('create-po-line-price'), { target: { value: '' } });
    expect(screen.getByTestId('create-po-line-price-error')).toHaveTextContent(PRICE_REQUIRED_LINE);
    expect(screen.getByTestId('create-po-submit')).toBeDisabled();

    fireEvent.click(screen.getByTestId('create-po-submit'));
    fireEvent.submit(screen.getByTestId('create-po-form'));
    expect(createPurchaseOrderAction).not.toHaveBeenCalled();
  });
});

describe('CreatePoModal — started-line validation (FIX-T1 P-2)', () => {
  it('blocks create when qty is invalid and names the line and field', async () => {
    renderCreate();
    await fillValidLine('1.0000');

    fireEvent.change(screen.getByTestId('create-po-line-qty'), { target: { value: '-5' } });
    expect(screen.getByTestId('create-po-line-qty-error')).toHaveTextContent(QTY_INVALID_LINE);
    expect(screen.getByTestId('create-po-submit')).toBeDisabled();
  });

  it('ANTI-REGRESSION: a trailing blank row does not block a complete first row', async () => {
    const { createPurchaseOrderAction } = renderCreate();
    await fillValidLine('1.0000');

    fireEvent.click(screen.getByTestId('create-po-add-line'));
    expect(screen.getByTestId('create-po-submit')).toBeEnabled();

    fireEvent.click(screen.getByTestId('create-po-submit'));
    await waitFor(() => expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1));
    expect(createPurchaseOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ itemId: 'item-1', lineNo: 1 })] }),
    );
  });
});

describe('PoLineModal — unit price precision (R07-01, edit surface)', () => {
  function renderLineModal() {
    const updatePurchaseOrderLineAction = vi
      .fn<[unknown], Promise<PoLineMutationResult>>()
      .mockResolvedValue({ ok: true, data: {} });
    const utils = render(
      <PoLineModal
        open
        onOpenChange={vi.fn()}
        labels={lineLabels}
        poId="po-1"
        editLine={{
          lineId: 'line-1',
          itemCode: 'RM-BUTTER',
          itemName: 'Butter',
          qty: '789.123',
          uom: 'g',
          unitPrice: '0.0199',
          taxPct: '0',
        }}
        searchPoItemsAction={vi.fn().mockResolvedValue(items)}
        addPurchaseOrderLineAction={vi.fn().mockResolvedValue({ ok: true, data: {} })}
        updatePurchaseOrderLineAction={updatePurchaseOrderLineAction}
        onSaved={vi.fn()}
      />,
    );
    return { ...utils, updatePurchaseOrderLineAction };
  }

  it('refuses an unstorable price at the field and blocks save', () => {
    renderLineModal();
    const priceInput = screen.getByTestId('po-line-price');
    for (const value of UNSTORABLE_PRICES) {
      fireEvent.change(priceInput, { target: { value } });
      expect(screen.getByTestId('po-line-price-error')).toHaveTextContent(PRICE_INVALID_SINGLE);
      expect(screen.getByTestId('po-line-submit')).toBeDisabled();
    }
  });

  it('never writes a coerced 0 for an unstorable price', async () => {
    const { updatePurchaseOrderLineAction } = renderLineModal();
    fireEvent.change(screen.getByTestId('po-line-price'), { target: { value: '0.005432' } });
    fireEvent.click(screen.getByTestId('po-line-submit'));
    fireEvent.submit(screen.getByTestId('po-line-form'));

    await waitFor(() => expect(screen.getByTestId('po-line-price-error')).toBeInTheDocument());
    expect(updatePurchaseOrderLineAction).not.toHaveBeenCalled();
  });

  it('refuses a blank price on edit (no silent 0)', async () => {
    const { updatePurchaseOrderLineAction } = renderLineModal();
    fireEvent.change(screen.getByTestId('po-line-price'), { target: { value: '' } });
    expect(screen.getByTestId('po-line-price-error')).toHaveTextContent(PRICE_REQUIRED_SINGLE);
    expect(screen.getByTestId('po-line-submit')).toBeDisabled();

    fireEvent.submit(screen.getByTestId('po-line-form'));
    expect(updatePurchaseOrderLineAction).not.toHaveBeenCalled();
  });

  it('ANTI-REGRESSION: saves the prefilled 4-decimal price unchanged', async () => {
    const { updatePurchaseOrderLineAction } = renderLineModal();
    expect(screen.getByTestId('po-line-price')).toHaveValue('0.0199');
    fireEvent.click(screen.getByTestId('po-line-submit'));

    await waitFor(() => expect(updatePurchaseOrderLineAction).toHaveBeenCalledTimes(1));
    expect(updatePurchaseOrderLineAction).toHaveBeenCalledWith(
      expect.objectContaining({ poId: 'po-1', lineId: 'line-1', unitPrice: '0.0199' }),
    );
  });
});

describe('PoDetailView — persisted price precision is visible (R07-07)', () => {
  const detailLabels = {
    status: { confirmed: 'Confirmed' },
    summary: {
      title: 'PO summary',
      supplier: 'Supplier',
      status: 'Status',
      expected: 'Expected delivery',
      currency: 'Currency',
      destinationWarehouse: 'Destination warehouse',
      total: 'Total',
      netTotal: 'Net total',
      taxTotal: 'Tax total',
      created: 'Created',
    },
    relatedGrns: { title: 'Related GRNs', empty: 'No GRNs yet.' },
    lines: {
      title: 'PO lines',
      seq: '#',
      item: 'Item',
      qty: 'Qty',
      uom: 'UoM',
      unitPrice: 'Unit price',
      taxPct: 'Tax %',
      lineTotal: 'Line total',
      received: 'Received',
      receivedFull: 'Received',
      receivedPartial: 'Partial',
      empty: 'No lines.',
    },
    receivedSummary: { title: 'Receipt progress', lines: '{received} / {total} lines' },
    transitions: {
      title: 'Status',
      send: 'Submit',
      confirm: 'Confirm',
      receivePartial: 'Mark partial',
      receive: 'Mark received',
      cancel: 'Cancel PO',
      pending: 'Updating…',
      confirmPrompt: 'Change status of {po} to {status}?',
      cancelConfirmTitle: 'Cancel {po}?',
      cancelConfirmBody: 'This cancels the PO.',
      cancelSuccess: 'Cancelled.',
      cancelPoHasReceipts: 'Has receipts.',
    },
    reopen: {
      button: 'Reopen to draft',
      pending: 'Reopening…',
      confirmPrompt: 'Reopen {po}?',
      confirmTitle: 'Reopen {po}?',
      confirmBody: 'This reopens the PO.',
      success: 'Reopened.',
      error: 'Could not reopen.',
    },
    notesTitle: 'Notes',
    errors: { persistence_failed: 'save failed' },
    edit: {
      editOrder: 'Edit order',
      addLine: '+ Add line',
      editLine: 'Edit',
      deleteLine: 'Delete',
      deleteLinePrompt: 'Delete line {line}?',
      lastLineRefused: 'must keep one line',
      modal: {} as PoDetailLabels['edit']['modal'],
      lineModal: lineLabels,
    },
  } as unknown as PoDetailLabels;

  const po = {
    id: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierId: 'sup-1',
    supplierCode: 'AGRO',
    supplierName: 'Agro-Fresh Ltd.',
    status: 'confirmed',
    expectedDelivery: '2026-07-01',
    currency: 'GBP',
    destinationWarehouseName: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      { id: 'l1', itemCode: 'RM-BUTTER', itemName: 'Butter', qty: '789.123', uom: 'g', unitPrice: '0.0199', taxPct: '0', lineNo: 1, receivedQty: '0' },
      { id: 'l2', itemCode: 'RM-SALT', itemName: 'Salt', qty: '10', uom: 'kg', unitPrice: '3.4567', taxPct: '0', lineNo: 2, receivedQty: '0' },
    ],
    relatedGrns: [],
  } as unknown as PoDetail;

  it('renders the four decimals the column persists, not a 2-dp rounding', () => {
    render(
      <PoDetailView
        po={po}
        labels={detailLabels}
        locale="en"
        transitionPurchaseOrderStatusAction={vi.fn<[string, string], Promise<PoTransitionResult>>()}
      />,
    );
    const l1 = screen.getByTestId('po-line-l1');
    expect(l1).toHaveTextContent('0.0199 GBP');
    expect(l1).not.toHaveTextContent('0.02 GBP');

    const l2 = screen.getByTestId('po-line-l2');
    expect(l2).toHaveTextContent('3.4567 GBP');
    expect(l2).not.toHaveTextContent('3.46 GBP');
  });

  it('pads unit price to four decimals (2.5 → 2.5000)', () => {
    render(
      <PoDetailView
        po={{ ...po, lines: [{ ...po.lines[0]!, unitPrice: '2.5' }] }}
        labels={detailLabels}
        locale="en"
        transitionPurchaseOrderStatusAction={vi.fn<[string, string], Promise<PoTransitionResult>>()}
      />,
    );
    expect(screen.getByTestId('po-line-l1')).toHaveTextContent('2.5000 GBP');
  });
});
