'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type FormulationRow = {
  formulation_id: string;
  project_id: string;
  product_code: string | null;
  locked_at: string | null;
  locked_by_user: string | null;
  version_id: string | null;
  version_number: number | null;
  state: string | null;
  batch_size_kg: string | null;
  target_yield_pct: string | null;
  target_price_eur: string | null;
  processing_overhead_pct: string | null;
  cost_json: unknown | null;
  nutrition_json: unknown | null;
  allergen_json: unknown | null;
  computed_at: string | null;
};

type IngredientRow = {
  id: string;
  rm_code: string;
  /** Lane-B: FK to the real items master row (null for legacy free text). */
  item_id: string | null;
  /** W3-L10: reusable WIP definition referenced by this recipe line (null for RM rows). */
  wip_definition_id: string | null;
  /** W3-L10: display name from the joined wip_definitions row. */
  wip_definition_name: string | null;
  /** Lane-B: display name from the joined items row (empty when no item). */
  item_name: string | null;
  /** F6-D17: optional substitute item for this component line. */
  substitute_item_id: string | null;
  substitute_item_code: string | null;
  substitute_item_name: string | null;
  qty_kg: string | null;
  pct: string | null;
  cost_per_kg_eur: string | null;
  /**
   * F-A06 (W9-L4): for item-linked lines this is resolved LIVE from the SSOT
   * `public.item_allergen_profiles` (full array, all intensities) — the stored
   * column is only used for legacy free-text lines with no item_id.
   */
  allergens_inherited: string[];
  sequence: number;
  /**
   * F-B05 (W9-L4): per-100g nutrient values joined from the canonical
   * `Reference.RawMaterials.nutrition_per_100g` (the same source the T-065
   * recompute engine reads, keyed by rm_code). Null when the RM has no
   * catalog row or the table is not yet provisioned (mig 107).
   */
  nutrition_per_100g: Record<string, unknown> | null;
};

export type GetFormulationResult =
  | {
      ok: true;
      data: {
        formulation: {
          id: string;
          projectId: string;
          productCode: string | null;
          lockedAt: string | null;
          lockedByUser: string | null;
        };
        currentVersion: {
          id: string;
          versionNumber: number;
          state: string;
          batchSizeKg: string | null;
          targetYieldPct: string | null;
          targetPriceEur: string | null;
          processingOverheadPct: string | null;
        } | null;
        ingredients: IngredientRow[];
        cachedCalc: {
          costJson: unknown;
          nutritionJson: unknown;
          allergenJson: unknown;
          computedAt: string | null;
        } | null;
      };
    }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed' };

