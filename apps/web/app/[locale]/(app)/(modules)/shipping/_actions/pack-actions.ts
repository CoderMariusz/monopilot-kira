'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { packLpIntoBoxCore } from '../../../../../../lib/shipping/pack-lp-into-box';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export type ShipmentStatus =
  | 'pending'
  | 'packing'
  | 'packed'
  | 'manifested'
  | 'shipped'
  | 'delivered'
  | 'exception';

export type ShipmentRow = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  salesOrderNumber: string | null;
  customerName: string | null;
  customerCode: string | null;
  boxCount: number;
  createdAt: string;
  packedAt: string | null;
  shippedAt: string | null;
  bolPdfUrl?: string | null;
  bolSignedPdfUrl?: string | null;
  deliveredAt?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
  trackingNumber?: string | null;
  totalWeightKg?: string | null;
  promisedShipDate?: string | null;
  requiredDeliveryDate?: string | null;
};

export type ShipmentBoxContentDetail = {
  lpCode: string;
  itemCode: string;
  itemName: string | null;
  qty: string;
};

export type ShipmentBoxDetail = {
  boxNumber: number;
  sscc: string | null;
  contents: ShipmentBoxContentDetail[];
};

export type ShipmentDetail = {
  shipment: ShipmentRow;
  boxes: ShipmentBoxDetail[];
};

type CreateShipmentResult = { ok: true; shipmentId: string } | { ok: false; error: string };
type PackLpIntoBoxResult = { ok: true; boxId: string } | { ok: false; error: string };
type GetShipmentResult = { ok: true; data: ShipmentDetail } | { ok: false; error: string };
type ListShipmentsResult = { ok: true; data: ShipmentRow[] } | { ok: false; error: string };

const SHIP_PACK_CLOSE = 'ship.pack.close';
const SHIP_DASHBOARD_VIEW = 'ship.dashboard.view';

const ALLOWED_CREATE_SO_STATUSES = new Set(['allocated', 'partially_allocated']);
const SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  'pending',
  'packing',
  'packed',
  'manifested',
  'shipped',
  'delivered',
  'exception',
]);

