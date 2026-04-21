# 12-REPORTING — UX Specification (for prototype generation)

**Version:** 1.0
**Date:** 2026-04-20
**Status:** Final — Phase C5 Sesja 1 deliverable, feeds Claude Design prototype generation
**Source PRD:** 12-REPORTING-PRD v3.0 (authoritative)
**Consumer:** Claude Design → interactive HTML prototypes

---

## 0. Module Overview

Module **12-REPORTING** is the universal analytics and export layer of Monopilot MES. It is a **read-only consumer** of every other module's data — it never writes back to operational tables. Its two primary mechanisms are: (1) a catalog of 10 P1 canonical dashboards backed by materialized views that refresh every 2–5 minutes, and (2) a metadata-driven report definition system per Strategic Decision #6 ("custom reports = universal templates + metadata-driven content"), which means report definitions are rows in `dashboards_catalog` with a `metadata_schema` JSONB column describing available filters and columns — not hardcoded UI components.

**P1 scope (build now):** 10 core dashboards (Factory Overview, Yield by Line, Yield by SKU, QC Holds, OEE Summary consumer, Inventory Aging, WO Status, Shipment OTD, Integration Health, Rules Usage Analytics), export engine (PDF + CSV), report_exports audit trail with 7-year retention, DSL rule `report_access_gate_v1`, saved filter presets.

**P2 scope (placeholder screens included where relevant):** Scheduled email delivery (Resend via 02-SETTINGS §13), advanced analytics dashboards (Giveaway, Leader Scorecard, Daily Issues, Shift Performance), period & comparison reports (4-4-5 fiscal), custom DSL report builder, regulatory export package (BRCGS + FSMA 204 + EU 1169/2011), XLSX/JSON exports, e-signature for regulatory exports (21 CFR Part 11), external BI embed (Metabase/Grafana).

**Personas:** Plant Director (KPI read, PDF export for board), Production Manager (daily drill-down, variance investigation), Shift Lead (own-shift review), Supervisor (team scorecards P2), QA Manager (holds, NCR, regulatory exports), Warehouse Manager (inventory aging, lot genealogy P2), Sales Manager (OTD, fulfillment), Finance Manager (WIP P2, cost variance P2), Admin (integration health, rules usage, feature flag management).

**RBAC roles:** `reporting_viewer` (read + export CSV/PDF), `reporting_operator` (viewer + clipboard + drill-down), `reporting_manager` (operator + scheduled reports P2 + filter presets), `reporting_admin` (manager + integration health + external BI config P2 + cross-site aggregation).

**Row-level security note:** All materialized view queries enforce `WHERE org_id = :tenant AND (site_id = :current_site OR site_id IS NULL)` at the service layer (not Postgres RLS natively, since MVs do not support RLS). Every dashboard header displays a "Scoped to: [Site Name]" pill showing the active data scope. Admins with `allow_cross_site=true` see factory-level aggregates (site_id IS NULL rows).

---

## 1. Design System (Inherited)

All tokens sourced from MONOPILOT-SITEMAP.html. Do not deviate.

### 1.1 Base tokens

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active sidebar, links, tab underline |
| `--green` | `#22c55e` | Success, favorable KPI, Grade A |
| `--amber` | `#f59e0b` | Warnings, approaching threshold, Grade C |
| `--red` | `#ef4444` | Errors, critical variance, Grade D, failed delivery |
| `--info` | `#3b82f6` | Informational alerts, target line on charts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Sidebar background |
| `--card` | `#fff` | Card / panel background |
| `--text` | `#1e293b` | Primary body text |
| `--muted` | `#64748b` | Secondary text, timestamps, column headers |
| `--border` | `#e2e8f0` | Card borders, table dividers |
| `--radius` | `6px` | Card border radius |

Font: Inter, system-ui, -apple-system, sans-serif. Base 14px / line-height 1.4. Page titles 20px bold. Card titles 14px semibold. Labels 12px medium `#374151`. Timestamps 11px `--muted`. Monospace for codes and routes.

Sidebar width 220px fixed left. Main content margin-left 220px, padding 40px 20px 20px. Modal width 560px, max-height 80vh, overflow-y auto.

### 1.2 Chart vocabulary (aligned with 08-PRODUCTION and 10-FINANCE dashboards)

| Chart type | Library | Usage in 12-REPORTING |
|---|---|---|
| Line (trend) | D3.js | 13-week Yield%, OEE%, Efficiency% trend over time |
| Bar (compare) | D3.js | Per-line yield comparison, downtime by category |
| Stacked bar | D3.js | Downtime People/Process/Plant per line, integration outbox depth |
| Horizontal bar | D3.js | QC Holds by line (boxes held), Top 3 Gains/Losses |
| Heatmap | D3.js | Line × shift matrix (Shift Performance P2), OEE heat grid |
| Sparkline | Recharts | Inline trend in table rows (Yield by Line, Yield by SKU) |
| KPI card | Recharts / HTML | 5 per row, bottom border color indicates status |
| Pie (sparingly) | Recharts | Inventory age bucket share, Rules usage share |
| Combo chart | D3.js | Trend line + target line + bar overlay (Yield + OEE) |
| Drill-down breadcrumb | HTML | Top of every detail view: Reporting > Dashboard > Dimension |

### 1.3 Reporting-specific color coding

| Metric | Color | Hex |
|---|---|---|
| Yield / KPI positive | `--green` | `#22c55e` |
| Yield / KPI at-risk | `--amber` | `#f59e0b` |
| Yield / KPI negative | `--red` | `#ef4444` |
| Grade A | `#22c55e` | green-500 |
| Grade B | `#3b82f6` | blue-500 |
| Grade C | `#f59e0b` | amber-500 |
| Grade D | `#ef4444` | red-500 |
| Target line (dashed) | `--info` | `#3b82f6` |
| Downtime People | `#3b82f6` | blue-500 |
| Downtime Process | `#f59e0b` | amber-500 |
| Downtime Plant | `#ef4444` | red-500 |
| OEE > 85% world-class | `#22c55e` | green |
| OEE 65–85% typical | `#f59e0b` | amber |
| OEE < 65% poor | `#ef4444` | red |
| Integration OK | `#22c55e` | green |
| Integration Warning | `#f59e0b` | amber |
| Integration Critical | `#ef4444` | red |

### 1.4 Number formatting

- Percentage: 1 decimal place — `95.3%`
- Weight (kg): thousands separator, no decimal — `1,234 kg`
- GBP currency: thousands separator, 2 decimals — `£12,345.67`
- Date: tenant-configurable; default UK `DD/MM/YYYY`; ISO `YYYY-MM-DD` for export filenames
- Week: `W/E DD/MM/YYYY` (week ending Saturday convention)
- Period: `Pnn YYYY` — e.g., `P02 2026`
- Duration: `2h 14m` (hours and minutes); minutes-only below 60 min: `45 min`

### 1.5 Status badge mapping

| State | Badge class | Label |
|---|---|---|
| Enabled / Active | `.badge-green` | Active |
| Paused / Warning | `.badge-amber` | Paused |
| Failed / Error | `.badge-red` | Failed |
| Pending / Running | `.badge-blue` | Running |
| Draft / Inactive | `.badge-gray` | Draft |
| Stale data | `.badge-amber` | Data stale |
| Feature flag off | `.badge-gray` | Not enabled |

### 1.6 Freshness indicator (all dashboards)

A small row immediately below the page title area. Left side: "Data as of: 14:32" in 11px `--muted`. Next to it a circular refresh icon button (16px). Right side (if data is stale): `.badge-amber` "Data stale — last refresh 18 min ago". A 2px indigo progress bar along the top of the main area slides when a manual refresh is in progress.

---

## 2. Information Architecture

### 2.1 Sidebar entry

Sidebar group label: **ANALYTICS** (new group below PREMIUM). Single entry: icon `📈`, label "Reporting", active highlight `#1e3a5f` background + `--blue` left border. Clicking expands an inline sub-nav with the items below.

### 2.2 Inner sub-navigation (persistent left rail collapsible)

After clicking "Reporting" in the sidebar, the sub-items appear indented at 12px size `#94a3b8` color:

1. Dashboards (no sub-items — leads to /reporting which lists all 10 dashboards as cards)
2. Factory Overview
3. Yield by Line
4. Yield by SKU
5. QC Holds
6. OEE Summary
7. Inventory Aging
8. WO Status
9. Shipment OTD
10. Integration Health _(admin only)_
11. Rules Usage _(admin only)_
12. --- divider ---
13. Export History
14. Saved Filters
15. Scheduled Reports _(P2, grayed if flag off)_
16. Settings

### 2.3 Route map

| Route | Screen |
|---|---|
| `/reporting` | Reporting home — dashboard catalog grid |
| `/reporting/factory-overview` | RPT-001 Factory Overview |
| `/reporting/yield-by-line` | RPT-002 Yield by Line |
| `/reporting/yield-by-sku` | RPT-003 Yield by SKU |
| `/reporting/qc-holds` | RPT-004 QC Holds Dashboard |
| `/reporting/oee-summary` | RPT-005 OEE Summary |
| `/reporting/inventory-aging` | RPT-006 Inventory Aging |
| `/reporting/wo-status` | RPT-007 WO Status |
| `/reporting/shipment-otd` | RPT-008 Shipment OTD |
| `/reporting/integration-health` | RPT-009 Integration Health _(admin only)_ |
| `/reporting/rules-usage` | RPT-010 Rules Usage Analytics _(admin only)_ |
| `/reporting/exports` | Export History |
| `/reporting/saved-filters` | Saved Filter Presets |
| `/reporting/scheduled` | Scheduled Reports list _(P2)_ |
| `/reporting/scheduled/new` | Scheduled Report create _(P2)_ |
| `/reporting/scheduled/:id` | Scheduled Report edit _(P2)_ |
| `/reporting/settings` | Reporting Settings |

### 2.4 Permissions matrix

| Screen | viewer | operator | manager | admin |
|---|---|---|---|---|
| All P1 dashboards | read | read + drill | read + filter presets | full |
| Export CSV | yes | yes | yes | yes |
| Export PDF | yes | yes | yes | yes |
| Export XLSX _(P2)_ | no | no | yes | yes |
| Copy to Clipboard | no | yes | yes | yes |
| Save filter preset | no | no | yes | yes |
| Integration Health | no | no | no | yes |
| Rules Usage | no | no | no | yes |
| Scheduled Reports _(P2)_ | no | no | yes | yes |
| Reporting Settings | no | no | no | yes |
| Cross-site aggregation | no | no | no | yes (flag) |

---

## 3. Screens

---

### SCREEN RPT-HOME — Reporting Home / Dashboard Catalog

**Screen ID:** RPT-HOME
**Route:** `/reporting`
**Purpose:** Entry point. Shows the catalog of all available dashboards as cards grouped by domain. Acts as the "home" for the module. Allows quick navigation to any dashboard. Provides data-freshness summary across all 10 MVs.

**Layout description:**

The page opens with the standard breadcrumb row: "Reporting" in `--muted` (no link, it is the current page). Below it the page title "Reporting" at 20px bold. Immediately to the right of the title is a small "Data freshness" summary: a pill showing "All views fresh" in `.badge-green` or "1 view stale" in `.badge-amber` if any MV last_refresh_at > 5 minutes. A global week selector dropdown sits at the far right of this title row, defaulting to the current week (format `W/E DD/MM/YYYY`). This selector persists state in URL query param `?week=2026-W16`.

