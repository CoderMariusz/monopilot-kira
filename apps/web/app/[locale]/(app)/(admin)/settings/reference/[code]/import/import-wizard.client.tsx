'use client';

/**
 * T-096 / SET-053 — Reference CSV Import Wizard (interactive island).
 *
 * Drives the real 3-step flow (Upload → Preview → Commit) against the REAL
 * withOrgContext-wired Server Actions (T-022):
 *   - file <input> onChange reads the CSV text and calls `previewImportAction`
 *     → `previewReferenceCsvImport` (RBAC + schema-header validation + conflict
 *     detection + report persistence under app.current_org_id() RLS);
 *   - the "Commit Import" button calls `commitImportAction(reportId)`
 *     → `commitReferenceCsvImport` (INSERT/UPDATE + MV refresh + audit + outbox).
 *
 * Neither the file input nor the commit button is a dead control: both invoke
 * the bound Server Actions and the step navigation reflects the real action
 * results. Static props (initialStep/preview/commitResult) remain supported for
 * SSR/RTL injection; when present they pin the rendered step without calling an
 * action (no client-trusted mutation path).
 */

import React from 'react';

import type { PreviewImportResult } from './_actions/previewImport';
import type { CommitImportResult } from './_actions/commitImport';

const h = React.createElement;

export type ReferenceColumn = { code: string; label: string; required?: boolean };

export type WizardTable = {
  code: string;
  name: string;
  columns: ReferenceColumn[];
  parentHref: string;
};

export type WizardLabels = {
  title: string;
  subtitle: string;
  dropzone: string;
  downloadTemplate: string;
  previewCta: string;
  accepted: string;
  headerGuidance: string;
  stepUpload: string;
  stepPreview: string;
  stepCommit: string;
  stepperUpload: string;
  stepperPreview: string;
  stepperCommit: string;
  uploading: string;
  committing: string;
  commitImport: string;
  cancel: string;
  showErrorsOnly: string;
  showAll: string;
  returnToTable: string;
  downloadErrorRows: string;
  importComplete: string;
  importPending: string;
  commitSummary: string;
  headerMismatchPrefix: string;
  emptyRows: string;
  errorForbidden: string;
  errorGeneric: string;
  colRow: string;
  colAction: string;
  colValidation: string;
  insertLabel: string;
  updateLabel: string;
  skipLabel: string;
  errorsLabel: string;
  parsedSummary: string;
  completeSummary: string;
  safeguards: string;
  breadcrumb: string;
};

type Step = 'upload' | 'preview' | 'commit';

type PreviewView = {
  reportId?: string;
  parsedRows: number;
  insertCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: Array<{
    rowNumber: number;
    action: 'insert' | 'update' | 'skip' | 'error';
    values: Record<string, string>;
    message?: string;
  }>;
  headerMismatch?: { expected: string[]; received: string[] };
};

type CommitView = {
  status: 'processing' | 'complete';
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRowsDownloadHref?: string;
};

export type InjectedPreview = {
  parsedRows: number;
  insertCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: PreviewView['rows'];
  headerMismatch?: { expected: string[]; received: string[] };
};

export type InjectedCommit = CommitView;

export type ImportWizardProps = {
  table: WizardTable;
  labels: WizardLabels;
  expectedHeaders: string[];
  previewAction: (tableCode: string, expectedHeaders: string[], csvText: string) => Promise<PreviewImportResult>;
  commitAction: (reportId: string) => Promise<CommitImportResult>;
  // SSR / RTL static-injection path (no action call).
  initialStep?: Step;
  preview?: InjectedPreview;
  commitResult?: InjectedCommit;
};

function statusPill(label: string, variant: 'success' | 'warning' | 'danger' | 'muted' | 'info') {
  return h('span', { className: `badge badge--${variant}`, 'data-variant': variant }, label);
}

