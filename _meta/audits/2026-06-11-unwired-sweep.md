# Unwired Feature Sweep — 2026-06-11

Auditor: Claude Sonnet 4.6 (read-only, no edits made to source)
Tree: main @ f26d46da (current working tree, uncommitted wave-8 work treated as truth)

---

## CLASS 1 — ORPHAN TABLES

Tables defined in migrations but with zero app-code reads or writes (SQL string search across apps/web + packages).

| Table | Migration | Classification | User-visible consequence | Suggested wiring | Effort |
|---|---|---|---|---|---|
| `spare_parts_stock` | 193 | Truly orphan | No UI to view/adjust spare parts inventory; maintenance module cannot report stock levels | Add read action + page in maintenance (or warehouse) module | M |
| `lot` | 014 | Stub placeholder (skeleton-data count only) | Count shown on placeholder landing page; no real use | Superseded by real operational tables; consider dropping or evolving into batch-lot tracing | L |
| `work_order` (singular) | 014 | Stub placeholder (skeleton-data count only, also used in `close-out-legacy-stages.ts`) | Same as `lot` | Legacy skeleton — superseded by `public.work_orders` (migration 176) | L |
| `quality_event` | 014 | Stub placeholder (skeleton-data count only) | Count shown on quality landing page | Superseded by `quality_holds`/`ncr_reports` | L |
| `shipment` (singular) | 014 | Stub placeholder (skeleton-data count only) | Count shown on placeholder landing page | Superseded by migration-211 shipping tables | L |
| `bom_item` (singular) | 014 | Stub placeholder (skeleton-data count only) | Count shown on technical landing page | Superseded by `bom_lines` | L |
| `standard_costs` | 199 (finance) | Orphan (no app reads) | Finance module is a full stub; no cost views | Wire when finance module is built | L |
| `wo_actual_costing` | 199 (finance) | Orphan (no app reads) | Same as above | Same | L |
| `inventory_cost_layers` / `item_wac_state` / `cost_variances` | 199 (finance) | Orphan | Same as above | Same | L |
| All maintenance tables (`technician_profiles`, `maintenance_settings`, `equipment_registry`, `maintenance_work_orders`, `spare_parts_catalog`, `calibration_records`, `sanitation_checklists`, `maintenance_history`, etc.) | 201 | Orphan — maintenance module page shows `ModuleStubNotice` | Full maintenance module is not started | Build 13-maintenance module | L |
| `changeover_events` (write path) | 184 | Read-only wired — data exists but NO create/update UI | Operators cannot record a changeover; the screen shows existing rows only | Add changeover creation form in production module (wave 8b) | M |
| `allergen_changeover_validations` | 184 | Truly orphan (not read or written by app code) | BRCGS 7y retention records never created | Requires changeover write path first | M |
| `signoff_policies` | 275 | Read + Write wired (signoff-actions.ts + settings/signoff page) | Wired | — | — |
| `line_machines` | 042 | Wired (settings/infra/lines page.tsx + actions/infra/line.ts) | — | — | — |
| `org_authorization_policies` | 063 | Wired (actions/authorization/policy-actions.ts + settings/authorization/page.tsx) | — | — | — |
| `changeover_events` (read) | 184 | Read-only wired (production/changeover) | — | — | — |
| `downtime_events` | 183 | Read-wired (production/downtime + analytics) | — | — | — |
| `oee_snapshots` | 184 | Read-wired (production/analytics) | — | — | — |
| `tenant_migrations` | 013 | Wired (tenant upgrade actions) | — | — | — |
| `grns`, `grn_items`, `stock_moves`, `lp_state_history` | 193 | Wired | — | — | — |

Evidence:
- `spare_parts_stock` zero hits: `rg "spare_parts_stock" apps/web/` → 0 matches
- Maintenance app: `/apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx` L1-19 renders `ModuleStubNotice`
- Finance app: `/apps/web/app/[locale]/(app)/(modules)/finance/page.tsx` L1-22 renders `ModuleStubNotice`; finance table names: 0 app matches outside migration files
- `allergen_changeover_validations`: 0 app code matches
- Changeover write: `apps/web/app/[locale]/(app)/(modules)/production/changeover/_actions/changeover-data.ts` — SELECT only, no INSERT/UPDATE

