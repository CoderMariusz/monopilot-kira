import { beforeEach, describe, expect, it } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const TX_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let productAllowed: boolean;
let queries: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.work_orders') && n.includes('wo_number')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (n.includes('allowed_products')) {
        return { rows: [{ allowed: productAllowed }], rowCount: 1 };
      }
      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (n.includes('from public.items')) {
        return {
          rows: [{
            id: params[0],
            weight_mode: 'fixed',
            shelf_life_days: null,
            nominal_weight: null,
            variance_tolerance_pct: null,
            cost_per_kg: '1.00',
          }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (n.includes('from public.v_active_holds')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.startsWith('select pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.includes('with cfg as') && n.includes('massbalance_threshold_pct')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.startsWith('insert into public.lp_genealogy')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.includes('from public.wo_outputs') && n.includes('count(*)::text as seq')) {
        return { rows: [{ seq: '0' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.wo_outputs')) {
        return { rows: [{ id: '77777777-7777-4777-8777-777777777777', lp_id: null, expiry_date: null }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.includes('from public.warehouses')) {
        return { rows: [{ id: '88888888-8888-4888-8888-888888888888', default_location_id: null }], rowCount: 1 };
      }
      if (n.includes('from public.wo_material_consumption')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (n.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        return { rows: [{ value: '10' }], rowCount: 1 };
      }
      if (n.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }
      if (n.startsWith('update public.wo_outputs')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${n}`);
    },
  };
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

describe('registerOutput product validation', () => {
  beforeEach(() => {
    productAllowed = true;
    queries = [];
    client = makeClient();
  });

  it('rejects an undeclared product before any output row is written', async () => {
    productAllowed = false;

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: OTHER_PRODUCT_ID,
        qty_kg: '10',
      }),
    ).rejects.toMatchObject({
      name: 'ProductionActionError',
      code: 'invalid_reference',
      status: 422,
      details: { field: 'product_id' },
    });

    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(false);
    const gate = queries.find((q) => normalize(q.sql).includes('allowed_products'));
    expect(gate?.params).toEqual([WO_ID, OTHER_PRODUCT_ID, 'primary']);
  });

  it('allows a declared primary product and inserts the output row', async () => {
    const result = await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10',
    });

    expect(result.output_id).toBe('77777777-7777-4777-8777-777777777777');
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_outputs'))).toBe(true);
  });
});
