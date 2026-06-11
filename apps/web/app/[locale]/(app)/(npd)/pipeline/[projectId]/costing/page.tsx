/**
 * T-075 — Costing stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/costing
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - npd_projects.product_code        → resolve the FA candidate for [projectId]
 *   - public.costing_breakdowns        → one row per named scenario (T-070/T-073 output)
 *   - public.costing_waterfall_steps   → the 9-step waterfall per breakdown
 *   - "Reference"."AlertThresholds"    → costing_margin_warn_pct (V07 warn threshold)
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:83-163 (CostingScreen)
 *
 * Money stays NUMERIC-exact: every monetary/percent column is cast ::text in SQL
 * and carried as a decimal STRING — never coerced to a JS float anywhere in this
 * loader. Margin arithmetic (margin €, margin %) is done with exact decimal-string
 * helpers from apps/web/lib/costing/compute-waterfall.
 *
 * The Save Scenario write is owned by T-073 (saveCostingScenario) and imported,
 * never authored here. RBAC (`permission_denied`) is resolved server-side.
 */

import { getTranslations } from 'next-intl/server';

import {
  CostingScreen,
  type CostingParams,
  type CostingScreenData,
  type CostingStatus,
  type CostingWaterfallStepView,
  type CostingLabels,
  type PageState,
  type SaveScenarioCall,
  type SaveScenarioOutcome,
  type ScenarioRow,
} from './_components/costing-screen';
import { saveCostingScenario } from './_actions/save-scenario';
// C3 — compute initial breakdown (persists the `target` scenario via the waterfall).
import { computeAndSaveInitialBreakdown } from './_actions/compute';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { COSTING_WATERFALL_STEP_NAMES } from '../../../../../../../lib/costing/compute-waterfall';

export const dynamic = 'force-dynamic';

type CostingPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors fa/page.tsx + nutrition/page.tsx).
  data?: CostingScreenData | null;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LoaderResult = { state: PageState; data: CostingScreenData | null; canCompute: boolean };

const READ_PERMISSION = 'npd.fa.read';
// C3 — compute writes costing_breakdowns + waterfall steps; gate on the NPD
// formulation write permission (the recipe whose ingredient costs it rolls up).
const WRITE_PERMISSION = 'npd.formulation.create_draft';
const MARGIN_WARN_THRESHOLD_KEY = 'costing_margin_warn_pct';
const DEFAULT_WARN_PCT = '15';

/** Canonical display order for the 3 named scenarios (prototype parity). */
const SCENARIO_ORDER = ['pessimistic', 'target', 'optimistic'] as const;