Below the title row, a horizontal filter bar with a search input (`placeholder="Search dashboards…"`, text type, 240px wide) and two filter dropdowns: "Domain" (All / Production / Quality / Warehouse / Operational / Admin) and "Phase" (All / P1 / P2). Filter chips appear below when active — each chip shows the filter value with an ×  remove button.

The main area is a card grid in `.grid-3` layout (3 columns, `gap:12px`). Each dashboard card is a `.card` (white, 1px border `--border`, `6px` radius, `16px` padding) showing:
- Top row: icon (emoji or SVG) left, domain badge right (`.badge-blue` for Production, `.badge-gray` for Admin, etc.)
- Dashboard name at 14px semibold
- Short description at 12px `--muted`, 2 lines max
- Divider line
- Bottom row: "Last refreshed: 14:32" left in 11px `--muted`; "View →" link button right in `--blue` 12px

P2 dashboards render in the grid but with a `.badge-gray` "Coming in Phase 2" overlay pill on the card and a semi-transparent wash. Clicking a P2 card shows a toast "This dashboard is coming in Phase 2."

**Empty state:** Cannot truly be empty (catalog is seeded). If no dashboards match the current search/filter, show a centered illustration with text "No dashboards match your search — clear filters to see all 10 dashboards" and a "Clear filters" button.

**Loading state:** Each card renders a skeleton placeholder (gray animated shimmer) — same card shape with three shimmer lines replacing the text. Loading lasts up to the P95 target of 2 seconds.

**Error state:** If the catalog API fails, show an `.alert-red` banner at top: "Could not load dashboard catalog. Please refresh or contact support."

**Permission-denied state:** Not applicable — all authenticated users see the catalog. Individual cards are hidden if the user lacks permission (e.g., Integration Health hidden for non-admins).

**Primary actions:** Click any card to navigate to that dashboard route. "Export History" quick-link button (secondary) in the title bar.

**Microcopy:** Card CTA "View →", empty search "No dashboards match your search", freshness pill "All views fresh" / "N views stale", P2 badge "Coming in Phase 2".

---

### SCREEN RPT-001 — Factory Overview

**Screen ID:** RPT-001
**Route:** `/reporting/factory-overview`
**Purpose:** Single-page executive summary of factory performance for the current week. Shows weighted yield%, giveaway%, efficiency%, total cases, variance GBP, an embedded OEE summary card (consumer of 15-OEE `oee_daily_summary`), 13-week trend chart, and Top 3 Gains / Top 3 Losses by line.

**Layout description:**

Standard page header: breadcrumb "Reporting / Factory Overview", page title "Factory Overview", scoped-to pill ("Scoped to: Main Site" in `.badge-blue` 11px). Far right of title row: week selector dropdown (current week default), Export dropdown button (PDF / CSV / Copy), freshness indicator "Data as of: 14:32".

**KPI row** — five `.kpi` cards in `.kpi-row` (5-column grid):
1. Weighted Yield% — value e.g. `91.3%`, change `↑ 0.5% vs last week`, border color by vs-target: green if ≥ target, amber if within 3% below target, red if > 3% below target
2. Giveaway% — value e.g. `1.8%`, change `↓ 0.2% vs last week`, border green if ≤ target, amber within 0.5% above, red if exceeds
3. Efficiency% — value e.g. `84.2%`, border amber (target 85%)
4. Total Cases — value e.g. `12,450`, change `↑ 340 vs last week`, border blue (neutral)
5. Variance GBP — value e.g. `-£2,340` (negative = favorable saving), border green if negative, red if positive

Immediately below the KPI row: a sixth card spanning full width — the **OEE Summary card** (consumer of 15-OEE). White card with `.card-title` "OEE Summary (today, all lines)". Three inline KPIs inside: OEE% (large), Availability%, Performance%, Quality%. A small sparkline (Recharts) shows OEE% for past 7 days. Right edge: link "Full OEE Dashboard →" navigates to `/reporting/oee-summary`. If 15-OEE `oee_daily_summary` MV is unavailable, replace the card content with a centered message: "OEE data unavailable — 15-OEE module may be starting up" in `--muted` with a retry icon.

**Middle row** — two columns (`.grid-2`):
- Left `.card` "13-Week Trend": D3.js combo chart. X-axis: 13 weekly dates (W/E). Y-axis left: Yield % (line, `--green`). Y-axis right: Variance GBP (bar, green/red by sign). Dashed horizontal reference line for target yield. Tooltips on hover show exact values. Chart height 280px.
- Right `.card` split vertically: top half "Top 3 Gains this week" — three rows each showing line name, product name, variance GBP in green badge (e.g. `+£1,200`), and a micro horizontal bar. Bottom half "Top 3 Losses this week" — same structure, variance badge in red.

**Bottom section** — `.card` "All Lines Summary" — a table with columns: Line, Product, Yield%, Target%, Variance%, Variance GBP, Grade badge (A/B/C/D with appropriate color), Sparkline (inline 80px Recharts). Row click navigates to `/reporting/yield-by-line?line=LINE-01`. Table footer row: Factory Average (bold, bottom 2px border top).

**States:**
- Loading: KPI cards show shimmer skeletons; chart area shows a gray rectangle placeholder with a spinning indicator inside.
- Empty (no WO data for the week): KPI cards show "—" values, chart shows empty axes with message "No production data for this week", Top 3 panels show "No data" in `--muted`.
- Error: `.alert-red` inline banner inside the KPI area: "Could not load Factory Overview data. The data pipeline may be refreshing — please wait up to 3 minutes and try again."
- Stale: `.badge-amber` "Data stale" shown in freshness indicator; all KPI values render with a subtle amber left border on each card.
- Results too large (>10k rows): Not applicable at this screen — data is pre-aggregated to weekly level.
- Permission denied: If user lacks `reporting_viewer` role, full-page `.alert-red` with message "You do not have permission to view this dashboard. Contact your administrator."

**Modals triggered:** Export modal (see Section 4).

**Primary actions:** Export (PDF / CSV / Copy), week navigation arrows (previous / next week), click any line row to drill to Yield by Line.

**Microcopy:** OEE unavailable placeholder "OEE data unavailable — 15-OEE module may be starting up", empty week "No production data for this week — work orders may not be completed yet", stale indicator "Data as of: HH:MM — refresh for latest".

---

### SCREEN RPT-002 — Yield by Line

**Screen ID:** RPT-002
**Route:** `/reporting/yield-by-line`
**Purpose:** Per-production-line yield breakdown for the selected week. Shows every active line with current yield%, target%, variance%, variance GBP, week-over-week change, and an inline sparkline for 8-week trend. Factory average footer row. Drill into a line to see by-SKU detail.

**Layout description:**

Header identical to RPT-001: breadcrumb, title "Yield by Line", scoped-to pill, week selector, Export dropdown, freshness indicator.

**Summary KPI row** — three `.kpi` cards:
1. Factory Average Yield% with W/W delta
2. Lines Above Target — count badge green
3. Lines Below Target — count badge red

**Main table** — `.card` with `.card-title` "Lines — W/E DD/MM/YYYY". Table columns (sticky header):
- Line — text, e.g. "Line 1 — Nugget Line", sortable
- Product Mix — text, top SKU + "& N more" if multiple
- KG Output — numeric, thousands separator, sortable
- Yield% — numeric 1dp, color-coded: green ≥ target, amber within 3% below, red > 3% below
- Target% — numeric 1dp, sourced from `target_kpis`
- Variance% — numeric 1dp with `+/−` sign, badge-green (favorable) or badge-red
- Variance GBP — currency, badge-green if negative (saving), badge-red if positive (loss)
- W/W Change% — numeric 1dp with arrow icon (↑ green / ↓ red / → gray)
- Grade — badge (A/B/C/D colors per design token table)
- Trend — inline Recharts sparkline, last 8 weeks, 80×30px
- Actions — "Drill →" link button, opens `/reporting/yield-by-sku?line=LINE-01`

Table footer row (sticky bottom): "Factory Average" spanning first column, then weighted aggregates for all numeric columns. Bold font 600.

**States:**
- Empty: Single-row empty state inside the table body: a centered illustration of an empty line with text "No yield data for this week on any line. Check that work orders have been completed in 08-PRODUCTION."
- Loading: Table body replaced with 5 skeleton rows (shimmer).
- Error: `.alert-red` inside the card.
- Permission denied: Full-page denied message.

**Modals triggered:** Export modal, Drill-down navigates (no modal).

**Primary actions:** Sort any column, select a line row, export.

---

### SCREEN RPT-003 — Yield by SKU

**Screen ID:** RPT-003
**Route:** `/reporting/yield-by-sku`
**Purpose:** Per-SKU (finished good) yield breakdown. Contribution percentage shows each SKU's share of total factory variance. 13-week trend per SKU via expandable row detail. Optional filter by line.

**Layout description:**

Header: breadcrumb "Reporting / Yield by SKU", title "Yield by SKU", scoped-to pill, week selector, Line filter dropdown (All Lines / Line 1 / Line 2 / ...), Export dropdown, freshness indicator.

**Summary KPI row** — three `.kpi` cards: Total SKUs active, SKUs Above Target (green), SKUs Below Target (red).

**Line summary header card** — rendered only when a specific line is filtered. Shows Line name, this week's KG Output, Weighted Yield%, Grade badge. A "Clear line filter" link removes the filter.

**Main table** — columns:
- SKU Code — monospace, e.g. `FG-NUGGET-1K`, sortable
- Product Name — full name
- Line(s) — comma-separated line codes
- KG Output — numeric sortable
- Yield% — color-coded same logic as RPT-002
- Target% — from `target_kpis` or BOM `expected_yield_pct` fallback
- Variance% — signed badge
- Variance GBP — signed badge
- Contribution% — the SKU's share of total factory variance GBP (pie slice — inline mini bar, 60px wide, filled proportionally)
- Trend (13w) — inline Recharts sparkline, 80×30px

**Expandable row:** Clicking a SKU row expands an inline detail section spanning all columns:
- D3.js line chart: 13-week yield trend for this SKU, with target dashed line. Height 160px.
- Mini table: best week, worst week, avg yield last 13 weeks, avg variance GBP.
- Quick action: "View all runs →" navigates to `/production/work-orders?product=FG-NUGGET-1K` (cross-module link, opens in same tab).

**States:** Loading (skeleton rows), Empty ("No SKU yield data for this week"), Error (alert banner), Permission denied.

**Modals triggered:** Export modal.

---

### SCREEN RPT-004 — QC Holds Dashboard

**Screen ID:** RPT-004
**Route:** `/reporting/qc-holds`
**Purpose:** Daily view of all quality holds from 09-QUALITY: boxes held per line/product/reason, labour hours consumed, AM vs PM shift breakdown. Drill-through to individual hold records in 09-QUALITY.

**Layout description:**

Header: breadcrumb "Reporting / QC Holds", title "QC Holds", scoped-to pill, **date picker** (single date, defaults today, format DD/MM/YYYY), AM/PM toggle (All / AM / PM), Line filter, Export dropdown, freshness indicator (5-minute refresh cadence shown: "Updates every 5 min").

