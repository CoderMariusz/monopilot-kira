/**
 * W9-M3 — 12-Reporting read-only slice: shared types + RBAC helper.
 *
 * Permission family: the `rpt.*` strings seeded by migration
 * 214-reporting-outbox-and-rbac-seed.sql (org-admin role family gets the full
 * 14-string set; operator gets `rpt.dashboard.view`). These strings were seeded
 * with NO enforcement anywhere (audit finding #9) — this module is the first
 * consumer:
 *   - every read action checks `rpt.dashboard.view` (fail-closed), and
 *   - the CSV export buttons are gated on `rpt.export.csv`.
 *
 * Same fail-closed role_permissions + legacy roles.permissions jsonb lookup the
 * warehouse module uses (warehouse/_actions/shared.ts).
 */

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ReportingContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type ReportingResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'error'; message?: string };

export const RPT_DASHBOARD_VIEW_PERMISSION = 'rpt.dashboard.view';
export const RPT_EXPORT_CSV_PERMISSION = 'rpt.export.csv';

export async function hasReportingPermission(
  ctx: ReportingContext,
  permission: string,
): Promise<boolean> {
  const res = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r
         on r.id = ur.role_id
        and r.org_id = $2::uuid
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return (res.rowCount ?? res.rows.length) > 0;
}

/** Clamp a report window to a sane integer day count. */
export function asDays(value: unknown, fallback: number, max = 365): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(value, max)
    : fallback;
}

export function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** Numeric-string coercion for math on pg `numeric` text values (display math only). */
export function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Percentage as a 2-dp decimal string; null when the denominator is 0/absent
 * (honest NULL — never renders a fabricated 0%).
 */
export function pct(numerator: number, denominator: number): string | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return ((numerator / denominator) * 100).toFixed(2);
}

/** Average of day-spans (ms pairs) as a 1-dp decimal string; null when no pairs. */
export function avgDays(pairs: Array<{ fromMs: number; toMs: number }>): string | null {
  const valid = pairs.filter(
    (p) => Number.isFinite(p.fromMs) && Number.isFinite(p.toMs) && p.toMs >= p.fromMs,
  );
  if (valid.length === 0) return null;
  const totalDays = valid.reduce((acc, p) => acc + (p.toMs - p.fromMs) / 86_400_000, 0);
  return (totalDays / valid.length).toFixed(1);
}

// ── Payload types ─────────────────────────────────────────────────────────────

export type ProductionSummary = {
  days: number;
  wosCompleted: number;
  /** Sum of wo_outputs.qty_kg registered in the window (kg-canonical column). */
  outputKg: string;
  /** Sum of wo_waste_log.qty_kg recorded in the window. */
  wasteKg: string;
  /** waste / (output + waste) × 100, 2 dp; null when no output AND no waste. */
  wastePct: string | null;
  /**
   * avg(work_orders.yield_percent) × 100 over WOs completed in the window,
   * 2 dp; yield_percent = actual_qty / planned_quantity (same-UoM generated
   * column). Null when no completed WO in the window has actual_qty recorded.
   */
  avgYieldPct: string | null;
  /**
   * Sum of downtime_events.duration_min for events STARTED in the window.
   * HONEST GAP: duration_min is GENERATED only once ended_at is set — still-open
   * downtime events contribute 0 here (their duration is NULL by design).
   */
  downtimeMinutes: number;
  rows: Array<{
    woNumber: string;
    itemCode: string | null;
    itemName: string | null;
    plannedQty: string;
    actualQty: string | null;
    uom: string;
    /** yield_percent × 100 as 2-dp string; null when actual_qty unrecorded. */
    yieldPct: string | null;
    completedAt: string | null;
  }>;
};

export type InventorySnapshot = {
  totals: {
    lpCount: number;
    activeLpCount: number;
    blockedLpCount: number;
    /** kg-UoM LPs only — see qtyKg note on the row type. */
    qtyKg: string;
    expiredCount: number;
    expiring7dCount: number;
  };
  rows: Array<{
    warehouseId: string;
    warehouseCode: string | null;
    warehouseName: string | null;
    /** On-hand LPs (status received/available/reserved/allocated/blocked/quarantine). */
    lpCount: number;
    /** Status family: received/available/reserved/allocated. */
    activeLpCount: number;
    /** Status family: blocked/quarantine. */
    blockedLpCount: number;
    /**
     * Sum of license_plates.quantity for on-hand LPs whose uom = 'kg' ONLY.
     * HONEST GAP: LP quantities are stored in mixed UoM (kg, each, box…) —
     * summing across UoM would be meaningless, so non-kg LPs are excluded from
     * this column (they still count in lpCount).
     */
    qtyKg: string;
    /** On-hand quantity totals grouped by original license plate UoM. */
    qtyByUom: Array<{ uom: string; qty: string }>;
    expiredCount: number;
    expiring7dCount: number;
  }>;
};

export type GrnReceiptRow = {
  grnId: string;
  grnNumber: string;
  sourceType: string;
  poId: string | null;
  toId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
  status: string;
  itemLineCount: number;
  /** Received GRN item quantity totals grouped by original grn_items.uom. */
  receivedQtyByUom: Array<{ uom: string; qty: string }>;
  receiptDate: string;
  completedAt: string | null;
};

export type ReceiptsSummary = {
  days: number;
  totals: {
    grnCount: number;
    completedGrnCount: number;
    cancelledGrnCount: number;
    itemLineCount: number;
    /** Received GRN item quantity totals grouped by original grn_items.uom. */
    receivedQtyByUom: Array<{ uom: string; qty: string }>;
  };
  rows: GrnReceiptRow[];
};

export type ShipmentReportRow = {
  shipmentId: string;
  shipmentNumber: string;
  salesOrderNumber: string | null;
  customerName: string | null;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  totalWeightKg: number | null;
  boxCount: number;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

export type ShipmentsSummary = {
  days: number;
  totals: {
    shipmentCount: number;
    packingCount: number;
    shippedCount: number;
    deliveredCount: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  rows: ShipmentReportRow[];
};

export type QualitySummary = {
  days: number;
  /** Holds currently in open/investigating/quarantined/escalated (not windowed). */
  openHolds: number;
  /** quality_inspections created in the window, by status. */
  inspectionsByStatus: Array<{ status: string; count: number }>;
  /** NCRs currently in open/investigating/awaiting_capa/reopened (not windowed). */
  ncrOpen: number;
  /** NCRs with closed_at inside the window. */
  ncrClosedInWindow: number;
  rows: Array<{ entity: 'hold' | 'inspection' | 'ncr'; status: string; count: number }>;
};

export type ProcurementSummary = {
  days: number;
  /** POs created in the window, by status. */
  posByStatus: Array<{ status: string; count: number }>;
  /**
   * HONEST NULL — always null. purchase_orders has NO confirmed_at column and
   * status transitions are not timestamped anywhere queryable, so
   * "confirmed → first GRN" is not computable from the schema as it exists.
   */
  avgConfirmedToFirstGrnDays: null;
  /**
   * Labeled proxy: avg days from po.created_at to the earliest grns.receipt_date
   * (grns.po_id join), over POs created in the window that have ≥1 GRN. 1 dp;
   * null when no PO in the window has a GRN.
   */
  avgCreatedToFirstGrnDays: string | null;
  /** transfer_orders currently in draft/in_transit (not windowed). */
  openToCount: number;
};
