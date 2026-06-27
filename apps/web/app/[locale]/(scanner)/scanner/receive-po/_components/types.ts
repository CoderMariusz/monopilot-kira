import type { ScannerLabels } from "../../../_components/scanner-labels";

export type ReceivePoLabels = ScannerLabels["receivePo"];

export type ScannerPoSummary = {
  id: string;
  poNumber: string;
  supplierCode: string | null;
  supplierName: string;
  expectedDelivery: string | null;
  status: string;
  lineCount: number;
  receivedLineCount: number;
};

export type ScannerPoLine = {
  id: string;
  lineNo: number;
  itemCode: string;
  itemName: string;
  qty: string;
  uom: string;
  receivedQty: string;
};

export type ScannerPoDetail = ScannerPoSummary & {
  lines: ScannerPoLine[];
};

// Lane W9-L8: shape of GET /api/warehouse/scanner/location?code=… used by the
// optional destination-location field (same resolver the putaway screen uses).
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

export type LocationListResponse =
  | { locations: ScannerLocation[]; error?: never }
  | { locations?: never; error: string };

export type ReceiveResponse = {
  ok: boolean;
  replay?: boolean;
  error?: string;
  grnId?: string;
  grnNumber?: string;
  grnItemId?: string;
  lpId?: string;
  lpNumber?: string;
  qty?: string;
  uom?: string;
  overReceived?: boolean;
  poStatus?: string;
  qcInspectionRequired?: boolean;
  inspectionId?: string | null;
};
