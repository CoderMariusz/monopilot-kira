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
 * with REAL Supabase reads (public.work_orders, migration 176) via withOrgContext.
 * Honest data policy: purchase_orders / transfer_orders tables DO NOT exist yet,
 * so those KPI tiles + alert panels + schedule tabs render "—" / "module not live
 * yet" (same pattern as the org dashboard Pending POs tile). No fake numbers.
 *
 * Header actions: Create WO links to /planning/work-orders?new=1 (the WO-list
 * route is owned by a sibling lane; link is honest even if it 404s for a few
 * hours). Create PO / Create TO / Run sequencing / Trigger D365 are disabled with
 * a "Not available yet" title.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (zero KPIs + empty
 * schedule/alert copy), error (failed read → banner, never a 500), permission-
 * denied (scheduler.run.read gated → denied panel), optimistic — N/A (read-only).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@monopilot/ui/PageHeader";

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

  const { kpis, alerts, schedule } = result.data;
  const woHrefFor = (id: string) => `/${locale}/planning/work-orders?wo=${id}`;
  const statusLabelFor = (s: string): string => {
    const key = s.toLowerCase();
    return t.has(`woStatus.${key}`) ? t(`woStatus.${key}`) : s;
  };

  const tiles = buildKpiTiles(kpis, t, locale);

  const alertRows: PlanningAlertRow[] = alerts.map((a) => ({
    id: a.id,
    woNumber: a.woNumber,
    reason: t(`alerts.reasons.${a.reasonKey}`),
    severity: a.severity,
    href: woHrefFor(a.id),
  }));

  const scheduleView = buildScheduleView(schedule, locale, woHrefFor, statusLabelFor);
  const scheduledCount = schedule.reduce((acc, day) => acc + day.wos.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <PlanningKpiStrip tiles={tiles} />

      <PlanningAlertPanels
        woAlerts={alertRows}
        labels={{
          woTitle: t("alerts.wo"),
          poTitle: t("alerts.po"),
          toTitle: t("alerts.to"),
          empty: t("alerts.empty"),
          notLive: t("notLive"),
          view: t("alerts.view"),
        }}
      />

      <UpcomingSchedule
        days={scheduleView}
        scheduledCount={scheduledCount}
        labels={{
          woTab: t("upcoming.woTab"),
          poTab: t("upcoming.poTab"),
          toTab: t("upcoming.toTab"),
          notLive: t("notLive"),
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
            labels={{
              createWo: t("actions.createWo"),
              createPo: t("actions.createPo"),
              createTo: t("actions.createTo"),
              runSequencing: t("actions.runSequencing"),
              triggerD365: t("actions.triggerD365"),
              notAvailable: t("actions.notAvailable"),
            }}
          />
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent locale={locale} />
      </Suspense>
    </main>
  );
}
