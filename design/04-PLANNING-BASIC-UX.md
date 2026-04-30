# 04-PLANNING-BASIC — UX Specification (for prototype generation)

**Version**: 1.0 | **Date**: 2026-04-20 | **Source PRD**: 04-PLANNING-BASIC-PRD.md v3.1  
**Target**: Claude Design — interactive HTML prototypes  
**Status**: Complete — self-contained, no designer questions required

---

## 0. Module Overview

Module **04-PLANNING-BASIC** is the operational backbone of MonoPilot MES. It manages the full lifecycle of three entity types:

- **PO (Purchase Orders)** — 3-step fast-flow creation, smart defaults from supplier master, bulk create, approval workflow, D365 supplier pull consumer.
- **TO (Transfer Orders)** — intra-site warehouse-to-warehouse transfers, partial shipments, LP pre-selection, state machine.
- **WO (Work Orders)** — BOM snapshot, co-products/byproducts via `wo_outputs`, intermediate cascade DAG via `wo_dependencies`, hard-lock reservation for RM root materials, release-to-warehouse for Scanner M06 visibility.

**Key innovations in v3.0/3.1:**

- **Intermediate cascade DAG (P1 core, not flag-gated)** — catalog-driven: if a finished article BOM contains intermediate items, the system automatically generates a chain of N+1 Work Orders forming a directed acyclic graph. The planner sees and approves this chain before creation. Cycle detection blocks circular dependencies.
- **wo_outputs** — each WO may have one primary output plus N co-products and byproducts, all tracked with planned quantity and allocation percentage.
- **wo_dependencies** — DAG edges linking parent WO (upstream producer) to child WO (downstream consumer). All intermediate LP disposition is always `to_stock` in P1 — the child WO operator scans the LP at production time.
- **Hard-lock reservation** — RM root materials (material_source = 'stock') are exclusively locked to a WO on release. Intermediate materials are never reserved; availability is projection-only.
- **Allergen-aware sequencing** — basic P1 heuristic groups WOs by allergen family to minimise changeover cost. Manual override requires a reason. Full optimizer deferred to 07-PLANNING-EXT.
- **Finite-capacity stub** — greedy slot allocation on production lines/machines; overflow warns but does not block. Full engine deferred to 07-PLANNING-EXT.
- **D365 SO trigger** — feature-flagged (`integration.d365.so_trigger.enabled`). When enabled, nightly pull of D365 Sales Orders auto-generates draft WOs. UI hides or disables this section when the flag is off.
- **Workflow-as-data** — PO/TO/WO state machines are DSL rules in the 02-SETTINGS §7 rule registry. Planners see state history; only admins can read the rule definitions; no one can edit transitions in v1.0.
- **Meat_Pct multi-comp aggregation** — for WOs with multi-meat BOMs, the system aggregates weighted meat percentages per type and displays them as a comma-separated breakdown.

**Primary persona**: Planner. Secondary personas: Purchaser, Production Manager, Warehouse Operator (operational delegation), Admin (settings).

---

## 1. Design System (Inherited)

All screens in this module inherit the MonoPilot design system. Designers must apply the following tokens verbatim.

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

### 1.2 Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active states, links, focus rings |
| `--green` | `#22c55e` | Success, on-time, available (Green availability) |
| `--amber` | `#f59e0b` | Warnings, partial, borderline availability (Yellow) |
| `--red` | `#ef4444` | Errors, critical, overdue, shortage (Red availability) |
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
| `badge-green` | `#dcfce7` | `#166534` | Active, available, completed, on-time |
| `badge-amber` | `#fef3c7` | `#92400e` | Partial, pending, warning, borderline |
| `badge-red` | `#fee2e2` | `#991b1b` | Error, overdue, cancelled, critical shortage |
| `badge-blue` | `#dbeafe` | `#1e40af` | Draft, info, in-progress |
| `badge-gray` | `#f1f5f9` | `#475569` | Inactive, closed, neutral |

Badges: `padding: 2px 8px`, `border-radius: 10px`, `font-size: 11px`, `font-weight: 500`.

### 1.4 KPI Cards

Cards have a white background, `1px solid #e2e8f0` border, `6px` radius, `12px 14px` padding, and a 3px bottom accent border in the relevant color token. KPI value: 26px, font-weight 700. KPI label: 11px, muted, font-weight 500. KPI sub-label / change: 11px, muted.

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

Overlay: `background: rgba(0,0,0,0.5)`, centered flex. Modal box: `background: #fff`, `border-radius: 8px`, `width: 560px` (default), `max-height: 80vh`, `overflow-y: auto`, `padding: 20px`. Wider modals (DAG preview, cascade): up to `900px`. Modal title: 16px, font-weight 700.

### 1.10 Alerts / Inline Banners

`padding: 10px 14px`, `border-radius: 6px`, `border-left: 4px solid [color]`, `font-size: 12px`. Variants: red (`#fef2f2`), amber (`#fffbeb`), blue (`#eff6ff`), green (`#f0fdf4`).

### 1.11 Availability Indicators

Three visual states used throughout WO and reservation contexts:

- **Green** (available/projected ≥ 120% required): green dot + text `Available`
- **Yellow** (100–120% required): amber dot + text `Borderline`
- **Red** (< 100% required): red dot + text `Insufficient`

For upstream WO projections:
- Parent status `COMPLETED` → actual LP on stock, show `Produced`
- Parent status `IN_PROGRESS` → projected qty at parent planned end date
- Parent status `RELEASED` → projected qty + safety margin
- Parent status `DRAFT` → red flag `Upstream not planned`

---

## 2. Information Architecture

### 2.1 Sidebar Entry

The Planning module appears in the sidebar under the OPERATIONS group, labeled **Planning** with a calendar icon. When expanded, it shows the following sub-items:

- Dashboard
- Purchase Orders
- Transfer Orders
- Work Orders (with sub-items: List, Gantt)
- Cascade View
- Reservations
- Sequencing
- Settings

The active sub-item shows with blue left border and blue text. All other items are muted gray.

### 2.2 Route Map

| Route | Screen |
|---|---|
| `/planning` | Planning Dashboard |
| `/planning/pos` | PO List |
| `/planning/pos/new` | PO Create (3-step wizard, opens in page or modal) |
| `/planning/pos/:id` | PO Detail |
| `/planning/pos/:id/edit` | PO Edit |
| `/planning/pos/bulk-import` | PO Bulk Import |
| `/planning/tos` | TO List |
| `/planning/tos/new` | TO Create/Edit Modal |
| `/planning/tos/:id` | TO Detail |
| `/planning/wos` | WO List |
| `/planning/wos/gantt` | WO Gantt View |
| `/planning/wos/:id` | WO Detail |
| `/planning/wos/:id/cascade` | Cascade DAG View (scoped to a WO chain) |
| `/planning/cascade` | Cascade DAG View (global, all active chains) |
| `/planning/reservations` | Reservation Panel (global) |
| `/planning/sequencing` | Sequencing View |
| `/planning/settings` | Planning Settings |
| `/planning/d365-queue` | D365 SO Queue (flag-gated; hidden when disabled) |

### 2.3 Permissions Matrix

| Permission | Purchaser | Planner | Production Manager | Admin |
|---|---|---|---|---|
| `planning.dashboard.view` | Yes | Yes | Yes | Yes |
| `planning.supplier.*` | Full CRUD | Read | Read | Full CRUD |
| `planning.po.*` | Full CRUD | Read | Read | Full CRUD |
| `planning.po.approve` | No | No | Yes (threshold) | Yes |
| `planning.to.*` | Read | Full CRUD | Full CRUD | Full CRUD |
| `planning.wo.*` | Read | Full CRUD | Read + Release | Full CRUD |
| `planning.wo.release` | No | Yes | Yes | Yes |
| `planning.wo.override` | No | No | Yes | Yes |
| `planning.wo.release_to_warehouse` | No | Yes | Yes | Yes |
| `planning.settings.edit` | No | No | No | Yes |
| `integration.d365.so_trigger.run` | No | No | No | Yes |

---

## 3. Screens

---

### SCREEN-01: Planning Dashboard

**Screen ID**: PLAN-023 (updated)  
**Route**: `/planning`  
**Purpose**: Single-page overview of all planning KPIs, active alerts, upcoming deliveries/WOs/TOs, D365 pull status (when enabled), and quick-action buttons.

#### Layout

The page has a fixed top bar showing the breadcrumb `Planning > Dashboard` and an auto-refresh indicator on the right (`Auto-refresh: ON (60s) | Manual Refresh button`). Below that, the content is organized in four horizontal bands stacked vertically.

**Band 1 — KPI Cards (top)**: A responsive grid of 8 KPI cards arranged in two rows of four. Each card has a colored bottom accent.

| Card | Value Type | Accent Color | Click Action |
|---|---|---|---|
| Open POs | Count | Blue | Navigate to `/planning/pos?status=open` |
| POs Pending Approval | Count | Amber | Navigate to `/planning/pos?status=pending_approval` |
| Overdue POs | Count | Red | Navigate to `/planning/pos?overdue=true` |
| Open TOs | Count | Blue | Navigate to `/planning/tos?status=open` |
| WOs Scheduled Today | Count | Blue | Navigate to `/planning/wos?date=today` |
| WOs In Progress | Count | Green | Navigate to `/planning/wos?status=IN_PROGRESS` |
| WOs On Hold > 24h | Count | Red | Navigate to `/planning/wos?status=ON_HOLD&hold_over=24h` |
| D365 SO Queue Depth | Count (or "OFF" badge) | Blue or Gray | Navigate to `/planning/d365-queue` (hidden if flag disabled) |

Each KPI card shows: label (11px muted), large value (26px bold), sub-label (11px muted showing target or context), and a small link text `View →`.

Sub-labels:
- Open POs: `Total value: £{amount}`
- POs Pending Approval: `Avg wait: {N} days | Target: < 5`
- Overdue POs: `Action required | Target: 0`
- Open TOs: `Inter-warehouse transfers`
- WOs Scheduled Today: `On {N} production lines`
- WOs In Progress: `Active on lines`
- WOs On Hold > 24h: `Requires attention`
- D365 SO Queue Depth: `Last pull: {time ago}` or `Flag disabled` in gray when off.

**Band 2 — Alert Panels**: Three side-by-side alert columns. Each column has a colored heading badge and a list of dismissible alert items.

- **PO Alerts (red)**: Overdue PO (past expected_delivery_date), PO pending approval > 2 days. Each item shows PO number, supplier name, days overdue, and a `View PO →` link.
- **WO Alerts (amber)**: Material shortage (red availability WOs), WO on hold > 24h, WO past scheduled end date. Each shows WO number, product name, alert reason, and `View WO →` link.
- **TO Alerts (orange)**: Overdue TO shipment. Each shows TO number, from/to warehouse, days overdue, `Track →` link.
- **D365 Drift Alert (blue)**: Shown only when `d365_sync_status = 'drift'` on any entity. Text: `{N} D365 sync conflicts require admin review.` Link to 02-SETTINGS D365 admin.

Each alert item is dismissible (X button, dismiss is per-session, undo available for 5 seconds via toast).

**Band 3 — Upcoming Orders (tabbed panel)**: A card with internal tab bar.

- Tab 1: **PO Calendar** — table of POs with expected delivery in the next 14 days. Columns: PO Number, Supplier, Expected Date (relative label), Line Count, Status badge, Total (£), Actions overflow menu.
- Tab 2: **WO Schedule** — table of WOs scheduled in next 7 days. Columns: WO Number, Product, Scheduled Date, Production Line, Status badge, Priority badge, Material Availability indicator.
- Tab 3: **TO Timeline** — table of TOs with planned ship or receive dates in the next 7 days. Columns: TO Number, From Warehouse, To Warehouse, Planned Ship Date, Planned Receive Date, Status badge.
- Tab 4: **Cascade Chains** — top 5 active intermediate cascade chains shown as compact tree items. Each chain shows root FA WO number, depth (N layers), total WO count in chain, completion percentage. Click navigates to `/planning/cascade?root_wo={id}`.

