import { getTranslations } from 'next-intl/server';

import { startExportJob } from '../../../../../../actions/import-export/export';
import { startImportJob } from '../../../../../../actions/import-export/import';
import { loadImportExportData } from '../../../../../../actions/import-export/load-import-export';
import { loadMasterDataHub } from './_actions/load-master-data-hub';
import ImportExportHub, { type MasterDataHubLabels } from './import-export-hub.client';
import ImportExportTabs, { type ImportExportTabsLabels } from './import-export-tabs.client';
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

type ImportExportPageProps = {
  params?: Promise<{ locale: string }>;
  // Test/storybook injection hooks. Production renders real Supabase data via
  // loadImportExportData() (withOrgContext / RLS) when no data props are supplied.
  entities?: SettingsImportExportEntity[];
  visiblePermissions?: string[];
  recentJobs?: RecentJob[];
  state?: PageState;
  exportSettingsEntity?: ExportSettingsEntity;
  preflightAuthorizationPolicyImport?: PreflightAuthorizationPolicyImport;
};

async function exportSettingsEntityThroughAction(input: { entity: EntityKey; format: ExportFormat }) {
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

async function preflightAuthorizationPolicyThroughAction(input: {
  fileName: string;
  csvText: string;
  auditReason: string;
}) {
  'use server';

  const result = await startImportJob({
    target: 'authorization_policies',
    fileName: input.fileName,
    contentType: 'text/csv',
    csvText: input.csvText,
    auditReason: input.auditReason,
  });

  if (result.ok === true) {
    return { ok: true as const, dryRunId: result.data.job.id };
  }
  if (result.error === 'authorization_preflight_failed') {
    const blockers = (result.blockers ?? []).map((blocker) =>
      typeof blocker.code === 'string' ? String(blocker.code) : 'authorization_preflight_failed',
    );
    return { ok: false as const, blockers: blockers.length > 0 ? blockers : ['authorization_preflight_failed'] };
  }
  return { ok: false as const, blockers: [result.error] };
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
      featureUnavailableTitle: t('alerts.feature_unavailable_title'),
      featureUnavailable: t('alerts.feature_unavailable'),
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

async function buildMasterDataHubLabels(locale: string): Promise<MasterDataHubLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.import_export_hub' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    filters: {
      all: t('filters.all'),
      importable: t('filters.importable'),
      masterData: t('filters.master_data'),
    },
    table: {
      entity: t('table.entity'),
      records: t('table.records'),
      lastImport: t('table.last_import'),
      recordsUnit: t('table.records_unit'),
      never: t('table.never'),
      export: t('table.export'),
      import: t('table.import'),
      readOnly: t('table.read_only'),
    },
    empty: t('empty'),
    error: t('error'),
    jobs: {
      title: t('jobs.title'),
      viewAll: t('jobs.view_all'),
      rowsUnit: t('jobs.rows_unit'),
      statusCompleted: t('jobs.status_completed'),
      statusRunning: t('jobs.status_running'),
      statusQueued: t('jobs.status_queued'),
      statusFailed: t('jobs.status_failed'),
      kindImport: t('jobs.kind_import'),
      kindExport: t('jobs.kind_export'),
      none: t('jobs.none'),
    },
    exports: {
      title: t('exports.title'),
      subtitle: t('exports.subtitle'),
      rowsUnit: t('exports.rows_unit'),
      download: t('exports.download'),
      none: t('exports.none'),
    },
    drawer: {
      importKicker: t('drawer.import_kicker'),
      recordsLabel: t('drawer.records_label'),
      close: t('drawer.close'),
      stepUpload: t('drawer.step_upload'),
      stepMap: t('drawer.step_map'),
      stepReview: t('drawer.step_review'),
      dropTitle: t('drawer.drop_title'),
      dropHint: t('drawer.drop_hint'),
      chooseFile: t('drawer.choose_file'),
      helpTitle: t('drawer.help_title'),
      helpBody: t('drawer.help_body'),
      downloadTemplate: t('drawer.download_template'),
      uploadedRows: t('drawer.uploaded_rows'),
      replace: t('drawer.replace'),
      mapTitle: t('drawer.map_title'),
      csvColumn: t('drawer.csv_column'),
      monopilotField: t('drawer.monopilot_field'),
      sample: t('drawer.sample'),
      skipColumn: t('drawer.skip_column'),
      autoMatched: t('drawer.auto_matched'),
      behaviourTitle: t('drawer.behaviour_title'),
      behaviourUpsert: t('drawer.behaviour_upsert'),
      behaviourUpsertDesc: t('drawer.behaviour_upsert_desc'),
      behaviourCreate: t('drawer.behaviour_create'),
      behaviourCreateDesc: t('drawer.behaviour_create_desc'),
      behaviourReplace: t('drawer.behaviour_replace'),
      behaviourReplaceDesc: t('drawer.behaviour_replace_desc'),
      validationTitle: t('drawer.validation_title'),
      validationReady: t('drawer.validation_ready'),
      validationOverwrite: t('drawer.validation_overwrite'),
      validationErrors: t('drawer.validation_errors'),
      previewTitle: t('drawer.preview_title'),
      previewStatusUpdate: t('drawer.preview_status_update'),
      previewStatusCreate: t('drawer.preview_status_create'),
      cancel: t('drawer.cancel'),
      back: t('drawer.back'),
      continue: t('drawer.continue'),
      nextReview: t('drawer.next_review'),
      runImport: t('drawer.run_import'),
      notWiredTitle: t('drawer.not_wired_title'),
      notWiredBody: t('drawer.not_wired_body'),
    },
  };
}

