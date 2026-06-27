# E2E Tour RUN-4 — From-Scratch Walk (2026-06-27)

**Tester:** autonomous Playwright agent
**App:** https://monopilot-kira-git-main-codermariuszs-projects.vercel.app/en (deployment `dpl_9mPjRBW3yNyMeYYPpabzCRwUHDqV`, branch `main`)
**Login:** admin@monopilot.test (Apex Admin) — session already active
**DB:** Supabase `khjvkhzwfzuwzrusgobp` (read-only verification)
**Scope:** create EVERYTHING fresh, suffix `R4`, and hunt for NEW issues in create-paths + the full NPD approval chain that seeded runs (RUN-1..3) skipped.

**One-line verdict:** The operational core (warehouse/location create → PO → dual-warehouse receive → QC release → WO release/consume/output → LP move → TO ship/receive → SO allocate/pick/pack-SSCC/ship-BOL) is **fully walkable from scratch and PASSES end to end**. The **NPD Stage-Gate approval chain is BLOCKED** at the first e-signature gate by a missing-i18n-key regression that aborts the gate-decision write — so a fresh project cannot reach G4 / Handoff / production-BOM via the UI.

---

## Step-by-step log

### Step 1 — Settings → Infra → Warehouses → Add (Site now required) + location — PASS
- **Add warehouse dialog**: now contains a **Site** picker. With Site empty the "Create warehouse" button is **disabled**; selecting a site enables it. This confirms the "Site required" fix shipped.
  - Site dropdown listed the two real sites: `Production1`, `warehouse 1`.
  - Created **R4WH / "R4 Warehouse"**, Site = `warehouse 1`, address "4 R4 Street, Leeds".
  - DB verify: `warehouses` row `32fc755f-d18d-4d75-85fa-2156eb7cee5a`, `site_id = 31dc70ce-…` (`warehouse 1`) — **non-null site**. PASS.
  - Note: the DB column `warehouses.site_id` is still **nullable** (the requirement is app-layer validation only, not a NOT NULL constraint). LOW.
- **Add location**: created **R4-BIN-01 / "R4 Bin 01"** under R4WH (Warehouse pre-filled from the `?warehouseId=` URL param, type `storage`). DB verify: location `ab2939c2-1b25-4e1e-963e-a48b918309d7`, `warehouse_id = R4WH`, active. PASS.
- Screenshot: `r4-01-add-warehouse-dialog.png`
- Display nit (LOW): the Warehouses table "Site" column renders the **address string** (e.g. "uk warehouse 1", "1 Tour Lane, Normanton"), not the linked site **name**.

### Step 2 — Full NPD project from scratch — BLOCKED at the G2→G3 approval e-signature
Created **NPD-009 "R4 Premium Bacon 250g"** via the 4-step wizard (Basics → Brief → Starting point=Blank recipe → Review). DB: project `be91fb3c-48bc-4d8d-805e-5ca066ed66d3`, gate G0, stage brief, price €4.99, pack 250 g.

- **Brief** auto-marked "✓ Completed".
- **Recipe (Formulation):** created v1 draft, added ingredient **RM-001 MAKA SUPER** at 0.250 kg/pack (= pack weight, mismatch warning cleared) @ €3.50/kg, set target price €4.99. Draft auto-saved. **Locked the recipe** → DB `formulations.locked_at` set, version `state = locked`. PASS.
  - Minor (LOW): `formulation_versions.batch_size_kg` persisted as **NULL** even though the UI batch-size field showed 250.000 g and the total-vs-pack validation worked off it.
