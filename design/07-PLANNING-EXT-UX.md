# 07-PLANNING-EXT — UX Specification (for prototype generation)

**Version:** 1.1
**Date:** 2026-04-21
**Updated:** 2026-04-21 — 10 open questions resolved; Gantt drag-drop descoped to read-only view
**Source PRD:** 07-PLANNING-EXT-PRD.md v3.1 (2026-04-21)
**Target:** Claude Design — interactive HTML prototypes
**Status:** Complete — self-contained, no designer questions required

---

## 0. Module Overview

Module **07-PLANNING-EXT** is the advanced scheduling layer of MonoPilot MES. It sits above the **04-PLANNING-BASIC** WO lifecycle and provides the optimization, capacity-awareness, and forecasting intelligence that 04-PLANNING-BASIC deliberately defers. Where 04-PLANNING-BASIC handles PO/TO/WO generation, intermediate cascade DAG, and a basic allergen group-by-family heuristic, 07-PLANNING-EXT provides:

- **Finite-capacity scheduling engine** — assigns WOs to production lines, shifts, and time windows respecting real resource capacity constraints, not merely queuing them.
- **Full allergen-aware sequencing optimizer** — the `allergen_sequencing_optimizer_v2` DSL rule minimizes total changeover cost across all production lines simultaneously using a `changeover_matrix` lookup, replacing the simpler v1 heuristic.
- **Scheduler GanttView** — read-only Gantt visualization showing WO blocks, changeover blocks, and capacity utilization. Rescheduling is performed via the Override Modal and the global Re-run Scheduler action; there is no drag-drop reassignment.
- **Changeover Matrix Editor** — the N×N matrix (allergen_from × allergen_to) that feeds the optimizer, with per-line overrides and version history.
- **Manual Forecast Entry** (P1) and **ML Demand Forecasting** (P2 Prophet microservice) — a demand signal that feeds the solver and drives forecast-triggered PO generation.
- **Scheduler Run History** — audit trail of all solver invocations with input parameters, output assignments, override logs, and KPI snapshots.
- **What-If Simulation** (P2) — scenario planning for capacity shocks without committing to the production database.
- **Disposition Bridge** (P2) — re-introduces `direct_continue` and `planner_decides` disposition modes for perishable intermediates, deferred from 04-PLANNING-BASIC §8.5.

**What differs from 04-PLANNING-BASIC:**

| Capability | 04-PLANNING-BASIC | 07-PLANNING-EXT |
|---|---|---|
| Allergen sequencing | Basic group-by-family heuristic v1 | Full multi-line optimizer v2 with changeover_matrix |
| Capacity allocation | Greedy slot stub, warns on overflow | Finite-capacity engine: respects kg/h, shifts, precedence |
| Changeover matrix | Not present | N×N editor with per-line overrides and version history |
| Demand forecasting | Manual only, no signal | Manual CSV P1; Prophet ML microservice P2 |
| Disposition modes | `to_stock` only | Adds `direct_continue` + `planner_decides` in P2 |
| Scenario planning | Not present | What-if simulation (P2) |
| Scheduler audit | Basic WO state history | Full scheduler_runs + override log + KPI snapshot per run |

**Key domain concepts for the designer:**

- **scheduler_runs** — a single invocation of the solver. Has lifecycle `queued → running → completed | failed`. Immutable once completed (audit trail).
- **scheduler_assignments** — one assignment record per WO per run: (line, shift, planned_start_time, planned_end_time, optimizer_score). Status: `draft → approved | rejected | overridden`. Approved assignments update the WO.
- **changeover_matrix** — an N×N lookup: allergen_from × allergen_to → (changeover_minutes, cleaning_required, atp_required, segregation_required). Segregation_required = true blocks the assignment with infinite cost.
- **allergen_sequencing_optimizer_v2** — a DSL rule in 02-SETTINGS §7 registry (dev-authored, admin read-only). The rule is an objective function component: for each consecutive WO pair on a line, it looks up changeover_matrix and returns changeover_minutes × penalty_weight. The solver minimizes the sum.
- **finite_capacity_solver_v1** — DSL rule wrapping the Python FastAPI microservice. Two-phase: (1) greedy sort by deadline/allergen_complexity/customer_priority/line_affinity, then assign to earliest feasible slot; (2) local search refinement: random-pair swap and between-line move, accept if cost decreases ≥2%.
- **demand_forecasts** — weekly demand signal per (product_id, week_iso). Source = `manual` (P1 CSV) or `prophet` (P2 ML). Used as input to solver when `include_forecast=true`.
- **Human-in-loop** — all assignments in P1 require explicit Planner approval before updating `work_orders`. Auto-approval is a P2 policy option.

**Build sequence (4 sub-modules):**
- **07-a Finite-Capacity Engine** (P1) — solver service, GanttView, run lifecycle, approve/reject/override
- **07-b Allergen Optimizer** (P1) — changeover_matrix, optimizer v2 DSL, ChangeoverMatrixEditor
- **07-c Forecast Bridge** (P2) — demand_forecasts, Prophet microservice, ForecastUpload, forecast-driven PO trigger
- **07-d Disposition Bridge** (P2) — direct_continue + planner_decides modes, reservation handoff

**Primary persona:** Planner Advanced (Monika Nowak at Forza — runs scheduler daily, approves/overrides recommendations, maintains changeover matrix, uploads forecasts P2). Secondary personas: Scheduling Officer (read + limited override), Production Manager (KPI monitoring, read-only), NPD Manager (read own forecast P2).

**Phase markers used in this document:**
- `[P1]` — MVP scope, build now
- `[P2]` — advanced scope, placeholder screens included
- `[FORZA-CONFIG]` — Forza-specific seed data; pattern is universal

---

## 1. Design System (Inherited)

All screens in this module inherit the MonoPilot design system exactly as defined in 04-PLANNING-BASIC-UX.md §1. Designers must apply the following tokens verbatim without deviation.

### 1.1 Typography

- Font family: **Inter**, fallback `system-ui, -apple-system, sans-serif`
- Base size: 14px, line-height 1.4
- Page titles: 20px, font-weight 700
- Card titles / section headings: 14px, font-weight 600
- Table headers: 12px, font-weight 600, color `#64748b` (muted), all-caps not required
- Table body: 13px, color `#1e293b`
- Secondary / helper text: 12px, color `#64748b`
- Micro-labels (form labels): 12px, font-weight 500, color `#374151`
- Breadcrumb: 12px, color `#64748b`; links color `#1976D2`
- Monospace: `font-family: monospace` for codes, run IDs, ISO weeks, route paths

### 1.2 Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active states, links, focus rings |
| `--green` | `#22c55e` | Success, on-time, available, target met |
| `--amber` | `#f59e0b` | Warnings, partial, borderline, medium changeover |
| `--red` | `#ef4444` | Errors, critical, overdue, high changeover, shortage |
| `--info` | `#3b82f6` | Informational alerts, info badges |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Left navigation background |
| `--card` | `#ffffff` | Card / panel background |
| `--text` | `#1e293b` | Primary text |
| `--muted` | `#64748b` | Secondary text, table headers, placeholders |
| `--border` | `#e2e8f0` | Card borders, table dividers, input borders |
| `--radius` | `6px` | Standard border radius for cards, inputs, badges |

### 1.3 Badge Styles

| Variant | Background | Text | Use Case |
|---|---|---|---|
| `badge-green` | `#dcfce7` | `#166534` | Active, completed, on-time, approved, target met |
| `badge-amber` | `#fef3c7` | `#92400e` | Partial, pending, warning, borderline, medium risk |
| `badge-red` | `#fee2e2` | `#991b1b` | Error, overdue, cancelled, critical, high risk, segregated |
| `badge-blue` | `#dbeafe` | `#1e40af` | Draft, queued, running, in-progress, info |
| `badge-gray` | `#f1f5f9` | `#475569` | Inactive, closed, neutral, P2 placeholder |

Badges: `padding: 2px 8px`, `border-radius: 10px`, `font-size: 11px`, `font-weight: 500`.

### 1.4 KPI Cards

White background, `1px solid #e2e8f0` border, `6px` radius, `12px 14px` padding, 3px bottom accent border in the relevant color token. KPI value: 26px, font-weight 700. KPI label: 11px, muted, font-weight 500. KPI sub-label / change delta: 11px, muted.

### 1.5 Tables

`width: 100%`, `border-collapse: collapse`, `font-size: 13px`. Headers: `padding: 8px 10px`, `background: #f8fafc`, `border-bottom: 2px solid #e2e8f0`. Cells: `padding: 7px 10px`, `border-bottom: 1px solid #e2e8f0`. Row hover: `background: #f8fafc`.

### 1.6 Layout

- Fixed left sidebar: **220px** wide, `background: #1e293b`, sticky full-height.
- Main content area: `margin-left: 220px`, `padding: 40px 20px 20px`.
- Active sidebar item: `background: #1e3a5f`, `color: #ffffff`, `border-left: 3px solid #1976D2`.
- Sidebar item hover: `background: #334155`, `color: #f1f5f9`.
- Sub-navigation items: 12px, `color: #94a3b8`, indent 28px left.

### 1.7 Forms

- Input: `width: 100%`, `padding: 7px 10px`, `border: 1px solid #e2e8f0`, `border-radius: 4px`, `font-size: 13px`.
- Focus: `border-color: #1976D2`, `box-shadow: 0 0 0 2px rgba(25,118,210,0.15)`.
- Required field marker: red asterisk `*` after label.
- Form grid: `display: grid`, 2 columns, `gap: 10px`.

### 1.8 Buttons

- Primary: `background: #1976D2`, `color: #fff`, hover `#1565C0`.
- Secondary: `background: #fff`, `border: 1px solid #e2e8f0`, hover `background: #f1f5f9`.
- Danger: `background: #ef4444`, `color: #fff`.
- All buttons: `padding: 6px 14px`, `border-radius: 4px`, `font-size: 12px`, `font-weight: 500`.
- Minimum touch target: 48×48dp.

### 1.9 Modals

Overlay: `background: rgba(0,0,0,0.5)`, centered flex. Modal box: `background: #fff`, `border-radius: 8px`, `width: 560px` (default), `max-height: 80vh`, `overflow-y: auto`, `padding: 20px`. Wider modals (GanttView assignment detail, override form): up to `760px`. Extra-wide modals (changeover matrix diff): up to `960px`. Modal title: 16px, font-weight 700.

### 1.10 Alerts / Inline Banners

`padding: 10px 14px`, `border-radius: 6px`, `border-left: 4px solid [color]`, `font-size: 12px`. Variants: `.alert-red` (`#fef2f2`), `.alert-amber` (`#fffbeb`), `.alert-blue` (`#eff6ff`), `.alert-green` (`#f0fdf4`).

### 1.11 Status Badge Mapping (Scheduler Entities)

| State | Badge class | Label |
|---|---|---|
| `queued` | `.badge-blue` | Queued |
| `running` | `.badge-blue` | Running |
| `completed` | `.badge-green` | Completed |
| `failed` | `.badge-red` | Failed |
| `cancelled` | `.badge-gray` | Cancelled |
| `draft` (assignment) | `.badge-blue` | Draft |
| `approved` (assignment) | `.badge-green` | Approved |
| `rejected` (assignment) | `.badge-gray` | Rejected |
| `overridden` (assignment) | `.badge-amber` | Overridden |
| `manual` (forecast source) | `.badge-blue` | Manual |
| `prophet` (forecast source) | `.badge-green` | ML Prophet |
| `overridden` (forecast source) | `.badge-amber` | Overridden |
| `stale` (forecast) | `.badge-amber` | Stale |
| `preview` (dry_run) | `.badge-gray` | Preview |

