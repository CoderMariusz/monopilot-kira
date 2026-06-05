/**
 * 03-technical Nutrition panel (TEC-012, NEW) — shared types + RBAC helper.
 *
 * Plain (non-`'use server'`) module: exports the row shapes returned to the page
 * and the org-scoped permission helper. The `'use server'` loader imports from
 * here.
 *
 * Backing tables (migration 086-nutrition.sql):
 *   - public.nutrition_profiles  (product_code, nutrient_code, per_100g_value,
 *     per_portion_value)  ← keyed by product_code TEXT, NOT items.id
 *   - public.nutrition_allergens (product_code, allergen_code, presence)
 *   - "Reference"."Nutrients"   (nutrient_code → display_name, unit, display_order)
 *   - public.allergens          (code → name, EU-14 FIC 1169/2011 reference)
 *   - public.product            (product_code → product_name) for display
 *
 * The nutrition value is the canonical NPD-MATERIALIZED read model (computed by
 * 110-nutrition-compute-upserts). Technical reads it READ-ONLY for FG/spec
 * context; there is no Technical write path here. NUMERIC stays a string.
 */

// presence enum mirrors nutrition_allergens_presence_check
export const ALLERGEN_PRESENCE = ['contains', 'may_contain', 'free_from', 'unknown'] as const;
export type AllergenPresence = (typeof ALLERGEN_PRESENCE)[number];

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** A product that has a materialized nutrition profile (the picker options). */
export type NutritionProductOption = {
  productCode: string;
  productName: string | null;
};

/** One macronutrient row (per-100g + per-portion), NUMERIC kept as string. */
export type NutritionMacroRow = {
  nutrientCode: string;
  displayName: string;
  unit: string;
  displayOrder: number;
  /** NUMERIC — string to preserve exactness (no float). */
  per100g: string;
  perPortion: string;
  regulation: string;
};

/** One allergen declaration row joined to the EU-14 reference name. */
export type NutritionAllergenRow = {
  allergenCode: string;
  name: string;
  presence: AllergenPresence;
};

export type NutritionPanel = {
  productCode: string;
  productName: string | null;
  computedAt: string | null;
  macros: NutritionMacroRow[];
  allergens: NutritionAllergenRow[];
};
