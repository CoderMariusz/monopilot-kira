/**
 * Costing stage page loader + Server Action adapters (shared by costing-nutrition merge).
 */

import { getTranslations } from 'next-intl/server';

import {
  type CostingParams,
  type CostingScreenData,
  type CostingStatus,
  type CostingWaterfallStepView,
  type CostingLabels,
  type CostEngineResult,
  type CostEngineStepKey,
  type PageState,
  type SaveScenarioCall,
  type SaveScenarioOutcome,
  type ScenarioRow,
} from '../_components/costing-screen';
import { saveCostingScenario } from '../_actions/save-scenario';
import { computeAndSaveInitialBreakdown } from '../_actions/compute';
import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { COSTING_WATERFALL_STEP_NAMES } from '../../../../../../../../lib/costing/compute-waterfall';

export type CostingLoaderResult = {
  state: PageState;
  data: CostingScreenData | null;
  canCompute: boolean;
  /**
   * W2 Gate-5b fix: the costing-INPUTS panel must render even in the 'empty'
   * state — avg batch is entered BEFORE the first successful compute, so gating
   * the panel on an existing breakdown recreated an F6.1-class deadlock.
   */
  inputs?: import('../_components/costing-screen').CostingInputsView | null;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';
const WRITE_PERMISSION = 'npd.formulation.create_draft';
const MARGIN_WARN_THRESHOLD_KEY = 'costing_margin_warn_pct';
const DEFAULT_WARN_PCT = '15';

const SCENARIO_ORDER = ['pessimistic', 'target', 'optimistic'] as const;

export const DEFAULT_COSTING_LABELS: CostingLabels = {
  title: 'Cost breakdown',
  subtitle: 'Waterfall from raw materials to final cost per pack',
  waterfallTitle: 'Cost waterfall',
  colStep: 'Step',
  colPerKg: '£/kg',
  colPerPack: '£/pack',
  colPerBatch: '£/batch',
  inputsTitle: 'Cost inputs',
  inputAvgBatch: 'Average batch',
  inputOverhead: 'Overhead per kg',
  inputLogistics: 'Logistics per box',
  inputWeeklyVolume: 'Weekly volume',
  inputRunsPerWeek: 'Runs per week',
  editInBrief: 'Edit in brief',
  saveInputs: 'Save inputs',
  savingInputs: 'Saving…',
  savedInputs: 'Inputs saved.',
  saveInputsError: 'Could not save inputs.',
  blockedTitle: 'Costing inputs required',
  blockedPrefix: 'Missing',
  notDerivable: 'Not derivable',
  marginNegativeWarn: 'Negative margin',
  marginNegativeWarnBody:
    'The computed margin is {marginPct}% — you can still save the breakdown, but review pricing and costs.',
  loading: 'Loading costing data…',
  empty: 'No costing data yet',
  emptyBody: 'Costing is computed once the formulation has ingredient costs.',
  error: 'Unable to load costing data.',
  forbidden: 'You do not have permission to view costing data.',
  computeCosting: 'Compute costing',
  recomputeCosting: 'Recompute',
  computing: 'Computing…',
  computeError: 'Could not compute the costing. Try again.',
  computeErrorNotFound: 'No formulation is available to compute costing from yet.',
  computeErrorNoCosts: 'Every ingredient needs a cost before costing can be computed.',
  computeErrorHardFail:
    'The target margin is negative — the breakdown was saved; review pricing and costs.',
  computeErrorFgNotMapped:
    'The recipe exists, but no Finished Good is linked yet — advance the project to the Packaging stage first.',
  stepLabels: {
    raw_materials: 'Raw materials',
    yield_loss: 'Yield loss',
    process_labour: 'Process labour',
    setup: 'Setup',
    packaging: 'Packaging',
    overhead: 'Overhead',
    logistics: 'Logistics',
    total: 'Total cost',
    margin: 'Margin vs target price',
  },
};

const LABEL_KEYS = Object.keys(DEFAULT_COSTING_LABELS) as Array<keyof CostingLabels>;

function translateLabel(t: (key: string) => string, key: keyof CostingLabels): string {
  const fallback = DEFAULT_COSTING_LABELS[key];
  if (typeof fallback !== 'string') return '';
  try {
    const value = t(key);
    // next-intl returns the FULL namespaced key for a missing message.
    return !value || value === key || value.includes('npd.costing') ? fallback : value;
  } catch {
    return fallback;
  }
}

export async function buildCostingLabels(locale: string): Promise<CostingLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.costing' });
    return LABEL_KEYS.reduce((labels, key) => {
      const fallback = DEFAULT_COSTING_LABELS[key];
      if (typeof fallback === 'string') {
        labels[key] = translateLabel(t, key) as never;
      } else if (key === 'stepLabels') {
        // Translate the nested step labels via step_<snake> keys (4-locale JSONs).
        const stepFallback = fallback as Record<string, string>;
        const translated: Record<string, string> = {};
        for (const [stepKey, stepDefault] of Object.entries(stepFallback)) {
          const msgKey = 'step_' + stepKey.replace(/[A-Z]/g, (ch) => '_' + ch.toLowerCase());
          try {
            const value = t(msgKey);
            translated[stepKey] =
              !value || value === msgKey || value.includes('npd.costing') ? stepDefault : value;
          } catch {
            translated[stepKey] = stepDefault;
          }
        }
        labels[key] = translated as never;
      } else {
        labels[key] = fallback as never;
      }
      return labels;
    }, {} as CostingLabels);
  } catch {
    return { ...DEFAULT_COSTING_LABELS };
  }
}

