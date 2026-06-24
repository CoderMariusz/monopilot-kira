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
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed'; message?: string };

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
  allergens_inherited: string[] | null;
}

export async function computeNutrition(raw: unknown): Promise<ComputeNutritionResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  const input = parsed.data;

  try {
    return await withOrgContext(async ({ orgId, userId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, 'npd.formulation.create_draft'))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

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
      const allergenCodes = new Set<string>();
      if (rmCodes.length > 0) {
        const rawMaterials = await client.query<RawMaterialRow>(
          `select rm_code, nutrition_per_100g, allergens_inherited
             from "Reference"."RawMaterials"
            where org_id = app.current_org_id()
              and rm_code = any($1::text[])`,
          [rmCodes],
        );

        for (const row of rawMaterials.rows) {
          if (row.nutrition_per_100g) {
            nutritionByRm[row.rm_code] = stringifyNutrition(row.nutrition_per_100g);
          }
          for (const allergen of row.allergens_inherited ?? []) {
            const code = allergen.trim();
            if (code.length > 0) allergenCodes.add(code);
          }
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
        `delete from public.nutrition_allergens
          where org_id = app.current_org_id()
            and product_code = $1
            and formulation_version_id = $2::uuid`,
        [productCode, input.formulationVersionId],
      );

      const allergens = [...allergenCodes].sort();
      if (allergens.length > 0) {
        await client.query(
          `insert into public.nutrition_allergens
             (org_id, product_code, formulation_version_id, allergen_code, presence, audited_by_user, audited_at)
           select $1::uuid, $2, $3::uuid, x.allergen_code, 'contains', $4::uuid, now()
             from jsonb_to_recordset($5::jsonb) as x(allergen_code text)
           on conflict on constraint nutrition_allergens_org_product_allergen_unique
           do update
             set presence = excluded.presence,
                 audited_by_user = excluded.audited_by_user,
                 audited_at = excluded.audited_at`,
          [
            orgId,
            productCode,
            input.formulationVersionId,
            userId,
            JSON.stringify(allergens.map((allergenCode) => ({ allergen_code: allergenCode }))),
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

async function hasPermission(
  ctx: { userId: string; orgId: string; client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> } },
  permission: string,
): Promise<boolean> {
  const result = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return result.rows.length > 0;
}

function stringifyNutrition(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}
