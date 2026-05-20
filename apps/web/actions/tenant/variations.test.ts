import { existsSync, readFileSync } from 'node:fs';
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
const getTenantVariationsPath = resolve(repoRoot, 'apps/web/actions/tenant/get.ts');
const setDepartmentOverridePath = resolve(repoRoot, 'apps/web/actions/tenant/set-dept.ts');
const setRuleVariantPath = resolve(repoRoot, 'apps/web/actions/tenant/set-rule-variant.ts');
const setLocalFlagPath = resolve(repoRoot, 'apps/web/actions/tenant/set-local-flag.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RULE_VARIANT_ID = '33333333-3333-4333-8333-333333333333';

const INITIAL_VARIATIONS = {
  org_id: ORG_ID,
  dept_overrides: { rename: { price: 'finance' } },
  rule_variant_overrides: { 'qa.release_gate': 'baseline-v1' },
  feature_flags: { 'modules.09-quality.enabled': false },
};

type ActionResult<TData> = { ok: true; data: TData } | { ok: false; error: string };
type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  variations: typeof INITIAL_VARIATIONS;
  ruleDefinitionExists: boolean;
  auditLog: QueryCall[];
  outboxEvents: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type GetTenantVariationsModule = {
  getTenantVariations: () => Promise<ActionResult<{
    deptOverrides: unknown;
    ruleVariantOverrides: unknown;
    featureFlags: unknown;
  }>>;
};

type SetDepartmentOverrideModule = {
  setDepartmentOverride: (input: {
    action: 'split' | 'merge' | 'add' | 'rename';
    departmentCode?: string;
    targetDepartmentCodes?: string[];
    sourceDepartmentCodes?: string[];
    targetDepartmentCode?: string;
    newDepartmentCode?: string;
    label?: string;
    auditReason?: string;
  }) => Promise<ActionResult<{ deptOverrides: unknown }>>;
};

type SetRuleVariantModule = {
  setRuleVariant: (input: {
    ruleCode: string;
    variantVersionId: string;
    auditReason?: string;
  }) => Promise<ActionResult<{ ruleCode: string; variantVersionId: string }>>;
};

type SetLocalFlagModule = {
  setLocalFlag: (input: {
    flagKey: string;
    enabled: boolean;
    auditReason?: string;
  }) => Promise<ActionResult<{ flagKey: string; enabled: boolean }>>;
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

describe('tenant_variations Server Actions (T-027 PRD §9.1-9.3 / V-SET-30..31)', () => {
  it('getTenantVariations reads the current org-scoped tenant_variations JSONB payload through withOrgContext', async () => {
    const { getTenantVariations } = await loadGetTenantVariations();

    const result = await getTenantVariations();

    expect(result).toEqual({
      ok: true,
      data: {
        deptOverrides: INITIAL_VARIATIONS.dept_overrides,
        ruleVariantOverrides: INITIAL_VARIATIONS.rule_variant_overrides,
        featureFlags: INITIAL_VARIATIONS.feature_flags,
      },
    });
    expect(_withOrgContextRunner).toHaveBeenCalledTimes(1);
    expect(statementIndex('from public.tenant_variations')).toBeGreaterThanOrEqual(0);
  });

  it('setDepartmentOverride validates shape, applies valid split actions, and raises DUPLICATE_TARGET (V-SET-30) for duplicate split targets', async () => {
    const { setDepartmentOverride } = await loadSetDepartmentOverride();

    const invalidShape = await setDepartmentOverride({ action: 'delete' as 'split', departmentCode: 'planning' });

    expect(invalidShape).toEqual({ ok: false, error: 'invalid_input' });
    expect(statementIndex('update public.tenant_variations')).toBe(-1);
    expect(currentClient.auditLog).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);

    const duplicate = await setDepartmentOverride({
      action: 'split',
      departmentCode: 'planning',
      targetDepartmentCodes: ['mrp', 'mrp', 'scheduling'],
      auditReason: 'V-SET-30 duplicate target codes must close-discriminate',
    });

    expect(duplicate).toEqual({ ok: false, error: 'DUPLICATE_TARGET' });
    expect(statementIndex('update public.tenant_variations')).toBe(-1);
    expect(currentClient.auditLog).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);

    const result = await setDepartmentOverride({
      action: 'split',
      departmentCode: 'planning',
      targetDepartmentCodes: ['mrp', 'scheduling'],
      auditReason: 'split planning into MRP and finite scheduling',
    });

    expect(result.ok).toBe(true);
    const update = callAt('update public.tenant_variations');
    expect(callBlob(update)).toContain('jsonb_set');
    expect(callBlob(update)).toContain('dept_overrides');
    expect(currentClient.auditLog).toHaveLength(1);
    expect(currentClient.outboxEvents).toHaveLength(1);
  });

  it('setRuleVariant raises VARIANT_NOT_FOUND (V-SET-31) for missing rule_definitions versions, and setLocalFlag toggles a tenant flag with audit + settings.module.toggled outbox', async () => {
    currentClient.ruleDefinitionExists = false;
    const { setRuleVariant } = await loadSetRuleVariant();

    const rejected = await setRuleVariant({
      ruleCode: 'qa.release_gate',
      variantVersionId: RULE_VARIANT_ID,
      auditReason: 'try to point at an absent rule version',
    });

    expect(rejected).toEqual({ ok: false, error: 'VARIANT_NOT_FOUND' });
    // Real validation must hit the canonical PRD table (rule_definitions, NOT rule_versions).
    expect(statementIndex('from public.rule_definitions')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('update public.tenant_variations')).toBe(-1);
    expect(currentClient.auditLog).toHaveLength(0);
    expect(currentClient.outboxEvents).toHaveLength(0);

    currentClient.ruleDefinitionExists = true;
    const { setLocalFlag } = await loadSetLocalFlag();
    const result = await setLocalFlag({
      flagKey: 'modules.09-quality.enabled',
      enabled: true,
      auditReason: 'enable Quality module for L2 tenant rollout',
    });

    expect(result).toEqual({ ok: true, data: { flagKey: 'modules.09-quality.enabled', enabled: true } });
    const updateIndex = statementIndex('update public.tenant_variations');
    const auditIndex = statementIndex('insert into public.audit_log');
    const outboxIndex = statementIndex('insert into public.outbox_events');
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(callBlob(currentClient.calls[updateIndex]!)).toContain('jsonb_set');
    expect(callBlob(currentClient.calls[updateIndex]!)).toContain('feature_flags');
    expect(auditIndex).toBeGreaterThan(updateIndex);
    expect(outboxIndex).toBeGreaterThan(updateIndex);
    expect(currentClient.auditLog).toHaveLength(1);
    expect(currentClient.outboxEvents).toHaveLength(1);
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain('settings.module.toggled');
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain('tenant');
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain(ORG_ID);
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain('modules.09-quality.enabled');
    expect(_revalidatePath).toHaveBeenCalledWith('/settings/tenant');
  });

  it('production sources are free of test-coupling SQL comments (no rule_versions compatibility token, no test/fake markers)', () => {
    const sources = [
      readFileSync(getTenantVariationsPath, 'utf8'),
      readFileSync(setDepartmentOverridePath, 'utf8'),
      readFileSync(setRuleVariantPath, 'utf8'),
      readFileSync(setLocalFlagPath, 'utf8'),
    ];
    for (const src of sources) {
      expect(src).not.toMatch(/rule_versions/i);
      expect(src).not.toMatch(/V-SET-\d+ tests?/i);
      expect(src).not.toMatch(/UnitTestFake|UnitTest|FakeMigration|test[_-]?coupling|fixture/i);
    }
  });
});

