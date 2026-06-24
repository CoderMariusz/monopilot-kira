# MonoPilot Kira — SITE-scoping rebuild: action plan (2026-06-24)

**Owner directive:** the top-bar **Site** selector must DEFINE what's on screen. LP / WO / SO / PO of that
site only; scanner login creates pallets IN that site (not the FG default warehouse); pickers/links
scoped to the active site; every function executes against the active site. "Site ≡ warehouse"
(`warehouses.site_id` links them; production lines already carry `site_id`). Do NOT add duplicate
warehouse columns — unify on **site**.

Synthesized from 5 read-only investigations: site-backend matrix (a0a94d61), frontend/scanner
(a1cc593d), NPD-gate (a962d884), admin-RBAC (aae713ee + live verification), scanner-camera (#52).

---

## 0. Ground truth (what already exists — don't rebuild)

- **Site context plumbing exists:** cookie `mp_site_id` (httpOnly) · `getActiveSiteId()` ·
  `site-context.ts` / `site-actions.ts` `setActiveSite` · top-bar `site-switcher.tsx` · DB fn
  `app.current_site_id()` (mig 215). **No `withSiteContext` wrapper yet.**
- **Tables that ALREADY have `site_id`:** license_plates, work_orders, sales_orders,
  transfer_orders (indirect via from/to_warehouse_id), locations (via warehouse_id),
  production_lines (mig 268+312; **Drizzle model stale** — fix in scanner-LP lane),
  inventory_allocations, stock_moves, wo_outputs, wo_material_consumption, grns, grn_items,
  shipments, schedule_outputs, oee_snapshots, warehouses(.site_id).
- **Already site-correct reads:** `listWorkOrders`, `listLPs`, `getOeeScreen`.
- **Site selector wired into only 3 modules:** production-WO, warehouse-LP, OEE.
- **items / bom_lines intentionally org-scoped** (recipes are org-wide) — no change.

---

## 1. Schema changes (ALTER migrations — orchestrator applies via MCP)

| Table | Change | Why |
|---|---|---|
| `purchase_orders` (+ `purchase_order_lines`) | ADD `site_id uuid` (FK sites), backfill from receiving warehouse/org default, index `(org_id, site_id)` | POs are received into a site |
| `quality_inspections` | ADD `site_id uuid`, backfill from the inspected LP/WO site | QC happens at a site |
| `stock_adjustments` | ADD `site_id uuid`, backfill from LP site | adjustments are per-site |
| `transfer_orders` | ADD **direct** `site_id` (today only indirect via from/to_warehouse_id) — or keep indirect + document | clearer scoping |
| `production_lines` | **Drizzle model** `infra-master.ts` already missing the live `site_id` — sync the model (no DB change) | model drift |

All new columns: org-scoped, RLS via `app.current_org_id()`, GRANT to **`app_user`** (NOT
`authenticated` — that mistake broke deploys before). Backfill so existing rows keep working
(fail-OPEN on backfill, fail-CLOSED on new writes). Mirror a recent migration's RLS/grant block.

---

## 2. `withSiteContext` wrapper (the backbone)

Build `withSiteContext(siteId, fn)` analogous to `withOrgContext`:
- sets BOTH `app.current_org_id` and `app.current_site_id` GUCs for the request/transaction;
- `getActiveSiteId()` resolves: explicit arg → cookie `mp_site_id` → org `default_site_id`
  (and a clear error if an org has zero sites);
- **fail-closed:** a site-scoped write with no resolvable site returns a clear
  `no_active_site` error (never silently writes org-wide).
Then site-scoped reads can simply `AND table.site_id = app.current_site_id()` under RLS, or accept
an explicit `siteId` param. Prefer the GUC path for reads, explicit param for the scanner (session
carries `site_id`).

---

## 3. Read/list actions to scope by site (23 gaps — add `AND site_id = $activeSite`, fail-closed)

Grouped by module (file:line from the backend scan):

- **Production:** get-work-order-detail.ts:347
- **Warehouse/LP:** lp-actions.ts:175 `getLpDetail` · location-read-actions.ts:67 ·
  reservation-actions.ts:45 · inventory-actions.ts:46/104/162 · count-actions.ts:759 ·
  grn-actions.ts:69 `listGrns`
- **Quality:** inspection-actions.ts:453/387/561
- **Planning:** PO actions.ts:276/323 · TO actions.ts:266/311
- **Sales/ship:** so-actions.ts:496/319/604 (**`allocateSalesOrder` must enforce
  `so.site_id` AND the picked LP's site match**) · pack-actions.ts:515/193 `listShipments`/detail
- **Analytics/reports:** analytics-data.ts:125 · shifts-data.ts:103 ·
  report-read-actions.ts (5 places)

Each: add the site filter; if `activeSite` is null → return empty + a clear "select a site" notice
(reads) rather than leaking cross-site rows.

---

## 4. Pickers & links scoped to active site (frontend)

All currently org-scoped — must filter to the active site so "open WO → pick a LP/location" only
offers same-site options:
- listPlanningWorkOrders.ts:72 · wo-form-data.ts:92/127 · so-actions.ts:454 (SO line picker) ·
  PO actions.ts:262 · to-form-data.ts:40/97 (TO from/to) · lp-move-modal.client.tsx:90 (move dest).
- Wire the site selector into the remaining modules (planning, sales, purchasing, quality,
  transfers) the same way prod-WO/warehouse-LP/OEE already are.

---

## 5. Scanner: create pallets in the SESSION's site (IN PROGRESS — lane a21f35bd / ac547dd0)

- Scanner session already carries `site_id`; LP-creating services ignore it and pick the org-default
  warehouse via `ORDER BY is_default`, leaving `license_plates.site_id` NULL.
- Fix (green-lit, lane running): thread `session.site_id` through `withScannerOrg` →
  `registerOutput` / `registerDisassemblyOutput` / `receive-po`; resolve warehouse by
  `WHERE site_id = $session_site_id`; set `license_plates.site_id`; guard `no_warehouse_for_site`
  with a clear operator message; sync the stale Drizzle `warehouses.site_id`.

---

## 6. Warehouse stock visibility per-site (owner: "kiepsko widac stan magazynu")

- Warehouse dashboard KPIs + inventory pivots + GRN list are currently cross-site — scope them to the
  active site and add a clear "Site: X" header + an explicit per-warehouse/per-location stock view.
- Make the active-site filter visible and obvious on every warehouse screen (not a hidden cookie).

---

## 7. Admin = super-user + CLEAR "why blocked" errors (IN PROGRESS — lanes afd92037 / a85c9a44)

VERIFIED on live DB (corrects the first Codex scan):
- The pallet-move block was **NOT** RBAC — admin **has** `warehouse.stock.move`. The
  `requireScannerSession(...,'warehouse.scanner.move',...)` 3rd arg is an **audit label, not a gate**.
  The real problem is **opaque error codes** (`lp_not_movable`/`forbidden` with no message) →
  owner's "nie wiem czemu". → clear-error lane attaches human messages.
- Real super-user gaps: `admin` role is 6 settings-perms behind `org.access.admin`
  (settings.infrastructure.edit, .notifications.manage, .onboarding.write/complete, .schema.edit,
  .users.export); scheduler.* and npd.released_product_edit.* are unseeded on every role. →
  perm-parity SQL grants admin-family the full org-scoped catalog (both stores), excluding
  cross-tenant platform perms (settings.impersonate.tenant, org.scim.write).
- SoD gates (allergen dual-sign, stock-decrease countersign, over-consume approval) are enforced by a
  **different user_id at runtime** — granting the permission does NOT enable self-approval, so the
  super-user grant is safe. UI copy for those should say "requires a different person for separation
  of duties," not a bare "Supervisor required".

---

## 8. NPD gate de-duplication (separate task #54/#57)

- Real duplication: at gate G4 the user manually ticks `Done_<Dept>` while those departments are
  already closed in FA. Fix: make `Done_<Dept>` rows AUTO-DERIVED from FA closure (non-editable,
  link to the FA tab); pass `templateId` through `create-project.ts` (currently dropped at :42/151);
  move hardcoded handoff labels (gate-helpers.ts:558) to a reference table. Now folded into the
  **NPD dynamic departments/fields** rebuild (#57) since departments become org-configurable.

---

## Slice order (each = one Codex/Claude chunk, ≤5 files)

1. **S1 (schema):** ALTER migs for PO/QI/stock_adj (+TO direct site_id) + Drizzle sync. *(orchestrator applies)*
2. **S2 (backbone):** `withSiteContext` + `getActiveSiteId` fallback + fail-closed. *(Claude — architectural)*
3. **S3 (scanner LP→site):** IN PROGRESS (lane a21f35bd). *(kira-codex-review)*
4. **S4 (reads):** the 23 list/read gaps, batched by module (warehouse, planning, sales, quality, reports).
5. **S5 (pickers):** site-filter the 7 pickers + wire selector into remaining modules.
6. **S6 (warehouse visibility):** per-site KPIs + explicit stock view + visible site header.
7. **S7 (admin/errors):** IN PROGRESS (lanes afd92037 + a85c9a44). *(kira-codex-review)*
8. **S8 (cross-site leakage tests):** RLS + action tests proving a site-A user never sees site-B rows.

**Risk note:** S4/S5 are broad but mechanical once S2 lands. Do S1→S2 first (they unblock the rest);
S3/S7 already running. Hold the fail-closed switch behind the backfill (S1) so no existing row 404s.
