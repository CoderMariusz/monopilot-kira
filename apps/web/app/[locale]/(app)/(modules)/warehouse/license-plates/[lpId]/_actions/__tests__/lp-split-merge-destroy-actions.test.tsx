import { beforeEach, describe, expect, it, vi } from 'vitest';

import { destroyLp, mergeLps, splitLp } from '../lp-split-merge-destroy-actions';
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
const SPLIT_CLIENT_OP_ID = 'split-op-001';
const DESTROY_CLIENT_OP_ID = 'destroy-op-001';

let client: QueryClient;
let grantedPermissions: Set<string>;
let heldLpIds: Set<string>;
let splitReplayChildId: string | null;
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

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function baseLp(overrides: Partial<Record<string, string | null>> = {}) {
  return {
    id: PRIMARY_LP_ID,
    lp_number: 'LP-001',
    site_id: SITE_ID,
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
        return { rows: splitReplayChildId ? [{ id: splitReplayChildId }] : [], rowCount: splitReplayChildId ? 1 : 0 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('lp.id = $1::uuid') && q.includes('for update')) {
        return { rows: [baseLp()], rowCount: 1 };
      }

      if (q.startsWith('select ($1::numeric < (quantity - reserved_qty))')) {
        return {
          rows: [{ fits: splitFits, remaining_qty: splitFits ? '6.000000' : '10.000000' }],
          rowCount: 1,
        };
      }

      if (q.includes('from public.v_active_holds')) {
        const ids = (params?.[0] as string[] | undefined) ?? [];
        const rows = ids.filter((id) => heldLpIds.has(id)).map((id) => ({ id }));
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('with deterministic_child as') && q.includes('insert into public.license_plates')) {
        splitReplayChildId = CHILD_LP_ID;
        return { rows: [{ id: CHILD_LP_ID }], rowCount: 1 };
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

describe('LP split/merge/destroy server actions', () => {
  beforeEach(() => {
    grantedPermissions = new Set(['warehouse.lp.split', 'warehouse.lp.merge', 'warehouse.lp.destroy']);
    heldLpIds = new Set();
    splitReplayChildId = null;
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
    client = makeClient();
  });

  it('splitLp reduces the source, creates a child LP, genealogy, history, and stock moves', async () => {
    const result = await splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID);

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

  it('splitLp replays the same clientOpId without double-decrementing or minting another child LP', async () => {
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID)).resolves.toEqual({ ok: true });
    await expect(splitLp(PRIMARY_LP_ID, 4, 'split for line staging', SPLIT_CLIENT_OP_ID)).resolves.toEqual({ ok: true });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.filter((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toHaveLength(1);
    expect(calls.filter((sql) => sql.startsWith('update public.license_plates') && sql.includes('quantity = quantity -'))).toHaveLength(1);
  });

  it('splitLp rejects split quantity greater than available quantity before writes', async () => {
    splitFits = false;

    const result = await splitLp(PRIMARY_LP_ID, 11, 'too much', SPLIT_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'split quantity must be less than available quantity' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
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

  it('mergeLps rejects cross-site or cross-warehouse LPs before writes', async () => {
    secondarySiteId = 'abababab-abab-4aba-8aba-abababababab';
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

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split held stock', SPLIT_CLIENT_OP_ID);

    expect(result).toEqual({ ok: false, error: 'LP status does not allow split' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('with deterministic_child as') && sql.includes('insert into public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('splitLp rejects an LP under an active quality hold before writes', async () => {
    heldLpIds = new Set([PRIMARY_LP_ID]);

    const result = await splitLp(PRIMARY_LP_ID, 4, 'split held stock', SPLIT_CLIENT_OP_ID);

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
