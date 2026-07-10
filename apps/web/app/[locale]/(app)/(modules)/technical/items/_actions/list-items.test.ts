import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ITEM_CHOOSER_MAX_LIMIT } from '../../../../../../../lib/shared/pagination';
import { maxSqlPlaceholderIndex } from '../../../../../../../lib/shared/sql-placeholders';
import { listItems } from './list-items';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];

const client = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    calls.push({ sql: normalized, params: params ?? [] });
    if (normalized.includes('group by 1')) {
      return {
        rows: [
          { item_type: 'rm', n: 30 },
          { item_type: 'fg', n: 90 },
        ],
        rowCount: 2,
      };
    }
    if (normalized.includes('select count(*)::int as total')) {
      return { rows: [{ total: 45 }], rowCount: 1 };
    }
    if (normalized.startsWith('select i.id')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

beforeEach(() => {
  calls = [];
  vi.mocked(client.query).mockClear();
});

describe('listItems', () => {
  it('passes search, type, status, d365 filters, and pagination params to SQL', async () => {
    const result = await listItems({
      search: 'sugar',
      itemType: 'rm',
      status: 'active',
      d365: 'drift',
      page: 2,
      limit: 25,
      itemTypes: ['rm', 'ingredient'],
    });

    expect(result.state).toBe('ready');
    expect(result.pagination).toMatchObject({
      total: 45,
      page: 2,
      limit: 25,
      offset: 25,
      hasMore: true,
    });
    expect(result.typeCounts.all).toBe(120);
    expect(result.typeCounts.rm).toBe(30);

    const dataCall = calls.find((call) => call.sql.startsWith('select i.id'));
    expect(dataCall?.params).toEqual([['rm', 'ingredient'], 'sugar', 'rm', 'active', 'drift', 25, 25]);
    expectSqlArity(dataCall?.sql ?? '', dataCall?.params);

    const countCall = calls.find((call) => call.sql.includes('select count(*)::int as total'));
    expect(countCall?.params).toEqual([['rm', 'ingredient'], 'sugar', 'rm', 'active', 'drift']);

    const typeCall = calls.find((call) => call.sql.includes('group by 1'));
    expect(typeCall?.params).toEqual([['rm', 'ingredient'], 'sugar']);
  });

  it('defaults chooser consumers to the full 200-row cap when page is omitted', async () => {
    const result = await listItems({ itemTypes: ['fg'] });

    expect(result.state).toBe('ready');
    expect(result.pagination.limit).toBe(ITEM_CHOOSER_MAX_LIMIT);
    expect(result.pagination.offset).toBe(0);

    const dataCall = calls.find((call) => call.sql.startsWith('select i.id'));
    expect(dataCall?.params.at(-2)).toBe(ITEM_CHOOSER_MAX_LIMIT);
    expect(dataCall?.params.at(-1)).toBe(0);
  });

  it('defaults paginated list pages to 50 rows per page', async () => {
    const result = await listItems({ page: 1 });

    expect(result.pagination.limit).toBe(50);
    const dataCall = calls.find((call) => call.sql.startsWith('select i.id'));
    expect(dataCall?.params.at(-2)).toBe(50);
  });

  it('keeps state ready when filters match zero rows but the catalog is not empty', async () => {
    vi.mocked(client.query).mockImplementation(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      calls.push({ sql: normalized, params: params ?? [] });
      if (normalized.includes('group by 1')) {
        return { rows: [{ item_type: 'rm', n: 12 }], rowCount: 1 };
      }
      if (normalized.includes('select count(*)::int as total')) {
        return { rows: [{ total: 0 }], rowCount: 1 };
      }
      if (normalized.startsWith('select i.id')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await listItems({ page: 1, search: 'no-match' });

    expect(result.state).toBe('ready');
    expect(result.pagination.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('returns catalog-empty only when the unfiltered scope has no items', async () => {
    vi.mocked(client.query).mockImplementation(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      calls.push({ sql: normalized, params: params ?? [] });
      if (normalized.includes('group by 1')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('select count(*)::int as total')) {
        return { rows: [{ total: 0 }], rowCount: 1 };
      }
      if (normalized.startsWith('select i.id')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await listItems({ page: 1 });

    expect(result.state).toBe('empty');
    expect(result.typeCounts.all).toBe(0);
  });
});

function expectSqlArity(sql: string, params: readonly unknown[] | undefined) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(String(sql)));
}
