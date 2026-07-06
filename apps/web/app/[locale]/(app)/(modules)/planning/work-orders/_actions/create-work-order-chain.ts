'use server';

import { z } from 'zod';

import { computeWoMaterialScalar, WoMaterialScalarError } from '../../../../../../../lib/production/wo-material-scalar';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { createWorkOrderCore } from './create-work-order-core';
import {
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  type OrgActionContext,
  type WOMaterial,
  type WOHeader,
} from './shared';

const Input = z.object({
  productId: z.string().uuid(),
  itemCode: z.string().trim().min(1).max(128).optional(),
  documentNumber: z.string().trim().min(1).max(128),
  siteId: z.string().uuid(),
  plannedQuantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/)
    .refine((value) => Number(value) > 0),
  scheduledStartTime: z.string().datetime({ offset: true }).optional(),
  productionLineId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
});

type ChainErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'no_active_bom'
  | 'pack_hierarchy_incomplete'
  | 'no_active_site'
  | 'document_mask_missing'
  | 'wo_create_failed'
  | 'persistence_failed';

type ChainResult =
  | {
      ok: true;
      fgWorkOrder: WOHeader;
      wipWorkOrders: WOHeader[];
      dependencies: Array<{ parentWoId: string; childWoId: string; materialLink: string | null; requiredQty: string | null }>;
      created: boolean;
    }
  | { ok: false; error: ChainErrorCode; planningError?: string; message?: string };

type ItemRow = {
  id: string;
  item_code: string;
  output_uom: string;
  uom_base: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  boxes_per_pallet: string | null;
  weight_mode: 'fixed' | 'catch';
};

type BomHeaderRow = {
  id: string;
  version: number;
  line_basis: string;
};

type WipBomLineRow = {
  id: string;
  line_no: number;
  item_id: string;
  component_code: string;
  quantity: string;
  scrap_pct: string;
};

class WorkOrderChainError extends Error {
  constructor(readonly code: ChainErrorCode, readonly planningError?: string) {
    super(planningError ? `${code}:${planningError}` : code);
  }
}

// W1 error-surface contract: specific core failures must reach the caller as
// themselves, never collapsed into a generic wo_create_failed.
function chainCoreFailure(coreError: string | undefined): ChainResult {
  const specific: ChainErrorCode =
    coreError === 'no_active_site' || coreError === 'document_mask_missing' ? coreError : 'wo_create_failed';
  return { ok: false, error: specific, planningError: coreError, message: coreError };
}

export async function createWorkOrderChain(raw: unknown): Promise<ChainResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  try {
    return await withOrgContext(async (ctx): Promise<ChainResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      return createWorkOrderChainInContext(ctx, parsed.data);
    });
  } catch (error) {
    if (error instanceof WorkOrderChainError) {
      return { ok: false, error: error.code, planningError: error.planningError, message: error.planningError };
    }
    console.error('[createWorkOrderChain] failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createWorkOrderChainForContext(ctx: OrgActionContext, raw: unknown): Promise<ChainResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
    return { ok: false, error: 'forbidden' };
  }
  return createWorkOrderChainInContext(ctx, parsed.data);
}

