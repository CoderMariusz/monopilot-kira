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
let insertedQtyKg: string | null;
let insertedQtyUnits: string | null;
let insertedActualWeightKg: string | null;
let insertedCatchDetails: string | null;

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
      if (normalized.includes('select pg_advisory_xact_lock')) {
        return { rows: [{}], rowCount: 1 };
      }
      if (normalized.includes('select c.id::text as consumption_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('from public.work_orders')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        return {
          rows: [{
            id: PRODUCT_ID,
            weight_mode: 'catch',
            shelf_life_days: null,
            nominal_weight: '1.000',
            variance_tolerance_pct: null,
            cost_per_kg: '2.50',
            net_qty_per_each: null,
            each_per_box: null,
          }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (normalized.includes('from public.wo_outputs') && normalized.includes('count(*)::text as seq')) {
        return { rows: [{ seq: '0' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_outputs')) {
        insertedQtyKg = String(params[6]);
        insertedQtyUnits = params[11] === null ? null : String(params[11]);
        insertedActualWeightKg = params[13] === null ? null : String(params[13]);
        insertedCatchDetails = params[8] === null ? null : String(params[8]);
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }], rowCount: 1 };
      }
      if (normalized.includes('from public.wo_material_consumption')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('from public.warehouses')) {
        return { rows: [{ id: '77777777-7777-4777-8777-777777777777', default_location_id: '88888888-8888-4888-8888-888888888888' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (normalized.includes('with existing as materialized')) {
        return { rows: [{ avg_cost_used: '2.50', value_debited: '2.375' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('with cfg as')) {
        return {
          rows: [{
            expected_input_kg: null,
            posted_consumption_kg: '0',
            effective_yield_pct: '100',
            block_pct: '0',
            warn: false,
            block: false,
          }],
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
        return { rows: [{ cost_per_kg: '2.50', output_value: '2.375' }], rowCount: 1 };
      }
      if (normalized.startsWith('select ($1::numeric * $2::numeric)::text as output_value')) {
        return { rows: [{ output_value: String(Number(params[0]) * Number(params[1])) }], rowCount: 1 };
      }
      if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        return { rows: [{ value: String(Number(params[0] ?? 0) * Number(params[1] ?? 0)) }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.stock_moves')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('from public.license_plates')) {
        return {
          rows: [{ site_id: SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('update public.wo_outputs')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${normalized}`);
    },
  };
}

beforeEach(() => {
  insertedQtyKg = null;
  insertedQtyUnits = null;
  insertedActualWeightKg = null;
  insertedCatchDetails = null;
  client = makeClient();
});

describe('registerOutput catch-weight persistence (S17)', () => {
  it('persists qty_units, catch_weight_details, and actual summed weight for 1×0.95 kg', async () => {
    const result = await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '1',
      catch_weight_kg_per_unit: ['0.95'],
    });

    expect(result.catch_weight_summary?.total_kg).toBe('0.950');
    expect(insertedQtyKg).toBe('0.950');
    expect(insertedQtyUnits).toBe('1');
    expect(insertedActualWeightKg).toBe('0.950');
    expect(insertedCatchDetails).not.toBeNull();
    const details = JSON.parse(insertedCatchDetails!);
    expect(details.per_unit_kg).toEqual(['0.95']);
    expect(details.reference_kg).toBe('1.000');
    expect(Number(details.variance_pct)).toBeGreaterThan(0);
  });
});
