import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateWorkOrder } from './update-work-order';
import type { QueryClient } from './shared';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_A_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_B_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const BOM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SPEC_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CHILD_WO_ID = '99999999-9999-4999-8999-999999999999';
const CHILD_PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const BOM_LINE_ID = '88888888-8888-4888-8888-888888888889';
const NEW_PARENT_MATERIAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';

let client: QueryClient;
let allowPermission = true;
let currentStatus = 'DRAFT';
let productInOrg = true;
let lineInOrg = true;
let raceUpdate = false;
let currentScheduledStartTime: string | null = null;
let currentLineId: string | null = null;
let lineSiteId: string | null = SITE_ID;
let chainChildStatus = 'DRAFT';
let chainEdgesPresent = false;

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

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
      if (normalized.startsWith('select id, status, site_id')) {
        return {
          rows: [
            {
              id: WO_ID,
              status: currentStatus,
              site_id: SITE_ID,
              product_id: PRODUCT_A_ID,
              planned_quantity: '100.000',
              scheduled_start_time: currentScheduledStartTime,
              production_line_id: currentLineId,
              notes: 'seed',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.production_lines')) {
        return {
          rows: lineInOrg ? [{ id: LINE_ID, site_id: lineSiteId }] : [],
          rowCount: lineInOrg ? 1 : 0,
        };
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
      if (normalized.includes('from public.wo_dependencies dep')) {
        if (!chainEdgesPresent) return { rows: [], rowCount: 0 };
        return {
          rows: [{
            child_wo_id: CHILD_WO_ID,
            child_status: chainChildStatus,
            child_product_id: CHILD_PRODUCT_ID,
            link_product_id: CHILD_PRODUCT_ID,
            link_bom_item_id: BOM_LINE_ID,
          }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_materials') && normalized.includes('and wo_id = $1::uuid') && normalized.includes('bom_item_id')) {
        return {
          rows: [{
            id: NEW_PARENT_MATERIAL_ID,
            product_id: CHILD_PRODUCT_ID,
            bom_item_id: BOM_LINE_ID,
            required_qty: '10.710',
          }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('update public.wo_dependencies') && normalized.includes('material_link')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('update public.work_orders') && params[0] === CHILD_WO_ID) {
        return { rows: [{ id: CHILD_WO_ID }], rowCount: chainChildStatus === 'IN_PROGRESS' ? 0 : 1 };
      }
      if (normalized.startsWith('update public.work_orders')) {
        if (raceUpdate) return { rows: [], rowCount: 0 };
        // Simulate the boolean-flag CASE logic from the real SQL:
        //   $15 (params[14]) → explicit production_line_id write flag
        const linePresent = params[14] === true;
        return {
          rows: [
            workOrderRow({
              product_id: String(params[1]),
              item_code: String(params[1]) === PRODUCT_B_ID ? 'FG-B' : 'FG-A',
              planned_quantity: String(params[2]),
              scheduled_start_time: params[13] === true ? (params[3] as string | null) : currentScheduledStartTime,
              production_line_id: linePresent ? (params[4] as string | null) : currentLineId,
              notes: params[5] as string | null,
            }),
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('update public.schedule_outputs')) {
        return { rows: [], rowCount: 1 };
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

function updateWorkOrderCall(): readonly unknown[] {
  const call = vi
    .mocked(client.query)
    .mock.calls.find(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update public.work_orders'));
  if (!call) throw new Error('update public.work_orders call missing');
  return call[1] as readonly unknown[];
}

describe('updateWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    currentStatus = 'DRAFT';
    productInOrg = true;
    lineInOrg = true;
    raceUpdate = false;
    currentScheduledStartTime = null;
    currentLineId = null;
    lineSiteId = SITE_ID;
    chainChildStatus = 'DRAFT';
    chainEdgesPresent = false;
    client = makeClient();
  });

  it('updates a draft WO and writes audit history', async () => {
    const result = await updateWorkOrder({
      id: WO_ID,
      scheduledStartTime: '2026-06-20T08:00:00.000Z',
      productionLineId: LINE_ID,
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

  it('returns forbidden when the production line is outside the org', async () => {
    lineInOrg = false;
    await expect(updateWorkOrder({ id: WO_ID, productionLineId: LINE_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('re-snapshots materials, operations, and uom data for a new product and quantity', async () => {
    const result = await updateWorkOrder({ id: WO_ID, productId: PRODUCT_B_ID, plannedQuantity: '50.000' });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => [String(sql).replace(/\s+/g, ' ').trim().toLowerCase(), params] as const);
    expect(calls.some(([sql]) => sql.startsWith('delete from public.wo_materials'))).toBe(true);
    expect(calls.some(([sql]) => sql.startsWith('delete from public.wo_operations'))).toBe(true);
    const materialInsert = calls.find(([sql]) => sql.startsWith('insert into public.wo_materials'));
    expect(materialInsert?.[0]).toContain('select app.current_org_id(), $1::uuid, i.id, bl.component_code');
    expect(materialInsert?.[0]).not.toContain('coalesce(i.id, bl.id)');
    expect(materialInsert?.[1]).toEqual([WO_ID, '50.000000', 9, BOM_B_ID]);
    const operationInsert = calls.find(([sql]) => sql.startsWith('insert into public.wo_operations'));
    expect(operationInsert?.[1]).toEqual([WO_ID, '50.000', PRODUCT_B_ID]);
    const scheduleOutputUpdate = calls.find(([sql]) => sql.startsWith('update public.schedule_outputs'));
    expect(scheduleOutputUpdate?.[0]).toContain('planned_wo_id = $1::uuid');
    expect(scheduleOutputUpdate?.[1]).toEqual([WO_ID, '50.000']);
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
    expect(updateCall?.[1]?.[12]).toBe(false);
  });

  it('keeps existing notes when notes is omitted without resnapshotting', async () => {
    const result = await updateWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    const params = updateWorkOrderCall();
    expect(params[5]).toBe('seed');
    expect(params[12]).toBe(false);
  });

  it('clears scheduled start time when null is explicitly present', async () => {
    currentScheduledStartTime = '2026-06-20T08:00:00.000Z';

    const result = await updateWorkOrder({ id: WO_ID, scheduledStartTime: null });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.scheduledStartTime).toBeNull();
    const call = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update public.work_orders'));
    expect(String(call?.[0])).toContain(
      'scheduled_start_time = case when $14::boolean then $4::timestamptz else wo.scheduled_start_time end',
    );
    expect(call?.[1]?.[3]).toBeNull();
    expect(call?.[1]?.[13]).toBe(true);
  });

  it('keeps scheduled start time when it is omitted', async () => {
    currentScheduledStartTime = '2026-06-20T08:00:00.000Z';

    const result = await updateWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.scheduledStartTime).toBe('2026-06-20T08:00:00.000Z');
    const params = updateWorkOrderCall();
    expect(params[3]).toBeNull();
    expect(params[13]).toBe(false);
  });

  it('clears notes to JSON null when notes is an empty string', async () => {
    const result = await updateWorkOrder({ id: WO_ID, notes: '' });

    expect(result.ok).toBe(true);
    const params = updateWorkOrderCall();
    expect(params[5]).toBeNull();
    expect(params[12]).toBe(true);
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

  it('clears production_line_id to NULL when null is explicitly passed', async () => {
    currentLineId = LINE_ID;

    const result = await updateWorkOrder({ id: WO_ID, productionLineId: null });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.productionLineId).toBeNull();
    const params = updateWorkOrderCall();
    // $5 (idx 4) = null (explicit clear)
    expect(params[4]).toBeNull();
    // $15 (idx 14) = true (explicitly provided)
    expect(params[14]).toBe(true);
  });

  it('keeps existing production_line_id when productionLineId is omitted', async () => {
    currentLineId = LINE_ID;

    const result = await updateWorkOrder({ id: WO_ID, notes: 'no line change' });

    expect(result.ok).toBe(true);
    const params = updateWorkOrderCall();
    // $15 (idx 14) = false (not provided)
    expect(params[14]).toBe(false);
  });

  it('A3-S1: rejects a cross-site production line on edit', async () => {
    lineSiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(updateWorkOrder({ id: WO_ID, productionLineId: LINE_ID })).resolves.toEqual({
      ok: false,
      error: 'line_site_mismatch',
    });
  });

  it('A3-S4: revalidates planning list and detail routes after update', async () => {
    vi.mocked(revalidateLocalized).mockClear();

    const result = await updateWorkOrder({ id: WO_ID, notes: 'refresh me' });

    expect(result.ok).toBe(true);
    expect(revalidateLocalized).toHaveBeenCalledWith('/planning/work-orders');
    expect(revalidateLocalized).toHaveBeenCalledWith(`/planning/work-orders/${WO_ID}`);
  });

  it('B1a: propagates chain child quantities when planned quantity changes', async () => {
    chainEdgesPresent = true;

    const result = await updateWorkOrder({ id: WO_ID, plannedQuantity: '127.500' });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase());
    expect(calls.some((sql) => sql.includes('from public.wo_dependencies dep') && sql.includes('for update of child, dep'))).toBe(true);
    const relink = vi.mocked(client.query).mock.calls.find(([sql]) => {
      const n = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      return n.startsWith('update public.wo_dependencies') && n.includes('material_link');
    });
    expect(relink?.[1]).toEqual([WO_ID, CHILD_WO_ID, '10.710', NEW_PARENT_MATERIAL_ID]);
  });

  it('B1a: returns chain_child_not_editable without persisting parent writes when child progressed', async () => {
    chainEdgesPresent = true;
    chainChildStatus = 'IN_PROGRESS';

    await expect(updateWorkOrder({ id: WO_ID, plannedQuantity: '127.500' })).resolves.toEqual({
      ok: false,
      error: 'chain_child_not_editable',
    });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase());
    expect(calls.some((sql) => sql.startsWith('update public.work_orders'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('delete from public.wo_materials'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.wo_materials'))).toBe(false);
  });
});