async function createWorkOrderChainInContext(
  ctx: OrgActionContext,
  input: z.infer<typeof Input>,
): Promise<ChainResult> {
  const fgItem = await loadItem(ctx, input.productId);
  if (!fgItem) return { ok: false, error: 'not_found' };
  const itemCode = input.itemCode ?? fgItem.item_code;

  const existingFg = await loadWorkOrderByNumber(ctx, input.documentNumber);
  if (existingFg) {
    const existing = await loadExistingChain(ctx, existingFg.id);
    return {
      ok: true,
      fgWorkOrder: existingFg,
      wipWorkOrders: existing.wipWorkOrders,
      dependencies: existing.dependencies,
      created: false,
    };
  }

  const bom = await loadActiveBom(ctx, fgItem.id, itemCode);
  if (!bom) return { ok: false, error: 'no_active_bom' };

  let materialScalar: number;
  try {
    materialScalar = computeWoMaterialScalar({
      plannedBaseQty: Number(input.plannedQuantity),
      lineBasis: bom.line_basis,
      eachPerBox: fgItem.each_per_box == null ? null : Number(fgItem.each_per_box),
      netQtyPerEach: fgItem.net_qty_per_each == null ? null : Number(fgItem.net_qty_per_each),
    });
  } catch (error) {
    if (error instanceof WoMaterialScalarError) return { ok: false, error: 'pack_hierarchy_incomplete' };
    throw error;
  }

  const wipLines = await loadWipBomLines(ctx, bom.id);
  const wipWorkOrders: WOHeader[] = [];
  for (let index = 0; index < wipLines.length; index++) {
    const line = wipLines[index]!;
    const requiredQty = computeRequiredMaterialQty(line, materialScalar);
    const existingWip = await loadWorkOrderByNumber(ctx, `${input.documentNumber}-W${index + 1}`);
    if (existingWip) {
      wipWorkOrders.push(existingWip);
      continue;
    }
    const created = await createWorkOrderCore(ctx, {
      productId: line.item_id,
      itemCode: line.component_code,
      itemTypeAtCreation: 'intermediate',
      documentNumber: `${input.documentNumber}-W${index + 1}`,
      siteId: input.siteId,
      plannedQuantity: requiredQty,
      scheduledStartTime: input.scheduledStartTime,
      productionLineId: input.productionLineId,
      notes: `Upstream WIP for ${input.documentNumber}`,
    });
    if (!created.ok) return chainCoreFailure(created.error);
    wipWorkOrders.push(created.workOrder);
  }

  const fgCreated = await createWorkOrderCore(ctx, {
    productId: fgItem.id,
    itemCode,
    documentNumber: input.documentNumber,
    siteId: input.siteId,
    plannedQuantity: input.plannedQuantity,
    scheduledStartTime: input.scheduledStartTime,
    productionLineId: input.productionLineId,
    notes: input.notes,
  });
  if (!fgCreated.ok) return chainCoreFailure(fgCreated.error);

  const dependencies = await linkDependencies(ctx, fgCreated.workOrder, fgCreated.materials, wipWorkOrders);
  return {
    ok: true,
    fgWorkOrder: fgCreated.workOrder,
    wipWorkOrders,
    dependencies,
    created: true,
  };
}