function actionVariant(action: PreviewView['rows'][number]['action']) {
  if (action === 'insert') return 'success' as const;
  if (action === 'update') return 'warning' as const;
  if (action === 'error') return 'danger' as const;
  return 'muted' as const;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportWizard(props: ImportWizardProps) {
  const { table, labels, expectedHeaders, previewAction, commitAction } = props;

  const [step, setStep] = React.useState<Step>(props.initialStep ?? 'upload');
  const [preview, setPreview] = React.useState<PreviewView | undefined>(props.preview);
  const [commit, setCommit] = React.useState<CommitView | undefined>(props.commitResult);
  const [pending, startTransition] = React.useTransition();
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = React.useState(false);

  const onFile = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setErrorKey(null);
      if (file.size > MAX_BYTES) {
        setErrorKey(labels.errorGeneric);
        return;
      }
      void file.text().then((csvText) => {
        startTransition(async () => {
          const result = await previewAction(table.code, expectedHeaders, csvText);
          if (result.ok) {
            setPreview({ ...result.preview });
            setStep('preview');
          } else if (result.error === 'header_mismatch') {
            setPreview({
              parsedRows: 0,
              insertCount: 0,
              updateCount: 0,
              skipCount: 0,
              errorCount: 0,
              rows: [],
              headerMismatch: result.headerMismatch,
            });
            setStep('preview');
          } else {
            setErrorKey(result.error === 'forbidden' ? labels.errorForbidden : labels.errorGeneric);
          }
        });
      });
    },
    [expectedHeaders, labels.errorForbidden, labels.errorGeneric, previewAction, table.code],
  );

  const onCommit = React.useCallback(() => {
    if (!preview?.reportId) return;
    const reportId = preview.reportId;
    setErrorKey(null);
    startTransition(async () => {
      const result = await commitAction(reportId);
      if (result.ok) {
        setCommit({ ...result.commit });
        setStep('commit');
      } else {
        setErrorKey(result.error === 'forbidden' ? labels.errorForbidden : labels.errorGeneric);
      }
    });
  }, [commitAction, labels.errorForbidden, labels.errorGeneric, preview]);

  return h(
    'main',
    {
      'data-testid': 'settings-reference-csv-import-wizard',
      'data-screen': 'reference-csv-import-wizard',
      'data-route': `/settings/reference/${table.code}/import`,
      'data-ux-source': 'SET-053',
      'aria-labelledby': 'reference-csv-import-heading',
      'aria-busy': pending ? 'true' : undefined,
      className: 'mx-auto max-w-3xl space-y-5',
    },
    h(
      'header',
      { 'data-region': 'page-head', className: 'space-y-2' },
      h('p', { className: 'text-sm text-slate-500' }, `${labels.breadcrumb} ${table.name}`),
      h('h1', { id: 'reference-csv-import-heading' }, labels.title),
      h('p', { className: 'text-sm text-slate-600' }, labels.subtitle),
    ),
    h(Stepper, { activeStep: step, labels }),
    errorKey
      ? h('div', { role: 'alert', className: 'rounded-md border border-red-200 bg-red-50 p-3 text-red-900' }, errorKey)
      : null,
    h(
      'div',
      { className: 'card rounded-lg border bg-white p-4' },
      step === 'upload'
        ? h(UploadStep, { table, labels, expectedHeaders, onFile, pending })
        : null,
      step === 'preview'
        ? h(PreviewStep, {
            preview,
            expectedHeaders,
            labels,
            pending,
            showErrorsOnly,
            onToggleErrors: () => setShowErrorsOnly((v) => !v),
            onCancel: () => setStep('upload'),
            onCommit,
          })
        : null,
      step === 'commit' ? h(CommitStep, { table, commit, labels }) : null,
    ),
    h(
      'section',
      { role: 'note', 'aria-label': 'CSV import safeguards', className: 'rounded-md border bg-slate-50 p-3 text-sm text-slate-700' },
      labels.safeguards,
    ),
  );
}

function Stepper({ activeStep, labels }: { activeStep: Step; labels: WizardLabels }) {
  const steps: Array<[Step, string]> = [
    ['upload', labels.stepperUpload],
    ['preview', labels.stepperPreview],
    ['commit', labels.stepperCommit],
  ];
  return h(
    'ol',
    { 'aria-label': 'Import steps', className: 'flex flex-wrap gap-2 text-sm' },
    ...steps.map(([key, label], index) =>
      h(
        'li',
        { key, 'aria-current': activeStep === key ? 'step' : undefined, className: 'rounded-full border bg-white px-3 py-2' },
        h('span', { className: 'font-semibold' }, String(index + 1)),
        ' ',
        label,
      ),
    ),
  );
}

function UploadStep({
  table,
  labels,
  expectedHeaders,
  onFile,
  pending,
}: {
  table: WizardTable;
  labels: WizardLabels;
  expectedHeaders: string[];
  onFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  pending: boolean;
}) {
  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-upload-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-upload-heading' }, labels.stepUpload),
    h(
      'div',
      { className: 'rounded-lg border-2 border-dashed bg-slate-50 p-8 text-center' },
      h('div', { className: 'mb-2 text-2xl', 'aria-hidden': 'true' }, '📄'),
      h('p', { className: 'font-medium' }, labels.dropzone),
      h('p', { className: 'text-sm text-slate-600' }, labels.accepted),
      h('label', { htmlFor: 'reference-csv-file', className: 'sr-only' }, 'CSV file'),
      h('input', {
        id: 'reference-csv-file',
        name: 'reference-csv-file',
        'aria-label': 'CSV file',
        type: 'file',
        accept: '.csv,text/csv',
        className: 'mt-4',
        onChange: onFile,
        disabled: pending,
      }),
      pending ? h('p', { role: 'status', className: 'mt-2 text-sm text-slate-600' }, labels.uploading) : null,
    ),
    h('p', { className: 'text-sm text-slate-700' }, `${labels.headerGuidance} ${expectedHeaders.join(', ')}`),
    h(
      'div',
      { className: 'flex flex-wrap items-center justify-between gap-3' },
      h('a', { className: 'btn btn-secondary', href: `${table.parentHref}/import/template.csv` }, labels.downloadTemplate),
    ),
  );
}

