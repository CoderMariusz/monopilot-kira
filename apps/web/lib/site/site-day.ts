/**
 * 14-multi-site — ONE definition of "today" for site-scoped daily figures.
 *
 * The production dashboards used to bucket days with
 * `date_trunc('day', now() at time zone 'UTC')`, so `public.sites.timezone` had
 * no effect on any daily KPI — while expiry (`warehouse/_actions/expiry-actions.ts`)
 * and the scheduler bucketed the SAME data by the site's local day. Two "todays"
 * in one app; for Warsaw that is 1-2h of output attributed to the wrong day, which
 * lands squarely on the night-shift boundary.
 *
 * Worse, the waste/shifts/downtime variants wrote the bare
 * `date_trunc('day', now() AT TIME ZONE 'UTC')`, which yields a `timestamp`
 * (no zone). Comparing it to a `timestamptz` column re-interprets it in the
 * SESSION TimeZone, so those screens had a THIRD boundary again — measured on
 * monopilot_t2 (session Europe/London): 01:00 / 00:00 / 23:00 +01 for the very
 * same instant. Every expression here ends in `at time zone <tz>` so the result
 * is a `timestamptz` and no session-dependent cast can creep back in.
 *
 * Timezone chain is the one `expiry-actions.ts` already established:
 * active site -> organization -> 'UTC'. `app.current_site_id()` is NULL outside
 * `withSiteContext` (and for the "All sites" picker choice), which is exactly
 * when the org-level timezone is the right answer.
 */

/** IANA timezone of the active site, falling back to the org, then UTC. */
export const SITE_TIMEZONE_SQL = `coalesce(
          (select s.timezone from public.sites s
            where s.org_id = app.current_org_id()
              and s.id = app.current_site_id()),
          (select o.timezone from public.organizations o where o.id = app.current_org_id()),
          'UTC')`;

/**
 * The current site-local calendar DATE — for comparing against `date` columns
 * (due dates, effective dates). Same shape `warehouse/_actions/expiry-actions.ts`
 * uses. Plain `current_date` would be the SESSION zone's date instead.
 */
export const SITE_TODAY_SQL = `(pg_catalog.now() at time zone ${SITE_TIMEZONE_SQL})::date`;

/** Midnight that opened the current site-local day, as a `timestamptz`. */
export const SITE_DAY_START_SQL =
  `(date_trunc('day', pg_catalog.now() at time zone ${SITE_TIMEZONE_SQL}) at time zone ${SITE_TIMEZONE_SQL})`;

/**
 * `column` falls inside the trailing `windowDays`-day window that ends with the
 * current site-local day (windowDays = 1 → just today).
 *
 * `windowDays` is interpolated into SQL, so it MUST come from a whitelist —
 * every caller runs it through its own `normalizeWindowDays` ([1,7,30,90]).
 * Guarded here too: the value is coerced to a positive integer.
 */
export function siteDayWindowPredicate(column: string, windowDays: number): string {
  const days = Number.isInteger(windowDays) && windowDays > 0 ? windowDays : 1;
  const start =
    days === 1
      ? `${column} >= ${SITE_DAY_START_SQL}`
      : `${column} >= ${SITE_DAY_START_SQL} - make_interval(days => ${days - 1})`;
  return `${start}
            and ${column} < ${SITE_DAY_START_SQL} + interval '1 day'`;
}
