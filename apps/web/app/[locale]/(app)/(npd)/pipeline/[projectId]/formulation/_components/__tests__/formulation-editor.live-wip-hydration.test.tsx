/**
 * @vitest-environment jsdom
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
  type FormulationPanelLabels,
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
};

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
    targetsNote: 'nut.targets',
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

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const WIP_DEF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WIP_ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LIVE_COST = '187.9619';
const LINE_KEY = `WIP-PARENT:${WIP_DEF_ID}`;

function makeWipData(sequence: number, costPerKgEur: string | null = null): FormulationEditorData {
  return {
    projectId: PROJECT_ID,
    versionId: VERSION_ID,
    versionNumber: 1,
    state: 'draft',
    productCode: 'Test FG',
    batchSizeKg: '0.2',
    packWeightG: '200',
    targetPriceEur: '3.98',
    targetYieldPct: '78',
    versions: [{ id: VERSION_ID, versionNumber: 1 }],
    ingredients: [
      {
        id: 'wip-row',
        rmCode: 'WIP-PARENT',
        itemId: WIP_ITEM_ID,
        wipDefinitionId: WIP_DEF_ID,
        wipDefinitionName: 'Parent v3',
        name: 'Parent v3',
        qtyKg: '0.823456',
        pct: '100',
        costPerKgEur,
        allergen: null,
        sequence,
      },
    ],
  };
}

describe('FormulationEditor live WIP cost hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates canonical live WIP cost into the row and saveDraft payload', async () => {
    const resolveLiveWipCostsAction = vi.fn().mockResolvedValue({
      ok: true,
      costsByLineKey: { [LINE_KEY]: LIVE_COST },
    });
    const saveDraftAction = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        versionId: VERSION_ID,
        ingredientCount: 1,
        ingredients: [
          {
            rmCode: 'WIP-PARENT',
            wipDefinitionId: WIP_DEF_ID,
            costPerKgEur: LIVE_COST,
            derived: true,
          },
        ],
      },
    });

    render(
      <FormulationEditor
        state="ready"
        data={makeWipData(4)}
        labels={LABELS}
        panelLabels={PANEL_LABELS}
        currency="EUR"
        canEdit
        saveDraftAction={saveDraftAction}
        resolveLiveWipCostsAction={resolveLiveWipCostsAction}
      />,
    );

    await waitFor(() => {
      expect(resolveLiveWipCostsAction).toHaveBeenCalledWith({
        versionId: VERSION_ID,
        wipLines: [
          {
            rmCode: 'WIP-PARENT',
            wipDefinitionId: WIP_DEF_ID,
            qtyKg: '0.823456',
          },
        ],
      });
    });

    const row = screen.getByTestId('ingredient-row');
    await waitFor(() => {
      expect(within(row).getByLabelText(LABELS.colCostPerKg)).toHaveValue(LIVE_COST);
    });

    fireEvent.change(within(row).getByLabelText(LABELS.colQtyPerPack), {
      target: { value: '0.823500' },
    });

    await vi.advanceTimersByTimeAsync(800);

    await waitFor(() => {
      expect(saveDraftAction).toHaveBeenCalled();
    });

    const savePayload = saveDraftAction.mock.calls.at(-1)?.[0] as {
      ingredients: Array<{ costPerKgEur: string | null; rmCode: string; sequence: number }>;
    };
    expect(savePayload.ingredients[0]).toMatchObject({
      rmCode: 'WIP-PARENT',
      costPerKgEur: LIVE_COST,
      sequence: 1,
    });
  });

  it('does not override a manually entered WIP cost', async () => {
    const resolveLiveWipCostsAction = vi.fn().mockResolvedValue({
      ok: true,
      costsByLineKey: { [LINE_KEY]: LIVE_COST },
    });

    render(
      <FormulationEditor
        state="ready"
        data={makeWipData(2, null)}
        labels={LABELS}
        panelLabels={PANEL_LABELS}
        currency="EUR"
        canEdit
        resolveLiveWipCostsAction={resolveLiveWipCostsAction}
      />,
    );

    const row = screen.getByTestId('ingredient-row');
    const costInput = within(row).getByLabelText(LABELS.colCostPerKg);

    await waitFor(() => {
      expect(costInput).toHaveValue(LIVE_COST);
    });

    fireEvent.change(costInput, { target: { value: '5' } });
    expect(costInput).toHaveValue('5');
  });

  it('keeps a persisted WIP cost from the database instead of overlaying live cost', async () => {
    const PERSISTED_COST = '3.7500';
    const resolveLiveWipCostsAction = vi.fn().mockResolvedValue({
      ok: true,
      costsByLineKey: { [LINE_KEY]: LIVE_COST },
    });

    render(
      <FormulationEditor
        state="ready"
        data={makeWipData(13, PERSISTED_COST)}
        labels={LABELS}
        panelLabels={PANEL_LABELS}
        currency="EUR"
        canEdit
        resolveLiveWipCostsAction={resolveLiveWipCostsAction}
      />,
    );

    const row = screen.getByTestId('ingredient-row');
    const costInput = within(row).getByLabelText(LABELS.colCostPerKg);

    await waitFor(() => {
      expect(resolveLiveWipCostsAction).toHaveBeenCalled();
    });

    expect(costInput).toHaveValue(PERSISTED_COST);
    expect(costInput).not.toHaveValue(LIVE_COST);
  });
});

describe('live WIP cost client helpers', () => {
  it('toEditable preserves persisted WIP costPerKgEur from server data', async () => {
    const { toEditable } = await import('../formulation-editor');
    const rows = toEditable(makeWipData(13, '3.7500'));
    expect(rows[0]?.costPerKgEur).toBe('3.7500');
  });

  it('applyLiveWipCosts overlays only empty WIP rows', async () => {
    const { applyLiveWipCosts, mergeSavedIngredientCosts } = await import('../formulation-editor');
    const WIP_ROW = {
      id: 'wip-1',
      rmCode: 'WIP-PARENT',
      itemId: 'item-wip',
      wipDefinitionId: 'def-parent',
      wipDefinitionName: 'Parent v3',
      substituteItemId: null,
      substituteItemCode: null,
      substituteItemName: null,
      name: 'Parent v3',
      qtyKg: '0.823456',
      pct: '0',
      costPerKgEur: '',
      allergens: [],
      sequence: 4,
    };

    const rows = applyLiveWipCosts([WIP_ROW], { 'WIP-PARENT:def-parent': LIVE_COST });
    expect(rows[0]?.costPerKgEur).toBe(LIVE_COST);

    const manual = applyLiveWipCosts([{ ...WIP_ROW, costPerKgEur: '5' }], {
      'WIP-PARENT:def-parent': LIVE_COST,
    });
    expect(manual[0]?.costPerKgEur).toBe('5');

    const merged = mergeSavedIngredientCosts([WIP_ROW], [
      {
        rmCode: 'WIP-PARENT',
        wipDefinitionId: 'def-parent',
        costPerKgEur: LIVE_COST,
        derived: true,
      },
    ]);
    expect(merged[0]?.costPerKgEur).toBe(LIVE_COST);
  });

  it('mergeSavedIngredientCosts matches by rmCode + wipDefinitionId (not client sequence)', async () => {
    const { mergeSavedIngredientCosts } = await import('../formulation-editor');
    const WIP_ROW = {
      id: 'wip-1',
      rmCode: 'WIP-PARENT',
      itemId: 'item-wip',
      wipDefinitionId: 'def-parent',
      substituteItemId: null,
      substituteItemCode: null,
      substituteItemName: null,
      name: 'Parent v3',
      qtyKg: '0.823456',
      pct: '0',
      costPerKgEur: '',
      allergens: [],
      sequence: 4,
    };

    const merged = mergeSavedIngredientCosts([WIP_ROW], [
      {
        rmCode: 'WIP-PARENT',
        wipDefinitionId: 'def-parent',
        costPerKgEur: LIVE_COST,
        derived: true,
      },
    ]);
    expect(merged[0]?.costPerKgEur).toBe(LIVE_COST);
  });
});
