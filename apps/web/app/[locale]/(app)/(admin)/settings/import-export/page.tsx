'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { startExportJob } from '../../../../../../actions/import-export/export';

type EntityKey =
  | 'users'
  | 'roles'
  | 'invitations'
  | 'reference_tables'
  | 'infrastructure'
  | 'feature_flags'
  | 'authorization_policies';

type ExportFormat = 'csv' | 'xlsx';
type PageState = 'ready' | 'loading' | 'empty' | 'error';

type SettingsImportExportEntity = {
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

type RecentJob = {
  id: string;
  entity: string;
  type: 'import' | 'export';
  status: 'queued' | 'running' | 'completed' | 'failed';
  rows: number | null;
  auditReason?: string;
};

type ExportSettingsEntity = (
  input: { entity: EntityKey; format: ExportFormat },
) => Promise<{ ok: true; downloadHref: string } | { ok: false; message: string }>;

type PreflightAuthorizationPolicyImport = (
  input: { fileName: string; auditReason: string },
) => Promise<{ ok: true; dryRunId: string } | { ok: false; blockers: string[] }>;

type ImportExportPageProps = {
  params?: Promise<{ locale: string }>;
  entities?: SettingsImportExportEntity[];
  visiblePermissions?: string[];
  recentJobs?: RecentJob[];
  state?: PageState;
  exportSettingsEntity?: ExportSettingsEntity;
  preflightAuthorizationPolicyImport?: PreflightAuthorizationPolicyImport;
};

// Explicit fallback provenance: Settings entity capabilities from SET-029 and PO amendment 2026-05-03.
// Runtime callers can replace these rows with permission-filtered live/API configuration as backend actions mature.
const DEFAULT_ENTITIES: SettingsImportExportEntity[] = [
  {
    key: 'users',
    label: 'Users',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.users.invite'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'roles',
    label: 'Roles',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.roles.assign'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'invitations',
    label: 'Invitations',
    importSupported: false,
    exportSupported: true,
    requiredPermissions: ['settings.users.invite'],
    templateAvailable: false,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'reference_tables',
    label: 'Reference tables',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.reference.edit'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
    referenceHandoffHref: '/en/settings/reference/allergens_reference/import',
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    importSupported: false,
    exportSupported: true,
    requiredPermissions: ['settings.infrastructure.manage'],
    templateAvailable: false,
    processingMode: 'async',
    auditRequired: true,
  },
  {
    key: 'feature_flags',
    label: 'Feature flags',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.flags.edit'],
    templateAvailable: true,
    processingMode: 'async',
    auditRequired: true,
  },
  {
    key: 'authorization_policies',
    label: 'Authorization policies',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.authorization.edit'],
    templateAvailable: true,
    processingMode: 'async',
    auditRequired: true,
  },
];

const DEFAULT_JOBS: RecentJob[] = [
  { id: 'IMP-0042', entity: 'Reference tables', type: 'import', status: 'completed', rows: 48, auditReason: 'quarterly reference refresh' },
  { id: 'EXP-0041', entity: 'Users', type: 'export', status: 'completed', rows: 10 },
  { id: 'IMP-0040', entity: 'Authorization policies', type: 'import', status: 'failed', rows: null, auditReason: 'segregation-of-duties validation' },
];

async function defaultExportSettingsEntity(input: { entity: EntityKey; format: ExportFormat }) {
  const result = await startExportJob({ target: input.entity, filters: { format: input.format } });
  if (result.ok === false) {
    return { ok: false as const, message: result.error };
  }
  return {
    ok: true as const,
    downloadHref: result.data.job.download?.url ?? `/api/settings/import-export/jobs/${result.data.job.id}`,
  };
}

async function defaultPreflightAuthorizationPolicyImport() {
  return { ok: false as const, blockers: ['T-122 preflight service is not configured for this environment.'] };
}

function hasRequiredPermission(entity: SettingsImportExportEntity, visiblePermissions: string[]) {
  if (visiblePermissions.length === 0) return false;
  return entity.requiredPermissions.every((permission) => visiblePermissions.includes(permission));
}

function optionText(entity: SettingsImportExportEntity) {
  const capability = entity.importSupported ? 'Import + export' : 'Export only';
  const template = entity.templateAvailable ? 'Template' : 'No template';
  const processing = entity.processingMode === 'async' ? 'Async' : 'Sync';
  const suffix = entity.key === 'reference_tables'
    ? ' T-096/T-022 handoff'
    : entity.key === 'authorization_policies'
      ? ' Audit + dry-run required'
      : '';
  return `${entity.label} ${capability} ${entity.requiredPermissions.join(', ')} ${processing} ${template}${suffix}`;
}

function statusText(state: PageState) {
  if (state === 'loading') return 'Loading import/export jobs and entity configuration…';
  if (state === 'empty') return 'No import or export jobs yet.';
  if (state === 'error') return 'Unable to load import/export configuration.';
  return null;
}

function jobStatusClass(status: RecentJob['status']) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function exportLinkLabel(entity: SettingsImportExportEntity) {
  return `Download ${entity.label.toLowerCase()} export`;
}

export default function SettingsImportExportPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ImportExportPageProps;
  return <SettingsImportExportScreen {...props} />;
}

