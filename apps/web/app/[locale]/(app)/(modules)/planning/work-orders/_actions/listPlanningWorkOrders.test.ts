import { beforeEach, describe, expect, it, vi } from 'vitest';

import { maxSqlPlaceholderIndex } from '../../../../../../../lib/shared/sql-placeholders';
import { listPlanningWorkOrders } from './listPlanningWorkOrders';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const EXECUTION_ID = '55555555-5555-4555-8555-555555555555';
const SCHEDULE_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;
let listTotal = 120;

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

function makeSummaryRow(index: number) {
  return {
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    wo_number: `WO-${String(index).padStart(3, '0')}`,
    product_id: PRODUCT_ID,
    item_code: `FG-${index}`,
    item_type_at_creation: 'fg',
    planned_quantity: '1000.000',
    produced_quantity: null,
    uom: 'kg',
    status: 'RELEASED',
    scheduled_start_time: '2026-06-09T08:00:00.000Z',
    scheduled_end_time: null,
    production_line_id: null,
    priority: 'normal',
    source_of_demand: 'manual',
    source_reference: `FG-${index}`,
    notes: 'demo',
    created_at: '2026-06-09T07:00:00.000Z',
    updated_at: '2026-06-09T07:00:00.000Z',
    material_count: 2,
    operation_count: 1,
    latest_execution: {
      id: EXECUTION_ID,
      wo_id: WO_ID,
      status: 'planned',
      version: 0,
      started_at: null,
      paused_at: null,
      resumed_at: null,
      completed_at: null,
      closed_at: null,
      cancelled_at: null,
    },
    primary_schedule: {
      id: SCHEDULE_ID,
      planned_wo_id: WO_ID,
      product_id: PRODUCT_ID,
      output_role: 'primary',
      expected_qty: '1000.000',
      uom: 'kg',
      allocation_pct: '100.00',
      disposition: 'to_stock',
      downstream_wo_id: null,
      notes: null,
    },
  };
}

function expectSqlArity(sql: string, params: readonly unknown[] | undefined) {
  expect(params).toHaveLength(maxSqlPlaceholderIndex(String(sql)));
}

