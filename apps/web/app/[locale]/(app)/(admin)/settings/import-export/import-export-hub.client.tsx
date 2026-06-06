'use client';

/**
 * Settings · Import / Export — master-data hub (NEW prototype).
 *
 * Canonical design: prototypes/design/Monopilot Design System/settings/import-export.jsx:60-144
 *   - filter chips (All / Importable / per-group)
 *   - .impex-table entity rows (record counts + last import)
 *   - slide-in .impex-drawer wizard (upload → map → preview, .impex-stepper)
 *   - recent-jobs cards (.impex-jobs / .impex-job-*)
 *
 * Real data: consumes ImportableEntityRow[] + ImportJobRow[] produced by
 * _actions/master-data.ts → getImportableEntities (public.items / bom_headers /
 * supplier_specs / import_export_jobs, org-scoped via RLS). No mock rows.
 *
 * Coexists with the existing SET-029 settings-entity hub
 * (import-export-screen.client.tsx) under a tabbed page shell — see page.tsx.
 * This component owns the distinct testid `settings-import-export-hub` so the
 * two screens never collide in the DOM (existing tests use
 * `settings-import-export-screen`).
 */

import React from 'react';

import type {
  ImportableEntityKey,
  ImportableEntityRow,
  ImportJobRow,
  ImportJobStatus,
} from './_actions/master-data';

export type MasterDataHubLabels = {
  title: string;
  subtitle: string;
  filters: {
    all: string;
    importable: string;
    masterData: string;
  };
  table: {
    entity: string;
    records: string;
    lastImport: string;
    recordsUnit: string;
    never: string;
    export: string;
    import: string;
    readOnly: string;
  };
  empty: string;
  error: string;
  jobs: {
    title: string;
    viewAll: string;
    rowsUnit: string;
    statusCompleted: string;
    statusRunning: string;
    statusQueued: string;
    statusFailed: string;
    kindImport: string;
    kindExport: string;
    none: string;
  };
  drawer: {
    importKicker: string;
    recordsLabel: string;
    close: string;
    stepUpload: string;
    stepMap: string;
    stepReview: string;
    dropTitle: string;
    dropHint: string;
    chooseFile: string;
    helpTitle: string;
    helpBody: string;
    downloadTemplate: string;
    uploadedRows: string;
    replace: string;
    mapTitle: string;
    csvColumn: string;
    monopilotField: string;
    sample: string;
    skipColumn: string;
    autoMatched: string;
    behaviourTitle: string;
    behaviourUpsert: string;
    behaviourUpsertDesc: string;
    behaviourCreate: string;
    behaviourCreateDesc: string;
    behaviourReplace: string;
    behaviourReplaceDesc: string;
    validationTitle: string;
    validationReady: string;
    validationOverwrite: string;
    validationErrors: string;
    previewTitle: string;
    previewStatusUpdate: string;
    previewStatusCreate: string;
    cancel: string;
    back: string;
    continue: string;
    nextReview: string;
    runImport: string;
    notWiredTitle: string;
    notWiredBody: string;
  };
};

export type MasterDataHubProps = {
  /** Org-scoped master-data entities (real rows). Empty → empty state. */
  entities: ImportableEntityRow[];
  /** Recent import jobs from public.import_export_jobs (real rows). */
  recentJobs: ImportJobRow[];
  /** When false the loader returned an error envelope → render error banner. */
  ok?: boolean;
  labels: MasterDataHubLabels;
};

type FilterKey = 'all' | 'importable' | 'master_data';

