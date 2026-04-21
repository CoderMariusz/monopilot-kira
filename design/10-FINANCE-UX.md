# 10-FINANCE — UX Specification (for prototype generation)

**Version:** 1.0  
**Date:** 2026-04-20  
**Status:** Final (Phase C4 Sesja 2 deliverable — feeds Claude Design prototype generation)  
**Source PRD:** 10-FINANCE-PRD v3.0 (authoritative — overrides archive wireframes where they conflict)  
**Primary currency:** GBP (Forza UK operation, parent IPL LIMITED group)

---

## 0. Module Overview

Module 10-FINANCE is the central cost layer of Monopilot MES. It covers production costing (material + labor + overhead), yield variance per WO, waste cost allocation, BOM cost rollup (DAG cascade-aware), FIFO and WAC inventory valuation in parallel, standard costs with approval workflow, cost_per_kg lifecycle management, and INTEGRATIONS stage 5 (D365 F&O daily consolidated journal posting).

**P1 scope (build now):** Standard cost definition + approval, WO actual cost summary, inventory valuation, variance dashboard, D365 export queue + DLQ, GL account mappings admin, exchange rates.

**P2 scope (placeholder screens included with "Coming in Phase 2" banners):** Budget & forecast, margin analysis, savings calculator, full variance decomposition MPV/MQV/LRV/LEV, multi-currency operations, complaint cost allocation, AR/AP bridge, landed cost variance.

**Personas:** Finance Manager (primary operator — create, approve, export), Finance Viewer (read-only dashboards + CSV), Production Manager (WO cost view + variance notes on own line), Plant Director (KPI read), Admin (GL mappings, currency setup), Auditor Read-Only (7y audit trail export), Integration Ops (DLQ monitoring, D365 health).

**Integrations consumed:** 03-TECHNICAL (items.cost_per_kg source, BOM co-products allocation_pct), 05-WAREHOUSE (LP cost snapshot, FIFO layer lifecycle on consume/receipt), 08-PRODUCTION (wo_outputs, wo_waste_log, wo_executions.status COMPLETED trigger), 04-PLANNING (wo_dependencies DAG for recursive cascade rollup), 09-QUALITY (ncr_reports yield_issue monthly aggregation), 02-SETTINGS (D365 Constants, DSL rules registry, currencies, tax_codes).

**Produced for:** 12-REPORTING (cost KPIs, variance trends, inventory valuation reports), D365 F&O (daily general journal via DMF entity GeneralJournalLineEntity, stage 5 outbox).

---

## 1. Design System (Inherited) — Finance Palette Extension

### 1.1 Base tokens (from MONOPILOT-SITEMAP.html)

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active sidebar, links |
| `--green` | `#22c55e` | Success states, favorable variance |
| `--amber` | `#f59e0b` | Warnings, moderate variance |
| `--red` | `#ef4444` | Errors, unfavorable variance, critical alerts |
| `--info` | `#3b82f6` | Informational alerts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Sidebar background |
| `--card` | `#fff` | Card/panel background |
| `--text` | `#1e293b` | Primary text |
| `--muted` | `#64748b` | Secondary text, labels, timestamps |
| `--border` | `#e2e8f0` | Card borders, dividers |
| `--radius` | `6px` | Card border radius |

Font: Inter, system-ui, -apple-system, sans-serif. Base size: 14px. Line-height: 1.4.

### 1.2 Finance-specific palette additions

| Token name | Hex | Usage |
|---|---|---|
| `--finance-gain` | `#22c55e` (reuse `--green`) | Favorable variance, cost saving, under budget |
| `--finance-loss` | `#ef4444` (reuse `--red`) | Unfavorable variance, overspend, over budget |
| `--finance-neutral` | `#64748b` (reuse `--muted`) | Zero variance, no change |
| `--finance-warning-bg` | `#fffbeb` | Warning zone (5-10% variance) background |
| `--finance-critical-bg` | `#fef2f2` | Critical zone (>10% variance) background |
| `--finance-gain-bg` | `#f0fdf4` | Favorable badge background |

### 1.3 Variance badge system

Every variance value displayed in the system must carry one of these three badges. Variance sign convention: **positive value = unfavorable (actual > standard = over budget)**; **negative value = favorable (actual < standard = saving)**. Formula: `variance = actual_cost - standard_cost`. A favorable material usage variance means `(standard_qty - actual_qty) × std_price > 0`.

| Badge class | Condition | Background | Text color | Label |
|---|---|---|---|---|
| `badge-favorable` | variance < 0 | `#dcfce7` | `#166534` | "Favorable" |
| `badge-unfavorable` | variance > 0 | `#fee2e2` | `#991b1b` | "Unfavorable" |
| `badge-neutral` | variance = 0 | `#f1f5f9` | `#475569` | "On Target" |
| `badge-warning` | 0 < variance% < 10% | `#fef3c7` | `#92400e` | "Warning" |
| `badge-critical` | variance% >= 10% | `#fee2e2` | `#991b1b` | "Critical" |

### 1.4 KPI card variants (finance)

Finance KPI cards use the base `.kpi` class from the design system with these bottom-border color rules:

- Blue border (`--blue`): neutral metrics (total cost, WO count, inventory value)
- Green border (`--green`): favorable trend metrics
- Amber border (`--amber`): warning metrics (variance approaching threshold)
- Red border (`--red`): critical metrics (variance breach, DLQ open, uncosted WOs)

### 1.5 Number formatting

All monetary amounts: **en-GB locale** (Forza UK). Thousands separator: comma `1,234,567.89`. Currency: ISO 4217 code displayed inline, e.g. `£ 12,345.00 GBP`. Percentages: one decimal place `+5.1%`. Large numbers on KPI cards: abbreviated with suffix `£ 245.7K` or `£ 1.23M` when space is constrained; full value shown in tooltip on hover.

---

## 2. Information Architecture

### 2.1 Sidebar entry

The Finance module appears in the sidebar under the **PREMIUM** group. Entry label: **Finance**. Icon: currency/coin symbol. Active state: left blue border `--blue`, background `#1e3a5f`, text white. Clicking the entry expands an inner sub-navigation with the tabs below.

### 2.2 Inner navigation tabs / sub-nav

| Nav label | Route | P1/P2 |
|---|---|---|
| Dashboard | `/finance` | P1 |
| Standard Costs | `/finance/standard-costs` | P1 |
| WO Costs | `/finance/wos` | P1 |
| BOM Costing | `/finance/bom-costing` | P2 (placeholder) |
| Simulation | `/finance/simulation` | P2 (placeholder) |
| Inventory Valuation | `/finance/inventory-valuation` | P1 |
| Variance — Material | `/finance/variance/material` | P1 |
| Variance — Labor | `/finance/variance/labor` | P1 |
| Variance — Real-time | `/finance/variance/realtime` | P2 (placeholder) |
| Variance — Drill-down | `/finance/variance/drill-down` | P1 |
| Margin Analysis | `/finance/margin` | P2 (placeholder) |
| Budgets | `/finance/budgets` | P2 (placeholder) |
| Cost Centers | `/finance/budgets/:cost-center` | P2 (placeholder) |
| FX Rates | `/finance/fx` | P1 |
| Reports | `/finance/reports` | P1 |
| D365 Integration | `/finance/d365` | P1 |
| Settings | `/finance/settings` | P1 |

P2 placeholder screens render a "Coming in Phase 2" banner panel in the content area with a brief description and an estimated release note. Navigation entries for P2 screens are visible but rendered with a `badge-gray` "Phase 2" pill next to the label.

### 2.3 Full route map

```
/finance                               FIN-001 Finance Dashboard
/finance/standard-costs                FIN-002 Standard Cost List
/finance/standard-costs/:id            FIN-002b Standard Cost Detail (drawer/modal)
/finance/wos                           FIN-003a WO Costs List
/finance/wos/:id/cost                  FIN-003 WO Cost Summary Card
/finance/bom-costing                   FIN-004 BOM Costing (P2 placeholder)
/finance/bom-costing/:id               FIN-004b BOM Cost Detail (P2 placeholder)
/finance/simulation                    FIN-012 BOM Cost Simulation (P2 placeholder)
/finance/inventory-valuation           FIN-005 Inventory Valuation Report
/finance/variance/material             FIN-007 Material Variance Report
/finance/variance/labor                FIN-008 Labor Variance Report
/finance/variance/realtime             FIN-009 Real-time Variance Dashboard (P2 placeholder)
/finance/variance/drill-down           FIN-010 Variance Drill-down
/finance/margin                        FIN-013 Margin Analysis (P2 placeholder)
/finance/budgets                       FIN-015 Budget Management (P2 placeholder)
/finance/budgets/:cost-center          FIN-014 Cost Center Budget (P2 placeholder)
/finance/fx                            FIN-006 Currency & FX Rates
/finance/reports                       FIN-011 Cost Reporting Suite
/finance/d365                          FIN-016 D365 Integration (replaces Comarch)
/finance/settings                      Finance Settings
```

### 2.4 Permissions matrix

| Action | finance_manager | finance_viewer | prod_manager | plant_director | admin / integration_ops | owner | auditor_readonly |
|---|---|---|---|---|---|---|---|
| View dashboard | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Create standard cost draft | Yes | No | No | No | No | Yes | No |
| Approve standard cost (PIN) | Yes | No | No | No | No | Yes | No |
| View WO cost summary | Yes | Yes | Yes (own line) | Yes | Yes | Yes | Yes |
| Add variance note | Yes | No | Yes (own WO) | No | No | Yes | No |
| View inventory valuation | Yes | Yes | No | Yes | Yes | Yes | Yes |
| Admin cost centers / currencies | Yes | No | No | No | Yes | Yes | No |
| DLQ replay / D365 ops | Yes | No | No | No | Yes (integration_ops) | Yes | No |
| Manual exchange rate entry | Yes | No | No | No | Yes | Yes | No |
| Export cost audit trail (7y) | Yes | Yes | No | No | Yes | Yes | Yes |
| View finance settings | Yes | No | No | No | Yes | Yes | No |
| Edit finance settings | Yes | No | No | No | Yes | Yes | No |

Permission-denied state: content area replaced with a centered panel showing a lock icon, the message "You do not have permission to view this page", the user's current role, and a link to contact their Finance Manager.

---

## 3. Screens

---

### FIN-001 — Finance Dashboard

**Route:** `/finance`  
**Personas:** Finance Manager (primary), Plant Director (read), Finance Viewer (read)  
**Purpose:** Single-pane command center for cost health. Surfaces MTD production cost, variance aggregate, inventory value, DLQ alert, yield loss, and a 6-month cost trend. All KPIs are auto-refreshing (5-minute cache for cost KPIs, 1-minute for DLQ and uncosted WOs).

#### Layout description

