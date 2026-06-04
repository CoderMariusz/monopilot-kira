/**
 * @vitest-environment jsdom
 * T-074 — NutritionScreen (nutrition_screen prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:4-80 (NutritionScreen)
 *
 * RED → GREEN: asserts the parity checklist (7-row canonical nutrient table,
 * traffic-light status WITH text — never color alone, Nutri-Score A-E grade
 * card + active letter, allergen declaration card), the four required UI states
 * (loading / empty / populated / error), i18n-key resolution (defaults never
 * leak), and the read-only Export CSV / disabled PDF stub contract.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  NutritionScreen,
  type NutritionLabels,
  type NutritionRow,
  type NutritionScreenData,
} from '../nutrition-screen';

afterEach(() => cleanup());

// Canonical 7-row order per §17.11.2 / Reference.Nutrients display_order.
const ROWS: NutritionRow[] = [
  { nutrientCode: 'energy_kj', label: 'Energy', unit: 'kJ', per100g: '595', perPortion: '298', status: 'ok' },
  { nutrientCode: 'fat_g', label: 'Fat', unit: 'g', per100g: '6.2', perPortion: '3.1', status: 'ok' },
  { nutrientCode: 'saturates_g', label: 'Saturates', unit: 'g', per100g: '2.1', perPortion: '1.1', status: 'ok' },
  { nutrientCode: 'carbs_g', label: 'Carbohydrate', unit: 'g', per100g: '1.1', perPortion: '0.6', status: 'ok' },
  { nutrientCode: 'sugars_g', label: 'Sugars', unit: 'g', per100g: '0.5', perPortion: '0.3', status: 'ok' },
  { nutrientCode: 'protein_g', label: 'Protein', unit: 'g', per100g: '19.6', perPortion: '9.8', status: 'ok' },
  { nutrientCode: 'salt_g', label: 'Salt', unit: 'g', per100g: '2.0', perPortion: '1.0', status: 'warn' },
];

const LABELS: NutritionLabels = {
  title: 'Nutrition declaration (per 100g)',
  subtitle: 'Computed per-100g + per-portion values',
  exportCsv: 'Export CSV',
  generateLabel: 'Generate label PDF',
  generateLabelDisabledHint: 'Label PDF export is not yet available',
  colNutrient: 'Nutrient',
  colPer100g: 'Per 100g',
  colPerPortion: 'Per portion',
  colStatus: 'Status',
  statusOk: 'OK',
  statusWarn: 'At limit',
  allergenTitle: 'Allergen declaration',
  allergenColAllergen: 'Allergen',
  allergenColSource: 'Source ingredient',
  allergenColPresence: 'Presence',
  presenceContains: 'Contains',
  presenceMayContain: 'May contain',
  presenceFreeFrom: 'Free from',
  presenceUnknown: 'Unknown',
  allergenEmpty: 'No allergens declared',
  nutriScoreTitle: 'Nutri-Score',
  nutriScoreGradeLabel: 'Nutri-Score grade {grade}',
  loading: 'Loading nutrition data…',
  empty: 'No nutrition data yet',
  emptyBody: 'Nutrition values are computed once the formulation is complete.',
  error: 'Unable to load nutrition data.',
  forbidden: 'You do not have permission to view nutrition data.',
};

const DATA: NutritionScreenData = {
  productCode: 'FA1001',
  rows: ROWS,
  grade: 'C',
  allergens: [
    { allergenCode: 'soy', sourceIngredient: 'Soy Protein Isolate (RM-3501)', presence: 'contains' },
    { allergenCode: 'milk', sourceIngredient: null, presence: 'may_contain' },
  ],
};

function renderReady() {
  return render(<NutritionScreen state="ready" data={DATA} labels={LABELS} />);
}

describe('NutritionScreen — parity', () => {
  it('renders the 7-row nutrient table in canonical order', () => {
    renderReady();
    const table = screen.getByTestId('nutrition-table');
    const bodyRows = within(table).getAllByTestId('nutrition-row');
    expect(bodyRows).toHaveLength(7);
    const labelsInOrder = bodyRows.map((r) => within(r).getByTestId('nutrient-label').textContent);
    expect(labelsInOrder).toEqual([
      'Energy',
      'Fat',
      'Saturates',
      'Carbohydrate',
      'Sugars',
      'Protein',
      'Salt',
    ]);
  });

  it('shows per-100g AND per-portion columns', () => {
    renderReady();
    const table = screen.getByTestId('nutrition-table');
    expect(within(table).getByText(LABELS.colPer100g)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.colPerPortion)).toBeInTheDocument();
    const energy = within(table).getAllByTestId('nutrition-row')[0];
    expect(within(energy).getByText(/595/)).toBeInTheDocument();
    expect(within(energy).getByText(/298/)).toBeInTheDocument();
  });

  it('traffic-light status is never color-only — text label present', () => {
    renderReady();
    const table = screen.getByTestId('nutrition-table');
    const salt = within(table).getAllByTestId('nutrition-row')[6];
    // Warn row must carry the literal "At limit" text, not just a color.
    expect(within(salt).getByText(LABELS.statusWarn)).toBeInTheDocument();
    const energy = within(table).getAllByTestId('nutrition-row')[0];
    expect(within(energy).getByText(LABELS.statusOk)).toBeInTheDocument();
  });

  it('renders the Nutri-Score A-E scale with the active grade marked', () => {
    renderReady();
    const card = screen.getByTestId('nutri-score-card');
    // All five grades present.
    ['A', 'B', 'C', 'D', 'E'].forEach((g) => {
      expect(within(card).getByTestId(`nutri-grade-${g}`)).toBeInTheDocument();
    });
    const active = within(card).getByTestId('nutri-grade-C');
    expect(active).toHaveAttribute('data-active', 'true');
    // Accessible grade announcement (color is not the sole signal).
    expect(within(card).getByText('Nutri-Score grade C')).toBeInTheDocument();
  });

  it('renders the allergen declaration card with rows', () => {
    renderReady();
    const card = screen.getByTestId('allergen-card');
    const rows = within(card).getAllByTestId('allergen-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(LABELS.presenceContains)).toBeInTheDocument();
    expect(within(rows[1]).getByText(LABELS.presenceMayContain)).toBeInTheDocument();
  });

  it('Export CSV is enabled; Generate label PDF is disabled (Phase C4 deferred)', () => {
    renderReady();
    const csv = screen.getByRole('button', { name: LABELS.exportCsv });
    expect(csv).toBeEnabled();
    const pdf = screen.getByRole('button', { name: LABELS.generateLabel });
    expect(pdf).toBeDisabled();
  });
});

describe('NutritionScreen — required states', () => {
  it('loading shows a live status region', () => {
    render(<NutritionScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
    expect(screen.queryByTestId('nutrition-table')).not.toBeInTheDocument();
  });

  it('empty shows the empty-state copy', () => {
    render(<NutritionScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.queryByTestId('nutrition-table')).not.toBeInTheDocument();
  });

  it('error shows an alert with the i18n error copy', () => {
    render(<NutritionScreen state="error" data={null} labels={LABELS} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied hides the table and shows forbidden copy', () => {
    render(<NutritionScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
    expect(screen.queryByTestId('nutrition-table')).not.toBeInTheDocument();
  });
});

describe('NutritionScreen — i18n', () => {
  it('renders only provided label strings (no default leak)', () => {
    renderReady();
    expect(screen.getByText(LABELS.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.allergenTitle)).toBeInTheDocument();
  });
});
