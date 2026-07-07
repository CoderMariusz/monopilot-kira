/** JSON-serializable payloads for printable HTML document views. */

export type CompanyHeader = {
  tradingName: string;
  legalName: string | null;
  vat: string | null;
  addressLines: string[];
  email: string | null;
  phone: string | null;
};

export type DocumentLine = {
  lineNumber: number;
  itemCode: string | null;
  itemName: string | null;
  orderedQty: string | null;
  receivedQty: string;
  uom: string;
  batchNumber: string | null;
  expiryDate: string | null;
  lpNumber: string | null;
  /** Item GTIN-14 when the received product has gs1_gtin (for print barcodes). */
  gs1Gtin: string | null;
  cancelled: boolean;
};

export type GrnDocumentTotals = {
  lineCount: number;
  liveLineCount: number;
  receivedByUom: Array<{ uom: string; totalReceived: string }>;
};

export type GrnDocumentData = {
  documentType: 'grn';
  /** Stable business number — sourced from grns.grn_number (assigned at creation). */
  documentNumber: string;
  grnId: string;
  status: string;
  sourceType: string;
  sourceDocumentNumber: string | null;
  supplierName: string | null;
  warehouseCode: string | null;
  receiptDate: string;
  completedAt: string | null;
  notes: string | null;
  company: CompanyHeader;
  lines: DocumentLine[];
  totals: GrnDocumentTotals;
  generatedAt: string;
};
