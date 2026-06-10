/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — Item Detail Nutrition tab RTL: the 3 modes + the save payload.
 *
 * Spec-driven (no dedicated JSX prototype for the per-item nutrition editor;
 * nearest reusable pattern = the allergens-tab edit shell, allergens-tab.client.tsx,
 * itself anchored to modals.jsx:309-347, and the read-only FG panel mirrors
 * other-screens.jsx:480-535 NutritionScreen). prototype_match:false documented in
 * the lane report deviation log.
 *
 * Asserts:
 *   - mode 'edit' (rm/ingredient/intermediate): the 7 per-100 g fields + EU-14
 *     multi-pick render; Save sends the exact { itemCode, nutrition, allergensInherited }
 *     payload with A01..A14 codes.
 *   - mode 'readonly' (fg): the computed panel renders read-only, no Save button.
 *   - mode 'na' (packaging/co_product/byproduct): the "not applicable" empty state.
 *   - states: loading / error / permission_denied.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { NutritionTab, type NutritionTabLabels } from '../nutrition-tab.client';
import { DEFAULT_NUTRITION_LABELS } from '../nutrition-labels';

const L: NutritionTabLabels = DEFAULT_NUTRITION_LABELS;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NutritionTab — edit mode (rm/ingredient/intermediate)', () => {
  it('renders the 7 nutrient fields + EU-14 allergen checkboxes', () => {
    render(
      <NutritionTab mode="edit" state="ready" itemCode="RM-1" canEdit labels={L} editData={null} />,
    );
    for (const field of ['energy_kj', 'fat_g', 'saturates_g', 'carbs_g', 'sugars_g', 'protein_g', 'salt_g']) {
      expect(screen.getByTestId(`nutr-${field}`)).toBeInTheDocument();
    }
    // EU-14 → 14 allergen checkboxes A01..A14.
    expect(screen.getByTestId('allergen-A01')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-A14')).toBeInTheDocument();
  });

  it('Save sends the exact payload with A01..A14 codes', async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn().mockResolvedValue({ ok: true });
    render(
      <NutritionTab
        mode="edit"
        state="ready"
        itemCode="RM-1"
        canEdit
        labels={L}
        editData={null}
        saveAction={saveAction}
      />,
    );

    // Fill all 7 (Save is gated on all-filled).
    const values: Record<string, string> = {
      energy_kj: '1500',
      fat_g: '10',
      saturates_g: '4',
      carbs_g: '20',
      sugars_g: '2',
      protein_g: '12',
      salt_g: '1.2',
    };
    for (const [field, v] of Object.entries(values)) {
      await user.type(screen.getByTestId(`nutr-${field}`), v);
    }
    // Pick a couple of inherited allergens.
    await user.click(screen.getByTestId('allergen-A01'));
    await user.click(screen.getByTestId('allergen-A07'));

    await user.click(screen.getByTestId('nutrition-save'));

    expect(saveAction).toHaveBeenCalledTimes(1);
    expect(saveAction).toHaveBeenCalledWith({
      itemCode: 'RM-1',
      nutrition: {
        energy_kj: '1500',
        fat_g: '10',
        saturates_g: '4',
        carbs_g: '20',
        sugars_g: '2',
        protein_g: '12',
        salt_g: '1.2',
      },
      allergensInherited: ['A01', 'A07'],
    });
  });

  it('disables Save until every nutrient field is filled', () => {
    render(
      <NutritionTab mode="edit" state="ready" itemCode="RM-1" canEdit labels={L} editData={null} />,
    );
    expect(screen.getByTestId('nutrition-save')).toBeDisabled();
  });
});

describe('NutritionTab — readonly mode (fg)', () => {
  it('renders a read-only computed panel with no Save button', () => {
    render(
      <NutritionTab
        mode="readonly"
        state="ready"
        itemCode="FG-1"
        canEdit={false}
        labels={L}
        readonlyData={{
          productName: 'Sausage',
          computedAt: '2026-06-01T00:00:00Z',
          macros: [
            { nutrientCode: 'energy_kj', displayName: 'Energy', unit: 'kJ', per100g: '1500', perPortion: '750' },
          ],
          allergens: [{ code: 'A07', name: 'Milk', presence: 'contains' }],
        }}
      />,
    );
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.queryByTestId('nutrition-save')).not.toBeInTheDocument();
  });
});

describe('NutritionTab — na mode (packaging/co_product/byproduct)', () => {
  it('renders the not-applicable empty state', () => {
    render(<NutritionTab mode="na" state="empty" itemCode="PM-1" canEdit={false} labels={L} />);
    expect(screen.getByText(L.notApplicable)).toBeInTheDocument();
    expect(screen.queryByTestId('nutrition-save')).not.toBeInTheDocument();
  });
});

describe('NutritionTab — UI states', () => {
  it('loading', () => {
    render(<NutritionTab mode="edit" state="loading" itemCode="RM-1" canEdit labels={L} />);
    expect(screen.getByTestId('nutrition-tab')).toHaveAttribute('data-state', 'loading');
  });
  it('error', () => {
    render(<NutritionTab mode="edit" state="error" itemCode="RM-1" canEdit labels={L} />);
    expect(screen.getByRole('alert')).toHaveTextContent(L.error);
  });
  it('permission_denied', () => {
    render(<NutritionTab mode="edit" state="permission_denied" itemCode="RM-1" canEdit={false} labels={L} />);
    expect(screen.getByRole('alert')).toHaveTextContent(L.forbidden);
  });
});
