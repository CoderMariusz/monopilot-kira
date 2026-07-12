import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidateLocalized } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

const repoRoot = resolve(__dirname, '../../../..');
const preflightPath = resolve(repoRoot, 'apps/web/actions/authorization/preflight.ts');
const policyActionsPath = resolve(repoRoot, 'apps/web/actions/authorization/policy-actions.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
const AUTHORIZER_ID = '44444444-4444-4444-8444-444444444444';

const NPD_POLICY = 'npd_post_release_edit';
const TECHNICAL_POLICY = 'technical_product_spec_approval';
const CUSTOM_POLICY = 'qa_batch_release_authorization';
const TECHNICAL_GATE = 'technical_product_spec_approval_gate_v1';
const SETTINGS_AUTHORIZATION_EDIT = 'settings.authorization.edit';

const expectedNpdPolicyBlockers = [
  { code: 'policy_disabled', policyCode: NPD_POLICY },
  { code: 'request_permission_missing', policyCode: NPD_POLICY },
  { code: 'authorize_permission_missing', policyCode: NPD_POLICY },
  { code: 'authorizer_role_missing', policyCode: NPD_POLICY },
  { code: 'self_authorization', policyCode: NPD_POLICY },
  { code: 'requires_new_version_required', policyCode: NPD_POLICY },
];

const expectedTechnicalBlockers = [
  { code: 'approval_policy_disabled', policyCode: TECHNICAL_POLICY },
  { code: 'gate_rule_missing', policyCode: TECHNICAL_POLICY },
  { code: 'min_approvers_invalid', policyCode: TECHNICAL_POLICY },
  { code: 'approver_role_missing', policyCode: TECHNICAL_POLICY },
];

type QueryCall = { sql: string; params: readonly unknown[] };
type PolicyRow = {
  org_id: string;
  policy_code: string;
  is_enabled: boolean;
  request_permissions: string[];
  authorize_permissions: string[];
  approver_role_codes: string[];
  min_approvers: number;
  require_segregation_of_duties: boolean;
  requires_new_version: boolean;
  approval_gate_rule_code: string | null;
  version: number;
  settings_json: Record<string, unknown>;
  updated_by?: string;
};
type FakeClient = {
  calls: QueryCall[];
  policies: PolicyRow[];
  actorPermissions: Set<string>;
  activeGateRules: Set<string>;
  mutations: Array<{ kind: string; policyCode?: string; orgId?: string }>;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type PreflightModule = {
  runNpdPostReleaseEditPreflight: (input: {
    client: FakeClient;
    requesterUserId: string;
    authorizerUserId: string;
    policyCode?: string;
  }) => Promise<unknown>;
  runTechnicalApprovalPreflight: (input: {
    client: FakeClient;
    policyCode?: string;
  }) => Promise<unknown>;
};

type ActionsModule = {
  updateAuthorizationPolicy: (input: {
    policyCode: string;
    patch: Partial<PolicyRow>;
    auditReason?: string;
  }) => Promise<unknown>;
  initializeAuthorizationPolicies: () => Promise<unknown>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('authorization policy helpers and preflights (TASK-000216/T-126 RED)', () => {
  it('returns a typed NPD blocker when the post-release edit policy row is missing', async () => {
    currentClient.policies = currentClient.policies.filter((policy) => policy.policy_code !== NPD_POLICY);

    const { runNpdPostReleaseEditPreflight } = await loadPreflightModule();
    const result = await runNpdPostReleaseEditPreflight({
      client: currentClient,
      requesterUserId: REQUESTER_ID,
      authorizerUserId: AUTHORIZER_ID,
    });

    expect(result).toEqual({ ok: false, blockers: [{ code: 'policy_missing', policyCode: NPD_POLICY }] });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(currentClient.mutations).toEqual([]);
  });

  it('returns typed NPD blockers for disabled policy, missing permissions, missing authorizer role, self-authorization, and requires_new_version=false', async () => {
    replacePolicy({
      policy_code: NPD_POLICY,
      is_enabled: false,
      request_permissions: [],
      authorize_permissions: [],
      approver_role_codes: [],
      requires_new_version: false,
    });

    const { runNpdPostReleaseEditPreflight } = await loadPreflightModule();
    const result = await runNpdPostReleaseEditPreflight({
      client: currentClient,
      requesterUserId: ACTOR_ID,
      authorizerUserId: ACTOR_ID,
    });

    expect(result).toEqual({ ok: false, blockers: expectedNpdPolicyBlockers });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(currentClient.mutations).toEqual([]);
  });

  it('returns typed Technical approval blockers for inactive gate, invalid min_approvers, missing approver role, and disabled policy', async () => {
    currentClient.activeGateRules.clear();
    replacePolicy({
      policy_code: TECHNICAL_POLICY,
      is_enabled: false,
      approver_role_codes: [],
      min_approvers: 0,
      approval_gate_rule_code: TECHNICAL_GATE,
    });

    const { runTechnicalApprovalPreflight } = await loadPreflightModule();
    const result = await runTechnicalApprovalPreflight({ client: currentClient });

    expect(result).toEqual({ ok: false, blockers: expectedTechnicalBlockers });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('rule_definitions')).toBeGreaterThanOrEqual(0);
    const gateRuleSql = callBlob('rule_definitions').toLowerCase();
    expect(gateRuleSql).not.toContain('is_active');
    expect(gateRuleSql).toContain('active_from <= now()');
    expect(gateRuleSql).toContain('active_to is null');
    expect(gateRuleSql).toContain('active_to > now()');
    expect(currentClient.mutations).toEqual([]);
  });

  it('rejects policy updates without settings.authorization.edit before any mutation', async () => {
    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: NPD_POLICY,
      auditReason: 'tighten post-release approval',
      patch: { approver_role_codes: ['quality_lead'] } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(statementIndex('role_permissions')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
    expect(currentClient.mutations).toEqual([]);
  });

  it('requires a non-empty audit reason before updating authorization policy state', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);

    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: NPD_POLICY,
      auditReason: '   ',
      patch: { approver_role_codes: ['quality_lead'] } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: false, error: 'audit_reason_required' });
    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
    expect(currentClient.mutations).toEqual([]);
  });

  it('increments version and isolates policy updates to app.current_org_id()', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);
    currentClient.policies.push({ ...validNpdPolicy(), org_id: OTHER_ORG_ID, version: 3 });

    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: NPD_POLICY,
      auditReason: 'tighten post-release approval',
      patch: { approver_role_codes: ['quality_lead', 'npd_manager'] } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: true, data: { policyCode: NPD_POLICY, version: 8 } });
    expect(policyFor(ORG_ID, NPD_POLICY)?.version).toBe(8);
    expect(policyFor(OTHER_ORG_ID, NPD_POLICY)?.version).toBe(3);
    expect(callBlob('update public.org_authorization_policies')).toContain('app.current_org_id()');
    const auditCall = currentClient.calls[statementIndex('insert into public.audit_events')]!;
    const auditSql = auditCall.sql.toLowerCase();
    expect(auditSql).toContain('action');
    expect(auditSql).toContain('resource_type');
    expect(auditSql).toContain('resource_id');
    expect(auditSql).toContain('request_id');
    expect(auditSql).toContain('after_state');
    expect(auditSql).not.toContain('event_type');
    expect(auditSql).not.toContain('subject_type');
    expect(auditSql).not.toContain('subject_id');
    expect(auditSql).not.toContain('reason');
    expect(auditSql).not.toContain('metadata');
    expect(String(auditCall.params[5])).toContain('audit_reason');
    const outboxCall = currentClient.calls[statementIndex('insert into public.outbox_events')]!;
    const outboxSql = `${outboxCall.sql} ${JSON.stringify(outboxCall.params)}`.toLowerCase();
    expect(outboxSql).toContain('aggregate_id');
    expect(outboxSql).not.toContain('null');
    expect(outboxCall.params).toContain('audit.recorded');
    expect(outboxCall.params).not.toContain('settings.authorization_policy.updated');
    expect(currentClient.mutations).toEqual([
      { kind: 'policy_update', policyCode: NPD_POLICY, orgId: ORG_ID },
      { kind: 'audit', policyCode: NPD_POLICY, orgId: ORG_ID },
      { kind: 'outbox', policyCode: NPD_POLICY, orgId: ORG_ID },
    ]);
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/authorization');
  });

  it('accepts any policy code that exists in org_authorization_policies instead of a hard-coded whitelist', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);
    currentClient.policies.push(validCustomPolicy());

    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: CUSTOM_POLICY,
      auditReason: 'enable QA release approval',
      patch: { approver_role_codes: ['qa_manager'] } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: true, data: { policyCode: CUSTOM_POLICY, version: 3 } });
    expect(policyFor(ORG_ID, CUSTOM_POLICY)?.version).toBe(3);
    expect(statementIndex('update public.org_authorization_policies')).toBeGreaterThanOrEqual(0);
  });

  it('rejects genuinely unknown policy codes without mutating state', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);

    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: 'does_not_exist',
      auditReason: 'bad policy',
      patch: { approver_role_codes: ['qa_manager'] } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: false, error: 'policy_not_found' });
    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
    expect(currentClient.mutations).toEqual([]);
  });

  it('rejects technical dual-sign policy updates with min_approvers < 2 at the mutation boundary', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);

    const { updateAuthorizationPolicy } = await loadActionsModule();
    const result = await updateAuthorizationPolicy({
      policyCode: TECHNICAL_POLICY,
      auditReason: 'invalid dual-sign config',
      patch: {
        min_approvers: 1,
        settings_json: { require_dual_sign_off: true },
      } as Partial<PolicyRow>,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
    expect(currentClient.mutations).toEqual([]);
  });

  it('initializeAuthorizationPolicies calls the org seed function when the editor has permission', async () => {
    currentClient.actorPermissions.add(SETTINGS_AUTHORIZATION_EDIT);

    const { initializeAuthorizationPolicies } = await loadActionsModule();
    const result = await initializeAuthorizationPolicies();

    expect(result).toEqual({ ok: true });
    expect(callBlob('seed_authorization_policies_for_org')).toContain(ORG_ID);
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/authorization');
  });

  it('initializeAuthorizationPolicies is forbidden without settings.authorization.edit', async () => {
    const { initializeAuthorizationPolicies } = await loadActionsModule();
    const result = await initializeAuthorizationPolicies();

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(statementIndex('seed_authorization_policies_for_org')).toBe(-1);
  });

});

