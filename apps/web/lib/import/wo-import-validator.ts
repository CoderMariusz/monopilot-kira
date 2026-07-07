import { withOrgContext } from '../auth/with-org-context';
import { parseImportRows } from './po-import-parser';
import type { ImportError, PreviewRow } from './po-import-validator';

type ItemLookupRow = {
  id: string;
  item_code: string;
  uom_base: string | null;
  uom_secondary: string | null;
  output_uom: string | null;
};

type RoutingLookupRow = { id: string };

export type PreviewWoRow = PreviewRow & {
  woNumber?: string;
  routingId?: string;
  scheduledStartTime?: string;
};

type WoLookups = {
  items: Map<string, ItemLookupRow>;
  routings: Set<string>;
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

async function loadLookups(rows: Record<string, string>[]): Promise<WoLookups> {
  return withOrgContext(async ({ client }) => {
    const itemCodes = unique(rows.map((row) => read(row, 'item_code', 'itemCode', 'fg_code', 'fgCode', 'product_code', 'productCode')));
    const routingIds = unique(rows.map((row) => read(row, 'routing_id', 'routingId')));
    const [items, routings] = await Promise.all([
      itemCodes.length > 0
        ? client.query<ItemLookupRow>(
            `select id, item_code, uom_base, uom_secondary, output_uom
               from public.items
              where org_id = app.current_org_id()
                and item_code = any($1::text[])
                and item_type = 'fg'
                and status = 'active'`,
            [itemCodes],
          )
        : Promise.resolve({ rows: [] }),
      routingIds.length > 0
        ? client.query<RoutingLookupRow>(
            `select id
               from public.routings
              where org_id = app.current_org_id()
                and id = any($1::uuid[])`,
            [routingIds],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    return {
      items: new Map(items.rows.map((row) => [row.item_code, row])),
      routings: new Set(routings.rows.map((row) => row.id)),
    };
  });
}

import { normalizePieceUom } from '../uom/piece';

function itemAcceptsUom(item: ItemLookupRow, uom: string): boolean {
  const normalized = normalizePieceUom(uom) ?? uom;
  return [item.uom_base, item.uom_secondary, item.output_uom, 'base', 'each', 'box']
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizePieceUom(value) ?? value)
    .includes(normalized);
}

function validateRows(rows: Record<string, string>[], lookups: WoLookups): { valid: PreviewWoRow[]; errors: ImportError[] } {
  const valid: PreviewWoRow[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const woNumber = read(row, 'wo_number', 'woNumber');
    const itemCode = read(row, 'item_code', 'itemCode', 'fg_code', 'fgCode', 'product_code', 'productCode');
    const qty = read(row, 'qty', 'quantity');
    const uom = read(row, 'uom', 'unit');
    const routingId = read(row, 'routing_id', 'routingId');
    const item = lookups.items.get(itemCode);

    if (!itemCode) {
      errors.push({ rowNumber, column: 'item_code', message: 'Item code is required.' });
    } else if (!item) {
      errors.push({ rowNumber, column: 'item_code', message: `Item/product code "${itemCode}" was not found.` });
    }
    if (!positiveQty(qty)) {
      errors.push({ rowNumber, column: 'qty', message: 'Quantity must be greater than 0 with at most 3 decimal places.' });
    }
    if (!uom) {
      errors.push({ rowNumber, column: 'uom', message: 'UoM is required.' });
    } else if (item && !itemAcceptsUom(item, uom)) {
      errors.push({ rowNumber, column: 'uom', message: `UoM "${uom}" is not valid for item code "${itemCode}".` });
    }
    if (routingId && !lookups.routings.has(routingId)) {
      errors.push({ rowNumber, column: 'routing_id', message: `Routing "${routingId}" was not found.` });
    }

    if (item && positiveQty(qty) && uom && itemAcceptsUom(item, uom) && (!routingId || lookups.routings.has(routingId))) {
      valid.push({
        rowNumber,
        supplierCode: '',
        supplierId: '',
        itemCode,
        itemId: item.id,
        qty,
        uom,
        unitPrice: '0',
        woNumber: woNumber || undefined,
        routingId: routingId || undefined,
        scheduledStartTime: read(row, 'scheduled_start_time', 'scheduledStartTime', 'planned_date', 'plannedDate') || undefined,
        notes: read(row, 'notes') || undefined,
      });
    }
  });

  return { valid, errors };
}

export async function previewWoImport(formData: FormData): Promise<{ valid: PreviewWoRow[]; errors: ImportError[] }> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { valid: [], errors: [{ rowNumber: 0, column: 'file', message: 'CSV file is required.' }] };
  }

  const rows = await parseImportRows(file);
  const lookups = await loadLookups(rows);
  return validateRows(rows, lookups);
}
