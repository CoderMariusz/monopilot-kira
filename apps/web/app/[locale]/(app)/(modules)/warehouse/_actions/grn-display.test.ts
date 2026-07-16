import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGrnDetail, listGrns } from './grn-actions';
import { parseGrnItemCount } from '../grns/_lib/grn-read-model';

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
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

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
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.startsWith('select count(*)::int as total') && q.includes('from public.grns g')) {
        return { rows: [{ total: 1 }], rowCount: 1 };
      }
      if (q.includes('from public.grns g') && q.includes('left join lateral') && q.includes('limit $5::integer offset $6::integer')) {
        return {
          rows: [
            {
              id: GRN_ID,
              grn_number: 'GRN-20260715-0001',
              source_type: 'po',
              status: 'completed',
              supplier_id: 'sup-1',
              supplier_name: 'Acme',
              warehouse_id: 'wh-1',
              warehouse_code: 'WH1',
              receipt_date: '2026-07-15',
              completed_at: '2026-07-15T12:00:00.000Z',
              po_id: 'po-1',
              item_count: 3,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.grns g') && q.includes('and g.id = $1::uuid') && q.includes('limit 1') && !q.includes('grn_items')) {
        return {
          rows: [
            {
              id: GRN_ID,
              grn_number: 'GRN-20260715-0001',
              source_type: 'po',
              status: 'completed',
              supplier_id: 'sup-1',
              supplier_name: 'Acme',
              warehouse_id: 'wh-1',
              warehouse_code: 'WH1',
              receipt_date: '2026-07-15',
              completed_at: '2026-07-15T12:00:00.000Z',
              notes: null,
              po_id: 'po-1',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.grn_items gi') && q.includes('order by gi.line_number asc')) {
        return {
          rows: [
            {
              id: 'line-1',
              line_number: 1,
              product_id: 'prod-1',
              item_code: 'ING-FLOUR',
              item_name: 'Wheat Flour',
              po_line_id: 'pol-1',
              ordered_qty: '10',
              received_qty: '10',
              uom: 'kg',
              batch_number: 'B-1',
              expiry_date: '2026-08-30T00:00:00.000Z',
              lp_id: 'lp-1',
              lp_number: 'LP-0001',
              lp_qa_status: 'released',
              can_cancel: false,
              cancel_block_reason: 'grn_completed',
              cancelled_at: null,
              cancellation_reason_code: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.license_plates') && q.includes('and grn_id = $1::uuid')) {
        return {
          rows: [{ id: 'lp-1', lp_number: 'LP-0001', status: 'available', quantity: '10', uom: 'kg' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  queryLog = [];
  client = makeClient();
});

describe('GRN display fixes (C054/C055)', () => {
  it('C054 — listGrns rolls up live lines via lateral join scoped to the GRN org', async () => {
    expect(parseGrnItemCount('3')).toBe(3);

    await listGrns();

    const listQuery = queryLog.find((entry) => entry.sql.includes('left join lateral'));
    expect(listQuery?.sql).toContain('gi.org_id = g.org_id');
    expect(listQuery?.sql).toContain('gi.cancelled_at is null');
    expect(listQuery?.sql).toContain('coalesce(ic.item_count, 0)::int as item_count');
  });

  it('C055 — getGrnDetail selects coalesced expiry from line + LP sources', async () => {
    const result = await getGrnDetail(GRN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items[0]?.expiryDate).toBe('2026-08-30T00:00:00.000Z');

    const itemsQuery = queryLog.find((entry) => normalize(entry.sql).includes('order by gi.line_number asc'));
    expect(itemsQuery?.sql).toContain('coalesce(gi.expiry_date, lp.expiry_date, gi.best_before_date, lp.best_before_date)');
  });
});
