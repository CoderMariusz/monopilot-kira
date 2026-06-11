/**
 * P-L5 — SCREEN-01 Planning Dashboard: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/planning/dashboard.jsx:4-262
 * (plan_dashboard). The async RSC reads Supabase via withOrgContext and is exercised
 * live (Playwright/manual); here we test the pure presentational pieces + the pure
 * day-grouping helper:
 *   - KPI strip (4 live tiles — PO/TO went live with migs 262/263, W9-M2),
 *   - alert panels (real WO + PO + TO alert lists, empty-states),
 *   - upcoming schedule (WO tab live + grouped-by-day rows, PO/TO tabs link to
 *     the live list screens),
 *   - header actions (Create WO/PO/TO links + disabled sequencing/D365 buttons),
 *   - groupScheduleByDay (7-day buckets, ascending, empty-state safe),
 *   - i18n key coverage across en/pl/ro/uk (incl. the W9-M2 mrp.* namespace).
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import enMessages from "../../../../../../i18n/en.json";
import plMessages from "../../../../../../i18n/pl.json";
import roMessages from "../../../../../../i18n/ro.json";
import ukMessages from "../../../../../../i18n/uk.json";

import { groupScheduleByDay, type PlanningScheduledWo } from "../_actions/dashboard-data";
import { PlanningKpiStrip, type PlanningKpiTile } from "../_components/kpi-strip";
import { PlanningAlertPanels, type PlanningAlertRow } from "../_components/alert-panels";
import { UpcomingSchedule, type ScheduleDayView } from "../_components/upcoming-schedule";
import { PlanningHeaderActions } from "../_components/header-actions";

const TILES: PlanningKpiTile[] = [
  { key: "openWos", label: "Open WOs", value: "7", sub: "Released, in progress or on hold", color: "blue", notLive: false },
  { key: "wosToday", label: "WOs scheduled today", value: "3", sub: "Starting in the current day", color: "green", notLive: false },
  { key: "openPos", label: "Open POs", value: "4", sub: "Draft, sent, confirmed or partially received", color: "amber", notLive: false },
  { key: "openTos", label: "Open TOs", value: "2", sub: "Draft or in transit", color: "amber", notLive: false },
];

const ALERT_LABELS = {
  woTitle: "WO alerts",
  poTitle: "PO alerts",
  toTitle: "TO alerts",
  empty: "No alerts",
  view: "View",
};

const HEADER_LABELS = {
  createWo: "Create WO",
  createPo: "Create PO",
  createTo: "Create TO",
  runSequencing: "Run sequencing",
  triggerD365: "Trigger D365 pull",
  notAvailable: "Not available yet",
};

const SCHEDULE_LABELS = {
  woTab: "WO schedule",
  poTab: "PO calendar",
  toTab: "TO timeline",
  openPos: "Open the Purchase orders list",
  openTos: "Open the Transfer orders list",
  empty: "No work orders scheduled in the next 7 days.",
  woCol: "WO",
  statusCol: "Status",
  timeCol: "Time",
};

describe("Planning KPI strip (parity: dashboard.jsx:32-50)", () => {
  it("renders 4 live tiles (PO/TO live since migs 262/263)", () => {
    render(<PlanningKpiStrip tiles={TILES} />);
    const strip = screen.getByTestId("planning-kpis");
    expect(within(strip).getAllByText(/Open WOs|WOs scheduled today|Open POs|Open TOs/)).toHaveLength(4);

    expect(screen.getByTestId("planning-kpi-openWos")).toHaveTextContent("7");
    expect(screen.getByTestId("planning-kpi-wosToday")).toHaveTextContent("3");

    const po = screen.getByTestId("planning-kpi-openPos");
    expect(po).toHaveTextContent("4");
    expect(po).not.toHaveAttribute("data-not-live");
    const to = screen.getByTestId("planning-kpi-openTos");
    expect(to).toHaveTextContent("2");
    expect(to).not.toHaveAttribute("data-not-live");
  });
});

describe("Planning alert panels (parity: dashboard.jsx:62-126)", () => {
  it("renders real WO, PO and TO alert rows", () => {
    const woAlerts: PlanningAlertRow[] = [
      { id: "a1", refNumber: "WO-2026-0001", reason: "Past scheduled start and not yet running", severity: "red", href: "/en/planning/work-orders?wo=a1" },
    ];
    const poAlerts: PlanningAlertRow[] = [
      { id: "p1", refNumber: "PO-2026-0007", reason: "Expected delivery date passed", severity: "red", href: "/en/planning/purchase-orders/p1" },
    ];
    const toAlerts: PlanningAlertRow[] = [
      { id: "t1", refNumber: "TO-2026-0002", reason: "Scheduled date passed", severity: "amber", href: "/en/planning/transfer-orders/t1" },
    ];
    render(<PlanningAlertPanels woAlerts={woAlerts} poAlerts={poAlerts} toAlerts={toAlerts} labels={ALERT_LABELS} />);

    expect(screen.getByTestId("planning-wo-alerts-row-a1")).toHaveTextContent("WO-2026-0001");
    expect(screen.getByTestId("planning-wo-alerts-count")).toHaveTextContent("1");
    expect(screen.getByTestId("planning-po-alerts-row-p1")).toHaveTextContent("PO-2026-0007");
    expect(screen.getByTestId("planning-to-alerts-row-t1")).toHaveTextContent("TO-2026-0002");
  });

  it("shows per-panel empty-states when there are no alerts", () => {
    render(<PlanningAlertPanels woAlerts={[]} poAlerts={[]} toAlerts={[]} labels={ALERT_LABELS} />);
    expect(screen.getByTestId("planning-wo-alerts-empty")).toHaveTextContent("No alerts");
    expect(screen.getByTestId("planning-po-alerts-empty")).toHaveTextContent("No alerts");
    expect(screen.getByTestId("planning-to-alerts-empty")).toHaveTextContent("No alerts");
  });
});

describe("Planning header actions (parity: dashboard.jsx:25-29)", () => {
  it("links Create WO/PO/TO and disables sequencing + D365 with a not-available title", () => {
    render(
      <PlanningHeaderActions
        createWoHref="/en/planning/work-orders?new=1"
        createPoHref="/en/planning/purchase-orders"
        createToHref="/en/planning/transfer-orders"
        labels={HEADER_LABELS}
      />,
    );

    expect(screen.getByTestId("planning-action-createWo")).toHaveAttribute(
      "href",
      "/en/planning/work-orders?new=1",
    );
    expect(screen.getByTestId("planning-action-createPo")).toHaveAttribute(
      "href",
      "/en/planning/purchase-orders",
    );
    expect(screen.getByTestId("planning-action-createTo")).toHaveAttribute(
      "href",
      "/en/planning/transfer-orders",
    );

    for (const key of ["runSequencing", "triggerD365"]) {
      const btn = screen.getByTestId(`planning-action-${key}`);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("title", "Not available yet");
    }
  });
});

describe("Planning upcoming schedule (parity: dashboard.jsx:138-231)", () => {
  const days: ScheduleDayView[] = [
    {
      dateKey: "2026-06-10",
      label: "Wed, Jun 10",
      rows: [
        { id: "w1", woNumber: "WO-2026-0108", statusLabel: "Released", time: "06:00", href: "/en/planning/work-orders?wo=w1" },
      ],
    },
    { dateKey: "2026-06-11", label: "Thu, Jun 11", rows: [] },
  ];

  it("renders grouped WO rows under day headings, with PO/TO tabs linking to the live lists", () => {
    render(
      <UpcomingSchedule
        days={days}
        scheduledCount={1}
        poListHref="/en/planning/purchase-orders"
        toListHref="/en/planning/transfer-orders"
        labels={SCHEDULE_LABELS}
      />,
    );

    expect(screen.getByTestId("planning-schedule-day-2026-06-10")).toHaveTextContent("WO-2026-0108");
    expect(screen.getByTestId("planning-schedule-row-w1")).toHaveTextContent("06:00");
    // Empty day is filtered out.
    expect(screen.queryByTestId("planning-schedule-day-2026-06-11")).toBeNull();

    expect(screen.getByTestId("planning-upcoming-tab-pos")).toHaveAttribute("href", "/en/planning/purchase-orders");
    expect(screen.getByTestId("planning-upcoming-tab-tos")).toHaveAttribute("href", "/en/planning/transfer-orders");
  });

  it("shows an empty-state when nothing is scheduled in the window", () => {
    render(
      <UpcomingSchedule
        days={[]}
        scheduledCount={0}
        poListHref="/en/planning/purchase-orders"
        toListHref="/en/planning/transfer-orders"
        labels={SCHEDULE_LABELS}
      />,
    );
    expect(screen.getByTestId("planning-upcoming-empty")).toHaveTextContent(
      "No work orders scheduled in the next 7 days.",
    );
  });
});

describe("groupScheduleByDay (7-day calendar grouping)", () => {
  it("buckets WOs into 7 ascending UTC days and keeps empty days", () => {
    const from = new Date("2026-06-10T09:00:00Z");
    const wos: PlanningScheduledWo[] = [
      { id: "b", woNumber: "WO-B", status: "RELEASED", scheduledStart: "2026-06-12T14:30:00Z" },
      { id: "a", woNumber: "WO-A", status: "DRAFT", scheduledStart: "2026-06-10T06:00:00Z" },
      { id: "c", woNumber: "WO-C", status: "RELEASED", scheduledStart: "2026-06-10T18:00:00Z" },
    ];
    const buckets = groupScheduleByDay(wos, from);

    expect(buckets).toHaveLength(7);
    expect(buckets[0].date).toBe("2026-06-10");
    expect(buckets[6].date).toBe("2026-06-16");

    // Day 0 has two WOs, sorted by start time.
    expect(buckets[0].wos.map((w) => w.id)).toEqual(["a", "c"]);
    // Day 2 has one.
    expect(buckets[2].wos.map((w) => w.id)).toEqual(["b"]);
    // Day 1 is empty but still present (calendar strip).
    expect(buckets[1].wos).toHaveLength(0);
  });

  it("drops WOs outside the 7-day window", () => {
    const from = new Date("2026-06-10T00:00:00Z");
    const wos: PlanningScheduledWo[] = [
      { id: "far", woNumber: "WO-FAR", status: "DRAFT", scheduledStart: "2026-06-30T00:00:00Z" },
    ];
    const buckets = groupScheduleByDay(wos, from);
    expect(buckets.flatMap((b) => b.wos)).toHaveLength(0);
  });
});

describe("Planning i18n coverage (en/pl real, ro/uk mirror en)", () => {
  const locales = { en: enMessages, pl: plMessages, ro: roMessages, uk: ukMessages } as Record<
    string,
    Record<string, unknown>
  >;

  it("defines the Planning namespace with all consumed keys in every locale", () => {
    for (const [loc, msgs] of Object.entries(locales)) {
      const p = msgs.Planning as Record<string, any> | undefined;
      expect(p, `Planning missing in ${loc}`).toBeTruthy();
      expect(p!.title).toBeTruthy();
      expect(p!.denied).toBeTruthy();
      expect(p!.error).toBeTruthy();
      expect(p!.kpiNotLive).toBeTruthy();
      expect(p!.kpis.openWos.label).toBeTruthy();
      expect(p!.kpis.openPos.hint).toBeTruthy();
      expect(p!.actions.createWo).toBeTruthy();
      expect(p!.actions.notAvailable).toBeTruthy();
      expect(p!.alerts.reasons.pastStartNotRunning).toBeTruthy();
      expect(p!.alerts.reasons.poOverdue, `alerts.reasons.poOverdue missing in ${loc}`).toBeTruthy();
      expect(p!.alerts.reasons.toOverdue, `alerts.reasons.toOverdue missing in ${loc}`).toBeTruthy();
      expect(p!.upcoming.woTab).toBeTruthy();
      expect(p!.upcoming.openPos, `upcoming.openPos missing in ${loc}`).toBeTruthy();
      expect(p!.upcoming.openTos, `upcoming.openTos missing in ${loc}`).toBeTruthy();
      expect(p!.woStatus.released).toBeTruthy();
      // W9-M2 MRP namespace.
      expect(p!.nav.mrp.title, `nav.mrp missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.title, `mrp.title missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.run, `mrp.run missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.kpis.itemsShort, `mrp.kpis.itemsShort missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.columns.net, `mrp.columns.net missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.severity.shortage, `mrp.severity.shortage missing in ${loc}`).toBeTruthy();
      expect(p!.mrp.actionTypes.buy, `mrp.actionTypes.buy missing in ${loc}`).toBeTruthy();
    }
  });
});