async function loadPreflightModule(): Promise<PreflightModule> {
  expect(existsSync(preflightPath), 'apps/web/actions/authorization/preflight.ts must exist and export authorization preflight helpers').toBe(true);
  const mod = (await import(preflightPath)) as Partial<PreflightModule>;
  if (typeof mod.runNpdPostReleaseEditPreflight !== 'function') {
    expect.fail('preflight.ts must export runNpdPostReleaseEditPreflight(input)');
  }
  if (typeof mod.runTechnicalApprovalPreflight !== 'function') {
    expect.fail('preflight.ts must export runTechnicalApprovalPreflight(input)');
  }
  return mod as PreflightModule;
}

async function loadActionsModule(): Promise<ActionsModule> {
  expect(existsSync(policyActionsPath), 'apps/web/actions/authorization/policy-actions.ts must exist and export updateAuthorizationPolicy').toBe(true);
  const mod = (await import(policyActionsPath)) as Partial<ActionsModule>;
  if (typeof mod.updateAuthorizationPolicy !== 'function') {
    expect.fail('policy-actions.ts must export updateAuthorizationPolicy(input)');
  }
  if (typeof mod.initializeAuthorizationPolicies !== 'function') {
    expect.fail('policy-actions.ts must export initializeAuthorizationPolicies()');
  }
  return mod as ActionsModule;
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    policies: [validNpdPolicy(), validTechnicalPolicy()],
    actorPermissions: new Set<string>(),
    activeGateRules: new Set<string>([TECHNICAL_GATE]),
    mutations: [],
    query: async (sql: string, params: readonly unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('role_permissions')) {
        const permission = params.find((param): param is string => param === SETTINGS_AUTHORIZATION_EDIT);
        return client.actorPermissions.has(permission ?? '') ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('org_authorization_policies') && normalized.includes('select')) {
        const policyCode = params.find((param): param is string => typeof param === 'string' && client.policies.some((policy) => policy.policy_code === param));
        const row = policyCode ? policyFor(ORG_ID, policyCode) : undefined;
        return { rows: row ? [{ ...row, enabled: row.is_enabled }] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('rule_definitions')) {
        const gateCode = params.find((param): param is string => typeof param === 'string' && param === TECHNICAL_GATE);
        return gateCode && client.activeGateRules.has(gateCode)
          ? { rows: [{ rule_code: gateCode, active_from: '2026-01-01T00:00:00Z', active_to: null }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('update public.org_authorization_policies')) {
        const policyCode = params.find((param): param is string => typeof param === 'string' && client.policies.some((policy) => policy.policy_code === param));
        const row = policyCode ? policyFor(ORG_ID, policyCode) : undefined;
        if (!row) return { rows: [], rowCount: 0 };
        row.version += 1;
        row.updated_by = ACTOR_ID;
        client.mutations.push({ kind: 'policy_update', policyCode, orgId: ORG_ID });
        return { rows: [{ policy_code: policyCode, version: row.version }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.audit_events')) {
        const policyCode = params.find((param): param is string => typeof param === 'string' && client.policies.some((policy) => policy.policy_code === param));
        client.mutations.push({ kind: 'audit', policyCode, orgId: ORG_ID });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        const policyCode = params.find((param): param is string => typeof param === 'string' && client.policies.some((policy) => policy.policy_code === param))
          ?? policyCodeFromJsonParam(params);
        client.mutations.push({ kind: 'outbox', policyCode, orgId: ORG_ID });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('seed_authorization_policies_for_org')) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function validNpdPolicy(): PolicyRow {
  return {
    org_id: ORG_ID,
    policy_code: NPD_POLICY,
    is_enabled: true,
    request_permissions: ['npd.released_product_edit.request'],
    authorize_permissions: ['npd.released_product_edit.authorize'],
    approver_role_codes: ['npd_manager'],
    min_approvers: 1,
    require_segregation_of_duties: true,
    requires_new_version: true,
    approval_gate_rule_code: null,
    version: 7,
    settings_json: {},
  };
}

function validTechnicalPolicy(): PolicyRow {
  return {
    org_id: ORG_ID,
    policy_code: TECHNICAL_POLICY,
    is_enabled: true,
    request_permissions: [],
    authorize_permissions: ['technical.product_spec.approve'],
    approver_role_codes: ['quality_lead'],
    min_approvers: 1,
    require_segregation_of_duties: true,
    requires_new_version: false,
    approval_gate_rule_code: TECHNICAL_GATE,
    version: 4,
    settings_json: {},
  };
}

function validCustomPolicy(): PolicyRow {
  return {
    org_id: ORG_ID,
    policy_code: CUSTOM_POLICY,
    is_enabled: true,
    request_permissions: ['qa.batch_release.request'],
    authorize_permissions: ['qa.batch_release.authorize'],
    approver_role_codes: ['qa_lead'],
    min_approvers: 1,
    require_segregation_of_duties: true,
    requires_new_version: false,
    approval_gate_rule_code: null,
    version: 2,
    settings_json: {},
  };
}

function replacePolicy(overrides: Partial<PolicyRow> & Pick<PolicyRow, 'policy_code'>): void {
  const base = overrides.policy_code === NPD_POLICY ? validNpdPolicy() : validTechnicalPolicy();
  const next = { ...base, ...overrides };
  currentClient.policies = currentClient.policies.filter(
    (policy) => !(policy.org_id === ORG_ID && policy.policy_code === next.policy_code),
  );
  currentClient.policies.push(next);
}

function policyFor(orgId: string, policyCode: string): (PolicyRow & { updated_by?: string }) | undefined {
  return currentClient.policies.find((policy) => policy.org_id === orgId && policy.policy_code === policyCode) as
    | (PolicyRow & { updated_by?: string })
    | undefined;
}

function policyCodeFromJsonParam(params: readonly unknown[]): string | undefined {
  for (const param of params) {
    if (typeof param !== 'string' || !param.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(param) as { policy_code?: unknown };
      if (typeof parsed.policy_code === 'string') return parsed.policy_code;
    } catch {
      // Ignore non-JSON string params.
    }
  }
  return undefined;
}

function statementIndex(fragment: string): number {
  const lowerFragment = fragment.toLowerCase();
  return currentClient.calls.findIndex((call) => call.sql.replace(/\s+/g, ' ').toLowerCase().includes(lowerFragment));
}

function callBlob(fragment: string): string {
  const index = statementIndex(fragment);
  expect(index, `${fragment} statement must be executed`).toBeGreaterThanOrEqual(0);
  const call = currentClient.calls[index]!;
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
