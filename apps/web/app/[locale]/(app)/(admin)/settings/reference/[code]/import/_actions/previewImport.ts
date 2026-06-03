'use server';

/**
 * T-096 / SET-053 — thin Server Action wrapper for the Reference CSV Import
 * Wizard "Preview" step.
 *
 * Exists ONLY to adapt the real, withOrgContext-wired backend action
 * `previewReferenceCsvImport` (T-022, apps/web/actions/reference/import-csv.ts)
 * to the shape the wizard UI consumes (WizardImportPreview). It authors NO data
 * logic: RBAC, schema-header validation, conflict detection and report
 * persistence all live in the real action under `app.current_org_id()` RLS. We
 * import — never re-implement — per MON-t3-ui (a T3 screen consumes Server
 * Actions, it does not author them).
 */

import {
  previewReferenceCsvImport,
  type PreviewReferenceCsvImportResult,
} from '../../../../../../../../../actions/reference/import-csv';

export type WizardPreviewRow = {
  rowNumber: number;
  action: 'insert' | 'update' | 'skip' | 'error';
  values: Record<string, string>;
  message?: string;
};

export type WizardImportPreview = {
  reportId: string;
  expiresAt: string;
  parsedRows: number;
  insertCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: WizardPreviewRow[];
  headerMismatch?: { expected: string[]; received: string[] };
};

export type PreviewImportResult =
  | { ok: true; preview: WizardImportPreview }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'header_mismatch' | 'persistence_failed';
      headerMismatch?: { expected: string[]; received: string[] };
    };

/**
 * The real action returns a compact summary + conflict/error report keyed by
 * rowKey. The wizard preview table is built from those persisted collections so
 * every count and row shown to the admin reflects the real preview report
 * (whose reportId is required for the commit step). No mock rows are synthesised.
 */
function adaptPreview(result: Extract<PreviewReferenceCsvImportResult, { ok: true }>): WizardImportPreview {
  const { reportId, expiresAt, summary, conflicts, errors } = result.data;

  const rows: WizardPreviewRow[] = [];
  let rowNumber = 2; // row 1 is the header row

  for (const conflict of conflicts) {
    const rowKey = String(conflict.rowKey ?? conflict.row_key ?? '');
    rows.push({ rowNumber: rowNumber++, action: 'update', values: { row_key: rowKey } });
  }

  for (const err of errors) {
    rows.push({ rowNumber: rowNumber++, action: 'error', values: { row_key: err.rowKey }, message: err.message });
  }

  return {
    reportId,
    expiresAt,
    parsedRows: summary.inserted + summary.updated + summary.skipped + summary.errors,
    insertCount: summary.inserted,
    updateCount: summary.updated,
    skipCount: summary.skipped,
    errorCount: summary.errors,
    rows,
  };
}

export async function previewImportAction(
  tableCode: string,
  expectedHeaders: string[],
  csvText: string,
): Promise<PreviewImportResult> {
  const result = await previewReferenceCsvImport({ tableCode, csvText });

  if (result.ok) {
    return { ok: true, preview: adaptPreview(result) };
  }

  if (result.error === 'CSV_HEADER_MISMATCH') {
    const missing = result.details?.missingColumns ?? [];
    const unknown = result.details?.unknownColumns ?? [];
    const received = [...expectedHeaders.filter((h) => !missing.includes(h)), ...unknown];
    return { ok: false, error: 'header_mismatch', headerMismatch: { expected: expectedHeaders, received } };
  }

  if (result.error === 'forbidden') return { ok: false, error: 'forbidden' };
  if (result.error === 'invalid_input') return { ok: false, error: 'invalid_input' };
  return { ok: false, error: 'persistence_failed' };
}
