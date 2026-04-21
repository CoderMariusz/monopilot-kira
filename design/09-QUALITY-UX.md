# 09-QUALITY — UX Specification (for prototype generation)

**Document version:** 1.0  
**Date:** 2026-04-20  
**Source PRD:** 09-QUALITY-PRD v3.0  
**Status:** Ready for prototyping  
**Designer note:** This document is self-contained. Build all HTML prototype screens from this file without consulting any other source. Every screen, modal, state, column, field, button, and microcopy string is specified below.

---

## 0. Module overview

Module 09-QUALITY is the central quality and food-safety guardian layer in Monopilot MES. It enforces regulatory compliance across all production and warehouse operations through four functional pillars:

**Hold / Release lifecycle** — every License Plate (LP) carries a `qa_status` field owned by 05-WAREHOUSE but written exclusively by 09-QUALITY. Only statuses `PASSED`, `RELEASED`, and `COND_APPROVED` permit shipment or consumption. Holds block all downstream operations via the `qa_status_state_machine_v1` DSL rule.

**Inspection governance** — three inspection types are managed: incoming (triggered by GRN receipt from 05-WAREHOUSE), in-process (triggered by Work Order milestones from 08-PRODUCTION, Phase 2), and final pre-release (Phase 2). Each inspection draws from a versioned product specification and a sampling plan, records per-parameter test results, and auto-computes a pass/fail/hold outcome.

**HACCP / CCP monitoring** — HACCP plans define Critical Control Points with critical limits. Monitoring records are entered manually (Phase 1) or via scanner. The `ccp_deviation_escalation_v1` DSL rule auto-creates an NCR draft and optionally auto-holds the Work Order when a reading falls outside limits.

**Audit evidence aggregator** — all signed records are immutable (21 CFR Part 11, SHA-256 hash + PIN re-verification). The `quality_audit_log` table captures every INSERT / UPDATE / DELETE / SIGN / RELEASE / APPROVE / CLOSE event with full JSONB old/new snapshots, user context, IP address, and a 7-year `retention_until` generated column.

**Primary personas:** QA Inspector (`qa_inspector`) — executes inspections and enters test results; Quality Lead (`quality_lead`) — approves specs, releases holds, closes NCRs, signs allergen changeover gates; Hygiene Lead (`hygiene_lead`) — CCP monitoring and deviation response; Shift Lead (`shift_lead`) — first signer on allergen changeover gates, creates holds on production line. Secondary: Quality Director (dashboard/oversight), Auditor read-only (`auditor_readonly`), Admin.

**Key integrations consumed by 09-QUALITY:** 03-TECHNICAL (product items, allergen cascade, shelf-life); 05-WAREHOUSE (LP lifecycle, `qa_status` column, GRN events); 08-PRODUCTION (allergen changeover gate `allergen_changeover_validations`, WO state machine); 06-SCANNER (SCN-070..073 shop-floor QA flows, SCN-081 allergen sign); 02-SETTINGS (rule registry, reference tables `quality_hold_reasons` + `qa_failure_reasons`, RLS).

**Phase 1 scope (this UX spec):** Hold/Release (09-a), Specifications (09-b), Incoming Inspection (09-c), Basic NCR (09-d), Basic HACCP + CCP Rule (09-e). Phase 2 items (in-process/final inspection, full NCR/CAPA, CoA, HACCP advanced, supplier quality, dashboard analytics) are described where applicable with "P2" markers so the designer can build placeholder screens.

---

## 1. Design system (inherited)

All values below are inherited from the Monopilot design system established in `MONOPILOT-SITEMAP.html`. No overrides are made; 09-QUALITY adds only the QA badge palette and alert variants described in section 1.3.

### 1.1 Base tokens

| Token name | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active nav item border, links, KPI bottom border default |
| `--green` | `#22c55e` | Success states, pass badge, released badge |
| `--amber` | `#f59e0b` | Warning states, hold badge, pending badge |
| `--red` | `#ef4444` | Fail badge, critical badge, destructive actions, error alerts |
| `--info` | `#3b82f6` | Informational alerts, info-badge |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Left navigation dark background |
| `--card` | `#ffffff` | Card / panel background |
| `--text` | `#1e293b` | Body text |
| `--muted` | `#64748b` | Secondary labels, table headers, timestamps |
| `--border` | `#e2e8f0` | All borders (cards, table rows, inputs) |
| `--radius` | `6px` | All card/modal/badge corner radius |

### 1.2 Typography

Font family: Inter, system-ui, -apple-system, sans-serif. Base size 14px, line-height 1.4. Page titles 20px weight 700. Card titles 14px weight 600. Table headers 12px weight 600 color `--muted`. Labels 12px weight 500. Badges 11px weight 500. Timestamps 11px color `--muted`.

### 1.3 QA-specific badge palette

These six badge variants are used throughout 09-QUALITY screens and are additive to the base design system:

| Badge variant | Background | Text color | CSS class | Use for |
|---|---|---|---|---|
| Pass | `#dcfce7` | `#166534` | `badge-pass` | Inspection result PASS, LP status PASSED |
| Fail | `#fee2e2` | `#991b1b` | `badge-fail` | Inspection result FAIL, LP status FAILED |
| Hold | `#fef3c7` | `#92400e` | `badge-hold` | LP status HOLD, hold active |
| Released | `#d1fae5` | `#065f46` | `badge-released` | LP status RELEASED (filled green) |
| Pending | `#dbeafe` | `#1e40af` | `badge-pending` | Inspection status PENDING, spec DRAFT |
| Conditional | `#f3e8ff` | `#6b21a8` | `badge-cond` | LP status COND_APPROVED |
| Quarantined | `#fce7f3` | `#9d174d` | `badge-quarantined` | LP status QUARANTINED |
| Critical severity | `#fee2e2` | `#991b1b` | `badge-critical` | NCR critical, CCP deviation critical |
| Major severity | `#fef3c7` | `#92400e` | `badge-major` | NCR major |
| Minor severity | `#f0fdf4` | `#166534` | `badge-minor` | NCR minor |
| Immutable / signed | `#e0e7ff` | `#3730a3` | `badge-signed` | E-signature lock indicator |

### 1.4 Layout shell

The shell is identical to all other Monopilot modules: fixed left sidebar 220px wide with dark background `--sidebar`. Main content area has `margin-left: 220px` and padding 40px top, 20px sides. The sidebar contains the global module list; 09-QUALITY's entry is the ninth item, labelled "Quality" with a checkmark icon. When any sub-page within /quality is active, the Quality sidebar item is highlighted with `border-left: 3px solid --blue` and background `#1e3a5f`.

---

## 2. Information architecture

### 2.1 Sidebar entry

The Quality module appears in the sidebar group "QA & SHIPPING" between Scanner and Shipping. Label: "Quality". Icon: checkmark (✅). Sub-items expand below the Quality item when any /quality route is active. Sub-items are indented 28px and displayed at 12px font-size color `#94a3b8` when inactive, `--blue` when active with a left border.

Sub-items in sidebar order:
1. Dashboard → `/quality`
2. Holds → `/quality/holds`
3. Specifications → `/quality/specs`
4. Test Templates → `/quality/templates`
5. Inspections (expandable)
   - Incoming → `/quality/inspections/incoming`
   - In-Process → `/quality/inspections/in-process` (P2, greyed)
   - Final → `/quality/inspections/final` (P2, greyed)
6. Sampling Plans → `/quality/sampling`
7. NCR → `/quality/ncr`
8. Batch Release → `/quality/release` (P2, greyed)
9. CoA → `/quality/coa` (P2, greyed)
10. HACCP → `/quality/haccp`
11. CCP Monitoring → `/quality/ccp`
12. Allergen Gates → `/quality/allergen-gates`
13. Audit Trail → `/quality/audit`
14. Settings → `/quality/settings`

P2-greyed items display with opacity 0.5 and a small "P2" badge (background `#f1f5f9`, text `--muted`, font 10px) to the right of the label. Clicking a P2 item shows a modal: "This feature is coming in Phase 2. [Learn more]".

### 2.2 Route map

| Route | Screen ID | Page title |
|---|---|---|
| `/quality` | QA-001 | Quality Dashboard |
| `/quality/holds` | QA-002 | Holds |
| `/quality/holds/:id` | QA-002a | Hold Detail |
| `/quality/specs` | QA-003 | Specifications |
| `/quality/specs/new` | QA-003a | New Specification |
| `/quality/specs/:id` | QA-003b | Specification Detail |
| `/quality/specs/:id/edit` | QA-003c | Edit Specification |
| `/quality/templates` | QA-004 | Test Templates |
| `/quality/inspections/incoming` | QA-005 | Incoming Inspections |
| `/quality/inspections/incoming/:id` | QA-005a | Incoming Inspection Detail |
| `/quality/inspections/in-process` | QA-006 | In-Process Inspections (P2) |
| `/quality/inspections/final` | QA-007 | Final Inspections (P2) |
| `/quality/sampling` | QA-008 | Sampling Plans |
| `/quality/ncr` | QA-009 | Non-Conformance Reports |
| `/quality/ncr/:id` | QA-009a | NCR Detail |
| `/quality/release` | QA-010 | Batch Release (P2) |
| `/quality/coa` | QA-011 | Certificates of Analysis (P2) |
| `/quality/coa/templates` | QA-012 | CoA Templates (P2) |
| `/quality/haccp` | QA-013 | HACCP Plans |
| `/quality/haccp/:id` | QA-013a | HACCP Plan Detail |
| `/quality/ccp` | QA-014 | CCP Monitoring |
| `/quality/ccp/deviations` | QA-015 | CCP Deviations |
| `/quality/allergen-gates` | QA-016 | Allergen Changeover Gates |
| `/quality/audit` | QA-021 | Audit Trail |
| `/quality/settings` | QA-099 | Quality Settings |

### 2.3 Permissions matrix

| Action | quality_lead | qa_inspector | hygiene_lead | shift_lead | prod_manager | auditor_readonly | admin |
|---|---|---|---|---|---|---|---|
| View any QA screen | Yes | Yes | Yes | Yes (limited) | Yes (limited) | Yes (read-only) | Yes |
| Create Hold | Yes | Yes | Yes | Yes | Yes | No | No |
| Release Hold | Yes | No | No | No | Yes | No | No |
| Create/Edit Spec | Yes | No | No | No | No | No | No |
| Approve Spec (e-sign) | Yes | No | No | No | No | No | No |
| Start/Submit Inspection | Yes | Yes | No | No | No | No | No |
| Create NCR | Yes | Yes | Yes | Yes | Yes | No | No |
| Close NCR (critical, dual-sign) | Yes | No | No | No | Yes (co-sign) | No | No |
| CCP deviation override | Yes | No | Yes | No | No | No | No |
| Dual-sign allergen gate | Yes (second) | No | Yes (either) | Yes (first) | No | No | No |
| Export audit trail | Yes | No | No | No | No | Yes | Yes |
| Edit HACCP plans | Yes | No | Yes | No | No | No | No |
| View audit trail | Yes | No | No | No | Yes | Yes | Yes |
| Manage QA Settings | Yes | No | No | No | No | No | Yes |

**Permission-denied state:** Any screen or action the current role cannot access shows either a disabled button (greyed, cursor not-allowed, tooltip "Insufficient permissions") or a full-page permission-denied state with the message: "You don't have permission to view this page. Contact your Quality Lead to request access." with a "Go to Dashboard" button.

---

## 3. Screens

---

### QA-001 — Quality Dashboard

**Screen ID:** QA-001  
**Route:** `/quality`  
**Purpose:** Single-pane situational awareness for Quality Lead and Quality Director. Surfaces all open quality issues: holds, pending inspections, open NCRs by severity, CCP compliance, first-time pass rate trend, and allergen gate status. Auto-refreshes every 60 seconds.

**Layout description:**

The page opens with a breadcrumb reading "Quality > Dashboard" in the top-left at 12px `--muted`. To the right of the breadcrumb, on the same row, sits a compact toolbar containing: a date-range selector (default: Today, options: Last 7 days / Last 30 days / Custom), a site filter dropdown (relevant only in multi-site Phase 2; in Phase 1 it is visible but locked to the single site), a manual "Refresh" button (icon: circular arrow, secondary style), and an auto-refresh status indicator showing "Auto: 60s" in 11px `--muted`.

