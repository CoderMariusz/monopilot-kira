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

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  rangeRow: { min_temp_c: string; max_temp_c: string; requires_check: boolean } | null;
  calls: QueryCall[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

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

describe('submitConditionCheck', () => {
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
      USER_ID,
    ]);

    const update = callContaining('set hold_id');
    expect(update.params).toEqual([CHECK_ID, HOLD_ID]);
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
      USER_ID,
    ]);
  });
});

function makeClient(options: {
  rangeRow: { min_temp_c: string; max_temp_c: string; requires_check: boolean } | null;
}): FakeClient {
  const calls: QueryCall[] = [];
  return {
    rangeRow: options.rangeRow,
    calls,
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.product_temp_ranges')) {
        return {
          rows: options.rangeRow
            ? [{ id: 'range-1', ...options.rangeRow }]
            : [],
          rowCount: options.rangeRow ? 1 : 0,
        };
      }

      if (q.includes('from public.grn_items') || q.includes('from public.license_plates')) {
        return { rows: [{ site_id: SITE_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.delivery_condition_checks')) {
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

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
