'use client';

/**
 * T-132 — NPD Dashboard KPI counters region (standalone canonical slice of T-052).
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *   KPI tile row specifically: lines 59-81.
 *
 * Structural map (prototype → production):
 *   - <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)'}}>  → labelled <section> KPI grid
 *   - 4× <div className="card" style={{borderBottom:'3px solid var(--…)'}}> → @monopilot/ui Card with
 *       a coloured bottom accent (border-b-* utility) — extracted to a reusable KpiCard tile.
 *   - muted eyebrow label  → muted CardHeader title (h3)
 *   - <div style={{fontSize:26,fontWeight:700, color:…}}>{count}</div> → large tabular-nums value
 *   - the prototype's secondary "COUNT(*) where …" hint copy           → a @monopilot/ui Badge per tile,
 *       which also encodes status (so colour is never the only signal — text + badge + value).
 *   - prototype's separate "complete / in-progress / built" KPIs       → mapped to the canonical
 *       by-status breakdown (Done / Pending / Blocked) + an Overdue-alerts tile per the task contract.
 *
 * Deviations (see closeout deviation log):
 *   - Prototype shows 4 tiles (Total / Complete / In-progress / Built). The task contract for this
 *     canonical KPI region is Total + by-status(Done/Pending/Blocked) + Overdue = 5 tiles. We follow
 *     the task contract; the prototype's status semantics map onto the by-status breakdown.
 *   - Canonical NPD term is **FG (Finished Good)**; the prototype's legacy "FA" copy is NOT reproduced
 *     in user-facing strings (MON-domain-npd red-line: FA is a compatibility alias only).
 *
 * Real-data wiring: the parent RSC (T-134) calls getDashboardSummary (T-051) and maps its
 *   `{ summary: { totalActive, fullyComplete, pending, totalBuilt }, perDept[] }` result onto this
 *   `DashboardCountersSummary` contract. This client component performs NO DB / Server Action call.
 *
 * i18n: namespace `npd.dashboardKpi` (distinct from the merged dashboard's `npd.dashboard`).
 * a11y: labelled region; status conveyed by text + badge, never colour alone; error/forbidden as alerts.
 */

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

/**
 * Canonical KPI-region contract. The parent RSC derives this from getDashboardSummary (T-051).
 * Mapping reference (parent's responsibility, T-134):
 *   totalFas           ← summary.totalActive
 *   byStatus.done      ← Σ perDept.done            (or summary.fullyComplete)
 *   byStatus.pending   ← summary.pending           (or Σ perDept.pending)
 *   byStatus.blocked   ← Σ perDept.blocked
 *   overdueAlerts      ← count(days_left < 0)      (launch-alert read, T-051)
 */
export type DashboardCountersSummary = {
  totalFas: number;
  byStatus: {
    done: number;
    pending: number;
    blocked: number;
  };
  overdueAlerts: number;
};

export type DashboardCountersState = 'ready' | 'empty' | 'error' | 'forbidden';

export type DashboardCountersProps = {
  summary: DashboardCountersSummary;
  /** Drives the non-ready UI states (loading lives in the parent RSC Suspense boundary). */
  state?: DashboardCountersState;
};

type Tile = {
  key: string;
  title: string;
  value: number;
  badge: string;
  variant: BadgeVariant;
  accentClassName: string;
  valueClassName: string;
};

function KpiTile({ tile }: { tile: Tile }) {
  return (
    <Card className={`npd-kpi-tile border-b-4 ${tile.accentClassName}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{tile.title}</CardTitle>
        <Badge variant={tile.variant}>{tile.badge}</Badge>
      </CardHeader>
      <CardContent className="pt-2">
        <span
          data-counter-value={tile.title}
          className={`block text-3xl font-bold tabular-nums ${tile.valueClassName}`}
        >
          {tile.value}
        </span>
      </CardContent>
    </Card>
  );
}

export function DashboardCounters({ summary, state = 'ready' }: DashboardCountersProps) {
  const t = useTranslations('npd.dashboardKpi');

  if (state === 'error') {
    return (
      <section aria-label={t('regionLabel')} data-prototype-anchor="npd/fa-screens.jsx:32-174">
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {t('error')}
        </p>
      </section>
    );
  }

  if (state === 'forbidden') {
    return (
      <section aria-label={t('regionLabel')} data-prototype-anchor="npd/fa-screens.jsx:32-174">
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {t('forbidden')}
        </p>
      </section>
    );
  }

  if (state === 'empty') {
    return (
      <section aria-label={t('regionLabel')} data-prototype-anchor="npd/fa-screens.jsx:32-174">
        <p
          role="status"
          className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
        >
          {t('empty')}
        </p>
      </section>
    );
  }

  const overdue = summary.overdueAlerts > 0;

  const tiles: Tile[] = [
    {
      key: 'total',
      title: t('totalTitle'),
      value: summary.totalFas,
      badge: t('totalBadge'),
      variant: 'info',
      accentClassName: 'border-b-blue-500',
      valueClassName: 'text-blue-700',
    },
    {
      key: 'done',
      title: t('doneTitle'),
      value: summary.byStatus.done,
      badge: t('doneBadge'),
      variant: 'success',
      accentClassName: 'border-b-emerald-500',
      valueClassName: 'text-emerald-700',
    },
    {
      key: 'pending',
      title: t('pendingTitle'),
      value: summary.byStatus.pending,
      badge: t('pendingBadge'),
      variant: 'warning',
      accentClassName: 'border-b-amber-500',
      valueClassName: 'text-amber-700',
    },
    {
      key: 'blocked',
      title: t('blockedTitle'),
      value: summary.byStatus.blocked,
      badge: t('blockedBadge'),
      variant: summary.byStatus.blocked > 0 ? 'destructive' : 'secondary',
      accentClassName: 'border-b-slate-500',
      valueClassName: summary.byStatus.blocked > 0 ? 'text-red-700' : 'text-slate-700',
    },
    {
      key: 'overdue',
      title: t('overdueTitle'),
      value: summary.overdueAlerts,
      badge: overdue ? t('overdueBadgeActive') : t('overdueBadgeClear'),
      variant: overdue ? 'destructive' : 'secondary',
      accentClassName: overdue ? 'border-b-red-500' : 'border-b-emerald-500',
      valueClassName: overdue ? 'text-red-700' : 'text-emerald-700',
    },
  ];

  return (
    <section
      aria-label={t('regionLabel')}
      data-prototype-anchor="npd/fa-screens.jsx:32-174"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {tiles.map((tile) => (
        <KpiTile key={tile.key} tile={tile} />
      ))}
    </section>
  );
}

export default DashboardCounters;
