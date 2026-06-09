/**
 * Shared client-side download helpers (LANE 14 · dead-Export-button repair).
 *
 * Pure, browser-only utilities for turning data the page ALREADY holds into a
 * file the user can save — no backend, no Server Action, no extra fetch. Used by
 * the NPD Handoff "Export handoff packet" (JSON), NPD Sensory "Export scores"
 * (CSV) and Technical Recipe-cost "Export cost sheet" (CSV) buttons.
 *
 * `toCsv` quotes every field that contains a quote, comma, CR or LF (RFC 4180:
 * doubled inner quotes, CRLF row separator). `downloadBlob` is the single
 * Blob → anchor → click → revoke path so the three screens stay consistent and
 * a test can mock `URL.createObjectURL` + the anchor click in one place.
 */

/** RFC-4180 escape: quote a field if it holds `"`, `,`, CR or LF; double inner `"`. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + data rows (CRLF separators, RFC 4180). */
export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Trigger a client-side file download from in-memory `content`. Creates a Blob,
 * an object URL, a transient <a download>, clicks it, then revokes the URL.
 * No-op when `document` is unavailable (SSR safety). Returns the filename used.
 */
export function downloadBlob(
  content: string,
  filename: string,
  mimeType: string,
): string {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return filename;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

/** Download a UTF-8 CSV file (`text/csv`). */
export function downloadCsv(content: string, filename: string): string {
  return downloadBlob(content, filename, 'text/csv;charset=utf-8');
}

/** Pretty-print a value as JSON and download it (`application/json`). */
export function downloadJson(value: unknown, filename: string): string {
  return downloadBlob(JSON.stringify(value, null, 2), filename, 'application/json;charset=utf-8');
}

/** `YYYY-MM-DD` for filename stamping (UTC-stable; `now` injectable for tests). */
export function isoDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Filesystem-safe slug for filename segments (keep alnum, `.`, `-`, `_`). */
export function fileSafe(segment: string | null | undefined): string {
  const s = (segment ?? '').trim();
  if (!s) return 'export';
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}
