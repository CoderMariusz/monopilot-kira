import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { maxSqlPlaceholderIndex } from '../../../../../../lib/shared/sql-placeholders';
import { traceGenealogy } from './genealogy-actions';
import { listLPs } from './lp-actions';
import { releaseLpQa } from './lp-qa-actions';
import { releaseReservation } from './reservation-actions';
import { createStockMove } from './stock-move-actions';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LP_ID = '33333333-3333-4333-8333-333333333333';
const LOC_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let grantedPermissions: Set<string>;
let lpStatus = 'available';
let lpQaStatus = 'pending';
let lockActive = false;
let lpExists = true;
let lastMoveType = 'transfer';
let activeHold = false;
let listLpTotal = 1;

function expectSqlArity(sql: string, params: readonly unknown[] | undefined) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(String(sql)));
}

function makeLpListRow(index: number) {
  return {
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    lp_number: `LP-${String(index).padStart(3, '0')}`,
    item_code: 'RM-001',
    item_name: 'Raw material',
    quantity: '10.000000',
    reserved_qty: '2.000000',
    available_qty: '8.000000',
    uom: 'kg',
    status: 'available',
    qa_status: 'released',
    batch_number: 'B-001',
    expiry_date: '2026-07-01T00:00:00.000Z',
    location_code: 'A-01',
    warehouse_code: 'WH1',
    created_at: '2026-06-01T00:00:00.000Z',
  };
}

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; siteId: string | null; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (normalized.includes('from public.license_plates lp') && normalized.includes('for update')) {
        return {
          rows: lpExists
            ? [
                {
                  id: LP_ID,
                  lp_number: 'LP-001',
                  status: lpStatus,
                  location_id: '55555555-5555-4555-8555-555555555555',
                  quantity: '10.000000',
                  uom: 'kg',
                  site_id: SITE_ID,
                  reserved_qty: '10.000000',
                  reserved_for_wo_id: '66666666-6666-4666-8666-666666666666',
                  locked_by: lockActive ? '77777777-7777-4777-8777-777777777777' : null,
                  lock_is_active_for_other_user: lockActive,
                },
              ]
            : [],
          rowCount: lpExists ? 1 : 0,
        };
      }

      if (normalized.startsWith('select id::text, lp_number, status, qa_status from public.license_plates')) {
        return {
          rows: lpExists
            ? [{ id: LP_ID, lp_number: 'LP-001', status: lpStatus, qa_status: lpQaStatus }]
            : [],
          rowCount: lpExists ? 1 : 0,
        };
      }

      if (normalized.includes('from public.v_active_holds')) {
        return {
          rows: activeHold ? [{ hold_id: '99999999-9999-4999-8999-999999999999', reference_type: 'lp', reference_id: LP_ID }] : [],
          rowCount: activeHold ? 1 : 0,
        };
      }

      if (normalized.includes('from public.locations loc') && normalized.includes('join public.warehouses w')) {
        return {
          rows: [{
            id: LOC_ID,
            warehouse_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            site_id: '99999999-9999-4999-8999-999999999999',
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('select id::text from public.locations')) {
        return { rows: [{ id: LOC_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.stock_moves')) {
        lastMoveType = String(params?.[3] ?? 'transfer');
        return { rows: [{ id: '88888888-8888-4888-8888-888888888888' }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.license_plates') && normalized.includes('returning lp.id::text as lp_id')) {
        return {
          rows: [
            {
              lp_id: LP_ID,
              lp_number: 'LP-001',
              status: 'available',
              reserved_qty: '0.000000',
              reserved_for_wo_id: null,
              wo_number: null,
              item_code: 'RM-001',
              item_name: 'Raw material',
              quantity: '10.000000',
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }

      if (
        normalized.startsWith('update public.license_plates') &&
        normalized.includes("status = 'available'") &&
        normalized.includes('returning id::text')
      ) {
        return { rows: lpStatus === 'received' ? [{ id: LP_ID }] : [], rowCount: lpStatus === 'received' ? 1 : 0 };
      }

      if (normalized.startsWith('update public.license_plates') && normalized.includes('returning id::text, lp_number, status, qa_status')) {
        // Mirror the lifecycle CASE in releaseLpQa (audit F-A01): released
        // promotes received→available, rejected maps received→blocked,
        // every other status passes through unchanged.
        const decision = params?.[1];
        const statusAfter =
          decision === 'released' && lpStatus === 'received'
            ? 'available'
            : decision === 'rejected' && lpStatus === 'received'
              ? 'blocked'
              : lpStatus;
        return {
          rows: [
            {
              id: LP_ID,
              lp_number: 'LP-001',
              status: statusAfter,
              qa_status: decision,
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('from public.stock_moves sm') && normalized.includes('sm.transaction_id')) {
        return {
          rows: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              move_number: 'SM-TEST',
              lp_id: LP_ID,
              lp_number: 'LP-001',
              move_type: lastMoveType,
              from_location_code: 'A-01',
              to_location_code: 'B-01',
              quantity: '10.000000',
              uom: 'kg',
              move_date: '2026-06-11T08:00:00.000Z',
              reason_text: 'move',
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.includes('select count(*)::int as total') && normalized.includes('from public.license_plates lp')) {
        expectSqlArity(sql, params);
        return { rows: [{ total: listLpTotal }], rowCount: 1 };
      }

      if (normalized.startsWith('select lp.id::text') && normalized.includes('from public.license_plates lp')) {
        expectSqlArity(sql, params);
        const limit = Number(params?.[3] ?? 50);
        const offset = Number(params?.[4] ?? 0);
        const allRows = Array.from({ length: listLpTotal }, (_, index) => makeLpListRow(index + 1));
        const rows = allRows.slice(offset, offset + limit);
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('select id::text from public.license_plates')) {
        return { rows: lpExists ? [{ id: LP_ID }] : [], rowCount: lpExists ? 1 : 0 };
      }

      if (normalized.includes('public.get_lp_genealogy_org_wide')) {
        return {
          rows: [
            {
              lp_id: '99999999-9999-4999-8999-999999999999',
              lp_number: 'LP-PARENT',
              item_code: 'RM-P',
              quantity: '20.000000',
              uom: 'kg',
              status: 'merged',
              created_at: '2026-05-01T00:00:00.000Z',
              depth: 1,
              direction: 'ancestor',
              parent_lp_id: null,
            },
            {
              lp_id: LP_ID,
              lp_number: 'LP-001',
              item_code: 'RM-001',
              quantity: '10.000000',
              uom: 'kg',
              status: 'available',
              created_at: '2026-06-01T00:00:00.000Z',
              depth: 0,
              direction: 'self',
              parent_lp_id: '99999999-9999-4999-8999-999999999999',
            },
            {
              lp_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              lp_number: 'LP-CHILD',
              item_code: 'RM-C',
              quantity: '5.000000',
              uom: 'kg',
              status: 'available',
              created_at: '2026-06-02T00:00:00.000Z',
              depth: 1,
              direction: 'descendant',
              parent_lp_id: LP_ID,
            },
          ],
          rowCount: 3,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('warehouse backend actions', () => {
  beforeEach(() => {
    grantedPermissions = new Set(['warehouse.inventory.read', 'warehouse.stock.move', 'warehouse.lp.reserve', 'warehouse.grn.receive', 'quality.batch.release']);
    lpStatus = 'available';
    lpQaStatus = 'pending';
    lockActive = false;
    lpExists = true;
    lastMoveType = 'transfer';
    activeHold = false;
    listLpTotal = 1;
    client = makeClient();
  });

  it('returns forbidden before read SQL when warehouse inventory read permission is missing', async () => {
    grantedPermissions.delete('warehouse.inventory.read');

    await expect(listLPs()).resolves.toEqual({ ok: false, reason: 'forbidden' });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('from public.user_roles');
  });

  it('listLPs keeps search, warehouse, and limit filters parameterized without status or QA restrictions', async () => {
    const result = await listLPs({
      status: 'available',
      qaStatus: 'released',
      search: 'RM',
      warehouseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      limit: 25,
    });

    expect(result.ok).toBe(true);
    const listCall = vi.mocked(client.query).mock.calls.find(
      ([sql]) =>
        normalize(sql).includes('from public.license_plates lp') &&
        normalize(sql).includes('lp.status, lp.qa_status'),
    );
    expect(listCall).toBeTruthy();
    expect(normalize(String(listCall?.[0]))).toContain('lp.org_id = app.current_org_id()');
    expect(normalize(String(listCall?.[0]))).not.toMatch(/lp\.status\s*=/);
    expect(normalize(String(listCall?.[0]))).not.toMatch(/lp\.qa_status\s*=/);
    expect(normalize(String(listCall?.[0]))).toContain('lp.status, lp.qa_status');
    expect(normalize(String(listCall?.[0]))).toContain('lp.warehouse_id = $1');
    expect(normalize(String(listCall?.[0]))).toContain('ilike');
    expect(listCall?.[1]).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RM', null, 25, 0]);
  });

  it('listLPs page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listLpTotal = 120;

    const result = await listLPs({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(expect.objectContaining({ lpNumber: 'LP-051' }));
    const listCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('limit $4::integer offset $5::integer'),
    );
    expect(listCall?.[1]).toEqual([null, null, null, 50, 50]);
  });

  it('createStockMove rejects same-location transfers before inserting a stock move (C101)', async () => {
    await expect(createStockMove({ lpId: LP_ID, toLocationId: '55555555-5555-4555-8555-555555555555', clientOpId: 'op-same' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'same_location',
    });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('createStockMove rejects immovable LP statuses before inserting a stock move', async () => {
    lpStatus = 'consumed';

    await expect(createStockMove({ lpId: LP_ID, toLocationId: LOC_ID, clientOpId: 'op-1' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'immovable_status',
    });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('createStockMove respects active scanner locks held by another user', async () => {
    lockActive = true;

    await expect(createStockMove({ lpId: LP_ID, toLocationId: LOC_ID, clientOpId: 'op-2' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'locked',
    });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('createStockMove updates the LP site to the destination warehouse site', async () => {
    const result = await createStockMove({ lpId: LP_ID, toLocationId: LOC_ID, clientOpId: 'op-site' });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    const locationLookup = calls.find((call) => call.sql.includes('from public.locations loc'));
    expect(locationLookup?.sql).toContain('join public.warehouses w');
    const moveInsert = calls.find((call) => call.sql.startsWith('insert into public.stock_moves'));
    expect(moveInsert?.sql).toContain('org_id, site_id, move_number');
    expect(moveInsert?.params?.[0]).toBe('99999999-9999-4999-8999-999999999999');
    const lpUpdate = calls.find((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes('site_id = $4::uuid'));
    expect(lpUpdate).toBeDefined();
    expect(lpUpdate?.sql).toContain('warehouse_id = $5::uuid');
    expect(lpUpdate?.params).toEqual([
      LP_ID,
      LOC_ID,
      USER_ID,
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
  });

  it('releaseReservation clears reservation and writes state history when reserved becomes available', async () => {
    lpStatus = 'reserved';

    const result = await releaseReservation({ lpId: LP_ID, reason: 'operator release' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({ status: 'available', reservedQty: '0.000000', reservedForWoId: null });
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates'))).toBe(true);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history).toBeTruthy();
    expect(history?.params?.slice(0, 4)).toEqual([LP_ID, 'reserved', 'available', 'operator release']);
  });

  it('releaseReservation REFUSES a terminal (consumed) LP and writes nothing', async () => {
    lpStatus = 'consumed';

    const result = await releaseReservation({ lpId: LP_ID, reason: 'stray reservation' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.message).toBe('not_releasable_status');
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('releaseLpQa requires quality.batch.release before touching LP rows', async () => {
    grantedPermissions.delete('quality.batch.release');

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('from public.user_roles');
  });

  it('releaseLpQa flips pending QA and writes history plus warehouse outbox', async () => {
    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released', note: 'visual OK' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.qaStatus).toBe('released');
    // already-available LP: only qa_status changes, status passes through
    expect(result.data.status).toBe('available');
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates') && call.params?.[1] === 'released')).toBe(true);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[5]).toContain('"qaStatusFrom":"pending"');
    expect(history?.params?.[5]).toContain('"qaStatusTo":"released"');
    const outbox = calls.find((call) => call.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[1]).toContain('"qa_status_to":"released"');
  });

  it('releaseLpQa refuses released when an active LP hold exists without updating', async () => {
    activeHold = true;

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released', note: 'visual OK' });

    expect(result).toEqual({ ok: false, reason: 'error', message: 'quality_hold_active' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.includes('from public.v_active_holds'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('insert into public.lp_state_history'))).toBe(false);
  });

  it('releaseLpQa proceeds with released when no active LP hold exists', async () => {
    activeHold = false;

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls.some((sql) => sql.includes('from public.v_active_holds'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(true);
  });

  it('releaseLpQa promotes a received LP to available on release (audit F-A01)', async () => {
    lpStatus = 'received';

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released', note: 'visual OK' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.status).toBe('available');
    expect(result.data.qaStatus).toBe('released');
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    // the single UPDATE carries the lifecycle CASE — promotion is atomic with the QA flip
    const update = calls.find((call) => call.sql.startsWith('update public.license_plates'));
    expect(update?.sql).toContain("when $2 = 'released' and status = 'received' then 'available'");
    // ledger row records the real received→available transition
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[1]).toBe('received');
    expect(history?.params?.[2]).toBe('available');
    // outbox carries the promoted status
    const outbox = calls.find((call) => call.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[1]).toContain('"status_from":"received"');
    expect(outbox?.params?.[1]).toContain('"status_to":"available"');
  });

  it('releaseLpQa maps a rejected received LP to blocked, never available', async () => {
    lpStatus = 'received';

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'rejected', note: 'damaged' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.status).toBe('blocked');
    expect(result.data.qaStatus).toBe('rejected');
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[1]).toBe('received');
    expect(history?.params?.[2]).toBe('blocked');
    const outbox = calls.find((call) => call.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[1]).toContain('"status_to":"blocked"');
  });

  it('releaseLpQa leaves non-received statuses untouched on release', async () => {
    lpStatus = 'quarantine';

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.status).toBe('quarantine');
    expect(result.data.qaStatus).toBe('released');
  });

  it('releaseLpQa refuses non-pending and terminal LPs without updating', async () => {
    lpQaStatus = 'released';
    await expect(releaseLpQa({ lpId: LP_ID, decision: 'rejected' })).resolves.toMatchObject({
      ok: false,
      message: 'invalid_state',
    });

    lpQaStatus = 'pending';
    lpStatus = 'consumed';
    await expect(releaseLpQa({ lpId: LP_ID, decision: 'released' })).resolves.toMatchObject({
      ok: false,
      message: 'terminal_lp_status',
    });
  });

  it('traceGenealogy delegates to the org-wide genealogy definer function', async () => {
    const result = await traceGenealogy(LP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.map((row) => row.direction)).toEqual(['ancestor', 'self', 'descendant']);
    const genealogyCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).includes('public.get_lp_genealogy_org_wide(app.current_org_id(), $1::uuid'),
    );
    expect(genealogyCall).toBeTruthy();
    expect(genealogyCall?.[1]).toEqual([LP_ID]);
  });
});