### 1.12 Allergen Changeover Heatmap Colors

Used in the changeover matrix editor and GanttView changeover blocks:

| Changeover minutes | Color | CSS custom property |
|---|---|---|
| 0 min (`NONE` self) | `#f0fdf4` (very light green) | `--co-none` |
| 1–15 min (low risk) | `#22c55e` | `--co-low` |
| 16–45 min (medium risk) | `#f59e0b` | `--co-medium` |
| >45 min (high risk) | `#ef4444` | `--co-high` |
| segregated (blocked) | `#7c3aed` (purple, distinct) | `--co-blocked` |

### 1.13 Gantt Chart Component Vocabulary

- **WO block**: `border-radius: 4px`, `height: 32px`, color = allergen group color (from item allergen_profile), label = `WO_CODE · FA_CODE` in 11px white.
- **Changeover block**: `background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.1) 4px, rgba(0,0,0,0.1) 8px)` (diagonal stripe), bordered in `--amber`.
- **Weekend column**: `background: #f1f5f9` with `opacity: 0.6` (hatched with 1px diagonal lines).
- **Shift boundary**: `border-left: 1px dashed #94a3b8`.
- **Current time marker**: `border-left: 2px solid #ef4444` with triangle top indicator.
- **Selected WO block**: `box-shadow: 0 0 0 3px #1976D2`.

### 1.14 Auto-refresh Indicator

All live scheduler screens show a top-right control: toggle labelled "Auto-refresh 60s" and a manual "Refresh" button. When refreshing, a 2px `--blue` progress bar slides across the top of the main content area.

---

## 2. Information Architecture

### 2.1 Sidebar Entry

The Advanced Scheduler module appears in the sidebar under the **OPERATIONS** group. It is a separate top-level entry distinct from **Planning** (04-PLANNING-BASIC). The entry is:

- Icon: Calendar grid SVG (or equivalent scheduler icon)
- Label: **Scheduler**
- When active: `border-left-color: #1976D2`, background `#1e3a5f`
- Clicking expands inline sub-nav

Sub-items (sidebar sub-items, 12px `#94a3b8`, indent 28px):

1. Dashboard (GanttView)
2. Run History
3. Forecasts
4. Simulate _(P2, grayed if flag off)_
5. Settings / Changeover Matrix

### 2.2 Route Map

| Route | Screen ID | Screen Name | Phase |
|---|---|---|---|
| `/scheduler` | SCR-07-01 | Scheduler Dashboard (GanttView) | P1 |
| `/scheduler/runs` | SCR-07-04 | Scheduler Run History | P1 |
| `/scheduler/runs/:run_id` | SCR-07-04-DETAIL | Run Detail | P1 |
| `/scheduler/forecasts` | SCR-07-03 | Forecast Upload / View | P1 manual, P2 Prophet |
| `/scheduler/simulate` | SCR-07-05 | What-If Simulation | P2 |
| `/settings/planning/changeover-matrix` | SCR-07-02 | Changeover Matrix Editor | P1 |

The Changeover Matrix Editor lives under `/settings/` (linked from 02-SETTINGS reference tables, §8) but is navigable directly from the Scheduler sidebar under "Settings / Changeover Matrix."

### 2.3 Permissions Matrix

| Capability | Planner Advanced | Scheduling Officer | Prod Manager | NPD Manager | Operator |
|---|---|---|---|---|---|
| View GanttView | Full | Read | Read | — | — |
| Run scheduler (POST /run) | Yes | No | No | — | — |
| Approve assignment | Yes | Yes (limited) | No | — | — |
| Reject assignment | Yes | Yes | No | — | — |
| Override assignment | Yes | Yes | No | — | — |
| View run history | Yes | Yes | Yes | — | — |
| Re-run (same params) | Yes | No | No | — | — |
| Edit changeover matrix | Yes | No | No | — | — |
| View changeover matrix | Yes | Yes | Yes | — | — |
| Upload forecast (manual) | Yes | No | No | — | — |
| View forecasts | Yes | Yes | Yes | Yes (own NPD) | — |
| Override forecast cell | Yes | No | No | — | — |
| Run what-if simulation (P2) | Yes | No | No | — | — |
| Approve disposition (P2) | Yes | No | No | — | — |

Note: Scheduling Officer can approve/reject individual assignments but cannot run the solver or edit the changeover matrix.

---

## 3. Screen SCR-07-01 — Scheduler Dashboard (GanttView)

**Screen ID:** SCR-07-01
**Route:** `/scheduler`
**Purpose:** Primary daily workspace for the Planner Advanced. Shows the current schedule as a read-only horizontal Gantt visualization, allows running the optimizer, reviewing and approving/rejecting/overriding solver recommendations, and monitoring real-time schedule KPIs. Rescheduling is performed via `[Re-run Scheduler]` (global) or `MODAL-07-03 Assignment Override` (per-WO). This is the most-used screen in the module.

### 3.1 Layout

The page is divided into four stacked zones.

**Zone A — Top Control Bar (sticky, full width):**

```
+----------------------------------------------------------------------+
| Breadcrumb: Scheduler > Dashboard                                     |
| [Horizon: 7d v] [Lines: All v] [Shifts: All v]  [Run Scheduler] [...]|
| Last run: 2026-04-21 06:12 by Monika · Completed · 42s              |
| Auto-refresh: ON (60s)  [Refresh]                                    |
+----------------------------------------------------------------------+
```

Controls (left to right):
- **Horizon selector**: dropdown, options `7 days` (default) / `14 days`. 14-day requires P2 feature flag. Selection updates X-axis range on Gantt.
- **Lines filter**: multi-select dropdown. Options: `All Lines`, `LINE-01 Fresh`, `LINE-02 Cooked`, `LINE-03 Breaded`, `LINE-04 Marinated`, `LINE-05 Packaging`. When specific lines are selected, other lines collapse from the Gantt Y-axis.
- **Shifts filter**: multi-select dropdown. `All Shifts`, `Shift A (06:00–14:00)`, `Shift B (14:00–22:00)`, `Shift C (22:00–06:00, P2)`. When specific shifts selected, other shift columns visually dim.
- **[Run Scheduler]** (`btn-primary`): Opens Run Scheduler Modal (MODAL-07-01). Visible to Planner Advanced only; grayed with tooltip `You do not have permission to run the scheduler` for other roles.
- **[...] overflow**: Export CSV assignments, Export PDF (P2), View in full-screen.
- **Last run info** (muted text, 11px): `Last run: {date} {time} by {user} · {status badge} · {solve_duration_ms}ms`. Click navigates to `/scheduler/runs/:run_id`.

**Zone B — KPI Strip (below control bar, full width):**

A horizontal row of 5 `.kpi` cards in `.grid-5` layout:

| # | KPI Card | Value | Accent | Sub-label |
|---|---|---|---|---|
| 1 | Scheduled WOs | Count of assignments `status=approved` | Blue | `{n} pending review` in muted |
| 2 | Total Changeover | Sum of changeover minutes from the **approved** schedule (not draft solver run) | Amber if >target, green if ≤ | `vs. {baseline} min baseline` |
| 3 | Avg Utilization | `sum(planned_duration) / sum(available_minutes)` across selected lines | Green ≥90%, amber 80–89%, red <80% | `Target: ≥90%` |
| 4 | Overdue WOs | Count of WOs `planned_start_time < now()` and status `draft` | Red if >0, green if 0 | `Unscheduled past deadline` |
| 5 | Unscheduled WOs | Count of WOs `planned_start_time IS NULL` and `status=DRAFT` | Amber if >0 | `Awaiting scheduler run` |

**Zone C — Gantt Chart (main area, scrollable):**

```
+------------------------------------------------------------------+
|       | Mon 21 Apr    | Tue 22 Apr    | Wed 23 Apr   | ...       |
|       |  A  |  B  |   |  A  |  B  |   |  A  |  B  |  | ...       |
+-------+-----------+---+-----------+---+-----------+--+-----------+
|LINE-01| [WO-0042 FA5102] [CO 30m] [WO-0055 FA5201]  |           |
+-------+---------------------------------------------------+-------+
|LINE-02| [WO-0043 FA5110] [WO-0044 FA5111] [CO 15m] [...]|       |
+-------+---------------------------------------------------+-------+
|LINE-03| [CO 45m] [WO-0051 FA5301]          [WO-0052 ]   |       |
+-------+---------------------------------------------------+-------+
|LINE-04| [WO-0060 FA5401]     [MAINTENANCE] [WO-0061]    |       |
+-------+---------------------------------------------------+-------+
|LINE-05| [WO-0070 FA5502]  [WO-0071 FA5503]              |       |
+-------+---------------------------------------------------+-------+
```

The Gantt chart is an HTML/SVG component. Specifications:

- **Y-axis (rows)**: One row per production line. Row height 48px. Row label: line code + line name (e.g., "LINE-01 · Fresh"). Sticky left column 140px.
- **X-axis (columns)**: Default view = daily columns (one column per day). Each day column is subdivided by shift boundary markers. Hour-level zoom: toggle via button in top-right of Gantt panel; hours shown as sub-columns of 60px each. Scroll horizontal when content overflows.
- **Day header**: `DDD DD MMM` format, e.g., `Mon 21 Apr`. Weekday header background `#f8fafc`. Weekend header background `#f1f5f9` with subtle diagonal hatching.
- **WO Blocks**: `height: 32px`, `border-radius: 4px`, `margin: 8px 2px`, width proportional to planned_duration within column. Color = allergen group color (see allergen group color legend, Section 3.2). Label inside block: `{WO_CODE} · {FA_CODE}` in 11px white, truncated with ellipsis if insufficient width.
  - Hover: shows tooltip (see Section 3.3 Tooltip).
  - Click: opens Assignment Detail Side Panel (see Section 3.4).
  - Cursor: `pointer` (no grab cursor; blocks are non-draggable). Block styling: `cursor: pointer`.
  - Assignment status overlay: `draft` = 70% opacity; `approved` = 100% opacity; `rejected` = strikethrough diagonal line; `overridden` = amber dashed border.
- **Changeover Blocks**: Width proportional to changeover_minutes from matrix. Background = diagonal stripe pattern (see §1.13). Label (if sufficient width): `CO · {N}min · {allergen_from}→{allergen_to}`. Hover: tooltip showing cleaning_required, atp_required boolean values.
- **Maintenance Blocks**: Background `#f1f5f9` with pattern, label `Maintenance`. Non-editable.
- **Shift boundary markers**: Vertical dashed line at shift transitions (06:00, 14:00, 22:00). Small label `A / B / C` above the Gantt row headers.
- **Current time marker**: Red vertical line at current timestamp (only visible within current day column). Triangle indicator at the top.
- **Empty row**: If a line has no assignments for the horizon, the row shows a muted centered message `No WOs scheduled — run scheduler to assign` within the row.

**Zone D — Pending Review Panel (collapsible, right side or below Gantt):**

When there are draft assignments (status=`draft`) from the most recent completed run that have not yet been approved/rejected, a collapsible panel appears. The panel shows a compact list of pending assignments sorted by `optimizer_rank`:

| # | WO Code | Product | Line | Shift | Planned Start | Score | Actions |
|---|---|---|---|---|---|---|---|
| 1 | WO-0042 | FA5102 Fresh Chicken | LINE-01 | Shift A | Mon 06:00 | 94.2 | [Approve] [Reject] [...] |
| 2 | WO-0055 | FA5201 Cooked Breast | LINE-02 | Shift A | Mon 08:30 | 88.1 | [Approve] [Reject] [...] |
| ... | | | | | | | |

