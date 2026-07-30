import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RM_ID = '33333333-3333-4333-8333-333333333333';
const HEADER_ID = '44444444-4444-4444-8444-444444444444';
const CO_PRODUCT_A_ID = '66666666-6666-4666-8666-666666666666';
const CO_PRODUCT_B_ID = '77777777-7777-4777-8777-777777777777';
const FG_ITEM_ID = '88888888-8888-4888-8888-888888888888';
const WIP_PARENT_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  canCreate: boolean;
  fgItem: { id: string; item_code: string; name: string | null; status: string; item_type: string } | null;
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
    canCreate: true,
    fgItem,
    fgFreeFromAllergens: [],
    rmAllergens: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: client.canCreate }] as never[], rowCount: 1 };
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
        return { rows: [{ id: RM_ID, item_type: 'rm', status: 'active', updated_at: '2026-06-09T00:00:00Z' }] as never[], rowCount: 1 };
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
      if (normalized.includes('reference"."manufacturingoperations')) {
        const names = (params[0] as string[] | undefined) ?? [];
        const known = new Set(['Mixing', 'Packing']);
        return {
          rows: names.filter((name) => known.has(name)).map((operation_name) => ({ operation_name })) as never[],
          rowCount: names.filter((name) => known.has(name)).length,
        };
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
  client = makeClient({
    id: FG_ITEM_ID,
    item_code: 'FG-WIZ-001',
    name: 'Wizard FG',
    status: 'active',
    item_type: 'fg',
  });
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
});

