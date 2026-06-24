// RED → GREEN: ConsumeScreen flow parity (material select → LP pick → keypad → POST).
// Anchor: prototypes/scanner/flow-consume.jsx:215-422 (LP + qty steps) + 425-443 (done).
//
// Asserts:
//   - parity chrome + material pick list from the detail data
//   - FEFO LP candidates fetched per material; rendered in route order (top =
//     suggested) with a "manual / no LP" fallback so the flow never dead-ends
//   - qty entered via the keypad in the MATERIAL's uom (shown, not free-text)
//   - the POST body carries materialId + a DECIMAL STRING qty + clientOpId
//     (+ lpId when an LP was chosen)
//   - done state shows the success/parity copy, the LP's remaining qty when an
//     LP was used, and the "consume next" loop
//   - i18n: copy comes from the resolved label object (no inline strings)
//   - RBAC/permission-denied: 401 on detail load redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ConsumeScreen } from "../consume-screen";
import { getScannerLabels } from "../../../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../../../_components/scanner-prod-labels";
import {
  ScannerSessionProvider,
  SCANNER_SESSION_STORAGE_KEY,
} from "../../../../../../_components/scanner-session";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useParams: () => ({ locale: "en" }),
}));

const shellLabels = getScannerLabels("en");
const labels = getScannerProdLabels("en");

const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

function detailOk() {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      ok: true,
      header: {
        id: "wo-1",
        woNumber: "WO-2026-0108",
        status: "inprog",
        itemCode: "FG-001",
        productName: "Kabanos",
        plannedQty: "300",
        qtyEntered: null,
        qtyEnteredUom: null,
        uomSnapshot: null,
        scheduledStart: null,
        producedBaseKg: "0",
        producedUnits: null,
      },
      materials: [
        { id: "m-1", materialName: "Pork shoulder", requiredQty: "120", consumedQty: "0", uom: "kg", sequence: 1 },
        { id: "m-2", materialName: "Salt", requiredQty: "4", consumedQty: "0", uom: "kg", sequence: 2 },
      ],
      allergenGate: false,
    }),
  };
}

// FEFO order is the ROUTE's contract (expiry asc nulls last) — the screen must
// render candidates in response order with the top one marked as suggested.
const FEFO_LPS = [
  { lpId: "lp-1", lpNumber: "LP-0001", qty: "40.000", uom: "kg", expiry: "2026-06-12" },
  { lpId: "lp-2", lpNumber: "LP-0002", qty: "80.000", uom: "kg", expiry: "2026-06-20" },
  { lpId: "lp-3", lpNumber: "LP-0003", qty: "25.000", uom: "kg", expiry: null },
];

function lpsOk(lps: typeof FEFO_LPS | [] = FEFO_LPS) {
  return { status: 200, ok: true, json: async () => ({ ok: true, lps }) };
}

