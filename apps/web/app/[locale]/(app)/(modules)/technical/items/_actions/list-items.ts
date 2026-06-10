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
  limit: number;
  offset: number;
  total: number;
  truncated: boolean;
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  status: string;
  uom_base: string;
  uom_secondary: string | null;
  gs1_gtin: string | null;
  weight_mode: string;
  nominal_weight: string | null;
  tare_weight: string | null;
  gross_weight_max: string | null;
  variance_tolerance_pct: string | null;
  shelf_life_days: number | null;
  shelf_life_mode: string | null;
  cost_per_kg: string | null;
  updated_at: string | Date;
  d365_sync_status: string | null;
  bom_count: string | number;
  allergens: string[] | null;
  total_count: string | number;
};

const ITEM_TYPE_SET = new Set<ItemType>(['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging']);
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
    uomSecondary: row.uom_secondary,
    gs1Gtin: row.gs1_gtin,
    weightMode: WEIGHT_MODE_SET.has(row.weight_mode as WeightMode) ? (row.weight_mode as WeightMode) : 'fixed',
    nominalWeight: row.nominal_weight,
    tareWeight: row.tare_weight,
    grossWeightMax: row.gross_weight_max,
    varianceTolerancePct: row.variance_tolerance_pct,
    shelfLifeDays: row.shelf_life_days,
    shelfLifeMode: row.shelf_life_mode,
    costPerKg: row.cost_per_kg,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    allergens: Array.isArray(row.allergens) ? row.allergens.filter((a): a is string => typeof a === 'string') : [],
    bomCount: Number(row.bom_count) || 0,
    d365SyncStatus: row.d365_sync_status ?? null,
  };
}

const DEFAULT_ITEM_LIMIT = 200;
const MAX_ITEM_LIMIT = 200;

/**
 * Optional server-side `item_type` filter. Used by the Materials route
 * (`itemTypes:['rm']`) so the RM-only list is constrained in SQL under RLS rather
 * than client-side. When absent, the full item master is returned (Products list).
 * Values are validated against ITEM_TYPE_SET so a caller can never inject SQL.
 */
function sanitizeTypes(itemTypes?: readonly string[]): ItemType[] | null {
  if (!itemTypes || itemTypes.length === 0) return null;
  const valid = itemTypes.filter((t): t is ItemType => ITEM_TYPE_SET.has(t as ItemType));
  return valid.length ? Array.from(new Set(valid)) : null;
}

export async function listItems(opts?: {
  limit?: number;
  offset?: number;
  itemTypes?: readonly string[];
}): Promise<ListItemsResult> {
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_ITEM_LIMIT, 1), MAX_ITEM_LIMIT);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const types = sanitizeTypes(opts?.itemTypes);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListItemsResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const [itemsResult, canCreate, canEdit, canDeactivate] = await Promise.all([
        (client as QueryClient).query<ItemRow>(
          `select i.id, i.item_code, i.name, i.item_type, i.status, i.uom_base, i.uom_secondary,
                  i.gs1_gtin, i.weight_mode, i.nominal_weight, i.tare_weight, i.gross_weight_max,
                  i.variance_tolerance_pct, i.shelf_life_days, i.shelf_life_mode,
                  i.cost_per_kg, i.updated_at, i.d365_sync_status,
                  -- bom_headers.product_id is TEXT and FKs to product(org_id, product_code);
                  -- the items-master code namespace joins on item_code, not items.id (uuid).
                  (select count(*) from public.bom_headers bh
                     where bh.product_id = i.item_code and bh.org_id = app.current_org_id()) as bom_count,
                  (select coalesce(array_agg(distinct a.name order by a.name), array[]::text[])
                     from public.item_allergen_profiles iap
                     join public.allergens a on a.code = iap.allergen_code
                    where iap.item_id = i.id and iap.org_id = app.current_org_id()) as allergens,
                  count(*) over () as total_count
             from public.items i
            where i.org_id = app.current_org_id()
              and ($3::text[] is null or i.item_type = any($3::text[]))
            order by i.item_code asc
            limit $1 offset $2`,
          [limit, offset, types],
        ),
        hasPermission(ctx, ITEMS_CREATE_PERMISSION),
        hasPermission(ctx, ITEMS_EDIT_PERMISSION),
        hasPermission(ctx, ITEMS_DEACTIVATE_PERMISSION),
      ]);

      const items = itemsResult.rows
        .map(mapRow)
        .filter((row): row is ItemListItem => row !== null);
      const total = itemsResult.rows.length > 0 ? Number(itemsResult.rows[0].total_count) : 0;

      return {
        items,
        canCreate,
        canEdit,
        canDeactivate,
        state: items.length ? 'ready' : 'empty',
        limit,
        offset,
        total,
        truncated: offset + items.length < total,
      };
    });
  } catch (error) {
    console.error('[technical/items] listItems load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      items: [],
      canCreate: false,
      canEdit: false,
      canDeactivate: false,
      state: 'error',
      limit,
      offset,
      total: 0,
      truncated: false,
    };
  }
}
