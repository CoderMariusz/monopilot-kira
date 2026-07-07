import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listShipments } from '../pack-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';

let client: QueryClient;
let allowPermission = true;
let listTotal = 1;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.startsWith('select count(*)::int as total') && q.includes('from public.shipments sh')) {
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (q.includes('from public.shipments sh') && q.includes('limit $2::int offset $3::int')) {
        const offset = Number(params[2] ?? 0);
        const index = offset + 1;
        if (index > listTotal) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: SHIPMENT_ID,
              shipment_number: `SH-202606-${String(index).padStart(5, '0')}`,
              status: 'packing',
              sales_order_number: 'SO-1',
              customer_name: 'Acme',
              customer_code: 'ACME',
              box_count: 1,
              created_at: '2026-06-11T10:00:00.000Z',
              packed_at: null,
              shipped_at: null,
              total_weight_kg: '10',
              carrier: null,
              promised_ship_date: null,
              required_delivery_date: null,
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
  queryLog = [];
  client = makeClient();
});

describe('listShipments pagination', () => {
  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listShipments({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(
      expect.objectContaining({ shipmentNumber: 'SH-202606-00051' }),
    );
    const listQuery = queryLog.find((entry) => normalize(entry.sql).includes('offset $3::int'));
    expect(listQuery?.params).toEqual([null, 50, 50]);
  });
});
