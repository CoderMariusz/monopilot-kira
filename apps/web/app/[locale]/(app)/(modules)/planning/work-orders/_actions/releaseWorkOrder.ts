'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import { packHierarchyComplete, snapshotFromItemRow } from '../../../../../../../lib/uom/convert';
import {
  APP_VERSION,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  type DeleteDraftWorkOrderResult,
  mapWoHeader,
  type ReleaseWorkOrderResult,
  type WorkOrderRow,
} from './shared';

type ReleasePreflightRow = {
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
  output_uom: string | null;
  net_qty_per_each: string | null;
  each_per_box: string | null;
};

type DraftWorkOrderDeleteRow = Pick<WorkOrderRow, 'id' | 'wo_number' | 'status' | 'product_id' | 'planned_quantity' | 'uom'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revalidateWorkOrderDeletePaths(id: string): void {
  revalidateLocalized('/planning/work-orders');
  revalidateLocalized(`/planning/work-orders/${id}`);
}

export async function releaseWorkOrder(params: { id: string }): Promise<ReleaseWorkOrderResult> {
  if (!params.id || !UUID_RE.test(params.id)) return { ok: false, error: 'invalid_input' };

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
                     and bh.item_id = wo.product_id
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
          returning active_bom_header_id, active_factory_spec_id,
                    (select i.output_uom from public.items i
                      where i.id = wo.product_id and i.org_id = app.current_org_id()) as output_uom,
                    (select i.net_qty_per_each::text from public.items i
                      where i.id = wo.product_id and i.org_id = app.current_org_id()) as net_qty_per_each,
                    (select i.each_per_box::text from public.items i
                      where i.id = wo.product_id and i.org_id = app.current_org_id()) as each_per_box`,
        [params.id, ctx.userId],
      );
      const preflight = healed.rows[0];
      if (!preflight) return { ok: false, error: 'invalid_state' };

      // O-2 pack-hierarchy gate — a FG packed in each/box must carry the factors
      // needed to convert that pack unit to base, or output/consume conversion
      // fails later at production time. Bulk FG (output_uom='base') is legitimate
      // and is NEVER blocked here.
      if (preflight.output_uom === 'each' || preflight.output_uom === 'box') {
        const snap = snapshotFromItemRow({
          output_uom: preflight.output_uom,
          net_qty_per_each: preflight.net_qty_per_each,
          each_per_box: preflight.each_per_box,
        });
        if (!packHierarchyComplete(snap)) {
          return { ok: false, error: 'pack_hierarchy_incomplete' };
        }
      }

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
                    wo.scheduled_start_time, wo.scheduled_end_time, wo.production_line_id,
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

export async function deleteDraftWorkOrder(params: { id: string }): Promise<DeleteDraftWorkOrderResult> {
  if (!params.id || !UUID_RE.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx): Promise<DeleteDraftWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const current = await ctx.client.query<DraftWorkOrderDeleteRow>(
        `select id, wo_number, status, product_id, planned_quantity::text as planned_quantity, uom
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [params.id],
      );
      const row = current.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.status !== 'DRAFT') return { ok: false, error: 'invalid_state' };

      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, 'DRAFT', 'CANCELLED', 'delete_draft', $2::uuid, $3::jsonb)`,
        [
          row.id,
          ctx.userId,
          JSON.stringify({
            app_version: APP_VERSION,
            wo_number: row.wo_number,
            product_id: row.product_id,
            planned_quantity: row.planned_quantity,
            uom: row.uom,
          }),
        ],
      );

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values
           (app.current_org_id(), $1::uuid, 'user', 'planning.work_order.deleted', 'work_order', $2,
            $3::jsonb, null, gen_random_uuid(), 'operational')`,
        [
          ctx.userId,
          row.id,
          JSON.stringify({
            id: row.id,
            wo_number: row.wo_number,
            status: row.status,
            product_id: row.product_id,
            planned_quantity: row.planned_quantity,
            uom: row.uom,
          }),
        ],
      );

      const deleted = await ctx.client.query(
        `delete from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'DRAFT'`,
        [row.id],
      );
      if ((deleted.rowCount ?? 0) !== 1) return { ok: false, error: 'invalid_state' };

      revalidateWorkOrderDeletePaths(row.id);
      return { ok: true, id: row.id };
    });
  } catch (error) {
    console.error('[deleteDraftWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
