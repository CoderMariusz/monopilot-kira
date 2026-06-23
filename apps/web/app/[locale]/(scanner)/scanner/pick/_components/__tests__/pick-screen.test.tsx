// RED → GREEN: PickScreen flow parity (WO list → BOM materials → FEFO LP → POST).
// Anchor: prototypes/scanner/flow-pick.jsx:5-278.
//
// Asserts (parity checklist + states + i18n + RBAC):
//   - WO list rendered from GET /api/warehouse/scanner/pick/wos with status chip +
//     consumed/required progress (parity w/ PickWoListScreen + PickListScreen)
//   - tap WO → BOM materials list w/ progress + done-state
//   - tap material → FEFO LP candidates from GET …/pick/lps?productId=&uom= in
//     RESPONSE order (top = suggested, highlighted) — parity w/ consume LP list
//   - tap LP → POST …/pick with { clientOpId, woId, materialId, lpId }; success →
//     done banner + pick-next loop (PHYSICAL staging move, no qty)
//   - 422 reveals the destination free-entry field (one-tap otherwise)
//   - i18n: copy from the resolved label object (no inline strings)
//   - RBAC/permission-denied: 401 on the WO list redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PickScreen } from "../pick-screen";
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
const L = labels.pickScreen;

const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

const WOS = [
  {
    id: "wo-1",
    woNumber: "WO-2026-0108",
    productCode: "FG-001",
    productName: "Kabanos",
    status: "released",
    lineCode: "L1",
    materials: [
      {
        id: "m-1",
        productId: "p-1",
        productCode: "RM-001",
        productName: "Pork shoulder",
        requiredQty: "120",
        consumedQty: "0",
        uom: "kg",
      },
      {
        id: "m-2",
        productId: "p-2",
        productCode: "RM-002",
        productName: "Salt",
        requiredQty: "4",
        consumedQty: "4",
        uom: "kg",
      },
    ],
  },
];

// FEFO order is the ROUTE's contract — render in response order, top = suggested.
const FEFO_LPS = [
  { id: "lp-1", lpNumber: "LP-0001", availableQty: "40.000", uom: "kg", expiryDate: "2026-06-12", locationCode: "A-01" },
  { id: "lp-2", lpNumber: "LP-0002", availableQty: "80.000", uom: "kg", expiryDate: "2026-06-20", locationCode: "A-02" },
  { id: "lp-3", lpNumber: "LP-0003", availableQty: "25.000", uom: "kg", expiryDate: null, locationCode: null },
];

function wosOk(wos = WOS) {
  return { status: 200, ok: true, json: async () => ({ ok: true, wos }) };
}
function lpsOk(lps: typeof FEFO_LPS | [] = FEFO_LPS) {
  return { status: 200, ok: true, json: async () => ({ ok: true, lps }) };
}

