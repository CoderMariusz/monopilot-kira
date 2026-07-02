/**
 * E7-R3 — TO-ship: skipped held LPs surfaced in response.
 *
 * Tests that the shipTransferOrder path (called via transitionTransferOrderStatus
 * draft→in_transit):
 * 1. When a shortfall exists AND held LPs were skipped, returns
 *    `insufficient_stock_holds` (not `insufficient_stock`) with a `heldQty` field.
 * 2. When no holds are involved and no stock, returns plain `insufficient_stock`.
 * 3. Held LPs are skipped (not shipped) and the hold check is called per LP.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports.
// vi.hoisted() runs synchronously before the vi.mock factory is evaluated.
// ---------------------------------------------------------------------------

const { mockAssertNoActiveHoldForLp } = vi.hoisted(() => {
  return {
    mockAssertNoActiveHoldForLp: vi.fn<[string, unknown], Promise<void>>(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@monopilot/server/quality/holdsGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@monopilot/server/quality/holdsGuard.js')>();
  return {
    ...actual,
    assertNoActiveHoldForLp: mockAssertNoActiveHoldForLp,
  };
});

let client: ReturnType<typeof makeClient>;

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: ReturnType<typeof makeClient> }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

import { transitionTransferOrderStatus } from '../actions.js';
import type { QueryClient } from '../../../_actions/procurement-shared.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TO_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';
const FROM_WH_ID = '55555555-5555-4555-8555-555555555555';
const TO_WH_ID = '66666666-6666-4666-8666-666666666666';
const HELD_LP_ID = 'aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HELD_LP_NUM = 'LP-HELD-001';
const FREE_LP_ID = 'bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FREE_LP_NUM = 'LP-FREE-001';
const LOCATION_ID = 'cccc0000-cccc-4ccc-8ccc-cccccccccccc';

let lpCandidates: Array<{ id: string; lp_number: string; quantity: string; reserved_qty: string }> = [];

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, _params: readonly unknown[] = []) => {
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // Permission check
      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };

      // Header fetch (FOR UPDATE lock used in the action; also status-only select)
      if (
        n.startsWith('select id, to_number') ||
        n.startsWith('select transfer_orders.id') ||
        n.startsWith('select status from public.transfer_orders') ||
        (n.includes('from public.transfer_orders') && n.includes('for update'))
      ) {
        return {
          rows: [{ id: TO_ID, to_number: 'TO-SHIP-001', status: 'draft', from_warehouse_id: FROM_WH_ID, to_warehouse_id: TO_WH_ID }],
          rowCount: 1,
        };
      }

      // Lines with FOR UPDATE lock
      if (n.includes('from public.transfer_order_lines') && n.includes('for update')) {
        return { rows: [{ id: 'line-1', item_id: ITEM_ID, qty: '10.000', uom: 'kg', line_no: 1 }], rowCount: 1 };
      }

      // FEFO LP candidates (ship path)
      if (n.includes('from public.license_plates') && n.includes('reserved_qty::text as reserved_qty')) {
        return {
          rows: lpCandidates.map((lp) => ({ ...lp, location_id: LOCATION_ID })),
          rowCount: lpCandidates.length,
        };
      }

      // Status UPDATE returning the updated header row
      if (n.startsWith('update public.transfer_orders') && n.includes('set status =')) {
        return {
          rows: [{ id: TO_ID, to_number: 'TO-SHIP-001', status: 'in_transit', from_warehouse_id: FROM_WH_ID, to_warehouse_id: TO_WH_ID, scheduled_date: null, notes: null, created_at: new Date(), updated_at: new Date() }],
          rowCount: 1,
        };
      }

      // Audit event insert
      if (n.startsWith('insert into public.audit_events')) return { rows: [], rowCount: 1 };

      // Everything else (LP updates, stock_moves, junction inserts, lp_state_history, etc.)
      return { rows: [], rowCount: 1 };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shipTransferOrder (via transitionTransferOrderStatus) — held LP surfacing', () => {
  beforeEach(() => {
    mockAssertNoActiveHoldForLp.mockReset();
    client = makeClient();
    lpCandidates = [];
  });

  it('returns insufficient_stock_holds (not insufficient_stock) when held LPs cause the shortfall', async () => {
    // Only one LP, held. Line needs 10 kg — shortfall caused entirely by the hold.
    lpCandidates = [
      { id: HELD_LP_ID, lp_number: HELD_LP_NUM, quantity: '10.000000', reserved_qty: '0.000000' },
    ];

    const { QaHoldActiveError } = await import('@monopilot/server/quality/holdsGuard.js');
    mockAssertNoActiveHoldForLp.mockImplementation(async (lpId: string) => {
      if (lpId === HELD_LP_ID) throw new QaHoldActiveError('HLD-001', 'high', null);
    });

    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('insufficient_stock_holds');
    // heldQty must be present (the qty tied up behind holds).
    expect('heldQty' in result).toBe(true);
    expect((result as { heldQty?: string }).heldQty).toBeDefined();
  });

  it('returns plain insufficient_stock when no holds are involved (no stock at all)', async () => {
    // No LPs at the source warehouse.
    lpCandidates = [];

    mockAssertNoActiveHoldForLp.mockResolvedValue(undefined);

    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('insufficient_stock');
    // No heldQty when no holds were involved.
    expect((result as { heldQty?: string }).heldQty).toBeUndefined();
  });

  it('succeeds when held LP is skipped but free LP covers the full line qty', async () => {
    // First LP is held (6 kg), second is free (10 kg) — line needs 10 kg.
    lpCandidates = [
      { id: HELD_LP_ID, lp_number: HELD_LP_NUM, quantity: '6.000000', reserved_qty: '0.000000' },
      { id: FREE_LP_ID, lp_number: FREE_LP_NUM, quantity: '10.000000', reserved_qty: '0.000000' },
    ];

    const { QaHoldActiveError } = await import('@monopilot/server/quality/holdsGuard.js');
    mockAssertNoActiveHoldForLp.mockImplementation(async (lpId: string) => {
      if (lpId === HELD_LP_ID) throw new QaHoldActiveError('HLD-001', 'high', null);
      // FREE_LP_ID passes (no error)
    });

    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');

    // Held LP is skipped; free LP covers the line → success.
    expect(result.ok).toBe(true);
    // The hold guard must have been called for BOTH LPs.
    expect(mockAssertNoActiveHoldForLp).toHaveBeenCalledWith(HELD_LP_ID, expect.anything());
    expect(mockAssertNoActiveHoldForLp).toHaveBeenCalledWith(FREE_LP_ID, expect.anything());
  });
});
