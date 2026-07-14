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

import { Dec } from '@monopilot/domain';

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
  type NpdWipComponentInput,
  type WaterfallResult,
} from '../../../../../../../../lib/costing/compute-waterfall';
import { computeWipUnitCost } from '../../../../../../../../lib/npd/wip-cost';

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
  wip_definition_id: string | null;
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

type WipComponentCostRow = {
  wip_definition_id: string;
  wip_item_id: string | null;
  qty_kg: string | null;
  yield_pct: string;
  raw_material_cost_per_output_unit: string;
  composition_missing_cost: boolean;
};

type WipProcessRow = ProcessRow & {
  wip_definition_id: string;
  wip_item_id: string | null;
};

type QueryClientLike = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
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

      const [ingredients, packaging, processes, threshold, wipCosts, wipProcesses] = await Promise.all([
        client.query<IngredientRow>(
          `select rm_code,
                  qty_kg::text as qty_kg,
                  pct::text as pct,
                  cost_per_kg_eur::text as cost_per_kg_eur,
                  wip_definition_id::text as wip_definition_id
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
        loadFgProcesses(client, recipe.product_code),
        client.query<{ value_int: number | null; value_text: string | null }>(
          `select value_int, value_text
             from "Reference"."AlertThresholds"
            where threshold_key = $1`,
          [MARGIN_WARN_THRESHOLD_KEY],
        ),
        loadWipComponentCosts(client, recipe.version_id),
        loadWipProcesses(client, recipe.version_id),
      ]);
      if (wipCosts.rows.some((row) => row.composition_missing_cost)) {
        return { ok: false as const, error: 'ingredient_costs_missing' as const };
      }

      const input: NpdCostEngineInput = {
        ingredients: ingredients.rows.filter((row) => !row.wip_definition_id).map((row) => ({
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
        wipComponents: buildWipComponents(wipCosts.rows, wipProcesses.rows),
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

      // Persist each WIP's own unit cost onto item_cost_history so roll-ups via
      // v_item_effective_cost see a non-null amount (no longer discarded).
      await persistWipUnitCosts({
        client,
        userId,
        costRows: wipCosts.rows,
        processRows: wipProcesses.rows,
      });

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

// ── W1-T2 — shared FG process cost (roles×headcount×rate) ────────────────────

const ProcessCostInput = z.object({ projectId: z.string().uuid() });

export type ProjectProcessCostData = {
  /** Number of npd_wip_processes attached to the project's FG prod_detail. */
  processCount: number;
  /** Σ real process labour cost PER PACK (engine `processLabourEur`), 4 dp. */
  processCostPerPackEur: string;
  /** Σ real process labour cost PER KG (perPack / packWeightKg), 4 dp. */
  processCostPerKgEur: string;
};

export type GetProjectProcessCostResult =
  | { ok: true; data: ProjectProcessCostData }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed'; message?: string };

const ZERO_PROCESS_COST: ProjectProcessCostData = {
  processCount: 0,
  processCostPerPackEur: '0.0000',
  processCostPerKgEur: '0.0000',
};

/**
 * W1-T2 — Σ real process cost for a project's FG, shared with the formulation
 * live panel. Loads the SAME npd_wip_processes rows as
 * `computeAndSaveInitialBreakdown` (via `loadFgProcesses`) and isolates the
 * labour term by running `computeNpdCostEngine` with neutral inputs — the
 * roles×headcount×rate math is NOT re-implemented here.
 *
 * `processCount === 0` (including no FG mapped yet) is a SUCCESS: the caller
 * falls back to the % placeholder mode.
 */
export async function getProjectProcessCost(raw: unknown): Promise<GetProjectProcessCostResult> {
  const parsed = ProcessCostInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  try {
    return await withOrgContext(async ({ orgId, userId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, 'npd.costing'))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const project = await client.query<{
        product_code: string | null;
        pack_weight_kg: string | null;
        avg_batch_qty: string | null;
        fg_base_uom: string | null;
      }>(
        `select coalesce(f.product_code, p.product_code) as product_code,
                (p.pack_weight_g / 1000)::text as pack_weight_kg,
                p.avg_batch_qty::text as avg_batch_qty,
                coalesce(i.uom_base, i.output_uom, 'kg') as fg_base_uom
           from public.npd_projects p
           left join public.formulations f
             on f.project_id = p.id
            and f.org_id = p.org_id
           left join public.items i
             on i.org_id = p.org_id
            and i.item_code = coalesce(f.product_code, p.product_code)
          where p.id = $1::uuid
            and p.org_id = app.current_org_id()
          limit 1`,
        [parsed.data.projectId],
      );
      const row = project.rows[0] ?? null;
      if (!row) return { ok: false as const, error: 'not_found' as const };
      if (!row.product_code) return { ok: true as const, data: ZERO_PROCESS_COST };

      const processes = groupProcesses((await loadFgProcesses(client, row.product_code)).rows);
      if (processes.length === 0) return { ok: true as const, data: ZERO_PROCESS_COST };

      // Neutral inputs: only `processes`, packWeightKg, avgBatchQty and fgBaseUom
      // feed the labour term; everything else zeroes the other waterfall steps.
      const result = computeNpdCostEngine({
        ingredients: [],
        yieldPct: '100',
        packWeightKg: row.pack_weight_kg,
        packsPerCase: '1',
        avgBatchQty: row.avg_batch_qty,
        fgBaseUom: row.fg_base_uom,
        weeklyVolumePacks: '1',
        runsPerWeek: '1',
        targetPriceEur: '0',
        packagingComponents: [],
        processes,
        overheadPerKg: '0',
        logisticsPerBox: '0',
      });
      const perPack = result.params.processLabourEur;
      const hasPackWeight = row.pack_weight_kg !== null && decimalGt(row.pack_weight_kg, '0');
      // ponytail: without a pack weight the per-kg basis is undefined — per-pack
      // is the best-effort figure (kg-throughput processes already yield 0 then).
      const perKg = hasPackWeight
        ? Dec.from(perPack).div(Dec.from(row.pack_weight_kg)).toFixed(4)
        : perPack;

      return {
        ok: true as const,
        data: {
          processCount: processes.length,
          processCostPerPackEur: perPack,
          processCostPerKgEur: perKg,
        },
      };
    });
  } catch (err) {
    console.error('[getProjectProcessCost] failed', {
      projectId: parsed.data.projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * FG process rows (roles×headcount×rate inputs) — extracted VERBATIM from the
 * `computeAndSaveInitialBreakdown` bootstrap so the formulation live panel and
 * the costing screen read the exact same rows (W1-T2). No logic change.
 */
function loadFgProcesses(
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> },
  productCode: string,
): Promise<{ rows: ProcessRow[] }> {
  return client.query<ProcessRow>(
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
    [productCode],
  );
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

function buildWipComponents(costRows: WipComponentCostRow[], processRows: WipProcessRow[]): NpdWipComponentInput[] {
  const groupedProcesses = groupWipProcesses(processRows);

  return costRows.map((row) => ({
    quantity: row.qty_kg ?? '0',
    quantityUom: 'kg',
    rawMaterialCostPerOutputUnit: row.raw_material_cost_per_output_unit,
    yieldPct: row.yield_pct,
    processes: groupedProcesses.get(row.wip_definition_id) ?? [],
    wipDefinitionId: row.wip_definition_id,
    wipItemId: row.wip_item_id ?? undefined,
  }));
}

function groupWipProcesses(rows: WipProcessRow[]): Map<string, NpdCostProcessInput[]> {
  const byDefinition = new Map<string, WipProcessRow[]>();
  for (const row of rows) {
    const list = byDefinition.get(row.wip_definition_id) ?? [];
    list.push(row);
    byDefinition.set(row.wip_definition_id, list);
  }
  const result = new Map<string, NpdCostProcessInput[]>();
  for (const [definitionId, definitionRows] of byDefinition) {
    result.set(definitionId, groupProcesses(definitionRows));
  }
  return result;
}

/**
 * Material cost for each WIP formulation line. Prefer the WIP item's ACTIVE BOM
 * (loadWipSubBom pattern); fall back to wip_definition_ingredients when no BOM.
 */
function loadWipComponentCosts(
  client: QueryClientLike,
  versionId: string,
): Promise<{ rows: WipComponentCostRow[] }> {
  return client.query<WipComponentCostRow>(
    `with formulation_wips as (
       select fi.id as fi_id,
              fi.wip_definition_id,
              fi.qty_kg,
              fi.sequence,
              wd.item_id as wip_item_id,
              wd.yield_pct
         from public.formulation_ingredients fi
         join public.wip_definitions wd
           on wd.id = fi.wip_definition_id
          and wd.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
          and fi.wip_definition_id is not null
     ),
     bom_materials as (
       select fw.fi_id,
              coalesce(sum(bl.quantity * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where bl.id is not null) as missing_cost,
              count(bl.id) > 0 as has_lines
         from formulation_wips fw
         left join public.bom_headers bh
           on bh.org_id = app.current_org_id()
          and bh.item_id = fw.wip_item_id
          and bh.status = 'active'
         left join public.bom_lines bl
           on bl.org_id = bh.org_id
          and bl.bom_header_id = bh.id
         left join public.items ci
           on ci.org_id = app.current_org_id()
          and (
            (bl.item_id is not null and ci.id = bl.item_id)
            or (bl.item_id is null and ci.item_code = bl.component_code)
          )
         left join public.v_item_effective_cost vec
           on vec.org_id = ci.org_id
          and vec.item_id = ci.id
        group by fw.fi_id
     ),
     definition_materials as (
       select fw.fi_id,
              coalesce(sum(wdi.qty_per_unit * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where wdi.id is not null) as missing_cost,
              count(wdi.id) > 0 as has_lines
         from formulation_wips fw
         left join public.wip_definition_ingredients wdi
           on wdi.org_id = app.current_org_id()
          and wdi.wip_definition_id = fw.wip_definition_id
         left join public.v_item_effective_cost vec
           on vec.org_id = wdi.org_id
          and vec.item_id = wdi.item_id
        group by fw.fi_id
     )
     select fw.wip_definition_id::text as wip_definition_id,
            fw.wip_item_id::text as wip_item_id,
            fw.qty_kg::text as qty_kg,
            fw.yield_pct::text as yield_pct,
            case when coalesce(bm.has_lines, false)
                 then bm.material_cost
                 else coalesce(dm.material_cost, 0)
            end::text as raw_material_cost_per_output_unit,
            case when coalesce(bm.has_lines, false)
                 then coalesce(bm.missing_cost, false)
                 when coalesce(dm.has_lines, false)
                 then coalesce(dm.missing_cost, false)
                 else false
            end as composition_missing_cost
       from formulation_wips fw
       left join bom_materials bm on bm.fi_id = fw.fi_id
       left join definition_materials dm on dm.fi_id = fw.fi_id
      order by fw.sequence, fw.wip_definition_id`,
    [versionId],
  );
}

/**
 * Labour inputs for each WIP — prefer npd_wip_processes linked by wip_item_id
 * (or wip_definition_id); fall back to wip_definition_processes when none.
 */
function loadWipProcesses(
  client: QueryClientLike,
  versionId: string,
): Promise<{ rows: WipProcessRow[] }> {
  return client.query<WipProcessRow>(
    `with formulation_wips as (
       select distinct fi.wip_definition_id, wd.item_id as wip_item_id
         from public.formulation_ingredients fi
         join public.wip_definitions wd
           on wd.id = fi.wip_definition_id
          and wd.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
          and fi.wip_definition_id is not null
     ),
     npd_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              fw.wip_item_id::text as wip_item_id,
              wp.id::text as process_id,
              wp.duration_hours::text as duration_hours,
              wp.additional_cost::text as additional_cost,
              wp.throughput_per_hour::text as throughput_per_hour,
              wp.throughput_uom::text as throughput_uom,
              wp.setup_cost::text as setup_cost,
              coalesce(wpr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wpr.headcount::text as headcount,
              wp.display_order,
              wpr.role_group
         from formulation_wips fw
         join public.npd_wip_processes wp
           on wp.org_id = app.current_org_id()
          and (
            (fw.wip_item_id is not null and wp.wip_item_id = fw.wip_item_id)
            or wp.wip_definition_id = fw.wip_definition_id
          )
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
     ),
     definition_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              fw.wip_item_id::text as wip_item_id,
              wdp.id::text as process_id,
              wdp.duration_hours::text as duration_hours,
              wdp.additional_cost::text as additional_cost,
              wdp.throughput_per_hour::text as throughput_per_hour,
              wdp.throughput_uom::text as throughput_uom,
              wdp.setup_cost::text as setup_cost,
              coalesce(wdr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wdr.headcount::text as headcount,
              wdp.display_order,
              wdr.role_group
         from formulation_wips fw
         join public.wip_definition_processes wdp
           on wdp.org_id = app.current_org_id()
          and wdp.wip_definition_id = fw.wip_definition_id
         left join public.wip_definition_roles wdr
           on wdr.org_id = wdp.org_id
          and wdr.process_id = wdp.id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = wdp.org_id
              and lr.role_group = wdr.role_group
            order by lr.effective_from desc
            limit 1
         ) lr on true
        where not exists (
          select 1 from npd_rows nr where nr.wip_definition_id = fw.wip_definition_id::text
        )
     )
     select wip_definition_id, wip_item_id, process_id, duration_hours, additional_cost,
            throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
       from (
         select *, 1 as src from npd_rows
         union all
         select *, 2 as src from definition_rows
       ) combined
      order by wip_definition_id, src, display_order, role_group`,
    [versionId],
  );
}

/**
 * Idempotent write of a WIP's own unit cost to item_cost_history (source =
 * variance_roll so V-TEC-53 is not blocked). Skips when the open row already
 * matches. Also denormalizes items.cost_per_kg.
 */
async function persistWipUnitCosts(input: {
  client: QueryClientLike;
  userId: string;
  costRows: WipComponentCostRow[];
  processRows: WipProcessRow[];
}): Promise<void> {
  const processesByDefinition = groupWipProcesses(input.processRows);

  for (const row of input.costRows) {
    const wipItemId = row.wip_item_id;
    if (!wipItemId) continue;

    const processes = processesByDefinition.get(row.wip_definition_id) ?? [];
    const unitCost = computeWipUnitCost({
      materials: [{ qtyPerUnit: 1, unitCost: Number(row.raw_material_cost_per_output_unit) }],
      processes: processes.map((process) => ({
        roles: process.roles.map((role) => ({
          rolePerHour: Number(role.ratePerHour ?? 0),
          headcount: Number(role.headcount ?? 0),
        })),
        durationHours: Number(process.durationHours ?? 0),
        additionalCost: Number(process.additionalCost ?? 0),
      })),
      yieldPct: Number(row.yield_pct),
    });
    const costPerKg = unitCost.toFixed(4);

    const current = await input.client.query<{ cost_per_kg: string | null }>(
      `select ch.cost_per_kg::text as cost_per_kg
         from public.item_cost_history ch
        where ch.org_id = app.current_org_id()
          and ch.item_id = $1::uuid
          and ch.effective_to is null
        order by ch.effective_from desc
        limit 1`,
      [wipItemId],
    );
    if (current.rows[0]?.cost_per_kg === costPerKg) continue;

    await input.client.query(
      `update public.item_cost_history
          set effective_to = greatest((current_date - interval '1 day')::date, effective_from)
        where org_id = app.current_org_id()
          and item_id = $1::uuid
          and effective_to is null`,
      [wipItemId],
    );
    await input.client.query(
      `insert into public.item_cost_history
         (org_id, item_id, cost_per_kg, currency, effective_from, source, created_by)
       values
         (app.current_org_id(), $1::uuid, $2::numeric, 'GBP', current_date, 'variance_roll', $3::uuid)`,
      [wipItemId, costPerKg, input.userId],
    );
    await input.client.query(
      `update public.items
          set cost_per_kg = $2::numeric
        where org_id = app.current_org_id()
          and id = $1::uuid
          and cost_per_kg is distinct from $2::numeric`,
      [wipItemId, costPerKg],
    );
  }
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
