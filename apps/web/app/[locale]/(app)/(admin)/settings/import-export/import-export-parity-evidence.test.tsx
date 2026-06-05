/**
 * @vitest-environment jsdom
 * T-121 / SET-029 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders all 5 required UI states (loading / empty / error / permission-denied /
 * optimistic) of the production import/export client leaf and writes per-state DOM
 * HTML snapshots + a structural region summary to
 * apps/web/e2e/artifacts/SET-029-T121/ for the parity diff against
 * prototypes/design/Monopilot Design System/settings/ops-screens.jsx:263-384.
 *
 * Playwright pixel screenshots + axe require a running app server on the test-stage
 * Vercel/Supabase env (admin route needs an authenticated, RBAC-granted session);
 * see import-export-parity-evidence.spec.ts and the closeout blockers note.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SettingsImportExportScreen, {
  type ImportExportLabels,
  type PageState,
  type RecentJob,
  type SettingsImportExportEntity,
} from './import-export-screen.client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../e2e/artifacts/SET-029-T121');

const labels: ImportExportLabels = {
  eyebrow: 'Settings · SET-029',
  title: 'Import / Export',
  subtitle: 'Bulk import and export for Settings entities. Imports are audited, permission-gated, and fail closed for unsupported entities.',
  permissionDenied: 'You do not have permission to view Settings import/export entities.',
  entityLabel: 'Settings entity',
  states: {
    loading: 'Loading import/export jobs and entity configuration…',
    empty: 'No import or export jobs yet.',
    error: 'Unable to load import/export configuration.',
    noRows: 'No job rows to display.',
  },
  entities: {
    users: 'Users', roles: 'Roles', invitations: 'Invitations', referenceTables: 'Reference tables',
    infrastructure: 'Infrastructure', featureFlags: 'Feature flags', authorizationPolicies: 'Authorization policies',
  },
  capabilities: {
    importExport: 'Import + export', exportOnly: 'Export only', importSupported: 'Import supported',
    exportSupported: 'Export supported', template: 'Template', noTemplate: 'No template', sync: 'Sync', async: 'Async',
    referenceHandoff: 'Reference preview handoff', auditDryRunRequired: 'Audit + dry-run required',
  },
  alerts: {
    unsupportedImport: '{entity} is export-only; import is unsupported for this Settings entity.',
    authorizationPolicy: 'Authorization policies import requires settings.authorization.edit, an audit reason, and a successful dry-run.',
    featureUnavailableTitle: 'Import/export processing is not available yet',
    featureUnavailable: 'Recent job history is read-only until the background worker is available.',
  },
  importCard: {
    title: 'Import Settings entities', description: 'Upload CSV files, download templates, and route specialized imports.',
    requiredPermission: 'Required permission', processing: 'Processing', audit: 'Audit', template: 'Template',
    asyncJob: 'Async job — you will be notified', synchronous: 'Synchronous', auditRequired: 'Audit event required',
    noAuditMutation: 'No audit mutation', templateAvailable: 'Template available', noTemplate: 'No template',
    downloadTemplate: 'Download CSV template', dropzone: 'Drag and drop CSV or click to browse',
    fileLimit: 'Max 10 MB · UTF-8 CSV only', fileAria: 'CSV file', auditReason: 'Audit reason',
    auditReasonPlaceholder: 'Explain why authorization policy CSV changes are being validated.',
    runDryRun: 'Run dry-run preflight', continueReference: 'Continue to reference preview', startImport: 'Start import',
    csvRequired: 'CSV file is required before the dry-run.', auditReasonRequired: 'Audit reason is required.',
    dryRunPassed: 'Dry-run passed — {dryRunId}', dedicatedFlowRequired: 'This Settings entity requires its dedicated flow.',
    preflightUnavailable: 'Authorization policy preflight is not configured for this environment.',
  },
  exportCard: {
    title: 'Export Settings entities', description: 'Read-only exports use the selected entity and format.',
    format: 'Export format', exportNow: 'Export now', exporting: 'Exporting…', downloadExport: 'Download {entity} export',
  },
  jobs: {
    title: 'Recent jobs', description: 'Last 30 days. Statuses link every action to audit evidence.',
    tableLabel: 'Recent import and export jobs', id: 'Job ID', entity: 'Entity', type: 'Type', status: 'Status',
    rows: 'Rows', auditReason: 'Audit reason', importType: 'import', exportType: 'export',
    queued: 'queued', running: 'running', completed: 'completed', failed: 'failed',
  },
};

const realEntities: SettingsImportExportEntity[] = [
  { key: 'users', label: 'Users', importSupported: false, exportSupported: true, requiredPermissions: ['settings.org.read'], templateAvailable: false, processingMode: 'sync', auditRequired: true },
  { key: 'reference_tables', label: 'Reference tables', importSupported: true, exportSupported: true, requiredPermissions: ['settings.reference.view'], templateAvailable: true, processingMode: 'sync', auditRequired: true, referenceHandoffHref: '/en/settings/reference' },
  { key: 'authorization_policies', label: 'Authorization policies', importSupported: true, exportSupported: true, requiredPermissions: ['settings.authorization.view'], templateAvailable: true, processingMode: 'async', auditRequired: true },
];

const recentJobs: RecentJob[] = [
  { id: 'job-1', entity: 'Users', type: 'export', status: 'completed', rows: 42 },
  { id: 'job-2', entity: 'Authorization policies', type: 'import', status: 'failed', rows: 0, auditReason: 'SoD migration' },
];

function renderState(state: PageState, opts: { entities: SettingsImportExportEntity[]; visiblePermissions: string[]; jobs: RecentJob[] }) {
  return render(
    <SettingsImportExportScreen
      entities={opts.entities}
      visiblePermissions={opts.visiblePermissions}
      recentJobs={opts.jobs}
      state={state}
      labels={labels}
      exportSettingsEntity={vi.fn(async () => ({ ok: true as const, downloadHref: '/api/settings/import-export/jobs/job-1' }))}
      preflightAuthorizationPolicyImport={vi.fn(async () => ({ ok: true as const, dryRunId: 'job-9' }))}
    />,
  );
}

function writeEvidence(name: string, html: string) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, name), html, 'utf8');
}

afterEach(() => cleanup());

describe('SET-029 parity evidence (5 states + structural summary)', () => {
  const allPerms = ['settings.org.read', 'settings.reference.view', 'settings.authorization.view'];

  it('writes a DOM snapshot for the ready/optimistic state', () => {
    const { container } = renderState('ready', { entities: realEntities, visiblePermissions: allPerms, jobs: recentJobs });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    writeEvidence('state-ready.html', hub.outerHTML);
    expect(hub).toHaveAttribute('data-prototype-source', 'prototypes/design/Monopilot Design System/settings/ops-screens.jsx:263-384');
    expect(hub.querySelector('table[aria-label="Recent import and export jobs"]')).not.toBeNull();
  });

  it('writes a DOM snapshot for the loading state', () => {
    const { container } = renderState('loading', { entities: realEntities, visiblePermissions: allPerms, jobs: [] });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    writeEvidence('state-loading.html', hub.outerHTML);
    expect(hub).toHaveAttribute('aria-busy', 'true');
  });

  it('writes a DOM snapshot for the empty state', () => {
    const { container } = renderState('empty', { entities: realEntities, visiblePermissions: allPerms, jobs: [] });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    writeEvidence('state-empty.html', hub.outerHTML);
    expect(hub.textContent).toContain('No job rows to display.');
  });

  it('writes a DOM snapshot for the error state', () => {
    const { container } = renderState('error', { entities: [], visiblePermissions: [], jobs: [] });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    writeEvidence('state-error.html', hub.outerHTML);
    expect(hub.textContent).toContain('Unable to load import/export configuration.');
  });

  it('writes a DOM snapshot for the permission-denied state', () => {
    const { container } = renderState('ready', { entities: realEntities, visiblePermissions: [], jobs: [] });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    writeEvidence('state-permission-denied.html', hub.outerHTML);
    expect(hub.textContent).toContain('You do not have permission to view Settings import/export entities.');
  });

  it('writes the structural parity summary vs ops-screens.jsx:263-384', () => {
    // Lead with an import-supported entity so the template-download + dropzone
    // regions (only shown for importSupported entities) are present in the snapshot.
    const importFirst = [...realEntities].sort((a, b) => Number(b.importSupported) - Number(a.importSupported));
    const { container } = renderState('ready', { entities: importFirst, visiblePermissions: allPerms, jobs: recentJobs });
    const hub = container.querySelector('[data-testid="settings-import-export-screen"]')!;
    const summary = {
      anchor: 'prototypes/design/Monopilot Design System/settings/ops-screens.jsx:263-384',
      route: hub.getAttribute('data-route'),
      uxSource: hub.getAttribute('data-ux-source'),
      regions: {
        pageHead: Boolean(hub.querySelector('[data-region="page-head"]')),
        entitySelector: Boolean(hub.querySelector('select#settings-import-export-entity')),
        importCard: Boolean(hub.querySelector('[aria-labelledby="settings-import-card-title"]')),
        exportCard: Boolean(hub.querySelector('[aria-labelledby="settings-export-card-title"]')),
        csvTemplateDownload: Boolean(hub.querySelector('a[href*="templates/"]')),
        dropzone: Boolean(hub.querySelector('input#settings-import-export-csv-file')),
        exportFormatRadios: hub.querySelectorAll('input[name="settings-export-format"]').length,
        recentJobsTable: Boolean(hub.querySelector('table[aria-label="Recent import and export jobs"]')),
      },
      prototypeCorrespondence: {
        entity_selector: 'ops-screens.jsx:285-292/335-341 → <select id="settings-import-export-entity">',
        required_permission_display: 'ops-screens.jsx:293-295 → Detail(requiredPermission)',
        sync_async_badge: 'ops-screens.jsx:296-300 → Detail(processing) + CapabilityBadge',
        csv_template_download: 'ops-screens.jsx:301-303 → <a href=.../templates/...>',
        dropzone: 'ops-screens.jsx:306-322 → <label> dropzone + file input',
        dry_run_preflight: 'ops-screens.jsx:325 → runAuthorizationPreflight (auth_policy only)',
        export_format_selector: 'ops-screens.jsx:342-351 → CSV/XLSX radios',
        recent_jobs_table: 'ops-screens.jsx:358-379 → recent jobs table',
      },
    };
    writeEvidence('parity-summary.json', JSON.stringify(summary, null, 2));
    expect(summary.regions.importCard && summary.regions.exportCard && summary.regions.recentJobsTable).toBe(true);
    expect(summary.regions.csvTemplateDownload && summary.regions.dropzone).toBe(true);
    expect(summary.regions.exportFormatRadios).toBe(2);
  });
});
