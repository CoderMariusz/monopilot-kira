# E2E Tester Tour — COMPREHENSIVE REPORT (2026-06-27, autonomous night run)

Walked the FULL tester path on the LIVE deployed app (admin@monopilot.test), all 16 steps, clicking everything,
no shortcuts. Raw step log + screenshots: `_meta/e2e-tour-2026-06-27-findings.md` + `.playwright-mcp/*.png`.

## VERDICT — are all paths unblocked?
**NO — one BLOCKER breaks the operational tail.** Steps 0–14 (login → warehouse/location → full NPD → PO →
receive → WO → consume → produce FG → movements) all WORK (with minor issues noted). **Steps 15–16 (TO ship,
SO allocate/pack/ship) are BLOCKED** by a single root cause: received + QC-released stock never becomes
"pickable/available", so there is never any stock to transfer or allocate.

## 🔴 THE BLOCKER — received/released stock is never pickable
- **Symptom:** after receiving PO stock and QC-PASSing an LP ("New QA status: Released"), the inventory browser
  shows every product as **"0 kg pickable"**. TO Ship → "Insufficient stock to fulfill this transfer";
  SO Allocate → "There is not enough released stock to allocate this order."
- **Root cause (verified live):** an LP needs BOTH `status='available'` AND `qa_status='released'` to count as
  available (`v_inventory_available`, mig 191). Receive lands the LP at `status='received'` + `qa_status='pending'`
  (by design — the LP is *not* born available). The canonical `received → available` transition is **PUTAWAY**
  (scanner Move-LP, moveType='putaway', `lib/warehouse/scanner/movement.ts`). The tour did receive + QC-release
  (which only flips `qa_status` to released) but never completed **putaway**, so `status` stayed `received` →
  the stock satisfies the QA half but not the location half → 0 pickable.
- **So it is a FLOW/UX gap, not a data-corruption bug:** the model is correct, but a tester who receives + releases
  stock has no obvious, working way to *putaway* it into available stock, so the chain dead-ends.
- **Fix IN FLIGHT (Codex):** make the putaway step reachable + verified-working for a 'received' LP (clear scanner
  "Putaway" entry / desktop putaway control). + the related "No LPs available" on WO-consume and the LP-list issues.
- **⚖️ OWNER DECISION:** keep the explicit putaway step, OR make **receive auto-putaway** to a default location
  (`received → available` in one step) for small-warehouse simplicity? (I did NOT change the lifecycle model
  autonomously — your call.)

## 📍 Your specific question — PO delivery-location field
**CONFIRMED MISSING (MED).** Neither the Create-PO dialog (PO#/Supplier/Expected-delivery/Currency/Lines/Notes)
nor the PO detail/summary has any delivery-location / destination / receiving-warehouse field. Destination is
chosen only at RECEIVE time (desktop receive has a location dropdown; scanner uses the site default).
**Proposed fix (your call):** add an optional `destination_warehouse_id` (+ location) on the PO header, shown in
create + detail, and PRE-FILL the receive-warehouse from it. (Migration + UI — design choice: header vs per-line.)

## All findings by severity
**BLOCKER:** released stock never pickable → TO-ship + SO-allocate/pack/ship unreachable (steps 15–16). *(fix in flight)*

**MED:**
1. Scanner Receive-PO **destination-location field silently DISABLES the Receive button** on a valid code — no error,
   can't pick a warehouse. *(not yet assigned — queued)*
2. Scanner WO-Consume → **"No license plates available"** despite received stock, forces "Manual/no-LP". *(same root as the BLOCKER — putaway/available; fix in flight)*
3. `/warehouse/license-plates` shows **0 LPs** while 4 exist (list filtered to available-only, hides 'received');
   `/warehouse/lps` is a **404** (stale link). *(fix in flight)*
4. PO has **no delivery-location field** (above).
5. Add-location **Parent dropdown not filtered to the chosen warehouse** → could mis-parent under a foreign WH. **✅ FIXED + pushed (be71aa71).**

**LOW:**
- Add-warehouse dialog has **no Site picker** → new WH has blank Site (part of the warehouse↔site link theme).
- Pilot card needs a **2nd save** to render after first create (stale view).
- React **#418 hydration on /allergen-cascade**. **✅ FIXED + pushed (be71aa71).**
- WO **start-date saved as prev-day 23:00** (timezone off-by-one).
- A released WO is **hidden under the scanner "My line" filter**.
- Move-LP destination suggestions **limited to the same warehouse**.
- **No seeded customers** for SO.

**THEME — warehouse↔site link gap:** Add-warehouse has no Site picker, released BOM "Destination warehouse = —",
PO has no destination, Move-LP same-warehouse-only. Ties into the in-progress SITE-SCOPING rebuild (#53).

## ✅ Shipped LIVE tonight (autonomous)
- **RBAC persona seed (mig 356) APPLIED + verified** — 11 MES personas + phased writes, SoD role-level per your
  decision (BOM-approve→quality_lead, schedule-publish→prod_manager). **"Only admin can transact" fixed.** (e52b2b70)
- **Import/Export #418** hydration fix (faa4bb70).
- **allergen-cascade #418 + location-parent-filter** (be71aa71) — both tour findings.
- (Earlier today: yield-save mig 355, PO-receive no_warehouse_for_site, 4 wave-3 lanes, NPD-revert + bulk-import UIs.)

## 🟡 GO-READY but GATED on your supervised apply
- **Merge cut product→items** (migs 357/358/359 + verify, UNCOMMITTED so no deploy auto-applies). 2 Codex reviews:
  NO-GO → patched → GO-WITH-FIXES → last trigger fix done. Apply 357→358→359 ATOMIC + verify harness + rollback,
  with you present to test. Design `…merge-design.md §8g`.

## ⚖️ DECISIONS I need from you (morning)
1. **Putaway:** keep explicit putaway step, or receive→available auto-putaway?
2. **PO destination field:** add `destination_warehouse_id` on PO header + pre-fill receive? (yes/no/per-line)
3. **Merge cut:** apply it in a supervised window with you? (it's GO-ready)
4. **Finance/shipping RBAC personas:** name them so I can add them (deferred from mig 356).

## RESUME POINT
After the putaway/available fix deploys: re-run the tour from **step 15** (TO-202606-0001 Ship → Receive) → **step 16**
(SO-202606-00001 Allocate → Pick → Pack → Ship). Test artifacts already exist (warehouse E2EWH, location E2E-BIN-01,
PO-0005/0003 received, WO-0001 in-progress w/ 40kg FG output, LP-…4S4M QC-released, TO-0001 draft, SO-00001 confirmed;
admin scanner PIN 246819). I will set this resume up once the fix lands.