Panel header: `Pending Review — {N} assignments across {R} run(s) · [Approve All] [Reject All]`. Runs are visually grouped by `run_id_short` with a sub-header row per run group (e.g., `Run abc12345 — 2026-04-21 06:12 · 18 assignments`).

`[Approve All]` is a `.btn-primary` button that bulk-approves all draft assignments from **all completed runs** (not just the most recent), after a confirmation modal that lists each run group and assignment count. `[Reject All]` is `.btn-danger` with the same run-group scope. Both are gated to Planner Advanced only.

The `[...]` overflow per row: Override, View WO Detail (links to 04-PLANNING-BASIC `/planning/wos/:id`).

### 3.2 Allergen Group Color Legend

A collapsible legend below the Gantt chart. Shows a color swatch + allergen group name for each active allergen group present in the current Gantt view. Colors are CSS custom properties assigned at runtime per allergen group (system assigns from a fixed palette of 12 distinct colors). The legend auto-hides if all items visible; auto-expands when more than 5 allergen groups are in view.

Example palette (informational — designer implements as a 12-color qualitative palette):
- Gluten (cereals) → blue-family
- Milk → light blue
- Eggs → yellow
- Peanuts → orange
- Tree nuts → brown
- Soy → green
- Fish → teal
- Shellfish → aqua
- Celery → lime
- Mustard → amber
- Sesame → sand
- NONE (no allergen) → neutral gray

### 3.3 WO Block Tooltip

On hover over any WO block, a tooltip appears (positioned above or below the block, flip if near edge):

```
+---------------------------------------------+
| WO-2026-0042                  [Draft]        |
| FA5102 Fresh Chicken Breast 500g             |
| Line: LINE-01 Fresh · Shift A               |
| Start: Mon 21 Apr 06:00 → 11:30 (5.5h)     |
| Qty: 1,200 kg · Allergen: Gluten, Milk       |
| Optimizer score: 94.2 · Rank #1 of 23       |
| Changeover before: 30 min (Milk → Gluten)   |
| [Click to view details]                      |
+---------------------------------------------+
```

### 3.4 Assignment Detail Side Panel

On click of any WO block, a side panel slides in from the right (width: 360px, full height, overlay on Gantt but does not push content). The panel is scrollable. Close via X button or Escape key.

**Panel sections:**

**Header**: `{WO_CODE}` in 16px bold + status badge. Sub-line: `{product_name} · {fa_code}`.

**Assignment section:**
- Line: `LINE-01 Fresh`
- Shift: `Shift A · 06:00–14:00`
- Planned Start: `Mon 21 Apr 2026, 06:00`
- Planned End: `Mon 21 Apr 2026, 11:30`
- Duration: `5h 30min`
- Optimizer Score: `94.2 / 100`
- Rank: `#1 of 23 in this run`

**Allergen / Changeover section:**
- Allergen group: `Gluten + Milk`
- Changeover before: `30 min (Milk → Gluten from previous WO-0039)`
- Cleaning required: `Yes`
- ATP required: `No`
- Changeover after: `15 min (Gluten → NONE for next WO-0055)`

**Materials section (from 04-PLANNING-BASIC):**
- Brief table of RM materials from `wo_material_reservations` (lines: material_code, qty_kg, availability indicator — green/amber/red dots). Link: `View full WO in Planning →` navigates to `/planning/wos/:id` in new tab.

**DAG dependencies section** (if WO has parent/child in cascade):
- Parent WO (if intermediate): `Parent: WO-0040 · IN_PROGRESS · Planned end: Mon 06:00`. Color-coded availability indicator.
- Child WOs (if this is a parent): list of child WOs with planned start and gap duration.

**Action buttons** (Planner Advanced only for approve/override/reschedule; Scheduling Officer can reject):
- `[Approve]` (`.btn-primary`) — approves this assignment; updates `work_orders.planned_start_time`, `.assigned_line_id`, `.assigned_shift_id`; emits `scheduler.assignment.approved` outbox event.
- `[Reject]` (`.btn-secondary`) — rejects this assignment; WO returns to unscheduled pool.
- `[Override ...]` (`.btn-secondary`) — opens Override Modal (MODAL-07-03).
- `[Reschedule WO]` (`.btn-secondary`) — opens MODAL-07-03 Assignment Override prefilled with this WO's current assignment data, allowing the Planner to change line/shift/time without drag-drop. See §8.3 Reschedule variant.

Approved assignments: action buttons are hidden; replaced with `Approved by {user} at {timestamp}`. A `[Undo Approval]` link appears for 60 seconds after approval (reverts to draft, same idempotency window).

### 3.5 Read-Only Gantt Specification

The GanttView is a **read-only visualization**. WO blocks cannot be dragged. There is no grab cursor (`cursor: default` on the Gantt container; individual WO blocks use `cursor: pointer` to indicate click-to-view-detail only). No drag ghost, no drop-zone highlight, no re-solve on pointer interaction.

**Rationale (from OQ-EXT-05, decision 2026-04-21):** Most FAs are bound to one production line (dominant 1-FA-to-1-line relationship). Moving a WO between lines would require an eligibility lookup via `fa_line_compatibility` from 03-TECHNICAL, creating significant implementation overhead for limited business value. Rescheduling is instead driven by the Assignment Override modal and the global Re-run Scheduler action.

### 3.6 Rescheduling Entry Points

Three entry points exist for rescheduling; all open MODAL-07-03 or trigger a global re-solve:

1. **`[Re-run Scheduler]`** — top-right button in Zone A Control Bar (existing `[Run Scheduler]` button). Global re-solve across all selected lines for the chosen horizon. Opens MODAL-07-01 to configure run parameters.
2. **`[Reschedule WO]`** — in the Assignment Detail Side Panel (§3.4). Opens MODAL-07-03 Assignment Override prefilled with this WO's current assignment (line, shift, planned_start_time). Planner changes the target line/shift/time and confirms. The system validates eligibility via `fa_line_compatibility` from 03-TECHNICAL (see §8.3).
3. **`[Override Assignment]`** — link in the Pending Review Panel (Zone D) `[...]` overflow per row. Existing override flow, opens MODAL-07-03.

### 3.7 Run Scheduler Modal (MODAL-07-01)

Opened by `[Run Scheduler]` button. Width: 560px.

**Modal title:** `Run Scheduler`

**Form fields:**

- **Horizon**: Radio group. `7 days (default)` / `14 days (P2)`. 14-day option disabled with tooltip if flag off.
- **Production Lines**: Multi-select checkboxes. Default: all active lines checked. Label per line: `LINE-01 · Fresh · Capacity: 800 kg/h`.
- **Include Forecast**: Toggle (default: off). Helper text: `When enabled, demand forecast signals are used as input to the solver. Manual forecast required in P1. Ensure forecasts are uploaded before running.`
- **Optimizer Version**: Read-only field showing `v2 (allergen_sequencing_optimizer_v2)` with a link `View rule in Settings →`. Cannot be changed by Planner (dev-deployed).
- **Run ID**: Auto-generated UUID v7. Shown in small monospace text for audit reference. Cannot be edited.

**Validation before run**:
- If no lines are selected: inline error `Select at least one production line.`
- If `include_forecast=true` and no current forecasts exist for the horizon: `.alert-amber` `No active forecasts found for selected horizon. The solver will run on WO demand only. Upload forecasts first if demand-driven scheduling is required.`
- If a concurrent run is already in progress for this tenant: `.alert-amber` `A scheduler run is already in progress (Run {run_id_short}). Please wait for it to complete or cancel it.`

**Footer buttons**: `[Cancel]` (`.btn-secondary`) / `[Run Scheduler]` (`.btn-primary`).

On submit: button shows spinner `Running...`, modal closes (or stays open with progress) — see Section 3.7.

### 3.8 Run Progress State

After submitting a run:

- An `.alert-blue` banner appears at the top of the Scheduler Dashboard: `Scheduler run in progress — Run {run_id_short} · Started {time} · {progress_pct}% complete`. A progress bar (indeterminate or percent-based) is shown below the banner.
- The `[Run Scheduler]` button is disabled and shows `Running... (Cancel)` with a cancel option.
- Status is polled every 5 seconds via `GET /api/scheduler/runs/:run_id/status`.
- On `completed`: banner changes to `.alert-green` `Scheduler run complete — {N} WOs assigned in {solve_duration}s. Review {M} pending assignments below.` The Pending Review Panel (Zone D) expands automatically.
- On `failed`: banner changes to `.alert-red` `Scheduler run failed — {error_message}. The previous schedule is unchanged. [View Error Details] [Retry]`.
- On `timeout (partial)`: `.alert-amber` `Scheduler run timed out after 120s — {N} WOs assigned (partial). {M} WOs could not be scheduled within the time limit. Review and re-run if needed.`

### 3.9 States

- **Loading (initial)**: Gantt area shows a skeleton grid with shimmer horizontal bars on each line row. KPI cards show shimmer. Control bar fully rendered (interactive).
- **Empty (no WOs)**: Gantt shows empty rows with muted message per row. KPI cards all show `0`. Banner: `.alert-blue` `No DRAFT work orders are available for scheduling. Create work orders in Planning first.` with link `Go to Work Orders →`.
- **Populated, no pending review**: Gantt shows fully approved schedule. Pending Review Panel is hidden. KPI strip shows live data.
- **Populated, pending review**: Gantt shows mixed `draft` (semi-transparent) and `approved` (full opacity) blocks. Pending Review Panel is expanded.
- **Error (data load)**: `.alert-red` banner: `Failed to load scheduler data. [Retry] [Contact Support]`. KPI cards show `—`.
- **Stale (last run >12h)**: `.alert-amber` banner: `Schedule last updated more than 12 hours ago. Run the scheduler to update recommendations.`

---

## 4. Screen SCR-07-02 — Changeover Matrix Editor

**Screen ID:** SCR-07-02
**Route:** `/settings/planning/changeover-matrix`
**Purpose:** The Planner Advanced maintains the N×N allergen changeover matrix that feeds the `allergen_sequencing_optimizer_v2`. The editor shows the default tenant-wide matrix and per-line overrides. All changes create a new version; the active version is the one the solver uses at run time.

This screen is linked from 02-SETTINGS reference tables (§8) and is accessible directly from the Scheduler sidebar under "Settings / Changeover Matrix."

### 4.1 Layout

**Page header:** Breadcrumb `Settings > Planning > Changeover Matrix`. Page title `Changeover Matrix Editor` at 20px bold. Right of title: `[Import CSV]` (`.btn-secondary`) / `[Export CSV]` (`.btn-secondary`) / `[Save & Publish]` (`.btn-primary`, disabled until edits are made).

**Active Version Banner:**
```
+------------------------------------------------------------------+
| Active Version: v4  ·  Published 2026-03-10 by Monika Nowak     |
| [View History]                                           [Revert]|
+------------------------------------------------------------------+
```
The banner has a subtle green left border indicating the published state. `[View History]` opens the Version History Panel (PANEL-07-02-HIST). `[Revert]` is `.btn-danger` with confirmation modal.

**Tab navigation** (`.tabs`):
- **Tab 1: Default Matrix** (active by default)
- **Tab 2: Per-Line Overrides**

### 4.2 Tab 1: Default Matrix

The default matrix is an N×N grid where N = number of allergen codes (14 EU allergens + Mustard + NONE = 16 codes). The grid is rendered as an HTML table.

**Visual structure:**

