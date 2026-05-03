# 11-SHIPPING — UX Specification (for prototype generation)

**Version:** 1.0 | **Date:** 2026-04-20 | **PRD Source:** 11-SHIPPING-PRD v3.0 | **Status:** Ready for prototype

---

## 0. Module Overview

Module 11-SHIPPING covers the complete order-to-delivery cycle for finished goods (FA) in a multi-tenant food-manufacturing MES. The module lifecycle flows as: Customer master → Sales Order (SO) → Allergen validation → Inventory allocation (LP-based FEFO/FIFO) → Pick list generation (wave/zone/batch) → Picking (scanner + desktop) → Packing station → SSCC-18 label generation → Packing slip → Bill of Lading → Ship confirmation → Delivery tracking → RMA.

**Personas and primary devices:**
- Shipping Coordinator (shipping_sales): Desktop — creates customers, SOs, monitors status
- Warehouse Manager (shipping_manager): Desktop — allocation wizard, wave builder, overrides
- Picker (shipping_operator): Zebra TC52 scanner — consumes 06-SCANNER-P1 pick workflow
- Packer (shipping_operator): Desktop workbench + scanner — packing station
- Dispatcher (shipping_manager): Desktop — BOL, ship confirmation, carrier handoff
- QA Lead (shipping_qa): Desktop — allergen override, RMA disposition, hold release
- Credit Control: Desktop — credit limit review, hold release
- Admin (shipping_admin): Desktop — D365 constants, carrier configs, rule registry

**Key integrations (explicit):**
- 05-WAREHOUSE: LP state machine, hard-lock reservation on SO allocate, release on cancel/ship
- 09-QUALITY: Allergen restrictions cascade (03-TECH allergen_cascade_v1), batch_release_gate_v1 (P2), quality_hold events
- 06-SCANNER-P1: Pick workflow (SCN-040), Pack workflow (SCN-050), Return receive (SCN-072) — scanner screens NOT duplicated here
- 10-FINANCE: Revenue recognition event on ship (P2 COGS consumer)
- 02-SETTINGS: SO state machine rule (so_state_machine_v1), FEFO rule (fefo_strategy_v1), D365 constants (FNOR/ApexDG/FinGoods/APX100048), reference tables (shipping_override_reasons, rma_reason_codes)
- 03-TECHNICAL: product.allergens JSONB (allergen_cascade_v1), default_sell_price, GS1 prefixes, catch weight
- D365 External: shipment.confirmed push via outbox (stage 3, R14/R15, async retry)

---

## 1. Design System (Inherited)

### 1.1 Core Tokens

All values referenced from MONOPILOT-SITEMAP.html root variables:

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active nav, links |
| `--green` | `#22c55e` | Success states, allocated badge |
| `--amber` | `#f59e0b` | Warning states, short/partial badges |
| `--red` | `#ef4444` | Error states, held/blocked badges |
| `--info` | `#3b82f6` | Informational alerts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Dark sidebar background |
| `--card` | `#fff` | Card backgrounds |
| `--text` | `#1e293b` | Primary text |
| `--muted` | `#64748b` | Secondary text, labels |
| `--border` | `#e2e8f0` | Table lines, card borders |
| `--radius` | `6px` | Card and button border-radius |

### 1.2 Typography

Inter font family, `system-ui` fallback. Body 14px / line-height 1.4. Page titles 20px bold. Section headings 14px semibold. Table headers 12px semibold muted. Monospace for LP numbers, SSCC, route codes.

### 1.3 Component Library

**KPI cards:** White background, 1px `--border`, `--radius`, 12px label (muted), 26px value bold, 11px change note. Bottom border 3px color-coded (blue/green/amber/red).

**Tables:** `border-collapse`, 13px body, 8px/10px cell padding. `th` background `#f8fafc`, 2px bottom border. `tr:hover` background `#f8fafc`.

**Badges:** `display:inline-block`, 2px/8px padding, 10px border-radius, 11px font semibold.

**Buttons:** 6px/14px padding, 4px radius. `.btn-primary` blue fill. `.btn-secondary` white + border. `.btn-danger` red fill. `.btn-success` green fill.

**Modals:** 560px wide, 8px radius, 50% backdrop, max-height 80vh overflow-y auto, 20px padding.

**Tabs:** flex row, `--border` 2px bottom, active tab blue underline 2px.

**Alerts:** left 4px border, 10px/14px padding, 12px font. Red/amber/blue/green variants.

**Kanban:** flex row, gap 12px, overflow-x auto. Column min-width 180px, `#f8fafc` background, 6px radius. Cards white, 1px border, 4px radius, 8px padding.

**Scanner cards:** white, 2px border, 8px radius, centered content, hover blue border + shadow.

### 1.4 Shipping Badge Palette

| Status | CSS class | Background | Text | Usage |
|---|---|---|---|---|
| Draft | `.badge-gray` | `#f1f5f9` | `#475569` | SO not yet confirmed |
| Confirmed | `.badge-blue` | `#dbeafe` | `#1e40af` | SO locked, awaiting alloc |
| Allocated | `.badge-allocated` | `#dcfce7` | `#166534` | LPs reserved (green) |
| Short | `.badge-short` | `#fef3c7` | `#92400e` | Partial/insufficient qty (amber) |
| Held | `.badge-held` | `#fee2e2` | `#991b1b` | Credit/QA/allergen hold (red) |
| Picking | `.badge-amber` | `#fef3c7` | `#b45309` | Pick in progress |
| Packing | `.badge-packing` | `#fff7ed` | `#9a3412` | Pack in progress |
| Packed | `.badge-blue` | `#dbeafe` | `#1976D2` | All boxes closed |
| Shipped | `.badge-shipped` | `#e0e7ff` | `#3730a3` | Manifested + confirmed (indigo) |
| Delivered | `.badge-gray` filled | `#e2e8f0` | `#1e293b` | POD received (gray filled) |
| Cancelled | `badge-red` | `#fee2e2` | `#991b1b` | Cancelled + released |

---

## 2. Information Architecture

### 2.1 Sidebar Entry

Sidebar group: **QA & SHIPPING** (per MONOPILOT-SITEMAP). Entry: icon truck (`🚚`), label **Shipping**, ID `shipping`. When active: background `#1e3a5f`, white text, `--blue` left border 3px. Sidebar sub-items expand on click.

Sub-items:
- Dashboard
- Customers
- Sales Orders
- Allocations
- Pick Lists
- Wave
- Packing
- SSCC
- Documents
- Carriers
- Settings

### 2.2 Route Map

| Route | Screen |
|---|---|
| `/shipping` | Shipping Dashboard |
| `/shipping/customers` | Customer List |
| `/shipping/customers/:id` | Customer Detail |
| `/shipping/sos` | Sales Order List |
| `/shipping/sos/new` | SO Create Wizard |
| `/shipping/sos/:id` | SO Detail |
| `/shipping/allocations` | Allocation view (per SO or global) |
| `/shipping/picks` | Pick List List |
| `/shipping/picks/wave` | Wave Picking Builder |
| `/shipping/picks/:id` | Pick Detail (desktop supervisor view) |
| `/shipping/packing` | Packing Station Selector |
| `/shipping/packing/:station` | Packing Station — specific station |
| `/shipping/sscc` | SSCC Labels queue |
| `/shipping/docs` | Documents hub (packing slips + BOLs) |
| `/shipping/docs/:shipmentId/slip` | Packing Slip preview |
| `/shipping/docs/:shipmentId/bol` | Bill of Lading preview |
| `/shipping/carriers` | Carrier configurations |
| `/shipping/settings` | Shipping module settings |
| `/scanner/shipping/pick` | Pick scanner (→ 06-SCANNER-P1) |
| `/scanner/shipping/pack` | Pack scanner (→ 06-SCANNER-P1) |
| `/scanner/shipping/return` | Return receiving scanner (→ 06-SCANNER-P1) |

### 2.3 Permissions Matrix

| Action | coordinator (sales) | picker (operator) | packer (operator) | dispatcher (manager) | qa | credit-control | admin |
|---|---|---|---|---|---|---|---|
| View dashboard | Yes | No | No | Yes | Yes (read) | Yes (read) | Yes |
| Customer CRUD | Yes | No | No | Yes | No | No | Yes |
| SO create/edit draft | Yes | No | No | Yes | No | No | Yes |
| SO confirm | Yes | No | No | Yes | No | No | Yes |
| Place / release hold | No | No | No | Yes (manual) | Yes (QA/allergen) | Yes (credit) | Yes |
| Cancel SO | No | No | No | Yes | No | No | Yes |
| Allocate | No | No | No | Yes | No | No | Yes |
| FEFO override | No | No | No | Yes | No | No | Yes |
| QA hold override | No | No | No | No | Yes | No | Yes |
| Wave build / release | No | No | No | Yes | No | No | Yes |
| Pick (scanner) | No | Yes | No | Yes | No | No | Yes |
| Pack (desktop) | No | No | Yes | Yes | No | No | Yes |
| SSCC generate | No | No | Yes | Yes | No | No | Yes |
| BOL generate + sign | No | No | No | Yes | No | No | Yes |
| Ship confirm | No | No | No | Yes | No | No | Yes |
| RMA create | Yes | No | No | Yes | Yes | No | Yes |
| RMA disposition | No | No | No | No | Yes | No | Yes |
| Carrier config | No | No | No | No | No | No | Yes |
| Shipping settings | No | No | No | No | No | No | Yes |

---

## 3. Screens

---

### SHIP-022 — Shipping Dashboard

**Route:** `/shipping`
**Purpose:** Real-time operations command centre. Shipping managers and plant directors monitor KPIs, identify bottlenecks, drill into problem areas.
**Persona:** Shipping Manager (primary), Plant Director (read-only), QA Lead (hold alerts).

**Layout:**
The page has a standard page header bar (breadcrumb "Shipping / Dashboard", auto-refresh toggle "30s ON/OFF", date-range selector). Below the header sit two rows of four KPI cards each. Below the cards is a full-width Alerts panel. Below alerts are three side-by-side charts (Orders by Status horizontal bar, Shipments by Day line, On-Time % trend line). At the bottom is a Recent Activity feed (timeline items) and a Quick Actions bar.

**KPI Cards — Row 1 (color accent):**

| Card | Value source | Color accent | Target label | Click action |
|---|---|---|---|---|
| SOs Today (all non-cancelled) | `COUNT(sales_orders WHERE order_date=today)` | blue | — | → `/shipping/sos?date=today` |
| Open Allocations (confirmed but not yet fully allocated) | `COUNT(sales_orders WHERE status='confirmed' AND quantity_allocated < quantity_ordered)` | amber | Resolve | → `/shipping/allocations` |
| Short Picks (pick_list_lines with status='short') | `COUNT(pick_list_lines WHERE status='short' AND date=today)` | red | Resolve | → `/shipping/picks?short=true` |
| Pending Packs (shipments in packing status) | `COUNT(shipments WHERE status='packing')` | amber | — | → `/shipping/packing` |

**KPI Cards — Row 2:**

| Card | Value source | Color accent | Target |
|---|---|---|---|
| SSCC Labels Queued (generated but not printed) | `COUNT(shipment_boxes WHERE sscc IS NOT NULL AND printed_at IS NULL)` | blue | Print |
| BOLs Pending Signature | `COUNT(shipments WHERE bol_pdf_url IS NOT NULL AND bol_signed_pdf_url IS NULL AND status='manifested')` | amber | Upload |
| On-Time Ship % (30-day rolling) | `COUNT(shipped_at <= promised_ship_date) / COUNT(shipped_at IS NOT NULL) * 100` | green if >95, amber 90-95, red <90 | >95% |
| Fulfillment Rate (today) | `SUM(qty_shipped) / SUM(qty_ordered) * 100` for today | green | >95% |

**Alerts Panel:**
Full-width card with heading "Alerts". Three alert zones rendered as a three-column grid of alert cards: Critical (red border-left), Warning (amber), Info (blue). Each alert card shows count badge, title, up to 3 sub-items with entity link and suggested action button. "View all" link navigates to filtered list. Alert types: allergen hold (links to SO with hold), credit hold, SSCC printer offline (links to `/shipping/settings`), BOL pending signature, short pick requiring decision, D365 outbox DLQ item.

