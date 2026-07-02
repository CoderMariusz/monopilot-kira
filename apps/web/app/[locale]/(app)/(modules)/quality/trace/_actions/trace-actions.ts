'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { queryGenealogy, type GenealogyChainNode } from '../../../../../../../lib/warehouse/genealogy';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };

const TraceInputSchema = z.object({
  inputType: z.enum(['lp', 'batch', 'item']),
  inputRef: z.string().trim().min(1).max(160),
  direction: z.enum(['backward', 'forward', 'both']),
});

const StartRecallDrillSchema = TraceInputSchema.extend({
  is_drill: z.boolean().optional().default(true),
});

const UuidSchema = z.string().uuid();

export type TraceInput = z.infer<typeof TraceInputSchema>;
export type StartRecallDrillInput = z.input<typeof StartRecallDrillSchema>;

export type TraceNodeType =
  | 'supplier'
  | 'purchase_order'
  | 'grn'
  | 'input_lp'
  | 'work_order'
  | 'output_lp'
  | 'shipment_placeholder';

export type TraceNode = {
  nodeId: string;
  type: TraceNodeType;
  ref: string;
  label: string;
  qty: string | null;
  uom: string | null;
  expiryDate?: string | null;
  bestBeforeDate?: string | null;
  qaStatus?: string | null;
};

export type TraceEdge = {
  edgeId: string;
  from: string;
  to: string;
  relation: 'supplied_by' | 'ordered_on' | 'received_on' | 'received_lp' | 'consumed_by' | 'produced' | 'ships_to';
  qty: string | null;
  uom: string | null;
};

export type TraceFlatRow = Pick<TraceNode, 'nodeId' | 'type' | 'ref' | 'qty' | 'uom'>;

export type TraceReport = {
  nodes: TraceNode[];
  edges: TraceEdge[];
  flat: TraceFlatRow[];
  affectedCustomers: TraceAffectedCustomer[];
  summary: {
    lpCount: number;
    woCount: number;
    shipmentCount: number;
    customersAffected: number;
    totalKg: string;
  };
};

export type TraceAffectedCustomer = {
  customerId: string;
  customerName: string;
  customerCode: string | null;
};

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

