'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  toIso,
  type InventoryByBatchRow,
  type InventoryByLocationRow,
  type InventoryByProductRow,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export async function getInventoryByProduct(): Promise<WarehouseResult<InventoryByProductRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<InventoryByProductRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        product_id: string;
        item_code: string | null;
        item_name: string | null;
        total_qty: string;
        pickable_qty: string;
        lp_count: number;
        earliest_expiry_date: string | Date | null;
        uom: string | null;
      }>(
        `select lp.product_id::text,
                i.item_code,
                i.name as item_name,
                coalesce(sum(lp.quantity), 0)::text as total_qty,
                coalesce(
                  sum(lp.quantity) filter (
                    where lp.status = 'available'
                      and lp.qa_status = 'released'
                  ),
                  0
                )::text as pickable_qty,
                count(*)::int as lp_count,
                min(lp.expiry_date) as earliest_expiry_date,
                min(lp.uom) as uom
           from public.license_plates lp
           left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
          where lp.org_id = app.current_org_id()
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.product_id, i.item_code, i.name
          order by i.item_code asc nulls last, i.name asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          productId: row.product_id,
          itemCode: row.item_code,
          itemName: row.item_name,
          totalQty: String(row.total_qty),
          pickableQty: String(row.pickable_qty),
          quantity: String(row.total_qty),
          availableQty: String(row.pickable_qty),
          lpCount: Number(row.lp_count),
          earliestExpiryDate: toIso(row.earliest_expiry_date),
          uom: row.uom,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] getInventoryByProduct failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getInventoryByLocation(): Promise<WarehouseResult<InventoryByLocationRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<InventoryByLocationRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        location_id: string | null;
        location_code: string | null;
        warehouse_id: string | null;
        warehouse_code: string | null;
        total_qty: string;
        pickable_qty: string;
        lp_count: number;
      }>(
        `select lp.location_id::text,
                l.code as location_code,
                lp.warehouse_id::text,
                w.code as warehouse_code,
                coalesce(sum(lp.quantity), 0)::text as total_qty,
                coalesce(
                  sum(lp.quantity) filter (
                    where lp.status = 'available'
                      and lp.qa_status = 'released'
                  ),
                  0
                )::text as pickable_qty,
                count(*)::int as lp_count
           from public.license_plates lp
           left join public.locations l on l.org_id = app.current_org_id() and l.id = lp.location_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = lp.warehouse_id
          where lp.org_id = app.current_org_id()
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.location_id, l.code, lp.warehouse_id, w.code
          order by w.code asc nulls last, l.code asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          locationId: row.location_id,
          locationCode: row.location_code,
          warehouseId: row.warehouse_id,
          warehouseCode: row.warehouse_code,
          totalQty: String(row.total_qty),
          pickableQty: String(row.pickable_qty),
          quantity: String(row.total_qty),
          availableQty: String(row.pickable_qty),
          lpCount: Number(row.lp_count),
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] getInventoryByLocation failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getInventoryByBatch(): Promise<WarehouseResult<InventoryByBatchRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<InventoryByBatchRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        product_id: string;
        item_code: string | null;
        batch_number: string | null;
        total_qty: string;
        pickable_qty: string;
        lp_count: number;
        earliest_expiry_date: string | Date | null;
      }>(
        `select lp.product_id::text,
                i.item_code,
                lp.batch_number,
                coalesce(sum(lp.quantity), 0)::text as total_qty,
                coalesce(
                  sum(lp.quantity) filter (
                    where lp.status = 'available'
                      and lp.qa_status = 'released'
                  ),
                  0
                )::text as pickable_qty,
                count(*)::int as lp_count,
                min(lp.expiry_date) as earliest_expiry_date
           from public.license_plates lp
           left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
          where lp.org_id = app.current_org_id()
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.product_id, i.item_code, lp.batch_number
          order by i.item_code asc nulls last, lp.batch_number asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          productId: row.product_id,
          itemCode: row.item_code,
          batchNumber: row.batch_number,
          totalQty: String(row.total_qty),
          pickableQty: String(row.pickable_qty),
          quantity: String(row.total_qty),
          availableQty: String(row.pickable_qty),
          lpCount: Number(row.lp_count),
          earliestExpiryDate: toIso(row.earliest_expiry_date),
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] getInventoryByBatch failed', error);
    return { ok: false, reason: 'error' };
  }
}
