'use server';

/**
 * 03-technical Nutrition panel (TEC-012, NEW) — page-load Server Action.
 *
 * Two reads under withOrgContext + RLS (`app.current_org_id()`), no service-role
 * bypass, no mocks:
 *   1. listNutritionProducts() — the set of products that have a materialized
 *      nutrition profile (DISTINCT product_code), joined to public.product for
 *      the display name. Drives the product picker.
 *   2. getNutritionPanel(productCode) — the macros (nutrition_profiles ⋈
 *      "Reference"."Nutrients" for label/unit/order) + the EU-14 allergen
 *      declarations (nutrition_allergens ⋈ public.allergens for the name).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:480-535
 *   (NutritionScreen) — Macronutrients table (per 100 g, %DV, source) + Allergens
 *   (14 EU declared) table + the "recomputed from BOM" note.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Ownership: the nutrition read model is NPD-materialized (110-nutrition-compute-
 * upserts). Technical READS it for spec context — there is NO write path here.
 * NUMERIC values are returned as strings (::text cast) to preserve exactness.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type AllergenPresence,
  ALLERGEN_PRESENCE,
  type NutritionAllergenRow,
  type NutritionMacroRow,
  type NutritionPanel,
  type NutritionProductOption,
  type QueryClient,
} from './shared';

export type ListNutritionProductsState = 'ready' | 'empty' | 'error';

export type ListNutritionProductsResult = {
  products: NutritionProductOption[];
  state: ListNutritionProductsState;
};

export type GetNutritionPanelResult =
  | { ok: true; state: 'ready' | 'empty'; panel: NutritionPanel }
  | { ok: false; state: 'error' };

type ProductRow = { product_code: string; product_name: string | null };

type MacroRow = {
  nutrient_code: string;
  display_name: string;
  unit: string;
  display_order: number;
  regulation: string;
  per_100g: string;
  per_portion: string;
};

type AllergenRow = { allergen_code: string; name: string | null; presence: string };

const PRESENCE_SET = new Set<AllergenPresence>(ALLERGEN_PRESENCE);

/** DISTINCT products that have a materialized nutrition profile, for the picker. */
export async function listNutritionProducts(): Promise<ListNutritionProductsResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<ListNutritionProductsResult> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<ProductRow>(
        `select distinct np.product_code,
                p.product_name
           from public.nutrition_profiles np
           left join public.product p
                  on p.product_code = np.product_code
                 and p.org_id = app.current_org_id()
          where np.org_id = app.current_org_id()
          order by np.product_code asc`,
      );

      const products: NutritionProductOption[] = rows.map((r) => ({
        productCode: r.product_code,
        productName: r.product_name,
      }));

      return { products, state: products.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/nutrition] listNutritionProducts load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { products: [], state: 'error' };
  }
}

/** The macros + allergen declarations for one product (read-only). */
export async function getNutritionPanel(rawProductCode: unknown): Promise<GetNutritionPanelResult> {
  const productCode = typeof rawProductCode === 'string' ? rawProductCode.trim() : '';
  if (!productCode) return { ok: false, state: 'error' };

  try {
    return await withOrgContext(async ({ client }): Promise<GetNutritionPanelResult> => {
      const qc = client as QueryClient;

      const [productResult, macroResult, allergenResult] = await Promise.all([
        qc.query<ProductRow & { computed_at: string | null }>(
          `select p.product_code,
                  p.product_name,
                  (select max(np.computed_at)::text
                     from public.nutrition_profiles np
                    where np.org_id = app.current_org_id()
                      and np.product_code = $1) as computed_at
             from public.product p
            where p.org_id = app.current_org_id()
              and p.product_code = $1
            limit 1`,
          [productCode],
        ),
        // Macros: nutrition_profiles ⋈ Reference.Nutrients (label/unit/order).
        qc.query<MacroRow>(
          `select np.nutrient_code,
                  n.display_name,
                  n.unit,
                  n.display_order,
                  n.regulation,
                  np.per_100g_value::text   as per_100g,
                  np.per_portion_value::text as per_portion
             from public.nutrition_profiles np
             join "Reference"."Nutrients" n
               on n.nutrient_code = np.nutrient_code
            where np.org_id = app.current_org_id()
              and np.product_code = $1
            order by n.display_order asc`,
          [productCode],
        ),
        // Allergens: nutrition_allergens ⋈ public.allergens (EU-14 name).
        qc.query<AllergenRow>(
          `select na.allergen_code,
                  a.name,
                  na.presence
             from public.nutrition_allergens na
             left join public.allergens a
                    on a.code = na.allergen_code
            where na.org_id = app.current_org_id()
              and na.product_code = $1
            order by na.allergen_code asc`,
          [productCode],
        ),
      ]);

      const productRow = productResult.rows[0];
      const computedAt = productRow?.computed_at ?? null;

      const macros: NutritionMacroRow[] = macroResult.rows.map((r) => ({
        nutrientCode: r.nutrient_code,
        displayName: r.display_name,
        unit: r.unit,
        displayOrder: Number(r.display_order),
        per100g: r.per_100g,
        perPortion: r.per_portion,
        regulation: r.regulation,
      }));

      const allergens: NutritionAllergenRow[] = allergenResult.rows
        .filter((r) => PRESENCE_SET.has(r.presence as AllergenPresence))
        .map((r) => ({
          allergenCode: r.allergen_code,
          name: r.name ?? r.allergen_code,
          presence: r.presence as AllergenPresence,
        }));

      const panel: NutritionPanel = {
        productCode,
        productName: productRow?.product_name ?? null,
        computedAt,
        macros,
        allergens,
      };

      return { ok: true, state: macros.length || allergens.length ? 'ready' : 'empty', panel };
    });
  } catch (error) {
    console.error('[technical/nutrition] getNutritionPanel load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: 'error' };
  }
}