const ENTITY_ICON: Record<ImportableEntityKey, string> = {
  finished_goods: '▢',
  components: '◇',
  boms: '⛓',
  suppliers: '↔',
};

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function formatTimestamp(iso: string | null, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return never;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jobStatusClass(status: ImportJobStatus): string {
  // Map the data layer's status vocabulary onto the prototype's
  // done / warning / error border-left classes.
  if (status === 'completed') return 'impex-job-done';
  if (status === 'failed') return 'impex-job-error';
  return 'impex-job-warning';
}

function jobStatusLabel(status: ImportJobStatus, labels: MasterDataHubLabels): string {
  if (status === 'completed') return `✓ ${labels.jobs.statusCompleted}`;
  if (status === 'running') return `… ${labels.jobs.statusRunning}`;
  if (status === 'queued') return `• ${labels.jobs.statusQueued}`;
  return `✕ ${labels.jobs.statusFailed}`;
}

export default function ImportExportHub(props: MasterDataHubProps) {
  const { entities, recentJobs, labels } = props;
  const ok = props.ok ?? true;
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [drawerEntity, setDrawerEntity] = React.useState<ImportableEntityRow | null>(null);

  const visible = entities.filter((entity) => {
    if (filter === 'all') return true;
    if (filter === 'importable') return true; // all master-data entities are importable
    return true; // master_data group — every entity here belongs to it
  });

  return (
    <section
      data-testid="settings-import-export-hub"
      data-route="/settings/import-export"
      data-ux-source="settings-master-data-hub"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/import-export.jsx:60-144"
    >
      <div className="sg-head">
        <div>
          <div className="sg-title">{labels.title}</div>
          <div className="sg-sub">{labels.subtitle}</div>
        </div>
      </div>

      {!ok ? (
        <div role="alert" className="impex-job impex-job-error" data-testid="master-data-hub-error">
          <div className="impex-job-entity">{labels.error}</div>
        </div>
      ) : null}

      {/* Filter chips */}
      <div className="impex-filters" role="group" aria-label={labels.title}>
        <button
          type="button"
          className={'impex-chip' + (filter === 'all' ? ' active' : '')}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {labels.filters.all}
        </button>
        <button
          type="button"
          className={'impex-chip' + (filter === 'importable' ? ' active' : '')}
          aria-pressed={filter === 'importable'}
          onClick={() => setFilter('importable')}
        >
          {labels.filters.importable}
        </button>
        <span className="impex-divider" aria-hidden="true" />
        <button
          type="button"
          className={'impex-chip' + (filter === 'master_data' ? ' active' : '')}
          aria-pressed={filter === 'master_data'}
          onClick={() => setFilter('master_data')}
        >
          {labels.filters.masterData}
        </button>
      </div>

      {/* Entity table */}
      {visible.length === 0 ? (
        <div className="impex-table" data-testid="master-data-hub-empty">
          <div className="impex-row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="impex-desc">{labels.empty}</div>
          </div>
        </div>
      ) : (
        <div className="impex-table" role="table" aria-label={labels.title}>
          <div className="impex-thead" role="row">
            <div role="columnheader">{labels.table.entity}</div>
            <div role="columnheader">{labels.table.records}</div>
            <div role="columnheader">{labels.table.lastImport}</div>
            <div role="columnheader" aria-hidden="true" />
          </div>
          {visible.map((entity) => (
            <div key={entity.key} className="impex-row" role="row" data-entity={entity.key}>
              <div className="impex-entity" role="cell">
                <div className="impex-ic" aria-hidden="true">
                  {ENTITY_ICON[entity.key]}
                </div>
                <div>
                  <div className="impex-label">{entity.label}</div>
                  <div className="impex-meta">{labels.filters.masterData}</div>
                </div>
              </div>
              <div className="impex-count" role="cell">
                <div className="num">{formatCount(entity.row_count)}</div>
                <div className="muted">{labels.table.recordsUnit}</div>
              </div>
              <div className="muted" role="cell">
                {formatTimestamp(entity.last_imported_at, labels.table.never)}
              </div>
              <div className="impex-actions" role="cell">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setDrawerEntity(entity)}
                >
                  ↑ {labels.table.import}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent jobs */}
      <div className="sg-section">
        <div className="sg-section-head">
          <div className="sg-title" style={{ fontSize: 15 }}>
            {labels.jobs.title}
          </div>
          <span className="sg-sub">{labels.jobs.viewAll}</span>
        </div>
        <div className="sg-section-body">
          {recentJobs.length === 0 ? (
            <div className="impex-meta" data-testid="master-data-hub-jobs-empty">
              {labels.jobs.none}
            </div>
          ) : (
            <div className="impex-jobs" data-testid="master-data-hub-jobs">
              {recentJobs.map((job) => (
                <div key={job.id} className={'impex-job ' + jobStatusClass(job.status)} data-job-id={job.id}>
                  <div className="impex-job-id mono">{job.id}</div>
                  <div className="impex-job-kind kind-import">↑ {labels.jobs.kindImport}</div>
                  <div className="impex-job-entity">{job.entity_label}</div>
                  <div className="impex-job-rows mono">
                    {formatCount(job.rows_processed)} {labels.jobs.rowsUnit}
                  </div>
                  <div className="impex-job-who muted">{job.source_file_name ?? '—'}</div>
                  <div className="impex-job-when muted">
                    {formatTimestamp(job.created_at, '—')}
                  </div>
                  <div className={'impex-job-status status-' + job.status}>
                    {jobStatusLabel(job.status, labels)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer — import wizard */}
      {drawerEntity ? (
        <ImportDrawer entity={drawerEntity} labels={labels} onClose={() => setDrawerEntity(null)} />
      ) : null}
    </section>
  );
}

/**
 * Slide-in import wizard. UI-complete across the three prototype steps:
 *   1. Upload (functional file picker — captures the chosen file name + parses
 *      header row / sample rows from the CSV in-browser to drive steps 2/3)
 *   2. Map fields (CSV columns → MonoPilot fields, auto-match heuristic)
 *   3. Review & run (behaviour radios + validation summary + preview table)
 *
 * FLAG (drawer wizard depth): the upload step is functional (real file read +
 * parse), but there is NO server import action wired for master-data entities
 * yet — getImportableEntities only READS. "Run import" is therefore stubbed
 * (closes the drawer) with a visible TODO banner. Wiring a master-data import
 * action (insert into public.import_export_jobs + downstream processing) is a
 * follow-up once that action exists.
 */
function ImportDrawer({
  entity,
  labels,
  onClose,
}: {
  entity: ImportableEntityRow;
  labels: MasterDataHubLabels;
  onClose: () => void;
}) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = React.useState('');
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // MonoPilot target fields are not exposed by getImportableEntities (read-only
  // counts). The mapping/preview steps therefore echo the parsed CSV columns so
  // the wizard stays UI-complete against real uploaded data.
  const monopilotFields = headers;

  function parseCsv(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      setHeaders([]);
      setRows([]);
      return;
    }
    const split = (line: string) => line.split(',').map((c) => c.trim());
    setHeaders(split(lines[0]));
    setRows(lines.slice(1).map(split));
  }

  function onFileChosen(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    if (typeof file.text === 'function') {
      void file
        .text()
        .then((text) => {
          parseCsv(text);
          setStep(2);
        })
        .catch(() => {
          setHeaders([]);
          setRows([]);
          setStep(2);
        });
    } else {
      setStep(2);
    }
  }

  const stepLabels = [labels.drawer.stepUpload, labels.drawer.stepMap, labels.drawer.stepReview];

  return (
    <div className="impex-drawer-backdrop" onClick={onClose} data-testid="master-data-hub-drawer">
      <div className="impex-drawer" role="dialog" aria-label={entity.label} onClick={(e) => e.stopPropagation()}>
        <div className="impex-drawer-head">
          <div>
            <div className="impex-drawer-kicker">{labels.drawer.importKicker}</div>
            <div className="impex-drawer-title">{entity.label}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {formatCount(entity.row_count)} {labels.drawer.recordsLabel}
            </div>
          </div>
          <button
            type="button"
            className="impex-drawer-close"
            aria-label={labels.drawer.close}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="impex-drawer-body">
          <div className="impex-stepper" data-testid="master-data-hub-stepper">
            {stepLabels.map((label, i) => (
              <div
                key={label}
                className={'impex-step' + (step === i + 1 ? ' active' : '') + (step > i + 1 ? ' done' : '')}
                data-step={i + 1}
                aria-current={step === i + 1 ? 'step' : undefined}
              >
                <div className="impex-step-n">{step > i + 1 ? '✓' : i + 1}</div>
                <span>{label}</span>
                {i < 2 ? <div className="impex-step-line" /> : null}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div data-testid="master-data-hub-step-upload">
              <div
                className="impex-dropzone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
              >
                <div className="impex-drop-icon" aria-hidden="true">
                  ⤓
                </div>
                <div className="impex-drop-t">{labels.drawer.dropTitle}</div>
                <div className="impex-drop-d">{labels.drawer.dropHint}</div>
                <button type="button" className="btn btn-secondary" style={{ marginTop: 14 }}>
                  {labels.drawer.chooseFile}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                aria-label={labels.drawer.chooseFile}
                className="sr-only"
                style={{ display: 'none' }}
                onChange={(e) => onFileChosen(e.currentTarget.files?.[0])}
              />

              <div className="impex-help">
                <div className="impex-help-t">{labels.drawer.helpTitle.replace('{entity}', entity.label)}</div>
                <div className="impex-help-d">{labels.drawer.helpBody}</div>
                <button type="button" className="link">
                  ↓ {labels.drawer.downloadTemplate}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div data-testid="master-data-hub-step-map">
              <div className="impex-uploaded">
                <div className="impex-uploaded-ic" aria-hidden="true">
                  📄
                </div>
                <div style={{ flex: 1 }}>
                  <div className="impex-uploaded-name">{fileName || 'import.csv'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {labels.drawer.uploadedRows
                      .replace('{rows}', String(rows.length))
                      .replace('{cols}', String(headers.length))}
                  </div>
                </div>
                <button type="button" className="link" onClick={() => setStep(1)}>
                  {labels.drawer.replace}
                </button>
              </div>

              <div className="impex-section-h" style={{ marginTop: 20 }}>
                {labels.drawer.mapTitle}
              </div>
              <div className="impex-mapping">
                <div className="impex-mapping-head">
                  <div>{labels.drawer.csvColumn}</div>
                  <div />
                  <div>{labels.drawer.monopilotField}</div>
                  <div>{labels.drawer.sample}</div>
                </div>
                {headers.map((header, i) => {
                  const auto = monopilotFields.find((f) => f.toLowerCase() === header.toLowerCase());
                  return (
                    <div
                      key={header + i}
                      className={'impex-mapping-row' + (auto ? ' auto' : ' unmapped')}
                    >
                      <div className="impex-csv-col mono">{header}</div>
                      <div className="impex-arrow" aria-hidden="true">
                        →
                      </div>
                      <div>
                        <select defaultValue={auto ?? ''} aria-label={`${labels.drawer.monopilotField}: ${header}`}>
                          <option value="">— {labels.drawer.skipColumn} —</option>
                          {monopilotFields.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        {auto ? <div className="impex-auto">✓ {labels.drawer.autoMatched}</div> : null}
                      </div>
                      <div className="impex-csv-sample muted mono">{rows[0]?.[i] ?? ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div data-testid="master-data-hub-step-review">
              <div className="impex-section-h">{labels.drawer.behaviourTitle}</div>
              <div className="impex-radio-row">
                <label className="impex-radio active">
                  <input type="radio" name="master-data-import-mode" defaultChecked readOnly />
                  <div>
                    <div className="impex-radio-t">{labels.drawer.behaviourUpsert}</div>
                    <div className="impex-radio-d">{labels.drawer.behaviourUpsertDesc}</div>
                  </div>
                </label>
                <label className="impex-radio">
                  <input type="radio" name="master-data-import-mode" readOnly />
                  <div>
                    <div className="impex-radio-t">{labels.drawer.behaviourCreate}</div>
                    <div className="impex-radio-d">{labels.drawer.behaviourCreateDesc}</div>
                  </div>
                </label>
                <label className="impex-radio">
                  <input type="radio" name="master-data-import-mode" readOnly />
                  <div>
                    <div className="impex-radio-t">{labels.drawer.behaviourReplace}</div>
                    <div className="impex-radio-d">{labels.drawer.behaviourReplaceDesc}</div>
                  </div>
                </label>
              </div>

              <div className="impex-section-h" style={{ marginTop: 20 }}>
                {labels.drawer.validationTitle}
              </div>
              <div className="impex-validation">
                <div className="impex-vstat ok">
                  <div className="vstat-num">{rows.length}</div>
                  <div className="vstat-l">{labels.drawer.validationReady}</div>
                </div>
                <div className="impex-vstat warn">
                  <div className="vstat-num">0</div>
                  <div className="vstat-l">{labels.drawer.validationOverwrite}</div>
                </div>
                <div className="impex-vstat err">
                  <div className="vstat-num">0</div>
                  <div className="vstat-l">{labels.drawer.validationErrors}</div>
                </div>
              </div>

              <div className="impex-section-h" style={{ marginTop: 20 }}>
                {labels.drawer.previewTitle}
              </div>
              <div className="impex-preview">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {headers.map((h, i) => (
                        <th key={h + i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="muted mono">{i + 1}</td>
                        {r.map((c, j) => (
                          <td key={j} className="mono">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* FLAG: no server import action wired for master-data yet. */}
              <div className="impex-help" style={{ marginTop: 16 }} data-testid="master-data-hub-not-wired">
                <div className="impex-help-t">{labels.drawer.notWiredTitle}</div>
                <div className="impex-help-d">{labels.drawer.notWiredBody}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="impex-drawer-foot">
          <button type="button" className="link" onClick={onClose}>
            {labels.drawer.cancel}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              >
                ← {labels.drawer.back}
              </button>
            ) : null}
            {step < 3 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              >
                {step === 1 ? labels.drawer.continue : labels.drawer.nextReview}
              </button>
            ) : null}
            {step === 3 ? (
              // Stubbed: closes the drawer. No master-data import action exists.
              <button type="button" className="btn btn-primary" onClick={onClose}>
                ↑ {labels.drawer.runImport.replace('{rows}', String(rows.length))}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
