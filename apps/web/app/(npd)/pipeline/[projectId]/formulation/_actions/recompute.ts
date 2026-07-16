'use server';

/**
 * T-065 — `recomputeAndCache` Server Action (01-NPD-g, PRD §17.11.1).
 *
 * Loads a formulation version's parameters + ingredients (org-scoped via
 * `withOrgContext`), runs the pure `recomputeCalc` helper from
 * `@monopilot/domain`, and upserts the result into `formulation_calc_cache`
 * (cost / nutrition / allergen JSON). Invoked on saveDraft.
 *
 * All compute (cost roll-up, per-100g nutrition, allergen union, totalPct gate)
 * happens in the pure function — this action only does I/O (org-scoped reads +
 * the cache upsert) and zod validation. Money stays NUMERIC-exact: ingredient
 * pct / cost arrive as strings from Postgres NUMERIC and are passed through to
 * `recomputeCalc` without `Number()`.
 *
 * NUTRITION SOURCE (PRD §17.11.1 / §17.11.2):
 * Per-100g nutrient values are loaded from the canonical raw-material master
 * `Reference.RawMaterials.nutrition_per_100g` (jsonb), keyed by `rm_code`, and
 * attached to each ingredient before the weighted-sum runs. The values are kept
 * as NUMERIC strings end-to-end so `nutrition_json` is exact, never a float.
 *
 * GRACEFUL DEGRADATION: `Reference.RawMaterials` is provisioned by migration
 * 103. If a (legacy) environment has not yet applied it, the nutrition load is
 * skipped and `nutrition_json` is written as `{}` — the cost/allergen path is
 * unaffected. This is logged via a thrown undefined_table catch, never silent.
 */

import { z } from 'zod';
import {
  Dec,
  recomputeCalc,
  type RecomputeIngredient,
  type RecomputeResult,
} from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { loadResolvedComponentNutrition } from '../../nutrition/_actions/resolve-component-nutrition';

/** Pack weight grams (NUMERIC string) → kilograms (NUMERIC string), exact. Null/0 → null. */
function packWeightKgFromGrams(grams: string | null): string | null {
  if (grams === null || grams === '') return null;
  const kg = Dec.from(grams).div(Dec.from('1000'));
  return kg.isZero() ? null : kg.toFixed(6);
}

const InputSchema = z.object({
  projectId: z.string().min(1),
  versionId: z.string().min(1),
});

export type RecomputeInput = z.infer<typeof InputSchema>;

interface VersionMetaRow {
  batch_size_kg: string | null;
  target_price_eur: string | null;
  target_yield_pct: string | null;
  processing_overhead_pct: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size), from npd_projects. */
  pack_weight_g: string | null;
}

interface IngredientRow {
  rm_code: string;
  /** Costing v2: amount used in ONE pack, kg. */
  qty_kg: string | null;
  pct: string | null;
  cost_per_kg_eur: string | null;
  allergens_inherited: string[] | null;
}

