import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadEcoPage } from './page-data';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let client: QueryClient;
let canWrite = true;
let listTotal = 1;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async (_ctx: unknown, permission: string) => {
      if (permission === actual.ECO_WRITE_PERMISSION) return canWrite;
      if (permission === actual.ECO_APPROVE_PERMISSION) return true;
      return false;
    }),
  };
});

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.startsWith('select count(*)::int as total') && q.includes('from public.technical_change_orders co')) {
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (q.includes('from public.technical_change_orders co') && q.includes('limit $2::integer offset $3::integer')) {
        const offset = Number(params[2] ?? 0);
        const index = offset + 1;
        if (index > listTotal) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: `eco-${index}`,
              code: `ECO-${String(index).padStart(5, '0')}`,
              title: `Change ${index}`,
              status: 'draft',
              status_tone: 'muted',
              priority: 'normal',
              change_type: 'engineering',
              target_item_id: null,
              target_bom_header_id: null,
              target_factory_spec_id: null,
              updated_at: '2026-06-11T10:00:00.000Z',
              line_count: 1,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.items')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('group by status')) {
        return { rows: [{ status: 'draft', n: listTotal }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  canWrite = true;
  listTotal = 1;
  client = makeClient();
});

describe('loadEcoPage pagination', () => {
  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await loadEcoPage(undefined, 2);

    expect(result.state).toBe('ready');
    expect(result.pagination).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.changeOrders[0]).toEqual(expect.objectContaining({ code: 'ECO-00051' }));
    const listQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('limit $2::integer offset $3::integer'),
    );
    expect(listQuery?.[1]).toEqual([null, 50, 50]);
  });
});
