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
import { Dec, recomputeCalc, type RecomputeIngredient, type RecomputeResult } from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

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

interface RawMaterialNutritionRow {
  rm_code: string;
  nutrition_per_100g: Record<string, unknown> | null;
}

/** Postgres SQLSTATE for "undefined_table" (relation does not exist). */
const PG_UNDEFINED_TABLE = '42P01';

/**
 * Load per-100g nutrition for the given rm_codes from the canonical
 * `Reference.RawMaterials` master, returning a map of rm_code → { nutrient:
 * numeric-string }. Values are coerced to strings so the weighted-sum stays
 * exact (never a binary float). Returns an empty map (graceful degradation)
 * when the canonical table has not yet been provisioned.
 */
async function loadRmNutrition(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: RawMaterialNutritionRow[] }> },
  rmCodes: string[],
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (rmCodes.length === 0) return out;
  const uniqueCodes = [...new Set(rmCodes)];

  let rows: RawMaterialNutritionRow[];
  try {
    const res = await client.query(
      `select rm_code, nutrition_per_100g
         from "Reference"."RawMaterials"
        where rm_code = any($1::text[])`,
      [uniqueCodes],
    );
    rows = res.rows;
  } catch (err) {
    // Canonical RM-nutrition source not yet provisioned → degrade gracefully to
    // empty nutrition rather than failing the whole recompute. Never silent.
    if ((err as { code?: string })?.code === PG_UNDEFINED_TABLE) {
      console.warn(
        '[recomputeAndCache] Reference.RawMaterials missing (migration 103 not applied) — nutrition_json will be empty',
      );
      return out;
    }
    throw err;
  }

  for (const row of rows) {
    const src = row.nutrition_per_100g;
    if (!src || typeof src !== 'object') continue;
    const perNutrient: Record<string, string> = {};
    for (const [nutrient, value] of Object.entries(src)) {
      if (value === null || value === undefined) continue;
      // Coerce to string at the boundary; the pure function keeps it exact.
      perNutrient[nutrient] = String(value);
    }
    out.set(row.rm_code, perNutrient);
  }
  return out;
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
    const nutritionByRm = await loadRmNutrition(
      client,
      ingRes.rows.map((r) => r.rm_code),
    );

    const ingredients: RecomputeIngredient[] = ingRes.rows.map((r) => {
      const nutritionPer100g = nutritionByRm.get(r.rm_code);
      return {
        rmCode: r.rm_code,
        qtyKg: r.qty_kg,
        pct: r.pct,
        costPerKgEur: r.cost_per_kg_eur,
        allergensInherited: r.allergens_inherited ?? [],
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
             nutrition_json = excluded.nutrition_json,
             allergen_json = excluded.allergen_json,
             computed_at = excluded.computed_at`,
      [
        input.versionId,
        JSON.stringify(costJson),
        JSON.stringify(result.nutrition),
        JSON.stringify({ allergens: result.allergens }),
      ],
    );

    return result;
  });
}
