"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type ScannerFrameProps = {
  children?: ReactNode;
  statusBar?: ReactNode;
  bottomActions?: ReactNode;
};

// On a real phone the device draws the real OS status bar (clock, signal,
// battery) just above the browser viewport, so the app must NOT fake its own.
// Desktop keeps a phone-sized preview frame (the `.scanner-shell` class adds the
// bezel + shadow); the `max-width:640px` block in globals.css drops the bezel,
// hides `.scanner-device-chrome`, and stretches the frame to 100vw x 100dvh so
// the application gets the full field.
const frameStyle: CSSProperties = {
  width: "var(--shell-scanner-w)",
  height: "var(--shell-scanner-h)",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "#0f172a",
  color: "#f1f5f9",
  fontFamily: "-apple-system, Inter, Segoe UI, system-ui, sans-serif",
  fontSize: "14px",
};

const notchStyle: CSSProperties = {
  position: "absolute",
  top: "8px",
  left: "50%",
  zIndex: 30,
  width: "128px",
  height: "28px",
  transform: "translateX(-50%)",
  borderRadius: "16px",
  background: "#000",
  pointerEvents: "none",
};

const statusBarStyle: CSSProperties = {
  zIndex: 10,
  display: "flex",
  flexShrink: 0,
  height: "44px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 28px 0 26px",
  background: "#0f172a",
  color: "#f1f5f9",
  fontSize: "13px",
  fontWeight: 600,
};

const contentStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  overflowY: "auto",
  padding: "22px 16px",
  background: "#0f172a",
  WebkitOverflowScrolling: "touch",
};

const bottomActionsStyle: CSSProperties = {
  zIndex: 8,
  display: "grid",
  flexShrink: 0,
  gap: "8px",
  padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
  borderTop: "1px solid #334155",
  background: "#0f172a",
};

// Real, useful info only — the desktop preview strip shows the app name, a live
// clock and a genuine connectivity dot (navigator.onLine). No faked signal or
// battery glyphs; on a real phone this whole strip is hidden by CSS.
function DeviceStatusBar() {
  const [now, setNow] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      );
    tick();
    const id = setInterval(tick, 15_000);
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <>
      <span>{now}</span>
      <span style={{ color: "#93a4b8", fontSize: 11, fontWeight: 500 }}>MonoPilot MES</span>
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        title={online ? "Online" : "Offline"}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: online ? "#22c55e" : "#ef4444",
          }}
        />
      </span>
    </>
  );
}

export function ScannerFrame({ children, statusBar, bottomActions }: ScannerFrameProps) {
  return (
    <section
      data-testid="scanner-frame"
      role="application"
      aria-label="MonoPilot Scanner"
      className="w-scanner h-scanner scanner-shell"
      style={frameStyle}
    >
      <div
        data-testid="scanner-notch"
        aria-hidden="true"
        className="scanner-device-chrome"
        style={notchStyle}
      />
      <div
        data-testid="scanner-status-bar"
        className="scanner-device-chrome"
        style={statusBarStyle}
      >
        {statusBar ?? <DeviceStatusBar />}
      </div>
      <div data-testid="scanner-content" className="scanner-content" style={contentStyle}>
        {children}
      </div>
      {bottomActions ? (
        <div data-testid="scanner-bottom-actions" style={bottomActionsStyle}>
          {bottomActions}
        </div>
      ) : null}
    </section>
  );
}

export default ScannerFrame;
