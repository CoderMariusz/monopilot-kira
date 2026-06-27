# E2E Tour — RUN-2 — 2026-06-27

**App:** https://monopilot-kira-git-main-codermariuszs-projects.vercel.app/en
**Login:** admin@monopilot.test
**Scanner PIN:** 246819
**Goal:** Full granular walk receive→available→consume→produce→TO-ship→SO-ship. Verify RUN-1 blockers fixed (auto-putaway, TO ship/receive, SO pick/pack/ship). Create NEW test data.

## Step-progress checklist
- [x] 1. Create a warehouse (note Site-picker gap) — DONE (R2WHA); Site-picker gap PERSISTS (MED)
- [x] 2. Create a location in it — DONE (R2A-BIN1)
- [~] 3. NPD: project → brief → recipe (lock) → pilot → allergens/nutrition/costing/docs → approval — DONE; Handoff Generate BOM **BLOCKED** (yield=0 constraint, HIGH); cannot set actual yield / Promote on fresh project. PIVOT to existing FG-NPD-002 for the chain.
- [x] 4. Create a PO (new Destination warehouse field + 2+ lines) → Submit → Confirm — DONE (PO-202606-0006, dest R2WHA, RM-001+RM-002, Confirmed). New Destination-warehouse field WORKS.
- [BLOCKED] 5. Receive on SCANNER: 2 lines into warehouse A — BLOCKER: "No receiving location for scanner site" (warehouses.site_id all NULL). Receive button disabled.
- [BLOCKED] 6. Receive 1 line on DESKTOP into warehouse B — no desktop receive form exists (scanner-only); MED.
- [x] 7. VERIFY received stock AVAILABLE — PARTIAL: existing GRN LP shows Available 100kg/Released (RUN-1 0-stock bug FIXED); but DB status='received' not 'available' (brief wording inaccurate).
- [~] 8. Register a WO — DONE (WO-202606-0002, Released).
- [~] 9. Scanner consume — consume action OK via Manual/no-LP; LP-pick BLOCKED (no LP visible, HIGH).
- [x] 10. Scanner produce + register FG output — DONE (16, batch, FG to stock; mass-balance guard fired).
- [x] 11. QC/release the FG — DONE (FG LP → Available/Released).
- [x] 12. Movements: move an LP — DONE (LOC1 → LOC2).
- [x] 13. TO create + SHIP + receive — DONE, RUN-1 BLOCKER FIXED (stock CHILL→PRODUCTION, available).
- [x] 14. SO create + confirm + allocate + pick + pack + SHIP — DONE, RUN-1 BLOCKER FIXED (shipped, SSCC-18, BOL).

## SUMMARY / VERDICT

**Stopped at:** all 14 steps attempted (none left untried). Two sub-paths could not be completed in-product and are reported as blockers; the rest completed.

**Does the FULL chain receive→available→consume→produce→TO-ship→SO-ship work end-to-end now?**
PARTIALLY. Broken into segments:
- receive→available: PARTIAL. New receive (scanner) is BLOCKED (no warehouse has a site). Existing released stock IS available/pickable in the UI (RUN-1 "stuck at 0" is fixed). But DB keeps receive at status='received'; status='available' only after a QC release.
- available→consume: scanner consume WORKS but only via "Manual / no LP" — LP-based consume is BLOCKED (no LP visible to the scanner site). LP traceability through consume is non-functional.
- produce→output: WORKS (FG LP created, mass-balance guard fires).
- QC release: WORKS (received→available).
- move LP: WORKS.
- **TO ship→receive: WORKS end-to-end — RUN-1 blocker FIXED.**
- **SO confirm→allocate→pick→pack→ship (+SSCC-18 + BOL): WORKS end-to-end — RUN-1 blocker FIXED.**

**Net:** the two RUN-1 headline blockers (TO ship, SO ship) are both FIXED. New blockers found are around **site→warehouse linkage** (warehouses.site_id all NULL) which breaks scanner receive + scanner LP-pick consume, plus an NPD **Generate-BOM yield=0** hard stop.

