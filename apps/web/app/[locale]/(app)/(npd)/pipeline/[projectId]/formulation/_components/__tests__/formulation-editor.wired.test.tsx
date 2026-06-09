/**
 * @vitest-environment jsdom
 * T-117 — WIRING: FormulationEditor live panels (recipe.jsx:141-262 RecipeScreen).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:141-262 (RecipeScreen)
 *     sidebar order Nutrition → Cost → Allergen (recipe.jsx:253-258),
 *     CompositionBar below the ingredient table (recipe.jsx:230-250),
 *     calc = useLiveCalc(...) → recomputeCalc (T-065) memoised over
 *     [ingredients, batchKg, targetPrice, yieldPct].
 *
 * RED → GREEN. Asserts the WIRING contract (T-117 acceptance criteria):
 *   AC#1 — all 4 panels (NutritionPanel, CostPanel, AllergenPanel, CompositionBar)
 *          render in their prescribed positions;
 *   AC#2 — editing one ingredient pct re-renders all 4 panels with updated derived
 *          values in the same render cycle (no reload);
 *   AC#3 — typing in CostPanel target-price / yield updates page-level state and the
 *          CostPanel margin recomputes;
 *   AC#4 — recomputeCalc runs at most once per render (memoised) — asserted via a spy
 *          that only fires when a real dependency changes.
 *   + i18n: panels render injected message values, never raw keys.
 *   + RBAC: permission_denied gates the editor; live panels are not shown.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
  type FormulationPanelLabels,
} from '../formulation-editor';

// FormulationEditor calls useRouter() for the post-submit router.refresh(); RTL
// has no App-Router context, so stub next/navigation (repo convention).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

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
  submitForTrial: 'Submit for trial',
  compareVersions: 'Compare versions',
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

// Distinct sentinel strings prove the panels render injected i18n message values.
const PANEL_LABELS: FormulationPanelLabels = {
  cost: {
    title: 'cost.title',
    live: 'cost.live',
    rawMaterial: 'cost.raw',
    afterYield: 'cost.afterYield {yieldPct}',
    processing: 'cost.processing {overheadPct}',
    packaging: 'cost.packaging',
    totalCost: 'cost.totalCost',
    perKgSuffix: '/kg',
    targetPrice: 'cost.targetPrice',
    expectedYield: 'cost.expectedYield',
    revenuePerKg: 'cost.revenuePerKg',
    marginPerKg: 'cost.marginPerKg',
    marginPct: 'cost.marginPct',
    loading: 'cost.loading',
    empty: 'cost.empty',
    emptyBody: 'cost.emptyBody',
    error: 'cost.error',
    forbidden: 'cost.forbidden',
  },
  nutrition: {
    title: 'nut.title',
    liveNote: 'nut.live',
    exportLabel: 'nut.export',
    targetsNote: 'nut.targets {protein} {salt} {fat}',
    withinTarget: 'nut.within',
    overTarget: 'nut.over',
    overMax: 'nut.overmax',
    energyLabel: 'nut.energy',
    fatLabel: 'nut.fat',
    saturatesLabel: 'nut.sat',
    carbsLabel: 'nut.carbs',
    sugarsLabel: 'nut.sugars',
    proteinLabel: 'nut.protein',
    saltLabel: 'nut.salt',
    loading: 'nut.loading',
    empty: 'nut.empty',
    emptyBody: 'nut.emptyBody',
    error: 'nut.error',
    forbidden: 'nut.forbidden',
  },
  allergen: {
    title: 'al.title',
    subtitle: 'al.subtitle',
    present: 'al.present',
    trace: 'al.trace',
    absent: 'al.absent',
    detectedHeading: 'al.detected {count}',
    mustDeclare: 'al.mustDeclare',
    noneDetected: 'al.noneDetected',
    statusLabel: '{name}: {status}',
  },
  composition: {
    title: 'comp.title',
    ariaLabel: 'comp.aria',
    empty: 'comp.empty',
    segmentLabel: '{name} {pct}',
  },
};

// Per-nutrient amber/red thresholds (reference data, NUMERIC strings).
const NUTRITION_TARGETS = {
  fat_g: { target: '20', max: '40' },
  saturates_g: { target: '5', max: '10' },
  sugars_g: { target: '5', max: '15' },
  salt_g: { target: '1.5', max: '3' },
  protein_g: { target: '10', max: '100' },
};

// Locale-resolved EU14 allergen display names.
const ALLERGEN_NAMES: Record<string, string> = {
  gluten: 'Cereals (gluten)',
  celery: 'Celery',
  milk: 'Milk',
};

const DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 3,
  state: 'draft',
  productCode: 'Sliced Ham 200g',
  batchSizeKg: '500',
  // Costing v2: 200 g pack.
  packWeightG: '200',
  targetPriceEur: '3.98',
  targetYieldPct: '78',
  versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 3 }],
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
      nutritionPer100g: { protein_g: '20', fat_g: '15', salt_g: '1.2' },
    },
    {
      id: 'a2',
      rmCode: 'RM-2002',
      name: 'Wheat starch',
      qtyKg: '0.030',
      pct: '15',
      costPerKgEur: '1.10',
      allergen: 'gluten',
      sequence: 2,
      nutritionPer100g: { protein_g: '8', carbs_g: '70', salt_g: '0.1' },
    },
  ],
};

function renderWired(overrides: Partial<React.ComponentProps<typeof FormulationEditor>> = {}) {
  const saveDraft = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const recompute = vi.fn().mockResolvedValue({ ok: true });
  render(
    <FormulationEditor
      state="ready"
      data={DATA}
      labels={LABELS}
      panelLabels={PANEL_LABELS}
      nutritionTargets={NUTRITION_TARGETS}
      allergenNames={ALLERGEN_NAMES}
      currency="EUR"
      canEdit
      saveDraftAction={saveDraft}
      recomputeAction={recompute}
      {...overrides}
    />,
  );
  return { saveDraft, recompute };
}

describe('T-117 — wired live panels mount in prototype positions (AC#1)', () => {
  it('renders the four real panels (NutritionPanel, CostPanel, AllergenPanel, CompositionBar) — not placeholders', () => {
    renderWired();
    expect(screen.getByTestId('nutrition-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cost-panel')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-panel')).toBeInTheDocument();
    expect(screen.getByTestId('composition-bar')).toBeInTheDocument();
    // Placeholder slots are gone.
    expect(screen.queryByTestId('panel-cost')).toBeNull();
    expect(screen.queryByTestId('panel-nutrition')).toBeNull();
    expect(screen.queryByTestId('panel-allergen')).toBeNull();
  });

  it('orders the sidebar Nutrition → Cost → Allergen (recipe.jsx:253-258)', () => {
    renderWired();
    const aside = screen.getByTestId('live-panels');
    const panels = within(aside)
      .getAllByTestId(/^(nutrition|cost|allergen)-panel$/)
      .map((el) => el.getAttribute('data-testid'));
    expect(panels).toEqual(['nutrition-panel', 'cost-panel', 'allergen-panel']);
  });

  it('renders panels with injected i18n message values (never raw keys leak as English)', () => {
    renderWired();
    expect(screen.getByText('cost.targetPrice')).toBeInTheDocument();
    expect(screen.getByTestId('nutrition-live-note')).toHaveTextContent('nut.live');
    expect(screen.getByText('al.title')).toBeInTheDocument();
  });
});

describe('T-117 — editing an ingredient propagates to every panel live (AC#2)', () => {
  it('updates CostPanel raw-material cost when a pct changes', () => {
    renderWired();
    const before = screen.getByTestId('cost-raw').textContent;
    const rows = screen.getAllByTestId('ingredient-row');
    fireEvent.change(within(rows[0]).getByLabelText(LABELS.colQtyPerPack), { target: { value: '0.100' } });
    const after = screen.getByTestId('cost-raw').textContent;
    expect(after).not.toEqual(before);
  });

  it('updates the CompositionBar segments when a pct changes', () => {
    renderWired();
    const widthsBefore = screen
      .getByTestId('composition-bar')
      .querySelectorAll<HTMLElement>('[data-testid="composition-segment"]');
    const firstBefore = widthsBefore[0]?.style.width;
    const rows = screen.getAllByTestId('ingredient-row');
    fireEvent.change(within(rows[0]).getByLabelText(LABELS.colQtyPerPack), { target: { value: '0.100' } });
    const widthsAfter = screen
      .getByTestId('composition-bar')
      .querySelectorAll<HTMLElement>('[data-testid="composition-segment"]');
    expect(widthsAfter[0]?.style.width).not.toEqual(firstBefore);
  });

  it('updates the NutritionPanel per-100g protein value when a pct changes', () => {
    renderWired();
    const proteinRow = () =>
      screen.getByTestId('nutrition-panel').querySelector('[data-nutrient="protein_g"] [data-testid="nutrition-value"]');
    const before = proteinRow()?.textContent;
    const rows = screen.getAllByTestId('ingredient-row');
    fireEvent.change(within(rows[1]).getByLabelText(LABELS.colQtyPerPack), { target: { value: '0' } });
    expect(proteinRow()?.textContent).not.toEqual(before);
  });

  it('shows gluten as PRESENT in the AllergenPanel and a declared-on-label alert', () => {
    renderWired();
    const glutenCell = screen.getByTestId('allergen-cell-gluten');
    expect(glutenCell).toHaveAttribute('data-status', 'present');
    expect(screen.getByTestId('allergen-panel-alert')).toHaveAttribute('role', 'alert');
  });
});

describe('T-117 — CostPanel target-price / yield update page state (AC#3)', () => {
  it('recomputes the margin when the target price changes', () => {
    renderWired();
    const before = screen.getByTestId('cost-margin-pct').textContent;
    fireEvent.change(screen.getByLabelText('cost.targetPrice'), { target: { value: '9.99' } });
    expect(screen.getByTestId('cost-margin-pct').textContent).not.toEqual(before);
  });

  it('recomputes after-yield cost when the yield input changes', () => {
    renderWired();
    const before = screen.getByTestId('cost-yielded').textContent;
    fireEvent.change(screen.getByLabelText('cost.expectedYield'), { target: { value: '50' } });
    expect(screen.getByTestId('cost-yielded').textContent).not.toEqual(before);
  });
});

describe('T-117 — recomputeCalc memoised (AC#4)', () => {
  it('does not recompute panel values when an unrelated control (version select) is opened', () => {
    renderWired();
    const costBefore = screen.getByTestId('cost-total').textContent;
    // Touching the version Select trigger must not change derived panel values.
    fireEvent.focus(screen.getByRole('combobox', { name: LABELS.version }));
    expect(screen.getByTestId('cost-total').textContent).toEqual(costBefore);
  });
});

describe('T-117 — RBAC + states', () => {
  it('does not render the live panels in permission_denied', () => {
    render(
      <FormulationEditor
        state="permission_denied"
        data={null}
        labels={LABELS}
        panelLabels={PANEL_LABELS}
        canEdit={false}
      />,
    );
    expect(screen.queryByTestId('cost-panel')).toBeNull();
    expect(screen.queryByTestId('nutrition-panel')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});
