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
 *
 * Orphan-read bridge (Option A, read-side union — no write-path change, no migration):
 *   The Technical item-detail Nutrition tab persists per-RM nutrition into
 *   "Reference"."RawMaterials".nutrition_per_100g (jsonb keyed by nutrient_code) +
 *   allergens_inherited (EU-14 codes), NOT into public.nutrition_profiles (whose
 *   product_code is a NOT-NULL FK to public.product → RM codes can't be inserted
 *   there). Without a bridge an RM whose nutrition was entered in Technical never
 *   appears on this overview. We therefore UNION the NPD-materialized profiles with
 *   the RawMaterials source on BOTH reads (picker + panel). De-dup is by code:
 *   an NPD profile takes precedence; a RawMaterials row is surfaced only for codes
 *   NOT already present in nutrition_profiles, so each item appears exactly once.
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

type RawMaterialNutritionRow = {
  rm_code: string;
  display_name: string;
  nutrition_per_100g: Record<string, unknown> | null;
  allergens_inherited: string[] | null;
};

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
      const [profileResult, rmResult] = await Promise.all([
        qc.query<ProductRow>(
          `select distinct np.product_code,
                  p.product_name
             from public.nutrition_profiles np
             left join public.product p
                    on p.product_code = np.product_code
                   and p.org_id = app.current_org_id()
            where np.org_id = app.current_org_id()
            order by np.product_code asc`,
        ),
        // Orphan-read bridge: RM/intermediate items whose nutrition was entered via
        // the Technical item-detail tab (RawMaterials.nutrition_per_100g != '{}').
        qc.query<{ rm_code: string; display_name: string }>(
          `select rm.rm_code, rm.display_name
             from "Reference"."RawMaterials" rm
            where rm.org_id = app.current_org_id()
              and rm.nutrition_per_100g <> '{}'::jsonb
            order by rm.rm_code asc`,
        ),
      ]);

      // De-dup by code: NPD profiles win; RawMaterials fills only codes not already
      // covered by a materialized profile, so each item appears exactly once.
      const profileCodes = new Set(profileResult.rows.map((r) => r.product_code));
      const rows: ProductRow[] = [...profileResult.rows];
      for (const rm of rmResult.rows) {
        if (profileCodes.has(rm.rm_code)) continue;
        rows.push({ product_code: rm.rm_code, product_name: rm.display_name });
      }
      rows.sort((a, b) => a.product_code.localeCompare(b.product_code));

      // Phase-3 NPD↔Technical shortcut: one cheap org-scoped read mapping each
      // product_code to the owning NPD project (npd_projects.product_code). Null
      // when none maps → the nutrition client omits the "Open NPD project →" link.
      const codes = rows.map((r) => r.product_code).filter((c): c is string => !!c);
      const npdByCode = new Map<string, string>();
      if (codes.length > 0) {
        const { rows: npdRows } = await qc.query<{ product_code: string; project_id: string }>(
          `select distinct on (np.product_code)
                  np.product_code,
                  np.id as project_id
             from public.npd_projects np
            where np.org_id = app.current_org_id()
              and np.product_code = any($1::text[])
            order by np.product_code, np.created_at desc`,
          [codes],
        );
        for (const r of npdRows) npdByCode.set(r.product_code, r.project_id);
      }

      const products: NutritionProductOption[] = rows.map((r) => ({
        productCode: r.product_code,
        productName: r.product_name,
        npdProjectId: npdByCode.get(r.product_code) ?? null,
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

      // Orphan-read bridge: when the code has NO materialized NPD profile rows (no
      // macros and no allergen declarations), fall back to the Technical-owned
      // "Reference"."RawMaterials" source. This surfaces RM/intermediate nutrition
      // entered via the item-detail Nutrition tab. The picker only offers an RM code
      // when no profile covers it, so a profile-backed product never reaches here.
      if (macros.length === 0 && allergens.length === 0) {
        const rmPanel = await buildPanelFromRawMaterials(qc, productCode);
        if (rmPanel) {
          // Preserve an NPD product name if one happens to exist for this code.
          if (productRow?.product_name) rmPanel.productName = productRow.product_name;
          return { ok: true, state: 'ready', panel: rmPanel };
        }
      }

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

type NutrientRefRow = {
  nutrient_code: string;
  display_name: string;
  unit: string;
  display_order: number;
  regulation: string;
};

/**
 * Orphan-read bridge: build a read-only nutrition panel from the Technical-owned
 * "Reference"."RawMaterials" source for a code that has no materialized NPD profile.
 *
 * - Macros: each key of nutrition_per_100g (a NUMERIC-as-string keyed by
 *   nutrient_code) joined to "Reference"."Nutrients" for label/unit/order. Only
 *   well-formed string values are surfaced (NUMERIC stays a verbatim string — no
 *   float). RawMaterials has no per-portion value (an RM has no consumer portion),
 *   so perPortion is left empty and the UI renders it blank.
 * - Allergens: allergens_inherited (EU-14 codes) → presence 'contains'. These codes
 *   have no public.allergens name row, so the code itself is the displayed name
 *   (matches the existing `name ?? code` fallback).
 * - computedAt is null (RawMaterials carries no recompute timestamp) → the UI shows
 *   the "Materialized…" note variant without a date.
 *
 * Returns null when the code has no RawMaterials row or no usable nutrition values.
 */
async function buildPanelFromRawMaterials(
  qc: QueryClient,
  productCode: string,
): Promise<NutritionPanel | null> {
  const { rows } = await qc.query<RawMaterialNutritionRow>(
    `select rm_code, display_name, nutrition_per_100g, allergens_inherited
       from "Reference"."RawMaterials"
      where org_id = app.current_org_id()
        and rm_code = $1
      limit 1`,
    [productCode],
  );
  const rm = rows[0];
  if (!rm) return null;

  const per100g = rm.nutrition_per_100g ?? {};
  const codes = Object.keys(per100g).filter((code) => typeof per100g[code] === 'string');
  if (codes.length === 0 && (rm.allergens_inherited?.length ?? 0) === 0) return null;

  // Resolve label/unit/order for the present nutrient codes from the canonical
  // "Reference"."Nutrients" catalog (shared with the NPD profile path).
  const nutrientRefs = new Map<string, NutrientRefRow>();
  if (codes.length > 0) {
    const { rows: refRows } = await qc.query<NutrientRefRow>(
      `select nutrient_code, display_name, unit, display_order, regulation
         from "Reference"."Nutrients"
        where nutrient_code = any($1::text[])`,
      [codes],
    );
    for (const r of refRows) nutrientRefs.set(r.nutrient_code, r);
  }

  const macros: NutritionMacroRow[] = codes
    .map((code) => {
      const ref = nutrientRefs.get(code);
      if (!ref) return null;
      return {
        nutrientCode: code,
        displayName: ref.display_name,
        unit: ref.unit,
        displayOrder: Number(ref.display_order),
        per100g: String(per100g[code]),
        perPortion: '',
        regulation: ref.regulation,
      } satisfies NutritionMacroRow;
    })
    .filter((m): m is NutritionMacroRow => m !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const allergens: NutritionAllergenRow[] = (rm.allergens_inherited ?? []).map((code) => ({
    allergenCode: code,
    name: code,
    presence: 'contains' as AllergenPresence,
  }));

  if (macros.length === 0 && allergens.length === 0) return null;

  return {
    productCode: rm.rm_code,
    productName: rm.display_name,
    computedAt: null,
    macros,
    allergens,
  };
}
