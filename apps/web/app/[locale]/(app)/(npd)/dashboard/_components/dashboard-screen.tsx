'use client';

/**
 * T-052 — NPD Dashboard screen (SCR-01).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *
 * Translation notes applied (translation-notes-npd.md · npd_dashboard 32-174):
 *   - window.NPD_FAS filter/reduce KPI tiles → server aggregates (getDashboardSummary)
 *   - 4 KPI cards with colored border → shadcn Card + border-b-* accent
 *   - Department progress table → getDashboardSummary().perDept
 *   - Launch alerts table with row-level RAG coloring → getLaunchAlerts() + Tailwind bg-*
 *   - showBuilt checkbox → client-side filter over pre-fetched rows (no refetch, §11.7)
 *   - Hard-coded actor / reference date REMOVED (i18n discipline)
 *
 * This is a Client Component: it owns the showBuilt toggle (URL-free client filter).
 * All visible strings arrive as `labels` props built server-side via next-intl so
 * no English copy is inlined here.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type Dept =
  | 'core'
  | 'planning'
  | 'commercial'
  | 'production'
  | 'technical'
  | 'mrp'
  | 'procurement';

export type AlertLevel = 'RED' | 'YELLOW' | 'GREEN';

export type DashboardSummary = {
  totalActive: number;
  fullyComplete: number;
  inProgress: number;
  totalBuilt: number;
};

export type DeptProgress = {
  dept: Dept;
  done: number;
  pending: number;
  blocked: number;
};

export type LaunchAlert = {
  productCode: string;
  productName: string | null;
  launchDate: string | null;
  daysLeft: number | null;
  alertLevel: AlertLevel;
  missingData: string | null;
  built: boolean;
};

export type DashboardScreenLabels = {
  breadcrumbRoot: string;
  breadcrumbCurrent: string;
  title: string;
  subtitle: string;
  refreshD365: string;
  createFa: string;
  kpiTotalActive: string;
  kpiTotalActiveHint: string;
  kpiComplete: string;
  kpiCompleteHint: string;
  kpiInProgress: string;
  kpiInProgressHint: string;
  kpiBuilt: string;
  kpiBuiltHint: string;
  deptProgressTitle: string;
  deptProgressSubtitle: string;
  colDept: string;
  colDone: string;
  colPending: string;
  colBlocked: string;
  colProgress: string;
  legendTitle: string;
  legendRed: string;
  legendAmber: string;
  legendGreen: string;
  legendNote: string;
  showBuilt: string;
  alertsTitle: string;
  alertsSubtitle: string;
  colFaCode: string;
  colProduct: string;
  colLaunch: string;
  colDaysLeft: string;
  colAlert: string;
  colMissing: string;
  alertRed: string;
  alertAmber: string;
  alertGreen: string;
  openFa: string;
  noDate: string;
  deptCore: string;
  deptPlanning: string;
  deptCommercial: string;
  deptProduction: string;
  deptTechnical: string;
  deptMrp: string;
  deptProcurement: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

export type DashboardScreenProps = {
  state?: PageState;
  labels: DashboardScreenLabels;
  canCreate: boolean;
  canRefresh: boolean;
  summary: DashboardSummary;
  perDept: DeptProgress[];
  alerts: LaunchAlert[];
  /** Test/storybook seam for the Refresh-D365 action. */
  onRefreshD365?: () => void;
  /** Test/storybook seam for the Create-FA action. */
  onCreateFa?: () => void;
  /**
   * T-134 — composition slot for the T-133 Dashboard Pipeline preview region.
   * Rendered after the launch-alerts table in the ready layout. Optional so the
   * legacy parity/page tests (which don't compose the preview) stay green.
   */
  pipelinePreview?: React.ReactNode;
};

const ANCHOR = 'npd/fa-screens.jsx:32-174';

function deptLabel(dept: Dept, labels: DashboardScreenLabels): string {
  switch (dept) {
    case 'core':
      return labels.deptCore;
    case 'planning':
      return labels.deptPlanning;
    case 'commercial':
      return labels.deptCommercial;
    case 'production':
      return labels.deptProduction;
    case 'technical':
      return labels.deptTechnical;
    case 'mrp':
      return labels.deptMrp;
    case 'procurement':
      return labels.deptProcurement;
    default:
      return dept;
  }
}

