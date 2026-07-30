'use server';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { isUserSiteAccessUnrestricted } from '../../../../../../../lib/site/assert-user-site-access';
import { queryGenealogy, type GenealogyChainNode } from '../../../../../../../lib/warehouse/genealogy';

import {
  addDecimalStrings,
  BATCH_SEED_LIMIT,
  computeMassBalance,
  isKgUom,
  ITEM_SEED_LIMIT,
  LP_SEED_LIMIT,
  sliceSeedRows,
  type MassBalanceNodeInput,
  type MassBalanceQtyRow,
} from './trace-mass-balance';
import { TraceInputSchema, UuidSchema } from './trace-input-schemas';
import type {
  RecallDrill,
  TraceAffectedCustomer,
  TraceEdge,
  TraceFlatRow,
  TraceInput,
  TraceNode,
  TraceNodeType,
  TraceReport,
  TraceTruncation,
  TraceTruncationLayer,
} from './trace-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };

type ForwardShipmentRow = {
  shipment_id: string;
  shipment_number: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  lp_id: string;
  lp_ref: string;
  shipped_qty: string;
  uom: string | null;
};

type LpRow = {
  id: string;
  lp_number: string;
  lp_code: string | null;
  display_ref: string;
  product_id: string;
  item_code: string | null;
  item_name: string | null;
  quantity: string;
  uom: string;
  batch_code: string | null;
  status: string;
  origin: string;
  parent_lp_id: string | null;
  grn_id: string | null;
  wo_id: string | null;
  consumed_by_wo_id: string | null;
  source_so_id: string | null;
  expiry_date: string | null;
  best_before_date: string | null;
  qa_status: string | null;
  created_at: string;
};

type AffectedCustomerRow = {
  customer_id: string;
  customer_name: string;
  customer_code: string | null;
};

type UpstreamRow = {
  lp_id: string;
  grn_item_id: string | null;
  grn_id: string | null;
  grn_number: string | null;
  po_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
};

type WorkOrderRow = {
  id: string;
  wo_number: string;
  planned_quantity: string | null;
  uom: string | null;
  status: string | null;
};

type ConsumptionRow = {
  id: string;
  lp_id: string;
  wo_id: string;
  wo_number: string;
  qty_consumed: string;
  uom: string;
  material_name: string | null;
};

type OutputRow = {
  id: string;
  wo_id: string;
  wo_number: string;
  output_lp_id: string | null;
  output_ref: string;
  batch_number: string;
  qty: string;
  uom: string;
  current_qty: string | null;
  current_uom: string | null;
  consumed_by_wo_id: string | null;
};

