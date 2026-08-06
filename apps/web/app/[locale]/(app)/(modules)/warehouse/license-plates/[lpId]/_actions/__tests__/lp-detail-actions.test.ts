import { randomUUID } from 'node:crypto';
import type pgTypes from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOwnerConnection } from '../../../../../../../../../../../packages/db/src/clients.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../../../../../../../tests/helpers/owner-org-context.js';

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
let lpQuantity: string;
let lpReservedQty: string;
let lpExpiryDate: string | null;
let reserveTooLarge: boolean;
let lpProductId: string;
let bomCompatible: boolean;
let activeHold: boolean;
let activeHoldsViewMissing: boolean;

// Mutable so the real-database suite at the bottom of this file can point the
// same seam at a live pg connection + its fixture org/user.
const PG_SESSION = randomUUID();
let ctxOrgId = ORG_ID;
let ctxUserId = USER_ID;

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: ctxUserId, orgId: ctxOrgId, client }),
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
              quantity: lpQuantity,
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
        const fits = !reserveTooLarge && Number(params?.[0]) <= Number(params?.[1]) - Number(params?.[2]);
        return { rows: [{ fits }], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates lp') && q.includes('reserved_qty = reserved_qty +')) {
        const qty = Number(params?.[1]);
        const nextReservedQty = Number(lpReservedQty) + qty;
        const fits = !reserveTooLarge && nextReservedQty <= Number(lpQuantity);
        return !fits
          ? { rows: [], rowCount: 0 }
          : {
              rows: [
                {
                  id: LP_ID,
                  lp_number: 'LP-001',
                  status: 'reserved',
                  reserved_qty: nextReservedQty.toFixed(6),
                  available_qty: (Number(lpQuantity) - nextReservedQty).toFixed(6),
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
    lpQuantity = '10.000000';
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

  it('WH-119 unblockLp refuses without an e-sign password and never calls the hold release', async () => {
    const result = await unblockLp(LP_ID, 'inspection passed', '');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'invalid_input' });
    // No release attempted — the caller short-circuits before the e-sign action.
    expect(releaseHoldFromWarehouseLpUnblock).not.toHaveBeenCalled();
  });

  it('WH-119 unblockLp threads the e-sign password to the hold release and succeeds', async () => {
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

  it('keeps the LP blocked while hold release awaits its second signature', async () => {
    releaseHoldFromWarehouseLpUnblock.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'hold-1',
        holdNumber: 'HLD-00000001',
        status: 'pending_second_signature',
        disposition: 'release',
        pendingSignoff: {
          state: 'pending_second_signature',
          subjectHash: 'a'.repeat(64),
          firstSignatureId: 'signature-1',
          firstSignedAt: '2026-06-23T00:00:00.000Z',
          firstSigner: { id: 'user-1', displayName: 'Quality Lead' },
          awaitingRole: { id: 'role-2', displayName: 'Production Manager' },
        },
      },
    });

    const result = await unblockLp(LP_ID, 'inspection passed', 'Account-Password-1!');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({
      lpId: LP_ID,
      status: 'blocked',
      qaStatus: 'on_hold',
      holdId: 'hold-1',
      pendingSignoff: {
        firstSigner: { displayName: 'Quality Lead' },
        awaitingRole: { displayName: 'Production Manager' },
      },
    });
  });

  it('WH-119 unblockLp rejects an explicitly wrong e-sign password', async () => {
    releaseHoldFromWarehouseLpUnblock.mockResolvedValueOnce({
      ok: false,
      reason: 'error',
      message: 'invalid_signature',
    });

    const result = await unblockLp(LP_ID, 'inspection passed', 'Wrong-Password!');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'invalid_signature' });
    expect(releaseHoldFromWarehouseLpUnblock).toHaveBeenCalledWith({
      lpId: LP_ID,
      reasonText: 'inspection passed',
      signature: { password: 'Wrong-Password!' },
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

  it('WH-119 blockLp creates a high/open hold and sets blocked/on_hold', async () => {
    const result = await blockLp(LP_ID, 'expired product');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({ lpId: LP_ID, status: 'blocked', qaStatus: 'on_hold', holdNumber: 'HLD-00000001' });

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.block');
    const holdInsert = calls.find((call) => call.sql.startsWith('insert into public.quality_holds'));
    expect(holdInsert?.sql).toContain("'high', 'open'");
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

  it('WH-051 rejects WO +1 after an SO has reserved the full LP quantity', async () => {
    lpQuantity = '100.000000';
    lpReservedQty = '100.000000';

    const result = await reserveLp(LP_ID, WO_ID, '1');

    expect(result).toEqual({ ok: false, reason: 'error', message: 'qty_exceeds_available' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates lp') && sql.includes('reserved_qty = reserved_qty +'))).toBe(false);
  });

  it('WH-051 allows a WO reservation that exactly fits the quantity left after SO reservation', async () => {
    lpQuantity = '100.000000';
    lpReservedQty = '99.000000';

    const result = await reserveLp(LP_ID, WO_ID, '1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({ reservedQty: '100.000000', availableQty: '0.000000' });
    const update = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.license_plates lp'));
    expect(normalize(String(update?.[0]))).toContain('(lp.quantity - lp.reserved_qty) >= $2::numeric');
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

  // CONTRACT CHANGED 2026-08-06 (was: "reserveLp FAILS-OPEN when v_active_holds
  // is absent"). v_active_holds shipped in migration 197, so a 42P01 here is no
  // longer "09-quality isn't built yet" — it is the hold read model being gone,
  // and reserving material whose hold status is unknown routes held stock to a
  // work order. A gate that cannot establish state refuses.
  it('reserveLp REFUSES when the v_active_holds read fails (42P01) — and says why', async () => {
    activeHoldsViewMissing = true;

    const result = await reserveLp(LP_ID, WO_ID, '5');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    // Not `invalid_state`: the LP's state is fine, the CHECK is what failed.
    expect(result.message).toBe('hold_check_failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reserveLp quality-hold gate against a REAL database.
//
// The fake client above can only prove what it is told to throw. These three
// drive the actual SQL: a real hold blocks, a clean LP reserves, and a
// v_active_holds that cannot be read REFUSES instead of answering "no hold".
// The `withOrgContext` mock at the top of this file hands out the module-level
// `client`, so pointing that at a real pg connection is all it takes.
// ─────────────────────────────────────────────────────────────────────────────
const runPg = process.env.DATABASE_URL ? describe : describe.skip;

runPg('reserveLp active-hold gate — real database', () => {
  let ownerPool: pgTypes.Pool;
  let pgClient: pgTypes.PoolClient;
  let fixture: PgTestFixture;
  const seeded = {
    product: randomUUID(),
    wo: randomUUID(),
    lpClean: randomUUID(),
    lpHeld: randomUUID(),
    hold: randomUUID(),
  };

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    fixture = await createPgTestFixture(ownerPool, { permissions: ['warehouse.lp.reserve'] });
    pgClient = await ownerPool.connect();
    await pgClient.query('begin');
    await pgClient.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [PG_SESSION, fixture.orgId, fixture.userId],
    );
    await pgClient.query(`select app.set_org_context($1::uuid, $2::uuid)`, [PG_SESSION, fixture.orgId]);
    await pgClient.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
       values ($1::uuid, $2::uuid, $3, 'rm', 'Reserve Gate RM', 'kg')`,
      [seeded.product, fixture.orgId, `RSV-${seeded.product.slice(0, 8)}`],
    );
    await pgClient.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, planned_quantity, uom, status, item_type_at_creation)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, 10, 'kg', 'RELEASED', 'rm')`,
      [seeded.wo, fixture.orgId, fixture.siteId, `WO-RSV-${seeded.wo.slice(0, 6)}`, seeded.product],
    );
    await pgClient.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status, created_by, updated_by)
       values ($1::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8::uuid, 10, 0, 'kg', 'available', 'released', $9::uuid, $9::uuid),
              ($2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $10, $8::uuid, 10, 0, 'kg', 'available', 'released', $9::uuid, $9::uuid)`,
      [
        seeded.lpClean,
        seeded.lpHeld,
        fixture.orgId,
        fixture.siteId,
        fixture.warehouseId,
        fixture.locationId,
        `LP-RSV-CLEAN-${seeded.lpClean.slice(0, 6)}`,
        seeded.product,
        fixture.userId,
        `LP-RSV-HELD-${seeded.lpHeld.slice(0, 6)}`,
      ],
    );
    // qa_status deliberately stays 'released' — an LP whose hold also flipped
    // qa_status would be stopped by the earlier gate and prove nothing here.
    await pgClient.query(
      `insert into public.quality_holds (id, org_id, reference_type, reference_id, priority, hold_status, created_by)
       values ($1::uuid, $2::uuid, 'lp', $3::uuid, 'critical', 'open', $4::uuid)`,
      [seeded.hold, fixture.orgId, seeded.lpHeld, fixture.userId],
    );
    // Point the mocked withOrgContext at the real connection.
    client = pgClient as unknown as QueryClient;
    ctxOrgId = fixture.orgId;
    ctxUserId = fixture.userId;
  });

  afterAll(async () => {
    await pgClient?.query('rollback').catch(() => undefined);
    await ownerPool
      ?.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [PG_SESSION])
      .catch(() => undefined);
    pgClient?.release();
    await fixture?.cleanup().catch(() => undefined);
    await ownerPool?.end();
  });

  async function reservedQty(lpId: string): Promise<string> {
    const { rows } = await pgClient.query<{ reserved_qty: string }>(
      `select reserved_qty::text from public.license_plates where id = $1::uuid`,
      [lpId],
    );
    return rows[0]!.reserved_qty;
  }

  it('BLOCKS a reservation on an LP under a real active quality hold', async () => {
    const result = await reserveLp(seeded.lpHeld, seeded.wo, '5');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.message).toBe('invalid_state');
    expect(Number(await reservedQty(seeded.lpHeld))).toBe(0);
  });

  it('ALLOWS a reservation on a clean LP when the view is healthy', async () => {
    const result = await reserveLp(seeded.lpClean, seeded.wo, '5');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(Number(await reservedQty(seeded.lpClean))).toBe(5);
  });

  it('REFUSES with hold_check_failed when v_active_holds cannot be read', async () => {
    await pgClient.query('savepoint before_break');
    await pgClient.query('alter view public.v_active_holds rename to v_active_holds__reserve_probe');
    try {
      const before = await reservedQty(seeded.lpClean);
      const result = await reserveLp(seeded.lpClean, seeded.wo, '1');

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected refusal');
      // Truthful cause: the CHECK failed, not "this pallet cannot be reserved".
      expect(result.message).toBe('hold_check_failed');
      await pgClient.query('rollback to savepoint before_break');
      expect(await reservedQty(seeded.lpClean)).toBe(before);
    } finally {
      await pgClient.query('rollback to savepoint before_break').catch(() => undefined);
    }
    const { rows } = await pgClient.query<{ ok: boolean }>(
      `select to_regclass('public.v_active_holds') is not null as ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });
});
