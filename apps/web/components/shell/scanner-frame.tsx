"use client";

import type { CSSProperties, ReactNode } from "react";

type ScannerFrameProps = {
  children?: ReactNode;
  statusBar?: ReactNode;
  bottomActions?: ReactNode;
};

const frameStyle: CSSProperties = {
  width: "var(--shell-scanner-w)",
  height: "var(--shell-scanner-h)",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "44px",
  background: "#0f172a",
  boxShadow: "0 0 0 10px #1e293b, 0 0 0 12px #0b1220, 0 30px 80px rgba(0, 0, 0, 0.75)",
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

function DefaultStatusBar() {
  return (
    <>
      <span>09:41</span>
      <span style={{ color: "#93a4b8", fontSize: 11, fontWeight: 500 }}>MonoPilot MES</span>
      <span aria-hidden="true">📶 🔋</span>
    </>
  );
}

export function ScannerFrame({ children, statusBar, bottomActions }: ScannerFrameProps) {
  return (
    <section
      data-testid="scanner-frame"
      role="application"
      aria-label="MonoPilot Scanner"
      className="w-scanner h-scanner"
      style={frameStyle}
    >
      <div data-testid="scanner-notch" aria-hidden="true" style={notchStyle} />
      <div data-testid="scanner-status-bar" style={statusBarStyle}>
        {statusBar ?? <DefaultStatusBar />}
      </div>
      <div data-testid="scanner-content" style={contentStyle}>
        {children}
      </div>
      <div data-testid="scanner-bottom-actions" style={bottomActionsStyle}>
        {bottomActions}
      </div>
    </section>
  );
}

export default ScannerFrame;
