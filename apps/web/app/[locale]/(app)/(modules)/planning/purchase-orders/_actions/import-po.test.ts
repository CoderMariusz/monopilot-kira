import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '../../_actions/procurement-shared';
import { createPurchaseOrder } from './actions';
import { commitPoImport, validatePoImport, type PoImportRow } from './import-po';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_A_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_B_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_A_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_B_ID = '66666666-6666-4666-8666-666666666666';

type SupplierFixture = { id: string; code: string; currency: string };
type ItemFixture = { id: string; item_code: string; uom_base: string; uom_secondary: string | null };
type CreatePoPayload = {
  poNumber: string;
  supplierId: string;
  lines: Array<{ itemId: string; qty: string; uom: string; unitPrice: string; lineNo: number }>;
};

let client: QueryClient;
let existingRefs: Set<string>;
let allowPermission = true;

const suppliers: SupplierFixture[] = [
  { id: SUPPLIER_A_ID, code: 'SUP-A', currency: 'EUR' },
  { id: SUPPLIER_B_ID, code: 'SUP-B', currency: 'GBP' },
];

const items: ItemFixture[] = [
  { id: ITEM_A_ID, item_code: 'ITEM-A', uom_base: 'kg', uom_secondary: null },
  { id: ITEM_B_ID, item_code: 'ITEM-B', uom_base: 'ea', uom_secondary: 'box' },
];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('./actions', () => ({
  createPurchaseOrder: vi.fn(),
}));

function makeClient(): QueryClient {
  const query: QueryClient['query'] = async <T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    let rows: unknown[] = [];

    if (normalized.includes('from public.user_roles')) {
      rows = allowPermission ? [{ ok: true }] : [];
    } else if (normalized.includes('from public.suppliers')) {
      const codes = new Set(params[0] as string[]);
      rows = suppliers.filter((supplier) => codes.has(supplier.code));
    } else if (normalized.includes('from public.items')) {
      const codes = new Set(params[0] as string[]);
      rows = items.filter((item) => codes.has(item.item_code));
    } else if (normalized.includes('from public.unit_of_measure')) {
      const codes = new Set(params[0] as string[]);
      rows = ['kg', 'ea', 'box'].filter((code) => codes.has(code)).map((code) => ({ code }));
    } else if (normalized.includes('from public.purchase_orders')) {
      const refs = new Set(params[0] as string[]);
      rows = Array.from(existingRefs).filter((ref) => refs.has(ref)).map((po_number) => ({ po_number }));
    } else if (normalized.includes('insert into public.import_export_jobs')) {
      rows = [{ id: '77777777-7777-4777-8777-777777777777' }];
    }

    return { rows: rows as T[], rowCount: rows.length };
  };

  return { query: vi.fn(query) as unknown as QueryClient['query'] };
}

function poRow(overrides: Partial<PoImportRow> = {}): PoImportRow {
  return {
    external_ref: 'EXT-A',
    supplier_code: 'SUP-A',
    item_code: 'ITEM-A',
    qty: 10,
    uom: 'kg',
    price: 6.25,
    currency: 'EUR',
    expected_delivery: '2026-06-24',
    notes: 'imported',
    ...overrides,
  };
}

function validFourRows(): PoImportRow[] {
  return [
    poRow({ external_ref: 'EXT-A', supplier_code: 'SUP-A', item_code: 'ITEM-A', uom: 'kg' }),
    poRow({ external_ref: 'EXT-A', supplier_code: 'SUP-A', item_code: 'ITEM-B', uom: 'ea' }),
    poRow({ external_ref: 'EXT-B', supplier_code: 'SUP-B', item_code: 'ITEM-A', uom: 'kg', currency: 'GBP' }),
    poRow({ external_ref: 'EXT-B', supplier_code: 'SUP-B', item_code: 'ITEM-B', uom: 'box', currency: 'GBP' }),
  ];
}

function createPurchaseOrderMock() {
  return vi.mocked(createPurchaseOrder);
}