---

## CLASS 2 — DEAD SERVER ACTIONS / API ROUTES

Server actions or API routes that exist but appear not to be imported/called by any page/component.

| File | Classification | User-visible consequence | Effort |
|---|---|---|---|
| `apps/web/app/[locale]/(app)/(admin)/settings/shipping-overrides/_actions/shipping-overrides.ts` | Dead stub — the page at this route is a redirect to `/settings/ship-override-reasons` (the canonical route). The `_actions` file in the redirect dir appears to be a copy that is not imported anywhere | Dead import; no user impact (redirect wins) | S — delete duplicate |
| `apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/_actions/shipping-overrides.ts` | Canonical, wired | — | — |

Evidence:
- `/apps/web/app/[locale]/(app)/(admin)/settings/shipping-overrides/page.tsx` L7-10: just calls `redirect()`, no action imports
- The duplicate action at `/settings/shipping-overrides/_actions/shipping-overrides.ts` is an identical file to the canonical one at `/settings/ship-override-reasons/_actions/`

---

## CLASS 3 — MISSING-INPUT-UI DEAD-ENDS

Schema columns or flow-gates that have no UI to set them, dead-ending a user flow.

| Column / flag | Table | Gate it controls | UI to set it | Consequence | Effort |
|---|---|---|---|---|---|
| `dual_sign_off_status`, `first_signer`, `second_signer`, `first_signed_at`, `second_signed_at` | `changeover_events` | B-2 allergen dual-sign-off requirement | None — columns are read-only in changeover screen | BRCGS §9.7 dual sign-off completely unenforceable by operators | M (planned wave 8b) |
| `atp_required`, `atp_result`, `cleaning_checklist`, `cleaning_completed` | `changeover_events` | Changeover completion gate | None — displayed but not settable | No way for operators to record cleaning evidence | M (planned wave 8b) |
| `require_grn_qc_inspection` | `tenant_variations.feature_flags` | Should gate scanner GRN receive → queue for QC | Flag can be set in Settings › Quality (setRequireGrnQcInspection.ts), but the scanner `/api/warehouse/scanner/receive-line` route does NOT read this flag | Setting the flag has zero operational effect — scanner receive proceeds regardless | S (planned wave 8) |
| `qa_status_initial` on `grn_items` | 193 | QC hold on receipt | Scanner receive sets this to `'pending'` but no scan-time QC decision path exists (no scanner `/scanner/qa` home tile wiring — see Class 4) | QC-required items land in `pending` state with no scanner flow to progress them | M (wave 8 QA scanner tile) |
| `item.status = 'draft'` | `items` | Item not usable in BOM | Items can be created in `draft` via `create-item.ts` but there is no "activate" button in the items UI | Items stay in `draft` forever unless set to `active` via direct DB or import | S |
| `items.uom_secondary` | `items` | Secondary catch-weight UoM | No field in item create/edit wizard for `uom_secondary` | Cannot configure secondary UoM through UI; must be set via import CSV | S |
| `work_orders.planned_start` / `planned_end` | 176 | Scheduling | Not settable from the desktop Production WO detail page; WO create form has `scheduled_start`/`planned_end` in planning module but the production side's WO detail has no edit path for these | Cannot reschedule from production UI | M |

Evidence:
- `changeover_events` read-only: `apps/web/app/[locale]/(app)/(modules)/production/changeover/_actions/changeover-data.ts` — only SELECT queries
- `require_grn_qc_inspection` not read in receive: `rg "require_grn_qc" apps/web/app/api/` → 0 matches
- `uom_secondary` not in wizard: `rg "uom_secondary" apps/web/app/` → 0 matches in create-item.ts / item-create-wizard.tsx

---

## CLASS 4 — SEEDED PERMISSIONS WITH NO ENFORCEMENT POINT

Permission strings that are seeded into `role_permissions` but never checked by `hasPermission()` / `hasWarehousePermission()` in any server action or API route.