**Charts:**
Three side-by-side cards using the `grid-3` layout class. Left card: horizontal stacked bar "Orders by Status" — one bar per status from draft to delivered, proportional widths. Middle card: line chart "Shipments by Day" — 7 data points, x-axis days, y-axis count. Right card: line chart "OTD % — 30 days" — percentage trend, reference line at 95%.

**Recent Activity Timeline:**
Timeline-style list (`.tl-item` pattern). Each item has a colored dot (green = shipped/completed, blue = confirmed/allocated, amber = warning, red = error), timestamp relative ("10 min ago"), entity reference (SO/pick list/shipment number), actor user, and a link. "View full log" links to audit log.

**Quick Actions Bar:**
Horizontal row of `.btn-secondary` buttons: "Create SO", "Build Wave", "Open Packing", "Print SSCC Queue", "Upload Signed BOL".

**States:**
- Loading: Skeleton cards in all eight KPI positions, skeleton shimmer on charts, "Loading dashboard..." text.
- Empty (no data for selected date): Icon, "No shipping activity for selected period", CTA "Create Sales Order", "Change date range".
- Error: Red alert banner with error code SHIP-DASHBOARD-001, "Retry" button, stale data shown with "Stale data as of [time]" warning overlay on each card.
- Permission-denied (viewer for picks): Individual KPI cards with metrics unavailable to that role show gray placeholder and tooltip "Contact your manager".

**Microcopy:**
- Auto-refresh toggle: "Auto-refresh: 30s" / "Paused"
- KPI trend: "↑ 3 since yesterday" / "↓ 2%"
- Alert: "2 SOs on allergen hold — review before confirming" / "SSCC printer ZPL-01 offline — check connection"

---

### SHIP-001 — Customer List

**Route:** `/shipping/customers`
**Purpose:** Browse, search, filter, and manage customer master records.
**Persona:** Shipping Coordinator, Manager.

**Layout:**
Page header with breadcrumb, search input (placeholder "Search by name, code, or address…"), and Filters dropdown button. Below header: four KPI summary cards (Total Customers, Active, Inactive, New This Month). Below cards: action bar with "Create Customer" primary button and "Import CSV" secondary. Filter chips row (applied filters as removable tags). Full-width data table with pagination.

**Table Columns:**

| Column | Field | Type | Example | Notes |
|---|---|---|---|---|
| Checkbox | — | select | — | Multi-select for bulk actions |
| Name | `customers.name` | text link | Acme Foods Inc. | Clickable → `/shipping/customers/:id` |
| Code | `customers.customer_code` | monospace | CUST-001 | Unique per org |
| Channel/Category | `customers.category` | badge | Wholesale / Retail / Distributor | |
| Credit Limit | `customers.credit_limit` | currency | £50,000 | P2 field; show "—" if null |
| Payment Terms | `customers.payment_terms_days` | text | Net 30 | |
| Allergen Profile | `customers.allergen_restrictions` | icon+count | "3 restrictions" link | Links to allergen tab |
| Status | `customers.is_active` | badge | Active (green) / Inactive (gray) | |
| Actions | — | buttons | View / Edit / ⋮ | |

**Row overflow menu:** View Orders, Manage Addresses, Manage Allergens, Duplicate, Deactivate, Export Profile.

**Bulk actions bar (visible when rows selected):** Activate, Deactivate, Export CSV.

**Filters:**
- Status: All / Active / Inactive
- Category: All / Retail / Wholesale / Distributor
- Payment Terms: All / 7 / 15 / 30 / 45 / 60 / 90 days
- Credit Status (P2): All / Within Limit / At Risk / Exceeded

**States:**
- Loading: 8 skeleton rows with animated shimmer.
- Empty (no customers): Large icon, "No customers yet", "Create Your First Customer" CTA, quick-tips bullets.
- Filtered empty: "No customers match your filters", "Clear All Filters" CTA.
- Error: Warning icon, "Failed to load customers", error code, Retry + Contact Support buttons.
- Permission-denied: Read-only table, Create/Edit/Delete buttons hidden.

**Modals triggered:** Customer Create/Edit (→ Section 4), Delete confirmation.

**Microcopy:** Empty state tip: "Set allergen restrictions per customer to automatically flag conflicts on new orders."

---

### SHIP-002 — Customer Detail

**Route:** `/shipping/customers/:id`
**Purpose:** Full customer profile with tabs for sub-entities and order history.

**Layout:**
Page header with customer name as h1, breadcrumb "Shipping / Customers / Acme Foods Inc.", status badge, and action buttons "Edit" and "⋮" overflow. Below header: tab bar with six tabs.

**Tabs:**

**Profile tab:** Two-column form-display (read-only fields with Edit button opening modal). Fields: Customer Code, Full Name, Trading Name, Email, Phone, Tax ID (VAT/EIN), Category, Credit Limit (P2), Payment Terms (days), GS1 GLN (P2), Notes, is_active toggle, Created at / Updated at.

**Addresses tab:** Table of all `customer_addresses` rows. Columns: Type (Billing/Shipping badge), Default (checkmark), Address Line 1, City, Postal Code, Country, Dock Hours (JSONB displayed as "Mon-Fri 08:00-17:00"). Actions: Edit, Set Default, Delete. "Add Address" primary button opens Address modal.

**Allergens tab:** Per-customer allergen restrictions management. Two-column grid: left column shows the 14 EU allergens as a matrix with checkboxes for "Customer refuses — do not ship" and "Declare required — must label". Right column shows derived "Allergen conflict check" linking to 09-QUALITY allergen profile. Banner: "Conflicts with this customer's restrictions will block SO confirmation unless overridden by shipping_qa role." Link to allergen cascade rule `allergen_cascade_v1` in 02-SETTINGS §7 (read-only). "Save Restrictions" button at bottom.

**Pricing tab:** Table of `customer_pricing_agreements` (P2, shown as "Coming in Phase 2"). P1 fallback: "Unit prices default to `products.default_sell_price` from 03-TECHNICAL."

**Credit tab:** Credit Limit field (P2), current balance used (P2), payment terms, credit status badge. Banner: "Credit hold configuration is Phase 2. P1: warning-only, no automatic block." Link to credit hold release flow.

**History tab:** Paginated table of all `sales_orders` for this customer. Columns: SO#, Order Date, Status badge, Total (GBP), Ship Date. Click row → `/shipping/sos/:id`.

**States:** Loading skeleton per tab content. Error per-tab retry. Empty address/allergen tabs show "Add your first record" CTA.

---

### SHIP-003 — Shipping Addresses

**Route:** Embedded in `/shipping/customers/:id` (Addresses tab) and via modal.
**Purpose:** Manage per-customer billing and shipping addresses.

**Address List (within Customer Detail Addresses tab):**

Table columns: Type badge (Billing blue / Shipping green), Default star, Address Line 1, City, State/County, Postal Code, Country ISO-2, Dock Hours summary, Notes truncated, Actions (Edit / Set Default / Delete).

**Add/Edit Address Modal (560px):**
Triggered from "Add Address" button or row Edit. Fields:
- Address Type: select (Billing / Shipping) — required
- Is Default: checkbox
- Address Line 1: text, required, max 100 chars
- Address Line 2: text, optional
- City: text, required
- County/State: text
- Postal Code: text, required
- Country: select (ISO-2 dropdown, default GB)
- Dock Hours: text/JSONB, placeholder "Mon-Fri 08:00-17:00", stored as freeform JSON
- Notes: textarea

**Validation:** At least one shipping-type address required before SO confirmation (V-SHIP-SO-02). Default address auto-selected for new SOs.

**States:** Empty list: "No addresses yet — add a shipping address to create sales orders." Error saving: inline field validation + toast.

---

### SHIP-004 — Allergen Restrictions per Customer

**Route:** Embedded in `/shipping/customers/:id` (Allergens tab) and modal.
**Purpose:** Configure which allergens the customer refuses or requires declared. Cross-module linkage to 09-QUALITY and 03-TECHNICAL.

**Layout:**
Full-width card with heading "Allergen Restrictions — Acme Foods Inc." Two sections separated by a divider.

**Section 1: Refuses (Do Not Ship):**
Grid of 14 EU allergen toggles + any custom allergens defined in 02-SETTINGS. Each toggle shows allergen icon/name and ON/OFF state. When ON (refuses): if any SO line for this customer contains that allergen in `products.allergens` (from 03-TECH allergen_cascade_v1 rule), SO confirmation is blocked until shipping_qa override.

**Section 2: Requires Declared (Must Label):**
Same 14 EU allergen grid. When ON: allergen must appear bold on packing slip and BOL per EU 1169/2011 (D-SHP-15), even if product "may contain" threshold.

**Integration callout box:**
Blue alert box: "Allergen data flows: product.allergens (03-TECHNICAL §10) → allergen_cascade_v1 rule (02-SETTINGS §7) → customer.allergen_restrictions (this screen) → SO confirm validation (D-SHP-5) → packing slip/BOL labelling (D-SHP-15). Changes here take effect on next SO confirmation."

**Conflict preview:**
Below the toggles, a read-only "Current open SOs with conflicts" table showing any confirmed/draft SOs for this customer where allergen restrictions conflict. Columns: SO#, Product, Allergen, Status (Blocked / Overridden).

**Save button:** "Save Allergen Restrictions" — `.btn-primary`. Audit log entry created on save.

**States:** Loading: skeleton grid. Error saving: toast "Failed to save allergen restrictions — try again." Empty (no restrictions set): informational note "No restrictions set — all products may ship to this customer."

---

### SHIP-005 — Sales Order List

**Route:** `/shipping/sos`
**Purpose:** Overview and management of all sales orders across all lifecycle stages.
**Persona:** Shipping Coordinator, Manager.

**Layout:**
Page header, search bar (placeholder "Search SO#, customer, customer PO…"), Filters button. Below header: five status-count summary chips (Draft, Confirmed, Picking, Packing, Shipped) acting as quick-filter toggles. Action bar: "Create SO" primary, "Export" secondary, bulk action bar (visible when rows selected). Full-width data table with pagination. Footer: backorder count alert.

**Table Columns:**

| Column | Field | Type | Example |
|---|---|---|---|
| Checkbox | — | select | — |
| SO# | `sales_orders.order_number` | link | SO-2026-00123 |
| Customer | `customers.name` | link | Acme Foods Inc. |
| Customer PO | `sales_orders.customer_po` | text | PO-2025-1234 |
| Status | `sales_orders.status` | badge | Allocated (green) |
| Target Ship | `sales_orders.promised_ship_date` | date | 2026-04-22 |
| Alloc % | computed | progress text | 5/5 (100%) |
| Hold Flags | computed | icon badges | QA / Credit / Allergen |
| Total | `sales_orders.total_amount_gbp` | currency | £1,250.00 |
| Actions | — | buttons | View / Edit / ⋮ |

**Hold flags rendering:** Each active hold displays a small colored dot badge: red for QA hold, amber for credit, orange for allergen, gray for manual. Tooltip on hover shows hold reason.

**Bulk actions:** Allocate, Generate Pick List, Cancel, Export CSV.

**Filters:**
- Status: checkboxes for all 8 statuses
- Customer: autocomplete dropdown
- Date Range: from/to date picker, default last 30 days
- Hold: All / On hold / Clear

**Row overflow menu:** Allocate, Generate Pick List, View Allocation, View Picks, View Shipments, Cancel, Duplicate, Print Packing Slip.

**Footer alert bar:** "12 backorders pending — click to review allocation shortfalls."

**States:** Loading skeletons, empty state with SO creation CTA, filtered empty with "Clear Filters" CTA, error with Retry button.

**Microcopy:** Hold badge tooltip: "Credit hold placed 2026-04-19 by Jane Smith — credit_control can release."

---

### SHIP-006 — Sales Order Create Wizard

**Route:** `/shipping/sos/new`
**Purpose:** Four-step wizard to create a new SO with allergen validation before confirmation.

**Layout:**
Full-page wizard with step indicator at top showing four steps. Content area is a 640px centered card. Navigation: "Back" secondary / "Next" primary / "Create Draft" on final step.

