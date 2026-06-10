// RED → GREEN: LoginScreen parity + routing on the POST /api/scanner/login
// contract (200 ok → site, 409 pin_not_enrolled → pin-setup, 401 invalid_pin
// → inline error). Anchor: prototypes/scanner/login.jsx:5-126.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LoginScreen } from "../login-screen";
import { getScannerLabels } from "../../../../_components/scanner-labels";
import {
  ScannerSessionProvider,
  SCANNER_SESSION_STORAGE_KEY,
} from "../../../../_components/scanner-session";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useParams: () => ({ locale: "en" }),
}));

const labels = getScannerLabels("en");

function renderLogin() {
  return render(
    <ScannerSessionProvider>
      <LoginScreen locale="en" labels={labels} />
    </ScannerSessionProvider>,
  );
}

function typeEmailAndPin(pin: string) {
  fireEvent.change(screen.getByLabelText(labels.login.emailLabel), {
    target: { value: "operator@apex.pl" },
  });
  for (const d of pin.split("")) {
    fireEvent.click(screen.getByRole("button", { name: d }));
  }
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LoginScreen", () => {
  it("renders parity chrome: title, email field, PIN keypad, submit", () => {
    renderLogin();
    expect(screen.getByText(labels.login.title)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.login.emailLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.login.submit })).toBeInTheDocument();
  });

  it("on 200 ok stores the session token and routes to /en/login/site", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        ok: true,
        token: "tok-123",
        user: { id: "u1", name: "Jan Kowalski" },
        expiresAt: "2026-06-11T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogin();
    typeEmailAndPin("1234");
    fireEvent.click(screen.getByRole("button", { name: labels.login.submit }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login/site"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scanner/login",
      expect.objectContaining({ method: "POST" }),
    );
    const stored = JSON.parse(window.sessionStorage.getItem(SCANNER_SESSION_STORAGE_KEY) || "null");
    expect(stored.token).toBe("tok-123");
    expect(stored.user.name).toBe("Jan Kowalski");
  });

  it("on 401 invalid_pin shows the inline error and does not navigate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      json: async () => ({ error: "invalid_pin" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogin();
    typeEmailAndPin("9999");
    fireEvent.click(screen.getByRole("button", { name: labels.login.submit }));

    await waitFor(() => expect(screen.getByText(labels.login.errInvalidPin)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SCANNER_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("on 409 pin_not_enrolled routes to the pin-setup screen", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ error: "pin_not_enrolled" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogin();
    typeEmailAndPin("1357");
    fireEvent.click(screen.getByRole("button", { name: labels.login.submit }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login/pin-setup"));
  });
});