Export CSV button in the top-right of this panel.

**Band 4 — Recent Activity**: A timeline list of the last 10 outbox events across PO/TO/WO, most recent first. Each event item: colored dot (green=created, blue=status change, amber=warning, red=cancelled), entity number, event description, timestamp relative (e.g., "2 min ago"), and a `View →` link. `View All Activity →` link at the panel footer.

**Quick Actions strip** (appears below Band 1, above Band 2 on desktop): `+ Create PO | + Create TO | + Create WO | Bulk Import PO | Run Sequencing | Trigger D365 Pull (disabled/hidden when flag off)`.

#### All States

- **Loading**: Skeleton shimmer on all KPI cards, skeleton rows in the upcoming-orders table, skeleton lines in the alert panels. No layout shift — skeleton matches exact card grid.
- **Populated**: All bands visible as described above.
- **Empty (no data yet)**: KPI cards show `0` values with muted sub-labels. Alert panels show a centered message `No active alerts. Everything is on track.` with a green checkmark icon. Upcoming orders table shows empty state `No upcoming orders in the next 14 days.` with `+ Create PO` button.
- **Error**: Red alert banner at top `Failed to load planning dashboard. Retry | Contact Support`. KPI cards show `—` placeholder.
- **Flag off (D365)**: D365 card shows `D365 Trigger: OFF` badge in gray. D365 Queue Depth card is grayed out. `Trigger D365 Pull` quick action button is disabled with tooltip `Enable D365 SO trigger in Planning Settings to use this feature.`

#### Microcopy

- Auto-refresh label: `Auto-refresh: ON (60s)`
- Manual refresh: `Refresh now`
- Dismiss alert tooltip: `Dismiss this alert`
- Undo dismiss: `Alert dismissed. Undo (5s)`
- D365 disabled card: `D365 SO trigger is disabled. Enable in Planning Settings.`
- Cache info: Small muted text below KPI row: `Data refreshed {N}s ago | Cached 1 min`

---

### SCREEN-02: PO List

**Screen ID**: PLAN-004  
**Route**: `/planning/pos`  
**Purpose**: Paginated, filterable list of all Purchase Orders with bulk actions and quick creation.

#### Layout

Header row: breadcrumb `Planning > Purchase Orders`, primary button `+ Create PO` (opens PLAN-004-MODAL-01 PO Fast-Flow wizard), secondary button `Bulk Import`.

Below header: 4 KPI mini-cards in a row. `Open POs`, `Pending Approval`, `Overdue`, `This Month Created`.

Filter bar: Status multi-select (All, Draft, Submitted, Pending Approval, Confirmed, Receiving, Closed, Cancelled), Supplier dropdown (searchable), Date Range picker (expected delivery), Search text input (searches PO number, supplier name). Clear All Filters link shown when any filter active. Filters persist in URL query params.

Bulk actions bar (visible when rows selected): `Release Selected (if applicable)`, `Export to Excel`, `Cancel Selected`. Count of selected items shown.

**PO Table**:

| Column | Width | Sortable | Notes |
|---|---|---|---|
| Checkbox | 40px | No | Row selection |
| PO Number | 140px | Yes | e.g., `PO-2026-00042`, click opens detail |
| Supplier | 180px | Yes | Supplier name + code sub-line |
| Expected Delivery | 110px | Yes | Date, relative label below (e.g., `In 3 days`, `Overdue 2d` in red) |
| Lines | 60px | No | Count of PO lines |
| Status | 110px | No | Badge using rule registry display names/colors |
| Total | 100px | Yes | Monetary total with currency code |
| Actions | 80px | No | `View` link + `...` overflow menu |

Row overflow menu items: View Details, Edit (if draft/submitted), Cancel (if allowed), Duplicate, Export.

Status badge colors follow `planning_settings.status_display` JSONB. Defaults: Draft=gray, Submitted=blue, Pending Approval=amber, Confirmed=blue, Receiving=green, Closed=gray, Cancelled=red.

Overdue row: red left border on the row, `Overdue {N}d` sub-text under the date cell in red.

Pagination: numbered pages on desktop, Load More on mobile.

**Validation rules surfaced on this screen**: V-PLAN-PO-005 (approval gate), V-PLAN-PO-006 (D365 drift warning badge on rows).

D365 drift badge: rows where `d365_sync_status = 'drift'` show a small amber badge `D365 drift` next to PO number. Tooltip: `This PO has been edited locally after D365 sync. Admin resolve required.`

#### All States

- **Loading**: Skeleton KPI cards + skeleton table rows (8 rows with shimmer).
- **Populated**: Full table with data as described.
- **Empty (no POs)**: Illustration, heading `No Purchase Orders Yet`, body `Create your first PO to start tracking procurement.`, buttons `+ Create PO` and `Bulk Import`.
- **Filtered empty**: `No purchase orders match your filters. Clear All Filters.`
- **Error**: Error banner, Retry button.
- **Permission-denied**: If role lacks `planning.po.*`, full page shows `You do not have access to Purchase Orders. Contact your admin.`

#### Microcopy

- Table aria-label: `Purchase Orders list`
- Empty state tip: `Tip: Set up suppliers first to enable smart defaults when creating POs.`
- Overdue badge: `Overdue {N} day(s)`
- D365 drift tooltip: `This PO has local edits that differ from the last D365 sync. Admin resolve needed.`

---

### SCREEN-03: PO Detail

**Screen ID**: PLAN-006  
**Route**: `/planning/pos/:id`  
**Purpose**: Full detail view of a single Purchase Order with line items, status history, GRN progress, and approval actions.

#### Layout

Page header: breadcrumb `Planning > Purchase Orders > {po_number}`. Status badge (large, from rule registry colors). Right-aligned action buttons contextual to status:
- Draft: `Edit`, `Submit`, `Cancel`
- Submitted: `Pending Approval (if enabled)`, `Cancel`
- Pending Approval: `Approve` (requires `planning.po.approve`), `Reject`, `Cancel`
- Confirmed: `Cancel` (admin override)
- Receiving: `View GRNs →` (links to 05-WAREHOUSE)
- Closed: `Download PDF`, `Duplicate`

Below header: Two-column layout on desktop. Left column (wider, ~65%): PO Lines table + Notes. Right column (~35%): PO Summary card, Approval card, D365 sync card.

**PO Summary card**: Supplier (name + link), PO Number, Order Date, Expected Delivery, Warehouse, Currency, Payment Terms, Subtotal, Tax, Discount Total, **Total**, Source Type badge (`manual` / `bulk` / `d365_mrp`).

**PO Lines table**:

| Column | Notes |
|---|---|
| # | Line number |
| Product | Name + product code sub-line |
| Quantity | Planned qty + UoM |
| Unit Price | With currency |
| Discount % | Shown only if > 0 |
| Line Total | Calculated |
| Expected Delivery | Per-line date if different from header |
| Received Qty | Aggregated from GRNs; progress bar `received/quantity` |
| Status | `Not received` / `Partially received` / `Fully received` |
| EUDR | Small badge `EUDR required` if `eudr_reference` is null and product is EUDR commodity |

Below lines table: `+ Add Line` button (shown if status allows editing).

**Status history card** (collapsible, default closed): Timeline of all state transitions. Each event: from_status → to_status, user, timestamp, any notes.

**GRN Progress bar**: Total received / total ordered across all lines. Shown in the summary card. Percentage and fraction.

**Approval card**: Shown when `po_approval_required = true`. Shows current approval state, approver role required, threshold amount, approved_by / approved_at when approved, reject reason when rejected. Action buttons: `Approve` (primary) and `Reject` (secondary danger). Both open PLAN-MODAL-03 (PO Approval Modal).

**D365 sync card**: Shown only when `d365_supplier_id` is populated. Shows `d365_sync_status` badge, `d365_last_synced_at`. If status is `drift`, shows inline alert `This supplier record has drifted from D365. Fields in conflict: {list}. Admin resolve required.` with link to 02-SETTINGS admin.

#### All States

- **Loading**: Skeleton layout matching the two-column structure.
- **Populated**: As described.
- **Error**: `Failed to load Purchase Order. Retry.`
- **Permission-denied**: `You do not have permission to view this Purchase Order.`
- **PO not found**: `Purchase Order {po_number} not found or has been deleted.` Back to list button.

#### Validation Rules

V-PLAN-PO-003 (submit requires lines ≥ 1 — shown as inline banner if attempt to submit with 0 lines), V-PLAN-PO-004 (line qty > 0 enforced), V-PLAN-PO-005 (approval gate enforced at submit), V-PLAN-PO-007 (EUDR badge warning).

---

### SCREEN-04: TO List

**Screen ID**: PLAN-010  
**Route**: `/planning/tos`  
**Purpose**: Paginated, filterable list of all Transfer Orders.

#### Layout

Header: breadcrumb `Planning > Transfer Orders`, `+ Create TO` (opens PLAN-MODAL-05 TO Create/Edit), no bulk import.

KPI mini-cards: `Open TOs`, `In Transit`, `Overdue`, `This Week`.

Filter bar: Status multi-select, From Warehouse dropdown, To Warehouse dropdown, Date range, Priority dropdown (Low, Normal, High, Urgent), Search (TO number).

**TO Table**:

| Column | Width | Notes |
|---|---|---|
| TO Number | 140px | e.g., `TO-2026-00011`, click opens detail |
| From Warehouse | 130px | Warehouse name |
| To Warehouse | 130px | Warehouse name |
| Planned Ship Date | 110px | Relative label |
| Planned Receive Date | 110px | Relative label |
| Priority | 80px | Badge: Low=gray, Normal=blue, High=amber, Urgent=red |
| Status | 110px | Badge from rule registry |
| Lines | 60px | Count |
| Actions | 80px | `View` + `...` overflow |

Row overflow: View Details, Edit (if draft/planned), Ship (if planned), Receive (if shipped/partially shipped), Cancel, Duplicate.

Status lifecycle badges: draft=gray, planned=blue, partially_shipped=amber, shipped=green, partially_received=amber, received=green, closed=gray, cancelled=red.

#### All States

Same pattern as PO List: loading skeleton, empty state with illustration, filtered-empty state, error state, permission-denied state.

Empty state heading: `No Transfer Orders Yet`. Body: `Create a transfer to move inventory between warehouses.` Button: `+ Create TO`.

---

### SCREEN-05: TO Detail

**Screen ID**: PLAN-012  
**Route**: `/planning/tos/:id`  
**Purpose**: Full detail view of a Transfer Order with line items, LP breakdown, ship/receive actions.

#### Layout

Header: breadcrumb `Planning > Transfer Orders > {to_number}`, status badge. Context actions: Edit (draft/planned), `Ship` (opens ShipTOModal), `Receive` (opens ReceiveTOModal), `Cancel`.

Two-column layout. Left (65%): TO Lines table, Notes. Right (35%): TO Summary card, Status history (collapsible).

**TO Summary card**: TO Number, From Warehouse, To Warehouse, Priority badge, Planned Ship Date, Planned Receive Date, Actual Ship Date (if set), Actual Receive Date (if set), Shipped By / Received By usernames.

**TO Lines table**:

| Column | Notes |
|---|---|
| # | Line number |
| Product | Name + code |
| Quantity | Planned |
| UoM | |
| Shipped Qty | Progress bar vs quantity |
| Received Qty | Progress bar vs shipped_qty |
| Status | `Pending` / `Partially shipped` / `Shipped` / `Received` |

**LP Breakdown panel** (below lines table, collapsible): shown when `to_line_lps` records exist. Table: TO Line, LP Number (barcode scannable format), Quantity, LP status (available/reserved). `+ Add LP` button opens PLAN-MODAL-06 LP Picker.

