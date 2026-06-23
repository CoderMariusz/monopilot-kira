import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlanningDashboard } from './dashboard-data';

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

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params).toEqual([USER_ID, ORG_ID, 'scheduler.run.read']);
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (normalized.includes('count(*)::int as n')) {
        return { rows: [{ n: 0 }] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  executed = [];
  client = makeClient();
});

describe('getPlanningDashboard', () => {
  it('uses explicit UTC day boundaries for WOs-today and the 7-day schedule window', async () => {
    const result = await getPlanningDashboard();

    expect(result.ok).toBe(true);
    const woTodaySql = executed.find(
      (sql) => sql.includes('count(*)::int as n') && sql.includes('scheduled_start_time >='),
    );
    const scheduleSql = executed.find(
      (sql) => sql.includes('scheduled_start_time') && sql.includes('limit 200'),
    );

    for (const sql of [woTodaySql, scheduleSql]) {
      expect(sql).toBeTruthy();
      expect(sql!).toContain("date_trunc('day', now() at time zone 'utc') at time zone 'utc'");
      expect(sql!).not.toContain("date_trunc('day', now())");
    }
    expect(woTodaySql!).toContain("interval '1 day'");
    expect(scheduleSql!).toContain("interval '7 day'");
  });
});
