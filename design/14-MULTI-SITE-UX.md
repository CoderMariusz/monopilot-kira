# 14-MULTI-SITE — UX Specification (for prototype generation)

**Version:** 1.0 | **Date:** 2026-04-20 | **Source PRD:** 14-MULTI-SITE-PRD v3.0
**Target:** Claude Design — interactive HTML prototypes
**Status:** Complete — self-contained. Build without asking questions.

---

## 0. Module Overview

Module **14-MULTI-SITE** introduces full multi-site (multi-plant) operations into MonoPilot MES. A single organization may have two or more physical sites (plants, warehouses, offices, co-packing facilities) that share master data at the org level while keeping operational data isolated per site via Row-Level Security (RLS). The flagship use case is Forza UK + KOBE EU operating as two sites under one MonoPilot org — shared products, BOMs, allergens, suppliers — with isolated work orders, license plates, stock, quality records, shifts, finance layers, and maintenance records.

**Key concepts the designer must understand:**

- **Global site selector** — a persistent dropdown in the top bar that lets multi-site users switch context. Single-site users never see it. Super-admins see an "All Sites" option. Every screen's data responds to this selector in real time.
- **Site as first-class dimension** — `site_id` is a second dimension alongside `org_id` on ~20 operational tables. When a user switches site, all list screens, dashboards, KPIs, and filters reload scoped to that site.
- **Activation state machine** — multi-site is not a simple ON/OFF flag. The feature flag `multi_site_enabled` progresses through: `inactive → wizard_in_progress → dual_run → activated`. Before reaching `activated`, the module is invisible or shows an onboarding prompt only to admins.
- **Inter-site Transfer (IST)** — neither a plain Transfer Order nor a Sales Order. It is a hybrid first-class document with its own state machine (draft → planned → shipped → in_transit → received → closed / cancelled), dual approval gates (from-site manager + to-site manager), and dual document generation (outbound shipping record on source + inbound GRN on destination).
- **Replication pattern** — master data changes at HQ (org level) propagate to all sites. The Replication Queue screen mirrors the DLQ pattern established in 03-TECHNICAL and 10-FINANCE.
- **Conflict resolution** — when a site holds a local variance of a replicated entity, the system flags a conflict and shows a field-level diff for the admin to resolve.

**Primary personas:**
- Group Operations Manager / Ops Director — all-sites consolidated view, cross-site benchmarking
- Site Manager — per-site dashboards, IST approval, site config override
- Supply Chain Planner — cross-site WO allocation, IST creation
- Warehouse Operator — send/receive ISTs, LP management scoped to one site
- Admin / Super-admin — site CRUD, permission matrix, activation wizard, replication config
- Auditor — read-only cross-site audit trail

**Build sub-modules:** 14-a (schema + RLS + activation wizard) → 14-b (IST state machine + outbox) → 14-c (site switcher UI) → 14-d (dashboards) → 14-e (migration + regression).

---

## 1. Design System (Inherited)

All values are taken verbatim from `MONOPILOT-SITEMAP.html` CSS variables and class definitions.

### 1.1 Color Tokens

| Token | Value | Use |
|---|---|---|
| `--blue` / primary | `#1976D2` | Primary actions, active sidebar, focus rings, active tab underline |
| `--green` | `#22c55e` | Success, active/synced/online states |
| `--amber` | `#f59e0b` | Warning, pending, stale, in-transit states |
| `--red` | `#ef4444` | Error, conflict, failed, offline states |
| `--info` | `#3b82f6` | Informational alerts and badges |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Global dark sidebar background |
| `--card` | `#ffffff` | Card and modal background |
| `--text` | `#1e293b` | Primary body text |
| `--muted` | `#64748b` | Secondary labels, table headers, timestamps |
| `--border` | `#e2e8f0` | Borders, dividers, table lines |
| `--radius` | `6px` | Cards, badges. Buttons 4px. Modals 8px. |

### 1.2 Typography

- **Font family:** Inter, system-ui, -apple-system, sans-serif
- **Base:** 14px / line-height 1.4
- **Page title:** 20px, font-weight 700
- **Section heading:** 12px, uppercase, font-weight 700, letter-spacing 0.08em, color `--muted`
- **Card title:** 14px, font-weight 600
- **Table header:** 12px, font-weight 600, color `--muted`, background `#f8fafc`
- **Table cell:** 13px, color `--text`
- **Form label:** 12px, font-weight 500, color `#374151`
- **Badge:** 11px, font-weight 500
- **Monospace (codes, IST numbers):** font-family monospace

### 1.3 Badge Palette (module-specific extensions + inherited)

**Inherited:**

| Class | Background | Text | Use |
|---|---|---|---|
| `badge-green` | `#dcfce7` | `#166534` | Active, synced, completed, online |
| `badge-amber` | `#fef3c7` | `#92400e` | Pending, in-transit, draft, stale |
| `badge-red` | `#fee2e2` | `#991b1b` | Failed, conflict, cancelled, offline |
| `badge-blue` | `#dbeafe` | `#1e40af` | Info, plant-type |
| `badge-gray` | `#f1f5f9` | `#475569` | Office-type, neutral, archived |

**Module-specific extensions:**

| Badge purpose | CSS class | Background | Text | Use |
|---|---|---|---|---|
| Site type: Plant | `badge-blue` | `#dbeafe` | `#1e40af` | Production plant sites |
| Site type: Warehouse | `badge-green` | `#dcfce7` | `#166534` | Pure warehouse sites |
| Site type: Office | `badge-gray` | `#f1f5f9` | `#475569` | Administrative sites |
| Site type: Co-pack | `badge-amber` | `#fef3c7` | `#92400e` | Co-packing facility |
| Replication: Synced | `badge-green` | `#dcfce7` | `#166534` | Entity matches source |
| Replication: Pending | `badge-blue` | `#dbeafe` | `#1e40af` | Queued, not yet applied |
| Replication: Conflict | `badge-red` | `#fee2e2` | `#991b1b` | Local variance detected |
| Lane health: Active | `badge-green` | `#dcfce7` | `#166534` | Lane has recent successful TOs |
| Lane health: Stale | `badge-amber` | `#fef3c7` | `#92400e` | No TO in > 30 days |
| Lane health: Failed | `badge-red` | `#fee2e2` | `#991b1b` | Last TO had logistics failure |
| IST: Draft | `badge-gray` | `#f1f5f9` | `#475569` | Initial creation |
| IST: Planned | `badge-blue` | `#dbeafe` | `#1e40af` | Approved, awaiting ship |
| IST: Shipped | `badge-amber` | `#fef3c7` | `#92400e` | Left source site |
| IST: In Transit | `badge-amber` (pulsing) | `#fef3c7` | `#b45309` | Cross-site physical transit |
| IST: Received | `badge-blue` | `#dbeafe` | `#1e40af` | GRN completed at destination |
| IST: Closed | `badge-green` | `#dcfce7` | `#166534` | Finance posted, audit complete |
| IST: Cancelled | `badge-red` | `#fee2e2` | `#991b1b` | Cancelled with reason |
| Activation: Inactive | `badge-gray` | `#f1f5f9` | `#475569` | Single-site mode |
| Activation: Wizard in progress | `badge-amber` | `#fef3c7` | `#92400e` | Wizard started, not complete |
| Activation: Dual run | `badge-blue` | `#dbeafe` | `#1e40af` | Sites created, RLS not yet swapped |
| Activation: Activated | `badge-green` | `#dcfce7` | `#166534` | Full multi-site live |

### 1.4 Layout

- **Fixed left sidebar:** 220px wide, `--sidebar` background, sticky full-height
- **Main content area:** margin-left 220px, padding 40px 20px 20px, background `--bg`
- **Active sidebar item:** background `#1e3a5f`, color `#fff`, border-left 3px solid `--blue`
- **Sidebar item hover:** background `#334155`, color `#f1f5f9`
- **Sub-items (sidebar-subitem):** 12px, color `#94a3b8`, indent 28px from parent
- **Modal:** overlay `rgba(0,0,0,0.5)`, box `background #fff`, border-radius 8px, width 560px (standard) / 760px (diff modal), max-height 80vh, overflow-y auto, padding 20px
- **KPI card:** white background, 1px border `--border`, border-radius 6px, padding 12px 14px, border-bottom 3px solid accent. Label 11px muted. Value 26px bold. Change note 11px.
- **Table:** width 100%, border-collapse collapse, 13px. Header background `#f8fafc`, 2px bottom border. Row hover `#f8fafc`. Cell padding 7px 10px.
- **Tabs:** border-bottom 2px `--border`. Active tab: color `--blue`, border-bottom-color `--blue`, font-weight 600.
- **Alerts/banners:** padding 10px 14px, border-radius 6px, border-left 4px solid, 12px font. `.alert-red`, `.alert-amber`, `.alert-blue`, `.alert-green`.
- **Tree items (.tree-item):** l0 = no indent, bold, no border. l1 = 16px left padding, left border 1px `--border`. l2 = 32px. l3 = 48px. Used for site hierarchy and network tree panels.

### 1.5 Global Site Selector (foundational component)

The site selector is a persistent control in the application top bar, positioned between the organization logo and the user-avatar menu. It appears only when `organizations.multi_site_state = 'activated'` AND the current user has access to more than one site (or is super-admin).

**Visual design:** A compact dropdown trigger showing "Site: [Site Name]" in 13px bold, with a down-chevron icon. Background white, border 1px `--border`, border-radius 4px, padding 5px 10px. When hovered: background `#f8fafc`. When open: border-color `--blue`.

**Dropdown panel:** Appears directly below the trigger, min-width 220px, max-width 320px, white background, border 1px `--border`, border-radius 6px, shadow `0 4px 12px rgba(0,0,0,0.1)`. Sections:

- If super-admin: first item "All Sites" with globe icon. Selecting this sets scope to aggregated.
- List of sites the user has access to: each row shows site code (monospace, 80px, `--muted`), site name (bold), site type badge. Currently selected site shows a checkmark right-aligned.
- Footer: "Manage Sites →" link navigating to `/multi-site/sites` (visible to admin only).

**Behavior when selecting a site:** Triggers an API call with `x-site-id` header set to the new site's UUID. LocalStorage key `mp_site_context` updated. The full application data (dashboards, lists, KPIs) reloads scoped to that site within 500ms (APM target per D-MS-6). A subtle toast appears: "Switched to [Site Name]." for 2 seconds.

**Behavior in "All Sites" scope:** Data-filtered screens (LP list, WO list, GRN, etc.) show an additional "Site" column. KPI cards show aggregated totals across all sites, with a secondary line showing "across X sites." Screens that are site-exclusive (e.g., site-specific config) are hidden or disabled with tooltip "Select a single site to access this screen."

**Single-site users:** The selector is hidden entirely. The top bar shows the site name as static text (not a dropdown), e.g., "Site: Forza Warsaw" in muted text.

**No site context (multi-site, user just logged in):** If `primary_site` is set in `site_user_access`, it is auto-selected silently. If no primary is set (edge case), a full-page modal appears: "Select Your Site to Continue" — list of accessible sites, `btn-primary` "Select Site," checkbox "Remember as primary site."

---

## 2. Information Architecture

### 2.1 Sidebar Entry

The Multi-Site module appears at the bottom of the sidebar under the group label **NEW**, with icon 🌐 and label **Multi-Site**. Its ID in the module registry is `multisite`.

When the multi-site module is in `inactive` state, the sidebar entry is hidden for all non-admin users. For admin users, it shows with a `badge-amber` "Setup" badge, linking directly to the activation wizard.

When activated, the sidebar entry expands to reveal sub-items on click.

**Sidebar sub-items** (12px, indent 28px, color `#94a3b8`):

- Dashboard
- Sites
- Transfers
- Master Data Sync
- Transport Lanes
- Replication Queue
- Permissions
- Analytics
- Settings

### 2.2 Route Map

| Screen ID | Route | Screen Name |
|---|---|---|
| MS-NET | `/multi-site` | Network Dashboard |
| MS-SIT | `/multi-site/sites` | Sites List |
| MS-SIT-D | `/multi-site/sites/:id` | Site Detail |
| MS-IST | `/multi-site/transfers` | Inter-Site Transfers List |
| MS-IST-D | `/multi-site/transfers/:id` | Inter-Site Transfer Detail |
| MS-IST-N | `/multi-site/transfers/new` | IST Create |
| MS-MDS | `/multi-site/master-data` | Master Data Sync |
| MS-LANE | `/multi-site/lanes` | Transport Lanes List |
| MS-LANE-D | `/multi-site/lanes/:id` | Transport Lane Detail |
| MS-REP | `/multi-site/replication` | Replication Queue |
| MS-PRM | `/multi-site/permissions` | Site Permissions Matrix |
| MS-ANA | `/multi-site/analytics` | Multi-Site Analytics |
| MS-CFG | `/multi-site/settings` | Multi-Site Module Settings |
| MS-ACT | `/multi-site/activate` | Activation Wizard |

### 2.3 Permissions Matrix