**Summary KPI row** — four `.kpi` cards:
1. Total Boxes Held — numeric, border amber if > 0, border green if = 0
2. Total Boxes Rejected — numeric, border red if > 0
3. Total Labour Hours — numeric 1dp
4. Critical Holds — count, border red

**Alert panel** — shown only if critical holds count > 0: `.alert-red` "N critical holds require immediate action" with a "View critical →" link that filters the table to critical reason codes.

**Main table** — `.card` with title "Holds for DD/MM/YYYY". Columns:
- Line — text
- Product — text
- Reason Code — text from `quality_hold_reasons` ref table
- Severity — badge: Critical `.badge-red` / Major `.badge-amber` / Minor `.badge-gray`
- Boxes Held — numeric, bold if > 10
- Boxes Rejected — numeric
- Staff Count — numeric
- Time Taken (min) — numeric
- Labour Hours — numeric 1dp
- Shift — badge: AM `.badge-blue` / PM `.badge-gray`
- Status — badge: Open `.badge-red` / Released `.badge-green` / Under Review `.badge-amber`
- Actions — "View in QA →" link navigates to `/quality/holds/:hold_id` (cross-module, same tab)

Table footer row: "Total" with summed Boxes Held, Boxes Rejected, Labour Hours.

**AM/PM split card** — below the main table, `.grid-2`: Left card "AM Shift summary" — boxes held, labour hours, most common reason. Right card "PM Shift summary" — same. Each with a small D3.js horizontal bar showing holds by reason for that shift.

**Zero-state (no holds today):** Replace the table and AM/PM cards with a centered green checkmark illustration and message "No quality holds today — great work!" in 16px.

**States:** Loading (skeleton table), Error (alert banner inside card), Permission denied (full page).

**Modals triggered:** Export modal. Cross-module navigation is a link (not modal).

---

### SCREEN RPT-005 — OEE Summary

**Screen ID:** RPT-005
**Route:** `/reporting/oee-summary`
**Purpose:** OEE consumer dashboard. Reads `oee_daily_summary` materialized view owned by 15-OEE. Shows last 24 hours of OEE% per line, today-so-far summary, best/worst shift. Does not duplicate OEE aggregation logic — all computed by 15-OEE module.

**Layout description:**

Header: breadcrumb "Reporting / OEE Summary", title "OEE Summary", scoped-to pill, date picker (defaults today), Line filter, Export dropdown, freshness indicator (sourced from 15-OEE MV refresh timestamp).

**Dependency notice strip** — a thin `.alert-blue` banner immediately below the filter bar: "OEE data is owned by the 15-OEE module. For full drill-down (anomaly detection, per-machine breakdown), go to 15-OEE. This screen shows a read-only consumer view." Right side of strip: "Open 15-OEE →" link.

**Summary KPI row** — five `.kpi` cards:
1. Factory OEE Today — value e.g. `83.2%`, color green ≥ 85%, amber 65–85%, red < 65%
2. Availability — value e.g. `91.5%`
3. Performance — value e.g. `88.1%`
4. Quality — value e.g. `99.2%`
5. Best Line Today — line name and its OEE value, `.badge-green`

**Main chart** — `.card` "OEE% by Line — Last 24h". D3.js grouped bar chart. X-axis: production lines. Y-axis: OEE% (0–100). Each bar group has three bars: Availability, Performance, Quality in distinct colors (blue, amber, green per 1.3 color table). World-class reference line at 85% (dashed `--info`). Chart height 280px, responsive width.

**Trend table** — `.card` "OEE Trend — Last 7 Days". Columns: Date, Factory OEE%, Availability%, Performance%, Quality%, Best Line, Worst Line. Each OEE% cell color-coded. Last row: 7-day average (bold). Sparkline column (7-point) for factory OEE.

**Shift comparison card** — `.grid-2`: Left "AM Shift OEE%" across all lines, Right "PM Shift OEE%". Table: Line | OEE% | A | P | Q. Color-code each cell.

**OEE unavailable state:** If `oee_daily_summary` is not populated or returns 0 rows, replace the entire main area (below the dependency strip) with a centered illustration and message: "OEE data is currently unavailable. The 15-OEE module may still be populating data. This indicator refreshes every 2 minutes." Retry button triggers a manual refresh call.

**States:** Loading (skeleton), Error (alert banner), Permission denied.

**Modals triggered:** Export modal.

---

### SCREEN RPT-006 — Inventory Aging

**Screen ID:** RPT-006
**Route:** `/reporting/inventory-aging`
**Purpose:** Shows license plate inventory aged by how long items have been in stock. Age buckets: 0–7 days (fresh), 7–14 days (attention), 14–30 days (warning), >30 days (critical). Highlights use-by alerts and slow-moving SKUs.

**Layout description:**

Header: breadcrumb "Reporting / Inventory Aging", title "Inventory Aging", scoped-to pill, Warehouse filter (All / WH-01 / WH-02 etc.), Product Category filter, Export dropdown, freshness indicator (5-minute cadence).

**Summary KPI row** — five `.kpi` cards:
1. Total LPs in Stock — count, border blue
2. Fresh (0–7 days) — count, border green
3. Attention (7–14 days) — count, border blue
4. Warning (14–30 days) — count, border amber
5. Critical (>30 days) — count, border red

**Age distribution chart** — `.card` "Inventory Age Distribution". D3.js stacked horizontal bar, one bar per product category showing proportion in each age bucket. Colors: green (0–7d), blue (7–14d), amber (14–30d), red (>30d). Legend below. Height 200px.

**Alerts card** — `.card` "Expiry Alerts" with `.alert-amber` for items expiring within 7 days and `.alert-red` for items already expired (should not normally exist in Available status). Table inside: LP#, Product, Qty (kg), Expiry Date, Days Until Expiry, Location, Status badge. If empty: "No expiry alerts — all stock is within use-by dates" in `.alert-green`.

**Main table** — `.card` "All Inventory by Age". Columns:
- Product Code — monospace
- Product Name
- Category
- LP Count — numeric
- Total KG — numeric, thousands separator
- Avg Age (days) — numeric
- Oldest LP (days) — numeric, red if > 30
- 0–7d KG — numeric
- 7–14d KG — numeric
- 14–30d KG — numeric
- >30d KG — numeric, bold red if > 0
- Actions — "View LPs →" link to `/warehouse/license-plates?product=X&age_gt=0` (cross-module)

**Slow-moving SKU panel** — `.card` "Slow-Moving SKUs (>14 days, >100 kg)". Table: Product, Total KG > 14d, Oldest LP, Suggested Action (free text from PRD). Badge `.badge-amber` "Review stock".

**States:** Loading (skeleton), Empty per filter ("No inventory matching this filter"), Error (alert), Permission denied.

**Modals triggered:** Export modal.

---

### SCREEN RPT-007 — WO Status

**Screen ID:** RPT-007
**Route:** `/reporting/wo-status`
**Purpose:** Real-time-ish snapshot of work orders by status. Shows WO count per state (Draft, Released, Running, Paused, Completed), WIP count, average duration per line. Links into 08-PRODUCTION for execution.

**Layout description:**

Header: breadcrumb, title "WO Status", scoped-to pill, date range picker (from–to, defaults today), Line filter, Status filter (multi-select: Draft, Released, Running, Paused, Completed), Export, freshness indicator (2-minute cadence — this MV uses the prod refresh cycle).

**WO Status funnel** — `.card` "Work Orders by Status — Today". Horizontal status bar showing count in each state as proportional segments: Draft (gray), Released (blue), Running (green), Paused (amber), Completed (dark-green). Click any segment to filter the table below.

**Summary KPI row** — four `.kpi` cards:
1. Active WOs (Running + Released) — border blue
2. WIP Lines Count — border green
3. Paused WOs — border amber (each one may need attention)
4. Avg Duration Completed Today — e.g. `2h 14m`, border blue

**Main table** — columns:
- WO# — monospace link to `/production/work-orders/:id`
- Product — text
- Line — text
- Planned Qty (kg) — numeric
- Status — badge per 1.5 table
- Planned Start — time `HH:MM`
- Actual Start — time or "—"
- Planned Duration — `Xh Ym`
- Elapsed — live timer for Running WOs in green; actual duration for Completed; "—" for others
- Yield% (if Completed) — color-coded cell, "—" for non-completed
- Actions — "View →" opens WO execution screen in new tab

**WIP breakdown card** — `.card` "WIP by Line". Table: Line | Running WOs | Planned Output (kg) | Material Reserved (kg) | Completion %. Each row has a thin progress bar under the Completion % cell.

**States:** Loading (skeleton KPIs and 5 skeleton table rows), Empty ("No work orders for the selected date and filters"), Error (alert), Permission denied.

**Modals triggered:** Export modal. WO detail link is cross-module navigation, not a modal.

---

### SCREEN RPT-008 — Shipment OTD

**Screen ID:** RPT-008
**Route:** `/reporting/shipment-otd`
**Purpose:** On-Time Delivery dashboard. Shows OTD%, fulfillment rate, late vs on-time shipment breakdown per customer. Average pack time. Data from 11-SHIPPING `shipments` + `sales_orders`.

**Layout description:**

Header: breadcrumb, title "Shipment OTD", scoped-to pill, week selector (defaults current week), Customer filter, Export, freshness indicator (5-minute cadence).

**Summary KPI row** — five `.kpi` cards:
1. OTD% — e.g. `96.2%`, border green ≥ 95%, amber 90–95%, red < 90%
2. Fulfillment Rate — e.g. `98.5%`, border green
3. On-Time Shipments — count, border green
4. Late Shipments — count, border red if > 0
5. Avg Pack Time — e.g. `42 min`, border blue

**OTD trend chart** — `.card` "OTD% Trend — Last 8 Weeks". D3.js line chart, X-axis weekly, Y-axis OTD%. Dashed reference line at 95% target. Tooltip shows count and %. Height 220px.

**Customer table** — `.card` "OTD by Customer". Columns:
- Customer Name — text
- Total Orders — numeric
- On-Time — numeric
- Late — numeric, red bold if > 0
- OTD% — colored badge: green ≥ 95%, amber 90–95%, red < 90%
- Fulfillment Rate — numeric%
- Avg Pack Time (min) — numeric
- Trend — 8-week sparkline

Table footer: factory totals.

**Late shipments detail panel** — collapsible card "Late Shipments This Week". Shows only when late count > 0. Table: Shipment#, Customer, Product, Qty, Required Date, Actual Date, Days Late, Reason (text). Click row links to `/shipping/shipments/:id` (cross-module).

**Zero late state:** If late count = 0, show `.alert-green` banner "All shipments this week were on time!" replacing the late shipments panel.

**States:** Loading, Empty, Error, Permission denied — standard patterns.

**Modals triggered:** Export modal.

---

### SCREEN RPT-009 — Integration Health

**Screen ID:** RPT-009
**Route:** `/reporting/integration-health`
**Purpose:** Admin-only. Shows real-time outbox status across all D365 integration stages (1–5 P1, 6+ P2). Monitors DLQ depth, pending event counts, average dispatch latency, failed events in last 24 hours. Surfaces issues before they become critical.

