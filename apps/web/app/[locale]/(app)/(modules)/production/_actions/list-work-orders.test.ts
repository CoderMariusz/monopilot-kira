/**
 * 14-multi-site (CL4) — listWorkOrders site-filter param tests.
 *
 * Verifies the OPTIONAL siteId filter is additive: absent/invalid input binds
 * NULL (All sites — pre-existing behaviour byte-identical), a valid uuid binds
 * the site filter on coalesce(work_orders.site_id, production_lines.site_id)
 * in BOTH the status-counts query and the list query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listWorkOrders } from './list-work-orders';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];
let permissionGranted: boolean;

const client = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return permissionGranted
        ? { rows: [{ ok: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    calls.push({ sql: normalized, params: params ?? [] });
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
  permissionGranted = true;
});

describe('listWorkOrders site filter (14-multi-site CL4)', () => {
  it('binds NULL (All sites) when called with no input — pre-existing behaviour', async () => {
    const result = await listWorkOrders();
    expect(result.ok).toBe(true);
    // status-counts query + list query, both with a single NULL site param.
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.params).toEqual([null]);
      expect(call.sql).toContain('$1::uuid is null or coalesce(w.site_id, pl.site_id) = $1::uuid');
    }
  });

  it('binds the site uuid in both queries when siteId is set', async () => {
    const result = await listWorkOrders({ siteId: SITE_ID });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.params).toEqual([SITE_ID]);
    }
    // The counts query must carry the production_lines join the predicate needs.
    expect(calls[0].sql).toContain('left join public.production_lines pl');
  });

  it('treats a non-uuid siteId as All sites (NULL bind)', async () => {
    const result = await listWorkOrders({ siteId: 'not-a-uuid; drop table work_orders' });
    expect(result.ok).toBe(true);
    for (const call of calls) {
      expect(call.params).toEqual([null]);
    }
  });

  it('still resolves the RBAC gate before querying (forbidden short-circuits)', async () => {
    permissionGranted = false;
    const result = await listWorkOrders({ siteId: SITE_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(calls).toHaveLength(0);
  });
});
