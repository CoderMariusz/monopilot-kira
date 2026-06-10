"use client";

import { useEffect } from "react";

/**
 * Shell gap #1 — last-resort boundary for errors thrown in the ROOT layout
 * itself (where no other boundary or provider is in scope). It REPLACES the
 * root layout, so it must render its own <html>/<body> and cannot use next-intl
 * (no provider). Static English copy, lightweight, no data fetching. Normal
 * in-app errors are handled by the localized app/[locale]/(app)/error.tsx.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] uncaught root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            background: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
          }}
          data-testid="global-error-boundary"
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              textAlign: "center",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "0.75rem",
              padding: "2rem",
            }}
          >
            <div style={{ fontSize: "2.5rem" }} aria-hidden>
              ⚠️
            </div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0.5rem 0", color: "#0f172a" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1rem" }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest ? (
              <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#94a3b8", marginBottom: "1rem" }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
