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
        quantity: string;
        available_qty: string;
        lp_count: number;
        earliest_expiry_date: string | Date | null;
        uom: string | null;
      }>(
        `select inv.product_id::text,
                i.item_code,
                i.name as item_name,
                sum(inv.quantity)::text as quantity,
                sum(inv.available_qty)::text as available_qty,
                count(*)::int as lp_count,
                min(inv.expiry_date) as earliest_expiry_date,
                min(inv.uom) as uom
           from public.v_inventory_available inv
           left join public.items i on i.org_id = app.current_org_id() and i.id = inv.product_id
          where inv.org_id = app.current_org_id()
          group by inv.product_id, i.item_code, i.name
          order by i.item_code asc nulls last, i.name asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          productId: row.product_id,
          itemCode: row.item_code,
          itemName: row.item_name,
          quantity: String(row.quantity),
          availableQty: String(row.available_qty),
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
        quantity: string;
        available_qty: string;
        lp_count: number;
      }>(
        `select inv.location_id::text,
                l.code as location_code,
                inv.warehouse_id::text,
                w.code as warehouse_code,
                sum(inv.quantity)::text as quantity,
                sum(inv.available_qty)::text as available_qty,
                count(*)::int as lp_count
           from public.v_inventory_available inv
           left join public.locations l on l.org_id = app.current_org_id() and l.id = inv.location_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = inv.warehouse_id
          where inv.org_id = app.current_org_id()
          group by inv.location_id, l.code, inv.warehouse_id, w.code
          order by w.code asc nulls last, l.code asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          locationId: row.location_id,
          locationCode: row.location_code,
          warehouseId: row.warehouse_id,
          warehouseCode: row.warehouse_code,
          quantity: String(row.quantity),
          availableQty: String(row.available_qty),
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
        quantity: string;
        available_qty: string;
        lp_count: number;
        earliest_expiry_date: string | Date | null;
      }>(
        `select inv.product_id::text,
                i.item_code,
                inv.batch_number,
                sum(inv.quantity)::text as quantity,
                sum(inv.available_qty)::text as available_qty,
                count(*)::int as lp_count,
                min(inv.expiry_date) as earliest_expiry_date
           from public.v_inventory_available inv
           left join public.items i on i.org_id = app.current_org_id() and i.id = inv.product_id
          where inv.org_id = app.current_org_id()
          group by inv.product_id, i.item_code, inv.batch_number
          order by i.item_code asc nulls last, inv.batch_number asc nulls last`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          productId: row.product_id,
          itemCode: row.item_code,
          batchNumber: row.batch_number,
          quantity: String(row.quantity),
          availableQty: String(row.available_qty),
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