Below the toolbar, six KPI cards are arranged in a two-row grid of three cards each (responsive: on screens under 1280px wide they collapse to two columns, and below 768px to one column). Each KPI card uses the base `.kpi` component with the appropriate bottom border color.

**KPI card 1 — Active Holds:** Label "Active Holds", value = count of holds with `hold_status IN (open, investigating, escalated)`. Bottom border `--amber`. Below the value, a sub-line shows the breakdown: "{n} critical / {n} high / {n} medium / {n} low" each preceded by a colored dot. Clicking anywhere on the card navigates to `/quality/holds?status=active`.

**KPI card 2 — Inspection Backlog:** Label "Pending Inspections", value = count of inspections with `status IN (pending, assigned)`. Bottom border: if any are overdue, `--red`; if any are urgent (within 1 day), `--amber`; otherwise `--blue`. Sub-line: "{n} overdue • {n} urgent". Clicking navigates to `/quality/inspections/incoming?status=pending`.

**KPI card 3 — Open NCRs by Severity:** Label "Open NCRs", value = total count of NCRs with `status NOT IN (closed, cancelled)`. Bottom border: if critical > 0, `--red`; if major > 0, `--amber`; else `--green`. Sub-line: "{n} critical · {n} major · {n} minor" with inline severity badge colors. Clicking navigates to `/quality/ncr?status=open`.

**KPI card 4 — CCP Compliance Today:** Label "CCP Compliance (today)", value = percentage of monitoring records today with `within_limits = true`. Bottom border: if >= 99%, `--green`; if >= 95%, `--amber`; else `--red`. Sub-line: "{n} deviations in last 24h". Clicking navigates to `/quality/ccp?date=today`.

**KPI card 5 — First-Time Pass Rate:** Label "First-Time Pass Rate (30d)", value = percentage. Bottom border: if >= 95%, `--green`; if >= 90%, `--amber`; else `--red`. Sub-line: "Target: ≥95%" with green tick if meeting target or red cross if not. Clicking navigates to `/quality/inspections/incoming`.

**KPI card 6 — Allergen Gates:** Label "Allergen Gates (today)", value = count of gates processed today with sub-line "{n} pending dual-sign". Bottom border: if any pending, `--amber`; else `--green`. Clicking navigates to `/quality/allergen-gates`.

Below the KPI row, a full-width Critical Alerts panel is rendered with a light red background `#fef2f2` and a left border of 4px `--red`. The panel title is "Critical Quality Alerts" at 14px weight 600 with a red warning icon, and a "View all" link on the right. Inside the panel, up to 4 alert item cards are arranged in a two-column grid. Each alert card has a white background with 1px `--border`, 6px radius, 12px padding. Alert types: Critical CCP deviation (links to `/quality/ccp/deviations`), Overdue inspections (links to `/quality/inspections/incoming?urgency=overdue`), Aging holds over 3 days (links to `/quality/holds?aging=3d`), Failed inspections today (links to `/quality/inspections/incoming?result=fail`). If there are zero critical alerts, this entire panel is hidden and replaced by a green alert-green banner: "No critical quality alerts — all systems normal."

Below the Critical Alerts panel, a tabbed section contains three tabs: "Inspections", "NCRs", and "HACCP Monitoring". The active tab displays a table of the most recent 10 records in that category. Tabs are rendered using the `.tabs` / `.tab` component with the active tab having `color: --blue; border-bottom: 2px solid --blue`.

The Inspections tab table has columns: Inspection # (link), Type badge, Product name, Status badge, Inspector, Scheduled time. Rows link to the respective inspection detail page. Below the table: "View all inspections →" link.

The NCRs tab table has columns: NCR # (link), Title, Severity badge, Status badge, Detected by, Response due date (red if overdue). Below the table: "View all NCRs →" link.

The HACCP Monitoring tab shows the last 10 CCP readings: CCP code, Step name, Measured value with unit, Within limits badge (pass/fail), Recorded by, Recorded at. Below: "View all CCP records →" link.

At the very bottom of the page, a Quick Actions bar contains four buttons: "+ New Inspection" (primary), "+ Create NCR" (secondary), "+ Create Hold" (secondary), "Audit Trail" (secondary, navigates to `/quality/audit`).

**Primary actions:** Clicking any KPI card (navigation). "Refresh" button (re-fetches all data).  
**Secondary actions:** Quick action buttons. Tab switching. "View all" links.

**Empty state:** If this is a brand-new installation with zero records, all KPI cards show "—" as their value. The Critical Alerts panel is hidden. The tabbed section shows: "No records yet. Set up your first specification and inspection to start tracking quality." with a "Get started" button linking to `/quality/specs/new`.

**Loading state:** KPI cards display a grey shimmer animation (skeleton loader) in place of the value and sub-line. Table rows display 5 skeleton lines. The Critical Alerts panel shows a single skeleton line.

**Error state:** If the API call fails, the KPI cards display "Failed to load" with a "Retry" link. A red alert-red banner appears at the top: "Dashboard data could not be loaded. [Retry] [Contact support]".

**Auto-refresh:** A subtle pulse animation on the refresh icon plays for 1 second each time auto-refresh fires. If the last successful refresh is more than 2 minutes ago (e.g., network failure), the auto-refresh indicator turns amber and reads "Last updated {n}m ago" in amber text.

**Microcopy:** KPI sub-lines use sentence-case. The Critical Alerts panel title uses: "Critical Quality Alerts". Alert cards use present tense: "CCP-001: Pasteurisation Temp out of spec. Reading 68°C (limit: ≥72°C). WO-1256. [Investigate →]". Buttons use title-case.

---

### QA-002 — Holds List

**Screen ID:** QA-002  
**Route:** `/quality/holds`  
**Purpose:** Central registry of all QA holds. Allows quality staff to view, filter, and act on holds; provides aging visibility and quick release trigger for authorised roles.

**Layout description:**

Page title "Holds" with breadcrumb "Quality > Holds". Below the title, a row of four summary KPI cards (smaller, half-height compared to dashboard): "Open" (count, `--red` bottom border if >0), "Investigating" (count, `--amber`), "Avg hold age (days)" (numeric), "Released today" (count, `--green`). These are purely informational; clicking navigates to holds filtered by that status.

Below the KPI row, a filter bar spans the full width. Filters (left to right): Status multi-select dropdown (default: Active — shows open/investigating/escalated; options: All, Open, Investigating, Released, Quarantined, Escalated, Cancelled), Priority multi-select (All, Low, Medium, High, Critical), Hold reason category dropdown (populated from `quality_hold_reasons` reference table), Reference type radio chips (All, LP, Batch, WO, PO, GRN), Date range picker. To the right of the filter bar: a search input ("Search hold # or reference…") and two buttons: "+ Create Hold" (primary, opens Hold Create modal) and "Export CSV" (secondary).

The main content area is a full-width table. Column definitions:

| Column | Width | Content | Notes |
|---|---|---|---|
| Hold # | 120px | HLD-00001234 (link to detail) | Monospaced, `--blue` |
| Reference type | 80px | Badge: LP / Batch / WO / PO / GRN | `.badge-gray` |
| Reference | 140px | LP-001234 or WO-000456 (link to relevant module) | |
| Reason | 180px | Reason label from reference table | Truncated at 180px, tooltip on hover |
| Priority | 90px | Badge: low/medium/high/critical | Respective colors |
| Status | 100px | Badge: open/investigating/escalated/released/quarantined | |
| Days held | 70px | Integer, right-aligned | Red if >3 days |
| Est. release | 100px | Date (dd.MM.yyyy) or "—" | Amber if past due |
| Created by | 120px | User display name | |
| Actions | 100px | Action buttons | See below |

The Actions column contains: "View" button (secondary, small) always visible; "Release" button (success style, only shown if current user role is `quality_lead` or `prod_manager` AND hold_status is open or investigating); overflow menu icon "⋮" revealing: Edit hold, Escalate, Add note, Download audit PDF, Link NCR.

Row states: Active holds (open/investigating) have normal row background. Escalated holds have a subtle left stripe 3px `--red`. Released holds are rendered with 60% opacity. Rows with `estimated_release_at` in the past have the "Est. release" cell background `#fef3c7` (amber-light).

Selecting any row checkbox enables the "Bulk action" dropdown: "Release selected" (only available if all selected are releasable), "Export selected".

**Primary actions:** "+ Create Hold" (opens modal MODAL-HOLD-CREATE), "Release" per row (opens modal MODAL-HOLD-RELEASE).  
**Secondary actions:** "View" (navigates to QA-002a), "Export CSV".

**Empty state:** When no holds match the current filters: centered icon (padlock), heading "No holds found", body "No holds match your current filters. Try adjusting the filters or create a new hold.", button "+ Create Hold".

**Loading state:** Table shows 6 skeleton rows with shimmer animation. Filter bar inputs are disabled and semi-transparent. KPI cards show shimmer.

**Error state:** Alert-red banner below the filter bar: "Failed to load holds. [Retry]". Table area shows the error message only.

**Modals triggered:** MODAL-HOLD-CREATE (from "+ Create Hold"), MODAL-HOLD-RELEASE (from "Release" button on a row).

**Microcopy:** Page title: "Holds". Create button: "Create Hold". Filter label: "Status" (not "Hold status"). Empty state heading uses sentence-case.

---

### QA-002a — Hold Detail

**Screen ID:** QA-002a  
**Route:** `/quality/holds/:id`  
**Purpose:** Full detail view for a single hold, including all associated LPs, event history, linked NCR, and the release workflow.

**Layout description:**

Top row: back link "← Holds", hold number in 20px weight 700, status badge to the right. Below: breadcrumb "Quality > Holds > HLD-00001234".

A header card spans the full width with two columns. Left column fields: Reference type and ID (linked), Hold reason (label + free text if present), Priority badge, Disposition (or "Pending" if not set), Created by + date, Estimated release date. Right column: a three-line summary showing total quantity held (sum of `qty_held_kg` across hold items), count of LPs on hold, and linked NCR number (linked to QA-009a if present) or "No NCR linked" in `--muted`.

If the hold is signed/released, a locked banner is shown: "This hold was released on {date} by {user}. Record is immutable." with a `badge-signed` indicator.

Below the header card, two tabs: "Held Items" and "Activity Log".

The Held Items tab shows a table: LP number (link), Qty held (kg), Qty released (kg), Item status badge (held/released/partial/scrapped), Notes, Actions (Release item partially, Scrap item — only for quality_lead).

The Activity Log tab shows a vertical timeline of all audit events for this hold from `quality_audit_log`. Each timeline item: coloured dot (green=release, amber=update, red=escalate, blue=create), operation label, user display name, timestamp, and a collapsed JSON snippet "Changed fields: {field1, field2}" expandable on click.

Action bar at bottom (sticky): If hold is open/investigating and user is quality_lead or prod_manager: "Release Hold" button (success style, opens MODAL-HOLD-RELEASE); "Escalate" button (secondary, opens inline reason input); "Link NCR" button (secondary, opens NCR search picker). If hold is already released: "Download audit PDF" button only.

**Empty state for held items:** "No LP items recorded. This hold applies directly to the reference {type}: {id}."

**Error state:** Alert-red banner: "Hold details could not be loaded. [Retry]".

---

### QA-003 — Specifications List

**Screen ID:** QA-003  
**Route:** `/quality/specs`  
**Purpose:** List of all versioned product quality specifications. Allows quality_lead to view, create, clone, and approve specs.

**Layout description:**

Page title "Specifications" with breadcrumb "Quality > Specifications". Action bar: "+ Create Specification" (primary, navigates to `/quality/specs/new`).

Filter bar below the title: Search input ("Search product, spec code, parameter name…"), Status filter chips (All | Active | Draft | Under Review | Expired | Superseded), Applies-to filter (All | Incoming | In-process | Final), Product category dropdown (populated from 03-TECHNICAL item categories). Sort: "Effective date (newest)" default.

Main table columns:

| Column | Width | Content |
|---|---|---|
| Product | 200px | Product name + code badge |
| Spec code | 100px | e.g. SPEC-001 |
| Version | 60px | v1, v2, v3 (latest version in bold) |
| Status | 100px | Status badge using QA badge palette |
| Effective from | 100px | Date |
| Effective until | 100px | Date, amber if within 30 days |
| Parameters | 80px | "{n} ({n} critical)" — critical count in bold |
| Approved by | 140px | User name, date on second line in 11px `--muted` |
| Regulation | 120px | Regulation tags: EU 1169, FSMA 204, BRCGS v10 — each a small grey badge |
| Actions | 90px | View, ⋮ menu |

