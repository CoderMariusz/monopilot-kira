'use server';

import { z } from 'zod';

import { computeWoMaterialScalar, WoMaterialScalarError } from '../../../../../../../lib/production/wo-material-scalar';
import { snapshotFromItemRow } from '../../../../../../../lib/uom/convert';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  mapWoHeader,
  type OrgActionContext,
  type PlanningWorkOrderError,
  type WorkOrderRow,
} from './shared';

type UpdateWorkOrderResult =
  | { ok: true; workOrder: ReturnType<typeof mapWoHeader> }
  | { ok: false; error: PlanningWorkOrderError; issues?: z.ZodIssue[] };

type WorkOrderForUpdateRow = {
  id: string;
  status: string;
  product_id: string;
  planned_quantity: string;
  scheduled_start_time: string | Date | null;
  production_line_id: string | null;
  machine_id: string | null;
  notes: string | null;
};

type ItemSnapshotRow = {
  id: string;
  item_code: string;
  output_uom: string;
  uom_base: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  boxes_per_pallet: string | null;
  weight_mode: 'fixed' | 'catch';
};

type BomRow = { id: string; version: number; line_basis: string };
type SpecRow = { id: string };

const UpdateWorkOrderInput = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().optional(),
  plannedQuantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,3})?$/, 'plannedQuantity must be a positive numeric string with up to 3 decimals')
    .refine((value) => Number(value) > 0, 'plannedQuantity must be positive')
    .optional(),
  scheduledStartTime: z.string().datetime({ offset: true }).nullable().optional(),
  productionLineId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
});

async function fetchWorkOrderForUpdate(ctx: OrgActionContext, id: string): Promise<WorkOrderForUpdateRow | null> {
  const { rows } = await ctx.client.query<WorkOrderForUpdateRow>(
    `select id, status, product_id, planned_quantity::text as planned_quantity,
            scheduled_start_time, production_line_id, machine_id, ext_jsonb->>'notes' as notes
       from public.work_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [id],
  );
  return rows[0] ?? null;
}

async function fetchItemSnapshot(ctx: OrgActionContext, productId: string): Promise<ItemSnapshotRow | null> {
  const { rows } = await ctx.client.query<ItemSnapshotRow>(
    `select id, item_code, output_uom, uom_base, net_qty_per_each::text as net_qty_per_each,
            each_per_box::text as each_per_box, boxes_per_pallet::text as boxes_per_pallet,
            weight_mode
       from public.items
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [productId],
  );
  return rows[0] ?? null;
}

async function ensureProductionLineInOrg(ctx: OrgActionContext, lineId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id
       from public.production_lines
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [lineId],
  );
  return rows.length > 0;
}

async function ensureMachineInOrg(ctx: OrgActionContext, machineId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id
       from public.machines
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [machineId],
  );
  return rows.length > 0;
}

async function fetchActiveBom(ctx: OrgActionContext, itemCode: string): Promise<BomRow | null> {
  const { rows } = await ctx.client.query<BomRow>(
    `select id, version, line_basis
       from public.bom_headers
      where org_id = app.current_org_id()
        and product_id = $1
        and status = 'active'
      order by version desc
      limit 1`,
    [itemCode],
  );
  return rows[0] ?? null;
}

async function fetchApprovedSpec(ctx: OrgActionContext, productId: string): Promise<SpecRow | null> {
  const { rows } = await ctx.client.query<SpecRow>(
    `select id
       from public.factory_specs
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid
        and status in ('approved_for_factory', 'released_to_factory')
      order by version desc
      limit 1`,
    [productId],
  );
  return rows[0] ?? null;
}

