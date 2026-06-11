// RED → GREEN: ConsumeScreen flow parity (material select → keypad → POST).
// Anchor: prototypes/scanner/flow-consume.jsx:215-422 (qty step) + 425-443 (done).
//
// Asserts:
//   - parity chrome + material pick list from the detail data
//   - qty entered via the keypad in the MATERIAL's uom (shown, not free-text)
//   - the POST body carries materialId + a DECIMAL STRING qty + clientOpId
//   - done state shows the success/parity copy and the "consume next" loop
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
        plannedQty: 300,
        qtyEntered: null,
        qtyEnteredUom: null,
        uomSnapshot: null,
        scheduledStart: null,
        producedKg: 0,
      },
      materials: [
        { id: "m-1", materialName: "Pork shoulder", requiredQty: 120, consumedQty: 0, uom: "kg", sequence: 1 },
        { id: "m-2", materialName: "Salt", requiredQty: 4, consumedQty: 0, uom: "kg", sequence: 2 },
      ],
      allergenGate: false,
    }),
  };
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

  it("material select → keypad (material uom) → POST with materialId + decimal-string qty + clientOpId", async () => {
    seedSession();
    // URL/method-aware: GET detail (idempotent, may re-load) vs POST consume.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderConsume();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());

    // pick the first material (click the row button, not the inner text node)
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);

    // qty field shows the material uom (kg), opens the keypad
    const qtyField = await screen.findByLabelText(labels.consume.enterQty);
    expect(within(qtyField).getByText("kg")).toBeInTheDocument();

    fireEvent.click(qtyField);
    // override the prefilled remaining qty: clear then enter 50
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    fireEvent.click(screen.getByRole("button", { name: shellLabels.qtyKeypad.confirm }));

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

    // done state + consume-next loop (doneTitle appears in the topbar AND body)
    await waitFor(() =>
      expect(screen.getAllByText(labels.consume.doneTitle).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(labels.consume.bomUpdated)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.consume.consumeNext })).toBeInTheDocument();
  });

  it("redirects to ../login when the detail load returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));

    renderConsume();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
