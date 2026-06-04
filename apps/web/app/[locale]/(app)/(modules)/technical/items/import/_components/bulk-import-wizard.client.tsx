'use client';

/**
 * 03-technical · TEC-014 Bulk Import CSV (T-085, spec-driven) — client island.
 *
 * Spec-driven Wave0 surface. PRD §6.5 + prototypes/design/03-TECHNICAL-UX.md are
 * canonical; the layout-primitive prototype
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, 4-step wizard upload → validate → diff → confirm)
 * is the structural reference only (NOT a 1:1 visual source).
 *
 * Drives the real flow against the org-scoped Server Actions:
 *   - file upload → previewItemsImport(scope, csvText) (RBAC technical.items.create
 *     + parse + per-row validation + create/update/no-op diff vs existing items);
 *   - "Apply import" → commitItemsImport(scope, csvText, reason) which re-validates
 *     server-side (fail-closed) and consumes createItem / updateItem.
 *
 * Red-line overlay: org-scoped (org_id from session, never CSV), no D365
 * dependency, FG not FA, WIP/intermediate not PR-code, supplier_specs warning on
 * RM rows. The five UI states (idle/upload, validating/loading, error,
 * permission-denied via forbidden, populated diff) are all exercised.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import Textarea from '@monopilot/ui/Textarea';

import type { PreviewImportResult } from '../_actions/preview-import';
import type { CommitImportResult } from '../_actions/commit-import';
import type { ImportScope, ItemImportPreview } from '../../../../../../../../lib/import/parse-items-csv';

type Step = 'upload' | 'validate' | 'diff' | 'confirm';

const STEP_ORDER: Step[] = ['upload', 'validate', 'diff', 'confirm'];

export type BulkImportLabels = {
  stepUpload: string;
  stepValidate: string;
  stepDiff: string;
  stepConfirm: string;
  scopeLabel: string;
  scopeFg: string;
  scopeWip: string;
  scopeRm: string;
  scopeRmSupplier: string;
  fileLabel: string;
  filePlaceholder: string;
  orgScopedNote: string;
  validateCta: string;
  diffCta: string;
  confirmCta: string;
  applyCta: string;
  backCta: string;
  cancelCta: string;
  rowsInFile: string;
  errorsKpi: string;
  warningsKpi: string;
  createKpi: string;
  updateKpi: string;
  noopKpi: string;
  colRow: string;
  colSeverity: string;
  colColumn: string;
  colIssue: string;
  colCode: string;
  colOp: string;
  colField: string;
  colChange: string;
  noIssues: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  reasonHelp: string;
  applied: string;
  forbidden: string;
  parseFailed: string;
  supplierBlocker: string;
};

const SCOPE_OPTIONS = (labels: BulkImportLabels): Array<{ value: ImportScope; label: string }> => [
  { value: 'fg', label: labels.scopeFg },
  { value: 'wip', label: labels.scopeWip },
  { value: 'rm', label: labels.scopeRm },
  { value: 'rm_supplier_specs', label: labels.scopeRmSupplier },
];

function Stepper({ active, labels }: { active: Step; labels: BulkImportLabels }) {
  const steps: Array<[Step, string]> = [
    ['upload', labels.stepUpload],
    ['validate', labels.stepValidate],
    ['diff', labels.stepDiff],
    ['confirm', labels.stepConfirm],
  ];
  return (
    <ol aria-label="Import steps" className="flex flex-wrap gap-2 text-sm" data-testid="bulk-import-stepper">
      {steps.map(([key, label], i) => (
        <li
          key={key}
          aria-current={active === key ? 'step' : undefined}
          data-active={active === key ? 'true' : undefined}
          className={[
            'rounded-full border px-3 py-2',
            active === key ? 'border-blue-300 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 bg-white',
          ].join(' ')}
        >
          <span className="font-semibold">{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}

export type BulkImportWizardProps = {
  labels: BulkImportLabels;
  previewAction: (scope: ImportScope, csvText: string) => Promise<PreviewImportResult>;
  commitAction: (scope: ImportScope, csvText: string, reason: string) => Promise<CommitImportResult>;
  /** Static SSR/RTL injection — pins a step + preview without an action call. */
  initialStep?: Step;
  initialPreview?: ItemImportPreview;
};

