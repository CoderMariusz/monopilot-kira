import { beforeEach, describe, expect, it, vi } from 'vitest';

import { destroyLp, listSiblingLpsForMerge, mergeLps, splitLp } from '../lp-split-merge-destroy-actions';
import type { QueryClient } from '../../../../_actions/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRIMARY_LP_ID = '33333333-3333-4333-8333-333333333333';
const SECONDARY_LP_ID = '44444444-4444-4444-8444-444444444444';
const CHILD_LP_ID = '55555555-5555-4555-8555-555555555555';
const SITE_ID = '66666666-6666-4666-8666-666666666666';
const WAREHOUSE_ID = '77777777-7777-4777-8777-777777777777';
const LOCATION_ID = '88888888-8888-4888-8888-888888888888';
const PRODUCT_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// R08-02 — the split destination is deliberately NOT the source location, so every assertion
// below can tell "went where it was told" apart from "inherited the source".
const DEST_LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEST_WAREHOUSE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SITE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SPLIT_CLIENT_OP_ID = 'split-op-001';
const DESTROY_CLIENT_OP_ID = 'destroy-op-001';

let client: QueryClient;
let grantedPermissions: Set<string>;
let heldLpIds: Set<string>;
/**
 * Committed split children, keyed by the seed the action derives from the PAYLOAD (clientOpId +
 * qty + destination). A single boolean would model "any split already ran" and would hide the
 * bug this keying exists to prevent: a retry that changed the destination must NOT replay.
 */
let committedSplitSeeds: Map<string, string>;
let splitFits: boolean;
let primaryReservedQty: string;
let primaryQuantity: string;
let secondaryReservedQty: string;
let primaryStatus: string;
let primaryQaStatus: string;
let secondaryQaStatus: string;
let secondaryProductId: string;
let secondarySiteId: string | null;
let secondaryWarehouseId: string;
let secondaryLocationId: string | null;
let primarySiteId: string | null;
/** The site withSiteContext binds for the call — `null` = ALL-sites (super_admin). */
let activeSiteId: string | null;
/** The one location the destination lookup can resolve, or null for "no such location". */
let destinationLocation: { id: string; warehouse_id: string; site_id: string | null; is_active: boolean } | null;
let siblingListRows: Array<{
  primary_id: string;
  id: string | null;
  lp_number: string | null;
  quantity: string | null;
  uom: string | null;
}>;

// The actions moved from withOrgContext to withSiteContext (FALA 7 handover: they never compared
// the LP's site with the active one). The fake binds `siteId` the way the real wrapper does and
// re-exports a stand-in NoActiveSiteError so the `instanceof` branch in mapFailure stays live.
// vi.hoisted, not a plain class: vi.mock factories run before the module body, so a bare class
// declaration would still be in its TDZ when the factory reads it.
const { FakeNoActiveSiteError } = vi.hoisted(() => ({
  FakeNoActiveSiteError: class extends Error {
    readonly reason = 'no_active_site' as const;
  },
}));

