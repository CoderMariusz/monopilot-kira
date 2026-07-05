import { randomUUID } from 'crypto';

import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import { computeWoMaterialScalar, WoMaterialScalarError } from '../../../../../../../lib/production/wo-material-scalar';
import { resolveWriteSiteId } from '../../../../../../../lib/site/site-context';
import { snapshotFromItemRow, toBaseQty, TypedError } from '../../../../../../../lib/uom/convert';
import {
  APP_VERSION,
  CreateWorkOrderInput,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  mapMaterial,
  mapSchedule,
  mapWoHeader,
  isPgError,
  type CreateWorkOrderResult,
  type OrgActionContext,
  type ScheduleOutputRow,
  type UomConversionResult,
  type WOMaterialRow,
  type WorkOrderRow,
} from './shared';

type ItemUomRow = {
  output_uom: string;
  uom_base: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  boxes_per_pallet: string | null;
  weight_mode: 'fixed' | 'catch';
};

export type CreateWorkOrderCoreParams = {
  productId: string;
  itemCode: string;
  itemTypeAtCreation?: 'rm' | 'ingredient' | 'intermediate' | 'fg' | 'co_product' | 'byproduct';
  documentNumber?: string;
  siteId?: string;
  plannedQuantity: string;
  quantityEntered?: string;
  quantityEnteredUom?: 'base' | 'each' | 'box';
  scheduledStartTime?: string;
  productionLineId?: string;
  machineId?: string;
  notes?: string;
};

