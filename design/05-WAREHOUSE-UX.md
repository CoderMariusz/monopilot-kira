# 05-WAREHOUSE — UX Specification (for prototype generation)

**Version**: 1.0 | **Date**: 2026-04-20 | **Based on PRD**: 05-WAREHOUSE-PRD v3.0
**Audience**: Claude Design — HTML prototype generation. This document is self-contained. Build without asking questions.

---

## 0. Module Overview

The Warehouse module manages physical inventory exclusively through **License Plates (LP)** — atomic inventory units. Every GRN receipt, stock move, pick, consume, and production output creates or modifies an LP, delivering complete forward and backward traceability compliant with FSMA 204 (US) and EU 178/2002 (EU).

**Key concepts for the designer:**

- **LP state machine as workflow-as-data**: The LP lifecycle (`available → reserved → consumed`, `available → blocked`, etc.) is governed by the DSL rule `lp_state_machine_v1` stored in the 02-SETTINGS rule registry. The UI renders only the transitions that the rule currently permits for a given LP. Admin users see a read-only link to the registry — they cannot edit the transitions in this module.
- **Multi-LP per GRN line is the distinguishing UX pattern**: A single PO line can result in N license plates if the delivery arrives in multiple batches or on multiple pallets. The operator manually adds one row per LP; the system never auto-splits. Example: PO line for 100 BOX → operator adds row 1 (40 BOX, batch B, pallet P1, expiry 2026-10-15) and row 2 (60 BOX, batch B', pallet P2, expiry 2026-10-20) → 2 `grn_items` rows → 2 LPs created on GRN complete.
- **FEFO deviation is a warning, never a hard block**: When an operator picks an LP other than the one suggested by the FEFO rule, a warning modal appears requiring a reason code. The pick is always allowed after confirmation. The audit record goes to `pick_overrides`.
- **Intermediate LP always `to_stock` in P1**: LP produced by a work order (item_type = intermediate) always goes through put-away to `available` status. The UI never offers a `direct_continue` option. Downstream WOs consume via scanner scan-to-WO.
- **use_by blocks / best_before warns**: Expired `use_by` LP triggers a hard block on all operations; expired `best_before` LP triggers a dismissible warning with confirm.
- **Scanner flows are in 06-SCANNER-P1**: This document describes the desktop/tablet management UX and references scanner screens by their SCN-0xx codes.

**Primary personas**: Warehouse Operator, Warehouse Manager, QA Manager, Production Operator (scanner only), Planner (read-only), Administrator.

---

## 1. Design System (Inherited)

All components use the MonoPilot design system defined in `MONOPILOT-SITEMAP.html`. Summarised here for prototype generation.

**Typography**: Inter, system-ui, sans-serif. Body 14px / line-height 1.4. Page titles 20px bold. Card titles 14px 600. Table headers 12px 600 color `--muted`. Labels 12px 500 color `#374151`.

**Color tokens**:
- `--blue: #1976D2` — primary actions, active sidebar, focus rings, active tab underline
- `--green: #22c55e` — success, available badge accent
- `--amber: #f59e0b` — warning, expiring-soon accent
- `--red: #ef4444` — error, blocked/expired accent
- `--info: #3b82f6` — informational alerts
- `--bg: #f8fafc` — page background
- `--sidebar: #1e293b` — sidebar background
- `--card: #fff` — card/modal background
- `--text: #1e293b` — primary text
- `--muted: #64748b` — secondary text, table headers
- `--border: #e2e8f0` — all borders

**Radius**: `--radius: 6px` on cards, modals, badges. Buttons use 4px.

**Sidebar**: Fixed 220px left, `--sidebar` background. Logo area 14px padding. Active item: `background #1e3a5f`, `color #fff`, `border-left 3px solid --blue`. Hover: `background #334155`. Sub-items: 12px, `color #94a3b8`, indent 28px.

**KPI cards**: White card, 1px `--border`, `--radius`, 12px/14px padding, `border-bottom 3px solid <accent>`. Label 11px `--muted`. Value 26px bold. Optional change line 11px.

**Badges** (inline `display:inline-block`, `padding 2px 8px`, `border-radius 10px`, `font-size 11px 500`):
- `.badge-green` — `#dcfce7 / #166534`
- `.badge-amber` — `#fef3c7 / #92400e`
- `.badge-red` — `#fee2e2 / #991b1b`
- `.badge-blue` — `#dbeafe / #1e40af`
- `.badge-gray` — `#f1f5f9 / #475569`

**Tables**: `width 100%`, `border-collapse collapse`, 13px. Header: `background #f8fafc`, `border-bottom 2px --border`, 12px 600 `--muted`. Row hover: `background #f8fafc`. Cell padding: `7px 10px`.

**Buttons**: `.btn` base. `.btn-primary` blue fill. `.btn-secondary` white with border. `.btn-danger` red fill. Min height 32px. Touch target on scanner screens 48px.

**Modals**: Overlay `rgba(0,0,0,0.5)`. Box `background #fff`, `border-radius 8px`, `width 560px`, `max-height 80vh`, scrollable. Title 16px bold flex row with close ×. Padding 20px.

**Tabs**: Horizontal, `border-bottom 2px --border`. Active tab: `color --blue`, `border-bottom-color --blue`, 600. Inactive: `color --muted`.

**Alerts**: `padding 10px 14px`, `border-radius --radius`, `border-left 4px solid`. Colours: `.alert-red`, `.alert-amber`, `.alert-blue`, `.alert-green`.

**Tree items**: `.tree-item.l0` (no indent, bold), `.tree-item.l1` (16px indent), `.tree-item.l2` (32px), `.tree-item.l3` (48px). Left border `1px --border` on indented items.

**Timeline items** (`.tl-item`): flex row, 8px gap, dot 8px circle, time right-aligned 11px muted, 12px text, bottom border `1px #f1f5f9`.

---

## 2. Information Architecture

### 2.1 Sidebar Entry

The Warehouse module appears in the sidebar under group **OPERATIONS** with icon and label **Warehouse**. When the Warehouse section is active, sub-items expand below the parent entry.

**Sidebar sub-items** (12px, indented 28px):
- Dashboard
- License Plates
- Inventory
- GRN
- Stock Movements
- Reservations
- Locations
- Genealogy
- Expiry
- Settings

### 2.2 Route Map

| Screen | Route |
|--------|-------|
| Warehouse Dashboard | `/warehouse` |
| LP List | `/warehouse/lps` |
| LP Detail | `/warehouse/lps/:id` |
| GRN List | `/warehouse/grn` |
| GRN New (wizard) | `/warehouse/grn/new` |
| GRN Detail | `/warehouse/grn/:id` |
| Stock Movements List | `/warehouse/movements` |
| Reservations Panel | `/warehouse/reservations` |
| Locations Hierarchy | `/warehouse/locations` |
| LP Genealogy | `/warehouse/genealogy` |
| Expiry Dashboard | `/warehouse/expiry` |
| Inventory Browser | `/warehouse/inventory` |
| Warehouse Settings | `/warehouse/settings` |

### 2.3 Permissions Matrix

| Action | Operator | Manager | QA | Prod Op | Planner | Admin |
|--------|----------|---------|----|----|---------|-------|
| View dashboard | Read | Read | Read | Read | Read | Read |
| View inventory value (GBP) | — | Read | — | — | Read | Read |
| GRN create / complete | Yes | Yes | — | — | — | Yes |
| LP split / merge | Yes | Yes | — | — | — | Yes |
| LP block / unblock | — | Yes | Yes | — | — | Yes |
| QA status change | — | — | Yes | — | — | Yes |
| Stock move (full) | Yes | Yes | — | Yes | — | Yes |
| Adjustment > 10% (approve) | — | Yes | — | — | — | Yes |
| Override FEFO (with audit) | Yes | Yes | — | Yes | — | Yes |
| Scanner consume-to-WO | Yes | — | — | Yes | — | — |
| Warehouse settings edit | — | — | — | — | — | Yes |
| View settings (read-only) | — | Yes | — | — | — | Yes |
| Release reservation | — | Yes | — | — | — | Yes |
| View genealogy | Yes | Yes | Yes | Yes | Yes | Yes |

Permission-denied state: show a full-page or inline message "You do not have permission to perform this action. Contact your administrator." with a back button. Never show a blank page.

---

## 3. Screens

---

### WH-001 — Warehouse Dashboard

**Route**: `/warehouse`
**Purpose**: Single-glance operational health overview. Warehouse manager and supervisor start their shift here. Refresh every 60 seconds (Redis TTL); manual refresh button in page header.
**Personas**: All roles (value KPI hidden for Operator and QA).

#### Layout

The page uses a standard full-width layout inside the 220px-offset main area. Top area contains a page title row, then a KPI card strip, then a two-column lower area: left column holds the Alerts panel and Expiry widget; right column holds the Recent Activity feed. A Warehouse selector dropdown appears in the page header when the tenant has multiple warehouses.

#### KPI Card Strip (top row, 4-column grid at desktop, 2-column at tablet)

Eight cards in two rows at desktop. Each card uses `.kpi` class with the accent colour on `border-bottom`:

1. **Total Active LPs** — count of LPs with status `available` or `reserved`. Accent: `--blue`. Label: "Active LPs". Example value: `1,247`.
2. **Unique SKUs** — distinct product_id count in active LPs. Accent: `--blue`. Label: "Unique SKUs". Example: `83`.
3. **Inventory Value** — sum of qty × product.cost in GBP. Accent: `--green`. Label: "Inventory Value". Example: `£48,320`. Visible only to Manager, Planner, Admin; for other roles the card shows a lock icon and text "Restricted".
4. **Expiring ≤7d** — count. Accent: `--red`. Label: "Expiring ≤7d". Example: `12`. Clicking navigates to `/warehouse/expiry` with filter pre-set to 7 days.
5. **Expiring ≤30d** — count. Accent: `--amber`. Label: "Expiring ≤30d". Example: `47`. Clicking navigates to `/warehouse/expiry`.
6. **QC Hold** — count of LPs with qa_status `PENDING` or `HOLD`. Accent: `--amber`. Label: "QC Hold". Example: `8`.
7. **Blocked LPs** — count of LPs with status `blocked`. Accent: `--red`. Label: "Blocked". Example: `3`.
8. **Intermediate Buffer** — count of LPs with item_type_snapshot `intermediate` and status `available`. Accent: `--info`. Label: "Intermediate Buffer". Example: `21`. Tooltip on hover: "Intermediate LPs available on stock awaiting consumption".

Each KPI card shows a secondary line in 11px muted text — e.g., "vs yesterday: +4" or "updated 2 min ago".

#### Alerts Panel (left column, card)

Title: "Alerts". Each alert row uses `.alert` component with left border colour matching severity.

Alert types rendered in priority order:
- **Expired use_by auto-blocked today** (`.alert-red`): "N LP(s) auto-blocked by expiry cron today. [View →]" — links to `/warehouse/expiry?filter=blocked_today`.
- **QC Hold > 48h** (`.alert-amber`): "N LP(s) have been on QC Hold for more than 48 hours. [View →]" — links to LP list filtered by qa_status HOLD and hold duration > 48h.
- **Low stock** (`.alert-amber`, only if thresholds configured): "Product {name}: {qty} {uom} remaining, below threshold {threshold}. [View →]".
- **Scanner lock stuck** (`.alert-blue`): "LP {lp_number} has been locked by {user} for > 5 minutes at {location}. [Force release]" — button triggers admin-level lock release with confirmation.
- **FEFO override rate > 10% (7-day)** (`.alert-amber`): "FEFO override rate is {pct}% in the last 7 days (target <5%). [View overrides →]".
- **D365 sync mismatch** (`.alert-blue`): From 04-PLANNING cross-module. "N unresolved supplier data mismatches. [View →]".

Empty state: "No alerts. All systems nominal." in muted text with a green check icon.

#### Expiry Summary Widget (left column, below Alerts, card)

Two-row table or two badge-accented summary lines:
- Red row: "**{N} LP(s)** expiring within 7 days" — click to `/warehouse/expiry?tier=red`.
- Amber row: "**{N} LP(s)** expiring within 30 days" — click to `/warehouse/expiry?tier=amber`.

Below, a small table showing top 5 soonest-expiring LPs: columns LP Number, Product, Batch, Expiry Date (rendered as `DD MMM YYYY`), Location, Status badge. Expiry column coloured red if ≤7d, amber if ≤30d.

#### Recent Activity Feed (right column, card)

Title: "Recent Activity" with a type filter dropdown (All / Split / Merge / Move / Consume / Output / Receipt). Shows last 50 events as timeline items using `.tl-item` pattern.

Each item: coloured dot (green = receipt/output, blue = move, amber = split/merge, red = consume/block), description text (e.g., "LP00000042 moved from Zone-Cold-B3 to Line-1 by J.Kowalski"), timestamp right-aligned. Click on LP number navigates to LP detail.

Loading state: 8 skeleton rows with shimmer animation, 200ms before real data.

Empty state: "No recent activity in the last 24 hours."

#### Page Actions (header area, right-aligned)

- **[+ Receive Goods]** (`.btn-primary`) — opens GRN from PO modal (WH-004-PO).
- **[New Stock Movement]** (`.btn-secondary`) — opens Stock Movement Create modal (WH-007).
- **[Refresh]** icon button — forces cache invalidation and reload.
- Warehouse selector dropdown (if multi-warehouse) — changing it reloads all KPIs.

#### States

- **Loading**: All KPI cards show skeleton placeholders (grey blocks). Alert panel shows 2 skeleton rows. Feed shows 5 skeleton rows.
- **Error** (API failure): Banner `.alert-red` at top: "Failed to load dashboard data. [Retry]". KPI cards show "—" values with a warning icon.
- **Permission-denied** (Operator viewing value KPI): Lock icon + "Restricted" inline within the card only; rest of dashboard visible normally.
- **Populated**: All states described above.

#### Microcopy

- KPI tooltip on Intermediate Buffer: "LPs produced by work orders with item type 'intermediate'. Always go through stock — not reserved directly."
- FEFO override alert tooltip: "FEFO override rate measures how often operators pick an LP different from the system's FEFO suggestion. High rates may indicate rule calibration issues."
- Auto-refresh indicator: Small text in bottom-right of page: "Auto-refreshed 2 min ago".

---

### WH-002 — License Plate List

**Route**: `/warehouse/lps`
**Purpose**: Searchable, filterable master list of all LPs in the current warehouse. The primary lookup tool for operators and managers.
**Triggered by**: Sidebar "License Plates" link, also reachable from GRN success state and KPI card drill-downs.

#### Layout

Page header with title "License Plates", breadcrumb "Warehouse / License Plates", page-level action buttons. Below header: filter bar, then a data table with pagination.

#### Filter Bar (WH-005 integration)

A single-row filter strip with collapsible "More filters" toggle. Always-visible filters:
- **Search** text field (full width up to 240px): searches LP number, batch_number, product code, product name. Placeholder: "Search LP#, product, batch…". Keyboard shortcut: pressing `/` focuses this field.
- **Status** multi-select dropdown: options available / reserved / blocked / consumed / shipped / merged. Default: available + reserved.
- **QA Status** multi-select: PENDING / PASSED / FAILED / HOLD / RELEASED / QUARANTINED / COND_APPROVED.
- **[More filters]** toggle reveals:
  - **Warehouse** dropdown (if multi-warehouse).
  - **Location** searchable dropdown — shows location ltree path.
  - **Product** searchable dropdown — type to search by name or code.
  - **Item Type** multi-select: RM / intermediate / FA / co_product / byproduct.
  - **Expiry range** two date pickers: "Expiry from" and "Expiry to".
  - **Picking strategy** dropdown: fefo / fifo / manual.
  - **Reservation** toggle: "Show only reserved LPs" checkbox.
  - **Created date range** from/to.

Active filters shown as removable badge chips below the filter bar. A "Clear all filters" link appears when any filter is active.

#### Table Columns

| Column | Type | Example | Width | Notes |
|--------|------|---------|-------|-------|
| LP Number | Text link, bold | `LP00000042` | 130px | Clicking navigates to WH-003 LP detail |
| Product | Text (code + name) | `PR5101R — Roasted Chicken` | 200px | Two lines: code muted above, name below |
| Qty / UoM | Numeric | `120 BOX` | 90px | If catch_weight, second line: `184 KG` muted |
| Batch | Text | `B-2026-04-10` | 120px | Shows supplier batch in tooltip on hover |
| Expiry | Date | `15 Oct 2026` | 100px | Red text if ≤7d; amber if ≤30d; red strikethrough if expired use_by; orange italic if expired best_before |
| Status | Badge | `available` badge-green | 90px | Colours per state machine: available=green, reserved=blue, blocked=red, consumed=gray, shipped=gray, merged=gray |
| QA Status | Badge | `PASSED` badge-green | 90px | PASSED/RELEASED=green; PENDING/HOLD=amber; FAILED/QUARANTINED=red; COND_APPROVED=blue |
| Location | ltree breadcrumb | `ForzDG → Zone-Cold → B3` | 180px | Rendered as "Warehouse → Zone → Bin" chain with `›` separators. Muted colour for ancestors, bold for leaf |
| Strategy | Badge-gray or text | `fefo` | 70px | Per product picking_strategy |
| Reserved | Indicator | `WO-2026-042` | 120px | If LP is reserved: shows WO number as blue text link to WO detail. If partial: "70/100 BOX" in muted text. If not reserved: empty |
| Last Move | Relative time | `2h ago` | 80px | Tooltip shows full timestamp and move type |

Columns sortable by clicking header: LP Number, Qty, Expiry, Last Move. Default sort: Expiry ASC NULLS LAST (FEFO order), then Created ASC.

#### Row Actions (visible on row hover, right-aligned)

Three quick-action icon buttons per row:
- **Split** icon (scissors) — opens WH-008 LP Split Modal. Hidden if LP status is not `available` or `reserved`.
- **Print label** icon — opens WH-013 Label Print Modal.
- **More** (ellipsis dropdown): View Detail / Move / Block / QA Status / Merge / Destroy-Scrap. Items disabled (grayed, with tooltip) when the current user lacks permission or the state machine does not permit the transition.

#### Page-Level Actions (header, right-aligned)

- **[Export CSV]** (`.btn-secondary`) — exports current filtered result set.
- **[+ New LP (adjustment)]** (`.btn-secondary`) — opens Stock Movement Create modal in `adjustment_in` mode. Manager/Admin only; button hidden for Operator.

#### Pagination

50 rows per page. "Showing 1–50 of 1,247 LPs" text. Prev/Next buttons. Page size selector: 25 / 50 / 100.

#### States

- **Loading**: Skeleton table with 10 rows and shimmering cells.
- **Empty (no LPs exist)**: Large centred illustration placeholder, heading "No license plates yet", body "Start by receiving goods from a purchase order or transfer order.", button "[Receive Goods]" (`.btn-primary`).
- **Empty (filters active, no match)**: "No LPs match your filters." with "Clear filters" link.
- **Populated**: As described.
- **Error**: `.alert-red` banner "Failed to load LP list. [Retry]".
- **Permission-denied**: Full-page message if the user has no read access.

#### Microcopy

- Expiry column tooltip on red strikethrough: "This LP has passed its use-by date and has been automatically blocked. Operations are not permitted."
- Reserved column tooltip on partial: "This LP is partially reserved. The unreserved quantity is available for other operations."
- Strategy badge tooltip: "Picking strategy is set per product. Override is available at pick time with an audit reason."

---

### WH-003 — LP Detail

**Route**: `/warehouse/lps/:id`
**Purpose**: Complete information about a single LP — identity, stock quantities, current state, full audit history. The primary reference page for exception handling and traceability.

#### Layout

Page header: LP number as title (e.g., "LP00000042"), breadcrumb "Warehouse / License Plates / LP00000042". Right side of header: status badge (colour per state machine) + QA status badge side-by-side. Below header: a horizontal tab bar with 7 tabs.

A left sidebar panel (300px) shows the LP identity card — always visible regardless of active tab.

#### LP Identity Card (left sidebar, always visible)

A white card with the following fields in a vertical list. Labels 12px muted, values 14px:

- **Product**: code (bold) + full name. Example: `PR5101R — Roasted Chicken`
- **Item Type**: badge-gray. Example: `intermediate` or `raw material`
- **Quantity**: `120 BOX`. If catch_weight: second line `184 KG`.
- **Reserved Qty**: `40 BOX reserved for WO-2026-042`. Hidden if zero.
- **Available Qty**: `80 BOX available`. Shown when partial reservation active.
- **Batch Number**: `B-2026-04-10`. Click copies to clipboard.
- **Supplier Batch**: `SUP-B-987` (muted, or "—" if none).
- **Expiry Date**: `15 Oct 2026`. Colour-coded as per LP list rules. Shows shelf_life_mode_snapshot in parentheses: "(use_by)" or "(best_before)". If expired: red text + warning icon.
- **Manufacture Date**: `01 Apr 2026`.
- **Date Code**: `2614` (rendered per product.date_code_format).
- **GTIN**: `05012345678901`.
- **Location**: ltree breadcrumb (same format as list, bold leaf). Example: `ForzDG → Zone-Cold → Bin-B3`.
- **Warehouse**: `ForzDG`.
- **Source**: badge-gray. `grn` / `wo_output` / `split` / `merge` / `adjustment`.
- **GRN Reference**: Link to GRN detail if source = grn. Example: `GRN-2026-00042 →`.
- **WO Reference**: Link if source = wo_output. Example: `WO-2026-108 →`.
- **Parent LP**: Link if split child. Example: `LP00000020 (parent) →`.
- **Locked by**: Shows username + lock time if currently scanner-locked. Badge-amber + "Locked by M.Kowalski (5 min remaining)". Hidden if not locked.
- **Created**: `20 Apr 2026 10:42 by J.Nowak`.
- **Last Updated**: relative time.

Below the identity fields: **Action buttons** (primary actions for this LP). Buttons rendered based on allowed transitions from state machine rule `lp_state_machine_v1` for the current LP status. The set of rendered buttons is not hard-coded — it is derived at runtime:
- **[Split]** — if status allows split (available or reserved). Opens WH-008.
- **[Print Label]** — always available. Opens WH-013.
- **[Move]** — opens WH-007 Stock Movement modal pre-populated with this LP.
- **[Block]** / **[Unblock]** — visible based on state machine transitions. Role-gated (Manager, QA, Admin). Block requires reason code confirmation.
- **[Change QA Status]** — opens WH-009 QA Status Change Modal. QA role only.
- **[Destroy / Scrap]** — Manager/Admin only, opens confirmation modal with audit reason.

A note in small muted text below the buttons: "Available actions are determined by the LP state machine rule `lp_state_machine_v1`. Contact your administrator to review rule definitions in Settings → Rule Registry."

**Expiry warning banner** (above tabs, full width): If LP expiry_date ≤7d and status=available: `.alert-amber` "This LP expires in {N} days on {date}. Review before picking." If expired use_by: `.alert-red` "This LP has passed its use-by date ({date}). All operations are blocked. Manager override required." If expired best_before: `.alert-amber` "This LP has passed its best-before date ({date}). Pick is allowed with confirmation."

#### Tab 1 — Overview

Two-column grid. Left column repeats the key identity fields in a card. Right column shows:
- **Ext fields** (L3 schema-driven): rendered as key-value pairs from `ext_jsonb`. If none configured: "No custom fields configured. Add via Settings → Schema Extensions."
- **Notes / Audit notes**: text area (read-only if not editable role). Example ext fields: Storage Temperature Zone, Halal Batch Indicator, Supplier Cert Ref.

#### Tab 2 — Movements

Chronological table of all `stock_moves` for this LP.

Columns: Timestamp, Move Type (badge-gray), From Location (ltree breadcrumb or "—" for receipt), To Location, Qty, Reason Code, Reference (link to GRN/WO/TO), Performed By.

Default sort: timestamp DESC. No pagination (all moves shown — typically < 50 per LP). If > 100 moves: show first 100 with "Load all" link.

Empty state: "No movements recorded yet." (only possible for LPs just created and not yet moved).

#### Tab 3 — Genealogy

A visual tree showing the LP's position in the genealogy graph. P1 scope: renders parent nodes (up to 3 levels upstream) and child nodes (up to 3 levels downstream).

Rendered using `.tree-item` hierarchy classes:
- Root node at `.tree-item.l0`: this LP (highlighted with blue left border).
- Parent nodes at `.tree-item.l1`: LPs that were consumed/split to create this LP. Each shows operation type icon (split scissors / merge arrows / consume circle).
- Grandparent nodes at `.tree-item.l2`: up to 3 levels.
- Children at `.tree-item.l1` (in a second tree below): LPs created from this LP.

Each node shows: LP number (clickable link), product name, operation type, date of operation, WO reference if applicable.

"View full genealogy" link at bottom → navigates to `/warehouse/genealogy?seed_lp={id}` which runs the recursive CTE for the full depth-10 traversal.

**FSMA 204 export button**: "[Export Trace Report]" (`.btn-secondary`) — triggers the genealogy query and downloads a CSV or PDF with all upstream/downstream nodes. Loading state shows: "Building genealogy trace… (may take up to 30 seconds)".

#### Tab 4 — Reservations

Table of `lp_reservations` for this LP.

Columns: WO Number (link), Reserved Qty, Reservation Type (`hard_lock` badge-blue), Reserved At, Reserved By, Status (active / released), Released At, Release Reason.

P1 note: "Reservations are only created for raw material LPs allocated to work orders. Intermediate LPs are consumed via scanner scan-to-WO without pre-reservation."

Empty state: "No reservations for this LP."

Action: **[Release Reservation]** button per active reservation row. Manager/Admin only. Opens Release Reservation modal (WH-RES-004, described in §4).

#### Tab 5 — State History

A timeline of all LP status transitions, sourced from audit records.

Each row: dot coloured by new state, "Transitioned from {old_state} to {new_state} by {user} on {date} — Reason: {reason_code}". Uses `.tl-item` component.

Below the LP status timeline, a second section "QA Status History" showing the same pattern for qa_status changes (from `quality_status_history` table). Each entry: "QA changed from {old} to {new} by {user} on {date}".

#### Tab 6 — Labels

Print history table: columns — Printed At, Template Used, Printer, Copies, Printed By, Status (success / failed). "Print label again" action per row.

**[Print Label]** button (`.btn-primary`) at tab top — opens WH-013 Label Print Modal.

If `print_label_on_receipt=true` was active when the LP was created, the first row shows an auto-print entry.

Empty state: "No labels printed yet. Print your first label using the button above."

#### Tab 7 — Audit

Full audit log for this LP record (all field changes). Table: Timestamp, Field Changed, Old Value, New Value, Changed By, Change Source (api / scanner / cron / system).

Useful for compliance review. Export CSV button at top right.

#### States

- **Loading**: Skeleton layout for identity card + tab content.
- **Not found** (invalid ID): Centred message "License plate not found. [Back to LP list]".
- **Permission-denied**: Inline message within tab content area.
- **Populated**: As described.
- **LP locked** (scanner lock active): Banner `.alert-amber` "This LP is currently locked by {username} on scanner session. Lock expires at {time}. [Force release] (Admin only)".

---

### WH-004-PO — GRN from PO (3-Step Wizard)

**Route**: `/warehouse/grn/new?source=po` (also accessible as a modal from WH-001 dashboard and PO Detail page)
**Purpose**: Record goods receipt against a Purchase Order. THE distinguishing UX pattern — operator manually adds N rows per PO line, each row becoming one LP. System never auto-splits.
**Modal dimensions**: When opened as modal, 700px wide (wider than standard 560px to accommodate the multi-row line table).

#### Step 1 — Select Purchase Order

**Header**: "Receive Goods — Step 1 of 3: Select Purchase Order". Progress indicator (3 steps, step 1 active).

Content area:
- A search/scan input at top: "Type PO number or scan barcode…" with a scan icon button. Width 360px. On input, filters the PO list below in real time.
- Filter row (below search): Supplier dropdown (all suppliers), Warehouse dropdown, Due within (7 days / 30 days / All) dropdown.
- A table of available POs (status `confirmed` or `receiving`):

| Column | Example |
|--------|---------|
| PO Number | `PO-2026-00156` (bold link) |
| Supplier | `Mill Co. (SUP-001)` |
| Due Date | `22 Apr 2026` (red if overdue) |
| Lines | `3 lines` |
| Progress | Progress bar + text: `60% received` |
| Status | Badge: `confirmed` badge-blue / `receiving` badge-amber |
| Action | `[Select →]` button `.btn-primary` small |

Pagination: 20 per page.

**Empty state**: Centred illustration, "No Purchase Orders Available for Receiving". Body: "Purchase orders must be in Confirmed or Receiving status. Check the Planning module to confirm pending orders." Buttons: `[View Pending POs →]` and `[Close]`.

**Loading state**: Skeleton table 5 rows.

Footer: `[Cancel]` button.

#### Step 2 — Enter Receipt Lines (Multi-LP Flow)

**Header**: "Receive Goods — Step 2 of 3: Enter Receipt Lines". PO summary card pinned at top:
- PO Number, Supplier, Expected Date, Warehouse, "View PO" link.
- Progress bar: "X of Y lines covered — Z% of ordered qty".

**GRN header fields** (row above line table, two columns):
- GRN Number (auto-generated, read-only, monospace font): `GRN-2026-00042`. Help text: "Auto-generated. Cannot be changed."
- Receipt Date (date picker): default today. Required. V-WH-GRN-001 note: only draft GRNs are editable.
- Default Receiving Location (searchable dropdown): defaults to warehouse's default receiving location. Can be overridden per line.
- Notes (textarea, optional): max 500 chars.

**PO Lines section** — one accordion card per PO line:

Each PO line card has a collapsible header row showing:
- Line number and product: "Line 2 — Sugar White (RM-SUGAR-001)"
- Summary badge row: `Ordered: 200 BOX` / `Received so far: 100 BOX` / `Remaining: 100 BOX` (colour-coded: green if fully received, amber if partial, no colour if zero)
- Status badge: `Fully Received` badge-green / `Partially Received` badge-amber / `Not Received` badge-gray
- `[+ Add LP Row]` button (`.btn-secondary`, small) — adds a new row to this line's LP table. Hidden if line is fully received.

When expanded, each PO line shows a **multi-row LP entry table**:

Table header row: Qty | UoM | Batch | Supplier Batch | Expiry Date | Mfg Date | Catch Weight (kg) | Location | QA Status | Remove

Each data row is an inline editable form row:
- **Qty** (numeric input, required): V-WH-GRN-002 validation runs on blur — shows red inline error "Exceeds remaining {N} BOX" if over without allow. Shows amber warning "Over-receipt within {pct}% tolerance" if within tolerance. Min width 80px.
- **UoM** (read-only label): inherited from PO line — `BOX`, `KG`, `EA`.
- **Batch** (text input): Required if `require_batch_on_receipt=true`. Placeholder: "e.g. B-2026-04-10". On GS1 scan the field auto-fills with amber "Parsed from barcode" indicator. V-WH-GRN-003.
- **Supplier Batch** (text input, optional): Placeholder: "Supplier's lot code".
- **Expiry Date** (date picker): Required if `require_expiry_on_receipt=true`. V-WH-GRN-004. Date must be in the future. If GS1 scan fills this, shows amber parsed indicator.
- **Mfg Date** (date picker, optional): If provided, shelf life is auto-calculated and shown inline as "Shelf life: 186 days" in muted text below the field.
- **Catch Weight kg** (numeric input): Required if product.is_catch_weight=true. V-WH-GRN-005. Shows tolerance range in placeholder: "Target: 184 kg ±10%". Red if outside tolerance.
- **Location** (searchable dropdown): Defaults to GRN default location. Operator can override per LP row.
- **QA Status** (segmented radio inline): PENDING (default) / PASSED / HOLD. Small labels.
- **Remove** (trash icon button): removes this row. Confirmation not required if row is empty; if row has data, shows inline "Are you sure?" with Yes/No.

Below the LP rows table: `[+ Add LP Row]` button. Microcopy: "Each row creates one License Plate. Add multiple rows if goods arrived in different batches or on separate pallets."

**GS1 scan integration**: A scan icon button next to each Batch field triggers GS1-128 parsing. Parsed fields (batch, expiry, manufacture date, catch weight, qty) are auto-filled and shown with a green "Parsed from GS1 barcode" badge next to each field. Operator reviews and confirms values. If a field conflicts with an already-entered value, it is highlighted in amber with "Overwrite?" prompt.

**Running total bar** (sticky at bottom of each PO line card):
- "This line: {Σ qty of all rows} / {ordered qty} {UoM}" — rendered as a progress bar. Green if within tolerance. Amber if over but within allowed tolerance. Red if over tolerance limit.
- Text variant: "40 + 60 = 100 / 100 BOX — Fully accounted for." (example for the 2-LP scenario).
- If total < ordered qty: "60 / 100 BOX — 40 BOX remaining (GRN can still be completed as partial)."

**LP Preview panel** (collapsible, below line rows table): Shows a preview card per row: "LP to be created: {auto LP number} — {product} — {qty} {uom} — Batch: {batch} — Expiry: {expiry} — Location: {location} — QA: {qa_status}". Helps operator verify before committing.

Footer of Step 2: Running summary bar showing total LPs to be created and total qty across all lines. `[Back]` (`.btn-secondary`) and `[Next: Review →]` (`.btn-primary`). The Next button is disabled if any required field is missing or any validation error is unresolved. Tooltip on disabled button: "Fix validation errors above to proceed."

#### Step 3 — Review and Complete

**Header**: "Receive Goods — Step 3 of 3: Review & Complete".

Summary table: one row per LP to be created. Columns: Line, LP# (preview), Product, Qty, UoM, Batch, Expiry, Location, QA Status, Catch Weight.

**GRN total summary**: Total LPs: N. Total Qty by product. Estimated print jobs: N labels.

**Print options** (checkboxes below summary):
- "Print labels after receipt" (checked by default if `print_label_on_receipt=true`).
- "Email notification to warehouse manager" (checked by default).

**Over-receipt warning** (if any line is being over-received within tolerance): `.alert-amber` "Warning: Line {N} ({product}) will receive {qty} {uom}, which exceeds ordered quantity by {pct}%. This is within the allowed tolerance of {tolerance}%."

**Partial receipt note** (if some PO lines have zero rows): `.alert-blue` "Lines {N, N} have no receipt rows and will remain pending."

**Force close option** (if some lines have partial receipt and operator wants to close them): A section "Lines to force-close" with checkboxes per partially-received line. For each checked line: reason_code dropdown (under_delivery / supplier_discontinued / quality_reject / other) and reason_text textarea. V-WH-GRN-008.

Footer: `[Back]` (`.btn-secondary`), `[Complete Receipt]` (`.btn-primary`).

#### Loading State During Completion

Progress modal overlaying the wizard: title "Creating Goods Receipt…", animated progress bar (indeterminate), step-by-step checklist:
- Validating receipt quantities (animated spinner, then check)
- Creating GRN record (spinner → check)
- Generating {N} License Plate(s) (spinner → check)
- Updating PO status (spinner → check)
- Printing labels (spinner → check, only if print enabled)

Each step transitions to a checkmark when the API confirms it. If a step fails, it shows a red X with the error message. "Do not close this window" guidance text.

#### Success State

Green check icon. "Goods Receipt Created Successfully." Summary card:
- GRN Number: `GRN-2026-00042`
- LPs Created: bulleted list with LP number, product, qty, location.
- PO Status Updated: `Confirmed → Receiving (75% complete)` or `→ Closed` if fully received.
- Labels printed: "1 label queued for printing."

Action buttons: `[View GRN Details]`, `[Receive More from This PO]`, `[View License Plates]`, `[Print Labels Again]`, `[Close]`.

#### Error State

`.alert-red` banner at top of wizard with a bullet list of all validation errors. Each error links to the field in error. Example: "Line 2, Row 1 — Quantity exceeds ordered: max 100 BOX". "Fix errors above and try again."

---

### WH-005 — GRN from TO (Transfer Order Modal)

**Route**: Modal accessed from TO detail in 04-PLANNING, or from `/warehouse/grn/new?source=to`
**Purpose**: Record goods receipt from an inter-warehouse Transfer Order. Different from PO flow: source LPs already exist on the system (they were shipped from the source warehouse); receiving = moving them from transit location to destination put-away location.

#### Layout

Single-screen modal (560px wide). Not a wizard — simpler than PO flow because LP identity is already known.

**TO header card** (read-only): TO Number, From Warehouse, To Warehouse, Shipped Date, Status (shipped / partially_shipped). "View TO" link.

**LPs in transit** — table of LPs that were shipped from source warehouse and now sit at the transit location `TRN-IN-{warehouse_code}`:

Columns: LP Number (link, opens LP detail in new tab), Product, Qty, UoM, Batch, Expiry (colour-coded), Current Location (transit), Received checkbox.

Operator scans each LP barcode or ticks the checkbox manually to mark it as received. Scan input at top of table: "Scan LP barcode to mark as received…"

For each received LP: a **Destination Location** dropdown appears inline (defaults to TO's default put-away location, overridable per LP). This triggers a `stock_move: putaway` from transit → destination.

**Exception: LP-less transit** (if tenant allows bulk qty TO without LPs): A "Create LP on receipt" section appears below the LP table with fields for qty, batch, expiry, location — same as GRN from PO single row. This path is less common.

Footer: running counter "Received {N} of {M} LPs". `[Cancel]` and `[Complete Receipt]` (`.btn-primary`). Complete is enabled once at least one LP is marked received.

**Over-receipt on TO**: Not applicable (LP qty is fixed by source warehouse). If LP qty discrepancy (damage in transit), operator must use stock adjustment on the specific LP after receiving.

States: Loading (skeleton table), Empty (no LPs in transit — "No LPs in transit for this TO"), Populated, Error.

---

### WH-006 — Stock Movements List

**Route**: `/warehouse/movements`
**Purpose**: Complete filterable audit log of all stock movements. Reference tool for managers and auditors.

#### Layout

Page header: "Stock Movements", breadcrumb, filter bar, table, pagination.

#### Filter Bar

- **Search**: move number, LP number, product, WO reference. Placeholder: "Search SM#, LP#, product, WO…"
- **Move Type** multi-select: transfer / putaway / issue / receipt / adjustment / return / quarantine / consume_to_wo.
- **Date range** from/to date pickers.
- **Location** searchable dropdown (from or to).
- **LP** text field.
- **WO** text field.
- **User** dropdown.

#### Table Columns

| Column | Example | Notes |
|--------|---------|-------|
| Timestamp | `20 Apr 2026 14:35` | Sortable |
| Move # | `SM-2026-00318` | Monospace, small |
| Move Type | `transfer` badge-gray | Colour by type: receipt=green, consume=red, adjustment=amber, transfer/putaway=blue |
| LP | `LP00000042` | Link to LP detail |
| Product | `PR5101R` | Code only, hover for full name |
| Qty | `−40 BOX` | Negative for issues/consumes, positive for receipts |
| From Location | `Zone-Cold › B3` | "—" for receipts from null |
| To Location | `Line-1 › Buffer` | Ltree breadcrumb short form |
| Reason Code | `damage` | Badge-gray, shown only for adjustments/quarantine |
| Reference | `WO-2026-042` | Link to source document |
| Performed By | `M.Kowalski` | User full name |

Default sort: Timestamp DESC. Row click opens a detail side-panel (slide-in from right) with full move details. No separate detail page.

**Side-panel fields**: Move number, type badge, LP link, product, quantity, from/to location full ltree paths, reason_code, reason_text, WO/GRN/TO reference link, created_at, created_by.

#### Page Actions

- **[+ New Movement]** (`.btn-primary`) — opens WH-007 Stock Movement Create Modal.
- **[Export CSV]** (`.btn-secondary`).

#### States

Loading: skeleton 10 rows. Empty (no movements): "No stock movements recorded." with "[+ New Movement]" button. Populated: as described. Error: alert banner + retry.

---

### WH-007 — Stock Movement Create Modal

**Route**: Modal opened from WH-006 and LP detail action buttons.
**Purpose**: Manually create a stock movement (transfer, adjustment, quarantine, putaway). Not used for consume-to-WO (that is scanner-driven).

#### Layout

560px modal. Title: "New Stock Movement". Form in two columns.

#### Fields

- **LP** (searchable input with scan icon, required): type LP number or scan barcode. On selection, shows LP summary card below the field: product, current location, qty, status badge. V-WH-MOV-001: only available/reserved LPs shown.
- **Move Type** (dropdown, required): Transfer / Putaway / Adjustment / Return / Quarantine. Pre-selected if opened from LP detail with a specific action.
- **Quantity to Move** (numeric, required): Default: full LP qty. Shows LP qty below field: "LP holds {N} {uom}. Entering less than full quantity will trigger an automatic LP split." V-WH-MOV-002.
- **Catch Weight kg** (numeric, conditional): shown if product.is_catch_weight=true.
- **Destination Location** (searchable dropdown, required for non-adjustment moves): shows location ltree path. V-WH-MOV-003.
- **Reason Code** (dropdown, required for adjustment / quarantine / return): options vary by move type:
  - Adjustment: damage / theft / counting_error / quality_issue / expired / other
  - Quarantine: qa_fail / contamination_risk / other
  - Return: production_return / shipment_return / other
  V-WH-MOV-005.
- **Reason Text** (textarea, required if reason_code = `other`): "Describe the reason in detail."
- **Reference Type / ID** (optional): links the move to a document. Dropdown: GRN / TO / WO / Cycle Count. Then a text field for the reference ID.

**Adjustment > 10% warning**: When the quantity delta exceeds 10% of LP.qty, an inline `.alert-amber` appears: "This adjustment exceeds 10% of the LP quantity. It will require manager approval before taking effect." V-WH-MOV-004. The modal footer changes to "[Submit for Approval]" rather than "[Confirm Move]".

**Partial move / auto-split notice**: When qty < LP.qty, an inline `.alert-blue` appears: "Entering a partial quantity will automatically split this LP. A new child LP will be created for the moved quantity. The original LP will retain the remaining {N} {uom}."

Footer: `[Cancel]` and `[Confirm Move]` (`.btn-primary`), or `[Submit for Approval]` if adjustment > 10%.

#### States

- **Initial** (no LP selected): LP field highlighted, other fields greyed out. Placeholder: "Select or scan an LP to begin."
- **LP selected**: all fields active.
- **Submitting**: button spinner, fields disabled.
- **Success**: toast notification "Movement SM-2026-XXXXX recorded." Modal auto-closes after 1.5s.
- **Error**: inline `.alert-red` with error message. Modal stays open.

---

### WH-008 — LP Split Modal

**Route**: Modal triggered from LP list row action, LP detail action button, or LP detail overview tab.
**Purpose**: Split one LP into two or more child LPs. Genealogy is preserved. The split is instantaneous (< 300ms SLO).

#### Layout

560px modal. Title: "Split License Plate — LP{number}".

**Source LP summary card** (read-only, top of modal):
- Product, Qty, UoM, Batch, Expiry, Location, Status, QA Status.
- Large quantity display: "**120 BOX** available to split".

**Split Rows section**: A table where each row defines one output LP.

Operator uses `[+ Add Output LP]` button to add rows. Minimum 2 rows required.

Each row:
- **Qty** (numeric, required): portion assigned to this output LP. V-WH-LP-003: sum of all rows must equal source LP qty.
- **Destination Location** (searchable dropdown): defaults to source LP location. Operator can override for each output LP — useful to immediately put-away to different locations.
- **Label** checkbox: "Print label for this LP" (checked by default).

**Running total validator** (below rows table): "Allocated: {Σ} / {source qty} {uom}." If sum < source: red text "Remaining unallocated: {delta}. All source quantity must be allocated." If sum > source: red "Exceeds source quantity by {delta}." Submit button disabled until sum equals source.

**Genealogy note** (below validator): Small muted text: "All output LPs inherit batch, expiry, QA status, and GTIN from the source LP. Catch weight is prorated proportionally. A genealogy record (operation: split) will be created linking source to all outputs."

Footer: `[Cancel]` and `[Confirm Split]` (`.btn-primary`). On confirm: source LP quantity becomes the first output LP quantity at source location; new child LPs are created for remaining outputs.

#### States

- **Initial**: 2 empty rows pre-populated.
- **Validating**: real-time validation on qty change.
- **Submitting**: spinner, fields disabled.
- **Success**: toast "LP split into {N} License Plates." Modal closes. LP list refreshes.
- **Error**: inline alert, modal stays open.

---

### WH-009 — QA Status Change Modal

**Route**: Modal opened from LP detail "[Change QA Status]" button.
**Purpose**: Transition LP qa_status. Owned by 09-QUALITY; triggered from Warehouse LP detail. Creates a `quality_status_history` audit record.

#### Layout

560px modal. Title: "Change QA Status — LP{number}".

**Current state display**: Large badge showing current qa_status (colour-coded). Below: "Transition to:".

**Allowed transitions dropdown**: A select showing only the transitions permitted by the QA state machine rule. Options use full readable labels:
- `PENDING → PASSED` / `PENDING → FAILED` / `PENDING → HOLD`
- `HOLD → RELEASED` / `HOLD → FAILED` / `HOLD → QUARANTINED`
- `FAILED → QUARANTINED` / `FAILED → HOLD`
- `QUARANTINED → RELEASED` (with COND_APPROVED option)
- `RELEASED → HOLD` (re-open)
- `COND_APPROVED → HOLD` / `COND_APPROVED → RELEASED`

Not all transitions available from every state — dropdown only shows valid next states.

**Reason Code** (dropdown, required for all QA status changes): Options depend on destination status:
- → FAILED: contamination / foreign_body / out_of_spec / microbiological_failure / allergen_cross_contact / other
- → HOLD: pending_lab_results / pending_paperwork / supplier_query / customer_complaint / other
- → RELEASED: lab_cleared / visual_inspection_passed / documentation_complete / other
- → QUARANTINED: immediate_safety_risk / regulatory_recall / other

**Reason Text** (textarea, required if reason_code = `other`).

**COND_APPROVED notes** (shown when destination = COND_APPROVED): `.alert-amber` "Conditionally Approved: pick and consume allowed, but shipping to customers is blocked until full release."

**Quarantine location suggestion** (shown when destination = QUARANTINED): `.alert-blue` "Consider moving this LP to a designated quarantine location. System will NOT move it automatically — use a separate stock movement to the quarantine zone after this status change."

Footer: `[Cancel]` and `[Change Status]` (`.btn-primary`, coloured amber if transitioning to HOLD/QUARANTINED, red if to FAILED, green if to PASSED/RELEASED).

---

### WH-010 — GRN List

**Route**: `/warehouse/grn`
**Purpose**: Master list of all Goods Receipt Notes.

#### Layout

Page header: "Goods Receipts", filter bar, table, pagination.

**Filter bar**: Search (GRN number, PO number), Status (draft / completed / cancelled), Source Type (po / to / return), Warehouse, Date range from/to, Supplier dropdown.

**Table columns**: GRN Number (link), Source Type badge, Source Doc (PO/TO link), Supplier, Receipt Date, Warehouse, Status badge (draft=amber, completed=green, cancelled=gray), Lines count, Total Qty summary, Received By.

Row click → `/warehouse/grn/:id`.

**Page actions**: `[+ Receive from PO]` (`.btn-primary`) opens WH-004-PO. `[+ Receive from TO]` opens WH-005.

**GRN Detail page** (`/warehouse/grn/:id`): Header with GRN number and status badge. Summary card (PO/TO link, supplier, receipt date, location, notes). Below: table of grn_items with columns: Line, Product, LP Created (link), Qty, Batch, Expiry, Location, QA Status, Catch Weight. Footer actions: "[View All LPs]" → LP list filtered by grn_id.

---

### WH-011 — Stock Movements List

(Described in WH-006 above — same route `/warehouse/movements`.)

---

### WH-012 — Inventory Browser

**Route**: `/warehouse/inventory`
**Purpose**: Aggregated inventory view grouped by product and/or location. Top-level summary for managers; drill-down to individual LPs.

#### Layout

Page header: "Inventory Browser". View toggles: **By Product** (default) | **By Location** | **By Batch**.

Filter bar: Warehouse dropdown, Item Type multi-select, QA Status multi-select, Location subtree picker (shows all LPs under a selected location), Status multi-select.

#### By Product View

Table aggregated at product level:

| Column | Example |
|--------|---------|
| Product Code | `PR5101R` |
| Product Name | `Roasted Chicken` |
| Item Type | `intermediate` badge-gray |
| Total Qty | `1,200 BOX` |
| Reserved Qty | `400 BOX` |
| Available Qty | `800 BOX` |
| QC Hold Qty | `0` |
| Total LPs | `12` |
| Expiry (earliest) | `01 May 2026` (red if ≤7d) |
| Locations | `3 locations` |
| Picking Strategy | `fefo` badge-gray |
| Inventory Value | `£4,800` (Manager/Admin only) |

Row expand (click row or expand icon) → inline LP list for that product (same columns as WH-002 LP list, but compact — fewer columns). "View all LPs →" link in the expanded section opens `/warehouse/lps?product_id={id}`.

#### By Location View

Collapsible tree on the left (location hierarchy using `.tree-item` classes). Clicking a node shows the LP table for that location and all descendants (ltree `@>` query).

Right panel: same aggregated table but grouped by location path. Each location row shows: Location Path, LP Count, Total Qty by product (top 3 products, "+ N more" link).

#### By Batch View

Table grouped by batch_number + product combination:

| Column | Example |
|--------|---------|
| Batch | `B-2026-04-10` |
| Supplier Batch | `SUP-987` |
| Product | `PR5101R` |
| Total Qty | `500 BOX` |
| LPs | `5` |
| Earliest Expiry | `15 Oct 2026` |
| QA Status (majority) | `PASSED` |
| Received Date | `10 Apr 2026` |

Row click → LP list filtered by batch.

**Export**: `[Export CSV]` button for current view/filter. Includes inventory value for authorized roles.

---

### WH-013 — Label Print Modal

**Route**: Modal opened from LP detail, LP list row action, GRN success state, split success.
**Purpose**: Print one or more LP labels to a ZPL printer.

#### Layout

560px modal. Title: "Print Label — LP{number}".

**Label preview panel** (top, 60% width): Rendered preview of the label content (not actual ZPL rendering — a structured HTML representation showing all label fields):
- Large barcode placeholder (Code 128) with LP number below.
- QR code placeholder with URL `https://{tenant}.monopilot.io/lp/{lp_id}`.
- Fields: Product Code + Name, Item Type, Qty + UoM + Catch Weight (if applicable), Batch + Supplier Batch, Expiry Date (red label if ≤7d), Location, Pallet ID (if applicable), Date Code, Operator, Print Date.
- If LP has expired use_by: label preview shows a red "BLOCKED — DO NOT SHIP" stamp overlay.

**Print settings** (right side):
- **Template** dropdown: Standard 4×6 / Mini 2×2 / Pallet (P2, grayed out). Default: Standard.
- **Printer** dropdown: lists configured printers for current warehouse. Shows printer name + IP + "Online" / "Offline" status (green/red dot). V-WH-LABEL-003.
- **Copies** numeric input: 1–10. Default from `warehouse_settings.label_copies_default`. V-WH-LABEL-004.
- **"Add to queue"** option: toggle — if enabled, adds to background print queue rather than sending immediately.

**Reprint history** (collapsible section at bottom): table showing previous print jobs for this LP: Date, Template, Printer, Copies, Status, Printed By.

Footer: `[Cancel]` and `[Print]` (`.btn-primary`). On print:
- If printer online: immediate confirmation toast "Print job sent to {printer}."
- If printer offline: `.alert-red` "Printer {name} is offline. Try a different printer or add to queue."

---

### WH-014 — LP Genealogy Tree

**Route**: `/warehouse/genealogy`
**Purpose**: FSMA 204 compliant forward and backward traceability. Recursive CTE query displaying the full LP lineage graph up to 10 levels deep. Query target < 30s.

#### Layout

Page header: "Lot Genealogy & Traceability". Search input prominently placed: "Search by LP number, batch, or supplier batch…" with `[Trace]` button. Alternatively: "or scan LP barcode" with scan icon.

**Query type toggle** (radio buttons): Forward Trace (given LP → downstream) | Backward Trace (given LP → upstream) | Full Trace (both directions).

**Depth limit** slider: 1–10 levels. Default 10. Shows "Query may take up to 30 seconds at depth 10."

**Loading state**: Progress indicator with message "Building genealogy trace. Querying {N} linked records…" and estimated time. A cancel button stops the query.

**Result — Tree view** (primary display):

The genealogy tree uses the `.tree-item` hierarchy but in an expanded card format. Each node is a card within the hierarchy:
- Node card shows: LP number (link), product name, item type badge, qty, batch, expiry, operation type icon and label, date, WO/GRN reference link.
- Operation type icons: scissors (split), merge arrows (merge), circle with arrow in (consume), circle with arrow out (output/produce), box (receipt from GRN).
- FEFO compliance indicator on consume operations: `FEFO-compliant` badge-green or `Override` badge-amber (with reason code tooltip).
- Collapse/expand all button in tree header.

**Result — List view** (tab toggle beside tree):
A flat table of all nodes with depth column: Depth, LP Number, Product, Batch, Expiry, Operation Type, Date, WO/GRN Ref, FEFO Compliant.

**FSMA 204 Export**: `[Export Trace Report]` button generates a structured report with:
- All LPs in the chain with supplier info, lot numbers, dates.
- All work orders involved.
- All locations and timestamps.
- FEFO compliance summary.
Format: PDF or CSV.

**Empty state** (no LP entered yet): Illustrated prompt: "Enter an LP number, batch number, or scan a barcode to trace its genealogy." Two example use cases shown: "Forward trace: track a recalled ingredient to all affected finished products" and "Backward trace: identify all raw materials in a finished product."

**Error state** (query failed or timed out): `.alert-red` "Genealogy query failed. Try reducing depth or narrowing the search. If this persists, contact support."

---

### WH-015 — Available LPs Picker (WH-RES-001)

**Route**: Component (not a standalone page) — appears within WO detail in 04-PLANNING and within reservation creation flow.
**Purpose**: FEFO-ordered list of available LPs for a specific product/warehouse, used to select LPs for reservation or pick assignment.

#### Layout

Panel (used inline within a parent page/modal, or as a 700px side-panel). Header: "Available LPs — {Product Name} ({Product Code})". Strategy indicator: "Picking strategy: FEFO" (badge-blue) with a `[Override strategy]` dropdown (FEFO / FIFO / Manual) at the right. Changing strategy re-sorts the list. Strategy override is recorded in `pick_overrides` if different from product default.

**LP table** (FEFO-ordered by default):

| Column | Example | Notes |
|--------|---------|-------|
| Rank | `#1` | FEFO rank |
| LP Number | `LP00000010` | Link |
| Qty Available | `80 BOX` | `quantity − reserved_qty` |
| Batch | `B-2026-03-15` | |
| Expiry | `01 May 2026` | Red if ≤7d, amber ≤30d |
| Location | `Zone-Cold › B3` | ltree short form |
| QA Status | `PASSED` badge-green | |
| FEFO Suggestion | Star icon on rank #1 row | Tooltip: "System recommends this LP based on earliest expiry date." |

FEFO suggestion row highlighted with a subtle `--blue` left border.

**Select action**: Each row has `[Select]` button. If operator selects a row other than rank #1, the FEFO deviation warning modal is triggered (see §4 — FEFO Deviation Confirm modal).

**Scan mode toggle**: `[Switch to Scan Mode]` button at top — shows a barcode scan input instead of the table; operator scans LP barcode and it is selected. If scanned LP is not rank #1, same FEFO deviation warning fires.

Empty state: "No available LPs for {product} in {warehouse} matching the current QA and status filters."

---

### WH-016 — Reserve Modal (WH-RES-002)

**Route**: Modal opened from WO detail in 04-PLANNING (reservation creation), or from Available LPs Picker.
**Purpose**: Create a hard-lock reservation on a specific LP for a specific Work Order. P1 scope: RM root only (material_source='stock').

#### Layout

560px modal. Title: "Reserve LP for Work Order".

**WO summary** (read-only card, top): WO Number, Product to Produce, Status (must be RELEASED to create reservation), Warehouse, Required Material line details.

**LP selection** (if not pre-selected from picker):
- Searchable LP field or "[Pick LP]" button that opens the Available LPs Picker inline.
- If LP is pre-selected (opened from picker after FEFO confirmation): shows LP summary card (LP number, product, qty, batch, expiry, location).

**Reservation qty** (numeric): default = full available qty or WO material requirement qty, whichever is smaller. Shows "Reserving {N} of {M} available {uom}. Remaining after reservation: {R}."

**Expiry confirmation**: If LP expiry_date ≤ WO.planned_end_date: `.alert-amber` "This LP expires on {date} before the planned WO end date {WO_date}. Confirm this is acceptable."

**Intermediate LP restriction**: If operator accidentally tries to reserve an intermediate LP: `.alert-red` "Reservations are only available for raw material LPs (material_source='stock'). Intermediate LPs are consumed via scanner scan-to-WO without pre-reservation. No action needed."  V-WH-FEFO-005.

Footer: `[Cancel]` and `[Confirm Reservation]` (`.btn-primary`).

Concurrent reservation conflict: If LP is already reserved by another WO, the modal shows an `.alert-red` "This LP is already reserved for WO-{number} ({reserved_qty} {uom}). Release the existing reservation or choose a different LP." V-WH-FEFO-003.

---

### WH-017 — WO Reservations Panel (WH-RES-003)

**Route**: Tab within WO Detail page in 04-PLANNING. Also accessible at `/warehouse/reservations?wo_id={id}` for direct warehouse navigation.
**Purpose**: Show all LP reservations for a Work Order. Allow release with audit.

#### Layout

Card within WO detail. Title: "Material Reservations". Badge showing count: "3 active reservations".

**Table of reservations**:

| Column | Example |
|--------|---------|
| Material Line | `RM-FLOUR-001 — Flour (Line 1)` |
| LP Number | `LP00000015` (link) |
| Reserved Qty | `80 BOX` |
| LP Qty (total) | `100 BOX` |
| Reservation Type | `hard_lock` badge-blue |
| Expiry | `20 Jun 2026` |
| LP Location | `Zone-Dry › A2` |
| Reserved At | `20 Apr 2026 09:00` |
| Status | `Active` badge-green / `Released` badge-gray |
| Release Reason | "—" or reason if released |

**Release action**: Per active reservation row: `[Release]` button (Manager/Admin only). Opens Release Reservation confirmation modal: "Release reservation of {qty} {uom} LP{number} from WO-{number}? This action is audited." Dropdown: Release reason (consumed / cancelled / wo_cancelled / admin_override). Required. `[Confirm Release]` and `[Cancel]`.

**Info note** at bottom of panel: "These are hard-lock reservations for raw material inputs. Intermediate material consumption happens at scan time — see the Consumption Log tab."

Empty state: "No active reservations. Reservations are created automatically when this WO is released, for all raw material lines with material_source='stock'."

---

### WH-018 — Locations Hierarchy View

**Route**: `/warehouse/locations`
**Purpose**: View and manage the location hierarchy (2–5 levels per tenant, Forza default: 3 levels: warehouse → zone → bin). Backed by ltree column in the `locations` table from 02-SETTINGS.

#### Layout

Horizontal split: left panel (320px) = collapsible tree; right panel = selected location details + LP list.

**Left panel — Location Tree**:

Using `.tree-item` hierarchy classes. Each level has an expand/collapse toggle (triangle icon). Node label: location code + name + LP count badge.
- Level 0 (`.tree-item.l0`): Warehouse. Example: `ForzDG — Forza Foods Main (142 LPs)`.
- Level 1 (`.tree-item.l1`): Zone. Example: `Zone-Cold — Cold Storage (58 LPs)`, `Zone-Dry — Dry Storage (62 LPs)`, `Zone-Transit — Transit (22 LPs)`.
- Level 2 (`.tree-item.l2`): Bin. Example: `Bin-B3 — Cold Bin B3 (12 LPs)`.

"Transit" locations rendered with a distinct icon (truck) to distinguish from storage locations.

**Right panel — Selected Location Details**:

When a node is selected:
- **Header**: location code + full name + ltree path (monospace, small).
- **Type badge**: storage / transit / receiving / production_line.
- **Active**: toggle indicator (green dot = active).
- **LP count**: total LPs at this location (includes all descendant bins via ltree aggregate query).
- **Actions** (Admin only): `[Edit Location]` / `[Add Child Location]` / `[Deactivate]`.

Below the header: a compact LP table filtered to this location (and descendants). Same columns as WH-002 LP list but pagination 25.

**Add/Edit Location modal** (Admin only): fields — Code, Name, Parent Location (dropdown, shows current ltree path), Type (storage / transit / receiving / production_line), Is Active toggle. Max depth validation: if tenant `location_depth_max=3` (Forza default), system blocks adding a 4th-level location with message "Maximum location depth for this tenant is 3 levels (warehouse → zone → bin). Contact your administrator to increase the limit in Settings → Warehouse Settings."

---

### WH-019 — Expiry Dashboard

**Route**: `/warehouse/expiry`
**Purpose**: Manage LP expiry gating. Shows expired and expiring LPs. Daily cron auto-blocks `use_by` expired LPs; this dashboard is the manual action surface.

#### Layout

Page header: "Expiry Management", last cron run timestamp ("Last auto-run: 20 Apr 2026 02:00 UTC — N LPs processed"), manual `[Run Cron Now]` button (Admin only).

**Alert summary** (top strip, two `.alert` cards side by side):
- `.alert-red` card: "{N} LPs have passed their **use-by date** and are **blocked**. Immediate action required."
- `.alert-amber` card: "{N} LPs have passed their **best-before date** and carry quality warnings. Operations allowed with confirmation."

**Two-tab view**: Expired | Expiring Soon

#### Expired Tab

Table of LPs with expiry_date < TODAY. Filters above table: shelf_life_mode toggle (use_by / best_before / all), Product dropdown, Warehouse dropdown.

| Column | Example | Notes |
|--------|---------|-------|
| LP Number | `LP00000007` | Link |
| Product | `PR5101R` | |
| Batch | `B-2026-02-01` | |
| Expiry Date | `15 Apr 2026` | Red, with "N days ago" subtitle |
| Mode | `use_by` badge-red / `best_before` badge-amber | |
| Status | `blocked` badge-red (use_by) / `available` badge-amber (best_before) | |
| Qty | `60 BOX` | |
| Location | `Zone-Cold › B2` | |
| Auto-blocked | `Yes — 20 Apr 2026` (use_by) / `No` (best_before) | |
| Action | See below | |

**Row actions** by LP type:
- For `use_by` blocked: `[Destroy/Scrap]` and `[Manager Override - Unblock]` (Manager/Admin, opens confirmation with mandatory reason + full audit).
- For `best_before` expired (still available): `[Block]` (operator can block manually) / `[Destroy/Scrap]` / `[Allow with warning]` (already the default — tooltip: "This LP can be picked with a confirmation warning").

#### Expiring Soon Tab

Filters: "Within" toggle: 7 days (red) / 30 days (amber) / Custom range. Same table structure but expiry_date BETWEEN today AND today+N.

Action per row: `[View LP]` link. No block/release actions in this tab — those are on the LP detail.

**Use_by vs Best_before gating summary** (info card below tabs):

A two-column reference card:
- **use_by (EU 1169/2011)**: "LP expired → automatically blocked by daily cron. All operations (pick, consume, ship) prevented. Manager override requires mandatory reason code and creates an audit record."
- **best_before**: "LP expired → status remains unchanged. Operations allowed with a warning banner. Operator confirms before proceeding. Suitable for secondary use / donation."

---

### WH-020 — Warehouse Settings (WH-SET-001)

**Route**: `/warehouse/settings`
**Purpose**: Tenant-level warehouse configuration. Admin only for edits; Manager/read access.

#### Layout

Page header: "Warehouse Settings". Left nav (within the page) for setting categories. Main content area shows the current category's settings.

**Setting categories** (left nav, 200px):
- General
- LP Numbering
- Receiving (GRN)
- Picking & Strategy
- Expiry & Shelf Life
- Labels & Printing
- Scanner
- Locations
- Integrations

Each category renders settings as a form with labels, inputs, and save button per category. Not all settings on one giant form.

#### General Settings

- **Warehouse Name** / **Code** (read-only from 02-SETTINGS §12).
- **Default Warehouse** toggle: "Set as default for new users".
- **Archival Retention** (months, numeric): LPs in consumed/shipped status archived after N months. Default 12.
- **Dashboard Cache TTL** (seconds): Redis TTL for dashboard KPIs. Default 60.

#### LP Numbering

- **Auto-generate LP Number** toggle. Default: ON.
- **LP Number Prefix** text: `LP`. Help text: "Forza default: LP. Example output: LP00000001."
- **Sequence Length** (digits, 4–12): default 8. Preview: "LP00000001".
- **Allow Manual LP Number** toggle: OFF. Help: "When ON, operators can enter custom LP numbers (e.g., from supplier-printed GS1 labels). Uniqueness is still enforced."

#### Receiving (GRN)

- **Require Batch on Receipt** toggle. Default: ON. V-WH-GRN-003.
- **Require Expiry Date on Receipt** toggle. Default: ON. V-WH-GRN-004.
- **Require Supplier Batch** toggle. Default: OFF.
- **Default QA Status on Receipt** dropdown: PENDING / PASSED. Default: PENDING.
- **Allow Over-Receipt** toggle. Default: OFF.
- **Over-Receipt Tolerance (%)** (numeric, 0–50). Enabled only when Allow Over-Receipt=ON.

#### Picking & Strategy

- **Enable FEFO** toggle. Default: ON. Help: "FEFO (First Expired First Out) is the default strategy for food manufacturing (EU 1169/2011)."
- **Enable FIFO Fallback** toggle: ON. "Used for products with no expiry date."
- **Allow FEFO Override** toggle: ON. "Operators may deviate from FEFO suggestion with a mandatory reason code."
- **Require Override Reason** toggle: ON. Locked to ON if Allow FEFO Override is ON.
- **FEFO Rule Registry** (read-only link): "View rule: `fefo_strategy_v1` in Settings → Rule Registry." External link. Tooltip: "This rule is dev-authored and deployed via PR. Admins can view and audit but not edit here."
- **LP State Machine Rule** (read-only link): "View rule: `lp_state_machine_v1` in Settings → Rule Registry."

#### Expiry & Shelf Life

- **Expiry Warning — Red Threshold** (days): default 7.
- **Expiry Warning — Yellow Threshold** (days): default 30.
- **Expiry Cron Schedule** (cron expression): default `0 2 * * *` (daily at 02:00 UTC). Help text shows next 3 run times.
- **use_by auto-block on cron** toggle: ON (non-configurable for food tenants — locked with padlock icon + tooltip "Required for EU 1169/2011 compliance").

#### Labels & Printing

- **Print Label on Receipt** toggle: ON.
- **Default Label Copies**: 1.
- **Default Printer** dropdown: lists printers configured in 02-SETTINGS Printer Config. "Manage printers in 02-Settings → Infrastructure."
- **Label Templates** read-only list (Standard 4×6, Mini 2×2). "Manage templates in 02-Settings → Label Templates."
- Link to printer configuration: "Go to Printer Settings →" (02-SETTINGS §15.4 cross-link).

#### Scanner

- **Scanner Idle Timeout** (seconds): 300.
- **Scanner Lock Timeout** (seconds): 300.
- **Sound Feedback** toggle: ON.
- **Vibration on Scan** toggle: ON.
- Note: "Scanner authentication (PIN setup) is managed in User Management → Scanner PIN."

#### Save Behaviour

Each category section has its own `[Save Changes]` button. On save: success toast "Settings saved." If validation error (e.g., cron format invalid): inline `.alert-red` under the field.

Admin role gate: If non-admin user visits this page: read-only mode with `.alert-blue` "You have read-only access to warehouse settings. Contact your administrator to make changes."

---

## 4. Modals

---

### M-01 — GRN from PO (Multi-LP)

Described in full at WH-004-PO. Key UX principles:
- **No auto-split**: The "[+ Add LP Row]" button is the only way to create new LP rows. System never inserts rows automatically.
- **Running total per PO line** prevents accidental over-receipt before final validation.
- **GS1 scan fills fields** but operator always confirms.
- **LP Preview** before commit lets operator catch errors.
- **Completion is always manual** (no auto-complete trigger) per PRD §7.1 baseline D12.

---

### M-02 — GRN from TO

Described at WH-005. Different from M-01: no new LP creation (LPs already exist); receiving = move from transit to destination.

---

### M-03 — Stock Movement Create

Described at WH-007. Key: partial-move auto-split notice; adjustment > 10% manager approval gate.

---

### M-04 — LP Split

Described at WH-008. Sum validation is real-time; submit blocked until allocated qty = source qty.

---

### M-05 — LP Merge Modal

**Trigger**: LP list "More" dropdown → Merge, or LP detail action.
**Title**: "Merge License Plates".

**Step 1 — Select Primary LP**: Scan or search the LP that will survive after merge. Shows LP summary card. V-WH-LP-005: primary must be `available` status.

**Step 2 — Add Secondary LPs**: Scan or search additional LPs to merge into the primary. Each scanned LP is validated:
- Same product, UoM, warehouse (V-WH-LP-004).
- Same batch and expiry within ±1 day tolerance.
- Same QA status.
- Status = available (not reserved).
- If validation fails: inline red error per LP, LP is not added. Example: "LP00000030 — Rejected: Different batch number (B-2026-03-01 vs B-2026-04-10). Batch must match to merge."

Running list of valid secondary LPs with individual remove buttons. Running total qty shown: "Primary: 80 BOX + Additional: 40 + 60 = 180 BOX total after merge."

**Catch weight**: "After merge: Primary.catch_weight_kg = Σ all catch_weight_kg = 276 KG."

**Genealogy note**: "Secondary LPs will be set to status 'merged'. A genealogy record will be created for each secondary LP linking it to the primary."

Footer: `[Cancel]` and `[Confirm Merge]` (`.btn-primary`). Disabled until ≥1 valid secondary LP added.

---

### M-06 — QA Status Change

Described at WH-009.

---

### M-07 — Label Print

Described at WH-013.

---

### M-08 — Reserve Hard-Lock

Described at WH-016 (Reserve Modal).

---

### M-09 — Release Reservation

**Trigger**: WO Reservations Panel (WH-017) row "[Release]" button.
**Title**: "Release Reservation".

Content: Summary of reservation (LP number, WO, qty, reserved date). "You are about to release the hard-lock reservation. The LP will return to 'available' status and can be picked by other work orders."

**Release Reason** (dropdown, required): consumed / cancelled / wo_cancelled / admin_override.
**Reason Text** (textarea, required if admin_override).

Warning if reason = admin_override: `.alert-amber` "Admin override release is a high-visibility audit event. This action is logged and will appear in compliance reports."

Footer: `[Cancel]` and `[Confirm Release]` (`.btn-danger`).

---

### M-10 — FEFO Deviation Confirm

**Trigger**: Available LPs Picker when operator selects an LP other than rank #1 (FEFO suggestion). Also triggered by scanner consume-to-WO when picked LP ≠ suggested LP (desktop confirmation version — scanner has its own flow in 06-SCANNER).
**Title**: "FEFO Deviation — Confirm Pick".

This modal is a **warning**, never a hard block. The operator is always allowed to proceed after confirming.

Content:
- `.alert-amber` banner at top: "You selected LP {picked_lp_number} but FEFO suggests LP {suggested_lp_number}."
- Two LP comparison cards side by side:
  - Left (Suggested by FEFO): LP number, batch, expiry date, location. "Expiry: **01 May 2026** (earliest)". Green border.
  - Right (Your selection): LP number, batch, expiry date, location. "Expiry: **20 Jun 2026** (+50 days later)". Amber border.
- "Expiry difference: {N} days later than the FEFO-suggested LP."

**Reason Code** (dropdown, required): V-WH-FEFO-002.
- `batch_exhaustion` — FEFO LP does not have sufficient quantity
- `qa_release` — FEFO LP awaiting QA clearance
- `physical_accessibility` — FEFO LP physically inaccessible
- `line_priority` — Operational priority on this line
- `operator_decision` — Operator judgment
- `other` — Requires reason text

**Reason Text** (textarea, required if reason_code = `other`).

**Transparency note** (small muted text): "This deviation will be recorded in the FEFO override audit log. The override rate metric is monitored by your warehouse manager."

Footer: `[Cancel — Use FEFO Suggestion]` (`.btn-secondary`) and `[Confirm Deviation]` (`.btn-primary` amber background).

---

### M-11 — Destroy / Scrap LP

**Trigger**: LP detail action button, Expiry Dashboard action.
**Title**: "Destroy / Scrap License Plate — LP{number}".

Content: LP summary card. "This will permanently remove {qty} {uom} from inventory. This action is irreversible and creates a permanent audit record."

**Reason Code** (dropdown, required): damage / expired / quality_fail / contamination / other.
**Reason Text** (textarea, required).
**Quantity to Scrap** (numeric): default = full LP qty. Partial scrap allowed — triggers split first, then scrap on the partial LP.
**Reference Document** (optional text): e.g., QA inspection report number.

Footer: `[Cancel]` and `[Confirm Scrap]` (`.btn-danger`). On confirm: LP.qty set to 0, status → consumed, lp_genealogy entry with operation_type='adjustment', reason code, stock_move with move_type='adjustment' and negative qty.

---

### M-12 — Use_by Block Override

**Trigger**: When any user attempts to pick/consume/ship a `use_by` expired LP.
**Title**: "Expired LP — Manager Override Required".

`.alert-red` at top: "LP{number} has passed its use-by date ({date}). All operations are blocked to comply with EU 1169/2011 food safety requirements."

Visible to Operator: "This operation requires manager approval. Contact your warehouse manager." — no override fields visible.

Visible to Manager/Admin: "You may override this block for specific operational reasons. This action is fully audited and will be included in compliance reports."

**Override Reason** (dropdown, required): operational_requirement / awaiting_disposal / controlled_use_under_qa / regulatory_exemption / other.
**Reason Text** (textarea, required).
**Acknowledge checkbox**: "I understand this action overrides food safety controls and accept responsibility for the audit record."

Footer: `[Cancel]` and `[Override and Proceed]` (`.btn-danger`, disabled until checkbox ticked).

---

### M-13 — Location Create / Edit

**Trigger**: Locations Hierarchy View add/edit action (Admin only).
**Title**: "Add Location" / "Edit Location".

Fields:
- **Code** (text, required, unique within warehouse): alphanumeric + hyphen, max 20 chars. Example: `Bin-C5`. V: auto-uppercased.
- **Name** (text, required): "Cold Storage Bin C5". Max 80 chars.
- **Parent Location** (searchable dropdown): shows ltree hierarchy up to current depth. Depth validation: if adding would exceed `location_depth_max` setting, field shows inline error.
- **Type** (dropdown): storage / transit / receiving / production_line.
- **Is Active** toggle.
- **Barcode** (text, optional): for location QR code / Code128 printing. Auto-generated if blank.

Footer: `[Cancel]` and `[Save Location]` (`.btn-primary`).

---

### M-14 — Cycle Count (P1 Stub)

**Trigger**: From LP list or Inventory Browser. Basic P1 adjustment only; full cycle counts are P2.
**Title**: "Quick Stock Adjustment (Cycle Count)".

`.alert-blue` note: "Full cycle count workflow is available in Phase 2. This is a basic quantity adjustment with mandatory reason."

Fields: LP (pre-filled if opened from LP context), Current Qty (read-only), Actual Qty (numeric, required), Delta (auto-computed, read-only: "±N {uom}"), Reason Code (counting_error / damage / other), Reason Text.

Threshold gate: if |delta| > 10% of current qty: `.alert-amber` "This adjustment exceeds 10% and requires manager approval." — submit changes to `[Submit for Approval]`.

Footer: `[Cancel]` and `[Record Adjustment]` or `[Submit for Approval]`.

---

### M-15 — State Transition Confirm

**Trigger**: Any LP action button that triggers a state machine transition (Block, Unblock, etc.).
**Title**: "Confirm Status Change".

Content: "Change LP{number} status from **{current}** to **{new}**?" Summary of side effects (e.g., "Blocking this LP will prevent all picking and movement operations.").

**Reason Code** (required for block/unblock): free dropdown per allowed reasons.
**Reason Text** (optional unless reason_code=other).

Footer: `[Cancel]` and `[Confirm]` (`.btn-primary` or `.btn-danger` if destructive).

---

## 5. Flows

---

### Flow 1 — GRN Multi-LP Receipt (Primary Flow)

This is the most important flow in the module. Designer must represent it with full fidelity.

1. **Entry**: Operator clicks `[+ Receive Goods]` on dashboard or `[Receive]` on PO Detail in 04-PLANNING. GRN wizard opens.

2. **Step 1 — PO Selection**: Operator sees list of POs available for receiving (status: confirmed or receiving). Operator types PO number in search, or scans PO barcode, or selects from the list. PO summary loads instantly.

3. **Step 2 — Line Entry**:
   - For each PO line that has goods to receive, operator clicks `[+ Add LP Row]` once per delivery unit.
   - **Example for a 100-BOX PO line arriving as 2 batches on 2 pallets**: Operator adds Row 1 (qty=40, batch=B, expiry=2026-10-15, location=Receiving-Zone-A), then Row 2 (qty=60, batch=B', expiry=2026-10-20, location=Receiving-Zone-A). Running total shows "40 + 60 = 100 / 100 BOX — Fully accounted for." in green.
   - Operator optionally scans GS1-128 barcode per row to auto-fill batch/expiry/catch-weight.
   - PO lines already fully received show a green "Fully Received" header and no "[+ Add LP Row]" button.
   - Operator may leave some lines with no rows (partial GRN — allowed).

4. **Step 3 — Review & Complete**:
   - Operator reviews LP preview table.
   - Optionally force-closes a partially received PO line with a reason.
   - Clicks `[Complete Receipt]`.
   - Progress modal shows 5 steps.
   - On success: 2 LPs created (LP00000043 for 40 BOX, LP00000044 for 60 BOX), labels printed (if auto-print ON), PO status updated.

5. **Post-receipt**: Success state offers links to view GRN, view the 2 new LPs, or start another receipt from the same PO.

---

### Flow 2 — FEFO Pick with Deviation

1. **Entry**: WO is released from 04-PLANNING. System auto-reserves RM LPs via FEFO query. If manual pick needed, operator opens Available LPs Picker from WO detail.

2. **FEFO suggestion**: System ranks LPs by expiry_date ASC. Rank #1 LP is highlighted with a star and a blue left border.

3. **Operator deviation**: Operator selects LP ranked #3 (Bin-A4, physically closer). Immediately:
   - FEFO Deviation Confirm modal opens (M-10).
   - Shows comparison: Suggested LP00000010 (expiry 01 May 2026) vs Selected LP00000018 (expiry 20 Jun 2026), difference: +50 days.
   - Operator selects reason_code = `physical_accessibility`. Clicks `[Confirm Deviation]`.

4. **Audit record**: `pick_overrides` row created. Dashboard override rate metric updated.

5. **Completion**: LP reserved, WO proceeds. The deviation is visible on LP detail (Movements tab, Reservations tab) and in the manager's FEFO override rate KPI.

---

### Flow 3 — Intermediate LP Handling

This flow shows the critical P1 design decision: intermediate LPs are always put-away to stock, never directly continued.

1. **Production WO-A completes** (e.g., Roasting step for PR5101R Stripped Chicken):
   - 08-PRODUCTION records output event.
   - New LP created: item_type_snapshot=intermediate, status=available, location=Production-Line-1-Buffer.
   - LP label printed automatically.
   - lp_genealogy record: operation_type=output, wo_id=WO-A.

2. **LP appears on stock**: Visible in LP list, Inventory Browser, and Intermediate Buffer KPI on dashboard. QA status set per WO QA gate (typically PASSED for intermediate).

3. **Downstream WO-B is released** (e.g., Slicing step needing the roasted chicken):
   - No reservation is created automatically for intermediate LPs. WO-B simply shows material requirements with a "projected availability" indicator.
   - Material availability shows green if projected qty ≥120% of requirement.

4. **Operator consumes LP via scanner** (SCN-080 in 06-SCANNER-P1):
   - Scanner scans WO-B barcode → scans LP barcode.
   - System queries FEFO suggestion for PR5101R in the buffer.
   - If scanned LP ≠ FEFO suggestion: warning displayed on scanner screen + operator confirms with reason code. Same audit pattern as Flow 2.
   - Operator enters qty consumed. LP.quantity updated. If partial: LP split cascade.
   - stock_move: consume_to_wo. lp_genealogy: operation_type=consume, wo_id=WO-B.

5. **No lock cleanup needed**: If WO-B is cancelled at any point, no reservation records to clean up. The LP simply remains available for any other downstream WO to consume.

---

### Flow 4 — Lot Genealogy Query (FSMA 204)

1. **Entry**: Manager navigates to `/warehouse/genealogy`. Enters LP number of a finished product LP, or a batch number from a supplier recall notice.

2. **Query selection**: Chooses "Backward Trace" to find all upstream raw materials.

3. **Loading state**: "Building genealogy trace… querying linked records. May take up to 30 seconds." Progress bar (indeterminate).

4. **Tree rendered**: Shows the finished LP at depth 0, upstream LPs at depth 1–N. Each node shows: product, batch, supplier batch, WO reference, receipt GRN, supplier name. FEFO compliance flags on consume operations.

5. **Export**: Clicks `[Export Trace Report]`. Downloads a PDF with all nodes, timestamps, locations — suitable for regulatory submission.

6. **FSMA 204 note**: Query depth ≤10, query time <30s (system SLO). Designer should show a progress indicator for queries taking > 2s.

---

### Flow 5 — Expiry Gating

Two sub-flows:

**5a — use_by automatic block (daily cron)**:
1. Cron runs at 02:00 UTC.
2. All `available` or `reserved` LPs with `expiry_date < CURRENT_DATE` and `shelf_life_mode_snapshot = use_by` are set to `blocked`.
3. `stock_moves` record created per LP (move_type = auto_block or quarantine).
4. Email notification sent to warehouse managers.
5. Dashboard "Alerts" panel shows "N LPs auto-blocked today." Expiry Dashboard shows these LPs in the Expired tab with "Auto-blocked" indicator.

**5b — best_before warning at pick time**:
1. Operator attempts to pick/reserve an LP with `expiry_date < CURRENT_DATE` and `shelf_life_mode_snapshot = best_before`.
2. Inline `.alert-amber` warning on the pick confirmation step: "This LP has passed its best-before date ({date}). Quality may have declined. Do you want to proceed?"
3. Operator clicks `[Proceed with Warning]` or `[Cancel]`. No reason code required for best_before override.
4. No automatic blocking occurs — LP remains `available`.
5. Dashboard "Alerts" shows "N LPs past best-before date" as an informational alert.

---

### Flow 6 — LP Split

1. Operator opens LP detail for LP00000050 (200 BOX, Zone-Cold-B3).
2. Clicks `[Split]` button (visible because LP status=available — state machine permits).
3. Split modal opens. Source LP shows "200 BOX available to split."
4. Operator adds 2 rows: Row 1 (60 BOX, destination Zone-Cold-B3), Row 2 (140 BOX, destination Line-1-Buffer).
5. Running total shows "60 + 140 = 200 / 200 — Fully allocated." Submit button enables.
6. Operator confirms. Two new child LPs created (LP00000051 = 60 BOX, LP00000052 = 140 BOX). Original LP00000050 is archived (status=merged or its qty zeroed depending on implementation — genealogy links preserve the chain).
7. Labels printed for both new LPs.
8. Toast: "LP split into 2 License Plates." LP list refreshes.

---

### Flow 7 — Reservation Hard-Lock (from 04-PLANNING)

1. Planner releases a Work Order from 04-PLANNING. WO.status: DRAFT → RELEASED.
2. System auto-runs FEFO query for all wo_materials where material_source='stock'.
3. `lp_reservations` records created. `license_plates.reserved_for_wo_id` populated. LP status → `reserved`.
4. LP list in Warehouse shows the LP with `reserved` badge-blue and WO reference in the Reserved column.
5. WO Reservations Panel in WO detail shows the hard-lock with qty and expiry.
6. Manager sees the LP is locked — cannot be moved or picked for other purposes without releasing.
7. On consume (scanner): reservation released with release_reason=consumed. LP status → consumed.
8. On WO cancel: all reservations released with release_reason=wo_cancelled.

---

## 6. Empty / Zero / Onboarding States

Each section of the module has a specific empty state designed to guide new users.

**Warehouse Dashboard — no data yet**: Centred illustration of a warehouse, heading "Your warehouse is empty", body "Start by receiving your first goods delivery from a Purchase Order or Transfer Order.", button `[Receive First Delivery]`. All KPI cards show `0` or `—`.

**LP List — first run**: Illustration of a license plate with a plus icon, heading "No License Plates yet", body "License plates are created automatically when you receive goods or record production output.", button `[Receive Goods]`.

**GRN List — no GRNs**: Illustration of a delivery truck, heading "No Goods Receipts yet", body "GRNs are created when you receive goods from a purchase order or transfer order.", buttons `[Receive from PO]` and `[Receive from TO]`.

**Locations — no locations configured**: `.alert-amber` "No locations are configured for this warehouse. Location hierarchy is managed in Settings → Locations (02-SETTINGS). Contact your administrator.", button `[Go to Location Settings]`.

**Genealogy — no LP entered**: Illustrative prompt with examples as described in WH-014.

**Inventory Browser — no inventory**: "No inventory on hand. Receive goods to see inventory here." Button `[Receive Goods]`.

**Reservations — no reservations**: "No active LP reservations. Reservations are created automatically when work orders are released for raw material requirements.", informational note about intermediate LPs not having reservations.

**Expiry Dashboard — no expired LPs**: Green card "No expired LPs. All inventory is within shelf life." with a green check icon. The expiring soon tab still shows upcoming expirations if any.

---

## 7. Notifications, Toasts, and Alerts

### Toast Notifications

Toasts appear at top-right of screen, 300px wide, 4-second auto-dismiss unless `persistent=true`.

| Event | Toast Type | Message |
|-------|-----------|---------|
| GRN completed | Success (green) | "GRN {number} created. {N} LP(s) generated." with `[View GRN]` link |
| LP split | Success | "LP split into {N} LPs." |
| LP merged | Success | "LP{primary} updated. {N} secondary LPs merged." |
| Label sent to printer | Info (blue) | "Label queued for {printer}." |
| Stock movement recorded | Success | "Movement {SM-number} recorded." |
| Reservation created | Success | "LP{number} reserved for WO-{number}." |
| Reservation released | Info | "Reservation released. LP{number} is now available." |
| LP blocked | Amber warning | "LP{number} blocked. Reason: {reason_code}." |
| LP unblocked | Info | "LP{number} unblocked and available." |
| FEFO override recorded | Amber | "FEFO deviation recorded for LP{number}. Override rate: {pct}%." |
| Expiry cron ran | Info (background) | "Expiry cron completed. {N} LPs auto-blocked." `[View →]` |
| API error | Error (red) | "Action failed: {error message}. [Retry]" |
| Scanner lock conflict | Amber | "LP{number} is locked by {user}. Retry in {seconds}s." |

### In-Page Alerts

`.alert-red` — blocking errors, expired use_by, API failures, over-receipt blocked.
`.alert-amber` — warnings: FEFO deviation, expiring soon, best_before expired, adjustment > 10%, partial receipt, capacity 90%.
`.alert-blue` — informational: partial receipt note, intermediate LP restriction info, COND_APPROVED constraint.
`.alert-green` — success banners where toast is insufficient (e.g., GRN complete success in a full-page success state).

### System-Level Notifications

- **Email to warehouse managers**: When expiry cron auto-blocks LPs (configurable via `warehouse_settings.notification_email_on_expiry`).
- **Dashboard badge**: The FEFO override rate alert badge on WH-001 is persistent until rate drops below threshold.
- **Scanner audio feedback**: Described in 06-SCANNER-P1 (not in this document). Referenced only.

---

## 8. Responsive Notes

The Warehouse module is **desktop-primary**. Screens are designed for a 1280px minimum viewport width within the 220px fixed sidebar offset (1060px content area).

**Tablet (768px–1024px)**:
- KPI card strip: 2×4 grid rather than 1×8.
- LP list: hide "Last Move" and "Strategy" columns; show via row expand.
- GRN wizard: Step 2 line table collapses to single-column stacked form per row.
- Location tree: hides on tablet, accessed via a "Locations" button that slides in the tree panel.

**Mobile (<768px)**:
- Not the primary use case for this module.
- Dashboard accessible: KPI cards stack 2×N.
- LP list: reduced to 4 columns (LP#, Product, Qty, Status badge). Tap row to expand all details.
- GRN wizard: accordion-style lines, one field per row.
- All modals: full-screen on mobile.
- Minimum touch targets: 48×48px for all interactive elements.

**Scanner breakpoint (06-SCANNER-P1)**:
Scanner-specific screens (SCN-010 through SCN-080) are defined in the 06-SCANNER-P1 UX specification. This document only references them. The scan-to-consume flow described in Flow 3 above is the desktop management view of what happens — the scanner operator's interface is entirely in 06-SCANNER-P1.

---

## 9. Open Questions for Designer

The following questions do not have definitive answers in PRD v3.0 and may require a design decision during prototyping:

1. **LP Genealogy Tree visual library**: The PRD suggests `d3-hierarchy` or `ReactFlow` for the interactive genealogy tree. For the HTML prototype, the `.tree-item` CSS class pattern (from the design system) is prescribed. Should the full-depth tree (depth 10, potentially 100+ nodes) use the static `.tree-item` pattern with pagination, or should the prototype attempt an interactive collapsible graph? **Recommendation**: Use `.tree-item` with collapse/expand per level for the prototype.

2. **GRN Multi-LP Row table width**: The multi-LP row entry table in Step 2 of the GRN wizard has 10 columns and may overflow at 560px modal width. The spec suggests 700px modal width. If screen width forces a narrower modal, some columns (Supplier Batch, Notes) should become available in a row-level "More" expandable section rather than the main table.

3. **FEFO strategy override per product (WH-SET-001 Picking & Strategy)**: The PRD specifies `items.picking_strategy` as a per-product column managed in 03-TECHNICAL. Should the Warehouse Settings page include a per-product strategy override grid (table: Product | Default Strategy | Override), or is this solely managed in the Technical module? **Per PRD boundary**: manage in 03-TECHNICAL, read-only indicator in Warehouse.

4. **Partial reservation badge on LP list**: When an LP has both reserved_qty and unreserved qty (partial reservation), the "Reserved" column shows "70/100 BOX". Should this also show a split progress bar inline? Recommended for clarity but adds visual complexity.

5. **Adjustment approval workflow UX**: The PRD specifies adjustments > 10% require manager approval. A "Manager Approvals" tab is described (WH-007 / §8.7). Should this be a dedicated sub-page at `/warehouse/movements/approvals`, or an inbox-style tab on the Stock Movements list page? **Recommendation**: A tab within `/warehouse/movements` page.

6. **Date code format rendering (date_code_rendered)**: The `date_code_rendered` field is computed from `product.date_code_format` (YYWW, YYYY-MM-DD, JJWW, YYJJJ formats per 03-TECHNICAL §9.2). The LP detail should show this alongside the human-readable expiry date. Should it be labelled "Date Code" or "Production Code"? Match the label used in 03-TECHNICAL module for consistency.

7. **Ext_jsonb fields (L3 schema-driven) in GRN row form**: When `ext_jsonb` custom fields are configured for LPs (via 02-SETTINGS schema wizard), should these fields appear inline in the GRN LP row form, or only on the LP detail after creation? **PRD §6.8 suggests** they are available at runtime. For the GRN wizard, add them as a collapsible "Custom Fields" section per row to keep the main row compact.

8. **Intermediate Buffer widget drill-down**: The Intermediate Buffer KPI card on the dashboard should navigate to a filtered LP list (`item_type_snapshot=intermediate, status=available`). Consider adding a dedicated "Intermediate Buffer" section on the dashboard below KPIs that shows a mini-table of intermediate LPs grouped by production line/zone — useful for production scheduling visibility.

---

*End of 05-WAREHOUSE UX Specification*

*This document is authoritative for prototype generation. PRD v3.0 (05-WAREHOUSE-PRD.md) is the authoritative source for all business rules, validation codes (V-WH-*), and data model definitions referenced herein.*
