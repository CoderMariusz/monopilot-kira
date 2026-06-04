/**
 * @vitest-environment jsdom
 * T-114 — CostPanel (cost_panel prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:67-101 (CostPanel)
 *
 * RED → GREEN. Asserts:
 *   - parity checklist: raw material / after-yield / processing / packaging /
 *     total-cost lines + a margin box with revenue, €/kg margin and margin %;
 *   - controlled inputs: typing in target-price / yield reaches the parent via
 *     onTargetPriceChange / onYieldChange (no internal state ownership);
 *   - margin tint thresholds: marginPct < 0 → red, < 15 → amber, ≥ 15 → green;
 *   - money is currency-formatted (e.g. "€3.98") and NUMERIC-exact (strings);
 *   - required UI states (loading / empty / error / permission-denied);
 *   - i18n labels never leak the raw default key.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CostPanel,
  type CostBreakdown,
  type CostPanelLabels,
  type CostPanelState,
} from '../cost-panel';

afterEach(() => cleanup());

const LABELS: CostPanelLabels = {
  title: 'Cost & margin',
  live: 'live',
  rawMaterial: 'Raw material',
  afterYield: 'After yield ({yieldPct}%)',
  processing: 'Processing ({overheadPct}%)',
  packaging: 'Packaging',
  totalCost: 'Total cost / kg',
  perKgSuffix: '/ kg',
  targetPrice: 'Target price (200g pack)',
  expectedYield: 'Expected yield %',
  revenuePerKg: 'Revenue / kg (at target price)',
  marginPerKg: 'Margin / kg',
  marginPct: 'Margin %',
  loading: 'Loading cost…',
  empty: 'No cost yet',
  emptyBody: 'Add ingredient costs to see the live margin.',
  error: 'Unable to load the cost breakdown.',
  forbidden: 'You do not have permission to view costs.',
};

/** A NUMERIC-exact calc snapshot (every money/percent field is a STRING). */
const CALC: CostBreakdown = {
  rawCost: '3.5000',
  yieldedCost: '3.8043',
  processing: '0.3043',
  packaging: '0.6500',
  costPerKg: '4.7586',
  revenuePerKg: '9.9000',
  marginPct: '51.93',
  overheadPct: '8',
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof CostPanel>> = {}) {
  return render(
    <CostPanel
      calc={CALC}
      targetPrice="1.98"
      onTargetPriceChange={vi.fn()}
      yieldPct={92}
      onYieldChange={vi.fn()}
      labels={LABELS}
      {...overrides}
    />,
  );
}

describe('CostPanel — parity (recipe.jsx:67-101)', () => {
  it('renders the five cost-breakdown lines plus total', () => {
    renderPanel();
    expect(screen.getByText('Raw material')).toBeInTheDocument();
    expect(screen.getByText('After yield (92%)')).toBeInTheDocument();
    expect(screen.getByText('Processing (8%)')).toBeInTheDocument();
    expect(screen.getByText('Packaging')).toBeInTheDocument();
    expect(screen.getByText('Total cost / kg')).toBeInTheDocument();
  });

  it('renders the margin box with revenue, €/kg margin and margin %', () => {
    renderPanel();
    expect(screen.getByText('Revenue / kg (at target price)')).toBeInTheDocument();
    expect(screen.getByText('Margin / kg')).toBeInTheDocument();
    expect(screen.getByText('Margin %')).toBeInTheDocument();
    // Margin %/kg figure shows.
    expect(screen.getByTestId('cost-margin-pct')).toHaveTextContent('51.9%');
  });

  it('renders the live title with no leaked i18n keys', () => {
    renderPanel();
    expect(screen.getByText('Cost & margin')).toBeInTheDocument();
    expect(screen.queryByText(/costPanel\./)).not.toBeInTheDocument();
  });
});

