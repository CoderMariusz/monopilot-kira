import { z } from 'zod';

import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

export { hasPermission } from '../../../../../../../lib/auth/has-permission';

export const PLANNING_WO_WRITE_PERMISSION = 'npd.planning.write';
export const APP_VERSION = 'planning-work-orders-v1';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type PlanningWorkOrderError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'uom_conversion_unavailable'
  | 'pack_hierarchy_incomplete'
  // F10 — a WO write with no resolvable site fails closed instead of persisting
  // site_id=NULL: no_active_site (org has 0 active sites) / ambiguous_site (>1
  // active site, none chosen or default — operator must pick via the top bar).
  | 'no_active_site'
  | 'ambiguous_site'
  | 'document_mask_missing'
  | 'not_released_to_factory'
  | 'chain_delete_blocked'
  | 'persistence_failed';

export type EnteredUom = 'base' | 'each' | 'box';

export type UomConversionResult = {
  qtyEntered: string;
  qtyEnteredUom: EnteredUom;
  baseQty: string;
};

export type CreateWorkOrderOptions = {
  /** When true, multi-stage FG BOMs create upstream WIP work orders (planning modal only). */
  allowChain?: boolean;
};

export type WOHeader = {
  id: string;
  woNumber: string;
  productId: string;
  itemCode: string | null;
  itemTypeAtCreation: string;
  plannedQuantity: string;
  producedQuantity: string | null;
  uom: string;
  status: string;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  productionLineId: string | null;
  priority: string;
  sourceOfDemand: string;
  sourceReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WOSummary = WOHeader & {
  materialCount: number;
  operationCount: number;
};

export type WOMaterial = {
  id: string;
  woId: string;
  productId: string | null;
  materialName: string;
  requiredQty: string;
  consumedQty: string;
  reservedQty: string;
  uom: string;
  sequence: number;
  materialSource: string;
  bomItemId: string | null;
  bomVersion: number | null;
  notes: string | null;
};

export type WOOperation = {
  id: string;
  woId: string;
  sequence: number;
  operationName: string;
  lineId: string | null;
  expectedDurationMinutes: number | null;
  expectedYieldPercent: string | null;
  actualDuration: number | null;
  actualYield: string | null;
  status: string;
  notes: string | null;
};

export type ScheduleOutput = {
  id: string;
  plannedWoId: string;
  productId: string;
  outputRole: string;
  expectedQty: string;
  uom: string;
  allocationPct: string;
  disposition: string;
  downstreamWoId: string | null;
  notes: string | null;
};

export type WOExecutionState = {
  id: string;
  woId: string;
  status: string;
  version: number;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
};

export type WODependency = {
  id: string;
  parentWoId: string;
  childWoId: string;
  materialLink: string | null;
  requiredQty: string | null;
  createdAt: string;
};

export type WOStatusHistory = {
  id: string;
  woId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  userId: string | null;
  overrideReason: string | null;
  context: Record<string, unknown>;
  occurredAt: string;
};

export type ListPlanningWorkOrdersResult =
  | {
      ok: true;
      workOrders: Array<WOSummary & { latestExecution?: WOExecutionState; primarySchedule?: ScheduleOutput }>;
      pagination: PaginatedResult<WOSummary & { latestExecution?: WOExecutionState; primarySchedule?: ScheduleOutput }>;
      archivedCount: number;
      statusCounts: WoStatusCounts;
    }
  | { ok: false; error: PlanningWorkOrderError };

const WO_LIST_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'] as const;
export type WoListStatus = (typeof WO_LIST_STATUSES)[number];
export type WoStatusCounts = Record<WoListStatus, number> & { all: number };

export function buildWoStatusCounts(rows: Array<{ status: string; n: number }>): WoStatusCounts {
  const counts = WO_LIST_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<WoListStatus, number>,
  );
  let all = 0;
  for (const row of rows) {
    const key = row.status.toUpperCase();
    if ((WO_LIST_STATUSES as readonly string[]).includes(key)) {
      counts[key as WoListStatus] = row.n;
      all += row.n;
    }
  }
  return { ...counts, all };
}

export type GetPlanningWorkOrderResult =
  | {
      ok: true;
      workOrder: WOHeader & {
        materials: WOMaterial[];
        operations: WOOperation[];
        schedules: ScheduleOutput[];
        dependencies: WODependency[];
        statusHistory: WOStatusHistory[];
      };
    }
  | { ok: false; error: PlanningWorkOrderError };

export type CreateWorkOrderChainSummary = {
  /** Upstream WIP work orders created alongside the FG root. */
  wipWorkOrders: WOHeader[];
  dependencies: Array<{
    parentWoId: string;
    childWoId: string;
    materialLink: string | null;
    requiredQty: string | null;
  }>;
  /** FG root + upstream WIP stages. */
  totalCount: number;
};