**Severity rollup:**
- BLOCKER: scanner Receive PO (no receiving location for scanner site — all warehouses.site_id NULL); scanner consume LP-pick ("No license plates available"). Root cause shared.
- HIGH: NPD Handoff "Generate production BOM" fails (yield_pct=0 violates bom_headers_yield_pct_check; no UI path to fix on a locked recipe); scanner LP-based consume non-functional (every consume falls back to no-LP).
- MED: Add-warehouse dialog has no Site picker (RUN-1 gap persists → the site_id=NULL root cause); no desktop receive form (scanner-only); "auto-putaway → status='available'" claim inaccurate (LPs stay status='received').
- LOW: untranslated i18n key `scanner.receivePo.destinationNoLocations`; output unit label "kg" vs WO "each"; shipped LP retains 1kg remainder yet status='shipped'; "Submit for approval" e-sign modal opens with ~2s delay/no feedback (looks like a no-op).

**Resume point:** Owner decisions/fixes needed before a clean RUN-3: (1) link warehouses to sites (add Site picker to Add-warehouse + backfill warehouses.site_id) so scanner receive + LP-pick consume work; (2) guard NPD Generate-BOM against yield_pct=0 (and/or block locking a recipe with yield 0). Then re-run steps 5,6,9-LP. Test data created this run: warehouse R2WHA + loc R2A-BIN1, NPD-007/FG-NPD-007, PO-202606-0006, WO-202606-0002, TO-202606-0002 (received), SO-202606-00002 (shipped, SH-2026-00008).

