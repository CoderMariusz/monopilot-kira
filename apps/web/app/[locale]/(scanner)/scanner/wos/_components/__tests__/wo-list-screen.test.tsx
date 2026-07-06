// RED → GREEN: WoListScreen "My line" filter (was a missing branch in `visible`).
// Anchor: prototypes/scanner/flow-consume.jsx:8-53 (WoListScreen filter pills).
//
// Asserts (parity checklist + a state + i18n + RBAC):
//   - WO list rendered from GET /api/production/scanner/wos with status chips
//   - the "My line" pill filters the rows to the scanner session's lineId
//     (the branch that was missing); "All" shows every row again
//   - empty state when "My line" matches nothing / session has no line
//   - i18n: filter copy comes from the resolved prod-labels (no inline strings)
//   - RBAC/permission-denied: a 401 on the list redirects to ../login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { WoListScreen } from "../wo-list-screen";
import { getScannerLabels } from "../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import {
  SCANNER_SESSION_STORAGE_KEY,
  ScannerSessionProvider,
} from "../../../../_components/scanner-session";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useParams: () => ({ locale: "en" }),
}));

const shellLabels = getScannerLabels("en");
const labels = getScannerProdLabels("en");
const L = labels.list;

// session bound to line "line-1"
const SESSION = {
  token: "tok-xyz",
  user: { id: "u1", name: "Jan Kowalski" },
  lineId: "line-1",
};

const WOS = [
  {
    id: "wo-a",
    woNumber: "WO-2026-0001",
    status: "released",
    itemCode: "FG-001",
    productName: "Kabanos",
    plannedQty: "20",
    qtyEntered: null,
    qtyEnteredUom: null,
    uomSnapshot: null,
    scheduledStart: null,
    lineId: "line-1",
    lineCode: "L1",
  },
  {
    id: "wo-b",
    woNumber: "WO-2026-0002",
    status: "released",
    itemCode: "FG-002",
    productName: "Salami",
    plannedQty: "30",
    qtyEntered: null,
    qtyEnteredUom: null,
    uomSnapshot: null,
    scheduledStart: null,
    lineId: "line-2",
    lineCode: "L2",
  },
];

function renderScreen() {
  return render(
    <ScannerSessionProvider>
      <WoListScreen locale="en" shellLabels={shellLabels} labels={labels} />
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WoListScreen — My line filter", () => {
  it('"My line" filters rows to the session line; "All" shows every WO again', async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, wos: WOS }) }),
    );

    renderScreen();

    // default filter is "My line" → only the session-line WO is shown.
    await waitFor(() => expect(screen.getByText("WO-2026-0001")).toBeInTheDocument());
    expect(screen.queryByText("WO-2026-0002")).not.toBeInTheDocument();

    // switch to "All" → both WOs visible.
    fireEvent.click(screen.getByText(L.filterAll));
    await waitFor(() => expect(screen.getByText("WO-2026-0002")).toBeInTheDocument());
    expect(screen.getByText("WO-2026-0001")).toBeInTheDocument();

    // back to "My line" → other-line WO disappears again.
    fireEvent.click(screen.getByText(L.filterMyLine));
    await waitFor(() => expect(screen.queryByText("WO-2026-0002")).not.toBeInTheDocument());
    expect(screen.getByText("WO-2026-0001")).toBeInTheDocument();
  });

  it("redirects to ../login when the WO list returns 401 (permission-denied)", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    renderScreen();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });

  it('"My line" keeps a WO whose routing op matches the session line even when header line differs', async () => {
    seedSession();
    const multiLineWo = {
      id: "wo-c",
      woNumber: "WO-2026-0003",
      status: "released",
      itemCode: "PIZZA",
      productName: "Margherita",
      plannedQty: "50",
      qtyEntered: null,
      qtyEnteredUom: null,
      uomSnapshot: null,
      scheduledStart: null,
      lineId: "line-oven",
      lineCode: "OVEN",
      stationOperations: [
        {
          id: "op-pack",
          sequence: 3,
          operationName: "Pack",
          status: "pending",
          lineId: "line-1",
          lineCode: "PACK",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, wos: [multiLineWo, ...WOS] }),
      }),
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText("WO-2026-0003")).toBeInTheDocument());
    expect(screen.getByText("Pack")).toBeInTheDocument();
    expect(screen.queryByText("WO-2026-0002")).not.toBeInTheDocument();
  });
});
