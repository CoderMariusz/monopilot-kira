"use client";

// ============================================================
// SCN-settings — Scanner settings
// Port of prototypes/scanner/home.jsx:63-142 (SettingsScreen) with the
// inline PIN change (login.jsx:301-424, PinChangeScreen, condensed) wired to
// POST /api/scanner/change-pin, language sheet, and logout via
// POST /api/scanner/logout.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { LanguageSheet, LogoutSheet } from "../../../_components/scanner-modals";
import { useScannerSession } from "../../../_components/scanner-session";
import {
  SCANNER_LANGUAGE_OPTIONS,
  type ScannerLabels,
} from "../../../_components/scanner-labels";

export function SettingsScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, clearSession, scannerFetch } = useScannerSession();
  const L = labels.settings;

  const [showLang, setShowLang] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinOk, setPinOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const changePin = async () => {
    setPinErr(null);
    setPinOk(false);
    if (newPin.length < 4) {
      setPinErr(L.errMinLen);
      return;
    }
    if (newPin !== confirmPin) {
      setPinErr(L.errMismatch);
      return;
    }
    if (!session) return;
    setSaving(true);
    try {
      const res = await scannerFetch("change-pin", {
        token: session.token,
        currentPin,
        newPin,
      });
      if (res.ok) {
        setPinOk(true);
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        setPinOpen(false);
        return;
      }
      // 401 already redirects via scannerFetch
      if (res.status !== 401) setPinErr(L.pinChangeFailed);
    } catch {
      setPinErr(L.pinChangeFailed);
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    if (session) {
      try {
        await fetch("/api/scanner/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: session.token }),
        });
      } catch {
        /* best-effort; clear locally regardless */
      }
    }
    clearSession();
    router.replace(`/${locale}/scanner/login`);
  };

  const changeLanguage = (next: string) => {
    // Switch the locale segment; the (scanner) group lives under [locale].
    router.replace(`/${next}/scanner/settings`);
  };

  const activeSession = session
    ? [session.lineId, session.shift].filter(Boolean).join(" · ") || L.deviceModeValue
    : L.noSession;

  return (
    <ScannerScreen>
      <Topbar
        title={L.title}
        onBack={() => router.push(`/${locale}/scanner/home`)}
        syncState="online"
        initials={session ? initials(session.user.name) : "JK"}
        labels={labels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
        {pinOk && (
          <Banner kind="success" title={L.pinChanged}>
            {" "}
          </Banner>
        )}

        <div style={sectionTitleStyle}>{L.sessionSection}</div>
        <Row title={L.deviceMode} desc={L.deviceModeValue} />
        <Row title={L.activeSession} desc={activeSession} />

        <div style={sectionTitleStyle}>{L.securitySection}</div>
        <button
          type="button"
          onClick={() => {
            setPinOpen((v) => !v);
            setPinErr(null);
            setPinOk(false);
          }}
          style={rowButtonStyle}
        >
          <div>
            <div style={{ fontWeight: 600, color: T.txt }}>{L.changePin}</div>
            <div style={{ fontSize: 12, color: T.mute }}>{L.changePinDesc}</div>
          </div>
          <span style={{ color: T.hint }} aria-hidden="true">
            {pinOpen ? "˅" : "›"}
          </span>
        </button>

        {pinOpen && (
          <div style={{ padding: "0 16px 8px", display: "grid", gap: 10 }}>
            <PinField id="cur-pin" label={L.currentPin} value={currentPin} onChange={setCurrentPin} />
            <PinField id="new-pin" label={L.newPin} value={newPin} onChange={setNewPin} />
            <PinField
              id="confirm-pin"
              label={L.confirmNewPin}
              value={confirmPin}
              onChange={setConfirmPin}
            />
            {pinErr && (
              <Banner kind="err" title={pinErr}>
                {" "}
              </Banner>
            )}
            <Btn
              variant="p"
              disabled={saving || currentPin.length < 4 || newPin.length < 4}
              onClick={changePin}
            >
              {saving ? L.saving : L.save}
            </Btn>
          </div>
        )}

        <div style={sectionTitleStyle}>{L.languageSection}</div>
        <button type="button" onClick={() => setShowLang(true)} style={rowButtonStyle}>
          <div>
            <div style={{ fontWeight: 600, color: T.txt }}>{L.languageRow}</div>
            <div style={{ fontSize: 12, color: T.mute }}>
              {SCANNER_LANGUAGE_OPTIONS.find((o) => o.id === locale)?.label ?? locale}
            </div>
          </div>
          <span style={{ color: T.hint }} aria-hidden="true">
            ›
          </span>
        </button>

        <div style={sectionTitleStyle}>{L.accountSection}</div>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          style={{ ...rowButtonStyle, color: T.red }}
        >
          <div style={{ fontWeight: 600, color: T.red }}>{L.logout}</div>
          <span style={{ color: T.red }} aria-hidden="true">
            ›
          </span>
        </button>

        <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 10, color: T.hint }}>
          {L.footer}
        </div>
      </div>

      <LanguageSheet
        open={showLang}
        onClose={() => setShowLang(false)}
        value={locale}
        options={SCANNER_LANGUAGE_OPTIONS}
        onApply={changeLanguage}
        labels={labels.language}
      />
      <LogoutSheet
        open={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={logout}
        labels={labels.logout}
      />
    </ScannerScreen>
  );
}

function Row({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={settingRowStyle}>
      <div>
        <div style={{ fontWeight: 600, color: T.txt }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: T.mute }}>{desc}</div>}
      </div>
    </div>
  );
}

function PinField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        autoComplete="off"
        style={fieldInputStyle}
      />
    </div>
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

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const settingRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: `1px solid ${T.sep}`,
} as const;

const rowButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "12px 16px",
  border: "none",
  borderBottom: `1px solid ${T.sep}`,
  background: "transparent",
  textAlign: "left",
  fontFamily: "inherit",
  color: T.txt,
  cursor: "pointer",
} as const;

const fieldLabelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const fieldInputStyle = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 18,
  letterSpacing: "0.3em",
  outline: "none",
} as const;
