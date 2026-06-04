import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getModuleCount } from "../_actions/skeleton-data";
import { ModuleDataPanel } from "../_components/module-data-panel";

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function TechnicalRoutePage() {
  const t = await getTranslations("Navigation.app.items");
  const s = await getTranslations("Skeleton");
  const result = await getModuleCount("bom_item");

  return (
    <section data-testid="module-landing-technical" className="p-8" aria-labelledby="module-landing-technical-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-technical-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("technical")}
        </h1>
        <ModuleDataPanel
          liveBadge={s("liveBadge")}
          rlsNote={s("rlsNote")}
          unavailableLabel={s("unavailable")}
          formatCount={(count) => s("records", { count })}
          result={result}
        />
        <nav aria-label="Technical sections" className="mt-6 border-t border-slate-200 pt-6">
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <Link
                href="/technical/items"
                data-testid="technical-nav-items"
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <span className="text-base font-semibold text-slate-950">Items</span>
                <span className="mt-1 text-sm text-slate-600">
                  Create and manage raw materials, intermediates, finished goods, co-products and by-products.
                </span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </section>
  );
}
