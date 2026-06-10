'use server';

import { randomUUID } from 'crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  CreateWorkOrderInput,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  mapMaterial,
  mapSchedule,
  mapWoHeader,
  type CreateWorkOrderResult,
  type ScheduleOutputRow,
  type WOMaterialRow,
  type WorkOrderRow,
} from './shared';

export async function createWorkOrder(params: {
  productId: string;
  itemCode: string;
  plannedQuantity: string;
  scheduledStartTime?: string;
  productionLineId?: string;
  machineId?: string;
  notes?: string;
}): Promise<CreateWorkOrderResult> {
  const parsed = CreateWorkOrderInput.safeParse(params);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

  try {
    return await withOrgContext(async (ctx): Promise<CreateWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const woId = randomUUID();
      const woNumber = `WO-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${woId.slice(0, 8).toUpperCase()}`;

      const activeBom = await ctx.client.query<{ id: string; version: number }>(
        `select id, version
           from public.bom_headers
          where org_id = app.current_org_id()
            and product_id = $1
            and status = 'active'
          order by version desc
          limit 1`,
        [input.itemCode],
      );
      const bom = activeBom.rows[0];

      const insertedWo = await ctx.client.query<WorkOrderRow>(
        `insert into public.work_orders
           (id, org_id, wo_number, product_id, item_type_at_creation, active_bom_header_id,
            planned_quantity, uom, status, scheduled_start_time, production_line_id, machine_id,
            source_of_demand, source_reference, ext_jsonb, created_by, updated_by)
         values
           ($1::uuid, app.current_org_id(), $2, $3::uuid, 'fg', $4::uuid,
            $5::numeric, 'kg', 'DRAFT', $6::timestamptz, $7::uuid, $8::uuid,
            'manual', $9, $10::jsonb, $11::uuid, $11::uuid)
         returning id, wo_number, product_id, $9::text as item_code, item_type_at_creation,
                   planned_quantity::text as planned_quantity, produced_quantity::text as produced_quantity,
                   uom, status, scheduled_start_time, scheduled_end_time, production_line_id, machine_id,
                   priority, source_of_demand, source_reference, ext_jsonb->>'notes' as notes, created_at, updated_at`,
        [
          woId,
          woNumber,
          input.productId,
          bom?.id ?? null,
          input.plannedQuantity,
          input.scheduledStartTime ?? null,
          input.productionLineId ?? null,
          input.machineId ?? null,
          input.itemCode,
          JSON.stringify({ notes: input.notes ?? null, app_version: APP_VERSION }),
          ctx.userId,
        ],
      );
      const workOrder = insertedWo.rows[0];
      if (!workOrder) throw new Error('work_order_insert_returned_no_row');

      let materialRows: WOMaterialRow[] = [];
      if (bom) {
        const insertedMaterials = await ctx.client.query<WOMaterialRow>(
          `insert into public.wo_materials
             (org_id, wo_id, product_id, material_name, required_qty, uom, sequence,
              bom_item_id, bom_version, material_source, notes)
           select app.current_org_id(), $1::uuid, coalesce(i.id, bl.id), bl.component_code,
                  round((bl.quantity * $2::numeric), 3), bl.uom, coalesce(bl.sequence, bl.line_no),
                  bl.id, $3::integer, 'stock', bl.notes
             from public.bom_lines bl
             left join public.items i
               on i.org_id = app.current_org_id()
              and i.item_code = bl.component_code
            where bl.org_id = app.current_org_id()
              and bl.bom_header_id = $4::uuid
            order by bl.line_no
           returning id, wo_id, product_id, material_name, required_qty::text as required_qty,
                     consumed_qty::text as consumed_qty, reserved_qty::text as reserved_qty, uom,
                     sequence, material_source, bom_item_id, bom_version, notes`,
          [woId, input.plannedQuantity, bom.version, bom.id],
        );
        materialRows = insertedMaterials.rows;
      }

      const insertedSchedule = await ctx.client.query<ScheduleOutputRow>(
        `insert into public.schedule_outputs
           (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct, disposition, notes)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, 'primary', $3::numeric, 'kg', 100.00, 'to_stock', $4)
         returning id, planned_wo_id, product_id, output_role, expected_qty::text as expected_qty,
                   uom, allocation_pct::text as allocation_pct, disposition, downstream_wo_id, notes`,
        [woId, input.productId, input.plannedQuantity, input.notes ?? null],
      );
      const primarySchedule = insertedSchedule.rows[0];
      if (!primarySchedule) throw new Error('schedule_output_insert_returned_no_row');

      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, null, 'DRAFT', 'create', $2::uuid, $3::jsonb)`,
        [woId, ctx.userId, JSON.stringify({ app_version: APP_VERSION, bom_header_id: bom?.id ?? null })],
      );

      return {
        ok: true,
        workOrder: mapWoHeader(workOrder),
        materials: materialRows.map(mapMaterial),
        primarySchedule: mapSchedule(primarySchedule),
        warning: bom ? undefined : 'no_active_bom',
      };
    });
  } catch (error) {
    console.error('[createWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
