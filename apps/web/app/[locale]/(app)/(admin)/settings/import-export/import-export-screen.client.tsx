'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export type EntityKey =
  | 'users'
  | 'roles'
  | 'invitations'
  | 'reference_tables'
  | 'infrastructure'
  | 'feature_flags'
  | 'authorization_policies';

export type ExportFormat = 'csv' | 'xlsx';
export type PageState = 'ready' | 'loading' | 'empty' | 'error';

export type SettingsImportExportEntity = {
  key: EntityKey;
  label: string;
  importSupported: boolean;
  exportSupported: boolean;
  requiredPermissions: string[];
  templateAvailable: boolean;
  processingMode: 'sync' | 'async';
  auditRequired: boolean;
  referenceHandoffHref?: string;
};

export type RecentJob = {
  id: string;
  entity: string;
  type: 'import' | 'export';
  status: 'queued' | 'running' | 'completed' | 'failed';
  rows: number | null;
  auditReason?: string;
};

export type ExportSettingsEntity = (
  input: { entity: EntityKey; format: ExportFormat },
) => Promise<{ ok: true; downloadHref: string } | { ok: false; message: string }>;

export type PreflightAuthorizationPolicyImport = (
  input: { fileName: string; auditReason: string },
) => Promise<{ ok: true; dryRunId: string } | { ok: false; blockers: string[] }>;

export type ImportExportLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  permissionDenied: string;
  entityLabel: string;
  states: {
    loading: string;
    empty: string;
    error: string;
    noRows: string;
  };
  entities: {
    users: string;
    roles: string;
    invitations: string;
    referenceTables: string;
    infrastructure: string;
    featureFlags: string;
    authorizationPolicies: string;
  };
  capabilities: {
    importExport: string;
    exportOnly: string;
    importSupported: string;
    exportSupported: string;
    template: string;
    noTemplate: string;
    sync: string;
    async: string;
    referenceHandoff: string;
    auditDryRunRequired: string;
  };
  alerts: {
    unsupportedImport: string;
    authorizationPolicy: string;
  };
  importCard: {
    title: string;
    description: string;
    requiredPermission: string;
    processing: string;
    audit: string;
    template: string;
    asyncJob: string;
    synchronous: string;
    auditRequired: string;
    noAuditMutation: string;
    templateAvailable: string;
    noTemplate: string;
    downloadTemplate: string;
    dropzone: string;
    fileLimit: string;
    fileAria: string;
    auditReason: string;
    auditReasonPlaceholder: string;
    runDryRun: string;
    continueReference: string;
    startImport: string;
    csvRequired: string;
    auditReasonRequired: string;
    dryRunPassed: string;
    dedicatedFlowRequired: string;
    preflightUnavailable: string;
  };
  exportCard: {
    title: string;
    description: string;
    format: string;
    exportNow: string;
    exporting: string;
    downloadExport: string;
  };
  jobs: {
    title: string;
    description: string;
    tableLabel: string;
    id: string;
    entity: string;
    type: string;
    status: string;
    rows: string;
    auditReason: string;
    importType: string;
    exportType: string;
    queued: string;
    running: string;
    completed: string;
    failed: string;
  };
};

export type ImportExportScreenProps = {
  entities: SettingsImportExportEntity[];
  visiblePermissions: string[];
  recentJobs: RecentJob[];
  state: PageState;
  labels: ImportExportLabels;
  exportSettingsEntity: ExportSettingsEntity;
  preflightAuthorizationPolicyImport?: PreflightAuthorizationPolicyImport;
};

function hasRequiredPermission(entity: SettingsImportExportEntity, visiblePermissions: string[]) {
  if (visiblePermissions.length === 0) return false;
  return entity.requiredPermissions.every((permission) => visiblePermissions.includes(permission));
}

function optionText(entity: SettingsImportExportEntity, labels: ImportExportLabels) {
  const capability = entity.importSupported ? labels.capabilities.importExport : labels.capabilities.exportOnly;
  const template = entity.templateAvailable ? labels.capabilities.template : labels.capabilities.noTemplate;
  const processing = entity.processingMode === 'async' ? labels.capabilities.async : labels.capabilities.sync;
  const suffix = entity.key === 'reference_tables'
    ? ` ${labels.capabilities.referenceHandoff}`
    : entity.key === 'authorization_policies'
      ? ` ${labels.capabilities.auditDryRunRequired}`
      : '';
  return `${entity.label} ${capability} ${entity.requiredPermissions.join(', ')} ${processing} ${template}${suffix}`;
}

