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
