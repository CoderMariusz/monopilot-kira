/**
 * @vitest-environment jsdom
 *
 * Shell gap #3 — org dashboard parity + states.
 *
 * Asserts the prototype "Main Dashboard" structure (sitemap source:
 * prototypes/design/Monopilot Design System/source/MONOPILOT-SITEMAP.html:123):
 *   - 5 KPI cards (Active WOs / Pending POs / Low Stock / Quality Holds / Today's
 *     Shipments) with honest "module not live yet" for tableless sources;
 *   - 6-button quick-actions bar linking to module routes;
 *   - recent-activity timeline (audit_events) + empty state;
 *   - system-alerts panel (derived signals) + empty state;
 *   - the unavailable (error) state when the live read fails;
 *   - i18n keys resolve through the REAL en.json.
 *
 * The withOrgContext DB read is mocked at the action boundary — no fixtures
 * replace production data; we assert wiring + labels + states.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardData } from "../../_actions/dashboard-summary";

const { getDashboardDataMock, getQuickActionPermissionsMock } = vi.hoisted(() => ({
  getDashboardDataMock: vi.fn(),
  getQuickActionPermissionsMock: vi.fn(),
}));

vi.mock("../../_actions/dashboard-summary", () => ({
  getDashboardData: getDashboardDataMock,
}));

vi.mock("../quick-action-permissions", () => ({
  getQuickActionPermissions: getQuickActionPermissionsMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const namespace = typeof req === "object" ? req.namespace ?? "" : req ?? "";
    const file = path.resolve(__dirname, "../../../../../../i18n/en.json");
    const messages = JSON.parse(readFileSync(file, "utf-8"));
    const ns = namespace.split(".").reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split(".").reduce((acc: unknown, part: string) => {
        return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === "string" ? value : key;
    };
  }),
}));

import DashboardRoutePage from "../page";

function dataOf(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ok: true,
    kpis: [
      { key: "activeWos", value: 12, color: "blue", notLive: false },
      { key: "pendingPos", value: null, color: "amber", notLive: true },
      { key: "lowStock", value: null, color: "red", notLive: true },
      { key: "qualityHolds", value: 2, color: "amber", notLive: false },
      { key: "shipmentsToday", value: 8, color: "green", notLive: false },
    ],
    activity: [],
    alerts: [],
    ...overrides,
  };
}

type QuickActionPerms = { canPlanningWrite: boolean; canRunMrp: boolean };

async function renderDashboard(
  data: DashboardData,
  perms: QuickActionPerms = { canPlanningWrite: true, canRunMrp: true },
) {
  getDashboardDataMock.mockResolvedValue(data);
  getQuickActionPermissionsMock.mockResolvedValue(perms);
  const ui = await DashboardRoutePage({ params: Promise.resolve({ locale: "en" }) });
  return render(ui);
}

afterEach(() => cleanup());
beforeEach(() => {
  getDashboardDataMock.mockReset();
  getQuickActionPermissionsMock.mockReset();
  // Default: full permissions so the prototype-parity assertions see all 6.
  getQuickActionPermissionsMock.mockResolvedValue({ canPlanningWrite: true, canRunMrp: true });
});

describe("Dashboard KPI cards (prototype parity)", () => {
  it("renders exactly the 5 prototype KPI cards in order", async () => {
    await renderDashboard(dataOf());
    const kpis = screen.getByTestId("dashboard-kpis");
    const cards = within(kpis).getAllByTestId(/^dashboard-kpi-/);
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "dashboard-kpi-activeWos",
      "dashboard-kpi-pendingPos",
      "dashboard-kpi-lowStock",
      "dashboard-kpi-qualityHolds",
      "dashboard-kpi-shipmentsToday",
    ]);
  });

  it("shows live counts for real tables and a not-live hint for tableless sources", async () => {
    await renderDashboard(dataOf());
    expect(within(screen.getByTestId("dashboard-kpi-activeWos")).getByText("12")).toBeInTheDocument();
    // Pending POs has no table → honest em dash + not-live hint, never a fake number.
    const pos = screen.getByTestId("dashboard-kpi-pendingPos");
    expect(within(pos).getByText("—")).toBeInTheDocument();
    expect(within(pos).getByText("Module not live yet")).toBeInTheDocument();
  });

  it("applies the prototype semantic colour band to KPI cards", async () => {
    await renderDashboard(dataOf());
    expect(screen.getByTestId("dashboard-kpi-shipmentsToday").className).toContain("green");
    expect(screen.getByTestId("dashboard-kpi-lowStock").className).toContain("red");
  });
});

describe("Dashboard quick-actions bar", () => {
  it("renders 6 action buttons linking to module routes when the role has every write permission", async () => {
    await renderDashboard(dataOf());
    const bar = screen.getByTestId("dashboard-quick-actions");
    const links = within(bar).getAllByRole("link");
    expect(links).toHaveLength(6);
    // F2 — WO/PO quick-actions deep-link to their specific create modal (?new=1),
    // not the generic /planning landing page.
    expect(screen.getByTestId("dashboard-quick-action-createWo")).toHaveAttribute(
      "href",
      "/en/planning/work-orders?new=1",
    );
    expect(screen.getByTestId("dashboard-quick-action-createPo")).toHaveAttribute(
      "href",
      "/en/planning/purchase-orders?new=1",
    );
    expect(screen.getByTestId("dashboard-quick-action-receive")).toHaveAttribute("href", "/en/warehouse");
    expect(screen.getByTestId("dashboard-quick-action-runMrp")).toHaveAttribute("href", "/en/planning/mrp");
  });
});

describe("Dashboard quick-actions RBAC filter", () => {
  it("hides Create WO / Create PO / Run MRP for a role without the write permissions", async () => {
    await renderDashboard(dataOf(), { canPlanningWrite: false, canRunMrp: false });
    const bar = screen.getByTestId("dashboard-quick-actions");
    const links = within(bar).getAllByRole("link");
    // Only the three read-only actions remain.
    expect(links).toHaveLength(3);
    expect(screen.queryByTestId("dashboard-quick-action-createWo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-quick-action-createPo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-quick-action-runMrp")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-quick-action-receive")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-quick-action-qualityCheck")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-quick-action-createShipment")).toBeInTheDocument();
  });

  it("shows Create WO / Create PO but not Run MRP for a planning-writer without MRP-run", async () => {
    await renderDashboard(dataOf(), { canPlanningWrite: true, canRunMrp: false });
    expect(screen.getByTestId("dashboard-quick-action-createWo")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-quick-action-createPo")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-quick-action-runMrp")).not.toBeInTheDocument();
  });
});

describe("Dashboard activity timeline", () => {
  it("renders the empty state when there is no audit activity", async () => {
    await renderDashboard(dataOf({ activity: [] }));
    expect(screen.getByTestId("dashboard-activity-empty")).toBeInTheDocument();
  });

  it("renders the latest activity items when present", async () => {
    await renderDashboard(
      dataOf({
        activity: [
          {
            id: "1",
            action: "create",
            resourceType: "work_order",
            resourceId: "WO-1",
            resourceRef: null,
            occurredAt: "2026-06-09T10:00:00Z",
          },
        ],
      }),
    );
    expect(screen.queryByTestId("dashboard-activity-empty")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dashboard-activity-item")).toHaveLength(1);
  });

  it("renders a friendly localized headline instead of the raw dotted event code", async () => {
    await renderDashboard(
      dataOf({
        activity: [
          {
            id: "1",
            action: "planning.purchase_order.status_changed",
            resourceType: "purchase_order",
            resourceId: "49b4abd3-6a8b-44a2-8347-3fcdc80de770",
            resourceRef: "PO-202606-0003",
            occurredAt: "2026-06-09T10:00:00Z",
          },
        ],
      }),
    );
    const headline = screen.getByTestId("dashboard-activity-headline");
    // Friendly label from en.json, never the raw dotted code.
    expect(headline.textContent).toContain("Purchase order status changed");
    expect(headline.textContent).toContain("purchase order");
    expect(headline.textContent).not.toContain("planning.purchase_order.status_changed");
    // Human reference is shown; the bare UUID is not.
    const item = screen.getByTestId("dashboard-activity-item");
    expect(item.textContent).toContain("PO-202606-0003");
    expect(item.textContent).not.toContain("49b4abd3-6a8b-44a2-8347-3fcdc80de770");
  });

  it("truncates a bare UUID when no human reference is carried, and humanizes unmapped codes", async () => {
    await renderDashboard(
      dataOf({
        activity: [
          {
            id: "2",
            action: "some.brand_new.thing_happened",
            resourceType: "mystery_table",
            resourceId: "d4dc1b32-36e0-4c92-97ff-bfaa628500a6",
            resourceRef: null,
            occurredAt: "2026-06-09T10:00:00Z",
          },
        ],
      }),
    );
    const headline = screen.getByTestId("dashboard-activity-headline");
    // Humanized fallback — never the raw dotted code.
    expect(headline.textContent).toContain("Thing happened");
    expect(headline.textContent).not.toContain("some.brand_new.thing_happened");
    const item = screen.getByTestId("dashboard-activity-item");
    expect(item.textContent).toContain("d4dc1b32…");
    expect(item.textContent).not.toContain("d4dc1b32-36e0-4c92-97ff-bfaa628500a6");
  });
});

describe("Dashboard alerts panel", () => {
  it("renders the all-clear empty state with no alerts", async () => {
    await renderDashboard(dataOf({ alerts: [] }));
    expect(screen.getByTestId("dashboard-alerts-empty")).toBeInTheDocument();
  });

  it("renders derived alerts when signals fire", async () => {
    await renderDashboard(
      dataOf({ alerts: [{ id: "open-holds", severity: "amber", messageKey: "openHolds", count: 2 }] }),
    );
    expect(screen.queryByTestId("dashboard-alerts-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-alert-open-holds").className).toContain("alert-amber");
  });
});

describe("Dashboard unavailable (error) state", () => {
  it("shows the unavailable badge when the live read fails", async () => {
    await renderDashboard(dataOf({ ok: false }));
    expect(screen.getByTestId("dashboard-unavailable-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-live-badge")).not.toBeInTheDocument();
  });
});
