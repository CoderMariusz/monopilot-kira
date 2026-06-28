/**
 * @vitest-environment jsdom
 *
 * LANE A6 — FormulationEditor "Unlock recipe" wiring.
 *
 * Behaviour + parity contract (mirrors the C1 lock test, inverse flow):
 *   - an "Unlock recipe" toolbar button is shown ONLY when the loaded version is
 *     LOCKED (data.state === 'locked'); it is absent on a draft version;
 *   - it is gated the same way the Lock button is gated by the action prop — it is
 *     disabled (never a dead end) when no unlockVersionAction is injected;
 *   - clicking it opens a PIN e-sign modal (reason Textarea + password PIN Input +
 *     confirm Checkbox) — NOT an immediate mutation;
 *   - submitting calls unlockVersionAction({ projectId, versionId, pin, reason })
 *     with the ENTERED pin and, on success, refreshes so the editor re-reads the
 *     now-draft (editable) version from Supabase;
 *   - every ok:false code (forbidden | VERSION_NOT_LOCKED | esign_failed |
 *     not_found) maps to a localized inline alert (role="alert"); the modal stays
 *     open on failure.
 *
 * i18n: every visible string comes from the injected labels (no raw keys). RBAC is
 * a server decision surfaced read-only here.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const PROJECT_ID = 'c5cf521b-59f0-400f-8953-789cee335f1b';
const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '11111111-1111-4111-8111-111111111111';

const LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save.',
  submitForTrial: 'Submit for trial',
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted for trial',
  submitError: 'Could not submit for trial. Try again.',
  submitErrorTotalPct: 'Ingredient total must equal 100%.',
  submitErrorMissingCost: 'Every ingredient needs a cost.',
  submitErrorMissingNutritionTarget: 'Compute nutrition first.',
  submitErrorNotDraft: 'Only a draft can be submitted.',
  submitErrorLocked: 'This version is locked.',
  submitErrorForbidden: 'You do not have permission to submit for trial.',
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
  unlockRecipe: 'Unlock recipe',
  unlocking: 'Unlocking…',
  unlockTitle: 'Unlock recipe',
  unlockBody: 'Unlocking returns v{n} to draft so it can be edited again.',
  unlockReasonLabel: 'Reason',
  unlockReasonPlaceholder: 'Why are you unlocking this version?',
  unlockPinLabel: 'E-signature PIN',
  unlockPinPlaceholder: 'Enter your PIN',
  unlockConfirmCheckbox: 'I confirm I am unlocking this locked recipe version.',
  unlockSubmit: 'Unlock recipe',
  unlockCancel: 'Cancel',
  unlockError: 'Could not unlock the recipe. Try again.',
  unlockErrorForbidden: 'You do not have permission to unlock this recipe.',
  unlockErrorNotLocked: 'This version is not locked.',
  unlockErrorEsign: 'Incorrect PIN. Please try again.',
  unlockErrorNotFound: 'This version could not be found.',
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
  qtyBalanceWarning: 'Total is {qty} kg vs {pack} kg.',
  packWeightUnsetHint: 'Set the pack weight.',
  batchSizeHint: 'Batch size = pack weight; ingredients must total this.',
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
  locked: 'This version is locked and cannot be edited.',
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
};

function baseData(overrides: Partial<FormulationEditorData> = {}): FormulationEditorData {
  return {
    projectId: PROJECT_ID,
    versionId: V2,
    versionNumber: 2,
    state: 'locked',
    productCode: 'PRD-1',
    batchSizeKg: '0.200',
    packWeightG: '200',
    targetPriceEur: '4.00',
    targetYieldPct: '80',
    versions: [
      { id: V2, versionNumber: 2 },
      { id: V1, versionNumber: 1 },
    ],
    ingredients: [
      {
        id: 'a1',
        rmCode: 'RM-1001',
        name: 'Beef trim 80VL (lean)',
        qtyKg: '0.200',
        pct: '100',
        costPerKgEur: '4.20',
        allergen: null,
        sequence: 1,
      },
    ],
    ...overrides,
  };
}

function renderEditor(props: Partial<React.ComponentProps<typeof FormulationEditor>> = {}) {
  const unlock = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
  const onRefresh = vi.fn();
  render(
    <FormulationEditor
      state="ready"
      data={baseData()}
      labels={LABELS}
      canEdit
      saveDraftAction={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      unlockVersionAction={unlock}
      onRefresh={onRefresh}
      {...props}
    />,
  );
  return { unlock, onRefresh };
}

/** Fill the modal's reason + PIN + confirm checkbox so the submit button enables. */
function fillEsign(pin: string, reason = 'Correcting a costing error') {
  fireEvent.change(screen.getByTestId('unlock-reason'), { target: { value: reason } });
  fireEvent.change(screen.getByTestId('unlock-pin'), { target: { value: pin } });
  fireEvent.click(screen.getByTestId('unlock-confirm-checkbox'));
}

