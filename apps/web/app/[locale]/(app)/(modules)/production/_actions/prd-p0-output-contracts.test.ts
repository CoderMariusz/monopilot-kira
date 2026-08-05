import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QualityHoldError,
  type OrgContextLike,
  type QueryClient,
} from '../../../../../../lib/production/shared';
import { registerOutput } from '../../../../../../lib/production/output/register-output';

const upsertWacMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../lib/finance/upsert-wac', () => ({
  upsertWac: upsertWacMock,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const WO_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const LP_ID = '77777777-7777-4777-8777-777777777777';
const HOLD_ID = '88888888-8888-4888-8888-888888888888';
const TX_ID = '99999999-9999-4999-8999-999999999999';

type Call = { sql: string; params: readonly unknown[] };
let calls: Call[];
let productAllowed: boolean;
let suppliedLpHeld: boolean;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const query = normalize(sql);

      if (query.includes('allowed_products')) {
        return { rows: [{ allowed: productAllowed }], rowCount: 1 };
      }
      if (query.includes('join public.production_lines')) return { rows: [], rowCount: 0 };
      if (query.includes('from public.work_orders') && query.includes('wo_number')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (query.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (query.includes('from public.items')) {
        return {
          rows: [
            {
              id: params[0],
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: '1.00',
            },
          ],
          rowCount: 1,
        };
      }
      if (query.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (query.includes('with target_lp as') && query.includes('from public.v_active_holds')) {
        return {
          rows: suppliedLpHeld
            ? [{ hold_id: HOLD_ID, reference_type: 'lp', reference_id: LP_ID }]
            : [],
          rowCount: suppliedLpHeld ? 1 : 0,
        };
      }
      if (query.startsWith('select pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
      if (query.includes('with cfg as') && query.includes('massbalance_threshold_pct')) {
        return { rows: [], rowCount: 0 };
      }
      if (query.includes('from public.wo_outputs') && query.includes('count(*)::text as seq')) {
        return { rows: [{ seq: '0' }], rowCount: 1 };
      }
      if (query.includes('with material_wac as')) {
        return {
          rows: [{ material_cost: '10', prior_wac_booked: '0', output_baseline_kg: String(params[1] ?? '0') }],
          rowCount: 1,
        };
      }
      if (query.startsWith('select case') && query.includes('cost_per_kg')) {
        return { rows: [{ cost_per_kg: '1.00', output_value: '10' }], rowCount: 1 };
      }
      if (query.includes('from public.warehouses')) {
        return {
          rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', default_location_id: null }],
          rowCount: 1,
        };
      }
      if (query.startsWith('insert into public.wo_outputs')) {
        return {
          rows: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', lp_id: null, expiry_date: null }],
          rowCount: 1,
        };
      }
      if (query.includes('from public.wo_material_consumption')) return { rows: [], rowCount: 0 };
      if (query.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], rowCount: 1 };
      }
      if (query.includes('from public.license_plates')) {
        return { rows: [{ site_id: SITE_ID, location_id: null }], rowCount: 1 };
      }
      if (
        query.startsWith('insert into public.lp_genealogy') ||
        query.startsWith('insert into public.lp_state_history') ||
        query.startsWith('insert into public.stock_moves') ||
        query.startsWith('insert into public.outbox_events') ||
        query.startsWith('update public.wo_outputs')
      ) {
        return { rows: [], rowCount: 1 };
      }
      if (query.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        return { rows: [{ value: '10' }], rowCount: 1 };
      }
      if (query.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }
      if (query.includes('from public.v_active_holds')) return { rows: [], rowCount: 0 };

      throw new Error(`unexpected query: ${query}`);
    }),
  } as QueryClient;
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client: makeClient() };
}

beforeEach(() => {
  calls = [];
  productAllowed = true;
  suppliedLpHeld = false;
  upsertWacMock.mockReset();
  upsertWacMock.mockResolvedValue(undefined);
});

describe('output product allow-list (PRD-043)', () => {
  it('accepts declared schedule/BOM roles including both by-product spellings', async () => {
    const result = await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'by_product',
      product_id: PRODUCT_ID,
      qty_kg: '10',
    });

    expect(result.output_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const gate = calls.find((call) => normalize(call.sql).includes('allowed_products'));
    const gateSql = normalize(gate?.sql ?? '');
    expect(gate?.params).toEqual([WO_ID, PRODUCT_ID, 'by_product']);
    expect(gateSql).toContain('from public.schedule_outputs');
    expect(gateSql).toContain('from public.bom_co_products');
    expect(gateSql).toContain("ap.role in ('byproduct', 'by_product')");
  });

  it('rejects an undeclared product before any output write', async () => {
    productAllowed = false;

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: OTHER_PRODUCT_ID,
        qty_kg: '10',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_reference',
      status: 422,
      details: { field: 'product_id' },
    });
    expect(
      calls.some((call) => normalize(call.sql).startsWith('insert into public.wo_outputs')),
    ).toBe(false);
  });
});

describe('output quality holds (PRD-047)', () => {
  it('derives ON_HOLD for a WO-held output and PENDING otherwise', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10',
    });

    const insert = calls.find((call) =>
      normalize(call.sql).startsWith('insert into public.wo_outputs'),
    );
    const insertSql = normalize(insert?.sql ?? '');
    expect(insertSql).toContain('from public.v_active_holds');
    expect(insertSql).toContain("h.reference_type = 'wo'");
    expect(insertSql).toContain("then 'on_hold'");
    expect(insertSql).toContain("else 'pending'");
  });

  it('rejects a held supplied LP before writing wo_outputs', async () => {
    suppliedLpHeld = true;

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qty_kg: '10',
        lp_id: LP_ID,
      }),
    ).rejects.toMatchObject({
      name: 'QualityHoldError',
      code: 'quality_hold_active',
      status: 409,
      hold: { holdId: HOLD_ID, lpId: LP_ID, lotId: null },
      lpId: LP_ID,
      blockedPath: 'output',
    } satisfies Partial<QualityHoldError>);
    expect(
      calls.some((call) => normalize(call.sql).startsWith('insert into public.wo_outputs')),
    ).toBe(false);
  });
});
