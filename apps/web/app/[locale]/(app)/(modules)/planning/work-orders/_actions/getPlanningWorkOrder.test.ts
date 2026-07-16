import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlanningWorkOrder } from './getPlanningWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const BOM_HEADER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FACTORY_SPEC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

describe('getPlanningWorkOrder', () => {
  beforeEach(() => {
    client = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
        if (normalized.includes('from public.work_orders wo')) {
          return {
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
                status: 'DRAFT',
                scheduled_start_time: null,
                scheduled_end_time: null,
                production_line_id: null,
                production_line_code: null,
                production_line_name: null,
                priority: 'normal',
                source_of_demand: 'manual',
                source_reference: 'FG-NPD-004',
                notes: null,
                qty_entered: null,
                qty_entered_uom: null,
                uom_snapshot: null,
                active_bom_header_id: BOM_HEADER_ID,
                active_bom_version: 3,
                active_factory_spec_id: FACTORY_SPEC_ID,
                active_factory_spec_version: 2,
                active_factory_spec_code: 'FS-FG-004',
                created_at: '2026-06-09T07:00:00.000Z',
                updated_at: '2026-06-09T07:00:00.000Z',
              },
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.wo_materials')) {
          return {
            rows: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                wo_id: WO_ID,
                product_id: '77777777-7777-4777-8777-777777777777',
                material_name: 'Flour',
                required_qty: '700.000',
                consumed_qty: '0.000',
                reserved_qty: '0.000',
                uom: 'kg',
                sequence: 1,
                material_source: 'stock',
                bom_item_id: null,
                bom_version: null,
                notes: null,
              },
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.wo_operations')) {
          return {
            rows: [
              {
                id: '66666666-6666-4666-8666-666666666666',
                wo_id: WO_ID,
                sequence: 1,
                operation_name: 'Mix',
                line_id: null,
                expected_duration_minutes: 90,
                expected_yield_percent: '98.5000',
                actual_duration: null,
                actual_yield: null,
                status: 'pending',
                notes: null,
              },
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.schedule_outputs')) {
          return {
            rows: [
              {
                id: '88888888-8888-4888-8888-888888888888',
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
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.wo_dependencies')) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.wo_status_history')) {
          return {
            rows: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                wo_id: WO_ID,
                from_status: null,
                to_status: 'DRAFT',
                action: 'create',
                user_id: USER_ID,
                override_reason: null,
                context_jsonb: {},
                occurred_at: '2026-06-09T07:00:00.000Z',
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it('returns the seven-tab detail payload', async () => {
    const result = await getPlanningWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(
      expect.objectContaining({
        id: WO_ID,
        productionLineCode: null,
        productionLineName: null,
        qtyEntered: null,
        qtyEnteredUom: null,
        uomSnapshot: null,
        activeBomHeaderId: BOM_HEADER_ID,
        activeBomVersion: 3,
        activeFactorySpecId: FACTORY_SPEC_ID,
        activeFactorySpecVersion: 2,
        activeFactorySpecCode: 'FS-FG-004',
        materials: [expect.objectContaining({ materialName: 'Flour' })],
        operations: [expect.objectContaining({ operationName: 'Mix' })],
        schedules: [expect.objectContaining({ outputRole: 'primary' })],
        dependencies: [],
        statusHistory: [expect.objectContaining({ action: 'create' })],
      }),
    );
  });

  it('returns not_found when the WO is absent', async () => {
    client.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

    await expect(getPlanningWorkOrder({ id: WO_ID })).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('joins production_lines for human-readable line labels (C039)', async () => {
    const lineId = '9a9d4be6-cda1-45ea-a1e0-5f7ded346c76';
    client.query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.work_orders wo')) {
        expect(normalized).toContain('left join public.production_lines pl');
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-pilot-FG-016',
              product_id: PRODUCT_ID,
              item_code: 'FG-016',
              item_type_at_creation: 'fg',
              planned_quantity: '200.000',
              produced_quantity: null,
              uom: 'kg',
              status: 'RELEASED',
              scheduled_start_time: '2026-07-12T00:00:00.000Z',
              scheduled_end_time: null,
              production_line_id: lineId,
              production_line_code: 'LINE01',
              production_line_name: 'Tester line',
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: null,
              notes: null,
              qty_entered: null,
              qty_entered_uom: null,
              uom_snapshot: null,
              active_bom_header_id: null,
              active_bom_version: null,
              active_factory_spec_id: null,
              active_factory_spec_version: null,
              active_factory_spec_code: null,
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await getPlanningWorkOrder({ id: WO_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.productionLineCode).toBe('LINE01');
    expect(result.workOrder.productionLineName).toBe('Tester line');
    expect(result.workOrder.productionLineId).toBe(lineId);
  });
});