const SCALE = 4n;
const FACTOR = 10n ** SCALE;

function parseDec(value: string): bigint {
  const trimmed = (value ?? '0').trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [int, fracRaw = ''] = unsigned.split('.');
  const frac = fracRaw.slice(0, Number(SCALE)).padEnd(Number(SCALE), '0');
  const scaled = BigInt(int + frac);
  return negative ? -scaled : scaled;
}

function formatDec(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const int = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(Number(SCALE), '0');
  return `${negative && scaled !== 0n ? '-' : ''}${int}.${frac}`;
}

type BreakdownRow = {
  id: string;
  scenario: string;
  raw_cost_eur: string;
  margin_pct: string;
  target_price_eur: string;
  params: (CostingParams & {
    units?: {
      packWeightKg?: string | null;
      packsPerCase?: string | number | null;
      avgBatchQty?: string | null;
      fgBaseUom?: string | null;
      packsPerBatch?: string | null;
    };
    missing?: string[];
  }) | null;
};

type StepRow = {
  breakdown_id: string;
  step_index: number;
  step_name: string;
  value_eur: string;
  delta_pct: string | null;
};

function resolveWarnPct(row: { value_int: number | null; value_text: string | null } | undefined): string {
  if (!row) return DEFAULT_WARN_PCT;
  if (row.value_int !== null && row.value_int !== undefined) return String(row.value_int);
  if (row.value_text && /^-?\d+(\.\d+)?$/.test(row.value_text.trim())) return row.value_text.trim();
  return DEFAULT_WARN_PCT;
}

function marginStatus(marginPct: string, warnPct: string): CostingStatus {
  const margin = parseDec(marginPct);
  if (margin < 0n) return 'fail';
  return margin < parseDec(warnPct) ? 'warn' : 'ok';
}

function scenarioDisplayName(scenario: string): string {
  switch (scenario) {
    case 'pessimistic':
      return 'Pessimistic (promo)';
    case 'target':
      return 'Target';
    case 'optimistic':
      return 'Optimistic';
    default:
      return scenario;
  }
}

function scenarioRank(scenario: string): number {
  const idx = (SCENARIO_ORDER as readonly string[]).indexOf(scenario);
  return idx === -1 ? SCENARIO_ORDER.length + 1 : idx;
}

