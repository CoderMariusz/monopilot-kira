import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../..');
const setCoreFlagPath = resolve(repoRoot, 'apps/web/actions/flags/set-core.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type CoreFlagResult =
  | { ok: true; data: { flagCode: string; enabled: boolean } }
  | {
      ok: false;
      error: string;
      failedChecks?: string[];
      policyCode?: string;
    };

type SetCoreFlag = {
  setCoreFlag: (input: { flagCode: string; enabled: boolean; auditReason?: string }) => Promise<CoreFlagResult>;
};

type QueryCall = { sql: string; params: unknown[] };
type PolicyRow = {
  policy_code: 'npd_post_release_edit' | 'technical_product_spec_approval';
  enabled: boolean;
  authorize_role_count?: number;
  requires_new_version?: boolean;
  approval_gate_rule_code?: string | null;
  min_approvers?: number;
};

type FakeClient = {
  calls: QueryCall[];
  featureFlags: Map<string, boolean>;
  d365ConstantsPopulated: number;
  d365ConnectionPassed: boolean;
  policies: Map<string, PolicyRow>;
  auditEvents: Array<{ action: string; resourceId: string }>;
  outboxEvents: Array<{ eventType: string; payload: unknown }>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('setCoreFlag Server Action (TASK-000106/T-020 RED)', () => {
  it('blocks integration.d365.enabled=true until V-SET-42/V-SET-50/V-SET-52 D365 preflights pass and leaves no partial writes', async () => {
    currentClient.d365ConstantsPopulated = 3;
    currentClient.d365ConnectionPassed = false;

    const { setCoreFlag } = await loadSetCoreFlag();
    const result = await setCoreFlag({
      flagCode: 'integration.d365.enabled',
      enabled: true,
      auditReason: 'enable D365 only after constants and connection pass',
    });

    expect(result).toEqual({
      ok: false,
      error: 'd365_preflight_failed',
      failedChecks: ['V-SET-42', 'V-SET-50', 'V-SET-52'],
    });
    expect(statementIndex('d365_constants')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('d365_connection')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('feature_flags_core')).toBe(-1);
    expect(currentClient.featureFlags.get('integration.d365.enabled')).toBe(false);
    expect(currentClient.auditEvents).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
  });

  it('blocks npd.post_release_edit.enabled=true unless the T-126 npd_post_release_edit policy satisfies V-SET-43', async () => {
    currentClient.policies.set('npd_post_release_edit', {
      policy_code: 'npd_post_release_edit',
      enabled: true,
      authorize_role_count: 0,
      requires_new_version: false,
    });

    const { setCoreFlag } = await loadSetCoreFlag();
    const result = await setCoreFlag({
      flagCode: 'npd.post_release_edit.enabled',
      enabled: true,
      auditReason: 'enable post-release edit workflow',
    });

    expect(result).toEqual({
      ok: false,
      error: 'authorization_policy_failed',
      policyCode: 'npd_post_release_edit',
      failedChecks: ['V-SET-43'],
    });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('feature_flags_core')).toBe(-1);
    expect(currentClient.featureFlags.get('npd.post_release_edit.enabled')).toBe(false);
    expect(currentClient.auditEvents).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
  });

  it('blocks technical.product_spec_approval.required=true unless the T-126 technical gate policy satisfies V-SET-44', async () => {
    currentClient.policies.set('technical_product_spec_approval', {
      policy_code: 'technical_product_spec_approval',
      enabled: true,
      approval_gate_rule_code: 'wrong_gate_v1',
      min_approvers: 0,
    });

    const { setCoreFlag } = await loadSetCoreFlag();
    const result = await setCoreFlag({
      flagCode: 'technical.product_spec_approval.required',
      enabled: true,
      auditReason: 'require technical approval before factory use',
    });

    expect(result).toEqual({
      ok: false,
      error: 'authorization_policy_failed',
      policyCode: 'technical_product_spec_approval',
      failedChecks: ['V-SET-44'],
    });
    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('technical_product_spec_approval_gate_v1')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('feature_flags_core')).toBe(-1);
    expect(currentClient.featureFlags.get('technical.product_spec_approval.required')).toBe(false);
    expect(currentClient.auditEvents).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);
  });

  it('allows maintenance_mode flips that have no D365/Auth workflow preflight and writes the core flag', async () => {
    const { setCoreFlag } = await loadSetCoreFlag();
    const result = await setCoreFlag({
      flagCode: 'maintenance_mode',
      enabled: true,
      auditReason: 'planned maintenance window',
    });

    expect(result).toEqual({ ok: true, data: { flagCode: 'maintenance_mode', enabled: true } });
    expect(currentClient.featureFlags.get('maintenance_mode')).toBe(true);
    expect(statementIndex('d365_constants')).toBe(-1);
    expect(statementIndex('org_authorization_policies')).toBe(-1);
  });

  it('writes exactly one audit-triggered row and one outbox event for each successful feature_flags_core change', async () => {
    const { setCoreFlag } = await loadSetCoreFlag();
    const result = await setCoreFlag({
      flagCode: 'scanner.pwa.enabled',
      enabled: true,
      auditReason: 'scanner rollout approved',
    });

    expect(result.ok).toBe(true);
    expect(currentClient.featureFlags.get('scanner.pwa.enabled')).toBe(true);
    expect(currentClient.auditEvents).toEqual([
      { action: 'feature_flags_core.update', resourceId: 'scanner.pwa.enabled' },
    ]);
    expect(currentClient.outboxEvents).toHaveLength(1);
    expect(currentClient.outboxEvents[0]?.eventType).toBe('settings.core_flag.updated');
    expect(callBlob(outboxCall())).toContain(ORG_ID);
    expect(callBlob(outboxCall())).toContain(USER_ID);
    expect(callBlob(outboxCall())).toContain('scanner.pwa.enabled');
    expect(statementIndex('insert into public.audit_events')).toBe(-1);
    expect(statementIndex('insert into public.audit_log')).toBe(-1);
    expect(_revalidatePath).toHaveBeenCalledWith('/settings/flags');
  });
});

