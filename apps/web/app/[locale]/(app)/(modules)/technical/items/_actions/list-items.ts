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
  DEFAULT_ITEM_LIST_PAGE_SIZE,
  ITEM_CHOOSER_MAX_LIMIT,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../../lib/shared/pagination';
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

export type D365SyncFilter = 'synced' | 'drift' | 'unsynced';

export type ListItemsResult = {
  items: ItemListItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  state: ListItemsState;
  pagination: PaginatedResult<ItemListItem>;
  /** Per-type counts for tabs (search-filtered, not type-filtered). */
  typeCounts: Record<ItemType, number> & { all: number };
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  status: string;
  description: string | null;
  product_group: string | null;
  category_code: string | null;
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
  output_uom: string | null;
  net_qty_per_each: string | null;
  each_per_box: number | null;
  boxes_per_pallet: number | null;
  cost_per_kg: string | null;
  list_price_gbp: string | null;
  updated_at: string | Date;
  d365_sync_status: string | null;
  bom_count: string | number;
  allergens: string[] | null;
};

const ITEM_TYPE_SET = new Set<ItemType>(['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging']);
const ITEM_STATUS_SET = new Set<ItemStatus>(['draft', 'active', 'deprecated', 'blocked']);
const WEIGHT_MODE_SET = new Set<WeightMode>(['fixed', 'catch']);
const OUTPUT_UOM_SET = new Set(['base', 'each', 'box']);
const ALL_ITEM_TYPES: ItemType[] = ['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging'];
const D365_FILTER_SET = new Set<D365SyncFilter>(['synced', 'drift', 'unsynced']);

function mapRow(row: ItemRow): ItemListItem | null {
  if (!ITEM_TYPE_SET.has(row.item_type as ItemType)) return null;
  if (!ITEM_STATUS_SET.has(row.status as ItemStatus)) return null;
  return {
    id: String(row.id),
    itemCode: row.item_code,
    name: row.name,
    itemType: row.item_type as ItemType,
    status: row.status as ItemStatus,
    description: row.description,
    productGroup: row.product_group,
    categoryCode: row.category_code,
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
    outputUom: OUTPUT_UOM_SET.has(row.output_uom ?? '') ? (row.output_uom as ItemListItem['outputUom']) : 'base',
    netQtyPerEach: row.net_qty_per_each,
    eachPerBox: row.each_per_box,
    boxesPerPallet: row.boxes_per_pallet,
    costPerKg: row.cost_per_kg,
    listPriceGbp: row.list_price_gbp,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    allergens: Array.isArray(row.allergens) ? row.allergens.filter((a): a is string => typeof a === 'string') : [],
    bomCount: Number(row.bom_count) || 0,
    d365SyncStatus: row.d365_sync_status ?? null,
  };
}

const ITEM_SELECT = `select i.id, i.item_code, i.name, i.item_type, i.status, i.description, i.product_group,
                  i.category_code,
                  i.uom_base, i.uom_secondary,
                  i.gs1_gtin, i.weight_mode, i.nominal_weight, i.tare_weight, i.gross_weight_max,
                  i.variance_tolerance_pct, i.shelf_life_days, i.shelf_life_mode,
                  i.output_uom, i.net_qty_per_each::text as net_qty_per_each, i.each_per_box, i.boxes_per_pallet,
                  i.cost_per_kg, i.list_price_gbp::text as list_price_gbp, i.updated_at, i.d365_sync_status,
                  (select count(*) from public.bom_headers bh
                     where bh.item_id = i.id and bh.org_id = app.current_org_id()) as bom_count,
                  (select coalesce(array_agg(distinct coalesce(a.display_name, a.allergen_code)
                                              order by coalesce(a.display_name, a.allergen_code)), array[]::text[])
                     from public.item_allergen_profiles iap
                     join "Reference"."Allergens" a
                       on a.org_id = iap.org_id and a.allergen_code = iap.allergen_code
                    where iap.item_id = i.id and iap.org_id = app.current_org_id()) as allergens`;

const ITEM_FROM = `from public.items i`;

const ITEM_BASE_WHERE = `where i.org_id = app.current_org_id()
              and ($1::text[] is null or i.item_type = any($1::text[]))
              and (
                $2::text is null
                or i.item_code ilike '%' || $2 || '%'
                or i.name ilike '%' || $2 || '%'
              )`;

const ITEM_LIST_FILTERS = `and ($3::text is null or i.item_type = $3::text)
              and ($4::text is null or i.status = $4::text)
              and (
                $5::text is null
                or ($5 = 'synced' and i.d365_sync_status = 'synced')
                or ($5 = 'drift' and i.d365_sync_status = 'drift')
                or ($5 = 'unsynced' and (i.d365_sync_status is null or i.d365_sync_status not in ('synced', 'drift')))
              )`;

function sanitizeTypes(itemTypes?: readonly string[]): ItemType[] | null {
  if (!itemTypes || itemTypes.length === 0) return null;
  const valid = itemTypes.filter((t): t is ItemType => ITEM_TYPE_SET.has(t as ItemType));
  return valid.length ? Array.from(new Set(valid)) : null;
}

