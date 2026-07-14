import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeWoActualCost, listCompletedWoCosts } from '../wo-cost-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ZERO_WO_ID = '33333333-3333-4333-8333-333333333333';
const COSTED_WO_ID = '44444444-4444-4444-8444-444444444444';
const CREW_WO_ID = '55555555-5555-4555-8555-555555555555';
const DEFAULTS_WO_ID = '66666666-6666-4666-8666-666666666666';
const SETUP_WO_ID = '77777777-7777-4777-8777-777777777777';
const FRACTIONAL_WO_ID = '88888888-8888-4888-8888-888888888888';
const DEDUP_MO_WO_ID = '99999999-9999-4999-8999-999999999999';
const DEDUP_SETUP_WO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CORRECTION_WO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PLN_WO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HISTORIC_WO_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MIXED_ITEM_WO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MULTI_COST_WO_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    if (normalized.includes('select count(*)::int as total') && normalized.includes('from public.work_orders')) {
      return { rows: [{ total: 30 }], rowCount: 1 };
    }

    if (normalized.includes('select wo.id::text as wo_id') && normalized.includes('limit $2::integer offset $3::integer')) {
      const limit = Number(params?.[1] ?? 25);
      const offset = Number(params?.[2] ?? 0);
      if (offset === 0) {
        return {
          rows: [
            { wo_id: ZERO_WO_ID, completed_at: '2026-06-10T10:00:00.000Z' },
            { wo_id: COSTED_WO_ID, completed_at: '2026-06-11T10:00:00.000Z' },
          ],
          rowCount: 2,
        };
      }
      const allRows = Array.from({ length: 30 }, (_, index) => ({
        wo_id: `wo-page-${index + 1}`,
        completed_at: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      }));
      return {
        rows: allRows.slice(offset, offset + limit),
        rowCount: Math.min(limit, Math.max(0, 30 - offset)),
      };
    }

    if (
      normalized.includes('select wo.id::text as wo_id') &&
      normalized.includes('from public.work_orders') &&
      !normalized.includes('wo.wo_number') &&
      !normalized.includes('limit $2::integer offset $3::integer')
    ) {
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
            output_kg: woId === CREW_WO_ID ? '20.000' : '10.000',
            waste_kg: '0',
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_material_consumption')) {
      if (params?.[0] === CREW_WO_ID || params?.[0] === CORRECTION_WO_ID) return { rows: [], rowCount: 0 };
      if (params?.[0] === PLN_WO_ID) {
        return {
          rows: [
            {
              item_code: 'RM-PLN',
              uom: null,
              raw_qty: '5',
              qty_kg: '5.000',
              cost_per_kg: '25.000000',
              has_non_gbp_currency: true,
              unresolved_uom: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === MIXED_ITEM_WO_ID) {
        return {
          rows: [
            {
              item_code: 'RM-MIX',
              uom: null,
              raw_qty: '2',
              qty_kg: '2.000',
              cost_per_kg: '4.000000',
              has_non_gbp_currency: true,
              unresolved_uom: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === MULTI_COST_WO_ID) {
        return {
          rows: [
            {
              item_code: 'RM-GBP',
              uom: null,
              raw_qty: '2',
              qty_kg: '2.000',
              cost_per_kg: '4.000000',
              has_non_gbp_currency: false,
              unresolved_uom: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === HISTORIC_WO_ID) {
        return {
          rows: [
            {
              item_code: 'RM-SNAP',
              uom: null,
              raw_qty: '2',
              qty_kg: '2.000',
              cost_per_kg: '3.500000',
              has_non_gbp_currency: false,
              unresolved_uom: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === COSTED_WO_ID) {
        return {
          rows: [
            {
              item_code: 'FILM-KG',
              uom: null,
              raw_qty: '200',
              qty_kg: '1.000',
              cost_per_kg: '2.400000',
              has_non_gbp_currency: false,
              unresolved_uom: false,
            },
            {
              item_code: 'FILM-EA',
              uom: 'each',
              raw_qty: '200',
              qty_kg: '0',
              cost_per_kg: '2.400000',
              has_non_gbp_currency: false,
              unresolved_uom: true,
            },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.includes('from public.wo_operations')) {
      if (params?.[0] === CORRECTION_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'CUTTING',
              row_key: null,
              cost_mode: 'per_hour',
              cost_rate: '75.0000',
              currency: 'GBP',
              staffing_count: '1',
              setup_cost: null,
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === CREW_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'CUTTING',
              row_key: null,
              cost_mode: 'per_hour',
              cost_rate: '100.0000',
              currency: 'GBP',
              staffing_count: '1',
              setup_cost: null,
              expected_duration_minutes: '90',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === DEFAULTS_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'MIXING',
              row_key: 'pd-default-1',
              cost_mode: 'per_hour',
              cost_rate: '30.0000',
              currency: 'GBP',
              staffing_count: '2',
              setup_cost: null,
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === SETUP_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'PACKING',
              row_key: 'pd-setup-1',
              cost_mode: 'per_hour',
              cost_rate: '20.0000',
              currency: 'GBP',
              staffing_count: '1',
              setup_cost: '12.5000',
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === FRACTIONAL_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'BLENDING',
              row_key: 'pd-frac-1',
              cost_mode: 'per_hour',
              cost_rate: '125.0000',
              currency: 'GBP',
              staffing_count: '2.5',
              setup_cost: null,
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === DEDUP_MO_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'MIXING',
              row_key: 'pd-lowest-id',
              cost_mode: 'per_hour',
              cost_rate: '30.0000',
              currency: 'GBP',
              staffing_count: '2',
              setup_cost: '10.0000',
              expected_duration_minutes: '60',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (params?.[0] === DEDUP_SETUP_WO_ID) {
        return {
          rows: [
            {
              operation_name: 'MIXING',
              row_key: 'pd-shared',
              cost_mode: 'per_hour',
              cost_rate: '40.0000',
              currency: 'GBP',
              staffing_count: '2',
              setup_cost: '15.0000',
              expected_duration_minutes: '120',
              has_labor_rate: true,
            },
          ],
          rowCount: 1,
        };
      }
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

vi.mock('../../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    async (
      arg1: unknown,
      arg2?: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>,
    ) => {
      const action = typeof arg1 === 'function' ? arg1 : arg2;
      if (!action) throw new TypeError('withSiteContext mock: missing action');
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    },
  ),
}));

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
    expect(result.data.pagination).toMatchObject({
      total: 30,
      page: 1,
      limit: 25,
      offset: 0,
      hasMore: true,
    });
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
    expect(calls.some((call) => call.sql.includes('app.current_site_id()'))).toBe(true);
  });

  it('paginates completed WO costs so rows beyond the first page are reachable', async () => {
    const result = await listCompletedWoCosts({ days: 30, page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pagination).toMatchObject({
      total: 30,
      page: 2,
      offset: 25,
      hasMore: false,
    });
    expect(result.data.rows.length).toBeLessThanOrEqual(5);

    const listQuery = calls.find(
      (call) =>
        call.sql.includes('select wo.id::text as wo_id') &&
        call.sql.includes('limit $2::integer offset $3::integer'),
    );
    expect(listQuery?.params).toEqual([30, 25, 25]);
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

    const materialsQuery = calls.find(
      (call) => call.sql.includes('from public.wo_material_consumption') && call.params[0] === COSTED_WO_ID,
    );
    expect(materialsQuery?.sql).toContain('nullif(c.ext_jsonb->>\'wac_avg_cost\'');
    expect(materialsQuery?.sql).toContain('coalesce(c.consumed_at::date, $2::date)');
    expect(materialsQuery?.sql).toContain('and (effective_to is null or effective_to >=');
    expect(materialsQuery?.sql).not.toContain('and effective_to is null');
    expect(materialsQuery?.params).toEqual([COSTED_WO_ID, '2026-06-11', 'GBP']);
    expect(materialsQuery?.sql).toContain('when lower(c.uom) = \'each\' and i.net_qty_per_each is not null');
    expect(materialsQuery?.sql).toContain('bool_or(cost_currency is distinct from $3::text) as has_non_gbp_currency');
    expect(materialsQuery?.sql).toContain('sum(coalesce(qty_kg, 0) * coalesce(cost_per_kg, 0))');
    expect(materialsQuery?.sql).not.toContain('max(cost_currency)');
    expect(materialsQuery?.sql).not.toContain('max(cost_per_kg)');
  });

  it('rejects WO actual cost when a material row is costed in a non-GBP currency', async () => {
    const result = await computeWoActualCost(PLN_WO_ID);

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_currency',
      message: expect.stringContaining('RM-PLN'),
    });
  });

  it('rejects WO actual cost when the same item has both GBP and EUR consumption rows', async () => {
    const result = await computeWoActualCost(MIXED_ITEM_WO_ID);

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_currency',
      message: expect.stringContaining('RM-MIX'),
    });

    const materialsQuery = calls.find((call) => call.sql.includes('from public.wo_material_consumption'));
    expect(materialsQuery?.sql).toContain('bool_or(cost_currency is distinct from $3::text)');
  });

  it('sums same-item consumptions at different GBP costs via row-grain qty×cost, not qty×max(cost)', async () => {
    const result = await computeWoActualCost(MULTI_COST_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.materials).toEqual([
      { itemCode: 'RM-GBP', qtyKg: '2.000', costPerKg: '4.000000', cost: '8.0000' },
    ]);
    expect(result.data.materialsTotal).toBe('8.0000');
  });

  it('prefers immutable consumption WAC snapshots over later item_cost_history rolls', async () => {
    const result = await computeWoActualCost(HISTORIC_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.materials).toEqual([
      { itemCode: 'RM-SNAP', qtyKg: '2.000', costPerKg: '3.500000', cost: '7.0000' },
    ]);
    expect(result.data.materialsTotal).toBe('7.0000');

    const materialsQuery = calls.find((call) => call.sql.includes('from public.wo_material_consumption'));
    expect(materialsQuery?.sql).toContain('nullif(c.ext_jsonb->>\'wac_avg_cost\'');
    expect(materialsQuery?.sql).toContain('coalesce(c.consumed_at::date, $2::date)');
  });
});

describe('computeWoActualCost site scope', () => {
  it('scopes the initial WO lookup by active site', async () => {
    const result = await computeWoActualCost(COSTED_WO_ID);
    expect(result.ok).toBe(true);
    const woLookup = calls.find((call) => call.sql.includes('coalesce(sum(o.qty_kg), 0)::text as output_kg'));
    expect(woLookup?.sql).toContain('production_lines pl');
    expect(woLookup?.sql).toContain('coalesce(wo.site_id, pl.site_id) = app.current_site_id()');
  });
});

describe('computeWoActualCost crew labor path', () => {
  it('uses the WO operation crew-rate result directly and keeps totals unchanged', async () => {
    const result = await computeWoActualCost(CREW_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.laborBasis).toBe('planned_duration');
    expect(result.data.plannedRuntimeMin).toBe('90');
    expect(result.data.labor).toMatchObject({
      runtimeMin: '90.000',
      staffing: '1',
      ratePerHour: '100.0000',
      cost: '150.0000',
    });
    expect(result.data.setupCost).toBe('0.0000');
    expect(result.data.totalCost).toBe('150.0000');

    const processQuery = calls.find((call) => call.sql.includes('from public.wo_operations'));
    expect(processQuery?.sql).toContain('jsonb_to_recordset');
    expect(processQuery?.sql).toContain('where op.crew is not null');
    expect(processQuery?.sql).toContain('defaults_op_rate');
    expect(processQuery?.sql).toContain('public.npd_process_default_roles');
    expect(processQuery?.sql).not.toContain('fallback_op_rate');
    expect(processQuery?.sql).not.toContain('null::text as setup_cost');
  });

  it('crew labor-rate lookup orders by created_at so same-date corrections win', async () => {
    const sameDateRates = [
      { effective_from: '2026-06-01', created_at: '2026-06-01T10:00:00.000Z', rate_per_hour: '50' },
      { effective_from: '2026-06-01', created_at: '2026-06-01T14:00:00.000Z', rate_per_hour: '75' },
    ];
    const winner = [...sameDateRates].sort((a, b) => {
      const byDate = b.effective_from.localeCompare(a.effective_from);
      return byDate !== 0 ? byDate : b.created_at.localeCompare(a.created_at);
    })[0];
    expect(winner.rate_per_hour).toBe('75');

    const result = await computeWoActualCost(CORRECTION_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.labor).toMatchObject({
      runtimeMin: '60.000',
      ratePerHour: '75.0000',
      cost: '75.0000',
    });

    const processQuery = calls.find((call) => call.sql.includes('from public.wo_operations'));
    expect(processQuery?.sql).toContain('order by lr.effective_from desc, lr.created_at desc');
  });

  it('costs a crew-less WO via npd_process_default_roles defaults', async () => {
    const result = await computeWoActualCost(DEFAULTS_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.labor).toMatchObject({
      runtimeMin: '60.000',
      staffing: '2',
      ratePerHour: '15.0000',
      cost: '30.0000',
    });
    expect(result.data.totalCost).toBe('30.0000');

    const processQuery = calls.find((call) => call.sql.includes('defaults_op_rate'));
    expect(processQuery?.sql).toContain('where op.crew is null');
    expect(processQuery?.sql).toContain('public.npd_process_default_roles');
  });

  it('includes npd_process_defaults.setup_cost in the WO total', async () => {
    const result = await computeWoActualCost(SETUP_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.setupCost).toBe('12.5000');
    expect(result.data.labor?.cost).toBe('20.0000');
    expect(result.data.totalCost).toBe('32.5000');
  });

  it('resolves duplicate active MO names to one process default via lowest-id lateral pick', async () => {
    const result = await computeWoActualCost(DEDUP_MO_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.labor).toMatchObject({
      runtimeMin: '60.000',
      staffing: '2',
      ratePerHour: '15.0000',
      cost: '30.0000',
    });
    expect(result.data.setupCost).toBe('10.0000');
    expect(result.data.totalCost).toBe('40.0000');

    const processQuery = calls.find((call) => call.sql.includes('defaults_op_rate'));
    expect(processQuery?.sql).toContain('join lateral');
    expect(processQuery?.sql).toContain('order by mo.id asc, pd.id asc');
    expect(processQuery?.sql).toContain('limit 1');
  });

  it('charges setup once per distinct process_default_id when the same process spans two ops', async () => {
    const result = await computeWoActualCost(DEDUP_SETUP_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.setupCost).toBe('15.0000');
    expect(result.data.labor?.cost).toBe('80.0000');
    expect(result.data.totalCost).toBe('95.0000');

    const processQuery = calls.find((call) => call.sql.includes('defaults_op_rate'));
    expect(processQuery?.sql).toContain('distinct on (process_default_id)');
  });

  it('round-trips fractional default headcount without overstating labor', async () => {
    const result = await computeWoActualCost(FRACTIONAL_WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.labor).toMatchObject({
      runtimeMin: '60.000',
      staffing: '2.5',
      ratePerHour: '50.0000',
      cost: '125.0000',
    });
    expect(result.data.totalCost).toBe('125.0000');
  });
});
