/**
 * Phase-2 document engine — shared serializable payloads for printable HTML views.
 *
 * Pattern for future documents (invoice, CoA, packing list):
 *   1. Define a *DocumentData* type here (JSON-serializable, no functions).
 *   2. Assemble org-scoped rows in lib/documents/<kind>-document.ts (pure builder + SQL).
 *   3. Expose a thin `'use server'` action that wraps withOrgContext + RBAC.
 *   4. Render via a dedicated /print route with @media print CSS (browser → PDF).
 *   5. Upgrade path: swap the route renderer for @react-pdf/renderer or a server-side
 *      PDF worker without changing the assembly contract.
 */

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
