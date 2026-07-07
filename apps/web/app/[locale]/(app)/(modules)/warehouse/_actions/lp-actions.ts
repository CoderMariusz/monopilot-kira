'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  DEFAULT_LP_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../lib/shared/pagination';
import {
  WAREHOUSE_READ_PERMISSION,
  asTrimmed,
  hasWarehousePermission,
  toIso,
  type LicensePlateDetail,
  type LicensePlateListInput,
  type LicensePlateListItem,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

type LpListRow = {
  id: string;
  lp_number: string;
  item_code: string | null;
  item_name: string | null;
  quantity: string;
  reserved_qty: string;
  available_qty: string;
  uom: string;
  status: string;
  qa_status: string;
  batch_number: string | null;
  expiry_date: string | Date | null;
  location_code: string | null;
  warehouse_code: string | null;
  created_at: string | Date;
};

function mapLpListRow(row: LpListRow): LicensePlateListItem {
  return {
    id: row.id,
    lpNumber: row.lp_number,
    itemCode: row.item_code,
    itemName: row.item_name,
    quantity: String(row.quantity),
    reservedQty: String(row.reserved_qty),
    availableQty: String(row.available_qty),
    uom: row.uom,
    status: row.status,
    qaStatus: row.qa_status,
    batchNumber: row.batch_number,
    expiryDate: toIso(row.expiry_date),
    locationCode: row.location_code,
    warehouseCode: row.warehouse_code,
    createdAt: toIso(row.created_at) ?? '',
  };
}

const LP_LIST_FROM = `
           from public.license_plates lp
           left join public.items i
             on i.org_id = app.current_org_id()
            and i.id = lp.product_id
           left join public.locations l
             on l.org_id = app.current_org_id()
            and l.id = lp.location_id
           left join public.warehouses w
             on w.org_id = app.current_org_id()
            and w.id = lp.warehouse_id
          where lp.org_id = app.current_org_id()
            and ($1::uuid is null or lp.warehouse_id = $1)
            and (
              $2::text is null
              or lp.lp_number ilike '%' || $2 || '%'
              or lp.batch_number ilike '%' || $2 || '%'
              or i.item_code ilike '%' || $2 || '%'
              or i.name ilike '%' || $2 || '%'
            )
            and ($3::uuid is null or lp.site_id = $3::uuid or lp.site_id is null)`;

export async function listLPs(
  input: LicensePlateListInput = {},
): Promise<WarehouseResult<PaginatedResult<LicensePlateListItem>>> {
  const search = asTrimmed(input.search);
  const warehouseId = asTrimmed(input.warehouseId);
  const siteId = asTrimmed(input.siteId);
  const page = normalizePage({
    page: input.page,
    offset: input.offset,
    limit: input.limit,
    defaultLimit: DEFAULT_LP_PAGE_SIZE,
    maxLimit: 500,
  });

  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<WarehouseResult<PaginatedResult<LicensePlateListItem>>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const baseParams = [warehouseId, search, siteId] as const;
      const [countResult, dataResult] = await Promise.all([
        ctx.client.query<{ total: number }>(
          `select count(*)::int as total${LP_LIST_FROM}`,
          [...baseParams],
        ),
        ctx.client.query<LpListRow>(
          `select lp.id::text,
                  lp.lp_number,
                  i.item_code,
                  i.name as item_name,
                  lp.quantity::text,
                  lp.reserved_qty::text,
                  (lp.quantity - lp.reserved_qty)::text as available_qty,
                  lp.uom,
                  lp.status,
                  lp.qa_status,
                  lp.batch_number,
                  lp.expiry_date,
                  l.code as location_code,
                  w.code as warehouse_code,
                  lp.created_at
             ${LP_LIST_FROM}
          order by lp.created_at desc, lp.lp_number asc, lp.id desc
          limit $4::integer offset $5::integer`,
          [...baseParams, page.limit, page.offset],
        ),
      ]);

      return {
        ok: true,
        data: toPaginatedResult(
          dataResult.rows.map(mapLpListRow),
          Number(countResult.rows[0]?.total ?? 0),
          page,
        ),
      };
    });
  } catch (error) {
    console.error('[warehouse] listLPs failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getLpDetail(lpId: string): Promise<WarehouseResult<LicensePlateDetail>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<LicensePlateDetail>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const header = await ctx.client.query<
        LpListRow & {
          product_id: string;
          warehouse_id: string;
          warehouse_name: string | null;
          location_id: string | null;
          location_name: string | null;
          catch_weight_kg: string | null;
          supplier_batch_number: string | null;
          best_before_date: string | Date | null;
          origin: string;
          grn_id: string | null;
          wo_id: string | null;
          reserved_for_wo_id: string | null;
          reserved_for_wo_number: string | null;
          parent_lp_id: string | null;
          parent_lp_number: string | null;
        }
      >(
        `select lp.id::text,
                lp.lp_number,
                lp.product_id::text,
                i.item_code,
                i.name as item_name,
                lp.quantity::text,
                lp.reserved_qty::text,
                (lp.quantity - lp.reserved_qty)::text as available_qty,
                lp.uom,
                lp.catch_weight_kg::text,
                lp.status,
                lp.qa_status,
                lp.batch_number,
                lp.supplier_batch_number,
                lp.expiry_date,
                lp.best_before_date,
                lp.location_id::text,
                l.code as location_code,
                l.name as location_name,
                lp.warehouse_id::text,
                w.code as warehouse_code,
                w.name as warehouse_name,
                lp.origin,
                lp.grn_id::text,
                lp.wo_id::text,
                lp.reserved_for_wo_id::text,
                rwo.wo_number as reserved_for_wo_number,
                parent.id::text as parent_lp_id,
                parent.lp_number as parent_lp_number,
                lp.created_at
           from public.license_plates lp
           left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
           left join public.locations l on l.org_id = app.current_org_id() and l.id = lp.location_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = lp.warehouse_id
           left join public.work_orders rwo on rwo.org_id = app.current_org_id() and rwo.id = lp.reserved_for_wo_id
           left join public.license_plates parent on parent.org_id = app.current_org_id() and parent.id = lp.parent_lp_id
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
          limit 1`,
        [lpId],
      );
      const row = header.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      const [children, history, moves] = await Promise.all([
        ctx.client.query<{ id: string; lp_number: string; status: string; quantity: string; uom: string }>(
          `select id::text, lp_number, status, quantity::text, uom
             from public.license_plates
            where org_id = app.current_org_id()
              and parent_lp_id = $1::uuid
            order by created_at asc`,
          [lpId],
        ),
        ctx.client.query<{
          id: string;
          from_state: string | null;
          to_state: string;
          reason_code: string | null;
          reason_text: string | null;
          transitioned_at: string | Date;
        }>(
          `select id::text, from_state, to_state, reason_code, reason_text, transitioned_at
             from public.lp_state_history
            where org_id = app.current_org_id()
              and lp_id = $1::uuid
            order by transitioned_at desc, created_at desc`,
          [lpId],
        ),
        ctx.client.query<{
          id: string;
          move_number: string;
          move_type: string;
          from_location_id: string | null;
          from_location_code: string | null;
          to_location_id: string | null;
          to_location_code: string | null;
          quantity: string;
          uom: string | null;
          move_date: string | Date;
          reason_text: string | null;
        }>(
          `select sm.id::text,
                  sm.move_number,
                  sm.move_type,
                  sm.from_location_id::text,
                  fl.code as from_location_code,
                  sm.to_location_id::text,
                  tl.code as to_location_code,
                  sm.quantity::text,
                  sm.uom,
                  sm.move_date,
                  sm.reason_text
             from public.stock_moves sm
             left join public.locations fl on fl.org_id = app.current_org_id() and fl.id = sm.from_location_id
             left join public.locations tl on tl.org_id = app.current_org_id() and tl.id = sm.to_location_id
            where sm.org_id = app.current_org_id()
              and sm.lp_id = $1::uuid
            order by sm.move_date desc, sm.created_at desc`,
          [lpId],
        ),
      ]);

      const base = mapLpListRow(row);
      return {
        ok: true,
        data: {
          ...base,
          productId: row.product_id,
          warehouseId: row.warehouse_id,
          warehouseName: row.warehouse_name,
          locationId: row.location_id,
          locationName: row.location_name,
          catchWeightKg: row.catch_weight_kg == null ? null : String(row.catch_weight_kg),
          supplierBatchNumber: row.supplier_batch_number,
          bestBeforeDate: toIso(row.best_before_date),
          origin: row.origin,
          grnId: row.grn_id,
          woId: row.wo_id,
          reservedForWoId: row.reserved_for_wo_id,
          reservedForWoNumber: row.reserved_for_wo_number,
          parentLp: row.parent_lp_id ? { id: row.parent_lp_id, lpNumber: row.parent_lp_number ?? row.parent_lp_id } : null,
          childLps: children.rows.map((child) => ({
            id: child.id,
            lpNumber: child.lp_number,
            status: child.status,
            quantity: String(child.quantity),
            uom: child.uom,
          })),
          stateHistory: history.rows.map((h) => ({
            id: h.id,
            fromState: h.from_state,
            toState: h.to_state,
            reasonCode: h.reason_code,
            reasonText: h.reason_text,
            transitionedAt: toIso(h.transitioned_at) ?? '',
          })),
          moves: moves.rows.map((m) => ({
            id: m.id,
            moveNumber: m.move_number,
            moveType: m.move_type,
            fromLocationId: m.from_location_id,
            fromLocationCode: m.from_location_code,
            toLocationId: m.to_location_id,
            toLocationCode: m.to_location_code,
            quantity: String(m.quantity),
            uom: m.uom,
            moveDate: toIso(m.move_date) ?? '',
            reasonText: m.reason_text,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] getLpDetail failed', error);
    return { ok: false, reason: 'error' };
  }
}