```
+--------+------+------+------+------+------+------+...+
| FROM\TO| NONE |CEREAL| MILK | EGG  |PEANUT| TREE |...|
+--------+------+------+------+------+------+------+...+
| NONE   |  0   |  15  |  10  |  10  |  60  | BLKD |...|
| CEREAL |  20  |  0   |  15  |  15  |  60  | BLKD |...|
| MILK   |  25  |  20  |  0   |  10  |  60  | BLKD |...|
| EGG    |  20  |  15  |  10  |  0   |  45  | BLKD |...|
| PEANUT |  90  |  90  |  90  |  90  |  0   |  90  |...|
| TREE   | BLKD | BLKD | BLKD | BLKD |  90  |  0   |...|
| ...    | ...  | ...  | ...  | ...  | ...  | ...  |...|
+--------+------+------+------+------+------+------+...+
```

- Row header (FROM allergen): left column, sticky, 100px, bold 12px.
- Column header (TO allergen): top row, sticky, 80px wide each, bold 12px.
- Diagonal cells (FROM = TO): display `—` in gray (same allergen = no changeover needed, always 0 minutes in practice; diagonal is read-only).
- Cell values: displayed as `{N}m` (e.g., `15m`). Cell background = heatmap color (see §1.12). Font 12px.
- `BLKD` cells: cells where `segregation_required = true`. Background `#ede9fe` (light purple), text `BLOCKED` in `#7c3aed` 11px. Non-editable from this view; must be unlocked by Admin. Tooltip: `Allergen segregation required — this changeover is not permitted. Contact admin to override.` A `[Request Review]` button (`.btn-secondary`, small, `font-size: 11px`) appears inside or below the cell label. Clicking `[Request Review]` opens an inline note input (textarea, max 300 chars, placeholder `Reason for review request — e.g., process change eliminates segregation risk`) and a `[Submit Review Request]` button. On submit, a `matrix_review_request` record is created (stub — PRD does not yet define this table; flag for PRD update) and a confirmation toast: `Review request submitted. An admin will be notified.` The cell remains BLOCKED until an admin acts.
- **Cell click** (non-BLKD, non-diagonal): Opens Cell Edit Modal (MODAL-07-02-CELL). Disabled for diagonal cells.
- Sticky header and first column: both sticky with z-index layering.

**Heatmap legend** (below grid): Color swatches matching §1.12 with labels: `0 min · 1–15 min (low) · 16–45 min (medium) · >45 min (high) · BLOCKED`.

**Non-default indicator**: Cells where the current version value differs from the system seed default are marked with a small blue dot in the top-right corner of the cell. Hovering the dot shows: `Modified from seed (seed value: {N}m)`.

### 4.3 Tab 2: Per-Line Overrides

This tab shows a list of production lines. For each line, a collapsible section shows whether a per-line override matrix exists.

```
+------------------------------------------------------------------+
| LINE-01 · Fresh                              [No overrides]      |
+------------------------------------------------------------------+
| LINE-02 · Cooked                             [No overrides]      |
+------------------------------------------------------------------+
| LINE-03 · Breaded                   [12 cell overrides] [Edit]   |
+------------------------------------------------------------------+
| LINE-04 · Marinated                 [3 cell overrides]  [Edit]   |
+------------------------------------------------------------------+
| LINE-05 · Packaging                          [No overrides]      |
+------------------------------------------------------------------+
| [+ Add Override for a Line]                                      |
+------------------------------------------------------------------+
```

For lines with overrides, expanding the row shows a diff table: only the cells that differ from the default are shown in a compact grid. Override cells have an amber background with the default value shown in muted text below the override value.

Example diff row:
```
CEREAL → MILK  |  Default: 15m  |  LINE-03 Override: 45m  |  [Edit] [Remove]
```

Reason for override shown in a `notes` field per cell.

`[Edit]` opens the per-line variant of MODAL-07-02-CELL pre-scoped to the selected line.

`[+ Add Override for a Line]` opens a dropdown to select a line, then expands an empty override editor for that line (showing the default values with an indicator "override default value").

### 4.4 Cell Edit Modal (MODAL-07-02-CELL)

Width: 560px. Opened by clicking any cell.

**Modal title:** `Edit Changeover: {allergen_from} → {allergen_to}` (e.g., `Edit Changeover: CEREAL → MILK`).

If editing a per-line override, title appended with `· LINE-03 Breaded`.

**Form fields:**

- **Changeover Minutes** `*`: Number input, min 0, step 1. Helper: `0 = instant changeover (same allergen group). Values >120 should be validated with production team.`
- **Cleaning Required**: Toggle (boolean). Label: `Line must be physically cleaned before next WO can start.`
- **ATP Required**: Toggle (boolean). Label: `ATP swab test required before next WO can start (<10 RLU threshold per 08-PRODUCTION gate).`
- **Segregation Required** (admin-only field): Toggle. If enabling: `.alert-red` warning `Setting segregation_required = true will BLOCK the scheduler from placing this allergen pair consecutively on any line. This is an irreversible constraint unless an admin reverts it. Confirm only if required by BRCGS or regulatory audit.` Disabled for Planner Advanced (read-only, grayed).
- **Notes**: Textarea, optional. Placeholder: `Reason for this changeover time, e.g., LINE-03 extended cleaning due to crumb residue.`

**Footer:** `[Cancel]` / `[Save Cell]` (`.btn-primary`). Saving marks the matrix as "edited, unpublished" (pending `[Save & Publish]` in the page header).

### 4.5 Save & Publish Flow

When the Planner Advanced clicks `[Save & Publish]` in the page header:

1. A confirmation modal opens: `Publish Changeover Matrix v{N+1}?`
   - Summary of changes: `{N} cells modified. {M} per-line overrides added/modified.`
   - Warning: `.alert-amber` `Publishing a new matrix version immediately affects the next scheduler run. Currently running jobs will continue using the previous version. Future runs will use v{N+1}.`
   - Optional notes field: `Version notes (optional)` — e.g., `Q2 2026 calibration after BRCGS audit`.
2. `[Confirm Publish]` (`.btn-primary`) / `[Cancel]`.
3. On confirm: POST `/api/scheduler/changeover-matrix` → creates new `changeover_matrix_versions` record with `is_active = true` (old version deactivated); emits `scheduler.changeover_matrix.updated` outbox event.
4. Success toast: `Changeover Matrix v{N+1} published successfully. Next scheduler run will use this version.`
5. Active Version Banner updates to show new version number.

### 4.6 Version History Panel (PANEL-07-02-HIST)

A slide-in panel from the right (width 400px). Shows a timeline list of all `changeover_matrix_versions` for this tenant, most recent at top.

Each version item:
```
v5 · Active  [Current]
Published 2026-04-15 by Monika Nowak
"Q2 2026 calibration — LINE-03 Breaded updated"
[View Diff] [Restore]

v4 · Archived
Published 2026-03-10 by Monika Nowak
"Initial seed + Mustard addition"
[View Diff] [Restore]
```

`[View Diff]` opens a full-width diff modal comparing selected version vs current active. Changed cells highlighted in amber. Cells removed from override shown in red.

`[Restore]` on an archived version: opens confirmation modal. `Restoring v{N} will publish it as v{current+1} (a new version, not a true revert). Confirm?` Uses `.btn-danger`.

### 4.7 States

- **Loading**: Shimmer skeleton over the matrix grid cells.
- **Populated (default)**: Grid fully interactive as described.
- **Edited (unsaved)**: The `[Save & Publish]` button becomes active (`.btn-primary`). An `.alert-amber` banner appears: `You have unsaved changes. Click "Save & Publish" to create a new version.`
- **Publishing**: `[Save & Publish]` button shows spinner `Publishing...`, matrix temporarily non-interactive.
- **Import in progress**: Progress indicator below the `[Import CSV]` button.
- **Import errors**: Inline validation table showing rows with errors (e.g., `Row 3: allergen_from "LATEX" not recognized. Valid allergens: {list}.`).
- **Conflict (concurrent edit)**: If another user saved a version while current user was editing: `.alert-red` `Version conflict — another user published v{N} while you were editing. Your changes are based on v{N-1}. Review the new version before re-applying your changes.` [Reload Matrix] button.

### 4.8 Import / Export CSV

**Export CSV**: Downloads the active matrix version as a CSV file. Filename: `changeover-matrix-v{N}-{tenant}-{date}.csv`. Format: `allergen_from, allergen_to, line_id (blank=default), changeover_minutes, cleaning_required, atp_required, segregation_required, notes`.

**Import CSV**: User uploads CSV. System validates:
- V-CM-01: All `allergen_from` and `allergen_to` values must be recognized allergen codes.
- V-CM-02: `changeover_minutes` must be integer ≥ 0.
- V-CM-03: `line_id` must be `NULL/blank` (default) or a valid active production line ID.
- V-CM-04: If `segregation_required = true`, field is flagged for admin review; Planner Advanced cannot set this via import.

On validation success: a preview table shows all rows to be imported. A diff summary shows: `{N} cells changed, {M} new per-line overrides, {K} cells removed from override (reverting to default)`. `[Apply Import]` confirms and stages the import as "edited, unpublished."

---

## 5. Screen SCR-07-03 — Forecast Upload / View

**Screen ID:** SCR-07-03
**Route:** `/scheduler/forecasts`
**Purpose:** Manages demand forecasts used as input to the scheduler. In P1, the Planner manually uploads a CSV with weekly forecast data. In P2, Prophet ML forecasts are shown alongside manual overrides and model health indicators. NPD Manager sees read-only view scoped to their products.

### 5.1 Layout (P1 — Manual CSV)

**Page header:** Breadcrumb `Scheduler > Forecasts`. Page title `Demand Forecasts`. Right: `[Upload Forecast CSV]` (`.btn-primary`).

**Status Banner (P1):**

```
+------------------------------------------------------------------+
| Source: Manual  ·  Last upload: 2026-04-18 by Monika Nowak      |
| Covers: 2026-W17 to 2026-W24 (8 weeks)  ·  42 products         |
| [P2] Prophet ML: Not enabled — Phase 2 feature                  |
+------------------------------------------------------------------+
```

The P2 Prophet status shows as a `.badge-gray` `Coming in Phase 2` badge.

**Filter bar:**
- Product search: text input, searches `product_code` and `product_name`.
- Week range: dual date pickers (ISO week format `YYYY-Www`). Defaults to current week + next 7 weeks.
- Source filter: `All` / `Manual` / `ML (Prophet)` / `Overridden`. P2 options grayed in P1.

**Forecast Table:**

| Column | Notes |
|---|---|
| Product Code | Monospace, e.g., `FA5102` |
| Product Name | Full name |
| W17 | Forecast qty in kg for week |
| W18 | Forecast qty in kg for week |
| W19 | ... |
| ... | Up to 8 columns (horizon) |
| Source | `.badge` per source type (manual / prophet / overridden) |
| Updated | `{date} by {user}` |
| Actions | `[Override]` (P2 only), `[Delete]` |

Column headers (W17, W18 etc.): clicking a column header shows the week date range in a tooltip (e.g., `W17: 21 Apr – 27 Apr 2026`).

Cells with no forecast data show `—` in gray.

Cells that have been manually overridden (P2) show the override value with a small amber dot indicator. Hover the dot: `Overridden from ML forecast of {original_qty} kg by {user} on {date}`.

**Pagination**: 50 rows per page. Numbered pagination.

### 5.2 Upload Forecast Modal (MODAL-07-03-UPLOAD)

Opened by `[Upload Forecast CSV]`. Width: 560px.

**Modal title:** `Upload Demand Forecast CSV`

**Instructions block** (`.alert-blue`):
```
Expected CSV format:
  product_id (UUID) or product_code (e.g., FA5102),
  week_iso (YYYY-Www, e.g., 2026-W17),
  qty_kg (numeric, e.g., 1200.5)

Max file size: 5 MB. Max rows: 10,000.
```

Download template link: `[Download CSV Template]`.

**File upload area**: Drag-and-drop zone or `[Choose File]` button. Accepted: `.csv`, `.txt`.