export type CreateWorkOrderResult =
  | {
      ok: true;
      workOrder: WOHeader;
      materials: WOMaterial[];
      primarySchedule: ScheduleOutput;
      conversion?: UomConversionResult;
      warning?: 'no_active_bom' | 'no_approved_factory_spec';
      /** Present when the FG BOM has WIP lines and createWorkOrderChain ran. */
      chain?: CreateWorkOrderChainSummary;
    }
  | { ok: false; error: PlanningWorkOrderError; issues?: z.ZodIssue[] };

export type ReleaseWorkOrderResult =
  | { ok: true; workOrder: WOHeader }
  | { ok: false; error: PlanningWorkOrderError }
  | { ok: false; error: 'factory_release_incomplete'; missing: Array<'active_bom' | 'factory_spec'> };

export type DeleteDraftWorkOrderResult =
  | { ok: true; id: string }
  | { ok: false; error: PlanningWorkOrderError };

export const CreateWorkOrderInput = z.object({
  productId: z.string().uuid(),
  itemCode: z.string().trim().min(1).max(128),
  itemTypeAtCreation: z.enum(['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct']).optional(),
  documentNumber: z.string().trim().min(1).max(128).optional(),
  siteId: z.string().uuid().optional(),
  plannedQuantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/, 'plannedQuantity must be a positive numeric string with up to 4 decimals')
    .refine((value) => Number(value) > 0, 'plannedQuantity must be positive'),
  quantityEntered: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/, 'quantityEntered must be a positive numeric string with up to 4 decimals')
    .refine((value) => Number(value) > 0, 'quantityEntered must be positive')
    .optional(),
  quantityEnteredUom: z.enum(['base', 'each', 'box']).optional(),
  scheduledStartTime: z.string().datetime({ offset: true }).optional(),
  productionLineId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine((value) => !value.quantityEntered || !!value.quantityEnteredUom, {
  path: ['quantityEnteredUom'],
  message: 'quantityEnteredUom is required when quantityEntered is present',
});

