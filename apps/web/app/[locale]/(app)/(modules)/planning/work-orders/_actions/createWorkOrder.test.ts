import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrder } from './createWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const BOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SPEC_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let allowPermission = true;
let hasBom = true;
let itemUom = {
  output_uom: 'base',
  uom_base: 'kg',
  net_qty_per_each: null,
  each_per_box: null,
  boxes_per_pallet: null,
  weight_mode: 'fixed' as const,
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.bom_headers')) {
        return { rows: hasBom ? [{ id: BOM_ID, version: 3 }] : [], rowCount: hasBom ? 1 : 0 };
      }
      if (normalized.includes('from public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }], rowCount: 1 };
      }
      if (normalized.includes('from public.items') && normalized.includes('output_uom')) {
        return { rows: [itemUom], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.work_orders')) {
        const woId = String(params[0]);
        return {
          rows: [
            {
              id: woId,
              wo_number: String(params[1]),
              product_id: PRODUCT_ID,
              item_code: 'FG-NPD-004',
              item_type_at_creation: 'fg',
              planned_quantity: String(params[4]),
              produced_quantity: null,
              uom: String(params[15]),
              status: 'DRAFT',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              machine_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-NPD-004',
              notes: 'seed',
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_materials')) {
        return {
          rows: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              wo_id: String(params[0]),
              product_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              material_name: 'DEMO-RM-FLOUR',
              required_qty: '700.000',
              consumed_qty: '0.000',
              reserved_qty: '0.000',
              uom: 'kg',
              sequence: 1,
              material_source: 'stock',
              bom_item_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              bom_version: 3,
              notes: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.schedule_outputs')) {
        return {
          rows: [
            {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              planned_wo_id: String(params[0]),
              product_id: PRODUCT_ID,
              output_role: 'primary',
              expected_qty: String(params[2]),
              uom: String(params[4]),
              allocation_pct: '100.00',
              disposition: 'to_stock',
              downstream_wo_id: null,
              notes: 'seed',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('createWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    hasBom = true;
    itemUom = {
      output_uom: 'base',
      uom_base: 'kg',
      net_qty_per_each: null,
      each_per_box: null,
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };
    client = makeClient();
  });

  it('creates a draft WO and snapshots materials from the active BOM', async () => {
    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
      notes: 'seed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(expect.objectContaining({ status: 'DRAFT', itemCode: 'FG-NPD-004' }));
    expect(result.materials).toEqual([expect.objectContaining({ materialName: 'DEMO-RM-FLOUR', bomVersion: 3 })]);
    expect(result.primarySchedule).toEqual(expect.objectContaining({ outputRole: 'primary', expectedQty: '1000.000' }));
    expect(result.warning).toBeUndefined();
  });

  it('converts entered output units to base quantity for WO, materials, and schedule output', async () => {
    itemUom = {
      output_uom: 'box',
      uom_base: 'kg',
      net_qty_per_each: '0.1000',
      each_per_box: '10',
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };

    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1.000',
      quantityEntered: '300.000',
      quantityEnteredUom: 'box',
      notes: 'seed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.conversion).toEqual({ qtyEntered: '300.000', qtyEnteredUom: 'box', baseQty: '300.000' });
    expect(result.workOrder.plannedQuantity).toBe('300.000');
    expect(result.materials[0]?.requiredQty).toBe('700.000');
    expect(result.primarySchedule.expectedQty).toBe('300.000');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.work_orders'),
      expect.arrayContaining([
        expect.any(String),
        expect.any(String),
        PRODUCT_ID,
        BOM_ID,
        '300.000',
        null,
        null,
        null,
        'FG-NPD-004',
        expect.any(String),
        USER_ID,
        SPEC_ID,
        '300.000',
        'box',
        JSON.stringify({
          output_uom: 'box',
          uom_base: 'kg',
          net_qty_per_each: '0.1000',
          each_per_box: '10',
          boxes_per_pallet: null,
          weight_mode: 'fixed',
        }),
        'kg',
      ]),
    );
  });

  it('creates a WO without materials and returns no_active_bom when no active BOM exists', async () => {
    hasBom = false;

    const result = await createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.materials).toEqual([]);
    expect(result.warning).toBe('no_active_bom');
  });

  it('returns forbidden when the caller lacks planning write permission', async () => {
    allowPermission = false;

    await expect(createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
  });
});
