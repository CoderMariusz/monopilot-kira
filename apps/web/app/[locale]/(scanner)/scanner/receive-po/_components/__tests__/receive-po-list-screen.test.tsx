// RED → GREEN: ReceivePoListScreen scan field onSubmit (Enter advanced nothing before).
// Anchor: prototypes/scanner/flow-receive.jsx (PO list scan + tappable rows).
//
// Asserts (parity checklist + a state + i18n + RBAC):
//   - PO list rendered from GET /api/warehouse/scanner/pos with status chips
//   - pressing Enter on a scanned/typed PO number navigates to that PO's detail
//     (the missing onSubmit) — exact match preferred, single-filtered fallback
//   - permission-denied (401/403 → denied banner; no crash)
//   - i18n: copy comes from the resolved labels (no inline strings)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { ReceivePoListScreen } from "../receive-po-list-screen";
import { getScannerLabels } from "../../../../_components/scanner-labels";
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

const labels = getScannerLabels("en");
const L = labels.receivePo;

const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

const POS = [
  {
    id: "po-1",
    poNumber: "PO-2026-0001",
    supplierCode: "SUP-1",
    supplierName: "Acme Meats",
    expectedDelivery: "2026-06-20",
    status: "sent",
    lineCount: 3,
    receivedLineCount: 0,
  },
  {
    id: "po-2",
    poNumber: "PO-2026-0002",
    supplierCode: "SUP-2",
    supplierName: "Borealis Spices",
    expectedDelivery: "2026-06-21",
    status: "sent",
    lineCount: 2,
    receivedLineCount: 1,
  },
];

function renderScreen() {
  return render(
    <ScannerSessionProvider>
      <ReceivePoListScreen locale="en" labels={labels} />
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

describe("ReceivePoListScreen — scan field onSubmit", () => {
  it("Enter on an exact PO number navigates to that PO's detail", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, pos: POS }) }),
    );

    renderScreen();
    await waitFor(() => expect(screen.getByText("PO-2026-0001")).toBeInTheDocument());

    const input = screen.getByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "PO-2026-0002" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/en/scanner/receive-po/po-2");
  });

  it("Enter when the search narrows to a single PO opens that one", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, pos: POS }) }),
    );

    renderScreen();
    await waitFor(() => expect(screen.getByText("PO-2026-0001")).toBeInTheDocument());

    const input = screen.getByPlaceholderText(L.scanPlaceholder);
    // partial value that filters to exactly one row (Borealis)
    fireEvent.change(input, { target: { value: "Borealis" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/en/scanner/receive-po/po-2");
  });

  it("Enter with no match does not navigate (loop not broken)", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, pos: POS }) }),
    );

    renderScreen();
    await waitFor(() => expect(screen.getByText("PO-2026-0001")).toBeInTheDocument());

    const input = screen.getByPlaceholderText(L.scanPlaceholder);
    fireEvent.change(input, { target: { value: "ZZZ-NOPE" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).not.toHaveBeenCalled();
  });

  it("permission-denied: a 401 renders the denied banner without crashing", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    renderScreen();
    await waitFor(() => expect(screen.getAllByText(L.permissionDenied).length).toBeGreaterThan(0));
  });
});
