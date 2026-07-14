/**
 * T-065 — Formulation pure-function compute (cost / nutrition / allergen).
 *
 * `recomputeCalc` is a DETERMINISTIC, I/O-FREE pure function (PRD §17.11.1
 * "pure functions for cost/nutrition/allergen", prototype `recipe.jsx:3-23`
 * `useLiveCalc`). It reads a snapshot of ingredient rows + batch/yield/price
 * parameters and returns the computed cost roll-up, per-100g nutrition and the
 * allergen union. No DB reads, no `Date.now()`, no randomness, no mutation of
 * inputs — same input always yields a byte-identical result.
 *
 * MONEY IS EXACT. NUMERIC values (pct, costPerKg, prices, nutrition) arrive as
 * strings (the repo reads Postgres NUMERIC as strings) and all arithmetic runs
 * through {@link Dec} (scaled-bigint fixed-point). We NEVER `Number()` a money
 * value — binary float would drift cents (0.1 + 0.2 ≠ 0.3).
 *
 * COSTING v2 — quantity-per-pack model (replaces the broken %-based model):
 *   rawCostPerPack = Σ (qtyKg × costPerKg)         — total RM cost for ONE pack
 *   rawCost (/kg)  = packWeightKg > 0 ? rawCostPerPack / packWeightKg : 0
 *   yieldedCost    = yieldPct > 0 ? rawCost / (yieldPct/100) : rawCost
 *   processing     = yieldedCost × (processingOverheadPct/100)   — overhead on raw
 *   packaging      = packagingCostPerKg (DEFAULT 0 — NOT part of the recipe; the
 *                    caller passes packaging only AFTER the packaging stage)
 *   costPerKg      = yieldedCost + processing + packaging
 *   revenuePerKg   = packWeightKg > 0 ? targetPrice / packWeightKg : 0
 *   marginPct      = revenuePerKg > 0 ? (revenuePerKg − costPerKg)/revenuePerKg × 100 : 0
 *
 * Ingredient quantity is the AMOUNT used in ONE PACK in the ingredient's base unit
 * (treated as kg for now). Pack weight (the recipe's batch size) comes from
 * `npd_projects.pack_weight_g` and is threaded in as `packWeightKg`.
 *
 * Overhead / pack-weight default to neutral constants but are caller-overridable
 * (they live in `Reference.*` in production), keeping the function pure and
 * testable without a DB. Packaging defaults to 0 at the recipe stage.
 */

import { Dec } from './decimal.js';

// ─── Validation gate constants (PRD §17.11.1) ────────────────────────────────
// String constants so the gate bounds flow through the exact-money `Dec` path
// without ever touching a binary float.
/** Submit-for-trial gate lower bound: totalPct must be ≥ 99.99. */
export const TOTAL_PCT_MIN = '99.99';
/** Submit-for-trial gate upper bound: totalPct must be ≤ 100.01. */
export const TOTAL_PCT_MAX = '100.01';

// ─── Output precision (fixed decimal places, deterministic) ──────────────────
const PCT_DP = 3; // totalPct e.g. "100.000"
const COST_DP = 4; // per-kg costs e.g. "1.7868"
const MARGIN_DP = 2; // marginPct e.g. "33.00"
const NUTRITION_DP = 2; // per-100g nutrient e.g. "15.00"

// ─── Default process constants ───────────────────────────────────────────────
const DEFAULT_PROCESSING_OVERHEAD_PCT = '8'; // 8 % of yielded cost
// Packaging is NOT part of the recipe — it is added only AFTER the packaging
// stage (the caller passes a real value then). At the recipe stage it is 0.
const DEFAULT_PACKAGING_COST_PER_KG = '0';
// Pack weight has NO default — it must come from npd_projects.pack_weight_g. When
// unset, per-kg figures (rawCost, costPerKg, revenue, margin) are 0 (we never
// fabricate a 200 g pack).
const DEFAULT_PACK_WEIGHT_KG = '0';
// Quantity-balance gate tolerance: Σ qtyKg must be within ±0.01 % of pack weight.
const QTY_BALANCE_TOLERANCE_PCT = '0.01';

