/**
 * @vitest-environment jsdom
 * W9-L4 — F-A06/F-A08 + F-B05 editor rendering of SSOT-derived data.
 *
 * The page now threads the FULL server-derived allergen array (`allergens`,
 * resolved from item_allergen_profiles) and the joined per-100g nutrition
 * (`nutritionPer100g`, from Reference.RawMaterials) per ingredient. Asserts:
 *   - the ingredient row renders ONE CHIP PER ALLERGEN — the full set, never
 *     the old single-badge `[0]` truncation (live false-negative: AUDIT2-RM1
 *     showed "Absent" while its profile carried mustard);
 *   - the AllergenPanel marks every derived allergen present and lists all of
 *     them in the declare-on-label alert; "Absent" cells only for codes truly
 *     not in the set;
 *   - the NutritionPanel is non-empty when ingredients carry joined nutrition;
 *   - legacy single-`allergen` fixtures still widen to a one-element array
 *     (back-compat input seam).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

const LABELS = {
  title: 'Recipe',
  subtitle: 'Live recipe editor.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save.',
  submitForTrial: 'Submit for trial',
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted',
  submitError: 'Submit failed.',
  submitErrorTotalPct: 'Total % out of range.',
  submitErrorMissingCost: 'Missing cost.',
  submitErrorMissingNutritionTarget: 'Missing nutrition target.',
  submitErrorNotDraft: 'Not a draft.',
  submitErrorLocked: 'Locked.',
  submitErrorForbidden: 'Forbidden.',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking…',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Freeze v{n}?',
  lockConfirmConfirm: 'Lock',
  lockConfirmCancel: 'Cancel',
  lockError: 'Lock failed.',
  lockErrorForbidden: 'No permission.',
  lockErrorLocked: 'Already locked.',
  lockErrorNotSubmitted: 'Not submitted.',
  lockErrorNotFound: 'Not found.',
  compareTitle: 'Compare',
  compareVersionA: 'A',
  compareVersionB: 'B',
  compareClose: 'Close',
  compareRun: 'Run',
  compareLoading: 'Loading…',
  compareError: 'Compare failed.',
  compareColIngredient: 'Ingredient',
  compareColVersionA: 'vA',
  compareColVersionB: 'vB',
  compareSamePick: 'Pick different versions.',
  compareNoChanges: 'No changes.',
  compareTruncated: 'Truncated.',
  compareStatusAdded: 'Added',
  compareStatusRemoved: 'Removed',
  compareStatusChanged: 'Changed',
  compareStatusUnchanged: 'Unchanged',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colQtyPerPack: 'Qty / pack (kg)',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  qtyBalanceWarning: 'Total {qty} vs pack {pack}.',
  packWeightUnsetHint: 'Set pack weight.',
  batchSizeHint: 'Batch = pack weight.',
  composition: 'Composition',
  qtyRangeError: 'Quantity must be non-negative.',
  rmCodeRequired: 'Ingredient code is required.',
  livePanels: 'Live calculations',
  livePanelsHint: 'Panels appear here.',
  costPanelTitle: 'Cost',
  nutritionPanelTitle: 'Nutrition',
  allergenPanelTitle: 'Allergens',
  panelPlaceholder: 'Computed on save.',
  loading: 'Loading…',
  empty: 'No draft yet',
  emptyBody: 'Create a draft.',
  createDraft: 'Create draft',
  creatingDraft: 'Creating…',
  createDraftError: 'Could not create the draft.',
  error: 'Unable to load.',
  forbidden: 'No permission.',
  locked: 'Locked.',
  noAllergen: '—',
  chooseItem: 'Choose item',
  openInTechnical: 'Open item in Technical',
  picker: {
    trigger: 'Pick item',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search…',
    loading: 'Searching…',
    empty: 'No matches',
    cancel: 'Cancel',
    error: 'Search failed',
  },
} as FormulationLabels;

const PANEL_LABELS: FormulationPanelLabels = {
  cost: {
    title: 'cost.title', live: 'live', rawMaterial: 'raw', afterYield: 'after {yieldPct}',
    processing: 'proc {overheadPct}', packaging: 'pkg', totalCost: 'total', perKgSuffix: '/kg',
    targetPrice: 'target', expectedYield: 'yield', revenuePerKg: 'rev', marginPerKg: 'm/kg',
    marginPct: 'm%', loading: 'l', empty: 'e', emptyBody: 'eb', error: 'er', forbidden: 'f',
  },
  nutrition: {
    title: 'nut.title', liveNote: 'live', exportLabel: 'export', targetsNote: 't {protein} {salt} {fat}',
    withinTarget: 'w', overTarget: 'o', overMax: 'om', energyLabel: 'Energy', fatLabel: 'Fat',
    saturatesLabel: 'Sat', carbsLabel: 'Carb', sugarsLabel: 'Sug', proteinLabel: 'Prot', saltLabel: 'Salt',
    loading: 'l', empty: 'e', emptyBody: 'eb', error: 'er', forbidden: 'f',
  },
  allergen: {
    title: 'al.title', subtitle: 'sub', present: 'P', trace: 'T', absent: 'A',
    detectedHeading: '{count} detected:', mustDeclare: 'Must be declared.', noneDetected: 'none',
    statusLabel: '{name}: {status}',
  },
  composition: {
    title: 'Composition',
    ariaLabel: 'Ingredient composition',
    empty: 'No ingredients to display.',
    segmentLabel: '{name}: {pct}%',
  },
};

const DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 1,
  state: 'draft',
  productCode: 'PRD-1',
  batchSizeKg: '0.200',
  packWeightG: '200',
  targetPriceEur: '4.00',
  targetYieldPct: '80',
  versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 1 }],
  ingredients: [
    {
      id: 'fi-1',
      rmCode: 'RM-1001',
      itemId: '66666666-6666-4666-8666-666666666666',
      name: 'Mustard blend',
      qtyKg: '0.200',
      pct: '100',
      costPerKgEur: '9.99',
      // F-A06/F-A08: full server-derived array (item_allergen_profiles).
      allergens: ['celery', 'mustard', 'sesame'],
      sequence: 1,
      // F-B05: joined from Reference.RawMaterials.nutrition_per_100g.
      nutritionPer100g: { energy_kj: '500', fat_g: '10', protein_g: '20', salt_g: '1.2' },
    },
  ],
};

function renderEditor(data: FormulationEditorData = DATA) {
  render(
    <FormulationEditor
      state="ready"
      data={data}
      labels={LABELS}
      panelLabels={PANEL_LABELS}
      canEdit
      saveDraftAction={vi.fn().mockResolvedValue({ ok: true, data: {} })}
    />,
  );
}

describe('FormulationEditor — F-A08 full allergen chips (no [0] truncation)', () => {
  it('renders ONE chip per derived allergen on the ingredient row', () => {
    renderEditor();
    const row = screen.getAllByTestId('ingredient-row')[0];
    const chips = within(row).getByTestId('ingredient-allergens');
    expect(within(chips).getByText('celery')).toBeInTheDocument();
    expect(within(chips).getByText('mustard')).toBeInTheDocument();
    expect(within(chips).getByText('sesame')).toBeInTheDocument();
  });

  it('marks every derived allergen present in the AllergenPanel and lists ALL in the declare alert', () => {
    renderEditor();
    expect(screen.getByTestId('allergen-cell-celery')).toHaveAttribute('data-status', 'present');
    expect(screen.getByTestId('allergen-cell-mustard')).toHaveAttribute('data-status', 'present');
    expect(screen.getByTestId('allergen-cell-sesame')).toHaveAttribute('data-status', 'present');
    // "Absent" ONLY for codes truly not in the resolved set.
    expect(screen.getByTestId('allergen-cell-gluten')).toHaveAttribute('data-status', 'absent');
    const alert = screen.getByTestId('allergen-panel-alert');
    expect(alert).toHaveTextContent('3 detected:');
    expect(alert).toHaveTextContent('celery, mustard, sesame');
  });

  it('widens a legacy single-`allergen` fixture to a one-element array (back-compat)', () => {
    renderEditor({
      ...DATA,
      ingredients: [
        { ...DATA.ingredients[0], allergens: undefined, allergen: 'mustard', nutritionPer100g: undefined },
      ],
    });
    const row = screen.getAllByTestId('ingredient-row')[0];
    expect(within(row).getByTestId('ingredient-allergens')).toHaveTextContent('mustard');
    expect(screen.getByTestId('allergen-cell-mustard')).toHaveAttribute('data-status', 'present');
  });
});

describe('FormulationEditor — F-B05 nutrition panel filled from joined data', () => {
  it('renders non-empty per-100g rows when ingredients carry joined nutrition', () => {
    renderEditor();
    expect(screen.queryByTestId('nutrition-panel-empty')).not.toBeInTheDocument();
    const rows = screen.getAllByTestId('nutrition-row');
    expect(rows.length).toBeGreaterThan(0);
    // Single ingredient at 100% → weighted per-100g equals the RM's own values.
    const values = screen.getAllByTestId('nutrition-value').map((el) => el.textContent ?? '');
    expect(values.some((v) => v.includes('500'))).toBe(true); // energy_kj
    expect(values.some((v) => v.includes('10'))).toBe(true); // fat_g
  });
});