#### All States

Standard loading, populated, error, permission-denied states.

---

### SCREEN-06: WO List

**Screen ID**: PLAN-013  
**Route**: `/planning/wos`  
**Purpose**: Paginated, filterable list of all Work Orders with priority, material availability indicators, allergen family badges, and release actions.

#### Layout

Header: breadcrumb `Planning > Work Orders`, `+ Create WO` (opens PLAN-MODAL-08 WO Create), `Gantt View` (navigates to `/planning/wos/gantt`).

KPI mini-cards: `Scheduled Today`, `In Progress`, `On Hold > 24h`, `This Week Created`.

Filter bar: Status multi-select (all 7 states), Product search (typeahead), Production Line dropdown, Priority dropdown, Date range (scheduled start), Allergen Family multi-select (Allergen-Free, Gluten, Dairy, Nuts, etc.), Source dropdown (manual, d365_so, intermediate_cascade, rework), Search (WO number). Clear All Filters.

Bulk actions: Select All, `Release Selected`, `Export to Excel`, `Print Selected`.

**WO Table**:

| Column | Width | Notes |
|---|---|---|
| Checkbox | 40px | |
| WO Number | 140px | Click opens detail. D365 source shows small badge `D365` |
| Product | 160px | Product name + code sub-line |
| Status | 110px | Badge from rule registry |
| Priority | 70px | Low=gray, Normal=blue, High=amber, Critical=red |
| Qty | 90px | `{planned_qty} {uom}` |
| Scheduled Date | 110px | Date + relative label |
| Production Line | 110px | Line name or `Not assigned` (muted) |
| Allergen Profile | 80px | Colored dot cluster, one dot per allergen family present. Tooltip shows full list. |
| Availability | 80px | Dot: green/yellow/red for worst-case material availability across wo_materials |
| Progress | 80px | Progress bar (0–100%), percentage text |
| Cascade | 60px | `1 of {N}` chain indicator if intermediate_cascade; blank otherwise |
| Actions | 80px | `View` + `...` overflow menu |

Row overflow menu: View Details, Edit (DRAFT only), Plan, Release (PLANNED + materials ok), Release to Warehouse, Start, Pause, Resume, Complete, Cancel, View Status History, Duplicate WO, Print WO, Delete (DRAFT only).

**Rework WO indicator**: `is_rework = true` rows show a small amber badge `Rework` next to WO number.

**Cascade chain indicator**: Intermediate WOs (source_of_demand = 'intermediate_cascade') show a small tree icon and the text `Layer {N}` to indicate their position in the cascade.

**Capacity conflict indicator**: If `scheduled_slot_conflict = true`, row shows small amber warning icon. Tooltip: `This WO exceeds line capacity for its scheduled slot. Review in Gantt.`

#### All States

- **Loading**: Skeleton shimmer.
- **Populated**: As described.
- **Empty**: `No Work Orders Yet. Create your first WO to begin production scheduling.` Button `+ Create WO`.
- **Filtered empty**: `No work orders match your current filters. Clear All Filters.`
- **Error**: Error banner + Retry.
- **Permission-denied**: Role gate message.

#### Validation Rules Surfaced

V-PLAN-WO-001 (qty > 0 enforced at creation), V-PLAN-WO-002 (BOM required for release — row shows `No BOM` warning badge in amber if status = PLANNED and bom_id is null), V-PLAN-WO-008 (hard-lock conflict shown as red badge `LP Conflict` on row if reservation failed).

---

### SCREEN-07: WO Detail

**Screen ID**: PLAN-015  
**Route**: `/planning/wos/:id`  
**Purpose**: Complete single-WO detail with tabbed sub-sections covering all aspects of the Work Order lifecycle.

#### Layout

**Page header**: Breadcrumb `Planning > Work Orders > {wo_number}`. Large status badge (from rule registry). Right-aligned action buttons contextual to status (same state machine as list overflow):
- DRAFT: `Edit`, `Release`, `Delete`
- RELEASED: `Release to Warehouse`, `Cancel`
- IN_PROGRESS: `Pause (requires reason)`, `Complete`
- ON_HOLD: `Resume`, `Cancel`
- COMPLETED: `Close`
- CLOSED/CANCELLED: `Duplicate`

Rework badge `Rework WO` shown in amber next to the WO number if `is_rework = true`.

Source badge `D365 SO` shown in blue next to the WO number if `source_of_demand = 'd365_so'`.

Cascade badge `Cascade Layer {N} of {M}` shown if `source_of_demand = 'intermediate_cascade'`, linking to `/planning/cascade?root_wo={root_id}`.

**Top summary bar** (single row, muted background): Product name + code, Planned Qty, UoM, Scheduled Start, Scheduled End, Production Line, Priority, Yield % (if COMPLETED).

**Tab bar** (below summary): Overview | Outputs | Dependencies | Reservations | Sequencing | State History | D365 Sync

---

**Tab: Overview**

Left column (65%): Materials section + Operations section.

Materials table:

| Column | Notes |
|---|---|
| # | Sequence |
| Material | Name + product code. Snapshot badge `BOM Snapshot` |
| Required Qty | With UoM |
| Consumed Qty | Populated from 08-PRODUCTION |
| Reserved Qty | From wo_material_reservations |
| Material Source | Badge: `stock` (blue) / `upstream_wo_output` (amber) / `manual` (gray) |
| Availability | Green/Yellow/Red dot + label |
| Allergen Flag | Small allergen family badge if `condition_flags` contains allergen-sensitive |

If `material_source = 'upstream_wo_output'`: the availability cell shows a projection row: upstream WO number (link), parent WO status, projected qty, projected available date. No reservation row shown.

If `material_source = 'stock'`: reservation status shown in Reserved Qty cell. If reserved: `LP-{lp_number}` link, qty, reservation type badge `Hard Lock`.

Below materials table: Meat_Pct aggregation row (shown only if `wo.meat_pct_computed` is populated). Format: `Meat content: Chicken 85%, Pork 10%, Beef 5%` — comma-separated, with a tooltip `Computed from BOM expand per FR-PLAN-026`.

Operations timeline:

| Column | Notes |
|---|---|
| # | Sequence |
| Operation | Name (snapshot) |
| Machine | Machine name or `—` |
| Expected Duration | In minutes |
| Actual Duration | Populated from 08-PRODUCTION; `—` if not started |
| Expected Yield % | From routing snapshot |
| Status | `pending` / `in_progress` / `completed` / `skipped` |

Right column (35%): WO Info card (all header fields), Capacity card (line + machine + slot status — shows amber warning if `scheduled_slot_conflict = true`), BOM card (BOM version, effective dates, link to 03-TECHNICAL BOM detail).

---

**Tab: Outputs**

Heading: `WO Outputs — Primary + Co-products + Byproducts`

Table of all `wo_outputs` rows:

| Column | Notes |
|---|---|
| Output Role | Badge: `primary` (blue), `co_product` (green), `byproduct` (gray) |
| Product | Name + code |
| Planned Qty | With UoM |
| Actual Qty | Populated from 08-PRODUCTION |
| Allocation % | `allocation_pct` from BOM snapshot |
| Disposition | Badge `to_stock` (blue). In P1 this is always `to_stock`. The column is present but the value is locked — no dropdown. Tooltip: `Intermediate disposition is always to_stock in P1. Direct-continue and planner-decides are deferred to P2.` |
| Output LP | LP number link (populated after 08-PRODUCTION put-away), or `Pending` |

Below table: small info banner `All outputs go to stock in P1. Child WOs consume intermediate LPs via Scanner scan-to-consume at production time.`

---

**Tab: Dependencies**

Heading: `WO Dependency Graph — Cascade Chain`

This tab contains an embedded interactive DAG visualization (ReactFlow or d3-dagre). See SCREEN-09 (Cascade DAG View) for the full canvas description — this embedded version is read-only and scoped to the current WO's chain.

Above the graph: Stats bar — `Chain depth: {N} layers | Total WOs in chain: {M} | Chain status: {summary badge}`.

Below the graph: Dependency table (alternative list view, toggle):

| Column | Notes |
|---|---|
| Direction | `Parent` or `Child` |
| WO Number | Link to WO detail |
| Product | What it produces / consumes |
| Required Qty | The `wo_dependencies.required_qty` |
| Parent WO Status | Status badge |
| Material Link | Link to the specific `wo_materials` row |

Cycle-check result badge: if a cycle was detected and the DAG was rolled back, a persistent red alert `Cycle detected in DAG — this chain was not created. Contact your admin.` is shown here.

---

**Tab: Reservations**

Heading: `Material Reservations — Hard Lock (RM Root Only)`

Info banner (blue, always visible): `Reservations are created on RELEASED transition for materials with source = 'stock' only. Intermediate cascade materials (source = 'upstream_wo_output') are not reserved — consumed at production time by Scanner.`

Reservation table (shows only wo_material_reservations for this WO):

| Column | Notes |
|---|---|
| Material | Name + product code |
| LP Number | Barcode, link to 05-WAREHOUSE LP detail |
| Reserved Qty | With UoM |
| Reservation Type | Badge `Hard Lock` (blue) |
| Reserved At | Datetime |
| Reserved By | Username |
| Released At | Datetime or `Active` badge (green) |
| Release Reason | `consumed` / `cancelled` / `admin_override` / `—` |
| Actions | `Release` button (admin only, opens PLAN-MODAL-12 Override) |

Conflict row: if another WO holds the same LP (should not occur if DB constraint working), shows red row with `Conflict — LP claimed by {wo_number}` and admin escalation link.

---

**Tab: Sequencing**

Heading: `Allergen Sequencing — {Production Line Name}`

Allergen profile snapshot: shows all allergens present in this WO (from `allergen_profile_snapshot` captured at release). Displayed as colored family badges.

Position in queue: `Position {N} of {M} on {Line Name}` with before/after WO number links.

Manual override section: if `sequencing_override = true`, shows amber banner `Sequencing override active on this WO. Reason: {reason}.` Reset button `Clear Override` (requires planner permission).

Override WO sequencing: `Override Sequencing Position` button (opens inline field for position and reason, V-PLAN-SEQ-003 reason mandatory).

---

**Tab: State History**

Timeline of all `wo_status_history` rows, newest first.

| Column | Notes |
|---|---|
| From Status | Badge |
| To Status | Badge |
| Timestamp | Datetime |
| User | Username |
| Action | e.g., `release`, `pause`, `cancel` |
| Override Reason | If `override_reason` is set, shown in amber |
| Context | JSONB summary (e.g., `{materials_reserved: 4, cascade_depth: 2}`) |

Link at the bottom: `View Workflow Rule in 02-SETTINGS Rule Registry →` (read-only link, opens 02-SETTINGS §7 rule `wo_state_machine_v1`).

---

**Tab: D365 Sync**

Shown only if `source_of_demand = 'd365_so'` or `source_reference` is populated with a D365 SO ID.

D365 sync info card: D365 SO Reference, D365 SO Status, Pull timestamp, Push status (confirmation sent to D365 after WO COMPLETED).

If push pending (WO COMPLETED but confirmation not yet sent): amber banner `WO completion confirmation pending D365 push. Retry | View outbox event`.

If push sent: green banner `D365 production order confirmation sent at {datetime}. Event ID: {id}`.

Push failure: red banner `D365 push failed after 3 retries. {error detail}. Admin retry required.`

If flag `integration.d365.so_trigger.enabled = false`: entire tab shows banner `D365 integration is disabled. Enable in Planning Settings.`

---

### SCREEN-08: WO Gantt View

**Screen ID**: PLAN-016  
**Route**: `/planning/wos/gantt`  
**Purpose**: Timeline view of Work Orders across production lines/machines, showing DAG dependencies and allergen sequencing highlights.

