"use client";

// ============================================================
// Scanner — bottom-sheet modals (Lane B subset)
// Port of prototypes/scanner/modals.jsx:1-496.
//
// Parity anchors:
//   ScannerSheet (Modal shell)  modals.jsx:1-19 (bottom-sheet cascade)
//   ReasonPickerSheet           modals.jsx:21-53
//   LanguageSheet               modals.jsx:182-212
//   LogoutSheet                 modals.jsx:214-228
//   ScanErrorSheet              modals.jsx:230-249
//   QtyKeypadSheet              modals.jsx:251-275
//   BlockFullscreen             modals.jsx:278-298
//
// The prototype reuses a shared <Modal> + <select>/<Field>; here each sheet
// is self-contained (no raw <select>) and uses the scanner dark palette.
// ============================================================

import { useEffect, useState, type ReactNode } from "react";

import { Banner, Btn, scannerTokens as T } from "../../../../components/shell/scanner-primitives";

// --- shared bottom-sheet shell (modals.jsx:1-19 cascade) ---
export function ScannerSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  foot,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  closeLabel: string;
}) {
  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.55)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surf,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTop: `1px solid ${T.elev}`,
          padding: "10px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "82%",
          overflowY: "auto",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            background: T.elev,
            margin: "0 auto 12px",
          }}
        />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txt }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            style={{
              width: 32,
              height: 32,
              border: "none",
              background: "transparent",
              color: T.mute,
              fontSize: 22,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "12px 0" }}>{children}</div>
        {foot && (
          <div style={{ display: "grid", gap: 8, marginTop: 4 }}>{foot}</div>
        )}
      </div>
    </div>
  );
}

// modals.jsx:21-53 — generic reason-code picker
export type ReasonOption = { id: string; label: string; icon?: string };
export function ReasonPickerSheet({
  open,
  onClose,
  title,
  reasons = [],
  onConfirm,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  reasons?: ReasonOption[];
  onConfirm: (value: { id: string; other: string }) => void;
  labels: { confirm: string; cancel: string; close: string; otherPlaceholder: string };
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const needsOther = sel === "other";
  const canSubmit = !!sel && (!needsOther || other.length >= 5);
  return (
    <ScannerSheet
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={labels.close}
      foot={
        <>
          <Btn
            variant="p"
            disabled={!canSubmit}
            onClick={() => {
              if (sel) onConfirm({ id: sel, other });
              onClose();
            }}
          >
            {labels.confirm}
          </Btn>
          <Btn variant="sec" onClick={onClose}>
            {labels.cancel}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reasons.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSel(r.id)}
            style={reasonBtnStyle(sel === r.id)}
          >
            <span aria-hidden="true">{r.icon || "•"}</span>
            <span style={{ flex: 1, textAlign: "left" }}>{r.label}</span>
            <span aria-hidden="true">{sel === r.id ? "●" : "○"}</span>
          </button>
        ))}
        {needsOther && (
          <textarea
            style={textareaStyle}
            placeholder={labels.otherPlaceholder}
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        )}
      </div>
    </ScannerSheet>
  );
}

// modals.jsx:182-212 — language picker
export type LanguageOption = { id: string; flag: string; label: string };
export function LanguageSheet({
  open,
  onClose,
  value = "pl",
  options,
  onApply,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  value?: string;
  options: LanguageOption[];
  onApply: (id: string) => void;
  labels: { title: string; apply: string; cancel: string; close: string };
}) {
  const [sel, setSel] = useState(value);
  useEffect(() => {
    if (open) setSel(value);
  }, [open, value]);
  return (
    <ScannerSheet
      open={open}
      onClose={onClose}
      title={labels.title}
      closeLabel={labels.close}
      foot={
        <>
          <Btn
            variant="p"
            onClick={() => {
              onApply(sel);
              onClose();
            }}
          >
            {labels.apply}
          </Btn>
          <Btn variant="sec" onClick={onClose}>
            {labels.cancel}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSel(o.id)}
            style={reasonBtnStyle(sel === o.id)}
          >
            <span aria-hidden="true" style={{ fontSize: 22 }}>
              {o.flag}
            </span>
            <span style={{ flex: 1, textAlign: "left" }}>{o.label}</span>
            <span aria-hidden="true">{sel === o.id ? "●" : "○"}</span>
          </button>
        ))}
      </div>
    </ScannerSheet>
  );
}

