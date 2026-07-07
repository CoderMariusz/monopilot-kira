import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listStockMoves } from './stock-move-actions';
import type { QueryClient } from './shared';

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

function makeMoveRow(index: number) {
  return {
    id: `move-${index}`,
    move_number: `SM-${index}`,
    lp_id: `lp-${index}`,
    lp_number: `LP-${index}`,
    move_type: 'transfer',
    from_location_code: 'A-01',
    to_location_code: 'B-02',
    quantity: '10',
    uom: 'kg',
    move_date: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    reason_text: null,
    source: 'stock_move' as const,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('select count(*)::int as total')) {
        return { rows: [{ total: 120 }], rowCount: 1 };
      }
      if (q.includes('order by move_date desc')) {
        const limit = Number(params?.[1] ?? 50);
        const offset = Number(params?.[2] ?? 0);
        const allRows = Array.from({ length: 120 }, (_, index) => makeMoveRow(index + 1));
        return {
          rows: allRows.slice(offset, offset + limit),
          rowCount: Math.min(limit, Math.max(0, 120 - offset)),
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  getActiveSiteIdMock.mockResolvedValue(SITE_ID);
  client = makeClient();
});

describe('listStockMoves pagination', () => {
  it('returns page 3 rows and the full total when more than the page cap exists', async () => {
    const result = await listStockMoves({ page: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(120);
    expect(result.data.page).toBe(3);
    expect(result.data.offset).toBe(100);
    expect(result.data.items).toHaveLength(20);
    expect(result.data.hasMore).toBe(false);

    const dataCall = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).includes('order by move_date desc'));
    expect(dataCall?.[1]).toEqual([null, 50, 100, SITE_ID]);
  });
});
