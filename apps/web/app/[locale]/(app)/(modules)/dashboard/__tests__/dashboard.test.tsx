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

const { getDashboardDataMock } = vi.hoisted(() => ({
  getDashboardDataMock: vi.fn(),
}));

vi.mock("../../_actions/dashboard-summary", () => ({
  getDashboardData: getDashboardDataMock,
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

async function renderDashboard(data: DashboardData) {
  getDashboardDataMock.mockResolvedValue(data);
  const ui = await DashboardRoutePage({ params: Promise.resolve({ locale: "en" }) });
  return render(ui);
}

afterEach(() => cleanup());
beforeEach(() => getDashboardDataMock.mockReset());

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
  it("renders 6 action buttons linking to module routes", async () => {
    await renderDashboard(dataOf());
    const bar = screen.getByTestId("dashboard-quick-actions");
    const links = within(bar).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(screen.getByTestId("dashboard-quick-action-createWo")).toHaveAttribute("href", "/en/planning");
    expect(screen.getByTestId("dashboard-quick-action-receive")).toHaveAttribute("href", "/en/warehouse");
    expect(screen.getByTestId("dashboard-quick-action-runMrp")).toHaveAttribute("href", "/en/scheduler");
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
          { id: "1", action: "create", resourceType: "work_order", resourceId: "WO-1", occurredAt: "2026-06-09T10:00:00Z" },
        ],
      }),
    );
    expect(screen.queryByTestId("dashboard-activity-empty")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dashboard-activity-item")).toHaveLength(1);
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
