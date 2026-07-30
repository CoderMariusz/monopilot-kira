import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _createHold } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _createHold: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../hold-actions', () => ({
  createHold: _createHold,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CHECK_ID = '33333333-3333-4333-8333-333333333333';
const HOLD_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const GRN_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const RANGE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  rangeRow: RangeRow | null;
  hasPermission: boolean;
  existingHoldId: string | null;
  calls: QueryCall[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};
type RangeRow = { min_temp_c: string | null; max_temp_c: string | null; requires_check: boolean };

let client: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  client = makeClient({ rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: true } });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client }),
  );
  _createHold.mockResolvedValue({
    ok: true,
    data: {
      id: HOLD_ID,
      holdNumber: 'HLD-00001000',
      referenceType: 'lp',
      referenceId: LP_ID,
      status: 'open',
      heldLpIds: [LP_ID],
    },
  });
});

describe('upsertProductTempRange', () => {
  it('[SFQ-127] rejects min > max and upserts one range per org/item', async () => {
    const { upsertProductTempRange } = await import('../cold-chain-actions');

    await expect(
      upsertProductTempRange({ itemId: ITEM_ID, minTempC: 8, maxTempC: 2, requiresCheck: true }),
    ).resolves.toEqual({ ok: false, error: 'invalid_input' });
    expect(callsContaining('insert into public.product_temp_ranges')).toHaveLength(0);

    const first = await upsertProductTempRange({
      itemId: ITEM_ID,
      minTempC: 0,
      maxTempC: 5,
      requiresCheck: true,
    });
    const second = await upsertProductTempRange({
      itemId: ITEM_ID,
      minTempC: 1,
      maxTempC: 4,
      requiresCheck: false,
    });

    expect(first).toEqual({ ok: true, id: RANGE_ID });
    expect(second).toEqual({ ok: true, id: RANGE_ID });
    const upserts = callsContaining('insert into public.product_temp_ranges');
    expect(upserts).toHaveLength(2);
    expect(normalize(upserts[0]!.sql)).toContain('on conflict (org_id, item_id) do update');
    expect(upserts[1]!.params).toEqual([ITEM_ID, 1, 4, false]);
  });
});

describe('submitConditionCheck', () => {
  it('returns forbidden when the caller lacks the quality inspection execute permission', async () => {
    client = makeClient({
      rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: true },
      hasPermission: false,
    });
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const result = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 3,
    });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(_createHold).not.toHaveBeenCalled();
    expect(indexOfCall('from public.product_temp_ranges')).toBe(-1);
    expect(indexOfCall('insert into public.delivery_condition_checks')).toBe(-1);
  });

  it('records an in-range delivery condition check without creating a hold', async () => {
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const result = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 3,
    });

    expect(result).toEqual({ ok: true, inRange: true });
    expect(_createHold).not.toHaveBeenCalled();

    const insert = callContaining('insert into public.delivery_condition_checks');
    expect(insert.params).toEqual([
      SITE_ID,
      GRN_ITEM_ID,
      LP_ID,
      ITEM_ID,
      3,
      0,
      5,
      true,
      null,
      null,
      USER_ID,
    ]);
    expect(indexOfCall('set hold_id')).toBe(-1);
  });

  it('creates a canonical quality hold and links it when the measured temperature is out of range', async () => {
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const result = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 8,
    });

    expect(result).toEqual({ ok: true, inRange: false, holdId: HOLD_ID });
    expect(_createHold).toHaveBeenCalledWith({
      referenceType: 'lp',
      referenceId: LP_ID,
      reasonText: 'Cold-chain breach: measured 8 C outside configured range 0 C to 5 C',
      priority: 'critical',
    });

    const insert = callContaining('insert into public.delivery_condition_checks');
    expect(insert.params).toEqual([
      SITE_ID,
      GRN_ITEM_ID,
      LP_ID,
      ITEM_ID,
      8,
      0,
      5,
      false,
      'Cold-chain breach: measured 8 C outside configured range 0 C to 5 C',
      HOLD_ID,
      USER_ID,
    ]);
    expect(indexOfCall('set hold_id')).toBe(-1);
  });

  it('evaluates a single-sided max-only range correctly', async () => {
    client = makeClient({ rangeRow: { min_temp_c: null, max_temp_c: '5', requires_check: true } });
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const passing = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 3,
    });
    const failing = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 8,
    });

    expect(passing).toEqual({ ok: true, inRange: true });
    expect(failing).toEqual({ ok: true, inRange: false, holdId: HOLD_ID });
    expect(_createHold).toHaveBeenCalledTimes(1);
    expect(_createHold).toHaveBeenCalledWith({
      referenceType: 'lp',
      referenceId: LP_ID,
      reasonText: 'Cold-chain breach: measured 8 C outside configured range at most 5 C',
      priority: 'critical',
    });

    const inserts = callsContaining('insert into public.delivery_condition_checks');
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.params).toEqual([
      SITE_ID,
      GRN_ITEM_ID,
      LP_ID,
      ITEM_ID,
      3,
      null,
      5,
      true,
      null,
      null,
      USER_ID,
    ]);
    expect(inserts[1]!.params).toEqual([
      SITE_ID,
      GRN_ITEM_ID,
      LP_ID,
      ITEM_ID,
      8,
      null,
      5,
      false,
      'Cold-chain breach: measured 8 C outside configured range at most 5 C',
      HOLD_ID,
      USER_ID,
    ]);
  });

  it('reuses an existing recent cold-chain hold for a repeated LP condition breach', async () => {
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const first = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 8,
    });
    const second = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 9,
    });

    expect(first).toEqual({ ok: true, inRange: false, holdId: HOLD_ID });
    expect(second).toEqual({ ok: true, inRange: false, holdId: HOLD_ID });
    expect(_createHold).toHaveBeenCalledTimes(1);
    expect(callsContaining('from public.quality_holds')).toHaveLength(2);

    const inserts = callsContaining('insert into public.delivery_condition_checks');
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.params[9]).toBe(HOLD_ID);
    expect(inserts[1]!.params[9]).toBe(HOLD_ID);
  });

  it('treats missing product temperature configuration as in-range and does not create a hold', async () => {
    client = makeClient({ rangeRow: null });
    const { submitConditionCheck } = await import('../cold-chain-actions');

    const result = await submitConditionCheck({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 18,
    });

    expect(result).toEqual({ ok: true, inRange: true });
    expect(_createHold).not.toHaveBeenCalled();

    const insert = callContaining('insert into public.delivery_condition_checks');
    expect(insert.params).toEqual([
      SITE_ID,
      GRN_ITEM_ID,
      LP_ID,
      ITEM_ID,
      18,
      null,
      null,
      true,
      null,
      null,
      USER_ID,
    ]);
  });

  it('[SFQ-128] honors disabled/unbounded checks and inclusive configured boundaries', async () => {
    const { submitConditionCheck } = await import('../cold-chain-actions');
    const cases: Array<{ rangeRow: RangeRow | null; measuredTempC: number; inRange: boolean }> = [
      { rangeRow: null, measuredTempC: 99, inRange: true },
      { rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: false }, measuredTempC: 99, inRange: true },
      { rangeRow: { min_temp_c: null, max_temp_c: null, requires_check: true }, measuredTempC: 99, inRange: true },
      { rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: true }, measuredTempC: 0, inRange: true },
      { rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: true }, measuredTempC: 5, inRange: true },
      { rangeRow: { min_temp_c: '0', max_temp_c: '5', requires_check: true }, measuredTempC: 5.1, inRange: false },
    ];

    for (const testCase of cases) {
      client = makeClient({ rangeRow: testCase.rangeRow });
      const result = await submitConditionCheck({
        grnItemId: GRN_ITEM_ID,
        lpId: LP_ID,
        itemId: ITEM_ID,
        measuredTempC: testCase.measuredTempC,
      });
      expect(result).toMatchObject({ ok: true, inRange: testCase.inRange });
    }
    expect(_createHold).toHaveBeenCalledTimes(1);
  });
});

