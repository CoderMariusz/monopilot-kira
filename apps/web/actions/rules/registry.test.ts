import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

const repoRoot = resolve(__dirname, '../../../..');
const listRulesPath = resolve(repoRoot, 'apps/web/actions/rules/list.ts');
const getRulePath = resolve(repoRoot, 'apps/web/actions/rules/get.ts');
const listRuleDryRunsPath = resolve(repoRoot, 'apps/web/actions/rules/dry-runs.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_RULE_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_RULE_ID = '44444444-4444-4444-8444-444444444444';

type ActionResult<TData> = { ok: true; data: TData } | { ok: false; error: string };
type QueryCall = { sql: string; params: unknown[] };
type RuleRow = {
  id: string;
  rule_code: string;
  rule_type: string;
  department_code: string;
  version: number;
  active_from: string;
  active_to: string | null;
  definition_json: Record<string, unknown>;
  deploy_ref: string;
  deployed_by: string;
};
type DryRunRow = {
  id: string;
  rule_definition_id: string;
  rule_code: string;
  status: 'passed' | 'failed';
  sample_input_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  warnings: string[];
  ran_at: string;
  ran_by: string;
};
type FakeClient = {
  authorized: boolean;
  calls: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
};

type ListRulesModule = {
  listRules: (input: {
    ruleType?: string;
    departmentCode?: string;
    active?: boolean;
    dryRunStatus?: 'passed' | 'failed';
  }) => Promise<ActionResult<{ rules: Array<Record<string, unknown>> }>>;
};

type GetRuleModule = {
  getRule: (input: { ruleCode: string }) => Promise<ActionResult<Record<string, unknown>>>;
};

type ListRuleDryRunsModule = {
  listRuleDryRuns: (input: { ruleCode: string; status?: 'passed' | 'failed'; limit?: number }) => Promise<ActionResult<{ dryRuns: Array<Record<string, unknown>> }>>;
};

let currentClient: FakeClient;

const ruleRows: RuleRow[] = [
  {
    id: ACTIVE_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    rule_type: 'gate',
    department_code: 'quality',
    version: 2,
    active_from: '2026-05-01T00:00:00.000Z',
    active_to: null,
    definition_json: { type: 'gate', mermaid: 'graph TD; A-->B', checks: ['cleaning', 'atp'] },
    deploy_ref: 'git:active-v2',
    deployed_by: 'deploy-bot',
  },
  {
    id: PREVIOUS_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    rule_type: 'gate',
    department_code: 'quality',
    version: 1,
    active_from: '2026-04-01T00:00:00.000Z',
    active_to: '2026-05-01T00:00:00.000Z',
    definition_json: { type: 'gate', mermaid: 'graph TD; A-->C', checks: ['cleaning'] },
    deploy_ref: 'git:previous-v1',
    deployed_by: 'deploy-bot',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    rule_code: 'npd_pack_size_line_cascade',
    rule_type: 'cascading',
    department_code: 'npd',
    version: 3,
    active_from: '2026-05-02T00:00:00.000Z',
    active_to: null,
    definition_json: { type: 'cascading' },
    deploy_ref: 'git:cascade-v3',
    deployed_by: 'deploy-bot',
  },
];

const dryRunRows: DryRunRow[] = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    rule_definition_id: ACTIVE_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    status: 'failed',
    sample_input_json: { product: 'milk', line: 'L1' },
    result_json: { allowed: false, reason: 'ATP missing' },
    warnings: ['missing-atp'],
    ran_at: '2026-05-18T12:00:00.000Z',
    ran_by: 'qa-user',
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    rule_definition_id: PREVIOUS_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    status: 'passed',
    sample_input_json: { product: 'milk', line: 'L1' },
    result_json: { allowed: true },
    warnings: [],
    ran_at: '2026-04-18T12:00:00.000Z',
    ran_by: 'qa-user',
  },
];

