import type { OrgContextLike } from '../shared';

export type ProductProcessYields = {
  all: number[];
  byIngredientItemId: Map<string, number[]>;
  byWipItemId: Map<string, number[]>;
  /** Distinct prod_detail component rows carrying processes. */
  componentCount: number;
};

/** Π(yield_pct/100) × 100 — skips invalid yield values (same rules as materialize). */
export function compoundYieldFractions(yields: readonly number[]): number {
  if (yields.length === 0) return 100;
  return (
    yields.reduce((factor, yieldPct) => {
      if (!Number.isFinite(yieldPct) || yieldPct <= 0 || yieldPct > 100) return factor;
      return factor * (yieldPct / 100);
    }, 1) * 100
  );
}

export async function loadProductProcessYields(
  ctx: OrgContextLike,
  productCode: string,
): Promise<ProductProcessYields> {
  const { rows } = await ctx.client.query<{
    prod_detail_id: string;
    ingredient_item_id: string | null;
    wip_item_id: string | null;
    display_order: number;
    yield_pct: string | number | null;
  }>(
    `select pd.id::text as prod_detail_id,
            pd.item_id::text as ingredient_item_id,
            wp.wip_item_id::text as wip_item_id,
            wp.display_order,
            wp.yield_pct::text as yield_pct
       from public.prod_detail pd
       join public.npd_wip_processes wp
         on wp.org_id = pd.org_id
        and wp.prod_detail_id = pd.id
      where pd.org_id = app.current_org_id()
        and pd.product_code = $1
      order by pd.component_index asc, wp.display_order asc`,
    [productCode],
  );

  const byDetail = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDetail.get(row.prod_detail_id) ?? [];
    list.push(row);
    byDetail.set(row.prod_detail_id, list);
  }

  const all = rows.map((row) => Number(row.yield_pct ?? 100));
  const byIngredientItemId = new Map<string, number[]>();
  const byWipItemId = new Map<string, number[]>();
  for (const detailRows of byDetail.values()) {
    const sorted = [...detailRows].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const ingredientItemId = sorted.find((row) => row.ingredient_item_id)?.ingredient_item_id;
    if (ingredientItemId) {
      byIngredientItemId.set(ingredientItemId, sorted.map((row) => Number(row.yield_pct ?? 100)));
    }
    for (let index = 0; index < sorted.length; index++) {
      const row = sorted[index]!;
      if (row.wip_item_id) {
        byWipItemId.set(row.wip_item_id, sorted.slice(index).map((suffix) => Number(suffix.yield_pct ?? 100)));
      }
    }
  }

  return { all, byIngredientItemId, byWipItemId, componentCount: byDetail.size };
}

export function compoundedYieldPctForComponent(
  processYields: ProductProcessYields,
  itemId: string | null,
): number {
  // Unlinked components may only inherit the FULL process chain when the product
  // has a SINGLE prod_detail component (the chain unambiguously IS the product's
  // chain — the owner's canonical 0.300/0.95/0.95 case). With multiple components
  // the union of every sibling's processes would over-compound (divide by
  // 0.95^(2×N)), so an unlinked component takes no yield adjustment until it is
  // explicitly linked to its component chain.
  const fallback = processYields.componentCount <= 1 ? processYields.all : [];
  const yields = itemId
    ? processYields.byIngredientItemId.get(itemId) ?? processYields.byWipItemId.get(itemId) ?? fallback
    : fallback;
  return compoundYieldFractions(yields);
}

/** Product-wide compound yield for overview (single-component chain only). */
export function compoundedYieldPctForProduct(processYields: ProductProcessYields): number | null {
  if (processYields.all.length === 0) return null;
  if (processYields.componentCount > 1) return null;
  return compoundedYieldPctForComponent(processYields, null);
}
