import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardData } from './dashboard-summary';

type QueryResult<T> = { rows: T[]; rowCount?: number };
type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<QueryResult<T>>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalize(sql);
      if (normalized.includes('from public.audit_events')) {
        return { rows: [], rowCount: 0 };
      }

      const siteParam = params.find((param) => param === SITE_ID || param === null);
      return { rows: [{ n: siteParam === null ? 0 : 3 }], rowCount: 1 };
    }),
  };
}

describe('getDashboardData', () => {
  beforeEach(() => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    client = makeClient();
  });

  it('adds the active site uuid bind to every site-bearing KPI query', async () => {
    await expect(getDashboardData()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        kpis: expect.arrayContaining([
          expect.objectContaining({ key: 'activeWos', value: 3 }),
          expect.objectContaining({ key: 'pendingPos', value: 3 }),
          expect.objectContaining({ key: 'lowStock', value: 3 }),
          expect.objectContaining({ key: 'qualityHolds', value: 3 }),
          expect.objectContaining({ key: 'shipmentsToday', value: 3 }),
        ]),
      }),
    );

    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({
      sql: normalize(sql),
      params: params ?? [],
    }));

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining('from public.work_orders wo where wo.status = any($1::text[]) and wo.site_id = $2::uuid'),
          params: expect.arrayContaining([SITE_ID]),
        }),
        expect.objectContaining({
          sql: expect.stringContaining('from public.purchase_orders po where po.org_id = app.current_org_id() and po.status = any($1::text[]) and po.site_id = $2::uuid'),
          params: expect.arrayContaining([SITE_ID]),
        }),
        expect.objectContaining({
          sql: expect.stringContaining('from public.quality_holds qh where qh.hold_status = any($1::text[]) and qh.site_id = $2::uuid'),
          params: expect.arrayContaining([SITE_ID]),
        }),
        expect.objectContaining({
          sql: expect.stringContaining("from public.shipments s where s.created_at::date = (now() at time zone 'utc')::date and s.site_id = $1::uuid"),
          params: [SITE_ID],
        }),
        expect.objectContaining({
          sql: expect.stringContaining("from public.shipments s where s.status = 'exception' and s.site_id = $1::uuid"),
          params: [SITE_ID],
        }),
      ]),
    );
  });

  it('scopes low stock to the inventory subquery only and counts distinct items', async () => {
    await getDashboardData();

    const lowStockCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).includes('from public.reorder_thresholds rt'),
    );

    expect(lowStockCall).toBeDefined();
    const [sql, params] = lowStockCall as [string, readonly unknown[]];
    const normalized = normalize(sql);

    expect(normalized).toContain('select count(distinct rt.item_id)::int as n');
    expect(normalized).toContain(
      'from public.v_inventory_available where org_id = app.current_org_id() and site_id = $1::uuid group by product_id',
    );
    expect(normalized).toContain('where rt.org_id = app.current_org_id()');
    expect(normalized).not.toContain('rt.site_id');
    expect(params).toEqual([SITE_ID]);
  });

  it('fails closed with a null active-site bind without throwing', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    const result = await getDashboardData();

    expect(result.ok).toBe(true);
    expect(result.kpis).toEqual([
      expect.objectContaining({ key: 'activeWos', value: 0 }),
      expect.objectContaining({ key: 'pendingPos', value: 0 }),
      expect.objectContaining({ key: 'lowStock', value: 0 }),
      expect.objectContaining({ key: 'qualityHolds', value: 0 }),
      expect.objectContaining({ key: 'shipmentsToday', value: 0 }),
    ]);
    expect(result.alerts).toEqual([]);
    expect(vi.mocked(client.query).mock.calls.some(([, params]) => params?.includes(null))).toBe(true);
  });
});
