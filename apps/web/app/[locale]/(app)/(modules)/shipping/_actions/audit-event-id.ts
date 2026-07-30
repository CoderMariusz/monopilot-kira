/**
 * audit_events.id is bigint; node-postgres returns bigint columns as strings by default.
 * ponytail: local coercion instead of a global pg setTypeParser — a driver-wide parser change
 * would alter every bigint read in the app. Widen to that only if this shows up outside shipping.
 */
export function toAuditEventId(value: unknown): number | null {
  if (typeof value === 'bigint') value = value.toString();
  if (typeof value === 'string') {
    if (!/^\+?\d+$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  if (typeof value !== 'number') return null;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