**Validation (on file selection, before upload):**
- Parses first 20 rows for preview.
- Checks: headers present, required columns present, `week_iso` format valid, `qty_kg` numeric ≥ 0.
- Preview table shows first 10 rows.
- Error list below preview: e.g., `Row 7: week_iso "2026-17" is not valid ISO week format. Expected YYYY-Www.`

**Overwrite policy**: If forecasts already exist for the same (product, week): radio group. `Replace existing values` (default) / `Keep existing, only add new`. Helper text shown per option.

**Footer:** `[Cancel]` / `[Upload]` (`.btn-primary`, disabled if validation errors).

On successful upload: modal closes, success toast `Forecast uploaded: {N} products × {M} weeks. Next scheduler run will use these demand signals.`

### 5.3 P2 Layout (Prophet ML Forecasting)

The following describes the P2 layout. This section should be prototyped as a placeholder screen with a `[P2]` banner overlay.

**Page header** (P2): Same as P1 plus a `[Retrain Model]` button (admin-only) and a `[Forecaster Health]` status indicator (green/amber/red dot + timestamp).

**Forecaster Health Card** (P2):
A `.card` at the top of the page showing:
- Prophet service status: `Healthy` (`.badge-green`) or `Degraded` (`.badge-amber`) or `Unreachable` (`.badge-red`).
- Last retrain: `2026-04-21 01:00 UTC · 42 products trained · 12m 34s`.
- Forecast SMAPE (rolling 30d): `14.2%` (`.badge-green` if <20%, `.badge-amber` if 20–30%, `.badge-red` if >30%).
- Alert: `.alert-amber` shown if SMAPE >30% for any product: `Forecast accuracy degraded for {N} products. Model may need retraining or manual override.`
- Stale flag: if last retrain >7 days: `.badge-amber` `Forecast data stale — {N} days since last retrain`.

**Forecast Chart View** (P2 — replaces table for Prophet-sourced products):

For each product (paginated), a chart shows:
- X-axis: weeks (13 historical + 8 future).
- Blue area: actual production qty per week (from `forecast_actuals`).
- Green line: Prophet forecast (`yhat`).
- Shaded band: confidence interval (`yhat_lower` to `yhat_upper`, 95%).
- Dashed vertical line: today (boundary between historical and future).

Chart height: 180px per product chart. Shown in a `.grid-2` layout (two products side by side on desktop).

**Manual override cell** (P2): Clicking a future forecast week on any chart opens an inline editable cell. The override is recorded with `source='overridden'`, `override_original_qty` preserved.

### 5.4 States

- **Loading**: Skeleton table rows (shimmer).
- **Empty (no forecasts uploaded)**: Illustration + heading `No Demand Forecasts Yet`. Body: `Upload a CSV file with weekly demand estimates to improve scheduler accuracy.` Button: `[Upload Forecast CSV]`. `.alert-blue` note: `Without forecast data, the scheduler uses work order quantities as demand signal only.`
- **Populated**: Table / chart as described.
- **Upload in progress**: Progress bar below upload button. Table grayed out.
- **Upload error**: `.alert-red` inside modal: `Upload failed: {error}. Check file format and retry.`
- **P2 feature flag off**: Prophet section replaced by `.alert-blue` `ML Demand Forecasting (Prophet) is a Phase 2 feature. Contact your administrator to enable it. Manual forecast upload is available now.`

---

## 6. Screen SCR-07-04 — Scheduler Run History

**Screen ID:** SCR-07-04
**Route:** `/scheduler/runs`
**Purpose:** Provides a full audit trail of all scheduler_runs for this tenant. The Planner can review past runs, compare KPI snapshots, re-run with the same parameters, and investigate override patterns. Production Manager can view but not re-run.

### 6.1 Layout

**Page header:** Breadcrumb `Scheduler > Run History`. Page title `Scheduler Run History`. Right: `[Export CSV]` (`.btn-secondary`).

**Filter bar:**
- Date range picker: defaults to last 30 days.
- Status filter: `All` / `Completed` / `Failed` / `Cancelled` / `Running`.
- Run type filter: `All` / `Schedule` / `Dry Run`. Dry-run rows are created with `run_type='dry_run'` and `status='preview'`; they display a `.badge-gray` `Preview` badge in the Status column.
- User filter: dropdown of users who have initiated runs. Defaults to `All users`.
- Search: text input — searches `run_id` prefix.

**KPI mini-cards** (4 cards, `.grid-4`):

| Card | Value | Sub-label |
|---|---|---|
| Total Runs | Count in filter period | `{n} this month` |
| Avg Solve Time | Average `solve_duration_ms` in seconds | `P95: {N}s · Target <60s` |
| Acceptance Rate | `count(approved) / count(draft+approved+rejected)` | `Target: ≥85%` |
| Override Rate | `count(overridden) / count(total)` | `Target: <15%` |

**Run History Table:**

| Column | Width | Notes |
|---|---|---|
| Run ID | 120px | First 8 chars of UUID, monospace. Click opens run detail. |
| Initiated | 150px | `{date} {time}` + `by {username}`. Relative time sub-label (e.g., `3 hours ago`). |
| Horizon | 70px | `7d` or `14d` |
| Lines | 80px | Count of lines included (e.g., `5 of 5`) |
| Duration | 80px | `{N}s` or `{N}m {s}s`. Color: green if <60s, amber 60–120s, red >120s. |
| WOs Scheduled | 80px | `{n}` |
| Overrides | 70px | Count of overridden assignments |
| Changeover Total | 100px | `{N} min` total changeover from output_summary |
| Utilization Avg | 90px | `{N}%` average line utilization from output_summary |
| Status | 90px | Status badge per §1.11 |
| Actions | 80px | `[View]` + `[Re-run]` (Planner only) |

Row click: navigates to `/scheduler/runs/:run_id` (Run Detail).

`[Re-run]` on a completed run: opens confirmation modal `Re-run with same parameters? A new run_id will be generated. The existing run is unchanged.` `[Confirm]` triggers `POST /api/scheduler/run` with same params and new UUID v7.

Failed rows: red left border on the row. The status badge is `.badge-red` `Failed`. Hover the row: shows truncated `error_message` in a tooltip.

Partial timeout rows: `.badge-amber` `Partial` status. Tooltip: `Run timed out at 120s. {N} of {total} WOs scheduled.`

### 6.2 Run Detail Screen (SCR-07-04-DETAIL)

**Route:** `/scheduler/runs/:run_id`

**Page header:** Breadcrumb `Scheduler > Run History > {run_id_short}`. Page title `Scheduler Run {run_id_short}`. Status badge. Right: `[Re-run]` (Planner only) / `[Export]`.

**Layout: two-column** (`.grid-2` 60/40 split).

**Left column — Run Metadata card:**
- Run ID (full UUID, monospace, copyable)
- Status badge
- Initiated by / at
- Queued at / Started at / Completed at
- Solve duration: `{N}ms` ({N}s)
- Horizon: `7 days`
- Lines included: comma-separated list with names
- Include forecast: `Yes / No`
- Optimizer version: `allergen_sequencing_optimizer_v2 (v2)` with link to 02-SETTINGS rule viewer
- Idempotency: if this run was served from cache: `.badge-blue` `Cached result — original run {run_id_short}`.

**Left column — Input Snapshot card (collapsible, default closed):**
- Shows a summary of `input_snapshot` JSONB at run time: WO count, line availability snapshot, forecast week range (if used). A `[View Full Snapshot JSON]` link opens a read-only JSON viewer modal.

**Right column — Output Summary card:**
- WOs scheduled: `{N} of {total} unscheduled WOs`
- WOs unscheduled (capacity overflow): `{M}` with `.badge-amber` and list of WO codes
- Total changeover minutes: `{N} min` vs previous run delta `{+/-N} min vs prev run`
- Average line utilization: `{N}%` per line (micro-bars)
- Override count: `{N}` (linked to override log below)
- Fallback activated: `No` or `.badge-amber` `Yes — fell back to allergen_sequencing_heuristic_v1` (if solver rule failure)

**Right column — Assignment Table (paginated, 25 rows):**

| Column | Notes |
|---|---|
| Rank | 1..N |
| WO Code | Monospace link to `/planning/wos/:id` |
| Product | Name + FA code |
| Line | `LINE-01 · Fresh` |
| Shift | `Shift A` |
| Planned Start | `Mon 21 Apr 06:00` |
| Duration | `5h 30m` |
| Score | `94.2` |
| Status | Badge per §1.11 |
| Approved By | `{username}` or `—` |

**Override Log section** (visible if any overrides exist, collapsible):

A timeline list of override events:
```
[Overridden] 2026-04-21 09:14 by Monika Nowak
  WO-2026-0055 · FA5201
  Original: LINE-02 / Shift A / Mon 08:30
  Override: LINE-03 / Shift B / Mon 14:00
  Reason: customer_priority — "Customer X delivery deadline brought forward"
```

### 6.3 States

- **Loading**: Skeleton table rows (8 rows shimmer).
- **Empty (no runs yet)**: Illustration + heading `No Scheduler Runs Yet`. Body: `Run the scheduler from the GanttView to generate your first schedule.` Button: `[Go to GanttView]`.
- **Filtered empty**: `No runs match your filters. [Clear Filters]`
- **Error**: `.alert-red` banner, Retry button.

---

## 7. Screen SCR-07-05 — What-If Simulation [P2]

**Screen ID:** SCR-07-05
**Route:** `/scheduler/simulate`
**Purpose:** Allows the Planner Advanced to model hypothetical capacity scenarios (e.g., a line breakdown, urgent order insertion, shift pattern change) and compare resulting KPIs against the current baseline schedule — without committing any changes to the production database.

This screen is a P2 feature. In P1 prototypes, the route renders a placeholder screen with the layout visible but a `[P2 — Coming in Phase 2]` overlay banner across the interactive elements.

### 7.1 Layout

**Page header:** Breadcrumb `Scheduler > What-If Simulation`. Page title `What-If Simulation`. Right: `[New Scenario]` (`.btn-primary`) / `[Saved Scenarios]` (`.btn-secondary`).

**Placeholder state (P1 prototype):**

```
+------------------------------------------------------------------+
|                    [P2 Feature]                                  |
| What-If Simulation                                               |
|                                                                  |
| This feature will be available in Phase 2.                       |
| It allows you to model capacity shocks and compare schedule KPIs |
| before committing any changes.                                   |
|                                                                  |
| Expected capabilities:                                           |
| - Line down for N hours                                          |
| - Add / remove WO from schedule                                  |
| - Shift capacity adjustment                                      |
| - Side-by-side KPI comparison (baseline vs scenario)            |
|                                                                  |
| [Notify me when Phase 2 is available]                           |
+------------------------------------------------------------------+
```

### 7.2 P2 Full Layout

**Scenario Builder Panel (left, 300px):**

- **Baseline**: shows current latest completed run as baseline (run_id_short, date, KPI summary).
- **Scenario name**: text input, e.g., `"LINE-03 down 8h Wed 22 Apr"`.
- **Scenario modifications** (add actions):
  - `[+ Line Down]`: select line + start_time + duration_hours. Creates a maintenance block in the simulation Gantt.
  - `[+ Add WO]`: search and select an unscheduled WO to inject.
  - `[+ Remove WO]`: remove a scheduled WO from simulation scope.
  - `[+ Shift Capacity Change]`: reduce line capacity_kg_per_hour for a period.
- List of added modifications; each can be removed with an X button.

**Action buttons**: `[Run Simulation]` (`.btn-primary`) / `[Clear]` / `[Save Scenario]`.

**Simulation Result Panel (center, fills remaining width):**

