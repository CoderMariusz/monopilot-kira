import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RM_ID = '33333333-3333-4333-8333-333333333333';
const HEADER_ID = '44444444-4444-4444-8444-444444444444';
const CO_PRODUCT_A_ID = '66666666-6666-4666-8666-666666666666';
const CO_PRODUCT_B_ID = '77777777-7777-4777-8777-777777777777';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  fgItem: { item_code: string; name: string | null; status: string; item_type: string } | null;
  fgFreeFromAllergens: string[];
  rmAllergens: { allergen_code: string; intensity: string }[];
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
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(fgItem: FakeClient['fgItem']): FakeClient {
  const client: FakeClient = {
    calls: [],
    fgItem,
    fgFreeFromAllergens: [],
    rmAllergens: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (normalized.includes("h.bom_type = 'disassembly'")) {
        return {
          rows: [
            {
              product_id: 'RM-BULK',
              status: 'draft',
              version: 1,
              yield_pct: '100',
              effective_from: '2026-06-23',
              effective_to: null,
              notes: 'breakdown',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.bom_lines bl') && normalized.includes('left join public.items')) {
        return {
          rows: [
            {
              component_code: 'RM-BULK',
              item_code: 'RM-BULK',
              item_name: 'Bulk input',
              quantity: '1.000000',
              uom: 'kg',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.bom_co_products cp') && normalized.includes('expected_yield_pct')) {
        return {
          rows: [
            {
              item_code: 'CP-A',
              item_name: 'Co Product A',
              quantity: '0.600000',
              uom: 'kg',
              allocation_pct: '60.000',
              expected_yield_pct: '80.000',
            },
            {
              item_code: 'CP-B',
              item_name: 'Co Product B',
              quantity: '0.400000',
              uom: 'kg',
              allocation_pct: '40.000',
              expected_yield_pct: '20.000',
            },
          ] as never[],
          rowCount: 2,
        };
      }
      if (normalized.includes('from public.bom_headers h join public.bom_lines')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('from public.items') && normalized.includes('id = $1::uuid')) {
        return { rows: [{ id: RM_ID, status: 'active', updated_at: '2026-06-09T00:00:00Z' }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.supplier_specs')) {
        return {
          rows: [
            {
              supplier_code: 'SUP-DEMO-01',
              supplier_status: 'approved',
              lifecycle_status: 'active',
              review_status: 'approved',
              effective_from: '2026-01-01',
              expiry_date: '2030-01-01',
              cost_review_blocked: false,
              spec_review_blocked: false,
              updated_at: '2026-06-09T00:00:00Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.nutrition_allergens')) {
        return {
          rows: client.fgFreeFromAllergens.map((allergen_code) => ({ allergen_code })) as never[],
          rowCount: client.fgFreeFromAllergens.length,
        };
      }
      if (normalized.includes('from public.item_allergen_profiles')) {
        return { rows: client.rmAllergens as never[], rowCount: client.rmAllergens.length };
      }
      if (normalized.includes('from public.product')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('coalesce(max(version), 0) + 1')) {
        return { rows: [{ next_version: 1 }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.bom_headers')) {
        return { rows: [{ id: HEADER_ID }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.items') && normalized.includes('item_code = $1')) {
        return { rows: (client.fgItem ? [client.fgItem] : []) as never[], rowCount: client.fgItem ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.product')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.bom_lines')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.audit_log') || normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
  };
  return client;
}

let client: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  client = makeClient({ item_code: 'FG-WIZ-001', name: 'Wizard FG', status: 'active', item_type: 'fg' });
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
});

describe('createBomDraft product reference self-heal', () => {
  it('inserts a minimal product row for an existing active FG item before inserting the BOM header', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: true, data: { version: 1 } });
    const productInsertIndex = client.calls.findIndex((call) => normalizeSql(call.sql).startsWith('insert into public.product'));
    const headerInsertIndex = client.calls.findIndex((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'));
    expect(productInsertIndex).toBeGreaterThan(-1);
    expect(headerInsertIndex).toBeGreaterThan(productInsertIndex);
    expect(client.calls[productInsertIndex]?.params).toEqual(['FG-WIZ-001', 'Wizard FG', 'active', USER_ID]);
    expect(normalizeSql(client.calls[headerInsertIndex]!.sql)).toContain('bom_type');
    expect(client.calls[headerInsertIndex]!.params.at(-1)).toBe('forward');
  });

  it('keeps invalid-reference rejection when the target FG item is missing', async () => {
    client.fgItem = null;
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-MISSING',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input', message: 'invalid reference' });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.product'))).toBe(false);
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
  });

  it('rejects a milk-containing RM added to a milk-free FG with ALLERGEN_CONFLICT', async () => {
    client.fgFreeFromAllergens = ['MILK'];
    client.rmAllergens = [{ allergen_code: 'milk', intensity: 'contains' }];
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-MILK-FREE',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-MILK', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-14',
      rmUsabilityFailures: [{ componentCode: 'RM-MILK', itemId: RM_ID, reasons: ['ALLERGEN_CONFLICT'] }],
    });
    expect(result.message).toBe('RM-MILK: ALLERGEN_CONFLICT');
    const targetFgQuery = client.calls.find((call) => normalizeSql(call.sql).includes('from public.nutrition_allergens'));
    expect(targetFgQuery?.params).toEqual(['FG-MILK-FREE']);
  });
});

describe('disassembly BOM draft actions', () => {
  const payload = {
    bom_type: 'disassembly',
    productId: 'RM-BULK',
    notes: 'breakdown',
    lines: [{ itemId: RM_ID, componentCode: 'RM-BULK', quantity: '1', uom: 'kg' }],
    coProducts: [
      {
        itemId: CO_PRODUCT_A_ID,
        quantity: '0.6',
        uom: 'kg',
        allocation_pct: '60',
        expected_yield_pct: '80',
      },
      {
        itemId: CO_PRODUCT_B_ID,
        quantity: '0.4',
        uom: 'kg',
        allocation_pct: '40',
        expected_yield_pct: '20',
      },
    ],
  };

  it('createDisassemblyBomDraft persists bom_type=disassembly when co-product allocations sum to 100', async () => {
    const { createDisassemblyBomDraft } = await import('../disassembly');

    const result = await createDisassemblyBomDraft(payload, client);

    expect(result).toEqual({ ok: true, data: { id: HEADER_ID, version: 1 } });
    const headerInsert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'));
    expect(headerInsert).toBeDefined();
    expect(normalizeSql(headerInsert!.sql)).toContain('bom_type');
    expect(headerInsert!.params.at(-1)).toBe('disassembly');

    const coProductInserts = client.calls.filter((call) => normalizeSql(call.sql).startsWith('insert into public.bom_co_products'));
    expect(coProductInserts).toHaveLength(2);
    expect(normalizeSql(coProductInserts[0]!.sql)).toContain('expected_yield_pct');
    expect(coProductInserts[0]!.params).toEqual([HEADER_ID, CO_PRODUCT_A_ID, '0.6', 'kg', '60', '80']);
  });

  it('createDisassemblyBomDraft rejects allocations summing to 95 with V-TEC-12', async () => {
    const { createDisassemblyBomDraft } = await import('../disassembly');

    const result = await createDisassemblyBomDraft({
      ...payload,
      coProducts: [
        { ...payload.coProducts[0], allocation_pct: '60' },
        { ...payload.coProducts[1], allocation_pct: '35' },
      ],
    }, client);

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('V-TEC-12') });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
  });

  it('getDisassemblyBom returns the input item and co-product outputs with computed allocation_sum', async () => {
    const { getDisassemblyBom } = await import('../disassembly');

    const result = await getDisassemblyBom(HEADER_ID, client);

    expect(result).toEqual({
      ok: true,
      data: {
        header: {
          bom_type: 'disassembly',
          product_code: 'RM-BULK',
          status: 'draft',
          version: 1,
          yield_pct: '100',
          effective_from: '2026-06-23',
          effective_to: null,
          notes: 'breakdown',
        },
        input_item: {
          code: 'RM-BULK',
          name: 'Bulk input',
          quantity: '1.000000',
          uom: 'kg',
        },
        outputs: [
          {
            code: 'CP-A',
            name: 'Co Product A',
            quantity: '0.600000',
            uom: 'kg',
            allocation_pct: '60.000',
            expected_yield_pct: '80.000',
          },
          {
            code: 'CP-B',
            name: 'Co Product B',
            quantity: '0.400000',
            uom: 'kg',
            allocation_pct: '40.000',
            expected_yield_pct: '20.000',
          },
        ],
        allocation_sum: '100',
      },
    });
  });
});