describe('rule registry Server Actions (TASK-000134/T-025 RED)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    currentClient = makeClient({ authorized: true });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
    );
  });

  it('listRules applies type, dept, active, and dry-run-fail filters through withOrgContext without writes', async () => {
    const { listRules } = await loadListRules();

    const result = await listRules({
      ruleType: 'gate',
      departmentCode: 'quality',
      active: true,
      dryRunStatus: 'failed',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        rules: [
          expect.objectContaining({
            ruleCode: 'quality_allergen_changeover_gate',
            ruleType: 'gate',
            departmentCode: 'quality',
            activeVersion: 2,
            latestDryRunStatus: 'failed',
          }),
        ],
      },
    });
    expect(_withOrgContextRunner).toHaveBeenCalledTimes(1);
    expect(statementIndex('from public.rule_definitions')).toBeGreaterThanOrEqual(0);
    expect(writeCalls(), 'rule registry list is read-only and must not mutate DB/audit/outbox').toHaveLength(0);
  });

  it('getRule resolves the active version and returns detail tabs: definitionJson, versions, dryRuns, and auditSummary', async () => {
    const { getRule } = await loadGetRule();

    const result = await getRule({ ruleCode: 'quality_allergen_changeover_gate' });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        ruleCode: 'quality_allergen_changeover_gate',
        activeVersion: 2,
        definitionJson: ruleRows[0]!.definition_json,
        versions: [
          expect.objectContaining({ version: 2, isActive: true, deployRef: 'git:active-v2' }),
          expect.objectContaining({ version: 1, isActive: false, deployRef: 'git:previous-v1' }),
        ],
        dryRuns: [expect.objectContaining({ status: 'failed', sampleInputJson: dryRunRows[0]!.sample_input_json })],
        auditSummary: expect.objectContaining({ deployCount: 2, lastDeployRef: 'git:active-v2' }),
      }),
    });
    expect(statementIndex('order by version desc')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('from public.rule_dry_runs')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('from public.audit_log')).toBeGreaterThanOrEqual(0);
    expect(writeCalls(), 'rule detail is read-only and must not mutate DB/audit/outbox').toHaveLength(0);
  });

  it('returns forbidden before registry reads when caller lacks settings.rules.view permission, including dry-run query', async () => {
    currentClient = makeClient({ authorized: false });

    const { listRules } = await loadListRules();
    const { getRule } = await loadGetRule();
    const { listRuleDryRuns } = await loadListRuleDryRuns();

    await expect(listRules({ active: true })).resolves.toEqual({ ok: false, error: 'forbidden' });
    await expect(getRule({ ruleCode: 'quality_allergen_changeover_gate' })).resolves.toEqual({ ok: false, error: 'forbidden' });
    await expect(listRuleDryRuns({ ruleCode: 'quality_allergen_changeover_gate', status: 'failed' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(statementIndex('settings.rules.view')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('from public.rule_definitions')).toBe(-1);
    expect(statementIndex('from public.rule_dry_runs')).toBe(-1);
    expect(writeCalls(), 'RBAC denial path must be fail-closed and read-only').toHaveLength(0);
  });
});

async function loadListRules(): Promise<ListRulesModule> {
  expect(existsSync(listRulesPath), 'apps/web/actions/rules/list.ts must exist and export listRules(input)').toBe(true);
  const mod = (await import(listRulesPath)) as Partial<ListRulesModule>;
  if (typeof mod.listRules !== 'function') {
    expect.fail('apps/web/actions/rules/list.ts must export listRules(input)');
  }
  return mod as ListRulesModule;
}

async function loadGetRule(): Promise<GetRuleModule> {
  expect(existsSync(getRulePath), 'apps/web/actions/rules/get.ts must exist and export getRule(input)').toBe(true);
  const mod = (await import(getRulePath)) as Partial<GetRuleModule>;
  if (typeof mod.getRule !== 'function') {
    expect.fail('apps/web/actions/rules/get.ts must export getRule(input)');
  }
  return mod as GetRuleModule;
}

async function loadListRuleDryRuns(): Promise<ListRuleDryRunsModule> {
  expect(existsSync(listRuleDryRunsPath), 'apps/web/actions/rules/dry-runs.ts must exist and export listRuleDryRuns(input)').toBe(true);
  const mod = (await import(listRuleDryRunsPath)) as Partial<ListRuleDryRunsModule>;
  if (typeof mod.listRuleDryRuns !== 'function') {
    expect.fail('apps/web/actions/rules/dry-runs.ts must export listRuleDryRuns(input)');
  }
  return mod as ListRuleDryRunsModule;
}

function makeClient({ authorized }: { authorized: boolean }): FakeClient {
  const calls: QueryCall[] = [];
  return {
    authorized,
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalizeSql(sql);
      const paramsBlob = JSON.stringify(params).toLowerCase();

      if (normalized.includes('user_roles') || normalized.includes('role_permissions') || normalized.includes('from public.roles')) {
        if (!normalized.includes('role_permissions') || !paramsBlob.includes('settings.rules.view')) {
          return { rows: [], rowCount: 0 };
        }
        return authorized ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from public.rule_dry_runs')) {
        const filtered = dryRunRows
          .filter((row) => (!paramsBlob.includes('failed') && !paramsBlob.includes('passed')) || paramsBlob.includes(row.status))
          .filter((row) => !paramsBlob.includes('quality_allergen_changeover_gate') || row.rule_code === 'quality_allergen_changeover_gate')
          .sort((a, b) => b.ran_at.localeCompare(a.ran_at));
        return { rows: filtered as unknown as Record<string, unknown>[], rowCount: filtered.length };
      }

      if (normalized.includes('from public.audit_log')) {
        const rows = ruleRows.map((row) => ({
          action: 'rule_deploy',
          deploy_ref: row.deploy_ref,
          user_id: row.deployed_by,
          created_at: row.active_from,
          new_data: row.definition_json,
        }));
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('from public.rule_definitions')) {
        let rows = [...ruleRows];
        if (normalized.includes('rule_type') && paramsBlob.includes('gate')) rows = rows.filter((row) => row.rule_type === 'gate');
        if ((normalized.includes('department_code') || normalized.includes('dept')) && paramsBlob.includes('quality')) {
          rows = rows.filter((row) => row.department_code === 'quality');
        }
        if (normalized.includes('active_to') || normalized.includes('is_active')) rows = rows.filter((row) => row.active_to === null);
        if (normalized.includes('rule_dry_runs') && paramsBlob.includes('failed')) {
          const failedRuleIds = new Set(dryRunRows.filter((row) => row.status === 'failed').map((row) => row.rule_definition_id));
          rows = rows.filter((row) => failedRuleIds.has(row.id));
        }
        if (paramsBlob.includes('quality_allergen_changeover_gate')) {
          rows = ruleRows.filter((row) => row.rule_code === 'quality_allergen_changeover_gate');
        }
        rows.sort((a, b) => b.version - a.version);
        return { rows: rows as unknown as Record<string, unknown>[], rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function statementIndex(fragment: string): number {
  const lowerFragment = fragment.toLowerCase();
  return currentClient.calls.findIndex((call) => callBlob(call).toLowerCase().includes(lowerFragment));
}

function writeCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => /\b(insert|update|delete|truncate|alter|drop|create)\b/i.test(normalizeSql(call.sql)));
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
