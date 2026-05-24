import { getTranslations } from 'next-intl/server';

import { startExportJob } from '../../../../../../actions/import-export/export';
import SettingsImportExportScreen, {
  type ExportFormat,
  type ExportSettingsEntity,
  type ImportExportLabels,
  type PageState,
  type PreflightAuthorizationPolicyImport,
  type RecentJob,
  type SettingsImportExportEntity,
  type EntityKey,
} from './import-export-screen.client';

type EntityDefinition = Omit<SettingsImportExportEntity, 'label' | 'referenceHandoffHref'> & {
  labelKey: keyof ImportExportLabels['entities'];
  referenceHandoffPath?: string;
};

type ImportExportPageProps = {
  params?: Promise<{ locale: string }>;
  entities?: SettingsImportExportEntity[];
  visiblePermissions?: string[];
  recentJobs?: RecentJob[];
  state?: PageState;
  exportSettingsEntity?: ExportSettingsEntity;
  preflightAuthorizationPolicyImport?: PreflightAuthorizationPolicyImport;
};

const DEFAULT_ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    key: 'users',
    labelKey: 'users',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.users.invite'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'roles',
    labelKey: 'roles',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.roles.assign'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'invitations',
    labelKey: 'invitations',
    importSupported: false,
    exportSupported: true,
    requiredPermissions: ['settings.users.invite'],
    templateAvailable: false,
    processingMode: 'sync',
    auditRequired: true,
  },
  {
    key: 'reference_tables',
    labelKey: 'referenceTables',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.reference.edit'],
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
    referenceHandoffPath: '/settings/reference/allergens_reference/import',
  },
  {
    key: 'infrastructure',
    labelKey: 'infrastructure',
    importSupported: false,
    exportSupported: true,
    requiredPermissions: ['settings.infrastructure.manage'],
    templateAvailable: false,
    processingMode: 'async',
    auditRequired: true,
  },
  {
    key: 'feature_flags',
    labelKey: 'featureFlags',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.flags.edit'],
    templateAvailable: true,
    processingMode: 'async',
    auditRequired: true,
  },
  {
    key: 'authorization_policies',
    labelKey: 'authorizationPolicies',
    importSupported: true,
    exportSupported: true,
    requiredPermissions: ['settings.authorization.edit'],
    templateAvailable: true,
    processingMode: 'async',
    auditRequired: true,
  },
];

async function defaultExportSettingsEntity(input: { entity: EntityKey; format: ExportFormat }) {
  'use server';

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
  'use server';

  return { ok: false as const, blockers: ['preflight_unavailable'] };
}

function withLocale(locale: string, path: string) {
  const normalizedLocale = locale || 'en';
  return `/${normalizedLocale}${path}`;
}

function buildDefaultEntities(labels: ImportExportLabels, locale: string): SettingsImportExportEntity[] {
  return DEFAULT_ENTITY_DEFINITIONS.map(({ labelKey, referenceHandoffPath, ...definition }) => ({
    ...definition,
    label: labels.entities[labelKey],
    referenceHandoffHref: referenceHandoffPath ? withLocale(locale, referenceHandoffPath) : undefined,
  }));
}

function DisabledAuthorizationPolicyPreflight({
  entities,
  labels,
}: {
  entities: SettingsImportExportEntity[];
  labels: ImportExportLabels;
}) {
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
        <p className="max-w-3xl text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-import-export-entity">
        {labels.entityLabel}
      </label>
      <select
        id="settings-import-export-entity"
        aria-label={labels.entityLabel}
        defaultValue="authorization_policies"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {entities.map((entity) => (
          <option key={entity.key} value={entity.key}>
            {entity.label} {entity.requiredPermissions.join(', ')}
          </option>
        ))}
      </select>

      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        {labels.importCard.preflightUnavailable}
      </div>

      <section
        role="region"
        aria-labelledby="settings-import-card-title"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 id="settings-import-card-title" className="text-lg font-semibold">{labels.importCard.title}</h2>
        <label
          htmlFor="settings-import-export-csv-file"
          className="mt-4 block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600"
        >
          <span className="mt-2 block font-medium">{labels.importCard.dropzone}</span>
          <span className="mt-1 block text-xs text-slate-500">{labels.importCard.fileLimit}</span>
          <input
            id="settings-import-export-csv-file"
            aria-label={labels.importCard.fileAria}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settings-import-export-audit-reason">
          {labels.importCard.auditReason}
        </label>
        <textarea
          id="settings-import-export-audit-reason"
          aria-label={labels.importCard.auditReason}
          className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          placeholder={labels.importCard.auditReasonPlaceholder}
        />
        <button type="button" className="mt-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" disabled>
          {labels.importCard.runDryRun}
        </button>
      </section>
    </main>
  );
}