// modals.jsx:214-228 — logout confirm
export function LogoutSheet({
  open,
  onClose,
  onConfirm,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  labels: {
    title: string;
    bannerTitle: string;
    bannerBody: string;
    logout: string;
    cancel: string;
    close: string;
  };
}) {
  return (
    <ScannerSheet
      open={open}
      onClose={onClose}
      title={labels.title}
      closeLabel={labels.close}
      foot={
        <>
          <Btn
            variant="d"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {labels.logout}
          </Btn>
          <Btn variant="sec" onClick={onClose}>
            {labels.cancel}
          </Btn>
        </>
      }
    >
      <Banner kind="info" title={labels.bannerTitle}>
        {labels.bannerBody}
      </Banner>
    </ScannerSheet>
  );
}

// modals.jsx:230-249 — unrecoverable scan error
export function ScanErrorSheet({
  open,
  onClose,
  code,
  title,
  message,
  onRetry,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  code?: string;
  title: string;
  message: string;
  onRetry?: () => void;
  labels: { retry: string; back: string; close: string; codeLabel: string };
}) {
  return (
    <ScannerSheet
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={labels.close}
      foot={
        <>
          {onRetry && (
            <Btn
              variant="p"
              onClick={() => {
                onRetry();
                onClose();
              }}
            >
              {labels.retry}
            </Btn>
          )}
          <Btn variant="sec" onClick={onClose}>
            {labels.back}
          </Btn>
        </>
      }
    >
      <Banner kind="err" title={title}>
        {message}
      </Banner>
      {code && (
        <div
          style={{
            fontSize: 10,
            color: T.hint,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          {labels.codeLabel}: {code}
        </div>
      )}
    </ScannerSheet>
  );
}

// modals.jsx:251-275 — numeric keypad fallback
export function QtyKeypadSheet({
  open,
  onClose,
  initial = "",
  max,
  uom = "kg",
  onConfirm,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  initial?: string | number;
  max?: number;
  uom?: string;
  onConfirm: (value: string) => void;
  labels: { title: string; maxLabel: string; confirm: string; close: string };
}) {
  const [val, setVal] = useState(String(initial || ""));
  useEffect(() => {
    if (open) setVal(String(initial || ""));
  }, [open, initial]);
  const press = (ch: string) => {
    if (ch === "⌫") setVal((v) => v.slice(0, -1));
    else if (ch === ".") {
      setVal((v) => (v.includes(".") ? v : (v || "0") + "."));
    } else setVal((v) => (v + ch).replace(/^0+(\d)/, "$1"));
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
  return (
    <ScannerSheet
      open={open}
      onClose={onClose}
      title={labels.title}
      subtitle={max != null ? `${labels.maxLabel}: ${max} ${uom}` : undefined}
      closeLabel={labels.close}
      foot={
        <Btn
          variant="p"
          onClick={() => {
            onConfirm(val);
            onClose();
          }}
        >
          {labels.confirm}
        </Btn>
      }
    >
      <div
        style={{
          textAlign: "center",
          fontSize: 28,
          fontFamily: "'Courier New', monospace",
          fontWeight: 700,
          padding: "14px 0",
          background: T.bg,
          borderRadius: 10,
          border: `1px solid ${T.elev}`,
          marginBottom: 12,
        }}
      >
        {val || "0"}{" "}
        <span style={{ fontSize: 14, color: T.mute, fontWeight: 400 }}>{uom}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} style={keyStyle}>
            {k}
          </button>
        ))}
      </div>
    </ScannerSheet>
  );
}

// modals.jsx:278-298 — full-screen hard-block overlay
export function BlockFullscreen({
  open,
  onClose,
  code,
  title,
  message,
  onRetry,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  code?: string;
  title: string;
  message: string;
  onRetry?: () => void;
  labels: { retry: string; backToMenu: string; codeLabel: string };
}) {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 64, color: T.red, marginBottom: 16 }}>
        ✗
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.red, marginBottom: 8 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 14,
          color: T.txt2,
          maxWidth: 280,
          lineHeight: 1.5,
          marginBottom: 20,
        }}
      >
        {message}
      </div>
      {code && (
        <div
          style={{
            fontSize: 10,
            color: T.hint,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          {labels.codeLabel}: {code}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        {onRetry && (
          <Btn variant="p" onClick={onRetry}>
            {labels.retry}
          </Btn>
        )}
        <Btn variant="sec" onClick={onClose}>
          {labels.backToMenu}
        </Btn>
      </div>
    </div>
  );
}

// --- shared inline styles ---
function reasonBtnStyle(on: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${on ? T.blue : T.elev}`,
    background: on ? "#0e2333" : T.bg,
    color: on ? T.blue2 : T.txt2,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as const;
}

const textareaStyle = {
  width: "100%",
  minHeight: 72,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.bg,
  color: T.txt,
  padding: 12,
  fontSize: 14,
  resize: "vertical",
} as const;

const keyStyle = {
  height: 56,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.bg,
  color: T.txt,
  fontSize: 20,
  fontWeight: 700,
  cursor: "pointer",
} as const;