**Step 1 — Header:**
- Customer: required select with search. On select, auto-fill Shipping Address from customer's default. Show allergen restriction count badge next to selected customer ("3 allergen restrictions").
- Customer PO: text, optional, max 50 chars
- Order Date: date, required, defaults today
- Promised Ship Date: date, required, must be >= order_date (V-SHIP-SO-04)
- Required Delivery Date: date, optional, must be >= promised_ship_date
- Shipping Address: select from `customer_addresses` where type='shipping'. "Add new address" link opens Address modal inline.
- Notes: textarea, optional

**Step 2 — Lines:**
Dynamic line table. Columns: Line#, Product (search dropdown), Qty Ordered (number, >0), Unit Price (number, auto-filled from `products.default_sell_price`, editable), Line Total (calculated read-only), Notes, Delete. "Add Line" button appends row. Minimum 1 line required (V-SHIP-SO-05). At least 1 unit price > 0 required (V-SHIP-SO-06). Running total shown at bottom.

**Step 3 — Allergen Review:**
System runs allergen check: `customer.allergen_restrictions` vs each line's `product.allergens` (via allergen_cascade_v1 from 03-TECH). Results shown as a table: Line, Product, Customer Restriction, Conflict (Yes/No). If any conflict: red alert "Allergen conflict detected — this SO cannot be confirmed until reviewed. A shipping_qa override with reason code is required." If no conflict: green "All products clear for this customer's allergen profile." This step is read-only — no editing. "Acknowledge" checkbox required to proceed if conflicts found.

**Step 4 — Review:**
Summary card: customer name, ship date, line count, total GBP, allergen status, shipping address. "Create Draft SO" button creates record with status='draft'. Success → redirect to `/shipping/sos/:id`.

**Validation:** At each step, Next button disabled until required fields valid. Error messages appear inline below each field. Validation rules V-SHIP-SO-01 through V-SHIP-SO-06 enforced.

**States:** Step loading: spinner inside step card. Create error: red alert at top of step 4 with error detail. Auto-allocation (if org setting `auto_allocate_on_confirm=true`): after creation, toast "Draft created — confirm to trigger auto-allocation."

---

### SHIP-007 — Sales Order Detail

**Route:** `/shipping/sos/:id`
**Purpose:** Full lifecycle view of a single SO with all sub-entity tabs.
**Persona:** All desktop roles depending on tab.

**Layout:**
Page header: SO number (SO-2026-00123) as h1, customer name subtitle, status badge (large), promised ship date, hold flag badges row. Action buttons: "Confirm" (if draft), "Allocate" (if confirmed), "Cancel" (if not shipped), "Print" dropdown, "⋮" overflow. Below header: tab bar with seven tabs.

**Tabs:**

**Lines tab:** Table of `sales_order_lines`. Columns: Line#, Product (link to 03-TECHNICAL product detail), Qty Ordered, Qty Allocated (colored: green=full, amber=partial, red=none), Qty Picked, Qty Packed, Qty Shipped, Unit Price, Line Total, Allergen flag icon. Row edit button (draft only). "Add Line" button (draft only).

**Allocation tab:** Per-line allocation detail. For each line: section header with product name and quantities. Sub-table: LP#, Location, Batch, Expiry Date, Qty Allocated, QA Status badge, FEFO rank. "Allocate" button triggers wizard. "Release All" button with confirmation. FEFO rule sourced from `fefo_strategy_v1` in 02-SETTINGS §7 — tooltip link. If LP has QA hold: amber badge with severity + "Override available" link.

**Holds tab:** Table of all holds placed/released on this SO. Columns: Hold Type (Credit/QA/Allergen/Manual), Placed By, Placed At, Status (Active/Released), Released By, Released At, Reason Code. "Place Hold" button. "Release Hold" button (role-dependent).

**Picks tab:** Table of `pick_lists` associated with this SO. Columns: Pick List#, Type (single/wave), Status badge, Priority, Assigned To, Started At, Completed At, Lines Picked/Total. "Generate Pick List" button. Click row → `/shipping/picks/:id`.

