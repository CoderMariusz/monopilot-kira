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
import { normalizePage, toPaginatedResult } from '../../../../../../../lib/shared/pagination';
import { WoDetailView, type WoDetailLabels } from '../_components/wo-detail-view';
import type { ListPlanningWorkOrdersResult, GetPlanningWorkOrderResult, CreateWorkOrderResult, ReleaseWorkOrderResult, DeleteDraftWorkOrderResult } from '../_actions/shared';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh }),
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
  deleteDraft: 'Delete draft',
  deletingDraft: 'Deleting...',
  confirmDeleteDraft: 'Delete draft work order {wo}? This cannot be undone.',
  // Archive tab + archived-mode chrome — staged in _meta/i18n-staging/archive-tabs.json.
  tabArchive: 'Archive',
  archivedHint: 'Showing archived work orders.',
  backToActive: 'Back to active',
  pagination: {
    showing: 'Showing {shown} of {total}',
    previous: 'Previous',
    next: 'Next',
  },
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

const defaultWoPagination = toPaginatedResult(ROWS, ROWS.length, normalizePage({ page: 1, defaultLimit: 50 }));
const defaultFilters = { status: '', search: '' };
const defaultStatusCounts = {
  all: 3,
  DRAFT: 1,
  RELEASED: 1,
  IN_PROGRESS: 1,
  ON_HOLD: 0,
  COMPLETED: 0,
  CLOSED: 0,
  CANCELLED: 0,
};

function renderList(props: Partial<React.ComponentProps<typeof WoListView>> = {}) {
  const searchFgProductsAction = vi.fn().mockResolvedValue([
    { id: 'p1', itemCode: 'FG-001', name: 'Demo FG', uomBase: 'kg' },
  ]);
  const createWorkOrderAction = vi.fn<Parameters<React.ComponentProps<typeof WoListView>['createWorkOrderAction']>, Promise<CreateWorkOrderResult>>();
  const releaseWorkOrderAction = vi.fn<Parameters<React.ComponentProps<typeof WoListView>['releaseWorkOrderAction']>, Promise<ReleaseWorkOrderResult>>();
  const deleteDraftWorkOrderAction = vi.fn<
    Parameters<NonNullable<React.ComponentProps<typeof WoListView>['deleteDraftWorkOrderAction']>>,
    Promise<DeleteDraftWorkOrderResult>
  >();
  const utils = render(
    <WoListView
      locale="en"
      workOrders={ROWS}
      pagination={defaultWoPagination}
      filters={defaultFilters}
      statusCounts={defaultStatusCounts}
      resources={resources}
      labels={listLabels}
      archivedCount={3}
      searchFgProductsAction={searchFgProductsAction}
      createWorkOrderAction={createWorkOrderAction}
      releaseWorkOrderAction={releaseWorkOrderAction}
      deleteDraftWorkOrderAction={deleteDraftWorkOrderAction}
      {...props}
    />,
  );
  return { ...utils, searchFgProductsAction, createWorkOrderAction, releaseWorkOrderAction, deleteDraftWorkOrderAction };
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
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

  it('navigates to the RELEASED status tab via URL', () => {
    renderList();
    fireEvent.click(screen.getByTestId('wo-list-tab-RELEASED'));
    expect(push).toHaveBeenCalledWith('/en/planning/work-orders?status=RELEASED');
  });

  it('renders an Archive tab carrying the archivedCount chip and linking to ?archived=1', () => {
    renderList({ archivedCount: 5 });
    const archiveTab = screen.getByTestId('wo-list-tab-archive');
    expect(archiveTab).toHaveTextContent('Archive');
    expect(archiveTab).toHaveTextContent('5');
    expect(archiveTab).toHaveAttribute('href', '/en/planning/work-orders?archived=1');
    expect(archiveTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the archived rows + archived-mode chrome when archived data is passed', () => {
    const archivedRows = [
      makeRow({ id: 'wo-arch-1', woNumber: 'WO-ARCH-1', status: 'COMPLETED' }),
      makeRow({ id: 'wo-arch-2', woNumber: 'WO-ARCH-2', status: 'CLOSED' }),
    ];
    renderList({ workOrders: archivedRows, archived: true, archivedCount: 2 });
    expect(screen.getByTestId('wo-row-wo-arch-1')).toBeInTheDocument();
    expect(screen.getByTestId('wo-row-wo-arch-2')).toBeInTheDocument();
    expect(screen.getByTestId('wo-list-tab-archive')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('wo-list-archived-hint')).toBeInTheDocument();
    expect(screen.getByTestId('wo-list-back-active')).toHaveAttribute('href', '/en/planning/work-orders');
    expect(screen.getByTestId('wo-list-tab-all')).toHaveAttribute('href', '/en/planning/work-orders');
  });

  it('debounces search navigation to the URL', () => {
    vi.useFakeTimers();
    renderList();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: 'FG-003' } });
    expect(push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(push).toHaveBeenCalledWith('/en/planning/work-orders?q=FG-003');
    vi.useRealTimers();
  });

  it('shows the empty-state when the server returns no rows', () => {
    renderList({
      workOrders: [],
      pagination: toPaginatedResult([], 0, normalizePage({ page: 1, defaultLimit: 50 })),
    });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(enWo.list.empty.title);
  });
});

