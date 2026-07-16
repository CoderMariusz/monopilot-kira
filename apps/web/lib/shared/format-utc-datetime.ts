/**
 * UTC-pinned instant display for client islands (React #418 / hydration).
 *
 * `Intl.DateTimeFormat` without an explicit `timeZone` uses the host timezone.
 * Vercel SSR runs in UTC while browsers use local TZ → server/client text mismatch.
 * Pin UTC (or format via `toISOString`) so SSR and hydration agree byte-for-byte.
 */

export function formatUtcIsoMinute(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function formatUtcDateTime(
  iso: string | null,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!iso) return '—';
  const utcMs = Date.parse(iso);
  if (Number.isNaN(utcMs)) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...options,
  }).format(new Date(utcMs));
}