async function loadGetTenantVariations(): Promise<GetTenantVariationsModule> {
  expect(
    existsSync(getTenantVariationsPath),
    'apps/web/actions/tenant/get.ts must exist and export getTenantVariations()',
  ).toBe(true);
  const mod = (await import(getTenantVariationsPath)) as Partial<GetTenantVariationsModule>;
  if (typeof mod.getTenantVariations !== 'function') {
    expect.fail('apps/web/actions/tenant/get.ts must export getTenantVariations()');
  }
  return mod as GetTenantVariationsModule;
}

async function loadSetDepartmentOverride(): Promise<SetDepartmentOverrideModule> {
  expect(
    existsSync(setDepartmentOverridePath),
    'apps/web/actions/tenant/set-dept.ts must exist and export setDepartmentOverride(input)',
  ).toBe(true);
  const mod = (await import(setDepartmentOverridePath)) as Partial<SetDepartmentOverrideModule>;
  if (typeof mod.setDepartmentOverride !== 'function') {
    expect.fail('apps/web/actions/tenant/set-dept.ts must export setDepartmentOverride(input)');
  }
  return mod as SetDepartmentOverrideModule;
}

async function loadSetRuleVariant(): Promise<SetRuleVariantModule> {
  expect(
    existsSync(setRuleVariantPath),
    'apps/web/actions/tenant/set-rule-variant.ts must exist and export setRuleVariant(input)',
  ).toBe(true);
  const mod = (await import(setRuleVariantPath)) as Partial<SetRuleVariantModule>;
  if (typeof mod.setRuleVariant !== 'function') {
    expect.fail('apps/web/actions/tenant/set-rule-variant.ts must export setRuleVariant(input)');
  }
  return mod as SetRuleVariantModule;
}

async function loadSetLocalFlag(): Promise<SetLocalFlagModule> {
  expect(
    existsSync(setLocalFlagPath),
    'apps/web/actions/tenant/set-local-flag.ts must exist and export setLocalFlag(input)',
  ).toBe(true);
  const mod = (await import(setLocalFlagPath)) as Partial<SetLocalFlagModule>;
  if (typeof mod.setLocalFlag !== 'function') {
    expect.fail('apps/web/actions/tenant/set-local-flag.ts must export setLocalFlag(input)');
  }
  return mod as SetLocalFlagModule;
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    variations: structuredClone(INITIAL_VARIATIONS),
    ruleDefinitionExists: true,
    auditLog: [],
    outboxEvents: [],
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('user_roles') || normalized.includes('role_permissions') || normalized.includes('from public.roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (normalized.includes('from public.tenant_variations')) {
        return { rows: [client.variations], rowCount: 1 };
      }

      if (normalized.includes('from public.rule_definitions')) {
        return {
          rows: client.ruleDefinitionExists ? [{ id: RULE_VARIANT_ID, rule_code: 'qa.release_gate', version: 2 }] : [],
          rowCount: client.ruleDefinitionExists ? 1 : 0,
        };
      }

      if (normalized.includes('update public.tenant_variations')) {
        return { rows: [client.variations], rowCount: 1 };
      }

      if (normalized.includes('insert into public.audit_log')) {
        client.auditLog.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        client.outboxEvents.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function statementIndex(fragment: string): number {
  const lowerFragment = fragment.toLowerCase();
  return currentClient.calls.findIndex((call) => normalizeSql(call.sql).includes(lowerFragment));
}

function callAt(fragment: string): QueryCall {
  const index = statementIndex(fragment);
  expect(index, `${fragment} should be executed`).toBeGreaterThanOrEqual(0);
  return currentClient.calls[index]!;
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
