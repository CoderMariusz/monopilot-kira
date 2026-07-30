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
let consumptionHistory: Array<{ id: string; correction_of_id: string | null }>;

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

vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
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
        const excludesCorrectedOriginals = q.includes('correction.correction_of_id = wmc.id');
        const blocked = consumptionHistory.some(
          (row) =>
            row.correction_of_id === null &&
            (!excludesCorrectedOriginals ||
              !consumptionHistory.some((correction) => correction.correction_of_id === row.id)),
        );
        return { rows: [{ blockers: blocked ? ['consumed_wo_inputs'] : [] }], rowCount: 1 };
      }
      if (q.startsWith('select count(*) filter')) {
        return { rows: [{ received_count: '0' }], rowCount: 1 };
      }
      if (q.startsWith('select distinct item_id')) {
        return { rows: [{ item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }], rowCount: 1 };
      }
      if (q.startsWith('select coalesce(sum(quantity)')) {
        return { rows: [{ total: '12.000000' }], rowCount: 1 };
      }
      if (
        q.startsWith('update public.license_plates') ||
        q.startsWith('insert into public.lp_state_history') ||
        q.startsWith('insert into public.stock_moves') ||
        q.startsWith('update public.transfer_order_line_lps') ||
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
    consumptionHistory = [];
    client = makeClient();
  });

  it('does not credit the source LP — qty returns to in-transit via the junction row', async () => {
    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    const sourceUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.license_plates') && params?.[0] === SOURCE_LP_ID;
    });
    expect(sourceUpdate).toBeUndefined();
  });

  it('allows reversal when the source LP is consumed (only the destination LP is voided)', async () => {
    sourceStatus = 'consumed';

    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    const sourceUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.license_plates') && params?.[0] === SOURCE_LP_ID;
    });
    expect(sourceUpdate).toBeUndefined();
  });

  it('allows reversal when the source LP is destroyed (only the destination LP is voided)', async () => {
    sourceStatus = 'destroyed';

    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    const sourceUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.license_plates') && params?.[0] === SOURCE_LP_ID;
    });
    expect(sourceUpdate).toBeUndefined();
  });

  it('ignores corrected consumption as a blocker but retains ordinary consumption', async () => {
    consumptionHistory = [
      { id: 'corrected', correction_of_id: null },
      { id: 'correction', correction_of_id: 'corrected' },
    ];
    await expect(reverseToReceiveLine(makeInput())).resolves.toMatchObject({ ok: true });

    consumptionHistory = [{ id: 'ordinary', correction_of_id: null }];
    client = makeClient();
    await expect(reverseToReceiveLine(makeInput())).resolves.toMatchObject({
      ok: false,
      error: 'lp_active',
      message: expect.stringContaining('consumed_wo_inputs'),
    });
  });
});

describe('reverseToReceiveLine ship-link cleanup (PF-R10-02)', () => {
  beforeEach(() => {
    sourceStatus = 'shipped';
    consumptionHistory = [];
    client = makeClient();
  });

  it('clears dest_lp_id on the junction row so receive can materialize the remainder', async () => {
    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);

    const linkUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.transfer_order_line_lps') && params?.[0] === LINK_ID;
    });
    expect(linkUpdate).toBeDefined();
    expect(String(linkUpdate?.[0])).toContain('dest_lp_id = null');

    const linkDelete = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('delete from public.transfer_order_line_lps'),
    );
    expect(linkDelete).toBeUndefined();
  });

  it('rerolls the TO status to in_transit when received_count is 0 and returns it in result.data.status', async () => {
    // client is already stubbed with received_count: '0' (makeClient default)
    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    // Observable reroll outcome: returned status field
    expect(result.data.status).toBe('in_transit');

    // The UPDATE transfer_orders statement must carry 'in_transit' as the status param
    const toUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.transfer_orders') && params?.[1] === 'in_transit';
    });
    expect(toUpdate).toBeDefined();
    expect(toUpdate?.[1]).toEqual([TO_ID, 'in_transit', USER_ID]);
  });

  it('rerolls the TO status to partially_received when received_count is greater than 0', async () => {
    // Override the count stub for this test only
    vi.mocked(client.query).mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.startsWith('select t.id::text as to_id')) {
        return { rows: [receivedLink()], rowCount: 1 };
      }
      if (q.startsWith('select array_remove')) {
        return { rows: [{ blockers: [] }], rowCount: 1 };
      }
      if (q.startsWith('select count(*) filter')) {
        return { rows: [{ received_count: '2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await reverseToReceiveLine(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    expect(result.data.status).toBe('partially_received');

    const toUpdate = vi.mocked(client.query).mock.calls.find(([sql, params]) => {
      const q = normalize(String(sql));
      return q.startsWith('update public.transfer_orders') && params?.[1] === 'partially_received';
    });
    expect(toUpdate).toBeDefined();
    expect(toUpdate?.[1]).toEqual([TO_ID, 'partially_received', USER_ID]);
  });
});
