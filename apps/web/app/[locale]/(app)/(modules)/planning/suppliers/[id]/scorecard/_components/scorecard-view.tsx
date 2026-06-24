'use client';

/**
 * WAVE E9 — Supplier scorecard client view (renders getSupplierScorecard output).
 *
 * KPI tiles (on-time %, avg qty variance %, NCRs, open NCRs) + the recent-POs
 * table with per-row on-time / variance flags. Pure presentation over the
 * server-resolved scorecard payload — no client data fetch, no mocks.
 *
 * Prototype note: no supplier-scorecard screen exists in prototypes/design/
 * Monopilot Design System/planning(-ext)/ — presentation follows the locked
 * MON-design-system Card/Badge KPI-tile + table conventions used module-wide.
 *
 * UI states handled here: empty (no POs / null KPIs render an honest dash + empty
 * table copy). Loading / error / not-found / permission-denied are resolved on
 * the RSC page (Suspense skeleton + server-side gate).
 */
import React from 'react';

import type { ScorecardPoRow, SupplierScorecard } from '../../../../_actions/freight-actions';

export type ScorecardLabels = {
  kpis: {
    onTime: string;
    onTimeHint: string;
    qtyVariance: string;
    qtyVarianceHint: string;
    ncr: string;
    ncrHint: string;
    openNcr: string;
    openNcrHint: string;
  };
  recent: {
    title: string;
    empty: string;
    columns: {
      po: string;
      status: string;
      expected: string;
      received: string;
      onTime: string;
      variance: string;
    };
    onTimeYes: string;
    onTimeNo: string;
    pending: string;
    none: string;
  };
};

export type ScorecardViewProps = {
  scorecard: SupplierScorecard;
  labels: ScorecardLabels;
  /** Locale string used client-side to format UTC dates without crossing the RSC boundary with a function prop. */
  locale?: string;
};

function pct(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function signedPct(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function KpiTile({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  testId: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`} data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function onTimeTone(pctValue: number | null): 'neutral' | 'good' | 'warn' | 'bad' {
  if (pctValue === null) return 'neutral';
  if (pctValue >= 95) return 'good';
  if (pctValue >= 80) return 'warn';
  return 'bad';
}

function varianceTone(value: number | null): 'neutral' | 'good' | 'warn' | 'bad' {
  if (value === null) return 'neutral';
  const abs = Math.abs(value);
  if (abs <= 2) return 'good';
  if (abs <= 5) return 'warn';
  return 'bad';
}

export function ScorecardView({ scorecard, labels, locale }: ScorecardViewProps) {
  const dateFmt = locale
    ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;
  const fmt = (iso: string | null): string => {
    if (iso === null) return labels.recent.none;
    return dateFmt ? dateFmt.format(new Date(iso)) : iso.slice(0, 10);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="scorecard-view">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="scorecard-kpis">
        <KpiTile
          testId="scorecard-kpi-on-time"
          label={labels.kpis.onTime}
          value={pct(scorecard.onTimePct)}
          hint={labels.kpis.onTimeHint}
          tone={onTimeTone(scorecard.onTimePct)}
        />
        <KpiTile
          testId="scorecard-kpi-qty-variance"
          label={labels.kpis.qtyVariance}
          value={signedPct(scorecard.avgQtyVariancePct)}
          hint={labels.kpis.qtyVarianceHint}
          tone={varianceTone(scorecard.avgQtyVariancePct)}
        />
        <KpiTile
          testId="scorecard-kpi-ncr"
          label={labels.kpis.ncr}
          value={String(scorecard.ncrCount)}
          hint={labels.kpis.ncrHint}
          tone="neutral"
        />
        <KpiTile
          testId="scorecard-kpi-open-ncr"
          label={labels.kpis.openNcr}
          value={String(scorecard.openNcrCount)}
          hint={labels.kpis.openNcrHint}
          tone={scorecard.openNcrCount > 0 ? 'bad' : 'good'}
        />
      </div>

      {/* Recent POs */}
      <div className="card" data-testid="scorecard-recent">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{labels.recent.title}</h3>
        </div>

        {scorecard.recentPos.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400" data-testid="scorecard-recent-empty">
            {labels.recent.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="scorecard-recent-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{labels.recent.columns.po}</th>
                  <th className="px-3 py-2">{labels.recent.columns.status}</th>
                  <th className="px-3 py-2">{labels.recent.columns.expected}</th>
                  <th className="px-3 py-2">{labels.recent.columns.received}</th>
                  <th className="px-3 py-2">{labels.recent.columns.onTime}</th>
                  <th className="px-3 py-2 text-right">{labels.recent.columns.variance}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scorecard.recentPos.map((po) => (
                  <PoRow key={po.id} po={po} labels={labels} fmt={fmt} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PoRow({
  po,
  labels,
  fmt,
}: {
  po: ScorecardPoRow;
  labels: ScorecardLabels;
  fmt: (iso: string | null) => string;
}) {
  const onTimeBadge =
    po.onTime === null ? (
      <span className="badge badge-gray">{labels.recent.pending}</span>
    ) : po.onTime ? (
      <span className="badge badge-green">{labels.recent.onTimeYes}</span>
    ) : (
      <span className="badge badge-red">{labels.recent.onTimeNo}</span>
    );

  const tone = varianceTone(po.qtyVariancePct);
  const varianceClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-slate-400';

  return (
    <tr data-testid={`scorecard-po-${po.poNumber}`}>
      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{po.poNumber}</td>
      <td className="px-3 py-2 text-slate-600">{po.status}</td>
      <td className="px-3 py-2 text-xs text-slate-500">{fmt(po.expectedDelivery)}</td>
      <td className="px-3 py-2 text-xs text-slate-500">{fmt(po.receivedAt)}</td>
      <td className="px-3 py-2">{onTimeBadge}</td>
      <td className={`px-3 py-2 text-right font-mono ${varianceClass}`}>
        {po.qtyVariancePct === null
          ? '—'
          : `${po.qtyVariancePct > 0 ? '+' : ''}${po.qtyVariancePct.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}%`}
      </td>
    </tr>
  );
}