async function loadSetCoreFlag(): Promise<SetCoreFlag> {
  expect(
    existsSync(setCoreFlagPath),
    'apps/web/actions/flags/set-core.ts must exist and export setCoreFlag(input)',
  ).toBe(true);

  const mod = (await import(setCoreFlagPath)) as Partial<SetCoreFlag>;
  if (typeof mod.setCoreFlag !== 'function') {
    expect.fail('apps/web/actions/flags/set-core.ts must export setCoreFlag(input)');
  }
  return mod as SetCoreFlag;
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const featureFlags = new Map<string, boolean>([
    ['integration.d365.enabled', false],
    ['npd.post_release_edit.enabled', false],
    ['technical.product_spec_approval.required', false],
    ['maintenance_mode', false],
    ['scanner.pwa.enabled', false],
  ]);
  const policies = new Map<string, PolicyRow>([
    [
      'npd_post_release_edit',
      {
        policy_code: 'npd_post_release_edit',
        enabled: true,
        authorize_role_count: 1,
        requires_new_version: true,
      },
    ],
    [
      'technical_product_spec_approval',
      {
        policy_code: 'technical_product_spec_approval',
        enabled: true,
        approval_gate_rule_code: 'technical_product_spec_approval_gate_v1',
        min_approvers: 1,
      },
    ],
  ]);
  const client: FakeClient = {
    calls,
    featureFlags,
    d365ConstantsPopulated: 5,
    d365ConnectionPassed: true,
    policies,
    auditEvents: [],
    outboxEvents: [],
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('user_roles') || normalized.includes('role_permissions')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (normalized.includes('d365_constants')) {
        return {
          rows: Array.from({ length: client.d365ConstantsPopulated }, (_, index) => ({
            key: `D365_REQUIRED_${index + 1}`,
            value: `configured-${index + 1}`,
          })),
          rowCount: client.d365ConstantsPopulated,
        };
      }

      if (normalized.includes('d365_connection') || normalized.includes('test connection')) {
        return {
          rows: client.d365ConnectionPassed ? [{ ok: true, passed: true }] : [],
          rowCount: client.d365ConnectionPassed ? 1 : 0,
        };
      }

      if (normalized.includes('org_authorization_policies')) {
        const policyCode = params.find((param): param is string => typeof param === 'string' && policies.has(param));
        const row = policyCode ? policies.get(policyCode) : undefined;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('technical_product_spec_approval_gate_v1')) {
        return { rows: [{ rule_code: 'technical_product_spec_approval_gate_v1', active: true }], rowCount: 1 };
      }

      if (normalized.includes('from public.feature_flags_core') || normalized.includes('from feature_flags_core')) {
        const flagCode = params.find((param): param is string => typeof param === 'string' && featureFlags.has(param));
        if (!flagCode) return { rows: [], rowCount: 0 };
        return {
          rows: [{ org_id: ORG_ID, flag_code: flagCode, is_enabled: featureFlags.get(flagCode) }],
          rowCount: 1,
        };
      }

      if (normalized.includes('feature_flags_core') && (normalized.includes('insert') || normalized.includes('update'))) {
        const flagCode = params.find((param): param is string => typeof param === 'string' && featureFlags.has(param));
        const enabled = params.find((param): param is boolean => typeof param === 'boolean');
        if (flagCode && typeof enabled === 'boolean') {
          featureFlags.set(flagCode, enabled);
          client.auditEvents.push({ action: 'feature_flags_core.update', resourceId: flagCode });
          return { rows: [{ flag_code: flagCode, is_enabled: enabled }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('insert into public.outbox_events') || normalized.includes('insert into outbox_events')) {
        const eventType = params.find((param): param is string => param === 'settings.core_flag.updated');
        client.outboxEvents.push({ eventType: eventType ?? 'unknown', payload: params });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.audit_events') || normalized.includes('insert into public.audit_log')) {
        client.auditEvents.push({ action: 'explicit_audit_insert', resourceId: 'explicit' });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function statementIndex(fragment: string): number {
  const lowerFragment = fragment.toLowerCase();
  return currentClient.calls.findIndex((call) => call.sql.replace(/\s+/g, ' ').toLowerCase().includes(lowerFragment));
}

function outboxCall(): QueryCall {
  const index = statementIndex('insert into public.outbox_events');
  expect(index, 'setCoreFlag must write one outbox event transactionally on success').toBeGreaterThanOrEqual(0);
  return currentClient.calls[index]!;
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
