import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

// Mock every relative depth the action might resolve withOrgContext through.
// The action imports ../../../../../../../lib (7 up from _actions); from this
// test file (one level deeper in __tests__) that resolves to the same absolute
// module, so mock the action's literal specifier (../../../../../../../lib).
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('@/lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('next/cache', () => ({ revalidatePath: _revalidatePath }));

const actionPath = resolve(__dirname, '../signoff-actions.ts');
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_PERMISSION = 'settings.flags.edit';

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  canEdit: boolean;
  calls: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient({ canEdit: true });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('signoff-actions Server Action', () => {
  it('upsertSignoffPolicy persists through the admin permission and audits the change', async () => {
    const { upsertSignoffPolicy } = await loadActions();

    const result = await upsertSignoffPolicy({
      signoffType: 'production.changeover.allergen',
      requiredSignatures: 2,
      firstSignerRoleId: ROLE_ID,
      secondSignerRoleId: null,
      allowSameUser: false,
      isActive: true,
    });

    expect(result.ok).toBe(true);
    expect(statementBlob()).toContain(ADMIN_PERMISSION);
    const upsert = callContaining('insert into public.signoff_policies');
    expect(upsert.sql.toLowerCase()).toContain('on conflict (org_id, signoff_type)');
    const audit = callContaining('insert into public.audit_log');
    expect(callBlob(audit)).toContain('settings.signoff_policy.updated');
    expect(callBlob(audit)).toContain(ORG_ID);
    expect(_revalidatePath).toHaveBeenCalledWith('/settings/signoff');
  });

  it('upsertSignoffPolicy fails closed without admin permission', async () => {
    currentClient = makeClient({ canEdit: false });
    const { upsertSignoffPolicy } = await loadActions();

    const result = await upsertSignoffPolicy({
      signoffType: 'production.changeover.allergen',
      requiredSignatures: 2,
      firstSignerRoleId: null,
      secondSignerRoleId: null,
      allowSameUser: false,
      isActive: true,
    });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(indexOfCall('insert into public.signoff_policies')).toBe(-1);
    expect(indexOfCall('insert into public.audit_log')).toBe(-1);
  });

  it('upsertSignoffPolicy rejects a signer role that does not belong to the org (no write)', async () => {
    const FOREIGN_ROLE_ID = '44444444-4444-4444-8444-444444444444';
    // The org-scoping query (id = any($1::uuid[])) finds NO role for this id.
    const baseQuery = currentClient.query.bind(currentClient);
    currentClient.query = async (sql: string, params: unknown[] = []) => {
      const n = sql.replace(/\s+/g, ' ').toLowerCase();
      if (n.includes('from public.roles') && n.includes('any($1::uuid[])')) {
        currentClient.calls.push({ sql, params });
        return { rows: [], rowCount: 0 };
      }
      return baseQuery(sql, params);
    };
    const { upsertSignoffPolicy } = await loadActions();

    const result = await upsertSignoffPolicy({
      signoffType: 'production.changeover.allergen',
      requiredSignatures: 2,
      firstSignerRoleId: FOREIGN_ROLE_ID,
      secondSignerRoleId: null,
      allowSameUser: false,
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Role does not belong to this organization.',
    });
    expect(indexOfCall('insert into public.signoff_policies')).toBe(-1);
    expect(indexOfCall('insert into public.audit_log')).toBe(-1);
  });

  it('upsertSignoffPolicy validates signer roles against app.current_org_id() before the upsert', async () => {
    const { upsertSignoffPolicy } = await loadActions();
    const result = await upsertSignoffPolicy({
      signoffType: 'production.changeover.allergen',
      requiredSignatures: 2,
      firstSignerRoleId: ROLE_ID,
      secondSignerRoleId: ROLE_ID,
      allowSameUser: false,
      isActive: true,
    });
    expect(result.ok).toBe(true);
    const scopeCheck = callContaining('any($1::uuid[])');
    expect(scopeCheck.sql).toContain('app.current_org_id()');
    // Duplicate role ids are de-duplicated before the count comparison.
    expect(scopeCheck.params).toEqual([[ROLE_ID]]);
    expect(indexOfCall('any($1::uuid[])')).toBeLessThan(indexOfCall('insert into public.signoff_policies'));
  });

  it('upsertSignoffPolicy rejects out-of-range required signatures', async () => {
    const { upsertSignoffPolicy } = await loadActions();
    const result = await upsertSignoffPolicy({
      signoffType: 'x',
      requiredSignatures: 3,
      allowSameUser: false,
      isActive: true,
    } as never);
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('listSignoffPolicies returns policies + roles when ready', async () => {
    const { listSignoffPolicies } = await loadActions();
    const result = await listSignoffPolicies();
    expect(result.state).toBe('ready');
    if (result.state === 'ready') {
      expect(result.policies.length).toBe(1);
      expect(result.policies[0]!.signoffType).toBe('production.changeover.allergen');
      expect(result.roles.length).toBeGreaterThan(0);
    }
  });

  it('listSignoffPolicies fails closed (state forbidden, no data) without the read permission', async () => {
    currentClient = makeClient({ canEdit: false });
    const { listSignoffPolicies } = await loadActions();
    const result = await listSignoffPolicies();
    expect(result).toEqual({ state: 'forbidden', policies: [], roles: [], canEdit: false });
    // Fail-closed means NO policy/role data was even queried.
    expect(indexOfCall('from public.signoff_policies')).toBe(-1);
    expect(statementBlob()).toContain('org.access.admin');
  });

  it('setOverconsumeThresholds writes BOTH jsonb flags (warn + approve) and audits', async () => {
    const { setOverconsumeThresholds } = await loadActions();
    const result = await setOverconsumeThresholds({ warnPct: 5, approvePct: 15 });
    expect(result).toEqual({ ok: true, warnPct: 5, approvePct: 15 });
    expect(statementBlob()).toContain('overconsume_threshold_pct');
    expect(statementBlob()).toContain('overconsume_warn_pct');
    const upsert = callContaining('insert into public.tenant_variations');
    expect(upsert.sql.toLowerCase()).toContain('on conflict (org_id)');
    expect(upsert.params).toEqual([ORG_ID, 5, 15]);
    const audit = callContaining('insert into public.audit_log');
    expect(callBlob(audit)).toContain('settings.flag.updated');
  });

  it('setOverconsumeThresholds rejects a percentage above 100', async () => {
    const { setOverconsumeThresholds } = await loadActions();
    const result = await setOverconsumeThresholds({ warnPct: 5, approvePct: 150 });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('setOverconsumeThresholds rejects warn > approve with a clear message (no DB write)', async () => {
    const { setOverconsumeThresholds } = await loadActions();
    const result = await setOverconsumeThresholds({ warnPct: 20, approvePct: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('warn_above_approve');
      expect(String(result.message ?? '')).toMatch(/less than or equal/i);
    }
    expect(indexOfCall('insert into public.tenant_variations')).toBe(-1);
    expect(indexOfCall('insert into public.audit_log')).toBe(-1);
  });

  it('setOverconsumeThresholds fails closed without admin permission', async () => {
    currentClient = makeClient({ canEdit: false });
    const { setOverconsumeThresholds } = await loadActions();
    const result = await setOverconsumeThresholds({ warnPct: 5, approvePct: 15 });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(indexOfCall('insert into public.tenant_variations')).toBe(-1);
  });
});

type ActionsModule = {
  upsertSignoffPolicy: (input: unknown) => Promise<{ ok: boolean; error?: string }>;
  listSignoffPolicies: () => Promise<{ state: string; policies: { signoffType: string }[]; roles: unknown[] }>;
  setOverconsumeThresholds: (input: { warnPct: number; approvePct: number }) => Promise<{
    ok: boolean;
    warnPct?: number;
    approvePct?: number;
    error?: string;
    message?: string;
  }>;
};

async function loadActions(): Promise<ActionsModule> {
  expect(existsSync(actionPath), 'signoff-actions.ts must exist').toBe(true);
  const mod = (await import(actionPath)) as Partial<ActionsModule>;
  if (typeof mod.upsertSignoffPolicy !== 'function') {
    expect.fail('signoff-actions.ts must export upsertSignoffPolicy');
  }
  return mod as ActionsModule;
}

function makeClient({ canEdit }: { canEdit: boolean }): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    canEdit,
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').toLowerCase();

      if (n.includes('user_roles') || n.includes('role_permissions')) {
        return canEdit ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.roles')) {
        return { rows: [{ id: ROLE_ID, code: 'qa_manager', name: 'QA Manager' }], rowCount: 1 };
      }
      if (n.includes('from public.signoff_policies')) {
        return {
          rows: [
            {
              id: 'p1',
              signoff_type: 'production.changeover.allergen',
              required_signatures: 2,
              first_signer_role_id: null,
              second_signer_role_id: null,
              allow_same_user: false,
              is_active: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('insert into public.signoff_policies')) {
        return {
          rows: [
            {
              id: 'p1',
              signoff_type: 'production.changeover.allergen',
              required_signatures: 2,
              first_signer_role_id: ROLE_ID,
              second_signer_role_id: null,
              allow_same_user: false,
              is_active: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('insert into public.tenant_variations')) {
        return { rows: [{ feature_flags: { overconsume_threshold_pct: 5 } }], rowCount: 1 };
      }
      if (n.includes('insert into public.audit_log')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function indexOfCall(fragment: string): number {
  return currentClient.calls.findIndex((call) => callBlob(call).toLowerCase().includes(fragment.toLowerCase()));
}
function callContaining(fragment: string): QueryCall {
  const index = indexOfCall(fragment);
  expect(index, `Expected SQL call containing ${fragment}`).toBeGreaterThanOrEqual(0);
  return currentClient.calls[index]!;
}
function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
function statementBlob(): string {
  return currentClient.calls.map(callBlob).join('\n');
}
