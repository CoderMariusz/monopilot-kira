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
  plannedQty: number;
  /** entered/output qty so far, in the WO's entered unit when present */
  qtyEntered: number | null;
  /** unit label for qtyEntered, e.g. "box" / "each" */
  qtyEnteredUom: string | null;
  uomSnapshot: UomSnapshot | null;
  scheduledStart: string | null;
};

export type WoListResponse = { ok: true; wos: WoListItem[] } | ApiError;

export type WoMaterial = {
  id: string;
  materialName: string;
  requiredQty: number;
  consumedQty: number;
  uom: string;
  sequence: number;
};

export type WoHeader = WoListItem & { producedKg: number };

export type WoDetailResponse =
  | {
      ok: true;
      header: WoHeader;
      materials: WoMaterial[];
      allergenGate: boolean;
    }
  | ApiError;

export type ApiError = { ok: false; error: string };

export type ConsumePayload = {
  clientOpId: string;
  materialId: string;
  /** DECIMAL STRING in the material uom */
  qty: string;
  lpId?: string;
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
