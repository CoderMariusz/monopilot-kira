# 13-MAINTENANCE — UX Specification (for prototype generation)

**Version:** 1.0 — Generated 2026-04-20 from PRD v3.0  
**Consumer:** Claude Design — interactive HTML prototypes  
**Scope:** Maintenance manager desktop + technician tablet (10"). WR submission via 06-SCANNER-P1 mobile — referenced only.

---

## 0. Module Overview

**13-MAINTENANCE** delivers a fully integrated CMMS (Computerized Maintenance Management System) inside MonoPilot MES. It covers the complete lifecycle of physical assets: registration, preventive maintenance (PM) scheduling, work requests, maintenance work orders (**mWO** — always use this prefix; never abbreviate as "WO" to avoid confusion with production work orders from 08-PRODUCTION and 04-PLANNING), technician assignment, LOTO safety procedures, spare parts inventory, calibration management, sanitation records, and KPI analytics (MTBF, MTTR, PM compliance, asset availability).

**Naming convention enforced throughout:** Production work orders = "WO" or "production WO". Maintenance work orders = **mWO** (prefix mandatory). This distinction must be visible in every screen label, column header, modal title, and breadcrumb.

**Primary personas:**
- **Maintenance Manager** (`maintenance_manager`) — full CRUD on all entities, mWO approval, PM schedule management, dashboard owner.
- **Maintenance Technician** (`maintenance_technician`) — executes assigned mWOs, logs labor and parts, performs LOTO, enters calibration readings.
- **Production Supervisor / Operator** (`operator` / `production_manager`) — submits work requests from the shop floor, read-only view of asset status and next PM.
- **Safety Officer** — second signer on LOTO and allergen sanitation procedures.
- **Quality Manager** (`quality_manager`) — reads calibration records, reviews evidence for BRCGS/HACCP audits.
- **Auditor** — read-only access to all records including 7-year retention archives.

**Cross-module integrations (summarised for designer reference):**
- **08-PRODUCTION**: Downtime events auto-generate mWOs (source = `auto_downtime`). When an mWO closes, the linked downtime event in 08-PRODUCTION is marked resolved. OEE data (MTBF, MTTR, availability) is read from 15-OEE materialized views — Maintenance does not duplicate these calculations.
- **02-SETTINGS**: Machines and production lines are created in Settings → Infrastructure and referenced here as assets. Rules registry stores `mwo_state_machine_v1`, `pm_schedule_due_engine_v1`, etc. — Maintenance reads these; it does not edit them.
- **05-WAREHOUSE**: Spare parts are a separate catalog in Maintenance (D-MNT-6), but stock quantities and warehouse location references cross-link to the 05-WH warehouse master. Consumption transactions emit `spare_parts.consumed` outbox events consumed by 10-FINANCE.
- **09-QUALITY**: Calibration instruments (`calibration_instruments.id`) are the FK target for `lab_results.equipment_id` in 09-QA. A FAIL calibration result emits a hold-candidate event to 09-QA. Overdue calibration on a CCP-linked instrument blocks production use — show cross-module gate banner.
- **06-SCANNER-P1**: Scanner screen SCN-090 (P2) enables technicians to scan an asset QR code to open its mWO worklist, log service events, or consume spare parts. WR creation from shop floor is also accessible via deep link from the scanner app. These flows live in 06-SCANNER-P1-UX.md; this document provides the receiving screens.

---

## 1. Design System (Inherited)

All tokens are sourced from `MONOPILOT-SITEMAP.html`. Apply without deviation.

### 1.1 Color tokens

| Token | Hex | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary buttons, active sidebar border, tab underline, links, focus ring |
| `--green` | `#22c55e` | Success states, operational badge accent |
| `--amber` | `#f59e0b` | Warning, due/scheduled badge, overdue approaching |
| `--red` | `#ef4444` | Error, overdue badge, critical priority, blocked states |
| `--info` | `#3b82f6` | Informational alerts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Global sidebar background |
| `--card` | `#ffffff` | Card and modal background |
| `--text` | `#1e293b` | Primary body text |
| `--muted` | `#64748b` | Secondary labels, table headers, timestamps |
| `--border` | `#e2e8f0` | All borders and dividers |
| `--radius` | `6px` | Card and modal border-radius |

### 1.2 Status badge palette — Maintenance-specific

Apply `.badge` base class plus the modifier listed:

| Status | Class | Display text | Meaning |
|---|---|---|---|
| Operational | `.badge-green` | "Operational" | Asset running normally |
| Scheduled | `.badge-blue` | "Scheduled" | mWO or PM scheduled, not started |
| Due | `.badge-amber` | "Due" | PM or calibration due within warning window |
| Overdue | `.badge-red` | "Overdue" | PM or calibration past due date |
| In Work | custom indigo `#e0e7ff / #3730a3` | "In Work" | mWO currently in_progress |
| Completed | `.badge-gray` | "Completed" | mWO or PM completed |
| Cancelled | `.badge-gray` | "Cancelled" | Cancelled mWO |
| Lockout | custom yellow-striped pattern | "LOTO Active" | Equipment under lockout/tagout; yellow background with diagonal stripe CSS `repeating-linear-gradient(45deg, #fef08a, #fef08a 4px, #fbbf24 4px, #fbbf24 8px)`, text `#78350f` |
| Requested | `.badge-blue` | "Requested" | mWO submitted, awaiting triage |
| Approved | `.badge-blue` | "Approved" | mWO approved, awaiting assignment |
| Open | `.badge-blue` | "Open" | mWO assigned, ready to start |

### 1.3 Priority badge palette

| Priority | Class | Display text |
|---|---|---|
| Critical | `.badge-red` | "Critical" |
| High | `.badge-amber` | "High" |
| Medium | `.badge-blue` | "Medium" |
| Low | `.badge-gray` | "Low" |

### 1.4 Asset type icons

Use inline emoji or SVG as avatar prefix in asset name cells:
- Mixer: ⚙️ — Oven: 🔥 — Packer: 📦 — Scale: ⚖️ — Thermometer: 🌡️ — pH Meter: 🧪 — CIP Unit: 🚿 — Conveyor: ➡️ — Compressor: 💨 — Generic: 🔩

### 1.5 LOTO lock icon

Use 🔒 (Unicode lock emoji or SVG padlock icon, 16px) adjacent to any asset with `requires_loto=true`. Display in asset name cell and asset detail header. When LOTO is currently applied, switch to a yellow-filled lock icon and apply the lockout badge.

### 1.6 Component classes

Same as established in 08-PRODUCTION-UX and 05-WAREHOUSE-UX:
- `.kpi` / `.kpi-label` / `.kpi-value` / `.kpi-change` — KPI cards
- `.tabs` / `.tab` / `.tab.active` — horizontal tab bars
- `.tl-item` / `.tl-dot` / `.tl-time` — timeline rows
- `.alert-red` / `.alert-amber` / `.alert-blue` / `.alert-green` — alert boxes
- `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-success`
- `.form-field` / `.form-label` / `.form-input` / `.req` (red asterisk)
- `.grid-2` / `.grid-3` / `.grid-4` — equal-column grids
- `.card` / `.card-title`
- `#modal-overlay` / `#modal-box` / `.modal-title` / `.modal-close`
- `.kanban` / `.kanban-col` / `.kanban-col-title` / `.kanban-card`

---

## 2. Information Architecture

### 2.1 Sidebar entry

**Group:** NEW  
**Icon:** 🔩 (wrench-and-bolt, to distinguish from 🔧 Technical module — see §9 open question)  
**Label:** Maintenance  
**Active state:** `background #1e3a5f`, `border-left 3px solid #1976D2`, `color #fff`

Sub-items (class `.sidebar-subitem`, 12px, indent 28px, color `#94a3b8`):
1. Dashboard
2. Assets
3. Work Requests
4. mWOs
5. PM Schedules
6. Calibration
7. Spares
8. Technicians
9. LOTO
10. Analytics
11. Settings

### 2.2 Route map

| Screen | Route |
|---|---|
| Maintenance Dashboard | `/maintenance` |
| Asset List | `/maintenance/assets` |
| Asset Detail | `/maintenance/assets/:id` |
| Work Request List | `/maintenance/wr` |
| Work Request Detail | `/maintenance/wr/:id` |
| mWO List | `/maintenance/mwos` |
| mWO Detail | `/maintenance/mwos/:id` |
| PM Schedule List | `/maintenance/pm` |
| PM Schedule Detail | `/maintenance/pm/:id` |
| Calibration List | `/maintenance/calibration` |
| Calibration Record Detail | `/maintenance/calibration/:id` |
| Spares List | `/maintenance/spares` |
| Spare Part Detail | `/maintenance/spares/:id` |
| Technicians List | `/maintenance/technicians` |
| Technician Detail | `/maintenance/technicians/:id` |
| LOTO Procedures List | `/maintenance/loto` |
| Maintenance Analytics | `/maintenance/analytics` |
| Maintenance Settings | `/maintenance/settings` |

### 2.3 Permissions matrix

| Action | operator | maintenance_technician | maintenance_manager | production_manager | quality_manager | admin | auditor |
|---|---|---|---|---|---|---|---|
| Submit WR | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| Triage WR / Approve mWO | — | — | ✓ | — | — | ✓ | — |
| Execute mWO (in_progress) | — | ✓ (own) | ✓ | — | — | ✓ | — |
| Create PM schedule | — | — | ✓ | — | — | ✓ | — |
| Asset CRUD | — | read | ✓ | read | read | ✓ | read |
| Calibration record entry | — | ✓ | ✓ | — | read | ✓ | read |
| LOTO apply/clear | — | ✓ | ✓ | — | — | ✓ | — |
| Spare parts consume | — | ✓ | ✓ | — | — | ✓ | — |
| Analytics read | — | limited | ✓ | ✓ | limited | ✓ | ✓ |
| Settings edit | — | — | ✓ | — | — | ✓ | — |

---

## 3. Screens

---

### MAINT-001 — Maintenance Dashboard

**Route:** `/maintenance`  
**Purpose:** Single-pane overview for the maintenance manager and shift lead. Surfaces critical alerts, today's workload, KPI trends, and LOTO status at a glance. Auto-refreshes every 30 seconds.

**Layout regions:**
- **Top bar:** Page title "Maintenance Dashboard", breadcrumb "Maintenance", right-aligned auto-refresh toggle ("Auto-refresh 30s") and manual Refresh button. A 2px blue progress bar slides across the top during each refresh cycle.
- **Alert strip (conditional):** Full-width `.alert-red` below the top bar, shown only when: any mWO is critical-priority and overdue >2h; any calibration is overdue with a CCP link; any active LOTO has timed out. Shows a count with an icon and a link to the relevant list. Hidden when no alerts exist.
- **KPI row:** Eight KPI cards in a scrollable horizontal row (use `grid-template-columns: repeat(8, 1fr)`, wraps on tablet to two rows of four). Each card is `.kpi` with accent color:
  1. "PM Compliance (30d)" — `%` value — `.amber` if <85%, `.red` if <70%, `.green` if ≥85%
  2. "Overdue PMs" — integer count — `.red` if >0, `.green` if 0
  3. "Open Work Requests" — integer count — `.amber` if >5, `.blue` otherwise
  4. "mWOs In Progress Today" — integer count — `.blue`
  5. "MTBF (30d avg)" — hours value e.g. "142h" — `.green` if above target, `.amber` if within 10% below, `.red` if below
  6. "MTTR (30d avg)" — minutes e.g. "48m" — `.green` if <60m, `.amber` if 60–90m, `.red` if >90m
  7. "LOTO Active Now" — integer count — `.amber` if >0, `.green` if 0
  8. "Asset Availability (30d)" — `%` — `.green` if ≥95%, `.amber` if 90–95%, `.red` if <90%
- **Main grid (below KPIs):** Two columns, ratio 2:1.
  - **Left column — Today's mWO List:** Card titled "mWOs Scheduled Today". Table with columns: mWO#, Asset, Type (badge), Priority (badge), Technician (avatar + name or "Unassigned" in amber italic), Status (badge), Scheduled Time. Rows are sortable by clicking column headers. Click any row navigates to the mWO detail. "View all mWOs →" link at the bottom.
  - **Right column — Stacked panels:**
    - **Critical Alerts panel:** Card titled "Critical Alerts". List of `.tl-item` rows, each with a colored `.tl-dot` (red = critical/overdue, amber = warning), description, and timestamp. Types: overdue PM (red), overdue calibration (red), LOTO timeout (red), spare below reorder point (amber), mWO SLA breach (amber). Empty state shows green check: "No critical alerts — all systems nominal." Maximum 8 rows; "View all alerts →" link.
    - **LOTO Active panel:** Card titled "Active LOTO Procedures". List of equipment currently under lockout, showing asset name, procedure#, applied time, and technician. Each row has yellow lockout badge. Empty state: "No active LOTO procedures." "Go to LOTO →" link.

**Primary actions:** "New Work Request" button (`.btn-primary`, top right) — opens WR Create modal. "New mWO" button (`.btn-secondary`) — opens mWO Create modal.

**States:**
- **Loading:** Three-row skeleton shimmer in each card region. KPI cards show gray placeholder rectangles.
- **Empty (first use):** KPI row shows all zeros. Alert strip hidden. Both cards show onboarding prompts (see §6).
- **Error:** Full-width `.alert-red` "Could not load dashboard data. Check your connection and try again." with Retry button.
- **Permission-denied (operator):** KPI row shows only the three operator-visible KPIs (open WRs, mWOs today, LOTO active). Alert strip hidden. mWO list replaced with "Submit a work request" CTA panel.

**Microcopy:**
- KPI card MTBF label tooltip: "Mean Time Between Failures — sourced from 15-OEE metrics. Read-only."
- LOTO panel empty: "Safe to proceed — no equipment is currently locked out."
- Auto-refresh note: "Data refreshes automatically every 30 seconds."

---

### MAINT-002 — Asset List

**Route:** `/maintenance/assets`  
**Purpose:** Full registry of all equipment under maintenance management. Filterable, sortable, searchable.

**Layout regions:**
- **Top bar:** Page title "Assets", breadcrumb "Maintenance › Assets". Right-aligned: search box (placeholder "Search by asset ID, name, or location"), "+ Add Asset" button (`.btn-primary`, `maintenance_manager` and `admin` only).
- **Filter bar:** Below the search, a horizontal row of filter controls:
  - **Type** dropdown: All / Mixer / Oven / Packer / Scale / Thermometer / pH Meter / CIP Unit / Conveyor / Other
  - **Location** text-input with autocomplete against `ltree` path hierarchy (e.g., "Site A › Line 1")
  - **Production Line** dropdown: sourced from 02-SETTINGS production lines
  - **Criticality** dropdown: All / Critical / High / Medium / Low
  - **Status** dropdown: All / Operational / Scheduled / Due / Overdue / In Work / LOTO Active
  - **Requires LOTO** toggle checkbox
  - **Requires Calibration** toggle checkbox
  - Clear filters link (appears only when any filter is active)
- **Asset table:** Full-width card containing the table.

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| Asset ID | monospace text | `EQ-2024-0042` | Clickable → Asset Detail. Prefixed by asset type icon |
| Name | text | "Line 1 Packer" | Followed by 🔒 if `requires_loto=true` |
| Type | text | "Packer" | |
| Location | breadcrumb-style | "Site A › Line 1 › Station 3" | Truncated to last two levels with tooltip on hover |
| Production Line | text link | "Line 1" | Links to 08-PRODUCTION line detail |
| Criticality | badge | Critical / High / Medium / Low | Using priority badge palette |
| Status | badge | Operational / Due / Overdue / In Work / LOTO Active | Using status badge palette |
| Last Service | date | "12 Apr 2026" | Muted if >90 days ago |
| Next PM | date | "20 May 2026" | Red if overdue, amber if within 7 days |
| Availability % | percentage | "94.2%" | Sourced from 15-OEE. Green ≥95%, amber 90–95%, red <90% |
| Actions | icon buttons | Edit (pencil), View mWOs (list icon) | Shown on row hover |

**Row states:**
- Overdue PM: entire row has a subtle left border `3px solid #ef4444`.
- LOTO Active: row background `#fefce8` (yellow-50).
- Inactive asset: row text is muted, "Inactive" badge appended to name.

**Primary actions:** "+ Add Asset" → Asset Create modal. Click row → Asset Detail (`/maintenance/assets/:id`).

**Secondary actions:** Bulk select (checkbox column on left) → "Bulk assign PM template" or "Export CSV" buttons appear in a contextual action bar above the table.

**States:**
- **Loading:** Table skeleton with 6 shimmer rows.
- **Empty:** Illustration (gear icon, no border) with heading "No assets yet" and body "Import machines and lines from Settings, or add your first asset manually." Two buttons: "Import from Settings" (`.btn-primary`) and "Add Asset Manually" (`.btn-secondary`).
- **No search results:** "No assets match your filters. Try adjusting the search or clearing filters."
- **Error:** `.alert-red` "Failed to load assets."
- **Permission-denied:** Same table, but Actions column is hidden. No "+ Add Asset" button.

**Microcopy:**
- Filter bar label: "Filter assets"
- Availability tooltip: "30-day rolling availability from 15-OEE metrics. Last refreshed: [timestamp]."

---

### MAINT-003 — Asset Detail

**Route:** `/maintenance/assets/:id`  
**Purpose:** Complete information card for a single asset. Contains nameplate data, service history, PM schedule, calibration, spare parts BOM, documents, and linked downtime events.

**Layout regions:**
- **Header panel:** White card at top. Left side: asset type icon (32px), asset name (20px bold), asset code (12px monospace muted), status badge. Right side: criticality badge, LOTO icon (if `requires_loto=true`), calibration required badge (if `requires_calibration=true`), and three action buttons: "Create mWO" (`.btn-primary`), "Edit Asset" (`.btn-secondary`, manager only), "Deactivate" (`.btn-danger`, manager only, with confirmation).
- **Tab bar (8 tabs):** Overview | Service History | PM Schedule | Calibration | Spares BOM | Documents | Downtime Events | Sensors (P2)

**Tab — Overview:**
Two-column grid. Left: "Asset Nameplate" card with fields displayed as label: value pairs — Asset Code, Name, Equipment Type, Production Line (link), Location Path, Requires LOTO (Yes/No), Requires Calibration (Yes/No), Calibration Interval (e.g., "90 days"), Active status (badge). Optional L3 extension fields rendered below (if tenant has l3_ext_cols defined: Manufacturer Serial, Warranty Expiry, etc.). Right: "Current Status" card showing current mWO (if any) with link, last service date, next PM due date (colored red if overdue), MTBF (last 90d, from 15-OEE), MTTR (last 90d), availability % (last 30d). Below current status: a mini alerts list — any active LOTO, overdue calibration, or critical open mWOs shown as `.alert-red` or `.alert-amber` items.

**Tab — Service History:**
Timeline view (`.tl-item` rows) showing all completed mWOs for this asset, sorted newest first. Each row: tl-dot color coded by mWO type (blue=preventive, amber=reactive, gray=calibration, green=sanitation), mWO number (link), summary text, date, technician name, duration, cost. "Load more" button at bottom (pagination, 20 per page). Empty state: "No service history recorded yet." Filter controls above timeline: date range picker and type filter.

**Tab — PM Schedule:**
Lists all active PM schedules for this asset. Mini table: PM#, Schedule Type, Frequency, Last Performed, Next Due (badge colored by due-ness), Assigned Technician. "+ Add PM Schedule" button links to PM Schedule create modal pre-filled with this asset. Each row expandable to show the task checklist template preview.

**Tab — Calibration (shown only if `requires_calibration=true`):**
Lists all calibration instruments linked to this asset. For each instrument: instrument code, type, standard, interval, last calibrated (date + result badge PASS/FAIL/OUT_OF_SPEC), next due date (badge). If any instrument is overdue and linked to a CCP in 09-QUALITY, a prominent `.alert-red` banner is shown: "⚠ Calibration overdue — this instrument is linked to a CCP in Quality. Production use is blocked until re-calibrated." "Record Calibration" button per instrument. Full calibration records below in timeline format.

**Tab — Spares BOM:**
Table of spare parts associated with this asset. Columns: Part Code, Description, Unit, Qty Planned per Service, On Hand (pulled from `spare_parts_stock`; shown red if below reorder point), Last Used, Unit Cost. "+ Add Part" button (manager only). Click part row opens Spare Part Detail.

**Tab — Documents:**
Grid of attached documents (PDF manuals, SOPs, drawings). Each card shows file name, file type icon, upload date, uploaded by. "Upload Document" button. Click card → opens file in new tab or downloads. Delete icon on hover (manager only). Empty state: "No documents attached. Upload manuals, SOPs, or drawings."

**Tab — Downtime Events:**
Table of 08-PRODUCTION downtime events linked to this asset (via `downtime_event_id` on mWOs). Columns: Event Date, Line, Duration (minutes), Cause Category, Linked mWO# (or "Auto-created" badge if source=`auto_downtime`, or "Unlinked" badge in amber). Unlinked events show a "Link mWO" action button. Source from 08-PRODUCTION read-only view.

**Tab — Sensors (P2):**
Placeholder panel with a `.alert-blue` info banner: "IoT sensor integration is available in Phase 2. Contact your administrator to enable sensor monitoring for this asset." Shows a muted preview of what sensor data would look like (temperature trend line, vibration graph) as a greyed-out illustration.

**States:** Loading per-tab skeleton. Error per-tab alert. Permission-denied: Edit/Deactivate buttons hidden; all tabs readable.

---

### MAINT-004 — Work Request List

**Route:** `/maintenance/wr`  
**Purpose:** Queue of all submitted work requests awaiting triage by the maintenance manager. Operators and supervisors can track status of their submitted requests here.

**Layout regions:**
- **Top bar:** Page title "Work Requests", breadcrumb "Maintenance › Work Requests". Right-aligned: search box (placeholder "Search by WR#, asset, or reporter"), "+ Submit Work Request" button (`.btn-primary`, all authenticated users).
- **Filter bar:** Status dropdown (All / Submitted / Triaged / Scheduled / Rejected), Priority dropdown, Date range picker, Reporter filter (user picker), Asset filter.
- **Kanban view toggle:** Toggle between Table view and Kanban view (columns: Submitted | Triaged | Scheduled | Rejected). Kanban is the default for maintenance manager; table is default for operators. Preference persisted to localStorage.

**Table columns (Table view):**

| Column | Type | Example | Notes |
|---|---|---|---|
| WR # | monospace link | `WR-2026-00891` | Clicking opens WR detail modal inline |
| Asset | text + icon | ⚙️ Line 1 Mixer | Links to Asset Detail |
| Reporter | avatar + name | "J. Kowalski" | |
| Reported At | datetime | "20 Apr 2026 14:32" | |
| Priority | badge | Critical / High / Medium / Low | |
| Status | badge | Requested / Approved / Open / In Progress / Completed / Cancelled | mWO lifecycle states |
| Description | text | "Grinding noise from gearbox" | Truncated to 60 chars, full on hover tooltip |
| Linked mWO | monospace link | `MWO-2026-00123` | "Pending" in amber if not yet triaged |
| Actions | buttons | "Triage" / "View" | "Triage" shown for maintenance_manager only, on Requested status rows |

**Kanban view:** Four columns. Each card shows: WR#, asset name, priority badge, reporter, time since submitted. Cards are draggable from "Submitted" to "Triaged" for quick status update (triggers triage modal). Column headers show count badge.

**States:** Loading, empty (see §6), no-results, error, permission-denied (operator sees only their own WRs, no triage actions).

**Microcopy:**
- Submitted column header: "Awaiting Triage (N)"
- Empty state: "No work requests. Operators can submit requests from the shop floor or via the Scanner app."

---

### MAINT-005 — Work Request Create Modal (Shop-floor friendly)

**Triggered from:** "+ Submit Work Request" button on WR list; scanner deep-link; 08-PRODUCTION downtime screen (auto-populated).  
**Purpose:** Simple, fast form optimized for shop-floor submission by an operator. Three fields on a single screen. Large touch targets for tablet/mobile use.

**Modal title:** "Submit Work Request"  
**Width:** 560px standard. On tablet (06-SCANNER context) the modal expands to full screen.

**Fields:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Asset | searchable select or scan | Yes | "Line 1 Packer (EQ-0042)" | Must select existing asset; "Scan Asset QR" button opens camera (06-SCANNER deep-link) |
| Problem Description | textarea (4 rows) | Yes | "Grinding noise from the main gearbox, started at 14:00" | Min 10 characters, max 1000 |
| Severity | radio group (large buttons) | Yes | Critical / High / Medium / Low | Maps to priority on created mWO |
| Photos (optional) | file upload (multi) | No | JPEG/PNG, max 5 files, 10MB each | Accept image/* |
| Additional Notes | textarea (2 rows) | No | "Noise increases when running at >80% speed" | Max 500 characters |

**Auto-fill (when triggered from 08-PRODUCTION downtime):** Asset and Problem Description are pre-populated from the downtime event. A blue info banner: "Auto-filled from downtime event #[ID] on [Line]. Verify details before submitting."

**Footer buttons:** "Submit Request" (`.btn-primary`) | "Cancel" (`.btn-secondary`)

**On submit:** POST to create mWO with state `requested`. Toast: "Work request WR-YYYY-NNNNN submitted. Maintenance team will triage shortly." WR# is a hyperlink in the toast.

**States:**
- **Submitting:** Button shows spinner, disabled. Inputs locked.
- **Error:** Inline field validation errors. If network error: `.alert-red` "Failed to submit. Check your connection and try again."
- **Asset scan result:** When scanned asset is not found in equipment registry, show `.alert-amber` "Asset not recognised. Enter details manually or contact your maintenance team."

---

### MAINT-006 — WR Triage Modal (Maintenance Manager)

**Triggered from:** "Triage" button on WR List row, or from WR detail view.  
**Purpose:** Maintenance manager reviews the submitted work request and decides: approve (auto-creates or links mWO), reject with reason, or mark as duplicate.

**Modal title:** "Triage Work Request — WR-YYYY-NNNNN"

**Read-only summary section (top):** Asset name, reported by, reported at, problem description, attached photos (thumbnail strip, click to enlarge), priority suggestion from reporter.

**Decision fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Decision | radio group (large) | Yes | "Approve & Create mWO" / "Reject" / "Mark as Duplicate" |
| Priority | select | Yes (if Approve) | Critical / High / Medium / Low; pre-filled from reporter suggestion |
| mWO Type | select | Yes (if Approve) | Reactive / Preventive / Inspection |
| Estimated Start | date+time picker | No | |
| Assigned Technician | user picker | No | Can be assigned later |
| Rejection Reason | textarea | Yes (if Reject) | Min 10 chars; visible to reporter |
| Duplicate Of | mWO search | Yes (if Duplicate) | Searchable by mWO# |

**Footer:** "Confirm Decision" (`.btn-primary`) | "Cancel" (`.btn-secondary`)

**On approve:** mWO created with state `approved` (or `open` if technician already assigned). Toast: "mWO MWO-YYYY-NNNNN created from WR." mWO# is a link.

**Validation:** V-MNT-02 enforced — approver cannot be the same user as the requester (if same user triggers triage of their own WR, show `.alert-red` "You cannot approve your own work request. Ask a colleague to review.").

---

### MAINT-007 — mWO List

**Route:** `/maintenance/mwos`  
**Purpose:** Master list of all maintenance work orders. Primary worklist for maintenance manager. Technicians see a filtered view of their own assigned mWOs.

**Layout regions:**
- **Top bar:** Page title "Maintenance Work Orders (mWOs)", breadcrumb, search box (placeholder "Search by mWO#, asset, or technician"), "+ New mWO" button (`.btn-primary`, manager only).
- **View tabs:** All | My mWOs (technician-scoped) | Open | In Progress | Overdue | Completed
- **Filter bar:** Type (All / Reactive / Preventive / Calibration / Sanitation / Inspection), Priority, Technician, Date range (scheduled start), Source (All / Manual / Auto-Downtime / PM Schedule / OEE Trigger / Calibration Alert).

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| mWO # | monospace link | `MWO-2026-00123` | Click → mWO Detail |
| Asset | icon + text | 🔩 Line 2 Conveyor | |
| Type | badge | Reactive / Preventive / Calibration / Sanitation / Inspection | |
| Priority | badge | Critical / High / Medium / Low | |
| Status | badge | Full mWO lifecycle states | |
| Technician | avatar + name | "M. Nowak" or "Unassigned" (amber) | |
| Scheduled Start | date | "21 Apr 2026 08:00" | Red if start is overdue |
| ETA / Target Close | date | "21 Apr 2026 12:00" | |
| Downtime Impact | icon | 🔴 "Yes" / — | Red flag icon if linked to downtime event in 08-PRODUCTION |
| Source | badge | "PM Schedule" / "Auto-Downtime" / "Manual" / "OEE Trigger" | `.badge-blue` for PM, `.badge-amber` for auto-downtime |
| Actions | icon buttons | Start (play) / Complete (check) / Cancel (×) | State-dependent |

**Row actions (state-dependent):**
- `requested`: "Triage" button (manager only)
- `approved`: "Assign & Open" button (manager only)
- `open`: "Start Work" button (technician or manager)
- `in_progress`: "Log Work" / "Complete" buttons (technician or manager)
- `completed` / `cancelled`: "View" only

**States:** Loading skeleton, empty (see §6), permission-denied (technician sees own-only filtered list with no manager actions).

**Microcopy:**
- Overdue tab count badge: "(N) Overdue" — displayed in red if N > 0.
- Source column tooltip for "Auto-Downtime": "Created automatically from a downtime event in Production. Linked event: [event ID]."

---

### MAINT-008 — mWO Detail

**Route:** `/maintenance/mwos/:id`  
**Purpose:** Full lifecycle management screen for a single mWO. The technician's primary workspace when executing maintenance.

**Layout regions:**
- **Header panel:** mWO number (20px bold monospace), state badge (large, prominent), priority badge, asset name with icon and link, type badge, source badge. Right side: three action buttons — state-transition primary button (e.g., "Start Work", "Mark In Progress", "Complete mWO"), "Edit" (manager), "Cancel mWO" (`.btn-danger`, manager, confirmation required).
- **State machine visual strip:** A horizontal stepper showing the six states: Requested → Approved → Open → In Progress → Completed. Current state is highlighted in blue; completed states have a checkmark; future states are muted gray. Cancelled state replaces the terminal end if applicable.
- **LOTO warning banner (conditional):** If asset `requires_loto=true` and mWO is in state `open` (not yet started), show a prominent `.alert-amber` full-width banner: "⚠ LOTO Required — This equipment requires lockout/tagout before work begins. Complete the LOTO procedure before starting work." "Go to LOTO Checklist" button links to the LOTO tab. Cannot transition to `in_progress` until LOTO checklist `verified_at` is set.
- **Sanitation allergen banner (conditional):** If mWO type = `sanitation` and `allergen_change_flag=true`, show `.alert-red` banner: "🚨 Allergen Changeover — Dual sign-off required (Technician + QA). ATP test result must be recorded." Cannot proceed to `in_progress` without both signatories.
- **Tab bar (7 tabs):** Overview | Tasks | Parts | Labor | Downtime Link | Sign-off | History

**Tab — Overview:**
Two-column grid. Left: "Problem & Plan" card — Requester (name, timestamp), Problem Description, mWO Type, Assigned Technician (with avatar; picker if unassigned — manager only). Right: "Schedule & Cost" card — Scheduled Start, Scheduled End / ETA, Estimated Cost, Actual Cost (computed from parts + labor — shown once in_progress), Completion Notes (editable text field visible once completed).

**Tab — Tasks (Checklist):**
Ordered list of checklist steps (from `mwo_checklists`). Each step row:
- Step number (bold)
- Step description
- Step type badge: Check / Measure / Photo / Sign-off
- For "Measure" type: Expected value label + input field for "Actual Value" + Pass/Fail indicator
- For "Photo" type: "Take Photo" button + thumbnail if already uploaded
- For "Sign-off" type: "Sign Off" button (requires PIN re-entry on critical steps)
- Completed indicator: green checkmark when `passed=true` / `completed_at` is set
- Timestamps: "Completed by [name] at [time]" shown on completed steps

All steps locked when mWO state is not `in_progress`. When in_progress: checkboxes and input fields are active. "Add Step" button (manager only) at the bottom.

Empty state: "No checklist defined. Add steps manually or link a PM task template." "Load Template" button.

**Tab — Parts (Consumed):**
Two sub-sections:
- **Planned Parts:** Table from `mwo_spare_parts`. Columns: Part Code, Description, Qty Planned, Qty Actual (editable once in_progress), Unit Cost, Total. Row-level "Consume" button triggers Parts Consumption modal.
- **Unplanned Parts:** "+ Add Part" button opens Spare Part picker to add an unplanned consumption. Added rows show in amber with "Unplanned" badge.

Part row: if `qty_on_hand` drops to zero after consumption, show an inline `.alert-amber` "Stock now at zero — reorder recommended."

**Tab — Labor (Time Entries):**
Table of time entries. Columns: Technician, Start, End, Duration (computed), Notes. "+ Log Time" button opens time entry modal (fields: Start datetime, End datetime or Duration in minutes, Notes). Total labor cost computed and shown at table bottom if `hourly_rate` is set on technician profile.

**Tab — Downtime Link:**
If `downtime_event_id` is set: shows the linked 08-PRODUCTION downtime event card — Event ID, Line, Start/End timestamps, Duration, Cause Category. "View in Production →" link. "Unlink" button (manager, with confirmation). If not linked: "Link Downtime Event" button opens the Downtime Linkage modal (search + select from open downtime events).

**Tab — Sign-off:**
Conditional on mWO state reaching `completed` or on `sanitation` type with allergen flag. Three sign-off slots:
1. **Technician sign-off** — "Signed off as Technician: [name] at [datetime]" or "Sign Off as Technician" button (own account required). Confirmation requires entering completion notes.
2. **Supervisor sign-off** — "Signed off by Supervisor: [name] at [datetime]" or "Sign Off as Supervisor" button (`maintenance_manager` or `production_manager`). 
3. **Safety Officer sign-off (conditional)** — Shown only if LOTO was active or mWO is safety-critical. "Signed off by Safety: [name] at [datetime]" or "Request Safety Sign-off" button.
All sign-offs timestamped and non-editable once recorded.

**Tab — History:**
Audit trail of all state transitions and modifications. `.tl-item` timeline rows: event type (badge), "by [user]", "at [timestamp]", note (e.g., "State changed from Open to In Progress"). Read-only. Source events from outbox emit log.

**State-dependent UI behavior:**
- `requested`: All tabs read-only. Overview edit locked.
- `approved`: Overview assignee picker enabled (manager). Tasks tab shows template but inputs locked.
- `open`: LOTO banner shown if required. Tasks locked until transition to `in_progress`.
- `in_progress`: Tasks, Parts, Labor tabs fully editable. Header shows "Complete mWO" primary button.
- `completed`: All tabs read-only. Sign-off tab shows completed state. Cost totals shown.
- `cancelled`: Gray header banner "This mWO was cancelled: [reason]". All tabs read-only.

**Microcopy:**
- LOTO banner button: "Complete LOTO Checklist →"
- Completion notes placeholder: "Describe what was done, parts replaced, and any follow-up recommendations..."
- Sign-off note: "Your signature confirms this work has been completed safely and satisfactorily."

---

### MAINT-009 — PM Schedule List

**Route:** `/maintenance/pm`  
**Purpose:** Overview of all preventive maintenance schedules across all assets. Maintenance manager creates and manages schedules; the engine auto-generates mWOs when due dates arrive.

**Layout regions:**
- **Top bar:** Page title "PM Schedules", breadcrumb. Search box (placeholder "Search by PM#, asset, or technician"). "+ Create PM Schedule" button (`.btn-primary`, manager only). Calendar view toggle button (switches to `/maintenance/pm?view=calendar`).
- **Filter bar:** Schedule Type (All / Preventive / Calibration / Sanitation / Inspection), Asset filter, Technician filter, Status (All / Active / Inactive), Overdue toggle.
- **Summary KPI row (3 cards):** "Schedules Active" (integer), "Due This Week" (integer, amber if >0), "Overdue" (integer, red if >0).

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| PM # | monospace link | `PM-2026-00045` | Click → PM Schedule Detail |
| Asset | icon + text | ⚙️ Line 1 Mixer | Links to Asset Detail |
| Schedule Type | badge | Preventive / Calibration / Sanitation / Inspection | |
| Frequency | text | "Every 30 days" / "Every 500 hours" / "Every 1000 cycles" | |
| Last Performed | date | "01 Mar 2026" | Muted if never performed |
| Next Due | date + badge | "15 May 2026" + Due/Overdue badge | Red if overdue; amber within warning_days |
| Assigned Technician | avatar + name | "M. Nowak" / "Unassigned" | |
| Task Template | text | "Monthly Lubrication Checklist" / "—" | |
| Auto-Generate mWO | toggle | ✓ On | Read-only indicator; green if enabled |
| Active | toggle | ✓ | Manager can toggle inline |
| Actions | icon buttons | Edit (pencil), Skip (skip icon), Deactivate | |

**Calendar view (alternate view):** Monthly calendar showing PM due dates as colored event dots. Click a dot → PM Schedule Detail. Color coding matches schedule type: blue=preventive, green=calibration, amber=sanitation, gray=inspection. Navigation: prev/next month arrows, "Today" button.

**States:** Loading, empty (see §6), overdue rows highlighted with left red border, permission-denied (technician sees read-only list of their assigned schedules only).

---

### MAINT-010 — PM Schedule Create / Edit

**Route:** `/maintenance/pm/:id` (edit) or modal from `/maintenance/pm` (create)  
**Purpose:** Define a recurring maintenance schedule for an asset, including frequency, task template, lead time, and auto-mWO generation settings.

**Layout:** Triggered as a full 560px modal for creation; navigates to a dedicated page for editing complex schedules with the next-occurrences preview.

**Form sections and fields:**

**Section 1 — Asset & Type:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Asset | searchable select | Yes | "Line 1 Mixer (EQ-0042)" | Must be active equipment |
| Schedule Type | radio group | Yes | Preventive / Calibration / Sanitation / Inspection | |
| Schedule Name | text input | Yes | "Monthly Lubrication" | Max 100 chars |

**Section 2 — Frequency:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Interval Basis | radio group | Yes | Calendar Days / Usage Hours / Usage Cycles | |
| Interval Value | number input | Yes | 30 (days) | Min 1 |
| Warning Days | number input | No | 7 | Days before due to show amber badge; default 7 |
| Lead Time Days | number input | No | 3 | Days before due to auto-create mWO (if auto-generate enabled) |

**Section 3 — Assignment:**

| Field | Type | Required | Example | Notes |
|---|---|---|---|---|
| Assigned Technician | user picker | No | "M. Nowak" | Optional; can be left unassigned |
| Task Template | searchable select | No | "Monthly Lubrication Checklist" | From checklist template library |
| Auto-Generate mWO | toggle | No | On | When enabled, `pm_schedule_due_engine_v1` creates mWO at lead-time |

**Section 4 — Next Occurrences Preview (full-page edit view only):**
A read-only list titled "Next 12 Scheduled Occurrences" showing computed dates based on the current frequency settings. Updates live as the user changes Interval Value. Formatted as a simple date list with day-of-week label. Note: "Occurrence dates are estimates. Actual dates adjust based on completion of each PM."

**Footer:** "Save Schedule" (`.btn-primary`) | "Save & Activate" (`.btn-primary`) | "Cancel" (`.btn-secondary`) | "Delete" (`.btn-danger`, manager, confirmation modal).

**States:**
- **Saving:** Button spinner, inputs locked.
- **Validation error:** Inline errors under each field.
- **Allergen-type sanitation creation:** When Schedule Type = "Sanitation" and `allergen_change_flag` is added (via toggle that appears), show `.alert-amber` "Allergen changeover sanitation requires dual sign-off when executed. Ensure a QA manager is available."

---

### MAINT-011 — Calibration List

**Route:** `/maintenance/calibration`  
**Purpose:** Master list of all calibration instruments and their compliance status. Entry point for recording calibration results and managing BRCGS audit trail.

**Layout regions:**
- **Top bar:** Page title "Calibration", breadcrumb. Search box. "+ Add Instrument" button (manager only). "Export for Audit" button (`.btn-secondary`) — downloads CSV of all calibration records with `retention_until` dates for BRCGS audit.
- **Filter bar:** Type (All / Scale / Thermometer / pH Meter / Other), Standard (All / ISO 9001 / NIST / Internal / Other), Status (All / Current / Due / Overdue), CCP Linked toggle.
- **Summary strip:** Three counts — "Instruments Current" (green), "Due Within 30 Days" (amber), "Overdue" (red). Red count triggers a module-level notification badge on the sidebar.

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| Instrument Code | monospace link | `CAL-TH-0012` | Click → Calibration Detail |
| Name / Description | text | "Line 1 Oven Thermometer" | |
| Type | badge | Scale / Thermometer / pH Meter / Other | |
| Standard | text | "ISO 9001" | |
| Accuracy Spec | text | "±0.5°C (0–200°C)" | |
| Last Calibrated | date | "15 Jan 2026" | |
| Next Due | date + status badge | "15 Apr 2026" + Overdue | Red + Overdue badge if past; amber + Due badge within warning_days |
| Result | badge | PASS / FAIL / OUT_OF_SPEC | Green/Red/Amber |
| Linked CCP | text | "CCP-003 Oven Temp" | Link to 09-QUALITY CCP. "—" if not linked |
| CCP Block Active | icon | 🚫 | Red block icon if calibration overdue AND CCP linked — visible cross-module gate |
| Linked mWO | text link | `MWO-2026-00099` | mWO created for calibration activity |

**CCP block indication:** When `CCP Block Active` is true, the row has a full red left border and an `.alert-red` inline row: "Production use of this instrument is blocked in Quality until re-calibrated." This state is also propagated to the 09-QUALITY CCP monitoring screen (out of scope for this document).

**States:** Loading, empty, no-results, error. Overdue count in sidebar nav badge.

---

### MAINT-012 — Calibration Record Detail

**Route:** `/maintenance/calibration/:id`  
**Purpose:** Full calibration record for a single instrument. Displays all historical calibration events with as-found/as-left readings, certificates, and BRCGS-required retention information.

**Layout regions:**
- **Header card:** Instrument code, name, type badge, standard, linked asset (link), calibration interval, active status, CCP link (if applicable with block status). Action buttons: "Record Calibration" (`.btn-primary`), "Edit Instrument" (`.btn-secondary`, manager only).
- **Latest Result banner:** Large prominent card showing the most recent calibration result. PASS = green background, FAIL = red background, OUT_OF_SPEC = amber background. Shows: Result badge, Calibrated At, Calibrated By, Next Due, Days until due (or "X days overdue" in red).
- **Test Points table (latest calibration):** Columns: Reference Value, Measured Value, Tolerance (%), In Spec (✓ or ✗).
- **Tab bar: History | Certificate**

**Tab — History:**
Reverse-chronological list of all `calibration_records` for this instrument. Each record card: date, calibrated by (technician name), standard applied, result badge, test points summary (pass/fail count), next due set, retention_until date (small muted text), link to mWO. Expandable to show full test points.

**Tab — Certificate:**
If `certificate_file_url` exists: PDF preview panel (embedded iframe) or "Open Certificate PDF" button. File metadata: upload date, SHA-256 hash (shown truncated with copy button, for 21 CFR Part 11 compliance). "Upload New Certificate" button (allowed on latest record only). Retention label: "Retained until: [retention_until date] (BRCGS 7-year requirement)."

**Record Calibration modal (triggered from "Record Calibration" button):** See §4 Modals.

---

### MAINT-013 — Spares List

**Route:** `/maintenance/spares`  
**Purpose:** Spare parts catalog with stock levels, reorder status, and consumption history.

**Note on architecture:** Spare parts live in the Maintenance module as a separate catalog (`spare_parts` + `spare_parts_stock`) distinct from 03-TECHNICAL product items. Stock quantities reference 05-WAREHOUSE `warehouses` for location, but LPs (license plates) are not used for spare parts — only raw qty_on_hand tracking. This distinction must be visible in the UI: no LP picker on spare parts, no FEFO logic.

**Layout regions:**
- **Top bar:** Page title "Spare Parts", breadcrumb. Search box (placeholder "Search by part code or description"). "+ Add Part" button (manager only). "Reorder Report" button (`.btn-secondary`) — shows parts below reorder point.
- **Filter bar:** Category filter, Supplier filter, Critical Parts toggle, Below Reorder Point toggle, Warehouse / Location filter.
- **Summary strip:** "Total Parts" count, "Below Reorder Point" count (amber/red with count), "Critical Parts" count.

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| Part Code | monospace link | `SP-LUB-0042` | Click → Spare Part Detail |
| Description | text | "Gearbox Lubricant 5L" | |
| Category | text | "Lubricants" | |
| Unit of Measure | text | "ea" / "L" / "kg" | |
| On Hand | quantity | "12.0 ea" | Red if ≤ reorder_point; green if > reorder_point |
| Min (Reorder Point) | quantity | "5.0 ea" | |
| Max | quantity | "50.0 ea" | |
| Last Used | date | "15 Apr 2026" | "Never" if unused |
| Avg Lead Time | text | "3 days" | |
| Unit Cost | currency | "€12.50" | |
| Critical Part | icon | ⚡ | Yellow lightning bolt if `critical_part=true` |
| Actions | buttons | "Consume" / "Adjust" / "Reorder" | |

**"Below reorder point" rows:** Row background `#fef2f2` (red-50), On Hand cell text is red bold, "Reorder" action button shown.

**States:** Loading, empty (see §6), critical-alert count in sidebar badge when below reorder.

---

### MAINT-014 — Spare Part Detail

**Route:** `/maintenance/spares/:id`  
**Purpose:** Full lifecycle view of a single spare part — master data, stock by warehouse/location, and full transaction history.

**Layout:** Two-column page. Left column (60%): stock info + transactions. Right column (40%): master data + linked mWOs.

**Left — Stock & Transactions:**
- Stock cards per warehouse location: one card per row in `spare_parts_stock`. Shows location_code, qty_on_hand (with color coding), reorder_point, last_counted_at. "Adjust Stock" button per location.
- Consumption History table: all `spare_parts_transactions` for this part. Columns: Date, Type badge (Receipt/Consume/Adjust/Return), Qty (+ or −), Linked mWO (link), Performed By, Notes.

**Right — Master Data:**
- Fields: Part Code, Name, Category, Supplier (link to supplier master if available), Unit of Measure, Unit Cost, Shelf Life Days, Critical Part badge, L3 extension fields if configured.
- "Edit Part" button (manager only).
- "Linked Assets" mini-list: Assets whose Spares BOM includes this part.

---

### MAINT-015 — Technicians List

**Route:** `/maintenance/technicians`  
**Purpose:** Manage maintenance technician profiles, skills, certifications, and current availability.

**Layout regions:**
- **Top bar:** Page title "Technicians", breadcrumb. "+ Add Technician" button (manager/admin only).
- **Filter bar:** Skill level (All / Basic / Advanced / Specialist), On-Shift toggle, Certification expiry filter (All / Expiring Within 30d / Expired).

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| Technician | avatar + name | [photo] M. Nowak | |
| Skill Level | badge | Basic / Advanced / Specialist | Blue/Amber/Green |
| Certifications | text | "IEC 60079, LOTO Cert. (+2 more)" | Truncated; click to expand |
| Cert. Expiry | date | "31 Dec 2026" | Red if expired, amber if within 30d |
| On Shift Now | badge | "On Shift" (green) / "Off Shift" (gray) | |
| Assigned mWOs | integer link | "3" | Click → filtered mWO list for this technician |
| Hourly Rate | currency | "€28.00/h" | Visible to manager/admin only |
| Actions | buttons | Edit / View Schedule | |

**Skills Matrix panel (alternate tab):** Tab toggle — "List" / "Skills Matrix". Matrix view: rows = technicians, columns = skill areas (sourced from `technician_skills` ref table in 02-SETTINGS). Each cell shows: ✓ (has skill), ⚡ (specialist), or — (not applicable). Download as PDF button for audit purposes.

**States:** Loading, empty, permission-denied (technician cannot see hourly rates or other technicians' personal data beyond name and skill level).

---

### MAINT-016 — Technician Detail

**Route:** `/maintenance/technicians/:id`  
**Purpose:** Individual technician profile, certifications, and assignment history.

**Layout:** Header card (avatar, name, email, skill level badge, on-shift status). Below: two tabs — Profile | Assignment History.

**Profile tab:** Certifications list (name, issuer, issue date, expiry date, expiry badge). "Edit Certifications" button (manager). Skills checklist from ref table. Hourly rate (manager/admin only). GDPR note: "This profile contains personal data retained per GDPR and 7-year regulatory requirements."

**Assignment History tab:** Table of completed mWOs assigned to this technician. Columns: mWO#, Asset, Type, Dates, Duration, Status. Filterable by date range.

---

### MAINT-017 — LOTO Procedures List

**Route:** `/maintenance/loto`  
**Purpose:** Safety-critical screen. Shows all LOTO procedures — both active (currently applied) and historical. The LOTO module enforces the lockout/tagout pre-condition gate for mWOs requiring it.

**Layout regions:**
- **Top bar:** Page title "Lockout / Tagout (LOTO)", breadcrumb. "Active LOTO" toggle (filters to currently applied only, default ON). "+ Apply LOTO" button (manager, technician, safety officer).
- **Active LOTO alert strip:** If any LOTO is active, show a yellow warning bar: "⚠ [N] LOTO procedure(s) currently active. Ensure work is complete before clearing."
- **Filter bar:** Asset filter, Applied By filter, Status (Active / Cleared), Date range.

**Table columns:**

| Column | Type | Example | Notes |
|---|---|---|---|
| Procedure # | monospace link | `LOTO-2026-0089` | Click → inline expanded detail |
| Asset | icon + text | 🔒 Line 2 Mixer | Lock icon always shown |
| Linked mWO | link | `MWO-2026-00123` | |
| Energy Sources | integer | "3 sources isolated" | Tooltip shows list |
| Lock Count | integer | "4" | Total tags/locks applied |
| Status | badge | LOTO Active (yellow-striped) / Cleared (gray) | |
| Applied By | name | "M. Nowak" | |
| Applied At | datetime | "20 Apr 2026 09:15" | |
| Expected Clear | datetime | "20 Apr 2026 14:00" | Red if past expected time without clearing |
| Verified By | name | "A. Kowalski" (safety officer) | |
| Cleared By | name | "M. Nowak" / "—" | |
| Actions | buttons | "Clear LOTO" / "View" | "Clear LOTO" only on active procedures |

**States:**
- **Loading:** Skeleton.
- **Empty (no active LOTO):** Green success state: "✓ No active lockout procedures. All equipment is available." (Only shown on Active filter view.)
- **Permission-denied:** Read-only; no apply/clear buttons.

---

### MAINT-018 — LOTO Apply Modal

**Triggered from:** "+ Apply LOTO" on LOTO list; "Go to LOTO Checklist" from mWO detail LOTO tab; auto-prompted when mWO state transition to `in_progress` is attempted on LOTO-required equipment without verified LOTO.

**Modal title:** "Apply Lockout / Tagout — [Asset Name]"  
**Width:** 560px.

**Section 1 — Context:**
Read-only: Asset Name, mWO# (auto-linked if triggered from mWO), Technician performing work.

**Section 2 — Energy Source Isolation (sequential checklist):**
A numbered list of steps. Each step is a row:
- Step number circle (blue filled)
- Energy source description (e.g., "Main electrical supply breaker")
- Isolation method (e.g., "Circuit breaker OFF + locked")
- "Verified by" — selector from technicians on site (or current user self-verify for single-person)
- Checkbox "Isolated and verified ✓" — checking logs `verified_by` and timestamp

For **critical assets** (criticality = Critical), a second-person verification is required: after the first user checks a step, a "Confirm as second verifier" button appears and must be clicked by a different logged-in user. Note: "Critical assets require two-person LOTO verification per safety protocol."

**Section 3 — Tags Applied:**
Free-form entry for physical tags/locks placed. "+  Add Tag/Lock" button opens a mini-row: Location description, Tag/Lock ID, Applied By (name input). Multiple tags supported.

**Section 4 — Zero Energy Verification:**
Final step before completing LOTO. Field: "Zero Energy Verified By" — user picker (requires `maintenance_technician` or `maintenance_manager` role). Checkbox: "I confirm that all energy sources are isolated, zero energy state is verified, and the equipment is safe to work on."

**Footer:** "Complete LOTO — Apply" (`.btn-primary`, disabled until all steps checked and zero energy verified) | "Cancel" (`.btn-secondary`)

**On complete:** LOTO record created, `mwo_loto_checklists.verified_at` set. Asset status badge changes to "LOTO Active" (yellow-striped). mWO can now transition to `in_progress`. Toast: "LOTO applied for [Asset]. Work may now begin safely."

**States:**
- **Steps partially complete:** "Complete LOTO" button remains disabled. Progress indicator shows "N of M steps verified."
- **Critical asset — awaiting second verifier:** Step row shows waiting spinner and "Awaiting confirmation from a second verifier."
- **Error:** `.alert-red` "Failed to record LOTO. Try again."

---

### MAINT-019 — LOTO Clear Modal (Two-person workflow)

**Triggered from:** "Clear LOTO" button on LOTO list row.

**Modal title:** "Clear Lockout / Tagout — [Procedure # / Asset]"  
**Width:** 560px.

**Section 1 — Summary:**
Read-only overview of the procedure — applied at timestamp, by whom, energy sources count, tags count, linked mWO (with status).

**Section 2 — Pre-clear checklist:**
Ordered verification steps before physical locks are removed:
1. "Confirm mWO is completed or paused" — reads mWO status from linked record; shows warning if mWO still `in_progress`.
2. "All workers are clear of the equipment" — checkbox required.
3. "All tools and materials removed from the work area" — checkbox required.
4. "Tags and locks removed" — checkbox required. Field: list of tags applied (from apply step) with a "Removed ✓" checkbox per tag.
5. "Equipment is safe to re-energise" — checkbox required.

**Section 3 — Release confirmation:**
Two-person sign-off required:
- **First signer (Technician):** Signed-in user. "Sign as Technician — I confirm all pre-clear steps are complete." Button requires PIN re-entry or password confirmation. Shows signer name + timestamp after completion.
- **Second signer (Safety Officer or Manager):** Separate user must log in or confirm via PIN. Shows a "Request Second Signature" button that sends a notification to available safety officers/managers. They can counter-sign from their own session. For critical assets: photo evidence upload field is shown — "Upload photo of cleared work area (optional but recommended)."

V-MNT-09: `released_by != verified_by` when possible. If only one person is available, system shows `.alert-amber` "Best practice requires two signers for LOTO release. If a second signer is unavailable, record your justification." Shows textarea for justification before allowing single-signer override (manager role only).

**Footer:** "Confirm LOTO Clear" (`.btn-primary`, enabled only when all checkboxes ticked and both signatures present or justified override) | "Cancel" (`.btn-secondary`)

**On complete:** LOTO record `released_at` and `released_by` set. Asset status badge reverts to operational. Toast: "LOTO cleared — [Asset] is back in service."

---

### MAINT-020 — Maintenance Analytics

**Route:** `/maintenance/analytics`  
**Purpose:** Management-level analytics hub for MTBF/MTTR trends, PM compliance, asset availability, cost, and downtime Pareto. Data sourced from `maintenance_kpis` materialized view and 15-OEE `oee_shift_metrics`.

**Layout regions:**
- **Top bar:** Page title "Maintenance Analytics", breadcrumb. Date range picker (default: last 30 days, options: 7d / 30d / 90d / 12m / custom). Asset filter. Line filter. Export button (`.btn-secondary`).
- **Tab bar:** Overview | MTBF/MTTR | PM Compliance | Availability | Cost | Pareto

**Tab — Overview:**
Six KPI cards in a 3×2 grid:
1. MTBF (avg across all assets, selected period) — trend arrow vs previous period
2. MTTR (avg) — trend arrow
3. PM Compliance % — trend arrow; `.badge-red` if <85%
4. Planned vs Unplanned ratio — e.g., "73% planned" — `.badge-green` if >70%
5. Total mWO Cost (YTD) — currency
6. Spare Parts Consumption Cost (YTD) — currency

Below KPIs: "Top 5 Problem Assets" card (bar chart style list: asset name, downtime hours bar, mWO count). "Recent Completed mWOs" card (last 5, as a mini-table).

**Tab — MTBF/MTTR:**
Line chart: MTBF (hours) and MTTR (minutes) trends over selected period. Per-asset breakdown table below: Asset Name, Equipment Type, MTBF (hrs), MTTR (min), Failure Count, Improvement vs Target. Data note: "MTBF and MTTR are sourced from 15-OEE `oee_shift_metrics`. Maintenance does not compute these independently."

**Tab — PM Compliance:**
Bar chart: % of PMs completed on time per month. Table: PM Schedule, Asset, Scheduled, Completed On Time, Late, Skipped, Compliance %. Skip reasons shown on hover for skipped rows.

**Tab — Availability:**
Per-asset availability % table (from 15-OEE) with trend sparklines. Line availability heatmap (7-day rolling) — green = ≥95%, amber = 90–95%, red = <90%. Note: "Availability data is read-only from the OEE module."

**Tab — Cost:**
Stacked bar chart: labor cost + parts cost per month. Table: mWO Type vs Cost. Technician utilization table: Technician, Hours Worked, Avg per mWO, Cost YTD.

**Tab — Pareto:**
Pareto chart of downtime causes (cross-module with 08-PRODUCTION). X-axis: cause categories (sorted by duration descending). Left Y-axis: downtime hours. Right Y-axis: cumulative %. "Causes from 08-PRODUCTION `downtime_events` linked to mWOs in Maintenance." Linked table below: Cause, Event Count, Total Duration, Avg MTTR, Linked mWOs.

**States:** Loading state per tab with spinner. Error per tab with retry. Data refresh note: "KPI data refreshed daily at 02:30. Last updated: [timestamp]."

---

### MAINT-021 — Maintenance Settings

**Route:** `/maintenance/settings`  
**Purpose:** Module-level configuration. Restricted to `maintenance_manager` and `admin`. Organized into sections matching the PRD L1/L2/L3/L4 config hierarchy.

**Layout:** Two-column page. Left: settings navigation list (vertical tabs). Right: active settings section form.

**Settings sections:**

**General Defaults:**
- PM Lead Time Default (days): number input, default 7
- Calibration Warning Window (days): number input, default 30
- Calibration Urgent Window (days): number input, default 7
- MTBF Target (hours): number input, optional
- Availability Breach Threshold (%): number input, default 80
- Requires LOTO Default for new assets: toggle, default Off

**Criticality Taxonomy:**
Table of criticality levels (Critical / High / Medium / Low) with editable descriptions. Reorder by drag-and-drop. "Add Level" disabled (taxonomy is fixed at 4 levels for consistency).

**Auto-WR from Downtime:**
- Enable Auto-WR Creation: toggle. When on, 08-PRODUCTION downtime events auto-create mWOs.
- Downtime Duration Threshold (minutes): number input — only downtime events exceeding this duration auto-create a WR. Default 15 minutes. Note: "Shorter downtime events are recorded in Production but do not auto-create maintenance tasks."
- Anti-Duplicate Window (hours): number input, default 1. Prevents duplicate mWOs for same asset within this window.

**Calibration Settings:**
- ATP RLU Threshold for Sanitation: number input, default 30. Note: "BRCGS/FORZA baseline. Override per food product type via Ref table in Settings."
- Allergen Dual Sign-off Required: toggle, default On (non-editable for BRCGS compliance).

**LOTO Policy:**
- Two-Person LOTO Required for Critical Assets: toggle, default On.
- LOTO Timeout Warning (hours): number input, default 8. LOTO procedures active beyond this duration trigger an alert.
- Photo Evidence for LOTO Clear: select (Required / Recommended / Optional), default Recommended for critical assets.

**OEE Trigger (P2 feature flag):**
- Enable OEE Auto-PM Trigger (`maintenance_triggers_enabled`): toggle, default Off. When On, `oee_maintenance_trigger_v1` rule becomes active. Info banner: "This feature is Phase 2. Requires 15-OEE module to be active and `oee_shift_metrics` to be populated."

**Technician Skill Catalog:**
Link to 02-SETTINGS › Reference Tables › technician_skills. Read-only view in Maintenance. "Edit in Settings →" link.

**Notification Preferences:**
Per-event notification toggles (email via Resend):
- PM overdue → daily digest (toggle)
- Calibration overdue → immediate (toggle)
- WR SLA breach → immediate (toggle)
- mWO scheduled today → morning digest (toggle)
- LOTO timeout → immediate (toggle)
- Spare below min → daily digest (toggle)
- MTBF declining trend → weekly digest (toggle)

**Footer of each section:** "Save Changes" (`.btn-primary`) | "Reset to Defaults" (`.btn-secondary`, with confirmation modal).

---

## 4. Modals

### MODAL-01 — Asset Create / Edit

**Width:** 560px. **Title:** "Add Asset" / "Edit Asset — [code]"

**Fields:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Equipment Code | text | Yes | "EQ-2026-0043" | Unique per org; auto-suggested from sequence |
| Name | text | Yes | "Line 2 Conveyor" | Max 100 chars |
| Equipment Type | select | Yes | Mixer / Oven / Packer / Scale / Thermometer / pH Meter / CIP Unit / Other | |
| Production Line | searchable select | No | "Line 2" | From 02-SETTINGS production_lines |
| Location Path | text | No | "Site A › Line 2 › Station 1" | ltree format |
| Criticality | select | Yes | Critical / High / Medium / Low | |
| Requires LOTO | toggle | No | On / Off | Default from maintenance_settings |
| Requires Calibration | toggle | No | On / Off | |
| Calibration Interval (days) | number | Conditional | 90 | Required if Requires Calibration = On |
| L3 Extension Fields | dynamic | No | Manufacturer Serial, Warranty Expiry | Shown only if tenant has l3_ext_cols configured in 02-SETTINGS schema wizard |

**Footer:** "Save Asset" / "Cancel"

**On save:** Asset created/updated. If imported from 02-SETTINGS machines, read-only fields are locked with info: "This asset is linked to a machine in Settings. Edit base details there."

---

### MODAL-02 — WR Create (Shop-floor)

Already described in MAINT-005. Referenced here for completeness.

---

### MODAL-03 — WR Triage

Already described in MAINT-006. Referenced here for completeness.

---

### MODAL-04 — mWO Create

**Width:** 560px. **Title:** "Create Maintenance Work Order"

**Fields:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Asset | searchable select | Yes | "Line 1 Mixer" | |
| mWO Type | radio | Yes | Reactive / Preventive / Calibration / Sanitation / Inspection | |
| Priority | radio | Yes | Critical / High / Medium / Low | |
| Problem Description | textarea | Yes | "Bearing replacement required" | Min 10 chars |
| Assigned Technician | user picker | No | "M. Nowak" | |
| Scheduled Start | datetime picker | No | "21 Apr 2026 08:00" | |
| Estimated Duration (min) | number | No | 120 | |
| Link PM Schedule | searchable select | No | "PM-2026-00045" | Populates schedule_id |
| Link Downtime Event | searchable select | No | "DT-2026-0891 — Line 1" | Populates downtime_event_id; required if source=auto_downtime |
| Allergen Change (sanitation only) | toggle | Conditional | On / Off | Shown only when type=Sanitation |

**Footer:** "Create mWO" / "Cancel"

**On create:** mWO created at state `open` (if technician assigned) or `approved` (if not assigned). Toast with mWO# link.

---

### MODAL-05 — mWO Task Check-off (with Parts Consumption + Time)

**Width:** 560px. **Title:** "Complete Task — Step [N]: [description]"  
**Triggered from:** mWO Detail › Tasks tab, each step row "Complete" button (only when mWO is `in_progress`).

**Sections:**

**Step details (read-only):** Step number, description, expected value (if measure type).

**Actual value (if measure type):** Input field for actual reading + unit. Pass/Fail auto-computed vs expected value within tolerance. If Fail, show `.alert-red` "Value out of spec. Log a note and consider raising a corrective mWO."

**Photo upload (if photo type):** Drag-and-drop or file picker. Accept image/*. Preview shown after upload.

**Parts used in this step:** Optional section — "+  Add Part Used" button. Picker: Part, Qty. Confirms consumption from `spare_parts_stock` and creates `spare_parts_transactions` row. Warn if stock would drop below reorder point.

**Time logged for this step:** Optional fields: Duration (minutes), technician note.

**Sign-off (if signoff type):** "Sign off — I confirm this step is complete and correct." Checkbox + PIN entry (if safety-critical step marked in template).

**Footer:** "Mark Step Complete" / "Cancel"

---

### MODAL-06 — mWO Complete Sign-off (Multi-role)

**Width:** 560px. **Title:** "Complete mWO — MWO-YYYY-NNNNN"  
**Triggered from:** mWO Detail header "Complete mWO" button (state must be `in_progress`).

**Pre-conditions check (read-only summary at top):**
- All checklist steps complete: ✓ / ✗ (N of M complete)
- LOTO cleared (if applicable): ✓ / ✗
- Allergen sign-off complete (if applicable): ✓ / ✗

If any pre-condition is ✗, show `.alert-amber` "N pre-conditions are incomplete. Complete these before closing the mWO." "Complete Checklist" / "Clear LOTO" buttons as shortcuts. The complete button remains disabled.

**Completion fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Actual Duration (min) | number | Yes | V-MNT-04: must be > 0 |
| Completion Notes | textarea | Yes | V-MNT-04: cannot be blank |
| Asset Status After Work | select | Yes | Operational / Requires Follow-up / Out of Service |
| Follow-up mWO Needed | toggle | No | If Yes, shows "Describe follow-up" textarea; on save, auto-opens mWO Create modal |

**Sign-off strip:** Technician sign ✓ (auto-applied as completing user). Supervisor counter-sign field (`.btn-secondary` "Request Counter-sign" — sends notification). Safety Officer field (shown if LOTO or critical mWO).

**Footer:** "Confirm Complete" (`.btn-primary`, disabled until all pre-conditions ✓ and required fields filled) / "Save Draft" (saves notes without transitioning state) / "Cancel"

**On complete:** mWO moves to `completed`. Outbox emits `mwo.completed`. 15-OEE MTBF/MTTR recalculation triggered. If downtime_event_id linked, 08-PRODUCTION downtime event resolved. Toast: "mWO MWO-YYYY-NNNNN completed. Asset is back in service."

---

### MODAL-07 — PM Schedule Create / Edit

Already described in MAINT-010. Referenced here for completeness.

---

### MODAL-08 — PM Occurrence Skip with Reason

**Width:** 480px. **Title:** "Skip PM Occurrence — [PM#]"  
**Triggered from:** PM Schedule list or PM Schedule Detail — "Skip" action on a row.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Occurrence Due Date | read-only | — | The date being skipped |
| Skip Reason | select | Yes | Planned downtime / Asset offline / Resource unavailable / Other |
| Additional Notes | textarea | No | Free text |
| Next Due Date Override | date picker | No | If blank, auto-computed from standard interval |

**Footer:** "Confirm Skip" / "Cancel"

**On confirm:** Occurrence marked skipped. `maintenance_history` record logged with event_type = "pm_skipped". PM compliance metric affected. Manager receives a notification if PM skip count for this asset exceeds threshold.

---

### MODAL-09 — Calibration Reading Entry

**Width:** 560px. **Title:** "Record Calibration — [Instrument Code]"  
**Triggered from:** Calibration List "Record" button; Calibration Detail "Record Calibration" button; mWO Detail Tasks tab if step type = calibration.

**Fields:**

| Field | Type | Required | Example | Validation |
|---|---|---|---|---|
| Calibrated At | datetime picker | Yes | "20 Apr 2026 10:00" | Cannot be future |
| Calibrated By | user picker | Yes | "M. Nowak" | Must have technician or manager role |
| Standard Applied | select | Yes | ISO 9001 / NIST / Internal / Other | Defaults to instrument's standard |
| Test Points | repeating rows | Yes | Min 1 point required | See below |
| Result | auto-computed | — | PASS / FAIL / OUT_OF_SPEC | Computed from test points |
| Notes | textarea | No | "Adjusted reference to 0.1g offset" | |

**Test Points repeating row fields:**
- Reference Value (number + unit, e.g., "100.0 g")
- Measured Value (number input, e.g., "100.08 g")
- Tolerance % (number, e.g., "0.1")
- In Spec (auto-computed checkbox: ✓ if |measured - reference| / reference ≤ tolerance%, otherwise ✗)

"+  Add Test Point" button. Minimum 1 point.

**Result auto-computation:**
- All points in spec → PASS (green badge preview)
- 1+ point outside tolerance → OUT_OF_SPEC (amber badge preview)
- Result explicitly overridden to FAIL (checkbox "Mark as FAIL due to equipment condition") → FAIL (red badge preview)

**Next Due Date:** Auto-computed = calibrated_at + calibration_interval_days. Shown as read-only with edit link (manager may override).

**Certificate upload:** "Upload Certificate PDF" drag-and-drop. Optional in P1. Required by 21 CFR Part 11 P2 (shown as recommended prompt, not blocked).

**Footer:** "Save Calibration Record" / "Cancel"

**On save (FAIL result):** `.alert-red` warning shown in modal before save confirmation: "FAIL result will trigger a Quality hold candidate in 09-QUALITY. Linked CCP [CCP-003] will be flagged as blocked. Confirm?" "Confirm & Save" / "Go Back" buttons.

**On save (PASS):** Next due date updated. `calibration_expiry_alert_v1` rescheduled. If previous record was overdue, calibration overdue badge removed and CCP block lifted.

---

### MODAL-10 — Calibration Certificate Upload

**Width:** 480px. **Title:** "Upload Calibration Certificate"  
**Triggered from:** Calibration Detail › Certificate tab "Upload" button; also accessible from calibration record line in history.

**Fields:** File picker (PDF only, max 10MB), certificate date (date picker), issuing authority (text, optional). SHA-256 hash computed client-side and displayed after upload for verification. "I confirm this certificate is authentic and corresponds to the recorded calibration." checkbox.

**Footer:** "Upload Certificate" / "Cancel"

---

### MODAL-11 — Spare Part Reorder

**Width:** 480px. **Title:** "Reorder Spare Part — [Part Code]"  
**Triggered from:** Spares List "Reorder" button; reorder alert notification.

**Fields:** Part Code (read-only), Description (read-only), Current Qty on Hand (read-only, shown in red if below reorder point), Reorder Qty (number, pre-filled with `reorder_qty` from stock settings), Supplier (pre-filled if set), Estimated Lead Time (text, pre-filled from part master). Notes textarea.

**Action:** "Create Purchase Request" (`.btn-primary`) — creates a draft purchase request record (linked to 04-PLANNING PO flow in P2; in P1 creates an internal notification and a pending record). "Cancel" button.

**P2 note (info alert shown):** "In Phase 2, approved purchase requests will automatically push to your ERP purchasing module."

---

### MODAL-12 — Technician Skill Edit

**Width:** 480px. **Title:** "Edit Skills — [Technician Name]"  
**Triggered from:** Technicians List "Edit" button; Technician Detail "Edit" button.

**Fields:** Skill Level (radio: Basic / Advanced / Specialist). Certifications (repeating rows — Cert Name, Issuer, Issue Date, Expiry Date, Upload scan button). Note: "Certification expiry dates are tracked; alerts are sent 30 days before expiry."

**Footer:** "Save" / "Cancel"

---

### MODAL-13 — LOTO Apply

Already described in MAINT-018. Referenced here for completeness.

---

### MODAL-14 — LOTO Clear (Two-person)

Already described in MAINT-019. Referenced here for completeness.

---

### MODAL-15 — Delete Confirmation

**Width:** 400px. **Title:** "Delete [Entity Name]?"  
**Generic pattern:** Used for asset deactivation (not deletion — assets are soft-deleted), PM schedule delete, spare part delete.

**Body:** "This action cannot be undone. All records linked to this [entity] will be preserved for audit purposes, but the [entity] will be deactivated and removed from active lists. Type the [entity code] below to confirm."

**Fields:** Text input — must match the entity code/name exactly (case-insensitive).

**Footer:** "Delete" (`.btn-danger`, enabled only when code matches) / "Cancel"

---

### MODAL-16 — Criticality Override

**Width:** 440px. **Title:** "Override Criticality — [Asset Name]"  
**Triggered from:** Asset Detail header "Override Criticality" action (manager/admin).

**Fields:** New Criticality (select), Reason (textarea, required), Effective Date (date picker, default today).

**Footer:** "Apply Override" / "Cancel"

**Audit note:** All criticality overrides are logged in `maintenance_history`. Change is visible in Asset Detail header history tab.

---

### MODAL-17 — Downtime Linkage

**Width:** 560px. **Title:** "Link Downtime Event to mWO"  
**Triggered from:** mWO Detail › Downtime Link tab "Link Downtime Event" button.

**Body:** Searchable list of open downtime events from 08-PRODUCTION for the same asset. Table: Event ID, Line, Start Time, Duration, Cause Category. Select one row and click "Link". Shows a read-only preview of the event after selection.

**Validation:** V-MNT-22 — mWO with source=`auto_downtime` must have exactly one linked event. If source=`manual_request` and user links an event, source is updated to `auto_downtime` with a note.

**Footer:** "Link Selected Event" / "Cancel"

---

## 5. Flows

### Flow A — Reactive: Operator Reports Fault → Asset Back Online

1. **Fault detected:** Operator on shop floor notices equipment issue. Opens Scanner app (06-SCANNER-P1) → taps "Report Issue" → deep-link opens MAINT-005 WR Create Modal pre-filled with nearest asset (from QR scan or manual pick).
2. **WR submitted:** mWO created at state `requested`. Maintenance manager receives notification.
3. **Triage:** Manager opens MAINT-004 Work Request List → clicks "Triage" on the new WR → MAINT-006 Triage Modal. Manager sets priority = High, type = Reactive, assigns technician M. Nowak. Clicks "Approve & Create mWO". State changes to `approved` → `open` (because technician is assigned simultaneously).
4. **Technician notification:** M. Nowak receives email/push: "New mWO MWO-2026-00123 assigned — Line 1 Mixer, High Priority, Scheduled: 08:00."
5. **LOTO apply:** Technician opens MAINT-008 mWO Detail. Asset has `requires_loto=true`. LOTO warning banner shown. Technician clicks "Complete LOTO Checklist" → MODAL-13 LOTO Apply. Completes all energy source isolation steps, verification by second colleague (critical asset). LOTO applied. `mwo_loto_checklists.verified_at` set.
6. **Work begins:** "Start Work" button now enabled on mWO Detail. Technician clicks → state = `in_progress`. `started_at` recorded.
7. **Execute tasks:** Technician works through checklist in MAINT-008 › Tasks tab. Each step: check off, enter measurements, log time. Replaces bearing — clicks "Consume Part" → MODAL-05 — consumes 1× Bearing SP-BRG-0022 from stock. `spare_parts_transactions` record created. If stock drops below reorder point, amber alert shown — technician notes it; reorder handled by manager.
8. **LOTO clear:** Work complete. Technician goes to LOTO List → "Clear LOTO" → MODAL-14 LOTO Clear. Pre-clear checklist completed. Second signer (safety officer) counter-signs. LOTO cleared. Asset status returns to Operational.
9. **mWO completion:** Technician clicks "Complete mWO" on mWO Detail → MODAL-06. Enters actual duration (95 min), completion notes ("Bearing replaced — SKF 6205-2RS. Recommend monthly lubrication PM."), signs off. Manager receives notification for counter-sign.
10. **Downtime resolved:** Linked downtime event in 08-PRODUCTION automatically marked resolved. OEE downtime clock stops. MTBF/MTTR recalculation triggered via outbox event to 15-OEE.
11. **Toast:** "mWO MWO-2026-00123 completed. Line 1 Mixer is back in service." Dashboard KPIs update on next refresh.

---

### Flow B — Preventive: PM Schedule Auto-fires → mWO Generated

1. **Daily engine runs:** `pm_schedule_due_engine_v1` (pg_cron at 06:00) scans `maintenance_schedules`. Finds PM-2026-00045 (Line 2 Oven Monthly Inspection) with next_due_date = today.
2. **mWO auto-generated:** mWO created at state `open` with source = `pm_schedule`, schedule_id linked, checklist pre-populated from linked task template.
3. **Notification:** Maintenance manager receives "PM Due: Line 2 Oven Monthly Inspection — mWO MWO-2026-00156 created."
4. **Manager assigns:** Opens MAINT-007 mWO List → "Open" tab → finds new PM mWO → assigns technician (modal to update `assigned_to_user_id`).
5. **Technician executes:** Same as Flow A steps 5–9, but with pre-defined checklist steps from PM template.
6. **Next due recomputed:** On mWO completion, `maintenance_schedules.last_completed_at` updated. `next_due_date` = today + interval_value days.
7. **PM compliance metric updated:** `maintenance_kpis` MV refreshed at nightly run — completed_on_time count incremented.

---

### Flow C — Calibration: Overdue → CCP Block → Re-calibrate → Cleared

1. **Alert fires:** `calibration_expiry_alert_v1` detects thermometer CAL-TH-0012 has `next_due_date = yesterday`. Emits overdue alert. Email sent to maintenance manager and quality manager.
2. **CCP block activated:** Instrument is linked to CCP-003 in 09-QUALITY. 09-QUALITY module displays CCP as blocked (cross-module gate via outbox event). Production supervisor sees alert on 08-PRODUCTION dashboard: "CCP-003 calibration overdue — instrument blocked."
3. **Maintenance module:** MAINT-011 Calibration List shows CAL-TH-0012 with "Overdue" badge (red), CCP Block icon (🚫). Module sidebar badge shows count "1".
4. **mWO created:** Manager or technician clicks "Record Calibration" on MAINT-012 Calibration Detail → opens MODAL-09 Calibration Reading Entry. A calibration mWO may be created first if not already exists.
5. **Calibration performed:** Technician performs physical calibration on the thermometer. Returns to MODAL-09 → enters 3 test points, all in spec → Result auto-computes to PASS.
6. **Certificate uploaded:** MODAL-10 → PDF certificate uploaded. SHA-256 hash stored.
7. **Record saved:** `calibration_records` row created with result=PASS, next_due_date = today + 90 days, retention_until = today + 90 days + 7 years (GENERATED column).
8. **CCP block cleared:** Outbox event `calibration.recorded` with result=PASS consumed by 09-QUALITY. CCP-003 block lifted. 09-QUALITY dashboard updates. Calibration List shows PASS badge, no block icon.
9. **Toast:** "Calibration recorded for CAL-TH-0012. Next due: 18 Jul 2026. CCP-003 block cleared."

---

### Flow D — Spare Part Reorder: Min Hit → Purchase Request

1. **Reorder alert fires:** `spare_parts_reorder_alert_v1` detects `spare_parts_stock.qty_on_hand` for SP-LUB-0042 (Gearbox Lubricant) = 2, reorder_point = 5. Alert emitted.
2. **Notification:** Manager email: "Spare parts reorder needed: SP-LUB-0042 Gearbox Lubricant — 2 ea on hand, reorder point 5 ea."
3. **Spares List badge:** Sidebar shows "Spares" sub-item with amber count badge "1". Spares List row highlighted red.
4. **Manager action:** Clicks "Reorder" → MODAL-11 Spare Part Reorder. Qty 20 ea entered, supplier "Castrol PL" pre-filled. Clicks "Create Purchase Request."
5. **Purchase request:** Draft purchase request created in the system (linked to 04-PLANNING PO workflow in P2; in P1, creates an internal pending notification only). Email sent to procurement contact. Toast: "Purchase request created for SP-LUB-0042."

---

### Flow E — LOTO Critical (Two-person Apply + Photo Evidence on Clear)

1. Technician selects "Apply LOTO" for asset LINE2-CONVEYOR (Criticality = Critical, `requires_loto=true`).
2. MODAL-13 opens. Energy source list shows 5 sources. Technician verifies and checks each source. On each step: "Confirm as second verifier" button appears — safety officer A. Kowalski, logged in on adjacent tablet, taps the button to co-verify. Two-person verification logged per source.
3. Zero energy verification: M. Nowak fills `zero_energy_verified_by` = self. Safety officer (A. Kowalski) required to also confirm. "Confirm LOTO — Apply" button becomes enabled only after both users have confirmed.
4. LOTO applied. `verified_at` set. Asset badge = "LOTO Active" (yellow-striped). mWO can now transition to `in_progress`.
5. **On clear:** MODAL-14. Pre-clear checklist requires photo upload: "Upload photo of cleared work area." M. Nowak uploads photo. A. Kowalski (safety officer) provides second signature. `released_by` (A. Kowalski) ≠ `verified_by` (M. Nowak) — V-MNT-09 satisfied.
6. LOTO cleared. Asset operational.

---

## 6. Empty / Zero / Onboarding States

### First-time empty states

**Asset List — first use:**
Center-aligned illustration (gear icon with a plus sign). Heading: "No assets registered yet." Body: "Start by importing your machines and production lines from Settings, or add assets manually." Two buttons: "Import from Settings Machines" (`.btn-primary`) and "Add Asset Manually" (`.btn-secondary`). Sub-note: "Imported machines from Settings → Infrastructure will appear here automatically."

**PM Schedules — first use:**
Illustration (calendar with a wrench). Heading: "No PM schedules set up." Body: "Create preventive maintenance schedules to keep your assets running reliably." Button: "Create First PM Schedule" (`.btn-primary`). Link: "Browse PM template library →" (opens a catalog of common PM templates for food manufacturing — lubrication, belt inspection, motor checks, CIP cycles).

**mWO List — first use:**
Illustration (clipboard with a checkmark). Heading: "No maintenance work orders yet." Body: "Work orders are created automatically from PM schedules, downtime events, or manually by your team." Button: "Create First mWO" (`.btn-primary`). Link: "How does the mWO lifecycle work? →" (opens in-app guide pop-up).

**Calibration List — first use:**
Illustration (scale icon). Heading: "No calibration instruments registered." Body: "Add your scales, thermometers, and pH meters to ensure BRCGS compliance." Button: "Add First Instrument" (`.btn-primary`). Note: "Calibration records are required for BRCGS Issue 10 audits."

**Spares List — first use:**
Illustration (parts box). Heading: "No spare parts catalogued." Body: "Add your critical spare parts to track inventory and prevent stockouts during breakdowns." Button: "Add First Part" (`.btn-primary`).

**Technicians List — first use:**
Illustration (hard hat person). Heading: "No technicians added yet." Body: "Add your maintenance team members with their skills and certifications." Button: "Add Technician" (`.btn-primary`).

### Onboarding checklist (Maintenance Manager)

On first login when no assets, no PM schedules, and no technicians exist, show a dismissible onboarding card on the Dashboard:

**Title:** "Set up Maintenance in 5 steps"

Checklist:
1. ☐ Import or create your first asset — "Go to Assets"
2. ☐ Add at least one technician — "Go to Technicians"
3. ☐ Create a PM schedule for your critical asset — "Go to PM Schedules"
4. ☐ Register your calibration instruments — "Go to Calibration"
5. ☐ Configure maintenance settings (LOTO, thresholds, notifications) — "Go to Settings"

Progress bar shows N/5 complete. Card is dismissed when all 5 are complete, or by explicit "Dismiss" link (stored in localStorage).

---

## 7. Notifications, Toasts, and Alerts

### In-app toasts (3-second auto-dismiss, bottom-right)

| Event | Toast text | Style |
|---|---|---|
| mWO created | "mWO MWO-YYYY-NNNNN created. Asset: [name]." | info (blue) |
| mWO completed | "mWO MWO-YYYY-NNNNN completed. [Asset] back in service." | success (green) |
| mWO cancelled | "mWO MWO-YYYY-NNNNN cancelled." | neutral (gray) |
| WR submitted | "Work request WR-YYYY-NNNNN submitted." | info |
| Calibration saved (PASS) | "Calibration PASS recorded. Next due: [date]." | success |
| Calibration saved (FAIL) | "Calibration FAIL recorded. Quality hold triggered." | error (red, persistent) |
| LOTO applied | "LOTO applied — [Asset] is locked out. Work may begin." | warning (amber, persistent until dismissed) |
| LOTO cleared | "LOTO cleared — [Asset] is back in service." | success |
| Spare part consumed | "[Part Code] consumed: [qty] used. [qty remaining] remaining." | info |
| Spare below reorder | "⚠ [Part Code] is below reorder point ([qty] on hand)." | warning (amber, persistent) |
| PM schedule saved | "PM Schedule [PM#] saved. Next due: [date]." | success |

### Email / push notifications (via Resend, configurable in Settings)

| Trigger | Frequency | Recipients |
|---|---|---|
| PM overdue | Daily digest at 07:00 | Maintenance Manager |
| PM due within 7 days | Daily digest at 07:00 | Maintenance Manager + Assigned Technician |
| Calibration overdue | Immediate on detection | Maintenance Manager + Quality Manager |
| Calibration due within 7 days | Daily digest | Maintenance Manager |
| WR SLA breach (critical mWO not started within 2h) | Immediate | Maintenance Manager |
| mWOs scheduled today | Morning digest at 06:30 | Assigned Technicians |
| LOTO active beyond timeout threshold | Immediate | Maintenance Manager + Safety Officer |
| Spare part below reorder min | Daily digest | Maintenance Manager |
| MTBF declining trend (>10% drop week-over-week) | Weekly digest | Maintenance Manager |
| PM skipped | Immediate | Maintenance Manager |
| mWO assigned to me | Immediate | Assigned Technician |
| mWO completed requiring counter-sign | Immediate | Maintenance Manager |

### Cross-module alert banners

- **09-QUALITY CCP block:** When calibration is overdue on a CCP-linked instrument, a banner appears on MAINT-012 Calibration Detail and MAINT-011 Calibration List: "CCP [code] in Quality is blocked. Re-calibrate this instrument to unblock production."
- **08-PRODUCTION downtime pending mWO:** When a downtime event has been open >15 minutes (configurable threshold) without a linked mWO, a banner appears on MAINT-001 Dashboard alerts panel: "Unlinked downtime event on Line [N] — [duration] elapsed. Create or link an mWO."
- **Allergen changeover gate:** When a sanitation mWO with `allergen_change_flag=true` is `in_progress` without dual sign-off, the mWO detail shows a blocking `.alert-red` banner preventing completion: "Allergen dual sign-off required. 08-PRODUCTION changeover gate is waiting."

---

## 8. Responsive Notes

**Desktop (≥1280px) — Primary for manager views:** All screens described above are designed for desktop-first. Sidebar 220px fixed. Main content area min-width 900px. KPI rows use 4–8 column grids. Table columns visible in full.

**Tablet 10" landscape (≥1024px) — Technician field view:** The technician's primary device when performing maintenance on the shop floor. The following adaptations apply:
- Sidebar collapses to icon-only mode (48px wide). Tap icon to expand overlay.
- KPI row wraps to 2 columns × N rows.
- mWO Detail Tasks tab checklist items have 48px minimum touch targets. Checkboxes are 24px.
- LOTO Apply / Clear modals expand to full-screen on tablet (override `.modal-box` to `width: 100%; border-radius: 0; max-height: 100vh`).
- Calibration test point entry: inputs are 48px height minimum with large number keyboard trigger.
- Photo capture buttons are prominent (`.btn-primary`, full width).

**Mobile (via 06-SCANNER-P1 — reference only):** WR creation, asset QR scan, and basic mWO task check-off are available via the Scanner PWA (SCN-090 in P2). These flows live in 06-SCANNER-P1-UX.md. The Maintenance module desktop/tablet UI provides deep-link receiving pages (WR detail, mWO task check-off modal) that are mobile-responsive when accessed via scanner deep-link.

**Print / PDF (Analytics tab):** The Analytics screen includes a "Print Report" button that renders a print-optimised layout (no sidebar, white background, condensed table rows, page breaks before each chart section).

---

## 9. Open Questions for Designer

1. **Sidebar icon disambiguation:** The Technical module (02-SETTINGS) uses 🔧. This spec proposes 🔩 (bolt) for Maintenance to avoid confusion. Confirm with designer whether to use an SVG wrench-and-screwdriver icon instead of emoji, consistent with other module icons in the sitemap.

2. **Sensor / IoT panel UX (P2):** The Asset Detail Sensors tab is currently a placeholder. When P2 is activated, the designer will need to define: time-series chart component (temperature trend, vibration FFT), threshold alarm lines, sensor connectivity status badge, and historical anomaly markers. Leave a P2 comment hook in the HTML prototype.

3. **LOTO photo evidence:** This spec marks photo upload on LOTO clear as "optional but recommended" for critical assets, with a configurable setting (Required / Recommended / Optional). Confirm whether food manufacturing safety standards at Forza require it as mandatory. If mandatory, change the MODAL-14 field to required and add client-side block.

4. **Offline mode for technician tablet:** If the technician moves into a network-dead zone on the factory floor, should task check-offs be queued locally and synced on reconnect? This requires a Service Worker / IndexedDB implementation. If needed, the mWO detail screen should show a connectivity indicator (green dot = online, amber = limited, red = offline — queuing mode). Open question for architecture team.

5. **Two-person LOTO remote confirmation:** When a critical asset requires a second verifier but the verifier is on a different part of the factory, is a remote confirmation (via their own device session) acceptable, or must both users be physically co-located and use the same device? Current spec assumes remote confirmation (separate sessions) is acceptable for P1.

6. **mWO number format:** Current format is `MWO-YYYY-NNNNN` (5-digit sequential). Confirm with operations team that this format aligns with their paper-based legacy numbering for migration purposes.

7. **Calibration certificate storage provider:** PRD OQ-MNT-06 leaves this open (S3 vs Supabase Storage vs external DMS). The designer should confirm with the architecture team before implementing the file upload component. Current spec assumes Supabase Storage (file URL stored in `certificate_file_url`).

8. **Skills Matrix export format:** Should the PDF export of the Skills Matrix include certification document scans (for audit purposes), or only the matrix table? If scans are required, a batch PDF generation feature is needed.

---

*End of 13-MAINTENANCE-UX.md — Version 1.0 — 2026-04-20*
