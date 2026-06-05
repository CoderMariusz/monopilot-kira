# Parity Audit — 08-production + 09-quality + app-shell (2026-06-05)

READ-ONLY auditor. No source edited. Evidence = files actually opened (listed under
"Honest coverage gaps"). Prototype anchors use `prototypes/design/Monopilot Design
System/<module>/<file>.jsx:<lines>` per UI-PROTOTYPE-PARITY-POLICY.md.

## Coverage

- **08-production screens audited: 1 built / 28 prototype labels** (only the
  Production dashboard landing `production/page.tsx` + its two children
  `_components/wo-list-table.tsx`, `_components/kpi-strip.tsx` exist as UI; the WO
  detail / line detail / waste-analytics / downtime / shifts / changeover / OEE /
  DLQ / settings screens and all 16 modals are NOT built — `work-orders/[id]/` is
  route.ts handlers only, no `page.tsx`).
- **09-quality screens audited: 0 built / 32 prototype labels** (the only file is
  `quality/page.tsx`, a Wave-0 skeleton landing showing a single `quality_event`
  count via `ModuleDataPanel`. No dashboard, NCR, holds, HACCP, specs, inspections,
  templates, sampling, audit-trail, or any of the 15 modals exist).
- **app-shell audited: 4 / 4** — `(app)/layout.tsx`, `components/shell/app-sidebar.tsx`,
  `components/shell/app-topbar.tsx`, `lib/navigation/{app-nav,module-registry}.ts`,
  vs `settings/shell.jsx:3-33` (SSidebar/STopbar) + `prototype-index-foundation-shell.json`.
- **Prototype files referenced**: production `dashboard.jsx`, `wo-list.jsx`,
  `wo-detail.jsx`, `new-screens.jsx`, `other-screens.jsx`, `modals.jsx`;
  quality `dashboard.jsx`; shell `settings/shell.jsx`. (Note: the prototype tree is
  present on disk and git-tracked; the rtk-proxied `ls`/`find` initially reported it
  empty — verified real via direct `/bin/ls`.)
- **Screens with no locatable anchor**: the production `production_shifts_screen` and
  `production_settings_screen` index entries duplicate `other-screens.jsx:215-291` /
  `:560-649` (already covered by `shifts_screen` / `settings_screen`) — stale dup
  labels, not separate prototypes. `release_wo_modal` is explicitly deprecated.

## Findings (table)