**Access control:** Visible only to `reporting_admin` role. Non-admin attempting this route receives the permission-denied full-page state.

**Layout description:**

Header: breadcrumb "Reporting / Integration Health", title "Integration Health", scoped-to pill, "Last 24 hours" scope label (fixed, no selector — always shows last 24h rolling), Export (CSV only), freshness indicator (2-minute cadence).

**Critical alert banner** — always the topmost element (below header). Conditionally rendered: if any stage has `dlq_depth > 0`, renders `.alert-red` "DLQ messages detected: Stage N has N items in dead-letter queue. Investigate immediately." If all clear: `.alert-green` "All integration stages healthy". If partial warning: `.alert-amber`.

**Summary KPI row** — four `.kpi` cards:
1. Total Pending Events (all stages) — border amber if > 50
2. Total Failed Events (24h) — border red if > 0
3. DLQ Total Depth — border red if > 0
4. Avg Latency (5 min window, ms) — border amber if > 300ms

**Stage status table** — `.card` "Outbox Stages". Columns:
- Stage — text, e.g. "Stage 1 — Items Pull"
- Target System — text, e.g. "D365 Items Pull"
- Pending — numeric
- Dispatching — numeric
- Failed (24h) — numeric, badge-red if > 0
- DLQ Depth — numeric, badge-red if > 0
- Avg Latency (5 min, ms) — numeric, colored: green < 100ms, amber 100–300ms, red > 300ms
- Status — composite badge: `.badge-green` "Healthy" / `.badge-amber` "Warning" / `.badge-red` "Critical"
- Phase — badge-blue "P1" or badge-gray "P2"

Stage 4 (Warehouse EPCIS) and Stage 6 (RMA) rows are present but show `.badge-gray` "P2 — Not Active" in the Status column and all numeric cells show "—".

**Latency trend chart** — `.card` "Avg Dispatch Latency — Last 24h". D3.js multi-line chart. One line per active stage. X-axis: hourly buckets. Y-axis: latency (ms). Reference lines at 100ms (green, target) and 300ms (red, alert threshold). Height 220px.

**DLQ detail card** — rendered only when DLQ depth > 0. Shows a table: Stage, DLQ Table Name, Depth, Oldest Item (timestamp), Sample Error Message (truncated 80 chars). Action button: "Go to DLQ Admin →" links to `/admin/integrations/d365/dlq` (cross-module admin screen).

**States:** Loading (skeleton table and chart), Error ("Could not load integration health data — the outbox views may be initializing"), Permission denied (full-page: "This screen is restricted to Reporting Administrators. Contact your system administrator.").

**Modals triggered:** Export modal (CSV only — no PDF for this screen due to table width).

---

### SCREEN RPT-010 — Rules Usage Analytics

**Screen ID:** RPT-010
**Route:** `/reporting/rules-usage`
**Purpose:** Admin-only. Shows how DSL rules registered in 02-SETTINGS §7.8 are being used: evaluation count per 24h, trigger rate%, average eval latency, rules that have never triggered (orphans). Consumer of `rule_evaluations` audit table via `mv_rules_usage`.

**Access control:** `reporting_admin` only. Same permission-denied behavior as RPT-009.

**Layout description:**

Header: breadcrumb, title "Rules Usage Analytics", date range (defaults last 7 days, max 30 days), Export, freshness (5-minute cadence).

**Summary KPI row** — four `.kpi` cards:
1. Total Rules Registered — count, border blue
2. Rules Active (triggered ≥ 1 in period) — count, border green
3. Rules Never Triggered (in period) — count, border amber if > 0
4. Avg Eval Latency (ms) — border green < 10ms, amber 10–50ms, red > 50ms

**Rules table** — `.card` "Registered DSL Rules". Columns:
- Rule ID — monospace, e.g. `report_access_gate_v1`
- Owner Module — text, e.g. "12-REPORTING"
- Description — short text
- Phase — badge-blue "P1" or badge-gray "P2"
- Eval Count (24h) — numeric, 0 in badge-amber "Inactive" if Phase P1
- Trigger Rate% — numeric1dp (pct of evals that resulted in action)
- Avg Latency (ms) — colored cell same logic as KPI card
- Last Triggered — relative timestamp (e.g. "14 min ago") or "Never" in badge-amber
- Status — badge-green "Active" / badge-amber "Orphan" (never triggered) / badge-gray "P2 Stub"

**Eval latency chart** — `.card` "Eval Latency Trend — Last 7 Days". D3.js line, one line per P1 rule. X-axis: daily. Y-axis: avg latency ms. Reference line at 50ms (amber). Height 200px.

**Rules detail expandable** — Click a rule row to expand an inline panel showing: input schema description, output schema, sample last evaluation JSON (redacted of PII), recent audit log (last 5 evaluations with timestamp, user_id hash, result: allow/deny).

**Orphan rules alert** — if any P1 rule has eval_count = 0 for the period, show `.alert-amber` above the table: "N rule(s) registered as P1 have no evaluations in the selected period. Verify the rule is being called correctly."

**States:** Loading, Empty ("No rule evaluations recorded — rules may not have been triggered yet"), Error, Permission denied.

**Modals triggered:** Export modal.

---

### SCREEN RPT-EXPORTS — Export History

**Screen ID:** RPT-EXPORTS
**Route:** `/reporting/exports`
**Purpose:** User's personal export history from `report_exports` table. Shows all past PDF/CSV exports, their status, file size, format, and download links (for non-archived exports). Displays SHA-256 fingerprint for compliance verification.

**Layout description:**

Header: breadcrumb "Reporting / Export History", title "Export History", date range filter (defaults last 30 days), Format filter (All / PDF / CSV / XLSX), Status filter (All / Completed / Failed), Export (CSV only — meta export of the history itself).

**Summary KPI row** — three `.kpi` cards:
1. Total Exports (period) — count
2. Successful — count border green
3. Failed — count border red if > 0

**Main table** — columns:
- Export # — UUID truncated first 8 chars, monospace
- Dashboard — text link, e.g. "Factory Overview"
- Format — badge: PDF `.badge-red` / CSV `.badge-green` / XLSX `.badge-blue`
- Date Range — text, e.g. "W/E 19/04/2026"
- Exported At — datetime `DD/MM/YYYY HH:MM`
- File Size — e.g. "245 KB"
- Status — badge per 1.5
- SHA-256 (first 16 chars) — monospace, full value on hover tooltip, labeled "Fingerprint"
- Retention Until — date `DD/MM/YYYY`
- Actions — "Download" button (btn-primary, disabled if archived) or "Archived" badge if cold-archived

**Archived state for a row:** If `archived_to_cold_storage = true`, the Download button is replaced with `.badge-gray` "Archived (7-year retention)" and a tooltip "Contact system admin to retrieve from cold storage."

**Failed export row:** Row background `#fef2f2`. Actions column shows "Error details" button (btn-secondary) opening the Error Log Detail modal (see Section 4).

**Retention notice** — below the table, `.alert-blue` static notice: "Exports are retained for 7 years per BRCGS Issue 10 requirements. Files are archived to cold storage after 90 days but remain on record."

**States:** Loading (skeleton), Empty ("You haven't exported any reports yet. Go to any dashboard and click Export."), Error (alert), Permission denied.

**Modals triggered:** Error Log Detail modal.

---

### SCREEN RPT-SAVED — Saved Filter Presets

**Screen ID:** RPT-SAVED
**Route:** `/reporting/saved-filters`
**Purpose:** P1 lightweight saved views. Users with `reporting_manager` role can save a named set of filter parameters (date range, line, shift, product category) for quick reuse on any dashboard. Not full custom report builder (that is P2).

**Layout description:**

Header: breadcrumb "Reporting / Saved Filters", title "Saved Filters", "New Preset" btn-primary button.

**Table** — columns:
- Name — text, e.g. "Line 1 — This Week"
- Dashboard — text (which dashboard this preset applies to)
- Filters Summary — plain text description, e.g. "Line: Line 1, Week: Current"
- Created By — user name
- Created At — relative date
- Last Used — relative date
- Actions — "Apply" (navigates to dashboard with preset filters in URL params), "Edit" (opens modal), "Delete" (opens confirm modal)

**Empty state:** Centered card with "No saved filter presets yet. Create a preset from any dashboard's filter bar — look for the 'Save as preset' option." CTA "Go to Factory Overview" btn-secondary.

**New Preset / Edit Preset modal** — see Section 4.

**States:** Loading (3 skeleton rows), Empty, Error, Permission denied (if not `reporting_manager`).

---

### SCREEN RPT-SETTINGS — Reporting Settings

**Screen ID:** RPT-SETTINGS
**Route:** `/reporting/settings`
**Purpose:** Admin-only. Configures caching policy, row limits, export limits, PDF branding, email sender identity (pulling from 02-SETTINGS §13 Resend), default timezone, and data freshness alert thresholds.

**Access control:** `reporting_admin` only.

**Layout description:**

Header: breadcrumb, title "Reporting Settings". Standard two-column layout: left side is a vertical tab menu (Settings sections), right side is the active form.

**Left tab menu items:**
- General
- Export Limits
- PDF Branding
- Email Delivery (P2 — grayed label: "Requires reporting.scheduled_delivery feature flag")
- Feature Flags
- Data Sources

**Tab: General**

Form fields (`.form-grid` two-column):
- Default Timezone — select from IANA timezone list, e.g. "Europe/London", required
- Default Week Selector — select: Current Week / Previous Week
- Row Limit Default — number input, default 5000, range 100–10000
- Data Freshness Alert Threshold (min) — number input, default 10, tooltip "Show 'Data stale' badge when MV refresh is this many minutes overdue"
- Chart Data Point Limit — number input, default 10000 (server-side aggregation kicks in above this)

"Save Changes" btn-primary. "Reset to Defaults" btn-secondary (opens confirm modal).

**Tab: Export Limits**

- Max CSV Rows — number, default 10000
- Max PDF Rows — number, default 500 (tooltip "PDF generation times out above this; increase cautiously")
- Max File Size (MB) — number, default 100
- Export Rate Limit (per user / 10 sec) — number, default 1 (prevents duplicate export, per V-RPT-EXPORT-6)

"Save" btn-primary.

**Tab: PDF Branding**

- Company Logo — file upload (PNG/JPG, max 2MB), preview thumbnail displayed after upload
- Report Header Text — text input, e.g. "Forza Foods Ltd — Confidential"
- Report Footer Text — text input, e.g. "Generated by Monopilot MES — Page {n} of {N}"
- Color Scheme — select: Default Blue / Custom (shows hex picker if custom)
- Primary Color (custom only) — hex color input, default `#1976D2`
- Include SHA-256 Fingerprint in Footer — toggle, default ON (required for regulatory)

"Save" btn-primary. "Preview PDF" btn-secondary (generates a 1-page sample PDF in a new browser tab).

**Tab: Email Delivery (P2)**

Shown with a `.alert-blue` banner at top: "Email delivery requires the 'reporting.scheduled_delivery' feature flag to be enabled in Feature Flags settings." The form fields are rendered but grayed (input disabled attribute):
- Email Sender Identity — read-only pull from 02-SETTINGS §13: shows the configured Resend sender name and email address. A link "Manage in Settings →" navigates to `/settings/notifications` (cross-module).
- Default Subject Template — text input, e.g. "{{report_name}} — {{period}}"
- Reply-To Address — email input
- Include Unsubscribe Link — toggle

