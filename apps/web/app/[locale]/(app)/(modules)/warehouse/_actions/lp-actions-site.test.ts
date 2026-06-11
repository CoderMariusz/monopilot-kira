/**
 * 14-multi-site (CL4) — listLPs site-filter param tests.
 *
 * The LP list filters directly on license_plates.site_id (day-1 column with
 * the (org_id, site_id) index from mig 191) — warehouses has NO site_id, so
 * the LP row itself is the site link. Absent siteId = NULL bind = All sites.
 *
 * Separate file from warehouse-actions.test.ts on purpose: that suite is a
 * shared surface across lanes; this one owns only the site-filter seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listLPs } from './lp-actions';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client: QueryClient = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    calls.push({ sql: normalized, params: [...(params ?? [])] });
    return { rows: [], rowCount: 0 };
  }),
} as unknown as QueryClient;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

beforeEach(() => {
  calls = [];
});

describe('listLPs site filter (14-multi-site CL4)', () => {
  it('binds NULL for the site param when siteId is absent (All sites)', async () => {
    const result = await listLPs({ limit: 200 });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.sql).toContain('$6::uuid is null or lp.site_id = $6::uuid');
    // [status, qaStatus, warehouseId, search, limit, siteId]
    expect(call.params).toEqual([null, null, null, null, 200, null]);
  });

  it('binds the site uuid as the 6th param when siteId is set', async () => {
    const result = await listLPs({ limit: 200, siteId: SITE_ID });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual([null, null, null, null, 200, SITE_ID]);
  });

  it('keeps the existing filters intact alongside the site filter', async () => {
    const result = await listLPs({ status: 'available', search: 'LP-1', siteId: SITE_ID });
    expect(result.ok).toBe(true);
    const [call] = calls;
    expect(call.params[0]).toBe('available');
    expect(call.params[3]).toBe('LP-1');
    expect(call.params[5]).toBe(SITE_ID);
  });
});
