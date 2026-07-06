import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../../lib/scanner/session';

const session: ScannerSessionRow = {
  id: '10000000-0000-0000-0000-000000000001',
  org_id: '20000000-0000-0000-0000-000000000001',
  user_id: '30000000-0000-0000-0000-000000000001',
  device_id: '40000000-0000-0000-0000-000000000001',
  site_id: null,
  line_id: '50000000-0000-0000-0000-000000000001',
  shift: 'A',
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date('2030-01-01T00:00:00Z'),
  ended_at: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  last_seen_at: new Date('2026-01-01T00:00:00Z'),
};

const packingLineId = '60000000-0000-0000-0000-000000000099';

const fakeClient = {
  query: vi.fn(),
};

vi.mock('../../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

function txnStubs(sql: string): { rows: unknown[] } | null {
  if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };
  if (sql.includes('insert into app.session_org_contexts')) return { rows: [] };
  if (sql.includes('select app.set_org_context')) return { rows: [] };
  if (sql.includes('delete from app.session_org_contexts')) return { rows: [] };
  return null;
}

describe('GET /api/production/scanner/wos — operation-aware line scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
  });

  it('scopes the list SQL to wo_operations.line_id as well as production_line_id', async () => {
    const { GET } = await import('../route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      const stub = txnStubs(sql);
      if (stub) return stub;
      if (sql.includes('from public.work_orders wo')) {
        return {
          rows: [
            {
              id: 'wo-pack',
              wo_number: 'WO-PIZZA-01',
              status: 'released',
              item_code: 'PIZZA',
              product_name: 'Margherita',
              planned_qty: '100',
              qty_entered: null,
              qty_entered_uom: null,
              uom_snapshot: null,
              scheduled_start: null,
              line_id: 'oven-line',
              line_code: 'OVEN',
              station_operations: [
                {
                  id: 'op-pack',
                  sequence: 3,
                  operationName: 'Pack',
                  status: 'pending',
                  lineId: session.line_id,
                  lineCode: 'PACK',
                },
              ],
            },
          ],
        };
      }
      if (sql.includes('insert into public.scanner_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    const response = await GET(
      new Request('https://web.test/api/production/scanner/wos', {
        headers: { authorization: 'Bearer token' },
      }),
    );
    const body = await response.json();

    const listSql = String(fakeClient.query.mock.calls.find(([sql]) => String(sql).includes('from public.work_orders wo'))?.[0] ?? '');
    expect(listSql).toContain('wo_operations');
    expect(listSql).not.toMatch(/wo\.production_line_id = \$1::uuid\s*\)/);

    expect(body.ok).toBe(true);
    expect(body.wos[0].stationOperations).toEqual([
      expect.objectContaining({ operationName: 'Pack', sequence: 3 }),
    ]);
  });
});

describe('GET /api/production/scanner/wos/[id] — station operations on detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
  });

  it('returns stationOperations for ops on the session line even when header line differs', async () => {
    const { GET } = await import('../[id]/route');
    const woId = '70000000-0000-0000-0000-000000000001';

    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const stub = txnStubs(sql);
      if (stub) return stub;
      if (sql.includes('from public.work_orders wo') && sql.includes('limit 1')) {
        expect(sql).toContain('wo_operations');
        expect(params?.[1]).toBe(session.line_id);
        return {
          rows: [
            {
              id: woId,
              wo_number: 'WO-PIZZA-01',
              status: 'released',
              item_code: 'PIZZA',
              product_name: 'Margherita',
              planned_qty: '100',
              qty_entered: null,
              qty_entered_uom: null,
              uom_snapshot: null,
              scheduled_start: null,
              line_id: packingLineId,
              line_code: 'OVEN',
              station_operations: [
                {
                  id: 'op-pack',
                  sequence: 3,
                  operationName: 'Pack',
                  status: 'pending',
                  lineId: session.line_id,
                  lineCode: 'PACK',
                },
              ],
              produced_base_kg: '0',
              produced_units: '0',
              allergen_flag: false,
            },
          ],
        };
      }
      if (sql.includes('from public.wo_materials')) return { rows: [] };
      if (sql.includes('from public.wo_outputs')) return { rows: [] };
      if (sql.includes('insert into public.scanner_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    const response = await GET(
      new Request(`https://web.test/api/production/scanner/wos/${woId}`, {
        headers: { authorization: 'Bearer token' },
      }),
      { params: Promise.resolve({ id: woId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.header.lineId).toBe(packingLineId);
    expect(body.stationOperations).toEqual([
      expect.objectContaining({ operationName: 'Pack', lineId: session.line_id }),
    ]);
  });
});
