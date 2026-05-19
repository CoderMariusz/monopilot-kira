import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof action !== 'function') throw new Error('withOrgContext mock expected an action callback');
    return _withOrgContextRunner(action as (ctx: unknown) => Promise<unknown>);
  }),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof action !== 'function') throw new Error('withOrgContext mock expected an action callback');
    return _withOrgContextRunner(action as (ctx: unknown) => Promise<unknown>);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../..');
const capabilitiesPath = resolve(repoRoot, 'apps/web/actions/import-export/capabilities.ts');
const importPath = resolve(repoRoot, 'apps/web/actions/import-export/import.ts');
const exportPath = resolve(repoRoot, 'apps/web/actions/import-export/export.ts');
const jobsPath = resolve(repoRoot, 'apps/web/actions/import-export/jobs.ts');
const referenceImportCsvPath = resolve(repoRoot, 'apps/web/actions/reference/import-csv.ts');
const referenceExportCsvPath = resolve(repoRoot, 'apps/web/actions/reference/export-csv.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_TOKEN = '33333333-3333-4333-8333-333333333333';
const SETTINGS_AUTHORIZATION_EDIT = 'settings.authorization.edit';

type CapabilityState = {
  supported: boolean;
  permission?: string;
  blockers?: Array<{ code: string; detail?: string }>;
  delegate?: Record<string, unknown>;
};

type Capability = {
  target: string;
  import: CapabilityState;
  export: CapabilityState;
};

type CapabilitiesModule = {
  listImportExportCapabilities: () => Promise<{ ok: true; data: { capabilities: Capability[] } } | { ok: false; error: string }>;
};

type ImportModule = {
  startImportJob: (input: {
    target: string;
    fileName: string;
    contentType: string;
    csvText: string;
    auditReason?: string;
  }) => Promise<unknown>;
};

type ExportModule = {
  startExportJob: (input: { target: string; filters?: Record<string, unknown> }) => Promise<unknown>;
};

type JobsModule = {
  getImportExportJob: (input: { jobId: string }) => Promise<unknown>;
};

type QueryCall = { sql: string; params: readonly unknown[] };
type ImportExportJob = {
  id: string;
  org_id: string;
  kind: 'import' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_processed: number;
  progress_total: number;
  download_url: string | null;
  error_code: string | null;
  created_by: string;
};

type FakeClient = {
  calls: QueryCall[];
  actorPermissions: Set<string>;
  jobs: Map<string, ImportExportJob>;
  mutations: Array<{ kind: string; target?: string; orgId?: string }>;
  authorizationPreflightBlockers: Array<{ code: string; check: string; policyCode: string }>;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: SESSION_TOKEN, client: currentClient }),
  );
});

