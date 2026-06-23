import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrder } from './createWorkOrder';
import { commitWoImport, validateWoImport, type WoImportRow } from './import-wo';
import type { CreateWorkOrderResult, QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_KG_ID = '33333333-3333-4333-8333-333333333333';
const FG_PCS_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';

type ItemFixture = {
  id: string;
  item_code: string;
  uom_base: string;
  uom_secondary: string | null;
  output_uom: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  boxes_per_pallet: string | null;
  weight_mode: 'fixed' | 'catch';
};

type CreateWoPayload = {
  productId: string;
  itemCode: string;
  plannedQuantity: string;
  quantityEntered?: string;
  quantityEnteredUom?: 'base' | 'each' | 'box';
  scheduledStartTime?: string;
  productionLineId?: string;
};

let client: QueryClient;
let allowPermission = true;
let activeBomCodes: Set<string>;
let existingRefs: Set<string>;

const items: ItemFixture[] = [
  {
    id: FG_KG_ID,
    item_code: 'FG-KG',
    uom_base: 'kg',
    uom_secondary: null,
    output_uom: 'base',
    net_qty_per_each: null,
    each_per_box: null,
    boxes_per_pallet: null,
    weight_mode: 'fixed',
  },
  {
    id: FG_PCS_ID,
    item_code: 'FG-PCS',
    uom_base: 'kg',
    uom_secondary: 'pcs',
    output_uom: 'each',
    net_qty_per_each: '0.5000',
    each_per_box: null,
    boxes_per_pallet: null,
    weight_mode: 'fixed',
  },
];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('./createWorkOrder', () => ({
  createWorkOrder: vi.fn(),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.items')) {
        const codes = new Set(params[0] as string[]);
        const rows = items.filter((item) => codes.has(item.item_code));
        return { rows, rowCount: rows.length };
      }
      if (normalized.includes('from public.bom_headers')) {
        const codes = new Set(params[0] as string[]);
        const rows = Array.from(activeBomCodes)
          .filter((product_id) => codes.has(product_id))
          .map((product_id) => ({ product_id }));
        return { rows, rowCount: rows.length };
      }
      if (normalized.includes('from public.production_lines')) {
        const codes = new Set(params[0] as string[]);
        const rows = codes.has('LINE-A') ? [{ id: LINE_ID, code: 'LINE-A' }] : [];
        return { rows, rowCount: rows.length };
      }
      if (normalized.includes('from public.unit_of_measure')) {
        const codes = new Set(params[0] as string[]);
        const rows = ['kg', 'pcs', 'each', 'box'].filter((code) => codes.has(code)).map((code) => ({ code }));
        return { rows, rowCount: rows.length };
      }
      if (normalized.startsWith('select external_ref')) {
        const refs = new Set(params[0] as string[]);
        const rows = Array.from(existingRefs).filter((external_ref) => refs.has(external_ref)).map((external_ref) => ({ external_ref }));
        return { rows, rowCount: rows.length };
      }
      if (normalized.startsWith('update public.work_orders')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('insert into public.import_export_jobs')) {
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as QueryClient['query'],
  };
}

function woRow(overrides: Partial<WoImportRow> = {}): WoImportRow {
  return {
    external_ref: 'WO-EXT-A',
    fg_code: 'FG-KG',
    qty: 10,
    uom: 'kg',
    planned_date: '2026-06-24',
    line_code: 'LINE-A',
    priority: 'normal',
    ...overrides,
  };
}

function createWorkOrderMock() {
  return vi.mocked(createWorkOrder);
}

function importJobInsertCalls() {
  return vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('insert into public.import_export_jobs'));
}

describe('work order import backend', () => {
  beforeEach(() => {
    allowPermission = true;
    activeBomCodes = new Set(['FG-KG', 'FG-PCS']);
    existingRefs = new Set();
    client = makeClient();
    createWorkOrderMock().mockReset();
    createWorkOrderMock().mockImplementation(async (rawInput: unknown) => {
      const input = rawInput as CreateWoPayload;
      return {
        ok: true,
        workOrder: {
          id: `${input.productId.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          woNumber: `WO-${input.itemCode}`,
          status: 'DRAFT',
        },
        materials: [],
        primarySchedule: {},
      } as CreateWorkOrderResult;
    });
  });

  it('validateWoImport fails FG rows with no active BOM', async () => {
    activeBomCodes = new Set();

    const result = await validateWoImport([woRow({ fg_code: 'FG-KG' })]);

    expect(result.summary).toEqual({ total: 1, ok: 0, failed: 1 });
    expect(result.rows[0]?.errors).toContainEqual({ column: 'fg_code', message: 'no active BOM' });
  });

  it('validateWoImport exposes converted quantity when uom differs from item base uom', async () => {
    const result = await validateWoImport([woRow({ fg_code: 'FG-PCS', qty: 100, uom: 'pcs' })]);

    expect(result.summary).toEqual({ total: 1, ok: 1, failed: 0 });
    expect(result.rows[0]?.convertedQty).toEqual({
      enteredQty: '100',
      enteredUom: 'pcs',
      baseQty: '50.000',
      baseUom: 'kg',
      display: '100 pcs -> 50 kg',
    });
  });

  it('commitWoImport creates DRAFT work orders through the canonical create action', async () => {
    const result = await commitWoImport(
      [
        woRow({ external_ref: 'WO-EXT-A', fg_code: 'FG-KG', qty: 10, uom: 'kg' }),
        woRow({ external_ref: 'WO-EXT-B', fg_code: 'FG-PCS', qty: 100, uom: 'pcs', priority: 'high' }),
      ],
      { mode: 'skip_invalid' },
    );

    expect(result.failed).toEqual([]);
    expect(result.created).toEqual([
      { wo_number: 'WO-FG-KG', external_ref: 'WO-EXT-A' },
      { wo_number: 'WO-FG-PCS', external_ref: 'WO-EXT-B' },
    ]);
    expect(createWorkOrder).toHaveBeenCalledTimes(2);
    expect(createWorkOrderMock().mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        productId: FG_KG_ID,
        itemCode: 'FG-KG',
        plannedQuantity: '10',
        quantityEntered: '10',
        quantityEnteredUom: 'base',
        scheduledStartTime: '2026-06-24T00:00:00.000Z',
        productionLineId: LINE_ID,
      }),
    );
    expect(createWorkOrderMock().mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        productId: FG_PCS_ID,
        itemCode: 'FG-PCS',
        plannedQuantity: '50.000',
        quantityEntered: '100',
        quantityEnteredUom: 'each',
      }),
    );
    expect(createWorkOrderMock().mock.results[0]?.type).toBe('return');
    expect(importJobInsertCalls()).toHaveLength(1);
  });
});
