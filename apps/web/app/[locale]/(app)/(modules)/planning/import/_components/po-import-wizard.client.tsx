'use client';

/**
 * Wave E-IO (decision #6) — Bulk PO import: 4-step wizard client island.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, upload → validate → diff → confirm) — same
 *   `.wiz-stepper` / `.card` / `.kpi` / `.alert-*` / `.btn` design-system family
 *   already shipped by the Technical items/import wizard
 *   (technical/items/import/_components/bulk-import-wizard.client.tsx). Re-applied
 *   here for the PO domain so the two import flows are visually identical.
 *
 * Steps:
 *   1. upload    → pick a CSV, parse it client-side (parsePoCsv, no Server Action)
 *   2. validate  → call validatePoImport(rows) → per-row ok/error + a counter +
 *                  a [Download error report] of the failed rows
 *   3. preview   → how many POs will be created (grouped by supplier + external_ref)
 *                  + a mode toggle [All-or-nothing | Skip invalid]
 *   4. result    → commitPoImport(rows, {mode}) → created PO numbers (links) +
 *                  skipped / failed counts
 *
 * org_id is never read from the CSV — the actions re-validate server-side under
 * withOrgContext (fail-closed). All five UI states are exercised: loading
 * (pending transition + busy CTA), empty (no parsed rows), error (parse fail /
 * forbidden / action throw → alert), permission-denied (rendered by the page host
 * around this island), optimistic (busy CTA during the commit transition).
 */

import React from 'react';

import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv } from '../../../../../../../lib/shared/download';
import {
  PO_IMPORT_COLUMNS,
  buildPoErrorReportCsv,
  groupPoRows,
  parsePoCsv,
  type ParsedPoRow,
} from '../_lib/parse-po-csv';
import type {
  PoImportRow,
  PoValidationResponse,
  PoImportResponse,
} from '../../purchase-orders/_actions/import-po.types';

type Step = 'upload' | 'validate' | 'preview' | 'result';
const STEP_ORDER: Step[] = ['upload', 'validate', 'preview', 'result'];

function isImportForbidden(value: unknown): value is { ok: false; error: 'forbidden' } {
  return typeof value === 'object' && value !== null && 'error' in value && (value as { error: string }).error === 'forbidden';
}

export type CommitMode = 'all_or_nothing' | 'skip_invalid';

export type PoImportLabels = {
  stepUpload: string;
  stepValidate: string;
  stepPreview: string;
  stepResult: string;
  uploadTitle: string;
  fileLabel: string;
  orgScopedNote: string;
  selectedFile: string;
  validateCta: string;
  validateTitle: string;
  counter: string; // ICU: "{ok} ok / {failed} errors"
  rowsInFile: string;
  okKpi: string;
  errorsKpi: string;
  colRow: string;
  colStatus: string;
  colColumn: string;
  colIssue: string;
  statusOk: string;
  statusError: string;
  noRowErrors: string;
  downloadErrorReport: string;
  previewTitle: string;
  posToCreate: string;
  colExternalRef: string;
  colSupplier: string;
  colLines: string;
  modeLabel: string;
  modeAllOrNothing: string;
  modeSkipInvalid: string;
  modeHelpAllOrNothing: string;
  modeHelpSkipInvalid: string;
  commitCta: string;
  resultTitle: string;
  createdKpi: string;
  skippedKpi: string;
  failedKpi: string;
  createdHeading: string;
  skippedHeading: string;
  noCreated: string;
  viewPo: string;
  backCta: string;
  parseFailed: string;
  headerMismatch: string;
  forbidden: string;
  commitFailed: string;
  importAnother: string;
};

