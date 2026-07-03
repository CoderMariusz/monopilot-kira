'use server';

/**
 * T-073 — `computeCosting` Server Action (§17.11.3).
 *
 * Computes the deterministic 9-step costing waterfall (pure helper) and UPSERTs
 * the breakdown and REPLACES its waterfall steps inside a single org-scoped
 * transaction. Negative margins persist with status 'fail' (D10 — UI warning only).
 *
 * Red lines honoured:
 *   - Money stays NUMERIC-exact: the pure helper returns decimal STRINGS and we
 *     bind them straight into NUMERIC columns ($n::numeric). No Number() / float.
 *   - Margin warn threshold is READ from Reference.AlertThresholds
 *     (`costing_margin_warn_pct`) — never hardcoded.
 *   - Hard fail (margin < 0%) persists with status 'fail'; UI shows a warning (D10).
 *   - org scope via withOrgContext -> app.set_org_context -> RLS
 *     (org_id = app.current_org_id()). No tenant_id / current_setting.
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  COSTING_WATERFALL_STEP_NAMES,
  computeNpdCostEngine,
  computeWaterfall,
  decimalGt,
  decimalLt,
  decimalLte,
  type CostingErrorCode,
  type NpdCostEngineInput,
  type NpdCostProcessInput,
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
  /**
   * A formulation EXISTS (locked or not) but no FG product is mapped yet —
   * npd_projects.product_code AND formulations.product_code are both NULL (the FG
   * candidate is only created when the project enters the packaging stage).
   * Distinct from `not_found` so the UI stops claiming "no formulation available"
   * on a project that has a locked v1 (live clickthrough §3).
   */
  | 'fg_not_mapped'
  | CostingErrorCode
  | 'forbidden'
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
        units: WaterfallResult['units'];
        missing: WaterfallResult['missing'];
        legacyDurationBasis: boolean;
      };
    }
  | { ok: false; error: ComputeCostingError; message?: string };

const MARGIN_WARN_THRESHOLD_KEY = 'costing_margin_warn_pct';

type InitialBreakdownRow = {
  product_code: string | null;
  version_id: string;
  target_yield_pct: string | null;
  target_price_eur: string | null;
  pack_weight_kg: string | null;
  packs_per_case: string | null;
  weekly_volume_packs: string | null;
  runs_per_week: string | null;
  avg_batch_qty: string | null;
  fg_base_uom: string | null;
  overhead_per_kg: string | null;
  logistics_per_box: string | null;
};

type IngredientRow = {
  rm_code: string;
  qty_kg: string | null;
  pct: string | null;
  cost_per_kg_eur: string | null;
};

type PackagingRow = {
  qty_per_box: string | null;
  cost_per_unit: string | null;
  waste_pct: string | null;
};

type ProcessRow = {
  process_id: string;
  duration_hours: string | null;
  additional_cost: string | null;
  throughput_per_hour: string | null;
  throughput_uom: string | null;
  setup_cost: string | null;
  rate_per_hour: string | null;
  headcount: string | null;
};