function deriveParamsFallback(b: BreakdownRow): CostingParams {
  return {
    rawCostEur: b.raw_cost_eur,
    yieldPct: '100',
    processLabourEur: '0',
    packagingEur: '0',
    overheadEur: '0',
    logisticsEur: '0',
    marginPct: b.margin_pct,
    distributorMarkupPct: '0',
    retailMarkupPct: '0',
  };
}

function stepKey(stepName: string): CostEngineStepKey | null {
  switch (stepName) {
    case 'Raw materials':
      return 'raw_materials';
    case 'Yield loss':
      return 'yield_loss';
    case 'Process labour':
      return 'process_labour';
    case 'Setup':
      return 'setup';
    case 'Packaging':
      return 'packaging';
    case 'Overhead':
      return 'overhead';
    case 'Logistics':
      return 'logistics';
    case 'Total cost':
      return 'total';
    case 'Margin vs target price':
      return 'margin';
    default:
      return null;
  }
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function engineResultFromRows(
  primary: BreakdownRow,
  rows: StepRow[],
  warnPct: string,
): CostEngineResult {
  const units = primary.params?.units;
  return {
    status: marginStatus(primary.margin_pct, warnPct) === 'fail' ? 'fail' : 'ok',
    missing: primary.params?.missing ?? [],
    steps: rows.flatMap((row) => {
      const key = stepKey(row.step_name);
      return key ? [{ key, valuePerPackEur: row.value_eur }] : [];
    }),
    units: {
      packWeightKg: units?.packWeightKg ?? null,
      packsPerCase: toNullableNumber(units?.packsPerCase),
      avgBatchQty: units?.avgBatchQty ?? null,
      fgBaseUom: units?.fgBaseUom ?? null,
      packsPerBatch: units?.packsPerBatch ?? null,
    },
  };
}


async function readCostingInputsView(
  ctx: OrgContextLike,
  projectId: string,
): Promise<import('../_components/costing-screen').CostingInputsView | null> {
  const { rows } = await ctx.client.query<{
    avg_batch_qty: string | null;
    overhead_override: string | null;
    logistics_override: string | null;
    weekly_volume_packs: string | null;
    runs_per_week: string | null;
    org_overhead: string | null;
    org_logistics: string | null;
    fg_base_uom: string | null;
  }>(
    `select p.avg_batch_qty::text as avg_batch_qty,
            p.overhead_per_kg_override::text as overhead_override,
            p.logistics_per_box_override::text as logistics_override,
            p.weekly_volume_packs::text as weekly_volume_packs,
            p.runs_per_week::text as runs_per_week,
            cp.overhead_per_kg::text as org_overhead,
            cp.logistics_per_box::text as org_logistics,
            coalesce(i.uom_base, i.output_uom) as fg_base_uom
       from public.npd_projects p
       left join public.org_npd_cost_params cp on cp.org_id = p.org_id
       left join public.items i
         on i.org_id = p.org_id
        and i.item_code = p.product_code
      where p.id = $1::uuid
        and p.org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    avgBatchQty: row.avg_batch_qty ?? '',
    fgBaseUom: row.fg_base_uom ?? 'kg',
    overheadPerKgOverride: row.overhead_override ?? '',
    logisticsPerBoxOverride: row.logistics_override ?? '',
    orgOverheadPerKg: row.org_overhead ?? '0',
    orgLogisticsPerBox: row.org_logistics ?? '0',
    weeklyVolumePacks: row.weekly_volume_packs,
    runsPerWeek: row.runs_per_week,
  };
}

export async function readCostingPageData(projectId: string): Promise<CostingLoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<CostingLoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null, canCompute: false };
      }

      const canCompute = await hasPermission(ctx, WRITE_PERMISSION);

      const project = await ctx.client.query<{ product_code: string | null; product_name: string | null }>(
        `select p.product_code,
                pr.product_name
           from public.npd_projects p
           left join public.product pr
             on pr.org_id = p.org_id
            and pr.product_code = p.product_code
          where p.id = $1::uuid
            and p.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const productCode = project.rows[0]?.product_code;
      if (!productCode) {
        return { state: 'empty', data: null, canCompute, inputs: await readCostingInputsView(ctx, projectId) };
      }
      const productName = project.rows[0]?.product_name ?? productCode;

      const thr = await ctx.client.query<{ value_int: number | null; value_text: string | null }>(
        `select value_int, value_text
           from "Reference"."AlertThresholds"
          where threshold_key = $1`,
        [MARGIN_WARN_THRESHOLD_KEY],
      );
      const warnPct = resolveWarnPct(thr.rows[0]);

      const breakdowns = await ctx.client.query<BreakdownRow>(
        `select id,
                scenario,
                raw_cost_eur::text     as raw_cost_eur,
                margin_pct::text       as margin_pct,
                target_price_eur::text as target_price_eur,
                params
           from public.costing_breakdowns
          where org_id = app.current_org_id()
            and product_code = $1`,
        [productCode],
      );

      if (breakdowns.rows.length === 0) {
        return { state: 'empty', data: null, canCompute, inputs: await readCostingInputsView(ctx, projectId) };
      }

      const ids = breakdowns.rows.map((b) => b.id);
      const steps = await ctx.client.query<StepRow>(
        `select breakdown_id,
                step_index,
                step_name,
                value_eur::text as value_eur,
                delta_pct::text as delta_pct
           from public.costing_waterfall_steps
          where breakdown_id = any($1::uuid[])
          order by step_index asc`,
        [ids],
      );

      const byScenario = new Map(breakdowns.rows.map((b) => [b.scenario, b]));
      const primary =
        byScenario.get('target') ??
        SCENARIO_ORDER.map((s) => byScenario.get(s)).find(Boolean) ??
        breakdowns.rows[0]!;

      const primarySteps = steps.rows
        .filter((s) => s.breakdown_id === primary.id)
        .sort((a, b) => a.step_index - b.step_index);

      const stepViews: CostingWaterfallStepView[] = primarySteps.map((s) => ({
        stepIndex: s.step_index,
        stepName: s.step_name,
        label: s.step_name,
        valueEur: s.value_eur,
        deltaPct: s.delta_pct,
      }));

      const cogsIndex = COSTING_WATERFALL_STEP_NAMES.indexOf('Logistics') + 1;

      const scenarioRows: ScenarioRow[] = breakdowns.rows
        .map((b): ScenarioRow => {
          const bSteps = steps.rows.filter((s) => s.breakdown_id === b.id);
          const cogs = bSteps.find((s) => s.step_index === cogsIndex)?.value_eur ?? b.raw_cost_eur;
          const revenue = b.target_price_eur;
          const marginEur = formatDec(parseDec(revenue) - parseDec(cogs));
          return {
            scenario: b.scenario,
            name: scenarioDisplayName(b.scenario),
            targetPriceEur: revenue,
            costEur: cogs,
            marginEur,
            marginPct: b.margin_pct,
            status: marginStatus(b.margin_pct, warnPct),
          };
        })
        .sort((a, b) => scenarioRank(a.scenario) - scenarioRank(b.scenario));

      const currentParams: CostingParams = primary.params ?? deriveParamsFallback(primary);

      return {
        state: 'ready',
        inputs: await readCostingInputsView(ctx, projectId),
        data: {
          productCode,
          projectId,
          productName,
          marginWarnThresholdPct: warnPct,
          steps: stepViews,
          scenarios: scenarioRows,
          currentParams,
          engineResult: engineResultFromRows(primary, primarySteps, warnPct),
        },
        canCompute,
      };
    });
  } catch (error) {
    console.error('[costing] org-scoped read failed:', error);
    return { state: 'error', data: null, canCompute: false };
  }
}

export async function saveCostingScenarioAction(call: SaveScenarioCall): Promise<SaveScenarioOutcome> {
  'use server';
  const result = await saveCostingScenario(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function computeCostingAction(call: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string; message?: string; marginNegative?: boolean }> {
  'use server';
  const result = await computeAndSaveInitialBreakdown(call);
  if (result.ok) {
    return {
      ok: true,
      marginNegative: result.data.status === 'fail',
    };
  }
  return { ok: false, error: result.error, message: result.message };
}
