# Wave F3 · Lane A4 — Live-browser E2E CRUD Completeness Matrix

- Target: https://monopilot-kira.vercel.app (TEST stage, owner-authorized)
- Session: logged in as Apex Admin (platform admin), org **Apex 22** (`000000000000`), Site = All sites
- All created records prefixed `E2E-F3-`
- Legs scored: **PASS** / **FAIL** (error text captured) / **MISSING** (no UI affordance) / **SKIPPED** (blocked by earlier leg)
- Date: 2026-07-02

## 0. Scoreboard (17 entities · 68 legs attempted)

- **2 CREATE FAILs** (blocking): **User** and **Inspection** — both silent no-ops (Server Action returns HTTP 200, no record created, no error surfaced).
- **8 MISSING legs**: Customer R/U/D (no detail route at all), Role U/D (Phase-3), Work-order D (no Draft cancel), Sales-order U (no Draft edit), NCR close.
- **All 15 non-failed CREATEs PASS.** All READs PASS where a create succeeded (Cycle count only after fixing the site).
- 2 e-sign flows (Quality-hold release, Stock adjustment) correctly enforced 21 CFR Part 11 with password `Admin2026!!!`.

## 1. CRUD Matrix

| Entity | CREATE | READ | UPDATE | DELETE/CLOSE/DEACTIVATE | Notes |
|---|---|---|---|---|---|
| Raw-material item | PASS | PASS | PASS | PASS (Deactivate → Blocked; code-typed confirm + reason) | 4-step wizard `/technical/items?modal=create` |
| Supplier | PASS | PASS | PASS | PASS (Deactivate soft → Inactive) | `/planning/suppliers`; soft-delete only |
| Supplier spec/price | PASS | PASS | PASS | PASS (Deactivate/supersede) | via item detail → Supplier specs tab |
| Customer | PASS | **MISSING** | **MISSING** | **MISSING** | `/shipping/customers` list-only; row click no-op; no detail route (404) |
| Location | PASS | PASS | PASS | PASS (hard delete, confirmed) | `/settings/infra/locations` tree; cleaned up |
| User | **FAIL** | SKIPPED | SKIPPED | SKIPPED | `/settings/users` → Invite user; create is SILENT NO-OP (see FAIL #1) |
| Role | PASS | PASS (row) | MISSING | MISSING | `/settings/roles` → + Create role; custom-role edit/delete = Phase 3 (disabled) |
| NPD project | PASS | PASS | PASS | PASS (hard delete, confirmed) | `/pipeline/new` 4-step wizard; brief edit persists; cleaned up |
| Purchase order | PASS | PASS | PASS | PASS (Cancel) | Draft PO-202607-0012; note: create BLOCKED until a Site is chosen in top bar (see obs) |
| Transfer order | PASS | PASS | PASS | PASS (Cancel) | TO-202607-0004 CHILL→PRODUCTION; cleaned up |
| Work order | PASS | PASS | PASS | **MISSING** | WO-202607-0006 Draft; NO cancel/delete affordance for a Draft WO (list row = Release+BOM only; detail = Edit + tabs only). Remains. |
| Sales order | PASS | PASS | **MISSING** | PASS (Cancel) | SO-202607-00004; NO edit affordance for a Draft SO (lines read-only, no Edit/Add-line); only status transitions. Cancelled. |
| Quality hold | PASS | PASS | n/a | PASS (Release + e-sign) | HLD-00001006; released with password e-sign (21 CFR Part 11); LP returned. Clean. |
| NCR | PASS | PASS | PASS | **MISSING** | NCR-00001003 Open; investigation edit saves; NO close/status-transition button on detail (close appears gated behind Phase-2 CAPA). Remains open. |
| Inspection | **FAIL** | SKIPPED | SKIPPED | SKIPPED | `/quality/inspections` → New inspection; create SILENT NO-OP (see FAIL #2) |
| Stock adjustment | PASS | PASS | MISSING (by design) | MISSING (by design) | `/warehouse/adjustments/new` with e-sign; minted LP-1783012977308-RVKB (+5 kg found stock). List is explicitly "read-only audit" — immutable ledger, so no U/D expected. |
| Cycle count session | PASS | PASS* | n/a | PASS (Close) | CNT-F8706AE3 Spot count; *detail 404'd ("Count session not found") until top-bar Site matched the warehouse's site — see obs. Closed. |

## 2. FAIL details

### FAIL #1 — User CREATE is a silent no-op
- URL: `https://monopilot-kira.vercel.app/en/settings/users`
- Flow: "+ Invite user" → dialog. Tried BOTH variants:
  - "Set password instead of sending invite" (admin-only immediate active account): filled email `e2e-f3-user01@apex.test`, name, role Viewer, password `E2eF3Passw0rd!!` (twice) → clicked "Create user".
  - Default email-invite: filled email + name → clicked "Send invitation".
- Result (both): dialog stays open, no toast, no inline error; user count stays **1 users** even after a full page reload. The Server Action POST `/en/settings/users` returns **HTTP 200** but no user is created and nothing is surfaced to the operator.
- Exact error text: **none shown** (silent failure — this is the bug: 200 response, no create, no feedback).
- Screenshot: `/Users/mariuszkrawczyk/Projects/monopilot-kira/e2e-f3-user-create.png`

### FAIL #2 — Inspection CREATE is a silent no-op
- URL: `https://monopilot-kira.vercel.app/en/quality/inspections`
- Flow: "+ New inspection" → dialog. Reference type License plate, picked LP-1782928513076-A1HW (FG-KAB-01) → "Create inspection".
- Result: dialog closes with no error, but the inspection list stays **0 rows / Total Inspections 0** even after a full page reload. Server Action POST `/en/quality/inspections` returned **HTTP 200** (observed 3×) yet no inspection is created.
- Exact error text: **none shown** (silent failure).
- Screenshot: `/Users/mariuszkrawczyk/Projects/monopilot-kira/e2e-f3-inspection-create.png`

## 3. MISSING-leg list
- **Customer READ**: clicking a customer row (`customer-row-<id>`) does nothing; no detail drawer; direct URL `/shipping/customers/<id>` returns "Page not found". Customer master is create-only from the UI.
- **Customer UPDATE**: no edit affordance (no row action, no detail).
- **Customer DELETE/DEACTIVATE**: no deactivate affordance in the list; "Inactive" status exists in stats but no UI path to set it.

## 4. Observations (non-blocking findings)
- **Site-scoping trap (MED)** — two flows require/trip on the top-bar Site while it defaults to "All sites":
  - **PO create** hard-blocks with alert "Select a site in the top bar before creating a purchase order." (no default site → the whole create is unreachable from "All sites").
  - **Cycle count session** creates a session for a chosen warehouse, then redirects to a detail that shows "Count session not found" AND the session is absent from the list — because the session's site ≠ the current top-bar site. Switching the top-bar Site to the warehouse's site makes it appear. Silent, confusing; no warning at create time.
- **Supplier detail**: scorecard link renders raw i18n key `detail.scorecard` (missing translation).
- Immutable-by-design (correct, not bugs): Stock adjustments list is an explicit "read-only audit" (no U/D). Quality hold release + Stock adjustment both correctly enforce 21 CFR Part 11 e-sign (password `Admin2026!!!` accepted).
- App modals set `aria-hidden` on the overlay → snapshots must query `[role="dialog"]` directly (tooling note, not a product bug).

## 5. Cleanup log

### Removed / reversed by me
- Location `E2E-F3-LOC` — **hard-deleted** ✓
- NPD project `NPD-016` (E2E-F3 Test NPD Project) — **hard-deleted** ✓
- Purchase order `PO-202607-0012` — **Cancelled** ✓
- Transfer order `TO-202607-0004` — **Cancelled** ✓
- Sales order `SO-202607-00004` — **Cancelled** ✓
- Quality hold `HLD-00001006` — **Released** (e-sign) ✓ (LP returned to normal)
- Supplier spec (E2E-F3-SUP01 / v2 on E2E-F3-RM01) — **Deactivated** ✓
- Item `E2E-F3-RM01` — **Deactivated → status Blocked** ✓
- Supplier `E2E-F3-SUP01` — **Deactivated → status Inactive** ✓
- Cycle count session `CNT-F8706AE3` — **Closed** ✓

### Remains (no delete/close UI available)
- Customer `E2E-F3-CUST01` — no read/edit/deactivate UI at all (create-only master).
- Role `e2e_f3_role` (E2E-F3 Test Role) — custom-role edit/delete is Phase-3 (disabled); no removal path.
- User invite — **not created** (create failed), so nothing to remove.
- Inspection — **not created** (create failed), nothing to remove.
- Work order `WO-202607-0006` (Draft) — no cancel/delete affordance for a Draft WO; remains in Draft.
- NCR `NCR-00001003` (Open) — no close/status-transition affordance; remains Open.
- Stock adjustment (LP `LP-1783012977308-RVKB`, +5 kg found stock, item now Blocked) — immutable audit ledger entry + minted LP; no reversal UI. LP remains in inventory.

### Config side-effect
- Top-bar **Site** was changed from "All sites" → "Production1" → "warehouse 1" during the run (required for PO create / to view the count session). Left on "warehouse 1". This is a per-session UI preference, not a data change.

## 6. UNCOVERED
- None. All 17 requested entity/leg walks were attempted.
- Legs scored as SKIPPED (User R/U/D, Inspection R/U/D) were blocked by the upstream CREATE failure, per scoring rules — not left unattempted.
