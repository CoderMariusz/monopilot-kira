import { getTranslations } from "next-intl/server";

export default async function NpdRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-npd" className="p-8" aria-labelledby="module-landing-npd-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-npd-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("npd")}
        </h1>
      </div>
    </section>
  );
}
