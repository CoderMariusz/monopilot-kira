'use client';

/**
 * T-075 — CostingScreen (costing_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:83-163 (CostingScreen)
 *
 * Translation notes (prototype-index-npd.json#costing_screen):
 *   - `.waterfall` custom-CSS bars                → WaterfallBar list (accessible bars; money from NUMERIC strings)
 *   - per-kg / per-pack / per-batch toggle pills  → @monopilot/ui Button group (client unit toggle, layout-only)
 *   - 3-scenario margin <table>                   → @monopilot/ui Table (pessimistic / target / optimistic)
 *   - what-if `<input type=range>`                → @monopilot/ui Slider (raw range is a red-line)
 *   - alert "7.5% below NPD minimum 15%"          → @monopilot/ui Alert-style banner; threshold from AlertThresholds
 *   - HARD FAIL (margin < 0%)                      → destructive banner; Save disabled while current params hard-fail
 *   - "Save scenario" CTA                          → calls onSaveScenario (saveCostingScenario Server Action — T-073)
 *
 * Money is rendered straight from NUMERIC decimal STRINGS (never JS floats). The
 * ONLY numeric coercions are layout-only (bar fill %, slider positions) and are
 * never persisted or shown as money. RBAC (`permission_denied`) is resolved
 * server-side in page.tsx and is never trusted from the client.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Slider } from '@monopilot/ui/Slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { WaterfallBar } from './waterfall-bar';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type CostingStatus = 'ok' | 'warn' | 'fail';
export type CostingUnit = 'kg' | 'pack' | 'batch';

/** A what-if parameter set — every field is a decimal STRING (never a float). */
export type CostingParams = {
  rawCostEur: string;
  yieldPct: string;
  processLabourEur: string;
  packagingEur: string;
  overheadEur: string;
  logisticsEur: string;
  marginPct: string;
  distributorMarkupPct: string;
  retailMarkupPct: string;
};

export type CostingWaterfallStepView = {
  stepIndex: number;
  /** Canonical step name (COSTING_WATERFALL_STEP_NAMES). */
  stepName: string;
  /** Display label (i18n-resolved or the canonical name). */
  label: string;
  /** Cumulative running value as a decimal STRING (bound from NUMERIC). */
  valueEur: string;
  /** Step-over-step delta as a decimal STRING; null for step 1. */
  deltaPct: string | null;
};

export type ScenarioRow = {
  scenario: string;
  name: string;
  /** All money/percent fields are decimal STRINGS (never floats). */
  targetPriceEur: string;
  costEur: string;
  marginEur: string;
  marginPct: string;
  status: CostingStatus;
};

export type CostingScreenData = {
  productCode: string;
  projectId: string;
  productName: string;
  /** Margin warn threshold percent (decimal string) from Reference.AlertThresholds. */
  marginWarnThresholdPct: string;
  steps: CostingWaterfallStepView[];
  scenarios: ScenarioRow[];
  /** The current what-if parameter set (drives sliders + Save). */
  currentParams: CostingParams;
};

export type CostingLabels = {
  title: string;
  subtitle: string;
  unitPerKg: string;
  unitPerPack: string;
  unitPerBatch: string;
  waterfallTitle: string;
  colStep: string;
  colValue: string;
  colDelta: string;
  marginTitle: string;
  colScenario: string;
  colTargetPrice: string;
  colRevenue: string;
  colCost: string;
  colMargin: string;
  colMarginPct: string;
  marginWarn: string;
  /** "{marginPct}" and "{threshold}" are replaced client-side. */
  marginWarnBody: string;
  hardFail: string;
  /** "{name}" and "{marginPct}" are replaced client-side. */
  hardFailBody: string;
  whatIfTitle: string;
  sliderPorkContent: string;
  sliderYield: string;
  sliderTargetPrice: string;
  scenarioName: string;
  saveScenario: string;
  saving: string;
  saveError: string;
  saved: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  /** Compute costing action (C3) — empty-state CTA + its error messages. */
  computeCosting: string;
  /** Recompute action (C3) — ready-state CTA to re-roll the breakdown after inputs change. */
  recomputeCosting?: string;
  computing: string;
  computeError: string;
  computeErrorNotFound: string;
  computeErrorNoCosts: string;
  computeErrorHardFail: string;
  /** Formulation exists but no FG product is mapped yet (pre-packaging stage). */
  computeErrorFgNotMapped?: string;
};

export type SaveScenarioCall = {
  projectId: string;
  productCode: string;
  scenario: string;
  params: CostingParams;
};

export type SaveScenarioOutcome = { ok: boolean; error?: string };

/**
 * Compute-and-save-initial-breakdown Server Action (C3). Persists the `target`
 * scenario via the existing waterfall from the project's current formulation.
 * RBAC is resolved server-side in page.tsx (only injected when the user can
 * write); errors are surfaced inline.
 */