describe('WoListView — release with confirm + RBAC (parity: wo-list.jsx:218-226)', () => {
  it('only DRAFT rows expose Release', () => {
    renderList();
    expect(screen.getByTestId('wo-release-wo-1')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-release-wo-2')).toBeNull();
  });

  it('only DRAFT rows expose Delete draft', () => {
    renderList();
    expect(screen.getByTestId('wo-delete-draft-wo-1')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-delete-draft-wo-2')).toBeNull();
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

  it('confirms then calls deleteDraftWorkOrder with the row id', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { deleteDraftWorkOrderAction } = renderList();
    deleteDraftWorkOrderAction.mockResolvedValue({ ok: true, id: 'wo-1' });

    fireEvent.click(screen.getByTestId('wo-delete-draft-wo-1'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(deleteDraftWorkOrderAction).toHaveBeenCalledWith({ id: 'wo-1' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not call deleteDraftWorkOrder when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { deleteDraftWorkOrderAction } = renderList();
    fireEvent.click(screen.getByTestId('wo-delete-draft-wo-1'));
    expect(deleteDraftWorkOrderAction).not.toHaveBeenCalled();
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

// ── P0-UOM lane — output-unit quantity + conversion + factory-release surface ──
//
// Product decision: planning enters WO quantity in the product's OUTPUT unit
// (box/each/base) with a live conversion to base kg; createWorkOrder receives
// plannedQuantity in base kg + quantityEntered/quantityEnteredUom; the new
// releaseWorkOrder 'factory_release_incomplete' result must surface which
// artifacts are missing and that they are created in Technical.
describe('WoListView — P0-UOM create-WO output unit + conversion', () => {
  // UOM-aware labels passed explicitly to pin the component contract; the
  // REAL-bundle loading path is covered by the F-D08a describe below.
  const uomLabels: WoListLabels = {
    ...listLabels,
    factoryReleaseIncomplete: {
      title: 'This work order can’t be released — missing {missing}.',
      activeBom: 'an active BOM',
      factorySpec: 'an approved factory spec',
      technicalHint: 'These are created in Technical.',
    },
    create: {
      ...listLabels.create,
      quantityUom: { base: 'kg', each: 'each', box: 'box' },
      conversionPreview: '{qty} {unit} = {kg} {base}',
      errors: {
        ...listLabels.create.errors,
        uom_conversion_unavailable: 'Missing pack data — set it in Technical.',
      },
      noFactorySpecWarning: 'No approved factory spec yet — create it in Technical.',
    },
  };

  // A box product: 1 box = 50 each, 1 each = 6 kg ⇒ 1 box = 300 kg.
  const BOX_PRODUCT = {
    id: 'p1',
    itemCode: 'FG-001',
    name: 'Demo FG',
    uomBase: 'kg',
    output_uom: 'box',
    net_qty_per_each: 6,
    each_per_box: 50,
    weight_mode: 'fixed',
  };

  function renderUomList(searchRows: unknown[], over: Partial<React.ComponentProps<typeof WoListView>> = {}) {
    const searchFgProductsAction = vi.fn().mockResolvedValue(searchRows);
    const createWorkOrderAction = vi.fn<
      Parameters<React.ComponentProps<typeof WoListView>['createWorkOrderAction']>,
      Promise<CreateWorkOrderResult>
    >();
    const releaseWorkOrderAction = vi.fn<
      Parameters<React.ComponentProps<typeof WoListView>['releaseWorkOrderAction']>,
      Promise<ReleaseWorkOrderResult>
    >();
    const utils = render(
      <WoListView
        locale="en"
        workOrders={ROWS}
        pagination={defaultWoPagination}
        filters={defaultFilters}
        statusCounts={defaultStatusCounts}
        resources={resources}
        labels={uomLabels}
        searchFgProductsAction={searchFgProductsAction}
        createWorkOrderAction={createWorkOrderAction}
        releaseWorkOrderAction={releaseWorkOrderAction}
        {...over}
      />,
    );
    return { ...utils, searchFgProductsAction, createWorkOrderAction, releaseWorkOrderAction };
  }

  async function pickBoxProduct() {
    fireEvent.click(screen.getByTestId('wo-list-create'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-wo-selected-product')).toHaveTextContent('FG-001'));
  }

  it('labels the quantity field with the product output unit (box) and shows the live conversion', async () => {
    renderUomList([BOX_PRODUCT]);
    await pickBoxProduct();

    // Label carries the output-unit suffix.
    expect(screen.getByText('Planned quantity (box)')).toBeInTheDocument();

    // 300 box → 300 * 50 * 6 = 90000.000 kg conversion preview.
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '300' } });
    await waitFor(() =>
      expect(screen.getByTestId('create-wo-conversion')).toHaveTextContent('300 box = 90,000.000 kg'),
    );
  });

  it('sends quantityEntered + quantityEnteredUom and the base-kg plannedQuantity to createWorkOrder', async () => {
    const { createWorkOrderAction } = renderUomList([BOX_PRODUCT]);
    createWorkOrderAction.mockResolvedValue({
      ok: true,
      workOrder: {} as any,
      materials: [],
      primarySchedule: {} as any,
    });
    await pickBoxProduct();
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('create-wo-submit'));

    await waitFor(() =>
      expect(createWorkOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'p1',
          itemCode: 'FG-001',
          quantityEntered: '2',
          quantityEnteredUom: 'box',
          plannedQuantity: '600', // 2 box * 50 each * 6 kg
        }),
      ),
    );
  });

  it('surfaces the no_approved_factory_spec create warning', async () => {
    const { createWorkOrderAction } = renderUomList([BOX_PRODUCT]);
    createWorkOrderAction.mockResolvedValue({
      ok: true,
      workOrder: {} as any,
      materials: [],
      primarySchedule: {} as any,
      warning: 'no_approved_factory_spec',
    });
    await pickBoxProduct();
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('create-wo-submit'));
    await waitFor(() => expect(createWorkOrderAction).toHaveBeenCalled());
  });

  it('a base product keeps the legacy label + no conversion preview', async () => {
    renderUomList([{ id: 'p1', itemCode: 'FG-001', name: 'Demo FG', uomBase: 'kg', output_uom: 'base' }]);
    await pickBoxProduct();
    expect(screen.getByText('Planned quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '10' } });
    expect(screen.queryByTestId('create-wo-conversion')).toBeNull();
  });

  it('surfaces factory_release_incomplete with the missing artifacts + Technical hint', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { releaseWorkOrderAction } = renderUomList([BOX_PRODUCT]);
    releaseWorkOrderAction.mockResolvedValue({
      ok: false,
      error: 'factory_release_incomplete',
      missing: ['active_bom', 'factory_spec'],
    } as any);

    fireEvent.click(screen.getByTestId('wo-release-wo-1'));
    await waitFor(() => {
      const banner = screen.getByTestId('wo-row-error-wo-1');
      expect(banner).toHaveTextContent('an active BOM');
      expect(banner).toHaveTextContent('an approved factory spec');
      expect(banner).toHaveTextContent('These are created in Technical.');
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

// ── F-D08a (2026-06-11 cross-module audit) — silent 100 szt→50 kg root cause ──
//
// The conversion preview's i18n labels were once planned for a staged file
// (_meta/i18n-staging/wo-uom.json) that was never created. The keys now live
// directly in the REAL bundles (apps/web/i18n/{en,pl,ro,uk}.json, landed in
// b86812de). This block proves the preview renders end-to-end through the SAME
// loading seam page.tsx uses — `t.has(key) ? t.raw(key) : fallback` — fed from
// the real bundle JSON, not hand-written labels. `t.raw` is load-bearing: in
// next-intl's development build a bare `t(key)` on a `{…}`-templated message
// raises FORMATTING_ERROR and returns the key path (this test caught that).
describe('F-D08a — conversion preview renders from the REAL i18n bundles', () => {
  const BOX_PRODUCT = {
    id: 'p1',
    itemCode: 'FG-001',
    name: 'Demo FG',
    uomBase: 'kg',
    output_uom: 'box',
    net_qty_per_each: 6,
    each_per_box: 50,
    weight_mode: 'fixed',
  };

  it.each([
    // 2 box × 50 each × 6 kg = 600.000 kg; PL box unit word = "karton".
    ['en', enMessages, 'box', '2 box = 600.000 kg'],
    ['pl', plMessages, 'karton', '2 karton = 600.000 kg'],
  ])('%s: builds UoM labels via the page t.has/t() seam and renders the live preview', async (locale, messages, boxWord, expectedPreview) => {
    const { createTranslator } = await import('next-intl');
    const t = createTranslator({
      locale,
      messages: messages as any,
      namespace: 'Planning.workOrders',
    } as any) as any;
    // EXACT seam from page.tsx buildLabels() — templates are read with t.raw.
    const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
    const optTpl = (key: string, fallback: string): string => (t.has(key) ? String(t.raw(key)) : fallback);

    // The keys must resolve from the bundle itself — the fallback must NOT be hit.
    expect(t.has('create.quantityUom.box')).toBe(true);
    expect(t.has('create.conversionPreview')).toBe(true);

    const realLabels: WoListLabels = {
      ...listLabels,
      create: {
        ...listLabels.create,
        quantityLabel: t('create.quantityLabel'),
        quantityUom: {
          base: opt('create.quantityUom.base', 'kg'),
          each: opt('create.quantityUom.each', 'each'),
          box: opt('create.quantityUom.box', 'box'),
        },
        conversionPreview: optTpl('create.conversionPreview', '{qty} {unit} = {kg} {base}'),
      },
    };
    expect(realLabels.create.quantityUom?.box).toBe(boxWord);

    const searchFgProductsAction = vi.fn().mockResolvedValue([BOX_PRODUCT]);
    render(
      <WoListView
        locale={locale}
        workOrders={ROWS}
        pagination={defaultWoPagination}
        filters={defaultFilters}
        statusCounts={defaultStatusCounts}
        resources={resources}
        labels={realLabels}
        searchFgProductsAction={searchFgProductsAction}
        createWorkOrderAction={vi.fn()}
        releaseWorkOrderAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('wo-list-create'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-wo-selected-product')).toHaveTextContent('FG-001'));

    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '2' } });
    await waitFor(() =>
      expect(screen.getByTestId('create-wo-conversion')).toHaveTextContent(expectedPreview),
    );
  });

  it('ro/uk mirror the EN UoM keys (i18n two-locale policy)', () => {
    for (const messages of [roMessages, ukMessages]) {
      const create = (messages as any).Planning.workOrders.create;
      expect(create.quantityUom).toEqual((enMessages as any).Planning.workOrders.create.quantityUom);
      expect(create.conversionPreview).toBe((enMessages as any).Planning.workOrders.create.conversionPreview);
    }
  });
});

// ── P0-UOM — Order unit selector: planner can ORDER in a unit other than the
// item's default output unit (owner ask: "order in box though the item is
// normally counted in each"). The selector is gated to the units the item's
// pack hierarchy can actually convert; switching it re-labels the quantity,
// re-drives the conversion preview, and is what createWorkOrder receives as
// quantityEnteredUom.
describe('WoListView — P0-UOM Order unit selector', () => {
  const uomLabels: WoListLabels = {
    ...listLabels,
    create: {
      ...listLabels.create,
      orderUnitLabel: 'Order unit',
      quantityUom: { base: 'kg', each: 'each', box: 'box' },
      conversionPreview: '{qty} {unit} = {kg} {base}',
      errors: {
        ...listLabels.create.errors,
        uom_conversion_unavailable: 'Missing pack data — set it in Technical.',
      },
    },
  };

  // each-default item, but convertible to box (net 2 kg/each, 10 each/box).
  const EACH_PRODUCT = {
    id: 'p1',
    itemCode: 'FG-001',
    name: 'Demo FG',
    uomBase: 'kg',
    output_uom: 'each',
    net_qty_per_each: 2,
    each_per_box: 10,
    weight_mode: 'fixed',
  };

  // each-default item with NO box factor → box must NOT be offered.
  const EACH_NO_BOX = {
    id: 'p1',
    itemCode: 'FG-001',
    name: 'Demo FG',
    uomBase: 'kg',
    output_uom: 'each',
    net_qty_per_each: 2,
    each_per_box: null,
    weight_mode: 'fixed',
  };

  const BASE_PRODUCT = { id: 'p1', itemCode: 'FG-001', name: 'Demo FG', uomBase: 'kg', output_uom: 'base' };

  function renderUomList(searchRows: unknown[]) {
    const searchFgProductsAction = vi.fn().mockResolvedValue(searchRows);
    const createWorkOrderAction = vi.fn<
      Parameters<React.ComponentProps<typeof WoListView>['createWorkOrderAction']>,
      Promise<CreateWorkOrderResult>
    >();
    const utils = render(
      <WoListView
        locale="en"
        workOrders={ROWS}
        pagination={defaultWoPagination}
        filters={defaultFilters}
        statusCounts={defaultStatusCounts}
        resources={resources}
        labels={uomLabels}
        searchFgProductsAction={searchFgProductsAction}
        createWorkOrderAction={createWorkOrderAction}
        releaseWorkOrderAction={vi.fn()}
      />,
    );
    return { ...utils, createWorkOrderAction };
  }

  async function pickFirst() {
    fireEvent.click(screen.getByTestId('wo-list-create'));
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('create-wo-selected-product')).toHaveTextContent('FG-001'));
  }

  it('offers the Order unit selector when the item converts to >1 unit, defaulting to its output unit', async () => {
    renderUomList([EACH_PRODUCT]);
    await pickFirst();
    // Selector present.
    expect(screen.getByTestId('create-wo-order-unit')).toBeInTheDocument();
    // Default = the item output unit (each) → quantity labelled in each.
    expect(screen.getByText('Planned quantity (each)')).toBeInTheDocument();
  });

  it('switching the order unit re-labels the quantity, re-drives the preview, and is sent as quantityEnteredUom', async () => {
    const { createWorkOrderAction } = renderUomList([EACH_PRODUCT]);
    createWorkOrderAction.mockResolvedValue({ ok: true, workOrder: {} as any, materials: [], primarySchedule: {} as any });
    await pickFirst();

    // Switch the order unit to box via the @monopilot/ui Select.
    const select = within(screen.getByTestId('create-wo-order-unit')).getByRole('combobox');
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'box' }));

    // Label flips to box; preview converts in box: 3 box × 10 each × 2 kg = 60.000 kg.
    expect(await screen.findByText('Planned quantity (box)')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('create-wo-quantity'), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByTestId('create-wo-conversion')).toHaveTextContent('3 box = 60.000 kg'));

    fireEvent.click(screen.getByTestId('create-wo-submit'));
    await waitFor(() =>
      expect(createWorkOrderAction).toHaveBeenCalledWith(
        expect.objectContaining({ quantityEnteredUom: 'box', quantityEntered: '3', plannedQuantity: '60' }),
      ),
    );
  });

  it('does NOT offer box when the item lacks each_per_box (only base + each)', async () => {
    renderUomList([EACH_NO_BOX]);
    await pickFirst();
    const select = within(screen.getByTestId('create-wo-order-unit')).getByRole('combobox');
    fireEvent.click(select);
    expect(screen.getByRole('option', { name: 'kg' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'each' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'box' })).toBeNull();
  });

  it('renders NO selector for a base-only item (single convertible unit)', async () => {
    renderUomList([BASE_PRODUCT]);
    await pickFirst();
    expect(screen.queryByTestId('create-wo-order-unit')).toBeNull();
    expect(screen.getByText('Planned quantity')).toBeInTheDocument();
  });
});

describe('WoDetailView — 7 tabs from fixture (parity: wo-detail.jsx:107-585)', () => {
  const fixture: Extract<GetPlanningWorkOrderResult, { ok: true }>['workOrder'] = {
    ...(makeRow({ id: 'wo-1', woNumber: 'WO-DETAIL' }) as any),
    materials: [
      { id: 'm1', woId: 'wo-1', productId: 'p1', materialName: 'Demo Flour', requiredQty: '700', consumedQty: '0', reservedQty: '0', uom: 'kg', sequence: 1, materialSource: 'stock', bomItemId: null, bomVersion: 1, notes: null },
    ],
    operations: [
      { id: 'o1', woId: 'wo-1', sequence: 1, operationName: 'Mix', lineId: 'line-1', expectedDurationMinutes: 90, expectedYieldPercent: '98.5', actualDuration: null, actualYield: null, status: 'pending', notes: null },
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
