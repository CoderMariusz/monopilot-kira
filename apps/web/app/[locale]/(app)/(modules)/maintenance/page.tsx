import { getTranslations } from "next-intl/server";

export default async function MaintenanceRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-maintenance" className="p-8" aria-labelledby="module-landing-maintenance-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-maintenance-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("maintenance")}
        </h1>
      </div>
    </section>
  );
}
