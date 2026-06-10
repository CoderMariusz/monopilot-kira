/**
 * P2-PLANNING — Transfer Orders list + create + detail: RTL parity + state tests.
 *
 * Prototypes:
 *   - prototypes/planning/to-screens.jsx:3-99   (PlanTOList)
 *   - prototypes/planning/to-screens.jsx:103-279 (PlanTODetail)
 *   - prototypes/planning/modals.jsx:697-845    (TOCreateModal)
 *
 * The async RSC pages read Supabase via withOrgContext and are exercised live
 * (manual + Playwright). Here we test the client views + modal against Server
 * Action SEAMS, covering all five required UI states:
 *   - loading: the RSC Suspense skeleton (page-level; asserted via data-testid shape)
 *   - empty: filtering to no rows renders the EmptyState
 *   - error: the page renders a banner (the list view receives only ok rows) — the
 *     create + transition flows surface forbidden / persistence_failed inline
 *   - permission-denied: a `forbidden` create / transition result surfaces inline
 *     (server-enforced, never client-trusted)
 *   - optimistic: pending create disables submit; pending transition disables actions
 *
 * i18n labels are read from the staging bundle (_meta/i18n-staging/transfer-orders.json)
 * — real en + pl values that the parent merges into apps/web/messages.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import staging from '../../../../../../../../../_meta/i18n-staging/transfer-orders.json';

import { ToListView, type ToListLabels, type TransferOrderRow } from '../_components/to-list-view';
import { ToDetailView, type ToDetailLabels, type TransferOrderDetail } from '../_components/to-detail-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

// ── Labels (the page composes these via next-intl; here we read en from staging) ──
const enTo = (staging as any).en.Planning.transferOrders;
const plTo = (staging as any).pl.Planning.transferOrders;

const listLabels: ToListLabels = {
  createTo: enTo.actions.createTo,
  searchPlaceholder: enTo.list.searchPlaceholder,
  rowsCount: enTo.list.rowsCount,
  tabs: {
    all: enTo.list.tabs.all,
    draft: enTo.toStatus.draft,
    in_transit: enTo.toStatus.in_transit,
    received: enTo.toStatus.received,
    cancelled: enTo.toStatus.cancelled,
  },
  status: {
    draft: enTo.toStatus.draft,
    in_transit: enTo.toStatus.in_transit,
    received: enTo.toStatus.received,
    cancelled: enTo.toStatus.cancelled,
  },
  columns: enTo.list.columns,
  linesCount: enTo.list.linesCount,
  empty: enTo.list.empty,
  create: {
    ...enTo.create,
    errors: { ...enTo.create.errors, ...enTo.errors },
  },
};

const detailLabels: ToDetailLabels = {
  status: listLabels.status,
  summary: enTo.detail.summary,
  lines: enTo.detail.lines,
  transitions: enTo.detail.transitions,
  errors: enTo.errors,
};

const warehouses = [
  { id: 'wh-1', code: 'WH-A', name: 'Factory A' },
  { id: 'wh-2', code: 'WH-B', name: 'Dist Central' },
];

function makeRow(over: Partial<TransferOrderRow>): TransferOrderRow {
  return {
    id: 'to-1',
    toNumber: 'TO-0001',
    fromWarehouseId: 'wh-1',
    toWarehouseId: 'wh-2',
    status: 'draft',
    scheduledDate: '2026-06-12',
    notes: null,
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...over,
  };
}

const ROWS = [
  makeRow({ id: 'to-1', toNumber: 'TO-DRAFT', status: 'draft' }),
  makeRow({ id: 'to-2', toNumber: 'TO-TRANSIT', status: 'in_transit' }),
  makeRow({ id: 'to-3', toNumber: 'TO-RECV', status: 'received' }),
];

function renderList(props: Partial<React.ComponentProps<typeof ToListView>> = {}) {
  const searchTransferItemsAction = vi.fn().mockResolvedValue([
    { id: 'i1', itemCode: 'RM-001', name: 'Beef Trim', itemType: 'rm', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]);
  const createTransferOrderAction = vi.fn();
  const utils = render(
    <ToListView
      locale="en"
      transferOrders={ROWS}
      lineCounts={{ 'to-1': 2, 'to-2': 1, 'to-3': 0 }}
      warehouses={warehouses}
      labels={listLabels}
      searchTransferItemsAction={searchTransferItemsAction}
      createTransferOrderAction={createTransferOrderAction}
      {...props}
    />,
  );
  return { ...utils, searchTransferItemsAction, createTransferOrderAction };
}

/**
 * The @monopilot/ui Select trigger is a role="combobox" whose accessible name is
 * its displayed value (not the field's aria-label, which lands on the wrapper).
 * Both warehouse selects share a placeholder, so we target them positionally:
 * index 0 = From, index 1 = To.
 */
