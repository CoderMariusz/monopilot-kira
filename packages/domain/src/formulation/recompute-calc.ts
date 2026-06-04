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
 * The cost model mirrors the prototype `useLiveCalc`:
 *   rawCost      = Σ (pct/100 × costPerKg)
 *   yieldedCost  = yieldPct > 0 ? rawCost / (yieldPct/100) : rawCost
 *   processing   = yieldedCost × (processingOverheadPct/100)
 *   packaging    = packagingCostPerKg (constant per kg)
 *   costPerKg    = yieldedCost + processing + packaging
 *   revenuePerKg = packWeightKg > 0 ? targetPrice / packWeightKg : 0
 *   marginPct    = revenuePerKg > 0 ? (revenuePerKg − costPerKg)/revenuePerKg × 100 : 0
 *
 * Overhead / packaging / pack-weight default to the prototype constants but are
 * caller-overridable (they live in `Reference.*` in production), keeping the
 * function pure and testable without a DB.
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

// ─── Default process constants (prototype recipe.jsx:8-12) ───────────────────
const DEFAULT_PROCESSING_OVERHEAD_PCT = '8'; // 8 % of yielded cost
const DEFAULT_PACKAGING_COST_PER_KG = '0.65';
const DEFAULT_PACK_WEIGHT_KG = '0.2'; // pack is 200 g

/**
 * A NUMERIC value as read from Postgres — a string, or null when unset.
 * STRING-ONLY by design: monetary / NUMERIC inputs must never be a JS `number`
 * (binary float would drift cents), so this type rejects `number` at the
 * boundary and `Dec.from` enforces it again at runtime.
 */
export type Numericish = string | null | undefined;

export interface RecomputeIngredient {
  rmCode: string;
  /** Inclusion percentage (0–100), NUMERIC string. */
  pct: Numericish;
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
  /** Batch size in kg (carried for context; does not affect per-kg figures). */
  batchKg?: Numericish;
  /** Target sell price per pack in EUR. */
  targetPriceEur?: Numericish;
  /** Process yield percentage (0–100). */
  yieldPct?: Numericish;
  /** Pack net weight in kg (default 0.2 = 200 g). */
  packWeightKg?: Numericish;
  /** Processing overhead as a % of yielded cost (default 8). */
  processingOverheadPct?: Numericish;
  /** Flat packaging cost per kg in EUR (default 0.65). */
  packagingCostPerKg?: Numericish;
  /** Allergens added by the process itself (e.g. line changeover). */
  processAddedAllergens?: string[];
}

export interface RecomputeResult {
  /** Sum of ingredient pcts, fixed to 3 dp (e.g. "100.000"). */
  totalPct: string;
  /** True iff totalPct ∈ [99.99, 100.01] (submit-for-trial gate). */
  totalPctValid: boolean;
  /** True iff every ingredient has a non-null cost (submit-for-trial gate). */
  allRmHaveCost: boolean;
  /** Raw material cost per kg = Σ(pct/100 × costPerKg), 4 dp string. */
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

  // ── totalPct (exact sum) ───────────────────────────────────────────────────
  let totalPctDec = Dec.zero();
  for (const ing of ingredients) {
    totalPctDec = totalPctDec.add(Dec.from(ing.pct));
  }
  const totalPct = totalPctDec.toFixed(PCT_DP);
  const totalPctValid = withinGate(totalPctDec);

  // ── rawCost = Σ (pct/100 × costPerKg) ──────────────────────────────────────
  let rawCostDec = Dec.zero();
  let allRmHaveCost = true;
  for (const ing of ingredients) {
    if (ing.costPerKgEur === null || ing.costPerKgEur === undefined || ing.costPerKgEur === '') {
      allRmHaveCost = false;
      continue; // missing cost contributes 0 but trips the gate flag
    }
    const fraction = Dec.from(ing.pct).div(HUNDRED);
    rawCostDec = rawCostDec.add(fraction.mul(Dec.from(ing.costPerKgEur)));
  }

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
  const packWeightDec = Dec.from(input.packWeightKg ?? DEFAULT_PACK_WEIGHT_KG);
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
    allRmHaveCost,
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

function withinGate(totalPct: Dec): boolean {
  return totalPct.cmp(Dec.from(TOTAL_PCT_MIN)) >= 0 && totalPct.cmp(Dec.from(TOTAL_PCT_MAX)) <= 0;
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
