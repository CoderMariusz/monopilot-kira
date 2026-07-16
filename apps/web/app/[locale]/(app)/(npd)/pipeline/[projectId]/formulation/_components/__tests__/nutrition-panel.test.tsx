/**
 * @vitest-environment jsdom
 * T-113 — NutritionPanel component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:26-65 (NutritionPanel)
 *   prototype-index entry: nutrition_panel (_meta/prototype-labels/prototype-index-npd.json)
 *
 * Asserts:
 *  - Parity structure: Card header ("Nutrition per 100g" + live note + Export label button),
 *    7 nutrient rows (Energy/Fat/Saturates/Carbs/Sugars/Protein/Salt) each with a label,
 *    traffic-light progress bar (green ≤ target / amber > target ≤ max / red > max) and a
 *    per-100g value + unit; CardFooter targets note.
 *  - shadcn/@monopilot-ui primitives (Card/CardHeader/CardFooter/Button); no raw <select>.
 *  - a11y: traffic-light status is NEVER color-only — each bar exposes role="progressbar"
 *    with aria-valuenow/min/max and a text status label (Within target / Over target / Over max).
 *  - Reactive rerender: a new `nutrition` prop updates the rendered values + bar status in place.
 *  - The five required UI states (ready / loading / empty / error / permission_denied).
 *  - NUMERIC-exact: values are rendered verbatim from the string props (no float reformat).
 *  - i18n: component renders LABELS (message values), never inline English literals.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NutritionPanel,
  NUTRIENT_ROW_ORDER,
  type NutritionPanelLabels,
  type NutritionRow,
  type NutritionTargets,
} from '../nutrition-panel';

const LABELS: NutritionPanelLabels = {
  title: 'lbl.title',
  liveNote: 'lbl.live',
  exportLabel: 'lbl.export',
  exportLabelComingSoon: 'lbl.exportComingSoon',
  targetsNote: 'Targets: Protein ≥ {protein} · Salt ≤ {salt} · Fat ≤ {fat} per 100g',
  withinTarget: 'Within target',
  overTarget: 'Over target',
  overMax: 'Over max',
  energyLabel: 'Energy',
  fatLabel: 'Fat',
  saturatesLabel: 'Saturates',
  carbsLabel: 'Carbs',
  sugarsLabel: 'Sugars',
  proteinLabel: 'Protein',
  saltLabel: 'Salt',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
};

// Real compute shape (per-100g NUMERIC strings keyed by domain nutrient code).
function rows(over = false): NutritionRow[] {
  return [
    { nutrientCode: 'energy_kj', per100g: '510.00', unit: 'kJ' },
    { nutrientCode: 'fat_g', per100g: over ? '14.00' : '6.50', unit: 'g' },
    { nutrientCode: 'saturates_g', per100g: '2.50', unit: 'g' },
    { nutrientCode: 'carbs_g', per100g: '1.80', unit: 'g' },
    { nutrientCode: 'sugars_g', per100g: '0.90', unit: 'g' },
    { nutrientCode: 'protein_g', per100g: '20.40', unit: 'g' },
    { nutrientCode: 'salt_g', per100g: '1.10', unit: 'g' },
  ];
}

// Reference thresholds (target = amber boundary, max = red boundary), NUMERIC strings.
const TARGETS: NutritionTargets = {
  energy_kj: { target: '630', max: '750' },
  fat_g: { target: '8', max: '12' },
  saturates_g: { target: '3', max: '4' },
  carbs_g: { target: '2', max: '3' },
  sugars_g: { target: '1', max: '2' },
  protein_g: { target: '18', max: '25' },
  salt_g: { target: '2', max: '2.5' },
};

afterEach(() => cleanup());

describe('T-113 NutritionPanel — parity', () => {
  it('renders the Card header with title, live note and Export label button', () => {
    render(<NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="ready" />);
    expect(screen.getByText('lbl.title')).toBeInTheDocument();
    expect(screen.getByText('lbl.live')).toBeInTheDocument();
    const exportBtn = screen.getByRole('button', { name: 'lbl.export' });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toBeDisabled();
    expect(exportBtn).toHaveAttribute('title', 'lbl.exportComingSoon');
  });

  it('calls onExportLabel when a handler is provided', () => {
    const onExportLabel = vi.fn();
    render(
      <NutritionPanel
        nutrition={rows()}
        targets={TARGETS}
        labels={LABELS}
        state="ready"
        onExportLabel={onExportLabel}
      />,
    );
    const exportBtn = screen.getByRole('button', { name: 'lbl.export' });
    expect(exportBtn).not.toBeDisabled();
    exportBtn.click();
    expect(onExportLabel).toHaveBeenCalledTimes(1);
  });

  it('renders 7 nutrient rows in prototype order with value + unit', () => {
    render(<NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="ready" />);
    const allRows = screen.getAllByTestId('nutrition-row');
    expect(allRows).toHaveLength(7);
    expect(NUTRIENT_ROW_ORDER).toEqual([
      'energy_kj',
      'fat_g',
      'saturates_g',
      'carbs_g',
      'sugars_g',
      'protein_g',
      'salt_g',
    ]);
    // Energy row renders exact string value + unit (NUMERIC-exact, no float reformat).
    const energy = allRows[0];
    expect(within(energy).getByText('Energy')).toBeInTheDocument();
    expect(within(energy).getByText(/510\.00\s*kJ/)).toBeInTheDocument();
  });

  it('assigns traffic-light status per value with role=progressbar (color is never the only signal)', () => {
    render(<NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="ready" />);
    const fatRow = screen.getAllByTestId('nutrition-row')[1];
    const bar = within(fatRow).getByRole('progressbar');
    // 6.50 ≤ target(8) → green / within
    expect(bar).toHaveAttribute('data-status', 'green');
    expect(bar).toHaveAttribute('aria-valuenow', '6.5');
    expect(within(fatRow).getByText('Within target')).toBeInTheDocument();
  });

  it('shows amber when value > target and ≤ max', () => {
    const amber: NutritionRow[] = rows().map((r) =>
      r.nutrientCode === 'fat_g' ? { ...r, per100g: '10.00' } : r,
    );
    render(<NutritionPanel nutrition={amber} targets={TARGETS} labels={LABELS} state="ready" />);
    const fatRow = screen.getAllByTestId('nutrition-row')[1];
    const bar = within(fatRow).getByRole('progressbar');
    expect(bar).toHaveAttribute('data-status', 'amber');
    expect(within(fatRow).getByText('Over target')).toBeInTheDocument();
  });

  it('shows red when value > max', () => {
    render(<NutritionPanel nutrition={rows(true)} targets={TARGETS} labels={LABELS} state="ready" />);
    const fatRow = screen.getAllByTestId('nutrition-row')[1];
    const bar = within(fatRow).getByRole('progressbar');
    expect(bar).toHaveAttribute('data-status', 'red'); // 14 > max(12)
    expect(within(fatRow).getByText('Over max')).toBeInTheDocument();
  });

  it('renders a CardFooter targets note', () => {
    render(<NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="ready" />);
    expect(screen.getByTestId('nutrition-targets-note')).toBeInTheDocument();
  });

  it('updates reactively when the nutrition prop changes (rerender)', () => {
    const { rerender } = render(
      <NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="ready" />,
    );
    let fatRow = screen.getAllByTestId('nutrition-row')[1];
    expect(within(fatRow).getByRole('progressbar')).toHaveAttribute('data-status', 'green');

    rerender(<NutritionPanel nutrition={rows(true)} targets={TARGETS} labels={LABELS} state="ready" />);
    fatRow = screen.getAllByTestId('nutrition-row')[1];
    expect(within(fatRow).getByRole('progressbar')).toHaveAttribute('data-status', 'red');
    expect(within(fatRow).getByText(/14\.00\s*g/)).toBeInTheDocument();
  });
});

describe('T-113 NutritionPanel — required UI states', () => {
  it('loading', () => {
    render(<NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="loading" />);
    expect(screen.getByTestId('nutrition-panel-loading')).toBeInTheDocument();
    expect(screen.getByText('lbl.loading')).toBeInTheDocument();
  });

  it('empty', () => {
    render(<NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="ready" />);
    expect(screen.getByText('lbl.empty')).toBeInTheDocument();
  });

  it('error', () => {
    render(<NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="error" />);
    expect(screen.getByTestId('nutrition-panel-error')).toBeInTheDocument();
    expect(screen.getByText('lbl.error')).toBeInTheDocument();
  });

  it('permission-denied', () => {
    render(
      <NutritionPanel nutrition={rows()} targets={TARGETS} labels={LABELS} state="permission_denied" />,
    );
    expect(screen.getByTestId('nutrition-panel-forbidden')).toBeInTheDocument();
    expect(screen.getByText('lbl.forbidden')).toBeInTheDocument();
  });
});
