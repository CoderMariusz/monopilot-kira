/**
 * P-L5 — SCREEN-01 Planning Dashboard (04-planning module landing page).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   dashboard.jsx:4-262 (plan_dashboard):
 *     page head + breadcrumb + header actions   → dashboard.jsx:19-30
 *     KPI strip                                  → dashboard.jsx:32-50
 *     alert columns (WO/PO/TO)                   → dashboard.jsx:62-126
 *     upcoming-schedule tabs (WO/PO/TO)          → dashboard.jsx:138-231
 *
 * The prototype's PLAN_KPIS / WO_ALERTS / UPCOMING_WOS mock arrays are replaced
 * with REAL Supabase reads (work_orders mig 176, purchase_orders mig 262,
 * transfer_orders mig 263) via withOrgContext. W9-M2 removed the stale
 * "module not live yet" PO/TO placeholders — those tables are live now, so the
 * PO/TO KPI tiles show real open counts and the PO/TO alert panels show real
 * overdue documents. No fake numbers.
 *
 * Header actions: Create WO/PO/TO link to the live screens. Run sequencing /
 * Trigger D365 stay disabled with a "Not available yet" title (no sequencing
 * solver / D365 backend exists yet — that copy is still true).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (zero KPIs + empty
 * schedule/alert copy), error (failed read → banner, never a 500), permission-
 * denied (scheduler.run.read gated → denied panel), optimistic — N/A (read-only).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@monopilot/ui/PageHeader";

/** Sub-module deep links (the prototype sidebar's pos/tos/suppliers screens). */
const PLANNING_NAV_CARDS = [
  { key: "workOrders", href: "/planning/work-orders" },
  { key: "purchaseOrders", href: "/planning/purchase-orders" },
  { key: "transferOrders", href: "/planning/transfer-orders" },
  { key: "suppliers", href: "/planning/suppliers" },
  { key: "mrp", href: "/planning/mrp" },
  // CL2 — reorder thresholds config (mig 178, T-045 Material Demand).
  { key: "reorderThresholds", href: "/planning/reorder-thresholds" },
  // W8 — line schedule board (gantt.jsx SCREEN-08); replaces the sequencing stub.
  { key: "schedule", href: "/planning/schedule" },
] as const;

import {
  getPlanningDashboard,
  type PlanningKpi,
  type PlanningScheduleDay,
} from "./_actions/dashboard-data";
import { PlanningKpiStrip, type PlanningKpiTile } from "./_components/kpi-strip";
import { PlanningAlertPanels, type PlanningAlertRow } from "./_components/alert-panels";
import { UpcomingSchedule, type ScheduleDayView } from "./_components/upcoming-schedule";
import { PlanningHeaderActions } from "./_components/header-actions";

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = "force-dynamic";

type PlanningPageProps = {
  params: Promise<{ locale: string }>;
};

