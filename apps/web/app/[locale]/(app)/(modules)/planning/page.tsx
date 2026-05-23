import { getTranslations } from "next-intl/server";

export default async function PlanningRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-planning-basic" className="p-8" aria-labelledby="module-landing-planning-basic-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-planning-basic-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("planning")}
        </h1>
      </div>
    </section>
  );
}
