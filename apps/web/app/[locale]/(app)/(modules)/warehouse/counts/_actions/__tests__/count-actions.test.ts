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
const COUNT_LINE_ID = '88888888-8888-4888-8888-888888888888';
const NEW_LP_ID = '99999999-9999-4999-8999-999999999999';
const ADJUSTMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIGNATURE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../../lib/warehouse/lp-create', () => ({
  makeLpNumber: vi.fn(() => 'LP-ADJ-0001'),
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

      if (n.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: NEW_LP_ID }], rowCount: 1 };
      }

      if (n.startsWith('select lp.id::text') && n.includes('for update')) {
        return {
          rows: [{
            id: LP_ID,
            site_id: null,
            status: 'available',
            quantity: '9',
            reserved_qty: '0',
            uom: 'kg',
          }],
          rowCount: 1,
        };
      }

      if (n.startsWith('update public.license_plates')) {
        return { rows: [{ id: LP_ID, quantity: '7', status: 'available' }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      if (n.startsWith('insert into public.stock_adjustments')) {
        return { rows: [{ id: ADJUSTMENT_ID }], rowCount: 1 };
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
    expect(insert?.params).toEqual([SESSION_ID, LOCATION_ID, ITEM_ID, null, '5', '8', '3']);
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
    expect(lpInsert!.params).toEqual([WAREHOUSE_ID, LOCATION_ID, 'LP-ADJ-0001', ITEM_ID, '4', 'kg', USER_ID]);
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
