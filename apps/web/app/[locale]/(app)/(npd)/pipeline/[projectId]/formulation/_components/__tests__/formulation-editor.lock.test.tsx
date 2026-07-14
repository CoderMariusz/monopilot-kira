/**
 * @vitest-environment jsdom
 *
 * LANE N1.5-G (C1) — FormulationEditor "Lock recipe" wiring.
 *
 * Parity + behaviour contract:
 *   - a "Lock recipe" ghost button sits in the toolbar next to "Compare versions";
 *   - it is gated on the SAME write permission as save (disabled when !editable
 *     or when no lockVersionAction is injected — never a dead end);
 *   - clicking it opens a confirm dialog ("Locking freezes v{n} — it can no longer
 *     be edited."), NOT an immediate mutation;
 *   - confirming calls lockVersionAction({ projectId, versionId }) and, on success,
 *     triggers a server refresh (the editor's existing locked/read-only state then
 *     re-renders from Supabase);
 *   - the action returns error CODES — they are mapped to localized inline messages
 *     (role="alert"), including the RBAC `forbidden` code (mirrored, never trusted).
 *
 * i18n: every visible string comes from the injected labels (no raw keys / inline
 * strings). RBAC is a server decision surfaced read-only here.
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
    state: 'draft',
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
  const lock = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
  const onRefresh = vi.fn();
  render(
    <FormulationEditor
      state="ready"
      data={baseData()}
      labels={LABELS}
      canEdit
      saveDraftAction={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      lockVersionAction={lock}
      onRefresh={onRefresh}
      {...props}
    />,
  );
  return { lock, onRefresh };
}

describe('C1 — Lock recipe wiring', () => {
  it('renders the Lock recipe button next to Compare versions, enabled when editable', () => {
    renderEditor();
    const btn = screen.getByTestId('lock-recipe-trigger');
    expect(btn).toHaveTextContent(LABELS.lockRecipe);
    expect(btn).not.toBeDisabled();
    // Sits in the same toolbar action group as Compare versions.
    expect(screen.getByTestId('compare-versions-trigger')).toBeInTheDocument();
  });

  it('opens a confirm dialog (does NOT mutate immediately) and shows the freeze copy with v{n}', async () => {
    const { lock } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-recipe-trigger'));
    });
    const modal = screen.getByTestId('lock-confirm-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveTextContent('Locking freezes v2 — it can no longer be edited.');
    // No action call until the user confirms.
    expect(lock).not.toHaveBeenCalled();
  });

  it('confirming calls lockVersionAction with { projectId, versionId } and refreshes on success', async () => {
    const { lock, onRefresh } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-recipe-trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-confirm'));
    });
    expect(lock).toHaveBeenCalledWith({ projectId: PROJECT_ID, versionId: V2 });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    // Dialog closes after a successful lock.
    await waitFor(() => expect(screen.queryByTestId('lock-confirm-modal')).not.toBeInTheDocument());
  });

  it('cancelling the dialog does not call the action', async () => {
    const { lock } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-recipe-trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-confirm-cancel'));
    });
    expect(lock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('lock-confirm-modal')).not.toBeInTheDocument();
  });

  it('maps the action error code to a localized inline alert and does NOT refresh (VERSION_NOT_DRAFT)', async () => {
    const lock = vi.fn().mockResolvedValue({ ok: false, error: 'VERSION_NOT_DRAFT' });
    const onRefresh = vi.fn();
    renderEditor({ lockVersionAction: lock, onRefresh });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-recipe-trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-confirm'));
    });
    await waitFor(() => expect(screen.getByTestId('lock-error')).toBeInTheDocument());
    expect(screen.getByTestId('lock-error')).toHaveTextContent(LABELS.lockErrorNotSubmitted);
    expect(screen.getByTestId('lock-error')).toHaveAttribute('role', 'alert');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('surfaces the forbidden code read-only (RBAC mirrored, not client-trusted)', async () => {
    const lock = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderEditor({ lockVersionAction: lock });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-recipe-trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('lock-confirm'));
    });
    await waitFor(() => expect(screen.getByTestId('lock-error')).toHaveTextContent(LABELS.lockErrorForbidden));
  });

  it('is disabled when the user cannot edit (same gate as save)', () => {
    renderEditor({ canEdit: false });
    expect(screen.getByTestId('lock-recipe-trigger')).toBeDisabled();
  });

  it('is disabled (not a dead end) when no lock action is injected', () => {
    renderEditor({ lockVersionAction: undefined });
    expect(screen.getByTestId('lock-recipe-trigger')).toBeDisabled();
  });

  it('is disabled on a locked version (cannot re-lock) and shows the locked read-only banner', () => {
    renderEditor({ data: baseData({ state: 'locked' }) });
    expect(screen.getByTestId('lock-recipe-trigger')).toBeDisabled();
    expect(screen.getByText(LABELS.locked)).toBeInTheDocument();
  });
});