/**
 * A NUMERIC value as read from Postgres — a string, or null when unset.
 * STRING-ONLY by design: monetary / NUMERIC inputs must never be a JS `number`
 * (binary float would drift cents), so this type rejects `number` at the
 * boundary and `Dec.from` enforces it again at runtime.
 */
export type Numericish = string | null | undefined;

export interface RecomputeIngredient {
  rmCode: string;
  /**
   * Costing v2 — the AMOUNT of this ingredient used in ONE PACK, in the
   * ingredient's base unit (kg for now). NUMERIC string. This is the primary
   * cost driver: rawCostPerPack = Σ(qtyKg × costPerKg).
   */
  qtyKg?: Numericish;
  /**
   * Legacy inclusion percentage (0–100), NUMERIC string. Retained for the
   * composition bar / back-compat; NOT used in the v2 cost roll-up. Optional.
   */
  pct?: Numericish;
  /** Cost per kg in EUR, NUMERIC string; null when the RM has no cost yet. */
  costPerKgEur: Numericish;
  /** EU-14 allergen codes inherited from the raw material. */
  allergensInherited: string[];
  /**
   * Optional per-100g nutrient values for this RM keyed by nutrient code
   * (e.g. { energy, fat, protein, salt }). NUMERIC strings. When omitted the
   * RM contributes 0 to every nutrient (and nutrition stays empty if no RM
   * carries any data).
   */
  nutritionPer100g?: Record<string, Numericish>;
}

export interface RecomputeInput {
  ingredients: RecomputeIngredient[];
  /**
   * Batch size in kg (carried for context). In Costing v2 the batch size IS the
   * pack net weight; pass it via `packWeightKg`. Retained for back-compat.
   */
  batchKg?: Numericish;
  /** Target sell price per pack in EUR. */
  targetPriceEur?: Numericish;
  /** Process yield percentage (0–100). */
  yieldPct?: Numericish;
  /**
   * Pack net weight in kg = npd_projects.pack_weight_g / 1000. No default —
   * when unset (0/null) the per-kg figures are 0 (we never assume a 200 g pack).
   */
  packWeightKg?: Numericish;
  /** Processing overhead as a % of yielded cost (default 8). */
  processingOverheadPct?: Numericish;
  /**
   * Flat packaging cost per kg in EUR. DEFAULT 0 — packaging is NOT part of the
   * recipe; the caller passes a real value only AFTER the packaging stage.
   */
  packagingCostPerKg?: Numericish;
  /** Allergens added by the process itself (e.g. line changeover). */
  processAddedAllergens?: string[];
}

export interface RecomputeResult {
  /** Sum of ingredient pcts, fixed to 3 dp (e.g. "100.000"). Legacy / composition. */
  totalPct: string;
  /** True iff totalPct ∈ [99.99, 100.01] (legacy %-balance — informational only). */
  totalPctValid: boolean;
  /** Costing v2 — sum of ingredient qtyKg (the pack weight built so far), 3 dp string. */
  totalQtyKg: string;
  /**
   * Costing v2 — true iff Σ qtyKg is within ±0.01 % of packWeightKg (the submit gate
   * replacing the old "must equal 100 %" rule). When packWeightKg is unset (0),
   * this is `true` (no hard block — see qtyBalanceUnset).
   */
  qtyBalanceValid: boolean;
  /** True when packWeightKg is unset/0 so the balance gate cannot be evaluated. */
  qtyBalanceUnset: boolean;
  /** True iff every ingredient has a non-null cost (submit-for-trial gate). */
  allRmHaveCost: boolean;
  /** Costing v2 — raw material cost for ONE PACK = Σ(qtyKg × costPerKg), 4 dp string. */
  rawCostPerPack: string;
  /** Raw material cost per kg = rawCostPerPack / packWeightKg, 4 dp string. */
  rawCost: string;
  /** Cost per kg after yield loss, 4 dp string. */
  yieldedCost: string;
  /** Processing overhead per kg, 4 dp string. */
  processing: string;
  /** Packaging cost per kg, 4 dp string. */
  packaging: string;
  /** Total fully-loaded cost per kg, 4 dp string. */
  costPerKg: string;
  /** Revenue per kg derived from target price / pack weight, 4 dp string. */
  revenuePerKg: string;
  /** Gross margin percentage, 2 dp string (may be negative). */
  marginPct: string;
  /** Per-100g nutrition, weighted sum keyed by nutrient code, 2 dp strings. */
  nutrition: Record<string, string>;
  /** Sorted, deduped union of ingredient + process allergens. */
  allergens: string[];
}

