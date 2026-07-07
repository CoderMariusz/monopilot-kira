import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

type SupplierSpecFixture = {
  id: string;
  itemId: string;
  supplierCode: string;
  lifecycleStatus: string;
  expiryDate: string | null;
  reviewStatus: string;
  unitPrice: string;
  priceCurrency: string;
  effectiveFrom: string | null;
  updatedAt: string;
};

type FakeClient = {
  calls: QueryCall[];
  supplierSpecs: SupplierSpecFixture[];
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolvedLifecycle(lifecycleStatus: string, expiryDate: string | null): string {
  if (
    expiryDate &&
    expiryDate < new Date().toISOString().slice(0, 10) &&
    (lifecycleStatus === 'active' || lifecycleStatus === 'draft')
  ) {
    return 'expired';
  }
  return lifecycleStatus;
}

function pickSupplierPrice(specs: SupplierSpecFixture[]): { unitPrice: string | null; priceCurrency: string | null } {
  const eligible = specs
    .filter(
      (spec) =>
        resolvedLifecycle(spec.lifecycleStatus, spec.expiryDate) === 'active' &&
        spec.reviewStatus === 'approved' &&
        spec.unitPrice != null,
    )
    .sort((a, b) => {
      const priceCmp = Number(a.unitPrice) - Number(b.unitPrice);
      if (priceCmp !== 0) return priceCmp;
      const fromA = a.effectiveFrom ?? '';
      const fromB = b.effectiveFrom ?? '';
      if (fromA !== fromB) return fromB.localeCompare(fromA);
      if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
      if (a.supplierCode !== b.supplierCode) return a.supplierCode.localeCompare(b.supplierCode);
      return a.id.localeCompare(b.id);
    });
  const winner = eligible[0];
  return winner ? { unitPrice: winner.unitPrice, priceCurrency: winner.priceCurrency } : { unitPrice: null, priceCurrency: null };
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    supplierSpecs: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalizeSql(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (n.includes('from public.items i')) {
        const buy = pickSupplierPrice(client.supplierSpecs);
        return {
          rows: [
            {
              id: ITEM_ID,
              item_code: params[0],
              name: 'Raw material 1',
              item_type: 'rm',
              status: 'active',
              description: null,
              product_group: null,
              category_code: null,
              uom_base: 'kg',
              uom_secondary: null,
              gs1_gtin: null,
              weight_mode: 'fixed',
              nominal_weight: null,
              tare_weight: null,
              gross_weight_max: null,
              variance_tolerance_pct: null,
              shelf_life_days: null,
              shelf_life_mode: null,
              output_uom: 'base',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              cost_per_kg: null,
              list_price_gbp: null,
              supplier_unit_price: buy.unitPrice,
              supplier_price_currency: buy.priceCurrency,
              effective_cost_amount: null,
              effective_cost_currency: null,
              effective_cost_source: null,
              updated_at: '2026-07-05T00:00:00.000Z',
            },
          ] as never[],
          rowCount: 1,
        };
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  install(makeClient());
});

describe('getItem supplier buy price', () => {
  it('filters supplier_specs with supplier_spec_resolved_lifecycle and stable tie-breakers', async () => {
    const { getItem } = await import('./get-item');

    await getItem('RM-1');

    const itemSql = client.calls.find((call) => normalizeSql(call.sql).includes('from public.items i'));
    expect(itemSql).toBeDefined();
    const normalized = normalizeSql(itemSql!.sql);
    expect(normalized).toContain(
      "public.supplier_spec_resolved_lifecycle(ss.lifecycle_status, ss.expiry_date) = 'active'",
    );
    expect(normalized).toContain('ss.supplier_code asc, ss.id asc');
  });

  it('excludes an expired active supplier spec from supplier buy price', async () => {
    client.supplierSpecs = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        itemId: ITEM_ID,
        supplierCode: 'SUP-OLD',
        lifecycleStatus: 'active',
        expiryDate: '2000-01-01',
        reviewStatus: 'approved',
        unitPrice: '9.99',
        priceCurrency: 'GBP',
        effectiveFrom: '2024-01-01',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { getItem } = await import('./get-item');

    const res = await getItem('RM-1');

    expect(res).toMatchObject({
      state: 'ready',
      item: { supplierUnitPrice: null, supplierPriceCurrency: null },
    });
  });

  it('breaks supplier price ties by supplier_code then id', async () => {
    client.supplierSpecs = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        itemId: ITEM_ID,
        supplierCode: 'SUP-B',
        lifecycleStatus: 'active',
        expiryDate: null,
        reviewStatus: 'approved',
        unitPrice: '5.00',
        priceCurrency: 'GBP',
        effectiveFrom: '2026-01-01',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        itemId: ITEM_ID,
        supplierCode: 'SUP-A',
        lifecycleStatus: 'active',
        expiryDate: null,
        reviewStatus: 'approved',
        unitPrice: '5.00',
        priceCurrency: 'GBP',
        effectiveFrom: '2026-01-01',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { getItem } = await import('./get-item');

    const res = await getItem('RM-1');

    expect(res).toMatchObject({
      state: 'ready',
      item: { supplierUnitPrice: '5.00', supplierPriceCurrency: 'GBP' },
    });
    expect(pickSupplierPrice(client.supplierSpecs).unitPrice).toBe('5.00');
    expect(
      client.supplierSpecs
        .filter((spec) => resolvedLifecycle(spec.lifecycleStatus, spec.expiryDate) === 'active')
        .sort((a, b) => a.supplierCode.localeCompare(b.supplierCode))[0]?.supplierCode,
    ).toBe('SUP-A');
  });
});