#### Layout

**Toolbar** (top): Date range picker (week/month view toggle), Production Line filter (multi-select), Status filter, `Run Sequencing` button (triggers allergen sequencing recompute for the current view window — disabled if no RELEASED WOs in window), `Reschedule All` (admin only — triggers capacity stub re-run), Export PNG.

**Gantt grid**: Left column is a fixed list of production lines/machines (from 02-SETTINGS §12). Each line occupies one horizontal swimlane. Horizontal axis is calendar time. WO bars are placed within each swimlane.

**WO Bar appearance**:
- Bar height: 40px with 4px gap between stacked WOs on same line.
- Bar background color: from status rule registry colors (same as badges).
- Bar text: WO number + product abbreviation, shown if bar is wide enough; truncated with ellipsis.
- Left edge of bar: scheduled_start_time. Right edge: scheduled_end_time.
- Allergen family color band: a 4px strip along the bottom edge of the bar, colored by the primary allergen family of the WO. Allergen-free = white/transparent. Gluten = wheat-amber, Dairy = light-blue, Nuts = brown, Multi = striped.
- Priority indicator: critical WOs have a red left border (4px).
- Capacity conflict: if `scheduled_slot_conflict = true`, bar has a dashed red border.

**DAG dependency arrows**: Between WO bars, directed arrows show parent→child relationships from `wo_dependencies`. Arrow color: gray, with an arrowhead on the child end. Hovering an arrow shows a tooltip: `Parent: {wo_number} → Child: {wo_number} | Required qty: {N} {uom}`.

**Allergen sequencing highlights**: When the sequencing view is active, allergen transition points between consecutive WOs on the same line are highlighted with a vertical amber dashed line and a small label `Changeover`. The changeover count is shown in the toolbar: `{N} changeovers in view`.

**Zoom controls**: +/- buttons and a zoom slider. Views: Day, Week, Month. Current view indicator.

**Click on WO bar**: Opens a popover card with: WO number (link to detail), Product, Status badge, Planned qty, Allergen profile badges, Material Availability dot, `View Detail →` and `Edit Schedule` (if allowed) buttons.

**Today marker**: Vertical blue line at today's date.

**Empty lane**: If a production line has no WOs in the selected window, shows muted text `No work orders scheduled on this line for this period.`

#### All States

- **Loading**: Skeleton swimlanes with shimmer bars.
- **Populated**: Full Gantt as described.
- **No WOs in window**: Empty Gantt lanes with empty state text.
- **Error**: Error banner + Retry.
- **Single WO selected** (from clicking a bar): side panel slides in from the right showing WO detail summary and dependency list.

#### Microcopy

- Changeover label: `Changeover — allergen transition`
- Capacity warning tooltip: `Line exceeds available capacity in this slot. Reschedule or adjust WO timing.`
- Allergen legend: `Allergen families: [Allergen-free] [Gluten] [Dairy] [Nuts] [Sulphites] [Multi]` — shown as a horizontal legend strip below the toolbar.

---

### SCREEN-09: Cascade DAG View

**Screen ID**: New (no archive equivalent)  
**Route**: `/planning/cascade` (global) or `/planning/cascade?root_wo={id}` (scoped to chain)  
**Purpose**: Full-page visualization of the intermediate cascade DAG — the marquee new screen for v3.0. Shows N-layer BOM structure translated into N+1 Work Orders, with cycle-check warnings and node expand/collapse.

#### Layout

**Toolbar** (top): `Root WO` filter (dropdown, default All Active Chains), Date range, Status filter, `Zoom In`, `Zoom Out`, `Fit to Screen`, `Reset Layout`, `Export PNG`. When scoped to a single chain: breadcrumb `Planning > Cascade DAG > {root_wo_number}`.

**Canvas** (main area): Directed graph rendered with a left-to-right (or top-to-bottom, togglable) layout. The graph uses a layered Sugiyama algorithm to minimize edge crossings.

**Node appearance**: Each WO is a rounded rectangle node (min-width 180px, min-height 80px). Node background = white. Node border = 2px solid, color from status badge color (draft=gray, released=blue, in_progress=green, on_hold=amber, completed=gray, cancelled=red/dashed). Node content:

- Top line: WO Number (bold, 13px)
- Second line: Product name (12px, muted)
- Third line: Status badge (small) + Priority badge (small)
- Fourth line (if intermediate): `Layer {N}` in small muted text
- Bottom edge: allergen profile dot cluster (small colored dots)
- Availability dot: top-right corner of node, green/yellow/red

Node hover: tooltip shows full WO summary (all fields from the WO header).

**Edge appearance**: Directed arrows from parent node to child node. Arrow style: solid gray line with arrowhead. Edge label (shown on hover): `Consumes {required_qty} {uom} of {product_name}`. Edge thickness scales with `required_qty` (thin = small qty, thick = large).

**Cycle-check warning node**: If a cycle was detected during cascade generation and the DAG was rolled back, a red node is shown with the text `CYCLE DETECTED` and the WO numbers involved in the cycle. A red alert banner appears above the canvas: `Cycle detected in BOM cascade. This chain could not be created. Affected products: {list}. Admin action required.`

**Collapse/Expand**: Each node has a small chevron button in the top-right corner. Clicking it collapses all downstream descendants. Collapsed nodes show a `+{N} hidden` indicator.

**Node click**: Clicking a node opens a right-side panel (320px wide) with:
- Full WO detail summary (same as WO Detail header)
- Tab: Materials (wo_materials for this WO, with source badges)
- Tab: Outputs (wo_outputs for this WO)
- Tab: Dependencies (just the upstream/downstream wo_number links)
- `Open Full Detail →` button

**Multi-chain global view**: When no root WO filter is active, all active cascade chains are shown. Each chain is visually grouped with a subtle background tint. A chain legend on the left shows: Chain ID (root WO number), Depth, WO count, status summary. Chains can be individually collapsed.

**Chain stats summary** (bottom of toolbar): `{N} active chains | {M} total WOs in chains | Avg depth: {X} layers | {K} chains with capacity conflicts`.

**Intermediate LP disposition badge**: Each edge is annotated with a small badge `→ to_stock` indicating that the intermediate LP produced by the parent WO goes to warehouse stock and is consumed at production time by the Scanner. This reinforces the P1 design decision. Badge is muted gray, with tooltip `Intermediate disposition is always to_stock in P1. Child WO operator scans LP at production time.`

#### All States

- **Loading**: Spinner centered on canvas + `Building cascade graph…`.
- **Populated — single chain**: Full graph as described.
- **Populated — global view**: All chains visible with grouping.
- **No active chains**: Empty state: illustration of empty graph, heading `No active cascade chains`, body `Cascade chains are created automatically when a Work Order has a BOM with intermediate layers. Create a WO with a multi-layer BOM to see it here.`, button `+ Create WO`.
- **Cycle detected**: Red banner + CYCLE node as described.
- **Error**: Error banner + Retry.
- **Permission-denied**: `You do not have permission to view the Cascade DAG.`

#### Microcopy

- Canvas help text (first visit, dismissible): `This view shows your intermediate production cascade. Each box is a Work Order; arrows show material dependencies. Intermediate outputs go to stock and are scanned by operators at production time.`
- Cycle alert: `Cycle detected in production cascade. This cascade chain was rolled back and not created. Affected WOs: {list}. Review your BOM structure to resolve circular dependencies.`
- Disposition badge tooltip: `In P1, all intermediate outputs go to warehouse stock (to_stock). Child WO operators scan the LP at production time via Scanner.`
- Collapse tooltip: `Collapse downstream chain`
- Expand tooltip: `Expand downstream chain`
- Node status legend: Shows all 7 WO statuses with their badge colors, displayed at bottom of canvas.

---

### SCREEN-10: Reservation Panel (Global)

**Screen ID**: PLAN-026/027 combined  
**Route**: `/planning/reservations`  
**Purpose**: Global view of all active hard-lock reservations across all WOs, with availability status and override actions.

#### Layout

Header: `Planning > Reservations`. Filter bar: WO Status, Warehouse, Product (search), Reservation Type (`hard_lock` — only option in P1), Date reserved range, Search (WO number or LP number).

**Reservation Table**:

| Column | Notes |
|---|---|
| WO Number | Link to WO detail |
| Product (WO) | The FA or intermediate being produced |
| Material | The reserved RM |
| LP Number | Barcode link to 05-WAREHOUSE LP detail |
| Reserved Qty | With UoM |
| Total LP Qty | LP total qty for context |
| Reservation Type | Badge `Hard Lock` (blue) |
| Reserved At | Datetime |
| Reserved By | Username |
| Status | `Active` (green) / `Released — consumed` (gray) / `Released — cancelled` (gray) / `Admin override` (amber) |
| Actions | `Release` (admin only) |

**Summary strip** above table: `{N} active hard locks | {M} LPs locked | {K} LPs fully committed (100% qty locked)`.

**Availability Panel** (right side panel, 300px, toggle-able): Shows stock availability for a selected product across all LPs. For each LP: LP number, total qty, reserved qty, net available qty, expiry date (FEFO sorted). Color dot: green (net available > 0), red (fully consumed). This is the PLAN-027 availability component.

Clicking a reservation row highlights the LP in the availability panel.

**Conflict section** (top of page, shown only if any conflicts exist): Red alert banner `{N} reservation conflicts detected. These LPs are double-reserved (should not occur with DB constraints active). Admin action required.` with a table of conflicting reservations.

#### All States

- **Loading**: Skeleton.
- **Populated**: As described.
- **Empty (no reservations)**: `No active reservations. Reservations are created automatically when a WO is released (for RM root materials only).`
- **Error**: Error banner + Retry.

#### Microcopy

- Release button tooltip: `Release this hard lock. This will make the LP available to other WOs. Requires a reason.`
- Admin-only indicator: Lock icon next to `Release` button. Non-admin sees `View only` label.
- Conflict badge: `Double-locked — DB constraint violation`

---

### SCREEN-11: Sequencing View

**Screen ID**: New (extended from PLAN-016 context)  
**Route**: `/planning/sequencing`  
**Purpose**: Allergen-aware WO sequencing for production lines. Shows the current queue grouped by allergen family, allows manual reordering with override warnings, and shows the sequencing heuristic result.

#### Layout

**Toolbar**: Production Line selector (required field), Scheduling window (date range), `Run Sequencing` button (triggers allergen heuristic recompute — `POST /api/planning/sequencing/run`), `Before/After Compare` toggle (opens PLAN-MODAL-15 Sequencing Preview), Version badge `Rule: allergen_sequencing_heuristic_v1`.

**Changeover KPI strip**: `{N} changeovers in window | Baseline: {M} | Reduction: {K}% vs baseline`. Color-coded: green if reduction > 30% (target), amber if 10–30%, red if < 10%.

**Sequencing Queue** (main area): A vertically ordered list of WOs in their scheduled sequence on the selected line. Each WO row:

- Drag handle (left, six-dot icon) — allows manual reorder.
- Position number (bold, large, muted circle).
- WO Number (link).
- Product name.
- Allergen profile: colored dot cluster of allergen families present. Each dot has a tooltip with the allergen family name.
- Priority badge.
- Scheduled Start time.
- Estimated Duration.
- `Override` button (small, secondary) — opens PLAN-MODAL-14 Allergen Override.

**Allergen family grouping visual**: WOs within the same allergen family group are visually bracketed with a colored left border matching the family color. Group header: `{Family Name} Group — {N} WOs`. Between groups: a horizontal separator labeled `Changeover — allergen transition ({estimated cleaning time})`.

**Allergen-free group** always appears first. Single-allergen groups next (alphabetical). Multi-allergen group last.

**Manual reorder warning**: When a WO is dragged to a position that increases changeover count, a modal fires (PLAN-MODAL-14) requiring the planner to confirm and provide a reason. The drag is not committed until the modal is confirmed.

