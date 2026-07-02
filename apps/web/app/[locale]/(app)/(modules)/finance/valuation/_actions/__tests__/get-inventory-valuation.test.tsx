import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInventoryValuation } from '../get-inventory-valuation';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];
let valuedRows: Array<Record<string, unknown>>;
let unvaluedRow: { lp_count: number; qty: string };

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    if (normalized.includes('group by item_id')) {
      return { rows: valuedRows, rowCount: valuedRows.length };
    }

    if (normalized.includes('count(*)::int as lp_count')) {
      return { rows: [unvaluedRow], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

beforeEach(() => {
  calls = [];
  valuedRows = [];
  unvaluedRow = { lp_count: 0, qty: '0' };
  client.query.mockClear();
});

describe('getInventoryValuation', () => {
  it('values base-kg LPs using WAC and LEFT JOINs cost rows', async () => {
    valuedRows = [
      {
        item_id: ITEM_ID,
        item_code: 'RM-BEEF',
        item_name: 'Beef trim',
        wac: '4.25',
        currency: 'GBP',
        qty_on_hand: '12.5',
        total_value: '53.125',
      },
    ];

    const result = await getInventoryValuation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual({
      rows: [
        {
          itemId: ITEM_ID,
          itemCode: 'RM-BEEF',
          itemName: 'Beef trim',
          qtyOnHand: '12.500000',
          wac: '4.25',
          totalValue: '53.1250',
          currency: 'GBP',
        },
      ],
      grandTotals: [{ currency: 'GBP', totalValue: '53.1250' }],
      unvalued: { lpCount: 0, qty: '0.000000' },
    });

    const valuationCalls = calls.filter((call) => call.sql.includes('with lp_valuation as'));
    expect(valuationCalls).toHaveLength(2);
    expect(valuationCalls.some((call) => call.sql.includes('group by item_id'))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes('count(*)::int as lp_count'))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes('left join public.item_wac_state wac'))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes('where lp.org_id = app.current_org_id()'))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes("when lp.uom = 'each'"))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes('sum(base_qty_kg * wac)'))).toBe(true);
    expect(valuationCalls.some((call) => call.sql.includes('sum(base_qty_kg)::text as qty_on_hand'))).toBe(true);
  });

  it('converts each/box LP quantities to base kg before applying WAC', async () => {
    valuedRows = [
      {
        item_id: ITEM_ID,
        item_code: 'FG-PACK',
        item_name: 'Retail pack',
        wac: '2',
        currency: 'GBP',
        qty_on_hand: '11',
        total_value: '22',
      },
    ];

    const result = await getInventoryValuation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 10 each × 0.5 kg + 2 box × 6 each/box × 0.5 kg = 5 + 6 = 11 kg; 11 × 2 = 22
    expect(result.data.rows).toEqual([
      {
        itemId: ITEM_ID,
        itemCode: 'FG-PACK',
        itemName: 'Retail pack',
        qtyOnHand: '11.000000',
        wac: '2',
        totalValue: '22.0000',
        currency: 'GBP',
      },
    ]);
    expect(result.data.unvalued).toEqual({ lpCount: 0, qty: '0.000000' });

    const valuedCall = calls.find((call) => call.sql.includes('group by item_id'));
    expect(valuedCall?.sql).toContain("when lp.uom = 'box'");
    expect(valuedCall?.sql).toContain('lp.quantity * i.each_per_box * i.net_qty_per_each');
  });

  it('excludes unconvertible UoM and missing-cost LPs into the unvalued bucket', async () => {
    valuedRows = [
      {
        item_id: ITEM_ID,
        item_code: 'RM-BEEF',
        item_name: 'Beef trim',
        wac: '5',
        currency: 'GBP',
        qty_on_hand: '2',
        total_value: '10',
      },
    ];
    unvaluedRow = { lp_count: 2, qty: '7' };

    const result = await getInventoryValuation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rows).toEqual([
      {
        itemId: ITEM_ID,
        itemCode: 'RM-BEEF',
        itemName: 'Beef trim',
        qtyOnHand: '2.000000',
        wac: '5',
        totalValue: '10.0000',
        currency: 'GBP',
      },
    ]);
    expect(result.data.unvalued).toEqual({ lpCount: 2, qty: '7.000000' });
    expect(result.data.grandTotals).toEqual([{ currency: 'GBP', totalValue: '10.0000' }]);

    const unvaluedCall = calls.find((call) => call.sql.includes('count(*)::int as lp_count'));
    expect(unvaluedCall?.sql).toContain('or base_qty_kg is null');
    expect(unvaluedCall?.sql).toContain('wac is null');
  });
});
