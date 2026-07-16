import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getProductionDashboard } from './dashboard-data';
import { formatDashboardKg } from '../_lib/dashboard-format';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let executed: string[] = [];

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(woRows: Record<string, unknown>[] = []): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params).toEqual([USER_ID, ORG_ID, 'production.oee.read']);
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (normalized.includes('coalesce(sum(qty_kg), 0)::text as kg')) {
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
  client = makeClient();
});

describe('getProductionDashboard', () => {
  it('uses explicit UTC day boundaries for output-today kg', async () => {
    const result = await getProductionDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.outputTodayKg).toBe('0.480');

    const outputSql = executed.find((sql) => sql.includes('coalesce(sum(qty_kg), 0)::text as kg'));
    expect(outputSql).toBeTruthy();
    expect(outputSql!).toContain("date_trunc('day', now() at time zone 'utc') at time zone 'utc'");
    expect(outputSql!).not.toContain("date_trunc('day', now())");
    expect(outputSql!).toContain("interval '1 day'");
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
});
