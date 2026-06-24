import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAnalyticsScreen } from './analytics-data';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FROM = new Date('2026-05-10T00:00:00.000Z');
const TO = new Date('2026-05-20T23:59:59.999Z');

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('avg(oee_pct) as oee_avg')) {
      return { rows: [{ oee_avg: '80.5', fpq_avg: '92.1' }], rowCount: 1 };
    }
    if (normalized.includes('from public.wo_waste_log')) {
      return { rows: [{ waste_kg: '2', output_kg: '98' }], rowCount: 1 };
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
});

describe('getAnalyticsScreen period window', () => {
  it('uses a custom from/to window instead of hard-coded 7d/30d intervals', async () => {
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(5); // oee kpi + waste + trend + yield + downtime
    for (const call of calls) {
      expect(call.sql).not.toContain("interval '7 days'");
      expect(call.sql).not.toContain("interval '30 days'");
      expect(call.params).toEqual([FROM, TO]);
    }
  });
});
