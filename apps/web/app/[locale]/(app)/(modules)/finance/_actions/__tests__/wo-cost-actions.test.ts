import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCompletedWoCosts } from '../wo-cost-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ZERO_WO_ID = '33333333-3333-4333-8333-333333333333';
const COSTED_WO_ID = '44444444-4444-4444-8444-444444444444';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    if (normalized.includes('select wo.id::text as wo_id') && normalized.includes('limit 25')) {
      return {
        rows: [
          { wo_id: ZERO_WO_ID, completed_at: '2026-06-10T10:00:00.000Z' },
          { wo_id: COSTED_WO_ID, completed_at: '2026-06-11T10:00:00.000Z' },
        ],
        rowCount: 2,
      };
    }

    if (normalized.includes('coalesce(sum(o.qty_kg), 0)::text as output_kg')) {
      const woId = params?.[0];
      return {
        rows: [
          {
            wo_id: woId,
            wo_number: woId === COSTED_WO_ID ? 'WO-COSTED' : 'WO-ZERO',
            product_code: 'FG-001',
            product_name: 'Finished good',
            started_at: '2026-06-11T08:00:00.000Z',
            completed_at: '2026-06-11T09:00:00.000Z',
            output_kg: '10.000',
            waste_kg: '0',
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_material_consumption')) {
      if (params?.[0] === COSTED_WO_ID) {
        return {
          rows: [
            {
              item_code: 'FILM-KG',
              uom: null,
              raw_qty: '200',
              qty_kg: '1.000',
              cost_per_kg: '2.400000',
              unresolved_uom: false,
            },
            {
              item_code: 'FILM-EA',
              uom: 'each',
              raw_qty: '200',
              qty_kg: '0',
              cost_per_kg: '2.400000',
              unresolved_uom: true,
            },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.includes('from public.wo_operations')) {
      if (params?.[0] === COSTED_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'MIXING',
              row_key: 'MIXING',
              cost_mode: 'per_hour',
              cost_rate: '20.0000',
              currency: 'EUR',
              staffing_count: '1',
              setup_cost: null,
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.includes('from public.downtime_events')) {
      if (params?.[0] === COSTED_WO_ID) {
        return {
          rows: [
            {
              started_at: '2026-06-11T08:15:00.000Z',
              ended_at: '2026-06-11T08:45:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
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

beforeEach(() => {
  calls = [];
  client.query.mockClear();
});

describe('listCompletedWoCosts', () => {
  it('renders completed WOs with no computed cost inputs as flagged zero-cost rows', async () => {
    const result = await listCompletedWoCosts({ days: 30 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0]).toMatchObject({ woId: ZERO_WO_ID, zeroCost: true, totalCost: '0.0000' });

    const costed = result.data.rows.find((row) => row.woId === COSTED_WO_ID);
    expect(costed?.zeroCost).toBe(false);
    expect(costed?.laborBasis).toBe('planned_duration');
    expect(costed?.plannedRuntimeMin).toBe('60');
    expect(costed?.actualRuntimeMin).toBe('30.000000');
    expect(costed?.downtimeMin).toBe('30.000000');
    expect(costed?.labor?.runtimeMin).toBe('60.000');
    expect(costed?.labor?.cost).toBe('20.0000');
    expect(costed?.downtimeCost).toBe('10.0000');
    expect(costed?.totalCost).toBe('22.4000');
    expect(calls.some((call) => call.sql.includes('where wo.org_id = app.current_org_id()'))).toBe(true);
  });

  it('converts consumed material UoM to kg and excludes unresolved rows from costing', async () => {
    const result = await listCompletedWoCosts({ days: 30 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = result.data.rows.find((costRow) => costRow.woId === COSTED_WO_ID);
    expect(row?.materials).toEqual([
      { itemCode: 'FILM-KG', qtyKg: '1.000', costPerKg: '2.400000', cost: '2.4000' },
    ]);
    expect(row?.unresolvedUom).toEqual([{ itemCode: 'FILM-EA', uom: 'each', qty: '200' }]);
    expect(row?.materialsTotal).toBe('2.4000');
    expect(row?.wasteCost).toBe('0.0000');
    expect(row?.costPerKgOutput).toBe('2.2400');

    const materialsQuery = calls.find((call) => call.sql.includes('from public.wo_material_consumption'));
    expect(materialsQuery?.sql).toContain('left join lateral');
    expect(materialsQuery?.sql).toContain('from public.item_cost_history');
    expect(materialsQuery?.sql).toContain('when lower(c.uom) = \'each\' and i.net_qty_per_each is not null');
    expect(materialsQuery?.sql).toContain('bool_or(qty_kg is null) as unresolved_uom');
  });
});
