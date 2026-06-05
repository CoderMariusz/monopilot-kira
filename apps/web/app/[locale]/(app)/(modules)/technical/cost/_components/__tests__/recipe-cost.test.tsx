/**
 * @vitest-environment jsdom
 *
 * 03-technical Recipe costing (TEC-013) RTL — real component, mocked action.
 *
 * Prototype anchor (verified `wc -l` other-screens.jsx = 1659):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *   (CostingScreen) — Std-cost KPI row + cost-breakdown bars + total + yield note.
 *
 * Parity + states asserted:
 *   - product picker (shadcn Select) drives getRecipeCost.
 *   - KPI std material cost + breakdown rows render NUMERIC strings verbatim.
 *   - an uncosted line surfaces the "no cost" label (honest, no fabricated cost).
 *   - load error → alert; empty products → prompt.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getRecipeCost = vi.fn();
vi.mock('../../_actions/list-recipe-cost', () => ({
  getRecipeCost: (...a: unknown[]) => getRecipeCost(...a),
  listCostedProducts: vi.fn(),
}));

import { RecipeCostClient, type RecipeCostCopy } from '../recipe-cost.client';
import type { CostedProductOption } from '../../_actions/list-recipe-cost';

const PRODUCTS: CostedProductOption[] = [
  { productCode: 'FG5101', name: 'Sausage', bomVersion: 7, bomStatus: 'active' },
];

const COPY: RecipeCostCopy = {
  selectLabel: 'Product', selectPlaceholder: 'Select…', selectPrompt: 'Pick a product',
  loading: 'Loading', loadError: 'Could not load',
  kpiStdCost: 'Std cost', kpiStdCostSub: 'Σ', kpiYield: 'Yield', kpiYieldSub: 'BOM',
  kpiComponents: 'Components', kpiComponentsSub: 'lines', kpiCosted: 'Costed', kpiCostedSub: 'with cost',
  breakdownTitle: 'Cost breakdown', totalLabel: 'Total', noLines: 'No lines', noCost: 'No cost',
  bomNote: 'BOM v{version} {status}', uncosted: 'no cost',
};

const COST = {
  ok: true as const,
  state: 'ready' as const,
  cost: {
    productCode: 'FG5101', name: 'Sausage', bomVersion: 7, bomStatus: 'active', yieldPct: '91.000',
    totalMaterialCost: '15.0000',
    lines: [
      { componentCode: 'RM1001', componentName: 'Pork', componentType: 'RM', quantity: '1.000000', uom: 'kg', unitCost: '12.0000', lineCost: '12.0000' },
      { componentCode: 'RM2002', componentName: 'Salt', componentType: 'RM', quantity: '0.020000', uom: 'kg', unitCost: null, lineCost: null },
    ],
  },
};

afterEach(() => {
  cleanup();
  getRecipeCost.mockReset();
});

describe('RecipeCostClient (TEC-013)', () => {
  it('rolls up the std material cost and renders the breakdown verbatim', async () => {
    getRecipeCost.mockResolvedValue(COST);
    render(<RecipeCostClient products={PRODUCTS} copy={COPY} />);

    await waitFor(() => expect(getRecipeCost).toHaveBeenCalledWith('FG5101'));

    // Std material cost KPI = exact NUMERIC string (formatCost → 15.00). The same
    // total also appears in the total row, so assert at least one is present.
    expect((await screen.findAllByText('15.00')).length).toBeGreaterThanOrEqual(1);
    // Breakdown component code in mono + its line cost (12.00 appears for both the
    // line cost and the per-kg unit cost row, so assert presence, not uniqueness).
    expect(screen.getByText('RM1001')).toBeInTheDocument();
    expect(screen.getAllByText('12.00').length).toBeGreaterThanOrEqual(1);
    // The uncosted line is honest — no fabricated cost.
    expect(screen.getByText('no cost')).toBeInTheDocument();
  });

  it('renders the error alert when the cost read fails', async () => {
    getRecipeCost.mockResolvedValue({ ok: false, state: 'error' });
    render(<RecipeCostClient products={PRODUCTS} copy={COPY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  });

  it('shows the prompt when no product is selected', () => {
    render(<RecipeCostClient products={[]} copy={COPY} />);
    expect(screen.getByText('Pick a product')).toBeInTheDocument();
  });
});
