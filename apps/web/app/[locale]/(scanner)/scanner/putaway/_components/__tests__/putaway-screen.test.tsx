// RED → GREEN: PutawayScreen flow parity (scan LP → suggest → confirm).
// Anchor: prototypes/scanner/flow-putaway.jsx:5-178.
//
// Asserts:
//   - happy path: scan LP → GET lp → LP card (product/qty/loc/qa) → suggestions
//     fetched → choose one (reason chip) → POST putaway with clientOpId + lpId +
//     toLocationId → success "from → to" banner + "Next LP" reset
//   - error path: GET lp 404 → lp_not_found inline (no card, no suggest)
//   - i18n: copy comes from the resolved label object (no inline strings)
//   - RBAC/permission-denied: missing session redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PutawayScreen } from "../putaway-screen";
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
const L = labels.putawayScreen;
const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };
const OP_ID = "33333333-3333-4333-8333-333333333333";

const LP = {
  id: "lp-uuid-1",
  lpNumber: "LP-00567",
  productId: "p-1",
  productCode: "RM-001",
  productName: "Pork shoulder",
  quantity: 240,
  reservedQty: 0,
  availableQty: 240,
  uom: "kg",
  status: "available",
  qaStatus: "pass",
  expiryDate: "2026-07-01",
  batchNumber: "B-2026-12",
  locationId: "loc-old",
  locationCode: "LOC-A-01-01",
  warehouseId: "wh-1",
  warehouseCode: "WH1",
  lastMoveAt: null,
  parents: [],
  children: [],
};

const SUGGESTIONS = [
  { locationId: "loc-1", locationCode: "LOC-B-02-03", locationName: "Cold store B", reason: "same_product" },
  { locationId: "loc-2", locationCode: "LOC-C-05-01", locationName: "Bay C", reason: "empty" },
];

function lpOk() {
  return { status: 200, ok: true, json: async () => ({ lp: LP }) };
}
function lpNotFound() {
  return { status: 404, ok: false, json: async () => ({ error: "lp_not_found" }) };
}
function suggestOk() {
  return { status: 200, ok: true, json: async () => ({ suggestions: SUGGESTIONS }) };
}
function putawayOk() {
  return { status: 200, ok: true, json: async () => ({ ok: true, moveId: "mv-1" }) };
}
function locationOk() {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      location: {
        id: "loc-manual",
        code: "LOC-Z-09-09",
        name: "Manual bay Z",
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

function renderPutaway() {
  return render(
    <ScannerSessionProvider>
      <PutawayScreen locale="en" labels={labels} />
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

describe("PutawayScreen", () => {
  it("scan LP → card → suggestions → confirm → success (happy path + i18n + clientOpId)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(putawayOk());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      if (url.includes("/scanner/lp")) return Promise.resolve(lpOk());
      return Promise.resolve(lpNotFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPutaway();

    // scan an LP code
    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00567" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // LP card surfaces real data
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    expect(screen.getByText("240 kg")).toBeInTheDocument();
    expect(screen.getByText("LOC-A-01-01")).toBeInTheDocument();
    // the lookup hit the contract route with the scanned code
    const lpCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/scanner/lp"))!;
    expect(lpCall[0]).toContain("code=LP-00567");

    // go to suggestions
    fireEvent.click(screen.getByRole("button", { name: L.chooseSuggestion }));
    await waitFor(() => expect(screen.getByText("LOC-B-02-03")).toBeInTheDocument());
    const suggestCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/putaway/suggest"))!;
    expect(suggestCall[0]).toContain("lpId=lp-uuid-1");
    // reason chip rendered from labels
    const firstSugg = screen.getByText("LOC-B-02-03").closest("button")!;
    expect(within(firstSugg).getByText(L.reasonSameProduct)).toBeInTheDocument();

    // choose + confirm
    fireEvent.click(firstSugg);
    fireEvent.click(screen.getByRole("button", { name: L.confirm }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe("/api/warehouse/scanner/putaway");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({ clientOpId: OP_ID, lpId: "lp-uuid-1", toLocationId: "loc-1" });

    // success state: from → to + Next LP reset
    await waitFor(() => expect(screen.getByText(L.successTitle)).toBeInTheDocument());
    expect(screen.getByText(L.successTo)).toBeInTheDocument();
    expect(screen.getByText("LOC-B-02-03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: L.nextLp })).toBeInTheDocument();
  });

  it("manual destination: scan/type a location → resolve → confirm with resolved id", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(putawayOk());
      if (url.includes("/scanner/location")) return Promise.resolve(locationOk());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      if (url.includes("/scanner/lp")) return Promise.resolve(lpOk());
      return Promise.resolve(lpNotFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPutaway();

    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00567" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: L.chooseSuggestion }));
    await waitFor(() => expect(screen.getByText("LOC-B-02-03")).toBeInTheDocument());

    // type a location code into the manual field and resolve it
    const manual = screen.getByLabelText(L.manualLabel);
    fireEvent.change(manual, { target: { value: "LOC-Z-09-09" } });
    fireEvent.keyDown(manual, { key: "Enter" });

    // resolver hit with the typed code → resolved chip surfaces
    await waitFor(() => expect(screen.getByText(L.resolvedLabel)).toBeInTheDocument());
    const locCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/scanner/location"))!;
    expect(locCall[0]).toContain("code=LOC-Z-09-09");
    expect(screen.getByText("Manual bay Z")).toBeInTheDocument();

    // confirm uses the resolved locationId via the SAME POST path
    fireEvent.click(screen.getByRole("button", { name: L.confirm }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe("/api/warehouse/scanner/putaway");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({ clientOpId: OP_ID, lpId: "lp-uuid-1", toLocationId: "loc-manual" });

    await waitFor(() => expect(screen.getByText(L.successTitle)).toBeInTheDocument());
    expect(screen.getByText("LOC-Z-09-09")).toBeInTheDocument();
  });

  it("manual destination 404: resolver miss shows inline locationNotFound, no confirm", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(putawayOk());
      if (url.includes("/scanner/location")) return Promise.resolve(locationNotFound());
      if (url.includes("/putaway/suggest")) return Promise.resolve(suggestOk());
      if (url.includes("/scanner/lp")) return Promise.resolve(lpOk());
      return Promise.resolve(lpNotFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPutaway();
    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-00567" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: L.chooseSuggestion }));
    await waitFor(() => expect(screen.getByText("LOC-B-02-03")).toBeInTheDocument());

    const manual = screen.getByLabelText(L.manualLabel);
    fireEvent.change(manual, { target: { value: "LOC-NOPE" } });
    fireEvent.keyDown(manual, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(L.locationNotFound)).toBeInTheDocument());
    // no resolved chip, Confirm stays disabled (nothing chosen)
    expect(screen.queryByText(L.resolvedLabel)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L.confirm })).toBeDisabled();
    // no POST fired
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "POST")).toBe(false);
  });

  it("error path: lp_not_found (404) shows the inline error and renders no card", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lpNotFound()));

    renderPutaway();

    const input = await screen.findByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "LP-99999" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(L.lpNotFound)).toBeInTheDocument());
    // no LP card and the suggest CTA stays disabled
    expect(screen.queryByText("Pork shoulder")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L.chooseSuggestion })).toBeDisabled();
  });

  it("redirects to ../login when there is no session (permission-denied)", async () => {
    // no seedSession → session hydrates as null
    vi.stubGlobal("fetch", vi.fn());
    renderPutaway();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
