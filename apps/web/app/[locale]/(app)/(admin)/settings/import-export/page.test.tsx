/**
 * @vitest-environment jsdom
 * T-121 / SET-029 — Global Import / Export Settings hub RED contract.
 * Source of truth: UX SET-029 and ops-screens.jsx:247-383.
 * RED scope: tests only; a missing production page renders an empty placeholder
 * so failures are behavior/route assertions rather than module-resolution noise.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();

const messages = {
  eyebrow: 'Settings · SET-029',
  title: 'Import / Export',
  subtitle: 'Bulk import and export for Settings entities. Imports are audited, permission-gated, and fail closed for unsupported entities.',
  permission_denied: 'You do not have permission to view Settings import/export entities.',
  entity_label: 'Settings entity',
  states: {
    loading: 'Loading import/export jobs and entity configuration…',
    empty: 'No import or export jobs yet.',
    error: 'Unable to load import/export configuration.',
    no_rows: 'No job rows to display.',
  },
  entities: {
    users: 'Users',
    roles: 'Roles',
    invitations: 'Invitations',
    reference_tables: 'Reference tables',
    infrastructure: 'Infrastructure',
    feature_flags: 'Feature flags',
    authorization_policies: 'Authorization policies',
  },
  capabilities: {
    import_export: 'Import + export',
    export_only: 'Export only',
    import_supported: 'Import supported',
    export_supported: 'Export supported',
    template: 'Template',
    no_template: 'No template',
    sync: 'Sync',
    async: 'Async',
    reference_handoff: 'T-096/T-022 handoff',
    audit_dry_run_required: 'Audit + dry-run required',
  },
  alerts: {
    unsupported_import: '{entity} is export-only; import is unsupported for this Settings entity. Use export for audit-safe reads.',
    authorization_policy: 'Authorization policies import requires settings.authorization.edit, audit reason, and successful T-122 dry-run. V-SET-43/V-SET-44 cannot be bypassed by CSV import.',
  },
  import_card: {
    title: 'Import Settings entities',
    description: 'Upload CSV files, download templates, and route specialized imports through their owned preview flows.',
    required_permission: 'Required permission',
    processing: 'Processing',
    audit: 'Audit',
    template: 'Template',
    async_job: 'Async job — you will be notified',
    synchronous: 'Synchronous',
    audit_required: 'Audit event required',
    no_audit_mutation: 'No audit mutation',
    template_available: 'Template available',
    no_template: 'No template',
    download_template: 'Download CSV template',
    dropzone: 'Drag and drop CSV or click to browse',
    file_limit: 'Max 10 MB · UTF-8 CSV only',
    file_aria: 'CSV file',
    audit_reason: 'Audit reason',
    audit_reason_placeholder: 'Explain why authorization policy CSV changes are being validated.',
    run_dry_run: 'Run T-122 dry-run',
    continue_reference: 'Continue to reference preview',
    start_import: 'Start import',
    csv_required: 'CSV file is required before T-122 dry-run.',
    audit_reason_required: 'Audit reason is required before authorization policy import.',
    dry_run_passed: 'Dry-run passed — {dryRunId}',
    dedicated_flow_required: 'This Settings entity requires its dedicated preview/commit flow before import can proceed.',
    preflight_unavailable: 'T-122 preflight service is not configured for this environment.',
  },
  export_card: {
    title: 'Export Settings entities',
    description: 'Read-only exports use the selected global Settings entity and requested output format.',
    format: 'Export format',
    export_now: 'Export now',
    exporting: 'Exporting…',
    download_export: 'Download {entity} export',
  },
  jobs: {
    title: 'Recent jobs',
    description: 'Last 30 days. Statuses link every import/export action to audit evidence.',
    table_label: 'Recent import and export jobs',
    id: 'Job ID',
    entity: 'Entity',
    type: 'Type',
    status: 'Status',
    rows: 'Rows',
    audit_reason: 'Audit reason',
    import_type: 'import',
    export_type: 'export',
    queued: 'queued',
    running: 'running',
    completed: 'completed',
    failed: 'failed',
  },
};

function messageFor(key: string) {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in node) return (node as Record<string, unknown>)[part];
    return key;
  }, messages) as string;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => messageFor(key)),
}));

type EntityKey = 'users' | 'roles' | 'invitations' | 'reference_tables' | 'infrastructure' | 'feature_flags' | 'authorization_policies';
type ExportFormat = 'csv' | 'xlsx';

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

type ImportExportPageProps = {
  params?: Promise<{ locale: string }>;
  entities?: SettingsImportExportEntity[];
  visiblePermissions?: string[];
  recentJobs?: RecentJob[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  exportSettingsEntity?: (input: { entity: EntityKey; format: ExportFormat }) => Promise<{ ok: true; downloadHref: string } | { ok: false; message: string }>;
  preflightAuthorizationPolicyImport?: (input: { fileName: string; auditReason: string }) => Promise<{ ok: true; dryRunId: string } | { ok: false; blockers: string[] }>;
};

type ImportExportPage = (props: ImportExportPageProps) => React.ReactNode | Promise<React.ReactNode>;

const entities: SettingsImportExportEntity[] = [
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

const allPermissions = Array.from(new Set(entities.flatMap((entity) => entity.requiredPermissions)));

const recentJobs: RecentJob[] = [
  { id: 'IMP-121-001', entity: 'Reference tables', type: 'import', status: 'completed', rows: 48, auditReason: 'quarterly allergen refresh' },
  { id: 'EXP-121-002', entity: 'Users', type: 'export', status: 'running', rows: null },
  { id: 'IMP-121-003', entity: 'Authorization policies', type: 'import', status: 'failed', rows: 0, auditReason: 'segregation-of-duties test' },
];

async function loadImportExportPage(): Promise<ImportExportPage> {
  const routePath = join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/page.tsx');

  if (!existsSync(routePath)) {
    return function MissingImportExportPage() {
      return React.createElement('main', { 'data-testid': 'missing-settings-import-export-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'T-121 import/export page must default-export a renderable React component').toEqual(expect.any(Function));
  return mod.default as ImportExportPage;
}

async function renderImportExportPage(overrides: Partial<ImportExportPageProps> = {}) {
  const Page = await loadImportExportPage();
  const props: ImportExportPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    entities,
    visiblePermissions: allPermissions,
    recentJobs,
    state: 'ready',
    exportSettingsEntity: vi.fn(async () => ({ ok: true as const, downloadHref: '/api/settings/import-export/downloads/users.csv' })),
    preflightAuthorizationPolicyImport: vi.fn(async () => ({ ok: true as const, dryRunId: 'T-122-DRY-RUN-1' })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function hub() {
  return screen.getByTestId('settings-import-export-screen');
}

function entitySelector() {
  return within(hub()).getByRole('combobox', { name: /settings entity/i });
}

function selectEntity(key: EntityKey) {
  fireEvent.change(entitySelector(), { target: { value: key } });
}

describe('T-121 import/export AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRoute = join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/page.tsx');
    const legacyRoute = join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/import-export/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-121 must implement /en/settings/import-export under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });

  it('keeps page.tsx server-rendered and delegates interactivity to an i18n-backed client leaf', () => {
    const pageSource = readFileSync(join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/page.tsx'), 'utf8');
    const clientSource = readFileSync(join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/import-export-screen.client.tsx'), 'utf8');

    expect(pageSource.startsWith("'use client'")).toBe(false);
    expect(pageSource).toContain("getTranslations({ locale, namespace: 'settings.import_export' })");
    expect(pageSource).toContain("from './import-export-screen.client'");
    expect(clientSource.startsWith("'use client'")).toBe(true);
    expect(pageSource).not.toContain("referenceHandoffHref: '/en/");
    expect(pageSource).not.toContain('IMP-0042');
  });
});

describe('T-121 SET-029 Global Import / Export hub', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/import-export');
  });

  it('renders the SET-029 two-card hub with selector capabilities, dropzone, templates, export formats, and recent job statuses', async () => {
    await renderImportExportPage();

    expect(hub()).toHaveAttribute('data-route', '/settings/import-export');
    expect(hub()).toHaveAttribute('data-ux-source', 'SET-029');
    expect(screen.getByRole('heading', { name: /import \/ export/i })).toBeInTheDocument();

    const importCard = within(hub()).getByRole('region', { name: /import settings entities/i });
    const exportCard = within(hub()).getByRole('region', { name: /export settings entities/i });
    expect(within(importCard).getByText(/drag.*drop csv/i)).toBeInTheDocument();
    expect(within(importCard).getByRole('link', { name: /download csv template/i })).toHaveAttribute('href', expect.stringContaining('template'));
    expect(within(exportCard).getByRole('radio', { name: /^csv$/i })).toBeChecked();
    expect(within(exportCard).getByRole('radio', { name: /^xlsx$/i })).toBeInTheDocument();

    const options = within(entitySelector()).getAllByRole('option').map((option) => option.textContent?.replace(/\s+/g, ' ').trim());
    expect(options).toEqual([
      'Users Import + export settings.users.invite Sync Template',
      'Roles Import + export settings.roles.assign Sync Template',
      'Invitations Export only settings.users.invite Sync No template',
      'Reference tables Import + export settings.reference.edit Sync Template T-096/T-022 handoff',
      'Infrastructure Export only settings.infrastructure.manage Async No template',
      'Feature flags Import + export settings.flags.edit Async Template',
      'Authorization policies Import + export settings.authorization.edit Async Template Audit + dry-run required',
    ]);

    const jobs = within(hub()).getByRole('table', { name: /recent import and export jobs/i });
    expect(jobs).toHaveTextContent('IMP-121-001');
    expect(jobs).toHaveTextContent(/completed/i);
    expect(jobs).toHaveTextContent('EXP-121-002');
    expect(jobs).toHaveTextContent(/running/i);
    expect(jobs).toHaveTextContent('IMP-121-003');
    expect(jobs).toHaveTextContent(/failed/i);
  });

  it('filters entities by required permission and clearly marks unsupported imports as export-only', async () => {
    await renderImportExportPage({ visiblePermissions: ['settings.users.invite', 'settings.reference.edit'] });

    const options = within(entitySelector()).getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.join('\n')).toContain('Users');
    expect(options.join('\n')).toContain('Invitations');
    expect(options.join('\n')).toContain('Reference tables');
    expect(options.join('\n')).not.toContain('Roles');
    expect(options.join('\n')).not.toContain('Authorization policies');

    selectEntity('invitations');
    expect(within(hub()).getByRole('alert')).toHaveTextContent(/invitations.*export-only.*import is unsupported/i);
    expect(within(hub()).queryByLabelText(/csv file/i)).not.toBeInTheDocument();
    expect(within(hub()).getByRole('button', { name: /start import/i })).toBeDisabled();
  });

  it('hands reference table CSV imports to the T-096/T-022 preview flow instead of using a generic import path', async () => {
    const user = userEvent.setup();
    await renderImportExportPage();

    selectEntity('reference_tables');
    const file = new File(['code,label\nMILK,Milk'], 'reference-tables.csv', { type: 'text/csv' });
    await user.upload(within(hub()).getByLabelText(/csv file/i), file);
    await user.click(within(hub()).getByRole('button', { name: /continue to reference preview/i }));

    expect(routerPush).toHaveBeenCalledWith('/en/settings/reference/allergens_reference/import');
  });

  it('blocks authorization-policy import until settings.authorization.edit, an audit reason, and T-122 dry-run preflight are present', async () => {
    const user = userEvent.setup();
    const preflight = vi.fn(async () => ({ ok: true as const, dryRunId: 'T-122-DRY-RUN-1' }));
    await renderImportExportPage({ preflightAuthorizationPolicyImport: preflight });

    selectEntity('authorization_policies');
    expect(within(hub()).getByRole('alert')).toHaveTextContent(
      /requires settings\.authorization\.edit, audit reason, and successful T-122 dry-run/i,
    );

    await user.upload(within(hub()).getByLabelText(/csv file/i), new File(['policy,enabled\nnpd,true'], 'auth-policies.csv', { type: 'text/csv' }));
    expect(within(hub()).getByRole('button', { name: /start import/i })).toBeDisabled();
    await user.click(within(hub()).getByRole('button', { name: /run t-122 dry-run/i }));
    expect(preflight).not.toHaveBeenCalled();
    expect(within(hub()).getByText(/audit reason is required/i)).toBeInTheDocument();

    await user.type(within(hub()).getByLabelText(/audit reason/i), 'Preflight policy migration for V-SET-43/V-SET-44 validation');
    await user.click(within(hub()).getByRole('button', { name: /run t-122 dry-run/i }));
    expect(preflight).toHaveBeenCalledWith({
      fileName: 'auth-policies.csv',
      auditReason: 'Preflight policy migration for V-SET-43/V-SET-44 validation',
    });
    expect(within(hub()).getByText(/dry-run passed.*T-122-DRY-RUN-1/i)).toBeInTheDocument();
  });

  it('calls the global export action for the selected Settings entity and format and surfaces the download link', async () => {
    const user = userEvent.setup();
    const exportSettingsEntity = vi.fn(async () => ({ ok: true as const, downloadHref: '/api/settings/import-export/downloads/roles.xlsx' }));
    await renderImportExportPage({ exportSettingsEntity });

    selectEntity('roles');
    await user.click(within(hub()).getByRole('radio', { name: /^xlsx$/i }));
    await user.click(within(hub()).getByRole('button', { name: /export now/i }));

    expect(exportSettingsEntity).toHaveBeenCalledWith({ entity: 'roles', format: 'xlsx' });
    expect(within(hub()).getByRole('link', { name: /download roles export/i })).toHaveAttribute(
      'href',
      '/api/settings/import-export/downloads/roles.xlsx',
    );
  });

  it.each([
    ['loading', /loading import\/export jobs/i],
    ['empty', /no import or export jobs yet/i],
    ['error', /unable to load import\/export configuration/i],
  ] as const)('renders the %s state loudly without skipping verification', async (state, message) => {
    await renderImportExportPage({ state, recentJobs: [] });

    expect(within(hub()).getByRole('status')).toHaveTextContent(message);
  });
});