function statusText(state: PageState, labels: ImportExportLabels) {
  if (state === 'loading') return labels.states.loading;
  if (state === 'empty') return labels.states.empty;
  if (state === 'error') return labels.states.error;
  return null;
}

function jobStatusClass(status: RecentJob['status']) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function jobStatusText(status: RecentJob['status'], labels: ImportExportLabels) {
  if (status === 'completed') return labels.jobs.completed;
  if (status === 'failed') return labels.jobs.failed;
  if (status === 'running') return labels.jobs.running;
  return labels.jobs.queued;
}

function jobTypeText(type: RecentJob['type'], labels: ImportExportLabels) {
  return type === 'import' ? labels.jobs.importType : labels.jobs.exportType;
}

function exportLinkLabel(entity: SettingsImportExportEntity, labels: ImportExportLabels) {
  return labels.exportCard.downloadExport.replace('{entity}', entity.label.toLowerCase());
}

function unsupportedImportMessage(entity: SettingsImportExportEntity, labels: ImportExportLabels) {
  return labels.alerts.unsupportedImport.replace('{entity}', entity.label);
}

function formatDryRunPassed(labels: ImportExportLabels, dryRunId: string) {
  return labels.importCard.dryRunPassed.replace('{dryRunId}', dryRunId);
}

function formatBlockers(blockers: string[], labels: ImportExportLabels) {
  return blockers.map((blocker) => (blocker === 'preflight_unavailable' ? labels.importCard.preflightUnavailable : blocker)).join(' ');
}

