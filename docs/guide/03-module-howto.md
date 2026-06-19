# MonoPilot Kira — Module How-To / Where-Is-What (Operator + Admin Guide)

A grounded, route-by-route map of every module: which screens exist, what you can
**add / configure** and **where** (the button + the screen), what **options** each
form exposes, and how the feature behaves. Every entry is anchored to a real route
file under:

- `apps/web/app/[locale]/(app)/(modules)/…` — the operational modules
- `apps/web/app/[locale]/(app)/(admin)/settings/…` — Settings / Admin
- `apps/web/app/[locale]/(scanner)/…` — the warehouse / shop-floor scanner PWA

Routes are written without the `[locale]` prefix (every URL is `/<locale>/…`, e.g.
`/en/planning/work-orders`). Stubs and "coming soon" surfaces are marked honestly.

> **Login:** `admin@monopilot.test`. The seeded org-admin/owner role family receives
> the full permission set, so an admin sees every button described below. A scoped
> operator role sees a subset (see **RBAC** below). Scanner uses a separate **PIN**
> login (`/scanner/login`), not the email/password form.

---

## How permissions work (RBAC) — read this first

Permissions are the gate behind almost every "add / configure / approve" button in
this guide. They are not a UI flag; they are checked **server-side inside the Server
Action** before any write.

1. **The vocabulary lives in code.** Every permission string is defined in
   `packages/rbac/src/permissions.enum.ts` (the `Permission` const, ~960 lines —
   e.g. `settings.users.manage`, `technical.factory_spec.recall`,
   `planning.mrp.convert`, `warehouse.transfer.correct`, `rpt.dashboard.view`).
   Per-module groups are exported as `ALL_*_PERMISSIONS` arrays (e.g.
   `ALL_TECHNICAL_PERMISSIONS`, `ALL_REPORTING_CORE_PERMISSIONS`).

2. **Permissions are seeded onto roles via migrations.** Adding a string to the enum
   grants *nobody* anything — the deployed org-admin role has to receive it or every
   page 403s. The seeding pattern (see `packages/db/migrations/214-*.sql`,
   `300-r4-correction-perms-seed.sql`, `301-e6-mrp-perms-and-event-seed.sql`):
   - a `security definer` function `seed_<feature>_permissions_for_org(p_org_id)`
     inserts the new strings into the **normalized** `role_permissions` table **and**
     mirrors them into the **legacy** `roles.permissions` jsonb cache;
   - it targets the org-admin role family (`owner`, `admin`, `org.access.admin`,
     `org.platform.admin`, `org_admin`) plus the relevant operator/manager families,
     matched defensively across naming conventions (`on conflict do nothing`);
   - an `AFTER INSERT` trigger on `organizations` (named `trg_zzz_…`, sorts last so the
     base role seeds already exist) makes every *new* org inherit the grant; a
     `DO $$ … $$` block backfills every *existing* org.
   - **Separation-of-Duties** is enforced by which family each string is granted to —
     e.g. migration 300 grants the `*.correct` correction family ONLY to the admin tier
     and supervisor/manager tier, never to the base operator/scanner who performed the
     original action.

3. **The check.** Server Actions resolve the caller via `withOrgContext`
   (`apps/web/lib/auth/with-org-context.ts` — verifies the Supabase JWT with
   `getUser()`, resolves `org_id` from `public.users`, opens an RLS-scoped transaction),
   then call a `hasPermission(ctx, '<permission>')` helper. That helper runs one SQL
   query joining `user_roles → roles → role_permissions`, returning true if the
   permission is present in **either** `role_permissions` **or** the legacy
   `roles.permissions` jsonb. A missing permission yields `{ ok: false, error:
   'forbidden' }`, which the page renders as a permission-denied panel — never a 500.

4. **Granting in the UI.** An admin grants/revokes by **assigning roles** at
   **Settings → Users** (`/settings/users`) and by **editing which permissions a role
   carries** at **Settings → Roles** (`/settings/roles`). Role grants pass through
   `grantRole` (`packages/rbac/src/grant.ts`), which enforces SoD (an HMAC-signed,
   single-use dual-control approval token is required when `dual_control_required` is
   set or the target would hold a Separation-of-Duties-conflicting pair), rejects
   self-approval and legacy aliases, validates cross-org membership, and writes a
   `role.assigned` / `role.revoked` security audit event.

