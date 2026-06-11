/**
 * Warehouse module landing page — WH-001 dashboard (08-warehouse).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   dashboard.jsx:3-213 (data-prototype-label: warehouse_dashboard). LANE-D replaces
 *   the Walking-Skeleton ModuleDataPanel with the real dashboard: a KPI strip
 *   (dashboard.jsx:39-60) + the expiry summary with the soonest-expiring top-5
 *   table (dashboard.jsx:93-128), both computed from the warehouse read actions.
 *   The nav-cards block added by the parallel lanes is PRESERVED untouched.
 *
 * Server Component: reads org-scoped data via the listLPs / getExpiryDashboard /
 * getInventoryByProduct Server Actions (owned by the Codex lane — imported, never
 * authored). RBAC (warehouse.inventory.read) is enforced INSIDE the actions; this
 * page surfaces the `forbidden` reason as a denied panel and never trusts a client
 * flag. The nav cards still render so the user can navigate even when the live read
 * is denied/errored.
 *
 * DEVIATIONS (red-lines): the inventory-value KPI (dashboard.jsx:30) and the FEFO
 * override-rate card (dashboard.jsx:189-207) are OMITTED — no valuation/costing or
 * FEFO-override telemetry is exposed by the warehouse read actions, so there is no
 * honest value to render. The omission is documented in the dashboard client.
 *
 * i18n: the `warehouse` namespace is not yet merged into next-intl, so dashboard
 * labels are resolved server-side from the staged warehouse-d bundle via
 * getWhdTranslator (en + pl real, EN fallback); nav-card labels stay on the
 * warehouse-lp bundle the parallel lane established. No inline JSX strings.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (zero KPIs + empty top-5),
 * error (failed live read → banner, nav cards still usable), permission-denied
 * (forbidden → denied panel). Optimistic — N/A (read-only surface).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getExpiryDashboard } from "./_actions/expiry-actions";
import { getInventoryByProduct } from "./_actions/inventory-actions";
import { listLPs } from "./_actions/lp-actions";
import { getLpTranslator } from "./license-plates/lp-labels";
import { getWhdTranslator } from "./wh-d-labels";
import {
  WarehouseDashboardClient,
  type DashboardExpiryRow,
  type DashboardKpis,
  type DashboardLabels,
} from "./_components/warehouse-dashboard.client";

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = "force-dynamic";

type WarehouseNavCard = { key: string; href: string; disabled: boolean };

/**
 * Warehouse sub-areas. `expiry` is now live (LANE-D). `locations` stays disabled
 * until its page lands (honest — disabled cards never navigate to a 404).
 */
const WAREHOUSE_NAV_CARDS: WarehouseNavCard[] = [
  { key: "inbound", href: "/warehouse/inbound", disabled: false },
  { key: "licensePlates", href: "/warehouse/license-plates", disabled: false },
  { key: "grns", href: "/warehouse/grns", disabled: false },
  { key: "inventory", href: "/warehouse/inventory", disabled: false },
  { key: "movements", href: "/warehouse/movements", disabled: false },
  { key: "reservations", href: "/warehouse/reservations", disabled: false },
  { key: "locations", href: "/warehouse/locations", disabled: true },
  { key: "expiry", href: "/warehouse/expiry", disabled: false },
  // Cross-shell: opens the chrome-less device scanner (owner-reported the
  // scanner was otherwise unreachable from the app).
  { key: "scanner", href: "/scanner/home", disabled: false },
];

/** Active = on-hand statuses (mirror the expiry action's active filter). */
const ACTIVE_LP_STATUSES = new Set(["received", "available", "reserved", "allocated", "quarantine"]);
const QC_HOLD_QA = new Set(["HOLD", "PENDING", "QUARANTINED"]);

type WarehouseRoutePageProps = {
  params: Promise<{ locale: string }>;
};

function buildDashboardLabels(locale: string): DashboardLabels {
  const t = getWhdTranslator(locale);
  return {
    kpi: {
      activeLps: t("dashboard.kpi.activeLps"),
      activeLpsSub: t("dashboard.kpi.activeLpsSub"),
      uniqueSkus: t("dashboard.kpi.uniqueSkus"),
      uniqueSkusSub: t("dashboard.kpi.uniqueSkusSub"),
      expiring7d: t("dashboard.kpi.expiring7d"),
      expiring7dSub: t("dashboard.kpi.expiring7dSub"),
      expiring30d: t("dashboard.kpi.expiring30d"),
      expiring30dSub: t("dashboard.kpi.expiring30dSub"),
      qcHold: t("dashboard.kpi.qcHold"),
      qcHoldSub: t("dashboard.kpi.qcHoldSub"),
      blocked: t("dashboard.kpi.blocked"),
      blockedSub: t("dashboard.kpi.blockedSub"),
    },
    expiry: {
      title: t("dashboard.expiry.title"),
      open: t("dashboard.expiry.open"),
      redCard: t("dashboard.expiry.redCard"),
      redCardSub: t("dashboard.expiry.redCardSub"),
      amberCard: t("dashboard.expiry.amberCard"),
      amberCardSub: t("dashboard.expiry.amberCardSub"),
      top5Title: t("dashboard.expiry.top5Title"),
      columns: {
        lp: t("dashboard.expiry.columns.lp"),
        product: t("dashboard.expiry.columns.product"),
        batch: t("dashboard.expiry.columns.batch"),
        expiry: t("dashboard.expiry.columns.expiry"),
        location: t("dashboard.expiry.columns.location"),
        status: t("dashboard.expiry.columns.status"),
      },
      empty: t("dashboard.expiry.empty"),
      daysLeft: t("dashboard.expiry.daysLeft"),
      expired: t("dashboard.expiry.expired"),
      none: t("dashboard.expiry.none"),
    },
    omitted: {
      inventoryValue: t("dashboard.omitted.inventoryValue"),
      fefoOverride: t("dashboard.omitted.fefoOverride"),
    },
    status: {
      available: t("dashboard.status.available"),
      reserved: t("dashboard.status.reserved"),
      allocated: t("dashboard.status.allocated"),
      received: t("dashboard.status.received"),
      quarantine: t("dashboard.status.quarantine"),
      blocked: t("dashboard.status.blocked"),
    },
  };
}

