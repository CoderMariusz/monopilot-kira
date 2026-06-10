import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * Shell gap #1 — localized 404. Triggered by `notFound()` inside the
 * `[locale]` segment (e.g. a bad sub-route or an invalid locale rejected by the
 * locale layout). Lightweight: no data fetching, design-system `.empty-state`
 * card + a button back to the dashboard.
 */
export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("Errors.notFound");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-md text-center" data-testid="not-found-card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            🧭
          </div>
          <div className="empty-state-title">{t("title")}</div>
          <div className="empty-state-body">{t("body")}</div>
        </div>
        <div className="mt-2 flex justify-center">
          <Link href={`/${locale}/dashboard`} className="btn btn-primary" data-testid="not-found-home">
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    </main>
  );
}
