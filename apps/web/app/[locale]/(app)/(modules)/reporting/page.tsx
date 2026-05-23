import { getTranslations } from "next-intl/server";

export default async function ReportingRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-reporting" className="p-8" aria-labelledby="module-landing-reporting-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-reporting-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("reporting")}
        </h1>
      </div>
    </section>
  );
}
