'use server';

import { withOrgContext } from '../auth/with-org-context';
import { createPurchaseOrder } from '../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions';
import { parseImportRows } from './po-import-parser';
import { validateImportRows, type ImportError, type PreviewResult, type PreviewRow } from './po-import-validator';

type LookupRow = { id: string; code: string };

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string') return value.trim();
    const found = Object.entries(row).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found) return found[1].trim();
  }
  return '';
}

async function loadLookups(rows: Record<string, string>[]): Promise<{ suppliers: Map<string, string>; items: Map<string, string> }> {
  return withOrgContext(async ({ client }) => {
    const supplierCodes = unique(rows.map((row) => getValue(row, 'supplier_code', 'supplierCode')));
    const itemCodes = unique(rows.map((row) => getValue(row, 'item_code', 'itemCode', 'product_code', 'productCode')));
    const [suppliers, items] = await Promise.all([
      supplierCodes.length > 0
        ? client.query<LookupRow>(
            `select id, code
               from public.suppliers
              where org_id = app.current_org_id()
                and code = any($1::text[])`,
            [supplierCodes],
          )
        : Promise.resolve({ rows: [] }),
      itemCodes.length > 0
        ? client.query<LookupRow>(
            `select id, item_code as code
               from public.items
              where org_id = app.current_org_id()
                and item_code = any($1::text[])
                and status = 'active'`,
            [itemCodes],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    return {
      suppliers: new Map(suppliers.rows.map((row) => [row.code, row.id])),
      items: new Map(items.rows.map((row) => [row.code, row.id])),
    };
  });
}

export async function previewBulkImportPo(formData: FormData): Promise<PreviewResult> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { valid: [], errors: [{ rowNumber: 0, column: 'file', message: 'CSV file is required.' }] };
  }

  const rows = await parseImportRows(file);
  const lookups = await loadLookups(rows);
  return validateImportRows(rows, lookups);
}

export async function confirmBulkImportPo(rows: PreviewRow[]): Promise<{ created: number; errors: ImportError[] }> {
  const groups = new Map<string, PreviewRow[]>();
  for (const row of rows) {
    const group = groups.get(row.supplierId);
    if (group) group.push(row);
    else groups.set(row.supplierId, [row]);
  }

  let created = 0;
  const errors: ImportError[] = [];

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    if (!first) continue;
    const result = await createPurchaseOrder({
      supplierId: first.supplierId,
      status: 'draft',
      expectedDelivery: first.expectedDelivery,
      currency: first.currency ?? 'EUR',
      notes: groupRows.map((row) => row.notes).filter(Boolean).join('\n') || undefined,
      lines: groupRows.map((row, index) => ({
        itemId: row.itemId,
        qty: row.qty,
        uom: row.uom,
        unitPrice: row.unitPrice,
        lineNo: index + 1,
      })),
    });

    if (result.ok) {
      created += 1;
    } else {
      for (const row of groupRows) {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'supplier_code',
          message: `Could not create purchase order: ${result.message ?? result.error}.`,
        });
      }
    }
  }

  return { created, errors };
}
