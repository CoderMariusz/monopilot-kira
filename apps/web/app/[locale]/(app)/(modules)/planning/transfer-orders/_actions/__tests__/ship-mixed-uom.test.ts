/**
 * PF-R10-01 — mixed-UoM transfer ship: kg LP must cover g + kg lines when physically sufficient.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type AssertNoActiveHoldForLp = typeof import('@monopilot/server/quality/holdsGuard.js').assertNoActiveHoldForLp;

const { mockAssertNoActiveHoldForLp } = vi.hoisted(() => ({
  mockAssertNoActiveHoldForLp: vi.fn<AssertNoActiveHoldForLp>(),
}));

vi.mock('@monopilot/server/quality/holdsGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@monopilot/server/quality/holdsGuard.js')>();
  return { ...actual, assertNoActiveHoldForLp: mockAssertNoActiveHoldForLp };
});

let client: ReturnType<typeof makeClient>;
let shipLines: Array<{ id: string; item_id: string; qty: string; uom: string; line_no: number }> = [];

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: ReturnType<typeof makeClient> }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

import { transitionTransferOrderStatus } from '../actions.js';
import type { QueryClient } from '../../../_actions/procurement-shared.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TO_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';
const FROM_WH_ID = '55555555-5555-4555-8555-555555555555';
const TO_WH_ID = '66666666-6666-4666-8666-666666666666';
const SOURCE_LP_ID = '77777777-7777-4777-8777-777777777777';
const LOCATION_ID = '88888888-8888-4888-8888-888888888888';

let lpOnHandKg = '20.000000';
let inTransitKg = '0.000000';
let inTransitG = '0.000000';
let shipWritesApplied = false;

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, _params: readonly unknown[] = []) => {
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };

      if (
        n.startsWith('select id, to_number') ||
        n.includes('from public.transfer_orders') && n.includes('for update')
      ) {
        return {
          rows: [{ id: TO_ID, to_number: 'TO-MIX-001', status: 'draft', from_warehouse_id: FROM_WH_ID, to_warehouse_id: TO_WH_ID }],
          rowCount: 1,
        };
      }

      if (n.includes('from public.transfer_order_lines') && n.includes('for update')) {
        return { rows: shipLines, rowCount: shipLines.length };
      }

      if (n.includes('select distinct item_id') && n.includes('from public.transfer_order_lines')) {
        const pairs = shipLines.map((line) => ({ item_id: line.item_id, uom: line.uom }));
        return { rows: pairs, rowCount: pairs.length };
      }

      if (n.includes('from public.items i') && n.includes('uom_base')) {
        return {
          rows: [{ id: ITEM_ID, uom_base: 'kg', net_qty_per_each: null, each_per_box: null }],
          rowCount: 1,
        };
      }

      if (n.includes('from public.license_plates lp') && n.includes('group by lp.product_id, lp.uom')) {
        return {
          rows: [{ item_id: ITEM_ID, uom: 'kg', total: lpOnHandKg }],
          rowCount: 1,
        };
      }

      if (
        n.includes('from public.transfer_order_line_lps tll') &&
        n.includes('group by tol.item_id, tol.uom')
      ) {
        const rows: Array<{ item_id: string; uom: string; total: string }> = [];
        if (inTransitKg !== '0.000000') rows.push({ item_id: ITEM_ID, uom: 'kg', total: inTransitKg });
        if (inTransitG !== '0.000000') rows.push({ item_id: ITEM_ID, uom: 'g', total: inTransitG });
        return { rows, rowCount: rows.length };
      }

      if (n.includes('from public.license_plates') && n.includes('reserved_qty::text as reserved_qty')) {
        return {
          rows: [
            {
              id: SOURCE_LP_ID,
              lp_number: 'LP-SRC-001',
              quantity: lpOnHandKg,
              reserved_qty: '0.000000',
              location_id: LOCATION_ID,
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }

      if (n.startsWith('update public.transfer_orders') && n.includes('set status =')) {
        return {
          rows: [{ id: TO_ID, to_number: 'TO-MIX-001', status: 'in_transit', from_warehouse_id: FROM_WH_ID, to_warehouse_id: TO_WH_ID, scheduled_date: null, notes: null, created_at: new Date(), updated_at: new Date() }],
          rowCount: 1,
        };
      }

      if (n.startsWith('insert into public.transfer_order_line_lps')) {
        shipWritesApplied = true;
        lpOnHandKg = '10.000000';
        inTransitKg = '6.125000';
        inTransitG = '3875.000000';
        return { rows: [], rowCount: 1 };
      }

      if (
        n.startsWith('update public.license_plates') ||
        n.startsWith('insert into public.stock_moves') ||
        n.startsWith('insert into public.lp_state_history')
      ) {
        if (n.startsWith('update public.license_plates') && shipWritesApplied) {
          lpOnHandKg = '10.000000';
        }
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.audit_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
}

describe('shipTransferOrder — mixed UoM (PF-R10-01)', () => {
  beforeEach(() => {
    mockAssertNoActiveHoldForLp.mockReset();
    mockAssertNoActiveHoldForLp.mockResolvedValue(undefined);
    client = makeClient();
    lpOnHandKg = '20.000000';
    inTransitKg = '0.000000';
    inTransitG = '0.000000';
    shipWritesApplied = false;
    shipLines = [
      { id: 'line-1', item_id: ITEM_ID, qty: '6.125000', uom: 'kg', line_no: 1 },
      { id: 'line-2', item_id: ITEM_ID, qty: '3875.000000', uom: 'g', line_no: 2 },
    ];
  });

  it('ships 6.125 kg + 3875 g when a single 20 kg LP covers the physical total', async () => {
    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');
    expect(result.ok).toBe(true);
  });

  it('still rejects when only 9.999999 kg exists for a 10 kg physical order', async () => {
    lpOnHandKg = '9.999999';
    shipLines = [
      { id: 'line-1', item_id: ITEM_ID, qty: '6.125000', uom: 'kg', line_no: 1 },
      { id: 'line-2', item_id: ITEM_ID, qty: '3.875000', uom: 'kg', line_no: 2 },
    ];

    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('insufficient_stock');
  });
});
