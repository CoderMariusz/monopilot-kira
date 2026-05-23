import { getTranslations } from "next-intl/server";

export default async function QualityRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-quality" className="p-8" aria-labelledby="module-landing-quality-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-quality-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("quality")}
        </h1>
      </div>
    </section>
  );
}
