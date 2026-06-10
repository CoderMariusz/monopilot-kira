import Link from "next/link";

/**
 * Shell gap #1 — root 404 for URLs that never reach the `[locale]` segment
 * (no locale prefix, unmatched top-level path). Rendered inside the root layout
 * (which supplies <html>/<body>). Kept dependency-light and locale-agnostic
 * (static copy, links to the default-locale dashboard) so it renders even when
 * there is no resolvable request locale. Localized 404s for in-app routes are
 * handled by app/[locale]/not-found.tsx.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-md text-center" data-testid="root-not-found-card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            🧭
          </div>
          <div className="empty-state-title">Page not found</div>
          <div className="empty-state-body">
            The page you are looking for does not exist or may have moved.
          </div>
        </div>
        <div className="mt-2 flex justify-center">
          <Link href="/en/dashboard" className="btn btn-primary" data-testid="root-not-found-home">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
