/**
 * PF-R06-03 — the one definition of "how precise may a BOM scrap % be".
 *
 * `bom_lines.scrap_pct` is `numeric(5,2)`: Postgres SILENTLY rounds a third decimal
 * (2.3456 lands as 2.35), so the user got back a loss factor they never typed. Two
 * decimals are plenty for a scrap coefficient, so the column is NOT widened — the
 * precision is made honest instead and the extra digits are refused with a message.
 *
 * Pure + dependency-free on purpose: the zod schema (server), the "Add component"
 * dialog and the row-edit modal all have to agree, and a client component must not
 * drag a `server-only` module into the browser bundle to ask this question.
 */

/** Max decimal places `bom_lines.scrap_pct numeric(5,2)` can actually store. */
export const SCRAP_PCT_DECIMALS = 2;

/** V-TEC-11 advisory threshold — scrap at or above this is warned about, never blocked. */
export const BOM_SCRAP_WARN_PCT = 50;

/**
 * True when `value` survives a numeric(5,2) round-trip unchanged.
 *
 * Compare against the 2-decimal normalization; never multiply by 100. A bare
 * `value * 100 % 1 === 0` REJECTS a perfectly legal 8.45, because
 * `8.45 * 100 === 844.9999999999999` (2.35 * 100 is exactly 235 — the float dust
 * this guard exists for is real, but that was never the example).
 *
 * The defensive rounding stays; only its width shrinks. The previous `toFixed(6)`
 * tolerance masked six digits of REAL input, not just IEEE dust, so 2.350000001
 * passed validation and Postgres then stored 2.35 — the exact silent rounding this
 * module exists to prevent. `toFixed(2)` rounds the decimal representation, so dust
 * cannot survive it and neither can a third decimal.
 */
export function isScrapPrecisionValid(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Number(value.toFixed(SCRAP_PCT_DECIMALS)) === value;
}
