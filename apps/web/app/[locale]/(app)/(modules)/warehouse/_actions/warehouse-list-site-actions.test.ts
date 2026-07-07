import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listGrns } from './grn-actions';
import type { QueryClient } from './shared';
import { listStockMoves } from './stock-move-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('count(*)')) {
        return { rows: [{ total: 0 }], rowCount: 1 };
      }
      if (q.includes('from unified')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

function mainQueryCalls() {
  return vi
    .mocked(client.query)
    .mock.calls.filter(([sql]) => {
      const q = normalize(String(sql));
      return q.includes('from public.grns g') || q.includes('with unified as');
    });
}

function stockMoveDataQuery() {
  return mainQueryCalls().find(([sql]) => normalize(String(sql)).includes('limit $2::integer offset $3::integer'));
}

beforeEach(() => {
  getActiveSiteIdMock.mockReset();
  getActiveSiteIdMock.mockResolvedValue(SITE_ID);
  client = makeClient();
});

describe('warehouse list action site scoping', () => {
  it('listGrns binds the active site in the GRN list query', async () => {
    const result = await listGrns();

    expect(result.ok).toBe(true);
    const [sql, params] = mainQueryCalls()[0];
    expect(normalize(String(sql))).toContain('g.site_id = $5::uuid');
    expect(params).toEqual([null, null, null, 100, SITE_ID]);
    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });
  });

  it('listGrns fails closed when no active site resolves before running the GRN list query', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    await expect(listGrns()).resolves.toEqual({ ok: true, data: [], noActiveSite: true });
    expect(mainQueryCalls()).toHaveLength(0);
  });

  it('listStockMoves binds the active site in the stock move list query', async () => {
    const result = await listStockMoves();

    expect(result.ok).toBe(true);
    const dataQuery = stockMoveDataQuery();
    expect(dataQuery).toBeDefined();
    const [sql, params] = dataQuery as [string, unknown[]];
    const normalized = normalize(String(sql));
    expect(normalized).toContain('sm.site_id = $4::uuid');
    expect(normalized).toContain('h.site_id = $4::uuid');
    expect(params).toEqual([null, 50, 0, SITE_ID]);
    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });
  });

  it('listStockMoves fails closed when no active site resolves before running the stock move list query', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    await expect(listStockMoves()).resolves.toEqual({
      ok: true,
      data: { items: [], total: 0, page: 1, limit: 50, offset: 0, hasMore: false },
      noActiveSite: true,
    });
    expect(mainQueryCalls()).toHaveLength(0);
  });
});