The seeded system roles (`packages/rbac/src/role-seed.ts`): **owner** (all perms),
**admin** (all `settings.*`), **module_admin** (user-admin subset), **npd_manager**,
**planner**, **production_lead**, **quality_lead** (+ spec approve),
**warehouse_operator**, **auditor** (audit read), **viewer** (settings read).

---

## Settings / Admin

Root: **Settings** (`/settings`, `…/(admin)/settings/page.tsx`). The settings area is
a large grid of sub-screens. Below are the operationally important ones; many are read
gated on `settings.*.view` and write gated on `settings.*.edit`.

### Settings / Admin

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **Users** (`/settings/users`) | **+ Create user** → create a user with a password; **Invite** → email invitation; **Assign role** per row; **Reset password**; **Deactivate** | role to assign; invite email; temp password | Actions in `actions/users/*` (`create-user-with-password`, `invite`, `assign-role`, `reset-password`). Gated on `settings.users.create / invite / manage` + `settings.roles.assign`. Role assignment goes through `grantRole` (SoD + dual-control + audit). |
| **Roles** (`/settings/roles`) | **+ Create role**; per-role **edit permission set** (the RBAC matrix — tick which `Permission` strings the role carries) → `setRolePermissions` | role name/slug; checkbox grid of permissions (`listRolePermissions`) | This is where role→permission grants are managed in-app, on top of the migration seed. `_actions/role-admin-actions.ts`. |
| **Authorization** (`/settings/authorization`) | Update org **authorization policy** (e.g. dual-control toggles) | `dual_control_required` and related policy flags | `actions/authorization/policy-actions`. Drives the `grantRole` SoD path. |
| **Sites** (`/settings/sites`) | Add / edit **sites** (the multi-site registry) | site code/name/active | Backs `app.current_site_id()` context. |
| **Lines** (`/settings/infra/lines`) | Add / edit **production lines** | line name, parent site/warehouse | Emits `settings.line.upserted`. |
| **Machines** (`/settings/infra/machines`, also `/settings/machines`) | Add / edit **machines** | machine name, line, cost model fields | Emits `settings.machine.upserted`. |
| **Locations** (`/settings/infra/locations`) | Add / edit **locations** in a tree; **Import CSV** → `importLocationCsvAction` | parent path, name, level, warehouse; CSV with row-numbered errors | Tree editor (`location-tree-client`). Emits `settings.location.upserted / imported / deleted`. |
| **Warehouses** (`/settings/infra/warehouses`, `/settings/warehouses`) | Add / edit / deactivate **warehouses** | warehouse code/name; storage rules | Emits `settings.warehouse.*`. |
| **Labels** (`/settings/labels`) | Create / edit **label templates** | template body, variables | `_actions/load-labels`. |
| **Devices** (`/settings/devices`) | Register / edit **scanner & print devices** | device name, type, binding | — |
| **Sign-off policies** (`/settings/signoff`) | Configure how many **e-signatures** each approval needs + **which roles may sign**; set **over-consume thresholds** | required signatures (1/2), first/second signer role, allow-same-user, active; `overconsume_threshold_pct` (auto-block) + `overconsume_warn_pct` | `_actions/signoff-actions.ts`. Drives dual-sign approval flows and the over-consume supervisor-PIN gate in production. |
| **Quality flags** (`/settings/quality`) | Toggle **Require GRN QC inspection** | `require_grn_qc_inspection` (on/off) | Gated on `settings.flags.edit`. When ON, received goods are blocked from consume until QC passes (`lib/warehouse/scanner/receive-po.ts`). |
| **Feature flags / Modules** (`/settings/features`, `/settings/flags`, `/settings/modules`) | Enable / disable **modules** per org | per-module toggle; plan name; active session count | `actions/modules/toggle`. Emits `settings.module.enabled/disabled/toggled`. |
| **Units of measure** (`/settings/units`) | Add **units** + **conversions** | base/each/box, conversion factors | `UnitsManager`. UoM is **dropdown-only** everywhere downstream (no free text). Emits `unit_of_measure.created / conversion_created`. |
| **Import / Export hub** (`/settings/import-export`) | **Start import job**; **Start export job**; view the master-data hub + job ledger | kind (import/export), target table, file | `actions/import-export/*`. Reads/writes `import_export_jobs`. **PO export** (E-IO) writes a row here automatically (see Planning). |
| **Integrations / D365** (`/settings/integrations`, `/settings/integrations/d365/*`, `/settings/d365-conn`, `/settings/d365-mapping`, `/settings/d365-dlq`) | View/configure the **D365** connection, field **mapping**, **sync** status, **drift**, **DLQ**, **cost import**, **audit** | connection creds; mapping rows; sync/drift views; DLQ retry | **Export-only** per platform rule R15 (no inbound pull — migration 218 removed import-pull). Gated on `settings.d365.*`. |
| Other: **Company / Profile** (`/settings/company`, `/settings/profile`, `/settings/my-profile`), **Security** (`/settings/security` — MFA/SSO/IP allowlist), **Audit** (`/settings/audit`, `/settings/audit-logs`), **Notifications** (`/settings/notifications`, email-log), **Schema/Reference/Rules** (`/settings/schema*`, `/settings/reference`, `/settings/rules`), **Tenant** (`/settings/tenant/*`), **Manufacturing ops** (`/settings/manufacturing-ops`), **Shifts** (`/settings/shifts`), **Shipping overrides** (`/settings/shipping-overrides`, `/settings/ship-override-reasons`) | view / configure their respective reference + governance data | — | These are the schema-driven / governance surfaces; each gates on its own `settings.*` family. |