| Permission family | Migration | Enforcement in app code | Consequence | Effort |
|---|---|---|---|---|
| `mnt.*` (17 strings: `mnt.asset.read`, `mnt.mwo.*`, `mnt.pm.*`, `mnt.calib.*`, `mnt.spare.*`, `mnt.loto.*`) | 202 | Only in `navigation/module-registry.ts:18` (`mnt.asset.read` gates nav entry) | All 17 permissions are seeded to roles but enforced by zero server actions (module not built) | Build 13-maintenance module |
| `ship.*` (14 strings: `ship.so.create`, `ship.hold.*`, `ship.alloc.*`, etc.) | 212 | Zero enforcement in any server action or page | Shipping module is a full stub; permissions are seeded but meaningless | Build 11-shipping module |
| `fin.*` (finance permissions) | 199 | Only in `navigation/module-registry.ts:15` (`fin.costs.read` gates nav entry) | Finance module stub | Build 10-finance module |
| `rpt.*` (14 strings: `rpt.dashboard.view`, `rpt.export.*`, etc.) | 214 | Only in `navigation/module-registry.ts:17` | Reporting module stub | Build 12-reporting module |
| `ms.*` (multi-site family) | 216 | Zero enforcement | Multi-site module stub | Build 14-multi-site |
| `production.consumption.override_approve` | 185 | Checked in `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts` (over-consumption approver gate) | Enforced (canonical string; the invented `production.overconsume.approve` + redundant migration 273 were removed by the Wave 8a batch-B review fixes) | — |

Evidence:
- `rg "mnt\." apps/web/` — only navigation/module-registry.ts and navigation/types.ts
- `rg "ship\." apps/web/` — only navigation registry; no `hasPermission` call
- `rg "rpt\." apps/web/` — only navigation registry

---

## CLASS 5 — NAV DEAD-ENDS

Nav items or buttons that are disabled ("coming soon") where the destination page ALREADY EXISTS, or links pointing to non-existent routes.

| Location | href / state | Target page | Classification | Consequence | Effort |
|---|---|---|---|---|---|
| Quality landing nav (`quality/page.tsx:28`) | `href: null, live: false` for `ncrs` | `/quality/ncrs/page.tsx` EXISTS with full NCR list + detail | Dead nav — page exists but nav card is disabled | Users cannot navigate to NCRs from the quality landing | S — change `href: null` to `href: '/quality/ncrs'` and `live: true` |
| Scanner home screen (`home-screen.tsx:38-55`) | `to: null` for `putaway`, `move`, `pick`, `qa` | All four pages exist: `scanner/putaway/page.tsx`, `scanner/move/page.tsx`, `scanner/pick/page.tsx`, `scanner/qa/page.tsx`; all API routes also exist | Dead nav — 4 of 5 missing wires; pages are built but the launcher tile stays `to: null` | Operators have no way to reach putaway/move/pick/QA scanner flows | S — wire `to` values in SECTIONS array |
| Scanner home screen (`home-screen.tsx:39`) | `to: null` for `pick` (production section) | `scanner/pick` page exists | Same issue as above | Operators cannot initiate WO-based pick from scanner | S |
| Warehouse landing nav (`warehouse/page.tsx:66`) | `disabled: true` for `locations` | `/warehouse/locations/page.tsx` EXISTS (WH-018 with real tree UI) | Unnecessary disable — page is built and functional | Users cannot reach location hierarchy from warehouse landing | S — set `disabled: false` |
| LP detail action buttons (`lp-detail.client.tsx:84-93`) | `disabled` for `split`, `merge`, `qa`, `reserve`, `block`, `destroy` | No dedicated pages (inline modals would be needed) | Legitimately deferred — no backend routes exist for these yet | Partial LP actions unavailable | M |

Evidence:
- Quality NCRs: `find apps/web/app -path "*/quality/ncrs/page.tsx"` → exists
- Scanner putaway: `find apps/web/app -path "*/scanner/putaway/page.tsx"` → exists; confirmed `to: null` in `home-screen.tsx` L45
- Scanner move: L46 `to: null`; scanner pick L38 `to: null`; scanner qa L52 `to: null`
- Warehouse locations: `find apps/web/app -path "*/warehouse/locations/page.tsx"` → exists; `warehouse/page.tsx` L66 `disabled: true`

