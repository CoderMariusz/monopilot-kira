import { withOrgContext } from '../auth/with-org-context';
import { parseImportRows } from './po-import-parser';
import type { ImportError, PreviewRow } from './po-import-validator';

type LookupRow = { id: string; code: string };

export type PreviewToRow = PreviewRow & {
  toNumber?: string;
  fromSite: string;
  fromSiteId: string;
  toSite: string;
  toSiteId: string;
  scheduledDate?: string;
};

type ToLookups = {
  sites: Map<string, string>;
  items: Map<string, string>;
};

function read(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const exact = row[key];
    if (typeof exact === 'string') return exact.trim();
    const found = Object.entries(row).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found) return found[1].trim();
  }
  return '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function positiveQty(value: string): boolean {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return false;
  return Number(value) > 0;
}

async function loadLookups(rows: Record<string, string>[]): Promise<ToLookups> {
  return withOrgContext(async ({ client }) => {
    const siteCodes = unique(rows.flatMap((row) => [read(row, 'from_site', 'fromSite'), read(row, 'to_site', 'toSite')]));
    const itemCodes = unique(rows.map((row) => read(row, 'item_code', 'itemCode', 'product_code', 'productCode')));
    const [sites, items] = await Promise.all([
      siteCodes.length > 0
        ? client.query<LookupRow>(
            `select id, code
               from public.warehouses
              where org_id = app.current_org_id()
                and code = any($1::text[])`,
            [siteCodes],
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
      sites: new Map(sites.rows.map((row) => [row.code, row.id])),
      items: new Map(items.rows.map((row) => [row.code, row.id])),
    };
  });
}

function validateRows(rows: Record<string, string>[], lookups: ToLookups): { valid: PreviewToRow[]; errors: ImportError[] } {
  const valid: PreviewToRow[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const toNumber = read(row, 'to_number', 'toNumber');
    const fromSite = read(row, 'from_site', 'fromSite');
    const toSite = read(row, 'to_site', 'toSite');
    const itemCode = read(row, 'item_code', 'itemCode', 'product_code', 'productCode');
    const qty = read(row, 'qty', 'quantity');
    const uom = read(row, 'uom', 'unit');
    const fromSiteId = lookups.sites.get(fromSite);
    const toSiteId = lookups.sites.get(toSite);
    const itemId = lookups.items.get(itemCode);

    if (!fromSite) {
      errors.push({ rowNumber, column: 'from_site', message: 'Source site is required.' });
    } else if (!fromSiteId) {
      errors.push({ rowNumber, column: 'from_site', message: `Source site "${fromSite}" was not found.` });
    }
    if (!toSite) {
      errors.push({ rowNumber, column: 'to_site', message: 'Destination site is required.' });
    } else if (!toSiteId) {
      errors.push({ rowNumber, column: 'to_site', message: `Destination site "${toSite}" was not found.` });
    }
    if (fromSiteId && toSiteId && fromSiteId === toSiteId) {
      errors.push({ rowNumber, column: 'to_site', message: 'Source and destination sites must differ.' });
    }
    if (!itemCode) {
      errors.push({ rowNumber, column: 'item_code', message: 'Item code is required.' });
    } else if (!itemId) {
      errors.push({ rowNumber, column: 'item_code', message: `Item/product code "${itemCode}" was not found.` });
    }
    if (!positiveQty(qty)) {
      errors.push({ rowNumber, column: 'qty', message: 'Quantity must be greater than 0 with at most 3 decimal places.' });
    }
    if (!uom) {
      errors.push({ rowNumber, column: 'uom', message: 'UoM is required.' });
    }

    if (fromSiteId && toSiteId && fromSiteId !== toSiteId && itemId && positiveQty(qty) && uom) {
      valid.push({
        rowNumber,
        supplierCode: '',
        supplierId: '',
        itemCode,
        itemId,
        qty,
        uom,
        unitPrice: '0',
        toNumber: toNumber || undefined,
        fromSite,
        fromSiteId,
        toSite,
        toSiteId,
        scheduledDate: read(row, 'scheduled_date', 'scheduledDate', 'date') || undefined,
        notes: read(row, 'notes') || undefined,
      });
    }
  });

  return { valid, errors };
}

export async function previewToImport(formData: FormData): Promise<{ valid: PreviewToRow[]; errors: ImportError[] }> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { valid: [], errors: [{ rowNumber: 0, column: 'file', message: 'CSV file is required.' }] };
  }

  const rows = await parseImportRows(file);
  const lookups = await loadLookups(rows);
  return validateRows(rows, lookups);
}
