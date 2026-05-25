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
const ACTIVE_GATE_RULE_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_GATE_RULE_ID = '44444444-4444-4444-8444-444444444444';
const FIRST_GATE_RULE_ID = '55555555-5555-4555-8555-555555555555';
const CASCADE_RULE_ID = '66666666-6666-4666-8666-666666666666';

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

type RunRuleDryRunModule = {
  runRuleDryRun: (input: {
    ruleCode: string;
    sampleInput: Record<string, unknown>;
  }) => Promise<ActionResult<{
    ruleCode: string;
    status: 'pass' | 'fail';
    warnings: string[];
    trace: string[];
    evaluatedAt: string;
  }>>;
};

let currentClient: FakeClient;

const ruleRows: RuleRow[] = [
  {
    id: ACTIVE_GATE_RULE_ID,
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
    id: PREVIOUS_GATE_RULE_ID,
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
  // older gate rule for a different department
  {
    id: FIRST_GATE_RULE_ID,
    rule_code: 'finance_cost_post_gate',
    rule_type: 'gate',
    department_code: 'finance',
    version: 1,
    active_from: '2026-03-01T00:00:00.000Z',
    active_to: null,
    definition_json: { type: 'gate', checks: ['cost-center'] },
    deploy_ref: 'git:finance-v1',
    deployed_by: 'deploy-bot',
  },
  {
    id: CASCADE_RULE_ID,
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
    id: '77777777-7777-4777-8777-777777777777',
    rule_definition_id: ACTIVE_GATE_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    status: 'failed',
    sample_input_json: { product: 'milk', line: 'L1' },
    result_json: { allowed: false, reason: 'ATP missing' },
    warnings: ['missing-atp'],
    ran_at: '2026-05-18T12:00:00.000Z',
    ran_by: 'qa-user',
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    rule_definition_id: PREVIOUS_GATE_RULE_ID,
    rule_code: 'quality_allergen_changeover_gate',
    status: 'passed',
    sample_input_json: { product: 'milk', line: 'L1' },
    result_json: { allowed: true },
    warnings: [],
    ran_at: '2026-04-18T12:00:00.000Z',
    ran_by: 'qa-user',
  },
];

describe('rule registry Server Actions (T-025)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    currentClient = makeClient({ authorized: true });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
    );
  });

  it('listRules with type=gate returns only gate rule_definitions ordered by rule_code ASC, no writes', async () => {
    const { listRules } = await loadListRules();

    const result = await listRules({ ruleType: 'gate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = result.data.rules.map((row) => row.ruleCode);
    // Must contain both gate rules, and not the cascading rule
    expect(codes).toContain('finance_cost_post_gate');
    expect(codes).toContain('quality_allergen_changeover_gate');
    expect(codes).not.toContain('npd_pack_size_line_cascade');
    // Sorted ASC by rule_code at the action layer (deduplicated to one row per rule_code).
    expect(codes).toEqual([...codes].sort());
    expect(writeCalls(), 'rule registry list is read-only').toHaveLength(0);
  });

  it('listRules dedupes versions to active row per rule_code (active_to IS NULL)', async () => {
    const { listRules } = await loadListRules();

    const result = await listRules({ ruleType: 'gate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const allergenRows = result.data.rules.filter((row) => row.ruleCode === 'quality_allergen_changeover_gate');
    expect(allergenRows).toHaveLength(1);
    expect(allergenRows[0]).toMatchObject({ activeVersion: 2, isActive: true, deployRef: 'git:active-v2' });
  });

  it('listRules combined filter type+dept+active+dryRunStatus narrows to a single row', async () => {
    const { listRules } = await loadListRules();

    const result = await listRules({
      ruleType: 'gate',
      departmentCode: 'quality',
      active: true,
      dryRunStatus: 'failed',
    });

    expect(result).toMatchObject({
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
  });

  it('getRule resolves the active version (active_to IS NULL) and returns versions[] (newest first)', async () => {
    const { getRule } = await loadGetRule();

    const result = await getRule({ ruleCode: 'quality_allergen_changeover_gate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      ruleCode: 'quality_allergen_changeover_gate',
      activeVersion: 2,
      versions: [
        expect.objectContaining({ version: 2, isActive: true, deployRef: 'git:active-v2' }),
        expect.objectContaining({ version: 1, isActive: false, deployRef: 'git:previous-v1' }),
      ],
    });
  });

  it('getRule returns NOT_FOUND-style error for unknown rule_code without writes', async () => {
    const { getRule } = await loadGetRule();
    const result = await getRule({ ruleCode: 'nonexistent_rule_v1' });
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('runRuleDryRun evaluates sample input through the persisted Server Action contract and records one dry-run row', async () => {
    const { runRuleDryRun } = await loadRunRuleDryRun();

    const result = await runRuleDryRun({
      ruleCode: 'quality_allergen_changeover_gate',
      sampleInput: { product: 'milk', line: 'L1', workOrder: 'WO-2026-00412' },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        ruleCode: 'quality_allergen_changeover_gate',
        status: expect.stringMatching(/^(pass|fail)$/),
        warnings: expect.any(Array),
        trace: expect.any(Array),
        evaluatedAt: expect.any(String),
      },
    });
    const writes = writeCalls();
    expect(writes, 'dry-run must persist an audit/evidence row in rule_dry_runs through withOrgContext').toHaveLength(1);
    expect(normalizeSql(writes[0].sql)).toContain('insert into public.rule_dry_runs');
    expect(JSON.stringify(writes[0].params)).toContain('WO-2026-00412');
  });

  it('forbidden: callers lacking settings.rules.view never read rule_definitions or rule_dry_runs', async () => {
    currentClient = makeClient({ authorized: false });

    const { listRules } = await loadListRules();
    const { getRule } = await loadGetRule();
    const { listRuleDryRuns } = await loadListRuleDryRuns();

    await expect(listRules({ active: true })).resolves.toEqual({ ok: false, error: 'forbidden' });
    await expect(getRule({ ruleCode: 'quality_allergen_changeover_gate' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
    await expect(listRuleDryRuns({ ruleCode: 'quality_allergen_changeover_gate', status: 'failed' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });

    // Fail-closed: when authorization fails, the action must NOT have hit rule_definitions or rule_dry_runs.
    const queriedRuleTables = currentClient.calls.some((call) =>
      /\b(rule_definitions|rule_dry_runs)\b/i.test(call.sql),
    );
    expect(queriedRuleTables, 'forbidden path must not touch rule tables').toBe(false);
    expect(writeCalls()).toHaveLength(0);
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

async function loadRunRuleDryRun(): Promise<RunRuleDryRunModule> {
  expect(existsSync(listRuleDryRunsPath), 'apps/web/actions/rules/dry-runs.ts must exist and export runRuleDryRun(input)').toBe(true);
  const mod = (await import(listRuleDryRunsPath)) as Partial<RunRuleDryRunModule>;
  if (typeof mod.runRuleDryRun !== 'function') {
    expect.fail('apps/web/actions/rules/dry-runs.ts must export runRuleDryRun(input) for the shared RuleDryRunModal');
  }
  return mod as RunRuleDryRunModule;
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

      if (normalized.startsWith('insert into public.rule_dry_runs')) {
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              rule_definition_id: ACTIVE_GATE_RULE_ID,
              rule_code: 'quality_allergen_changeover_gate',
              status: 'pass',
              sample_input_json: params.find((param) => typeof param === 'object') ?? {},
              result_json: { status: 'pass', trace: ['fixture evaluator passed'] },
              warnings: [],
              ran_at: '2026-05-25T10:15:00.000Z',
              ran_by: USER_ID,
            },
          ],
          rowCount: 1,
        };
      }

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
        if (paramsBlob.includes('gate')) rows = rows.filter((row) => row.rule_type === 'gate');
        if (paramsBlob.includes('quality')) rows = rows.filter((row) => row.department_code === 'quality');
        if (paramsBlob.includes('finance')) rows = rows.filter((row) => row.department_code === 'finance');
        if (normalized.includes('active_to is null')) rows = rows.filter((row) => row.active_to === null);
        if (paramsBlob.includes('quality_allergen_changeover_gate')) {
          rows = ruleRows.filter((row) => row.rule_code === 'quality_allergen_changeover_gate');
        }
        if (paramsBlob.includes('nonexistent_rule_v1')) {
          rows = [];
        }
        rows.sort((a, b) => {
          if (a.rule_code === b.rule_code) return b.version - a.version;
          return a.rule_code.localeCompare(b.rule_code);
        });
        return { rows: rows as unknown as Record<string, unknown>[], rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function writeCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => /^\s*(insert|update|delete|truncate|alter|drop|create)\b/i.test(call.sql));
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
