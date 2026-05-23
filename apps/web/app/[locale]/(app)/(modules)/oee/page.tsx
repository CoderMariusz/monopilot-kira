import { getTranslations } from "next-intl/server";

export default async function OeeRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-oee" className="p-8" aria-labelledby="module-landing-oee-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-oee-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("oee")}
        </h1>
      </div>
    </section>
  );
}
