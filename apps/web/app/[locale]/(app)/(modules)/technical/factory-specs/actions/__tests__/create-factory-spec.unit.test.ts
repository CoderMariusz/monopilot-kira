import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  hasPermission: boolean;
  item: { id: string; item_type: string } | null;
  nextVersion: number;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(overrides: Partial<Pick<FakeClient, 'hasPermission' | 'item' | 'nextVersion'>> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    hasPermission: overrides.hasPermission ?? true,
    item: overrides.item === undefined ? { id: FG_ITEM_ID, item_type: 'fg' } : overrides.item,
    nextVersion: overrides.nextVersion ?? 4,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: (client.hasPermission ? [{ ok: true }] : []) as never[], rowCount: client.hasPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.items') && normalized.includes('id = $1::uuid')) {
        return { rows: (client.item ? [client.item] : []) as never[], rowCount: client.item ? 1 : 0 };
      }
      if (normalized.includes('coalesce(max(version), 0) + 1')) {
        return { rows: [{ next_version: client.nextVersion }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.factory_specs')) {
        return { rows: [{ id: '44444444-4444-4444-8444-444444444444' }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      throw new Error(`unhandled SQL: ${normalized}`);
    },
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: makeClient() }),
  );
});

describe('createFactorySpec', () => {
  it('inserts a draft factory_specs row under org context and writes audit_events', async () => {
    const client = makeClient({ nextVersion: 7 });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({
      fgItemId: FG_ITEM_ID,
      specCode: 'FS-FG5101',
      notes: 'Initial technical draft',
    });

    expect(result).toEqual({
      ok: true,
      data: { id: '44444444-4444-4444-8444-444444444444', specCode: 'FS-FG5101', version: 7 },
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).includes('app.current_org_id()'))).toBe(true);

    const insert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'));
    expect(insert?.params).toEqual([FG_ITEM_ID, 'FS-FG5101', 7, 'Initial technical draft', USER_ID]);
    expect(normalizeSql(insert?.sql ?? '')).toContain("'draft'");
    expect(normalizeSql(insert?.sql ?? '')).toContain("'technical'");

    const audit = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.audit_events'));
    expect(audit?.params[0]).toBe(ORG_ID);
    expect(audit?.params[1]).toBe(USER_ID);
    expect(audit?.params[2]).toBe('44444444-4444-4444-8444-444444444444');
    expect(JSON.parse(String(audit?.params[3]))).toMatchObject({
      fgItemId: FG_ITEM_ID,
      specCode: 'FS-FG5101',
      version: 7,
      status: 'draft',
      source: 'technical',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/technical/factory-specs');
  });

  it('returns forbidden before insert when the approval/write permission is missing', async () => {
    const client = makeClient({ hasPermission: false });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({ fgItemId: FG_ITEM_ID, specCode: 'FS-FG5101' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
  });

  it('rejects non-FG items before writing factory_specs', async () => {
    const client = makeClient({ item: { id: FG_ITEM_ID, item_type: 'rm' } });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({ fgItemId: FG_ITEM_ID, specCode: 'FS-RM3001' });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'factory_specs must be anchored to an FG item',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
  });
});
