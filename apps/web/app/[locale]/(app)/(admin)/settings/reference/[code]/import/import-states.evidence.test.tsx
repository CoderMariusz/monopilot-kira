/**
 * @vitest-environment jsdom
 * T-096 / SET-053 — per-state DOM evidence harness.
 *
 * Renders each of the 5 mandatory UI states and writes a DOM snapshot to
 * `e2e/artifacts/ui-set-053-reference-csv-import/` as parity-evidence fallback.
 * Playwright screenshots + axe are blocked in this worktree (no running app /
 * Supabase per the env note; axe-core not installed) — these DOM snapshots are
 * the documented RTL/snapshot fallback per UI-PROTOTYPE-PARITY-POLICY §"if
 * Playwright is unavailable, document the blocker and provide RTL/snapshot
 * fallback evidence". A basic role/landmark a11y assertion stands in for axe.
 */
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const previewReferenceCsvImport = vi.fn();
const commitReferenceCsvImport = vi.fn();
vi.mock('../../../../../../../../actions/reference/import-csv', () => ({
  previewReferenceCsvImport: (...a: unknown[]) => previewReferenceCsvImport(...a),
  commitReferenceCsvImport: (...a: unknown[]) => commitReferenceCsvImport(...a),
}));

import { previewImportAction } from './_actions/previewImport';
import { commitImportAction } from './_actions/commitImport';
import { ImportWizard, type ImportWizardProps } from './import-wizard.client';

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../e2e/artifacts/ui-set-053-reference-csv-import');

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
const labels = {
  title: 'CSV Import Wizard', subtitle: 'Guided 3-step CSV import.', dropzone: 'Drop your CSV file here or click to browse.',
  downloadTemplate: 'Download Template CSV', previewCta: 'Preview CSV', accepted: 'Accepted: .csv only · Max 5MB',
  headerGuidance: 'First row must contain column headers matching:', stepUpload: 'Step 1 — Upload', stepPreview: 'Step 2 — Preview',
  stepCommit: 'Step 3 — Commit', stepperUpload: 'Upload', stepperPreview: 'Preview', stepperCommit: 'Commit',
  uploading: 'Validating CSV…', committing: 'Committing…', commitImport: 'Commit Import', cancel: 'Cancel',
  showErrorsOnly: 'Show errors only', showAll: 'Show all', returnToTable: 'Return to Table', downloadErrorRows: 'Download error rows',
  importComplete: 'Import complete.', importPending: 'Import is ready to process after preview validation.', commitSummary: 'Commit summary',
  headerMismatchPrefix: 'Header mismatch — expected: ', emptyRows: 'No preview rows yet. Upload a CSV to validate headers and rows.',
  errorForbidden: 'You do not have permission to import reference data.', errorGeneric: 'The CSV could not be processed. Check the file and try again.',
  colRow: 'Row', colAction: 'Action', colValidation: 'Validation', insertLabel: 'insert', updateLabel: 'update', skipLabel: 'skip',
  errorsLabel: 'errors', parsedSummary: 'Parsed', completeSummary: 'Import complete.', safeguards: 'Safeguards copy.',
  breadcrumb: 'Settings / Reference tables /',
} satisfies ImportWizardProps['labels'];

function base(overrides: Partial<ImportWizardProps> = {}) {
  return { table, labels, expectedHeaders, previewAction: previewImportAction, commitAction: commitImportAction, ...overrides } as ImportWizardProps;
}
function snap(name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), document.body.innerHTML);
}

