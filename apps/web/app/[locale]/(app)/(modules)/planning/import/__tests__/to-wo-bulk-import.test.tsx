/**
 * @vitest-environment jsdom
 *
 * Wave E-IO — Bulk Transfer Order + Work Order import: RTL structure +
 * interaction + per-entity parse/template tests for the generalised wizard.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, 4-step wizard) — the same generic wizard the PO
 *   importer ships, re-applied for the TO + WO domains. Asserts the parity
 *   structure (4 steps), the interaction (validate drives the per-row status
 *   table + the "{ok} ok / {failed} errors" counter; commit calls the entity
 *   action with the chosen mode and lists the created document numbers), and the
 *   two WO-specific gates from lesson F-D08a: the UoM conversion shows in the
 *   validate step BEFORE commit, and a no-active-BOM row shows the failure
 *   reason clearly.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EntityImportWizard,
  type EntityImportWizardLabels,
  type EntityValidationResult,
} from '../_components/entity-import-wizard.client';
import {
  parseEntityCsv,
  buildEntityTemplateCsv,
  buildEntityErrorReportCsv,
  groupEntityRows,
} from '../_lib/parse-entity-csv';
import { TO_IMPORT_SPEC, TO_IMPORT_COLUMNS } from '../_lib/to-spec';
import { WO_IMPORT_SPEC, WO_IMPORT_COLUMNS } from '../_lib/wo-spec';
import type { ToImportRow, ToImportResult } from '../../transfer-orders/_actions/import-to.types';
import type { WoImportRow, WoImportResult } from '../../work-orders/_actions/import-wo';

afterEach(cleanup);

function makeLabels(over: Partial<EntityImportWizardLabels> = {}): EntityImportWizardLabels {
  return {
    stepUpload: 'Upload',
    stepValidate: 'Validate',
    stepPreview: 'Preview',
    stepResult: 'Result',
    uploadTitle: 'Upload CSV',
    fileLabel: 'CSV file',
    orgScopedNote: 'Imports are org-scoped.',
    selectedFile: 'Selected file',
    validateCta: 'Validate rows',
    validateTitle: 'Validate rows',
    counter: '{ok} ok / {failed} errors',
    rowsInFile: 'Rows in file',
    okKpi: 'OK',
    errorsKpi: 'Errors',
    colRow: 'Row',
    colStatus: 'Status',
    colColumn: 'Column',
    colIssue: 'Issue',
    colConversion: 'Quantity conversion',
    statusOk: 'OK',
    statusError: 'Error',
    noRowErrors: 'No issues',
    downloadErrorReport: 'Download error report',
    previewTitle: 'Preview',
    docsToCreate: 'Documents to create',
    colLines: 'Lines',
    modeLabel: 'Import mode',
    modeAllOrNothing: 'All-or-nothing',
    modeSkipInvalid: 'Skip invalid',
    modeHelpAllOrNothing: 'If any row has an error, nothing is imported.',
    modeHelpSkipInvalid: 'Valid rows are imported; rows with errors are skipped.',
    commitCta: 'Commit import',
    resultTitle: 'Import result',
    createdKpi: 'Created',
    skippedKpi: 'Skipped',
    failedKpi: 'Failed',
    createdHeading: 'Created documents',
    skippedHeading: 'Skipped',
    noCreated: 'No documents were created.',
    viewList: 'Go to list',
    backCta: 'Back',
    parseFailed: 'Could not parse the CSV.',
    headerMismatch: 'The CSV header is missing required columns.',
    forbidden: 'You do not have permission.',
    commitFailed: 'The import could not be completed.',
    importAnother: 'Import another file',
    ...over,
  };
}

function uploadCsv(testid: string, text: string) {
  const file = new File([text], `${testid}.csv`, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByTestId(`${testid}-import-file`), { target: { files: [file] } });
}

// --- Transfer Order ----------------------------------------------------------

const TO_HEADER = TO_IMPORT_COLUMNS.join(',');
const TO_CSV = `${TO_HEADER}\nTO-1,WH-A,WH-B,RM-1,100,kg,2026-12-31\nTO-1,WH-A,WH-B,RM-2,50,kg,\nTO-2,WH-A,WH-C,RM-3,bad,kg,`;

const TO_VALIDATION: EntityValidationResult = {
  rows: [
    { rowNumber: 1, ok: true, errors: [] },
    { rowNumber: 2, ok: true, errors: [] },
    { rowNumber: 3, ok: false, errors: [{ column: 'qty', message: 'Quantity "bad" must be greater than 0.' }] },
  ],
  summary: { total: 3, ok: 2, failed: 1 },
};

const TO_COMMIT: ToImportResult = {
  created: [
    { to_number: 'TO-2026-0001', external_ref: 'TO-1' },
    { to_number: 'TO-2026-0002', external_ref: 'TO-2' },
  ],
  skipped: [{ external_ref: 'TO-3', reason: 'Transfer order already exists.' }],
  failed: [],
};

const TO_PREVIEW_COLUMNS = [
  { key: 'external_ref', label: 'External reference', value: (r: ToImportRow) => r.external_ref ?? '', mono: true },
  { key: 'from', label: 'From', value: (r: ToImportRow) => r.from_warehouse_code ?? '', mono: true },
  { key: 'to', label: 'To', value: (r: ToImportRow) => r.to_warehouse_code ?? '', mono: true },
];

function renderTo(over: { initialStep?: 'preview'; rows?: ReturnType<typeof parseEntityCsv<ToImportRow>>; validateAction?: ReturnType<typeof vi.fn>; commitAction?: ReturnType<typeof vi.fn> } = {}) {
  const parsed = over.rows ?? parseEntityCsv(TO_CSV, TO_IMPORT_SPEC);
  const initial = over.initialStep === 'preview' && parsed.ok ? { initialStep: 'preview' as const, initialRows: parsed.rows, initialValidation: TO_VALIDATION } : {};
  render(
    <EntityImportWizard<ToImportRow, ToImportResult['created'][number]>
      locale="en"
      testid="to"
      labels={makeLabels({ docsToCreate: 'Transfer orders to create', viewList: 'Go to transfer orders' })}
      spec={TO_IMPORT_SPEC}
      showConversion={false}
      previewColumns={TO_PREVIEW_COLUMNS}
      createdNumberField="to_number"
      listPath="/planning/transfer-orders"
      errorReportFilename="to-import-errors.csv"
      validateAction={over.validateAction ?? vi.fn(async () => TO_VALIDATION)}
      commitAction={over.commitAction ?? vi.fn(async () => TO_COMMIT)}
      {...initial}
    />,
  );
}

describe('Wave E-IO TO import wizard (spec: spec-driven-screens.jsx:25-218)', () => {
  it('renders the 4-step stepper on the upload step (parity)', () => {
    renderTo();
    const stepper = screen.getByTestId('to-import-stepper');
    ['Upload', 'Validate', 'Preview', 'Result'].forEach((s) => expect(stepper).toHaveTextContent(s));
    expect(screen.getByTestId('to-import-file')).toBeInTheDocument();
  });

  it('upload → validate → commit calls the TO actions with the chosen mode and lists created TO numbers', async () => {
    const validateAction = vi.fn(async () => TO_VALIDATION);
    const commitAction = vi.fn(async () => TO_COMMIT);
    renderTo({ validateAction, commitAction });

    uploadCsv('to', TO_CSV);
    await waitFor(() => expect(screen.getByTestId('to-import-validate-cta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-import-validate-cta'));

    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1));
    const rowsArg = validateAction.mock.calls[0]![0] as ToImportRow[];
    expect(rowsArg).toHaveLength(3);
    expect(rowsArg[0]).toMatchObject({
      external_ref: 'TO-1',
      from_warehouse_code: 'WH-A',
      to_warehouse_code: 'WH-B',
      item_code: 'RM-1',
      qty: 100,
      uom: 'kg',
    });

    await waitFor(() => expect(screen.getByTestId('to-import-counter')).toHaveTextContent('2 ok / 1 errors'));
    expect(screen.getAllByTestId('to-import-row')).toHaveLength(3);
    // No UoM-conversion column for the TO importer.
    expect(screen.queryByTestId('to-import-conversion')).not.toBeInTheDocument();

    // Advance to preview: 3 rows → 2 (from+to+ref) groups.
    fireEvent.click(screen.getByTestId('to-import-preview-cta'));
    expect(screen.getAllByTestId('to-import-group-row')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('to-import-commit-cta'));
    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(1));
    expect(commitAction.mock.calls[0]![1]).toEqual({ mode: 'all_or_nothing' });

    await waitFor(() => expect(screen.getByTestId('to-import-result-kpis')).toBeInTheDocument());
    const links = screen.getAllByTestId('to-import-created-link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('TO-2026-0001');
    expect(screen.getByTestId('to-import-skipped-list')).toHaveTextContent('TO-3');
  });

  it('groups by from+to+external_ref and downloads a template with the TO header', () => {
    const parsed = parseEntityCsv(TO_CSV, TO_IMPORT_SPEC);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(groupEntityRows(parsed.rows, TO_IMPORT_SPEC)).toHaveLength(2);
    const csv = buildEntityTemplateCsv(TO_IMPORT_SPEC);
    expect(csv.split('\r\n')[0]).toBe(TO_IMPORT_COLUMNS.join(','));
    expect(csv.split('\r\n')).toHaveLength(2);
    // Per-entity error report.
    const report = buildEntityErrorReportCsv(parsed.rows, TO_VALIDATION.rows, TO_IMPORT_SPEC);
    const lines = report.split('\r\n');
    expect(lines[0]).toBe([...TO_IMPORT_COLUMNS, 'error'].join(','));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('TO-2');
    expect(lines[1]).toContain('qty');
  });
});

// --- Work Order --------------------------------------------------------------

const WO_HEADER = WO_IMPORT_COLUMNS.join(',');
const WO_CSV = `${WO_HEADER}\nWO-1,FG-1,100,each,2026-12-31,LINE-1,normal\nWO-2,FG-2,10,each,,,`;

// FG-1 valid (with UoM conversion 100 each -> 50 kg); FG-2 has no active BOM.
const WO_VALIDATION: EntityValidationResult = {
  rows: [
    { rowNumber: 1, ok: true, errors: [], convertedQty: { display: '100 each -> 50 kg' } },
    { rowNumber: 2, ok: false, errors: [{ column: 'fg_code', message: 'no active BOM' }] },
  ],
  summary: { total: 2, ok: 1, failed: 1 },
};

const WO_COMMIT: WoImportResult = {
  created: [{ wo_number: 'WO-2026-0001', external_ref: 'WO-1' }],
  skipped: [],
  failed: [{ rowNumber: 2, errors: [{ column: 'fg_code', message: 'no active BOM' }] }],
};

const WO_PREVIEW_COLUMNS = [
  { key: 'external_ref', label: 'External reference', value: (r: WoImportRow) => r.external_ref ?? '', mono: true },
  { key: 'fg', label: 'Finished good', value: (r: WoImportRow) => r.fg_code ?? '', mono: true },
  { key: 'qty', label: 'Quantity', value: (r: WoImportRow) => `${r.qty} ${r.uom ?? ''}`.trim() },
];

function renderWo(over: { validateAction?: ReturnType<typeof vi.fn>; commitAction?: ReturnType<typeof vi.fn> } = {}) {
  render(
    <EntityImportWizard<WoImportRow, WoImportResult['created'][number]>
      locale="en"
      testid="wo"
      labels={makeLabels({ docsToCreate: 'Work orders to create', viewList: 'Go to work orders' })}
      spec={WO_IMPORT_SPEC}
      showConversion
      previewColumns={WO_PREVIEW_COLUMNS}
      createdNumberField="wo_number"
      listPath="/planning/work-orders"
      errorReportFilename="wo-import-errors.csv"
      validateAction={over.validateAction ?? vi.fn(async () => WO_VALIDATION)}
      commitAction={over.commitAction ?? vi.fn(async () => WO_COMMIT)}
    />,
  );
}

describe('Wave E-IO WO import wizard (lesson F-D08a)', () => {
  it('renders the 4-step stepper on the upload step (parity)', () => {
    renderWo();
    const stepper = screen.getByTestId('wo-import-stepper');
    ['Upload', 'Validate', 'Preview', 'Result'].forEach((s) => expect(stepper).toHaveTextContent(s));
  });

  it('validate shows the UoM conversion BEFORE commit and the no-active-BOM failure reason', async () => {
    const validateAction = vi.fn(async () => WO_VALIDATION);
    renderWo({ validateAction });

    uploadCsv('wo', WO_CSV);
    await waitFor(() => expect(screen.getByTestId('wo-import-validate-cta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-import-validate-cta'));

    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1));
    const rowsArg = validateAction.mock.calls[0]![0] as WoImportRow[];
    expect(rowsArg).toHaveLength(2);
    expect(rowsArg[0]).toMatchObject({ external_ref: 'WO-1', fg_code: 'FG-1', qty: 100, uom: 'each', line_code: 'LINE-1', priority: 'normal' });

    await waitFor(() => expect(screen.getByTestId('wo-import-counter')).toHaveTextContent('1 ok / 1 errors'));

    // UoM conversion column rendered with the backend display string (still on the validate step, pre-commit).
    const conversions = screen.getAllByTestId('wo-import-conversion');
    expect(conversions[0]).toHaveTextContent('100 each -> 50 kg');

    // The no-active-BOM row shows the reason clearly.
    const rows = screen.getAllByTestId('wo-import-row');
    expect(rows[1]).toHaveAttribute('data-row-ok', 'false');
    expect(rows[1]).toHaveTextContent('no active BOM');
  });

  it('commits and lists the created WO number; failed no-BOM row counts in the failed KPI', async () => {
    const parsed = parseEntityCsv(WO_CSV, WO_IMPORT_SPEC);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const commitAction = vi.fn(async () => WO_COMMIT);
    render(
      <EntityImportWizard<WoImportRow, WoImportResult['created'][number]>
        locale="en"
        testid="wo"
        labels={makeLabels({ docsToCreate: 'Work orders to create', viewList: 'Go to work orders' })}
        spec={WO_IMPORT_SPEC}
        showConversion
        previewColumns={WO_PREVIEW_COLUMNS}
        createdNumberField="wo_number"
        listPath="/planning/work-orders"
        errorReportFilename="wo-import-errors.csv"
        validateAction={vi.fn()}
        commitAction={commitAction}
        initialStep="preview"
        initialRows={parsed.rows}
        initialValidation={WO_VALIDATION}
      />,
    );

    // 2 rows, 2 distinct external_refs → 2 work orders to create.
    expect(screen.getAllByTestId('wo-import-group-row')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('wo-import-commit-cta'));
    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByTestId('wo-import-result-kpis')).toBeInTheDocument());
    const links = screen.getAllByTestId('wo-import-created-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('WO-2026-0001');
    expect(screen.getByTestId('wo-import-result-kpis')).toHaveTextContent('1'); // failed KPI shows the no-BOM row
  });
});