export function BulkImportWizard(props: BulkImportWizardProps) {
  const { labels, previewAction, commitAction } = props;

  const [step, setStep] = React.useState<Step>(props.initialStep ?? 'upload');
  const [scope, setScope] = React.useState<ImportScope>(props.initialPreview?.scope ?? 'rm_supplier_specs');
  const [filename, setFilename] = React.useState('');
  const [csvText, setCsvText] = React.useState('');
  const [preview, setPreview] = React.useState<ItemImportPreview | undefined>(props.initialPreview);
  const [reason, setReason] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [committed, setCommitted] = React.useState<{ created: number; updated: number; skipped: number; errors: number } | null>(
    null,
  );

  const onFile = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    void file.text().then((text) => setCsvText(text));
  }, []);

  const runPreview = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      const res = await previewAction(scope, csvText);
      if (res.ok) {
        setPreview(res.preview);
        setStep('validate');
      } else {
        setErrorKey(res.error === 'forbidden' ? labels.forbidden : labels.parseFailed);
      }
    });
  }, [csvText, labels.forbidden, labels.parseFailed, previewAction, scope]);

  const onApply = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      const res = await commitAction(scope, csvText, reason);
      if (res.ok) {
        setCommitted(res.committed);
      } else if (res.error === 'forbidden') {
        setErrorKey(labels.forbidden);
      } else {
        setErrorKey(labels.parseFailed);
      }
    });
  }, [commitAction, csvText, labels.forbidden, labels.parseFailed, reason, scope]);

  const hasErrors = (preview?.counts.errors ?? 0) > 0;
  const hasWarnings = (preview?.counts.warnings ?? 0) > 0;
  const confirmValid = reason.trim().length >= 10 && !hasErrors;

  const validationRows = (preview?.rows ?? []).flatMap((row) =>
    row.issues.map((iss) => ({ rowNumber: row.rowNumber, ...iss })),
  );

  return (
    <div data-prototype-label="bulk_import_csv_screen" data-screen="technical-items-import" className="flex flex-col gap-4">
      <Stepper active={step} labels={labels} />

      {errorKey ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {errorKey}
        </div>
      ) : null}

      {committed ? (
        <div role="status" data-testid="bulk-import-applied" className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {labels.applied} · {committed.created} create / {committed.updated} update / {committed.skipped} skip /{' '}
          {committed.errors} errors
        </div>
      ) : null}

      {step === 'upload' ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="bulk-import-upload-h">
          <h2 id="bulk-import-upload-h" className="text-base font-semibold">
            {labels.stepUpload}
          </h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="bulk-import-scope" className="mb-1 block text-sm font-medium">
                {labels.scopeLabel}
              </label>
              <Select
                id="bulk-import-scope"
                aria-label={labels.scopeLabel}
                value={scope}
                onValueChange={(v) => setScope(v as ImportScope)}
                options={SCOPE_OPTIONS(labels)}
              />
            </div>
            <div>
              <label htmlFor="bulk-import-file" className="mb-1 block text-sm font-medium">
                {labels.fileLabel}
              </label>
              <Input
                id="bulk-import-file"
                type="file"
                accept=".csv,text/csv"
                aria-label={labels.fileLabel}
                onChange={onFile}
                data-testid="bulk-import-file"
              />
              {filename ? <p className="mt-1 font-mono text-xs text-muted-foreground">{filename}</p> : null}
            </div>
            <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{labels.orgScopedNote}</p>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn btn--default"
              data-variant="default"
              data-testid="bulk-import-validate-cta"
              disabled={!csvText || pending}
              onClick={runPreview}
            >
              {pending ? '…' : labels.validateCta}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'validate' ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="bulk-import-validate-h">
          <h2 id="bulk-import-validate-h" className="text-base font-semibold">
            {labels.stepValidate}
          </h2>
          <div className="mt-4 flex flex-wrap gap-3" data-testid="bulk-import-validate-kpis">
            <Kpi label={labels.rowsInFile} value={String(preview?.rowsInFile ?? 0)} tone="default" />
            <Kpi label={labels.errorsKpi} value={String(preview?.counts.errors ?? 0)} tone="danger" />
            <Kpi label={labels.warningsKpi} value={String(preview?.counts.warnings ?? 0)} tone="warning" />
          </div>
          <Table aria-label="Validation issues" className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colRow}</TableHead>
                <TableHead scope="col">{labels.colSeverity}</TableHead>
                <TableHead scope="col">{labels.colColumn}</TableHead>
                <TableHead scope="col">{labels.colIssue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationRows.length ? (
                validationRows.map((iss, i) => (
                  <TableRow key={i} data-testid="bulk-import-issue-row">
                    <TableCell className="font-mono text-sm">#{iss.rowNumber}</TableCell>
                    <TableCell>
                      <Badge variant={iss.kind === 'error' ? 'danger' : iss.kind === 'warning' ? 'warning' : 'info'}>
                        {iss.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{iss.column}</TableCell>
                    <TableCell className="text-sm">{iss.message}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    {labels.noIssues}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="btn" onClick={() => setStep('upload')}>
              {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn--default"
              data-variant="default"
              data-testid="bulk-import-diff-cta"
              disabled={hasErrors}
              onClick={() => setStep('diff')}
            >
              {labels.diffCta}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'diff' ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="bulk-import-diff-h">
          <h2 id="bulk-import-diff-h" className="text-base font-semibold">
            {labels.stepDiff}
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Kpi label={labels.createKpi} value={String(preview?.counts.create ?? 0)} tone="success" />
            <Kpi label={labels.updateKpi} value={String(preview?.counts.update ?? 0)} tone="warning" />
            <Kpi label={labels.noopKpi} value={String(preview?.counts.noop ?? 0)} tone="default" />
          </div>
          <Table aria-label="Import diff" className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colCode}</TableHead>
                <TableHead scope="col">{labels.colOp}</TableHead>
                <TableHead scope="col">{labels.colField}</TableHead>
                <TableHead scope="col">{labels.colChange}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(preview?.rows ?? [])
                .filter((r) => r.op !== 'error')
                .map((r) => (
                  <TableRow key={r.rowNumber} data-testid="bulk-import-diff-row">
                    <TableCell className="font-mono text-sm">{r.itemCode}</TableCell>
                    <TableCell>
                      <Badge variant={r.op === 'create' ? 'success' : r.op === 'update' ? 'warning' : 'muted'}>{r.op}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.field}</TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-muted-foreground">{r.before}</span>
                      {' → '}
                      <span className="font-mono font-semibold">{r.after}</span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {hasWarnings ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {labels.supplierBlocker}
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="btn" onClick={() => setStep('validate')}>
              {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn--default"
              data-variant="default"
              data-testid="bulk-import-confirm-cta"
              onClick={() => setStep('confirm')}
            >
              {labels.confirmCta}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'confirm' ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="bulk-import-confirm-h">
          <h2 id="bulk-import-confirm-h" className="text-base font-semibold">
            {labels.stepConfirm}
          </h2>
          <div className="mt-4">
            <label htmlFor="bulk-import-reason" className="mb-1 block text-sm font-medium">
              {labels.reasonLabel}
            </label>
            <Textarea
              id="bulk-import-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={labels.reasonPlaceholder}
              data-testid="bulk-import-reason"
              rows={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">{labels.reasonHelp}</p>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="btn" onClick={() => setStep('diff')}>
              {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn--default"
              data-variant="default"
              data-testid="bulk-import-apply-cta"
              disabled={!confirmValid || pending || Boolean(committed)}
              onClick={onApply}
            >
              {pending ? '…' : labels.applyCta}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'default' | 'danger' | 'warning' | 'success' }) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-slate-200 bg-white text-slate-800';
  return (
    <div className={['min-w-[7rem] rounded-lg border px-4 py-3', toneClass].join(' ')}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export { STEP_ORDER };
