/**
 * Shared GRN list/detail read-model fragments (C054 item count, C055 expiry traceability).
 *
 * Receipt core persists civil dates on grn_items.best_before_date and on the linked LP;
 * gi.expiry_date is often null on legacy rows. Coalesce line + LP sources for display.
 */

/** SQL expression: traceable expiry for a GRN receipt line (gi + linked LP). */
export const GRN_LINE_EXPIRY_SQL =
  'coalesce(gi.expiry_date, lp.expiry_date, gi.best_before_date, lp.best_before_date)';

/** Parse count(*) from pg (int / bigint / numeric string) without float drift. */
export function parseGrnItemCount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