The ⋮ menu per row shows: View, Edit (only if Draft or Under Review), Approve (only if Under Review, quality_lead only, opens MODAL-SPEC-APPROVE), Clone to new version, Archive, View history, Download PDF.

Rows with status "Superseded" are rendered at 60% opacity with a line-through on the version number.

**Primary actions:** "+ Create Specification" (navigates to `/quality/specs/new`).  
**Secondary actions:** "View" (navigates to QA-003b), ⋮ menu actions.

**Empty state:** Icon (clipboard), heading "No specifications yet", body "Create your first product specification to define quality parameters for inspections.", button "+ Create Specification".

**Loading:** 5 skeleton rows.

**Error:** Alert-red banner with retry.

---

### QA-003a — Specification Create / Edit (3-step wizard)

**Screen ID:** QA-003a  
**Route:** `/quality/specs/new` or `/quality/specs/:id/edit`  
**Purpose:** 3-step wizard for creating or editing a versioned product specification.

**Layout description:**

The wizard uses a horizontal step indicator at the top: three numbered circles connected by lines. Active step circle is filled `--blue`; completed steps are filled `--green` with a check. Steps: 1. Header, 2. Parameters, 3. Review & Submit. Below the step indicator, breadcrumb "Quality > Specifications > New Specification".

**Step 1 — Header**

Left-aligned form in a card. Fields (top to bottom):

- Product (required): Searchable dropdown populated from 03-TECHNICAL items. Type code or name. Shows product code + name. Validation: item must exist. Regulation tag: if the selected product has an allergen profile in 03-TECHNICAL, a green info banner appears: "Allergen profile will be snapshotted at approval. Profile: {allergen list}." Field help text: "Select the product this specification applies to. One active spec per product per applies_to type is allowed."
- Spec code (required): Text input, auto-populated as `SPEC-{product_code}-{applies_to_initial}` but editable. Max 50 chars. Uniqueness validation against existing specs for the same product is checked on blur.
- Version: Read-only, auto-incremented. For new specs: "v1". For clone: "v{n+1}". Shown in a grey chip.
- Applies to (required): Segmented control with four options: Incoming / In-process / Final / All. Default: Incoming.
- Effective from (required): Date picker. Default: today.
- Effective until: Date picker. Optional. If left blank, spec is open-ended.
- Regulation references: Multi-select chips. Options: EU FIC 1169/2011, FSMA 204, BRCGS Issue 10, ISO 22000, Codex HACCP, 21 CFR Part 11, None. Each selected regulation is shown as a badge. Help text: "Select all regulations this spec is intended to satisfy. These tags appear on inspections and CoAs."
- Reference documents: Text area for free-form document references (e.g., internal SOP numbers, supplier CoA references). Max 500 chars.
- Notes: Text area, optional. Max 1000 chars.

Bottom action bar: "Next: Parameters →" (primary), "Cancel" (link, with discard confirmation if any field is filled).

**Step 2 — Parameters**

Left side: a scrollable table of already-added parameters (empty on first load). Right side: an "Add Parameter" inline panel.

The parameters table columns: Drag handle (reorder), Parameter name, Type badge, Target / Min / Max with unit, Method, Critical flag (red dot if true), Actions (edit, delete).

The "Add Parameter" panel contains:

- Parameter name (required): Text input. Max 100 chars. Examples: "Moisture content", "pH", "Weight net", "Crust colour".
- Parameter type (required): Dropdown. Options: Visual | Measurement | Attribute | Microbiological | Chemical | Sensory | Equipment. Selecting "Measurement" shows numeric fields below; selecting "Visual" or "Attribute" hides numeric fields.
- Target value: Numeric input (shown only if type = Measurement, Chemical, Microbiological). Up to 6 decimal places.
- Min value: Numeric input. Validation: must be ≤ target if target is set.
- Max value: Numeric input. Validation: must be ≥ target if target is set; must be ≥ min.
- Unit: Text input, max 20 chars. Examples: "°C", "pH", "kg", "RLU", "%".
- Test method (required): Text area. Max 200 chars. Help text: "Describe the test procedure. This field is required before the spec can be approved. [Regulation: V-QA-SPEC-002]"
- Equipment required: Text input. Max 100 chars. Optional.
- Critical parameter: Toggle. Default off. When on: a red "Critical" badge appears in the parameter row. Help text: "Critical parameters: a FAIL on any critical parameter blocks batch release and auto-triggers an NCR."
- "Add Parameter" button (primary).

At least one parameter must be added before proceeding. Validation inline: if Min > Max, inline error message below the respective field "Min value must be less than or equal to Max value."

Bottom action bar: "← Back" (secondary), "Next: Review →" (primary). "Next" is disabled if parameter list is empty.

**Step 3 — Review & Submit**

A read-only summary card shows all header fields on the left and the parameters table on the right. Any field that is empty or missing shows a red "Required" indicator.

A "Submit for approval" button (primary) and a "Save as draft" button (secondary). If the user is `quality_lead`, a third option "Approve immediately (e-sign)" is shown, which opens MODAL-SPEC-SIGN directly.

Submit validation: all required fields must be present; all parameters with type=Measurement must have a test_method; if min or max is provided, target must not violate the range. Error messages appear at the top of the review card as an ordered list.

**Edit mode:** When editing a spec in `draft` or `under_review` status, all fields are editable. When editing an `active` spec (which should be rare), a prominent amber banner states: "Warning: This specification is active and has been used in inspections. Any changes will create a new version. Editing here will save as a draft of v{n+1} for review." Approved/active specs are immutable at the DB level; the UI creates a clone.

**Microcopy:** Step indicator labels: "1. Header" / "2. Parameters" / "3. Review". "Add Parameter" button label. "Critical parameter" toggle label. Help text uses the validation rule codes in brackets.

---

### QA-003b — Specification Detail

**Screen ID:** QA-003b  
**Route:** `/quality/specs/:id`  
**Purpose:** Read-only view of a specific specification version, including all parameters, regulation references, allergen profile snapshot, and approval history.

**Layout description:**

Back link "← Specifications". Title: "{Product name} — {spec_code} v{n}" at 20px weight 700, status badge to the right. Breadcrumb.

Header card: Product link (to 03-TECHNICAL), Spec code, Version, Applies to, Effective from/until, Regulation tags (badge per regulation), Created by + date. If status is `active`, an immutable indicator "Approved by {user} on {date}" with `badge-signed`. If the spec has a `superseded_by` reference: an amber banner "This specification was superseded by v{n+1} on {date}. [View current version →]".

Allergen profile section: If `allergen_profile JSONB` is not null (snapshotted at approval), a card shows "Allergen profile snapshot (at approval time)" with a grid of 14 EU allergen slots: each slot shows the allergen name and a green "Present" or grey "Absent" badge. Regulation tag: "EU FIC 1169/2011" badge. If profile is null (spec not yet approved): "Allergen profile will be snapshotted at approval."

Parameters table (same columns as in the Add Parameter panel, but read-only): Parameter name, Type badge, Target, Min, Max, Unit, Test method (truncated, expandable), Equipment, Critical badge (if applicable). Rows with `is_critical = true` have a left stripe 3px `--red`.

Action bar (for quality_lead, status = under_review): "Approve Specification" (primary, opens MODAL-SPEC-SIGN). For any role: "Clone to new version" (secondary), "Download PDF" (secondary).

If signed/approved: the action bar shows only "Clone to new version" and "Download PDF". A `badge-signed` lock icon with tooltip "Immutable — 21 CFR Part 11: signed record cannot be modified."

---

### QA-004 — Test Templates

**Screen ID:** QA-004  
**Route:** `/quality/templates`  
**Purpose:** Library of reusable test parameter blocks that can be imported into a specification. Phase 1 basic; allows quality_lead to define common test sets (e.g., "Standard microbiological panel", "Weight check") and apply them when building new specs.

**Layout description:**

Page title "Test Templates". Breadcrumb "Quality > Test Templates". Action: "+ New Template" (primary, opens MODAL-TEMPLATE-CREATE).

Filter bar: Search input, Category filter (Microbiological | Chemical | Physical | Sensory | All), Status filter (Active | Archived | All).

Card grid (3 columns on desktop, 2 on tablet, 1 on mobile). Each card:

- Card title: Template name (14px weight 600).
- Sub-line: Category badge + "{n} parameters".
- Parameter list preview: first 4 parameter names in 12px `--muted`, comma-separated. If more than 4: "+ {n} more".
- Footer: Created by, last updated date. Two buttons: "Use in spec" (primary-small, launches the spec wizard step 2 pre-filled), "Edit" (secondary-small, opens MODAL-TEMPLATE-CREATE in edit mode).
- ⋮ overflow menu: Archive template, Duplicate, View history.

**Empty state:** Clipboard icon, "No test templates yet", body "Create reusable test parameter blocks to speed up specification creation.", button "+ New Template".

**Loading state:** 6 card skeletons.

---

### QA-005 — Incoming Inspections (Queue)

**Screen ID:** QA-005  
**Route:** `/quality/inspections/incoming`  
**Purpose:** Queue of all incoming inspections (auto-created when a GRN is received in 05-WAREHOUSE for items with `inspection_required = true`). Primary workspace for QA Inspectors.

**Layout description:**

Page title "Incoming Inspections". Breadcrumb "Quality > Inspections > Incoming".

An amber alert strip sits below the breadcrumb if any inspections are overdue: "⚠ {n} inspections overdue — [View overdue]". Clicking the link applies an overdue filter to the list.

Filter bar: Status chips (All | Pending | Assigned | In Progress | Completed | Cancelled), Priority filter (Normal | High | Urgent), Inspector filter (searchable dropdown of users with `qa_inspector` role), Date range picker. Search input: "Search inspection # or GRN #…". To the right: "Export" button (secondary).

Main table columns:

| Column | Width | Content |
|---|---|---|
| Inspection # | 120px | INS-00001234 (link) |
| GRN / PO | 120px | GRN number (link to 05-WH GRN), PO number below in 11px |
| Product | 180px | Product name + SKU badge |
| Priority | 90px | Badge: urgent=red / high=amber / normal=blue |
| Status | 100px | Status badge |
| Urgency | 90px | "Overdue" (red) / "Today" (amber) / "Scheduled" (blue) — derived from `scheduled_at` vs. NOW |
| Assigned to | 130px | User name or "Unassigned" in `--muted` |
| Scheduled | 100px | Date+time (dd.MM.yyyy HH:mm) |
| Sampling plan | 100px | Plan code or "—" |
| Actions | 120px | Assign, Start, ⋮ |

Row click opens QA-005a (detail). The "Assign" button (secondary-small) opens a small inline dropdown to pick an inspector. The "Start" button (primary-small) transitions inspection to `in_progress` and navigates to QA-005a.

Urgency calculation: if `scheduled_at < NOW()` → overdue (badge-fail); if `scheduled_at < NOW() + 1 day` → urgent (badge-hold); else → normal (badge-pending).

**Modals triggered:** MODAL-INSPECTION-ASSIGN (from "Assign"), MODAL-SAMPLE-DRAW (from within QA-005a).

**Empty state (no inspections):** Magnifying glass icon, "No inspections pending", body "Inspections are automatically created when goods are received. Check 05-Warehouse for pending GRNs or create a manual inspection.", button "Create manual inspection" (opens MODAL-INSPECTION-CREATE).

**Loading:** 6 skeleton rows.

**Error:** Alert-red banner + retry.

---

### QA-005a — Incoming Inspection Detail & Results Form

**Screen ID:** QA-005a  
**Route:** `/quality/inspections/incoming/:id`  
**Purpose:** Full inspection workspace: view GRN context, draw samples, enter per-parameter test results, compute overall pass/fail, sign off, and trigger NCR or hold on failure.

**Layout description:**

Top row: back link "← Inspections", inspection number in 20px weight 700, status badge, priority badge. If this inspection is overdue, an amber banner: "This inspection is overdue by {n} hours. [Mark urgent]".

A two-column layout below the title. The left column (60% width) contains the main content; the right column (40% width) contains a reference context card.

**Right column — Reference context card:**

