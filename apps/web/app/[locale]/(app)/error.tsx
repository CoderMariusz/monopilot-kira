"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Shell gap #1 — client error boundary for the authenticated (app) shell.
 * Catches runtime errors thrown by any module page rendered under the shell and
 * shows a design-system `.empty-state` card with the error digest + a "Try
 * again" reset (Next's error-boundary reset re-renders the segment). Lightweight:
 * no data fetching. Localized via next-intl (the client provider is in scope
 * because this boundary lives inside the [locale] tree).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors.boundary");

  useEffect(() => {
    // Surface the error for observability; the digest links it to the server log.
    console.error("[app/error] uncaught render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6" data-testid="app-error-boundary">
      <div className="card w-full max-w-md text-center">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            ⚠️
          </div>
          <div className="empty-state-title">{t("title")}</div>
          <div className="empty-state-body">{t("body")}</div>
        </div>
        {error.digest ? (
          <p className="mb-3 font-mono text-xs text-slate-400" data-testid="app-error-digest">
            {t("digestLabel")}: {error.digest}
          </p>
        ) : null}
        <div className="flex justify-center">
          <button type="button" onClick={() => reset()} className="btn btn-primary" data-testid="app-error-retry">
            {t("retry")}
          </button>
        </div>
      </div>
    </main>
  );
}
