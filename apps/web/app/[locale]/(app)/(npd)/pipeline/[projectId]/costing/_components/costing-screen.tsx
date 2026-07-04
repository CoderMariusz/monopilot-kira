'use client';

/**
 * W2-L6 — CostingScreen: 3-column waterfall (£/kg | £/pack | £/batch) + inputs panel.
 * Engine contract is adapted in ../_lib/cost-engine-adapter.ts (single tweak point).
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import {
  adaptMissingChecklist,
  adaptWaterfallRows,
  type CostEngineResult,
  type CostEngineStepKey,
} from '../_lib/cost-engine-adapter';
import type { SaveCostingInputsInput, SaveCostingInputsResult } from '../_actions/save-costing-inputs-schema';

export type { CostEngineResult, CostEngineStepKey } from '../_lib/cost-engine-adapter';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Legacy types kept for page-loader compatibility until the engine lane lands. */
export type CostingStatus = 'ok' | 'warn' | 'fail';
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
  stepName: string;
  label: string;
  valueEur: string;
  deltaPct: string | null;
};
export type ScenarioRow = {
  scenario: string;
  name: string;
  targetPriceEur: string;
  costEur: string;
  marginEur: string;
  marginPct: string;
  status: CostingStatus;
};

export type CostingInputsView = {
  avgBatchQty: string;
  fgBaseUom: string;
  overheadPerKgOverride: string;
  logisticsPerBoxOverride: string;
  orgOverheadPerKg: string;
  orgLogisticsPerBox: string;
  weeklyVolumePacks: string | null;
  runsPerWeek: string | null;
};

export type CostingScreenData = {
  productCode: string;
  projectId: string;
  productName: string;
  marginWarnThresholdPct: string;
  /** @deprecated engine lane — use engineResult prop */
  steps?: CostingWaterfallStepView[];
  scenarios?: ScenarioRow[];
  currentParams?: CostingParams;
  engineResult?: CostEngineResult | null;
  inputs?: CostingInputsView | null;
};

export type CostingLabels = {
  title: string;
  subtitle: string;
  waterfallTitle: string;
  colStep: string;
  colPerKg: string;
  colPerPack: string;
  colPerBatch: string;
  inputsTitle: string;
  inputAvgBatch: string;
  inputOverhead: string;
  inputLogistics: string;
  inputWeeklyVolume: string;
  inputRunsPerWeek: string;
  editInBrief: string;
  saveInputs: string;
  savingInputs: string;
  savedInputs: string;
  saveInputsError: string;
  blockedTitle: string;
  blockedPrefix: string;
  notDerivable: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  computeCosting: string;
  recomputeCosting?: string;
  computing: string;
  computeError: string;
  blockedYieldRequired?: string;
  blockedBriefInputs?: string;
  blockedPacksPerCase?: string;
  blockedIngredientCosts?: string;
  computeErrorNotFound: string;
  computeErrorNoCosts: string;
  computeErrorHardFail: string;
  computeErrorFgNotMapped?: string;
  marginNegativeWarn: string;
  marginNegativeWarnBody: string;
  stepLabels?: Partial<Record<CostEngineStepKey, string>>;
};

export type SaveScenarioCall = {
  projectId: string;
  productCode: string;
  scenario: string;
  params: CostingParams;
};
export type SaveScenarioOutcome = { ok: boolean; error?: string };
export type ComputeCostingCall = { projectId: string };
export type ComputeCostingOutcome = {
  ok: boolean;
  error?: string;
  message?: string;
  marginNegative?: boolean;
};

const CURRENCY = '£';

function formatMoney(value: string | null): string {
  if (value == null) return '—';
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  return `${negative ? '-' : ''}${CURRENCY}${intPart}.${frac}`;
}

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

