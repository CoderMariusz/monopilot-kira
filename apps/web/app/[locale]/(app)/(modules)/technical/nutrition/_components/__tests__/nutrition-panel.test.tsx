/**
 * @vitest-environment jsdom
 *
 * 03-technical Nutrition panel (TEC-012) RTL — real component, mocked action.
 *
 * Prototype anchor (verified `wc -l` other-screens.jsx = 1659):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:480-535
 *   (NutritionScreen) — Macronutrients table + "Allergens (14 EU declared)" table.
 *
 * Parity + states asserted:
 *   - product picker (shadcn Select, not raw <select>) drives getNutritionPanel.
 *   - macros render NUMERIC strings verbatim (no float) with unit + regulation.
 *   - allergen presence renders the semantic badge label (contains/may_contain).
 *   - loading skeleton → ready; load error → alert; empty allergens/macros copy.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getNutritionPanel = vi.fn();
vi.mock('../../_actions/list-nutrition', () => ({
  getNutritionPanel: (...a: unknown[]) => getNutritionPanel(...a),
}));

import { NutritionPanelClient, type NutritionCopy } from '../nutrition-panel.client';
import type { NutritionProductOption } from '../../_actions/shared';

const PRODUCTS: NutritionProductOption[] = [
  { productCode: 'FG5101', productName: 'Kiełbasa śląska 450g' },
];

const COPY: NutritionCopy = {
  selectLabel: 'Product',
  selectPlaceholder: 'Select…',
  macrosTitle: 'Macronutrients',
  per100g: 'per 100 g',
  perPortion: 'per portion',
  regulation: 'Regulation',
  nutrient: 'Nutrient',
  allergensTitle: 'Allergens (14 EU declared)',
  allergen: 'Allergen',
  presenceCol: 'Presence',
  presence: { contains: 'Contains', may_contain: 'May contain', free_from: 'Free from', unknown: 'Unknown' },
  noAllergens: 'No allergens',
  noMacros: 'No macros',
  computedNote: 'Recomputed {when}',
  computedNoteNoDate: 'Materialized',
  loading: 'Loading',
  loadError: 'Could not load',
  selectPrompt: 'Pick a product',
  openNpdProject: 'Open NPD project →',
};

const PANEL = {
  ok: true as const,
  state: 'ready' as const,
  panel: {
    productCode: 'FG5101',
    productName: 'Kiełbasa śląska 450g',
    computedAt: '2026-04-14T08:00:00.000Z',
    macros: [
      { nutrientCode: 'fat_g', displayName: 'Fat', unit: 'g', displayOrder: 2, per100g: '23.4000', perPortion: '10.5300', regulation: 'EU FIC 1169/2011' },
    ],
    allergens: [
      { allergenCode: 'milk', name: 'Milk', presence: 'contains' as const },
      { allergenCode: 'gluten', name: 'Gluten', presence: 'may_contain' as const },
    ],
  },
};

afterEach(() => {
  cleanup();
  getNutritionPanel.mockReset();
});

describe('NutritionPanelClient (TEC-012)', () => {
  it('rolls up the selected product panel: macros verbatim + allergen presence badges', async () => {
    getNutritionPanel.mockResolvedValue(PANEL);
    render(<NutritionPanelClient products={PRODUCTS} copy={COPY} />);

    await waitFor(() => expect(getNutritionPanel).toHaveBeenCalledWith('FG5101'));

    // Macro value is the VERBATIM NUMERIC string (no float rounding) + unit.
    // The value + unit are separate text nodes in one cell → match the td node.
    expect(
      await screen.findByText(
        (_content, el) =>
          el?.tagName === 'TD' && el.textContent?.replace(/\s+/g, ' ').trim() === '23.4000 g',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('EU FIC 1169/2011')).toBeInTheDocument();
    // Allergen presence labels from the 5-tone badge set.
    expect(screen.getByText('Contains')).toBeInTheDocument();
    expect(screen.getByText('May contain')).toBeInTheDocument();
  });

  it('renders the error alert when the panel read fails', async () => {
    getNutritionPanel.mockResolvedValue({ ok: false, state: 'error' });
    render(<NutritionPanelClient products={PRODUCTS} copy={COPY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  });

  it('shows the empty prompt when no product is selected', () => {
    render(<NutritionPanelClient products={[]} copy={COPY} />);
    expect(screen.getByText('Pick a product')).toBeInTheDocument();
  });
});

// Phase-3 (Lane 16) — NPD↔Technical shortcut: "Open NPD project →" link.
describe('NutritionPanelClient — NPD project shortcut (Phase-3)', () => {
  it('renders "Open NPD project →" → /pipeline/<id> when the selected product maps to an NPD project', async () => {
    getNutritionPanel.mockResolvedValue(PANEL);
    const products: NutritionProductOption[] = [
      { productCode: 'FG5101', productName: 'Kiełbasa śląska 450g', npdProjectId: 'c5cf521b-aaaa-bbbb-cccc-ddddeeeeffff' },
    ];
    render(<NutritionPanelClient products={products} copy={COPY} />);
    await waitFor(() => expect(getNutritionPanel).toHaveBeenCalledWith('FG5101'));

    const link = await screen.findByTestId('technical-nutrition-npd-link');
    expect(link).toHaveTextContent('Open NPD project →');
    expect(link).toHaveAttribute('href', '/pipeline/c5cf521b-aaaa-bbbb-cccc-ddddeeeeffff');
  });

  it('omits the link when the selected product has no NPD project mapping', async () => {
    getNutritionPanel.mockResolvedValue(PANEL);
    render(<NutritionPanelClient products={PRODUCTS} copy={COPY} />);
    await waitFor(() => expect(getNutritionPanel).toHaveBeenCalledWith('FG5101'));
    expect(screen.queryByTestId('technical-nutrition-npd-link')).not.toBeInTheDocument();
  });
});
