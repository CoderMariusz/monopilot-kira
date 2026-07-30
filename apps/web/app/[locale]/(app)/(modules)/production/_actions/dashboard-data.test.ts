import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getProductionDashboard } from './dashboard-data';
import {
  PRODUCTION_DASHBOARD_SITE_WO_PREDICATE,
  PRODUCTION_DASHBOARD_WO_LIST_SQL,
} from '../_lib/dashboard-queries';
import { formatDashboardKg } from '../_lib/dashboard-format';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let executed: string[] = [];
let boundSiteId: string | null = SITE_ID;

vi.mock('../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    async (
      arg1: unknown,
      arg2?: (ctx: { userId: string; orgId: string; siteId: string | null; client: QueryClient }) => Promise<unknown>,
    ) => {
      const action = typeof arg1 === 'function' ? arg1 : arg2;
      if (!action) throw new TypeError('withSiteContext mock: missing action');
      return action({ userId: USER_ID, orgId: ORG_ID, siteId: boundSiteId, client });
    },
  ),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function hasSiteWoPredicate(sql: string): boolean {
  return sql.includes(PRODUCTION_DASHBOARD_SITE_WO_PREDICATE.toLowerCase());
}

function makeClient(woRows: Record<string, unknown>[] = []): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params).toEqual([USER_ID, ORG_ID, 'production.oee.read']);
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (normalized.includes('coalesce(sum(o.qty_kg), 0)::text as kg')) {
        return { rows: [{ kg: '0.480' }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.work_orders w') && normalized.includes('limit 25')) {
        return { rows: woRows as never[], rowCount: woRows.length };
      }
      if (normalized.includes('count(*)::int as n')) {
        return { rows: [{ n: 0 }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.oee_snapshots')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('group by 1')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      return { rows: [] as never[], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  executed = [];
  boundSiteId = SITE_ID;
  client = makeClient();
});

describe('getProductionDashboard', () => {
  it('buckets output-today kg by the SITE-local day, not the UTC day', async () => {
    const result = await getProductionDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.outputTodayKg).toBe('0.480');

    const outputSql = executed.find((sql) => sql.includes('coalesce(sum(o.qty_kg), 0)::text as kg'));
    expect(outputSql).toBeTruthy();
    // The bucket now resolves sites.timezone -> organizations.timezone -> 'UTC'.
    expect(outputSql!).toContain('app.current_site_id()');
    expect(outputSql!).toContain('s.timezone');
    // Anti-regression: the hardcoded UTC calendar day must not come back.
    expect(outputSql!).not.toContain("date_trunc('day', now() at time zone 'utc') at time zone 'utc'");
    // ...and the session-zone-dependent bare cast must not appear either.
    expect(outputSql!).not.toContain("date_trunc('day', now())");
    expect(outputSql!).toContain("interval '1 day'");
    expect(outputSql!).toContain(PRODUCTION_DASHBOARD_SITE_WO_PREDICATE.toLowerCase());
  });

  it('keeps produced qty numeric in the lateral subquery so progress_pct division is valid', async () => {
    await getProductionDashboard();

    expect(PRODUCTION_DASHBOARD_WO_LIST_SQL).toContain('coalesce(sum(o.qty_kg), 0) as qty_kg');
    expect(PRODUCTION_DASHBOARD_WO_LIST_SQL).not.toContain('coalesce(sum(o.qty_kg), 0)::text as qty_kg');
    expect(PRODUCTION_DASHBOARD_WO_LIST_SQL).toContain(PRODUCTION_DASHBOARD_SITE_WO_PREDICATE);
    // U1 — produced_quantity/progress_pct divide by planned_quantity (work_orders.uom),
    // so the lateral must only sum outputs in that same unit.
    expect(PRODUCTION_DASHBOARD_WO_LIST_SQL).toContain("nullif(trim(w.uom), '')");
  });

  it('preserves exact decimal produced/planned kg strings from the WO list query', async () => {
    client = makeClient([
      {
        id: 'a0000004-0000-4000-8000-000000000006',
        wo_number: 'E2E-A-S8-TIMESTAMPS',
        status: 'in_progress',
        production_line_id: 'line-1',
        line_code: 'LINE1',
        product_id: 'prod-1',
        item_code: 'FG0015',
        product_name: 'Test FG',
        planned_quantity: '50.000',
        produced_quantity: '0.960',
        progress_pct: '2',
        has_allergen: false,
        over_production_flagged: false,
      },
    ]);

    const result = await getProductionDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.woRows).toHaveLength(1);
    expect(result.data.woRows[0]?.plannedKg).toBe('50.000');
    expect(result.data.woRows[0]?.producedKg).toBe('0.960');
    expect(formatDashboardKg(result.data.woRows[0]?.producedKg)).toBe('0.96');
    expect(formatDashboardKg(result.data.outputTodayKg)).toBe('0.48');
  });

  it('never adds pcs to kg — mixed-uom output is partitioned, not summed (U1)', async () => {
    // Live proof from monopilot_t3: PROBE-KG-1 200 kg + PROBE-PCS-1 500 pcs used to
    // render as "700 kg". The tile must show 200 kg and surface the 500 pcs separately.
    client = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        executed.push(normalized);
        if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as never[], rowCount: 1 };
        if (normalized.includes('coalesce(sum(o.qty_kg), 0)::text as kg')) {
          return {
            rows: [
              { uom: 'kg', kg: '200.000' },
              { uom: 'pcs', kg: '500.000' },
            ] as never[],
            rowCount: 2,
          };
        }
        if (normalized.includes('count(*)::int as n')) return { rows: [{ n: 0 }] as never[], rowCount: 1 };
        return { rows: [] as never[], rowCount: 0 };
      }),
    };

    const result = await getProductionDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.outputTodayKg).toBe('200.000');
    expect(result.data.outputTodayKg).not.toBe('700.000');
    expect(result.data.outputTodayOther).toEqual([{ uom: 'pcs', qty: '500.000' }]);

    // The SQL must partition, not blind-sum.
    const outputSql = executed.find((sql) => sql.includes('coalesce(sum(o.qty_kg), 0)::text as kg'));
    expect(outputSql!).toContain('group by');
  });

  it('single-uom (all kg) output still totals exactly as before — no frozen neighbour (U1)', async () => {
    client = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        executed.push(normalized);
        if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as never[], rowCount: 1 };
        if (normalized.includes('coalesce(sum(o.qty_kg), 0)::text as kg')) {
          return { rows: [{ uom: 'kg', kg: '123.456' }] as never[], rowCount: 1 };
        }
        if (normalized.includes('count(*)::int as n')) return { rows: [{ n: 0 }] as never[], rowCount: 1 };
        return { rows: [] as never[], rowCount: 0 };
      }),
    };

    const result = await getProductionDashboard();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.outputTodayKg).toBe('123.456');
    expect(result.data.outputTodayOther).toEqual([]);
  });

  it('scopes WO KPI counts to the active site so KPI and list agree (regression Z10-01)', async () => {
    const ORG_WIDE_IN_PROGRESS = 4;
    const SITE_SCOPED_IN_PROGRESS = 3;

    client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        executed.push(normalized);

        if (normalized.includes('from public.user_roles')) {
          return { rows: [{ ok: true }] as never[], rowCount: 1 };
        }
        if (
          normalized.includes('from public.wo_executions e') &&
          normalized.includes("e.status = 'in_progress'")
        ) {
          expect(hasSiteWoPredicate(normalized)).toBe(true);
          return {
            rows: [{ n: hasSiteWoPredicate(normalized) ? SITE_SCOPED_IN_PROGRESS : ORG_WIDE_IN_PROGRESS }],
            rowCount: 1,
          };
        }
        if (normalized.includes('group by 1')) {
          expect(hasSiteWoPredicate(normalized)).toBe(true);
          return {
            rows: [
              {
                status: 'in_progress',
                n: hasSiteWoPredicate(normalized) ? SITE_SCOPED_IN_PROGRESS : ORG_WIDE_IN_PROGRESS,
              },
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.work_orders w') && normalized.includes('limit 25')) {
          expect(hasSiteWoPredicate(normalized)).toBe(true);
          const count = hasSiteWoPredicate(normalized) ? SITE_SCOPED_IN_PROGRESS : ORG_WIDE_IN_PROGRESS;
          return {
            rows: Array.from({ length: count }, (_, index) => ({
              id: `wo-${index}`,
              wo_number: `WO-${index}`,
              status: 'in_progress',
              production_line_id: null,
              line_code: null,
              product_id: `prod-${index}`,
              item_code: null,
              product_name: null,
              planned_quantity: '10.000',
              produced_quantity: null,
              progress_pct: null,
              has_allergen: false,
              over_production_flagged: false,
            })),
            rowCount: count,
          };
        }
        if (normalized.includes('coalesce(sum(o.qty_kg), 0)::text as kg')) {
          return { rows: [{ kg: '0' }] as never[], rowCount: 1 };
        }
        if (normalized.includes('count(*)::int as n')) {
          return { rows: [{ n: 0 }] as never[], rowCount: 1 };
        }
        if (normalized.includes('from public.oee_snapshots')) {
          return { rows: [] as never[], rowCount: 0 };
        }
        return { rows: [] as never[], rowCount: 0 };
      }),
    };

    const result = await getProductionDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.woInProgress).toBe(SITE_SCOPED_IN_PROGRESS);
    expect(result.data.statusCounts.in_progress).toBe(SITE_SCOPED_IN_PROGRESS);
    expect(result.data.woRows.filter((row) => row.status === 'in_progress')).toHaveLength(
      SITE_SCOPED_IN_PROGRESS,
    );
    expect(result.data.woInProgress).toBe(result.data.statusCounts.in_progress);
    expect(executed.every((sql) => !sql.includes('from public.wo_executions') || hasSiteWoPredicate(sql))).toBe(
      true,
    );
  });
});
