# 03-TECHNICAL — UX Specification (for prototype generation)

> **Version**: 1.0 | **Date**: 2026-04-20 | **Source PRD**: 03-TECHNICAL-PRD.md v3.0
> **Purpose**: Self-contained specification for Claude Design HTML prototype generation. A designer with zero prior context should be able to build every screen, modal, and state from this document alone.

---

## 0. Module Overview

**Module**: 03-TECHNICAL — Product master, BOM, quality specs, D365 sync.

**Persona**: Quality Lead / Technical Manager (`quality_lead`), NPD Manager (`npd_manager`), NPD Team, Admin (`owner`/`admin`), Auditor (read-only).

**Key concepts**:
- **item_types**: `rm` (raw material), `intermediate` (in-process semi-finished, PR-code), `fa` (finished article), `co_product` (positive-value co-output), `byproduct` (no-value waste output).
- **PR-code pattern**: `PR<digits><process_letter>` — e.g., `PR5101R` means item 5101 finished the Roast process stage. Process letters for Forza: A (Coat), B, C, E, F (Slice), G, H, R (Roast). Each process step of an FA produces a first-class intermediate item in the item master (Phase D decision #19, N+1 pattern).
- **BOM versioning**: effective-dated, draft → approved → active → superseded. BOM snapshot (ADR-002) taken at Work Order creation — immutable for that WO.
- **Co-products**: `bom_co_products.allocation_pct` must sum to 100 across parent FA + all co-products (byproducts = 0).
- **BOM Generator**: async batch job producing per-FA XLSX files or a single batch XLSX, triggered by button.
- **Catch weight**: `weight_mode = 'catch'` — variable per-unit weight. GS1 AI 3103 (net weight) and 3922 (variable measure price).
- **Allergen cascade**: RM allergen profile → propagates to intermediate PR steps → aggregates at FA level. Manual overrides audited. Process-level additions merge in.
- **Shelf-life regulations**: 7 presets — EU 1169/2011, FSMA 204, BRCGS v9, ISO 22000, EU 2023/915, GS1 Digital Link, Peppol.
- **cost_per_kg per-item**: effective-dated history, source-attributed (manual / d365_sync / supplier_update / variance_roll).
- **D365 Integration stage 1**: nightly pull (items + BOM/formula) + on-demand trigger; push WO confirmations. Dead-letter queue (DLQ), idempotency keys [R14].

---

## 1. Design System (Inherited)

All screens inherit the MonoPilot design system tokens and component patterns defined in `MONOPILOT-SITEMAP.html`.

### Tokens

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active states, links, KPI bottom border |
| `--green` | `#22c55e` | Success badges, positive KPIs |
| `--amber` | `#f59e0b` | Warnings, draft states, pending |
| `--red` | `#ef4444` | Errors, blocked states, alerts |
| `--info` | `#3b82f6` | Informational banners |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Sidebar background (dark) |
| `--card` | `#fff` | Card/table background |
| `--text` | `#1e293b` | Primary text |
| `--muted` | `#64748b` | Secondary text, table headers |
| `--border` | `#e2e8f0` | Borders, dividers |
| `--radius` | `6px` | Card/button border radius |
| Font | Inter, system-ui | All text, 14px base |

### Layout

- **Sidebar**: fixed, 220px wide, dark background (`--sidebar`). Logo area 14px padding. Nav groups in uppercase 10px muted labels. Active item has left border `3px solid --blue` and `#1e3a5f` background.
- **Main content area**: `margin-left: 220px`, `padding: 40px 20px 20px`. Page title 20px/700 weight. Breadcrumb 12px muted below title.
- **Cards**: white background, 1px `--border`, `6px` radius, 16px padding.
- **Tables**: `width: 100%`, `border-collapse: collapse`, 13px font. `th` — 8px/10px padding, `#f8fafc` background, 2px bottom border, 12px/600 muted text. `td` — 7px/10px padding, 1px bottom border. Row hover: `#f8fafc` background.
- **Badges**: inline-block, 2px 8px padding, 10px border-radius, 11px font/500 weight. Colors: green (`#dcfce7 / #166534`), amber (`#fef3c7 / #92400e`), red (`#fee2e2 / #991b1b`), blue (`#dbeafe / #1e40af`), gray (`#f1f5f9 / #475569`).
- **KPI cards**: white, 1px border, 6px radius, 12px/14px padding. `kpi-label` 11px muted. `kpi-value` 26px/700. Bottom border 3px colored by status.
- **Buttons**: `btn-primary` — `--blue` background, white text. `btn-secondary` — white background, `--border` border. `btn-danger` — `--red` background. 6px/14px padding, 4px radius, 12px/500 font.
- **Form inputs**: full width, 7px/10px padding, 1px `--border`, 4px radius. Focus: border `--blue`, box-shadow `0 0 0 2px rgba(25,118,210,.15)`.
- **Modals**: overlay `rgba(0,0,0,0.5)`, modal box `560px` wide, 8px radius, 80vh max-height, scrollable. Title 16px/700 with close ×.
- **Tabs**: flex row, 2px bottom border container. Active tab: `--blue` border-bottom, `--blue` color, 600 weight. Inactive: `--muted` color.
- **Alerts/banners**: 10px/14px padding, left border 4px, 12px font. Colors match badge system.
- **Timeline items**: flex row, 8px dot, 12px font, muted timestamp right-aligned.

---

## 2. Information Architecture

### Sidebar Entry

The sidebar shows a single entry **Technical** (wrench icon) under the CORE group. When active, it expands to show sub-navigation items listed below.

### Inner Tabs / Sub-navigation

The Technical module uses a **top-tab navigation bar** rendered below the page header on all Technical screens. Tabs correspond to sub-sections:

| Tab Label | Route | Permission |
|---|---|---|
| Dashboard | `/technical` | All roles |
| Products | `/technical/products` | All roles (create: `technical.items.create`) |
| Materials | `/technical/materials` | All roles |
| BOMs | `/technical/boms` | All roles (approve: `technical.bom.approve`) |
| Routings | `/technical/routings` | All roles |
| Allergens | `/technical/allergens` | All roles (edit: `technical.allergens.edit`) |
| Nutrition | `/technical/nutrition` | All roles |
| Costing | `/technical/costing` | `quality_lead`, `owner` |
| Shelf-life | `/technical/shelf-life` | All roles |
| Traceability | `/technical/traceability` | All roles |
| D365 Sync | `/technical/d365-sync` | `admin`, `owner` only |

### Route Map

```
/technical                           Technical Dashboard (TEC-017)
/technical/products                  Products List (TEC-001)
/technical/products/:id              Product Detail (TEC-002)
/technical/materials                 Materials List (TEC-003)
/technical/materials/:id             Material Detail (TEC-004)
/technical/boms                      BOMs List (TEC-005)
/technical/boms/:id                  BOM Detail (TEC-006 + TEC-006a)
/technical/routings                  Routings List (TEC-007)
/technical/routings/:id              Routing Detail (TEC-008 + TEC-008a)
/technical/allergens                 Allergen Management (TEC-010)
/technical/allergens/warnings        Allergen Warnings Panel (TEC-012)
/technical/nutrition                 Nutrition Panel (TEC-009)
/technical/nutrition/calculator      Nutrition Calculator (TEC-011)
/technical/costing                   Recipe Costing (TEC-013)
/technical/costing/history           Cost History (TEC-015)
/technical/shelf-life                Shelf-life Config (TEC-014)
/technical/traceability              Traceability Search (TEC-016)
/technical/d365-sync                 D365 Integration Panel (TEC-070..073)
```

### Permissions Matrix

| Permission | quality_lead | npd_manager | npd_team | admin/owner | auditor |
|---|---|---|---|---|---|
| `technical.items.create` | Yes | Yes | Yes (RM only) | Yes | No |
| `technical.items.edit` | Yes | Yes | No | Yes | No |
| `technical.items.deactivate` | Yes | No | No | Yes | No |
| `technical.bom.create` | Yes | Yes | No | Yes | No |
| `technical.bom.approve` | Yes | No | No | Yes | No |
| `technical.bom.version_publish` | Yes | No | No | Yes | No |
| `technical.bom.generate_batch` | Yes | Yes | No | Yes | No |
| `technical.allergens.edit` | Yes | No | No | Yes | No |
| `technical.cost.edit` | Yes | No | No | Yes | No |
| `technical.d365.sync.trigger` | No | No | No | Yes | No |
| Read-only all | Yes | Yes | Yes | Yes | Yes |

---

## 3. Screens

---

### Screen TEC-017 — Technical Dashboard

**Route**: `/technical`
**Purpose**: Gives the Quality Lead a real-time snapshot of item/BOM health, D365 sync status, and recent changes.

**Layout**: Page header "Technical" with breadcrumb "Home / Technical". Five KPI cards in a single horizontal row. Below that, two columns: left column has a "Recent Changes" timeline card and a "Quick Actions" card; right column has a "D365 Sync Health" card and a "Product Type Breakdown" chart card.

**KPI Cards** (left to right, each 1/5 width):

| Label | Example Value | Change Text | Border Color |
|---|---|---|---|
| Products | 148 | ↑ 5 this week | `--blue` |
| Active BOMs | 92 | 3 drafts | `--green` |
| Routings | 45 | 2 pending approval | `--blue` |
| Allergen Overrides | 4 | This month | `--amber` |
| D365 Sync | Healthy | Last sync 2h ago | `--green` |

**Recent Changes Timeline**: Card titled "Recent Changes". Shows last 10 audit events as timeline rows. Each row: colored dot (blue=create, amber=edit, red=deactivate), timestamp, user name, action description (e.g., "BOM v3 approved for FA5101 — Jane NPD Manager"), and a muted relative time ("2h ago"). Link "View full audit log" at bottom.

**Quick Actions Card**: Two primary buttons — "+ Create Product" (opens Product modal) and "+ Create BOM" (opens BOM modal). Two secondary buttons — "Generate BOM Batch" (opens BOM Generator modal) and "Sync from D365" (opens D365 manual sync confirm modal, admin-only, hidden otherwise).

**D365 Sync Health Card**: Shows last successful pull timestamp, next scheduled pull time, pull success rate (e.g., "99.2% — last 30 days"), DLQ depth (e.g., "0 messages" green badge, or "3 messages" red badge with "View DLQ" link). If D365 integration is disabled (`integration.d365.enabled=false`), this card shows a muted banner "D365 integration is disabled. Enable in Settings > Integrations."

**Product Type Breakdown Chart**: Horizontal bar chart showing count of active items per type: rm, intermediate, fa, co_product, byproduct. Each bar labeled with count and percentage.

**Primary actions**: "+ Create Product" (btn-primary), "+ Create BOM" (btn-primary).
**Secondary actions**: "Generate BOM Batch" (btn-secondary), "Sync from D365" (btn-secondary, admin only).

**States**:
- Loading: KPI cards show animated skeleton placeholders. Timeline shows 5 skeleton rows.
- Populated: As described above.
- Error: Alert banner `alert-red` at top — "Failed to load dashboard data. [Retry]". KPI cards show "—" values with amber borders.
- Empty (new org): All KPIs show 0. Timeline card shows illustration (clipboard icon) with text "No activity yet. Start by creating your first product." and a "+ Create Product" button.

**Microcopy**: KPI card subtitles use relative language: "↑ 5 this week", "3 drafts pending approval". D365 DLQ shows "0 messages" as green badge when clean.

---

### Screen TEC-001 — Products List

**Route**: `/technical/products`
**Purpose**: Browsable, filterable list of all items in the item master across all types.

**Layout**: Page header "Products" with breadcrumb "Technical / Products". Filter bar below header. Table card below filters. Pagination at bottom.

**Filter Bar** (single horizontal row of controls):
- Search text input (placeholder: "Search by code or name…") — full-width flex-grow.
- Item Type dropdown (multi-select): All Types / RM / Intermediate / FA / Co-product / Byproduct.
- Status dropdown: All / Draft / Active / Deprecated / Blocked.
- Allergen filter dropdown: multi-select from EU-14 list — shows items containing selected allergens.
- D365 Sync Status dropdown: All / Synced / Unsynced / Drift / Error.
- "Clear filters" text link (appears when any filter is active).

**Table Columns**:

| Column Header | Type | Example | Sort |
|---|---|---|---|
| Code | text | `FA5101`, `PR5101R`, `RM-FLOUR-01` | Sortable |
| Name | text | Chicken Nuggets 1kg | Sortable |
| Type | badge | FA / Intermediate / RM / Co-product / Byproduct | Sortable |
| UoM | text | kg | — |
| Weight Mode | badge | Fixed / Catch | — |
| Cost/kg | currency | £5.20 | Sortable |
| Status | badge | Active / Draft / Deprecated / Blocked | Sortable |
| Allergens | icon list | up to 5 allergen icons, overflow "+N more" | — |
| D365 | badge | Synced / Drift / Error / Unsynced | — |
| Actions | buttons | Edit icon, three-dot menu | — |

**Badge color mapping for item type**: FA → blue, Intermediate → blue (lighter shade), RM → gray, Co-product → green, Byproduct → amber.

**Badge color mapping for status**: Active → green, Draft → amber, Deprecated → gray, Blocked → red.

**Badge color mapping for D365**: Synced → green, Drift → amber, Error → red, Unsynced → gray.

**Row actions**: Edit icon (pencil) opens Product Detail page. Three-dot menu: "View Detail", "Deactivate" (triggers Delete Confirmation modal with deactivation wording), "View BOM", "View Cost History", "D365 Sync Status".

**Primary actions**: "+ Create Product" button (btn-primary, top-right). Opens Product modal.
**Secondary actions**: "Import CSV" (btn-secondary), "Export CSV" (btn-secondary).

**Pagination**: Page size selector (20 / 50 / 100). Page number controls. "Showing 1–20 of 148 products".

**States**:
- Loading: Table skeleton — 8 rows of gray placeholders.
- Populated: Table as described.
- Empty (no items at all): Centered illustration (box with plus icon), heading "No products yet", body "Create your first product to get started with item master management." Button "+ Create Product" (btn-primary).
- Empty (filtered): "No products match your filters." with "Clear filters" link.
- Error: Alert-red banner "Failed to load products. [Retry]" above table.
- Permission-denied: If user lacks read permission (rare), full-page "Access Denied" message with contact admin guidance.

**Modals opened from this screen**: Product Create/Edit modal.

**Microcopy**: Allergen icon tooltips show full allergen name on hover. D365 "Drift" badge tooltip: "Local data differs from D365. Review required."

---

### Screen TEC-002 — Product Detail / Modal

**Route**: `/technical/products/:id`
**Purpose**: Full product record with all tabs — general info, allergens, BOM links, cost history, routing, shelf-life, D365 status, lab results, and supplier specs.

**Layout**: Full-page detail. Header section shows item code (large, monospaced), item name, item type badge, status badge, and last updated timestamp. Below header: horizontal tab strip. Tab content area below tabs takes full width.

**Tab strip** (in order): General | Allergens | BOMs | Nutrition | Costing | Shelf-life | Routing | Supplier Specs | Lab Results | D365 Status | History

#### Tab: General

Two-column grid layout. Left column: core identification fields. Right column: weight model and classification.

**Fields — Left column**:
- Item Code (read-only display, monospaced `FA5101`)
- Item Name (text input, required, max 200 chars, example: "Chicken Nuggets 1kg")
- Description (textarea, optional, max 1000 chars)
- Status (select: Draft / Active / Deprecated / Blocked)
- Product Group (text input, example: "FinGoods")
- D365 Item ID (text input, optional, example: "0001234", muted label "D365 mirror")

**Fields — Right column**:
- Item Type (radio group — drives conditional field visibility, see below)
- UoM Base (select: kg / g / l / ml / pcs, required)
- UoM Secondary (text input, appears only when Weight Mode = Catch — label "Nominal unit", example "piece")
- GS1 GTIN (text input, optional, 14-digit, example "05060523100016")

**Item Type radio — conditional field visibility**:

The item type radio is the primary conditional control. When a user selects a type, specific additional fields appear:

| Selection | Fields that appear / change |
|---|---|
| `rm` (Raw Material) | Supplier Code field appears. PR-code builder hidden. No BOM tab shown in tab strip (RM has no BOM). |
| `intermediate` | PR-code builder appears (see below). Process letter dropdown appears. Parent FA link field appears. |
| `fa` (Finished Article) | Date Code Format field appears. Shelf-life fields appear. GS1 GTIN field active. BOM tab shown. |
| `co_product` | Co-product allocation field (read-only, driven by parent BOM). Parent BOM link shown. |
| `byproduct` | "No cost allocation" note badge. Parent BOM link shown. |

**PR-code builder** (visible only when item_type = `intermediate`):
A composite field displayed as two adjacent inputs separated by a dash preview:
- "Digits" text input (placeholder: "5101", max 6 digits, numbers only).
- "Process letter" select (options: A / B / C / E / F / G / H / R for Forza; custom text input fallback).
- Live preview label below: "Code will be: PR5101R".
- Validation error inline if code already exists: amber banner "Code PR5101R already exists for this organisation."

**Weight model section** (card within General tab):
- Weight Mode (radio toggle: "Fixed" / "Catch weight"). Default: Fixed.
- Nominal Weight (number input, kg, required — label "Nominal / label weight (kg)", example "0.250").
- Tare Weight (number input, kg, optional, label "Packaging / tare weight (kg)", example "0.025").
- Gross Weight Max (number input, kg, appears only when Weight Mode = Catch, required if catch, label "Max gross weight (kg)").
- Variance Tolerance % (number input, appears only when Weight Mode = Catch, default "5.0", label "Catch variance tolerance (%)").

When Catch weight is selected, an informational banner `alert-blue` appears: "Catch weight mode requires GS1 AI 3103 (net weight) or 3922 (variable price) barcode encoding. Configure in the GS1 GTIN field above."

**Shelf-life section** (visible for fa and co_product, not rm or byproduct):
- Shelf Life Days (number input, required for FA, label "Shelf life (days)", example "180").
- Shelf Life Mode (radio: "Use By (safety)" / "Best Before (quality)"). Use By shows helper text "EU 1169/2011: Meat, fish, dairy — must use 'Use By'". Best Before shows "Dry goods, preserved — 'Best Before' is permitted."
- Date Code Format (select + custom text input, options: YYWW / YYYY-MM-DD / JJWW / YYJJJ / Custom). Preview renders below: "Preview: 2627" for YYWW with today's date.

**Actions bar** (sticky bottom of General tab):
- "Save changes" (btn-primary).
- "Cancel" (btn-secondary).
- "Deactivate item" (btn-danger, only if status=active and user has `technical.items.deactivate` permission).

**Tab: Allergens** — see TEC-010 description below (embedded tab view, same content filtered to this item).

**Tab: BOMs** — list of all BOM versions for this item. Table with columns: Version, Status (badge), Effective From, Effective To, Approved By, Actions (View / Set Active). "+ Create new BOM version" button.

**Tab: Nutrition** — see TEC-009 embedded panel.

**Tab: Costing** — shows current cost_per_kg value prominently (large number, currency symbol, effective date). "Edit cost" button opens Cost Adjustment modal. "View full history" link goes to `/technical/costing/history?item=:id`.

**Tab: Shelf-life** — regulatory compliance checklist showing which of the 7 regulations have been satisfied (green check / red x / amber warning). Edit fields for this item's shelf-life config.

**Tab: Routing** — list of routing versions for this item with same pattern as BOMs tab.

**Tab: Supplier Specs** — table: Supplier Code, Spec Version, Issued Date, Expiry Date, Declared Allergens (comma list), Status (Active / Expired). "+ Upload Spec" button.

**Tab: Lab Results** — table: Test Date, Test Type (ATP Swab / Allergen ELISA / Micro APC / Nutrition), Result Value + Unit, Result Status (Pass / Fail / Inconclusive / Pending), Lab Provider. "+ Add Lab Result" button.

**Tab: D365 Status** — shows d365_item_id, d365_last_sync_at, d365_sync_status badge, link to full D365 sync panel.

**Tab: History** — audit log for this item. Same timeline pattern as dashboard but filtered to this item_id. Columns: Timestamp, User, Action (CREATE / UPDATE / APPROVE / DEACTIVATE), Field Changed, Old Value, New Value.

**States**:
- Loading: Full-page skeleton loader — header area skeleton, tab strip skeleton, tab content skeleton table.
- Populated: As described.
- Error (item not found): Full-page message "Product not found" with "Back to Products" link.
- Permission-denied: Read-only mode — all inputs disabled, "Save" button hidden, notice banner "You have read-only access to this item."
- Unsaved changes: If user navigates away with unsaved changes, browser-style "Leave without saving?" confirm dialog appears.

**Modals opened from this screen**: Cost Adjustment modal, Allergen Manual Override modal, BOM version create modal, Lab Result add modal, Delete/Deactivate Confirmation modal.

**Microcopy**: Status change to Blocked shows inline warning "Blocking this item will prevent it from being used in new Work Orders and BOMs." Use-by vs best-before help text under the radio.

---

### Screen TEC-003 — Materials List

**Route**: `/technical/materials`
**Purpose**: Focused list view of `rm` type items (raw materials) with supplier and spec status context.

**Layout**: Same page structure as Products List (TEC-001). This screen pre-filters item_type to `rm` but keeps the same filter bar with type filter locked or hidden.

**Table Columns**:

| Column Header | Type | Example | Sort |
|---|---|---|---|
| Code | text | `RM-FLOUR-01` | Sortable |
| Name | text | Wheat Flour | Sortable |
| UoM | text | kg | — |
| Cost/kg | currency | £0.80 | Sortable |
| Status | badge | Active | Sortable |
| Allergens | icon list | Cereals icon | — |
| Supplier | text | FoodCo | — |
| Spec Expiry | date or badge | 2026-12-01 or "Expired" (red) | Sortable |
| Last Lab | badge | Pass / Fail / Pending | — |
| Actions | buttons | Edit, menu | — |

**Additional filter**: Supplier dropdown (all suppliers configured in Planning module). Spec Expiry filter: All / Expired / Expiring 30d / Valid.

**Primary actions**: "+ Create Material" (btn-primary), "Import from D365" (btn-secondary), "Export CSV" (btn-secondary).

**States**: Same four-state pattern as TEC-001.

---

### Screen TEC-004 — Material Detail / Modal

**Route**: `/technical/materials/:id`
**Purpose**: Full detail page for a raw material item, including supplier specs and lab results.

**Layout**: Same tab structure as Product Detail (TEC-002) but tabs limited to: General | Allergens | Nutrition | Costing | Supplier Specs | Lab Results | D365 Status | History.

No BOM tab (RM items do not define BOMs, they are BOM components). No Shelf-life tab (shelf-life is an FA concern). No Routing tab.

The General tab does not show PR-code builder, Date Code Format, or Shelf-life fields. Weight mode section is included (some RMs are catch weight if purchased by piece/variable weight).

Supplier Code field is required for RM items (not optional as for FA).

---

### Screen TEC-005 — BOMs List

**Route**: `/technical/boms`
**Purpose**: View all BOM headers across all versions, with status and approval state.

**Layout**: Page header "Bills of Materials". Filter bar. Table card. Pagination.

**Filter Bar**:
- Search (product name or BOM code).
- Product Type dropdown: All / RM / Intermediate / FA.
- Status filter: All / Draft / Approved / Active / Superseded.
- Effective date range picker (From / To).

**Table Columns**:

| Column Header | Type | Example | Sort |
|---|---|---|---|
| Product Code | text | FA5101 | Sortable |
| Product Name | text | Chicken Nuggets 1kg | Sortable |
| BOM Version | number | v3 | Sortable |
| Status | badge | Active / Draft / Approved / Superseded | Sortable |
| Yield % | number | 92.0% | — |
| Lines | number | 8 | — |
| Co-products | number | 1 | — |
| Effective From | date | 2026-01-01 | Sortable |
| Effective To | date | — (ongoing) | Sortable |
| Approved By | text | Jane Smith | — |
| Actions | buttons | View, Edit, Clone, menu | — |

**Badge color for BOM status**: Active → green, Draft → amber, Approved → blue, Superseded → gray.

**Row actions**: "View" link to BOM detail page. "Edit" opens BOM modal. "Clone" opens Clone BOM modal. Three-dot menu: "Approve", "Publish as Active", "Supersede", "View Snapshot History", "View Diffs".

**Primary actions**: "+ Create BOM" (btn-primary). "BOM Generator" (btn-secondary, with lightning-bolt icon, visible to `quality_lead` and `npd_manager`).
**Secondary actions**: "Export CSV" (btn-secondary).

**States**:
- Loading: 6-row skeleton.
- Populated: Table as described.
- Empty: "No BOMs defined yet. Create your first BOM to link a product to its raw materials." + "+ Create BOM" button.
- Empty (filtered): "No BOMs match your filters." + "Clear filters" link.
- Error: Alert-red banner with Retry.

---

### Screen TEC-006 — BOM Detail (Header + Lines + Co-products)

**Route**: `/technical/boms/:id`
**Purpose**: Full BOM management — view BOM header, add/edit/remove component lines, manage co-product allocation, trigger version workflow.

**Layout**: Page has a header section, then a horizontal tab strip (Lines | Co-products | Snapshot History | Version Diff | Version History Panel), then the tab content.

**Header section**: BOM badge showing "v3 — Active" (version number and status badge). Product name and code prominently. Effective date range (From: 2026-01-01 / To: ongoing). Yield percentage with inline edit icon. "Approved by Jane Smith on 2026-01-15" attribution line. Approval action buttons on the right: "Approve" (btn-primary, only in draft state), "Publish Active" (btn-success, only in approved state), "Edit Header" (btn-secondary).

**Tab: Lines**

This is the main BOM component table.

Table columns:

| Column Header | Type | Example | Sort |
|---|---|---|---|
| Line No | number | 1 | — |
| Component Code | text | RM-CHICKEN-01 | — |
| Component Name | text | Chicken Breast | — |
| Type | badge | RM / Intermediate | — |
| Qty | number with UoM | 0.450 kg | — |
| Scrap % | number | 2.00% | — |
| Process Stage | badge | A / R / F (process letter) | — |
| Sequence | number | 10 | — |
| Notes | text | truncated | — |
| Actions | icons | Edit pencil, Delete trash | — |

"+ Add Component" button above table (btn-primary). Drag-sort handle icon on each row (six-dot grip, left of Line No) for reordering.

**Yield calculation preview bar**: Below the table, a summary line: "Input: 1.000 kg components → Yield 92.0% → Output: 0.920 kg FA5101". Updates live as lines change.

**Tab: Co-products**

Table columns:

| Column Header | Type | Example |
|---|---|---|
| Co-product Code | text | COP-OFFAL-01 |
| Co-product Name | text | Chicken Offal |
| Type | badge | Co-product / Byproduct |
| Output Qty | number with UoM | 0.120 kg |
| Allocation % | number input | 15.000 |
| Is Byproduct | toggle | No |
| Actions | icons | Edit, Delete |

Below the table: "Allocation summary" bar showing: "Parent FA5101: 80.0% + Offal: 15.0% + Fat trim: 0.0% (byproduct) = 95.0%". When sum ≠ 100, a red validation banner appears: "Co-product allocation must sum to 100%. Current total: 95.0%."

"+ Add Co-product" button (btn-primary). "+ Add Byproduct" button (btn-secondary).

**Tab: Snapshot History**

Table of immutable BOM snapshots taken at WO creation. Columns: WO Number, Snapshot Date, Lines Count, Triggered By, "View Snapshot" (opens JSON diff viewer modal).

**Tab: Version Diff**

Two-column layout. Left column: version selector A dropdown. Right column: version selector B dropdown. "Compare" button. Output: side-by-side diff table showing line-by-line additions (green), removals (red), changes (amber). Line-by-line columns: Component, Qty, UoM, Scrap %, Process Stage.

**Tab: Version History Panel**

See PANEL-version-history description in Section 3 below.

**BOM header edit banner**: If BOM status is `active`, a blue banner shows at top: "This BOM is active and in use. Editing will create a new draft version." Edit action auto-bumps version.

**States**:
- Loading: Skeleton rows in Lines table, skeleton in header.
- Populated: As described.
- Empty (no lines): "No components added yet. Add your first raw material or intermediate to this BOM." + "+ Add Component".
- Error: Alert-red banner with Retry.

---

### Screen TEC-006a — BOM Items Detail (Component Line Add/Edit)

This is the per-component add/edit experience, accessible as a slide-over panel (not a full page) triggered by "+ Add Component" or the edit icon on a line.

**Slide-over panel** (400px wide from right edge, dark overlay):

Title: "Add Component" or "Edit Component — Line 3".

**Fields**:
- Component Item (searchable select/autocomplete, required, placeholder "Search item code or name…", shows type badge next to each option, excludes blocked/deprecated items).
- Quantity (number input, required, min 0.000001, example "0.450").
- UoM (select driven by selected component's `uom_base`, auto-populated on item selection).
- Scrap % (number input, default 0.00, min 0, max 99.99, label "Expected scrap/waste (%)").
- Process Stage (select: A / B / C / E / F / G / H / R / Custom, optional, label "Process stage (Forza letter)").
- Sequence (number input, default auto-incremented, label "Consumption sequence order").
- Notes (textarea, optional, max 500 chars).

**Footer actions**: "Save Component" (btn-primary), "Cancel" (btn-secondary).

**Validation inline**:
- V-TEC-13: If selected component would create a circular BOM (item references itself transitively), inline error appears immediately on item selection: "Circular BOM detected. This component would create a loop."
- V-TEC-14: If selected item is blocked or draft, warning appears: "This item is in 'blocked' state. Using it in an active BOM is not permitted."

---

### Screen TEC-007 — Routings List

**Route**: `/technical/routings`
**Purpose**: List all routing definitions with version and status.

**Layout**: Page header "Routings". Filter bar. Table card.

**Filter Bar**: Search (code or product name). Status filter (All / Draft / Approved / Active / Superseded). Product type filter.

**Table Columns**:

| Column Header | Type | Example | Sort |
|---|---|---|---|
| Code | text | `RTG-FA5101-v1` | Sortable |
| Product | text | Chicken Nuggets 1kg | Sortable |
| Version | text | v2 | Sortable |
| Operations | number | 4 | — |
| Total Time | computed | 2h 15m | — |
| Status | badge | Active / Draft | Sortable |
| Effective From | date | 2026-01-01 | — |
| Approved By | text | Jane Smith | — |
| Actions | icons | View detail, Edit, three-dot menu | — |

**Row three-dot menu**: Approve, Publish Active, Supersede, Clone, View Diffs.

**Primary actions**: "+ Create Routing" (btn-primary).
**Secondary actions**: "Export CSV" (btn-secondary).

**States**: Same four-state pattern as TEC-005.

---

### Screen TEC-008 — Routing Modal (Create / Edit Header)

This modal opens on "+ Create Routing" or "Edit" action from the Routings list.

**Modal size**: 560px wide. Title: "Create Routing" or "Edit Routing — RTG-FA5101-v2".

If editing an active routing, a yellow banner appears: "Editing an active routing will create a new draft version (v3). Previous version remains active until you publish this one."

**Section 1 — Identification**:
- Routing Code (text input, required, uppercase enforced, label "Routing code", placeholder "RTG-FA5101-v1", validation: unique per org).
- Product (searchable select, required, locked/read-only in edit mode).
- Description (textarea, optional, max 500 chars).
- Status (select: Draft / Approved / Active / Superseded — only available in edit mode, auto-managed in create mode).
- Is Reusable (checkbox, default checked, label "Reusable across multiple products").
- Version display (read-only text, only in edit mode, e.g., "Version: v2").

**Section 2 — Cost Configuration (ADR-009)**:
Card within modal, title "Cost Configuration".
- Setup Cost (number input, decimal 10.2, min 0, default 0, label "Fixed setup cost per routing run", placeholder "0.00").
- Working Cost per Unit (number input, decimal 10.4, min 0, default 0, label "Variable cost per output unit").
- Overhead % (number input, decimal 5.2, min 0, max 100, default 0, label "Factory overhead allocation (%)").
- Currency (select: PLN / EUR / USD / GBP, default PLN).

**Section 3 — Info Banner**:
Blue `alert-blue` banner: "Operations (steps, times, machines) are managed in the Routing Detail page after saving."

**Footer**: "Save Routing" (btn-primary), "Cancel" (btn-secondary).

**States**:
- Default create: All fields empty/default.
- Edit: Pre-populated, product field read-only.
- Loading (saving): Button shows spinner "Saving…".
- Error: Red `alert-red` banner at top of modal "Failed to save routing. [error detail]".
- Unsaved changes: If user clicks Cancel with changes, confirm "Leave without saving?" dialog.

---

### Screen TEC-008a — Routing Detail

**Route**: `/technical/routings/:id`
**Purpose**: Manage the sequence of routing operations (steps, times, resources) for a routing definition.

**Layout**: Page header shows routing code, product name, version badge, status badge. Below: summary card and operations table.

**Header band**: Routing Code (monospaced, large), Product Name, "v2" version badge (amber if draft, green if active), Status badge, "Edit Routing" button (opens TEC-008 modal), "Approve" button (if draft, btn-primary), "Publish Active" button (if approved, btn-success).

**Cost / Duration Summary Card**:
Row of four mini-KPIs: Total Setup Time (e.g., "35 min"), Total Run Time per Unit (e.g., "155 sec/unit"), Est. Setup Cost (e.g., "£12.50"), Est. Labor Cost/hr (e.g., "£45.00"). Below: expandable "Cost Breakdown" panel (collapsed by default). When expanded, shows per-operation rows: Op Name | Setup min | Cleanup min | Run sec/unit | Labor £/hr | Est. Cost.

**Operations Table**:

| Column | Type | Example |
|---|---|---|
| Drag handle | icon | six-dot grip |
| Seq | number | 10 |
| Op Code | text | `cook` |
| Operation Name | text | Roasting |
| Line | text | Line 1 |
| Machine | text | Oven A |
| Setup (min) | number | 15 |
| Run (sec/unit) | number | 60.0 |
| Cleanup (min) | number | 10 |
| Yield % | number | 98.0% |
| Labor £/hr | number | £18.50 |
| Actions | icons | Edit pencil, Delete trash |

"+ Add Operation" button above table (btn-primary). Operations are drag-sortable (grip icon).

**Related BOMs section** (below operations table): Lists BOMs that reference this routing. Columns: BOM Code, Product, Version, Status. Link to each BOM detail.

**Operation add/edit inline panel** (slide-over from right, 400px):
Title: "Add Operation" or "Edit Operation — Seq 20".

Fields:
- Sequence No (number, required, auto-suggested next multiple of 10).
- Op Code (text, required, options: mix / cook / cool / pack / custom, label "Operation code").
- Operation Name (text, required, 3–100 chars, example "Roasting").
- Production Line (searchable select, optional, from Settings > Production Lines).
- Machine (searchable select, optional, from Settings > Machines, filtered by selected line).
- Setup Time (number, min, default 0, label "Setup time (minutes)").
- Run Time per Unit (number, seconds, required, min 0.01, label "Run time per output unit (seconds)").
- Cleanup Time (number, min, default 0, label "Cleanup time (minutes)").
- Expected Yield (number, %, default 100.0, range 0–100, label "Expected yield at this operation (%)").
- Labor Cost per Hour (decimal, currency, label "Labor cost per hour (£/hour)").
- Process Stage (select: A/B/C/E/F/G/H/R/Custom, optional, label "Forza process stage letter (matches BOM line)").
- Instructions (textarea, optional, max 2000 chars, label "Operator instructions for this step").

Footer: "Save Operation" (btn-primary), "Cancel" (btn-secondary).

**Validation**: V-TEC-61 — at least line_id or machine_id must be set (warning, not hard block in UI, soft advisory banner). V-TEC-62 — run_time > 0 required. V-TEC-63 — process_stage must be from reference list if Forza org.

**States**:
- Loading: Skeleton in summary card + skeleton rows in operations table.
- Populated: As described.
- Empty (no operations): "No operations yet. Add the first step in this routing." + "+ Add Operation".
- Error: Alert-red banner at top with Retry.

---

### Screen TEC-010 — Allergen Management

**Route**: `/technical/allergens`
**Purpose**: View and manage allergen profiles across all items, see the cascade preview, manage the contamination risk matrix, and review lab results.

**Layout**: Page header "Allergen Management". Four inner tabs: Item Profiles | Cascade Preview | Process Additions | Contamination Risk Matrix.

#### Tab: Item Profiles

A searchable, filterable matrix view showing all items and their allergen declarations.

**Filter bar**: Search by item name/code. Item Type filter. Allergen filter (show only items with a specific allergen). Source filter (all / contains / may_contain / trace). Confidence filter (declared / tested / assumed).

**Matrix table** (transposed): Rows = items. Columns = EU-14 allergens (abbreviated: Cel / Cer / Cru / Egg / Fis / Lup / Mil / Mol / Mus / Nut / Pea / Ses / Soy / Sul). Plus any org-custom allergens.

Each cell shows one of:
- Filled circle (●) = Contains. Color: red.
- Half circle (◐) = May Contain. Color: amber.
- Small dot (·) = Trace. Color: amber, muted.
- Empty (—) = Not declared.
- Override badge (★) = Manual override in place (blue star icon). Hover shows override reason tooltip.
- Cascaded badge (→) = Value from cascade (gray arrow icon). Hover shows "Inherited from: RM-CHICKEN-01, RM-FLOUR-01".

**Row actions**: "Edit allergens" (pencil icon) — opens the per-item allergen profile editor as a slide-over panel. For FA items, also shows "Override" button.

**Allergen profile editor slide-over** (per item):
Title: "Allergen Profile — FA5101 Chicken Nuggets 1kg".
Table of all 14 EU allergens + org custom. Each row:
- Allergen name + code.
- Source badge (brief_declared / supplier_spec / lab_result / cascaded / manual_override).
- Intensity select (Contains / May Contain / Trace / Not declared).
- Confidence badge (declared / tested / assumed).
- If source = cascaded: "Inherited, read-only. Use Override to change."
- If source = manual_override: override reason shown in amber box, "Clear override" link.

"Save profile" (btn-primary), "Cancel" (btn-secondary).

**Per-item override entry** (from "Override" button): Opens Allergen Manual Override modal (see Section 4 — Modals).

#### Tab: Cascade Preview

**Purpose**: Visualise the full allergen inheritance chain for a selected FA.

**FA selector**: Dropdown at top — select an FA item. Default: first FA alphabetically.

**Cascade tree** (visual):
Rendered as a tree with three levels. Each level shows a card group:

- Level 1 (RM inputs): Small cards for each RM component in the active BOM. Each card shows: item code, name, and colored dots for allergens it contains.
- Level 1.5 (Process additions): If any BOM line has a process_stage letter that has process_allergen_additions configured, a horizontal band shows "Process A adds: Mustard (A12)" in an amber chip.
- Level 2 (Intermediate PR steps, if any): Cards for each PR intermediate, showing which allergens they carry forward.
- Level 3 (FA result): One card for the FA showing the aggregated allergen profile — DISTINCT UNION of all inputs. Allergens marked with cascade source shown in gray. Manual overrides shown with blue star. Overridden cascaded values shown with strikethrough on the cascaded value and the override value beside it.

**Arrows**: Downward arrows between levels, labeled "Cascade →". If a manual override exists on the FA, the arrow for that allergen has a blue override badge.

**Mismatch warning**: If the FA's declared allergen profile is out of sync with cascade result (stale cascade), an amber banner shows: "Allergen cascade is outdated. Last recalculated: 2 days ago. [Recalculate now]"

#### Tab: Process Additions

**Purpose**: Manage the `process_allergen_additions` table — which process letters add which allergens.

Admin-only edit access. Read-only for other roles with a muted banner "Manage process allergen additions in Settings > Reference Tables."

Table columns: Process Code (letter badge, e.g., "A"), Process Name (e.g., "Coating"), Allergen Code, Allergen Name, Reason (text, e.g., "Coating marinade contains mustard"), Actions (Edit / Delete).

"+ Add Process Addition" button (admin only, btn-primary). Opens small modal: Process Code (select A/B/C/E/F/G/H/R), Allergen (select from reference list), Reason (text, required).

#### Tab: Contamination Risk Matrix

**Purpose**: View and edit the `allergen_contamination_risk` table — which production lines and machines have which allergen risks.

Grid table. Rows = production lines / machines. Columns = EU-14 allergens. Each cell: risk level badge (High=red / Medium=amber / Low=green / Segregated=blue / Not Assessed=gray).

Click any cell → opens risk entry modal:
- Risk Level (select: High / Medium / Low / Segregated).
- Mitigation (select: Full clean required / Barrier between runs / Dedicated line / Other).
- Last Assessed At (date picker).
- Assessed By (text/user reference).
- "Save" (btn-primary).

"Refresh Matrix" button recalculates based on latest BOM data. Warning badge on any cell that has never been assessed: "Not assessed" in gray.

**States for TEC-010**: Loading — skeleton matrix. Populated — as described. Empty (no items) — "No items with allergen profiles yet." Error — alert-red banner.

**Microcopy**: Cascade Preview tab shows "DISTINCT UNION" tooltip on the FA output card explaining the aggregation logic.

---

### Screen TEC-012 — Allergen Warnings Panel

**Route**: `/technical/allergens/warnings`
**Purpose**: Surface all active allergen warnings, pending overrides, and compliance gaps.

**Layout**: Three card sections stacked vertically.

**Card 1 — Compliance Gaps**: Table of FAs that are missing allergen declarations (V-TEC-40 / V-TEC-33 gap). Columns: FA Code, FA Name, Missing Declaration, Severity (Error / Warning), Action ("Review").

**Card 2 — Pending Override Requests**: Table of manual override entries awaiting dual sign-off (if multi-approval configured). Columns: Item, Allergen, Requested By, Request Date, Override Reason, Status, Actions (Approve / Reject).

**Card 3 — Recent Override Audit**: Last 20 allergen override events. Columns: Timestamp, Item, Allergen, Old Value, New Value, Override Reason, User.

**Primary actions**: "Export Allergen Report" (btn-secondary) — generates PDF/CSV of all FA allergen profiles.

---

### Screen TEC-009 — Nutrition Panel

**Route**: `/technical/nutrition`
**Purpose**: View and edit nutrition declarations for products (per 100g, EU 1169/2011 labelling format).

**Layout**: Page header "Nutrition". Product selector dropdown at top. Below: two cards side by side — "Declared Values" and "Calculated from BOM".

**Declared Values card**:
Table of nutrients per 100g. Rows:

| Nutrient | Value | Unit | Editable |
|---|---|---|---|
| Energy | 1048 | kJ / 250 kcal | Yes |
| Fat | 12.0 | g | Yes |
| of which saturates | 3.5 | g | Yes |
| Carbohydrate | 18.0 | g | Yes |
| of which sugars | 1.2 | g | Yes |
| Fibre | 1.8 | g | Yes |
| Protein | 15.5 | g | Yes |
| Salt | 0.85 | g | Yes |

"Edit" button toggles inline edit mode. "Save" / "Cancel" appear when editing.

**Calculated from BOM card**:
Shows the computed nutrition roll-up based on active BOM components and their declared nutrition values. Columns: Nutrient, Calculated Value, Declared Value, Variance. Color-coded: within 2% = green, 2–10% = amber, >10% = red. "Recalculate" button triggers the computation.

**"Calculate from BOM" button** (btn-secondary) at bottom of declared card — opens Nutrition Calculator modal.

**States**: Loading — skeleton. No product selected — "Select a product to view nutrition panel." No BOM — calculated card shows "No active BOM found for this product."

---

### Screen TEC-011 — Nutrition Calculator Modal

**Route**: Opens as modal from Nutrition Panel.
**Purpose**: Step-by-step calculator to derive nutrition values from BOM ingredient quantities.

**Modal size**: 700px wide (wider than standard 560px to accommodate two-column layout).
**Title**: "Nutrition Calculator — FA5101 Chicken Nuggets 1kg".

**Section 1 — Ingredient Inputs**:
Table of BOM components. For each component: Item Code, Name, Qty in BOM (kg), Nutrition source (select: Declared Values / Supplier Spec / Manual), and per-100g nutrient columns (editable if Manual source). Each row shows if nutrition data is missing for that ingredient (amber "Missing" badge — clicking opens that item's nutrition tab).

**Section 2 — Calculation**:
"Run calculation" button. On click: spinner, then results appear.

**Section 3 — Results**:
Split view: Calculated per-100g column vs Current Declared column with variance column. Checkboxes next to each nutrient row — user selects which calculated values to apply to declared values.

**Footer**: "Apply selected values" (btn-primary) — updates declared nutrition with selected rows. "Cancel" (btn-secondary).

---

### Screen TEC-013 — Recipe Costing

**Route**: `/technical/costing`
**Purpose**: Full cost breakdown of a product from BOM — material cost, routing labor cost, overhead — arriving at a total cost per kg / per unit.

**Layout**: Page header "Recipe Costing". Product + BOM version selector at top. Below: Materials Cost card, Routing Cost card, Cost Summary card.

**Materials Cost Card**:
Table columns: Component Code | Component Name | Qty (kg or UoM) | UoM | Unit Cost (£/kg) | Scrap % | Effective Qty | Total Cost.
Footer row: "Materials Total: £3.02".
"Cost per kg" indicator: "£3.02 / 0.920 kg yield = £3.28/kg materials".

**Routing Cost Card**:
Table columns: Op Code | Operation Name | Setup Time (min) | Run Time (sec/unit) | Labor £/hr | Overhead % | Setup Cost | Run Cost | Op Total.
Footer row: "Routing Total: £0.63".

**Cost Summary Card**:
Large display:
- Materials: £3.02 (65.4%)
- Routing / Labor: £0.63 (13.6%)
- Overhead: £0.45 (9.8%)
- **Total Cost: £4.10/unit** (large, bold)
- **Cost per kg: £4.46/kg** (large, bold, derived from total / yield weight)
- **vs current cost_per_kg: £4.20/kg** → Variance: +6.2% (amber badge if >5%, green if within).

"Update item cost to £4.46/kg" button (btn-primary, only for `quality_lead` / `owner`). Clicking opens Cost Adjustment modal pre-filled with calculated value.

**Secondary actions**: "Export as PDF" (btn-secondary), "Export CSV" (btn-secondary).

**States**: Loading — skeleton cards. No BOM — "No active BOM found. Create a BOM to calculate costing." Error — alert-red.

---

### Screen TEC-015 — Cost History Panel

**Route**: `/technical/costing/history`
**Purpose**: View the per-item cost_per_kg history with source attribution and effective-date timeline.

**Layout**: Page header "Cost History". Product selector. Below: line chart + history table.

**Line chart**: X-axis = time (selectable range: 3M / 6M / 12M / All). Y-axis = cost per kg (currency). Data points plotted per `item_cost_history` row. Each point tooltip shows: Date, Value, Source badge, Created By. Color of line varies by source type: manual = blue, d365_sync = purple, supplier_update = green, variance_roll = amber.

**History Table**:

| Column | Type | Example |
|---|---|---|
| Effective From | date | 2026-01-01 |
| Effective To | date | 2026-03-31 |
| Cost per kg | currency | £4.20 |
| Currency | text | PLN |
| Source | badge | d365_sync / manual / supplier_update / variance_roll |
| Created By | text | System / Jane Smith |
| Created At | datetime | 2026-01-01 09:00 |
| Notes | text (truncated) | D365 nightly pull |

"+ Add cost entry" button (btn-primary, `quality_lead` / `owner` only). Opens Cost Adjustment modal.

**States**: Loading — chart skeleton + table skeleton. No history — "No cost history for this product." Empty chart shows grey dashed line at 0.

---

### Screen TEC-014 — Shelf-life Config

**Route**: `/technical/shelf-life`
**Purpose**: Per-item shelf-life configuration with regulatory preset selection.

**Layout**: Page header "Shelf-life Configuration". Product selector. Regulatory Preset section. Per-item config section. Preview section.

**Regulatory Preset Section**:
Card titled "Regulatory Context". Seven preset buttons arranged as a chip group. Each chip is a toggle — when selected, it becomes filled blue. Multiple presets can be selected simultaneously:

| Preset ID | Label | Short description shown below chip |
|---|---|---|
| EU-1169 | EU 1169/2011 | Allergens + Use By declaration |
| FSMA-204 | FSMA 204 | US lot genealogy + traceability |
| BRCGS-v9 | BRCGS v9 | Retail food safety + SOPs |
| ISO-22000 | ISO 22000 | Food safety management |
| EU-2023 | EU 2023/915 | Contaminant max levels |
| GS1-DL | GS1 Digital Link | 2D barcode AI encoding |
| Peppol | Peppol | e-Invoicing item spec |

When a preset is toggled, a contextual information card appears below the chips explaining the specific obligation for the current item type. For example, selecting EU-1169 shows: "For this FA, EU 1169/2011 requires: Use By declaration, declared allergens for EU-14 categories, net weight on label."

**Per-item Config Section** (card):
- Shelf Life Days (number, required for FA, label "Days from production date", example "180").
- Shelf Life Mode (radio: "Use By (safety critical)" / "Best Before (quality indicator)"). Use By = `use_by`, Best Before = `best_before`.
- Date Code Format (select + custom: YYWW / YYYY-MM-DD / JJWW / YYJJJ / Custom). Custom input appears if "Custom" selected.
- Min Days Remaining for Sale (number, optional, label "Minimum remaining shelf life to allow sale").
- Min Days Remaining for Shipment (number, optional, label "Minimum remaining shelf life to allow shipment").

**Preview Section** (card):
Title "Label Preview". Shows simulated label text:
- Use By mode: "Best before end: [date rendered from format]" or "Spożyć do: [date]" (based on org locale).
- Best Before mode: "Best before: [date]".
- Date code rendered: "Batch: 2627" (for YYWW with 2026 W27).

"Save shelf-life config" (btn-primary). "Cancel" (btn-secondary).

**Compliance indicator**: At bottom of config card — checklist of regulatory obligations based on selected presets, with green checkmarks or red X for each satisfied / unsatisfied obligation.

**States**: Loading — skeleton. No product selected — instruction prompt. Populated — as described.

---

### Screen TEC-016 — Traceability Search

**Route**: `/technical/traceability`
**Purpose**: Recursive lot genealogy — given any lot/LP/batch number, show the full upstream ingredient chain or downstream shipment chain.

**Layout**: Page header "Traceability Search". Search bar at top. Direction toggle. Results panel below.

**Search bar**: Single text input, full width, placeholder "Enter Lot number, LP number, or Batch number…". Large, prominent. Search button beside it (btn-primary, "Search").

**Direction toggle**: Two radio buttons immediately below search bar: "Forward (downstream → shipments)" / "Backward (upstream → ingredients)". Default: Backward.

**Performance note banner**: Informational `alert-blue` below toggle: "FSMA 204 requires traceability queries to complete in under 30 seconds for critical tracking events."

**Results Panel** (appears after search):

**Summary card**: Item name, lot number, production date, WO number, FA code, current status (available / shipped / consumed). Breadcrumb of the chain depth found.

**Genealogy Tree**:
A hierarchical tree rendered with expand/collapse on each node. Each node is a card showing:
- Item code and name (bold).
- Lot / LP / Batch number.
- Date (production or receipt).
- Qty and UoM.
- Location (warehouse / line).
- Source type badge (RM Receipt / Production Output / Intermediate).

Children of each node represent the ingredients or outputs depending on direction. Tree is indented with connecting lines. Each level has a colored dot: RM = gray, Intermediate = blue, FA = green, Shipment = purple.

Maximum tree depth: 10 levels. If depth exceeded, "Show more levels" link.

**Export**: "Export Genealogy as PDF" (btn-secondary), "Export CSV" (btn-secondary).

**States**:
- Empty (before search): Illustrated prompt "Enter a lot, LP, or batch number to start traceability search."
- Loading (after search): Spinner with "Searching… this may take up to 30 seconds for deep chains." Progress text.
- No results: "No records found for '[input]'. Check the number and try again."
- Results: As described.
- Error (timeout): "Search timed out. The chain may be too deep for real-time display. [Export as background job]."

---

### Screen TEC-070..073 — D365 Integration Panel

**Route**: `/technical/d365-sync`
**Purpose**: Full D365 integration management — connection health, sync schedule, manual trigger, sync audit log, dead-letter queue, and idempotency key inspector.

**Layout**: Page header "D365 Integration". Four inner tabs: Overview | Sync Log | Dead-Letter Queue | Idempotency Inspector.

**Access control**: This entire screen is restricted to `admin` and `owner` roles. Other roles see a full-page "Access Denied" message: "D365 sync management requires Administrator access. Contact your system administrator."

#### Tab: Overview (TEC-070)

**Connection Status Card**:
Large status indicator at top — green "Connected" circle icon or red "Disconnected". Below: D365 Base URL (muted, truncated), API Version, Last Test: "2026-04-20 08:00:12 (2h ago)". "Test Connection" button (btn-secondary) — triggers live ping, shows spinner then "Connected ✓" or "Failed ✗ — [error message]".

**Integration Feature Flag**: Toggle switch with label "D365 Integration Enabled (`integration.d365.enabled`)". Toggling off shows confirmation modal: "Disabling D365 integration will stop all nightly syncs and push confirmations. Are you sure?" Toggle is disabled (locked) if the 5 required Forza D365 constants are not all populated (validation V-SET-42 from 02-SETTINGS) — shows tooltip "Complete all 5 D365 constants in Settings > Integrations before enabling."

**Sync Schedule Card**:
- Nightly Pull Schedule: "Daily at 02:00 (Europe/Warsaw)". "Edit schedule" link.
- Last successful pull: "2026-04-20 02:14:33 (6h ago)" — green badge "OK".
- Next scheduled pull: "2026-04-21 02:00:00 (18h from now)".
- Pull entities: items ✓, BOM/formula ✓.

**Success Rate KPIs** (four mini-KPIs):

| Label | Value | Color |
|---|---|---|
| Pull success rate (30d) | 99.2% | green |
| Push success rate (30d) | 97.8% | green |
| DLQ depth | 0 | green (red if >0) |
| Avg pull duration | 18 min | green |

**On-Demand Sync Panel**:
Title "Manual Sync". Two buttons side by side:
- "Pull from D365 now" (btn-primary) — opens D365 Manual Sync Confirm modal (entity + direction choice, then confirm).
- "Push pending confirmations" (btn-secondary) — opens simplified confirm modal for push-only.

Below: last manual trigger timestamp and who triggered it.

**Recent Sync Jobs Table** (last 10 runs):

| Column | Example |
|---|---|
| Job ID | `job-2026-04-20-001` |
| Direction | Pull / Push badge |
| Entity | items / bom / wo_confirmation |
| Status | Completed / Failed / Running / DLQ badge |
| Records Processed | 1,248 |
| Records Failed | 0 |
| Duration | 18 min |
| Trigger Source | cron / manual |
| Started At | 2026-04-20 02:00 |

Row click → opens sync run detail slide-over showing full error_summary and per-entity counts.

#### Tab: Sync Log (TEC-072)

**Purpose**: Detailed per-run audit with diff views.

**Filter bar**: Date range, Direction (Pull/Push), Entity, Status.

**Table**: Same columns as Recent Jobs Table above but full history. Paginated (20 per page).

Row action "View Diff" → opens a modal with JSON diff viewer showing what changed in each entity during that run (additions in green, removals in red, changes in amber).

#### Tab: Dead-Letter Queue (TEC-073)

**Purpose**: View, retry, and resolve failed sync messages.

**Alert banner** (always shown if DLQ depth > 0): `alert-red` — "DLQ has N failed records. Review and retry or mark as resolved. SLA: resolve within 48h."

**Filter bar**: Entity filter, Error type filter, Date range, Show Resolved toggle (default off).

**DLQ Table**:

| Column | Type | Example |
|---|---|---|
| Record Key | text | D365 item id or local UUID |
| Entity | text | items / bom / wo_confirmation |
| Sync Job | link | job-2026-04-20-001 |
| Error Message | text (truncated) | "400 Bad Request: duplicate key" |
| Retry Count | number | 2 |
| Last Retry | datetime | 2026-04-20 03:00 |
| Created | datetime | 2026-04-20 02:00 |
| Status | badge | Failed / Resolved |
| Actions | buttons | Retry, View Payload, Mark Resolved |

**Row actions**:
- "Retry" — opens D365 DLQ Retry modal (see Section 4).
- "View Payload" — opens JSON payload viewer modal (read-only, shows full JSONB payload).
- "Mark Resolved" — opens confirmation: "Mark this record as manually resolved? Enter resolution note:" textarea, then "Confirm" (btn-primary). Sets resolved_at timestamp and resolution text.

**Bulk actions** (checkboxes on rows): "Retry selected", "Mark selected as resolved".

**Empty state** (no DLQ items): Green check illustration, "Dead-letter queue is empty. All sync records are healthy." ✓

#### Tab: Idempotency Inspector

**Purpose**: Allow admins to inspect idempotency keys to diagnose duplicate-detection issues (R14).

**Search field**: "Enter idempotency key…" text input + "Lookup" button.

**Result card** (when key found):
- Idempotency Key (monospaced).
- Job ID link.
- Direction, Entity, Status.
- "This key was already processed. Duplicate requests with this key will be rejected (409 Conflict)." banner if status=completed.
- "This key has not been used." if not found.

**Recent keys table**: Last 50 idempotency keys with Status, Created At, Processed At.

---

### Panel: PANEL-material-usage — Material Usage Panel

**Accessible from**: BOM detail page (TEC-006) via "View Material Usage" button, and from Materials list (TEC-003) via row action.

**Rendered as**: Slide-over panel from the right (480px wide).

**Title**: "Material Usage — RM-FLOUR-01 Wheat Flour".

**Content**:
- Summary header: "Used in 12 active BOMs across 4 FA items."
- Table: BOM Code | FA Product | FA Code | Version | Qty per BOM | Process Stage | BOM Status badge.
- "View BOM" link on each row.
- Forecast consumption section: "Next 4 weeks planned WO consumption: 320 kg (based on planning module)."

---

### Panel: PANEL-version-history — Version History Panel

**Accessible from**: BOM detail page (TEC-006) Tab "Version History", and Routing detail page (TEC-008a).

**Rendered as**: Tab content within the parent page (not a separate slide-over).

**Content**:
- Version timeline (vertical, newest at top). Each version entry is a card:
  - Version number badge (e.g., "v3 — Active" in green, "v2 — Superseded" in gray).
  - Effective From / To dates.
  - Approved By + Approved At.
  - Notes field (truncated).
  - Actions: "View this version" (opens read-only BOM/routing detail for that version), "Compare to current" (opens Version Diff tab).
- "Restore previous version" button (only on superseded versions, btn-secondary, requires `technical.bom.version_publish` permission). Clicking opens confirmation: "Publishing v2 as Active will supersede current v3. This will affect any new Work Orders. Existing WO snapshots are unchanged."

---

## 4. Modals

---

### Modal: Product Create / Edit

**Trigger**: "+ Create Product" button or Edit icon from Products List.
**Title**: "Create Product" or "Edit Product — FA5101".
**Size**: 560px, scrollable (content may exceed viewport).

**Form sections** (collapsible accordions):

**Section 1 — Identification** (always open):
- Item Code (text, required if creating, read-only if editing for FA/intermediate — editable for RM. Placeholder per type: "FA<digits>", "PR<digits><letter>", "RM-name").
- Item Type (radio group: RM / Intermediate / FA / Co-product / Byproduct). Controls conditional fields.
- Item Name (text, required, max 200).
- Description (textarea, optional, max 1000).
- Status (select, default Draft on create).
- Product Group (text, optional).

**Section 2 — PR-code builder** (expands when Item Type = Intermediate):
- See TEC-002 General tab description for full field spec and live preview.

**Section 3 — Weight Model** (always open after type selection):
- Weight Mode (radio: Fixed / Catch Weight).
- Nominal Weight, Tare Weight, Gross Weight Max, Variance Tolerance % — conditional per weight_mode as described in TEC-002.

**Section 4 — Classification**:
- UoM Base (select, required).
- GS1 GTIN (text, optional, 14-digit).
- Supplier Code (text, appears when item_type = rm, required for RM).

**Section 5 — Shelf Life** (appears when item_type = fa or co_product):
- Shelf Life Days, Shelf Life Mode radio, Date Code Format — per TEC-002 General tab description.

**Footer**: "Save Product" (btn-primary), "Cancel" (btn-secondary).

**States**: Loading (saving) — button shows "Saving…" spinner. Error — alert-red at top. Duplicate code — inline error on code field "This code already exists."

---

### Modal: Material Create / Edit

Same structure as Product Create/Edit modal but item_type is pre-set to `rm` and the type radio is hidden (locked to RM). Supplier Code is required. PR-code builder, shelf-life section, and date code format are hidden.

---

### Modal: BOM Create / Edit (Header)

**Trigger**: "+ Create BOM" or "Edit Header" from BOM detail.
**Title**: "Create BOM" or "Edit BOM Header — FA5101 v3".
**Size**: 560px.

**Fields**:
- Product (searchable select, required, locked/read-only if editing).
- Version (number, auto-incremented on create, read-only).
- Yield % (number, default 100.000, range 0.001–200.000, label "Expected yield (%)").
- Effective From (date picker, required, default today).
- Effective To (date picker, optional, label "Effective to (leave empty for open-ended)").
- Notes (textarea, optional, max 500).

**Overlap validation**: If effective dates overlap with an existing active/approved version, an amber banner shows: "Date overlap detected with v2 (2025-01-01 to ongoing). Publishing this version will supersede v2."

**Footer**: "Save BOM" (btn-primary), "Cancel" (btn-secondary).

---

### Modal: BOM Item Add / Edit (Component line)

Described in detail under TEC-006a above (slide-over panel). Fields: Component Item (autocomplete), Qty, UoM, Scrap %, Process Stage, Sequence, Notes. Circular BOM detection inline.

---

### Modal: BOM Co-product Add / Edit

**Trigger**: "+ Add Co-product" or "+ Add Byproduct" from BOM Co-products tab.
**Title**: "Add Co-product" or "Edit Co-product — COP-OFFAL-01".
**Size**: 480px.

**Fields**:
- Co-product Item (searchable select, required, filtered to item_type = co_product or byproduct).
- Output Quantity (number, required, with UoM select adjacent).
- Allocation % (number, 3 decimal places, required unless is_byproduct=true, label "Cost allocation % (must sum to 100 with parent and other co-products)").
- Is Byproduct (checkbox toggle, default unchecked. When checked: Allocation % field becomes read-only and shows 0, label changes to "Byproduct — no cost allocation").
- Notes (textarea, optional).

**Footer**: "Save Co-product" (btn-primary), "Cancel" (btn-secondary).

**Validation**: V-TEC-12 allocation sum — after save, if sum of parent + all co-products ≠ 100, red banner on BOM co-products tab as described.

---

### Modal: Routing Create / Edit

Described in TEC-008 above. Fields: Routing Code, Product, Description, Status, Is Reusable, Version (edit only), Cost Configuration (setup cost, working cost/unit, overhead %, currency).

---

### Modal: Allergen Manual Override

**Trigger**: "Override" button on the Allergen Profile tab of a product, or from the Cascade Preview tab.
**Title**: "Override Allergen — FA5101 — Milk (A03)".
**Size**: 480px.

**Warning banner** at top (amber): "Manual overrides are audited. This action will be recorded with your name, timestamp, and reason."

**Fields**:
- Allergen (read-only display — the allergen being overridden).
- Current cascaded value (read-only display — e.g., "Cascaded: Contains — Confidence: assumed").
- Override Intensity (select: Contains / May Contain / Trace / Remove declaration). Required.
- Override Confidence (select: declared / tested / assumed). Default: declared.
- Override Reason (textarea, required, min 20 chars, max 1000, placeholder "Explain why this override is necessary, referencing the supporting evidence…").

**Footer**: "Apply Override" (btn-danger — red, because audited action), "Cancel" (btn-secondary).

**Post-save**: Toast "Allergen override applied and recorded in audit log." The cascade arrow for this allergen in the Cascade Preview gains a blue star override badge.

---

### Modal: Nutrition Calculator

Described in TEC-011 above. Multi-section: Ingredient inputs table, Run Calculation button, Results with apply-selection checkboxes.

---

### Modal: Cost Adjustment

**Trigger**: "Edit cost" from Product Costing tab, "+ Add cost entry" from Cost History, or "Update item cost" from Recipe Costing.
**Title**: "Adjust Cost — FA5101 Chicken Nuggets 1kg".
**Size**: 480px.

**Fields**:
- Cost per kg (number, decimal 10.4, required, min 0, pre-filled if triggered from Recipe Costing).
- Currency (select, default from org settings, ISO 4217).
- Effective From (date picker, required, default today).
- Source (select: manual / supplier_update / variance_roll — d365_sync is system-only, not user-selectable).
- Notes (textarea, optional, max 500, label "Reason / annotation for this cost change").

**Validation**: V-TEC-50 — cost ≥ 0. V-TEC-53 — if new cost differs >20% from current: amber banner "This change is greater than 20% from the current value. Admin approval may be required." with "Proceed anyway" confirm checkbox.

**Footer**: "Save Cost" (btn-primary), "Cancel" (btn-secondary).

---

### Modal: Shelf-life Rule Config

**Trigger**: "+ Add shelf-life rule" from Shelf-life Config page (when configuring org-level rules beyond per-item settings).
**Title**: "Configure Shelf-life Rule".
**Size**: 480px.

**Fields**:
- Rule Name (text, required).
- Item Type scope (multi-select: RM / Intermediate / FA / All).
- Product Group scope (text, optional).
- Default Shelf Life Days (number, required).
- Default Mode (radio: Use By / Best Before).
- Default Date Code Format (select).
- Min Days for Sale (number, optional).
- Min Days for Shipment (number, optional).
- Regulatory Preset (multi-select chips matching the 7 presets on TEC-014).

**Footer**: "Save Rule" (btn-primary), "Cancel" (btn-secondary).

---

### Modal: D365 Manual Sync Confirm

**Trigger**: "Pull from D365 now" or "Push pending confirmations" buttons on D365 Overview tab.
**Title**: "Manual D365 Sync".
**Size**: 480px.

**Warning banner** (amber): "Manual sync will run immediately and may take several minutes. Do not close this page during sync."

**Fields**:
- Sync Direction (radio: Pull from D365 / Push confirmations to D365).
- Entities (multi-select checkboxes, appears when Pull selected): items / BOM + formula / all.
- Confirmation text (for Push): "Push all pending WO confirmations to D365 production journal."
- Notes (text input, optional, label "Reason for manual trigger (appears in audit log)").

**Footer**: "Start Sync" (btn-primary), "Cancel" (btn-secondary).

**Post-submit**: Modal closes, a blue `alert-blue` toast appears in top-right: "Sync job started (job-ID: …). View progress in D365 Sync Log." The Sync Log tab auto-refreshes to show the running job.

---

### Modal: D365 DLQ Retry

**Trigger**: "Retry" button on a DLQ row.
**Title**: "Retry Failed Record — [Record Key]".
**Size**: 480px.

**Content**:
- Record Key (read-only, monospaced).
- Entity (read-only badge).
- Error Message (read-only, code block display).
- Retry Count so far: N.
- Payload preview (collapsible JSON viewer, default collapsed).
- Notes field: "Add a note about what was fixed before retrying" (textarea, optional).

**Footer**: "Retry Now" (btn-primary), "Mark as Resolved Instead" (btn-secondary — opens the mark-resolved flow), "Cancel" (btn-secondary).

**Post-retry**: If retry succeeds → toast "Record successfully processed." DLQ row disappears. If retry fails again → toast error "Retry failed: [error]. Record remains in DLQ."

---

### Modal: Delete / Deactivate Confirmation

**Trigger**: "Deactivate item", "Delete BOM line", "Delete Operation" — any destructive action.
**Title**: "Deactivate Item" or "Remove Component" etc.
**Size**: 400px.

**Content**: Icon (warning triangle, amber). Heading "Are you sure?" Explanation paragraph: "Deactivating FA5101 will prevent it from being used in new Work Orders and BOMs. Existing snapshots and historical data are preserved." For hard deletes (BOM lines, routing operations): "This action cannot be undone."

**For item deactivation**: Required reason field (select: Discontinued / Recipe Change / D365 Mismatch / Other) + notes textarea (required if Other).

**Footer**: "Deactivate" (btn-danger) or "Remove" (btn-danger), "Cancel" (btn-secondary).

---

### Modal: BOM Generator Confirm

**Trigger**: "Generate BOM Batch" button on Technical Dashboard or BOMs list.
**Title**: "BOM Generator".
**Size**: 600px.

**Section 1 — Scope Selection**:
Title "Select products to include".
Radio group:
- "All FAs with Status Overall = Complete" (recommended, shows count: "23 products").
- "Selected FAs" (shows a searchable multi-select checklist of FA items, with their completion status badge).

**Section 2 — Output Mode**:
Title "Output format".
Radio group (two large card-style radio buttons side by side):
- "Per-FA files (N separate files)": icon of multiple documents. Description: "Generates one XLSX file per FA: BOM_FA5101.xlsx, BOM_FA5102.xlsx, etc. Best for sharing individual product specs."
- "Single batch file": icon of one document with multiple sheets. Description: "Generates one XLSX file with all FAs as separate sheets or combined rows: BOM_Batch_2026-04-20.xlsx. Best for bulk review."

**Section 3 — Delivery**:
Informational text: "Files will be generated asynchronously. You'll receive a notification with a download link when ready (typically 2–5 minutes for 20 FAs)." Email checkbox: "Also send download link to [user email]".

**Footer**: "Generate" (btn-primary), "Cancel" (btn-secondary).

**Post-submit**: Modal closes. Toast appears: "BOM batch generation started. We'll notify you when files are ready." Audit log entry created with `action='bom_batch_generate'`, scope, mode, and triggered_by.

---

### Modal: PR-code Duplicate-check Warning

**Trigger**: Inline on Product modal / Detail when PR-code builder produces a code that already exists.
**Type**: Inline banner inside the modal (not a separate modal overlay).

**Content**: Amber `alert-amber` banner inside the PR-code builder section: "PR5101R already exists for this organisation (Chicken Breast Roasted Intermediate — Active). Choose a different code or navigate to the existing item." Link "View existing item PR5101R" opens in new tab.

---

## 5. Flows

---

### Flow 1 — Create New FA Product → PR-code Intermediates → BOM Generator

1. User navigates to `/technical/products`. Clicks "+ Create Product".
2. Product Create modal opens. User selects item_type = FA. Enters Item Code "FA5101", Name "Chicken Nuggets 1kg", UoM = kg.
3. Selects Weight Mode = Catch Weight. Nominal Weight = 1.000 kg, Tare = 0.025 kg, Gross Max = 1.100 kg, Variance = 5%.
4. Selects Shelf Life Mode = Use By, Shelf Life Days = 180, Date Code Format = YYWW.
5. Clicks "Save Product". Toast: "Product FA5101 created." Redirects to `/technical/products/FA5101`.
6. On Product Detail, user clicks "+ Create BOM version". BOM Create modal opens. Saves BOM header v1.
7. On BOM detail, user clicks "+ Add Component". Slide-over opens. Searches "PR5101R" — this intermediate does not exist yet. Warning chip: "PR5101R not found. Create it first."
8. User opens second tab, creates intermediate item PR5101R (item_type = Intermediate, PR-code builder digits "5101", letter "R").
9. Returns to BOM detail. Adds PR5101R as component with 0.950 kg, 0% scrap, Process Stage R.
10. User clicks "+ Add Co-product". Adds COP-OFFAL-01 with 0.080 kg, allocation 15%. Sets parent FA5101 allocation to 80%. Byproduct BYP-FAT-01 added with allocation 0, is_byproduct=true. Allocation summary shows 95% — red banner. User adjusts FA5101 to 85%. Total = 100%. Banner clears.
11. User clicks "Approve" on BOM header. "Publish Active". BOM v1 becomes active.
12. User navigates to Technical Dashboard. Clicks "Generate BOM Batch". BOM Generator modal opens.
13. Scope = "Selected FAs", checks FA5101. Output mode = "Per-FA files". Clicks "Generate".
14. Modal closes. Toast: "BOM batch generation started." After 2 minutes, notification appears in notification bell: "BOM files ready. Download BOM_FA5101.xlsx." Download link opens.

---

### Flow 2 — Edit BOM, Add Co-product, Version Bump, Approve

1. User is on `/technical/boms/FA5101/v1` (active BOM).
2. Clicks "Edit Header". Blue banner: "Editing will create draft v2." User confirms.
3. BOM v2 draft created. User is redirected to v2 detail.
4. User goes to Co-products tab. Clicks "+ Add Co-product". Adds new COP-TRIM-02 with 5% allocation. Adjusts FA5101 allocation from 85% to 80%. Total = 100% ✓.
5. User clicks "Approve BOM". BOM v2 status → Approved. "Approved by [User] at [timestamp]."
6. User clicks "Publish Active". Confirmation modal: "Publishing v2 as Active will supersede v1. Existing WO snapshots are unaffected." User confirms. BOM v1 status → Superseded, effective_to set. BOM v2 status → Active.
7. Toast: "BOM v2 is now active for FA5101."

---

### Flow 3 — Allergen Cascade: Add Allergen to RM → Propagation → Override on FA

1. User opens RM-FLOUR-01 Material Detail, Allergens tab.
2. Clicks "Edit allergens". Sets Cereals (A02) = Contains, Confidence = declared.
3. Saves. Async cascade rule fires (≤5s). In background: allergen_cascade rule runs, finds FA5101 uses RM-FLOUR-01 via active BOM. Updates FA5101 allergen profile with Cereals = Contains, source = cascaded.
4. User opens FA5101 Product Detail, Allergens tab. Sees Cereals now shows ◉ Contains with "cascaded" badge and arrow "→ Inherited from RM-FLOUR-01".
5. User decides FA5101 should show "May Contain" for Cereals (strict processing separation). Clicks "Override" for Cereals.
6. Allergen Manual Override modal opens. Selects Intensity = May Contain, Reason = "Dedicated allergen-free processing line — verified by ATP test 2026-04-15". Clicks "Apply Override".
7. Toast: "Override applied and audited." FA5101 Cereals cell now shows ◐ May Contain with blue star override badge.
8. Cascade runs again next time BOM changes — Cereals cascaded value recalculated but override row preserved (V-TEC-45 protection).
9. Audit log shows: "allergen_override | FA5101 | Cereals | Contains → May Contain | Reason: Dedicated allergen-free processing line… | Jane Smith | 2026-04-20".

---

### Flow 4 — Catch-weight FA with GS1 AI 3103 / 3922

1. User creates product FA5202 (Pork Fillet, catch weight). Sets Weight Mode = Catch, Nominal = 0.250 kg, Tare = 0.020 kg, Gross Max = 0.310 kg, Variance = 5%.
2. Info banner appears in Product modal: "GS1 AI 3103 (net weight) or 3922 (variable price) required for catch weight labelling."
3. User enters GS1 GTIN "05060523100023" in the GS1 GTIN field.
4. Saves product. On Product Detail, GS1 tab shows AI configuration: AI 01 (GTIN), AI 3103 (net weight — 6 digits, 3 decimal, e.g., "000250" = 0.250 kg), AI 10 (lot), AI 17 (expiry).
5. At label print time (11-SHIPPING): GS1-128 composite barcode generated with actual captured weight for each unit. If scale captures 0.263 kg for unit 1, AI 3103 encodes "000263". Variance 5.2% — within 5% + tolerance → OK.

---

### Flow 5 — D365 Nightly Sync → DLQ Retry

1. Nightly cron fires at 02:00. d365_sync_jobs insert with direction=pull, entity=items, status=scheduled.
2. Worker picks up job. Calls D365 API. Processes 1,247 items — 1,244 upserted successfully. 3 items fail (400 error "item code too long").
3. Job completes with status=completed, records_processed=1244, records_failed=3. 3 records inserted to d365_sync_dlq.
4. Admin dashboard DLQ depth KPI turns red: "3 messages".
5. Admin navigates to D365 Sync → Dead-Letter Queue tab. Sees 3 rows. Clicks "View Payload" on row 1 — sees the D365 item record JSON, identifies the issue (item code "LONGITEMCODENAMEEXCEEDS" > allowed length).
6. Admin resolves in D365 (shortens item code). Returns to DLQ. Clicks "Retry" on row 1. DLQ Retry modal opens. Adds note "Fixed item code in D365". Clicks "Retry Now".
7. Retry success. Row 1 disappears from DLQ. Repeats for rows 2 and 3.
8. DLQ depth = 0. KPI card turns green.

---

### Flow 6 — Shelf-life Configuration with Regulatory Preset Switch

1. User opens `/technical/shelf-life`. Selects product FA5101.
2. Current config: Shelf Life Days = 180, Mode = Best Before, Date Code Format = YYWW.
3. User selects regulatory preset chip "EU 1169/2011". Contextual info card appears: "For Chicken Nuggets (FA, contains meat): EU 1169/2011 requires Use By declaration for perishable meat products."
4. User changes Mode to "Use By" radio. Label preview card updates: "Spożyć do: 2627" (YYWW format).
5. User also selects "FSMA 204" preset chip. Additional info: "FSMA 204 requires lot genealogy queryable in < 30 seconds and critical tracking event records."
6. Compliance checklist at bottom: EU 1169/2011 ✓ (Use By declared, allergens declared), FSMA 204 ⚠ (Lot genealogy structure ready but traceability query not tested for this product).
7. User clicks "Save shelf-life config". Toast: "Shelf-life configuration saved."

---

### Flow 7 — Traceability Search (FSMA 204)

1. User receives customer complaint about lot "BATCH-2026-0115-A". Navigates to `/technical/traceability`.
2. Enters "BATCH-2026-0115-A" in search field. Direction = Backward (upstream). Clicks "Search".
3. Progress spinner with message "Searching… this may take up to 30 seconds for deep chains."
4. Results appear in 4 seconds. Summary: "FA5101 — Chicken Nuggets — WO-0143 — Line 1 — 490 kg". 
5. Genealogy tree shows: BATCH-2026-0115-A → WO-0143 → RM-CHICKEN-01 LP-8801 (lot B-1210, 225 kg, received 2026-01-10) + RM-FLOUR-01 LP-9012 (lot B-1201, 75 kg, received 2026-01-08) + PR5101R LP-9300 (intermediate, 600 kg input).
6. User clicks "Export Genealogy as PDF". PDF generated and downloaded.

---

### Flow 8 — Cost History: View Timeline, Annotate Source

1. User opens FA5101 Product Detail → Costing tab. Sees current cost_per_kg = £4.20/kg (sourced: d365_sync).
2. Clicks "View full history". Navigates to `/technical/costing/history?item=FA5101`.
3. Line chart shows 12 months. Sees spike in month 3 (£4.80/kg) then drop in month 4 (£3.90/kg).
4. Clicks data point in month 3. Tooltip: "£4.80 — d365_sync — 2026-03-01 — System".
5. User clicks "+ Add cost entry". Cost Adjustment modal opens. Enters: £4.46/kg (from Recipe Costing calculation), Source = manual, Effective From = 2026-04-20, Notes = "Recalculated from BOM v2 Recipe Costing tool — approved by Quality Lead".
6. Saves. Chart updates with new data point in blue (manual source color). History table shows new row.

---

## 6. Empty / Zero / Onboarding States

Each screen has three distinct empty states depending on context:

**Global new-org onboarding**: On first login with no data, Technical Dashboard shows a step-by-step onboarding prompt card: "Welcome to Technical. Get started: 1. Create your raw materials → 2. Create your finished products → 3. Define your first BOM → 4. Configure allergens → 5. Connect to D365." Each step is a clickable chip.

**Products List — no items**: Centered illustration (inventory boxes), heading "Your product catalog is empty", body "Add your raw materials, intermediates, and finished articles to start managing your item master.", CTA "+ Create Product".

**BOMs List — no BOMs**: Centered illustration (document with grid), heading "No bills of materials yet", body "BOMs link your products to their ingredients and drive production planning.", CTA "+ Create BOM".

**Allergen Matrix — no allergens declared**: Centered message "No allergen profiles configured. Add allergen declarations to your raw materials first. They will cascade automatically to your finished articles.", CTA "Go to Materials".

**D365 Sync — integration disabled**: Full banner in D365 Overview tab: "D365 integration is currently disabled. Enable it in Settings > Integrations > D365 after configuring your connection credentials." Link to Settings.

**DLQ — empty**: Large green checkmark illustration, "All clear — no failed records in the dead-letter queue." Muted timestamp "Last checked: now".

**Traceability — no search**: Large search icon illustration, "Enter a lot number, LP number, or batch reference to trace its genealogy through the supply chain."

**Cost History — no history**: "No cost records found. The first cost entry will be created when you save a cost_per_kg value or when D365 sync runs for the first time."

**Routing Operations — no operations**: "This routing has no operations yet. Add the first step — such as Mixing or Cooking — to define the production sequence.", CTA "+ Add Operation".

---

## 7. Notifications, Toasts, Alerts

### Toast Notifications (top-right, auto-dismiss 4s)

| Trigger | Toast type | Message |
|---|---|---|
| Product saved | success (green) | "Product FA5101 saved successfully." |
| BOM approved | success (green) | "BOM v3 approved." |
| BOM published as active | success (green) | "BOM v3 is now active. Previous version superseded." |
| Allergen override applied | success (green) | "Allergen override applied and recorded in audit log." |
| Cost saved | success (green) | "Cost entry saved. Effective from 2026-04-20." |
| BOM Generator started | info (blue) | "BOM batch generation started. You'll be notified when files are ready." |
| D365 sync started | info (blue) | "D365 sync job queued. View progress in Sync Log." |
| DLQ retry success | success (green) | "Record successfully retried and processed." |
| DLQ retry failed | error (red) | "Retry failed: [error]. Record remains in DLQ." |
| Save error | error (red) | "Failed to save. Please try again or contact support." |
| Validation error | warning (amber) | "Please fix the highlighted fields before saving." |
| D365 sync completed | info (blue) | "D365 pull completed: 1,244 records processed, 3 failed. Check DLQ." |
| BOM files ready | info (blue) | "BOM files ready. [Download now]" — persistent until dismissed |

### Persistent Alert Banners (inline on screens)

| Location | Type | Content |
|---|---|---|
| TEC-001 Products List | amber | "3 items have D365 drift. [Review]" — when drift detected |
| TEC-006 BOM Detail (active) | blue | "This BOM is active. Editing will create a new draft version." |
| TEC-010 Allergen Cascade | amber | "Allergen cascade is outdated. [Recalculate now]" |
| TEC-013 Costing | amber | "Calculated cost (£4.46) differs >5% from current recorded cost (£4.20). [Update cost]" |
| TEC-014 Shelf-life | amber | "Use By mode required for this product type per EU 1169/2011." |
| TEC-070 D365 Overview | red | "DLQ has N failed records. SLA: resolve within 48h. [View DLQ]" |
| TEC-070 D365 Overview | red | "Last successful sync was >48h ago. Check connection." |
| TEC-073 DLQ | red | "N failed records in DLQ. Review and retry or mark resolved." |

### System-level Notifications (notification bell in top nav)

- D365 pull completed (with counts).
- BOM Generator files ready (persistent, with download link).
- Allergen cascade recalculation completed.
- DLQ depth exceeds threshold (>50 records).
- Lab result failed (ATP swab fail — immediate alert to quality_lead).

---

## 8. Responsive Notes

The MonoPilot prototype is primarily designed for desktop (1280px+ wide) as the core persona (Quality Lead / Technical Manager) works at a desktop workstation. The following responsive behaviour applies:

**Tablet (768px–1279px)**:
- Sidebar collapses to 60px icon-only mode. Hover to expand.
- KPI row on dashboard collapses to 2-column grid (2+2+1).
- Table columns: hide lower-priority columns (D365 Status, Supplier columns) on Products/Materials list.
- BOM Lines table: hide Sequence and Notes columns; show on row expand.
- Allergen matrix: horizontally scrollable with sticky first (item name) column.

**Mobile (< 768px)**:
- Not a primary target for this module. Allergen matrix, BOM lines, and D365 sync panels are complex and not optimized for mobile.
- Products/Materials list becomes a stacked card view per item.
- Modals: full-screen on mobile.
- D365 Sync panel: simplified — show only Overview tab on mobile; full tabs on desktop.

**Print / PDF export**:
- Recipe Costing (TEC-013) and Cost History (TEC-015) support a print-optimised layout triggered by "Export as PDF". Tables render without hover states, charts render as static SVG.
- Allergen Warnings Panel (TEC-012) supports "Export Allergen Report" — full-page PDF with EU-14 matrix per product.

---

## 9. Open Questions for Designer

1. **Allergen matrix cell density**: With 14+ allergens as columns and potentially 100+ products as rows, the matrix may require horizontal virtual scrolling. Should the matrix be transposed (allergens as rows, products as columns) for easier readability when product names are long?

2. **Cascade tree visual style**: The Allergen Cascade Preview (TEC-010) uses a tree with connecting lines and cards. Should this be a standard indented tree list, or a true node-graph with SVG arrows? The latter is visually richer but harder to implement. PRD does not mandate either approach.

3. **PR-code builder prominence**: The PR-code builder is only visible for `intermediate` item type. Should it appear as a single composite field in one line, or as a dedicated section card within the form? Current spec suggests two adjacent inputs — confirm UX preference.

4. **BOM Generator modal — file naming preview**: Should the modal show a preview list of the file names that will be generated (e.g., "BOM_FA5101.xlsx, BOM_FA5202.xlsx…") before the user confirms? This adds a confirmation step but improves confidence.

5. **D365 DLQ payload viewer**: JSON payloads can be very large. Should the payload viewer be a modal with a code editor (syntax highlighted), a dedicated panel, or should large payloads be downloadable as JSON files?

6. **Cost history chart library**: No specific charting library is mandated. The spec calls for a line chart with color-coded series by source type. Designer should confirm which charting approach (Chart.js, D3, Recharts, static SVG) fits the MonoPilot prototype stack.

7. **Version Diff visual format**: TEC-006 Version Diff tab shows side-by-side BOM diffs. Should deleted lines show full row in red background, or use a diff-style format (strikethrough on old value, new value below)? Recommend confirming with the QA persona what format is most readable in practice.

8. **Traceability tree depth and performance**: The spec references FSMA 204 <30s target. For the HTML prototype (static), the tree should be shown pre-rendered with sample data. Designer should choose whether to render a 4-level deep tree as the default sample state.

9. **Process stage letter badge color coding**: Process letters (A/B/C/E/F/G/H/R) appear as badges on BOM lines and routing operations. Should each letter have a distinct color, or all be the same blue badge with letter text? Distinct colors would aid quick scanning but require a defined palette.

10. **Nutrition calculator UX flow**: The calculator currently described as a modal (700px wide). Given the complexity of the ingredient input table + results comparison, should this instead be a full-page screen (`/technical/nutrition/calculator`) with the modal being only a summary confirm step?