describe('SET-053 — 5-state evidence capture', () => {
  afterEach(() => { vi.clearAllMocks(); cleanup(); });

  it('empty: upload step with no preview rows yet', () => {
    render(React.createElement(ImportWizard, base({ initialStep: 'preview', preview: { parsedRows: 0, insertCount: 0, updateCount: 0, skipCount: 0, errorCount: 0, rows: [] } })));
    expect(screen.getByText(/no preview rows yet/i)).toBeInTheDocument();
    snap('state-empty');
  });

  it('loading: pending busy state while preview action resolves', async () => {
    let release!: () => void;
    previewReferenceCsvImport.mockReturnValue(new Promise((r) => { release = () => r({ ok: true, data: { reportId: 'r1', expiresAt: new Date(Date.now() + 3.6e6).toISOString(), summary: { inserted: 1, updated: 0, skipped: 0, errors: 0 }, conflicts: [], errors: [] } }); }));
    render(React.createElement(ImportWizard, base()));
    const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
    const file = new File(['row_key,allergen_code,display_name,risk_level,is_enabled\nA,A,a,major,true\n'], 'a.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('row_key,allergen_code,display_name,risk_level,is_enabled\nA,A,a,major,true\n') });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/validating csv/i));
    expect(screen.getByTestId('settings-reference-csv-import-wizard')).toHaveAttribute('aria-busy', 'true');
    snap('state-loading');
    release();
  });

  it('error: header mismatch fails closed before commit', () => {
    render(React.createElement(ImportWizard, base({ initialStep: 'preview', preview: { parsedRows: 0, insertCount: 0, updateCount: 0, skipCount: 0, errorCount: 0, rows: [], headerMismatch: { expected: expectedHeaders, received: ['name'] } } })));
    expect(screen.getByRole('alert')).toHaveTextContent(/header mismatch — expected:/i);
    expect(screen.getByRole('button', { name: /commit import/i })).toBeDisabled();
    snap('state-error');
  });

  it('permission-denied: forbidden preview surfaces an RBAC alert', async () => {
    previewReferenceCsvImport.mockResolvedValue({ ok: false, error: 'forbidden' });
    render(React.createElement(ImportWizard, base()));
    const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
    const file = new File(['x'], 'a.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('row_key\nA\n') });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to import reference data/i);
    snap('state-permission-denied');
  });

  it('optimistic + success: commit advances to the real summary panel', async () => {
    previewReferenceCsvImport.mockResolvedValue({ ok: true, data: { reportId: 'rOK', expiresAt: new Date(Date.now() + 3.6e6).toISOString(), summary: { inserted: 2, updated: 1, skipped: 0, errors: 0 }, conflicts: [{ rowKey: 'MILK', action: 'update', currentVersion: 1 }], errors: [] } });
    commitReferenceCsvImport.mockResolvedValue({ ok: true, data: { summary: { inserted: 2, updated: 1, skipped: 0, errors: 0 } } });
    render(React.createElement(ImportWizard, base()));
    const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
    const file = new File(['x'], 'a.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('row_key,allergen_code,display_name,risk_level,is_enabled\nMILK,MILK,Milk,major,true\n') });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const previewStep = await screen.findByRole('region', { name: /step 2.*preview/i });
    within(previewStep).getByRole('button', { name: /commit import/i }).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const commitStep = await screen.findByRole('region', { name: /step 3.*commit/i });
    expect(within(commitStep).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    snap('state-optimistic-success');
  });

  it('a11y (axe fallback): landmark + labelled regions + scoped headers present', () => {
    render(React.createElement(ImportWizard, base({ initialStep: 'preview', preview: { parsedRows: 1, insertCount: 1, updateCount: 0, skipCount: 0, errorCount: 0, rows: [{ rowNumber: 2, action: 'insert', values: { allergen_code: 'A' } }] } })));
    expect(screen.getByRole('main')).toHaveAttribute('aria-labelledby', 'reference-csv-import-heading');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /step 2.*preview/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /csv preview rows/i })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').length).toBeGreaterThan(0);
    const a11y = {
      tool: 'role/landmark assertions (axe-core not installed in worktree — documented blocker)',
      checks: ['single main landmark with aria-labelledby', 'h1 present', 'labelled step regions', 'table with scoped column headers', 'file input has accessible label'],
      result: 'pass',
    };
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2));
  });
});
