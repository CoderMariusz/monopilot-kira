/**
 * 03-technical · TEC-014 Bulk Import CSV (T-085): pure CSV parse + validate +
 * diff for the items master. No Supabase, no React — so it is unit-testable in
 * isolation and reused by the preview Server Action.
 *
 * Red-line overlay (Technical):
 *   - FG is canonical; FA is legacy. An `fa`/`FA####` item_type or any `FA-`
 *     prefixed code is rejected with a row-level error pointing at the canonical
 *     `fg` value (no legacy alias accepted in imported data).
 *   - WIP / intermediate naming: the legacy `PR-`/`process_code` wording is not a
 *     valid type; only the canonical item_type enum is accepted.
 *   - org_id is NEVER read from the CSV (the caller's session supplies it).
 *   - supplier_specs blocker: a row whose scope references a supplier but whose
 *     supplier column is set without a linked supplier_spec is a *warning*, not a
 *     hard error, surfaced for the reviewer (no auto-link).
 */

export type ImportScope = 'fg' | 'wip' | 'rm' | 'rm_supplier_specs';

export const IMPORT_SCOPES: ImportScope[] = ['fg', 'wip', 'rm', 'rm_supplier_specs'];

// Canonical item_type enum (mirrors items_item_type_check). `intermediate` is the
// canonical WIP type; there is no `fa` / `pr` type.
const ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct'] as const;
type ItemType = (typeof ITEM_TYPES)[number];

export const REQUIRED_HEADERS = ['item_code', 'name', 'item_type', 'uom_base'] as const;
export const OPTIONAL_HEADERS = [
  'status',
  'weight_mode',
  'description',
  'product_group',
  'uom_secondary',
  'cost_per_kg',
  'supplier',
] as const;

export type ParsedItemRow = {
  itemCode: string;
  name: string;
  itemType: string;
  uomBase: string;
  status?: string;
  weightMode?: string;
  description?: string;
  productGroup?: string;
  uomSecondary?: string;
  costPerKg?: string;
  supplier?: string;
};

export type RowIssue = { kind: 'error' | 'warning' | 'info'; column: string; message: string };

export type ImportDiffRow = {
  rowNumber: number;
  itemCode: string;
  op: 'create' | 'update' | 'noop' | 'error';
  field: string;
  before: string;
  after: string;
  parsed: ParsedItemRow;
  issues: RowIssue[];
};

export type ItemImportPreview = {
  scope: ImportScope;
  rowsInFile: number;
  counts: { create: number; update: number; noop: number; errors: number; warnings: number };
  rows: ImportDiffRow[];
  headerMismatch?: { expected: string[]; received: string[] };
};

export type ParseResult =
  | { ok: true; rows: ParsedItemRow[]; headers: string[] }
  | { ok: false; error: 'empty' | 'header_mismatch'; headerMismatch?: { expected: string[]; received: string[] } };

/** Minimal RFC-4180-ish CSV splitter (handles quoted fields + commas in quotes). */
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

export function parseItemsCsv(scope: ImportScope, csvText: string): ParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l, idx) => idx === 0 || l.trim().length > 0);
  if (lines.length === 0 || lines[0]!.trim().length === 0) return { ok: false, error: 'empty' };

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    return {
      ok: false,
      error: 'header_mismatch',
      headerMismatch: { expected: [...REQUIRED_HEADERS], received: headers },
    };
  }

  const idx = (name: string) => headers.indexOf(name);
  const rows: ParsedItemRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? (cells[j] ?? '').trim() : '';
    };
    rows.push({
      itemCode: get('item_code'),
      name: get('name'),
      itemType: get('item_type'),
      uomBase: get('uom_base'),
      status: get('status') || undefined,
      weightMode: get('weight_mode') || undefined,
      description: get('description') || undefined,
      productGroup: get('product_group') || undefined,
      uomSecondary: get('uom_secondary') || undefined,
      costPerKg: get('cost_per_kg') || undefined,
      supplier: get('supplier') || undefined,
    });
  }

  return { ok: true, rows, headers };
}

