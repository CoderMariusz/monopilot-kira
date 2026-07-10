import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionActionError, type OrgContextLike, type QueryClient } from '../../shared';
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
const OTHER_PRODUCT_ID = '44444444-4444-4444-8444-444444444445';
const LP_ID = '77777777-7777-4777-8777-777777777777';
const LOCATION_ID = '88888888-8888-4888-8888-888888888888';
const TX_ID = '55555555-5555-4555-8555-555555555555';

type LpFixture = {
  product_id: string;
  quantity: string;
  uom: string;
  status: string;
  qa_status: string;
  site_id: string;
  wo_id: string | null;
};

let client: QueryClient;
let lpFixture: LpFixture;
let queryCalls: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function baseBody(lpId = LP_ID) {
  return {
    transaction_id: TX_ID,
    output_type: 'primary' as const,
    product_id: PRODUCT_ID,
    qty_kg: '25.500',
    uom: 'kg',
    lp_id: lpId,
  };
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
      if (n.includes('from public.license_plates lp') && n.includes('for update of lp')) {
        return {
          rows: [
            {
              id: LP_ID,
              product_id: lpFixture.product_id,
              quantity: lpFixture.quantity,
              uom: lpFixture.uom,
              status: lpFixture.status,
              qa_status: lpFixture.qa_status,
              site_id: lpFixture.site_id,
              wo_id: lpFixture.wo_id,
              location_id: LOCATION_ID,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.wo_outputs')) {
        return {
          rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: LP_ID, expiry_date: null }],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (n.includes('quantity + $2::numeric')) {
        return { rows: [{ id: LP_ID, quantity: '50.500' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput — caller-supplied LP integrity (Wave 9 Bug 1)', () => {
  beforeEach(() => {
    lpFixture = {
      product_id: PRODUCT_ID,
      quantity: '25.000',
      uom: 'kg',
      status: 'received',
      qa_status: 'pending',
      site_id: SITE_ID,
      wo_id: WO_ID,
    };
    client = makeClient();
    upsertWacMock.mockReset();
    upsertWacMock.mockResolvedValue(undefined);
  });

  it('rejects a supplied LP whose product does not match the output product', async () => {
    lpFixture.product_id = OTHER_PRODUCT_ID;

    await expect(registerOutput(makeCtx(), WO_ID, baseBody())).rejects.toMatchObject({
      code: 'invalid_reference',
      status: 422,
    });
  });

  it('rejects a consumed supplied LP before any wo_outputs write', async () => {
    lpFixture.status = 'consumed';

    await expect(registerOutput(makeCtx(), WO_ID, baseBody())).rejects.toMatchObject({
      code: 'lp_not_receivable',
      status: 409,
    });
  });

  it('rejects a supplied LP with UoM mismatch', async () => {
    lpFixture.uom = 'each';

    await expect(registerOutput(makeCtx(), WO_ID, baseBody())).rejects.toMatchObject({
      code: 'uom_mismatch',
      status: 409,
    });
  });

  it('increments the supplied LP quantity by the output qty in the same flow', async () => {
    const result = await registerOutput(makeCtx(), WO_ID, baseBody());

    expect(result.lp_id).toBe(LP_ID);
    expect(result.lp_number).toBeNull();
    const increment = queryCalls.find((call) => normalize(call.sql).includes('quantity + $2::numeric'));
    expect(increment?.params).toEqual([LP_ID, '25.500', USER_ID]);
  });
});