**Packs tab:** Table of `shipments` and their boxes. Hierarchical display: Shipment row (SH-YYYY-NNNNN, status, total boxes, total weight) expandable to box sub-rows (Box#, SSCC, Weight, Contents summary). "Open Packing Station" button → `/shipping/packing/:station`.

**Documents tab:** Two sub-sections. Packing Slips: list of generated slips with Preview / Reprint buttons. Bills of Lading: list of generated BOLs with Preview / Print / Upload Signed buttons. Both sections link to `/shipping/docs/:shipmentId/slip` and `/shipping/docs/:shipmentId/bol`.

**History tab:** Paginated audit log from `shipping_audit_log` for this SO. Columns: Timestamp, User, Action, Old Value summary, New Value summary, Reason. Sourced from PG audit triggers (D-SHP-11).

**States:** Loading per tab. Error per tab with retry. Permission-denied: restricted tabs show "You don't have access to this section" with contact admin note.

**Modals triggered:** Confirm SO, Place/Release Hold, Cancel SO, Add Line, Allocation Override, Partial Fulfillment Decision, Short Pick Resolve.

---

### SHIP-008 — Inventory Allocation View

**Route:** `/shipping/allocations` (global) and `/shipping/sos/:id` Allocation tab (per-SO).
**Purpose:** LP-based inventory allocation with FEFO/FIFO suggestion, allergen gate, and soft quality-hold handling.

**Layout (per-SO Allocation view):**
Three-column layout using `grid-3` class. Left column: SO summary (customer, lines count, total qty needed). Middle column: available LP candidates list. Right column: current allocations summary.

**Middle column — LP Candidates:**
Table with columns: LP#, Location, Batch, Expiry Date (FEFO rank highlighted — oldest first), Qty Available, QA Status, Allergen warning icon. Rows sorted by `fefo_strategy_v1` rule: expiry_date ASC NULLS LAST, then received_date ASC. Expired LPs shown with red text "EXPIRED" and disabled checkbox unless supervisor override toggle is enabled. LP with QA hold (non-critical) shown with amber badge; clicking shows quality hold modal (D-SHP-13). LP with critical QA hold shown grayed out with red "BLOCKED" badge — cannot select.

**Allocation controls:**
"Auto-Allocate" primary button triggers `POST /api/shipping/sales-orders/:id/allocate` with strategy from settings. "Manual Select" toggle switches to checkbox mode — operator selects LPs and clicks "Allocate Selected". Qty-override input per LP if allocating less than full LP. Allergen check runs on every selection: if customer.allergen_restrictions conflicts with product.allergens of selected LP, amber warning banner appears "Allergen conflict — shipping_qa override required to proceed."

**Right column — Current Allocations:**
Table of existing `inventory_allocations` rows. Columns: SO Line, LP#, Batch, Qty Allocated, Allocated By, Allocated At, Actions (Release). "Release All" button with confirmation modal.

**FEFO rule reference:** Blue info box at bottom: "Allocation strategy: FEFO (fefo_strategy_v1 from 02-SETTINGS §7). Override requires shipping_manager role + reason code logged to pick_overrides."

**States:** Loading spinner. Empty (no available LPs): "No available LPs for this product — check warehouse stock via 05-WAREHOUSE." Insufficient stock: amber alert "Short: 40 units available, 60 required — partial allocation possible. See Partial Fulfillment flow." Full allocation: green banner "All lines fully allocated — ready to generate pick list."

---

### SHIP-009 — SO Confirmation Hold

**Route:** Modal from `/shipping/sos/:id` Holds tab or from SO confirm action.
**Purpose:** Manage credit, QA, allergen, and manual holds with audited release flow.

**Hold Types and triggers:**

**Allergen hold:** Auto-triggered at `status='confirmed'` if allergen_validated=false and conflicts exist. Banner in SO header: red alert "Allergen hold — 2 conflicts detected. Review required by shipping_qa." Override button visible to shipping_qa role only.

**Credit hold:** Triggered manually by credit_control role or automatically if P2 credit limit exceeded. Banner: amber "Credit hold placed — contact credit control to release." Release button visible to credit_control and admin.

**QA hold:** Triggered automatically via `quality.hold.created` event from 09-QUALITY when an allocated LP enters QA hold. Banner shows per-LP severity. Soft-warn (non-critical): amber modal asking for override reason. Hard block (critical): red banner "Critical QA hold — contact QA Lead."

**Manual hold:** Any shipping_manager can place a manual hold with reason text.

**Hold Detail View (Holds tab in SO detail):**
Table: Hold Type, Placed By, Placed At, Status, Reason Code, Notes, Released By, Released At. Each active hold has "Release Hold" button. Clicking opens Release Hold Modal (→ Section 4).

**Place Hold Modal:**
- Hold Type: select (Credit / QA / Allergen / Manual)
- Reason Code: select from `shipping_override_reasons` reference table (02-SETTINGS §8)
- Notes: textarea, min 10 chars
- "Place Hold" primary button

**States:** No holds: green "No active holds on this order." Multiple holds: each displayed as separate row with individual release capability.

---

### SHIP-010 — Partial Fulfillment

**Route:** Modal from SO detail, triggered when `qty_available < qty_ordered` during allocation.
**Purpose:** Decide whether to ship partial now or wait; optionally create backorder SO.

**Modal (560px):**
Header: "Partial Fulfillment Decision — SO-2026-00123"

Summary table showing each short line: Product, Qty Ordered, Qty Available, Shortfall.

Decision radio group:
- "Ship what is available now" — ships partial, marks SO status as 'partial', remaining qty stays on SO
- "Wait for full stock — do not ship partial" — hold SO, no shipping until stock available
- "Ship partial + create backorder SO" — ships available qty now, auto-creates new SO for shortfall qty (requires `org_settings.auto_create_backorder` or explicit opt-in here)

If "Ship partial" or "Backorder" selected: Reason Code required (select from shipping_override_reasons).

"Confirm Decision" primary button. Cancel secondary.

**Downstream effect display:** "If you ship partial, SO status will become 'partial'. Backorder SO will be created as 'SO-2026-00124 (backorder of SO-2026-00123)' in draft status."

**States:** Loading: spinner while calculating shortfalls. Error: "Failed to process partial fulfillment — try again."

---

### SHIP-011 — SO Cancellation

**Route:** Modal from SO detail or SO list row action.
**Purpose:** Cancel SO with reason code, release all LP reservations, produce audit entry.

**Modal (560px):**
Header: "Cancel Sales Order — SO-2026-00123"

Warning alert: "This will release all LP reservations (05-WAREHOUSE) and cannot be undone. The SO record is preserved for audit purposes." Shows count of LPs to be released.

Fields:
- Reason Code: select, required. Options sourced from `shipping_override_reasons` table (02-SETTINGS §8): customer_request, duplicate_order, out_of_stock, pricing_error, supplier_issue, other.
- Notes: textarea, required, min 10 chars.
- Confirmation checkbox: "I understand this will release all inventory allocations."

"Cancel Order" danger button. Close secondary.

**Guard:** Button disabled if `status IN ('shipped', 'delivered')` — tooltip "Cannot cancel shipped orders." (V-SHIP-SO-07)

**States:** Error: "Failed to cancel — try again." Success: toast "SO-2026-00123 cancelled. 3 LPs released back to available inventory."

---

### SHIP-012 — Pick List List

**Route:** `/shipping/picks`
**Purpose:** Overview of all pick lists with assignment, status, and priority management.
**Persona:** Warehouse Manager, Picker (read own).

**Layout:**
Page header with breadcrumb, search input (placeholder "Search PL#, picker, SO#…"), Filters button. Summary bar: counts by status (Pending, Assigned, In Progress, Completed). "Build Wave" primary button → `/shipping/picks/wave`. "Generate Single" secondary → generates pick list from selected allocated SOs.

**Table Columns:**

| Column | Field | Type | Example |
|---|---|---|---|
| Checkbox | — | select | — |
| PL# | `pick_lists.pick_list_number` | link | PL-2026-00042 |
| Type | `pick_lists.pick_type` | badge | Wave / Single |
| Priority | `pick_lists.priority` | 1-5 stars | 3 |
| Status | `pick_lists.status` | badge | In Progress |
| Assigned To | user name | text | John Doe |
| SOs in list | count | number | 3 |
| Lines | count | number | 14 |
| Lines Picked | computed | progress | 10/14 |
| Started | `pick_lists.started_at` | time | 09:45 |
| Actions | — | buttons | Assign / View / ⋮ |

**Row overflow menu:** View Detail, Reassign Picker, Mark Complete (manager), Cancel, Print.

**Filters:**
- Status: Pending / Assigned / In Progress / Completed / Cancelled
- Type: All / Wave / Single
- Picker: dropdown
- Priority: All / 1 (highest) / 2 / 3 / 4 / 5

**Pick scanner card:** Blue scanner card at top of page: "Use scanner for pick workflow → 06-SCANNER-P1 (SCN-040 Pick extension)". Deep link button: "Open Scanner" → `/scanner/shipping/pick`.

**States:** Loading skeletons, empty state "No pick lists — generate from allocated SOs", error with retry.

---

### SHIP-013 — Wave Picking Builder

**Route:** `/shipping/picks/wave`
**Purpose:** Build and release wave pick lists grouping multiple SOs. Supervisor/planner view with kanban workflow.
**Note:** Wave picking P1 = basic (max 50 SOs per wave, manual zone grouping). Full optimizer deferred to P2 (11-J EPIC).

**Layout:**
Two-region layout. Left sidebar (280px): Available SOs panel — table of fully-allocated SOs not yet in a pick list. Right main area: Wave Builder kanban.

**Left sidebar — Available SOs:**
Table: SO#, Customer, Lines, Alloc %, Ship Date, Zone hint. Multi-select checkboxes. "Add to Wave" button (active when SOs selected). Filter: by zone, by carrier, by date. Sort: by ship date ASC default.

**Right area — Wave Kanban:**
Kanban board with four columns using `.kanban` CSS class:
- Unreleased (gray header): Wave cards not yet released to pickers. Can edit/delete waves here.
- Released (blue header): Wave released — pickers can start. Read-only.
- In Pick (amber header): Active picking in progress. Shows picker names and progress %.
- Completed (green header): All lines picked.

Each kanban card (`kanban-card` class) shows: Wave# (WV-2026-00015), SO count, line count, picker count, total qty, zone list, ETA badge (computed). Card click → wave detail overlay.

**Wave creation panel (above kanban):**
When SOs are selected in left sidebar, "New Wave" button becomes active. Clicking opens inline form: Wave Priority (1-5), Zone Filter (all zones included by default), Release Immediately toggle. "Create Wave" primary button.

**Bulk wave actions (when unreleased wave selected):** Release Wave, Edit Wave, Delete Wave.

**Release Wave confirmation:** Modal showing: Wave#, SO count, line count, picker assignment (optional at release), estimated pick time. "Release to Pickers" primary button.

**P1 optimizer hint text:** Blue info box: "P1: Basic wave grouping by zone. P2 (EPIC 11-J) will add route optimization, batch picking, and auto-wave creation."

**States:** Loading: kanban skeletons. Empty (no allocated SOs): "No allocated SOs available — allocate SOs first." Empty kanban: "No waves yet — select SOs and create a wave."

---

### SHIP-014 — Pick Desktop (Supervisor Progress View)

**Route:** `/shipping/picks/:id`
**Purpose:** Supervisor-level desktop view of pick list progress, LP locations, FEFO deviations.
**Persona:** Warehouse Manager (oversight only — pickers use scanner).

**Layout:**
Page header: PL# and status badge. Summary bar: wave reference, assigned picker(s), start time, ETA, progress percentage. Two-column layout: left column is pick progress table, right column is a summary and override panel.

**Left column — Pick Lines Table:**

| Column | Description |
|---|---|
| Seq | Pick sequence number (optimized route: zone→aisle→bin) |
| Product | Product name + code |
| Suggested LP | LP# from allocation, with location |
| Actual LP | LP scanned by picker (may differ from suggested) |
| Qty to Pick | From pick_list_lines |
| Qty Picked | Real-time from scanner updates |
| Status | badge: Pending / Picked / Short / Overridden |
| FEFO Deviation | amber badge if actual LP expiry > suggested LP expiry |
| Notes | Short pick reason, override reason |

**FEFO deviation rows:** Row background amber `#fffbeb` if `actual LP.expiry_date > suggested LP.expiry_date`. Tooltip: "FEFO deviation: picked LP expires later than suggested. Override logged by [picker] at [time]."

**Quality hold flag:** If a pick line has a QA override (from pick_overrides table): amber badge "QA Override" with tooltip showing reason_code, notes, override_type.

**Right column — Summary panel:**
Progress donut chart: picked/total lines. Picker list with each picker's last activity timestamp. FEFO deviation count. QA override count. "Reassign Picker" button. "Force Complete" button (admin only) with audit reason required.

**Print route sheet:** "Print Route Sheet" secondary button generates PDF of pick sequence for this pick list.

**States:** Loading: table skeleton. Completed pick list: green banner "Pick complete — all lines picked. Ready for packing." Short pick lines: amber alert "X lines short — resolve before packing."

---

### SHIP-015 — Pick Scanner

**Route:** `/scanner/shipping/pick` (deep link to 06-SCANNER-P1)
**Purpose:** Card on SHIP-012 and SHIP-014 linking pickers to the scanner workflow. Scanner screens are NOT defined here — they live in 06-SCANNER-P1 (SCN-040 Pick extension).

**Scanner Launch Card (shown on Pick List List and Pick Detail):**
`.scanner-card` component: truck/pick icon (32px), label "Pick with Scanner", sub-label "Opens 06-SCANNER-P1 pick workflow (SCN-040)". On click: navigates to `/scanner/shipping/pick?pickListId={id}`.

**Integration note for designer:** The scanner UI is 48px touch targets, scan-first input, single-action linear flow. Three input methods: hardware scanner wedge, camera (ZXing), manual fallback. Offline queue (FIFO replay) per 06-SCN Q3. Do not design scanner screens here.

**Quality Hold Override Modal (inline in scanner, also surfaced on desktop):**
When scanner picks LP with QA hold severity < critical, a modal appears:
- Red/amber banner: "LP [LP-2026-00123] is on hold: [hold_reason]. Override to continue?"
- Hold reason text (read-only)
- Severity badge (Major / Medium / Minor)
- Reason Code: select, required. Options from `shipping_override_reasons` (02-SETTINGS §8): quality_override_approved, supervisor_direction, customer_requested.
- Notes: textarea, min 10 chars.
- "Continue with Override" warning button. "Cancel" secondary.
- Override logged to `pick_overrides` table (D-SHP-13). Event emitted: `shipping.quality_hold.overridden` → 09-QA consumer.

---

### SHIP-016 — Short Pick

**Route:** Modal from SHIP-014 or scanner (SCN-040 extension).
**Purpose:** Decision point when picker cannot fulfill requested qty at pick location.

**Short Pick Decision Modal (560px):**
Header: "Short Pick — [Product Name] on [SO-2026-00123]"

Summary: Requested qty: 60 kg. Available at suggested LP (LP-2026-00099): 40 kg. Shortfall: 20 kg.

Decision radio group:
1. "Ship short (20 kg shortfall)" — marks pick_list_line as short, creates partial fulfillment flag. Downstream: SO status → 'partial', optional backorder creation per D-SHP-10.
2. "Substitute with alternate LP" — shows sub-table of other available LPs for same product, sorted FEFO. Picker selects alternate, qty override input. Override logged to pick_overrides (override_type='fefo_deviation').
3. "Wait for restock — do not pick now" — line remains Pending, wave continues without this line. Alert raised to manager.

**Reason Code:** required for options 1 and 3. Select from `shipping_override_reasons`.

**Downstream effects display:** Dynamic text showing consequences: "If short-ship: SO-2026-00123 will become Partial. Customer Acme Foods will receive 40kg instead of 60kg. 1 backorder item queued."

"Confirm" primary button. Cancel secondary.

**States:** Error: "Failed to process short pick decision." Success: toast per outcome.

---

### SHIP-017 — Packing Station

**Route:** `/shipping/packing/:station`
**Purpose:** Desktop packing workbench. Operator scans LPs, builds boxes, captures weights, closes cartons, triggers SSCC generation.
**Device:** Desktop primary, 10-inch tablet landscape supported.

**Layout:**
Three-column layout for desktop. On 10" tablet landscape: left column collapses to icon-only sidebar.

**Left column (240px) — Available LPs queue:**
Table of picked LPs ready to pack for SOs assigned to this station. Columns: LP#, Product, Qty, Batch, Expiry, SO#. Sort: FEFO order (expiry ASC). Row click or scan: moves LP to active box.

**Middle column (flex) — Active Box Builder:**
Box header: Box # (e.g., Box 1 of SH-2026-00045), weight display (running total, kg), SSCC field (empty until box closed). Scan input field (large, prominent, placeholder "Scan LP barcode or type LP#"). Contents table: LP#, Product, Qty, Batch, Expiry, Weight (kg) — catch weight entry if `products.weight_mode='catch'` (03-TECH §8). Last row is summary: box total weight input (manual kg entry for non-catch), volume dims (L×W×H cm, optional). "Close Box" primary button → triggers SSCC generation. "New Box" secondary → starts another box for same shipment.

**Catch weight carve-out (D-SHP-17):** If product.weight_mode = 'catch', the Weight column becomes an editable number input per LP. Variance check displays: "Nominal: 5.0 kg | Actual: 5.2 kg | Variance: +4% ✓" (green if within tolerance, amber/red if outside `products.variance_tolerance_pct`).

**Allergen separation warning:** If two LPs in the same box have conflicting allergens per `customers.allergen_restrictions`, amber banner: "Allergen separation notice: box contains wheat and customer restricts wheat. Consider separate boxes. (V-SHIP-PACK-05)"

**Right column (280px) — Shipment Summary:**
Shipment card: SH# reference, customer name, SO# link, status badge. Box list: each closed box with SSCC, weight, contents count, "Reprint Label" link. Progress: X of Y lines packed. Total weight (kg). "Generate Packing Slip" button. "Generate BOL" button. "Confirm Shipment" primary button (only when all boxes have SSCC and BOL generated — V-SHIP-SHIP-01/02).

**Pack scanner card:** Above left column: "Scan with pallet scanner → 06-SCANNER-P1 (SCN-050 Pack extension)". Link: `/scanner/shipping/pack?shipmentId={id}`.

**States:** Loading: spinner. Empty (no picked LPs): "No items ready to pack — complete picking first." Station offline: amber banner "Packing station ZPL-02 printer offline — labels will queue until reconnected." Full pack complete: green banner "All boxes closed and SSCC generated. Proceed to generate BOL and confirm shipment."

---

### SHIP-018 — Pack Scanner

**Route:** `/scanner/shipping/pack` (deep link to 06-SCANNER-P1)
**Purpose:** Card on packing station linking packers to scanner workflow for pallet-level operations. Scanner screens defined in 06-SCANNER-P1 (SCN-050 Pack extension only).

**Scanner Launch Card:**
`.scanner-card` component: box/scan icon, label "Pack with Scanner (Pallet Level)", sub-label "SCN-050 via 06-SCANNER-P1". Button: "Open Scanner" → `/scanner/shipping/pack?shipmentId={id}`.

**Integration note:** Pallet-level packing uses scanner. Box-level mixed packing uses SHIP-017 desktop workbench. Per D-SHP-6 Q2 decision: both co-exist.

---

### SHIP-019 — SSCC Labels

**Route:** `/shipping/sscc`
**Purpose:** Manage SSCC-18 label generation queue, preview, print, and reprint.

**Layout:**
Page header with breadcrumb, summary KPI bar (Labels Generated Today, Pending Print, Print Errors). Table of `shipment_boxes` with SSCC generated, filtered to printable state. Bulk print action.

**SSCC Format Display:**
Info card at top: "SSCC-18 Structure: Extension(1) + GS1 Prefix(7-10 digits, from org.gs1_company_prefix) + Serial(6-8 digits, atomic sequence) + Check Digit(1) = 18 digits total. GS1-128 barcode AI (00). Example: 0 1234567 00000042 5"

If `organizations.gs1_company_prefix` is null: red alert "GS1 Company Prefix not configured — SSCC generation disabled. Configure in Shipping Settings." (V-SHIP-PACK-03)

**Labels Table:**

| Column | Field |
|---|---|
| Shipment | SH# link |
| Box# | shipment_boxes.box_number |
| SSCC | monospace 18-digit code, copyable |
| Customer | customer name |
| Generated At | timestamp |
| Printed | checkbox (printed_at timestamp) |
| Print Status | badge: Queued / Printed / Error |
| Actions | Preview / Print / Reprint |

**Label Preview Modal (560px):**
Shows rendered label at realistic size. Sections: GS1-128 barcode (AI 00 + SSCC), then below in readable text: AI (01) GTIN-14, AI (10) Batch, AI (15) Use-by or (17) Best-before (YYMMDD), AI (3103) Net weight. Allergen line: "Contains: **wheat**, **milk**" (bold allergens per D-SHP-15). Customer name and shipping address. "Print Label" button sends ZPL to configured printer. "Download PDF" fallback.

**Bulk Print:** Select multiple boxes → "Print Selected" → sends batch ZPL job. "Print All Unprinted" quick action.

**SSCC Reprint Modal:** Reason required (damage, lost, reissue). Reprint logged to shipping_audit_log.

**Printer status banner:** If printer offline: amber "ZPL printer offline — labels queued (N waiting). Connect printer to release queue."

**States:** Loading skeletons, empty (no boxes with SSCC), error (generation failed — GS1 prefix missing).

---

### SHIP-020 — Packing Slip

**Route:** `/shipping/docs/:shipmentId/slip`
**Purpose:** Preview, print, and manage packing slips. EU 1169/2011 allergen labelling mandatory.

**Layout:**
Two-region layout: left narrow panel (320px) with controls, right wide panel with PDF preview iframe.

**Left panel controls:**
- Shipment reference (SH# link)
- Customer and ship-to address summary
- Template picker: select (default / retailer-specific / custom). Templates configured in Shipping Settings.
- Language: select (EN default, multi-language P2 per V-SHIP-LBL-05)
- "Generate / Regenerate" primary button
- "Print" secondary button
- "Download PDF" link
- Version history: list of previously generated slips with timestamps

**PDF preview (right panel):**
Server-side PDF rendered via pdfkit/pdf-lib. Required elements per EU 1169/2011 (D-SHP-15):
- Header: Ship From (org name + address), Ship To (customer name + shipping address), Shipment# and date
- Order reference table: SO#, Customer PO, Order Date, Ship Date
- Line items table: Line#, Product Code, Description, GTIN-14, Batch/Lot, Best Before, Qty, Unit, Unit Price (GBP), Line Total
- Per-product allergen section: "Contains: **wheat**, **milk**, **egg**" with bold EU-14 allergen names (HTML `<strong>` in PDF rendering per D-SHP-15)
- Customer restriction conflict marker: ⚠ symbol if any product allergen matches customer.allergen_restrictions (segregation warning)
- Aggregated shipment allergens at bottom: "This shipment contains: **wheat**, **milk**"
- Totals: subtotal, delivery charge (if any), total GBP
- Barcode: SSCC or SO reference
- Nutrition declaration (P1: display from product_nutrition_facts, 01-NPD)

**States:** No shipment yet: "Confirm packing to generate slip." Generation error: "PDF generation failed — retry." Stale slip warning: amber "Shipment was modified after this slip was generated — regenerate recommended."

---

### SHIP-021 — Bill of Lading

**Route:** `/shipping/docs/:shipmentId/bol`
**Purpose:** Generate, preview, print, and archive BOL. Driver/consignee signature upload. SHA-256 immutability hash per BRCGS Issue 10.

**Layout:**
Same two-region layout as packing slip: left controls panel, right PDF preview.

**Left panel controls:**
- Shipment reference with status badge
- Carrier: text input (P1 manual, P2 API selector). Carrier name, service level, pro number (manual entry).
- HAZMAT flag: checkbox (grayed out in P1 — "HAZMAT support P2, FR-7.44").
- Freight class: text input (P1 manual entry — "LTL-65" etc.)
- "Generate BOL" primary button (creates PDF + stores SHA-256 hash in `shipments.bol_pdf_hash`)
- "Print BOL" secondary
- "Download PDF" link
- "Upload Signed BOL" button → file picker (PDF/image) → `POST /api/shipping/shipments/:id/upload-signed-bol`. Stores in Supabase Storage, 7-year retention. Hash stored in `shipments.bol_signed_pdf_hash`.
- Immutability badge: after generation, green badge "SHA-256 hash recorded — document immutable." After sign upload: "Signed BOL hash recorded."

**PDF structure (per D-SHP-19 and §13.5):**
- Header: BOL Number (SH-YYYY-NNNNN-BOL), Date, Pro Number, Carrier
- Ship From: org name, address, contact
- Ship To: customer name, shipping address, contact
- Line items: Box SSCC, dimensions, weight (kg), product GTIN list, quantity
- Allergen section: aggregated list from D-SHP-15 — "This shipment contains: **wheat**, **milk**. Customer allergen restrictions: wheat restricted (segregation noted)."
- Special instructions: cold chain requirements (temp range if set), notes
- Signature blocks: Driver Name, Driver Signature, Date Loaded; Consignee Name, Consignee Signature, Date Received (filled post-delivery for POD)
- HAZMAT: empty in P1

**Signature upload success state:** after upload, "Signed BOL uploaded and hashed — BRCGS 7-year retention active. Cannot be deleted."

**States:** BOL not yet generated: "Generate BOL to proceed with shipment confirmation." Generation error: "BOL generation failed — check all boxes have SSCC (V-SHIP-SHIP-01)." Signed BOL uploaded: green confirmation, "Signed BOL secured."

---

### SHIP-014b — Carriers

**Route:** `/shipping/carriers`
**Purpose:** List and manage carrier configurations. P1 manual, P2 API integration.

**Layout:**
Page header, "Add Carrier" button. Table of carrier configs.

**Table Columns:**

| Column | Field | Notes |
|---|---|---|
| Carrier Name | text | e.g., "DHL Express", "UPS Standard", "DPD Next Day" |
| Service Level | text | "Express 24h", "Economy 48h" |
| Rate Basis | badge | Manual / Weight-based / Zone-based |
| API Integration | badge | Not connected (P2) / Connected |
| Default Carrier | checkbox | — |
| Status | badge | Active / Inactive |
| Actions | Edit / Deactivate | admin only |

**P2 notice:** Blue info banner: "Carrier API integration (rate shopping, label generation, tracking webhooks, POD) deferred to Phase 2 (EPIC 11-F). P1: manual BOL + packing slip only."

**Add/Edit Carrier Modal (560px):**
Fields: Carrier Name (text, required), Service Levels (multi-entry chip input), Rate Basis (select: Manual/Weight/Zone), Tracking URL Template (text, e.g., `https://track.dhl.com/{tracking_number}`), Notes. "Save" primary.

**States:** Loading, empty (no carriers configured — show "Add your first carrier"), error.

---

### SHIP-023 — Shipping Settings

**Route:** `/shipping/settings`
**Purpose:** Configure allocation strategy, wave release rules, GS1 prefix, label templates, BOL template, credit threshold. Admin role only.

**Layout:**
Tabbed settings page with five tabs: Allocation, Wave & Picking, Labels & Documents, D365 Integration, Advanced.

**Allocation tab:**
- Default Allocation Strategy: select (FEFO / FIFO / Manual) — reads `fefo_strategy_v1` default from 02-SETTINGS §7, configures per-org preference.
- Auto-Allocate on Confirm: toggle (default ON per D-SHP-12).
- Partial Allocation Allowed: toggle (default ON per D-SHP-10).
- Auto-Create Backorder: toggle (default OFF per D-SHP-10), with note "When ON, shortfalls automatically generate a backorder SO."
- Expired LP Override: toggle (default OFF) — "Allow shipping_manager to override expired LP block with reason code."

**Wave & Picking tab:**
- Wave Release Cutoff Time: time picker (e.g., 14:00 daily) — waves must be released by this time for same-day pick.
- Max SOs per Wave: number input (P1 default: 50, per PRD).
- Default Pick Priority: select (1 Highest / 2 / 3 / 4 / 5 Lowest).
- Short Pick Handling Default: select (Wait / Ship Short / Prompt picker).

**Labels & Documents tab:**
- GS1 Company Prefix: text input, required for SSCC generation. Format: 7-10 digits. Validation: GS1 format check. "Test SSCC Generation" button generates sample SSCC for verification.
- SSCC Extension Digit: number 0-9, default 0.
- Current SSCC Sequence: number (read-only, shows `organizations.next_sscc_sequence`). "Reset Sequence" button (admin only, audit logged).
- Label Template: select (Default GS1-128 / Custom ZPL). "Upload Custom ZPL Template" file button.
- Packing Slip Template: select (Default / Custom). "Upload Custom Template" file button.
- BOL Template: select (Default / Custom).

**D365 Integration tab (LEGACY-D365):**
Read-only display of D365_Constants from 02-SETTINGS §11: FNOR (dataAreaId), ApexDG (warehouse code), FinGoods (GL account), APX100048 (approver). "Edit in 02-SETTINGS" link. P2 extension fields shown grayed: shipping_warehouse, customer_account_id_map, courier_default_carrier, courier_api_vault_key. DLQ monitoring link: "View D365 outbox DLQ → `/admin/integrations/d365/dlq` (filter source=shipping)".

**Advanced tab:**
- Credit Limit Warning Threshold %: number, default 80 (P2 field, shown grayed with "Phase 2" badge).
- EUDR Gate: toggle (disabled, "Phase 2 — EPIC 11-H"). When P2 activated: blocks shipment if supplier.dds_reference IS NULL for EUDR-category products.
- RLS Debug: checkbox (admin only) "Show org_id on all records in debug mode."
- "Save Settings" primary button.

**States:** Loading, save error inline, save success toast "Settings saved."

---

## 4. Modals

### Customer Create/Edit (560px)

**Trigger:** "Create Customer" button or row Edit on SHIP-001.
**Fields:**
- Customer Code: text, required, unique per org, auto-generated if blank (CUST-YYYY-NNNNN)
- Full Name: text, required, max 100 chars
- Trading Name: text, optional
- Category: select — Retail / Wholesale / Distributor, required
- Email: email, required
- Phone: tel, optional
- Tax ID (VAT/EIN): text, optional
- Payment Terms: select (7 / 15 / 30 / 45 / 60 / 90 days), required, default 30
- is_active: toggle, default ON
- Notes: textarea, optional
- Credit Limit (GBP): number, optional (P2 field — labeled "Phase 2")

**Actions:** Save (primary) — validates all required fields; Cancel (secondary).

---

### Address Create/Edit (560px)

As described in SHIP-003. Trigger from Customer Detail Addresses tab.

---

### Allergen Restriction Add (560px)

Trigger from Customer Detail Allergens tab "Add Restriction" (for individual allergen quick-add).
Fields: Allergen (select from 14 EU + custom list), Restriction Type (Refuses / Requires Declared), Notes.
"Add" primary. Cancel secondary.

---

### SO Create Wizard

Four-step modal/page as described in SHIP-006. Steps: Header → Lines → Allergen Review → Review.

---

### SO Line Add/Edit (560px)

**Trigger:** "Add Line" or line row edit on SHIP-007 Lines tab (draft only).
**Fields:**
- Product: search-select, required. Shows GTIN, allergen icons, default_sell_price.
- Qty Ordered: number, required, >0 (V-SHIP-SO-06)
- Unit Price (GBP): number, required, >0, auto-filled from products.default_sell_price (editable, audit on change)
- Requested Lot: text, optional (specific lot request)
- Notes: textarea, optional

**Actions:** Save / Cancel.

---

### Allocation Override (560px)

**Trigger:** When manually selecting a non-FEFO LP or expired LP during allocation.
**Header:** "Allocation Override — [Product Name]"
**Content:** Shows suggested LP (FEFO rank 1) vs selected LP (expiry comparison). Warning text about deviation.
**Fields:**
- Override Type: select — fefo_deviation / expired_lp / quality_hold (auto-set)
- Reason Code: select from shipping_override_reasons, required
- Notes: textarea, min 10 chars, required

**Actions:** "Confirm Override" warning-styled button / Cancel.
**Audit:** Logged to `pick_overrides`.

---

### Hold Place (560px)

**Trigger:** "Place Hold" on SO Holds tab.
**Fields:** Hold Type (select: Credit/QA/Allergen/Manual), Reason Code (select from shipping_override_reasons), Notes (textarea min 10 chars).
**Actions:** "Place Hold" primary / Cancel.

---

### Hold Release (560px)

**Trigger:** "Release Hold" on SO Holds tab.
**Header:** "Release [Hold Type] Hold — SO-2026-00123"
**Content:** Shows hold details (type, placed by, placed at, reason).
**Fields:** Release Reason Code (select), Notes (textarea, optional).
**Role guard:** Displayed only if current user has required role (credit_control for credit, shipping_qa for QA/allergen, shipping_manager for manual).
**Actions:** "Release Hold" primary (green) / Cancel.

---

### Cancel SO (560px)

As described in SHIP-011.

---

### Partial Fulfillment Decision (560px)

As described in SHIP-010.

---

### Wave Release Confirm (560px)

**Trigger:** "Release Wave" button on SHIP-013 kanban.
**Content:** Wave summary (Wave#, SO count, line count, total qty). Optional: assign picker names (multi-select from active pickers). Confirmation checkbox.
**Actions:** "Release to Pickers" primary / Cancel.

---

### Short Pick Resolve (560px)

As described in SHIP-016.

---

### Pick Reassign (560px)

**Trigger:** "Reassign Picker" on SHIP-014.
**Fields:** Current Picker (read-only), New Picker (select from active users with shipping_operator role), Reason (text optional).
**Actions:** "Reassign" primary / Cancel.

---

### Pack Close Carton Confirm (400px)

**Trigger:** "Close Box" on SHIP-017 packing station.
**Content:** Box summary: total weight (kg), number of LPs, product list, allergen summary. Catch weight variance check result.
**Fields:** Confirm Box Weight (number, kg, required). Override weight tolerance if out of range requires reason.
**Actions:** "Close Box & Generate SSCC" primary / "Keep Open" secondary.

---

### SSCC Label Reprint (400px)

**Trigger:** "Reprint" on SHIP-019 labels table.
**Fields:** Reason (select: damage/lost/reissue), Notes (text, optional), Printer (select configured ZPL printers).
**Actions:** "Reprint" primary / Cancel.
**Audit:** Logged to shipping_audit_log.

---

### Packing Slip Regenerate (400px)

**Trigger:** "Regenerate" on SHIP-020.
**Content:** Warning "Regenerating will replace the current slip. Previous version archived." Shows reason why stale.
**Fields:** Reason (text, optional).
**Actions:** "Regenerate" primary / Cancel.

---

### BOL Sign-Off (560px)

**Trigger:** "Upload Signed BOL" on SHIP-021.
**Content:** File upload area (drag-and-drop or browse). Accepts PDF/JPG/PNG. Max 10MB. Preview thumbnail.
**Fields:** Driver Name (text, required), Signature Date (date, required), Notes (optional).
**Actions:** "Upload & Hash" primary (triggers SHA-256 hash generation on server, stores in `shipments.bol_signed_pdf_hash` + Supabase Storage 7y retention). Cancel secondary.
**P2 note:** "E-signature (SHA-256 + PIN re-verify per 21 CFR Part 11) is Phase 2."

---

### Carrier Rate Quote (560px — P2)

**Content:** P2 stub modal: "Carrier rate shopping is Phase 2 (EPIC 11-F). P1: Enter carrier details manually on BOL." Single "Close" button.

---

### Credit Limit Override (560px — P2)

**Content:** P2 stub: "Credit limit hard block is Phase 2. P1: warning-only." Shown with P2 badge overlay.

---

### Delete Confirmation (generic, 400px)

**Fields:** Confirmation text "Type DELETE to confirm" (text input). Reason (select, for audited deletes).
**Actions:** "Delete" danger button (enabled only when text matches) / Cancel.

---

## 5. Flows

### 5.1 SO Lifecycle Happy Path

1. Shipping coordinator navigates to `/shipping/sos/new` (SHIP-006 wizard).
2. Step 1: selects customer, enters ship dates, selects shipping address.
3. Step 2: adds lines — product, qty, unit price (auto-filled from 03-TECHNICAL `products.default_sell_price`).
4. Step 3: allergen review runs automatically. If clear: green confirmation. If conflicts: red block + acknowledge checkbox → allergen override modal required (shipping_qa must approve).
5. Step 4: review and "Create Draft SO" → SO created with status='draft', redirects to `/shipping/sos/:id`.
6. Coordinator clicks "Confirm" on SO detail. Guard checks: allergen_validated=TRUE AND shipping_address_id IS NOT NULL (V-SHIP-SO-02/03). SO status → 'confirmed'.
7. If auto_allocate_on_confirm=true (02-SETTINGS): allocation runs immediately using fefo_strategy_v1. LPs reserved in 05-WAREHOUSE (SELECT FOR UPDATE, status=reserved). SO status → 'allocated'.
8. Manager opens SHIP-013 wave builder. Selects SO. Creates wave, assigns zone, sets priority. Releases wave.
9. Picker on scanner → `/scanner/shipping/pick` (06-SCANNER-P1 SCN-040). Scanner workflow: scan location → scan LP → enter qty → confirm. Each pick updates pick_list_line.status and qty_picked in real time.
10. All lines picked → SO status → 'packing'. Manager sees on SHIP-022 dashboard.
11. Packer opens SHIP-017 packing station. Scans LPs into box, enters weight, closes box. SSCC generated (atomic sequence + GS1 prefix, mod-10 check digit). ZPL label sent to printer.
12. All boxes closed → "Generate Packing Slip" (SHIP-020) and "Generate BOL" (SHIP-021). BOL SHA-256 hash stored.
13. Dispatcher prints BOL, hands to carrier driver. Manually uploads signed copy via SHIP-021 upload modal.
14. Dispatcher clicks "Confirm Shipment" on SHIP-017 summary. Guards check: all boxes have SSCC, BOL generated, no open critical holds (V-SHIP-SHIP-01/02/03). DB transaction: `shipments.status='shipped'`, `license_plates.status='shipped'`, INSERT `shipping_outbox_events` (D-SHP-14 stage 3).
15. Outbox dispatcher worker (shared with 08-PROD) picks up event, transforms via `@monopilot/d365-shipping-adapter` (R15), POSTs to D365 OData with idempotency key (R14). Retries on failure: 5min→30min→2h→12h→24h. After 5 failures → DLQ.
16. SO status → 'shipped'. Dashboard OTD % updates.
17. Manual POD: after delivery, dispatcher uploads signed BOL or notes delivered_at. SO → 'delivered'.

### 5.2 Allergen Hold Flow

1. Coordinator creates SO for customer with allergen restrictions (e.g., customer refuses wheat).
2. Step 3 of wizard detects: product in line contains wheat (from `products.allergens` via allergen_cascade_v1 from 03-TECH).
3. Red block on wizard Step 3: "Allergen conflict: Product 'Wheat Flour Mix' contains wheat. Customer 'Acme Foods' refuses wheat."
4. Coordinator cannot confirm without QA override. Acknowledges conflict and saves as draft.
5. shipping_qa lead opens SO, sees allergen hold badge in header.
6. QA lead clicks "Override Allergen Hold" → modal (allergen_overrides table): reason_code required, approver_pin (P2 21 CFR Part 11), notes min 20 chars, SHA-256 audit_hash generated.
7. Override saved → allergen_validated=TRUE flag set. SO can now be confirmed.
8. If QA lead does not approve → SO remains on allergen hold. Can only be cancelled.

### 5.3 Credit Hold Flow

1. Credit control places credit hold on customer (SHIP-002 Credit tab, P2 auto-trigger).
2. All new SOs for that customer get credit hold on confirmation.
3. Amber banner on SO detail: "Credit hold placed by Jane Smith. Contact credit_control to release."
4. credit_control role navigates to Holds tab, clicks "Release Hold", selects reason, saves.
5. Hold released → audit entry in `shipping_audit_log` → SO continues to allocation.

### 5.4 Short Pick Flow

1. Picker on scanner reaches LP-2026-00099 at location A1-03.
2. Available qty at LP: 40 kg. Required: 60 kg.
3. Scanner shows short pick modal (SCN-040 extension / inline in 06-SCANNER-P1).
4. Picker selects decision: "Ship short" with reason code.
5. pick_list_line.status → 'short', qty_picked=40.
6. SHIP-016 modal on desktop shows manager the decision outcome.
7. SO status flag set to 'partial'. Backorder created if org setting enabled.
8. Pick continues for other lines.

### 5.5 Wave Release Flow

1. Manager opens SHIP-013 wave builder.
2. Left panel shows 8 allocated SOs sorted by ship date.
3. Manager multi-selects 6 SOs for same carrier/zone.
4. Clicks "New Wave" → sets priority 2, includes all zones.
5. Wave card appears in Unreleased kanban column.
6. Manager clicks "Release Wave" → confirmation modal (Wave summary, optional picker assignment).
7. Wave moves to Released column. Pickers see it on scanner queue.
8. As pickers scan: kanban card moves to In Pick, progress % updates.
9. All lines complete → card moves to Completed. Manager sees on SHIP-022 dashboard.

### 5.6 Partial Fulfillment Flow

1. During allocation, only 40/60 units available for a line.
2. SHIP-008 shows amber "Short: 40 available, 60 required."
3. Manager opens Partial Fulfillment modal (SHIP-010).
4. Selects "Ship partial + create backorder SO".
5. System: ships 40 units (SO status → 'partial'), creates SO-2026-00124 (backorder) with 20 units in draft.
6. Customer notified (email stub, P2 full notify).
7. Backorder SO appears in SHIP-005 list with "(Backorder of SO-2026-00123)" note.

### 5.7 SO Cancel Flow

1. Coordinator opens SO, clicks "Cancel" button.
2. SHIP-011 modal: selects reason code "customer_request", enters notes.
3. Confirms with checkbox.
4. Service layer: releases all `inventory_allocations` (LPs in 05-WAREHOUSE return to status='available'), updates SO status='cancelled', writes shipping_audit_log entry.
5. If pick list was in progress: pick list status → 'cancelled', pickers notified via scanner toast.
6. SO appears in SHIP-005 list with Cancelled badge.

---

## 6. Empty / Zero / Onboarding States

**Module first use (no customers):**
Dashboard shows full layout with all zeros and a blue onboarding banner: "Welcome to Shipping. Complete setup: 1) Add your first customer → 2) Create a sales order → 3) Configure GS1 prefix for SSCC labels." Each step is a clickable card linking to the relevant screen.

**No customers:** SHIP-001 empty state — large customer icon, "No customers yet", "Create Your First Customer" CTA (primary), "Import CSV" (secondary), quick-tips bullets.

**No SOs:** SHIP-005 empty state — document icon, "No sales orders yet", "Create Your First Sales Order" CTA, mini-workflow diagram hint (order → allocate → pick → pack → ship).

**No allocations (SO confirmed but no stock):** SHIP-008 shows amber state: "No available LPs for this product. Check inventory in 05-WAREHOUSE. Current stock for [Product]: 0 kg."

**No pick lists:** SHIP-012 empty — "No pick lists yet. Allocate sales orders first, then generate pick lists."

**No waves:** SHIP-013 kanban all columns empty — "No waves created. Select allocated SOs from the left panel and create your first wave."

**Packing station with no assigned items:** SHIP-017 — "No items ready to pack for this station. Check pick list completion."

**No SSCC labels:** SHIP-019 — "No SSCC labels generated yet. Close a carton in the packing station to generate your first label."

**GS1 prefix missing:** Persistent banner on SHIP-019 and packing station: "Cannot generate SSCC labels — GS1 Company Prefix not configured. Configure in Shipping Settings → Labels & Documents."

**D365 DLQ empty:** "No failed events — D365 sync is healthy."

---

## 7. Notifications, Toasts, Alerts

### Toast Notifications (top-right, auto-dismiss 5s)

| Event | Type | Message |
|---|---|---|
| SO created | success | "SO-2026-00123 created as draft" |
| SO confirmed | success | "SO-2026-00123 confirmed — allocation starting" |
| Allergen conflict detected | error (no dismiss) | "Allergen conflict: 2 issues found on SO-2026-00123 — review required" |
| Allocation complete | success | "All lines allocated for SO-2026-00123" |
| Allocation short | warning (sticky) | "Short allocation: 20 kg missing on SO-2026-00123. Review Partial Fulfillment." |
| Hold placed | warning | "Credit hold placed on SO-2026-00123" |
| Hold released | success | "Credit hold released — SO-2026-00123 can proceed" |
| SSCC generated | success | "SSCC 0123456789012345678 generated — Box 1 of SH-2026-00045" |
| SSCC printer offline | error (sticky) | "ZPL printer offline — labels queuing. Check printer connection." |
| BOL pending signature | info (sticky) | "BOL for SH-2026-00045 awaiting signed upload" |
| Ship confirmed | success | "SH-2026-00045 shipped — D365 sync queued" |
| D365 sync success | success | "D365 SalesOrder push successful — SO-2026-00987 confirmed in D365" |
| D365 sync failed | error (sticky) | "D365 push failed for SH-2026-00045 — see DLQ" |
| QA hold override | warning | "QA hold overridden on LP-2026-00099 — audit entry created" |
| Pick complete | success | "PL-2026-00042 pick complete — ready for packing" |
| RMA created | info | "RMA-2026-00012 created — awaiting approval" |
| Cancel SO success | info | "SO-2026-00123 cancelled — 3 LPs released" |

### Persistent Alerts (dashboard alert panel + SO detail banners)

**Allergen conflict banner (SO detail header):**
Red alert box, left 4px red border: "Allergen hold — SO-2026-00123 contains products restricted by Acme Foods (wheat, milk). Override requires shipping_qa approval." [Review Allergen Conflicts] button.

**Credit hold banner (SO detail header):**
Amber alert box: "Credit hold placed by Jane Smith on 2026-04-19. Release via Holds tab. Contact credit_control." [Go to Holds] button.

**QA hold soft warning (during allocation / packing):**
Amber alert, inline: "LP-2026-00099 is on QA hold (Major severity). You may proceed with override and reason code. [Override with Reason Code] button."

**QA hold hard block (critical severity):**
Red alert, blocking: "LP-2026-00099 has a CRITICAL QA hold — pick blocked. Contact QA Lead to release hold in 09-QUALITY before proceeding."

**SSCC printer offline:**
Amber sticky banner on SHIP-017 and SHIP-019: "Label printer ZPL-01 offline — N labels queued. Labels will print automatically when printer reconnects."

**BOL pending signature (dashboard alert panel):**
Info: "3 BOLs awaiting signed upload — BRCGS audit requires signed copies within 48h of ship."

**D365 outbox DLQ item:**
Error sticky (admin only): "1 event in D365 DLQ for shipping. Manual intervention required." [View DLQ] link → `/admin/integrations/d365/dlq?source=shipping`.

---

## 8. Responsive Notes

**Desktop (>1024px) — Primary environment:**
All screens designed for desktop first. Full table columns, multi-column layouts (grid-2, grid-3), kanban boards, side-by-side PDF previews. Sidebar fixed 220px, main content margin-left 220px.

**Packing station on 10" tablet landscape (1024px wide, 600px tall):**
SHIP-017 packing station supports 10" landscape layout. Three-column collapses: left LP queue becomes icon-only sidebar with LP# chip badges (tappable to see detail). Middle box builder remains central focus. Right summary panel becomes bottom drawer (swipe up). All touch targets minimum 48px. Scan input is always on screen (sticky). Font size bumped to 16px for readability at arm's length. Numeric inputs use numeric keyboard (inputmode="numeric").

**Pickers on scanner (06-SCANNER-P1 screens):**
Not designed in this module — referenced by deep-link card. Scanner screens: 48px touch targets, single-action linear flow, 3 input methods, offline queue. See 06-SCANNER-P1 specification.

**Dashboard on Plant Director tablet (1024px):**
SHIP-022 dashboard uses 2-column KPI grid (4 cards × 2 rows), charts stack vertically, alerts collapse to count summary. Read-only, no action buttons visible for viewer role.

**Mobile (<768px):**
Tables collapse to card layout with Load More pagination. Filter overlays. Bulk actions in bottom sheet. SHIP-005 SO list mobile card: SO#, customer, status badge, total, pick date, 3 row actions. Not a primary device for this module.

---

## 9. Open Questions for Designer

| ID | Question | Impact | Source |
|---|---|---|---|
| OQ-UX-01 | GS1 Company Prefix setup: should a blocking setup wizard appear the first time a user tries to generate an SSCC, or should it be deferred to Settings only? | Onboarding UX | V-SHIP-PACK-03 |
| OQ-UX-02 | Allergen override modal: P1 shows reason_code dropdown + notes. Should P1 also show a QA lead name field for accountability even before P2 e-sig? | Compliance UX | D-SHP-5, 21 CFR Part 11 |
| OQ-UX-03 | Wave kanban: should drag-and-drop between columns be supported for manual wave status overrides, or strictly button-driven? | Wave builder UX | SHIP-013 |
| OQ-UX-04 | BOL PDF preview: should the preview be an inline iframe or a "preview in new tab" link? Inline iframe has cross-origin issues depending on storage URL. | SHIP-021 implementation |  D-SHP-19 |
| OQ-UX-05 | SSCC label: should the label preview in SHIP-019 show the actual GS1-128 barcode rendered as SVG/canvas, or a text placeholder? Barcode rendering library choice needed. | SHIP-019 | D-SHP-4 |
| OQ-UX-06 | Packing station tablet layout: single station only per session, or can one packer manage multiple stations from one tablet? Multi-station would need a station-switcher. | SHIP-017 | PRD §4.1 |
| OQ-UX-07 | D365 DLQ ops screen: this is shared with 08-PRODUCTION SCR-08-06. Should it be under `/admin/integrations` (existing) or accessible from Shipping Settings with a deep-link filter? | Navigation IA | D-SHP-14 §12.6 |
| OQ-UX-08 | Catch weight packing: when `weight_mode='catch'`, should the weight input appear as a separate modal-per-LP or inline in the box builder table row? | SHIP-017, D-SHP-17 | P2 CW full |
| OQ-UX-09 | RMA screens not listed in PRD §15 desktop screens but are mentioned in flows. Should RMA List and RMA Detail be full screens under `/shipping/rma` or embedded in SO detail? | IA decision | PRD §8.5, SHIP-007 |
| OQ-UX-10 | Multi-language allergen labels (V-SHIP-LBL-05, P2): should the language selector on SHIP-020 packing slip be hidden entirely until P2, or shown as a disabled P2 field? | Progressive disclosure | V-SHIP-LBL-05 |

---

## 10. Additional Screens

---

### SHIP-024 — Ship Confirmation

**Route:** Modal/action from SHIP-017 (Packing Station summary panel) or SHIP-007 (SO Detail Packs tab).
**Purpose:** Final confirmation that closes the shipment, fires the D365 outbox event, locks all LPs to 'shipped' status, and transitions SO → 'shipped'.
**Persona:** Dispatcher (shipping_manager role required).

**Pre-condition guards (checked in order before button enables):**
1. All `shipment_boxes` for this shipment have a non-null `sscc` field (V-SHIP-SHIP-01).
2. `shipments.bol_pdf_url` IS NOT NULL — BOL must be generated (V-SHIP-SHIP-02).
3. No open holds of type QA with severity='critical' on any allocated LP (V-SHIP-SHIP-03).
4. All `pick_list_lines` for associated pick lists are status IN ('picked', 'short') — no 'pending' lines remaining.

If any guard fails, "Confirm Shipment" button is disabled with a tooltip listing failed checks.

**Confirm Shipment Modal (560px):**
Header: "Confirm Shipment — SH-2026-00045"

Summary card (read-only):
- Shipment reference: SH-2026-00045
- Sales Order: SO-2026-00123 (link)
- Customer: Acme Foods Inc.
- Carrier: DHL Express (manual entry)
- Total boxes: 4 | Total weight: 124.6 kg
- SSCC count: 4 (all generated)
- BOL status: Generated + Signed (green badge) or Generated (awaiting signature — amber badge)
- D365 push: "Will be queued on confirm"

Checklist table:
| Check | Status |
|---|---|
| All boxes have SSCC | Pass / Fail |
| BOL generated | Pass / Fail |
| BOL signed | Pass (optional in P1) / Pending |
| No critical QA holds | Pass / Fail |
| All pick lines resolved | Pass / Fail |

If any Fail: row shows red badge and reason. Confirm button disabled.

Fields:
- Actual Ship Date: date, required, defaults today. Must be >= SO.promised_ship_date or amber warning "Ship date is later than promised."
- Carrier Pro Number: text, optional (P1 manual).
- Driver Name: text, optional (P1 manual).
- Notes: textarea, optional.
- Confirmation checkbox: "I confirm this shipment is complete and ready for dispatch."

"Confirm Shipment" primary button (green). Cancel secondary.

**On confirm:**
DB transaction:
1. `shipments.status = 'shipped'`, `shipped_at = NOW()`, `actual_ship_date = input`.
2. `sales_orders.status = 'shipped'` (if all shipments for SO are shipped).
3. All `license_plates` in `inventory_allocations` for this shipment → `status = 'shipped'`.
4. INSERT `shipping_outbox_events` (R14 UUID v7 idempotency key, shipment.confirmed event type, D365 payload as defined in PRD §12.5).
5. INSERT `shipping_audit_log` (action='ship_confirmed', actor=current user, details JSONB).

**D365 payload preview (collapsible):**
Expandable section showing the outbox event payload for dispatcher review:
```
Event: shipment.confirmed
dataAreaId: FNOR
shipmentId: SH-2026-00045
customerId: [d365_customer_id]
lines: [ { lineNum, itemId, qty, unitId } ]
boxes: [ { sscc, weight } ]
```

**States:**
- Guards failing: disabled button, inline red checklist.
- Submitting: spinner on button, "Confirming shipment…"
- Success: modal closes, toast "SH-2026-00045 shipped — D365 sync queued", SO status badge updates to Shipped (indigo).
- Error: red alert "Failed to confirm shipment — [reason]. No data was changed." Retry button.

---

### SHIP-025 — Documents Hub

**Route:** `/shipping/docs`
**Purpose:** Central list of all generated packing slips and bills of lading across all shipments. Print batches, upload signed BOLs, view version history.
**Persona:** Dispatcher, Coordinator (read), Admin.

**Layout:**
Page header with breadcrumb "Shipping / Documents", search bar (placeholder "Search by shipment, SO, or customer…"), two-tab bar (Packing Slips | Bills of Lading), Filters button, "Print All Unprinted" quick action.

**Packing Slips tab — Table Columns:**

| Column | Field | Type | Notes |
|---|---|---|---|
| Shipment | `shipments.reference` | link | SH-2026-00045 |
| SO# | `sales_orders.order_number` | link | SO-2026-00123 |
| Customer | `customers.name` | text | Acme Foods Inc. |
| Generated | timestamp | relative | "3 hours ago" |
| Version | number | text | v1 / v2 (stale indicator) |
| Allergen Labelled | boolean | badge | Yes (green) / No (gray) |
| Status | badge | Printed / Pending / Stale | |
| Actions | — | buttons | Preview / Print / Regenerate |

**Bills of Lading tab — Table Columns:**

| Column | Field | Type | Notes |
|---|---|---|---|
| Shipment | `shipments.reference` | link | SH-2026-00045 |
| SO# | `sales_orders.order_number` | link | SO-2026-00123 |
| Customer | `customers.name` | text | Acme Foods Inc. |
| Generated | timestamp | relative | "3 hours ago" |
| BOL Hash | monospace | 8-char prefix | SHA-256 prefix "a3f7c2…" |
| Signed | badge | Signed (green) / Pending (amber) / Not Required | |
| Retained Until | date | 7y from ship date | "2033-04-22" |
| Actions | — | buttons | Preview / Print / Upload Signed |

**Filters (both tabs):** Date range, Customer (autocomplete), Status, Allergen Labelled (slips only), Signed status (BOLs only).

**Bulk actions:** Print Selected, Download ZIP, Mark Printed.

**Stale slip warning:** If a packing slip was generated before the last SO line edit or weight change, the row shows amber badge "Stale" with tooltip "Regenerate recommended — shipment was modified after this slip was created."

**BRCGS retention notice:** Blue info banner: "BOLs are retained for 7 years per BRCGS Issue 10 §3.4. Deletion is disabled after signed BOL is uploaded."

**States:** Loading skeletons. Empty: "No documents generated yet — confirm packing to generate slips." Filtered empty: "No documents match your filters." Error: "Failed to load documents — retry."

---

### SHIP-026 — RMA List

**Route:** `/shipping/rma`
**Purpose:** Manage return merchandise authorisations. Create RMAs against shipped SOs, track incoming returns, manage QA disposition. P1 basic: create and list. P2: full disposition workflow.
**Persona:** Coordinator (create), QA (disposition), Manager (all).

**Layout:**
Page header with breadcrumb "Shipping / Returns", search input (placeholder "Search RMA#, customer, SO#…"), "Create RMA" primary button, Filters button. Summary chips: Open (amber), In Transit (blue), Received (green), Closed (gray). Full-width table with pagination.

**Table Columns:**

| Column | Field | Type | Notes |
|---|---|---|---|
| Checkbox | — | select | — |
| RMA# | `rma_orders.rma_number` | link | RMA-2026-00012 |
| Original SO | `sales_orders.order_number` | link | SO-2026-00123 |
| Customer | `customers.name` | text | Acme Foods Inc. |
| Reason | `rma_reason_codes` label | badge | Damaged / Wrong Item / Quality Issue |
| Lines | count | number | 2 |
| Status | badge | Open / In Transit / Received / Closed |
| Created | date | relative | "2 days ago" |
| QA Disposition | badge | Pending / Pass / Reject / Quarantine |
| Actions | — | buttons | View / ⋮ |

**Row overflow menu:** View RMA, Edit (open only), Close RMA, Generate Credit Note (P2), Print RMA Paperwork.

**Filters:**
- Status: Open / In Transit / Received / Closed
- Reason Code: from `rma_reason_codes` reference table (02-SETTINGS §8)
- Customer: autocomplete
- Date Range: created_at from/to

**States:** Loading, empty (no RMAs), filtered empty, error.

**P2 notice:** Blue info banner: "RMA disposition, credit note generation, and re-stocking to LP (05-WAREHOUSE) are Phase 2 features."

---

### SHIP-027 — RMA Detail

**Route:** `/shipping/rma/:id`
**Purpose:** Full RMA record with lines, return receiving, and QA disposition.
**Persona:** Coordinator (view/create), QA Lead (disposition), Manager (all).

**Layout:**
Page header: RMA# as h1, original SO link, customer name subtitle, status badge, action buttons "Edit" (open only), "Receive" (manager), "⋮" overflow. Tab bar: Lines | Receiving | QA Disposition | History.

**Lines tab:**
Table of `rma_lines`. Columns: Line#, Product (link), Qty Authorised, Qty Received (real-time), Unit Price (GBP), Reason, Notes. "Add Line" button (open status only).

**Receiving tab:**
Receive Return scanner card linking to `/scanner/shipping/return` (06-SCANNER-P1 SCN-072 return receive extension). Desktop fallback: manual receive form. Fields per line: Qty Actually Received (number, required per line), Received LP# (auto-assigned by system from 05-WAREHOUSE), Condition (select: Good / Damaged / Partial), Weight kg (catch weight P1 manual), Received At (datetime, defaults now). "Save Receiving" primary button.

**QA Disposition tab:**
Per-line disposition decisions (P1: basic). Each line: disposition badge (Pending / Pass / Reject / Quarantine), QA Notes textarea, Disposition By, Disposition At. "Save Disposition" (shipping_qa role). P2 full: re-stock to available LP, scrap workflow, credit note trigger.

**History tab:**
Audit log entries from `shipping_audit_log` scoped to this RMA. Same column structure as SO Detail History tab.

**States:** Loading skeleton, error per tab, empty lines tab CTA.

---

### SHIP-028 — Shipment Tracker (Delivery)

**Route:** `/shipping/sos/:id` (Packs tab → shipment row expand) or `/shipping/docs/:shipmentId` direct.
**Purpose:** Post-ship tracking and POD (Proof of Delivery) capture. P1: manual status updates. P2: carrier webhook auto-update.
**Persona:** Coordinator (view/update), Manager (update).

**Layout (embedded in Packs tab as expandable shipment row):**
When a shipment row in SHIP-007 Packs tab is expanded, a detail panel appears below showing:

Shipment header: SH# reference, carrier name, pro number, ship date.

Timeline tracker: horizontal step indicator with 4 milestones: Shipped → In Transit → Out for Delivery → Delivered. Active step highlighted in blue. Completed steps in green with timestamp. Future steps in gray.

P1 manual update section:
- Current Status: select (In Transit / Out for Delivery / Delivered / Exception)
- Estimated Delivery Date: date picker
- Tracking Notes: textarea
- "Update Status" primary button

POD capture:
- Delivered At: datetime picker
- Consignee Name: text
- POD Notes: textarea
- "Upload POD Document" file upload (image/PDF, Supabase Storage)
- "Mark as Delivered" primary button (green) — sets `sales_orders.status='delivered'`, `shipments.delivered_at=NOW()`, writes audit log.

P2 notice: "P2 — Carrier webhook integration (EPIC 11-F) will auto-update tracking status. P1: manual update only."

**States:** Pre-delivery: timeline shows Shipped as active. Delivered: all steps green, POD section shows uploaded document with download link. Exception: red step badge with tooltip.

---

## 11. Validation Rule Reference (Designer Guard Map)

The following validation rules from PRD §5 (V-SHIP-*) are referenced across screens. This table maps each rule to the UI element where it must surface.

| Rule ID | Description | Screen | UI Element |
|---|---|---|---|
| V-SHIP-SO-01 | Customer must be active (`is_active=TRUE`) | SHIP-006 Step 1 | Customer dropdown — inactive customers grayed out, tooltip "Inactive customer" |
| V-SHIP-SO-02 | Shipping address required before SO confirm | SHIP-007 Confirm button | Disabled with tooltip "Add a shipping address first (SHIP-003)" |
| V-SHIP-SO-03 | `allergen_validated=TRUE` required before confirm | SHIP-007 Confirm button | Disabled with tooltip "Allergen review required — see Step 3 of wizard" |
| V-SHIP-SO-04 | `promised_ship_date >= order_date` | SHIP-006 Step 1 | Inline date field error "Ship date cannot be before order date" |
| V-SHIP-SO-05 | At least 1 SO line required | SHIP-006 Step 2 | "Next" button disabled until line added |
| V-SHIP-SO-06 | All SO line quantities > 0 | SHIP-006 Step 2 | Inline error on qty field "Must be greater than zero" |
| V-SHIP-SO-07 | Cancel blocked if status='shipped' or 'delivered' | SHIP-007 / SHIP-005 overflow | Cancel button hidden; overflow menu item disabled with tooltip |
| V-SHIP-ALLOC-01 | LP must be status='available' in 05-WAREHOUSE | SHIP-008 LP candidates | Unavailable LPs shown grayed with badge "Unavailable (reserved)" |
| V-SHIP-ALLOC-02 | FEFO — select earliest-expiry LP first | SHIP-008 middle column | LPs sorted by expiry_date ASC; deviation requires override modal |
| V-SHIP-ALLOC-03 | Expired LP cannot be allocated without override | SHIP-008 LP candidates | Expired rows red text "EXPIRED", checkbox disabled; override toggle required |
| V-SHIP-ALLOC-04 | Allergen conflict on allocation triggers warning | SHIP-008 | Amber banner: "Allergen conflict — shipping_qa override required" |
| V-SHIP-PACK-01 | Each box must have at least 1 LP before close | SHIP-017 Close Box button | Disabled with tooltip "Add at least one item to this box" |
| V-SHIP-PACK-02 | Box weight > 0 required before SSCC generation | SHIP-017 Close Box confirm modal | Weight field required, error if 0 |
| V-SHIP-PACK-03 | GS1 Company Prefix required for SSCC | SHIP-017, SHIP-019 | Red persistent banner, SSCC generation disabled |
| V-SHIP-PACK-04 | SSCC sequence atomic — no duplicates | Server-side (SELECT FOR UPDATE) | No UI element; error toast if collision (should not occur in practice) |
| V-SHIP-PACK-05 | Allergen separation warning on box contents | SHIP-017 box builder | Amber inline banner in box builder |
| V-SHIP-SHIP-01 | All boxes must have SSCC before ship confirm | SHIP-024 Confirm modal checklist | Fail row in checklist, button disabled |
| V-SHIP-SHIP-02 | BOL must be generated before ship confirm | SHIP-024 Confirm modal checklist | Fail row in checklist, button disabled |
| V-SHIP-SHIP-03 | No critical QA holds open before ship confirm | SHIP-024 Confirm modal checklist | Fail row in checklist, button disabled |
| V-SHIP-LBL-01 | EU 1169/2011 — allergen names bold in PDF | SHIP-020, SHIP-021 | Server-side PDF rendering; designer: show `<strong>` placeholder in preview |
| V-SHIP-LBL-02 | SSCC check digit (GS1 mod-10) must validate | SHIP-019 / SHIP-017 | Server-side; toast "SSCC check digit error" if generation fails |
| V-SHIP-LBL-03 | BOL SHA-256 hash stored on generation | SHIP-021 | Immutability badge displayed after generation |
| V-SHIP-LBL-04 | Signed BOL deletion disabled (7y retention) | SHIP-021, SHIP-025 | Delete button hidden on signed BOL rows; tooltip "BRCGS 7-year retention" |
| V-SHIP-LBL-05 | Multi-language labels — P2 | SHIP-020 | Language selector shown as disabled with P2 badge |

---

## 12. Cross-Module Dependency Map

| This module | Links to | Dependency | Screen |
|---|---|---|---|
| SHIP-008 allocation | 05-WAREHOUSE LP state | `license_plates.status` SELECT FOR UPDATE. Hard-lock on allocate, release on cancel/ship | SHIP-008, SHIP-024, SHIP-011 |
| SHIP-004/SHIP-006 allergen | 03-TECHNICAL products | `products.allergens` JSONB, `allergen_cascade_v1` rule | SHIP-004, SHIP-006 Step 3, SHIP-017 |
| SHIP-009 allergen hold | 02-SETTINGS rules | `allergen_cascade_v1` registered in 02-SETTINGS §7. Changes take effect immediately | SHIP-004, SHIP-009 |
| SHIP-008 FEFO | 02-SETTINGS rules | `fefo_strategy_v1` registered in 02-SETTINGS §7. Expiry ASC NULLS LAST → received_date ASC | SHIP-008, SHIP-015, SHIP-017 |
| SHIP-009 QA hold | 09-QUALITY events | `quality.hold.created` event triggers LP hold in shipping. `batch_release_gate_v1` P2 | SHIP-009, SHIP-015 |
| SHIP-023 settings | 02-SETTINGS constants | D365 constants FNOR/ApexDG/FinGoods/APX100048 read-only in SHIP-023, edited in 02-SETTINGS §11 | SHIP-023 D365 tab |
| SHIP-024 ship confirm | 10-FINANCE (P2) | `shipment.confirmed` event consumed by 10-FINANCE for revenue recognition (P2 COGS consumer) | SHIP-024 |
| SHIP-006 pricing | 03-TECHNICAL products | `products.default_sell_price` auto-fills unit price on SO line | SHIP-006 Step 2, SHIP-007 Lines |
| SHIP-020/021 allergen labels | 03-TECHNICAL / 09-QUALITY | `allergen_cascade_v1` from 03-TECH §10 populates allergen section on packing slip and BOL per EU 1169/2011 | SHIP-020, SHIP-021 |
| SHIP-015/018 scanner | 06-SCANNER-P1 | Pick (SCN-040) and Pack (SCN-050) and Return (SCN-072) scanner flows entirely in 06-SCANNER-P1 | SHIP-015, SHIP-018, SHIP-027 Receiving |
| SHIP-024 D365 | External D365 (INTEGRATIONS stage 3) | `shipment.confirmed` → `shipping_outbox_events` → dispatcher worker → `@monopilot/d365-shipping-adapter` → D365 OData. Retry 5min/30min/2h/12h/24h, DLQ after 5 | SHIP-024, SHIP-023 D365 tab |

---

*End of 11-SHIPPING UX Specification v1.0 — 2026-04-20*
