/**
 * @vitest-environment jsdom
 * T-117 — WIRING parity-evidence harness (RTL/DOM-snapshot + axe-equivalent).
 *
 * Playwright + @axe-core/playwright require a running RBAC-authenticated Next
 * server + seeded Supabase formulation (the Gate-5 live-deploy run owned by
 * T-118). At the component-task layer that stack is unavailable, so — per the
 * UI-PROTOTYPE-PARITY-POLICY fallback — this harness renders the wired editor in
 * every required UI state, drives a live ingredient edit, and writes:
 *
 *   apps/web/e2e/parity-evidence/npd/T-117/<state>.html        per-state DOM snapshot
 *   apps/web/e2e/parity-evidence/npd/T-117/live-edit.html      post-edit DOM (live panels)
 *   apps/web/e2e/parity-evidence/npd/T-117/parity_report.json  region summary per state
 *   apps/web/e2e/parity-evidence/npd/T-117/parity-map.json     prototype → production map
 *   apps/web/e2e/parity-evidence/npd/T-117/a11y-fallback.json  RTL role/landmark checks
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:141-262 (RecipeScreen)
 *     sidebar Nutrition → Cost → Allergen (253-258); CompositionBar below the
 *     table (230-250); calc = useLiveCalc → recomputeCalc (T-065), memoised.
 */

import fs from 'node:fs';
import path from 'node:path';

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
import type { NutritionTargets } from '../nutrition-panel';

// FormulationEditor calls useRouter() for the post-submit router.refresh();
// stub next/navigation (no App-Router context under RTL).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-117');

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

const PANEL_LABELS: FormulationPanelLabels = {
  cost: {
    title: 'Cost & margin',
    live: 'live',
    rawMaterial: 'Raw material',
    afterYield: 'After yield ({yieldPct}%)',
    processing: 'Processing ({overheadPct}%)',
    packaging: 'Packaging',
    totalCost: 'Total cost / kg',
    perKgSuffix: '/kg',
    targetPrice: 'Target price',
    expectedYield: 'Expected yield %',
    revenuePerKg: 'Revenue / kg',
    marginPerKg: 'Margin / kg',
    marginPct: 'Margin %',
    loading: 'Computing cost…',
    empty: 'No cost yet',
    emptyBody: 'Add ingredient costs.',
    error: 'Unable to compute cost.',
    forbidden: 'No permission.',
  },
  nutrition: {
    title: 'Nutrition per 100g',
    liveNote: '· live',
    exportLabel: 'Export label',
    targetsNote: 'Targets: Protein ≥ {protein} · Salt ≤ {salt} · Fat ≤ {fat} per 100g',
    withinTarget: 'Within target',
    overTarget: 'Over target',
    overMax: 'Over max',
    energyLabel: 'Energy',
    fatLabel: 'Fat',
    saturatesLabel: 'Saturates',
    carbsLabel: 'Carbohydrate',
    sugarsLabel: 'Sugars',
    proteinLabel: 'Protein',
    saltLabel: 'Salt',
    loading: 'Computing nutrition…',
    empty: 'No nutrition yet',
    emptyBody: 'Add raw materials.',
    error: 'Unable to compute nutrition.',
    forbidden: 'No permission.',
  },
  allergen: {
    title: 'Allergens',
    subtitle: 'EU 14 mandatory allergens',
    present: 'Present',
    trace: 'Trace',
    absent: 'Absent',
    detectedHeading: '{count} allergen(s) detected:',
    mustDeclare: 'Must be declared on label.',
    noneDetected: 'No allergens detected.',
    statusLabel: '{name} — {status}',
  },
  composition: {
    title: 'Composition',
    ariaLabel: 'Ingredient composition',
    empty: 'No ingredients to display.',
    segmentLabel: '{name}: {pct}%',
  },
};

