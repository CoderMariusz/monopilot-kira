import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const ROUTING_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };
let calls: QueryCall[] = [];

const client = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ sql: normalized, params });

    if (normalized.includes('select id from public.routings')) {
      return { rows: [{ id: ROUTING_ID }], rowCount: 1 };
    }
    if (normalized.includes('with op_rates') && normalized.includes('op_code') && !normalized.includes('round(coalesce(sum(')) {
      return {
        rows: [
          {
            op_no: 1,
            op_code: 'MIX',
            op_name: 'Mixing',
            setup_cost: '50.00',
            run_cost: '27.78',
            op_cost: '77.78',
          },
        ],
        rowCount: 1,
      };
    }
    if (normalized.includes('round(coalesce(sum(')) {
      return { rows: [{ total: '77.78' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../_actions/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_actions/shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

describe('routingCostPreview crew rates', () => {
  beforeEach(() => {
    calls = [];
    client.query.mockClear();
  });

  it('returns crew-based setup/run/op totals and queries labor_rates from routing_operations.crew', async () => {
    const { routingCostPreview } = await import('../_actions/cost-preview');

    const result = await routingCostPreview({ routingId: ROUTING_ID, volume: 100 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.operations).toEqual([
      {
        opNo: 1,
        opCode: 'MIX',
        opName: 'Mixing',
        setupCost: '50.00',
        runCost: '27.78',
        opCost: '77.78',
      },
    ]);
    expect(result.data.totalCost).toBe('77.78');

    const opRateQuery = calls.find((call) => call.sql.includes('with op_rates') && call.sql.includes('op_code'));
    expect(opRateQuery?.sql).toContain('jsonb_to_recordset');
    expect(opRateQuery?.sql).toContain('public.labor_rates');
    expect(opRateQuery?.sql).toContain('jsonb_array_length');
    expect(opRateQuery?.sql).toContain('when o.cost_per_hour is not null');
  });
});