async function buildTabsLabels(locale: string): Promise<ImportExportTabsLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.import_export_hub.tabs' });
  return {
    ariaLabel: t('aria_label'),
    settingsEntities: t('settings_entities'),
    masterData: t('master_data'),
  };
}

export default async function SettingsImportExportPage(propsInput: ImportExportPageProps = {}) {
  const { locale } = (await propsInput.params) ?? { locale: 'en' };
  const labels = await buildLabels(locale);

  // Injected-data mode: a test (or storybook) supplies entities/jobs/state
  // directly. Production mode: no data props → read real org-scoped Supabase
  // capabilities + recent jobs via withOrgContext (RLS).
  const hasInjectedData =
    Object.prototype.hasOwnProperty.call(propsInput, 'entities') ||
    Object.prototype.hasOwnProperty.call(propsInput, 'recentJobs') ||
    propsInput.state !== undefined;

  if (hasInjectedData) {
    const entities = propsInput.entities ?? [];
    const visiblePermissions =
      propsInput.visiblePermissions ?? Array.from(new Set(entities.flatMap((entity) => entity.requiredPermissions)));
    return (
      <SettingsImportExportScreen
        entities={entities}
        visiblePermissions={visiblePermissions}
        recentJobs={propsInput.recentJobs ?? []}
        state={propsInput.state ?? (entities.length === 0 ? 'empty' : 'ready')}
        exportSettingsEntity={propsInput.exportSettingsEntity ?? exportSettingsEntityThroughAction}
        preflightAuthorizationPolicyImport={propsInput.preflightAuthorizationPolicyImport}
        labels={labels}
      />
    );
  }

  // Production mode renders BOTH prototypes side-by-side as sibling tabs:
  //   - "Master data" (new) → ImportExportHub, fed by getImportableEntities
  //   - "Settings entities" (existing SET-029) → SettingsImportExportScreen
  // Each owns a distinct testid so the two never collide in the DOM.
  const [loaded, hubLoaded, hubLabels, tabsLabels] = await Promise.all([
    loadImportExportData(locale),
    loadMasterDataHub(),
    buildMasterDataHubLabels(locale),
    buildTabsLabels(locale),
  ]);

  const masterDataPanel = (
    <ImportExportHub
      entities={hubLoaded.ok ? hubLoaded.data.entities : []}
      recentJobs={hubLoaded.ok ? hubLoaded.data.recent_jobs : []}
      recentExports={hubLoaded.ok ? hubLoaded.data.recent_exports : []}
      ok={hubLoaded.ok}
      labels={hubLabels}
    />
  );

  if (loaded.ok === false) {
    return (
      <ImportExportTabs
        labels={tabsLabels}
        masterDataPanel={masterDataPanel}
        settingsEntitiesPanel={
          <SettingsImportExportScreen
            entities={[]}
            visiblePermissions={[]}
            recentJobs={[]}
            state="error"
            exportSettingsEntity={exportSettingsEntityThroughAction}
            preflightAuthorizationPolicyImport={undefined}
            labels={labels}
            featureAvailable={false}
          />
        }
      />
    );
  }

  // Authorization-policy import preflight is only wired when the caller actually
  // holds settings.authorization.edit (registry-verified). Otherwise the control
  // fail-closes (undefined → disabled dry-run button in the client leaf).
  const preflightAuthorizationPolicyImport: PreflightAuthorizationPolicyImport | undefined =
    loaded.canImportAuthorizationPolicies ? preflightAuthorizationPolicyThroughAction : undefined;

  return (
    <ImportExportTabs
      labels={tabsLabels}
      masterDataPanel={masterDataPanel}
      settingsEntitiesPanel={
        <SettingsImportExportScreen
          entities={loaded.entities}
          visiblePermissions={loaded.visiblePermissions}
          recentJobs={loaded.recentJobs}
          state={loaded.state}
          exportSettingsEntity={exportSettingsEntityThroughAction}
          preflightAuthorizationPolicyImport={preflightAuthorizationPolicyImport}
          labels={labels}
          featureAvailable={false}
        />
      }
    />
  );
}
