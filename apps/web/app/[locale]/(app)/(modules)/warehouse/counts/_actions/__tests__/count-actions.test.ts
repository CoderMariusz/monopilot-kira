import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('../../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
}));

import { revalidatePath } from 'next/cache';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { getActiveSiteId } from '../../../../../../../../lib/site/site-context';
import { approveAndApplyVariance, closeCountSession, createCountSession, getCountSession, listCountSessions, recordCount } from '../count-actions';
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
/** Configurable count-variance WARN threshold (percent) the mock returns. */
let countVarianceWarnPct: string;
/** Session row returned by recordCount FOR UPDATE read. */
let sessionStatus: string;
let sessionWarehouseId: string;
let locationInWarehouse: boolean;
let itemExists: boolean;
let activeHold: boolean;
/**
 * Controls what app.user_can_see_site returns for the session detail
 * site-gate query (F1 cross-site inventory leak fix). Default true (visible).
 */
let canSeeSite: boolean;
/** When false, SUPERVISOR_ID has no warehouse.stock.adjust grant in the org. */
let supervisorHasOrgGrant: boolean;

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

const verifyPin = vi.fn(async () => true as true | false | 'locked');
vi.mock('../../../../../../../../../../packages/auth/src/verify-pin.js', () => ({
  verifyPin: (...args: unknown[]) => verifyPin(...(args as [])),
}));

vi.mock('../../../../../../../../lib/warehouse/lp-create', () => ({
  makeLpNumber: vi.fn(() => 'LP-ADJ-0001'),
  makeStockMoveNumber: vi.fn((transactionId: string) => `SM-${transactionId.replaceAll('-', '').slice(0, 20).toUpperCase()}`),
}));

const SUPERVISOR_ID = '99999999-9999-4999-8999-999999999999';

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

