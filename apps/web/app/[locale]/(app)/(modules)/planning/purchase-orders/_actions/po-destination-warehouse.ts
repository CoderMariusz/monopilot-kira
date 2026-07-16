import type { QueryClient } from '../../_actions/procurement-shared';

export type WarehouseSiteRow = {
  id: string;
  site_id: string | null;
};

export type DestinationWarehouseSiteCheck = 'ok' | 'not_found' | 'warehouse_site_mismatch';

/**
 * Load a warehouse scoped to the current org. Returns null when the warehouse
 * does not exist.
 */
export async function fetchWarehouseSite(
  client: QueryClient,
  warehouseId: string,
): Promise<WarehouseSiteRow | null> {
  const { rows } = await client.query<WarehouseSiteRow>(
    `select w.id::text as id, w.site_id::text as site_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
        and w.id = $1::uuid
      limit 1`,
    [warehouseId],
  );
  return rows[0] ?? null;
}

/** True when the warehouse may be used as a PO destination at {@link poSiteId}. */
export function warehouseMatchesPoSite(
  warehouseSiteId: string | null | undefined,
  poSiteId: string,
): boolean {
  if (warehouseSiteId == null || warehouseSiteId === '') return true;
  return warehouseSiteId === poSiteId;
}

export async function ensureDestinationWarehouseForPoSite(
  client: QueryClient,
  warehouseId: string | null | undefined,
  poSiteId: string,
): Promise<DestinationWarehouseSiteCheck> {
  if (!warehouseId) return 'ok';
  const warehouse = await fetchWarehouseSite(client, warehouseId);
  if (!warehouse) return 'not_found';
  if (!warehouseMatchesPoSite(warehouse.site_id, poSiteId)) return 'warehouse_site_mismatch';
  return 'ok';
}

export async function ensurePoHeaderDestinationWarehouseSite(
  client: QueryClient,
  poId: string,
): Promise<DestinationWarehouseSiteCheck> {
  const { rows } = await client.query<{ site_id: string; destination_warehouse_id: string | null }>(
    `select po.site_id::text as site_id, po.destination_warehouse_id::text as destination_warehouse_id
       from public.purchase_orders po
      where po.org_id = app.current_org_id()
        and po.id = $1::uuid
      limit 1`,
    [poId],
  );
  const header = rows[0];
  if (!header) return 'not_found';
  return ensureDestinationWarehouseForPoSite(client, header.destination_warehouse_id, header.site_id);
}
