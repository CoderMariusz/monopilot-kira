import { z } from 'zod';

import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import { resolveWriteSiteId } from '../../../../../../../lib/site/site-context';
import {
  PurchaseOrderCreateInput,
  requireActionPermission,
  PLANNING_PO_MANAGE_PERMISSION,
  isPgError,
  toIso,
  uuidSchema,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_code: string | null;
  supplier_name: string | null;
  destination_warehouse_id?: string | null;
  destination_warehouse_name?: string | null;
  status: string;
  expected_delivery: string | null;
  currency: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type PurchaseOrderLineRow = {
  id: string;
  po_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty: string;
  uom: string;
  unit_price: string;
  line_no: number;
  received_qty: string | null;
};

type PurchaseOrderLine = {
  id: string;
  poId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  unitPrice: string;
  lineNo: number;
  receivedQty: string;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  destinationWarehouseId: string | null;
  destinationWarehouseName: string | null;
  status: string;
  expectedDelivery: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderDetail = PurchaseOrder & { lines: PurchaseOrderLine[] };

export type PurchaseOrderError =
  | ProcurementError
  | 'last_line'
  | 'po_has_receipts'
  | 'po_open_quantity'
  | 'no_active_site'
  | 'ambiguous_site'
  | 'supplier_blocked';

export type PurchaseOrderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PurchaseOrderError; code?: PurchaseOrderError; message?: string };

export const CreatePurchaseOrderInput = PurchaseOrderCreateInput.extend({
  destinationWarehouseId: uuidSchema.optional(),
});

export type CreatePurchaseOrderInputType = z.infer<typeof CreatePurchaseOrderInput>;

export type CreatePurchaseOrderCoreContext = OrgActionContext;

function mapPurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    destinationWarehouseId: row.destination_warehouse_id ?? null,
    destinationWarehouseName: row.destination_warehouse_name ?? null,
    status: row.status,
    expectedDelivery: row.expected_delivery,
    currency: row.currency,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLine(row: PurchaseOrderLineRow): PurchaseOrderLine {
  return {
    id: row.id,
    poId: row.po_id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    qty: String(row.qty),
    uom: row.uom,
    unitPrice: String(row.unit_price),
    lineNo: Number(row.line_no),
    receivedQty: String(row.received_qty ?? '0'),
  };
}

async function fetchLines(client: QueryClient, poId: string): Promise<PurchaseOrderLine[]> {
  const { rows } = await client.query<PurchaseOrderLineRow>(
    `select l.id, l.po_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.unit_price::text as unit_price, l.line_no,
            coalesce(rec.received_qty, 0)::text as received_qty
       from public.purchase_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
       left join (
         select gi.po_line_id, sum(gi.received_qty) as received_qty
           from public.grn_items gi
           join public.grns g
             on g.id = gi.grn_id
            and g.org_id = app.current_org_id()
            and g.status <> 'cancelled'
          where gi.org_id = app.current_org_id()
            and gi.po_line_id is not null
            and gi.cancelled_at is null
          group by gi.po_line_id
       ) rec on rec.po_line_id = l.id
      where l.org_id = app.current_org_id()
        and l.po_id = $1::uuid
      order by l.line_no asc`,
    [poId],
  );
  return rows.map(mapLine);
}

export async function createPurchaseOrderCore(
  ctx: CreatePurchaseOrderCoreContext,
  input: CreatePurchaseOrderInputType,
): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const { userId, orgId } = ctx;
  const perm = await requireActionPermission(ctx, PLANNING_PO_MANAGE_PERMISSION);
  if (!perm.ok) return perm;

  const siteResolution = await resolveWriteSiteId(ctx.client);
  if (!siteResolution.ok) return { ok: false, error: siteResolution.reason };
  const siteId = siteResolution.siteId;

  const { rows: supplierRows } = await ctx.client.query<{ status: string }>(
    `select status
       from public.suppliers
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [input.supplierId],
  );
  const supplier = supplierRows[0];
  if (!supplier) return { ok: false, error: 'not_found' };
  if (supplier.status === 'blocked') {
    return { ok: false, error: 'supplier_blocked', code: 'supplier_blocked', message: 'Supplier is blocked' };
  }

  async function insertHeader(poNumber: string) {
    return ctx.client.query<PurchaseOrderRow>(
      `insert into public.purchase_orders
         (org_id, site_id, po_number, supplier_id, destination_warehouse_id, status, expected_delivery, currency, notes, created_by, updated_by)
       values
         (app.current_org_id(), $9::uuid, $1, $2::uuid, $3::uuid, $4, $5::date, $6, $7, $8::uuid, $8::uuid)
       returning id, po_number, supplier_id, null::text as supplier_code, null::text as supplier_name,
                 destination_warehouse_id, null::text as destination_warehouse_name,
                 status, expected_delivery::text as expected_delivery, currency, notes, created_at, updated_at`,
      [
        poNumber,
        input.supplierId,
        input.destinationWarehouseId ?? null,
        'draft',
        input.expectedDelivery ?? null,
        input.currency,
        input.notes ?? null,
        userId,
        siteId,
      ],
    );
  }

  const initialPoNumber = input.poNumber ?? (await nextDocumentNumber(ctx.client, orgId, 'po', new Date()));
  let insertResult: Awaited<ReturnType<typeof insertHeader>>;
  try {
    insertResult = await insertHeader(initialPoNumber);
  } catch (error) {
    if (input.poNumber || !isPgError(error) || error.code !== '23505') throw error;
    insertResult = await insertHeader(await nextDocumentNumber(ctx.client, orgId, 'po', new Date()));
  }

  const { rows } = insertResult;
  const header = rows[0];
  if (!header) return { ok: false, error: 'persistence_failed' };

  for (const line of input.lines) {
    await ctx.client.query(
      `insert into public.purchase_order_lines
         (org_id, po_id, item_id, qty, uom, unit_price, line_no, created_by, updated_by)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric, $6::integer, $7::uuid, $7::uuid)`,
      [header.id, line.itemId, line.qty, line.uom, line.unitPrice, line.lineNo, userId],
    );
  }

  await writeProcurementAudit(ctx, {
    action: 'planning.purchase_order.created',
    resourceType: 'purchase_order',
    resourceId: header.id,
    afterState: {
      poNumber: header.po_number,
      status: header.status,
      lineCount: input.lines.length,
      destinationWarehouseId: input.destinationWarehouseId ?? null,
    },
  });

  return { ok: true, data: { ...mapPurchaseOrder(header), lines: await fetchLines(ctx.client, header.id) } };
}
