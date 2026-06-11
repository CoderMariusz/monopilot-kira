// ============================================================
// Scanner — Putaway / Move LP shared wire types (Lane K1).
//
// These mirror the lane-C3 warehouse scanner LP contracts exactly:
//   GET  /api/warehouse/scanner/lp?code=<lpNumber|uuid>
//   GET  /api/warehouse/scanner/putaway/suggest?lpId=
//   POST /api/warehouse/scanner/putaway { clientOpId, lpId, toLocationId }
//   POST /api/warehouse/scanner/move    { clientOpId, lpId, toLocationId, reason? }
// Quantities arrive as numbers from the route; we render them verbatim and
// never do unit math on the wire values.
// ============================================================

export type ScannerLp = {
  id: string;
  lpNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  uom: string;
  status: string;
  qaStatus: string;
  expiryDate: string | null;
  batchNumber: string | null;
  locationId: string | null;
  locationCode: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  lastMoveAt: string | null;
  parents?: unknown[];
  children?: unknown[];
};

export type LpLookupResponse =
  | { lp: ScannerLp; error?: never }
  | { lp?: never; error: string };

export type PutawaySuggestionReason = "same_product" | "empty" | "default";

export type PutawaySuggestion = {
  locationId: string;
  locationCode: string;
  locationName: string;
  reason: PutawaySuggestionReason;
};

export type SuggestResponse = { suggestions: PutawaySuggestion[] };

export type MoveResult =
  | { ok: true; moveId: string; replay?: boolean }
  | { ok?: false; error?: string };

// GET /api/warehouse/scanner/location?code=<locationCode|uuid>
//   200 { location: { id, code, name, warehouseId, warehouseCode, locationType } }
//   404 { error: 'location_not_found' }
export type ScannerLocation = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  locationType: string;
};

export type LocationLookupResponse =
  | { location: ScannerLocation; error?: never }
  | { location?: never; error: string };
