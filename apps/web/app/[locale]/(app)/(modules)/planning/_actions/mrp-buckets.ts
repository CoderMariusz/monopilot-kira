/**
 * ISO-week bucket helpers for time-phased MRP (roadmap §5.1).
 * Pure module — no I/O, safe to import from mrp-compute and tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO-8601 week-of-year + week-year for a UTC date (Thursday rule). */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year: isoYear, week };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Current ISO-8601 week label (e.g. '2026-W25') for a UTC date. */
export function currentIsoWeek(now: Date = new Date()): string {
  const { year, week } = isoWeekOf(now);
  return formatIsoWeek(year, week);
}

/** Monday (yyyy-mm-dd) of an ISO week label — UTC-safe. */
export function isoWeekStartDate(isoWeek: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) throw new Error(`invalid iso week: ${isoWeek}`);
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const monday = new Date(firstThursday.getTime() + (week - 1) * 7 * DAY_MS - 3 * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** today (yyyy-mm-dd) + N days, UTC-safe. */
export function addDaysIso(todayIso: string, days: number): string {
  const base = new Date(`${todayIso}T00:00:00Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Planning horizon end date (today + weeks × 7). */
export function planningHorizonEnd(todayIso: string, horizonWeeks: number): string {
  return addDaysIso(todayIso, horizonWeeks * 7);
}

/** Sentinel returned by dateToBucketIndex / isoWeekToBucketIndex when the date is past the horizon. */
export const OUT_OF_HORIZON_BUCKET_INDEX = -1;

/** Last calendar day (Sunday) covered by the weekly bucket grid. */
export function bucketHorizonEnd(bucketDates: readonly string[]): string | null {
  if (bucketDates.length === 0) return null;
  return addDaysIso(bucketDates[bucketDates.length - 1]!, 6);
}

/** Weekly bucket start dates (Mondays), oldest-first, count = horizonWeeks. */
export function buildMrpBucketDates(todayIso: string, horizonWeeks: number): string[] {
  const start = new Date(`${todayIso}T00:00:00Z`);
  const { year, week } = isoWeekOf(start);
  let cursor = isoWeekStartDate(formatIsoWeek(year, week));
  const buckets: string[] = [];
  for (let i = 0; i < horizonWeeks; i += 1) {
    buckets.push(cursor);
    cursor = addDaysIso(cursor, 7);
  }
  return buckets;
}

/**
 * Map a calendar date to the bucket index whose Monday is on or before it.
 * Pre-horizon dates clamp to bucket 0; post-horizon dates return OUT_OF_HORIZON_BUCKET_INDEX.
 */
export function dateToBucketIndex(dateIso: string, bucketDates: readonly string[]): number {
  if (bucketDates.length === 0) return OUT_OF_HORIZON_BUCKET_INDEX;
  const d = dateIso.slice(0, 10);
  const horizonEnd = bucketHorizonEnd(bucketDates);
  if (horizonEnd !== null && d > horizonEnd) return OUT_OF_HORIZON_BUCKET_INDEX;
  let idx = 0;
  for (let i = 0; i < bucketDates.length; i += 1) {
    if (bucketDates[i]! <= d) idx = i;
    else break;
  }
  return idx;
}

/** Map an ISO week label to the matching bucket index; post-horizon weeks are excluded. */
export function isoWeekToBucketIndex(isoWeek: string, bucketDates: readonly string[]): number {
  const start = isoWeekStartDate(isoWeek);
  return dateToBucketIndex(start, bucketDates);
}
