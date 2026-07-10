/**
 * @vitest-environment jsdom
 *
 * Wave E-IO (decision #6) — Bulk PO import wizard: RTL structure + interaction +
 * pure parse/template tests.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, 4-step wizard) — re-applied for the PO domain. This
 *   asserts the parity structure (4 steps: upload → validate → preview → result),
 *   the interaction (validate action drives the per-row status table + the
 *   "{ok} ok / {failed} errors" counter; the mode toggle switches the commit mode;
 *   commit calls commitPoImport with the chosen mode and lists the created PO
 *   numbers), and the client-side template/parse helpers.
 *
 * Tests use the design-system labels object directly (the i18n→labels mapping is
 * the page host's job and is covered by the i18n key-parity suite).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PoImportWizard, type PoImportLabels } from '../_components/po-import-wizard.client';
import { PoImportCard } from '../_components/po-import-card.client';
import {
  PO_IMPORT_COLUMNS,
  buildPoTemplateCsv,
  buildPoErrorReportCsv,
  groupPoRows,
  parsePoCsv,
} from '../_lib/parse-po-csv';
import type { PoValidationResult, PoImportResult } from '../../purchase-orders/_actions/import-po.types';

afterEach(cleanup);

const WIZARD_LABELS: PoImportLabels = {
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
  statusOk: 'OK',
  statusError: 'Error',
  noRowErrors: 'No issues',
  downloadErrorReport: 'Download error report',
  previewTitle: 'Preview',
  posToCreate: 'Purchase orders to create',
  colExternalRef: 'External reference',
  colSupplier: 'Supplier',
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
  createdHeading: 'Created purchase orders',
  skippedHeading: 'Skipped',
  noCreated: 'No purchase orders were created.',
  viewPo: 'Go to purchase orders',
  backCta: 'Back',
  parseFailed: 'Could not parse the CSV.',
  headerMismatch: 'The CSV header is missing required columns.',
  forbidden: 'You do not have permission.',
  commitFailed: 'The import could not be completed.',
  importAnother: 'Import another file',
};

const HEADER = PO_IMPORT_COLUMNS.join(',');
const GOOD_CSV = `${HEADER}\nPO-1,SUP-1,RM-1,100,kg,2.5,EUR,2026-12-31,WH,first\nPO-1,SUP-1,RM-2,50,kg,,,,,second\nPO-2,SUP-2,RM-3,bad,kg,,,,,third`;

const VALIDATION: PoValidationResult = {
  rows: [
    { rowNumber: 1, ok: true, errors: [] },
    { rowNumber: 2, ok: true, errors: [] },
    { rowNumber: 3, ok: false, errors: [{ column: 'qty', message: 'Quantity "bad" must be greater than 0.' }] },
  ],
  summary: { total: 3, ok: 2, failed: 1 },
};

const COMMIT_RESULT: PoImportResult = {
  created: [
    { po_number: 'PO-2026-0001', external_ref: 'PO-1' },
    { po_number: 'PO-2026-0002', external_ref: 'PO-2' },
  ],
  skipped: [{ external_ref: 'PO-3', reason: 'Purchase order already exists.' }],
  failed: [],
};

function uploadCsv(text: string) {
  const file = new File([text], 'po.csv', { type: 'text/csv' });
  // jsdom's File does not implement .text(); a real browser File does. Stub it.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByTestId('po-import-file'), { target: { files: [file] } });
}

describe('Wave E-IO PO import wizard (spec: spec-driven-screens.jsx:25-218)', () => {
  it('renders the 4-step stepper on the upload step (parity)', () => {
    render(<PoImportWizard locale="en" labels={WIZARD_LABELS} validateAction={vi.fn()} commitAction={vi.fn()} />);
    const stepper = screen.getByTestId('po-import-stepper');
    ['Upload', 'Validate', 'Preview', 'Result'].forEach((s) => expect(stepper).toHaveTextContent(s));
    expect(screen.getByTestId('po-import-file')).toBeInTheDocument();
  });

  it('parses the upload, calls validatePoImport, and shows per-row status + the {ok}/{failed} counter', async () => {
    const validateAction = vi.fn<typeof import('../../purchase-orders/_actions/import-po').validatePoImport>(
      async () => VALIDATION,
    );
    render(
      <PoImportWizard locale="en" labels={WIZARD_LABELS} validateAction={validateAction} commitAction={vi.fn()} />,
    );

    uploadCsv(GOOD_CSV);
    await waitFor(() => expect(screen.getByTestId('po-import-validate-cta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-import-validate-cta'));

    // validatePoImport called with the parsed rows (3 data rows).
    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1));
    const rowsArg = validateAction.mock.calls[0]![0];
    expect(rowsArg).toHaveLength(3);
    expect(rowsArg[0]).toMatchObject({ external_ref: 'PO-1', supplier_code: 'SUP-1', item_code: 'RM-1', qty: 100, uom: 'kg' });

    // Per-row status + the counter.
    await waitFor(() => expect(screen.getByTestId('po-import-counter')).toHaveTextContent('2 ok / 1 errors'));
    const rows = screen.getAllByTestId('po-import-row');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveAttribute('data-row-ok', 'false');
    expect(rows[2]).toHaveTextContent('qty');
    // The error report button enables only when there are failed rows.
    expect(screen.getByTestId('po-import-download-errors')).not.toBeDisabled();
  });

  it('previews the grouped PO count and lets the mode toggle switch the commit mode', async () => {
    const parsed = parsePoCsv(GOOD_CSV);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    render(
      <PoImportWizard
        locale="en"
        labels={WIZARD_LABELS}
        validateAction={vi.fn()}
        commitAction={vi.fn()}
        initialStep="preview"
        initialRows={parsed.rows}
        initialValidation={VALIDATION}
      />,
    );

    // 3 rows → 2 supplier+ref groups (PO-1/SUP-1 has 2 lines, PO-2/SUP-2 has 1).
    expect(screen.getAllByTestId('po-import-group-row')).toHaveLength(2);
    expect(screen.getByTestId('po-import-mode-help')).toHaveTextContent('If any row has an error, nothing is imported.');

    // Open the Select popover and pick "Skip invalid".
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Skip invalid' }));
    await waitFor(() =>
      expect(screen.getByTestId('po-import-mode-help')).toHaveTextContent(
        'Valid rows are imported; rows with errors are skipped.',
      ),
    );
  });

  it('commits with the chosen mode and lists the created PO numbers', async () => {
    const parsed = parsePoCsv(GOOD_CSV);
    if (!parsed.ok) return;
    const commitAction = vi.fn<typeof import('../../purchase-orders/_actions/import-po').commitPoImport>(
      async () => COMMIT_RESULT,
    );

    render(
      <PoImportWizard
        locale="en"
        labels={WIZARD_LABELS}
        validateAction={vi.fn()}
        commitAction={commitAction}
        initialStep="preview"
        initialRows={parsed.rows}
        initialValidation={VALIDATION}
      />,
    );

    // Switch to skip_invalid, then commit.
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Skip invalid' }));
    fireEvent.click(screen.getByTestId('po-import-commit-cta'));

    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(1));
    expect(commitAction.mock.calls[0]![1]).toEqual({ mode: 'skip_invalid' });

    // Result step lists the created PO numbers as links.
    await waitFor(() => expect(screen.getByTestId('po-import-result-kpis')).toBeInTheDocument());
    const links = screen.getAllByTestId('po-import-created-link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('PO-2026-0001');
    expect(links[1]).toHaveTextContent('PO-2026-0002');
    expect(screen.getByTestId('po-import-skipped-list')).toHaveTextContent('PO-3');
  });

  it('surfaces a header-mismatch error when the CSV columns are wrong (error state)', async () => {
    render(<PoImportWizard locale="en" labels={WIZARD_LABELS} validateAction={vi.fn()} commitAction={vi.fn()} />);
    uploadCsv('foo,bar\n1,2');
    await waitFor(() => expect(screen.getByTestId('po-import-error')).toHaveTextContent('header is missing'));
    // Validate stays disabled because parsing produced no rows.
    expect(screen.getByTestId('po-import-validate-cta')).toBeDisabled();
  });
});

describe('Wave E-IO PO import card', () => {
  it('downloads a template whose header matches the canonical columns', () => {
    const csv = buildPoTemplateCsv();
    const headerLine = csv.split('\r\n')[0];
    expect(headerLine).toBe(PO_IMPORT_COLUMNS.join(','));
    // exactly one example data row.
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('triggers a client-side download when [Download template] is clicked', () => {
    const created = vi.fn(() => 'blob:mock');
    const revoke = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = created as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(
        <PoImportCard
          locale="en"
          labels={{
            cardTitle: 'Purchase orders',
            cardDesc: 'desc',
            downloadTemplate: 'Download template',
            importFile: 'Import file',
            templateColumns: 'Columns: external_ref',
            wizard: WIZARD_LABELS,
          }}
          validateAction={vi.fn()}
          commitAction={vi.fn()}
        />,
      );
      // Wizard hidden until [Import file] toggles it.
      expect(screen.queryByTestId('po-import-stepper')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('po-import-download-template'));
      expect(created).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      // [Import file] reveals the wizard.
      fireEvent.click(screen.getByTestId('po-import-open-wizard'));
      expect(screen.getByTestId('po-import-stepper')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });
});

describe('Wave E-IO PO import pure helpers', () => {
  it('rejects a header that is missing required columns', () => {
    const res = parsePoCsv('external_ref,supplier_code\nPO-1,SUP-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('header_mismatch');
  });

  it('parses optional numeric/blank columns into the backend row shape', () => {
    const res = parsePoCsv(GOOD_CSV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(3);
    // price omitted when blank; provided when present.
    expect(res.rows[0]!.row.price).toBe(2.5);
    expect(res.rows[1]!.row).not.toHaveProperty('price');
    // bad qty coerces to NaN (not finite) so the backend reports the row error.
    expect(Number.isFinite(res.rows[2]!.row.qty)).toBe(false);
  });

  it('groups rows by supplier_code + external_ref', () => {
    const res = parsePoCsv(GOOD_CSV);
    if (!res.ok) return;
    const groups = groupPoRows(res.rows);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.externalRef === 'PO-1')!.lineCount).toBe(2);
  });

  it('builds an error report containing only failed rows + an error column', () => {
    const res = parsePoCsv(GOOD_CSV);
    if (!res.ok) return;
    const csv = buildPoErrorReportCsv(res.rows, VALIDATION.rows);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe([...PO_IMPORT_COLUMNS, 'error'].join(','));
    // one failed row (rowNumber 3).
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('PO-2');
    expect(lines[1]).toContain('qty');
  });
});