describe('A6 — Unlock recipe wiring', () => {
  it('renders the Unlock recipe button only when the version is locked', () => {
    renderEditor();
    const btn = screen.getByTestId('unlock-recipe-trigger');
    expect(btn).toHaveTextContent(LABELS.unlockRecipe);
    expect(btn).not.toBeDisabled();
  });

  it('does NOT render the Unlock button on a draft version', () => {
    renderEditor({ data: baseData({ state: 'draft' }) });
    expect(screen.queryByTestId('unlock-recipe-trigger')).not.toBeInTheDocument();
  });

  it('opens the PIN modal (does NOT mutate immediately) and shows the v{n} copy', async () => {
    const { unlock } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    const modal = screen.getByTestId('unlock-version-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByText('Unlocking returns v2 to draft so it can be edited again.')).toBeInTheDocument();
    expect(unlock).not.toHaveBeenCalled();
  });

  it('submitting calls unlockVersionAction with { projectId, versionId, pin, reason } and refreshes on success', async () => {
    const { unlock, onRefresh } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    await act(async () => {
      fillEsign('123456');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-submit'));
    });
    expect(unlock).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      versionId: V2,
      pin: '123456',
      reason: 'Correcting a costing error',
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('unlock-version-modal')).not.toBeInTheDocument());
  });

  it('keeps the submit disabled until reason + pin + confirm are all provided', async () => {
    renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    expect(screen.getByTestId('unlock-submit')).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByTestId('unlock-pin'), { target: { value: '123456' } });
    });
    // still disabled (no reason / no confirm)
    expect(screen.getByTestId('unlock-submit')).toBeDisabled();
  });

  it('maps esign_failed (wrong PIN) to the localized inline alert and keeps the modal open', async () => {
    const unlock = vi.fn().mockResolvedValue({ ok: false, error: 'esign_failed' });
    const onRefresh = vi.fn();
    renderEditor({ unlockVersionAction: unlock, onRefresh });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    await act(async () => {
      fillEsign('000000');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-error')).toBeInTheDocument());
    expect(screen.getByTestId('unlock-error')).toHaveTextContent(LABELS.unlockErrorEsign);
    expect(screen.getByTestId('unlock-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('unlock-version-modal')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('surfaces the forbidden code read-only (RBAC mirrored, not client-trusted)', async () => {
    const unlock = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderEditor({ unlockVersionAction: unlock });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    await act(async () => {
      fillEsign('123456');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-error')).toHaveTextContent(LABELS.unlockErrorForbidden));
  });

  it('maps VERSION_NOT_LOCKED to the localized inline alert', async () => {
    const unlock = vi.fn().mockResolvedValue({ ok: false, error: 'VERSION_NOT_LOCKED' });
    renderEditor({ unlockVersionAction: unlock });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
    });
    await act(async () => {
      fillEsign('123456');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-error')).toHaveTextContent(LABELS.unlockErrorNotLocked));
  });

  it('is disabled (not a dead end) when no unlock action is injected', () => {
    renderEditor({ unlockVersionAction: undefined });
    expect(screen.getByTestId('unlock-recipe-trigger')).toBeDisabled();
  });
});
