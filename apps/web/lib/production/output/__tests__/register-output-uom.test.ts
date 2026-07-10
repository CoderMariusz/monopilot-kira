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
let itemMasterPack: { net_qty_per_each: string; each_per_box: number } | null;
let insertedQtyKg: string | null;
let insertedQtyUnits: string | null;
let insertedUnitsUom: string | null;
let insertedActualWeightKg: string | null;
let insertedBatchNumber: string | null;
let insertedSiteId: string | null;
let insertedLpSiteId: string | null;
let wacSnapshotUpdate: { params: readonly unknown[] } | null;
let wacSnapshotQtyParams: readonly unknown[] | null;
let wacSnapshotMockQtyKg: string | null;
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
      if (normalized.includes('allowed_products')) {
        return { rows: [{ allowed: true }], rowCount: 1 };
      }
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
      if (normalized.includes('select c.id::text as consumption_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
        throw new Error('resolveQtyKg must use WO snapshot SQL, not item master');
      }
      if (normalized.includes('as qty_kg') && normalized.includes('as resolved') && !normalized.includes('from public.items')) {
        wacSnapshotQtyParams = params;
        const qty = String(params[0] ?? '0');
        const uom = String(params[1] ?? '').toLowerCase();
        const uomBase = String(params[2] ?? '').toLowerCase();
        const netQtyPerEach = params[3];
        const eachPerBox = params[4];
        if (uom === 'box' && (eachPerBox == null || netQtyPerEach == null)) {
          return { rows: [{ qty_kg: '0', resolved: false }], rowCount: 1 };
        }
        if (uom === 'each' && netQtyPerEach == null) {
          return { rows: [{ qty_kg: '0', resolved: false }], rowCount: 1 };
        }
        if (uom === 'kg' || (uom === 'base' && uomBase === 'kg') || uom === uomBase) {
          return { rows: [{ qty_kg: wacSnapshotMockQtyKg ?? qty, resolved: true }], rowCount: 1 };
        }
        if (wacSnapshotMockQtyKg != null) {
          return { rows: [{ qty_kg: wacSnapshotMockQtyKg, resolved: true }], rowCount: 1 };
        }
        return { rows: [{ qty_kg: '0', resolved: false }], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        const master = itemMasterPack ?? { net_qty_per_each: '0.1000', each_per_box: 10 };
        return {
          rows: [
            {
              id: PRODUCT_ID,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: '2.50',
              net_qty_per_each: master.net_qty_per_each,
              each_per_box: master.each_per_box,
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
      if (normalized.includes('from public.license_plates')) {
        return {
          rows: [{ site_id: insertedLpSiteId ?? SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.stock_moves')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('with cfg as')) {
        return {
          rows: [
            {
              expected_input_kg: null,
              posted_consumption_kg: '0',
              effective_yield_pct: '100',
              block_pct: '0',
              warn: false,
              block: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('with material_wac as')) {
        return {
          rows: [{ material_cost: '0', prior_wac_booked: '0', output_baseline_kg: String(params[1] ?? '0') }],
          rowCount: 1,
        };
      }
      if (normalized.includes('select case') && normalized.includes('cost_per_kg')) {
        return { rows: [{ cost_per_kg: null, output_value: null }], rowCount: 1 };
      }
      if (normalized.startsWith('select ($1::numeric * $2::numeric)::text as output_value')) {
        return { rows: [{ output_value: String(Number(params[0]) * Number(params[1])) }], rowCount: 1 };
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
    itemMasterPack = { net_qty_per_each: '9.9999', each_per_box: 99 };
    insertedQtyKg = null;
    insertedQtyUnits = null;
    insertedUnitsUom = null;
    insertedActualWeightKg = null;
    insertedBatchNumber = null;
    insertedSiteId = null;
    insertedLpSiteId = null;
    wacSnapshotUpdate = null;
    wacSnapshotQtyParams = null;
    wacSnapshotMockQtyKg = null;
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
    wacSnapshotMockQtyKg = '3.000';

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '111.000',
      qtyUnits: '3.000',
      unitsUom: 'box',
    });

    expect(insertedQtyKg).toBe('3.000');
  });

  it('uses WO snapshot pack factors, not current item master metadata', async () => {
    wacSnapshotMockQtyKg = '3.000';

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qtyUnits: '3.000',
      unitsUom: 'box',
    });

    // 3 boxes × 10 each × 0.1 kg = 3.000 (snapshot), not 3 × 99 × 9.9999 from item master.
    expect(insertedQtyKg).toBe('3.000');
  });

  it('passes lossless snapshot decimal strings to SQL without JS float round-trip', async () => {
    const highPrecisionNetQty = '0.1234567890123456789';
    woSnapshot = {
      output_uom: 'box',
      uom_base: 'kg',
      net_qty_per_each: highPrecisionNetQty,
      each_per_box: '3',
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };
    wacSnapshotMockQtyKg = '6.9993';

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qtyUnits: '7.000',
      unitsUom: 'box',
    });

    expect(String(Number(highPrecisionNetQty))).not.toBe(highPrecisionNetQty);
    expect(wacSnapshotQtyParams).toEqual([
      '7.000',
      'box',
      'kg',
      highPrecisionNetQty,
      '3',
    ]);
    expect(insertedQtyKg).toBe('6.9993');
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
      JSON.stringify({ wac_qty_kg: '111.000', wac_value: '277.5', wac_cost_source: 'standard' }),
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

  it('rejects unavailable pack conversion via SQL UoM resolution', async () => {
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
