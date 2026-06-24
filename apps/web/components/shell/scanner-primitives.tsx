"use client";

// ============================================================
// Scanner — shell primitives (Lane B)
// Port of prototypes/scanner/shell.jsx:1-203 into production TSX.
//
// Parity anchors:
//   Topbar        shell.jsx:36-58
//   Content       shell.jsx:60-62
//   BottomActions shell.jsx:64-66
//   Btn / GhostBtn shell.jsx:68-76
//   Toast         shell.jsx:79-87
//   ScanInputArea shell.jsx:90-120
//   Banner        shell.jsx:123-136
//   MiniGrid      shell.jsx:160-177
//   StepsBar      shell.jsx:180-198
//
// The existing ScannerFrame (components/shell/scanner-frame.tsx) already
// owns the device chrome (notch + status bar) and renders children into a
// scrollable content slot. These primitives render INSIDE that slot.
//
// No `.sc-*` CSS class file exists in the app, so the prototype's CSS-class
// look is reproduced with inline styles keyed off the dark scanner palette.
// ============================================================

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// --- palette (mirrors prototype --sc-* tokens) ---
const T = {
  bg: "#0f172a",
  surf: "#1e293b",
  elev: "#334155",
  sep: "#1f2c40",
  txt: "#f1f5f9",
  txt2: "#cbd5e1",
  mute: "#94a3b8",
  hint: "#64748b",
  blue: "#3b82f6",
  blue2: "#60a5fa",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

type SyncState = "online" | "queued" | "err";

export type TopbarProps = {
  title: string;
  onBack?: () => void;
  /**
   * Connectivity badge. When omitted the badge reflects live `navigator.onLine`
   * (online ⇄ err on offline events) so it is never a hardcoded lie. Pass an
   * explicit value only when the screen tracks its own sync queue / fetch error.
   */
  syncState?: SyncState;
  /** When provided, renders the ⋮ menu button. Omitted ⇒ no dead button. */
  onMenu?: () => void;
  showBack?: boolean;
  /** localized aria/title labels */
  labels: {
    back: string;
    menu: string;
    syncTitle: string;
    online: string;
    queued: string;
    syncErr: string;
  };
};

/**
 * Live connectivity hook for the sync badge. SSR/first paint assumes online
 * (so server and client markup agree), then reconciles to the real
 * `navigator.onLine` value and tracks online/offline events.
 */
function useOnlineSync(): SyncState {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online ? "online" : "err";
}

// shell.jsx:36-58
// Deviation (owner-signed-off scanner polish): the prototype's avatar-initials
// button (a fake `window.SCN_USER || "JK"` logged-in person) is dropped — the
// owner explicitly asked to remove the fake-person mockup and reclaim the space.
// The ⋮ menu now renders only when wired (`onMenu`), and the sync badge defaults
// to live `navigator.onLine` instead of a hardcoded "online".
export function Topbar({
  title,
  onBack,
  syncState,
  onMenu,
  showBack = true,
  labels,
}: TopbarProps) {
  const liveSync = useOnlineSync();
  const effectiveSync = syncState ?? liveSync;
  const badge =
    effectiveSync === "queued"
      ? { bg: "#3b2f0b", fg: T.amber, text: labels.queued }
      : effectiveSync === "err"
        ? { bg: "#3b1212", fg: T.red, text: labels.syncErr }
        : { bg: "#0e2a18", fg: T.green, text: labels.online };

  const tbtn: CSSProperties = {
    display: "flex",
    height: 40,
    width: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: T.txt2,
    fontSize: 20,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        height: 56,
        flexShrink: 0,
        alignItems: "center",
        gap: 4,
        padding: "0 6px",
        borderBottom: `1px solid ${T.sep}`,
      }}
    >
      {showBack ? (
        <button type="button" style={tbtn} onClick={onBack} aria-label={labels.back}>
          ←
        </button>
      ) : (
        <button type="button" aria-hidden="true" disabled style={{ ...tbtn, opacity: 0 }}>
          ·
        </button>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 15,
          fontWeight: 700,
          color: T.txt,
        }}
      >
        {title}
      </div>
      <span
        title={labels.syncTitle}
        style={{
          flexShrink: 0,
          padding: "3px 8px",
          borderRadius: 999,
          background: badge.bg,
          color: badge.fg,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {badge.text}
      </span>
      {onMenu ? (
        <button type="button" style={tbtn} onClick={onMenu} aria-label={labels.menu}>
          ⋮
        </button>
      ) : null}
    </div>
  );
}

// Screen wrapper: bleeds past the ScannerFrame content-slot padding
// (frame slot has padding:22px 16px) so Topbar/BottomActions sit edge-to-edge,
// matching the prototype where these live directly inside the frame.
export function ScannerScreen({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        margin: "-22px -16px",
        background: T.bg,
        color: T.txt,
      }}
    >
      {children}
    </div>
  );
}

// shell.jsx:60-62
export function Content({
  children,
  style,
}: {
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// shell.jsx:64-66
export function BottomActions({
  children,
  tall,
}: {
  children?: ReactNode;
  tall?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        flexShrink: 0,
        gap: 8,
        padding: tall ? "14px 16px" : "10px 16px",
        borderTop: `1px solid ${T.elev}`,
        background: T.bg,
      }}
    >
      {children}
    </div>
  );
}

type BtnVariant = "p" | "sec" | "w" | "d";

const btnColors: Record<BtnVariant, CSSProperties> = {
  p: { background: T.blue, color: "#fff", border: `1px solid ${T.blue}` },
  sec: { background: "transparent", color: T.txt2, border: `1px solid ${T.elev}` },
  w: { background: T.amber, color: "#1a1206", border: `1px solid ${T.amber}` },
  d: { background: T.red, color: "#fff", border: `1px solid ${T.red}` },
};

