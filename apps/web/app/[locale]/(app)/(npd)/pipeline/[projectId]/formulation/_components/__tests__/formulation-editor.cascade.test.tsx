/**
 * @vitest-environment jsdom
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
} from '../formulation-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

const LABELS = {
  title: 'Recipe',
  subtitle: 'Edit recipe.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving',
  saved: 'Saved',
  saveError: 'Save failed',
  submitForTrial: 'Submit for trial',
  submitting: 'Submitting',
  submittedForTrial: 'Submitted',
  submitError: 'Submit failed',
  submitErrorTotalPct: 'Total invalid',
  submitErrorMissingCost: 'Cost missing',
  submitErrorMissingNutritionTarget: 'Nutrition missing',
  submitErrorNotDraft: 'Not draft',
  submitErrorNotLocked: 'Not locked',
  submitErrorLocked: 'Locked',
  submitErrorForbidden: 'Forbidden',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Lock v{n}',
  lockConfirmConfirm: 'Lock recipe',
  lockConfirmCancel: 'Cancel',
  lockError: 'Lock failed',
  lockErrorForbidden: 'Lock forbidden',
  lockErrorLocked: 'Already locked',
  lockErrorNotSubmitted: 'Not submitted',
  lockErrorNotFound: 'Not found',
  unlockRecipe: 'Unlock recipe',
  unlocking: 'Unlocking',
  unlockTitle: 'Unlock recipe',
  unlockBody: 'Unlock v{n}',
  unlockReasonLabel: 'Reason',
  unlockReasonPlaceholder: 'Reason',
  unlockPinLabel: 'PIN',
  unlockPinPlaceholder: 'PIN',
  unlockConfirmCheckbox: 'Confirm',
  unlockSubmit: 'Unlock',
  unlockCancel: 'Cancel',
  unlockError: 'Unlock failed',
  unlockErrorForbidden: 'Unlock forbidden',
  unlockErrorNotLocked: 'Not locked',
  unlockErrorEsign: 'Bad PIN',
  unlockErrorNotFound: 'Not found',
  compareTitle: 'Compare',
  compareVersionA: 'Version A',
  compareVersionB: 'Version B',
  compareClose: 'Close',
  compareRun: 'Run',
  compareLoading: 'Loading',
  compareError: 'Compare failed',
  compareColIngredient: 'Ingredient',
  compareColVersionA: 'A',
  compareColVersionB: 'B',
  compareSamePick: 'Pick different versions',
  compareNoChanges: 'No changes',
  compareTruncated: 'Truncated',
  compareStatusAdded: 'Added',
  compareStatusRemoved: 'Removed',
  compareStatusChanged: 'Changed',
  compareStatusUnchanged: 'Unchanged',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colQtyPerPack: 'Qty / pack (kg)',
  colCostPerKg: 'Cost / kg',
  colContribution: 'Contribution',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  qtyBalanceWarning: 'Ingredient total is {qty} kg vs a {pack} kg pack.',
  packWeightUnsetHint: 'Set pack weight.',
  batchSizeHint: 'Batch size = pack weight.',
  composition: 'Composition',
  qtyRangeError: 'Quantity must be valid.',
  rmCodeRequired: 'Code required.',
  livePanels: 'Live panels',
  livePanelsHint: 'Live panels',
  costPanelTitle: 'Cost',
  nutritionPanelTitle: 'Nutrition',
  allergenPanelTitle: 'Allergens',
  panelPlaceholder: 'Computed on save.',
  loading: 'Loading',
  empty: 'Empty',
  emptyBody: 'Empty body',
  createDraft: 'Create draft',
  creatingDraft: 'Creating',
  createDraftError: 'Create failed',
  error: 'Error',
  forbidden: 'Forbidden',
  locked: 'Locked',
  noAllergen: 'None',
  chooseItem: 'Choose item',
  openInTechnical: 'Open item in Technical',
  picker: {
    trigger: 'Choose item',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search items',
    loading: 'Searching',
    empty: 'No items',
    cancel: 'Cancel',
    error: 'Search failed',
  },
} satisfies FormulationLabels;

const DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 1,
  state: 'draft',
  productCode: 'FG-1',
  batchSizeKg: '0.2',
  packWeightG: '200',
  targetPriceEur: '4',
  targetYieldPct: '100',
  versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 1 }],
  ingredients: [
    {
      id: 'line-1',
      rmCode: 'WIP-A',
      itemId: '33333333-3333-4333-8333-333333333333',
      name: 'Processed blend',
      qtyKg: '0.2',
      pct: '100',
      costPerKgEur: '2',
      allergens: [],
      sequence: 1,
    },
  ],
};

describe('FormulationEditor recipe cascade rows', () => {
  it('loads once, expands read-only sub-recipe rows, and collapses them', async () => {
    const loadRecipeCascadeAction = vi.fn().mockResolvedValue([
      {
        ingredientLineId: 'line-1',
        itemCode: 'WIP-A',
        itemName: 'Processed blend',
        hasSubRecipe: true,
        subRecipe: {
          totalCost: 1.25,
          lines: [
            {
              itemCode: 'RM-1',
              itemName: 'Raw material 1',
              pct: 75,
              unitCost: 1.5,
              nutritionPer100g: { protein_g: 12 },
            },
          ],
        },
      },
    ]);

    render(
      <FormulationEditor
        state="ready"
        data={DATA}
        labels={LABELS}
        canEdit={false}
        loadRecipeCascadeAction={loadRecipeCascadeAction}
      />,
    );

    const toggle = screen.getByTestId('recipe-cascade-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(await screen.findByText('Raw material 1')).toBeInTheDocument();
    expect(screen.getByText('protein_g: 12')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-cascade-total')).toHaveTextContent('1.250');
    expect(loadRecipeCascadeAction).toHaveBeenCalledWith(DATA.projectId, DATA.versionId);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText('Raw material 1')).not.toBeInTheDocument();
    });
    expect(within(screen.getByTestId('ingredient-row')).getByText('WIP-A')).toBeInTheDocument();
  });
});
