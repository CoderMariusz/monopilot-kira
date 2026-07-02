'use server';

import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  toIso,
  type InventoryByBatchRow,
  type InventoryByLocationRow,
  type InventoryByProductRow,
  type InventoryResult,
  type QueryClient,
  type WarehouseContext,
} from './shared';

/**
 * SW (site-scoped inventory) — resolve the active site for the bound org and its
 * display name, FAIL-CLOSED.
 *
 * Resolution (via getActiveSiteId, inside the org tx): explicit arg → `mp_site_id`
 * cookie → org DEFAULT site. With the org-default fallback, `activeSiteId` is
 * non-null for any org that has a default site, so most users land on their
 * default site's stock; the empty "select a site" state appears only for orgs
 * with no resolvable site.
 *
 * Returns `{ activeSiteId: null, siteName: null }` only when NOTHING resolves —
 * the caller then returns empty + `noActiveSite: true` rather than all-sites.
 */
async function resolveActiveSite(
  client: QueryClient,
): Promise<{ activeSiteId: string | null; siteName: string | null }> {
  const activeSiteId = await getActiveSiteId({ client });
  if (!activeSiteId) return { activeSiteId: null, siteName: null };

  // RLS scopes the lookup to the bound org; the id is already validated to a uuid.
  const { rows } = await client.query<{ name: string | null }>(
    `select name from public.sites where org_id = app.current_org_id() and id = $1::uuid limit 1`,
    [activeSiteId],
  );
  return { activeSiteId, siteName: rows[0]?.name ?? null };
}

export async function getInventoryByProduct(): Promise<InventoryResult<InventoryByProductRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<InventoryResult<InventoryByProductRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      // FAIL-CLOSED: no active site → empty + flag (never all-sites).
      const { activeSiteId, siteName } = await resolveActiveSite(ctx.client);
      if (!activeSiteId) return { ok: true, data: [], noActiveSite: true, activeSiteId: null, siteName: null };

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
            and (lp.site_id = $1::uuid or lp.site_id is null)
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.product_id, i.item_code, i.name
          order by i.item_code asc nulls last, i.name asc nulls last`,
        [activeSiteId],
      );

      return {
        ok: true,
        noActiveSite: false,
        activeSiteId,
        siteName,
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

export async function getInventoryByLocation(): Promise<InventoryResult<InventoryByLocationRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<InventoryResult<InventoryByLocationRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      // FAIL-CLOSED: no active site → empty + flag (never all-sites).
      const { activeSiteId, siteName } = await resolveActiveSite(ctx.client);
      if (!activeSiteId) return { ok: true, data: [], noActiveSite: true, activeSiteId: null, siteName: null };

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
            and (lp.site_id = $1::uuid or lp.site_id is null)
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.location_id, l.code, lp.warehouse_id, w.code
          order by w.code asc nulls last, l.code asc nulls last`,
        [activeSiteId],
      );

      return {
        ok: true,
        noActiveSite: false,
        activeSiteId,
        siteName,
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

export async function getInventoryByBatch(): Promise<InventoryResult<InventoryByBatchRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<InventoryResult<InventoryByBatchRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      // FAIL-CLOSED: no active site → empty + flag (never all-sites).
      const { activeSiteId, siteName } = await resolveActiveSite(ctx.client);
      if (!activeSiteId) return { ok: true, data: [], noActiveSite: true, activeSiteId: null, siteName: null };

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
            and (lp.site_id = $1::uuid or lp.site_id is null)
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by lp.product_id, i.item_code, lp.batch_number
          order by i.item_code asc nulls last, lp.batch_number asc nulls last`,
        [activeSiteId],
      );

      return {
        ok: true,
        noActiveSite: false,
        activeSiteId,
        siteName,
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