**Critical WO exemption**: WOs with `priority = 'critical'` show a red `Critical — exempt from sequencing` badge and are not moved by the heuristic. Planner can manually resequence them but must provide a reason.

#### All States

- **No line selected**: Prompt `Select a production line to view the sequencing queue.`
- **No RELEASED WOs**: `No released Work Orders on {Line} in the selected window. Release WOs first to sequence them.`
- **Loading**: Skeleton rows.
- **Populated**: Full queue as described.
- **After heuristic run**: Success toast `Sequencing applied — {N} changeovers reduced from {old} to {new}.` Queue refreshes in place.
- **Error**: Error banner + Retry.

#### Validation Rules Surfaced

V-PLAN-SEQ-001 (critical WOs protected — shown as warning if planner tries to demote a critical WO below a non-critical WO), V-PLAN-SEQ-002 (scheduled times respect shift bounds — shown as capacity warning if move would violate shift), V-PLAN-SEQ-003 (override reason mandatory — enforced in modal).

---

### SCREEN-12: Planning Settings

**Screen ID**: PLAN-024  
**Route**: `/planning/settings`  
**Purpose**: Admin-only settings page for all planning configuration: PO/TO/WO defaults, D365 SO trigger, workflow display, field visibility.

#### Layout

Page is only accessible to users with `planning.settings.edit`. Other users see a permission-denied banner.

Header: `Planning > Settings`. `Save Changes` button (top-right, sticky) + `Discard Changes` (secondary).

Tab bar: **General** | **Purchase Orders** | **Transfer Orders** | **Work Orders** | **Intermediate Cascade** | **Sequencing** | **D365 Integration** | **Status Display** | **Field Visibility**

---

**Tab: General**

Two-column form grid.

| Field | Type | Default | Validation | PRD Rule |
|---|---|---|---|---|
| Default PO Currency | Select (ISO-4217) | GBP | Required | |
| Default Intermediate Disposition | Select (to_stock only in P1) | to_stock | Read-only in P1 — disabled dropdown with tooltip `P1: always to_stock. Direct-continue / planner-decides deferred to P2.` | |
| Cascade Max Depth | Integer | 10 | 1–20 | V-PLAN-SET-002 |

---

**Tab: Purchase Orders**

| Field | Type | Default | Validation |
|---|---|---|---|
| Auto Number | Toggle | ON | |
| Number Prefix | Text | `PO-` | Max 10 chars |
| Number Format | Text | `PO-{YYYY}-{NNNNN}` | ICU pattern |
| Require Approval | Toggle | OFF | |
| Approval Threshold (£) | Number | — | ≥ 0 (V-PLAN-SET-001); shown only when Require Approval = ON |
| Approval Roles | Multi-select | — | Shown only when Require Approval = ON |
| Auto-Close on Full Receipt | Toggle | ON | |
| Default Lead Time (days) | Integer | 7 | ≥ 0 |

---

**Tab: Transfer Orders**

| Field | Type | Default |
|---|---|---|
| Auto Number | Toggle | ON |
| Number Prefix | Text | `TO-` |
| Allow Partial Shipments | Toggle | ON |
| Require LP Selection | Toggle | OFF |

---

**Tab: Work Orders**

| Field | Type | Default | Notes |
|---|---|---|---|
| Auto Number | Toggle | ON | |
| Number Prefix | Text | `WO-` | |
| Number Format | Text | `WO-{YYYYMMDD}-{NNNN}` | |
| Auto Select Active BOM | Toggle | ON | |
| Copy Routing | Toggle | ON | |
| Material Check | Toggle | ON | |
| Material Check Blocks Release | Toggle | OFF | When ON, red availability = hard block on release |
| Require BOM | Toggle | ON | |
| Allow Overproduction | Toggle | OFF | |
| Overproduction Limit % | Number | 5 | Shown when Allow Overproduction = ON |
| Require Rework Approval | Toggle | ON | |
| Default Priority | Select | Normal | |
| Auto-Archive Closed WOs (days) | Integer | 90 | |

---

**Tab: Intermediate Cascade**

Info banner (blue): `Intermediate cascade is always active (catalog-driven, not flag-gated). If a BOM contains intermediate items, N+1 Work Orders are generated automatically.`

| Field | Type | Default | Notes |
|---|---|---|---|
| Cascade Max Depth | Integer | 10 | 1–20; safety cap |
| Intermediate Disposition | Display only | `to_stock` | Grayed out with tooltip `P1 always to_stock. See PRD §8.5.` |

Workflow Rule reference: Link `View cascade_generation_v1 rule in Rule Registry →` (opens 02-SETTINGS §7, read-only).

---

**Tab: Sequencing**

| Field | Type | Default |
|---|---|---|
| Sequencing Enabled (default for new lines) | Toggle | ON |
| Sequencing Rule Version | Select (v1 only in P1) | v1 |

Below: Read-only display of rule `allergen_sequencing_heuristic_v1` summary (just name, version, author, created date). `View Full Rule →` link to 02-SETTINGS §7.

KPI target reference: `Target changeover reduction: > 30% (Apex baseline)`. This is informational, not editable.

---

**Tab: D365 Integration**

Feature flag banner at top. If `integration.d365.so_trigger.enabled = false`: **large gray banner** `D365 SO Trigger is currently DISABLED`. If `= true`: **large blue banner** `D365 SO Trigger is ENABLED`.

| Field | Type | Default | Validation |
|---|---|---|---|
| D365 SO Trigger Enabled | Toggle | OFF | Master toggle for this section |
| D365 SO Pull Cron | Text | `0 2 * * *` | Valid cron expression (V-PLAN-SET-004) |
| Pull Window (days) | Integer | 14 | > 0 |
| SO Status Filter | Multi-select | Open, Confirmed | At least 1 value |

When D365 SO Trigger Enabled = OFF: all fields in this tab are disabled/grayed. Tooltip on each field: `Enable D365 SO trigger first.`

`Test D365 Connection` button: triggers a connection test to the D365 adapter endpoint. Shows inline result: green `Connected successfully` or red `Connection failed: {error}`.

`Trigger Manual Pull Now` button (requires `integration.d365.so_trigger.run` permission): visible only when toggle = ON. Triggers on-demand SO pull. Opens PLAN-MODAL-13 D365 Trigger Confirm before firing.

Last run info: `Last pull: {datetime} | {N} SOs pulled | {M} draft WOs created | {K} errors`. Link: `View pull history →`.

---

**Tab: Status Display**

Info banner: `You can customise the display name and colour of each status. Workflow transitions are fixed in v1.0 and cannot be changed here. To change transitions, a developer PR is required.`

For each entity type (PO, TO, WO), a section with a table:

| Column | Notes |
|---|---|
| Status Key | Read-only internal key (e.g., `draft`) |
| Label (EN) | Text input, max 50 chars |
| Label (PL) | Text input, max 50 chars |
| Color | Color picker (hex input + color swatch) |
| Icon | Select from predefined icon set |
| Preview | Live badge preview showing the configured label + color |

V-PLAN-SET-003: all statuses must have a label. Red inline error if any label is cleared.

Reset to Defaults button per entity section.

---

**Tab: Field Visibility**

Info banner: `Control which fields are shown or hidden per role. Hidden fields are also masked server-side for security.`

Matrix table: Rows = form fields (by entity), Columns = roles (Purchaser, Planner, Production Manager, Warehouse Operator). Each cell is a toggle (visible / hidden). Greyed-out cells for fields that are system-required and cannot be hidden.

`Save Field Visibility` button (sticky at bottom of tab).

#### All States

- **Permission-denied (non-admin)**: Full page blocked with banner `Planning Settings are admin-only. Contact your system administrator.`
- **Loading**: Skeleton form.
- **Populated**: Forms as described.
- **Unsaved changes**: Sticky warning `You have unsaved changes` with `Save` and `Discard` buttons.
- **Save success**: Toast `Settings saved successfully.`
- **Save error**: Red inline alert `Failed to save settings. {error detail}. Retry.`
- **Validation error**: Inline red text under each invalid field.

---

### SCREEN-13: D365 SO Queue and Draft WO Review

**Screen ID**: New  
**Route**: `/planning/d365-queue`  
**Purpose**: Review draft WOs auto-generated from D365 SO pull. Feature-flag gated — entire page hidden when `integration.d365.so_trigger.enabled = false`.

#### Layout (when flag is OFF)

Full-page gate: Gray card centered on page. Heading: `D365 SO Trigger is Disabled`. Body: `Enable the D365 SO trigger in Planning Settings to use this feature.` Button: `Go to Settings →`.

#### Layout (when flag is ON)

Header: `Planning > D365 SO Queue`. Breadcrumb includes flag indicator: `D365 trigger: ON` green badge.

**Pull History strip** (top): Last pull datetime, SOs pulled count, draft WOs created count, errors count. `Trigger Manual Pull` button (requires `integration.d365.so_trigger.run` permission, opens PLAN-MODAL-13).

**Filter bar**: Source SO Status filter, WO Status filter (DRAFT / RELEASED), Date pulled range, Search (SO reference or WO number).

**D365 Draft WO Table**:

| Column | Notes |
|---|---|
| D365 SO Reference | SO ID from D365 (`source_reference`) |
| Draft WO Number | Auto-generated WO number, link to WO detail |
| Product | FA product name + code |
| Planned Qty | From SO ordered qty |
| Scheduled Start | Computed from SO delivery date minus production lead time |
| Cascade Depth | Number of WOs generated in chain (if BOM has intermediate layers) |
| BOM Auto-Selected | BOM version that was automatically selected |
| Status | DRAFT badge (blue) or RELEASED badge (green) |
| Pull Date | Datetime |
| Actions | `Review` (opens PLAN-MODAL-16 Draft WO Approve/Reject), `View Full WO →` |

**Cascade preview column**: If `cascade_depth > 1`, a small tree icon shows with tooltip listing child WO numbers in the chain. Click expands an inline sub-table of all WOs in the chain.

**Error log section** (below table, collapsible): table of pull errors. Columns: D365 SO ID, Error type, Error message, Timestamp, Retry action button.

#### All States

- **Flag off**: Gate page as described.
- **Loading**: Skeleton table.
- **Empty (no draft WOs)**: `No draft WOs from D365 SO pull. Last pull: {datetime}. Trigger a manual pull or wait for the nightly schedule.` Button `Trigger Pull Now`.
- **Populated**: Full table.
- **Error**: Error banner + Retry.

---

## 4. Modals

---

### PLAN-MODAL-01: PO Fast-Flow — 3-Step Wizard

**Trigger**: `+ Create PO` button on PO List.  
**Width**: 700px (step 2 expands to full-page wizard if > 10 lines).

**Step indicator** at top: `Step 1: Supplier → Step 2: Products → Step 3: Review & Submit` (pill progress bar).

**Step 1 — Supplier Selection**:
- Field: Supplier (searchable dropdown, shows code + name + active badge). Required. V-PLAN-PO-001.
- On supplier select: auto-fill Currency, Payment Terms, Tax Code from supplier master. Show green `Smart defaults applied` toast.
- Field: Warehouse (dropdown from 02-SETTINGS §12). Required. Pre-fills from user's default site.
- Field: Expected Delivery Date. Auto-computed as `today + supplier.lead_time_days`. Editable.
- Field: Shipping Method (text, optional).
- Field: Notes (textarea, optional). Internal Notes (textarea, optional).
- Button row: `Cancel` (closes modal), `Next: Add Products →` (primary, validates supplier selected).

