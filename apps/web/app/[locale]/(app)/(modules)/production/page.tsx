import { getTranslations } from "next-intl/server";

export default async function ProductionRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-production" className="p-8" aria-labelledby="module-landing-production-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-production-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("production")}
        </h1>
      </div>
    </section>
  );
}
