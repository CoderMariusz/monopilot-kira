/**
 * @vitest-environment jsdom
 * T-075 — CostingScreen parity evidence harness (RTL/DOM-snapshot fallback).
 *
 * Playwright happy-path capture needs a running Next server + Supabase auth +
 * seeded costing_breakdowns/waterfall rows (the module-level Gate-5 live-deploy
 * verification). At the component-task layer that stack is unavailable, so — per
 * T-075 AC4 ("if Playwright is unavailable, document the blocker and provide
 * RTL/snapshot fallback evidence") — this harness renders every required UI
 * state (plus the populated + hard-fail variants) and writes the resulting DOM
 * to apps/web/e2e/parity-evidence/npd/T-075/<state>.html.
 *
 * These artifacts are the parity-diff source (prototype other-stages.jsx:83-163
 * → production DOM) and the per-state evidence (loading/empty/populated/error/
 * permission-denied + hard-fail banner).
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CostingScreen,
  type CostingLabels,
  type CostingScreenData,
  type CostingWaterfallStepView,
  type PageState,
  type ScenarioRow,
} from '../costing-screen';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-075');

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
  { scenario: 'pessimistic', name: 'Pessimistic (promo)', targetPriceEur: '17.4500', costEur: '18.4000', marginEur: '-0.9500', marginPct: '-5.4000', status: 'fail' },
  { scenario: 'target', name: 'Target', targetPriceEur: '19.9000', costEur: '18.4000', marginEur: '1.5000', marginPct: '7.5000', status: 'warn' },
  { scenario: 'optimistic', name: 'Optimistic', targetPriceEur: '21.4500', costEur: '18.4000', marginEur: '3.0500', marginPct: '14.2000', status: 'ok' },
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
  marginWarnBody: 'At target price, margin is {marginPct}% — below the NPD minimum of {threshold}%.',
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

function write(state: string, html: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${state}.html`), html, 'utf8');
}

describe('CostingScreen — parity evidence capture', () => {
  const cases: Array<{ state: PageState; data: CostingScreenData | null }> = [
    { state: 'loading', data: null },
    { state: 'empty', data: null },
    { state: 'ready', data: DATA },
    { state: 'error', data: null },
    { state: 'permission_denied', data: null },
  ];

  it.each(cases)('captures DOM for state=$state', ({ state, data }) => {
    const { container } = render(<CostingScreen state={state} data={data} labels={LABELS} />);
    write(state === 'ready' ? 'populated' : state, container.innerHTML);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
