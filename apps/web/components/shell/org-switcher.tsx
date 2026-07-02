"use client";

/**
 * Platform super-admin org switcher — rendered in the app topbar ONLY when the
 * server layout resolves `isPlatformAdmin` true (the parent AppTopbar gates it).
 *
 * Visual parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .org-switcher / .org-trigger / .org-panel / .op-row / .op-foot (lines 128-150,
 *   361-382). The trigger flips to the strong-red `.act` treatment when acting-as.
 *
 * Behaviour mirrors components/shell/site-switcher.tsx (useTransition + router.
 * refresh after a server action), but the target actions are the audited
 * platform act-as flow:
 *   - pick another org  → actAsOrgAction(orgId)
 *   - pick the home org → exitActAsAction()
 * then router.refresh() so the whole shell re-reads under the new org context.
 */

import type { JSX } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type OrgSwitcherOrg = {
  id: string;
  code: string;
  name: string;
  industry: string | null;
  siteCount: number;
  /**
   * Pre-formatted "N sites" label, translated SERVER-SIDE and passed as a plain
   * string. We must NOT pass a formatter function across the server→client
   * boundary (React refuses to serialize functions) — that crashed the whole
   * shell for platform admins. Optional so data-layer objects (which only carry
   * siteCount) still satisfy the type; the topbar fills it in.
   */
  sitesText?: string;
};

export type OrgSwitcherLabels = {
  /** Accessible name for the trigger button. */
  trigger: string;
  homeHeading: string;
  actAsHeading: string;
  footnote: string;
};

export type OrgSwitcherProps = {
  /** The platform admin's home org. */
  homeOrg: OrgSwitcherOrg;
  /** Other orgs the admin may act as. */
  actAsOrgs: OrgSwitcherOrg[];
  /** True when currently acting inside a non-home org (ctx.actAsOrg). */
  isActingAs: boolean;
  /** The org currently in context (home when not acting-as, else the target). */
  currentOrg: OrgSwitcherOrg;
  labels: OrgSwitcherLabels;
  actAsOrgAction: (orgId: string) => Promise<{ ok: boolean } | { ok: false; error: string }>;
  exitActAsAction: () => Promise<{ ok: boolean } | { ok: false; error: string }>;
};

function glyphFor(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("");
  return (letters || name).slice(0, 2).toUpperCase();
}

const PALETTE = {
  blue: "#1976D2",
  blue050: "#dbeafe",
  blue700: "#1e40af",
  red: "#ef4444",
  red050: "#fee2e2",
  red700: "#991b1b",
  border: "#e2e8f0",
  gray050: "#f1f5f9",
  gray600: "#475569",
  muted: "#64748b",
  text: "#1e293b",
} as const;

export function OrgSwitcher({
  homeOrg,
  actAsOrgs,
  isActingAs,
  currentOrg,
  labels,
  actAsOrgAction,
  exitActAsAction,
}: OrgSwitcherProps): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click (matches the prototype's document click handler).
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  function pickActAs(orgId: string) {
    setOpen(false);
    startTransition(async () => {
      await actAsOrgAction(orgId);
      router.refresh();
    });
  }

  function pickHome() {
    setOpen(false);
    startTransition(async () => {
      await exitActAsAction();
      router.refresh();
    });
  }

  const glyph = glyphFor(currentOrg.name);

  return (
    <div
      ref={rootRef}
      data-testid="app-topbar-org-switcher"
      data-slot="org-switcher"
      style={{ position: "relative" }}
    >
      <button
        type="button"
        data-testid="app-topbar-org-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.trigger}
        disabled={isPending}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "6px 10px",
          background: "#fff",
          border: `1px solid ${isActingAs ? PALETTE.red : PALETTE.border}`,
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "inherit",
          cursor: isPending ? "wait" : "pointer",
          color: PALETTE.text,
          minWidth: 210,
          boxShadow: isActingAs ? `0 0 0 3px ${PALETTE.red050}` : undefined,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: isActingAs ? PALETTE.red050 : PALETTE.blue050,
            color: isActingAs ? PALETTE.red700 : PALETTE.blue700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {glyph}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 10.5,
            color: PALETTE.muted,
          }}
        >
          {currentOrg.code}
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            flex: 1,
            textAlign: "left",
            whiteSpace: "nowrap",
            color: isActingAs ? PALETTE.red700 : PALETTE.text,
          }}
        >
          {currentOrg.name}
        </span>
        <span aria-hidden style={{ color: PALETTE.muted, fontSize: 9 }}>
          ▼
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          data-testid="app-topbar-org-panel"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 300,
            background: "#fff",
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(15,23,42,.14)",
            zIndex: 300,
            padding: 6,
          }}
        >
          <div style={panelHeadingStyle}>{labels.homeHeading}</div>
          <OrgRow
            org={homeOrg}
            selected={!isActingAs}
            onSelect={pickHome}
            palette={PALETTE}
            testid="app-topbar-org-home"
          />

          {actAsOrgs.length > 0 ? (
            <>
              <div style={panelHeadingStyle}>{labels.actAsHeading}</div>
              {actAsOrgs.map((org) => (
                <OrgRow
                  key={org.id}
                  org={org}
                  selected={isActingAs && currentOrg.id === org.id}
                  onSelect={() => pickActAs(org.id)}
                  palette={PALETTE}
                  testid={`app-topbar-org-actas-${org.code}`}
                />
              ))}
            </>
          ) : null}

          <div
            style={{
              borderTop: `1px solid ${PALETTE.border}`,
              marginTop: 4,
              padding: "8px 10px",
              fontSize: 11,
              color: PALETTE.muted,
            }}
          >
            {labels.footnote}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const panelHeadingStyle: React.CSSProperties = {
  fontSize: 9.5,
  textTransform: "uppercase",
  color: PALETTE.muted,
  fontWeight: 700,
  letterSpacing: "0.06em",
  padding: "8px 10px 4px",
};

function OrgRow({
  org,
  selected,
  onSelect,
  palette,
  testid,
}: {
  org: OrgSwitcherOrg;
  selected: boolean;
  onSelect: () => void;
  palette: typeof PALETTE;
  testid: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      data-testid={testid}
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr auto",
        gap: 9,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 4,
        cursor: "pointer",
        width: "100%",
        border: "none",
        textAlign: "left",
        background: selected ? palette.blue050 : "transparent",
        fontFamily: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: 5,
          background: palette.gray050,
          color: palette.gray600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        {glyphFor(org.name)}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: palette.text }}>
        {org.name}
        <small style={{ display: "block", color: palette.muted, fontWeight: 400, fontSize: 10.5 }}>
          {org.code}
          {org.industry ? ` · ${org.industry}` : ""}
          {org.sitesText ? ` · ${org.sitesText}` : ""}
        </small>
      </span>
      <span aria-hidden style={{ color: palette.blue, fontWeight: 700 }}>
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

export default OrgSwitcher;