/** Skeleton placeholder matching the eventual layout (no CLS). */
function DashboardSkeleton() {
  return (
    <div data-testid="planning-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildKpiTiles(
  kpis: PlanningKpi[],
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: string,
): PlanningKpiTile[] {
  return kpis.map((kpi) => ({
    key: kpi.key,
    label: t(`kpis.${kpi.key}.label`),
    value: kpi.value === null ? "—" : kpi.value.toLocaleString(locale),
    sub: kpi.notLive ? t("kpiNotLive") : t(`kpis.${kpi.key}.hint`),
    color: kpi.color,
    notLive: kpi.notLive,
  }));
}

function buildScheduleView(
  schedule: PlanningScheduleDay[],
  locale: string,
  woHrefFor: (id: string) => string,
  statusLabelFor: (s: string) => string,
): ScheduleDayView[] {
  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return schedule.map((day) => ({
    dateKey: day.date,
    label: dayFmt.format(new Date(`${day.date}T00:00:00Z`)),
    rows: day.wos.map((wo) => ({
      id: wo.id,
      woNumber: wo.woNumber,
      statusLabel: statusLabelFor(wo.status),
      time: timeFmt.format(new Date(wo.scheduledStart)),
      href: woHrefFor(wo.id),
    })),
  }));
}

async function DashboardContent({ locale }: { locale: string }) {
  const t = await getTranslations("Planning");
  const result = await getPlanningDashboard();

  // ── Permission-denied state (server-resolved) ────────────────────────────────
  if (!result.ok && result.reason === "forbidden") {
    return (
      <div
        role="note"
        data-testid="planning-dashboard-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t("denied")}
      </div>
    );
  }

  // ── Error state (failed live read → banner, never a 500) ─────────────────────
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="planning-dashboard-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t("error")}
      </div>
    );
  }

  const { kpis, alerts, poAlerts, toAlerts, schedule } = result.data;
  const woHrefFor = (id: string) => `/${locale}/planning/work-orders?wo=${id}`;
  const statusLabelFor = (s: string): string => {
    const key = s.toLowerCase();
    return t.has(`woStatus.${key}`) ? t(`woStatus.${key}`) : s;
  };

  const tiles = buildKpiTiles(kpis, t, locale);

  const alertRows: PlanningAlertRow[] = alerts.map((a) => ({
    id: a.id,
    refNumber: a.woNumber,
    reason: t(`alerts.reasons.${a.reasonKey}`),
    severity: a.severity,
    href: woHrefFor(a.id),
  }));
  const poAlertRows: PlanningAlertRow[] = poAlerts.map((a) => ({
    id: a.id,
    refNumber: a.refNumber,
    reason: t(`alerts.reasons.${a.reasonKey}`),
    severity: a.severity,
    href: `/${locale}/planning/purchase-orders/${a.id}`,
  }));
  const toAlertRows: PlanningAlertRow[] = toAlerts.map((a) => ({
    id: a.id,
    refNumber: a.refNumber,
    reason: t(`alerts.reasons.${a.reasonKey}`),
    severity: a.severity,
    href: `/${locale}/planning/transfer-orders/${a.id}`,
  }));

  const scheduleView = buildScheduleView(schedule, locale, woHrefFor, statusLabelFor);
  const scheduledCount = schedule.reduce((acc, day) => acc + day.wos.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <PlanningKpiStrip tiles={tiles} />

      <PlanningAlertPanels
        woAlerts={alertRows}
        poAlerts={poAlertRows}
        toAlerts={toAlertRows}
        labels={{
          woTitle: t("alerts.wo"),
          poTitle: t("alerts.po"),
          toTitle: t("alerts.to"),
          empty: t("alerts.empty"),
          view: t("alerts.view"),
        }}
      />

      <UpcomingSchedule
        days={scheduleView}
        scheduledCount={scheduledCount}
        poListHref={`/${locale}/planning/purchase-orders`}
        toListHref={`/${locale}/planning/transfer-orders`}
        labels={{
          woTab: t("upcoming.woTab"),
          poTab: t("upcoming.poTab"),
          toTab: t("upcoming.toTab"),
          openPos: t("upcoming.openPos"),
          openTos: t("upcoming.openTos"),
          empty: t("upcoming.empty"),
          woCol: t("upcoming.woCol"),
          statusCol: t("upcoming.statusCol"),
          timeCol: t("upcoming.timeCol"),
        }}
      />
    </div>
  );
}

export default async function PlanningRoutePage({ params }: PlanningPageProps) {
  const { locale } = await params;
  const t = await getTranslations("Planning");

  return (
    <main
      data-screen="planning-dashboard"
      data-prototype-label="plan_dashboard"
      data-testid="module-landing-planning-basic"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        breadcrumb={[{ label: t("breadcrumb.planning") }, { label: t("breadcrumb.dashboard") }]}
        actions={
          <PlanningHeaderActions
            createWoHref={`/${locale}/planning/work-orders?new=1`}
            createPoHref={`/${locale}/planning/purchase-orders`}
            createToHref={`/${locale}/planning/transfer-orders`}
            labels={{
              createWo: t("actions.createWo"),
              createPo: t("actions.createPo"),
              createTo: t("actions.createTo"),
              runSequencing: t("actions.runSequencing"),
              // Honest copy: the optimizer is still not built — the title now
              // points at the live /planning/schedule board instead.
              runSequencingHint: t("actions.runSequencingHint"),
              triggerD365: t("actions.triggerD365"),
              notAvailable: t("actions.notAvailable"),
            }}
          />
        }
      />
      {/* Sub-module nav cards (mirrors production/page.tsx NAV_CARDS): the
          planning prototype reaches WOs/POs/TOs/Suppliers via its sidebar
          (prototypes/planning/app.jsx:7-25); the app exposes them as cards. */}
      <nav aria-label={t("nav.label")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANNING_NAV_CARDS.map((card) => (
            <li key={card.key}>
              <Link
                href={`/${locale}${card.href}`}
                prefetch={false}
                data-testid={`planning-nav-${card.key}`}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <span className="text-base font-semibold text-slate-950">{t(`nav.${card.key}.title`)}</span>
                <span className="mt-1 text-sm text-slate-600">{t(`nav.${card.key}.desc`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent locale={locale} />
      </Suspense>
    </main>
  );
}
