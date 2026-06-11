// RED → GREEN: MoveScreen flow parity (scan LP → destination + reason → confirm).
// Anchor: prototypes/scanner/flow-other.jsx:26-143.
//
// Asserts:
//   - happy path: scan LP → GET lp → LP card → suggestions act as destination
//     shortcuts → pick one + a reason → POST move with clientOpId + lpId +
//     toLocationId + reason → success "from → to" banner + "Move another" reset
//   - error path: POST 409 lp_not_movable → blocking error banner, no done state
//   - i18n: copy comes from the resolved label object (no inline strings)
//   - RBAC/permission-denied: missing session redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MoveScreen } from "../move-screen";
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
const L = labels.moveScreen;
const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };
const OP_ID = "44444444-4444-4444-8444-444444444444";

const LP = {
  id: "lp-uuid-9",
  lpNumber: "LP-00245",
  productId: "p-2",
  productCode: "FG-010",
  productName: "Kabanos box",
  quantity: 12,
  reservedQty: 0,
  availableQty: 12,
  uom: "box",
  status: "available",
  qaStatus: "pass",
  expiryDate: "2026-08-01",
  batchNumber: "B-77",
  locationId: "loc-old",
  locationCode: "LOC-A-02-01",
  warehouseId: "wh-1",
  warehouseCode: "WH1",
  lastMoveAt: null,
  parents: [],
  children: [],
};

const SUGGESTIONS = [
  { locationId: "loc-x", locationCode: "LOC-D-01-01", locationName: "Dispatch D", reason: "default" },
];

function lpOk() {
  return { status: 200, ok: true, json: async () => ({ lp: LP }) };
}
function suggestOk() {
  return { status: 200, ok: true, json: async () => ({ suggestions: SUGGESTIONS }) };
}
function moveOk() {
  return { status: 200, ok: true, json: async () => ({ ok: true, moveId: "mv-9" }) };
}
function move409() {
  return { status: 409, ok: false, json: async () => ({ error: "lp_not_movable" }) };
}
function locationOk() {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      location: {
        id: "loc-manual",
        code: "LOC-E-07-02",
        name: "Manual bay E",
        warehouseId: "wh-1",
        warehouseCode: "WH1",
        locationType: "rack",
      },
    }),
  };
}
function locationNotFound() {
  return { status: 404, ok: false, json: async () => ({ error: "location_not_found" }) };
}

function renderMove() {
  return render(
    <ScannerSessionProvider>
      <MoveScreen locale="en" labels={labels} />
    </ScannerSessionProvider>,
  );
}
function seedSession() {
  window.sessionStorage.setItem(SCANNER_SESSION_STORAGE_KEY, JSON.stringify(SESSION));
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    OP_ID as `${string}-${string}-${string}-${string}-${string}`,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MoveScreen", () => {
  it("scan LP → pick destination + reason → POST move → success (happy path + i18n)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(moveOk());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      if (url.includes("/scanner/lp")) return Promise.resolve(lpOk());
      return Promise.resolve(lpOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMove();

    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00245" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Kabanos box")).toBeInTheDocument());
    expect(screen.getByText("LOC-A-02-01")).toBeInTheDocument();

    // suggestion appears as a destination shortcut
    await waitFor(() => expect(screen.getByText("LOC-D-01-01")).toBeInTheDocument());
    fireEvent.click(screen.getByText("LOC-D-01-01").closest("button")!);
    // pick a reason
    fireEvent.click(screen.getByRole("button", { name: L.reasonRelocation }));

    fireEvent.click(screen.getByRole("button", { name: L.confirm }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe("/api/warehouse/scanner/move");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: OP_ID,
      lpId: "lp-uuid-9",
      toLocationId: "loc-x",
      reason: "relocation",
    });

    await waitFor(() => expect(screen.getByText(L.successTitle)).toBeInTheDocument());
    expect(screen.getByText(L.successFrom)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: L.nextLp })).toBeInTheDocument();
  });

  it("manual destination: type a location → resolve → confirm with resolved id", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(moveOk());
      if (url.includes("/scanner/location")) return Promise.resolve(locationOk());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      if (url.includes("/scanner/lp")) return Promise.resolve(lpOk());
      return Promise.resolve(lpOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMove();
    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00245" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Kabanos box")).toBeInTheDocument());

    // free-form destination resolves and enables Confirm with the resolved id
    const dest = screen.getByLabelText(L.destLabel);
    fireEvent.change(dest, { target: { value: "LOC-E-07-02" } });
    fireEvent.keyDown(dest, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(L.resolvedLabel)).toBeInTheDocument());
    const locCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/scanner/location"))!;
    expect(locCall[0]).toContain("code=LOC-E-07-02");
    expect(screen.getByText("Manual bay E")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: L.confirm }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe("/api/warehouse/scanner/move");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({ clientOpId: OP_ID, lpId: "lp-uuid-9", toLocationId: "loc-manual" });

    await waitFor(() => expect(screen.getByText(L.successTitle)).toBeInTheDocument());
  });

  it("manual destination 404: resolver miss shows inline locationNotFound, Confirm disabled", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(moveOk());
      if (url.includes("/scanner/location")) return Promise.resolve(locationNotFound());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      return Promise.resolve(lpOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMove();
    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00245" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Kabanos box")).toBeInTheDocument());

    const dest = screen.getByLabelText(L.destLabel);
    fireEvent.change(dest, { target: { value: "LOC-NOPE" } });
    fireEvent.keyDown(dest, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(L.locationNotFound)).toBeInTheDocument());
    expect(screen.queryByText(L.resolvedLabel)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L.confirm })).toBeDisabled();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "POST")).toBe(false);
  });

  it("error path: 409 lp_not_movable surfaces a blocking banner and no done state", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(move409());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      return Promise.resolve(lpOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMove();
    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00245" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Kabanos box")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("LOC-D-01-01")).toBeInTheDocument());
    fireEvent.click(screen.getByText("LOC-D-01-01").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: L.confirm }));

    await waitFor(() => expect(screen.getByText(L.errNotMovable)).toBeInTheDocument());
    // stayed on the form — no success banner
    expect(screen.queryByText(L.successTitle)).not.toBeInTheDocument();
  });

  it("redirects to ../login when there is no session (permission-denied)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderMove();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
