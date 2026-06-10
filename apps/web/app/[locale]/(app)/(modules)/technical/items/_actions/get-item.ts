'use server';

/**
 * Lane A — 03-technical Items Master: single-item detail loader (T-034 / TEC-012).
 *
 * Org-scoped read of one public.items row by its org-natural key (item_code)
 * under withOrgContext + RLS (`app.current_org_id()`). No service-role bypass,
 * no hardcoded data. Also resolves the caller's technical.items.{edit,deactivate}
 * permissions so the detail page can gate the Edit / Deactivate actions, mirroring
 * list-items.ts. Returns a discriminated result so the RSC can render the
 * not-found / error / ready states without leaking a raw stack.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ITEMS_DEACTIVATE_PERMISSION,
  ITEMS_EDIT_PERMISSION,
  type ItemStatus,
  type ItemType,
  type OrgActionContext,
  type QueryClient,
  type WeightMode,
} from './shared';

export type ItemDetail = {
  id: string;
  itemCode: string;
  name: string;
  itemType: ItemType;
  status: ItemStatus;
  description: string | null;
  productGroup: string | null;
  uomBase: string;
  uomSecondary: string | null;
  gs1Gtin: string | null;
  weightMode: WeightMode;
  nominalWeight: string | null;
  tareWeight: string | null;
  grossWeightMax: string | null;
  varianceTolerancePct: string | null;
  shelfLifeDays: number | null;
  shelfLifeMode: string | null;
  costPerKg: string | null;
  updatedAt: string;
};

export type GetItemResult =
  | { state: 'ready'; item: ItemDetail; canEdit: boolean; canDeactivate: boolean }
  | { state: 'not_found'; canEdit: false; canDeactivate: false }
  | { state: 'error'; canEdit: false; canDeactivate: false };

type ItemDetailRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
  status: string;
  description: string | null;
  product_group: string | null;
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
};

const ITEM_TYPE_SET = new Set<ItemType>(['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging']);
const ITEM_STATUS_SET = new Set<ItemStatus>(['draft', 'active', 'deprecated', 'blocked']);
const WEIGHT_MODE_SET = new Set<WeightMode>(['fixed', 'catch']);

function mapDetail(row: ItemDetailRow): ItemDetail | null {
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
  };
}

export async function getItem(itemCode: string): Promise<GetItemResult> {
  const code = typeof itemCode === 'string' ? itemCode.trim() : '';
  if (!code) return { state: 'not_found', canEdit: false, canDeactivate: false };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<GetItemResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const [rowResult, canEdit, canDeactivate] = await Promise.all([
        (client as QueryClient).query<ItemDetailRow>(
          `select id, item_code, name, item_type, status, description, product_group,
                  uom_base, uom_secondary, gs1_gtin, weight_mode, nominal_weight, tare_weight, gross_weight_max,
                  variance_tolerance_pct, shelf_life_days, shelf_life_mode, cost_per_kg, updated_at
             from public.items
            where org_id = app.current_org_id()
              and item_code = $1
            limit 1`,
          [code],
        ),
        hasPermission(ctx, ITEMS_EDIT_PERMISSION),
        hasPermission(ctx, ITEMS_DEACTIVATE_PERMISSION),
      ]);

      const row = rowResult.rows[0];
      if (!row) return { state: 'not_found', canEdit: false, canDeactivate: false };

      const item = mapDetail(row);
      if (!item) return { state: 'not_found', canEdit: false, canDeactivate: false };

      return { state: 'ready', item, canEdit, canDeactivate };
    });
  } catch (error) {
    console.error('[technical/items] getItem load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { state: 'error', canEdit: false, canDeactivate: false };
  }
}