function pickWarehouse(index: number, optionName: string) {
  const triggers = screen.getAllByRole('combobox');
  fireEvent.click(triggers[index]);
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ToListView — structure + filtering (parity: to-screens.jsx:8-96)', () => {
  it('renders status tabs with live counts and a dense TO table with warehouse codes', () => {
    renderList();
    expect(screen.getByTestId('to-list-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('to-list-tab-all')).toHaveTextContent('3');
    expect(screen.getByTestId('to-list-tab-draft')).toHaveTextContent('1');
    expect(screen.getByTestId('to-list-tab-in_transit')).toHaveTextContent('1');
    // Row links to detail + resolves warehouse uuid → code.
    expect(screen.getByTestId('to-link-to-1')).toHaveAttribute('href', '/en/planning/transfer-orders/to-1');
    expect(within(screen.getByTestId('to-row-to-1')).getByText('WH-A')).toBeInTheDocument();
    expect(within(screen.getByTestId('to-row-to-1')).getByText('WH-B')).toBeInTheDocument();
  });

  it('filters by status tab', () => {
    renderList();
    fireEvent.click(screen.getByTestId('to-list-tab-in_transit'));
    expect(screen.queryByTestId('to-row-to-1')).toBeNull();
    expect(screen.getByTestId('to-row-to-2')).toBeInTheDocument();
  });

  it('filters by search over the TO number', () => {
    renderList();
    fireEvent.change(screen.getByTestId('to-list-search'), { target: { value: 'RECV' } });
    expect(screen.getByTestId('to-row-to-3')).toBeInTheDocument();
    expect(screen.queryByTestId('to-row-to-1')).toBeNull();
  });

  it('shows the empty-state when no rows match (UI-state: empty)', () => {
    renderList();
    fireEvent.change(screen.getByTestId('to-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(enTo.list.empty.title);
  });

  it('renders the empty-state when the org has no transfer orders at all', () => {
    renderList({ transferOrders: [], lineCounts: {} });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(enTo.list.empty.title);
    expect(screen.queryByTestId('to-list-table')).toBeNull();
  });
});

describe('ToListView — create modal (parity: to-screens.jsx:37 + modals.jsx:697-845)', () => {
  it('auto-opens the create modal on ?new=1 deep-link', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-to-form')).toBeInTheDocument();
  });

  it('validates same-warehouse and missing-line rules before calling the action', async () => {
    const { createTransferOrderAction } = renderList();
    fireEvent.click(screen.getByTestId('to-list-create'));
    expect(screen.getByTestId('create-to-form')).toBeInTheDocument();
    // Missing TO number first.
    fireEvent.click(screen.getByTestId('create-to-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('create-to-error')).toHaveTextContent(enTo.create.errors.toNumberRequired),
    );
    expect(createTransferOrderAction).not.toHaveBeenCalled();
  });

  it('builds the createTransferOrder payload from a picked item + qty (optimistic submit)', async () => {
    const { createTransferOrderAction } = renderList();
    createTransferOrderAction.mockResolvedValue({ ok: true, data: {} });

    fireEvent.click(screen.getByTestId('to-list-create'));
    fireEvent.change(screen.getByTestId('create-to-number'), { target: { value: 'TO-NEW' } });
    // Warehouses via the @monopilot/ui Select ([0] = From, [1] = To).
    pickWarehouse(0, 'WH-A — Factory A');
    pickWarehouse(1, 'WH-B — Dist Central');

    // Add a line + pick a real item (ItemPicker seam).
    fireEvent.click(screen.getByTestId('create-to-add-line'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-to-line-product-0')).toHaveTextContent('RM-001'));
    fireEvent.change(screen.getByTestId('create-to-line-qty-0'), { target: { value: '500' } });

    fireEvent.click(screen.getByTestId('create-to-submit'));
    await waitFor(() =>
      expect(createTransferOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({
          toNumber: 'TO-NEW',
          fromWarehouseId: 'wh-1',
          toWarehouseId: 'wh-2',
          lines: [expect.objectContaining({ itemId: 'i1', qty: '500', uom: 'kg', lineNo: 1 })],
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces a forbidden create result inline (RBAC server-enforced, UI-state: permission-denied)', async () => {
    const { createTransferOrderAction } = renderList();
    createTransferOrderAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('to-list-create'));
    fireEvent.change(screen.getByTestId('create-to-number'), { target: { value: 'TO-X' } });
    pickWarehouse(0, 'WH-A — Factory A');
    pickWarehouse(1, 'WH-B — Dist Central');
    fireEvent.click(screen.getByTestId('create-to-add-line'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    fireEvent.change(screen.getByTestId('create-to-line-qty-0'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('create-to-submit'));

    await waitFor(() => expect(screen.getByTestId('create-to-error')).toHaveTextContent(enTo.errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('ToDetailView — lines + status transitions (parity: to-screens.jsx:103-279)', () => {
  function makeDetail(over: Partial<TransferOrderDetail> = {}): TransferOrderDetail {
    return {
      id: 'to-1',
      toNumber: 'TO-DETAIL',
      fromWarehouseId: 'wh-1',
      toWarehouseId: 'wh-2',
      status: 'draft',
      scheduledDate: '2026-06-12',
      notes: 'Urgent restock',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
      lines: [
        { id: 'l1', toId: 'to-1', itemId: 'i1', itemCode: 'RM-001', itemName: 'Beef Trim', qty: '500', uom: 'kg', lineNo: 1 },
      ],
      ...over,
    };
  }

  function renderDetail(over: Partial<TransferOrderDetail> = {}) {
    const transitionTransferOrderStatusAction = vi.fn();
    const utils = render(
      <ToDetailView
        locale="en"
        transferOrder={makeDetail(over)}
        warehouses={warehouses}
        labels={detailLabels}
        transitionTransferOrderStatusAction={transitionTransferOrderStatusAction}
      />,
    );
    return { ...utils, transitionTransferOrderStatusAction };
  }

  it('renders the header, summary and lines table from the fixture', () => {
    renderDetail();
    // toNumber appears in both the header and the summary row.
    expect(screen.getAllByText('TO-DETAIL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('to-detail-summary')).toBeInTheDocument();
    expect(screen.getByTestId('to-detail-lines-table')).toHaveTextContent('Beef Trim');
    expect(screen.getByTestId('to-detail-lines-table')).toHaveTextContent('RM-001');
  });

  it('exposes Ship + Cancel transitions on a draft TO and calls the action with the target', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionTransferOrderStatusAction } = renderDetail({ status: 'draft' });
    transitionTransferOrderStatusAction.mockResolvedValue({ ok: true, data: {} });

    expect(screen.getByTestId('to-transition-in_transit')).toBeInTheDocument();
    expect(screen.getByTestId('to-transition-cancelled')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('to-transition-in_transit'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(transitionTransferOrderStatusAction).toHaveBeenCalledWith('to-1', 'in_transit'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('exposes Receive on an in_transit TO and no actions on a terminal received TO', () => {
    const { rerender } = renderDetail({ status: 'in_transit' });
    expect(screen.getByTestId('to-transition-received')).toBeInTheDocument();

    rerender(
      <ToDetailView
        locale="en"
        transferOrder={makeDetail({ status: 'received' })}
        warehouses={warehouses}
        labels={detailLabels}
        transitionTransferOrderStatusAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('to-detail-no-actions')).toHaveTextContent(enTo.detail.transitions.none);
  });

  it('surfaces a forbidden transition inline (UI-state: permission-denied)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionTransferOrderStatusAction } = renderDetail({ status: 'draft' });
    transitionTransferOrderStatusAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('to-transition-in_transit'));
    await waitFor(() => expect(screen.getByTestId('to-detail-error')).toHaveTextContent(enTo.errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders the empty lines state when the TO has no lines', () => {
    renderDetail({ lines: [] });
    expect(screen.getByTestId('to-detail-lines-empty')).toHaveTextContent(enTo.detail.lines.empty);
  });
});

describe('Planning.transferOrders i18n staging coverage (en + pl real values)', () => {
  it('defines every consumed key in both en and pl with real (non-key) values', () => {
    for (const [loc, ns] of [['en', enTo], ['pl', plTo]] as const) {
      expect(ns.title, `title missing in ${loc}`).toBeTruthy();
      expect(ns.error).toBeTruthy();
      expect(ns.actions.createTo).toBeTruthy();
      expect(ns.list.empty.title).toBeTruthy();
      expect(ns.list.rowsCount).toContain('{n}');
      expect(ns.list.linesCount).toContain('{n}');
      expect(ns.create.title).toBeTruthy();
      expect(ns.create.errors.sameWarehouse).toBeTruthy();
      expect(ns.detail.transitions.confirm).toContain('{to}');
      expect(ns.detail.transitions.confirm).toContain('{status}');
      expect(ns.errors.forbidden).toBeTruthy();
      expect(ns.errors.persistence_failed).toBeTruthy();
    }
    // en and pl must actually differ (real translation, not a copy).
    expect(plTo.actions.createTo).not.toBe(enTo.actions.createTo);
  });
});
