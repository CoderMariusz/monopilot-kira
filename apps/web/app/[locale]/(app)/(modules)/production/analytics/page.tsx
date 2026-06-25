/**
 * 08-Production — Analytics hub sub-page (read-only).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
 *   other-screens.jsx:398-504 (AnalyticsScreen). Structural correspondence:
 *     page-head "Production · Analytics hub"              → other-screens.jsx:400-410
 *     KPI row (OEE · FPQ · yield · waste)                 → other-screens.jsx:412-433
 *     OEE 7-day trend sparkline                           → other-screens.jsx:436-449
 *     Yield by line bars                                  → other-screens.jsx:450-471
 *     Top downtime drivers — 30 day table                → other-screens.jsx:473-499
 *
 * The prototype mocks are replaced 1:1 with real Supabase aggregates (oee_snapshots,
 * wo_outputs, wo_waste_log, downtime_events) via withOrgContext, RLS-scoped, no mocks.
 * Charts use the shared Sparkline SVG (the cost-history pattern) + Pareto bars — NO new
 * chart libraries. The prototype's "Export PDF" / week-over-week deltas are not surfaced
 * (deviation logged in closeout).
 *
 * UI states: loading / empty / error / permission-denied / optimistic (N/A read-only).
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  PeriodSelector,
  type PeriodSelectorLabels,
} from '../../reporting/_components/period-selector.client';
import {
  parsePeriodSearchParams,
  type ReportingSearchParams,
  type ReportingWindow,
} from '../../reporting/_lib/period';
import { ParetoBars, type ParetoBar } from '../_components/pareto-bars';
import { Sparkline, type SparklinePoint } from '../_components/sparkline';
import { getAnalyticsScreen, type TopDowntimeRow } from './_actions/analytics-data';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<ReportingSearchParams>;
};

function AnalyticsSkeleton() {
  return (
    <div data-testid="production-analytics-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function buildSelectorLabels(locale: string): Promise<PeriodSelectorLabels> {
  const t = await getTranslations({ locale, namespace: 'reporting' });
  return {
    today: t('period.today'),
    week: t('period.week'),
    month: t('period.month'),
    quarter: t('period.quarter'),
    last7d: t('period.last7d'),
    last30d: t('period.last30d'),
    custom: t('period.custom'),
    line: t('filter.line'),
    search: t('filter.search'),
    allLines: t('filter.allLines'),
    from: t('filter.from'),
    to: t('filter.to'),
    ariaLabel: t('filter.ariaLabel'),
    periodGroupLabel: t('period.groupLabel'),
  };
}

async function AnalyticsContent({ window }: { window: ReportingWindow }) {
  const t = await getTranslations('production.analytics');
  const locale = await getLocale();
  const result = await getAnalyticsScreen({ window });

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div role="note" data-testid="production-analytics-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" data-testid="production-analytics-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const data = result.data;
  const pctFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = (v: number | null) => (v === null ? t('noData') : `${pctFmt.format(v)}%`);

  const trendPoints: SparklinePoint[] = data.oeeTrend.map((p) => ({ value: p.oeePct, label: p.bucket }));
  const yieldBars: ParetoBar[] = data.yieldByLine.map((r, i) => ({
    key: `${r.lineId}-${i}`,
    label: r.lineId,
    value: r.yieldPct,
    valueLabel: `${pctFmt.format(r.yieldPct)}%`,
    countLabel: '',
    tone: r.yieldPct >= 94 ? 'people' : 'process',
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card data-testid="production-analytics-kpi-oee" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.oee')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{pct(data.oeeAvgPct)}</div>
        </Card>
        <Card data-testid="production-analytics-kpi-fpq" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.fpq')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{pct(data.fpqAvgPct)}</div>
        </Card>
        <Card data-testid="production-analytics-kpi-yield" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.yield')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{pct(data.yieldAvgPct)}</div>
        </Card>
        <Card data-testid="production-analytics-kpi-waste" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.waste')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{pct(data.wastePct)}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('trendTitle')}</h2>
          {trendPoints.length === 0 ? (
            <p data-testid="production-analytics-trend-empty" className="py-8 text-sm text-slate-500">{t('trendEmpty')}</p>
          ) : (
            <Sparkline points={trendPoints} color="var(--blue)" ariaLabel={t('trendAria')} />
          )}
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('yieldTitle')}</h2>
          {yieldBars.length === 0 ? (
            <p data-testid="production-analytics-yield-empty" className="py-8 text-sm text-slate-500">{t('yieldEmpty')}</p>
          ) : (
            <ParetoBars bars={yieldBars} testid="production-analytics-yield" />
          )}
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('topDowntimeTitle')}</h2>
        {data.topDowntime.length === 0 ? (
          <div
            data-testid="production-analytics-downtime-empty"
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
          >
            {t('topDowntimeEmpty')}
          </div>
        ) : (
          <div data-testid="production-analytics-downtime-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">{t('col.category')}</th>
                  <th className="px-3 py-2 font-semibold">{t('col.line')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('col.events')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('col.minutes')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('col.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {data.topDowntime.map((r: TopDowntimeRow, i) => (
                  <tr key={`${r.lineId}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{r.categoryName ?? t('uncategorized')}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{r.lineId}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{r.events}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{r.minutes}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                      {r.events > 0 ? Math.round(r.minutes / r.events) : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default async function AnalyticsPage({ params, searchParams }: PageProps) {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const periodSelection = parsePeriodSearchParams(rawSearchParams);
  const [t, selectorLabels] = await Promise.all([
    getTranslations({ locale, namespace: 'production.analytics' }),
    buildSelectorLabels(locale),
  ]);

  return (
    <main
      data-screen="production-analytics"
      data-prototype-label="analytics_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production'), href: `/${locale}/production` }, { label: t('breadcrumb.analytics') }]}
      />
      <PeriodSelector
        period={periodSelection.period}
        fromDate={periodSelection.fromDate}
        toDate={periodSelection.toDate}
        lines={[]}
        labels={selectorLabels}
        showLineFilter={false}
        showSearchFilter={false}
        ariaLabel={t('title')}
        testId="production-analytics-period-selector"
      />
      <Suspense
        key={[periodSelection.period, periodSelection.fromDate, periodSelection.toDate].join(':')}
        fallback={<AnalyticsSkeleton />}
      >
        <AnalyticsContent window={periodSelection.window} />
      </Suspense>
    </main>
  );
}