describe('createBomDraft product reference self-heal', () => {
  it('TEC-103 rejects an empty lines array before DB access and accepts one valid line', async () => {
    const { createBomDraft } = await import('../create-draft');

    await expect(
      createBomDraft({ productId: 'FG-WIZ-001', parentAllocationPct: 100, lines: [] }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.calls).toHaveLength(0);

    await expect(
      createBomDraft({
        productId: 'FG-WIZ-001',
        parentAllocationPct: 100,
        lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
      }),
    ).resolves.toMatchObject({ ok: true, data: { version: 1 } });
  });

  it('TEC-109 rejects a non-byproduct allocation total below 100 with V-TEC-12', async () => {
    const { createBomDraft } = await import('../create-draft');

    await expect(
      createBomDraft({
        productId: 'FG-WIZ-001',
        parentAllocationPct: 70,
        lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
        coProducts: [
          {
            coProductItemId: CO_PRODUCT_A_ID,
            quantity: 1,
            uom: 'kg',
            allocationPct: 20,
            isByproduct: false,
          },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-12',
      message: 'non-byproduct allocation sums to 90, must equal 100',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(
      false,
    );
  });

  it('TEC-109 accepts a non-byproduct allocation total equal to 100', async () => {
    const { createBomDraft } = await import('../create-draft');

    await expect(
      createBomDraft({
        productId: 'FG-WIZ-001',
        parentAllocationPct: 70,
        lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
        coProducts: [
          {
            coProductItemId: CO_PRODUCT_A_ID,
            quantity: 1,
            uom: 'kg',
            allocationPct: 30,
            isByproduct: false,
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(
      true,
    );
  });

  it('TEC-109 applies the V-TEC-12 comparison after rounding the total to 3 decimal places', async () => {
    const { createBomDraft } = await import('../create-draft');
    const payload = (allocationPct: number) => ({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 70,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
      coProducts: [
        {
          coProductItemId: CO_PRODUCT_A_ID,
          quantity: 1,
          uom: 'kg',
          allocationPct,
          isByproduct: false,
        },
      ],
    });

    await expect(createBomDraft(payload(29.9994))).resolves.toMatchObject({
      ok: false,
      code: 'V-TEC-12',
    });
    client.calls = [];
    await expect(createBomDraft(payload(29.9995))).resolves.toMatchObject({ ok: true });
  });

  it('TEC-118 returns forbidden before BOM reads without technical.bom.create', async () => {
    client.canCreate = false;
    const { createBomDraft } = await import('../create-draft');

    await expect(
      createBomDraft({
        productId: 'FG-WIZ-001',
        parentAllocationPct: 100,
        lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
      }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls).toHaveLength(1);
    expect(normalizeSql(client.calls[0]!.sql)).toContain('from public.user_roles');
    expect(client.calls[0]!.params[2]).toBe('technical.bom.create');
  });

  it('TEC-118 permits technical.bom.create to reach draft creation', async () => {
    const { createBomDraft } = await import('../create-draft');

    await expect(
      createBomDraft({
        productId: 'FG-WIZ-001',
        parentAllocationPct: 100,
        lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(
      true,
    );
  });

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

  // [B-2] the first-authoring path really does produce a draft — it keeps its single
  // bom.version_submitted event, and both the audit and the payload say 'draft'.
  it('emits exactly one submitted event, saying draft, on the first-authoring path', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });
    expect(result).toMatchObject({ ok: true });

    const events = client.calls.filter((call) => normalizeSql(call.sql).startsWith('insert into public.outbox_events'));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.params[4] as string)).toMatchObject({ status: 'draft', product_id: 'FG-WIZ-001' });

    const audits = client.calls.filter((call) => normalizeSql(call.sql).startsWith('insert into public.audit_log'));
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0]!.params[5] as string)).toMatchObject({ status: 'draft' });
  });

  // ── [B-12] the manual authoring boundary refuses precision numeric(5,2) drops ──
  // createBomDraft IS the hand-authoring path (first authoring + Save version); the
  // client-side check alone left the Server Action accepting 2.3456, which Postgres
  // then stored as 2.35 with no message at all.
  it('rejects a scrapPct with more than 2 decimals before touching the database', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg', scrapPct: 2.3456 }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(result).toMatchObject({ message: expect.stringContaining('2 decimal places') });
    expect(client.calls).toHaveLength(0);
  });

  it('still accepts the values a numeric(5,2) column can hold, including float-dusty ones', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [
        { itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg', scrapPct: 2.35 },
        { itemId: RM_ID, componentCode: 'RM-002', quantity: 1, uom: 'kg', scrapPct: 8.45 },
        { itemId: RM_ID, componentCode: 'RM-003', quantity: 1, uom: 'kg', scrapPct: 0 },
        { itemId: RM_ID, componentCode: 'RM-004', quantity: 1, uom: 'kg' },
      ],
    });

    expect(result).toMatchObject({ ok: true });
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

  it('creates a draft BOM for an active intermediate WIP without inserting a product row', async () => {
    client.fgItem = {
      id: WIP_PARENT_ID,
      item_code: 'WIP-CT-0001',
      name: 'Cream base',
      status: 'active',
      item_type: 'intermediate',
    };
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'WIP-CT-0001',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: true, data: { version: 1 } });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.product'))).toBe(false);
    const headerInsert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'));
    expect(headerInsert).toBeDefined();
    // product_id must be NULL for items-only WIP parents (FK targets public.product).
    expect(headerInsert!.params[0]).toBeNull();
    expect(headerInsert!.params[1]).toBe(WIP_PARENT_ID);
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

  it('rejects an arbitrary manufacturing operation with V-TEC-63 and performs zero writes', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [
        {
          itemId: RM_ID,
          componentCode: 'RM-001',
          quantity: 1,
          uom: 'kg',
          manufacturingOperationName: 'Totally-Fake-Op',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-63',
      message: expect.stringContaining('Totally-Fake-Op'),
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_lines'))).toBe(false);
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

  it('createDisassemblyBomDraft rejects an arbitrary manufacturing operation with V-TEC-63 and performs zero writes', async () => {
    const { createDisassemblyBomDraft } = await import('../disassembly');

    const result = await createDisassemblyBomDraft(
      {
        ...payload,
        lines: [{ ...payload.lines[0], manufacturingOperationName: 'Totally-Fake-Op' }],
      },
      client,
    );

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('V-TEC-63'),
    });
    expect(result.error).toContain('Totally-Fake-Op');
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