function resolveQtyKgForTest(qty: string, uom: string): string {
  const factors: Record<string, number> = { kg: 1, each: 0.5, box: 12 };
  const factor = factors[uom.toLowerCase()] ?? 1;
  return String(Number(qty) * factor);
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
        const requestedUserId = params[0];
        if (requestedUserId === SUPERVISOR_ID && !supervisorHasOrgGrant) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (n.includes('from public.user_pins')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (n.startsWith('select id::text') && n.includes('from public.count_sessions') && n.includes('for update')) {
        return {
          rows: [{
            id: SESSION_ID,
            status: sessionStatus,
            warehouse_id: sessionWarehouseId,
            site_id: SITE_ID,
          }],
          rowCount: 1,
        };
      }

      if (n.startsWith('select id::text from public.locations')) {
        return locationInWarehouse ? { rows: [{ id: LOCATION_ID }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.startsWith('select id::text from public.items')) {
        return itemExists ? { rows: [{ id: ITEM_ID }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.startsWith('update public.count_sessions') && n.includes("status = 'closed'")) {
        return sessionStatus === 'closed' || sessionStatus === 'cancelled'
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: SESSION_ID }], rowCount: 1 };
      }

      if (n.startsWith('select id::text from public.count_sessions')) {
        return { rows: [{ id: SESSION_ID }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.count_sessions')) {
        return { rows: [{ id: SESSION_ID }], rowCount: 1 };
      }

      if (n.startsWith('select site_id::text from public.warehouses')) {
        return { rows: [{ site_id: SITE_ID }], rowCount: 1 };
      }

      if (n.startsWith('select cs.id::text') && n.includes('from public.count_sessions cs')) {
        return {
          rows: [{
            id: SESSION_ID,
            warehouse_id: WAREHOUSE_ID,
            warehouse_code: 'WH-01',
            count_type: 'cycle',
            status: 'open',
            created_at: new Date('2026-06-24T10:00:00.000Z'),
            line_count: 0,
            counted_line_count: 0,
            variance_line_count: 0,
            variance_qty: '0',
          }],
          rowCount: 1,
        };
      }

      if (n.startsWith('select coalesce(sum(inv.available_qty)')) {
        return { rows: [{ system_qty: systemQty, uom: 'kg' }], rowCount: 1 };
      }

      if (n.includes("feature_flags->>'count_variance_warn_pct'")) {
        return { rows: [{ warn_pct: countVarianceWarnPct }], rowCount: 1 };
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

      if (n.includes('from public.v_active_holds')) {
        return activeHold
          ? { rows: [{ hold_number: 'HLD-0001', priority: 'critical' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
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

      if (n.includes('from public.items i') && n.includes('as qty_kg')) {
        const qty = String(params?.[0] ?? '0');
        const uom = String(params?.[1] ?? 'kg');
        return { rows: [{ qty_kg: resolveQtyKgForTest(qty, uom), resolved: true }], rowCount: 1 };
      }
      if (n.includes('with existing as materialized') && n.includes('avg_cost_used')) {
        const qty = Number(params?.[2] ?? 0);
        return { rows: [{ avg_cost_used: '5', value_debited: String(qty * 5) }], rowCount: 1 };
      }
      if (n.includes('with existing as materialized') && n.includes('delta_value')) {
        const qty = Number(params?.[2] ?? 0);
        return { rows: [{ delta_value: String(qty * 5) }], rowCount: 1 };
      }
      if (n.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: String(params?.[2] ?? '0'), totalValue: String(params?.[3] ?? '0'), clamped: false }], rowCount: 1 };
      }

      if (n.startsWith('update public.count_lines') && n.includes("status = 'applied'")) {
        return { rows: [], rowCount: 1 };
      }

      if (n.includes('app.user_can_see_site')) {
        return { rows: [{ can_see: canSeeSite }], rowCount: 1 };
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
  // High default so pre-existing recordCount cases never trip the soft warning;
  // the variance-warning tests set this explicitly.
  countVarianceWarnPct = '100';
  sessionStatus = 'open';
  sessionWarehouseId = WAREHOUSE_ID;
  locationInWarehouse = true;
  itemExists = true;
  activeHold = false;
  canSeeSite = true;
  supervisorHasOrgGrant = true;
  client = makeClient();

  const { signEvent } = await import('@monopilot/e-sign');
  vi.mocked(signEvent).mockClear();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(revalidateLocalized).mockClear();
  vi.mocked(getActiveSiteId).mockResolvedValue(SITE_ID);
  verifyPin.mockReset();
  verifyPin.mockResolvedValue(true);
});

function decreaseVarianceInput(overrides: Partial<Parameters<typeof approveAndApplyVariance>[0]> = {}) {
  return {
    countLineId: COUNT_LINE_ID,
    signature: { password: '123456' },
    supervisorUserId: SUPERVISOR_ID,
    supervisorPin: '654321',
    ...overrides,
  };
}

describe('stock count actions', () => {
  it('revalidates the sessions list after creating a count session', async () => {
    const result = await createCountSession({ warehouseId: WAREHOUSE_ID, countType: 'cycle' });

    expect(result).toBe(SESSION_ID);
    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.count_sessions'));
    expect(normalize(insert!.sql)).toContain('org_id, site_id, warehouse_id');
    expect(insert!.params).toEqual([SITE_ID, WAREHOUSE_ID, 'cycle']);
    expect(revalidateLocalized).toHaveBeenCalledWith('/warehouse/counts', 'page');
  });

  it('filters count session LIST reads to the active site', async () => {
    await listCountSessions();

    expect(getActiveSiteId).toHaveBeenCalledWith({ client });
    const listRead = queries.find((q) => normalize(q.sql).startsWith('select cs.id::text') && normalize(q.sql).includes('cs.site_id = $1::uuid'));
    expect(listRead).toBeTruthy();
    expect(listRead!.params).toEqual([SITE_ID]);
  });

  it('F4: resolves count session DETAIL org-wide (no active-site gate)', async () => {
    vi.mocked(getActiveSiteId).mockResolvedValue(null);
    await getCountSession(SESSION_ID);

    const detailRead = queries.find(
      (q) =>
        normalize(q.sql).startsWith('select cs.id::text') &&
        normalize(q.sql).includes('from public.count_sessions cs') &&
        !normalize(q.sql).includes('cs.site_id ='),
    );
    expect(detailRead).toBeTruthy();
    expect(detailRead!.params).toEqual([SESSION_ID]);
  });

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

  it('emits a soft variance warning when |variance%| exceeds the configured threshold', async () => {
    // system 10, counted 13 → variance +3 → 30% > 10% threshold → WARN fires.
    systemQty = '10';
    countVarianceWarnPct = '10';

    const result = await recordCount({
      sessionId: SESSION_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      countedQty: '13',
    });

    expect(result.varianceQty).toBe('3');
    expect(result.varianceWarning).toEqual({
      varianceExceedsThreshold: true,
      reasonCode: 'count_variance_over_threshold',
      variancePct: '30',
      warnPct: '10',
    });
    // It is a WARN, not a block: the count line was still recorded.
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.count_lines'))).toBe(true);
  });

  it('fires the warning the same way for an under-count (negative variance) past threshold', async () => {
    // system 10, counted 8 → variance -2 → 20% > 10% threshold → WARN fires.
    systemQty = '10';
    countVarianceWarnPct = '10';

    const result = await recordCount({
      sessionId: SESSION_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      countedQty: '8',
    });

    expect(result.varianceQty).toBe('-2');
    expect(result.varianceWarning).toMatchObject({
      varianceExceedsThreshold: true,
      reasonCode: 'count_variance_over_threshold',
      variancePct: '20',
    });
  });

  it('does NOT emit a variance warning when |variance%| is at or under the threshold', async () => {
    // system 10, counted 11 → variance +1 → 10% == 10% threshold → no WARN.
    systemQty = '10';
    countVarianceWarnPct = '10';

    const result = await recordCount({
      sessionId: SESSION_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      countedQty: '11',
    });

    expect(result.varianceQty).toBe('1');
    expect(result.varianceWarning).toBeUndefined();
  });

  it('disables the variance warning entirely when the threshold is configured to 0', async () => {
    // Huge variance but threshold 0 → opt-out → no WARN.
    systemQty = '10';
    countVarianceWarnPct = '0';

    const result = await recordCount({
      sessionId: SESSION_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      countedQty: '50',
    });

    expect(result.varianceWarning).toBeUndefined();
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
    expect(normalize(lpInsert!.sql)).toContain("'pending'");
    expect(normalize(lpInsert!.sql)).not.toContain("'released'");
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

    const wacWrite = queries.find((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite?.params).toEqual([ORG_ID, ITEM_ID, '4', '20', USER_ID, SITE_ID, 'GBP']);
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

    const result = await approveAndApplyVariance(decreaseVarianceInput());

    expect(result).toMatchObject({
      direction: 'decrease',
      adjustmentQty: '2',
      lpId: LP_ID,
    });

    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    expect(lpUpdate?.params).toEqual([LP_ID, '2', USER_ID, 'destroyed']);

    const wacWrite = queries.find((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite?.params?.[2]).toBe('-2');
  });

  it('mixed-UoM shrinkage debits WAC per leg using each LP UoM', async () => {
    const LP_EACH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const LP_BOX = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const LP_KG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    systemQty = '3';
    applyLine = makeApplyLine({ system_qty: '3', counted_qty: '0', variance_qty: '-3', lp_id: null });
    shrinkageLps = [
      { id: LP_EACH, site_id: SITE_ID, status: 'available', quantity: '1', reserved_qty: '0', uom: 'each' },
      { id: LP_BOX, site_id: SITE_ID, status: 'available', quantity: '1', reserved_qty: '0', uom: 'box' },
      { id: LP_KG, site_id: SITE_ID, status: 'available', quantity: '1', reserved_qty: '0', uom: 'kg' },
    ];
    stockAdjustmentIds = ['adj-each', 'adj-box', 'adj-kg'];

    const result = await approveAndApplyVariance(decreaseVarianceInput());

    expect(result).toMatchObject({
      direction: 'decrease',
      adjustmentQty: '3',
      lpId: LP_EACH,
    });

    const resolveCalls = queries.filter((q) => normalize(q.sql).includes('from public.items i') && normalize(q.sql).includes('as qty_kg'));
    expect(resolveCalls.map((q) => [q.params[0], q.params[1]])).toEqual([
      ['1', 'each'],
      ['1', 'box'],
      ['1', 'kg'],
    ]);

    const wacReads = queries.filter((q) => normalize(q.sql).includes('with existing as materialized') && normalize(q.sql).includes('avg_cost_used'));
    expect(wacReads.map((q) => q.params[2])).toEqual(['0.5', '12', '1']);

    const wacWrites = queries.filter((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrites).toHaveLength(3);
    const debitedKg = wacWrites.map((q) => Number(q.params[2]));
    expect(debitedKg.reduce((sum, qty) => sum + qty, 0)).toBeCloseTo(-13.5);
    expect(debitedKg).toEqual([-0.5, -12, -1]);
  });

  it('approveAndApplyVariance blocks shrinkage when the LP has an active hold', async () => {
    activeHold = true;
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    await expect(approveAndApplyVariance(decreaseVarianceInput())).rejects.toMatchObject({ code: 'QA_HOLD_ACTIVE' });

    expect(queries.some((q) => normalize(q.sql).includes('from public.v_active_holds'))).toBe(true);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
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

    const result = await approveAndApplyVariance(decreaseVarianceInput());

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
    expect(adjustmentInserts.every((q) => normalize(q.sql).includes('warehouse_id, site_id, lp_id'))).toBe(true);
    expect(adjustmentInserts.map((q) => [q.params[5], q.params[6], q.params[10], q.params[11]])).toEqual([
      [LP_ID, '5', USER_ID, SUPERVISOR_ID],
      [LP_ID_2, '2', USER_ID, SUPERVISOR_ID],
    ]);

    const stockMoves = queries.filter((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMoves).toHaveLength(2);
    expect(stockMoves.every((q) => normalize(q.sql).includes('on conflict (org_id, transaction_id) do nothing'))).toBe(true);
    for (const move of stockMoves) {
      const extParam = move.params.find((p) => typeof p === 'string' && p.includes('stock_adjustment_id')) as string;
      expect(extParam).toContain('supervisor_approved_by');
      expect(extParam).toContain(SUPERVISOR_ID);
    }
    expect(stockMoves.map((q) => [q.params[2], q.params[3], q.params[4], q.params[5]])).toEqual([
      [LP_ID, LOCATION_ID, null, '-5'],
      [LP_ID_2, LOCATION_ID, null, '-2'],
    ]);
    const shrinkageSelect = queries.find((q) => normalize(q.sql).startsWith('select lp.id::text') && normalize(q.sql).includes('for update'));
    expect(normalize(shrinkageSelect!.sql)).toContain('lp.warehouse_id = $4::uuid');
    expect(shrinkageSelect!.params[3]).toBe(WAREHOUSE_ID);
    expect(verifyPin).toHaveBeenCalledWith(SUPERVISOR_ID, '654321', { client });

    const wacWrites = queries.filter((q) => normalize(q.sql).includes('insert into public.item_wac_state'));
    expect(wacWrites).toHaveLength(2);
    expect(wacWrites.map((q) => q.params[2])).toEqual(['-5', '-2']);
    expect(wacWrites.reduce((sum, q) => sum + Number(q.params[2]), 0)).toBe(-7);
  });

  it("shrinkage apply rejects without supervisor PIN as 'supervisor_pin_required'", async () => {
    systemQty = '9';
    applyLine = makeApplyLine({ system_qty: '9', counted_qty: '2', variance_qty: '-7', lp_id: null });

    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '123456' } }),
    ).rejects.toThrow('supervisor_pin_required');

    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('single-operator large shrinkage write-off is rejected without a distinct supervisor', async () => {
    systemQty = '1000';
    applyLine = makeApplyLine({ system_qty: '1000', counted_qty: '0', variance_qty: '-1000', lp_id: null });

    await expect(
      approveAndApplyVariance({ countLineId: COUNT_LINE_ID, signature: { password: '123456' } }),
    ).rejects.toThrow('supervisor_pin_required');

    expect(verifyPin).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'))).toBe(false);
  });

  it("shrinkage apply rejects supervisor self-approval (SoD) as 'supervisor_self_approval'", async () => {
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    await expect(
      approveAndApplyVariance(decreaseVarianceInput({ supervisorUserId: USER_ID })),
    ).rejects.toThrow('supervisor_self_approval');

    expect(verifyPin).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it("shrinkage apply rejects a cross-org supervisor before touching user_pins as 'supervisor_forbidden'", async () => {
    supervisorHasOrgGrant = false;
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    await expect(approveAndApplyVariance(decreaseVarianceInput())).rejects.toThrow('supervisor_forbidden');

    expect(verifyPin).not.toHaveBeenCalled();
    expect(queries.some((q) => normalize(q.sql).includes('from public.user_pins'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it("shrinkage apply rejects an invalid supervisor PIN as 'supervisor_pin_invalid'", async () => {
    verifyPin.mockResolvedValue(false);
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    await expect(approveAndApplyVariance(decreaseVarianceInput())).rejects.toThrow('supervisor_pin_invalid');

    expect(verifyPin).toHaveBeenCalledWith(SUPERVISOR_ID, '654321', expect.objectContaining({ client }));
    expect(verifyPin).not.toHaveBeenCalledWith(USER_ID, expect.anything(), expect.anything());
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('shrinkage apply with distinct supervisor + valid PIN records approved_by on the adjustment', async () => {
    applyLine = makeApplyLine({ variance_qty: '-2', counted_qty: '3', lp_id: LP_ID });

    await approveAndApplyVariance(decreaseVarianceInput());

    const adjustment = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_adjustments'));
    expect(adjustment?.params[10]).toBe(USER_ID);
    expect(adjustment?.params[11]).toBe(SUPERVISOR_ID);

    const move = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    const extParam = move?.params.find((p) => typeof p === 'string' && p.includes('stock_adjustment_id')) as string;
    expect(extParam).toContain('supervisor_approved_by');
    expect(extParam).toContain(SUPERVISOR_ID);
    expect(verifyPin).toHaveBeenCalledWith(SUPERVISOR_ID, '654321', { client });
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

  it('recordCount rejects a closed session', async () => {
    sessionStatus = 'closed';

    await expect(
      recordCount({
        sessionId: SESSION_ID,
        locationId: LOCATION_ID,
        itemId: ITEM_ID,
        countedQty: '8',
      }),
    ).rejects.toThrow('count_session_not_open');
  });

  it('recordCount rejects a location outside the session warehouse', async () => {
    locationInWarehouse = false;

    await expect(
      recordCount({
        sessionId: SESSION_ID,
        locationId: LOCATION_ID,
        itemId: ITEM_ID,
        countedQty: '8',
      }),
    ).rejects.toThrow('location_not_in_warehouse');
  });

  it('closeCountSession closes an open session and revalidates the list', async () => {
    sessionStatus = 'open';

    const result = await closeCountSession(SESSION_ID);

    expect(result).toBe(SESSION_ID);
    expect(revalidateLocalized).toHaveBeenCalledWith('/warehouse/counts', 'page');
    const update = queries.find((q) => normalize(q.sql).includes("status = 'closed'"));
    expect(update?.params).toEqual([SESSION_ID, USER_ID]);
  });

  it('closeCountSession throws when the session is not closable', async () => {
    sessionStatus = 'closed';

    await expect(closeCountSession(SESSION_ID)).rejects.toThrow('count_session_not_closable');
  });

  it('F1: getCountSession returns full lines when user_can_see_site passes for the session site', async () => {
    canSeeSite = true;

    const result = await getCountSession(SESSION_ID);

    // Lines are returned and linesRestricted is falsy.
    expect(result.linesRestricted).toBeFalsy();
    expect(Array.isArray(result.lines)).toBe(true);
    // The site-visibility check query was issued.
    const siteCheck = queries.find((q) => normalize(q.sql).includes('app.user_can_see_site'));
    expect(siteCheck).toBeTruthy();
    // The count_lines select was also issued (lines fetched).
    const linesRead = queries.find(
      (q) =>
        normalize(q.sql).startsWith('select cl.id::text') &&
        normalize(q.sql).includes('left join public.locations'),
    );
    expect(linesRead).toBeTruthy();
  });

  it('F1: getCountSession returns header + linesRestricted + no quantities when user_can_see_site is false', async () => {
    canSeeSite = false;

    const result = await getCountSession(SESSION_ID);

    // Header fields are present.
    expect(result.id).toBe(SESSION_ID);
    expect(result.warehouseId).toBe(WAREHOUSE_ID);
    expect(result.status).toBe('open');
    // Lines are suppressed.
    expect(result.linesRestricted).toBe(true);
    expect(result.lines).toEqual([]);
    // No per-line quantities in the payload (lines array is empty).
    // Note: the session header carries varianceQty (an aggregate — not a
    // per-item stock-level value) which is acceptable to return even for
    // site-restricted users (it's already visible on the list page).
    const lines = result.lines;
    expect(lines.every((l) => !('countedQty' in l) && !('varianceQty' in l))).toBe(true);
    // The count_lines select was NOT issued.
    const linesRead = queries.find(
      (q) =>
        normalize(q.sql).startsWith('select cl.id::text') &&
        normalize(q.sql).includes('left join public.locations'),
    );
    expect(linesRead).toBeUndefined();
  });
});