describe('listPlanningWorkOrders', () => {
  beforeEach(() => {
    listTotal = 120;
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.includes('select count(*)::int as total')) {
          expectSqlArity(sql, params);
          return { rows: [{ total: listTotal }], rowCount: 1 };
        }
        if (normalized.includes('group by wo.status')) {
          expectSqlArity(sql, params);
          return {
            rows: [
              { status: 'RELEASED', n: 80 },
              { status: 'DRAFT', n: 40 },
            ],
            rowCount: 2,
          };
        }
        if (normalized.startsWith('select count(*) as archived_count')) {
          expectSqlArity(sql, params);
          return { rows: [{ archived_count: 2 }], rowCount: 1 };
        }
        if (normalized.includes('to_jsonb(exec.*)')) {
          expectSqlArity(sql, params);
          const limit = Number(params[4] ?? 50);
          const offset = Number(params[5] ?? 0);
          const allRows = Array.from({ length: listTotal }, (_, index) => makeSummaryRow(index + 1));
          const rows = allRows.slice(offset, offset + limit);
          return { rows, rowCount: rows.length };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it('returns summaries with latest execution and primary schedule payloads', async () => {
    const result = await listPlanningWorkOrders({ status: 'RELEASED', search: 'FG', limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrders).toHaveLength(10);
    expect(result.workOrders[0]).toEqual(
      expect.objectContaining({
        woNumber: 'WO-001',
        itemCode: 'FG-1',
        materialCount: 2,
        operationCount: 1,
        latestExecution: expect.objectContaining({ id: EXECUTION_ID, status: 'planned' }),
        primarySchedule: expect.objectContaining({ id: SCHEDULE_ID, outputRole: 'primary' }),
      }),
    );
    expect(result.pagination).toMatchObject({
      total: 120,
      page: 1,
      limit: 10,
      offset: 0,
      hasMore: true,
    });
    expect(result.archivedCount).toBe(2);
    expect(result.statusCounts).toEqual({
      all: 120,
      DRAFT: 40,
      RELEASED: 80,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      COMPLETED: 0,
      CLOSED: 0,
      CANCELLED: 0,
    });
    const groupCall = vi.mocked(client.query).mock.calls.find(([sql]) => String(sql).includes('group by wo.status'));
    expect(groupCall?.[1]).toEqual([null, 'FG', SITE_ID, false]);
    const dataCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('to_jsonb(exec.*)'),
    );
    expect(dataCall?.[1]).toEqual(['RELEASED', 'FG', SITE_ID, false, 10, 0]);
    expect(String(dataCall?.[0])).toContain('coalesce(wo.site_id, pl.site_id) = $3::uuid');
    expect(String(dataCall?.[0])).toContain('wo.id desc');
  });

  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    const result = await listPlanningWorkOrders({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.pagination).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.workOrders[0]).toEqual(expect.objectContaining({ woNumber: 'WO-051' }));
    const dataCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('to_jsonb(exec.*)'),
    );
    expect(dataCall?.[1]).toEqual([null, null, SITE_ID, false, 50, 50]);
    expect(String(dataCall?.[0])).toContain('limit $5 offset $6');
  });

  it('passes archived=true to return only archived work orders', async () => {
    await listPlanningWorkOrders({ archived: true });

    const dataCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('to_jsonb(exec.*)'),
    );
    expect(dataCall?.[1]).toEqual([null, null, SITE_ID, true, 50, 0]);
  });

  it('treats a null active site as All sites and returns org-wide work orders', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    const result = await listPlanningWorkOrders({});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrders).toHaveLength(50);
    const dataCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('to_jsonb(exec.*)'),
    );
    expect(dataCall?.[1]).toEqual([null, null, null, false, 50, 0]);
    expect(String(dataCall?.[0])).toContain('coalesce(wo.site_id, pl.site_id) = $3::uuid');
    const archivedCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('archived_count'),
    );
    expect(archivedCall?.[1]).toEqual([null, null, null]);
    expect(String(archivedCall?.[0])).toContain('coalesce(wo.site_id, pl.site_id) = $3::uuid');
  });

  it('scopes active site through production line when wo.site_id is null (pilot FG rows)', async () => {
    listTotal = 1;
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      expect(String(sql)).toContain('coalesce(wo.site_id, pl.site_id) = $3::uuid');
      if (normalized.includes('select count(*)::int as total')) {
        return { rows: [{ total: 1 }], rowCount: 1 };
      }
      if (normalized.includes('group by wo.status')) {
        return { rows: [{ status: 'RELEASED', n: 1 }], rowCount: 1 };
      }
      if (normalized.startsWith('select count(*) as archived_count')) {
        return { rows: [{ archived_count: 0 }], rowCount: 1 };
      }
      if (normalized.includes('to_jsonb(exec.*)')) {
        expect(params).toEqual(['RELEASED', 'WO-pilot-FG-016', SITE_ID, false, 50, 0]);
        return {
          rows: [{
            ...makeSummaryRow(16),
            wo_number: 'WO-pilot-FG-016',
            item_code: 'FG-016',
            status: 'RELEASED',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await listPlanningWorkOrders({ status: 'RELEASED', search: 'WO-pilot-FG-016' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrders).toEqual([
      expect.objectContaining({ woNumber: 'WO-pilot-FG-016', itemCode: 'FG-016', status: 'RELEASED' }),
    ]);
  });

  it('returns a released pilot FG row when only the production line site matches the active site filter', async () => {
    listTotal = 1;
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('select count(*)::int as total')) {
        expect(params[2]).toBe(SITE_ID);
        return { rows: [{ total: 1 }], rowCount: 1 };
      }
      if (normalized.includes('group by wo.status')) {
        return { rows: [{ status: 'RELEASED', n: 1 }], rowCount: 1 };
      }
      if (normalized.startsWith('select count(*) as archived_count')) {
        return { rows: [{ archived_count: 0 }], rowCount: 1 };
      }
      if (normalized.includes('to_jsonb(exec.*)')) {
        return {
          rows: [{
            ...makeSummaryRow(16),
            wo_number: 'WO-pilot-FG-016',
            item_code: 'FG-016',
            status: 'RELEASED',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await listPlanningWorkOrders({ search: 'WO-pilot-FG-016' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrders[0]?.woNumber).toBe('WO-pilot-FG-016');
    expect(String(vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('to_jsonb(exec.*)'),
    )?.[0])).toContain('left join public.production_lines pl');
  });

  it('returns persistence_failed when the query fails', async () => {
    client.query = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(listPlanningWorkOrders({})).resolves.toEqual({ ok: false, error: 'persistence_failed' });
  });
});
