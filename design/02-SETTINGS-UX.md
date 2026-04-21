# 02-SETTINGS — UX Specification (for prototype generation)

> **Purpose:** Self-contained design brief for Claude Design to generate interactive HTML prototypes. Every screen, modal, state, field, column, button, and flow is described in enough detail that a designer needs no additional input.
>
> **Source authority:** PRD 02-SETTINGS v3.0 (2026-04-19) overrides archive wireframes wherever they conflict.

---

## 0. Module Overview

**Module code:** `02-SETTINGS`
**Role:** Admin foundation — every other module depends on this.
**Primary personas:** Owner, Admin, Module Admin, Auditor, NPD Manager (Jane).
**Sub-areas:**
1. Settings landing / dashboard
2. Organization profile
3. Users, Roles, Permissions, Invitations
4. Onboarding wizard (6 steps)
5. Schema admin wizard (L1/L2/L3/L4 tier management, L1 promotion flow)
6. Rule Definitions Registry — **read-only** (dev-authored via PR pipeline)
7. Reference CRUD — 11 tables, generic metadata-driven UI
8. Multi-tenant L2 config (dept split/merge, upgrade orchestration)
9. Module toggles + feature flags (PostHog self-host + built-in fallback)
10. D365 Constants admin [LEGACY-D365] — 5 Forza constants + feature flag
11. Infrastructure (warehouses, locations, machines, production lines)
12. Email config (Resend activation, templates, notification preferences)
13. Security (password policy, sessions, MFA, i18n pl/en+uk/ro)
14. API keys, Webhooks, Audit logs

**Build sequence:** 02-SETTINGS-a (Org/Users/RBAC/Audit) → b (Toggles/Flags/L2) → c (Schema wizard) → d (Rule registry/Reference CRUD) → e (Infrastructure/D365/Email/Onboarding/Security).

---

## 1. Design System (Inherited)

All values below come from `MONOPILOT-SITEMAP.html` CSS variables and class definitions. Use these tokens by name throughout.

### Color tokens

| Token name | Hex | Use |
|---|---|---|
| `--blue` / `primary` | `#1976D2` | Primary actions, active states, links |
| `--green` / `kpi-green` | `#22c55e` | Success, active badges, positive KPIs |
| `--amber` / `badge-amber` | `#f59e0b` | Warning, pending, caution |
| `--red` / `badge-red` | `#ef4444` | Error, danger, destructive actions |
| `--info` | `#3b82f6` | Informational alerts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Global sidebar background (dark slate) |
| `--card` | `#ffffff` | Card / panel background |
| `--text` | `#1e293b` | Body text |
| `--muted` | `#64748b` | Secondary labels, table headers, descriptions |
| `--border` | `#e2e8f0` | Borders, dividers |
| `--radius` | `6px` | Default border-radius |

### Badge styles

| Class | Background | Text | Use |
|---|---|---|---|
| `badge-green` | `#dcfce7` | `#166534` | Active, enabled, completed |
| `badge-amber` | `#fef3c7` | `#92400e` | Pending, draft, warning |
| `badge-red` | `#fee2e2` | `#991b1b` | Error, failed, disabled |
| `badge-blue` | `#dbeafe` | `#1e40af` | Info, L1/L2 tier labels |
| `badge-gray` | `#f1f5f9` | `#475569` | Neutral, archived |
| `badge-modal` | `#dbeafe` | `#1976D2` | Clickable badge opening a modal |

### Typography

- **Font family:** Inter, system-ui, -apple-system, sans-serif
- **Base size:** 14px / line-height 1.4
- **Page title:** 20–24px, font-weight 700
- **Section header:** 12px, uppercase, font-weight 700, letter-spacing 0.08em, color `--muted`
- **Table header:** 12px, font-weight 600, color `--muted`, background `#f8fafc`
- **Table cell:** 13px
- **Form label:** 12px, font-weight 500, color `#374151`
- **Badge:** 11px, font-weight 500

### Spacing & layout

- **Global sidebar width:** 220px fixed, background `--sidebar`, color `#cbd5e1`
- **Settings inner sidebar (second nav):** 256px fixed, background `bg-muted/10`, right border `--border`, padding 16px
- **Main content area:** left margin = 220px (global) + 256px (settings nav) = 476px from left edge; padding 24px; background `--bg`
- **Card padding:** 16px (compact) or 20–24px (standard)
- **Modal width:** 560px fixed, max-height 80vh, padding 20px, border-radius 8px, overlay `rgba(0,0,0,0.5)`
- **Grid gap:** 12px (tight) or 24px (standard)
- **Border-radius:** 6px cards/badges, 4px inputs/buttons, 8px modals

### Component tokens

**Buttons:**
- `btn-primary`: background `--blue`, color white, padding 6px 14px, border-radius 4px, font-size 12px
- `btn-secondary`: background white, color `--text`, border `--border`
- `btn-danger`: background `--red`, color white
- `btn-success`: background `--green`, color white

**KPI card:** white background, 1px border `--border`, border-radius 6px, padding 12px 14px, 3px colored bottom border. Label 11px muted, value 26px bold.

**Alert strip:** padding 10px 14px, border-radius 6px, 4px left border. Variants: `alert-red`, `alert-amber`, `alert-blue`, `alert-green`.

**Table:** width 100%, border-collapse collapse. `th` background `#f8fafc`, 2px bottom border. `tr:hover td` background `#f8fafc`.

**Form input:** width 100%, padding 7px 10px, border 1px `--border`, border-radius 4px, font-size 13px. Focus: border `--blue`, box-shadow `0 0 0 2px rgba(25,118,210,.15)`.

**Tabs:** border-bottom 2px `--border`. Active tab: color `--blue`, border-bottom-color `--blue`, font-weight 600.

---

## 2. Information Architecture

### Global sidebar entry

- **Icon:** ⚙️
- **Label:** Settings
- **Group:** CORE
- **Route prefix:** `/settings`
- **Active indicator:** 3px left border `--blue`, background `#1e3a5f`, text white

### Settings inner sidebar (second nav rail)

Appears on every Settings page. Fixed 256px wide, positioned immediately right of the global 220px sidebar. Sections and items:

**ORGANIZATION**
- Organization Profile → `/settings/organization`

**USERS & ROLES**
- Users → `/settings/users`
- Roles & Permissions → `/settings/roles`
- Invitations → `/settings/invitations`

**SCHEMA & RULES** *(new in v3.0)*
- Schema Browser → `/settings/schema`
- Schema Migrations Queue → `/settings/schema/migrations`
- Rule Registry → `/settings/rules`

**REFERENCE DATA**
- Reference Tables → `/settings/reference`
- (each table accessible at `/settings/reference/:table_code`)

**TENANT CONFIG** *(Phase 2)*
- Tenant Variations → `/settings/tenant`
- Upgrade Orchestration → `/settings/tenant/upgrades`

**MODULES & FLAGS**
- Module Toggles → `/settings/modules`
- Feature Flags → `/settings/flags`

**INTEGRATIONS**
- D365 Constants → `/settings/d365`
- API Keys → `/settings/api-keys`
- Webhooks → `/settings/webhooks`
- Email Config → `/settings/email`

**INFRASTRUCTURE**
- Warehouses → `/settings/warehouses`
- Locations → `/settings/locations`
- Machines → `/settings/machines`
- Production Lines → `/settings/production-lines`

**MASTER DATA**
- Allergens → `/settings/allergens`
- Tax Codes → `/settings/tax-codes`

**SYSTEM**
- Audit Logs → `/settings/audit-logs`
- Security → `/settings/security`
- Notifications → `/settings/notifications`
- Sessions → `/settings/sessions`
- Import / Export → `/settings/import-export`

**ONBOARDING**
- Setup Wizard → `/settings/onboarding`

Items that are permission-filtered: items in SCHEMA & RULES visible to `owner`, `admin`, `auditor`. TENANT CONFIG visible to `owner`, `superadmin`. INTEGRATIONS > D365 visible to `owner`, `admin`, `npd_manager`. SYSTEM items visible to `owner`, `admin`, `auditor`. Disabled items show `[Soon]` badge, opacity 50%, cursor not-allowed.

### Route map

```
/settings                             SET-000  Settings Dashboard
/settings/organization                SET-007  Organization Profile
/settings/users                       SET-008  User List
/settings/users/invite                         Invite modal (opens inline)
/settings/roles                       SET-011  Roles & Permissions
/settings/invitations                 SET-010  Pending Invitations
/settings/onboarding                  SET-001  Onboarding Wizard Launcher
/settings/onboarding/org              SET-002  Step 1 — Org Profile
/settings/onboarding/warehouse        SET-003  Step 2 — First Warehouse
/settings/onboarding/location         SET-004  Step 3 — First Location
/settings/onboarding/product          SET-005  Step 4 — First Product (redirect)
/settings/onboarding/workorder        SET-006a Step 5 — First WO (redirect)
/settings/onboarding/complete         SET-006b Step 6 — Completion
/settings/schema                      SET-030  Schema Browser
/settings/schema/new                  SET-031  Column Edit Wizard
/settings/schema/diff/:id             SET-032  Schema Diff Viewer
/settings/schema/migrations           SET-033  Schema Migrations Queue
/settings/schema/preview              SET-034  Shadow Preview
/settings/rules                       SET-040  Rule Registry
/settings/rules/:rule_code            SET-041  Rule Detail
/settings/rules/:rule_code/diff/:v    SET-042  Rule Version Diff
/settings/reference                   SET-050  Reference Tables Index
/settings/reference/:table_code       SET-051  Reference Table Detail
/settings/reference/:table_code/import SET-053 CSV Import Wizard
/settings/tenant                      SET-060  Tenant Variations Dashboard
/settings/tenant/depts                SET-061  Dept Taxonomy Editor
/settings/tenant/rules                SET-062  Rule Variant Selector
/settings/tenant/upgrades             SET-063  Upgrade Orchestration
/settings/tenant/history              SET-064  Migration History
/settings/modules                     SET-070  Module Toggles Dashboard
/settings/flags                       SET-071  Feature Flags (Core + PostHog)
/settings/d365                        SET-080  D365 Connection Config
/settings/d365/constants              SET-081  D365 Constants Editor
/settings/d365/sync                   SET-082  Sync Config
/settings/d365/audit                  SET-083  Sync Audit
/settings/api-keys                    SET-023  API Keys List
/settings/webhooks                    SET-024  Webhooks List
/settings/email                       SET-090  Email Config Editor
/settings/email/preview               SET-091  Email Template Preview
/settings/email/log                   SET-093  Email Delivery Log
/settings/warehouses                  SET-012  Warehouse List
/settings/locations                   SET-014  Location Tree
/settings/machines                    SET-016  Machine List
/settings/production-lines            SET-018  Production Line List
/settings/allergens                   SET-020  Allergen Management
/settings/tax-codes                   SET-021  Tax Code List
/settings/audit-logs                  SET-025  Audit Logs
/settings/security                    SET-026  Security Settings
/settings/notifications               SET-027  Notification Preferences
/settings/sessions                    SET-030b Session Management
/settings/import-export               SET-029  Import / Export
```

### Permissions matrix

| Screen area | `owner` | `admin` | `module_admin` | `npd_manager` | `auditor` | `viewer` |
|---|---|---|---|---|---|---|
| Organization Profile | RW | RW | R | R | R | — |
| Users / Roles / Invitations | RW | RW | — | — | R | — |
| Schema Browser | RW | RW | R | R | R | — |
| Schema Column Edit (L2/L3) | RW | RW | — | — | — | — |
| L1 Promotion | RW | — | — | — | — | — |
| Rule Registry | R | R | R | R | R | — |
| Reference CRUD | RW | RW | RW (own module) | RW | R | — |
| Tenant Variations / Upgrades | RW | R | — | — | R | — |
| Module Toggles | RW | RW | — | — | R | — |
| Feature Flags | RW | RW | — | — | R | — |
| D365 Constants | RW | RW | — | RW | R | — |
| Infrastructure (Warehouses etc.) | RW | RW | RW | — | R | — |
| Email Config | RW | RW | — | — | R | — |
| Security | RW | RW | — | — | R | — |
| Audit Logs | R | R | R | R | R | — |
| API Keys / Webhooks | RW | RW | — | — | R | — |
| Sessions | RW | RW | — | — | R | — |

`superadmin` (Monopilot staff): full RW on all screens + impersonation tooling.

---

## 3. Screens

---

### SET-000 — Settings Dashboard

**Route:** `/settings`
**Purpose:** Entry point showing organization summary, quick-access cards for all Settings areas, and recent audit activity.

**Layout:**
The page uses the full Settings layout shell: global sidebar (220px) on far left, Settings inner sidebar (256px) next, then main content area. The content area is divided into three vertical regions: (1) a page header row with title "Settings" and subtitle text, (2) an Organization Summary card spanning full width, (3) a Quick Access section using a 3-column card grid (desktop), and (4) a Recent Activity feed card at the bottom.

**Organization Summary Card:**
- Logo thumbnail 80×80px (rounded, border `--border`); if no logo, show initials placeholder with `--blue` background
- Organization name: 20px bold
- Row: City, Country, timezone in parens — 13px, color `--muted`
- Row: contact email · contact phone — 13px, `--muted`
- Right-aligned link button `btn-secondary` "Edit Organization Profile →" navigates to `/settings/organization`

