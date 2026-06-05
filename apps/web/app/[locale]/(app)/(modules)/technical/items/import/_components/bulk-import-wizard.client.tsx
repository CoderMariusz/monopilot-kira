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

// Locked design-system wizard stepper (globals.css `.wiz-*`), translated 1:1 from
// the prototype Stepper primitive (_shared/modals.jsx:46-62): current step → blue
// numbered chip, completed steps → green ✓, connecting lines between steps.
function Stepper({ active, labels }: { active: Step; labels: BulkImportLabels }) {
  const steps: Array<[Step, string]> = [
    ['upload', labels.stepUpload],
    ['validate', labels.stepValidate],
    ['diff', labels.stepDiff],
    ['confirm', labels.stepConfirm],
  ];
  const activeIndex = STEP_ORDER.indexOf(active);
  return (
    <div aria-label="Import steps" className="wiz-stepper" data-testid="bulk-import-stepper">
      {steps.map(([key, label], i) => {
        const done = i < activeIndex;
        const current = active === key;
        return (
          <React.Fragment key={key}>
            <div
              aria-current={current ? 'step' : undefined}
              data-active={current ? 'true' : undefined}
              className={['wiz-step', done ? 'done' : '', current ? 'current' : ''].filter(Boolean).join(' ')}
            >
              <span className="wiz-step-num">{done ? '✓' : i + 1}</span>
              <span className="wiz-step-label">{label}</span>
            </div>
            {i < steps.length - 1 ? (
              <div className={['wiz-step-line', done ? 'done' : ''].filter(Boolean).join(' ')} />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
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
        <div role="alert" className="alert alert-red">
          <span aria-hidden="true">⚠</span> {errorKey}
        </div>
      ) : null}

      {committed ? (
        <div role="status" data-testid="bulk-import-applied" className="alert alert-green">
          <span aria-hidden="true">✓</span>
          <div>
            <span className="alert-title">{labels.applied}</span> · {committed.created} create / {committed.updated}{' '}
            update / {committed.skipped} skip / {committed.errors} errors
          </div>
        </div>
      ) : null}

      {step === 'upload' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="bulk-import-upload-h">
          <h2 id="bulk-import-upload-h" className="card-title">
            {labels.stepUpload}
          </h2>
          <div className="mt-4">
            <div className="ff">
              <label htmlFor="bulk-import-scope">{labels.scopeLabel}</label>
              <Select
                id="bulk-import-scope"
                aria-label={labels.scopeLabel}
                value={scope}
                onValueChange={(v) => setScope(v as ImportScope)}
                options={SCOPE_OPTIONS(labels)}
              />
            </div>
            <div className="ff">
              <label htmlFor="bulk-import-file">
                {labels.fileLabel}
                <span className="req">*</span>
              </label>
              <Input
                id="bulk-import-file"
                type="file"
                accept=".csv,text/csv"
                aria-label={labels.fileLabel}
                onChange={onFile}
                className="form-input"
                data-testid="bulk-import-file"
              />
              {filename ? <p className="ff-help mono">{filename}</p> : null}
            </div>
            <div className="alert alert-blue">
              <span aria-hidden="true">ⓘ</span> {labels.orgScopedNote}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="bulk-import-validate-cta"
              disabled={!csvText || pending}
              onClick={runPreview}
            >
              {pending ? '…' : `${labels.validateCta} →`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'validate' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="bulk-import-validate-h">
          <h2 id="bulk-import-validate-h" className="card-title">
            {labels.stepValidate}
          </h2>
          <div
            className="mt-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
            data-testid="bulk-import-validate-kpis"
          >
            <Kpi label={labels.rowsInFile} value={String(preview?.rowsInFile ?? 0)} tone="default" />
            <Kpi label={labels.errorsKpi} value={String(preview?.counts.errors ?? 0)} tone="red" />
            <Kpi label={labels.warningsKpi} value={String(preview?.counts.warnings ?? 0)} tone="amber" />
          </div>
          <Table aria-label="Validation issues" className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" style={{ width: 70 }}>
                  {labels.colRow}
                </TableHead>
                <TableHead scope="col" style={{ width: 110 }}>
                  {labels.colSeverity}
                </TableHead>
                <TableHead scope="col" style={{ width: 140 }}>
                  {labels.colColumn}
                </TableHead>
                <TableHead scope="col">{labels.colIssue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationRows.length ? (
                validationRows.map((iss, i) => (
                  <TableRow
                    key={i}
                    data-testid="bulk-import-issue-row"
                    style={
                      iss.kind === 'error'
                        ? { background: 'var(--red-050a)' }
                        : iss.kind === 'warning'
                          ? { background: 'var(--amber-050a)' }
                          : undefined
                    }
                  >
                    <TableCell className="mono text-sm">#{iss.rowNumber}</TableCell>
                    <TableCell>
                      <span
                        className={`badge ${iss.kind === 'error' ? 'badge-red' : iss.kind === 'warning' ? 'badge-amber' : 'badge-blue'}`}
                      >
                        {iss.kind}
                      </span>
                    </TableCell>
                    <TableCell className="mono text-sm">{iss.column}</TableCell>
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
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('upload')}>
              ← {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="bulk-import-diff-cta"
              disabled={hasErrors}
              onClick={() => setStep('diff')}
            >
              {labels.diffCta} →
            </button>
          </div>
        </section>
      ) : null}

      {step === 'diff' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="bulk-import-diff-h">
          <h2 id="bulk-import-diff-h" className="card-title">
            {labels.stepDiff}
          </h2>
          <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Kpi label={labels.createKpi} value={String(preview?.counts.create ?? 0)} tone="green" />
            <Kpi label={labels.updateKpi} value={String(preview?.counts.update ?? 0)} tone="amber" />
            <Kpi label={labels.noopKpi} value={String(preview?.counts.noop ?? 0)} tone="default" />
          </div>
          <Table aria-label="Import diff" className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" style={{ width: 140 }}>
                  {labels.colCode}
                </TableHead>
                <TableHead scope="col" style={{ width: 90 }}>
                  {labels.colOp}
                </TableHead>
                <TableHead scope="col" style={{ width: 180 }}>
                  {labels.colField}
                </TableHead>
                <TableHead scope="col">{labels.colChange}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(preview?.rows ?? [])
                .filter((r) => r.op !== 'error')
                .map((r) => (
                  <TableRow key={r.rowNumber} data-testid="bulk-import-diff-row">
                    <TableCell className="mono text-sm">{r.itemCode}</TableCell>
                    <TableCell>
                      <span
                        className={`badge ${r.op === 'create' ? 'badge-green' : r.op === 'update' ? 'badge-amber' : 'badge-gray'}`}
                      >
                        {r.op}
                      </span>
                    </TableCell>
                    <TableCell className="mono text-sm">{r.field}</TableCell>
                    <TableCell className="text-sm">
                      <span className="mono" style={{ color: 'var(--muted)' }}>
                        {r.before}
                      </span>
                      {' → '}
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {r.after}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {hasWarnings ? (
            <div className="alert alert-amber mt-3">
              <span aria-hidden="true">△</span> {labels.supplierBlocker}
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('validate')}>
              ← {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="bulk-import-confirm-cta"
              onClick={() => setStep('confirm')}
            >
              {labels.confirmCta} →
            </button>
          </div>
        </section>
      ) : null}

      {step === 'confirm' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="bulk-import-confirm-h">
          <h2 id="bulk-import-confirm-h" className="card-title">
            {labels.stepConfirm}
          </h2>
          <div className="ff mt-4">
            <label htmlFor="bulk-import-reason">
              {labels.reasonLabel}
              <span className="req">*</span>
            </label>
            <Textarea
              id="bulk-import-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={labels.reasonPlaceholder}
              data-testid="bulk-import-reason"
              rows={3}
            />
            <span className="ff-help">{labels.reasonHelp}</span>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('diff')}>
              ← {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
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

// Locked KPI tile (globals.css `.kpi` — 1px border + 6px radius + 3px coloured
// bottom accent, value Inter 26/700). Maps the prototype KPI tone scale.
function Kpi({ label, value, tone }: { label: string; value: string; tone: 'default' | 'red' | 'amber' | 'green' }) {
  return (
    <div className={['kpi', tone === 'default' ? '' : tone].filter(Boolean).join(' ')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tabular-nums">{value}</div>
    </div>
  );
}

export { STEP_ORDER };
