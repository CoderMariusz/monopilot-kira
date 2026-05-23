import { getTranslations } from "next-intl/server";

export default async function WarehouseRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section data-testid="module-landing-warehouse" className="p-8" aria-labelledby="module-landing-warehouse-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="module-landing-warehouse-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("warehouse")}
        </h1>
      </div>
    </section>
  );
}
