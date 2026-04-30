# 08-PRODUCTION — UX Specification (for prototype generation)

**Version:** 1.0 — Generated 2026-04-20 from PRD v3.0  
**Consumer:** Claude Design → interactive HTML prototypes  
**Scope:** Supervisor desktop + shop-floor kiosk (10" landscape). Scanner operator flows live in 06-SCANNER-P1.

---

## 0. Module overview

**08-PRODUCTION** is the WO execution engine that turns scheduled work orders (from 04-PLANNING) into physical product via operator actions on the shop floor. The desktop UI serves two primary personas:

- **Production Supervisor / Shift Lead** — monitors all lines simultaneously, approves exceptions, manages allergen changeover gates, reviews OEE, signs off shifts, investigates downtime, manages the D365 DLQ.
- **Production Manager** — strategic read-mostly access, approves extraordinary overrides (closed_production_strict, yield gate), manages settings and taxonomy.

The **Operator** interacts with WOs almost exclusively through the 06-SCANNER-P1 PWA on handheld/tablet. The desktop exposes scanner-linked screens as reference cards with "Open on scanner" deep-link buttons. Operator-facing kiosk mode (10" landscape, fixed on the line) is noted where it differs.

**Key domain concepts for the designer:**

- **WO states**: DRAFT → READY → IN_PROGRESS → PAUSED → COMPLETED | CANCELLED (driven by `wo_state_machine_v1` DSL rule in 02-SETTINGS §7; never hardcode transitions — always read from the state machine registry).
- **wo_outputs rows**: Each WO can produce a primary output, one or more co-products, and one or more by-products; all defined in the BOM `co_products` allocation (03-TECHNICAL §7.2). Intermediate outputs are always put to stock P1 automatically.
- **Catch-weight**: Items with `weight_mode='catch'` use FA code 3103 (fixed net weight per unit) or 3922 (variable weight per unit). The UI must display a toggle between modes and capture actual kg per LP at output registration.
- **Meat_Pct aggregation**: WOs with multiple meat-ingredient inputs auto-aggregate the Meat_Pct from each consumed LP into a single displayed value on the output detail (tied to 03-TECHNICAL §8.9).
- **Allergen changeover gate**: Blocks WO START when an allergen delta is detected vs the previous WO on the same line. Risk levels: low (no block), medium (cleaning + dual sign-off), high (cleaning + ATP swab + dual sign-off), segregated (hard block — scheduler error).
- **Closed_Production strict** (Phase D #17): WO cannot reach COMPLETED until all BOM components are consumed within tolerance AND all primary/co-products are registered. Override requires Production Manager.
- **OEE = A × P × Q**: Availability = (planned_min − downtime_min) / planned_min; Performance = (output_qty × ideal_cycle_time) / run_time_min; Quality = good_qty / total_output_qty. Shown as three separate gauges and a product.
- **D365 outbox**: WO completion events flow via async outbox → dispatcher → D365 F&O JournalLines. The DLQ admin screen lives at `/admin/integrations/d365/dlq`.
- **Genealogy**: Every consumed LP is linked to every produced LP in `lp_genealogy`. FSMA 204 forward/backward queries <2s.

---

## 1. Design system (inherited)

All tokens are sourced from MONOPILOT-SITEMAP.html. The designer must apply them as-is without deviation.

**Typography**: Inter font family. Body text 14px / line-height 1.4. Page titles 20px bold. Card titles 14px semibold. Labels 12px medium (#374151). Muted/secondary text 11–12px (#64748b). Monospace for codes and routes: `font-family: monospace`.

**Colour palette**:
- Primary blue: `#1976D2` (active sidebar item border, primary buttons, links, tab underline).
- Sidebar background: `#1e293b`. Sidebar active item background: `#1e3a5f`. Sidebar text resting: `#cbd5e1`.
- Page background: `#f8fafc` (var `--bg`). Card background: `#ffffff`. Border: `#e2e8f0`.
- Text primary: `#1e293b`. Text muted: `#64748b`.
- Success green: `#22c55e`. Warning amber: `#f59e0b`. Danger red: `#ef4444`. Info blue: `#3b82f6`.

**Spacing / Radius**: Sidebar 220px wide. Card radius 6px (var `--radius`). Modal width 560px, max-height 80vh, scroll inside. Button radius 4px. Main content area left margin 220px, padding 40px 20px.

**Component classes** (from sitemap CSS — use these class names in HTML output):
- `.kpi` — KPI card with coloured bottom border (3px). Modifier classes: `.green`, `.amber`, `.red` change `border-bottom-color`.
- `.kpi-label` — 11px muted label. `.kpi-value` — 26px bold. `.kpi-change` — 11px.
- `.badge` — inline pill. `.badge-green`, `.badge-amber`, `.badge-red`, `.badge-blue`, `.badge-gray`.
- `.tabs` / `.tab` / `.tab.active` — horizontal tab bar. Active tab has blue bottom border, blue text, 600 weight.
- `.tl-item` — timeline row with `.tl-dot` coloured circle, text, `.tl-time` on right.
- `.alert-red`, `.alert-amber`, `.alert-blue`, `.alert-green` — alert boxes with left border + background tint.
- `.btn-primary` (blue fill), `.btn-secondary` (white/border), `.btn-danger` (red fill), `.btn-success` (green fill).
- `.form-field` / `.form-label` / `.form-input` — standard form layout. `.req` class marks required fields in red.
- `.grid-2`, `.grid-3`, `.grid-4` — equal-column CSS grids.
- `.card` with `.card-title` — standard content card.
- `#modal-overlay` / `#modal-box` / `.modal-title` — shared modal shell at page level.

**Status badge mapping** (use consistently across all screens):
- DRAFT → `.badge-gray` "Draft"
- READY → `.badge-blue` "Ready"
- IN_PROGRESS → `.badge-blue` "In Progress"
- PAUSED → `.badge-amber` "Paused"
- COMPLETED → `.badge-green` "Completed"
- CANCELLED → `.badge-gray` "Cancelled"
- QA PENDING → `.badge-amber` "QA Pending"
- QA PASSED → `.badge-green` "QA Passed"
- QA FAILED → `.badge-red` "QA Failed"
- CHANGEOVER → `.badge-amber` "Changeover"
- DOWN → `.badge-red` "Down"
- IDLE → `.badge-gray` "Idle"
- RUNNING → `.badge-green` "Running"

**Auto-refresh indicator**: All live screens show a small top-right control: a toggle labelled "Auto-refresh 30s" and a manual "Refresh" button. When refreshing, a 2px progress bar slides across the top of the main content area.

**Kiosk mode**: On screens annotated `[KIOSK]`, apply the following overrides: font-size base 16px, button min-height 64px, form inputs min-height 52px, no sidebar (full-width layout), bottom navigation bar replacing sidebar, touch targets 64px minimum.

---

## 2. Information architecture

### 2.1 Sidebar entry

The sidebar group is **OPERATIONS**. The item is:
- Icon: 🏭 (factory emoji, or SVG equivalent)
- Label: Production
- When active: `border-left-color: #1976D2`, background `#1e3a5f`
- Collapsed sub-items expand on click (class `.sidebar-sub.open`)

Sub-items (sidebar-subitem):
1. Dashboard
2. Work Orders
3. Consumption
4. Output
5. OEE
6. Downtime
7. Shifts
8. Analytics
9. Settings

### 2.2 Route map

| Screen | Route |
|--------|-------|
| Production Dashboard | `/production` |
| WO List | `/production/wos` |
| WO Execution Detail | `/production/wos/:id` |
| WO Consumption Panel | `/production/wos/:id/consume` |
| WO Output Panel | `/production/wos/:id/output` |
| WO Waste Panel | `/production/wos/:id/waste` |
| Allergen Changeover Gate | `/production/changeover/:event_id` |
| Line Detail | `/production/lines/:id` |
| OEE Dashboard | `/production/oee` |
| Downtime Tracking | `/production/downtime` |
| Shift Management | `/production/shifts` |
| Analytics Hub | `/production/analytics` |
| Waste Analytics | `/production/waste` |
| Production Settings | `/production/settings` |
| D365 DLQ Admin | `/admin/integrations/d365/dlq` |

### 2.3 Permissions matrix

| Capability | Operator | Shift Lead | Prod Manager | QA Inspector | Admin |
|---|---|---|---|---|---|
| View production dashboard | Read own line | Read all | Read all | Read all | Full |
| WO start / pause / resume / complete | Via scanner only | Via desktop + scanner | Read only | Read only | Full |
| Approve over-consumption | — | ✓ | ✓ | — | Full |
| Approve waste override (>threshold) | — | — | ✓ | — | Full |
| Register output (catch weight) | Via scanner | Override via desktop | Read only | qa_status write | Full |
| Allergen changeover: checklist | ✓ (own steps) | First sign-off | — | Second sign-off | Full |
| Force-complete WO (closed_production override) | — | — | ✓ + reason | — | Full |
| OEE view | — | Read | Read | Read | Full |
| Downtime: log event | Via scanner/desktop | Full | Full | — | Full |
| Downtime taxonomy admin | — | — | Via Settings | — | Full |
| Shift management | — | Create/edit own shift | Read | — | Full |
| Analytics | — | Read | Read | Read | Full |
| Production settings | — | — | Some fields | — | Full |
| D365 DLQ replay / mark-resolved | — | — | ✓ | — | Full |
| Waste / downtime category taxonomy (Settings) | — | — | ✓ | — | Full |

---

## 3. Screens

---

### SCREEN PROD-001 — Production Dashboard

**Screen ID:** PROD-001  
**Route:** `/production`  
**Purpose:** Real-time supervisor overview of all active production lines, live KPIs, active WOs, alert feed, and per-line status cards. Primary entry point for Shift Lead and Production Manager. Auto-refreshes every 30 seconds via polling (WebSocket P2).

**Layout description:**

The page has three horizontal zones stacked vertically within the main content area.

**Zone 1 — KPI row** (top, full width): A single `.kpi-row` grid containing six KPI cards arranged in one row on desktop (or two rows of three on narrower viewports):

1. **WOs In Progress** (blue border): Count of WOs with status IN_PROGRESS or PAUSED across all lines. Sub-label: "X lines active". Click navigates to `/production/wos?status=in_progress`.
2. **Output vs Target today** (green/amber/red depending on value vs target): `total_output_kg_today / target_output_kg_today` shown as `1,003 / 1,100 kg`. Sub-label: "91% of daily target". Click navigates to `/production/analytics`.
3. **OEE current shift** (green/amber/red): Composite `A × P × Q` as a percentage, e.g., "84.2%". Three micro-labels below: A: 95% · P: 90% · Q: 98%. Click navigates to `/production/oee`.
4. **Downtime last 24h** (amber/red if above threshold): Total downtime minutes across all lines in last 24h. Sub-label: "N events". Click navigates to `/production/downtime`.
5. **QA Holds active** (red if >0, green if 0): Count of output LPs with `qa_status = PENDING` or flagged. Sub-label: "Review required". Click navigates to `/production/wos` filtered by qa_status.
6. **Next setup / changeover** (blue): Product code and start time of next scheduled allergen changeover. Sub-label: line name + "in Xm". Click navigates to the changeover detail.

**Zone 2 — Per-line status cards** (middle section, full width): Heading "Production Lines" with a line selector dropdown (All / individual line names). Below the selector, a `grid-3` (desktop) or `grid-2` (tablet) of per-line cards. Each card is a `.card` component with:
- Top row: Line name (bold) + status badge (RUNNING / PAUSED / DOWN / CHANGEOVER / IDLE).
- If RUNNING: Current WO code (monospace badge) + product name + progress bar showing `qty_consumed / planned_input_qty` as a fill percentage with numeric label "64% · 2h 15m / 3h".
- Yield mini-stat: "Yield: 96.2%" in green, amber, or red.
- Waste mini-stat: "Waste: 0.8%" in green or amber.
- Downtime today: "Downtime: 12 min" in muted text.
- Operator on duty: avatar initial + name.
- Next WO: "Next: WO-2026-0043 · FA5102 · in 45m" in muted text.
- If DOWN: Full-width `.alert-red` row inside card: "Down since 10:22 · 23 min · Machine fault" with [Log Downtime] and [Resume] buttons.
- If CHANGEOVER: Full-width `.alert-amber` row: "Allergen changeover in progress · Awaiting dual sign-off" with [View Changeover] button.
- Card footer: Two buttons — [View Line Detail] (secondary) and, for Shift Lead only, [Pause WO] or [Resume WO] quick-action (primary).

**Zone 3 — Recent events feed** (bottom, full width): A `.card` with title "Recent Events" and a list of `.tl-item` rows (last 20 events). Each row has a coloured `.tl-dot` (green=output, blue=start/resume, amber=pause, red=downtime, purple=changeover), a short description (e.g., "WO-2026-0042 COMPLETED on LINE-01 — 1,003 kg output"), and `.tl-time` timestamp. The list auto-prepends new events at the top. A "View full history" link at the bottom navigates to `/production/analytics`.

**Primary actions:**
- KPI card click → navigate to detail screen.
- Line card [View Line Detail] → `/production/lines/:id`.
- [Pause WO] / [Resume WO] on line card → opens Pause WO or Resume WO modal (see §4).
- [Log Downtime] on DOWN line card → opens Register Downtime modal.
- [View Changeover] → `/production/changeover/:event_id`.

**Secondary actions:**
- Line selector dropdown — filters the per-line cards.
- Auto-refresh toggle (top-right).
- Manual [Refresh] button.
- Export icon on the events feed → exports last 100 events as CSV.

**States:**

*Loading:* Each KPI card shows a shimmer skeleton rectangle. Line cards show shimmer skeletons. Events feed shows three shimmer rows. No actions available. Microcopy: "Loading production data…" centred below skeleton.

*Empty (no active WOs):* KPI cards render with zero values. Line cards show IDLE status. Events feed shows: factory icon + "No production activity today" + "Release a work order from Planning to begin" + [Go to Planning] button.

*Populated (normal):* As described above.

*Error:* Each zone has an independent error boundary. Failed zones show `.alert-red` with the error code (e.g., `PRODUCTION_DASHBOARD_FETCH_FAILED`), a [Retry] button, and a "Last successful refresh: 2m ago" timestamp. Other zones remain functional.

*Permission-denied:* If operator role, show only their assigned line card; all other line cards are hidden and a notice reads "Showing your assigned line only."

**Microcopy:**
- Empty state: "No production activity today. Release a work order from Planning to begin production."
- Downtime badge (>0): "X min downtime today — click to view causes."
- OEE below target: Amber badge + "Below 85% target."
- QA holds (>0): "X output(s) pending QA review."

---

### SCREEN PROD-002 — WO Execution Detail

**Screen ID:** PROD-002  
**Route:** `/production/wos/:id`  
**Purpose:** Full runtime state of a single work order. Central supervisor screen for monitoring progress, reviewing material consumption, outputs, downtime, genealogy, and managing WO lifecycle transitions. Also the desktop override location for scan-triggered exception flows (over-consumption approval, catch-weight adjustment, force-complete).

**Layout description:**

**Header bar** (sticky, white background, 1px border-bottom): Contains six elements in a single horizontal row:
1. Back arrow + breadcrumb "Production / Work Orders / WO-2026-0042".
2. WO code badge (monospace, `.badge-blue` or status-appropriate colour).
3. Product name (bold, 16px) + item code (muted, 12px).
4. Status badge driven by `wo_state_machine_v1` registry (never hardcoded).
5. Progress bar: a full-width narrow bar (8px height, rounded) below the product name, showing `consumed_qty / planned_input_qty` with label "64% · 650 / 1,011 kg consumed" and a separate label "Output: 1,003 / 1,000 kg (100.3%)".
6. Action buttons (right-aligned): conditionally rendered based on current WO status from state machine:
   - If READY: [Start WO] primary blue.
   - If IN_PROGRESS: [Pause WO] amber + [Complete WO] primary.
   - If PAUSED: [Resume WO] green + [Cancel WO] secondary.
   - If COMPLETED or CANCELLED: no action buttons; read-only banner.
   - Production Manager only: [Force Complete] secondary red (if closed_production_strict gate has pending shortfalls).

**Tab bar** (directly below header): Eight tabs. The active tab has a 2px blue bottom border. Tab labels:
1. Overview
2. Consumption
3. Output
4. Waste
5. Downtime
6. QA Results
7. Genealogy
8. History

**Tab 1 — Overview:** Two-column grid (60% / 40%).

Left column — WO summary card:
- Table of key fields: WO Code, Product, Item Code, BOM Version (locked snapshot label "BOM v3 · snapshot immutable"), Planned Qty, Unit, Line, Shift, Operator on duty, Planned Start, Planned End, Actual Start, Elapsed, Total Pause Duration (sum).
- Allergen profile row: lists allergens from item record (e.g., "Contains: Mustard, Sulphites") with a link to allergen changeover validation if one exists for this WO.
- Catch-weight indicator row (visible only if `item.weight_mode = 'catch'`): "Catch-weight item · Mode: 3103 net / 3922 variable" badge.

Right column — progress and KPI mini-cards stacked vertically:
- Consumption progress: For each BOM component a mini-row showing `component_name · consumed/planned · variance`. Green if within tolerance; amber if FEFO deviated; red if over-consumed.
- Output progress: "Primary: 1,003 kg registered · Co-products: 2 / 2 registered · By-products: 1 / 1 registered". Green checkmarks or amber warning if missing.
- Waste summary: "8 kg trim logged".
- D365 push status (Shift Lead / Prod Manager only): "Outbox: Pending push to D365" or "Delivered 09:26:15" with a small status dot.

**Tab 2 — Consumption:**

Full-width table with columns: Component | Planned Qty | Consumed Qty | Remaining | LPs Consumed | FEFO Status | Over-consumption | Actions.

Rows are grouped by BOM component. Each row expands to show a sub-table of individual LP consumption events (LP code, qty, timestamp, operator, FEFO adherence flag, over-consumption flag + approver if applicable).

FEFO deviation rows show an `.alert-amber` inline: "FEFO deviation — consumed LP-XXXX (exp. 2026-03-10) instead of FEFO-suggested LP-YYYY (exp. 2026-02-28) · Reason: [recorded reason code]."

Over-consumption rows show an `.alert-amber`: "Over-consumption: 52 kg above BOM planned (tolerance 5%) · Approved by: Marcin S. · Reason: rework."

Meat_Pct aggregation (visible only if WO has meat-type components): A summary card below the table reading "Meat_Pct aggregate: 72.4% (weighted avg of consumed RMs with meat_pct values)".

Footer row: [+ Manual Consume LP] button for Shift Lead desktop override (triggers Consume Adjustment modal).

**Tab 3 — Output:**

Table of registered output rows: Output Type (badge: Primary / Co-product / By-product) | Item | LP Code | Qty (kg) | Catch Weight Details | Batch Number | Expiry Date | QA Status | Label Status | Actions.

For catch-weight items (`weight_mode = 'catch'`), the "Catch Weight Details" column expands to show:
- 3103 mode: a list of net-weight-per-unit entries (e.g., "LP-3001: 20 units × 2.45 kg net = 49.0 kg").
- 3922 mode: a list of variable-weight entries per unit.
- Toggle button: [Switch to 3103] or [Switch to 3922] (Shift Lead only, pre-completion).

QA Status badge (PENDING / PASSED / FAILED / HOLD). "HOLD" triggers a banner: "Output LP-XXXX on QA Hold — contact QA Inspector."

Actions column: [Print Label] (opens browser print dialog for PDF label containing GTIN-128, batch, expiry, qty/weight, QR code linking to LP detail). [Call QA] button (triggers Call QA Inspection modal). [Adjust Qty] (Shift Lead, triggers Output Qty Adjustment modal).

Footer: [+ Register Primary Output] / [+ Register Co-product] / [+ Register By-product] buttons visible to Shift Lead. Yield gate summary card: "Output yield: 99.2% vs BOM yield target 95% ✓ Within 10% threshold." If yield gate flags: `.alert-amber` "Yield variance 15% — Production Manager review required."

**Tab 4 — Waste:**

Table: Timestamp | Category | Qty (kg) | Operator | Shift | Reason | Approved By | Actions.

Category column uses the admin-configurable taxonomy from 02-SETTINGS (e.g., "Trim", "Spillage", "Rework-fail", "Packaging Damage"). Over-threshold rows (>5% of input by default) show `.badge-amber` "Awaiting approval" with [Approve] button for Prod Manager.

Footer: [+ Log Waste] button (Shift Lead) opens Register Waste modal.

**Tab 5 — Downtime:**

Timeline of downtime events linked to this WO. Each event shows: Start time, End time, Duration (auto-calculated), Category (from taxonomy), Source badge (wo_pause / manual), Reason notes. Open events (no ended_at) show a pulsing red dot and "[End Downtime]" action button.

Summary bar at top: "Total downtime on this WO: X min (Y events)."

**Tab 6 — QA Results:**

Read-only view of QA inspection results linked to this WO's outputs (data from 09-QUALITY module). Shows: LP Code, Inspection Type, Result (PASS/FAIL), Inspector, Timestamp, Notes. If no results: "No QA inspections recorded yet." Link: [Request QA Inspection] button (opens Call QA Inspection modal).

**Tab 7 — Genealogy:**

Visual tree rendered using nested `.tree-item` elements:
- Level 0 (`.l0`): This WO code + product.
- Level 1 (`.l1`, left branch): "Consumed inputs" — list of consumed LPs with LP code, product, batch, expiry, qty.
- Level 1 (`.l1`, right branch): "Produced outputs" — list of output LPs with LP code, product, batch, expiry, qty.
- Each LP node is clickable → navigates to `/warehouse/license-plates/:id`.
- Link at bottom: [View Full Genealogy Tree] navigates to 05-WAREHOUSE genealogy explorer with this WO pre-filtered.

**Tab 8 — History:**

Chronological `.tl-item` list of all state-changing events on this WO: creation, material reservations, START, individual consumption events, output registrations, waste events, downtime events, PAUSE/RESUME, allergen gate steps, COMPLETE. Each entry shows timestamp, actor (user name), event description, and a monospace transaction_id for audit. Filter by event type (dropdown). Pagination: 50 per page.

**States:**

*Loading:* Header skeleton. Tab bar skeleton. Tab content area shows three shimmer rows.

*Error (WO not found):* Full-page error card: "Work Order not found" + "WO ID not found or you do not have access." + [Back to WO List] + [Contact Support] buttons.

*Error (network):* `.alert-red` banner at top with [Retry] button. Stale data greyed out.

*COMPLETED state:* Header shows green "Completed" badge. Progress bars at 100%. All action buttons removed. Read-only banner: "This work order was completed on [date/time] by [user]." Allergen changeover validation (if applicable) shows as a card with green "BRCGS Validated" badge.

*Permission-denied (operator, own line):* Action buttons hidden except scanner deep-link cards.

**Microcopy:**
- Over-consumption warning: "Material over-consumed by X%. Shift Lead approval required before continuing."
- Yield gate alert: "Output yield is X% — X% above/below BOM target. Production Manager review required."
- Catch-weight capture prompt: "This is a catch-weight item. Enter actual kg per unit below."
- FEFO deviation: "FEFO deviation detected. Please select a reason code."
- Allergen gate blocking: "Allergen changeover validation required before this WO can start."

---

### SCREEN PROD-003 — Material Consumption Panel

**Screen ID:** PROD-003  
**Route:** `/production/wos/:id/consume`  
**Purpose:** Supervisor desktop view of all material consumption for a WO. Used for audit, over-consumption approval, and catch-weight variance review. Operators consume via 06-SCANNER SCN-080; this screen shows the resulting data and handles desktop-only exception flows.

**Layout description:**

The page is divided into two panels side by side (60% / 40%) on desktop, stacked on kiosk.

**Left panel — BOM vs consumed table:**

Table heading: "BOM Components — Consumed vs Planned". Filter row: [Component search input] [FEFO Deviations only checkbox] [Over-consumption only checkbox].

Table columns:
- Component: item name + code.
- UoM: kg / L / pcs.
- BOM Planned Qty: from BOM snapshot (read-only, labelled "BOM snapshot · immutable").
- Consumed Qty: sum of all consumption events for this component.
- Remaining: planned − consumed. Green if ≥ 0; red if < 0 (over-consumed).
- FEFO Status badge: "✓ FEFO" (green) / "⚠ Deviation (N)" (amber) / "—" if no consumption yet.
- Over-consumption: blank, or "Over: Xkg · Pending approval" (amber badge) or "Over: Xkg · Approved" (green badge).
- Actions: [Expand LPs] to show sub-rows.

Sub-rows (expanded): Each individual LP consumption event showing LP code (link), qty consumed, timestamp, operator, FEFO adherence flag (icon), over-consumption flag, approver (if applicable).

FEFO Deviation Warning block (shown if any deviations): `.alert-amber` at top of table: "X FEFO deviations on this WO. Each deviation requires a recorded reason code. FEFO compliance affects operator KPI." Link: [View FEFO Report].

**Right panel — FEFO suggestions (live):**

Title: "FEFO-Suggested Next LPs". For each BOM component that has remaining quantity to consume, shows the top-1 FEFO-suggested LP from 05-WAREHOUSE:
- LP code, batch, expiry date (highlighted red if expired, amber if expiring <7 days).
- Available qty.
- Location.
- [Consume via Scanner] button — opens a card with QR code/deep link that the operator can scan on their handheld device (links to 06-SCANNER SCN-080 with pre-filled context). NOT a desktop consumption action.

Meat_Pct aggregation box (visible if WO has meat-type inputs with `meat_pct` field): A summary box reads "Meat_Pct aggregate (as consumed so far): 72.4%" with a breakdown table listing each meat-component LP, its meat_pct value, consumed qty, and weighted contribution. Formula shown: "Σ(qty_i × meat_pct_i) / Σ(qty_i)". This value is used on the Output tab.

**Catch-weight capture panel** (visible only if `item.weight_mode = 'catch'`): Card at the bottom of the right panel. Title: "Catch-Weight Capture Mode". Toggle: [3103 — Fixed net per unit] / [3922 — Variable weight per unit]. Brief explanation:
- 3103: "Each unit has the same nominal net weight. Enter actual net weight if it deviates from the planned value."
- 3922: "Each unit has a different actual weight. You must enter the actual weight for each unit when registering output."
Captured weights are displayed in a mini-table here for review.

**States:**

*Loading:* Table skeleton with 5 skeleton rows.

*Empty (no consumption yet):* Left panel shows BOM rows with zeros. Right panel shows FEFO suggestions. Message: "No materials consumed yet. Use the scanner to consume materials for this WO."

*Fully consumed:* FEFO suggestions panel hidden. A green banner: "All BOM components consumed within tolerance. Ready to register output."

*Over-consumption pending approval:* `.alert-amber` banner: "Over-consumption detected on [Component Name]. Approval required from Shift Lead." [Approve Over-Consumption] button (Shift Lead only, opens Consume Adjustment modal).

*Error:* `.alert-red` with [Retry].

**Modals triggered from this screen:**
- Consume Adjustment modal (over-consumption approval — see §4).
- FEFO Deviation Reason modal (see §4).

---

### SCREEN PROD-004 — Output Registration Panel

**Screen ID:** PROD-004  
**Route:** `/production/wos/:id/output`  
**Purpose:** Supervisor desktop view to register and manage all WO outputs (primary, co-products, by-products) including catch-weight capture, label printing, and yield gate review. Operators register via 06-SCANNER SCN-082/083; this screen handles exceptions and desktop overrides.

**Layout description:**

**Top summary bar** (full width, `.card`): Shows the output progress across all output types:
- Primary: X kg registered (target Y kg). Progress bar.
- Co-products: N registered / M expected.
- By-products: N registered / M expected.
- Yield gate status: Green "Gate: PASS · 99.2% yield" or Amber "Gate: REVIEW REQUIRED · 85% yield (>10% variance from BOM 95%)".

**Output type tabs** (horizontal tabs below summary): Primary | Co-products | By-products.

**Primary tab:**

Table of registered primary output LPs: LP Code | Qty (kg) | Catch-Weight Details | Batch Number | Expiry Date | Put-Away Location | QA Status | Label | Actions.

For catch-weight items, the "Catch-Weight Details" column shows a [View] link. Clicking opens an inline expansion or small modal showing:
- Mode: 3103 (Fixed net) or 3922 (Variable).
- For 3103: Planned avg_unit_kg (from item record), actual avg captured, variance %.
- For 3922: Table of unit-by-unit entries (Unit #, actual kg), total, variance vs planned total.
- Soft warning if variance > `production.catch_weight.tolerance_pct` (default 10%): "Variance X% — check and confirm."

QA Status badge. If PENDING: [Request QA Inspection] button. If HOLD: `.alert-amber` inline row.

Label column: "Printed" (green checkmark + datetime) or "Not printed" with [Print Label] button. Print action generates a PDF label with: GTIN-128 barcode, product name, batch number (format: WO_CODE-OUT-NNN), expiry date, qty/weight, QR code URL to LP detail page. Opens browser print dialog.

Actions: [Adjust Qty] (Shift Lead, opens Output Qty Adjustment modal) | [Scrap LP] (Shift Lead, opens Scrap LP modal).

Footer: [+ Register Primary Output] button → opens Register Output modal (see §4). Shows scanner deep-link card: "Register via scanner — scan this QR to open SCN-082 on your handheld."

**Co-products tab:**

Lists co-products defined in BOM `co_products` with `allocation_pct`. For each co-product:
- Item name + code.
- BOM allocation: "8% of input = ~80.9 kg expected."
- Registered LPs (same table structure as Primary tab).
- [+ Register Co-product LP] button.

**By-products tab:**

Same structure as co-products tab. By-products are flagged with `.badge-gray` "By-product".

If any required output type has no registered LPs and the closed_production_strict gate would be triggered on Complete, a prominent `.alert-red` shows: "Closed Production gate: all outputs must be registered before completing this WO. Missing: [list]."

**States:**

*Loading:* Skeleton table.

*Empty (no outputs yet):* Icon + "No outputs registered yet." + [Register First Output] button + scanner deep-link card.

*Fully registered:* Green banner "All outputs registered." Yield gate result shown. [Proceed to Complete WO] button.

*Yield gate fail (>10% variance):* `.alert-amber`: "Output yield variance is X%. Production Manager review and approval required." [Request Manager Review] button (opens a notification/task to Prod Manager).

*Error:* `.alert-red` with [Retry].

---

### SCREEN PROD-005 — Allergen Changeover Gate

**Screen ID:** PROD-005  
**Route:** `/production/changeover/:event_id`  
**Purpose:** Full changeover validation workflow triggered when allergen gate blocks a WO START. Used by Operator (checklist steps), Shift Lead (first sign-off), and QA Inspector (second sign-off). BRCGS Issue 10 compliant — all actions create an immutable `allergen_changeover_validations` record retained 7 years.

**Layout description:**

**Banner header** (`.alert-amber`, full width, prominent):  
"⚠ Allergen Changeover Required — WO-2026-0043 cannot start until this validation is complete."

**Context card** (`.card`, full width below banner): Shows:
- From WO: code + product + allergen profile (e.g., "No allergens").
- To WO: code + product + allergen profile (e.g., "Contains: Mustard, Sulphites").
- Allergen delta: "Introducing: Mustard (new allergen on this line)".
- Risk level badge: `.badge-amber` "Medium Risk" or `.badge-red` "High Risk".
- Changeover matrix result: "Cleaning required: Yes · ATP swab required: No · Dual sign-off required: Yes".
- Planned changeover duration: X min (from matrix). Actual elapsed: Y min (live counter if changeover started).

The page has three vertically stacked sections, each unlocking the next in sequence (gate pattern):

**Section 1 — Cleaning Checklist:**

Title: "Step 1 — Cleaning Verification". Progress: "3 / 6 steps completed".

A numbered list of checklist steps. Each step row contains:
- Step number circle (`.scanner-step .num` style: blue circle with white number).
- Step description (e.g., "Flush production line with water — 5 minutes minimum").
- Checkbox (enabled for Operator role, Shift Lead). When checked: timestamp auto-captured (read-only label "Completed: 06:15:32 by Marcin S.").
- Optional notes field (text input, 100 char max).
- Photo upload slot (shows "📷 Photo (optional)" — future P2; currently greyed out with "Photo capture available in Phase 2").

When all N steps are checked: section shows green banner "All cleaning steps completed" and Section 2 unlocks.

Uncompleted steps: checkbox unchecked, dimmed description. Cannot proceed to Section 2 if any steps incomplete.

**Section 2 — ATP Swab Result** (shown only if `atp_required = true` from changeover matrix; otherwise collapsed with "ATP not required for this changeover" in muted text):

Title: "Step 2 — ATP Swab". Status: locked if Section 1 not complete.

Form fields:
- Test method: Radio buttons — [ATP] [ELISA] (default ATP).
- Swab locations: Multi-select tags input (e.g., "Mixer bowl, Conveyor 1, Exit chute"). At least one location required.
- RLU value: Number input (integer). Validation: must be ≥ 0 and ≤ 999.
- Threshold display: "Acceptance threshold: ≤ 10 RLU (Apex default, configurable per line)."
- Auto status: After entering RLU value, status badge auto-updates: green "PASS" if ≤ threshold, red "FAIL" if > threshold.
- FAIL state: `.alert-red` "ATP result FAIL — line is not clean. Repeat cleaning before proceeding." [Reset to Cleaning Checklist] button.

[Submit ATP Result] button. When submitted and PASS: section shows green banner "ATP: PASSED · 6 RLU" and Section 3 unlocks.

**Section 3 — Dual Sign-off** (locked until preceding sections complete):

Title: "Step 3 — Dual Digital Signature". Status: locked if previous steps incomplete.

Two signature blocks side by side (`.grid-2`):

**First signer — Shift Lead:**
- Label: "First Signature — Shift Lead".
- Status badge: "Awaiting" (amber) or "Signed" (green).
- When unsigned: "Username" read-only field (auto-populated with current user if Shift Lead role), PIN input (6-digit, masked), [Sign as Shift Lead] button.
- When signed: Displays: "Signed by: [full name] · [timestamp] · Role: Shift Lead". Green checkmark. Immutable.

**Second signer — QA Inspector / Quality Lead:**
- Label: "Second Signature — Quality Lead".
- Status badge: "Awaiting" (amber, locked until Shift Lead signs) or "Signed" (green).
- When Shift Lead has signed but QA not yet: input fields for QA Inspector to enter their credentials. If current user is QA role: PIN input + [Sign as Quality Lead] button. If not QA role: "Waiting for Quality Lead to sign. Share this link: [URL]" with copy button.
- When signed: Same display as first signer.

Both signatures stored as: `{user_id, full_name, role, timestamp, pin_hash_confirmed: true}` in `allergen_changeover_validations.signatures` JSONB. 21 CFR Part 11 format.

**Footer — Complete Changeover button:**

[Complete Changeover — Start WO] button: primary blue, large, full-width. Enabled only when all required sections are complete (cleaning: all steps ✓, ATP: PASS if required, dual signatures: both signed). On click: API call `POST /api/production/changeover-events/:id/complete` → on success, redirects to `/production/wos/:id` which now shows WO as READY to start.

Audit record card at very bottom (collapsed by default): "View BRCGS Audit Record" expands to show JSON-formatted summary of all evidence. [Export PDF] button for compliance archive.

**Right sidebar (if desktop ≥ 1280px):** Audit history of this changeover event — previous attempts, timestamps, who did what, helpful for if sign-off requires coordination across shifts.

**States:**

*Locked (waiting for operator):* Sections 2 and 3 dimmed and show padlock icon + "Complete previous step to unlock."

*Loading:* Skeleton sections.

*All complete:* Full green banner "Changeover validation complete. WO-2026-0043 is cleared to start." Auto-redirect to WO detail after 3 seconds (with cancel option).

*ATP FAIL:* `.alert-red` in Section 2 blocks Section 3. Cleaning checklist is re-opened for re-cleaning.

*Segregation block:* If `risk_level = 'segregated'`, the gate shows a hard-stop `.alert-red` card: "This changeover cannot proceed. Segregated allergen pair detected. The scheduler should have prevented this WO sequence. Contact the Planning team immediately." No cleaning checklist shown. Audit flag emitted.

*Permission-denied (wrong role):* Sign-off buttons show "Only Shift Lead can sign here" / "Only Quality Lead can sign here" with contact prompt.

**Microcopy:**
- "All cleaning steps must be checked before proceeding to ATP testing."
- "PIN confirmation is required for digital signature compliance (BRCGS Issue 10, 21 CFR Part 11)."
- "This record will be retained for 7 years per BRCGS requirements."
- Section unlock tooltip: "Complete Step N first."

---

### SCREEN PROD-006 — OEE Dashboard

**Screen ID:** PROD-006  
**Route:** `/production/oee`  
**Purpose:** Availability × Performance × Quality OEE monitoring per line per shift. Data sourced from `oee_snapshots` table (populated by per-minute aggregation job every 60s). Dashboard is read-only for most roles; the 15-OEE module owns advanced analytics (linked from this screen). This is the P1 data-foundation view; streaming and EWMA anomaly detection are P2.

**Layout description:**

**Filters bar** (top, `.card` style): [Line: All ▼] [Shift: Current ▼] [Date: Today ▼]. Shift selector shows active shift first. Date selector: Today / Yesterday / Last 7 days / Custom range. When a specific line is selected, the page narrows to show only that line in detail.

**OEE summary cards row** (four `.kpi` cards):

1. **Availability** (green/amber/red vs target 85%): Large value "87.5%". Sub-text "Target: 85% · Downtime: 60 min · Planned: 480 min." Formula note: "(480−60)/480 = 87.5%".
2. **Performance** (green/amber/red): "90.0%". Sub-text: "Output: 900 units · Theoretical: 1,000 units · Ideal cycle time: 28s/unit."
3. **Quality** (green/amber/red): "95.0%". Sub-text: "Good output: 950 units · Total output: 1,000 units · Defects/rework: 50 units."
4. **OEE = A × P × Q** (green/amber/red; target 85%): "74.8%". Sub-text: "87.5% × 90.0% × 95.0% = 74.8%. Target: 85%." A small pill: `.badge-red` "Below Target" or `.badge-green` "On Target".

**Per-line OEE table** (full width, `.card`):

Table columns: Line Name | Active WO | Status | Availability % | Performance % | Quality % | OEE % | Last Updated | Actions.

Each OEE component cell is coloured using inline badge class:
- ≥ 85%: `.badge-green`.
- 75–84%: `.badge-amber`.
- < 75%: `.badge-red`.

Row-level expansion: clicking a row expands a sub-row showing the breakdown details (downtime events contributing to Availability, cycle time variance contributing to Performance, waste/rework contributing to Quality) and a sparkline miniature trend for OEE over the last 4 hours (rendered as SVG or canvas within the row).

Actions column: [Drill Down] → opens `/production/lines/:id` with OEE focus; [Log Downtime] → opens Register Downtime modal.

**OEE trend chart** (full width, `.card`): Title: "OEE Trend — [selected period]". A line chart (rendered using a charting library or SVG-based sparkline). X-axis: time (hourly ticks for today; daily for last 7 days). Y-axis: 0–100%. Three lines: Availability (blue), Performance (grey), Quality (light grey), OEE composite (dark, bold). A dashed horizontal line at the OEE target (e.g., 85%). Hover tooltip shows exact values per time point. Below the chart: stat row "Avg: 74.8% · Best: 88.5% · Worst: 68.2% · vs target: −10.2pp."

Date range and granularity controls: [Last 8h] [Today] [Yesterday] [Last 7d]. Granularity auto-adapts (per-minute for ≤4h; hourly for ≤7d; daily for longer).

**Bottom link:** "Advanced OEE analytics including EWMA anomaly detection → 15-OEE module (Premium)." Styled as a `.alert-blue` info card with a [Go to 15-OEE] button.

**States:**

*Loading:* Skeleton KPI cards + skeleton table rows + skeleton chart area.

*Empty (no data for selected period):* "No OEE data available for this period. The aggregation job runs every 60 seconds. If data is missing, check the system status." + [Check System Status] link.

*No active production (OEE correctly zero):* Shows zero values with muted explanation: "No production scheduled for this shift period."

*Error (job failed):* `.alert-red`: "OEE data collection error. Aggregation job may have fallen behind. Backfill job will recover missing snapshots automatically." + timestamp of last successful snapshot.

**Modals triggered:** Register Downtime modal (from [Log Downtime] action), OEE Target Edit modal (Admin only, see §4).

---

### SCREEN PROD-007 — Downtime Tracking

**Screen ID:** PROD-007  
**Route:** `/production/downtime`  
**Purpose:** Log, review, and analyse all downtime events across all production lines. Supports manual entry by Shift Lead, links to WO-pause-triggered events, and provides Pareto analysis and MTTR/MTBF metrics. Downtime category taxonomy is admin-configurable (from 02-SETTINGS; not hardcoded here).

**Layout description:**

**Active downtime banner** (visible only when `downtime_events` has rows where `ended_at IS NULL`): `.alert-red` full-width banner at top: "ACTIVE: [Line Name] has been down for [X min] since [time]. Category: [name]. [View Details] [End Downtime]." If multiple active: a counter badge and a dropdown to view each.

**Filter and action bar** (.card): [+ Log Downtime Event] button (primary, Shift Lead+). Filters: [Line: All ▼] [Category: All ▼] [Date range: Last 7 days ▼] [Source: All / WO-pause / Manual ▼]. [Export CSV] secondary button.

**MTTR / MTBF KPI cards row** (four `.kpi` cards, scoped to selected filter):
1. Total downtime (min): e.g., "847 min" across selected period.
2. Number of events: "23 events".
3. MTTR (Mean Time to Repair): "36 min avg".
4. MTBF (Mean Time Between Failures): "4.2 h avg" (excludes planned downtime categories).

**Pareto chart** (`.card`, full width): Title: "Downtime by Category — Pareto Analysis". A vertical bar chart (or SVG-rendered bars) showing category names on X-axis, total minutes on Y-axis, bars sorted descending. Each bar labelled with: category name, total minutes, event count, % of total. Bars use the downtime classification colours (People=blue, Process=amber, Plant=red). A cumulative line (80/20 rule indicator) overlaid on the chart. Below the chart: a legend showing the lean 6-big-losses mapping ("Plant: Breakdown · Changeover · Cleaning; Process: Material Wait · Upstream Delay · Quality Hold; People: Operator Break · Operator Missing · Training"). [Export Analysis] link.

**Downtime events table** (`.card`, full width): Columns: Date/Time | Line | WO | Category | Source | Duration | Reason | Recorded By | Actions.

Category column shows the category label from the admin-configurable taxonomy. Source badge: `.badge-blue` "WO Pause" or `.badge-gray` "Manual" or `.badge-amber` "PLC (P2)".

Open events (no ended_at): Duration cell shows a live counter "42 min (ongoing)" with a pulsing amber dot. [End Downtime] action button.

Row expand: shows full reason notes, shift_id, associated WO detail link.

Actions: [Edit] (Shift Lead, opens edit modal to correct category/notes) | [Delete] (Admin only, requires reason). 

Pagination: 25 per page, newest first.

**States:**

*Loading:* Skeleton banner area, skeleton KPI cards, skeleton chart placeholder, skeleton table rows.

*Empty (no downtime in period):* "No downtime events in the selected period. Good job! All lines running to plan." Green success illustration.

*No active downtime:* Banner absent. Normal view with historical data.

*Error:* `.alert-red` partial error boundaries per section.

**Modals triggered:** Register Downtime modal, Edit Downtime modal (see §4).

---

### SCREEN PROD-008 — Shift Management

**Screen ID:** PROD-008  
**Route:** `/production/shifts`  
**Purpose:** Manage shift crew assignments, view per-shift production summaries, and perform shift handover sign-off. Shift patterns (schedule templates) are defined in 02-SETTINGS. This screen handles the runtime layer: who is on shift, what was produced, and end-of-shift sign-off.

**Layout description:**

**Shift selector bar** (.card): Two buttons: [Current Shift] [Previous Shifts]. Current shift shows: name, times (e.g., "Shift A — 06:00–14:00"), elapsed time, and a live clock. Previous Shifts opens a date-picker list.

**Crew assignment grid** (`.card`): Title: "Crew on Duty — [Shift Name]". A table with columns: Line | Operator | Start Time | Status (Active/Break/Left) | Actions.

Shift Lead can add operators via [+ Assign Operator] button (opens a searchable user dropdown filtered to operator role). Each row has [Remove] action (Shift Lead). An operator can only appear on one line at a time per shift; validation prevents duplicates.

**Per-line shift summary** (`.card`): Title: "Shift Summary — [Line]". For each line, a summary card showing:
- WOs completed this shift: list of WO codes + products + output quantities.
- WOs in progress (if any, with current state).
- Total output this shift vs target.
- Waste this shift (kg + %).
- Downtime this shift (min + top category).
- Yield % average.
- FEFO compliance rate.

**Handover notes** (`.card`): A textarea input (500 char max) for the outgoing Shift Lead to enter handover notes (outstanding issues, machine state, pending WOs, materials low, QA holds). Labelled "Handover Notes (visible to incoming Shift Lead)". [Save Notes] button.

**Shift sign-off panel** (`.card`, shown only for Shift Lead): Title: "End-of-Shift Sign-off".
- Summary checklist: all WOs completed ✓/⚠, all outputs registered ✓/⚠, no open QA holds ✓/⚠, no open downtime events ✓/⚠, handover notes entered ✓/⚠.
- Checklist items with warnings show `.alert-amber` sub-text with specific action links.
- [Sign Off Shift] button (disabled until all checklist items are ✓ or acknowledged). On click: opens Shift End Sign-off modal (see §4).
- After sign-off: immutable record displayed with timestamp and name. Shift status changes to COMPLETED.

**States:**

*Loading:* Skeleton crew table + skeleton summary cards.

*No active shift:* "No shift currently active. Shifts are defined in Settings > Shift Patterns." [Configure Shifts] link.

*Shift complete (signed off):* Banner "Shift [Name] completed and signed off at [time] by [name]. Read-only view." Summary statistics available.

*Error:* `.alert-red` with [Retry].

**Modals triggered:** Shift Start/End Sign-off modal (see §4).

---

### SCREEN PROD-009 — Analytics Hub

**Screen ID:** PROD-009  
**Route:** `/production/analytics`  
**Purpose:** Historical production analytics: yield trends, waste analysis, labour utilisation, throughput trends, FEFO compliance rates, WO on-time completion. Read-only for most roles. Data sourced from `wo_executions`, `wo_outputs`, `wo_material_consumption`, `wo_waste_log`, `operator_kpis_monthly` (materialized view).

**Layout description:**

**Filter bar** (sticky `.card`): [Date range: Last 30 days ▼] [Line: All ▼] [Product: All ▼] [Shift: All ▼] [Operator: All ▼]. [Apply Filters] + [Reset]. [Export Dashboard CSV] button right-aligned.

**KPI summary row** (five `.kpi` cards):
1. WO Yield Compliance %: "94.2% of WOs ≥ 95% output" (target: ≥95%).
2. On-time completion %: "87.3%" (target: ≥85%).
3. Average waste %: "1.8%" (target: <3%).
4. FEFO compliance %: "98.9%" (target: ≥98%).
5. D365 push success rate: "99.97%" (target: ≥99.9%).

**Charts section** (`.card` per chart, two-column grid on desktop):

Chart 1 — "Production Output Trend (kg)": Line chart, weekly granularity, last 12 weeks. X-axis: week ending date. Y-axis: total output kg. Target line overlay. Tooltip shows week, kg, vs target.

Chart 2 — "Yield by Product": Horizontal bar chart. Products on Y-axis, yield % on X-axis. Bars coloured: green ≥95%, amber 85–94%, red <85%. Sorted by yield ascending. [Show only below target] toggle.

Chart 3 — "Waste by Category": Stacked bar chart, weekly. Categories as stack colours. Total waste % line overlay. Below: total waste kg + % for the period.

Chart 4 — "WO Completion — On-time vs Late": Grouped bar chart per week. On-time (green) vs late (red) WO counts. Trend line for on-time %.

Chart 5 — "FEFO Compliance Trend": Line chart per week. Target dashed at 98%. Below-target weeks highlighted in amber background fill.

Chart 6 — "Downtime by Category (Pareto)": Same Pareto as PROD-007 but for the selected period.

**Operator KPIs table** (`.card`, full width, visible to Shift Lead / Prod Manager): Title: "Operator Performance — [Month]". Columns: Operator Name | Consumptions | Avg Scan Speed (s) | FEFO Compliance % | Over-consumption Incidents | Waste Attributed (kg). Rows from `operator_kpis_monthly` materialized view (refreshed nightly). Sortable columns. Note at top: "Operator performance data refreshed nightly. Current month includes data to [last refresh timestamp]."

**States:**

*Loading:* Skeleton KPI cards + skeleton chart placeholders with "Loading chart data…" labels.

*Empty (no data in period):* "No production data for the selected period." Chart areas show blank state with filter suggestion.

*Error:* Per-chart error boundary, skeleton remains for failed charts.

---

### SCREEN PROD-010 — Waste Analytics

**Screen ID:** PROD-010  
**Route:** `/production/waste`  
**Purpose:** Detailed waste event log and analytics. Complements the Analytics Hub but focused entirely on waste data. Used by Shift Lead for daily review and by Prod Manager for trend analysis and category taxonomy review.

**Layout description:**

**Filter bar**: [Date range ▼] [Line ▼] [Shift ▼] [Operator ▼] [Category ▼] [Product ▼]. [Export CSV].

**KPI row** (four cards): Total waste kg | Waste % of input | Events count | Top category.

**Trend chart**: Line chart showing waste % week over week for last 12 weeks. Target dashed line at 3%.

**Pareto chart**: Categories sorted by total kg. Bars. Cumulative line.

**Events table**: Timestamp | WO | Product | Line | Category | Qty (kg) | Reason | Operator | Approved By.

Over-threshold rows (>5% of WO input) highlighted with `.badge-amber`. Pending approval rows show [Approve] action (Prod Manager only).

**States:** Loading / empty / error as per standard pattern.

---

### SCREEN PROD-011 — Production Settings

**Screen ID:** PROD-011  
**Route:** `/production/settings`  
**Purpose:** Admin-configurable settings for all production execution behaviour. Divided into collapsible sections. Changes are tenant-scoped and some require Production Manager role; full admin access for the full form.

**Layout description:**

Page title "Production Settings". Breadcrumb: Settings / Production. Unsaved changes indicator: "• Unsaved changes" in amber next to the page title.

Sections (each is a `.card` with a collapsible header showing section name + [Expand ▼] / [Collapse ▲] button):

**Section 1 — WO Lifecycle:**
- `production.closed_production_strict.enabled` — Toggle "Closed Production Strict Gate". Default ON. Help text: "Prevents WO completion until all components consumed and all outputs registered."
- `production.over_consumption.tolerance_pct` — Number input "Over-consumption Tolerance %" (default 5). Range 1–50. Help text: "Percentage above BOM planned qty before Shift Lead approval is required."
- `production.state_machine.version` — Read-only text "v1" with badge "Locked — change via 02-SETTINGS Rule Registry."

**Section 2 — Output:**
- `production.output_yield_gate.variance_threshold` — Number input "Yield Gate Variance Threshold %" (default 10). Range 1–50. Help text: "If actual yield deviates from BOM yield_pct by more than this %, Production Manager review is required."
- `production.catch_weight.tolerance_pct` — Number input "Catch-weight Tolerance %" (default 10).
- Label printing: Radio group "Print trigger" — [On Registration (automatic)] / [Manual only]. P2 row (greyed): "ZPL native printing — Phase 2."

**Section 3 — Material & FEFO:**
- FEFO deviation policy: Select "FEFO deviation requires reason code" (required / optional / disabled). Default: required.
- `production.waste.threshold_pct_alert` — Number input "Waste Alert Threshold %" (default 5).

**Section 4 — Downtime:**
- [Manage Downtime Categories] link → opens 02-SETTINGS downtime taxonomy (admin).
- [View Apex Default Seed (10 categories)] expandable: shows People / Process / Plant taxonomy with 10 categories.
- `production.oee_aggregation.enabled` — Toggle "OEE Aggregation Job" (default ON).
- `production.oee_aggregation.interval_sec` — Number input "Aggregation interval (seconds)" (default 60, range 30–300).

**Section 5 — D365 Integration:**
- `integration.d365.push.enabled` — Toggle "D365 WO Confirmations Push" (default ON for Apex, OFF for new tenants).
- `integration.d365.push.dry_run` — Toggle "Dry Run Mode" (logs but does not call D365). Label: "Debug only — do not leave enabled in production."
- `integration.d365.push.batch_size` — Number input "Dispatcher batch size" (default 100).
- Link: [Configure D365 Connection → 02-SETTINGS §11].

**Section 6 — Allergen Changeover Gate:**
- `production.allergen_gate.version` — Read-only "v1". Locked.
- ATP threshold input (per-line override possible): Default "10 RLU". Number input.
- Link: [Configure Allergen Changeover Matrix → 07-PLANNING-EXT].

**Section 7 — Scanner Links:**
- Brief info card: "Operator-facing scanner settings (scan speed KPIs, FEFO prompts, catch-weight entry) are configured in 06-SCANNER Settings." [Go to Scanner Settings] link.

**Section 8 — Phase 2 (locked/greyed):**
- PLC Integration: `.badge-gray` "Phase 2" + muted description.
- Catch-weight scale integration: same.
- ZPL printing: same.
- OEE streaming: same.

Footer (sticky): [Save Settings] primary. [Discard Changes] secondary. On save: confirmation toast "Settings saved."

**States:**

*Unsaved:* "• Unsaved changes" amber indicator + sticky footer visible.

*Saving:* [Save Settings] button shows spinner "Saving…"

*Saved:* Toast ".badge-green Production settings updated successfully."

*Permission-denied (non-admin):* Fields show read-only text values. Footer buttons hidden. Banner: "Contact your admin to modify production settings."

---

### SCREEN PROD-012 — D365 DLQ Admin

**Screen ID:** PROD-012  
**Route:** `/admin/integrations/d365/dlq`  
**Purpose:** Review and manage the dead-letter queue for failed D365 WO confirmation push events. Used by Production Manager and Admin. Part of INTEGRATIONS Stage 2.

**Layout description:**

Page title: "D365 WO Push — Dead Letter Queue". Breadcrumb: Admin / Integrations / D365 / DLQ.

**DLQ health bar** (`.card`): Four stats: DLQ depth: N | Oldest unresolved: "3h 12m ago" | Success rate (last 24h): "99.97%" | Avg retry count: "1.2". If DLQ depth > 10: `.badge-red` alert + automated pager text "Ops team notified."

**Filters**: [Status: Open / Resolved / All ▼] [Error type: All ▼] [Date from / to ▼] [WO filter: text search].

**DLQ events table**: Columns: WO Code | Event Type | Error Summary | Attempts | Moved to DLQ | Last Error | Next Retry | Status | Actions.

Event type badge: `.badge-blue` "wo.completed" (standard) or other event types.  
Error summary: truncated first 80 chars of `last_error` with [View full] tooltip.  
Attempts: "5/5" with `.badge-red` if at max.  
Status: "Open" (`.badge-red`) or "Resolved" (`.badge-green`).  
Actions column: Three action buttons:
- [Replay] (`.btn-primary` blue): Force retry. Updates `attempt_count`, returns event to outbox `failed` status. Confirmation dialog: "Replay event for WO-2026-0042? This will trigger a new D365 push attempt."
- [Mark Resolved] (`.btn-secondary`): Opens Mark Resolved modal — text area "Resolution notes", [Confirm Resolved] button. Sets `resolved_at` + `resolved_by`.
- [View Raw] (`.btn-secondary`): Opens a 560px modal showing internal canonical JSON payload.
- [View D365 Payload] (`.btn-secondary`): Opens modal showing the mapped D365 JournalLines JSON (from anti-corruption adapter output).

**States:**

*Empty DLQ (no open items):* Green banner "DLQ is clear — all WO confirmations successfully delivered to D365." + summary stats.

*Loading:* Skeleton rows.

*Error (API down):* `.alert-red` "Unable to load DLQ data. D365 integration may be offline." + [Retry].

---

### SCREEN PROD-013 — Line Detail

**Screen ID:** PROD-013  
**Route:** `/production/lines/:id`  
**Purpose:** Deep-dive into a single production line: current WO, machine status, per-line OEE, downtime history, and crew.

**Layout description:**

**Header card**: Line name, code, status badge (RUNNING / IDLE / DOWN / CHANGEOVER). Machine list (linked to 02-SETTINGS machines). Current operator on duty.

**Current WO card**: Same content as the line card on PROD-001 but expanded: full progress bars for consumption and output, catch-weight summary if applicable, time elapsed vs planned.

**Line OEE mini-dashboard**: Three gauges (A, P, Q) + OEE product. Last 8h trend sparkline.

**Downtime history list**: Last 5 downtime events with category, duration, reason. [View All] link → PROD-007 filtered to this line.

**Upcoming WOs list**: Next 3 WOs scheduled for this line from 04-PLANNING, showing code, product, planned start, allergen changeover indicator (red badge if gate will be triggered).

**States:** Standard loading / empty / error.

---

### SCREEN PROD-014 — Scanner-Linked Reference Cards

**Screen ID:** PROD-014  
**Route:** Embedded within PROD-002 (WO detail tabs) and PROD-003/PROD-004  
**Purpose:** Desktop reference cards for scanner-executed flows. The actual UX for operator scan flows lives in 06-SCANNER-P1. These cards give the supervisor visibility and a deep-link mechanism.

**Layout:** A `.card` with title "Scanner Flows — [flow name]". Content: a brief description of what the scanner flow does, current status summary (e.g., "8 of 12 LPs consumed via scanner"), and a [Open on Scanner] button that generates a QR code or deep-link URL (e.g., `scanner://wo/WO-2026-0042/consume`) that the operator scans with their handheld. 

Scanner-linked flows covered:
- SCN-080 Consume to WO → linked from PROD-003 right panel.
- SCN-082 Register Primary Output → linked from PROD-004.
- SCN-083 Register Co-product / By-product → linked from PROD-004.
- SCN-084 Log Waste → linked from WO detail waste tab.
- SCN-081 WO Execute (start/pause/resume on scanner) → linked from PROD-002 header.

---

## 4. Modals

All modals use the shared `#modal-overlay` / `#modal-box` shell. Width: 560px. Max-height: 80vh with internal scroll. Header: `.modal-title` with title text left, ✕ close button right. Footer: action buttons right-aligned.

---

### MODAL-01 — Start WO

**Trigger:** [Start WO] button on PROD-002 header (WO in READY state).  
**Role:** Shift Lead.

Fields:
- Line: pre-filled from WO scheduler assignment; if multiple options, a Select dropdown showing available lines. Unavailable lines greyed with "(In use by WO-XXXX)".
- Shift: pre-filled from current active shift. Read-only if shift is auto-detected; editable Select if ambiguous.
- Operator on duty: Select searchable dropdown, filtered to operator role, required.
- Material availability check: auto-loaded on modal open. For each BOM component: name, planned qty, available qty, % available. Rows with <100%: amber warning. Rows with <80%: red warning. Note: "Materials with <100% availability will proceed; FEFO-suggested LPs will be offered on scanner."
- Allergen gate status: If gate evaluation returns "no changeover required": green "✓ Allergen gate: No changeover required." If gate requires changeover: this modal is blocked and a redirect message shows: "Allergen changeover validation required before starting. [Go to Changeover →]."
- Idempotency: UUID v7 `transaction_id` generated client-side, displayed in small monospace text as "Transaction ID: [id]" for audit.

Footer: [Cancel] secondary + [Start Production] primary.

Validation: line required, operator required. On submit: POST `/api/production/work-orders/:id/start` with `{transaction_id, operator_id, line_id, shift_id}`.

Success: modal closes, WO status badge updates to IN_PROGRESS, toast "WO-2026-0042 started on LINE-01."

Error (allergen gate 423): modal shows `.alert-red` "Allergen changeover required" + [Go to Changeover] button.

Error (line busy 409): `.alert-red` "LINE-01 is already running WO-2026-0039. Please select a different line."

---

### MODAL-02 — Pause WO

**Trigger:** [Pause WO] on PROD-002 header or line card (WO IN_PROGRESS).  
**Role:** Shift Lead.

Fields:
- WO summary: code + product (read-only).
- Downtime category: Select dropdown loaded from admin-configurable `downtime_categories` taxonomy (People / Process / Plant groupings). Required. Note: "Category is required for downtime analytics and OEE Availability calculation."
- Reason notes: Textarea, optional, 500 char max.
- Estimated duration (optional): Number input "Estimated downtime (min)". Informational only.

Footer: [Cancel] + [Pause WO] amber primary.

On submit: POST `/api/production/work-orders/:id/pause` with `{transaction_id, operator_id, reason_category_id, notes}`. Side effect: `downtime_events` row created with `source='wo_pause'`.

---

### MODAL-03 — Resume WO

**Trigger:** [Resume WO] on paused WO.  
**Role:** Shift Lead.

Shows: Paused since [timestamp]. Pause duration: [calculated]. Pause reason: [category + notes from pause modal].

Fields: Operator resuming (auto-filled). Optional: actual_duration_override if actual differs (notes field).

Footer: [Cancel] + [Resume WO] green primary.

On submit: POST `/api/production/work-orders/:id/resume`. Side effect: closes the open `downtime_events` row, calculates duration_min.

---

### MODAL-04 — Complete WO

**Trigger:** [Complete WO] on WO IN_PROGRESS.  
**Role:** Shift Lead / Prod Manager.

**Validation checklist display** (gate evaluation results from `closed_production_strict_v1`):

Each gate check shown as a checklist row with ✓ green or ✗ red:
1. "All BOM components consumed within tolerance (±2%)." If fail: "Short by: [list: component, short_by_qty]."
2. "Primary output registered." If fail: "Primary output not registered."
3. "Co-products registered (X / Y)." If fail: lists missing co-products.
4. "By-products registered (X / Y)." If fail: lists missing by-products.
5. "No open QA holds." If fail: "X output LPs on QA hold."
6. "Output yield within gate threshold." If fail: shows yield variance + "Production Manager approval required."

If ALL checks pass: "✓ All gates passed. WO is ready to complete."

Footer (all pass): [Cancel] + [Complete WO] primary green.

Footer (gate fail, Prod Manager role): [Cancel] + [Override and Complete] red button (disabled until reason is entered in a mandatory text area "Override reason — required for audit").

Footer (gate fail, Shift Lead role — no override permission): Buttons disabled. Message: "Gates have failed. Production Manager override required to complete this WO."

On submit: POST `/api/production/work-orders/:id/complete` with `{transaction_id, operator_id, override_reason_code?}`.

Success: WO status → COMPLETED. Toast "WO-2026-0042 completed. D365 push enqueued."

---

### MODAL-05 — Consume Adjustment (Over-consumption Approval)

**Trigger:** Over-consumption detected (Shift Lead receives notification or sees `.alert-amber` on PROD-003).  
**Role:** Shift Lead (approve / reject).

Shows: Component name. BOM planned qty. Consumed qty. Over by: X kg (Y%). Tolerance: Z%.

Fields:
- Reason code: Select from taxonomy (Waste/Spillage/Rework/Scale error/Other). Required.
- Notes: Textarea 300 char.
- Approver auto-populated: current Shift Lead user (read-only).

Footer: [Reject — Reverse Consumption] red + [Approve Over-consumption] primary.

On approve: POST `/api/production/consumption/:id/approve` with `{approver_user_id, reason_code, notes}`.

---

### MODAL-06 — Output Qty Adjustment

**Trigger:** [Adjust Qty] on an output LP row (PROD-004).  
**Role:** Shift Lead.

Fields: LP code (read-only). Current qty (read-only). New qty (number input, >0). Scrap/adjustment reason (Select: Short fill / Scale error / Spill / Lab sample / QA scrap / Other). Notes.

Validation: new qty must be ≥ 0. If new qty = 0: "This will scrap the LP. Use Scrap LP action instead."

Footer: [Cancel] + [Save Adjustment].

---

### MODAL-07 — Register Downtime

**Trigger:** [Log Downtime Event] on PROD-007 or from dashboard alert.  
**Role:** Shift Lead / Operator (via scanner).

Fields:
- Line: Select (required).
- WO (optional): Select or leave blank for unlinked downtime.
- Category: Select from `downtime_categories` taxonomy (admin-configurable, grouped by People/Process/Plant). Required.
- Source: Auto-selected "Manual". Read-only.
- Started at: Datetime input (default now, editable for retroactive entry). Required.
- Ended at: Datetime input (optional; if left blank, event is "open").
- Reason notes: Textarea 500 char. Optional.
- PLC fault code: Text input. Optional. Note: "(Auto-populated in Phase 2 when PLC integration is enabled)."

Footer: [Cancel] + [Log Downtime] primary.

Validation: started_at ≤ ended_at, line required, category required.

---

### MODAL-08 — Scrap LP

**Trigger:** [Scrap LP] on an output row or from 05-WAREHOUSE LP actions.  
**Role:** Shift Lead.

Shows: LP code, product, batch, qty, expiry.

Fields: Scrap reason (Select from waste_categories). Qty to scrap (default full LP qty, editable). Notes.

Confirmation step: "Scrapping LP-XXXX (50 kg) will create a waste record and permanently quarantine this LP. This cannot be undone."

Footer: [Cancel] + [Confirm Scrap] red.

---

### MODAL-09 — Call QA Inspection

**Trigger:** [Call QA] on output LP row or from dashboard alert.  
**Role:** Shift Lead.

Shows: LP code, product, batch, qty.

Fields: Inspection type (Select: CCP / AQL / Allergen / Visual / Other). Priority (Select: Urgent / Standard). Notes to QA inspector (textarea).

Footer: [Cancel] + [Request QA Inspection].

On submit: Creates a QA inspection request in 09-QUALITY module (cross-module API call). Toast "QA inspection request sent for LP-XXXX."

---

### MODAL-10 — Shift Start Sign-off

**Trigger:** [Start Shift] button on PROD-008 (or auto-prompted when no shift is active at shift start time).  
**Role:** Shift Lead.

Fields: Shift name (read-only from schedule). Line assignments (multi-select for which lines this shift covers). Handover received from (auto-populated previous Shift Lead). Accept handover notes (checkbox: "I have read and acknowledged the handover notes from the outgoing shift"). PIN confirmation.

Footer: [Cancel] + [Sign In — Start Shift] primary.

---

### MODAL-11 — Shift End Sign-off

**Trigger:** [Sign Off Shift] on PROD-008 after all checklist items resolved.  
**Role:** Shift Lead.

Shows: Shift summary stats (WOs completed, output kg, waste %, downtime min). Handover notes textarea (pre-filled from earlier edits). Checklist acknowledgement tick boxes. PIN input.

Footer: [Cancel] + [Sign Off Shift] primary.

---

### MODAL-12 — Machine Changeover Setup

**Trigger:** [Start Changeover] from line action menu or from SCN-081 scanner (links to PROD-005 if allergen-triggered).  
**Role:** Shift Lead.

Fields: From WO (auto-filled, read-only). To WO (auto-filled, read-only). Planned changeover duration (number, minutes, from changeover_matrix). Notes. Allergen check result (auto-evaluated and displayed read-only).

Footer: [Cancel] + [Start Changeover Timer].

On submit: Creates `changeover_events` row. If allergen gate required → redirects to PROD-005 allergen changeover gate screen.

---

### MODAL-13 — SOP View (Docs)

**Trigger:** [View SOP] link on WO detail or line card (if SOP document URL configured in Settings).  
**Role:** All.

Displays: embedded PDF viewer (browser iframe) or link to document management system. Document title, version, last updated. [Download PDF] button.

---

### MODAL-14 — OEE Target Edit

**Trigger:** [Edit OEE Target] on PROD-006 (Admin only).  
**Role:** Admin.

Fields: Line (Select). OEE target % (number, 50–99). Availability target %. Performance target %. Quality target %. Effective from date.

Footer: [Cancel] + [Save Targets].

---

### MODAL-15 — D365 DLQ: View Payload

**Trigger:** [View Raw] or [View D365 Payload] on PROD-012 table row.  
**Role:** Prod Manager / Admin.

Shows: Pre-formatted JSON in a monospace `<pre>` block with syntax colouring. For [View D365 Payload], also shows the D365 JournalLines format alongside (two-column diff view).

Footer: [Close] + [Copy to Clipboard].

---

## 5. Flows

### Flow A — WO Start → Consume → Output → QA → Complete

1. Supervisor navigates to `/production/wos` → finds WO in READY state → clicks WO row → PROD-002.
2. Clicks [Start WO] → MODAL-01 opens. Line pre-filled, operator assigned, allergen gate evaluated (green if no changeover required). Clicks [Start Production].
3. WO transitions to IN_PROGRESS (state machine). Header updates to show IN_PROGRESS badge. PROD-001 dashboard line card updates to RUNNING.
4. Operator on handheld (06-SCANNER SCN-080) scans RM LPs one by one. Each scan calls `/api/production/scanner/consume-to-wo`. Progress bars on PROD-003 update on each 30s auto-refresh.
5. If FEFO deviation: scanner returns warn response; operator must select reason code on scanner. Desktop PROD-003 shows deviation row in amber.
6. If over-consumption: scanner returns 409. Shift Lead on desktop sees `.alert-amber` on PROD-003 and clicks [Approve] → MODAL-05.
7. Operator registers output via SCN-082 on scanner. Output LPs created in 05-WAREHOUSE. PROD-004 output table populates.
8. Catch-weight items: scanner prompts for actual_kg per unit. Data flows to PROD-004 catch-weight details column.
9. Meat_Pct aggregation auto-calculated on PROD-003 and PROD-004 as consumptions are recorded.
10. Supervisor clicks [Complete WO] → MODAL-04 opens. Gate evaluation runs. All checks pass → [Complete WO] button active. Submit.
11. WO transitions to COMPLETED. `production_outbox_events` row inserted (atomic with state transition).
12. Toast: "WO-2026-0042 completed. D365 push enqueued." D365 dispatcher picks up event within 30s, pushes JournalLines. PROD-012 shows event as DELIVERED.
13. `oee_snapshots` next minute-tick reflects completed WO contribution to Q (quality).

---

### Flow B — Downtime Event

1. Machine fault occurs (P1: operator detects; P2: PLC signal auto-triggers).
2. If WO is running: Operator on scanner presses [Pause WO] → MODAL-02 (on scanner in 06-SCANNER SCN-081). Shift Lead on desktop sees WO card flip to PAUSED with pulsing amber dot.
3. Downtime event auto-created with `source='wo_pause'`. Duration counter starts.
4. PROD-001 dashboard line card shows DOWN banner. PROD-007 shows active downtime banner.
5. Fault resolved. Operator presses [Resume WO] on scanner → MODAL-03 (desktop or scanner). Downtime event closed. Duration_min calculated.
6. PROD-007 table row now shows start/end/duration. OEE Availability recalculated in next minute-tick.
7. Shift Lead optionally adds detailed reason notes via [Edit] on downtime row.

---

### Flow C — Catch-Weight FA Output (3103 / 3922)

1. WO for item with `weight_mode='catch'`. PROD-002 header shows "Catch-weight item" badge.
2. Operator registers output via SCN-082. Scanner displays catch-weight entry screen.
3. For 3103 mode: operator enters count of units + confirms net weight per unit (or accepts nominal). Scanner calls `/api/production/work-orders/:id/outputs` with `catch_weight_details: {mode: "3103", units: 20, net_kg_per_unit: 2.45}`.
4. For 3922 mode: operator enters actual weight for each unit individually. Scanner calls endpoint with per-unit array.
5. PROD-004 Catch Weight Details column shows mode toggle, per-unit table, variance vs planned.
6. If variance > tolerance (default 10%): soft warning badge on output row. Shift Lead can review and acknowledge on PROD-004.
7. On WO complete: `catch_weight_details` JSONB saved in `wo_outputs` for audit.

---

### Flow D — Meat_Pct Aggregation

1. WO contains multiple BOM components of type "raw meat" each with a `meat_pct` field (defined in 03-TECHNICAL §8.9 item record).
2. As each meat-component LP is consumed, `wo_material_consumption` records the consumed qty.
3. PROD-003 right panel shows live Meat_Pct aggregate: "Σ(qty_i × meat_pct_i) / Σ(qty_i)" recalculated on each consumption event.
4. Final Meat_Pct aggregate is displayed on PROD-004 output detail and included in the output LP's label data (printed on PDF label).
5. If required by regulatory profile: Meat_Pct is pushed in the `ext_jsonb` of the `wo_outputs` row and included in the D365 outbox payload.

---

### Flow E — Allergen Changeover Gate

1. Previous WO on LINE-01 was FA5100 (no allergens). New WO WO-2026-0043 is FA5102 (contains Mustard).
2. Supervisor clicks [Start WO] on WO-2026-0043 → MODAL-01 opens → allergen gate evaluation triggered on open.
3. Gate returns 423 with `changeover_event_id`. MODAL-01 shows `.alert-red` "Allergen changeover required" + [Go to Changeover].
4. PROD-005 allergen changeover gate screen opens. Banner: "WO-2026-0043 blocked — allergen changeover validation required."
5. Context card shows allergen delta: "Introducing: Mustard. Risk level: Medium. Cleaning required. Dual sign-off required."
6. Operator completes 6-step cleaning checklist (ticking each step with timestamp auto-captured).
7. ATP not required for Medium (only for High). Section 2 shows "ATP not required for this risk level."
8. Section 3 unlocks. Shift Lead enters PIN → [Sign as Shift Lead]. Signs.
9. QA Inspector logs in (or is notified via notification). Enters PIN → [Sign as Quality Lead]. Signs.
10. [Complete Changeover — Start WO] button activates. Supervisor clicks.
11. `allergen_changeover_validations` row created with all evidence. BRCGS audit trail locked 7y.
12. WO-2026-0043 transitions to IN_PROGRESS. PROD-001 line card shows RUNNING.

---

### Flow F — Shift Handover

1. End of Shift A (14:00). Shift Lead opens PROD-008.
2. Shift summary auto-populated: 3 WOs completed, 1,003 kg output, 1.8% waste, 12 min downtime.
3. Shift Lead types handover notes: "Mixer M-003 running slightly hot — maintenance aware. WO-2026-0044 started, ~40% complete, FEFO LPs ready."
4. Checklist review: all items green except "Open QA holds: 1 (LP-3002 pending)". Shift Lead clicks [View QA Hold] → navigates to 09-QUALITY. After confirming awareness: clicks [Acknowledge] on checklist item.
5. Clicks [Sign Off Shift] → MODAL-11 opens. Reviews summary, enters PIN. Submits.
6. Shift A record: COMPLETED + signed. Shift B start sign-on begins. Incoming Shift Lead opens PROD-008, sees handover notes, ticks [Acknowledged], enters PIN → MODAL-10.

---

### Flow G — OEE Drill-Down

1. Prod Manager views PROD-006 OEE dashboard. Overall OEE: 74.8% (below 85% target). `kpi.amber` card.
2. Clicks [Drill Down] on OEE trend chart → navigates to `/production/lines/LINE-02` (PROD-013).
3. LINE-02 OEE: A=65%, P=82%, Q=98%. OEE=52.3%. Low Availability is the dominant issue.
4. Downtime section shows: "168 min breakdown (mixer M-002)." Category: Plant/Machine Fault.
5. [View Downtime] link → PROD-007 filtered to LINE-02. Pareto: Breakdown 80% of downtime on this line.
6. Prod Manager exports analysis CSV and shares with maintenance team.

---

### Flow H — QA Hold (in-process sample fails)

1. QA Inspector (09-QUALITY module) performs in-process inspection on output LP-3002. Result: FAIL.
2. `wo_outputs.qa_status` updated to HOLD by 09-QUALITY.
3. PROD-001 dashboard KPI card "QA Holds" increments. `.badge-red` "1 active hold."
4. PROD-002 WO detail Output tab shows LP-3002 row with `.badge-red` "QA Hold." `.alert-amber` banner: "Output LP-3002 on QA Hold — production can continue but WO cannot complete until hold is resolved."
5. WO auto-PAUSE is triggered if `wo_outputs.qa_status=HOLD` AND QA policy flag `qa_hold_pauses_wo=true` in 09-QUALITY (configurable cross-module).
6. Shift Lead sees PAUSED badge on PROD-001. Clicks [View WO]. Contacts QA Inspector.
7. QA Inspector updates qa_status to PASSED or FAILED (quarantine). PROD-002 output row badge updates.
8. If resolved to PASSED: WO resumes. If FAILED: LP quarantined, by-product waste record created, yield gate recalculates.

---

## 6. Empty / zero / onboarding states

**Production Dashboard (PROD-001) — no WOs ever created:**
Full-page illustration (factory icon). Heading: "Welcome to Production." Body: "No work orders have been started yet. Begin by releasing a work order from the Planning module." Two CTA buttons: [Go to Planning] and [View Production Guide]. Tip card: "Work orders are created in Planning and released to Production when materials are available."

**WO List — no WOs in READY state:**
Table empty state: "No work orders ready to start. Released WOs from Planning will appear here." [Go to Planning Queue] button.

**Consumption panel — no consumptions yet:**
Icon of scanning action. "No materials consumed yet. Use the handheld scanner (SCN-080) to consume materials, or use the deep-link below to open the scanner flow." Scanner deep-link card shown.

**Output panel — no outputs registered:**
Icon of pallet/box. "No outputs registered yet. Register primary output when production begins." [Register Output] button + scanner deep-link.

**Downtime tracking — no events in period:**
Success illustration. "No downtime recorded in this period. All lines ran without interruption." (Green positive tone.)

**OEE dashboard — no data:**
"OEE data is collected every 60 seconds during active production. Start a work order to begin accumulating OEE data." [Start WO] CTA.

**Shift management — no active shift:**
"No shift is currently active. Define shift patterns in Settings to enable shift-based tracking." [Configure Shifts] CTA.

**Analytics — no data in period:**
"No production data available for the selected filters. Try expanding the date range or adjusting the filters." Chart areas show skeleton placeholder with tooltip "Awaiting data."

**D365 DLQ — empty queue (all delivered):**
Green banner: "✓ All WO confirmations have been successfully delivered to D365. No outstanding items." Stats showing last delivery timestamp.

**Allergen changeover gate — first-time use:**
Info card: "This is the allergen changeover gate. It ensures that allergens are fully cleaned from the production line before a new allergen profile is introduced. Complete all steps to unlock the work order."

---

## 7. Notifications, toasts, alerts

### Toast system

Toasts appear in the top-right corner, stack vertically, auto-dismiss after 5 seconds (error toasts persist until dismissed). Four variants:

- **Success** (green left border): "WO-XXXX started on LINE-01." / "WO-XXXX completed. D365 push enqueued." / "Changeover validation complete." / "Settings saved."
- **Warning** (amber left border): "FEFO deviation recorded on [component]. Reason required." / "Over-consumption detected. Shift Lead approval required." / "Catch-weight variance X% — exceeds tolerance." / "Yield gate: variance X% — Prod Manager review required."
- **Error** (red left border, persistent): "Failed to start WO-XXXX: LINE-01 is already in use." / "WO completion blocked: closed_production_strict gate failure — X items short." / "D365 push failed. Event queued for retry." / "Allergen gate violation — segregated pair detected."
- **Info** (blue left border): "D365 push enqueued for WO-XXXX." / "OEE aggregation job running." / "Shift handover notes saved." / "Label PDF generated."

### Alert banners (inline, full-page-width)

These appear at the top of the relevant screen and persist until resolved:

| Condition | Severity | Banner text | Actions |
|---|---|---|---|
| Downtime ≥ configured target (per line) | Red | "LINE-XX has exceeded [N min] downtime threshold today. Investigate immediately." | [View Downtime] |
| OEE below target for current shift | Amber | "OEE on [LINE-XX] is [N%] — below [85%] target. Investigate top contributor." | [View OEE] [Log Downtime] |
| QA Hold on active WO output | Amber | "QA Hold on output [LP-XXXX] for WO-XXXX. WO [paused/continue pending resolution]." | [View QA Result] |
| Closed_production_strict gate failure | Red | "WO cannot complete — [N] components short and/or [N] outputs missing." | [View WO Detail] |
| Allergen gate blocked | Red | "WO-XXXX blocked by allergen changeover gate. Complete validation to proceed." | [Go to Changeover] |
| D365 DLQ depth > 10 | Red | "D365 integration alert: [N] events in dead-letter queue. Ops team notified." | [View DLQ] |
| D365 push latency P95 > 10 min | Amber | "D365 push is delayed. Events are queuing. Check integration status." | [View DLQ] |
| Waste > threshold (5% default) per WO | Amber | "Waste on WO-XXXX exceeds [5%] threshold. Shift Lead approval required." | [Approve Waste] |
| Over-consumption pending approval | Amber | "Over-consumption on WO-XXXX awaiting Shift Lead approval." | [Approve] |
| Allergen gate override used | Red | "Allergen changeover gate override used on WO-XXXX. Prod Manager and QA notified." | [View Audit] |
| Closed_production_strict override used | Red | "Closed-production override applied on WO-XXXX by [user]. Audit record created." | [View Audit] |
| WO 2h+ beyond planned_end without completion | Amber | "WO-XXXX is [X] hours past planned completion. Escalate to Production Manager." | [View WO] |

### Notification centre

A bell icon in the top nav bar shows an unread count badge. Clicking opens a side panel listing all notifications grouped by today / earlier. Each notification links to the relevant screen. "Mark all read" button. Notifications are generated server-side from alert conditions and pushed via polling (WebSocket P2).

---

## 8. Responsive notes

**Desktop primary (≥ 1024px):** All screens designed for desktop as the primary viewport. Sidebar 220px fixed. Main content left-margin 220px. Tables full-width with all columns visible. KPI rows show 5–6 cards in a single row. Charts full-width within card.

**Kiosk mode (10" landscape, 1024 × 600 or similar) [KIOSK]:**
Applied to PROD-001 (line dashboard), PROD-002 (WO execution), PROD-003 (consumption), and PROD-004 (output). Overrides: base font-size 16px, sidebar collapsed to icon-only strip (40px wide) or hidden with a hamburger menu. All tap targets minimum 64 × 64px. Button labels shortened if needed ("Start" instead of "Start WO"). No hover states (touch-primary). Forms use full-width inputs. Modals are full-screen (not 560px wide). Auto-refresh set to 10s for kiosk. Touch-swipe to switch between WO tabs.

**Tablet (768–1024px):** KPI cards wrap to 2×3 grid. Tables condensed (hide low-priority columns, add horizontal scroll). Per-line cards in 2-column grid. Modal still 560px.

**Mobile (< 768px):** Not a primary target for this module. A responsive fallback exists: sidebar becomes a full-screen overlay. Tables become card-list layout. KPI cards stack vertically. Action buttons go to a bottom fixed action bar. Modals full-screen. Note in code: "Mobile layout is fallback only; recommend scanner PWA (06-SCANNER) for operators on mobile."

**Print / PDF reports:** All analytics charts include a "Print" button that applies `@media print` styles: sidebar hidden, charts full-width, KPI cards in 2-column print layout.

---

## 9. Open questions for designer

1. **Line card layout density**: With 5 Apex production lines, should the PROD-001 per-line grid be 2×3 (2 columns, 3 rows) or a single-row carousel? The 2×3 layout is recommended but confirm with product team.

2. **OEE gauge style**: Should the OEE component cards (A, P, Q) use circular radial gauges (as in PROD-008 archive), simple percentage text with a coloured bar, or donut charts? PRD does not prescribe; archive used circles.

3. **Catch-weight entry UX — 3103 vs 3922**: On the desktop (PROD-004), the mode toggle switches the table structure. Confirm whether the toggle is per-LP or per-WO. PRD §D13 says mode is per `items.weight_mode` field — it is per item, not configurable at runtime.

4. **Allergen changeover gate — photo capture slots**: PROD-005 cleaning checklist steps have photo upload slots greyed as "Phase 2." The designer should render them as dimmed placeholder fields with a Phase 2 badge to communicate the future feature without confusion.

5. **Shift handover digital form (P2 note)**: PROD-008 currently uses a free-text textarea. The PRD flags a structured digital form as P2. Designer should build the textarea now but leave a clearly labelled "Phase 2: Structured handover form" expansion placeholder.

6. **D365 DLQ screen placement**: PROD-012 is routed under `/admin/integrations/d365/dlq`. Should it also appear as a link in the Production sidebar (visible to Prod Manager)? Recommended: yes, a sidebar sub-item "Integrations" under Production linking here.

7. **Meat_Pct display precision**: How many decimal places? Recommend 2 (e.g., "72.41%"). Confirm with 03-TECHNICAL team.

8. **WO state machine badge colours**: The status badge mapping above (§1) reflects current v1 DSL states. If the rule registry in 02-SETTINGS overrides state labels (e.g., a tenant labels "IN_PROGRESS" as "Running"), the badge label must use the registry-provided `transition_label` field, not the hardcoded string. The designer should use a data-binding placeholder (e.g., `{{state.label}}`) rather than hardcoded strings on all status badges.

9. **OEE ideal_cycle_time source** (OQ-PROD-06): Currently from `items.ideal_cycle_time_sec` (03-TECHNICAL). If per-line calibration is needed (configurable), the Performance formula input will need a per-line override field in PROD-011 Settings. Leave a placeholder input field greyed "Per-line calibration — Phase 2."

10. **QA hold auto-pause WO** (cross-module): The auto-pause trigger is governed by a 09-QUALITY setting (`qa_hold_pauses_wo`). On PROD-002 WO detail, if the WO is PAUSED with `source='qa_hold'`, the pause badge should show "QA Hold" (amber) rather than the standard pause label. Confirm with 09-QUALITY UX spec.

---

*End of 08-PRODUCTION-UX.md v1.0*
