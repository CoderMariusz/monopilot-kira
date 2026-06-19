# MonoPilot Kira — Manual QA Test Plan (Owner Checklist)

**Audience:** the product owner doing acceptance click-throughs.
**Goal:** confirm the app works on the **live deploy (Vercel + Supabase)** and **locally**, with real Supabase data (never mocks).
**Last grounded against:** `main` @ `4cf0a48c` + uncommitted expansion slices (scanner de-mock, W11 R4, E6 MRP, E3 CCP, E-IO PO export) — migs 272–301 live.

## How to use this checklist

- Every test cites the **real route** that exists in the codebase (`apps/web/app/[locale]/(app)/...`). Routes below omit the `[locale]` prefix — in the browser they appear as `/en/...` (or `/pl/...`).
- Tick `[ ]` when the **PASS criterion** is met. If it fails, note the screen + what you saw.
- Tests marked **`expected: stub`** exercise an area that is intentionally partial today. "Passing" a stub test means *the honest stub/empty/disabled state shows* — NOT that the feature is complete. These are flagged so you are not confused.
- **Login:** `admin@monopilot.test` / `Admin2026!!!`. The scanner PIN may have been reset by an E2E run — if PIN login fails, re-set it at `/account/pin` first.

---

## Section 0 — Automated gates (run these first)

These are the real commands from `CLAUDE.md` and `package.json`. Run from the repo root. Capture the **actual** output — a self-declared green with no run does not count.

