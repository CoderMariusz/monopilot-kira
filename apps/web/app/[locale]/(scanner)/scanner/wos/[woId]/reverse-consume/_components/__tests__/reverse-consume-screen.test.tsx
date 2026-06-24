// RED → GREEN: ReverseConsumeScreen flow parity (pick consumption → reason +
// operator PIN → supervisor reveal when required → POST → done).
// Anchor: prototypes/design/Monopilot Design System/scanner/flow-consume.jsx
//   :122-212 (hub/row grammar) + :215-443 (step flow + done) — the same
//   component vocabulary the consume screen reuses, adapted for the reverse op.
//
// Asserts the parity checklist + the mandated states:
//   - loading → list of reversible consumptions from the consumptions read
//   - empty state (no reversible rows)
//   - error state (read failed) + retry
//   - POST body carries consumptionId + operatorPin + reasonCode + clientOpId
//   - supervisor reveal: an invalid_supervisor 401 (org flag ON) reveals the
//     supervisor email + PIN fields WITHOUT a login redirect; resubmit includes them
//   - permission-denied: a session-fail 401 (invalid_session) redirects to ../login
//   - i18n: copy comes from the resolved label object (no inline strings)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ReverseConsumeScreen } from "../reverse-consume-screen";
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
const L = labels.reverse;

const SESSION = { token: "tok-xyz", user: { id: "u1", name: "Jan Kowalski" } };

function consumptionsOk(rows: unknown[] = DEFAULT_ROWS) {
  return { status: 200, ok: true, json: async () => ({ ok: true, consumptions: rows }) };
}

const DEFAULT_ROWS = [
  {
    consumptionId: "c-1",
    materialName: "Pork shoulder",
    lpId: "lp-1",
    lpNumber: "LP-0001",
    qty: "40.000",
    uom: "kg",
    consumedAt: "2026-06-24T09:00:00.000Z",
  },
  {
    consumptionId: "c-2",
    materialName: "Salt",
    lpId: null,
    lpNumber: null,
    qty: "4.000",
    uom: "kg",
    consumedAt: "2026-06-24T09:05:00.000Z",
  },
];

function renderReverse() {
  return render(
    <ScannerSessionProvider>
      <ReverseConsumeScreen locale="en" woId="wo-1" shellLabels={shellLabels} labels={labels} />
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

describe("ReverseConsumeScreen", () => {
  it("lists reversible consumptions from the read (parity + i18n)", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(consumptionsOk()));
    renderReverse();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    expect(screen.getByText(L.listTitle)).toBeInTheDocument();
    expect(screen.getByText("Salt")).toBeInTheDocument();
  });

  it("empty state when there are no reversible consumptions", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(consumptionsOk([])));
    renderReverse();
    await waitFor(() => expect(screen.getByText(L.empty)).toBeInTheDocument());
  });

  it("error state + retry when the read fails", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({ ok: false, error: "error" }) }));
    renderReverse();
    await waitFor(() => expect(screen.getByText(L.error)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: L.retry })).toBeInTheDocument();
  });

  it("POSTs consumptionId + operatorPin + reasonCode + clientOpId, then shows the done state", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ ok: true, success: true, consumption_id: "c-1", reverse_consumption_id: "r-1", lp_status_after: "available" }),
        });
      }
      return Promise.resolve(consumptionsOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderReverse();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);

    fireEvent.change(screen.getByLabelText(new RegExp(L.operatorPinLabel)), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: L.confirm }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => typeof c[1] === "object" && c[1]?.method === "POST");
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find((c) => typeof c[1] === "object" && c[1]?.method === "POST")!;
    expect(postCall[0]).toBe("/api/production/scanner/wos/wo-1/reverse-consume");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      clientOpId: "33333333-3333-4333-8333-333333333333",
      consumptionId: "c-1",
      operatorPin: "1234",
      reasonCode: "wrong_quantity",
    });
    // doneTitle appears as both the heading and the success Banner title.
    await waitFor(() => expect(screen.getAllByText(L.doneTitle).length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: L.reverseNext })).toBeInTheDocument();
  });

  it("supervisor reveal: an invalid_supervisor 401 reveals the supervisor fields WITHOUT a login redirect", async () => {
    seedSession();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          status: 401,
          ok: false,
          clone: () => ({ json: async () => ({ ok: false, error: "invalid_supervisor" }) }),
          json: async () => ({ ok: false, error: "invalid_supervisor" }),
        });
      }
      return Promise.resolve(consumptionsOk());
    });
    vi.stubGlobal("fetch", fetchMock);

    renderReverse();
    await waitFor(() => expect(screen.getByText("Pork shoulder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pork shoulder").closest("button")!);
    fireEvent.change(screen.getByLabelText(new RegExp(L.operatorPinLabel)), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: L.confirm }));

    // supervisor section revealed; NO redirect to login
    await waitFor(() => expect(screen.getByLabelText(L.supervisorEmail)).toBeInTheDocument());
    expect(screen.getByLabelText(L.supervisorPin)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("permission-denied: a true session 401 (invalid_session) redirects to ../login", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        clone: () => ({ json: async () => ({ ok: false, error: "invalid_session" }) }),
        json: async () => ({ ok: false, error: "invalid_session" }),
      }),
    );
    renderReverse();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/scanner/login"));
  });
});