| Action | super_admin | admin | ops_director | site_manager | planner | warehouse_operator | auditor |
|---|---|---|---|---|---|---|---|
| View network dashboard | Yes | Yes | Yes | Yes (own site) | Yes | No | Yes (read) |
| Create / edit site | Yes | Yes | No | No | No | No | No |
| Decommission site | Yes | Yes | No | No | No | No | No |
| View sites list | Yes | Yes | Yes | Yes | Yes | No | Yes |
| Create IST | Yes | Yes | No | Yes (own site) | Yes | Yes | No |
| Approve IST (from-site) | Yes | Yes | No | Yes (own site) | No | No | No |
| Approve IST (to-site) | Yes | Yes | No | Yes (own site) | No | No | No |
| Cancel IST | Yes | Yes | No | Yes (own site) | No | No | No |
| View IST list | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| View master data sync | Yes | Yes | Yes | Yes (read) | No | No | Yes |
| Resolve conflict | Yes | Yes | No | No | No | No | No |
| Create / edit transport lane | Yes | Yes | No | No | No | No | No |
| View transport lanes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| View replication queue | Yes | Yes | Yes | No | No | No | Yes |
| Retry / cancel replication job | Yes | Yes | No | No | No | No | No |
| Manage site permissions | Yes | Yes | No | No | No | No | No |
| View analytics | Yes | Yes | Yes | Yes (own site data) | Yes (read) | No | Yes |
| Edit multi-site settings | Yes | Yes | No | No | No | No | No |
| Run activation wizard | Yes | Yes | No | No | No | No | No |

**Permission-denied state (all screens):** Show an inline full-width `alert-red` banner: "You do not have permission to access this page. Contact your administrator." with a `btn-secondary` "Go to Dashboard" button. Never show a blank page.

**Out-of-scope state (user lacks access to a specific site):** When a URL references a `site_id` the user's `site_user_access` does not include, show the same `alert-red` banner: "You do not have access to [Site Name]. Contact your administrator to request access." Never expose data from sites outside the user's access list.

---

## 3. Screens

---

### MS-NET — Network Dashboard

**Screen ID:** MS-NET
**Route:** `/multi-site`
**Purpose:** Single-glance health view of the entire multi-site network. This is the landing screen for ops directors, group managers, and admins. It shows the aggregate status of all sites, active inter-site transfers, replication conflicts, and key KPIs — refreshing every 60 seconds with a manual refresh button in the page header.

#### Layout

The page uses the standard full-width main area (220px left offset). At the top is a page title row containing the title "Network Dashboard," a breadcrumb "Multi-Site / Dashboard," a `btn-secondary` "Refresh" button with a clock icon, and a timestamp showing "Last updated [time]." Below the title row is the KPI card strip. Below the KPI strip is a two-column layout: the left column (65% width) holds the Network View panel; the right column (35%) holds the Active Transfers feed and the Replication Status panel.

#### KPI Card Strip (five cards in a single row, `kpi-row` class)

1. **Sites Online** — count of `sites WHERE active=true`. Accent: `--green`. Example: `4`. Change: "of 4 total". Clicking navigates to `/multi-site/sites`.
2. **Transfers In Transit** — count of `transfer_orders WHERE state IN ('shipped','in_transit')`. Accent: `--amber`. Example: `3`. Change: "2 overdue ETA". Clicking navigates to `/multi-site/transfers`.
3. **Replication Conflicts** — count of unresolved conflicts across all sites. Accent: `--red`. Example: `1`. Change: "1 requires action". Clicking navigates to `/multi-site/replication`.
4. **Aggregated Inventory Value** — sum of `cross_site_summary.inventory_value` across all sites. Accent: `--blue`. Example: `£2.4M`. Change: "↑ 3% vs last week". Visible only to admin / ops_director roles — shows `—` for other roles.
5. **Avg Throughput (7d)** — aggregate of shipped IST items over the last 7 days. Accent: `--blue`. Example: `1,240 units/day`. Change: "across all sites".

#### Network View Panel (left column)

A card with title "Network Overview" and two view-toggle buttons: "Tree View" (active by default) and "Map View" (P2, shows `badge-amber "Soon"` if not available).

**Tree View (default):** Renders the site hierarchy using `.tree-item` classes. The root node at level l0 shows the organization name in bold. Each active site is a l1 `.tree-item` row showing: site-type icon (🏭 plant, 🏢 warehouse, 🏬 office, 📦 co-pack) + site code in monospace + site name in bold + site type badge + status dot (green dot = online, red dot = offline, amber dot = degraded). Clicking a site row navigates to `/multi-site/sites/:id`. Below each site l1 row, if the site has sub-plants or lines configured via `sites_hierarchy_config`, they appear as l2 `.tree-item` rows showing the plant/building name and l3 for production lines, using the tenant's configured `level_names`.

Each site row also shows a secondary line of KPIs in 13px muted text: "WO Active: [n] | Holds: [n] | Inv: £[n]" — sourced from `cross_site_summary` MV, refreshed hourly.

**Map View (P2):** Shows a stylized geographic map with site pins. Pin color matches site status. Clicking a pin opens a mini-popover with site name, status, and a "View Site" link. The map library choice is deferred (see Section 9).

#### Active Transfers Feed (right column, top)

Card titled "Active Transfers" with a `btn-secondary "View All"` link to `/multi-site/transfers`. Lists the 5 most recent non-closed, non-cancelled transfer orders. Each item is a `.tl-item` timeline entry:

- Colored dot: amber (in_transit), blue (shipped), blue (planned)
- Left text: `[IST#]` in monospace — from-site-code `→` to-site-code — status badge
- Right text: ETA in relative time ("in 2d", "overdue by 1d" in red)
- Second line: item count, e.g., "3 items · 240 kg"

If no active transfers: "No active transfers. All clear." with a green checkmark icon.

#### Replication Status Panel (right column, bottom)

Card titled "Replication Health." Shows a compact 3-row summary: synced count (green badge), pending count (blue badge), conflict count (red badge). Below: last successful full replication timestamp. A `btn-secondary "View Queue"` link navigates to `/multi-site/replication`. If conflicts > 0, shows an `alert-red` strip: "X conflicts require manual resolution."

#### States

**Loading:** Full-page skeleton with shimmer on all 5 KPI cards, network tree card, transfers feed, and replication panel.

**Empty (no sites yet — activation not complete):** Replace all content below the page title with a centered card (max-width 560px): illustration of a network icon, heading "Set Up Your Multi-Site Network," subtitle "Add your first sites to start managing distributed operations across locations," `btn-primary "Start Activation Wizard"` → `/multi-site/activate`, `btn-secondary "Learn More"` → help article link.

**Populated:** All panels show live data.

**Error (API failure):** `alert-red` banner below KPI strip: "Failed to load network dashboard. [Retry button]." KPI cards show `—` with red accent.

**Single-site mode (activation = inactive):** Admin sees: `alert-amber` "Multi-Site is not activated. Enable it to manage multiple plant locations." with `btn-primary "Activate Multi-Site"` → `/multi-site/activate`. Non-admins: this page is not accessible (sidebar entry hidden).

#### Microcopy

Page subtitle: "Monitor the health and activity of your entire site network in real time." Refresh button tooltip: "Data refreshes every 60 seconds automatically." Inventory value tooltip (if hidden for role): "Inventory value is visible to admins and operations directors only."

---

### MS-SIT — Sites List

**Screen ID:** MS-SIT
**Route:** `/multi-site/sites`
**Purpose:** View, search, filter, and manage all registered sites for the organization. Admin creates new sites here. Non-admin users with access can view.

#### Layout

Standard full-width main area. Page title "Sites" with breadcrumb "Multi-Site / Sites." Action bar below title: left side holds a search input (placeholder "Search site name or code…," 280px wide, magnifying-glass icon left), a Type filter dropdown (All Types / Plant / Warehouse / Office / Co-pack), a Status filter (All / Active / Inactive). Right side: `btn-primary "+ Add Site"` → opens MODAL-SITE-CREATE (admin only, hidden for other roles). Below the action bar: the data table.

#### Table Columns

| Column | Type | Width | Example | Notes |
|---|---|---|---|---|
| Site Code | monospace text | 90px | `FRZ-UK` | Unique per org, uppercase |
| Name | text bold | 180px | `Forza Warsaw` | Link → `/multi-site/sites/:id` |
| Type | badge | 110px | `Plant` | badge-blue, badge-green, badge-gray, badge-amber per type |
| Country / TZ | text | 150px | `UK / Europe/London` | Country flag emoji + IANA timezone abbreviation |
| Status | badge | 90px | `Active` | badge-green Active, badge-gray Inactive |
| Last Sync | relative time | 110px | `4 min ago` | Timestamp of last successful replication run |
| Owner | user avatar + name | 130px | `J. Smith` | Site manager assigned; "—" if unassigned |
| Modules Enabled | count badge | 90px | `8 of 15` | Tooltip lists enabled module names |
| Users | number | 70px | `12` | Count from `site_user_access WHERE active=true` |
| Actions | icon buttons | 80px | ✏️ ⋮ | Edit (opens MODAL-SITE-EDIT); ⋮ menu: View, Decommission |

#### Row Actions (⋮ menu)

- **View** — navigates to `/multi-site/sites/:id`
- **Edit** — opens MODAL-SITE-EDIT (admin only)
- **Decommission** — opens MODAL-SITE-DECOMMISSION (admin only; disabled if site is `is_default=true`, tooltip "Cannot decommission the default site")

#### States

**Loading:** 4 skeleton rows.

**Empty (no sites):** Centered illustration of a building, heading "No sites configured," subtitle "Add your first site to start managing multi-site operations." `btn-primary "+ Add Site"` button (admin only). Non-admin sees: "No sites have been configured yet. Contact your administrator."

**Empty (filtered):** "No sites match your filters. [Clear filters link]."

**Populated:** Table with pagination (25 rows/page) and row count footer.

**Error:** `alert-red` "Failed to load sites. Retry."

**Permission-denied:** Read-only users see the table without the `+ Add Site` button and without the Edit/Decommission actions in the ⋮ menu.

#### Microcopy

Search placeholder: "Search site name or code…" No-results: "Try a different search term or check the type filter." Footer: "Showing X of Y sites."

---

### MS-SIT-D — Site Detail

**Screen ID:** MS-SIT-D
**Route:** `/multi-site/sites/:id`
**Purpose:** Full record for one site: identity, operational snapshots, users, config overrides, inbound/outbound transfers, local holidays calendar, and documents. This is the primary management screen for a site manager.

#### Layout

Full-width main area. Page title shows the site name (20px bold) with the site code in monospace and site type badge next to it. Below the title: breadcrumb "Multi-Site / Sites / [Site Name]." A row of 3 quick-action buttons sits to the right of the title: `btn-secondary "Edit Site"` (admin only), `btn-secondary "Switch to this Site"` (sets the global site selector to this site), `btn-danger "Decommission"` (admin only, disabled if default). Below the title area: horizontal tab bar.

#### Tabs

**Tab 1 — Overview**

Two-column layout. Left column: a "Site Identity" card with fields displayed as read-only label-value pairs:

- Site Code: `FRZ-UK` (monospace)
- Legal Entity: `Forza Foods Ltd` (or "—")
- Country: `United Kingdom`
- Timezone: `Europe/London (UTC+0 / BST UTC+1)`
- Default Currency: `GBP`
- Data Residency Region: `eu-west-2` with a `badge-blue "P1"` indicator (or `badge-amber "P2 Override"` if a per-site override is set)
- Hierarchy Level: shows the 3-level chain per `sites_hierarchy_config.level_names`, e.g., "Site → Plant → Line"
- Default Site: yes/no badge (if `is_default=true`, shows `badge-blue "Default"`)
- Activation Date: formatted date or "Not yet activated"
- Created: formatted date + created-by user name

Right column: a "Status" card with: current status badge (Active/Inactive), online indicator (green dot "Online" / red dot "Offline"), last seen timestamp. Below: a 4-card mini-KPI strip (2×2 grid inside the card): Active WOs, Quality Holds, Inventory Value, Avg Availability (7d). All sourced from `cross_site_summary` MV. Values link to their respective module screens scoped to this site.

**Tab 2 — Config (L2 Overrides)**

This tab surfaces the per-site configuration overrides. It links directly to the L2 config pattern from 02-SETTINGS §9 (ADR-031). The tab is accessible only to admin and site manager roles.

Layout: an `alert-blue` banner at the top: "These settings override the L1 baseline for this site only. Changes take effect immediately on next request. [View base config in Settings →]"

A table of `site_settings` rows for this site:

| Column | Type | Notes |
|---|---|---|
| Setting Key | monospace | e.g., `shift_pattern`, `fefo_strategy`, `default_currency`, `language` |
| L1 Base Value | text/code | The org-level default from 02-SETTINGS (shown in muted gray) |
| Site Override Value | text/code | The `l2_override` value, shown in `--text` if set |
| Source | badge | `badge-gray "Base"` if no override, `badge-blue "L2 Override"` if overridden |
| Last Updated | relative time | From `site_settings.updated_at` |
| Updated By | user name | From `site_settings.updated_by` |
| Actions | buttons | "Edit" (opens MODAL-SITE-CONFIG-OVERRIDE) + "Clear Override" (resets to L1 base; confirm dialog) |

Above the table: `btn-primary "+ Add Override"` → opens MODAL-SITE-CONFIG-OVERRIDE for a new key.

Empty state: "No L2 overrides configured. This site uses all baseline settings from the organization." `btn-primary "+ Add Override"`.

**Tab 3 — Inventory Snapshot**

