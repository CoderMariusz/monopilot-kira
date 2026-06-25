import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInventoryValuation } from '../get-inventory-valuation';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    if (normalized.includes('lp.product_id::text as item_id')) {
      return {
        rows: [
          {
            item_id: '33333333-3333-4333-8333-333333333333',
            item_code: 'RM-BEEF',
            item_name: 'Beef trim',
            qty_on_hand: '12.500000',
            wac: '4.250000',
            total_value: '53.1250',
            currency: '44444444-4444-4444-8444-444444444444',
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes('from ( select wac.currency_id::text as currency')) {
      return {
        rows: [{ currency: '44444444-4444-4444-8444-444444444444', total_value: '53.1250' }],
        rowCount: 1,
      };
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
  client.query.mockClear();
});

describe('getInventoryValuation', () => {
  it('returns item valuation rows and grand totals from org-scoped SQL', async () => {
    const result = await getInventoryValuation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual({
      rows: [
        {
          itemId: '33333333-3333-4333-8333-333333333333',
          itemCode: 'RM-BEEF',
          itemName: 'Beef trim',
          qtyOnHand: '12.500000',
          wac: '4.250000',
          totalValue: '53.1250',
          currency: '44444444-4444-4444-8444-444444444444',
        },
      ],
      grandTotals: [{ currency: '44444444-4444-4444-8444-444444444444', totalValue: '53.1250' }],
    });
    expect(calls.some((call) => call.sql.includes('join public.item_wac_state wac'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('where lp.org_id = app.current_org_id()'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('lp.quantity * wac.avg_cost'))).toBe(true);
  });
});
