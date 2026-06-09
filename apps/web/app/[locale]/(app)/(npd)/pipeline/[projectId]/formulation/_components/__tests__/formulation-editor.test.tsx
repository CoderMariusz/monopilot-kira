/**
 * @vitest-environment jsdom
 * T-066 — FormulationEditor (RecipeScreen prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264
 *     (IngredientRow + RecipeScreen)
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:79-153
 *     (FormulationEditor — auto-save-on-blur editor pattern)
 *
 * RED → GREEN. Asserts:
 *   - parity checklist: ingredient row cols (rm_code, qty_kg/%, €/kg, contrib,
 *     allergen) + batch / target-price inputs + version Select, all via shadcn
 *     primitives (no raw <select>);
 *   - Add / Delete row controls mutate the table;
 *   - 800 ms debounced saveDraft fires exactly once after a burst of keystrokes;
 *   - pct out of [0,100] → inline Zod error AND saveDraft NOT called;
 *   - required UI states (loading / empty / error / permission-denied);
 *   - i18n labels never leak the raw default key.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
  type PageState,
} from '../formulation-editor';

// FormulationEditor calls useRouter() for the post-submit router.refresh();
// stub next/navigation (no App-Router context under RTL).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());
beforeEach(() => vi.useRealTimers());

const LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost — nutrition, allergens, and margin recalculate live.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save the draft. Try again.',
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
  qtyBalanceWarning:
    'Ingredient total is {qty} kg vs a {pack} kg pack. Adjust to match the pack weight (±1%) before submitting for trial.',
  packWeightUnsetHint: 'Set the pack weight on the Brief to validate the recipe against the pack size.',
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
};

const DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 3,
  state: 'draft',
  productCode: 'Sliced Ham 200g',
  batchSizeKg: '500',
  // Costing v2: 200 g pack → qtyKg sums to 0.200 kg.
  packWeightG: '200',
  targetPriceEur: '3.98',
  targetYieldPct: '78',
  versions: [
    { id: '22222222-2222-4222-8222-222222222222', versionNumber: 3 },
    { id: '33333333-3333-4333-8333-333333333333', versionNumber: 2 },
  ],
  ingredients: [
    {
      id: 'a1',
      rmCode: 'RM-1001',
      name: 'Pork shoulder',
      qtyKg: '0.170',
      pct: '85',
      costPerKgEur: '4.20',
      allergen: null,
      sequence: 1,
    },
    {
      id: 'a2',
      rmCode: 'RM-2002',
      name: 'Water',
      qtyKg: '0.020',
      pct: '10',
      costPerKgEur: '0.01',
      allergen: 'celery',
      sequence: 2,
    },
  ],
};

function renderEditor(overrides: Partial<React.ComponentProps<typeof FormulationEditor>> = {}) {
  const saveDraft = vi.fn().mockResolvedValue({ ok: true, data: { versionId: DATA.versionId, ingredientCount: 2 } });
  const recompute = vi.fn().mockResolvedValue({ ok: true });
  render(
    <FormulationEditor
      state={'ready' as PageState}
      data={DATA}
      labels={LABELS}
      canEdit
      saveDraftAction={saveDraft}
      recomputeAction={recompute}
      {...overrides}
    />,
  );
  return { saveDraft, recompute };
}

describe('FormulationEditor — parity (recipe.jsx:124-264)', () => {
  it('renders the editor shell with toolbar inputs and the ingredients table', () => {
    renderEditor();
    expect(screen.getByTestId('formulation-editor')).toBeInTheDocument();
    // Toolbar: READ-ONLY batch size (= pack weight kg) + version select + target price.
    expect(screen.getByTestId('batch-size-readonly')).toHaveValue('0.200000');
    expect(screen.getByLabelText(LABELS.targetPrice)).toBeInTheDocument();
    // shadcn Select (NOT a raw <select>) for version.
    expect(screen.getByRole('combobox', { name: LABELS.version })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
    // Table columns.
    expect(screen.getByRole('columnheader', { name: LABELS.colIngredient })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colQtyPerPack })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colCostPerKg })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colContribution })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colAllergen })).toBeInTheDocument();
  });

  it('renders an ingredient row per data row with code, pct, cost, contribution and allergen', () => {
    renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    // Lane-B: the ingredient code is now a real item reference (display, not a
    // free-text input) — the rmCode renders as text, chosen via the ItemPicker.
    expect(first.getByText('RM-1001')).toBeInTheDocument();
    // Costing v2: qty/pack (kg) is the editable quantity.
    expect(first.getByDisplayValue('0.170')).toBeInTheDocument();
    expect(first.getByDisplayValue('4.20')).toBeInTheDocument();
    // contribution = qtyKg × costPerKg = 0.170 * 4.20 = 0.714 €, NUMERIC-exact.
    expect(first.getByTestId('ingredient-contribution')).toHaveTextContent('0.714');
    // allergen badge present on the second row.
    const second = within(rows[1]);
    expect(second.getByText('celery')).toBeInTheDocument();
  });

  it('shows a total row with the exact qty sum and a balance warning when ≠ pack weight', () => {
    renderEditor();
    const total = screen.getByTestId('total-row');
    // 0.170 + 0.020 = 0.190 kg vs a 0.200 kg pack → 5% off → warns.
    expect(within(total).getByTestId('total-qty')).toHaveTextContent('0.190 kg');
    expect(screen.getByTestId('qty-balance-warning')).toBeInTheDocument();
  });
});

describe('FormulationEditor — CRUD + debounce + validation', () => {
  it('adds a new ingredient row', () => {
    renderEditor();
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: LABELS.addIngredient }));
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(3);
  });

  it('deletes an ingredient row', () => {
    renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    fireEvent.click(within(rows[0]).getByRole('button', { name: LABELS.deleteRow }));
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(1);
  });

  it('debounces saveDraft to exactly one call 800 ms after a burst of keystrokes', () => {
    vi.useFakeTimers();
    const { saveDraft } = renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    const qtyInput = within(rows[0]).getByLabelText(LABELS.colQtyPerPack);

    fireEvent.change(qtyInput, { target: { value: '0.16' } });
    fireEvent.change(qtyInput, { target: { value: '0.17' } });
    fireEvent.change(qtyInput, { target: { value: '0.18' } });

    // Before debounce elapses: no save.
    act(() => vi.advanceTimersByTime(799));
    expect(saveDraft).not.toHaveBeenCalled();

    // At 800 ms: exactly one save.
    act(() => vi.advanceTimersByTime(1));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('shows an inline Zod error and does NOT save when qty is negative/invalid', () => {
    vi.useFakeTimers();
    const { saveDraft } = renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    const qtyInput = within(rows[0]).getByLabelText(LABELS.colQtyPerPack);

    // Non-decimal (negative) → fails the qtyKg Zod refinement.
    fireEvent.change(qtyInput, { target: { value: '-1' } });
    fireEvent.blur(qtyInput);

    expect(within(rows[0]).getByText(LABELS.qtyRangeError)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(saveDraft).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('FormulationEditor — states + RBAC', () => {
  it('renders the loading state', () => {
    render(<FormulationEditor state="loading" data={null} labels={LABELS} canEdit={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
  });

  it('renders the empty state', () => {
    render(<FormulationEditor state="empty" data={null} labels={LABELS} canEdit />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<FormulationEditor state="error" data={null} labels={LABELS} canEdit />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('renders permission-denied without rendering the editable table', () => {
    render(<FormulationEditor state="permission_denied" data={null} labels={LABELS} canEdit={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(screen.queryByTestId('ingredient-row')).toBeNull();
  });

  it('disables editing controls and never calls saveDraft when canEdit is false', () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn();
    render(
      <FormulationEditor
        state="ready"
        data={DATA}
        labels={LABELS}
        canEdit={false}
        saveDraftAction={saveDraft}
      />,
    );
    expect(screen.getByRole('button', { name: LABELS.addIngredient })).toBeDisabled();
    const rows = screen.getAllByTestId('ingredient-row');
    expect(within(rows[0]).getByLabelText(LABELS.colQtyPerPack)).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(saveDraft).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('renders live-panel placeholder slots (T-113-115 own the full panels)', () => {
    renderEditor();
    expect(screen.getByTestId('panel-cost')).toBeInTheDocument();
    expect(screen.getByTestId('panel-nutrition')).toBeInTheDocument();
    expect(screen.getByTestId('panel-allergen')).toBeInTheDocument();
  });
});

// Phase-3 (Lane 16) — NPD↔Technical shortcut: per-row "↗ Open item in Technical".
describe('FormulationEditor — ingredient → Technical item shortcut (Phase-3)', () => {
  it('renders an "↗" link to /technical/items/<code> on each picked-item row, leaving the row controls intact', () => {
    renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    expect(rows).toHaveLength(2);

    // Both DATA rows have a picked item (rmCode present) → each gets the link.
    const links = screen.getAllByTestId('ingredient-open-in-technical');
    expect(links).toHaveLength(2);
    expect(within(rows[0]).getByTestId('ingredient-open-in-technical')).toHaveAttribute(
      'href',
      '/technical/items/RM-1001',
    );
    expect(within(rows[1]).getByTestId('ingredient-open-in-technical')).toHaveAttribute(
      'href',
      '/technical/items/RM-2002',
    );
    // The link is read-level (a real anchor with href), not a button.
    expect(links[0].tagName).toBe('A');

    // SURGICAL: the existing row controls are unchanged (qty input + delete still present).
    expect(within(rows[0]).getByLabelText(LABELS.colQtyPerPack)).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: LABELS.deleteRow })).toBeInTheDocument();
  });

  it('omits the "↗" link on a freshly added row that has no picked item yet (no rmCode)', () => {
    renderEditor();
    // Add a blank row — rmCode is empty until an item is picked → no link on it.
    fireEvent.click(screen.getByRole('button', { name: LABELS.addIngredient }));
    const rows = screen.getAllByTestId('ingredient-row');
    expect(rows).toHaveLength(3);
    // The new (last) row has no picked item → no shortcut link.
    expect(within(rows[2]).queryByTestId('ingredient-open-in-technical')).toBeNull();
    // The two seeded rows still have theirs.
    expect(screen.getAllByTestId('ingredient-open-in-technical')).toHaveLength(2);
  });
});