export type RecallDrill = {
  id: string;
  inputType: TraceInput['inputType'];
  inputRef: string;
  direction: TraceInput['direction'];
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: TraceReport | null;
  isDrill: boolean;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
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
  material_id: string | null;
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

function decimalToScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const sign = trimmed.startsWith('-') ? -1n : 1n;
  const unsigned = trimmed.replace(/^-/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  return sign * BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function formatScaledDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  if (scale === 0) return `${sign}${abs.toString()}`;
  const raw = abs.toString().padStart(scale + 1, '0');
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

function addDecimalStrings(values: string[]): string {
  const scale = values.reduce((max, value) => Math.max(max, value.split('.')[1]?.length ?? 0), 0);
  const total = values.reduce((sum, value) => sum + decimalToScaled(value, scale), 0n);
  return formatScaledDecimal(total, scale);
}

function isKg(uom: string | null | undefined): boolean {
  return uom?.trim().toLowerCase() === 'kg';
}

async function resolveSeedLpIds(client: QueryClient, input: TraceInput): Promise<string[]> {
  if (input.inputType === 'lp') {
    const { rows } = await client.query<{ id: string }>(
      `select lp.id::text as id
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and (lp.lp_code = $1 or lp.lp_number = $1)
        order by lp.created_at desc
        limit 200`,
      [input.inputRef],
    );
    return rows.map((row) => row.id);
  }

  if (input.inputType === 'batch') {
    const { rows } = await client.query<{ id: string }>(
      `select lp.id::text as id
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and (lp.batch_number = $1 or lp.supplier_batch_number = $1)
        order by lp.created_at desc
        limit 500`,
      [input.inputRef],
    );
    return rows.map((row) => row.id);
  }

  const { rows } = await client.query<{ id: string }>(
    `select lp.id::text as id
       from public.license_plates lp
       left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
      where lp.org_id = app.current_org_id()
        and (lp.product_id::text = $1 or i.item_code = $1)
      order by lp.created_at desc
      limit 500`,
    [input.inputRef],
  );
  return rows.map((row) => row.id);
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

async function fetchConsumptionRows(client: QueryClient, lpIds: string[]): Promise<ConsumptionRow[]> {
  if (lpIds.length === 0) return [];
  const { rows } = await client.query<ConsumptionRow>(
    `select c.id::text as id,
            c.lp_id::text,
            c.wo_id::text,
            wo.wo_number,
            c.qty_consumed::text,
            c.uom,
            wm.id::text as material_id,
            wm.material_name
       from public.wo_material_consumption c
       join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = c.wo_id
       left join public.wo_materials wm
         on wm.org_id = app.current_org_id()
        and wm.wo_id = c.wo_id
        and wm.product_id = c.component_id
      where c.org_id = app.current_org_id()
        and c.lp_id = any($1::uuid[])
      order by c.consumed_at asc`,
    [lpIds],
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
            o.uom
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

function shouldIncludeConsumption(
  row: ConsumptionRow,
  input: TraceInput,
  outputRows: OutputRow[],
): boolean {
  if (input.direction === 'forward' || input.direction === 'both') return true;
  return outputRows.some((output) => output.wo_id === row.wo_id);
}

async function buildTraceReport(ctx: QualityContext, input: TraceInput): Promise<TraceReport> {
  const seedLpIds = await resolveSeedLpIds(ctx.client, input);
  const seedLpIdSet = new Set(seedLpIds);

  const genealogyByLpId = new Map<string, GenealogyChainNode>();
  const includedLpIds = new Set(seedLpIds);

  for (const seedLpId of seedLpIds) {
    const chain = (await queryGenealogy(ctx.client, seedLpId)).filter((node) => includeGenealogyNode(node, input.direction));
    for (const node of chain) {
      includedLpIds.add(node.lpId);
      genealogyByLpId.set(node.lpId, node);
    }
  }

  const lpRows = await fetchLpRows(ctx.client, [...includedLpIds]);
  const upstreamRows = await fetchUpstreamRows(ctx.client, [...lpRows.keys()]);
  const consumptionRows = await fetchConsumptionRows(ctx.client, [...lpRows.keys()]);

  const directWoIds = unique(
    [...lpRows.values()].flatMap((lp) => [
      lp.wo_id,
      input.direction === 'forward' || input.direction === 'both' ? lp.consumed_by_wo_id : null,
    ]),
  );
  const forwardConsumptionWoIds =
    input.direction === 'forward' || input.direction === 'both' ? unique(consumptionRows.map((row) => row.wo_id)) : [];
  const outputRows = await fetchOutputRows(ctx.client, [...lpRows.keys()], unique([...directWoIds, ...forwardConsumptionWoIds]));
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

  const outputLpIds = unique([...outputNodeIds].map((nodeId) => (nodeId.startsWith('lp:') ? nodeId.slice(3) : null)));
  const forwardShipmentRows =
    input.direction === 'forward' || input.direction === 'both'
      ? await fetchForwardShipmentRows(ctx.client, outputLpIds)
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
    .filter((lp): lp is LpRow => lp !== undefined && isKg(lp.uom))
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

export async function startRecallDrill(rawInput: StartRecallDrillInput): Promise<{ drillId: string; report: TraceReport }> {
  const input = StartRecallDrillSchema.parse(rawInput);
  return withOrgContext(async ({ userId, orgId, client }): Promise<{ drillId: string; report: TraceReport }> => {
    const ctx = { userId, orgId, client: client as QueryClient };
    await assertTracePermission(ctx);
    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.recall_drills
         (org_id, initiated_by, input_type, input_ref, direction, started_at, is_drill)
       values (app.current_org_id(), $1::uuid, $2, $3, $4, pg_catalog.now(), $5)
       returning id::text`,
      [ctx.userId, input.inputType, input.inputRef, input.direction, input.is_drill],
    );
    const drillId = rows[0]?.id;
    if (!drillId) throw new Error('recall drill insert failed');
    const report = await buildTraceReport(ctx, input);
    return { drillId, report };
  });
}

export async function completeRecallDrill(drillId: string, result: TraceReport): Promise<RecallDrill> {
  const id = UuidSchema.parse(drillId);
  return withOrgContext(async ({ userId, orgId, client }): Promise<RecallDrill> => {
    const ctx = { userId, orgId, client: client as QueryClient };
    await assertTracePermission(ctx);
    const { rows } = await ctx.client.query<RecallDrillRow>(
      `update public.recall_drills
          set completed_at = pg_catalog.now(),
              duration_ms = greatest(0, floor(extract(epoch from (pg_catalog.now() - started_at)) * 1000)::integer),
              result_jsonb = $2::jsonb
        where org_id = app.current_org_id()
          and id = $1::uuid
        returning id::text,
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
                  updated_at`,
      [id, JSON.stringify(result)],
    );
    const row = rows[0];
    if (!row) throw new Error('recall drill not found');
    return mapRecallDrill(row);
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
