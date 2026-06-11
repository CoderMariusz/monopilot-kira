'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  mapWoHeader,
  type ReleaseWorkOrderResult,
  type WorkOrderRow,
} from './shared';

type ReleasePreflightRow = {
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
};

export async function releaseWorkOrder(params: { id: string }): Promise<ReleaseWorkOrderResult> {
  if (!params.id || !/^[0-9a-fA-F-]{36}$/.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx): Promise<ReleaseWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const current = await ctx.client.query<{ status: string }>(
        `select status
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [params.id],
      );
      const status = current.rows[0]?.status;
      if (!status) return { ok: false, error: 'not_found' };
      if (status !== 'DRAFT') return { ok: false, error: 'invalid_state' };

      const healed = await ctx.client.query<ReleasePreflightRow>(
        `update public.work_orders wo
            set active_factory_spec_id = coalesce(wo.active_factory_spec_id, (
                  select fs.id
                    from public.factory_specs fs
                   where fs.org_id = app.current_org_id()
                     and fs.fg_item_id = wo.product_id
                     and fs.status in ('approved_for_factory', 'released_to_factory')
                   order by fs.version desc
                   limit 1
                )),
                active_bom_header_id = coalesce(wo.active_bom_header_id, (
                  select bh.id
                    from public.bom_headers bh
                   where bh.org_id = app.current_org_id()
                     and bh.product_id = (
                       select i.item_code from public.items i
                        where i.id = wo.product_id and i.org_id = app.current_org_id()
                     )
                     and bh.status = 'active'
                   order by bh.version desc
                   limit 1
                )),
                uom_snapshot = coalesce(wo.uom_snapshot, (
                  select jsonb_build_object(
                    'output_uom', i.output_uom,
                    'uom_base', i.uom_base,
                    'net_qty_per_each', i.net_qty_per_each,
                    'each_per_box', i.each_per_box,
                    'boxes_per_pallet', i.boxes_per_pallet,
                    'weight_mode', i.weight_mode
                  )
                    from public.items i
                   where i.id = wo.product_id
                     and i.org_id = app.current_org_id()
                   limit 1
                )),
                updated_by = $2::uuid
          where wo.org_id = app.current_org_id()
            and wo.id = $1::uuid
            and wo.status = 'DRAFT'
          returning active_bom_header_id, active_factory_spec_id`,
        [params.id, ctx.userId],
      );
      const preflight = healed.rows[0];
      if (!preflight) return { ok: false, error: 'invalid_state' };

      const missing: Array<'active_bom' | 'factory_spec'> = [];
      if (!preflight.active_bom_header_id) missing.push('active_bom');
      if (!preflight.active_factory_spec_id) missing.push('factory_spec');
      if (missing.length > 0) {
        return { ok: false, error: 'factory_release_incomplete', missing };
      }

      const updated = await ctx.client.query<WorkOrderRow>(
        `update public.work_orders wo
            set status = 'RELEASED',
                updated_by = $2::uuid
          where wo.org_id = app.current_org_id()
            and wo.id = $1::uuid
            and wo.status = 'DRAFT'
          returning wo.id, wo.wo_number, wo.product_id,
                    (select i.item_code from public.items i where i.id = wo.product_id and i.org_id = app.current_org_id()) as item_code,
                    wo.item_type_at_creation, wo.planned_quantity::text as planned_quantity,
                    wo.produced_quantity::text as produced_quantity, wo.uom, wo.status,
                    wo.scheduled_start_time, wo.scheduled_end_time, wo.production_line_id, wo.machine_id,
                    wo.priority, wo.source_of_demand, wo.source_reference, wo.ext_jsonb->>'notes' as notes,
                    wo.created_at, wo.updated_at`,
        [params.id, ctx.userId],
      );
      const workOrder = updated.rows[0];
      if (!workOrder) return { ok: false, error: 'invalid_state' };

      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, 'DRAFT', 'RELEASED', 'release', $2::uuid, $3::jsonb)`,
        [params.id, ctx.userId, JSON.stringify({ app_version: APP_VERSION })],
      );

      return { ok: true, workOrder: mapWoHeader(workOrder) };
    });
  } catch (error) {
    console.error('[releaseWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
