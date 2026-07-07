import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listGrns } from './grn-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '99999999-9999-4999-8999-999999999999';
const GRN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let client: QueryClient;
let allowPermission = true;
let listTotal = 1;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.startsWith('select count(*)::int as total') && q.includes('from public.grns g')) {
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (q.includes('from public.grns g') && q.includes('limit $5::integer offset $6::integer')) {
        const offset = Number(params[5] ?? 0);
        const index = offset + 1;
        if (index > listTotal) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: GRN_ID,
              grn_number: `GRN-202606-${String(index).padStart(5, '0')}`,
              source_type: 'po',
              status: 'draft',
              supplier_id: null,
              supplier_name: null,
              warehouse_id: 'wh-1',
              warehouse_code: 'WH1',
              receipt_date: '2026-06-11',
              completed_at: null,
              po_id: null,
              item_count: 1,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  listTotal = 1;
  client = makeClient();
});

describe('listGrns pagination', () => {
  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listGrns({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(expect.objectContaining({ grnNumber: 'GRN-202606-00051' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('limit $5::integer offset $6::integer'),
    );
    expect(listQuery?.[1]).toEqual([null, null, null, SITE_ID, 50, 50]);
  });
});
