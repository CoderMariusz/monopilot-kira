/**
 * Production WO list — pagination, search, status filter param tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { maxSqlPlaceholderIndex } from '../../../../../../lib/shared/sql-placeholders';
import { listWorkOrders } from './list-work-orders';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];
let permissionGranted: boolean;
let listTotal = 120;

const client = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return permissionGranted
        ? { rows: [{ ok: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    calls.push({ sql: normalized, params: params ?? [] });
    if (normalized.includes('select count(*)::int as total')) {
      return { rows: [{ total: listTotal }], rowCount: 1 };
    }
    if (normalized.includes('group by 1')) {
      return {
        rows: [
          { status: 'planned', n: 40 },
          { status: 'in_progress', n: 80 },
        ],
        rowCount: 2,
      };
    }
    if (normalized.startsWith('select w.id::text')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function expectSqlArity(sql: string, params: readonly unknown[] | undefined) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(String(sql)));
}

beforeEach(() => {
  calls = [];
  permissionGranted = true;
  listTotal = 120;
  vi.mocked(client.query).mockClear();
});

describe('listWorkOrders', () => {
  it('binds NULL (All sites) when called with no input — pre-existing behaviour', async () => {
    const result = await listWorkOrders();
    expect(result.ok).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      expect(call.params[0]).toBe(null);
      expect(call.sql).toContain('$1::uuid is null or coalesce(w.site_id, pl.site_id) = $1::uuid');
    }
  });

  it('binds the site uuid in all queries when siteId is set', async () => {
    const result = await listWorkOrders({ siteId: SITE_ID });
    expect(result.ok).toBe(true);
    for (const call of calls) {
      expect(call.params[0]).toBe(SITE_ID);
    }
    expect(calls[0]?.sql).toContain('left join public.production_lines pl');
  });

  it('passes search and status filters with limit/offset for pagination', async () => {
    const result = await listWorkOrders({
      siteId: SITE_ID,
      search: 'FG-100',
      status: 'in_progress',
      page: 2,
      limit: 25,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.pagination).toMatchObject({
      total: 120,
      page: 2,
      limit: 25,
      offset: 25,
      hasMore: true,
    });

    const dataCall = calls.find((call) => call.sql.startsWith('select w.id::text'));
    expect(dataCall?.params).toEqual([SITE_ID, 'FG-100', 'in_progress', 25, 25]);
    expectSqlArity(dataCall?.sql ?? '', dataCall?.params);

    const countCall = calls.find((call) => call.sql.includes('select count(*)::int as total'));
    expect(countCall?.params).toEqual([SITE_ID, 'FG-100', 'in_progress']);

    const statusCall = calls.find((call) => call.sql.includes('group by 1'));
    expect(statusCall?.params).toEqual([SITE_ID, 'FG-100']);
    expect(String(statusCall?.sql)).not.toContain('$3::text is null or');
  });

  it('treats a non-uuid siteId as All sites (NULL bind)', async () => {
    const result = await listWorkOrders({ siteId: 'not-a-uuid; drop table work_orders' });
    expect(result.ok).toBe(true);
    for (const call of calls) {
      expect(call.params[0]).toBe(null);
    }
  });

  it('still resolves the RBAC gate before querying (forbidden short-circuits)', async () => {
    permissionGranted = false;
    const result = await listWorkOrders({ siteId: SITE_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(calls).toHaveLength(0);
  });
});
