/**
 * Warehouse module landing page (08-warehouse first real surface).
 *
 * Keeps the existing Walking-Skeleton live-data panel (real org-scoped lot count
 * via getModuleCount) and ADDS nav cards to the warehouse sub-areas, mirroring the
 * planning / production NAV_CARDS pattern. Only the License-Plate area is live now;
 * the upcoming areas (grns / inventory / movements / reservations / locations /
 * expiry) render as DISABLED "Coming soon" cards — honest, no dead 404 links — via
 * a `disabled` flag in the card map. They light up as their pages ship.
 *
 * Nav labels are resolved server-side from the staged warehouse-lp bundle (see
 * license-plates/lp-labels.ts) with EN fallback, since the `warehouse` namespace
 * is not yet merged into next-intl.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getModuleCount } from "../_actions/skeleton-data";
import { ModuleDataPanel } from "../_components/module-data-panel";
import { getLpTranslator } from "./license-plates/lp-labels";

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = "force-dynamic";

type WarehouseNavCard = { key: string; href: string; disabled: boolean };

/**
 * Warehouse sub-areas. Only `license-plates` is live; the rest are disabled until
 * their pages land (honest — disabled cards never navigate to a 404).
 */
const WAREHOUSE_NAV_CARDS: WarehouseNavCard[] = [
  { key: "licensePlates", href: "/warehouse/license-plates", disabled: false },
  { key: "grns", href: "/warehouse/grns", disabled: true },
  { key: "inventory", href: "/warehouse/inventory", disabled: true },
  { key: "movements", href: "/warehouse/movements", disabled: true },
  { key: "reservations", href: "/warehouse/reservations", disabled: true },
  { key: "locations", href: "/warehouse/locations", disabled: true },
  { key: "expiry", href: "/warehouse/expiry", disabled: true },
];

type WarehouseRoutePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function WarehouseRoutePage({ params }: WarehouseRoutePageProps) {
  const { locale } = await params;
  const t = await getTranslations("Navigation.app.items");
  const s = await getTranslations("Skeleton");
  const nav = getLpTranslator(locale);
  const result = await getModuleCount("lot");

  return (
    <section data-testid="module-landing-warehouse" className="p-8" aria-labelledby="module-landing-warehouse-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-warehouse-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("warehouse")}
        </h1>
        <ModuleDataPanel
          liveBadge={s("liveBadge")}
          rlsNote={s("rlsNote")}
          unavailableLabel={s("unavailable")}
          formatCount={(count) => s("records", { count })}
          result={result}
        />

        {/* Nav cards → warehouse sub-areas (mirror planning/production NAV_CARDS). */}
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
