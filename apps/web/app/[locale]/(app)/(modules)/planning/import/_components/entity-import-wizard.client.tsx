'use client';

/**
 * Wave E-IO — generic bulk-import wizard (upload → validate → preview → result),
 * shared by the Transfer Order and Work Order importers. Structurally identical
 * to the shipped PO wizard (po-import-wizard.client.tsx), which is kept verbatim
 * so the live PO flow and its tests stay byte-identical; this generalisation only
 * adds the per-entity hooks the PO flow never needed:
 *   - an entity `spec` (columns / coerce / grouping / template / error report)
 *   - configurable preview columns (warehouses + item for TO, FG + UoM for WO)
 *   - an optional per-row UoM-conversion cell in the validate table — the WO
 *     importer shows e.g. "100 each -> 50 kg" BEFORE commit so the planner sees
 *     the base quantity that will be created (lesson F-D08a). A WO row whose FG
 *     has no active BOM surfaces that backend reason ("no active BOM") in the
 *     issue column, like any other row error.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, upload → validate → diff → confirm) — same
 *   `.wiz-stepper` / `.card` / `.kpi` / `.alert-*` / `.btn` family used by the PO
 *   importer, re-applied so all three Planning import flows are visually identical.
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
  buildEntityErrorReportCsv,
  groupEntityRows,
  parseEntityCsv,
  type EntityCsvSpec,
  type ParsedEntityRow,
} from '../_lib/parse-entity-csv';

type Step = 'upload' | 'validate' | 'preview' | 'result';
const STEP_ORDER: Step[] = ['upload', 'validate', 'preview', 'result'];

export type CommitMode = 'all_or_nothing' | 'skip_invalid';

/** Optional per-row UoM conversion the backend may return (WO importer). */
export type RowConversion = { display: string };

/** Shape every entity validation result conforms to (PO/TO have no convertedQty). */
export type EntityValidationResult = {
  rows: Array<{
    rowNumber: number;
    ok: boolean;
    errors: Array<{ column: string; message: string }>;
    convertedQty?: RowConversion;
  }>;
  summary: { total: number; ok: number; failed: number };
};

export type EntityCommitResult<TCreated> = {
  created: TCreated[];
  skipped: Array<{ external_ref: string; reason: string }>;
  failed: Array<{ rowNumber: number; errors: Array<{ column: string; message: string }> }>;
};

export type EntityImportWizardLabels = {
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
  counter: string; // ICU-ish: "{ok} ok / {failed} errors"
  rowsInFile: string;
  okKpi: string;
  errorsKpi: string;
  colRow: string;
  colStatus: string;
  colColumn: string;
  colIssue: string;
  colConversion: string;
  statusOk: string;
  statusError: string;
  noRowErrors: string;
  downloadErrorReport: string;
  previewTitle: string;
  docsToCreate: string;
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
  viewList: string;
  backCta: string;
  parseFailed: string;
  headerMismatch: string;
  forbidden: string;
  commitFailed: string;
  importAnother: string;
};

/** Per-entity column definition for the preview-step group table. */
export type PreviewColumn<TRow> = {
  key: string;
  label: string;
  value: (row: TRow) => string;
  width?: number;
  mono?: boolean;
};

export type EntityImportWizardProps<TRow, TCreated> = {
  locale: string;
  testid: string;
  labels: EntityImportWizardLabels;
  spec: EntityCsvSpec<TRow>;
  /** Whether the validate table renders the UoM-conversion column (WO = true). */
  showConversion: boolean;
  /** Preview-step group-table columns (without the trailing line count). */
  previewColumns: PreviewColumn<TRow>[];
  /** Map a created document to its display number + the list-detail href. */
  createdNumber: (created: TCreated) => string;
  createdHref: (created: TCreated, listBase: string) => string;
  /** Path the result links + "Go to list" CTA point at (e.g. transfer-orders). */
  listPath: string;
  errorReportFilename: string;
  validateAction: (rows: TRow[]) => Promise<EntityValidationResult>;
  commitAction: (rows: TRow[], options: { mode: CommitMode }) => Promise<EntityCommitResult<TCreated>>;
  /** Static SSR/RTL injection — pins a step + parsed rows without parsing a file. */
  initialStep?: Step;
  initialRows?: ParsedEntityRow<TRow>[];
  initialValidation?: EntityValidationResult;
};