type RecallDrillRow = {
  id: string;
  initiated_by: string | null;
  input_type: TraceInput['inputType'];
  input_ref: string;
  direction: TraceInput['direction'];
  started_at: string | Date;
  completed_at: string | Date | null;
  duration_ms: number | string | null;
  result_jsonb: TraceReport | null;
  is_drill: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

// TODO(E2A): dedicated quality.trace.run / quality.recall.manage permission
const TRACE_PERMISSION = 'quality.dashboard.view';

async function assertTracePermission(ctx: QualityContext): Promise<void> {
  if (!(await hasPermission(ctx, TRACE_PERMISSION))) {
    throw new Error('forbidden');
  }
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRecallDrill(row: RecallDrillRow): RecallDrill {
  return {
    id: row.id,
    inputType: row.input_type,
    inputRef: row.input_ref,
    direction: row.direction,
    startedAt: toIso(row.started_at) ?? '',
    completedAt: toIso(row.completed_at),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    result: row.result_jsonb,
    isDrill: row.is_drill,
    initiatedBy: row.initiated_by,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function includeGenealogyNode(node: GenealogyChainNode, direction: TraceInput['direction']): boolean {
  if (node.direction === 'self') return true;
  if (node.direction === 'ancestor') return direction === 'backward' || direction === 'both';
  return direction === 'forward' || direction === 'both';
}

function unique(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].filter((value): value is string => Boolean(value)))];
}

function nodeFlat(node: TraceNode): TraceFlatRow {
  return {
    nodeId: node.nodeId,
    type: node.type,
    ref: node.ref,
    qty: node.qty,
    uom: node.uom,
  };
}

function mergeTruncation(layers: TraceTruncationLayer[]): TraceTruncation {
  return {
    truncated: layers.length > 0,
    layers,
  };
}

async function resolveSeedLpIds(
  client: QueryClient,
  input: TraceInput,
): Promise<{ lpIds: string[]; truncation: TraceTruncation }> {
  const layers: TraceTruncationLayer[] = [];

  if (input.inputType === 'lp') {
    const { rows } = await client.query<{ id: string }>(
      `select lp.id::text as id
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and (lp.lp_code = $1 or lp.lp_number = $1)
        order by lp.created_at desc
        limit ${LP_SEED_LIMIT + 1}`,
      [input.inputRef],
    );
    const sliced = sliceSeedRows(rows, LP_SEED_LIMIT, 'seed_lp');
    if (sliced.layer) layers.push(sliced.layer);
    return { lpIds: sliced.ids, truncation: mergeTruncation(layers) };
  }

  if (input.inputType === 'batch') {
    const { rows } = await client.query<{ id: string }>(
      `select lp.id::text as id
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and (lp.batch_number = $1 or lp.supplier_batch_number = $1)
        order by lp.created_at desc
        limit ${BATCH_SEED_LIMIT + 1}`,
      [input.inputRef],
    );
    const sliced = sliceSeedRows(rows, BATCH_SEED_LIMIT, 'seed_batch');
    if (sliced.layer) layers.push(sliced.layer);
    return { lpIds: sliced.ids, truncation: mergeTruncation(layers) };
  }

  const { rows } = await client.query<{ id: string }>(
    `select lp.id::text as id
       from public.license_plates lp
       left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
      where lp.org_id = app.current_org_id()
        and (lp.product_id::text = $1 or i.item_code = $1)
      order by lp.created_at desc
      limit ${ITEM_SEED_LIMIT + 1}`,
    [input.inputRef],
  );
  const sliced = sliceSeedRows(rows, ITEM_SEED_LIMIT, 'seed_item');
  if (sliced.layer) layers.push(sliced.layer);
  return { lpIds: sliced.ids, truncation: mergeTruncation(layers) };
}

async function fetchLpRows(client: QueryClient, lpIds: string[]): Promise<Map<string, LpRow>> {
  if (lpIds.length === 0) return new Map();
  const { rows } = await client.query<LpRow>(
    `select lp.id::text as id,
            lp.lp_number,
            lp.lp_code,
            coalesce(lp.lp_code, lp.lp_number) as display_ref,
            lp.product_id::text as product_id,
            i.item_code,
            i.name as item_name,
            lp.quantity::text as quantity,
            lp.uom,
            coalesce(lp.batch_number, lp.supplier_batch_number) as batch_code,
            lp.status,
            lp.origin,
            lp.parent_lp_id::text,
            lp.grn_id::text,
            lp.wo_id::text,
            lp.consumed_by_wo_id::text,
            lp.source_so_id::text,
            to_char(lp.expiry_date, 'YYYY-MM-DD') as expiry_date,
            to_char(lp.best_before_date, 'YYYY-MM-DD') as best_before_date,
            lp.qa_status,
            lp.created_at::text
       from public.license_plates lp
       left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
      where lp.org_id = app.current_org_id()
        and lp.id = any($1::uuid[])
      order by lp.created_at asc`,
    [lpIds],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchAffectedCustomers(client: QueryClient, sourceSoIds: string[]): Promise<TraceAffectedCustomer[]> {
  if (sourceSoIds.length === 0) return [];
  const { rows } = await client.query<AffectedCustomerRow>(
    `select distinct
            c.id::text as customer_id,
            c.name as customer_name,
            c.customer_code
       from public.sales_orders so
       join public.customers c
         on c.org_id = app.current_org_id()
        and c.id = so.customer_id
      where so.org_id = app.current_org_id()
        and so.id = any($1::uuid[])
        and so.deleted_at is null
      order by c.name asc, c.customer_code asc`,
    [sourceSoIds],
  );
  return rows.map((row) => ({
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerCode: row.customer_code,
  }));
}

async function fetchForwardShipmentRows(client: QueryClient, lpIds: string[]): Promise<ForwardShipmentRow[]> {
  if (lpIds.length === 0) return [];
  const { rows } = await client.query<ForwardShipmentRow>(
    `select * from public.get_forward_shipments_org_wide(app.current_org_id(), $1::uuid[])`,
    [lpIds],
  );
  return rows;
}

async function fetchUpstreamRows(client: QueryClient, lpIds: string[]): Promise<Map<string, UpstreamRow>> {
  if (lpIds.length === 0) return new Map();
  const { rows } = await client.query<UpstreamRow>(
    `select lp.id::text as lp_id,
            gi.id::text as grn_item_id,
            g.id::text as grn_id,
            g.grn_number,
            po.id::text as po_id,
            po.po_number,
            s.id::text as supplier_id,
            s.code as supplier_code,
            s.name as supplier_name
       from public.license_plates lp
       left join public.grn_items gi
         on gi.org_id = app.current_org_id()
        and gi.lp_id = lp.id
        and gi.cancelled_at is null
       left join public.grns g
         on g.org_id = app.current_org_id()
        and g.id = coalesce(gi.grn_id, lp.grn_id)
       left join public.purchase_order_lines pol
         on pol.org_id = app.current_org_id()
        and pol.id = gi.po_line_id
       left join public.purchase_orders po
         on po.org_id = app.current_org_id()
        and po.id = coalesce(g.po_id, pol.po_id)
       left join public.suppliers s
         on s.org_id = app.current_org_id()
        and s.id = coalesce(g.supplier_id, po.supplier_id)
      where lp.org_id = app.current_org_id()
        and lp.id = any($1::uuid[])
      order by lp.created_at asc`,
    [lpIds],
  );
  return new Map(rows.map((row) => [row.lp_id, row]));
}

async function fetchConsumptionRows(
  client: QueryClient,
  lpIds: string[],
  woIds: string[],
): Promise<ConsumptionRow[]> {
  if (lpIds.length === 0 && woIds.length === 0) return [];
  const { rows } = await client.query<ConsumptionRow>(
    `select c.id::text as id,
            c.lp_id::text,
            c.wo_id::text,
            wo.wo_number,
            c.qty_consumed::text,
            c.uom,
            material_per_product.material_name
       from public.wo_material_consumption c
       join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = c.wo_id
       left join (
         select wm.org_id,
                wm.wo_id,
                wm.product_id,
                string_agg(distinct wm.material_name, ' / ' order by wm.material_name) as material_name
           from public.wo_materials wm
          where wm.org_id = app.current_org_id()
          group by wm.org_id, wm.wo_id, wm.product_id
       ) material_per_product
         on material_per_product.org_id = c.org_id
        and material_per_product.wo_id = c.wo_id
        and material_per_product.product_id = c.component_id
      where c.org_id = app.current_org_id()
        and (
          c.lp_id = any($1::uuid[])
          or c.wo_id = any($2::uuid[])
        )
      order by c.consumed_at asc`,
    [lpIds, woIds],
  );
  return rows;
}

async function fetchOutputRows(client: QueryClient, lpIds: string[], woIds: string[]): Promise<OutputRow[]> {
  if (lpIds.length === 0 && woIds.length === 0) return [];
  const { rows } = await client.query<OutputRow>(
    `select o.id::text as id,
            o.wo_id::text,
            wo.wo_number,
            o.lp_id::text as output_lp_id,
            coalesce(out_lp.lp_code, out_lp.lp_number, o.batch_number) as output_ref,
            o.batch_number,
            o.qty_kg::text as qty,
            o.uom,
            out_lp.quantity::text as current_qty,
            out_lp.uom as current_uom,
            out_lp.consumed_by_wo_id::text
       from public.wo_outputs o
       join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = o.wo_id
       left join public.license_plates out_lp
         on out_lp.org_id = app.current_org_id()
        and out_lp.id = o.lp_id
      where o.org_id = app.current_org_id()
        and (
          o.lp_id = any($1::uuid[])
          or o.wo_id = any($2::uuid[])
        )
      order by o.registered_at asc`,
    [lpIds, woIds],
  );
  return rows;
}

async function fetchWorkOrderRows(client: QueryClient, woIds: string[]): Promise<Map<string, WorkOrderRow>> {
  if (woIds.length === 0) return new Map();
  const { rows } = await client.query<WorkOrderRow>(
    `select wo.id::text as id,
            wo.wo_number,
            wo.planned_quantity::text as planned_quantity,
            wo.uom,
            wo.status
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = any($1::uuid[])`,
    [woIds],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

type WasteRow = {
  wo_id: string | null;
  wo_number: string | null;
  qty_kg: string;
};

/**
 * Fetches every waste row for the traced WOs. LP attribution is irrelevant at
 * this scope: the WO itself is the mass-balance boundary.
 */
async function fetchWasteByWorkOrder(
  client: QueryClient,
  woIds: string[],
): Promise<Map<string, string>> {
  if (woIds.length === 0) {
    return new Map();
  }
  const { rows } = await client.query<WasteRow>(
    `select w.wo_id::text,
            wo.wo_number,
            w.qty_kg::text
       from public.wo_waste_log w
       left join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = w.wo_id
      where w.org_id = app.current_org_id()
        and w.wo_id = any($1::uuid[])`,
    [woIds],
  );

  const wasteByWoId = new Map<string, string>();

  for (const row of rows) {
    const woId = row.wo_id ?? 'unknown';
    const existing = wasteByWoId.get(woId);
    wasteByWoId.set(woId, existing ? addDecimalStrings([existing, row.qty_kg]) : row.qty_kg);
  }

  const wasteByWo = new Map<string, string>();
  for (const [woId, qty] of wasteByWoId) {
    const woRef = rows.find((r) => r.wo_id === woId)?.wo_number ?? woId;
    wasteByWo.set(woRef, qty);
  }

  return wasteByWo;
}

function shouldIncludeConsumption(
  row: ConsumptionRow,
  input: TraceInput,
  outputRows: OutputRow[],
): boolean {
  if (input.direction === 'forward' || input.direction === 'both') return true;
  return outputRows.some((output) => output.wo_id === row.wo_id);
}

function isProductionLp(lp: LpRow | undefined): boolean {
  return lp?.origin === 'production' || Boolean(lp?.wo_id);
}

function resolveMassBalanceScope(
  input: TraceInput,
  seedLpIds: string[],
  lpRows: Map<string, LpRow>,
  outputRows: OutputRow[],
): { woIds: string[] } | null {
  if (input.inputType === 'item') return null;

  const woIds = new Set<string>();

  // Identify the connected WOs from the exact traced LP/batch set. Once a WO is
  // admitted, its balance uses every consumption, output and waste row from that
  // WO; mixing WO-wide inputs with one output batch fabricates deltas.
  for (const output of outputRows) {
    if (output.output_lp_id && lpRows.has(output.output_lp_id)) {
      woIds.add(output.wo_id);
    }
  }

  for (const lpId of seedLpIds) {
    const lp = lpRows.get(lpId);
    if (!isProductionLp(lp)) continue;
    if (lp?.wo_id) woIds.add(lp.wo_id);
  }

  return woIds.size === 0 ? null : { woIds: [...woIds] };
}

async function buildMassBalance(
  ctx: QualityContext,
  input: TraceInput,
  seedLpIds: string[],
  lpRows: Map<string, LpRow>,
  outputRows: OutputRow[],
  forwardShipmentRows: ForwardShipmentRow[],
  workOrders: Map<string, WorkOrderRow>,
): Promise<TraceReport['massBalance']> {
  // Site-restricted callers have license_plates pruned by RLS while wo_outputs /
  // wo_waste_log are org-wide — short-circuit to avoid fabricated deltas.
  const isUnrestricted = await isUserSiteAccessUnrestricted(ctx.userId, ctx.client);
  if (!isUnrestricted) {
    return { scopeLimited: true };
  }

  const scope = resolveMassBalanceScope(input, seedLpIds, lpRows, outputRows);
  if (!scope) return null;

  const consumptionRows = await fetchConsumptionRows(ctx.client, [], scope.woIds);
  const tracedWoIds = new Set(scope.woIds);
  const scopedOutputs = outputRows.filter((row) => tracedWoIds.has(row.wo_id));
  const scopedOutputLpIds = unique(scopedOutputs.map((row) => row.output_lp_id));
  const scopedOutputLpIdSet = new Set(scopedOutputLpIds);

  const consumptionByWo = new Map<string, ConsumptionRow[]>();
  for (const row of consumptionRows) {
    if (!tracedWoIds.has(row.wo_id)) continue;
    const list = consumptionByWo.get(row.wo_id) ?? [];
    list.push(row);
    consumptionByWo.set(row.wo_id, list);
  }

  const outputsByWo = new Map<string, OutputRow[]>();
  for (const row of scopedOutputs) {
    const list = outputsByWo.get(row.wo_id) ?? [];
    list.push(row);
    outputsByWo.set(row.wo_id, list);
  }

  const wasteByWo = await fetchWasteByWorkOrder(ctx.client, scope.woIds);

  const nodeInputs: MassBalanceNodeInput[] = [...tracedWoIds]
    .sort((a, b) => (workOrders.get(a)?.wo_number ?? a).localeCompare(workOrders.get(b)?.wo_number ?? b))
    .map((woId) => {
      const woRef = workOrders.get(woId)?.wo_number ?? woId;
      const woConsumptions = consumptionByWo.get(woId) ?? [];
      const woOutputs = outputsByWo.get(woId) ?? [];

      return {
        woRef,
        inputRows: woConsumptions.map((row) => ({
          ref: row.material_name ?? row.wo_number,
          qty: row.qty_consumed,
          uom: row.uom,
        })),
        outputRows: woOutputs.map((row) => ({
          ref: row.output_ref,
          qty: row.qty,
          uom: row.uom,
        })),
        wasteRows: [],
        remainingRows: [],
      };
    });

  const seedRows: MassBalanceQtyRow[] = consumptionRows
    .filter((row) => tracedWoIds.has(row.wo_id) && !scopedOutputLpIdSet.has(row.lp_id))
    .map((row) => ({
      ref: row.material_name ?? row.wo_number,
      qty: row.qty_consumed,
      uom: row.uom,
    }));

  const terminalOutputs = scopedOutputs.filter((row) => {
    const consumedByWoId =
      row.consumed_by_wo_id ?? (row.output_lp_id ? lpRows.get(row.output_lp_id)?.consumed_by_wo_id : null);
    return !consumedByWoId || !tracedWoIds.has(consumedByWoId);
  });
  const terminalOutputLpIds = new Set(unique(terminalOutputs.map((row) => row.output_lp_id)));

  const onSiteRows: MassBalanceQtyRow[] = terminalOutputs
    .flatMap((row) => {
      const lp = row.output_lp_id ? lpRows.get(row.output_lp_id) : undefined;
      const qty = row.current_qty ?? lp?.quantity;
      if (!qty || qty === '0') return [];
      return [{ ref: row.output_ref, qty, uom: row.current_uom ?? lp?.uom ?? row.uom }];
    });

  const shippedRows: MassBalanceQtyRow[] = forwardShipmentRows
    .filter((row) => terminalOutputLpIds.has(row.lp_id))
    .map((row) => ({
      ref: row.lp_ref,
      qty: row.shipped_qty,
      uom: row.uom,
    }));

  return computeMassBalance({
    nodes: nodeInputs,
    seedRows,
    onSiteRows,
    shippedRows,
    wasteByWo,
  });
}

async function buildTraceReport(ctx: QualityContext, input: TraceInput): Promise<TraceReport> {
  const { lpIds: seedLpIds, truncation } = await resolveSeedLpIds(ctx.client, input);
  const seedLpIdSet = new Set(seedLpIds);

  const genealogyByLpId = new Map<string, GenealogyChainNode>();
  const includedLpIds = new Set(seedLpIds);
  const expandedGenealogyRoots = new Set<string>();

  async function expandGenealogy(rootLpId: string): Promise<void> {
    if (expandedGenealogyRoots.has(rootLpId)) return;
    expandedGenealogyRoots.add(rootLpId);
    const chain = (await queryGenealogy(ctx.client, rootLpId))
      .filter((node) => includeGenealogyNode(node, input.direction));
    for (const node of chain) {
      includedLpIds.add(node.lpId);
      if (!genealogyByLpId.has(node.lpId)) genealogyByLpId.set(node.lpId, node);
    }
  }

  for (const seedLpId of seedLpIds) await expandGenealogy(seedLpId);

  let lpRows = new Map<string, LpRow>();
  let consumptionRows: ConsumptionRow[] = [];
  let directWoIds: string[] = [];
  let outputRows: OutputRow[] = [];

  // Historical safety net: an old output may have no lp_genealogy edge even
  // though the consumption and output ledgers agree on the WO. Walk that
  // canonical WO bridge until no new LP is found, expanding split/merge/
  // transfer descendants (or ancestors) from each newly discovered endpoint.
  while (true) {
    const sizeBefore = includedLpIds.size;
    lpRows = await fetchLpRows(ctx.client, [...includedLpIds]);
    directWoIds = unique(
      [...lpRows.values()].flatMap((lp) => [
        lp.wo_id,
        input.direction === 'forward' || input.direction === 'both' ? lp.consumed_by_wo_id : null,
      ]),
    );
    consumptionRows = await fetchConsumptionRows(
      ctx.client,
      [...lpRows.keys()],
      input.direction === 'backward' || input.direction === 'both' ? directWoIds : [],
    );
    const forwardConsumptionWoIds =
      input.direction === 'forward' || input.direction === 'both'
        ? unique(consumptionRows.map((row) => row.wo_id))
        : [];
    outputRows = await fetchOutputRows(
      ctx.client,
      [...lpRows.keys()],
      unique([...directWoIds, ...forwardConsumptionWoIds]),
    );

    const bridgeLpIds = unique([
      ...(input.direction === 'forward' || input.direction === 'both'
        ? outputRows.map((row) => row.output_lp_id)
        : []),
      ...(input.direction === 'backward' || input.direction === 'both'
        ? consumptionRows.map((row) => row.lp_id)
        : []),
    ]);
    for (const lpId of bridgeLpIds) {
      includedLpIds.add(lpId);
      await expandGenealogy(lpId);
    }
    if (includedLpIds.size === sizeBefore) break;
  }

  const upstreamRows = await fetchUpstreamRows(ctx.client, [...lpRows.keys()]);
  const includedConsumptionRows = consumptionRows.filter((row) => shouldIncludeConsumption(row, input, outputRows));
  const workOrders = await fetchWorkOrderRows(
    ctx.client,
    unique([
      ...directWoIds,
      ...includedConsumptionRows.map((row) => row.wo_id),
      ...outputRows.map((row) => row.wo_id),
    ]),
  );

  const nodes = new Map<string, TraceNode>();
  const edges = new Map<string, TraceEdge>();
  const outputNodeIds = new Set<string>();

  function addNode(node: TraceNode): void {
    const existing = nodes.get(node.nodeId);
    if (!existing) {
      nodes.set(node.nodeId, node);
      return;
    }
    if (existing.type === 'input_lp' && node.type === 'output_lp') existing.type = 'output_lp';
    if (!existing.qty && node.qty) existing.qty = node.qty;
    if (!existing.uom && node.uom) existing.uom = node.uom;
  }

  function addEdge(edge: Omit<TraceEdge, 'edgeId'>): void {
    const edgeId = `${edge.from}->${edge.to}:${edge.relation}`;
    if (!edges.has(edgeId)) edges.set(edgeId, { edgeId, ...edge });
  }

  function lpNodeType(lpId: string): TraceNodeType {
    const lp = lpRows.get(lpId);
    const genealogy = genealogyByLpId.get(lpId);
    if (lp?.origin === 'production' || lp?.wo_id || genealogy?.direction === 'descendant') return 'output_lp';
    if (seedLpIdSet.has(lpId) || genealogy?.direction === 'self' || genealogy?.direction === 'ancestor') return 'input_lp';
    return 'input_lp';
  }

  function ensureLpNode(lpId: string, overrideType?: TraceNodeType): string {
    const lp = lpRows.get(lpId);
    const genealogy = genealogyByLpId.get(lpId);
    const ref = lp?.display_ref ?? genealogy?.lpNumber ?? 'LP unavailable';
    const nodeId = `lp:${lpId}`;
    addNode({
      nodeId,
      type: overrideType ?? lpNodeType(lpId),
      ref,
      label: lp?.item_code ? `${ref} / ${lp.item_code}` : ref,
      qty: lp?.quantity ?? genealogy?.quantity ?? null,
      uom: lp?.uom ?? genealogy?.uom ?? null,
      expiryDate: lp?.expiry_date ?? null,
      bestBeforeDate: lp?.best_before_date ?? null,
      qaStatus: lp?.qa_status ?? null,
    });
    return nodeId;
  }

  function ensureWorkOrderNode(woId: string, fallbackWoNumber?: string): string {
    const wo = workOrders.get(woId);
    const ref = wo?.wo_number ?? fallbackWoNumber ?? 'WO unavailable';
    const nodeId = `wo:${woId}`;
    addNode({
      nodeId,
      type: 'work_order',
      ref,
      label: ref,
      qty: wo?.planned_quantity ?? null,
      uom: wo?.uom ?? null,
    });
    return nodeId;
  }

  for (const lpId of lpRows.keys()) ensureLpNode(lpId);

  for (const upstream of upstreamRows.values()) {
    const lpNodeId = ensureLpNode(upstream.lp_id);
    let previousNodeId: string | null = null;

    if (upstream.supplier_code || upstream.supplier_name) {
      const ref = upstream.supplier_code ?? upstream.supplier_name ?? 'supplier unavailable';
      const nodeId = `supplier:${upstream.supplier_id ?? ref}`;
      addNode({
        nodeId,
        type: 'supplier',
        ref,
        label: upstream.supplier_name ? `${ref} / ${upstream.supplier_name}` : ref,
        qty: null,
        uom: null,
      });
      previousNodeId = nodeId;
    }

    if (upstream.po_number) {
      const nodeId = `po:${upstream.po_id ?? upstream.po_number}`;
      addNode({
        nodeId,
        type: 'purchase_order',
        ref: upstream.po_number,
        label: upstream.po_number,
        qty: null,
        uom: null,
      });
      if (previousNodeId) {
        addEdge({ from: previousNodeId, to: nodeId, relation: 'ordered_on', qty: null, uom: null });
      }
      previousNodeId = nodeId;
    }

    if (upstream.grn_number) {
      const nodeId = `grn:${upstream.grn_id ?? upstream.grn_number}`;
      addNode({
        nodeId,
        type: 'grn',
        ref: upstream.grn_number,
        label: upstream.grn_number,
        qty: null,
        uom: null,
      });
      if (previousNodeId) {
        addEdge({ from: previousNodeId, to: nodeId, relation: 'received_on', qty: null, uom: null });
      }
      previousNodeId = nodeId;
    }

    if (previousNodeId) {
      addEdge({ from: previousNodeId, to: lpNodeId, relation: 'received_lp', qty: null, uom: null });
    }
  }

  for (const row of includedConsumptionRows) {
    const lpNodeId = ensureLpNode(row.lp_id, 'input_lp');
    const woNodeId = ensureWorkOrderNode(row.wo_id, row.wo_number);
    addEdge({ from: lpNodeId, to: woNodeId, relation: 'consumed_by', qty: row.qty_consumed, uom: row.uom });
  }

  for (const output of outputRows) {
    const woNodeId = ensureWorkOrderNode(output.wo_id, output.wo_number);
    const outputNodeId = output.output_lp_id
      ? ensureLpNode(output.output_lp_id, 'output_lp')
      : `wo-output:${output.id}`;
    if (!output.output_lp_id) {
      addNode({
        nodeId: outputNodeId,
        type: 'output_lp',
        ref: output.output_ref,
        label: output.output_ref,
        qty: output.qty,
        uom: output.uom,
      });
    }
    outputNodeIds.add(outputNodeId);
    addEdge({ from: woNodeId, to: outputNodeId, relation: 'produced', qty: output.qty, uom: output.uom });
  }

  for (const lp of lpRows.values()) {
    if (lp.wo_id && !outputRows.some((output) => output.output_lp_id === lp.id)) {
      const woNodeId = ensureWorkOrderNode(lp.wo_id);
      const lpNodeId = ensureLpNode(lp.id, 'output_lp');
      outputNodeIds.add(lpNodeId);
      addEdge({ from: woNodeId, to: lpNodeId, relation: 'produced', qty: lp.quantity, uom: lp.uom });
    }
    if (lp.consumed_by_wo_id && (input.direction === 'forward' || input.direction === 'both')) {
      const lpNodeId = ensureLpNode(lp.id, 'input_lp');
      const woNodeId = ensureWorkOrderNode(lp.consumed_by_wo_id);
      addEdge({ from: lpNodeId, to: woNodeId, relation: 'consumed_by', qty: lp.quantity, uom: lp.uom });
    }
  }

  const outputLpIds = unique([
    ...[...outputNodeIds].map((nodeId) => (nodeId.startsWith('lp:') ? nodeId.slice(3) : null)),
    ...[...lpRows.keys()].filter((lpId) => lpNodeType(lpId) === 'output_lp'),
  ]);
  const massBalanceShipmentRows = await fetchForwardShipmentRows(ctx.client, outputLpIds);
  const forwardShipmentRows =
    input.direction === 'forward' || input.direction === 'both'
      ? massBalanceShipmentRows
      : [];

  for (const shipment of forwardShipmentRows) {
    const outputNodeId = `lp:${shipment.lp_id}`;
    const shipmentNodeId = `shipment:${shipment.shipment_id}:${shipment.lp_id}`;
    const customerLabel = shipment.customer_name ?? shipment.customer_code ?? 'customer unavailable';
    const soLabel = shipment.sales_order_number ?? shipment.sales_order_id ?? 'SO unavailable';
    const shipmentRef = shipment.shipment_number ?? shipment.shipment_id;
    addNode({
      nodeId: shipmentNodeId,
      type: 'shipment_placeholder',
      ref: shipmentRef,
      label: `${customerLabel} / ${soLabel} / ${shipment.lp_ref}`,
      qty: shipment.shipped_qty,
      uom: shipment.uom,
    });
    addEdge({ from: outputNodeId, to: shipmentNodeId, relation: 'ships_to', qty: shipment.shipped_qty, uom: shipment.uom });
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  const lpNodeIds = nodeList.filter((node) => node.type === 'input_lp' || node.type === 'output_lp').map((node) => node.nodeId);
  const kgQuantities = unique(lpNodeIds.map((nodeId) => nodeId.startsWith('lp:') ? nodeId.slice(3) : null))
    .map((lpId) => lpRows.get(lpId))
    .filter((lp): lp is LpRow => lp !== undefined && isKgUom(lp.uom))
    .map((lp) => lp.quantity);
  const affectedCustomersFromShipments = new Map<string, TraceAffectedCustomer>();
  for (const shipment of forwardShipmentRows) {
    if (!shipment.customer_id || !shipment.customer_name) continue;
    affectedCustomersFromShipments.set(shipment.customer_id, {
      customerId: shipment.customer_id,
      customerName: shipment.customer_name,
      customerCode: shipment.customer_code,
    });
  }
  const affectedCustomers =
    affectedCustomersFromShipments.size > 0
      ? [...affectedCustomersFromShipments.values()].sort((a, b) => (
          a.customerName.localeCompare(b.customerName) || (a.customerCode ?? '').localeCompare(b.customerCode ?? '')
        ))
      : await fetchAffectedCustomers(ctx.client, unique([...lpRows.values()].map((lp) => lp.source_so_id)));

  const massBalance = await buildMassBalance(
    ctx,
    input,
    seedLpIds,
    lpRows,
    outputRows,
    massBalanceShipmentRows,
    workOrders,
  );

  return {
    nodes: nodeList,
    edges: edgeList,
    flat: nodeList.map(nodeFlat),
    affectedCustomers,
    summary: {
      lpCount: lpNodeIds.length,
      woCount: nodeList.filter((node) => node.type === 'work_order').length,
      shipmentCount: nodeList.filter((node) => node.type === 'shipment_placeholder').length,
      customersAffected: affectedCustomers.length,
      totalKg: addDecimalStrings(kgQuantities),
    },
    truncation,
    massBalance,
  };
}

export async function runTraceReport(rawInput: TraceInput): Promise<TraceReport> {
  const input = TraceInputSchema.parse(rawInput);
  return withOrgContext(async ({ userId, orgId, client }): Promise<TraceReport> => {
    const ctx = { userId, orgId, client: client as QueryClient };
    await assertTracePermission(ctx);
    return buildTraceReport(ctx, input);
  });
}

export async function getRecallDrills(): Promise<RecallDrill[]> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<RecallDrill[]> => {
    const ctx = { userId, orgId, client: client as QueryClient };
    await assertTracePermission(ctx);
    const { rows } = await ctx.client.query<RecallDrillRow>(
      `select id::text,
              initiated_by::text,
              input_type,
              input_ref,
              direction,
              started_at,
              completed_at,
              duration_ms,
              result_jsonb,
              is_drill,
              created_at,
              updated_at
         from public.recall_drills
        where org_id = app.current_org_id()
        order by started_at desc`,
    );
    return rows.map(mapRecallDrill);
  });
}

export async function getRecallDrill(id: string): Promise<RecallDrill | null> {
  const drillId = UuidSchema.parse(id);
  return withOrgContext(async ({ userId, orgId, client }): Promise<RecallDrill | null> => {
    const ctx = { userId, orgId, client: client as QueryClient };
    await assertTracePermission(ctx);
    const { rows } = await ctx.client.query<RecallDrillRow>(
      `select id::text,
              initiated_by::text,
              input_type,
              input_ref,
              direction,
              started_at,
              completed_at,
              duration_ms,
              result_jsonb,
              is_drill,
              created_at,
              updated_at
         from public.recall_drills
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [drillId],
    );
    return rows[0] ? mapRecallDrill(rows[0]) : null;
  });
}
