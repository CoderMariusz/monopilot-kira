'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  toIso,
  type ExpiryDashboard,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export async function getExpiryDashboard(): Promise<WarehouseResult<ExpiryDashboard>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ExpiryDashboard>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        lp_id: string;
        lp_number: string;
        tier: 'red' | 'amber';
        item_code: string | null;
        item_name: string | null;
        location_code: string | null;
        warehouse_code: string | null;
        quantity: string;
        uom: string;
        expiry_date: string | Date;
        warning_days: number;
      }>(
        `select lp.id::text as lp_id,
                lp.lp_number,
                case
                  when lp.expiry_date < pg_catalog.now()
                    or lp.expiry_date < pg_catalog.now() + (coalesce(wss.expiry_warning_days, 7)::text || ' days')::interval
                    then 'red'
                  else 'amber'
                end as tier,
                i.item_code,
                i.name as item_name,
                l.code as location_code,
                w.code as warehouse_code,
                lp.quantity::text,
                lp.uom,
                lp.expiry_date,
                coalesce(wss.expiry_warning_days, 7)::int as warning_days
           from public.license_plates lp
           left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
           left join public.locations l on l.org_id = app.current_org_id() and l.id = lp.location_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = lp.warehouse_id
           left join public.warehouse_storage_settings wss
             on wss.org_id = app.current_org_id()
            and wss.warehouse_id = lp.warehouse_id
          where lp.org_id = app.current_org_id()
            and lp.status in ('received', 'available', 'reserved', 'allocated', 'quarantine')
            and lp.expiry_date is not null
            and lp.expiry_date < pg_catalog.now() + interval '30 days'
          order by lp.expiry_date asc, lp.lp_number asc`,
      );

      const mapped = rows.map((row) => ({
        lpId: row.lp_id,
        lpNumber: row.lp_number,
        tier: row.tier,
        itemCode: row.item_code,
        itemName: row.item_name,
        locationCode: row.location_code,
        warehouseCode: row.warehouse_code,
        quantity: String(row.quantity),
        uom: row.uom,
        expiryDate: toIso(row.expiry_date) ?? '',
        warningDays: Number(row.warning_days),
      }));

      return {
        ok: true,
        data: {
          redCount: mapped.filter((row) => row.tier === 'red').length,
          amberCount: mapped.filter((row) => row.tier === 'amber').length,
          rows: mapped,
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] getExpiryDashboard failed', error);
    return { ok: false, reason: 'error' };
  }
}