const HUNDRED = Dec.from('100');

/**
 * Compute cost / nutrition / allergen figures for a formulation version.
 * Pure & deterministic — see module docstring.
 */
export function recomputeCalc(input: RecomputeInput): RecomputeResult {
  const ingredients = input.ingredients ?? [];

  // ── pack weight (kg) — the recipe batch size; no default ───────────────────
  const packWeightDec = Dec.from(input.packWeightKg ?? DEFAULT_PACK_WEIGHT_KG);

  // ── legacy totalPct (exact sum) — informational / composition only ─────────
  let totalPctDec = Dec.zero();
  for (const ing of ingredients) {
    if (ing.pct === null || ing.pct === undefined || ing.pct === '') continue;
    totalPctDec = totalPctDec.add(Dec.from(ing.pct));
  }
  const totalPct = totalPctDec.toFixed(PCT_DP);
  const totalPctValid = isTotalPctValid(totalPct);

  // ── rawCostPerPack = Σ (qtyKg × costPerKg) + Σ qtyKg ───────────────────────
  let rawCostPerPackDec = Dec.zero();
  let totalQtyDec = Dec.zero();
  let allRmHaveCost = true;
  for (const ing of ingredients) {
    const qty = Dec.from(ing.qtyKg);
    totalQtyDec = totalQtyDec.add(qty);
    if (ing.costPerKgEur === null || ing.costPerKgEur === undefined || ing.costPerKgEur === '') {
      allRmHaveCost = false;
      continue; // missing cost contributes 0 but trips the gate flag
    }
    rawCostPerPackDec = rawCostPerPackDec.add(qty.mul(Dec.from(ing.costPerKgEur)));
  }

  // ── qty-balance gate: Σ qtyKg ≈ packWeightKg within ±0.01 % ─────────────────
  const qtyBalanceUnset = packWeightDec.isZero();
  const qtyBalanceValid = qtyBalanceUnset
    ? true // pack weight unset → don't hard-block (gate is informational)
    : withinTolerance(totalQtyDec, packWeightDec, Dec.from(QTY_BALANCE_TOLERANCE_PCT));

  // ── rawCost per kg = rawCostPerPack / packWeightKg ─────────────────────────
  const rawCostDec = packWeightDec.isZero()
    ? Dec.zero()
    : rawCostPerPackDec.div(packWeightDec);

  // ── yield / processing / packaging / total ─────────────────────────────────
  const yieldPctDec = Dec.from(input.yieldPct);
  const yieldedCostDec = yieldPctDec.isZero()
    ? rawCostDec
    : rawCostDec.div(yieldPctDec.div(HUNDRED));

  const overheadPctDec = Dec.from(input.processingOverheadPct ?? DEFAULT_PROCESSING_OVERHEAD_PCT);
  const processingDec = yieldedCostDec.mul(overheadPctDec.div(HUNDRED));

  const packagingDec = Dec.from(input.packagingCostPerKg ?? DEFAULT_PACKAGING_COST_PER_KG);

  const costPerKgDec = yieldedCostDec.add(processingDec).add(packagingDec);

  // ── revenue & margin ───────────────────────────────────────────────────────
  const targetPriceDec = Dec.from(input.targetPriceEur);
  const revenuePerKgDec = packWeightDec.isZero()
    ? Dec.zero()
    : targetPriceDec.div(packWeightDec);

  const marginPctDec = revenuePerKgDec.isZero()
    ? Dec.zero()
    : revenuePerKgDec.sub(costPerKgDec).div(revenuePerKgDec).mul(HUNDRED);

  // ── nutrition per-100g weighted sum ────────────────────────────────────────
  const nutrition = computeNutrition(ingredients);

  // ── allergen union (EU14 inherited + process-added) ────────────────────────
  const allergens = unionAllergens(ingredients, input.processAddedAllergens ?? []);

  return {
    totalPct,
    totalPctValid,
    totalQtyKg: totalQtyDec.toFixed(PCT_DP),
    qtyBalanceValid,
    qtyBalanceUnset,
    allRmHaveCost,
    rawCostPerPack: rawCostPerPackDec.toFixed(COST_DP),
    rawCost: rawCostDec.toFixed(COST_DP),
    yieldedCost: yieldedCostDec.toFixed(COST_DP),
    processing: processingDec.toFixed(COST_DP),
    packaging: packagingDec.toFixed(COST_DP),
    costPerKg: costPerKgDec.toFixed(COST_DP),
    revenuePerKg: revenuePerKgDec.toFixed(COST_DP),
    marginPct: marginPctDec.toFixed(MARGIN_DP),
    nutrition,
    allergens,
  };
}

