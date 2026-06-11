// ============================================================
// Scanner — LP info types (Lane K2).
//
// Code EXACTLY against the lane-C3 backend contract:
//   GET /api/warehouse/scanner/lp?code=<lpNumber or uuid>
//     200 { lp: {...} } | 404 { error: 'lp_not_found' }
// ============================================================

import type { ScannerLabels } from "../../../_components/scanner-labels";

export type LpInfoLabels = ScannerLabels["lpInfoScreen"];

export type LpRef = { id: string; lpNumber: string };

export type LpInfo = {
  id: string;
  lpNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: string;
  reservedQty: string;
  availableQty: string;
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
  parents: LpRef[];
  children: LpRef[];
};

export type LpInfoResponse = {
  lp?: LpInfo;
  error?: string;
};