function renderPick() {
  return render(
    <ScannerSessionProvider>
      <PickScreen locale="en" labels={labels} />
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
    "33333333-3333-4333-8333-333333333333" as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PickScreen", () => {
  it("WO list → materials → FEFO LP candidates → POST stages the LP (happy path + i18n + parity)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, moveId: "mv-1" }) });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();

    // WO list with progress chip (Salt done → 1/2)
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    expect(screen.getByText(L.status.released)).toBeInTheDocument();

    // open the WO → BOM materials
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText(L.materialsTitle)).toBeInTheDocument());
    expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument();
    expect(screen.getByText("RM-002 · Salt")).toBeInTheDocument();

    // open the not-yet-picked material → FEFO LP candidates
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    // the LP fetch targets productId + uom
    const lpsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/pick/lps"))!;
    expect(lpsCall[0]).toBe("/api/warehouse/scanner/pick/lps?productId=p-1&uom=kg");

    // FEFO order asserted + top candidate carries the suggested chip
    const lpNumbers = screen.getAllByText(/^LP-\d+$/).map((n) => n.textContent);
    expect(lpNumbers).toEqual(["LP-0001", "LP-0002", "LP-0003"]);
    const firstRow = screen.getByText("LP-0001").closest("button")!;
    expect(within(firstRow).getByText(L.lpSuggested)).toBeInTheDocument();

    // tap the suggested LP → POST stages it (no qty in the body)
    fireEvent.click(firstRow);

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe("/api/warehouse/scanner/pick");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: "33333333-3333-4333-8333-333333333333",
      woId: "wo-1",
      materialId: "m-1",
      lpId: "lp-1",
    });
    expect(body.toLocationId).toBeUndefined();
    expect(body.qty).toBeUndefined();

    // done banner + pick-next loop
    await waitFor(() =>
      expect(screen.getByRole("button", { name: L.pickNext })).toBeInTheDocument(),
    );
    expect(screen.getAllByText(L.doneTitle).length).toBeGreaterThan(0);
  });

  it("reveals the destination field when the POST returns 422 (missing destination)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 422, ok: false, json: async () => ({ error: "destination_required" }) });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("LP-0001").closest("button")!);

    // 422 → destination free-entry field appears (one-tap was attempted first)
    await waitFor(() => expect(screen.getByText(L.destinationLabel)).toBeInTheDocument());
    expect(screen.getAllByText(L.destinationRequired).length).toBeGreaterThan(0);
  });

  it("resolves the typed destination CODE to a UUID before sending toLocationId (never raw text)", async () => {
    seedSession();
    let postCount = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        // first POST (one-tap) demands a staging destination; retry succeeds.
        if (postCount === 1) {
          return Promise.resolve({ status: 422, ok: false, json: async () => ({ error: "destination_required" }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, moveId: "mv-1" }) });
      }
      if (url.includes("/scanner/location")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            location: { id: "loc-uuid-77", code: "STG-01", name: "Staging 01", warehouseId: "w1", warehouseCode: "WH1", locationType: "staging" },
          }),
        });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    // one-tap pick → 422 demands a destination → free-entry field appears.
    fireEvent.click(screen.getByText("LP-0001").closest("button")!);
    await waitFor(() => expect(screen.getByText(L.destinationLabel)).toBeInTheDocument());

    // type a location CODE and submit (Enter) → it RESOLVES via the location API.
    const destInput = screen.getByPlaceholderText(L.destinationPlaceholder) as HTMLInputElement;
    fireEvent.change(destInput, { target: { value: "STG-01" } });
    fireEvent.keyDown(destInput, { key: "Enter" });

    // the resolve call targets the location lookup endpoint with the typed code…
    await waitFor(() => {
      const lookup = fetchMock.mock.calls.find((c) => String(c[0]).includes("/scanner/location"));
      expect(lookup).toBeTruthy();
    });
    const lookup = fetchMock.mock.calls.find((c) => String(c[0]).includes("/scanner/location"))!;
    expect(lookup[0]).toBe("/api/warehouse/scanner/location?code=STG-01");

    // …and the resolved-location chip confirms the resolution (code + name).
    await waitFor(() => expect(screen.getByText("Staging 01")).toBeInTheDocument());
    expect(screen.getAllByText("STG-01").length).toBeGreaterThan(0);

    // now confirm the pick again → the POST carries the RESOLVED UUID, not "STG-01".
    fireEvent.click(screen.getByText("LP-0001").closest("button")!);
    await waitFor(() => expect(postCount).toBe(2));
    const post = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === "POST").at(-1)!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.toLocationId).toBe("loc-uuid-77");
    expect(body.toLocationId).not.toBe("STG-01");
  });

  it("shows location-not-found and keeps the destination field open on a 404 resolve", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 422, ok: false, json: async () => ({ error: "destination_required" }) });
      }
      if (url.includes("/scanner/location")) {
        return Promise.resolve({ status: 404, ok: false, json: async () => ({ error: "location_not_found" }) });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("LP-0001").closest("button")!);
    await waitFor(() => expect(screen.getByText(L.destinationLabel)).toBeInTheDocument());

    const destInput = screen.getByPlaceholderText(L.destinationPlaceholder) as HTMLInputElement;
    fireEvent.change(destInput, { target: { value: "NOPE-99" } });
    fireEvent.keyDown(destInput, { key: "Enter" });

    // not-found state shown; the field stays open (loop not broken).
    await waitFor(() => expect(screen.getAllByText(L.destNotFound).length).toBeGreaterThan(0));
    expect(screen.getByPlaceholderText(L.destinationPlaceholder)).toBeInTheDocument();
  });

  it("treats a non-destination 422 (invalid_material) as a generic error — destination field stays hidden (review fix F4)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 422, ok: false, json: async () => ({ ok: false, error: "invalid_material" }) });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("LP-0001").closest("button")!);

    // generic error, NOT the destination flow
    await waitFor(() => expect(screen.getAllByText(L.errGeneric).length).toBeGreaterThan(0));
    expect(screen.queryByText(L.destinationLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(L.destinationRequired)).not.toBeInTheDocument();
  });

  it("shows the QA-release message on 409 lp_not_released (review fix F3 label wiring)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 409, ok: false, json: async () => ({ ok: false, error: "lp_not_released" }) });
      }
      if (url.includes("/pick/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(wosOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPick();
    await waitFor(() => expect(screen.getByText("WO-2026-0108")).toBeInTheDocument());
    fireEvent.click(screen.getByText("WO-2026-0108").closest("button")!);
    await waitFor(() => expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("RM-001 · Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("LP-0001").closest("button")!);

    await waitFor(() => expect(screen.getAllByText(L.lpNotReleased).length).toBeGreaterThan(0));
    expect(screen.queryByText(L.err409)).not.toBeInTheDocument();
  });

  it("redirects to ../login when the WO list returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );

    renderPick();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });

  it("shows the empty state when there are no WOs to pick", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(wosOk([])));

    renderPick();

    await waitFor(() => expect(screen.getByText(L.emptyTitle)).toBeInTheDocument());
    expect(screen.getByText(L.emptyBody)).toBeInTheDocument();
  });
});
