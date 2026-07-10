export type ToImportRow = {
  external_ref: string;
  from_warehouse_code: string;
  to_warehouse_code: string;
  item_code: string;
  qty: number;
  uom: string;
  date?: string;
};

export type ToImportError = { column: string; message: string };

export type ToImportForbidden = { ok: false; error: 'forbidden' };

export type ToValidationResult = {
  rows: Array<{ rowNumber: number; ok: boolean; errors: ToImportError[] }>;
  summary: { total: number; ok: number; failed: number };
};

export type ToImportResult = {
  created: Array<{ to_number: string; external_ref: string }>;
  skipped: Array<{ external_ref: string; reason: string }>;
  failed: Array<{ rowNumber: number; errors: ToImportError[] }>;
};

export type ToValidationResponse = ToValidationResult | ToImportForbidden;
export type ToImportResponse = ToImportResult | ToImportForbidden;
