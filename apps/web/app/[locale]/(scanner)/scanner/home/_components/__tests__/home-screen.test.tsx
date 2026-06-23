/**
 * @vitest-environment jsdom
 *
 * SCN-home — dead-control cleanup contract (scanner polish wave).
 *
 *   - the Topbar carries no fake-person avatar button;
 *   - the ⋮ menu button navigates to scanner settings (wired, not dead);
 *   - logout stays reachable via the in-page user card (it used to hang off
 *     the now-removed avatar button);
 *   - the consume / output tiles carry honest "pick a work order" copy
 *     (they route to the WO list, not a direct consume/output entry).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { HomeScreen } from "../home-screen";
import { getScannerLabels } from "../../../../_components/scanner-labels";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

const session = { token: "tok", user: { id: "u1", name: "Anna Nowak" } };

vi.mock("../../../../_components/scanner-session", () => ({
  useScannerSession: () => ({
    session,
    ready: true,
    clearSession: vi.fn(),
  }),
}));

// Render the logout sheet's open state inertly so we can assert it opened.
vi.mock("../../../../_components/scanner-modals", () => ({
  LogoutSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="logout-sheet">logout</div> : null,
}));

const labels = getScannerLabels("en");

afterEach(() => cleanup());
beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

describe("HomeScreen — no fake-person avatar in topbar", () => {
  it("renders no profile/avatar button in the topbar", () => {
    render(<HomeScreen locale="en" labels={labels} />);
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
  });
});

describe("HomeScreen — ⋮ menu navigates to settings", () => {
  it("pushes the scanner settings route when the menu is tapped", () => {
    render(<HomeScreen locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(push).toHaveBeenCalledWith("/en/scanner/settings");
  });
});

describe("HomeScreen — logout stays reachable via the user card", () => {
  it("opens the logout sheet when the user card is tapped", () => {
    render(<HomeScreen locale="en" labels={labels} />);
    expect(screen.queryByTestId("logout-sheet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: labels.logout.title }));
    expect(screen.getByTestId("logout-sheet")).toBeInTheDocument();
  });
});

describe("HomeScreen — honest consume/output tile copy", () => {
  it("consume and output tiles say they go via a work order", () => {
    render(<HomeScreen locale="en" labels={labels} />);
    expect(screen.getByText(labels.home.tiles.consume.desc)).toBeInTheDocument();
    expect(screen.getByText(labels.home.tiles.output.desc)).toBeInTheDocument();
    // honesty guard: the old "Scan BOM materials" wording is gone.
    expect(screen.queryByText("Scan BOM materials")).toBeNull();
  });
});