Read-only panel linking to 05-WAREHOUSE scoped to this site. Shows a summary card: Total Active LPs, Total Stock Value, Locations Count. A `btn-secondary "Open Warehouse for [Site Name]"` button navigates to `/warehouse?site_id=[id]` with the site selector pre-set. The snapshot data is pulled from `cross_site_summary.inventory_value` and rendered as 3 KPI mini-cards. Below: a small table of top-5 items by quantity on hand, columns: Item Code, Item Name, Qty on Hand, Unit, Site. A `btn-secondary "View Full Inventory"` link navigates to `/warehouse/inventory?site=[code]`.

**Tab 4 — Production Snapshot**

Similar pattern to Tab 3 but for 08-PRODUCTION. Shows: Active WOs, WOs Completed (last 7d), WIP Value. Links to `/production?site_id=[id]`. Shows a mini-table of 5 most recent work orders with: WO#, Product, Status badge, Planned Qty, Site. `btn-secondary "Open Production for [Site Name]"`.

**Tab 5 — Users**

List of users assigned to this site via `site_user_access`. Layout: action bar with `btn-primary "+ Assign User"` → opens MODAL-PERMISSION-BULK-ASSIGN. Table columns:

| Column | Notes |
|---|---|
| Name | Avatar + full name |
| Email | 13px muted |
| Role (at this site) | badge-blue for manager roles, badge-gray for operator |
| Primary Site | `badge-green "Primary"` badge if `is_primary=true` for this user, else "—" |
| Granted At | relative time |
| Granted By | user name |
| Actions | "Edit Role" + "Remove from Site" (opens MODAL-CONFIRM-REMOVE-USER-SITE) |

Empty state: "No users assigned to this site. Assign users to grant them access."

**Tab 6 — Transfers**

Split into two sub-tabs: "Outbound" and "Inbound." Each sub-tab is a filtered view of `/multi-site/transfers` table (compact version, 5 columns): IST# | To/From Site | Status badge | Shipped Date | ETA. A `btn-secondary "View All Transfers"` link at the bottom navigates to the full IST list filtered to this site. Empty state: "No transfers for this site."

**Tab 7 — Calendar**

A monthly calendar view showing site-specific local holidays (sourced from `site_settings WHERE setting_key='local_holidays'`). Days with holidays show a dot indicator; hovering shows the holiday name tooltip. Navigation arrows for previous/next month. `btn-secondary "+ Add Holiday"` → opens a simple modal (date picker + holiday name + type: public/company). Admin only.

**Tab 8 — Docs**

A simple document attachment list for site-level documents (certificates, floorplans, compliance docs). Columns: File Name | Type | Uploaded By | Uploaded At | Actions (Download, Delete). `btn-secondary "+ Upload Document"`. Max file size 50MB. Accepts PDF, DOCX, XLSX, PNG, JPG.

#### States

**Loading:** Skeleton on title area and first visible tab content.

**Populated:** All tabs render with live data.

**Error:** `alert-red` "Failed to load site details. Retry."

**Permission-denied:** Tabs visible, but Config tab shows read-only values (no Edit buttons) for non-admin users. Decommission button hidden.

#### Microcopy

Config tab banner: "Site overrides apply only to [Site Name]. Other sites are unaffected." Override table: "L1 Base" column header tooltip: "The organization-wide default value from 02-SETTINGS." Transfers tab empty: "When inter-site transfers are created for this site, they appear here."

---

### MS-IST — Inter-Site Transfers List

**Screen ID:** MS-IST
**Route:** `/multi-site/transfers`
**Purpose:** Unified list of all inter-site transfer orders across the network. Planners, site managers, and warehouse operators consult this list daily to track goods in transit between sites.

#### Layout

Full-width main area. Page title "Inter-Site Transfers" with breadcrumb. Action bar: left side has search input (placeholder "Search IST number, site, or item…"), Route filter dropdown (All Routes / per-lane e.g., "FRZ-UK → FRZ-DE"), Status filter (All / Draft / Planned / Shipped / In Transit / Received / Closed / Cancelled), Date range picker (shipped date range). Right side: `btn-primary "+ New Transfer"` → `/multi-site/transfers/new` (planner, site manager, admin roles only). `btn-secondary "Export CSV"`.

#### Table Columns

| Column | Type | Width | Example | Notes |
|---|---|---|---|---|
| IST # | monospace link | 100px | `IST-0042` | Links to `/multi-site/transfers/:id` |
| From | site badge | 130px | `FRZ-UK Plant` | Site code + name, truncated |
| To | site badge | 130px | `FRZ-DE Warehouse` | Site code + name |
| Status | badge | 110px | `In Transit` | Color per palette in §1.3 |
| Shipped Date | date | 100px | `Apr 18` | `—` if not yet shipped |
| ETA | date + color | 110px | `Apr 20` | Red if past ETA, amber if today, green if future |
| Lane | monospace | 90px | `LN-001` | Transport lane code; link to lane detail |
| Items | count | 70px | `4 items` | Count of line items in the IST |
| Freight Cost | currency | 100px | `£340` | `—` if `cost_allocation_method='none'`; hidden for operators |
| Actions | icon buttons | 70px | 👁️ ⋮ | View, ⋮: Amend (if draft/planned), Cancel |

#### Row Action Menu (⋮)

- **View** — navigates to `/multi-site/transfers/:id`
- **Amend** — opens MODAL-IST-AMEND (only if status = draft or planned)
- **Cancel** — opens MODAL-IST-CANCEL (only if status ≠ closed, ≠ cancelled; requires site manager role)

#### Status-Row Visual Cue

`in_transit` rows show a subtle animated amber left border (2px, pulsing CSS animation at 1.5s) to draw attention to items physically moving.

#### States

**Loading:** 5 skeleton rows.

**Empty (no transfers):** Centered icon of two buildings with arrow, heading "No transfers yet," subtitle "Create your first inter-site transfer to move goods between sites." `btn-primary "+ New Transfer"`.

**Empty (filtered):** "No transfers match your filters. [Clear filters link]."

**Populated:** Paginated table (25 rows/page). Total count footer. Overdue transfers (ETA < today, status ≠ received/closed/cancelled) shown with `badge-red` overdue indicator in ETA column.

**Error:** `alert-red` "Failed to load transfers. Retry."

**Global Site Selector = "All Sites":** Table shows data from all sites the user can access. Site columns are always visible. Filter bar adds a "From Site" and "To Site" filter.

**Global Site Selector = single site:** Table pre-filters to transfers where `from_site_id = current_site OR to_site_id = current_site`. Filter bar hides the site filters.

#### Microcopy

Status tooltip on `in_transit` badge: "Goods are physically in transit between sites. Awaiting receipt scan at destination." ETA tooltip if overdue: "This transfer is overdue. Expected arrival was [date]. Contact the carrier or the from-site." Freight cost hidden tooltip (operators): "Freight cost details are visible to planners and managers."

---

### MS-IST-N — Inter-Site Transfer Create

**Screen ID:** MS-IST-N
**Route:** `/multi-site/transfers/new`
**Purpose:** Create a new inter-site transfer. This is a single-page form (not a wizard) but with progressive disclosure. On save, the system auto-generates an outbound shipping record on the from-site and an inbound GRN placeholder on the to-site. Source LPs are hard-locked on creation.

#### Layout

Full-width main area with page title "New Inter-Site Transfer" and breadcrumb "Multi-Site / Transfers / New." `btn-secondary "Cancel"` (navigates back to list) in page header right. The form is organized in a card with internal sections separated by horizontal dividers.

#### Section 1 — Route (required first)

Two side-by-side site picker fields, each showing a searchable dropdown:

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| From Site | searchable select | Yes | must be an active site user has access to; must differ from To Site | `FRZ-UK — Forza Warsaw Plant` |
| To Site | searchable select | Yes | must be a different active site | `FRZ-DE — KOBE Germany Warehouse` |

Selecting From Site auto-populates the Transport Lane field below (suggests the default lane between the two sites). An inline informational line appears: "Route: FRZ-UK → FRZ-DE | Default Lane: LN-001 | Avg Lead Time: 2 days."

#### Section 2 — Transport

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| Transport Lane | searchable select | No (auto-suggested) | must be an active lane between chosen sites | `LN-001 — Road via DHL` |
| Planned Ship Date | date picker | Yes | must be ≥ today | `2026-04-22` |
| Expected Arrival (ETA) | date picker | Yes | must be > Planned Ship Date; auto-calculated if lane has avg lead time set | `2026-04-24` |
| Carrier Reference | text | No | max 100 chars | `DHL-789012` |
| Freight Cost (£) | number | No | ≥ 0, 2 decimal places | `340.00` |
| Cost Allocation Method | select | Yes if Freight Cost > 0 | sender / receiver / split / none | `receiver` |
| Split Ratio (%) | number, shown only if split | Required if split selected | 0–100, integer | `50` |

#### Section 3 — Items

A dynamic line-item table. Each row represents one item to be transferred:

| Column | Type | Notes |
|---|---|---|
| Item | searchable select | Pulls from org-level master data (items, master data scope = org not site); placeholder "Search product or item code…" |
| Description | auto-filled text | Readonly, from `items.name` |
| Qty to Transfer | number | Required; > 0; validated against available stock at from-site (real-time check) |
| Unit | auto-filled | From `items.uom` |
| Planned LP(s) | multi-select | Optional at creation; shows available LPs at from-site for this item; selecting locks them (hard-lock); shows LP# + qty + expiry |
| Availability | indicator | Green / Amber / Red dot based on from-site stock vs requested qty |

Below the table: `btn-secondary "+ Add Item"` (adds a new empty row). Minimum 1 item required.

**Stock availability check:** After each qty field change, an inline availability indicator updates: green dot "Available (on hand: X)," amber dot "Borderline (on hand: X, borderline coverage)," red dot "Insufficient (on hand: X, requested: Y)." A red state does not hard-block creation (planner override) but shows an `alert-amber` "One or more items have insufficient stock at the source site. The IST will be created but LPs cannot be pre-locked for those items."

#### Section 4 — Notes

| Field | Type | Required | Notes |
|---|---|---|---|
| Internal Notes | textarea | No | Max 1000 chars; visible in IST detail for internal users only |
| Reference (PO/WO) | text | No | Free text reference to an external doc; e.g., "WO-0142" |

#### Form Actions

`btn-primary "Create Transfer"` — validates all required fields, saves the IST with `state='draft'`, hard-locks planned LPs (sets LP status to `reserved` at from-site), auto-generates a linked outbound shipping record (link to 11-SHIPPING SO skeleton, `inter_site=true` flag) and an inbound GRN placeholder at the to-site. On success: navigate to the IST detail screen with toast "Transfer IST-[n] created. Pending approval from [from-site manager name]."

`btn-secondary "Save as Draft"` — same as Create but skips LP hard-lock until explicit "Lock LPs" action on the detail screen.

#### Validation Errors

- From Site = To Site: inline error "From site and To site cannot be the same."
- No items: "At least one item is required."
- ETA before Ship Date: "Expected arrival must be after the planned ship date."
- Freight Cost > 0 with method = none: `alert-amber` "A freight cost is set but allocation method is 'None.' The cost will not be allocated to either site."

#### States

**Loading (initial form load):** Skeleton on both site pickers and items table.

**Populated (draft):** If arriving from a "duplicate" action, form pre-populates from the source IST with an `alert-blue` "Pre-filled from IST-[n]. Review all fields before saving."

**Error (save failure):** `alert-red` below form: "Failed to create transfer. [Error detail]." Field-level errors shown inline.

**Permission-denied:** Redirect to list with toast "You do not have permission to create transfers."

#### Microcopy

From Site tooltip: "Select the site that will ship the goods." To Site tooltip: "Select the destination site." LP picker tooltip: "Pre-selecting LPs locks them immediately. If unsure, leave blank and lock later." Cost allocation tooltip: "Receiver: destination site bears the freight cost. Split: divide by the ratio below."

---

### MS-IST-D — Inter-Site Transfer Detail

**Screen ID:** MS-IST-D
**Route:** `/multi-site/transfers/:id`
**Purpose:** Full lifecycle management screen for one inter-site transfer. From here, managers approve, warehouse staff confirm shipment, receivers complete GRN, and finance views cost allocation. The state machine drives which actions are available.

#### Layout

Full-width main area. Page title shows "IST-[number]" in monospace (20px bold) with the current status badge next to it. Breadcrumb: "Multi-Site / Transfers / IST-[n]." Below title: a state machine progress bar showing all states as circles connected by lines (draft → planned → shipped → in_transit → received → closed), with the current state filled in `--blue` and completed states showing a checkmark. Cancelled state shown as a red X branching from the relevant circle.

Below the state bar: a row of context-sensitive action buttons (changes based on current state — see below). Then a horizontal tab bar.

#### Context-Sensitive Action Buttons by State

