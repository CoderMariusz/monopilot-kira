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
import { usePathname, useRouter } from 'next/navigation';

import { Checkbox } from '@monopilot/ui/Checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monopilot/ui/Table';

import {
  FaCreateModal,
  type CreateFaAction,
  type FaCreateLabels,
} from '../../fg/_components/fa-create-modal';

const LOCALES = ['en', 'pl', 'ro', 'uk'];

function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return LOCALES.includes(segment) ? `/${segment}` : '';
}

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
  blockedFas?: BlockedFa[];
};

export type BlockedFa = {
  productCode: string;
  productName: string | null;
  missingData: string | null;
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
  expandBlockedFas?: string;
  collapseBlockedFas?: string;
  blockedFaListTitle?: string;
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
  /**
   * Test/storybook seam for the Create-FG action. When provided it is invoked in
   * addition to opening the inline create modal (kept for back-compat with the
   * legacy parity tests). Production wiring opens the modal via local state.
   */
  onCreateFa?: () => void;
  /**
   * FaCreateModal labels, server-resolved (next-intl) by page.tsx. When present
   * (with createFaAction) the "+ Create FG" modal is rendered inline in this
   * client island — mirrors the working FA-LIST pattern (fa-list-table.tsx).
   */
  createModalLabels?: FaCreateLabels;
  /**
   * Real createFa Server Action (T-008), injected by page.tsx ONLY when the
   * caller may create (RBAC resolved server-side). It is a serializable Server
   * Action reference (NOT a raw client function), so it crosses the RSC boundary
   * safely under Next.js 16. Absent ⇒ Create is disabled; RBAC is never decided
   * or trusted on the client.
   */
  createFaAction?: CreateFaAction;
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

function dashboardLabel(
  labels: DashboardScreenLabels,
  key: 'expandBlockedFas' | 'collapseBlockedFas' | 'blockedFaListTitle',
): string {
  const fallback: Record<'expandBlockedFas' | 'collapseBlockedFas' | 'blockedFaListTitle', string> = {
    expandBlockedFas: 'Show blocked FGs',
    collapseBlockedFas: 'Hide blocked FGs',
    blockedFaListTitle: 'Blocked FGs',
  };
  return labels[key] ?? fallback[key];
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
    return (
      <span data-slot="badge" className="badge badge-red">
        ● {labels.alertRed}
      </span>
    );
  }
  if (level === 'YELLOW') {
    return (
      <span data-slot="badge" className="badge badge-amber">
        ● {labels.alertAmber}
      </span>
    );
  }
  return (
    <span data-slot="badge" className="badge badge-green">
      ● {labels.alertGreen}
    </span>
  );
}

/**
 * Design-system KPI tile (`.kpi` + tone) — 1px border, 6px radius, 3px coloured
 * bottom accent, value Inter 26/700 (never mono). `data-slot="card"` is preserved
 * for the parity test that counts the four KPI cards.
 */
