import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

let client: QueryClient;
let grantedPermissions: Set<string>;
let lpStatus = 'available';
let lpQaStatus = 'pending';
let lockActive = false;
let lpExists = true;
let lastMoveType = 'transfer';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
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

      if (normalized.startsWith('select id::text from public.locations')) {
        return { rows: [{ id: LOC_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.stock_moves')) {
        lastMoveType = String(params?.[2] ?? 'transfer');
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

      if (normalized.startsWith('select lp.id::text') && normalized.includes('from public.license_plates lp')) {
        return {
          rows: [
            {
              id: LP_ID,
              lp_number: 'LP-001',
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
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('select id::text from public.license_plates')) {
        return { rows: lpExists ? [{ id: LP_ID }] : [], rowCount: lpExists ? 1 : 0 };
      }

      if (normalized.includes('with recursive') && normalized.includes('ancestors') && normalized.includes('descendants')) {
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
    grantedPermissions = new Set(['warehouse.inventory.read', 'warehouse.stock.move', 'warehouse.lp.reserve', 'warehouse.grn.receive']);
    lpStatus = 'available';
    lpQaStatus = 'pending';
    lockActive = false;
    lpExists = true;
    lastMoveType = 'transfer';
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
    const listCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(sql).includes('from public.license_plates lp'));
    expect(listCall).toBeTruthy();
    expect(normalize(String(listCall?.[0]))).toContain('lp.org_id = app.current_org_id()');
    expect(normalize(String(listCall?.[0]))).not.toMatch(/lp\.status\s*=/);
    expect(normalize(String(listCall?.[0]))).not.toMatch(/lp\.qa_status\s*=/);
    expect(normalize(String(listCall?.[0]))).toContain('lp.status, lp.qa_status');
    expect(normalize(String(listCall?.[0]))).toContain('lp.warehouse_id = $1');
    expect(normalize(String(listCall?.[0]))).toContain('ilike');
    expect(listCall?.[1]).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RM', null, 25]);
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

  it('createStockMove putaway promotes a received released LP to available and records the transition', async () => {
    lpStatus = 'received';
    lpQaStatus = 'released';

    const result = await createStockMove({ lpId: LP_ID, toLocationId: LOC_ID, clientOpId: 'op-putaway' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.moveType).toBe('putaway');
    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    const insert = calls.find((call) => call.sql.startsWith('insert into public.stock_moves'));
    expect(insert?.params?.[2]).toBe('putaway');
    const update = calls.find((call) => call.sql.startsWith('update public.license_plates') && call.sql.includes("status = 'available'"));
    expect(update?.sql).toContain("and status = 'received'");
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.slice(0, 2)).toEqual([LP_ID, '88888888-8888-4888-8888-888888888888']);
    expect(history?.sql).toContain("'received', 'available'");
    const outbox = calls.find((call) => call.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[1]).toContain('"status_from":"received"');
    expect(outbox?.params?.[1]).toContain('"status_to":"available"');

    // Mirrors v_inventory_available migration 191 predicate for this LP:
    // putaway owns status='available'; QC release already owns qa_status='released'.
    expect(update).toBeTruthy();
    expect(lpQaStatus).toBe('released');
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

  it('releaseLpQa requires warehouse.grn.receive before touching LP rows', async () => {
    grantedPermissions.delete('warehouse.grn.receive');

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

  it('traceGenealogy uses a cycle-safe recursive CTE in both directions', async () => {
    const result = await traceGenealogy(LP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.map((row) => row.direction)).toEqual(['ancestor', 'self', 'descendant']);
    const cteCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(sql).includes('with recursive'));
    expect(cteCall).toBeTruthy();
    const sql = normalize(String(cteCall?.[0]));
    expect(sql).toContain('ancestors');
    expect(sql).toContain('descendants');
    expect(sql).toContain('depth < 20');
    expect(sql).toContain('not parent.id = any(ancestors.path)');
    expect(sql).toContain('not child.id = any(descendants.path)');
  });
});