async function hasPermission(ctx: ShippingContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function requirePermission(ctx: ShippingContext, permission: string): Promise<{ ok: false; error: string } | null> {
  if (!(await hasPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

function isShipmentStatus(value: string): value is ShipmentStatus {
  return SHIPMENT_STATUSES.has(value as ShipmentStatus);
}

function mapShipmentRow(row: {
  id: string;
  shipment_number: string | null;
  status: string;
  sales_order_number: string | null;
  customer_name: string | null;
  customer_code: string | null;
  box_count: number | string | bigint | null;
  created_at: string | Date;
  packed_at: string | Date | null;
  shipped_at: string | Date | null;
  bol_pdf_url?: string | null;
  bol_signed_pdf_url?: string | null;
  delivered_at?: string | Date | null;
  carrier?: string | null;
  service_level?: string | null;
  tracking_number?: string | null;
  total_weight_kg?: string | number | null;
  promised_ship_date?: string | Date | null;
  required_delivery_date?: string | Date | null;
}): ShipmentRow {
  return {
    id: row.id,
    shipmentNumber: row.shipment_number ?? '',
    status: isShipmentStatus(row.status) ? row.status : 'exception',
    salesOrderNumber: row.sales_order_number,
    customerName: row.customer_name,
    customerCode: row.customer_code,
    boxCount: toNumber(row.box_count),
    createdAt: toText(row.created_at) ?? '',
    packedAt: toText(row.packed_at),
    shippedAt: toText(row.shipped_at),
    bolPdfUrl: toText(row.bol_pdf_url),
    bolSignedPdfUrl: toText(row.bol_signed_pdf_url),
    deliveredAt: toText(row.delivered_at),
    carrier: toText(row.carrier),
    serviceLevel: toText(row.service_level),
    trackingNumber: toText(row.tracking_number),
    totalWeightKg: toText(row.total_weight_kg),
    promisedShipDate: toText(row.promised_ship_date),
    requiredDeliveryDate: toText(row.required_delivery_date),
  };
}

async function fetchShipmentRow(ctx: ShippingContext, id: string): Promise<ShipmentRow | null> {
  const { rows } = await ctx.client.query<{
    id: string;
    shipment_number: string | null;
    status: string;
    sales_order_number: string | null;
    customer_name: string | null;
    customer_code: string | null;
    box_count: number | string | bigint | null;
    created_at: string | Date;
    packed_at: string | Date | null;
    shipped_at: string | Date | null;
    bol_pdf_url: string | null;
    bol_signed_pdf_url: string | null;
    delivered_at: string | Date | null;
    carrier: string | null;
    service_level: string | null;
    tracking_number: string | null;
    total_weight_kg: string | null;
    promised_ship_date: string | Date | null;
    required_delivery_date: string | Date | null;
  }>(
    `select sh.id::text,
            sh.shipment_number,
            sh.status,
            so.order_number as sales_order_number,
            c.name as customer_name,
            c.customer_code,
            (
              select count(*)::int
                from public.shipment_boxes sb_count
               where sb_count.org_id = app.current_org_id()
                 and sb_count.shipment_id = sh.id
                 and sb_count.deleted_at is null
            ) as box_count,
            sh.created_at,
            sh.packed_at,
            sh.bol_pdf_url,
            sh.bol_signed_pdf_url,
            sh.delivered_at,
            sh.carrier,
            sh.service_level,
            sh.tracking_number,
            sh.total_weight_kg::text as total_weight_kg,
            so.promised_ship_date,
            so.required_delivery_date,
            sh.shipped_at
       from public.shipments sh
       left join public.sales_orders so on so.id = sh.sales_order_id and so.org_id = app.current_org_id()
       left join public.customers c on c.id = coalesce(sh.customer_id, so.customer_id) and c.org_id = app.current_org_id()
      where sh.org_id = app.current_org_id()
        and sh.id = $1::uuid
        and sh.deleted_at is null
      limit 1`,
    [id],
  );
  return rows[0] ? mapShipmentRow(rows[0]) : null;
}

export async function createShipment(soId: string): Promise<CreateShipmentResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<CreateShipmentResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_PACK_CLOSE);
    if (forbidden) return forbidden;

    const { rows: soRows } = await ctx.client.query<{
      status: string;
      customer_id: string | null;
      shipping_address_id: string | null;
      site_id: string | null;
    }>(
      `select so.status,
              so.customer_id::text,
              so.shipping_address_id::text,
              so.site_id::text
         from public.sales_orders so
        where so.org_id = app.current_org_id()
          and so.id = $1::uuid
          and so.deleted_at is null
        limit 1`,
      [soId],
    );
    const salesOrder = soRows[0];
    if (!salesOrder || !ALLOWED_CREATE_SO_STATUSES.has(salesOrder.status)) {
      return { ok: false, error: 'invalid_state' };
    }

    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.shipments
         (org_id, site_id, sales_order_id, customer_id, shipping_address_id, status, created_at, created_by, updated_by)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'packing', now(), $6::uuid, $6::uuid)
       returning id::text`,
      [orgId, salesOrder.site_id, soId, salesOrder.customer_id, salesOrder.shipping_address_id, userId],
    );
    const shipmentId = rows[0]?.id;
    if (!shipmentId) return { ok: false, error: 'persistence_failed' };
    return { ok: true, shipmentId };
  });
}

export async function packLpIntoBox(input: {
  shipmentId: string;
  lpId: string;
  boxId?: string;
}): Promise<PackLpIntoBoxResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<PackLpIntoBoxResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_PACK_CLOSE);
    if (forbidden) return forbidden;

    // Shared with the scanner pack-to-SO flow (FEAT-2): allocation check +
    // food-safety guard (hold/QA/expiry) live in packLpIntoBoxCore so both
    // entry points behave identically. See lib/shipping/pack-lp-into-box.ts.
    return packLpIntoBoxCore({ userId, orgId, client: ctx.client }, input);
  });
}

export async function getShipment(id: string): Promise<GetShipmentResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<GetShipmentResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_DASHBOARD_VIEW);
    if (forbidden) return forbidden;

    const shipment = await fetchShipmentRow(ctx, id);
    if (!shipment) return { ok: false, error: 'not_found' };

    const { rows: boxRows } = await ctx.client.query<{
      id: string;
      box_number: number | string | bigint;
      sscc: string | null;
    }>(
      `select sb.id::text,
              sb.box_number,
              sb.sscc
         from public.shipment_boxes sb
        where sb.org_id = app.current_org_id()
          and sb.shipment_id = $1::uuid
          and sb.deleted_at is null
        order by sb.box_number, sb.created_at`,
      [id],
    );

    const { rows: contentRows } = await ctx.client.query<{
      box_id: string;
      lp_code: string | null;
      item_code: string | null;
      item_name: string | null;
      qty: string | null;
    }>(
      `select sbc.shipment_box_id::text as box_id,
              coalesce(lp.lp_code, lp.lp_number, '') as lp_code,
              coalesce(i.item_code, '') as item_code,
              i.name as item_name,
              sbc.quantity::text as qty
         from public.shipment_box_contents sbc
         join public.shipment_boxes sb on sb.id = sbc.shipment_box_id and sb.org_id = app.current_org_id()
         left join public.license_plates lp on lp.id = sbc.license_plate_id and lp.org_id = app.current_org_id()
         left join public.items i on i.id = coalesce(sbc.product_id, lp.product_id) and i.org_id = app.current_org_id()
        where sb.shipment_id = $1::uuid
          and sbc.org_id = app.current_org_id()
          and sbc.deleted_at is null
          and sb.deleted_at is null
        order by sb.box_number, sbc.created_at, sbc.id`,
      [id],
    );

    const contentsByBox = new Map<string, ShipmentBoxContentDetail[]>();
    for (const row of contentRows) {
      const contents = contentsByBox.get(row.box_id) ?? [];
      contents.push({
        lpCode: row.lp_code ?? '',
        itemCode: row.item_code ?? '',
        itemName: row.item_name,
        qty: row.qty ?? '0',
      });
      contentsByBox.set(row.box_id, contents);
    }

    return {
      ok: true,
      data: {
        shipment,
        boxes: boxRows.map((box) => ({
          boxNumber: toNumber(box.box_number),
          sscc: box.sscc,
          contents: contentsByBox.get(box.id) ?? [],
        })),
      },
    };
  });
}

export async function listShipments(params: { status?: string } = {}): Promise<ListShipmentsResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<ListShipmentsResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_DASHBOARD_VIEW);
    if (forbidden) return forbidden;

    const status = params.status?.trim() || null;
    if (status && !isShipmentStatus(status)) {
      return { ok: false, error: 'invalid_status' };
    }

    const { rows } = await ctx.client.query<{
      id: string;
      shipment_number: string | null;
      status: string;
      sales_order_number: string | null;
      customer_name: string | null;
      customer_code: string | null;
      box_count: number | string | bigint | null;
      created_at: string | Date;
      packed_at: string | Date | null;
      shipped_at: string | Date | null;
      total_weight_kg: string | null;
      carrier: string | null;
      promised_ship_date: string | Date | null;
      required_delivery_date: string | Date | null;
    }>(
      `select sh.id::text,
              sh.shipment_number,
              sh.status,
              so.order_number as sales_order_number,
              c.name as customer_name,
              c.customer_code,
              count(sb.id)::int as box_count,
              sh.created_at,
              sh.packed_at,
              sh.shipped_at,
              sh.total_weight_kg::text as total_weight_kg,
              sh.carrier,
              so.promised_ship_date,
              so.required_delivery_date
         from public.shipments sh
         left join public.sales_orders so on so.id = sh.sales_order_id and so.org_id = app.current_org_id()
         left join public.customers c on c.id = coalesce(sh.customer_id, so.customer_id) and c.org_id = app.current_org_id()
         left join public.shipment_boxes sb on sb.shipment_id = sh.id
          and sb.org_id = app.current_org_id()
          and sb.deleted_at is null
        where sh.org_id = app.current_org_id()
          and sh.deleted_at is null
          and ($1::text is null or sh.status = $1)
        group by sh.id, sh.shipment_number, sh.status, so.order_number, c.name, c.customer_code,
                 sh.created_at, sh.packed_at, sh.shipped_at, sh.total_weight_kg, sh.carrier,
                 so.promised_ship_date, so.required_delivery_date
        order by sh.created_at desc, sh.shipment_number desc
        limit 200`,
      [status],
    );

    return { ok: true, data: rows.map(mapShipmentRow) };
  });
}