When feature flag is ON, fields become active.

**Tab: Feature Flags**

Read-only view of all `reporting.*` PostHog feature flags for the current tenant. Table: Flag Name | Current State | Description | Set in PostHog. Each row has a "Manage in PostHog →" external link. Flags displayed:
- `reporting.v2_dashboards` — E3 Advanced Analytics rollout
- `reporting.scheduled_delivery` — P2 cron email
- `reporting.external_bi_embed` — P2 Metabase/Grafana
- `reporting.custom_dsl_builder` — P2 SQL-like builder
- `reporting.leaderboard_anonymize` — GDPR operator names
- `reporting.ml_anomaly_detection` — P3

Note at bottom: "Feature flags are managed in PostHog (02-SETTINGS §10). Changes take effect within 60 seconds."

**Tab: Data Sources**

Table of all materialized views with refresh status. Columns:
- View Name — monospace, e.g. `mv_yield_by_line_week`
- Source Tables — comma-separated text
- Refresh Cadence — text, e.g. "Every 2 min (pg_cron)"
- Last Refresh At — datetime, colored red if stale beyond threshold
- Last Duration (ms) — numeric, amber if > 10000ms, red if > 30000ms
- Rows — numeric (last known row count)
- Status — badge: Healthy / Stale / Failed
- Actions — "Force Refresh" btn-secondary (admin only, calls manual refresh endpoint)

"Force Refresh" action: opens a small confirm modal "Refreshing a materialized view locks table reads for up to 5 seconds. Proceed?" with Confirm btn-primary and Cancel btn-secondary.

**States:** Loading (form shimmer), Error (alert banner), Permission denied (full page: "Reporting Settings is restricted to Reporting Administrators.").

---

## 4. Modals

### MOD-EXPORT — Export Report

**Trigger:** Export dropdown button on any dashboard or result screen.
**Width:** 560px standard modal.

**Modal title:** "Export — [Dashboard Name]"

**Form fields:**
- Format — radio group: PDF (default) / CSV / Copy to Clipboard. XLSX shown grayed with "(Phase 2)" label.
- Date Range — display only (shows current filter, read-only in the modal; change it via the dashboard filter before exporting)
- Filters Applied — display only, plain text summary (e.g. "Line: All, Shift: All, Week: W/E 19/04/2026")
- Delivery Method — radio: Download Now (default) / Email (grayed if `reporting.scheduled_delivery` flag off, with tooltip "Enable scheduled delivery in Settings to email exports")
- Email address (only if Email selected) — email input, pre-filled with current user's email, editable

**Estimated row count** — if >500 rows and format = PDF: show `.alert-amber` "PDF generation may take up to 30 seconds for large exports. Consider CSV for faster download." If >10000 rows: `.alert-red` "This export exceeds the maximum of 10,000 rows. Refine your filters or use CSV."

**Buttons:** "Export" btn-primary (disabled during generation) / "Cancel" btn-secondary.

**Loading state inside modal:** After clicking Export, the button changes to a spinner "Generating…" state and a progress message: "Generating PDF, please wait…" or "Streaming CSV…". The Cancel button remains active (triggers run-cancellation confirm).

**Success state:** If Download Now: browser download triggers automatically, modal closes, toast "Export downloaded: Factory_Overview_W19_2026.pdf".

**Error state:** If generation fails (timeout >30s for PDF per V-RPT-EXPORT-7): `.alert-red` inside modal: "PDF generation timed out. Try CSV format instead, or reduce the date range." Action buttons change to "Try CSV" btn-primary and "Close" btn-secondary.

---

### MOD-SAVE-PRESET — Save Filter Preset

**Trigger:** "Save as preset" link button in any dashboard's filter bar (available to `reporting_manager`+).
**Width:** 480px.

**Modal title:** "Save Filter Preset"

**Form fields:**
- Preset Name — text input, required, max 60 chars, placeholder "e.g. Line 1 — Weekly Review"
- Dashboard — read-only text showing current dashboard name
- Filters (read-only summary) — list of active filters shown as read-only chips
- Visible to — radio: Just me (default) / My team (same org, read-only for others)

**Buttons:** "Save Preset" btn-primary / "Cancel" btn-secondary.

**Validation:** Name required, name max 60 chars. Duplicate name: inline error "A preset with this name already exists. Choose a different name or overwrite." with an "Overwrite" btn-secondary appearing.

---

### MOD-SCHEDULE — Schedule Report (P2)

**Trigger:** "Schedule" button on any dashboard (visible only if `reporting_manager`+ and `reporting.scheduled_delivery` flag ON).
**Width:** 560px. Two-step wizard inside the modal.

**Step 1 — Cadence & Filters:**
- Report Name — text, required, pre-filled with dashboard name + date
- Dashboard — read-only
- Cadence — select: Daily / Weekly / Monthly / Period-End (fiscal). Sub-field shown per selection:
  - Daily: Time (HH:MM select, default 07:00), Timezone (select)
  - Weekly: Day of week (Mon–Sun checkboxes), Time, Timezone
  - Monthly: Day of month (1–28 select), Time, Timezone
  - Period-End: Automatically fires on fiscal period end date per 02-SETTINGS §8
- Skip if No Data — toggle, default ON, tooltip "Do not send email if report returns zero rows"
- Filter Snapshot — checkboxes showing which current filters to bake into the schedule (Line, Shift, Product Category). Filters not checked will use "All" at send time.

**Step 2 — Recipients & Format:**
- Recipients — tag input, each tag is an email address or a user name from the org. Validate each email per V-RPT-SCHEDULE-3. Placeholder "Type email or select team member…"
- Add recipient group — link opens MOD-RECIPIENT-GROUP modal
- Format — radio: PDF (default) / CSV
- Subject Template — text input, default `{{report_name}} — {{period}}`, tooltip showing available variables: `{{report_name}}`, `{{period}}`, `{{week}}`, `{{generated_at}}`
- Preview subject — live preview of rendered subject below the input

**Buttons (Step 1):** "Next →" btn-primary / "Cancel" btn-secondary.
**Buttons (Step 2):** "← Back" btn-secondary / "Activate Schedule" btn-primary.

**Success:** Modal closes, toast "Scheduled report created. First delivery: [next run date]." Redirects to `/reporting/scheduled`.

**Validation:** Recipients empty → "Add at least one recipient" error (V-RPT-SCHEDULE-2). Invalid cron → "Invalid schedule configuration" (V-RPT-SCHEDULE-1).

---

### MOD-SHARE — Share Report Link

**Trigger:** "Share" icon button (chain-link icon) on any dashboard.
**Width:** 480px.

**Modal title:** "Share — [Dashboard Name]"

**Fields:**
- Shareable Link — read-only text input with the URL (current URL with filters encoded as query params). "Copy" btn-secondary beside it.
- Link Expiry — select: 7 days / 30 days / 90 days / Never
- Require Login — toggle, default ON (tooltip "If OFF, anyone with the link can view. Not recommended for regulatory data.")
- Note below Require Login toggle: "External sharing without login is disabled for regulatory dashboards (QC Holds, Inventory Aging)."

**Buttons:** "Copy Link" btn-primary / "Close" btn-secondary.

---

### MOD-DELETE-CONFIRM — Delete / Deactivate Confirm

**Trigger:** "Delete" action on saved presets, scheduled reports.
**Width:** 400px.

**Modal title:** "Delete [item name]?"

**Content:** "This action cannot be undone. [Contextual warning depending on item type — e.g. for scheduled reports: 'All pending deliveries will be cancelled.']"

**Buttons:** "Delete" btn-danger / "Cancel" btn-secondary.

---

### MOD-ERROR-LOG — Export Error Log Detail

**Trigger:** "Error details" button on a failed export row in RPT-EXPORTS.
**Width:** 560px.

**Content:**
- Export ID — monospace UUID
- Dashboard — text
- Format — text
- Attempted At — datetime
- Error Code — monospace
- Error Message — full text in a monospace pre-formatted block (scrollable max-height 200px)
- Suggested Action — plain text (e.g. "Reduce the date range and retry, or use CSV format for large exports")

**Buttons:** "Retry Export" btn-primary / "Close" btn-secondary. "Retry Export" closes the modal and reopens MOD-EXPORT pre-filled with the same parameters.

---

### MOD-REGULATORY-SIGNOFF — Regulatory Export Sign-off (P2)

**Trigger:** "Sign & Export" button on regulatory report screens (P2 only — requires `reporting.scheduled_delivery` flag and 21 CFR Part 11 mode).
**Width:** 560px.

**Modal title:** "Sign & Export — [Regulatory Report Name]"

**Content:**
- Report summary (read-only): Dashboard, Date Range, Record Count, SHA-256 hash preview
- Regulation reference (read-only): e.g. "BRCGS Issue 10 §3.4" or "FSMA 204 §2"
- Signatory — read-only: current user's full name and role
- PIN Verification — password input (not text) labeled "Enter your PIN to sign", tooltip "Uses the same PIN as your quality sign-offs (09-QUALITY §5.3 pattern)". Required.
- Declaration text (read-only, styled `.alert-blue`): "By entering your PIN, you confirm that this report accurately reflects data in Monopilot MES at the time of export. This record is immutable and subject to 7-year retention per BRCGS Issue 10."

**Buttons:** "Sign & Download PDF" btn-primary (disabled until PIN entered) / "Cancel" btn-secondary.

**Error state:** If PIN incorrect: inline error under PIN input "Incorrect PIN. You have N attempts remaining." After 3 failed attempts: "Sign-off locked. Contact system administrator."

---

### MOD-REFRESH-CONFIRM — Force Refresh Confirm

**Trigger:** "Force Refresh" button on RPT-SETTINGS Data Sources tab.
**Width:** 400px.

**Content:** "Refreshing [View Name] will trigger an immediate CONCURRENTLY refresh. Table reads will continue uninterrupted (zero downtime). This may take up to 30 seconds. Proceed?"

**Buttons:** "Refresh Now" btn-primary / "Cancel" btn-secondary.

**Loading state:** After confirming, button changes to spinner "Refreshing…". Modal stays open. On completion: success toast "Materialized view refreshed successfully in Ns." Modal closes.

---

### MOD-RECIPIENT-GROUP — Manage Recipient Group (P2)

**Trigger:** "Add recipient group" link inside MOD-SCHEDULE Step 2.
**Width:** 480px.

**Content:**
- Group Name — text input, required
- Members — tag input with user search, add by email or select team member from org
- Table of current group members: Name, Email, Role, Remove action

**Buttons:** "Save Group" btn-primary / "Cancel" btn-secondary.

---

## 5. Flows

### Flow 1 — Export from Dashboard (P1)

