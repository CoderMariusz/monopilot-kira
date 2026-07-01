import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getDashboardData, type DashboardActivity, type DashboardKpi } from "../_actions/dashboard-summary";
import { eventLabelKey, humanizeCode, resourceLabelKey, shortRef } from "./activity-labels";
import { getQuickActionPermissions } from "./quick-action-permissions";

// Reads the signed-in user's session + org-scoped DB, so this page must render
// per-request (never statically prerendered at build time).
export const dynamic = "force-dynamic";

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

// Quick-action bar — maps to the prototype's 6 buttons (sitemap line 123).
// Some routes land on a module landing page rather than a pre-opened modal;
// that is honest and acceptable per the shell gap brief.
//
// `requires` names the permission gate the action's deep-linked WRITE flow
// enforces server-side. A user without it would hit a `forbidden` 403, so the
// button is hidden rather than dangled as a dead-end (RBAC parity). Read-only
// actions (receive/qualityCheck/createShipment) carry no `requires` — they
// route to module landing pages, not pre-authorized write modals.
type QuickActionGate = "planningWrite" | "runMrp";
const QUICK_ACTIONS: Array<{
  key: string;
  route: string;
  variant: "primary" | "secondary";
  requires?: QuickActionGate;
}> = [
  // F2 — deep-link straight to the specific create modal (both list pages honour
  // `?new=1`, see planning/{work,purchase}-orders/page.tsx) instead of dropping
  // the user on the generic /planning landing page.
  { key: "createWo", route: "/planning/work-orders?new=1", variant: "primary", requires: "planningWrite" },
  { key: "createPo", route: "/planning/purchase-orders?new=1", variant: "primary", requires: "planningWrite" },
  { key: "receive", route: "/warehouse", variant: "secondary" },
  { key: "qualityCheck", route: "/quality", variant: "secondary" },
  { key: "createShipment", route: "/shipping", variant: "secondary" },
  { key: "runMrp", route: "/scheduler", variant: "secondary", requires: "runMrp" },
];

/**
 * Resolve a feed row into a friendly, localized headline + sub-line.
 *
 *   - `headline` = mapped event label (`Dashboard.activity.events.*`) or, for an
 *     unmapped action, a humanized last-segment fallback — never the raw dotted
 *     code.
 *   - `resourceLabel` = mapped resource-type label or humanized fallback.
 *   - `ref` = a human reference (PO/TO/WO number, customer name, …) when the
 *     query resolved one, otherwise a truncated UUID, otherwise omitted.
 */
function describeActivity(
  event: DashboardActivity,
  t: (key: string) => string,
): { headline: string; resourceLabel: string; ref: string | null } {
  const evKey = eventLabelKey(event.action);
  const headline = evKey ? t(`activity.events.${evKey}`) : humanizeCode(event.action);

  const resKey = resourceLabelKey(event.resourceType);
  const resourceLabel = resKey ? t(`activity.resources.${resKey}`) : humanizeCode(event.resourceType);

  const ref = shortRef(event.resourceRef, event.resourceId);
  return { headline, resourceLabel, ref };
}

function kpiColorClass(color: DashboardKpi["color"]): string {
  switch (color) {
    case "green":
      return "kpi green";
    case "amber":
      return "kpi amber";
    case "red":
      return "kpi red";
    default:
      return "kpi";
  }
}

export default async function DashboardRoutePage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const t = await getTranslations("Dashboard");
  const data = await getDashboardData();
  const quickActionPerms = await getQuickActionPermissions();

  // Hide write quick-actions the signed-in role cannot perform (their server
  // action would 403). The authoritative gate is still server-side in each
  // action — this only removes the dead-end button.
  const visibleQuickActions = QUICK_ACTIONS.filter((action) => {
    if (action.requires === "planningWrite") return quickActionPerms.canPlanningWrite;
    if (action.requires === "runMrp") return quickActionPerms.canRunMrp;
    return true;
  });

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="p-8" aria-labelledby="dashboard-route-title">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 id="dashboard-route-title" className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        {data.ok ? (
          <span className="badge badge-green" data-testid="dashboard-live-badge">
            {t("liveBadge")}
          </span>
        ) : (
          <span className="badge badge-amber" data-testid="dashboard-unavailable-badge">
            {t("unavailableBadge")}
          </span>
        )}
      </div>

      {/* KPI row — 5 cards, prototype parity (Active WOs / Pending POs / Low Stock / Quality Holds / Today's Shipments). */}
      <div className="kpi-row" data-testid="dashboard-kpis">
        {data.kpis.map((kpi) => (
          <div key={kpi.key} className={kpiColorClass(kpi.color)} data-testid={`dashboard-kpi-${kpi.key}`}>
            <div className="kpi-label">{t(`kpis.${kpi.key}.label`)}</div>
            <div className="kpi-value">{kpi.value === null ? "—" : kpi.value.toLocaleString(locale)}</div>
            <div className="kpi-change text-slate-400">
              {kpi.notLive ? t("kpiNotLive") : t(`kpis.${kpi.key}.hint`)}
            </div>
          </div>
        ))}
      </div>

      {/* Quick-actions bar — 6 buttons linking to module routes. */}
      <div className="card mt-6">
        <div className="card-head">
          <h2 className="card-title">{t("quickActions.title")}</h2>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="dashboard-quick-actions">
          {visibleQuickActions.map((action) => (
            <Link
              key={action.key}
              href={`/${locale}${action.route}`}
              prefetch={false}
              data-testid={`dashboard-quick-action-${action.key}`}
              className={`btn ${action.variant === "primary" ? "btn-primary" : "btn-secondary"}`}
            >
              {t(`quickActions.${action.key}`)}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Recent activity timeline — latest 10 audit events, org-scoped. */}
        <div className="card" data-testid="dashboard-activity">
          <div className="card-head">
            <h2 className="card-title">{t("activity.title")}</h2>
          </div>
          {data.activity.length === 0 ? (
            <div className="empty-state" data-testid="dashboard-activity-empty">
              <div className="empty-state-icon" aria-hidden>
                🕑
              </div>
              <div className="empty-state-title">{t("activity.emptyTitle")}</div>
              <div className="empty-state-body">{t("activity.emptyBody")}</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.activity.map((event) => {
                const { headline, resourceLabel, ref } = describeActivity(event, t);
                return (
                  <li key={event.id} className="flex items-start gap-3 text-sm" data-testid="dashboard-activity-item">
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800" data-testid="dashboard-activity-headline">
                        {headline} · {resourceLabel}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {ref ? `${ref} — ` : ""}
                        {dateFormatter.format(new Date(event.occurredAt))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* System alerts panel — derived from cheap real signals. */}
        <div className="card" data-testid="dashboard-alerts">
          <div className="card-head">
            <h2 className="card-title">{t("alerts.title")}</h2>
          </div>
          {data.alerts.length === 0 ? (
            <div className="empty-state" data-testid="dashboard-alerts-empty">
              <div className="empty-state-icon" aria-hidden>
                ✅
              </div>
              <div className="empty-state-title">{t("alerts.emptyTitle")}</div>
              <div className="empty-state-body">{t("alerts.emptyBody")}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`alert alert-${alert.severity}`}
                  data-testid={`dashboard-alert-${alert.id}`}
                >
                  <div className="alert-title">{t(`alerts.items.${alert.messageKey}.title`)}</div>
                  <div>{t(`alerts.items.${alert.messageKey}.body`, { count: alert.count })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
