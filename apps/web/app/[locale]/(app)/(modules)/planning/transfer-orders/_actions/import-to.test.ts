import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { QueryClient } from '../../_actions/procurement-shared';
import { createTransferOrder } from './actions';
import { commitToImport, validateToImport, type ToImportRow } from './import-to';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WH_A_ID = '33333333-3333-4333-8333-333333333333';
const WH_B_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_A_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_B_ID = '66666666-6666-4666-8666-666666666666';

type WarehouseFixture = { id: string; code: string };
type ItemFixture = { id: string; item_code: string; uom_base: string; uom_secondary: string | null };
type CreateToPayload = {
  toNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: Array<{ itemId: string; qty: string; uom: string; lineNo: number }>;
};

let client: QueryClient;
let existingRefs: Set<string>;
let allowPermission = true;

const warehouses: WarehouseFixture[] = [
  { id: WH_A_ID, code: 'WH-A' },
  { id: WH_B_ID, code: 'WH-B' },
];

const items: ItemFixture[] = [
  { id: ITEM_A_ID, item_code: 'ITEM-A', uom_base: 'kg', uom_secondary: null },
  { id: ITEM_B_ID, item_code: 'ITEM-B', uom_base: 'pcs', uom_secondary: 'box' },
];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('./actions', () => ({
  createTransferOrder: vi.fn(),
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
    } else if (normalized.includes('from public.warehouses')) {
      const codes = new Set(params[0] as string[]);
      rows = warehouses.filter((warehouse) => codes.has(warehouse.code));
    } else if (normalized.includes('from public.items')) {
      const codes = new Set(params[0] as string[]);
      rows = items.filter((item) => codes.has(item.item_code));
    } else if (normalized.includes('from public.unit_of_measure')) {
      const codes = new Set(params[0] as string[]);
      rows = ['kg', 'pcs', 'box'].filter((code) => codes.has(code)).map((code) => ({ code }));
    } else if (normalized.includes('from public.transfer_orders')) {
      const refs = new Set(params[0] as string[]);
      rows = Array.from(existingRefs).filter((ref) => refs.has(ref)).map((to_number) => ({ to_number }));
    } else if (normalized.includes('insert into public.import_export_jobs')) {
      rows = [{ id: '77777777-7777-4777-8777-777777777777' }];
    }

    return { rows: rows as T[], rowCount: rows.length };
  };

  return { query: vi.fn(query) as unknown as QueryClient['query'] };
}

function toRow(overrides: Partial<ToImportRow> = {}): ToImportRow {
  return {
    external_ref: 'TO-EXT-A',
    from_warehouse_code: 'WH-A',
    to_warehouse_code: 'WH-B',
    item_code: 'ITEM-A',
    qty: 10,
    uom: 'kg',
    date: '2026-06-24',
    ...overrides,
  };
}

function createTransferOrderMock() {
  return vi.mocked(createTransferOrder);
}

function importJobInsertCalls() {
  return vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('insert into public.import_export_jobs'));
}

describe('transfer order import backend', () => {
  beforeEach(() => {
    allowPermission = true;
    existingRefs = new Set();
    client = makeClient();
    createTransferOrderMock().mockReset();
    createTransferOrderMock().mockImplementation(async (rawInput: unknown) => {
      const input = rawInput as CreateToPayload;
      return {
        ok: true,
        data: { toNumber: input.toNumber, lines: [] },
      } as Awaited<ReturnType<typeof createTransferOrder>>;
    });
  });

  it('validateToImport flags same-warehouse rows', async () => {
    const result = await validateToImport([toRow({ to_warehouse_code: 'WH-A' })]);

    expect(result.summary).toEqual({ total: 1, ok: 0, failed: 1 });
    expect(result.rows[0]?.errors).toContainEqual(
      expect.objectContaining({
        column: 'to_warehouse_code',
        message: 'Transfer source and destination warehouses must differ.',
      }),
    );
  });

  it('validateToImport flags missing-warehouse rows', async () => {
    const result = await validateToImport([toRow({ from_warehouse_code: 'WH-MISSING' })]);

    expect(result.summary).toEqual({ total: 1, ok: 0, failed: 1 });
    expect(result.rows[0]?.errors).toContainEqual(
      expect.objectContaining({
        column: 'from_warehouse_code',
        message: expect.stringContaining('WH-MISSING'),
      }),
    );
  });

  it('commitToImport groups rows into transfer orders correctly', async () => {
    const result = await commitToImport(
      [
        toRow({ external_ref: 'TO-EXT-A', from_warehouse_code: 'WH-A', to_warehouse_code: 'WH-B', item_code: 'ITEM-A', uom: 'kg' }),
        toRow({ external_ref: 'TO-EXT-A', from_warehouse_code: 'WH-A', to_warehouse_code: 'WH-B', item_code: 'ITEM-B', uom: 'ea' }),
        toRow({ external_ref: 'TO-EXT-B', from_warehouse_code: 'WH-B', to_warehouse_code: 'WH-A', item_code: 'ITEM-A', uom: 'kg' }),
        toRow({ external_ref: 'TO-EXT-B', from_warehouse_code: 'WH-B', to_warehouse_code: 'WH-A', item_code: 'ITEM-B', uom: 'box' }),
      ],
      { mode: 'skip_invalid' },
    );

    expect(result.failed).toEqual([]);
    expect(result.created).toEqual([
      { to_number: 'TO-EXT-A', external_ref: 'TO-EXT-A' },
      { to_number: 'TO-EXT-B', external_ref: 'TO-EXT-B' },
    ]);
    expect(createTransferOrder).toHaveBeenCalledTimes(2);

    const firstPayload = createTransferOrderMock().mock.calls[0]?.[0] as CreateToPayload | undefined;
    const secondPayload = createTransferOrderMock().mock.calls[1]?.[0] as CreateToPayload | undefined;
    expect(firstPayload).toEqual(
      expect.objectContaining({
        toNumber: 'TO-EXT-A',
        fromWarehouseId: WH_A_ID,
        toWarehouseId: WH_B_ID,
        status: 'draft',
      }),
    );
    expect(firstPayload?.lines).toEqual([
      { itemId: ITEM_A_ID, qty: '10', uom: 'kg', lineNo: 1 },
      { itemId: ITEM_B_ID, qty: '10', uom: 'pcs', lineNo: 2 },
    ]);
    expect(secondPayload).toEqual(
      expect.objectContaining({
        toNumber: 'TO-EXT-B',
        fromWarehouseId: WH_B_ID,
        toWarehouseId: WH_A_ID,
      }),
    );
    expect(secondPayload?.lines).toHaveLength(2);
    expect(importJobInsertCalls()).toHaveLength(1);
  });
});
