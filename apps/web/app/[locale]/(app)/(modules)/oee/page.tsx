/**
 * 15-OEE — dashboard page (READ-ONLY consumer per D-OEE-1; the oee_snapshots
 * producer is 08-production: apps/web/lib/production/oee-snapshot-producer.ts,
 * fired on WO COMPLETE inside the completion transaction).
 *
 * Prototype parity (honest subset): prototypes/design/Monopilot Design System/oee/
 *   dashboard.jsx (OEE-003 Daily Summary). Structural correspondence:
 *     KPI card row (Factory OEE + A/P/Q micro-stats, output, downtime) → dashboard.jsx:63-101
 *     "OEE by line" table (line cell, OEE/A/P/Q %, output, "—" for null) → dashboard.jsx:120-188
 *   Deliberately NOT built here (15-OEE backlog T-014..T-019): tabs (Six Big Losses /
 *   Changeover), heatmap, sparklines, alert banners, export bar, date pager — this is
 *   the minimal vertical over live snapshots, replacing the module stub.
 *
 * Real Supabase data only: every number comes from `oee_snapshots` via withOrgContext
 * (RLS org-scoped), gated on `oee.dashboard.read`. UI states: loading (Suspense
 * skeleton), empty ("No snapshots yet — complete a work order"), error, denied.
 *
 * See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import { getActiveSiteId } from '../../../../../lib/site/site-context';
import {
  PeriodSelector,
  type PeriodSelectorLabels,
} from '../reporting/_components/period-selector.client';
import {
  parsePeriodSearchParams,
  type ReportingSearchParams,
  type ReportingWindow,
} from '../reporting/_lib/period';
import {
  oeeLinesEmpty,
  oeeLinesHeading,
  periodRangeLabel,
} from './_lib/period-range-label';
import { Sparkline, type SparklinePoint } from '../production/_components/sparkline';
import { getOeeScreen } from './_actions/oee-data';
import {
  OeeLinesTable,
  OeeSnapshotsTable,
  type OeeLinesTableLabels,
  type OeeSnapshotsTableLabels,
} from './_components/oee-tables';
import { canViewAndonKiosk } from './andon/andon-permissions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<ReportingSearchParams>;
};

function OeeSkeleton() {
  return (
    <div data-testid="oee-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function KpiTile({
  testid,
  label,
  value,
  sub,
  badge,
  trend,
  trendLabel,
}: {
  testid: string;
  label: string;
  value: string;
  sub?: string;
  badge?: { label: string; className: string };
  trend?: SparklinePoint[];
  trendLabel?: string;
}) {
  return (
    <Card data-testid={testid} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
            {badge.label}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
      {trend?.length ? (
        <div className="mt-3 h-12 overflow-hidden rounded-md bg-slate-50">
          <Sparkline points={trend} color="#0f172a" ariaLabel={trendLabel ?? label} />
        </div>
      ) : null}
    </Card>
  );
}

function parsePct(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ragBadge(actual: string | null, target: string | null) {
  const actualPct = parsePct(actual);
  const targetPct = parsePct(target);
  if (actualPct == null || targetPct == null) {
    return {
      label: '—',
      className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    };
  }
  if (actualPct >= targetPct) {
    return {
      label: `≥${targetPct}%`,
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    };
  }
  // Mirrors the production dashboard's 85→60 amber band as a target-relative
  // 25 point warning band, with red below that floor.
  if (actualPct >= Math.max(0, targetPct - 25)) {
    return {
      label: `≥${targetPct}%`,
      className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    };
  }
  return {
    label: `≥${targetPct}%`,
    className: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  };
}

function trendPoints(
  rows: { snapshotMinute: string; value: string | null }[],
): SparklinePoint[] {
  return rows.flatMap((row) => {
    const value = parsePct(row.value);
    return value == null ? [] : [{ value, label: row.snapshotMinute }];
  });
}

function AndonHubCard({
  locale,
  labels,
}: {
  locale: string;
  labels: { title: string; body: string; action: string };
}) {
  return (
    <Card
      data-testid="oee-andon-hub-card"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{labels.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{labels.body}</p>
        </div>
        <Link
          href={`/${locale}/oee/andon`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {labels.action}
        </Link>
      </div>
    </Card>
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

async function OeeContent({ window }: { window: ReportingWindow }) {
  const t = await getTranslations('oee');
  const locale = await getLocale();
  // 14-multi-site (CL4): topbar site picker cookie; null = All sites (no filter).
  const siteId = await getActiveSiteId();
  const result = await getOeeScreen({ siteId, window });

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="oee-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="oee-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const { kpis, thresholds, trend, lines, recent } = result.data;

  // Honest empty state — no snapshots have ever been produced for this org.
  if (kpis.snapshotCount === 0 && recent.length === 0) {
    return (
      <Card
        data-testid="oee-empty"
        className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
      >
        <h2 className="text-base font-semibold text-slate-900">{t('empty.title')}</h2>
        <p className="max-w-md text-sm text-slate-500">{t('empty.body')}</p>
      </Card>
    );
  }

  const pct = (v: string | null) => (v == null ? '—' : `${v}%`);
  const rangeLabel = periodRangeLabel(window);
  const sub = `${rangeLabel} · ${t('kpi.snapshots')}: ${kpis.snapshotCount}`;
  const oeeTrend = trendPoints(trend.map((row) => ({ snapshotMinute: row.snapshotMinute, value: row.oee })));
  const availabilityTrend = trendPoints(
    trend.map((row) => ({ snapshotMinute: row.snapshotMinute, value: row.availability })),
  );
  const performanceTrend = trendPoints(
    trend.map((row) => ({ snapshotMinute: row.snapshotMinute, value: row.performance })),
  );
  const qualityTrend = trendPoints(
    trend.map((row) => ({ snapshotMinute: row.snapshotMinute, value: row.quality })),
  );

  const dtf = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const linesLabels: OeeLinesTableLabels = {
    title: oeeLinesHeading(window),
    empty: oeeLinesEmpty(window),
    unassigned: t('unassigned'),
    col: {
      line: t('lines.col.line'),
      wos: t('lines.col.wos'),
      availability: t('col.availability'),
      performance: t('col.performance'),
      quality: t('col.quality'),
      oee: t('col.oee'),
    },
  };

  const snapshotsLabels: OeeSnapshotsTableLabels = {
    title: t('recent.title'),
    empty: t('recent.empty'),
    unassigned: t('unassigned'),
    col: {
      time: t('recent.col.time'),
      line: t('lines.col.line'),
      shift: t('recent.col.shift'),
      wo: t('recent.col.wo'),
      availability: t('col.availability'),
      performance: t('col.performance'),
      quality: t('col.quality'),
      oee: t('col.oee'),
      output: t('recent.col.output'),
      downtime: t('recent.col.downtime'),
      waste: t('recent.col.waste'),
    },
    downtimeFmt: (min) => t('recent.minutes', { min }),
    dateFmt: (iso) => dtf.format(new Date(iso)),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          testid="oee-kpi-oee"
          label={t('kpi.oee')}
          value={pct(kpis.avgOee)}
          sub={sub}
          badge={ragBadge(kpis.avgOee, thresholds.targetOee)}
          trend={oeeTrend}
          trendLabel={t('col.oee')}
        />
        <KpiTile
          testid="oee-kpi-availability"
          label={t('kpi.availability')}
          value={pct(kpis.avgAvailability)}
          sub={sub}
          badge={ragBadge(kpis.avgAvailability, thresholds.minAvailability)}
          trend={availabilityTrend}
          trendLabel={t('col.availability')}
        />
        <KpiTile
          testid="oee-kpi-performance"
          label={t('col.performance')}
          value={pct(kpis.avgPerformance)}
          sub={sub}
          badge={ragBadge(kpis.avgPerformance, thresholds.minPerformance)}
          trend={performanceTrend}
          trendLabel={t('col.performance')}
        />
        <KpiTile
          testid="oee-kpi-quality"
          label={t('kpi.quality')}
          value={pct(kpis.avgQuality)}
          sub={sub}
          badge={ragBadge(kpis.avgQuality, thresholds.minQuality)}
          trend={qualityTrend}
          trendLabel={t('col.quality')}
        />
      </div>

      <OeeLinesTable rows={lines} labels={linesLabels} />
      <OeeSnapshotsTable rows={recent} labels={snapshotsLabels} />
    </div>
  );
}

export default async function OeeRoutePage({ params, searchParams }: PageProps) {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const periodSelection = parsePeriodSearchParams(rawSearchParams);
  const [t, selectorLabels] = await Promise.all([
    getTranslations({ locale, namespace: 'oee' }),
    buildSelectorLabels(locale),
  ]);
  const canViewAndon = await canViewAndonKiosk();

  return (
    <main
      data-screen="oee-dashboard"
      data-testid="module-landing-oee"
      data-prototype-label="oee_daily_summary_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumb={[{ label: t('breadcrumb') }]} />
      {canViewAndon ? (
        <AndonHubCard
          locale={locale}
          labels={{
            title: t('andonHub.title'),
            body: t('andonHub.body'),
            action: t('andonHub.action'),
          }}
        />
      ) : null}
      <PeriodSelector
        period={periodSelection.period}
        fromDate={periodSelection.fromDate}
        toDate={periodSelection.toDate}
        lines={[]}
        labels={selectorLabels}
        showLineFilter={false}
        showSearchFilter={false}
        ariaLabel={t('title')}
        testId="oee-period-selector"
      />
      <Suspense
        key={[periodSelection.period, periodSelection.fromDate, periodSelection.toDate].join(':')}
        fallback={<OeeSkeleton />}
      >
        <OeeContent window={periodSelection.window} />
      </Suspense>
    </main>
  );
}
