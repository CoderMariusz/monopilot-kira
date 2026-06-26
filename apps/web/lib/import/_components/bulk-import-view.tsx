'use client';

/**
 * Generic bulk-import view — thin client wiring around any shipped
 * preview→confirm server-action pair (PO / TO / WO).
 *
 * Parity: there is NO prototype for the import screens. Parity is achieved by
 * REUSING the existing planning list conventions (po-list-view.tsx /
 * to-list-view.tsx / wo-list-view.tsx):
 *   - the shared @monopilot/ui/Button with the btn--primary / btn--secondary
 *     modifier classes (the convention every planning page already uses), and
 *   - the same dense bordered table chrome
 *     (overflow-x-auto rounded-xl border border-slate-200 → table.w-full.text-sm,
 *      uppercase tracking-wide slate-500 header row, slate-100 row dividers).
 *
 * This is a structure-faithful EXTRACTION of po-bulk-import-view.tsx: identical
 * flow, identical five UI states, identical class chrome. The single point of
 * variation is the valid-rows table — each entity (PO/TO/WO) supplies its own
 * `columns` config (header + per-row cell) so the supplier/site/routing-specific
 * fields render without forking the whole view. The existing PO view file is left
 * untouched (it keeps its own copy of this shape, per the no-modify constraint).
 *
 * The actions OWN parsing + validation; this view does no parsing of its own. It
 * builds a FormData with the picked CSV File, calls the preview action, renders
 * the valid rows + a clearly separated per-row error list, then calls the confirm
 * action with the valid rows (Confirm disabled when there are none).
 *
 * Five UI states:
 *   - loading      → busy CTAs (aria-busy) during the preview / confirm transitions
 *   - empty        → no file picked (Preview disabled) / preview with zero valid rows
 *   - error        → action throw → alert banner; per-row validation errors list;
 *                    per-row create errors list after confirm
 *   - permission   → rendered by the page host (RBAC gate) around this island
 *   - optimistic   → the busy CTA + disabled controls during the confirm transition
 */

import React from 'react';
import Link from 'next/link';

import { Button } from '@monopilot/ui/Button';

import type { ImportError } from '../po-import-validator';

/** Minimal contract a previewed row must satisfy for keying + the count display. */
export type ImportRowBase = { rowNumber: number };

export type ImportColumn<Row extends ImportRowBase> = {
  /** Stable key (used for the React key on the header cell). */
  key: string;
  /** Header label. */
  header: string;
  /** Cell renderer for a single previewed row. */
  cell: (row: Row) => React.ReactNode;
  /** Right-align numeric columns (matches the PO view's tabular-nums columns). */
  align?: 'left' | 'right';
};

export type BulkImportLabels = {
  fileLabel: string;
  fileHelp: string;
  selectedFile: string;
  preview: string;
  previewing: string;
  confirm: string;
  confirming: string;
  reset: string;
  previewError: string;
  confirmError: string;
  validTitle: string;
  validCount: string; // "{n} valid row(s)"
  errorsTitle: string;
  errorsCount: string; // "{n} error(s)"
  noValidRows: string;
  noErrors: string;
  createdTitle: string;
  createdCount: string; // "{n} … created"
  createErrorsTitle: string;
  backToList: string;
  errorColumns: {
    row: string;
    column: string;
    message: string;
  };
};

export type BulkImportViewProps<Row extends ImportRowBase> = {
  /** Test-id / DOM namespace prefix, e.g. "to-bulk-import" or "wo-bulk-import". */
  testidPrefix: string;
  /** Where the "Back to list" link points after a confirm. */
  backHref: string;
  labels: BulkImportLabels;
  /** Entity-specific valid-rows table columns. */
  columns: ImportColumn<Row>[];
  previewAction: (formData: FormData) => Promise<{ valid: Row[]; errors: ImportError[] }>;
  confirmAction: (rows: Row[]) => Promise<{ created: number; errors: ImportError[] }>;
};

type Phase = 'idle' | 'previewed' | 'confirmed';

