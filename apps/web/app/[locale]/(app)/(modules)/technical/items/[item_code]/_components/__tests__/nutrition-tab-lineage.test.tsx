/**
 * @vitest-environment jsdom
 *
 * C032 — FG nutrition lineage must not claim BOM when values come from the
 * materialized NPD nutrition_profiles read model.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { NutritionTab } from '../nutrition-tab.client';
import { DEFAULT_NUTRITION_LABELS } from '../nutrition-labels';

afterEach(() => {
  cleanup();
});

describe('NutritionTab — readonly lineage (C032)', () => {
  it('shows NPD materialized provenance instead of BOM lineage', () => {
    render(
      <NutritionTab
        mode="readonly"
        state="ready"
        itemCode="FG-019"
        canEdit={false}
        labels={DEFAULT_NUTRITION_LABELS}
        readonlyData={{
          productName: 'FG-019',
          computedAt: '2026-07-14T12:00:00Z',
          macros: [
            { nutrientCode: 'energy_kj', displayName: 'Energy', unit: 'kJ', per100g: '758.80', perPortion: '758.80' },
          ],
          allergens: [],
        }}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('materialized NPD nutrition model');
    expect(screen.getByRole('note')).not.toHaveTextContent('BOM');
  });

  it('default labels describe NPD materialization, not BOM', () => {
    expect(DEFAULT_NUTRITION_LABELS.computedNote).toContain('NPD');
    expect(DEFAULT_NUTRITION_LABELS.computedNote).not.toContain('BOM');
    expect(DEFAULT_NUTRITION_LABELS.computedNoteNoDate).toContain('NPD');
    expect(DEFAULT_NUTRITION_LABELS.computedNoteNoDate).not.toContain('BOM');
  });
});