const NUTRITION_TARGETS: NutritionTargets = {
  fat_g: { target: '17.5', max: '21' },
  saturates_g: { target: '5', max: '6' },
  sugars_g: { target: '22.5', max: '27' },
  salt_g: { target: '1.5', max: '1.8' },
  protein_g: { target: '10', max: '100' },
};

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

function write(name: string, contents: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), contents, 'utf8');
}

function regionSummary(root: HTMLElement) {
  const aside = root.querySelector('[data-testid="live-panels"]');
  const panelOrder = aside
    ? Array.from(aside.querySelectorAll('[data-testid$="-panel"]')).map((el) =>
        el.getAttribute('data-testid'),
      )
    : [];
  return {
    editorRoot: Boolean(root.querySelector('[data-testid="formulation-editor"]')),
    ingredientTable: Boolean(root.querySelector('[data-testid="ingredient-table"]')),
    ingredientRows: root.querySelectorAll('[data-testid="ingredient-row"]').length,
    nutritionPanel: Boolean(root.querySelector('[data-testid="nutrition-panel"]')),
    costPanel: Boolean(root.querySelector('[data-testid="cost-panel"]')),
    allergenPanel: Boolean(root.querySelector('[data-testid="allergen-panel"]')),
    compositionBar: Boolean(root.querySelector('[data-testid="composition-bar"]')),
    panelOrder,
    placeholderSlots: root.querySelectorAll('[data-testid^="panel-"]').length,
    rawSelects: root.querySelectorAll('select').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
  };
}

function renderWired(state: React.ComponentProps<typeof FormulationEditor>['state'], data: FormulationEditorData | null) {
  return render(
    <FormulationEditor
      state={state}
      data={data}
      labels={LABELS}
      panelLabels={PANEL_LABELS}
      nutritionTargets={NUTRITION_TARGETS}
      allergenNames={ALLERGEN_NAMES}
      currency="EUR"
      canEdit={state === 'ready'}
    />,
  );
}

