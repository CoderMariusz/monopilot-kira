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
import { getLpDetail, listLPs } from './lp-actions';
import type { QueryClient } from './shared';

const { getActiveSiteIdMock } = vi.hoisted(() => ({ getActiveSiteIdMock: vi.fn() }));

vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';
const LP_ID = '77777777-7777-4777-8777-777777777777';

const DETAIL_HEADER_ROW = {
  id: LP_ID,
  lp_number: 'LP-ALL-SITES',
  product_id: 'prod-1',
  item_code: 'RM-001',
  item_name: 'Raw material',
  quantity: '10',
  reserved_qty: '0',
  available_qty: '10',
  uom: 'kg',
  catch_weight_kg: null,
  status: 'available',
  qa_status: 'released',
  batch_number: 'B-001',
  supplier_batch_number: null,
  expiry_date: '2026-08-01T00:00:00.000Z',
  best_before_date: null,
  location_id: null,
  location_code: null,
  location_name: null,
  warehouse_id: 'wh-1',
  warehouse_code: 'WH1',
  warehouse_name: 'Main',
  origin: 'receipt',
  grn_id: null,
  wo_id: null,
  reserved_for_wo_id: null,
  reserved_for_wo_number: null,
  parent_lp_id: null,
  parent_lp_number: null,
  created_at: '2026-07-01T00:00:00.000Z',
  has_active_hold: false,
};

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
    if (normalized.includes('from public.license_plates lp') && normalized.includes('lp.id = $1::uuid')) {
      const siteParam = bound[1];
      if (siteParam === null) {
        return { rows: [DETAIL_HEADER_ROW], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (
      normalized.includes('from public.license_plates')
      && (normalized.includes('parent_lp_id = $1::uuid')
        || normalized.includes('lp_id = $1::uuid')
        || normalized.includes('and sm.lp_id = $1::uuid'))
    ) {
      return { rows: [], rowCount: 0 };
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
  getActiveSiteIdMock.mockReset();
  getActiveSiteIdMock.mockResolvedValue(null);
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

/**
 * R08-09 — the site selector was list-only: a direct
 * /warehouse/license-plates/<id> URL rendered an LP belonging to another site,
 * with Split / Merge / Destroy live. The scope now lives in the loader, and its
 * predicate is character-for-character the one listLPs uses, so the detail can
 * never refuse an LP the list still offers.
 */
describe('getLpDetail site scope (R08-09)', () => {
  function detailHeader() {
    return calls.find((call) => call.sql.includes('from public.license_plates lp') && call.sql.includes('lp.id = $1::uuid'));
  }

  it('scopes the detail read to the active site, matching the list predicate', async () => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);

    const result = await getLpDetail(LP_ID);

    // The mock client returns no row for the scoped read → the LP is refused.
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    const header = detailHeader();
    expect(header?.sql).toContain('$2::uuid is null or lp.site_id = $2::uuid or lp.site_id is null');
    expect(header?.params).toEqual([LP_ID, SITE_ID]);
    expect(header?.params).toHaveLength(maxSqlPlaceholderIndex(header!.sql));
  });

  it('binds NULL for All sites and returns the LP (no over-blocking)', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    const result = await getLpDetail(LP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.id).toBe(LP_ID);
    expect(result.data.lpNumber).toBe('LP-ALL-SITES');
    expect(detailHeader()?.params).toEqual([LP_ID, null]);
    expect(calls.some((call) => call.sql.includes('from public.lp_state_history'))).toBe(true);
  });

  it('resolves the site cookie-only — a client would add an org-default fallback the list does not apply', async () => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);

    await getLpDetail(LP_ID);

    // license-plates/page.tsx calls getActiveSiteId() with no arguments; passing
    // a client here would make the detail STRICTER than the list (over-blocking).
    expect(getActiveSiteIdMock).toHaveBeenCalledWith();
  });

  it('does not read children, history or moves for an out-of-site LP', async () => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);

    await getLpDetail(LP_ID);

    expect(calls).toHaveLength(1);
    expect(calls.some((call) => call.sql.includes('from public.lp_state_history'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('from public.stock_moves'))).toBe(false);
  });
});