1. User views any P1 dashboard (e.g. Factory Overview).
2. User clicks "Export" dropdown in the dashboard header. Dropdown shows: PDF, CSV, Copy to Clipboard.
3. User selects "PDF".
4. MOD-EXPORT opens. Confirms format = PDF, shows date range, row estimate.
5. If row count > 500: `.alert-amber` warning shown. User proceeds.
6. User clicks "Export". Modal shows spinner "Generating PDF…".
7. Edge function (Puppeteer) renders print-optimized view. Duration ~5–25 seconds.
8. On success: browser download triggers (filename pattern: `factory-overview_WE-20260419.pdf`). Modal closes. Toast "Export downloaded."
9. `report_exports` row written: user_id, dashboard_id, format='pdf', sha256_hash, exported_at, retention_until (7 years).
10. Export visible in RPT-EXPORTS history.

**Error path:** If edge function times out (>30s per V-RPT-EXPORT-7): `.alert-red` in modal with suggestion to use CSV. User clicks "Try CSV", modal resets to CSV format.

---

### Flow 2 — Save Filter Preset (P1)

1. User (reporting_manager+) sets filters on any dashboard (line = Line 1, week = current).
2. In the filter bar, user clicks "Save as preset" link button.
3. MOD-SAVE-PRESET opens. Name pre-filled with dashboard + date.
4. User renames to "Line 1 — Weekly Review", selects "Just me".
5. Clicks "Save Preset". Toast "Preset saved. Access it from Saved Filters."
6. Preset appears in RPT-SAVED. On that screen, "Apply" button appends `?preset=line1-weekly-review` to the dashboard URL, restoring the filters.

---

### Flow 3 — Schedule Report (P2)

1. User (reporting_manager+) views Factory Overview with desired filters set.
2. Clicks "Schedule" button (visible only when `reporting.scheduled_delivery` flag = ON).
3. MOD-SCHEDULE Step 1 opens. User sets cadence = Weekly, Day = Monday, Time = 07:00 AM, Timezone = Europe/London. Skip if No Data = ON.
4. User clicks "Next →".
5. Step 2: user adds recipients (types email addresses or selects team members). Format = PDF. Subject template = "Factory Overview — {{period}}".
6. User clicks "Activate Schedule".
7. `scheduled_reports` row created. `next_run_at` computed from cron expression.
8. Modal closes. Toast "Scheduled report created. First delivery: Mon 27/04/2026 at 07:00 AM BST."
9. Row appears in Scheduled Reports list at `/reporting/scheduled`.

**Scheduled delivery execution path (automated, no UI):**
1. pg_cron fires `scheduled_report_distribution_v1` at next_run_at.
2. Rule evaluates filter_dsl, renders report via export engine.
3. Resend API called with sender identity from 02-SETTINGS §13, recipients from scheduled_reports.recipients JSONB, attachment.
4. `report_deliveries` row written per recipient.
5. `scheduled_reports.last_run_at` and `last_status` updated.
6. If delivery fails: retry schedule (5 min / 30 min / 2h / 12h / 24h). DLQ after 5 attempts (V-RPT-SCHEDULE-4).
7. Failed delivery: admin notification toast on next login to RPT-SETTINGS. Badge on sidebar "Reporting" entry showing count.

---

### Flow 4 — Drill-down from Factory Overview to Yield by SKU

1. User on Factory Overview `/reporting/factory-overview?week=2026-W16`.
2. User clicks a row in the "All Lines Summary" table (e.g. Line 1 row).
3. Navigation: `/reporting/yield-by-line?line=LINE-01&week=2026-W16`. Week param preserved.
4. Yield by Line screen shows filter chip "Line: Line 1" active.
5. User clicks "Drill →" on a specific SKU row.
6. Navigation: `/reporting/yield-by-sku?line=LINE-01&product=FG-NUGGET-1K&week=2026-W16`.
7. Yield by SKU screen opens with expanded inline panel for that SKU, showing 13-week trend chart.
8. Breadcrumb shows: "Reporting / Factory Overview / Yield by Line / Yield by SKU". Each segment is a link with preserved week param.
9. User clicks "View all runs →" in the inline SKU panel.
10. Cross-module navigation to `/production/work-orders?product=FG-NUGGET-1K`, opening in same tab.

---

### Flow 4b — Cross-Module Navigation from QC Holds to Quality Hold Detail

1. User on QC Holds dashboard `/reporting/qc-holds?date=2026-04-20`.
2. Table shows a row: Line 2 / Chicken Nuggets / Reason: Foreign Body / Severity: Critical / Boxes Held: 48 / Status: Open.
3. User clicks "View in QA →" in the Actions column.
4. Browser navigates to `/quality/holds/QH-20260420-003` (cross-module, same tab).
5. 09-QUALITY screen opens showing the full hold record: investigation notes, assigned QA inspector, escalation chain.
6. The back button and breadcrumb in 09-QUALITY do not link back to 12-REPORTING (each module manages its own breadcrumb). The user must use browser back or click "Reporting" in the sidebar.

---

### Flow 5 — Row-Level Security Scope Enforcement

1. User "Anna" (reporting_viewer, accessible sites: [Site-B only]) opens `/reporting/factory-overview`.
2. API call: `GET /api/reporting/factory-overview?week=2026-W16`.
3. DSL rule `report_access_gate_v1` evaluates: user.role = reporting_viewer → ALLOW for factory-overview.
4. Service layer appends `WHERE org_id = 'tenant-uuid' AND (site_id = 'site-b-uuid' OR site_id IS NULL)` to MV query.
5. Result: Anna sees only Site B data. The scoped-to pill reads "Scoped to: Site B" in `.badge-blue`.
6. Anna attempts `GET /api/reporting/factory-overview?week=2026-W16&site_id=site-a-uuid` (attempting to access Site A).
7. Rule step 4 fires: site_id NOT IN user.accessible_sites → DENY. API returns 403. `report_access_audits` row written with result='deny'.
8. UI: full-page `.alert-red` "Access denied. You are not authorized to view data for Site A. Contact your administrator."

---

### Flow 5b — Integration Health: DLQ Investigation

