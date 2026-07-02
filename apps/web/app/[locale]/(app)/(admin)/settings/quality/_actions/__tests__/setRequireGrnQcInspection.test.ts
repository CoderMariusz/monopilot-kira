import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('@/lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));
vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: _revalidatePath }));

const actionPath = resolve(__dirname, '../setRequireGrnQcInspection.ts');
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FLAG_CODE = 'require_grn_qc_inspection';
const REQUIRED_PERMISSION = 'settings.flags.edit';
const FORBIDDEN_PERMISSION = 'settings.quality.edit';

type SetRequireGrnQcInspection = {
  setRequireGrnQcInspection: (input: { enabled: boolean; auditReason?: string }) => Promise<
    | { ok: true; data: { flagKey: typeof FLAG_CODE; enabled: boolean } }
    | { ok: false; error: string }
  >;
};

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

describe('setRequireGrnQcInspection Server Action RED behavior', () => {
  it('updates require_grn_qc_inspection through settings.flags.edit and records an audit_log change', async () => {
    const { setRequireGrnQcInspection } = await loadAction();

    const result = await setRequireGrnQcInspection({ enabled: true, auditReason: 'operator enabled GRN QC gate' });

    expect(result).toEqual({ ok: true, data: { flagKey: FLAG_CODE, enabled: true } });
    expect(statementBlob()).toContain(REQUIRED_PERMISSION);
    expect(statementBlob()).not.toContain(FORBIDDEN_PERMISSION);
    const update = callContaining('require_grn_qc_inspection');
    expect(update.sql.toLowerCase(), 'action must persist the exact T-118 flag key').toContain('require_grn_qc_inspection');
    const audit = callContaining('insert into public.audit_log');
    expect(callBlob(audit)).toContain('settings.flag.updated');
    expect(callBlob(audit)).toContain(FLAG_CODE);
    expect(callBlob(audit)).toContain(USER_ID);
    expect(callBlob(audit)).toContain(ORG_ID);
    expect(_revalidatePath).toHaveBeenCalledWith('/settings/quality');
  });

  it('fails closed without settings.flags.edit and does not write settings or audit_log rows', async () => {
    currentClient = makeClient({ canEdit: false });
    const { setRequireGrnQcInspection } = await loadAction();

    const result = await setRequireGrnQcInspection({ enabled: true, auditReason: 'should be forbidden' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(statementBlob()).toContain(REQUIRED_PERMISSION);
    expect(statementBlob()).not.toContain(FORBIDDEN_PERMISSION);
    expect(indexOfCall('require_grn_qc_inspection')).toBe(-1);
    expect(indexOfCall('insert into public.audit_log')).toBe(-1);
  });
});

async function loadAction(): Promise<SetRequireGrnQcInspection> {
  expect(
    existsSync(actionPath),
    'apps/web/app/[locale]/(app)/(admin)/settings/quality/_actions/setRequireGrnQcInspection.ts must exist and export setRequireGrnQcInspection(input)',
  ).toBe(true);

  const mod = (await import(actionPath)) as Partial<SetRequireGrnQcInspection>;
  if (typeof mod.setRequireGrnQcInspection !== 'function') {
    expect.fail('setRequireGrnQcInspection.ts must export setRequireGrnQcInspection(input)');
  }
  return mod as SetRequireGrnQcInspection;
}

function makeClient({ canEdit }: { canEdit: boolean }): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    canEdit,
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('user_roles') || normalized.includes('role_permissions') || normalized.includes('from public.roles')) {
        return canEdit ? { rows: [{ ok: true, permission: REQUIRED_PERMISSION }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('require_grn_qc_inspection')) {
        return { rows: [{ flag_key: FLAG_CODE, enabled: true }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.audit_log')) {
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