function CostingInputsPanel({
  projectId,
  locale,
  inputs,
  labels,
  canSave,
  onSave,
}: {
  projectId: string;
  locale: string;
  inputs: CostingInputsView;
  labels: CostingLabels;
  canSave: boolean;
  onSave?: (input: SaveCostingInputsInput) => Promise<SaveCostingInputsResult>;
}) {
  const [avgBatchQty, setAvgBatchQty] = React.useState(inputs.avgBatchQty);
  const [overhead, setOverhead] = React.useState(inputs.overheadPerKgOverride);
  const [logistics, setLogistics] = React.useState(inputs.logisticsPerBoxOverride);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = React.useState('');

  React.useEffect(() => {
    setAvgBatchQty(inputs.avgBatchQty);
    setOverhead(inputs.overheadPerKgOverride);
    setLogistics(inputs.logisticsPerBoxOverride);
    setSaveError('');
  }, [inputs]);

  const briefHref = `/${locale}/pipeline/${projectId}/brief`;

  async function handleSave() {
    if (!onSave || !canSave || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const result = await onSave({
        projectId,
        avgBatchQty: avgBatchQty.trim() === '' ? null : avgBatchQty,
        overheadPerKgOverride: overhead.trim() === '' ? null : overhead,
        logisticsPerBoxOverride: logistics.trim() === '' ? null : logistics,
      });
      setSaveState(result.ok ? 'saved' : 'error');
      setSaveError(result.ok ? '' : result.error);
    } catch {
      setSaveState('error');
      setSaveError(labels.saveInputsError);
    }
  }

  return (
    <Card data-testid="costing-inputs-card">
      <CardHeader>
        <CardTitle>{labels.inputsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="costing-avg-batch" className="text-xs font-semibold uppercase tracking-wide muted">
              {labels.inputAvgBatch} ({inputs.fgBaseUom || '—'})
            </label>
            <Input
              id="costing-avg-batch"
              data-testid="costing-avg-batch"
              type="number"
              min={0}
              step="0.001"
              value={avgBatchQty}
              disabled={!canSave}
                onChange={(e) => {
                  setSaveState('idle');
                  setSaveError('');
                  setAvgBatchQty(e.target.value);
                }}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="costing-overhead" className="text-xs font-semibold uppercase tracking-wide muted">
              {labels.inputOverhead}
            </label>
            <Input
              id="costing-overhead"
              data-testid="costing-overhead"
              type="number"
              min={0}
              step="0.01"
              value={overhead}
              disabled={!canSave}
              placeholder={inputs.orgOverheadPerKg}
                onChange={(e) => {
                  setSaveState('idle');
                  setSaveError('');
                  setOverhead(e.target.value);
                }}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="costing-logistics" className="text-xs font-semibold uppercase tracking-wide muted">
              {labels.inputLogistics}
            </label>
            <Input
              id="costing-logistics"
              data-testid="costing-logistics"
              type="number"
              min={0}
              step="0.01"
              value={logistics}
              disabled={!canSave}
              placeholder={inputs.orgLogisticsPerBox}
                onChange={(e) => {
                  setSaveState('idle');
                  setSaveError('');
                  setLogistics(e.target.value);
                }}
            />
          </div>
          {canSave ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="btn-primary"
                data-testid="costing-save-inputs"
                disabled={saveState === 'saving'}
                onClick={handleSave}
              >
                {saveState === 'saving' ? labels.savingInputs : labels.saveInputs}
              </Button>
              {saveState === 'saved' ? (
                <span role="status" className="text-sm text-emerald-700">
                  {labels.savedInputs}
                </span>
              ) : null}
              {saveState === 'error' ? (
                <span role="alert" className="text-sm text-red-700">
                  {saveError || labels.saveInputsError}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm" data-testid="costing-brief-readonly">
          <div>
            <span className="muted">{labels.inputWeeklyVolume}: </span>
            <span className="mono tabular-nums">{inputs.weeklyVolumePacks ?? labels.notDerivable}</span>
          </div>
          <div>
            <span className="muted">{labels.inputRunsPerWeek}: </span>
            <span className="mono tabular-nums">{inputs.runsPerWeek ?? labels.notDerivable}</span>
          </div>
          <Link href={briefHref} className="text-sm text-blue-700 underline" data-testid="costing-edit-brief">
            {labels.editInBrief}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function CostingScreen({
  state = 'ready',
  data,
  labels,
  locale = 'en',
  projectId,
  engineResult,
  inputs,
  onSaveInputs,
  canSaveInputs = false,
  computeAction,
  onRefresh,
}: {
  state?: PageState;
  data: CostingScreenData | null;
  labels: CostingLabels;
  locale?: string;
  projectId?: string;
  engineResult?: CostEngineResult | null;
  inputs?: CostingInputsView | null;
  onSaveInputs?: (input: SaveCostingInputsInput) => Promise<SaveCostingInputsResult>;
  canSaveInputs?: boolean;
  onSaveScenario?: (call: SaveScenarioCall) => Promise<SaveScenarioOutcome>;
  computeAction?: (call: ComputeCostingCall) => Promise<ComputeCostingOutcome>;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const refresh = React.useCallback(() => {
    if (onRefresh) onRefresh();
    else router?.refresh?.();
  }, [onRefresh, router]);

  type ComputeStatus = 'idle' | 'computing' | 'computed' | 'error';
  const [computeStatus, setComputeStatus] = React.useState<ComputeStatus>('idle');
  const [computeError, setComputeError] = React.useState('');
  const resolvedProjectId = projectId ?? data?.projectId ?? '';
  const canCompute = !!computeAction && !!resolvedProjectId;

  const computeErrorMessage = React.useCallback(
    (error: string, message?: string): string => {
      switch (error) {
        case 'not_found':
          return labels.computeErrorNotFound;
        case 'fg_not_mapped':
          return (
            labels.computeErrorFgNotMapped ??
            'The recipe exists, but no Finished Good is linked yet — advance the project to the Packaging stage first.'
          );
        case 'invalid_input':
          return message || labels.computeErrorNoCosts;
        case 'forbidden':
          return labels.forbidden;
        // W2 typed blockers — tell the user exactly WHAT to complete and WHERE,
        // never the generic "try again" (Gate-5b truthful-copy rule).
        case 'yield_required':
          return (
            labels.blockedYieldRequired ??
            'Uzupełnij uzysk (yield %) w recepturze, potem przelicz ponownie.'
          );
        case 'brief_inputs_required':
          return (
            labels.blockedBriefInputs ??
            'Uzupełnij dane kosztowe: średni batch (panel powyżej) oraz wolumen tygodniowy i przebiegi/tydzień w Brief.'
          );
        case 'packs_per_case_required':
          return (
            labels.blockedPacksPerCase ??
            'Uzupełnij liczbę paczek w boxie na etapie Opakowania.'
          );
        case 'ingredient_costs_missing':
          return (
            labels.blockedIngredientCosts ??
            'Co najmniej jeden składnik receptury nie ma ceny — uzupełnij koszty składników.'
          );
        default:
          return labels.computeError;
      }
    },
    [labels],
  );

  const runCompute = React.useCallback(() => {
    if (!computeAction || !resolvedProjectId || computeStatus === 'computing') return;
    setComputeStatus('computing');
    setComputeError('');
    void (async () => {
      try {
        const result = await computeAction({ projectId: resolvedProjectId });
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
  }, [
    computeAction,
    resolvedProjectId,
    computeStatus,
    refresh,
    computeErrorMessage,
    labels.computeError,
  ]);

  const resolvedEngine = engineResult ?? data?.engineResult ?? null;
  const resolvedInputs = inputs ?? data?.inputs ?? null;

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

  const waterfallRows = resolvedEngine
    ? adaptWaterfallRows(resolvedEngine, labels.stepLabels)
    : [];
  const blocked = resolvedEngine?.status === 'blocked';
  const missingLinks =
    blocked && resolvedEngine
      ? adaptMissingChecklist(resolvedEngine.missing, locale, resolvedProjectId)
      : [];

  const marginStep = resolvedEngine?.steps.find((s) => s.key === 'margin');
  const marginNegative = marginStep
    ? /^-(?!0(\.0+)?$)/.test(marginStep.valuePerPackEur.trim())
    : false;

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

      {marginNegative ? (
        <div role="status" data-testid="margin-negative-warning" className="alert alert-amber">
          <div className="alert-title">{labels.marginNegativeWarn}</div>
          <p className="mt-1">
            {interpolate(labels.marginNegativeWarnBody, {
              marginPct: marginStep?.valuePerPackEur ?? '0',
            })}
          </p>
        </div>
      ) : null}

      {resolvedInputs ? (
        <CostingInputsPanel
          projectId={resolvedProjectId}
          locale={locale}
          inputs={resolvedInputs}
          labels={labels}
          canSave={canSaveInputs}
          onSave={onSaveInputs}
        />
      ) : null}

      {blocked ? (
        <div
          role="status"
          data-testid="costing-blocked-checklist"
          className="alert alert-amber"
        >
          <div className="alert-title">{labels.blockedTitle}</div>
          <p className="mt-1">{labels.blockedPrefix}</p>
          <ul className="mt-2 list-disc pl-5">
            {missingLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline">
                  {item.label}
                </Link>
              </li>
            ))}
            {missingLinks.length === 0
              ? resolvedEngine?.missing.map((m) => <li key={m}>{m}</li>)
              : null}
          </ul>
        </div>
      ) : null}

      <Card data-testid="costing-waterfall-card">
        <CardHeader>
          <CardTitle>{labels.waterfallTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="costing-waterfall-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colStep}</TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colPerKg}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colPerPack}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colPerBatch}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waterfallRows.map((row) => (
                <TableRow
                  key={row.key}
                  data-testid="waterfall-row"
                  data-step={row.key}
                  className={row.isTotal ? 'font-bold' : undefined}
                >
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="mono tabular-nums text-right">
                    {row.perKg != null ? formatMoney(row.perKg) : labels.notDerivable}
                  </TableCell>
                  <TableCell className="mono tabular-nums text-right">
                    {formatMoney(row.perPack)}
                  </TableCell>
                  <TableCell className="mono tabular-nums text-right">
                    {row.perBatch != null ? formatMoney(row.perBatch) : labels.notDerivable}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

export default CostingScreen;