// shell.jsx:68-72
export function Btn({
  variant = "p",
  onClick,
  children,
  disabled,
  style,
  type = "button",
  ...rest
}: {
  variant?: BtnVariant;
  onClick?: () => void;
  children?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        minHeight: 50,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 12,
        padding: "0 16px",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...btnColors[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// shell.jsx:74-76
export function GhostBtn({
  onClick,
  children,
  style,
}: {
  onClick?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 12,
        border: "none",
        background: "transparent",
        color: T.blue2,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// shell.jsx:79-87
export function Toast({
  type = "ok",
  children,
  onDismiss,
}: {
  type?: "ok" | "err" | "warn";
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  useEffect(() => {
    if (!onDismiss) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const bg = type === "err" ? T.red : type === "warn" ? T.amber : T.green;
  const fg = type === "warn" ? "#1a1206" : "#fff";
  return (
    <div
      role="status"
      style={{
        margin: "8px 12px 0",
        padding: "10px 14px",
        borderRadius: 12,
        background: bg,
        color: fg,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

// shell.jsx:90-120
export type ScanInputAreaProps = {
  label?: string;
  placeholder?: string;
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  state?: "idle" | "err" | "ok";
  extra?: ReactNode;
  labels: { camera: string; manual: string };
  /**
   * Opens the camera viewfinder overlay (CameraScannerOverlay). When omitted
   * the Camera button is disabled rather than a dead no-op, so screens that
   * have not (yet) wired a camera never present a button that does nothing.
   */
  onOpenCamera?: () => void;
};

export function ScanInputArea({
  label,
  placeholder,
  hint,
  value,
  onChange,
  onSubmit,
  autoFocus = true,
  state = "idle",
  extra,
  labels,
  onOpenCamera,
}: ScanInputAreaProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);
  const borderColor = state === "err" ? T.red : state === "ok" ? T.green : T.elev;
  return (
    <div style={{ padding: "16px", borderBottom: `1px solid ${T.sep}` }}>
      {label && (
        <div
          style={{
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: T.hint,
          }}
        >
          {label}
        </div>
      )}
      <input
        ref={ref}
        style={{
          width: "100%",
          height: 56,
          borderRadius: 12,
          border: `2px solid ${borderColor}`,
          background: T.surf,
          color: T.txt,
          padding: "0 14px",
          fontSize: 18,
          fontWeight: 600,
          outline: "none",
        }}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) onSubmit(e.currentTarget.value);
        }}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
      />
      {hint && (
        <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{hint}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={onOpenCamera}
          disabled={!onOpenCamera}
          aria-disabled={!onOpenCamera}
          style={
            onOpenCamera
              ? scanToolStyle
              : { ...scanToolStyle, opacity: 0.45, cursor: "not-allowed" }
          }
        >
          <span aria-hidden="true">📷</span> {labels.camera}
        </button>
        <button
          type="button"
          onClick={() => ref.current?.focus()}
          style={scanToolStyle}
        >
          <span aria-hidden="true">⌨</span> {labels.manual}
        </button>
      </div>
      {extra}
    </div>
  );
}

const scanToolStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 40,
  borderRadius: 10,
  border: `1px solid ${T.elev}`,
  background: "transparent",
  color: T.txt2,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

// shell.jsx:123-136
export function Banner({
  kind = "info",
  icon,
  title,
  children,
  onDismiss,
}: {
  kind?: "info" | "warn" | "err" | "success";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  const palette =
    kind === "warn"
      ? { bg: "#3b2f0b", fg: T.amber, ic: "⚠️" }
      : kind === "err"
        ? { bg: "#3b1212", fg: T.red, ic: "✗" }
        : kind === "success"
          ? { bg: "#0e2a18", fg: T.green, ic: "✓" }
          : { bg: "#0e2333", fg: T.blue2, ic: "💡" };
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        margin: "12px 16px",
        padding: "12px 14px",
        borderRadius: 12,
        background: palette.bg,
        color: T.txt2,
        fontSize: 12,
      }}
    >
      <span aria-hidden="true" style={{ color: palette.fg }}>
        {icon || palette.ic}
      </span>
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontWeight: 700, color: palette.fg, marginBottom: 2 }}>{title}</div>
        )}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            width: 24,
            height: 24,
            border: "none",
            background: "transparent",
            color: T.mute,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// shell.jsx:160-177
export type MiniCell = { label: string; value: ReactNode; cls?: string };
export function MiniGrid({ rows }: { rows: Array<[MiniCell, MiniCell?]> }) {
  return (
    <div style={{ padding: "0 16px" }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: r[1] ? "1fr 1fr" : "1fr",
            gap: 8,
            padding: "8px 0",
            borderBottom: `1px solid ${T.sep}`,
          }}
        >
          {[r[0], r[1]].filter(Boolean).map((cell, j) => (
            <div key={j}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: T.hint,
                }}
              >
                {cell!.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txt }}>{cell!.value}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// shell.jsx:180-198
export function StepsBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 4 }}>
        {steps.map((_, i) => {
          const color = i < current ? T.green : i === current ? T.blue : T.elev;
          return (
            <div
              key={i}
              style={{ flex: 1, height: 3, borderRadius: 999, background: color }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 10,
        }}
      >
        {steps.map((s, i) => (
          <span
            key={i}
            style={{
              color: i === current ? T.blue : i < current ? T.green : T.hint,
            }}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export { T as scannerTokens };
