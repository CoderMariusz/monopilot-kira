/**
 * @vitest-environment jsdom
 *
 * L5 — ItemOverviewTab effective cost display.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ItemOverviewTab, type ItemOverviewLabels } from '../item-overview-tab';
import type { ItemDetail } from '../../../_actions/get-item';

const baseItem: ItemDetail = {
  id: '1',
  itemCode: 'FG-001',
  name: 'Smoked salmon',
  itemType: 'fg',
  status: 'active',
  description: null,
  productGroup: null,
  uomBase: 'kg',
  uomSecondary: null,
  gs1Gtin: null,
  weightMode: 'fixed',
  nominalWeight: null,
  tareWeight: null,
  grossWeightMax: null,
  varianceTolerancePct: null,
  shelfLifeDays: null,
  shelfLifeMode: null,
  outputUom: 'box',
  netQtyPerEach: '0.300',
  eachPerBox: 12,
  boxesPerPallet: null,
  costPerKg: '4.50',
  listPriceGbp: '12.20',
  effectiveCostAmount: '4.8200',
  effectiveCostCurrency: 'GBP',
  effectiveCostSource: 'cost_history',
  updatedAt: '2026-07-05T00:00:00.000Z',
};

const labels: ItemOverviewLabels = {
  identification: 'Identification',
  commercial: 'Commercial',
  code: 'Code',
  name: 'Name',
  type: 'Type',
  status: 'Status',
  uomBase: 'Base UoM',
  uomSecondary: 'Secondary UoM',
  productGroup: 'Product group',
  description: 'Description',
  weightMode: 'Weight mode',
  nominalWeight: 'Nominal weight',
  tareWeight: 'Tare weight',
  grossWeightMax: 'Gross weight max',
  gs1Gtin: 'GS1 GTIN',
  varianceTolerance: 'Variance tolerance',
  shelfLife: 'Shelf life',
  effectiveCost: 'Effective cost',
  costPerKg: 'Stored cost / kg',
  listPrice: 'List price',
  updated: 'Updated',
  none: '—',
  outputUom: 'Output unit',
  netQtyPerEach: 'Net content',
  eachPerBox: 'Each per box',
  boxesPerPallet: 'Boxes per pallet',
  packHierarchy: 'Pack hierarchy',
  outputUomLabels: { base: 'Base', each: 'Each', box: 'Box' },
};

afterEach(cleanup);

describe('ItemOverviewTab — effective cost', () => {
  it('shows effective cost with source tier and keeps raw cost_per_kg', () => {
    render(<ItemOverviewTab item={baseItem} labels={labels} />);

    expect(screen.getByText('Effective cost')).toBeInTheDocument();
    expect(screen.getByText('4.82 GBP (Cost history)')).toBeInTheDocument();
    expect(screen.getByText('Stored cost / kg')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('renders em dash when effective cost is absent', () => {
    render(
      <ItemOverviewTab
        item={{ ...baseItem, effectiveCostAmount: null, effectiveCostCurrency: null, effectiveCostSource: null }}
        labels={labels}
      />,
    );

    const effectiveRow = screen.getByText('Effective cost').closest('div');
    expect(effectiveRow).toHaveTextContent('—');
  });
});
