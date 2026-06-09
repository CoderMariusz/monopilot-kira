/**
 * @vitest-environment jsdom
 *
 * Phase-1 fix wave (LANE 5) — FormulationEditor ghost-button wiring + composition %.
 *
 * Covers the four lane deliverables that have an observable UI contract:
 *   1. "Submit for trial →" calls the injected submitForTrialAction, shows the
 *      submitted indicator + triggers a refresh on success, and surfaces the
 *      gate-error message on failure; respects disabled={!editable || !balanced}.
 *   2. "Compare versions" opens a modal, runs compareVersionsAction, and renders
 *      the diff as a two-column ingredient table with the changed qty highlighted
 *      and a per-row status badge.
 *   3. Composition chart % — a lone ingredient (qty 0.200 kg) renders as its 100 %
 *      share, NOT the raw "0.200%" (the live display bug).
 *   4. Version picker labels are "v{n}", never raw UUIDs.
 *
 * RBAC: submit is server-gated; the editor only mirrors `forbidden`. i18n: every
 * visible string comes from the injected labels (no raw keys / inline strings).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const PANEL_LABELS: FormulationPanelLabels = {
  cost: {
    title: 'cost.title', live: 'live', rawMaterial: 'raw', afterYield: 'after {yieldPct}',
    processing: 'proc {overheadPct}', packaging: 'pkg', totalCost: 'total', perKgSuffix: '/kg',
    targetPrice: 'target', expectedYield: 'yield', revenuePerKg: 'rev', marginPerKg: 'm/kg',
    marginPct: 'm%', loading: 'l', empty: 'e', emptyBody: 'eb', error: 'er', forbidden: 'f',
  },
  nutrition: {
    title: 'nut.title', liveNote: 'live', exportLabel: 'export', targetsNote: 't {protein} {salt} {fat}',
    withinTarget: 'w', overTarget: 'o', overMax: 'om', energyLabel: 'E', fatLabel: 'Fat',
    saturatesLabel: 'Sat', carbsLabel: 'Carb', sugarsLabel: 'Sug', proteinLabel: 'Prot', saltLabel: 'Salt',
    loading: 'l', empty: 'e', emptyBody: 'eb', error: 'er', forbidden: 'f',
  },
  allergen: {
    title: 'al.title', subtitle: 'sub', present: 'P', trace: 'T', absent: 'A',
    detectedHeading: 'd {count}', mustDeclare: 'md', noneDetected: 'none', statusLabel: '{name}: {status}',
  },
  composition: {
    title: 'Composition',
    ariaLabel: 'Ingredient composition',
    empty: 'No ingredients to display.',
    segmentLabel: '{name}: {pct}%',
  },
};

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';

function baseData(overrides: Partial<FormulationEditorData> = {}): FormulationEditorData {
  return {
    projectId: 'c5cf521b-59f0-400f-8953-789cee335f1b',
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
  const submit = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
  const compare = vi.fn().mockResolvedValue({
    rows: [
      {
        sequence: 1,
        rmCode: 'RM-1001',
        status: 'CHANGED',
        a: { rmCode: 'RM-1001', pct: '100', qtyKg: '0.180', costPerKgEur: '4.20' },
        b: { rmCode: 'RM-1001', pct: '100', qtyKg: '0.200', costPerKgEur: '4.20' },
        changed: { rmCode: false, pct: false, qtyKg: true, costPerKgEur: false },
      },
    ],
    added: 0,
    removed: 0,
    changed: 1,
    unchanged: 0,
    truncated: false,
  });
  const onRefresh = vi.fn();
  render(
    <FormulationEditor
      state="ready"
      data={baseData()}
      labels={LABELS}
      panelLabels={PANEL_LABELS}
      canEdit
      saveDraftAction={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      submitForTrialAction={submit}
      compareVersionsAction={compare}
      onRefresh={onRefresh}
      {...props}
    />,
  );
  return { submit, compare, onRefresh };
}

describe('Submit for trial wiring (#1)', () => {
  it('calls submitForTrialAction with the current version and shows the submitted indicator + refresh on success', async () => {
    const { submit, onRefresh } = renderEditor();
    const btn = screen.getByTestId('submit-for-trial');
    expect(btn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(submit).toHaveBeenCalledWith({
      projectId: 'c5cf521b-59f0-400f-8953-789cee335f1b',
      versionId: V2,
    });
    await waitFor(() => expect(screen.getByTestId('submit-for-trial')).toHaveTextContent('Submitted for trial'));
    expect(screen.getByTestId('submit-status')).toHaveTextContent('Submitted for trial');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('maps a gate error to the localized inline message and does NOT refresh', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: false, error: 'TOTAL_PCT_OUT_OF_RANGE' });
    const onRefresh = vi.fn();
    renderEditor({ submitForTrialAction: submit, onRefresh });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-for-trial'));
    });
    await waitFor(() => expect(screen.getByTestId('submit-error')).toBeInTheDocument());
    expect(screen.getByTestId('submit-error')).toHaveTextContent(LABELS.submitErrorTotalPct);
    expect(screen.getByTestId('submit-error')).toHaveAttribute('role', 'alert');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('shows the forbidden message when the server denies permission (RBAC mirrored, not client-trusted)', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderEditor({ submitForTrialAction: submit });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-for-trial'));
    });
    await waitFor(() => expect(screen.getByTestId('submit-error')).toHaveTextContent(LABELS.submitErrorForbidden));
  });

  it('respects disabled gating: an unbalanced recipe cannot be submitted', () => {
    // Two rows whose qty (0.100 + 0.050 = 0.150 kg) drifts from the 0.200 kg pack → not balanced.
    renderEditor({
      data: baseData({
        ingredients: [
          { id: 'a1', rmCode: 'RM-1', name: 'A', qtyKg: '0.100', pct: '50', costPerKgEur: '4', allergen: null, sequence: 1 },
          { id: 'a2', rmCode: 'RM-2', name: 'B', qtyKg: '0.050', pct: '50', costPerKgEur: '2', allergen: null, sequence: 2 },
        ],
      }),
    });
    expect(screen.getByTestId('submit-for-trial')).toBeDisabled();
  });

  it('disables submit when no action is injected (button is not a dead end without wiring)', () => {
    renderEditor({ submitForTrialAction: undefined });
    expect(screen.getByTestId('submit-for-trial')).toBeDisabled();
  });

  it('disables submit when the project has moved past the recipe stage', () => {
    const submit = vi.fn().mockResolvedValue({ ok: true });
    renderEditor({ submitForTrialAction: submit, submitAllowed: false });
    const btn = screen.getByTestId('submit-for-trial');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('Compare versions wiring (#2 / #4)', () => {
  it('opens the modal, runs the diff, and renders a changed row with a highlighted qty + status badge', async () => {
    const { compare } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('compare-versions-trigger'));
    });
    expect(screen.getByTestId('compare-versions-modal')).toBeInTheDocument();
    // Auto-runs with A = current (v2), B = the other (v1).
    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare).toHaveBeenCalledWith({
      projectId: 'c5cf521b-59f0-400f-8953-789cee335f1b',
      versionAId: V2,
      versionBId: V1,
    });
    await waitFor(() => expect(screen.getByTestId('compare-table')).toBeInTheDocument());
    const row = screen.getByTestId('compare-row');
    expect(row).toHaveAttribute('data-status', 'CHANGED');
    // The changed qty cells are highlighted (data-changed=true on both sides).
    expect(within(row).getAllByText(/kg/).length).toBeGreaterThan(0);
    expect(row.querySelectorAll('[data-changed="true"]').length).toBe(2);
    expect(within(row).getByText(LABELS.compareStatusChanged)).toBeInTheDocument();
  });

  it('labels the version pickers as v{n}, never the raw UUID', async () => {
    renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('compare-versions-trigger'));
    });
    const a = screen.getByTestId('compare-version-a');
    expect(a).toHaveTextContent('v2');
    expect(a.textContent).not.toContain(V2);
  });

  it('the toolbar version picker shows v{n}, not the UUID', () => {
    renderEditor();
    const trigger = screen.getByRole('combobox', { name: LABELS.version });
    expect(trigger).toHaveTextContent('v2');
    expect(trigger.textContent).not.toContain(V2);
  });

  it('disables the Compare trigger when no compare action is injected', () => {
    renderEditor({ compareVersionsAction: undefined });
    expect(screen.getByTestId('compare-versions-trigger')).toBeDisabled();
  });
});

describe('Composition chart % math (#3)', () => {
  it('renders a lone ingredient as its 100% share, NOT the raw 0.200 qty value', () => {
    renderEditor();
    // The single 0.200 kg ingredient is 100% of the recipe by mass.
    const seg = within(screen.getByTestId('composition-bar-track')).getByTestId('composition-segment');
    expect(seg).toHaveStyle({ width: '100.000%' });
    // Legend + aria-label print the SHARE (100), never the raw qty (0.200).
    const chip = within(screen.getByTestId('composition-legend')).getByTestId('composition-legend-chip');
    expect(chip).toHaveTextContent('Beef trim 80VL (lean) 100.000%');
    expect(chip).not.toHaveTextContent('0.200%');
    expect(screen.getByLabelText('Beef trim 80VL (lean): 100.000%')).toBeInTheDocument();
  });

  it('splits two ingredients by their mass share (0.150 + 0.050 → 75% / 25%)', () => {
    renderEditor({
      data: baseData({
        ingredients: [
          { id: 'a1', rmCode: 'RM-1', name: 'Lean', qtyKg: '0.150', pct: '75', costPerKgEur: '4', allergen: null, sequence: 1 },
          { id: 'a2', rmCode: 'RM-2', name: 'Fat', qtyKg: '0.050', pct: '25', costPerKgEur: '2', allergen: null, sequence: 2 },
        ],
      }),
    });
    const segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    expect(segs[0]).toHaveStyle({ width: '75.000%' });
    expect(segs[1]).toHaveStyle({ width: '25.000%' });
    expect(screen.getByLabelText('Lean: 75.000%')).toBeInTheDocument();
    expect(screen.getByLabelText('Fat: 25.000%')).toBeInTheDocument();
  });
});