**Step 2 — Products + Quantities**:
- Inline table for adding lines. One row per product.
- `+ Add Product` button adds a new row.
- Each row: Product (searchable dropdown, shows item code + name, filtered to RM/packaging types), Qty (number input > 0), UoM (auto-filled from product, read-only), Unit Price (auto-filled from supplier_products — editable), Discount % (number 0–100, optional), Expected Delivery (date, defaults to header date — overridable per line), Notes.
- On product select: auto-fill Unit Price from `supplier_products.unit_price` (fallback: `product.last_cost`). Show `Default price applied` helper text below price field.
- Warning: if product has no `is_default` supplier assignment, show amber inline warning `No default supplier set for this product.`
- V-PLAN-PO-004: qty > 0 enforced inline.
- Line total calculated and shown in-row.
- Running totals at bottom: Subtotal, Tax (from tax code), Total.
- Paste CSV option: small `Paste CSV` link opens a textarea for bulk-paste (product_code, qty, unit_price per line).
- Button row: `← Back`, `Next: Review →` (validates lines ≥ 1 per V-PLAN-PO-003).

**Step 3 — Review & Submit**:
- Read-only summary of all fields from Step 1 + Step 2.
- Final calculated totals: Subtotal, Tax, Discount Total, **Total**.
- Approval warning: if `po_require_approval = true` and total > threshold, shows amber banner `This PO requires approval (total £{amount} exceeds threshold £{threshold}). It will be submitted for approval.`
- D365 supplier warning: if supplier has `d365_sync_status = 'drift'`, amber banner `Supplier has unresolved D365 drift. Verify details before submitting.`
- Button row: `← Edit Products`, `Submit PO` (primary, posts to `POST /api/planning/purchase-orders`).
- On success: closes modal, navigates to PO detail, shows toast `Purchase Order {po_number} created successfully.`
- On error: red inline banner `Failed to create PO: {error}. Retry.`

**States**: Loading step data (skeleton), validation error (inline red text under fields), API loading (spinner on Submit button with disabled state), API success (auto-close + toast), API error (inline error banner).

---

### PLAN-MODAL-02: Add PO Line

**Trigger**: `+ Add Line` button on PO Detail (when PO status allows editing).  
**Width**: 560px.

Single-row form: Product (searchable dropdown, required), Qty (number, required, > 0 per V-PLAN-PO-004), UoM (auto-filled, read-only), Unit Price (auto-filled, editable), Discount % (optional), Expected Delivery Date (defaults to PO header date), Notes (optional).

Line total preview updates live.

Buttons: `Cancel`, `Add Line` (primary).

Success: modal closes, line appended to PO Lines table, PO totals recalculated in place, toast `Line added.`

---

### PLAN-MODAL-03: PO Approval

**Trigger**: `Approve` or `Reject` button on PO Detail (requires `planning.po.approve` permission).  
**Width**: 480px.

**Approve path**: Heading `Approve Purchase Order {po_number}`. Shows PO summary (supplier, total, lines count). Approval decision field: optional Notes (textarea). Button `Approve PO` (green primary). On success: PO status → Confirmed, toast `PO approved.`

**Reject path**: Heading `Reject Purchase Order {po_number}`. Reason field (textarea, required). Button `Reject PO` (red danger). On success: PO status → Draft, toast `PO rejected. Planner notified.`

Permission guard: if user lacks `planning.po.approve`, the modal body shows `You do not have permission to approve Purchase Orders. Required role: {roles list}.`

---

### PLAN-MODAL-04: PO Bulk Import

**Trigger**: `Bulk Import` button on PO List.  
**Width**: 700px.

**Step 1 — Upload/Paste**:
- Two tabs: `Upload CSV file` and `Paste CSV`.
- CSV format description: `product_code, quantity, unit_price, expected_delivery_date (optional)`. Download template link.
- Upload zone (drag and drop + file picker). Accepted: `.csv`, `.xlsx`.
- Paste tab: textarea for raw CSV paste.
- `Parse & Preview` button.

**Step 2 — Preview & Grouping**:
- System groups lines by default supplier per product.
- Shows preview table grouped by supplier: `Supplier {name}: {N} products → Draft PO`. Each group is a mini-table of lines.
- Warning section: Products with no default supplier are listed in an amber banner `{N} products have no default supplier and will be skipped.` Option to manually assign supplier per product inline.
- Totals per group shown.
- `Back` and `Create {N} POs` (primary) buttons.

**Step 3 — Result**:
- Shows created PO count, any skipped products, any errors per row.
- `Download Error Report` if any errors.
- `View POs →` navigates to PO List filtered by `source_type = 'bulk'` and today's date.

---

### PLAN-MODAL-05: TO Create/Edit

**Trigger**: `+ Create TO` on TO List, or `Edit` from TO detail.  
**Width**: 640px.

Heading: `Create Transfer Order` or `Edit Transfer Order {to_number}`.

Form fields:
- From Warehouse (dropdown, required). V-PLAN-TO-001: ≠ To Warehouse. V-PLAN-TO-002: same site.
- To Warehouse (dropdown, required).
- Priority (select: Low, Normal, High, Urgent).
- Planned Ship Date (date picker, required).
- Planned Receive Date (date picker, optional, ≥ ship date).
- Notes (textarea, optional).

Lines table (inline, same pattern as PO step 2): Product (searchable dropdown, RM/intermediate/FA types), Qty (number > 0), UoM (auto-filled). `+ Add Line` row.

LP Selection section (shown when `to_require_lp_selection = true` in settings): `+ Select LPs for each line` button — opens PLAN-MODAL-06 LP Picker per line.

Buttons: `Cancel`, `Save Draft` (secondary), `Save & Plan` (primary — sets status to `planned`).

Validation: V-PLAN-TO-001 through V-PLAN-TO-003 enforced inline.

---

### PLAN-MODAL-06: LP Picker (TO Line)

**Trigger**: LP selection within PLAN-MODAL-05, or `+ Add LP` on TO Detail LP Breakdown panel.  
**Width**: 640px.  
**Description**: Scan-ready modal for selecting License Plates to assign to a TO line.

Header: `Select LPs for {product_name} — {required_qty} {uom} required`.

**Filter bar**: Warehouse (pre-filled from TO From Warehouse), FEFO/FIFO toggle, Search LP number (barcode scan input — large, prominent, with scan icon, auto-focus).

**LP Table**: Sorted by expiry date ASC (FEFO default). Columns:
- Select (checkbox)
- LP Number (barcode format)
- Location (warehouse + bin)
- Qty Available (net of reservations)
- Expiry Date (date; LPs expiring soon shown with amber `Expiring soon` badge)
- Status Badge: `available` (green), `reserved` (amber — shows reserved WO number), `quarantine` (red — blocked)

Only `available` LPs are selectable. `reserved` rows are grayed out but visible with reservation info in a tooltip.

LP hard-lock badge: If an LP is hard-locked to another WO (`reserved_for_wo_id` populated), shows `Hard Lock — WO-{number}` in red. Not selectable.

Running total: `{N} LPs selected | Total qty: {M} {uom} | Required: {required_qty} {uom}`. Green when ≥ required, red when insufficient.

Buttons: `Cancel`, `Confirm Selection` (primary, disabled until running total ≥ required qty).

---

### PLAN-MODAL-07: Ship TO

**Trigger**: `Ship` action on TO Detail.  
**Width**: 560px.

Form: per-line qty input (shipped_qty ≤ line qty per V-PLAN-TO-004). Pre-fills with remaining unshipped qty per line.

Summary: Total qty shipping this batch.

Buttons: `Cancel`, `Confirm Shipment` (primary). On success: TO status → `shipped` or `partially_shipped`, toast `Shipment recorded.`

---

### PLAN-MODAL-08: WO Create (with Cascade Preview Sub-step)

**Trigger**: `+ Create WO` on WO List.  
**Width**: 800px.  
**Description**: The most complex create modal. Has an inline sub-step that activates when the BOM contains intermediate layers.

**Step 1 — Basic Info**:
- Product (searchable dropdown, required). Shows item type badge (FA/intermediate/co_product/byproduct).
- Scheduled Start Date (date picker, required).
- Planned Quantity (number > 0, required). UoM auto-filled from product. V-PLAN-WO-001.
- BOM Version (dropdown, default auto-select latest active BOM per FR-PLAN-018). Manual override allowed with version history dropdown. Warning if no active BOM: amber banner `No active BOM for this product. You can save as Draft but cannot Release without a BOM.` V-PLAN-WO-002.
- Routing (auto-filled from BOM, editable override dropdown).
- Production Line (dropdown from 02-SETTINGS §12, optional).
- Machine (dropdown filtered by line, optional).
- Priority (select: Low, Normal, High, Critical).
- Is Rework toggle: off by default. When ON: BOM field grayed out with label `Rework WOs use manual materials`, approve-rework warning banner shown. V-PLAN-WO (rework approval setting).
- Source of Demand: auto-set to `manual`. D365-derived WOs show this as read-only `d365_so`.

**BOM Preview section** (appears after product + qty selected, expandable by default):
- Table of materials from BOM, scaled to planned qty. Columns: Material name, Required Qty, Available Qty (with G/Y/R indicator), Material Source badge (`stock` or `upstream_wo_output` if intermediate detected).
- Meat_Pct preview: if BOM has meat inputs, shows `Meat content (computed): {breakdown}` below the materials table.
- Outputs preview: primary output + co-products + byproducts from `bom_outputs`, with allocation %.

**Cascade Detection sub-step** (fires automatically when BOM contains intermediate items, i.e., at least one `bom_item.product.type = 'intermediate'`):

An amber info banner appears: `This BOM contains intermediate items. A cascade of {N} Work Orders will be generated. Review the chain before creating.`

Below the banner: `Preview Cascade Chain` button (primary secondary style). Clicking opens the cascade preview inline (expands the modal vertically, or opens PLAN-MODAL-09 Cascade Preview as a sub-modal).

Sub-step shows:
- Tree diagram of the proposed WO chain (simplified, not full DAG canvas). Each node: product name, type badge, proposed WO number (auto-generated numbering preview), planned qty.
- Arrows from parent to child.
- Total materials summary: all RM inputs across all WOs, aggregated qty.
- Timeline estimate: earliest start (root parent) to latest end (FA child).
- Cycle-check result: if BOM analysis detects a potential cycle, shows red alert `Potential cycle detected in BOM structure. Cannot create this cascade. Review BOM.` and disables the Create button.
- Disposition note: `All intermediate outputs will go to stock (to_stock). Child WO operators will scan intermediate LPs at production time.`

Allergen sequencing hint: if the WO's allergen profile conflicts with currently scheduled WOs on the same line, shows amber banner `Allergen conflict with {N} nearby WOs on {Line}. Consider reviewing sequencing after creation.`

Capacity hint: if the scheduled slot is at > 80% capacity on the line, shows amber banner `Line {Name} is at {N}% capacity on {date}. This WO may conflict with scheduled slots.`

**Step 2 — Confirm & Create** (only active after cascade preview reviewed):

Buttons: `Cancel`, `← Back`, `Create WO` (creates root WO and all cascade children in one API call). Loading state: spinner on button, text `Generating cascade chain…`. Success: closes modal, navigates to root WO detail (or cascade DAG view if chain depth > 1), toast `Work Order {wo_number} created{cascade_suffix}.` where `cascade_suffix` = ` and {N-1} intermediate WOs` if cascade depth > 1.

**Validation surfaced**:
- V-PLAN-WO-001: qty > 0
- V-PLAN-WO-002: BOM required (warning, not block at create)
- V-PLAN-WO-003: system ensures primary output exists
- V-PLAN-WO-005: cycle check before create
- V-PLAN-WO-006: idempotent cascade warning if same root demand already has WOs

---

### PLAN-MODAL-09: Cascade Preview (sub-modal)

**Trigger**: `Preview Cascade Chain` button inside PLAN-MODAL-08.  
**Width**: 900px (wide to show tree).

Full cascade chain preview identical to SCREEN-09 (Cascade DAG View) but in read-only preview mode, without the toolbar. Shows the proposed WO chain before creation. Includes cycle-check result and disposition note.