export type ComputeCostingCall = { projectId: string };
export type ComputeCostingOutcome = { ok: boolean; error?: string; message?: string };

const CURRENCY = '€';

/** Format a decimal STRING for display without float coercion (string-only). */
function formatMoney(value: string): string {
  // Keep the exact numeric text; trim to at most 2 dp for display while never
  // doing float math (string slicing only). Negative sign preserved.
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  const body = `${intPart}.${frac}`;
  return `${negative ? '-' : ''}${CURRENCY}${body}`;
}

/** Format a percentage decimal STRING for display (string slicing, no floats). */
function formatPct(value: string): string {
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '0').slice(0, 1);
  return `${negative ? '-' : '+'}${intPart}.${frac}%`;
}

/** Layout-only fill % for the cumulative bar (numeric is fine — NOT money). */
function barFillPct(valueEur: string, scaleEur: string): number {
  const v = Number(valueEur);
  const scale = Number(scaleEur);
  if (!Number.isFinite(v) || !Number.isFinite(scale) || scale <= 0) return 0;
  return Math.max(0, Math.min(100, (v / scale) * 100));
}

function statusVariant(status: CostingStatus): BadgeVariant {
  switch (status) {
    case 'fail':
      return 'danger';
    case 'warn':
      return 'warning';
    default:
      return 'success';
  }
}

/** Design-system tone class (single-dash `.badge-*` carry colour; BEM variants are unstyled). */
function statusToneClass(status: CostingStatus): string {
  switch (status) {
    case 'fail':
      return 'badge-red';
    case 'warn':
      return 'badge-amber';
    default:
      return 'badge-green';
  }
}

