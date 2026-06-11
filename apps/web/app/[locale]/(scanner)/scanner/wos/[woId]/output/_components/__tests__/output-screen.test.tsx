// RED → GREEN: OutputScreen parity + UoM model.
// Anchor: prototypes/scanner/flow-register.jsx:6-121 (OutputScreen).
//
// Asserts:
//   - parity chrome: title, qty field, actual-weight field, batch field, confirm
//   - the qty field shows the WO's OUTPUT UNIT label (from uomSnapshot: "box")
//   - the POST body carries DECIMAL STRINGS (qtyUnits + unitsUom) and the
//     optional actualWeightKg, with a fresh clientOpId
//   - i18n: copy comes from the resolved label object (no inline strings)
//   - RBAC/permission-denied: a 401 on the detail load redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { OutputScreen } from "../output-screen";
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

const SESSION = {
  token: "tok-xyz",
  user: { id: "u1", name: "Jan Kowalski" },
};

// uomSnapshot with output unit = box; 1 box = 12 each, 1 each = 0.5 kg ⇒ 1 box = 6 kg.
const BOX_SNAPSHOT = {
  outputUom: "box" as const,
  uomBase: "kg",
  netQtyPerEach: 0.5,
  eachPerBox: 12,
  boxesPerPallet: 40,
  weightMode: "fixed" as const,
};

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
        qtyEntered: 10,
        qtyEnteredUom: "box",
        uomSnapshot: BOX_SNAPSHOT,
        scheduledStart: null,
        producedKg: 60,
      },
      materials: [],
      allergenGate: false,
    }),
  };
}

function renderOutput() {
  return render(
    <ScannerSessionProvider>
      <OutputScreen locale="en" woId="wo-1" shellLabels={shellLabels} labels={labels} />
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
  // deterministic clientOpId
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "11111111-1111-4111-8111-111111111111" as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OutputScreen", () => {
  it("renders parity chrome and shows the WO output unit label on the qty field", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailOk()));

    renderOutput();

    // form appears after the detail load
    await waitFor(() => expect(screen.getByLabelText(labels.output.enterQty)).toBeInTheDocument());
    expect(screen.getByText(labels.output.title)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.output.enterWeight)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.output.batchLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.output.confirm })).toBeInTheDocument();

    // the qty field carries the OUTPUT UNIT (box → unitBox label), not free text
    const qtyField = screen.getByLabelText(labels.output.enterQty);
    expect(within(qtyField).getByText(labels.output.unitBox)).toBeInTheDocument();
  });

  it("POSTs decimal-string qtyUnits + unitsUom + actualWeightKg with a fresh clientOpId", async () => {
    seedSession();
    // URL/method-aware: GET detail (idempotent, may re-load) vs POST output.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve(detailOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderOutput();
    await waitFor(() => expect(screen.getByLabelText(labels.output.enterQty)).toBeInTheDocument());

    // enter qty = 2 via the keypad sheet
    fireEvent.click(screen.getByLabelText(labels.output.enterQty));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: shellLabels.qtyKeypad.confirm }));

    // enter actual weight = 11.5 via the weight keypad
    fireEvent.click(screen.getByLabelText(labels.output.enterWeight));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "." }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: shellLabels.qtyKeypad.confirm }));

    fireEvent.click(screen.getByRole("button", { name: labels.output.confirm }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[1] === "object" && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });

    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1]?.method === "POST",
    )!;
    expect(postCall[0]).toBe("/api/production/scanner/wos/wo-1/output");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: "11111111-1111-4111-8111-111111111111",
      qtyUnits: "2",
      unitsUom: "box",
      actualWeightKg: "11.5",
    });
    // decimal STRINGS, never numbers
    expect(typeof body.qtyUnits).toBe("string");
    expect(typeof body.actualWeightKg).toBe("string");
    // base path was not used for a box output
    expect(body.qtyKg).toBeUndefined();
  });

  it("redirects to ../login when the detail load returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));

    renderOutput();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