Side-by-side dual Gantt view:
- Left Gantt: Baseline schedule (current).
- Right Gantt: Simulated schedule.
- Same Y-axis (lines), same X-axis (horizon).
- Differences highlighted: WOs that moved are outlined in amber; new WOs from injection in green; removed WOs greyed out.

**KPI Comparison Strip (below dual Gantt):**

| KPI | Baseline | Simulation | Delta |
|---|---|---|---|
| Total Changeover (min) | 420 | 480 | `.badge-red` `+60 min` |
| Avg Utilization | 88% | 85% | `.badge-amber` `−3%` |
| Overdue WOs | 2 | 5 | `.badge-red` `+3` |
| WOs Unscheduled | 0 | 1 | `.badge-amber` `+1` |

Delta badge: green if improvement, amber if minor regression, red if significant regression.

**`[Save Scenario]`**: Saves to `scheduler_scenarios` table (P2). The scenario is never committed to production `scheduler_assignments`.

**Saved Scenarios list**: Table at bottom of page. Columns: Scenario Name, Created by / at, Baseline Run, Key Delta (best/worst KPI), Actions (`[View]`, `[Re-run]`, `[Delete]`).

---

## 8. Modal MODAL-07-03 — Assignment Override

**Modal ID:** MODAL-07-03
**Triggered from:** Assignment Detail Side Panel (SCR-07-01 §3.4) `[Override ...]` button, or `[...]` overflow in Pending Review Panel.
**Width:** 760px

**Purpose:** Allows the Planner Advanced or Scheduling Officer to manually assign a WO to a different line, shift, or time slot than the optimizer recommended, with a mandatory reason code and optional notes. The override is recorded in `scheduler_assignments` for audit.

### 8.1 Layout

**Modal title:** `Override Assignment — {WO_CODE} · {product_name}`

**Current Optimizer Recommendation** section (read-only, gray background):
- Line: `LINE-02 · Cooked`
- Shift: `Shift A · 06:00–14:00`
- Planned Start: `Mon 21 Apr 2026, 08:30`
- Planned End: `Mon 21 Apr 2026, 13:30`
- Optimizer score: `88.1 / 100`
- Changeover before: `15 min (CEREAL → MILK)`

**Override fields:**

- **New Line** `*`: Dropdown. Options: `LINE-01 · Fresh`, `LINE-02 · Cooked`, etc. Pre-selected = current line (Planner must change).
  - If a new line is allergen-incompatible with the WO: `.alert-red` inline `LINE-01 is not compatible with this WO's allergen profile (Peanuts). Assignment will violate allergen sequencing rules. Confirm only if full cleaning + ATP test will be performed before start.`
  - If the new line has `segregation_required=true` for this allergen pair: hard block: `.alert-red` `This assignment is blocked by allergen segregation policy. Contact admin to override the changeover matrix.` Override button disabled.
- **New Shift** `*`: Dropdown. `Shift A (06:00–14:00)` / `Shift B (14:00–22:00)` / `Shift C (22:00–06:00)`.
- **New Planned Start Time** `*`: Datetime picker. Constrained to the selected shift window. Validated against V-SCHED-03 (child WO start >= parent WO end), V-SCHED-04 (no overlap on line).
  - Conflict indicator: if the entered slot overlaps an existing approved WO: `.alert-amber` `Time slot conflicts with WO-2026-0043 (Mon 08:00–12:00 on LINE-02). Adjust start time or change line.`
- **Reason Code** `*`: Dropdown (required). Options:
  - `customer_priority` — Customer delivery deadline
  - `material_shortage` — Material not available for original slot
  - `line_maintenance` — Line maintenance conflict
  - `capacity_constraint` — Override capacity allocation
  - `planner_judgement` — Planner professional judgement (requires notes)
  - `other` — Other (requires notes)
- **Notes** (required if reason = `planner_judgement` or `other`): Textarea. Max 500 chars. Counter shown.

**Impact preview** (auto-computed after line/shift/time selection):
- Changeover impact: `New changeover before: 45 min (MILK → GLUTEN). Previous: 15 min. Additional 30 min changeover.`
- Downstream impact: if this WO is a parent in a cascade DAG and the override shifts end time: `.alert-amber` `This WO is a parent of child WO-2026-0046. Shifting end time to {new_end} may delay child WO start. Review cascade scheduling.`

**Footer:** `[Cancel]` / `[Confirm Override]` (`.btn-primary`). On confirm: POSTs to `/api/scheduler/assignments/:id/override` with override fields; modal closes; side panel refreshes showing `.badge-amber` `Overridden` status.

### 8.2 States

- **Valid override**: `[Confirm Override]` active.
- **Allergen segregation hard block**: `[Confirm Override]` disabled, `.alert-red` message shown.
- **Conflict detected**: `[Confirm Override]` remains active (override is a planner decision, but `.alert-amber` is shown — it is a soft warning, not a hard block, unless V-SCHED-04 overlap detected, which is a hard block).
- **Submitting**: Button shows spinner `Saving...`.
- **Error**: `.alert-red` inside modal: `Failed to save override: {error}. Try again.`

### 8.3 Reschedule Variant (opened from `[Reschedule WO]` in Assignment Detail Side Panel)

When MODAL-07-03 is opened via `[Reschedule WO]` in the Assignment Detail Side Panel, it opens in **Reschedule mode**:

- Modal title changes to: `Reschedule WO — {WO_CODE} · {product_name}`
- All override fields (New Line, New Shift, New Planned Start Time) are **prefilled** with the WO's current assignment values. The Planner must change at least one field.
- An `.alert-blue` informational banner is shown at the top: `You are rescheduling this WO manually. To re-optimize the full schedule, use [Re-run Scheduler] instead.`

**FA–Line eligibility validation:**
- On line selection change, the system checks `fa_line_compatibility` from 03-TECHNICAL.
- If the selected line is **not eligible** for this WO's FA: show `.alert-red` inline below the New Line field: `Line {X} is not compatible with FA {Y}. Eligible lines: [LINE-01 · Fresh, LINE-03 · Breaded, ...]`. The `[Confirm Override]` button is disabled until a compatible line is selected or the Planner explicitly acknowledges (checkbox: `I understand this assignment violates FA–line eligibility and accept responsibility`; checking this re-enables the button with a `.badge-amber` warning state).
- If the selected line is eligible: no additional warning beyond the existing allergen/conflict checks in §8.1.

The Reason Code and Notes fields follow the same rules as §8.1. On confirm, the override is recorded in `scheduler_assignments` identically to a standard override.

---

## 9. Modal MODAL-07-04 — Disposition Decision [P2]

**Modal ID:** MODAL-07-04
**Route trigger:** Notification-driven (toast link) when parent WO completes with `items.intermediate_disposition_mode = 'planner_decides'`.
**Width:** 560px

**Purpose:** In P2 disposition bridge mode, when a parent WO completes and the intermediate output's disposition mode is `planner_decides`, the Planner receives a notification to decide whether the output LP goes to stock or is directly consumed by the waiting child WO. A 2-hour timeout auto-defaults to `to_stock` if no decision is made.

### 9.1 Layout

**Modal title:** `Disposition Decision Required — {item_code} · {item_name}`

**Countdown timer** (top-right of modal, red if <30 min remaining): `Time remaining: 1h 47m — Default: To Stock at {time}`. Adjacent to the timer: `[Extend 1h]` and `[Extend 4h]` buttons (`.btn-secondary`, small). Clicking either opens an inline reason textarea (required, placeholder `Reason for extension — e.g., child WO line not ready yet`, max 300 chars) and a `[Confirm Extension]` button. On confirm, the timeout deadline is extended by the selected duration per LP, and the timer updates. Both buttons are available only to Planner Advanced. The default 2h timeout is preserved for new LPs.

**Context section:**
- Parent WO: `WO-2026-0040 · {product_name}` — COMPLETED at `{timestamp}`
- Output LP: `LP-2026-04-0040-001` — `1,200 kg` — Status: `Available (awaiting disposition)`
- Shelf life: `6 hours remaining` (`.badge-red` if <2h, `.badge-amber` if 2–4h, `.badge-green` if >4h)
- Child WO waiting: `WO-2026-0046 · {intermediate_product}` — Status: `READY` — Planned start: `{time}`

**Decision options** (radio group):

- **To Stock** (default): `Send LP to warehouse as standard stock. Child WO operator will scan at production time.`
  - Visual: muted, standard flow indicator.
- **Direct Continue**: `Reserve LP directly for child WO. No put-away. Child WO can start immediately upon reservation.`
  - Visual: blue highlight, fast-track indicator.
  - Additional info: `Estimated start offset: ≈15 min (reservation setup).`

**Warning** (always shown when Direct Continue selected): `.alert-amber` `Selecting Direct Continue bypasses standard warehouse put-away. Ensure the child WO line is ready. If child WO is cancelled after reservation, the LP will revert to available stock automatically.`

**Footer:** `[Cancel — Decide Later]` (`.btn-secondary`, re-opens in 15 min via reminder) / `[Confirm: To Stock]` or `[Confirm: Direct Continue]` — button label updates based on radio selection. Both are `.btn-primary`.

On confirm: POSTs disposition decision to `/api/scheduler/disposition/:lp_id`; modal closes; notification dismissed.

On `[Cancel — Decide Later]`: modal closes; notification badge on sidebar remains; reminder after 15 min.

### 9.2 Timeout Behavior

If no decision is made within 2 hours:
- System auto-selects `to_stock`.
- Notification changes to `.badge-gray` `Auto-resolved: To Stock`.
- Planner receives a in-app notification: `Disposition auto-resolved for LP-2026-04-0040-001 — defaulted to To Stock (2h timeout).`

---

## 10. Screen SCR-07-06 — Allergen Sequencing Review (extends 04-PLANNING-BASIC §2.8)

**Screen ID:** SCR-07-06
**Route:** `/planning/sequencing` (extends existing 04-PLANNING-BASIC route)
**Purpose:** The basic sequencing view in 04-PLANNING-BASIC shows allergen groups with the v1 heuristic result. When `planning.allergen_optimizer.v2.enabled = true` (07-EXT feature flag), this screen shows the v2 optimizer output with changeover cost breakdown. This section documents the 07-EXT-specific enhancements to that screen; the base screen layout is defined in 04-PLANNING-BASIC-UX.md §2.8.

### 10.1 v2 Enhancement Overlay

When the v2 optimizer is active, the sequencing screen gains the following additions:

**Banner at top of page:**
```
+------------------------------------------------------------------+
| Allergen Optimizer v2 ACTIVE  ·  Rule: allergen_sequencing_optimizer_v2
| Fallback: allergen_sequencing_heuristic_v1 (inactive)
| [View rule in Settings →]                              [Disable v2]|
+------------------------------------------------------------------+
```
The `[Disable v2]` button (Planner Advanced only) is `.btn-danger` that opens a confirmation modal before toggling the `planning.allergen_optimizer.v2.enabled` feature flag.

**Changeover Cost Summary card** (new, appears below KPI row):
- Total changeover minutes: `{N} min` (for current horizon)
- vs v1 heuristic baseline: `−{M} min ({%} reduction)` in `.badge-green` or `+{M} min` in `.badge-red` if v2 is worse.
- Target: `≥30% reduction`. Progress bar showing achievement.
- Fallback activations (if any): count of runs that fell back to v1 (should be 0 normally).

**Sequence Table enhancements** (appended columns to existing table):
- **Changeover (min)**: Minutes of changeover from previous WO on same line. Color coded (§1.12). Source: `changeover_matrix` lookup.
- **Cleaning Req**: `Yes` / `No` from changeover_matrix cell.
- **ATP Req**: `Yes` / `No` from changeover_matrix cell.
- **Allergen Risk**: `Low` (`.badge-green`) / `Medium` (`.badge-amber`) / `High` (`.badge-red`) / `BLOCKED` (`.badge-red`, purple text) — computed from penalty_weight in v2 rule.
- **Cross-line opt**: Badge `.badge-blue` `Moved` if this WO was moved from a different line by the cross-line optimizer. Tooltip: `Moved from LINE-02 to LINE-01 — saved 30 min changeover.`