async function loadItem(ctx: OrgActionContext, itemId: string): Promise<ItemRow | null> {
  const { rows } = await ctx.client.query<ItemRow>(
    `select id::text as id, item_code, output_uom, uom_base,
            net_qty_per_each::text as net_qty_per_each,
            each_per_box::text as each_per_box,
            boxes_per_pallet::text as boxes_per_pallet,
            weight_mode
       from public.items
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [itemId],
  );
  return rows[0] ?? null;
}

async function loadActiveBom(ctx: OrgActionContext, itemId: string, itemCode: string): Promise<BomHeaderRow | null> {
  const { rows } = await ctx.client.query<BomHeaderRow>(
    `select id::text as id, version, line_basis
       from public.bom_headers
      where org_id = app.current_org_id()
        and status = 'active'
        and (item_id = $1::uuid or product_id = $2)
      order by version desc, created_at desc
      limit 1`,
    [itemId, itemCode],
  );
  return rows[0] ?? null;
}

async function loadWipBomLines(ctx: OrgActionContext, bomHeaderId: string): Promise<WipBomLineRow[]> {
  const { rows } = await ctx.client.query<WipBomLineRow>(
    `select bl.id::text as id,
            bl.line_no,
            bl.item_id::text as item_id,
            bl.component_code,
            bl.quantity::text as quantity,
            bl.scrap_pct::text as scrap_pct
       from public.bom_lines bl
      where bl.org_id = app.current_org_id()
        and bl.bom_header_id = $1::uuid
        and bl.component_type = 'WIP'
        and bl.item_id is not null
      order by bl.line_no`,
    [bomHeaderId],
  );
  return rows;
}

function computeRequiredMaterialQty(line: WipBomLineRow, materialScalar: number): string {
  const quantity = Number(line.quantity);
  const scrapPct = Number(line.scrap_pct ?? 0);
  const denominator = Math.max(1 - scrapPct / 100, 0.01);
  return (Math.round((quantity * materialScalar / denominator) * 10000) / 10000).toFixed(4);
}

async function loadWorkOrderByNumber(ctx: OrgActionContext, woNumber: string): Promise<WOHeader | null> {
  const { rows } = await ctx.client.query<{
    id: string;
    wo_number: string;
    product_id: string;
    item_code: string | null;
    item_type_at_creation: string;
    planned_quantity: string;
    produced_quantity: string | null;
    uom: string;
    status: string;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
    production_line_id: string | null;
    priority: string;
    source_of_demand: string;
    source_reference: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `select wo.id::text as id,
            wo.wo_number,
            wo.product_id::text as product_id,
            i.item_code,
            wo.item_type_at_creation,
            wo.planned_quantity::text as planned_quantity,
            wo.produced_quantity::text as produced_quantity,
            wo.uom,
            wo.status,
            wo.scheduled_start_time::text as scheduled_start_time,
            wo.scheduled_end_time::text as scheduled_end_time,
            wo.production_line_id::text as production_line_id,
            wo.priority,
            wo.source_of_demand,
            wo.source_reference,
            wo.ext_jsonb->>'notes' as notes,
            wo.created_at::text as created_at,
            wo.updated_at::text as updated_at
       from public.work_orders wo
       left join public.items i
         on i.org_id = wo.org_id
        and i.id = wo.product_id
      where wo.org_id = app.current_org_id()
        and wo.wo_number = $1
      limit 1`,
    [woNumber],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    woNumber: row.wo_number,
    productId: row.product_id,
    itemCode: row.item_code,
    itemTypeAtCreation: row.item_type_at_creation,
    plannedQuantity: row.planned_quantity,
    producedQuantity: row.produced_quantity,
    uom: row.uom,
    status: row.status,
    scheduledStartTime: row.scheduled_start_time,
    scheduledEndTime: row.scheduled_end_time,
    productionLineId: row.production_line_id,
    priority: row.priority,
    sourceOfDemand: row.source_of_demand,
    sourceReference: row.source_reference,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function linkDependencies(
  ctx: OrgActionContext,
  fgWorkOrder: WOHeader,
  fgMaterials: WOMaterial[],
  wipWorkOrders: WOHeader[],
): Promise<Array<{ parentWoId: string; childWoId: string; materialLink: string | null; requiredQty: string | null }>> {
  const dependencies: Array<{ parentWoId: string; childWoId: string; materialLink: string | null; requiredQty: string | null }> = [];
  for (const wipWorkOrder of wipWorkOrders) {
    const material = fgMaterials.find((row) => row.productId === wipWorkOrder.productId) ?? null;
    const { rows } = await ctx.client.query<{ parent_wo_id: string; child_wo_id: string; material_link: string | null; required_qty: string | null }>(
      `insert into public.wo_dependencies
         (org_id, parent_wo_id, child_wo_id, material_link, required_qty)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4::numeric)
       on conflict (org_id, parent_wo_id, child_wo_id) do update
         set material_link = coalesce(excluded.material_link, public.wo_dependencies.material_link),
             required_qty = coalesce(excluded.required_qty, public.wo_dependencies.required_qty)
       returning parent_wo_id::text as parent_wo_id,
                 child_wo_id::text as child_wo_id,
                 material_link::text as material_link,
                 required_qty::text as required_qty`,
      [
        fgWorkOrder.id,
        wipWorkOrder.id,
        material?.id ?? null,
        material?.requiredQty ?? null,
      ],
    );
    const row = rows[0];
    if (row) {
      dependencies.push({
        parentWoId: row.parent_wo_id,
        childWoId: row.child_wo_id,
        materialLink: row.material_link,
        requiredQty: row.required_qty,
      });
    }
  }
  return dependencies;
}

async function loadExistingChain(
  ctx: OrgActionContext,
  fgWoId: string,
): Promise<{
  wipWorkOrders: WOHeader[];
  dependencies: Array<{ parentWoId: string; childWoId: string; materialLink: string | null; requiredQty: string | null }>;
}> {
  const { rows } = await ctx.client.query<{ child_wo_number: string; parent_wo_id: string; child_wo_id: string; material_link: string | null; required_qty: string | null }>(
    `select child.wo_number as child_wo_number,
            dep.parent_wo_id::text as parent_wo_id,
            dep.child_wo_id::text as child_wo_id,
            dep.material_link::text as material_link,
            dep.required_qty::text as required_qty
       from public.wo_dependencies dep
       join public.work_orders child
         on child.org_id = dep.org_id
        and child.id = dep.child_wo_id
      where dep.org_id = app.current_org_id()
        and dep.parent_wo_id = $1::uuid
      order by child.wo_number`,
    [fgWoId],
  );
  const wipWorkOrders: WOHeader[] = [];
  const dependencies: Array<{ parentWoId: string; childWoId: string; materialLink: string | null; requiredQty: string | null }> = [];
  for (const row of rows) {
    const child = await loadWorkOrderByNumber(ctx, row.child_wo_number);
    if (child) wipWorkOrders.push(child);
    dependencies.push({
      parentWoId: row.parent_wo_id,
      childWoId: row.child_wo_id,
      materialLink: row.material_link,
      requiredQty: row.required_qty,
    });
  }
  return { wipWorkOrders, dependencies };
}
