import type { JSX } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getCachedUser } from "../../../../lib/auth/supabase-server";
import {
  getPlatformKpis,
  listOrganizationsForPlatform,
  listRecentPlatformAudit,
  type PlatformAuditEntry,
  type PlatformKpis,
  type PlatformOrganization,
  type PlatformOrgStatus,
} from "../../../../lib/platform/queries";
import { actAsOrgAction, addPlatformAdminAction } from "../../../../lib/platform/actions";
import { resolvePlatformActorHomeOrgId } from "../../../../lib/platform/actor-home-org";
import { ActAsButton } from "./_components/act-as-button";
import { AddAdminModal } from "./_components/add-admin-modal";
import { ExportOrgsButton, type ExportOrgRow } from "./_components/export-orgs-button";

export const dynamic = "force-dynamic";

type Locale = "en" | "pl" | "uk" | "ro";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

const PALETTE = {
  sidebar: "#1e293b",
  blue: "#1976D2",
  green: "#22c55e",
  green050: "#dcfce7",
  green700: "#166534",
  amber: "#f59e0b",
  amber050: "#fef3c7",
  amber700: "#92400e",
  blue050: "#dbeafe",
  blue700: "#1e40af",
  red: "#ef4444",
  red050: "#fee2e2",
  red700: "#991b1b",
  gray050: "#f1f5f9",
  gray100: "#f8fafc",
  gray300: "#cbd5e1",
  gray600: "#475569",
  border: "#e2e8f0",
  text: "#1e293b",
  muted: "#64748b",
} as const;

const STATUS_STYLE: Record<PlatformOrgStatus, { bg: string; fg: string; dot: string }> = {
  active: { bg: PALETTE.green050, fg: PALETTE.green700, dot: PALETTE.green },
  trial: { bg: PALETTE.amber050, fg: PALETTE.amber700, dot: PALETTE.amber },
  onboarding: { bg: PALETTE.blue050, fg: PALETTE.blue700, dot: PALETTE.blue },
};

const AUDIT_CHIP_STYLE: Record<PlatformAuditEntry["kind"], { bg: string; fg: string }> = {
  enter: { bg: PALETTE.red050, fg: PALETTE.red700 },
  exit: { bg: PALETTE.gray050, fg: PALETTE.gray600 },
  write: { bg: PALETTE.amber050, fg: PALETTE.amber700 },
  admin: { bg: PALETTE.blue050, fg: PALETTE.blue700 },
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 1)
      .toUpperCase() || "P"
  );
}