function importJobInsertCalls() {
  return vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('insert into public.import_export_jobs'));
}

describe('purchase order import backend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'));
    allowPermission = true;
    existingRefs = new Set();
    client = makeClient();
    createPurchaseOrderMock().mockReset();
    createPurchaseOrderMock().mockImplementation(async (rawInput: unknown) => {
      const input = rawInput as CreatePoPayload;
      return {
        ok: true,
        data: { poNumber: input.poNumber },
      } as Awaited<ReturnType<typeof createPurchaseOrder>>;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validatePoImport reports bad supplier_code and past expected_delivery with echoed values', async () => {
    const result = await validatePoImport([
      poRow({ external_ref: 'EXT-BAD-SUP', supplier_code: 'SUP-MISSING' }),
      poRow({ external_ref: 'EXT-PAST', expected_delivery: '2026-06-22' }),
    ]);

    expect(result.summary).toEqual({ total: 2, ok: 0, failed: 2 });
    expect(result.rows[0]?.errors[0]).toEqual(
      expect.objectContaining({
        column: 'supplier_code',
        message: expect.stringContaining('SUP-MISSING'),
      }),
    );
    expect(result.rows[1]?.errors[0]).toEqual(
      expect.objectContaining({
        column: 'expected_delivery',
        message: expect.stringContaining('2026-06-22'),
      }),
    );
  });

  it('commitPoImport groups four valid rows across two suppliers into two createPurchaseOrder calls', async () => {
    const result = await commitPoImport(validFourRows(), { mode: 'skip_invalid' });

    expect(result.failed).toEqual([]);
    expect(result.created).toEqual([
      { po_number: 'EXT-A', external_ref: 'EXT-A' },
      { po_number: 'EXT-B', external_ref: 'EXT-B' },
    ]);
    expect(createPurchaseOrder).toHaveBeenCalledTimes(2);

    const firstPayload = createPurchaseOrderMock().mock.calls[0]?.[0] as CreatePoPayload | undefined;
    const secondPayload = createPurchaseOrderMock().mock.calls[1]?.[0] as CreatePoPayload | undefined;
    expect(firstPayload).toEqual(
      expect.objectContaining({
        poNumber: 'EXT-A',
        supplierId: SUPPLIER_A_ID,
      }),
    );
    expect(firstPayload?.lines).toHaveLength(2);
    expect(secondPayload).toEqual(
      expect.objectContaining({
        poNumber: 'EXT-B',
        supplierId: SUPPLIER_B_ID,
      }),
    );
    expect(secondPayload?.lines).toHaveLength(2);
    expect(importJobInsertCalls()).toHaveLength(1);
  });

  it('commitPoImport skips a re-commit when every external_ref already exists', async () => {
    existingRefs = new Set(['EXT-A', 'EXT-B']);

    const result = await commitPoImport(validFourRows(), { mode: 'skip_invalid' });

    expect(createPurchaseOrder).toHaveBeenCalledTimes(0);
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([
      { external_ref: 'EXT-A', reason: 'Purchase order already exists for external_ref "EXT-A".' },
      { external_ref: 'EXT-B', reason: 'Purchase order already exists for external_ref "EXT-B".' },
    ]);
  });

  it("commitPoImport all_or_nothing writes nothing when one of three rows is invalid", async () => {
    const result = await commitPoImport(
      [
        poRow({ external_ref: 'EXT-1', supplier_code: 'SUP-A' }),
        poRow({ external_ref: 'EXT-2', supplier_code: 'SUP-MISSING' }),
        poRow({ external_ref: 'EXT-3', supplier_code: 'SUP-B', currency: 'GBP' }),
      ],
      { mode: 'all_or_nothing' },
    );

    expect(createPurchaseOrder).toHaveBeenCalledTimes(0);
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.errors[0]).toEqual(expect.objectContaining({ column: 'supplier_code' }));
    expect(importJobInsertCalls()).toHaveLength(0);
  });
});
