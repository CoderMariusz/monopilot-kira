/**
 * @vitest-environment jsdom
 *
 * FALA 3 / FIX-FINAL — yield save errors + render priority over pack-weight hint.
 * Each case fails on the pre-fix code (null→"0" invalid_input; save error swallowed).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
} from '../formulation-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

afterEach(() => cleanup());

const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost — recalc live.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save the draft. Try again.',
  saveErrorNotDraft: 'This version is no longer editable — only draft versions can be saved.',
  saveErrorTargetYieldZero:
    'Expected yield % must be greater than 0 — zero would mean no loss and would distort costing.',
  submitForTrial: 'Submit for trial',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking…',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Locking freezes v{n} — it can no longer be edited.',
  lockConfirmConfirm: 'Lock recipe',
  lockConfirmCancel: 'Cancel',
  lockError: 'Could not lock the recipe. Try again.',
  lockErrorForbidden: 'You do not have permission to lock this recipe.',
  lockErrorLocked: 'This version is already locked.',
  lockErrorNotSubmitted: 'Only a draft or trial version can be locked.',
  lockErrorNotFound: 'This version could not be found.',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colQtyPerPack: 'Qty / pack (kg)',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  qtyBalanceWarning: 'Ingredient total is {qty} kg vs a {pack} kg pack.',
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
  error: 'Unable to load the formulation.',
  forbidden: 'You do not have permission to edit this formulation.',
  locked: 'This version is locked and cannot be edited.',
  noAllergen: '—',
  createDraft: 'Create draft',
  chooseItem: 'Choose item',
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted for trial',
  submitError: 'Could not submit for trial. Try again.',
  submitErrorTotalPct: 'Ingredient total must match the pack weight before submitting for trial.',
  submitErrorMissingCost: 'Every ingredient needs a cost before submitting for trial.',
  submitErrorMissingNutritionTarget: 'Compute nutrition before submitting for trial.',
  submitErrorNotDraft: 'Only a draft version can be submitted for trial.',
  submitErrorLocked: 'This version is locked and cannot be submitted.',
  submitErrorForbidden: 'You do not have permission to submit for trial.',
  addVersion: 'Add version',
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
  compareSamePick: 'Pick two different versions to compare.',
  compareNoChanges: 'No ingredient differences between these versions.',
  compareTruncated: 'Showing the first 50 ingredient rows.',
  compareStatusAdded: 'Added',
  compareStatusRemoved: 'Removed',
  compareStatusChanged: 'Changed',
  compareStatusUnchanged: 'Unchanged',
  openInTechnical: 'Open item in Technical',
  unlockRecipe: 'Unlock recipe',
  unlocking: 'Unlocking…',
  unlockTitle: 'Unlock recipe',
  unlockBody: 'Unlocking v{n} requires e-sign.',
  unlockReasonLabel: 'Reason',
  unlockReasonPlaceholder: 'Why unlock?',
  unlockPinLabel: 'PIN',
  unlockConfirm: 'Unlock',
  unlockCancel: 'Cancel',
  unlockError: 'Could not unlock.',
  unlockErrorForbidden: 'No permission.',
  unlockErrorNotLocked: 'Not locked.',
  unlockErrorNotFound: 'Not found.',
  unlockErrorInvalidPin: 'Invalid PIN.',
  submitErrorNotLocked: 'Lock first.',
  picker: { createItemCta: 'Create item' },
  wipPicker: {
    trigger: '+ Add WIP',
    searchLabel: 'Search',
    searchPlaceholder: 'Search…',
    loading: 'Loading…',
    empty: 'Empty',
    cancel: 'Cancel',
    error: 'Error',
  },
};

function baseData(overrides: Partial<FormulationEditorData> = {}): FormulationEditorData {
  return {
    projectId: PROJECT_ID,
    versionId: VERSION_ID,
    versionNumber: 1,
    state: 'draft',
    productCode: 'Test FG',
    batchSizeKg: '0.2',
    packWeightG: '200',
    targetPriceEur: '3.98',
    targetYieldPct: null,
    versions: [{ id: VERSION_ID, versionNumber: 1 }],
    ingredients: [
      {
        id: 'row-1',
        rmCode: 'RM-1001',
        name: 'Pork',
        qtyKg: '0.170',
        pct: '85',
        costPerKgEur: '4.20',
        allergen: null,
        sequence: 1,
      },
    ],
    ...overrides,
  };
}

describe('FormulationEditor — yield save errors (FALA 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends null (not "0") for targetYieldPct when yield is unset in the DB', async () => {
    const saveDraftAction = vi.fn().mockResolvedValue({
      ok: true,
      data: { versionId: VERSION_ID, ingredientCount: 1, ingredients: [] },
    });

    render(
      <FormulationEditor
        state="ready"
        data={baseData({ targetYieldPct: null })}
        labels={LABELS}
        canEdit
        saveDraftAction={saveDraftAction}
      />,
    );

    const row = screen.getByTestId('ingredient-row');
    fireEvent.change(within(row).getByLabelText(LABELS.colQtyPerPack), {
      target: { value: '0.171' },
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    await waitFor(() => expect(saveDraftAction).toHaveBeenCalled());
    const payload = saveDraftAction.mock.calls.at(-1)?.[0] as { targetYieldPct?: unknown };
    expect(payload.targetYieldPct).toBeNull();
    expect(payload.targetYieldPct).not.toBe('0');
  });

  it('renders the named TARGET_YIELD_ZERO_NOT_ALLOWED message from the server', async () => {
    const saveDraftAction = vi.fn().mockResolvedValue({
      ok: false,
      error: 'TARGET_YIELD_ZERO_NOT_ALLOWED',
    });

    render(
      <FormulationEditor
        state="ready"
        data={baseData({ targetYieldPct: '78' })}
        labels={LABELS}
        canEdit
        saveDraftAction={saveDraftAction}
      />,
    );

    const row = screen.getByTestId('ingredient-row');
    fireEvent.change(within(row).getByLabelText(LABELS.colQtyPerPack), {
      target: { value: '0.171' },
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    await waitFor(() => {
      expect(screen.getByTestId('formulation-save-error-detail')).toHaveTextContent(
        LABELS.saveErrorTargetYieldZero,
      );
    });
  });

  it('shows save error detail even when pack weight is unset (priority over hint)', async () => {
    const saveDraftAction = vi.fn().mockResolvedValue({
      ok: false,
      error: 'VERSION_NOT_DRAFT',
    });

    render(
      <FormulationEditor
        state="ready"
        data={baseData({ packWeightG: null, targetYieldPct: '78' })}
        labels={LABELS}
        canEdit
        saveDraftAction={saveDraftAction}
      />,
    );

    const row = screen.getByTestId('ingredient-row');
    fireEvent.change(within(row).getByLabelText(LABELS.colQtyPerPack), {
      target: { value: '0.171' },
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    await waitFor(() => {
      expect(screen.getByTestId('formulation-save-error-detail')).toHaveTextContent(
        LABELS.saveErrorNotDraft,
      );
    });
    expect(screen.queryByTestId('pack-weight-unset-hint')).not.toBeInTheDocument();
  });
});