describe('global import/export backend actions (TASK-000212/T-125 RED)', () => {
  it('returns the permission-filtered capability registry for all Phase 1 targets and delegates reference CSV semantics to T-022/T-096 actions', async () => {
    currentClient.actorPermissions.add('settings.reference.view');
    currentClient.actorPermissions.add('settings.reference.import');
    currentClient.actorPermissions.add('settings.audit.read');

    const { listImportExportCapabilities } = await loadCapabilitiesModule();
    const result = await listImportExportCapabilities();

    expect(result).toMatchObject({ ok: true });
    if (result.ok !== true) expect.fail('capability registry must return ok:true');
    const byTarget = new Map(result.data.capabilities.map((capability) => [capability.target, capability]));
    expect(Array.from(byTarget.keys()).sort()).toEqual([
      'audit_logs',
      'authorization_policies',
      'feature_flags',
      'infrastructure',
      'invitations',
      'reference_tables',
      'roles',
      'users',
    ]);
    expect(byTarget.get('reference_tables')).toMatchObject({
      import: {
        supported: true,
        permission: 'settings.reference.import',
        delegate: {
          feature: 'reference_csv',
          previewAction: 'previewReferenceCsvImport',
          commitAction: 'commitReferenceCsvImport',
        },
      },
      export: {
        supported: true,
        permission: 'settings.reference.view',
        delegate: { feature: 'reference_csv', exportAction: 'exportReferenceCsv' },
      },
    });
    expect(byTarget.get('audit_logs')).toMatchObject({
      import: { supported: false, blockers: [{ code: 'unsupported_import' }] },
      export: { supported: true, permission: 'settings.audit.read' },
    });
    expect(byTarget.get('authorization_policies')).toMatchObject({
      import: { supported: false, blockers: [{ code: 'permission_missing', detail: SETTINGS_AUTHORIZATION_EDIT }] },
      export: { supported: false, blockers: [{ code: 'permission_missing', detail: 'settings.authorization.view' }] },
    });
    expect(existsSync(referenceImportCsvPath), 'reference CSV import action must exist for delegation').toBe(true);
    expect(existsSync(referenceExportCsvPath), 'reference CSV export action must exist for delegation').toBe(true);
  });

  it('returns typed blockers for unsupported imports without creating jobs or mutating settings data', async () => {
    currentClient.actorPermissions.add('settings.audit.read');

    const { startImportJob } = await loadImportModule();
    const result = await startImportJob({
      target: 'audit_logs',
      fileName: 'audit.csv',
      contentType: 'text/csv',
      csvText: 'event,actor\nlogin,user@example.com\n',
      auditReason: 'restore audit rows',
    });

    expect(result).toEqual({
      ok: false,
      error: 'unsupported_import',
      blockers: [{ code: 'import_not_supported', target: 'audit_logs' }],
    });
    expect(jobInsertCalls(), 'unsupported import must not create import_export_jobs rows').toHaveLength(0);
    expect(currentClient.mutations, 'unsupported import must not mutate domain/settings data').toEqual([]);
  });

  it('requires settings.authorization.edit, a non-empty audit reason, and T-126 V-SET-43/V-SET-44 preflight before authorization-policy import creates a job', async () => {
    const { startImportJob } = await loadImportModule();

    const forbidden = await startImportJob({
      target: 'authorization_policies',
      fileName: 'authorization-policies.csv',
      contentType: 'text/csv',
      csvText: 'policy_code,is_enabled\nnpd_post_release_edit,true\n',
      auditReason: 'bulk policy load approved by owner',
    });
    expect(forbidden).toEqual({ ok: false, error: 'forbidden' });
    expect(statementIndex('role_permissions')).toBeGreaterThanOrEqual(0);
    expect(jobInsertCalls()).toHaveLength(0);
    expect(currentClient.mutations).toEqual([]);

    currentClient.calls.length = 0;
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);
    const missingReason = await startImportJob({
      target: 'authorization_policies',
      fileName: 'authorization-policies.csv',
      contentType: 'text/csv',
      csvText: 'policy_code,is_enabled\nnpd_post_release_edit,true\n',
      auditReason: '   ',
    });
    expect(missingReason).toEqual({ ok: false, error: 'audit_reason_required' });
    expect(jobInsertCalls()).toHaveLength(0);
    expect(currentClient.mutations).toEqual([]);

    currentClient.calls.length = 0;
    currentClient.authorizationPreflightBlockers = [
      { code: 'authorize_permission_missing', check: 'V-SET-43', policyCode: 'npd_post_release_edit' },
      { code: 'min_approvers_invalid', check: 'V-SET-44', policyCode: 'technical_product_spec_approval' },
    ];
    const blocked = await startImportJob({
      target: 'authorization_policies',
      fileName: 'authorization-policies.csv',
      contentType: 'text/csv',
      csvText: 'policy_code,is_enabled\nnpd_post_release_edit,true\ntechnical_product_spec_approval,true\n',
      auditReason: 'bulk policy load approved by owner',
    });

    expect(blocked).toEqual({
      ok: false,
      error: 'authorization_preflight_failed',
      blockers: currentClient.authorizationPreflightBlockers,
    });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('rule_definitions')).toBeGreaterThanOrEqual(0);
    expect(jobInsertCalls(), 'failed T-126 preflight must block job creation').toHaveLength(0);
    expect(currentClient.mutations).toEqual([]);
  });

  it('creates read-only org-scoped export jobs and exposes status/progress/download metadata without mutating exported tables', async () => {
    currentClient.actorPermissions.add('settings.org.read');

    const { startExportJob } = await loadExportModule();
    const { getImportExportJob } = await loadJobsModule();
    const created = await startExportJob({ target: 'users', filters: { status: 'active' } });

    expect(created).toEqual({
      ok: true,
      data: {
        job: {
          id: 'job-1',
          kind: 'export',
          target: 'users',
          status: 'queued',
          progress: { processed: 0, total: 0 },
          download: null,
        },
      },
    });
    expect(jobInsertCalls()).toHaveLength(1);
    expect(callBlob('insert into public.import_export_jobs')).toContain('app.current_org_id()');
    expect(domainMutationCalls(), 'export scheduling is read-only for users/roles/etc.; only the job row may be inserted').toEqual([]);

    currentClient.jobs.set('job-1', {
      ...currentClient.jobs.get('job-1')!,
      status: 'completed',
      progress_processed: 24,
      progress_total: 24,
      download_url: 'https://downloads.example/export/users.csv',
    });
    const status = await getImportExportJob({ jobId: 'job-1' });

    expect(status).toEqual({
      ok: true,
      data: {
        job: {
          id: 'job-1',
          kind: 'export',
          target: 'users',
          status: 'completed',
          progress: { processed: 24, total: 24 },
          download: { url: 'https://downloads.example/export/users.csv', contentType: 'text/csv' },
        },
      },
    });
    expect(callBlob('from public.import_export_jobs')).toContain('app.current_org_id()');
  });
});

async function loadCapabilitiesModule(): Promise<CapabilitiesModule> {
  expect(
    existsSync(capabilitiesPath),
    'apps/web/actions/import-export/capabilities.ts must exist and export listImportExportCapabilities()',
  ).toBe(true);
  const mod = (await import(capabilitiesPath)) as Partial<CapabilitiesModule>;
  if (typeof mod.listImportExportCapabilities !== 'function') {
    expect.fail('capabilities.ts must export listImportExportCapabilities()');
  }
  return mod as CapabilitiesModule;
}