The page uses the standard shell: fixed 220px dark sidebar on the left, main content area with 40px top padding and 20px horizontal padding, background `--bg` (#f8fafc).

The **page header** is a single row spanning full content width. Left: page title "Finance Dashboard" (20px, font-weight 700) with breadcrumb "Finance / Dashboard" below it (12px, `--muted`). Right: two buttons — "Export Dashboard" (`.btn-secondary`) and a timestamp label "Last updated: just now" in 11px `--muted` text.

Directly below the header: a horizontal **KPI row** using CSS grid with six equal columns (`repeat(6, 1fr)`, 12px gap). Each KPI is a `.kpi` card.

| Slot | Label | Value example | Change line | Border color |
|---|---|---|---|---|
| 1 | Total Production Cost MTD | £ 245,680.50 GBP | ↑ 5.2% vs last month | blue |
| 2 | Cost Variance MTD | £ 12,340.00 GBP | Unfavorable +5.1% | red |
| 3 | Inventory Value | £ 1,234,500.00 GBP | Updated: 10 min ago | blue |
| 4 | Uncosted WOs | 3 | Pending close | amber |
| 5 | D365 DLQ Open | 0 | All clear | green (if 0) / red (if >0) |
| 6 | Yield Loss MTD | £ 4,820.00 GBP | 09-QA yield issues | amber |

Below the KPI row: a **two-column grid** (`.grid-2`, 12px gap) occupying the next section.

Left column: **Variance Alerts panel** (`.card`). Title "Variance Alerts" with a count badge in `badge-red` or `badge-amber`. Panel body lists up to 5 most recent active variance alerts. Each alert row contains: severity badge (CRITICAL in `badge-red` or WARNING in `badge-amber`), variance type label (e.g. "Material Price"), WO number as a blue link (navigates to `/finance/wos/:id/cost`), variance amount in red `£ +1,250.00`, percentage `+15.2%`, product name in `--muted`. Below the alert body: a "View All Alerts" text link.

Right column: **Cost Trend chart** (`.card`). Title "Cost Trend — 6 Months". A multi-line chart with three series: Material (blue), Labor (amber), Overhead (muted). X-axis: 6 monthly period labels. Y-axis: GBP values. Tooltip on hover: period name + three values. Legend below chart.

Below the two-column section: another **two-column grid**.

Left: **Top Variance Contributors** (`.card`). Title "Top Variance Contributors (MTD)". A compact table with columns: Rank (1–10), Product Name, Variance GBP (red if positive), % of Total Variance. Paginated to 10 rows. "View Full Report" text link below table.

Right: **Cost Breakdown** (`.card`). Title "Cost Breakdown MTD". Three horizontal stacked progress bars: Material (%), Labor (%), Overhead (%). Each bar: colored fill (blue/amber/muted), label left, percentage and GBP value right.

At the bottom: a **single-column** row — **Monthly Yield Loss** (`.card`). Title "Monthly Yield Loss (09-QA NCR yield issues)". A small data table: Month, Product, Incidents, Loss Qty (kg), Loss Value GBP. Sourced from `ncr_reports` where `ncr_type='yield_issue'`. FX conversion note: "EUR claim values converted at daily GBP/EUR rate." "View QA Module" link.

#### Fields and data

KPI cards display monetary values with `£` prefix, GBP suffix, thousands separator, 2 decimal places. Change lines use `↑` (green) for favorable and `↑` (red) for unfavorable (or `↓` inverted). Variance KPI uses `badge-unfavorable` if positive, `badge-favorable` if negative.

#### Primary actions

"Export Dashboard" — opens the Export Report modal (format PDF or CSV, date range). "View All Alerts" — navigates to `/finance/variance/drill-down`. Clicking a WO number — navigates to `/finance/wos/:id/cost`.

#### States

**Loading:** All 6 KPI cards render skeleton shimmer rectangles (the same card shape, `--border` background with a lighter animated sweep). Chart area shows a skeleton rectangle. Alert panel shows 3 skeleton rows. Page text: "Loading Finance Dashboard…" appears below KPI row in `--muted` 12px.

**Empty (no WOs completed yet):** After loading, KPI values are all £ 0.00. A centered informational panel replaces the lower sections with a calculator icon (48px), heading "No Cost Data Available" (16px, font-weight 700), body text "Start tracking production costs by completing work orders with material consumption and labor time entries." Three quick-link buttons: "Define Standard Costs" (`.btn-secondary`, routes to `/finance/standard-costs`), "Configure Cost Centers" (routes to `/finance/settings`), "Set Up D365 Integration" (routes to `/finance/d365`).

**Error:** Full content area replaced with a warning icon (48px, `--red`), heading "Failed to Load Finance Dashboard", body "Unable to retrieve cost data. Please check your connection and try again.", error code `FINANCE_DASHBOARD_FETCH_FAILED` in monospace 11px gray. Two buttons: "Retry" (`.btn-primary`) and "Contact Support" (`.btn-secondary`). Quick links below: "View Cached Standard Costs" and "Export Last Report" remain clickable.

**Permission denied:** Lock icon, message, role display, link to Finance Manager.

#### Microcopy

- KPI label "Uncosted WOs": tooltip on hover "Work orders completed but cost summary not yet calculated. Click to view list."
- KPI label "D365 DLQ Open": tooltip "D365 journal lines that failed to post and require manual resolution."
- Variance sign convention note below the Variance Alerts panel header (11px, `--muted`): "Positive variance = unfavorable (actual > standard). Negative = favorable."
- Yield Loss note: "EUR values converted using exchange rate effective on incident date."

---

### FIN-002 — Standard Cost Definition

**Route:** `/finance/standard-costs`  
**Personas:** Finance Manager (create, approve), Finance Viewer (read, export), Admin (read)  
**Purpose:** Full lifecycle management of per-item standard costs: draft → pending → approved → superseded → retired. Displays the current approved cost for every item, with version history and a bulk import option.

#### Layout description

Page header: title "Standard Costs" with breadcrumb. Right: "Import CSV" (`.btn-secondary`) and "+ New Standard Cost" (`.btn-primary`).

Below header: a **filter bar** (`.card`, no bottom margin). Row 1: search input (full width on mobile, 280px on desktop) placeholder "Search by product code or name…", Status dropdown (All / Draft / Pending / Approved / Active / Superseded / Retired), Item Type dropdown (All / RM / Intermediate / FA / Co-product / By-product). Row 2: Effective Date From (date input), Effective Date To (date input), Cost Basis dropdown (All / Quoted / Historical / Calculated / Imported D365), "Clear Filters" text link.

Below filter bar: a **summary bar** in 12px `--muted` text: "156 records — 142 Active / 8 Pending / 6 Draft". And a bulk action bar (only visible when rows selected): "Bulk Approve (N)" button (`.btn-primary`), "Export Selected" (`.btn-secondary`), "Delete Selected" (`.btn-danger`).

Main content: a **data table** (`.card`, no padding). Columns:

| Column | Type | Sortable | Example |
|---|---|---|---|
| Checkbox | Selection | No | — |
| Item Code | text | Yes | FG-NUGGET-1K |
| Item Name | text | Yes | Chicken Nuggets 1 kg |
| Item Type | badge | Yes | FA (blue), RM (gray) |
| Material Cost | currency | Yes | £ 2.50 GBP |
| Labor Cost | currency | Yes | £ 0.40 GBP |
| Overhead Cost | currency | Yes | £ 0.60 GBP |
| Total Cost | currency, bold | Yes | £ 3.50 GBP |
| UOM | text | No | KG |
| Effective From | date | Yes | 2025-01-01 |
| Effective To | date | Yes | — (open) |
| Status | badge | Yes | `badge-green` Active / `badge-blue` Approved / `badge-gray` Draft / `badge-amber` Pending |
| Actions | kebab menu | No | Edit / View History / Approve / Supersede / Retire |

Row expansion: clicking the row expands an inline sub-row showing: "Approved by: Sarah McKenzie on 2025-01-01 10:32 UTC | Signature hash: sha256:a1b2c3… | Basis: quoted | Notes: Q1 2025 initial cost".

Table footer: pagination "Showing 1–25 of 156" with Previous/Next buttons.

#### Modals triggered from this screen

- **Standard Cost Create/Edit Modal** — triggered by "+ New Standard Cost" button or Edit in kebab menu (draft only)
- **Approve Standard Cost Modal** — triggered by Approve in kebab
- **Cost History Modal** — triggered by "View History" in kebab
- **Supersede Standard Cost Modal** — triggered by Supersede in kebab (active records)
- **Bulk Import Modal** — triggered by "Import CSV"
- **Delete Confirmation Modal** — triggered by Delete in kebab (draft only)

#### States

**Loading:** 5 skeleton rows in the table, skeleton filter bar. Text "Loading standard costs…" in `--muted`.

**Empty:** Price tag icon (48px), heading "No Standard Costs Defined", body "Standard costs establish the expected cost baseline for all production items, enabling variance tracking." CTAs: "+ Create First Standard Cost" (`.btn-primary`), "Import Standard Costs from CSV" (`.btn-secondary`). Tip text: "Tip: Start with your top finished-goods items to activate variance tracking immediately."

**Error:** Warning icon, "Failed to Load Standard Costs", retry button.

**Filtered-empty:** No icon. Text "No standard costs match the current filters." "Clear Filters" link.

#### Microcopy

- Table column "Effective To" renders "Open" (green text) when NULL.
- Draft rows have a yellow left border (2px solid `--amber`) to visually distinguish.
- Approved-but-not-yet-effective rows: effective_from is in the future; Status badge shows "Approved — Effective 2025-03-01".
- 21 CFR note beneath the table in 11px `--muted`: "Approved standard costs are immutable. Use Supersede to replace an active cost record."

---

### FIN-003 — WO Cost Summary Card

**Routes:** `/finance/wos` (list), `/finance/wos/:id/cost` (detail card)  
**Personas:** Finance Manager, Finance Viewer, Production Manager (own line)  
**Purpose:** Per-WO cost summary: actual material + labor + overhead + waste vs standard, total variance color-coded, cascade breakdown from child WOs, co-product allocation, unit cost actual vs standard.

#### FIN-003a — WO Costs List (route `/finance/wos`)

Page header: "WO Costs" breadcrumb. Right: "Export CSV" (`.btn-secondary`).

Filter bar: WO number search, Date Range (From/To), Status dropdown (All / Open / Closed / Posted / Reversed), Variance filter (All / Favorable / Unfavorable / >5% / >10%), Cost Center dropdown, Production Line dropdown.

Summary bar: "247 WOs — 12 Open / 198 Closed / 37 Posted".

Data table columns:

| Column | Type | Example |
|---|---|---|
| WO Number | link | WO-2026-0042 |
| Product | text | Chicken Nuggets 1 kg |
| Production Line | text | Line 1 |
| Cost Center | text | FProd01 |
| Standard Cost | currency | £ 350.00 GBP |
| Actual Cost | currency | £ 425.50 GBP |
| Total Variance | currency + badge | £ +75.50 `badge-unfavorable` |
| Variance % | percentage + color | +21.6% (red) |
| Unit Cost Actual | currency | £ 5.01/kg |
| Status | badge | Closed / Open / Posted |
| Costing Date | date | 2026-04-20 |
| D365 Journal | text | MONO-PROD-20260420 or — |
| Actions | kebab | View Cost / Recalculate / Add Note |

Clicking WO Number navigates to `/finance/wos/:id/cost`.

#### FIN-003b — WO Cost Summary Detail (route `/finance/wos/:id/cost`)

The detail view is a full-page layout. Left panel (40% width): **WO Information card** — WO number (heading), product name, planned qty (kg), produced qty (kg), yield %, production line, cost center, WO status badge, start date, target end date, actual end date. Below: a "Back to WO" link to `/production/work-orders/:id`.

Right panel (60% width): **Cost Summary card** — this is the primary component.

**Total Cost section** (`.card` with colored left border based on variance status):

- Large value: actual total cost `£ 425.50 GBP` (24px, font-weight 700)
- Row: "Standard: £ 350.00 GBP" in `--muted`
- Row: "Variance: £ +75.50 GBP (+21.6%)" — value in `--red` if unfavorable, `--green` if favorable, plus variance badge
- Status badge: ON TRACK (green, ≤5%), WARNING (amber, 5–10%), OVER BUDGET (red, >10%), PENDING (gray, no production yet), FAVORABLE (green, negative variance)
- "Unit Cost Actual: £ 5.01/kg | Standard: £ 4.12/kg | Produced: 85 kg" in 12px below
- "Last calculated: 2026-04-20 14:32 UTC" timestamp in 11px `--muted`
- Buttons row: "Recalculate" (`.btn-secondary`, triggers API `POST /api/finance/work-order-costs/:woId/recalculate`), "Export" (`.btn-secondary`), "Add Note" (`.btn-secondary`, opens Variance Note modal)

**Cost Breakdown section** — three horizontal progress bars:

Material: bar fill (blue, proportional), label "Material", GBP value right-aligned, percentage right-aligned. Repeat for Labor (amber) and Overhead (muted). Waste cost row below if waste_cost_actual > 0 (red bar). Total line at bottom.

**Variance Breakdown section** — three expandable rows:

Material Variance row: chevron toggle, label "Material Variance", `£ +45.50 GBP` in `--red`, badge. Expanded: sub-rows "Price component: £ +20.00 (P2 — MPV decomposition coming)" and "Usage component: £ +25.50 (P2 — MQV decomposition coming)" in `--muted`.

Labor Variance row: same pattern. Labor Rate and Efficiency breakdown — P2 note.

Overhead Variance row: same pattern.

Waste Cost row (only if waste > 0): "Waste Cost: £ 12.00 GBP — 3 waste log entries" with link "View Waste Log" navigating to the WO waste log in 08-PRODUCTION.

**Cascade section** (only if WO has child WOs — cascade_total_actual differs from total_cost_actual):

Title "Cascade Cost (includes child WOs)". Table: WO Number, Role (Parent/Child), Own Cost GBP, Cascade Contribution GBP. Footer: "Cascade Total: £ 892.40 GBP". Note: "Cascade computed via recursive CTE DAG rollup from 04-PLANNING wo_dependencies."

**Co-product Allocation section** (only if BOM has co-products):

Title "Co-product Cost Allocation". Table: Output Item, Output Type (Primary/Co-product/By-product), Allocation %, Allocated Cost GBP. Formula note in 11px `--muted`: "Primary receives (1 - Σco_pct) × total_cost. Co-products receive allocation_pct × total_cost per BOM definition."

**D365 posting status** (at bottom of card):

If `status = 'posted'`: green badge "Posted to D365", journal ID link. If `status = 'closed'` and not yet posted: amber badge "Awaiting D365 batch consolidation — next run at 23:00 UTC". If `status = 'open'`: gray badge "WO not yet closed — costs accumulating."

#### States

**Loading:** Skeleton shimmer for all card sections. "Calculating work order costs…" text.

**Empty (no consumption yet):** Calculator icon, "No Costs Recorded Yet", body text "Costs appear automatically as materials are consumed and labor is recorded.", quick actions "Record Material Consumption" (link to production WO execution page), "Log Labor Time" (same). Status "Pending".

**Error:** Warning icon, "Failed to load WO costs", [Retry], last known values shown if cached.

**WO open / still accumulating:** An info banner (`alert-blue`) at top of cost card: "This WO is still in progress. Costs are being updated in real time as consumption and labor are recorded. Final costs will be locked when the WO is completed."

#### Microcopy

- Variance sign note (tooltip on variance row): "Positive = unfavorable (actual > standard). Formula: actual_cost − standard_cost."
- Recalculate button tooltip: "Recalculates the recursive cascade rollup and all variance figures. Use after manual adjustments."
- D365 note: "Costs are posted to D365 F&O via a daily consolidated journal batch at 23:00 UTC."

---

### FIN-004 — BOM Costing Page (P2 Placeholder)

**Route:** `/finance/bom-costing`  
**Status:** Phase 2 — screen renders a "Coming in Phase 2" banner.

The banner card contains: heading "BOM Costing — Phase 2 Feature", body "Roll-up BOM cost: item × BOM version × cost_per_kg → FA unit cost. Allocation across co-products. Version comparison. Available in Phase 2 (EPIC 10-G roadmap).", a "View BOM Structure Now" button routing to `/technical/boms` (03-TECHNICAL module available today).

---

### FIN-005 — Inventory Valuation Report

**Route:** `/finance/inventory-valuation`  
**Personas:** Finance Manager, Finance Viewer, Plant Director  
**Purpose:** Snapshot inventory value using FIFO or WAC method, selectable per report run. Filterable by item, location, item type. Per-item FIFO layer drill-down. WAC running average display. Aging buckets.

#### Layout description

Page header: "Inventory Valuation" breadcrumb. Right: "Recalculate" (`.btn-secondary`) and "Export" (`.btn-secondary`).

**Method selector bar** (`.card`): two large toggle buttons side-by-side: "FIFO (First-In, First-Out)" and "Weighted Average Cost (WAC)". Active selection has `--blue` background and white text. Below the toggles: "Valuation Date" date input (defaults to today). "Apply" button (`.btn-primary`). Below in 12px `--muted`: "Default method: FIFO (per finance_settings.default_valuation_method)."

**Summary row** — two KPI cards side by side:

Left card: "Total Inventory Value" — `£ 1,234,567.89 GBP`, sub-line "856 active items | Method: FIFO | As of 2026-04-20". Bottom border: blue.

Right card: "Value Distribution" — four horizontal mini-bars: Raw Materials 45% (£ 555,555), Packaging 15% (£ 185,185), WIP 25% (£ 308,642), Finished Goods 15% (£ 185,185). Each bar is a one-line item with color dot, label, percentage, GBP value.

**Filter bar** (`.card`): search input "Search by product code or name…", Category dropdown (All / RM / Intermediate / FA / Packaging / By-product), Location dropdown (All Warehouses / per warehouse from 05-WH), Aging dropdown (All / 0–30d / 30–60d / 60–90d / 90d+), Value Range Min/Max (currency inputs), "Apply Filters" button, "Clear" link.

**Inventory valuation table** (`.card`, no padding):

| Column | Type | Example |
|---|---|---|
| Item Code | text | FG-NUGGET-1K |
| Item Name | text | Chicken Nuggets 1 kg |
| Item Type | badge | FA |
| Qty on Hand | numeric, 3dp | 1,500.000 kg |
| UOM | text | KG |
| Avg Unit Cost (FIFO or WAC) | currency, 4dp | £ 3.5000/kg |
| Total Value | currency, 2dp | £ 5,250.00 |
| FIFO Layers | integer link | 4 (opens FIFO drill-down modal) |
| Aging | badge | 0–30d (green), 30–60d (amber), 90d+ (red) |
| Last Movement | date | 2026-04-19 |
| Actions | kebab | View Layers / View WAC / Export Item |

Table footer: "Page total: £ 24,530.00 | All pages total: £ 1,234,567.89 GBP". Pagination: 25 rows per page, page X of N, Previous/Next.

**FIFO Layer Drill-down** is accessed via the "Layers" link and opens the FIFO Layers Modal (defined in Section 4).

**WAC State** — clicking "View WAC" in the kebab opens a read-only panel: "Item WAC State: avg_cost = £ 3.4850/kg, total_qty = 1,500 kg, total_value = £ 5,227.50 GBP, last_updated_at = 2026-04-20 10:15 UTC."

#### States

**Loading:** Skeleton for KPI cards and table.

**Empty:** Balance sheet icon, "No inventory value data available. Ensure items have been received and cost layers created." Link: "View Warehouse LP List" to `/warehouse/license-plates`.

**Error:** Warning icon, retry button.

**Method switch (loading):** When user changes FIFO ↔ WAC and clicks Apply, the table shows a loading skeleton while recalculating. Toast: "Recalculating inventory value using WAC method…" appears at top-right.

---

### FIN-006 — Currency & FX Rates

**Route:** `/finance/fx`  
**Personas:** Finance Manager (edit), Admin (edit), Finance Viewer (read)  
**Purpose:** GBP is base currency. This screen manages currencies list and exchange rates with effective-date history. Manual entry P1 (API sync P2).

#### Layout description

Page header: "Currencies & Exchange Rates" breadcrumb. Right: "+ Add Currency" (`.btn-primary`).

**Base Currency card** (`.card`): "Base Currency: GBP — British Pound Sterling". Badge `badge-blue` "Base". Note: "All manufacturing costs are stored and reported in GBP. Multi-currency support is available in Phase 2." "Change Base Currency" link — opens Confirmation modal (destructive action, requires PIN).

**Active Currencies table** (`.card`):

| Column | Type | Example |
|---|---|---|
| ISO Code | text, bold | GBP |
| Name | text | British Pound Sterling |
| Symbol | text | £ |
| Exchange Rate (to GBP) | numeric, 6dp | 1.000000 |
| Effective Date | date | — |
| Source | badge | `badge-gray` Base / `badge-blue` Manual / `badge-green` API |
| Rate Age | text, colored | — (base) / 2 days (amber if >5d, red if >7d per V-FIN-SETUP-03) |
| Status | badge | `badge-blue` Base / `badge-green` Active / `badge-gray` Inactive |
| Actions | buttons | Edit Rate / View History / Deactivate |

Example data rows: GBP (Base, 1.000000), EUR (Active, 0.850000, Manual, 1 day ago), USD (Active, 0.790000, Manual, 1 day ago).

**Update Exchange Rate form** (`.card`, visible inline below table): Currency selector dropdown, "Current Rate: £ X.XXXXXX GBP", "New Rate" numeric input (6 decimal places), "Effective Date" date input (defaults to today), Source radio (Manual / API Pull), Override Reason textarea (required if changing existing rate — audit field). Buttons: "Cancel" (`.btn-secondary`), "Update Rate" (`.btn-primary`).

**Exchange Rate History table** (`.card`, right column or below): Currency selector dropdown to pick which currency to view. Table columns: Effective Date (desc), Rate (6dp), Source badge, Updated By user name, Override Reason (if manual). Pagination: 20 rows per page. "Export History" button.

**Rate Trend chart** (`.card`): 30-day line chart with up to 3 currency series (EUR, USD, plus any other active). X-axis: dates. Y-axis: rate to GBP. Hover tooltip: date + values.

#### States

**Loading:** Skeleton table rows.

**Empty:** "No additional currencies configured. GBP is the base currency. Add currencies to support multi-currency purchase orders (Phase 2)."

**Error:** Warning icon, retry.

**Rate stale warning** (inline, per row): When `rate_age > 7 days` (V-FIN-SETUP-03), the Rate Age cell shows red text and an amber alert banner appears above the table: "Exchange rate for EUR has not been updated in 8 days. Variance calculations may be inaccurate. Please update the rate or configure automated rate sync (Phase 2)."

#### Microcopy

- Edit Rate override reason field: required when modifying an existing rate. Label: "Reason for override (audit log)". Placeholder: "e.g. Monthly rate adjustment per treasury team."
- Effective Date tooltip: "The date from which this rate applies. Historical transactions are not recalculated."

---

### FIN-007 — Material Variance Report

**Route:** `/finance/variance/material`  
**Personas:** Finance Manager, Finance Viewer, Production Manager  
**Purpose:** Period-level view of material cost variances per item. Shows price variance (actual purchase price vs standard price) and usage variance (actual quantity consumed vs standard quantity). Links to source POs and WOs for drill-down.

#### Layout description

Page header: "Material Variance Report" breadcrumb. Right: "Export CSV" (`.btn-secondary`).

**Period and filter bar** (`.card`): Period selector (Month-to-Date / Last Month / Quarter-to-Date / Custom), From/To date inputs (for Custom), Item search, Item Type dropdown, Cost Center dropdown, Variance Type dropdown (All / Price / Usage / Both), Significance filter (All / >£500 / >5% / >10%). "Apply" button.

**Summary KPI row** — three KPI cards:

- Total Material Variance MTD: `£ +8,240.00 GBP` badge-unfavorable, ↑ 3.4% vs last month. Border: red.
- Price Variance: `£ +5,120.00 GBP` badge-unfavorable. Border: amber.
- Usage Variance: `£ +3,120.00 GBP` badge-unfavorable. Border: amber.

Note: P1 shows total variance only. Price/Usage sub-split displayed as estimates labeled "P2 — Full MPV/MQV decomposition in Phase 2."

**Material Variance table** (`.card`):

| Column | Type | Example |
|---|---|---|
| Item Code | text | RM-BREAST-001 |
| Item Name | text | Chicken Breast |
| Period | text | Apr 2026 |
| Std Qty Consumed | numeric | 2,250.000 kg |
| Actual Qty Consumed | numeric | 2,310.000 kg |
| Usage Delta | numeric, colored | +60.000 kg (red) |
| Std Unit Cost | currency | £ 5.20/kg |
| Actual Unit Cost | currency | £ 5.45/kg |
| Price Delta | currency, colored | +£ 0.25/kg (red) |
| Total Variance | currency, bold | `£ +887.50` badge-unfavorable |
| Variance % | percentage | +7.8% (amber) |
| WO Links | integer link | 4 WOs |
| Actions | kebab | Drill-down / Add Note / Export |

"WO Links" number opens a small panel listing the WOs contributing to this item's variance with links to `/finance/wos/:id/cost`.

Table footer: pagination, total variance row.

**Variance notes panel** (below table, collapsible): Lists existing notes added by Finance Manager or Production Manager against specific items. Note fields: Item, Date, WO (optional), Author, Note text. "+ Add Note" button.

#### States

**Loading:** Skeleton KPI cards + 5 skeleton table rows.

**Empty (no data for period):** "No material variances recorded for the selected period. This may mean no WOs were completed or all materials were consumed exactly at standard."

**Error:** Retry button, warning icon.

---

### FIN-008 — Labor Variance Report

**Route:** `/finance/variance/labor`  
**Personas:** Finance Manager, Finance Viewer  
**Purpose:** Period-level labor cost variance per production line and shift. Rate variance (actual labor rate vs standard) and efficiency variance (actual hours vs standard hours). P1 shows total labor variance; full Rate/Efficiency decomposition is P2.

#### Layout description

Page header: "Labor Variance Report" breadcrumb. Right: "Export CSV" (`.btn-secondary`).

**Filter bar** (`.card`): Period selector, From/To, Production Line dropdown, Cost Center dropdown, Operation dropdown, Variance Type (All / Rate / Efficiency), Significance filter.

**Summary KPI row** — three cards:

- Total Labor Variance MTD: `£ +2,850.00 GBP` badge-unfavorable. Border: red.
- Rate Variance: P2 placeholder card with `badge-gray` "Phase 2". Border: gray.
- Efficiency Variance: P2 placeholder card. Border: gray.

**Labor Variance table** (`.card`):

| Column | Type | Example |
|---|---|---|
| WO Number | link | WO-2026-0042 |
| Operation | text | Mixing |
| Production Line | text | Line 1 |
| Std Hours | numeric | 2.000 hrs |
| Actual Hours | numeric | 2.350 hrs |
| Hours Delta | numeric, colored | +0.350 hrs (red) |
| Std Rate | currency | £ 18.50/hr |
| Actual Rate | currency | £ 18.50/hr |
| Labor Std Cost | currency | £ 37.00 |
| Labor Actual Cost | currency | £ 43.48 |
| Total Variance | currency, bold | `£ +6.48` badge-unfavorable |
| Variance % | percentage | +17.5% (red) |
| Actions | kebab | View WO / Drill-down / Add Note |

Phase 2 note in 11px `--muted` below table: "Full rate vs efficiency decomposition (LRV / LEV) will be available in Phase 2 — EPIC 10-I Variance Decomposition."

#### States

Same pattern as FIN-007 (loading, empty, error).

---

### FIN-009 — Real-time Variance Dashboard (P2 Placeholder)

**Route:** `/finance/variance/realtime`  
**Status:** Phase 2 — renders "Coming in Phase 2" banner.

Banner content: heading "Real-time Variance Dashboard — Phase 2 Feature", body "Live tiles updating as WOs post consumption and labor. Configurable alert thresholds (EPIC 10-O). Available in Phase 2." Link: "View Current Variance Summary" routes to `/finance/variance/material`.

---

### FIN-010 — Variance Drill-down

**Route:** `/finance/variance/drill-down`  
**Personas:** Finance Manager, Finance Viewer, Production Manager (read)  
**Purpose:** Hierarchical navigation from total variance → category → item/operation → individual transaction. Enables root-cause investigation without leaving the Finance module.

#### Layout description

Page header: "Variance Drill-down" breadcrumb. Right: "Export" (`.btn-secondary`).

**Breadcrumb navigation trail** (visible path): "Total Variance → Material → Chicken Breast → WO-2026-0042 → Consumption Transaction TX-88901". Each level is a clickable link to go back up. The active level is bold.

**Level 0 — Total Variance** (default view): Four horizontal tile cards in a row: Material Variance `£ +8,240`, Labor Variance `£ +2,850`, Overhead Variance `£ +1,200`, Waste Cost `£ +780`. Each tile has a "Drill in →" link. Total at bottom: `£ +13,070 GBP`.

**Level 1 — Category drill (e.g. Material)**: After clicking Material tile, the content area shows a ranked list of items by absolute variance. Each row: item code, item name, variance GBP (red/green), variance %, a horizontal variance bar showing deviation from zero. Clicking a row goes to Level 2.

**Level 2 — Item drill (e.g. Chicken Breast)**: Shows a timeline of WOs that consumed this item in the period, each with its contribution to the total item variance. Columns: WO Number, Date, Qty Consumed, Unit Cost Used, Std Unit Cost, Variance GBP. Clicking a WO row goes to Level 3.

**Level 3 — WO drill**: Shows the full cost summary for the selected WO, embedded inline. "View Full WO Cost Card" link to `/finance/wos/:id/cost`.

**Level 4 — Transaction drill**: From Level 3, clicking a material consumption line shows the raw transaction record: transaction ID, timestamp, LP consumed (link to `/warehouse/license-plates/:id`), qty_kg, unit_cost (FIFO or WAC), cost method used, source.

**Side panel**: Persistent right sidebar (240px wide) showing the active filters: period, category, item, and a running tally of the drill path's total variance contribution.

#### States

**Loading (each level):** Skeleton rows while fetching the next level.

**Empty at level 1 or 2:** "No items contributed to this variance category in the selected period."

**Error:** Retry inline per level.

---

### FIN-011 — Cost Reporting Suite

**Route:** `/finance/reports`  
**Personas:** Finance Manager (build + run), Finance Viewer (run + export), Auditor (run + export)  
**Purpose:** Saved reports library plus a custom report builder. Export to CSV or PDF.

#### Layout description

Page header: "Cost Reports" breadcrumb. Right: "+ Create Report" (`.btn-primary`).

**Tabs** (`.tabs`): "Saved Reports" (default active) | "Run Custom Report" | "Export Queue".

**Saved Reports tab**: A card grid (`.grid-3`, 3 columns) of saved report cards. Each card: report name, description (1–2 lines), last run timestamp, run frequency (Manual / Monthly / Weekly), "Run Now" button (`.btn-primary`), kebab menu (Edit / Duplicate / Delete / Schedule). Pre-built system reports listed first (labeled "System" badge), user-created next.

Built-in saved reports:

| Report | Description |
|---|---|
| Cost by Product (MTD) | Total actual vs standard cost per FA item, current month |
| Cost by Period (Monthly) | 12-month rolling cost breakdown by category |
| Yield Loss Summary | NCR yield issues joined with cost data, GBP impact |
| WO Variance Summary | All closed WOs with variance, filtered by period |
| Inventory Valuation Snapshot | Current inventory value by item type and location |
| D365 Export Audit | All outbox events with posted status and journal IDs |

**Run Custom Report tab**: A form builder. Fields: Report Name (text input, required for saving), Description (textarea), Report Type dropdown (Cost by Product / Cost by Period / Variance Summary / Inventory Valuation / D365 Export Audit / Raw WO Costs), Date Range (From/To, or preset dropdown: MTD / Last Month / QTD / YTD / Custom), Filters section (multi-select per report type: Item Types, Cost Centers, Production Lines, Variance Threshold), Columns selector (checkbox list of available columns), Sort By dropdown, Group By dropdown. Buttons at bottom: "Run Preview" (`.btn-secondary`), "Run & Export CSV" (`.btn-primary`), "Save as Report" (`.btn-secondary`).

Report preview: After "Run Preview", the tab body shows up to 25 rows of results in a table below the form, with a "View All (N rows)" link. Summary row: "N rows | Total value: £ X,XXX.XX GBP".

**Export Queue tab**: A table of recent export jobs: Export ID, Report Name, Requested By, Format (CSV/PDF), Status badge (Pending / Processing / Complete / Failed), Created At, Download link (if Complete), Retry button (if Failed). Auto-refreshes every 30s.

#### States

**Saved Reports — Empty:** "You have no saved reports yet. Run a custom report and save it for quick access."

**Report Running:** Spinner overlay on preview area, text "Running report… this may take up to 30 seconds."

**Report Error:** "Report failed to run. Error: REPORT_QUERY_TIMEOUT. Try narrowing the date range or adding more filters."

---

### FIN-012 — BOM Cost Simulation (P2 Placeholder)

**Route:** `/finance/simulation`  
**Status:** Phase 2. Banner: heading "BOM Cost Simulation — Phase 2 Feature", body "What-if analysis: change input prices or production mix, recompute FA unit cost and margin preview, save scenario for comparison. Available in Phase 2 (EPIC 10-G roadmap)."

---

### FIN-013 — Margin Analysis Dashboard (P2 Placeholder)

**Route:** `/finance/margin`  
**Status:** Phase 2. Banner: "Margin Analysis — Phase 2. Product-level margin %, trend charts, ranking by customer and period. Available when sales price data is connected (EPIC 10-G + Sales module)."

---

### FIN-014 — Cost Center Budget Page (P2 Placeholder)

**Route:** `/finance/budgets/:cost-center`  
**Status:** Phase 2. Banner: "Cost Center Budgets — Phase 2. Per-center budget vs actual, line-level variance, commit tracking. Available with EPIC 10-F Budget & Forecast."

---

### FIN-015 — Budget Management (P2 Placeholder)

**Route:** `/finance/budgets`  
**Status:** Phase 2. Banner: "Budget Management — Phase 2. Create annual budget, allocate to periods, approval workflow. Available with EPIC 10-F Budget & Forecast."

---

### FIN-016 — D365 F&O Integration (replaces Comarch)

**Route:** `/finance/d365`  
**Personas:** Finance Manager, Admin / Integration Ops  
**Purpose:** Monitor the D365 F&O daily journal posting integration (stage 5 outbox). Connection health, last sync, daily batch overview, DLQ management, GL account mapping config. Note: Comarch Optima integration was withdrawn per project decision Q7; this screen covers D365 only.

#### Layout description

Page header: "D365 F&O Integration" breadcrumb. Right: "Sync Now" (`.btn-primary`, triggers manual daily consolidation for current day), "Last sync: 2 minutes ago" in `--muted` 12px.

**Connection Status card** (`.card`): two-column layout. Left: status indicator large dot (green `--green` if connected, red `--red` if failed) + text "Connected" or "Disconnected". Environment badge: "Production". Fields below: D365 Instance (FNOR), dataAreaId (FNOR), Warehouse (ForzDG), Consolidation Cutoff (23:00 UTC). Right: uptime stat "99.8% last 30 days", last successful post timestamp. Buttons: "Test Connection" (`.btn-secondary`), "Configure" (`.btn-secondary`).

**Sync Summary row** — four KPI mini-cards (`.card`, no border-bottom color):

- WO Cost Events (pending): count, e.g. "3 pending", sub "next batch in 4h 12m"
- Daily Batches (last 30d): count, e.g. "29 posted"
- D365 Journal Lines (last batch): count, e.g. "47 lines"
- DLQ Open: count, e.g. "0" (green badge) or "2" (red badge)

**Tabs below summary** (`.tabs`): "Daily Batches" | "Outbox Queue" | "DLQ" | "GL Mapping" | "Settings".

**Daily Batches tab** (default active): Table — Batch Date, Batch ID (truncated UUID), Status badge (Pending / Dispatched / Delivered / Failed), Line Count, Total Debit GBP, D365 Journal ID, Posted At, Reconciled (checkbox). Clicking Batch ID opens the Batch Detail panel showing all journal lines.

**Outbox Queue tab**: Table — Event ID (truncated), Event Type, WO Reference (link), Status (Pending / Consolidated / Failed / Delivered), Attempt Count, Next Retry At, Last Error (truncated), Enqueued At. Filter by Status. Pagination.

**DLQ tab**: Table — DLQ ID, Source Event ID (link to Outbox), Event Type, Error Category badge (transient / permanent / schema / d365_validation), Error Message (truncated, expandable), Attempt Count, Moved to DLQ At, Resolved At, Resolved By, Resolution Notes. Buttons per row: "Replay" (`.btn-primary`), "Resolve" (`.btn-secondary`). Both open modals (see Section 4). Retry schedule reference: "6-attempt schedule: immediate → +5m → +30m → +2h → +12h → +24h → DLQ."

**GL Mapping tab**: Table of GL account mappings — Cost Category (material / labor / overhead / waste), D365 Account Code (e.g. 5000-ForzDG-MAT), Offset Account Code, D365 Journal Name (PROD), Last Updated, Updated By. Edit button per row opens GL Mapping Edit modal.

**Settings tab**: Toggle — "D365 Integration Enabled" (boolean switch). Consolidation Cutoff Time (time input, default 23:00). Feature flag note: "Integration is gated by PostHog flag `integration.d365.finance_posting.enabled`. Contact admin to enable post-go-live validation." Reconciliation Schedule note: "Daily recon job runs at 03:00 UTC (cutoff + 4h) to verify D365 line counts against outbox."

#### States

**Loading:** Skeleton for all 4 KPI cards and tabs.

**Disconnected state:** Connection status dot is red `--red`. Alert banner (`alert-red`) spans full width: "D365 F&O connection is offline. Outbox events are queuing and will be dispatched when the connection is restored. Contact Integration Ops." "Test Connection" button highlighted.

**DLQ alert state:** If `dlq_open_count > 0`, an amber alert banner (`alert-amber`) appears at top of page: "N items in the D365 Dead Letter Queue require manual resolution. Posting may be incomplete for the affected WOs." Link: "View DLQ" scrolls to DLQ tab.

**All clear state:** Green confirmation bar: "D365 integration is healthy. Last daily batch posted successfully on 2026-04-20 at 23:04 UTC. 47 lines / £ 48,320.50 GBP."

**Empty DLQ:** DLQ tab shows green checkmark icon: "DLQ is empty — all events delivered successfully."

---

### Finance Settings

**Route:** `/finance/settings`  
**Personas:** Finance Manager, Admin  
**Purpose:** Configure standard cost effective-date policy, overhead allocation formula, variance display thresholds, fiscal calendar settings, default currency, and D365 integration flags.

#### Layout description

Page header: "Finance Settings" breadcrumb. Right: "Save Settings" (`.btn-primary`).

The page is a single long form organized into collapsible sections (each a `.card` with a title row and chevron toggle).

**Section 1 — General:**
- Default Valuation Method: radio group — FIFO / WAC. Current: FIFO. Note: "Changing this does not revalue existing inventory. New transactions will use the selected method."
- Default Currency: read-only display "GBP — British Pound Sterling (base currency)". Link "Manage Currencies" routes to `/finance/fx`.
- Variance Calculation Enabled: toggle switch, default ON.

**Section 2 — Standard Cost Policy:**
- Critical Approval PIN Required: toggle switch (default ON, maps to `finance_settings.critical_approval_pin_required`). Note: "Required for 21 CFR Part 11 compliance."
- Standard Cost Effective Date Policy: dropdown — "Future date only (default)" / "Allow current date" / "Allow backdating (audit warning)".
- Cost Basis Default: dropdown — Quoted / Historical / Calculated / Imported D365.
- Cost Change Warning Threshold %: number input (default 20). Note: "A warning is shown when a new standard cost differs from the previous by more than this %. Dual sign-off enforced in Phase 2."

**Section 3 — Variance Display Thresholds:**
- Note: "Full configurable alert engine available in Phase 2 — EPIC 10-O." 
- These are display-only thresholds for color-coding (not alert dispatch):
- On Track threshold: number input "≤ 5% variance → green". (read-only default)
- Warning threshold: number input "5–10% → amber".
- Critical threshold: number input "> 10% → red".

**Section 4 — Overhead Allocation:**
- Default Allocation Basis: dropdown — Labor Hours / Machine Hours / Units Produced.
- Default Overhead Rate: number input (percentage, e.g. 50% of labor cost). Note: "Override per cost center is available via GL Mapping configuration."

**Section 5 — Fiscal Calendar:**
- Calendar Type: dropdown — Standard (Gregorian) / 4-4-5 / 4-5-4.
- Fiscal Year Start Month: dropdown — January through December.
- Note: "Fiscal calendar affects period-end variance calculations and budget allocation (Phase 2)."

**Section 6 — D365 Integration:**
- D365 Integration Enabled: toggle switch (default OFF). Note: "Enable only after go-live validation. Feature flag also required."
- Consolidation Cutoff Time: time input (default 23:00). Note: "All WO cost events accumulated by this time are included in the daily journal batch."
- Reconciliation Schedule: read-only "Daily at 03:00 UTC (cutoff + 4h)".

Footer: "Save Settings" (`.btn-primary`) + "Reset to Defaults" (`.btn-secondary` with confirmation modal).

#### States

**Unsaved changes indicator:** When any field is changed, a sticky banner appears at top: "You have unsaved changes. Remember to save." with "Save Now" inline button.

**Save success:** Toast (top-right, 4s): "Finance settings saved successfully."

**Save error:** Toast (top-right, persistent): "Failed to save settings. Please try again." Retry button in toast.

---

## 4. Modals

---

### MODAL-01 — Standard Cost Create / Edit

**Triggered by:** "+ New Standard Cost" button or Edit in kebab menu (draft records only)  
**Trigger context:** FIN-002  
**Width:** 600px, max-height 80vh, scrollable

**Modal title:** "Create Standard Cost" or "Edit Standard Cost — [Item Name]"

**Fields (in order):**

1. Product / Item — searchable dropdown (queries `/api/finance/items` linked to 03-TECHNICAL items table). Required. Shows item code + name + item_type in each option. Validation: must exist in items table.
2. Item Type — read-only display populated from selected item. Values: RM / Intermediate / FA / Co-product / By-product. Display as badge.
3. Effective From — date input. Required. Validation: V-FIN-STD-01 (cannot have future conflict with existing approved record for same item). Label: "Effective From *". Helper: "The date from which this standard cost becomes the reference for variance calculation."
4. Effective To — date input. Optional. Validation: must be >= effective_from. Label: "Effective To (leave blank for open-ended)".
5. Currency — dropdown showing org currencies from `/api/finance/currencies`. Required. Default: GBP. Display: "GBP — British Pound Sterling (base)".
6. Unit of Measure — dropdown. Required. Options: KG / L / Pcs / g. Default: KG.
7. Cost Basis — dropdown. Options: Quoted / Historical / Calculated / Imported D365. Required.
8. Material Cost — numeric input, 4 decimal places, GBP prefix. Required. Minimum: 0. Example: £ 2.5000.
9. Labor Cost — numeric input, 4dp. Required. Min: 0.
10. Overhead Cost — numeric input, 4dp. Required. Min: 0.
11. Total Cost — read-only calculated field. Updates live as user types. Label: "Total Cost (calculated)". Display: `£ 3.5000 GBP (material + labor + overhead)`.
12. Cost Breakdown mini-bar — three-segment horizontal bar showing proportions of material/labor/overhead, updates live. Labels: "Mat 71% | Lab 11% | OH 17%". No interaction.
13. Notes — textarea, max 500 chars. Optional. Placeholder: "e.g. Q1 2026 standard cost — approved by treasury team."

**Buttons (modal footer):**

- "Cancel" (`.btn-secondary`) — closes modal without saving
- "Save as Draft" (`.btn-secondary`) — creates/updates with `status = 'draft'`
- "Save & Submit for Approval" (`.btn-primary`) — creates with `status = 'pending'`; only if user is finance_manager or admin, also shows "Save & Approve" button that opens MODAL-02 inline

**Validation inline errors:** Red helper text below each field on blur. Total cost: V-FIN-STD-05 (must be > 0 for approval).

**Warning banner (inside modal):** If `total_cost_change_pct > 20%` vs previous approved record, amber alert: "This cost is X% higher than the current approved standard (V-FIN-STD-06). A warning will be logged. Dual sign-off will be required in Phase 2."

---

### MODAL-02 — Approve Standard Cost (E-signature)

**Triggered by:** "Approve" in kebab on FIN-002 / "Save & Approve" in MODAL-01  
**Width:** 520px

**Modal title:** "Approve Standard Cost — [Item Name]"

**Content:**

Read-only summary of the standard cost record: Item, Total Cost GBP, Effective From, Effective To (or "Open"), Cost Basis. Breakdown: Material / Labor / Overhead.

If a previously approved record exists for this item: a comparison panel showing Old cost vs New cost with delta and percentage change (formatted per number conventions).

Approval fields:

1. Approval Reason — textarea, required. Min 10 chars. Placeholder: "e.g. Annual cost review — raw material price update from supplier quote dated 2026-04-01."
2. PIN Re-verification — 6-digit PIN input (masked). Required when `finance_settings.critical_approval_pin_required = true`. Label: "Enter your approval PIN *". Helper: "Required for 21 CFR Part 11 e-signature compliance. The hash SHA-256(approver_id + record_id + timestamp + PIN) will be stored immutably."
3. Confirmation checkbox: "I confirm this standard cost is accurate and I am authorised to approve it."

**Buttons:** "Cancel" (`.btn-secondary`) | "Approve" (`.btn-primary`, disabled until PIN entered and checkbox ticked)

**Success state (inline):** After clicking Approve, the modal body replaces with: green checkmark, "Standard cost approved successfully. Effective from [date]. items.cost_per_kg updated to £ X.XXXX GBP." "Close" button.

**Error states:** PIN incorrect → "Incorrect PIN. Please try again. (N attempts remaining.)"; approval failed → "Approval failed. Please refresh and try again."

---

### MODAL-03 — Cost History

**Triggered by:** "View History" in kebab on FIN-002  
**Width:** 700px

**Modal title:** "Cost History — [Item Name] ([Item Code])"

**Content:**

Current active cost summary bar: "Current Active Cost: £ 3.5000 GBP/KG | Approved by Sarah McKenzie on 2025-01-01."

Version history table: Version label (v3.0 / v2.0 / v1.0), Effective From, Effective To, Material / Labor / Overhead / Total, Status badge, Approved By, Approved At. Row for active record is highlighted with `--blue` left border.

Cost trend mini-chart: line chart of total_cost over time, x-axis = effective periods, y-axis = GBP. Hover tooltip: period + total cost + percentage change vs previous.

Version compare section: "Compare:" dropdown (select version A) "vs" dropdown (select version B). "Compare" button. Result appears as a two-column diff table: Component | v2.0 (Old) | v3.0 (New) | Change (GBP) | Change (%). Favorable change (cost decrease) in green, unfavorable (cost increase) in red.

**Buttons:** "Close" (`.btn-secondary`) | "Create New Version" (`.btn-primary`, opens MODAL-01 pre-filled with current values)

---

### MODAL-04 — Bulk Import Standard Costs

**Triggered by:** "Import CSV" on FIN-002  
**Width:** 640px, 3-step wizard

**Step 1 — Upload:** File drag-and-drop zone (accepts .csv, .xlsx). "Download Template CSV" link. Template columns listed: item_code, item_type, effective_from, effective_to, material_cost, labor_cost, overhead_cost, currency_code, uom, cost_basis, notes. Max 500 rows per import. "Cancel" | "Next →"

**Step 2 — Map & Validate:** Preview table of first 5 rows. Column mapping dropdowns (auto-mapped, override allowed). Validation summary: "X rows valid, Y rows with errors." Error rows highlighted in red with inline error description. Option: "Skip error rows and import valid only." "← Back" | "Next →"

**Step 3 — Review & Import:** Summary: "X standard costs will be created as drafts for review." Warning if any items not found: "Z item_codes were not found in the system and will be skipped." Checkbox: "Submit all imported records for approval immediately (Finance Manager only)." "← Back" | "Import" (`.btn-primary`)

**Post-import success:** "X standard costs imported as drafts. Review and approve in the Standard Costs list." "Close" button.

---

### MODAL-05 — FX Rate Override

**Triggered by:** "Edit Rate" on FIN-006  
**Width:** 480px

**Modal title:** "Update Exchange Rate — [Currency Code]"

Fields: Currency (read-only display), Current Rate (read-only `£ X.XXXXXX`), New Rate (numeric, 6dp, required), Effective Date (date, required, defaults to today), Source (radio: Manual / API Pull), Override Reason (textarea, required when Source = Manual, min 20 chars, audit field). Note: "This rate will apply to all new cost calculations from the effective date. Historical transactions are not recalculated."

**Buttons:** "Cancel" | "Update Rate" (`.btn-primary`)

**Success:** Toast "Exchange rate for [CODE] updated to X.XXXXXX effective [date]. Audit record created."

---

### MODAL-06 — FIFO Layer Drill-down

**Triggered by:** clicking "Layers" count link in FIN-005 inventory valuation table  
**Width:** 640px

**Modal title:** "FIFO Cost Layers — [Item Code] [Item Name]"

Summary: "Total Qty on Hand: X,XXX.XXX kg | Total Value: £ X,XXX.XX GBP | Active Layers: N."

Table columns: Layer #, Receipt Date, Source (PO Receipt / WO Output / Adjustment / D365 Import), Source Reference (link), Qty Received (kg), Qty Remaining (kg), Unit Cost (GBP, 4dp), Layer Value (GBP), Exhausted badge (yes/no). Rows sorted by receipt_date ASC (FIFO consume order). Exhausted rows are grayed out with strikethrough on Qty Remaining "0.000".

FIFO consume note: "Layers are consumed oldest-first per receipt_date ASC (FIFO). The next consume will draw from Layer 1 (oldest non-exhausted)."

**Buttons:** "Close"

---

### MODAL-07 — Variance Note

**Triggered by:** "Add Note" on FIN-003 WO Cost Summary / FIN-007 / FIN-008  
**Width:** 480px

Fields: Item / WO (auto-filled, read-only context), Note Category (dropdown: Root Cause / Supplier Issue / Production Issue / Quality Hold / Planned / Other), Note Text (textarea, required, min 20 chars, max 1000 chars), Attach to Variance (auto-linked to the relevant variance record). "Cancel" | "Save Note" (`.btn-primary`).

---

### MODAL-08 — D365 DLQ Replay

**Triggered by:** "Replay" button on DLQ record in FIN-016  
**Width:** 520px

**Modal title:** "Replay DLQ Event — [Event Type]"

Summary of the failed event: DLQ ID, Event Type, WO Reference, Error Category badge, Last Error message (full text in scrollable box), Attempt Count, Moved to DLQ At.

Fields: Replay Reason (textarea, required, min 20 chars). Note: "A new idempotency key (UUID v7) will be generated. The event will re-enter the outbox with status 'pending' and follow the 6-attempt retry schedule."

Warning for `error_category = 'permanent'`: amber alert "This event was categorized as a permanent error (HTTP 4xx). Replaying may not succeed without fixing the underlying data. Review the error details before proceeding."

**Buttons:** "Cancel" | "Replay Event" (`.btn-primary`)

**Success:** Toast "Event queued for replay. New idempotency key: [UUID]. Check Outbox Queue tab for status."

---

### MODAL-09 — D365 DLQ Manual Resolve

**Triggered by:** "Resolve" button on DLQ record in FIN-016  
**Width:** 480px

**Modal title:** "Manually Resolve DLQ Event — [Event ID]"

Context: DLQ ID, Event Type, WO Reference. Note: "Use this action when the event has been handled manually in D365 (e.g. journal entry posted directly) and the DLQ record should be closed without system replay."

Fields: Resolution Notes (textarea, required, min 30 chars). Checkbox: "I confirm this event has been handled and no automatic retry is needed."

**Buttons:** "Cancel" | "Mark Resolved" (`.btn-primary`, disabled until checkbox ticked)

**Success:** Toast "DLQ event marked as manually resolved. Audit record created with your user ID and resolution notes."

---

### MODAL-10 — Export Report

**Triggered by:** "Export" or "Export Dashboard" buttons throughout the module  
**Width:** 480px

**Modal title:** "Export — [Report / Dashboard Name]"

Fields: Format (radio: CSV / PDF), Date Range (preset dropdown: MTD / Last Month / QTD / YTD / Custom), From/To date inputs (visible only if Custom selected), Include Filters (checkboxes showing currently active filters — user can deselect), Notes/Comments field (optional, appears as footer in PDF).

**Buttons:** "Cancel" | "Export" (`.btn-primary`)

**Processing state:** Modal body shows spinner + "Generating export… this may take up to 30 seconds for large date ranges."

**Success:** Auto-download triggered + Toast "Export ready. Download starting…" Close button shown.

**Error:** "Export failed. Please try a shorter date range or contact support."

---

### MODAL-11 — Supersede Standard Cost

**Triggered by:** "Supersede" in kebab on an Active standard cost in FIN-002  
**Width:** 520px

**Modal title:** "Supersede Standard Cost — [Item Name]"

Explanation text: "Superseding will set the effective_to date on the current record and allow you to create a new draft as the replacement. The current record will be marked Superseded once the new record is approved."

Fields: Supersede Effective Date (date input, the effective_to for the current record — defaults to today). Note about immutability: "Per 21 CFR Part 11, approved records cannot be modified — only superseded. The original approval record is retained in the audit trail permanently."

"Confirm Supersede" (`.btn-primary`) | "Cancel"

After confirming: MODAL-01 opens pre-filled with the superseded cost values so the user can create the replacement draft.

---

### MODAL-12 — Fiscal Period Lock Confirmation

**Triggered by:** (Finance Settings — future action button, P2 feature stub visible in settings)  
**Width:** 440px

Amber warning alert: "Locking a fiscal period prevents any new cost records from being created or modified for that period. This action cannot be undone." Fields: Period to Lock (month/year selector), Lock Reason (textarea, required). PIN re-verification field. "Cancel" | "Lock Period" (`.btn-danger`).

---

### MODAL-13 — Cost Center Create / Edit

**Triggered by:** Manage Cost Centers link in Finance Settings / GL Mapping tab in FIN-016  
**Width:** 480px

Fields: Code (text, required, max 20 chars, alphanumeric + dash), Name (text, required, max 100 chars), Parent Cost Center (dropdown — for hierarchy, optional), Production Line (dropdown from 02-SETTINGS, optional), Allocation Basis (dropdown: Labor Hours / Machine Hours / Units), D365 Dimension Code (text, optional), Is Active (toggle). "Cancel" | "Save" (`.btn-primary`).

---

## 5. Flows

### 5.1 Standard Cost Roll: Update Input Prices → Approve → Effective Date

1. Finance Manager navigates to `/finance/standard-costs`.
2. Clicks "+ New Standard Cost" → MODAL-01 opens.
3. Selects item, enters new cost components, sets effective_from for next month, cost_basis = Quoted, saves as Draft.
4. Draft record appears in list with `badge-gray` Draft status.
5. Finance Manager selects the draft row, clicks kebab → Approve → MODAL-02 opens.
6. Enters approval reason, enters PIN, ticks confirmation checkbox, clicks Approve.
7. System: SHA-256 hash computed and stored; `standard_costs.status` → `approved`; previous approved record's `effective_to` set to `new_effective_from - 1 day` (supersede path); `items.cost_per_kg` updated via `standard_cost.approved` event → `handle_std_cost_approved`.
8. Toast: "Standard cost approved. Effective from [date]. items.cost_per_kg updated."
9. List refreshes: new record shows `badge-blue` Approved (pending effective date), old record shows `badge-amber` Superseded.
10. On effective_from date: status automatically transitions to Active.

### 5.2 WO Actual Cost Calculation: WO Complete → Cost Summary Card Shows Variance

1. Operator completes WO in `/production/work-orders/:id` (08-PRODUCTION).
2. Event `wo.completed` fires → 10-FIN handler `handle_wo_completed` enqueues job `wo_cost_finalize`.
3. Job runs: recursive CTE cascades child WO costs; `material_consumption_costs` and `labor_costs` aggregated; `waste_cost_allocator_v1` computes waste cost; co-product allocation applied; `work_order_costs.status` → `closed`.
4. Finance Manager navigates to `/finance/wos` → sees the WO in the list with variance badge.
5. Clicks WO number → `/finance/wos/:id/cost` → FIN-003 detail.
6. Card shows all sections: total cost, breakdown bars, variance breakdown, cascade (if child WOs), co-product allocation (if applicable).
7. D365 posting status: "Awaiting D365 batch consolidation — next run at 23:00 UTC."
8. At 23:00 UTC: daily consolidator job groups WO events → generates `finance.daily_journal.ready` outbox event → D365 adapter posts to FNOR instance.
9. On successful D365 post: `work_order_costs.posted_to_d365_at` populated, `d365_journal_id` stored; status in card updates to "Posted to D365."

### 5.3 Variance Alert: Variance Exceeds Threshold → Dashboard Highlight → Drill-down

1. WO closes with total_variance > 10% (V-FIN-VAR-02).
2. FIN-001 dashboard: Variance Alerts panel shows new WARNING or CRITICAL row for that WO (auto-refresh within 5 minutes).
3. Finance Manager clicks "View Details" on the alert → navigates to `/finance/wos/:id/cost`.
4. Cost card shows OVER BUDGET status badge, red variance figures.
5. Finance Manager clicks "View Detailed Breakdown" → `/finance/variance/drill-down` with WO pre-selected at Level 3.
6. Drill-down shows the item-level contributions. Finance Manager clicks a material item → Level 4 shows the FIFO layer used, unit cost, source LP.
7. Finance Manager clicks "Add Note" → MODAL-07 → enters root cause (e.g. "Supplier price increase — new PO price not yet reflected in standard cost").
8. Note saved and visible in the variance notes panel on FIN-007.

### 5.4 Inventory Valuation: Period-end Snapshot → Method → Report Generate

1. Finance Manager navigates to `/finance/inventory-valuation`.
2. Selects Valuation Method: FIFO.
3. Sets Valuation Date to last day of previous month (period-end snapshot).
4. Clicks Apply → server queries `inventory_cost_layers WHERE NOT is_exhausted AND receipt_date <= valuation_date` grouped by item.
5. Results populate the table with FIFO avg costs and layer counts.
6. Finance Manager clicks Export → MODAL-10 → CSV format, selected period. Download triggers.
7. For audit: the export is logged in `finance_exports` table.

### 5.5 D365 DLQ Retry: Failed Event → Investigate → Replay or Manual Resolve

1. Finance Manager or Integration Ops navigates to `/finance/d365` → DLQ tab shows count > 0.
2. Amber alert banner visible at top of page.
3. User reviews DLQ record: error_category = `d365_validation`, last_error = "Closed posting period 2026-03-31."
4. User investigates: D365 period was closed before the batch was submitted.
5. If resolvable by replay after period reopened: clicks "Replay" → MODAL-08 → enters reason → confirms. New idempotency key generated, event re-enters outbox.
6. If manual resolution (posted directly in D365): clicks "Resolve" → MODAL-09 → enters resolution notes → confirms. DLQ record closed.
7. DLQ count decrements; if reaches 0, green confirmation bar appears.

### 5.6 Bulk Standard Cost Import + Approve

1. Finance Manager clicks "Import CSV" on FIN-002 → MODAL-04 opens.
2. Uploads CSV of new RM standard costs.
3. Step 2: validation shows 48 valid, 2 errors (item_code not found). User selects "Skip error rows."
4. Step 3: 48 drafts created. User ticks "Submit all for approval immediately." Clicks Import.
5. All 48 records created with `status = 'pending'`.
6. Finance Manager uses Bulk Approve on the filtered list → selects all Pending → "Bulk Approve" → system prompts for single PIN entry covering the batch → all 48 approved simultaneously.
7. Toast: "48 standard costs approved. items.cost_per_kg updated for applicable FA items."

---

## 6. Empty / Zero / Onboarding States

### Module first-run (no data at all)

When a new org activates the Finance module for the first time, the dashboard shows the onboarding empty state (described under FIN-001 Loading/Empty section). An additional **onboarding checklist card** appears at the top of the dashboard (collapsed by default after completion):

1. Configure base currency (link to `/finance/fx`) — auto-marked complete if GBP already set
2. Define standard costs for all FA items (link to `/finance/standard-costs`) — shows coverage percentage
3. Map GL accounts (link to `/finance/d365` GL Mapping tab)
4. Enable D365 integration (link to `/finance/settings`)
5. Complete your first work order with material consumption

Progress bar shows N/5 steps complete.

### Standard Costs — No approved costs

FIN-002 list is empty. The onboarding empty state renders with a price-tag icon and the message "No active standard costs. Variance tracking will not be available until you create and approve standard costs for your production items." Shows coverage indicator: "0 of 24 FA items have an active standard cost." CTA: "+ Create Standard Cost".

### WO Costs — No completed WOs

FIN-003a list is empty. "No work orders have been costed yet. Costs are calculated automatically when a work order is completed." CTA: "View Work Orders" links to `/planning/work-orders`.

### Inventory Valuation — Zero inventory

Table total is £ 0.00 and no rows. Empty state icon + "No inventory value on record. Ensure goods have been received and cost layers created in the Warehouse module." Link: "View Warehouse".

### FX Rates — Only GBP (base)

FIN-006 shows the base currency row only. No exchange rate history. Info banner: "You are operating in single-currency mode (GBP only). Multi-currency operations are available in Phase 2. You may add currencies now to prepare for future use."

### D365 — Integration not enabled

FIN-016 shows the integration disabled state: a large info card with "D365 F&O Integration is not enabled. Production costs are calculated and stored in Monopilot but not yet posted to D365. Enable in Finance Settings to activate the daily journal posting." "Enable D365 Integration" CTA routes to `/finance/settings` and scrolls to the D365 Integration section.

### Reports — No saved reports

FIN-011 Saved Reports tab shows: "You have no saved reports yet. Run a custom report below and save it for quick access." Arrow pointing down to the "Run Custom Report" tab.

---

## 7. Notifications, Toasts, and Alerts

### 7.1 Toast notifications (top-right, 4s auto-dismiss unless error)

| Trigger | Toast text | Color |
|---|---|---|
| Standard cost approved | "Standard cost for [item] approved. Effective [date]." | green |
| Standard cost draft saved | "Draft saved. Submit for approval when ready." | blue |
| Import complete | "X standard costs imported as drafts." | green |
| WO cost recalculated | "WO [number] costs recalculated successfully." | green |
| Exchange rate updated | "Exchange rate for [CODE] updated to [rate] effective [date]." | green |
| DLQ replay queued | "DLQ event queued for replay. Check Outbox Queue for status." | blue |
| DLQ manually resolved | "DLQ event resolved. Audit record created." | green |
| Export started | "Export generating… download will start automatically." | blue |
| Export ready | "Export ready. Download starting…" | green |
| Settings saved | "Finance settings saved." | green |
| API error (any) | "Action failed. Please try again." [Retry] button | red, persistent |
| D365 sync started | "Manual D365 sync triggered. Check Daily Batches tab for status." | blue |

### 7.2 Dashboard variance alerts (Alerts panel in FIN-001)

CRITICAL (red badge): variance >= 10% of standard cost for any closed WO. Shows: WO number, product name, variance GBP and %. Actions: Acknowledge (dismisses from panel, logs acknowledgment user/time) / View Details (navigates to WO cost card).

WARNING (amber badge): variance 5–10% of standard cost. Same display pattern.

FAVORABLE (green badge, optional info): variance < -5% (significant saving). Shown for informational purposes only.

### 7.3 Inline page alerts (banner alerts within screens)

| Screen | Condition | Alert type | Message |
|---|---|---|---|
| FIN-001 | D365 DLQ open > 0 | `alert-red` | "N D365 events in Dead Letter Queue require attention. [View DLQ]" |
| FIN-001 | Uncosted WOs > 5 | `alert-amber` | "N work orders completed more than 24h ago but not yet costed. [View Uncosted WOs]" |
| FIN-002 | Standard cost coverage < 100% FA items | `alert-amber` | "X FA items have no active standard cost. Variance tracking is incomplete. [Create Missing Costs]" |
| FIN-006 | Exchange rate stale > 7 days | `alert-amber` | "Exchange rate for [CODE] was last updated N days ago. Variance calculations may be inaccurate." |
| FIN-016 | D365 disconnected | `alert-red` | "D365 F&O connection is offline. Outbox events are queuing. [Contact Integration Ops]" |
| FIN-016 | Daily consolidation produced 0 lines (V-FIN-INT-07) | `alert-amber` | "Yesterday's daily consolidation produced 0 lines. This may indicate a batch failure. [Investigate]" |
| FIN-005 | Inventory method drift (V-FIN-INV-03) | `alert-amber` | "Some items have both FIFO layers and WAC state, indicating a valuation method change mid-period. [Review Items]" |

### 7.4 Confirmation dialogs

Delete Draft Standard Cost: "Are you sure you want to delete the draft standard cost for [item]? This action cannot be undone." Buttons: "Cancel" / "Delete" (`.btn-danger`).

Supersede Active Standard Cost: as described in MODAL-11.

Fiscal Period Lock: as described in MODAL-12.

Disable D365 Integration: "Disabling D365 integration will stop all outbox events from being dispatched. Pending events will remain in the queue and will resume when integration is re-enabled. Continue?" "Cancel" / "Disable" (`.btn-danger`).

---

## 8. Responsive Notes

### 8.1 Breakpoints

| Breakpoint | Layout changes |
|---|---|
| Desktop > 1280px | Full layout as described. 6-column KPI row. 2-column sections. Full sidebar. |
| Tablet 768–1280px | KPI row: 3 columns × 2 rows. Sidebar: collapses to icon rail (48px wide). Table: horizontal scroll enabled. 2-column sections stack to single column. |
| Mobile < 768px | KPI row: single column stack. Sidebar: hidden, replaced by hamburger bottom bar. Tables: horizontal scroll with sticky first column. Modals: full-screen. |

### 8.2 Finance module desktop-first

The Finance module is primarily a desktop experience. Tablet and mobile views are provided for read-only access (viewing KPIs, WO cost cards, variance reports). All write operations (create standard cost, approve, DLQ replay, bulk import) are desktop-only and display an info banner on tablet/mobile: "This action is best performed on desktop. Some features may be limited on smaller screens."

### 8.3 Specific responsive behaviors

FIN-001 KPI row on tablet: Total Cost + Variance + Inventory Value in row 1 (3 cols), Uncosted WOs + DLQ + Yield Loss in row 2 (3 cols). Charts below: full width.

FIN-003 WO Cost card on tablet: stacks vertically — WO info card above, cost summary card below (full width). Cascade and co-product sections collapse to expandable accordions.

FIN-005 Inventory table on mobile: shows Item Name, Total Value, Status only. Remaining columns accessible via row expand.

FIN-016 D365 tabs on mobile: tabs become a dropdown selector. DLQ table collapses to card format (one DLQ record per card).

---

## 9. Open Questions for Designer

| # | Question | Context |
|---|---|---|
| OQ-UX-01 | Should the 6-column KPI row on FIN-001 use abbreviated values (e.g. "£ 245.7K") by default with full value on hover, or always show full precision? | Cards are narrow at 6-col. |
| OQ-UX-02 | Variance sign indicator preference: "+" and "−" prefix vs "▲ Unfavorable" / "▼ Favorable" text labels alongside the badge? | Both are used in archive wireframes — need consistency. |
| OQ-UX-03 | For the WO Cost card (FIN-003), should the cascade section be collapsed by default (most users won't have multi-level WOs in Phase 1) or always visible? | PRD says cascade-aware but Forza Phase 1 is single-site. |
| OQ-UX-04 | D365 screen naming: "D365 Integration" vs "D365 F&O" vs "Integrations" in sidebar? (Comarch was withdrawn.) | Route is `/finance/d365`. |
| OQ-UX-05 | Approval PIN input: should it be a standard password-type input field or a specialized 6-digit PIN widget (circles for digits)? | 21 CFR Part 11 context — needs to feel formal and secure. |
| OQ-UX-06 | Cost trend chart on FIN-001: area chart (stacked) or multi-line chart? Area chart visually communicates total cost but may obscure individual category trends. | Archive wireframe shows multi-line; PRD mentions sparklines for KPI cards. |
| OQ-UX-07 | Should P2 placeholder screens (FIN-012 simulation, FIN-013 margin, FIN-014/015 budgets) be fully hidden in the sidebar until Phase 2 ships, or shown with a "Phase 2" pill and a teaser? | Teaser approach creates anticipation; hiding reduces clutter. |
| OQ-UX-08 | The FIN-010 variance drill-down uses a breadcrumb trail approach (4 levels). Should each level be a full page replace or a panel that slides in from the right (drawer-style)? | Drawer style allows back navigation without full reload. |
| OQ-UX-09 | For the D365 DLQ table, should "permanent" error rows have a different background (e.g. light red) vs "transient" rows to guide the operator toward the right action immediately? | Operational decision with UX implications. |
| OQ-UX-10 | Bulk approve confirmation: should the Finance Manager enter their PIN once for the whole batch, or once per record? | PRD says single sign-off P1; batch PIN is practical but reduces individual auditability. PRD §5.3 requires each record's SHA-256 hash — batch PIN with per-record hash computation is the recommended approach. |

---

## 10. Component Reference Summary

This section summarises reusable components the designer should build as isolated pieces before composing screens, ensuring visual consistency across all Finance screens.

### 10.1 VarianceBadge

The central visual language element. Used everywhere a variance value is displayed.

Props: `value` (number, GBP), `percent` (number), `size` (sm | md | lg). Rendering rules:
- If `value < 0`: render with `badge-favorable` (green bg `#dcfce7`, text `#166534`), prefix "▼", label "Favorable".
- If `value > 0 AND percent < 5`: render with `badge-warning` (amber bg `#fef3c7`, text `#92400e`), prefix "▲", label "Warning".
- If `value > 0 AND percent >= 5 AND percent < 10`: render with `badge-warning` + amber icon.
- If `value > 0 AND percent >= 10`: render with `badge-unfavorable` (red bg `#fee2e2`, text `#991b1b`), prefix "▲", label "Critical".
- If `value = 0`: render with `badge-neutral` (gray bg `#f1f5f9`, text `#475569`), label "On Target".

Size sm: font-size 11px, padding 2px 6px. Size md: font-size 12px, padding 3px 8px (default). Size lg: font-size 14px, padding 4px 12px (used on KPI cards).

Display format: badge shows `£ +1,250.00 GBP (+15.2%)` in one line for md/lg. For sm: `+15.2%` only with tooltip for full value.

### 10.2 CostBreakdownBar

Horizontal stacked bar showing Material / Labor / Overhead / Waste proportions. Used in FIN-001 and FIN-003.

Props: `material_pct`, `labor_pct`, `overhead_pct`, `waste_pct` (all numbers 0–100, must sum ≤ 100). Colors: Material = `#1976D2` (blue), Labor = `#f59e0b` (amber), Overhead = `#64748b` (muted gray), Waste = `#ef4444` (red). Bar height: 8px, border-radius 4px, full width of container. Below bar: legend row with colored dots, labels, and right-aligned GBP values and percentages. Tooltip on hover per segment: "Material: £ 1,234.50 (60%)."

### 10.3 KPICard (Finance variant)

Extension of the base `.kpi` class with finance-specific sub-line for variance or trend. Props: `label`, `value` (formatted string), `subline` (string, optional), `trend_direction` ("up" | "down" | "flat"), `trend_favorable` (boolean — "up" is favorable for savings, "down" for cost reduction), `border_color` (blue | green | amber | red), `loading` (boolean — renders skeleton). Trend indicator: small arrow icon, colored green if `trend_favorable = true`, red otherwise. Value uses `font-size: 26px; font-weight: 700`. Label: `font-size: 11px; color: var(--muted)`.

### 10.4 StatusBadge (WO Cost variant)

Used in FIN-003 to indicate the overall cost health of a WO.

States and display:

| Status | Condition | Background | Text | Icon |
|---|---|---|---|---|
| On Track | variance% ≤ 5% (incl. favorable) | `#f0fdf4` | `#166534` | checkmark |
| Warning | 5% < variance% < 10% | `#fffbeb` | `#92400e` | triangle |
| Over Budget | variance% ≥ 10% | `#fef2f2` | `#991b1b` | exclamation × 2 |
| Favorable | variance% < 0 (saving) | `#f0fdf4` | `#166534` | arrow down |
| Pending | no production yet | `#f1f5f9` | `#475569` | clock |

### 10.5 AuditTrailRow (Standard Costs)

Used inside the Cost History modal and inline row expansion on FIN-002. Shows: user avatar/initials circle (`background: --blue`, white initials), user full name, action verb ("Approved", "Created", "Superseded"), record summary (total cost, effective dates), timestamp (ISO, displayed as "2025-01-01 10:32 UTC"), signature hash (truncated `sha256:a1b2…` with "Copy" icon on hover).

### 10.6 OutboxEventRow (D365 tab)

Used in FIN-016 Outbox Queue tab. Row layout: Event ID (monospace 12px, truncated 8 chars + "…"), Event Type chip (color-coded: `finance.wo_cost.closed` = blue, `finance.daily_journal.ready` = green, `finance.wo_cost.reversed` = amber), WO Reference link, Status badge (Pending = gray, Consolidated = blue, Delivered = green, Failed = red), Attempt Count "3/6", Next Retry At timestamp or "—", Last Error (truncated 60 chars, expandable on click), Enqueued At timestamp.

### 10.7 DLQRow

Used in FIN-016 DLQ tab. Similar to OutboxEventRow but with additional: Error Category badge (transient = amber, permanent = red, schema = purple `badge-blue`, d365_validation = `badge-amber`), Resolution status (Unresolved = red dot, Resolved = green dot + user name + date). Action buttons: "Replay" (`.btn-primary`, small) and "Resolve" (`.btn-secondary`, small). Row background: light red `#fff5f5` for `error_category = 'permanent'`; default white for transient.

---

## 11. Accessibility Specification

### 11.1 Keyboard navigation

All interactive elements are reachable by Tab key. Focus order within each page follows the visual reading order (left to right, top to bottom). Focus ring: 2px solid `--blue`, offset 2px. No focus traps except inside open modals (Tab cycles within modal, Escape closes).

| Key | Global action |
|---|---|
| Tab / Shift+Tab | Navigate between interactive elements |
| Enter | Activate button or link |
| Space | Toggle checkbox or radio |
| Escape | Close open modal or dropdown |
| Arrow Up/Down | Navigate within dropdown options or alert list |
| Arrow Left/Right | Switch between tabs (`.tabs` component) |

### 11.2 ARIA roles and labels

| Component | ARIA |
|---|---|
| Finance Dashboard | `role="main"`, `aria-label="Finance Dashboard"` |
| KPI cards row | `role="region"`, `aria-label="Key performance indicators"` |
| Each KPI card | `role="article"`, `aria-label="[label]: [value], [subline]"` |
| Variance Alerts panel | `role="region"`, `aria-label="[N] active variance alerts"` |
| Alert row | `role="listitem"`, `aria-live="polite"` for new alerts |
| Data tables | `role="table"`, column headers `scope="col"`, `aria-sort="ascending/descending"` on sorted column |
| Status badges | `aria-label="Status: [status text]"` |
| Modals | `role="dialog"`, `aria-labelledby="modal-title"`, `aria-modal="true"` |
| Approval PIN input | `aria-label="Approval PIN (required for e-signature)"`, `autocomplete="off"` |
| VarianceBadge | `aria-label="[Favorable/Unfavorable] variance: [amount] ([percent])"` |
| Cost breakdown bar | `role="img"`, `aria-label="Cost breakdown: Material [pct]%, Labor [pct]%, Overhead [pct]%"` |
| D365 connection status | `role="status"`, `aria-live="polite"` — updates when connection state changes |

### 11.3 Color contrast

All text on card backgrounds meets WCAG AA minimum 4.5:1. Badge text-on-background ratios: `badge-favorable` (#166534 on #dcfce7) ≥ 4.5:1; `badge-unfavorable` (#991b1b on #fee2e2) ≥ 4.5:1; `badge-warning` (#92400e on #fef3c7) ≥ 4.5:1. Variance bar segments are distinguishable without color alone (labels and percentages provided for all segments).

### 11.4 Touch targets

All interactive elements: minimum 44×44px touch target (CSS `min-height: 44px; min-width: 44px`). Table row action kebab menus: 44px touch area. KPI cards: full card is clickable with minimum 80px height.

---

## 12. Data Formatting Reference (Prototype-ready)

This section provides the exact format strings a designer or developer should use when placing data values in prototype components.

### 12.1 Currency amounts

Base currency is GBP. All monetary amounts in the prototype follow en-GB locale formatting:

| Context | Format | Example | Notes |
|---|---|---|---|
| KPI card (abbreviated) | `£ NNN.NK` or `£ N.NNM` | `£ 245.7K`, `£ 1.23M` | Abbreviated when value > 1,000 |
| KPI card (full) | `£ N,NNN,NNN.NN GBP` | `£ 245,680.50 GBP` | Full when space allows |
| Table cell | `£ N,NNN.NN` | `£ 1,250.00` | No suffix in table cells |
| Variance amount | `£ +N,NNN.NN` or `£ −N,NNN.NN` | `£ +75.50`, `£ −12.00` | Explicit sign always shown |
| Unit cost (4dp) | `£ N.NNNN/kg` | `£ 3.5000/kg` | 4 decimal places for unit costs |
| Exchange rate (6dp) | `N.NNNNNN` | `1.000000`, `0.850000` | 6dp for rates |
| Negative total | `(£ N,NNN.NN)` | `(£ 150.00)` | Parentheses for accounting negative |

Multi-currency note (P2 placeholder text, shown on any screen that would display non-GBP amounts): "Foreign currency amounts shown in [ISO code] with GBP equivalent at rate of [rate] effective [date]."

### 12.2 Percentages

| Context | Format | Example |
|---|---|---|
| Variance percentage | `+N.N%` or `−N.N%` | `+15.2%`, `−3.8%` |
| Cost breakdown % | `NN.N%` | `60.1%` |
| Yield % | `NN.N%` | `91.2%` |
| Overhead allocation rate | `N%` | `50%` |
| KPI trend change | `↑ N.N%` or `↓ N.N%` | `↑ 5.2%` |

### 12.3 Dates and timestamps

| Context | Format | Example |
|---|---|---|
| Date inputs / column values | `YYYY-MM-DD` | `2026-04-20` |
| Timestamps (full) | `YYYY-MM-DD HH:mm UTC` | `2026-04-20 14:32 UTC` |
| Relative timestamps (recent) | "X minutes ago", "X hours ago", "Yesterday" | "2 minutes ago" |
| Period labels | `Mon YYYY` | `Apr 2026` |
| Effective date range | `YYYY-MM-DD – Present` or `YYYY-MM-DD – YYYY-MM-DD` | `2025-01-01 – Present` |
| Fiscal period | `Q2 FY2026` | Fiscal quarter per org calendar |

### 12.4 Quantities and UOM

| Context | Format | Example |
|---|---|---|
| Quantities ≥ 1 kg | `N,NNN.NNN kg` | `1,500.000 kg` |
| Quantities < 1 (e.g. additives) | `N.NNN kg` | `0.250 kg` |
| Piece counts | `N,NNN pcs` | `10,000 pcs` |
| Hours | `N.N hrs` | `2.5 hrs` |
| Percentage yield | `NN.N%` | `91.2%` |

### 12.5 Status badge ordering in tables

When a status column is sortable, the sort order for status values surfaces items requiring attention at the top when the user sorts by status ascending:

1. Critical / Over Budget / Permanent Error (highest urgency)
2. Warning / Pending / Transient Error
3. Active / On Track / Delivered
4. Approved (awaiting effective date)
5. Draft / Open
6. Superseded / Retired / Resolved / Consolidated

---

## 13. Integration with Claude Design Prototype Generation

This section describes how to interpret this UX specification when generating interactive HTML prototypes using the MONOPILOT-SITEMAP.html design system.

### 13.1 Prototype fidelity

Each screen defined in Section 3 should be a separate scrollable page-state within the prototype. The prototype should demonstrate at minimum: populated state (with realistic sample data), loading state (skeleton shimmer), and empty state. Error states and permission-denied states are optional for prototype but recommended for screens where error recovery is a key user journey (FIN-016 DLQ, FIN-001 Dashboard).

### 13.2 Sample data guidance

Use UK-context sample data consistent with Forza Foods UK operation:

- Items: Chicken Nuggets 1 kg (FG-NUGGET-1K), Fish Fingers 500g (FG-FISH-500), Pork Sausages 500g (FG-PORK-500), Chicken Breast (RM-BREAST-001), Wheat Flour (RM-FLOUR-001), Seasoning Mix (RM-SEASON-001)
- Work Orders: WO-2026-0042 (Chicken Nuggets, Line 1, Closed, variance +£ 75.50 GBP), WO-2026-0043 (Fish Fingers, Line 2, Open), WO-2026-0044 (Pork Sausages, Line 1, Posted, D365 journal MONO-PROD-20260419)
- Costs: All GBP. Standard costs: Chicken Nuggets £ 3.5000/kg, Fish Fingers £ 4.2000/kg, Pork Sausages £ 2.9000/kg
- Exchange rates: GBP (base 1.000000), EUR (0.850000 manual, updated 2026-04-19), USD (0.790000 manual, updated 2026-04-19)
- D365 instance: FNOR, dataAreaId = FNOR, warehouse = ForzDG, finished goods account = FinGoods
- Cost Centers: FProd01 (Line 1 Production), FProd02 (Line 2 Production), FOverhead (Shared Overhead), FPkg (Packaging)
- Finance Manager persona: Sarah McKenzie (sarah.mckenzie@forzafoods.co.uk)

### 13.3 Navigation prototype rules

The prototype sidebar follows the MONOPILOT-SITEMAP.html pattern exactly: dark `#1e293b` sidebar, 220px wide, Finance entry in PREMIUM group with currency icon. Clicking Finance expands the sub-navigation showing all routes from Section 2.2. Active route highlighted with `--blue` left border. P2 items show a `badge-gray` "Phase 2" pill and route to the placeholder screen.

Modal overlays use the `#modal-overlay` + `#modal-box` pattern from MONOPILOT-SITEMAP.html: `rgba(0,0,0,0.5)` overlay, white centered box default 560px wide (override to 640px for wide modals, 480px for narrow confirm modals), close `×` button top-right. Modal scrolls internally above `80vh` height.

### 13.4 Chart placeholder components

For line charts (cost trend FIN-001, FX rate trend FIN-006) and distribution charts (inventory value FIN-005), render a visually representative SVG placeholder with the correct color scheme: Material = `#1976D2`, Labor = `#f59e0b`, Overhead = `#64748b`, Waste = `#ef4444`. Chart area height: 200px for trend charts, 160px for distribution charts. X and Y axis lines visible with labels. Data points connected with curves. Hover tooltip: positioned tooltip box showing period + values per series.

### 13.5 Real-time element simulation

Elements described as auto-refreshing (DLQ count, outbox queue, variance alerts) should be implemented in the prototype with a visible pulsing green dot (for live/healthy) or pulsing red dot (for issues) and a "refresh" icon that, when clicked, simulates a state change. For demonstration: clicking refresh on FIN-001 increments or decrements the DLQ count or adds a new alert row. This demonstrates the dynamic nature of the data without requiring a real backend connection.

### 13.6 Approval PIN widget prototype behavior

The PIN input in MODAL-02 (Approve Standard Cost) and MODAL-08 (D365 DLQ Replay) should be a 6-character password-type input. In the prototype, any 6 characters entered enables the Approve/Replay button (no actual PIN validation). After clicking Approve, show the success inline state with green checkmark and confirmation text for 2 seconds, then close the modal and update the record status in the underlying list.

---

_10-FINANCE-UX.md — UX Specification v1.0 — 2026-04-20. Source: 10-FINANCE-PRD v3.0 (authoritative). Design system: MONOPILOT-SITEMAP.html. Archive wireframes FIN-001..016 referenced. PRD overrides archive wireframes where they conflict (Comarch withdrawn Q7; base currency GBP not PLN; D365 F&O is sole integration target). Author: Claude Sonnet 4.6 + Mariusz Krawczyk._

_10-FINANCE-UX.md — UX Specification v1.0 — 2026-04-20. Source: 10-FINANCE-PRD v3.0 (authoritative). Design system: MONOPILOT-SITEMAP.html. Archive wireframes FIN-001..016 referenced. Author: Claude Sonnet 4.6 + Mariusz Krawczyk._
