# 01-NPD — UX Specification (for prototype generation)

> **Authoritative source**: PRD 01-NPD v3.0 (2026-04-19). This document is self-contained — a designer with zero prior context can build HTML prototypes from it alone.

---

## 0. Module overview

Module 01-NPD manages the complete lifecycle of a Factory Article (FA) from NPD brief intake through seven-department parallel data fill to paste-ready D365 Builder output. It replaces the 22-tab Smart_PLD_v7.xlsm Excel workbook with full MES functionality. The primary persona is **Jane (NPD Manager)**, who orchestrates the process: she converts briefs into FA records, monitors the dashboard for launch alerts, and triggers D365 Builder export when all seven departments have closed their sections. Secondary personas are the seven department managers and users (Core, Planning, Commercial, Production, Technical, MRP, Procurement) who each fill their own sections of the Main Table. Key business goals: (1) eliminate manual Excel maintenance while replicating 100% of v7 functionality; (2) enforce allergen cascade compliance per EU FIC 1169/2011; (3) generate per-FA D365 Builder xlsx files as a bridge during the dual-maintenance period; (4) surface launch-date alerts before products fall into crisis.

---

## 1. Design system (inherited)

### 1.1 Color tokens

| Token name | Hex | Usage |
|---|---|---|
| `--blue` (primary) | #1976D2 | Primary buttons, active sidebar item border, focus ring, tab underline, KPI default border-bottom |
| `--green` | #22c55e | Success states, KPI green variant border-bottom, badge-green |
| `--amber` | #f59e0b | Warning states, KPI amber variant, badge-amber |
| `--red` | #ef4444 | Error states, danger buttons, KPI red variant, badge-red, required asterisk |
| `--info` | #3b82f6 | Info alerts, badge-blue |
| `--bg` | #f8fafc | Page background |
| `--sidebar` | #1e293b | Fixed left sidebar background |
| `--card` | #ffffff | Card background |
| `--text` | #1e293b | Primary text |
| `--muted` | #64748b | Secondary text, table headers, placeholders |
| `--border` | #e2e8f0 | Card borders, table dividers, input borders |
| `--radius` | 6px | All card/input/button border-radius |

**Cell state colors (from PRD §7.2):**
- Locked / blocking not met: `#D0D0D0` background
- Auto-derived (read-only): `#E0FFE0` background
- D365 Found: `#C0FFC0` background
- D365 NoCost: `#C0FFFF` background
- D365 Missing: `#C0C0FF` background (same purple tone as PRD)
- Row Ready to Close: `#C0FFC0` background
- Row ALERT: `#C0C0FF` background

### 1.2 Typography

- **Font family**: Inter, system-ui, -apple-system, sans-serif
- **Base size**: 14px / line-height 1.4
- **Page title**: 20px / font-weight 700
- **Card title**: 14px / font-weight 600
- **Table header**: 12px / font-weight 600 / color `--muted` / uppercase
- **Table cell**: 13px / normal weight
- **Label**: 12px / font-weight 500 / color #374151
- **Badge**: 11px / font-weight 500
- **Breadcrumb**: 12px / color `--muted`

### 1.3 Spacing

- Page padding: 40px top, 20px sides/bottom
- Card padding: 16px
- Card margin-bottom: 12px
- Form field margin-bottom: 10px
- Grid gap (cards): 12px
- KPI row gap: 12px

### 1.4 Component vocabulary

**KPI cards** — `border-bottom: 3px solid <color-token>`. Variants: `default` (blue), `green`, `amber`, `red`. Label 11px muted, value 26px bold, change-line 11px.

**Badges** — inline-block, padding 2px 8px, border-radius 10px.
- `badge-green`: bg #dcfce7, text #166534
- `badge-amber`: bg #fef3c7, text #92400e
- `badge-red`: bg #fee2e2, text #991b1b
- `badge-blue`: bg #dbeafe, text #1e40af
- `badge-gray`: bg #f1f5f9, text #475569

**Tables** — width 100%, border-collapse collapse, 13px cells, 12px muted uppercase headers with 2px bottom border.

**Tabs** — horizontal row, `border-bottom: 2px solid --border`. Active tab: `border-bottom-color: --blue`, font-weight 600, color `--blue`. Inactive: color `--muted`.

**Cards** — bg white, `border: 1px solid --border`, border-radius 6px, padding 16px.

**Kanban** — horizontal flex, each column min-width 180px, bg `--bg`, border-radius 6px. Cards inside: white, 1px border, border-radius 4px, padding 8px.