describe('CostPanel — currency formatting (AC#4)', () => {
  it('formats money values with the currency symbol, NUMERIC-exact (default EUR)', () => {
    renderPanel();
    // €3.50 from "3.5000" — trimmed to 2 dp, no float drift.
    expect(screen.getByTestId('cost-raw')).toHaveTextContent('€3.50 / kg');
    expect(screen.getByTestId('cost-total')).toHaveTextContent('€4.76');
    expect(screen.getByTestId('cost-revenue')).toHaveTextContent('€9.90');
  });

  it('derives margin €/kg exactly from revenue − cost (no JS float on money)', () => {
    // 9.9000 − 4.7586 = 5.1414 → "€5.14".
    renderPanel();
    expect(screen.getByTestId('cost-margin')).toHaveTextContent('€5.14');
  });

  it('honours a non-EUR currency prop without hardcoding the symbol', () => {
    renderPanel({ currency: 'GBP' });
    expect(screen.getByTestId('cost-raw')).toHaveTextContent('£3.50 / kg');
  });
});

describe('CostPanel — controlled inputs (AC#2)', () => {
  it('routes target-price keystrokes to onTargetPriceChange', () => {
    const onTargetPriceChange = vi.fn();
    renderPanel({ onTargetPriceChange });
    const input = screen.getByLabelText('Target price (200g pack)');
    fireEvent.change(input, { target: { value: '2.49' } });
    expect(onTargetPriceChange).toHaveBeenCalledWith('2.49');
  });

  it('routes yield keystrokes to onYieldChange as a number', () => {
    const onYieldChange = vi.fn();
    renderPanel({ onYieldChange });
    const input = screen.getByLabelText('Expected yield %');
    fireEvent.change(input, { target: { value: '88' } });
    expect(onYieldChange).toHaveBeenCalledWith(88);
  });

  it('reflects the controlled values from props (does not own state)', () => {
    renderPanel({ targetPrice: '3.10', yieldPct: 75 });
    expect(screen.getByLabelText('Target price (200g pack)')).toHaveValue('3.10');
    expect(screen.getByLabelText('Expected yield %')).toHaveValue(75);
  });
});

describe('CostPanel — margin tint thresholds (AC#3)', () => {
  it('tints the margin box green when marginPct ≥ 15', () => {
    renderPanel({ calc: { ...CALC, marginPct: '51.93' } });
    expect(screen.getByTestId('cost-margin-box')).toHaveClass('bg-green-50');
  });

  it('tints the margin box amber when 0 ≤ marginPct < 15', () => {
    renderPanel({ calc: { ...CALC, marginPct: '7.50' } });
    expect(screen.getByTestId('cost-margin-box')).toHaveClass('bg-amber-50');
  });

  it('tints the margin box red when marginPct < 0', () => {
    renderPanel({ calc: { ...CALC, marginPct: '-4.20', revenuePerKg: '4.5000' } });
    expect(screen.getByTestId('cost-margin-box')).toHaveClass('bg-red-50');
  });

  it('colours a negative margin €/kg red and a positive one green', () => {
    renderPanel({ calc: { ...CALC, revenuePerKg: '4.5000', marginPct: '-4.20' } });
    // 4.5000 − 4.7586 = -0.2586 → "-€0.26".
    const margin = screen.getByTestId('cost-margin');
    expect(margin).toHaveTextContent('-€0.26');
    expect(margin).toHaveClass('text-red-600');
  });
});

describe('CostPanel — required UI states', () => {
  it('shows the loading state', () => {
    renderPanel({ state: 'loading', calc: null });
    expect(screen.getByText('Loading cost…')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    renderPanel({ state: 'empty', calc: null });
    expect(screen.getByText('No cost yet')).toBeInTheDocument();
    expect(screen.getByText('Add ingredient costs to see the live margin.')).toBeInTheDocument();
  });

  it('shows the error state with an alert role', () => {
    renderPanel({ state: 'error', calc: null });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to load the cost breakdown.');
  });

  it('shows the permission-denied state', () => {
    renderPanel({ state: 'permission_denied', calc: null });
    expect(screen.getByText('You do not have permission to view costs.')).toBeInTheDocument();
  });

  it('falls back to the empty state when ready but calc is null', () => {
    renderPanel({ state: 'ready', calc: null });
    expect(screen.getByText('No cost yet')).toBeInTheDocument();
  });
});

describe('CostPanel — a11y', () => {
  it('associates labels with the two inputs', () => {
    renderPanel();
    expect(screen.getByLabelText('Target price (200g pack)')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected yield %')).toBeInTheDocument();
  });

  it('exposes an accessible region name from the panel title', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: /Cost & margin/ })).toBeInTheDocument();
  });
});

function _typecheckState(s: CostPanelState): CostPanelState {
  return s;
}
void _typecheckState;