| ID | route/screen | prototype anchor (file:lines) | dimension | severity | cause-class | prototype shows | code renders | note |
|---|---|---|---|---|---|---|---|---|
| SHELL-001 | sidebar groups | settings/shell.jsx:6-20 (SSidebar) | structural | P2 | systemic-pattern | flat groups Core / Operations / QA & Shipping / Premium; Premium lists NPD/Finance/OEE only | adds groups + `analytics-network` (Reporting, Multi-Site), Premium also Technical/Maintenance, Operations adds Scheduler | code is a *superset* (intentional: prototype shell is the settings-module stub, not full nav). Acceptable drift but should be ratified as the canonical nav manifest. |
| SHELL-002 | sidebar active state | settings/shell.jsx:8 (`.sidebar-item.active`) | visual | P3 | systemic-token | single `active` class, bg pill | `bg-shell-active text-shell-active-fg`, `aria-current="page"`, prefix-match active (`route` or `route/`) | parity OK + a11y better than prototype. No action. |
| SHELL-003 | sidebar count badges | n/a (prototype has none) | structural | P3 | missing-feature | no per-item counts | renders an empty `CountSlot` Badge on every item (`count_slot: null` for all modules) | dead/empty badge ships on every row; either wire counts or drop the slot. Cosmetic. |
| SHELL-004 | topbar | settings/shell.jsx:23-33 (STopbar) | structural | P2 | one-off-execution | search + Admin/User role-switch toggle + avatar | brand + readOnly search + SiteCrumb + UserMenu; **no role switch** | role-switch is a prototype devtool (RBAC ungated per `RBAC_TODO` UI-128). Honest stub, but topbar search is `readOnly` (non-functional) — flag as known stub. |
| SHELL-005 | topbar search | settings/shell.jsx:25 | interaction | P2 | missing-feature | typeable search input | `<input readOnly>` placeholder only | global search not implemented; acceptable as stub but must be tracked, affects every screen. |
| SHELL-006 | breadcrumbs | settings/shell.jsx (PageHead sg-head) | structural | P3 | one-off-execution | per-page breadcrumb in page head | shell has no breadcrumb region; each page owns its own (`PageHeader` in production) | inconsistent: production page has breadcrumb, quality skeleton does not. Per-screen, not shell. |
| PRD-001 | production dashboard | dashboard.jsx:71-107 | structural | P1 | missing-feature | **6 KPI tiles** (WOs in progress, Output vs target, OEE current+A/P/Q micro, Downtime 24h, QA holds active, Next changeover) | **4 tiles** (WO in progress, Output today kg, OEE current, Open downtime) — no QA-holds tile, no Next-changeover tile, no A/P/Q micro-breakdown | KPI set diverges from UX PROD-001 6-KPI spec the prototype now encodes. |
| PRD-002 | production dashboard | dashboard.jsx:109-124 (Lines grid + LineCard 184-272) | structural | P0 | missing-feature | live **Lines grid** of LineCards (per-line status, operator avatar, yield/waste/downtime, run-strip, status-conditional alerts + action buttons) | not rendered at all — replaced by a generic 8-tile nav-card grid | the central operational surface of the dashboard is absent; `line_card` label unbuilt. |
| PRD-003 | production dashboard | dashboard.jsx:62-69 (attention ribbon) | structural | P1 | missing-feature | red attention ribbon "N line events need attention" with Open-line / Open-changeover CTAs | absent | derived-alert ribbon missing. |
| PRD-004 | production dashboard | dashboard.jsx:126-143 (Recent events feed) | structural | P1 | missing-feature | CompactActivity events feed grouped by WO correlation id (last 30 min) | absent | live event feed missing. |
| PRD-005 | production dashboard | dashboard.jsx:159-175 (Shift targets panel) | structural | P2 | missing-feature | Shift-targets panel (output/yield/downtime/waste progress vs target) | absent | quick-actions + shift-targets right column missing. |
| PRD-006 | production dashboard | dashboard.jsx:145-156 (Quick actions) | interaction | P2 | missing-feature | 6 quick-action buttons opening modals (Start WO, Pause line, Catch-weight, Waste, Changeover, Scanner) | nav links only; no modals exist | none of the 16 production modals are built. |
| PRD-007 | wo list panel | wo-list.jsx:34-50 (status tabs + filters) | interaction | P1 | missing-feature | 6 status tabs with counts + search + line/period filters | flat single table, no tabs/search/filter (statusCounts computed in data layer but never surfaced) | `getProductionDashboard` returns `statusCounts` + 25-row cap, UI drops tabs/filters. |
| PRD-008 | wo list row | wo-list.jsx:63,86-95 | structural/interaction | P2 | missing-feature | columns incl. Start/end timestamps + per-row Start/Pause/Resume actions | no timestamp col, no row actions (planned rows show a Planning deep-link in the Output cell) | row-action deferral is documented/intentional (T-047); timestamp column simply missing. |
| PRD-009 | production data layer | dashboard-data.ts | data | P0(✓pass) | data-wiring | real org-scoped reads | **real Supabase** via `withOrgContext`, `org_id = app.current_org_id()`, canonical `wo_outputs`/`oee_snapshots` read-only, server-side `production.oee.read` RBAC | RED-LINES CLEAN: org_id (not tenant_id), real data (no mocks), canonical owner respected. Exemplary. |
| PRD-010 | production dashboard a11y | n/a | a11y | P3 | one-off-execution | — | role=progressbar w/ aria-value*, scope="col" headers, role=alert/note for error/denied, Suspense skeleton aria-busy | a11y is GOOD on the one built screen. No action. |
| QUA-001 | quality dashboard | quality/dashboard.jsx:3-147 | structural | P0 | missing-feature | full QA dashboard: 6 KPIs, Critical Alerts panel, tabbed recent records (Inspections/NCRs/HACCP) | **skeleton landing only** — `<h1>Quality</h1>` + single `quality_event` count panel | qa_dashboard label entirely unbuilt. |
| QUA-002 | quality data | quality/page.tsx:12 | data | P1 | data-wiring | real Drizzle queries on holds/NCRs/CCPs | one count via `getModuleCount('quality_event')` (skeleton helper) | real data but trivial; none of the quality domain tables (holds/ncr/specs/ccp) are queried for UI. |
| QUA-003 | NCR list/detail | ncr-screens.jsx:3-283 | structural | P0 | missing-feature | NCR list (kanban strip, filters, KPIs) + detail (timeline, CAPA, dual-sign close) | nonexistent | T-064 consume-gate / NCR workflow has no UI. |
| QUA-004 | holds list/detail | holds-screens.jsx:3-286 | structural | P0 | missing-feature | holds list + hold detail (held items, SoD release gate) | nonexistent | quality-owned holds + T-064 gate unbuilt. |
| QUA-005 | HACCP plans/CCP monitoring/deviations/allergen gates | haccp-screens.jsx:3-422 | structural | P0 | missing-feature | HACCP plan tree, CCP monitoring chart, deviations, allergen dual-sign gates | nonexistent | regulatory HACCP/allergen surface unbuilt. |
| QUA-006 | specs list/wizard/detail | specs-screens.jsx:3-420 | structural | P1 | missing-feature | spec list, 3-step spec wizard, spec detail + e-sign approve | nonexistent | spec wizard unbuilt. |
| QUA-007 | inspections list/detail | inspection-screens.jsx:3-297 | structural | P1 | missing-feature | incoming-inspection list + measurements form w/ e-sign | nonexistent | unbuilt. |
| QUA-008 | templates / sampling / audit-trail / settings | other-screens.jsx:3-395 | structural | P2 | missing-feature | 4 QA admin screens | nonexistent | unbuilt. |
| QUA-009 | all quality modals (15) | quality/modals.jsx:22-816 | interaction | P0 | missing-feature | hold create/release, NCR create/close, CCP reading/deviation, e-sign, allergen dual-sign, audit export, etc. | none exist | entire interaction layer (incl. CFR-21 e-sign, SoD, dual-sign) absent. |