function Stepper({ active, labels }: { active: Step; labels: PoImportLabels }) {
  const steps: Array<[Step, string]> = [
    ['upload', labels.stepUpload],
    ['validate', labels.stepValidate],
    ['preview', labels.stepPreview],
    ['result', labels.stepResult],
  ];
  const activeIndex = STEP_ORDER.indexOf(active);
  return (
    <div aria-label={labels.stepUpload} className="wiz-stepper" data-testid="po-import-stepper">
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

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'default' | 'red' | 'amber' | 'green' }) {
  return (
    <div className={['kpi', tone === 'default' ? '' : tone].filter(Boolean).join(' ')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tabular-nums">{value}</div>
    </div>
  );
}

export type PoImportWizardProps = {
  locale: string;
  labels: PoImportLabels;
  validateAction: (rows: PoImportRow[]) => Promise<PoValidationResponse>;
  commitAction: (rows: PoImportRow[], options: { mode: CommitMode }) => Promise<PoImportResponse>;
  /** Static SSR/RTL injection — pins a step + parsed rows without parsing a file. */
  initialStep?: Step;
  initialRows?: ParsedPoRow[];
  initialValidation?: PoValidationResponse;
};

export function PoImportWizard(props: PoImportWizardProps) {
  const { locale, labels, validateAction, commitAction } = props;

  const [step, setStep] = React.useState<Step>(props.initialStep ?? 'upload');
  const [filename, setFilename] = React.useState('');
  const [parsedRows, setParsedRows] = React.useState<ParsedPoRow[]>(props.initialRows ?? []);
  const [validation, setValidation] = React.useState<PoValidationResponse | null>(props.initialValidation ?? null);
  const [mode, setMode] = React.useState<CommitMode>('all_or_nothing');
  const [result, setResult] = React.useState<PoImportResponse | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onFile = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFilename(file.name);
      setErrorKey(null);
      void file.text().then((text) => {
        const res = parsePoCsv(text);
        if (res.ok) {
          setParsedRows(res.rows);
        } else {
          setParsedRows([]);
          setErrorKey(res.error === 'header_mismatch' ? labels.headerMismatch : labels.parseFailed);
        }
      });
    },
    [labels.headerMismatch, labels.parseFailed],
  );

  const runValidate = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const res = await validateAction(parsedRows.map((p) => p.row));
        if ('error' in res && res.error === 'forbidden') {
          setErrorKey(labels.forbidden);
          return;
        }
        setValidation(res);
        setStep('validate');
      } catch {
        setErrorKey(labels.commitFailed);
      }
    });
  }, [labels.commitFailed, labels.forbidden, parsedRows, validateAction]);

  const runCommit = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const res = await commitAction(
          parsedRows.map((p) => p.row),
          { mode },
        );
        if ('error' in res && res.error === 'forbidden') {
          setErrorKey(labels.forbidden);
          return;
        }
        setResult(res);
        setStep('result');
      } catch {
        setErrorKey(labels.commitFailed);
      }
    });
  }, [commitAction, labels.commitFailed, labels.forbidden, mode, parsedRows]);

  const downloadErrorReport = React.useCallback(() => {
    if (!validation || isImportForbidden(validation)) return;
    downloadCsv(buildPoErrorReportCsv(parsedRows, validation.rows), 'po-import-errors.csv');
  }, [parsedRows, validation]);

  const validationData = validation && !isImportForbidden(validation) ? validation : null;
  const commitResult = result && !isImportForbidden(result) ? result : null;
  const summary = validationData?.summary ?? { total: parsedRows.length, ok: 0, failed: 0 };
  const counter = labels.counter.replace('{ok}', String(summary.ok)).replace('{failed}', String(summary.failed));
  const validationByRow = new Map<number, { ok: boolean; errors: Array<{ column: string; message: string }> }>(
    (validationData?.rows ?? []).map((r) => [r.rowNumber, { ok: r.ok, errors: r.errors }]),
  );
  const groups = groupPoRows(parsedRows);
  const poBase = `/${locale}/planning/purchase-orders`;

  return (
    <div data-screen="planning-po-import" className="flex flex-col gap-4">
      <Stepper active={step} labels={labels} />

      {errorKey ? (
        <div role="alert" data-testid="po-import-error" className="alert alert-red">
          <span aria-hidden="true">⚠</span> {errorKey}
        </div>
      ) : null}

      {step === 'upload' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="po-import-upload-h">
          <h2 id="po-import-upload-h" className="card-title">
            {labels.uploadTitle}
          </h2>
          <div className="mt-4">
            <div className="ff">
              <label htmlFor="po-import-file">
                {labels.fileLabel}
                <span className="req">*</span>
              </label>
              <input
                id="po-import-file"
                type="file"
                accept=".csv,text/csv"
                aria-label={labels.fileLabel}
                onChange={onFile}
                className="form-input"
                data-testid="po-import-file"
              />
              {filename ? (
                <p className="ff-help mono" data-testid="po-import-filename">
                  {labels.selectedFile}: {filename}
                </p>
              ) : null}
            </div>
            <div className="alert alert-blue">
              <span aria-hidden="true">ⓘ</span> {labels.orgScopedNote}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="po-import-validate-cta"
              disabled={parsedRows.length === 0 || pending}
              onClick={runValidate}
            >
              {pending ? '…' : `${labels.validateCta} →`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'validate' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="po-import-validate-h">
          <h2 id="po-import-validate-h" className="card-title">
            {labels.validateTitle}
          </h2>
          <div
            className="mt-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
            data-testid="po-import-validate-kpis"
          >
            <Kpi label={labels.rowsInFile} value={String(summary.total)} tone="default" />
            <Kpi label={labels.okKpi} value={String(summary.ok)} tone="green" />
            <Kpi label={labels.errorsKpi} value={String(summary.failed)} tone="red" />
          </div>
          <p className="mt-3 text-sm font-medium" data-testid="po-import-counter">
            {counter}
          </p>
          <Table aria-label={labels.validateTitle} className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" style={{ width: 70 }}>
                  {labels.colRow}
                </TableHead>
                <TableHead scope="col" style={{ width: 110 }}>
                  {labels.colStatus}
                </TableHead>
                <TableHead scope="col" style={{ width: 150 }}>
                  {labels.colColumn}
                </TableHead>
                <TableHead scope="col">{labels.colIssue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedRows.map((p) => {
                const r = validationByRow.get(p.rowNumber);
                const ok = r?.ok ?? true;
                const first = r?.errors[0];
                return (
                  <TableRow
                    key={p.rowNumber}
                    data-testid="po-import-row"
                    data-row-ok={ok ? 'true' : 'false'}
                    style={ok ? undefined : { background: 'var(--red-050a)' }}
                  >
                    <TableCell className="mono text-sm">#{p.rowNumber}</TableCell>
                    <TableCell>
                      <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>
                        {ok ? labels.statusOk : labels.statusError}
                      </span>
                    </TableCell>
                    <TableCell className="mono text-sm">{first ? first.column : '—'}</TableCell>
                    <TableCell className="text-sm">{first ? first.message : labels.noRowErrors}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('upload')}>
              ← {labels.backCta}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid="po-import-download-errors"
                disabled={summary.failed === 0}
                title={summary.failed === 0 ? labels.noRowErrors : undefined}
                onClick={downloadErrorReport}
              >
                {labels.downloadErrorReport}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="po-import-preview-cta"
                onClick={() => setStep('preview')}
              >
                {labels.stepPreview} →
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 'preview' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="po-import-preview-h">
          <h2 id="po-import-preview-h" className="card-title">
            {labels.previewTitle}
          </h2>
          <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Kpi label={labels.posToCreate} value={String(groups.length)} tone="green" />
            <Kpi label={labels.okKpi} value={String(summary.ok)} tone="default" />
          </div>
          <Table aria-label={labels.posToCreate} className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colExternalRef}</TableHead>
                <TableHead scope="col">{labels.colSupplier}</TableHead>
                <TableHead scope="col" style={{ width: 90 }}>
                  {labels.colLines}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={`${g.supplierCode} ${g.externalRef}`} data-testid="po-import-group-row">
                  <TableCell className="mono text-sm">{g.externalRef || '—'}</TableCell>
                  <TableCell className="mono text-sm">{g.supplierCode || '—'}</TableCell>
                  <TableCell className="tabular-nums text-sm">{g.lineCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ff mt-4">
            <label htmlFor="po-import-mode">{labels.modeLabel}</label>
            <Select
              id="po-import-mode"
              aria-label={labels.modeLabel}
              value={mode}
              onValueChange={(v) => setMode(v as CommitMode)}
              options={[
                { value: 'all_or_nothing', label: labels.modeAllOrNothing },
                { value: 'skip_invalid', label: labels.modeSkipInvalid },
              ]}
            />
            <span className="ff-help" data-testid="po-import-mode-help">
              {mode === 'all_or_nothing' ? labels.modeHelpAllOrNothing : labels.modeHelpSkipInvalid}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('validate')}>
              ← {labels.backCta}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="po-import-commit-cta"
              disabled={pending || parsedRows.length === 0}
              aria-busy={pending}
              onClick={runCommit}
            >
              {pending ? '…' : labels.commitCta}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'result' && commitResult ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby="po-import-result-h">
          <h2 id="po-import-result-h" className="card-title">
            {labels.resultTitle}
          </h2>
          <div
            className="mt-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
            data-testid="po-import-result-kpis"
          >
            <Kpi label={labels.createdKpi} value={String(commitResult.created.length)} tone="green" />
            <Kpi label={labels.skippedKpi} value={String(commitResult.skipped.length)} tone="amber" />
            <Kpi label={labels.failedKpi} value={String(commitResult.failed.length)} tone="red" />
          </div>

          <h3 className="mt-4 text-sm font-semibold">{labels.createdHeading}</h3>
          {commitResult.created.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1" data-testid="po-import-created-list">
              {commitResult.created.map((po) => (
                <li key={po.po_number}>
                  <a
                    className="link mono text-sm"
                    href={`${poBase}?q=${encodeURIComponent(po.po_number)}`}
                    data-testid="po-import-created-link"
                  >
                    {po.po_number}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="po-import-none-created">
              {labels.noCreated}
            </p>
          )}

          {commitResult.skipped.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-semibold">{labels.skippedHeading}</h3>
              <ul className="mt-2 flex flex-col gap-1" data-testid="po-import-skipped-list">
                {commitResult.skipped.map((s) => (
                  <li key={s.external_ref} className="text-sm">
                    <span className="mono">{s.external_ref}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <a className="btn btn-secondary btn-sm" href={poBase}>
              {labels.viewPo}
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="po-import-restart"
              onClick={() => {
                setStep('upload');
                setParsedRows([]);
                setValidation(null);
                setResult(null);
                setFilename('');
                setMode('all_or_nothing');
              }}
            >
              {labels.importAnother}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export { STEP_ORDER, PO_IMPORT_COLUMNS };