| State | Actions shown |
|---|---|
| draft | `btn-primary "Submit for Approval"` + `btn-secondary "Edit IST"` + `btn-danger "Cancel"` |
| planned | From-site manager: `btn-primary "Confirm Shipment"` + `btn-danger "Cancel"`. To-site manager: `btn-secondary "Pre-approve Receipt"` (optional). Others: read-only. |
| shipped | To-site manager / warehouse: `btn-primary "Mark In Transit"` (if cross-site). From-site: `btn-secondary "View Outbound Shipment"`. |
| in_transit | To-site warehouse: `btn-primary "Receive Goods (GRN)"`. Planner: `btn-secondary "Update ETA"` → opens MODAL-IST-UPDATE-ETA. |
| received | Admin / site manager: `btn-primary "Close IST"` (only after finance inter-company charge confirmed). |
| closed | Read-only. `btn-secondary "View Audit Trail"`. |
| cancelled | Read-only. `btn-secondary "Duplicate as New"`. |

#### Approval Gates (V-MS-10, V-MS-11)

When state transitions require approval, the IST detail shows inline approval widgets:

- **From-site approval widget:** Card section "From-Site Approval." Shows approver name + timestamp if approved; shows `badge-amber "Awaiting Approval"` + `btn-primary "Approve (From Site)"` if the current user is the from-site manager and approval is pending. Non-managers see "Awaiting from-site manager approval."
- **To-site approval widget:** Same pattern for to-site manager.

Both widgets show in the Overview tab and in the state machine bar area.

#### Tab 1 — Overview

Two-column layout. Left: IST Identity card with label-value pairs: IST Number, Status, From Site, To Site, Lane, Carrier Reference, Planned Ship Date, Actual Ship Date (if shipped), ETA, Actual Arrival (if received), Freight Cost, Cost Allocation Method, Internal Notes, Reference, Created By, Created At. Right: From-site and To-site approval widgets (see above). Below: a "Documents" mini-list (packing slip link, BOL link if generated).

#### Tab 2 — Items & LPs

A table of all line items:

| Column | Type | Notes |
|---|---|---|
| # | row number | |
| Item Code | monospace | |
| Item Name | text | |
| Planned Qty | number | |
| Shipped Qty | number | Editable only when confirming shipment; shows "—" until shipped |
| Received Qty | number | Editable only when performing GRN; shows "—" until received |
| Unit | text | |
| LP(s) | monospace chips | Comma-separated LP numbers; each is a link to the LP detail in 05-WAREHOUSE scoped to from-site (pre-ship) or to-site (post-receipt) |
| Status | badge | locked / shipped / received |

**Discrepancy indicator:** If received_qty ≠ shipped_qty for any line, a `badge-red "Discrepancy"` appears next to that row. An `alert-amber` banner appears at the top of the tab: "Quantity discrepancy detected on [n] item(s). Review and confirm before closing."

#### Tab 3 — Outbound Shipping

Embedded view of the linked outbound shipping record from 11-SHIPPING. Shows: SO/shipment number (auto-generated as `inter_site=true` document), carrier, BOL number, ship date. A `btn-secondary "View Full Shipment"` link navigates to `/shipping/docs/:shipmentId/bol` in the 11-SHIPPING module. If not yet generated: "Outbound shipping document will be created when the IST is confirmed for shipment."

#### Tab 4 — Inbound GRN

Embedded view of the linked inbound GRN placeholder from 05-WAREHOUSE scoped to the to-site. Shows: GRN number, status (pending / in-progress / completed), receiver, received date. A `btn-secondary "Open GRN"` link navigates to `/warehouse/grn/:id?site=[to_site_code]`. If not yet received: "GRN will be available when the transfer is marked as received at this site."

#### Tab 5 — Docs

List of documents attached: outbound packing slip, BOL, customs documents (P2), internal attachments. Upload button for additional attachments. Columns: Document Name | Type | Uploaded At | Actions (Download, Delete).

#### Tab 6 — Audit

Full timeline of all state transitions and approvals for this IST. Uses `.tl-item` pattern:

- Colored dot matching state color
- Event description: "[User Name] moved IST from [old state] to [new state]"
- Approval events: "[User Name] approved as from-site manager"
- Timestamp right-aligned

All entries are read-only. `btn-secondary "Export Audit PDF"`.

#### Tab 7 — Finance

Shows inter-company charge details. Only visible to admin / ops_director / finance role users.

| Field | Value |
|---|---|
| Freight Cost | £340.00 |
| Cost Allocation Method | Receiver (to-site bears cost) |
| From-Site Account | `Cost Center: CC-FRZ-UK-WH` |
| To-Site Account | `Cost Center: CC-FRZ-DE-WH` |
| Finance Status | badge: pending / posted / voided |
| Journal Entry Reference | `JE-0091` (link to 10-FINANCE if posted) |

`btn-primary "Post Inter-Company Charge"` (admin only, only if status = received and finance_status = pending). Opens MODAL-CONFIRM-POST-CHARGE. For non-finance roles: tab shows "Finance details are managed by the finance team."

#### States

**Loading:** Skeleton on title area and first tab.

**Populated:** Full tabs rendered with live data.

**Error:** `alert-red` "Failed to load transfer details. Retry."

**Permission-denied for specific tab:** Tab shows `alert-blue` "You do not have permission to view this section."

#### Microcopy

State bar tooltip (in_transit): "Goods are physically between sites. Update ETA if the carrier provides revised timing." Finance tab "Post Charge" tooltip: "Posting will create a journal entry in both sites' ledgers and mark this transfer as financially closed."

---

### MS-MDS — Master Data Sync

**Screen ID:** MS-MDS
**Route:** `/multi-site/master-data`
**Purpose:** View replication status of org-level master data entities (items, BOMs, allergens, suppliers, customers, reference tables) across all active sites. Identify entities pending replication or in conflict. Trigger manual sync runs.

#### Layout

Full-width main area. Page title "Master Data Sync" with breadcrumb. Action bar: Entity Type filter (All / Items / BOMs / Allergens / Suppliers / Customers / Reference Tables), Site filter (All Sites or specific site), Status filter (All / Synced / Pending / Conflict). Right side: `btn-primary "Run Sync Now"` → opens MODAL-REPLICATION-RETRY with all entities pre-selected (admin only). `btn-secondary "Export Report"`.

Below the action bar: a summary row of 3 KPI mini-cards: Synced (count, green), Pending (count, blue), Conflict (count, red).

Below the KPI mini-cards: the data table.

#### Table Columns

| Column | Type | Width | Example | Notes |
|---|---|---|---|---|
| Entity Type | badge | 110px | `Item` | badge-blue Item, badge-green BOM, badge-gray Supplier |
| Entity Code | monospace | 130px | `PRD-0042` | Code from master data; link opens entity in the relevant module |
| Entity Name | text | 200px | `Chicken Nuggets 1kg` | |
| Site | site badge | 120px | `FRZ-DE` | Site this replication record applies to |
| Status | badge | 100px | `Synced` | Synced, Pending, Conflict |
| Last Sync | relative time | 110px | `2 min ago` | Timestamp of last successful apply |
| Next Scheduled | date-time | 110px | `Apr 21 03:00` | Next cron-driven sync window |
| Conflict Count | number | 90px | `1` | Count of field-level conflicts; `—` if 0 or status ≠ Conflict |
| Actions | icon buttons | 80px | 🔍 ⋮ | View, ⋮: Sync Now, Resolve Conflicts (if conflict > 0) |

#### Row Action Menu (⋮)

- **Sync Now** — triggers an immediate replication job for this entity + site combination (admin only); shows a spinner inline and updates status within 10 seconds.
- **Resolve Conflicts** — opens MODAL-CONFLICT-RESOLVE (admin only; only shown if `status = Conflict`).
- **View Entity** — navigates to the entity in its home module (e.g., Items → `/technical/items/:id`).

#### Drill-Down Row

Clicking anywhere on a row expands an inline detail panel showing the list of conflicted fields (if `status = Conflict`) or the last sync log (if Synced). Conflicted fields show a two-column layout: "Source Value" (from org HQ) vs "Site Value" (local variance at that site), with a `badge-red "Conflict"` label. A `btn-primary "Resolve"` button opens MODAL-CONFLICT-RESOLVE focused on this entity.

#### States

**Loading:** 6 skeleton rows.

**Empty (no master data yet):** "No master data entities are being tracked. Master data is synced to sites after multi-site is activated." (Shown only if activated but no items exist — unlikely in practice.)

**Empty (filtered):** "No entities match your filters. [Clear filters]."

**Populated:** Table with pagination and summary KPI strip at top.

**All synced (zero conflicts, zero pending):** `alert-green` "All master data is synchronized across all sites. No action required." KPI strip shows all-green.

**Error:** `alert-red` "Failed to load sync status. Retry."

**Global Site Selector effect:** When scoped to a single site, the Site column is hidden and the table shows only replication records for that site.

#### Microcopy

Entity link tooltip: "View this entity in [Module Name]." "Run Sync Now" button tooltip: "Triggers a manual sync of all pending entities. Normal sync runs every hour." Conflict badge tooltip: "A local override exists at this site that differs from the organization-level master. Resolve to keep data consistent."

---

### MS-CONF — Conflict Resolution Modal

**ID:** MODAL-CONFLICT-RESOLVE
**Trigger:** From Master Data Sync table row "Resolve Conflicts" action, or from the inline drill-down expand row. Also reachable from the Replication Queue.
**Width:** 760px (wider than standard 560px to accommodate side-by-side diff).

#### Layout

Modal title: "Resolve Conflict — [Entity Name] ([Entity Code]) at [Site Name]." Close × top right.

Below the title: entity metadata bar — Entity Type badge, Entity Code (monospace), Site badge, Conflict detected timestamp.

**Diff panel:** A two-column table with a fixed column on the far left for field labels. Column 1 header: "Source (Org Level)" with `badge-blue "L1"` badge. Column 2 header: "Site Override ([Site Name])" with `badge-amber "L2"` badge.

Each row represents one conflicting field:

| Field Label | Source Value | Site Value | Choose |
|---|---|---|---|
| `unit_cost` | `£12.40` | `£11.95` | [radio button: Source] [radio button: Site] |
| `allergen_flags` | `Milk, Gluten` | `Milk` | [radio button: Source] [radio button: Site] |

Non-conflicting fields are not shown in the diff.

**Bulk actions above the diff table:** `btn-secondary "Choose All Source"` selects "Source" radio for all fields. `btn-secondary "Choose All Site"` selects "Site" radio for all fields.

**Reason Code field:** A required select dropdown below the diff: "Reason for resolution." Options from `reference_tables['conflict_resolution_reasons']`: e.g., "Site-specific pricing agreed," "Data entry error at site," "HQ data is authoritative," "Site exception approved by manager," "Other (see notes)." Required before Apply.

**Notes field:** Optional textarea for free-text explanation. Max 500 chars.

**Action row at bottom:**

- `btn-primary "Apply Resolution"` — saves chosen values, marks conflict as resolved, writes to `audit_log` with `action='conflict_resolved'` + chosen values per field + reason + user + timestamp. Toast "Conflict resolved for [Entity Name] at [Site Name]."
- `btn-secondary "Cancel"` — closes without saving.

**E-signature gate (if configured):** If `site_settings['conflict_esig_required'] = true`, after clicking "Apply Resolution" an inline signature field appears: "Enter your password to confirm this cross-site data override." Input type password. `btn-primary "Confirm & Apply"`. This gate is optional per org config (default: off).

#### States

**Loading:** Skeleton on diff table while fields load.

**No conflicts (reached in error):** "No conflicts found for this entity at this site." `btn-secondary "Close"`.

**Applied:** Modal closes, parent table row status changes from Conflict → Synced (if all conflicts resolved) or Conflict (if partial). Toast shown.

**Error:** `alert-red` inside modal: "Failed to apply resolution. Try again."

#### Microcopy

Modal intro text (above diff): "Review each conflicting field and choose the value to keep. Your choice will be applied to the site record and logged for audit." Reason code required error: "Please select a reason for this resolution."

---

### MS-SIT-CFG — Site Config Overrides (per site)

**Screen ID:** MS-SIT-CFG (accessed via Site Detail Tab 2 — Config)
**Route:** `/multi-site/sites/:id` (Tab: Config) — direct link also available at `/multi-site/site-config/:id`
**Purpose:** Manage L2 tier configuration overrides for a specific site. This screen surfaces the `site_settings` table entries for one site, showing the L1 base value from 02-SETTINGS alongside the L2 override value. Changes are scoped exclusively to the selected site and take effect immediately.

See Site Detail Tab 2 description above for the complete field-by-field breakdown. This section adds the standalone-route description:

**Standalone layout (when accessed via `/multi-site/site-config/:id`):** Full-width main area with page title "[Site Name] — Configuration" and breadcrumb "Multi-Site / Sites / [Site Name] / Config." An `alert-blue` banner: "You are configuring settings for [Site Name] only. These override the L1 organization baseline from [02-Settings link]. All other sites remain unaffected." Then the same `site_settings` table and MODAL-SITE-CONFIG-OVERRIDE as described in the Site Detail Tab 2 section.

---

### MS-LANE — Transport Lanes List

**Screen ID:** MS-LANE
**Route:** `/multi-site/lanes`
**Purpose:** View and manage transport lanes — predefined routes between pairs of sites with associated carrier options, lead times, and cost data. Planners use this to understand available routes when creating ISTs; admins manage the lane master.

#### Layout

Full-width main area. Page title "Transport Lanes" with breadcrumb. Action bar: search input (placeholder "Search lane code or sites…"), From Site filter, To Site filter, Status filter (Active / Inactive). Right side: `btn-primary "+ Add Lane"` → MODAL-LANE-CREATE (admin only). `btn-secondary "Export"`.