1. Admin user on Integration Health dashboard `/reporting/integration-health`.
2. Critical alert banner shows: "DLQ messages detected: Stage 2 (D365 WO Confirm) has 3 items in dead-letter queue."
3. DLQ Detail card is visible below the latency chart. Shows: Stage 2, Table `d365_push_dlq`, Depth 3, Oldest Item "2026-04-20 06:14:00", Sample Error "HTTP 503 — D365 endpoint unreachable".
4. User clicks "Go to DLQ Admin →". Navigates to `/admin/integrations/d365/dlq` (cross-module admin screen owned by 02-SETTINGS / Integrations admin).
5. In the DLQ admin screen (out of scope for 12-REPORTING — that screen is spec'd in 02-SETTINGS), user can requeue or discard DLQ items.
6. After the admin resolves the DLQ, the next MV refresh (within 2 minutes) picks up the updated outbox state.
7. User returns to Integration Health; the critical banner is gone; Stage 2 row shows `.badge-green` "Healthy".

---

### Flow 6 — Regulatory Export with Sign-off (P2, BRCGS)

1. QA Manager (reporting_manager + compliance officer role) navigates to `/reporting/regulatory/brcgs-audit-package` (P2 route).
2. Sets parameters: date range (past 12 months), site.
3. Clicks "Run Report". Report renders: multi-section preview (HACCP, CCP log, allergen changeover, batch records, holds & NCRs).
4. User reviews rendered report in the result view.
5. Clicks "Sign & Export PDF". MOD-REGULATORY-SIGNOFF opens.
6. User enters PIN. Declaration text shown.
7. User clicks "Sign & Download PDF".
8. Edge function renders full regulatory PDF bundle with: signature block (name, role, timestamp, PIN hash), regulation references (BRCGS Issue 10 §), SHA-256 fingerprint in footer.
9. PDF downloaded. `report_exports` row written with sha256_hash, retention_until = +7 years.
10. Audit trail entry in `report_access_audits`: result='allow', action='regulatory_sign_and_export'.
11. Export row appears in RPT-EXPORTS with `.badge-red` "PDF" badge and "Fingerprint: abc123de…" in compliance column.

---

## 6. Empty / Zero / Onboarding States

### Fresh install (no data yet)

When the system is first set up and no WOs have been completed:

- RPT-HOME catalog: All 10 dashboard cards render but every one shows "No data yet" badge. Clicking a card shows the dashboard layout with all KPI cards displaying "—" values and an onboarding helper card at the top.
- Onboarding helper card (`.alert-blue` at top of each dashboard): "This dashboard will populate once work orders are completed in 08-PRODUCTION. Typically after your first production batch." With a "Go to Production →" link.
- RPT-SAVED: "You haven't saved any filter presets yet. Create a preset from any dashboard's filter bar." CTA "Go to Factory Overview" btn-secondary.
- RPT-EXPORTS: "No exports yet. Go to any dashboard and click Export to create your first report."

### Zero-state per dashboard

- Factory Overview: All KPI cards show "—". Chart area shows empty axes with label "No production data for this week." Top 3 panels show "No lines to rank — data will appear after the first work order is completed."
- QC Holds: Full green zero-state: large checkmark, "No quality holds today — all clear!"
- OEE Summary: If 15-OEE has no data: "OEE data unavailable — the 15-OEE module has not recorded data for today yet."
- Inventory Aging: "No inventory records found. Stock will appear after the first warehouse receipt."
- WO Status: "No work orders for today. Create work orders in Planning."
- Shipment OTD: "No shipments this week. Shipment data will appear after the first sales order is dispatched."
- Integration Health: "All outbox stages are empty — no events recorded in the last 24 hours. This may indicate no production activity."
- Rules Usage: "No rule evaluations recorded. Rules will appear once users interact with the system."

---

## 7. Notifications, Toasts, Alerts

### Toast notifications (bottom-right, auto-dismiss 4 seconds unless error)

| Trigger | Toast type | Message |
|---|---|---|
| Export downloaded successfully | Success (green) | "Export downloaded: filename.pdf" |
| Export generation failed | Error (red, persistent) | "Export failed — [reason]. Try again or use CSV." |
| Scheduled report created | Success | "Scheduled report activated. First delivery: [date]." |
| Scheduled report disabled after 5 failures | Warning (amber, persistent) | "Scheduled report '[name]' was disabled after 5 delivery failures. Review in Settings." |
| Scheduled delivery failed | Warning | "Delivery failed for '[report name]' — retrying in 5 min. [N attempts remaining]." |
| Large export ready (background job, P2) | Info (blue) | "Your large export is ready for download." with "Download" action button |
| Filter preset saved | Success | "Preset saved: [name]" |
| Preset deleted | Info | "Preset deleted." with "Undo" action (5 second window) |
| Data source force refresh completed | Success | "Materialized view refreshed in Ns." |
| Permission denied (403) | Error (persistent) | "Access denied. You do not have permission to view this report." |
| Results truncated (>10k rows) | Warning (persistent) | "Results are limited to 10,000 rows. Apply filters to see complete data." |
| Cache stale (>threshold) | Warning | "Data may be up to [N] minutes old. Click refresh to update." |
| Run cancellation | Info | "Export cancelled." |

### In-page alert banners

- RPT-001 through RPT-010 all show a stale-data banner when `(now() - last_refresh_at) > alert_threshold_minutes` (configurable in RPT-SETTINGS, default 10 min): `.alert-amber` "Data may be stale — last refreshed [N] minutes ago. Click refresh to trigger update."
- RPT-009 Integration Health: persistent critical banner if DLQ > 0 (`.alert-red`).
- RPT-004 QC Holds: critical holds alert panel (`.alert-red`) when critical holds > 0.
- RPT-005 OEE Summary: dependency notice strip (`.alert-blue`) always visible.

### Sidebar badge

The "Reporting" sidebar item shows a red badge (count) when:
- Any scheduled report delivery has failed (P2)
- Any MV refresh has failed 3 consecutive times

Badge disappears once the user visits RPT-SETTINGS and acknowledges the alert.

---

## 8. Responsive Notes

**Desktop-first.** Minimum supported width: 1024px for full dashboard experience (sidebar 220px + content 804px+).

**Tablet (768–1279px):**
- Sidebar collapses to icon-only mode (40px wide) by default; tap icon expands overlay sub-nav.
- KPI row reflows from 5-col to a 3+2 arrangement (first 3 cards full width, last 2 cards in a grid below).
- Charts shrink to fit container width; tooltips remain functional.
- Tables enable horizontal scroll with a shadow scroll indicator on the right edge.
- Export and filter dropdowns remain usable via tap.

**Mobile (< 768px):**
- Sidebar is hidden; a hamburger button (top-left) opens a full-screen nav overlay.
- KPI cards stack to 2-per-row.
- Tables: horizontal scroll with fixed first column (Line or SKU name).
- Charts: minimum height 200px, simplified X-axis labels (show every other).
- The Ad-hoc Builder (P2) is desktop-only; on mobile it shows a `.alert-amber` "The report builder requires a desktop browser."
- Export continues to work on mobile (PDF and CSV).
- RPT-SETTINGS: single-column layout, left tab menu collapses to a top dropdown.

**Print / PDF export mode:**
- `@media print` stylesheet applied by the edge function (Puppeteer):
  - Sidebar hidden, no print.
  - Header row: Logo (from PDF Branding settings), Report Title, Date Range, "Scoped to: [site]", Generated At timestamp.
  - KPI cards printed in a 5-column grid if width allows; 3-column fallback for A4 portrait.
  - Charts: D3.js SVG rendered natively — preserves vector quality in PDF.
  - Footer: Company name, "Page N of N", SHA-256 fingerprint (first 16 chars), "Generated by Monopilot MES".
  - Page breaks inserted between major sections (KPIs, charts, tables).
  - Color-coded cells retain background colors in print (use `-webkit-print-color-adjust: exact`).

---

## 9. P2 Screens — Placeholder Descriptions

The following P2 screens are listed here so the designer can create placeholder frames with "Coming in Phase 2" banners. Each placeholder uses the standard dashboard layout with all interactive elements grayed and a centered `.alert-blue` card: "This dashboard is coming in Phase 2 (E3 Advanced Analytics rollout). It will be enabled automatically when the `reporting.v2_dashboards` feature flag is activated for your organization."

**RPT-P2-001 — Giveaway Analysis** (`/reporting/giveaway-analysis`): Per-line GA%, SKU drill-down, 13-week factory GA trend, GA by supervisor (E3).

**RPT-P2-002 — Leader Scorecard** (`/reporting/leader-scorecard`): Per-leader A/B/C/D grade based on multi-component scoring (Yield + GA + Efficiency). Grading thresholds from 02-SETTINGS `grade_thresholds`.

**RPT-P2-003 — Daily Issues Analysis** (`/reporting/daily-issues`): Top 3 downtime events, People/Process/Plant breakdown with hierarchical categories, AM/PM split.

**RPT-P2-004 — Shift Performance Overview** (`/reporting/shift-performance`): 7 primary KPIs, hourly efficiency trend, line heatmap (line × hour cell colored by efficiency%).

**RPT-P2-005 — Supervisor Team Comparison** (`/reporting/supervisor-comparison`): Multi-team trend comparison, potential savings calculation.

**RPT-P2-006 — Period Reports 4-4-5** (`/reporting/period-reports`): P1–P13 table with P/P and Y/Y comparison, year-end summary. Driven by `fiscal_periods` table from 02-SETTINGS §8.

**RPT-P2-007 — NCR Trend Dashboard** (`/reporting/ncr-trend`): NCRs per month rolling 13m, root cause breakdown, MTTR by severity.

**RPT-P2-008 — Lot Genealogy Report** (`/reporting/lot-genealogy`): FSMA 204 recursive CTE forward+backward trace. Lot# or LP# input. PDF export for recall response.

**RPT-P2-009 — WIP Dashboard** (`/reporting/wip-dashboard`): Consumer 10-FINANCE `wip_balances`. Per-line/per-product WIP value.

**RPT-P2-010 — Cost Variance Analysis** (`/reporting/cost-variance`): Consumer 10-FINANCE yield variance + waste cost. MPV/MQV breakdown (P2 full variance decomposition).

**RPT-P2-011 — Customer Fulfillment** (`/reporting/customer-fulfillment`): Per-customer OTD, backorders, fulfillment trend.

**RPT-P2-012 — Operator Leaderboard** (`/reporting/operator-leaderboard`): Consumer 08-PRODUCTION `operator_kpis_monthly` MV. GDPR: display full name or initials per `reporting.leaderboard_anonymize` flag.

**RPT-P2-013 — Regulatory Export Package** (`/reporting/regulatory`): BRCGS audit bundle + FDA 483 response. Multi-section preview with e-signature MOD-REGULATORY-SIGNOFF.

The placeholder for RPT-P2-013 requires slightly more detail because the designer must know the structural expectations even in the placeholder state:

**Placeholder layout for RPT-P2-013:** Standard breadcrumb header "Reporting / Regulatory Export Package". Page title "Regulatory Export Package". A `.alert-blue` banner at the very top: "Regulatory export is coming in Phase 2. It will bundle HACCP plans, CCP monitoring logs, allergen changeover records, batch genealogy, and quality hold records into a signed PDF package." Below the banner: a grayed-out wireframe card showing the intended parameter form (report type: BRCGS Audit / FDA 483 Response / Allergen Declaration / FSMA 204 Lot Genealogy; date range; site; and a "Sign & Export" button in disabled state). A regulation reference strip below the form: "References: BRCGS Issue 10 §3.4, FSMA 204 (2028), EU 1169/2011, 21 CFR Part 11 (e-signature)."

The active (P2, non-placeholder) design of this screen must include:
- **Section preview panel:** After parameters are entered and "Run Preview" is clicked, an accordion-style panel appears with one collapsible section per report component. Each section shows a header (regulation reference, record count, date range covered) and a "View sample" link opening a lightbox with a sample rendered page.
- **Signature block** (visible in the preview): A bordered box at the bottom of each section preview reading: "Signed by: [Full Name] | Role: [QA Manager] | Timestamp: [ISO 8601] | PIN verified: [Yes] | SHA-256: [hash 16 chars…]". This block is automatically populated when the sign-off flow completes.
- **Immutability notice:** After signing and exporting, the page shows a `.alert-green` "This report has been signed and exported. The signed copy is archived for 7 years. You cannot re-sign the same parameter set — create a new export if needed." The "Sign & Export" button is replaced by a "Download Archive Copy" btn-secondary and a "View Export Record" link to RPT-EXPORTS.

**Regulatory report types and their required parameters:**

| Type | Required Parameters | Regulation |
|---|---|---|
| BRCGS Audit Bundle | Date range (12 months), Site | BRCGS Issue 10 |
| FSMA 204 Lot Genealogy | Lot# or LP# (required), Direction (Forward/Backward/Both) | FSMA 204 |
| Allergen Declaration | Product (select) or All Products, Date | EU 1169/2011 |
| FDA 483 Response Package | Date range, Inspection reference# (text, optional) | 21 CFR Part 11 |
| Temperature Log (CCP) | Date range, CCP point (select from `ccp_monitoring_points`), Site | HACCP / BRCGS |

---

## 10. Common Components & Interaction Patterns

The following components appear across multiple screens. The designer must implement them once and reuse consistently.

### 10.1 Dashboard Page Shell

Every dashboard screen (RPT-001 through RPT-010) uses the same outer shell:

**Breadcrumb row** — 12px `--muted` text. "Reporting" is always the root segment, styled as a link (`--blue`) that navigates to `/reporting`. Each subsequent segment is a link except the last (current page), which renders in `--text` color. Format: "Reporting / Factory Overview" or "Reporting / Yield by Line / Yield by SKU".

**Page title row** — Flexbox `justify-content: space-between`, `align-items: center`. Left side: 20px bold page title, then the scoped-to pill (`.badge-blue`, 11px, text "Scoped to: [Site Name]" or "Scoped to: All Sites" for admins with cross-site). Right side: row of controls in this order (left to right): Week Selector (or Date Picker for day-level screens), any context filters (Line, Shift, Product), Export dropdown button, manual Refresh icon button.

**Freshness strip** — a single line below the title row. Left: "Data as of: HH:MM" in 11px `--muted`. If stale (beyond threshold): append `.badge-amber` "Data stale — N min ago". Right: "Refreshes every N min" in 11px `--muted`. The refresh cadence shown is dashboard-specific (2 min for production MVs, 5 min for QC/inventory/shipment).

**Main content area** — `background: var(--bg)`, padding 0 (the page shell provides outer padding). Cards within use `.card` class with `margin-bottom: 12px`.

### 10.2 Week Selector Component

Present on all weekly-granularity dashboards (RPT-001, RPT-002, RPT-003, RPT-008).

A dropdown-style button. Closed state: shows current week in format "W/E DD/MM/YYYY" with a small calendar icon left and a chevron-down right. Width 180px. On click: opens a popover panel (width 240px) containing:
- Navigation row: "←" previous week button, current month/year label in center, "→" next week button.
- A list of the 5 most recent week-ending Saturdays as radio options (highlighted in `--blue` if selected).
- An "Older weeks…" expandable link that reveals a date picker calendar for selecting any past week.
- A "This week" quick-select button at the bottom.

Selected week is stored in URL query param `?week=YYYY-Www` (ISO 8601 week number format, e.g. `?week=2026-W16`). All navigation within a session preserves the week param.

### 10.3 Export Dropdown Button

Present on all dashboard screens. A split button: left part shows "Export" label + an export-format icon, right part shows a chevron-down arrow that opens the dropdown. The left part directly triggers the last-used format (or PDF on first use). The dropdown contains:
- "Export as PDF" — icon + label
- "Export as CSV" — icon + label
- "Copy to Clipboard" — icon + label (copies tab-separated values of the main table to the OS clipboard)
- Divider
- "Export as XLSX" — icon + label + `.badge-gray` "Phase 2" badge (disabled, no click handler)

Each format option triggers MOD-EXPORT pre-set to that format.

### 10.4 Filter Bar Pattern

All dashboards with contextual filters render a filter bar as a horizontal row of components below the page title row (and above the freshness strip). Components rendered left-to-right:
- Context filters: dropdown selects (Line, Shift, Product Category — shown only for relevant dashboards)
- Active filter chips: each active (non-default) filter renders as a small chip with the label value and an "×" remove button. Removing a chip resets that filter to "All".
- "Clear all" link (shown only when at least one non-default filter is active)
- "Save as preset" link (shown only for `reporting_manager`+)

Filter state is always encoded in URL query params so the page is shareable and bookmarkable.

### 10.5 Drill-down Breadcrumb

When a user has drilled from one dashboard into another (e.g., Factory Overview → Yield by Line → Yield by SKU), the breadcrumb expands to show the full navigation path. Each segment is a link that navigates back preserving the week/date param. A "← Back" button also appears at the left of the title row (in addition to the breadcrumb) for discoverability.

### 10.6 KPI Card Variants

All KPI cards use the `.kpi` base class from the design system. In 12-REPORTING the bottom border color communicates health:

- **Blue border** (`--blue`): neutral / count metrics (Total Cases, Active WOs, Total Rules Registered)
- **Green border** (`--green`): metric is at or above target
- **Amber border** (`--amber`): metric is within warning range (e.g. within 3% below target yield, OTD 90–95%)
- **Red border** (`--red`): metric is at or below critical threshold

Each KPI card contains:
- `.kpi-label` — 11px `--muted` text, one line max
- `.kpi-value` — 26px bold, the main metric value
- `.kpi-change` — 11px, showing delta vs prior period with directional arrow (↑ / ↓ / →) colored green/red/gray
- Optional: a sub-label in 10px `--muted` below `.kpi-change` showing the comparison basis ("vs last week" / "vs target")

### 10.7 Scheduled Reports List Screen (P2)

**Screen ID:** RPT-SCHED
**Route:** `/reporting/scheduled`
**Access:** `reporting_manager` and `reporting_admin`. Visible in sub-nav only when `reporting.scheduled_delivery` flag is ON for the tenant; otherwise hidden and direct URL access shows the permission-denied state with message "Scheduled reports require the delivery feature to be enabled. Contact your admin."

**Purpose:** Central management of all scheduled reports for the organization. Shows schedule status, next run time, last delivery outcome, and inline controls for pause/resume/delete.

**Layout description:**

Header: breadcrumb "Reporting / Scheduled Reports", title "Scheduled Reports", "New Schedule" btn-primary (navigates to `/reporting/scheduled/new`), Export (CSV).

**Summary KPI row** — three `.kpi` cards:
1. Active Schedules — count, border green
2. Paused Schedules — count, border amber if > 0
3. Failed (last 24h) — count, border red if > 0

**Main table** — columns:
- Name — text link, click navigates to `/reporting/scheduled/:id` edit screen
- Dashboard — text
- Cadence — natural-language description, e.g. "Every Monday at 07:00 AM BST" or "Daily at 19:00 GMT"
- Next Run — datetime, formatted `DD/MM/YYYY HH:MM tz`. Red if overdue (past_due status).
- Last Run — relative timestamp, e.g. "2 hours ago" with outcome badge: `.badge-green` "Delivered" / `.badge-red` "Failed" / `.badge-amber` "Partial"
- Recipients — count, e.g. "3 recipients". Hover tooltip shows email list.
- Format — badge: PDF `.badge-red` / CSV `.badge-green`
- Status — badge: `.badge-green` "Active" / `.badge-amber` "Paused" / `.badge-red` "Failed (DLQ)"
- Failure Count — numeric, badge-red if ≥ 3
- Actions — three-dot menu: Edit / Pause (or Resume if paused) / Run Now / Delete

**Run Now** action: sends the report immediately regardless of cadence. Opens a small inline confirmation popover "Run and deliver now to all N recipients?" with Confirm and Cancel.

**Failed (DLQ) status row** — row background `#fef2f2`. Actions menu gains an additional "View Error Log" item opening MOD-ERROR-LOG.

**Empty state:** "No scheduled reports set up yet. Schedule a report from any dashboard by clicking Export → Schedule, or click New Schedule." CTA "Go to Factory Overview" btn-secondary.

**States:** Loading (3 skeleton rows), Empty, Error, Permission denied.

**Modals triggered:** MOD-DELETE-CONFIRM on delete, MOD-ERROR-LOG on error log view.

---

### SCREEN RPT-SCHED-EDIT — Scheduled Report Create / Edit

**Screen ID:** RPT-SCHED-EDIT
**Route:** `/reporting/scheduled/new` (create) and `/reporting/scheduled/:id` (edit)
**Access:** `reporting_manager` and `reporting_admin`.
**Purpose:** Full-form create/edit for a scheduled report. Exposes all schedule parameters in a single-page form (not a modal wizard — the multi-field nature warrants a dedicated page).

**Layout description:**

Header: breadcrumb "Reporting / Scheduled Reports / [New Schedule | Edit: Schedule Name]", page title "New Scheduled Report" or "Edit: [name]". For edit mode: "Last run: [datetime]" and outcome badge in header.

Two-column layout (`.grid-2`): Left column (form), Right column (preview/summary card).

**Left column — form sections:**

Section 1: "Report"
- Report Name — text, required, max 80 chars
- Dashboard — select dropdown populated from `dashboards_catalog` (P1 dashboards only, plus P2 where flag is ON). Required.
- Filter Snapshot — after dashboard is selected, the available filters for that dashboard appear as form fields (Line select, Shift select, Product Category select). Pre-filled from current saved state if editing.

Section 2: "Cadence"
- Schedule Type — radio: Preset / Custom Cron
  - Preset: radio group: Daily / Weekly / Every 2 weeks / Monthly / Period-End
  - Daily: Time select (every 30 min from 00:00 to 23:30), Timezone select
  - Weekly: Day of week checkboxes (Mon–Sun), Time, Timezone
  - Every 2 weeks: Same as Weekly
  - Monthly: Day of month select (1–28, with note "Day 29–31 may skip some months"), Time, Timezone
  - Period-End: Auto — fires on fiscal period end per 02-SETTINGS §8. Timezone displayed (read-only from org settings). Note: "Period end dates are determined by your fiscal calendar (4-4-5 or calendar months)."
  - Custom Cron: text input showing cron syntax, e.g. `0 7 * * 1`. A "Validate" btn-secondary checks the expression via API (V-RPT-SCHEDULE-1). Below the input: "Next 3 runs:" computed server-side and shown as a list.
- Skip if No Data — toggle, default ON. Tooltip: "Skip this delivery run if the report returns zero rows."

Section 3: "Recipients"
- Recipients tag input — search users by name or type email address. Each tag shows avatar + name or email. Required (V-RPT-SCHEDULE-2). Min 1.
- Recipient groups — link button "Add group" opens MOD-RECIPIENT-GROUP.
- Format — radio: PDF / CSV. Shown per schedule (not per-recipient in P1).
- Subject Template — text, required, default `{{report_name}} — {{period}}`. Live preview below.
- Reply-To — email, optional.
- Conditional Send — toggle label "Send only if data changed since last run" (P2 — grayed with "(Phase 2)" label).

Section 4: "Retry Policy"
- Max Retries — number select: 1 / 2 / 3 / 5 (default 5). Tooltip: "After N failed attempts, the schedule is moved to DLQ and disabled."
- Retry Intervals — read-only display: "5 min → 30 min → 2h → 12h → 24h (then DLQ)". This matches V-RPT-SCHEDULE-4.

**Right column — live summary card:** `.card` with `.card-title` "Schedule Summary". Shows a read-only preview of all entered values. Updates live as the user types. Also shows:
- "Next N runs:" — a list of 3 upcoming run datetimes (computed when cadence is set)
- "Estimated recipients: N"
- "Estimated report size: PDF ~NMB / CSV ~NKB" (rough estimate based on last run of the dashboard)

**Buttons:** "Save Schedule" btn-primary (disabled if form invalid) / "Cancel" btn-secondary / For edit mode: "Pause Schedule" btn-secondary (toggles to "Resume Schedule" if paused) / "Delete Schedule" btn-danger.

**Validation inline errors:**
- Report Name empty: "Name is required"
- No dashboard selected: "Select a dashboard"
- Invalid cron expression: "Invalid cron expression — example: 0 7 * * 1 (every Monday at 07:00)"
- No recipients: "Add at least one recipient"
- Invalid recipient email: "Invalid email: [value]"

**States:** Loading (form shimmer on edit mode fetching existing data), Save in progress (buttons show spinner), Saved (toast "Schedule saved", redirect to `/reporting/scheduled`), Error (`.alert-red` below form buttons).

---

## 11. Open Questions for Designer

1. **Chart library rendering consistency:** D3.js SVG charts and Recharts components must visually match on the same screen (e.g., Factory Overview uses both). Define a shared tooltip design pattern and axis style guide so both libraries render identically styled axes, gridlines, and tooltips.

2. **SQL gating UX (P2 custom DSL builder):** The `reporting.custom_dsl_builder` flag gates a SQL-like query mode. How should the toggle from visual filters to SQL be presented — a discrete "Advanced" tab, a slide-out panel, or a full-screen code editor? This affects layout planning for RPT-P2 builder screens.

3. **Row-level security indicator visibility:** The "Scoped to: [Site]" pill is currently placed in the page header. Should it appear more prominently (e.g., inside each KPI card as a sub-label) to prevent confusion when sharing screenshots? Especially important for multi-site deployments.

4. **E-signature modal for regulatory (P2):** MOD-REGULATORY-SIGNOFF uses PIN re-verification reusing 09-QUALITY §5.3 pattern. Confirm whether the same PIN management UI in 09-QUALITY is the canonical source, or whether 12-REPORTING needs its own PIN setup flow for users who haven't set up a QA PIN.

5. **Custom report sharing with external emails (P2, OQ-RPT-07):** The MOD-SHARE modal currently requires the viewer to be logged in (toggle default ON). If "Require Login = OFF" is permitted for certain report types, the designer needs a security warning UI pattern and a definition of which dashboards are permanently locked to authenticated-only access.

6. **Cache staleness badge threshold (RPT-SETTINGS General tab):** The default is 10 minutes. Should the badge appear in a toast, as an inline banner on each affected dashboard, or both? This affects notification density — especially for Power Users who have multiple dashboards open simultaneously.

7. **PDF export footer SHA-256 fingerprint:** Currently spec'd to show first 16 characters of the hash. Confirm whether the full 64-character hash must appear on the PDF for BRCGS audit purposes, or whether a truncated display + full value in `report_exports` table is sufficient.

8. **Mobile export experience:** On mobile, PDF exports trigger a browser download which may open in-app on iOS. Define the expected behaviour — should the export flow redirect to a separate "download ready" page for mobile, or rely on the native browser download handler?

9. **Scheduled report failure notifications (P2):** When a scheduled report fails 5 times and enters DLQ, who receives the alert — only the `reporting_admin`, or also the user who created the schedule? Define the notification routing and whether it uses the 02-SETTINGS §notifications matrix.

10. **Per-org dashboard customization (ADR-031 L2, P2):** Future state allows tenants to rearrange KPI tiles on the Factory Overview. Does the designer need to spec a drag-and-drop tile editor in this document as a P2 placeholder, or defer entirely to a future UX spec revision?

---

_12-REPORTING UX Specification v1.0 — 10 P1 dashboard screens + support screens + 8 modals + 6 interaction flows + P2 placeholder catalog. Self-contained for prototype generation. Aligned with 10-FINANCE-UX and 08-PRODUCTION-UX design vocabulary. Row-level security surfaced at every screen. Regulatory sign-off pattern integrated at Section 4 MOD-REGULATORY-SIGNOFF._
