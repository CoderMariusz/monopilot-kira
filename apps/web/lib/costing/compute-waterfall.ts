/**
 * T-073 — Pure 9-step costing waterfall (§17.11.3).
 *
 * PRD: docs/prd/01-NPD-PRD.md §17.11.3.
 *
 * DETERMINISTIC + NUMERIC-EXACT. Money is NEVER carried as a JS float: every
 * monetary quantity is represented internally as a scaled BigInt (fixed
 * `MONEY_SCALE` decimal places) and surfaced to callers as a fixed-scale
 * decimal STRING. Percentages are likewise parsed into scaled BigInts. There is
 * no `Number()` / `parseFloat()` on any monetary value anywhere in this module.
 *
 * This is a PURE function — no I/O, no DB, no clock. The Server Action
 * (`./_actions/compute.ts`) calls it and persists the result.
 *
 * Note on file location: the task contract names `packages/domain/src/costing/`,
 * but this repo has no `packages/domain` workspace. Pure NPD domain rules live
 * under `apps/web/lib/<module>/` (cf. `apps/web/lib/settings/rules/`), and the
 * Server Action that consumes this helper lives in the same app, so the helper
 * is co-located here following the established repo convention.
 */

/** Canonical, ordered 9-step waterfall names (§17.11.3). step_index = idx+1. */
export const COSTING_WATERFALL_STEP_NAMES = [
  'Raw materials', // 1 — base raw material cost
  'Yield loss', // 2 — material cost grossed up for yield losses
  'Process labour', // 3 — + direct process labour
  'Packaging', // 4 — + packaging
  'Overhead', // 5 — + manufacturing overhead
  'Logistics', // 6 — + inbound/outbound logistics (== COGS)
  'Margin', // 7 — manufacturer margin -> ex-works price
  'Distributor', // 8 — distributor markup
  'Retail', // 9 — retail markup -> final retail price
] as const;

export type CostingWaterfallStepName = (typeof COSTING_WATERFALL_STEP_NAMES)[number];

/** All monetary fields are decimal strings; all percentages are decimal strings. */
export interface WaterfallParams {
  /** Base raw-material cost (EUR). */
  rawCostEur: string;
  /** Yield percentage in (0, 100]. e.g. "90" means 90% yield. */
  yieldPct: string;
  /** Direct process labour added cost (EUR). */
  processLabourEur: string;
  /** Packaging added cost (EUR). */
  packagingEur: string;
  /** Manufacturing overhead added cost (EUR). */
  overheadEur: string;
  /** Logistics added cost (EUR). */
  logisticsEur: string;
  /** Manufacturer margin percentage in (-100, 100). Drives ex-works price. */
  marginPct: string;
  /** Distributor markup percentage (>= 0). */
  distributorMarkupPct: string;
  /** Retail markup percentage (>= 0). */
  retailMarkupPct: string;
}

export interface WaterfallStep {
  stepIndex: number;
  stepName: CostingWaterfallStepName;
  /** Cumulative running value at this step (fixed-scale decimal string). */
  valueEur: string;
  /** Percent change vs the prior step (decimal string); null for step 1. */
  deltaPct: string | null;
}

export type WaterfallStatus = 'ok' | 'warn' | 'fail';

export interface WaterfallResult {
  steps: WaterfallStep[];
  /** Echo of the raw-material cost (fixed-scale decimal string). */
  rawCostEur: string;
  /** The scenario margin percentage (fixed-scale decimal string). */
  marginPct: string;
  /** Final retail (target) price (fixed-scale decimal string). */
  targetPriceEur: string;
  /**
   * V07 status:
   *   - 'fail' when margin < 0% (hard fail — caller MUST NOT persist).
   *   - 'warn' when 0% <= margin < warn threshold.
   *   - 'ok'   otherwise (or when no warn threshold was supplied).
   */
  status: WaterfallStatus;
  /** Convenience boolean: true iff status === 'warn'. */
  warn: boolean;
}

export interface WaterfallThresholds {
  /**
   * Margin warn threshold percentage (decimal string), read from
   * Reference.AlertThresholds (`costing_margin_warn_pct`). When omitted, the
   * function cannot raise a 'warn' (only the hard-fail floor applies).
   */
  marginWarnPct?: string;
}

// ─── Exact fixed-scale decimal arithmetic on BigInt (no floats) ───────────────

/** Internal working scale (decimal places) for money + percentages. */
const MONEY_SCALE = 4;
/** Higher intermediate scale to keep division/multiplication exact before rounding. */
const WORK_SCALE = 12;

const SCALE_FACTOR = (scale: number): bigint => 10n ** BigInt(scale);

