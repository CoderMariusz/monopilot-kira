'use client';

/**
 * T-066 — FormulationEditor (RecipeScreen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264
 *     (IngredientRow + RecipeScreen — toolbar, ingredients table, total row,
 *      total-pct warning, composition bar, side panels)
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:79-153
 *     (FormulationEditor — "auto-save on blur" editor contract)
 *
 * Translation notes (prototype → production):
 *   - window.NPD_INGREDIENTS_DEFAULT mock     → server-read formulation_ingredients (page.tsx, withOrgContext / RLS)
 *   - bare <input> batch / target price       → @monopilot/ui Input
 *   - raw <select> version picker             → @monopilot/ui Select (raw <select> is a red-line)
 *   - "Save draft" / "Submit for trial"      → @monopilot/ui Button + saveDraftAction Server Action (T-064, merged)
 *   - useLiveCalc(...) client compute         → live total/contribution via Dec (NUMERIC-exact); full
 *                                               cost/nutrition/allergen recompute is the recomputeAction (T-065, merged)
 *   - NutritionPanel / CostPanel / AllergenPanel → placeholder slots (T-113-115 own the panels)
 *   - .alert amber totalPct ≠ 100 banner     → inline warning region
 *   - composition multi-color strip          → Tailwind flex strip with per-ingredient widths
 *
 * BEHAVIOUR CONTRACT (PRD §17.11.1):
 *   - field edits debounce 800 ms → ONE saveDraft call per burst, then a recompute;
 *   - pct ∈ [0,100] (Zod) — out-of-range shows an inline error and BLOCKS the save;
 *   - RBAC is resolved server-side (`canEdit`); the client never re-grants permission.
 *
 * Money/percent values are decimal STRINGS end-to-end — no `Number()` on the
 * money path. RBAC (`permission_denied`) is decided in page.tsx and only mirrored
 * here as a read-only `canEdit` flag.
 */

import React from 'react';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { Dec, recomputeCalc, type RecomputeResult } from '@monopilot/domain';

import {
  IngredientRow,
  isDecimalString,
  type EditableIngredient,
  type IngredientField,
  type IngredientRowLabels,
  type RowError,
} from './ingredient-row';
import { searchItems, type ItemPickerOption } from '../../../../../../../(npd)/fa/actions/search-items';
import { type ItemSearchFn } from '../../../../_components/item-picker';
import {
  AllergenPanel,
  EU14_ALLERGEN_CODES,
  type AllergenPanelLabels,
  type AllergenStatus,
} from './allergen-panel';
import { CompositionBar, type CompositionBarLabels, type CompositionSegment } from './composition-bar';
import { CostPanel, type CostBreakdown, type CostPanelLabels } from './cost-panel';
import {
  NutritionPanel,
  NUTRIENT_ROW_ORDER,
  type NutritionPanelLabels,
  type NutritionRow,
  type NutritionTargets,
} from './nutrition-panel';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

const DEBOUNCE_MS = 800;

export type FormulationEditorData = {
  projectId: string;
  versionId: string;
  versionNumber: number;
  state: string;
  productCode: string | null;
  batchSizeKg: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size), from the project. */
  packWeightG: string | null;
  targetPriceEur: string | null;
  targetYieldPct: string | null;
  versions: Array<{ id: string; versionNumber: number }>;
  ingredients: Array<{
    id: string;
    rmCode: string;
    /** Lane-B: FK to the real items master row (null for legacy free-text rows). */
    itemId?: string | null;
    name: string;
    /** Costing v2: amount used in ONE pack, in kg. */
    qtyKg: string | null;
    pct: string | null;
    costPerKgEur: string | null;
    allergen: string | null;
    sequence: number;
    /**
     * Optional per-100g nutrient values for the RM (NUMERIC strings) read
     * server-side from Reference.RawMaterials.nutrition_per_100g (T-065 source).
     * Feeds the live NutritionPanel weighted-sum; omitted RMs contribute 0.
     */
    nutritionPer100g?: Record<string, string>;
  }>;
};

/**
 * Pre-resolved i18n message bundles for the four live panels (resolved
 * server-side by page.tsx via getTranslations on each panel namespace, then
 * threaded down). Keeps the panels pure islands — they never call next-intl.
 */
