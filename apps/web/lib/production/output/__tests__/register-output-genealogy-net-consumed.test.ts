import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const upsertWacMock = vi.hoisted(() => vi.fn());

vi.mock('../../../finance/upsert-wac', () => ({
  upsertWac: upsertWacMock,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const PARENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTPUT_LP_ID = '99999999-9999-4999-8999-999999999999';
const TX_ID = '55555555-5555-4555-8555-555555555555';

type ConsumptionRow = { lp_id: string; net_qty: string };

let client: QueryClient;
let consumptionRows: ConsumptionRow[];
let queryCalls: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function makeClient(): QueryClient {
  queryCalls = [];
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      queryCalls.push({ sql, params });
      const n = normalize(sql);
      if (n.includes('allowed_products')) return { rows: [{ allowed: true }], rowCount: 1 };
      if (n.includes('from public.work_orders') && n.includes('wo_number')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (n.includes('from public.items')) {
        return {
          rows: [
            {
              id: PRODUCT_ID,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: '2.500000',
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_executions')) return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      if (n.includes('count(*)::text as seq')) return { rows: [{ seq: '0' }], rowCount: 1 };
      if (n.includes('with cfg as')) {
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
      if (n.includes('with material_wac as')) {
        return {
          rows: [{ material_cost: '10', prior_wac_booked: '0', output_baseline_kg: String(params[1] ?? '0') }],
          rowCount: 1,
        };
      }
      if (n.includes('sum(qty_consumed)') && n.includes('having sum(qty_consumed) > 0')) {
        return { rows: consumptionRows, rowCount: consumptionRows.length };
      }
      if (n.startsWith('insert into public.wo_outputs')) {
        return {
          rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.warehouses')) {
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
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: OUTPUT_LP_ID }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates') && n.includes('site_id')) {
        return {
          rows: [{ site_id: SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.lp_state_history')) return { rows: [], rowCount: 1 };
      if (n.startsWith('update public.wo_outputs')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput — genealogy net consumed qty (Wave 9 Bug 2)', () => {
  beforeEach(() => {
    consumptionRows = [
      { lp_id: PARENT_A, net_qty: '60.000' },
      { lp_id: PARENT_B, net_qty: '40.000' },
    ];
    client = makeClient();
    upsertWacMock.mockReset();
    upsertWacMock.mockResolvedValue(undefined);
  });

  it('writes per-parent genealogy qty from net consumed, not the full output qty', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '100.000',
    });

    const genealogyInserts = queryCalls.filter((call) =>
      normalize(call.sql).startsWith('insert into public.lp_genealogy'),
    );
    expect(genealogyInserts).toHaveLength(2);
    expect(genealogyInserts.map((call) => call.params)).toEqual(
      expect.arrayContaining([
        [OUTPUT_LP_ID, PARENT_A, '60.000', 'kg'],
        [OUTPUT_LP_ID, PARENT_B, '40.000', 'kg'],
      ]),
    );
  });

  it('excludes parents whose consumption was fully reversed (net <= 0)', async () => {
    consumptionRows = [{ lp_id: PARENT_B, net_qty: '40.000' }];

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '40.000',
    });

    const genealogyInserts = queryCalls.filter((call) =>
      normalize(call.sql).startsWith('insert into public.lp_genealogy'),
    );
    expect(genealogyInserts).toHaveLength(1);
    expect(genealogyInserts[0]?.params).toEqual([OUTPUT_LP_ID, PARENT_B, '40.000', 'kg']);
  });
});
