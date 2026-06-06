'use client';

/**
 * T-114 — CostPanel (cost_panel prototype) — STANDALONE live cost/margin panel.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:67-101 (CostPanel)
 *
 * Translation notes (prototype-index-npd.json#cost_panel):
 *   - `.card` + `.card-head` "Cost & margin · live"   → @monopilot/ui Card + CardHeader/CardTitle
 *   - `.cost-box` / `.cost-line` flex justify-between  → Tailwind flex justify-between rows
 *   - "Raw material / After yield / Processing /        → five cost lines + a `total` line; values are
 *      Packaging / Total cost / kg" lines                NUMERIC decimal STRINGS, never JS floats
 *   - Target-price + yield % `<input>`                  → @monopilot/ui Input, CONTROLLED via props
 *      (parent owns the state — recipe.jsx uses setTargetPrice / setYieldPct)
 *   - margin box bg red/amber/green by marginPct         → Tailwind bg-red-50 / bg-amber-50 / bg-green-50
 *      thresholds (< 0 / < 15 / ≥ 15)
 *   - `.good` / `.bad` mono margin colour                → text-emerald-600 / text-red-600
 *   - hardcoded "€" / 8% overhead / 0.65 packaging       → currency from prop (default EUR); overhead %
 *      and the breakdown values come from the T-065 recomputeCalc result (real shape)
 *
 * This is a STANDALONE component. It does NOT own targetPrice / yieldPct state
 * (controlled by the parent — wiring is T-117) and does NOT modify the editor.
 *
 * Money/percent values are decimal STRINGS end-to-end. Every currency figure is
 * formatted by string slicing + the exact `Dec` helper from @monopilot/domain —
 * there is NO `Number()` on the money path (binary float would drift cents).
 * The only numeric coercion is the yield input value (a layout-only integer that
 * is never persisted as money).
 */

import React from 'react';

import { Dec } from '@monopilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';

export type CostPanelState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/**
 * Live cost breakdown — a subset of the T-065 `RecomputeResult` cost roll-up
 * (recompute-calc.ts). Every money/percent field is a NUMERIC decimal STRING as
 * read from Postgres NUMERIC; the panel never receives a JS `number` on the
 * money path. `margin` €/kg is derived here (revenue − cost) so the parent only
 * has to pass the raw recompute result.
 */
export type CostBreakdown = {
  /** Raw material cost per kg = Σ(pct/100 × costPerKg). */
  rawCost: string;
  /** Cost per kg after yield loss. */
  yieldedCost: string;
  /** Processing overhead per kg. */
  processing: string;
  /** Packaging cost per kg. */
  packaging: string;
  /** Total fully-loaded cost per kg (recompute-calc `costPerKg`). */
  costPerKg: string;
  /** Revenue per kg derived from target price / pack weight. */
  revenuePerKg: string;
  /** Gross margin percentage (may be negative). */
  marginPct: string;
  /** Processing overhead percentage (for the "Processing ({overheadPct}%)" label). */
  overheadPct: string;
};

export type CostPanelLabels = {
  title: string;
  live: string;
  rawMaterial: string;
  /** "After yield ({yieldPct}%)" — {yieldPct} replaced client-side. */
  afterYield: string;
  /** "Processing ({overheadPct}%)" — {overheadPct} replaced client-side. */
  processing: string;
  packaging: string;
  totalCost: string;
  perKgSuffix: string;
  targetPrice: string;
  expectedYield: string;
  revenuePerKg: string;
  marginPerKg: string;
  marginPct: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

/** ISO-4217 → display symbol. Default currency is EUR (never hardcoded inline). */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  GBP: '£',
  USD: '$',
  PLN: 'zł',
  RON: 'lei',
  UAH: '₴',
};

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/** Replace `{token}` placeholders in an i18n string (no inline strings). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

/**
 * Format a decimal STRING as money: "<symbol><int>.<2dp>", half-up rounded to 2
 * dp via the exact `Dec` helper (matching the prototype's `.toFixed(2)`), with
 * NO binary-float math — `Dec.toFixed` does scaled-bigint rounding. A negative
 * sign is preserved and rendered BEFORE the symbol (e.g. "-€0.26").
 */
function formatMoney(value: string, currency: string): string {
  const sym = symbolFor(currency);
  const rounded = Dec.from(value).toFixed(2); // exact half-up; never a float
  const negative = rounded.startsWith('-');
  const body = negative ? rounded.slice(1) : rounded;
  return `${negative ? '-' : ''}${sym}${body}`;
}

/**
 * Format a percentage decimal STRING to 1 dp, half-up via exact `Dec.toFixed(1)`
 * (matching the prototype's `.toFixed(1)`), no floats.
 * e.g. "51.93" → "51.9%", "-4.20" → "-4.2%".
 */
function formatPct(value: string): string {
  return `${Dec.from(value).toFixed(1)}%`;
}

/** Exact margin €/kg = revenuePerKg − costPerKg (Dec; never a binary float). */
function marginPerKg(calc: CostBreakdown): string {
  return Dec.from(calc.revenuePerKg).sub(Dec.from(calc.costPerKg)).toFixed(4);
}

/** True when a decimal STRING is strictly negative (Dec compare, no float). */
function isNegative(value: string): boolean {
  return Dec.from(value).cmp(Dec.zero()) < 0;
}

const FIFTEEN = '15';

/** Margin-box tint class per prototype thresholds (< 0 red / < 15 amber / ≥ 15 green). */
function marginTintClass(marginPctStr: string): string {
  const m = Dec.from(marginPctStr);
  if (m.cmp(Dec.zero()) < 0) return 'bg-red-50';
  if (m.cmp(Dec.from(FIFTEEN)) < 0) return 'bg-amber-50';
  return 'bg-green-50';
}

