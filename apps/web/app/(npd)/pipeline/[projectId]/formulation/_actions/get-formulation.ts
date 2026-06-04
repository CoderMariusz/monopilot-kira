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
  cost_json: unknown | null;
  nutrition_json: unknown | null;
  allergen_json: unknown | null;
  computed_at: string | null;
};

type IngredientRow = {
  id: string;
  rm_code: string;
  qty_kg: string | null;
  pct: string | null;
  cost_per_kg_eur: string | null;
  allergens_inherited: string[];
  sequence: number;
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

export async function getFormulation(input: { projectId?: unknown }): Promise<GetFormulationResult> {
  const projectId = parseUuid(input?.projectId);
  if (!projectId) return { ok: false, error: 'invalid_input' };

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
           fcc.cost_json,
           fcc.nutrition_json,
           fcc.allergen_json,
           fcc.computed_at::text
         from public.formulations f
         left join public.formulation_versions fv on fv.id = f.current_version_id
         left join public.formulation_calc_cache fcc on fcc.version_id = fv.id
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
        limit 1`,
        [projectId],
      );

      const row = formulation.rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      const ingredients = row.version_id
        ? await client.query<IngredientRow>(
            `select
               id::text,
               rm_code,
               qty_kg::text,
               pct::text,
               cost_per_kg_eur::text,
               allergens_inherited,
               sequence
             from public.formulation_ingredients
            where version_id = $1::uuid
            order by sequence`,
            [row.version_id],
          )
        : { rows: [] };

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

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