function makeClient(options: {
  rangeRow: RangeRow | null;
  hasPermission?: boolean;
  existingHoldId?: string | null;
}): FakeClient {
  const calls: QueryCall[] = [];
  return {
    rangeRow: options.rangeRow,
    hasPermission: options.hasPermission ?? true,
    existingHoldId: options.existingHoldId ?? null,
    calls,
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return {
          rows: options.hasPermission === false ? [] : [{ ok: true }],
          rowCount: options.hasPermission === false ? 0 : 1,
        };
      }

      if (q.includes('from public.product_temp_ranges')) {
        return {
          rows: options.rangeRow
            ? [{ id: 'range-1', ...options.rangeRow }]
            : [],
          rowCount: options.rangeRow ? 1 : 0,
        };
      }

      if (q.startsWith('insert into public.product_temp_ranges')) {
        client.rangeRow = {
          min_temp_c: String(params[1]),
          max_temp_c: String(params[2]),
          requires_check: Boolean(params[3]),
        };
        return { rows: [{ id: RANGE_ID }], rowCount: 1 };
      }

      if (q.includes('from public.quality_holds')) {
        return {
          rows: client.existingHoldId ? [{ id: client.existingHoldId }] : [],
          rowCount: client.existingHoldId ? 1 : 0,
        };
      }

      if (q.includes('from public.grn_items') || q.includes('from public.license_plates')) {
        return { rows: [{ site_id: SITE_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.delivery_condition_checks')) {
        if (params[9]) client.existingHoldId = String(params[9]);
        return { rows: [{ id: CHECK_ID }], rowCount: 1 };
      }

      if (q.startsWith('update public.delivery_condition_checks')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function indexOfCall(fragment: string): number {
  return client.calls.findIndex((call) => callBlob(call).toLowerCase().includes(fragment.toLowerCase()));
}

function callContaining(fragment: string): QueryCall {
  const index = indexOfCall(fragment);
  expect(index, `Expected SQL call containing ${fragment}`).toBeGreaterThanOrEqual(0);
  return client.calls[index]!;
}

function callsContaining(fragment: string): QueryCall[] {
  return client.calls.filter((call) => callBlob(call).toLowerCase().includes(fragment.toLowerCase()));
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