**Quick Access Cards (6):** arranged in `grid-3` (3 cols, gap 24px). Each card is a white card with `--border`, padding 20px, border-radius 6px, hover background `#f8fafc`.

| # | Icon | Title | Stats shown | Link target |
|---|---|---|---|---|
| 1 | 👥 | Users & Roles | X users · X roles · X pending invites | `/settings/users` |
| 2 | 🏭 | Infrastructure | X warehouses · X machines · X lines | `/settings/warehouses` |
| 3 | ⚠️ | Master Data | X allergens · X tax codes · X ref tables | `/settings/allergens` |
| 4 | 🔗 | Integrations | X API keys · X webhooks · D365 badge | `/settings/api-keys` |
| 5 | 🧩 | System & Schema | X modules enabled · X rules · X schemas | `/settings/modules` |
| 6 | 🔒 | Security | Last login: Xh ago · Session: Active | `/settings/security` |

Card layout: icon (32px, top-left), title (16px bold), description (13px `--muted`), stats block (13px, 3 lines), action link (`text-primary` with →).

**Recent Activity Feed:** white card, title "Recent Activity" (14px bold), list of 5 timeline entries. Each entry: colored dot (8px circle), action text (13px), timestamp right-aligned (11px `--muted`). Below list: link "View All Audit Logs →" navigates to `/settings/audit-logs`.

**Primary action:** `btn-primary` "Start Setup Wizard" shown in empty state only.

**States:**

*Loading:* Skeleton shimmer for header text, org summary card, all 6 quick-access cards, and activity feed. "Loading settings..." label below cards.

*Empty (new org):* Hide quick-access grid. Show centered illustration (⚙️ icon, 64px), heading "Welcome to MonoPilot!", subtitle "Let's get your organization set up in 15 minutes.", two buttons: `btn-primary` "Start Setup Wizard" → `/settings/onboarding`; `btn-secondary` "Skip and Configure Manually" (stays on page, shows cards with 0 stats).

*Populated:* All sections visible with live data.

*Error:* Centered ⚠️ icon, "Failed to Load Settings Dashboard", error code `ORG_CONTEXT_FETCH_FAILED`, buttons `btn-secondary` "Retry" and "Contact Support".

*Permission-denied:* If user role has no access to any card, redirect to `/dashboard` with toast "Insufficient permissions for Settings".

**Modals opened:** none directly.

**Microcopy:** Subtitle: "Configure your organization, manage users, and customize system preferences." Card CTA: "Manage →" or "View Settings →". Empty state: "Complete the setup wizard to configure essential settings."

---

### SET-007 — Organization Profile

**Route:** `/settings/organization`
**Purpose:** Edit core organization identity: name, logo, timezone, locale, currency, GS1 prefix, region.

**Layout:** Settings shell + inner sidebar. Content area: SettingsLayout with title "Organization Profile" and description "Manage your organization's basic information and settings." Below divider: single card with a 2-column form grid (left col 1fr, right col 1fr, gap 12px), logo upload section at top spanning full width.

**Logo upload section:** Current logo displayed as 96×96px rounded rectangle. Below: `btn-secondary` "Upload Logo" (accepts PNG/JPG/SVG, max 2MB). Remove link if logo exists. Validation: max 2MB, image types only. Error inline: "File too large (max 2MB)."

**Form fields (all in 2-column grid unless noted):**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| Company Name | text | Yes | min 2, max 100 | "Forza Foods Ltd" |
| Slug | text | Yes | lowercase, alphanumeric+hyphen, unique | "forza-foods" — auto-generated, editable |
| Legal Name | text | No | max 200 | "Forza Foods Limited" |
| Timezone | select | Yes | enum (IANA tz list) | "Europe/Warsaw" |
| Locale | select | Yes | pl / en / uk / ro | "pl" |
| Currency | select | Yes | ISO 4217 | "PLN" |
| GS1 Prefix | text | No | regex `^\d{7,9}$` | "5901234" |
| Region | select | Yes, locked post-onboarding | eu / us / apac | "eu" — shows locked badge after onboarding |
| Tier | display-only | — | L1/L2/L3/L4 | `badge-blue` "L2" |

Region field: after onboarding completed, show `badge-gray` "Locked — contact support to change" and disable the select.

**Primary action:** `btn-primary` "Save Changes" — on success, toast "Organization profile saved."
**Secondary action:** `btn-secondary` "Discard Changes" — resets form to last-saved state.

**States:**

*Loading:* Skeleton for logo box and all form fields.

*Populated:* Form pre-filled with current org data. Save button disabled until changes made (dirty state detection).

*Error (save):* Inline alert `alert-red` below form: "Failed to save. Please try again." with field-level errors if validation fails.

*Permission-denied:* Form fields all disabled, `btn-primary` hidden, `alert-blue` banner "View only — contact your owner to make changes."

**Microcopy:** Slug helper: "Used in URLs and API references. Cannot be changed after 30 days." GS1 helper: "Your company prefix for barcode generation." Region helper: "Data residency region. Cannot be changed after account setup."

---

### SET-008 — User List

**Route:** `/settings/users`
**Purpose:** View, search, filter, and manage all users in the organization.

**Layout:** SettingsLayout title "User Management" + description. Content: action bar (top-right `btn-primary` "Invite User", left: search input + role filter dropdown + status filter). Below: data table.

**Action bar:**
- Search input: placeholder "Search by name or email…", width ~280px, icon magnifying glass left
- Role filter: select dropdown, options: All Roles, Owner, Admin, NPD Manager, Module Admin, Planner, Production Lead, Quality Lead, Warehouse Operator, Auditor, Viewer
- Status filter: select, options: All, Active, Inactive, Invited
- `btn-primary` "Invite User" → opens MODAL-INVITE-USER
- `btn-secondary` "Export CSV" — downloads current filtered list

**Table columns:**

| Column | Type | Width | Notes |
|---|---|---|---|
| Name | text + avatar | 200px | 32px avatar circle (initials fallback) + full name |
| Email | text | 200px | monospace-ish, truncated with tooltip |
| Role | badge | 130px | `badge-blue` for admin roles, `badge-gray` for standard |
| Status | badge | 100px | `badge-green` Active, `badge-amber` Invited, `badge-gray` Inactive |
| Last Login | relative time | 120px | "2h ago", "Never", "3 days ago" |
| Actions | icon buttons | 80px | ✏️ Edit (opens MODAL-USER-EDIT), ⋮ menu: Deactivate / Resend Invite / Remove |

**Row actions (⋮ menu):**
- Resend Invite (only if status = Invited)
- Deactivate (only if status = Active) → opens MODAL-CONFIRM-DEACTIVATE
- Reactivate (only if status = Inactive)
- Remove User → opens MODAL-CONFIRM-DELETE

**States:**

*Loading:* 5 skeleton rows with shimmer.

*Empty (no users):* Centered icon 👥, "No users yet", subtitle "Invite your first team member to get started.", `btn-primary` "Invite User".

*Empty (filtered):* "No users match your search. Try adjusting your filters." link "Clear filters".

*Populated:* Table with pagination (25 rows/page, page selector bottom-right).

*Error:* `alert-red` "Failed to load users. Retry."

**Modals opened:** MODAL-INVITE-USER, MODAL-USER-EDIT, MODAL-CONFIRM-DEACTIVATE, MODAL-CONFIRM-DELETE.

**Microcopy:** Table empty state action: "Invite User." Deactivated users count shown in footer: "X of Y users active."

---

### SET-010 — Pending Invitations

**Route:** `/settings/invitations`
**Purpose:** View and manage outstanding user invitations.

**Layout:** SettingsLayout "Pending Invitations". Action bar: `btn-primary` "Invite User". Table below.

**Table columns:** Email | Role | Invited By | Invited At | Expires At | Status | Actions.

Status badge: `badge-amber` Pending, `badge-red` Expired, `badge-green` Accepted.

Actions: Resend (if Pending/Expired), Revoke (if Pending).

**States:** Empty: "No pending invitations." Loading: skeleton rows.

---

### SET-011 — Roles & Permissions

**Route:** `/settings/roles`
**Purpose:** View the 10 system roles and their permission sets; open permission matrix for detail.

**Layout:** SettingsLayout "Roles & Permissions" + description "System roles define what each team member can access. Custom roles available in Enterprise plan." Tabs: [System Roles] [Custom Roles (Phase 3, disabled with Soon badge)].

**Roles table:**

| Column | Type | Notes |
|---|---|---|
| Role Name | text bold | e.g. "Owner", "Admin", "NPD Manager" |
| Code | badge-gray monospace | `owner`, `admin`, `npd_manager` |
| Users Assigned | number | count badge |
| Scope | text | "Full system" / "Module-scoped" |
| Actions | — | 👁️ View Permissions (opens MODAL-PERMISSION-MATRIX) |

System roles (10 rows): owner, admin, npd_manager, module_admin, planner, production_lead, quality_lead, warehouse_operator, auditor, viewer.

`btn-secondary` "Assign Role to User" → opens MODAL-ROLE-ASSIGNMENT (SET-011a flow).

**States:** Always populated (system roles seeded at org creation). Loading: skeleton. No empty state.

**Modals opened:** MODAL-PERMISSION-MATRIX, MODAL-ROLE-ASSIGNMENT.

---

### SET-001 through SET-006 — Onboarding Wizard

**Route:** `/settings/onboarding` (launcher), steps at sub-routes above.

#### SET-001 — Wizard Launcher

**Purpose:** Auto-shown to new organizations; resumes at `current_step` for returning users.

**Layout:** Full-screen centered card (max-width 560px, margin auto). Global sidebar hidden (or collapsed to icon-only). Settings inner sidebar hidden.

Progress indicator: horizontal stepper at top, 6 numbered circles connected by lines. Completed steps: filled `--blue` circle with checkmark. Current step: filled `--blue` circle with step number. Future steps: gray outline circle.

**Step labels:** 1 Organization · 2 Warehouse · 3 Location · 4 Product · 5 Work Order · 6 Complete

Launcher card shows: org name (from context or placeholder), progress bar (CSS, color `--blue`), percentage complete ("Step X of 6"), `btn-primary` "Continue Setup" or "Start Setup".

Resume state: "Welcome back! You were on Step X — [Step Name]. Continue where you left off." `btn-primary` "Continue" + `btn-secondary` "Start Over".

#### SET-002 — Step 1: Organization Profile

**Purpose:** Collect org name, timezone, locale, currency.

Form fields (single column, inside wizard card):

| Field | Type | Required | Validation |
|---|---|---|---|
| Organization Name | text | Yes | min 2, max 100 |
| Timezone | select | Yes | IANA tz, default "Europe/Warsaw" |
| Language / Locale | select | Yes | pl / en / uk / ro |
| Currency | select | Yes | PLN / EUR / GBP / USD |
| Logo | file upload | No | optional, max 2MB |

Buttons: `btn-primary` "Continue →" (saves step, advances). `btn-secondary` "Back" (disabled on step 1).

On save: `organizations.onboarding_state` updated `{current_step: 2, completed_steps: [1]}`.

#### SET-003 — Step 2: First Warehouse

**Purpose:** Create the first warehouse so locations can be attached.

Form fields:

| Field | Type | Required | Validation |
|---|---|---|---|
| Warehouse Name | text | Yes | min 2, max 100 |
| Code | text | Yes | uppercase, alphanumeric, unique, e.g. "WH-01" |
| Type | select | Yes | raw / wip / finished / quarantine / general |
| Set as Default | checkbox | — | pre-checked |
| Address (optional) | textarea | No | free text |

Buttons: `btn-primary` "Continue →", `btn-secondary` "Back", `btn-link` "Skip this step" (marks step skipped in `onboarding_state`).

#### SET-004 — Step 3: First Location

**Purpose:** Create the first location (zone level) inside the warehouse created in Step 2.

Pre-filled warehouse selector (shows the warehouse from step 2, locked). Form fields:

| Field | Type | Required | Validation |
|---|---|---|---|
| Location Name | text | Yes | min 2, max 100 |
| Code | text | Yes | alphanumeric, unique within org |
| Type | select | Yes | zone / aisle / rack / bin |
| Parent Location | select | No | — (top-level for first location) |
| Max Capacity | number | No | positive integer |

Buttons: `btn-primary` "Continue →", `btn-secondary` "Back", `btn-link` "Skip."

#### SET-005 — Step 4: First Product (redirect)

**Purpose:** Soft redirect to 03-TECHNICAL create product. Skippable.

Content: Info card "Create your first product in the Technical module." Icon 🔧, description text, `btn-primary` "Go to Technical →" (opens `/technical/products/new` in same window, wizard state saved), `btn-link` "Skip for now."

#### SET-006a — Step 5: First Work Order (redirect)

**Purpose:** Soft redirect to 04-PLANNING-BASIC. Skippable.

Same pattern as Step 4 but for Work Orders.

#### SET-006b — Step 6: Completion Celebration

**Purpose:** Confirm setup complete, provide next steps.

Full-width confetti animation (CSS, 3 seconds, auto-stops). Heading "You're all set! 🎉" (24px bold). Subtitle "Your organization is configured and ready."

Next Steps card grid (3 columns): "Explore Schema Browser → `/settings/schema`", "View Rule Registry → `/settings/rules`", "Enable More Modules → `/settings/modules`".

