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

export type ShipToAddress = {
  customerName: string | null;
  customerCode: string | null;
  addressLines: string[];
};

export type DeliveryNoteBoxLine = {
  lineNumber: number;
  itemCode: string | null;
  itemName: string | null;
  lotNumber: string | null;
  lpCode: string | null;
  quantity: string;
};

export type DeliveryNoteBox = {
  boxNumber: number;
  sscc: string | null;
  lines: DeliveryNoteBoxLine[];
};

export type DeliveryNoteDocumentData = {
  documentType: 'delivery_note';
  /** Stable business number — sourced from shipments.delivery_note_number (assigned at creation). */
  documentNumber: string;
  shipmentId: string;
  shipmentNumber: string;
  salesOrderNumber: string | null;
  customerPo: string | null;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  shipTo: ShipToAddress;
  company: CompanyHeader;
  boxes: DeliveryNoteBox[];
  totalBoxes: number;
  generatedAt: string;
};