// Required<> so optional keys (e.g. computeErrorFgNotMapped) still always carry a
// string fallback here — translateLabel can then safely return string.
const DEFAULT_LABELS: Required<CostingLabels> = {
  title: 'Cost breakdown',
  subtitle: 'Waterfall from raw materials to final cost per kg',
  unitPerKg: 'Per kg',
  unitPerPack: 'Per pack',
  unitPerBatch: 'Per batch',
  waterfallTitle: 'Cost waterfall',
  colStep: 'Step',
  colValue: 'Value €/kg',
  colDelta: 'Δ %',
  marginTitle: 'Margin vs target price',
  colScenario: 'Scenario',
  colTargetPrice: 'Target price',
  colRevenue: 'Revenue €/kg',
  colCost: 'Cost €/kg',
  colMargin: 'Margin',
  colMarginPct: 'Margin %',
  marginWarn: 'Margin warn',
  marginWarnBody:
    'At target price, margin is {marginPct}% — below the NPD minimum of {threshold}%.',
  hardFail: 'Margin hard fail',
  hardFailBody: 'Scenario "{name}" has a negative margin ({marginPct}%) and cannot be saved.',
  whatIfTitle: 'What-if sliders',
  sliderPorkContent: 'Raw cost €/kg',
  sliderYield: 'Yield %',
  sliderTargetPrice: 'Margin %',
  scenarioName: 'Scenario name',
  saveScenario: 'Save scenario',
  saving: 'Saving…',
  saveError: 'Could not save the scenario. Try again.',
  saved: 'Scenario saved.',
  loading: 'Loading costing data…',
  empty: 'No costing data yet',
  emptyBody: 'Costing is computed once the formulation has ingredient costs.',
  error: 'Unable to load costing data.',
  forbidden: 'You do not have permission to view costing data.',
  computeCosting: 'Compute costing',
  computing: 'Computing…',
  computeError: 'Could not compute the costing. Try again.',
  computeErrorNotFound: 'No formulation is available to compute costing from yet.',
  computeErrorNoCosts: 'Every ingredient needs a cost before costing can be computed.',
  computeErrorHardFail: 'The target margin is negative, so the breakdown cannot be saved.',
  computeErrorFgNotMapped:
    'The recipe exists, but no Finished Good is linked yet — advance the project to the Packaging stage first.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof CostingLabels>;

function translateLabel(t: (key: string) => string, key: keyof CostingLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<CostingLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.costing' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as CostingLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

// ─── Exact decimal-string arithmetic (no floats) for margin €/%. ──────────────
// Mirrors the lib's fixed-scale BigInt approach but only needs +,-,*,/ at 4 dp.

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

/** (a/b)*100 at 4 dp, returns decimal string. b expected non-zero (cost). */
function pctOf(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0.0000';
  const result = (numerator * 100n * FACTOR) / denominator;
  return formatDec(result);
}

type BreakdownRow = {
  id: string;
  scenario: string;
  raw_cost_eur: string;
  margin_pct: string;
  target_price_eur: string;
  params: CostingParams | null;
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

/** V07 status from margin% vs warn threshold (exact decimal-string compare). */
function marginStatus(marginPct: string, warnPct: string): CostingStatus {
  const margin = parseDec(marginPct);
  if (margin < 0n) return 'fail';
  return margin < parseDec(warnPct) ? 'warn' : 'ok';
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null, canCompute: false };
      }

      // C3 — write gate (resolved server-side; the empty-state Compute button is
      // only enabled when this is true). RLS scopes to the org.
      const canCompute = await hasPermission(ctx, WRITE_PERMISSION);

      // Resolve the FA candidate for this project. RLS scopes to the org.
      // product joins now carry (org_id, product_code) — the project row is
      // already org-scoped, so product_code alone is unambiguous within the org.
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
        return { state: 'empty', data: null, canCompute };
      }
      const productName = project.rows[0]?.product_name ?? productCode;

      // Warn threshold (per-org). RLS scopes to this org.
      const thr = await ctx.client.query<{ value_int: number | null; value_text: string | null }>(
        `select value_int, value_text
           from "Reference"."AlertThresholds"
          where threshold_key = $1`,
        [MARGIN_WARN_THRESHOLD_KEY],
      );
      const warnPct = resolveWarnPct(thr.rows[0]);

      // All named-scenario breakdowns for this FA. Money/percent cast ::text →
      // decimal STRINGS (never floats). RLS scopes to the org.
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
        return { state: 'empty', data: null, canCompute };
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

      // Pick the canonical scenario for the waterfall display: prefer 'target',
      // else the first scenario in canonical order, else the first row.
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

      // Map each breakdown to a scenario row. Cost €/kg = the Logistics (COGS,
      // step 6) cumulative value; revenue €/kg = the Retail (step 9) value;
      // margin € = revenue - cost; margin % is the stored snapshot column.
      const cogsIndex = COSTING_WATERFALL_STEP_NAMES.indexOf('Logistics') + 1; // 6

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
        data: {
          productCode,
          projectId,
          productName,
          marginWarnThresholdPct: warnPct,
          steps: stepViews,
          scenarios: scenarioRows,
          currentParams,
        },
        canCompute,
      };
    });
  } catch (error) {
    console.error('[costing] org-scoped read failed:', error);
    return { state: 'error', data: null, canCompute: false };
  }
}

/** Stable display name for a named scenario (canonical 3 + freeform fallback). */
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

/** Canonical-order rank for sorting (named scenarios first, then by name). */
function scenarioRank(scenario: string): number {
  const idx = (SCENARIO_ORDER as readonly string[]).indexOf(scenario);
  return idx === -1 ? SCENARIO_ORDER.length + 1 : idx;
}

/** Fallback param set when a legacy breakdown has no persisted params jsonb. */
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

/** Server Action adapter passed to the client (T-073 owns the action itself). */
async function saveScenarioAction(call: SaveScenarioCall): Promise<SaveScenarioOutcome> {
  'use server';
  const result = await saveCostingScenario(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Compute-costing Server Action adapter (C3). Calls computeAndSaveInitialBreakdown
 * (persists the `target` scenario via the waterfall) and normalises the result.
 * RBAC is enforced in page.tsx (only injected when the user can write).
 */
async function computeCostingAction(call: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  'use server';
  const result = await computeAndSaveInitialBreakdown(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error, message: result.message };
}

export default async function CostingPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as CostingPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null, canCompute: false }
    : await readPageData(projectId);

  return (
    <CostingScreen
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      onSaveScenario={saveScenarioAction}
      projectId={projectId}
      // C3 — only thread the compute action when the user can write (server-resolved).
      computeAction={loaded.canCompute ? computeCostingAction : undefined}
    />
  );
}