export default function SettingsImportExportScreen(props: ImportExportScreenProps) {
  const router = useRouter();
  const { entities, labels } = props;
  const visibleEntities = entities.filter((entity) => hasRequiredPermission(entity, props.visiblePermissions));
  const initialEntityKey = visibleEntities[0]?.key ?? entities[0]?.key ?? 'users';
  const [selectedEntityKey, setSelectedEntityKey] = React.useState<EntityKey>(initialEntityKey);
  const [fileName, setFileName] = React.useState<string>('');
  const [format, setFormat] = React.useState<ExportFormat>('csv');
  const [auditReason, setAuditReason] = React.useState('');
  const [dryRunId, setDryRunId] = React.useState('');
  const [dryRunError, setDryRunError] = React.useState('');
  const [exportHref, setExportHref] = React.useState('');
  const [exportError, setExportError] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);

  React.useEffect(() => {
    if (!visibleEntities.some((entity) => entity.key === selectedEntityKey) && visibleEntities[0]) {
      setSelectedEntityKey(visibleEntities[0].key);
    }
  }, [selectedEntityKey, visibleEntities]);

  const selectedEntity = entities.find((entity) => entity.key === selectedEntityKey) ?? visibleEntities[0] ?? entities[0];
  const stateMessage = statusText(props.state, labels);

  if (!selectedEntity || visibleEntities.length === 0) {
    return (
      <main
        data-testid="settings-import-export-screen"
        data-route="/settings/import-export"
        data-ux-source="SET-029"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:247-383"
        className="space-y-4 p-6 text-slate-950"
      >
        <header data-region="page-head" className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{labels.eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            {labels.subtitle}
          </p>
        </header>
        <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {labels.permissionDenied}
        </section>
      </main>
    );
  }

  const isAuthorizationPolicy = selectedEntity.key === 'authorization_policies';
  const hasReviewedAuthorizationPreflight = typeof props.preflightAuthorizationPolicyImport === 'function';
  const canUpload = selectedEntity.importSupported;
  const canStartImport = canUpload && Boolean(fileName) && (!isAuthorizationPolicy || Boolean(dryRunId));

  function updateEntity(nextKey: EntityKey) {
    setSelectedEntityKey(nextKey);
    setFileName('');
    setAuditReason('');
    setDryRunId('');
    setDryRunError('');
    setExportHref('');
    setExportError('');
  }

  async function runAuthorizationPreflight() {
    if (!fileName) {
      setDryRunError(labels.importCard.csvRequired);
      return;
    }
    if (!auditReason.trim()) {
      setDryRunError(labels.importCard.auditReasonRequired);
      return;
    }

    if (!hasReviewedAuthorizationPreflight) {
      setDryRunError(labels.importCard.preflightUnavailable);
      return;
    }

    const preflightAuthorizationPolicyImport = props.preflightAuthorizationPolicyImport;
    if (typeof preflightAuthorizationPolicyImport !== 'function') return;
    const result = await preflightAuthorizationPolicyImport({ fileName, auditReason: auditReason.trim() });
    if (result.ok === true) {
      setDryRunError('');
      setDryRunId(result.dryRunId);
    } else {
      setDryRunId('');
      setDryRunError(formatBlockers(result.blockers, labels));
    }
  }

  async function exportEntity() {
    setIsExporting(true);
    setExportHref('');
    setExportError('');
    const result = await props.exportSettingsEntity({ entity: selectedEntity.key, format });
    setIsExporting(false);
    if (result.ok === true) {
      setExportHref(result.downloadHref);
    } else {
      setExportError(result.message);
    }
  }

  function continueImport() {
    if (selectedEntity.referenceHandoffHref) {
      router.push(selectedEntity.referenceHandoffHref);
      return;
    }
    if (canStartImport) {
      setDryRunError(labels.importCard.dedicatedFlowRequired);
    }
  }

  return (
    <main
      data-testid="settings-import-export-screen"
      data-route="/settings/import-export"
      data-ux-source="SET-029"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:247-383"
      className="space-y-4 p-6 text-slate-950"
      aria-busy={props.state === 'loading'}
    >
      <header data-region="page-head" className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{labels.eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          {labels.subtitle}
        </p>
      </header>

      {stateMessage ? (
        <section role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {stateMessage}
        </section>
      ) : null}

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-import-export-entity">
        {labels.entityLabel}
      </label>
      <select
        id="settings-import-export-entity"
        aria-label={labels.entityLabel}
        value={selectedEntity.key}
        onChange={(event) => updateEntity(event.currentTarget.value as EntityKey)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {visibleEntities.map((entity) => (
          <option key={entity.key} value={entity.key}>
            {optionText(entity, labels)}
          </option>
        ))}
      </select>

      {!selectedEntity.importSupported ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {unsupportedImportMessage(selectedEntity, labels)}
        </div>
      ) : isAuthorizationPolicy ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {hasReviewedAuthorizationPreflight
            ? labels.alerts.authorizationPolicy
            : labels.importCard.preflightUnavailable}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          role="region"
          aria-labelledby="settings-import-card-title"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="settings-import-card-title" className="text-lg font-semibold">{labels.importCard.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{labels.importCard.description}</p>
            </div>
            <CapabilityBadge entity={selectedEntity} mode="import" labels={labels} />
          </div>

          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label={labels.importCard.requiredPermission} value={selectedEntity.requiredPermissions.join(', ')} />
            <Detail label={labels.importCard.processing} value={selectedEntity.processingMode === 'async' ? labels.importCard.asyncJob : labels.importCard.synchronous} />
            <Detail label={labels.importCard.audit} value={selectedEntity.auditRequired ? labels.importCard.auditRequired : labels.importCard.noAuditMutation} />
            <Detail label={labels.importCard.template} value={selectedEntity.templateAvailable ? labels.importCard.templateAvailable : labels.importCard.noTemplate} />
          </dl>

          {selectedEntity.templateAvailable ? (
            <a
              href={`/api/settings/import-export/templates/${selectedEntity.key}.csv`}
              className="mb-4 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {labels.importCard.downloadTemplate}
            </a>
          ) : null}

          {canUpload ? (
            <label
              htmlFor="settings-import-export-csv-file"
              className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm ${fileName ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-600'}`}
            >
              <span className="block text-2xl" aria-hidden="true">{fileName ? '✓' : '📄'}</span>
              <span className="mt-2 block font-medium">{fileName || labels.importCard.dropzone}</span>
              <span className="mt-1 block text-xs text-slate-500">{labels.importCard.fileLimit}</span>
              <input
                id="settings-import-export-csv-file"
                aria-label={labels.importCard.fileAria}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  setFileName(event.currentTarget.files?.[0]?.name ?? '');
                  setDryRunId('');
                  setDryRunError('');
                }}
              />
            </label>
          ) : null}

          {isAuthorizationPolicy ? (
            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-import-export-audit-reason">
                {labels.importCard.auditReason}
              </label>
              <textarea
                id="settings-import-export-audit-reason"
                aria-label={labels.importCard.auditReason}
                value={auditReason}
                onChange={(event) => setAuditReason(event.currentTarget.value)}
                className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={labels.importCard.auditReasonPlaceholder}
              />
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void runAuthorizationPreflight()}
                disabled={!hasReviewedAuthorizationPreflight}
              >
                {labels.importCard.runDryRun}
              </button>
              {dryRunError ? <p className="text-sm text-red-700">{dryRunError}</p> : null}
              {dryRunId ? <p className="text-sm font-medium text-emerald-700">{formatDryRunPassed(labels, dryRunId)}</p> : null}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canStartImport && !selectedEntity.referenceHandoffHref}
              onClick={continueImport}
            >
              {selectedEntity.referenceHandoffHref ? labels.importCard.continueReference : labels.importCard.startImport}
            </button>
          </div>
        </section>

        <section
          role="region"
          aria-labelledby="settings-export-card-title"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="settings-export-card-title" className="text-lg font-semibold">{labels.exportCard.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{labels.exportCard.description}</p>
            </div>
            <CapabilityBadge entity={selectedEntity} mode="export" labels={labels} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">{labels.exportCard.format}</legend>
            <label className="mr-4 inline-flex items-center gap-2 text-sm">
              <input type="radio" name="settings-export-format" checked={format === 'csv'} onChange={() => setFormat('csv')} />
              CSV
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="settings-export-format" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} />
              XLSX
            </label>
          </fieldset>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!selectedEntity.exportSupported || isExporting}
              onClick={() => void exportEntity()}
            >
              {isExporting ? labels.exportCard.exporting : labels.exportCard.exportNow}
            </button>
            {exportHref ? (
              <a href={exportHref} className="text-sm font-medium text-blue-700 underline">
                {exportLinkLabel(selectedEntity, labels)}
              </a>
            ) : null}
            {exportError ? <p className="text-sm text-red-700">{exportError}</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{labels.jobs.title}</h2>
          <p className="text-sm text-slate-600">{labels.jobs.description}</p>
        </div>
        <div className="overflow-x-auto">
          <table aria-label={labels.jobs.tableLabel} className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">{labels.jobs.id}</th>
                <th scope="col" className="px-3 py-2">{labels.jobs.entity}</th>
                <th scope="col" className="px-3 py-2">{labels.jobs.type}</th>
                <th scope="col" className="px-3 py-2">{labels.jobs.status}</th>
                <th scope="col" className="px-3 py-2">{labels.jobs.rows}</th>
                <th scope="col" className="px-3 py-2">{labels.jobs.auditReason}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {props.recentJobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2 font-mono font-semibold">{job.id}</td>
                  <td className="px-3 py-2">{job.entity}</td>
                  <td className="px-3 py-2 capitalize">{jobTypeText(job.type, labels)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${jobStatusClass(job.status)}`}>
                      {jobStatusText(job.status, labels)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{job.rows ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{job.auditReason ?? '—'}</td>
                </tr>
              ))}
              {props.recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">{labels.states.noRows}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CapabilityBadge({ entity, mode, labels }: { entity: SettingsImportExportEntity; mode: 'import' | 'export'; labels: ImportExportLabels }) {
  const supported = mode === 'import' ? entity.importSupported : entity.exportSupported;
  const text = supported ? (mode === 'import' ? labels.capabilities.importSupported : labels.capabilities.exportSupported) : labels.capabilities.exportOnly;
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${supported ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      {text}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-slate-800">{value}</dd>
    </div>
  );
}
