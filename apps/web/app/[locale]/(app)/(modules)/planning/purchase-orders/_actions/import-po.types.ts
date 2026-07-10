export type PoImportRow = {
  external_ref: string;
  supplier_code: string;
  item_code: string;
  qty: number;
  uom: string;
  price?: number;
  currency?: string;
  expected_delivery?: string;
  warehouse_code?: string;
  notes?: string;
};

export type PoImportError = { column: string; message: string };

export type PoImportForbidden = { ok: false; error: 'forbidden' };

export type PoValidationResult = {
  rows: Array<{ rowNumber: number; ok: boolean; errors: PoImportError[] }>;
  summary: { total: number; ok: number; failed: number };
};

export type PoImportResult = {
  created: Array<{ po_number: string; external_ref: string }>;
  skipped: Array<{ external_ref: string; reason: string }>;
  failed: Array<{ rowNumber: number; errors: PoImportError[] }>;
};

export type PoValidationResponse = PoValidationResult | PoImportForbidden;
export type PoImportResponse = PoImportResult | PoImportForbidden;
