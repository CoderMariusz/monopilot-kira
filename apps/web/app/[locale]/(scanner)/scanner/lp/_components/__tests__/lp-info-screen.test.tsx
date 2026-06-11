// RED → GREEN: LpInfoScreen parity (scan code → full LP card + genealogy).
// Anchor: prototypes/scanner/flow-other.jsx:448-495 (InquiryScreen).
//
// Asserts (parity checklist + states + i18n + RBAC):
//   - scan/enter a code → GET /api/warehouse/scanner/lp?code=… → full card:
//     product (code+name), qty/reserved/available + uom, status + qaStatus
//     badges, expiry, batch, location/warehouse, lastMoveAt, genealogy
//     (parent/child lpNumber lists) — parity w/ the MiniGrid LP card + history
//   - past expiry highlighted (expired badge)
//   - 404 → inline not-found error (honest state)
//   - i18n: copy from the resolved label object (no inline strings)
//   - RBAC/permission-denied: 401 redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LpInfoScreen } from "../lp-info-screen";
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
const L = labels.lpInfoScreen;

const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

const LP = {
  id: "lp-uuid-1",
  lpNumber: "LP-00234",
  productId: "p-1",
  productCode: "RM-001",
  productName: "Pork shoulder",
  quantity: "100.000",
  reservedQty: "20.000",
  availableQty: "80.000",
  uom: "kg",
  status: "available",
  qaStatus: "passed",
  expiryDate: "2000-01-01", // in the past → expired highlight
  batchNumber: "B-2026-04",
  locationId: "loc-1",
  locationCode: "A-01-02",
  warehouseId: "wh-1",
  warehouseCode: "WH-MAIN",
  lastMoveAt: "2026-04-12T08:30:00.000Z",
  parents: [{ id: "lp-p1", lpNumber: "LP-00100" }],
  children: [{ id: "lp-c1", lpNumber: "LP-00301" }],
};

function lpOk(lp = LP) {
  return { status: 200, ok: true, json: async () => ({ lp }) };
}

function renderLp() {
  return render(
    <ScannerSessionProvider>
      <LpInfoScreen locale="en" labels={labels} />
    </ScannerSessionProvider>,
  );
}

function seedSession() {
  window.sessionStorage.setItem(SCANNER_SESSION_STORAGE_KEY, JSON.stringify(SESSION));
}

function scan(code: string) {
  const input = screen.getByPlaceholderText(L.scanPlaceholder);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: "Enter" });
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

describe("LpInfoScreen", () => {
  it("scans a code → renders the full LP card + genealogy (happy path + i18n + parity)", async () => {
    seedSession();
    const fetchMock = vi.fn().mockResolvedValue(lpOk());
    vi.stubGlobal("fetch", fetchMock);

    renderLp();

    // initial prompt state (nothing scanned yet)
    expect(screen.getByText(L.promptTitle)).toBeInTheDocument();

    scan("LP-00234");

    await waitFor(() => expect(screen.getByText("LP-00234")).toBeInTheDocument());

    // the lookup targets the contract endpoint with the scanned code
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/warehouse/scanner/lp?code=LP-00234",
      expect.objectContaining({ method: "GET" }),
    );

    // card fields
    expect(screen.getByText("RM-001 · Pork shoulder")).toBeInTheDocument();
    expect(screen.getByText("100.000 kg")).toBeInTheDocument(); // quantity
    expect(screen.getByText("20.000 kg")).toBeInTheDocument(); // reserved
    expect(screen.getByText("80.000 kg")).toBeInTheDocument(); // available
    expect(screen.getByText("B-2026-04")).toBeInTheDocument(); // batch
    expect(screen.getByText("A-01-02")).toBeInTheDocument(); // location
    expect(screen.getByText("WH-MAIN")).toBeInTheDocument(); // warehouse

    // status + qa badges (localized). "Available" also appears as a MiniGrid
    // cell label, so assert presence (>=1) for status and the unique qa value.
    expect(screen.getAllByText(L.statusValues.available).length).toBeGreaterThan(0);
    expect(screen.getByText(L.qaValues.passed)).toBeInTheDocument();
    // past expiry → expired badge highlighted
    expect(screen.getByText(L.expiryPast)).toBeInTheDocument();

    // genealogy lists
    expect(screen.getByText(L.genealogyTitle)).toBeInTheDocument();
    expect(screen.getByText(/LP-00100/)).toBeInTheDocument(); // parent
    expect(screen.getByText(/LP-00301/)).toBeInTheDocument(); // child
  });

  it("shows the inline not-found error on a 404", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({ error: "lp_not_found" }) }),
    );

    renderLp();
    scan("LP-99999");

    await waitFor(() => expect(screen.getAllByText(L.notFound).length).toBeGreaterThan(0));
    // can scan next after the error
    expect(screen.getByRole("button", { name: L.scanNext })).toBeInTheDocument();
  });

  it("redirects to ../login when the lookup returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );

    renderLp();
    scan("LP-00234");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
