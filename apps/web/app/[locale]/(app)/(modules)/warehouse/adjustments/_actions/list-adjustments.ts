'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  toIso,
  type QueryClient,
  type WarehouseContext,
} from '../../_actions/shared';

type StockAdjustmentDbRow = {
  id: string;
  direction: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  lp_id: string | null;
  lp_number: string | null;
  adjustment_qty: string;
  reason: string | null;
  applied_by: string | null;
  applied_at: string | Date;
};

type StockAdjustmentListRow = {
  id: string;
  direction: string;
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  lpId: string | null;
  lpNumber: string | null;
  adjustmentQty: string;
  reason: string | null;
  appliedBy: string | null;
  appliedAt: string;
};

export async function listStockAdjustments(): Promise<StockAdjustmentListRow[]> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<StockAdjustmentListRow[]> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) {
        throw new Error('forbidden');
      }

      const { rows } = await ctx.client.query<StockAdjustmentDbRow>(
        `select sa.id::text,
                sa.direction,
                sa.item_id::text,
                i.item_code,
                i.name as item_name,
                sa.lp_id::text,
                lp.lp_number,
                sa.adjustment_qty::text,
                sa.reason,
                sa.applied_by::text,
                sa.applied_at
           from public.stock_adjustments sa
           left join public.items i
             on i.org_id = app.current_org_id()
            and i.id = sa.item_id
           left join public.license_plates lp
             on lp.org_id = app.current_org_id()
            and lp.id = sa.lp_id
          where sa.org_id = app.current_org_id()
          order by sa.applied_at desc, sa.id desc
          limit 100`,
      );

      return rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        itemId: row.item_id,
        itemCode: row.item_code,
        itemName: row.item_name,
        lpId: row.lp_id,
        lpNumber: row.lp_number,
        adjustmentQty: String(row.adjustment_qty),
        reason: row.reason,
        appliedBy: row.applied_by,
        appliedAt: toIso(row.applied_at) ?? '',
      }));
    });
  } catch (error) {
    console.error('[warehouse] listStockAdjustments failed', error);
    throw error;
  }
}
