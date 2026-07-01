import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reverseToReceiveLine } from '../reverse-receive';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TO_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';
const LINK_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_LP_ID = '66666666-6666-4666-8666-666666666666';
const DEST_LP_ID = '77777777-7777-4777-8777-777777777777';
const SOURCE_SITE_ID = '88888888-8888-4888-8888-888888888888';
const DEST_SITE_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let sourceStatus: 'shipped' | 'consumed' | 'destroyed' = 'shipped';

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../../../lib/corrections/correct-ledger-entry', () => ({
  CORRECTION_REASON_CODES: ['entry_error', 'wrong_quantity', 'wrong_batch', 'wrong_product', 'other'],
  CorrectionForbiddenError: class CorrectionForbiddenError extends Error {},
  CorrectionInvalidInputError: class CorrectionInvalidInputError extends Error {},
  assertCorrectionAllowed: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeInput() {
  return {
    toId: TO_ID,
    lineId: LINE_ID,
    destLpId: DEST_LP_ID,
    quantity: '12.000000',
    reasonCode: 'wrong_quantity',
    note: 'reverse test receipt',
    signature: { password: '1234', intent: 'warehouse.transfer_receive.reverse', nonce: 'nonce-1' },
  };
}

function receivedLink() {
  return {
    to_id: TO_ID,
    to_number: 'TO-TEST-001',
    to_status: 'received',
    line_id: LINE_ID,
    line_uom: 'kg',
    link_id: LINK_ID,
    link_qty: '12.000000',
    source_lp_id: SOURCE_LP_ID,
    source_status: sourceStatus,
    source_quantity: '0.000000',
    source_location_id: null,
    source_site_id: SOURCE_SITE_ID,
    dest_lp_id: DEST_LP_ID,
    dest_status: 'available',
    dest_quantity: '12.000000',
    dest_reserved_qty: '0.000000',
    dest_location_id: null,
    dest_site_id: DEST_SITE_ID,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);

      if (q.startsWith('select t.id::text as to_id')) {
        return { rows: [receivedLink()], rowCount: 1 };
      }
      if (q.startsWith('select array_remove')) {
        return { rows: [{ blockers: [] }], rowCount: 1 };
      }
      if (q.startsWith('select count(*) filter')) {
        return { rows: [{ received_count: '0' }], rowCount: 1 };
      }
      if (
        q.startsWith('update public.license_plates') ||
        q.startsWith('insert into public.lp_state_history') ||
        q.startsWith('insert into public.stock_moves') ||
        q.startsWith('delete from public.transfer_order_line_lps') ||
        q.startsWith('update public.transfer_orders') ||
        q.startsWith('insert into public.audit_events') ||
        q.startsWith('insert into public.outbox_events')
      ) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('reverseToReceiveLine source LP state guards', () => {
  beforeEach(() => {
    sourceStatus = 'shipped';
    client = makeClient();
  });

  it('allows a shipped source LP and flips it back to available while crediting quantity', async () => {
    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    const sourceUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.license_plates') && params?.[0] === SOURCE_LP_ID;
    });
    expect(sourceUpdate?.[0]).toContain("status = CASE WHEN status = 'shipped' THEN 'available' ELSE status END");
    expect(sourceUpdate?.[1]).toEqual([SOURCE_LP_ID, '12', USER_ID]);

    const shippedHistory = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('insert into public.lp_state_history') && params?.[1] === SOURCE_LP_ID;
    });
    expect(shippedHistory?.[1]?.[2]).toBe('shipped');
    expect(shippedHistory?.[1]?.[3]).toBe('available');
  });

  it('rejects a consumed source LP before mutating stock', async () => {
    sourceStatus = 'consumed';

    const result = await reverseToReceiveLine(makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'Source LP is consumed; receive reversal would create phantom stock.',
    });
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'))).toBe(false);
  });

  it('rejects a destroyed source LP before mutating stock', async () => {
    sourceStatus = 'destroyed';

    const result = await reverseToReceiveLine(makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'Source LP is destroyed; receive reversal would create phantom stock.',
    });
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'))).toBe(false);
  });
});
