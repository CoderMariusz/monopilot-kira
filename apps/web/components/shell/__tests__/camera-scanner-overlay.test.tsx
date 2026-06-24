/**
 * @vitest-environment jsdom
 *
 * RED — CameraScannerOverlay (FR-SC-FE-007) production contract.
 *
 * Parity anchor: prototypes/scanner/modals.jsx:312-490 (CameraScanner).
 *   - full-screen fixed overlay (position:fixed, inset:0, high z-index)
 *   - <video> viewfinder + reticle + scanning-line (modals.jsx:406-437)
 *   - torch + flip-camera round controls (modals.jsx:471-481)
 *   - status badge ("Skanowanie…" / "✓ <code>" / "Brak kamery")
 *   - decode (BrowserMultiFormatReader continuous) → success → onDecode(code)
 *
 * States asserted: scanning (default), success/optimistic (decode hit),
 * permission-denied (NotAllowedError → manual fallback), no-camera
 * (NotFoundError → "camera unavailable"). i18n: every visible string comes
 * from `labels` (no inline copy). The stream MUST be stopped on unmount.
 *
 * @zxing/browser is mocked so the continuous-decode callback can be driven
 * deterministically without a real camera or TLS.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mock @zxing/browser BEFORE importing the component under test ---
const stopSpy = vi.fn();
const switchTorchSpy = vi.fn().mockResolvedValue(undefined);
let lastDecodeCallback:
  | ((result: { getText: () => string } | undefined, err: unknown, controls: unknown) => void)
  | null = null;
let decodeFromConstraintsImpl: () => Promise<unknown> = async () => {
  const controls = { stop: stopSpy, switchTorch: switchTorchSpy };
  return controls;
};

vi.mock("@zxing/browser", () => {
  class BrowserMultiFormatReader {
    async decodeFromConstraints(
      _constraints: MediaStreamConstraints,
      _el: HTMLVideoElement,
      cb: (result: { getText: () => string } | undefined, err: unknown, controls: unknown) => void,
    ) {
      lastDecodeCallback = cb;
      return decodeFromConstraintsImpl();
    }
  }
  return { BrowserMultiFormatReader };
});

import { CameraScannerOverlay } from "../camera-scanner-overlay";

const labels = {
  title: "Scan with camera",
  scanning: "Scanning…",
  found: "Found",
  cancel: "Cancel",
  torch: "Torch",
  flip: "Flip camera",
  permissionDenied: "Camera permission denied",
  noCameraFound: "Camera unavailable",
  manualFallback: "Enter manually",
};

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

function fakeStream() {
  const track = { stop: vi.fn(), getCapabilities: () => ({}) } as unknown as MediaStreamTrack;
  return { getTracks: () => [track] } as unknown as MediaStream;
}

beforeEach(() => {
  stopSpy.mockClear();
  switchTorchSpy.mockClear();
  lastDecodeCallback = null;
  decodeFromConstraintsImpl = async () => ({ stop: stopSpy, switchTorch: switchTorchSpy });
  // jsdom lacks HTMLMediaElement.play
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  mockGetUserMedia(async () => fakeStream());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CameraScannerOverlay — render gate", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CameraScannerOverlay open={false} onDecode={vi.fn()} onCancel={vi.fn()} labels={labels} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a full-screen fixed overlay with a video viewfinder when open", async () => {
    render(<CameraScannerOverlay open onDecode={vi.fn()} onCancel={vi.fn()} labels={labels} />);
    const overlay = await screen.findByTestId("camera-scanner-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveStyle({ position: "fixed" });
    expect(screen.getByTestId("camera-scanner-video")).toBeInTheDocument();
    // parity controls
    expect(screen.getByRole("button", { name: labels.torch })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.flip })).toBeInTheDocument();
    expect(screen.getByText(labels.scanning)).toBeInTheDocument();
  });
});

describe("CameraScannerOverlay — decode → onDecode", () => {
  it("calls onDecode with the decoded text after the success delay", async () => {
    vi.useFakeTimers();
    const onDecode = vi.fn();
    render(<CameraScannerOverlay open onDecode={onDecode} onCancel={vi.fn()} labels={labels} />);
    // let the async reader start + register the callback
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastDecodeCallback).toBeTypeOf("function");
    act(() => {
      lastDecodeCallback!({ getText: () => "LP-00287" }, undefined, { stop: stopSpy });
    });
    // success badge shows the code, onDecode fires after ~600ms
    expect(onDecode).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onDecode).toHaveBeenCalledWith("LP-00287");
  });
});

describe("CameraScannerOverlay — permission denied", () => {
  it("shows a permission-denied message + manual fallback on NotAllowedError", async () => {
    mockGetUserMedia(async () => {
      const e = new Error("denied");
      e.name = "NotAllowedError";
      throw e;
    });
    const onCancel = vi.fn();
    render(<CameraScannerOverlay open onDecode={vi.fn()} onCancel={onCancel} labels={labels} />);
    const panel = await screen.findByTestId("camera-scanner-error");
    expect(panel).toHaveTextContent(labels.permissionDenied);
    const fallback = screen.getByRole("button", { name: labels.manualFallback });
    fireEvent.click(fallback);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("CameraScannerOverlay — no camera", () => {
  it("shows a camera-unavailable message on NotFoundError (e.g. desktop)", async () => {
    mockGetUserMedia(async () => {
      const e = new Error("none");
      e.name = "NotFoundError";
      throw e;
    });
    render(<CameraScannerOverlay open onDecode={vi.fn()} onCancel={vi.fn()} labels={labels} />);
    const panel = await screen.findByTestId("camera-scanner-error");
    expect(panel).toHaveTextContent(labels.noCameraFound);
  });
});

describe("CameraScannerOverlay — lifecycle cleanup", () => {
  it("stops the decoder/stream on unmount (no stuck camera light)", async () => {
    const { unmount } = render(
      <CameraScannerOverlay open onDecode={vi.fn()} onCancel={vi.fn()} labels={labels} />,
    );
    await screen.findByTestId("camera-scanner-overlay");
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await waitFor(() => expect(stopSpy).toHaveBeenCalled());
  });
});
