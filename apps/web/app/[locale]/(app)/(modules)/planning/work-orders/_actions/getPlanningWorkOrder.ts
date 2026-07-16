'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  mapDependency,
  mapMaterial,
  mapOperation,
  mapSchedule,
  mapStatusHistory,
  mapWoHeader,
  type GetPlanningWorkOrderResult,
  type WODependencyRow,
  type WOMaterialRow,
  type WOOperationRow,
  type WOStatusHistoryRow,
  type WorkOrderRow,
  type ScheduleOutputRow,
} from './shared';

export async function getPlanningWorkOrder(params: { id: string }): Promise<GetPlanningWorkOrderResult> {
  if (!params.id || !/^[0-9a-fA-F-]{36}$/.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }): Promise<GetPlanningWorkOrderResult> => {
      const header = await client.query<WorkOrderRow>(
        `select wo.id, wo.wo_number, wo.product_id, i.item_code, wo.item_type_at_creation,
                wo.planned_quantity::text as planned_quantity, wo.produced_quantity::text as produced_quantity,
                wo.uom, wo.status, wo.scheduled_start_time, wo.scheduled_end_time,
                wo.production_line_id, wo.priority, wo.source_of_demand,
                wo.source_reference, wo.ext_jsonb->>'notes' as notes,
                wo.qty_entered::text as qty_entered, wo.qty_entered_uom, wo.uom_snapshot,
                wo.active_bom_header_id, bh.version as active_bom_version,
                wo.active_factory_spec_id, fs.version as active_factory_spec_version,
                fs.spec_code as active_factory_spec_code,
                wo.created_at, wo.updated_at
           from public.work_orders wo
           left join public.items i on i.id = wo.product_id and i.org_id = app.current_org_id()
           left join public.bom_headers bh
             on bh.id = wo.active_bom_header_id
            and bh.org_id = app.current_org_id()
           left join public.factory_specs fs
             on fs.id = wo.active_factory_spec_id
            and fs.org_id = app.current_org_id()
          where wo.org_id = app.current_org_id()
            and wo.id = $1::uuid
          limit 1`,
        [params.id],
      );
      const workOrder = header.rows[0];
      if (!workOrder) return { ok: false, error: 'not_found' };

      const [materials, operations, schedules, dependencies, statusHistory] = await Promise.all([
        client.query<WOMaterialRow>(
          `select id, wo_id, product_id, material_name, required_qty::text as required_qty,
                  consumed_qty::text as consumed_qty, reserved_qty::text as reserved_qty,
                  uom, sequence, material_source, bom_item_id, bom_version, notes
             from public.wo_materials
            where org_id = app.current_org_id()
              and wo_id = $1::uuid
            order by sequence, created_at`,
          [params.id],
        ),
        client.query<WOOperationRow>(
          `select id, wo_id, sequence, operation_name, line_id, expected_duration_minutes,
                  expected_yield_percent::text as expected_yield_percent, actual_duration,
                  actual_yield::text as actual_yield, status, notes
             from public.wo_operations
            where org_id = app.current_org_id()
              and wo_id = $1::uuid
            order by sequence`,
          [params.id],
        ),
        client.query<ScheduleOutputRow>(
          `select id, planned_wo_id, product_id, output_role, expected_qty::text as expected_qty,
                  uom, allocation_pct::text as allocation_pct, disposition, downstream_wo_id, notes
             from public.schedule_outputs
            where org_id = app.current_org_id()
              and planned_wo_id = $1::uuid
            order by output_role, created_at`,
          [params.id],
        ),
        client.query<WODependencyRow>(
          `select id, parent_wo_id, child_wo_id, material_link, required_qty::text as required_qty, created_at
             from public.wo_dependencies
            where org_id = app.current_org_id()
              and (parent_wo_id = $1::uuid or child_wo_id = $1::uuid)
            order by created_at`,
          [params.id],
        ),
        client.query<WOStatusHistoryRow>(
          `select id, wo_id, from_status, to_status, action, user_id, override_reason, context_jsonb, occurred_at
             from public.wo_status_history
            where org_id = app.current_org_id()
              and wo_id = $1::uuid
            order by occurred_at desc`,
          [params.id],
        ),
      ]);

      return {
        ok: true,
        workOrder: {
          ...mapWoHeader(workOrder),
          materials: materials.rows.map(mapMaterial),
          operations: operations.rows.map(mapOperation),
          schedules: schedules.rows.map(mapSchedule),
          dependencies: dependencies.rows.map(mapDependency),
          statusHistory: statusHistory.rows.map(mapStatusHistory),
        },
      };
    });
  } catch (error) {
    console.error('[getPlanningWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