function renderConsume() {
  return render(
    <ScannerSessionProvider>
      <ConsumeScreen locale="en" woId="wo-1" shellLabels={shellLabels} labels={labels} />
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
    "22222222-2222-4222-8222-222222222222" as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConsumeScreen", () => {
  it("lists materials from the detail data and shows the pick title (parity + i18n)", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailOk()));

    renderConsume();

    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    expect(screen.getByText(labels.consume.pickTitle)).toBeInTheDocument();
    expect(screen.getByText("Salt")).toBeInTheDocument();
  });

  it("material select → manual/no-LP → keypad (material uom) → POST with materialId + decimal-string qty + clientOpId", async () => {
    seedSession();
    // URL/method-aware: GET detail vs GET lps (no candidates) vs POST consume.
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk([]));
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());

    // pick the first material (click the row button, not the inner text node)
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);

    // no LP candidates → the manual fallback keeps the flow alive
    await waitFor(() => expect(screen.getByText(labels.consume.lpEmpty)).toBeInTheDocument());
    fireEvent.click(screen.getByText(labels.consume.lpManual).closest("button")!);

    // qty field shows the material uom (kg), opens the keypad
    const qtyField = await screen.findByLabelText(labels.consume.enterQty);
    expect(within(qtyField).getByText("kg")).toBeInTheDocument();

    fireEvent.click(qtyField);
    // override the prefilled remaining qty: clear then enter 50
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    fireEvent.click(screen.getByRole("button", { name: shellLabels.qtyKeypad.confirm }));
    fireEvent.change(screen.getByLabelText(new RegExp(labels.consume.reasonLabel)), {
      target: { value: "silo-draw" },
    });

    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[1] === "object" && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });

    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1]?.method === "POST",
    )!;
    expect(postCall[0]).toBe("/api/production/scanner/wos/wo-1/consume");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: "22222222-2222-4222-8222-222222222222",
      materialId: "m-1",
    });
    expect(typeof body.qty).toBe("string");
    expect(Number(body.qty)).toBeGreaterThan(0);
    // manual / no LP: the POST must NOT carry an lpId
    expect(body.lpId).toBeUndefined();
    expect(body.reasonCode).toBe("silo-draw");

    // done state + consume-next loop (doneTitle appears in the topbar AND body)
    await waitFor(() =>
      expect(screen.getAllByText(labels.consume.doneTitle).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(labels.consume.bomUpdated)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.consume.consumeNext })).toBeInTheDocument();
  });

  it("renders FEFO LP candidates in route order (top = suggested) and sends the chosen lpId in the POST", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);

    // the LP fetch targets the picked material
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());
    const lpsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/lps"))!;
    expect(lpsCall[0]).toBe("/api/production/scanner/wos/wo-1/lps?materialId=m-1");

    // FEFO order asserted: candidates appear in the route's expiry-asc order
    const lpNumbers = screen.getAllByText(/^LP-\d+$/).map((node) => node.textContent);
    expect(lpNumbers).toEqual(["LP-0001", "LP-0002", "LP-0003"]);
    // top candidate carries the suggested (FEFO) chip
    const firstRow = screen.getByText("LP-0001").closest("button")!;
    expect(within(firstRow).getByText(labels.consume.lpSuggested)).toBeInTheDocument();
    // expiry surfaces on the rows that have one
    expect(within(firstRow).getByText(new RegExp("2026-06-12"))).toBeInTheDocument();
    // manual fallback is always present
    expect(screen.getByText(labels.consume.lpManual)).toBeInTheDocument();

    // choose the SECOND LP (operator override of the suggestion)
    fireEvent.click(screen.getByText("LP-0002").closest("button")!);

    // qty step (prefilled with remaining 120) → confirm
    await screen.findByLabelText(labels.consume.enterQty);
    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[1] === "object" && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1]?.method === "POST",
    )!;
    expect(postCall[0]).toBe("/api/production/scanner/wos/wo-1/consume");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: "22222222-2222-4222-8222-222222222222",
      materialId: "m-1",
      lpId: "lp-2",
    });
    expect(typeof body.qty).toBe("string");

    // done state surfaces the LP's remaining qty (80 - 120-prefill clamps ≥ 0 → 0;
    // here qty was prefilled to remaining=120 > LP qty 80, so remaining shows 0)
    await waitFor(() =>
      expect(screen.getAllByText(labels.consume.doneTitle).length).toBeGreaterThan(0),
    );
    const remainingText = labels.consume.doneLpRemaining
      .replace("{qty}", "0")
      .replace("{uom}", "kg")
      .replace("{lp}", "LP-0002");
    expect(screen.getByText(remainingText)).toBeInTheDocument();
  });

  // SCAN-1: picking an LP whose AVAILABLE qty is below the BOM remaining-required
  // must default the consume qty to the LP's available (min), never the remaining
  // — you can't consume more than is physically on the pallet. Parity anchor:
  // prototypes/.../scanner/flow-consume.jsx:300
  //   setQty(String(Math.min(lpData.qty, line.qtyReq - line.qtyDone || lpData.qty)))
  it("defaults the consume qty to the LP's available when it is BELOW the remaining-required (SCAN-1)", async () => {
    seedSession();
    // LP-0001 carries 40 kg available; the material needs 120 kg remaining.
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);

    // pick the suggested LP (LP-0001, 40 kg available) — under the 120 kg remaining
    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());
    fireEvent.click(screen.getByText("LP-0001").closest("button")!);

    // qty field is pre-filled with the LP's available (40), NOT the remaining (120)
    const qtyField = await screen.findByLabelText(labels.consume.enterQty);
    expect(within(qtyField).getByText("40")).toBeInTheDocument();
    expect(within(qtyField).queryByText("120")).not.toBeInTheDocument();

    // confirm WITHOUT touching the keypad → the POST carries the clamped default
    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[1] === "object" && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1]?.method === "POST",
    )!;
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    // qty is the LP available (40), not the BOM remaining (120) — decimal STRING on the wire
    expect(body.qty).toBe("40");
    expect(body.lpId).toBe("lp-1");
  });

  it("keeps defaulting the consume qty to the remaining-required when the LP has MORE than required", async () => {
    seedSession();
    // Material "Salt" needs 4 kg; every LP candidate carries far more (40/80/25 kg).
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk());
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Salt")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Salt").closest("button")!);

    await waitFor(() => expect(screen.getByText("LP-0001")).toBeInTheDocument());
    fireEvent.click(screen.getByText("LP-0001").closest("button")!);

    // LP available (40) > remaining (4) → default stays the remaining-required (4)
    const qtyField = await screen.findByLabelText(labels.consume.enterQty);
    expect(within(qtyField).getByText("4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[1] === "object" && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1]?.method === "POST",
    )!;
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body.qty).toBe("4");
  });

  it("shows the amber warn banner on a success that carries the warn-tier warning payload", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        // Warn tier of the two-tier gate: 200 ok WITH a warning payload.
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            warning: { overconsumed: true, overPct: 7.5, warnPct: 5 },
          }),
        });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk([]));
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText(labels.consume.lpEmpty)).toBeInTheDocument());
    fireEvent.click(screen.getByText(labels.consume.lpManual).closest("button")!);
    await screen.findByLabelText(labels.consume.enterQty);
    fireEvent.change(screen.getByLabelText(new RegExp(labels.consume.reasonLabel)), {
      target: { value: "silo-draw" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));

    // done state + amber banner with the resolved warn copy (i18n label, {pct} filled)
    await waitFor(() =>
      expect(screen.getAllByText(labels.consume.doneTitle).length).toBeGreaterThan(0),
    );
    expect(
      screen.getByText(labels.consume.warnOver.replace("{pct}", "7.50")),
    ).toBeInTheDocument();
    // success copy still renders — the warning is non-blocking
    expect(screen.getByText(labels.consume.bomUpdated)).toBeInTheDocument();
  });

  it("does NOT render the warn banner on a plain success (no warning payload)", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/lps")) return Promise.resolve(lpsOk([]));
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);
    await waitFor(() => expect(screen.getByText(labels.consume.lpEmpty)).toBeInTheDocument());
    fireEvent.click(screen.getByText(labels.consume.lpManual).closest("button")!);
    await screen.findByLabelText(labels.consume.enterQty);
    fireEvent.change(screen.getByLabelText(new RegExp(labels.consume.reasonLabel)), {
      target: { value: "silo-draw" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.consume.confirm }));

    await waitFor(() =>
      expect(screen.getAllByText(labels.consume.doneTitle).length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByText(labels.consume.warnOver.replace("{pct}", "7.50")),
    ).not.toBeInTheDocument();
  });

  it("redirects to ../login when the detail load returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));

    renderConsume();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
