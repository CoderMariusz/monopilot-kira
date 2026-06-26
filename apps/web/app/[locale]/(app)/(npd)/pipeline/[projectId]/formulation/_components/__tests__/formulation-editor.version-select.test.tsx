/**
 * @vitest-environment jsdom
 *
 * Version-selector navigation fix — the version picker / "Add version" flow must
 * keep the DISPLAYED version and the saveDraft TARGET identical.
 *
 * THE BUG this guards against: the version Select used to only `setVersionId`
 * (local state) on change — it never loaded the chosen version. Picking v1 while
 * v2 was loaded left v2's ingredients on screen but pointed saveDraft at v1, so a
 * save overwrote v1 with v2's content (silent data corruption).
 *
 * Contract asserted here:
 *   1. Picking a version NAVIGATES (router.replace ?version=<id>) so the RSC
 *      reloads that version's real ingredients — display === save target.
 *   2. The save target ALWAYS follows the loaded `data.versionId` (never a stale
 *      local selection); saveDraft is called with the loaded version's id.
 *   3. Per-version lock: a locked version renders read-only, but the picker stays
 *      enabled so the user can navigate back to a draft; a draft version is
 *      editable even when another version is locked.
 *   4. After "Add version" the editor lands ON the new draft version
 *      (router.replace ?version=<newId>) instead of a bare window reload.
 *
 * i18n: every visible string is injected via labels (no inline strings). RBAC is
 * server-decided and only mirrored read-only here.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
} from '../formulation-editor';

// Shared, capturable router so the test can assert the navigation (the other
// formulation specs return a fresh vi.fn() per call — they don't assert it).
const routerReplace = vi.fn();
const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefresh,
    push: routerPush,
    replace: routerReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

afterEach(() => cleanup());
beforeEach(() => {
  routerReplace.mockClear();
  routerPush.mockClear();
  routerRefresh.mockClear();
  // Stable base URL so router.replace receives a deterministic ?version= string.
  window.history.replaceState({}, '', '/en/pipeline/p1/formulation');
});

const PROJECT_ID = 'c5cf521b-59f0-400f-8953-789cee335f1b';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V3 = '33333333-3333-4333-8333-333333333333';

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
  addVersion: 'Add version',
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
  const save = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const createVersion = vi.fn().mockResolvedValue({ ok: true, versionId: V3 });
  render(
    <FormulationEditor
      state="ready"
      data={baseData()}
      labels={LABELS}
      canEdit
      saveDraftAction={save}
      createVersionAction={createVersion}
      {...props}
    />,
  );
  return { save, createVersion };
}

describe('Version selector navigation (display === save target)', () => {
  it('navigating the picker calls router.replace with ?version=<chosen> (loads that version, not just local state)', () => {
    renderEditor();
    const trigger = screen.getByRole('combobox', { name: LABELS.version });
    // Open + pick v1 (the version that is NOT currently loaded).
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'v1' }));
    expect(routerReplace).toHaveBeenCalledTimes(1);
    const [url] = routerReplace.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain(`version=${V1}`);
    expect(url).not.toContain(`version=${V2}`);
  });

  it('does NOT navigate when re-selecting the already-loaded version (no redundant reload)', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('combobox', { name: LABELS.version }));
    fireEvent.click(screen.getByRole('option', { name: 'v2' }));
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('saveDraft always targets the LOADED version id (data.versionId), never a stale local pick', async () => {
    const { save } = renderEditor();
    // Save without touching the picker — the target must be the loaded V2.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: LABELS.saveDraft }));
    });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ projectId: PROJECT_ID, versionId: V2 });
  });

  it('after re-render with a freshly LOADED version, saveDraft targets the new version (post-navigation parity)', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const { rerender } = render(
      <FormulationEditor state="ready" data={baseData()} labels={LABELS} canEdit saveDraftAction={save} />,
    );
    // Simulate the RSC reload after ?version=V1: same client island, new data prop.
    rerender(
      <FormulationEditor
        state="ready"
        data={baseData({
          versionId: V1,
          versionNumber: 1,
          ingredients: [
            { id: 'b1', rmCode: 'RM-2002', name: 'Pork shoulder', qtyKg: '0.200', pct: '100', costPerKgEur: '3.10', allergen: null, sequence: 1 },
          ],
        })}
        labels={LABELS}
        canEdit
        saveDraftAction={save}
      />,
    );
    // The re-seed effect swaps in V1's rows; the save target is now V1.
    expect(screen.getByText('Pork shoulder')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: LABELS.saveDraft }));
    });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)![0]).toMatchObject({ versionId: V1, projectId: PROJECT_ID });
  });
});

describe('Per-version lock affordances', () => {
  it('a draft version is editable even though another version is locked (lock is per-version, not formulation-wide)', () => {
    // Loaded version V2 is a DRAFT; V1 is locked elsewhere. Editor stays editable.
    renderEditor({ data: baseData({ state: 'draft' }) });
    expect(screen.getByRole('button', { name: LABELS.saveDraft })).not.toBeDisabled();
    expect(screen.queryByText(LABELS.locked)).not.toBeInTheDocument();
  });

  it('a locked version renders read-only but the picker stays enabled to navigate back to a draft', () => {
    renderEditor({ data: baseData({ state: 'locked' }) });
    // Read-only: save + lock disabled, locked banner shown.
    expect(screen.getByRole('button', { name: LABELS.saveDraft })).toBeDisabled();
    expect(screen.getByText(LABELS.locked)).toBeInTheDocument();
    // …but the version picker is NOT disabled (>1 version) so the user can escape.
    const trigger = screen.getByRole('combobox', { name: LABELS.version });
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'v1' }));
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect((routerReplace.mock.calls[0] as [string])[0]).toContain(`version=${V1}`);
  });

  it('the picker is disabled when there is only one version (nothing to switch to)', () => {
    renderEditor({ data: baseData({ versions: [{ id: V2, versionNumber: 2 }] }) });
    expect(screen.getByRole('combobox', { name: LABELS.version })).toBeDisabled();
  });
});

describe('Add version lands on the new draft', () => {
  it('navigates to ?version=<newId> after a successful create (no bare reload)', async () => {
    const createVersion = vi.fn().mockResolvedValue({ ok: true, versionId: V3 });
    renderEditor({ createVersionAction: createVersion });
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-version-trigger'));
    });
    expect(createVersion).toHaveBeenCalledWith({ projectId: PROJECT_ID, sourceVersionId: V2 });
    await waitFor(() => expect(routerReplace).toHaveBeenCalledTimes(1));
    expect((routerReplace.mock.calls[0] as [string])[0]).toContain(`version=${V3}`);
  });

  it('falls back to a server refresh when create returns no id (still not a bare window.reload)', async () => {
    const createVersion = vi.fn().mockResolvedValue({ ok: true });
    renderEditor({ createVersionAction: createVersion });
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-version-trigger'));
    });
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