---

## Technical (Factory Specification)

Root: **Technical** (`/technical`). Subnav covers items, BOM, factory specs, routings,
allergens, cost, nutrition, traceability, and more.

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **Items master** (`/technical/items`) | **+ New item** (wizard) → create an item; per-row **Edit** / **Deactivate**; **draft → active** transition | item type: **rm / intermediate / fg / co_product / by_product**; code, name, UoM/pack hierarchy (base/each/box + net per each), allergens; status badge | The single source of truth for every item. New items start **draft** and are promoted to **active** via the transition control. Gated on the `technical.items.*` family. UUID-leak fixes: tables show item **code** (mono), never raw UUIDs. |
| **Item detail / import** (`/technical/items/[item_code]`, `/technical/items/import`) | Edit one item; **bulk import** items | per-field edits; CSV import | Detail is keyed by `item_code`, not UUID. |
| **BOM** (`/technical/bom`, `/technical/bom/[itemCode]`, `.../recipe`, `.../graph`, `.../history`, `/technical/bom/diff/[productId]`, `/technical/boms/snapshots`) | **Create BOM** version; edit lines + **co-products**; **submit → approve → publish/release**; view graph / history / diff / snapshots | components & quantities, scrap %, co-product/by-product yields; version lifecycle **draft → technical_approved → active** | Shared BOM SSOT (`bom_headers/lines/co_products/snapshots`). Publish emits `fg.bom.released`. An active BOM blocks certain edits (clone-on-write). |
| **Factory specs** (`/technical/factory-specs`) | **Approve** a factory spec; **Recall** an approved/released spec | approver e-sign; recall reason | **Approve** emits `technical.factory_spec.approved`. **Recall** (R4) reverses approval — gated on `technical.factory_spec.recall` (admin tier + technical/quality lead only). Blocked while released/in-progress WOs reference the spec; clears `approved_by/at` and writes `technical.factory_spec.recalled` audit. `_actions/recall-spec.ts`. |
| **Routings** (`/technical/routings`) | Create / edit **routings** (operation sequences) | operations, machines, run/setup times | Gated on `technical.routings.*`. |
| **Allergens** (`/technical/allergens/cascade`, `…/contamination-risk`, `…/process-additions`, `…/overrides`, `/technical/allergens-config`) | Configure allergen **cascade**, **contamination risk**, **process additions**, **overrides** | per-item allergen profiles; may-contain; manufacturing-op additions | Full allergen cascade; consumes NPD-materialized `product.allergens / may_contain`. |
| **Cost** (`/technical/cost`, `/technical/cost/history`, `/technical/costs/d365-import`) | View / set **cost per kg**; view **cost history**; D365 cost import | cost-per-kg, effective date | `cost_per_kg` + `item_cost_history` are **dual-owned** with Finance. |
| **Traceability** (`/technical/traceability`) | Trace an item up/down the genealogy | item/lot input | Read view. |
| **Nutrition / Shelf-life / Sensory / Lab results / Materials / Compliance / ECO / Revisions / Tooling** (`/technical/nutrition`, `/technical/shelf-life`, `/technical/sensory`, `/technical/lab-results`, `/technical/materials`, `/technical/compliance`, `/technical/eco`, `/technical/revisions`, `/technical/tooling`) | View / edit the respective technical attribute | per-screen attributes | First verticals; each gates on its `technical.*` permission. |