export type CreateWorkOrderInputType = z.input<typeof CreateWorkOrderInput>;

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export function mapWoHeader(row: WorkOrderRow): WOHeader {
  return {
    id: row.id,
    woNumber: row.wo_number,
    productId: row.product_id,
    itemCode: row.item_code,
    itemTypeAtCreation: row.item_type_at_creation,
    plannedQuantity: String(row.planned_quantity),
    producedQuantity: row.produced_quantity === null ? null : String(row.produced_quantity),
    uom: row.uom,
    status: row.status,
    scheduledStartTime: toNullableIso(row.scheduled_start_time),
    scheduledEndTime: toNullableIso(row.scheduled_end_time),
    productionLineId: row.production_line_id,
    priority: row.priority,
    sourceOfDemand: row.source_of_demand,
    sourceReference: row.source_reference,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapMaterial(row: WOMaterialRow): WOMaterial {
  return {
    id: row.id,
    woId: row.wo_id,
    productId: row.product_id,
    materialName: row.material_name,
    requiredQty: String(row.required_qty),
    consumedQty: String(row.consumed_qty),
    reservedQty: String(row.reserved_qty),
    uom: row.uom,
    sequence: Number(row.sequence),
    materialSource: row.material_source,
    bomItemId: row.bom_item_id,
    bomVersion: row.bom_version,
    notes: row.notes,
  };
}

export function mapOperation(row: WOOperationRow): WOOperation {
  return {
    id: row.id,
    woId: row.wo_id,
    sequence: Number(row.sequence),
    operationName: row.operation_name,
    lineId: row.line_id,
    expectedDurationMinutes: row.expected_duration_minutes,
    expectedYieldPercent: row.expected_yield_percent === null ? null : String(row.expected_yield_percent),
    actualDuration: row.actual_duration,
    actualYield: row.actual_yield === null ? null : String(row.actual_yield),
    status: row.status,
    notes: row.notes,
  };
}

export function mapSchedule(row: ScheduleOutputRow): ScheduleOutput {
  return {
    id: row.id,
    plannedWoId: row.planned_wo_id,
    productId: row.product_id,
    outputRole: row.output_role,
    expectedQty: String(row.expected_qty),
    uom: row.uom,
    allocationPct: String(row.allocation_pct),
    disposition: row.disposition,
    downstreamWoId: row.downstream_wo_id,
    notes: row.notes,
  };
}

export function mapExecution(row: WOExecutionRow): WOExecutionState {
  return {
    id: row.id,
    woId: row.wo_id,
    status: row.status,
    version: Number(row.version),
    startedAt: toNullableIso(row.started_at),
    pausedAt: toNullableIso(row.paused_at),
    resumedAt: toNullableIso(row.resumed_at),
    completedAt: toNullableIso(row.completed_at),
    closedAt: toNullableIso(row.closed_at),
    cancelledAt: toNullableIso(row.cancelled_at),
  };
}

export function mapDependency(row: WODependencyRow): WODependency {
  return {
    id: row.id,
    parentWoId: row.parent_wo_id,
    childWoId: row.child_wo_id,
    materialLink: row.material_link,
    requiredQty: row.required_qty === null ? null : String(row.required_qty),
    createdAt: toIso(row.created_at),
  };
}

export function mapStatusHistory(row: WOStatusHistoryRow): WOStatusHistory {
  return {
    id: row.id,
    woId: row.wo_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    action: row.action,
    userId: row.user_id,
    overrideReason: row.override_reason,
    context: row.context_jsonb,
    occurredAt: toIso(row.occurred_at),
  };
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

export type WorkOrderRow = {
  id: string;
  wo_number: string;
  product_id: string;
  item_code: string | null;
  item_type_at_creation: string;
  planned_quantity: string;
  produced_quantity: string | null;
  uom: string;
  status: string;
  scheduled_start_time: Date | string | null;
  scheduled_end_time: Date | string | null;
  production_line_id: string | null;
  priority: string;
  source_of_demand: string;
  source_reference: string | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type WOSummaryRow = WorkOrderRow & {
  material_count: number | string;
  operation_count: number | string;
  latest_execution: WOExecutionRow | null;
  primary_schedule: ScheduleOutputRow | null;
};

export type WOMaterialRow = {
  id: string;
  wo_id: string;
  product_id: string | null;
  material_name: string;
  required_qty: string;
  consumed_qty: string;
  reserved_qty: string;
  uom: string;
  sequence: number;
  material_source: string;
  bom_item_id: string | null;
  bom_version: number | null;
  notes: string | null;
};

export type WOOperationRow = {
  id: string;
  wo_id: string;
  sequence: number;
  operation_name: string;
  line_id: string | null;
  expected_duration_minutes: number | null;
  expected_yield_percent: string | null;
  actual_duration: number | null;
  actual_yield: string | null;
  status: string;
  notes: string | null;
};

export type ScheduleOutputRow = {
  id: string;
  planned_wo_id: string;
  product_id: string;
  output_role: string;
  expected_qty: string;
  uom: string;
  allocation_pct: string;
  disposition: string;
  downstream_wo_id: string | null;
  notes: string | null;
};

export type WOExecutionRow = {
  id: string;
  wo_id: string;
  status: string;
  version: number;
  started_at: Date | string | null;
  paused_at: Date | string | null;
  resumed_at: Date | string | null;
  completed_at: Date | string | null;
  closed_at: Date | string | null;
  cancelled_at: Date | string | null;
};

export type WODependencyRow = {
  id: string;
  parent_wo_id: string;
  child_wo_id: string;
  material_link: string | null;
  required_qty: string | null;
  created_at: Date | string;
};

export type WOStatusHistoryRow = {
  id: string;
  wo_id: string;
  from_status: string | null;
  to_status: string;
  action: string;
  user_id: string | null;
  override_reason: string | null;
  context_jsonb: Record<string, unknown>;
  occurred_at: Date | string;
};

export type ChainErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'no_active_bom'
  | 'pack_hierarchy_incomplete'
  | 'no_active_site'
  | 'document_mask_missing'
  | 'not_released_to_factory'
  | 'wo_create_failed'
  | 'persistence_failed';

export class WorkOrderChainError extends Error {
  constructor(readonly code: ChainErrorCode, readonly planningError?: string) {
    super(planningError ? `${code}:${planningError}` : code);
  }
}

export type WipChainEntry = {
  workOrder: WOHeader;
  bomLineId: string;
};

// Exported for unit tests: strict bom-line link, provably-unique legacy fallback, else reject.
export function resolveMaterialForWipEntry(
  fgMaterials: WOMaterial[],
  wipEntry: WipChainEntry,
  wipEntries: WipChainEntry[],
): WOMaterial {
  const byBomLine = fgMaterials.find((row) => row.bomItemId === wipEntry.bomLineId);
  if (byBomLine) return byBomLine;

  const productMatches = fgMaterials.filter((row) => row.productId === wipEntry.workOrder.productId);
  const wipLinesForProduct = wipEntries.filter(
    (entry) => entry.workOrder.productId === wipEntry.workOrder.productId,
  );
  const legacyMaterial = productMatches[0];
  if (
    productMatches.length === 1
    && wipLinesForProduct.length === 1
    && legacyMaterial
    && (legacyMaterial.bomItemId == null || legacyMaterial.bomItemId === '')
  ) {
    return legacyMaterial;
  }

  throw new WorkOrderChainError('persistence_failed', 'wip_material_link_ambiguous');
}