async function resnapshotWorkOrder(
  ctx: OrgActionContext,
  input: { woId: string; productId: string; plannedBaseQty: string; bom: BomRow | null; item: ItemSnapshotRow },
): Promise<UpdateWorkOrderResult | null> {
  // Validate per_box pack hierarchy BEFORE deleting the WO's existing materials/
  // operations, so a misconfigured BOM returns a clean error instead of stripping
  // the WO bare. Reused for the wo_materials insert below.
  let materialScalar = 0;
  if (input.bom) {
    try {
      materialScalar = computeWoMaterialScalar({
        plannedBaseQty: Number(input.plannedBaseQty),
        lineBasis: input.bom.line_basis,
        eachPerBox: input.item.each_per_box == null ? null : Number(input.item.each_per_box),
        netQtyPerEach: input.item.net_qty_per_each == null ? null : Number(input.item.net_qty_per_each),
      });
    } catch (err) {
      if (err instanceof WoMaterialScalarError) {
        return { ok: false, error: 'pack_hierarchy_incomplete' };
      }
      throw err;
    }
  }

  await ctx.client.query(
    `delete from public.wo_materials
      where org_id = app.current_org_id()
        and wo_id = $1::uuid`,
    [input.woId],
  );
  await ctx.client.query(
    `delete from public.wo_operations
      where org_id = app.current_org_id()
        and wo_id = $1::uuid`,
    [input.woId],
  );

  if (input.bom) {
    // materialScalar validated + computed above (pre-delete).
    await ctx.client.query(
      `insert into public.wo_materials
         (org_id, wo_id, product_id, material_name, required_qty, uom, sequence,
          bom_item_id, bom_version, material_source, notes)
       select app.current_org_id(), $1::uuid, i.id, bl.component_code,
              round((bl.quantity * $2::numeric) / greatest(1 - coalesce(bl.scrap_pct, 0) / 100.0, 0.01), 3), bl.uom, coalesce(bl.sequence, bl.line_no),
              bl.id, $3::integer, 'stock', bl.notes
         from public.bom_lines bl
         left join public.items i
           on i.org_id = app.current_org_id()
          and i.item_code = bl.component_code
        where bl.org_id = app.current_org_id()
          and bl.bom_header_id = $4::uuid
        order by bl.line_no`,
      [input.woId, materialScalar.toFixed(6), input.bom.version, input.bom.id],
    );
  }

  await ctx.client.query(
    `insert into public.wo_operations
       (org_id, site_id, wo_id, sequence, operation_name, machine_id, line_id,
        expected_duration_minutes, status, notes)
     select app.current_org_id(), ro.site_id, $1::uuid, ro.op_no, ro.op_name,
            ro.machine_id, ro.line_id,
            case
              when ro.run_time_per_unit_sec is null and ro.setup_time_min is null
                then null
              when coalesce(ro.setup_time_min, 0)::numeric
                   + coalesce(ceil((ro.run_time_per_unit_sec * $2::numeric) / 60.0), 0) > 2147483647
                then null
              else (coalesce(ro.setup_time_min, 0)::numeric
                    + coalesce(ceil((ro.run_time_per_unit_sec * $2::numeric) / 60.0), 0))::integer
            end,
            'pending', ro.op_code
       from public.routing_operations ro
       join public.routings r
         on r.id = ro.routing_id
        and r.org_id = ro.org_id
      where ro.org_id = app.current_org_id()
        and r.item_id = $3::uuid
        and r.status = 'active'
        and r.version = (
          select max(r2.version) from public.routings r2
           where r2.org_id = app.current_org_id()
             and r2.item_id = $3::uuid
             and r2.status = 'active'
        )
      order by ro.op_no
     on conflict (wo_id, sequence) do nothing`,
    [input.woId, input.plannedBaseQty, input.productId],
  );
  return null;
}

