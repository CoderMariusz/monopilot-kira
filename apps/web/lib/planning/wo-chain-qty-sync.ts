/**
 * B1a — when a parent FG WO planned quantity changes, keep downstream WIP WOs and
 * wo_dependencies.required_qty aligned with the parent's resnapshotted WIP material
 * required_qty (same txn as the parent edit).
 */
import { computeWoMaterialScalar, WoMaterialScalarError } from '../production/wo-material-scalar';
import { fromBaseQty, snapshotFromItemRow, TypedError, type OutputUom, type UomSnapshot } from '../uom/convert';

export type ChainQtySyncError =
  | 'chain_child_not_editable'
  | 'pack_hierarchy_incomplete'
  | 'chain_dependency_cycle';

const CHAIN_QTY_SYNC_APP_VERSION = 'wo-chain-qty-sync-v1';

export class ChainQtySyncRollbackError extends Error {
  readonly code: ChainQtySyncError;

  constructor(code: ChainQtySyncError) {
    super(code);
    this.name = 'ChainQtySyncRollbackError';
    this.code = code;
  }
}

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

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

type ParentMaterialRow = {
  id: string;
  product_id: string;
  bom_item_id: string | null;
  required_qty: string;
};

export type ChainEdgeSnapshot = {
  childWoId: string;
  childStatus: string;
  childProductId: string;
  linkProductId: string | null;
  linkBomItemId: string | null;
  childScheduledStartTime: string | Date | null;
  childScheduledEndTime: string | Date | null;
};

const EDITABLE_CHILD_STATUSES = new Set(['DRAFT', 'RELEASED']);

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

function resolveRelinkedParentMaterial(
  parentMaterials: ParentMaterialRow[],
  edge: ChainEdgeSnapshot,
): ParentMaterialRow | null {
  if (edge.linkBomItemId) {
    const byBomLine = parentMaterials.find((row) => row.bom_item_id === edge.linkBomItemId);
    if (byBomLine) return byBomLine;
  }

  if (edge.linkProductId) {
    const productMatches = parentMaterials.filter((row) => row.product_id === edge.linkProductId);
    if (productMatches.length === 1) return productMatches[0] ?? null;
  }

  return null;
}

function validateChildPackHierarchy(
  item: ItemSnapshotRow,
  bom: BomRow | null,
): ChainQtySyncError | null {
  if (!bom || bom.line_basis !== 'per_box') return null;
  try {
    computeWoMaterialScalar({
      plannedBaseQty: 1,
      lineBasis: bom.line_basis,
      eachPerBox: item.each_per_box == null ? null : Number(item.each_per_box),
      netQtyPerEach: item.net_qty_per_each == null ? null : Number(item.net_qty_per_each),
    });
    return null;
  } catch (err) {
    if (err instanceof WoMaterialScalarError) return 'pack_hierarchy_incomplete';
    throw err;
  }
}