`btn-primary` "Go to Dashboard" → `/dashboard`. `btn-secondary` "Return to Settings" → `/settings`.

`organizations.onboarding_completed_at` set on arrival at this step.

**States (all wizard steps):**

*Loading (page mount):* form skeleton while org context loads.

*Validation error:* Inline error below each field. Save button remains active; errors appear on submit attempt.

*Save error:* `alert-red` at top of card "Failed to save. Please try again."

*Skip confirmation (steps 4/5):* No confirmation needed — skip is immediate.

---

### SET-030 — Schema Browser

**Route:** `/settings/schema`
**Purpose:** Browse all schema columns across all tables, filtered by table and department, showing tier, data type, and status.

**Layout:** SettingsLayout "Schema Browser" + description "View and manage column definitions for all data tables. Add L2/L3 columns without developer involvement." Action bar: table picker (select: main_table / bom / reference.pack_sizes / …all 11 ref tables), dept filter (all 7 depts + custom), tier filter (L1/L2/L3/L4), status filter (active/deprecated/draft). Right: `btn-primary` "+ Add Column" → `/settings/schema/new`. `btn-secondary` "Export Schema CSV."

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Column Code | monospace text | e.g. `pack_size`, `shelf_life_days` |
| Label | text | human-readable from `presentation_json.label_pl` |
| Table | badge-gray | e.g. "main_table", "pack_sizes" |
| Dept | text | Core / Technical / Packaging / etc. |
| Data Type | badge | text=gray, number=blue, date=gray, enum=amber, formula=blue, relation=blue |
| Tier | badge | L1=blue, L2=green, L3=amber, L4=red |
| Storage | text-muted | native / ext_jsonb / private_jsonb |
| Required | icon | ✓ green if `required_for_done=true` |
| Status | badge | Active=green, Draft=amber, Deprecated=gray |
| Version | number | schema_version integer |
| Actions | icons | 👁️ View detail, ✏️ Edit (L2/L3 only), 📋 Version history |

Clicking a row expands an inline detail panel (schema_version, validation_json preview, blocking_rule, dropdown_source). L1 rows show `badge-blue` "L1 — Read Only" and a `btn-secondary` "Request L1 Promotion" button.

**States:**

*Loading:* skeleton table 10 rows.

*Empty (no columns for filter):* "No columns match your filters. Try clearing filters or add a new column."

*Empty (new org, no L2/L3 cols):* "No custom columns yet. Your schema uses the universal L1 baseline." `btn-primary` "+ Add Your First Column."

*Populated:* Table with sort controls on Column Code, Tier, Status. Pagination 50 rows/page.

*L1 row hover:* Tooltip "L1 columns are universal. Use 'Request L1 Promotion' to propose a change."

---

### SET-031 — Column Edit Wizard (Schema Admin Wizard)

**Route:** `/settings/schema/new` (new) or `/settings/schema/edit/:id` (edit)
**Purpose:** 8-step guided flow to add or edit a schema column for L2/L3 scope.

**Layout:** Wizard card (max-width 680px, centered in content area). Horizontal stepper at top showing 8 steps. Left-side step list (visible on desktop): Step names listed vertically with completion checkmarks.

**Steps:**

**Step 1 — Pick Table**
Label "Which table does this column belong to?"
Dropdown: main_table / bom / reference.pack_sizes / reference.templates / reference.processes / reference.allergens_reference / reference.alert_thresholds / reference.d365_constants / reference.email_config / reference.dieset_by_line_pack / reference.lines_by_pack_size / reference.close_confirm.
Required. Advances to step 2.

**Step 2 — Pick Department** (shown only if table = `main_table`)
Label "Which department owns this column?"
Radio button grid showing the org's resolved dept list: Core / Technical / Packaging / MRP / Planning / Production / Price + any custom depts from `tenant_variations.dept_overrides`.
Required for main_table. Skip (auto-advance) for reference tables.

**Step 3 — Pick Data Type**
Label "What type of data does this column hold?"
6 large radio cards with icon + name + description:
- text — "Free text, short or long"
- number — "Integer or decimal, supports range validation"
- date — "Date or date-time value"
- enum — "Fixed list of options (dropdown)"
- formula — "Calculated from other fields"
- relation — "Reference to another table row"

**Step 4 — Validation Rules**
Label "Set validation rules for this column."
Multi-select checklist:

| Rule | Control | Extra input |
|---|---|---|
| Required | toggle | — |
| Unique per org | toggle | — |
| Regex pattern | toggle + text input | Show preview input: "Test string" → live match/fail indicator |
| Range (min / max) | toggle + two number inputs | For number/date types only |
| Dropdown source | toggle + select | Select from 11 reference table codes |

**Step 5 — Blocking Rule**
Label "When is this column required to be filled?"
Radio group: None (default) / core_done / pack_size_filled / line_filled / core_production_done.
Helper text per option explaining what transition it gates.

**Step 6 — Required for Done**
Label "Is this column required before marking the product/WO as 'Done'?"
Toggle: off / on. Helper: "When ON, this field appears in the Done checklist and blocks completion if empty."

**Step 7 — Presentation**
Label "How should this column appear in the UI?"
Sub-fields:
- Section label in form (text input, e.g. "Packaging Details")
- Order within section (number, 1–99)
- Show as list column (toggle; if on: column header label text input)
- Visible to roles (multi-select: all / specific roles)
- Include in CSV export (toggle)
- Include in D365 Builder output (toggle, only shown if D365 enabled)

**Step 8 — Preview & Save**
Label "Review your column definition."
Shows: rendered React form field (simulated, using shadow/sample data). Below: summary table of all choices. Tier is auto-computed and shown as badge: if no `org_id` scope → L1 (promotion required); if org-scoped with shared L1 option → L2 badge-green; if org-specific → L3 badge-amber.

Two save paths:
- If L2/L3: `btn-primary` "Publish Column" → saves as active, toast "Column published. Zod schema regenerating…"
- If L1 promotion detected (user chose universal scope): `btn-amber` "Request L1 Promotion" → opens MODAL-L1-PROMOTION

`btn-secondary` "Save as Draft" — saves with `status='draft'`, no runtime effect.

**States (all wizard steps):**

*Loading step data:* spinner inside card.

*Validation error on advance:* Error message below problem field. Step does not advance.

*Zod generation in progress (post-publish):* Banner `alert-blue` "Schema regenerating… changes will be live in ~5 seconds." Dismissable.

*Concurrent edit conflict (publish):* `alert-amber` "Another admin published a newer version while you were editing. Review the diff and republish." Link to SET-032.

---

### SET-032 — Schema Diff Viewer

**Route:** `/settings/schema/diff/:migration_id`
**Purpose:** Side-by-side comparison of schema version N vs N-1 for a specific column.

**Layout:** Two-column side-by-side panels (50% each, border between). Left panel header: "Version N-1 (before)" badge-gray. Right panel header: "Version N (current)" badge-green. Inside each panel: JSON fields listed with label + value. Changed fields highlighted: green background in right panel for added/changed, red strikethrough in left panel for removed.

Below diff panels: metadata strip (who changed, when, deploy_ref if L1).

`btn-secondary` "Revert to Version N-1" (shown for last 3 versions only, L2/L3 only; L1 revert requires L1 promotion flow). Opens MODAL-CONFIRM-REVERT.

---

### SET-033 — Schema Migrations Queue

**Route:** `/settings/schema/migrations`
**Purpose:** Track L1 promotion requests from submitted to completed/rolled-back.

**Layout:** SettingsLayout "Schema Migrations Queue." Filter bar: status filter (All / pending / approved / running / completed / failed / rolled_back). Table below.

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Migration ID | monospace | UUID short |
| Table / Column | text | "main_table / shelf_life_days" |
| Action | text | "promote_l2_to_l1", "add", "edit", "deprecate" |
| Requested By | text | user name |
| Requested At | date | ISO date |
| Approved By | text | superadmin name or "—" |
| Status | badge | pending=amber, approved=blue, running=blue (pulsing), completed=green, failed=red, rolled_back=gray |
| Actions | — | 👁️ View migration script, ⋮ Cancel (if pending) |

Clicking a row expands detail: shows `migration_script` SQL in a code block (read-only, monospace, syntax-highlighted), `result_notes`, timeline of status changes.

**States:** Empty: "No migration requests." Loading: skeleton.

---

### SET-034 — Schema Shadow Preview

**Route:** `/settings/schema/preview`
**Purpose:** Dry-run preview of a draft column in a simulated form using sample data, with no effect on production.

**Layout:** Split: left 40% = column selector (pick draft column from list); right 60% = rendered React form showing sample data. Below form: "This is a preview only. No data is saved." `alert-blue` strip.

`btn-primary` "Publish this Column" → same as Step 8 publish path.

---

### SET-040 — Rule Definitions Registry

**Route:** `/settings/rules`
**Purpose:** **Read-only** browser of all deployed business rules. Admin can view, audit, and dry-run, but cannot edit DSL. Rules are authored by developers via PR and deployed through CI/CD.

> IMPORTANT FOR DESIGNER: There is NO edit button, NO "Create Rule" button, and NO DSL editor anywhere in this screen or any linked screen. The only way rules change is via developer PR pipeline. Admin capabilities are: view, filter, version history, dry-run results viewer, audit log for deployments.

**Layout:** SettingsLayout "Rule Definitions Registry." Banner at top: `alert-blue` "Rules are authored by developers and deployed via the CI/CD pipeline. This view is read-only. Contact your MonoPilot implementation team to request rule changes." (persistent, not dismissable).

Filter bar: Rule Type filter (All / cascading / conditional / gate / workflow), Dept filter, Active filter toggle (active / all including historical), Dry-run coverage filter (has coverage / missing coverage).

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Rule Code | monospace text | e.g. `allergen_changeover_gate` |
| Rule Type | badge | cascading=blue, conditional=gray, gate=red, workflow=amber |
| Tier | badge | L1=blue, L2=green, L3=amber |
| Version | number | current active version |
| Active From | date | |
| Deployed By | text | "system (CI/CD)", or dev username |
| Deploy Ref | monospace short | git SHA short, e.g. `a1b2c3d` |
| Dry-run Coverage | badge | Covered=green, Missing=red (no run in 30 days), N/A=gray |
| Actions | — | 👁️ View Detail |

Clicking a row or the view icon navigates to SET-041.

**States:**

*Loading:* skeleton table 8 rows.

*Empty:* "No rules deployed yet." (should not occur in production; dev team must seed rules).

*Populated:* Table with sort on Rule Code, Version, Active From.

*Missing dry-run coverage row:* Entire row has amber left-border accent and row background `#fffbeb`.

---

### SET-041 — Rule Detail

**Route:** `/settings/rules/:rule_code`
**Purpose:** Full detail view of a single rule: DSL JSON, Mermaid flowchart, version history, dry-run results, and deployment audit trail.

**Layout:** SettingsLayout "Rule: [rule_code]." Breadcrumb: Settings → Rule Registry → rule_code. Tabs: [Definition] [Version History] [Dry-run Results] [Audit Log].

**Tab 1 — Definition:**
- Rule metadata strip: Type badge, Tier badge, Status badge (Active / Deprecated), Active From, Active To (or "—").
- DSL JSON panel: Read-only code block, monospace font 12px, syntax-highlighted (JSON), max-height 400px with scroll. No edit controls. Watermark in top-right corner of panel: "Read Only."
- Mermaid flowchart panel (below JSON): auto-generated from DSL, rendered as SVG. For gate rules: shows precondition → check → block/pass. For cascading rules: shows source field → target field arrows. For workflow rules: shows state machine boxes + transitions.
- No edit button, no "Modify DSL" button. Only `btn-secondary` "Copy DSL to Clipboard" and `btn-secondary` "Download JSON."

**Tab 2 — Version History:**
List of all versions (ORDER BY version DESC). Each row: version number, deployed_by, deployed_at, deploy_ref (git SHA), `btn-secondary` "Compare with current" → navigates to SET-042. Active version row highlighted with `badge-green` "Current."

**Tab 3 — Dry-run Results:**
Table of `rule_dry_runs` rows: Ran At, Ran By, Input summary (truncated), Result badge (Pass=green, Fail=red, Warning=amber). Clicking a row opens MODAL-DRY-RUN-DETAIL showing full input JSON + result JSON side by side.

**Tab 4 — Audit Log:**
Filtered `audit_log` entries where `action='rule_deploy'` and `record_id=rule_code`. Columns: Timestamp, Deployed By, Action, Deploy Ref, Changes summary.

**Modals opened:** MODAL-DRY-RUN-DETAIL.

---

### SET-042 — Rule Version Diff

**Route:** `/settings/rules/:rule_code/diff/:version`
**Purpose:** Side-by-side JSON deep diff between two versions of a rule.

Same layout pattern as SET-032 (Schema Diff Viewer) but for rule DSL JSON. No revert button (rules can only be changed via PR).

---

### SET-050 — Reference Tables Index

**Route:** `/settings/reference`
**Purpose:** Overview of all 11 reference tables with row count, last modified, and status.

**Layout:** SettingsLayout "Reference Data." Description "Manage configuration tables used across all modules. Each table uses a schema-driven form — no code changes needed to add rows." Card grid 3 columns.

**11 Table cards:**

