import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };
type SupplierSpecRow = {
  itemId: string;
  supplierCode: string;
  lifecycleStatus: string;
  reviewStatus: string;
  supplierStatus: string;
};

type FakeClient = {
  calls: QueryCall[];
  supplierSpecs: SupplierSpecRow[];
  throwSupplierSpecInsert: boolean;
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

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    supplierSpecs: [],
    throwSupplierSpecInsert: false,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalizeSql(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (n.startsWith('insert into public.items')) {
        return { rows: [{ id: ITEM_ID }] as never[], rowCount: 1 };
      }
      if (n.includes('from public.suppliers')) {
        return { rows: [{ '?column?': 1 }] as never[], rowCount: 1 };
      }
      if (
        n === 'savepoint sp_supplier_spec' ||
        n === 'release savepoint sp_supplier_spec' ||
        n === 'rollback to savepoint sp_supplier_spec'
      ) {
        return { rows: [] as never[], rowCount: null };
      }
      if (n.startsWith('insert into public.supplier_specs')) {
        if (client.throwSupplierSpecInsert) throw new Error('supplier_specs insert failed');
        const itemId = String(params[0]);
        const supplierCode = String(params[1]);
        const exists = client.supplierSpecs.some(
          (row) => row.itemId === itemId && row.supplierCode === supplierCode,
        );
        if (!exists) {
          client.supplierSpecs.push({
            itemId,
            supplierCode,
            supplierStatus: 'approved',
            lifecycleStatus: 'active',
            reviewStatus: 'approved',
          });
        }
        return { rows: [] as never[], rowCount: exists ? 0 : 1 };
      }
      if (n.startsWith('insert into public.audit_log')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
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

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    itemCode: 'RM-1',
    name: 'Raw material 1',
    itemType: 'rm',
    uomBase: 'kg',
    outputUom: 'base',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  install(makeClient());
});

describe('createItem supplier spec bootstrap', () => {
  it('creates an item without supplierCode without inserting a supplier_specs row', async () => {
    const { createItem } = await import('./create-item');

    const res = await createItem(createPayload());

    expect(res).toEqual({ ok: true, data: { id: ITEM_ID, itemCode: 'RM-1' } });
    expect(client.supplierSpecs).toHaveLength(0);
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.supplier_specs'))).toBe(
      false,
    );
  });

  it('creates an active approved supplier_specs row when supplierCode is present', async () => {
    const { createItem } = await import('./create-item');

    const res = await createItem(createPayload({ supplierCode: 'SUP-1' }));

    expect(res).toEqual({ ok: true, data: { id: ITEM_ID, itemCode: 'RM-1' } });
    expect(client.supplierSpecs).toEqual([
      {
        itemId: ITEM_ID,
        supplierCode: 'SUP-1',
        supplierStatus: 'approved',
        lifecycleStatus: 'active',
        reviewStatus: 'approved',
      },
    ]);
  });

  it('routes the supplier price into supplier_specs.unit_price (GBP) — F11', async () => {
    const { createItem } = await import('./create-item');

    const res = await createItem(createPayload({ supplierCode: 'SUP-1', listPriceGbp: 5.2 }));

    expect(res).toMatchObject({ ok: true });
    const specInsert = client.calls.find((call) =>
      normalizeSql(call.sql).startsWith('insert into public.supplier_specs'),
    );
    expect(specInsert).toBeDefined();
    // Insert params (create-item.ts): [itemId, supplierCode, userId, supplierId, unitPrice, currency]
    expect(specInsert?.params[4]).toBe(5.2);
    expect(specInsert?.params[5]).toBe('GBP');
  });

  it('leaves supplier_specs.unit_price null when no price is supplied — F11', async () => {
    const { createItem } = await import('./create-item');

    const res = await createItem(createPayload({ supplierCode: 'SUP-1' }));

    expect(res).toMatchObject({ ok: true });
    const specInsert = client.calls.find((call) =>
      normalizeSql(call.sql).startsWith('insert into public.supplier_specs'),
    );
    expect(specInsert?.params[4]).toBeNull();
    expect(specInsert?.params[5]).toBeNull();
  });

  it('does not duplicate a supplier_specs row for the same item_id and supplierCode', async () => {
    const { createItem } = await import('./create-item');

    await expect(createItem(createPayload({ supplierCode: 'SUP-1' }))).resolves.toMatchObject({ ok: true });
    await expect(createItem(createPayload({ supplierCode: 'SUP-1' }))).resolves.toMatchObject({ ok: true });

    expect(client.supplierSpecs).toHaveLength(1);
    expect(
      client.calls.filter((call) => normalizeSql(call.sql).startsWith('insert into public.supplier_specs')),
    ).toHaveLength(2);
  });

  it('keeps item creation successful and continues after supplier_specs insert failure', async () => {
    client.throwSupplierSpecInsert = true;
    const { createItem } = await import('./create-item');

    const res = await createItem(createPayload({ supplierCode: 'SUP-1' }));

    expect(res).toEqual({ ok: true, data: { id: ITEM_ID, itemCode: 'RM-1' } });
    const supplierSpecInsertIndex = client.calls.findIndex((call) =>
      normalizeSql(call.sql).startsWith('insert into public.supplier_specs'),
    );
    const auditInsertIndex = client.calls.findIndex((call) =>
      normalizeSql(call.sql).startsWith('insert into public.audit_log'),
    );
    expect(supplierSpecInsertIndex).toBeGreaterThanOrEqual(0);
    expect(auditInsertIndex).toBeGreaterThan(supplierSpecInsertIndex);
    expect(client.calls.some((call) => normalizeSql(call.sql) === 'rollback to savepoint sp_supplier_spec')).toBe(
      true,
    );
  });
});