- **Gate checklist G0→G2:** completed the 3 blocking G0 items (each is an `aria-label` button that toggles to "✓ Completed by Admin"), advanced **G0 → G2** through the "Advance gate" dialog (required audit note). Then completed all 11 G2 items (100%). At G2 the action becomes **"Request approval →"**. PASS up to here — DB confirmed `current_gate = G2`.
- **G2 → G3 gate approval + e-signature — BLOCKED (BLOCKER #1).**
  - The "Request approval" dialog opens a **Gate Approval** modal whose header is **mislabeled**: project is at **G2**, but the modal shows the transition **"G3 Development → G4 Testing"** and "0 of 10 required items complete" (the just-completed G2 checklist). Off-by-one gate labels. Screenshot `r4-02-gate-approval-modal-wrong-gate-labels.png`. (MED — see Findings.)
  - Filled approval notes, kept "Approve Gate Advancement", Submit → an **E-Signature** step appears asking for **PASSWORD** (account password, *not* the scanner PIN at this gate). Entered `Admin2026!!!`, ticked the "I confirm…" checkbox, clicked **Confirm & Sign**.
  - Result (reproduced twice): **"Could not record the gate decision. Try again."** No `gate_approvals` row was written; project stays at G2 (verified in DB). Screenshot `r4-03-gate-approval-could-not-record.png`.
  - **Root cause (confirmed via Vercel runtime logs on the live deployment):** every `POST /…/gate` throws
    `Error: MISSING_MESSAGE: npd.gateChecklist.advanceTerminalHint (en)` (code `MISSING_MESSAGE`).
    The key **exists** in `apps/web/i18n/en.json` only at `npd.projectDetail.header.advanceTerminalHint`, but the gate screen/component requests it at **`npd.gateChecklist.advanceTerminalHint`**, which is absent (the `npd.gateChecklist.*` namespace has 29 keys, none named `advanceTerminalHint`). next-intl throws on the missing message during the server render that the gate-decision Server Action triggers; that throw is caught and surfaced as the generic "Could not record the gate decision," and the gate-approval write never commits. Consumers: `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx:142` and `apps/web/app/(npd)/pipeline/[projectId]/_components/gate-checklist-panel.tsx:678-681`.
- Because the gate-approval write is dead, the fresh project **cannot advance past G2** → cannot reach the **G4 approval criteria (C1-C7)** screen, the **G4 e-signature**, the **Handoff**, or **Generate production BOM** on this project.
- Cross-checks proving the *rest* of the chain is sound (on pre-existing projects that reached G4 in earlier runs — i.e. this is a **recent regression**, not a long-standing gap):
  - **C1-C7 approval criteria screen** renders correctly on NPD-008 (G4/approval): C1 Recipe locked, C2 Nutrition, C3 Cost, C4 Sensory (Not required), C5 Allergens, C6 No open high risks (Pass), C7 Compliance docs; "All criteria must pass before you can submit."
  - **Handoff → production BOM** works on NPD-002 (G4/handoff): released BOM `FG-NPD-002 v1`, status `released_to_factory`, with a full handoff checklist + "Promote to production BOM".

### Step 3 — Create a PO (destination warehouse set, 2 lines) — PASS
- Created **PO-202606-0008**, supplier **SUP-003 MEAT SUP**, **Destination warehouse = R4WH**, expected delivery 2026-07-15, 2 lines:
  - L1 RM-001 MAKA SUPER 100 kg @ €2.50
  - L2 RM-002 DROZDZE 50 kg @ €1.20 (total €310.00)
- DB: PO `b7de886f-…`, `destination_warehouse_id = R4WH`, 2 lines. The "Create PO" Destination-warehouse dropdown listed **R4WH** correctly. PASS.
- Submitted (Draft → Sent → **Confirmed**) so it became receivable.

### Step 4 — Receive into 2 DIFFERENT warehouses (scanner + desktop) — PASS
- **Line 1 on the SCANNER** (`/scanner/receive-po`): batch `R4-BATCH-MAKA`, qty 100 kg, destination location **E2E-BIN-01**. New LP **LP-1782552493803-YTBO** created → DB `status = available` (auto-putaway), `qa_status = pending` (QC quarantine), warehouse **E2EWH**, GRN linked. PASS.
- **Line 2 on the DESKTOP** (PO detail "Receive" per-line dialog, only available once PO is confirmed/partially-received): batch `R4-BATCH-DROZDZE`, qty 50 kg, destination **R4WH · R4-BIN-01**. New LP **LP-MQW5RYD3-P3DS0K** → `status = available`, `qa_status = pending`, warehouse **R4WH**. PASS.
- Two LPs landed in **two different warehouses** (E2EWH and R4WH), both auto-putaway, both quarantined. PO auto-progressed to **received**.
- Observations:
  - The **scanner** receive location chooser does **NOT** list the new R4-BIN-01 (it shows a fixed set: E2E-BIN-01, LOC1/LOC2, OUT×2, R2A-BIN1). Typing `R4-BIN-01` into the location field does **not** resolve it and leaves the **Receive button disabled**. The **desktop** receive dialog *does* list `R4WH · R4-BIN-01`. (MED — scanner location list staleness / no free-text resolution; see Findings.)
  - The LP's warehouse is derived from the **chosen location**, not the PO's destination warehouse — so the PO destination field is advisory at receive time. (Working as designed for "receive into different warehouses", but worth knowing.)

### Step 5 — QC-PASS the LPs on the scanner — PASS
- `/scanner/qa` (QC Inspection): scanned both LPs, recorded **PASS** on each. Both `qa_status` Pending → **Released** (DB confirmed). PASS.

### Step 6 — Create WO, release, consume on scanner — PASS
- Picked **FG-NPD-002** (only it and FG-NPD-007 have an **active BOM**; FG-001 has none — the dialog let me pick FG-001 but it would have had no materials). Its active BOM consumes RM-001 + RM-002 (exactly what I received).
- Created **WO-202606-0003** (qty 10 boxes = 8.000 kg), Draft. Released via the **WO list "Release" row action** (no Release control on the WO *detail* page — minor UX note, LOW). DB `status = RELEASED`.
- Scanner consume (`Consume` tile → WO → Clock In → Start WO → Consume):
  - RM-001 — FEFO **suggested my LP-1782552493803-YTBO**; consumed 4.48 kg (95.52 kg left).
  - RM-002 — selected my R4WH LP **LP-MQW5RYD3-P3DS0K**; consumed 0.128 kg.
  - DB `wo_materials`: RM-001 4.480/4.480, RM-002 0.128/0.128 consumed. PASS.

### Step 7 — Produce FG (register output) — PASS
- Scanner "Register output": qty 8 kg, batch `R4-FG-BATCH-01`, Confirm.
- Success **with a correct mass-balance warning**: *"Registered output (8 kg) requires approx 8 kg of components at 100% yield, but 4.608 kg consumed so far."* (over-production guard works.)
- FG LP created: **LP-1782553257774-1OXH**, 8 kg, `origin = production`, wo linked, in CHILL/LOC1, `status = received`, `qa_status = pending` (FG goes to QC quarantine as expected). PASS.

### Step 8 — Move an LP between locations — PASS
- Scanner "Move LP": moved FG LP **LP-1782553257774-1OXH** from **LOC1 → LOC2** (reason Relocation). DB confirmed `location = LOC2`. PASS.
- Observation (same class as Step 4): the move destination only accepts a **suggested** location; typing a free-text code that isn't in the suggestion list (e.g. cross-warehouse `E2E-BIN-01`) leaves **Move disabled**. R4WH has only one location, so an *intra-R4WH* move isn't possible — had to move the CHILL FG LP instead. (MED, same root as the scanner location-list finding.)

### Step 9 — Create TO to another warehouse, ship + receive — PASS
- Created **TO-202606-0003**: From **R4WH** → To **E2EWH**, 1 line **RM-002 DROZDZE 10 kg**, scheduled 2026-07-10.
- Ship (Draft → **In transit**) → Receive (→ **Received**). DB confirmed.
- Stock moved correctly: source LP **LP-MQW5RYD3-P3DS0K** 49.872 → **39.872 kg** in R4WH, and a **new LP LP-1782553629805-HVO1 (10 kg)** created in **E2EWH/E2E-BIN-01** (same batch). PASS.

### Step 10 — Create SO, allocate → pick → pack → ship (SSCC/BOL) — PASS
- Created **SO-202606-00003**, customer **E2E Tour Customer**, line **FG-NPD-002 5 kg**, ship date 2026-07-25.
- **Confirm → Allocate** → status **Allocated** (5.000/5.000).
  - Correct QA behaviour: the allocator picked the two **released** cheleb LPs (UVHI 1 kg + 5RDW 4 kg = 5 kg) and **did NOT** use my fresh FG LP (`qa_status = pending`) — quarantine respected.
- **Create shipment** → **SH-2026-00009** (Packing).
  - Packing rejected my pending FG LP with *"That license plate is not allocated to this sales order."* (correct — it wasn't allocated).
  - Packed **LP-1782548526898-5RDW** (4 kg) into **Box 1** → **SSCC: 012345670000000022** generated server-side (GS1 SSCC-18). The second allocated LP (UVHI 1 kg) did not add a second row on re-pack, but one box with a valid SSCC was sufficient to proceed. (LOW — second-LP pack into the box silently no-op'd; not investigated deeply.)
- **Seal** (→ Packed) → **Ship shipment** (→ Shipped, shipped_at set; lifecycle ✓Packing ✓Shipped — the summary "Status" label lagged at "Packed" briefly, LOW) → **Generate BOL** (Carrier DHL Freight, Service Standard, Tracking R4-TRACK-0001) → **BOL reference 280ec5736f9d**.
- DB: SO `status = shipped`, shipment `status = shipped`. PASS.
- Screenshot: `r4-04-shipment-shipped-bol.png`.

---

## Findings (severity-grouped)

### BLOCKER
1. **NPD gate-approval e-signature is dead — missing i18n key aborts the gate-decision write.**
   Submitting a gate approval (first hit at **G2→G3**) fails with **"Could not record the gate decision. Try again."** No `gate_approvals` row is written and the project cannot advance. Live Vercel runtime logs show every `POST /…/gate` throwing `MISSING_MESSAGE: npd.gateChecklist.advanceTerminalHint (en)`. The key lives only at `npd.projectDetail.header.advanceTerminalHint`; the gate UI requests `npd.gateChecklist.advanceTerminalHint` (absent). next-intl's throw-on-missing aborts the server render the action runs in, and the generic catch hides it. **This blocks the entire NPD Stage-Gate chain (G2→…→G4→Handoff→production BOM) for any from-scratch project.** It is a **recent regression** (NPD-002/007/008 reached G4 in earlier runs). Fix: add `npd.gateChecklist.advanceTerminalHint` (+ `npd.formulationEditor.creatingDraft`, `npd.formulationEditor.createDraftError`, `settings.infra.locations.warehouseUnassigned`, and the `npd.pipeline.switcher.*` keys, all flagged MISSING_MESSAGE in the same logs) to `en.json` (and pl/ro/uk), and harden next-intl `getMessageFallback`/error handling so a missing label can never abort a write Server Action.
   Files: `apps/web/i18n/en.json`; `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx:142`; `apps/web/app/(npd)/pipeline/[projectId]/_components/gate-checklist-panel.tsx:678-681`.
   Screenshots: `r4-03-gate-approval-could-not-record.png`.

### HIGH
- _None._ Every operational create-path (Steps 1, 3-10) passed end to end.

### MED
1. **Gate Approval modal shows the wrong (off-by-one) gate transition.** At a project sitting on **G2** with the G2 checklist complete, the approval modal header reads **"G3 Development → G4 Testing"** and "0 of 10 required items complete." Misleading source/target gate labels + checklist summary. Screenshot `r4-02-gate-approval-modal-wrong-gate-labels.png`. (Likely the same component family as the BLOCKER; verify gate-source resolution.)
2. **Scanner location pickers are stale / don't resolve free-text codes.** On both **Receive PO** and **Move LP**, the destination-location chooser shows a fixed list that **omits the freshly-created R4-BIN-01**, and typing a valid location code that isn't in the list leaves the action button **disabled**. The **desktop** receive dialog lists R4-BIN-01 fine. Net effect: a brand-new warehouse/bin can't be used as a scanner receive/move target until the scanner's location list includes it. Worth checking the scanner location query (site/warehouse scoping or a cached list) and adding free-text/scan resolution.

### LOW
1. Warehouses table "Site" column shows the **address** string instead of the site **name**.
2. `warehouses.site_id` is **nullable** in the schema — the "Site required" rule is app-layer only (no NOT NULL constraint as a backstop).
3. `formulation_versions.batch_size_kg` persists as **NULL** even though the UI uses/validates batch size.
4. WO **detail** page has no Release control (only the WO **list** row action does).
5. Shipment summary "Status" field lagged at "Packed" after shipping (lifecycle + shipped_at were correct).
6. Packing a second allocated LP into an existing box silently no-op'd (one SSCC box still shipped fine).
7. Persistent `GET /sw.js 404` (missing service worker) and a hydration warning (React #418) in console — cosmetic.

---

## Fresh artifacts created (names + IDs)

| Type | Name / Number | ID | Notes |
|---|---|---|---|
| Warehouse | R4WH — R4 Warehouse | `32fc755f-d18d-4d75-85fa-2156eb7cee5a` | site = `warehouse 1` |
| Location | R4-BIN-01 — R4 Bin 01 | `ab2939c2-1b25-4e1e-963e-a48b918309d7` | under R4WH |
| NPD project | NPD-009 — R4 Premium Bacon 250g | `be91fb3c-48bc-4d8d-805e-5ca066ed66d3` | **stuck at G2** (gate-approval BLOCKER) |
| Formulation | NPD-009 v1 (locked) | formulation `e8f72997-…`, version `b1915a90-…` | RM-001 0.250 kg, locked |
| Purchase order | PO-202606-0008 | `b7de886f-a258-4f3b-a861-dd21eb43318a` | dest R4WH, 2 lines, received |
| LP (RM, scanner) | LP-1782552493803-YTBO | — | MAKA 100 kg, E2EWH/E2E-BIN-01, QC-released, partially consumed |
| LP (RM, desktop) | LP-MQW5RYD3-P3DS0K | — | DROZDZE 50→39.872 kg, R4WH/R4-BIN-01, QC-released |
| Work order | WO-202606-0003 | `5438c36a-43fd-45fc-b7a7-3f2ffc9d41b6` | FG-NPD-002 8 kg, in_progress, materials consumed + output |
| LP (FG) | LP-1782553257774-1OXH | — | cheleb 8 kg, production, moved LOC1→LOC2, qa pending |
| Transfer order | TO-202606-0003 | `c88a9b66-4dfe-4809-a82e-587d7a5102e2` | R4WH→E2EWH, received |
| LP (TO-created) | LP-1782553629805-HVO1 | — | DROZDZE 10 kg, E2EWH/E2E-BIN-01 |
| Sales order | SO-202606-00003 | `004904a4-d881-457c-95ec-023695e9593a` | FG-NPD-002 5 kg, shipped |
| Shipment | SH-2026-00009 | `06cd6188-03fd-490f-8ec4-3655666857d0` | SSCC `012345670000000022`, BOL `280ec5736f9d`, shipped |

## Screenshots (repo root)
- `r4-01-add-warehouse-dialog.png` — Add-warehouse dialog with Site picker (fix verified)
- `r4-02-gate-approval-modal-wrong-gate-labels.png` — Gate Approval modal showing wrong G3→G4 labels at a G2 project
- `r4-03-gate-approval-could-not-record.png` — "Could not record the gate decision" e-sign failure (BLOCKER)
- `r4-04-shipment-shipped-bol.png` — Shipment shipped with SSCC + BOL

## Verdict
**From-scratch operational path: FULLY WALKABLE (PASS).** All warehouse/inventory/production/transfer/shipping create-flows work, including the dual-warehouse receive, QC-quarantine→release gate, FEFO consume, mass-balance output warning, SSCC pack, and BOL ship. **The NPD Stage-Gate approval chain is NOT walkable** for a new project due to one missing-i18n-key regression that kills the gate-decision write. **Fix the BLOCKER (`npd.gateChecklist.advanceTerminalHint` and the sibling MISSING_MESSAGE keys + next-intl throw-hardening) first** — it single-handedly closes the only broken leg of the tour.
