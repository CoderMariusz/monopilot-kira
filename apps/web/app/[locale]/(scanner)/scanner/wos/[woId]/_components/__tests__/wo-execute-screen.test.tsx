import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { WoExecuteScreen } from "../wo-execute-screen";
import { getScannerLabels } from "../../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../../_components/scanner-prod-labels";
import {
  SCANNER_SESSION_STORAGE_KEY,
  ScannerSessionProvider,
} from "../../../../../_components/scanner-session";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useParams: () => ({ locale: "en" }),
}));

const shellLabels = getScannerLabels("en");
const labels = getScannerProdLabels("en");
const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

function detail(status: "released" | "inprog", producedUnits = "0", producedBaseKg = "0") {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      ok: true,
      header: {
        id: "wo-1",
        woNumber: "WO-2026-0108",
        status,
        itemCode: "FG-001",
        productName: "Kabanos",
        plannedQty: "20",
        qtyEntered: "20",
        qtyEnteredUom: "box",
        uomSnapshot: null,
        scheduledStart: null,
        producedBaseKg,
        producedUnits,
      },
      materials: [
        { id: "m-1", materialName: "Pork shoulder", requiredQty: "120", consumedQty: "0", uom: "kg", sequence: 1 },
      ],
      allergenGate: false,
    }),
  };
}

function renderHub() {
  return render(
    <ScannerSessionProvider>
      <WoExecuteScreen locale="en" woId="wo-1" shellLabels={shellLabels} labels={labels} />
    </ScannerSessionProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(SCANNER_SESSION_STORAGE_KEY, JSON.stringify(SESSION));
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "33333333-3333-4333-8333-333333333333" as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WoExecuteScreen", () => {
  it("shows Start for a released WO and renders honest zero progress before output", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) });
      return Promise.resolve(detail("released"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHub();

    await waitFor(() => expect(screen.getByRole("button", { name: labels.execute.startButton })).toBeInTheDocument());
    expect(screen.getByText("0 box · 0 kg")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Consume/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: labels.execute.startButton }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => typeof call[1] === "object" && call[1]?.method === "POST");
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find((call) => typeof call[1] === "object" && call[1]?.method === "POST")!;
    expect(postCall[0]).toBe("/api/production/scanner/wos/wo-1/start");
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      clientOpId: "33333333-3333-4333-8333-333333333333",
    });
  });
});