---

## NPD (New Product Development)

Root: **NPD** (`/npd`). The flow is **Brief → Project → FG**, plus the FG/product
aggregate ("fa") read views and the formulation/nutrition/costing/compliance steps.

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **NPD dashboard** (`/npd/npd`) | Overview of NPD activity | — | Landing. |
| **Pipeline list** (`/npd/pipeline`) | **+ New project** (`/npd/pipeline/new`) → create an NPD project from a brief | project name, brief mapping, target FG | Emits `npd.project.created`. |
| **Project detail** (`/npd/pipeline/[projectId]`) + steps | Walk a project through its **stage gates** and per-stage work: **brief**, **formulation**, **nutrition**, **costing**, **packaging**, **pilot**, **trial**, **sensory**, **gate**, **approval**, **handoff** | per-step forms; gate advance/approve/revert; release request | Stage-Gate G0–G4. Gate events: `npd.gate.advanced / approved / reverted`. Release: `npd.project.release_requested` → `fg.released_to_factory`. |
| **Products** (`/npd/products`, `/npd/products/new`) | **+ New product** → create an FG/product record | 69-col Main Table fields (schema-driven Dept columns) | The FG aggregate. |
| **FA (product aggregate)** (`/npd/fa`, `/npd/fa/[productCode]`, `.../allergens`, `.../docs`, `.../risks`) | View product **allergens**, **compliance docs**, **risks**; upload docs | doc upload; risk entries; allergen view | Keyed by **product code**, not UUID. Compliance doc events: `compliance_doc.uploaded / expiring / expired`. V18 built-blocker on outstanding risks. |
| **Formulations** (`/npd/formulations`) | Edit / lock formulations | ingredient rows, %; lock | `formulation.locked / submitted_for_trial`. |
| **Allergen cascade** (`/npd/allergen-cascade`) | Run / view the multi-level allergen cascade | — | `npd.allergens.bulk_rebuild_completed`. |

---

## Planning

Root: **Planning** (`/planning`). Dashboard with WO/PO/TO KPI tiles + alert panels +
upcoming schedule (real Supabase reads). Header **Create WO / PO / TO** buttons link
to the live screens. "Run sequencing" and "Trigger D365" are intentionally **disabled**
("Not available yet" — no solver / D365 backend).

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **Purchase Orders** (`/planning/purchase-orders`, deep-link `?new=1`, detail `/planning/purchase-orders/[id]`) | **+ Create PO** (modal); per-row **View**; **Export to file** → CSV | supplier select, line editor (item search), expected date; status tabs + search + supplier filter | Create gated on `npd.planning.write`. **Export** (E-IO) reuses the same readers as the list, writes a `kind='export'` row to `import_export_jobs` (surfaces in Settings → Import/Export), and emits **human-readable** values only — supplier **CODE**, never raw UUIDs (`_actions/create-export-job.ts`). |
| **Transfer Orders** (`/planning/transfer-orders`, `/planning/transfer-orders/[id]`) | Create TO; **Reverse receive** (R4 correction) | source/dest site, lines; reverse: reason code + note + e-sign | **Reverse receive** un-posts an inter-site / TO receive — gated on `warehouse.transfer.correct` (admin + warehouse/production supervisor tier, NOT base operator). Requires e-signature + reason code, writes a returned-LP storno, emits `warehouse.lp.transitioned` (`_actions/reverse-receive.ts`). |
| **Work Orders** (`/planning/work-orders`, deep-link `?new=1`, `/planning/work-orders/new`, detail `/planning/work-orders/[id]`) | **+ Create WO** (modal); per-row **Release** | FG product search, planned qty (with UoM: base/each/box), scheduled start, line, machine, notes | Create + Release gated server-side (release in `releaseWorkOrder.ts`, `{ ok:false, error:'forbidden' }` on deny). |
| **MRP** (`/planning/mrp`) | **Run MRP** → `runMrp` (with persist toggle writes `mrp_runs` + `mrp_requirements`); **Convert planned → PO** and **Convert planned → WO** | persist toggle; demand source (incl. forecasts); select planned rows to convert | Run gated on `npd.planning.write`; **Convert** gated on **`planning.mrp.convert`** (`_actions/mrp.ts`: `convertPlannedToPo` / `convertPlannedToWo`, idempotent — already-converted rows are skipped). MRP never auto-creates orders; conversion is an explicit button. No prototype exists — follows MON-design-system. |
| **Forecasts** (`/planning/forecasts`) | Edit the demand grid (item × ISO-week); **Copy week**; **Import CSV** | inline-editable qty cells; item picker (searches `public.items`) | Independent demand that `runMrp` nets against (`demand_source='forecast'`). Read gated on `scheduler.run.read`; write gated on **`planning.forecast.manage`** (mig 302 `demand_forecasts`, `_actions/forecasts.ts`). |
| **Reorder thresholds** (`/planning/reorder-thresholds`) | Set per-item reorder points | min/reorder qty, severity | Feeds MRP severity + due dates. |
| **Suppliers** (`/planning/suppliers`, `/planning/suppliers/[id]`) | View / edit suppliers | supplier code/name/terms | — |
| **Schedule** (`/planning/schedule`) | View the schedule board | WO/PO/TO swimlanes | Read gated on `scheduler.run.read`. |

