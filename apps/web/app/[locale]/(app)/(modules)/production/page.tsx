/**
 * T-046 — SCR-08-01 Production Dashboard (08-production module landing page).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
 *   - dashboard.jsx:3-146 (production_dashboard) — page head + KPI strip + Lines/
 *     WO area + quick-nav. Structural correspondence:
 *       PageHeader "Production" + breadcrumb            → dashboard.jsx:48-59
 *       KPI strip (live tiles)                          → dashboard.jsx:71-107
 *       WO list panel                                   → wo-list.jsx:52-101
 *       nav cards → production sub-areas                → dashboard.jsx:145-156 (quick actions)
 *   - wo-list.jsx:3-104 (wo_list) — the WO table + status-tab counts.
 *
 * The prototype's LINES / EVENTS_FEED / WOS mock arrays are replaced 1:1 with real
 * Supabase reads (wo_executions, wo_outputs, downtime_events, oee_snapshots,
 * work_orders) via withOrgContext — RLS-scoped, no mocks. The deprecated
 * `release_wo_modal` / "+ Release WO" control is never rendered (release lives in
 * 04-planning); planned WOs carry a Planning deep-link instead.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (zero KPIs + empty WO-list
 * copy), error (failed read → error banner), permission-denied (production.oee.read
 * gated → denied panel, action hidden not disabled), optimistic — N/A (read-only).
 *
 * RBAC: server-resolved `production.oee.read` (migration 185). The client never
 * re-queries and never trusts a client-side permission flag.
 *
 * See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
 */
import Link from 'next/link';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getProductionDashboard,
  type WoExecStatus,
  type WoListRow,
} from './_actions/dashboard-data';
import { KpiStrip, type KpiTile, type KpiTone } from './_components/kpi-strip';
import { WoListTable, type WoListLabels, type WoRowView } from './_components/wo-list-table';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type NavCard = { key: string; href: string };

// Nav cards → the Production sub-areas + cross-module reads. The WO-list / detail /
// waste / downtime / shifts / analytics routes are owned by sibling agents
// (T-047..T-051) — this landing page only links to them. OEE / Quality / Planning
// are cross-module landings that already exist.
const NAV_CARDS: NavCard[] = [
  { key: 'workOrders', href: '/production/wos' },
  { key: 'downtime', href: '/production/downtime' },
  { key: 'waste', href: '/production/waste' },
  { key: 'changeover', href: '/production/changeover' },
  { key: 'changeovers', href: '/production/changeovers' },
  { key: 'shifts', href: '/production/shifts' },
  { key: 'analytics', href: '/production/analytics' },
  { key: 'oee', href: '/oee' },
  { key: 'quality', href: '/quality' },
  // Cross-shell: opens the chrome-less device scanner (owner-reported the
  // scanner was otherwise unreachable from the app).
  { key: 'scanner', href: '/scanner/home' },
];

