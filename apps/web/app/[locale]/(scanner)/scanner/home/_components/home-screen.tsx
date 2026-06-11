"use client";

// ============================================================
// SCN-home — Workflow launcher
// Port of prototypes/scanner/home.jsx:7-61 (HomeScreen).
// Flow tiles whose screens don't exist yet are rendered DISABLED with
// title="Coming soon" (no fake links). Receive PO and Settings are live.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { LogoutSheet } from "../../../_components/scanner-modals";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";

type Tile = {
  key: keyof ScannerLabels["home"]["tiles"];
  icon: string;
  /** href relative to locale, or null when the flow isn't built yet */
  to: string | null;
};

type Section = { key: "production" | "warehouse" | "quality"; tiles: Tile[] };

const SECTIONS: Section[] = [
  {
    key: "production",
    tiles: [
      { key: "wos", icon: "🏭", to: "scanner/wos" },
      { key: "consume", icon: "📥", to: "scanner/wos" },
      { key: "output", icon: "📤", to: "scanner/wos" },
      { key: "pick", icon: "🧺", to: null },
    ],
  },
  {
    key: "warehouse",
    tiles: [
      { key: "receive", icon: "📦", to: "scanner/receive-po" },
      { key: "putaway", icon: "📍", to: null },
      { key: "move", icon: "🚚", to: null },
    ],
  },
  {
    key: "quality",
    tiles: [
      { key: "qa", icon: "🔍", to: null },
      { key: "inquiry", icon: "🔎", to: null },
    ],
  },
];

export function HomeScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, clearSession } = useScannerSession();
  const L = labels.home;
  const [showLogout, setShowLogout] = useState(false);

  // Permission-denied / unauthenticated: no session → back to login.
  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const sectionLabel = (k: Section["key"]) =>
    k === "production"
      ? L.sectionProduction
      : k === "warehouse"
        ? L.sectionWarehouse
        : L.sectionQuality;

  const logout = () => {
    clearSession();
    router.replace(`/${locale}/scanner/login`);
  };

  return (
    <ScannerScreen>
      <Topbar
        title={L.title}
        showBack={false}
        syncState="online"
        initials={session ? initials(session.user.name) : "JK"}
        onMenu={() => router.push(`/${locale}/scanner/settings`)}
        onAvatar={() => setShowLogout(true)}
        labels={labels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
        {session && (
          <div style={ctxStyle}>
            <div style={avatarStyle} aria-hidden="true">
              {initials(session.user.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: T.txt }}>{session.user.name}</div>
            </div>
            <span style={badgeStyle}>{labels.topbar.online}</span>
          </div>
        )}

        {SECTIONS.map((sec) => (
          <div key={sec.key}>
            <div style={sectionTitleStyle}>{sectionLabel(sec.key)}</div>
            {sec.tiles.map((tile) => {
              const meta = L.tiles[tile.key];
              const disabled = tile.to === null;
              return (
                <button
                  key={tile.key}
                  type="button"
                  disabled={disabled}
                  title={disabled ? L.comingSoon : undefined}
                  aria-disabled={disabled}
                  onClick={
                    disabled || !tile.to ? undefined : () => router.push(`/${locale}/${tile.to}`)
                  }
                  style={tileStyle(disabled)}
                >
                  <div style={tileIconStyle} aria-hidden="true">
                    {tile.icon}
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontWeight: 600, color: T.txt }}>{meta.title}</div>
                    <div style={{ fontSize: 12, color: T.mute }}>{meta.desc}</div>
                  </div>
                  <span style={{ color: T.hint }} aria-hidden="true">
                    {disabled ? L.comingSoon : "›"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ padding: "20px 16px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: T.hint }}>{L.footer}</div>
        </div>
      </div>

      <LogoutSheet
        open={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={logout}
        labels={labels.logout}
      />
    </ScannerScreen>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ctxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "4px 16px 8px",
  padding: 12,
  borderRadius: 12,
  background: T.surf,
} as const;

const avatarStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: T.elev,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  color: T.txt,
} as const;

const badgeStyle = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "#0e2a18",
  color: T.green,
  fontSize: 10,
  fontWeight: 700,
} as const;

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

function tileStyle(disabled: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "calc(100% - 32px)",
    margin: "0 16px 8px",
    padding: 12,
    borderRadius: 14,
    border: `1px solid ${T.elev}`,
    background: T.surf,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  } as const;
}

const tileIconStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: T.bg,
  fontSize: 20,
} as const;
