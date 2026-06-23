import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getInventoryByBatch,
  getInventoryByLocation,
  getInventoryByProduct,
} from '../inventory-actions';
import type { QueryClient } from '../shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const LOCATION_ID = '44444444-4444-4444-8444-444444444444';
const WAREHOUSE_ID = '55555555-5555-4555-8555-555555555555';

type LpFixture = {
  productId: string;
  itemCode: string;
  itemName: string;
  batchNumber: string;
  locationId: string;
  locationCode: string;
  warehouseId: string;
  warehouseCode: string;
  quantity: string;
  status: string;
  qaStatus: string;
  expiryDate: string;
  uom: string;
};

let client: QueryClient;
let allowPermission = true;
let lps: LpFixture[] = [];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function activeRows(): LpFixture[] {
  return lps.filter((lp) => !['consumed', 'shipped', 'destroyed', 'merged', 'returned'].includes(lp.status));
}

function pickableRows(rows: LpFixture[]): LpFixture[] {
  return rows.filter((lp) => lp.status === 'available' && lp.qaStatus === 'released');
}

function sumQty(rows: LpFixture[]): string {
  return String(rows.reduce((total, lp) => total + Number(lp.quantity), 0));
}

function aggregate(rows: LpFixture[]) {
  return {
    total_qty: sumQty(rows),
    pickable_qty: sumQty(pickableRows(rows)),
    lp_count: rows.length,
    earliest_expiry_date: rows.map((lp) => lp.expiryDate).sort()[0] ?? null,
  };
}

function directInventorySql(): string {
  const call = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(sql).includes('from public.license_plates lp'));
  if (!call) throw new Error('expected direct license_plates inventory query');
  return normalize(String(call[0]));
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      const active = activeRows();
      if (q.includes('from public.license_plates lp') && q.includes('group by lp.product_id, i.item_code, i.name')) {
        const agg = aggregate(active);
        return {
          rows: [
            {
              product_id: PRODUCT_ID,
              item_code: 'RM-001',
              item_name: 'Raw material',
              total_qty: agg.total_qty,
              pickable_qty: agg.pickable_qty,
              lp_count: agg.lp_count,
              earliest_expiry_date: agg.earliest_expiry_date,
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.license_plates lp') && q.includes('group by lp.location_id, l.code, lp.warehouse_id, w.code')) {
        const agg = aggregate(active);
        return {
          rows: [
            {
              location_id: LOCATION_ID,
              location_code: 'COLD-A1',
              warehouse_id: WAREHOUSE_ID,
              warehouse_code: 'WH-A',
              total_qty: agg.total_qty,
              pickable_qty: agg.pickable_qty,
              lp_count: agg.lp_count,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.license_plates lp') && q.includes('group by lp.product_id, i.item_code, lp.batch_number')) {
        const agg = aggregate(active);
        return {
          rows: [
            {
              product_id: PRODUCT_ID,
              item_code: 'RM-001',
              batch_number: 'B-001',
              total_qty: agg.total_qty,
              pickable_qty: agg.pickable_qty,
              lp_count: agg.lp_count,
              earliest_expiry_date: agg.earliest_expiry_date,
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  lps = [
    {
      productId: PRODUCT_ID,
      itemCode: 'RM-001',
      itemName: 'Raw material',
      batchNumber: 'B-001',
      locationId: LOCATION_ID,
      locationCode: 'COLD-A1',
      warehouseId: WAREHOUSE_ID,
      warehouseCode: 'WH-A',
      quantity: '100',
      status: 'available',
      qaStatus: 'released',
      expiryDate: '2026-07-01T00:00:00.000Z',
      uom: 'kg',
    },
    {
      productId: PRODUCT_ID,
      itemCode: 'RM-001',
      itemName: 'Raw material',
      batchNumber: 'B-001',
      locationId: LOCATION_ID,
      locationCode: 'COLD-A1',
      warehouseId: WAREHOUSE_ID,
      warehouseCode: 'WH-A',
      quantity: '50',
      status: 'reserved',
      qaStatus: 'released',
      expiryDate: '2026-07-02T00:00:00.000Z',
      uom: 'kg',
    },
    {
      productId: PRODUCT_ID,
      itemCode: 'RM-001',
      itemName: 'Raw material',
      batchNumber: 'B-001',
      locationId: LOCATION_ID,
      locationCode: 'COLD-A1',
      warehouseId: WAREHOUSE_ID,
      warehouseCode: 'WH-A',
      quantity: '25',
      status: 'blocked',
      qaStatus: 'on_hold',
      expiryDate: '2026-07-03T00:00:00.000Z',
      uom: 'kg',
    },
    {
      productId: PRODUCT_ID,
      itemCode: 'RM-001',
      itemName: 'Raw material',
      batchNumber: 'B-001',
      locationId: LOCATION_ID,
      locationCode: 'COLD-A1',
      warehouseId: WAREHOUSE_ID,
      warehouseCode: 'WH-A',
      quantity: '999',
      status: 'consumed',
      qaStatus: 'released',
      expiryDate: '2026-06-01T00:00:00.000Z',
      uom: 'kg',
    },
  ];
  client = makeClient();
});

describe('inventory pivot actions', () => {
  it('by product totals reserved/blocked LPs, excludes consumed LPs, and only counts released available LPs as pickable', async () => {
    const result = await getInventoryByProduct();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[0]).toMatchObject({
      productId: PRODUCT_ID,
      totalQty: '175',
      pickableQty: '100',
      quantity: '175',
      availableQty: '100',
      lpCount: 3,
    });

    const sql = directInventorySql();
    expect(sql).toContain('from public.license_plates lp');
    expect(sql).not.toContain('v_inventory_available');
    expect(sql).toContain("lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')");
    expect(sql).toContain('sum(lp.quantity) filter ( where lp.status = \'available\' and lp.qa_status = \'released\' )');
  });

  it('by location uses the same on-hand and pickable scope', async () => {
    const result = await getInventoryByLocation();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[0]).toMatchObject({
      locationId: LOCATION_ID,
      warehouseId: WAREHOUSE_ID,
      totalQty: '175',
      pickableQty: '100',
      lpCount: 3,
    });
    expect(directInventorySql()).not.toContain('v_inventory_available');
  });

  it('by batch uses the same on-hand and pickable scope', async () => {
    const result = await getInventoryByBatch();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[0]).toMatchObject({
      productId: PRODUCT_ID,
      batchNumber: 'B-001',
      totalQty: '175',
      pickableQty: '100',
      lpCount: 3,
    });
    expect(directInventorySql()).not.toContain('v_inventory_available');
  });
});