### 10.2 Dry-Run Preview Mode

The v2 optimizer supports a dry-run mode (FR-07-E2-005). Accessed via a `[Preview Sequence]` button (replaces / augments `[Run Sequencing]` in 04-PLANNING-BASIC):

1. Planner clicks `[Preview Sequence]`.
2. A panel expands below the sequence table showing the optimizer's proposed sequence changes, without committing.
3. The preview shows a side-by-side comparison:
   - Left: Current sequence (v1 heuristic or current approved order).
   - Right: Proposed sequence (v2 optimizer).
4. Delta summary: `{N} WOs re-sequenced · Total changeover: {A} min → {B} min · Saving: {C} min`.
5. Action buttons:
   - `[Commit Preview]` (`.btn-primary`) — converts the dry-run to a regular run: creates `scheduler_assignments` (draft state), returns to Pending Review in GanttView for approval. The `scheduler_run` row's `run_type` changes from `'dry_run'` to `'schedule'` and `status` from `'preview'` to `'completed'`.
   - `[Discard]` (`.btn-secondary`) — marks the dry-run `scheduler_run` row as `status='discarded'`; preview disappears. A toast: `Dry-run discarded.`

   **Dry-run persistence (per OQ-EXT-09):** Clicking `[Preview Sequence]` creates a row in `scheduler_runs` with `run_type='dry_run'`, `status='preview'`. This row auto-expires after 24 hours if neither committed nor discarded. Dry-run rows are visible in SCR-07-04 Run History with the `run_type` filter set to `Dry Run`, showing `.badge-gray` `Preview` badge. Expired dry-runs show `.badge-gray` `Expired`.

---

## 11. Cross-Module Integration Points

### 11.1 04-PLANNING-BASIC

| Integration point | Direction | Description |
|---|---|---|
| `work_orders` table | 07-EXT reads | Unscheduled WOs (status=DRAFT, planned_start_time IS NULL) are the primary solver input |
| `wo_dependencies` table | 07-EXT reads | Cascade DAG precedence constraints: child WO planned_start >= parent WO planned_end (V-SCHED-03) |
| `wo_material_reservations` | 07-EXT reads (P2 writes) | Materials availability projection shown in Assignment Detail Panel; P2 disposition bridge writes reservation handoff |
| `work_orders.planned_start_time`, `.assigned_line_id`, `.assigned_shift_id` | 07-EXT writes (on approve) | Approved assignments update these fields |
| `/planning/wos/:id` | 07-EXT links to | Assignment Detail Side Panel links to full WO detail in 04-PLANNING-BASIC |
| `/planning/sequencing` | 07-EXT extends | SCR-07-06 adds v2 optimizer overlay to the existing sequencing view |
| PO generator trigger (P2) | 07-EXT → 04-PLAN | Forecast-driven PO generation: `scheduler.forecast.uploaded` event consumed by 04-PLAN §5 PO generator |

### 11.2 02-SETTINGS

| Integration point | Direction | Description |
|---|---|---|
| Rule registry §7 | 07-EXT reads | `finite_capacity_solver_v1` and `allergen_sequencing_optimizer_v2` DSL rules are registered and read here |
| Reference tables §8 | 07-EXT reads | `production_lines`, `shift_patterns` feed the solver. Changeover Matrix Editor links from 02-SETTINGS reference tables nav. |
| Feature flags §14 | 07-EXT reads | `planning.allergen_optimizer.v2.enabled` controls v2 rollout; `scheduler.what_if.enabled` gates P2 simulation |
| Changeover Matrix link | 02-SETTINGS links to 07-EXT | 02-SETTINGS reference tables includes a card/link to `/settings/planning/changeover-matrix` |
| Audit dashboard | 07-EXT → 02-SETTINGS | Override frequency and rule fallback rate appear in 02-SETTINGS audit dashboard |

### 11.3 03-TECHNICAL

| Integration point | Direction | Description |
|---|---|---|
| `items.allergen_profiles` | 07-EXT reads | Allergen intensity per item feeds optimizer penalty calculation |
| `routings` + `routing_operations` | 07-EXT reads | `expected_duration_sum` per routing is the WO block width on Gantt (V-SCHED-01) |
| `allergen_cascade_rules` §10 | 07-EXT reads | Informs initial seed of changeover_matrix (which allergen pairs require segregation) |
| Item disposition mode (P2) | 03-TECH item master | `items.intermediate_disposition_mode` ENUM column (to_stock / direct_continue / planner_decides); visible in 03-TECH item detail screen |

### 11.4 08-PRODUCTION

| Integration point | Direction | Description |
|---|---|---|
| `scheduler.assignment.approved` event | 07-EXT emits → 08-PROD consumes | Populates WO planner metadata in Production Dashboard: planned_start_time, assigned_line_id, assigned_shift_id |
| Allergen changeover gate | 08-PROD validates | 08-PROD `allergen_changeover_gate_v1` rule independently validates the scheduler's recommendations pre-WO start. If 07-EXT has a bug, 08-PROD gate provides a safety net. |
| GanttView link | 07-EXT GanttView | "Next WO" shown in 08-PROD Line Detail cards reflects scheduler assignments approved by 07-EXT |

### 11.5 12-REPORTING

| Integration point | Direction | Description |
|---|---|---|
| Changeover reduction trend | 07-EXT → 12-REPORTING | Weekly rolling changeover_minutes trend; `1 - (this_month / baseline)` % reduction KPI |
| Scheduler acceptance rate | 07-EXT → 12-REPORTING | `scheduler_assignments` aggregated weekly for acceptance/override rate dashboard |
| Forecast SMAPE (P2) | 07-EXT → 12-REPORTING | `forecast_actuals.smape` rolling 30d per product, shown in 12-REPORTING analytics |

### 11.6 15-OEE

| Integration point | Direction | Description |
|---|---|---|
| Machine utilization | 07-EXT → 15-OEE | `scheduler.assignment.approved` events contribute planned_capacity data. 15-OEE computes `planned_minutes / available_minutes` per line |

---

## 12. Validation Rules Reference

All validation rules enforced in 07-EXT screens:

| Rule ID | Description | Trigger | Severity | UI feedback |
|---|---|---|---|---|
| V-SCHED-01 | Assignment duration must match routing expected_duration ±5% | On run / override | Warn | `.alert-amber` in assignment detail |
| V-SCHED-02 | Assigned line must be allergen-compatible per `production_lines.allergen_constraints` | On override / reschedule | Block | `.alert-red` in override modal; FA–line eligibility check in reschedule variant (§8.3) |
| V-SCHED-03 | Child WO planned_start >= parent WO planned_end (cascade DAG) | On run / override | Block | `.alert-red` in override modal if violated |
| V-SCHED-04 | No two WOs overlap on same (line_id, time_window) | On run / override / reschedule | Block | Conflict indicator in override modal |
| V-SCHED-05 | Changeover block must be inserted between WOs with different allergen_from/to on same line | On run | Block (solver enforces) | Changeover block visible on Gantt |
| V-SCHED-06 | Changeover minutes in block >= matrix lookup value | On run | Block (solver enforces) | Tooltip on changeover block shows matrix source |
| V-SCHED-07 | Assignment approval requires role `planner_advanced` or `scheduling_officer` | On approve | Block | `[Approve]` button hidden for other roles |
| V-SCHED-08 | Override reason_code required if override fields are non-null | Override modal submit | Block | Required field validation on reason_code |
| V-SCHED-09 (P2) | Forecast week_iso must be within 3-year retention window | Forecast upload | Block | Row-level validation error in upload preview |
| V-SCHED-10 (P2) | Disposition bridge triggers only if `items.shelf_life_hours <= 24` | Disposition decision | Info | Helper text in MODAL-07-04 |
| V-CM-01 | Changeover matrix allergen codes must be recognized | CSV import | Block | Import validation table |
| V-CM-02 | changeover_minutes must be integer >= 0 | CSV import / cell edit | Block | Inline field validation |
| V-CM-03 | line_id in matrix must be active production line | CSV import | Block | Import validation table |
| V-CM-04 | segregation_required=true requires admin role | Cell edit / CSV import | Block | Field disabled for Planner; flagged in import |

---

## 13. Edge Cases and Error Handling

### 13.1 Solver Service Unavailable

If the Python solver microservice (`planner-solver`) is unreachable:

- The `[Run Scheduler]` button still submits the job to the queue.
- Queue holds the job; BullMQ or Postgres listen/notify retries up to 3 times in 60-second intervals.
- If all retries fail: `scheduler_runs.status = 'failed'`, `error_message = 'Solver service unreachable after 3 retries. Circuit breaker activated.'`
- GanttView shows `.alert-red` `The scheduler service is temporarily unavailable. The last known schedule (from {date}) is displayed. Contact DevOps if this persists.`
- The last approved schedule remains displayed (not removed). New solver recommendations are not available.
- Circuit breaker resets after 15 minutes.

### 13.2 Solver Timeout (Partial Result)

If solve_duration_ms > 120,000 (hard timeout):

- Solver returns partial assignments for WOs that were assigned before timeout.
- `scheduler_runs.status = 'completed'` with `output_summary.partial = true`.
- GanttView shows `.alert-amber` `Partial schedule — solver timed out at 120s. {N} of {total} WOs were scheduled. Unscheduled WOs: {list}. Run again on a smaller horizon or subset of lines.`
- Partial assignments are reviewable and approvable.
- Unscheduled WOs remain in the Unscheduled pool with a `.badge-amber` `Timeout — not scheduled` indicator in Zone B KPI strip.

### 13.3 Allergen Optimizer v2 Fallback to v1

If `allergen_sequencing_optimizer_v2` DSL rule throws an exception during the run:

- Solver falls back to `allergen_sequencing_heuristic_v1` (04-PLANNING-BASIC §10 rule).
- `scheduler_runs.output_summary.fallback_activated = true`, `fallback_rule = 'allergen_sequencing_heuristic_v1'`.
- GanttView shows `.alert-amber` `Optimizer v2 encountered an error and fell back to basic heuristic sequencing. Changeover optimization may be suboptimal. Check 02-SETTINGS rule registry for v2 rule health.`
- The run is still considered `completed` (not `failed`).
- Planner can still approve/reject assignments from the fallback run.

### 13.4 WO Cancelled After Assignment Approved

If a WO is cancelled in 04-PLANNING-BASIC after its `scheduler_assignment` has been approved:

- The cancellation event triggers a listener in 07-EXT.
- `scheduler_assignment.status` is set to `cancelled` (new sub-state, displayed as `.badge-gray` `WO Cancelled`).
- The Gantt block disappears on next auto-refresh.
- An in-app notification is sent to the Planner: `WO {WO_CODE} was cancelled. Its scheduled slot on {LINE} at {time} is now free.`
- Outbox event `scheduler.assignment.cancelled` emitted (consumed by 15-OEE to release planned_capacity).

### 13.5 Concurrent Changeover Matrix Edits

If two Planner Advanced users attempt to edit the matrix concurrently (unlikely but possible in multi-user deployments):

- Optimistic locking via `changeover_matrix_versions.version_number`.
- The second user to click `[Save & Publish]` receives: `.alert-red` `Version conflict — another user published v{N} while you were editing. Your changes were based on v{N-1}. [Reload Matrix and re-apply your changes] [Discard my changes]`.
- No data is lost; the first publisher's version is the active one.

