import { getTranslations } from "next-intl/server";

export default async function DashboardRoutePage() {
  const t = await getTranslations("Navigation.app.items");

  return (
    <section className="p-8" aria-labelledby="dashboard-route-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 id="dashboard-route-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("dashboard")}
        </h1>
      </div>
    </section>
  );
}
