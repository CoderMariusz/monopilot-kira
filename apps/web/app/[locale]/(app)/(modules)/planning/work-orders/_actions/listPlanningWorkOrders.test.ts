import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listPlanningWorkOrders } from './listPlanningWorkOrders';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const EXECUTION_ID = '55555555-5555-4555-8555-555555555555';
const SCHEDULE_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

describe('listPlanningWorkOrders', () => {
  beforeEach(() => {
    client = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: WO_ID,
            wo_number: 'WO-001',
            product_id: PRODUCT_ID,
            item_code: 'FG-NPD-004',
            item_type_at_creation: 'fg',
            planned_quantity: '1000.000',
            produced_quantity: null,
            uom: 'kg',
            status: 'RELEASED',
            scheduled_start_time: '2026-06-09T08:00:00.000Z',
            scheduled_end_time: null,
            production_line_id: null,
            machine_id: null,
            priority: 'normal',
            source_of_demand: 'manual',
            source_reference: 'FG-NPD-004',
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
          },
        ],
        rowCount: 1,
      })),
    };
  });

  it('returns summaries with latest execution and primary schedule payloads', async () => {
    const result = await listPlanningWorkOrders({ status: 'RELEASED', search: 'FG', limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrders).toEqual([
      expect.objectContaining({
        id: WO_ID,
        woNumber: 'WO-001',
        itemCode: 'FG-NPD-004',
        materialCount: 2,
        operationCount: 1,
        latestExecution: expect.objectContaining({ id: EXECUTION_ID, status: 'planned' }),
        primarySchedule: expect.objectContaining({ id: SCHEDULE_ID, outputRole: 'primary' }),
      }),
    ]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('from public.work_orders wo'), ['RELEASED', 'FG', 10]);
  });

  it('returns persistence_failed when the query fails', async () => {
    client.query = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(listPlanningWorkOrders({})).resolves.toEqual({ ok: false, error: 'persistence_failed' });
  });
});
