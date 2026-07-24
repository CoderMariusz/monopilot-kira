/**
 * Shared 0..100 percentage guard for the NPD trial + pilot stages.
 *
 * Previously three copies of the same rule existed — `PERCENT_0_100` in
 * log-trial-batch.ts, an identical copy in update-trial-batch.ts, and
 * `.refine((s) => Number(s) <= 100)` in upsert-pilot-run.ts — each coercing the
 * decimal STRING through `Number()`. That is the one float in an otherwise
 * exact path: `Number('100.0000000000000001')` is exactly `100`, so a value the
 * DB CHECK would round into range slipped past differently depending on the
 * caller. `Dec` (bigint-backed) compares exactly.
 *
 * Mirrors the DB constraints `trial_batches_yield_pct_range` and
 * `pilot_runs_expected_yield_pct_range` (both `>= 0 and <= 100`).
 *
 * ponytail: values beyond Dec's 12 dp scale are truncated before comparison —
 * irrelevant here because both columns are NUMERIC(5,2).
 */

import { Dec } from '@monopilot/domain';

/** Non-negative decimal string, no sign and no exponent (the DB input shape). */
const NON_NEGATIVE_DECIMAL = /^\d+(\.\d+)?$/;

export const PERCENT_MAX = '100';

export function isNonNegativeDecimalString(value: string): boolean {
  return NON_NEGATIVE_DECIMAL.test(value.trim());
}

/** Exact `0 <= value <= 100` over a decimal string. No float coercion. */
export function isPercentWithinRange(value: string): boolean {
  const trimmed = value.trim();
  if (!isNonNegativeDecimalString(trimmed)) return false;
  return Dec.from(trimmed).cmp(Dec.from(PERCENT_MAX)) <= 0;
}

/**
 * Client-side mirror for inline field errors: `null` = nothing to complain
 * about yet (the field is empty), otherwise the reason code the server returns
 * for the same value, so both surfaces render the identical message.
 */
export function percentFieldError(
  value: string,
): 'yield_out_of_range' | 'invalid_input' | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!isNonNegativeDecimalString(trimmed)) return 'invalid_input';
  return isPercentWithinRange(trimmed) ? null : 'yield_out_of_range';
}