#### Table Columns

| Column | Type | Width | Example | Notes |
|---|---|---|---|---|
| Lane # | monospace link | 90px | `LN-001` | Links to `/multi-site/lanes/:id` |
| From Site | site badge | 140px | `FRZ-UK Plant` | |
| To Site | site badge | 140px | `FRZ-DE Warehouse` | |
| Carriers | text | 160px | `DHL, DB Schenker` | Comma-separated; truncated with tooltip |
| Lead Time Avg | number + unit | 100px | `2.1 days` | Calculated from historical IST data |
| Cost / km | currency | 100px | `£0.42` | From rate card; `—` if no rate set |
| Health | badge | 90px | `Active` | Lane health: Active/Stale/Failed per palette §1.3 |
| Actions | icon buttons | 80px | ✏️ ⋮ | Edit, ⋮: View, Deactivate, Upload Rate Card |

#### States

**Loading:** 4 skeleton rows.

**Empty:** Centered icon, "No transport lanes configured. Add lanes to speed up transfer creation and track freight costs." `btn-primary "+ Add Lane"`.

**Empty (filtered):** "No lanes match your filters."

**Populated:** Table with count footer.

**Error:** `alert-red` "Failed to load lanes. Retry."

#### Microcopy

Lane Health tooltip "Stale": "No IST has used this lane in the last 30 days. Verify it is still operational." Health tooltip "Failed": "The most recent IST on this lane encountered a logistics issue."

---

### MS-LANE-D — Transport Lane Detail

**Screen ID:** MS-LANE-D
**Route:** `/multi-site/lanes/:id`
**Purpose:** Full detail for one transport lane, including rate cards, historical volume, and constraint flags.

#### Layout

Full-width main area. Page title "Lane [LN-001]: [From-Site] → [To-Site]" with status badge. Breadcrumb. Action buttons: `btn-secondary "Edit Lane"` (admin), `btn-secondary "Upload Rate Card"` (admin) → MODAL-RATE-CARD-UPLOAD, `btn-danger "Deactivate"` (admin). Below: horizontal tab bar.

#### Tab 1 — Overview

