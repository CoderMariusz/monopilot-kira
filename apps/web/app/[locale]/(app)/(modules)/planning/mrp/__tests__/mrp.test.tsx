/**
 * W9-M2 — /planning/mrp screen RTL tests (jsdom, vitest.ui.config.ts).
 *
 * The async RSC page composes labels from next-intl and injects the runMrp
 * Server Action; here we exercise the client view against an injected action
 * seam: initial honest empty state, run → results table + severity badges +
 * KPI tiles + timestamp, no-requirements empty state, forbidden and error
 * surfaces, UoM-exclusion hint.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MrpView, type MrpLabels } from '../_components/mrp-view';
import type { MrpRunResult } from '../../_actions/mrp';
import type { MrpRow } from '../../_actions/mrp-compute';

const LABELS: MrpLabels = {
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
  kpis: {
    itemsShort: 'Items short',
    coverage: 'Demand coverage',
    itemsAnalyzed: 'Items analyzed',
    totalDemand: 'Total open demand',
    totalDemandHint: 'Sum across items, each in its own base UoM',
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
  severity: { shortage: 'Shortage', at_risk: 'Covered by incoming supply', covered: 'Covered' },
  actionTypes: { buy: 'BUY', make: 'MAKE', none: '—' },
  itemTypes: { rm: 'Raw material', ingredient: 'Ingredient', intermediate: 'Intermediate', packaging: 'Packaging' },
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
  suggestedAction: { type: 'buy', qty: '25' },
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
  suggestedAction: { type: 'make', qty: '8' },
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
  excludedUoms: ['lb'],
};

function okResult(rows: MrpRow[]): MrpRunResult {
  return {
    ok: true,
    data: {
      ranAt: '2026-06-11T10:30:00.000Z',
      rows,
      kpis: { itemsAnalyzed: rows.length, itemsShort: rows.filter((r) => r.severity === 'shortage').length, totalDemand: '200.000', coveragePct: 83.5 },
    },
  };
}

describe('/planning/mrp — MrpView', () => {
  it('renders the honest initial empty state before any run', () => {
    render(<MrpView labels={LABELS} runAction={vi.fn()} />);
    expect(screen.getByTestId('mrp-empty-initial')).toHaveTextContent('No MRP run yet');
    expect(screen.getByTestId('mrp-run-button')).toHaveTextContent('Run MRP');
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
    expect(screen.getByText('Read-only analysis: nothing is saved and no orders are created.')).toBeInTheDocument();
  });

  it('runs the action and renders KPI tiles, results, severity badges and the timestamp', async () => {
    const runAction = vi.fn(async () => okResult([SHORT_ROW, MAKE_ROW, COVERED_ROW]));
    render(<MrpView labels={LABELS} runAction={runAction} timeFormatter={(iso) => iso} />);

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-results-table')).toBeInTheDocument());

    expect(runAction).toHaveBeenCalledTimes(1);

    // KPI tiles.
    expect(screen.getByTestId('mrp-kpi-itemsShort')).toHaveTextContent('2');
    expect(screen.getByTestId('mrp-kpi-itemsShort').className).toContain('red');
    expect(screen.getByTestId('mrp-kpi-coverage')).toHaveTextContent('83.5%');
    expect(screen.getByTestId('mrp-kpi-itemsAnalyzed')).toHaveTextContent('3');
    expect(screen.getByTestId('mrp-kpi-totalDemand')).toHaveTextContent('200.000');

    // Run timestamp.
    expect(screen.getByTestId('mrp-ran-at')).toHaveTextContent('2026-06-11T10:30:00.000Z');

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

  it('shows the no-requirements empty state when a run returns zero rows', async () => {
    const runAction = vi.fn(async () => okResult([]));
    render(<MrpView labels={LABELS} runAction={runAction} timeFormatter={(iso) => iso} />);

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-empty-rows')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-empty-rows')).toHaveTextContent('No material requirements found');
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
  });

  it('surfaces the forbidden state', async () => {
    const runAction = vi.fn(async (): Promise<MrpRunResult> => ({ ok: false, error: 'forbidden' }));
    render(<MrpView labels={LABELS} runAction={runAction} />);

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-denied')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-denied')).toHaveTextContent("You don't have permission to run MRP.");
    expect(screen.queryByTestId('mrp-results-table')).toBeNull();
  });

  it('surfaces the error state without a 500', async () => {
    const runAction = vi.fn(async (): Promise<MrpRunResult> => ({ ok: false, error: 'persistence_failed' }));
    render(<MrpView labels={LABELS} runAction={runAction} />);

    fireEvent.click(screen.getByTestId('mrp-run-button'));
    await waitFor(() => expect(screen.getByTestId('mrp-error')).toBeInTheDocument());
    expect(screen.getByTestId('mrp-error')).toHaveTextContent('MRP run failed. Try again.');
  });
});