Buttons at bottom: `Close Preview` (returns to PLAN-MODAL-08), `Confirm — Create All WOs` (shortcut to create from preview).

---

### PLAN-MODAL-10: WO Reservation Override

**Trigger**: `Release` button on Reservation Panel table row (admin only).  
**Width**: 480px.

Heading: `Release Hard Lock — {lp_number}`. Warning panel: `Releasing this hard lock will make LP {lp_number} ({qty} {uom}) available to other Work Orders. WO {wo_number} will lose its material reservation.`

Form: Reason (select: Consumed manually, WO cancelled, Admin correction, Emergency reallocation, Other) + free-text reason detail (required, min 10 chars). V-PLAN-RES-003 + V-PLAN-RES-004 enforced.

Checkbox: `I confirm this action will be fully audit-logged.`

Buttons: `Cancel`, `Release Lock` (red danger primary). Disabled until checkbox checked and reason filled.

On success: reservation released, row shows `Released — admin_override` in amber, toast `Hard lock released. Audit entry created.`

---

### PLAN-MODAL-11: Allergen Override on Sequencing

**Trigger**: Drag-and-drop of WO to a position that increases allergen changeovers, or `Override` button on Sequencing Queue row.  
**Width**: 480px.

Heading: `Override Allergen Sequencing Position`.

Warning panel shows: before-state (current changeover count on line) and after-state (projected changeover count if override applied). Delta shown in red if negative: `+{N} additional changeover(s)`.

Form: Reason (textarea, required, min 10 chars). V-PLAN-SEQ-003 enforced.

Buttons: `Cancel` (reverts drag to original position), `Apply Override` (primary, amber). Logging note: `This override will be audit-logged against your user account.`

On success: sequencing queue updates with the overridden position. WO row shows amber `Sequencing override` badge. Toast `Sequencing override applied. Reason logged.`

---

### PLAN-MODAL-12: Cycle-Check Warning on DAG Save

**Trigger**: System-fired automatically during WO cascade generation when a cycle is detected.  
**Width**: 560px.

Heading: `Cascade Cycle Detected — Creation Blocked`. Icon: Red warning triangle.

Body: `A circular dependency was detected in the Work Order cascade for {product_name}. The following products form a cycle: {product_A} → {product_B} → {product_C} → {product_A}. No Work Orders were created. Review your Bill of Materials to resolve the circular dependency.`

Cycle detail table: Product, BOM Item, Detected Dependency.

Links: `View BOM for {product_name} →` (opens 03-TECHNICAL BOM detail in new tab), `Open Rule Registry →` (cascade_generation_v1 rule, read-only).

Buttons: `Close` (single action). No create action available until cycle resolved in BOM.

---

### PLAN-MODAL-13: D365 SO Trigger Confirm

**Trigger**: `Trigger Manual Pull Now` button on Planning Settings D365 tab or D365 SO Queue page.  
**Width**: 480px.

Heading: `Trigger D365 SO Pull`. Body: `This will pull Sales Orders from D365 matching the configured status filter ({filter values}) within the next {window_days} days. Draft Work Orders will be auto-generated for unresolved SOs. This action is logged.`

Last pull info: `Last pull: {datetime} | {N} SOs pulled`.

Buttons: `Cancel`, `Pull Now` (primary blue).

On success: modal closes, D365 SO Queue page refreshes, toast `D365 SO pull triggered. Draft WOs will appear shortly.`

---

### PLAN-MODAL-14: Workflow Rule Dry-Run

**Trigger**: `Dry Run` button on a rule in 02-SETTINGS §7 registry when viewing `wo_state_machine_v1` or related rules. Linked from Planning Settings tabs.  
**Width**: 560px.

Description: Shows the result of running the workflow rule against a sample WO. Input: select a WO from dropdown, select a proposed transition. Output: whether the transition would succeed or fail, which guards passed/failed, what side effects would fire.

This modal is read-only for planners (they can run dry-run but not modify rules). Admins can also run dry-run. Buttons: `Close`, `Run Dry-Run`.

---

### PLAN-MODAL-15: Sequencing Preview (Before/After)

**Trigger**: `Before/After Compare` toggle on Sequencing View.  
**Width**: 900px.

Two-column layout. Left: **Before sequencing** — current WO order on the line (no heuristic applied). Right: **After sequencing** — proposed order after heuristic. WO rows shown as compact cards with allergen family dots and changeover indicators.

Summary strip: `Before: {N} changeovers | After: {M} changeovers | Reduction: {K} ({R}%)`.

Buttons: `Cancel`, `Apply Sequencing` (primary — applies the after-sequence, same as `Run Sequencing` button).

---

### PLAN-MODAL-16: Draft WO Approve/Reject (D365 Queue)

**Trigger**: `Review` button on D365 SO Queue table row.  
**Width**: 640px.

Heading: `Review Draft WO from D365 SO`. Shows: D365 SO Reference, Product, Planned Qty, Scheduled Start, BOM auto-selected, Cascade chain summary (if depth > 1: tree list of all cascade WOs with products and qtys).

Material availability summary: G/Y/R indicators for all materials across the cascade chain.

Allergen hint: `This WO will be sequenced on line {name}. Current allergen position: {position}.`

Action selection (radio): `Approve and Release WOs (create reservations for RM materials on release)` / `Keep as Draft (manual release later)` / `Reject (delete this draft WO chain)`.

Reject reason (textarea, required when Reject selected).

Buttons: `Cancel`, `Confirm` (primary).

---

### PLAN-MODAL-17: Delete Confirmation

**Trigger**: Delete action on any entity (Supplier with no history, WO in DRAFT status, PO line).  
**Width**: 420px.

Standard confirmation modal. Heading: `Delete {entity_type}?`. Body: `This action is permanent and cannot be undone. {Specific impact statement per entity type.}`

Input: type the entity number to confirm (for destructive actions on WOs and POs). Supplier deletion: simple confirm checkbox.

Buttons: `Cancel`, `Delete` (red danger, disabled until confirmation input matches).

---

### PLAN-MODAL-18: Hard-Lock Release Confirm

**Trigger**: `Release` button when releasing an entire WO (on WO cancel or admin admin-release).  
**Width**: 480px.

Heading: `Release All Hard Locks for WO {wo_number}`. Body: `Cancelling this WO will release {N} LP hard locks for {M} materials. These LPs will become available to other Work Orders immediately.`

LP list: table of LPs being released (LP number, material, qty).

Confirmation checkbox: `I confirm I want to cancel this WO and release all hard locks.`

Buttons: `Cancel`, `Cancel WO & Release Locks` (red danger).

---

## 5. Flows

### Flow 1: D365 SO Pull → Draft WO Generation → Planner Review → Release

1. Admin enables `integration.d365.so_trigger.enabled` in Planning Settings → D365 tab. Nightly cron triggers (or admin manually triggers via PLAN-MODAL-13).
2. Worker pulls D365 SOs matching status filter and delivery window.
3. For each new SO: creates draft WO (`source_of_demand = 'd365_so'`), auto-selects BOM, runs cascade generation (PLAN-MODAL-12 fires if cycle detected — cascade rolled back).
4. `wo.created_from_d365_so` outbox event emitted → dashboard D365 SO Queue Depth KPI card updates.
5. Planner navigates to `/planning/d365-queue` (or sees dashboard alert). Reviews draft WOs in D365 SO Queue table (SCREEN-13).
6. Planner clicks `Review` on a draft WO → PLAN-MODAL-16 opens showing full cascade chain, material availability, allergen hint.
7. Planner selects `Approve and Release` → WO chain transitions DRAFT → RELEASED → reservations created for RM root materials via V-PLAN-RES-001/002 → allergen profile snapshot captured → `wo.scheduled` outbox event emitted.
8. If `cascade_depth > 1`: planner can view the full chain in SCREEN-09 (Cascade DAG View).
9. Planner navigates to `/planning/sequencing`, selects the production line, runs sequencing heuristic — allergen family grouping applied. PLAN-MODAL-15 shows before/after comparison.
10. Planner applies sequencing. WOs reordered on Gantt. `wo.sequencing_applied` emitted.

### Flow 2: Manual WO Creation with Intermediate Cascade

1. Planner clicks `+ Create WO` → PLAN-MODAL-08 opens.
2. Selects a Finished Article product. BOM auto-selected.
3. BOM contains intermediate items (e.g., `Stripped Chicken Breast` intermediate in `Chicken Kiev` FA). Cascade detection banner fires: `A cascade of 2 Work Orders will be generated.`
4. Planner clicks `Preview Cascade Chain` → PLAN-MODAL-09 opens. Shows parent WO (Stripped Chicken) → child WO (Chicken Kiev). Disposition badge `→ to_stock` on edge. Materials summary for both WOs shown. No cycle detected.
5. Planner reviews, closes preview, clicks `Create WO`. System creates 2 WOs and 1 `wo_dependency` edge. `wo_outputs` for parent WO includes `Stripped Chicken Breast intermediate LP`. Child WO `wo_materials` shows `material_source = 'upstream_wo_output'` for the intermediate.
6. System navigates to root WO detail → Dependencies tab shows the DAG. Planner can also open SCREEN-09.

### Flow 3: Allergen-Aware Sequencing

1. Planner navigates to `/planning/sequencing`. Selects `Baking Line 1`.
2. Queue shows 10 released WOs in FIFO order. Allergen dots show mixed profiles: 3 gluten-only, 2 allergen-free, 4 multi-allergen, 1 dairy-only.
3. Changeover count: 8 (worst case, no grouping).
4. Planner clicks `Run Sequencing`. Heuristic runs (≤ 2s for 50 WOs). Queue reorders: allergen-free first (2), then gluten-only (3), then dairy-only (1), then multi-allergen (4). Changeover count drops to 3.
5. Toast: `Sequencing applied — 5 changeovers reduced. New total: 3.`
6. Planner clicks `Before/After Compare` → PLAN-MODAL-15 shows the delta visually.
7. A critical WO is in the queue. It retains its position (exempt from sequencing per V-PLAN-SEQ-001). Planner tries to drag it manually. PLAN-MODAL-11 fires, requiring a reason.

### Flow 4: Hard-Lock Reservation — Conflict

1. Planner releases WO-001 for `Cocoa Mass LP-0043` (100 kg). Reservation created: hard lock.
2. Second planner tries to release WO-002, which also needs `Cocoa Mass LP-0043`. API returns 409 Conflict: `{reserved_by_wo: "WO-001", reserved_at: "...", can_override: false}`.
3. WO-002 shows red inline banner on WO Detail Reservations tab: `LP-0043 is hard-locked by WO-001. Contact admin for override.`
4. Admin opens PLAN-MODAL-10 on the Reservation Panel, provides reason, releases lock.
5. WO-002 can now be released and claim LP-0043. Audit log updated.

### Flow 5: Meat_Pct Multi-Component Aggregation

1. Planner creates WO for `Mixed Meat Kebab FA`. BOM has 3 meat inputs: Chicken (600g per kg output, `meat_content_pct = 100%`), Pork (200g, `meat_content_pct = 100%`), Beef (100g, `meat_content_pct = 100%`).
2. `wo.meat_pct_computed` is calculated: Chicken 67%, Pork 22%, Beef 11%. (Proportional to BOM quantities.)
3. WO Detail → Overview tab → below materials table: `Meat content: Chicken 67%, Pork 22%, Beef 11%`.
4. Tooltip: `Computed from BOM expand per FR-PLAN-026. Displayed per Apex v7 comma-separated format.`

### Flow 6: Workflow-as-Data — Admin Reads State Machine Rule

