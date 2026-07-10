import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  beforeStatus: string;
  itemTypeBlock?: boolean;
  beforeItemType?: string;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(overrides: Partial<FakeClient> & { itemTypeBlock?: boolean; beforeItemType?: string } = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    beforeStatus: 'active',
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalizeSql(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (n.includes(') as blocked')) {
        return { rows: [{ blocked: overrides.itemTypeBlock ?? false }] as never[], rowCount: 1 };
      }
      if (n.startsWith('select name, item_type, status, uom_base')) {
        return {
          rows: [
            {
              name: 'Existing item',
              item_type: overrides.beforeItemType ?? 'rm',
              status: client.beforeStatus,
              uom_base: 'kg',
              weight_mode: 'fixed',
              nominal_weight: null,
              tare_weight: null,
              gross_weight_max: null,
              gs1_gtin: null,
              output_uom: 'base',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              list_price_gbp: null,
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (n.startsWith('update public.items')) {
        return { rows: [{ id: ITEM_ID }] as never[], rowCount: 1 };
      }
      if (n.startsWith('insert into public.audit_log')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
    ...overrides,
  };
  return client;
}

let client: FakeClient;

function install(c: FakeClient): void {
  client = c;
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
}

function updatePayload(status: 'draft' | 'active' | 'deprecated' | 'blocked') {
  return {
    id: ITEM_ID,
    name: 'Existing item',
    itemType: 'rm',
    status,
    uomBase: 'kg',
    weightMode: 'fixed',
    outputUom: 'base',
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  install(makeClient());
});

describe('updateItem status transitions', () => {
  it('rejects active -> draft as invalid_transition', async () => {
    install(makeClient({ beforeStatus: 'active' }));
    const { updateItem } = await import('./update-item');

    const res = await updateItem(updatePayload('draft'));

    expect(res).toEqual({ ok: false, error: 'invalid_input', message: 'invalid_transition' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.items'))).toBe(false);
  });

  it('rejects active -> blocked as invalid_transition', async () => {
    install(makeClient({ beforeStatus: 'active' }));
    const { updateItem } = await import('./update-item');

    const res = await updateItem(updatePayload('blocked'));

    expect(res).toEqual({ ok: false, error: 'invalid_input', message: 'invalid_transition' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.items'))).toBe(false);
  });

  it('allows unchanged status as a no-op transition', async () => {
    install(makeClient({ beforeStatus: 'active' }));
    const { updateItem } = await import('./update-item');

    const res = await updateItem(updatePayload('active'));

    expect(res).toEqual({ ok: true, data: { id: ITEM_ID } });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.items'))).toBe(true);
  });

  it('allows draft -> active', async () => {
    install(makeClient({ beforeStatus: 'draft' }));
    const { updateItem } = await import('./update-item');

    const res = await updateItem(updatePayload('active'));

    expect(res).toEqual({ ok: true, data: { id: ITEM_ID } });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.items'))).toBe(true);
  });

  it('rejects item_type change on an active FG referenced by a BOM (N-47)', async () => {
    install(makeClient({ beforeStatus: 'active', beforeItemType: 'fg', itemTypeBlock: true }));
    const { updateItem } = await import('./update-item');

    const res = await updateItem({ ...updatePayload('active'), itemType: 'rm' });

    expect(res).toEqual({
      ok: false,
      error: 'item_type_immutable',
      message: 'item_type cannot change once the item is active or referenced by BOMs, factory specs, or work orders',
    });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.items'))).toBe(false);
  });
});