function daysFromNow(iso: string): number {
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.floor((exp - Date.now()) / 86_400_000);
}

function DashboardSkeleton() {
  return (
    <div data-testid="wh-dashboard-loading" aria-busy="true" className="mt-6 flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DashboardContent({ locale }: { locale: string }) {
  const t = getWhdTranslator(locale);
  const [lpResult, expiryResult] = await Promise.all([listLPs({ limit: 500 }), getExpiryDashboard()]);

  // ── Permission-denied (server-resolved by the actions) ───────────────────────
  if (
    (!lpResult.ok && lpResult.reason === "forbidden") ||
    (!expiryResult.ok && expiryResult.reason === "forbidden")
  ) {
    return (
      <div
        role="note"
        data-testid="wh-dashboard-denied"
        className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t("dashboard.denied")}
      </div>
    );
  }

  // ── Error (failed live read → banner, never a 500) ───────────────────────────
  if (!lpResult.ok || !expiryResult.ok) {
    return (
      <div
        role="alert"
        data-testid="wh-dashboard-error"
        className="mt-6 rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t("dashboard.error")}
      </div>
    );
  }

  // Inventory-by-product is only used for the distinct-SKU count; if it is denied or
  // errors we still render the dashboard, falling back to distinct SKUs from the LP set.
  const invResult = await getInventoryByProduct();

  const lps = lpResult.data;
  const activeLps = lps.filter((r) => ACTIVE_LP_STATUSES.has(r.status));
  const qcHold = lps.filter((r) => QC_HOLD_QA.has(r.qaStatus.toUpperCase())).length;
  const blocked = lps.filter((r) => r.status === "blocked").length;

  const uniqueSkus = invResult.ok
    ? invResult.data.length
    : new Set(activeLps.map((r) => r.itemCode ?? r.id).filter(Boolean)).size;

  const expiring7d = expiryResult.data.redCount;
  const expiring30d = expiryResult.data.amberCount;

  const kpis: DashboardKpis = {
    activeLps: activeLps.length,
    uniqueSkus,
    expiring7d,
    expiring30d,
    qcHold,
    blocked,
  };

  // Soonest-expiring top 5 — getExpiryDashboard rows are already expiry-asc ordered.
  const top5: DashboardExpiryRow[] = expiryResult.data.rows.slice(0, 5).map((r) => ({
    lpId: r.lpId,
    lpNumber: r.lpNumber,
    tier: r.tier,
    itemCode: r.itemCode,
    itemName: r.itemName,
    // getExpiryDashboard does not expose batch number / per-LP status — never fabricated.
    batchNumber: null,
    locationCode: r.locationCode,
    warehouseCode: r.warehouseCode,
    expiryDate: r.expiryDate,
    daysLeft: daysFromNow(r.expiryDate),
    status: "",
  }));

  return (
    <div className="mt-6">
      <WarehouseDashboardClient kpis={kpis} expiryRows={top5} labels={buildDashboardLabels(locale)} locale={locale} />
    </div>
  );
}

export default async function WarehouseRoutePage({ params }: WarehouseRoutePageProps) {
  const { locale } = await params;
  const t = await getTranslations("Navigation.app.items");
  const nav = getLpTranslator(locale);

  return (
    <section
      data-testid="module-landing-warehouse"
      data-screen="warehouse-dashboard"
      data-prototype-label="warehouse_dashboard"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/dashboard.jsx:3-213"
      className="p-8"
      aria-labelledby="module-landing-warehouse-title"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-warehouse-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("warehouse")}
        </h1>

        {/* WH-001 real dashboard (replaces the Walking-Skeleton ModuleDataPanel). */}
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent locale={locale} />
        </Suspense>

        {/* Nav cards → warehouse sub-areas (PRESERVED from the parallel lanes). */}
        <nav aria-label={nav("nav.label")} className="mt-8 border-t border-slate-200 pt-6">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WAREHOUSE_NAV_CARDS.map((card) => {
              const title = nav(`nav.${card.key}.title`);
              const desc = nav(`nav.${card.key}.desc`);
              if (card.disabled) {
                return (
                  <li key={card.key}>
                    <div
                      data-testid={`warehouse-nav-${card.key}`}
                      data-disabled="true"
                      aria-disabled="true"
                      title={nav("nav.comingSoon")}
                      className="flex h-full cursor-not-allowed flex-col rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 opacity-60"
                    >
                      <span className="flex items-center gap-2 text-base font-semibold text-slate-500">
                        {title}
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {nav("nav.comingSoon")}
                        </span>
                      </span>
                      <span className="mt-1 text-sm text-slate-400">{desc}</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={card.key}>
                  <Link
                    href={`/${locale}${card.href}`}
                    data-testid={`warehouse-nav-${card.key}`}
                    className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <span className="text-base font-semibold text-slate-950">{title}</span>
                    <span className="mt-1 text-sm text-slate-600">{desc}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </section>
  );
}