const KG_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Skeleton placeholder matching the eventual layout (no CLS). */
function DashboardSkeleton() {
  return (
    <div data-testid="production-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DashboardContent({ locale }: { locale: string }) {
  const t = await getTranslations('production.dashboard');
  const wosT = await getTranslations('production.wos');
  const result = await getProductionDashboard();

  // ── Permission-denied state (server-resolved; action hidden, not disabled) ───
  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="production-dashboard-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }

  // ── Error state (failed live read → banner, never a 500) ─────────────────────
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="production-dashboard-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const data = result.data;

  // ── KPI tiles (4 live, in prototype order) ──────────────────────────────────
  const outputVal = `${KG_FMT.format(Math.round(data.outputTodayKg))} kg`;
  const oeeVal = data.oeeCurrentPct === null ? t('kpi.oee.none') : `${data.oeeCurrentPct.toFixed(1)}%`;

  const tiles: KpiTile[] = [
    {
      key: 'wo-in-progress',
      label: t('kpi.woInProgress.label'),
      value: `${data.woInProgress} / ${data.woActiveTotal}`,
      sub: t('kpi.woInProgress.sub'),
      tone: data.woInProgress > 0 ? 'info' : 'default',
    },
    {
      key: 'output-today',
      label: t('kpi.outputToday.label'),
      value: outputVal,
      sub: t('kpi.outputToday.sub'),
      tone: data.outputTodayKg > 0 ? 'success' : 'default',
    },
    {
      key: 'oee-current',
      label: t('kpi.oee.label'),
      value: oeeVal,
      sub: t('kpi.oee.sub'),
      tone: oeeTone(data.oeeCurrentPct),
    },
    {
      key: 'open-downtime',
      label: t('kpi.downtime.label'),
      value: String(data.openDowntime),
      sub: t('kpi.downtime.sub'),
      tone: data.openDowntime > 0 ? 'danger' : 'default',
    },
  ];

  // ── WO list rows (view models; i18n + formatting owned here) ─────────────────
  const statusLabel = (s: WoExecStatus): string => t(`woStatus.${s}`);
  const woLabels: WoListLabels = {
    title: t('woList.title', { count: data.woRows.length }),
    emptyCopy: t('woList.empty'),
    allergenBadge: t('woList.allergenBadge'),
    overProductionListBadge: wosT('overProduction.listBadge'),
    planningLink: t('woList.planningLink'),
    col: {
      wo: t('woList.col.wo'),
      line: t('woList.col.line'),
      status: t('woList.col.status'),
      planned: t('woList.col.planned'),
      progress: t('woList.col.progress'),
      output: t('woList.col.output'),
    },
  };
  const woRows: WoRowView[] = data.woRows.map((r: WoListRow) => ({
    id: r.id,
    woNumber: r.woNumber,
    status: r.status,
    statusLabel: statusLabel(r.status),
    // Names sweep: human line code + product name with honest UUID-fragment
    // fallback for mig-259 orphan demo WOs.
    lineLabel: r.lineCode ?? (r.lineId ? r.lineId.slice(0, 8) : '—'),
    productName: r.productName ?? null,
    itemLabel: r.itemCode ?? (r.productName ? '' : r.productId ? r.productId.slice(0, 8) : '—'),
    plannedLabel: `${KG_FMT.format(Math.round(r.plannedKg))} kg`,
    producedLabel: r.producedKg === null ? '—' : `${KG_FMT.format(Math.round(r.producedKg))} kg`,
    progressPct: r.progressPct,
    allergenGate: r.allergenGate,
    overProductionFlagged: r.overProductionFlagged,
    planningHref: `/${locale}/planning/work-orders`,
    detailHref: `/${locale}/production/wos/${r.id}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip tiles={tiles} />

      <WoListTable rows={woRows} labels={woLabels} />

      {/* Nav cards → Production sub-areas + cross-module reads */}
      <nav aria-label={t('nav.label')} className="border-t border-slate-200 pt-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_CARDS.map((card) => (
            <li key={card.key}>
              <Link
                href={`/${locale}${card.href}`}
                data-testid={`production-nav-${card.key}`}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <span className="text-base font-semibold text-slate-950">{t(`nav.${card.key}.title`)}</span>
                <span className="mt-1 text-sm text-slate-600">{t(`nav.${card.key}.desc`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** OEE tone: world-class ≥85 success, ≥60 info, ≥40 warning, else danger; null neutral. */
function oeeTone(pct: number | null): KpiTone {
  if (pct === null) return 'default';
  if (pct >= 85) return 'success';
  if (pct >= 60) return 'info';
  if (pct >= 40) return 'warning';
  return 'danger';
}

export default async function ProductionDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('production.dashboard');

  return (
    <main
      data-screen="production-dashboard"
      data-prototype-label="production_dashboard"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production') }, { label: t('breadcrumb.dashboard') }]}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent locale={locale} />
      </Suspense>
    </main>
  );
}
