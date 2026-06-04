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
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colPct: '% w/w',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  totalPctWarning: 'Ingredient total is {pct}%. Adjust to exactly 100% before submitting for trial.',
  composition: 'Composition',
  pctRangeError: 'Percentage must be between 0 and 100.',
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
      pct: '85',
      costPerKgEur: '4.20',
      allergen: null,
      sequence: 1,
    },
    {
      id: 'a2',
      rmCode: 'RM-2002',
      name: 'Water',
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
    // Toolbar: batch size input + version select + target price input.
    expect(screen.getByLabelText(LABELS.batchSize)).toHaveValue(500);
    expect(screen.getByLabelText(LABELS.targetPrice)).toBeInTheDocument();
    // shadcn Select (NOT a raw <select>) for version.
    expect(screen.getByRole('combobox', { name: LABELS.version })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
    // Table columns.
    expect(screen.getByRole('columnheader', { name: LABELS.colIngredient })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colPct })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colCostPerKg })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colContribution })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: LABELS.colAllergen })).toBeInTheDocument();
  });

  it('renders an ingredient row per data row with code, pct, cost, contribution and allergen', () => {
    renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByDisplayValue('RM-1001')).toBeInTheDocument();
    expect(first.getByDisplayValue('85')).toBeInTheDocument();
    expect(first.getByDisplayValue('4.20')).toBeInTheDocument();
    // contribution = (85/100 * 4.20) = 3.570 €, NUMERIC-exact string (no float).
    expect(first.getByTestId('ingredient-contribution')).toHaveTextContent('3.570');
    // allergen badge present on the second row.
    const second = within(rows[1]);
    expect(second.getByText('celery')).toBeInTheDocument();
  });

  it('shows a total row with the exact percent sum and a warning when ≠ 100', () => {
    renderEditor();
    const total = screen.getByTestId('total-row');
    // 85 + 10 = 95.000
    expect(within(total).getByTestId('total-pct')).toHaveTextContent('95.000');
    expect(screen.getByTestId('total-pct-warning')).toBeInTheDocument();
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
    const pctInput = within(rows[0]).getByLabelText(LABELS.colPct);

    fireEvent.change(pctInput, { target: { value: '80' } });
    fireEvent.change(pctInput, { target: { value: '82' } });
    fireEvent.change(pctInput, { target: { value: '84' } });

    // Before debounce elapses: no save.
    act(() => vi.advanceTimersByTime(799));
    expect(saveDraft).not.toHaveBeenCalled();

    // At 800 ms: exactly one save.
    act(() => vi.advanceTimersByTime(1));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('shows an inline Zod error and does NOT save when pct is out of [0,100]', () => {
    vi.useFakeTimers();
    const { saveDraft } = renderEditor();
    const rows = screen.getAllByTestId('ingredient-row');
    const pctInput = within(rows[0]).getByLabelText(LABELS.colPct);

    fireEvent.change(pctInput, { target: { value: '110' } });
    fireEvent.blur(pctInput);

    expect(within(rows[0]).getByText(LABELS.pctRangeError)).toBeInTheDocument();

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
    expect(within(rows[0]).getByLabelText(LABELS.colPct)).toBeDisabled();
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