---

## Warehouse

Root: **Warehouse** (`/warehouse`). License-plate (LP) centric, FEFO inventory.

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **Inbound schedule** (`/warehouse/inbound`) | View expected inbound (open PO/TO receipts) | date/supplier filter | Read view. |
| **GRNs** (`/warehouse/grns`, `/warehouse/grns/[grnId]`) | Receive goods → create GRN; **cancel GRN line** (R3 correction) | received qty, LP, lot/expiry; line cancel reason | Emits `warehouse.grn.received`. Line cancel via `receipt-corrections-actions.ts`. If **Require GRN QC** is ON, received stock is blocked from consume until QC passes. |
| **License plates** (`/warehouse/license-plates`, `/warehouse/license-plates/[lpId]`) | View / inspect LPs; edit LP metadata (R3) | LP id, status, qty, location, lot | LP is the universal lot/qty unit. Metadata corrections in `receipt-corrections-actions`. |
| **Inventory** (`/warehouse/inventory`) | View on-hand by item/location | item/location/status filters | FEFO strategy. |
| **Movements** (`/warehouse/movements`) | Record / view stock moves | from/to location, qty | `stock-move-actions.ts`. |
| **Reservations** (`/warehouse/reservations`) | Create / release reservations | item, qty, demand ref | `reservation-actions.ts`. |
| **Expiry** (`/warehouse/expiry`) | View expiring / expired stock | window filter | `expiry-actions.ts`. |
| **Locations** (`/warehouse/locations`) | View the locations **tree** | warehouse → zone → bin | Read tree (authoring is at Settings → Locations). |
| **Genealogy** (`/warehouse/genealogy`) | Trace LP genealogy up/down | LP / lot input | `genealogy-actions.ts`. Empty state when no genealogy. |

All warehouse reads run inside `withOrgContext` (RLS); writes gate on the
`warehouse.*` permission family. Corrections (`*.correct`) gate separately on the
admin/supervisor tier (mig 300 SoD).

---

## Production

Root: **Production** (`/production`). WO execution + corrections + shifts.

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **WO list** (`/production/wos`) | Open a WO for execution (rows link to detail) | status filter, search | Mirrors the planning WO list; rows point at `/production/wos/[id]`. |
| **WO detail** (`/production/wos/[id]`) | **Start**, **Consume** material (desktop consume), **record Output** (+ QA release), **record Waste**, **record Downtime**; **corrections**: **Void output**, **Void waste**, **Reverse consumption** | consume LP picker + qty; output qty + QA; waste qty (**always kg**); downtime reason/duration; void/reverse reason code + e-sign | 8 tabs. Owns `wo_outputs` (canonical), `wo_waste_log`, `downtime_events`; produces `oee_snapshots` on WO COMPLETE. Corrections (`reverseConsumptionAction`, `voidWasteEntryAction`, `voidWoOutputAction`) post **storno** counter-entries (R2). Output emits `production.output.recorded`; consume passes the T-064 quality consume gate. |
| **Shifts** (`/production/shifts`) | View / manage shifts | shift windows | — |
| **Downtime / Waste / Changeover(s) / Analytics** (`/production/downtime`, `/production/waste`, `/production/changeover`, `/production/changeovers`, `/production/analytics`) | View/record the respective production data | reason codes, durations | Changeover sign emits `production.changeover.signed`; allergen changeover validated. |

