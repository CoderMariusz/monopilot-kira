/**
 * Trace client/server contract types (mirrors trace-actions.ts / trace-types.ts).
 */

export type TraceInputType = 'lp' | 'batch' | 'item';
export type TraceDirection = 'backward' | 'forward' | 'both';

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
};

export type TraceEdge = {
  edgeId: string;
  from: string;
  to: string;
  relation:
    | 'supplied_by'
    | 'ordered_on'
    | 'received_on'
    | 'received_lp'
    | 'consumed_by'
    | 'produced'
    | 'ships_to';
  qty: string | null;
  uom: string | null;
};

export type TraceFlatRow = Pick<TraceNode, 'nodeId' | 'type' | 'ref' | 'qty' | 'uom'>;

export type TraceAffectedCustomer = {
  customerId: string;
  customerName: string;
  customerCode: string | null;
};

export type TraceTruncationLayerKind = 'seed_lp' | 'seed_batch' | 'seed_item';

export type TraceTruncationLayer = {
  layer: TraceTruncationLayerKind;
  limit: number;
};

export type TraceTruncation = {
  truncated: boolean;
  layers: TraceTruncationLayer[];
};

export type TraceMassBalanceUnreconciled = {
  ref: string;
  qty: string;
  uom: string;
  bucket:
    | 'node_input'
    | 'node_output'
    | 'node_remaining'
    | 'netted_seed'
    | 'netted_on_site'
    | 'netted_shipped'
    | 'unattributed_wo_waste';
  reason?: string;
};

export type TraceMassBalanceNode = {
  woRef: string;
  inputKg: string;
  outputKg: string;
  wasteKg: string;
  remainingKg: string;
  deltaKg: string;
  balanced: boolean;
};

export type TraceMassBalanceTotal = {
  seedInputKg: string;
  shippedKg: string;
  onSiteKg: string;
  wasteKg: string;
  deltaKg: string;
  balanced: boolean;
  percentAccounted: string;
};

export type TraceMassBalance =
  | {
      scopeLimited: true;
    }
  | {
      applicable: true;
      nodes: TraceMassBalanceNode[];
      total: TraceMassBalanceTotal;
      unreconciled: TraceMassBalanceUnreconciled[];
    };

export type TraceSummary = {
  lpCount: number;
  woCount: number;
  shipmentCount: number;
  customersAffected: number;
  totalKg: string;
};

export type TraceReport = {
  nodes: TraceNode[];
  edges: TraceEdge[];
  flat: TraceFlatRow[];
  affectedCustomers: TraceAffectedCustomer[];
  summary: TraceSummary;
  truncation: TraceTruncation;
  massBalance: TraceMassBalance | null;
};

export type RecallDrill = {
  id: string;
  inputType: TraceInputType;
  inputRef: string;
  direction: TraceDirection;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: TraceReport | null;
  isDrill: boolean;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TraceInput = {
  inputType: TraceInputType;
  inputRef: string;
  direction: TraceDirection;
};

export type RunTraceReportAction = (input: TraceInput) => Promise<TraceReport>;

export type TraceNodeView = TraceNode & { detailHref: string | null };

export type TraceReportView = {
  nodes: TraceNodeView[];
  edges: TraceEdge[];
  flat: TraceFlatRow[];
  affectedCustomers?: TraceAffectedCustomer[];
  summary: TraceSummary;
  truncation?: TraceTruncation;
  massBalance?: TraceMassBalance | null;
};
