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
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { Dec, recomputeCalc, type RecomputeResult, type CompareResult } from '@monopilot/domain';

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
import { CostPanel, symbolFor, type CostBreakdown, type CostPanelLabels } from './cost-panel';
import {
  NutritionPanel,
  NUTRIENT_ROW_ORDER,
  type NutritionPanelLabels,
  type NutritionRow,
  type NutritionTargets,
} from './nutrition-panel';
import { UnlockVersionModal } from './unlock-version-modal';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

const DEBOUNCE_MS = 800;

export type AllergenReference = { code: string; name: string };

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
  processingOverheadPct?: string | null;
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
    /** @deprecated legacy single-allergen input — superseded by `allergens`. */
    allergen?: string | null;
    /**
     * F-A08 (W9-L4): FULL derived allergen array (server-resolved from the
     * SSOT item_allergen_profiles). Preferred over the legacy `allergen`.
     */
    allergens?: string[];
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
  /** Transient toast/inline state after a successful submit-for-trial. */
  submitting: string;
  submittedForTrial: string;
  /** Generic + gate-specific submit-for-trial error messages. */
  submitError: string;
  submitErrorTotalPct: string;
  submitErrorMissingCost: string;
  submitErrorMissingNutritionTarget: string;
  submitErrorNotDraft: string;
  submitErrorLocked: string;
  submitErrorForbidden: string;
  addVersion?: string;
  compareVersions: string;
  /** Lock-recipe toolbar action + confirm dialog (C1). */
  lockRecipe: string;
  locking: string;
  lockConfirmTitle: string;
  /** "{n}" replaced client-side with the current version number. */
  lockConfirmBody: string;
  lockConfirmConfirm: string;
  lockConfirmCancel: string;
  /** Generic + code-specific lock error messages (mapped from the action's error codes). */
  lockError: string;
  lockErrorForbidden: string;
  lockErrorLocked: string;
  lockErrorNotSubmitted: string;
  lockErrorNotFound: string;
  /** Unlock-recipe toolbar action + e-sign PIN modal (A6). */
  unlockRecipe: string;
  unlocking: string;
  unlockTitle: string;
  /** "{n}" replaced client-side with the current version number. */
  unlockBody: string;
  unlockReasonLabel: string;
  unlockReasonPlaceholder: string;
  unlockPinLabel: string;
  unlockPinPlaceholder: string;
  unlockConfirmCheckbox: string;
  unlockSubmit: string;
  unlockCancel: string;
  /** Generic + code-specific unlock error messages (mapped from the action's error codes). */
  unlockError: string;
  unlockErrorForbidden: string;
  unlockErrorNotLocked: string;
  unlockErrorEsign: string;
  unlockErrorNotFound: string;
  /** Compare-versions modal labels. */
  compareTitle: string;
  compareVersionA: string;
  compareVersionB: string;
  compareClose: string;
  compareRun: string;
  compareLoading: string;
  compareError: string;
  compareColIngredient: string;
  compareColVersionA: string;
  compareColVersionB: string;
  compareSamePick: string;
  compareNoChanges: string;
  compareTruncated: string;
  compareStatusAdded: string;
  compareStatusRemoved: string;
  compareStatusChanged: string;
  compareStatusUnchanged: string;
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
  /** Helper line under the editable batch-size (pack weight) field. */
  batchSizeHint: string;
  composition: string;
  qtyRangeError: string;
  rmCodeRequired: string;
  livePanels: string;
  livePanelsHint: string;
  /**
   * BUG 3 — recipe-related secondary links (Nutrition / Costing) shown on the
   * formulation stage so those project pages are reachable BEFORE approval. Used
   * only by the formulation page (page.tsx); the editor itself does not render
   * them. Optional so existing editor-only tests need not supply them.
   */
  relatedLinksLabel?: string;
  linkNutrition?: string;
  linkCosting?: string;
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
  /** Phase-3 NPD↔Technical shortcut — "↗ Open item in Technical" link title. */
  openInTechnical: string;
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
  batchSizeKg?: string | null;
  targetYieldPct?: string | null;
  targetPriceEur?: string | null;
  processingOverheadPct?: string | null;
}) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

export type RecomputeAction = (input: {
  projectId: string;
  versionId: string;
}) => Promise<unknown>;

export type CreateVersionAction = (input: {
  projectId: string;
  sourceVersionId: string;
}) => Promise<{ ok: boolean; versionId?: string }>;

/**
 * Persist the project's pack weight (g) — Costing v2 batch size. The editor edits
 * the pack weight inline (batch = pack weight); committing it persists via the
 * brief's `updateProjectBrief` action (threaded as a narrow adapter from
 * formulation/page.tsx). NUMERIC string semantics: grams in/out, never a float.
 */
export type UpdatePackWeightAction = (input: {
  projectId: string;
  packWeightG: string | null;
}) => Promise<{ ok: boolean }>;

/**
 * Submit-for-trial Server Action (legacy actions tree, `_actions/submit-for-trial.ts`).
 * Mirrors that action's result union exactly so the editor can map every gate
 * error (TOTAL_PCT_OUT_OF_RANGE, MISSING_COST, …) to an inline message. The
 * editor NEVER re-grants permission — `forbidden` is a server decision surfaced
 * read-only here.
 */
export type SubmitForTrialAction = (input: {
  projectId: string;
  versionId: string;
}) => Promise<
  | { ok: true; data: { versionId: string } }
  | { ok: false; error: string }