Over-consumption: above the configured `overconsume_threshold_pct` (Settings →
Sign-off) consumption auto-blocks and requires a **supervisor PIN** to proceed; the
`overconsume_warn_pct` band warns but allows. Waste quantity is **always captured in
kg** (owner decision).

---

## Quality

Root: **Quality** (`/quality`).

| Screen (route) | What you can do / add here (button → action) | Key options | Notes / state |
|---|---|---|---|
| **Holds** (`/quality/holds`, `/quality/holds/[holdId]`) | **Create hold**; **Release hold** | hold subject (LP/lot), reason; release approval | `hold-actions.ts`. Drives the T-064 consume gate. Events `quality.hold.created / released`. |
| **NCR** (`/quality/ncrs`, `/quality/ncrs/[ncrId]`) | **Open NCR**; submit; assign; close; **critical dual-sign** | severity, disposition, assignee; dual e-sign for critical | `ncr-actions.ts`. Events `quality.ncr.opened/submitted/assigned/closed/critical_dual_signed`. |
| **Specifications** (`/quality/specifications`, `/quality/specifications/[specId]`) | Create / edit quality **specs** (spec wizard); approve | spec parameters, limits; approver | `spec-actions.ts` + `can-spec.ts` (permission helper). |
| **Inspections** (`/quality/inspections`, `/quality/inspections/[inspectionId]`) | Create / record **inspection**; pass/fail | inspection type, sample, results | `inspection-actions.ts`. Gates GRN-QC when Require GRN QC is ON. |
| **CCP Monitoring (HACCP)** (`/quality/ccp-monitoring`) | **+ Record reading** for a CCP | CCP select, reading value, IN/OUT-of-limit | **Wave E3.** Board of CCPs with latest reading + in/out-of-limit badge. A breach auto-raises an NCR (surfaced inline). Latest reading derived server-side; only CCP **code/name** reach the UI (no `*_id`). `_actions/haccp-actions.ts` (`listCcps` / `listMonitoringLog` / `recordMonitoring`). Filter bar + timeline chart are a documented deferred deviation. |

---

## OEE / Maintenance / Finance / Shipping / Scheduler / Multi-site / Reporting

| Module (route) | State | What exists |
|---|---|---|
| **OEE** (`/oee`) | **Real, read-only** | OEE dashboard — Factory OEE + A/P/Q micro-stats, output, downtime KPI row + drilldowns. **Read-only consumer** (D-OEE-1): the `oee_snapshots` producer is 08-production (fired on WO COMPLETE), OEE never writes them. `_actions/oee-data.ts`. |
| **Maintenance** (`/maintenance`) | **Real, first vertical** | MWO list (status tabs + search + table + per-status row action) + PM schedule list; **+ Create MWO** modal. Replaced the Wave-0 stub. Single landing route (no sub-routes yet). LOTO / calibration dual-sign live in the domain backend. |
| **Finance** (`/finance`) | **Real, first vertical** | WO actual-cost table (`FinanceWoCostTable`) with loading / ready / permission-denied / error states. Standard cost / valuation / variance + D365 stage-5 export-only per R15. Single landing route. |
| **Reporting** (`/reporting`) | **Real, read-only first slice** | Condensed overview (4 dashboards: replaces the full 10-dashboard catalog as a first slice). KPI rows + dense tables + export. Gated on the `rpt.*` family (mig 214): viewer = `rpt.dashboard.view`; operator adds CSV/PDF export + presets; manager adds schedule + mv.refresh. `_actions/report-read-actions.ts`. |
| **Shipping** (`/shipping`) | **Landing only (count panel)** | Module landing showing a live record count for `shipment` (org-scoped). The full SO / pick / pack / SSCC-18 / BOL flow lives in the domain backend + scanner-adjacent actions, but the desktop module page is a data-count landing, not the full UI yet. |
| **Scheduler** (`/scheduler`) | **Stub** | Renders `ModuleStubNotice` ("not live yet" badge). |
| **Multi-site** (`/multi-site`) | **Stub** | Renders `ModuleStubNotice`. Multi-site context (`app.current_site_id()`) is wired at the data layer; the dedicated UI is a stub. |

