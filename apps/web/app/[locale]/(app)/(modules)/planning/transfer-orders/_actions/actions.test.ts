import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTransferOrder,
  getTransferOrder,
  listTransferOrders,
  transitionTransferOrderStatus,
} from './actions';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TO_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const FROM_WAREHOUSE_ID = '77777777-7777-4777-8777-777777777777';
const TO_WAREHOUSE_ID = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let allowPermission = true;
let orderExists = true;
let generatedSeq = 7;
let failNextAutoInsert = false;
let currentStatus = 'draft';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function header(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TO_ID,
    to_number: 'TO-TEST-001',
    from_warehouse_id: FROM_WAREHOUSE_ID,
    to_warehouse_id: TO_WAREHOUSE_ID,
    status: 'draft',
    scheduled_date: '2026-06-19',
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function line() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    to_id: TO_ID,
    item_id: ITEM_ID,
    item_code: 'RM-BEEF-50',
    item_name: 'Beef trim 50VL',
    qty: '12.000',
    uom: 'kg',
    line_no: 1,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: generatedSeq++, number_prefix: 'TO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('select count(*) as archived_count')) {
        return { rows: [{ archived_count: 1 }], rowCount: 1 };
      }
      if (normalized.includes('from public.transfer_order_lines')) {
        return { rows: [line()], rowCount: 1 };
      }
      if (normalized.startsWith('select id, to_number') || normalized.startsWith('select transfer_orders.id')) {
        return { rows: orderExists ? [header()] : [], rowCount: orderExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.transfer_orders')) {
        if (failNextAutoInsert) {
          failNextAutoInsert = false;
          const error = new Error('duplicate') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        return { rows: [header({ to_number: String(params[0]) })], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.transfer_order_lines')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('select status from public.transfer_orders')) {
        return { rows: orderExists ? [{ status: currentStatus }] : [], rowCount: orderExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.transfer_orders')) {
        return { rows: orderExists ? [header({ status: String(params[1]) })] : [], rowCount: orderExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('planning transfer order actions', () => {
  beforeEach(() => {
    allowPermission = true;
    orderExists = true;
    generatedSeq = 7;
    failNextAutoInsert = false;
    currentStatus = 'draft';
    client = makeClient();
  });

  it('lists transfer orders under org scope', async () => {
    const result = await listTransferOrders({ status: 'draft', q: 'TO' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data[0]).toEqual(expect.objectContaining({ toNumber: 'TO-TEST-001' }));
    expect(result.archivedCount).toBe(1);
  });

  it('passes archived=false by default and archived=true for archive views', async () => {
    await listTransferOrders({});
    await listTransferOrders({ archived: true });

    const listCalls = vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('from public.transfer_orders transfer_orders'));
    expect(listCalls[0]?.[1]).toEqual([null, null, 100, false]);
    expect(listCalls[2]?.[1]).toEqual([null, null, 100, true]);
  });

  it('gets transfer order detail with lines', async () => {
    const result = await getTransferOrder(TO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.lines).toEqual([expect.objectContaining({ itemCode: 'RM-BEEF-50', qty: '12.000' })]);
  });

  it('creates transfer order header, lines, and audit event', async () => {
    const result = await createTransferOrder({
      toNumber: 'TO-TEST-001',
      fromWarehouseId: FROM_WAREHOUSE_ID,
      toWarehouseId: TO_WAREHOUSE_ID,
      lines: [{ itemId: ITEM_ID, qty: '12.000', uom: 'kg', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.toNumber).toBe('TO-TEST-001');
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => sql);
    expect(calls.some((sql) => sql.includes('insert into public.transfer_order_lines'))).toBe(true);
    expect(calls.some((sql) => sql.includes('insert into public.audit_events'))).toBe(true);
  });

  it('auto-generates a transfer order number when absent', async () => {
    const result = await createTransferOrder({
      fromWarehouseId: FROM_WAREHOUSE_ID,
      toWarehouseId: TO_WAREHOUSE_ID,
      lines: [{ itemId: ITEM_ID, qty: '12.000', uom: 'kg', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.toNumber).toMatch(/^TO-\d{6}-0007$/);
  });

  it('retries once with a fresh generated number on unique violation', async () => {
    failNextAutoInsert = true;

    const result = await createTransferOrder({
      fromWarehouseId: FROM_WAREHOUSE_ID,
      toWarehouseId: TO_WAREHOUSE_ID,
      lines: [{ itemId: ITEM_ID, qty: '12.000', uom: 'kg', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.toNumber).toMatch(/^TO-\d{6}-0008$/);
  });

  it('rejects create when caller lacks planning write permission', async () => {
    allowPermission = false;
    await expect(
      createTransferOrder({
        toNumber: 'TO-TEST-001',
        lines: [{ itemId: ITEM_ID, qty: '12.000', uom: 'kg', lineNo: 1 }],
      }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('transitions transfer order status on a legal move (draft -> in_transit)', async () => {
    currentStatus = 'draft';
    const result = await transitionTransferOrderStatus(TO_ID, 'in_transit');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.status).toBe('in_transit');
  });

  it('transitions transfer order status on a legal move (in_transit -> received)', async () => {
    currentStatus = 'in_transit';
    const result = await transitionTransferOrderStatus(TO_ID, 'received');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.status).toBe('received');
  });

  it('refuses an illegal transition (draft -> received) server-side', async () => {
    currentStatus = 'draft';
    const result = await transitionTransferOrderStatus(TO_ID, 'received');

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.startsWith('update public.transfer_orders'))).toBe(false);
  });

  it('refuses any transition out of a terminal status (received -> cancelled)', async () => {
    currentStatus = 'received';
    const result = await transitionTransferOrderStatus(TO_ID, 'cancelled');

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
  });
});