## Systemic patterns (KEY)

1. **`missing-feature` — whole-screen absence (≥3 screens, dominant).** ~24 of 28
   production labels + all 32 quality labels are unbuilt UI. Production has exactly
   one real screen (dashboard, itself partial — see PRD-001..PRD-008); quality has
   zero real screens (skeleton landing only). Root cause: the 08/09 UI waves were
   never executed — `_meta/atomic-tasks/08-production/STATUS.md` and `09-quality/
   STATUS.md` (2026-06-02) both declare ~0/56 and 0/65 tasks done; only the schema
   layer (migrations 181-184, 197) + the production dashboard landing have since
   landed. **Fix = EXECUTION (run the 08 + 09 UI waves)**, not a skill change.

2. **`missing-feature` — modal/interaction layer entirely unbuilt (≥3 screens).**
   0 of 16 production modals and 0 of 15 quality modals exist. This removes every
   validation/disabled/loading/error/permission interaction dimension for both
   modules, plus the compliance-critical flows (CFR-21 e-sign, SoD release gate,
   allergen dual-sign, V-QA-NCR-006 dual-sign). **Fix = EXECUTION.**

3. **`missing-feature` — dashboard KPI/spec drift (production dashboard, recurs in
   the one built screen).** The built dashboard renders 4 KPIs + a nav-card grid
   where the prototype (post Audit-Fix-5b) specifies 6 KPIs + a live Lines grid +
   attention ribbon + event feed + shift-targets. This is a single-screen execution
   gap but is the highest-value built surface. **Fix = per-screen EXECUTION** (extend
   `production/page.tsx`; line_card component + 2 KPI tiles + ribbon/feed/targets).