async function resnapshotChildWorkOrder(
  ctx: OrgActionContext,
  input: { woId: string; productId: string; plannedBaseQty: string; bom: BomRow | null; item: ItemSnapshotRow },
): Promise<void> {
  let materialScalar = 0;
  if (input.bom) {
    materialScalar = computeWoMaterialScalar({
      plannedBaseQty: Number(input.plannedBaseQty),
      lineBasis: input.bom.line_basis,
      eachPerBox: input.item.each_per_box == null ? null : Number(input.item.each_per_box),
      netQtyPerEach: input.item.net_qty_per_each == null ? null : Number(input.item.net_qty_per_each),
    });
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
       (org_id, site_id, wo_id, sequence, operation_name, line_id,
        expected_duration_minutes, status, notes)
     select app.current_org_id(), ro.site_id, $1::uuid, ro.op_no, ro.op_name,
            ro.line_id,
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
}

type ChainEdgeRow = {
  child_wo_id: string;
  child_status: string;
  child_product_id: string;
  link_product_id: string | null;
  link_bom_item_id: string | null;
  child_scheduled_start_time: string | Date | null;
  child_scheduled_end_time: string | Date | null;
};

function mapChainEdgeRow(row: ChainEdgeRow): ChainEdgeSnapshot {
  return {
    childWoId: row.child_wo_id,
    childStatus: row.child_status,
    childProductId: row.child_product_id,
    linkProductId: row.link_product_id,
    linkBomItemId: row.link_bom_item_id,
    childScheduledStartTime: row.child_scheduled_start_time,
    childScheduledEndTime: row.child_scheduled_end_time,
  };
}

async function loadDirectParentChainEdges(
  ctx: OrgActionContext,
  parentWoId: string,
): Promise<ChainEdgeSnapshot[]> {
  const { rows } = await ctx.client.query<ChainEdgeRow>(
    `select dep.child_wo_id::text as child_wo_id,
            child.status as child_status,
            child.product_id::text as child_product_id,
            wm.product_id::text as link_product_id,
            wm.bom_item_id::text as link_bom_item_id,
            child.scheduled_start_time as child_scheduled_start_time,
            child.scheduled_end_time as child_scheduled_end_time
       from public.wo_dependencies dep
       join public.work_orders child
         on child.org_id = dep.org_id
        and child.id = dep.child_wo_id
       left join public.wo_materials wm
         on wm.org_id = dep.org_id
        and wm.id = dep.material_link
      where dep.org_id = app.current_org_id()
        and dep.parent_wo_id = $1::uuid
      order by child.wo_number
      for update of child, dep`,
    [parentWoId],
  );

  return rows.map(mapChainEdgeRow);
}

async function walkDescendantChainEdges(
  ctx: OrgActionContext,
  childWoId: string,
  visited: Set<string>,
  loading: Set<string>,
  edges: ChainEdgeSnapshot[],
  onCycle: () => void,
): Promise<void> {
  if (loading.has(childWoId)) {
    onCycle();
    return;
  }
  if (visited.has(childWoId)) return;

  loading.add(childWoId);
  visited.add(childWoId);

  const children = await loadDirectParentChainEdges(ctx, childWoId);
  for (const edge of children) {
    // wo_dependencies CHECK forbids parent_wo_id = child_wo_id — ignore impossible self-loops.
    if (edge.childWoId === childWoId) continue;
    edges.push(edge);
    await walkDescendantChainEdges(ctx, edge.childWoId, visited, loading, edges, onCycle);
  }

  loading.delete(childWoId);
}

export type ParentChainLoadResult = {
  edges: ChainEdgeSnapshot[];
  hasCycle: boolean;
};

/** Throw after editability guards so chain_child_not_editable wins over cycle detection. */
export function throwIfChainDependencyCycle(result: ParentChainLoadResult): void {
  if (result.hasCycle) {
    throw new ChainQtySyncRollbackError('chain_dependency_cycle');
  }
}

/**
 * Lock downstream chain edges and capture parent material identity BEFORE parent
 * wo_materials are deleted (ON DELETE SET NULL would clear material_link).
 * Walks the full descendant graph; cycle detection is deferred — call
 * throwIfChainDependencyCycle after editability preflight.
 */
export async function loadAndLockParentChainEdges(
  ctx: OrgActionContext,
  parentWoId: string,
): Promise<ParentChainLoadResult> {
  const edges: ChainEdgeSnapshot[] = [];
  const visited = new Set<string>();
  const loading = new Set<string>();
  let hasCycle = false;
  const onCycle = () => {
    hasCycle = true;
  };

  const directChildren = await loadDirectParentChainEdges(ctx, parentWoId);
  for (const edge of directChildren) {
    edges.push(edge);
    await walkDescendantChainEdges(ctx, edge.childWoId, visited, loading, edges, onCycle);
  }

  return { edges, hasCycle };
}

/** Status-only guard for date propagation — no pack-hierarchy resnapshot checks. */
export function preflightParentChainEditability(edges: ChainEdgeSnapshot[]): void {
  for (const edge of edges) {
    if (!EDITABLE_CHILD_STATUSES.has(edge.childStatus)) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }
  }
}

/** Validate every downstream child is editable before any parent mutation. */
export async function preflightParentChainEdges(
  ctx: OrgActionContext,
  edges: ChainEdgeSnapshot[],
): Promise<void> {
  preflightParentChainEditability(edges);

  for (const edge of edges) {
    if (!edge.linkProductId && !edge.linkBomItemId) continue;
    const childItem = await fetchItemSnapshot(ctx, edge.childProductId);
    if (!childItem) continue;
    const childBom = await fetchActiveBom(ctx, childItem.item_code);
    const packErr = validateChildPackHierarchy(childItem, childBom);
    if (packErr) throw new ChainQtySyncRollbackError(packErr);
  }
}

/**
 * After the parent WO quantity resnapshot, relink dependency edges to the new
 * parent material rows and align each chain child WO + dependency edge.
 */