| # | Code | Display Name | Marker badge |
|---|---|---|---|
| 1 | `dept_columns` | Department Columns | UNIVERSAL |
| 2 | `pack_sizes` | Pack Sizes | FORZA-CONFIG |
| 3 | `lines_by_pack_size` | Lines by Pack Size | FORZA-CONFIG |
| 4 | `dieset_by_line_pack` | Dieset by Line & Pack | FORZA-CONFIG |
| 5 | `templates` | Templates | UNIVERSAL |
| 6 | `email_config` | Email Config | UNIVERSAL |
| 7 | `processes` | Processes | FORZA-CONFIG |
| 8 | `close_confirm` | Close Confirmation | UNIVERSAL |
| 9 | `alert_thresholds` | Alert Thresholds | FORZA-CONFIG |
| 10 | `allergens_reference` | Allergens Reference | UNIVERSAL |
| 11 | `d365_constants` | D365 Constants | FORZA-CONFIG / LEGACY-D365 |

Each card: table display name (16px bold), code badge-gray, marker badge (badge-blue for UNIVERSAL, badge-amber for FORZA-CONFIG, badge-red for LEGACY-D365), stats row "X active rows · Last modified: date", `btn-secondary` "Manage →" → `/settings/reference/:table_code`.

**States:** Loading: 11 skeleton cards. Error: `alert-red`. All cards always visible (tables always exist, may have 0 rows).

---

### SET-051 — Reference Table Detail

**Route:** `/settings/reference/:table_code`
**Purpose:** Generic data grid for one reference table, with create/edit/delete row operations and CSV import/export.

**Layout:** SettingsLayout "[Table Display Name]." Breadcrumb: Reference Tables → Table Name. Action bar: `btn-primary` "+ Add Row" → opens MODAL-REF-ROW-EDIT (create mode); `btn-secondary` "Import CSV" → `/settings/reference/:table_code/import`; `btn-secondary` "Export CSV" (downloads current active rows); search input.

**Generic table pattern:** Columns generated from `reference_schemas` definition for this `table_code`. Every table has these system columns regardless of schema:

| Column | Type | Notes |
|---|---|---|
| Row Key | monospace text | unique identifier |
| Status | badge | Active=green, Inactive=gray |
| Version | number | optimistic lock version |
| Last Modified | relative date | from `updated_at` |
| Actions | — | ✏️ Edit, ⋮ menu: Deactivate / Delete |

**Per-table schema-driven columns (between Row Key and Status):**

*pack_sizes:* Pack Size (text, regex `^\d+x\d+cm$`), Display Order (number).

*lines_by_pack_size:* Pack Size (relation → pack_sizes), Line Code (text), Line Name (text).

*dieset_by_line_pack:* Line Code (text), Pack Size (text), Dieset Code (text), Dieset Name (text).

*templates:* Template Code (text), Template Name (text), Dept (enum: 7 depts), File URL (text), Is Default (boolean).

*email_config:* Trigger Code (enum: core_closed / production_closed / mrp_closed / fa_d365_ready / schema_migration_requested / tenant_upgrade_canary_failed), Recipients To (text, semicolon-separated), Recipients CC (text), Subject Template (text), Body Template (text, Mustache), Is Active (boolean).

*processes:* Process Code (text), Process Name (text), Process Letter (text, single char A-Z), Description (text), Is Active (boolean).

*close_confirm:* Confirm Code (text), Confirm Message (text), Requires Dual Sign-off (boolean).

*alert_thresholds:* Threshold Type (enum: RED / YELLOW), Days (number, positive integer), Description (text).

*allergens_reference:* Allergen Code (text, A01–A14 + custom), Name EN (text), Name PL (text), Name DE (text, Phase 2), Name UK (text, Phase 2), Icon URL (text), Is Active (boolean).

*d365_constants:* Constant Key (text, one of 5 Forza keys), Constant Value (text), Description (text), Is Active (boolean).

*dept_columns:* Dept Code (text), Column Code (text), Column Label PL (text), Column Label EN (text), Display Order (number), Is Required (boolean), Data Type (enum).

**States:**

*Loading:* Skeleton table.

*Empty:* "No rows in [Table Name] yet." `btn-primary` "+ Add Row." For `d365_constants`, empty state shows `alert-amber` "D365 integration requires 5 constants. Add them before enabling the integration."

*Populated:* Table with sort controls. Pagination 25 rows/page.

*Concurrent edit conflict on save:* `alert-amber` "This row was modified by another user. Review the current version and resubmit." MODAL-REF-ROW-EDIT shows diff.

**Modals opened:** MODAL-REF-ROW-EDIT, MODAL-CONFIRM-DELETE, MODAL-CSV-IMPORT-PREVIEW.

---

### SET-053 — CSV Import Wizard

**Route:** `/settings/reference/:table_code/import`
**Purpose:** Guided 3-step CSV import with conflict detection and preview before commit.

**Layout:** Wizard card (max-width 720px). Steps: [1 Upload] [2 Preview] [3 Commit].

**Step 1 — Upload:**
Drag-and-drop zone (dashed border `--border`, height 160px): "Drop your CSV file here or click to browse." Accepted: `.csv` only. Max 5MB. Helper: "First row must contain column headers matching: [list of column_codes from schema]." Download template button: `btn-secondary` "Download Template CSV."

**Step 2 — Preview:**
Summary bar: "Parsed X rows. X to insert (green), X to update (amber), X to skip (gray), X errors (red)." Table showing all rows color-coded by action. Error rows show inline validation message in last column. Toggle "Show errors only" / "Show all." `btn-danger` "Cancel" | `btn-primary` "Commit Import."

**Step 3 — Commit:**
Progress bar (animated) while backend processes. On complete: "Import complete. X inserted, Y updated, Z skipped, W errors." `btn-primary` "Return to Table." If errors: show error rows download link.

---

### SET-060 — Tenant Variations Dashboard

**Route:** `/settings/tenant`
**Purpose:** Overview of all active L2 configuration overrides for this tenant.

**Layout:** SettingsLayout "Tenant Configuration." KPI row (4 cards): Dept Overrides Active (number, kpi-blue), Rule Variants Customized (number), Schema Extensions L3 (number), Last Upgrade (date or "Never").

Below KPIs: three section cards.

*Dept Overrides card:* Lists all active `dept_overrides` entries. Each entry: action badge (split=amber, merge=blue, add=green), source dept → target dept(s), last modified date. `btn-secondary` "Edit Dept Taxonomy" → `/settings/tenant/depts`.

*Rule Variant Overrides card:* Table: Rule Code | Current Variant | Available Variants. `btn-secondary` "Change Variants" → `/settings/tenant/rules`.

*Feature Flags (L2 local) card:* Toggle list for Phase 2/3 per-tenant flags. Each row: flag code, description, toggle.

`btn-secondary` "View Upgrade History" → `/settings/tenant/history`.

---

### SET-061 — Dept Taxonomy Editor

**Route:** `/settings/tenant/depts`
**Purpose:** Split, merge, or add custom departments within this tenant's L2 scope.

**Layout:** SettingsLayout "Department Taxonomy." Description "Customize department structure for your organization. Changes affect column ownership and rule routing." `alert-amber` "Dept changes affect how columns and rules are grouped. Review the impact before saving."

Current dept list panel (left ~40%): list of all active depts (baseline 7 Forza + custom), each with drag handle, dept code badge, name, assigned column count. `btn-primary` "+ Add Custom Dept".

Operations panel (right ~60%): selected dept shows operation options:
- **Split:** "Split [dept] into two departments." Source dept select (pre-filled), Target Dept 1 name + code, Target Dept 2 name + code, Column mapping: for each column in source dept, dropdown to assign to Target 1 or Target 2.
- **Merge:** "Merge selected depts into one." Multi-select source depts, Target dept name + code.
- **Add:** "Add new department." Code (text, lowercase-hyphen), Name PL, Name EN, Display Order.

`btn-primary` "Save Changes" → `tenant_variations.dept_overrides` updated, confirmation step (MODAL-CONFIRM-DEPT-CHANGE). `btn-secondary` "Discard."

Validation: V-SET-30 — split targets must be non-empty + unique; column_mapping must cover all source columns.

---

### SET-062 — Rule Variant Selector

**Route:** `/settings/tenant/rules`
**Purpose:** Choose which version (v1, v2, …) of each rule is active for this tenant.

**Layout:** SettingsLayout "Rule Variant Selection." Description "Some rules have multiple versions. Select the variant that applies to your organization." `alert-blue` "Rule variants are tested configurations. Contact your implementation team before switching from the default."

Table: Rule Code | Rule Type | Available Variants (pills) | Current Selection (radio) | Last Changed.

Each row: radio buttons for available versions (v1, v2, …). Current selection highlighted. Changing a radio does not auto-save — `btn-primary` "Save All Selections" at bottom of page triggers batch update to `tenant_variations.rule_variant_overrides`.

Validation: V-SET-31 — variant must reference existing `rule_definitions.version`.

---

### SET-063 — Upgrade Orchestration

**Route:** `/settings/tenant/upgrades`
**Purpose:** Monitor and control ongoing multi-tenant upgrade migrations (canary → progressive → completed).

**Layout:** SettingsLayout "Upgrade Orchestration." KPI row: Active Migrations (number), Canary Phase (number), Completed (number), Rolled Back (number).

Active migrations table:

| Column | Type | Notes |
|---|---|---|
| Component | text | rule_engine / schema / feature_v2 |
| From Version | text | e.g. "v1" |
| To Version | text | e.g. "v2" |
| Status | badge | scheduled=gray, canary=amber (pulsing), progressive=blue, completed=green, rolled_back=red |
| Canary % | progress bar | 0–100% |
| Last Run | relative date | |
| Actions | buttons | "View Details" + context-sensitive controls |

**Status-specific controls:**
- `status='scheduled'`: `btn-primary` "Start Canary" | `btn-danger` "Cancel"
- `status='canary'`: `btn-primary` "Progress to 50%" | `btn-danger` "Rollback" | `btn-secondary` "Hold at Canary"
- `status='progressive'`: `btn-primary` "Progress to 100%" | `btn-danger` "Rollback"
- `status='completed'`: display only, no controls (rollback window: 7 days post-completion, shown with countdown badge)
- `status='rolled_back'`: display only

**Preview v2 flow:** `btn-secondary` "Preview v2 Changes" → MODAL-UPGRADE-PREVIEW showing JSON diff + affected rows count + Mermaid diff.

---

### SET-064 — Migration History

**Route:** `/settings/tenant/history`
**Purpose:** Audit trail of all past tenant migrations.

**Layout:** SettingsLayout "Migration History." Full-width table of `tenant_migrations` ordered by `created_at DESC`. Columns: ID (short) | Component | From → To | Status badge | Scheduled By | Created At | Completed At. Filter: status, component, date range.

---

### SET-070 — Module Toggles Dashboard

**Route:** `/settings/modules`
**Purpose:** Enable or disable the 15 application modules with dependency awareness.

**Layout:** SettingsLayout "Module Configuration." Description "Enable or disable modules for your organization. Some modules depend on others — disabling a dependency will warn you." Filter tabs: [All] [Phase 1] [Phase 2] [Phase 3].

Module grid: 3 columns, gap 12px. Each module card:
- Module name (16px bold), code badge-gray
- Phase badge: badge-blue "Phase 1", badge-amber "Phase 2", badge-red "Phase 3"
- Description (13px, 2 lines)
- Dependencies: "Requires: [mod1], [mod2]" (13px, muted)
- Dependent modules: "Required by: [mod3]" (shown if any)
- Toggle switch (right side): green ON / gray OFF
- If `can_disable=false` (00-foundation, 02-settings): toggle disabled with tooltip "Core module — cannot be disabled"

**15 modules:**

| Code | Name | Phase | Default |
|---|---|---|---|
| 00-foundation | Foundation | 1 | ON, locked |
| 01-npd | NPD | 1 | ON |
| 02-settings | Settings | 1 | ON, locked |
| 03-technical | Technical | 1 | ON |
| 04-planning-basic | Planning Basic | 1 | ON |
| 05-warehouse | Warehouse | 1 | ON |
| 06-scanner-p1 | Scanner P1 | 1 | ON |
| 07-planning-ext | Planning Extended | 2 | OFF |
| 08-production | Production | 1 | ON |
| 09-quality | Quality | 2 | OFF |
| 10-finance | Finance | 2 | OFF |
| 11-shipping | Shipping | 2 | OFF |
| 12-reporting | Reporting | 2 | OFF |
| 13-maintenance | Maintenance | 2 | OFF |
| 14-multi-site | Multi-Site | 3 | OFF |
| 15-oee | OEE | 3 | OFF |

**Toggle interaction:** When user flips a toggle OFF, system checks downstream dependents. If any downstream is ON, show MODAL-DISABLE-CHAIN-CONFIRM listing all modules that will be affected. User must explicitly confirm cascade disable.

When turning ON a module that has unmet dependencies: `alert-amber` inline on card "Requires [mod] to be enabled first." Toggle blocked until deps satisfied.

**States:** Loading: skeleton grid. Error: `alert-red`.

---

### SET-071 — Feature Flags

**Route:** `/settings/flags`
**Purpose:** Manage built-in core feature flags (fallback table) and view PostHog flags (read-through).