- GRN details: GRN number (link), PO number (link), supplier name, receipt date.
- Product details: Product name, SKU, product image thumbnail (if available from 03-TECHNICAL), product family.
- Specification: Spec code + version badge + status badge. Link to QA-003b. If spec is not active: amber warning "Spec {code} is {status}. Assign an active spec before starting. [Change spec]".
- Sampling plan: Plan code, AQL level, lot size, required sample size. Sample draw status: "{n} of {required} samples drawn" progress bar.
- LP(s) under inspection: Table with LP number, qty, location. Up to 5 rows, "Show all" if more.

**Left column — Test results:**

Section heading "Test Parameters" with a "Draw Sample" button (secondary, opens MODAL-SAMPLE-DRAW if samples_taken < required sample size per plan) and a "Add lab result" link (secondary-small, for manual LIMS entry, P1 stub).

Parameters table. Each row represents one `quality_spec_parameters` entry. Columns: Parameter name + critical badge if applicable, Type badge, Target (min–max) with unit, Measured value input, Auto result, Notes.

The "Measured value input" cell is editable when inspection status is `in_progress`:
- For type Measurement/Chemical/Microbiological: numeric input field with unit displayed inline. On blur, the cell auto-computes the result: if value is between min and max (inclusive), show a green "Pass" badge; if outside, show a red "Fail" badge. If value exactly equals target, show a green checkmark. The auto-result badge updates instantly without form submission.
- For type Visual/Attribute/Sensory: text input, no auto-compute. Inspector must manually select Pass / Fail / N/A from a small segmented control next to the text input.
- For type Equipment: text input + Pass/Fail select.

At the bottom of the parameters table, an "Overall result" row shows the auto-computed aggregate: PASS if all parameters pass (and all critical parameters pass); FAIL if any critical parameter fails; CONDITIONAL if only non-critical parameters fail; HOLD if the inspector manually overrides to hold.

Below the parameters table, a "Fail reason" section appears only if the overall result is FAIL or any parameter result is FAIL. Fields: Fail reason code (dropdown from `qa_failure_reasons` reference table), Fail reason notes (text area, required if code = "other"). Validation: if result=FAIL then fail_reason_code_id OR fail_reason_notes must be provided (V-QA-INSP-006).

An "NCR" section below: if the overall result is FAIL and no linked NCR exists, an amber banner: "An NCR draft will be automatically created when you submit this inspection. [Preview NCR]". If an NCR is already linked: "Linked NCR: NCR-00001234 [{status badge}] [View →]".

Action bar at the bottom (sticky): "Save draft" (secondary), "Submit inspection" (primary, disabled until all critical parameters have results — V-QA-INSP-003), "Cancel inspection" (danger, opens dialog asking for cancel reason). If result is PASS: "Submit & release LP" (primary-success). If result is FAIL: "Submit & create hold" (primary-danger).