vi.mock('../../../../../../../../../lib/auth/with-site-context', () => ({
  NoActiveSiteError: FakeNoActiveSiteError,
  withSiteContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = (typeof arg1 === 'function' ? arg1 : arg2) as (ctx: {
      userId: string;
      orgId: string;
      client: QueryClient;
      siteId: string | null;
    }) => Promise<unknown>;
    return action({ userId: USER_ID, orgId: ORG_ID, client, siteId: activeSiteId });
  }),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function baseLp(overrides: Partial<Record<string, string | null>> = {}) {
  return {
    id: PRIMARY_LP_ID,
    lp_number: 'LP-001',
    site_id: primarySiteId,
    warehouse_id: WAREHOUSE_ID,
    location_id: LOCATION_ID,
    product_id: PRODUCT_ID,
    quantity: primaryQuantity,
    reserved_qty: primaryReservedQty,
    uom: 'kg',
    status: primaryStatus,
    origin: 'manual',
    parent_lp_id: null,
    batch_number: 'BATCH-1',
    expiry_date: '2027-01-31 00:00:00+00',
    qa_status: primaryQaStatus,
    grn_id: null,
    wo_id: null,
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const q = normalize(sql);

      if (q.startsWith('select pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (q.startsWith('with deterministic_child as') && q.includes('replay_child as')) {
        // $1 is the child seed; the real query ORs three predicates all derived from it.
        const replayId = committedSplitSeeds.get(String(params?.[0] ?? ''));
        return { rows: replayId ? [{ id: replayId }] : [], rowCount: replayId ? 1 : 0 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('lp.id = $1::uuid') && q.includes('for update')) {
        return { rows: [baseLp()], rowCount: 1 };
      }

      // R08-02 destination lookup. Modelled with the real predicate so a query that dropped the
      // site filter or the is_active column fails here rather than passing on a looser fake.
      if (q.includes('from public.locations loc') && q.includes('join public.warehouses w')) {
        expect(q).toContain('coalesce(loc.is_active, true)');
        const requestedId = String(params?.[0] ?? '');
        const boundSite = (params?.[1] as string | null) ?? null;
        const found = destinationLocation?.id === requestedId ? destinationLocation : null;
        // ($2::uuid is null or w.site_id is null or w.site_id = $2::uuid)
        const visible = found !== null && (boundSite === null || found.site_id === null || found.site_id === boundSite);
        return { rows: visible ? [found] : [], rowCount: visible ? 1 : 0 };
      }

      if (q.startsWith('select ($1::numeric < (quantity - reserved_qty))')) {
        return {
          rows: [{ fits: splitFits, remaining_qty: splitFits ? '6.000000' : '10.000000' }],
          rowCount: 1,
        };
      }

      if (q.includes('from public.license_plates primary_lp') && q.includes('left join public.license_plates sibling')) {
        return { rows: siblingListRows, rowCount: siblingListRows.length };
      }

      if (q.includes('from public.v_active_holds')) {
        const ids = (params?.[0] as string[] | undefined) ?? [];
        const rows = (Array.isArray(ids) ? ids : []).filter((id) => heldLpIds.has(id)).map((id) => ({ id }));
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('with deterministic_child as') && q.includes('insert into public.license_plates')) {
        // $12 is the child seed. Each distinct payload mints its own child id, so a replay lookup
        // for a DIFFERENT payload finds nothing — exactly as the deterministic-uuid insert behaves.
        const seed = String(params?.[11] ?? '');
        const childId = committedSplitSeeds.size === 0 ? CHILD_LP_ID : `${CHILD_LP_ID.slice(0, -1)}${committedSplitSeeds.size}`;
        committedSplitSeeds.set(seed, childId);
        return { rows: [{ id: childId }], rowCount: 1 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('lp.id = any($1::uuid[])') && q.includes('for update')) {
        return {
          rows: [
            baseLp({ id: PRIMARY_LP_ID, lp_number: 'LP-001', quantity: '10.000000', reserved_qty: primaryReservedQty, qa_status: primaryQaStatus }),
            baseLp({
              id: SECONDARY_LP_ID,
              lp_number: 'LP-002',
              quantity: '4.000000',
              reserved_qty: secondaryReservedQty,
              qa_status: secondaryQaStatus,
              product_id: secondaryProductId,
              site_id: secondarySiteId,
              warehouse_id: secondaryWarehouseId,
              location_id: secondaryLocationId,
            }),
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('update public.license_plates')) return { rows: [], rowCount: 1 };
      if (q.startsWith('insert into public.lp_genealogy')) return { rows: [], rowCount: 1 };
      if (q.startsWith('insert into public.lp_state_history')) return { rows: [], rowCount: 1 };
      if (q.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (q.includes('from public.items i') && q.includes('as qty_kg')) {
        return { rows: [{ qty_kg: String(params?.[0] ?? '0'), resolved: true }], rowCount: 1 };
      }
      if (q.includes('with existing as materialized') && q.includes('avg_cost_used')) {
        const qty = Number(params?.[2] ?? 0);
        return { rows: [{ avg_cost_used: '10', value_debited: String(qty * 10) }], rowCount: 1 };
      }
      if (q.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

// File-scope on purpose: the cross-site describe below needs the same fixtures, and a hook
// nested in the first describe would not run for it.
beforeEach(() => {
  grantedPermissions = new Set(['warehouse.lp.split', 'warehouse.lp.merge', 'warehouse.lp.destroy']);
  heldLpIds = new Set();
  committedSplitSeeds = new Map();
  splitFits = true;
  primaryReservedQty = '0.000000';
  primaryQuantity = '10.000000';
  secondaryReservedQty = '0.000000';
  primaryStatus = 'available';
  primaryQaStatus = 'released';
  secondaryQaStatus = 'released';
  secondaryProductId = PRODUCT_ID;
  secondarySiteId = SITE_ID;
  secondaryWarehouseId = WAREHOUSE_ID;
  secondaryLocationId = LOCATION_ID;
  primarySiteId = SITE_ID;
  activeSiteId = SITE_ID;
  destinationLocation = { id: DEST_LOCATION_ID, warehouse_id: DEST_WAREHOUSE_ID, site_id: SITE_ID, is_active: true };
  siblingListRows = [
    {
      primary_id: PRIMARY_LP_ID,
      id: SECONDARY_LP_ID,
      lp_number: 'LP-002',
      quantity: '4.000000',
      uom: 'kg',
    },
  ];
  client = makeClient();
});

describe('LP split/merge/destroy server actions', () => {

  it('splitLp reduces the source, creates a child LP, genealogy, history, and stock moves', async () => {
    const result = await splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: true });
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.startsWith('select pg_advisory_xact_lock'))?.params?.[0]).toBe(`${ORG_ID}:lp-split:${SPLIT_CLIENT_OP_ID}`);
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.split');
    expect(calls.some((call) => call.sql.startsWith('with deterministic_child as') && call.sql.includes('insert into public.license_plates'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes('quantity = quantity -'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('insert into public.lp_genealogy') && call.params?.[0] === CHILD_LP_ID)).toBe(true);
    const moves = calls.filter((call) => call.sql.startsWith('insert into public.stock_moves'));
    expect(moves).toHaveLength(2);
    expect(moves.map((call) => call.params?.[3])).toEqual(['adjustment', 'split']);
    expect(moves.map((call) => call.params?.[6])).toEqual(['-4', '4']);
  });

  // ── R08-02 · the child pallet goes where it was told ─────────────────────────────────────────
  it('splitLp puts the child at the CHOSEN destination — site, warehouse and location — not the source bin', async () => {
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split to staging', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID)).resolves.toEqual({ ok: true });

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    const childInsert = calls.find((call) => call.sql.startsWith('with deterministic_child as') && call.sql.includes('insert into public.license_plates'));
    // $1 site, $2 warehouse, $3 location — all three from the destination. The source sits in
    // LOCATION_ID/WAREHOUSE_ID, so inheriting would be visible here.
    expect(childInsert?.params?.[0]).toBe(SITE_ID);
    expect(childInsert?.params?.[1]).toBe(DEST_WAREHOUSE_ID);
    expect(childInsert?.params?.[2]).toBe(DEST_LOCATION_ID);
    expect(childInsert?.params?.[2]).not.toBe(LOCATION_ID);

    const moves = calls.filter((call) => call.sql.startsWith('insert into public.stock_moves'));
    // The source's negative adjustment leaves the SOURCE bin (from_location_id = $5)…
    expect(moves[0]?.params?.[4]).toBe(LOCATION_ID);
    // …and the child's positive split move lands in the DESTINATION (to_location_id = $6).
    expect(moves[1]?.params?.[5]).toBe(DEST_LOCATION_ID);
  });

  it('splitLp refuses a split with no destination, before it touches anything', async () => {
    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, '   ');

    expect(result).toEqual({ ok: false, error: 'destination_required' });
    expect(vi.mocked(client.query)).not.toHaveBeenCalled();
  });

  it('splitLp refuses an INACTIVE destination — a fresh pallet the scanner would then refuse to move', async () => {
    destinationLocation = { id: DEST_LOCATION_ID, warehouse_id: DEST_WAREHOUSE_ID, site_id: SITE_ID, is_active: false };

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'destination_inactive' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('splitLp refuses an unknown destination', async () => {
    destinationLocation = null;

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'destination_not_found' });
  });

  it('splitLp refuses a destination in ANOTHER site — the site filter is in the query, so it never resolves', async () => {
    destinationLocation = { id: DEST_LOCATION_ID, warehouse_id: DEST_WAREHOUSE_ID, site_id: OTHER_SITE_ID, is_active: true };

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'destination_not_found' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
  });

  it('splitLp refuses a cross-site destination even when the site filter cannot see it (ALL-sites bind)', async () => {
    // super_admin / ALL-sites: the query stops filtering, so the explicit source-vs-destination
    // comparison is the only thing left standing between two sites.
    activeSiteId = null;
    destinationLocation = { id: DEST_LOCATION_ID, warehouse_id: DEST_WAREHOUSE_ID, site_id: OTHER_SITE_ID, is_active: true };

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'cross_site_destination' });
  });

  it('splitLp refuses a destination whose warehouse has no site at all', async () => {
    destinationLocation = { id: DEST_LOCATION_ID, warehouse_id: DEST_WAREHOUSE_ID, site_id: null, is_active: true };

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'destination_site_required' });
  });

  it('splitLp does NOT replay a retry that changed the destination — the key covers the payload', async () => {
    // The modal keeps one clientOpId per open while the destination Select stays editable. If the
    // key ignored the payload, this second call would hit the replay short-circuit and answer
    // ok:true while the pallet sat in the FIRST destination — the modal reporting a location that
    // was never written.
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID)).resolves.toEqual({ ok: true });

    const otherDestination = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    destinationLocation = { id: otherDestination, warehouse_id: DEST_WAREHOUSE_ID, site_id: SITE_ID, is_active: true };
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split', SPLIT_CLIENT_OP_ID, otherDestination)).resolves.toEqual({ ok: true });

    const childInserts = vi
      .mocked(client.query)
      .mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }))
      .filter((call) => call.sql.startsWith('with deterministic_child as') && call.sql.includes('insert into public.license_plates'));
    // Two distinct operations, each landing in the location it was actually given.
    expect(childInserts).toHaveLength(2);
    expect(childInserts.map((call) => call.params?.[2])).toEqual([DEST_LOCATION_ID, otherDestination]);
  });

  it('splitLp accepts the SOURCE location as a destination — two pallets in one bin is legitimate', async () => {
    destinationLocation = { id: LOCATION_ID, warehouse_id: WAREHOUSE_ID, site_id: SITE_ID, is_active: true };

    const result = await splitLp(PRIMARY_LP_ID, 4, 'relabel in place', SPLIT_CLIENT_OP_ID, LOCATION_ID);

    // The bug was the silent DEFAULT, not the value: choosing the source bin on purpose is fine.
    expect(result).toEqual({ ok: true });
  });

  it('splitLp replays the same clientOpId without double-decrementing or minting another child LP', async () => {
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID)).resolves.toEqual({ ok: true });
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID)).resolves.toEqual({ ok: true });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.filter((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toHaveLength(1);
    expect(calls.filter((sql) => sql.startsWith('update public.license_plates') && sql.includes('quantity = quantity -'))).toHaveLength(1);
  });

  it('splitLp rejects split quantity greater than available quantity before writes', async () => {
    splitFits = false;

    const result = await splitLp(PRIMARY_LP_ID, 11, 'too much', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'split quantity must be less than available quantity' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('listSiblingLpsForMerge returns only compatible siblings for the primary', async () => {
    const result = await listSiblingLpsForMerge(PRIMARY_LP_ID);

    expect(result).toEqual({
      ok: true,
      siblings: [{ id: SECONDARY_LP_ID, lpNumber: 'LP-002', quantity: '4.000000', uom: 'kg' }],
    });
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.merge');
    expect(calls.some((call) => call.sql.includes('left join public.license_plates sibling'))).toBe(true);
  });

  it('listSiblingLpsForMerge returns empty siblings when primary exists but no candidates match', async () => {
    siblingListRows = [{ primary_id: PRIMARY_LP_ID, id: null, lp_number: null, quantity: null, uom: null }];

    const result = await listSiblingLpsForMerge(PRIMARY_LP_ID);

    expect(result).toEqual({ ok: true, siblings: [] });
  });

  it('listSiblingLpsForMerge returns not_found when the primary LP is missing', async () => {
    siblingListRows = [];

    const result = await listSiblingLpsForMerge(PRIMARY_LP_ID);

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('mergeLps merges matching LPs and keeps the most restrictive QA status', async () => {
    secondaryQaStatus = 'pending';

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'consolidate same lot');

    expect(result).toEqual({ ok: true });
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.merge');
    const primaryUpdate = calls.find((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes('quantity = quantity +'));
    expect(primaryUpdate?.params?.slice(0, 3)).toEqual([PRIMARY_LP_ID, '4.000000', 'pending']);
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes("status = 'merged'"))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('insert into public.lp_genealogy') && call.params?.[0] === PRIMARY_LP_ID && call.params?.[1] === SECONDARY_LP_ID)).toBe(true);
    const primaryMove = calls.find((call) => call.sql.startsWith('insert into public.stock_moves') && call.params?.[2] === PRIMARY_LP_ID && call.params?.[3] === 'merge');
    expect(primaryMove?.params?.[6]).toBe('4.000000');
  });

  it('mergeLps rejects product_id mismatch before writes', async () => {
    secondaryProductId = OTHER_PRODUCT_ID;

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'bad merge');

    expect(result).toEqual({ ok: false, error: 'LP product, UOM, batch, expiry, warehouse, site, and location must match before merge' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_genealogy'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  // The cross-SITE half moved to the dedicated suite below: the new cross_site_lp guard runs
  // before sameSkuLot, so a site mismatch no longer reaches this message. Warehouse mismatch —
  // two bins in the same site — is still this check's job.
  it('mergeLps rejects cross-warehouse LPs before writes', async () => {
    secondaryWarehouseId = 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc';

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'bad merge');

    expect(result).toEqual({ ok: false, error: 'LP product, UOM, batch, expiry, warehouse, site, and location must match before merge' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_genealogy'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('destroyLp marks the LP destroyed and writes audit history plus a negative adjustment', async () => {
    const result = await destroyLp(PRIMARY_LP_ID, 'damaged packaging', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: true });
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(String(sql)), params }));
    expect(calls.find((call) => call.sql.startsWith('select pg_advisory_xact_lock'))?.params?.[0]).toBe(`${ORG_ID}:lp-destroy:${DESTROY_CLIENT_OP_ID}`);
    expect(calls.find((call) => call.sql.includes('from public.user_roles'))?.params?.[2]).toBe('warehouse.lp.destroy');
    expect(
      calls.some(
        (call) =>
          call.sql.startsWith('update public.license_plates') &&
          call.sql.includes("status = 'destroyed'") &&
          call.sql.includes("and status <> 'destroyed'"),
      ),
    ).toBe(true);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[3]).toBe('destroyed');
    const move = calls.find((call) => call.sql.startsWith('insert into public.stock_moves'));
    expect(move?.params?.[3]).toBe('adjustment');
    expect(move?.params?.[6]).toBe('-10.000000');
    const wacWrite = calls.find((call) => call.sql.includes('insert into public.item_wac_state'));
    expect(wacWrite?.params).toEqual([ORG_ID, PRODUCT_ID, '-10.000000', '-100', USER_ID, SITE_ID, 'GBP']);
  });

  it('destroyLp rejects LPs with reserved quantity before writes', async () => {
    primaryReservedQty = '1.000000';

    const result = await destroyLp(PRIMARY_LP_ID, 'reserved', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'LP has reserved stock; clear reservation before destroying' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('destroyLp skips stock move for a zero-quantity LP', async () => {
    primaryQuantity = '0.000000';

    const result = await destroyLp(PRIMARY_LP_ID, 'destroy empty pallet', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: true });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('splitLp rejects a non-operable LP status before writes', async () => {
    primaryStatus = 'quarantine';

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split held stock', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'LP status does not allow split' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('splitLp rejects an LP under an active quality hold before writes', async () => {
    heldLpIds = new Set([PRIMARY_LP_ID]);

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split held stock', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'LP is under an active quality hold' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('mergeLps rejects when any LP is under an active quality hold before writes', async () => {
    heldLpIds = new Set([SECONDARY_LP_ID]);

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'merge held stock');

    expect(result).toEqual({ ok: false, error: 'one or more LPs are under an active quality hold' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('mergeLps rejects a non-operable LP status before writes', async () => {
    primaryStatus = 'consumed';

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'merge consumed');

    expect(result).toEqual({ ok: false, error: 'only available LPs can be merged' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('destroyLp rejects an already-terminal LP status before writes', async () => {
    primaryStatus = 'consumed';

    const result = await destroyLp(PRIMARY_LP_ID, 'destroy consumed', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'LP is already consumed/shipped/merged/destroyed and cannot be destroyed' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });
});

// ── FALA 7 handover · the LP's site must match the active one ─────────────────────────────────
// The UI path is closed (you cannot navigate to another site's LP), but these are Server Actions:
// a direct POST carrying someone else's lpId reached the mutation untouched. Each case calls the
// action DIRECTLY, exactly as that POST would, and asserts nothing was written.
describe('LP split/merge/destroy · cross-site direct invocation', () => {
  beforeEach(() => {
    // The pallet belongs to another site; the caller's bound site is the default SITE_ID.
    primarySiteId = OTHER_SITE_ID;
  });

  function writes() {
    return vi
      .mocked(client.query)
      .mock.calls.map(([sql]) => normalize(String(sql)))
      .filter(
        (sql) =>
          sql.startsWith('update public.license_plates') ||
          sql.startsWith('insert into public.stock_moves') ||
          sql.startsWith('insert into public.lp_state_history') ||
          sql.startsWith('insert into public.lp_genealogy') ||
          (sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates')),
      );
  }

  it('splitLp refuses another site\'s LP', async () => {
    const result = await splitLp(PRIMARY_LP_ID, 4, 'split someone else stock', SPLIT_CLIENT_OP_ID, DEST_LOCATION_ID);

    expect(result).toEqual({ ok: false, error: 'cross_site_lp' });
    expect(writes()).toEqual([]);
  });

  it('mergeLps refuses when any LP in the set belongs to another site', async () => {
    // Both rows come back on the same site as the primary, so the same-lot check would PASS —
    // proving the new guard, not the old one, is what stops this.
    secondarySiteId = OTHER_SITE_ID;

    const result = await mergeLps(PRIMARY_LP_ID, [SECONDARY_LP_ID], 'merge someone else stock');

    expect(result).toEqual({ ok: false, error: 'cross_site_lp' });
    expect(writes()).toEqual([]);
  });

  it('destroyLp refuses another site\'s LP', async () => {
    const result = await destroyLp(PRIMARY_LP_ID, 'destroy someone else stock', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'cross_site_lp' });
    expect(writes()).toEqual([]);
  });

  it('destroyLp refuses BEFORE the already-destroyed short-circuit, so ok:true never confirms a foreign id', async () => {
    primaryStatus = 'destroyed';

    const result = await destroyLp(PRIMARY_LP_ID, 'probe', DESTROY_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'cross_site_lp' });
  });

  it('blocks an LP with no site instead of preserving the legacy NULL tolerance', async () => {
    primarySiteId = null;

    await expect(destroyLp(PRIMARY_LP_ID, 'destroy legacy pallet', DESTROY_CLIENT_OP_ID)).resolves.toEqual({
      ok: false,
      error: 'cross_site_lp',
    });
  });

  it('does NOT block the ALL-sites (super_admin) bind', async () => {
    activeSiteId = null;

    await expect(destroyLp(PRIMARY_LP_ID, 'destroy as super admin', DESTROY_CLIENT_OP_ID)).resolves.toEqual({ ok: true });
  });
});