/** Parse a decimal string into a BigInt scaled to `scale` (half-up). */
function parseScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`computeWaterfall: not a decimal string: ${JSON.stringify(value)}`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPartRaw = ''] = unsigned.split('.');
  // Pad/truncate the fractional part to `scale`, rounding half-up on truncation.
  let frac = fracPartRaw;
  if (frac.length > scale) {
    const keep = frac.slice(0, scale);
    const nextDigit = frac.charCodeAt(scale) - 48; // first dropped digit
    let scaled = BigInt(intPart + (keep || ''));
    if (nextDigit >= 5) scaled += 1n;
    return negative ? -scaled : scaled;
  }
  frac = frac.padEnd(scale, '0');
  const scaled = BigInt(intPart + frac);
  return negative ? -scaled : scaled;
}

/** Format a BigInt scaled at `scale` back into a fixed-scale decimal string. */
function formatScaled(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const factor = SCALE_FACTOR(scale);
  const intPart = abs / factor;
  const fracPart = abs % factor;
  const fracStr = fracPart.toString().padStart(scale, '0');
  const body = scale === 0 ? intPart.toString() : `${intPart.toString()}.${fracStr}`;
  return negative && scaled !== 0n ? `-${body}` : body;
}

/** Re-scale a BigInt from `fromScale` to `toScale` (half-up). */
function rescale(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale === fromScale) return value;
  if (toScale > fromScale) return value * SCALE_FACTOR(toScale - fromScale);
  const drop = SCALE_FACTOR(fromScale - toScale);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const q = abs / drop;
  const r = abs % drop;
  const rounded = r * 2n >= drop ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Multiply two WORK_SCALE BigInts, returning a WORK_SCALE BigInt (half-up). */
function mulWork(a: bigint, b: bigint): bigint {
  return rescale(a * b, WORK_SCALE * 2, WORK_SCALE);
}

/** Divide two WORK_SCALE BigInts, returning a WORK_SCALE BigInt (half-up). */
function divWork(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('computeWaterfall: division by zero');
  const negative = a < 0n !== b < 0n;
  const absA = (a < 0n ? -a : a) * SCALE_FACTOR(WORK_SCALE);
  const absB = b < 0n ? -b : b;
  const q = absA / absB;
  const r = absA % absB;
  const rounded = r * 2n >= absB ? q + 1n : q;
  return negative ? -rounded : rounded;
}

const ONE_WORK = SCALE_FACTOR(WORK_SCALE);
const HUNDRED_WORK = 100n * ONE_WORK;

/** Percent change ((cur - prev) / prev) * 100, as a MONEY_SCALE decimal string. */
function deltaPct(prevMoney4: bigint, curMoney4: bigint): string | null {
  if (prevMoney4 === 0n) return null;
  const prev = rescale(prevMoney4, MONEY_SCALE, WORK_SCALE);
  const cur = rescale(curMoney4, MONEY_SCALE, WORK_SCALE);
  const ratio = divWork(cur - prev, prev);
  const pct = mulWork(ratio, HUNDRED_WORK);
  return formatScaled(rescale(pct, WORK_SCALE, MONEY_SCALE), MONEY_SCALE);
}

// ─── Exact decimal-string comparison (for input bounds; no float coercion) ────

/** Compare two decimal strings EXACTLY at full precision. -1 | 0 | 1. */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const sa = parseScaled(a, WORK_SCALE);
  const sb = parseScaled(b, WORK_SCALE);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

/** a < b (exact decimal-string comparison). */
export function decimalLt(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) < 0;
}

/** a <= b (exact decimal-string comparison). */
export function decimalLte(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) <= 0;
}

/** a > b (exact decimal-string comparison). */
export function decimalGt(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) > 0;
}

// ─── Public compute ───────────────────────────────────────────────────────────

/**
 * Compute the deterministic 9-step costing waterfall. All money math is exact
 * scaled-BigInt arithmetic; the returned values are fixed-scale decimal strings.
 */
