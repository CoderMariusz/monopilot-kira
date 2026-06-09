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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getRecipeCost = vi.fn();
vi.mock('../../_actions/list-recipe-cost', () => ({
  getRecipeCost: (...a: unknown[]) => getRecipeCost(...a),
  listCostedProducts: vi.fn(),
}));

import { RecipeCostClient, buildCostSheetCsv, type RecipeCostCopy } from '../recipe-cost.client';
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
  exportCostSheet: 'Export cost sheet',
  csvComponent: 'Component', csvComponentName: 'Name', csvComponentType: 'Type',
  csvQuantity: 'Quantity', csvUom: 'UoM', csvUnitCost: 'Cost/kg', csvLineCost: 'Line cost', csvTotal: 'Total',
  recompute: 'Recompute', recomputeTitle: 'Recompute standard cost',
  recomputeIntro: 'Re-roll BOM costs from current rates.',
  recomputeNote: 'Non-destructive — re-rolls from current material rates.',
  recomputeConfirm: 'Recompute now', cancel: 'Cancel',
  seeNpdCosting: 'See NPD costing →',
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

  it('Recompute opens the confirm modal and re-rolls the cost (real re-run, no fake)', async () => {
    getRecipeCost.mockResolvedValue(COST);
    render(<RecipeCostClient products={PRODUCTS} copy={COPY} />);

    await waitFor(() => expect(getRecipeCost).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Recompute/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Recompute standard cost')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recompute now' }));
    // Confirm re-invokes the live roll-up for the selected product.
    await waitFor(() => expect(getRecipeCost).toHaveBeenCalledTimes(2));
    expect(getRecipeCost).toHaveBeenLastCalledWith('FG5101');
  });
});

describe('RecipeCostClient — Export cost sheet (LANE 14)', () => {
  it('builds a cost-sheet CSV from RecipeCost (verbatim NUMERIC strings + total row)', () => {
    expect(buildCostSheetCsv(COST.cost, COPY)).toBe(
      [
        'Component,Name,Type,Quantity,UoM,Cost/kg,Line cost',
        'RM1001,Pork,RM,1.000000,kg,12.0000,12.0000',
        'RM2002,Salt,RM,0.020000,kg,,',
        'Total,,,,,,15.0000',
      ].join('\r\n'),
    );
  });

  it('enables Export once a cost is loaded and downloads cost-sheet-<code>.csv', async () => {
    getRecipeCost.mockResolvedValue(COST);
    const createObjectURL = vi.fn(() => 'blob:cost');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    render(<RecipeCostClient products={PRODUCTS} copy={COPY} />);
    const btn = await screen.findByTestId('technical-cost-export');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['cost-sheet-FG5101.csv']);
    vi.restoreAllMocks();
  });
});

// Phase-3 (Lane 16) — NPD↔Technical shortcut: "See NPD costing →" link.
describe('RecipeCostClient — NPD costing shortcut (Phase-3)', () => {
  it('renders "See NPD costing →" → /pipeline/<id>/costing when the selected product maps to an NPD project', async () => {
    getRecipeCost.mockResolvedValue(COST);
    const products: CostedProductOption[] = [
      { productCode: 'FG5101', name: 'Sausage', bomVersion: 7, bomStatus: 'active', npdProjectId: 'c5cf521b-aaaa-bbbb-cccc-ddddeeeeffff' },
    ];
    render(<RecipeCostClient products={products} copy={COPY} />);
    await waitFor(() => expect(getRecipeCost).toHaveBeenCalledWith('FG5101'));

    const link = await screen.findByTestId('technical-cost-npd-link');
    expect(link).toHaveTextContent('See NPD costing →');
    expect(link).toHaveAttribute('href', '/pipeline/c5cf521b-aaaa-bbbb-cccc-ddddeeeeffff/costing');
  });

  it('omits the link when the selected product has no NPD project mapping', async () => {
    getRecipeCost.mockResolvedValue(COST);
    // PRODUCTS has no npdProjectId — link must not render.
    render(<RecipeCostClient products={PRODUCTS} copy={COPY} />);
    await waitFor(() => expect(getRecipeCost).toHaveBeenCalledWith('FG5101'));
    expect(screen.queryByTestId('technical-cost-npd-link')).not.toBeInTheDocument();
  });
});