- [ ] **0.1 — Repo guards.** `pnpm lint && pnpm typecheck && pnpm test:smoke`
  - `lint` = `scripts/lint-no-hardcoded-strings.mjs && pnpm -r lint`; `typecheck` = `pnpm -r typecheck` (`tsc --noEmit`); `test:smoke` = `pnpm --filter web test:smoke`.
  - **PASS:** all three exit 0. (Today's known-green: `pnpm --filter web typecheck` exit 0; hardcoded-strings guard exit 0.)
- [ ] **0.2 — Web unit / RTL (targeted).** `pnpm --filter web vitest run <path>` for the area you touched, e.g.
  - `pnpm --filter web vitest run app/[locale]/(app)/(modules)/production/wos/[id]/_components/__tests__/wo-reverse-consumption.test.tsx`
  - `pnpm --filter web vitest run app/[locale]/(app)/(modules)/planning/mrp/__tests__/mrp.test.tsx`
  - **PASS:** the named suite is green with a real run line.
- [ ] **0.3 — RBAC + drift gates.** `pnpm --filter web vitest run lib/rbac` (permissions snapshots) and the outbox enum↔CHECK drift gate.
  - **PASS:** rbac suite green (37 passing today, snapshots bumped for the 5 new perms: `warehouse.transfer.correct`, `technical.factory_spec.recall`, `planning.mrp.run/convert`, `planning.forecast.manage`).
- [ ] **0.4 — Playwright E2E.** `pnpm --filter web exec playwright test <spec> --trace on`, e.g. `apps/web/e2e/r3-reversibility-evidence.spec.ts` or `module-nav-route-contract.spec.ts`.
  - **PASS:** the spec passes; on failure inspect the trace. **`expected: partial`** — E2E coverage is selective, not whole-app; some specs need a seeded DB.
- [ ] **0.5 — DB schema / RLS suite (local only).** `pnpm db:up && pnpm db:test` (needs local Postgres; `db:test` = `pnpm --filter @monopilot/db test`).
  - **PASS:** schema + RLS suite green locally. (N/A on the Vercel preview — DB tests are a local gate.)

---

## Section 1 — Login + shell smoke

- [ ] **1.1 — Desktop login.** Route: `/(auth)/login`. Open the app → enter `admin@monopilot.test` / `Admin2026!!!` → **Sign in**.
  - **PASS:** lands on `/dashboard` (the app shell), no 500, no `?reason=idle` bounce loop.
- [ ] **1.2 — Sidebar renders all module groups.** Route: `/dashboard`. Look at the left sidebar.
  - **PASS:** groups **Core** (Dashboard, Settings), **Operations** (Planning, Scheduler, Production, Warehouse, Scanner), **QA & Shipping** (Quality, Shipping), **Premium** (Technical, NPD, Finance, OEE, Maintenance), **Analytics & Network** (Reporting, Multi-Site) all visible.
- [ ] **1.3 — Topbar + user menu.** Route: any `(app)` page. Click the avatar / user menu top-right.
  - **PASS:** user menu opens with profile/account/sign-out; no raw UUID shown for the user.
- [ ] **1.4 — Site switcher.** Route: topbar. Open the site switcher (site crumb).
  - **PASS:** lists real site **names** (not UUIDs); selecting a site reloads context without error.
- [ ] **1.5 — Real Supabase data on the dashboard.** Route: `/dashboard`.
  - **PASS:** KPI tiles / lists show real numbers from Supabase (or honest empty states), never obviously-fake placeholder rows.

---

## Section 2 — Settings (`/settings`)

- [ ] **2.1 — Users list, no raw UUIDs.** Route: `/settings/users`. Open the users table.
  - **PASS:** each row shows a human name + email + role name; no bare UUID columns.
- [ ] **2.2 — Create a user.** Route: `/settings/users`. Click **+ / New user**, fill email + role, submit.
  - **PASS:** user appears; assigning a **system role** is rejected with an explicit message (not an opaque "invalid_input").
- [ ] **2.3 — Roles editor.** Route: `/settings/roles`. Open a role, toggle a permission, save.
  - **PASS:** permission set persists; role list shows role **names**.
- [ ] **2.4 — Sites.** Route: `/settings/sites`. View / create a site.
  - **PASS:** sites listed by name; create succeeds.
- [ ] **2.5 — Lines.** Route: `/settings/infra/lines`. View lines.
  - **PASS:** each line shows its **site name** (not site UUID).
- [ ] **2.6 — Machines.** Route: `/settings/infra/machines` (also `/settings/machines`). View machines.
  - **PASS:** machines show line/site **names**.
- [ ] **2.7 — Locations / warehouses.** Route: `/settings/infra/locations` and `/settings/infra/warehouses`.
  - **PASS:** locations show warehouse/site names; no UUID leak.
- [ ] **2.8 — Labels editor.** Route: `/settings/labels`. Open a label template.
  - **PASS:** the size/format field shows a readable label **size name**, not a UUID (today's fix).
- [ ] **2.9 — Devices, no UUID + correct site/line.** Route: `/settings/devices`. View the device table.
  - **PASS:** the **Site / line** column shows site+line **names** (or the "No site" label) — never UUIDs (today's fix).
- [ ] **2.10 — GRN-QC flag banner now describes QA-hold behaviour.** Route: `/settings/quality`. Read the **Require GRN QC inspection** card.
  - **PASS:** the explanatory banner reads "When enabled, goods received against a PO are placed on a **QA hold** until a **quality inspection is recorded**." (the old "coming soon" lie is gone). Toggle requires `settings.flags.edit`; saving shows "Quality flag saved and audit log recorded."
- [ ] **2.11 — Import/Export jobs land here.** Route: `/settings/import-export`. (Cross-check after Test 5.7.)
  - **PASS:** an export job created from the PO list appears as a row with status **completed**.
  - **`expected: stub`** — the **import** side is feature-disabled (`IMPORT_FEATURE_DISABLED=true`); an import attempt is intentionally blocked.

---

## Section 3 — Technical (`/technical`)

- [ ] **3.1 — Item create (4-step wizard).** Route: `/technical/items`. Click **+ New item** → walk the 4 steps → finish.
  - **PASS:** new item appears in the list; the list reads real items from Supabase. Item detail at `/technical/items/[item_code]` opens without crashing.
- [ ] **3.2 — BOM lifecycle.** Route: `/technical/bom` → open one at `/technical/bom/[itemCode]`. Observe the status badge.
  - **PASS:** the status badge moves through **Draft → In review → Approved → Active** (and Superseded/Archived for old versions). A draft can be edited; an Active BOM is read-only / supersede-on-edit.
- [ ] **3.3 — BOM line edit/delete.** Route: `/technical/bom/[itemCode]`. On a Draft, edit a line qty / delete a row.
  - **PASS:** the row updates/removes; not allowed on an Active version.
- [ ] **3.4 — Factory spec approve.** Route: `/technical/factory-specs`. Open a release bundle → choose **Approve** → submit.
  - **PASS:** the bundle is approved end-to-end (no dead-end); emits `technical.factory_spec.approved`. Approve/reject radio is disabled while a blocker is present.
- [ ] **3.5 — Factory spec recall.** **`expected: stub`** (backend-only today). The `recall-spec.ts` action (`released_to_factory` → draft, blocked by RELEASED/IN_PROGRESS WOs) exists with perm `technical.factory_spec.recall`, but **no UI button is wired yet**.
  - **PASS (stub):** there is no "Recall" button visible on `/technical/factory-specs`. Do not expect to recall from the UI.
- [ ] **3.6 — Supplier attach + approve.** Route: `/technical/items/[item_code]`. Attach a supplier and approve it.
  - **PASS:** the item's readiness warnings clear once a supplier is attached+approved.

---

## Section 4 — NPD (`/pipeline`)

- [ ] **4.1 — Project pipeline.** Route: `/pipeline`. View the project list.
  - **PASS:** real projects from Supabase; **New project** at `/pipeline/new`.
- [ ] **4.2 — Project → FG.** Route: `/pipeline/new` then through the brief. Create a project that yields an FG product.
  - **PASS:** project created; an FG/product aggregate is reachable at `/fa/[productCode]`.
- [ ] **4.3 — Stage gate (G0–G4).** Route: `/pipeline/[projectId]/gate`. Open the gate screen, work the checklist, click **Advance** (and **Approve** where shown).
  - **PASS:** the AdvanceGate / GateApproval modals open; advancing requires the checklist + RBAC (`permission_denied` panel if you lack rights). Approval history timeline updates.
- [ ] **4.4 — FA read-only product detail.** Route: `/fa/[productCode]` (+ `/allergens`, `/risks`, `/docs`).
  - **PASS:** the 69-col main-table view renders real data; allergens/risks/docs subtabs open.

---

## Section 5 — Planning (`/planning`)

- [ ] **5.1 — Planning dashboard.** Route: `/planning`. View KPI strip + WO/PO/TO alert panels + upcoming schedule.
  - **PASS:** real open counts; PO/TO tiles show real numbers (no "module not live yet" placeholder).
  - **`expected: stub`** — header **Run sequencing** and **Trigger D365** stay **disabled** with a "Not available yet" title (no solver / D365 backend). That disabled state is correct.
- [ ] **5.2 — Create PO.** Route: `/planning/purchase-orders`. Create a PO with at least one line.
  - **PASS:** PO saved (draft state machine); detail at `/planning/purchase-orders/[id]`. PO line UoM is a dropdown (no free text).
- [ ] **5.3 — Edit a draft PO.** Route: `/planning/purchase-orders/[id]`. On a **draft** PO, edit header / add / edit a line (W11 R1 draft editability).
  - **PASS:** edits save on draft; editing is blocked once the PO is submitted/received.
- [ ] **5.4 — Create TO.** Route: `/planning/transfer-orders`. Create a transfer order; detail at `/transfer-orders/[id]`.
  - **PASS:** TO saved; draft is editable (W11 R1).
- [ ] **5.5 — Create WO.** Route: `/planning/work-orders/new` (or `/work-orders?new=1`). Create a work order; detail at `/work-orders/[id]`.
  - **PASS:** WO saved; draft editable (W11 R1); scheduled date is timezone-correct.
- [ ] **5.6 — MRP run → Create PO / WO from results (E6).** Route: `/planning/mrp`. Click **Run MRP** (use the persist toggle). When planned orders appear, tick rows → **Create PO** / **Create WO**.
  - **PASS:** Run MRP nets stock vs demand and persists `mrp_planned_orders`; the **Create PO** / **Create WO** buttons are enabled once rows are selected and call the canonical create flows (real PO/WO appear in their lists). Emits `planning.mrp.completed`. Buttons are disabled (greyed) with zero selection — that is correct. Needs `planning.mrp.run` / `planning.mrp.convert`.
- [ ] **5.7 — PO export (E-IO).** Route: `/planning/purchase-orders`. Apply a filter, click **Export to file**.
  - **PASS:** a CSV downloads matching the on-screen filtered list; an `import_export_jobs` row is logged with status **completed** (verify in Test 2.11). Needs `npd.planning.write`.
- [ ] **5.8 — Forecasts grid (E6).** Route: `/planning/forecasts`. Open the independent-demand forecasts grid.
  - **PASS:** the grid renders; entering a forecast feeds MRP (mig 302). Needs `planning.forecast.manage`.
  - **`expected: partial`** — this screen is newly added; if it shows an honest empty/skeleton state with no rows yet, that is acceptable.
- [ ] **5.9 — Suppliers.** Route: `/planning/suppliers` → `/suppliers/[id]`.
  - **PASS:** supplier list + detail render from Supabase.
- [ ] **5.10 — Schedule board.** Route: `/planning/schedule`. View the line schedule board.
  - **PASS:** WOs render on the board; V-PLAN-WO-CYCLE validation applies.

---

## Section 6 — Warehouse (`/warehouse`)

- [ ] **6.1 — Warehouse landing.** Route: `/warehouse`. View nav cards (inventory, GRNs, LPs, locations, movements, expiry, genealogy).
  - **PASS:** cards link to live screens.
- [ ] **6.2 — Receive a PO → GRN.** Primary receive path is the **scanner** (Section 9). On desktop: Route: `/warehouse/grns` shows GRNs; PO detail `/planning/purchase-orders/[id]` shows received progress + **Receive partial / Receive** transitions.
  - **PASS:** receiving a PO line creates a GRN and License Plate(s); the PO moves to **Partially received / Received**.
- [ ] **6.3 — GRN detail + cancel a line (W11 R3).** Route: `/warehouse/grns/[grnId]`. Open a GRN with an untouched line → per-line **Cancel receipt…** → give a reason.
  - **PASS:** the cancelled line is **struck through**, its actions hide, and received aggregates (PO detail, MRP, reporting) exclude it. Re-receiving reopens naturally. Blocked with an honest error (`lp_not_cancellable`) if the LP was already moved/consumed.
- [ ] **6.4 — License Plate detail + edit metadata (W11 R3).** Route: `/warehouse/license-plates/[lpId]`. Open an LP → **Edit metadata…** → change expiry / batch with a reason.
  - **PASS:** expiry + batch update with an audit reason; honest `lp_not_editable` error on a terminal LP. LP status labels render correctly including **destroyed** / **returned**.
- [ ] **6.5 — Put-away.** Primary path is scanner (Section 9). Desktop: Route: `/warehouse/movements` reflects the put-away move.
  - **PASS:** a put-away move shows in the movements log with from/to location **names**.
- [ ] **6.6 — FEFO / expiry.** Route: `/warehouse/expiry` (and `/warehouse/inventory`).
  - **PASS:** stock is ordered/flagged by First-Expiry-First-Out; near-expiry LPs are surfaced.
- [ ] **6.7 — Genealogy / traceability.** Route: `/warehouse/genealogy`.
  - **PASS:** parent/child LP genealogy renders (empty state if no consume/output yet — that is honest, not a bug).

---

## Section 7 — Production (`/production`)

- [ ] **7.1 — WO start → consume → output.** Route: `/production/wos` → `/production/wos/[id]`. Start the WO, consume an input LP, record an output.
  - **PASS:** WO advances RELEASED → IN_PROGRESS; consumption writes a ledger row; output produces an LP. Quality consume gate (T-064) is enforced.
- [ ] **7.2 — Record waste.** Route: `/production/wos/[id]` (or `/production/waste`). Log waste in **kg**.
  - **PASS:** waste recorded in kg; appears in the waste journal.
- [ ] **7.3 — Void an output (W11 R2, e-sign).** Route: `/production/wos/[id]`. On an output row → **Void output…** → enter e-sign password.
  - **PASS:** writes a **negative counter row** (storno); the LP goes to **destroyed** + zeroed; the original row is struck with a "Correction of #" badge. Guard matrix blocks the void if the LP is reserved/consumed/has genealogy children (`lp_not_voidable`). A wrong password makes **no** mutation (`esign_failed`).
- [ ] **7.4 — Void a waste entry (W11 R2, no e-sign).** Route: `/production/wos/[id]`. On a waste row → **Void entry…** → reason.
  - **PASS:** counter row nets the waste to zero; event counts exclude counters, sums stay net.
- [ ] **7.5 — Reverse a consumption (W11 R3, e-sign).** Route: `/production/wos/[id]`. On a consumed-input row → **Reverse…** → reason + e-sign password.
  - **PASS:** negative counter ledger row; `consumed_qty` decrements; LP restored (consumed→available only when QA-released, else →received). On a **closed** WO a supervisor warning shows. Blocked with `lp_not_restorable` if the LP was shipped/merged/destroyed; `already_corrected` on a second attempt.
- [ ] **7.6 — Disabled buttons now show a tooltip (today's fix).** Route: `/production/wos/[id]`. Hover any **disabled** action (e.g. a deferred "Scan LP" / "Log downtime", or an incomplete-form submit).
  - **PASS:** hovering a disabled button shows a `title` tooltip explaining why (e.g. "Complete all required fields to continue." / a deferred-flow note) — not a silent dead button. (15 disabled buttons got tooltips in this pass.)
- [ ] **7.7 — Downtime / changeover / shifts.** Route: `/production/downtime`, `/production/changeovers`, `/production/shifts`.
  - **PASS:** each screen renders real data; B-2 dual-sign changeover requires two signatures.

---

## Section 8 — Quality (`/quality`)

- [ ] **8.1 — Quality landing nav.** Route: `/quality`. View cards: Holds (live), NCRs, Inspections, Specifications, **CCP Monitoring** (E3).
  - **PASS:** the CCP Monitoring card is present and links to `/quality/ccp-monitoring`.
- [ ] **8.2 — Holds + consume gate.** Route: `/quality/holds` → `/quality/holds/[holdId]`. Open a hold, release it (e-sign).
  - **PASS:** held stock cannot be consumed in production (T-064); release lifts the block.
- [ ] **8.3 — NCR workflow.** Route: `/quality/ncrs` → `/quality/ncrs/[ncrId]`. Create / progress an NCR.
  - **PASS:** NCR opens and transitions; an out-of-limit CCP reading auto-raises one (see 8.6).
- [ ] **8.4 — Specifications.** Route: `/quality/specifications` → `/quality/specifications/[specId]`.
  - **PASS:** spec list + detail render; spec wizard works.
- [ ] **8.5 — Inspections.** Route: `/quality/inspections` → `/quality/inspections/[inspectionId]`. Record an inspection result.
  - **PASS:** inspection records and links to its source (e.g. a GRN under the QA-hold flag from Test 2.10).
- [ ] **8.6 — CCP monitoring record-reading (E3).** Route: `/quality/ccp-monitoring`. View the CCP board (latest reading + IN/OUT-of-limit badge per CCP) → click **+ Record reading** → enter a value.
  - **PASS:** the reading saves and the board refreshes; an **out-of-limit** value shows an OUT badge and surfaces an auto-NCR inline. Recording is gated by `quality.ccp.deviation_override`. If no CCPs are configured, the board shows an empty CTA to HACCP setup (honest empty state).
  - **`expected: partial`** — the filter bar / timeline chart / full readings table from the prototype are a documented deferral; only the board + record modal exist today.

---

## Section 9 — Scanner (`/scanner`)

Best tested on a **real phone** against the live URL. The scanner runs in its own chrome-less device shell.

- [ ] **9.1 — Full-bleed, NO fake phone status bar (today's de-mock).** On a **real phone**, open `/scanner/login`.
  - **PASS:** the app is **full-bleed** (fills 100% width/height + safe-area top) with **no fake OS status bar** — no fake clock `09:41`, no fake 📶/🔋 glyphs, no fake notch. (On a desktop browser you instead see a phone-sized preview frame with a **real** live clock + a real online/offline dot — that preview is intentional and correct on desktop.)
- [ ] **9.2 — PIN login.** Route: `/scanner/login`. Enter your PIN.
  - **PASS:** logs in. If it fails, re-set the PIN at desktop `/account/pin` first (the PIN may have been reset by an E2E run).
- [ ] **9.3 — Site / line pick.** Route: `/scanner/login/site`. Pick a site (and line where prompted).
  - **PASS:** site/line shown by **name**; context persists into the home screen.
- [ ] **9.4 — Home tiles.** Route: `/scanner/home`. View the tile board.
  - **PASS:** Production tiles (Work Orders, Consume, Output, Pick), Warehouse tiles (Receive PO, Put-away, Move), Quality tiles (QC, LP Inquiry). Any not-yet-built tile is **disabled with "Coming soon"** (no fake link) — that is honest.
- [ ] **9.5 — WO consume.** Route: `/scanner/wos` → `/scanner/wos/[woId]/consume`. Scan/enter an LP and consume.
  - **PASS:** consumption posts (real data, no mock); the ledger updates so genealogy works downstream.
- [ ] **9.6 — WO output.** Route: `/scanner/wos/[woId]/output`. Record an output (catch-weight where applicable).
  - **PASS:** output LP created.
- [ ] **9.7 — Receive PO.** Route: `/scanner/receive-po` → `/scanner/receive-po/[poId]/[lineId]`. Receive against a PO line.
  - **PASS:** GRN + LP created; **no 500** (the earlier `FOR UPDATE` + `GROUP BY` crash is fixed). With the GRN-QC flag ON (Test 2.10), received stock is placed on QA hold.
- [ ] **9.8 — Put-away.** Route: `/scanner/putaway`. Scan an LP → accept the suggested location.
  - **PASS:** LP moves to the put-away location; suggestion comes from the real put-away API.
- [ ] **9.9 — Move LP.** Route: `/scanner/move`. Move an LP between locations.
  - **PASS:** move posts; movement log reflects it.
- [ ] **9.10 — Pick.** Route: `/scanner/pick`. Pick LPs for a WO/order.
  - **PASS:** pick posts against the real pick API.
- [ ] **9.11 — LP info / inquiry.** Route: `/scanner/lp`. Scan/enter an LP code.
  - **PASS:** shows real LP details (item, qty, location, status) — not mock data.
- [ ] **9.12 — Scanner QC.** Route: `/scanner/qa`. Record a QC inspection.
  - **PASS:** inspection posts via the real `/api/quality/scanner/inspect` endpoint.

---

## Section 10 — Other module landings (status check)

- [ ] **10.1 — Finance.** Route: `/finance`. **PASS:** renders WO actual-costing / valuation views with real data + finance RBAC.
- [ ] **10.2 — OEE.** Route: `/oee`. **`expected: stub`** — honest ModuleStubNotice; 15-oee is read-only and largely not built. PASS = the honest stub notice shows, no crash.
- [ ] **10.3 — Maintenance.** Route: `/maintenance`. **`expected: stub`** — MWO start exists but the landing is a stub notice. PASS = honest notice / partial screen, no crash.
- [ ] **10.4 — Reporting.** Route: `/reporting`. **`expected: stub`** — honest ModuleStubNotice. PASS = honest notice, no crash.
- [ ] **10.5 — Scheduler.** Route: `/scheduler`. **`expected: stub`** — honest ModuleStubNotice. PASS = honest notice, no crash. (The real schedule board lives at `/planning/schedule`.)
- [ ] **10.6 — Multi-Site.** Route: `/multi-site`. **`expected: stub`** — honest ModuleStubNotice. PASS = honest notice + working site picker, no crash.
- [ ] **10.7 — Shipping.** Route: `/shipping`. **`expected: partial`** — SO + allocation backend exists but the nav landing is thin; some SO actions can throw `PermissionDenied` (latent bug O-01). PASS = the page loads; note any uncaught error.

---

## Section 11 — The golden E2E walk (one scripted scenario)

This is the **Definition of Done** click-through: a user logs in and drives real Supabase data from supplier to trace. Do it as one continuous run. (There is no `docs/guide/01` companion yet; this section is self-contained.)

1. [ ] **Login** → `/(auth)/login` with `admin@monopilot.test` / `Admin2026!!!` → land on `/dashboard`.
2. [ ] **Supplier** → `/settings/partners` (or `/planning/suppliers`) — confirm/create a supplier.
3. [ ] **Item** → `/technical/items` → **+ New item** → create a raw material (RM) and a finished good (FG).
4. [ ] **Supplier on item** → `/technical/items/[item_code]` → attach + approve the supplier (readiness warnings clear).
5. [ ] **BOM** → `/technical/bom/[itemCode]` (the FG) → build a BOM (FG consumes the RM) → advance Draft → Approved → **Active**.
6. [ ] **Factory spec** → `/technical/factory-specs` → approve the release bundle for the FG (`technical.factory_spec.approved`).
7. [ ] **PO** → `/planning/purchase-orders` → create a PO for the RM from the supplier → submit.
8. [ ] **Receive** → scanner `/scanner/receive-po/[poId]/[lineId]` (or desktop GRN) → receive the RM → GRN + LP created (QA hold if Test 2.10 flag is on).
9. [ ] **Put-away** → `/scanner/putaway` → store the RM LP.
10. [ ] **WO** → `/planning/work-orders/new` → create a WO to make the FG from the BOM → release.
11. [ ] **Consume** → `/scanner/wos/[woId]/consume` (or desktop `/production/wos/[id]`) → consume the RM LP (passes T-064 gate).
12. [ ] **Output** → `/scanner/wos/[woId]/output` → produce the FG LP.
13. [ ] **QA** → `/quality/holds` / `/quality/inspections` → release/inspect the FG so it is sellable.
14. [ ] **Trace** → `/warehouse/genealogy` (or `/technical/traceability`) → confirm the FG LP traces back through consumption to the received RM LP and the PO.

- **PASS:** every step completes against real Supabase data with **zero hard breaks** (the chain was verified end-to-end on 2026-06-12). Note any step that 500s or dead-ends.

---

## Section 12 — Negative / edge tests

- [ ] **12.1 — Permission 403 (RBAC).** Log in (or impersonate) as a user **without** `planning.mrp.run`. Route: `/planning/mrp` → **Run MRP**.
  - **PASS:** a permission-denied panel/`forbidden` result shows — **not** a 500 and **not** a silent success.
- [ ] **12.2 — CCP record without override.** As a user without `quality.ccp.deviation_override`, Route: `/quality/ccp-monitoring` → **+ Record reading**.
  - **PASS:** the action is refused server-side (denied panel), not client-trusted.
- [ ] **12.3 — Gate block: consume held stock.** Put an LP on hold (`/quality/holds`) then try to consume it in production (`/production/wos/[id]` or scanner consume).
  - **PASS:** the consume is blocked by the T-064 quality gate with a clear message.
- [ ] **12.4 — Gate block: edit a non-draft order.** Route: `/planning/purchase-orders/[id]` on a **submitted/received** PO → try to edit a line.
  - **PASS:** editing is disabled/blocked (W11 R1 only allows draft edits).
- [ ] **12.5 — Reversibility guard: void a referenced LP.** Route: `/production/wos/[id]` → **Void output…** on an output LP that is reserved/consumed/has genealogy children.
  - **PASS:** blocked with `lp_not_voidable` — no mutation.
- [ ] **12.6 — Reversibility guard: reverse a shipped/merged LP.** Route: `/production/wos/[id]` → **Reverse…** a consumption whose LP was shipped/merged/destroyed.
  - **PASS:** blocked with `lp_not_restorable`.
- [ ] **12.7 — Double-correction guard.** Repeat a void/reverse on an already-corrected row.
  - **PASS:** `already_corrected` (the unique counter-entry index, 23505) — exactly one counter row ever exists.
- [ ] **12.8 — Wrong e-sign password.** On any e-sign action (void output / reverse consumption / hold release), enter a wrong password.
  - **PASS:** `esign_failed` with **no** data mutation (the transaction rolls back).
- [ ] **12.9 — GRN cancel guard.** Route: `/warehouse/grns/[grnId]` → **Cancel receipt…** on a line whose LP was already moved/consumed.
  - **PASS:** blocked with `lp_not_cancellable`; only a fully-untouched line cancels.
- [ ] **12.10 — Import is intentionally disabled.** Route: `/settings/import-export` → attempt an import.
  - **PASS (stub):** the import is blocked (`IMPORT_FEATURE_DISABLED=true`). This is a **known dead-end**, not a bug.

---

## Known stubs / dead-ends (do not file as bugs)

- **LP "Print label"** — still "coming soon" (needs print_jobs mig 302). `expected: stub`.
- **Import side of import/export** — disabled by flag. `expected: stub`.
- **Factory-spec Recall + TO reverse-receive** — backend actions exist, **no UI buttons** yet. `expected: stub`.
- **OEE / Reporting / Scheduler / Multi-Site** landings — honest ModuleStubNotice. `expected: stub`.
- **Maintenance / Shipping** — partial; landings thin, some shipping SO actions can throw `PermissionDenied` (O-01). `expected: partial`.
- **Planning "Run sequencing" / "Trigger D365"** — disabled with "Not available yet". `expected: stub`.
- **CCP filter bar / timeline chart / full readings table** — deferred; board + record modal only. `expected: partial`.
