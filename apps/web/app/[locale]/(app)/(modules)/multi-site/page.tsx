import { getTranslations } from "next-intl/server";

export default async function MultiSiteRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-multi-site" className="p-8" aria-labelledby="module-landing-multi-site-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-multi-site-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("multiSite")}
        </h1>
      </div>
    </section>
  );
}
