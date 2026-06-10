/**
 * @vitest-environment jsdom
 *
 * FormulationEditor — editable batch size (= pack weight, Costing v2).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264 (toolbar batch input).
 *
 * Feedback: for projects with NULL pack_weight_g the batch field was empty AND
 * un-typeable, so the recipe could never balance. The batch input is now editable
 * when canEdit; committing it (blur/Enter) persists `packWeightG` via the injected
 * updatePackWeightAction adapter (over the brief's updateProjectBrief action), then
 * refreshes so balance/composition recompute. NUMERIC string semantics (grams).
 *
 * Asserts:
 *   - commit (blur/Enter) calls the adapter with { projectId, packWeightG } + refreshes;
 *   - empty input commits packWeightG=null (clear), valid decimal preserved verbatim;
 *   - no commit when unchanged or invalid;
 *   - the input is disabled when !canEdit (read-only users can't type).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save the draft. Try again.',
  submitForTrial: 'Submit for trial',
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted for trial',
  submitError: 'Could not submit for trial. Try again.',
  submitErrorTotalPct: 'Total must equal 100%.',
  submitErrorMissingCost: 'Every ingredient needs a cost.',
  submitErrorMissingNutritionTarget: 'Compute nutrition first.',
  submitErrorNotDraft: 'Only a draft can be submitted.',
  submitErrorLocked: 'This version is locked.',
  submitErrorForbidden: 'You cannot submit for trial.',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking…',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Locking freezes v{n}.',
  lockConfirmConfirm: 'Lock recipe',
  lockConfirmCancel: 'Cancel',
  lockError: 'Could not lock.',
  lockErrorForbidden: 'You cannot lock.',
  lockErrorLocked: 'Already locked.',
  lockErrorNotSubmitted: 'Only a draft or trial can be locked.',
  lockErrorNotFound: 'Version not found.',
  compareTitle: 'Compare versions',
  compareVersionA: 'Version A',
  compareVersionB: 'Version B',
  compareClose: 'Close',
  compareRun: 'Compare',
  compareLoading: 'Loading diff…',
  compareError: 'Could not load the comparison.',
  compareColIngredient: 'Ingredient',
  compareColVersionA: 'Version A',
  compareColVersionB: 'Version B',
  compareSamePick: 'Pick two different versions.',
  compareNoChanges: 'No differences.',
  compareTruncated: 'Showing the first 50 rows.',
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
  qtyBalanceWarning: 'Total is {qty} kg vs {pack} kg pack.',
  packWeightUnsetHint: 'Set the pack weight on the Brief.',
  batchSizeHint: 'Batch size = pack weight; ingredients must total this.',
  composition: 'Composition',
  qtyRangeError: 'Quantity must be a non-negative number.',
  rmCodeRequired: 'Ingredient code is required.',
  livePanels: 'Live calculations',
  livePanelsHint: 'Cost, nutrition and allergen panels appear here.',
  costPanelTitle: 'Cost',
  nutritionPanelTitle: 'Nutrition',
  allergenPanelTitle: 'Allergens',
  panelPlaceholder: 'Computed on save.',
  loading: 'Loading formulation…',
  empty: 'No formulation draft yet',
  emptyBody: 'Create a draft version to start formulating.',
  createDraft: 'Create draft',
  creatingDraft: 'Creating…',
  createDraftError: 'Could not create the draft. Try again.',
  error: 'Unable to load the formulation.',
  forbidden: 'You do not have permission to edit this formulation.',
  locked: 'This version is locked and cannot be edited.',
  noAllergen: '—',
  chooseItem: 'Choose item',
  openInTechnical: 'Open item in Technical',
  picker: {
    trigger: 'Pick item',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching items',
    cancel: 'Cancel',
    error: 'Item search failed',
  },
};

function makeData(packWeightG: string | null): FormulationEditorData {
  return {
    projectId: '11111111-1111-4111-8111-111111111111',
    versionId: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    state: 'draft',
    productCode: 'Bread 200g',
    batchSizeKg: null,
    packWeightG,
    targetPriceEur: '1.20',
    targetYieldPct: '100',
    versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 1 }],
    ingredients: [
      { id: 'a1', rmCode: 'RM-1', name: 'Flour', qtyKg: '0.150', pct: '75', costPerKgEur: '0.80', allergen: 'gluten', sequence: 1 },
    ],
  };
}

describe('FormulationEditor — editable batch size (recipe.jsx:124-264)', () => {
  it('renders the batch-size helper line consistent with the existing copy', () => {
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit updatePackWeightAction={vi.fn()} />);
    expect(screen.getByTestId('batch-size-hint')).toHaveTextContent(
      'Batch size = pack weight; ingredients must total this.',
    );
  });

  it('NULL pack weight: the input is empty AND typeable when canEdit; commit persists the typed grams + refreshes', async () => {
    const onRefresh = vi.fn();
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(
      <FormulationEditor
        state="ready"
        data={makeData(null)}
        labels={LABELS}
        canEdit
        updatePackWeightAction={updatePackWeight}
        onRefresh={onRefresh}
      />,
    );
    const input = screen.getByTestId('batch-size-input');
    expect(input).toHaveValue('');
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.blur(input);

    await waitFor(() => expect(updatePackWeight).toHaveBeenCalledTimes(1));
    expect(updatePackWeight).toHaveBeenCalledWith({
      projectId: '11111111-1111-4111-8111-111111111111',
      packWeightG: '200',
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('commits on Enter (not only blur), preserving the decimal string verbatim', async () => {
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit updatePackWeightAction={updatePackWeight} />);
    const input = screen.getByTestId('batch-size-input');
    fireEvent.change(input, { target: { value: '180.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(updatePackWeight).toHaveBeenCalledTimes(1));
    expect(updatePackWeight).toHaveBeenCalledWith({
      projectId: '11111111-1111-4111-8111-111111111111',
      packWeightG: '180.5',
    });
  });

  it('clearing the value commits packWeightG=null', async () => {
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit updatePackWeightAction={updatePackWeight} />);
    const input = screen.getByTestId('batch-size-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => expect(updatePackWeight).toHaveBeenCalledTimes(1));
    expect(updatePackWeight).toHaveBeenCalledWith({
      projectId: '11111111-1111-4111-8111-111111111111',
      packWeightG: null,
    });
  });

  it('does NOT commit when the value is unchanged', () => {
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit updatePackWeightAction={updatePackWeight} />);
    const input = screen.getByTestId('batch-size-input');
    fireEvent.blur(input);
    expect(updatePackWeight).not.toHaveBeenCalled();
  });

  it('does NOT commit an invalid (non-decimal) value', () => {
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit updatePackWeightAction={updatePackWeight} />);
    const input = screen.getByTestId('batch-size-input');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(updatePackWeight).not.toHaveBeenCalled();
  });

  it('RBAC: the batch-size input is disabled for read-only users (!canEdit)', () => {
    const updatePackWeight = vi.fn(async () => ({ ok: true as const }));
    render(<FormulationEditor state="ready" data={makeData('200')} labels={LABELS} canEdit={false} updatePackWeightAction={updatePackWeight} />);
    const input = screen.getByTestId('batch-size-input');
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    expect(updatePackWeight).not.toHaveBeenCalled();
  });
});