describe('T-117 parity evidence — wired live panels', () => {
  it('emits per-state DOM + live-edit + reports', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const report: Record<string, unknown> = {
      task: 'T-117',
      prototype_anchors: ['prototypes/design/Monopilot Design System/npd/recipe.jsx:141-262 (RecipeScreen)'],
      prd_refs: ['§17.11.1'],
      data_sources: [
        'getFormulation (T-063) — ingredients + cached calc (RLS, org-scoped)',
        'Reference.RawMaterials.nutrition_per_100g — per-RM nutrition (page loader)',
        'recomputeCalc (T-065) — client useMemo live roll-up',
        'recomputeAndCache (T-065) — persisted on save',
      ],
      generated_at: new Date().toISOString(),
      states: {} as Record<string, unknown>,
    };

    for (const [name, state, data] of [
      ['loading', 'loading', null],
      ['empty', 'empty', null],
      ['error', 'error', null],
      ['permission_denied', 'permission_denied', null],
      ['ready', 'ready', DATA],
    ] as const) {
      const { container, unmount } = renderWired(state, data);
      write(`${name}.html`, container.innerHTML);
      (report.states as Record<string, unknown>)[name] = regionSummary(container);
      unmount();
    }

    // Live edit: change a qty → cost/nutrition/composition values change in place.
    const { container } = renderWired('ready', DATA);
    const rawBefore = screen.getByTestId('cost-raw').textContent;
    const rows = screen.getAllByTestId('ingredient-row');
    fireEvent.change(within(rows[0]).getByLabelText(LABELS.colQtyPerPack), { target: { value: '0.100' } });
    const rawAfter = screen.getByTestId('cost-raw').textContent;
    write('live-edit.html', container.innerHTML);
    (report.states as Record<string, unknown>)['live_edit'] = {
      costRawBefore: rawBefore,
      costRawAfter: rawAfter,
      changed: rawBefore !== rawAfter,
    };
    write('parity_report.json', JSON.stringify(report, null, 2));

    const ready = renderWired('ready', DATA);
    const a11y = {
      task: 'T-117',
      note: 'Playwright + @axe-core blocked at the component layer (no running RBAC app server). The Playwright spec apps/web/e2e/npd-formulation-editor-panels.spec.ts runs the real axe pass at Gate-5 (T-118). RTL role/landmark checks below substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
      hasMainLandmark: Boolean(ready.container.querySelector('main')),
      sidebarOrder: Array.from(
        ready.container.querySelectorAll('[data-testid="live-panels"] [data-testid$="-panel"]'),
      ).map((el) => el.getAttribute('data-testid')),
      compositionBelowTable: Boolean(ready.container.querySelector('[data-testid="composition-bar"]')),
      noRawSelect: ready.container.querySelectorAll('select').length === 0,
      glutenPresent:
        ready.container
          .querySelector('[data-testid="allergen-cell-gluten"]')
          ?.getAttribute('data-status') === 'present',
      declaredOnLabelAlert: Boolean(ready.container.querySelector('[data-testid="allergen-panel-alert"]')),
    };
    write('a11y-fallback.json', JSON.stringify(a11y, null, 2));

    const parityMap = {
      task: 'T-117',
      anchor: 'prototypes/design/Monopilot Design System/npd/recipe.jsx:141-262',
      mapping: [
        { prototype: 'calc = useLiveCalc(ingredients, batchKg, targetPrice, yieldPct) (recipe.jsx:147)', production: 'calc = useMemo(() => recomputeCalc({...}), [rows, batchKg, targetPrice, yieldPct]) (T-065)' },
        { prototype: 'composition strip below table (recipe.jsx:230-250)', production: '<CompositionBar segments={...}/> (T-116)' },
        { prototype: '<NutritionPanel/> (recipe.jsx:255)', production: '<NutritionPanel nutrition={calc.nutrition}/> (T-113)' },
        { prototype: '<CostPanel calc targetPrice setTargetPrice yieldPct setYieldPct/> (recipe.jsx:256)', production: '<CostPanel calc targetPrice onTargetPriceChange yieldPct onYieldChange/> (T-114)' },
        { prototype: '<AllergenPanel calc/> (recipe.jsx:257)', production: '<AllergenPanel allergens={calc.allergens → EU14 statuses}/> (T-115)' },
        { prototype: 'sidebar order Nutrition → Cost → Allergen (recipe.jsx:253-258)', production: 'aside[data-testid=live-panels] renders the panels in that exact order' },
      ],
      deviations: [
        'Sidebar order corrected to Nutrition → Cost → Allergen to match the prototype (T-117 JSON listed Cost → Nutrition → Allergen; prototype + T-118 AC#1 are authoritative).',
        'Allergen presence is binary (present/absent) — recomputeCalc emits a union of codes (no trace); the trace token stays available for the cascade read-model.',
        'Nutrition traffic-light targets use EU per-100g guideline defaults (no targets table provisioned yet — PRD §17.11.1 later slice); the nutrient VALUES are real (Reference.RawMaterials × pct).',
      ],
    };
    write('parity-map.json', JSON.stringify(parityMap, null, 2));

    // Real assertions so the evidence run is also a gate.
    const readyState = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(readyState.editorRoot).toBe(true);
    expect(readyState.nutritionPanel).toBe(true);
    expect(readyState.costPanel).toBe(true);
    expect(readyState.allergenPanel).toBe(true);
    expect(readyState.compositionBar).toBe(true);
    expect(readyState.panelOrder).toEqual(['nutrition-panel', 'cost-panel', 'allergen-panel']);
    expect(readyState.placeholderSlots).toBe(0);
    expect(readyState.rawSelects).toBe(0);
    expect((report.states as Record<string, { changed: boolean }>).live_edit.changed).toBe(true);
    expect(a11y.glutenPresent).toBe(true);
    expect(a11y.declaredOnLabelAlert).toBe(true);
  });
});
