/**
 * Wave E-IO — Bulk import: generic, browser-safe CSV helpers shared by the
 * Transfer Order and Work Order importers (and structurally identical to the PO
 * importer's `parse-po-csv.ts`, which is kept verbatim so the shipped PO flow and
 * its tests stay byte-identical).
 *
 * No Supabase, no React, no Server Action import — the wizard parses the uploaded
 * file entirely client-side and these helpers stay unit-testable in isolation.
 * Everything is driven off a single `EntityCsvSpec` so a new importer only
 * declares its columns + how to coerce/extract them; the parser, template,
 * grouping and error-report builders all key off that one spec.
 *
 * org_id is NEVER read from the CSV — the owning Server Action re-validates
 * server-side under withOrgContext (fail-closed). These helpers only parse text
 * and shape rows; all authority lives in the action.
 */

import { toCsv } from '../../../../../../../lib/shared/download';

/** A single parsed CSV row + the 1-based file row number for the UI. */
export type ParsedEntityRow<TRow> = { rowNumber: number; row: TRow };

export type EntityParseResult<TRow> =
  | { ok: true; rows: ParsedEntityRow<TRow>[]; headers: string[] }
  | {
      ok: false;
      error: 'empty' | 'header_mismatch';
      headerMismatch?: { expected: string[]; received: string[] };
    };

/**
 * Declarative spec for one entity importer. `columns` is the canonical column
 * order (template header + parser order); `required` is the subset the header
 * must contain. `coerce` turns the raw cell map into the backend row shape, and
 * `cells` flattens a row back into the column order for the error report.
 */
export type EntityCsvSpec<TRow> = {
  columns: readonly string[];
  required: readonly string[];
  exampleRow: Record<string, string>;
  coerce: (cell: (col: string) => string) => TRow;
  cells: (row: TRow) => string[];
  /** Group rows into the unit the backend creates one document per. */
  groupKey: (row: TRow) => string;
};

/** Minimal RFC-4180-ish field splitter (quoted fields + commas/quotes inside). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Split raw CSV text into non-empty logical lines (tolerates CRLF + trailing blank lines). */
function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

/** Coerce a blank string to undefined, otherwise to a number (NaN when unparseable). */
export function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? Number.NaN : n;
}

/**
 * Parse uploaded CSV text into the backend row shape. Requires the header to
 * contain at least the spec's required columns; unknown extra columns are
 * ignored. rowNumber is 1-based over the data rows (matching the backend's
 * `rowNumber: index + 1` and a spreadsheet user's "first data row = #1" mental
 * model used across the import wizard).
 */
export function parseEntityCsv<TRow>(text: string, spec: EntityCsvSpec<TRow>): EntityParseResult<TRow> {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, error: 'empty' };

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const missing = spec.required.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'header_mismatch',
      headerMismatch: { expected: [...spec.columns], received: headers },
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) return { ok: false, error: 'empty' };

  const rows: ParsedEntityRow<TRow>[] = dataLines.map((line, i) => {
    const cells = splitCsvLine(line);
    const cell = (col: string): string => {
      const at = headers.indexOf(col);
      return at >= 0 ? (cells[at] ?? '').trim() : '';
    };
    return { rowNumber: i + 1, row: spec.coerce(cell) };
  });

  return { ok: true, rows, headers };
}

/** Build the downloadable CSV template: header columns + one example row. */
export function buildEntityTemplateCsv<TRow>(spec: EntityCsvSpec<TRow>): string {
  return toCsv([...spec.columns], [spec.columns.map((col) => spec.exampleRow[col] ?? '')]);
}

/**
 * Group parsed rows by the spec's groupKey — the same grouping the backend uses
 * to decide how many documents get created. Used by the wizard's preview step.
 */
export function groupEntityRows<TRow>(
  rows: ParsedEntityRow<TRow>[],
  spec: EntityCsvSpec<TRow>,
): Array<{ key: string; firstRow: TRow; lineCount: number }> {
  const groups = new Map<string, { key: string; firstRow: TRow; lineCount: number }>();
  for (const { row } of rows) {
    const key = spec.groupKey(row);
    const existing = groups.get(key);
    if (existing) existing.lineCount += 1;
    else groups.set(key, { key, firstRow: row, lineCount: 1 });
  }
  return Array.from(groups.values());
}

/**
 * Build a CSV "error report" of the failed rows: every original column plus a
 * trailing `error` column joining that row's validation messages. Driven off the
 * validation result so the user can fix-and-re-upload only the broken rows.
 */
export function buildEntityErrorReportCsv<TRow>(
  parsed: ParsedEntityRow<TRow>[],
  validationRows: Array<{ rowNumber: number; ok: boolean; errors: Array<{ column: string; message: string }> }>,
  spec: EntityCsvSpec<TRow>,
): string {
  const errorByRow = new Map<number, string>();
  for (const r of validationRows) {
    if (r.ok) continue;
    errorByRow.set(r.rowNumber, r.errors.map((e) => `${e.column}: ${e.message}`).join(' | '));
  }
  const header = [...spec.columns, 'error'];
  const failed = parsed.filter((p) => errorByRow.has(p.rowNumber));
  const rows = failed.map((p) => [...spec.cells(p.row), errorByRow.get(p.rowNumber) ?? '']);
  return toCsv(header, rows);
}