export type FormulationPanelLabels = {
  cost: CostPanelLabels;
  nutrition: NutritionPanelLabels;
  allergen: AllergenPanelLabels;
  composition: CompositionBarLabels;
};

export type FormulationLabels = {
  title: string;
  subtitle: string;
  batchSize: string;
  version: string;
  targetPrice: string;
  saveDraft: string;
  saving: string;
  saved: string;
  saveError: string;
  submitForTrial: string;
  compareVersions: string;
  ingredients: string;
  addIngredient: string;
  colIngredient: string;
  /** Costing v2: "Qty / pack (kg)" column header. */
  colQtyPerPack: string;
  colCostPerKg: string;
  colContribution: string;
  colAllergen: string;
  deleteRow: string;
  total: string;
  /** Costing v2 ICU-ish "Total is {qty} kg vs pack {pack} kg…" — replaced client-side. */
  qtyBalanceWarning: string;
  /** Shown when pack weight is unset so the balance gate can't be evaluated. */
  packWeightUnsetHint: string;
  composition: string;
  qtyRangeError: string;
  rmCodeRequired: string;
  livePanels: string;
  livePanelsHint: string;
  costPanelTitle: string;
  nutritionPanelTitle: string;
  allergenPanelTitle: string;
  panelPlaceholder: string;
  loading: string;
  empty: string;
  emptyBody: string;
  createDraft: string;
  creatingDraft: string;
  createDraftError: string;
  error: string;
  forbidden: string;
  locked: string;
  noAllergen: string;
  /** Lane-B: ingredient-row item-picker labels (combobox over the items master). */
  chooseItem: string;
  picker: IngredientRowLabels['picker'];
};

export type SaveDraftAction = (input: {
  projectId: string;
  versionId: string;
  ingredients: Array<{
    rmCode: string;
    /** Lane-B: real items-master FK (null when no item is wired). */
    itemId: string | null;
    qtyKg: string | null;
    pct: string | null;
    costPerKgEur: string | null;
    allergensInherited: string[];
    sequence: number;
  }>;
}) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

export type RecomputeAction = (input: {
  projectId: string;
  versionId: string;
}) => Promise<unknown>;

/** Row-level Zod schema (Costing v2): qtyKg ≥ 0, rm_code required (AC#3). */
const RowSchema = z.object({
  rmCode: z.string().trim().min(1),
  qtyKg: z
    .string()
    .refine((v) => isDecimalString(v), { params: { kind: 'range' } })
    .refine((v) => isDecimalString(v) && Number(v) >= 0, { params: { kind: 'range' } }),
});

