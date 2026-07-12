'use server';

/**
 * P2-PLANNING — thin read helpers for the WO create modal.
 *
 * The reviewed write actions (createWorkOrder / releaseWorkOrder) and the list /
 * detail reads (listPlanningWorkOrders / getPlanningWorkOrder) live alongside this
 * file and are imported verbatim — never rewritten. The create modal additionally
 * needs two SMALL org-scoped reads that no existing action surfaces:
 *
 *   1. searchFgProducts — the product picker is restricted to PLANNABLE OUTPUTS
 *      (item_type in 'fg' | 'co_product'). A co-product is a primary sellable
 *      output of a production run and must be able to anchor its own work order,
 *      so it is plannable too. The shared `searchItems` action (npd) cannot back
 *      this picker, so this is a tiny dedicated read.
 *   2. listProductionResources — the line select loads from the real
 *      public.production_lines master (seeded by migration 259), never a hardcoded
 *      list.
 *
 * Both run inside withOrgContext as app_user with app.set_org_context applied, so
 * RLS (org_id = app.current_org_id()) scopes every row. No service-role bypass,
 * no mocks. createWorkOrder validates productId is a uuid + that the item resolves,
 * so these helpers are convenience reads only — the source of truth stays in the
 * reviewed write action.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import { PRODUCTION_LINES_SITE_FILTER_SQL } from '../../../../../../../lib/site/production-lines-site-filter';
import { FG_FACTORY_RELEASE_WO_GATE_SQL } from '../../../../../../../lib/planning/factory-release-wo-gate';
import type { QueryClient } from './shared';

export type FgProductOption = {
  id: string;
  itemCode: string;
  name: string;
  uomBase: string;
  /** Pack hierarchy (mig 267) — the create-WO modal labels qty in the output
   *  unit and previews the base-kg conversion from these. */
  outputUom: 'base' | 'each' | 'box';
  netQtyPerEach: number | null;
  eachPerBox: number | null;
  boxesPerPallet: number | null;
  weightMode: 'fixed' | 'catch';
};

export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
};

export type ProductionResources = {
  lines: ProductionLineOption[];
};

const searchInput = z.object({
  query: z.string().trim().max(120).optional().default(''),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export type SearchFgProductsInput = z.input<typeof searchInput>;

/** Search active finished-goods items (org-scoped) by code or name. */
export async function searchFgProducts(input: SearchFgProductsInput = {}): Promise<FgProductOption[]> {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return [];
  const { query, limit } = parsed.data;
  const term = query.trim();
  const like = term.length > 0 ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;

  return withOrgContext<FgProductOption[]>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const { rows } = await client.query<{
      id: string;
      item_code: string;
      name: string;
      uom_base: string;
      output_uom: 'base' | 'each' | 'box' | null;
      net_qty_per_each: string | number | null;
      each_per_box: number | null;
      boxes_per_pallet: number | null;
      weight_mode: 'fixed' | 'catch' | null;
    }>(
      `select i.id, i.item_code, i.name, i.uom_base,
              i.output_uom, i.net_qty_per_each, i.each_per_box, i.boxes_per_pallet, i.weight_mode
         from public.items i
        where i.org_id = app.current_org_id()
          -- co_product items are plannable too: a co-product is a primary sellable
          -- output of a production run and must be able to anchor its own work order
          -- (the create modal labels these generically as 'product').
          and i.item_type in ('fg', 'co_product')
          and i.status = 'active'
          ${FG_FACTORY_RELEASE_WO_GATE_SQL}
          and (
            $1::text is null
            or i.item_code ilike $1 escape '\\'
            or i.name ilike $1 escape '\\'
          )
        order by
          case when $1::text is not null and i.item_code ilike $1 escape '\\' then 0 else 1 end,
          i.updated_at desc,
          i.item_code asc
        limit $2`,
      [like, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      itemCode: r.item_code,
      name: r.name,
      uomBase: r.uom_base,
      outputUom: r.output_uom ?? 'base',
      netQtyPerEach: r.net_qty_per_each === null || r.net_qty_per_each === undefined ? null : Number(r.net_qty_per_each),
      eachPerBox: r.each_per_box,
      boxesPerPallet: r.boxes_per_pallet,
      weightMode: r.weight_mode ?? 'fixed',
    }));
  });
}

/** Load the org's active production lines for the create-modal select. */
export async function listProductionResources(): Promise<ProductionResources> {
  return withOrgContext<ProductionResources>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const activeSiteId = (await getActiveSiteId({ client })) ?? null;
    const { rows } = await client.query<{ id: string; code: string; name: string }>(
      `select id, code, name
         from public.production_lines pl
        where pl.org_id = app.current_org_id()
          and pl.status = 'active'
          ${PRODUCTION_LINES_SITE_FILTER_SQL}
        order by pl.code`,
      [activeSiteId],
    );
    return {
      lines: rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
    };
  });
}
