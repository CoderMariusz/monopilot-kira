import { getTranslations } from "next-intl/server";

import { getOrgSummary } from "../_actions/skeleton-data";

// Reads the signed-in user's session + org-scoped DB, so this page must render
// per-request (never statically prerendered at build time).
export const dynamic = "force-dynamic";

const METRIC_KEYS = ["users", "workOrders", "lots", "qualityEvents", "shipments", "bomItems"] as const;

export default async function DashboardRoutePage() {
  const t = await getTranslations("Navigation.app.items");
  const s = await getTranslations("Skeleton");
  const summary = await getOrgSummary();

  return (
    <section className="p-8" aria-labelledby="dashboard-route-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="dashboard-route-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("dashboard")}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{s("summary.subtitle")}</p>

        <div data-testid="dashboard-org-summary" className="mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {s("liveBadge")}
          </span>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">{s("summary.title")}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {METRIC_KEYS.map((key) => {
              const value = summary[key];
              return (
                <div
                  key={key}
                  data-testid={`dashboard-metric-${key}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{s(`summary.${key}`)}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {value === null ? s("summary.unavailable") : value.toLocaleString()}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-4 text-xs text-slate-500">{s("rlsNote")}</p>
        </div>
      </div>
    </section>
  );
}