export async function createWorkOrderCore(
  ctx: OrgActionContext,
  params: CreateWorkOrderCoreParams,
): Promise<CreateWorkOrderResult> {
  const parsed = CreateWorkOrderInput.safeParse(params);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

  if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

  const input = parsed.data;
  let siteId: string;
  if (input.siteId) {
    const explicitSite = await ctx.client.query<{ id: string }>(
      `select id::text as id
         from public.sites
        where org_id = app.current_org_id()
          and id = $1::uuid
          and is_active = true
        limit 1`,
      [input.siteId],
    );
    if (!explicitSite.rows[0]) return { ok: false, error: 'no_active_site' };
    siteId = explicitSite.rows[0].id;
  } else {
    const siteResolution = await resolveWriteSiteId(ctx.client);
    if (!siteResolution.ok) return { ok: false, error: siteResolution.reason };
    siteId = siteResolution.siteId;
  }
  const woId = randomUUID();
  let woNumber: string;
  try {
    woNumber = input.documentNumber ?? await nextDocumentNumber(ctx.client, ctx.orgId, 'wo', new Date());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('document_number_settings_missing:')) {
      return { ok: false, error: 'document_mask_missing' };
    }
    throw error;
  }

  const itemUomResult = await ctx.client.query<ItemUomRow>(
    `select output_uom, uom_base, net_qty_per_each::text as net_qty_per_each,
            each_per_box::text as each_per_box, boxes_per_pallet::text as boxes_per_pallet,
            weight_mode
       from public.items
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [input.productId],
  );
  const itemUom = itemUomResult.rows[0];
  if (!itemUom) return { ok: false, error: 'invalid_input' };

  const uomSnapshot = snapshotFromItemRow(itemUom);
  const dbUomSnapshot = {
    output_uom: itemUom.output_uom,
    uom_base: itemUom.uom_base,
    net_qty_per_each: itemUom.net_qty_per_each,
    each_per_box: itemUom.each_per_box,
    boxes_per_pallet: itemUom.boxes_per_pallet,
    weight_mode: itemUom.weight_mode,
  };
  let plannedBaseQty = input.plannedQuantity;
  let conversion: UomConversionResult | undefined;
  if (input.quantityEntered) {
    try {
      plannedBaseQty = toBaseQty(uomSnapshot, Number(input.quantityEntered), input.quantityEnteredUom ?? 'base').toFixed(3);
    } catch (error) {
      if (error instanceof TypedError && error.code === 'uom_conversion_unavailable') {
        return { ok: false, error: 'uom_conversion_unavailable' };
      }
      throw error;
    }
    conversion = {
      qtyEntered: input.quantityEntered,
      qtyEnteredUom: input.quantityEnteredUom ?? 'base',
      baseQty: plannedBaseQty,
    } as typeof conversion;
  }

  const activeBom = await ctx.client.query<{ id: string; version: number; line_basis: string }>(
    `select id, version, line_basis
       from public.bom_headers
      where org_id = app.current_org_id()
        and product_id = $1
        and status = 'active'
      order by version desc
      limit 1`,
    [input.itemCode],
  );
  const bom = activeBom.rows[0];

  let materialScalar = 0;
  if (bom) {
    try {
      materialScalar = computeWoMaterialScalar({
        plannedBaseQty: Number(plannedBaseQty),
        lineBasis: bom.line_basis,
        eachPerBox: itemUom.each_per_box == null ? null : Number(itemUom.each_per_box),
        netQtyPerEach: itemUom.net_qty_per_each == null ? null : Number(itemUom.net_qty_per_each),
      });
    } catch (err) {
      if (err instanceof WoMaterialScalarError) {
        return { ok: false, error: 'pack_hierarchy_incomplete' };
      }
      throw err;
    }
  }

  const approvedSpec = await ctx.client.query<{ id: string }>(
    `select id
       from public.factory_specs
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid
        and status in ('approved_for_factory', 'released_to_factory')
      order by version desc
      limit 1`,
    [input.productId],
  );
  const spec = approvedSpec.rows[0];

  async function insertWorkOrderHeader(documentNumber: string) {
    return ctx.client.query<WorkOrderRow>(
      `insert into public.work_orders
         (id, org_id, wo_number, product_id, item_type_at_creation, active_bom_header_id,
          active_factory_spec_id,
          planned_quantity, uom, status, scheduled_start_time, production_line_id, machine_id,
          source_of_demand, source_reference, qty_entered, qty_entered_uom, uom_snapshot,
          ext_jsonb, created_by, updated_by, site_id)
       values
         ($1::uuid, app.current_org_id(), $2, $3::uuid, $18, $4::uuid,
          $12::uuid,
          $5::numeric, $16, 'DRAFT', $6::timestamptz, $7::uuid, $8::uuid,
          'manual', $9, $13::numeric, $14, $15::jsonb, $10::jsonb, $11::uuid, $11::uuid, $17::uuid)
       returning id, wo_number, product_id, $9::text as item_code, item_type_at_creation,
                 planned_quantity::text as planned_quantity, produced_quantity::text as produced_quantity,
                 uom, status, scheduled_start_time, scheduled_end_time, production_line_id, machine_id,
                 priority, source_of_demand, source_reference, ext_jsonb->>'notes' as notes, created_at, updated_at`,
      [
        woId,
        documentNumber,
        input.productId,
        bom?.id ?? null,
        plannedBaseQty,
        input.scheduledStartTime ?? null,
        input.productionLineId ?? null,
        input.machineId ?? null,
        input.itemCode,
        JSON.stringify({ notes: input.notes ?? null, app_version: APP_VERSION }),
        ctx.userId,
        spec?.id ?? null,
        input.quantityEntered ?? null,
        input.quantityEnteredUom ?? null,
        JSON.stringify(dbUomSnapshot),
        uomSnapshot.uomBase,
        siteId,
        input.itemTypeAtCreation ?? 'fg',
      ],
    );
  }

  let insertedWo: Awaited<ReturnType<typeof insertWorkOrderHeader>>;
  try {
    insertedWo = await insertWorkOrderHeader(woNumber);
  } catch (error) {
    if (!isPgError(error) || error.code !== '23505') throw error;
    if (input.documentNumber) return { ok: false, error: 'persistence_failed' };
    insertedWo = await insertWorkOrderHeader(await nextDocumentNumber(ctx.client, ctx.orgId, 'wo', new Date()));
  }
  const workOrder = insertedWo.rows[0];
  if (!workOrder) throw new Error('work_order_insert_returned_no_row');

  let materialRows: WOMaterialRow[] = [];
  if (bom) {
    const insertedMaterials = await ctx.client.query<WOMaterialRow>(
      `insert into public.wo_materials
         (org_id, wo_id, product_id, material_name, required_qty, uom, sequence,
          bom_item_id, bom_version, material_source, notes)
       select app.current_org_id(), $1::uuid, i.id, bl.component_code,
              round((bl.quantity * $2::numeric) / greatest(1 - coalesce(bl.scrap_pct, 0) / 100.0, 0.01), 3), bl.uom, coalesce(bl.sequence, bl.line_no),
              bl.id, $3::integer, 'stock', bl.notes
         from public.bom_lines bl
         left join public.items i
           on i.org_id = app.current_org_id()
          and (i.id = bl.item_id
               or (bl.item_id is null and i.item_code = bl.component_code))
        where bl.org_id = app.current_org_id()
          and bl.bom_header_id = $4::uuid
        order by bl.line_no
       returning id, wo_id, product_id, material_name, required_qty::text as required_qty,
                 consumed_qty::text as consumed_qty, reserved_qty::text as reserved_qty, uom,
                 sequence, material_source, bom_item_id, bom_version, notes`,
      [woId, materialScalar.toFixed(6), bom.version, bom.id],
    );
    materialRows = insertedMaterials.rows;
  }

  await ctx.client.query(
    `insert into public.wo_operations
       (org_id, site_id, wo_id, sequence, operation_name, machine_id, line_id,
        expected_duration_minutes, status, notes, crew)
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
            'pending', ro.op_code, ro.crew
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
    [woId, plannedBaseQty, input.productId],
  );

  const insertedSchedule = await ctx.client.query<ScheduleOutputRow>(
    `insert into public.schedule_outputs
       (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct, disposition, notes)
     values
       (app.current_org_id(), $1::uuid, $2::uuid, 'primary', $3::numeric, $5, 100.00, 'to_stock', $4)
     returning id, planned_wo_id, product_id, output_role, expected_qty::text as expected_qty,
               uom, allocation_pct::text as allocation_pct, disposition, downstream_wo_id, notes`,
    [woId, input.productId, plannedBaseQty, input.notes ?? null, uomSnapshot.uomBase],
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
    conversion,
    warning: !bom ? 'no_active_bom' : !spec ? 'no_approved_factory_spec' : undefined,
  };
}
