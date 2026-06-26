'use client';

/**
 * Bulk PO import — thin client wiring around the shipped server actions
 *   apps/web/lib/import/po-import-actions.ts
 *     previewBulkImportPo(formData) → { valid: PreviewRow[]; errors: ImportError[] }
 *     confirmBulkImportPo(rows)     → { created: number; errors: ImportError[] }
 *
 * Parity: there is NO prototype for this screen. Parity is achieved by REUSING the
 * existing Purchase Orders list conventions (po-list-view.tsx):
 *   - the shared @monopilot/ui/Button with the btn--primary / btn--secondary
 *     modifier classes (the convention the PO pages already use), and
 *   - the same dense bordered table chrome
 *     (overflow-x-auto rounded-xl border border-slate-200 → table.w-full.text-sm,
 *      uppercase tracking-wide slate-500 header row, slate-100 row dividers).
 *
 * The actions OWN parsing + validation; this view does no parsing of its own. It
 * builds a FormData with the picked CSV File, calls previewBulkImportPo, renders
 * the valid rows + a clearly separated per-row error list, then calls
 * confirmBulkImportPo with the valid rows (Confirm disabled when there are none).
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

import type { ImportError, PreviewResult, PreviewRow } from '../../../../../../../lib/import/po-import-validator';

export type PoBulkImportLabels = {
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
  validCount: string; // ICU-ish: "{n} valid row(s)"
  errorsTitle: string;
  errorsCount: string; // "{n} error(s)"
  noValidRows: string;
  noErrors: string;
  createdTitle: string;
  createdCount: string; // "{n} purchase order(s) created"
  createErrorsTitle: string;
  backToList: string;
  columns: {
    row: string;
    supplier: string;
    item: string;
    qty: string;
    uom: string;
    unitPrice: string;
    currency: string;
    expected: string;
  };
  errorColumns: {
    row: string;
    column: string;
    message: string;
  };
};

export type PoBulkImportViewProps = {
  locale: string;
  labels: PoBulkImportLabels;
  previewAction: (formData: FormData) => Promise<PreviewResult>;
  confirmAction: (rows: PreviewRow[]) => Promise<{ created: number; errors: ImportError[] }>;
};

type Phase = 'idle' | 'previewed' | 'confirmed';

function ErrorList({
  errors,
  labels,
  testid,
}: {
  errors: ImportError[];
  labels: PoBulkImportLabels;
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

export function PoBulkImportView({ locale, labels, previewAction, confirmAction }: PoBulkImportViewProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState('');
  const [hasFile, setHasFile] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [created, setCreated] = React.useState(0);
  const [createErrors, setCreateErrors] = React.useState<ImportError[]>([]);
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const [confirmFailed, setConfirmFailed] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const basePath = `/${locale}/planning/purchase-orders`;

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

  return (
    <div className="flex flex-col gap-6" data-testid="po-bulk-import-view">
      {/* File picker + Preview */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4">
        <label htmlFor="po-bulk-import-file" className="text-sm font-medium text-slate-800">
          {labels.fileLabel}
        </label>
        <input
          ref={fileInputRef}
          id="po-bulk-import-file"
          type="file"
          accept=".csv,text/csv"
          aria-label={labels.fileLabel}
          data-testid="po-bulk-import-file"
          onChange={onFileChange}
          className="text-sm"
        />
        <p className="text-xs text-slate-500">{labels.fileHelp}</p>
        {filename ? (
          <p className="font-mono text-xs text-slate-600" data-testid="po-bulk-import-filename">
            {labels.selectedFile}: {filename}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="btn--primary"
            data-testid="po-bulk-import-preview"
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
              data-testid="po-bulk-import-reset"
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
          data-testid="po-bulk-import-preview-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {labels.previewError}
        </div>
      ) : null}

      {/* Preview result: valid rows table + separated errors list */}
      {phase !== 'idle' && preview ? (
        <>
          <section className="flex flex-col gap-3" data-testid="po-bulk-import-valid">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{labels.validTitle}</h2>
              <span className="text-xs text-slate-500" data-testid="po-bulk-import-valid-count">
                {labels.validCount.replace('{n}', String(validRows.length))}
              </span>
            </div>
            {validRows.length === 0 ? (
              <p
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500"
                data-testid="po-bulk-import-no-valid"
              >
                {labels.noValidRows}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm" data-testid="po-bulk-import-valid-table">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-right">{labels.columns.row}</th>
                      <th className="px-3 py-2">{labels.columns.supplier}</th>
                      <th className="px-3 py-2">{labels.columns.item}</th>
                      <th className="px-3 py-2 text-right">{labels.columns.qty}</th>
                      <th className="px-3 py-2">{labels.columns.uom}</th>
                      <th className="px-3 py-2 text-right">{labels.columns.unitPrice}</th>
                      <th className="px-3 py-2">{labels.columns.currency}</th>
                      <th className="px-3 py-2">{labels.columns.expected}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        data-testid="po-bulk-import-valid-row"
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.supplierCode}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.itemCode}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{row.qty}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.uom}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{row.unitPrice}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.currency ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.expectedDelivery ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3" data-testid="po-bulk-import-errors">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">{labels.errorsTitle}</h2>
              <span className="text-xs text-slate-500" data-testid="po-bulk-import-errors-count">
                {labels.errorsCount.replace('{n}', String(previewErrors.length))}
              </span>
            </div>
            {previewErrors.length === 0 ? (
              <p
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700"
                data-testid="po-bulk-import-no-errors"
              >
                {labels.noErrors}
              </p>
            ) : (
              <ErrorList errors={previewErrors} labels={labels} testid="po-bulk-import-errors-table" />
            )}
          </section>

          {phase === 'previewed' ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="btn--primary"
                data-testid="po-bulk-import-confirm"
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
          data-testid="po-bulk-import-confirm-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {labels.confirmError}
        </div>
      ) : null}

      {/* Confirm result: created count + any create errors */}
      {phase === 'confirmed' ? (
        <section className="flex flex-col gap-3" data-testid="po-bulk-import-result">
          <div
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
            data-testid="po-bulk-import-created"
          >
            <span className="font-semibold">{labels.createdTitle}</span>{' '}
            {labels.createdCount.replace('{n}', String(created))}
          </div>

          {createErrors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-red-700">{labels.createErrorsTitle}</h2>
              <ErrorList errors={createErrors} labels={labels} testid="po-bulk-import-create-errors-table" />
            </div>
          ) : null}

          <div>
            <Link
              href={basePath}
              prefetch={false}
              className="text-sm text-blue-700 hover:underline"
              data-testid="po-bulk-import-back"
            >
              {labels.backToList}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
