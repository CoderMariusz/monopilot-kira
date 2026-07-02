import type { QueryClient } from '../../../lib/scanner/db';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function scannerCanSeeSite(client: QueryClient, siteId: string | null): Promise<boolean> {
  const { rows } = await client.query<{ allowed: boolean }>(
    `select app.user_can_see_site($1::uuid) as allowed`,
    [siteId],
  );
  return rows[0]?.allowed === true;
}

export async function scannerLpSiteAccess(
  client: QueryClient,
  lpId: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const { rows } = await client.query<{ allowed: boolean }>(
    `select app.user_can_see_site(lp.site_id) as allowed
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      limit 1`,
    [lpId],
  );
  if (!rows[0]) return 'not_found';
  return rows[0].allowed ? 'ok' : 'forbidden';
}

export async function scannerLocationSiteAccess(
  client: QueryClient,
  locationId: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const { rows } = await client.query<{ allowed: boolean }>(
    `select app.user_can_see_site(w.site_id) as allowed
       from public.locations loc
       join public.warehouses w
         on w.org_id = app.current_org_id()
        and w.id = loc.warehouse_id
      where loc.org_id = app.current_org_id()
        and loc.id = $1::uuid
      limit 1`,
    [locationId],
  );
  if (!rows[0]) return 'not_found';
  return rows[0].allowed ? 'ok' : 'forbidden';
}

export async function scannerWoSiteAccess(
  client: QueryClient,
  woId: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const { rows } = await client.query<{ allowed: boolean }>(
    `select app.user_can_see_site(wo.site_id) as allowed
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      limit 1`,
    [woId],
  );
  if (!rows[0]) return 'not_found';
  return rows[0].allowed ? 'ok' : 'forbidden';
}
