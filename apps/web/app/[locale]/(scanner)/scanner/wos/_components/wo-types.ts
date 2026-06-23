// ============================================================
// Scanner — WO production-flow API contract types (Lane C).
//
// Codes against the parallel Codex API lane (apps/web/app/api/production/scanner/**).
// Decimal quantities cross the wire as STRINGS; this module never authors data.
// ============================================================

import type { OutputUom, UomSnapshot } from "../../../../../../lib/uom/convert";

export type WoStatus =
  | "planned"
  | "released"
  | "inprog"
  | "paused"
  | "done"
  | "cancelled";

export type WoListItem = {
  id: string;
  woNumber: string;
  status: WoStatus;
  itemCode: string;
  productName: string;
  /** DECIMAL STRING — planned qty as entered on the WO */
  plannedQty: string;
  /** DECIMAL STRING — qty entered on the WO, in the entered unit when present */
  qtyEntered: string | null;
  /** unit label for qtyEntered, e.g. "box" / "each" */
  qtyEnteredUom: string | null;
  uomSnapshot: UomSnapshot | null;
  scheduledStart: string | null;
  /** the WO's production line UUID (null when unassigned) — used by the "My line" filter */
  lineId: string | null;
  /** human-readable production-line code, e.g. "L1" */
  lineCode: string | null;
};

export type WoListResponse = { ok: true; wos: WoListItem[] } | ApiError;

export type WoMaterial = {
  id: string;
  materialName: string;
  /** DECIMAL STRING */
  requiredQty: string;
  /** DECIMAL STRING */
  consumedQty: string;
  uom: string;
  sequence: number;
};

export type WoHeader = WoListItem & {
  /** DECIMAL STRING — SUM(wo_outputs.qty_kg); '0' when no outputs */
  producedBaseKg: string;
  /**
   * DECIMAL STRING — SUM(wo_outputs.qty_units) for finished-goods outputs;
   * '0' when no outputs; null when units tracking is n/a for this WO.
   */
  producedUnits: string | null;
};

export type WoDetailResponse =
  | {
      ok: true;
      header: WoHeader;
      materials: WoMaterial[];
      allergenGate: boolean;
    }
  | ApiError;

export type ApiError = { ok: false; error: string };

/** FEFO LP candidate from GET /api/production/scanner/wos/[id]/lps?materialId=… */
export type LpCandidate = {
  lpId: string;
  lpNumber: string;
  /** DECIMAL STRING — available qty in the material's uom */
  qty: string;
  uom: string;
  /** ISO date (YYYY-MM-DD) or null */
  expiry: string | null;
};

export type WoLpsResponse = { ok: true; lps: LpCandidate[] } | ApiError;

export type ConsumePayload = {
  clientOpId: string;
  materialId: string;
  /** DECIMAL STRING in the material uom */
  qty: string;
  lpId?: string;
  reasonCode?: string;
  approver?: {
    email: string;
    pin: string;
  };
};

export type OutputPayload = {
  clientOpId: string;
  qtyUnits?: string;
  unitsUom?: "each" | "box";
  actualWeightKg?: string;
  qtyKg?: string;
  batchNumber?: string;
};

export type WastePayload = {
  clientOpId: string;
  categoryCode: string;
  /** DECIMAL STRING in kg */
  qtyKg: string;
  reason?: string;
};

export type MutationResult = { ok: true; replay?: boolean } | ApiError;

export type { OutputUom, UomSnapshot };
