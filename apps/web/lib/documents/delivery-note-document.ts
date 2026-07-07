import { fetchCompanyHeader, type QueryClient } from './company-header';
import type { DeliveryNoteBox, DeliveryNoteBoxLine, DeliveryNoteDocumentData, ShipToAddress } from './types';

export type DeliveryNoteHeaderRow = {
  id: string;
  delivery_note_number: string;
  shipment_number: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  packed_at: string | Date | null;
  shipped_at: string | Date | null;
  sales_order_number: string | null;
  customer_po: string | null;
  customer_name: string | null;
  customer_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_iso2: string | null;
};

export type DeliveryNoteBoxRow = {
  box_id: string;
  box_number: number | string;
  sscc: string | null;
};

export type DeliveryNoteContentRow = {
  box_id: string;
  line_number: number | string;
  item_code: string | null;
  item_name: string | null;
  lot_number: string | null;
  lp_code: string | null;
  quantity: string;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function mapShipToAddress(row: DeliveryNoteHeaderRow): ShipToAddress {
  const lines: string[] = [];
  const line1 = trimOrNull(row.address_line1);
  const line2 = trimOrNull(row.address_line2);
  const cityLine = [trimOrNull(row.city), trimOrNull(row.state), trimOrNull(row.postal_code)]
    .filter(Boolean)
    .join(', ');
  const country = trimOrNull(row.country_iso2);
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);
  if (cityLine) lines.push(cityLine);
  if (country) lines.push(country);
  return {
    customerName: trimOrNull(row.customer_name),
    customerCode: trimOrNull(row.customer_code),
    addressLines: lines,
  };
}

export function mapDeliveryNoteContentRow(row: DeliveryNoteContentRow): DeliveryNoteBoxLine {
  return {
    lineNumber: Number(row.line_number),
    itemCode: trimOrNull(row.item_code),
    itemName: trimOrNull(row.item_name),
    lotNumber: trimOrNull(row.lot_number),
    lpCode: trimOrNull(row.lp_code),
    quantity: String(row.quantity),
  };
}

export function buildDeliveryNoteDocumentData(input: {
  header: DeliveryNoteHeaderRow;
  boxRows: DeliveryNoteBoxRow[];
  contentRows: DeliveryNoteContentRow[];
  company: NonNullable<Awaited<ReturnType<typeof fetchCompanyHeader>>>;
  generatedAt: string;
}): DeliveryNoteDocumentData {
  const contentsByBox = new Map<string, DeliveryNoteBoxLine[]>();
  for (const row of input.contentRows) {
    const lines = contentsByBox.get(row.box_id) ?? [];
    lines.push(mapDeliveryNoteContentRow(row));
    contentsByBox.set(row.box_id, lines);
  }

  const boxes: DeliveryNoteBox[] = input.boxRows.map((box) => ({
    boxNumber: Number(box.box_number),
    sscc: trimOrNull(box.sscc),
    lines: contentsByBox.get(box.box_id) ?? [],
  }));

  return {
    documentType: 'delivery_note',
    documentNumber: input.header.delivery_note_number,
    shipmentId: input.header.id,
    shipmentNumber: input.header.shipment_number,
    salesOrderNumber: trimOrNull(input.header.sales_order_number),
    customerPo: trimOrNull(input.header.customer_po),
    status: input.header.status,
    carrier: trimOrNull(input.header.carrier),
    trackingNumber: trimOrNull(input.header.tracking_number),
    packedAt: toIso(input.header.packed_at),
    shippedAt: toIso(input.header.shipped_at),
    shipTo: mapShipToAddress(input.header),
    company: input.company,
    boxes,
    totalBoxes: boxes.length,
    generatedAt: input.generatedAt,
  };
}

export async function assembleDeliveryNoteDocument(
  client: QueryClient,
  shipmentId: string,
  siteId: string,
  generatedAt: string,
): Promise<DeliveryNoteDocumentData | 'not_found'> {
  const [company, headerResult] = await Promise.all([
    fetchCompanyHeader(client),
    client.query<DeliveryNoteHeaderRow>(
      `select sh.id::text,
              sh.delivery_note_number,
              sh.shipment_number,
              sh.status,
              sh.carrier,
              sh.tracking_number,
              sh.packed_at,
              sh.shipped_at,
              so.order_number as sales_order_number,
              so.customer_po,
              c.name as customer_name,
              c.customer_code,
              ca.address_line1,
              ca.address_line2,
              ca.city,
              ca.state,
              ca.postal_code,
              ca.country_iso2
         from public.shipments sh
         left join public.sales_orders so
           on so.org_id = app.current_org_id()
          and so.id = sh.sales_order_id
         left join public.customers c
           on c.org_id = app.current_org_id()
          and c.id = coalesce(sh.customer_id, so.customer_id)
         left join public.customer_addresses ca
           on ca.org_id = app.current_org_id()
          and ca.id = coalesce(sh.shipping_address_id, so.shipping_address_id)
        where sh.org_id = app.current_org_id()
          and sh.id = $1::uuid
          and sh.site_id = $2::uuid
          and sh.deleted_at is null
        limit 1`,
      [shipmentId, siteId],
    ),
  ]);

  const header = headerResult.rows[0];
  if (!header || !company || !header.delivery_note_number) return 'not_found';

  const [boxResult, contentResult] = await Promise.all([
    client.query<DeliveryNoteBoxRow>(
      `select sb.id::text as box_id,
              sb.box_number,
              sb.sscc
         from public.shipment_boxes sb
        where sb.org_id = app.current_org_id()
          and sb.shipment_id = $1::uuid
          and sb.deleted_at is null
        order by sb.box_number, sb.created_at`,
      [shipmentId],
    ),
    client.query<DeliveryNoteContentRow>(
      `select sbc.shipment_box_id::text as box_id,
              row_number() over (
                partition by sbc.shipment_box_id
                order by sbc.created_at, sbc.id
              ) as line_number,
              i.item_code,
              i.name as item_name,
              coalesce(sbc.lot_number, lp.batch_number) as lot_number,
              coalesce(lp.lp_code, lp.lp_number) as lp_code,
              sbc.quantity::text as quantity
         from public.shipment_box_contents sbc
         join public.shipment_boxes sb
           on sb.id = sbc.shipment_box_id
          and sb.org_id = app.current_org_id()
         left join public.license_plates lp
           on lp.org_id = app.current_org_id()
          and lp.id = sbc.license_plate_id
         left join public.items i
           on i.org_id = app.current_org_id()
          and i.id = coalesce(sbc.product_id, lp.product_id)
        where sb.shipment_id = $1::uuid
          and sbc.org_id = app.current_org_id()
          and sbc.deleted_at is null
          and sb.deleted_at is null
        order by sb.box_number, sbc.created_at, sbc.id`,
      [shipmentId],
    ),
  ]);

  return buildDeliveryNoteDocumentData({
    header,
    boxRows: boxResult.rows,
    contentRows: contentResult.rows,
    company,
    generatedAt,
  });
}
