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
  type OutputUom,
  OUTPUT_UOMS,
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
  categoryCode: string | null;
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
  // Pack hierarchy (migration 267).
  outputUom: OutputUom;
  netQtyPerEach: string | null;
  eachPerBox: number | null;
  boxesPerPallet: number | null;
  costPerKg: string | null;
  listPriceGbp: string | null;
  effectiveCostAmount: string | null;
  effectiveCostCurrency: string | null;
  effectiveCostSource: string | null;
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
  effective_cost_amount: string | null;
  effective_cost_currency: string | null;
  effective_cost_source: string | null;
  updated_at: string | Date;
};

const OUTPUT_UOM_SET = new Set<OutputUom>(OUTPUT_UOMS);

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
    outputUom: OUTPUT_UOM_SET.has(row.output_uom as OutputUom) ? (row.output_uom as OutputUom) : 'base',
    netQtyPerEach: row.net_qty_per_each,
    eachPerBox: row.each_per_box,
    boxesPerPallet: row.boxes_per_pallet,
    costPerKg: row.cost_per_kg,
    listPriceGbp: row.list_price_gbp,
    effectiveCostAmount: row.effective_cost_amount,
    effectiveCostCurrency: row.effective_cost_currency,
    effectiveCostSource: row.effective_cost_source,
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
          `select i.id, i.item_code, i.name, i.item_type, i.status, i.description, i.product_group, i.category_code,
                  i.uom_base, i.uom_secondary, i.gs1_gtin, i.weight_mode, i.nominal_weight, i.tare_weight, i.gross_weight_max,
                  i.variance_tolerance_pct, i.shelf_life_days, i.shelf_life_mode,
                  i.output_uom, i.net_qty_per_each, i.each_per_box, i.boxes_per_pallet,
                  i.cost_per_kg, i.list_price_gbp::text as list_price_gbp,
                  vec.amount::text as effective_cost_amount,
                  vec.currency as effective_cost_currency,
                  vec.source as effective_cost_source,
                  i.updated_at
             from public.items i
             left join public.v_item_effective_cost vec
               on vec.org_id = i.org_id
              and vec.item_id = i.id
            where i.org_id = app.current_org_id()
              and i.item_code = $1
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
