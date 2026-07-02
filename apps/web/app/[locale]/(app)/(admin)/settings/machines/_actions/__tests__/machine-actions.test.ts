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
vi.mock('next/cache', () => ({ revalidatePath: _revalidatePath }));
vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: _revalidatePath }));

const actionPath = resolve(__dirname, '../machine-actions.ts');
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
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
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'stub', client: currentClient }),
  );
});

describe('machine-actions Server Action', () => {
  it('listMachines returns rows when ready and reports canEdit', async () => {
    const { listMachines } = await loadActions();
    const result = await listMachines();
    expect(result.state).toBe('ready');
    if (result.state === 'ready') {
      expect(result.machines.length).toBe(1);
      expect(result.machines[0]!.code).toBe('GR-01');
      expect(result.canEdit).toBe(true);
    }
    expect(statementBlob()).toContain('from public.machines');
  });

  it('upsertMachine inserts a new machine through the admin permission', async () => {
    const { upsertMachine } = await loadActions();
    const result = await upsertMachine({
      code: 'GR-01',
      name: 'Grinder 1',
      machineType: 'grinder',
      status: 'active',
      capacityPerHour: 500,
    });
    expect(result.ok).toBe(true);
    expect(statementBlob()).toContain(ADMIN_PERMISSION);
    const insert = callContaining('insert into public.machines');
    expect(insert.sql.toLowerCase()).toContain('org_id');
    expect(_revalidatePath).toHaveBeenCalledWith('/settings/machines');
  });

  it('upsertMachine fails closed without admin permission', async () => {
    currentClient = makeClient({ canEdit: false });
    const { upsertMachine } = await loadActions();
    const result = await upsertMachine({
      code: 'GR-02',
      name: 'Grinder 2',
      machineType: 'grinder',
      status: 'active',
    });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(indexOfCall('insert into public.machines')).toBe(-1);
  });

  it('upsertMachine rejects an invalid status', async () => {
    const { upsertMachine } = await loadActions();
    const result = await upsertMachine({
      code: 'GR-03',
      name: 'Grinder 3',
      machineType: 'grinder',
      status: 'bogus',
    } as never);
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });
});

type ActionsModule = {
  listMachines: () => Promise<{ state: string; machines: { code: string }[]; canEdit: boolean }>;
  upsertMachine: (input: unknown) => Promise<{ ok: boolean; error?: string }>;
};

async function loadActions(): Promise<ActionsModule> {
  expect(existsSync(actionPath), 'machine-actions.ts must exist').toBe(true);
  const mod = (await import(actionPath)) as Partial<ActionsModule>;
  if (typeof mod.upsertMachine !== 'function') expect.fail('machine-actions.ts must export upsertMachine');
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
      if (n.includes('from public.machines')) {
        return {
          rows: [
            { id: 'm1', code: 'GR-01', name: 'Grinder 1', machine_type: 'grinder', status: 'active', capacity_per_hour: 500 },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('insert into public.machines') || n.includes('update public.machines')) {
        return {
          rows: [
            { id: 'm1', code: 'GR-01', name: 'Grinder 1', machine_type: 'grinder', status: 'active', capacity_per_hour: 500 },
          ],
          rowCount: 1,
        };
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