1. Admin navigates to 02-SETTINGS → Rule Registry → searches for `wo_state_machine_v1`.
2. Sees rule definition (read-only DSL). Transitions listed: DRAFT→RELEASED (guard: hasBOM, hasMaterials, dependsOnNotBlocking), RELEASED→IN_PROGRESS, etc.
3. Admin clicks `Dry Run` → PLAN-MODAL-14 opens. Selects WO-005 and transition `DRAFT→RELEASED`. Output: `hasBOM: PASS | hasMaterials: FAIL (Milk Powder insufficient) | dependsOnNotBlocking: PASS → Transition: BLOCKED`.
4. Admin cannot edit rule. Note: `Changes require a developer PR to the rule registry migration file.`

### Flow 7: Reservation Override

1. WO is cancelled. RM root reservation on `Butter LP-0072` (50kg hard lock) is auto-released with reason `wo_cancelled`.
2. Admin navigates to `/planning/reservations` to verify. Row shows `Released — wo_cancelled` in gray.
3. Separately, an admin needs to emergency-release `Flour LP-0088` from active WO. Opens PLAN-MODAL-10, selects reason `Emergency reallocation`, confirms. Audit entry created in `wo_status_history.override_reason`. Toast `Hard lock released. Audit entry created.`

---

## 6. Empty / Zero / Onboarding States

### Module-Level Onboarding (First Time, No Data)

When a tenant has no suppliers, POs, TOs, or WOs, the Dashboard shows a full-width onboarding card:

`Welcome to Planning. Set up your suppliers before creating Purchase Orders, then create Work Orders from your Bills of Materials.`

Step-by-step guide strip: `1. Create Suppliers → 2. Create Purchase Orders → 3. Create Transfer Orders → 4. Create Work Orders → 5. Review Cascade Chains → 6. Run Sequencing`

Each step has a button: `Go to {step}`.

### Per-Entity Empty States

| Screen | Empty Heading | Body | CTA |
|---|---|---|---|
| PO List | No Purchase Orders Yet | Create your first PO to begin procurement tracking. | + Create PO |
| TO List | No Transfer Orders Yet | Transfer inventory between warehouses to support production. | + Create TO |
| WO List | No Work Orders Yet | Create a Work Order to begin production scheduling. | + Create WO |
| Cascade DAG | No Active Cascade Chains | Cascade chains appear when WOs have multi-layer BOMs. Create a WO with intermediate items to see it here. | + Create WO |
| Reservations | No Active Reservations | Reservations are created automatically when WOs are released. | View WOs |
| Sequencing | No Production Line Selected | Select a production line to view its sequencing queue. | (line selector) |
| D365 Queue | No Draft WOs from D365 | Trigger a D365 SO pull or wait for the nightly schedule. | Trigger Pull Now |

### Per-Filter Empty States

All list screens (PO, TO, WO) show: `No {entity type} match your current filters. Clear All Filters.` with a filter icon illustration.

---

## 7. Notifications, Toasts, Alerts

### Toast Messages (auto-dismiss 5s, bottom-right)

| Action | Message | Type |
|---|---|---|
| PO created | `Purchase Order {po_number} created successfully.` | Green |
| PO submitted | `PO submitted for approval.` | Blue |
| PO approved | `Purchase Order approved. Status: Confirmed.` | Green |
| PO rejected | `Purchase Order rejected. Reason logged.` | Red |
| PO line added | `Line added to {po_number}.` | Green |
| TO created | `Transfer Order {to_number} created.` | Green |
| TO shipped | `Shipment recorded for {to_number}.` | Green |
| WO created (single) | `Work Order {wo_number} created.` | Green |
| WO created (cascade) | `Work Order {wo_number} and {N} intermediate WOs created.` | Green |
| WO released | `WO released. {N} LP hard locks created.` | Blue |
| WO released to warehouse | `WO {wo_number} is now visible to Scanner.` | Blue |
| WO released — LP conflict | `Release failed: LP {lp_number} is hard-locked by {wo_number}. {Details}` | Red |
| Sequencing applied | `Sequencing applied — {N} changeovers reduced. New total: {M}.` | Green |
| Override applied | `Override applied. Reason logged to audit.` | Amber |
| Settings saved | `Planning settings saved successfully.` | Green |
| D365 pull triggered | `D365 SO pull triggered. Draft WOs will appear shortly.` | Blue |
| Hard lock released | `Hard lock released. Audit entry created.` | Amber |
| Cycle detected | `Cascade creation blocked — cycle detected in BOM. Review BOM structure.` | Red (persistent) |

Persistent alerts (do not auto-dismiss): Cycle detected, D365 push failure, LP conflict.

### Inline Alerts (within screens)

- **D365 drift** (amber, on PO Detail and Supplier detail): `This record has drifted from D365. Admin resolve required.`
- **No active BOM** (amber, on WO Create and WO Detail): `No active BOM for this product on the scheduled date. WO cannot be released without a BOM.`
- **Capacity conflict** (amber, on WO Detail and Gantt): `This WO exceeds line capacity on {date}. Review in Gantt view.`
- **Material shortage** (red, on WO Detail materials table): `{material_name}: insufficient stock (available: {avail} {uom}, required: {req} {uom}).`
- **Upstream WO not planned** (red, on WO Detail materials table for upstream_wo_output material when parent is DRAFT): `Upstream WO is in DRAFT status. Intermediate material availability is unknown.`
- **Intermediate reservation info** (blue, on WO Detail Reservations tab): `Intermediate cascade materials are not reserved. They are consumed at production time via Scanner scan-to-consume.`

### Dashboard Alerts

Shown in Band 2 of the Dashboard (SCREEN-01). Grouped by type. Each dismissible per session with 5-second undo. Categories:
- Overdue PO (red)
- PO pending approval > 2 days (amber)
- Material shortage for scheduled WO (amber)
- WO on hold > 24h (amber)
- WO past scheduled end (red)
- D365 drift unresolved (amber)

---

## 8. Responsive Notes

### Desktop (> 1024px)

- Full sidebar (220px fixed).
- Main content uses full width with two-column layouts (65/35 split on detail pages).
- Tables show all columns.
- KPI cards in a single row (4 or 8 across).
- Modals centered, widths as specified.
- Gantt chart shows week view by default with all swimlanes visible.
- Cascade DAG canvas uses full available width.
- Sequencing queue shows drag handles by default.

### Tablet (768–1024px)

- Sidebar collapses to icon-only (48px wide) with tooltips on hover; tap to expand as overlay.
- Main content adjusts to `margin-left: 48px`.
- Two-column layouts collapse to single column.
- KPI cards in a 2×2 or 2×4 grid.
- Table columns: hide lower-priority columns (Allergen Profile, Cascade indicator). Tap row to expand details.
- Modals: full-width modal at 90vw.
- Gantt: horizontal scroll on swimlanes, pinch-to-zoom.
- Cascade DAG: pinch-to-zoom, nodes may shrink; tap node for side panel.

### Mobile (< 768px)

- Sidebar hidden; hamburger menu icon in a top nav bar opens sidebar as a full-screen overlay.
- Lists become card layouts (one card per entity, stacked).
- Bulk actions appear in a sticky bottom action sheet when items selected.
- Pagination: `Load More` button pattern (no numbered pages).
- Modals: full-screen on mobile, scrollable.
- Gantt: not recommended for mobile; show a day-view only; warn `Gantt view is optimised for desktop.`
- Cascade DAG: not recommended for mobile; show list-view of the chain instead, with expand/collapse.
- Filters: bottom sheet modal accessed via `Filters` button.
- Forms: single-column layout, full-width inputs.
- Minimum tap target: 48×48dp everywhere.

### Touch Optimisations

- Swipe left on list cards to reveal quick actions (Edit, Delete).
- Pull-to-refresh on all list screens.
- Drag handles on Sequencing queue are 44px touch targets.

---

## 9. Open Questions for Designer

The following items from PRD §16.3 (Open Questions) have UX implications and may need designer input during prototyping:

1. **OQ1 — Cascade re-run on BOM change**: If a BOM version changes after cascade WOs are created, should the system show a banner on the WO Detail/Cascade DAG view saying `BOM has been updated since this cascade was generated. Existing WOs use the snapshot BOM (ADR-002). New WOs will use the new BOM.`? Recommended: yes, add the banner. Snapshot badge on materials table already handles the immutability signal.

2. **OQ5 — WO cancellation cascade behavior**: When a planner cancels a parent WO in a cascade, should the system show a warning list of all downstream child WOs? Current spec says: warn, require explicit child cancel. Designer should confirm the warning modal layout — recommend a list of affected child WOs in PLAN-MODAL-17 delete confirmation with a checkbox per child WO to cancel.

3. **OQ6 — Changeover time display on Gantt**: Hardcoded 30min changeover time is used in P1. Should the Gantt show changeover blocks as distinct gray bars between allergen-transitioning WOs? Recommended: yes — a narrow gray bar labeled `Changeover ~30 min` between WO bars when allergen family changes.

4. **Cascade DAG zoom level defaults**: What is the default zoom level for the Cascade DAG when viewing a chain with 3+ layers? Recommend `Fit to screen` as default, with manual zoom controls. Designer should verify readability at screen-fit for 5-node graphs.

5. **Allergen dot legend placement**: Should the allergen family color dot legend appear inside each WO row/node, or as a global floating legend? Recommend: global floating legend in bottom-left of canvas (Gantt + Cascade DAG) and in the toolbar of Sequencing view.

6. **D365 Queue visibility**: Should the `/planning/d365-queue` route be completely absent from the sidebar navigation when the D365 flag is off, or should it be visible but gated with a lock icon and the gate page? Recommend: show in sidebar with a lock icon and a `Feature requires D365 integration` tooltip. The route is accessible but shows the gate page. This keeps the feature discoverable.

7. **Meat_Pct display format**: The PRD specifies comma-separated format (Apex v7 pattern). Should this also appear in WO list row as a small text or tooltip, or only on WO Detail? Recommend: WO Detail only (Overview tab, below materials table). Too dense for list rows.

8. **LP Picker scan input**: The LP Picker modal (PLAN-MODAL-06) has a prominent scan input. On desktop (no physical scanner), should this be a standard text input with a camera icon, or should it have a QR/barcode web-camera scan fallback? Recommend: text input with optional camera icon (clicking triggers `BarcodeDetector` Web API if available, or prompts `Use Scanner app on mobile`).

---

*End of 04-PLANNING-BASIC UX Specification*

**Total sections**: 9 top-level sections, 13 screens, 18 modals, 7 detailed flows, full empty/error/loading state coverage for every screen.

**Design system**: Fully defined in Section 1 with all tokens, badge styles, table styles, button styles, modal dimensions, and responsive breakpoints.

**Cascade DAG**: Described in full prose in SCREEN-09 with node layout (Sugiyama layered algorithm), edge direction (left-to-right), arrowhead semantics, edge thickness scaling, cycle-check warning UX (red CYCLE node + persistent red banner), collapse/expand with `+{N} hidden` indicator, zoom controls, and click-to-side-panel interaction. The `to_stock` disposition badge is annotated on every edge to reinforce the P1 design decision.

**D365 flag gating**: Every D365-related UI element (D365 KPI card, D365 tab in settings, D365 Queue route, `Trigger D365 Pull` quick action) has explicit disabled/hidden states documented for when `integration.d365.so_trigger.enabled = false`.

**Hard-lock reservation UX**: Clearly distinguishes three states throughout — `available` (green dot), `soft_plan` (not used in P1 — not shown), `hard_lock` (blue `Hard Lock` badge, LP becomes non-selectable in LP Picker with `Hard Lock — WO-{number}` indicator in red).

**Intermediate LP disposition**: Every screen that touches intermediate WO materials (WO Detail Outputs tab, Cascade DAG edge labels, WO Create Cascade Preview, LP Picker) shows the `to_stock` constraint clearly with tooltip explaining P1 rationale. No UI offer of `direct_continue` or `planner_decides` anywhere.
