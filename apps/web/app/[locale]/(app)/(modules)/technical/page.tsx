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
      </div>
    </section>
  );
}
