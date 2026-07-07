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

import { maxSqlPlaceholderIndex } from '../../../../../../lib/shared/sql-placeholders';
import { listLPs } from './lp-actions';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

function expectSqlArity(sql: string, params: unknown[]) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(sql));
}

const client: QueryClient = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    const bound = [...(params ?? [])];
    calls.push({ sql: normalized, params: bound });
    if (normalized.includes('count(*)::int as total')) {
      expectSqlArity(normalized, bound);
      return { rows: [{ total: 0 }], rowCount: 1 };
    }
    if (normalized.includes('limit $4::integer offset $5::integer')) {
      expectSqlArity(normalized, bound);
    }
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
    expect(calls).toHaveLength(2);
    const dataCall = calls.find((call) => call.sql.includes('limit $4::integer offset $5::integer'));
    expect(dataCall?.sql).toContain('$3::uuid is null or lp.site_id = $3::uuid');
    expect(dataCall?.params).toEqual([null, null, null, 200, 0]);
  });

  it('binds the site uuid as the third param when siteId is set', async () => {
    const result = await listLPs({ limit: 200, siteId: SITE_ID });
    expect(result.ok).toBe(true);
    const dataCall = calls.find((call) => call.sql.includes('limit $4::integer offset $5::integer'));
    expect(dataCall?.params).toEqual([null, null, SITE_ID, 200, 0]);
  });

  it('keeps search intact alongside the site filter without status restrictions', async () => {
    const result = await listLPs({ status: 'available', search: 'LP-1', siteId: SITE_ID });
    expect(result.ok).toBe(true);
    const dataCall = calls.find((call) => call.sql.includes('limit $4::integer offset $5::integer'));
    expect(dataCall?.sql).not.toMatch(/lp\.status\s*=/);
    expect(dataCall?.params[1]).toBe('LP-1');
    expect(dataCall?.params[2]).toBe(SITE_ID);
  });

  it('includes NULL-site rows even when a site filter is active (F10 fix)', async () => {
    const result = await listLPs({ limit: 200, siteId: SITE_ID });
    expect(result.ok).toBe(true);
    const dataCall = calls.find((call) => call.sql.includes('limit $4::integer offset $5::integer'));
    expect(dataCall?.sql).toContain('$3::uuid is null or lp.site_id = $3::uuid or lp.site_id is null');
  });
});
