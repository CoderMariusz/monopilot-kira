import { getTranslations } from "next-intl/server";

export default async function SchedulerRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-planning-ext" className="p-8" aria-labelledby="module-landing-planning-ext-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-planning-ext-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("scheduler")}
        </h1>
      </div>
    </section>
  );
}