The "Sign off" flow: after submitting, if the inspection type requires a signature (food-safety parameters present), the UI transitions to a sign-off step: a card shows a summary (inspection #, product, result, inspector, timestamp) and a "Sign off (e-signature)" button opening MODAL-ESIGN. Once signed, the inspection record is immutable and the status badge changes to "Completed — Signed" with `badge-signed`.

**Loading state:** The parameters table shows skeleton rows while the spec parameters load. The reference context card shows a spinner.

**Error state:** If the spec cannot be loaded: amber warning "Could not load specification parameters. [Retry] [Assign different spec]". If submit fails: inline error above the action bar.

**Immutable state:** If inspection is already `completed` and `signed_at IS NOT NULL`, all input fields are read-only, inputs are replaced by plain text, and a locked banner appears: "This inspection was completed and signed on {date} by {user}. Record is immutable (21 CFR Part 11)." The `badge-signed` indicator is shown. A "Download PDF" button is the only action available.

**Microcopy:** "Draw Sample" / "Add lab result" / "Submit inspection" / "Submit & release LP" / "Submit & create hold" / "Save draft" / "Cancel inspection" — all title-case. Auto-result label: "Auto" in 11px `--muted` above the result badge. Required-field indicator: red asterisk. Fail reason notes placeholder: "Describe the non-conformance in detail…"

---

### QA-006 — In-Process Inspection (P2 Placeholder)

**Screen ID:** QA-006  
**Route:** `/quality/inspections/in-process`  
**Purpose:** Phase 2 feature — triggered by WO operation milestones. Phase 1 shows a placeholder.

**Layout description:** Page title "In-Process Inspections" with a blue info banner: "In-Process Inspections will be available in Phase 2 (Epic 8F). They are triggered automatically by Work Order operation milestones and allow inspectors to take samples mid-production without stopping the line." Below the banner, a greyed-out mockup table preview with 3 blurred rows and an overlay button "Coming in Phase 2". A "View roadmap" link at the bottom.

---

### QA-007 — Final Inspection (P2 Placeholder)

**Screen ID:** QA-007  
**Route:** `/quality/inspections/final`  
**Purpose:** Phase 2 feature — pre-release batch inspection. Phase 1 shows a placeholder identical in structure to QA-006 with text adjusted to describe final inspections and the batch release gate.

---

### QA-008 — Sampling Plans

**Screen ID:** QA-008  
**Route:** `/quality/sampling`  
**Purpose:** Configuration and management of AQL sampling plans (ISO 2859-1 / MIL-STD-105E). Plans are attached to product specifications and determine sample size, accept number, and reject number for each inspection.

**Layout description:**

Page title "Sampling Plans". Breadcrumb "Quality > Sampling Plans". Action: "+ New Plan" (primary, opens MODAL-SAMPLING-CREATE).

Filter bar: Plan type chips (All | ISO 2859 | ANSI Z14 | Custom | Forza 10th), Status filter (Active | Archived), Applies to filter.

Main table columns:

| Column | Width | Content |
|---|---|---|
| Plan code | 100px | e.g. ISO-AQL-1.0-GII |
| Type badge | 100px | iso2859 / ansi_z14 / custom |
| AQL level | 80px | 1.0, 2.5, 4.0 |
| Inspection level | 80px | GI, GII, GIII, S-1…S-4 |
| Lot size range | 120px | {min}–{max} units |
| Sample size | 80px | n (per ISO table) |
| Accept # | 70px | Ac number |
| Reject # | 70px | Re number |
| Applies to | 90px | Badge: incoming/final/all |
| Status | 80px | Active / Archived |
| Actions | 80px | Edit, Archive, ⋮ |

A help card below the table: "AQL Reference: ISO 2859-1 / MIL-STD-105E. Accept on zero (Ac=0) for critical attributes. Attach plans to product specifications in the Specifications screen." with a link "Read ISO 2859-1 sampling procedure" (external, opens in new tab).

**Empty state:** Icon (grid), "No sampling plans yet", body "Define sampling plans based on AQL tables to standardise your inspection sample sizes.", button "+ New Plan".

---

### QA-009 — NCR List

**Screen ID:** QA-009  
**Route:** `/quality/ncr`  
**Purpose:** List of all Non-Conformance Reports with severity/status breakdown KPIs and filter controls.

**Layout description:**

Page title "Non-Conformance Reports". Breadcrumb "Quality > NCR". Action bar: "+ Create NCR" (primary, opens MODAL-NCR-CREATE), "Export" (secondary).

Four summary KPI cards (smaller, half-height): "Open NCRs" (count with `--red` bottom border if critical count > 0), "Overdue" (count, `--red`), "Critical open" (count, `--red`), "Avg resolution (days)" (numeric, `--blue`).

Below KPIs, a status pipeline visualisation: a horizontal row of Kanban-style columns showing counts per NCR status stage: Draft → Open → Investigating → Awaiting CAPA (P2) → Closed. Each column shows a count badge and clicking navigates to the list filtered to that status. This gives a workflow pipeline view of the NCR backlog.

Filter bar: Status multi-select (All | Draft | Open | Investigating | Closed | Cancelled), Severity chips (All | Critical | Major | Minor), NCR type dropdown (All | Quality | Yield Issue | Allergen Deviation | Supplier | Process | Complaint-related), Reference type, Date range, Assigned to.

Main table. Each row shows:

| Column | Width | Content |
|---|---|---|
| Checkbox | 32px | Bulk select |
| NCR # | 110px | NCR-00001234 (link to QA-009a) |
| Title | 240px | Truncated at 240px, tooltip |
| Severity | 90px | Critical/Major/Minor badge |
| Type | 100px | NCR type badge |
| Status | 110px | Status badge with workflow stage |
| Source | 130px | Reference type + linked record (link) |
| Detected | 100px | Date + "{n}d ago" sub-line |
| Response due | 110px | Date, red if past due, amber if within 4h |
| Assigned to | 130px | User name or "Unassigned" |
| Actions | 100px | View, ⋮ |

Overdue rows (response_due_at < NOW()) have a thin red left stripe and the "Response due" cell has background `#fee2e2`.

Row ⋮ menu for open NCRs: View details, Assign owner, Update status, Link to hold, Add comment, Export NCR report. For closed NCRs: View details, View resolution, Reopen (if recurrence).

Bulk actions: Assign selected, Export selected.

**Primary actions:** "+ Create NCR", "View" per row (navigates to QA-009a).

**Empty state:** Clipboard icon, "No NCRs", body "NCRs are created automatically when inspections fail or CCP deviations are detected. You can also create them manually.", button "+ Create NCR".

---

### QA-009a — NCR Detail

**Screen ID:** QA-009a  
**Route:** `/quality/ncr/:id`  
**Purpose:** Full NCR detail view with workflow actions, linked evidence, and closure flow.

**Layout description:**

Back link "← NCRs". Title: NCR number in 20px weight 700, severity badge, status badge. Breadcrumb.

A two-column layout. Left column (65%): detail sections. Right column (35%): sidebar with linked records, timeline, and actions.

**Left column sections:**

Header card: NCR type badge, Title (large), Description (full text). Below: Detected by + date, Detected location, Product (link), Reference (link to source inspection/CCP/hold), Affected quantity (kg), Response due date (highlighted red if past).

For NCR type = `yield_issue`: an additional card "Yield details" showing Target yield %, Actual yield %, Claim %, Estimated claim value (EUR). A green info tag "Regulation: BRCGS Issue 10 §3.7" appears next to the Affected quantity field.

Investigation section (collapsible): Root cause text area (editable if investigating and user is quality_lead/investigator), Root cause category dropdown (contamination / process failure / equipment failure / human error / supplier / specification / other), Immediate action taken (text area). If status is `draft` or `open`, these fields are empty and have placeholder text.

CAPA section: "CAPA — Phase 2 (Epic 8G)." Placeholder card with P2 banner. Shows linked `capa_record_id` if present, else: "No CAPA assigned. [Assign CAPA (P2)]" in grey.

**Right column — sidebar:**

Linked records card: Hold (link), Inspection (link), CCP deviation (link), Complaint (link). Each shows the record number and status badge. Empty slots show "—".

Status workflow card: Displays the current status and available transitions as large tonal buttons. Available transitions are computed from the NCR status field:
- Draft → "Submit for investigation" (primary)
- Open → "Start investigating" (primary)
- Investigating → "Mark awaiting CAPA" (secondary, P2), "Close NCR" (success, if root_cause filled)
- Closed → no transitions; shows "Re-open" link

For closing an NCR, a separate button "Close NCR" opens MODAL-NCR-CLOSE. For critical NCRs, closing requires dual sign (quality_lead + prod_manager).

Activity timeline: vertical list of audit events for this NCR, same style as hold detail activity log. Shows: status transitions, assignment changes, comments, sign events.

**Action bar (sticky bottom):** Available based on status and role. "Save changes" (secondary), "Close NCR" (success, quality_lead only). If closed: "Download NCR report" (secondary).

---

### QA-010 — Batch Release (P2 Placeholder)

**Screen ID:** QA-010  
**Route:** `/quality/release`  
**Purpose:** Phase 2 feature (Epic 8F). Pre-release checklist: final inspection passed, no open NCRs, CCP within limits, CoA issued. Phase 1 shows a placeholder.

**Layout description:** Identical placeholder structure to QA-006 with text: "Batch Release gate will be available in Phase 2 (Epic 8F). The `batch_release_gate_v1` rule checks: all inspections pass, no open holds, all CCPs within limits, no critical open NCRs, allergen changeover validated (if claimed). Only when all checks pass can the Production Manager release the batch to shipping."

---

### QA-011 — CoA List (P2 Placeholder)

**Screen ID:** QA-011  
**Route:** `/quality/coa`  
**Purpose:** Phase 2 (Epic 8J). Shows placeholder.

---

### QA-012 — CoA Templates (P2 Placeholder)

**Screen ID:** QA-012  
**Route:** `/quality/coa/templates`  
**Purpose:** Phase 2 (Epic 8J). Shows placeholder.

---

### QA-013 — HACCP Plans

**Screen ID:** QA-013  
**Route:** `/quality/haccp`  
**Purpose:** View, create, and manage HACCP plans and their Critical Control Points. Primary for Quality Lead and Hygiene Lead.

**Layout description:**

Page title "HACCP Plans". Breadcrumb "Quality > HACCP". Action bar: "+ New HACCP Plan" (primary, opens MODAL-HACCP-CREATE), "Export all plans PDF" (secondary).

A two-column layout. Left column (30%): a plan tree navigator. Right column (70%): the selected plan detail.

**Left column — Plan tree:**

Each plan is a tree item at level 0 (plan code + version + status badge). Below each plan, its CCPs are indented as level 1 items showing CCP code + step name. Clicking a plan header selects it and shows plan-level detail in the right column. Clicking a CCP item scrolls the right column to that CCP card.

If a plan has `status = active`, the plan label has a green dot prefix. Draft plans have an amber dot.

**Right column — Plan detail:**

A header card: Plan code, Product family (link to 03-TECHNICAL), Version, Status badge, Effective from, Reviewed at, Approved by (with `badge-signed` if approved). For quality_lead: "Edit Plan" and "Approve Plan" (if draft) buttons.

Below the header, a section "Critical Control Points" with a sub-header count badge: "{n} CCPs". Each CCP is rendered as a card with:

- Card header: CCP code badge, Step name (bold), Hazard type badge (Biological / Chemical / Physical / Allergen — each a distinct colour: biological=red, chemical=amber, physical=grey, allergen=purple).
- Fields: Hazard description, Critical limit min (with unit), Critical limit max (with unit), Monitoring frequency, Monitoring method, Deviation threshold, Corrective action (default), Verification method, Record method.
- Regulation tag: "ISO 22000 / Codex HACCP" badge below the hazard type field.
- Recent readings: A mini sparkline chart showing the last 10 readings as coloured dots: green for within-limits, red for deviation. Below the chart: "{n} readings today — {n} deviations". Click "View all readings →" navigates to `/quality/ccp?plan_id={id}&ccp_id={ccp_id}`.
- Action buttons (hygiene_lead and quality_lead): "Add reading" (primary-small, opens MODAL-CCP-READING), "Edit CCP" (secondary-small, opens MODAL-CCP-EDIT). For all roles: "View history" (link).

**Empty state (no CCPs on a plan):** "No CCPs defined. A HACCP plan requires at least one CCP before it can be activated. [Add CCP]".

**Empty state (no plans):** Clipboard icon, "No HACCP plans", body "HACCP plans define the Critical Control Points and monitoring requirements for your food safety management system (ISO 22000 / Codex HACCP). Create a plan for each product family.", button "+ New HACCP Plan".

---

### QA-014 — CCP Monitoring

**Screen ID:** QA-014  
**Route:** `/quality/ccp`  
**Purpose:** Timeline of all CCP monitoring records. Provides real-time and historical view of readings per CCP, visual in/out-of-spec status, and quick entry for new readings.

**Layout description:**

Page title "CCP Monitoring". Breadcrumb "Quality > CCP Monitoring". Action bar: "+ Record reading" (primary, opens MODAL-CCP-READING), "Export CSV" (secondary).

Three summary KPI cards: "Active CCPs" (count of CCPs with `active = true`), "Compliance today" (percentage of today's records with `within_limits = true`, `--green` if ≥99%, else `--red`), "Deviations (last 24h)" (count, `--red` if > 0).

Filter bar: HACCP Plan dropdown (All plans or select one), CCP dropdown (filtered by plan selection), Date range, Status (All | Pass | Fail | All deviations), Work Order link filter. Apply and Reset buttons.

Main table columns:

| Column | Width | Content |
|---|---|---|
| WO | 90px | WO number (link) or "—" |
| CCP | 160px | CCP code badge + step name |
| Hazard type | 100px | Hazard badge |
| Measurement | 100px | Measured value with unit |
| Limit | 120px | min–max range |
| Status | 90px | "Pass" (green) / "Fail" (red) badge |
| Recorded by | 130px | User display name |
| Recorded at | 120px | Date+time |
| Method | 90px | desktop / scanner / iot_sensor badge |
| Signed | 80px | `badge-signed` icon or "—" |
| Actions | 100px | View, deviation link |

Rows with `within_limits = false` have a red left stripe 3px and a "Fail" badge with red background. If a deviation was auto-created (NCR draft), the "Actions" cell shows "NCR created" with a link.

A timeline chart sits above the table (collapsible). For the currently filtered CCP, the chart shows a horizontal time axis with coloured dots: green for pass, red for fail. The critical limit band is shown as a translucent blue horizontal range. Hovering a dot shows a tooltip: value, timestamp, recorded by.

**Modals triggered:** MODAL-CCP-READING (from "+ Record reading"), MODAL-CCP-DEVIATION-LOG (from deviation actions).

**Empty state:** CCP icon, "No CCP records", body "Start recording CCP readings to monitor food safety critical limits.", button "+ Record reading".

---

### QA-015 — CCP Deviations

**Screen ID:** QA-015  
**Route:** `/quality/ccp/deviations`  
**Purpose:** Filtered list of all CCP readings that were outside critical limits, with severity, corrective actions taken, root cause, and sign-off status.

**Layout description:**

Page title "CCP Deviations". Breadcrumb "Quality > CCP Monitoring > Deviations". Action bar: "+ Log deviation manually" (secondary), "Export" (secondary).

Three summary cards: "Open deviations" (count, `--red`), "Corrective action pending" (count, `--amber`), "Resolved today" (count, `--green`).

Filter bar: Hazard type, CCP plan, Severity (Critical | Major | Minor), Date range, Status (Open | Corrective action taken | Resolved | Signed off).

Main table:

| Column | Content |
|---|---|
| Deviation ref | Monitoring record link |
| CCP | CCP code + step |
| Hazard type | Badge |
| Reading | Measured value with limit range |
| Severity | Auto-computed severity badge (biological/allergen = critical; chemical/physical = major; default = minor) |
| Linked NCR | NCR number link or "Auto-created" badge |
| Corrective action taken | Text (truncated) or "None — required" in amber |
| Recorded by | User |
| Recorded at | Date+time |
| Sign-off status | `badge-signed` or "Not signed" |
| Actions | View, Sign off, Add corrective action |

Rows where corrective action is required before the next reading (V-QA-CCP-004) and not yet filled are highlighted with `border-left: 3px solid --amber` and an amber "Action required" badge in the corrective action column.

Clicking "Sign off" opens MODAL-ESIGN for the deviation record. Clicking "Add corrective action" opens a small inline form (text area + save button) that appends the corrective action to the monitoring record's notes.

---

### QA-016 — Allergen Changeover Gates

**Screen ID:** QA-016  
**Route:** `/quality/allergen-gates`  
**Purpose:** Read-only consumer view of allergen changeover validation records from 08-PRODUCTION. Quality Lead performs second sign-off here. Primary owner is 08-PROD §7 E7.

**Layout description:**

Page title "Allergen Changeover Gates". Breadcrumb "Quality > Allergen Gates". Info banner (blue): "This screen displays allergen changeover validation records created by 08-Production. Quality is the second signer. Source table: `allergen_changeover_validations` (owned by 08-PROD)."

Three KPI cards: "Pending 2nd sign" (count, `--amber`), "Approved today" (count, `--green`), "Rejected / overridden" (count, `--red`).

Filter bar: Date range, Production line, Allergen delta (contains "nuts" / "milk" / etc.), Status (Pending first sign | Awaiting 2nd sign | Approved | Rejected | Overridden), Risk level.

Main table:

| Column | Content |
|---|---|
| Gate ID | Validation ID (truncated UUID or auto-number) |
| WO from → to | Previous WO → new WO, with allergen delta arrow |
| Allergen delta | Short list of allergens removed (green) and added (red) |
| Risk level | Low / Medium / High badge |
| Cleaning complete | Yes (green tick) / No (red cross) |
| ATP result (RLU) | Numeric value (green if ≤ threshold, red if above). Pass threshold = 10 RLU. Regulation: "EU FIC 1169/2011 + Reg 2021/382" tag. |
| First signer | User + timestamp or "Awaiting" in `--muted` |
| Second signer | User + timestamp or "Awaiting" in amber |
| Status | Approved / Awaiting 2nd sign / Rejected |
| Actions | View details, Sign (if quality_lead and awaiting 2nd sign) |

Clicking a row opens a right-side drawer (not a new page). The drawer shows all evidence: cleaning checklist items, ATP lab result row (with `pass_threshold` comparison), signature history (first signer detail + second signer detail), and a scrollable audit trail for this record.

For quality_lead, if `validation_result = 'pending_second_sign'`: a prominent "Sign as Quality Lead (2nd sign)" button (primary, opens MODAL-ALLERGEN-DUAL-SIGN). If override is needed: an "Override" link that opens MODAL-ALLERGEN-OVERRIDE (requires override reason + e-signature).

**Immutable state:** Once both signatures are recorded, the row shows `badge-signed` in both signer columns and all action buttons are replaced by "Download evidence PDF".

---

### QA-021 — Audit Trail

**Screen ID:** QA-021  
**Route:** `/quality/audit`  
**Purpose:** Immutable audit log of all quality-related events. Filterable by entity, user, date, operation type. Exportable. Read-only for all roles; tamper-evident presentation is central to the UX.

**Layout description:**

Page title "Audit Trail". Breadcrumb "Quality > Audit Trail". A prominent amber info banner at the top: "This is an immutable audit record maintained per BRCGS Issue 10 §3.11.1, 21 CFR Part 11, and FSMA 204. Records cannot be edited or deleted. Retention: 7 years minimum." A `badge-signed` icon is shown inline in the banner.

Action bar: "Export CSV" (secondary, opens MODAL-AUDIT-EXPORT), "Export JSON" (secondary).

Filter bar (horizontal): Table name dropdown (All | quality_holds | quality_inspections | quality_specifications | ncr_reports | haccp_monitoring_records | allergen_changeover_validations), Entity ID text input ("Search record ID or number…"), User dropdown (all users), Operation type chips (INSERT | UPDATE | DELETE | SIGN | RELEASE | APPROVE | CLOSE), Date range picker. Apply and Reset buttons.

Main table:

| Column | Width | Content |
|---|---|---|
| Occurred at | 160px | Full timestamp (dd.MM.yyyy HH:mm:ss) |
| Table | 180px | Table name as monospace badge |
| Record | 130px | Record ID (linked to relevant screen if applicable) |
| Operation | 100px | INSERT/UPDATE/DELETE/SIGN/RELEASE/APPROVE/CLOSE badge |
| User | 140px | Display name (never UUID in UI) |
| Changed fields | 200px | Comma-separated list of changed columns, truncated |
| IP address | 120px | IPv4/IPv6 |
| Details | 60px | "Expand ↓" button |

The "Expand" button opens an inline collapsed section below the row showing two JSON panels side by side: "Before" (`old_data`) and "After" (`new_data`). Changed fields are highlighted in yellow in both panels. A "Change reason" field is shown if `change_reason` is not null. A "Request ID" is shown in monospace for distributed tracing.

SIGN operation rows have a distinct left stripe using the `--blue` color and a `badge-signed` icon in the Operation column. The expanded section for SIGN events shows `signature_meaning`, `signed_at`, `pin_verified: true`, and `signature_hash` (first 16 chars + "…" for readability, not truncated in export).

**Pagination:** 50 rows per page. Page navigation at bottom. Total count in footer: "Showing {n}–{n} of {total} events."

**Empty state (filters return no results):** "No audit events match your filters. [Clear filters]"

**Error state:** Alert-red banner + retry.

**Export modal:** See MODAL-AUDIT-EXPORT in Section 4.

**Note for designer:** The audit trail screen must visually communicate immutability. Use a distinct page header background, perhaps a very light `#f0f7ff` tint, to differentiate it from editable screens. Consider a lock icon in the page title.

---

### QA-025 — Scanner QA (Shop-floor Sample Entry)

**Screen ID:** QA-025  
**Route:** `/quality/scanner` (desktop redirect notice only)  
**Purpose:** Placeholder and link to 06-SCANNER for shop-floor QA entry workflows (SCN-070..073 and SCN-081). These flows are executed on the Scanner module's mobile/kiosk interface, not in the desktop Quality module.

**Layout description:**

Page title "Scanner QA". Breadcrumb "Quality > Scanner QA". A blue info card centred on the page: "QA sample entry and inspection scanning is performed via the Scanner module on shop-floor devices. Desktop access to scanner flows is for reference only."

Below the card, four scanner flow reference cards in a two-column grid:

- SCN-070: "QA Inspect entry (pending list)" — shows the queue of pending inspections. API: `GET /api/quality/scanner/pending`.
- SCN-071: "QA Inspect (scan LP)" — scan an LP and record PASS / FAIL / HOLD with 3 large buttons. API: `POST /api/quality/scanner/inspect`.
- SCN-072: "QA Fail reason" — select from 7 failure reason codes + notes. Auto-creates NCR draft. API: writes `fail_reason_code_id`.
- SCN-073: "QA Done" — result confirmation screen showing inspection_id + NCR reference if created.

Each card shows the flow name, API endpoint in monospace, and a "View in Scanner module →" link that navigates to 06-SCANNER with the relevant flow pre-selected.

For SCN-081 (allergen changeover dual-sign), a note card: "Allergen changeover sign-off (SCN-081) is performed on the Scanner. It writes `first_signed_by` to `allergen_changeover_validations`. The second sign is performed on desktop in QA-016 Allergen Changeover Gates."

---

### QA-099 — Quality Settings

**Screen ID:** QA-099  
**Route:** `/quality/settings`  
**Purpose:** Configuration of QA module defaults. Accessible to quality_lead and admin.

**Layout description:**

Page title "Quality Settings". Breadcrumb "Quality > Settings". Tabbed layout with tabs: General, Regulations, Notifications, Retention, Rules.

**General tab:**

- Inspection required: toggle "Auto-create incoming inspection on GRN for all items" (default: off). Note: Override per item in 03-TECHNICAL.
- Default inspection priority: select (Normal / High / Urgent).
- Spec versioning policy: select (Allow draft edits | Clone only). Help: "If 'Clone only', any edit to an active spec automatically creates a new draft version."
- Hold default duration days: table showing hold reason categories and their default duration (days). Editable inline. Populated from `quality_hold_reasons` reference table. Note: "Final values post-UAT per OQ-QA-01."
- Sampling plan default: dropdown to select which sampling plan applies as default when no plan is explicitly attached to a spec.

**Regulations tab:**

- Active regulation presets: toggle checkboxes for EU FIC 1169/2011, FSMA 204, BRCGS Issue 10, ISO 22000, 21 CFR Part 11, Codex HACCP. Selecting a regulation makes its tag appear in the spec and CoA fields.
- BRCGS version: select v9 / v10 (Issue 10). Note: "v10 (Issue 10) requires digital dashboards and trend charts per §3.11."
- Retention policy override table: rows per record type (quality_inspections, ncr_reports, haccp_monitoring_records) showing current `retention_until` formula and an override field (years). Defaults per PRD §5.2. Note: "Cannot reduce below regulatory minimum."

**Notifications tab:**

- Matrix of notification events × channels. Events: Inspection overdue, CCP deviation detected, NCR critical created, Hold created, Hold overdue (>3d), Allergen gate awaiting sign, Spec version expiring (30d warning). Channels: In-app, Email, Slack (if configured). Each cell is a toggle.
- CCP deviation escalation delay: numeric input in minutes. Default from `deviation_threshold_seconds` in rule. Note: "Adjust per OQ-QA-02 post-30-day P1 run."

**Retention tab:** Read-only display of the retention policy per table (as defined in PRD §5.2). A note: "Retention policies are configured in the database schema and cannot be changed from the UI. Contact your system administrator to change retention policies."

**Rules tab:** Read-only display of the three DSL rules registered by 09-QUALITY: `qa_status_state_machine_v1`, `ccp_deviation_escalation_v1`, `batch_release_gate_v1` (P2). Each rule shows: rule code, type, trigger, version, effective_from, and last 30-day evaluation count. A "View in 02-Settings Rule Registry →" link. No edit capability in the QA module; rules are edited in 02-SETTINGS §7.

---

## 4. Modals

---

### MODAL-HOLD-CREATE — Create Hold

**Trigger:** "+ Create Hold" on QA-002 or QA-001 quick action.  
**Width:** 560px. Max-height: 80vh, scrollable.  
**Title:** "Create Hold"

**Fields (in order):**

1. Hold target type (required): Radio button group, horizontal. Options: LP | Batch | Work Order | Purchase Order | GRN. Default: LP. Changing selection updates the search input below.

2. Reference search (required): Searchable input. Placeholder varies by type: "Search LP number…" / "Search batch or WO…" / "Search PO or GRN…". Live search with 300ms debounce. Results dropdown shows max 8 matches. Selected item shown as a chip. Validation: reference must exist (FK check) — V-QA-HOLD-002.

3. Hold reason (required): Grouped dropdown populated from `quality_hold_reasons` reference table (02-SETTINGS §8). Groups: Contamination | Temperature | Documentation | Specification Deviation | Allergen | Supplier | Other. Each option shows the reason label + default duration hint in grey: "default: {n} days". Selecting a reason pre-fills the "Estimated release" field.

4. Reason notes (conditionally required): Text area. Required if reason category = "Other". Placeholder "Describe the hold reason in detail…". Max 500 chars.

5. Priority (required): Four segmented buttons: Low (grey) | Medium (amber) | High (amber-dark) | Critical (red). Default value is inherited from the reason's default priority. Visual: each button has a coloured dot. Selecting Critical shows an amber warning: "Critical holds require the hold creator and release approver to be different users (segregation of duties — V-QA-HOLD-006)."

6. Disposition (optional at creation, required at release): Radio group: Pending | Rework | Scrap | Release as-is | Return to supplier | Other. Default: Pending. Help text: "You can set the disposition now or when releasing the hold."

7. Estimated release date: Date picker. Auto-calculated as `today + reason.default_hold_duration_days`. Editable. Min: today.

8. Affected LPs (multi-LP): If reference type is Batch or WO, a secondary LP picker appears allowing multiple LPs to be added to the hold via `quality_hold_items`. Shows a table: LP number | Qty (kg) | Add/remove. "Add LP" button opens a sub-search.

**Action bar:** "Cancel" (link) | "Create Hold" (primary). Creating a hold: POSTs to `/api/quality/holds`, writes LP `qa_status = HOLD` via 05-WH API, emits `quality.hold.created` outbox event, writes audit log entry. On success: toast "Hold HLD-{number} created. LP {reference} is now on hold." and modal closes. On error: inline error above the action bar.

**Validation summary:** If reference_id not found: "Reference {id} not found. Check the LP or WO number." If overlapping active hold: amber warning "An active hold already exists for this {type}. Do you want to create an additional hold? [Yes, create] [Cancel]" — V-QA-HOLD-003.

---

### MODAL-HOLD-RELEASE — Release Hold

**Trigger:** "Release" button on QA-002 or QA-002a.  
**Width:** 520px.  
**Title:** "Release Hold — {hold_number}"

**Content:** A summary card at the top showing hold number, reference, reason, days held, priority badge.

**Fields:**

1. Disposition (required if not already set): Same radio group as in MODAL-HOLD-CREATE. Validation: must not be "Pending" — V-QA-HOLD-005.
2. Release notes (required): Text area. Placeholder "Describe the reason for release and any conditions…". Min 10 chars. Max 1000 chars.
3. Release signature (required, e-sign): Below the notes field, a section titled "Electronic Signature (21 CFR Part 11)". Shows current user name, current timestamp (non-editable), and signature meaning: "Released". A PIN input field. Below: "Your PIN verifies your identity. This action will be permanently recorded in the audit trail." Help text: "If you are the same person who created this hold and priority = critical, this release will be blocked per segregation-of-duties policy (V-QA-HOLD-006)."

**Action bar:** "Cancel" | "Release Hold" (success style, disabled until PIN filled and disposition selected).

On success: toast "Hold {number} released. LP {reference} status updated to RELEASED." emits `quality.hold.released` event.

On segregation-of-duties violation: modal shows error "This hold was created by you. Critical holds must be released by a different user. Contact your Quality Lead."

---

### MODAL-SPEC-SIGN — Approve Specification (E-Signature)

**Trigger:** "Approve Specification" on QA-003b detail.  
**Width:** 480px.  
**Title:** "Approve Specification — {spec_code} v{n}"

**Content:** Summary: Product name, spec code, version, total parameters, critical parameters, effective from/until. Allergen profile snapshot preview (list of present allergens).

Validation check list (computed before showing modal): Each check shows a green tick or red cross:
- All parameters have test_method defined (V-QA-SPEC-002)
- Min ≤ target ≤ max for all measurement parameters (V-QA-SPEC-003)
- Approved_by role is quality_lead (V-QA-SPEC-005)

If any check is red, the "Approve" button is disabled and an error message lists the failures.

**E-signature fields:** Current user (read-only display), timestamp (server time, read-only), Signature meaning: "approved" (read-only), PIN input (required). Note: "Approving this specification will snapshot the current allergen profile from 03-Technical and create an immutable record. This action cannot be undone (21 CFR Part 11)."

**Action bar:** "Cancel" | "Approve Specification" (primary, disabled until PIN entered).

On success: toast "Specification approved. {spec_code} v{n} is now active." Previous active version (if any) is automatically superseded (V-QA-SPEC-004).

---

### MODAL-TEMPLATE-CREATE — Create / Edit Test Template

**Trigger:** "+ New Template" or "Edit" on QA-004.  
**Width:** 600px.  
**Title:** "New Test Template" or "Edit Test Template"

**Fields:** Template name (required), Category dropdown (Microbiological | Chemical | Physical | Sensory | Visual | Equipment), Parameters section (identical to Step 2 of QA-003a wizard — add/remove/reorder parameters).

**Action bar:** "Cancel" | "Save Template" (primary).

---

### MODAL-SAMPLE-DRAW — Draw Sample

**Trigger:** "Draw Sample" on QA-005a.  
**Width:** 480px.  
**Title:** "Draw Sample — {inspection_number}"

**Content:** Sampling plan summary card: plan code, AQL level, inspection level, lot size, required sample size, accept number, reject number. Progress: "{n} of {required} samples already drawn."

**Fields:** Number of samples to draw (numeric, max = remaining required samples), Sample locations (text area: describe where samples were taken from — e.g., "Pallet 1 position 3, Pallet 4 position 7"), Defects found during sampling (numeric, default 0), Notes.

AQL auto-decision display: as the inspector enters "Defects found", the form shows in real time: if defects_found ≤ accept_number → green "Accept" indicator; if defects_found ≥ reject_number → red "Reject" indicator; in between → amber "Inconclusive".

**Action bar:** "Cancel" | "Record sample draw" (primary).

On save: `sampling_records` row is inserted. `quality_inspections.samples_taken` is incremented. Toast: "Sample draw recorded. {n} samples taken."

---

### MODAL-NCR-CREATE — Create NCR

**Trigger:** "+ Create NCR" on QA-009, or automatically from QA-005a on fail submit (pre-filled in that case).  
**Width:** 600px.  
**Title:** "Create Non-Conformance Report"

**Fields:**

1. NCR type (required): Dropdown. Options: Quality | Yield issue | Allergen deviation | Supplier | Process | Complaint-related. Selecting "Yield issue" shows additional yield-specific fields (Target yield %, Actual yield %, Claim %, Claim value EUR) per V-QA-NCR-003. Selecting "Allergen deviation" shows an additional field "Link to allergen gate or CCP deviation" (required, V-QA-NCR-004).

2. Severity (required): Segmented buttons: Critical | Major | Minor. Each shows the auto-response due time: "Due within: 24h / 48h / 7 days." Regulation: "Response time per BRCGS Issue 10 §3.8" tag next to severity label.

3. Title (required): Text input. Max 200 chars.

4. Description (required): Text area. Min 20 chars. Max 2000 chars.

5. Source reference (optional): Type dropdown (Inspection | Hold | CCP deviation | Complaint | Supplier | Internal) + search input for the linked record ID.

6. Product (optional): Searchable dropdown from 03-TECHNICAL items.

7. Affected quantity (optional): Numeric input with kg unit.

8. Detected at (required): Date+time picker. Default: now.

9. Detected location: Text input. Max 100 chars.

10. Immediate action: Text area. Max 500 chars.

11. Assign to: User dropdown (quality_lead users). Optional.

**Validation:** Yield issue fields required when ncr_type=yield_issue. Allergen deviation link required when ncr_type=allergen_deviation.

**Action bar:** "Cancel" | "Save as draft" (secondary) | "Submit NCR" (primary). Submitting transitions status to `open` and computes `response_due_at` automatically.

On success: toast "NCR {number} created. Response due by {date}."

---

### MODAL-NCR-CLOSE — Close NCR

**Trigger:** "Close NCR" on QA-009a, quality_lead only.  
**Width:** 520px.  
**Title:** "Close NCR — {ncr_number}"

**Content:** Summary card (NCR title, severity, status). Pre-close checklist (computed): each check shows tick/cross: Root cause filled, Immediate action recorded, All linked holds resolved (warning if not), CAPA assigned (P2 — shown as informational only in P1).

**Fields:** Closure notes (required), Root cause (required if not already filled — V-QA-NCR-005), Root cause category dropdown.

For critical NCRs: a dual-signature block. First signature (quality_lead) and second signature (prod_manager) both required. Each signature block: user label, PIN input, "Sign" button. Both blocks must be signed before "Close NCR" is enabled (V-QA-NCR-006).

For non-critical NCRs: a single e-signature block.

**Action bar:** "Cancel" | "Close NCR" (success style, disabled until signatures provided).

On success: toast "NCR {number} closed. Closure recorded in audit trail."

---

### MODAL-CCP-READING — CCP Reading Entry

**Trigger:** "+ Record reading" on QA-014, or "Add reading" on QA-013.  
**Width:** 480px.  
**Title:** "Record CCP Reading"

**Fields:**

1. CCP selection (required): Dropdown grouped by HACCP plan. Shows: CCP code + step name + hazard type badge + monitoring frequency hint.

2. Measured value (required unless monitoring_method = 'observational'): Numeric input with unit from CCP definition displayed inline. Validation: number only. As the user types, a live indicator shows: if value is within [critical_limit_min, critical_limit_max], a green "Within limits" banner appears; if outside, a red "OUTSIDE CRITICAL LIMITS" banner appears prominently. This is computed client-side for immediate feedback (final `within_limits` is DB-computed).

3. Notes: Text area. Optional normally; required if value is outside limits to describe observation context.

4. Work Order link: Optional WO search. If a WO is active on the line where the CCP applies, it may be pre-filled.

5. Signature (required for biological/allergen hazard CCPs — V-QA-CCP-005): If the CCP's `hazard_type` is 'biological' or 'allergen', a signature block appears: user label, PIN input. If hazard is chemical or physical: signature is optional.

**Deviation warning:** If the value is outside limits and `deviation_threshold_seconds = 0`, a red alert appears: "This reading will trigger a CCP deviation. An NCR draft will be automatically created and the Hygiene Lead will be notified." If severity is critical (biological/allergen): "A critical CCP deviation will also auto-place the Work Order on hold."

**Action bar:** "Cancel" | "Record reading" (primary).

On success: toast "CCP reading recorded." If deviation triggered: "CCP deviation detected — NCR {number} auto-created. [View NCR]".

---

### MODAL-CCP-DEVIATION-LOG — Log CCP Deviation (Manual)

**Trigger:** "+ Log deviation manually" on QA-015.  
**Width:** 500px.  
**Title:** "Log CCP Deviation"

**Fields:** CCP selection, Observed value, Deviation description, Severity override (default auto-computed), Corrective action taken (required), Linked monitoring record (optional, search).

**Signature block** (required for biological/allergen deviations).

**Action bar:** "Cancel" | "Log deviation" (primary).

---

### MODAL-ESIGN — Generic E-Signature

**Trigger:** Any action requiring e-sign that doesn't have a dedicated modal.  
**Width:** 440px.  
**Title:** "Electronic Signature"

**Content:** User display name (read-only), timestamp (server clock, read-only), Action description (e.g., "Releasing hold HLD-00001234" or "Approving specification SPEC-001 v3"), Signature meaning (read-only text: approved / released / witnessed / counter_signed).

**Fields:** PIN input (required). 6-character PIN, masked. On PIN entry, a "Verify PIN" step fires `POST /api/auth/verify-pin` returning a `pin_proof` token (60s TTL). A spinner shows during verification. Success: green tick next to PIN input. Failure: red error "Incorrect PIN. {n} attempts remaining."

**Regulatory note:** "This signature is an electronic record per 21 CFR Part 11. A SHA-256 hash of your user ID, timestamp, and record content will be permanently stored."

**Action bar:** "Cancel" | "Sign" (primary, disabled until PIN verified).

---

### MODAL-ALLERGEN-DUAL-SIGN — Allergen Gate Second Sign

**Trigger:** "Sign as Quality Lead (2nd sign)" on QA-016.  
**Width:** 560px.  
**Title:** "Sign Allergen Changeover Gate — Second Signature"

**Content:** Gate evidence summary: WO pair, allergen delta, cleaning status, ATP result (RLU) vs threshold 10 RLU (red if above). First signature details (user + timestamp + meaning). Regulatory note: "Dual signature required per EU FIC 1169/2011 + Reg 2021/382 for allergen-free claims. V-QA-ALLERGEN-001."

ATP result validation: If `atp_result.rlu > pass_threshold (10)` and `risk_level ≥ medium`, the "Sign" button is disabled and a red block: "ATP result exceeds acceptable threshold ({value} RLU > 10 RLU). Approval blocked per V-QA-ALLERGEN-002. Override requires additional justification." An "Override" checkbox appears for quality_lead, which if checked opens an additional "Override justification" text area (required).

**E-signature fields (second signer):** User (read-only), timestamp, Signature meaning: "approved", PIN input.

**Action bar:** "Cancel" | "Sign (approve)" (success style) | "Reject gate" (danger, opens inline reason field).

---

### MODAL-AUDIT-EXPORT — Export Audit Trail

**Trigger:** "Export CSV" or "Export JSON" on QA-021.  
**Width:** 480px.  
**Title:** "Export Audit Trail"

**Content:** Date range selector (required, max range 1 year per export). Entity scope: All tables, or select one. User scope: All users, or select one. Format: CSV or JSON (toggle). A note: "Exports are timestamped and logged. Exporting audit records is itself an audit event. [Regulation: BRCGS Issue 10 §3.11.1]"

**Action bar:** "Cancel" | "Generate export" (primary). On click, a loading spinner and "Preparing your export…" message. When ready, a download link appears. Export filename format: `quality_audit_{table}_{date_from}_{date_to}_{timestamp}.{format}`.

---

### MODAL-DELETE-WITH-REASON — Delete with Audit Reason

**Trigger:** Any delete action on non-immutable records (e.g., draft spec, draft NCR, sampling plan).  
**Width:** 420px.  
**Title:** "Delete {entity}"

**Content:** "Are you sure you want to delete {entity} {identifier}? This action is recorded in the audit trail and cannot be undone for active or signed records."

**Fields:** Reason for deletion (required): Text area. Min 10 chars.

**Action bar:** "Cancel" | "Delete" (danger style).

---

## 5. Flows

### Flow 1 — Incoming Inspection: GRN → Pass → LP Released

1. Goods are received in 05-WAREHOUSE (GRN posted). The GRN receipt emits a `grn.received` outbox event.
2. 09-QUALITY's `grn_outbox_consumer` checks if the item has `inspection_required = true`. If yes, it auto-creates a `quality_inspections` row with `inspection_type = 'incoming'`, `status = 'pending'`, linked to the GRN ID, product ID, and the active spec for that product. The LP gets `qa_status = PENDING`.
3. The QA Dashboard (QA-001) KPI card "Inspection Backlog" increments. If the inspection is scheduled for today, the urgency indicator turns amber.
4. A QA Inspector opens the Incoming Inspections queue (QA-005) and sees the new pending inspection. They click "Assign to me" and then "Start inspection".
5. The inspection transitions to `in_progress`. The inspector is taken to QA-005a (inspection detail). They click "Draw Sample" and the MODAL-SAMPLE-DRAW opens. They record sample locations and defects. AQL auto-computes accept/reject.
6. The inspector enters measured values for each parameter in the parameters table. As each value is entered, the per-parameter result badge auto-updates (Pass/Fail). All parameters pass.
7. The overall result auto-computes as PASS. The inspector clicks "Submit & release LP".
8. If food-safety parameters are present, the MODAL-ESIGN opens. The inspector enters their PIN and clicks "Sign".
9. The inspection record is saved with `result = 'pass'`, `signed_at`, `signature_hash`. The LP `qa_status` is updated to `PASSED` via 05-WH PUT API. The outbox event `quality.inspection.completed` is emitted.
10. Toast: "Inspection submitted. LP {number} status updated to PASSED." The inspector is returned to the queue.

### Flow 2 — Incoming Inspection: Fail → Hold → NCR Auto-Created

1. Steps 1–5 identical to Flow 1.
2. One or more critical parameters fail (measured value outside min/max). The parameter result badge shows red "Fail". The overall result auto-computes as FAIL.
3. The "Fail reason" section appears. The inspector selects a reason code from the `qa_failure_reasons` dropdown and optionally adds notes.
4. An amber banner appears: "An NCR draft will be automatically created when you submit."
5. The inspector clicks "Submit & create hold".
6. MODAL-ESIGN opens for sign-off. PIN entered.
7. On submit: the inspection record is saved with `result = 'fail'`. An NCR draft is auto-created (`ncr_reports` row, `status = 'draft'`, linked to `inspection_id`). The LP `qa_status` is set to `FAILED`. A `quality_holds` row is created automatically with `hold_status = 'open'`, `reason_code_id` from the fail reason mapping.
8. Toast: "Inspection failed. NCR-{number} created. LP {number} is now on hold."
9. The Quality Lead is notified (in-app + email if critical). The NCR appears on QA-009 with status Draft. The Hold appears on QA-002.
10. The Quality Lead opens the NCR, adds investigation notes and root cause, then closes the NCR via MODAL-NCR-CLOSE. The hold is reviewed and released or the LP is scrapped/returned.

### Flow 3 — NCR Lifecycle

**Phase 1 (P1) simplified lifecycle:**

Draft → Open → Investigating → Closed (or Cancelled).

1. NCR is created (auto from inspection fail, or manually via MODAL-NCR-CREATE). Status: Draft.
2. Quality Lead reviews draft, clicks "Submit NCR" → status: Open. `response_due_at` is auto-computed (24h critical / 48h major / 7d minor). Notification fires to assigned user.
3. Investigator updates root cause and immediate action (QA-009a left column). Status transitions to Investigating via "Start investigating" button.
4. Quality Lead reviews investigation, confirms root cause is complete, clicks "Close NCR" → MODAL-NCR-CLOSE opens. Critical NCRs require dual sign.
5. On closure: `closed_at`, `closed_by`, `closure_signature_hash` are set. Audit event CLOSE is written to `quality_audit_log`.

**Phase 2 (P2) extension:** Between Investigating and Closed, a "Awaiting CAPA" stage with `capa_records` workflow (Epic 8G).

### Flow 4 — HACCP CCP Deviation → Auto-NCR → Corrective Action → Sign-off

1. Hygiene Lead opens QA-014 (CCP Monitoring) and clicks "+ Record reading".
2. MODAL-CCP-READING opens. They select CCP-01 "Pasteurisation Temp" (hazard_type = biological). They enter 68°C against a limit of 72–75°C. Immediately a red "OUTSIDE CRITICAL LIMITS" banner appears.
3. They enter a deviation note and their PIN to sign (required for biological hazard per V-QA-CCP-005). They click "Record reading".
4. The reading is saved with `within_limits = false`. The `ccp_deviation_escalation_v1` DSL rule fires: since `deviation_threshold_seconds = 0` for this CCP, it immediately auto-creates an NCR draft (`severity = 'critical'` because hazard_type = biological per the severity map in the rule definition) and also auto-places the associated Work Order on hold (auto_hold action). Notifications are sent to hygiene_lead, quality_lead, and prod_manager.
5. Toast: "CCP deviation recorded — NCR NCR-{number} auto-created (Critical). WO-{number} automatically placed on hold."
6. The Quality Lead and Hygiene Lead see the deviation on QA-015 (CCP Deviations list) with a red "Action required" badge.
7. The Hygiene Lead clicks "Add corrective action" on the deviation row (inline form): enters "Increased heating element temperature. Re-verified at 73°C after 15 minutes." Saves. The corrective action is appended to the monitoring record notes.
8. A second CCP reading is taken at 73°C (within limits). The next entry is accepted. The V-QA-CCP-004 block is lifted.
9. The Quality Lead signs off on the deviation record via MODAL-ESIGN. `signed_at` is set on the monitoring record.
10. The NCR is investigated and closed via MODAL-NCR-CLOSE. The auto-hold on the WO is released by the Quality Lead via QA-002 MODAL-HOLD-RELEASE.

### Flow 5 — Allergen Changeover Gate Dual Sign

1. In 08-PRODUCTION, a Work Order change from an allergen-containing product to an allergen-free product triggers the `allergen_changeover_gate_v1` rule. An `allergen_changeover_validations` record is created with `validation_result = 'pending_first_sign'`.
2. On the scanner (SCN-081), the Shift Lead logs in with PIN and scans the changeover validation. They verify the cleaning checklist is complete, enter the ATP result (manual entry in P1), and sign as first signer. The record is updated: `first_signed_by`, `first_signed_at`, `first_signature_hash`.
3. The record status changes to `pending_second_sign`. The Quality Lead receives an in-app notification: "Allergen gate for WO-{number} awaiting your second signature."
4. The Quality Lead opens QA-016 (Allergen Changeover Gates). The pending row shows an amber "Awaiting 2nd sign" badge.
5. They click the row to open the evidence drawer. They review: cleaning checklist, ATP result (e.g., 6 RLU ≤ 10 RLU threshold — green), first signature details.
6. They click "Sign as Quality Lead (2nd sign)" → MODAL-ALLERGEN-DUAL-SIGN opens with the full evidence summary.
7. ATP check passes (≤10 RLU, risk_level = medium). They enter their PIN and click "Sign (approve)".
8. The validation record is updated: `second_signed_by`, `second_signed_at`, `second_signature_hash`, `validation_result = 'approved'`. The `allergen_changeover_gate_v1` rule result is updated to approved, unblocking WO start.
9. Both signer columns on QA-016 now show `badge-signed`. Audit event SIGN is written twice (first sign + second sign).

### Flow 6 — Audit Trail Lookup

1. External auditor (role: `auditor_readonly`) logs in. They can access QA-021 (Audit Trail) directly from the sidebar.
2. They use the filter bar to select: Table = `allergen_changeover_validations`, Operation type = SIGN, Date range = last 12 months.
3. The filtered table shows all sign events on allergen changeover records. They expand a row to view old_data / new_data JSONB panels and verify signature_hash values.
4. They click "Export JSON" → MODAL-AUDIT-EXPORT opens. They enter the date range, select the table, choose JSON format, and click "Generate export".
5. A download link appears. The export includes all filtered events. The export action itself is written to `quality_audit_log` as an access event (access_type = 'export').

---

## 6. Empty / Zero / Onboarding States

### New installation (no data at all)

The QA Dashboard (QA-001) shows all KPI cards with value "—" and a blue onboarding banner: "Welcome to 09-Quality. Follow these steps to get started:" with a 4-step numbered checklist:

1. "Add product specifications" → button "Create specification" links to `/quality/specs/new`
2. "Configure sampling plans" → button "Set up sampling plans" links to `/quality/sampling`
3. "Set up HACCP plans" → button "Create HACCP plan" links to `/quality/haccp`
4. "Enable auto-inspection on GRN receipt" → button "Go to Quality Settings" links to `/quality/settings`

The Quick Actions bar shows all four buttons, but the first two ("+ New Inspection" and "+ Create NCR") are disabled with tooltip "Set up specifications first."

### Empty list states (per screen)

Every list screen has a specific empty state (described in each screen section above). Common pattern: centred icon, bold heading, one descriptive sentence (40–80 words), single primary CTA button. Icon choices: clipboard = specs/templates, padlock = holds, magnifying glass = inspections, document = NCR, clipboard with checkmark = HACCP.

### Onboarding per the PRD §14.3 (9-step QA onboarding)

When a new user with a QA role logs in for the first time and their `user_onboarding_progress` has no QA steps completed, a step-by-step guided overlay appears over the QA Dashboard. Steps follow the PRD §14.3 sequence: role explanation → PIN setup → scanner demo → dashboard tour → first inspection walkthrough → hold creation demo → NCR demo → HACCP demo → signature demo. Each step shows a highlighted region (overlay with cutout) and a tooltip card pointing to the relevant UI element. A "Skip tour" link is always available. Progress is stored in `user_onboarding_progress` (02-SETTINGS).

---

## 7. Notifications, Toasts, and Alerts

### Toast messages (bottom-right, 4 second auto-dismiss)

| Event | Type | Message |
|---|---|---|
| Hold created | Success | "Hold {number} created. {reference} is now on hold." |
| Hold released | Success | "Hold {number} released. LP status updated to RELEASED." |
| Inspection submitted (pass) | Success | "Inspection {number} submitted. LP {reference} is now PASSED." |
| Inspection submitted (fail) | Error | "Inspection {number} failed. NCR {number} created. LP {reference} on hold." |
| NCR created | Info | "NCR {number} created. Response due by {date}." |
| NCR overdue | Warning | "NCR {number} ({severity}) response is overdue. [View]" |
| CCP deviation detected | Error (persists) | "CCP deviation — {ccp_name}. Reading: {value} {unit}. NCR {number} auto-created. [View deviation]" |
| Spec approved | Success | "Specification {spec_code} v{n} approved and active." |
| Allergen gate pending | Warning | "Allergen gate for WO-{number} awaiting your second signature. [Sign now]" |
| Hold aging > 3 days | Warning | "Hold {number} has been open for {n} days. [Review]" |
| Export ready | Info | "Your audit export is ready. [Download]" |
| PIN error | Error | "Incorrect PIN. {n} attempts remaining." |
| Network error | Error | "Could not save. Check your connection. [Retry]" |

### Persistent in-app notifications (notification bell in top bar)

Notification types with their escalation rules:

- **CCP deviation (critical):** Red badge, high priority. Delivered to hygiene_lead + quality_lead + prod_manager. Not auto-dismissed until read. Message: "Critical CCP deviation: {ccp_name} at {time}. Corrective action required."
- **NCR overdue:** Amber badge. Delivered to assigned user + quality_lead. Message: "NCR {number} ({severity}) response overdue by {n}h."
- **NCR 7-day auto-escalation (V-QA-NCR-007):** Red badge. Auto-escalated to quality_director after 24h past `response_due_at + 24h` for all overdue NCRs. Message: "Escalation: NCR {number} is overdue by {n}h. Review required."
- **Allergen gate awaiting 2nd sign:** Amber badge. Delivered to quality_lead. Message: "Allergen gate for WO {number} awaits your approval."
- **Spec version expiring (30-day warning, configurable in QA-099 settings):** Blue badge. Message: "Specification {spec_code} expires on {date}. Create a new version before expiry."
- **Hold overdue (>configured duration):** Amber badge. Delivered to quality_lead + prod_manager.
- **Inspection overdue (urgency = overdue):** Red badge. Delivered to assigned inspector + quality_lead.

### Alert banners (inline on screens)

| Context | Style | Text |
|---|---|---|
| Spec not active on inspection | Amber (alert-amber) | "The assigned specification {code} is {status}. Assign an active spec before submitting results." |
| Spec version out of date | Amber | "A newer version of this specification exists (v{n}). Inspections against older versions are permitted but noted in audit trail." |
| Inspection overdue | Amber | "This inspection is overdue by {n} hours." |
| CCP reading outside limits | Red | "OUTSIDE CRITICAL LIMITS — deviation will be auto-recorded." |
| Allergen gate ATP above threshold | Red | "ATP result {n} RLU exceeds threshold (10 RLU). Approval blocked." |
| Regulation change detection | Blue | "BRCGS Issue 10 became effective. Review your specifications and HACCP plans for compliance. [Regulation settings]" |
| Record immutable (signed) | Grey-blue (info) | "This record is immutable. It was signed by {user} on {date}. 21 CFR Part 11." |
| Network offline | Red (persistent) | "You are offline. Changes will be saved locally and synced when reconnected." |

---

## 8. Responsive Notes

### Desktop (primary platform)

All screens in 09-QUALITY are designed primarily for desktop at 1280px and above. The sidebar is fixed at 220px. Main content area uses a max-width of 1400px, centred if viewport is wider. Tables use horizontal scroll if columns do not fit; a sticky left column (record number) is frozen during horizontal scroll. Modals are centred overlays with fixed width (420–600px as specified per modal).

### Tablet (768–1280px)

KPI grids collapse from 3 columns to 2 columns. Tables hide lower-priority columns (e.g., "Regulation tags", "Request ID", "IP address"). Filter bars collapse into a "Filters ▼" dropdown toggle. Modals scale to 90% viewport width. The HACCP plan tree in QA-013 collapses into a "Select plan ▼" dropdown above the detail area. The sidebar becomes a hamburger-triggered drawer.

### Mobile / shop floor (< 768px)

Desktop module screens are not the primary mobile experience for 09-QUALITY. Shop-floor sample entry is handled by 06-SCANNER (SCN-070..073, SCN-081). Mobile access to desktop screens is provided for emergency use: single-column layout, tables become cards with key-value rows, filters are accessed via a bottom sheet. Action bars become sticky fixed buttons at the bottom of the screen. Font sizes remain 13–14px (not scaled up for mobile; shop-floor kiosks use larger-scale CSS overrides in the Scanner module).

---

## 9. Open Questions for Designer

The following questions should be answered before finalising the HTML prototype. They are sourced from PRD §15.2 and design-specific additions:

1. **Hold reason colours (OQ-QA-01):** Final default hold duration values per reason category are pending post-UAT confirmation. Designer should use placeholder values (contamination=7d, temperature=2d, documentation=5d, allergen=7d, supplier=5d) for prototype.

2. **CCP timeline chart type:** PRD describes a "timeline with coloured dots" for the CCP monitoring chart. Should this be a dot-plot timeline, a scatter plot, or a continuous bar chart? Recommend dot-plot (each reading = one dot) for clarity, but confirm with Quality Lead before prototyping.

3. **HACCP plan canvas vs. table:** The archive wireframe (QA-013) described a left-tree/right-canvas layout. The PRD confirms this structure. Question: should the HACCP plan canvas show a process flow diagram (boxes connected by arrows representing process steps and CCPs) or a tabular CCP list? Recommend tabular for Phase 1 simplicity; process diagram in Phase 2.

4. **Dual-sign flow for allergen gate — mobile or desktop only?:** SCN-081 handles first sign (scanner). Second sign is on QA-016 (desktop). Should Quality Lead also be able to second-sign on mobile/scanner? The PRD implies desktop only; confirm with Quality Director.

5. **Regulatory tag display density:** Screens like QA-003b (spec detail) can have multiple regulation tags. With 6 possible regulations, the header area could become busy. Designer option: show first 2 tags inline, "+3 more" tooltip for the rest.

6. **NCR Kanban pipeline visualisation (QA-009):** The pipeline status bar described in section 3 is a design addition not in the original archive wireframes. Confirm whether this replaces or supplements the filter bar, or whether it should be an optional "Pipeline view" toggle.

7. **Audit trail JSON diff panel:** For very large JSONB records (e.g., quality_inspections with many test results), the expanded row diff panel could be very tall. Designer should consider a max-height collapsible panel with internal scroll, rather than expanding the table row indefinitely.

8. **E-signature PIN input styling:** Should the PIN input show masked dots (●●●●●●) or asterisks? Should it show a virtual keypad overlay on desktop for anti-keylogger protection? PRD §13.2 does not specify; recommend masked text input + tooltip "Your PIN is masked for security."

9. **Phase 2 placeholder screens — detail level:** QA-006, QA-007, QA-010, QA-011, QA-012 are Phase 2 placeholders. The prototype should show enough detail to communicate intent without being misleading. Recommend: blurred/greyed mockup table + info card, as described. Confirm whether a clickable "Request early access" CTA should be included.

10. **Overdue inspection colour escalation:** The spec uses red for overdue and amber for "due within 1 day." Confirm this is consistent with the Monopilot-wide convention used in 08-PRODUCTION and 05-WAREHOUSE for urgency escalation colours.

---

*End of 09-QUALITY UX Specification v1.0*