function ErrorList({
  errors,
  labels,
  testid,
}: {
  errors: ImportError[];
  labels: BulkImportLabels;
  testid: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-red-200" data-testid={testid}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-red-200 bg-red-50 text-left text-xs uppercase tracking-wide text-red-600">
            <th className="px-3 py-2">{labels.errorColumns.row}</th>
            <th className="px-3 py-2">{labels.errorColumns.column}</th>
            <th className="px-3 py-2">{labels.errorColumns.message}</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((err, i) => (
            <tr key={`${err.rowNumber}-${err.column}-${i}`} className="border-b border-red-100 last:border-0">
              <td className="px-3 py-2 font-mono tabular-nums text-red-700">{err.rowNumber}</td>
              <td className="px-3 py-2 font-mono text-xs text-red-700">{err.column}</td>
              <td className="px-3 py-2 text-red-700">{err.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BulkImportView<Row extends ImportRowBase>({
  testidPrefix,
  backHref,
  labels,
  columns,
  previewAction,
  confirmAction,
}: BulkImportViewProps<Row>) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState('');
  const [hasFile, setHasFile] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [preview, setPreview] = React.useState<{ valid: Row[]; errors: ImportError[] } | null>(null);
  const [created, setCreated] = React.useState(0);
  const [createErrors, setCreateErrors] = React.useState<ImportError[]>([]);
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const [confirmFailed, setConfirmFailed] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFilename(file?.name ?? '');
    setHasFile(Boolean(file));
    // Picking a new file invalidates a prior preview/result.
    setPreview(null);
    setPhase('idle');
    setPreviewFailed(false);
    setConfirmFailed(false);
    setCreated(0);
    setCreateErrors([]);
  }

  function runPreview() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setPreviewFailed(false);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('file', file);
        const result = await previewAction(formData);
        setPreview(result);
        setPhase('previewed');
      } catch {
        setPreviewFailed(true);
      }
    });
  }

  function runConfirm() {
    if (!preview || preview.valid.length === 0) return;
    setConfirmFailed(false);
    startTransition(async () => {
      try {
        const result = await confirmAction(preview.valid);
        setCreated(result.created);
        setCreateErrors(result.errors);
        setPhase('confirmed');
      } catch {
        setConfirmFailed(true);
      }
    });
  }

  function reset() {
    setFilename('');
    setHasFile(false);
    setPreview(null);
    setPhase('idle');
    setCreated(0);
    setCreateErrors([]);
    setPreviewFailed(false);
    setConfirmFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const validRows = preview?.valid ?? [];
  const previewErrors = preview?.errors ?? [];
  const fileInputId = `${testidPrefix}-file`;

  return (
    <div className="flex flex-col gap-6" data-testid={`${testidPrefix}-view`}>
      {/* File picker + Preview */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4">
        <label htmlFor={fileInputId} className="text-sm font-medium text-slate-800">
          {labels.fileLabel}
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".csv,text/csv"
          aria-label={labels.fileLabel}
          data-testid={`${testidPrefix}-file`}
          onChange={onFileChange}
          className="text-sm"
        />
        <p className="text-xs text-slate-500">{labels.fileHelp}</p>
        {filename ? (
          <p className="font-mono text-xs text-slate-600" data-testid={`${testidPrefix}-filename`}>
            {labels.selectedFile}: {filename}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="btn--primary"
            data-testid={`${testidPrefix}-preview`}
            disabled={!hasFile || pending}
            aria-busy={pending && phase === 'idle'}
            onClick={runPreview}
          >
            {pending && phase === 'idle' ? labels.previewing : labels.preview}
          </Button>
          {phase !== 'idle' || hasFile ? (
            <Button
              type="button"
              className="btn--secondary"
              data-testid={`${testidPrefix}-reset`}
              disabled={pending}
              onClick={reset}
            >
              {labels.reset}
            </Button>
          ) : null}
        </div>
      </section>

      {previewFailed ? (
        <div
          role="alert"
          data-testid={`${testidPrefix}-preview-error`}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {labels.previewError}
        </div>
      ) : null}

      {/* Preview result: valid rows table + separated errors list */}
      {phase !== 'idle' && preview ? (
        <>
          <section className="flex flex-col gap-3" data-testid={`${testidPrefix}-valid`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{labels.validTitle}</h2>
              <span className="text-xs text-slate-500" data-testid={`${testidPrefix}-valid-count`}>
                {labels.validCount.replace('{n}', String(validRows.length))}
              </span>
            </div>
            {validRows.length === 0 ? (
              <p
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500"
                data-testid={`${testidPrefix}-no-valid`}
              >
                {labels.noValidRows}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm" data-testid={`${testidPrefix}-valid-table`}>
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          className={['px-3 py-2', col.align === 'right' ? 'text-right' : ''].join(' ').trim()}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        data-testid={`${testidPrefix}-valid-row`}
                        className="border-b border-slate-100 last:border-0"
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={[
                              'px-3 py-2 font-mono text-xs text-slate-700',
                              col.align === 'right' ? 'text-right tabular-nums' : '',
                            ]
                              .join(' ')
                              .trim()}
                          >
                            {col.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3" data-testid={`${testidPrefix}-errors`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">{labels.errorsTitle}</h2>
              <span className="text-xs text-slate-500" data-testid={`${testidPrefix}-errors-count`}>
                {labels.errorsCount.replace('{n}', String(previewErrors.length))}
              </span>
            </div>
            {previewErrors.length === 0 ? (
              <p
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700"
                data-testid={`${testidPrefix}-no-errors`}
              >
                {labels.noErrors}
              </p>
            ) : (
              <ErrorList errors={previewErrors} labels={labels} testid={`${testidPrefix}-errors-table`} />
            )}
          </section>

          {phase === 'previewed' ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="btn--primary"
                data-testid={`${testidPrefix}-confirm`}
                disabled={validRows.length === 0 || pending}
                aria-busy={pending}
                onClick={runConfirm}
              >
                {pending ? labels.confirming : labels.confirm}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {confirmFailed ? (
        <div
          role="alert"
          data-testid={`${testidPrefix}-confirm-error`}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {labels.confirmError}
        </div>
      ) : null}

      {/* Confirm result: created count + any create errors */}
      {phase === 'confirmed' ? (
        <section className="flex flex-col gap-3" data-testid={`${testidPrefix}-result`}>
          <div
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
            data-testid={`${testidPrefix}-created`}
          >
            <span className="font-semibold">{labels.createdTitle}</span>{' '}
            {labels.createdCount.replace('{n}', String(created))}
          </div>

          {createErrors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-red-700">{labels.createErrorsTitle}</h2>
              <ErrorList errors={createErrors} labels={labels} testid={`${testidPrefix}-create-errors-table`} />
            </div>
          ) : null}

          <div>
            <Link
              href={backHref}
              prefetch={false}
              className="text-sm text-blue-700 hover:underline"
              data-testid={`${testidPrefix}-back`}
            >
              {labels.backToList}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