function SettingsImportExportScreen(props: ImportExportPageProps) {
  const router = useRouter();
  const entities = props.entities ?? DEFAULT_ENTITIES;
  const visiblePermissions = props.visiblePermissions ?? (props.entities ? Array.from(new Set(entities.flatMap((entity) => entity.requiredPermissions))) : []);
  const visibleEntities = entities.filter((entity) => hasRequiredPermission(entity, visiblePermissions));
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

  const selectedEntity = entities.find((entity) => entity.key === selectedEntityKey) ?? visibleEntities[0] ?? entities[0] ?? DEFAULT_ENTITIES[0];
  const state = props.state ?? 'ready';
  const jobs = props.recentJobs ?? DEFAULT_JOBS;
  const stateMessage = statusText(state);
  const isAuthorizationPolicy = selectedEntity.key === 'authorization_policies';
  const canUpload = selectedEntity.importSupported;
  const canStartImport = canUpload && Boolean(fileName) && (!isAuthorizationPolicy || Boolean(dryRunId));

  if (visibleEntities.length === 0) {
    return (
      <main
        data-testid="settings-import-export-screen"
        data-route="/settings/import-export"
        data-ux-source="SET-029"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:247-383"
        className="space-y-4 p-6 text-slate-950"
      >
        <header data-region="page-head" className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Settings · SET-029</p>
          <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Bulk import and export for Settings entities. Imports are audited, permission-gated, and fail closed for unsupported entities.
          </p>
        </header>
        <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          You do not have permission to view Settings import/export entities.
        </section>
      </main>
    );
  }

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
      setDryRunError('CSV file is required before T-122 dry-run.');
      return;
    }
    if (!auditReason.trim()) {
      setDryRunError('Audit reason is required before authorization policy import.');
      return;
    }

    const preflight: PreflightAuthorizationPolicyImport = props.preflightAuthorizationPolicyImport ?? defaultPreflightAuthorizationPolicyImport;
    const result = await preflight({ fileName, auditReason: auditReason.trim() });
    if (result.ok === true) {
      setDryRunError('');
      setDryRunId(result.dryRunId);
    } else {
      setDryRunId('');
      setDryRunError(result.blockers.join(' '));
    }
  }

  async function exportEntity() {
    setIsExporting(true);
    setExportHref('');
    setExportError('');
    const exportAction: ExportSettingsEntity = props.exportSettingsEntity ?? defaultExportSettingsEntity;
    const result = await exportAction({ entity: selectedEntity.key, format });
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
      setDryRunError('This Settings entity requires its dedicated preview/commit flow before import can proceed.');
    }
  }

  return (
    <main
      data-testid="settings-import-export-screen"
      data-route="/settings/import-export"
      data-ux-source="SET-029"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:247-383"
      className="space-y-4 p-6 text-slate-950"
      aria-busy={state === 'loading'}
    >
      <header data-region="page-head" className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Settings · SET-029</p>
        <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Bulk import and export for Settings entities. Imports are audited, permission-gated, and fail closed for unsupported entities.
        </p>
      </header>

      {stateMessage ? (
        <section role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {stateMessage}
        </section>
      ) : null}

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-import-export-entity">
        Settings entity
      </label>
      <select
        id="settings-import-export-entity"
        aria-label="Settings entity"
        value={selectedEntity.key}
        onChange={(event) => updateEntity(event.currentTarget.value as EntityKey)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {visibleEntities.map((entity) => (
          <option key={entity.key} value={entity.key}>
            {optionText(entity)}
          </option>
        ))}
      </select>

      {!selectedEntity.importSupported ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {selectedEntity.label} is export-only; import is unsupported for this Settings entity. Use export for audit-safe reads.
        </div>
      ) : isAuthorizationPolicy ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Authorization policies import requires settings.authorization.edit, audit reason, and successful T-122 dry-run. V-SET-43/V-SET-44 cannot be bypassed by CSV import.
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
              <h2 id="settings-import-card-title" className="text-lg font-semibold">Import Settings entities</h2>
              <p className="mt-1 text-sm text-slate-600">Upload CSV files, download templates, and route specialized imports through their owned preview flows.</p>
            </div>
            <CapabilityBadge entity={selectedEntity} mode="import" />
          </div>

          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Required permission" value={selectedEntity.requiredPermissions.join(', ')} />
            <Detail label="Processing" value={selectedEntity.processingMode === 'async' ? 'Async job — you will be notified' : 'Synchronous'} />
            <Detail label="Audit" value={selectedEntity.auditRequired ? 'Audit event required' : 'No audit mutation'} />
            <Detail label="Template" value={selectedEntity.templateAvailable ? 'Template available' : 'No template'} />
          </dl>

          {selectedEntity.templateAvailable ? (
            <a
              href={`/api/settings/import-export/templates/${selectedEntity.key}.csv`}
              className="mb-4 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download CSV template
            </a>
          ) : null}

          {canUpload ? (
            <label
              htmlFor="settings-import-export-csv-file"
              className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm ${fileName ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-600'}`}
            >
              <span className="block text-2xl" aria-hidden="true">{fileName ? '✓' : '📄'}</span>
              <span className="mt-2 block font-medium">{fileName || 'Drag and drop CSV or click to browse'}</span>
              <span className="mt-1 block text-xs text-slate-500">Max 10 MB · UTF-8 CSV only</span>
              <input
                id="settings-import-export-csv-file"
                aria-label="CSV file"
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
                Audit reason
              </label>
              <textarea
                id="settings-import-export-audit-reason"
                aria-label="Audit reason"
                value={auditReason}
                onChange={(event) => setAuditReason(event.currentTarget.value)}
                className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Explain why authorization policy CSV changes are being validated."
              />
              <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" onClick={() => void runAuthorizationPreflight()}>
                Run T-122 dry-run
              </button>
              {dryRunError ? <p className="text-sm text-red-700">{dryRunError}</p> : null}
              {dryRunId ? <p className="text-sm font-medium text-emerald-700">Dry-run passed — {dryRunId}</p> : null}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canStartImport && !selectedEntity.referenceHandoffHref}
              onClick={continueImport}
            >
              {selectedEntity.referenceHandoffHref ? 'Continue to reference preview' : 'Start import'}
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
              <h2 id="settings-export-card-title" className="text-lg font-semibold">Export Settings entities</h2>
              <p className="mt-1 text-sm text-slate-600">Read-only exports use the selected global Settings entity and requested output format.</p>
            </div>
            <CapabilityBadge entity={selectedEntity} mode="export" />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Export format</legend>
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
              {isExporting ? 'Exporting…' : 'Export now'}
            </button>
            {exportHref ? (
              <a href={exportHref} className="text-sm font-medium text-blue-700 underline">
                {exportLinkLabel(selectedEntity)}
              </a>
            ) : null}
            {exportError ? <p className="text-sm text-red-700">{exportError}</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Recent jobs</h2>
          <p className="text-sm text-slate-600">Last 30 days. Statuses link every import/export action to audit evidence.</p>
        </div>
        <div className="overflow-x-auto">
          <table aria-label="Recent import and export jobs" className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">Job ID</th>
                <th scope="col" className="px-3 py-2">Entity</th>
                <th scope="col" className="px-3 py-2">Type</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Rows</th>
                <th scope="col" className="px-3 py-2">Audit reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2 font-mono font-semibold">{job.id}</td>
                  <td className="px-3 py-2">{job.entity}</td>
                  <td className="px-3 py-2 capitalize">{job.type}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${jobStatusClass(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{job.rows ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{job.auditReason ?? '—'}</td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No job rows to display.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CapabilityBadge({ entity, mode }: { entity: SettingsImportExportEntity; mode: 'import' | 'export' }) {
  const supported = mode === 'import' ? entity.importSupported : entity.exportSupported;
  const text = supported ? (mode === 'import' ? 'Import supported' : 'Export supported') : 'Export only';
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
