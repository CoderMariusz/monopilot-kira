/**
 * W9-M2 — /planning/mrp screen RTL tests (jsdom, vitest.ui.config.ts).
 * CL2 slice 2 — persist toggle (runAction receives { persist }), persisted run
 * number chip, below_min amber severity + min hint + due date, and the
 * "Previous runs" section (list + expandable requirement ledger).
 *
 * The async RSC page composes labels from next-intl and injects the Server
 * Actions; here we exercise the client view against injected action seams.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  MrpRunRequirementsResult,
  MrpRunResult,
  MrpRunsListResult,
} from '../../_actions/mrp';
import type { MrpRow } from '../../_actions/mrp-compute';

const hasDom = typeof document !== 'undefined';
const describeUi = hasDom ? describe : describe.skip;

let render: typeof import('@testing-library/react').render;
let screen: typeof import('@testing-library/react').screen;
let fireEvent: typeof import('@testing-library/react').fireEvent;
let waitFor: typeof import('@testing-library/react').waitFor;
let cleanup: typeof import('@testing-library/react').cleanup;
let MrpView: React.ComponentType<Record<string, unknown>>;

const LABELS = {
  run: 'Run MRP',
  running: 'Running…',
  ranAt: 'Last run',
  denied: "You don't have permission to run MRP.",
  error: 'MRP run failed. Try again.',
  emptyInitial: 'No MRP run yet',
  emptyInitialHint: 'Run MRP to net stock against demand.',
  emptyRows: 'No material requirements found',
  excludedUoms: 'Excluded UoMs (no clean conversion)',
  readOnlyNote: 'Read-only analysis: nothing is saved and no orders are created.',
  persistToggle: 'Save this run',
  persistNote: 'This run will be saved to MRP history. No orders are created.',
  persistedAs: 'saved as',
  minQty: 'Min',
  dueBy: 'Due',
  kpis: {
    itemsShort: 'Items short',
    coverage: 'Demand coverage',
    itemsAnalyzed: 'Items analyzed',
    totalDemand: 'Total open demand',
    totalDemandHint: 'Sum across items, each in its own base UoM',
    belowMin: 'Below min',
  },
  columns: {
    item: 'Item',
    type: 'Type',
    onHand: 'On hand',
    reserved: 'Reserved',
    openSupply: 'Open supply',
    demand: 'Demand',
    net: 'Net position',
    action: 'Suggested action',
  },
  severity: {
    shortage: 'Shortage',
    below_min: 'Below min stock',
    at_risk: 'Covered by incoming supply',
    covered: 'Covered',
  },
  actionTypes: { buy: 'BUY', make: 'MAKE', none: '—' },
  itemTypes: { rm: 'Raw material', ingredient: 'Ingredient', intermediate: 'Intermediate', packaging: 'Packaging' },
  previousRuns: {
    title: 'Previous runs',
    empty: 'No persisted runs yet',
    loading: 'Loading…',
    error: 'Failed to load previous runs.',
    expand: 'Details',
    collapse: 'Hide',
    columns: { run: 'Run', date: 'Date', items: 'Items', exceptions: 'Shortages', status: 'Status' },
    requirements: {
      item: 'Item',
      gross: 'Gross demand',
      receipts: 'Scheduled receipts',
      projected: 'Projected on hand',
      net: 'Net requirement',
      empty: 'No requirements stored for this run.',
    },
  },
};

const SHORT_ROW: MrpRow = {
  itemId: 'i1',
  itemCode: 'RM-FLOUR',
  itemName: 'Wheat flour',
  itemType: 'rm',
  uomBase: 'kg',
  onHand: '40.000',
  reserved: '10.000',
  openSupply: '25.000',
  demand: '80.000',
  net: '-25.000',
  severity: 'shortage',
  suggestedAction: { type: 'buy', qty: '25', dueDate: null, supplierId: null },
  minQty: null,
  excludedUoms: [],
};

const MAKE_ROW: MrpRow = {
  itemId: 'i2',
  itemCode: 'INT-DOUGH',
  itemName: 'Bread dough',
  itemType: 'intermediate',
  uomBase: 'kg',
  onHand: '0.000',
  reserved: '0.000',
  openSupply: '12.000',
  demand: '20.000',
  net: '-8.000',
  severity: 'shortage',
  suggestedAction: { type: 'make', qty: '8', dueDate: null, supplierId: null },
  minQty: null,
  excludedUoms: [],
};

const COVERED_ROW: MrpRow = {
  itemId: 'i3',
  itemCode: 'PKG-BOX',
  itemName: 'Carton box',
  itemType: 'packaging',
  uomBase: 'pcs',
  onHand: '500.000',
  reserved: '0.000',
  openSupply: '0.000',
  demand: '100.000',
  net: '400.000',
  severity: 'covered',
  suggestedAction: null,
  minQty: null,
  excludedUoms: ['lb'],
};

/** CL2 — below-min threshold row: net positive but under the configured floor. */
const BELOW_MIN_ROW: MrpRow = {
  itemId: 'i4',
  itemCode: 'RM-SALT',
  itemName: 'Sea salt',
  itemType: 'rm',
  uomBase: 'kg',
  onHand: '8.000',
  reserved: '0.000',
  openSupply: '0.000',
  demand: '0.000',
  net: '8.000',
  severity: 'below_min',
  suggestedAction: { type: 'buy', qty: '12', dueDate: '2026-06-18', supplierId: 'sup-1' },
  minQty: '20.000',
  excludedUoms: [],
};