>;

/**
 * Compare-versions Server Action (legacy actions tree, `_actions/compare-versions.ts`).
 * Returns the pure `CompareResult` diff (row-aligned by sequence). Read-only.
 */
export type CompareVersionsAction = (input: {
  projectId: string;
  versionAId: string;
  versionBId: string;
}) => Promise<CompareResult>;

/**
 * Lock-version Server Action (legacy actions tree, `_actions/lock-version.ts`).
 * Freezes the current version (draft | submitted_for_trial → locked). RBAC is
 * enforced server-side (`npd.formulation.lock`); the editor only mirrors the
 * `forbidden` code read-only and surfaces every other error code inline.
 */
export type LockVersionAction = (input: {
  projectId: string;
  versionId: string;
}) => Promise<
  | { ok: true; data: { versionId: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'VERSION_LOCKED'
        | 'VERSION_NOT_SUBMITTED'
        | 'persistence_failed';
    }
>;

/**
 * Unlock-version Server Action (A6, legacy actions tree, `_actions/unlock-version.ts`).
 * Returns a LOCKED version back to draft, gated by an e-sign PIN. RBAC
 * (`npd.formulation.unlock`) + the e-sign check are enforced server-side; the
 * editor only mirrors the `forbidden` code read-only and surfaces every other
 * error code (esign_failed wrong PIN, VERSION_NOT_LOCKED, not_found) inline.
 */
export type UnlockVersionAction = (input: {
  projectId: string;
  versionId: string;
  pin: string;
  reason?: string;
}) => Promise<
  | { ok: true; data: { versionId: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'VERSION_NOT_LOCKED'
        | 'esign_failed'
        | 'persistence_failed';
    }
>;

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
      // F-A08: full array — the union feeding the AllergenPanel never truncates.
      allergensInherited: r.allergens,
      ...(nutrition ? { nutritionPer100g: nutrition } : {}),
    };
  });
}

