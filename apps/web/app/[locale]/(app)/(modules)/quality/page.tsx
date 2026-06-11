/**
 * Quality module landing (/quality).
 *
 * Replaces the bare skeleton heading with the planning-page nav-card pattern:
 * a "Holds" card (LIVE → /quality/holds, QA-002) plus NCRs / Inspections /
 * Specifications cards honestly disabled ("Coming soon"). The existing live
 * Supabase skeleton data panel (quality_event count via getModuleCount) is kept
 * below the nav so the landing still proves real data on Vercel.
 *
 * i18n: staged quality-holds bundle (getQaHoldsTranslator, FIXED warehouse loader
 * pattern) for the nav copy; the existing Navigation/Skeleton next-intl namespaces
 * are kept for the data panel. No inline strings.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getModuleCount } from "../_actions/skeleton-data";
import { ModuleDataPanel } from "../_components/module-data-panel";
import { getQaHoldsTranslator } from "./qa-holds-labels";

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string }> };

const NAV_CARDS = [
  { key: "holds", href: "/quality/holds", live: true },
  { key: "ncrs", href: null, live: false },
  { key: "inspections", href: null, live: false },
  { key: "specifications", href: "/quality/specifications", live: true },
] as const;

export default async function QualityRoutePage({ params }: PageProps) {
  const { locale } = await params;
  const tq = getQaHoldsTranslator(locale);
  const s = await getTranslations("Skeleton");
  const result = await getModuleCount("quality_event");

  return (
    <section
      data-testid="module-landing-quality"
      data-screen="quality-landing"
      data-prototype-label="quality_dashboard"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8"
      aria-labelledby="module-landing-quality-title"
    >
      <div>
        <h1 id="module-landing-quality-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {tq("landing.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{tq("landing.subtitle")}</p>
      </div>

      <nav aria-label={tq("landing.nav.label")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_CARDS.map((card) => {
            const title = tq(`landing.nav.${card.key}.title`);
            const desc = tq(`landing.nav.${card.key}.desc`);
            if (card.live && card.href) {
              return (
                <li key={card.key}>
                  <Link
                    href={`/${locale}${card.href}`}
                    prefetch={false}
                    data-testid={`quality-nav-${card.key}`}
                    className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <span className="text-base font-semibold text-slate-950">{title}</span>
                    <span className="mt-1 text-sm text-slate-600">{desc}</span>
                  </Link>
                </li>
              );
            }
            return (
              <li key={card.key}>
                <div
                  data-testid={`quality-nav-${card.key}`}
                  aria-disabled="true"
                  className="flex h-full cursor-not-allowed flex-col rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 opacity-60"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-slate-500">
                    {title}
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {tq("landing.comingSoon")}
                    </span>
                  </span>
                  <span className="mt-1 text-sm text-slate-400">{desc}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Existing live Supabase data panel — kept below the nav. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ModuleDataPanel
          liveBadge={s("liveBadge")}
          rlsNote={s("rlsNote")}
          unavailableLabel={s("unavailable")}
          formatCount={(count) => s("records", { count })}
          result={result}
        />
      </div>
    </section>
  );
}