Two-column card layout. Left: Lane Identity (Lane #, From Site, To Site, Distance km, Transit Time (scheduled), Mode of Transport: Road/Rail/Air/Sea, Active status). Right: Health card (last IST on this lane: date + IST# link, avg lead time, on-time %, current status badge + health indicator).

#### Tab 2 — Rates

Rate card table — list of carrier rates valid for this lane:

| Column | Notes |
|---|---|
| Carrier | carrier name + logo if available |
| Rate Type | per km / per shipment / per kg |
| Rate Value | currency |
| Currency | ISO 4217 |
| Effective From | date |
| Effective To | date or "Open-ended" |
| Status | Active / Expired |
| Uploaded By | user name |
| Actions | Download, Delete (admin only) |

`btn-secondary "+ Add Rate"` → MODAL-LANE-RATE-ADD. `btn-secondary "Upload Rate Card CSV"` → MODAL-RATE-CARD-UPLOAD.

Empty state: "No rate cards uploaded. Upload a carrier rate schedule to enable freight cost calculation."

Rate Approval workflow: if `site_settings['lane_rate_approval_required'] = true`, new rates show `badge-amber "Pending Approval"` and a `btn-primary "Approve Rate"` button visible to admin / finance role.

#### Tab 3 — History

Volume-by-month bar chart (CSS-only placeholder if charting library not yet decided). Shows count of ISTs and total freight cost per month for the trailing 12 months. Below the chart: a table of the 10 most recent ISTs using this lane: IST# | Status | Shipped Date | Freight Cost | Lead Time Actual.

#### Tab 4 — Constraints

A form-like read display of lane-level operational constraints:

| Constraint | Value | Type |
|---|---|---|
| HAZMAT Allowed | Yes / No | toggle display |
| Cold Chain Required | Yes / No | toggle display |
| Max Shipment Weight (kg) | 5,000 | number display |
| Customs Required | Yes / No | toggle display |
| Customs Notes | "EU → Non-EU requires EUR.1 or T1" | text display |
| Special Instructions | free text | text display |

`btn-secondary "Edit Constraints"` (admin) → inline edit form for all fields.

#### States

All tabs: Loading skeleton, populated, error (`alert-red`).

---

### MS-REP — Replication Queue

**Screen ID:** MS-REP
**Route:** `/multi-site/replication`
**Purpose:** Monitor and manage the master data replication pipeline. Visual and functional pattern consistent with the DLQ (Dead Letter Queue) pattern established in 03-TECHNICAL and 10-FINANCE modules. Admins use this to diagnose sync failures, retry failed jobs, and review historical sync runs.

#### Layout

Full-width main area. Page title "Replication Queue" with breadcrumb. Tab bar at the top: [Active Jobs] [Historical Jobs] [Schedule]. Action bar within "Active Jobs" tab: Status filter (All / Running / Pending / Failed / Retrying), Entity Type filter, Site filter. Right side: `btn-primary "Retry All Failed"` → MODAL-REPLICATION-RETRY (admin only; disabled if zero failed jobs). `btn-secondary "Run Full Sync Now"` (admin only; triggers a manual full-sync job across all entities and sites).

#### Tab 1 — Active Jobs

Table of currently running, pending, or recently failed replication jobs:

| Column | Type | Width | Example | Notes |
|---|---|---|---|---|
| Job ID | monospace | 100px | `REP-4821` | |
| Entity Type | badge | 110px | `Items` | Color per entity type |
| Site | site badge | 120px | `FRZ-DE` | Target site |
| Status | badge | 100px | `Running` | Running=blue, Pending=amber, Failed=red, Retrying=amber pulsing |
| Entities Count | number | 90px | `847` | Total entities in this job |
| Success | number + color | 80px | `845` | Green if = total |
| Failed | number + color | 80px | `2` | Red if > 0 |
| Retry Count | number | 80px | `1` | How many retries attempted |
| Started At | datetime | 110px | `Apr 20 03:00` | |
| Duration | text | 80px | `2m 14s` | Running jobs show elapsed; completed show total |
| Actions | buttons | 100px | Retry / Cancel | Context-sensitive |

**Row-level actions:**

| Job status | Actions |
|---|---|
| Running | `btn-secondary "Cancel"` → MODAL-CONFIRM-CANCEL-JOB |
| Pending | `btn-secondary "Cancel"` |
| Failed | `btn-primary "Retry"` → MODAL-REPLICATION-RETRY | `btn-secondary "View Errors"` → expands inline error log |
| Retrying | `btn-secondary "Cancel Retry"` |
| Completed | `btn-secondary "View Log"` → expands inline log (read-only) |

**Inline error log expansion:** A drawer below the row showing a table of failed entities within the job: Entity Code | Error Code | Error Message | Last Attempt. `btn-primary "Retry Failed Entities"` at the bottom of the drawer.

#### Tab 2 — Historical Jobs

Identical column structure to Tab 1 but filtered to completed and cancelled jobs, sorted `started_at DESC`. Pagination (50 rows/page). Filter by date range, entity type, site. Status badges: Completed=green, Cancelled=gray, Completed with Errors=amber.

#### Tab 3 — Schedule

Displays the replication schedule per entity type. Table:

| Column | Notes |
|---|---|
| Entity Type | badge |
| Cadence | "Hourly," "Nightly 03:00 UTC," "On Change" |
| Last Successful Run | datetime |
| Next Scheduled Run | datetime |
| Sites Covered | count or "All Active Sites" |
| Edit | `btn-secondary "Edit Schedule"` (admin) → MODAL-SCHEDULE-EDIT (links to MS-CFG settings) |

#### States

**Loading:** Skeleton rows.

**Empty (Active Jobs tab):** `alert-green` "No active replication jobs. The queue is clear." with a green checkmark icon. Last full sync timestamp shown below.

**Empty (Historical Jobs tab):** "No historical jobs found for the selected filters." [Clear filters link.]

**All green (zero failed):** Active jobs tab shows `alert-green` banner. Retry All Failed button disabled with tooltip "No failed jobs."

**Error (API failure):** `alert-red` "Failed to load replication queue. Retry."

#### Microcopy

Column "Retry Count" tooltip: "Number of automatic retries attempted. Manual retries from this screen reset the counter." "Run Full Sync Now" button tooltip: "Triggers an immediate full-sync of all entity types to all active sites. This may take several minutes." Failed job row: "View Errors shows field-level failure details from the last sync attempt."

---

### MS-PRM — Site Permissions

**Screen ID:** MS-PRM
**Route:** `/multi-site/permissions`
**Purpose:** Manage the user × site access matrix. This screen lets admins assign users to sites, set their per-site role, designate a primary site, and view cross-site role inheritance. The model is `site_user_access` many-to-many.

#### Layout

Full-width main area. Page title "Site Permissions" with breadcrumb. View toggle: [Matrix View] [User View] [Site View]. Default is Matrix View. Action bar: `btn-primary "+ Assign User to Site"` → MODAL-PERMISSION-BULK-ASSIGN (admin only). Search input (placeholder "Search user or site…"). Role filter. Site filter.

#### Matrix View

A cross-tabulation grid. Rows are users (sorted alphabetically). Columns are sites (sorted by site code). Each cell shows:

- If user has access to that site: a role badge (site_manager, warehouse_operator, planner, etc.). Primary site column shows the badge with a small ⭐ icon.
- If user has no access: an empty gray cell, clickable by admin to quick-assign → opens MODAL-PERMISSION-BULK-ASSIGN pre-filled with that user and site.

For organizations with many users or sites: the matrix scrolls horizontally. Column headers (site codes) are sticky. Row headers (user names) are sticky left.

Super-admins have a special "All Sites" indicator instead of per-cell badges.

#### User View

A flat table with one row per user-site access record:

| Column | Notes |
|---|---|
| User | Avatar + full name |
| Email | 13px muted |
| Site | site badge |
| Role (at this site) | role badge |
| Primary | ⭐ badge-green "Primary" if `is_primary=true` |
| Granted At | relative time |
| Granted By | user name |
| Actions | "Edit Role" + "Remove Access" |

#### Site View

A tree-per-site layout. Each site is a collapsible section (`.tree-item.l0`). Expanding a site shows its assigned users as l1 rows: user avatar + name + role badge + primary indicator. `btn-secondary "+ Add User to [Site Name]"` per section (admin only).

#### Actions

**"Edit Role" action:** Opens MODAL-SITE-ROLE-EDIT — simple 560px modal with: User (readonly display), Site (readonly), Role select dropdown (site_manager / warehouse_operator / planner / quality_manager / auditor), Primary Site toggle (with warning if un-setting the only primary). `btn-primary "Save"`.

**"Remove Access" action:** Opens MODAL-CONFIRM-REMOVE-USER-SITE — confirms removal and warns if this is the user's only site assignment or their primary site.

#### Cross-Site Role Inheritance Note

An `alert-blue` banner at the top of the page: "Users with the 'super_admin' or 'ops_director' role automatically have cross-site read access. These are not shown per-site in this matrix." Clicking "Learn More" opens a help popover explaining RLS bypass rules.

#### States

**Loading:** Skeleton matrix cells.

**Empty (no users assigned to any site):** "No site assignments found. Start by assigning users to sites." `btn-primary "+ Assign User to Site"`.

**Empty (filtered):** "No assignments match your filters."

**Populated:** Full matrix with data.

**Error:** `alert-red` "Failed to load permissions. Retry."

#### Microcopy

Matrix cell hover (empty cell): "Click to assign [User Name] to [Site Name]." Role badge tooltip: "This is [User Name]'s role at [Site Name]. Click Edit Role to change." Primary star tooltip: "This is [User Name]'s primary site. The site switcher defaults to this site on login."

---

### MS-ANA — Multi-Site Analytics

**Screen ID:** MS-ANA
**Route:** `/multi-site/analytics`
**Purpose:** Consolidated analytical views across sites. Shows inventory imbalance, inter-site shipping cost trends, lane utilization, conflict rate, and per-site KPI benchmarking. This screen feeds the ops director's weekly planning decisions.

#### Layout

Full-width main area. Page title "Multi-Site Analytics" with breadcrumb. Date range picker (default: last 30 days). Site filter (All Sites or specific site selection, multi-select). `btn-secondary "Export Report"`. Below: tab bar separating analytical domains.

#### Tab 1 — Inventory Balance

KPI row (3 cards): Total Network Inventory Value (sum across sites, `--blue`), Highest Site Inventory (site name + value, `--green`), Lowest Site Inventory (site name + value, `--amber`).

Below: a horizontal bar chart (CSS-based, one bar per site), showing inventory value as a percentage of the network total. Sites with < 10% of network average are flagged with an `alert-amber` strip: "Site [X] has a low inventory balance relative to the network. Consider a rebalance transfer."

A "Rebalance Suggestions" card appears if the system detects imbalance: lists recommended ISTs (from-site → to-site, recommended qty, estimated cost) with a `btn-primary "Create Suggested Transfer"` action for each suggestion. This triggers the IST Create form pre-filled with the suggestion data.

#### Tab 2 — Shipping Costs

Line chart (CSS-based, or placeholder with data labels) showing inter-site freight cost per month, broken down by lane. Below: a table of cost by lane (Lane # | From | To | Total Shipments | Total Freight £ | Avg per Shipment £ | % of Network Total). Sortable by total freight cost.

#### Tab 3 — Lane Utilization

Bar chart showing IST count per lane per month. Table: Lane # | Active ISTs (last 30d) | Avg Lead Time | On-Time % | Status. Sortable.

#### Tab 4 — Conflict Rate

Line chart showing replication conflicts detected over time (by week). Below: breakdown by entity type (Items, BOMs, Suppliers, etc.) as a simple table with counts. Summary KPI: "Average time to resolve conflict: [n] hours."

#### Tab 5 — Per-Site Benchmark

A comparison table. One row per site. Columns: Site Name | OEE % (last 30d) | On-Time Ship % | QA Pass Rate % | Active WOs | Inventory Value | ISTs Sent | ISTs Received. Each metric cell shows the value and a color indicator (green = above network average, amber = within 10% below, red = significantly below). Sortable by any column.

A note at the bottom: "OEE data requires the 15-OEE module to be enabled at each site. Missing data shown as '—'."

#### States

**Loading:** Skeleton charts and tables.

**Empty (no data in date range):** "No analytics data available for the selected range and sites. Try extending the date range."

**Populated:** All tabs visible with data.

**Error:** `alert-red` "Failed to load analytics data. Retry."

**Single-site scope:** Analytics tab is hidden from the sidebar. A page-level `alert-blue` appears: "Multi-site analytics requires 'All Sites' scope. Switch to All Sites in the site selector to view cross-site data." with a `btn-primary "Switch to All Sites"` button.

#### Microcopy

Rebalance suggestion card: "This suggestion is based on the current inventory imbalance across sites. Creating this transfer will pre-lock the suggested LPs at the source site." Benchmark table: "OEE and QA metrics are calculated over the selected date range. Values update daily."

---

### MS-CFG — Multi-Site Module Settings

**Screen ID:** MS-CFG
**Route:** `/multi-site/settings`
**Purpose:** Global configuration for the multi-site module: replication cadence per entity, default conflict resolution policy, timezone propagation rules, currency conversion source, and activation state management. Admin only.

#### Layout

Full-width main area. Page title "Multi-Site Settings" with breadcrumb. Sections separated by horizontal dividers.

#### Section 1 — Activation State

Read-only card showing the current `multi_site_state` value as a large badge:

- `badge-gray "Inactive"` — single-site mode
- `badge-amber "Wizard In Progress"` — setup in progress
- `badge-blue "Dual Run"` — sites exist, RLS pending
- `badge-green "Activated"` — fully live

If state = `dual_run`: two buttons: `btn-primary "Complete Activation"` → opens MODAL-ACTIVATION-CONFIRM (one-click flip of RLS policies; shows count of tables to be updated; requires admin confirmation). `btn-danger "Roll Back to Single-Site"` → MODAL-ROLLBACK-CONFIRM (destructive; warns data will be re-scoped to default site).

If state = `activated`: `btn-secondary "View Activation Log"` → navigates to `/multi-site/activate?view=log`.

#### Section 2 — Replication Cadence

A table of entity types and their replication schedules:

| Entity Type | Cadence | Edit |
|---|---|---|
| Items | Nightly 03:00 UTC | `btn-secondary "Edit"` |
| BOMs | Nightly 03:00 UTC | `btn-secondary "Edit"` |
| Allergens | Nightly 03:00 UTC | `btn-secondary "Edit"` |
| Suppliers | Every 6 hours | `btn-secondary "Edit"` |
| Customers | Every 6 hours | `btn-secondary "Edit"` |
| Reference Tables | Hourly | `btn-secondary "Edit"` |

Clicking Edit opens MODAL-SCHEDULE-EDIT: simple modal with entity type (readonly), Cadence select (Hourly / Every 6 hours / Nightly / On-change / Manual only), Target Time (time picker, shown if Nightly or Every N hours). `btn-primary "Save"`.

#### Section 3 — Conflict Resolution Policy

A select field: "Default Conflict Resolution Policy." Options: Manual (admin must resolve each conflict — default), Last-Writer-Wins (most recent change wins automatically), Source-of-Truth Site (a designated master site always wins). Helper text below: "Manual is recommended for master data integrity. Last-Writer-Wins may cause data loss if concurrent edits occur."

If "Source of Truth Site" selected: a site picker appears: "Designate Source-of-Truth Site." A `badge-blue "HQ"` badge is applied to the selected site throughout the UI.

`btn-primary "Save Policy"`.

#### Section 4 — Timezone Propagation

A toggle: "Display all timestamps in user's local timezone (default: ON)." Helper: "When ON, timestamps are displayed in the signed-in user's browser timezone. When OFF, timestamps display in the site's configured timezone."

A second toggle: "Site-specific UI language." Helper: "When ON, the UI language for reports and notifications changes based on the active site's `language` setting." Options: ON / OFF.

`btn-primary "Save Preferences"`.

#### Section 5 — Currency Conversion

A read-only link card: "Currency conversion rates are managed in 10-FINANCE (FX Rates). [Open Finance FX Settings →]" navigating to `/finance/settings/fx`. Below: a summary of active currency pairs affecting inter-site transfers, e.g., "GBP ↔ EUR: active, last updated 4h ago." If a pair is missing, `badge-red "Missing"` badge and `alert-amber` "FX rate for [currency pair] is missing. Inter-site freight costs in mixed currencies cannot be calculated." with `btn-primary "Add FX Rate →"` link to Finance.

#### Section 6 — Hierarchy Configuration

A read-only display of the tenant's `sites_hierarchy_config`: Depth (e.g., 3), Level Names (e.g., "site → plant → line"). `btn-secondary "Edit Hierarchy Config"` → opens MODAL-HIERARCHY-EDIT (admin only): a form with Depth select (2–5), and dynamically rendered text inputs for each level name (Level 1 Name, Level 2 Name, etc.). Warning: "Changing hierarchy depth affects how sites are displayed throughout the application. Existing data is not migrated."

`btn-primary "Save"` at the bottom of the section.

#### States

**Loading:** Skeleton for each section.

**Populated:** All settings visible with current values.

**Saved:** Toast "Multi-site settings saved."

**Error:** Field-level or section-level `alert-red` "Failed to save. Retry."

**Permission-denied:** All fields disabled, `btn-primary` buttons hidden, `alert-blue` "View only."

#### Microcopy

Activation section: "Dual Run mode allows you to verify multi-site setup before activating site-level RLS policies. Data is visible to all users during this phase." Rollback warning: "Rolling back will return all users to single-site mode and revert RLS policies. No data is deleted, but site-level isolation will be removed."

---

### MS-ACT — Activation Wizard

**Screen ID:** MS-ACT
**Route:** `/multi-site/activate`
**Purpose:** Step-by-step wizard to safely activate multi-site mode. Admin-only. Follows the D-MS-14 state machine: `inactive → wizard_in_progress → dual_run → activated`. Three mandatory steps must be completed before activation.

#### Layout

Full-screen centered wizard card (max-width 640px, margin auto). Global sidebar visible but dimmed (pointer-events none). Sidebar entry for Multi-Site highlighted with `badge-amber "Setup"`. Page title "Activate Multi-Site" (20px bold) above the wizard card.

**Progress stepper:** Horizontal stepper with 3 numbered circles + labels connected by lines. Completed: filled `--blue` circle with checkmark. Current: filled `--blue` circle with number. Future: gray outline. Labels: 1 Create Sites · 2 Assign Users · 3 Backfill & Review.

#### Step 1 — Create Sites

**Purpose:** Create at least one named site (in addition to the auto-created "Default" site). The existing single-site data will be assigned to the Default site during backfill.

Content: an `alert-blue` "A 'Default Site' will be created automatically from your existing configuration. Add one or more additional sites below."

Below: a list of sites to create (starts with one empty row):

| Field | Type | Required | Validation |
|---|---|---|---|
| Site Code | text | Yes | Uppercase, alphanumeric+hyphen, unique, max 10 chars, e.g., `FRZ-UK` |
| Site Name | text | Yes | Min 2, max 100 chars |
| Type | select | Yes | Plant / Warehouse / Office / Co-pack |
| Country | select | Yes | ISO country list |
| Timezone | select | Yes | IANA timezone list |
| Set as Default | radio | — | Only one can be default; existing data migrates to this site |

`btn-secondary "+ Add Another Site"` appends a new row (up to 10 on this screen; more can be added later).

Step 1 action: `btn-primary "Continue →"` (validates all rows, saves to DB, sets `multi_site_state = 'wizard_in_progress'`). `btn-secondary "Save & Exit"` (saves without advancing, returns to `/multi-site/settings`).

#### Step 2 — Assign Users

**Purpose:** Assign existing users to sites via `site_user_access`. Each user must have at least one site assignment (and exactly one `is_primary`) before activation.

Content: a user-assignment table. Rows: all org users. Columns: User (name + email) | Sites (multi-select checkboxes for each created site) | Role per site (select per checked site) | Primary Site (radio button per row).

A status column on the right: `badge-green "Ready"` if user has at least one assignment with a primary set, `badge-red "Needs Assignment"` otherwise.

Summary at the top: "X of Y users assigned. X without assignment will lose access after activation."

Action: `btn-primary "Continue →"` (validates all users have at least one site, saves `site_user_access` rows). `btn-secondary "Back"`. `btn-secondary "Skip (assign later)"` — allowed but shows `alert-amber` "Unassigned users will not be able to access any site after activation. Assign them in Site Permissions before completing."

#### Step 3 — Backfill & Review

**Purpose:** Preview the backfill migration (assigning existing operational data to the default site) and confirm activation.

Content: A summary card: "Backfill Preview" showing counts of rows to be updated per table:

| Table | Rows to backfill | Target Site |
|---|---|---|
| `work_orders` | 1,243 | Default Site (FRZ-DEFAULT) |
| `license_plates` | 4,827 | Default Site |
| `stock_movements` | 8,901 | Default Site |
| [... 20 tables total] | | |

An `alert-amber` "Review carefully. After activation, data will be isolated to the assigned site. Users not assigned to a site will lose access immediately."

Checkboxes (all required to check before proceeding):
- "I understand that existing data will be assigned to the Default Site."
- "I have assigned all users to their correct sites."
- "I have reviewed the backfill preview above."

Action: `btn-primary "Activate Multi-Site"` (disabled until all checkboxes checked). Clicking opens MODAL-ACTIVATION-CONFIRM showing a final warning count (tables affected, users affected) with a `btn-danger "Confirm Activation"` inside the modal. On confirm: runs backfill migration, flips RLS policies, sets `multi_site_state = 'dual_run'`, then immediately to `activated`. Loading spinner with progress steps shown inline: "Running backfill... (847 / 1243)". On completion: redirect to `/multi-site` with toast `badge-green "Multi-site activated. Welcome to your network dashboard."`.

`btn-secondary "Back"`. `btn-danger "Cancel & Exit"` → `multi_site_state` stays at `wizard_in_progress`.

#### States

All steps: Loading (skeleton), populated, validation errors (inline per field), API error (`alert-red`).

Rollback accessible from MS-CFG settings screen (not from the wizard itself once `dual_run` is set).

---

## 4. Modals

### MODAL-SITE-CREATE / MODAL-SITE-EDIT

**Trigger:** "+ Add Site" button on MS-SIT list, or "Edit Site" on MS-SIT-D.
**Width:** 560px (standard).
**Title:** "Add Site" or "Edit Site — [Site Name]."

A 4-step wizard for creation; single-page form for edit.

**Wizard step tabs (creation only):** 1 Identity · 2 Modules · 3 Timezone & Currency · 4 Bootstrap Users.

**Step 1 — Identity:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| Site Code | text | Yes | Uppercase, alphanumeric+hyphen, unique per org, max 10 | `FRZ-UK` |
| Site Name | text | Yes | Min 2, max 100 | `Forza Warsaw` |
| Site Type | select | Yes | Plant / Warehouse / Office / Co-pack | `Plant` |
| Legal Entity | text | No | max 200 | `Forza Foods Ltd` |
| Country | select | Yes | ISO country list | `United Kingdom` |
| Address | textarea | No | max 300 | `123 Industrial Park, Manchester` |
| Notes | textarea | No | max 500 | Internal notes |
| Set as Default | toggle | No | Warns if current default exists | OFF |

**Step 2 — Modules:**

Checklist of all 15 modules. Pre-checked: same as org-level module toggles. Admin can disable specific modules for this site. Tooltip per module: "Disabling at site level hides this module from users scoped to this site."

**Step 3 — Timezone & Currency:**

| Field | Type | Required | Example |
|---|---|---|---|
| Timezone | select | Yes | `Europe/London` |
| UI Language | select | Yes | `en / pl / de / ro` |
| Currency | select | Yes | `GBP` |
| Data Residency Region | select | No, P2 | `eu-west-2` (shows `badge-amber "P2"` label) |

**Step 4 — Bootstrap Users:**

A compact user-assignment table (same pattern as Activation Wizard Step 2 but for this site only). Optional — can skip and assign later from Site Permissions.

**Actions (wizard):** `btn-primary "Next →"` / `btn-secondary "Back"` / `btn-secondary "Save as Draft"` (saves site in inactive state). On Step 4 final: `btn-primary "Create Site"`. On success: toast "Site [Name] created." and navigate to `/multi-site/sites/:id`.

**Edit form (single page):** Same fields as Step 1–3 combined in a scrollable single-page 2-column grid. Site Code locked (monospace read-only with tooltip "Site code cannot be changed after creation"). `btn-primary "Save Changes"`. `btn-secondary "Cancel"`.

---

### MODAL-IST-CANCEL

**Trigger:** "Cancel" action on IST list row or IST detail state bar.
**Width:** 560px.
**Title:** "Cancel Transfer IST-[n]."

Content: `alert-amber` "Cancelling this transfer will release all hard-locked LPs back to available status at [From Site]. This action cannot be undone."

| Field | Type | Required | Notes |
|---|---|---|---|
| Cancellation Reason | select | Yes | Options from `reference_tables['ist_cancellation_reasons']`: Supplier issue, Demand change, Quantity error, Logistic failure, Other |
| Notes | textarea | No | max 500 chars |

`btn-danger "Confirm Cancellation"` / `btn-secondary "Keep Transfer"`. On confirm: state → cancelled, LPs released, outbox event `transfer_order.cancelled` emitted, toast "Transfer IST-[n] cancelled. LPs released."

---

### MODAL-IST-AMEND

**Trigger:** "Amend" from IST list ⋮ menu (draft or planned state only).
**Width:** 560px.
**Title:** "Amend Transfer IST-[n]."

Shows only amendable fields: Planned Ship Date, ETA, Carrier Reference, Freight Cost, Cost Allocation Method, Notes. Item quantities cannot be changed via Amend (must cancel and recreate). `btn-primary "Save Changes"`. On save: audit log entry "IST amended by [user] at [time]," approvals remain valid unless ship date changes (ship date change resets from-site manager approval, shows `alert-amber` "Approval will be reset because the ship date changed.").

---

### MODAL-REPLICATION-RETRY

**Trigger:** "Retry" on a failed replication job, "Retry All Failed" button, or "Run Sync Now" on a master data row.
**Width:** 560px.
**Title:** "Retry Replication" or "Run Sync Now."

Shows count of entities / jobs to be retried. Entity type badges listed. A "Priority" select: Normal / High (high puts job at front of queue). `btn-primary "Start Retry"` / `btn-secondary "Cancel"`. On start: job status changes to `Retrying`, row pulsates amber in the queue table.

---

### MODAL-LANE-CREATE / MODAL-LANE-EDIT

**Trigger:** "+ Add Lane" or "Edit Lane" on MS-LANE.
**Width:** 560px.
**Title:** "Add Transport Lane" or "Edit Lane [LN-n]."

| Field | Type | Required | Notes |
|---|---|---|---|
| Lane Code | text | Yes | Auto-generated `LN-[n]`, editable |
| From Site | select | Yes | Active sites only |
| To Site | select | Yes | Must differ from From Site |
| Mode of Transport | select | Yes | Road / Rail / Air / Sea / Multimodal |
| Distance (km) | number | No | ≥ 0 |
| Scheduled Transit Time (days) | number | No | ≥ 0, used to auto-calculate ETA on IST |
| Carriers | multi-select text tags | No | Free-text carrier names |
| HAZMAT Allowed | toggle | — | Default OFF |
| Cold Chain Required | toggle | — | Default OFF |
| Customs Required | toggle | — | Default OFF |
| Max Shipment Weight (kg) | number | No | ≥ 0 |
| Notes | textarea | No | max 300 |
| Active | toggle | — | Default ON |

`btn-primary "Save"` / `btn-secondary "Cancel"`.

---

### MODAL-RATE-CARD-UPLOAD

**Trigger:** "Upload Rate Card" on lane detail Tab 2 or lane list ⋮ menu.
**Width:** 560px.
**Title:** "Upload Rate Card — [Lane Code]."

Step 1: File upload dropzone (accepts CSV, XLSX, max 5MB). Template download link: "Download rate card template." Step 2 (after upload): column mapping (Carrier, Rate Type, Rate Value, Currency, Effective From, Effective To). Step 3: preview table (first 5 rows). Step 4: confirm. `btn-primary "Upload"` / `btn-secondary "Cancel"`. On success: toast "Rate card uploaded. X rates added." If approval required: "Rate card submitted for approval."

---

### MODAL-SITE-CONFIG-OVERRIDE

**Trigger:** "+ Add Override" or "Edit" on Site Detail Config tab.
**Width:** 560px.
**Title:** "Set Site Config Override — [Site Name]."

| Field | Type | Required | Notes |
|---|---|---|---|
| Setting Key | searchable select or text | Yes | From predefined list of overridable keys + "Custom" option; examples: `shift_pattern`, `fefo_strategy`, `default_currency`, `language`, `quality_check_frequency` |
| L1 Base Value | display-only | — | Current org-level value shown in muted text below the key field; label "Organization default:" |
| Override Value | dynamic field | Yes | Input type changes based on key type: text for strings, number for numerics, select for enums, toggle for booleans |
| Effective From | date picker | No | Defaults to today |
| Notes | textarea | No | max 300 |

`btn-primary "Save Override"` / `btn-secondary "Cancel"`. On save: toast "Override saved for [Setting Key] at [Site Name]." Audit log entry.

**"Clear Override" confirmation modal:** `alert-amber` "Clearing this override will revert [Site Name] to the organization default of '[L1 value]'. This takes effect immediately." `btn-danger "Clear Override"` / `btn-secondary "Cancel"`.

---

### MODAL-PERMISSION-BULK-ASSIGN

**Trigger:** "+ Assign User to Site" on MS-PRM, or "+ Assign User" on Site Detail Users tab.
**Width:** 560px.
**Title:** "Assign User to Site."

| Field | Type | Required | Notes |
|---|---|---|---|
| User | searchable select | Yes | Shows name + email; all active org users |
| Site | searchable select | Yes | All active sites; pre-filled if opened from site context |
| Role at this site | select | Yes | site_manager / warehouse_operator / planner / quality_manager / quality_lead / auditor / viewer |
| Set as Primary Site | toggle | — | ON if this is user's only site assignment; OFF by default |
| Notes | text | No | max 200 |

`btn-primary "Assign"` / `btn-secondary "Cancel"`. On success: toast "[User Name] assigned to [Site Name] as [Role]."

Bulk mode: a tab "Bulk Assign" allows uploading a CSV (User Email, Site Code, Role) for mass assignment. File upload dropzone → column mapping → preview → confirm.

---

### MODAL-SITE-DECOMMISSION

**Trigger:** "Decommission" on Site Detail or Sites list ⋮ menu.
**Width:** 560px.
**Title:** "Decommission [Site Name]."

`alert-red` "Decommissioning a site is a significant operation. All operational data for this site will be archived and users will lose access. Historical records are retained for audit per the 7-year retention policy."

Impact summary: "This site has X active users, X open WOs, X LPs in stock, X open ISTs." Each non-zero count shown as a red warning badge.

Pre-conditions (must be met before confirming): display checklist with green/red status:
- No open work orders (link to close)
- No in-transit ISTs (link to manage)
- No open quality holds (link to release)
- All users reassigned to other sites (link to permissions)

If any pre-condition is not met: `btn-primary "Confirm Decommission"` is disabled with tooltip "Resolve all open items before decommissioning."

When all met: a text field appears: "Type the site code to confirm: [SITE-CODE]." Input must match exactly. Then: `btn-danger "Confirm Decommission"` enabled. `btn-secondary "Cancel"`. On confirm: site `active = false`, `activated_at = NULL`, all users' `site_user_access` records set `active = false`, audit log entry. Toast "Site [Name] decommissioned. Data archived and retained for 7 years."

---

### MODAL-ACTIVATION-CONFIRM

**Trigger:** "Complete Activation" in MS-CFG or final step of MS-ACT wizard.
**Width:** 560px.
**Title:** "Confirm Multi-Site Activation."

`alert-amber` "This will apply Row-Level Security policies to X operational tables and activate site-scoped data isolation. This operation takes approximately 30–60 seconds."

Summary: Tables affected: [list of 20 tables with counts]. Users activated: X. Sites activated: X.

`btn-danger "Confirm Activation"` (text danger to signal irreversibility at this stage) / `btn-secondary "Cancel"`. On click: spinner with step-by-step progress: "Applying RLS policies... (5/20 tables)" → "Updating user contexts..." → "Done." On success: redirect with toast "Multi-site is now active."

---

### MODAL-ROLLBACK-CONFIRM

**Trigger:** "Roll Back to Single-Site" in MS-CFG Settings.
**Width:** 560px.
**Title:** "Roll Back to Single-Site Mode."

`alert-red` "Rolling back will remove site-level data isolation (RLS policies will revert to org-scoped). Users will regain access to all data regardless of site assignment. This can only be done from 'Dual Run' state." (Rollback from `activated` requires contacting support — shown as static text if `multi_site_state = 'activated'`.)

Confirmation text field: "Type 'ROLLBACK' to confirm." `btn-danger "Confirm Rollback"` / `btn-secondary "Cancel"`. On confirm: RLS policies reverted, `multi_site_state = 'inactive'`, audit log entry. Toast "Rolled back to single-site mode."

---

## 5. Flows

### 5.1 Add Site (New Site Onboarding)

1. Admin navigates to Multi-Site module (must be in `activated` state).
2. Clicks "+ Add Site" on MS-SIT list → MODAL-SITE-CREATE opens.
3. Step 1 — Identity: fills site code `FRZ-DE`, name `KOBE Germany`, type `Warehouse`, country `Germany`, timezone `Europe/Berlin`. Clicks "Next."
4. Step 2 — Modules: verifies module selection. Deselects OEE (not yet needed at this site). Clicks "Next."
5. Step 3 — Timezone & Currency: confirms `Europe/Berlin`, language `de`, currency `EUR`. Clicks "Next."
6. Step 4 — Bootstrap Users: assigns 3 users to the site with roles. Clicks "Create Site."
7. System creates `sites` record, `site_user_access` records for assigned users, seeds `site_settings` with L1 defaults for all enabled modules.
8. Toast: "Site FRZ-DE created." Navigate to `/multi-site/sites/:new-id` Site Detail.
9. Admin configures L2 overrides on Config tab (e.g., sets `fefo_strategy = 'fefo_strict'` override for the German site).
10. Enables modules for the site (verifying each module is active for this site in Step 2 or the Modules tab).
11. Admin goes to MS-MDS to trigger initial master data sync run: "Run Sync Now" for all entities to FRZ-DE. Monitors Replication Queue until all synced.
12. Site is now operational. Admin sends a "Site Added" notification to the new site manager (notification from MS-CFG notifications).

---

### 5.2 Inter-Site Transfer — Happy Path

1. Planner navigates to `/multi-site/transfers/new`.
2. Selects From: `FRZ-UK`, To: `FRZ-DE`. System suggests Lane `LN-001 — Road DHL`.
3. Fills Ship Date `2026-04-22`, ETA `2026-04-24`, Freight Cost `£340`, Method `receiver`.
4. Adds 2 items: "Chicken Nuggets 1kg × 500 pcs" (pre-selects LP-0083: 200 pcs + LP-0084: 300 pcs), "Chicken Wings 2kg × 100 pcs" (no LP pre-selected — stock marginal).
5. Clicks "Create Transfer" → IST-0042 created in `draft` state. LP-0083 and LP-0084 hard-locked (`reserved`) at FRZ-UK.
6. System auto-generates: outbound shipment draft in 11-SHIPPING (`inter_site=true`), inbound GRN placeholder at FRZ-DE in 05-WAREHOUSE.
7. IST detail shows `draft` state. `alert-amber` "Pending from-site manager approval."
8. From-site manager (FRZ-UK manager) receives notification: "IST-0042 requires your approval." Opens IST detail, reviews items. Clicks "Approve (From Site)." `from_site_manager_approval_id` populated. State → `planned`.
9. From-site warehouse operator navigates to IST-0042. State = `planned`. Clicks "Confirm Shipment." Enters actual ship date (today) and confirms shipped qty per line. State → `shipped`. Outbox event `transfer_order.shipped` emitted. LP state at FRZ-UK changes to `in_transit`.
10. For cross-site IST: state automatically advances to `in_transit` once shipped (D-MS-3). Outbox event `transfer_order.in_transit` emitted.
11. At destination FRZ-DE: site manager receives notification "IST-0042 arriving today." Approves receipt in advance (optional pre-approval).
12. FRZ-DE warehouse operator scans arriving goods. Navigates to IST-0042. Clicks "Receive Goods (GRN)." Completes GRN at FRZ-DE: enters received qty per line, scans LP barcodes or confirms auto-detected LPs. Confirms receipt.
13. State → `received`. Outbox event `transfer_order.received` emitted. `to_site_manager_approval_id` populated (auto if pre-approved). New LPs created at FRZ-DE in 05-WAREHOUSE (or existing LPs transferred). `lp_genealogy.transfer_order_id` updated for full traceability chain.
14. Finance tab: `badge-amber "Pending"` finance status. Finance user posts inter-company charge: journal entry created in 10-FINANCE for both sites (FRZ-UK: freight expense / FRZ-DE: freight payable). Finance status → `posted`.
15. Admin or site manager clicks "Close IST." State → `closed`. Audit trail complete.

---

### 5.3 Master Data Replication — Conflict Scenario

1. HQ admin changes `items.unit_cost` for "Chicken Nuggets 1kg" from £12.40 to £13.10 (recorded at org level).
2. Nightly replication job at 03:00 UTC picks up the change. Job REP-4900 runs for all sites.
3. At FRZ-DE, a site-level price override was set 2 days ago (site manager set £11.95 via a local data correction). The replication system detects a conflict: site value (£11.95) ≠ incoming org value (£13.10).
4. Job REP-4900 completes with 1 conflict. Status: `Completed with Errors`. Replication Queue shows `badge-red "1 Conflict"`.
5. Admin receives a notification: "Replication conflict detected: Items [PRD-0042] at FRZ-DE. Resolution required."
6. Admin navigates to MS-MDS. Filters by `Status = Conflict`. Sees PRD-0042 / FRZ-DE row. Clicks "Resolve Conflicts."
7. MODAL-CONFLICT-RESOLVE opens. Diff shows: `unit_cost` Source £13.10 vs Site £11.95. Admin selects "Source" (org-level wins). Reason: "HQ data is authoritative." Clicks "Apply Resolution."
8. The FRZ-DE `items.unit_cost` updated to £13.10. Conflict resolved. Audit log entry written. MS-MDS row changes to `badge-green "Synced"`.
9. Site manager at FRZ-DE receives notification: "Master data conflict for PRD-0042 was resolved. Unit cost updated to £13.10."

---

### 5.4 Site Config Override — FEFO Strategy

1. FRZ-DE site manager notices that the site needs FEFO strict mode (default org setting is `fefo_advisory`).
2. Navigates to `/multi-site/sites/frz-de-id` → Config tab.
3. Clicks "+ Add Override." MODAL-SITE-CONFIG-OVERRIDE opens.
4. Selects Setting Key: `fefo_strategy`. L1 Base Value shows: `fefo_advisory`. Override Value: selects `fefo_strict` from the enum options.
5. Adds note: "German food safety audit requires strict FEFO enforcement."
6. Clicks "Save Override." Toast: "Override saved for fefo_strategy at FRZ-DE."
7. FRZ-DE site now applies strict FEFO. FRZ-UK is unaffected (still `fefo_advisory`). The site_settings row shows `source = 'l2_override'`.
8. Warehouse operators at FRZ-DE now see hard blocks (not just warnings) when picking out of FEFO order, as defined by the `fefo_strategy_v1` DSL rule reading `current_site_id()` setting.

---

### 5.5 Site Decommission

1. Admin plans to decommission the office site "FRZ-OFFICE-LND" (no longer needed).
2. Navigates to MS-SIT, finds the site, clicks ⋮ → Decommission. MODAL-SITE-DECOMMISSION opens.
3. Modal shows pre-condition checklist: Open WOs: 0 (green), In-transit ISTs: 0 (green), Quality Holds: 0 (green), Unassigned users: 2 (red — 2 users are assigned only to this site).
4. Admin clicks the red "2 unassigned users" link → navigates to MS-PRM, reassigns both users to other sites. Returns to Sites list.
5. Re-opens Decommission modal. All pre-conditions now green. Confirmation text field visible.
6. Types `FRZ-OFFICE-LND` → `btn-danger "Confirm Decommission"` activates.
7. Confirms. System: sets `sites.active = false`, sets all related `site_user_access.active = false`, writes audit log. Toast: "FRZ-OFFICE-LND decommissioned. Data retained for 7 years."
8. Site disappears from Sites list (filter "Active" is default). Still visible in the list when filter set to "All" with `badge-gray "Inactive"` status.

---

### 5.6 Multi-Site Analytics — Inventory Rebalance

1. Ops director navigates to `/multi-site/analytics`. Site selector is "All Sites."
2. Tab: Inventory Balance. Bar chart shows FRZ-UK at 72% of network inventory, FRZ-DE at 28%. Network average per site: 50%.
3. System flags: `alert-amber` "FRZ-DE has a low inventory balance (28%) relative to the network average." Rebalance Suggestions card shows: "Suggest IST: FRZ-UK → FRZ-DE, Chicken Nuggets 1kg × 300 pcs, estimated freight £180."
4. Ops director clicks "Create Suggested Transfer" → IST Create form opens pre-filled: From FRZ-UK, To FRZ-DE, item PRD-0042 × 300 pcs, Lane LN-001.
5. Planner reviews and adjusts qty to 250 pcs, clicks "Create Transfer." IST-0043 created in draft state.
6. Flow continues per §5.2 happy path.

---

## 6. Empty / Zero / Onboarding States

### Single-Site Install (module not yet activated)

The Multi-Site sidebar entry is visible only to admin users, with a `badge-amber "Setup"` tag. All other users do not see the entry. The dashboard route `/multi-site` shows a full-page onboarding card: illustration of a network with a single highlighted node, heading "Multi-Site Operations," subtitle "Your organization is currently operating in single-site mode. Activate Multi-Site to manage multiple plants, warehouses, or offices from one platform." `btn-primary "Activate Multi-Site"` → `/multi-site/activate`. `btn-secondary "Learn More"` → help article.

### Second Site Added (activation just completed, 2 sites)

Network Dashboard shows the tree view with 2 nodes (org root + 2 sites). An `alert-blue` onboarding strip: "Welcome to Multi-Site! You have activated 2 sites. Next steps: (1) Set up transport lanes, (2) Configure L2 overrides per site, (3) Run your first inter-site transfer." Each "next step" is a blue link to the relevant screen.

### No ISTs Created Yet

MS-IST list empty state: centered two-building icon, "No inter-site transfers yet," subtitle "Create your first transfer to move goods between sites." `btn-primary "+ New Transfer"`.

### No Transport Lanes

MS-LANE empty state: "No transport lanes configured. Lanes streamline IST creation by providing default carriers, lead times, and freight rates between your sites." `btn-primary "+ Add Lane"`.

### Replication Queue — All Clear

MS-REP Active Jobs tab: `alert-green` full-width "All replication jobs completed. Master data is synchronized across all sites." Green checkmark icon. Last full sync timestamp.

### Master Data Sync — First Sync

MS-MDS empty state (before first replication run after activation): `alert-blue` "Master data has not been synced to your sites yet. Run the initial sync to populate all sites with organization-level data." `btn-primary "Run Initial Sync"` → MODAL-REPLICATION-RETRY with all entities.

---

## 7. Notifications, Toasts, and Alerts

### Toast Messages (brief, 3–5 seconds, bottom-right)

| Trigger | Toast text | Color |
|---|---|---|
| Site created | "Site [Name] created successfully." | green |
| Site saved | "Site [Name] updated." | green |
| IST created | "Transfer IST-[n] created. Pending from-site approval." | blue |
| IST approved (from) | "IST-[n] approved by [User]. Ready to ship." | green |
| IST shipped | "IST-[n] marked as shipped. In transit to [Site]." | blue |
| IST received | "IST-[n] received at [Site]. GRN complete." | green |
| IST closed | "IST-[n] closed and archived." | green |
| IST cancelled | "IST-[n] cancelled. LPs released." | amber |
| Conflict resolved | "Conflict resolved for [Entity] at [Site]." | green |
| Replication job started | "Sync started for [Entity Type]. This may take a few minutes." | blue |
| Replication job failed | "Replication job failed. [View details link]." | red |
| Site switched | "Switched to [Site Name]." | blue |
| Config override saved | "Override saved for [Key] at [Site Name]." | green |
| Lane created | "Transport lane [LN-n] created." | green |
| Rate card uploaded | "Rate card uploaded. X rates added." | green |
| User assigned to site | "[User] assigned to [Site] as [Role]." | green |
| User removed from site | "[User] removed from [Site]." | amber |
| Site decommissioned | "[Site Name] decommissioned. Data retained for 7 years." | amber |

### Persistent Alert Banners (visible until dismissed or resolved)

| Condition | Banner text | Color | Dismissible |
|---|---|---|---|
| Site offline (heartbeat missed) | "Site [Name] is offline. Data may be stale. Check connectivity." | red | No (auto-clears when site reconnects) |
| Replication conflict exists | "X replication conflict(s) require resolution. [Resolve now link]." | red | No |
| Lane SLA breach | "Transport lane [LN-n] has not received an IST in 30+ days and may be stale." | amber | Yes (per-lane) |
| IST overdue | "IST-[n] is overdue by [n] days. ETA was [date]. [View IST link]." | red | Yes (per-IST) |
| Rate card expiring | "Rate card for lane [LN-n] expires in 7 days. Upload a new rate card to maintain freight cost calculations." | amber | Yes |
| Cross-site user added | "You have been granted access to [Site Name] as [Role]. [Switch to site link]." | blue | Yes |
| FX rate missing | "FX rate for [GBP → EUR] is missing. Inter-site freight cost calculations may be inaccurate. [Open Finance FX link]." | amber | Yes |
| Activation incomplete | "Multi-site activation is in progress (Step X of 3). [Continue setup link]." | amber | No |

### In-App Notifications (bell icon, notification center)

All significant IST state changes, replication conflict detections, site offline events, and approval requests generate in-app notifications routed to the relevant personas. Format: "[entity type] [action]: [brief description]" with a timestamp and a direct link to the relevant screen. Unread notifications show a red dot badge on the bell icon in the top bar.

---

## 8. Responsive Notes

The Multi-Site module is primarily a desktop product. Target viewport is 1280px+ wide.

**Network Dashboard (MS-NET):** At 1024px (tablet), the two-column layout (Network View + Transfer/Replication panels) collapses to a single column. The Network Tree View scales cleanly. The Map View (P2) requires a minimum 900px viewport; below that it shows a notice "Map view is best experienced on a larger screen. [Switch to Tree View link]."

**Sites List (MS-SIT):** Table horizontally scrollable on viewports < 1024px. Columns "Owner," "Modules Enabled," and "Users" hidden on tablet. An `alert-blue` bottom banner: "For full table view, use a desktop browser."

**IST List and Detail (MS-IST, MS-IST-D):** The IST list collapses Freight Cost and Lane columns on tablet. IST detail tabs collapse to an accordion on mobile (< 768px).

**Permissions Matrix (MS-PRM):** Matrix View requires desktop (min 1024px). On tablet, automatically switches to User View. An `alert-blue` notice: "Matrix view is available on desktop. Showing User View."

**Analytics (MS-ANA):** Charts and tables scroll horizontally on tablet. Single-column layout. Benchmark comparison table shows 3 columns max on tablet, rest accessible via horizontal scroll.

**Modals:** All 560px modals remain centered and scroll vertically on tablet. On mobile (< 640px), modals become full-width full-height bottom sheets.

**Conflict Resolution Modal (760px):** On viewports < 800px, the side-by-side diff collapses to a stacked layout (Source above, Site below per field).

---

## 9. Open Questions for Designer

1. **Map library choice:** The Network Map View (P2) requires a geographic map rendering library. Candidate options: Leaflet.js (open-source, lightweight), Mapbox GL (commercial, best aesthetics), React-Simple-Maps (SVG-based, no tile dependency). Choice affects bundle size and offline capability. Decision deferred to the design/engineering sync.

2. **Conflict resolution e-signature requirement:** The PRD marks the e-signature gate for cross-site data overrides as configurable (off by default). The designer should prototype both the "with e-signature" and "without e-signature" flows. The gate requires a password re-entry input field inside the modal. Confirm with the product owner whether e-signature is needed for the Forza baseline.

3. **Timezone display convention:** Should timestamps across the Multi-Site module display in the user's local browser timezone (user-centric) or in the site's configured timezone (site-centric)? The PRD recommends user timezone as the default (per MS-CFG Section 4 toggle). The designer should prototype both states of the toggle. For site-specific timestamps (e.g., shift start times on the Site Detail Overview tab), the site's timezone should always be shown with the site offset in parentheses, e.g., "08:00 (Europe/London UTC+1 BST)."

4. **Site decommission retention period display:** The UI currently references "7 years" as the data retention period (inherited from 02-SETTINGS §14). Verify with legal/compliance whether this period should be displayed to the user, or whether the decommission modal should simply state "Data is retained per your organization's retention policy" to avoid hardcoding a regulatory commitment.

5. **IST approval workflow — notification vs. in-app action:** For dual-gate IST approval (from-site + to-site manager), should the manager be able to approve directly from an email notification (deep-link with one-click approve token), or is in-app-only approval sufficient for P1? The Forza baseline lean is in-app only; email notification links to the IST detail page. Confirm before implementing.

6. **Hierarchy config edit — migration impact:** When an admin changes the `sites_hierarchy_config.depth` from 3 to 4 (adding a "Building" level between Site and Plant), existing site records have no parent assigned at the new level. The designer should consider whether a post-edit wizard step is needed: "Assign buildings to existing sites." The PRD defers migration tooling, so the P1 behavior is to simply add the new level name without backfilling.

7. **Cross-site analytics charting library:** The Analytics screen (MS-ANA) references bar and line charts. The designer should confirm whether to use a CSS-only approach (bars as styled divs with `width` in percent) for the prototype, or use a lightweight library (Chart.js, D3) to demonstrate realistic data visualization. CSS-only is sufficient for the HTML prototype phase.

---

*End of 14-MULTI-SITE UX Specification v1.0*
