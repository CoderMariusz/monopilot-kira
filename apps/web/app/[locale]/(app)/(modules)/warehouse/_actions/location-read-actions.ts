'use server';

/**
 * WAREHOUSE — read-only location list for the LP MOVE modal (audit defect #5).
 *
 * createStockMove (stock-move-actions.ts:88) is fully implemented but had ZERO UI
 * callers because the LP detail "move" action was rendered disabled. To wire it we
 * need a destination-location picker; no existing warehouse read returns the full
 * location list, so this ADDITIVE read provides it (joined to warehouses for the
 * picker label). stock-move-actions.ts and other existing action files are NOT
 * touched.
 *
 * RBAC: gated on warehouse.inventory.read (the module read permission) — enforced
 * server-side inside withOrgContext, never client-trusted.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  asLimit,
  asTrimmed,
  hasWarehousePermission,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export type LocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
};

/**
 * Org-scoped locations (optionally filtered to one warehouse, optionally
 * search-filtered by code/name), ordered for a Select. Capped (default 200).
 */
export async function listLocations(
  input: { warehouseId?: string; search?: string; limit?: number } = {},
): Promise<WarehouseResult<LocationOption[]>> {
  const warehouseId = asTrimmed(input.warehouseId);
  const search = asTrimmed(input.search);
  const limit = asLimit(input.limit, 200, 500);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<LocationOption[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        code: string;
        name: string;
        warehouse_id: string;
        warehouse_code: string | null;
        warehouse_name: string | null;
      }>(
        `select l.id::text,
                l.code,
                l.name,
                l.warehouse_id::text,
                w.code as warehouse_code,
                w.name as warehouse_name
           from public.locations l
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = l.warehouse_id
          where l.org_id = app.current_org_id()
            and ($1::uuid is null or l.warehouse_id = $1::uuid)
            and ($2::text is null or l.code ilike '%' || $2 || '%' or l.name ilike '%' || $2 || '%')
          order by w.code nulls last, l.code
          limit $3::integer`,
        [warehouseId, search, limit],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          warehouseId: row.warehouse_id,
          warehouseCode: row.warehouse_code,
          warehouseName: row.warehouse_name,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] listLocations failed', error);
    return { ok: false, reason: 'error' };
  }
}
