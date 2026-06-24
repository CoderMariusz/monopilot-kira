/**
 * 14-multi-site (CL4) — getOeeScreen site-filter param tests.
 *
 * oee_snapshots.site_id is a day-1 column (mig 184). The OPTIONAL siteId input
 * must bind in ALL THREE reads (KPIs, per-line aggregates, recent snapshots);
 * absent/invalid input binds NULL = All sites = pre-existing behaviour. Period
 * windows must bind as timestamps rather than hard-coded SQL intervals.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOeeScreen } from './oee-data';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';
const FROM = new Date('2026-06-01T00:00:00.000Z');
const TO = new Date('2026-06-12T23:59:59.999Z');

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    calls.push({ sql: normalized, params: [...(params ?? [])] });
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

beforeEach(() => {
  calls = [];
});

describe('getOeeScreen site filter (14-multi-site CL4)', () => {
  it('binds NULL site and a default window in all three snapshot queries when called with no input', async () => {
    const result = await getOeeScreen();
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3); // kpis + lines + recent
    for (const call of calls) {
      expect(call.sql).toContain('site_id = $1::uuid');
      expect(call.sql).toContain('snapshot_minute >= $2::timestamptz');
      expect(call.sql).toContain('snapshot_minute <= $3::timestamptz');
      expect(call.sql).not.toContain("interval '7 days'");
      expect(call.params[0]).toBeNull();
      expect(call.params[1]).toBeInstanceOf(Date);
      expect(call.params[2]).toBeInstanceOf(Date);
    }
  });

  it('binds the site uuid in all three snapshot queries when siteId is set', async () => {
    const result = await getOeeScreen({ siteId: SITE_ID });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.params[0]).toBe(SITE_ID);
    }
  });

  it('treats a non-uuid siteId as All sites (NULL bind)', async () => {
    const result = await getOeeScreen({ siteId: 'SITE-DEMO-01' });
    expect(result.ok).toBe(true);
    for (const call of calls) {
      expect(call.params[0]).toBeNull();
    }
  });

  it('uses a custom from/to window instead of the default 7-day interval', async () => {
    const result = await getOeeScreen({ window: { from: FROM, to: TO } });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.sql).not.toContain("interval '7 days'");
      expect(call.params).toEqual([null, FROM, TO]);
    }
  });
});
