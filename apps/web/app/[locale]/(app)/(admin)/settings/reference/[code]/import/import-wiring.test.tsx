/**
 * @vitest-environment jsdom
 * T-096 / SET-053 — Reference CSV Import Wizard LIVE-WIRING contract.
 *
 * Audit finding (verified): the 3-step wizard was a static Server Component;
 * `apps/web/actions/reference/import-csv.ts` was NEVER imported/called, the
 * "Commit Import" button had no Server-Action binding, and the file <input>
 * had no submit handler — the commit pipeline was DEAD.
 *
 * These tests prove the dead pipeline is now alive:
 *   1. The thin `_actions` wrappers call the REAL withOrgContext-wired backend
 *      action (`previewReferenceCsvImport` / `commitReferenceCsvImport`, T-022)
 *      and map its result to the wizard shape.
 *   2. The interactive wizard's file <input> onChange invokes the preview
 *      action with the CSV text and advances to the Preview step on success.
 *   3. The "Commit Import" button invokes the commit action with the persisted
 *      reportId and advances to the Commit step showing the action's real counts.
 *   4. Fail-closed: header-mismatch keeps Commit disabled; a forbidden preview
 *      surfaces a permission-denied alert (RBAC enforced server-side).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the REAL backend action module at the boundary. We assert the thin
// wrappers call THESE functions — proving the pipeline is no longer dead —
// without needing a live Postgres (withOrgContext is DB-bound).
// ---------------------------------------------------------------------------
const previewReferenceCsvImport = vi.fn();
const commitReferenceCsvImport = vi.fn();

vi.mock('../../../../../../../../actions/reference/import-csv', () => ({
  previewReferenceCsvImport: (...args: unknown[]) => previewReferenceCsvImport(...args),
  commitReferenceCsvImport: (...args: unknown[]) => commitReferenceCsvImport(...args),
}));

import { previewImportAction } from './_actions/previewImport';
import { commitImportAction } from './_actions/commitImport';
import { ImportWizard, type ImportWizardProps } from './import-wizard.client';

const table: ImportWizardProps['table'] = {
  code: 'allergens_reference',
  name: 'Allergens reference',
  columns: [
    { code: 'allergen_code', label: 'Allergen code', required: true },
    { code: 'display_name', label: 'Display name', required: true },
    { code: 'risk_level', label: 'Risk level' },
    { code: 'is_enabled', label: 'Enabled' },
  ],
  parentHref: '/en/settings/reference/allergens_reference',
};

const expectedHeaders = ['row_key', 'allergen_code', 'display_name', 'risk_level', 'is_enabled'];

const labels: ImportWizardProps['labels'] = {
  title: 'CSV Import Wizard',
  subtitle: 'Guided 3-step CSV import.',
  dropzone: 'Drop your CSV file here or click to browse.',
  downloadTemplate: 'Download Template CSV',
  previewCta: 'Preview CSV',
  accepted: 'Accepted: .csv only · Max 5MB',
  headerGuidance: 'First row must contain column headers matching:',
  stepUpload: 'Step 1 — Upload',
  stepPreview: 'Step 2 — Preview',
  stepCommit: 'Step 3 — Commit',
  stepperUpload: 'Upload',
  stepperPreview: 'Preview',
  stepperCommit: 'Commit',
  uploading: 'Validating CSV…',
  committing: 'Committing…',
  commitImport: 'Commit Import',
  cancel: 'Cancel',
  showErrorsOnly: 'Show errors only',
  showAll: 'Show all',
  returnToTable: 'Return to Table',
  downloadErrorRows: 'Download error rows',
  importComplete: 'Import complete.',
  importPending: 'Import is ready to process after preview validation.',
  commitSummary: 'Commit summary',
  headerMismatchPrefix: 'Header mismatch — expected: ',
  emptyRows: 'No preview rows yet. Upload a CSV to validate headers and rows.',
  errorForbidden: 'You do not have permission to import reference data.',
  errorGeneric: 'The CSV could not be processed. Check the file and try again.',
  colRow: 'Row',
  colAction: 'Action',
  colValidation: 'Validation',
  insertLabel: 'insert',
  updateLabel: 'update',
  skipLabel: 'skip',
  errorsLabel: 'errors',
  parsedSummary: 'Parsed',
  completeSummary: 'Import complete.',
  safeguards: 'Safeguards copy.',
  breadcrumb: 'Settings / Reference tables /',
};

const CSV_TEXT = 'row_key,allergen_code,display_name,risk_level,is_enabled\nSESAME,SESAME,Sesame,major,true\n';

function makeFile(text: string) {
  const file = new File([text], 'allergens.csv', { type: 'text/csv' });
  // jsdom does not implement File.prototype.text(); polyfill for the test.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

function renderWizard(overrides: Partial<ImportWizardProps> = {}) {
  return render(
    React.createElement(ImportWizard, {
      table,
      labels,
      expectedHeaders,
      previewAction: previewImportAction,
      commitAction: commitImportAction,
      ...overrides,
    } as ImportWizardProps),
  );
}

function fireFileUpload(text: string) {
  const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
  const file = makeFile(text);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('SET-053 reference CSV import wizard — LIVE action wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('thin preview wrapper calls the REAL previewReferenceCsvImport with { tableCode, csvText } and maps the persisted report', async () => {
    previewReferenceCsvImport.mockResolvedValue({
      ok: true,
      data: {
        reportId: 'rep-123',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        summary: { inserted: 3, updated: 1, skipped: 2, errors: 1 },
        conflicts: [{ rowKey: 'MILK', action: 'update', currentVersion: 4 }],
        errors: [{ rowKey: 'BAD', message: 'allergen_code is required' }],
      },
    });

    const result = await previewImportAction('allergens_reference', expectedHeaders, CSV_TEXT);

    expect(previewReferenceCsvImport).toHaveBeenCalledWith({ tableCode: 'allergens_reference', csvText: CSV_TEXT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.reportId).toBe('rep-123');
      expect(result.preview.insertCount).toBe(3);
      expect(result.preview.parsedRows).toBe(7);
      expect(result.preview.rows.some((r) => r.action === 'error' && r.message === 'allergen_code is required')).toBe(true);
      expect(result.preview.rows.some((r) => r.action === 'update' && r.values.row_key === 'MILK')).toBe(true);
    }
  });

  it('thin commit wrapper calls the REAL commitReferenceCsvImport with { reportId } and maps the summary', async () => {
    commitReferenceCsvImport.mockResolvedValue({ ok: true, data: { summary: { inserted: 4, updated: 2, skipped: 1, errors: 0 } } });

    const result = await commitImportAction('rep-123');

    expect(commitReferenceCsvImport).toHaveBeenCalledWith({ reportId: 'rep-123' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commit).toEqual({ status: 'complete', inserted: 4, updated: 2, skipped: 1, errors: 0 });
    }
  });

  it('header mismatch from the real action maps to header_mismatch and the wizard keeps Commit disabled', async () => {
    previewReferenceCsvImport.mockResolvedValue({
      ok: false,
      error: 'CSV_HEADER_MISMATCH',
      details: { missingColumns: ['risk_level'], unknownColumns: ['risk'] },
    });

    renderWizard();
    fireFileUpload(CSV_TEXT);

    await waitFor(() => {
      expect(previewReferenceCsvImport).toHaveBeenCalledWith({ tableCode: 'allergens_reference', csvText: CSV_TEXT });
    });
    const previewStep = await screen.findByRole('region', { name: /step 2.*preview/i });
    expect(within(previewStep).getByRole('alert')).toHaveTextContent(/Header mismatch — expected:/i);
    expect(within(previewStep).getByRole('button', { name: /commit import/i })).toBeDisabled();
  });

  it('the file <input> drives a REAL preview call and the Commit button drives a REAL commit call (no dead controls)', async () => {
    previewReferenceCsvImport.mockResolvedValue({
      ok: true,
      data: {
        reportId: 'rep-777',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        summary: { inserted: 2, updated: 1, skipped: 0, errors: 0 },
        conflicts: [{ rowKey: 'MILK', action: 'update', currentVersion: 1 }],
        errors: [],
      },
    });
    commitReferenceCsvImport.mockResolvedValue({ ok: true, data: { summary: { inserted: 2, updated: 1, skipped: 0, errors: 0 } } });

    renderWizard();

    // 1. Upload → REAL preview action invoked, advance to Preview.
    fireFileUpload(CSV_TEXT);
    await waitFor(() => expect(previewReferenceCsvImport).toHaveBeenCalledTimes(1));
    const previewStep = await screen.findByRole('region', { name: /step 2.*preview/i });

    // 2. Commit button is enabled (real reportId present) and fires the REAL commit.
    const commitBtn = within(previewStep).getByRole('button', { name: /commit import/i });
    expect(commitBtn).not.toBeDisabled();
    commitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(commitReferenceCsvImport).toHaveBeenCalledWith({ reportId: 'rep-777' }));

    // 3. Commit step shows the action's REAL persisted counts.
    const commitStep = await screen.findByRole('region', { name: /step 3.*commit/i });
    expect(within(commitStep).getByRole('progressbar', { name: /import progress/i })).toHaveAttribute('aria-valuenow', '100');
    expect(within(commitStep).getByText(/import complete/i)).toHaveTextContent('Import complete. 2 inserted, 1 updated, 0 skipped, 0 errors.');
    expect(within(commitStep).getByRole('link', { name: /return to table/i })).toHaveAttribute('href', '/en/settings/reference/allergens_reference');
  });

  it('permission-denied: a forbidden preview from the RBAC server gate surfaces a permission alert and does not advance', async () => {
    previewReferenceCsvImport.mockResolvedValue({ ok: false, error: 'forbidden' });

    renderWizard();
    fireFileUpload(CSV_TEXT);

    await waitFor(() => expect(previewReferenceCsvImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to import reference data/i);
    // Still on the upload step — fail closed.
    expect(screen.getByRole('region', { name: /step 1.*upload/i })).toBeInTheDocument();
  });
});