---

## MODULES NOT STARTED (confirmed stub status)

| Module | Evidence |
|---|---|
| 07-planning-ext / Scheduler | `apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx` — `ModuleStubNotice`; migration 204 schema only |
| 10-Finance | `finance/page.tsx` — `ModuleStubNotice`; migrations 199-200 schema only |
| 13-Maintenance | `maintenance/page.tsx` — `ModuleStubNotice`; migration 201-202 schema only |
| 15-OEE | `oee/page.tsx` — `ModuleStubNotice`; migrations 203/228 schema only; OEE data IS read by production/analytics but OEE module landing is a stub |
| 12-Reporting | `reporting/page.tsx` — `ModuleStubNotice`; migration 213-214 schema only |
| 11-Shipping | `shipping/page.tsx` — `ModuleStubNotice`; migration 211-212 schema only |
| 14-Multi-site | `multi-site/page.tsx` — `ModuleStubNotice`; migration 215-216 schema only |

---

## TOP-10 PRIORITY LIST (user-visible dead-ends first)

| Rank | Finding | Class | User pain | Effort |
|---|---|---|---|---|
| 1 | Scanner home tiles `putaway`, `move`, `pick`, `qa` all have `to: null` — pages AND API routes are fully built (wave 8) but the launcher never opens them | Class 5 | Operators literally cannot reach the new warehouse scanner flows | S |
| 2 | Quality landing nav card for NCRs has `href: null` — the `/quality/ncrs` page is built and wired | Class 5 | Users cannot navigate to NCR list from quality module landing | S |
| 3 | Warehouse locations nav card `disabled: true` — `/warehouse/locations` page (WH-018) is built | Class 5 | Users cannot reach the location hierarchy from warehouse landing | S |
| 4 | `require_grn_qc_inspection` flag can be set in Settings but the scanner receive route never reads it — setting it has no effect | Class 3 | QC gate is silently bypassed on every scanner GRN receive | S |
| 5 | Changeover events: `dual_sign_off_status`, `first_signer`/`second_signer`, `cleaning_completed`, `atp_result` are display-only — no write path exists | Class 3 | BRCGS §9.7 allergen changeover sign-off and cleaning evidence are unenforceable; planned wave 8b | M |
| 6 | `allergen_changeover_validations` table is fully orphaned — no app code reads or writes it | Class 1 | 7-year BRCGS retention records never created; depends on item 5 | M |
| 7 | `spare_parts_stock` table is fully orphaned — no read/write in any app code | Class 1 | Spare parts inventory level invisible to users | M |
| 8 | `items.status = 'draft'` has no "activate" button in the items UI — items created via wizard default to `active` in practice, but the draft state is unreachable/irrecoverable via UI | Class 3 | Items stuck in draft cannot be promoted without SQL or CSV reimport | S |
| 9 | `mnt.*` / `ship.*` / `fin.*` / `rpt.*` permission families are seeded to roles but enforced by zero server actions | Class 4 | No user-visible impact until modules are built, but permission grants are wasted until then | L (whole module build) |
| 10 | Duplicate action file at `settings/shipping-overrides/_actions/shipping-overrides.ts` — a copy that is never imported (the page at that route just redirects) | Class 2 | No user impact; dead code confusion | S |

---

## COUNTS SUMMARY

| Class | Count |
|---|---|
| Class 1 — Orphan tables | 11 tables (5 R13 stubs + spare_parts_stock + full maintenance set + changeover write + allergen_changeover_validations + finance tables) |
| Class 2 — Dead server actions / API routes | 1 (duplicate shipping-overrides action file) |
| Class 3 — Missing-input UI dead-ends | 7 column/flag gaps |
| Class 4 — Seeded permissions with no enforcement | 5 families (mnt, ship, fin, rpt, ms — full modules not built) |
| Class 5 — Nav dead-ends | 5 (4 scanner tiles, 1 quality NCR card, 1 warehouse locations card — 3 fixable with S effort) |

