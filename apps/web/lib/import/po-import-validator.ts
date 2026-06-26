export type PreviewRow = {
  rowNumber: number;
  supplierCode: string;
  supplierId: string;
  itemCode: string;
  itemId: string;
  qty: string;
  uom: string;
  unitPrice: string;
  currency?: string;
  expectedDelivery?: string;
  notes?: string;
};

export type ImportError = {
  rowNumber: number;
  column: string;
  message: string;
};

export type ImportLookups = {
  suppliers: Map<string, string>;
  items: Map<string, string>;
};

export type PreviewResult = { valid: PreviewRow[]; errors: ImportError[] };

function read(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const exact = row[key];
    if (typeof exact === 'string') return exact.trim();
    const found = Object.entries(row).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found) return found[1].trim();
  }
  return '';
}

function positiveQty(value: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  return Number(value) > 0;
}

export function validateImportRows(
  rows: Record<string, string>[],
  lookups: ImportLookups,
): PreviewResult {
  const valid: PreviewRow[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const supplierCode = read(row, 'supplier_code', 'supplierCode');
    const itemCode = read(row, 'item_code', 'itemCode', 'product_code', 'productCode');
    const qty = read(row, 'qty', 'quantity');
    const uom = read(row, 'uom', 'unit');
    const supplierId = lookups.suppliers.get(supplierCode);
    const itemId = lookups.items.get(itemCode);

    if (!supplierId) {
      errors.push({ rowNumber, column: 'supplier_code', message: `Supplier code "${supplierCode}" was not found.` });
    }
    if (!itemId) {
      errors.push({ rowNumber, column: 'item_code', message: `Item/product code "${itemCode}" was not found.` });
    }
    if (!positiveQty(qty)) {
      errors.push({ rowNumber, column: 'qty', message: 'Quantity must be greater than 0.' });
    }
    if (!uom) {
      errors.push({ rowNumber, column: 'uom', message: 'UoM is required.' });
    }

    if (supplierId && itemId && positiveQty(qty) && uom) {
      valid.push({
        rowNumber,
        supplierCode,
        supplierId,
        itemCode,
        itemId,
        qty,
        uom,
        unitPrice: read(row, 'unit_price', 'unitPrice', 'price') || '0',
        currency: read(row, 'currency') || undefined,
        expectedDelivery: read(row, 'expected_delivery', 'expectedDelivery') || undefined,
        notes: read(row, 'notes') || undefined,
      });
    }
  });

  return { valid, errors };
}
