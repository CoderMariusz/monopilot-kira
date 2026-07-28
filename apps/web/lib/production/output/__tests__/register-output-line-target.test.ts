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
const TX_ID = '55555555-5555-4555-8555-555555555555';

/** Warehouse the line's configured output location lives in. */
const LINE_WAREHOUSE_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
/** What the line is configured for — e.g. R02-ZONE. */
const LINE_LOCATION_ID = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';

/** What the warehouse-first-location scan picks — e.g. R02-BIN1. */
const FALLBACK_WAREHOUSE_ID = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const FALLBACK_LOCATION_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

type QueryCall = { sql: string; params: readonly unknown[] };

let client: QueryClient;
let calls: QueryCall[];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

/**
 * Same fake client as register-output-transaction-safety.test.ts (which proves
 * this harness drives registerOutput all the way from validation through the
 * license_plates insert to upsertWac), plus one branch for the line-target
 * lookup.
 *
 * `lineTarget: null` models a WO with no production line, or a line with no
 * configured output location: the resolver finds nothing and the caller must
 * fall back to the warehouse scan rather than refuse to register production.
 */
function makeClient(lineTarget: { id: string; default_location_id: string } | null): QueryClient {
  calls = [];
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const n = normalize(sql);
      // MUST be tested before the generic work_orders branch: the line-target
      // query SELECTS FROM work_orders and JOINS production_lines, so matching
      // on `from public.production_lines` never fired and the WO row answered
      // this query instead — the fallback then won and hid the real behaviour.
      if (n.includes('join public.production_lines')) {
        return lineTarget ? { rows: [lineTarget], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
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
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }], rowCount: 1 };
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
      // The old path: a warehouse plus its alphabetically FIRST location, aliased
      // as `default_location_id`. That alias is not the line's setting.
      if (n.includes('from public.warehouses')) {
        return { rows: [{ id: FALLBACK_WAREHOUSE_ID, default_location_id: FALLBACK_LOCATION_ID }], rowCount: 1 };
      }
      if (n.includes('from public.wo_material_consumption')) return { rows: [], rowCount: 0 };
      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates') && n.includes('site_id')) {
        return { rows: [{ site_id: SITE_ID, location_id: FALLBACK_LOCATION_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

/**
 * `createOutputLp` runs BEFORE `upsertWac`, so failing the WAC step stops the
 * flow just past the insert under test. That keeps the assertions independent of
 * everything downstream (WAC, stock moves, outbox) — the destination of the LP
 * is all this file is about.
 */
async function registerAndStopAtWac(): Promise<QueryCall> {
  await expect(
    registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10.000',
    }),
  ).rejects.toThrow('stop-after-lp');

  const insert = calls.find((c) => normalize(c.sql).startsWith('insert into public.license_plates'));
  if (!insert) throw new Error('registerOutput never issued the license_plates insert');
  return insert;
}

describe('registerOutput output destination', () => {
  beforeEach(() => {
    upsertWacMock.mockReset();
    upsertWacMock.mockRejectedValue(new Error('stop-after-lp'));
  });

  it("puts the output LP in the LINE's configured location, not the warehouse's first location", async () => {
    client = makeClient({ id: LINE_WAREHOUSE_ID, default_location_id: LINE_LOCATION_ID });

    // license_plates insert: $2 = warehouse_id, $3 = location_id → params[1], params[2].
    const { params } = await registerAndStopAtWac();
    expect(params[1]).toBe(LINE_WAREHOUSE_ID);
    expect(params[2]).toBe(LINE_LOCATION_ID);
    // The regression this guards: the alphabetically-first location of the
    // resolved warehouse used to win even when the line said otherwise.
    expect(params[2]).not.toBe(FALLBACK_LOCATION_ID);
  });

  it('still registers a WO with no production line, using the warehouse fallback', async () => {
    client = makeClient(null);

    // Anti-regression: an unconfigured line must not block production. Reaching
    // the LP insert at all IS the assertion — nothing refused earlier.
    const { params } = await registerAndStopAtWac();
    expect(params[1]).toBe(FALLBACK_WAREHOUSE_ID);
    expect(params[2]).toBe(FALLBACK_LOCATION_ID);
  });
});