function DaysLeftCell({ days, noDate }: { days: number | null; noDate: string }) {
  if (days === null || days === undefined) {
    return <span className="text-slate-500">{noDate}</span>;
  }
  const tone = days <= 10 ? 'text-red-600' : days <= 21 ? 'text-amber-700' : 'text-slate-600';
  const weight = days <= 21 ? 'font-semibold' : '';
  const text = days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d`;
  return <span className={`font-mono ${tone} ${weight}`}>{text}</span>;
}

function AlertBadge({
  level,
  labels,
}: {
  level: AlertLevel;
  labels: DashboardScreenLabels;
}) {
  if (level === 'RED') {
    return <Badge variant="danger">● {labels.alertRed}</Badge>;
  }
  if (level === 'YELLOW') {
    return <Badge variant="warning">● {labels.alertAmber}</Badge>;
  }
  return <Badge variant="success">● {labels.alertGreen}</Badge>;
}

function KpiCard({
  title,
  hint,
  value,
  accentClassName,
  valueClassName,
}: {
  title: string;
  hint: string;
  value: number;
  accentClassName: string;
  valueClassName?: string;
}) {
  return (
    <Card className={`m-0 border-b-[3px] ${accentClassName}`}>
      <CardContent className="p-3">
        <div className="text-[11px] text-slate-500">{title}</div>
        <div
          data-counter-value={title}
          className={`text-2xl font-bold tabular-nums ${valueClassName ?? ''}`}
        >
          {value}
        </div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </CardContent>
    </Card>
  );
}

function StateNotice({
  state,
  labels,
}: {
  state: PageState;
  labels: DashboardScreenLabels;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function DashboardScreen({
  state = 'ready',
  labels,
  canCreate,
  canRefresh,
  summary,
  perDept,
  alerts,
  onRefreshD365,
  onCreateFa,
  pipelinePreview,
}: DashboardScreenProps) {
  const [showBuilt, setShowBuilt] = React.useState(false);

  const rows = React.useMemo(() => {
    const visible = showBuilt ? alerts : alerts.filter((a) => !a.built);
    return [...visible].sort(
      (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
    );
  }, [alerts, showBuilt]);

  // Permission-denied / error / loading short-circuit the data regions.
  if (state === 'permission_denied' || state === 'error' || state === 'loading') {
    return (
      <section data-prototype-anchor={ANCHOR} className="p-6">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-slate-500">
          {labels.breadcrumbRoot} / {labels.breadcrumbCurrent}
        </nav>
        <StateNotice state={state} labels={labels} />
      </section>
    );
  }

  return (
    <section data-prototype-anchor={ANCHOR} className="space-y-3.5 p-4">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        {labels.breadcrumbRoot} / {labels.breadcrumbCurrent}
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">{labels.title}</h1>
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {canRefresh ? (
            <button
              type="button"
              data-slot="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={onRefreshD365}
            >
              ↻ {labels.refreshD365}
            </button>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              data-slot="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              onClick={onCreateFa}
            >
              + {labels.createFa}
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI row — §11.1 / §11.2 */}
      <section
        aria-label="Dashboard KPI summary counters"
        className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
      >
        <KpiCard
          title={labels.kpiTotalActive}
          hint={labels.kpiTotalActiveHint}
          value={summary.totalActive}
          accentClassName="border-b-blue-500"
        />
        <KpiCard
          title={labels.kpiComplete}
          hint={labels.kpiCompleteHint}
          value={summary.fullyComplete}
          accentClassName="border-b-green-500"
          valueClassName="text-green-700"
        />
        <KpiCard
          title={labels.kpiInProgress}
          hint={labels.kpiInProgressHint}
          value={summary.inProgress}
          accentClassName="border-b-amber-500"
          valueClassName="text-amber-700"
        />
        <KpiCard
          title={labels.kpiBuilt}
          hint={labels.kpiBuiltHint}
          value={summary.totalBuilt}
          accentClassName="border-b-blue-500"
          valueClassName="text-blue-700"
        />
      </section>

      {/* Department progress + alert legend — §11.1 */}
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                {labels.deptProgressTitle}
              </h2>
              <span className="text-[11px] text-slate-500">{labels.deptProgressSubtitle}</span>
            </div>
            <Table aria-label={labels.deptProgressTitle}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.colDept}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {labels.colDone}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {labels.colPending}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {labels.colBlocked}
                  </TableHead>
                  <TableHead scope="col">{labels.colProgress}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perDept.map((row) => {
                  const total = row.done + row.pending + row.blocked;
                  const pct = total ? Math.round((row.done / total) * 100) : 0;
                  const barColor =
                    pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <TableRow key={row.dept}>
                      <TableCell className="font-medium">
                        {deptLabel(row.dept, labels)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.done}</TableCell>
                      <TableCell className="text-right font-mono">{row.pending}</TableCell>
                      <TableCell
                        className={`text-right font-mono ${row.blocked ? 'text-red-600' : ''}`}
                      >
                        {row.blocked}
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${deptLabel(row.dept, labels)} ${pct}%`}
                          >
                            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="min-w-[32px] font-mono text-[11px]">{pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h2 className="mb-2.5 text-sm font-semibold text-slate-900">{labels.legendTitle}</h2>
            <div className="space-y-1.5 text-xs leading-relaxed">
              <div className="flex items-center gap-2">
                <Badge variant="danger">{labels.alertRed}</Badge>
                <span>{labels.legendRed}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="warning">{labels.alertAmber}</Badge>
                <span>{labels.legendAmber}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">{labels.alertGreen}</Badge>
                <span>{labels.legendGreen}</span>
              </div>
            </div>
            <div className="mt-3.5 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
              {labels.legendNote}
            </div>
            <label className="mt-2.5 flex items-center gap-2 text-xs">
              <Checkbox
                checked={showBuilt}
                onCheckedChange={setShowBuilt}
                aria-label={labels.showBuilt}
              />
              {labels.showBuilt}
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Launch alerts table — §11.1 / §11.3 */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{labels.alertsTitle}</h2>
            <span className="text-[11px] text-slate-500">{labels.alertsSubtitle}</span>
          </div>
          {state === 'empty' || rows.length === 0 ? (
            <div
              data-testid="dashboard-empty"
              className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center"
            >
              <p className="text-sm font-medium text-slate-700">{labels.empty}</p>
              <p className="mt-1 text-xs text-slate-500">{labels.emptyBody}</p>
            </div>
          ) : (
            <Table aria-label={labels.alertsTitle}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.colFaCode}</TableHead>
                  <TableHead scope="col">{labels.colProduct}</TableHead>
                  <TableHead scope="col">{labels.colLaunch}</TableHead>
                  <TableHead scope="col">{labels.colDaysLeft}</TableHead>
                  <TableHead scope="col">{labels.colAlert}</TableHead>
                  <TableHead scope="col">{labels.colMissing}</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{labels.openFa}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const rowTone =
                    a.alertLevel === 'RED'
                      ? 'bg-red-50'
                      : a.alertLevel === 'YELLOW'
                        ? 'bg-amber-50'
                        : '';
                  const borderTone =
                    a.alertLevel === 'RED'
                      ? 'border-l-4 border-l-red-500'
                      : a.alertLevel === 'YELLOW'
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-transparent';
                  return (
                    <TableRow key={a.productCode} className={`${rowTone} ${borderTone}`}>
                      <TableCell>
                        <a
                          className="font-mono text-blue-600 hover:underline"
                          href={`/fa/${encodeURIComponent(a.productCode)}`}
                        >
                          {a.productCode}
                        </a>
                      </TableCell>
                      <TableCell className="font-medium">{a.productName ?? '—'}</TableCell>
                      <TableCell className="font-mono">
                        {a.launchDate ?? <span className="text-slate-500">{labels.noDate}</span>}
                      </TableCell>
                      <TableCell>
                        <DaysLeftCell days={a.daysLeft} noDate={labels.noDate} />
                      </TableCell>
                      <TableCell>
                        <AlertBadge level={a.alertLevel} labels={labels} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {a.missingData ?? '—'}
                      </TableCell>
                      <TableCell>
                        <a
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          href={`/fa/${encodeURIComponent(a.productCode)}`}
                        >
                          {labels.openFa} →
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* T-134 composition slot — T-133 Dashboard Pipeline preview region. */}
      {pipelinePreview}
    </section>
  );
}

export default DashboardScreen;
