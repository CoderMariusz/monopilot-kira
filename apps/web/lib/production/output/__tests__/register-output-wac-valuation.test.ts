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
let wacSnapshotUpdate: { params: readonly unknown[] } | null;
let wacUpsertCalls = 0;

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeClient(standardCostPerKg: string | null): QueryClient {
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const n = normalize(sql);
      if (n.includes('allowed_products')) return { rows: [{ allowed: true }], rowCount: 1 };
      if (n.includes('from public.work_orders')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (n.includes('select c.id::text as consumption_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.items')) {
        return {
          rows: [
            {
              id: PRODUCT_ID,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: standardCostPerKg,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_executions')) return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      if (n.includes('count(*)::text as seq')) return { rows: [{ seq: '0' }], rowCount: 1 };
      if (n.startsWith('insert into public.wo_outputs')) {
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }], rowCount: 1 };
      }
      if (n.includes('with cfg as')) {
        return {
          rows: [{ expected_input_kg: null, posted_consumption_kg: '0', effective_yield_pct: '100', block_pct: '0', warn: false, block: false }],
          rowCount: 1,
        };
      }
      if (n.includes('with material_wac as')) {
        return { rows: [{ material_cost: '0', prior_wac_booked: '0', output_baseline_kg: String(params[1] ?? '0') }], rowCount: 1 };
      }
      if (n.includes('select case') && n.includes('cost_per_kg')) {
        return { rows: [{ cost_per_kg: null, output_value: null }], rowCount: 1 };
      }
      if (n.startsWith('select ($1::numeric * $2::numeric)::text as output_value')) {
        return { rows: [{ output_value: String(Number(params[0]) * Number(params[1])) }], rowCount: 1 };
      }
      if (n.includes('from public.warehouses')) {
        return {
          rows: [{ id: '77777777-7777-4777-8777-777777777777', default_location_id: '88888888-8888-4888-8888-888888888888' }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_material_consumption')) return { rows: [], rowCount: 0 };
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates') && n.includes('site_id')) {
        return { rows: [{ site_id: SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.lp_state_history')) return { rows: [], rowCount: 1 };
      if (n.includes('insert into public.item_wac_state')) {
        wacUpsertCalls += 1;
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }
      if (n.startsWith('update public.wo_outputs') && n.includes('ext_jsonb')) {
        wacSnapshotUpdate = { params };
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput WAC valuation', () => {
  beforeEach(() => {
    wacSnapshotUpdate = null;
    wacUpsertCalls = 0;
    client = makeClient(null);
  });

  it('succeeds without WAC booking when standard cost is null and WO has no computed cost', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10.000',
    });

    expect(wacUpsertCalls).toBe(0);
    expect(wacSnapshotUpdate).toBeNull();
  });

  it('books WAC from standard cost when WO has no computed material cost', async () => {
    client = makeClient('3.00');
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10.000',
    });

    expect(wacUpsertCalls).toBe(1);
    expect(wacSnapshotUpdate?.params).toEqual([
      '66666666-6666-4666-8666-666666666666',
      JSON.stringify({
        wac_qty_kg: '10.000',
        wac_value: '30',
        wac_cost_source: 'standard',
      }),
      USER_ID,
    ]);
  });
});
