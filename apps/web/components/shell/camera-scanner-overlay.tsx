"use client";

// ============================================================
// CameraScannerOverlay — FR-SC-FE-007 viewfinder overlay (production)
//
// Parity anchor: prototypes/scanner/modals.jsx:312-490 (CameraScanner).
// The prototype simulated a decode with setTimeout; this is the canonical
// implementation: a real `@zxing/browser` `BrowserMultiFormatReader` running
// continuous decode against a <video> element fed by getUserMedia.
//
//   - full-screen fixed overlay (position:fixed, inset:0, high z-index)
//   - <video> viewfinder + reticle + corner ticks + scanning-line
//       (modals.jsx:404-437) — colors keep the scanner --sc-* dark palette
//   - torch + flip-camera round controls (modals.jsx:462-481); torch is
//       wrapped in capability/try-catch and hidden where unsupported
//   - status badge: "scanning" / "✓ <code>" / no-camera (modals.jsx:439-444)
//   - permission handling: NotAllowedError → "permission denied" + a
//       "Enter manually" fallback (routes to onCancel so the manual field
//       on the host screen keeps focus); NotFoundError → "camera unavailable"
//   - on a decode hit: show the success state ~600ms, then onDecode(code)
//   - lifecycle: stop the decoder + stop every MediaStream track on unmount /
//       cancel / hardware-back, so the camera light is never left stuck.
//
// HTTPS-only (getUserMedia); prod is HTTPS. iOS Safari needs a user gesture —
// the Camera button tap that opens this overlay provides it. Torch is not
// supported on every device, hence the capability probe + graceful hide.
//
// All strings come from `labels` (next-intl resolved server-side and threaded
// down via the scanner labels object) — no inline copy.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Minimal structural type for the zxing IScannerControls we use.
type ScannerControls = {
  stop: () => void;
  switchTorch?: (onOff: boolean) => Promise<void>;
};

export type CameraScannerLabels = {
  title: string;
  scanning: string;
  found: string;
  cancel: string;
  torch: string;
  flip: string;
  permissionDenied: string;
  noCameraFound: string;
  manualFallback: string;
};

export type CameraScannerOverlayProps = {
  open: boolean;
  onDecode: (code: string) => void;
  onCancel: () => void;
  labels: CameraScannerLabels;
};

type Status = "scanning" | "found" | "denied" | "noCamera";
type Facing = "environment" | "user";

