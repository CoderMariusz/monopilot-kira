'use server';

import {
  computeNutrition as computeNutritionRows,
  nutriScore,
  resolveComponentNutrition,
} from '@monopilot/domain';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
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

interface IntermediateRow {
  item_code: string;
  id: string;
}

interface BomLineRow {
  component_code: string;
  quantity: string;
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
      const sources = await resolveComponentNutrition(rmCodes, {
        loadRawMaterials: async (codes) => {
          const { rows } = await client.query<RawMaterialRow>(
            `select rm_code, nutrition_per_100g, allergens_inherited
               from "Reference"."RawMaterials"
              where org_id = app.current_org_id()
                and rm_code = any($1::text[])`,
            [codes],
          );
          return Object.fromEntries(rows.map((row) => [row.rm_code, {
            nutritionPer100g: stringifyNutrition(row.nutrition_per_100g ?? {}),
            allergensInherited: row.allergens_inherited ?? [],
          }]));
        },
        loadIntermediates: async (codes) => {
          const { rows } = await client.query<IntermediateRow>(
            `select item_code, id::text as id
               from public.items
              where org_id = app.current_org_id()
                and item_type = 'intermediate'
                and item_code = any($1::text[])`,
            [codes],
          );
          return Object.fromEntries(rows.map((row) => [row.item_code, row.id]));
        },
        loadActiveBom: async (itemId) => {
          const { rows } = await client.query<BomLineRow>(
            `with active_bom as (
               select bl.component_code, bl.quantity::text as quantity, bl.line_no as sequence
                 from public.bom_lines bl
                 join public.bom_headers h
                   on h.id = bl.bom_header_id and h.org_id = bl.org_id
                where bl.org_id = app.current_org_id()
                  and h.org_id = app.current_org_id()
                  and h.item_id = $1::uuid
                  and h.status = 'active'
             ),
             active_definition as (
               select id
                 from public.wip_definitions
                where org_id = app.current_org_id()
                  and item_id = $1::uuid
                  and status = 'active'
                limit 1
             ),
             selected_components as (
               select component_code, quantity, sequence from active_bom
               union all
               select i.item_code, wdi.qty_per_unit::text, wdi.sequence
                 from active_definition wd
                 join public.wip_definition_ingredients wdi
                   on wdi.wip_definition_id = wd.id
                  and wdi.org_id = app.current_org_id()
                 join public.items i
                   on i.id = wdi.item_id
                  and i.org_id = app.current_org_id()
                where not exists (select 1 from active_bom)
             )
             select component_code, quantity
               from selected_components
              order by sequence asc`,
            [itemId],
          );
          return rows.map((row) => ({ componentCode: row.component_code, quantity: row.quantity }));
        },
      });
      for (const [code, source] of Object.entries(sources)) {
        nutritionByRm[code] = stringifyNutrition(source.nutritionPer100g);
        for (const allergen of source.allergensInherited) {
          const normalized = allergen.trim();
          if (normalized) allergenCodes.add(normalized);
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
          select $1::uuid, $2, $3::uuid, n.allergen_code, 'contains', $4::uuid, now()
            from (
              select distinct public.normalize_allergen_code(x.allergen_code) as allergen_code
                from jsonb_to_recordset($5::jsonb) as x(allergen_code text)
               where nullif(btrim(x.allergen_code), '') is not null
            ) n
           where n.allergen_code is not null
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

function stringifyNutrition(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}
