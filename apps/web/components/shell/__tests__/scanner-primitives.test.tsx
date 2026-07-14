/**
 * @vitest-environment jsdom
 *
 * Scanner Topbar — dead-control cleanup contract (scanner polish wave).
 *
 * Owner-signed-off deviation from prototypes/scanner/shell.jsx:36-58:
 *   - the fake-person avatar-initials button ("JK") is REMOVED;
 *   - the ⋮ menu button renders ONLY when an `onMenu` handler is wired
 *     (no dead button on screens that never wired it);
 *   - the sync badge defaults to live `navigator.onLine` instead of a
 *     hardcoded "online" lie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { ScanInputArea, Topbar } from "../scanner-primitives";

const labels = {
  back: "Back",
  menu: "Menu",
  syncTitle: "Sync status",
  online: "ONLINE",
  queued: "QUEUED",
  syncErr: "SYNC ERR",
};

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

beforeEach(() => {
  setOnline(true);
});

describe("Topbar — fake-person avatar removed", () => {
  it("renders no profile / avatar button", () => {
    render(<Topbar title="Scanner" labels={labels} />);
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Profil" })).toBeNull();
    // The hardcoded "JK" initials placeholder must be gone.
    expect(screen.queryByText("JK")).toBeNull();
  });
});

describe("Topbar — ⋮ menu only when wired", () => {
  it("hides the menu button when onMenu is absent (no dead control)", () => {
    render(<Topbar title="WO list" labels={labels} />);
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
  });

  it("renders and fires the menu button when onMenu is provided", () => {
    const onMenu = vi.fn();
    render(<Topbar title="Scanner" onMenu={onMenu} labels={labels} />);
    const btn = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(btn);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

describe("Topbar — sync badge reflects connectivity", () => {
  it("shows ONLINE when navigator is online and no explicit syncState", () => {
    setOnline(true);
    render(<Topbar title="Scanner" labels={labels} />);
    expect(screen.getByText("ONLINE")).toBeInTheDocument();
    expect(screen.queryByText("SYNC ERR")).toBeNull();
  });

  it("reflects offline as SYNC ERR (badge is not a hardcoded lie)", () => {
    setOnline(false);
    render(<Topbar title="Scanner" labels={labels} />);
    expect(screen.getByText("SYNC ERR")).toBeInTheDocument();
  });

  it("updates the badge live on an offline event", () => {
    setOnline(true);
    render(<Topbar title="Scanner" labels={labels} />);
    expect(screen.getByText("ONLINE")).toBeInTheDocument();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("SYNC ERR")).toBeInTheDocument();
  });

  it("still honours an explicit syncState override", () => {
    setOnline(true);
    render(<Topbar title="Scanner" syncState="queued" labels={labels} />);
    expect(screen.getByText("QUEUED")).toBeInTheDocument();
  });
});

describe("ScanInputArea — error state", () => {
  it("marks the input invalid and announces the error text", () => {
    render(
      <ScanInputArea
        state="err"
        errorText="License plate not found or unavailable."
        labels={{ camera: "Camera", manual: "Manual" }}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("License plate not found or unavailable.");
  });
});
