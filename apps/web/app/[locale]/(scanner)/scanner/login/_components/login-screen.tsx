"use client";

// ============================================================
// SCN-010 — Login (email + PIN)
// Port of prototypes/scanner/login.jsx:5-69 (LoginScreen) merged with the
// 6-digit PIN entry from login.jsx:72-126 (PinScreen) — the production
// contract authenticates email + PIN in a single POST /api/scanner/login.
// ============================================================

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  GhostBtn,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";

type LoginResponse =
  | { ok: true; token: string; user: { id: string; name: string }; expiresAt?: string }
  | { error: "invalid_pin" | "pin_locked" | "pin_not_enrolled" };

export function LoginScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { setSession } = useScannerSession();
  const L = labels.login;

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const press = (digit: string) => {
    if (err) setErr(null);
    setPin((p) => (p.length >= 6 ? p : p + digit));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  const canSubmit = email.trim().length > 0 && pin.length >= 4 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/scanner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), pin }),
      });
      const data = (await res.json().catch(() => null)) as LoginResponse | null;

      if (res.status === 200 && data && "ok" in data && data.ok) {
        setSession({
          token: data.token,
          user: data.user,
          expiresAt: data.expiresAt ?? null,
        });
        router.replace(`/${locale}/scanner/login/site`);
        return;
      }
      if (res.status === 409) {
        // pin_not_enrolled → first-time PIN setup
        router.replace(`/${locale}/scanner/login/pin-setup`);
        return;
      }
      if (res.status === 423) {
        setErr(L.errPinLocked);
        setPin("");
        return;
      }
      // 401 invalid_pin or anything else
      setErr(L.errInvalidPin);
      setPin("");
    } catch {
      setErr(L.errNetwork);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScannerScreen>
      <Topbar title={L.title} showBack={false} labels={labels.topbar} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ padding: "28px 20px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 44 }} aria-hidden="true">
            🏭
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.txt, marginTop: 6 }}>
            {L.appName}
          </div>
          <div style={{ fontSize: 12, color: T.mute }}>{L.appSub}</div>
        </div>

        <div style={{ padding: "8px 16px" }}>
          <label htmlFor="scanner-login-email" style={fieldLabelStyle}>
            {L.emailLabel}
          </label>
          <input
            id="scanner-login-email"
            ref={emailRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={L.emailPlaceholder}
            inputMode="email"
            autoComplete="username"
            autoFocus
            style={fieldInputStyle}
          />
        </div>

        <div style={{ padding: "8px 16px 0", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: T.mute, marginBottom: 8 }}>{L.pinHint}</div>
          <div
            aria-label={L.pinLabel}
            style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 8 }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `2px solid ${err ? T.red : T.elev}`,
                  background: i < pin.length ? (err ? T.red : T.blue) : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        <div style={numpadStyle}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} type="button" className="" onClick={() => press(k)} style={keyStyle}>
              {k}
            </button>
          ))}
          <span aria-hidden="true" />
          <button type="button" onClick={() => press("0")} style={keyStyle}>
            0
          </button>
          <button type="button" onClick={back} aria-label={L.backspace} style={keyStyle}>
            ⌫
          </button>
        </div>

        {err && (
          <Banner kind="err" title={err}>
            {" "}
          </Banner>
        )}

        <div style={{ padding: "8px 16px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: T.hint }}>{L.version}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          flexShrink: 0,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${T.elev}`,
        }}
      >
        <Btn variant="p" disabled={!canSubmit} onClick={submit}>
          {submitting ? L.signingIn : L.submit}
        </Btn>
        <GhostBtn onClick={() => router.push(`/${locale}/scanner/login/pin-setup`)}>
          {L.setupCta}
        </GhostBtn>
      </div>
    </ScannerScreen>
  );
}

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
  height: 50,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 16,
  outline: "none",
} as const;

const numpadStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  padding: "12px 16px",
} as const;

const keyStyle = {
  height: 58,
  borderRadius: 14,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  fontSize: 22,
  fontWeight: 700,
  cursor: "pointer",
} as const;
