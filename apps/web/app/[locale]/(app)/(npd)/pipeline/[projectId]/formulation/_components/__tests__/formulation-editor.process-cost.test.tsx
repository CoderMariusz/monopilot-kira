/**
 * @vitest-environment jsdom
 * W1-T2 — live CostPanel Processing line: Σ real process cost vs % placeholder.
 *
 * Contract:
 *   - project HAS npd_wip_processes (loadProcessCostAction → processCount > 0):
 *     the Processing line shows the Σ real per-kg process cost and the label says
 *     it is computed from N processes; total cost re-derives from it.
 *   - 0 processes (or lookup failure): the % placeholder stays, labelled as an
 *     estimate until processes are chosen.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
  type FormulationPanelLabels,
} from '../formulation-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

// Any missing label key renders as its own name — this suite only asserts the
// Processing line, so a key-echo stub keeps the fixture minimal.
const stubLabels = <T extends object>(overrides: Record<string, string> = {}): T =>
  new Proxy(overrides, {
    get: (t, key) => (typeof key === 'string' ? (t[key] ?? key) : ''),
  }) as T;

const LABELS = stubLabels<FormulationLabels>();
// The editor SPREADS panelLabels.cost to swap the processing label, so the cost
// bundle must be a plain object (Proxy keys don't survive a spread).
const PANEL_LABELS: FormulationPanelLabels = {
  cost: {
    title: 'cost.title',
    live: 'cost.live',
    rawMaterial: 'cost.raw',
    afterYield: 'cost.afterYield {yieldPct}',
    processing: 'Processing ({overheadPct}%)',
    packaging: 'cost.packaging',
    totalCost: 'cost.totalCost',
    perKgSuffix: '/kg',
    targetPrice: 'cost.targetPrice',
    expectedYield: 'cost.expectedYield',
    revenuePerKg: 'cost.revenuePerKg',
    marginPerKg: 'cost.marginPerKg',
    marginPct: 'cost.marginPct',
    loading: 'cost.loading',
    empty: 'cost.empty',
    emptyBody: 'cost.emptyBody',
    error: 'cost.error',
    forbidden: 'cost.forbidden',
  },
  nutrition: stubLabels<FormulationPanelLabels['nutrition']>(),
  allergen: stubLabels<FormulationPanelLabels['allergen']>(),
  composition: stubLabels<FormulationPanelLabels['composition']>(),
};

// rawCost/kg = (0.170×4.20 + 0.030×1.10) / 0.2 = 3.735; yielded = 3.735/0.78
// = 4.7885/kg → 8% placeholder processing = €0.38/kg.
const DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 1,
  state: 'draft',
  productCode: 'FG-1',
  batchSizeKg: '500',
  packWeightG: '200',
  targetPriceEur: '3.98',
  targetYieldPct: '78',
  versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 1 }],
  ingredients: [
    { id: 'a1', rmCode: 'RM-1', name: 'Pork', qtyKg: '0.170', pct: '85', costPerKgEur: '4.20', allergen: null, sequence: 1 },
    { id: 'a2', rmCode: 'RM-2', name: 'Starch', qtyKg: '0.030', pct: '15', costPerKgEur: '1.10', allergen: null, sequence: 2 },
  ],
};

function renderEditor(loadProcessCostAction: React.ComponentProps<typeof FormulationEditor>['loadProcessCostAction']) {
  render(
    <FormulationEditor
      state="ready"
      data={DATA}
      labels={LABELS}
      panelLabels={PANEL_LABELS}
      currency="EUR"
      canEdit
      loadProcessCostAction={loadProcessCostAction}
    />,
  );
}

describe('W1-T2 — CostPanel Processing line modes', () => {
  it('shows the Σ real process cost + computed label when the project has processes', async () => {
    renderEditor(
      vi.fn().mockResolvedValue({
        ok: true,
        data: { processCount: 3, processCostPerPackEur: '0.1000', processCostPerKgEur: '0.5000' },
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('Processing (computed from 3 processes)')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cost-processing')).toHaveTextContent('€0.50 /kg');
    // Total re-derives from the real processing: 4.7885 + 0.50 = €5.29 /kg.
    expect(screen.getByTestId('cost-total')).toHaveTextContent('€5.29');
  });

  it('keeps the % placeholder + estimate label when the project has 0 processes', async () => {
    renderEditor(
      vi.fn().mockResolvedValue({
        ok: true,
        data: { processCount: 0, processCostPerPackEur: '0.0000', processCostPerKgEur: '0.0000' },
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('Processing (8%) — estimate until processes are chosen')).toBeInTheDocument();
    });
    // 8% of yielded 4.7885 = €0.38 /kg — the placeholder math, untouched.
    expect(screen.getByTestId('cost-processing')).toHaveTextContent('€0.38 /kg');
  });

  it('falls back to the % placeholder when the process-cost lookup fails', async () => {
    renderEditor(vi.fn().mockRejectedValue(new Error('offline')));
    await waitFor(() => {
      expect(screen.getByText('Processing (8%) — estimate until processes are chosen')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cost-processing')).toHaveTextContent('€0.38 /kg');
  });
});