## Findings table
| step | action | status | severity | symptom + URL |
|------|--------|--------|----------|---------------|
| 1 | Open Settings > Warehouses, click + Add warehouse | OK | - | Dialog opened. /en/settings/infra/warehouses |
| 1 | Add warehouse dialog has only Code/Name/Address — NO Site picker | MISSING | MED | RUN-1 site-picker gap PERSISTS. New warehouse R2WHA created with Site column BLANK (existing E2EWH also blank). Cannot assign warehouse to a site from this dialog. /en/settings/infra/warehouses |
| 1 | Create warehouse R2WHA "RUN2 Warehouse A" | OK | - | "Warehouse created." toast; row added; id 0b11ab6e-061c-42cc-aef0-a961fa2ecf15. /en/settings/infra/warehouses |
| 2 | Open Locations scoped to R2WHA, + Add location, fill Code=R2A-BIN1 Name="Run2 A Bin 1" type=storage | OK | - | Location created, tree shows "R2A-BIN1 — Run2 A Bin 1", L1, Active, warehouse pre-selected in dialog. /en/settings/infra/locations?warehouseId=0b11ab6e-061c-42cc-aef0-a961fa2ecf15 |
| 3a | NPD New project wizard: Basics → Brief → Starting point (Blank) → Review → Create | OK | - | 4-step wizard worked. Project NPD-007 "R2 Premium Sausage 500g" created, id fe289ba5-9e95-4ddf-ae78-b068dca73d12. Redirected to brief. /en/pipeline/new |
| 3b | Brief page | OK | - | Brief shows "✓ Completed", all fields saved (name, category, launch date, price, pack 500g, claims, constraints, notes). 8-stage nav present. /en/pipeline/fe289ba5-.../brief |
| 3c | Recipe tab: Create draft (v1) | OK | - | v1 draft created, batch=500g. /en/pipeline/fe289ba5-.../formulation |
| 3d | Add ingredient → Pick item → RM-001 MAKA SUPER, qty 0.5kg, €2.50/kg | OK | - | Live recalc: total 0.500kg matches pack, cost €1.25, total cost €2.70/kg, composition 100%. Item picker (combobox) worked, options clickable. |
| 3e | Save draft | OK | - | Button → "Saved", "Saved" toast shown. |
| 3f | Lock recipe (confirm dialog) | OK | - | v1 → "v1 locked", inputs disabled, alert "This version is locked and cannot be edited". Nutrition computed (Energy 500kJ, Protein 3g, Carbs 70g over target). |
| 3g | Advance gates G0→G2→G3→G3·Trial (notes required each time) | OK | - | Gate modal works; allows advancing with incomplete checklist + audit note. FG auto-created at G3 (Open FG → /en/fa/FG-NPD-007). |
| 3h | Pilot tab: + Plan pilot run (date 2026-07-15, LINE01, batch 100kg, yield 95%, 4h) → Save | OK | - | Pilot scheduled. Material reservation shows MAKA SUPER short 0.5kg (no stock yet — informative, correct). /en/pipeline/fe289ba5-.../pilot |
| 3i | Approval gates page: 7 criteria (C1 recipe locked PASS, C2 nutrition, C3 cost, C5 allergens, C6 risks PASS, C7 docs) with Go-fix links; Submit disabled until all pass | OK | - | /en/pipeline/fe289ba5-.../approval |
| 3j | Nutrition stage: Compute NutriScore → recompute | OK | - | Table computed (Energy 500kJ, Carbs 70g, Protein 3g, all OK). NutriScore = B (passing). C2 satisfied. /en/pipeline/fe289ba5-.../nutrition |
| 3k | Costing stage: Compute costing | OK | - | Cost waterfall raw €2.50 → retail €3.12; Target scenario margin +20.0%. C3 satisfied. /en/pipeline/fe289ba5-.../costing |
| 3l | Allergens (FG cascade): accept declaration sign-off checkbox | OK | - | Auto-derived Soybeans (Present). Checkbox → "✓ Declaration accepted by Admin on 27/06/2026". C5 satisfied. /en/fa/FG-NPD-007/allergens |
| 3m | Compliance docs: + Upload (Spec, file PDF, expiry 2027-06-30) | OK | - | Doc "R2 Product Specification" uploaded, status ✓ Valid. C7 satisfied. File-upload chooser worked. /en/fa/FG-NPD-007/docs |
| 3n | Approval gates: all 6 criteria PASS (C4 not required) → Submit for approval | OK | LOW | First 2 clicks appeared to do nothing (chain stayed "Awaiting") — the e-sign modal opens with a ~2s delay; no spinner/feedback, so it looks like a no-op. /en/pipeline/fe289ba5-.../approval |
| 3o | Gate G4 advance to Handoff blocked until e-sign | OK | - | Correctly blocked: "Gate G4 e-signature approval is required before handoff — approve it on the Approval stage." (advance-gate-error). Good guardrail. |
| 3p | E-sign approval modal: password Admin2026!!! + notes → Confirm | OK | - | Chain → "✓ Approved by Admin · 2026-06-27 07:49:59". G4 gate now signed. /en/pipeline/fe289ba5-.../approval |
| 3q | Advance G4→Handoff (after e-sign) | OK | - | Handoff page now live; release gates: Project@G4 ✓, FG mapped ✓, Active shared BOM ✕ Not met, Factory spec ✕ Not met, No high risks ✓. /en/pipeline/fe289ba5-.../handoff |
| 3r | Handoff: click "Generate production BOM" (x2) | ERROR | HIGH | Reproducible: alert "Could not generate the production BOM. Try again." POST /handoff returns 200 but the server action returns an error result; Destination BOM stays empty (BOM code —, release status —). BLOCKS handoff chain (Generate BOM → set actual yield → Promote) for NEW project NPD-007/FG-NPD-007. /en/pipeline/fe289ba5-.../handoff |
| 3r-ROOT | DB root cause (Postgres logs) | ERROR | HIGH | Generate-BOM insert fails: `new row for relation "bom_headers" violates check constraint "bom_headers_yield_pct_check"` (CHECK yield_pct > 0 AND <= 100). The locked recipe's stored target_yield_pct = 0 (default), so generated BOM yield_pct=0 → rejected. Bug: handoff BOM-generate does NOT validate/clamp yield before insert and surfaces only a generic "Try again". |
| 3r-FIX-ATTEMPT | Set Expected yield % = 95 on recipe cost panel, retry Generate BOM | ERROR | HIGH | The cost-panel "Expected yield %" input is TRANSIENT/UI-only — NOT persisted to the recipe (Save draft is disabled on a locked recipe). DB confirms formulation_versions.target_yield_pct still = 0. Generate BOM still fails. No UI path to fix yield on a locked v1 with yield 0 → fresh NPD project is PERMANENTLY un-promotable. HARD BLOCKER for the NPD handoff sub-path on a brand-new project. |
| 3 | Set actual yield + Promote (RUN-2 verify item) | BLOCKED | HIGH | Cannot reach — Generate BOM never succeeds (yield=0 constraint). Could not verify the "yield-save now works" RUN-2 fix on a fresh project. PIVOT: use existing active products (RM-001, FG-NPD-002) for the receive→consume→produce→ship chain. |
| 4a | Create PO: + Create PO, supplier MEAT SUP, **Destination warehouse = R2WHA (RUN2 Warehouse A)** | OK | - | NEW Destination-warehouse field present + works; persisted on PO detail ("Destination warehouse: RUN2 Warehouse A"). /en/planning/purchase-orders |
| 4b | Add 2 lines: RM-001 100kg @€2.50, RM-002 50kg @€1.20 → Create PO | OK | - | PO-202606-0006 created (Draft), 2 lines, total 310 EUR. Item picker + line editor worked. |
| 4c | Submit → confirm dialog → Sent | OK | - | Native confirm "Change status to Sent?" → accepted. Status → Sent. |
| 4d | Confirm → confirm dialog → Confirmed | OK | - | Status → Confirmed. Receipt progress 0/2. PO ready to receive into R2WHA. |
| 5a | Scanner Receive PO: PO-202606-0006 appears in list, open it, both lines shown | OK | - | /en/scanner/receive-po/d8662b64-... |
| 5b | Open MAKA SUPER line to receive | ERROR | LOW | Untranslated i18n key shown raw: "scanner.receivePo.destinationNoLocations" (next to a fallback EN sentence). i18n gap. |
| 5c | Receive into R2WHA blocked | ERROR | BLOCKER | Destination-location validator: "No receiving location is configured for this scanner site." Receive button DISABLED even with batch + location R2A-BIN1 + qty 100 entered. /en/scanner/receive-po/... |
| 5c-ROOT | DB root cause (warehouses.site_id) | ERROR | BLOCKER | `select code,site_id from warehouses` → ALL four warehouses (CHILL, PRODUCTION, E2EWH, R2WHA) have **site_id = NULL**. Locations have no site_id either (bound only to warehouse_id). The scanner resolves receiving locations by SITE, finds none for any site → scanner-receive is broken for EVERY warehouse, not just my new one. The Sites&Lines "uk warehouse 1" column on the warehouse list is a display artifact, not warehouses.site_id. |
| 5c-WORKAROUND | Set topbar Site picker = "warehouse 1", retry scanner receive | ERROR | BLOCKER | Same error persists. Choosing a concrete scanner site does NOT help because no warehouse is linked to a site in the DB. Scanner-receive (and thus RUN-2 scanner auto-putaway) cannot be exercised in the current data state. PIVOT to DESKTOP receive (step 6) to test auto-putaway→available. |
| 6a | Desktop receive path | MISSING | MED | There is NO desktop "Receive"/"Create GRN" form. /warehouse/inbound is read-only with only "Receive on scanner →"; /warehouse/grns is a read-only list (no create button). The PO detail has Submit/Confirm/Cancel but no Receive. So receiving is ONLY via scanner — and the scanner is blocked (5c). The brief's "receive on the DESKTOP" has no entry point. |
| 7-AUTOPUTAWAY | Verify existing GRN LP is AVAILABLE (RUN-2 core fix) | OK (partial) | MED | Existing GRN-20260627-0001 (CHILL) LP-1782541948294-4S4M (RM-001, 100kg) UI shows "Received · Released", Available 100kg, Reserved 0 — so received stock IS pickable (not 0). The RUN-1 "stock stuck at 0" blocker IS fixed for the GRN path. BUT DB shows status='received' (NOT 'available') for ALL 4 active LPs — `select status,qa_status,count(*) ... group by` → received/pending=3, received/released=1, zero rows with status='available'. So the brief's claim "receiving puts LP straight to status='available'" is INACCURATE at the data level: LPs stay status='received'; "Available" in the UI is derived qty−reserved. Functional pickability still needs the consume test (step 9). |
| 8 | Register WO: Planning > Work orders > + Create WO, product FG-NPD-002 cheleb 800g, qty 20 each, start 2026-07-01, line LINE01 → Create → Release | OK | - | WO-202606-0002 created (Draft, 16kg) with BOM, then Released (native confirm). Now visible to scanner. /en/planning/work-orders |
| 9a | Scanner WO: open WO-202606-0002 (All filter), Clock In, Start work order | OK | - | WO → in_progress; Consume/Output/Waste unlocked. BOM materials shown (RM-001 8.96kg, RM-002 0.256kg, BOX 16ea, LAB 16ea). /en/scanner/wos/afd9fed0-... |
| 9b | Consume → pick RM-001 → pick a license plate | ERROR | HIGH | "No license plates available for this material." — RM-001 HAS a released LP (LP-...4S4M, 100kg available, CHILL) but the scanner consume LP-list shows NONE. Same site-scoping defect (CHILL warehouse site_id=NULL → LP not visible to scanner site). So the RUN-2 claim "LPs should now be available to consume" does NOT hold via scanner. There IS a "Manual / no LP" fallback (bypasses LP selection). /en/scanner/wos/.../consume |
| 9b-DB | Confirm prior consumption also used no-LP | ERROR | HIGH | `wo_material_consumption` shows the existing WO-202606-0001 consumed with lp_id = 00000000-0000-0000-0000-000000000000 (no-LP sentinel). So LP-based consume has NEVER worked in this data state — every consume falls back to manual. LP traceability via scanner is non-functional. |
| 9c | Consume RM-001 via Manual/no LP (qty 8.96kg + reason code) | OK | - | "Consumption saved · RM-001 8.96 kg"; BOM row updated to 8.960/8.960. Consume action itself works (just not LP-selected). |
| 10 | Register output: qty 16, batch BATCH-R2-FG-002 → Confirm output | OK | - | "Output registered — Finished goods recorded to stock." Mass-balance guard fired correctly: "Registered output (16 kg) requires ~16 kg components at 100% yield, but 8.96 kg consumed". Output unit label shows "kg" though WO target is "each" (LOW unit-label mismatch). /en/scanner/wos/.../output |
| 10-LP | FG output LP created | OK | - | New LP-1782548065775-UVHI (FG-NPD-002, 16kg, batch BATCH-R2-FG-002, source=production, CHILL/LOC1), status=received, qa=pending, Available 16kg. |
| 11 | QC release FG LP: LP detail > Change QA status > Released + note > Confirm | OK | - | LP badges → "Available" + "Released". DB: status='available', qa_status='released'. CLARIFIES RUN-2: QC-release is what flips received→available; receive/putaway alone leaves status='received' (still pickable via available_qty). /en/warehouse/license-plates/486c2aad-... |
| 12 | Move LP: LP detail > Move > dest CHILL·LOC2 + reason > Move LP | OK | - | Move succeeded; LP location LOC1 → LOC2. Dest dropdown offered cross-warehouse locations incl R2WHA·R2A-BIN1 (so R2WHA IS a valid move target even without a site). /en/warehouse/license-plates/486c2aad-... |
| 13a | TO: + Create TO, From CHILL, To PRODUCTION, line FG-NPD-002 10kg → Save & Plan | OK | - | TO-202606-0002 created (Draft). /en/planning/transfer-orders |
| 13b | TO Ship (Draft → In transit, confirm dialog) | OK (RUN-1 FIXED) | - | Status → "In transit". The RUN-1 TO-ship blocker is FIXED. "Receive" button appeared. |
| 13c | TO Receive (In transit → Received, confirm dialog) | OK (RUN-1 FIXED) | - | Status → "Received". DB: new LP at PRODUCTION 10kg, status='available', qa_status='released', batch BATCH-R2-FG-002. TO ship→receive works END-TO-END; stock moved CHILL→PRODUCTION and is available. /en/planning/transfer-orders/5a65812b-... |
| 14a | SO: + New sales order, customer E2E Tour Customer, line FG-NPD-002 5kg → Create | OK | - | SO-202606-00002 created (Draft). /en/shipping |
| 14b | SO Confirm (Draft → Confirmed, confirm dialog) | OK | - | Status → Confirmed; Allocate enabled. |
| 14c | SO Allocate | OK (RUN-1 FIXED) | - | Status → Allocated; line allocated 5.000/5.000 (FEFO found the released FG LP). "Create shipment" enabled. |
| 14d | Create shipment → Pack: type LP-1782548065775-UVHI → Pack | OK | - | Box 1 created, SSCC-18 = 012345670000000015 (mod-10 OK), LP packed 5.000. Pick+pack works. /en/shipping/shipments/015f8adc-... |
| 14e | Seal shipment → Ship shipment | OK (RUN-1 FIXED) | - | Lifecycle Packing ✓ → Shipped ✓; "Shipment shipped." Shipped at Jun 27 8:27. Generate BOL enabled. SO ship works END-TO-END (RUN-1 blocker FIXED). |
| 14f | Generate BOL | OK | - | BOL action ran (button enabled post-ship). |
| 14-DB | Post-ship LP state | OK (note) | LOW | Packed LP 486c2aad now status='shipped', quantity=1.0kg (16 − 10 TO − 5 ship = 1kg remainder), qa='released'. The shipped LP retains a 1kg remainder yet shows status='shipped' — minor remainder/status nuance to confirm in valuation. |
