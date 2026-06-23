/**
 * Wave E-IO — Bulk Work Order import: the entity spec consumed by the generic
 * CSV helpers (parse-entity-csv.ts) and the generic wizard.
 *
 * Mirrors the canonical WO import backend
 *   ../../work-orders/_actions/import-wo.ts
 *     - WoImportRow             → the row the backend validate/commit accept
 *     - validateWoImport(rows)  → per-row ok/errors + summary + convertedQty
 *     - commitWoImport(rows,{mode}) → created / skipped / failed
 *
 * The backend creates one work order per row (keyed by external_ref), so groupKey
 * is the external_ref and the preview "{n} work orders to create" count equals
 * the distinct-external_ref count. The validation step additionally surfaces the
 * UoM conversion the backend returns (e.g. "100 pcs -> 50 kg") BEFORE commit so
 * the planner sees what base quantity will be created (lesson F-D08a), and a row
 * whose FG has no active BOM shows that failure reason clearly.
 */

import type { WoImportRow } from '../../work-orders/_actions/import-wo';
import { type EntityCsvSpec } from './parse-entity-csv';

export const WO_IMPORT_COLUMNS = [
  'external_ref',
  'fg_code',
  'qty',
  'uom',
  'planned_date',
  'line_code',
  'priority',
] as const;

export type WoImportColumn = (typeof WO_IMPORT_COLUMNS)[number];

const WO_IMPORT_EXAMPLE_ROW: Record<WoImportColumn, string> = {
  external_ref: 'WO-IMPORT-0001',
  fg_code: 'FG-1001',
  qty: '100',
  uom: 'each',
  planned_date: '2026-12-31',
  line_code: 'LINE-1',
  priority: 'normal',
};

export const WO_IMPORT_SPEC: EntityCsvSpec<WoImportRow> = {
  columns: WO_IMPORT_COLUMNS,
  required: ['external_ref', 'fg_code', 'qty', 'uom'],
  exampleRow: WO_IMPORT_EXAMPLE_ROW,
  coerce: (cell) => {
    const plannedDate = cell('planned_date');
    const lineCode = cell('line_code');
    const priority = cell('priority');
    return {
      external_ref: cell('external_ref'),
      fg_code: cell('fg_code'),
      qty: Number(cell('qty')),
      uom: cell('uom'),
      ...(plannedDate ? { planned_date: plannedDate } : {}),
      ...(lineCode ? { line_code: lineCode } : {}),
      ...(priority ? { priority } : {}),
    };
  },
  cells: (row) => [
    row.external_ref ?? '',
    row.fg_code ?? '',
    Number.isFinite(row.qty) ? String(row.qty) : '',
    row.uom ?? '',
    row.planned_date ?? '',
    row.line_code ?? '',
    row.priority ?? '',
  ],
  groupKey: (row) => (row.external_ref ?? '').trim(),
};
