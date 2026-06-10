/**
 * P2-PLANNING — Work Orders list + create + detail: RTL parity + state tests.
 *
 * Prototypes:
 *   - prototypes/design/Monopilot Design System/planning/wo-list.jsx:4-279 (plan_wo_list)
 *   - prototypes/design/Monopilot Design System/planning/wo-detail.jsx:4-588 (plan_wo_detail)
 *
 * The async RSC pages read Supabase via withOrgContext and are exercised live
 * (manual + Playwright). Here we test the client views + modal against Server
 * Action SEAMS:
 *   - list: status-tab + search filtering, "+ Create WO" opens the modal, per-row
 *     Release on DRAFT rows confirms then calls releaseWorkOrder (+ forbidden RBAC
 *     surface), ?new=1 auto-open;
 *   - create: the modal builds the exact payload passed to createWorkOrder and
 *     surfaces its `no_active_bom` warning + forbidden error;
 *   - detail: 7 tabs from a getPlanningWorkOrder fixture, with the no-source tabs
 *     (Reservations/Sequencing/D365) rendering honest "not live" panels;
 *   - i18n: Planning.workOrders defined in all four locales (en/pl real, ro/uk EN).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../../i18n/en.json';
import plMessages from '../../../../../../../i18n/pl.json';
import roMessages from '../../../../../../../i18n/ro.json';
import ukMessages from '../../../../../../../i18n/uk.json';

import { WoListView, type WoListLabels } from '../_components/wo-list-view';
import { WoDetailView, type WoDetailLabels } from '../_components/wo-detail-view';
import type { ListPlanningWorkOrdersResult, GetPlanningWorkOrderResult, CreateWorkOrderResult, ReleaseWorkOrderResult } from '../_actions/shared';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

// ── Labels (the page composes these from next-intl; here we read en directly) ──
const enWo = (enMessages as any).Planning.workOrders;
const listLabels: WoListLabels = {
  createWo: enWo.actions.createWo,
  searchPlaceholder: enWo.list.searchPlaceholder,
  rowsCount: enWo.list.rowsCount,
  tabs: {
    all: enWo.list.tabs.all,
    DRAFT: enWo.woStatus.draft,
    RELEASED: enWo.woStatus.released,
    IN_PROGRESS: enWo.woStatus.in_progress,
    ON_HOLD: enWo.woStatus.on_hold,
    COMPLETED: enWo.woStatus.completed,
  },
  status: {
    draft: enWo.woStatus.draft,
    released: enWo.woStatus.released,
    in_progress: enWo.woStatus.in_progress,
    on_hold: enWo.woStatus.on_hold,
    completed: enWo.woStatus.completed,
    closed: enWo.woStatus.closed,
    cancelled: enWo.woStatus.cancelled,
  },
  columns: enWo.list.columns,
  bomBadge: enWo.list.bomBadge,
  noBomBadge: enWo.list.noBomBadge,
  notAssigned: enWo.list.notAssigned,
  release: enWo.list.release,
  releasing: enWo.list.releasing,
  confirmRelease: enWo.list.confirmRelease,
  empty: enWo.list.empty,
  releaseError: enWo.errors,
  create: {
    ...enWo.create,
    errors: { ...enWo.create.errors, ...enWo.errors },
  },
};

const detailLabels: WoDetailLabels = {
  status: listLabels.status,
  summary: enWo.detail.summary,
  tabs: enWo.detail.tabs,
  materials: enWo.detail.materials,
  operations: enWo.detail.operations,
  outputs: enWo.detail.outputs,
  dependencies: enWo.detail.dependencies,
  history: enWo.detail.history,
  notLive: enWo.detail.notLive,
  minutes: enWo.detail.minutes,
};

const resources = {
  lines: [{ id: 'line-1', code: 'LINE-01', name: 'Line One' }],
  machines: [{ id: 'mach-1', code: 'MIX-1', name: 'Mixer One', machineType: 'mixer' }],
};

function makeRow(over: Partial<Extract<ListPlanningWorkOrdersResult, { ok: true }>['workOrders'][number]>) {
  return {
    id: 'wo-1',
    woNumber: 'WO-A',
    productId: 'p1',
    itemCode: 'FG-001',
    itemTypeAtCreation: 'fg',
    plannedQuantity: '1000',
    producedQuantity: null,
    uom: 'kg',
    status: 'DRAFT',
    scheduledStartTime: '2026-06-10T06:00:00.000Z',
    scheduledEndTime: null,
    productionLineId: 'line-1',
    machineId: 'mach-1',
    priority: 'normal',
    sourceOfDemand: 'manual',
    sourceReference: 'FG-001',
    notes: null,
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    materialCount: 2,
    operationCount: 2,
    ...over,
  };
}

const ROWS = [
  makeRow({ id: 'wo-1', woNumber: 'WO-DRAFT', itemCode: 'FG-001', status: 'DRAFT', materialCount: 2 }),
  makeRow({ id: 'wo-2', woNumber: 'WO-REL', itemCode: 'FG-002', status: 'RELEASED', materialCount: 0 }),
  makeRow({ id: 'wo-3', woNumber: 'WO-PROG', itemCode: 'FG-003', status: 'IN_PROGRESS' }),
];

function renderList(props: Partial<React.ComponentProps<typeof WoListView>> = {}) {
  const searchFgProductsAction = vi.fn().mockResolvedValue([
    { id: 'p1', itemCode: 'FG-001', name: 'Demo FG', uomBase: 'kg' },
  ]);
  const createWorkOrderAction = vi.fn<Parameters<React.ComponentProps<typeof WoListView>['createWorkOrderAction']>, Promise<CreateWorkOrderResult>>();
  const releaseWorkOrderAction = vi.fn<Parameters<React.ComponentProps<typeof WoListView>['releaseWorkOrderAction']>, Promise<ReleaseWorkOrderResult>>();
  const utils = render(
    <WoListView
      locale="en"
      workOrders={ROWS}
      resources={resources}
      labels={listLabels}
      searchFgProductsAction={searchFgProductsAction}
      createWorkOrderAction={createWorkOrderAction}
      releaseWorkOrderAction={releaseWorkOrderAction}
      {...props}
    />,
  );
  return { ...utils, searchFgProductsAction, createWorkOrderAction, releaseWorkOrderAction };
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('WoListView — structure + filtering (parity: wo-list.jsx:106-262)', () => {
  it('renders status tabs with live counts and a dense WO table', () => {
    renderList();
    expect(screen.getByTestId('wo-list-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('wo-list-tab-all')).toHaveTextContent('3');
    expect(screen.getByTestId('wo-list-tab-DRAFT')).toHaveTextContent('1');
    expect(screen.getByTestId('wo-list-tab-RELEASED')).toHaveTextContent('1');
    // Real columns only; rows link to detail.
    expect(screen.getByTestId('wo-link-wo-1')).toHaveAttribute('href', '/en/planning/work-orders/wo-1');
    // BOM badge driven by materialCount.
    expect(within(screen.getByTestId('wo-row-wo-1')).getByText(enWo.list.bomBadge)).toBeInTheDocument();
    expect(within(screen.getByTestId('wo-row-wo-2')).getByText(enWo.list.noBomBadge)).toBeInTheDocument();
  });

  it('filters by status tab', () => {
    renderList();
    fireEvent.click(screen.getByTestId('wo-list-tab-RELEASED'));
    expect(screen.queryByTestId('wo-row-wo-1')).toBeNull();
    expect(screen.getByTestId('wo-row-wo-2')).toBeInTheDocument();
  });

  it('filters by search over WO number and item code', () => {
    renderList();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: 'FG-003' } });
    expect(screen.getByTestId('wo-row-wo-3')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-row-wo-1')).toBeNull();
  });

  it('shows the empty-state when no rows match (parity: wo-list.jsx:152-159)', () => {
    renderList();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(enWo.list.empty.title);
  });
});

describe('WoListView — release with confirm + RBAC (parity: wo-list.jsx:218-226)', () => {
  it('only DRAFT rows expose Release', () => {
    renderList();
    expect(screen.getByTestId('wo-release-wo-1')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-release-wo-2')).toBeNull();
  });

  it('confirms then calls releaseWorkOrder with the row id', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { releaseWorkOrderAction } = renderList();
    releaseWorkOrderAction.mockResolvedValue({ ok: true, workOrder: {} as any });

    fireEvent.click(screen.getByTestId('wo-release-wo-1'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(releaseWorkOrderAction).toHaveBeenCalledWith({ id: 'wo-1' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not call releaseWorkOrder when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { releaseWorkOrderAction } = renderList();
    fireEvent.click(screen.getByTestId('wo-release-wo-1'));
    expect(releaseWorkOrderAction).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden RBAC result inline (server-enforced, not client-trusted)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { releaseWorkOrderAction } = renderList();
    releaseWorkOrderAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('wo-release-wo-1'));
    await waitFor(() => expect(screen.getByTestId('wo-row-error-wo-1')).toHaveTextContent(enWo.errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('WoListView — create modal (parity: wo-list.jsx:94 + modals wo_create_wizard)', () => {
  it('auto-opens the create modal on ?new=1 deep-link', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-wo-form')).toBeInTheDocument();
  });

  it('builds the createWorkOrder payload and surfaces the no-active-BOM warning', async () => {
    const { createWorkOrderAction } = renderList();
    createWorkOrderAction.mockResolvedValue({
      ok: true,
      workOrder: {} as any,
      materials: [],
      primarySchedule: {} as any,
      warning: 'no_active_bom',
    });

    // Open modal.
    fireEvent.click(screen.getByTestId('wo-list-create'));
    expect(screen.getByTestId('create-wo-form')).toBeInTheDocument();

    // Pick a product (FG-restricted ItemPicker seam).
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-wo-selected-product')).toHaveTextContent('FG-001'));

    // Quantity (decimal string).
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '1000.5' } });

    fireEvent.click(screen.getByTestId('create-wo-submit'));

    await waitFor(() =>
      expect(createWorkOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', itemCode: 'FG-001', plannedQuantity: '1000.5' }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('blocks submit and shows an error when no product is selected', async () => {
    const { createWorkOrderAction } = renderList();
    fireEvent.click(screen.getByTestId('wo-list-create'));
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('create-wo-submit'));
    await waitFor(() => expect(screen.getByTestId('create-wo-error')).toHaveTextContent(enWo.create.errors.productRequired));
    expect(createWorkOrderAction).not.toHaveBeenCalled();
  });
});

describe('WoDetailView — 7 tabs from fixture (parity: wo-detail.jsx:107-585)', () => {
  const fixture: Extract<GetPlanningWorkOrderResult, { ok: true }>['workOrder'] = {
    ...(makeRow({ id: 'wo-1', woNumber: 'WO-DETAIL' }) as any),
    materials: [
      { id: 'm1', woId: 'wo-1', productId: 'p1', materialName: 'Demo Flour', requiredQty: '700', consumedQty: '0', reservedQty: '0', uom: 'kg', sequence: 1, materialSource: 'stock', bomItemId: null, bomVersion: 1, notes: null },
    ],
    operations: [
      { id: 'o1', woId: 'wo-1', sequence: 1, operationName: 'Mix', machineId: 'mach-1', lineId: 'line-1', expectedDurationMinutes: 90, expectedYieldPercent: '98.5', actualDuration: null, actualYield: null, status: 'pending', notes: null },
    ],
    schedules: [
      { id: 's1', plannedWoId: 'wo-1', productId: 'p1', outputRole: 'primary', expectedQty: '1000', uom: 'kg', allocationPct: '100.00', disposition: 'to_stock', downstreamWoId: null, notes: null },
    ],
    dependencies: [],
    statusHistory: [
      { id: 'h1', woId: 'wo-1', fromStatus: null, toStatus: 'DRAFT', action: 'create', userId: 'u1', overrideReason: null, context: {}, occurredAt: '2026-06-09T00:00:00.000Z' },
    ],
  };

  it('renders the header, summary bar, all 7 tab triggers and live Overview/Outputs/History data', () => {
    render(<WoDetailView workOrder={fixture} labels={detailLabels} locale="en" />);

    expect(screen.getByText('WO-DETAIL')).toBeInTheDocument();
    expect(screen.getByTestId('wo-detail-summary')).toBeInTheDocument();
    for (const tab of ['overview', 'outputs', 'dependencies', 'reservations', 'sequencing', 'history', 'd365']) {
      expect(screen.getByTestId(`wo-tab-${tab}`)).toBeInTheDocument();
    }
    // Overview is the default tab — materials + operations rendered.
    expect(screen.getByTestId('wo-materials-table')).toHaveTextContent('Demo Flour');
    expect(screen.getByTestId('wo-operations-table')).toHaveTextContent('Mix');
  });

  it('renders honest "not live" panels for Reservations / Sequencing / D365 (no data source)', async () => {
    const user = userEvent.setup();
    render(<WoDetailView workOrder={fixture} labels={detailLabels} locale="en" />);

    await user.click(screen.getByTestId('wo-tab-reservations'));
    expect(await screen.findByTestId('wo-reservations-not-live')).toHaveTextContent(enWo.detail.notLive.reservations);

    await user.click(screen.getByTestId('wo-tab-sequencing'));
    expect(await screen.findByTestId('wo-sequencing-not-live')).toHaveTextContent(enWo.detail.notLive.sequencing);

    await user.click(screen.getByTestId('wo-tab-d365'));
    expect(await screen.findByTestId('wo-d365-not-live')).toHaveTextContent(enWo.detail.notLive.d365);
  });

  it('shows the empty-state on the Dependencies tab when there are none', async () => {
    const user = userEvent.setup();
    render(<WoDetailView workOrder={fixture} labels={detailLabels} locale="en" />);
    await user.click(screen.getByTestId('wo-tab-dependencies'));
    expect(await screen.findByTestId('wo-dependencies-empty')).toHaveTextContent(enWo.detail.dependencies.empty);
  });
});

describe('Planning.workOrders i18n coverage (en/pl real, ro/uk mirror en)', () => {
  const locales = { en: enMessages, pl: plMessages, ro: roMessages, uk: ukMessages } as Record<string, any>;
  it('defines the workOrders namespace with all consumed keys in every locale', () => {
    for (const [loc, msgs] of Object.entries(locales)) {
      const w = msgs.Planning?.workOrders;
      expect(w, `Planning.workOrders missing in ${loc}`).toBeTruthy();
      expect(w.title).toBeTruthy();
      expect(w.error).toBeTruthy();
      expect(w.actions.createWo).toBeTruthy();
      expect(w.list.empty.title).toBeTruthy();
      expect(w.list.confirmRelease).toContain('{wo}');
      expect(w.list.rowsCount).toContain('{n}');
      expect(w.create.title).toBeTruthy();
      expect(w.create.noBomWarning).toBeTruthy();
      expect(w.create.errors.productRequired).toBeTruthy();
      expect(w.detail.tabs.reservations).toBeTruthy();
      expect(w.detail.notLive.d365).toBeTruthy();
      expect(w.errors.forbidden).toBeTruthy();
      expect(w.errors.persistence_failed).toBeTruthy();
    }
  });
});