**Layout:** SettingsLayout "Feature Flags." Tabs: [Core Flags] [PostHog Flags (read-only)].

**Tab: Core Flags**
Table of `feature_flags_core` rows:

| Column | Notes |
|---|---|
| Flag Code | monospace, e.g. `integration.d365.enabled` |
| Description | human-readable |
| Status | toggle: ON (badge-green) / OFF (badge-gray) |
| Rollout % | number input 0–100 |
| Updated At | date |

4 core flags:
1. `maintenance_mode` — "Put app into read-only mode for all non-superadmin users"
2. `integration.d365.enabled` — "Enable D365 pull/push integration (requires 5 constants configured)"
3. `scanner.pwa.enabled` — "Enable PWA scanner interface"
4. `npd.d365_builder.execute` — "Allow NPD Manager to execute D365 Builder"

Special: toggling `integration.d365.enabled` to ON triggers pre-flight check (V-SET-42): validates 5 D365 constants populated + test connection passed. If check fails → MODAL-D365-PREFLIGHT-FAILED. If check passes → MODAL-CONFIRM-FLAG-TOGGLE.

Special: toggling `maintenance_mode` to ON shows MODAL-CONFIRM-MAINTENANCE-MODE with warning "All non-superadmin users will be locked out."

**Tab: PostHog Flags (read-only)**
Read-through view. Table: Flag Name | Variant / Value | Rollout % | Targeting Rules summary. No edit controls. `btn-secondary` "Open PostHog Dashboard ↗" (external link). `alert-blue` "PostHog flags are managed in the PostHog console. This view is read-only."

---

### SET-080 — D365 Connection Config

**Route:** `/settings/d365`
**Purpose:** Configure base URL, service account, OAuth credentials, and test the D365 connection.

**Layout:** SettingsLayout "D365 Integration." `badge-amber` "LEGACY-D365" badge next to title. Description "Configure Dynamics 365 Finance & Operations connection for Forza. This integration will be retired when Monopilot replaces D365." `alert-amber` "Retirement path: when integration is no longer needed, disable the flag and archive constants."

Form fields (single column):

| Field | Type | Required | Notes |
|---|---|---|---|
| D365 Base URL | url | Yes | e.g. `https://forza.operations.dynamics.com` |
| Environment | select | Yes | Production / Sandbox / Development |
| Tenant ID (Azure AD) | text | Yes | UUID format |
| Client ID | text | Yes | Azure App Registration client ID |
| Client Secret | password | Yes | masked, never shown after save; `btn-secondary` "Rotate Secret" |
| Service Account Email | email | No | for basic auth fallback |
| Integration Enabled | toggle | — | mirrors `integration.d365.enabled` flag; click here also triggers pre-flight |

`btn-primary` "Test Connection" → calls `/api/settings/d365/test-connection`; shows MODAL-D365-CONNECTION-TEST with spinner then result (success: green check + latency, failure: red × + error message).

`btn-primary` "Save Configuration." `btn-secondary` "Discard."

**States:** Loading: form skeleton. Error (save): `alert-red`. Connection test success: `alert-green` "Connected successfully. Latency: Xms." Connection test failure: `alert-red` with error code + message.

---

### SET-081 — D365 Constants Editor

**Route:** `/settings/d365/constants`
**Purpose:** View and edit the 5 Forza D365 constants stored in the `d365_constants` reference table.

**Layout:** SettingsLayout "D365 Constants." Description "These constants are required for D365 integration. All 5 must be populated before enabling the integration." Progress strip: "X of 5 constants configured" with progress bar color `--blue`.

Inline editable table (not a modal — editing happens inline for speed):

| Constant | Key | Current Value | Description | Edit |
|---|---|---|---|---|
| Production Site ID | FNOR | [value] | Forza North site code | inline text input |
| Approver Personnel # | FOR100048 | [value] | Approver employee ID | inline text input |
| Consumption Warehouse | ForzDG | [value] | Forza warehouse code | inline text input |
| Product Group ID | FinGoods | [value] | Finished Goods group | inline text input |
| Costing Resource ID | FProd01 | [value] | Forza Production resource | inline text input |

Each row has Save icon (✓) and Cancel icon (×) appearing on edit. Row saving triggers audit log entry.

Below table: validation status per constant (V-SET-50): green check if populated, red × if empty. `btn-primary` "Enable D365 Integration" — enabled only when all 5 constants populated; clicking opens preflight modal.

---

### SET-082 — Sync Config

**Route:** `/settings/d365/sync`
**Purpose:** Configure pull schedule, push queue, retry policy for D365 sync.

**Layout:** SettingsLayout "D365 Sync Configuration." Two sections:

*Pull Config (D365 → Monopilot):*
- Items pull schedule: cron input (e.g. `0 2 * * *`), helper "Daily at 2:00 AM"
- BOM/formula pull schedule: cron input
- On-demand trigger: `btn-secondary` "Pull Now" (manual trigger, shows progress in MODAL-SYNC-PROGRESS)

*Push Config (Monopilot → D365):*
- Push queue enabled: toggle
- Retry attempts: number input (default 3)
- Retry backoff: select (exponential / linear)
- Dead-letter queue alert email: text input (email)

`btn-primary` "Save Sync Config." Validation: cron syntax validated inline.

---

### SET-083 — Sync Audit

**Route:** `/settings/d365/audit`
**Purpose:** Log of D365 sync runs with errors and manual trigger capability.

**Layout:** SettingsLayout "D365 Sync Audit." `btn-primary` "Trigger Manual Sync." Table: Run ID | Direction (Push/Pull) | Component | Started At | Completed At | Records Processed | Errors | Status badge. Click row → expand error detail.

Dead-letter queue section below main table: DLQ items (stuck >24h). Each item shows: record ID, error message, retry count, `btn-secondary` "Retry" | `btn-danger` "Discard."

---

### SET-012 — Warehouse List

**Route:** `/settings/warehouses`
**Purpose:** View and manage all warehouses.

**Layout:** SettingsLayout "Warehouses" + description. Action bar: `btn-primary` "+ Add Warehouse" → MODAL-WAREHOUSE-CREATE-EDIT.

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Code | monospace bold | e.g. "WH-01" |
| Name | text | e.g. "Main Warehouse" |
| Type | badge | raw=gray, wip=blue, finished=green, quarantine=amber, general=gray |
| Default | icon | ★ if `is_default=true` |
| Locations | number | count of active locations |
| Status | badge | Active=green, Inactive=gray |
| Actions | — | ✏️ Edit → MODAL-WAREHOUSE-CREATE-EDIT, ⋮: Set Default / Deactivate |

**States:** Empty: "No warehouses configured. Add your first warehouse to get started." Loading: skeleton. Error: `alert-red`.

**Modals opened:** MODAL-WAREHOUSE-CREATE-EDIT, MODAL-CONFIRM-DEACTIVATE.

---

### SET-014 — Location Tree

**Route:** `/settings/locations`
**Purpose:** Hierarchical tree view of all locations across warehouses (zone → aisle → rack → bin, 4 levels).

**Layout:** SettingsLayout "Locations." Filter: Warehouse selector (dropdown, shows all warehouses). Action bar: `btn-primary` "+ Add Location" → MODAL-LOCATION-CREATE-EDIT.

**Tree structure:** Collapsible tree using indented list. Each level:
- L1 Zone: no indentation, bold, black circle icon ●
- L2 Aisle: 16px indent, muted icon
- L3 Rack: 32px indent
- L4 Bin: 48px indent, small icon, capacity shown "Cap: 100 units"

Each node row: expand/collapse caret (if has children), location type icon, code, name, capacity (if bin), status badge, actions (✏️ Edit, ⋮ Add Child / Deactivate). `btn-secondary` "Import CSV" for bulk import.

**States:** Empty per warehouse: "No locations in [Warehouse]. Add a zone to start." Loading: skeleton tree. Collapsed: top-level nodes only.

---

### SET-016 — Machine List

**Route:** `/settings/machines`
**Purpose:** View and manage production machines.

**Layout:** SettingsLayout "Machines." Action bar: `btn-primary` "+ Add Machine." Filter: type filter, status filter, location filter.

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Code | monospace | e.g. "MCH-001" |
| Name | text | "Mixer A" |
| Type | badge-gray | free text from `machine_type` |
| Location | breadcrumb text | WH-01 → Zone A → Rack 1 → Bin 1-01 |
| Status | badge | active=green, maintenance=amber, offline=red |
| Capacity/hr | number | from `capacity_per_hour`, unit suffix |
| Actions | — | ✏️ Edit → MODAL-MACHINE-CREATE-EDIT, ⋮: Change Status / Deactivate |

**States:** Empty: "No machines registered." Loading: skeleton. Error: `alert-red`.

---

### SET-018 — Production Line List

**Route:** `/settings/production-lines`
**Purpose:** View and manage production lines and their machine sequences.

**Layout:** SettingsLayout "Production Lines." Action bar: `btn-primary` "+ Add Line."

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Code | monospace | "LINE-01" |
| Name | text | "Nugget Line" |
| Machines | chip list | ordered machine codes in sequence, e.g. "MCH-001 → MCH-002 → MCH-003" |
| Default Location | text | warehouse/zone path |
| Status | badge | active=green, inactive=gray |
| Actions | — | ✏️ Edit → MODAL-LINE-CREATE-EDIT, ⋮: Activate / Deactivate |

**States:** Empty: "No production lines configured. A line requires at least 1 machine." Loading: skeleton.

---

### SET-020 — Allergen Management

**Route:** `/settings/allergens`
**Purpose:** Toggle the 14 EU standard allergens on/off for this org, and add custom allergens.

**Layout:** SettingsLayout "Allergen Management." Description "EU Regulation 1169/2011 defines 14 major allergens. Toggle each allergen relevant to your products."

EU-14 grid (2-column): Each allergen displayed as a card (code badge, name, icon if available, active toggle). Allergens: A01 Celery, A02 Cereals/Gluten, A03 Crustaceans, A04 Eggs, A05 Fish, A06 Lupin, A07 Milk, A08 Molluscs, A09 Mustard, A10 Tree Nuts, A11 Peanuts, A12 Sesame, A13 Soy/Soya, A14 Sulphites/Sulphur Dioxide.

Below grid: "Custom Allergens" section. Table of `org_allergens` (non-EU-14 codes). Columns: Code, Name, Status badge, Actions (✏️ Edit, Delete). `btn-primary` "+ Add Custom Allergen" → MODAL-ALLERGEN-CREATE.

**States:** Grid always populated (EU-14 seeded). Toggle saves immediately with toast "Allergen [name] [enabled/disabled]."

---

### SET-021 — Tax Code List

**Route:** `/settings/tax-codes`
**Purpose:** Manage VAT / tax rate codes for this organization.

**Layout:** SettingsLayout "Tax Codes." Action bar: `btn-primary` "+ Add Tax Code" → MODAL-TAX-CODE-CREATE.

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Code | monospace | "VAT-STD" |
| Name | text | "Standard Rate" |
| Rate | number % | "23%" — stored as 0.2300 |
| Country | badge-gray | ISO 3166-1 code (Phase 2) |
| Tax Type | badge | standard=blue, reduced=amber, zero=gray (Phase 2) |
| Effective From | date | |
| Effective To | date | "—" if no end date |
| Default | icon | ★ if `is_default=true` |
| Actions | — | ✏️ Edit → MODAL-TAX-CODE-EDIT, ⋮: Set Default / Deactivate |

**States:** Empty: "No tax codes configured." Loading: skeleton. Error: `alert-red`.

---

### SET-023 — API Keys List

**Route:** `/settings/api-keys`
**Purpose:** Create and manage API keys with HMAC signing and scope configuration.

**Layout:** SettingsLayout "API Keys." Action bar: `btn-primary` "+ Create API Key" → MODAL-API-KEY-CREATE.

**Table columns:**

| Column | Notes |
|---|---|
| Name | descriptive label |
| Prefix | monospace, first 12 chars of key, e.g. `mp_prod_a1b2...` |
| Scopes | badge list (read / write / webhook) |
| Created | date |
| Last Used | relative date or "Never" |
| Expires | date or "Never" |
| Status | badge-green Active, badge-red Revoked |
| Actions | ⋮: Rotate → MODAL-ROTATE-API-KEY, Revoke → MODAL-CONFIRM-REVOKE |

**States:** Empty: "No API keys. Create one to allow external integrations." Loading: skeleton.

---

### SET-024 — Webhooks List

**Route:** `/settings/webhooks`
**Purpose:** Configure outbound webhooks for system events.

**Layout:** SettingsLayout "Webhooks." Action bar: `btn-primary` "+ Add Webhook."

**Table columns:** URL (truncated, copy icon) | Events (badge list) | Status (badge) | Last Triggered (relative date) | Success Rate (%) | Actions (✏️ Edit, ⋮: Test / Disable / Delete).

**States:** Empty: "No webhooks configured." Error: `alert-red`.

---

### SET-025 — Audit Logs

**Route:** `/settings/audit-logs`
**Purpose:** Browse the full audit trail of all SETTINGS mutations, partitioned monthly, retained 7 years.

**Layout:** SettingsLayout "Audit Logs." Filter bar: Date range picker (from/to), User filter (select), Action filter (insert/update/delete/schema_migrate/rule_deploy/tenant_variation_apply), Table filter (free text), search field. `btn-secondary` "Export Filtered Results."

