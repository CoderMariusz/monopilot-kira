import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateWorkOrder } from './update-work-order';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_A_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_B_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const MACHINE_ID = '77777777-7777-4777-8777-777777777777';
const BOM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SPEC_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let client: QueryClient;
let allowPermission = true;
let currentStatus = 'DRAFT';
let productInOrg = true;
let lineInOrg = true;
let machineInOrg = true;
let raceUpdate = false;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function itemRow(productId: string) {
  return {
    id: productId,
    item_code: productId === PRODUCT_B_ID ? 'FG-B' : 'FG-A',
    output_uom: 'base',
    uom_base: 'kg',
    net_qty_per_each: null,
    each_per_box: null,
    boxes_per_pallet: null,
    weight_mode: 'fixed' as const,
  };
}

function workOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WO_ID,
    wo_number: 'WO-TEST-001',
    product_id: PRODUCT_A_ID,
    item_code: 'FG-A',
    item_type_at_creation: 'fg',
    planned_quantity: '100.000',
    produced_quantity: null,
    uom: 'kg',
    status: 'DRAFT',
    scheduled_start_time: null,
    scheduled_end_time: null,
    production_line_id: null,
    machine_id: null,
    priority: 'normal',
    source_of_demand: 'manual',
    source_reference: 'FG-A',
    notes: 'seed',
    created_at: '2026-06-09T07:00:00.000Z',
    updated_at: '2026-06-09T07:00:00.000Z',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('select id, status, product_id')) {
        return {
          rows: [
            {
              id: WO_ID,
              status: currentStatus,
              product_id: PRODUCT_A_ID,
              planned_quantity: '100.000',
              scheduled_start_time: null,
              production_line_id: null,
              machine_id: null,
              notes: 'seed',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.production_lines')) {
        return { rows: lineInOrg ? [{ id: LINE_ID }] : [], rowCount: lineInOrg ? 1 : 0 };
      }
      if (normalized.includes('from public.machines')) {
        return { rows: machineInOrg ? [{ id: MACHINE_ID }] : [], rowCount: machineInOrg ? 1 : 0 };
      }
      if (normalized.startsWith('select id, item_code, output_uom')) {
        return { rows: productInOrg ? [itemRow(String(params[0]))] : [], rowCount: productInOrg ? 1 : 0 };
      }
      if (normalized.includes('from public.bom_headers')) {
        const productCode = String(params[0]);
        return {
          rows: [{ id: productCode === 'FG-B' ? BOM_B_ID : BOM_A_ID, version: productCode === 'FG-B' ? 9 : 3 }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.factory_specs')) {
        return { rows: [{ id: SPEC_B_ID }], rowCount: 1 };
      }
      if (normalized.startsWith('update public.work_orders')) {
        if (raceUpdate) return { rows: [], rowCount: 0 };
        return {
          rows: [
            workOrderRow({
              product_id: String(params[1]),
              item_code: String(params[1]) === PRODUCT_B_ID ? 'FG-B' : 'FG-A',
              planned_quantity: String(params[2]),
              scheduled_start_time: params[3] as string | null,
              production_line_id: params[4] as string | null,
              machine_id: params[5] as string | null,
              notes: params[6] as string | null,
            }),
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('delete from public.wo_materials') || normalized.startsWith('delete from public.wo_operations')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_materials')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_operations')) {
        return { rows: [], rowCount: 2 };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('updateWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    currentStatus = 'DRAFT';
    productInOrg = true;
    lineInOrg = true;
    machineInOrg = true;
    raceUpdate = false;
    client = makeClient();
  });

  it('updates a draft WO and writes audit history', async () => {
    const result = await updateWorkOrder({
      id: WO_ID,
      scheduledStartTime: '2026-06-20T08:00:00.000Z',
      productionLineId: LINE_ID,
      machineId: MACHINE_ID,
      notes: 'moved',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(expect.objectContaining({ scheduledStartTime: '2026-06-20T08:00:00.000Z', notes: 'moved' }));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("and wo.status = 'DRAFT'"), expect.any(Array));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('insert into public.wo_status_history'), expect.any(Array));
  });

  it('returns invalid_state for a non-draft WO', async () => {
    currentStatus = 'RELEASED';

    await expect(updateWorkOrder({ id: WO_ID, notes: 'late edit' })).resolves.toEqual({ ok: false, error: 'invalid_state' });
  });

  it('returns forbidden when the product is outside the org', async () => {
    productInOrg = false;

    await expect(updateWorkOrder({ id: WO_ID, productId: PRODUCT_B_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns forbidden when line or machine is outside the org', async () => {
    lineInOrg = false;
    await expect(updateWorkOrder({ id: WO_ID, productionLineId: LINE_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });

    lineInOrg = true;
    machineInOrg = false;
    await expect(updateWorkOrder({ id: WO_ID, machineId: MACHINE_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('re-snapshots materials, operations, and uom data for a new product and quantity', async () => {
    const result = await updateWorkOrder({ id: WO_ID, productId: PRODUCT_B_ID, plannedQuantity: '50.000' });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => [String(sql).replace(/\s+/g, ' ').trim().toLowerCase(), params] as const);
    expect(calls.some(([sql]) => sql.startsWith('delete from public.wo_materials'))).toBe(true);
    expect(calls.some(([sql]) => sql.startsWith('delete from public.wo_operations'))).toBe(true);
    const materialInsert = calls.find(([sql]) => sql.startsWith('insert into public.wo_materials'));
    expect(materialInsert?.[1]).toEqual([WO_ID, '50.000', 9, BOM_B_ID]);
    const operationInsert = calls.find(([sql]) => sql.startsWith('insert into public.wo_operations'));
    expect(operationInsert?.[1]).toEqual([WO_ID, '50.000', PRODUCT_B_ID]);
    const updateCall = calls.find(([sql]) => sql.startsWith('update public.work_orders'));
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        WO_ID,
        PRODUCT_B_ID,
        '50.000',
        null,
        null,
        null,
        'seed',
        USER_ID,
        true,
        BOM_B_ID,
        SPEC_B_ID,
        'kg',
        JSON.stringify({
          output_uom: 'base',
          uom_base: 'kg',
          net_qty_per_each: null,
          each_per_box: null,
          boxes_per_pallet: null,
          weight_mode: 'fixed',
        }),
      ]),
    );
  });

  it('re-checks draft status in the UPDATE for races before snapshot writes', async () => {
    raceUpdate = true;

    await expect(updateWorkOrder({ id: WO_ID, productId: PRODUCT_B_ID, plannedQuantity: '50.000' })).resolves.toEqual({
      ok: false,
      error: 'invalid_state',
    });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase());
    expect(calls.some((sql) => sql.startsWith('delete from public.wo_materials'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.wo_materials'))).toBe(false);
  });

  it('returns forbidden when the caller lacks planning write permission', async () => {
    allowPermission = false;

    await expect(updateWorkOrder({ id: WO_ID, notes: 'blocked' })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });
});