export function isTotalPctValid(value: Numericish): boolean {
  if (value === null || value === undefined || value === '') return false;
  const totalPct = Dec.from(value);
  return totalPct.cmp(Dec.from(TOTAL_PCT_MIN)) >= 0 && totalPct.cmp(Dec.from(TOTAL_PCT_MAX)) <= 0;
}

/**
 * True iff `value` is within ±`tolerancePct`% of `target` (inclusive). Used for
 * the Costing v2 qty-balance gate (Σ qtyKg ≈ packWeightKg). Exact `Dec` math, no
 * float. Assumes `target > 0` (callers gate on packWeight unset separately).
 */
function withinTolerance(value: Dec, target: Dec, tolerancePct: Dec): boolean {
  const allowance = target.mul(tolerancePct.div(HUNDRED));
  const diff = value.sub(target);
  const absDiff = diff.cmp(Dec.zero()) < 0 ? Dec.zero().sub(diff) : diff;
  return absDiff.cmp(allowance) <= 0;
}

/**
 * Weighted-sum per-100g nutrition: for each nutrient, Σ(pct/100 × per100g).
 * Returns an empty object when no ingredient carries nutrition data. Nutrient
 * keys are emitted in a deterministic (sorted) order for byte-stable output.
 */
function computeNutrition(ingredients: RecomputeIngredient[]): Record<string, string> {
  const acc = new Map<string, Dec>();
  for (const ing of ingredients) {
    if (!ing.nutritionPer100g) continue;
    const fraction = Dec.from(ing.pct).div(HUNDRED);
    for (const [nutrient, value] of Object.entries(ing.nutritionPer100g)) {
      const contribution = fraction.mul(Dec.from(value));
      const current = acc.get(nutrient) ?? Dec.zero();
      acc.set(nutrient, current.add(contribution));
    }
  }
  const out: Record<string, string> = {};
  for (const key of [...acc.keys()].sort()) {
    out[key] = (acc.get(key) as Dec).toFixed(NUTRITION_DP);
  }
  return out;
}

/**
 * Deduped, deterministically-sorted union of all ingredient allergens plus any
 * process-added allergens. Empty strings are ignored.
 */
function unionAllergens(
  ingredients: RecomputeIngredient[],
  processAdded: string[],
): string[] {
  const set = new Set<string>();
  for (const ing of ingredients) {
    for (const a of ing.allergensInherited ?? []) {
      if (a) set.add(a);
    }
  }
  for (const a of processAdded) {
    if (a) set.add(a);
  }
  return [...set].sort();
}