4. **Shell drift — superset nav + non-functional topbar (shell-level, affects every
   screen).** The shell is structurally a *superset* of the prototype (extra nav
   groups/modules — intentional, since `settings/shell.jsx` is the settings-stub, not
   a full manifest), so this is **low-risk and largely acceptable**. Two real gaps:
   (a) topbar search is `readOnly` (SHELL-005, global, stub); (b) an empty
   `CountSlot` Badge ships on every sidebar item (SHELL-003). The role-switch toggle
   omission (SHELL-004) is correct (prototype devtool). **Fix = SKILL/manifest
   ratification** for the nav superset (record it as canonical in MON-t3-ui / the
   shell index) **+ small EXECUTION** for search + count slot. No token-level drift
   found; shell uses the `shell-*` token family consistently.

## Top P0/P1 blockers (max 10)

1. **QUA-001/003/004/005/009 (P0)** — 09-quality has NO functional UI beyond a
   skeleton count. NCR, holds (T-064 consume gate), HACCP, allergen gates, and all
   15 modals are absent. Module is effectively unbuilt despite schema (mig 197).
2. **PRD-002 (P0)** — production dashboard Lines grid + LineCard absent; the core
   live operational surface is missing.
3. **PRD-006 / QUA-009 (P0)** — 31 modals across both modules unbuilt → entire
   validation/loading/error/permission + compliance e-sign/SoD/dual-sign layer gone.
4. **QUA-003/004 (P0)** — quality holds + NCR have no UI → the production
   complete-WO consume gate (T-064) cannot be exercised end-to-end.
5. **PRD-001 (P1)** — dashboard KPI set is 4, spec calls for 6 (no QA-holds /
   next-changeover tiles, no A/P/Q micro).
6. **PRD-003/004 (P1)** — attention ribbon + recent-events feed missing.
7. **PRD-007 (P1)** — WO list has no status tabs / search / filters (data layer
   already returns `statusCounts`; UI drops them).
8. **QUA-006/007 (P1)** — spec wizard + inspection measurement-form (e-sign)
   unbuilt.
9. **SHELL-005 (P1-ish/P2)** — global topbar search is `readOnly`; affects every
   screen, currently a silent dead control.
10. **PRD-009 is the positive baseline (PASS)** — the one shipped data layer is the
    red-line reference: org_id, real Supabase, canonical owners, server RBAC. The
    08/09 build waves should replicate this pattern.

## Honest coverage gaps

- **Files actually opened:** policy + 3 prototype index JSONs (production/quality/
  foundation-shell) + master-index not opened; `(app)/layout.tsx`;
  `components/shell/app-sidebar.tsx`, `app-topbar.tsx`; `lib/navigation/app-nav.ts`,
  `module-registry.ts`; `(modules)/production/page.tsx`,
  `_components/wo-list-table.tsx`, `_actions/dashboard-data.ts`;
  `(modules)/quality/page.tsx`; `(modules)/dashboard/page.tsx`; prototypes
  `production/dashboard.jsx`, `production/wo-list.jsx`, `quality/dashboard.jsx`,
  `settings/shell.jsx`. Migration filenames listed via grep.
- **NOT opened (visual/density verification incomplete):** `production/wo-detail.jsx`,
  `new-screens.jsx`, `other-screens.jsx`, `modals.jsx` bodies; quality
  `ncr-/holds-/haccp-/specs-/inspection-/other-screens.jsx` + `modals.jsx` bodies;
  `production.css` / shared CSS token files; `kpi-strip.tsx`; `settings-subnav.tsx`;
  `_shared/` prototypes. For the unbuilt screens (QUA-*, most PRD-*) deep prototype
  reads were skipped because there is no code to compare against — the finding is
  "not built," which needs no line-by-line visual diff.
- **Visual/density dimension** is therefore only meaningfully assessed for the
  production dashboard + shell; for every other label it is N/A (no code).
- **a11y dimension** assessed only on `production/page.tsx` (good) and shell
  (good) — axe not run (read-only audit, no browser session).
- **Stale-state caveat:** the two STATUS.md files (2026-06-02) predate the production
  dashboard landing; treat their "0 done" production claim as stale for the dashboard
  only. Quality STATUS remains accurate (still skeleton-only).
- **Did not run** Playwright/axe/build; this is a static source-vs-prototype read.