export async function updateWorkOrder(params: {
  id: string;
  productId?: string;
  plannedQuantity?: string;
  scheduledStartTime?: string | null;
  productionLineId?: string;
  machineId?: string;
  notes?: string;
}): Promise<UpdateWorkOrderResult> {
  const parsed = UpdateWorkOrderInput.safeParse(params);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

  try {
    return await withOrgContext(async (ctx): Promise<UpdateWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const current = await fetchWorkOrderForUpdate(ctx, input.id);
      if (!current) return { ok: false, error: 'not_found' };
      if (current.status !== 'DRAFT') return { ok: false, error: 'invalid_state' };

      if (input.productionLineId && !(await ensureProductionLineInOrg(ctx, input.productionLineId))) {
        return { ok: false, error: 'forbidden' };
      }
      if (input.machineId && !(await ensureMachineInOrg(ctx, input.machineId))) {
        return { ok: false, error: 'forbidden' };
      }

      const nextProductId = input.productId ?? current.product_id;
      const nextPlannedQuantity = input.plannedQuantity ?? current.planned_quantity;
      const mustResnapshot = input.productId !== undefined || input.plannedQuantity !== undefined;
      const item = mustResnapshot || input.productId ? await fetchItemSnapshot(ctx, nextProductId) : null;
      if ((mustResnapshot || input.productId) && !item) return { ok: false, error: 'forbidden' };

      const bom = item ? await fetchActiveBom(ctx, item.item_code) : null;
      const spec = item ? await fetchApprovedSpec(ctx, nextProductId) : null;
      const uomSnapshot = item ? snapshotFromItemRow(item) : null;
      const dbUomSnapshot = item
        ? {
            output_uom: item.output_uom,
            uom_base: item.uom_base,
            net_qty_per_each: item.net_qty_per_each,
            each_per_box: item.each_per_box,
            boxes_per_pallet: item.boxes_per_pallet,
            weight_mode: item.weight_mode,
          }
        : null;

      const updated = await ctx.client.query<WorkOrderRow>(
        `update public.work_orders wo
            set product_id = $2::uuid,
                active_bom_header_id = case when $9::boolean then $10::uuid else wo.active_bom_header_id end,
                active_factory_spec_id = case when $9::boolean then $11::uuid else wo.active_factory_spec_id end,
                planned_quantity = $3::numeric,
                uom = case when $9::boolean then $12 else wo.uom end,
                scheduled_start_time = case when $15::boolean then $4::timestamptz else wo.scheduled_start_time end,
                production_line_id = $5::uuid,
                machine_id = $6::uuid,
                uom_snapshot = case when $9::boolean then $13::jsonb else wo.uom_snapshot end,
                ext_jsonb = case
                  -- clear: drop the key. jsonb_set(target,path,NULL) returns NULL
                  -- for the WHOLE jsonb, which violates ext_jsonb NOT NULL — so a
                  -- cleared note must REMOVE 'notes', not jsonb_set it to NULL.
                  when $14::boolean and $7::text is null then coalesce(wo.ext_jsonb, '{}'::jsonb) - 'notes'
                  when $14::boolean then jsonb_set(coalesce(wo.ext_jsonb, '{}'::jsonb), '{notes}', to_jsonb($7::text), true)
                  else wo.ext_jsonb
                end,
                updated_by = $8::uuid,
                updated_at = now()
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
        [
          input.id,
          nextProductId,
          nextPlannedQuantity,
          input.scheduledStartTime ?? null,
          input.productionLineId ?? current.production_line_id,
          input.machineId ?? current.machine_id,
          input.notes === undefined ? current.notes : input.notes === '' ? null : input.notes,
          ctx.userId,
          mustResnapshot,
          bom?.id ?? null,
          spec?.id ?? null,
          uomSnapshot?.uomBase ?? null,
          dbUomSnapshot ? JSON.stringify(dbUomSnapshot) : null,
          input.notes !== undefined,
          input.scheduledStartTime !== undefined,
        ],
      );
      const workOrder = updated.rows[0];
      if (!workOrder) return { ok: false, error: 'invalid_state' };

      if (input.plannedQuantity !== undefined) {
        await ctx.client.query(
          `update public.schedule_outputs
              set expected_qty = $2::numeric,
                  updated_at = now()
            where org_id = app.current_org_id()
              and planned_wo_id = $1::uuid`,
          [input.id, nextPlannedQuantity],
        );
      }

      if (mustResnapshot && item) {
        const resnapshotResult = await resnapshotWorkOrder(ctx, {
          woId: input.id,
          productId: nextProductId,
          plannedBaseQty: nextPlannedQuantity,
          bom,
          item,
        });
        if (resnapshotResult) return resnapshotResult;
      }

      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, 'DRAFT', 'DRAFT', 'update', $2::uuid, $3::jsonb)`,
        [
          input.id,
          ctx.userId,
          JSON.stringify({
            app_version: APP_VERSION,
            resnapshot: mustResnapshot,
            product_id: nextProductId,
            planned_quantity: nextPlannedQuantity,
            active_bom_header_id: bom?.id ?? null,
            active_factory_spec_id: spec?.id ?? null,
          }),
        ],
      );

      return { ok: true, workOrder: mapWoHeader(workOrder) };
    });
  } catch (error) {
    console.error('[updateWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
