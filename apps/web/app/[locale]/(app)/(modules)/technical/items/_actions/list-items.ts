'use server';

/**
 * Lane A — 03-technical Items Master: list Server Action (T-008).
 *
 * Org-scoped read of public.items under withOrgContext + RLS
 * (`app.current_org_id()`). No service-role bypass, no hardcoded data. Also
 * resolves whether the caller may create items so the page can render the
 * "New item" CTA only when the real `technical.items.create` permission
 * resolves for them.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ITEMS_CREATE_PERMISSION,
  ITEMS_DEACTIVATE_PERMISSION,
  ITEMS_EDIT_PERMISSION,
  type ItemListItem,
  type ItemStatus,
  type ItemType,
  type OrgActionContext,
  type QueryClient,
  type WeightMode,
} from './shared';

export type ListItemsState = 'ready' | 'empty' | 'error';

export type ListItemsResult = {
  items: ItemListItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  state: ListItemsState;
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  status: string;
  uom_base: string;
  weight_mode: string;
  cost_per_kg: string | null;
  updated_at: string | Date;
};

const ITEM_TYPE_SET = new Set<ItemType>(['rm', 'intermediate', 'fg', 'co_product', 'byproduct']);
const ITEM_STATUS_SET = new Set<ItemStatus>(['draft', 'active', 'deprecated', 'blocked']);
const WEIGHT_MODE_SET = new Set<WeightMode>(['fixed', 'catch']);

function mapRow(row: ItemRow): ItemListItem | null {
  if (!ITEM_TYPE_SET.has(row.item_type as ItemType)) return null;
  if (!ITEM_STATUS_SET.has(row.status as ItemStatus)) return null;
  return {
    id: String(row.id),
    itemCode: row.item_code,
    name: row.name,
    itemType: row.item_type as ItemType,
    status: row.status as ItemStatus,
    uomBase: row.uom_base,
    weightMode: WEIGHT_MODE_SET.has(row.weight_mode as WeightMode) ? (row.weight_mode as WeightMode) : 'fixed',
    costPerKg: row.cost_per_kg,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listItems(): Promise<ListItemsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListItemsResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const [itemsResult, canCreate, canEdit, canDeactivate] = await Promise.all([
        (client as QueryClient).query<ItemRow>(
          `select id, item_code, name, item_type, status, uom_base, weight_mode, cost_per_kg, updated_at
             from public.items
            where org_id = app.current_org_id()
            order by item_code asc`,
        ),
        hasPermission(ctx, ITEMS_CREATE_PERMISSION),
        hasPermission(ctx, ITEMS_EDIT_PERMISSION),
        hasPermission(ctx, ITEMS_DEACTIVATE_PERMISSION),
      ]);

      const items = itemsResult.rows
        .map(mapRow)
        .filter((row): row is ItemListItem => row !== null);

      return {
        items,
        canCreate,
        canEdit,
        canDeactivate,
        state: items.length ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/items] listItems load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { items: [], canCreate: false, canEdit: false, canDeactivate: false, state: 'error' };
  }
}