### 13.6 Forecast Data Stale (P2)

If Prophet retraining job has not run in >7 days:

- `demand_forecasts` records gain `stale_flag = true` (computed daily).
- Forecast Upload screen shows: `.alert-amber` `ML forecasts are stale — last retrain was {N} days ago. The forecaster service may be unhealthy. Falling back to manual forecast. [View Forecaster Health]`.
- GanttView `include_forecast=true` still uses stale forecasts (with warning), not blocked.
- Solver logs `stale_forecast=true` in `input_snapshot`.

---

## 14. Accessibility Notes

- **Gantt chart keyboard navigation**: WO blocks are focusable via Tab key. Arrow keys move focus between blocks on the same line. Enter key opens the Assignment Detail Side Panel. Escape closes it.
- **Gantt chart screen reader**: Each WO block has `aria-label="{WO_CODE} {product_name} on {line} from {start_time} to {end_time} status {status}"`. Changeover blocks: `aria-label="Changeover {N} minutes between {allergen_from} and {allergen_to}"`.
- **Heatmap color**: Changeover matrix cells use both color and text label for risk level. Color is supplemental — the numeric value and BLOCKED text are the primary indicators. This satisfies WCAG 1.4.1 (use of color).
- **Modal focus trap**: All modals trap focus within the modal box. Escape closes. First focusable element receives focus on open.
- **ARIA roles**: The Gantt chart root element has `role="grid"`. Line rows have `role="row"`. WO blocks have `role="gridcell"`. The Pending Review Panel has `role="region"` with `aria-label="Pending scheduler assignments"`.
- **Rescheduling via keyboard**: The Gantt is read-only; there is no drag-drop to provide an alternative for. Rescheduling is exclusively via MODAL-07-03 (keyboard-accessible modal form). Keyboard users use the `[Reschedule WO]` button in the Assignment Detail Side Panel.
- **Form validation**: All required fields marked with `*` in red. Error messages announced via `aria-live="assertive"` region.
- **Contrast**: All badge text colors meet WCAG AA contrast ratio against their background colors (verified in §1.3 token definitions).
- **Auto-refresh**: Auto-refresh indicator has a toggle (keyboard accessible). Screen reader users receive a live region announcement when the Gantt auto-refreshes: `"Schedule refreshed"` in `aria-live="polite"`.

---

## 15. Implementation Notes for Prototype Generator

The following notes are directed at Claude Design / the prototype generator tool.

### 15.1 Component Priorities

Build components in this order for the P1 prototype:

1. **Gantt chart component** (SCR-07-01 Zone C) — most complex, most important for stakeholder review. Suggest SVG or CSS Grid implementation. Use fixed sample data for prototype (5 lines × 7 days × 10–15 WO blocks, 3–4 changeover blocks). Include hour-level zoom toggle. **Gantt is read-only: no drag-drop, no grab cursor. WO blocks are clickable (pointer cursor) to open Assignment Detail Side Panel.**
2. **Assignment Detail Side Panel** (§3.4) — slide-in panel; critical interaction. Wire Approve / Reject / Override / Reschedule WO buttons to state changes.
3. **Run Scheduler Modal** (MODAL-07-01) + progress state (§3.8) — must show queued → running → completed state machine.
4. **Pending Review Panel** (SCR-07-01 Zone D) — approval workflow UX. Show run-group sub-headers.
5. **Changeover Matrix Editor** (SCR-07-02) — heatmap grid; render as HTML table with cell backgrounds. Include `[Request Review]` button on BLOCKED cells.
6. **Override Modal** (MODAL-07-03) — complex form with allergen conflict detection. Include Reschedule variant (§8.3) with FA–line eligibility check.
7. **Run History** (SCR-07-04) + Detail screen (SCR-07-04-DETAIL). Include `run_type` filter (Schedule / Dry Run).
8. **Forecast Upload** (SCR-07-03) — simpler, CSV upload pattern.
9. **What-If Simulation** (SCR-07-05) — P2 placeholder screen only in P1 prototype.

### 15.2 Static Data Seeds for Prototype

**Production lines** [FORZA-CONFIG]:
- `LINE-01` · Fresh Chicken Products · capacity: 800 kg/h
- `LINE-02` · Cooked Products · capacity: 600 kg/h
- `LINE-03` · Breaded Products · capacity: 500 kg/h
- `LINE-04` · Marinated Products · capacity: 450 kg/h
- `LINE-05` · Packaging Only · capacity: 1,200 kg/h

**Allergen groups** (minimal set for prototype):
- NONE (no allergen), CEREAL (gluten), MILK, EGG, PEANUT, MUSTARD

**Changeover matrix seed** (sample values for prototype, not full 16×16):
- CEREAL→MILK: 15 min, cleaning=true, atp=false
- MILK→CEREAL: 20 min, cleaning=true, atp=false
- PEANUT→any: 60 min minimum, cleaning=true, atp=true
- any→PEANUT: 90 min, cleaning=true, atp=true
- MUSTARD→NONE: 45 min, cleaning=true, atp=true

**Sample WO blocks for Gantt**:
- WO-2026-0042 · FA5102 Fresh Chicken Breast 500g · LINE-01 · Shift A Mon · 5.5h · Allergen: CEREAL+MILK · draft
- WO-2026-0043 · FA5110 Cooked Ham Slices · LINE-02 · Shift A Mon · 4h · Allergen: MILK · approved
- WO-2026-0051 · FA5301 Breaded Nuggets · LINE-03 · Shift B Mon · 6h · Allergen: CEREAL+EGG · draft
- WO-2026-0055 · FA5201 Cooked Breast Strips · LINE-02 · Shift A Tue · 3.5h · Allergen: NONE · approved
- WO-2026-0060 · FA5401 Mustard Marinade Mix · LINE-04 · Shift A Mon · 8h · Allergen: MUSTARD · draft

### 15.3 Gantt Implementation Notes

- Render the Gantt in a horizontally scrollable container (`overflow-x: auto`) with sticky left column (line names).
- Day-level view: each day column = 200px wide. Hour-level view: each hour column = 60px wide. Toggle via a button in the Gantt panel top-right corner.
- WO block width = `(duration_hours / hours_per_day) * column_width`. For day view, a 5.5h WO in an 8h shift = `5.5/8 * 200px = 137.5px`.
- Position WO blocks using `position: absolute` within each shift cell, or use CSS Grid fractional units per hour.
- Changeover blocks are inserted between WOs on the same line. Width = `(changeover_minutes / 60) * hour_width`.
- **No drag-drop implementation.** The Gantt container has `user-select: none` but no `draggable` attributes on WO blocks. Do NOT add HTML5 draggable API or DnD libraries. Rescheduling is exclusively via MODAL-07-03 (see §3.6 and §8.3).

### 15.4 State Machine Wiring

Wire these state transitions in the prototype:

1. `[Run Scheduler]` button → show MODAL-07-01 → submit → show running banner → after 3s (simulated) → show completed banner + expand Pending Review Panel → show draft assignments on Gantt as semi-transparent.
2. `Approve` in Pending Review Panel row → assignment status changes to `approved` → Gantt block becomes full-opacity → approved_by + timestamp shown in side panel.
3. `Reject` → assignment removed from Gantt, moved to "unscheduled" count in KPI strip.
4. `[Override ...]` → open MODAL-07-03 → on confirm → assignment badge changes to `.badge-amber` `Overridden` in Gantt.
5. `[Approve All]` → confirmation modal (showing run-group breakdown) → all pending → approved → KPI strip recalculates.
6. Click WO block on Gantt → open Assignment Detail Side Panel (no drag interaction).
7. `[Reschedule WO]` in side panel → open MODAL-07-03 in Reschedule variant (§8.3) → on confirm → assignment badge changes to `.badge-amber` `Overridden`.

### 15.5 Responsive Behavior

07-EXT screens are designed for desktop browser only (1280px minimum width). The Planner Advanced does not use the scanner PWA. No mobile-responsive layout is required for this module. Tablet (1024px) layout may collapse KPI strip to 2×3 grid.

### 15.6 Feature Flag Gating

The prototype must implement these flag-gated UI states:

| Flag | Off state | On state |
|---|---|---|
| `planning.allergen_optimizer.v2.enabled` | v2 banner not shown on sequencing; optimization KPIs absent | v2 banner + changeover cost reduction card shown |
| `scheduler.what_if.enabled` | SCR-07-05 shows P2 placeholder overlay | SCR-07-05 fully interactive |
| `scheduler.horizon_14d.enabled` | 14-day option in Run Scheduler Modal is disabled | 14-day option selectable |
| `scheduler.prophet.enabled` | Forecaster Health card absent; manual-only forecast UI | Full P2 Prophet UI shown |

---

## 16. Resolved Decisions

All P1 open questions resolved 2026-04-21. No blockers remain.

| ID | Original Question | Resolution | Decision Date | Status |
|---|---|---|---|---|
| OQ-EXT-01 | Exact penalty weight values (high=2.0, medium=1.0, low=0.5) — sufficient for prototype/UAT? | Seed values accepted for prototype and UAT. Calibration after 30-day P1 run. | 2026-04-21 | CLOSED |
| OQ-EXT-02 | Operator shift preference in GanttView — overlay? GDPR consent? | Remains P2. No overlay in P1 GanttView. | 2026-04-21 | CLOSED (deferred P2) |
| OQ-EXT-03 | What-if simulation baseline scope — in-flight WOs included? | Remains P2; no decision needed now. | 2026-04-21 | CLOSED (deferred P2) |
| OQ-EXT-04 | Blocked cells in changeover matrix — allow note + admin review request? | Planner CAN add a note/justification and request admin review via `[Request Review]` button on blocked cells. Creates `matrix_review_request` record (stub — PRD to define table). See §4.2. | 2026-04-21 | CLOSED |
| OQ-EXT-05 | GanttView drag-drop — entire horizon or affected cluster re-solve? | **DESCOPED.** Gantt is read-only visualization. No drag-drop in P1. Rescheduling via `[Re-run Scheduler]` (global) or MODAL-07-03 Assignment Override (per-WO via `[Reschedule WO]` in side panel). Rationale: 1-FA-to-1-line dominance; FA–line eligibility via `fa_line_compatibility` (03-TECHNICAL) has low UX value as drag target. See §3.5–§3.6 and §8.3. | 2026-04-21 | CLOSED |
| OQ-EXT-06 | `[Approve All]` — most recent run only, or all completed runs? | `[Approve All]` approves assignments from ALL completed runs. UI shows run grouping with sub-headers per run. See §3.1 Zone D. | 2026-04-21 | CLOSED |
| OQ-EXT-07 | Disposition bridge (MODAL-07-04) timeout — can Planner extend per LP? | Planner CAN extend per LP via inline `[Extend 1h]` / `[Extend 4h]` buttons with reason required. Default 2h stays. See §9.1. | 2026-04-21 | CLOSED |
| OQ-EXT-08 | Changeover matrix — dual sign-off required? | Single Planner Advanced publish (no dual sign-off). | 2026-04-21 | CLOSED |
| OQ-EXT-09 | SCR-07-06 dry-run persistence model — new `scheduler_run` record or separate store? | Creates row in `scheduler_runs` with `run_type='dry_run'`, `status='preview'`, auto-expires 24h. `[Commit Preview]` converts to regular run; `[Discard]` marks as discarded. Visible in Run History with `dry_run` filter. See §10.2 and §6.1. | 2026-04-21 | CLOSED |
| OQ-EXT-10 | KPI strip "Total Changeover" — approved schedule or draft solver run? | Sum from approved schedule (not draft solver run). See §3.1 Zone B. | 2026-04-21 | CLOSED |
