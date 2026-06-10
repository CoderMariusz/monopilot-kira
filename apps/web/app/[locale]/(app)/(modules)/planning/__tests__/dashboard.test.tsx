/**
 * P-L5 — SCREEN-01 Planning Dashboard: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/planning/dashboard.jsx:4-262
 * (plan_dashboard). The async RSC reads Supabase via withOrgContext and is exercised
 * live (Playwright/manual); here we test the pure presentational pieces + the pure
 * day-grouping helper:
 *   - KPI strip (4 tiles, 2 live + 2 honest "not live yet"),
 *   - alert panels (real WO alerts + PO/TO not-live placeholders, empty-state),
 *   - upcoming schedule (WO tab live + grouped-by-day rows, PO/TO tabs disabled),
 *   - header actions (Create WO link + 4 disabled buttons with not-available title),
 *   - groupScheduleByDay (7-day buckets, ascending, empty-state safe),
 *   - i18n key coverage across en/pl/ro/uk.
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
  { key: "openPos", label: "Open POs", value: "—", sub: "Module not live yet", color: "amber", notLive: true },
  { key: "openTos", label: "Open TOs", value: "—", sub: "Module not live yet", color: "amber", notLive: true },
];

const ALERT_LABELS = {
  woTitle: "WO alerts",
  poTitle: "PO alerts",
  toTitle: "TO alerts",
  empty: "No work-order alerts",
  notLive: "Module not live yet",
  view: "View WO",
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
  notLive: "Module not live yet",
  empty: "No work orders scheduled in the next 7 days.",
  woCol: "WO",
  statusCol: "Status",
  timeCol: "Time",
};

describe("Planning KPI strip (parity: dashboard.jsx:32-50)", () => {
  it("renders 4 tiles with 2 live values and 2 honest not-live tiles", () => {
    render(<PlanningKpiStrip tiles={TILES} />);
    const strip = screen.getByTestId("planning-kpis");
    expect(within(strip).getAllByText(/Open WOs|WOs scheduled today|Open POs|Open TOs/)).toHaveLength(4);

    expect(screen.getByTestId("planning-kpi-openWos")).toHaveTextContent("7");
    expect(screen.getByTestId("planning-kpi-wosToday")).toHaveTextContent("3");

    const po = screen.getByTestId("planning-kpi-openPos");
    expect(po).toHaveTextContent("—");
    expect(po).toHaveTextContent("Module not live yet");
    expect(po).toHaveAttribute("data-not-live", "true");
    expect(screen.getByTestId("planning-kpi-openTos")).toHaveAttribute("data-not-live", "true");
  });
});

describe("Planning alert panels (parity: dashboard.jsx:62-126)", () => {
  it("renders real WO alerts and honest PO/TO not-live placeholders", () => {
    const alerts: PlanningAlertRow[] = [
      { id: "a1", woNumber: "WO-2026-0001", reason: "Past scheduled start and not yet running", severity: "red", href: "/en/planning/work-orders?wo=a1" },
    ];
    render(<PlanningAlertPanels woAlerts={alerts} labels={ALERT_LABELS} />);

    expect(screen.getByTestId("planning-wo-alert-a1")).toHaveTextContent("WO-2026-0001");
    expect(screen.getByTestId("planning-wo-alerts-count")).toHaveTextContent("1");
    // PO / TO panels are honest "not live" placeholders.
    expect(screen.getByTestId("planning-po-alerts-not-live")).toHaveTextContent("Module not live yet");
    expect(screen.getByTestId("planning-to-alerts-not-live")).toHaveTextContent("Module not live yet");
  });

  it("shows an empty-state when there are no WO alerts", () => {
    render(<PlanningAlertPanels woAlerts={[]} labels={ALERT_LABELS} />);
    expect(screen.getByTestId("planning-wo-alerts-empty")).toHaveTextContent("No work-order alerts");
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

  it("renders grouped WO rows under day headings, with PO/TO tabs disabled", () => {
    render(<UpcomingSchedule days={days} scheduledCount={1} labels={SCHEDULE_LABELS} />);

    expect(screen.getByTestId("planning-schedule-day-2026-06-10")).toHaveTextContent("WO-2026-0108");
    expect(screen.getByTestId("planning-schedule-row-w1")).toHaveTextContent("06:00");
    // Empty day is filtered out.
    expect(screen.queryByTestId("planning-schedule-day-2026-06-11")).toBeNull();

    expect(screen.getByTestId("planning-upcoming-tab-pos")).toBeDisabled();
    expect(screen.getByTestId("planning-upcoming-tab-tos")).toBeDisabled();
  });

  it("shows an empty-state when nothing is scheduled in the window", () => {
    render(<UpcomingSchedule days={[]} scheduledCount={0} labels={SCHEDULE_LABELS} />);
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
      expect(p!.upcoming.woTab).toBeTruthy();
      expect(p!.woStatus.released).toBeTruthy();
    }
  });
});