const COMPOSITION_COLORS = [
  'bg-[#D97757]',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-lime-500',
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Processing overhead % used by the CostPanel "Processing ({overheadPct}%)" line.
 * `recomputeCalc` applies this same default (recipe.jsx:8-12) but does not echo it
 * back in its result, so the panel label is supplied from the same constant.
 */
const DEFAULT_OVERHEAD_PCT = '8';

/**
 * Map the editor's editable rows + per-RM nutrition into recomputeCalc inputs.
 *
 * Costing v2: qtyKg drives the cost roll-up. Nutrition is a per-100g mass-weighted
 * sum, so we derive each row's effective `pct` from its qty share (qtyKg / ΣqtyKg)
 * — that keeps nutrition live and consistent with the by-mass composition, even
 * though pct is no longer authored directly.
 */
function toRecomputeIngredients(
  rows: EditableIngredient[],
  nutritionByRm: Map<string, Record<string, string>>,
): Parameters<typeof recomputeCalc>[0]['ingredients'] {
  let totalQty = Dec.zero();
  for (const r of rows) if (isDecimalString(r.qtyKg)) totalQty = totalQty.add(Dec.from(r.qtyKg));
  const totalQtyNonZero = !totalQty.isZero();
  return rows.map((r) => {
    const nutrition = nutritionByRm.get(r.rmCode);
    const qtyValid = isDecimalString(r.qtyKg);
    // Mass-fraction pct for nutrition; fall back to the legacy pct field if no qty.
    const pct =
      qtyValid && totalQtyNonZero
        ? Dec.from(r.qtyKg).div(totalQty).mul(Dec.from('100')).toFixed(6)
        : isDecimalString(r.pct)
          ? r.pct
          : null;
    return {
      rmCode: r.rmCode,
      qtyKg: qtyValid ? r.qtyKg : null,
      pct,
      costPerKgEur: isDecimalString(r.costPerKgEur) ? r.costPerKgEur : null,
      allergensInherited: r.allergen ? [r.allergen] : [],
      ...(nutrition ? { nutritionPer100g: nutrition } : {}),
    };
  });
}

/** calc roll-up → CostPanel breakdown (adds the overhead% the panel label needs). */
function toCostBreakdown(calc: RecomputeResult): CostBreakdown {
  return {
    rawCost: calc.rawCost,
    yieldedCost: calc.yieldedCost,
    processing: calc.processing,
    packaging: calc.packaging,
    costPerKg: calc.costPerKg,
    revenuePerKg: calc.revenuePerKg,
    marginPct: calc.marginPct,
    overheadPct: DEFAULT_OVERHEAD_PCT,
  };
}

/** calc.nutrition (record) → ordered NutritionPanel rows (units from the code). */
function toNutritionRows(nutrition: Record<string, string>): NutritionRow[] {
  return NUTRIENT_ROW_ORDER.filter((code) => code in nutrition).map((code) => ({
    nutrientCode: code,
    per100g: nutrition[code],
    unit: code === 'energy_kj' ? 'kJ' : 'g',
  }));
}

/**
 * calc.allergens (detected union) → full EU14 presence list for the AllergenPanel.
 * Detected codes are 'present'; the remaining EU14 codes are 'absent'. The compute
 * path emits a binary union (no trace), so every detected allergen is 'present'.
 */
function toAllergenStatuses(detected: string[], names: Record<string, string>): AllergenStatus[] {
  const present = new Set(detected);
  return EU14_ALLERGEN_CODES.map((code) => ({
    code,
    name: names[code] ?? code,
    status: present.has(code) ? ('present' as const) : ('absent' as const),
  }));
}

/**
 * Costing v2 — editable rows → CompositionBar segments. Segment widths are the
 * qty share (qtyKg / Σ qtyKg); the bar normalises whatever value it gets in
 * `pct` against the total, so we feed it qtyKg to get the by-mass composition.
 */
function toCompositionSegments(rows: EditableIngredient[]): CompositionSegment[] {
  return rows.map((r) => ({
    id: r.id,
    rmCode: r.rmCode,
    name: r.name,
    pct: isDecimalString(r.qtyKg) ? r.qtyKg : '0',
  }));
}

function toEditable(data: FormulationEditorData): EditableIngredient[] {
  return data.ingredients.map((ing) => ({
    id: ing.id,
    rmCode: ing.rmCode,
    itemId: ing.itemId ?? null,
    name: ing.name,
    qtyKg: ing.qtyKg ?? '',
    pct: ing.pct ?? '',
    costPerKgEur: ing.costPerKgEur ?? '',
    allergen: ing.allergen,
    sequence: ing.sequence,
  }));
}

/** Pack weight (g, NUMERIC string) → kg (NUMERIC string), exact; null/0/invalid → null. */
function packWeightKgFromG(grams: string | null): string | null {
  if (!grams || !isDecimalString(grams)) return null;
  const kg = Dec.from(grams).div(Dec.from('1000'));
  return kg.isZero() ? null : kg.toFixed(6);
}

/** Yield % as a layout-only integer (default 0 when unset/invalid). */
function parseYield(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function StateNotice({ state, labels }: { state: PageState; labels: FormulationLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">🧪</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

/** Placeholder live panel — the full T-113-115 panels mount into these slots. */
function PanelSlot({ testId, title, placeholder }: { testId: string; title: string; placeholder: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">{placeholder}</p>
      </CardContent>
    </Card>
  );
}

export function FormulationEditor({
  state = 'ready',
  data,
  labels,
  panelLabels,
  nutritionTargets,
  allergenNames,
  currency = 'EUR',
  canEdit = false,
  saveDraftAction,
  recomputeAction,
  searchItemsAction,
  projectId,
  createDraftAction,
}: {
  state?: PageState;
  data: FormulationEditorData | null;
  labels: FormulationLabels;
  /** Project id — needed to create the FIRST draft from the empty Recipe stage. */
  projectId?: string;
  /** Injected create-draft Server Action (empty-state "Create draft" button). */
  createDraftAction?: (input: { projectId: string }) => Promise<{ ok: boolean }>;
  /** Pre-resolved i18n bundles for the four live panels (T-113-116). */
  panelLabels?: FormulationPanelLabels;
  /** Per-nutrient amber/red thresholds (reference data, NUMERIC strings). */
  nutritionTargets?: NutritionTargets;
  /** Locale-resolved EU14 allergen display names, keyed by code. */
  allergenNames?: Record<string, string>;
  /** ISO-4217 currency code for the CostPanel (default EUR). */
  currency?: string;
  canEdit?: boolean;
  saveDraftAction?: SaveDraftAction;
  recomputeAction?: RecomputeAction;
  /** Lane-B: org-scoped item-search action for the ingredient picker (defaults to searchItems). */
  searchItemsAction?: ItemSearchFn;
}) {
  const searchAction: ItemSearchFn = searchItemsAction ?? searchItems;
  const [creatingDraft, setCreatingDraft] = React.useState(false);
  const onCreateDraft = React.useCallback(async () => {
    if (!createDraftAction || !projectId || creatingDraft) return;
    setCreatingDraft(true);
    try {
      const result = await createDraftAction({ projectId });
      if (result.ok) {
        // Reload so the page's RSC loader re-fetches the just-created draft.
        window.location.reload();
        return;
      }
      window.alert(labels.createDraftError);
      setCreatingDraft(false);
    } catch {
      window.alert(labels.createDraftError);
      setCreatingDraft(false);
    }
  }, [createDraftAction, projectId, creatingDraft, labels.createDraftError]);
  const locked = data?.state === 'locked';
  const editable = canEdit && !locked && state === 'ready';

  const [rows, setRows] = React.useState<EditableIngredient[]>(data ? toEditable(data) : []);
  const [errors, setErrors] = React.useState<Record<string, RowError>>({});
  // Costing v2: batch size is READ-ONLY = pack weight (g→kg). No editable batch input.
  const packWeightKg = packWeightKgFromG(data?.packWeightG ?? null);
  const [targetPrice, setTargetPrice] = React.useState<string>(data?.targetPriceEur ?? '');
  const [yieldPct, setYieldPct] = React.useState<number>(parseYield(data?.targetYieldPct));
  const [versionId, setVersionId] = React.useState<string>(data?.versionId ?? '');
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');

  // Per-RM nutrition is reference data (stable across pct edits); derive once.
  const nutritionByRm = React.useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const ing of data?.ingredients ?? []) {
      if (ing.nutritionPer100g) map.set(ing.rmCode, ing.nutritionPer100g);
    }
    return map;
  }, [data]);

  /**
   * Live cost/nutrition/allergen roll-up — the production equivalent of the
   * prototype `useLiveCalc` (recipe.jsx:147). Pure `recomputeCalc` (T-065) runs
   * AT MOST ONCE per render, only when an actual dependency
   * [rows, batchKg, targetPrice, yieldPct] changes (AC#4). The persisted
   * recompute (recomputeAndCache) still runs server-side on save.
   */
  const calc = React.useMemo<RecomputeResult>(
    () =>
      recomputeCalc({
        ingredients: toRecomputeIngredients(rows, nutritionByRm),
        targetPriceEur: isDecimalString(targetPrice) ? targetPrice : null,
        yieldPct: String(yieldPct),
        // Costing v2: pack weight from the project (g→kg); recipe stage adds NO packaging.
        packWeightKg,
      }),
    [rows, targetPrice, yieldPct, nutritionByRm, packWeightKg],
  );

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Validate every row; returns the error map (empty → all valid). */
  const validate = React.useCallback(
    (current: EditableIngredient[]): Record<string, RowError> => {
      const next: Record<string, RowError> = {};
      for (const r of current) {
        const parsed = RowSchema.safeParse({ rmCode: r.rmCode, qtyKg: r.qtyKg });
        if (parsed.success) continue;
        const rowErr: RowError = {};
        for (const issue of parsed.error.issues) {
          if (issue.path[0] === 'qtyKg') rowErr.qtyKg = labels.qtyRangeError;
          if (issue.path[0] === 'rmCode') rowErr.rmCode = labels.rmCodeRequired;
        }
        next[r.id] = rowErr;
      }
      return next;
    },
    [labels.qtyRangeError, labels.rmCodeRequired],
  );

  const runSave = React.useCallback(() => {
    if (!editable || !saveDraftAction || !data) return;
    const current = rowsRef.current;
    const validation = validate(current);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return; // blocked by Zod (AC#3)

    setSaveStatus('saving');
    void (async () => {
      try {
        const result = await saveDraftAction({
          projectId: data.projectId,
          versionId,
          ingredients: current.map((r, i) => ({
            rmCode: r.rmCode,
            itemId: r.itemId,
            // Costing v2: persist the entered qty (kg/pack); pct is no longer authored.
            qtyKg: isDecimalString(r.qtyKg) ? r.qtyKg : null,
            pct: null,
            costPerKgEur: isDecimalString(r.costPerKgEur) ? r.costPerKgEur : null,
            allergensInherited: r.allergen ? [r.allergen] : [],
            sequence: i + 1,
          })),
        });
        if (result && 'ok' in result && result.ok) {
          setSaveStatus('saved');
          if (recomputeAction) {
            void recomputeAction({ projectId: data.projectId, versionId }).catch(() => undefined);
          }
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    })();
  }, [data, editable, recomputeAction, saveDraftAction, validate, versionId]);

  /** Schedule a single debounced save (resets the 800 ms timer on each call). */
  const scheduleSave = React.useCallback(() => {
    if (!editable) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSave(), DEBOUNCE_MS);
  }, [editable, runSave]);

  const handleChange = React.useCallback(
    (index: number, field: IngredientField, value: string) => {
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleCommit = React.useCallback(
    (index: number) => {
      // Validate immediately on blur so out-of-range errors surface without
      // waiting for the debounce (AC#3). Does not itself save.
      const row = rowsRef.current[index];
      if (!row) return;
      const validation = validate(rowsRef.current);
      setErrors(validation);
    },
    [validate],
  );

  const handleAdd = React.useCallback(() => {
    if (!editable) return;
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${prev.length}`,
        rmCode: '',
        itemId: null,
        name: '',
        qtyKg: '0',
        pct: '0',
        costPerKgEur: '0',
        allergen: null,
        sequence: prev.length + 1,
      },
    ]);
  }, [editable]);

  /**
   * Lane-B: a real item was chosen for an ingredient row — wire item_id and
   * populate code/name/cost (and the inherited allergen, if the item carries one
   * — items expose cost; allergen profiles are read elsewhere so we keep the
   * existing allergen unless cleared). Triggers a debounced save like any edit.
   */
  const handleSelectItem = React.useCallback(
    (index: number, item: ItemPickerOption) => {
      setRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                itemId: item.id,
                rmCode: item.itemCode,
                name: item.name,
                costPerKgEur: item.costPerKgEur ?? r.costPerKgEur,
              }
            : r,
        ),
      );
      setErrors((prev) => {
        const next = { ...prev };
        const row = rowsRef.current[index];
        if (row && next[row.id]?.rmCode) {
          next[row.id] = { ...next[row.id], rmCode: undefined };
        }
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleDelete = React.useCallback(
    (index: number) => {
      if (!editable) return;
      setRows((prev) => prev.filter((_, i) => i !== index));
      scheduleSave();
    },
    [editable, scheduleSave],
  );

  // Costing v2 — the table total is now the qty roll-up (kg/pack); the raw cost is
  // the per-pack RM cost. Both come from the same NUMERIC-exact roll-up that feeds
  // the panels, so the table total and the CostPanel never disagree (single source).
  const totalQtyKg = calc.totalQtyKg;
  const cost = calc.rawCostPerPack;
  // Balance gate: Σ qtyKg ≈ pack weight ±1 %. When pack weight is unset we don't
  // hard-block (qtyBalanceValid is true), but we surface a hint instead.
  const balanced = calc.qtyBalanceValid;
  const packWeightUnset = calc.qtyBalanceUnset;
  // Read-only batch size = pack weight in kg (6 dp trimmed to a friendly string).
  const batchKgDisplay = packWeightKg ?? '';

  const versionOptions = data?.versions ?? [];

  const saveLabel =
    saveStatus === 'saving'
      ? labels.saving
      : saveStatus === 'saved'
        ? labels.saved
        : saveStatus === 'error'
          ? labels.saveError
          : labels.saveDraft;

  return (
    <main
      data-testid="formulation-editor"
      aria-labelledby="formulation-title"
      className="mx-auto w-full max-w-6xl space-y-3 p-6"
    >
      <header className="card flex flex-wrap items-center justify-between gap-4" data-region="toolbar">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-wide muted">{labels.title}</div>
            <div id="formulation-title" className="font-semibold">
              <span className="mono">{data?.productCode ?? '—'}</span>
              {data ? <> · v{data.versionNumber} {data.state}</> : null}
            </div>
          </div>

          <div>
            <label htmlFor="batch-size" className="block text-[10px] uppercase tracking-wide muted">
              {labels.batchSize}
            </label>
            {/* Costing v2: batch size = pack weight (READ-ONLY, kg, from the project). */}
            <Input
              id="batch-size"
              type="text"
              readOnly
              aria-readonly="true"
              className="form-input w-24"
              value={batchKgDisplay}
              data-testid="batch-size-readonly"
            />
          </div>

          <div>
            <label htmlFor="target-price" className="block text-[10px] uppercase tracking-wide muted">
              {labels.targetPrice}
            </label>
            <Input
              id="target-price"
              inputMode="decimal"
              className="form-input w-24"
              value={targetPrice}
              disabled={!editable}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>

          <div>
            <span className="block text-[10px] uppercase tracking-wide muted">{labels.version}</span>
            <Select
              value={versionId}
              onValueChange={setVersionId}
              disabled={!editable}
              aria-label={labels.version}
            >
              <SelectTrigger aria-label={labels.version}>
                <SelectValue placeholder={labels.version} />
              </SelectTrigger>
              <SelectContent>
                {versionOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {`v${v.versionNumber}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" className="btn-ghost" disabled={!data}>
            {labels.compareVersions}
          </Button>
          <Button
            type="button"
            className="btn-secondary"
            disabled={!editable}
            data-status={saveStatus}
            onClick={() => runSave()}
          >
            {saveLabel}
          </Button>
          <Button type="button" className="btn-primary" disabled={!editable || !balanced}>
            {`${labels.submitForTrial} →`}
          </Button>
        </div>
      </header>

      {locked ? (
        <div role="alert" className="alert alert-amber">
          {labels.locked}
        </div>
      ) : null}

      {state !== 'ready' || !data ? (
        <div className="space-y-3">
          <StateNotice state={state === 'ready' ? 'empty' : state} labels={labels} />
          {state === 'empty' && canEdit && createDraftAction && projectId ? (
            <div style={{ textAlign: 'center' }}>
              <Button
                type="button"
                className="btn-primary"
                onClick={onCreateDraft}
                disabled={creatingDraft}
                data-testid="formulation-create-draft"
              >
                {creatingDraft ? labels.creatingDraft : labels.createDraft}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{labels.ingredients}</CardTitle>
                <p className="text-xs text-slate-500">{labels.subtitle}</p>
              </div>
              <Button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!editable}
                aria-label={labels.addIngredient}
                onClick={handleAdd}
              >
                {`+ ${labels.addIngredient}`}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table data-testid="ingredient-table">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.colIngredient}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {labels.colQtyPerPack}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {labels.colCostPerKg}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {labels.colContribution}
                    </TableHead>
                    <TableHead scope="col">{labels.colAllergen}</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">{labels.deleteRow}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((ingredient, index) => (
                    <IngredientRow
                      key={ingredient.id}
                      ingredient={ingredient}
                      index={index}
                      labels={labels}
                      disabled={!editable}
                      error={errors[ingredient.id]}
                      searchItemsAction={searchAction}
                      onChange={handleChange}
                      onSelectItem={handleSelectItem}
                      onCommit={handleCommit}
                      onDelete={handleDelete}
                    />
                  ))}
                  <TableRow data-testid="total-row" className="font-semibold">
                    <TableCell>{labels.total}</TableCell>
                    <TableCell
                      className={['text-right mono', balanced ? 'text-emerald-600' : 'text-red-600'].join(' ')}
                      data-testid="total-qty"
                    >
                      {`${totalQtyKg} kg`}
                    </TableCell>
                    <TableCell className="text-right muted">—</TableCell>
                    <TableCell className="text-right mono" data-testid="total-cost">
                      {`${cost} €`}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>

              {/* Costing v2: pack-weight unset → hint (no hard block); else the
                  qty-balance warning when Σ qtyKg drifts from the pack weight. */}
              {packWeightUnset ? (
                <div
                  role="status"
                  data-testid="pack-weight-unset-hint"
                  className="alert alert-blue m-2.5"
                >
                  {labels.packWeightUnsetHint}
                </div>
              ) : !balanced ? (
                <div
                  role="alert"
                  data-testid="qty-balance-warning"
                  className="alert alert-amber m-2.5"
                >
                  {labels.qtyBalanceWarning
                    .replace('{qty}', totalQtyKg)
                    .replace('{pack}', batchKgDisplay)}
                </div>
              ) : null}

              {/* T-116 CompositionBar — live %-by-ingredient strip below the table
                  (recipe.jsx:230-250). Falls back to the inline strip if the
                  composition labels are not supplied (back-compat with T-066). */}
              {panelLabels ? (
                <CompositionBar
                  segments={toCompositionSegments(rows)}
                  labels={panelLabels.composition}
                />
              ) : (
                <div className="px-3.5 pb-4 pt-3">
                  <div className="mb-1.5 text-[10px] uppercase tracking-wide muted">
                    {labels.composition}
                  </div>
                  <div
                    className="flex h-6 overflow-hidden rounded border"
                    role="img"
                    aria-label={labels.composition}
                  >
                    {rows.map((ingredient, i) => {
                      const w = compositionWidth(ingredient.qtyKg, totalQtyKg);
                      return (
                        <div
                          key={ingredient.id}
                          className={COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]}
                          style={{ width: `${w}%` }}
                          title={`${ingredient.name || ingredient.rmCode}: ${ingredient.qtyKg} kg`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {rows
                      .filter((r) => isDecimalString(r.qtyKg) && Dec.from(r.qtyKg).cmp(Dec.zero()) > 0)
                      .map((ingredient, i) => (
                        <span key={ingredient.id} className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className={['inline-block h-2 w-2 rounded-sm', COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]].join(' ')}
                          />
                          <span>
                            {ingredient.name || ingredient.rmCode} {ingredient.qtyKg} kg
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <aside className="space-y-3" data-testid="live-panels" aria-label={labels.livePanels}>
            <p className="text-xs muted">{labels.livePanelsHint}</p>
            {panelLabels ? (
              <>
                {/* Sidebar order Nutrition → Cost → Allergen (recipe.jsx:253-258).
                    Each panel CONSUMES the live `calc` (T-065 recomputeCalc); the
                    editor owns the single source of truth (rows + targetPrice +
                    yieldPct). Cost target-price / yield write back to page state. */}
                <NutritionPanel
                  nutrition={toNutritionRows(calc.nutrition)}
                  targets={nutritionTargets ?? {}}
                  labels={panelLabels.nutrition}
                  state="ready"
                />
                <CostPanel
                  state="ready"
                  calc={toCostBreakdown(calc)}
                  targetPrice={targetPrice}
                  onTargetPriceChange={setTargetPrice}
                  yieldPct={yieldPct}
                  onYieldChange={setYieldPct}
                  labels={panelLabels.cost}
                  currency={currency}
                  /* Costing v2: packaging is NOT part of the recipe stage. */
                  includePackaging={false}
                />
                <AllergenPanel
                  allergens={toAllergenStatuses(calc.allergens, allergenNames ?? {})}
                  labels={panelLabels.allergen}
                />
              </>
            ) : (
              <>
                <PanelSlot testId="panel-cost" title={labels.costPanelTitle} placeholder={labels.panelPlaceholder} />
                <PanelSlot
                  testId="panel-nutrition"
                  title={labels.nutritionPanelTitle}
                  placeholder={labels.panelPlaceholder}
                />
                <PanelSlot
                  testId="panel-allergen"
                  title={labels.allergenPanelTitle}
                  placeholder={labels.panelPlaceholder}
                />
              </>
            )}
          </aside>
        </div>
      )}

      <span aria-live="polite" className="sr-only" data-testid="save-status">
        {saveStatus === 'saving' ? labels.saving : saveStatus === 'saved' ? labels.saved : ''}
      </span>
    </main>
  );
}

/** Composition strip width: each ingredient's share of the (non-zero) total, %. */
function compositionWidth(pct: string, total: string): string {
  if (!isDecimalString(pct)) return '0';
  const totalDec = Dec.from(total);
  if (totalDec.isZero()) return '0';
  return Dec.from(pct).div(totalDec).mul(Dec.from('100')).toFixed(3);
}
