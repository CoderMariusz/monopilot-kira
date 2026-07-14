import { beforeEach, describe, expect, it, vi } from 'vitest';

// P0-B3: unblockLp delegates the QA-hold release (now e-sign gated) to
// releaseHoldFromWarehouseLpUnblock. Mock that owned action so we can assert the
// REAL unblockLp entry point (a) refuses when the password is missing and (b)
// threads the account password down as signature.password when both are present.
const releaseHoldFromWarehouseLpUnblock = vi.fn();
vi.mock('../../../../../quality/_actions/hold-actions', () => ({
  releaseHoldFromWarehouseLpUnblock: (
    input: { lpId: string; reasonText: string; signature: { password: string } },
  ) => releaseHoldFromWarehouseLpUnblock(input),
}));

import { blockLp, listOpenWorkOrdersForLpReserve, reserveLp, unblockLp } from '../lp-detail-actions';
import type { QueryClient } from '../../../../_actions/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LP_ID = '33333333-3333-4333-8333-333333333333';
const WO_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let grantedPermissions: Set<string>;
let lpStatus: string;
let lpQaStatus: string;
let lpReservedQty: string;
let lpExpiryDate: string | null;
let reserveTooLarge: boolean;
let lpProductId: string;
let bomCompatible: boolean;
let activeHold: boolean;
let activeHoldsViewMissing: boolean;

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('for update')) {
        return {
          rows: [
            {
              id: LP_ID,
              lp_number: 'LP-001',
              status: lpStatus,
              qa_status: lpQaStatus,
              quantity: '10.000000',
              reserved_qty: lpReservedQty,
              reserved_for_wo_id: null,
              product_id: lpProductId,
              uom: 'kg',
              expiry_date: lpExpiryDate,
              site_id: SITE_ID,
              wo_id: null,
              grn_id: null,
              lock_is_active_for_other_user: false,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.v_active_holds')) {
        if (activeHoldsViewMissing) {
          const err = new Error('relation "public.v_active_holds" does not exist') as Error & { code?: string };
          err.code = '42P01';
          throw err;
        }
        return { rows: activeHold ? [{ hold_id: 'hold-existing' }] : [], rowCount: activeHold ? 1 : 0 };
      }

      if (q.startsWith('insert into public.quality_holds')) {
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', hold_number: 'HLD-00000001' }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates') && q.includes("set status = 'blocked'")) {
        return {
          rows: [{ id: LP_ID, lp_number: 'LP-001', status: 'blocked', qa_status: 'on_hold' }],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, wo_number, status from public.work_orders')) {
        return { rows: [{ id: WO_ID, wo_number: 'WO-001', status: 'RELEASED' }], rowCount: 1 };
      }

      if (q.startsWith('select exists (') && q.includes('from public.wo_materials wm')) {
        return { rows: [{ ok: bomCompatible }], rowCount: 1 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('join public.work_orders wo') && q.includes('from public.wo_materials wm')) {
        return bomCompatible
          ? {
              rows: [
                {
                  id: WO_ID,
                  wo_number: 'WO-001',
                  status: 'RELEASED',
                  item_code: 'FG-001',
                  item_name: 'Finished good',
                  planned_quantity: '100',
                  uom: 'kg',
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select ($1::numeric <=')) {
        return { rows: [{ fits: !reserveTooLarge }], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates lp') && q.includes('reserved_qty = reserved_qty +')) {
        return reserveTooLarge
          ? { rows: [], rowCount: 0 }
          : {
              rows: [
                {
                  id: LP_ID,
                  lp_number: 'LP-001',
                  status: 'reserved',
                  reserved_qty: '5.000000',
                  available_qty: '5.000000',
                  reserved_for_wo_id: WO_ID,
                  reserved_for_wo_number: 'WO-001',
                  uom: 'kg',
                },
              ],
              rowCount: 1,
            };
      }

      if (q.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('LP detail reserve/block server actions', () => {
  beforeEach(() => {
    grantedPermissions = new Set(['warehouse.lp.block', 'warehouse.lp.reserve']);
    lpStatus = 'available';
    lpQaStatus = 'released';
    lpReservedQty = '0.000000';
    lpExpiryDate = null;
    reserveTooLarge = false;
    lpProductId = PRODUCT_ID;
    bomCompatible = true;
    activeHold = false;
    activeHoldsViewMissing = false;
    client = makeClient();
    releaseHoldFromWarehouseLpUnblock.mockReset();
  });

  it('unblockLp REFUSES without an e-sign password and never calls the hold release (P0-B3)', async () => {
    const result = await unblockLp(LP_ID, 'inspection passed', '');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'invalid_input' });
    // No release attempted — the caller short-circuits before the e-sign action.
    expect(releaseHoldFromWarehouseLpUnblock).not.toHaveBeenCalled();
  });

  it('unblockLp threads the e-sign password to releaseHoldFromWarehouseLpUnblock and releases the hold (P0-B3)', async () => {
    releaseHoldFromWarehouseLpUnblock.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'hold-1',
        holdNumber: 'HLD-00000001',
        releasedAt: '2026-06-23T00:00:00.000Z',
        signatureHash: 'b'.repeat(64),
      },
    });

    const result = await unblockLp(LP_ID, '  inspection passed  ', 'Account-Password-1!');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({
      lpId: LP_ID,
      status: 'available',
      qaStatus: 'released',
      holdId: 'hold-1',
      holdNumber: 'HLD-00000001',
      releasedAt: '2026-06-23T00:00:00.000Z',
    });
    // The reason is trimmed; the password is passed as signature.password (UNtrimmed).
    expect(releaseHoldFromWarehouseLpUnblock).toHaveBeenCalledWith({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });
  });

  it('unblockLp surfaces a forbidden hold-release (missing quality.hold.release) as forbidden (P0-B3)', async () => {
    releaseHoldFromWarehouseLpUnblock.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });

    const result = await unblockLp(LP_ID, 'inspection passed', 'Account-Password-1!');

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(releaseHoldFromWarehouseLpUnblock).toHaveBeenCalledWith({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'Account-Password-1!' },
    });
  });

  it('blockLp creates a canonical quality hold, blocks the LP, and writes audit/outbox', async () => {
    const result = await blockLp(LP_ID, 'expired product');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({ lpId: LP_ID, status: 'blocked', qaStatus: 'on_hold', holdNumber: 'HLD-00000001' });

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.block');
    expect(calls.some((call) => call.sql.startsWith('insert into public.quality_holds'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('insert into public.quality_hold_items'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes("qa_status = 'on_hold'"))).toBe(true);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[3]).toBe('expired product');
    const outbox = calls.find((call) => call.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[1]).toContain('"source":"warehouse_lp_block"');
  });

  it('blockLp rejects an already-blocked LP before creating a hold', async () => {
    lpStatus = 'blocked';

    const result = await blockLp(LP_ID, 'duplicate hold');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'already_blocked' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('insert into public.quality_holds'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
  });

  it('reserveLp reserves available quantity for an open WO and writes audit history', async () => {
    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({
      lpId: LP_ID,
      status: 'reserved',
      reservedQty: '5.000000',
      reservedForWoId: WO_ID,
      reservedForWoNumber: 'WO-001',
    });

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.reserve');
    const update = calls.find((call) => call.sql.startsWith('update public.license_plates lp') && call.sql.includes('reserved_qty = reserved_qty +'));
    expect(update?.params?.slice(0, 4)).toEqual([LP_ID, '5', WO_ID, USER_ID]);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[3]).toBe('Manual reserve 5 kg for WO-001');
  });

  it('reserveLp rejects qty greater than LP available quantity before updating', async () => {
    reserveTooLarge = true;

    const result = await reserveLp(LP_ID, WO_ID, '11');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'qty_exceeds_available' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('reserveLp BLOCKS a license plate that is past its expiry date (food-safety gate)', async () => {
    lpExpiryDate = '2020-01-01'; // long expired

    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'invalid_state' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    // No reservation write and no active-hold lookup needed once expiry rejects.
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('reserveLp BLOCKS a license plate on an active quality hold (v_active_holds, T-064)', async () => {
    activeHold = true;

    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'invalid_state' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.includes('from public.v_active_holds'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('reserveLp ALLOWS a clean, in-date, hold-free LP (guards do not over-block)', async () => {
    lpExpiryDate = '2999-12-31'; // far future, in date
    activeHold = false;

    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({ lpId: LP_ID, status: 'reserved', reservedForWoId: WO_ID });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    // The active-hold lookup ran and the reservation still went through.
    expect(calls.some((sql) => sql.includes('from public.v_active_holds'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(true);
  });

  it('reserveLp rejects when LP product is not on the WO BOM (nor WO output)', async () => {
    bomCompatible = false;

    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'product_not_in_wo_bom' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('select exists (') && sql.includes('from public.wo_materials wm'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(false);
  });

  it('listOpenWorkOrdersForLpReserve only returns WOs whose BOM (or output) includes the LP product', async () => {
    const compatible = await listOpenWorkOrdersForLpReserve(LP_ID);
    expect(compatible.ok).toBe(true);
    if (!compatible.ok) throw new Error(compatible.reason);
    expect(compatible.data).toHaveLength(1);
    expect(compatible.data[0]?.id).toBe(WO_ID);

    bomCompatible = false;
    client = makeClient();
    const incompatible = await listOpenWorkOrdersForLpReserve(LP_ID);
    expect(incompatible.ok).toBe(true);
    if (!incompatible.ok) throw new Error(incompatible.reason);
    expect(incompatible.data).toEqual([]);
  });

  it('reserveLp FAILS-OPEN when v_active_holds is absent (42P01: 09-quality not shipped)', async () => {
    activeHoldsViewMissing = true;

    const result = await reserveLp(LP_ID, WO_ID, '5');

    // A missing dependency view must not wedge reservation — the LP reserves.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({ lpId: LP_ID, status: 'reserved' });
  });
});