**Table columns:**

| Column | Type | Notes |
|---|---|---|
| Timestamp | datetime | ISO, sort default DESC |
| User | text | name + email (or "System (CI/CD)") |
| Impersonating | badge-amber | shown if `impersonating_as` set |
| Action | badge | insert=blue, update=gray, delete=red, schema_migrate=amber, rule_deploy=blue, tenant_variation_apply=amber |
| Table | monospace | `organizations`, `reference_tables`, etc. |
| Record ID | monospace short | |
| Changed Fields | chip list | truncated to 3, "+N more" |
| IP Address | monospace | |

Row click: expand inline detail showing `old_data` vs `new_data` JSON diff side-by-side (same pattern as SET-032).

**States:** Loading: skeleton 10 rows. Empty: "No audit log entries for selected filters." Large dataset: pagination 50 rows/page, load time warning if >30 days unfiltered.

---

### SET-026 — Security Settings

**Route:** `/settings/security`
**Purpose:** Configure password policy, session timeouts, lockout threshold, and MFA requirements.

**Layout:** SettingsLayout "Security Settings." Two-column layout (two cards side by side, each ~48% width).

**Left card — Password Policy:**

| Field | Type | Default | Validation |
|---|---|---|---|
| Minimum Password Length | number | 12 | min 8, max 128 |
| Password History Count | number | 5 | min 1, max 24 |
| Require Uppercase | toggle | ON | |
| Require Number | toggle | ON | |
| Require Special Character | toggle | OFF | |

**Right card — Session & Lockout:**

| Field | Type | Default | Validation |
|---|---|---|---|
| Session Timeout (minutes) | number | 480 | min 15, max 1440 |
| Max Login Attempts | number | 5 | min 1, max 20 |
| Lockout Duration (minutes) | number | 15 | min 5, max 60 |

**Below cards — MFA Policy:**
Radio group (full width card):
- `disabled` — No MFA anywhere
- `optional` — Users may enroll voluntarily
- `required_admins` — Owner / Admin / Module Admin must enroll
- `required_all` — All users must enroll

Helper text: "MFA method: TOTP (Google Authenticator / Authy). Biometric (WebAuthn) available in Phase 3."

`btn-primary` "Save Security Settings" (bottom, full-width card). On save: toast "Security policy updated." All active sessions that violate new policy will be invalidated on next request.

---

### SET-027 — Notification Preferences

**Route:** `/settings/notifications`
**Purpose:** Configure per-user notification channels per event category.

**Layout:** SettingsLayout "Notifications." Matrix table: rows = events, columns = channels (Email, In-App). Toggle at each intersection.

Event categories and events:

| Category | Events |
|---|---|
| NPD | core_closed, fa_d365_ready |
| Production | production_closed, mrp_closed |
| Schema | schema_migration_requested, schema_migration_completed |
| Integration | tenant_upgrade_canary_failed |

`btn-primary` "Save Preferences."

---

### SET-028 — Subscription & Billing (Phase 3)

**Route:** `/settings/billing`
**Purpose:** Phase 3 only. Displays plan, usage, payment method, invoice history. Shows "Coming in Enterprise Plan" placeholder in Phase 1/2.

**Layout:** SettingsLayout "Subscription & Billing." Phase 1/2 state: `alert-blue` "Billing management is available in the Enterprise plan. Contact sales@monopilot.io." `btn-secondary` "Contact Sales."

---

### SET-029 — Import / Export

**Route:** `/settings/import-export`
**Purpose:** Bulk CSV import and export for users, infrastructure, and reference data.

**Layout:** SettingsLayout "Import / Export." Two-column layout: Import card (left), Export card (right).

**Import card:**
- Entity selector: Users / Tax Codes / Locations / Allergens / Reference: [table_code]
- Step 1: File upload (drag-drop zone)
- → preview wizard (same as SET-053 flow)

**Export card:**
- Entity selector (same list plus Audit Logs)
- Format select: CSV / JSON
- Date range (for Audit Logs)
- `btn-primary` "Download Export"
- Recent exports list (last 5, each with download link, generated_at, size)

---

### SET-030b — Session Management

**Route:** `/settings/sessions`
**Purpose:** View all active sessions for the current user and org; revoke individual or all sessions.

**Layout:** SettingsLayout "Active Sessions." `btn-danger` "Revoke All Other Sessions" at top-right.

**Table columns:** Device / Browser | IP Address | Location (geo, best-effort) | Started At | Last Active | Current Session (badge-green "This session") | Actions (Revoke → MODAL-CONFIRM-REVOKE-SESSION).

---

### SET-031-pass — Password & Security (User Level)

**Route:** Accessible from user profile menu → "Security."
**Purpose:** User-level password change and MFA enrollment.

**Layout:** Page with two cards. Left card "Change Password": Current Password, New Password, Confirm New Password. Validation: checks V-SET-80/81 (min length, history). `btn-primary` "Update Password." Right card "Two-Factor Authentication": MFA status badge, `btn-primary` "Enable MFA" (shows MODAL-MFA-ENROLL) or "Disable MFA" (if enrolled, shows MODAL-CONFIRM-DISABLE-MFA).

---

### SET-090 — Email Config Editor

**Route:** `/settings/email`
**Purpose:** Configure email trigger rules via the `email_config` reference table (wrapper over SET-051 for `table_code=email_config`).

**Layout:** SettingsLayout "Email Configuration." Provider config card at top: Provider selector (Resend / Postmark), API key input (masked), From email, From name. `btn-secondary` "Test Send" → MODAL-EMAIL-TEST-SEND. `btn-primary` "Save Provider Config."

Below: Embedded reference table view for `email_config` rows (same as SET-051 but pre-filtered). Columns: Trigger Code | Recipients To | Recipients CC | Subject Template | Active. `btn-primary` "+ Add Trigger" → MODAL-REF-ROW-EDIT for `email_config`.

---

### SET-091 — Email Template Preview

**Route:** `/settings/email/preview`
**Purpose:** Render a Mustache email template with sample FA/WO data to verify layout.

**Layout:** Left panel: trigger selector, sample data editor (JSON, editable). Right panel: rendered email preview (iframe or styled div showing HTML output). `btn-secondary` "Send Test Email to [my email]."

---

### SET-093 — Email Delivery Log

**Route:** `/settings/email/log`
**Purpose:** View history of sent emails, failures, and retry status.

**Layout:** SettingsLayout "Email Delivery Log." Table: Sent At | Trigger | Recipients | Subject | Status (sent=green, failed=red, queued=amber, retrying=amber) | Actions (⋮: Retry if failed, View full email).

DLQ alert: if any email stuck >24h → `alert-red` at top "X emails stuck in dead-letter queue. Review and retry."

---

### SET-100 — Language Picker (User Menu)

**Location:** User avatar menu, top-right of global header.
**Purpose:** Switch UI language without page reload.

**Dropdown items:** 🇵🇱 Polski (pl), 🇬🇧 English (en), 🇺🇦 Українська (uk) — Phase 2, 🇷🇴 Română (ro) — Phase 2. Active language has checkmark. Selection updates `users.language`, triggers next-intl hot switch.

---

## 4. Modals

All modals use the shared overlay: `#modal-overlay` fixed inset 0, `rgba(0,0,0,0.5)` backdrop. `#modal-box` width 560px, max-height 80vh, overflow-y auto, padding 20px, border-radius 8px, white background. Header: title (16px bold) left-aligned, × close button right. Footer: action buttons right-aligned, cancel link left.

---

### MODAL-INVITE-USER

**Title:** "Invite Team Member"
**Opens from:** SET-008 action bar.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Email Address | email | Yes | validated email format |
| Full Name | text | No | optional pre-fill |
| Role | select | Yes | 10 system roles dropdown |
| Custom Message | textarea | No | included in invitation email, max 500 chars |
| Send Invite Now | toggle | — | default ON; if OFF, creates pending invite without sending |

**Buttons:** `btn-primary` "Send Invitation" | `btn-secondary` "Cancel."

**States:** Loading (submit): spinner in button. Success: modal closes, toast "Invitation sent to [email]." Error: inline `alert-red` "Failed to send invitation." Duplicate email: field-level error "This email already has an active account or pending invitation."

---

### MODAL-USER-EDIT

**Title:** "Edit User" or "User Details"
**Opens from:** SET-008 table edit action.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Full Name | text | Yes | |
| Email | email | Yes | changing email triggers re-verification |
| Role | select | Yes | 10 system roles |
| Language | select | No | overrides org locale |
| Status | toggle | — | Active / Inactive |

**Buttons:** `btn-primary` "Save Changes" | `btn-secondary` "Cancel."

**States:** Loading: form skeleton. Save success: toast "User updated." Cannot demote last `owner`: shows `alert-amber` "This is the only owner. Assign another owner first."

---

### MODAL-PERMISSION-MATRIX

**Title:** "Permissions — [Role Name]"
**Opens from:** SET-011 Roles table.

**Content:** Full-width scrollable table. Rows = modules (15). Columns = actions (view / create / edit / delete / execute). Each cell: checkbox (checked = permission granted). For system roles: all checkboxes are disabled (read-only). Permission string format: `module_code.action.scope`.

Footer note: "System roles cannot be modified. Custom roles (Enterprise) allow full matrix editing."

**Buttons:** `btn-secondary` "Close."

---

### MODAL-ROLE-ASSIGNMENT

**Title:** "Assign Role"
**Opens from:** SET-011 button.

**Fields:** User select (searchable, shows name + email + current role), New Role select (10 system roles), Reason (textarea, optional audit note). `btn-primary` "Assign Role."

---

### MODAL-WAREHOUSE-CREATE-EDIT

**Title:** "Add Warehouse" or "Edit Warehouse"
**Opens from:** SET-012.

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Code | text | Yes | uppercase alphanumeric, unique per org, e.g. "WH-03" |
| Name | text | Yes | min 2, max 100 |
| Type | select | Yes | raw / wip / finished / quarantine / general |
| Set as Default | checkbox | — | only one default per org |
| Address Line 1 | text | No | |
| Address Line 2 | text | No | |
| City | text | No | |
| Country | text | No | |

**Buttons:** `btn-primary` "Save" | `btn-secondary` "Cancel."

**Validation:** V-SET unique code. Default toggle: if another warehouse is default, show "This will replace [WH-01] as the default warehouse."

---

### MODAL-LOCATION-CREATE-EDIT

**Title:** "Add Location" or "Edit Location"
**Opens from:** SET-014.

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Warehouse | select (locked if adding child) | Yes | shows warehouse name |
| Parent Location | select | No | filtered to same warehouse; determines level |
| Code | text | Yes | unique per org |
| Name | text | Yes | |
| Type | select | Yes | zone / aisle / rack / bin |
| Max Capacity | number | No | positive integer |

Level is computed from parent: root = zone (L1), child of zone = aisle (L2), etc. Validation V-SET-60: level = parent.level + 1; same warehouse_id.

---

### MODAL-MACHINE-CREATE-EDIT

**Title:** "Add Machine" or "Edit Machine"
**Opens from:** SET-016.

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Code | text | Yes | unique per org, e.g. "MCH-001" |
| Name | text | Yes | |
| Machine Type | text | Yes | free text, e.g. "Mixer", "Oven" |
| Location | select | No | bin-level location picker (L4), V-SET-61 |
| Status | select | Yes | active / maintenance / offline |
| Capacity per Hour | number | No | positive decimal |
| Manufacturer | text | No | |
| Model | text | No | |
| Serial Number | text | No | |
| Purchase Date | date | No | |

Specs JSONB (Phase 2 / schema-driven): shown if org has L3 machine spec columns in `reference_schemas`.

---

### MODAL-LINE-CREATE-EDIT

**Title:** "Add Production Line" or "Edit Production Line"
**Opens from:** SET-018.

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Code | text | Yes | unique per org |
| Name | text | Yes | |
| Status | select | Yes | active / inactive |
| Default Location | select | No | location picker |
| Machines (ordered) | multi-select with ordering | Yes (at least 1 for activation) | drag-to-reorder sequence |

Machine sequence display: chips showing "MCH-001 → MCH-002 → MCH-003" with drag handles. V-SET-62: must have ≥1 machine to activate.

---

### MODAL-TAX-CODE-CREATE

**Title:** "Add Tax Code"
**Opens from:** SET-021.

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Code | text | Yes | uppercase alphanumeric, unique per org |
| Name | text | Yes | |
| Rate (%) | number | Yes | 0–100, stored as decimal (23% → 0.2300) |
| Set as Default | checkbox | — | |
| Effective From | date | No | |
| Effective To | date | No | must be after Effective From |
| Country Code | text | No | ISO 3166-1 (Phase 2) |
| Tax Type | select | No | standard / reduced / zero / reverse_charge / duty (Phase 2) |

---

### MODAL-TAX-CODE-EDIT

**Title:** "Edit Tax Code [CODE]"
Same fields as CREATE. Note: "Changing the rate creates a new effective-date record for audit. The original rate is preserved." (shown as `alert-blue` inside modal).

---

### MODAL-ALLERGEN-CREATE

**Title:** "Add Custom Allergen"
**Fields:** Code (text, must not conflict with A01–A14), Name (text), Is Active (toggle). `btn-primary` "Save."

