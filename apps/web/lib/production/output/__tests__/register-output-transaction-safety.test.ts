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
const TX_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

let client: QueryClient;
let calls: QueryCall[];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function makeClient(): QueryClient {
  calls = [];
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const n = normalize(sql);
      if (n.includes('allowed_products')) return { rows: [{ allowed: true }], rowCount: 1 };
      if (n.includes('from public.work_orders')) {
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
      if (n.startsWith('insert into public.wo_outputs')) {
        return {
          rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }],
          rowCount: 1,
        };
      }
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
      if (n.includes('from public.wo_material_consumption')) return { rows: [], rowCount: 0 };
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
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

async function runInMockTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const committedWoOutputInserts: QueryCall[] = [];
  const originalQuery = client.query.bind(client);
  client.query = async (sql, params = []) => {
    const result = await originalQuery(sql, params);
    if (normalize(sql).startsWith('insert into public.wo_outputs')) {
      committedWoOutputInserts.push({ sql, params });
    }
    return result;
  };
  try {
    return await fn();
  } catch (err) {
    committedWoOutputInserts.length = 0;
    throw err;
  } finally {
    client.query = originalQuery;
  }
}

describe('registerOutput transaction safety', () => {
  beforeEach(() => {
    client = makeClient();
    upsertWacMock.mockReset();
    upsertWacMock.mockRejectedValue(new Error('wac-upsert-failed'));
  });

  it('throws after wo_outputs insert when upsertWac fails so the txn can roll back', async () => {
    await expect(
      runInMockTransaction(() =>
        registerOutput(makeCtx(), WO_ID, {
          transaction_id: TX_ID,
          output_type: 'primary',
          product_id: PRODUCT_ID,
          qty_kg: '10.000',
        }),
      ),
    ).rejects.toThrow('wac-upsert-failed');

    expect(calls.some((c) => normalize(c.sql).startsWith('insert into public.wo_outputs'))).toBe(true);
    expect(calls.some((c) => normalize(c.sql).startsWith('insert into public.outbox_events'))).toBe(false);
  });

  it('does not insert wo_outputs when WO is not recordable (pre-write gate)', async () => {
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const n = normalize(sql);
      if (n.includes('from public.wo_executions')) return { rows: [{ status: 'planned' }], rowCount: 1 };
      return originalQuery(sql, params);
    };

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qty_kg: '10.000',
      }),
    ).rejects.toBeInstanceOf(ProductionActionError);

    expect(calls.some((c) => normalize(c.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
    expect(upsertWacMock).not.toHaveBeenCalled();
  });
});