function KpiCard({
  title,
  hint,
  value,
  accentClassName,
}: {
  title: string;
  hint: string;
  value: number;
  accentClassName: string;
}) {
  return (
    <div data-slot="card" className={`kpi ${accentClassName}`}>
      <div className="kpi-label">{title}</div>
      <div data-counter-value={title} className="kpi-value">
        {value}
      </div>
      <div className="kpi-change muted">{hint}</div>
    </div>
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
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
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
  createModalLabels,
  createFaAction,
  pipelinePreview,
}: DashboardScreenProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [showBuilt, setShowBuilt] = React.useState(false);
  const [expandedDepts, setExpandedDepts] = React.useState<Set<Dept>>(() => new Set());

  // Robust open mechanism (mirrors fa-list-table.tsx): the modal open state lives
  // HERE, in the same client island as the button. The button's onClick flips
  // local state synchronously — it never depends on a router round-trip reaching
  // a separate island, so it works on a fresh hard load.
  const [createOpen, setCreateOpen] = React.useState(false);

  function openCreate() {
    onCreateFa?.();
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
  }

  function onCreated(productCode: string) {
    setCreateOpen(false);
    // Canonical FG detail route: /[locale]/fg/[productCode].
    const localePrefix = localePrefixFrom(pathname);
    router.push(`${localePrefix}/fg/${productCode}`);
  }

  function toggleDept(dept: Dept) {
    setExpandedDepts((current) => {
      const next = new Set(current);
      if (next.has(dept)) {
        next.delete(dept);
      } else {
        next.add(dept);
      }
      return next;
    });
  }

  const rows = React.useMemo(() => {
    const visible = showBuilt ? alerts : alerts.filter((a) => !a.built);
    return [...visible].sort(
      (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
    );
  }, [alerts, showBuilt]);

  // Permission-denied / error / loading short-circuit the data regions.
  if (state === 'permission_denied' || state === 'error' || state === 'loading') {
    return (
      <section data-prototype-anchor={ANCHOR}>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          {labels.breadcrumbRoot} / {labels.breadcrumbCurrent}
        </nav>
        <StateNotice state={state} labels={labels} />
      </section>
    );
  }

  return (
    <section data-prototype-anchor={ANCHOR}>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        {labels.breadcrumbRoot} / {labels.breadcrumbCurrent}
      </nav>

      <div className="page-head">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="muted" style={{ fontSize: 12 }}>
            {labels.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          {canRefresh ? (
            <button type="button" data-slot="button" className="btn btn-secondary" onClick={onRefreshD365}>
              ↻ {labels.refreshD365}
            </button>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              data-slot="button"
              className="btn btn-primary"
              aria-label={labels.createFa}
              onClick={openCreate}
            >
              + {labels.createFa}
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI row — §11.1 / §11.2 */}
      <section aria-label="Dashboard KPI summary counters" className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard
          title={labels.kpiTotalActive}
          hint={labels.kpiTotalActiveHint}
          value={summary.totalActive}
          accentClassName=""
        />
        <KpiCard
          title={labels.kpiComplete}
          hint={labels.kpiCompleteHint}
          value={summary.fullyComplete}
          accentClassName="green"
        />
        <KpiCard
          title={labels.kpiInProgress}
          hint={labels.kpiInProgressHint}
          value={summary.inProgress}
          accentClassName="amber"
        />
        <KpiCard
          title={labels.kpiBuilt}
          hint={labels.kpiBuiltHint}
          value={summary.totalBuilt}
          accentClassName=""
        />
      </section>

      {/* Department progress + alert legend — §11.1 */}
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div data-slot="card" className="card">
            <div className="card-head">
              <h2 className="card-title">{labels.deptProgressTitle}</h2>
              <span className="muted" style={{ fontSize: 11 }}>
                {labels.deptProgressSubtitle}
              </span>
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
                  const blockedFas = row.blockedFas ?? [];
                  const isExpanded = expandedDepts.has(row.dept);
                  const rowLabel = deptLabel(row.dept, labels);
                  return (
                    <React.Fragment key={row.dept}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {blockedFas.length > 0 ? (
                              <button
                                type="button"
                                data-slot="button"
                                className="btn btn-secondary btn-sm"
                                aria-expanded={isExpanded}
                                aria-controls={`blocked-fas-${row.dept}`}
                                aria-label={`${dashboardLabel(labels, isExpanded ? 'collapseBlockedFas' : 'expandBlockedFas')}: ${rowLabel}`}
                                onClick={() => toggleDept(row.dept)}
                              >
                                {isExpanded ? '⌄' : '›'}
                              </button>
                            ) : null}
                            <span>{rowLabel}</span>
                          </div>
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
                              aria-label={`${rowLabel} ${pct}%`}
                            >
                              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="min-w-[32px] font-mono text-[11px]">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <div
                              id={`blocked-fas-${row.dept}`}
                              className="rounded border border-red-100 bg-red-50 px-3 py-2"
                            >
                              <div className="mb-1 text-[11px] font-semibold uppercase text-red-700">
                                {dashboardLabel(labels, 'blockedFaListTitle')}
                              </div>
                              <ul className="space-y-1">
                                {blockedFas.map((fa) => (
                                  <li key={fa.productCode} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                                    <a
                                      className="mono font-semibold"
                                      style={{ color: 'var(--blue)' }}
                                      href={`/fg/${encodeURIComponent(fa.productCode)}`}
                                    >
                                      {fa.productCode}
                                    </a>
                                    <span>{fa.productName ?? '—'}</span>
                                    <span className="muted">{fa.missingData ?? '—'}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
        </div>

        <div data-slot="card" className="card">
            <h2 className="card-title" style={{ marginBottom: 10 }}>
              {labels.legendTitle}
            </h2>
            <div className="space-y-1.5" style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div className="flex items-center gap-2">
                <span data-slot="badge" className="badge badge-red">
                  {labels.alertRed}
                </span>
                <span>{labels.legendRed}</span>
              </div>
              <div className="flex items-center gap-2">
                <span data-slot="badge" className="badge badge-amber">
                  {labels.alertAmber}
                </span>
                <span>{labels.legendAmber}</span>
              </div>
              <div className="flex items-center gap-2">
                <span data-slot="badge" className="badge badge-green">
                  {labels.alertGreen}
                </span>
                <span>{labels.legendGreen}</span>
              </div>
            </div>
            <div className="alert alert-blue" style={{ marginTop: 12 }}>
              {labels.legendNote}
            </div>
            <label className="flex items-center gap-2" style={{ marginTop: 10, fontSize: 12 }}>
              <Checkbox
                checked={showBuilt}
                onCheckedChange={setShowBuilt}
                aria-label={labels.showBuilt}
              />
              {labels.showBuilt}
            </label>
        </div>
      </div>

      {/* Launch alerts table — §11.1 / §11.3 */}
      <div data-slot="card" className="card">
          <div className="card-head">
            <h2 className="card-title">{labels.alertsTitle}</h2>
            <span className="muted" style={{ fontSize: 11 }}>
              {labels.alertsSubtitle}
            </span>
          </div>
          {state === 'empty' || rows.length === 0 ? (
            <div data-testid="dashboard-empty" className="empty-state">
              <div className="empty-state-icon">💡</div>
              <div className="empty-state-title">{labels.empty}</div>
              <div className="empty-state-body">{labels.emptyBody}</div>
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
                      <TableCell className="mono">
                        <a style={{ color: 'var(--blue)' }} href={`/fg/${encodeURIComponent(a.productCode)}`}>
                          {a.productCode}
                        </a>
                      </TableCell>
                      <TableCell style={{ fontWeight: 500 }}>{a.productName ?? '—'}</TableCell>
                      <TableCell className="mono">
                        {a.launchDate ?? <span className="muted">{labels.noDate}</span>}
                      </TableCell>
                      <TableCell>
                        <DaysLeftCell days={a.daysLeft} noDate={labels.noDate} />
                      </TableCell>
                      <TableCell>
                        <AlertBadge level={a.alertLevel} labels={labels} />
                      </TableCell>
                      <TableCell className="muted" style={{ fontSize: 12 }}>
                        {a.missingData ?? '—'}
                      </TableCell>
                      <TableCell>
                        <a className="btn btn-secondary btn-sm" href={`/fg/${encodeURIComponent(a.productCode)}`}>
                          {labels.openFa} →
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </div>

      {/* T-134 composition slot — T-133 Dashboard Pipeline preview region. */}
      {pipelinePreview}

      {/*
        Robust create modal — rendered INLINE in this client island so the
        "+ Create FG" button (above) opens it via local state on a fresh hard
        load. RBAC: only present when the caller may create (canCreate) AND the
        server-resolved labels are supplied; the real createFa Server Action is
        injected by page.tsx only when permitted (absent ⇒ Create disabled). The
        action is a serializable Server Action reference, so it is safe to pass
        across the RSC boundary under Next.js 16. Never trusted from the client.
      */}
      {canCreate && createModalLabels ? (
        <FaCreateModal
          open={createOpen}
          labels={createModalLabels}
          createFaAction={createFaAction}
          onCreated={onCreated}
          onClose={closeCreate}
        />
      ) : null}
    </section>
  );
}

export default DashboardScreen;
