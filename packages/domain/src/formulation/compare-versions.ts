/**
 * T-065 — Formulation version diff (pure function).
 *
 * `compareFormulationVersions` produces a side-by-side, row-aligned diff of two
 * formulation versions' ingredient lists (PRD §17.11.1 "compareVersions … diff
 * up to 50 rows × 2 versions" + prototype Compare modal). Pure & deterministic
 * — no I/O, no mutation. The Server Action (`_actions/compare-versions.ts`)
 * loads the two versions' ingredients via `withOrgContext` and hands them here.
 *
 * ROW IDENTITY = `sequence`, NOT `rm_code`.
 * The schema only makes `(version_id, sequence)` unique — `rm_code` may repeat
 * within a version (e.g. the same RM added twice at different inclusion levels,
 * or a water split). Matching on `rm_code` would collapse those duplicate rows
 * ("first wins") and silently produce a wrong diff. We therefore align rows by
 * their stable `sequence` slot, which is the real per-version row identity.
 *
 * Each output row carries the sequence, the (shared/representative) rmCode, the
 * A-side and B-side cells (null when absent on a side) and a per-row status:
 *   - ADDED     : sequence present in B, absent in A
 *   - REMOVED   : sequence present in A, absent in B
 *   - CHANGED   : present in both, but rmCode / pct / qty / cost differ
 *   - UNCHANGED : present in both and identical
 *
 * Rows are emitted in ascending `sequence` order so the diff is byte-stable.
 * The result is capped at `maxRows` (50) per side.
 */

export type DiffStatus = 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';

/**
 * The comparable subset of a formulation ingredient row.
 * NUMERIC fields are STRING-ONLY (never a JS `number`) so money stays exact.
 */
export interface CompareIngredient {
  /** Stable per-version row identity (`formulation_ingredients.sequence`). */
  sequence: number;
  rmCode: string;
  pct: string | null | undefined;
  qtyKg?: string | null | undefined;
  costPerKgEur?: string | null | undefined;
}

export interface CompareCell {
  rmCode: string;
  pct: string | null;
  qtyKg: string | null;
  costPerKgEur: string | null;
}

export interface CompareRow {
  /** The row's stable identity within each version. */
  sequence: number;
  /** RM code for display (B-side wins when both present, else whichever exists). */
  rmCode: string;
  status: DiffStatus;
  a: CompareCell | null;
  b: CompareCell | null;
  /** Per-field change flags (only meaningful for CHANGED rows). */
  changed: { rmCode: boolean; pct: boolean; qtyKg: boolean; costPerKgEur: boolean };
}

export interface CompareResult {
  rows: CompareRow[];
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** True when either side exceeded `maxRows` and the diff was truncated. */
  truncated: boolean;
}

/** Default cap from the PRD: up to 50 ingredient rows × 2 versions. */
export const MAX_COMPARE_ROWS = 50;

export function compareFormulationVersions(
  versionA: CompareIngredient[],
  versionB: CompareIngredient[],
  maxRows: number = MAX_COMPARE_ROWS,
): CompareResult {
  const truncated = versionA.length > maxRows || versionB.length > maxRows;

  const aBySeq = indexBySequence(versionA.slice(0, maxRows));
  const bBySeq = indexBySequence(versionB.slice(0, maxRows));

  const allSeq = [...new Set([...aBySeq.keys(), ...bBySeq.keys()])].sort((x, y) => x - y);

  const rows: CompareRow[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  for (const sequence of allSeq) {
    const aRaw = aBySeq.get(sequence);
    const bRaw = bBySeq.get(sequence);
    const a = aRaw ? toCell(aRaw) : null;
    const b = bRaw ? toCell(bRaw) : null;
    const rmCode = b?.rmCode ?? a?.rmCode ?? '';

    if (a && !b) {
      removed += 1;
      rows.push({ sequence, rmCode, status: 'REMOVED', a, b: null, changed: noChange() });
      continue;
    }
    if (!a && b) {
      added += 1;
      rows.push({ sequence, rmCode, status: 'ADDED', a: null, b, changed: noChange() });
      continue;
    }
    // Both present — compare cells (including rmCode: the same slot may have
    // been re-pointed to a different raw material between versions).
    const aCell = a as CompareCell;
    const bCell = b as CompareCell;
    const cellChanged = {
      rmCode: aCell.rmCode !== bCell.rmCode,
      pct: aCell.pct !== bCell.pct,
      qtyKg: aCell.qtyKg !== bCell.qtyKg,
      costPerKgEur: aCell.costPerKgEur !== bCell.costPerKgEur,
    };
    const isChanged =
      cellChanged.rmCode || cellChanged.pct || cellChanged.qtyKg || cellChanged.costPerKgEur;
    if (isChanged) {
      changed += 1;
      rows.push({ sequence, rmCode, status: 'CHANGED', a, b, changed: cellChanged });
    } else {
      unchanged += 1;
      rows.push({ sequence, rmCode, status: 'UNCHANGED', a, b, changed: noChange() });
    }
  }

  return { rows, added, removed, changed, unchanged, truncated };
}

function indexBySequence(rows: CompareIngredient[]): Map<number, CompareIngredient> {
  const map = new Map<number, CompareIngredient>();
  for (const row of rows) {
    if (map.has(row.sequence)) {
      // `(version_id, sequence)` is UNIQUE in the schema — a duplicate here means
      // the caller passed malformed rows. Fail loud rather than silently drop.
      throw new Error(
        `compareFormulationVersions: duplicate sequence ${row.sequence} within a version`,
      );
    }
    map.set(row.sequence, row);
  }
  return map;
}

function toCell(row: CompareIngredient): CompareCell {
  return {
    rmCode: row.rmCode,
    pct: normalize(row.pct),
    qtyKg: normalize(row.qtyKg),
    costPerKgEur: normalize(row.costPerKgEur),
  };
}

/** Normalise a NUMERIC string to a string (or null). Strings are compared
 *  verbatim so we keep money exact and never float-cast for comparison. */
function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return value;
}

function noChange(): CompareRow['changed'] {
  return { rmCode: false, pct: false, qtyKg: false, costPerKgEur: false };
}
