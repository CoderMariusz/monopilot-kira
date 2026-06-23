/**
 * Trace & Recall (Wave E2A) — client/server contract types.
 *
 * These mirror the EXACT shapes exported by the reviewed Trace Server Actions
 * (quality/trace/_actions/trace-actions.ts) — imported by the page, never
 * re-authored here. Kept in a leaf module so the client islands and the RTL
 * tests share one source of truth for the action signatures we wire against.
 *
 * Action signatures wired against (trace-actions.ts):
 *   runTraceReport({ inputType, inputRef, direction }) → TraceReport
 *   startRecallDrill({ inputType, inputRef, direction }) → { drillId, report }
 *   completeRecallDrill(drillId, report) → RecallDrill
 *   getRecallDrills() → RecallDrill[]
 *   getRecallDrill(id) → RecallDrill | null
 *
 * Rule 0.11: no raw UUID ever reaches the UI — only lp_code / wo_number / grn
 * number / supplier code+name (the action already returns these human refs in
 * `node.ref` / `node.label`). The `nodeId` carries an internal id used ONLY to
 * build a deep-link href server-side (toDetailHref) — it is never rendered.
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
  summary: TraceSummary;
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

/** Exact callable signature of the reviewed runTraceReport action. */
export type RunTraceReportAction = (input: TraceInput) => Promise<TraceReport>;

/** Exact callable signature of the reviewed startRecallDrill action. */
export type StartRecallDrillAction = (
  input: TraceInput,
) => Promise<{ drillId: string; report: TraceReport }>;

/** Exact callable signature of the reviewed completeRecallDrill action. */
export type CompleteRecallDrillAction = (
  drillId: string,
  result: TraceReport,
) => Promise<RecallDrill>;

/**
 * A node enriched (server-side) with the deep-link href to its detail screen
 * where one exists. `detailHref` is null when the node type has no detail route
 * (supplier, purchase_order, shipment_placeholder) or the id is not a UUID.
 * The UUID itself is NEVER surfaced — only `ref`/`label` are rendered.
 */
export type TraceNodeView = TraceNode & { detailHref: string | null };

export type TraceReportView = {
  nodes: TraceNodeView[];
  edges: TraceEdge[];
  flat: TraceFlatRow[];
  summary: TraceSummary;
};