export async function propagateParentWoChainQuantities(
  ctx: OrgActionContext,
  parentWoId: string,
  userId: string,
  edges: ChainEdgeSnapshot[],
): Promise<void> {
  if (edges.length === 0) return;

  for (const edge of edges) {
    if (!EDITABLE_CHILD_STATUSES.has(edge.childStatus)) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }
  }

  const childPreflight: Array<{
    edge: ChainEdgeSnapshot;
    childItem: ItemSnapshotRow;
    childBom: BomRow | null;
  }> = [];

  for (const edge of edges) {
    if (!edge.linkProductId && !edge.linkBomItemId) continue;
    const childItem = await fetchItemSnapshot(ctx, edge.childProductId);
    if (!childItem) continue;
    const childBom = await fetchActiveBom(ctx, childItem.item_code);
    const packErr = validateChildPackHierarchy(childItem, childBom);
    if (packErr) throw new ChainQtySyncRollbackError(packErr);
    childPreflight.push({ edge, childItem, childBom });
  }

  const { rows: parentMaterials } = await ctx.client.query<ParentMaterialRow>(
    `select id::text as id,
            product_id::text as product_id,
            bom_item_id::text as bom_item_id,
            required_qty::text as required_qty
       from public.wo_materials
      where org_id = app.current_org_id()
        and wo_id = $1::uuid`,
    [parentWoId],
  );

  for (const edge of edges) {
    if (!edge.linkProductId && !edge.linkBomItemId) continue;

    const parentMaterial = resolveRelinkedParentMaterial(parentMaterials, edge);
    if (!parentMaterial) continue;

    const childQty = parentMaterial.required_qty;

    const { rows: childBeforeRows } = await ctx.client.query<{
      planned_quantity: string;
      status: string;
    }>(
      `select planned_quantity::text as planned_quantity, status
         from public.work_orders
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [edge.childWoId],
    );
    const childBefore = childBeforeRows[0];
    if (!childBefore) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }

    await ctx.client.query(
      `update public.wo_dependencies
          set material_link = $4::uuid,
              required_qty = $3::numeric
        where org_id = app.current_org_id()
          and parent_wo_id = $1::uuid
          and child_wo_id = $2::uuid`,
      [parentWoId, edge.childWoId, childQty, parentMaterial.id],
    );

    const childUpdated = await ctx.client.query(
      `update public.work_orders
          set planned_quantity = $2::numeric,
              updated_by = $3::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status in ('DRAFT', 'RELEASED')
      returning id`,
      [edge.childWoId, childQty, userId],
    );
    if ((childUpdated.rowCount ?? 0) === 0) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }

    if (childBefore.planned_quantity !== childQty) {
      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, $2, $2, 'update', $3::uuid, $4::jsonb)`,
        [
          edge.childWoId,
          childBefore.status,
          userId,
          JSON.stringify({
            app_version: CHAIN_QTY_SYNC_APP_VERSION,
            propagation: 'parent_planned_quantity',
            parent_wo_id: parentWoId,
            planned_quantity_old: childBefore.planned_quantity,
            planned_quantity_new: childQty,
            material_link_id: parentMaterial.id,
            required_qty: childQty,
          }),
        ],
      );
    }

    await ctx.client.query(
      `update public.schedule_outputs
          set expected_qty = $2::numeric,
              updated_at = now()
        where org_id = app.current_org_id()
          and planned_wo_id = $1::uuid`,
      [edge.childWoId, childQty],
    );
  }

  for (const { edge, childItem, childBom } of childPreflight) {
    const parentMaterial = resolveRelinkedParentMaterial(parentMaterials, edge);
    if (!parentMaterial) continue;

    await resnapshotChildWorkOrder(ctx, {
      woId: edge.childWoId,
      productId: edge.childProductId,
      plannedBaseQty: parentMaterial.required_qty,
      bom: childBom,
      item: childItem,
    });
  }
}

/** Reconcile qty_entered when planned base qty changes on edit (base-UoM entry path). */
export function reconcileQtyEnteredOnBaseEdit(input: {
  nextPlannedBaseQty: string;
  qtyEntered: string | null;
  qtyEnteredUom: string | null;
  snapshot: UomSnapshot;
}): { qtyEntered: string | null; qtyEnteredUom: OutputUom | null } {
  if (!input.qtyEnteredUom) {
    return { qtyEntered: input.qtyEntered, qtyEnteredUom: null };
  }
  const uom = input.qtyEnteredUom as OutputUom;
  if (uom === 'base') {
    return { qtyEntered: input.nextPlannedBaseQty, qtyEnteredUom: 'base' };
  }
  try {
    const entered = fromBaseQty(input.snapshot, Number(input.nextPlannedBaseQty), uom);
    if (!Number.isFinite(entered) || entered <= 0) {
      return { qtyEntered: null, qtyEnteredUom: null };
    }
    const formatted = uom === 'each' || uom === 'box'
      ? (Math.round(entered * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '')
      : String(entered);
    return { qtyEntered: formatted, qtyEnteredUom: uom };
  } catch (err) {
    if (err instanceof TypedError) {
      return { qtyEntered: null, qtyEnteredUom: null };
    }
    throw err;
  }
}

export function snapshotFromItemSnapshotRow(row: ItemSnapshotRow): UomSnapshot {
  return snapshotFromItemRow(row);
}