---

## Scanner (warehouse / shop-floor PWA)

Root group: `(scanner)` — a separate dark, full-bleed, touch-first shell intended for a
real phone/handheld (not the desktop app shell). **De-mock note:** the scanner screens
are **real-data only** — `scannerFetch` (Bearer token; `401 → /scanner/login`) talks to
the live warehouse/production scanner routes; the prototype mocks (mock LP-lock,
mock PO lists) have been removed (`move-screen.tsx`, `putaway-screen.tsx`,
`receive-po`/`wos` screens all read live).

### Login + context selection

| Screen (route) | What you do | Notes |
|---|---|---|
| **PIN login** (`/scanner/login`) | Enter your **PIN** to authenticate (no email/password) | Set/reset your PIN at `/account/pin` (desktop) or `/scanner/login/pin-setup`. |
| **PIN setup** (`/scanner/login/pin-setup`) | First-time PIN enrolment | — |
| **Site / line / shift** (`/scanner/login/site`, `/scanner/settings`) | Select **site**, **line**, and **shift** for the session | Context is carried by `useScannerSession`; tiles and lists scope to it. |

### Home tiles (`/scanner/home`)

The home screen groups tiles into **Production / Warehouse / Quality** sections. Tiles
whose flow isn't built yet render **disabled**. Live tiles:

| Tile | Route | Action |
|---|---|---|
| **Work orders** | `/scanner/wos` | Browse WOs (search + All / My line / Active pills), tap into the execute hub. |
| **Consume** | `/scanner/wos/[woId]/consume` | Scan LP + record consumption against a WO (UoM-aware; over-consume gate applies). |
| **Output** | `/scanner/wos/[woId]/output` | Record produced output against a WO (+ register output modal). |
| **Waste** | `/scanner/wos/[woId]/waste` | Record waste (kg) against a WO. |
| **Pick** | `/scanner/pick` | Pick stock for a demand. |
| **Receive (PO)** | `/scanner/receive-po`, `…/[poId]`, `…/[poId]/[lineId]` | Receive against a PO line (real PO list; 500-safe). Honors Require-GRN-QC. |
| **Putaway** | `/scanner/putaway` | Put received stock away to a location. |
| **Move** | `/scanner/move` | Move an LP between locations (success shows from → to). |
| **QA** | `/scanner/qa` | Scanner QC / inspection actions. |
| **LP info / inquiry** | `/scanner/lp` | Scan an LP to see its status, qty, location, lot. |

WO detail hub: `/scanner/wos/[woId]` (tap a WO → consume / output / waste). Status chips
use the dark scanner palette. Every list/screen renders all five states (loading,
empty, error, permission-denied via 401→login, optimistic).

> Dev harness: `/dev/scanner` and `/scanner` (root) exist for development; production
> entry is `/scanner/login → /scanner/home`.

---

## Cross-cutting notes

- **Real data, no mocks.** Every operational screen reads Supabase via `withOrgContext`
  (RLS-scoped). "Live" means querying Postgres on Vercel, never fixtures.
- **UUID-leak fixes.** Lists and exports surface human-readable **codes** (item code,
  supplier code, PO/WO number, CCP code) — raw UUIDs are dropped from UI and CSV output.
- **Tooltips.** Disabled header actions (e.g. Planning "Run sequencing", "Trigger
  D365") carry `title`/tooltip copy explaining why ("Not available yet").
- **UoM is dropdowns only.** Base/each/box + conversions are configured at Settings →
  Units; downstream forms never accept free-text units.
- **Corrections are reversible + audited.** Void output, void waste, reverse
  consumption (production); cancel GRN line, reverse receive, LP-metadata edit
  (warehouse/planning); factory-spec recall (technical) — each posts a storno /
  counter-entry, requires the correction-tier permission, and writes an audit event.