export default async function PlatformConsolePage({ params }: PageProps): Promise<JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "platform" });

  // The layout already gated to platform admins; still resolve the actor + data
  // through the guarded readers (defence in depth). Any failure surfaces the
  // error state rather than leaking a partial console.
  const [{ data: userData }, orgsResult, kpisResult, auditResult, homeOrgResult] = await Promise.all([
    getCachedUser(),
    safe(listOrganizationsForPlatform()),
    safe(getPlatformKpis()),
    safe(listRecentPlatformAudit(12)),
    safe(resolvePlatformActorHomeOrgId()),
  ]);

  const actorEmail = userData?.user?.email ?? "platform@monopilot";
  const dataFailed = !orgsResult.ok || !kpisResult.ok;

  const orgs: PlatformOrganization[] = orgsResult.ok ? orgsResult.value : [];
  const kpis: PlatformKpis = kpisResult.ok
    ? kpisResult.value
    : { organizations: 0, usersAllOrgs: 0, active: 0, trialOrOnboarding: 0 };
  const audit: PlatformAuditEntry[] = auditResult.ok ? auditResult.value : [];
  const homeOrgId = homeOrgResult.ok ? homeOrgResult.value : null;

  // Pre-format the CSV rows server-side (localised status label) so only plain
  // data crosses into the Export client component — never a formatter function.
  const exportRows: ExportOrgRow[] = orgs.map((org) => ({
    code: org.code,
    name: org.name,
    industry: org.industry ?? "",
    sites: org.siteCount,
    users: org.userCount,
    status: t(`status_${org.status}`),
  }));

  return (
    <div data-testid="platform-console">
      {/* Dark platform topbar — .plat-top (proto lines 82-90, 201-210). */}
      <div
        data-testid="platform-topbar"
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
          style={{
            fontSize: 12,
            color: "#64748b",
            borderLeft: "1px solid #334155",
            paddingLeft: 14,
          }}
        >
          {t("topbarSubtitle")}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#cbd5e1" }}>{actorEmail}</div>
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#334155",
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {initials(actorEmail)}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: PALETTE.muted,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          ⚑ {t("eyebrow")}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 18,
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.text }}>{t("title")}</div>
            <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 1 }}>
              {t("subtitle", { count: kpis.organizations })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Client-side CSV of the rendered orgs — server passes plain data only. */}
            <ExportOrgsButton
              label={t("export")}
              filename="monopilot-organizations.csv"
              headers={[
                t("colCode"),
                t("colName"),
                t("colIndustry"),
                t("colSites"),
                t("colUsers"),
                t("colStatus"),
              ]}
              rows={exportRows}
            />
            {/* Add-platform-admin modal — the server action is server-guarded. */}
            <AddAdminModal
              addPlatformAdminAction={addPlatformAdminAction}
              labels={{
                trigger: t("addAdmin"),
                title: t("addAdminTitle"),
                subtitle: t("addAdminSubtitle"),
                emailLabel: t("addAdminEmailLabel"),
                emailPlaceholder: t("addAdminEmailPlaceholder"),
                cancel: t("addAdminCancel"),
                submit: t("addAdminSubmit"),
                submitting: t("addAdminSubmitting"),
                successAdded: t("addAdminSuccessAdded"),
                successRevived: t("addAdminSuccessRevived"),
                successAlready: t("addAdminSuccessAlready"),
                successSelf: t("addAdminSuccessSelf"),
                errorNotFound: t("addAdminErrorNotFound"),
                errorInvalidEmail: t("addAdminErrorInvalidEmail"),
                errorForbidden: t("addAdminErrorForbidden"),
                errorUnknown: t("addAdminErrorUnknown"),
              }}
            />
          </div>
        </div>

        {/* KPI tiles — .kpi (proto 225-230). */}
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(4,1fr)",
            marginBottom: 16,
          }}
        >
          <KpiTile value={kpis.organizations} label={t("kpiOrganizations")} accent={PALETTE.blue} />
          <KpiTile value={kpis.usersAllOrgs} label={t("kpiUsers")} accent={PALETTE.gray300} />
          <KpiTile value={kpis.active} label={t("kpiActive")} accent={PALETTE.green} />
          <KpiTile value={kpis.trialOrOnboarding} label={t("kpiTrial")} accent={PALETTE.amber} />
        </div>

        {/* Organizations table card. */}
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderBottom: `1px solid ${PALETTE.border}`,
            }}
          >
            <div style={{ fontSize: 12, color: PALETTE.muted }}>
              {t("showingCount", { shown: orgs.length, total: orgs.length })}
            </div>
          </div>

          {dataFailed ? (
            <div data-testid="platform-orgs-error" style={emptyState}>
              {t("orgsError")}
            </div>
          ) : orgs.length === 0 ? (
            <div data-testid="platform-orgs-empty" style={emptyState}>
              {t("orgsEmpty")}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, fontFamily: "var(--font-mono, monospace)" }}>{t("colCode")}</th>
                  <th style={th}>{t("colName")}</th>
                  <th style={th}>{t("colIndustry")}</th>
                  <th style={{ ...th, textAlign: "right" }}>{t("colUsers")}</th>
                  <th style={{ ...th, textAlign: "right" }}>{t("colSites")}</th>
                  <th style={th}>{t("colCreated")}</th>
                  <th style={th}>{t("colLastActivity")}</th>
                  <th style={th}>{t("colStatus")}</th>
                  <th style={{ ...th, textAlign: "right" }}>{t("colActAs")}</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => {
                  const isHome = org.id === homeOrgId;
                  const statusStyle = STATUS_STYLE[org.status];
                  return (
                    <tr key={org.id} data-testid={`platform-org-row-${org.code}`}>
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                        {org.code}
                      </td>
                      <td style={td}>
                        <span style={{ fontWeight: 600 }}>{org.name}</span>
                        {isHome ? (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              color: PALETTE.green700,
                              background: PALETTE.green050,
                              padding: "1px 6px",
                              borderRadius: 4,
                              marginLeft: 6,
                              verticalAlign: "middle",
                            }}
                          >
                            {t("homeTag")}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ ...td, color: PALETTE.muted, fontSize: 12 }}>{org.industry ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                        {org.userCount}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                        {org.siteCount}
                      </td>
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)" }}>
                        {org.createdAt ?? "—"}
                      </td>
                      <td style={{ ...td, color: PALETTE.muted }}>
                        {org.lastActivityAt ? formatRelative(org.lastActivityAt, t) : "—"}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 500,
                            background: statusStyle.bg,
                            color: statusStyle.fg,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{ width: 6, height: 6, borderRadius: "50%", background: statusStyle.dot }}
                          />
                          {t(`status_${org.status}`)}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {isHome ? (
                          <span style={{ color: PALETTE.muted, fontSize: 11 }}>{t("youAreHere")}</span>
                        ) : (
                          <ActAsButton
                            orgId={org.id}
                            label={t("actAs")}
                            dashboardHref={`/${locale}/dashboard`}
                            actAsOrgAction={actAsOrgAction}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent platform audit card. */}
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: `1px solid ${PALETTE.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t("auditTitle")}</div>
              <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 1 }}>{t("auditSubtitle")}</div>
            </div>
            {/* Full-log link → guarded /platform/audit page. */}
            <Link
              href={`/${locale}/platform/audit`}
              data-testid="platform-view-full-log"
              style={{ ...secondaryBtn, padding: "4px 10px", fontSize: 11, textDecoration: "none" }}
            >
              {t("viewFullLog")} →
            </Link>
          </div>

          {audit.length === 0 ? (
            <div data-testid="platform-audit-empty" style={emptyState}>
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
                {audit.map((entry) => {
                  const chip = AUDIT_CHIP_STYLE[entry.kind];
                  return (
                    <tr key={entry.id} data-testid={`platform-audit-row-${entry.id}`}>
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
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)" }}>{entry.orgCode ?? "—"}</td>
                      <td style={td}>{entry.detail ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ fontSize: 12, color: PALETTE.muted, marginTop: 4 }}>{t("footnote")}</p>
      </div>
    </div>
  );
}

// ─── Small server-side helpers ────────────────────────────────────────────────

type SafeResult<T> = { ok: true; value: T } | { ok: false };

async function safe<T>(promise: Promise<T>): Promise<SafeResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

function KpiTile({ value, label, accent }: { value: number; label: string; accent: string }): JSX.Element {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 6,
        padding: "14px 16px",
        borderBottom: `3px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: PALETTE.muted, fontWeight: 500, marginTop: 3 }}>{label}</div>
    </div>
  );
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

function formatRelative(iso: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("relJustNow");
  if (mins < 60) return t("relMinutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("relHours", { n: hours });
  const days = Math.floor(hours / 24);
  return t("relDays", { n: days });
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