function parseItemTypeFilter(type: string | null | undefined, allowedTypes: ItemType[] | null): ItemType | null {
  if (!type || type === 'all') return null;
  if (!ITEM_TYPE_SET.has(type as ItemType)) return null;
  if (allowedTypes && !allowedTypes.includes(type as ItemType)) return null;
  return type as ItemType;
}

function parseStatusFilter(status: string | null | undefined): ItemStatus | null {
  if (!status || status === 'all') return null;
  if (!ITEM_STATUS_SET.has(status as ItemStatus)) return null;
  return status as ItemStatus;
}

function parseD365Filter(d365: string | null | undefined): D365SyncFilter | null {
  if (!d365 || d365 === 'all') return null;
  if (!D365_FILTER_SET.has(d365 as D365SyncFilter)) return null;
  return d365 as D365SyncFilter;
}

function emptyTypeCounts(): Record<ItemType, number> & { all: number } {
  const counts = { all: 0 } as Record<ItemType, number> & { all: number };
  for (const t of ALL_ITEM_TYPES) counts[t] = 0;
  return counts;
}

export async function listItems(opts?: {
  page?: number;
  offset?: number;
  limit?: number;
  itemTypes?: readonly string[];
  search?: string | null;
  itemType?: string | null;
  status?: string | null;
  d365?: string | null;
}): Promise<ListItemsResult> {
  const allowedTypes = sanitizeTypes(opts?.itemTypes);
  const search = opts?.search?.trim() || null;
  const typeFilter = parseItemTypeFilter(opts?.itemType, allowedTypes);
  const statusFilter = parseStatusFilter(opts?.status);
  const d365Filter = parseD365Filter(opts?.d365);
  const isPaginatedList = opts?.page !== undefined || opts?.offset !== undefined;
  const page = normalizePage({
    page: opts?.page,
    offset: opts?.offset,
    limit: opts?.limit,
    defaultLimit: isPaginatedList ? DEFAULT_ITEM_LIST_PAGE_SIZE : ITEM_CHOOSER_MAX_LIMIT,
    maxLimit: ITEM_CHOOSER_MAX_LIMIT,
  });

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListItemsResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const scopeTypes = allowedTypes;
      const baseParams = [scopeTypes, search] as const;
      const filterParams = [typeFilter, statusFilter, d365Filter] as const;
      const listParams = [...baseParams, ...filterParams, page.limit, page.offset] as const;

      const [typeCountRes, totalRes, itemsResult, canCreate, canEdit, canDeactivate] = await Promise.all([
        (client as QueryClient).query<{ item_type: string; n: number }>(
          `select i.item_type, count(*)::int as n
             ${ITEM_FROM}
            ${ITEM_BASE_WHERE}
            group by 1`,
          [...baseParams],
        ),
        (client as QueryClient).query<{ total: number }>(
          `select count(*)::int as total
             ${ITEM_FROM}
            ${ITEM_BASE_WHERE}
            ${ITEM_LIST_FILTERS}`,
          [...baseParams, ...filterParams],
        ),
        (client as QueryClient).query<ItemRow>(
          `${ITEM_SELECT}
             ${ITEM_FROM}
            ${ITEM_BASE_WHERE}
            ${ITEM_LIST_FILTERS}
            order by i.item_code asc
            limit $6 offset $7`,
          listParams,
        ),
        hasPermission(ctx, ITEMS_CREATE_PERMISSION),
        hasPermission(ctx, ITEMS_EDIT_PERMISSION),
        hasPermission(ctx, ITEMS_DEACTIVATE_PERMISSION),
      ]);

      const typeCounts = emptyTypeCounts();
      for (const row of typeCountRes.rows) {
        if (ITEM_TYPE_SET.has(row.item_type as ItemType)) {
          typeCounts[row.item_type as ItemType] = row.n;
          typeCounts.all += row.n;
        }
      }

      const items = itemsResult.rows
        .map(mapRow)
        .filter((row): row is ItemListItem => row !== null);
      const pagination = toPaginatedResult(items, Number(totalRes.rows[0]?.total ?? 0), page);
      const hasActiveFilters = Boolean(search || typeFilter || statusFilter || d365Filter);
      const catalogEmpty = !hasActiveFilters && typeCounts.all === 0;

      return {
        items,
        canCreate,
        canEdit,
        canDeactivate,
        state: catalogEmpty ? 'empty' : 'ready',
        pagination,
        typeCounts,
      };
    });
  } catch (error) {
    console.error('[technical/items] listItems load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    const emptyPage = normalizePage({ page: 1, defaultLimit: DEFAULT_ITEM_LIST_PAGE_SIZE });
    return {
      items: [],
      canCreate: false,
      canEdit: false,
      canDeactivate: false,
      state: 'error',
      pagination: toPaginatedResult([], 0, emptyPage),
      typeCounts: emptyTypeCounts(),
    };
  }
}
