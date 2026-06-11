'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  asLimit,
  asTrimmed,
  hasWarehousePermission,
  toIso,
  type GrnDetail,
  type GrnListInput,
  type GrnListItem,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

type GrnRow = {
  id: string;
  grn_number: string;
  source_type: string;
  status: string;
  supplier_id: string | null;
  supplier_name: string | null;
  warehouse_id: string;
  warehouse_code: string | null;
  receipt_date: string | Date;
  completed_at: string | Date | null;
  notes?: string | null;
};

function mapGrn(row: GrnRow): GrnListItem {
  return {
    id: row.id,
    grnNumber: row.grn_number,
    sourceType: row.source_type,
    status: row.status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    receiptDate: toIso(row.receipt_date) ?? '',
    completedAt: toIso(row.completed_at),
  };
}

export async function listGrns(input: GrnListInput = {}): Promise<WarehouseResult<GrnListItem[]>> {
  const status = asTrimmed(input.status);
  const sourceType = asTrimmed(input.sourceType);
  const search = asTrimmed(input.search);
  const limit = asLimit(input.limit);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<GrnListItem[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<GrnRow>(
        `select g.id::text,
                g.grn_number,
                g.source_type,
                g.status,
                g.supplier_id::text,
                s.name as supplier_name,
                g.warehouse_id::text,
                w.code as warehouse_code,
                g.receipt_date,
                g.completed_at
           from public.grns g
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = g.supplier_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = g.warehouse_id
          where g.org_id = app.current_org_id()
            and ($1::text is null or g.status = $1)
            and ($2::text is null or g.source_type = $2)
            and (
              $3::text is null
              or g.grn_number ilike '%' || $3 || '%'
              or s.name ilike '%' || $3 || '%'
            )
          order by g.receipt_date desc, g.grn_number desc
          limit $4::integer`,
        [status, sourceType, search, limit],
      );

      return { ok: true, data: rows.map(mapGrn) };
    });
  } catch (error) {
    console.error('[warehouse] listGrns failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getGrnDetail(grnId: string): Promise<WarehouseResult<GrnDetail>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<GrnDetail>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const header = await ctx.client.query<GrnRow>(
        `select g.id::text,
                g.grn_number,
                g.source_type,
                g.status,
                g.supplier_id::text,
                s.name as supplier_name,
                g.warehouse_id::text,
                w.code as warehouse_code,
                g.receipt_date,
                g.completed_at,
                g.notes
           from public.grns g
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = g.supplier_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = g.warehouse_id
          where g.org_id = app.current_org_id()
            and g.id = $1::uuid
          limit 1`,
        [grnId],
      );
      const row = header.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      const [items, lps] = await Promise.all([
        ctx.client.query<{
          id: string;
          line_number: number;
          product_id: string;
          item_code: string | null;
          item_name: string | null;
          po_line_id: string | null;
          ordered_qty: string | null;
          received_qty: string;
          uom: string;
          batch_number: string | null;
          expiry_date: string | Date | null;
          lp_id: string | null;
          lp_number: string | null;
        }>(
          `select gi.id::text,
                  gi.line_number,
                  gi.product_id::text,
                  i.item_code,
                  i.name as item_name,
                  gi.po_line_id::text,
                  gi.ordered_qty::text,
                  gi.received_qty::text,
                  gi.uom,
                  gi.batch_number,
                  gi.expiry_date,
                  gi.lp_id::text,
                  lp.lp_number
             from public.grn_items gi
             left join public.items i on i.org_id = app.current_org_id() and i.id = gi.product_id
             left join public.license_plates lp on lp.org_id = app.current_org_id() and lp.id = gi.lp_id
            where gi.org_id = app.current_org_id()
              and gi.grn_id = $1::uuid
            order by gi.line_number asc`,
          [grnId],
        ),
        ctx.client.query<{ id: string; lp_number: string; status: string; quantity: string; uom: string }>(
          `select id::text, lp_number, status, quantity::text, uom
             from public.license_plates
            where org_id = app.current_org_id()
              and grn_id = $1::uuid
            order by created_at asc, lp_number asc`,
          [grnId],
        ),
      ]);

      return {
        ok: true,
        data: {
          ...mapGrn(row),
          notes: row.notes ?? null,
          items: items.rows.map((item) => ({
            id: item.id,
            lineNumber: Number(item.line_number),
            productId: item.product_id,
            itemCode: item.item_code,
            itemName: item.item_name,
            poLineId: item.po_line_id,
            orderedQty: item.ordered_qty == null ? null : String(item.ordered_qty),
            receivedQty: String(item.received_qty),
            uom: item.uom,
            batchNumber: item.batch_number,
            expiryDate: toIso(item.expiry_date),
            lpId: item.lp_id,
            lpNumber: item.lp_number,
          })),
          licensePlates: lps.rows.map((lp) => ({
            id: lp.id,
            lpNumber: lp.lp_number,
            status: lp.status,
            quantity: String(lp.quantity),
            uom: lp.uom,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] getGrnDetail failed', error);
    return { ok: false, reason: 'error' };
  }
}