async function buildLabels(locale: string): Promise<ImportExportLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.import_export' });

  return {
    eyebrow: t('eyebrow'),
    title: t('title'),
    subtitle: t('subtitle'),
    permissionDenied: t('permission_denied'),
    entityLabel: t('entity_label'),
    states: {
      loading: t('states.loading'),
      empty: t('states.empty'),
      error: t('states.error'),
      noRows: t('states.no_rows'),
    },
    entities: {
      users: t('entities.users'),
      roles: t('entities.roles'),
      invitations: t('entities.invitations'),
      referenceTables: t('entities.reference_tables'),
      infrastructure: t('entities.infrastructure'),
      featureFlags: t('entities.feature_flags'),
      authorizationPolicies: t('entities.authorization_policies'),
    },
    capabilities: {
      importExport: t('capabilities.import_export'),
      exportOnly: t('capabilities.export_only'),
      importSupported: t('capabilities.import_supported'),
      exportSupported: t('capabilities.export_supported'),
      template: t('capabilities.template'),
      noTemplate: t('capabilities.no_template'),
      sync: t('capabilities.sync'),
      async: t('capabilities.async'),
      referenceHandoff: t('capabilities.reference_handoff'),
      auditDryRunRequired: t('capabilities.audit_dry_run_required'),
    },
    alerts: {
      unsupportedImport: t('alerts.unsupported_import'),
      authorizationPolicy: t('alerts.authorization_policy'),
    },
    importCard: {
      title: t('import_card.title'),
      description: t('import_card.description'),
      requiredPermission: t('import_card.required_permission'),
      processing: t('import_card.processing'),
      audit: t('import_card.audit'),
      template: t('import_card.template'),
      asyncJob: t('import_card.async_job'),
      synchronous: t('import_card.synchronous'),
      auditRequired: t('import_card.audit_required'),
      noAuditMutation: t('import_card.no_audit_mutation'),
      templateAvailable: t('import_card.template_available'),
      noTemplate: t('import_card.no_template'),
      downloadTemplate: t('import_card.download_template'),
      dropzone: t('import_card.dropzone'),
      fileLimit: t('import_card.file_limit'),
      fileAria: t('import_card.file_aria'),
      auditReason: t('import_card.audit_reason'),
      auditReasonPlaceholder: t('import_card.audit_reason_placeholder'),
      runDryRun: t('import_card.run_dry_run'),
      continueReference: t('import_card.continue_reference'),
      startImport: t('import_card.start_import'),
      csvRequired: t('import_card.csv_required'),
      auditReasonRequired: t('import_card.audit_reason_required'),
      dryRunPassed: t('import_card.dry_run_passed'),
      dedicatedFlowRequired: t('import_card.dedicated_flow_required'),
      preflightUnavailable: t('import_card.preflight_unavailable'),
    },
    exportCard: {
      title: t('export_card.title'),
      description: t('export_card.description'),
      format: t('export_card.format'),
      exportNow: t('export_card.export_now'),
      exporting: t('export_card.exporting'),
      downloadExport: t('export_card.download_export'),
    },
    jobs: {
      title: t('jobs.title'),
      description: t('jobs.description'),
      tableLabel: t('jobs.table_label'),
      id: t('jobs.id'),
      entity: t('jobs.entity'),
      type: t('jobs.type'),
      status: t('jobs.status'),
      rows: t('jobs.rows'),
      auditReason: t('jobs.audit_reason'),
      importType: t('jobs.import_type'),
      exportType: t('jobs.export_type'),
      queued: t('jobs.queued'),
      running: t('jobs.running'),
      completed: t('jobs.completed'),
      failed: t('jobs.failed'),
    },
  };
}

export default async function SettingsImportExportPage(propsInput: ImportExportPageProps = {}) {
  const hasInjectedEntities = Object.prototype.hasOwnProperty.call(propsInput, 'entities');
  const { locale } = (await propsInput.params) ?? { locale: 'en' };
  const labels = await buildLabels(locale);
  const screenLabels = hasInjectedEntities
    ? labels
    : {
        ...labels,
        permissionDenied: 'Live loader not configured; import/export placeholder unavailable.',
      };
  const entities = hasInjectedEntities ? (propsInput.entities ?? []) : [];
  const visiblePermissions = propsInput.visiblePermissions ?? (
    propsInput.entities ? Array.from(new Set(entities.flatMap((entity) => entity.requiredPermissions))) : []
  );
  const hasReviewedAuthorizationPreflight = typeof propsInput.preflightAuthorizationPolicyImport === 'function';

  if (hasInjectedEntities && !hasReviewedAuthorizationPreflight) {
    return <DisabledAuthorizationPolicyPreflight entities={entities} labels={labels} />;
  }

  return (
    <SettingsImportExportScreen
      entities={entities}
      visiblePermissions={visiblePermissions}
      recentJobs={propsInput.recentJobs ?? []}
      state={propsInput.state ?? (hasInjectedEntities ? 'ready' : 'empty')}
      exportSettingsEntity={propsInput.exportSettingsEntity ?? defaultExportSettingsEntity}
      preflightAuthorizationPolicyImport={propsInput.preflightAuthorizationPolicyImport ?? defaultPreflightAuthorizationPolicyImport}
      labels={screenLabels}
    />
  );
}
