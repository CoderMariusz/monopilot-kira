/**
 * Civil (calendar) date helpers for date-only form fields.
 *
 * Date inputs yield YYYY-MM-DD without timezone. Persist as UTC midnight of that
 * calendar date so round-trip display (slice ISO date) matches what the user picked
 * regardless of browser timezone.
 */

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → ISO instant at 00:00:00.000Z for that calendar day. */
export function civilDateToUtcIso(date: string): string {
  if (!CIVIL_DATE_RE.test(date)) {
    throw new Error(`civilDateToUtcIso: expected YYYY-MM-DD, got ${date}`);
  }
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

/** Today's calendar date in UTC (YYYY-MM-DD) for date-input defaults. */
export function todayCivilDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO timestamptz → YYYY-MM-DD in UTC (for `<input type="date">` value). */
export function utcIsoToCivilDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}
