import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * Shell gap #1 — root 404 for URLs that never reach the `[locale]` segment
 * (no locale prefix, unmatched top-level path). Rendered inside the root layout
 * (which supplies <html>/<body>). Uses next-intl's request locale fallback so
 * the dashboard link follows the active locale when one is resolvable.
 */
export default async function RootNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("Errors.notFound");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-md text-center" data-testid="root-not-found-card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            🧭
          </div>
          <div className="empty-state-title">{t("title")}</div>
          <div className="empty-state-body">{t("body")}</div>
        </div>
        <div className="mt-2 flex justify-center">
          <Link href={`/${locale}/dashboard`} className="btn btn-primary" data-testid="root-not-found-home">
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    </main>
  );
}