function Stepper({ active, labels, testid }: { active: Step; labels: EntityImportWizardLabels; testid: string }) {
  const steps: Array<[Step, string]> = [
    ['upload', labels.stepUpload],
    ['validate', labels.stepValidate],
    ['preview', labels.stepPreview],
    ['result', labels.stepResult],
  ];
  const activeIndex = STEP_ORDER.indexOf(active);
  return (
    <div aria-label={labels.stepUpload} className="wiz-stepper" data-testid={`${testid}-import-stepper`}>
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

export function EntityImportWizard<TRow, TCreated>(props: EntityImportWizardProps<TRow, TCreated>) {
  const {
    locale,
    testid,
    labels,
    spec,
    showConversion,
    previewColumns,
    createdNumber,
    createdHref,
    listPath,
    errorReportFilename,
    validateAction,
    commitAction,
  } = props;

  const [step, setStep] = React.useState<Step>(props.initialStep ?? 'upload');
  const [filename, setFilename] = React.useState('');
  const [parsedRows, setParsedRows] = React.useState<ParsedEntityRow<TRow>[]>(props.initialRows ?? []);
  const [validation, setValidation] = React.useState<EntityValidationResult | null>(props.initialValidation ?? null);
  const [mode, setMode] = React.useState<CommitMode>('all_or_nothing');
  const [result, setResult] = React.useState<EntityCommitResult<TCreated> | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onFile = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFilename(file.name);
      setErrorKey(null);
      void file.text().then((text) => {
        const res = parseEntityCsv(text, spec);
        if (res.ok) {
          setParsedRows(res.rows);
        } else {
          setParsedRows([]);
          setErrorKey(res.error === 'header_mismatch' ? labels.headerMismatch : labels.parseFailed);
        }
      });
    },
    [labels.headerMismatch, labels.parseFailed, spec],
  );

  const runValidate = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const res = await validateAction(parsedRows.map((p) => p.row));
        setValidation(res);
        setStep('validate');
      } catch {
        setErrorKey(labels.forbidden);
      }
    });
  }, [labels.forbidden, parsedRows, validateAction]);

  const runCommit = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const res = await commitAction(
          parsedRows.map((p) => p.row),
          { mode },
        );
        setResult(res);
        setStep('result');
      } catch {
        // The action throws only on a permission failure; any other rejection
        // surfaces as the generic commit-failed message.
        setErrorKey(labels.commitFailed);
      }
    });
  }, [commitAction, labels.commitFailed, mode, parsedRows]);

  const downloadErrorReport = React.useCallback(() => {
    if (!validation) return;
    downloadCsv(buildEntityErrorReportCsv(parsedRows, validation.rows, spec), errorReportFilename);
  }, [errorReportFilename, parsedRows, spec, validation]);

  const summary = validation?.summary ?? { total: parsedRows.length, ok: 0, failed: 0 };
  const counter = labels.counter.replace('{ok}', String(summary.ok)).replace('{failed}', String(summary.failed));
  const validationByRow = new Map<
    number,
    { ok: boolean; errors: Array<{ column: string; message: string }>; convertedQty?: RowConversion }
  >((validation?.rows ?? []).map((r) => [r.rowNumber, { ok: r.ok, errors: r.errors, convertedQty: r.convertedQty }]));
  const groups = groupEntityRows(parsedRows, spec);
  const listBase = `/${locale}${listPath}`;
  const conversionColSpan = showConversion ? 5 : 4;

  return (
    <div data-screen={`planning-${testid}-import`} className="flex flex-col gap-4">
      <Stepper active={step} labels={labels} testid={testid} />

      {errorKey ? (
        <div role="alert" data-testid={`${testid}-import-error`} className="alert alert-red">
          <span aria-hidden="true">⚠</span> {errorKey}
        </div>
      ) : null}

      {step === 'upload' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby={`${testid}-import-upload-h`}>
          <h2 id={`${testid}-import-upload-h`} className="card-title">
            {labels.uploadTitle}
          </h2>
          <div className="mt-4">
            <div className="ff">
              <label htmlFor={`${testid}-import-file`}>
                {labels.fileLabel}
                <span className="req">*</span>
              </label>
              <input
                id={`${testid}-import-file`}
                type="file"
                accept=".csv,text/csv"
                aria-label={labels.fileLabel}
                onChange={onFile}
                className="form-input"
                data-testid={`${testid}-import-file`}
              />
              {filename ? (
                <p className="ff-help mono" data-testid={`${testid}-import-filename`}>
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
              data-testid={`${testid}-import-validate-cta`}
              disabled={parsedRows.length === 0 || pending}
              onClick={runValidate}
            >
              {pending ? '…' : `${labels.validateCta} →`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'validate' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby={`${testid}-import-validate-h`}>
          <h2 id={`${testid}-import-validate-h`} className="card-title">
            {labels.validateTitle}
          </h2>
          <div
            className="mt-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
            data-testid={`${testid}-import-validate-kpis`}
          >
            <Kpi label={labels.rowsInFile} value={String(summary.total)} tone="default" />
            <Kpi label={labels.okKpi} value={String(summary.ok)} tone="green" />
            <Kpi label={labels.errorsKpi} value={String(summary.failed)} tone="red" />
          </div>
          <p className="mt-3 text-sm font-medium" data-testid={`${testid}-import-counter`}>
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
                {showConversion ? (
                  <TableHead scope="col" style={{ width: 180 }}>
                    {labels.colConversion}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={conversionColSpan} className="text-sm text-muted-foreground">
                    {labels.noRowErrors}
                  </TableCell>
                </TableRow>
              ) : (
                parsedRows.map((p) => {
                  const r = validationByRow.get(p.rowNumber);
                  const ok = r?.ok ?? true;
                  const first = r?.errors[0];
                  return (
                    <TableRow
                      key={p.rowNumber}
                      data-testid={`${testid}-import-row`}
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
                      {showConversion ? (
                        <TableCell className="mono text-sm" data-testid={`${testid}-import-conversion`}>
                          {r?.convertedQty?.display ?? '—'}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
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
                data-testid={`${testid}-import-download-errors`}
                disabled={summary.failed === 0}
                title={summary.failed === 0 ? labels.noRowErrors : undefined}
                onClick={downloadErrorReport}
              >
                {labels.downloadErrorReport}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid={`${testid}-import-preview-cta`}
                onClick={() => setStep('preview')}
              >
                {labels.stepPreview} →
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 'preview' ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby={`${testid}-import-preview-h`}>
          <h2 id={`${testid}-import-preview-h`} className="card-title">
            {labels.previewTitle}
          </h2>
          <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Kpi label={labels.docsToCreate} value={String(groups.length)} tone="green" />
            <Kpi label={labels.okKpi} value={String(summary.ok)} tone="default" />
          </div>
          <Table aria-label={labels.docsToCreate} className="mt-3">
            <TableHeader>
              <TableRow>
                {previewColumns.map((col) => (
                  <TableHead key={col.key} scope="col" style={col.width ? { width: col.width } : undefined}>
                    {col.label}
                  </TableHead>
                ))}
                <TableHead scope="col" style={{ width: 90 }}>
                  {labels.colLines}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.key} data-testid={`${testid}-import-group-row`}>
                  {previewColumns.map((col) => (
                    <TableCell key={col.key} className={`${col.mono ? 'mono ' : ''}text-sm`}>
                      {col.value(g.firstRow) || '—'}
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums text-sm">{g.lineCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ff mt-4">
            <label htmlFor={`${testid}-import-mode`}>{labels.modeLabel}</label>
            <Select
              id={`${testid}-import-mode`}
              aria-label={labels.modeLabel}
              value={mode}
              onValueChange={(v) => setMode(v as CommitMode)}
              options={[
                { value: 'all_or_nothing', label: labels.modeAllOrNothing },
                { value: 'skip_invalid', label: labels.modeSkipInvalid },
              ]}
            />
            <span className="ff-help" data-testid={`${testid}-import-mode-help`}>
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
              data-testid={`${testid}-import-commit-cta`}
              disabled={pending || parsedRows.length === 0}
              aria-busy={pending}
              onClick={runCommit}
            >
              {pending ? '…' : labels.commitCta}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'result' && result ? (
        <section className="card" style={{ padding: 18 }} aria-labelledby={`${testid}-import-result-h`}>
          <h2 id={`${testid}-import-result-h`} className="card-title">
            {labels.resultTitle}
          </h2>
          <div
            className="mt-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
            data-testid={`${testid}-import-result-kpis`}
          >
            <Kpi label={labels.createdKpi} value={String(result.created.length)} tone="green" />
            <Kpi label={labels.skippedKpi} value={String(result.skipped.length)} tone="amber" />
            <Kpi label={labels.failedKpi} value={String(result.failed.length)} tone="red" />
          </div>

          <h3 className="mt-4 text-sm font-semibold">{labels.createdHeading}</h3>
          {result.created.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1" data-testid={`${testid}-import-created-list`}>
              {result.created.map((created) => {
                const number = createdNumber(created);
                return (
                  <li key={number}>
                    <a
                      className="link mono text-sm"
                      href={createdHref(created, listBase)}
                      data-testid={`${testid}-import-created-link`}
                    >
                      {number}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground" data-testid={`${testid}-import-none-created`}>
              {labels.noCreated}
            </p>
          )}

          {result.skipped.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-semibold">{labels.skippedHeading}</h3>
              <ul className="mt-2 flex flex-col gap-1" data-testid={`${testid}-import-skipped-list`}>
                {result.skipped.map((s) => (
                  <li key={s.external_ref} className="text-sm">
                    <span className="mono">{s.external_ref}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <a className="btn btn-secondary btn-sm" href={listBase}>
              {labels.viewList}
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid={`${testid}-import-restart`}
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

export { STEP_ORDER };
