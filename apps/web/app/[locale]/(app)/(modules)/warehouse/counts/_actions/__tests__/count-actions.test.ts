import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveAndApplyVariance, recordCount } from '../count-actions';
import type { CountLineStatus } from '../count-types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';
const LOCATION_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_ID = '66666666-6666-4666-8666-666666666666';
const LP_ID = '77777777-7777-4777-8777-777777777777';
const LP_ID_2 = '77777777-7777-4777-8777-777777777778';
const COUNT_LINE_ID = '88888888-8888-4888-8888-888888888888';
const NEW_LP_ID = '99999999-9999-4999-8999-999999999999';
const ADJUSTMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADJUSTMENT_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const SIGNATURE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ApplyLine = {
  id: string;
  session_id: string;
  warehouse_id: string;
  session_site_id: string | null;
  session_status: string;
  location_id: string;
  item_id: string;
  lp_id: string | null;
  system_qty: string;
  counted_qty: string | null;
  variance_qty: string | null;
  status: CountLineStatus;
};

type QueryCall = { sql: string; params: readonly unknown[] };

let client: QueryClient;
let queries: QueryCall[];
let systemQty: string;
let returnedCountedQty: string;
let returnedVarianceQty: string;
let applyLine: ApplyLine;
let shrinkageLps: Array<{
  id: string;
  site_id: string | null;
  status: string;
  quantity: string;
  reserved_qty: string;
  uom: string;
}>;
let stockAdjustmentIds: string[];

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../../lib/warehouse/lp-create', () => ({
  makeLpNumber: vi.fn(() => 'LP-ADJ-0001'),
  makeStockMoveNumber: vi.fn((transactionId: string) => `SM-${transactionId.replaceAll('-', '').slice(0, 20).toUpperCase()}`),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: SIGNATURE_ID,
    signerUserId: USER_ID,
    intent: 'warehouse.stock.adjust',
    subjectHash: 'hash',
    signedAt: '2026-06-24T10:00:00.000Z',
    auditEventId: 123,
    nonce: 'nonce',
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeApplyLine(overrides: Partial<ApplyLine> = {}): ApplyLine {
  return {
    id: COUNT_LINE_ID,
    session_id: SESSION_ID,
    warehouse_id: WAREHOUSE_ID,
    session_site_id: SITE_ID,
    session_status: 'open',
    location_id: LOCATION_ID,
    item_id: ITEM_ID,
    lp_id: LP_ID,
    system_qty: '5',
    counted_qty: '8',
    variance_qty: '3',
    status: 'counted',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (n.startsWith('select id::text from public.count_sessions')) {
        return { rows: [{ id: SESSION_ID }], rowCount: 1 };
      }

      if (n.startsWith('select coalesce(sum(inv.available_qty)')) {
        return { rows: [{ system_qty: systemQty, uom: 'kg' }], rowCount: 1 };
      }

      if (n.startsWith('select id::text from public.count_lines')) {
        return { rows: [], rowCount: 0 };
      }

      if (n.startsWith('insert into public.count_lines')) {
        returnedCountedQty = String(params[5]);
        returnedVarianceQty = String(params[6]);
        return { rows: [{ id: COUNT_LINE_ID }], rowCount: 1 };
      }

      if (n.startsWith('update public.count_lines') && n.includes('system_qty')) {
        returnedCountedQty = String(params[2]);
        returnedVarianceQty = String(params[3]);
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('select cl.id::text') && n.includes('for update of cl')) {
        return { rows: [applyLine], rowCount: 1 };
      }

      if (n.startsWith('select cl.id::text') && n.includes('left join public.locations')) {
        return {
          rows: [{
            id: COUNT_LINE_ID,
            session_id: SESSION_ID,
            location_id: LOCATION_ID,
            location_code: 'A-01',
            item_id: ITEM_ID,
            item_code: 'RM-001',
            item_name: 'Raw material',
            lp_id: null,
            lp_number: null,
            counted_qty: returnedCountedQty,
            variance_qty: returnedVarianceQty,
            status: 'counted',
            uom: 'kg',
          }],
          rowCount: 1,
        };
      }

      if (n.startsWith('select coalesce( (select min(inv.uom)')) {
        return { rows: [{ uom: 'kg' }], rowCount: 1 };
      }

      if (n.startsWith("select after_state ->> 'batch_number'")) {
        return { rows: [], rowCount: 0 };
      }

      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: NEW_LP_ID }], rowCount: 1 };
      }

      if (n.startsWith('select lp.id::text') && n.includes('for update')) {
        return { rows: shrinkageLps, rowCount: shrinkageLps.length };
      }

      if (n.startsWith('update public.license_plates')) {
        return {
          rows: [{
            id: String(params[0]),
            quantity: '0',
            status: 'destroyed',
          }],
          rowCount: 1,
        };
      }

      if (n.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.stock_adjustments')) {
        const id = stockAdjustmentIds.shift() ?? ADJUSTMENT_ID;
        return { rows: [{ id }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.stock_moves')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('update public.count_lines') && n.includes("status = 'applied'")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

beforeEach(async () => {
  queries = [];
  systemQty = '5';
  returnedCountedQty = '0';
  returnedVarianceQty = '0';
  applyLine = makeApplyLine();
  shrinkageLps = [{
    id: LP_ID,
    site_id: SITE_ID,
    status: 'available',
    quantity: '9',
    reserved_qty: '0',
    uom: 'kg',
  }];
  stockAdjustmentIds = [ADJUSTMENT_ID, ADJUSTMENT_ID_2];
  client = makeClient();

  const { signEvent } = await import('@monopilot/e-sign');
  vi.mocked(signEvent).mockClear();
});

describe('stock count actions', () => {
  it('computes variance_qty as countedQty minus system_qty without exposing system_qty', async () => {
    systemQty = '5';

    const result = await recordCount({
      sessionId: SESSION_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      countedQty: '8',
    });

    expect(result).toMatchObject({
      id: COUNT_LINE_ID,
      countedQty: '8',
      varianceQty: '3',
      status: 'counted',
    });
    expect('systemQty' in result).toBe(false);

    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.count_lines'));
    expect(insert?.params).toEqual([SESSION_ID, LOCATION_ID, ITEM_ID, null, '5', '8', '3', USER_ID]);
  });

  it('approveAndApplyVariance with positive variance mints a new adjustment LP', async () => {
    applyLine = makeApplyLine({ variance_qty: '4', counted_qty: '9', lp_id: null });

    const result = await approveAndApplyVariance({
      countLineId: COUNT_LINE_ID,
      signature: { password: '123456' },
    });

    expect(result).toMatchObject({
      countLineId: COUNT_LINE_ID,
      adjustmentId: ADJUSTMENT_ID,
      direction: 'increase',
      adjustmentQty: '4',
      lpId: NEW_LP_ID,
      esignRef: SIGNATURE_ID,
      status: 'applied',
    });

    const lpInsert = queries.find((q) => normalize(q.sql).startsWith('insert into public.license_plates'));
    expect(normalize(lpInsert!.sql)).toContain("'adjustment'");
    expect(lpInsert!.params).toEqual([
      SITE_ID,
      WAREHOUSE_ID,
      LOCATION_ID,
      'LP-ADJ-0001',
      ITEM_ID,
      '4',
      'kg',
      null,
      null,
      USER_ID,
    ]);
  });

  it("stale-system rejection: live on-hand drift triggers 'stock_changed_recount_required'", async () => {
    applyLine = makeApplyLine({ system_qty: '5', counted_qty: '8', variance_qty: '3' });
    systemQty = '6';

    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '123456' } }),
    ).rejects.toThrow('stock_changed_recount_required');

    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('approveAndApplyVariance with negative variance reduces on-hand LP quantity', async () => {
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    const result = await approveAndApplyVariance({
      countLineId: COUNT_LINE_ID,
      signature: { password: '123456' },
    });

    expect(result).toMatchObject({
      direction: 'decrease',
      adjustmentQty: '2',
      lpId: LP_ID,
    });

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdate?.params).toEqual([LP_ID, '2', USER_ID, 'destroyed']);
  });

  it('multi-LP FEFO shrinkage drain spreads a reduction across LPs in order', async () => {
    systemQty = '9';
    applyLine = makeApplyLine({ system_qty: '9', counted_qty: '2', variance_qty: '-7', lp_id: null });
    shrinkageLps = [
      {
        id: LP_ID,
        site_id: SITE_ID,
        status: 'available',
        quantity: '5',
        reserved_qty: '0',
        uom: 'kg',
      },
      {
        id: LP_ID_2,
        site_id: SITE_ID,
        status: 'available',
        quantity: '6',
        reserved_qty: '0',
        uom: 'kg',
      },
    ];

    const result = await approveAndApplyVariance({
      countLineId: COUNT_LINE_ID,
      signature: { password: '123456' },
    });

    expect(result).toMatchObject({
      direction: 'decrease',
      adjustmentQty: '7',
      lpId: LP_ID,
    });

    const lpUpdates = queries.filter((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdates.map((q) => q.params)).toEqual([
      [LP_ID, '5', USER_ID, 'destroyed'],
      [LP_ID_2, '2', USER_ID, 'destroyed'],
    ]);

    const historyInserts = queries.filter((q) => normalize(q.sql).startsWith('insert into public.lp_state_history'));
    expect(historyInserts).toHaveLength(2);

    const adjustmentInserts = queries.filter((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'));
    expect(adjustmentInserts).toHaveLength(2);
    expect(adjustmentInserts.map((q) => [q.params[4], q.params[5], q.params[9]])).toEqual([
      [LP_ID, '5', USER_ID],
      [LP_ID_2, '2', USER_ID],
    ]);

    const stockMoves = queries.filter((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMoves).toHaveLength(2);
    expect(stockMoves.map((q) => [q.params[2], q.params[3], q.params[4], q.params[5]])).toEqual([
      [LP_ID, LOCATION_ID, null, '-5'],
      [LP_ID_2, LOCATION_ID, null, '-2'],
    ]);
  });

  it("apply blocked on cancelled session with 'count_session_not_open'", async () => {
    applyLine = makeApplyLine({ session_status: 'cancelled' });

    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '123456' } }),
    ).rejects.toThrow('count_session_not_open');

    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'))).toBe(false);
  });

  it('minted adjustment LP carries site_id', async () => {
    applyLine = makeApplyLine({ variance_qty: '1', counted_qty: '6', lp_id: null, session_site_id: SITE_ID });

    await approveAndApplyVariance({
      countLineId: COUNT_LINE_ID,
      signature: { password: '123456' },
    });

    const lpInsert = queries.find((q) => normalize(q.sql).startsWith('insert into public.license_plates'));
    expect(lpInsert?.params[0]).toBe(SITE_ID);
  });

  it('stock_moves adjustment row is written in the apply transaction', async () => {
    applyLine = makeApplyLine({ variance_qty: '4', counted_qty: '9', lp_id: null });

    await approveAndApplyVariance({
      countLineId: COUNT_LINE_ID,
      signature: { password: '123456' },
    });

    const stockMove = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMove?.params[0]).toBe(SITE_ID);
    expect(stockMove?.params[2]).toBe(NEW_LP_ID);
    expect(stockMove?.params[3]).toBe(null);
    expect(stockMove?.params[4]).toBe(LOCATION_ID);
    expect(stockMove?.params[5]).toBe('4');
    expect(stockMove?.params[6]).toBe('kg');
    expect(stockMove?.params[10]).toBe(USER_ID);
  });

  it('approveAndApplyVariance without a signature is rejected', async () => {
    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '' } }),
    ).rejects.toThrow('signature_required');

    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });

  it('approveAndApplyVariance on an already-applied line throws an idempotent error', async () => {
    applyLine = makeApplyLine({ status: 'applied' });

    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '123456' } }),
    ).rejects.toThrow('variance_already_applied');

    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'))).toBe(false);
  });
});