---

### MODAL-API-KEY-CREATE

**Title:** "Create API Key"
**Fields:** Name (text, descriptive), Scopes (checkboxes: read / write / webhook / admin), Expires At (date picker, optional). `btn-primary` "Generate Key."

**Post-creation state:** Modal shows the full API key value ONCE in a code block with copy button. `alert-amber` "Copy this key now — it will never be shown again." `btn-secondary` "Done."

---

### MODAL-ROTATE-API-KEY

**Title:** "Rotate API Key — [Key Name]"
**Content:** `alert-amber` "Rotating this key will immediately invalidate the old key. Any systems using it will lose access." Confirm toggle: "I understand the old key will be invalidated." `btn-danger` "Rotate Key" (only enabled after toggle). Post-rotation: shows new key value once (same as post-creation).

---

### MODAL-CONFIRM-REVOKE (API Key)

**Title:** "Revoke API Key?"
**Content:** "Are you sure you want to revoke [Key Name]? This cannot be undone." `btn-danger` "Revoke" | `btn-secondary` "Cancel."

---

### MODAL-CONFIRM-REVOKE-SESSION

**Title:** "Revoke Session?"
**Content:** "[Device] session from [IP] started [date]. Revoking will immediately log out that session." `btn-danger` "Revoke Session" | `btn-secondary` "Cancel."

---

### MODAL-L1-PROMOTION

**Title:** "Request L1 Schema Promotion"
**Opens from:** SET-031 (Column Edit Wizard Step 8) or SET-030 (Schema Browser, L1 Promotion button).

**Content:**
`alert-amber` "L1 promotions affect all organizations using MonoPilot. This request will be reviewed by the MonoPilot team before execution."

Migration script preview: code block (SQL, read-only) showing the generated `CREATE COLUMN`, `backfill`, `NOT NULL`, index statements.

Affected orgs count: "This migration will affect [N] organizations."

Reason / justification (textarea, required): "Why should this become a universal column?"

`btn-primary` "Submit Promotion Request" | `btn-secondary` "Cancel."

**States:** Submit success: modal closes, toast "Promotion request submitted. You'll be notified when reviewed." Creates `schema_migrations` record `status='pending'`.

---

### MODAL-CONFIRM-REVERT

**Title:** "Revert Schema to Version [N]?"
**Content:** `alert-amber` "This will revert [column_code] to version N. Any changes since version N will be lost." Shows brief diff. `btn-danger` "Revert" | `btn-secondary` "Cancel."

---

### MODAL-DRY-RUN-DETAIL

**Title:** "Dry-run Result — [rule_code] Run [date]"
**Content:** Two-column layout (50% each): left "Sample Input" (JSON code block, read-only), right "Result" (JSON code block). Result badge at top: Pass=`badge-green`, Fail=`badge-red`, Warning=`badge-amber`. Warnings listed as bullet points below. `btn-secondary` "Close."

---

### MODAL-DISABLE-CHAIN-CONFIRM

**Title:** "Disable Module — Impact Warning"
**Content:** `alert-amber` "Disabling [Module Name] will also disable these dependent modules:" Bulleted list of affected modules. "Are you sure you want to disable all of these?" `btn-danger` "Disable All Listed" | `btn-secondary` "Cancel."

---

### MODAL-CONFIRM-FLAG-TOGGLE

**Title:** "Confirm Flag Change"
**Content:** "You are about to [enable/disable] [flag_code]. [Contextual warning based on flag]." For `integration.d365.enabled`: "D365 pull/push will [activate/deactivate]. All pending sync jobs will be [started/cancelled]." `btn-primary` "Confirm" | `btn-secondary` "Cancel."

---

### MODAL-D365-PREFLIGHT-FAILED

**Title:** "D365 Integration — Pre-flight Failed"
**Content:** `alert-red` "Cannot enable D365 integration." Checklist showing: ✓/✗ 5 constants populated (shows which are missing), ✓/✗ Connection test passed. Each failed item has an action link: "Configure Constants →" or "Test Connection →." `btn-secondary` "Close."

---

### MODAL-CONFIRM-MAINTENANCE-MODE

**Title:** "Enable Maintenance Mode?"
**Content:** `alert-red` "WARNING: Enabling maintenance mode will immediately lock out all non-superadmin users. They will see a maintenance page." Estimated duration: number input (optional). `btn-danger` "Enable Maintenance Mode" | `btn-secondary` "Cancel."

---

### MODAL-D365-CONNECTION-TEST

**Title:** "Testing D365 Connection…"
**States:** In-progress: spinner + "Connecting to D365 environment…"; Success: green checkmark + "Connection successful. Latency: [X]ms. Environment: [name]."; Failure: red × + error message + raw error code.

**Buttons:** `btn-secondary` "Close" (always visible after result).

---

### MODAL-EMAIL-TEST-SEND

