'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import {
  DEFAULT_GRN_PAGE_SIZE,
  emptyPaginatedResult,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../lib/shared/pagination';
import {
  WAREHOUSE_READ_PERMISSION,
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
  po_id?: string | null;
  /** Server-rolled count of live (non-cancelled) receipt lines; null in detail. */
  item_count?: number | string | null;
  notes?: string | null;
};

function mapGrn(row: GrnRow, itemCountOverride?: number): GrnListItem {
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
    poId: row.po_id ?? null,
    itemCount: itemCountOverride ?? Number(row.item_count ?? 0),
  };
}

export async function listGrns(input: GrnListInput = {}): Promise<WarehouseResult<PaginatedResult<GrnListItem>>> {
  const status = asTrimmed(input.status);
  const sourceType = asTrimmed(input.sourceType);
  const search = asTrimmed(input.search);
  const page = normalizePage({
    page: input.page,
    offset: input.offset,
    limit: input.limit,
    defaultLimit: DEFAULT_GRN_PAGE_SIZE,
    maxLimit: 200,
  });

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<PaginatedResult<GrnListItem>>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };
      const s = await getActiveSiteId({ client: ctx.client });
      if (!s) {
        return {
          ok: true,
          data: emptyPaginatedResult(page),
          noActiveSite: true,
        } as WarehouseResult<PaginatedResult<GrnListItem>> & { noActiveSite: true };
      }

      const baseParams = [status, sourceType, search, s] as const;

      const [countResult, dataResult] = await Promise.all([
        ctx.client.query<{ total: number }>(
          `select count(*)::int as total
             from public.grns g
             left join public.suppliers s on s.org_id = app.current_org_id() and s.id = g.supplier_id
            where g.org_id = app.current_org_id()
              and g.site_id = $4::uuid
              and ($1::text is null or g.status = $1)
              and ($2::text is null or g.source_type = $2)
              and (
                $3::text is null
                or g.grn_number ilike '%' || $3 || '%'
                or s.name ilike '%' || $3 || '%'
              )`,
          [...baseParams],
        ),
        ctx.client.query<GrnRow>(
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
                  g.po_id::text,
                  (select count(*)
                     from public.grn_items gi
                    where gi.org_id = app.current_org_id()
                      and gi.grn_id = g.id
                      and gi.cancelled_at is null) as item_count
             from public.grns g
             left join public.suppliers s on s.org_id = app.current_org_id() and s.id = g.supplier_id
             left join public.warehouses w on w.org_id = app.current_org_id() and w.id = g.warehouse_id
            where g.org_id = app.current_org_id()
              and g.site_id = $4::uuid
              and ($1::text is null or g.status = $1)
              and ($2::text is null or g.source_type = $2)
              and (
                $3::text is null
                or g.grn_number ilike '%' || $3 || '%'
                or s.name ilike '%' || $3 || '%'
              )
            order by g.receipt_date desc, g.grn_number desc, g.id desc
            limit $5::integer offset $6::integer`,
          [...baseParams, page.limit, page.offset],
        ),
      ]);

      return {
        ok: true,
        data: toPaginatedResult(dataResult.rows.map(mapGrn), Number(countResult.rows[0]?.total ?? 0), page),
      };
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
                g.notes,
                g.po_id::text
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
          lp_qa_status: string | null;
          can_cancel: boolean;
          cancel_block_reason: string;
          cancelled_at: string | Date | null;
          cancellation_reason_code: string | null;
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
                  lp.lp_number,
                  lp.qa_status as lp_qa_status,
                  coalesce((
                    gi.cancelled_at is null
                    and gi.lp_id is not null
                    and lp.status in ('received', 'available')
                    and lp.qa_status in ('pending', 'released')
                    and lp.reserved_qty = 0::numeric
                    and lp.quantity = gi.received_qty
                    and not exists (
                      select 1
                        from public.license_plates child
                       where child.org_id = app.current_org_id()
                         and child.parent_lp_id = gi.lp_id
                    )
                    and not exists (
                      select 1
                        from public.wo_material_consumption wmc
                       where wmc.org_id = app.current_org_id()
                         and wmc.lp_id = gi.lp_id
                    )
                  ), false) as can_cancel,
                  case
                    when gi.cancelled_at is not null then 'already_cancelled'
                    when gi.lp_id is null then 'lp_not_cancellable'
                    when lp.id is null then 'lp_not_cancellable'
                    when lp.status is null or lp.status not in ('received', 'available') then 'lp_not_cancellable'
                    when lp.qa_status is null or lp.qa_status not in ('pending', 'released') then 'lp_not_cancellable'
                    when lp.reserved_qty is null or lp.reserved_qty <> 0::numeric then 'lp_not_cancellable'
                    when lp.quantity is null or lp.quantity <> gi.received_qty then 'lp_not_cancellable'
                    when exists (
                      select 1
                        from public.license_plates child
                       where child.org_id = app.current_org_id()
                         and child.parent_lp_id = gi.lp_id
                    ) then 'lp_not_cancellable'
                    when exists (
                      select 1
                        from public.wo_material_consumption wmc
                       where wmc.org_id = app.current_org_id()
                         and wmc.lp_id = gi.lp_id
                    ) then 'lp_not_cancellable'
                    else ''
                  end as cancel_block_reason,
                  gi.cancelled_at,
                  gi.cancellation_reason_code
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

      const liveItemCount = items.rows.filter((item) => item.cancelled_at == null).length;

      return {
        ok: true,
        data: {
          ...mapGrn(row, liveItemCount),
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
            lpQaStatus: item.lp_qa_status,
            canCancel: item.can_cancel === true,
            cancelBlockReason: item.cancel_block_reason,
            // R3 F6 — field name matches the C-R3 client's defensive cast
            // (`cancelled?: boolean`): cancelled rows strike through + hide
            // Release-QC and Cancel affordances.
            cancelled: item.cancelled_at != null,
            cancellationReasonCode: item.cancellation_reason_code,
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
