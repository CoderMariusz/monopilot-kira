'use server';

import { computeNutrition as computeNutritionRows, nutriScore } from '@monopilot/domain';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const Input = z.object({
  projectId: z.string().uuid(),
  formulationVersionId: z.string().uuid(),
  portionGrams: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
});

export type ComputeNutritionInput = z.infer<typeof Input>;

export type ComputeNutritionResult =
  | {
      ok: true;
      data: {
        productCode: string;
        formulationVersionId: string;
        nutrients: ReturnType<typeof computeNutritionRows>;
        nutriScore: ReturnType<typeof nutriScore>;
      };
    }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed'; message?: string };

interface VersionRow {
  product_code: string | null;
}

interface IngredientRow {
  rm_code: string;
  pct: string | null;
}

interface RawMaterialRow {
  rm_code: string;
  nutrition_per_100g: Record<string, unknown> | null;
}

export async function computeNutrition(raw: unknown): Promise<ComputeNutritionResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  const input = parsed.data;

  try {
    return await withOrgContext(async ({ orgId, client }) => {
      const version = await client.query<VersionRow>(
        `select f.product_code
           from public.formulation_versions fv
           join public.formulations f on f.id = fv.formulation_id
          where fv.id = $1::uuid
            and f.project_id = $2::uuid`,
        [input.formulationVersionId, input.projectId],
      );
      const productCode = version.rows[0]?.product_code;
      if (!productCode) {
        return { ok: false as const, error: 'not_found' as const };
      }

      const ingredientsRes = await client.query<IngredientRow>(
        `select rm_code, pct
           from public.formulation_ingredients
          where version_id = $1::uuid
          order by sequence asc`,
        [input.formulationVersionId],
      );

      const rmCodes = [...new Set(ingredientsRes.rows.map((row) => row.rm_code))];
      const nutritionByRm: Record<string, Record<string, string>> = {};
      if (rmCodes.length > 0) {
        const rawMaterials = await client.query<RawMaterialRow>(
          `select rm_code, nutrition_per_100g
             from "Reference"."RawMaterials"
            where rm_code = any($1::text[])`,
          [rmCodes],
        );

        for (const row of rawMaterials.rows) {
          if (!row.nutrition_per_100g) continue;
          nutritionByRm[row.rm_code] = stringifyNutrition(row.nutrition_per_100g);
        }
      }

      const nutrients = computeNutritionRows(
        ingredientsRes.rows.map((row) => ({ rmCode: row.rm_code, pct: row.pct })),
        nutritionByRm,
        { portionGrams: input.portionGrams },
      );
      const per100g = Object.fromEntries(nutrients.map((row) => [row.nutrientCode, row.per100g]));
      const score = nutriScore(per100g);

      if (nutrients.length > 0) {
        await client.query(
          `insert into public.nutrition_profiles
             (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value, computed_at)
           select $1::uuid, $2, $3::uuid, x.nutrient_code, x.per_100g_value::numeric, x.per_portion_value::numeric, now()
             from jsonb_to_recordset($4::jsonb) as x(
               nutrient_code text,
               per_100g_value text,
               per_portion_value text
             )
           on conflict on constraint nutrition_profiles_org_product_version_nutrient_unique
           do update
             set per_100g_value = excluded.per_100g_value,
                 per_portion_value = excluded.per_portion_value,
                 computed_at = excluded.computed_at`,
          [
            orgId,
            productCode,
            input.formulationVersionId,
            JSON.stringify(
              nutrients.map((row) => ({
                nutrient_code: row.nutrientCode,
                per_100g_value: row.per100g,
                per_portion_value: row.perPortion,
              })),
            ),
          ],
        );
      }

      await client.query(
        `insert into public.nutri_score_results
           (org_id, product_code, formulation_version_id, grade, computed_score, computed_at)
         values ($1::uuid, $2, $3::uuid, $4, $5::integer, now())
         on conflict on constraint nutri_score_results_org_product_version_unique
         do update
           set grade = excluded.grade,
               computed_score = excluded.computed_score,
               computed_at = excluded.computed_at`,
        [orgId, productCode, input.formulationVersionId, score.grade, score.score],
      );

      return {
        ok: true as const,
        data: {
          productCode,
          formulationVersionId: input.formulationVersionId,
          nutrients,
          nutriScore: score,
        },
      };
    });
  } catch (err) {
    console.error('[computeNutrition] persistence_failed', {
      formulationVersionId: input.formulationVersionId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function stringifyNutrition(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}
