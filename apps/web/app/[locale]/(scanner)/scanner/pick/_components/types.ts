// ============================================================
// Scanner — Pick for WO types (Lane K2).
//
// Code EXACTLY against the lane-C3 backend contracts:
//   GET  /api/warehouse/scanner/pick/wos
//   GET  /api/warehouse/scanner/pick/lps?productId=&uom=
//   POST /api/warehouse/scanner/pick { clientOpId, woId, materialId, lpId, toLocationId? }
// ============================================================

import type { ScannerLabels } from "../../../_components/scanner-labels";

export type PickLabels = ScannerLabels["pickScreen"];

export type PickMaterial = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  requiredQty: string;
  consumedQty: string;
  uom: string;
};

export type PickWo = {
  id: string;
  woNumber: string;
  productCode: string;
  productName: string;
  status: string;
  lineCode: string | null;
  materials: PickMaterial[];
};

export type PickWosResponse = {
  ok?: boolean;
  wos?: PickWo[];
};

export type PickLp = {
  id: string;
  lpNumber: string;
  availableQty: string;
  uom: string;
  expiryDate: string | null;
  locationCode: string | null;
};

export type PickLpsResponse = {
  ok?: boolean;
  lps?: PickLp[];
};

export type PickPayload = {
  clientOpId: string;
  woId: string;
  materialId: string;
  lpId: string;
  toLocationId?: string;
};

export type PickResult = {
  ok?: boolean;
  moveId?: string;
  replay?: boolean;
  error?: string;
};
