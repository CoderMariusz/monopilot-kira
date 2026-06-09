/**
 * @vitest-environment jsdom
 * T-074 — NutritionScreen parity evidence harness (RTL/DOM-snapshot fallback).
 *
 * Playwright happy-path capture needs a running Next server + Supabase auth +
 * seeded nutrition rows (the module-level Gate-5 live-deploy verification). At
 * the component-task layer that stack is unavailable, so — per T-074 AC4
 * ("if Playwright is unavailable, document the blocker and provide RTL/snapshot
 * fallback evidence") — this harness renders every required UI state and writes
 * the resulting DOM to apps/web/e2e/parity-evidence/npd/T-074/<state>.html.
 *
 * These artifacts are the parity diff source (prototype other-stages.jsx:4-80
 * → production DOM) and the per-state evidence (loading/empty/populated/error/
 * permission-denied).
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));


import {
  NutritionScreen,
  type NutritionLabels,
  type NutritionScreenData,
  type PageState,
} from '../nutrition-screen';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-074');

const LABELS: NutritionLabels = {
  title: 'Nutrition declaration (per 100g)',
  subtitle: 'Computed per-100g + per-portion values',
  exportCsv: 'Export CSV',
  generateLabel: 'Generate label PDF',
  generateLabelDisabledHint: 'Label PDF export is not yet available (deferred)',
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
  computeNutriScore: 'Compute NutriScore',
  recomputeNutriScore: 'Recompute NutriScore',
  computing: 'Computing…',
  computeError: 'Could not compute the NutriScore. Try again.',
  computeErrorNotFound: 'No formulation is available to compute from yet.',
};

const DATA: NutritionScreenData = {
  productCode: 'FA1001',
  rows: [
    { nutrientCode: 'energy_kj', label: 'Energy', unit: 'kJ', per100g: '595', perPortion: '298', status: 'ok' },
    { nutrientCode: 'fat_g', label: 'Fat', unit: 'g', per100g: '6.2', perPortion: '3.1', status: 'ok' },
    { nutrientCode: 'saturates_g', label: 'Saturates', unit: 'g', per100g: '2.1', perPortion: '1.1', status: 'ok' },
    { nutrientCode: 'carbs_g', label: 'Carbohydrate', unit: 'g', per100g: '1.1', perPortion: '0.6', status: 'ok' },
    { nutrientCode: 'sugars_g', label: 'Sugars', unit: 'g', per100g: '0.5', perPortion: '0.3', status: 'ok' },
    { nutrientCode: 'protein_g', label: 'Protein', unit: 'g', per100g: '19.6', perPortion: '9.8', status: 'ok' },
    { nutrientCode: 'salt_g', label: 'Salt', unit: 'g', per100g: '2.0', perPortion: '1.0', status: 'warn' },
  ],
  grade: 'C',
  allergens: [
    { allergenCode: 'soy', sourceIngredient: 'Soy Protein Isolate (RM-3501)', presence: 'contains' },
    { allergenCode: 'milk', sourceIngredient: null, presence: 'may_contain' },
  ],
};

function write(state: string, html: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${state}.html`), html, 'utf8');
}

describe('NutritionScreen — parity evidence capture', () => {
  const cases: Array<{ state: PageState; data: NutritionScreenData | null }> = [
    { state: 'loading', data: null },
    { state: 'empty', data: null },
    { state: 'ready', data: DATA },
    { state: 'error', data: null },
    { state: 'permission_denied', data: null },
  ];

  it.each(cases)('captures DOM for state=$state', ({ state, data }) => {
    const { container } = render(<NutritionScreen state={state} data={data} labels={LABELS} />);
    write(state === 'ready' ? 'populated' : state, container.innerHTML);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