export async function getFormulation(input: {
  projectId?: unknown;
  /**
   * Optional: load THIS specific version's ingredients + state instead of the
   * formulation's `current_version_id`. When provided it must be a valid UUID
   * that belongs to the project's formulation (enforced in SQL via the join +
   * the org predicate); an unknown/foreign id falls back to the current version
   * (the join below only matches it when fv.formulation_id = f.id, otherwise
   * `current_version_id` is used). This keeps the DISPLAYED version and the
   * save target identical — picking v1 actually loads v1's rows, so saveDraft
   * can never overwrite the wrong version.
   */
  versionId?: unknown;
}): Promise<GetFormulationResult> {
  const projectId = parseUuid(input?.projectId);
  if (!projectId) return { ok: false, error: 'invalid_input' };
  // Optional explicit version. A non-UUID is ignored (→ current version);
  // a syntactically valid id that does not belong to this formulation also
  // falls back, because the SQL only resolves it when it joins to f.
  const requestedVersionId =
    input?.versionId === undefined || input?.versionId === null ? null : parseUuid(input.versionId);

  try {
    return await withOrgContext(async ({ client }) => {
      const formulation = await client.query<FormulationRow>(
        `select
           f.id as formulation_id,
           f.project_id,
           f.product_code,
           f.locked_at::text,
           f.locked_by_user::text,
           fv.id as version_id,
           fv.version_number,
           fv.state,
           fv.batch_size_kg::text,
           fv.target_yield_pct::text,
           fv.target_price_eur::text,
           fv.processing_overhead_pct::text,
           fcc.cost_json,
           fcc.nutrition_json,
           fcc.allergen_json,
           fcc.computed_at::text
         from public.formulations f
         -- When a specific (org-scoped, in-formulation) versionId is requested,
         -- load THAT version; otherwise fall back to the formulation's current
         -- version. The id is matched only against versions of THIS formulation
         -- (fv.formulation_id = f.id), so a foreign/unknown id silently resolves
         -- to the current version rather than leaking another project's rows.
         left join public.formulation_versions fv
           on fv.id = coalesce(
                (
                  select rfv.id
                    from public.formulation_versions rfv
                   where rfv.formulation_id = f.id
                     and rfv.id = $2::uuid
                   limit 1
                ),
                f.current_version_id
              )
         left join public.formulation_calc_cache fcc on fcc.version_id = fv.id
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
        limit 1`,
        [projectId, requestedVersionId],
      );

      const row = formulation.rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      const ingredients = row.version_id ? await loadIngredients(client, row.version_id) : { rows: [] };

      return {
        ok: true,
        data: {
          formulation: {
            id: row.formulation_id,
            projectId: row.project_id,
            productCode: row.product_code,
            lockedAt: row.locked_at,
            lockedByUser: row.locked_by_user,
          },
          currentVersion:
            row.version_id && row.version_number && row.state
              ? {
                  id: row.version_id,
                  versionNumber: row.version_number,
                  state: row.state,
                  batchSizeKg: row.batch_size_kg,
                  targetYieldPct: row.target_yield_pct,
                  targetPriceEur: row.target_price_eur,
                  processingOverheadPct: row.processing_overhead_pct,
                }
              : null,
          ingredients: ingredients.rows,
          cachedCalc: row.version_id
            ? {
                costJson: row.cost_json ?? {},
                nutritionJson: row.nutrition_json ?? {},
                allergenJson: row.allergen_json ?? {},
                computedAt: row.computed_at,
              }
            : null,
        },
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Postgres SQLSTATE for "undefined_table" (relation does not exist). */
const PG_UNDEFINED_TABLE = '42P01';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

/**
 * Shared SELECT list for the ingredient read.
 *
 * F-A06 — allergens: item-linked lines resolve the FULL allergen array LIVE
 * from the SSOT `public.item_allergen_profiles` (all intensities; a truly-empty
 * profile reads as `{}` — never falls back to the stale stored cache). Only
 * legacy free-text lines (item_id IS NULL) read the stored derived column.
 *
 * F6/N+1 (W9 cross-review): the SSOT resolution is a pre-aggregated CTE keyed
 * by item_id + ONE left join (PROFILE_ALLERGENS_CTE below) instead of a
 * correlated per-row subquery — the same shape recompute.ts uses.
 */
const PROFILE_ALLERGENS_CTE = `
  with profile_allergens as (
    select iap.item_id,
           array_agg(distinct iap.allergen_code order by iap.allergen_code) as codes
      from public.item_allergen_profiles iap
     where iap.org_id = app.current_org_id()
       and iap.item_id in (
         select fi2.item_id
           from public.formulation_ingredients fi2
          where fi2.version_id = $1::uuid
            and fi2.item_id is not null
       )
     group by iap.item_id
  )`;

const INGREDIENT_SELECT = `
  fi.id::text,
  fi.rm_code,
  fi.item_id::text,
  fi.wip_definition_id::text,
  wd.name as wip_definition_name,
  it.name as item_name,
  fi.substitute_item_id::text,
  substitute.item_code as substitute_item_code,
  substitute.name as substitute_item_name,
  fi.qty_kg::text,
  fi.pct::text,
  fi.cost_per_kg_eur::text,
  case
    when fi.item_id is not null then coalesce(pa.codes, '{}'::text[])
    else coalesce(fi.allergens_inherited, '{}'::text[])
  end as allergens_inherited,
  fi.sequence`;

/**
 * F-B05 — ingredient read WITH the nutrition join to the canonical
 * `Reference.RawMaterials.nutrition_per_100g` (mirrors recompute.ts's source,
 * keyed by rm_code; RLS + the explicit org predicate scope the catalog).
 * Degrades gracefully (like recompute.ts) when migration 107 has not been
 * applied: on 42P01 the query is retried without the join and every
 * nutrition_per_100g is null.
 */
async function loadIngredients(client: QueryClient, versionId: string): Promise<{ rows: IngredientRow[] }> {
  try {
    return await client.query<IngredientRow>(
      `${PROFILE_ALLERGENS_CTE}
       select${INGREDIENT_SELECT},
         rm.nutrition_per_100g
       from public.formulation_ingredients fi
       left join public.items it on it.id = fi.item_id
       left join public.wip_definitions wd on wd.id = fi.wip_definition_id
       left join public.items substitute on substitute.id = fi.substitute_item_id
       left join profile_allergens pa on pa.item_id = fi.item_id
       left join "Reference"."RawMaterials" rm
         on rm.org_id = app.current_org_id()
        and rm.rm_code = fi.rm_code
      where fi.version_id = $1::uuid
      order by fi.sequence`,
      [versionId],
    );
  } catch (err) {
    if ((err as { code?: string })?.code !== PG_UNDEFINED_TABLE) throw err;
    const fallback = await client.query<Omit<IngredientRow, 'nutrition_per_100g'>>(
      `${PROFILE_ALLERGENS_CTE}
       select${INGREDIENT_SELECT}
       from public.formulation_ingredients fi
       left join public.items it on it.id = fi.item_id
       left join public.wip_definitions wd on wd.id = fi.wip_definition_id
       left join public.items substitute on substitute.id = fi.substitute_item_id
       left join profile_allergens pa on pa.item_id = fi.item_id
      where fi.version_id = $1::uuid
      order by fi.sequence`,
      [versionId],
    );
    return { rows: fallback.rows.map((r) => ({ ...r, nutrition_per_100g: null })) };
  }
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