function okResult(rows: MrpRow[], extra: { runId?: string | null; runNumber?: string | null } = {}): MrpRunResult {
  return {
    ok: true,
    data: {
      ranAt: '2026-06-11T10:30:00.000Z',
      rows,
      kpis: {
        itemsAnalyzed: rows.length,
        itemsShort: rows.filter((r) => r.severity === 'shortage').length,
        itemsBelowMin: rows.filter((r) => r.severity === 'below_min').length,
        totalDemand: '200.000',
        coveragePct: 83.5,
      },
      runId: extra.runId ?? null,
      runNumber: extra.runNumber ?? null,
      plannedOrders: [],
    },
  };
}

const emptyRuns = (): Promise<MrpRunsListResult> => Promise.resolve({ ok: true, data: [] });
const noReqs = (): Promise<MrpRunRequirementsResult> => Promise.resolve({ ok: true, data: [] });

function renderView(over: Record<string, unknown> = {}) {
  return render(React.createElement(MrpView, {
    labels: LABELS,
    runAction: vi.fn(),
    listRunsAction: vi.fn(emptyRuns),
    getRunRequirementsAction: vi.fn(noReqs),
    ...over,
  }));
}

describeUi('/planning/mrp — MrpView', () => {
  beforeAll(async () => {
    const testingLibrary = await import('@testing-library/react');
    const mrpViewModule = await import('../_components/mrp-view');
    render = testingLibrary.render;
    screen = testingLibrary.screen;
    fireEvent = testingLibrary.fireEvent;
    waitFor = testingLibrary.waitFor;
    cleanup = testingLibrary.cleanup;
    MrpView = mrpViewModule.MrpView as React.ComponentType<Record<string, unknown>>;
  });

  afterEach(() => {
    cleanup?.();
  });

  it('renders the honest initial empty state before any run', async () => {
    renderView();
    expect(screen.getByTestId('mrp-empty-initial')).toHaveTextContent('No MRP run yet');
    expect(screen.getByTestId('mrp-run-button')).toHaveTextContent('Run MRP');
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
    expect(screen.getByText('Read-only analysis: nothing is saved and no orders are created.')).toBeInTheDocument();
    // Previous runs loads honestly empty.
    await waitFor(() => expect(screen.getByTestId('mrp-runs-empty')).toBeInTheDocument());
  });

  it('runs the action and renders KPI tiles, results, severity badges and the timestamp', async () => {
    const runAction = vi.fn(async () => okResult([SHORT_ROW, MAKE_ROW, COVERED_ROW]));
    renderView({ runAction, timeFormatter: (iso) => iso });

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-results-table')).toBeInTheDocument());

    expect(runAction).toHaveBeenCalledTimes(1);
    // Toggle off by default → read-only run.
    expect(runAction).toHaveBeenCalledWith({ persist: false });

    // KPI tiles.
    expect(screen.getByTestId('mrp-kpi-itemsShort')).toHaveTextContent('2');
    expect(screen.getByTestId('mrp-kpi-itemsShort').className).toContain('red');
    expect(screen.getByTestId('mrp-kpi-coverage')).toHaveTextContent('83.5%');
    expect(screen.getByTestId('mrp-kpi-itemsAnalyzed')).toHaveTextContent('3');
    expect(screen.getByTestId('mrp-kpi-totalDemand')).toHaveTextContent('200.000');

    // Run timestamp.
    expect(screen.getByTestId('mrp-ran-at')).toHaveTextContent('2026-06-11T10:30:00.000Z');
    expect(screen.queryByTestId('mrp-persisted-as')).toBeNull();

    // Severity badges: negative net = red badge; covered = green.
    expect(screen.getByTestId('mrp-net-RM-FLOUR').className).toContain('badge-red');
    expect(screen.getByTestId('mrp-net-RM-FLOUR')).toHaveTextContent('-25.000 kg');
    expect(screen.getByTestId('mrp-net-PKG-BOX').className).toContain('badge-green');
    expect(screen.getByTestId('mrp-row-RM-FLOUR')).toHaveAttribute('data-severity', 'shortage');

    // Suggested actions: BUY for rm, MAKE for intermediate, none for covered.
    expect(screen.getByTestId('mrp-action-RM-FLOUR')).toHaveTextContent('BUY 25 kg');
    expect(screen.getByTestId('mrp-action-INT-DOUGH')).toHaveTextContent('MAKE 8 kg');
    expect(screen.queryByTestId('mrp-action-PKG-BOX')).toBeNull();

    // UoM-exclusion hint surfaces per row.
    expect(screen.getByTestId('mrp-excluded-PKG-BOX')).toHaveTextContent('Excluded UoMs (no clean conversion): lb');
  });

  it('renders below_min with its own AMBER badge (distinct from red shortage), min hint and due date', async () => {
    const runAction = vi.fn(async () => okResult([SHORT_ROW, BELOW_MIN_ROW]));
    renderView({ runAction, timeFormatter: (iso) => iso });

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-results-table')).toBeInTheDocument());

    // Amber, not red — and the shortage row stays red.
    expect(screen.getByTestId('mrp-net-RM-SALT').className).toContain('badge-amber');
    expect(screen.getByTestId('mrp-net-RM-FLOUR').className).toContain('badge-red');
    expect(screen.getByTestId('mrp-row-RM-SALT')).toHaveAttribute('data-severity', 'below_min');

    // Min-floor hint + threshold-driven suggestion with the supplier due date.
    expect(screen.getByTestId('mrp-min-RM-SALT')).toHaveTextContent('Min: 20.000 kg');
    expect(screen.getByTestId('mrp-action-RM-SALT')).toHaveTextContent('BUY 12 kg');
    expect(screen.getByTestId('mrp-due-RM-SALT')).toHaveTextContent('Due: 2026-06-18');

    // Below-min count surfaces on the KPI tile.
    expect(screen.getByTestId('mrp-kpi-belowMin')).toHaveTextContent('Below min: 1');
  });

  it('passes { persist: true } when the toggle is on and shows the persisted run number', async () => {
    const runAction = vi.fn(async () => okResult([SHORT_ROW], { runId: 'run-1', runNumber: 'MRP-20260611-AB12CD34' }));
    const listRunsAction = vi.fn(emptyRuns);
    renderView({ runAction, listRunsAction, timeFormatter: (iso) => iso });

    // Persist note replaces the read-only note once the toggle is on.
    fireEvent.click(screen.getByTestId('mrp-persist-toggle'));
    expect(screen.getByText('This run will be saved to MRP history. No orders are created.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-results-table')).toBeInTheDocument());

    expect(runAction).toHaveBeenCalledWith({ persist: true });
    expect(screen.getByTestId('mrp-persisted-as')).toHaveTextContent('saved as MRP-20260611-AB12CD34');
    // A persisted run reloads the previous-runs list (mount + refresh).
    await waitFor(() => expect(listRunsAction).toHaveBeenCalledTimes(2));
  });

  it('lists previous runs and expands a run into its requirement ledger', async () => {
    const listRunsAction = vi.fn(
      async (): Promise<MrpRunsListResult> => ({
        ok: true,
        data: [
          {
            id: 'run-1',
            runNumber: 'MRP-20260610-AAAA1111',
            status: 'completed',
            horizonStart: '2026-06-10',
            requirementCount: 2,
            exceptionCount: 1,
            createdAt: '2026-06-10T09:00:00.000Z',
          },
        ],
      }),
    );
    const getRunRequirementsAction = vi.fn(
      async (): Promise<MrpRunRequirementsResult> => ({
        ok: true,
        data: [
          {
            itemId: 'i1',
            itemCode: 'RM-FLOUR',
            itemName: 'Wheat flour',
            bucketDate: '2026-06-10',
            grossRequirement: '80.000',
            scheduledReceipts: '25.000',
            projectedOnHand: '-25.000',
            netRequirement: '25.000',
            uom: 'kg',
            exceptionType: 'shortage',
          },
        ],
      }),
    );
    renderView({ listRunsAction, getRunRequirementsAction });

    await waitFor(() => expect(screen.getByTestId('mrp-runs-table')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-run-MRP-20260610-AAAA1111')).toHaveTextContent('2026-06-10');

    fireEvent.click(screen.getByTestId('mrp-run-toggle-MRP-20260610-AAAA1111'));
    await waitFor(() =>
      expect(screen.getByTestId('mrp-run-ledger-MRP-20260610-AAAA1111')).toBeInTheDocument(),
    );
    expect(getRunRequirementsAction).toHaveBeenCalledWith('run-1');
    await waitFor(() => expect(screen.getByTestId('mrp-req-RM-FLOUR')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-req-RM-FLOUR')).toHaveTextContent('25.000 kg');
  });

  it('shows the no-requirements empty state when a run returns zero rows', async () => {
    const runAction = vi.fn(async () => okResult([]));
    renderView({ runAction, timeFormatter: (iso) => iso });

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-empty-rows')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-empty-rows')).toHaveTextContent('No material requirements found');
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
  });

  it('surfaces the forbidden state', async () => {
    const runAction = vi.fn(async (): Promise<MrpRunResult> => ({ ok: false, error: 'forbidden' }));
    renderView({ runAction });

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-denied')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-denied')).toHaveTextContent("You don't have permission to run MRP.");
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
  });

  it('surfaces the error state without a 500', async () => {
    const runAction = vi.fn(async (): Promise<MrpRunResult> => ({ ok: false, error: 'persistence_failed' }));
    renderView({ runAction });

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-error')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-error')).toHaveTextContent('MRP run failed. Try again.');
  });

  it('hides the previous-runs section when the list read is forbidden', async () => {
    const listRunsAction = vi.fn(async (): Promise<MrpRunsListResult> => ({ ok: false, error: 'forbidden' }));
    renderView({ listRunsAction });
    await waitFor(() => expect(listRunsAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('mrp-previous-runs')).toBeNull());
  });
});