async function loadImportModule(): Promise<ImportModule> {
  expect(existsSync(importPath), 'apps/web/actions/import-export/import.ts must exist and export startImportJob(input)').toBe(true);
  const mod = (await import(importPath)) as Partial<ImportModule>;
  if (typeof mod.startImportJob !== 'function') {
    expect.fail('import.ts must export startImportJob(input)');
  }
  return mod as ImportModule;
}

async function loadExportModule(): Promise<ExportModule> {
  expect(existsSync(exportPath), 'apps/web/actions/import-export/export.ts must exist and export startExportJob(input)').toBe(true);
  const mod = (await import(exportPath)) as Partial<ExportModule>;
  if (typeof mod.startExportJob !== 'function') {
    expect.fail('export.ts must export startExportJob(input)');
  }
  return mod as ExportModule;
}

async function loadJobsModule(): Promise<JobsModule> {
  expect(existsSync(jobsPath), 'apps/web/actions/import-export/jobs.ts must exist and export getImportExportJob(input)').toBe(true);
  const mod = (await import(jobsPath)) as Partial<JobsModule>;
  if (typeof mod.getImportExportJob !== 'function') {
    expect.fail('jobs.ts must export getImportExportJob(input)');
  }
  return mod as JobsModule;
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const jobs = new Map<string, ImportExportJob>();
  const mutations: FakeClient['mutations'] = [];
  return {
    calls,
    actorPermissions: new Set<string>(),
    jobs,
    mutations,
    authorizationPreflightBlockers: [],
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.role_permissions')) {
        const requestedPermission = params.find((param): param is string => typeof param === 'string' && param.includes('.'));
        return currentClient.actorPermissions.has(requestedPermission ?? '')
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from public.org_authorization_policies')) {
        return { rows: makeAuthorizationPolicyRows(), rowCount: 2 };
      }

      if (normalized.includes('from public.rule_definitions')) {
        return { rows: [{ rule_code: 'technical_product_spec_approval_gate_v1', active: true }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.import_export_jobs')) {
        const kind = params.includes('import') ? 'import' : 'export';
        const target = stringParam(params, /^(users|roles|invitations|reference_tables|infrastructure|feature_flags|authorization_policies|audit_logs)$/) ?? 'users';
        const id = `job-${jobs.size + 1}`;
        const row: ImportExportJob = {
          id,
          org_id: ORG_ID,
          kind,
          target,
          status: 'queued',
          progress_processed: 0,
          progress_total: 0,
          download_url: null,
          error_code: null,
          created_by: USER_ID,
        };
        jobs.set(id, row);
        mutations.push({ kind: 'import_export_job_insert', target, orgId: ORG_ID });
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('from public.import_export_jobs')) {
        const jobId = stringParam(params, /^job-/) ?? 'job-1';
        const row = jobs.get(jobId);
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function makeAuthorizationPolicyRows() {
  if (currentClient.authorizationPreflightBlockers.length > 0) {
    return [
      {
        policy_code: 'npd_post_release_edit',
        is_enabled: true,
        authorize_permissions: [],
        approver_role_codes: [],
        requires_new_version: false,
        approval_gate_rule_code: null,
        min_approvers: 0,
      },
      {
        policy_code: 'technical_product_spec_approval',
        is_enabled: true,
        authorize_permissions: ['technical.product_spec.approve'],
        approver_role_codes: ['quality_lead'],
        requires_new_version: true,
        approval_gate_rule_code: 'wrong_gate_v1',
        min_approvers: 0,
      },
    ];
  }
  return [
    {
      policy_code: 'npd_post_release_edit',
      is_enabled: true,
      authorize_permissions: ['npd.released_product_edit.authorize'],
      approver_role_codes: ['owner'],
      requires_new_version: true,
      approval_gate_rule_code: null,
      min_approvers: 1,
    },
    {
      policy_code: 'technical_product_spec_approval',
      is_enabled: true,
      authorize_permissions: ['technical.product_spec.approve'],
      approver_role_codes: ['quality_lead'],
      requires_new_version: true,
      approval_gate_rule_code: 'technical_product_spec_approval_gate_v1',
      min_approvers: 1,
    },
  ];
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function statementIndex(fragment: string): number {
  return currentClient.calls.findIndex((call) => normalize(call.sql).includes(fragment.toLowerCase()));
}

function callBlob(fragment: string): string {
  return currentClient.calls
    .filter((call) => normalize(call.sql).includes(fragment.toLowerCase()))
    .map((call) => `${call.sql} ${JSON.stringify(call.params)}`)
    .join('\n')
    .toLowerCase();
}

function jobInsertCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => normalize(call.sql).includes('insert into public.import_export_jobs'));
}

function domainMutationCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => {
    const normalized = normalize(call.sql);
    if (!/\b(insert|update|delete)\b/.test(normalized)) return false;
    return !normalized.includes('public.import_export_jobs');
  });
}

function stringParam(params: readonly unknown[], pattern: RegExp): string | undefined {
  return params.find((param): param is string => typeof param === 'string' && pattern.test(param));
}