/** Margin-% text colour per the same thresholds. */
function marginPctColour(marginPctStr: string): string {
  const m = Dec.from(marginPctStr);
  if (m.cmp(Dec.zero()) < 0) return 'text-red-600';
  if (m.cmp(Dec.from(FIFTEEN)) < 0) return 'text-amber-700';
  return 'text-emerald-600';
}

function CostLine({
  label,
  value,
  total = false,
  testId,
}: {
  label: React.ReactNode;
  value: string;
  total?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 border-b border-slate-100 py-1 last:border-b-0',
        total ? 'mt-0.5 border-b-0 border-t border-slate-300 pt-1.5 font-semibold' : '',
      ].join(' ')}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <span data-testid={testId} className="mono text-sm tabular-nums text-slate-900">
        {value}
      </span>
    </div>
  );
}

function StateNotice({ state, labels }: { state: CostPanelState; labels: CostPanelLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        {labels.forbidden}
      </div>
    );
  }
  // 'empty' (and the ready-but-null fallback).
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">💶</div>
      <div className="empty-state-title">{labels.empty}</div>
      <div className="empty-state-body">{labels.emptyBody}</div>
    </div>
  );
}

export function CostPanel({
  state = 'ready',
  calc,
  targetPrice,
  onTargetPriceChange,
  yieldPct,
  onYieldChange,
  labels,
  currency = 'EUR',
}: {
  state?: CostPanelState;
  /** NUMERIC-exact cost roll-up; null while loading / empty / forbidden. */
  calc: CostBreakdown | null;
  /** Controlled target-price value (decimal STRING — parent owns the state). */
  targetPrice: string;
  onTargetPriceChange: (value: string) => void;
  /** Controlled expected-yield percentage (parent owns the state). */
  yieldPct: number;
  onYieldChange: (value: number) => void;
  labels: CostPanelLabels;
  /** ISO-4217 currency code; default EUR (never hardcode the symbol). */
  currency?: string;
}) {
  const titleId = React.useId();

  const header = (
    <CardHeader>
      <CardTitle id={titleId}>
        {labels.title}{' '}
        <span className="text-xs font-normal muted">· {labels.live}</span>
      </CardTitle>
    </CardHeader>
  );

  if (state !== 'ready' || !calc) {
    return (
      <Card role="region" aria-labelledby={titleId} data-testid="cost-panel">
        {header}
        <CardContent>
          <StateNotice state={state === 'ready' ? 'empty' : state} labels={labels} />
        </CardContent>
      </Card>
    );
  }

  const margin = marginPerKg(calc);
  const marginNegative = isNegative(margin);

  return (
    <Card role="region" aria-labelledby={titleId} data-testid="cost-panel">
      {header}
      <CardContent className="space-y-3">
        {/* Cost breakdown box (recipe.jsx:73-79). */}
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
          <CostLine
            label={labels.rawMaterial}
            value={`${formatMoney(calc.rawCost, currency)} ${labels.perKgSuffix}`}
            testId="cost-raw"
          />
          <CostLine
            label={interpolate(labels.afterYield, { yieldPct: String(yieldPct) })}
            value={`${formatMoney(calc.yieldedCost, currency)} ${labels.perKgSuffix}`}
            testId="cost-yielded"
          />
          <CostLine
            label={interpolate(labels.processing, { overheadPct: calc.overheadPct })}
            value={`${formatMoney(calc.processing, currency)} ${labels.perKgSuffix}`}
            testId="cost-processing"
          />
          <CostLine
            label={labels.packaging}
            value={`${formatMoney(calc.packaging, currency)} ${labels.perKgSuffix}`}
            testId="cost-packaging"
          />
          <CostLine
            label={labels.totalCost}
            value={formatMoney(calc.costPerKg, currency)}
            total
            testId="cost-total"
          />
        </div>

        {/* Controlled target-price + yield inputs (recipe.jsx:81-88). */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="cost-target-price" className="block text-xs font-medium muted">
              {labels.targetPrice}
            </label>
            <Input
              id="cost-target-price"
              inputMode="decimal"
              className="form-input mono"
              value={targetPrice}
              onChange={(e) => onTargetPriceChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cost-yield" className="block text-xs font-medium muted">
              {labels.expectedYield}
            </label>
            <Input
              id="cost-yield"
              type="number"
              className="form-input mono"
              value={yieldPct}
              onChange={(e) => onYieldChange(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Margin box, tinted by marginPct threshold (recipe.jsx:90-99). */}
        <div
          data-testid="cost-margin-box"
          className={[
            'rounded-md border border-slate-200 px-3 py-1.5',
            marginTintClass(calc.marginPct),
          ].join(' ')}
        >
          <CostLine
            label={labels.revenuePerKg}
            value={formatMoney(calc.revenuePerKg, currency)}
            testId="cost-revenue"
          />
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1">
            <span className="text-sm text-slate-600">{labels.marginPerKg}</span>
            <span
              data-testid="cost-margin"
              className={[
                'mono text-sm tabular-nums',
                marginNegative ? 'text-red-600' : 'text-emerald-600',
              ].join(' ')}
            >
              {formatMoney(margin, currency)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-slate-300 pt-1.5 font-semibold">
            <span className="text-sm text-slate-700">{labels.marginPct}</span>
            <span
              data-testid="cost-margin-pct"
              className={['mono text-sm tabular-nums', marginPctColour(calc.marginPct)].join(' ')}
            >
              {formatPct(calc.marginPct)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CostPanel;