export async function recomputeAndCache(rawInput: RecomputeInput): Promise<RecomputeResult> {
  const input = InputSchema.parse(rawInput);

  return withOrgContext(async ({ client }) => {
    // ── version parameters (batch / target price / yield) ────────────────────
    // RLS-scoped; the join to formulations confirms the version is in the org's
    // project before we compute / cache anything.
    const metaRes = await client.query<VersionMetaRow>(
      `select fv.batch_size_kg, fv.target_price_eur, fv.target_yield_pct,
              fv.processing_overhead_pct::text as processing_overhead_pct,
              p.pack_weight_g::text as pack_weight_g
         from formulation_versions fv
         join formulations f on f.id = fv.formulation_id
         left join npd_projects p on p.id = f.project_id and p.org_id = app.current_org_id()
        where fv.id = $1::uuid
          and f.project_id = $2::uuid`,
      [input.versionId, input.projectId],
    );
    const meta = metaRes.rows[0];
    if (!meta) {
      throw new Error(`recomputeAndCache: formulation version ${input.versionId} not found for project`);
    }

    // ── ingredient rows ──────────────────────────────────────────────────────
    // F6 (W9 cross-review BLOCKER): allergens for ITEM-LINKED lines are resolved
    // LIVE from the SSOT public.item_allergen_profiles (pre-aggregated CTE keyed
    // by item_id, single left join — same shape as get-formulation.ts), so a
    // recompute against a locked/legacy version can never union a stale stored
    // cache into allergen_json. The stored column is read ONLY for legacy
    // free-text lines (item_id IS NULL), which have no SSOT source.
    const ingRes = await client.query<IngredientRow>(
      `with profile_allergens as (
         select iap.item_id,
                array_agg(distinct iap.allergen_code order by iap.allergen_code) as codes
           from public.item_allergen_profiles iap
          where iap.org_id = app.current_org_id()
            and iap.item_id in (
              select fi2.item_id
                from formulation_ingredients fi2
               where fi2.version_id = $1::uuid
                 and fi2.item_id is not null
            )
          group by iap.item_id
       )
       select fi.rm_code, fi.qty_kg::text as qty_kg, fi.pct, fi.cost_per_kg_eur,
              case
                when fi.item_id is not null then coalesce(pa.codes, '{}'::text[])
                else coalesce(fi.allergens_inherited, '{}'::text[])
              end as allergens_inherited
         from formulation_ingredients fi
         left join profile_allergens pa on pa.item_id = fi.item_id
        where fi.version_id = $1::uuid
        order by fi.sequence asc`,
      [input.versionId],
    );

    // ── per-RM nutrition (canonical Reference.RawMaterials.nutrition_per_100g) ─
    const { sources, sourceAvailable: nutritionSourceAvailable } = await loadResolvedComponentNutrition(
      client,
      ingRes.rows.map((r) => r.rm_code),
    );
    if (!nutritionSourceAvailable) {
      console.warn('[recomputeAndCache] Reference.RawMaterials missing (migration 103 not applied) — nutrition_json will be empty');
    }

    const ingredients: RecomputeIngredient[] = ingRes.rows.map((r) => {
      const source = sources[r.rm_code];
      const nutritionPer100g = source?.nutritionPer100g;
      return {
        rmCode: r.rm_code,
        qtyKg: r.qty_kg,
        pct: r.pct,
        costPerKgEur: r.cost_per_kg_eur,
        allergensInherited: [...new Set([...(r.allergens_inherited ?? []), ...(source?.allergensInherited ?? [])])],
        ...(nutritionPer100g ? { nutritionPer100g } : {}),
      };
    });

    const result = recomputeCalc({
      ingredients,
      batchKg: meta.batch_size_kg,
      targetPriceEur: meta.target_price_eur,
      yieldPct: meta.target_yield_pct,
      processingOverheadPct: meta.processing_overhead_pct ?? undefined,
      // Costing v2: pack weight (g) is the batch size; recipe stage adds no packaging.
      packWeightKg: packWeightKgFromGrams(meta.pack_weight_g),
    });

    // ── upsert the cache row (single statement) ──────────────────────────────
    const costJson = {
      totalPct: result.totalPct,
      totalPctValid: result.totalPctValid,
      totalQtyKg: result.totalQtyKg,
      qtyBalanceValid: result.qtyBalanceValid,
      qtyBalanceUnset: result.qtyBalanceUnset,
      allRmHaveCost: result.allRmHaveCost,
      rawCostPerPack: result.rawCostPerPack,
      rawCost: result.rawCost,
      yieldedCost: result.yieldedCost,
      processing: result.processing,
      packaging: result.packaging,
      costPerKg: result.costPerKg,
      revenuePerKg: result.revenuePerKg,
      marginPct: result.marginPct,
    };

    await client.query(
      `insert into formulation_calc_cache (version_id, cost_json, nutrition_json, allergen_json, computed_at)
       values ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, now())
       on conflict (version_id) do update
         set cost_json = excluded.cost_json,
             nutrition_json = case
               when not $5::boolean
                 and excluded.nutrition_json = '{}'::jsonb
                 then formulation_calc_cache.nutrition_json
               else excluded.nutrition_json
             end,
             allergen_json = excluded.allergen_json,
             computed_at = excluded.computed_at`,
      [
        input.versionId,
        JSON.stringify(costJson),
        JSON.stringify(result.nutrition),
        JSON.stringify({ allergens: result.allergens }),
        nutritionSourceAvailable,
      ],
    );

    return result;
  });
}