**Sidebar** — fixed left, 220px wide, bg `--sidebar` (#1e293b). Items: 7px 14px padding, 13px font, 3px left border (transparent default, `--blue` active). Active item bg `#1e3a5f`. Group labels: 10px uppercase #475569.

**Modals** — overlay rgba(0,0,0,0.5), modal box 560px wide, max-height 80vh, scroll, border-radius 8px, padding 20px.

**Buttons** — padding 6px 14px, border-radius 4px, 12px font.
- `btn-primary`: bg `--blue`, white text. Hover: #1565C0.
- `btn-secondary`: bg white, border `--border`. Hover: bg #f1f5f9.
- `btn-danger`: bg `--red`, white text.
- `btn-success`: bg `--green`, white text.

**Alerts** — padding 10px 14px, border-left 4px, border-radius 6px, 12px font.
- `alert-red`: bg #fef2f2, border `--red`
- `alert-amber`: bg #fffbeb, border `--amber`
- `alert-blue`: bg #eff6ff, border `--info`
- `alert-green`: bg #f0fdf4, border `--green`

**Forms** — label 12px bold above input; input padding 7px 10px, border 1px `--border`, border-radius 4px; focus: border `--blue`, box-shadow 0 0 0 2px rgba(25,118,210,0.15). Required asterisk: `--red`. Error state: border `--red`, inline error text 11px `--red` below field.

**Timeline dots** — 8px circle with margin-top 4px; color-coded by event type.

---

## 2. Information architecture

### 2.1 Sidebar entry

- **Icon**: the sitemap assigns `💡` to NPD in the PREMIUM group
- **Label**: NPD
- **Group header**: PREMIUM (uppercase)
- **Active state**: left border `--blue`, bg `#1e3a5f`, text white
- **Sub-items** (visible when NPD is active): Dashboard, FA Projects, Briefs, Formulations, D365 Builder, Allergens

### 2.2 Sub-navigation / tabs

The NPD module uses two levels of navigation:
1. **Sidebar sub-items** — route-level navigation between major areas
2. **Tab bars** — within FA detail views, separating dept sections

### 2.3 Route map

| Route | Screen |
|---|---|
| `/npd` | NPD Dashboard (Launch alerts + dept progress) |
| `/npd/fa` | FA Projects list (table view, toggleable to kanban) |
| `/npd/fa/new` | Create FA inline (or modal) |
| `/npd/fa/:fa_code` | FA detail view (7 dept tabs) |
| `/npd/fa/:fa_code/proddetail` | ProdDetail per-component editor |
| `/npd/fa/:fa_code/builder` | D365 Builder output screen |
| `/npd/briefs` | Brief list |
| `/npd/briefs/new` | New Brief form |
| `/npd/briefs/:brief_id` | Brief detail / edit |
| `/npd/briefs/:brief_id/convert` | Convert-to-PLD confirmation |
| `/npd/allergens` | Allergen cascade preview / Technical section |
| `/npd/bom/:fa_code` | BOM computed view (read-only) |

### 2.4 Permissions matrix (01-NPD scope)

| Action / Screen | `npd_manager` (Jane) | `core_user` | `<dept>_manager` | `<dept>_user` | `admin` | `viewer` |
|---|---|---|---|---|---|---|
| View NPD Dashboard | Yes | Yes | Yes | Yes | Yes | Yes |
| Create FA (`fa.create`) | Yes | Yes | No | No | Yes | No |
| Delete FA (`fa.delete`) | Yes | No | No | No | Yes | No |
| Create Brief (`brief.create`) | Yes | Yes | No | No | Yes | No |
| Convert Brief to FA (`brief.convert_to_fa`) | Yes | No | No | No | Yes | No |
| Write Core section (`core.write`) | Yes | Yes | No | No | Yes | No |
| Write own dept section (`<dept>.write`) | Yes (all) | No | Yes (own) | Yes (own) | Yes | No |
| Execute D365 Builder (`d365_builder.execute`) | Yes + MFA | No | No | No | No | No |
| Reopen Closed dept (`closed_flag.unset`) | Yes | Yes (Core only) | Yes (own) | No | Yes | No |
| Edit schema (`schema.edit`) | No | No | No | No | Yes + MFA | No |
| Edit rules (`rule.edit`) | No | No | No | No | Yes + MFA | No |

**Note on permission-denied state**: any user attempting an action outside their permission sees a `badge-gray` disabled button (not hidden, to communicate the action exists but requires a different role). Clicking shows `alert-blue`: "You do not have permission for this action. Contact your NPD Manager."

---

## 3. Screens

---

### SCR-01 — NPD Dashboard

**Route**: `/npd`

**Purpose**: Jane's daily review screen — shows launch-date alert counters, per-department Done/Pending/Blocked breakdown, and a sortable alert list of open FAs.

**Layout**: Full-width content area (220px sidebar fixed left). Top: 4-column KPI row (total active, fully complete, pending, built for D365). Below: 2-column grid (left ~55% dept breakdown table, right ~45% launch alert legend). Below: full-width launch alerts table with row-level color coding.

**KPI cards (row of 4):**

| KPI label | Format | Variant | Logic |
|---|---|---|---|
| Total Active FAs | integer | `default` (blue) | COUNT(*) where built=FALSE |
| Fully Complete | integer | `green` | COUNT where status_overall='Complete' |
| In Progress / Pending | integer | `amber` | COUNT where status_overall IN ('InProgress','Pending','Alert') |
| Built for D365 | integer | `blue` | COUNT where built=TRUE |

**Department Progress table** (card, left panel):

| Column | Header | Type | Example |
|---|---|---|---|
| Dept | Department | text | Core |
| done | Done | integer | 8 |
| pending | Pending | integer | 12 |
| blocked | Blocked (blocking not met) | integer | 3 |

Rows: Core, Planning, Commercial, Production, Technical, MRP, Procurement (7 rows always).

**Launch Alerts table** (full-width card below):

| Column | Header | Type | Example |
|---|---|---|---|
| fa_code | FA Code | text link | FA0043 |
| product_name | Product Name | text | Pulled Chicken Shawarma |
| launch_date | Launch Date | date | 2026-05-01 |
| days_left | Days Left | integer | 9 |
| alert | Alert | badge | badge-red / badge-amber / badge-green |
| missing_data | Missing Data | text | "MRP: Box. Tech: Shelf_Life." |
| action | — | button | [Open FA] btn-secondary |

**Alert badge logic** (per PRD §7.2 + §11.3):
- `badge-red`: `days_left <= 10` OR `launch_date IS NULL` with missing required fields
- `badge-amber`: `days_left <= 21 AND missing_data IS NOT EMPTY`
- `badge-green`: otherwise

Row background tinting:
- Red alert rows: `#C0C0FF` left border 4px red
- Amber alert rows: `#C0FFFF` left border 4px amber
- Green alert rows: no tint

**Default sort**: days_left ASC (most urgent first).

**Primary actions**:
- [+ Create FA] — btn-primary, top right — opens MODAL-01 (New FA)
- [Open FA] per row — navigates to SCR-03

**Secondary actions**:
- [Refresh D365 Cache] — btn-secondary, triggers re-sync of d365_import_cache
- Toggle "Show Built" — checkbox, default OFF (hides FAs where built=TRUE)

**States**:

- **Loading**: KPI cards show skeleton placeholders (gray animated shimmer). Table shows 5 skeleton rows. Breadcrumb: NPD > Dashboard.
- **Populated**: full KPI + dept table + alert table.
- **Empty** (no FAs yet): KPI cards show 0. Alert table shows centered card: "No Factory Articles yet. Click [+ Create FA] or convert a Brief to get started."
- **Error**: `alert-red` banner at top: "Failed to load dashboard data. [Retry]". KPIs show "—".
- **Permission-denied**: All roles with `dashboard.view` can access. NPD Manager and dept managers see their respective dept breakdown. Viewer sees full read-only view without action buttons.

**Validation shown**: none inline (dashboard is read-only). Missing data text in alerts table is generated from V05 check results.

**Microcopy**:
- Empty state: "Your product launch pipeline starts here. Create a Brief or add an FA directly."
- Days Left when launch_date is NULL: "No date set"
- Missing Data when all required filled: "—"
- Tooltip on Blocked count: "FAs where blocking rules prevent dept fill (e.g. Core not closed)"

**Refresh**: Polls `/api/npd/dashboard/summary` every 30s. WebSocket push if configured (Phase C5).

---

### SCR-02 — FA Projects List

**Route**: `/npd/fa`

**Purpose**: Tabular view of all Factory Articles with filtering, sorting, and status-at-a-glance for Jane and dept managers.

**Layout**: Page title "Factory Articles" + breadcrumb. Filter bar below title. Table takes full remaining width.

**Filter bar** (inline, 1 row):
- Search text input (searches `fa_code`, `product_name`), placeholder "Search FA code or name..."
- Dept filter: dropdown (All Depts | Core | Planning | Commercial | Production | Technical | MRP | Procurement)
- Status filter: dropdown (All | InProgress | Pending | Complete | Alert | Built)
- [Clear Filters] btn-secondary
- [+ Create FA] btn-primary (right-aligned)
- Toggle: [Kanban view] icon button (switches to SCR-02b)

**Table columns**:

| Column header | Data | Type | Width | Notes |
|---|---|---|---|---|
| FA Code | fa_code | text link | 100px | Click navigates to SCR-03 |
| Product Name | product_name | text | 200px | Truncated at 40 chars |
| Pack Size | pack_size | text | 80px | |
| Status | status_overall | badge | 100px | badge-green=Complete/Built, badge-amber=InProgress, badge-red=Alert, badge-gray=Pending |
| Launch Date | launch_date | date | 100px | Format DD MMM YYYY |
| Days Left | days_to_launch | integer | 80px | Red text if <= 10; amber if <= 21 |
| Core | done_core | icon | 50px | tick icon (green) or dash (gray) |
| Planning | done_planning | icon | 60px | same |
| Commercial | done_commercial | icon | 70px | same |
| Production | done_production | icon | 70px | same |
| Technical | done_technical | icon | 60px | same |
| MRP | done_mrp | icon | 50px | same |
| Procurement | done_procurement | icon | 80px | same |
| Built | built | icon | 50px | bolt icon (blue) if TRUE |
| Actions | — | buttons | 100px | [Open] [D365] (D365 only if npd_manager) |

**Row hover**: bg `#f8fafc`. Row click: navigate to SCR-03.

**Primary actions**:
- [+ Create FA] — opens MODAL-01
- [Open] per row — navigate to SCR-03
- [D365] per row (visible to npd_manager only, enabled when status_overall='Complete') — navigate to SCR-11 (Builder)

**States**:
- **Loading**: 8 skeleton rows.
- **Populated**: table with data, filter bar active.
- **Filtered/empty**: "No FAs match your filters. [Clear Filters]"
- **Empty** (no FAs in tenant): centered card with lightbulb illustration, "No Factory Articles yet.", [+ Create FA] primary CTA.
- **Error**: `alert-red` top banner, [Retry] button.

**Modals opened**: MODAL-01 (Create FA), MODAL-08 (Delete confirm, via row context menu).

---

### SCR-02b — FA Projects Kanban

**Route**: `/npd/fa?view=kanban`

**Purpose**: Visual pipeline of FAs across 5 status columns.

**Layout**: Full-width horizontal kanban. Toggle back to list via icon. Columns: Pending | InProgress | Alert | Complete | Built. Each column has header with count badge. Cards scroll vertically.

**Kanban card** (per FA):
- FA Code (text, small, muted)
- Product Name (bold, 2 lines max)
- Launch Date (if set)
- Days Left (colored by threshold)
- Dept done count "5/7 depts done" (progress text)

**Responsive**: On tablet (<1024px) show 3 columns, others behind horizontal scroll. On mobile switch back to list view automatically.

---

### SCR-03 — FA Detail View

**Route**: `/npd/fa/:fa_code`

**Purpose**: Full Main Table edit view for a single FA, organized into 7 department tab sections. Primary workspace for all dept users.

**Layout**:
- **Header bar**: FA Code (monospace, large) | Product Name (bold, 20px) | Status badge | Days-to-launch counter | [Build D365] btn-primary (Jane only, disabled until Complete) | [Delete FA] btn-danger (Jane/admin only)
- **Gate progress strip**: horizontal progress bar showing 7 dept circles (Core, Planning, Commercial, Production, Technical, MRP, Procurement). Green filled circle = done, blue = active, gray = not done.
- **Tab bar**: Core | Planning | Commercial | Production | Technical | MRP | Procurement | BOM | History
- **Tab content area**: form fields for the active dept section
- **Right panel (280px fixed)**: Validation Status card + Built status card (collapsible)

**Blocking state visual**: Tabs whose blocking rule is not met show a `badge-gray` "Locked" label next to the tab name. Fields within a locked tab are rendered as `background: #D0D0D0`, `pointer-events: none`, with tooltip: "Locked — [blocking rule reason]."

---

#### SCR-03a — Core Tab

**Blocking rule**: none (always editable by core_user or npd_manager).

**Form fields**:

| Field label | Column | Type | Validation | Placeholder / Notes |
|---|---|---|---|---|
| FA Code * | fa_code | text (read-only after create) | V01: regex `^FA[A-Z0-9]+$` | Set at create only |
| Product Name * | product_name | text | V02: non-empty | "e.g. Pulled Chicken Shawarma" |
| Pack Size * | pack_size | select (Reference.PackSizes) | V03: must be in list | Cascade trigger: clears Line + Dieset on change |
| Number of Cases | number_of_cases | number | positive integer | "Cases per pallet" |
| Finish Meat * | finish_meat | text (comma-separated PR codes) | V06 indirectly | Cascade: auto-builds RM_Code + syncs ProdDetail rows. Tooltip: "Comma-separated PR codes, e.g. PR1939H, PR2045A" |
| RM Code (auto) | rm_code | text (read-only) | derived | Green-tinted (#E0FFE0). Tooltip: "Auto-derived from Finish Meat" |
| Template | template | select (Reference.Templates) | — | Cascade: applies Process_1..4 to all ProdDetail rows |
| Volume | volume | number | > 0 | From Brief when converted |
| Dev Code | dev_code | text | format DEV\<YY\>\<MM\>-\<seq\> | e.g. DEV26-037 |
| Weights | weights | number | — | g, from Brief |
| Packs Per Case | packs_per_case | number | integer | |
| Comments | comments | textarea | — | Max 500 chars |
| Benchmark | benchmark | text | — | |
| Price (Brief) | price_brief | text | — | "see recipe" or numeric |
| Closed Core | closed_core | select (Yes / No) | Must pass V05-Core (all required filled) before Yes | "Close Core section to unlock parallel dept fill" |

**Cascade feedback**: when `pack_size` changes, a toast appears: "Pack Size changed — Line and Dieset cleared. Please re-select." When `finish_meat` changes, toast: "RM Code updated. ProdDetail rows synced."

**D365 material validation (V04)** for `finish_meat` and `rm_code`: inline colored indicator per value.

**Primary actions**: [Save Core] btn-primary. Auto-save on blur (debounced 1.5s). [Close Core] btn-success (enabled only when V05-Core PASS).

**Empty state** (FA newly created): All fields empty. Alert-blue at top: "Fill Core section first — other departments unlock after Core is closed."

---

#### SCR-03b — Planning Tab

**Blocking rule**: `Core done` (Closed_Core = 'Yes' AND all Core required filled). If not met: tab label shows `badge-gray "Locked"`. Fields rendered locked (#D0D0D0).

**Form fields**:

| Field label | Column | Type | Required | Notes |
|---|---|---|---|---|
| Meat % * | meat_pct | number (0–100) | Yes | |
| Runs Per Week * | runs_per_week | number | Yes | |
| Date Code Per Week * | date_code_per_week | text | Yes | |
| Closed Planning | closed_planning | select (Yes/No) | — | |

---

#### SCR-03c — Commercial Tab

**Blocking rule**: `Core done`.

**Form fields**:

| Field label | Column | Type | Required | Notes |
|---|---|---|---|---|
| Launch Date * | launch_date | date | Yes | Drives dashboard alerts. Min date = today + 24 weeks (V constraint, [APEX-CONFIG]) |
| Department Number * | department_number | text | Yes | Retailer-specific |
| Article Number * | article_number | text | Yes | Customer-specific |
| Bar Codes * | bar_codes | text | Yes | GS1 GTIN. V04-like: validated against GS1 format |
| Cases Per Week W1 * | cases_per_week_w1 | number | Yes | |
| Cases Per Week W2 * | cases_per_week_w2 | number | Yes | |
| Cases Per Week W3 * | cases_per_week_w3 | number | Yes | |
| Closed Commercial | closed_commercial | select (Yes/No) | — | |

**V08 note**: if FA was created from a Brief, `alert-blue` shown: "Launch Date set — minimum 24 weeks from Brief handoff. Earliest: \<date\>."

---

#### SCR-03d — Production Tab

**Blocking rule**: `Pack_Size filled` for Process/Yield fields; `Line filled` for Yield_Line, Staffing, Rate.

**Layout**: 2 sub-sections. Top: per-component list (ProdDetail rows) with expand/collapse. Bottom: aggregate fields (auto-derived from ProdDetail when N > 1 component, shown read-only).

**ProdDetail row editor** (1 row per component):

| Field label | Column | Type | Blocking | Notes |
|---|---|---|---|---|
| Component | pr_code | text (read-only) | — | Auto from Finish_Meat parse |
| Process 1 | process_1 | select (Reference.Processes) | Pack_Size filled | Cascade → PR_Code_P1 |
| Yield P1 % | yield_p1 | number | Pack_Size filled | |
| Process 2 | process_2 | select | Pack_Size filled | |
| Yield P2 % | yield_p2 | number | Pack_Size filled | |
| Process 3 | process_3 | select | Pack_Size filled | |
| Yield P3 % | yield_p3 | number | Pack_Size filled | |
| Process 4 | process_4 | select | Pack_Size filled | |
| Yield P4 % | yield_p4 | number | Pack_Size filled | |
| Line * | line | select (filtered by Pack_Size) | Pack_Size filled | Cascade → Dieset auto |
| Dieset (auto) | dieset | text (read-only) | Line filled | Green-tinted (#E0FFE0) |
| Yield Line % * | yield_line | number | Line filled | |
| Staffing | staffing | text | Line filled | |
| Rate * | rate | number | Line filled | |
| PR Code P1 (auto) | pr_code_p1 | text (read-only) | — | Green-tinted |
| PR Code P2 (auto) | pr_code_p2 | text (read-only) | — | Green-tinted |
| PR Code P3 (auto) | pr_code_p3 | text (read-only) | — | Green-tinted |
| PR Code P4 (auto) | pr_code_p4 | text (read-only) | — | Green-tinted |
| PR Code Final (auto) | pr_code_final | text (read-only) | — | Green-tinted. V06 warning if suffix mismatch |

**V06 inline warning**: when `pr_code_final` suffix does not match last character of component code, show inline `alert-amber`: "MISMATCH: Finish_Meat ends 'H' but last process suffix is 'A'. Check Process 4."

**Aggregate fields** (shown below ProdDetail rows when N > 1, all read-only, green-tinted):
- Process 1..4 (comma-sep aggregate)
- Line (comma-sep)
- Dieset (comma-sep)
- PR Code Final (comma-sep)

**Closed Production** field: select (Yes/No). Blocking: Pack_Size filled.

**Edit any ProdDetail field**: triggers `fa.built = FALSE` auto-reset. Toast shown: "Built flag reset — re-run D365 Builder after saving changes."

---

#### SCR-03e — Technical Tab

**Blocking rule**: `Core done`.

**Form fields**:

| Field label | Column | Type | Required | Notes |
|---|---|---|---|---|
| Shelf Life * | shelf_life | text | Yes | e.g. "90 days chilled" |
| Allergens (auto-cascade) | allergens | multi-select badges | V07 | See allergen widget below |
| May Contain (auto-cascade) | may_contain | multi-select badges | — | Lighter badge style |
| Allergen Override Reason | allergen_override_reason | textarea | Required if any override | Appears when override checkbox checked |
| Closed Technical | closed_technical | select (Yes/No) | — | |

**Allergen widget** (Technical section sub-panel, card inside tab):

Layout: card with title "Allergen Declaration". Two rows of badges:

- **Contains** row: auto-derived allergen badges (badge-red background #fee2e2). Each badge shows allergen name + source tooltip ("From RM1939 — supplier spec" or "From Process: Coat — confirmed"). Lock icon if auto-derived, pencil if manually overridden.
- **May Contain** row: badges with lighter amber styling (#fef3c7). Same tooltip.
- Below: checkbox list of all 14 EU allergens (Cereals/gluten, Crustaceans, Eggs, Fish, Peanuts, Soybeans, Milk, Nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs). Each row:
  - Left: allergen name
  - Middle: auto-derived status indicator (green = confirmed from RM/process, amber = may-contain, none = not present)
  - Right: "Override" checkbox. When checked, reveals "Override Reason" textarea (required). Override persists until re-run of cascade. When overridden, badge shows orange border + "Manual" label.
- [Refresh Allergens] btn-secondary — re-runs cascade rule `cascade_allergens`. Tooltip: "Recalculates from RM and Process sources. Manual overrides are preserved but flagged for review."

**V07 validation**: if any allergen field is NULL after cascade, or if override has no reason, inline `alert-amber` under widget: "Allergen declaration incomplete. Provide reason for any manual override before closing Technical."

**May-contain from line history**: shown with different icon (info circle). Tooltip: "Derived from line changeover history — last 24h allergen exposure."

---

#### SCR-03f — MRP Tab

**Blocking rule**: `Core + Production done` (Core done AND ProdDetail complete).

**Form fields** (V04 D365 validation applied per cell):

| Field label | Column | Type | Required | V04 status |
|---|---|---|---|---|
| Box * | box | text | Yes | Colored cell: green/yellow/red |
| Top Label * | top_label | text | Yes | V04 |
| Bottom Label | bottom_label | text | No | V04 |
| Web | web | text | No | V04 |
| MRP Box * | mrp_box | text | Yes | V04 |
| MRP Labels * | mrp_labels | text | Yes | V04 |
| MRP Films * | mrp_films | text | Yes | V04 |
| MRP Sleeves | mrp_sleeves | text | No | V04 |
| MRP Cartons | mrp_cartons | text | No | V04 |
| Tara Weight * | tara_weight | number | Yes | kg |
| Pallet Stacking Plan * | pallet_stacking_plan | text | Yes | |
| Box Dimensions * | box_dimensions | text | Yes | e.g. "400x300x200mm" |
| Closed MRP | closed_mrp | select (Yes/No) | — | |

**V04 per-cell indicator**: colored dot or cell background per status. Tooltip on NoCost: "Price missing in D365 — material exists but no cost assigned." Tooltip on Missing: "Material not in D365 — request creation from MRP team." [Refresh D365 Cache] btn-secondary in tab header.

---

#### SCR-03g — Procurement Tab

**Blocking rule**: `Core done` for Lead_Time, Supplier, Proc_Shelf_Life. `Core + Production done` for Price (tightened per Phase D decision #7).

**Form fields**:

| Field label | Column | Type | Required | Notes |
|---|---|---|---|---|
| Price * | price | number | Yes | Blocked until Core+Production done |
| Lead Time (days) * | lead_time | number | Yes | |
| Supplier * | supplier | text | Yes | Per-FA (aggregate if multi-component) |
| Proc Shelf Life * | proc_shelf_life | number | Yes | Days, per supplier |
| Closed Procurement | closed_procurement | select (Yes/No) | — | |

**Note on Price field**: if user tries to enter Price before Core+Production done, field shows locked (#D0D0D0) with tooltip: "Price entry unlocks after Core and Production are both closed. Business rule: price depends on components being finalized."

---

#### SCR-03h — BOM Tab (computed view)

**Purpose**: Read-only computed BOM view from FA + ProdDetail + MRP data.

**Layout**: table listing all components.

| Column | Header | Example |
|---|---|---|
| Component_Type | Type | RM / PM |
| Component_Code | Code | RM1939 |
| Component_Name | Name | Chicken Breast |
| Quantity | Qty | 1 |
| Process_Stage | Stage | Process 1 |
| Source | Source | ProdDetail |
| D365_Status | D365 Status | badge-green Found |

**Actions**: [Export BOM CSV] btn-secondary. [Build D365] btn-primary (Jane only, navigates to SCR-11).

---

#### SCR-03i — History Tab

**Purpose**: Audit log of all mutations to this FA.

**Layout**: timeline. Each event:
- Date/time (format: "20 Apr 2026 14:32")
- User name
- Event type (create / field_edit / dept_closed / built / built_reset / allergen_changed)
- Description ("Commercial: Launch_Date changed from 2026-05-01 to 2026-06-01")

Filter dropdown: All Events | Field Edits | Dept Closures | D365 Builder | Allergens.

---

**Validation Status panel** (right panel, all tabs):

Card showing V01-V08 results:

| Rule | Status | Detail |
|---|---|---|
| V01 FA Code format | PASS / FAIL | "FA Code must start with FA" |
| V02 Product Name | PASS / FAIL | "Product Name cannot be empty" |
| V03 Pack Size | PASS / FAIL | "Pack Size must be in reference list" |
| V04 Material Codes | PASS / WARN / FAIL | Per material (worst status shown) |
| V05 Core | PASS / INFO | "Core: 4/4 required fields filled" |
| V05 Planning | PASS / INFO | etc. |
| V05 Commercial | PASS / INFO | etc. |
| V05 Production | PASS / INFO | etc. |
| V05 Technical | PASS / INFO | etc. |
| V05 MRP | PASS / INFO | etc. |
| V05 Procurement | PASS / INFO | etc. |
| V06 PR Code suffix | PASS / FAIL | Per component row |
| V07 Allergens | PASS / WARN | "All 14 allergens assessed" |
| V08 Brief mapping | PASS / INFO | "Brief fields all mapped" (only shown if brief-linked) |

Status icons: green checkmark (PASS), amber triangle (WARN), red X (FAIL), blue info (INFO).

**Built status card** (below Validation panel):
- Shows `fa.built` state: "Built: Yes" (badge-blue) or "Not built" (badge-gray)
- If Built: link "Download last build" + generated_at timestamp
- "Any edit resets Built flag" info text

**States for FA Detail (all tabs)**:
- **Loading**: skeleton form fields, skeleton right panel.
- **Populated**: forms with data, right panel validation results.
- **Locked tab**: form fields gray, lock icon badge on tab.
- **Edit mode**: fields editable, auto-save on blur.
- **Error**: `alert-red` in tab area: "Failed to save. [Retry]".
- **Permission-denied** (user viewing another dept's tab): fields render as read-only text, no save button. `alert-blue` strip: "Read-only — you can view [Dept Name] data but cannot edit it."

---

### SCR-04 — Brief List

**Route**: `/npd/briefs`

**Purpose**: List of all NPD Briefs (pre-PLD stage). Shows status and link to FA if converted.

**Layout**: Filter bar + table.

**Filter bar**:
- Search (brief product name, dev_code)
- Status filter: All | Draft | Complete | Converted | Abandoned
- Template filter: All | Single Component | Multi Component
- [+ New Brief] btn-primary

**Table columns**:

| Column | Header | Type | Example |
|---|---|---|---|
| brief_id | — | hidden | — |
| dev_code | Dev Code | text link | DEV26-037 |
| product_name | Product Name | text | Italian Platter |
| template | Template | badge | badge-blue "Multi" or badge-gray "Single" |
| status | Status | badge | badge-green Converted, badge-amber Complete, badge-gray Draft |
| fa_code | Linked FA | text link | FA0042 (or "—") |
| created_at | Created | date | 20 Apr 2026 |
| actions | — | buttons | [Open] [Convert] (Convert visible to npd_manager if status=complete) |

**States**: Loading (skeleton), populated, empty ("No briefs yet. Create a Brief to start the NPD pipeline." + [+ New Brief]), error.

**Modals**: MODAL-02 (New Brief).

---

### SCR-05 — Brief Detail / Edit

**Route**: `/npd/briefs/:brief_id`

**Purpose**: View and edit a Brief form (2 sections: Product Details + Packaging). If converted, read-only with link to FA.

**Layout**: Header with Dev Code, product name, template badge, status badge. If converted: `alert-green` banner: "This brief has been converted to FA [fa_code]. It is now read-only. [View FA]". Below: 2 tabbed sections: Product Details | Packaging.

#### Section A — Product Details (13 fields, tabs or accordion)

| # | Field label | Col ref | Type | Required | Notes |
|---|---|---|---|---|---|
| C1 | Product * | product | text | Yes | |
| C2 | Volume | volume | number | Yes (single comp) | Per-FA total |
| C3 | Dev Code * | dev_code | text | Yes | Format DEV\<YY\>\<MM\>-\<seq\> (V08) |
| C4 | Component | component | text | Per component row | Multi-comp template: 1 row per component |
| C5 | Slice Count | slice_count | number | — | |
| C6 | Supplier | supplier | text | — | |
| C7 | Code | code | text | — | Used to derive RM_Code on Convert |
| C8 | Price | price | text | — | "see recipe" or numeric |
| C9 | Weights | weights | number | — | grams |
| C10 | % (Meat %) | pct | number | — | 0–100 |
| C11 | Packs Per Case | packs_per_case | number | — | |
| C12 | Comments | comments | textarea | — | |
| C13 | Benchmark Identified | benchmark_identified | text | — | |

**Multi-component template**: shows a dynamic row table. [+ Add Component] btn-secondary adds a new row with C4-C9 fields. [Remove] per row. Summary row auto-calculated (aggregate weights). **Validation**: summary row weights = sum(component weights) ± 5g tolerance. If mismatch: `alert-amber` "Component weights do not add up to total. Difference: Xg."

#### Section B — Packaging (24 fields C14-C37)

Fields C14-C20 (scanned in Phase A):

| # | Field | Type | Notes |
|---|---|---|---|
| C14 | Primary Packaging | text | |
| C15 | Secondary Packaging | text | |
| C16 | Base Web/Tray/Bag Code | text | Maps to fa.web on Convert |
| C17 | Base Web/Tray/Bag Price | number | |
| C18 | Top Web Type | text | |
| C19 | Sleeve/Carton Code | text | Maps to fa.mrp_sleeves on Convert |
| C20 | Sleeve/Carton Price | number | |
| C21-C37 | (TBD — pending full rescan) | various | Rendered as labeled text inputs, placeholder "[Field TBD — pending Brief schema rescan]". Displayed in form but not mapped to FA until Phase B.2 rescan complete. |

**Actions**:
- [Save Draft] btn-secondary
- [Mark Complete] btn-primary (validates all required fields, sets status='complete')
- [Convert to PLD] btn-success (Jane only, visible when status='complete') — opens MODAL-03

**States**: Loading, Draft (editable), Complete (editable with Convert button), Converted (read-only), Error.

---

### SCR-06 — FA Formulation List (per-FA Formulations view is embedded in SCR-03; this is the standalone list)

**Route**: `/npd/fa/:fa_code` (Formulations tab within SCR-03)

This is described within SCR-03, tab "Formulations" above. For standalone navigation, the Formulations tab within SCR-03 shows:

**Table columns**:

| Column | Header | Notes |
|---|---|---|
| Version | Version | v1.0, v1.1, v2.0 |
| Status | Status | badge-green Locked, badge-amber Draft |
| Effective From | Effective From | date |
| Effective To | Effective To | date |
| Items | Items | integer (ingredient count) |
| Allergens | Allergens | comma-sep allergen names |
| Actions | — | [View] [Compare] [Edit] (draft only) [Approve] (draft only, Jane) |

**Allergen declaration block** (below table): shows current active version's allergen summary.

---

### SCR-07 — Formulation Editor (ProdDetail + Process per-component edit)

**Route**: `/npd/fa/:fa_code/proddetail`

**Purpose**: Dedicated editor for multi-component ProdDetail rows when a product has 2+ components, each needing separate Process/Yield/Line configuration.

**Layout**: Page title "Production Detail — [FA Code]". Breadcrumb: NPD > FA Projects > [fa_code] > Production Detail. Component accordion: each component is an expandable section.

**Per-component section header**: Component code (e.g. PR1939H) | Component weight | expand/collapse chevron.

**Per-component form** (same fields as SCR-03d ProdDetail row editor):
Process 1-4 (select), Yield P1-4 (number), Line (select filtered by Pack_Size), Dieset (auto), Yield Line (number), Staffing (text), Rate (number), PR Codes auto. V06 displayed per component inline.

**Actions**: [Save All] btn-primary. Auto-save per component on blur. [Back to FA] link.

---

### SCR-08 — Version Timeline (Formulation versions per FA)

**Route**: embedded in SCR-03 Formulations tab

**Layout**: vertical timeline. Each version: version number | status badge | effective period | created by | date. Active (locked, effective) version has blue left border. Draft has dashed border. [Compare] links two versions into MODAL-06 (Compare View).

---

### SCR-09 — Allergen Cascade Preview

**Route**: `/npd/allergens` (module-level) or embedded in SCR-03 Technical tab

**Purpose**: Visual display of allergen cascade for a specific FA, showing RM-level → Process-level → FA-level derivation chain.

**Layout**: 3-column cascade view.
- **Column 1 "From Raw Materials"**: list of RM codes with confirmed allergens per RM. Each row: RM code | allergen badges.
- **Column 2 "From Processes"**: list of processes with allergens added. Each row: process name | allergen badges added.
- **Column 3 "FA Final"**: union result. Contains badges + May Contain badges. Manual overrides highlighted with orange border.

Below cascade: "Regulation: EU FIC 1169/2011 — 14 mandatory allergens" info text. [Refresh Allergens] btn-secondary.

---

### SCR-10 — Compliance Docs (per-FA)

**Route**: embedded as "Documents" concept within SCR-03 History/BOM area. In v3.0 PRD, compliance docs are not a primary v3.0 feature (deferred to 09-QUALITY Phase C4). However, the Brief has packaging docs and the FA has the brief link. The archive NPD-013 shows a documents section — this is included as a read-only attachments panel accessible from FA detail.

**Placement**: within SCR-03, add a "Docs" tab (minimal v3.0 scope).

**Table columns**: Type | File Name | Version | Uploaded By | Date | [Download] [Delete].

**[+ Upload Document]** btn-secondary. File types: PDF, XLSX, DOCX. Max 20MB.

---

### SCR-11 — D365 Builder Output

**Route**: `/npd/fa/:fa_code/builder`

**Purpose**: Jane's screen to initiate D365 Builder generation, see output tab summary, and download the `Builder_FA<code>.xlsx` file.

**Layout**: Page title "D365 Builder — [FA Code]". Breadcrumb. Two panels: left (pre-flight status), right (output summary after build).

**Pre-flight panel** (left):
- FA status badge (must be 'Complete')
- V01-V08 validation summary — all must PASS or WARN (no FAIL)
- V04 material check summary per material code
- "MFA required" badge (amber) with note: "Executing D365 Builder requires re-authentication"
- [Build D365 Output] btn-success (large, disabled if any FAIL validation, disabled if fa.status != 'Complete')

**Output panel** (right, visible after successful build):
- Generated at timestamp
- File name: `Builder_FA<code>.xlsx`
- Tab summary table:

| Tab | Rows generated |
|---|---|
| D365_Data | 1 |
| Formula_Version | N+1 products |
| Formula_Lines | M (materials) |
| Route_Headers | N+1 |
| Route_Versions | N+1 |
| Route_Operations | M (non-empty processes) |
| Route_OpProperties | M |
| Resource_Req | M |

- [Download Builder File] btn-primary
- `Built = TRUE` status badge shown
- Warning: "Built flag will reset if any FA field is edited. Re-run Builder after changes."

**Pre-execution gate** (per PRD §10.6):
1. `status_overall = 'Complete'`
2. V01-V06 PASS, V07 allergens PASS, V04 all Found/NoCost (Missing = FAIL block)
3. MFA re-auth (modal prompt)

**MFA re-auth flow**: clicking [Build D365 Output] opens inline MFA confirmation step (code input or "Confirm in authenticator app" button). After MFA pass, execution proceeds.

**States**:
- **Pre-build** (FA not complete): [Build D365 Output] disabled, tooltip "FA must be in 'Complete' status with all 7 departments closed."
- **Pre-build** (validations failing): per-rule fail shown in pre-flight panel. [Build D365 Output] disabled.
- **Building** (in-progress): button replaced with spinner + "Generating file... (< 5 seconds)". Right panel shows skeleton.
- **Built** (success): right panel populated with output summary + download link.
- **Error** (build failed): `alert-red` in right panel with error message. [Retry] btn.
- **Previously built** (built=TRUE, no edits since): right panel shows last build info + [Download previous build] secondary + [Rebuild] primary.
- **Built_reset** (edits after build): `alert-amber` strip: "FA was edited after last build. Built flag reset. Re-run Builder to generate updated output."

**Actions**:
- [Build D365 Output] btn-success (primary CTA)
- [Download Builder File] btn-primary (after build)
- [View BOM] btn-secondary (navigate to SCR-03h BOM tab)
- [Back to FA] link

---

### SCR-12 — Risk Register (per-FA)

**Route**: embedded in SCR-03 as "Risks" tab (minimal v3.0 scope from archive NPD-015, though not in PRD v3.0 primary features).

**Table columns**: Score | Risk Description | Likelihood (Low/Med/High) | Impact (Low/Med/High) | Status (Open/Mitigated/Closed) | Owner | [Edit] [Delete].

Risk score = Likelihood × Impact (numeric: Low=1, Med=2, High=3). Score badge: 1-2 = badge-gray, 3-4 = badge-amber, 6-9 = badge-red.

[+ Add Risk] btn-secondary — opens MODAL-09.

---

## 4. Modals

---

### MODAL-01 — New FA (Create Factory Article)

**Trigger**: [+ Create FA] from SCR-01, SCR-02.

**Purpose**: Create a new FA row. Allows entry of FA_Code and Product Name to create the record; redirects to SCR-03 for full edit.

**Modal width**: 560px.

**Fields**:

| Field | Type | Validation | Notes |
|---|---|---|---|
| FA Code * | text | V01: regex `^FA[A-Z0-9]+$`, unique across tenant | e.g. FA0042. Tooltip: "Format: FA followed by uppercase letters/numbers" |
| Product Name * | text | V02: non-empty, max 200 chars | |
| Dev Code | text | Optional; format DEV\<YY\>\<MM\>-\<seq\> | |

**V01 inline validation**: as user types, regex checked on blur. Error below field: "FA Code must start with 'FA' followed by letters or numbers (e.g. FA0042)."

**Buttons**: [Create FA] btn-primary | [Cancel] btn-secondary.

**On success**: toast "FA [FA Code] created." + auto-navigate to `/npd/fa/:fa_code` (Core tab).

**On error** (duplicate FA_Code): inline error under FA Code field: "FA Code already exists. Choose a different code."

**States**: idle (empty form), submitting (button spinner), error (inline field errors).

---

### MODAL-02 — New Brief

**Trigger**: [+ New Brief] from SCR-04.

**Purpose**: Create a Brief record — choose template and enter initial product name + dev code.

**Fields**:

| Field | Type | Validation | Notes |
|---|---|---|---|
| Template * | radio | required | Single Component / Multi Component |
| Product Name * | text | required | |
| Dev Code * | text | format DEV\<YY\>\<MM\>-\<seq\> | |
| Volume | number | > 0 | |

**Buttons**: [Create Brief] btn-primary | [Cancel] btn-secondary.

**On success**: navigate to SCR-05 (Brief edit) with template pre-set.

---

### MODAL-03 — Convert Brief to FA

**Trigger**: [Convert to PLD] from SCR-05.

**Purpose**: Confirmation step before Brief-to-FA conversion. Shows preview of fields that will be pre-populated.

**Gate checks displayed before confirm button enables**:
- Brief status = complete (badge-green shown)
- All required brief fields filled (checklist, green ticks)
- Target FA Code provided

**Content**:
- "Convert Brief [DEV26-037] to Factory Article" header
- FA Code field (text input, V01) — pre-proposed from brief or manual entry
- Preview table: "These fields will be pre-populated in Core":

| FA Field | Value from Brief |
|---|---|
| Product Name | [brief.product] |
| Volume | [brief.volume] |
| Dev Code | [brief.dev_code] |
| Finish Meat | [generated from components] |
| RM Code | [auto-derived] |
| Weights | [brief.weights] |
| Packs Per Case | [brief.packs_per_case] |
| Comments | [brief.comments] |
| Benchmark | [brief.benchmark_identified] |
| Price (Brief) | [brief.price] |
| Allergens (seed) | [from RM cascade] |
| Web | [brief.base_web_code] |
| MRP Sleeves | [brief.sleeve_carton_code] |

- "Brief will be set to 'Converted' and locked." info text.

**Buttons**: [Convert] btn-success | [Cancel] btn-secondary.

**On success**: brief status → 'converted', FA created, navigate to `/npd/fa/:fa_code` (Core tab). Toast: "FA [fa_code] created from Brief [dev_code]."

**On error**: `alert-red` inline with error detail.

---

### MODAL-04 — Advance Gate (Dept Close confirmation variant)

> Note: The PRD v3.0 does not use Stage-Gate in the archive wireframe sense — instead, departments close their sections independently. The "gate" concept maps to: closing all 7 departments = reaching 'Complete' status. The archive Advance Gate modal (NPD-005) is adapted here to the "Close Dept" confirmation use case.

**Trigger**: [Close \<Dept\>] button within any dept tab (sets `Closed_<Dept> = Yes`).

**Purpose**: Confirmation before marking a department as closed. Shows readiness check.

**Content**:
- "Close [Department Name]" title
- Checklist of required fields for this dept (V05 check): each field with PASS tick or FAIL X
- "All required fields filled" summary badge (green) or "X fields missing" (red)
- Notes textarea (optional): "Add closing comment..."
- If any FAIL: advance button disabled. `alert-amber`: "Fill all required fields before closing. [View missing fields]."

**Buttons**: [Confirm Close] btn-success (disabled if V05 FAIL) | [Cancel] btn-secondary.

**On success**: `Closed_<Dept>` set to 'Yes'. Toast: "[Dept] section closed." Status_Overall recalculated. Right panel validation refreshed.

---

### MODAL-05 — Gate Approval (D365 Builder gate)

**Trigger**: [Build D365 Output] from SCR-11 after all validations pass.

**Purpose**: MFA re-authentication confirmation before D365 Builder execution.

**Content**:
- "Build D365 Output — Final Confirmation" title
- `alert-amber`: "This action generates a paste-ready Excel file for D365. Ensure all data is correct before proceeding."
- FA summary: FA Code, Product Name, Status, Last edited.
- "Enter your MFA code to confirm" — 6-digit OTP input (or "Confirm in authenticator app" toggle).
- N+1 products breakdown: "This build will generate [N+1] products: PR codes + FA final."

**Buttons**: [Confirm & Build] btn-success | [Cancel] btn-secondary.

**On MFA fail**: inline error "Incorrect code. Try again." (max 3 attempts, then lockout for 60s).

**On success**: modal closes, build process starts (spinner in SCR-11).

---

### MODAL-06 — Compare Formulation Versions

**Trigger**: [Compare] from SCR-03 Formulations tab.

**Purpose**: Side-by-side diff of two formulation versions.

**Content** (modal wider: 800px):
- Version A selector (dropdown) | Version B selector (dropdown)
- Side-by-side table:

| Field | Version A | Version B | Changed? |
|---|---|---|---|
| Status | Locked | Draft | — |
| Items count | 12 | 14 | Yes (red dot) |
| Allergens | Soy, Wheat | Soy | Yes (red dot) |
| Effective From | ... | — | — |

Changed fields highlighted amber.

**Buttons**: [Close] btn-secondary.

---

### MODAL-07 — Add / Edit Risk

**Trigger**: [+ Add Risk] from SCR-12 or [Edit] per row.

**Fields**:

| Field | Type | Required | Notes |
|---|---|---|---|
| Risk Description * | textarea | Yes | Max 300 chars |
| Likelihood * | select (Low/Medium/High) | Yes | |
| Impact * | select (Low/Medium/High) | Yes | |
| Mitigation Plan | textarea | No | Max 500 chars |
| Status * | select (Open/Mitigated/Closed) | Yes | |
| Owner | user-select or text | No | |

**Auto-computed**: Risk Score = Likelihood_numeric × Impact_numeric shown as badge.

**Buttons**: [Save Risk] btn-primary | [Cancel] btn-secondary.

---

### MODAL-08 — Delete FA Confirmation

**Trigger**: [Delete FA] from SCR-03 header (Jane/admin only). Requires `fa.delete` permission.

**Content**:
- `alert-red`: "This action is permanent and cannot be undone."
- "Delete Factory Article [FA Code] — [Product Name]?"
- "All related data will be deleted: ProdDetail rows, linked Brief association, Builder outputs, audit history."
- Confirmation text input: "Type [FA Code] to confirm"

**Buttons**: [Delete Permanently] btn-danger (disabled until text matches FA Code) | [Cancel] btn-secondary.

**On success**: navigate to SCR-02. Toast: "FA [fa_code] deleted." Audit log entry written.

---

### MODAL-09 — Allergen Override

**Trigger**: checking the "Override" checkbox next to any allergen in SCR-03e Technical allergen widget.

**Purpose**: Capture reason for overriding auto-cascaded allergen status.

**Fields**:

| Field | Type | Required |
|---|---|---|
| Allergen | text (read-only, pre-filled) | — |
| Current auto-cascade status | text (read-only) | — |
| Override to | toggle (Include / Exclude) | Yes |
| Reason * | textarea | Yes, max 500 chars |

**Audit note**: "This override will be logged in the audit trail with your name and timestamp."

**Buttons**: [Save Override] btn-primary | [Cancel] btn-secondary.

**On success**: allergen badge updated with "Manual" label + orange border. Allergen_Override_Reason saved. Audit event emitted.

---

### MODAL-10 — D365 Builder Wizard (8-step Handoff)

> Note: PRD v3.0 does not use the full 8-step Stage-Gate handoff wizard from archive NPD-008 verbatim — that predates v3.0. The D365 Builder in v3.0 is a single-click + MFA flow (SCR-11 + MODAL-05). However, the concept of a multi-step review before build is preserved here as a guided pre-build wizard for complex FAs.

**Trigger**: [Guided Build] btn-secondary from SCR-11 (alternative to direct build).

**Step indicator**: horizontal breadcrumb strip showing 8 steps: Validate | Data Review | BOM Preview | Allergen Check | D365 Constants | N+1 Preview | MFA Confirm | Execute.

**Step 1 — Validate**: displays V01-V08 results as checklist. PASS/FAIL per rule. Blocked if any FAIL. [Next] btn-primary enabled only if all PASS/WARN.

**Step 2 — Data Review**: read-only summary of Core + Production data that maps into Builder output. Key fields: FA_Code, Product_Name, Finish_Meat, RM_Code, Process_1..4, Line, Dieset, Yield_Line, Rate.

**Step 3 — BOM Preview**: table of all materials (Formula_Lines tab preview). Columns: Item Number | Type (RM/PM) | Qty | Unit. D365 material status per row (V04).

**Step 4 — Allergen Check**: allergen declaration summary. Contains badges + May Contain badges. "Regulatory: EU FIC 1169/2011" note.

**Step 5 — D365 Constants**: table of `Reference.D365_Constants` values that will be embedded. Read-only for Jane (edit requires admin, 02-SETTINGS Phase C1). Key values: PRODUCTIONSITEID=FNOR, APPROVERPERSONNELNUMBER=FOR100048, etc.

**Step 6 — N+1 Preview**: shows the N+1 products that will be generated. Table: Product Code | Type | Processes | OP. OP=10 always.

**Step 7 — MFA Confirm**: same content as MODAL-05. OTP input or authenticator confirm.

**Step 8 — Execute**: progress indicators. Sequential steps animate:
- "Generating Formula_Version..." (tick)
- "Generating Formula_Lines..." (tick)
- "Generating Route tabs..." (tick)
- "Writing Excel file..." (tick)
- "Storing artifact..." (tick)
- "Setting Built=TRUE..." (tick)
Success: "Builder_FA[code].xlsx ready." [Download] btn-primary. [View FA] btn-secondary.

**Error/rollback**: if any step fails, `alert-red` with step name and error. [Retry from this step] btn | [Cancel] btn-secondary. Partial outputs are not saved (transactional).

**Buttons** (in wizard footer): [Back] btn-secondary | [Next] btn-primary | [Cancel] btn-link. Step 7+: [Confirm & Build] btn-success replacing [Next].

---

## 5. Flows (step sequences)

### FLOW-01 — Create NPD project from Brief → through dept fill → handoff

1. NPD team opens SCR-04 (Brief List) → [+ New Brief]
2. MODAL-02 opens → choose template (e.g. multi_component) → [Create Brief]
3. SCR-05 opens (Brief edit) → fill Section A (C1-C13) including components
4. Multi-component: [+ Add Component] for each component row; summary row auto-validates weights
5. Fill Section B (C14-C20 packaging)
6. [Mark Complete] → brief.status = 'complete' → [Convert to PLD] appears
7. Jane opens MODAL-03 → enters FA_Code → previews pre-population → [Convert]
8. Brief locked (read-only). Navigate to SCR-03 Core tab.
9. Core user fills remaining Core fields (Pack_Size, Number_of_Cases, Template)
10. Template cascade applies: ProdDetail rows get Process_1..4 pre-filled from Reference.Templates
11. Core user clicks [Close Core] → MODAL-04 opens → confirms close
12. `Closed_Core = 'Yes'` → Planning / Commercial / Technical / Procurement tabs unlock (badge "Locked" removed)
13. Parallel dept fill begins: each dept manager logs in, fills their tab, closes their section
14. Production fills ProdDetail per component → Line selected → Dieset auto-filled → PR codes computed
15. MRP fills packaging codes → V04 D365 material validation per cell → fix Missing codes
16. Procurement fills Supplier + Lead Time → Price unlocked after Core+Production done → fills Price
17. Technical fills Shelf_Life → allergen cascade runs automatically → widget shows auto-derived badges → Technical manager reviews + confirms or overrides with MODAL-09
18. Jane monitors SCR-01 dashboard daily — RED alert if days_to_launch <= 10 with missing data
19. All 7 Closed_<Dept> = Yes → status_overall = 'Complete'
20. Jane navigates to SCR-11 → pre-flight shows all green → [Build D365 Output] → MODAL-05 MFA → execute
21. Builder_FA[code].xlsx generated → Built=TRUE → [Download] → Jane pastes to D365
22. Done. FA appears on dashboard as "Built" (badge-blue).

---

### FLOW-02 — Edit formulation field → cascade chain → built flag reset

1. Production manager opens SCR-03d (Production tab) for FA in 'Built' state
2. Sees `alert-amber` strip: "This FA has been built. Editing will reset the Built flag."
3. Edits `Process_1` dropdown → cascade fires: `pr_code_p1` auto-updates (green cell updates instantly, < 200ms)
4. `pr_code_final` recalculates → V06 checked → if suffix mismatch: `alert-amber` inline "MISMATCH: ..."
5. Auto-save on blur → server-side trigger resets `fa.built = FALSE`
6. Toast appears: "Built flag reset — D365 Builder output is outdated. Re-run Builder after all edits."
7. Right panel validation refreshes — Built status card shows "Not built" badge-gray

---

### FLOW-03 — Allergen cascade RM → FA with manual override

1. Technical manager opens SCR-03e (Technical tab)
2. Allergen widget shows auto-derived badges (from RM1939 confirmed Gluten, Milk; from Process Coat adds Soy)
3. Technical manager knows supplier updated their spec — Milk allergen removed
4. Clicks "Override" checkbox next to Milk badge → MODAL-09 opens
5. MODAL-09: Override to = Exclude, Reason = "Supplier spec dated 2026-04-15 confirms milk-free. See Doc #123."
6. [Save Override] → Milk badge shows orange border + "Manual" label + tooltip with reason
7. Audit event emitted (`fa.allergens_changed`)
8. Later: Technical manager clicks [Refresh Allergens] → cascade re-runs → Milk would be re-added by auto-cascade but system compares with override → shows diff indicator: "Override conflicts with auto-cascade. Override preserved. Review if source data has changed."

---

### FLOW-04 — D365 Builder N+1 products per FA

1. Jane opens SCR-11 (D365 Builder) for FA5101 "Test Pork Slices 300g"
2. Pre-flight shows: Process_1=Strip (suffix A), Process_2=Slice (suffix F)
3. N+1 preview: PR5101A (Strip intermediate) | PR5101F (Slice intermediate) | FA5101 (final)
4. MODAL-05 or MODAL-10 Step 6 shows this breakdown
5. Build executes → Builder_FA5101.xlsx contains:
   - D365_Data tab: 3 rows (PR5101A, PR5101F, FA5101)
   - Formula_Version tab: 3 entries
   - Formula_Lines tab: per material per product
   - Route tabs: per product
   - All OP=10 (D365 convention)
6. Jane downloads → opens in Excel → pastes tab-by-tab to D365 web UI

---

### FLOW-05 — Brief intake (first screen of NPD pipeline)

1. Jane receives customer brief (email / Excel)
2. Opens SCR-04 (Brief List) → [+ New Brief]
3. MODAL-02 → selects "Multi Component" template (e.g. Italian Platter)
4. SCR-05 opens → Section A: fills Product = "Italian Platter", Dev Code = DEV26-037, Volume = 200
5. Adds 3 component rows: Prosciutto | Pepperoni | Provolone with weights per component
6. Summary row auto-validates: total weight = sum of components
7. Section B: fills Base Web Code, Sleeve Code, packaging details
8. [Mark Complete] → [Convert to PLD] appears
9. Jane clicks [Convert] → MODAL-03 → enters FA0042 → confirms
10. 3 ProdDetail rows created (one per component). FA0042 Core section pre-populated.

---

## 6. Empty / zero / onboarding states

### Dashboard — first time (no FAs)
Full-width centered card: "Welcome to NPD." Subtext: "This module manages your Factory Article pipeline. Start by creating a Brief or adding an FA directly." Two CTAs: [+ Create Brief] btn-primary | [+ Create FA] btn-secondary. Below: brief explanation of the 7-dept workflow with icon-labeled steps.

### FA List — no FAs
Centered illustration area. Heading: "No Factory Articles yet." Text: "A Factory Article (FA) represents a product in development. Create one from a Brief or directly." [+ Create FA] btn-primary.

### Brief List — no briefs
Heading: "No Briefs yet." Text: "Briefs are the starting point of the NPD pipeline. Fill a brief to capture product concept and convert it to a Factory Article." [+ New Brief] btn-primary.

### FA Detail — Core tab (newly created FA)
`alert-blue` info strip at top: "Fill Core section first. Other departments unlock once Core is closed." All fields empty with placeholders. Required field asterisks visible.

### Production tab — Pack_Size not filled
Full tab area shows: lock icon centered. "Fill and save Pack_Size in Core first." Link: [Go to Core tab].

### MRP tab — blocking not met
Same pattern: "Core and Production must both be closed before MRP data can be entered." Link: [Go to Production tab].

### Allergen widget — no RM codes yet
"No allergen data available yet. Allergens will cascade automatically once RM codes are populated (via Finish Meat field in Core)." [Go to Core tab] link.

### D365 Builder — FA not complete
Full right panel shows: "FA must be in 'Complete' status before building. Currently: [status]." Progress indicator showing how many depts are done (e.g. "5 of 7 departments closed"). List of missing depts: "Planning: 2 required fields missing."

---

## 7. Notifications, toasts, alerts

### Toast messages (bottom-right, auto-dismiss 4s)

| Trigger | Toast type | Message |
|---|---|---|
| FA created | success (green) | "FA [fa_code] created successfully." |
| FA saved | success | "Changes saved." |
| FA save error | error (red) | "Failed to save. Please retry." |
| Dept closed | success | "[Dept] section closed." |
| Built flag reset (after edit) | warning (amber) | "Built flag reset — re-run D365 Builder after all edits." |
| D365 Builder complete | success | "Builder_FA[code].xlsx ready. Click to download." (persistent until dismissed or downloaded) |
| Brief converted | success | "FA [fa_code] created from Brief [dev_code]." |
| Allergen override saved | success | "Allergen override recorded." |
| Allergen cascade refresh | info (blue) | "Allergen cascade recalculated." |
| V06 suffix mismatch on save | warning | "Process suffix mismatch detected — review Production tab." |
| FA deleted | success | "FA [fa_code] deleted." |
| D365 Cache refreshed | info | "D365 material cache refreshed." |

### Inline alerts (within screens)

| Location | Type | Message |
|---|---|---|
| FA Detail header (when Built=TRUE and edits made) | `alert-amber` | "This FA was built for D365. Editing resets the Built flag." |
| Commercial tab (launch date warning) | `alert-blue` | "Minimum 24 weeks from Brief handoff. Earliest launch: [date]." |
| Brief Section A multi-comp weights mismatch | `alert-amber` | "Component weights do not total correctly. Difference: [X]g." |
| Technical tab V07 fail | `alert-amber` | "Allergen declaration incomplete — required before Technical close." |
| MRP tab V04 Missing material | `alert-red` | "Material [code] not found in D365. Contact MRP/D365 admin." |
| D365 Builder pre-flight V04 Missing | `alert-red` | "Cannot build: [code] is missing in D365. Fix before building." |
| Permission denied | `alert-blue` | "You do not have permission for this action. Contact your NPD Manager." |

### Dashboard alerts (persistent, row-level)

Described in SCR-01. RED/AMBER/GREEN per-row. No auto-dismiss — cleared when FA reaches 'Complete' or 'Built' status.

---

## 8. Responsive notes

The module is desktop-first (primary users: Jane and dept managers at workstations).

### Tablet (768–1024px)

**FA List table**: collapse Done/Not Done dept columns into a single "Progress" column showing "5/7 depts" text. Keep FA Code, Product Name, Status, Launch Date, Days Left, Actions. Horizontal scroll permitted for full table.

**FA Detail tabs**: tab labels shorten (Core, Plan, Comm, Prod, Tech, MRP, Proc). Right panel (Validation Status) collapses to a floating button at bottom-right that opens an overlay panel. Tab content remains full-width.

**Kanban (SCR-02b)**: show 3 status columns, others behind horizontal swipe. Column min-width decreases to 150px.

**Dashboard**: KPI cards stack to 2×2 grid. Dept table and Alert table stack vertically.

**Brief form**: Section A and Section B stack into single column. Multi-component row table collapses to card-per-component with expand.

### Mobile (<768px)

Not the primary use case. Minimal support:

**Dashboard**: single-column. KPI cards 2×2. Dept table = horizontal scroll. Alert table = card-per-FA.

**FA List**: single-column card list instead of table. Each card: FA Code | Product Name | Status badge | Days Left. Tap to open FA detail.

**FA Detail**: tabs collapse to dropdown selector at top. Right panel (Validation) hidden by default, accessible via floating info button. Form fields full-width stacked.

**D365 Builder**: pre-flight checks shown as accordion. Build button visible. Download link prominent.

**Kanban**: list view forced (no kanban on mobile).

---

## 9. Open questions for designer

1. **Brief fields C21-C37** are TBD (pending full rescan per PRD §14 open item #1). The prototype should render these as placeholder text inputs labeled "[Field C21] — mapping TBD". Designer should leave room for 17 additional fields in Section B.

2. **Allergen override conflict indication**: when auto-cascade contradicts a saved manual override (Refresh Allergens re-derives a different result), the PRD says "user sees diff." Designer must decide the visual treatment — options: orange border + diff tooltip, or a separate conflict banner in the allergen widget. Recommend the latter (alert-amber inline in widget: "Auto-cascade differs from your override for: [allergen]. [Review override]").

3. **ProdDetail multi-component editor** (SCR-07): when a single FA has 10 components, the accordion may become unwieldy. Designer should consider whether to offer a paginated/tab view per component vs. all collapsed with expand.

4. **D365 Builder tab preview**: the 8-tab output in SCR-11 right panel — how detailed should the per-tab row preview be? PRD says "read-only summary." Recommend showing only row count per tab, with an optional "Expand" to see first 3 rows as a preview table (confirming data is correct before download).

5. **FA Code input helper**: PRD decision is manual input (Option A) with potential future auto-propose (Option C, Phase C). Designer may optionally add a helper text "Next suggested code: FA[NNNN]" below the field in MODAL-01, even if it is not auto-populated (cosmetic aide memoire).

6. **Blocked tab visual treatment**: the PRD says locked cells are `#D0D0D0`. On a white form, entirely gray fields may look like errors. Designer should consider adding a distinct "locked" icon (padlock) in the tab header and a section-level note rather than greying every individual field, which can be visually noisy.

7. **May-contain from line changeover history**: the allergen cascade includes `may_contain_line_history` (last 24h changeover). This requires a live link to 08-PRODUCTION (Phase C3). In Phase B.2, this source will be empty. Designer should show the badge slot with tooltip "Line changeover data not available until Phase C3 (08-PRODUCTION module)."

8. **Supplier per-component vs per-FA**: PRD open item #19 says per-component (aggregate comma-sep in fa.supplier). The Brief form already has Supplier per component row. In SCR-03g Procurement tab, does Jane see the aggregate or individual component suppliers? Recommend showing aggregate text field with tooltip explaining it is auto-aggregated from ProdDetail, and providing a [View per component] link to SCR-07.

9. **Built flag and BOM tab**: the BOM tab (SCR-03h) shows a computed BOM read-only. When `fa.built = TRUE`, should the BOM tab show the snapshot BOM that was sent to D365 (from `fa_builder_outputs`) or the current computed view? PRD does not specify — recommend current computed view with `alert-amber` if it differs from last built snapshot.

10. **V04 Refresh D365 Cache button** placement: it appears both in the MRP tab header and as a global action on the dashboard. Designer should decide if this is a single global button (in dashboard header or settings link) or per-tab. Recommend global placement in Dashboard with last-sync timestamp, plus a local [Refresh] button in MRP tab for convenience.

---

*01-NPD UX Specification — generated 2026-04-20. Source: PRD 01-NPD v3.0 + MONOPILOT-SITEMAP.html design tokens + archive wireframes NPD-001..NPD-015 (reference only — PRD v3.0 authoritative).*
