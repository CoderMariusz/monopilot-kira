'use server';

/**
 * 03-technical Cost surface (TEC-050, T-050): page-load action.
 *
 * Lists the org's items (id + code + name + current denormalized cost_per_kg)
 * for the cost-history page's item picker, and resolves whether the caller holds
 * the real `technical.cost.edit` permission so the page can gate the edit modal
 * and the read of history. Org-scoped via withOrgContext + RLS
 * (`app.current_org_id()`) — no service-role bypass, no hardcoded data.
 *
 * cost_per_kg is returned as a string to preserve NUMERIC exactness (never a JS
 * float). Dual-owned with Finance: this reads ONLY items.cost_per_kg, never any
 * Finance costing table.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  COST_EDIT_PERMISSION,
  hasPermission,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type CostItemOption = {
  id: string;
  itemCode: string;
  name: string;
  /** NUMERIC — string to keep exactness. null when no cost recorded yet. */
  costPerKg: string | null;
};

export type ListCostItemsState = 'ready' | 'empty' | 'error';

export type ListCostItemsResult = {
  items: CostItemOption[];
  canEdit: boolean;
  state: ListCostItemsState;
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  cost_per_kg: string | null;
};

export async function listCostItems(): Promise<ListCostItemsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListCostItemsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      const [{ rows }, canEdit] = await Promise.all([
        qc.query<ItemRow>(
          `select id, item_code, name, cost_per_kg::text as cost_per_kg
             from public.items
            where org_id = app.current_org_id()
            order by item_code asc`,
        ),
        hasPermission(ctx, COST_EDIT_PERMISSION),
      ]);

      const items: CostItemOption[] = rows.map((r) => ({
        id: String(r.id),
        itemCode: r.item_code,
        name: r.name,
        costPerKg: r.cost_per_kg,
      }));

      return { items, canEdit, state: items.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/cost] listCostItems load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { items: [], canEdit: false, state: 'error' };
  }
}