/** Replace `{token}` placeholders in an i18n string (no inline strings). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

function StateNotice({ state, labels }: { state: PageState; labels: CostingLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">📊</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function CostingScreen({
  state = 'ready',
  data,
  labels,
  onSaveScenario,
  projectId,
  computeAction,
  onRefresh,
}: {
  state?: PageState;
  data: CostingScreenData | null;
  labels: CostingLabels;
  onSaveScenario?: (call: SaveScenarioCall) => Promise<SaveScenarioOutcome>;
  /** Project id — needed to compute the initial breakdown from the empty state (C3). */
  projectId?: string;
  /** Compute-costing Server Action (injected only when the user can write). */
  computeAction?: (call: ComputeCostingCall) => Promise<ComputeCostingOutcome>;
  /** Server refresh after a successful compute. Test seam overrides router.refresh. */
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const refresh = React.useCallback(() => {
    if (onRefresh) onRefresh();
    else router?.refresh?.();
  }, [onRefresh, router]);

  const [unit, setUnit] = React.useState<CostingUnit>('kg');
  const [scenarioName, setScenarioName] = React.useState('');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // C3 — compute initial costing (empty state). Server-gated; errors inline.
  type ComputeStatus = 'idle' | 'computing' | 'computed' | 'error';
  const [computeStatus, setComputeStatus] = React.useState<ComputeStatus>('idle');
  const [computeError, setComputeError] = React.useState<string>('');
  const canCompute = !!computeAction && !!projectId;

  const computeErrorMessage = React.useCallback(
    (error: string, message?: string): string => {
      switch (error) {
        case 'not_found':
          return labels.computeErrorNotFound;
        case 'fg_not_mapped':
          // Honest split from not_found: the formulation EXISTS (possibly locked)
          // but the FG candidate has not been created yet (packaging stage).
          return (
            labels.computeErrorFgNotMapped ??
            'The recipe exists, but no Finished Good is linked yet — advance the project to the Packaging stage first.'
          );
        case 'invalid_input':
          // The action's message ("…has no complete ingredient costs") is the most
          // useful signal here; fall back to a localized hint.
          return message || labels.computeErrorNoCosts;
        case 'margin_hard_fail':
          return labels.computeErrorHardFail;
        default:
          return labels.computeError;
      }
    },
    [labels],
  );

  const runCompute = React.useCallback(() => {
    if (!computeAction || !projectId || computeStatus === 'computing') return;
    setComputeStatus('computing');
    setComputeError('');
    void (async () => {
      try {
        const result = await computeAction({ projectId });
        if (result.ok) {
          setComputeStatus('computed');
          refresh();
        } else {
          setComputeStatus('error');
          setComputeError(computeErrorMessage(result.error ?? '', result.message));
        }
      } catch {
        setComputeStatus('error');
        setComputeError(labels.computeError);
      }
    })();
  }, [computeAction, projectId, computeStatus, refresh, computeErrorMessage, labels.computeError]);

  // Live what-if params (sliders mutate these). Initialised from server data.
  const [params, setParams] = React.useState<CostingParams | null>(data?.currentParams ?? null);
  React.useEffect(() => {
    setParams(data?.currentParams ?? null);
  }, [data?.currentParams]);

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="costing-screen"
        aria-labelledby="costing-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="costing-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        {computeStatus === 'error' && computeError ? (
          <div role="alert" className="alert alert-red" data-testid="costing-compute-error">
            {computeError}
          </div>
        ) : null}
        <StateNotice state={state} labels={labels} />
        {/* C3 — Compute costing CTA in the empty state (write-gated server-side). */}
        {state === 'empty' && canCompute ? (
          <div style={{ textAlign: 'center' }}>
            <Button
              type="button"
              className="btn-primary"
              onClick={runCompute}
              disabled={computeStatus === 'computing'}
              data-status={computeStatus}
              data-testid="costing-compute"
            >
              {computeStatus === 'computing' ? labels.computing : labels.computeCosting}
            </Button>
          </div>
        ) : null}
      </main>
    );
  }

  const activeParams = params ?? data.currentParams;

  // Hard-fail = current params margin < 0% (Save is blocked). String compare so
  // we never float-coerce money; a leading '-' (non-"-0") means negative.
  const currentMarginNegative = /^-(?!0(\.0+)?$)/.test(activeParams.marginPct.trim());

  const failingScenarios = data.scenarios.filter((s) => s.status === 'fail');

  // Bar scale = max cumulative step value (layout-only number; never money out).
  const scaleEur = data.steps.reduce(
    (max, s) => (Number(s.valueEur) > Number(max) ? s.valueEur : max),
    '0',
  );

  const targetScenario =
    data.scenarios.find((s) => s.scenario === 'target') ??
    data.scenarios.find((s) => s.status === 'warn');

  async function handleSave() {
    if (!onSaveScenario || currentMarginNegative || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const result = await onSaveScenario({
        projectId: data!.projectId,
        productCode: data!.productCode,
        scenario: scenarioName.trim() || `scenario-${Date.now()}`,
        params: activeParams,
      });
      setSaveState(result.ok ? 'saved' : 'error');
      if (result.ok) refresh();
    } catch {
      setSaveState('error');
    }
  }

  function updateParam(key: keyof CostingParams, next: number) {
    setSaveState('idle');
    setParams((prev) => {
      const base = prev ?? data!.currentParams;
      return { ...base, [key]: String(next) };
    });
  }

  const unitButtons: Array<{ value: CostingUnit; label: string }> = [
    { value: 'kg', label: labels.unitPerKg },
    { value: 'pack', label: labels.unitPerPack },
    { value: 'batch', label: labels.unitPerBatch },
  ];

  return (
    <main
      data-testid="costing-screen"
      aria-labelledby="costing-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <nav aria-label="breadcrumb" className="breadcrumb">
            NPD / {labels.title}
          </nav>
          <h1 id="costing-title" className="page-title mt-1">
            {labels.title} — {data.productName}
          </h1>
          <p className="mt-1 text-sm muted">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* recipe parity: per-kg / per-pack / per-batch toggle = .pills (not buttons) */}
          <div className="pills" role="group" aria-label={labels.title}>
            {unitButtons.map((u) => (
              <button
                key={u.value}
                type="button"
                aria-pressed={unit === u.value}
                onClick={() => setUnit(u.value)}
                className={unit === u.value ? 'pill on' : 'pill'}
              >
                {u.label}
              </button>
            ))}
          </div>
          {/* C3 — Recompute the breakdown after inputs change (write-gated server-side
              by withholding the action; same idempotent compute action as the empty state). */}
          {computeAction ? (
            <Button
              type="button"
              className="btn-primary"
              onClick={runCompute}
              disabled={computeStatus === 'computing'}
              data-status={computeStatus}
              data-testid="costing-recompute"
            >
              {computeStatus === 'computing'
                ? labels.computing
                : (labels.recomputeCosting ?? labels.computeCosting)}
            </Button>
          ) : null}
        </div>
      </header>

      {computeStatus === 'error' && computeError ? (
        <div role="alert" className="alert alert-red" data-testid="costing-compute-error">
          {computeError}
        </div>
      ) : null}

      {failingScenarios.length > 0 ? (
        <div
          role="alert"
          data-testid="hard-fail-banner"
          className="alert alert-red"
        >
          <div className="alert-title">{labels.hardFail}</div>
          <p className="mt-1">
            {interpolate(labels.hardFailBody, {
              name: failingScenarios[0]!.name,
              marginPct: failingScenarios[0]!.marginPct,
            })}
          </p>
        </div>
      ) : null}

      <Card data-testid="costing-waterfall-card">
        <CardHeader>
          <CardTitle>{labels.waterfallTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol data-testid="costing-waterfall" className="space-y-0">
            {data.steps.map((step) => (
              <WaterfallBar
                key={step.stepIndex}
                label={step.label}
                displayValue={formatMoney(step.valueEur)}
                fillPct={barFillPct(step.valueEur, scaleEur)}
                kind={step.stepIndex === data.steps.length ? 'total' : 'add'}
                deltaText={step.deltaPct ? formatPct(step.deltaPct) : null}
              />
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card data-testid="scenario-card">
          <CardHeader>
            <CardTitle>{labels.marginTitle}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table data-testid="scenario-table">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.colScenario}</TableHead>
                  <TableHead scope="col">{labels.colTargetPrice}</TableHead>
                  <TableHead scope="col">{labels.colCost}</TableHead>
                  <TableHead scope="col">{labels.colMargin}</TableHead>
                  <TableHead scope="col">{labels.colMarginPct}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.scenarios.map((s) => {
                  const negative = /^-(?!0(\.0+)?$)/.test(s.marginPct.trim());
                  return (
                    <TableRow
                      key={s.scenario}
                      data-testid="scenario-row"
                      data-status={s.status}
                      style={s.scenario === 'target' ? { background: 'var(--blue-050)' } : undefined}
                    >
                      <TableCell className="font-medium">
                        <span data-testid="scenario-name">{s.name}</span>
                        {s.status === 'warn' ? (
                          <Badge variant="warning" className="badge-amber ml-2" data-testid="margin-warn-badge">
                            {labels.marginWarn}
                          </Badge>
                        ) : null}
                        {s.status === 'fail' ? (
                          <Badge variant="danger" className="badge-red ml-2" data-testid="margin-fail-badge">
                            {labels.hardFail}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="mono tabular-nums">
                        {formatMoney(s.targetPriceEur)}
                      </TableCell>
                      <TableCell className="mono tabular-nums">{formatMoney(s.costEur)}</TableCell>
                      <TableCell
                        className={[
                          'mono tabular-nums',
                          negative ? 'text-red-600' : 'text-emerald-600',
                        ].join(' ')}
                      >
                        {formatMoney(s.marginEur)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(s.status)}
                          className={statusToneClass(s.status)}
                          data-status={s.status}
                        >
                          {formatPct(s.marginPct)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {targetScenario && targetScenario.status === 'warn' ? (
              <div
                role="note"
                data-testid="margin-warn-note"
                className="alert alert-amber m-4"
              >
                {interpolate(labels.marginWarnBody, {
                  marginPct: targetScenario.marginPct,
                  threshold: data.marginWarnThresholdPct,
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card data-testid="what-if-card">
          <CardHeader>
            <CardTitle>{labels.whatIfTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="slider-raw-cost" className="block text-xs font-semibold uppercase tracking-wide muted">
                {labels.sliderPorkContent} ({activeParams.rawCostEur})
              </label>
              <Slider
                id="slider-raw-cost"
                aria-label={labels.sliderPorkContent}
                min={5}
                max={30}
                step={0.01}
                value={Number(activeParams.rawCostEur)}
                onValueChange={(v) => updateParam('rawCostEur', v)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="slider-yield" className="block text-xs font-semibold uppercase tracking-wide muted">
                {labels.sliderYield} ({activeParams.yieldPct})
              </label>
              <Slider
                id="slider-yield"
                aria-label={labels.sliderYield}
                min={50}
                max={100}
                step={1}
                value={Number(activeParams.yieldPct)}
                onValueChange={(v) => updateParam('yieldPct', v)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="slider-margin" className="block text-xs font-semibold uppercase tracking-wide muted">
                {labels.sliderTargetPrice} ({activeParams.marginPct})
              </label>
              <Slider
                id="slider-margin"
                aria-label={labels.sliderTargetPrice}
                min={-20}
                max={60}
                step={0.5}
                value={Number(activeParams.marginPct)}
                onValueChange={(v) => updateParam('marginPct', v)}
              />
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <label htmlFor="scenario-name" className="block text-xs font-semibold uppercase tracking-wide muted">
                {labels.scenarioName}
              </label>
              <input
                id="scenario-name"
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="form-input"
              />
              <Button
                type="button"
                onClick={handleSave}
                disabled={currentMarginNegative || saveState === 'saving' || !onSaveScenario}
                aria-label={labels.saveScenario}
                className="btn-primary mt-1 w-full"
              >
                {saveState === 'saving' ? labels.saving : labels.saveScenario}
              </Button>
              {saveState === 'saved' ? (
                <p role="status" className="text-sm text-emerald-700">
                  {labels.saved}
                </p>
              ) : null}
              {saveState === 'error' ? (
                <p role="alert" className="text-sm text-red-700">
                  {labels.saveError}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default CostingScreen;