function PreviewStep({
  preview,
  expectedHeaders,
  labels,
  pending,
  showErrorsOnly,
  onToggleErrors,
  onCancel,
  onCommit,
}: {
  preview?: PreviewView;
  expectedHeaders: string[];
  labels: WizardLabels;
  pending: boolean;
  showErrorsOnly: boolean;
  onToggleErrors: () => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const allRows = preview?.rows ?? [];
  const rows = showErrorsOnly ? allRows.filter((r) => r.action === 'error') : allRows;
  const summary = preview
    ? `Parsed ${preview.parsedRows} rows. ${preview.insertCount} to insert, ${preview.updateCount} to update, ${preview.skipCount} to skip, ${preview.errorCount} errors.`
    : 'Parsed 0 rows. 0 to insert, 0 to update, 0 to skip, 0 errors.';
  // Commit is enabled only when a real, persisted report exists with no header
  // mismatch — fail-closed. The static-injection path (no reportId) keeps it
  // disabled, matching the original RED contract.
  const commitDisabled = Boolean(preview?.headerMismatch) || !preview?.reportId || pending;

  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-preview-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-preview-heading' }, labels.stepPreview),
    h(
      'div',
      { className: 'rounded-md border bg-white p-3', 'aria-label': 'Preview summary' },
      h('span', null, summary),
      ' ',
      statusPill(`${preview?.insertCount ?? 0} insert`, 'success'),
      ' ',
      statusPill(`${preview?.updateCount ?? 0} update`, 'warning'),
      ' ',
      statusPill(`${preview?.skipCount ?? 0} skip`, 'muted'),
      ' ',
      statusPill(`${preview?.errorCount ?? 0} errors`, 'danger'),
    ),
    preview?.headerMismatch
      ? h(
          'div',
          { role: 'alert', className: 'rounded-md border border-red-200 bg-red-50 p-3 text-red-900' },
          `${labels.headerMismatchPrefix}${preview.headerMismatch.expected.join(', ')}`,
        )
      : null,
    h(
      'div',
      { className: 'flex flex-wrap items-center justify-between gap-3' },
      h('button', { className: 'btn', type: 'button', onClick: onToggleErrors }, showErrorsOnly ? labels.showAll : labels.showErrorsOnly),
      h(
        'div',
        { className: 'flex gap-2' },
        h('button', { className: 'btn btn-danger', type: 'button', onClick: onCancel }, labels.cancel),
        h('button', { className: 'btn btn-primary', type: 'button', disabled: commitDisabled, onClick: onCommit }, pending ? labels.committing : labels.commitImport),
      ),
    ),
    h(
      'table',
      { className: 'table', 'aria-label': 'CSV preview rows' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, labels.colRow),
          h('th', { scope: 'col' }, labels.colAction),
          ...expectedHeaders.map((column) => h('th', { scope: 'col', key: column }, column)),
          h('th', { scope: 'col' }, labels.colValidation),
        ),
      ),
      h(
        'tbody',
        null,
        ...(rows.length
          ? rows.map((row) =>
              h(
                'tr',
                { key: `${row.rowNumber}-${row.action}` },
                h('td', null, String(row.rowNumber)),
                h('td', null, statusPill(row.action, actionVariant(row.action))),
                ...expectedHeaders.map((column) => h('td', { key: column }, row.values[column] ?? '—')),
                h('td', null, row.message ?? '—'),
              ),
            )
          : [h('tr', { key: 'empty' }, h('td', { colSpan: expectedHeaders.length + 3 }, labels.emptyRows))]),
      ),
    ),
  );
}

function CommitStep({ table, commit, labels }: { table: WizardTable; commit?: CommitView; labels: WizardLabels }) {
  const complete = commit?.status === 'complete';
  const progress = complete ? 100 : commit ? 50 : 0;
  const inserted = commit?.inserted ?? 0;
  const updated = commit?.updated ?? 0;
  const skipped = commit?.skipped ?? 0;
  const errors = commit?.errors ?? 0;

  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-commit-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-commit-heading' }, labels.stepCommit),
    h(
      'div',
      {
        role: 'progressbar',
        'aria-label': 'Import progress',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': progress,
        className: 'h-3 overflow-hidden rounded-full bg-slate-200',
      },
      h('div', { className: 'h-full bg-blue-600', style: { width: `${progress}%` } }),
    ),
    h(
      'div',
      { className: 'card rounded-md border bg-white p-4' },
      h('h3', null, complete ? labels.commitSummary : labels.importPending),
      h(
        'p',
        null,
        complete
          ? `Import complete. ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors} errors.`
          : labels.importPending,
      ),
      h(
        'div',
        { className: 'mt-3 flex flex-wrap gap-2' },
        statusPill(`${inserted} inserted`, 'success'),
        statusPill(`${updated} updated`, 'warning'),
        statusPill(`${skipped} skipped`, 'muted'),
        statusPill(`${errors} errors`, errors > 0 ? 'danger' : 'info'),
      ),
    ),
    h(
      'div',
      { className: 'flex flex-wrap gap-3' },
      h('a', { className: 'btn btn-primary', href: table.parentHref }, labels.returnToTable),
      commit?.errorRowsDownloadHref ? h('a', { href: commit.errorRowsDownloadHref }, labels.downloadErrorRows) : null,
    ),
  );
}
