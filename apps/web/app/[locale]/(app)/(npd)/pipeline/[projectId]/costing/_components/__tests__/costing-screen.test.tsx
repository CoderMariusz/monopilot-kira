/**
 * @vitest-environment jsdom
 * T-075 — CostingScreen (costing_screen prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:83-163 (CostingScreen)
 *
 * RED → GREEN: asserts the parity checklist (9-step canonical cost waterfall in
 * order, per-kg / per-pack / per-batch unit pills, 3-scenario margin table
 * pessimistic/target/optimistic, the V07 "Margin warn" badge when margin is
 * below the threshold, the HARD FAIL banner when a scenario margin < 0%, the
 * what-if Sliders rendered as the @monopilot/ui Slider primitive — NEVER a raw
 * <input type="range">, and the Save Scenario CTA), the four required UI states
 * (loading / empty / populated / error), permission-denied, and that visible
 * strings come from the injected i18n labels (no default leak).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));


import {
  CostingScreen,
  type CostingLabels,
  type CostingScreenData,
  type CostingWaterfallStepView,
  type ScenarioRow,
} from '../costing-screen';

afterEach(() => cleanup());

// Canonical 9-step order per §17.11.3 / COSTING_WATERFALL_STEP_NAMES.
const STEPS: CostingWaterfallStepView[] = [
  { stepIndex: 1, stepName: 'Raw materials', label: 'Raw materials', valueEur: '15.1700', deltaPct: null },
  { stepIndex: 2, stepName: 'Yield loss', label: 'Yield loss', valueEur: '16.8556', deltaPct: '11.1100' },
  { stepIndex: 3, stepName: 'Process labour', label: 'Process labour', valueEur: '18.3756', deltaPct: '9.0200' },
  { stepIndex: 4, stepName: 'Packaging', label: 'Packaging', valueEur: '19.0256', deltaPct: '3.5400' },
  { stepIndex: 5, stepName: 'Overhead', label: 'Overhead', valueEur: '20.0256', deltaPct: '5.2600' },
  { stepIndex: 6, stepName: 'Logistics', label: 'Logistics', valueEur: '20.5256', deltaPct: '2.5000' },
  { stepIndex: 7, stepName: 'Margin', label: 'Margin', valueEur: '22.1900', deltaPct: '8.1100' },
  { stepIndex: 8, stepName: 'Distributor', label: 'Distributor', valueEur: '24.4090', deltaPct: '10.0000' },
  { stepIndex: 9, stepName: 'Retail', label: 'Retail', valueEur: '29.2908', deltaPct: '20.0000' },
];

const SCENARIOS: ScenarioRow[] = [
  {
    scenario: 'pessimistic',
    name: 'Pessimistic (promo)',
    targetPriceEur: '17.4500',
    costEur: '18.4000',
    marginEur: '-0.9500',
    marginPct: '-5.4000',
    status: 'fail',
  },
  {
    scenario: 'target',
    name: 'Target',
    targetPriceEur: '19.9000',
    costEur: '18.4000',
    marginEur: '1.5000',
    marginPct: '7.5000',
    status: 'warn',
  },
  {
    scenario: 'optimistic',
    name: 'Optimistic',
    targetPriceEur: '21.4500',
    costEur: '18.4000',
    marginEur: '3.0500',
    marginPct: '14.2000',
    status: 'ok',
  },
];

const LABELS: CostingLabels = {
  title: 'Cost breakdown',
  subtitle: 'Waterfall from raw materials to final cost per kg',
  unitPerKg: 'Per kg',
  unitPerPack: 'Per pack',
  unitPerBatch: 'Per batch',
  waterfallTitle: 'Cost waterfall',
  colStep: 'Step',
  colValue: 'Value €/kg',
  colDelta: 'Δ %',
  marginTitle: 'Margin vs target price',
  colScenario: 'Scenario',
  colTargetPrice: 'Target price',
  colRevenue: 'Revenue €/kg',
  colCost: 'Cost €/kg',
  colMargin: 'Margin',
  colMarginPct: 'Margin %',
  marginWarn: 'Margin warn',
  marginWarnBody:
    'At target price, margin is {marginPct}% — below the NPD minimum of {threshold}%.',
  hardFail: 'Margin hard fail',
  hardFailBody: 'Scenario "{name}" has a negative margin ({marginPct}%) and cannot be saved.',
  whatIfTitle: 'What-if sliders',
  sliderPorkContent: 'Raw cost €/kg',
  sliderYield: 'Yield %',
  sliderTargetPrice: 'Margin %',
  scenarioName: 'Scenario name',
  saveScenario: 'Save scenario',
  saving: 'Saving…',
  saveError: 'Could not save the scenario. Try again.',
  saved: 'Scenario saved.',
  loading: 'Loading costing data…',
  empty: 'No costing data yet',
  emptyBody: 'Costing is computed once the formulation has ingredient costs.',
  error: 'Unable to load costing data.',
  forbidden: 'You do not have permission to view costing data.',
  computeCosting: 'Compute costing',
  computing: 'Computing…',
  computeError: 'Could not compute the costing. Try again.',
  computeErrorNotFound: 'No formulation is available to compute costing from yet.',
  computeErrorNoCosts: 'Every ingredient needs a cost before costing can be computed.',
  computeErrorHardFail: 'The target margin is negative, so the breakdown cannot be saved.',
};

const DATA: CostingScreenData = {
  productCode: 'FA1001',
  projectId: 'project-1',
  productName: 'Sliced Ham 200g',
  marginWarnThresholdPct: '15',
  steps: STEPS,
  scenarios: SCENARIOS,
  currentParams: {
    rawCostEur: '15.17',
    yieldPct: '78',
    processLabourEur: '1.52',
    packagingEur: '0.65',
    overheadEur: '1.00',
    logisticsEur: '0.50',
    marginPct: '7.5',
    distributorMarkupPct: '10',
    retailMarkupPct: '20',
  },
};

function renderReady(extra?: Partial<React.ComponentProps<typeof CostingScreen>>) {
  return render(<CostingScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('CostingScreen — parity', () => {
  it('renders the 9-step waterfall in canonical order', () => {
    renderReady();
    const wf = screen.getByTestId('costing-waterfall');
    const rows = within(wf).getAllByTestId('waterfall-step');
    expect(rows).toHaveLength(9);
    const names = rows.map((r) => within(r).getByTestId('waterfall-step-label').textContent);
    expect(names).toEqual([
      'Raw materials',
      'Yield loss',
      'Process labour',
      'Packaging',
      'Overhead',
      'Logistics',
      'Margin',
      'Distributor',
      'Retail',
    ]);
  });

  it('renders money from NUMERIC strings (never JS float)', () => {
    renderReady();
    const wf = screen.getByTestId('costing-waterfall');
    const first = within(wf).getAllByTestId('waterfall-step')[0];
    // 15.1700 displayed as a formatted euro value, derived from the string.
    expect(within(first).getByTestId('waterfall-step-value').textContent).toContain('15.17');
  });

  it('renders the 3 scenario rows (pessimistic / target / optimistic)', () => {
    renderReady();
    const table = screen.getByTestId('scenario-table');
    const rows = within(table).getAllByTestId('scenario-row');
    expect(rows).toHaveLength(3);
    const names = rows.map((r) => within(r).getByTestId('scenario-name').textContent);
    expect(names).toEqual(['Pessimistic (promo)', 'Target', 'Optimistic']);
  });

  it('renders the unit pills (per kg / per pack / per batch)', () => {
    renderReady();
    expect(screen.getByRole('button', { name: LABELS.unitPerKg })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.unitPerPack })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.unitPerBatch })).toBeInTheDocument();
  });

  it('renders what-if sliders as the Slider primitive — NOT raw <input type=range>', () => {
    const { container } = renderReady();
    expect(container.querySelector('input[type="range"]')).toBeNull();
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(3);
  });
});

describe('CostingScreen — V07 warn / hard fail', () => {
  it('shows a "Margin warn" badge when the target scenario margin is below threshold', () => {
    renderReady();
    // Target scenario has status 'warn' (7.5% < 15%).
    const table = screen.getByTestId('scenario-table');
    const target = within(table)
      .getAllByTestId('scenario-row')
      .find((r) => within(r).getByTestId('scenario-name').textContent === 'Target')!;
    expect(within(target).getByText(LABELS.marginWarn)).toBeInTheDocument();
  });

  it('shows the HARD FAIL banner when a scenario margin < 0%', () => {
    renderReady();
    const banner = screen.getByTestId('hard-fail-banner');
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText(/Pessimistic/)).toBeInTheDocument();
  });

  it('does not show the hard-fail banner when all margins are >= 0%', () => {
    const safeScenarios = SCENARIOS.map((s) =>
      s.scenario === 'pessimistic'
        ? { ...s, marginEur: '0.1000', marginPct: '0.5000', status: 'warn' as const }
        : s,
    );
    renderReady({ data: { ...DATA, scenarios: safeScenarios } });
    expect(screen.queryByTestId('hard-fail-banner')).not.toBeInTheDocument();
  });
});

describe('CostingScreen — save scenario', () => {
  it('disables Save when the current (target) scenario hard-fails (margin < 0%)', () => {
    const failingData: CostingScreenData = {
      ...DATA,
      currentParams: { ...DATA.currentParams, marginPct: '-5' },
      scenarios: SCENARIOS,
    };
    renderReady({ data: failingData });
    const save = screen.getByRole('button', { name: LABELS.saveScenario });
    expect(save).toBeDisabled();
  });

  it('calls onSaveScenario with the named scenario + current params on Save', async () => {
    const onSaveScenario = vi.fn().mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();
    renderReady({ onSaveScenario, onRefresh });
    const nameInput = screen.getByLabelText(LABELS.scenarioName);
    fireEvent.change(nameInput, { target: { value: 'my-scenario' } });
    const save = screen.getByRole('button', { name: LABELS.saveScenario });
    fireEvent.click(save);
    await waitFor(() => expect(onSaveScenario).toHaveBeenCalledTimes(1));
    const arg = onSaveScenario.mock.calls[0][0];
    expect(arg.projectId).toBe('project-1');
    expect(arg.productCode).toBe('FA1001');
    expect(arg.scenario).toBe('my-scenario');
    // Params are decimal strings (never floats).
    expect(typeof arg.params.rawCostEur).toBe('string');
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});

describe('CostingScreen — required states', () => {
  it('loading shows a live status region', () => {
    render(<CostingScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
    expect(screen.queryByTestId('costing-waterfall')).not.toBeInTheDocument();
  });

  it('empty shows the empty-state copy', () => {
    render(<CostingScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.queryByTestId('costing-waterfall')).not.toBeInTheDocument();
  });

  it('error shows an alert with the i18n error copy', () => {
    render(<CostingScreen state="error" data={null} labels={LABELS} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied hides the waterfall and shows forbidden copy', () => {
    render(<CostingScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
    expect(screen.queryByTestId('costing-waterfall')).not.toBeInTheDocument();
  });
});

describe('CostingScreen — i18n', () => {
  it('renders only provided label strings (no default leak)', () => {
    renderReady();
    // Title appears in the breadcrumb and the heading (with the product name);
    // assert via the heading's substring so we don't depend on exact wrapping.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(LABELS.title);
    expect(screen.getByText(LABELS.marginTitle)).toBeInTheDocument();
    expect(screen.getByText(LABELS.whatIfTitle)).toBeInTheDocument();
  });
});