function validateRow(scope: ImportScope, row: ParsedItemRow): RowIssue[] {
  const issues: RowIssue[] = [];

  if (!row.itemCode) issues.push({ kind: 'error', column: 'item_code', message: 'item_code is required' });
  // Red-line: no FA-prefixed legacy codes.
  if (/^fa[-_]/i.test(row.itemCode)) {
    issues.push({
      kind: 'error',
      column: 'item_code',
      message: 'FA-prefixed codes are legacy; use the canonical FG code instead',
    });
  }
  if (!row.name) issues.push({ kind: 'error', column: 'name', message: 'name is required' });
  if (!row.uomBase) issues.push({ kind: 'error', column: 'uom_base', message: 'uom_base is required' });

  // Red-line: `fa` / `pr` are not valid types; only the canonical enum.
  const normalizedType = row.itemType.toLowerCase();
  if (normalizedType === 'fa') {
    issues.push({ kind: 'error', column: 'item_type', message: "item_type 'fa' is legacy; use 'fg'" });
  } else if (!ITEM_TYPES.includes(normalizedType as ItemType)) {
    issues.push({
      kind: 'error',
      column: 'item_type',
      message: `unknown item_type '${row.itemType}'; valid: ${ITEM_TYPES.join(', ')}`,
    });
  }

  if (row.costPerKg !== undefined && !/^\d+(\.\d+)?$/.test(row.costPerKg)) {
    issues.push({ kind: 'error', column: 'cost_per_kg', message: 'cost_per_kg must be a non-negative number' });
  }

  // supplier_specs blocker (warning): a supplier referenced under the supplier
  // scopes needs a supplier_spec uploaded before the row can be committed.
  if ((scope === 'rm_supplier_specs' || scope === 'rm') && row.supplier) {
    issues.push({
      kind: 'warning',
      column: 'supplier',
      message: `supplier ${row.supplier} requires a supplier_spec upload before catalog rows reference it`,
    });
  }

  return issues;
}

export function diffItemsAgainstExisting(
  scope: ImportScope,
  rows: ParsedItemRow[],
  existing: Map<string, { itemType: string; name: string }>,
): ItemImportPreview {
  const diffRows: ImportDiffRow[] = rows.map((row, i) => {
    const rowNumber = i + 2; // +1 for 0-based, +1 for the header line
    const issues = validateRow(scope, row);
    const errored = issues.some((x) => x.kind === 'error');
    if (errored) {
      return { rowNumber, itemCode: row.itemCode, op: 'error', field: '—', before: '—', after: '—', parsed: row, issues };
    }

    const prior = existing.get(row.itemCode);
    if (!prior) {
      return {
        rowNumber,
        itemCode: row.itemCode,
        op: 'create',
        field: '—',
        before: '—',
        after: row.name,
        parsed: row,
        issues,
      };
    }
    // Update if name or type changed; else no-op.
    if (prior.name !== row.name) {
      return {
        rowNumber,
        itemCode: row.itemCode,
        op: 'update',
        field: 'name',
        before: prior.name,
        after: row.name,
        parsed: row,
        issues,
      };
    }
    if (prior.itemType !== row.itemType.toLowerCase()) {
      return {
        rowNumber,
        itemCode: row.itemCode,
        op: 'update',
        field: 'item_type',
        before: prior.itemType,
        after: row.itemType.toLowerCase(),
        parsed: row,
        issues,
      };
    }
    return { rowNumber, itemCode: row.itemCode, op: 'noop', field: '—', before: row.name, after: row.name, parsed: row, issues };
  });

  const counts = {
    create: diffRows.filter((d) => d.op === 'create').length,
    update: diffRows.filter((d) => d.op === 'update').length,
    noop: diffRows.filter((d) => d.op === 'noop').length,
    errors: diffRows.filter((d) => d.op === 'error').length,
    warnings: diffRows.reduce((n, d) => n + d.issues.filter((x) => x.kind === 'warning').length, 0),
  };

  return { scope, rowsInFile: rows.length, counts, rows: diffRows };
}
