import { beforeEach, describe, expect, it } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let woSnapshot: Record<string, unknown> | null;
let insertedQtyKg: string | null;
let insertedQtyUnits: string | null;
let insertedUnitsUom: string | null;
let insertedActualWeightKg: string | null;
let insertedBatchNumber: string | null;
let insertedSiteId: string | null;
let insertedLpSiteId: string | null;
let wacSnapshotUpdate: { params: readonly unknown[] } | null;
let existingRealOutputCount: string;
let existingAllOutputCount: string;
let sequenceCountSql: string | null;
let sequenceCountParams: readonly unknown[] | null;

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalize(sql);
      if (normalized.includes('from public.work_orders')) {
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-001',
              site_id: SITE_ID,
              uom: 'kg',
              uom_snapshot: woSnapshot,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        return {
          rows: [
            {
              id: PRODUCT_ID,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: '2.50',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (normalized.includes('from public.wo_outputs') && normalized.includes('count(*)::text as seq')) {
        sequenceCountSql = sql;
        sequenceCountParams = params;
        return {
          rows: [{ seq: normalized.includes('correction_of_id is null') ? existingRealOutputCount : existingAllOutputCount }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_outputs')) {
        insertedBatchNumber = String(params[5]);
        insertedQtyKg = String(params[6]);
        insertedQtyUnits = params[11] === null ? null : String(params[11]);
        insertedUnitsUom = params[12] === null ? null : String(params[12]);
        insertedActualWeightKg = params[13] === null ? null : String(params[13]);
        insertedSiteId = params[14] === null ? null : String(params[14]);
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              lp_id: null,
              expiry_date: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      // W9-K-II output→LP creation path (no caller-supplied lp_id):
      if (normalized.includes('from public.warehouses')) {
        return {
          rows: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              default_location_id: '88888888-8888-4888-8888-888888888888',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_material_consumption')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith('insert into public.license_plates')) {
        insertedLpSiteId = params[0] === null ? null : String(params[0]);
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        return { rows: [{ value: String(Number(params[0] ?? 0) * Number(params[1] ?? 0)) }], rowCount: 1 };
      }
      if (normalized.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: String(params[2] ?? '0'), totalValue: String(params[3] ?? '0'), clamped: false }], rowCount: 1 };
      }
      if (normalized.startsWith('update public.wo_outputs') && normalized.includes('ext_jsonb')) {
        wacSnapshotUpdate = { params };
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('update public.wo_outputs')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput UOM quantity resolution', () => {
  beforeEach(() => {
    woSnapshot = {
      output_uom: 'box',
      uom_base: 'kg',
      net_qty_per_each: '0.1000',
      each_per_box: 10,
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };
    insertedQtyKg = null;
    insertedQtyUnits = null;
    insertedUnitsUom = null;
    insertedActualWeightKg = null;
    insertedBatchNumber = null;
    insertedSiteId = null;
    insertedLpSiteId = null;
    wacSnapshotUpdate = null;
    existingRealOutputCount = '0';
    existingAllOutputCount = '0';
    sequenceCountSql = null;
    sequenceCountParams = null;
    client = makeClient();
  });

  it('uses actualWeightKg before units conversion before legacy qty_kg', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
      qtyUnits: '300.000',
      unitsUom: 'box',
      actualWeightKg: '299.500',
    });

    expect(insertedQtyKg).toBe('299.500');
    expect(insertedQtyUnits).toBe('300.000');
    expect(insertedUnitsUom).toBe('box');
    expect(insertedActualWeightKg).toBe('299.500');
  });

  it('converts units to kg when actualWeightKg is absent', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
      qtyUnits: '300.000',
      unitsUom: 'box',
    });

    expect(insertedQtyKg).toBe('300.000');
  });

  it('falls back to legacy qty_kg when no unit quantity is provided', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
    });

    expect(insertedQtyKg).toBe('111.000');
  });

  it('stamps created output and output LP with the source WO site_id', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
    });

    expect(insertedSiteId).toBe(SITE_ID);
    expect(insertedLpSiteId).toBe(SITE_ID);
  });

  it('persists the booked WAC contribution snapshot on wo_outputs.ext_jsonb', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
    });

    expect(wacSnapshotUpdate?.params).toEqual([
      '66666666-6666-4666-8666-666666666666',
      JSON.stringify({ wac_qty_kg: '111.000', wac_value: '277.5' }),
      USER_ID,
    ]);
  });

  it('generates the next batch number from real outputs only, skipping correction counter-entries', async () => {
    existingRealOutputCount = '1';
    existingAllOutputCount = '2';

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
    });

    expect(insertedBatchNumber).toBe('WO-001-OUT-002');
    expect(sequenceCountParams).toEqual([WO_ID, 'primary']);
    expect(normalize(sequenceCountSql!)).toContain('and correction_of_id is null');
  });

  it('rejects unavailable pack conversion from the WO snapshot', async () => {
    woSnapshot = {
      output_uom: 'each',
      uom_base: 'kg',
      net_qty_per_each: '0.1000',
      each_per_box: null,
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qtyUnits: '300.000',
        unitsUom: 'box',
      }),
    ).rejects.toMatchObject({
      code: 'uom_conversion_unavailable',
      status: 422,
      details: { fields: ['qtyUnits', 'unitsUom'] },
    });
  });
});
