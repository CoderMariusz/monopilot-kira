import type { JSX } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  listPlatformAuditPage,
  type PlatformAuditEntry,
  type PlatformAuditPage,
} from "../../../../../lib/platform/queries";

export const dynamic = "force-dynamic";

type Locale = "en" | "pl" | "uk" | "ro";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ page?: string }>;
};

/**
 * Full platform audit log.
 *
 * Guarded by the (platform) layout (isPlatformAdmin redirect) AND by the
 * guarded reader (listPlatformAuditPage calls assertPlatformAdmin first) —
 * defence in depth. RBAC is never client-trusted. Newest-first, 50/page via
 * ?page=. Reuses the console's dark .plat-top topbar + card + coloured
 * .audit-action chip treatments.
 *
 * Parity anchors (prototypes/design/Monopilot Design System/platform/
 * platform-console-and-org-shell.html):
 *   - .plat-top topbar (lines 82-90, 201-210)
 *   - audit table + coloured .audit-action chips (lines 104-108, 302-315)
 *   - .btn.btn-secondary back / pager controls (lines 40-41)
 */

const PALETTE = {
  sidebar: "#1e293b",
  blue: "#1976D2",
  green050: "#dcfce7",
  green700: "#166534",
  amber050: "#fef3c7",
  amber700: "#92400e",
  blue050: "#dbeafe",
  blue700: "#1e40af",
  red050: "#fee2e2",
  red700: "#991b1b",
  gray050: "#f1f5f9",
  gray100: "#f8fafc",
  gray600: "#475569",
  border: "#e2e8f0",
  text: "#1e293b",
  muted: "#64748b",
} as const;

const AUDIT_CHIP_STYLE: Record<PlatformAuditEntry["kind"], { bg: string; fg: string }> = {
  enter: { bg: PALETTE.red050, fg: PALETTE.red700 },
  exit: { bg: PALETTE.gray050, fg: PALETTE.gray600 },
  write: { bg: PALETTE.amber050, fg: PALETTE.amber700 },
  admin: { bg: PALETTE.blue050, fg: PALETTE.blue700 },
};

type SafeResult<T> = { ok: true; value: T } | { ok: false };

async function safe<T>(promise: Promise<T>): Promise<SafeResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default async function PlatformAuditLogPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const t = await getTranslations({ locale, namespace: "platform" });

  const requestedPage = parsePage(pageParam);
  const result = await safe(listPlatformAuditPage(requestedPage));

  const failed = !result.ok;
  const data: PlatformAuditPage = result.ok
    ? result.value
    : { entries: [], page: requestedPage, hasNext: false };

  const hasPrev = data.page > 1;
  const hasNext = data.hasNext;

  return (
    <div data-testid="platform-audit-log">
      {/* Dark platform topbar — .plat-top. */}
      <div
        data-testid="platform-audit-topbar"
        style={{
          background: PALETTE.sidebar,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 24px",
          height: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            aria-hidden
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "linear-gradient(135deg,#334155,#0f172a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#93c5fd",
              fontSize: 13,
            }}
          >
            ⚑
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.01em" }}>
            {t("brand")} <b style={{ color: "#93c5fd" }}>{t("brandSuffix")}</b>
          </div>
        </div>
        <div
          style={{ fontSize: 12, color: "#64748b", borderLeft: "1px solid #334155", paddingLeft: 14 }}
        >
          {t("auditLogTopbarSubtitle")}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
        <Link
          href={`/${locale}/platform`}
          data-testid="platform-audit-back"
          style={{ ...secondaryBtn, textDecoration: "none", marginBottom: 14 }}
        >
          ← {t("auditLogBack")}
        </Link>

        <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.text, marginTop: 12 }}>
          {t("auditLogTitle")}
        </div>
        <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 1, marginBottom: 16 }}>
          {t("auditLogSubtitle")}
        </div>

        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: `1px solid ${PALETTE.border}`,
            }}
          >
            <div style={{ fontSize: 12, color: PALETTE.muted }}>
              {t("auditLogSubtitle")}
            </div>
            <div data-testid="platform-audit-page-indicator" style={{ fontSize: 12, color: PALETTE.muted }}>
              {t("auditLogPage", { page: data.page })}
            </div>
          </div>

          {failed ? (
            <div data-testid="platform-audit-log-error" style={emptyState}>
              {t("orgsError")}
            </div>
          ) : data.entries.length === 0 ? (
            <div data-testid="platform-audit-log-empty" style={emptyState}>
              {t("auditEmpty")}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>{t("auditColTime")}</th>
                  <th style={th}>{t("auditColActor")}</th>
                  <th style={th}>{t("auditColAction")}</th>
                  <th style={{ ...th, fontFamily: "var(--font-mono, monospace)" }}>{t("auditColOrg")}</th>
                  <th style={th}>{t("auditColDetail")}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const chip = AUDIT_CHIP_STYLE[entry.kind];
                  return (
                    <tr key={entry.id} data-testid={`platform-audit-log-row-${entry.id}`}>
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)" }}>
                        {formatUtc(entry.occurredAt)}
                      </td>
                      <td style={td}>{entry.actorEmail ?? "—"}</td>
                      <td style={td}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: 11,
                            padding: "1px 7px",
                            borderRadius: 4,
                            background: chip.bg,
                            color: chip.fg,
                          }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)" }}>
                        {entry.orgCode ?? "—"}
                      </td>
                      <td style={td}>{entry.detail ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pager — Link-based (no functions cross the boundary). */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: `1px solid ${PALETTE.border}`,
            }}
          >
            {hasPrev ? (
              <Link
                href={`/${locale}/platform/audit?page=${data.page - 1}`}
                data-testid="platform-audit-prev"
                style={{ ...secondaryBtn, textDecoration: "none" }}
              >
                ← {t("auditLogPrev")}
              </Link>
            ) : (
              <span data-testid="platform-audit-prev-disabled" style={{ ...secondaryBtn, opacity: 0.4, cursor: "not-allowed" }}>
                ← {t("auditLogPrev")}
              </span>
            )}
            {hasNext ? (
              <Link
                href={`/${locale}/platform/audit?page=${data.page + 1}`}
                data-testid="platform-audit-next"
                style={{ ...secondaryBtn, textDecoration: "none" }}
              >
                {t("auditLogNext")} →
              </Link>
            ) : (
              <span data-testid="platform-audit-next-disabled" style={{ ...secondaryBtn, opacity: 0.4, cursor: "not-allowed" }}>
                {t("auditLogNext")} →
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${PALETTE.border}`,
  borderRadius: 6,
  marginBottom: 14,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  background: PALETTE.gray100,
  borderBottom: `2px solid ${PALETTE.border}`,
  fontWeight: 600,
  fontSize: 12,
  color: PALETTE.muted,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: `1px solid ${PALETTE.border}`,
  verticalAlign: "middle",
};

const emptyState: React.CSSProperties = {
  padding: "28px 16px",
  textAlign: "center",
  color: PALETTE.muted,
  fontSize: 13,
};

const secondaryBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  border: `1px solid ${PALETTE.border}`,
  fontFamily: "inherit",
  background: "#fff",
  color: PALETTE.text,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