/** calc roll-up → CostPanel breakdown (adds the overhead% the panel label needs). */
function toCostBreakdown(calc: RecomputeResult, processingPct: string): CostBreakdown {
  return {
    rawCost: calc.rawCost,
    yieldedCost: calc.yieldedCost,
    processing: calc.processing,
    packaging: calc.packaging,
    costPerKg: calc.costPerKg,
    revenuePerKg: calc.revenuePerKg,
    marginPct: calc.marginPct,
    overheadPct: processingPct,
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
 * calc.allergens (detected union) → full reference presence list for the
 * AllergenPanel. Detected codes are 'present'; the remaining reference codes are
 * 'absent'. The compute path emits a binary union (no trace), so every detected
 * allergen is 'present'.
 */
function toAllergenStatuses(
  detected: string[],
  names: Record<string, string>,
  allergenReference?: AllergenReference[],
): AllergenStatus[] {
  const present = new Set(detected);
  const references =
    allergenReference && allergenReference.length > 0
      ? allergenReference
      : EU14_ALLERGEN_CODES.map((code) => ({ code, name: names[code] ?? code }));
  return references.map(({ code, name }) => ({
    code,
    name: name || names[code] || code,
    status: present.has(code) ? ('present' as const) : ('absent' as const),
  }));
}

/**
 * Costing v2 — editable rows → CompositionBar segments. The bar's `pct` is a TRUE
 * percentage (its contract: "decimal STRING percentage % w/w"), so we normalise
 * each row's by-mass share here: (qtyKg / Σ qtyKg) × 100. Feeding the bar the raw
 * qtyKg was the live display bug — a lone 0.200 kg ingredient rendered as
 * "0.200%" in the legend/aria-label instead of its real 100 % share (the width
 * was already correct because the bar re-normalises, but the printed number was
 * the raw qty). Computing the share here keeps the bar honest and the printed
 * percentage right, while the math stays NUMERIC-exact (Dec, never a JS float).
 */
function toCompositionSegments(rows: EditableIngredient[]): CompositionSegment[] {
  let totalQty = Dec.zero();
  for (const r of rows) if (isDecimalString(r.qtyKg)) totalQty = totalQty.add(Dec.from(r.qtyKg));
  const totalNonZero = !totalQty.isZero();
  return rows.map((r) => {
    const pct =
      isDecimalString(r.qtyKg) && totalNonZero
        ? Dec.from(r.qtyKg).div(totalQty).mul(Dec.from('100')).toFixed(3)
        : '0';
    return {
      id: r.id,
      rmCode: r.rmCode,
      name: r.name,
      pct,
    };
  });
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
    // F-A08: prefer the full derived array; the deprecated single `allergen`
    // input is widened for back-compat (older callers/fixtures).
    allergens: ing.allergens ?? (ing.allergen ? [ing.allergen] : []),
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
  allergenReference,
  currency = 'EUR',
  canEdit = false,
  submitAllowed = true,
  saveDraftAction,
  recomputeAction,
  submitForTrialAction,
  compareVersionsAction,
  createVersionAction,
  lockVersionAction,
  unlockVersionAction,
  updatePackWeightAction,
  searchItemsAction,
  projectId,
  createDraftAction,
  onRefresh,
}: {
  state?: PageState;
  data: FormulationEditorData | null;
  labels: FormulationLabels;
  /** Project id — needed to create the FIRST draft from the empty Recipe stage. */
  projectId?: string;
  /** Injected create-draft Server Action (empty-state "Create draft" button). */
  createDraftAction?: (input: { projectId: string }) => Promise<{ ok: boolean }>;
  /** Create a new draft version copied from the current version. */
  createVersionAction?: CreateVersionAction;
  /** Pre-resolved i18n bundles for the four live panels (T-113-116). */
  panelLabels?: FormulationPanelLabels;
  /** Per-nutrient amber/red thresholds (reference data, NUMERIC strings). */
  nutritionTargets?: NutritionTargets;
  /** Locale-resolved EU14 allergen display names, keyed by code. */
  allergenNames?: Record<string, string>;
  /** Org-scoped allergen reference rows from Reference.Allergens. Falls back to EU14 when empty. */
  allergenReference?: AllergenReference[];
  /** ISO-4217 currency code for the CostPanel (default EUR). */
  currency?: string;
  canEdit?: boolean;
  /** True only while the project is in the recipe stage; server action still enforces state. */
  submitAllowed?: boolean;
  saveDraftAction?: SaveDraftAction;
  recomputeAction?: RecomputeAction;
  /** Submit-for-trial Server Action (gates server-side; editor only mirrors result). */
  submitForTrialAction?: SubmitForTrialAction;
  /** Compare-versions Server Action (read-only diff for the Compare modal). */
  compareVersionsAction?: CompareVersionsAction;
  /** Lock-version Server Action (C1) — freezes the current version. Gated server-side. */
  lockVersionAction?: LockVersionAction;
  /** Unlock-version Server Action (A6) — returns a locked version to draft (e-sign PIN). Gated server-side. */
  unlockVersionAction?: UnlockVersionAction;
  /** Costing v2: persist the editable batch size (= pack weight g) via the brief action. */
  updatePackWeightAction?: UpdatePackWeightAction;
  /** Lane-B: org-scoped item-search action for the ingredient picker (defaults to searchItems). */
  searchItemsAction?: ItemSearchFn;
  /** Server-side refresh (router.refresh) — called after a successful submit. */
  onRefresh?: () => void;
}) {
  const searchAction: ItemSearchFn = searchItemsAction ?? searchItems;
  const router = useRouter();
  // Server-side refresh after a successful submit. Test seam: `onRefresh` overrides
  // router.refresh so RTL (no Next router context) can assert the call.
  const refresh = React.useCallback(() => {
    if (onRefresh) onRefresh();
    else router.refresh();
  }, [onRefresh, router]);
  const [creatingDraft, setCreatingDraft] = React.useState(false);
  const [creatingVersion, setCreatingVersion] = React.useState(false);
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
  // Costing v2: batch size = pack weight (grams). Editable when canEdit — typing
  // + commit (blur/enter) persists `packWeightG` via the brief action. The grams
  // value is the local source of truth so balance/composition recompute live; the
  // table/calc use it converted to kg (exact, no float).
  const [packWeightG, setPackWeightG] = React.useState<string>(data?.packWeightG ?? '');
  // Last-committed grams baseline — drives the dirty check on commit.
  const committedPackWeightGRef = React.useRef<string>(data?.packWeightG ?? '');
  type PackStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [packStatus, setPackStatus] = React.useState<PackStatus>('idle');
  const packWeightKg = packWeightKgFromG(packWeightG || null);
  const [targetPrice, setTargetPrice] = React.useState<string>(data?.targetPriceEur ?? '');
  const [yieldPct, setYieldPct] = React.useState<number>(parseYield(data?.targetYieldPct));
  const [processingPct, setProcessingPct] = React.useState<string>(data?.processingOverheadPct ?? DEFAULT_OVERHEAD_PCT);
  // The loaded version is ALWAYS the server-resolved one (page reads ?version=).
  // Keeping versionId pinned to data.versionId means the save target and the
  // displayed rows are the same version — picking a version navigates (below),
  // it never just swaps a local label while the editor keeps the old rows.
  const versionId = data?.versionId ?? '';
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');

  /**
   * Navigate the RSC to load a specific version. The page reads `?version=<id>`
   * and re-runs getFormulation for THAT version (org-scoped), so after this the
   * editor re-renders with the chosen version's REAL ingredients + its own lock
   * state — the displayed data and the saveDraft target stay identical. Uses
   * router.replace (no extra history entry for a pure view switch). Falls back to
   * a same-origin URL mutation when no Next router is present (defensive).
   */
  const navigateToVersion = React.useCallback(
    (nextVersionId: string) => {
      if (!nextVersionId) return;
      try {
        const params = new URLSearchParams(
          typeof window !== 'undefined' ? window.location.search : '',
        );
        params.set('version', nextVersionId);
        router.replace(`?${params.toString()}`, { scroll: false });
      } catch {
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('version', nextVersionId);
          window.location.assign(url.toString());
        }
      }
    },
    [router],
  );

  /** Version picker change → navigate so the chosen version actually loads. */
  const onSelectVersion = React.useCallback(
    (nextVersionId: string) => {
      if (!nextVersionId || nextVersionId === versionId) return;
      navigateToVersion(nextVersionId);
    },
    [navigateToVersion, versionId],
  );

  const onCreateVersion = React.useCallback(async () => {
    if (!createVersionAction || !data || creatingVersion) return;
    setCreatingVersion(true);
    try {
      const result = await createVersionAction({ projectId: data.projectId, sourceVersionId: versionId });
      if (result.ok) {
        // Land on the NEW draft version (editable + selected). When the action
        // returns the new id we navigate to ?version=<newId>; otherwise the RSC
        // loader still picks up the just-created version because create-version
        // repoints current_version_id, so a refresh re-reads it.
        if (result.versionId) {
          navigateToVersion(result.versionId);
        } else {
          refresh();
        }
        return;
      }
      // Never swallow a failure silently: a server-side ok:false (e.g. the
      // create-version action throwing) used to leave the button re-enabled
      // with no feedback, so the user thought "Add version" did nothing.
      window.alert(labels.createDraftError);
      setCreatingVersion(false);
    } catch {
      window.alert(labels.createDraftError);
      setCreatingVersion(false);
    }
  }, [createVersionAction, data, versionId, creatingVersion, navigateToVersion, refresh, labels.createDraftError]);

  // ── Submit for trial (gated server-side; editor only mirrors the result) ──────
  type SubmitStatus = 'idle' | 'submitting' | 'submitted' | 'error';
  const [submitStatus, setSubmitStatus] = React.useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = React.useState<string>('');

  // ── Compare versions modal state ─────────────────────────────────────────────
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [compareA, setCompareA] = React.useState<string>('');
  const [compareB, setCompareB] = React.useState<string>('');
  const [compareResult, setCompareResult] = React.useState<CompareResult | null>(null);
  const [compareStatus, setCompareStatus] = React.useState<'idle' | 'loading' | 'error'>('idle');

  // ── Lock recipe (C1) — confirm dialog + server-gated lock ────────────────────
  type LockStatus = 'idle' | 'locking' | 'locked' | 'error';
  const [lockConfirmOpen, setLockConfirmOpen] = React.useState(false);
  const [lockStatus, setLockStatus] = React.useState<LockStatus>('idle');
  const [lockError, setLockError] = React.useState<string>('');

  // ── Unlock recipe (A6) — e-sign PIN modal + server-gated unlock ──────────────
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [unlockErrorCode, setUnlockErrorCode] = React.useState<string | null>(null);

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
        processingOverheadPct: processingPct,
        // Costing v2: pack weight from the project (g→kg); recipe stage adds NO packaging.
        packWeightKg,
      }),
    [rows, targetPrice, yieldPct, processingPct, nutritionByRm, packWeightKg],
  );

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Re-seed the editable state when the LOADED version changes. The selector
  // navigates to ?version=<id>; a soft navigation re-renders the RSC with the new
  // version's data but does NOT remount this client island, so the `useState`
  // initializers above do not re-run. Without this the editor would keep the
  // previous version's rows on screen while saveDraft writes to the
  // newly-loaded version — the exact display≠save-target corruption this fix
  // closes. Keyed on the loaded versionId, so an ordinary save (same version,
  // refreshed data) never clobbers in-flight edits — only a real version switch
  // re-seeds.
  const seededVersionRef = React.useRef<string>(data?.versionId ?? '');
  React.useEffect(() => {
    const loadedVersionId = data?.versionId ?? '';
    if (loadedVersionId === seededVersionRef.current) return;
    seededVersionRef.current = loadedVersionId;
    if (timerRef.current) clearTimeout(timerRef.current);
    setRows(data ? toEditable(data) : []);
    setErrors({});
    setTargetPrice(data?.targetPriceEur ?? '');
    setYieldPct(parseYield(data?.targetYieldPct));
    setProcessingPct(data?.processingOverheadPct ?? DEFAULT_OVERHEAD_PCT);
    setSaveStatus('idle');
    // Submit-for-trial is PER-VERSION: a soft nav to another version re-renders
    // this island without remounting, so a 'submitted'/'error' state from the
    // previous version would otherwise carry over and make the new version's
    // button look already-submitted/blocked. Reset it on every real version switch.
    setSubmitStatus('idle');
    setSubmitError('');
    setCreatingVersion(false);
  }, [data]);

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
    const blocking = Object.fromEntries(
      Object.entries(validation)
        .map(([id, rowErr]) => {
          const row = current.find((r) => r.id === id);
          if (!row || row.rmCode.trim().length > 0) return [id, rowErr] as const;
          const rest = { ...rowErr };
          delete rest.rmCode;
          return [id, rest] as const;
        })
        .filter(([, rowErr]) => Object.keys(rowErr).length > 0),
    );
    if (Object.keys(blocking).length > 0) return; // qtyKg still gates draft saves.

    setSaveStatus('saving');
    void (async () => {
      try {
        const completeRows = current.filter((r) => r.rmCode.trim().length > 0);
        const result = await saveDraftAction({
          projectId: data.projectId,
          versionId,
          batchSizeKg: packWeightKg,
          targetYieldPct: String(yieldPct),
          targetPriceEur: targetPrice,
          processingOverheadPct: processingPct,
          ingredients: completeRows.map((r, i) => ({
            rmCode: r.rmCode.trim(),
            itemId: r.itemId,
            // Costing v2: persist the entered qty (kg/pack); pct is no longer authored.
            qtyKg: isDecimalString(r.qtyKg) ? r.qtyKg : null,
            pct: null,
            costPerKgEur: isDecimalString(r.costPerKgEur) ? r.costPerKgEur : null,
            // F-A06: sent for wire back-compat only — the server IGNORES this
            // and re-derives allergens from item_allergen_profiles (SSOT).
            allergensInherited: r.allergens,
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
  }, [data, editable, packWeightKg, processingPct, recomputeAction, saveDraftAction, targetPrice, validate, versionId, yieldPct]);

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
        allergens: [],
        sequence: prev.length + 1,
      },
    ]);
  }, [editable]);

  /**
   * Lane-B: a real item was chosen for an ingredient row — wire item_id and
   * populate code/name/cost. Allergens are NOT set client-side (F-A06): the
   * save action derives the full set from item_allergen_profiles (SSOT) and the
   * next read returns it — the client never authors allergen data. Triggers a
   * debounced save like any edit.
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
                // Prefill € / kg from the item's cost; fall back to its list price
                // (the user-entered "List price (GBP / base UoM)") when cost_per_kg
                // is unset, so the recipe reflects the price the user actually set.
                costPerKgEur: item.costPerKgEur ?? item.unitPrice ?? item.listPriceGbp ?? r.costPerKgEur,
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

  /** Map a server gate-error code → the localized inline message. */
  const submitErrorMessage = React.useCallback(
    (error: string): string => {
      switch (error) {
        case 'TOTAL_PCT_OUT_OF_RANGE':
          return labels.submitErrorTotalPct;
        case 'MISSING_COST':
          return labels.submitErrorMissingCost;
        case 'MISSING_NUTRITION_TARGET':
          return labels.submitErrorMissingNutritionTarget;
        case 'VERSION_NOT_DRAFT':
          return labels.submitErrorNotDraft;
        case 'VERSION_LOCKED':
          return labels.submitErrorLocked;
        case 'forbidden':
          return labels.submitErrorForbidden;
        default:
          return labels.submitError;
      }
    },
    [labels],
  );

  /**
   * Submit for trial. Server-side action enforces RBAC + the recipe gates; we
   * only mirror the result. On success we surface the saved/submitted indicator
   * (same pattern as save) and trigger a server refresh so the version's new
   * `submitted_for_trial` state re-renders from Supabase.
   */
  const onSubmitForTrial = React.useCallback(() => {
    if (!submitForTrialAction || !data || submitStatus === 'submitting') return;
    const validation = validate(rowsRef.current);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setSubmitStatus('error');
      setSubmitError(labels.rmCodeRequired);
      return;
    }
    setSubmitStatus('submitting');
    setSubmitError('');
    void (async () => {
      try {
        const result = await submitForTrialAction({ projectId: data.projectId, versionId });
        if (result.ok) {
          setSubmitStatus('submitted');
          refresh();
        } else {
          setSubmitStatus('error');
          setSubmitError(submitErrorMessage(result.error));
        }
      } catch {
        setSubmitStatus('error');
        setSubmitError(labels.submitError);
      }
    })();
  }, [
    submitForTrialAction,
    data,
    versionId,
    submitStatus,
    refresh,
    submitErrorMessage,
    validate,
    labels.rmCodeRequired,
    labels.submitError,
  ]);

  /** Open the Compare modal — seed A = current version, B = the previous one (if any). */
  const onOpenCompare = React.useCallback(() => {
    const versions = data?.versions ?? [];
    setCompareResult(null);
    setCompareStatus('idle');
    setCompareA(data?.versionId ?? versions[0]?.id ?? '');
    // Default B to the highest version that is NOT the current one (else same as A).
    const other = versions.find((v) => v.id !== (data?.versionId ?? ''));
    setCompareB(other?.id ?? data?.versionId ?? '');
    setCompareOpen(true);
  }, [data]);

  const onRunCompare = React.useCallback(() => {
    if (!compareVersionsAction || !data || !compareA || !compareB) return;
    setCompareStatus('loading');
    setCompareResult(null);
    void (async () => {
      try {
        const result = await compareVersionsAction({
          projectId: data.projectId,
          versionAId: compareA,
          versionBId: compareB,
        });
        setCompareResult(result);
        setCompareStatus('idle');
      } catch {
        setCompareStatus('error');
      }
    })();
  }, [compareVersionsAction, data, compareA, compareB]);

  // Auto-run the diff when the modal opens with two distinct versions selected.
  React.useEffect(() => {
    if (compareOpen && compareA && compareB && compareA !== compareB && !compareResult) {
      onRunCompare();
    }
  }, [compareOpen]);

  /** Map a server lock-error code → the localized inline message. */
  const lockErrorMessage = React.useCallback(
    (error: string): string => {
      switch (error) {
        case 'forbidden':
          return labels.lockErrorForbidden;
        case 'VERSION_LOCKED':
          return labels.lockErrorLocked;
        case 'VERSION_NOT_SUBMITTED':
          return labels.lockErrorNotSubmitted;
        case 'not_found':
          return labels.lockErrorNotFound;
        default:
          return labels.lockError;
      }
    },
    [labels],
  );

  /**
   * Lock recipe (C1). Server action enforces RBAC (`npd.formulation.lock`) + the
   * state transition (draft | submitted_for_trial → locked); we only mirror the
   * result. On success we refresh so the version's new `locked` state re-renders
   * the editor read-only from Supabase.
   */
  const onConfirmLock = React.useCallback(() => {
    if (!lockVersionAction || !data || lockStatus === 'locking') return;
    setLockStatus('locking');
    setLockError('');
    void (async () => {
      try {
        const result = await lockVersionAction({ projectId: data.projectId, versionId });
        if (result.ok) {
          setLockStatus('locked');
          setLockConfirmOpen(false);
          refresh();
        } else {
          setLockStatus('error');
          setLockConfirmOpen(false);
          setLockError(lockErrorMessage(result.error));
        }
      } catch {
        setLockStatus('error');
        setLockConfirmOpen(false);
        setLockError(labels.lockError);
      }
    })();
  }, [lockVersionAction, data, versionId, lockStatus, refresh, lockErrorMessage, labels.lockError]);

  /** Map a server unlock-error code → the localized inline message. */
  const unlockErrorMessage = React.useCallback(
    (error: string): string => {
      switch (error) {
        case 'forbidden':
          return labels.unlockErrorForbidden;
        case 'VERSION_NOT_LOCKED':
          return labels.unlockErrorNotLocked;
        case 'esign_failed':
          return labels.unlockErrorEsign;
        case 'not_found':
          return labels.unlockErrorNotFound;
        default:
          return labels.unlockError;
      }
    },
    [labels],
  );

  /**
   * Unlock recipe (A6). Server action enforces RBAC (`npd.formulation.unlock`) +
   * the e-sign PIN check + the `locked` precondition; we only mirror the result.
   * On success the version returns to `draft` (editable), so we close the modal
   * and refresh to re-read the now-editable version from Supabase. On failure the
   * modal stays open with the mapped error (the user can retry the PIN).
   */
  const onConfirmUnlock = React.useCallback(
    async (input: { pin: string; reason: string }) => {
      if (!unlockVersionAction || !data || unlocking) return;
      setUnlocking(true);
      setUnlockErrorCode(null);
      try {
        const result = await unlockVersionAction({
          projectId: data.projectId,
          versionId,
          pin: input.pin,
          reason: input.reason || undefined,
        });
        if (result.ok) {
          setUnlockOpen(false);
          refresh();
        } else {
          setUnlockErrorCode(result.error);
        }
      } catch {
        setUnlockErrorCode('persistence_failed');
      } finally {
        setUnlocking(false);
      }
    },
    [unlockVersionAction, data, versionId, unlocking, refresh],
  );

  // Re-seed the editable pack weight when the persisted value changes (after a
  // successful commit the action revalidated and refresh() re-runs the RSC loader,
  // so `data.packWeightG` arrives fresh).
  React.useEffect(() => {
    const next = data?.packWeightG ?? '';
    setPackWeightG(next);
    committedPackWeightGRef.current = next;
    setPackStatus('idle');
  }, [data?.packWeightG]);

  /**
   * Commit the edited batch size (= pack weight, grams) on blur/Enter. Persists
   * `packWeightG` (NUMERIC string, empty→null) via the brief action, then refreshes
   * so balance/composition recompute against the new pack weight from Supabase.
   * No-op when unchanged, invalid, or the user can't edit.
   */
  const commitPackWeight = React.useCallback(() => {
    if (!editable || !updatePackWeightAction) return;
    const raw = packWeightG.trim();
    // Empty → null; otherwise must be a valid decimal string (no float drift).
    if (raw !== '' && !isDecimalString(raw)) return;
    if (raw === committedPackWeightGRef.current) return;
    setPackStatus('saving');
    void (async () => {
      try {
        const result = await updatePackWeightAction({
          projectId: data?.projectId ?? projectId ?? '',
          packWeightG: raw === '' ? null : raw,
        });
        if (result.ok) {
          committedPackWeightGRef.current = raw;
          setPackStatus('saved');
          // Re-run the RSC loader so balance/composition recompute server-side.
          refresh();
        } else {
          setPackStatus('error');
        }
      } catch {
        setPackStatus('error');
      }
    })();
  }, [editable, updatePackWeightAction, packWeightG, data?.projectId, projectId, refresh]);

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
              {`${labels.batchSize} (g)`}
            </label>
            {/* Costing v2: batch size = pack weight (grams). Editable when canEdit —
                commit on blur/Enter persists packWeightG via the brief action and
                refreshes so balance/composition recompute. Read-only otherwise. */}
            <Input
              id="batch-size"
              inputMode="decimal"
              className="form-input w-24"
              value={packWeightG}
              disabled={!editable || !updatePackWeightAction}
              readOnly={!updatePackWeightAction}
              aria-readonly={!updatePackWeightAction || undefined}
              data-status={packStatus}
              onChange={(e) => {
                setPackWeightG(e.target.value);
                setPackStatus((s) => (s === 'saving' ? s : 'idle'));
              }}
              onBlur={commitPackWeight}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitPackWeight();
                }
              }}
              data-testid="batch-size-input"
            />
            <p className="mt-1 text-[10px] muted" data-testid="batch-size-hint">
              {labels.batchSizeHint}
            </p>
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
              // Picking a version NAVIGATES (router.replace ?version=<id>) so the
              // RSC reloads THAT version's real ingredients + lock state — it no
              // longer just swaps a local label while the editor keeps showing
              // (and would save over) the previously-loaded version. Enabled
              // whenever there is more than one version to switch between, even
              // on a locked version, so the user can navigate back to a draft.
              onValueChange={onSelectVersion}
              disabled={versionOptions.length < 2}
              aria-label={labels.version}
              // SelectValue resolves the trigger label from `options` (value→label);
              // without this it falls back to the raw value (the version UUID). The
              // SelectItem children below render the same labels for the dropdown.
              options={versionOptions.map((v) => ({ value: v.id, label: `v${v.versionNumber}` }))}
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
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={!data || !canEdit || !createVersionAction || creatingVersion}
            onClick={onCreateVersion}
            data-testid="add-version-trigger"
          >
            {labels.addVersion ?? 'Add version'}
          </Button>
          <Button
            type="button"
            className="btn-ghost"
            disabled={!data || !compareVersionsAction}
            onClick={onOpenCompare}
            data-testid="compare-versions-trigger"
          >
            {labels.compareVersions}
          </Button>
          <Button
            type="button"
            className="btn-ghost"
            disabled={!editable || !lockVersionAction || lockStatus === 'locking'}
            data-status={lockStatus}
            onClick={() => {
              setLockError('');
              setLockConfirmOpen(true);
            }}
            data-testid="lock-recipe-trigger"
          >
            {lockStatus === 'locking' ? labels.locking : labels.lockRecipe}
          </Button>
          {locked ? (
            <Button
              type="button"
              className="btn-ghost"
              // A6: shown ONLY on a locked version. Gated by the injected action the
              // same way Lock is (disabled, never a dead end, when no action prop).
              // The action ALSO enforces `npd.formulation.unlock` + the e-sign PIN
              // server-side and surfaces `forbidden` inline.
              disabled={!unlockVersionAction || unlocking}
              data-status={unlocking ? 'unlocking' : 'idle'}
              onClick={() => {
                setUnlockErrorCode(null);
                setUnlockOpen(true);
              }}
              data-testid="unlock-recipe-trigger"
            >
              {unlocking ? labels.unlocking : labels.unlockRecipe}
            </Button>
          ) : null}
          <Button
            type="button"
            className="btn-secondary"
            disabled={!editable}
            data-status={saveStatus}
            onClick={() => runSave()}
          >
            {saveLabel}
          </Button>
          <Button
            type="button"
            className="btn-primary"
            disabled={!editable || !submitAllowed || !balanced || !submitForTrialAction || submitStatus === 'submitting'}
            data-status={submitStatus}
            data-testid="submit-for-trial"
            onClick={onSubmitForTrial}
          >
            {submitStatus === 'submitting'
              ? labels.submitting
              : submitStatus === 'submitted'
                ? labels.submittedForTrial
                : `${labels.submitForTrial} →`}
          </Button>
        </div>
      </header>

      {submitStatus === 'error' && submitError ? (
        <div role="alert" className="alert alert-red" data-testid="submit-error">
          {submitError}
        </div>
      ) : null}

      {lockStatus === 'error' && lockError ? (
        <div role="alert" className="alert alert-red" data-testid="lock-error">
          {lockError}
        </div>
      ) : null}

      {lockConfirmOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={labels.lockConfirmTitle}
          data-testid="lock-confirm-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLockConfirmOpen(false);
          }}
        >
          <div className="modal-box">
            <div className="modal-head">
              <div className="modal-title">{labels.lockConfirmTitle}</div>
              <button
                type="button"
                className="modal-close"
                aria-label={labels.lockConfirmCancel}
                onClick={() => setLockConfirmOpen(false)}
                data-testid="lock-confirm-cancel"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm">
                {labels.lockConfirmBody.replace('{n}', String(data?.versionNumber ?? ''))}
              </p>
            </div>
            <div className="modal-foot">
              <Button
                type="button"
                className="btn-secondary"
                onClick={() => setLockConfirmOpen(false)}
              >
                {labels.lockConfirmCancel}
              </Button>
              <Button
                type="button"
                className="btn-primary"
                disabled={lockStatus === 'locking'}
                onClick={onConfirmLock}
                data-testid="lock-confirm"
              >
                {lockStatus === 'locking' ? labels.locking : labels.lockConfirmConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {compareOpen ? (
        <CompareVersionsModal
          labels={labels}
          versions={data?.versions ?? []}
          versionA={compareA}
          versionB={compareB}
          onVersionAChange={(v) => {
            setCompareA(v);
            setCompareResult(null);
          }}
          onVersionBChange={(v) => {
            setCompareB(v);
            setCompareResult(null);
          }}
          status={compareStatus}
          result={compareResult}
          onRun={onRunCompare}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {unlockOpen && data ? (
        <UnlockVersionModal
          open={unlockOpen}
          versionNumber={data.versionNumber}
          labels={labels}
          submitting={unlocking}
          errorMessage={unlockErrorCode ? unlockErrorMessage(unlockErrorCode) : null}
          onConfirm={onConfirmUnlock}
          onClose={() => setUnlockOpen(false)}
        />
      ) : null}

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
                      currency={currency}
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
                      {/* F-D08b — same ISO-4217 seam as CostPanel/IngredientRow (never a hardcoded €). */}
                      {`${cost} ${symbolFor(currency)}`}
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
                  calc={toCostBreakdown(calc, processingPct)}
                  targetPrice={targetPrice}
                  onTargetPriceChange={setTargetPrice}
                  yieldPct={yieldPct}
                  onYieldChange={setYieldPct}
                  processingPct={processingPct}
                  onProcessingChange={setProcessingPct}
                  labels={panelLabels.cost}
                  currency={currency}
                  /* Costing v2: packaging is NOT part of the recipe stage. */
                  includePackaging={false}
                />
                <AllergenPanel
                  allergens={toAllergenStatuses(calc.allergens, allergenNames ?? {}, allergenReference)}
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
      <span aria-live="polite" className="sr-only" data-testid="submit-status">
        {submitStatus === 'submitting'
          ? labels.submitting
          : submitStatus === 'submitted'
            ? labels.submittedForTrial
            : ''}
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

/** Status → badge tone class (design-system .badge-*). */
const COMPARE_STATUS_TONE: Record<CompareResult['rows'][number]['status'], string> = {
  ADDED: 'badge-green',
  REMOVED: 'badge-red',
  CHANGED: 'badge-amber',
  UNCHANGED: 'badge-gray',
};

/**
 * Compare-versions modal — a read-only side-by-side diff of two formulation
 * versions' ingredient rows (compareVersions action output, T-065). Two version
 * pickers (Select, never raw <select>), a two-column ingredient table with
 * changed cells highlighted, and a status badge per row. Design-system
 * .modal-* / .badge-* primitives.
 */
function CompareVersionsModal({
  labels,
  versions,
  versionA,
  versionB,
  onVersionAChange,
  onVersionBChange,
  status,
  result,
  onRun,
  onClose,
}: {
  labels: FormulationLabels;
  versions: Array<{ id: string; versionNumber: number }>;
  versionA: string;
  versionB: string;
  onVersionAChange: (v: string) => void;
  onVersionBChange: (v: string) => void;
  status: 'idle' | 'loading' | 'error';
  result: CompareResult | null;
  onRun: () => void;
  onClose: () => void;
}) {
  const options = versions.map((v) => ({ value: v.id, label: `v${v.versionNumber}` }));
  const samePick = !!versionA && versionA === versionB;
  const statusLabel = (s: CompareResult['rows'][number]['status']): string => {
    switch (s) {
      case 'ADDED':
        return labels.compareStatusAdded;
      case 'REMOVED':
        return labels.compareStatusRemoved;
      case 'CHANGED':
        return labels.compareStatusChanged;
      default:
        return labels.compareStatusUnchanged;
    }
  };
  const cellText = (cell: { pct: string | null; qtyKg: string | null } | null): string =>
    cell ? `${cell.qtyKg ?? '—'} kg` : '—';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={labels.compareTitle}
      data-testid="compare-versions-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box wide">
        <div className="modal-head">
          <div className="modal-title">{labels.compareTitle}</div>
          <button
            type="button"
            className="modal-close"
            aria-label={labels.compareClose}
            onClick={onClose}
            data-testid="compare-close"
          >
            ×
          </button>
        </div>

        <div className="modal-body space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="block text-[10px] uppercase tracking-wide muted">
                {labels.compareVersionA}
              </span>
              <Select
                value={versionA}
                onValueChange={onVersionAChange}
                aria-label={labels.compareVersionA}
                options={options}
              >
                <SelectTrigger aria-label={labels.compareVersionA} data-testid="compare-version-a">
                  <SelectValue placeholder={labels.compareVersionA} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide muted">
                {labels.compareVersionB}
              </span>
              <Select
                value={versionB}
                onValueChange={onVersionBChange}
                aria-label={labels.compareVersionB}
                options={options}
              >
                <SelectTrigger aria-label={labels.compareVersionB} data-testid="compare-version-b">
                  <SelectValue placeholder={labels.compareVersionB} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="btn-secondary btn-sm"
              onClick={onRun}
              disabled={samePick || status === 'loading'}
              data-testid="compare-run"
            >
              {labels.compareRun}
            </Button>
          </div>

          {samePick ? (
            <p className="text-xs muted" data-testid="compare-same-pick">
              {labels.compareSamePick}
            </p>
          ) : null}

          {status === 'loading' ? (
            <div role="status" aria-live="polite" className="text-xs muted" data-testid="compare-loading">
              {labels.compareLoading}
            </div>
          ) : status === 'error' ? (
            <div role="alert" className="alert alert-red" data-testid="compare-error">
              {labels.compareError}
            </div>
          ) : result ? (
            <div data-testid="compare-result">
              {result.truncated ? (
                <div role="status" className="alert alert-amber" data-testid="compare-truncated">
                  {labels.compareTruncated}
                </div>
              ) : null}
              {result.rows.length === 0 ? (
                <p className="text-xs muted" data-testid="compare-no-changes">
                  {labels.compareNoChanges}
                </p>
              ) : (
                <Table data-testid="compare-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.compareColIngredient}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {labels.compareColVersionA}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {labels.compareColVersionB}
                      </TableHead>
                      <TableHead scope="col" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow
                        key={row.sequence}
                        data-testid="compare-row"
                        data-status={row.status}
                      >
                        <TableCell className="mono">{row.rmCode || '—'}</TableCell>
                        <TableCell
                          className={[
                            'text-right mono',
                            row.changed.qtyKg ? 'bg-amber-50 font-semibold' : '',
                          ].join(' ')}
                          data-changed={row.changed.qtyKg ? 'true' : undefined}
                        >
                          {cellText(row.a)}
                        </TableCell>
                        <TableCell
                          className={[
                            'text-right mono',
                            row.changed.qtyKg ? 'bg-amber-50 font-semibold' : '',
                          ].join(' ')}
                          data-changed={row.changed.qtyKg ? 'true' : undefined}
                        >
                          {cellText(row.b)}
                        </TableCell>
                        <TableCell>
                          <span className={['badge', COMPARE_STATUS_TONE[row.status]].join(' ')}>
                            {statusLabel(row.status)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {labels.compareClose}
          </Button>
        </div>
      </div>
    </div>
  );
}
