import { fetchCompanyHeader, type QueryClient } from './company-header';
import type { DocumentLine, GrnDocumentData, GrnDocumentTotals } from './types';

export type GrnHeaderRow = {
  id: string;
  grn_number: string;
  source_type: string;
  status: string;
  supplier_name: string | null;
  warehouse_code: string | null;
  receipt_date: string | Date;
  completed_at: string | Date | null;
  notes: string | null;
  po_number: string | null;
};

export type GrnLineRow = {
  line_number: number | string;
  item_code: string | null;
  item_name: string | null;
  ordered_qty: string | null;
  received_qty: string;
  uom: string;
  batch_number: string | null;
  expiry_date: string | Date | null;
  lp_number: string | null;
  cancelled: boolean;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function computeGrnTotals(lines: DocumentLine[]): GrnDocumentTotals {
  const liveLines = lines.filter((line) => !line.cancelled);
  const byUom = new Map<string, number>();
  for (const line of liveLines) {
    const qty = Number(line.receivedQty);
    if (!Number.isFinite(qty)) continue;
    byUom.set(line.uom, (byUom.get(line.uom) ?? 0) + qty);
  }
  return {
    lineCount: lines.length,
    liveLineCount: liveLines.length,
    receivedByUom: [...byUom.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uom, total]) => ({
        uom,
        totalReceived: String(Number(total.toFixed(3))),
      })),
  };
}

export function mapGrnLineRow(row: GrnLineRow): DocumentLine {
  return {
    lineNumber: Number(row.line_number),
    itemCode: row.item_code,
    itemName: row.item_name,
    orderedQty: row.ordered_qty,
    receivedQty: String(row.received_qty),
    uom: row.uom,
    batchNumber: row.batch_number,
    expiryDate: toIso(row.expiry_date)?.slice(0, 10) ?? null,
    lpNumber: row.lp_number,
    cancelled: row.cancelled === true,
  };
}

export function buildGrnDocumentData(input: {
  header: GrnHeaderRow;
  lineRows: GrnLineRow[];
  company: NonNullable<Awaited<ReturnType<typeof fetchCompanyHeader>>>;
  generatedAt: string;
}): GrnDocumentData {
  const lines = input.lineRows.map(mapGrnLineRow);
  return {
    documentType: 'grn',
    documentNumber: input.header.grn_number,
    grnId: input.header.id,
    status: input.header.status,
    sourceType: input.header.source_type,
    sourceDocumentNumber: input.header.po_number,
    supplierName: input.header.supplier_name,
    warehouseCode: input.header.warehouse_code,
    receiptDate: toIso(input.header.receipt_date) ?? '',
    completedAt: toIso(input.header.completed_at),
    notes: input.header.notes,
    company: input.company,
    lines,
    totals: computeGrnTotals(lines),
    generatedAt: input.generatedAt,
  };
}

export async function assembleGrnDocument(
  client: QueryClient,
  grnId: string,
  generatedAt: string,
): Promise<GrnDocumentData | 'not_found'> {
  const [company, headerResult] = await Promise.all([
    fetchCompanyHeader(client),
    client.query<GrnHeaderRow>(
      `select g.id::text,
              g.grn_number,
              g.source_type,
              g.status,
              s.name as supplier_name,
              w.code as warehouse_code,
              g.receipt_date,
              g.completed_at,
              g.notes,
              po.po_number
         from public.grns g
         left join public.suppliers s
           on s.org_id = app.current_org_id()
          and s.id = g.supplier_id
         left join public.warehouses w
           on w.org_id = app.current_org_id()
          and w.id = g.warehouse_id
         left join public.purchase_orders po
           on po.org_id = app.current_org_id()
          and po.id = g.po_id
        where g.org_id = app.current_org_id()
          and g.id = $1::uuid
        limit 1`,
      [grnId],
    ),
  ]);

  const header = headerResult.rows[0];
  if (!header || !company) return 'not_found';

  const { rows: lineRows } = await client.query<GrnLineRow>(
    `select gi.line_number,
            i.item_code,
            i.name as item_name,
            gi.ordered_qty::text,
            gi.received_qty::text,
            gi.uom,
            gi.batch_number,
            gi.expiry_date,
            lp.lp_number,
            (gi.cancelled_at is not null) as cancelled
       from public.grn_items gi
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = gi.product_id
       left join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = gi.lp_id
      where gi.org_id = app.current_org_id()
        and gi.grn_id = $1::uuid
      order by gi.line_number asc`,
    [grnId],
  );

  return buildGrnDocumentData({ header, lineRows, company, generatedAt });
}