// Scanner dark palette (mirrors prototype --sc-* tokens; same values as
// components/shell/scanner-primitives.tsx so the overlay matches the shell).
const SC = {
  bg: "#0f172a",
  elev: "#334155",
  txt: "#f1f5f9",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

const SCAN_LINE_KEYFRAMES = `@keyframes mp-sc-scan-line {
  0% { transform: translateY(-78px); }
  50% { transform: translateY(78px); }
  100% { transform: translateY(-78px); }
}`;

export function CameraScannerOverlay({
  open,
  onDecode,
  onCancel,
  labels,
}: CameraScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const decodedRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [status, setStatus] = useState<Status>("scanning");
  const [result, setResult] = useState<string | null>(null);

  // Fully release camera + decoder. Safe to call repeatedly.
  const teardown = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    try {
      controlsRef.current?.stop();
    } catch {
      /* decoder already stopped */
    }
    controlsRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* track already ended */
        }
      }
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  // Start the camera + continuous decode whenever the overlay is open
  // (and re-start when the operator flips the camera).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    decodedRef.current = false;
    setStatus("scanning");
    setResult(null);

    const start = async () => {
      const mediaDevices =
        typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!mediaDevices || !mediaDevices.getUserMedia) {
        if (!cancelled) setStatus("noCamera");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string } | null)?.name;
        // NotFoundError / OverconstrainedError → no usable camera (e.g. desktop).
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "noCamera");
        return;
      }
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;

      // Torch capability probe (experimental; absent on iOS Safari + most desktops).
      try {
        const track = stream.getVideoTracks()[0];
        const caps =
          (track?.getCapabilities?.() as { torch?: boolean } | undefined) ?? undefined;
        setTorchSupported(Boolean(caps?.torch));
      } catch {
        setTorchSupported(false);
      }

      const video = videoRef.current;
      if (!video) {
        for (const t of stream.getTracks()) t.stop();
        streamRef.current = null;
        return;
      }

      try {
        const reader = new BrowserMultiFormatReader();
        const controls = (await reader.decodeFromConstraints(
          { video: { facingMode: facing }, audio: false },
          video,
          (decodeResult, _err, ctrls) => {
            if (cancelled || decodedRef.current || !decodeResult) return;
            const text =
              typeof decodeResult.getText === "function" ? decodeResult.getText() : "";
            if (!text) return;
            decodedRef.current = true;
            setResult(text);
            setStatus("found");
            // hold the success state briefly, then hand the code to the host.
            successTimerRef.current = setTimeout(() => {
              (ctrls as ScannerControls | undefined)?.stop?.();
              onDecode(text);
            }, 600);
          },
        )) as unknown as ScannerControls;
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string } | null)?.name;
        setStatus(name === "NotAllowedError" ? "denied" : "noCamera");
      }
    };

    void start();
    return () => {
      cancelled = true;
      teardown();
    };
  }, [open, facing, onDecode, teardown]);

  // Toggle torch when supported (experimental zxing control). Never throws.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch || !torchSupported) return;
    controls.switchTorch(torch).catch(() => {
      setTorchSupported(false);
    });
  }, [torch, torchSupported]);

  if (!open) return null;

  const denied = status === "denied";
  const noCamera = status === "noCamera";
  const badgeText =
    status === "found"
      ? `✓ ${result ?? ""}`
      : denied || noCamera
        ? noCamera
          ? labels.noCameraFound
          : labels.permissionDenied
        : labels.scanning;
  const badgeColor = status === "found" ? SC.green : denied || noCamera ? SC.red : SC.amber;

  return (
    <div
      data-testid="camera-scanner-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{SCAN_LINE_KEYFRAMES}</style>

      {/* Top bar: title + cancel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "linear-gradient(180deg, rgba(0,0,0,0.6), transparent)",
        }}
      >
        <span style={{ color: SC.txt, fontSize: 14, fontWeight: 700 }}>{labels.title}</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label={labels.cancel}
          style={{
            background: "rgba(0,0,0,0.5)",
            border: `1px solid ${SC.elev}`,
            borderRadius: 8,
            color: SC.txt,
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          {labels.cancel}
        </button>
      </div>

      {/* Viewfinder */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, background: "#000" }}>
        <video
          data-testid="camera-scanner-video"
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "#111",
          }}
        />
        {/* Dim vignette frame */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 70%)",
          }}
        />

        {/* Reticle */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 240,
            height: 160,
            border: `2px solid ${SC.green}`,
            borderRadius: 12,
            boxShadow: "0 0 0 2000px rgba(0,0,0,0.35) inset",
          }}
        >
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <span
              key={c}
              style={{
                position: "absolute",
                width: 18,
                height: 18,
                borderColor: SC.green,
                borderStyle: "solid",
                ...(c === "tl" && { top: -2, left: -2, borderWidth: "3px 0 0 3px" }),
                ...(c === "tr" && { top: -2, right: -2, borderWidth: "3px 3px 0 0" }),
                ...(c === "bl" && { bottom: -2, left: -2, borderWidth: "0 0 3px 3px" }),
                ...(c === "br" && { bottom: -2, right: -2, borderWidth: "0 3px 3px 0" }),
              }}
            />
          ))}
          {status === "scanning" && (
            <div
              data-testid="camera-scanner-line"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 2,
                top: "50%",
                background: `linear-gradient(90deg, transparent, ${SC.green}, transparent)`,
                animation: "mp-sc-scan-line 1.2s linear infinite",
              }}
            />
          )}
        </div>

        {/* Status badge */}
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 0,
            right: 0,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <span
            data-testid="camera-scanner-status"
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: badgeColor,
              background: "rgba(0,0,0,0.6)",
              border: `1px solid ${badgeColor}`,
            }}
          >
            {badgeText}
          </span>
        </div>

        {/* Permission-denied / no-camera panel + manual fallback */}
        {(denied || noCamera) && (
          <div
            data-testid="camera-scanner-error"
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              top: "38%",
              padding: "16px 16px",
              background: SC.bg,
              border: `1px solid ${SC.red}`,
              borderRadius: 12,
              color: SC.txt,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: 12 }}>
              {denied ? labels.permissionDenied : labels.noCameraFound}
            </div>
            <button
              type="button"
              onClick={onCancel}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 10,
                border: "none",
                background: SC.green,
                color: "#06240f",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {labels.manualFallback}
            </button>
          </div>
        )}

        {/* Controls: torch (when supported) + flip */}
        {!denied && !noCamera && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 28,
              display: "flex",
              justifyContent: "center",
              gap: 14,
            }}
          >
            {torchSupported && (
              <button
                type="button"
                onClick={() => setTorch((t) => !t)}
                aria-label={labels.torch}
                aria-pressed={torch}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  border: `1px solid ${SC.elev}`,
                  background: torch ? SC.amber : "rgba(0,0,0,0.5)",
                  color: torch ? "#000" : SC.txt,
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                <span aria-hidden="true">💡</span>
              </button>
            )}
            {/* When torch is unsupported the button is hidden but the control is
                still exposed (disabled) so its label stays discoverable. */}
            {!torchSupported && (
              <button
                type="button"
                disabled
                aria-label={labels.torch}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  border: `1px solid ${SC.elev}`,
                  background: "rgba(0,0,0,0.3)",
                  color: SC.elev,
                  fontSize: 22,
                  cursor: "not-allowed",
                  opacity: 0.5,
                }}
              >
                <span aria-hidden="true">💡</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label={labels.flip}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: `1px solid ${SC.elev}`,
                background: "rgba(0,0,0,0.5)",
                color: SC.txt,
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">🔄</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraScannerOverlay;
