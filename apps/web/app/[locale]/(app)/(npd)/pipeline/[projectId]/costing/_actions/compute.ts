'use server';

/**
 * T-073 — `computeCosting` Server Action (§17.11.3).
 *
 * Computes the deterministic 9-step costing waterfall (pure helper) and, when
 * the scenario does NOT hard-fail (margin >= 0%), UPSERTs the breakdown and
 * REPLACES its waterfall steps inside a single org-scoped transaction.
 *
 * Red lines honoured:
 *   - Money stays NUMERIC-exact: the pure helper returns decimal STRINGS and we
 *     bind them straight into NUMERIC columns ($n::numeric). No Number() / float.
 *   - Margin warn threshold is READ from Reference.AlertThresholds
 *     (`costing_margin_warn_pct`) — never hardcoded.
 *   - Hard fail (margin < 0%) returns FAIL and refuses to commit.
 *   - org scope via withOrgContext -> app.set_org_context -> RLS
 *     (org_id = app.current_org_id()). No tenant_id / current_setting.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  COSTING_WATERFALL_STEP_NAMES,
  computeWaterfall,
  decimalGt,
  decimalLt,
  decimalLte,
  type WaterfallResult,
} from '../../../../../../../../lib/costing/compute-waterfall';

const DECIMAL = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');
const NON_NEG_DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');

// Numeric-exact bounds (no float coercion) — keep in lockstep with the pure
// helper's guards so a violation is rejected as invalid_input (not as a thrown
// error that would surface as persistence_failed):
//   0 < yieldPct <= 100   |   marginPct < 100
const YIELD_PCT = NON_NEG_DECIMAL.refine((s) => decimalGt(s, '0') && decimalLte(s, '100'), {
  message: 'yieldPct must be in (0, 100]',
});
const MARGIN_PCT = DECIMAL.refine((s) => decimalLt(s, '100'), {
  message: 'marginPct must be < 100',
});

const ParamsSchema = z.object({
  rawCostEur: NON_NEG_DECIMAL,
  yieldPct: YIELD_PCT,
  processLabourEur: NON_NEG_DECIMAL,
  packagingEur: NON_NEG_DECIMAL,
  overheadEur: NON_NEG_DECIMAL,
  logisticsEur: NON_NEG_DECIMAL,
  marginPct: MARGIN_PCT,
  distributorMarkupPct: NON_NEG_DECIMAL,
  retailMarkupPct: NON_NEG_DECIMAL,
});

const Input = z.object({
  productCode: z.string().trim().min(1).max(64),
  scenario: z.string().trim().min(1).max(64),
  params: ParamsSchema,
});

const InitialInput = z.object({
  projectId: z.string().uuid(),
});

type ComputeCostingError =
  | 'invalid_input'
  | 'margin_hard_fail'
  | 'not_found'
  | 'persistence_failed';

type ComputeCostingResult =
  | {
      ok: true;
      data: {
        breakdownId: string;
        productCode: string;
        scenario: string;
        rawCostEur: string;
        marginPct: string;
        targetPriceEur: string;
        status: WaterfallResult['status'];
        warn: boolean;
        steps: WaterfallResult['steps'];
      };
    }
  | { ok: false; error: ComputeCostingError; message?: string };

const MARGIN_WARN_THRESHOLD_KEY = 'costing_margin_warn_pct';

type InitialBreakdownRow = {
  product_code: string | null;
  ingredient_count: string;
  missing_cost_count: string;
  raw_cost_eur: string | null;
  yield_pct: string;
  margin_pct: string;
};

export async function computeCosting(raw: unknown): Promise<ComputeCostingResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ orgId, client }) => {
      // 1) Read the per-org margin warn threshold from Reference.AlertThresholds.
      //    value_int holds the percent (e.g. 15). RLS scopes to this org.
      const thr = await client.query<{ value_int: number | null; value_text: string | null }>(
        `select value_int, value_text
           from "Reference"."AlertThresholds"
          where threshold_key = $1`,
        [MARGIN_WARN_THRESHOLD_KEY],
      );
      const marginWarnPct = resolveThreshold(thr.rows[0]);

      // 2) Pure, deterministic, NUMERIC-exact compute.
      const result = computeWaterfall(input.params, marginWarnPct ? { marginWarnPct } : {});

      // 3) Hard fail: refuse to commit (§17.11.3 hard-fail rule). The wrapping
      //    transaction will ROLLBACK because no writes have occurred.
      if (result.status === 'fail') {
        return {
          ok: false as const,
          error: 'margin_hard_fail' as const,
          message: `margin ${result.marginPct}% is below the 0% hard-fail floor`,
        };
      }

      // 4) UPSERT the breakdown (org_id, product_code, scenario unique). Money
      //    binds as decimal strings into NUMERIC columns — no float coercion.
      const upsert = await client.query<{ id: string }>(
        `insert into public.costing_breakdowns
           (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur, params, computed_at)
         values ($1::uuid, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::jsonb, now())
         on conflict (org_id, product_code, scenario) do update
           set raw_cost_eur     = excluded.raw_cost_eur,
               margin_pct       = excluded.margin_pct,
               target_price_eur = excluded.target_price_eur,
               params           = excluded.params,
               computed_at      = excluded.computed_at
         returning id`,
        [
          orgId,
          input.productCode,
          input.scenario,
          result.rawCostEur,
          result.marginPct,
          result.targetPriceEur,
          // Persist the EXACT what-if parameters (decimal strings, never floats).
          JSON.stringify(input.params),
        ],
      );
      const breakdownId = upsert.rows[0]?.id;
      if (!breakdownId) {
        // FK violation on product_code surfaces as zero rows only if ON CONFLICT
        // matched nothing AND nothing inserted — treat as not_found.
        return { ok: false as const, error: 'not_found' as const };
      }

      // 5) Replace the waterfall steps for this breakdown (delete + insert) so a
      //    recompute is idempotent and never leaves a stale/partial step set.
      await client.query(`delete from public.costing_waterfall_steps where breakdown_id = $1::uuid`, [
        breakdownId,
      ]);

      // Defensive ordering guard: the helper is canonical, but assert the 9-step
      // order before persisting so a step can never be written out of order.
      assertCanonicalOrder(result.steps);

      for (const step of result.steps) {
        await client.query(
          `insert into public.costing_waterfall_steps
             (breakdown_id, step_index, step_name, value_eur, delta_pct)
           values ($1::uuid, $2::int, $3, $4::numeric, $5::numeric)`,
          [breakdownId, step.stepIndex, step.stepName, step.valueEur, step.deltaPct],
        );
      }

      return {
        ok: true as const,
        data: {
          breakdownId,
          productCode: input.productCode,
          scenario: input.scenario,
          rawCostEur: result.rawCostEur,
          marginPct: result.marginPct,
          targetPriceEur: result.targetPriceEur,
          status: result.status,
          warn: result.warn,
          steps: result.steps,
        },
      };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23503') {
      // FK violation (product_code not in this org's products under RLS).
      return { ok: false, error: 'not_found' };
    }
    console.error('[computeCosting] persistence_failed', {
      productCode: input.productCode,
      scenario: input.scenario,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function computeAndSaveInitialBreakdown(raw: unknown): Promise<ComputeCostingResult> {
  const parsed = InitialInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  try {
    const bootstrap = await withOrgContext(async ({ client }) => {
      const result = await client.query<InitialBreakdownRow>(
        `with current_recipe as (
           select
             f.product_code,
             fv.id as version_id,
             coalesce(nullif(fv.target_yield_pct, 0), 100)::numeric as yield_pct,
             fv.target_price_eur
           from public.formulations f
           join public.formulation_versions fv on fv.id = f.current_version_id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
          limit 1
         ),
         ingredient_costs as (
           select
             cr.product_code,
             cr.yield_pct,
             cr.target_price_eur,
             count(fi.version_id)::text as ingredient_count,
             count(*) filter (where fi.cost_per_kg_eur is null or fi.pct is null)::text as missing_cost_count,
             coalesce(sum((fi.pct::numeric / 100) * fi.cost_per_kg_eur::numeric), 0)::numeric as raw_cost_eur
           from current_recipe cr
           left join public.formulation_ingredients fi on fi.version_id = cr.version_id
          group by cr.product_code, cr.yield_pct, cr.target_price_eur
         )
         select
           product_code,
           ingredient_count,
           missing_cost_count,
           raw_cost_eur::text,
           yield_pct::text,
           case
             when target_price_eur is not null and target_price_eur > 0
               then (100 * (1 - ((raw_cost_eur * 100 / yield_pct) / target_price_eur)))::text
             else '20'
           end as margin_pct
         from ingredient_costs`,
        [parsed.data.projectId],
      );
      return result.rows[0] ?? null;
    });

    if (!bootstrap?.product_code) return { ok: false, error: 'not_found' };
    if (bootstrap.ingredient_count === '0' || bootstrap.missing_cost_count !== '0') {
      return { ok: false, error: 'invalid_input', message: 'current formulation has no complete ingredient costs' };
    }

    return await computeCosting({
      productCode: bootstrap.product_code,
      scenario: 'target',
      params: {
        rawCostEur: bootstrap.raw_cost_eur ?? '0',
        yieldPct: bootstrap.yield_pct,
        processLabourEur: '0',
        packagingEur: '0',
        overheadEur: '0',
        logisticsEur: '0',
        marginPct: bootstrap.margin_pct,
        distributorMarkupPct: '0',
        retailMarkupPct: '0',
      },
    });
  } catch (err) {
    console.error('[computeAndSaveInitialBreakdown] persistence_failed', {
      projectId: parsed.data.projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Resolve the warn-threshold percent (as a decimal string) from a row. */
function resolveThreshold(
  row: { value_int: number | null; value_text: string | null } | undefined,
): string | undefined {
  if (!row) return undefined;
  if (row.value_int !== null && row.value_int !== undefined) return String(row.value_int);
  if (row.value_text !== null && row.value_text !== undefined && /^-?\d+(\.\d+)?$/.test(row.value_text.trim())) {
    return row.value_text.trim();
  }
  return undefined;
}

/** Throw if the steps are not the canonical, ordered 9-step §17.11.3 set. */
function assertCanonicalOrder(steps: WaterfallResult['steps']): void {
  if (steps.length !== COSTING_WATERFALL_STEP_NAMES.length) {
    throw new Error(`computeCosting: expected 9 steps, got ${steps.length}`);
  }
  steps.forEach((step, idx) => {
    if (step.stepIndex !== idx + 1 || step.stepName !== COSTING_WATERFALL_STEP_NAMES[idx]) {
      throw new Error(
        `computeCosting: step out of canonical order at index ${idx}: ${step.stepIndex}/${step.stepName}`,
      );
    }
  });
}
