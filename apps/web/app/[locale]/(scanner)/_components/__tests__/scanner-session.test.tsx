// RED → GREEN: scanner session provider — sessionStorage hydration,
// scannerFetch Bearer attachment, and 401 → clear + redirect to ../login.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ScannerSessionProvider,
  SCANNER_SESSION_STORAGE_KEY,
  useScannerSession,
} from "../scanner-session";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ locale: "en" }),
}));

function Harness() {
  const { session, ready, setSession, scannerFetch } = useScannerSession();
  return (
    <div>
      <div data-testid="ready">{ready ? "ready" : "pending"}</div>
      <div data-testid="user">{session?.user.name ?? "none"}</div>
      <button
        type="button"
        onClick={() =>
          setSession({ token: "tok-abc", user: { id: "u1", name: "Anna Nowak" } })
        }
      >
        set
      </button>
      <button type="button" onClick={() => void scannerFetch("context", { siteId: "s1" })}>
        call
      </button>
    </div>
  );
}

beforeEach(() => {
  replace.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ScannerSessionProvider", () => {
  it("hydrates an existing session from sessionStorage on mount", async () => {
    window.sessionStorage.setItem(
      SCANNER_SESSION_STORAGE_KEY,
      JSON.stringify({ token: "stored", user: { id: "u9", name: "Stored User" } }),
    );
    render(
      <ScannerSessionProvider>
        <Harness />
      </ScannerSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("ready"));
    expect(screen.getByTestId("user").textContent).toBe("Stored User");
  });

  it("persists a session set via setSession into sessionStorage", async () => {
    render(
      <ScannerSessionProvider>
        <Harness />
      </ScannerSessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "set" }));
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Anna Nowak"));
    const stored = JSON.parse(
      window.sessionStorage.getItem(SCANNER_SESSION_STORAGE_KEY) || "null",
    );
    expect(stored.token).toBe("tok-abc");
  });

  it("scannerFetch attaches the Bearer token and posts JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ScannerSessionProvider>
        <Harness />
      </ScannerSessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "set" }));
    fireEvent.click(screen.getByRole("button", { name: "call" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/scanner/context");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-abc");
    expect(init.body).toBe(JSON.stringify({ siteId: "s1" }));
  });

  it("on a 401 response clears the session and redirects to ../login", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ScannerSessionProvider>
        <Harness />
      </ScannerSessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "set" }));
    fireEvent.click(screen.getByRole("button", { name: "call" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/login"));
    expect(window.sessionStorage.getItem(SCANNER_SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId("user").textContent).toBe("none");
  });
});