export function computeWaterfall(
  params: WaterfallParams,
  thresholds: WaterfallThresholds = {},
): WaterfallResult {
  // Parse inputs at the working scale (money) / working scale (pct as fraction).
  const rawCost = rescale(parseScaled(params.rawCostEur, MONEY_SCALE), MONEY_SCALE, WORK_SCALE);
  const yieldFrac = divWork(parseScaled(params.yieldPct, WORK_SCALE), HUNDRED_WORK);
  const labour = rescale(parseScaled(params.processLabourEur, MONEY_SCALE), MONEY_SCALE, WORK_SCALE);
  const packaging = rescale(parseScaled(params.packagingEur, MONEY_SCALE), MONEY_SCALE, WORK_SCALE);
  const overhead = rescale(parseScaled(params.overheadEur, MONEY_SCALE), MONEY_SCALE, WORK_SCALE);
  const logistics = rescale(parseScaled(params.logisticsEur, MONEY_SCALE), MONEY_SCALE, WORK_SCALE);
  const marginFrac = divWork(parseScaled(params.marginPct, WORK_SCALE), HUNDRED_WORK);
  const distFrac = divWork(parseScaled(params.distributorMarkupPct, WORK_SCALE), HUNDRED_WORK);
  const retailFrac = divWork(parseScaled(params.retailMarkupPct, WORK_SCALE), HUNDRED_WORK);

  // Bounds (full internal precision — never display-rounded):
  //   0 < yieldPct <= 100  (>100 would silently REDUCE cost via gross-up).
  //   marginPct < 100      (>=100 => 1-margin <= 0 => div-by-zero / negative price).
  const yieldWork = rescale(parseScaled(params.yieldPct, WORK_SCALE), WORK_SCALE, WORK_SCALE);
  if (yieldFrac <= 0n) {
    throw new Error('computeWaterfall: yieldPct must be > 0');
  }
  if (yieldWork > HUNDRED_WORK) {
    throw new Error('computeWaterfall: yieldPct must be <= 100');
  }
  const marginWork = rescale(parseScaled(params.marginPct, WORK_SCALE), WORK_SCALE, WORK_SCALE);
  if (marginWork >= HUNDRED_WORK) {
    throw new Error('computeWaterfall: marginPct must be < 100');
  }

  // Cumulative running totals (WORK_SCALE).
  const s1 = rawCost; // Raw materials
  const s2 = divWork(s1, yieldFrac); // Yield loss: gross up by yield
  const s3 = s2 + labour; // Process labour
  const s4 = s3 + packaging; // Packaging
  const s5 = s4 + overhead; // Overhead
  const s6 = s5 + logistics; // Logistics (== COGS)
  // Margin: ex-works price = COGS / (1 - margin). marginFrac may be negative.
  const denom = ONE_WORK - marginFrac;
  const s7 = divWork(s6, denom); // Margin
  const s8 = mulWork(s7, ONE_WORK + distFrac); // Distributor
  const s9 = mulWork(s8, ONE_WORK + retailFrac); // Retail (final)

  const workValues = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  // Round each cumulative value to MONEY_SCALE once, deterministically.
  const moneyValues = workValues.map((v) => rescale(v, WORK_SCALE, MONEY_SCALE));

  const steps: WaterfallStep[] = COSTING_WATERFALL_STEP_NAMES.map((name, idx) => ({
    stepIndex: idx + 1,
    stepName: name,
    valueEur: formatScaled(moneyValues[idx]!, MONEY_SCALE),
    deltaPct: idx === 0 ? null : deltaPct(moneyValues[idx - 1]!, moneyValues[idx]!),
  }));

  // V07 gate at FULL internal precision (WORK_SCALE) — NEVER on the
  // display-rounded 4dp value. `marginPct` (below) is display-only.
  const marginPctWork = parseScaled(params.marginPct, WORK_SCALE);
  const status = computeStatus(marginPctWork, thresholds.marginWarnPct);
  const marginPct4 = parseScaled(params.marginPct, MONEY_SCALE);

  return {
    steps,
    rawCostEur: formatScaled(rescale(rawCost, WORK_SCALE, MONEY_SCALE), MONEY_SCALE),
    marginPct: formatScaled(marginPct4, MONEY_SCALE),
    targetPriceEur: formatScaled(moneyValues[8]!, MONEY_SCALE),
    status,
    warn: status === 'warn',
  };
}

/**
 * V07 status from the scenario margin and the optional warn threshold (decimal
 * string from Reference.AlertThresholds). The margin is compared at FULL
 * internal precision (WORK_SCALE BigInt) — NEVER on a display-rounded value, so
 * e.g. 14.99999% warns (not ok) and -0.00001% fails (not ok).
 *   margin < 0%                  -> 'fail' (hard fail)
 *   0% <= margin < warn          -> 'warn'
 *   margin >= warn (or no warn)  -> 'ok'
 * Warn is strictly below the threshold (a margin AT the threshold is ok).
 */
function computeStatus(marginPctWork: bigint, marginWarnPct?: string): WaterfallStatus {
  if (marginPctWork < 0n) return 'fail';
  if (marginWarnPct === undefined) return 'ok';
  const warnWork = parseScaled(marginWarnPct, WORK_SCALE);
  return marginPctWork < warnWork ? 'warn' : 'ok';
}
