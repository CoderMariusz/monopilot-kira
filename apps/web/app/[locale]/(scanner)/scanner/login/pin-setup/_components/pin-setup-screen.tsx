"use client";

// ============================================================
// SCN-011b — PIN First-Time Setup
// Port of prototypes/scanner/login.jsx:201-294 (PinSetupScreen).
// Production contract adds email + LOGIN PASSWORD (prove identity) before
// the 2-step set+confirm PIN, then POST /api/scanner/set-pin and route back
// to ../login.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../components/shell/scanner-primitives";
import type { ScannerLabels } from "../../../../_components/scanner-labels";

const MIN_LEN = 4;
const MAX_LEN = 6;
const WEAK = new Set(["0000", "1111", "1234", "12345", "123456", "000000", "111111"]);

export function PinSetupScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const L = labels.pinSetup;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"set" | "confirm">("set");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errBannerRef = useRef<HTMLDivElement | null>(null);
  const errId = useId();

  useEffect(() => {
    if (err) errBannerRef.current?.focus();
  }, [err]);

  const validatePolicy = (p: string): string | null => {
    if (p.length < MIN_LEN) return L.errMinLen.replace("{min}", String(MIN_LEN));
    if (WEAK.has(p)) return L.errWeak;
    if (/^(\d)\1+$/.test(p)) return L.errRepeat;
    return null;
  };

  const press = (d: string) => {
    if (err) setErr(null);
    setPin((p) => (p.length >= MAX_LEN ? p : p + d));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  const finish = async (confirmedPin: string) => {
    if (!email.trim() || !password) {
      setErr(L.errMissingCreds);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/scanner/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, newPin: confirmedPin }),
      });
      if (res.ok) {
        router.replace(`/${locale}/scanner/login`);
        return;
      }
      setErr(L.errSaveFailed);
      setStage("set");
      setPin("");
      setFirstPin("");
    } catch {
      setErr(L.errSaveFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const submitStage = () => {
    const policyErr = validatePolicy(pin);
    if (policyErr) {
      setErr(policyErr);
      return;
    }
    if (stage === "set") {
      setFirstPin(pin);
      setPin("");
      setStage("confirm");
      return;
    }
    if (pin !== firstPin) {
      setErr(L.errMismatch);
      setPin("");
      return;
    }
    void finish(pin);
  };

  const title = stage === "set" ? L.titleSet : L.titleConfirm;
  const hint = stage === "set" ? L.hintSet : L.hintConfirm;
  const canSubmit = pin.length >= MIN_LEN && !submitting;

  return (
    <ScannerScreen>
      <Topbar
        title={title}
        onBack={() => router.push(`/${locale}/scanner/login`)}
        labels={labels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {stage === "set" && (
          <div style={{ padding: "12px 16px 0" }}>
            <label htmlFor="pin-setup-email" style={fieldLabelStyle}>
              {L.emailLabel}
            </label>
            <input
              id="pin-setup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={L.emailPlaceholder}
              inputMode="email"
              autoComplete="username"
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? errId : undefined}
              style={{
                ...fieldInputStyle,
                borderColor: err ? T.red : T.elev,
              }}
            />
            <label htmlFor="pin-setup-password" style={{ ...fieldLabelStyle, marginTop: 12 }}>
              {L.passwordLabel}
            </label>
            <input
              id="pin-setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={L.passwordPlaceholder}
              autoComplete="current-password"
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? errId : undefined}
              style={{
                ...fieldInputStyle,
                borderColor: err ? T.red : T.elev,
              }}
            />
          </div>
        )}

        <div style={{ padding: "16px 16px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: T.mute, marginBottom: 8 }}>{hint}</div>
          <div
            role="group"
            aria-label={title}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? errId : undefined}
            style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 6 }}
          >
            {Array.from({ length: MAX_LEN }).map((_, i) => (
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
          <div style={{ fontSize: 11, color: T.hint }}>
            {pin.length}/{MAX_LEN} {L.digits} · {L.min} {MIN_LEN}
          </div>
          <div
            style={{
              fontSize: 10,
              color: T.hint,
              marginTop: 8,
              letterSpacing: "0.05em",
            }}
          >
            {stage === "set" ? L.step1 : L.step2}
          </div>
        </div>

        <div style={numpadStyle}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} style={keyStyle}>
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
      </div>

      {err ? (
        <Banner
          id={errId}
          kind="err"
          title={err}
          bannerRef={errBannerRef}
          style={{ flexShrink: 0, margin: "0 0 4px" }}
        >
          {" "}
        </Banner>
      ) : null}

      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${T.elev}`,
        }}
      >
        <Btn variant="p" disabled={!canSubmit} onClick={submitStage}>
          {submitting ? L.saving : stage === "set" ? L.nextBtn : L.saveBtn}
        </Btn>
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
