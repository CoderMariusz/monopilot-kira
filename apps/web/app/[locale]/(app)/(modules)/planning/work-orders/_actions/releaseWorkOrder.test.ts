import { beforeEach, describe, expect, it, vi } from 'vitest';

import { releaseWorkOrder } from './releaseWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

let client: QueryClient;
let allowPermission = true;
let currentStatus: string | null = 'DRAFT';
let healedBomId: string | null = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let healedSpecId: string | null = '99999999-9999-4999-8999-999999999999';
// Item pack-hierarchy snapshot resolved by the healing preflight (O-2 gate).
let outputUom: string | null = 'base';
let netQtyPerEach: string | null = null;
let eachPerBox: string | null = null;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('select status from public.work_orders')) {
        return { rows: currentStatus ? [{ status: currentStatus }] : [], rowCount: currentStatus ? 1 : 0 };
      }
      if (normalized.startsWith('update public.work_orders') && normalized.includes('returning active_bom_header_id')) {
        return {
          rows: [
            {
              active_bom_header_id: healedBomId,
              active_factory_spec_id: healedSpecId,
              output_uom: outputUom,
              net_qty_per_each: netQtyPerEach,
              each_per_box: eachPerBox,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('update public.work_orders')) {
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-001',
              product_id: PRODUCT_ID,
              item_code: 'FG-NPD-004',
              item_type_at_creation: 'fg',
              planned_quantity: '1000.000',
              produced_quantity: null,
              uom: 'kg',
              status: 'RELEASED',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              machine_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-NPD-004',
              notes: null,
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
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

describe('releaseWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    currentStatus = 'DRAFT';
    healedBomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    healedSpecId = '99999999-9999-4999-8999-999999999999';
    outputUom = 'base';
    netQtyPerEach = null;
    eachPerBox = null;
    client = makeClient();
  });

  it('transitions DRAFT to RELEASED and returns the updated header', async () => {
    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(expect.objectContaining({ id: WO_ID, status: 'RELEASED' }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('uom_snapshot = coalesce'),
      [WO_ID, USER_ID],
    );
  });

  it('returns factory_release_incomplete with the missing list and does not release', async () => {
    healedBomId = null;
    healedSpecId = null;

    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result).toEqual({
      ok: false,
      error: 'factory_release_incomplete',
      missing: ['active_bom', 'factory_spec'],
    });
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("set status = 'RELEASED'"),
      expect.anything(),
    );
  });

  it('blocks release with pack_hierarchy_incomplete when a box FG has no each_per_box', async () => {
    outputUom = 'box';
    netQtyPerEach = '0.3000';
    eachPerBox = null;

    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result).toEqual({ ok: false, error: 'pack_hierarchy_incomplete' });
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("set status = 'RELEASED'"),
      expect.anything(),
    );
  });

  it('blocks release with pack_hierarchy_incomplete when an each FG has no net_qty_per_each', async () => {
    outputUom = 'each';
    netQtyPerEach = null;
    eachPerBox = null;

    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result).toEqual({ ok: false, error: 'pack_hierarchy_incomplete' });
  });

  it('NEVER blocks a base (bulk) FG even with no pack factors', async () => {
    outputUom = 'base';
    netQtyPerEach = null;
    eachPerBox = null;

    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
  });

  it('releases a complete box FG (all pack factors present)', async () => {
    outputUom = 'box';
    netQtyPerEach = '0.3000';
    eachPerBox = '3';

    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
  });

  it('stamps the UOM snapshot during the self-heal preflight', async () => {
    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("'output_uom', i.output_uom"),
      [WO_ID, USER_ID],
    );
  });

  it('returns forbidden when the caller lacks planning write permission', async () => {
    allowPermission = false;

    await expect(releaseWorkOrder({ id: WO_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects non-DRAFT work orders', async () => {
    currentStatus = 'IN_PROGRESS';

    await expect(releaseWorkOrder({ id: WO_ID })).resolves.toEqual({ ok: false, error: 'invalid_state' });
  });
});