**Title:** "Send Test Email"
**Fields:** To (email, pre-filled with current user's email), Trigger (select from enum), Sample FA/WO ID (text, optional — uses fake data if blank). `btn-primary` "Send Test."

**States:** Sending: spinner. Success: `alert-green` "Test email sent to [email]." Failure: `alert-red` with error.

---

### MODAL-CSV-IMPORT-PREVIEW

**Title:** "CSV Import Preview — [Table Name]"
**Content:** Summary strip "X rows parsed: X insert (green), X update (amber), X skip (gray), X errors (red)." Scrollable table preview (max-height 400px). `btn-primary` "Commit Import" | `btn-danger` "Cancel."

---

### MODAL-UPGRADE-PREVIEW

**Title:** "Preview v2 Upgrade — [Component]"
**Content:** JSON diff (left = current, right = v2) with colored lines. "Affected rows: X." Mermaid diagram showing what changes in rule/schema behavior. `btn-primary` "Start Canary Upgrade" | `btn-secondary` "Cancel."

---

### MODAL-CONFIRM-DEACTIVATE

**Title:** "Deactivate [Entity Name]?"
**Content:** "Are you sure you want to deactivate [name]? This entity will be hidden from active lists but retained in audit history." For warehouses with active WOs: `alert-amber` "There are [N] active work orders referencing this warehouse. Deactivation is a soft warning — those WOs will continue." `btn-danger` "Deactivate" | `btn-secondary` "Cancel."

---

### MODAL-CONFIRM-DELETE

**Title:** "Delete [Entity Name]?"
**Content:** `alert-red` "This action cannot be undone. [Name] will be permanently removed." Type-to-confirm: text input "Type DELETE to confirm." `btn-danger` "Delete" (enabled only when input matches) | `btn-secondary` "Cancel."

---

### MODAL-MFA-ENROLL

**Title:** "Set Up Two-Factor Authentication"
**Content:** Step 1: QR code (rendered server-side) + manual key. Step 2: Enter 6-digit code from authenticator app. Step 3: Confirmation + backup codes display (8 codes, download button). `btn-primary` "Verify & Enable."

---

### MODAL-CONFIRM-DEPT-CHANGE

**Title:** "Confirm Department Taxonomy Change"
**Content:** `alert-amber` "This change affects how columns and rules are grouped. Existing data remains intact; only routing and display changes." Summary of change (e.g. "Split 'technical' → 'food-safety' + 'quality-lab'. 12 columns remapped."). `btn-primary` "Apply Change" | `btn-secondary` "Cancel."

---

### MODAL-REF-ROW-EDIT

**Title:** "Add Row" or "Edit Row — [row_key]" (dynamic per table_code)
**Content:** Schema-driven form generated from `reference_schemas` for the given `table_code`. Fields vary per table (see SET-051 schema-driven columns section). Standard fields always present: Row Key (text, unique, locked on edit), Is Active (toggle).

Validation: per Zod schema generated from `reference_schemas`. Field-level inline errors. Concurrent edit detection: if `version` mismatch on save, show `alert-amber` "This row was modified since you opened this form. Review changes." and show diff.

**Buttons:** `btn-primary` "Save" | `btn-secondary` "Cancel."

---

## 5. Flows

### Flow 1 — First-Time Onboarding (6 Steps)

1. New org created (sign-up or superadmin provision). `organizations.onboarding_completed_at = NULL`. `onboarding_state = {current_step: 1, completed_steps: [], skipped_steps: []}`.
2. User visits `/settings` → dashboard detects empty state → shows full-screen empty state with "Start Setup Wizard" CTA.
3. User clicks CTA → navigate to `/settings/onboarding` (SET-001 launcher).
4. **Step 1** (`/settings/onboarding/org`): org profile form. User fills name, timezone, locale, currency. Clicks "Continue." Backend saves, `onboarding_state.completed_steps = [1]`.
5. **Step 2** (`/settings/onboarding/warehouse`): warehouse form. User fills code, name, type. Clicks "Continue." Backend creates warehouse, `completed_steps = [1,2]`.
6. **Step 3** (`/settings/onboarding/location`): location form pre-filled with warehouse from step 2. User fills zone code, name. Clicks "Continue." `completed_steps = [1,2,3]`.
7. **Step 4** (`/settings/onboarding/product`): redirect card to 03-TECHNICAL. User clicks "Go to Technical" (opens product create page; wizard state saved). OR user clicks "Skip" → `skipped_steps = [4]`, advances to step 5.
8. **Step 5** (`/settings/onboarding/workorder`): redirect card to 04-PLANNING-BASIC. Same skip pattern.
9. **Step 6** (`/settings/onboarding/complete`): confetti animation, completion card, next-steps grid. `onboarding_completed_at = now()`.
10. Return visits: if user navigates back to `/settings/onboarding` and `onboarding_completed_at` is set, redirect to `/settings` with toast "Setup already complete."
11. Resume: if `onboarding_completed_at = NULL` and `current_step > 1`, wizard shows "Continue where you left off" at step N.

---

### Flow 2 — L1 Schema Promotion

1. Admin is browsing SET-030 (Schema Browser). Finds an L3 column they believe should be universal.
2. Admin clicks "Request L1 Promotion" on the row. MODAL-L1-PROMOTION opens.
3. Admin reviews auto-generated SQL migration script (read-only). Fills in justification textarea (required). Clicks "Submit Promotion Request."
4. Backend creates `schema_migrations` record: `action='promote_l2_to_l1'`, `status='pending'`, `migration_script=<SQL>`, `created_at=now()`.
5. `audit_log` entry created: `action='schema_migrate'`, `action_reason=<justification>`.
6. Admin sees SET-033 (Schema Migrations Queue) with new row, status `badge-amber` "Pending."
7. Monopilot superadmin (separate `/admin/schema-migrations` tooling, out of scope for this UX) reviews, approves → `status='approved'`, `approved_by=<superadmin_id>`, `approved_at=now()`.
8. Background migration job picks up approved record. Status changes to `'running'` (pulsing `badge-blue` in queue).
9. Job executes: add column nullable → backfill data → add NOT NULL → update `reference_schemas.tier='L1'`.
10. On success: `status='completed'`, `executed_at=now()`. In-app notification + email to requesting admin: "Your L1 promotion for [column_code] has been completed."
11. On failure: `status='failed'`, `result_notes=<error>`. Rollback SQL executed. Admin notified: "L1 promotion for [column_code] failed. Original L3 schema restored."

---

### Flow 3 — Dept Split/Merge Upgrade Orchestration

1. Admin navigates to SET-061 (Dept Taxonomy Editor).
2. Selects "Technical" dept. Chooses "Split" operation.
3. Fills Target Dept 1: code `food-safety`, name "Food Safety." Target Dept 2: code `quality-lab`, name "Quality Lab."
4. Column mapping table appears: 12 columns in "Technical" dept. Admin assigns each to food-safety or quality-lab via dropdown per column.
5. Admin clicks "Save Changes." MODAL-CONFIRM-DEPT-CHANGE shows summary. Admin confirms.
6. Backend writes `tenant_variations.dept_overrides = [{action: "split", source: "technical", targets: [...], column_mapping: {...}}]`, increments version.
7. Runtime `dept_resolver` immediately uses new mapping. Column ownership updated in form rendering.
8. Audit log entry created. Toast "Department taxonomy updated."

---

### Flow 4 — Feature Flag Toggle with PostHog + Fallback

For **core flags** (`feature_flags_core` table):
1. Admin opens SET-071, Tab: Core Flags.
2. Admin flips toggle for `integration.d365.enabled` → ON.
3. System runs pre-flight V-SET-42: checks 5 constants populated AND test connection passes.
4. If pre-flight fails: MODAL-D365-PREFLIGHT-FAILED shows. Toggle reverts to OFF.
5. If pre-flight passes: MODAL-CONFIRM-FLAG-TOGGLE shows. Admin confirms.
6. Backend updates `feature_flags_core.is_enabled=true`. `audit_log` entry. Toast "Feature flag enabled."

For **PostHog flags** (non-core):
1. Admin views SET-071 Tab: PostHog Flags (read-only).
2. Admin sees flag status. To change: clicks "Open PostHog Dashboard ↗" (external link to PostHog self-hosted instance).
3. Changes made in PostHog propagate back to read-through view within ~30 seconds.

---

### Flow 5 — Rule Dry-run Simulation (Viewing Results)

> Note: Admin does not initiate dry runs from the UI. Dry runs are run by developers in the CI/CD pipeline or dev sandbox and results are stored in `rule_dry_runs`. Admin views the results.

1. Admin opens SET-041 (Rule Detail) for a rule, e.g. `allergen_changeover_gate`.
2. Clicks Tab "Dry-run Results."
3. Sees table of past runs. Clicks a row with `result=fail`.
4. MODAL-DRY-RUN-DETAIL opens: left panel shows sample input JSON, right panel shows result JSON with fail reason, warnings list.
5. Admin can see what inputs triggered a failure and use this for audit/investigation.
6. Admin cannot modify the dry-run or re-run from UI.

---

### Flow 6 — Reference Table CRUD with L2/L3 Schema Overrides

1. Admin navigates to SET-050 → clicks "Manage →" on `pack_sizes` card.
2. SET-051 opens for `pack_sizes`. Table shows current rows.
3. Admin clicks "+ Add Row." MODAL-REF-ROW-EDIT opens. Form generated from `reference_schemas` for `reference.pack_sizes`: fields are Pack Size (text, regex `^\d+x\d+cm$`), Display Order (number), Is Active (toggle).
4. Admin fills "30x50cm", order 6, active ON. Clicks "Save."
5. Backend: Zod validates per generated schema. If valid: upserts `reference_tables` row, `version++`, triggers materialized view refresh, `audit_log` entry.
6. Toast "Row added." Table reloads with new row.
7. If org has L3 schema extension on `pack_sizes` (e.g. extra field "Print Template"): MODAL-REF-ROW-EDIT shows additional L3 field from `ext_jsonb` path.

---

### Flow 7 — Import/Export Data

**Export:**
1. Admin opens SET-029 or uses "Export CSV" button in SET-051.
2. Selects entity and format. Clicks "Download Export."
3. Backend generates CSV with headers from `reference_schemas.columns`. File downloads immediately (or async for large datasets with email notification).

**Import:**
1. Admin clicks "Import CSV" in SET-051 → navigates to SET-053.
2. Step 1: Uploads CSV. Backend parses, validates header row against `reference_schemas` (V-SET-23).
3. If header mismatch: `alert-red` "Header mismatch. Expected: [list]. Found: [list]." No preview.
4. Step 2: Preview table shown with color-coded rows (insert/update/skip/error).
5. Admin reviews. May choose "Abort on any error" or "Skip error rows" toggle.
6. Clicks "Commit Import." Backend processes batch.
7. Step 3: Result: "X inserted, Y updated, Z skipped, W errors." Download error report if W > 0.

---

### Flow 8 — Invite User → Accept → Role Assignment

1. Admin opens SET-008, clicks "Invite User." MODAL-INVITE-USER opens.
2. Admin fills email, optional name, selects role, optional message. Clicks "Send Invitation."
3. Backend: creates `users` record with `invite_token`, `is_active=false`. Sends invitation email via Resend with link `https://app.monopilot.io/auth/accept-invitation?token=[token]`.
4. Invited user clicks link → `/auth/accept-invitation` page (public). Shows org name + role from token. User fills Full Name + sets password.
5. Clicks "Accept & Join." Backend validates token (not expired), activates user, assigns role.
6. User redirected to `/dashboard`. Onboarding context checks if org is new.
7. Admin sees SET-008 with user now showing `badge-green` "Active" and last login.

---

### Flow 9 — D365 Constants Change + Reconnect

1. Admin (role `owner`, `admin`, or `npd_manager`) navigates to SET-081.
2. Clicks edit (pencil) on a constant row, e.g. "Production Site ID."
3. Inline text input appears. Admin changes value from "FNOR" to new value.
4. Clicks ✓ to save row. Backend: upserts `reference_tables` row, `audit_log` entry, `changed_fields=['value']`.
5. Toast "D365 constant updated."
6. If `integration.d365.enabled=true`: `alert-amber` banner appears: "D365 integration is active. Changing constants may affect sync. Run a connection test to verify." `btn-secondary` "Test Connection" → MODAL-D365-CONNECTION-TEST.
7. If connection test fails after constant change: `alert-red` "Connection failed with new value. Previous value was: [old value]. Revert?" with `btn-danger` "Revert" and `btn-secondary` "Keep New Value."

---

## 6. Empty / Zero / Onboarding States

| Screen | Trigger | Message | Action |
|---|---|---|---|
| SET-000 | New org, no setup | "Welcome to MonoPilot! Let's get your organization set up." | `btn-primary` "Start Setup Wizard" |
| SET-008 | No users (impossible — owner always exists) | N/A | — |
| SET-010 | No pending invitations | "No pending invitations. Invite a team member." | `btn-primary` "Invite User" |
| SET-012 | No warehouses | "No warehouses. Add your first warehouse to enable locations and inventory." | `btn-primary` "+ Add Warehouse" |
| SET-014 | No locations in selected warehouse | "No locations in [Warehouse]. Add a zone to build your location hierarchy." | `btn-primary` "+ Add Location" |
| SET-016 | No machines | "No machines registered. Machines can be assigned to production lines." | `btn-primary` "+ Add Machine" |
| SET-018 | No production lines | "No production lines. Lines define your manufacturing flow." | `btn-primary` "+ Add Line" |
| SET-021 | No tax codes | "No tax codes. Add your VAT/tax rates for invoicing and costing." | `btn-primary` "+ Add Tax Code" |
| SET-023 | No API keys | "No API keys. Create one to connect external systems." | `btn-primary` "+ Create API Key" |
| SET-024 | No webhooks | "No webhooks configured. Webhooks send real-time event data to external URLs." | `btn-primary` "+ Add Webhook" |
| SET-025 | No audit logs (new org) | "No activity recorded yet. All changes will appear here." | None |
| SET-040 | No rules deployed | "No rules deployed. Contact your implementation team to deploy business rules." | None (read-only, no action available to admin) |
| SET-050 | (table always exists) | Per-table: "No rows in [Table]. Add your first row." | `btn-primary` "+ Add Row" |
| SET-060 | No L2 overrides | "No tenant variations configured. Your organization uses the standard baseline." | `btn-secondary` "Configure Dept Taxonomy" |
| SET-063 | No active migrations | "No upgrade migrations in progress." | None |
| SET-081 | No D365 constants | `alert-amber` "All 5 D365 constants required before enabling integration." | Per-row "+ Add" inline |
| SET-093 | No emails sent | "No emails sent yet. Configure triggers to start sending automated notifications." | Link to SET-090 |

---

## 7. Notifications, Toasts, and Alerts

### Toast notifications (top-right, auto-dismiss 4 seconds)

| Event | Type | Message |
|---|---|---|
| Any entity saved successfully | success (green) | "[Entity] saved successfully." |
| Invitation sent | success | "Invitation sent to [email]." |
| Column published | success | "Column published. Schema regenerating…" |
| Feature flag toggled | success | "Feature flag [code] [enabled/disabled]." |
| Module enabled | success | "Module [name] enabled." |
| Module disabled | warning | "Module [name] and [N] dependent modules disabled." |
| D365 constant updated | success | "D365 constant updated." |
| Import complete | success | "Import complete: X inserted, Y updated, Z skipped." |
| Import with errors | warning | "Import complete with errors: X rows failed. Download error report." |
| Save failed | error (red) | "Failed to save. Please try again." |
| Connection test passed | success | "Connection successful." |
| Connection test failed | error | "Connection failed. Check credentials." |
| Session revoked | success | "Session revoked." |
| L1 promotion submitted | success | "Promotion request submitted. You'll be notified when reviewed." |
| Migration started | info (blue) | "Canary migration started for [component]. Monitoring for 15–30 min." |

### Persistent alert banners (inside page content, not dismissable unless specified)

| Condition | Style | Message |
|---|---|---|
| Rule Registry (always) | `alert-blue` | "Rules are authored by developers and deployed via CI/CD. This view is read-only." |
| D365 integration active + constant changed | `alert-amber` | "D365 integration is active. Test connection after changing constants." |
| Force migration countdown | `alert-red` | "Your tenant must upgrade to v[N] within [X] days. [Start Upgrade]" |
| Maintenance mode active | `alert-red` full-width top | "Maintenance mode is active. Only superadmins can make changes." |
| Schema regeneration in progress | `alert-blue` dismissable | "Schema regenerating after your column change. Changes will be live in ~5 seconds." |
| D365 DLQ stuck >24h | `alert-red` | "X emails / sync jobs stuck in dead-letter queue." |
| Missing dry-run coverage | `alert-amber` in SET-040 | "X rules have not been dry-run in the past 30 days. Coverage alert." |

### Validation inline errors

All form fields: error message appears directly below field (font-size 12px, color `--red`) on submit attempt or on blur for known validators. Field border changes to `--red` with red focus ring.

---

## 8. Responsive Notes

**Primary target:** Desktop (1280px+). Admin-heavy module not optimized for mobile data entry; mobile is view-only + emergency toggle pattern.

### Desktop (≥1280px)
- Full dual-sidebar layout: global 220px + settings inner 256px = 476px left offset.
- Content area: max-width 1200px within remaining space.
- Tables: all columns visible.
- Modals: 560px fixed width, centered with overlay.
- Schema wizard: 680px card, centered.
- Card grids: 3 columns (SET-000 quick access, SET-050 reference index, SET-070 module grid).

### Tablet (768px–1279px)
- Settings inner sidebar collapses to icon-only (24px wide, icons + tooltips on hover).
- Content area padding reduces to 16px.
- Card grids: 2 columns.
- Tables: horizontal scroll if needed; hide "Last Modified" and "Version" columns by default.
- Modals: 90vw, max 560px.

### Mobile (<768px)
- Global sidebar: hamburger → overlay sheet.
- Settings inner sidebar: hidden; replaced by top breadcrumb + "Back to Settings" link.
- Card grids: 1 column stacked.
- Tables: card-row layout (each row becomes a card with label: value pairs).
- Modals: full-screen sheet from bottom.
- Action bars: `btn-primary` icon-only (+ icon) with text visible only ≥480px.
- Wizard: full-screen, step indicator collapses to "Step X of 6" text only.
- Schema wizard and Tenant Config screens: mobile shows `alert-blue` "For the best experience, use a desktop to configure schema and tenant settings."

---

## 9. Open Questions for Designer

1. **L1 promotion — approval UI placement:** The Monopilot superadmin approval panel (`/admin/schema-migrations`) is out of scope for this UX spec. Designer should note this as a separate internal tool. The SET-033 queue view is the admin-facing status tracker only.

2. **Mermaid diagram rendering:** SET-041 (Rule Detail) references auto-generated Mermaid flowcharts from DSL JSON. Designer should represent this as a placeholder diagram panel with label "Auto-generated flowchart" in the prototype, since actual generation depends on Mermaid.js library integration.

3. **PostHog self-host dashboard URL:** The "Open PostHog Dashboard ↗" link in SET-071 should be configurable per org. Designer should treat this as an `href` stored in org config, not hardcoded.

4. **Schema wizard Step 7 D365 Builder toggle:** The "Include in D365 Builder output" toggle should only be visible when `integration.d365.enabled=true` (core flag). Designer should conditionally show/hide this field in prototype.

5. **Allergen icon display:** `allergens_reference` table has an `icon_url` field. For EU-14 allergens these icons exist (EU standard pictograms). Designer can use placeholder SVG icons for prototype.

6. **Concurrent edit merge UI (Reference CRUD):** When version mismatch occurs on Reference table save, the spec says "show diff." The exact merge UI (accept theirs / accept mine / merge) is not yet fully designed. Designer can represent this as a two-column diff modal with "Accept Their Version" and "Keep My Version" buttons.

7. **Onboarding wizard Steps 4/5 redirect behavior:** When user clicks "Go to Technical" or "Go to Planning," do they leave the wizard entirely (wizard state saved, return via breadcrumb) or open in a modal/side-panel? PRD says "soft redirect." Recommend designer uses a full-page redirect with a persistent "Return to Setup Wizard" banner at top of the destination page.

8. **D365 Client Secret storage:** The secret field shows "masked after save." Designer should decide whether to show a placeholder like `••••••••••••` with a "Reveal" (eye icon) toggle (requires re-authentication) or simply prevent reveal. Recommend no-reveal pattern for security.

9. **Audit log partition navigation:** The audit log is partitioned monthly. For large orgs (7 years of data), the pagination approach may be insufficient. Designer should consider a month/year picker as a primary navigation control above the table filter bar.

10. **Rule registry "hard-lock semantics" (§7.5 EVOLVING):** The current spec shows no admin-approval button for L2 rule deploys. When this decision is resolved (02-SETTINGS-d build phase), an "Acknowledge" button may be added to SET-040 rows for L2 rules. Designer should leave a placeholder column slot "Admin Acknowledgment" in the table for this potential addition.

11. **Custom roles (Phase 3):** SET-011 shows a "Custom Roles" tab with "Coming in Enterprise" badge. Designer should prototype this tab as disabled with a clear upsell card rather than simply hidden.

12. **i18n language picker placement:** Language picker is in the user avatar dropdown menu (top-right global header). On the SET-101 (User Preferences) page, there should also be a language field that mirrors this selection. Both should stay in sync.

---

*End of 02-SETTINGS UX Specification v1.0 — 2026-04-20*
*Authored from: PRD 02-SETTINGS v3.0, MONOPILOT-SITEMAP.html design tokens, archive UX wireframes SET-000 through SET-031 + COMP-001..003.*