export async function computeCosting(raw: unknown): Promise<ComputeCostingResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ orgId, userId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, 'npd.costing'))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

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

      // 3) Negative margin is advisory (D10): persist the breakdown and surface a
      //    warning in the UI — only genuine validation errors block the commit.

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
          units: result.units,
          missing: result.missing,
          legacyDurationBasis: result.legacyDurationBasis,
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
    return await withOrgContext(async ({ orgId, userId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, 'npd.costing'))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const bootstrap = await client.query<InitialBreakdownRow>(
        `select
            coalesce(f.product_code, p.product_code) as product_code,
            fv.id::text as version_id,
            fv.target_yield_pct::text as target_yield_pct,
            coalesce(fv.target_price_eur, p.target_retail_price_eur)::text as target_price_eur,
            (p.pack_weight_g / 1000)::text as pack_weight_kg,
            p.packs_per_case::text as packs_per_case,
            p.weekly_volume_packs::text as weekly_volume_packs,
            p.runs_per_week::text as runs_per_week,
            p.avg_batch_qty::text as avg_batch_qty,
            coalesce(i.uom_base, i.output_uom, 'kg') as fg_base_uom,
            coalesce(p.overhead_per_kg_override, cp.overhead_per_kg, 0)::text as overhead_per_kg,
            coalesce(p.logistics_per_box_override, cp.logistics_per_box, 0)::text as logistics_per_box
           from public.formulations f
           join public.npd_projects p
             on p.id = f.project_id
            and p.org_id = f.org_id
           join public.formulation_versions fv on fv.id = f.current_version_id
           left join public.items i
             on i.org_id = p.org_id
            and i.item_code = coalesce(f.product_code, p.product_code)
           left join public.org_npd_cost_params cp
             on cp.org_id = p.org_id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
          limit 1`,
        [parsed.data.projectId],
      );
      const recipe = bootstrap.rows[0] ?? null;
      if (!recipe) return { ok: false as const, error: 'not_found' as const };
      if (!recipe.product_code) return { ok: false as const, error: 'fg_not_mapped' as const };

      const [ingredients, packaging, processes, threshold] = await Promise.all([
        client.query<IngredientRow>(
          `select rm_code,
                  qty_kg::text as qty_kg,
                  pct::text as pct,
                  cost_per_kg_eur::text as cost_per_kg_eur
             from public.formulation_ingredients
            where version_id = $1::uuid
            order by sequence, rm_code`,
          [recipe.version_id],
        ),
        client.query<PackagingRow>(
          `select qty_per_pack::text as qty_per_box,
                  cost_per_unit::text as cost_per_unit,
                  waste_pct::text as waste_pct
             from public.packaging_components
            where project_id = $1::uuid
              and org_id = app.current_org_id()
            order by display_order, component_name`,
          [parsed.data.projectId],
        ),
        client.query<ProcessRow>(
          `select wp.id::text as process_id,
                  wp.duration_hours::text as duration_hours,
                  wp.additional_cost::text as additional_cost,
                  wp.throughput_per_hour::text as throughput_per_hour,
                  wp.throughput_uom::text as throughput_uom,
                  wp.setup_cost::text as setup_cost,
                  coalesce(wpr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
                  wpr.headcount::text as headcount
             from public.prod_detail pd
             join public.npd_wip_processes wp
               on wp.prod_detail_id = pd.id
              and wp.org_id = pd.org_id
             left join public.npd_wip_process_roles wpr
               on wpr.process_id = wp.id
              and wpr.org_id = wp.org_id
             left join lateral (
               select rate_per_hour
                 from public.labor_rates lr
                where lr.org_id = wp.org_id
                  and lr.role_group = wpr.role_group
                order by lr.effective_from desc
                limit 1
             ) lr on true
            where pd.product_code = $1
              and pd.org_id = app.current_org_id()
            order by pd.component_index, wp.display_order, wpr.role_group`,
          [recipe.product_code],
        ),
        client.query<{ value_int: number | null; value_text: string | null }>(
          `select value_int, value_text
             from "Reference"."AlertThresholds"
            where threshold_key = $1`,
          [MARGIN_WARN_THRESHOLD_KEY],
        ),
      ]);

      const input: NpdCostEngineInput = {
        ingredients: ingredients.rows.map((row) => ({
          rmCode: row.rm_code,
          qtyKg: row.qty_kg,
          pct: row.pct,
          costPerKgEur: row.cost_per_kg_eur,
          allergensInherited: [],
        })),
        yieldPct: recipe.target_yield_pct,
        packWeightKg: recipe.pack_weight_kg,
        packsPerCase: recipe.packs_per_case,
        avgBatchQty: recipe.avg_batch_qty,
        fgBaseUom: recipe.fg_base_uom,
        weeklyVolumePacks: recipe.weekly_volume_packs,
        runsPerWeek: recipe.runs_per_week,
        targetPriceEur: recipe.target_price_eur,
        marginWarnPct: resolveThreshold(threshold.rows[0]),
        packagingComponents: packaging.rows.map((row) => ({
          qtyPerBox: row.qty_per_box,
          costPerUnit: row.cost_per_unit,
          wastePct: row.waste_pct,
        })),
        processes: groupProcesses(processes.rows),
        wipComponents: [],
        overheadPerKg: recipe.overhead_per_kg,
        logisticsPerBox: recipe.logistics_per_box,
      };
      const result = computeNpdCostEngine(input);
      if (result.missing.length > 0) {
        return { ok: false as const, error: result.missing[0]!, message: result.missing.join(',') };
      }

      const breakdownId = await persistCostingResult({
        client,
        orgId,
        productCode: recipe.product_code,
        scenario: 'target',
        result,
      });
      if (!breakdownId) return { ok: false as const, error: 'not_found' as const };

      return {
        ok: true as const,
        data: {
          breakdownId,
          productCode: recipe.product_code,
          scenario: 'target',
          rawCostEur: result.rawCostEur,
          marginPct: result.marginPct,
          targetPriceEur: result.targetPriceEur,
          status: result.status,
          warn: result.warn,
          steps: result.steps,
          units: result.units,
          missing: result.missing,
          legacyDurationBasis: result.legacyDurationBasis,
        },
      };
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

function groupProcesses(rows: ProcessRow[]): NpdCostProcessInput[] {
  const byId = new Map<string, NpdCostProcessInput>();
  for (const row of rows) {
    const existing = byId.get(row.process_id);
    const process =
      existing ??
      ({
        id: row.process_id,
        durationHours: row.duration_hours,
        additionalCost: row.additional_cost,
        throughputPerHour: row.throughput_per_hour,
        throughputUom: row.throughput_uom,
        setupCost: row.setup_cost,
        roles: [],
      } satisfies NpdCostProcessInput);
    if (!existing) byId.set(row.process_id, process);
    if (row.headcount !== null || row.rate_per_hour !== null) {
      process.roles.push({ ratePerHour: row.rate_per_hour, headcount: row.headcount });
    }
  }
  return [...byId.values()];
}

async function persistCostingResult(input: {
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> };
  orgId: string;
  productCode: string;
  scenario: string;
  result: WaterfallResult;
}): Promise<string | null> {
  const upsert = await input.client.query<{ id: string }>(
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
      input.orgId,
      input.productCode,
      input.scenario,
      input.result.rawCostEur,
      input.result.marginPct,
      input.result.targetPriceEur,
      JSON.stringify({
        ...input.result.params,
        units: input.result.units,
        missing: input.result.missing,
        legacyDurationBasis: input.result.legacyDurationBasis,
      }),
    ],
  );
  const breakdownId = upsert.rows[0]?.id ?? null;
  if (!breakdownId) return null;

  await input.client.query(`delete from public.costing_waterfall_steps where breakdown_id = $1::uuid`, [
    breakdownId,
  ]);
  assertCanonicalOrder(input.result.steps);
  for (const step of input.result.steps) {
    await input.client.query(
      `insert into public.costing_waterfall_steps
         (breakdown_id, step_index, step_name, value_eur, delta_pct)
       values ($1::uuid, $2::int, $3, $4::numeric, $5::numeric)`,
      [breakdownId, step.stepIndex, step.stepName, step.valueEur, step.deltaPct],
    );
  }
  return breakdownId;
}

/** Throw if the steps are not the canonical, ordered 9-step §17.11.3 set. */
function assertCanonicalOrder(steps: WaterfallResult['steps']): void {
  if (steps.length !== COSTING_WATERFALL_STEP_NAMES.length) {
    throw new Error(`computeCosting: expected ${COSTING_WATERFALL_STEP_NAMES.length} steps, got ${steps.length}`);
  }
  steps.forEach((step, idx) => {
    if (step.stepIndex !== idx + 1 || step.stepName !== COSTING_WATERFALL_STEP_NAMES[idx]) {
      throw new Error(
        `computeCosting: step out of canonical order at index ${idx}: ${step.stepIndex}/${step.stepName}`,
      );
    }
  });
}
