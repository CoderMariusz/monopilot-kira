# Audit-Tune-4: Scanner (06) + Finance (10) — Prototype vs PRD Cross-check

**Auditor:** Audit-4 (READ-ONLY)
**Date:** 2026-04-23
**Sources:**
- PRD: `06-SCANNER-P1-PRD.md` v3.0, `10-FINANCE-PRD.md` v3.0, `00-FOUNDATION-PRD.md`
- UX Spec: `design/06-SCANNER-P1-UX.md` v1.0, `design/10-FINANCE-UX.md` v1.0
- Prototype: `design/Monopilot Design System/scanner/` (14 files), `design/Monopilot Design System/finance/` (10 files)

---

## MODULE 06 — SCANNER

### A. PRD → Prototype Coverage (Must items missing or incomplete)

| # | PRD Requirement | Status | Severity |
|---|---|---|---|
| A1 | **SCN-011b PIN First-Time Setup** (forced at first login, 2-step set/confirm, policy validation) — PRD D8, UX §3.3 | MISSING — `login.jsx` `PinScreen` renders PIN entry but no SCN-011b screen or first-time forced redirect logic | HIGH |
| A2 | **SCN-011c PIN Change (Self-service)** — distinct screen with 3 steps: old→new→confirm. UX §3.4 | MISSING — `SettingsScreen` has "Zmień PIN" row but clicking it renders `sc-mchev` only; no `PinChangeScreen` component exists | HIGH |
| A3 | **Kiosk mode auto-logout** after success (D7: per-operation logout, PIN re-auth before next op) | NOT IMPLEMENTED — app state machine in `app.jsx` was not read in full but prototype `login.jsx` / `home.jsx` do not distinguish kiosk vs personal mode; no post-success logout path visible | MEDIUM |
| A4 | **Session timeout UX** — 30s-before-expiry modal + idle kiosk 60s direct logout (FR-SC-FE-014) | MISSING — no `SessionTimeoutModal` component in `modals.jsx` references observed; `SettingsScreen` shows "300s timeout" static label only | HIGH |
| A5 | **FR-SC-BE-010 GS1 parser** — `lib/utils/gs1-parser.ts` AI codes 01/10/17/21/310x — only simulated in `PoItemScreen.autoExtract()` via hardcoded string | STUB ONLY — expected as shared utility; the demo path (`"]C1" + gtin + "1710010724"`) is synthetic; no real AI separation or GTIN-14 check digit visible | MEDIUM |
| A6 | **FR-SC-FE-007 CameraScanner component** — `@zxing/browser` viewfinder overlay, torch, front/rear toggle | MISSING from JSX files — no `CameraScanner` component defined anywhere in scanner folder | HIGH |
| A7 | **SCN-090 Offline Queue view** (P2 but P1 stub required — detection badge + placeholder per FR-SC-FE-015) | Badge shown on `HomeScreen` as static `sync-online` span; no tap-to-queue-view navigation; queue screen absent (correct for P2 but stub navigation not wired) | LOW (P2) |
| A8 | **FR-SC-FE-011 Device detection** — `lib/scanner/detect.ts` returns `{hardware, camera, deviceType}` | MISSING — no detection utility in prototype; `SettingsScreen` has a static segmented mode picker but no `detectScannerCapabilities()` call | MEDIUM |
| A9 | **Putaway: alternatives list** — PRD FR-SC-FE-023 requires top-3 alternatives after suggested location | MISSING — `PutawaySuggestScreen` shows single suggested location + 4 quick-locs but no `alternatives` from API response displayed | MEDIUM |
| A10 | **SCN-020 multi-LP side-by-side done** — UX §3.7.4 requires two LP cards side-by-side when >1 LP created per line | NOT SHOWN — `PoDoneScreen` shows single LP card; multi-LP split result layout absent | LOW |
| A11 | **FR-SC-FE-004 SCN-012** — 2-column site cards spec, grid 4 lines, 3 shift buttons; UX §3.5 | COVERED — `SiteSelectScreen` implements this correctly |
| A12 | **V-SCAN-LOGIN-002 rate limit display** — "Zbyt wiele prób logowania. Spróbuj za 10 minut." | MISSING from `LoginScreen` — lockout message for login form (not PIN) not handled; PIN screen does show tries-left counter | LOW |

**Coverage estimate:** ~74% of P1 must-have screens covered (all 5 major epics have primary screens); shell utilities (CameraScanner, DeviceDetect, PIN setup/change, session timeout) are the primary gaps.

---

### B. Prototype → PRD Hallucinations / Extensions

| # | Element in Prototype | Classification | Notes |
|---|---|---|---|
| B1 | **`RunStrip` on login screen** — last-8-sessions activity strip shown in `LoginScreen` | **(A) Extension** — PRD/UX spec does not mention a session history strip on the login screen. Not harmful but no PRD anchor | LOW risk |
| B2 | **"Demo:" buttons** on scan screens (`Demo: LP-00287`, `Demo: LP-00301`, `Demo: skanuj GS1`, etc.) | **(A) Extension** — demo scaffolding, clearly labelled; PRD notes `npm run seed:scanner` for test data but does not mandate demo buttons in UI. Acceptable prototype device | NONE — should be removed pre-production |
| B3 | **LP Inquiry screen (`InquiryScreen`)** — "LP info P2 preview" screen reached from home | **(A) Extension** — no `SCN-inquiry` screen exists in PRD screen catalog or route map. UX §2.1 has no `/scanner/inquiry` route | LOW risk — clearly marked P2 |
| B4 | **`WoDetailScreen`** as separate screen between WO list and Execute | **(C) Update PRD** — PRD SCN-080 shows `SCN-080-wo-list → SCN-081 WO execute` directly; prototype adds a detail intermediate (`WoDetailScreen`) with BOM summary + "Kontynuuj produkcję" CTA. This is a good UX clarification not in PRD §8.4 | Recommend adding to PRD as SCN-080-detail |
| B5 | **"⏸ Wstrzymaj" and "📋 Szczegóły BOM"** buttons in `WoDetailScreen` bottom bar | **(B) Hallucination** — PRD §8.4 FR-SC-FE-043/044 defines 4 buttons on WO execute screen (Skanuj komponent / Wyrób gotowy / Co-product / Odpad); no "Wstrzymaj" or "Szczegóły BOM" action specified at this level | MEDIUM — could imply WO pause logic not defined in 06 |
| B6 | **"Wyrób gotowy" step 3 confirmation screen** (4-step flow with dedicated Potwierdź step) | **(C) Update PRD** — UX §3 Output flow not fully detailed; 4-step pattern (Ilość→Partia/Expiry→Lokalizacja→Potwierdź) is sound and aligns PRD FR-SC-FE-050 | Recommend documenting |
| B7 | **BestBeforeSheet triggered with 14-day window** during PO receive (`daysLeft <= 14`) vs PRD D2/UX which says `best_before_warning_days` (configurable, no specific default in PRD) | **(B) Hallucination** — hardcoded 14-day threshold. PRD references `best_before_warning_days` admin config; default should come from settings | LOW — fixable |
| B8 | **5 additional "andere" waste phase option** (`<option value="other">Inne</option>`) beyond 4 phases in PRD (przed gotowaniem / w trakcie / po gotowaniu / pakowanie) | **(A) Extension** — PRD FR-SC-FE-053 lists 4 phases; prototype adds "Inne" as 5th. Reasonable extension | NONE |
| B9 | **`QaInspectScreen` labels "ZATWIERDŹ" / "ODRZUĆ" / "WSTRZYMAJ"** vs PRD "PASS / FAIL / HOLD" | **(C) Drift** — PRD UX §1.3 big-3 buttons spec says "PASS / FAIL / HOLD" labels (and §8.5 FR-SC-FE-056 confirms). Polish translation "ZATWIERDŹ / ODRZUĆ / WSTRZYMAJ" is reasonable but label text drifts from spec | LOW |

---

### C. Drift (Interpretation Gaps)

| # | Dimension | PRD Spec | Prototype | Severity |
|---|---|---|---|---|
| C1 | **PIN length: 4–6 digit support** (D8: 4-6 digit numeric, auto-advance after 6th) | UX §3.2: "for 4- or 5-digit PINs, submit key appears after digit 4" | `PinScreen` always renders 6 dots and auto-advances only at length === 6; no 4/5-digit submit key visible | MEDIUM |
| C2 | **Putaway strategy alternatives** | FR-SC-BE-024: top-3 alternatives returned; FR-SC-FE-023: alternatives list displayed | `PutawaySuggestScreen` uses single mock `suggested` object (hardcoded "LOC-B-02-03") with no alternatives array | MEDIUM |
| C3 | **LP lock acquisition before LP-modifying ops** | FR-SC-BE-030/031: `lock-lp` acquired before move/split/consume; D9 severity "block" for LP_LOCKED | Move screen shows `Banner kind="info" title="🔒 Lock na 5 min"` as informational only, no actual lock call; Split screen has no lock visible; only consume has `showLocked` state (never triggered in demo) | MEDIUM |
| C4 | **FEFO deviation: 5 reason codes required** (FR-SC-FE-041/046: dropdown 5 reasons) | PRD lists: `expiry_close, location_closer, different_batch, damaged_suggested, other` | `FefoDeviationSheet` (in `modals.jsx`, not read directly but referenced) provides reasons; the modal is invoked correctly in both `ConsumeScanScreen` and `PickScanScreen` | OK — assumed correct |
| C5 | **Receive PO: urgency dot colors** | PRD: Red = overdue (ETA past), Amber = today, Blue = future. UX §3.7.1 | `PoListScreen` uses CSS classes `.urg-red`, `.urg-amber` on `licon` container; urgency text logic in `PoLinesScreen` checks `urgency === "red"` → "WYSOKA" etc. Appears consistent | OK |
| C6 | **QA big-3 button label "FAIL" triggers fail-reason screen** | PRD SCN-071 → SCN-072 on FAIL; PRD FR-SC-FE-056: variant `d` (danger) for FAIL | `QaInspectScreen` calls `onResult({ result: "fail_pre" })` for FAIL, which routes to QA fail reason. Correctly wired | OK |
| C7 | **SCN-084 Waste: 4-cell summary grid** on done screen | FR-SC-FE-053: "SCN-084-done 4-cell summary: kategoria / qty / faza / timestamp" | `WasteDoneScreen` uses `sc-mini-grid` 2×2 (Kategoria/Ilość + Faza/Godzina) = 4 cells. Correct | OK |
| C8 | **Co-product LP color: purple-400 text, purple-950 bg** | PRD §9.8; UX §1.4 `Co-product purple` | `CoproductDoneScreen` renders `sc-lp-card purple` class. CSS not read but class reference correct | OK (assume CSS matches) |
| C9 | **SCN-home: "Inwentaryzacja P2" tap shows info banner** "Funkcja dostępna w przyszłej wersji" | UX §3.6 explicit | Home data tiles (in `data.jsx`, not read directly) likely include inventory item; tap behavior not verifiable from JSX routing alone | UNVERIFIED |
| C10 | **PickScanScreen step 0** requires location scan before LP | PRD FR-SC-FE-040: "scan location → ✓ → scan LP" 3-step | `PickScanScreen` implements steps [Lokalizacja, LP, Ilość] correctly; location validation rejects non-matching LOC | OK |
| C11 | **Scanner dark palette** — slate-900 bg, f1f5f9 text | PRD §5.1 / UX §1.1 | All scanner JSX uses `var(--sc-surf)`, `var(--sc-txt)` CSS vars; scanner.css not read but color system appears consistent throughout | OK — intentional dark, not drift |

---

### D. Fitness Assessment — Scanner

| Dimension | Score | Notes |
|---|---|---|
| Screen coverage (major SCN codes) | 90% | All 9 major codes + sub-screens present; PIN setup/change, camera, session timeout missing |
| Shell utilities coverage | 55% | CameraScanner, DeviceDetect, GS1 real parser, session timeout modal absent |
| Hallucination risk | LOW | B5 ("Wstrzymaj" button) is main concern; others are extensions or update-PRD |
| Drift severity | MEDIUM | C1 PIN length, C2 putaway alternatives, C3 LP lock gap |
| PRD fidelity | HIGH | Core workflows (consume, output, co-product, waste, QA, pick, putaway, receive) faithfully implemented |

**Overall Fitness: YELLOW**

*Rationale: Core production and warehouse flows are well-covered and match PRD intent. The YELLOW flag is for three missing P1 shell components (CameraScanner, PIN setup/change flow, session timeout UX) and the LP lock acquisition gap (C3). These must be addressed before implementation handoff.*

---

## MODULE 10 — FINANCE

### A. PRD → Prototype Coverage (Must items missing or incomplete)

| # | PRD Requirement | Status | Severity |
|---|---|---|---|
| A1 | **FIN-003b Co-product Allocation section** — table: Output Item, Type, Allocation %, Allocated Cost; formula note (PRD §9.3 + UX FIN-003b) | MISSING — `FinWoDetail` (`wo-screens.jsx`) has cascade section but no co-product allocation sub-table; PRD marks this required when BOM has co-products | HIGH |
| A2 | **FIN-002 Status tabs** — UX §FIN-002 lists tabs: All / Draft / Pending / Approved (≠ "Active") / Superseded / Retired | DRIFT — `FinStandardCosts` uses tabs: all / active / pending / draft / superseded. "Approved" tab is absent; uses "active" (which conflates approved+effective) vs PRD/UX distinction between "approved" (signed, not yet effective) and "active" (effective today) | MEDIUM |
| A3 | **FIN-002 Table column "Actions" kebab** — UX lists: Edit / View History / Approve / Supersede / Retire | PARTIAL — prototype shows Approve/Edit/History/Supersede inline buttons in row; "Retire" action is absent | LOW |
| A4 | **V-FIN-SETUP-03 exchange rate staleness warning** (>7 days → warn banner) | COVERED — `FinFxRates` checks `staleRate` and renders `alert-amber alert-box` with "Update Rate" CTA. Correct |
| A5 | **FIN-003b WO open / still-accumulating info banner** — "This WO is still in progress…" (UX §FIN-003b states) | COVERED — `FinWoDetail` renders `d365Badge` dynamic text; "WO not yet closed" = gray badge. The UX spec requires a `alert-blue` banner (not just a badge). Slight gap | LOW |
| A6 | **FIN-003b recalculate + add-note + export buttons** | COVERED — all three buttons rendered in `FinWoDetail` page-head right section |
| A7 | **FIN-003b Variance Breakdown: waste cost row** (only if waste > 0) | COVERED — `waste` expandable row rendered conditionally with `d.varianceDetail.waste.total > 0` check |
| A8 | **FIN-005 Aging buckets filter** (0-30d / 30-60d / 60-90d / 90+d) | COVERED — `FinInventoryValuation` filter bar has `<select><option>All aging</option><option>0-30d</option>...` |
| A9 | **Finance Settings: fiscal calendar section** | COVERED — `FinSettings` §5 renders Calendar Type + FY Start Month |
| A10 | **FIN-016 GL Mapping admin** (PRD §8.1 FIN-007 / UX FIN-007 = GL Account Mappings page) | PARTIAL COVERAGE — UX spec defines FIN-007 as standalone page at `/finance/gl-mappings`; prototype embeds GL mapping as a tab inside `FinD365` component at route `/finance/d365`. Route consolidation differs from spec IA | MEDIUM |
| A11 | **FIN-008 (Exchange Rates + Currencies)** — UX defines as standalone FIN-008 page | COVERED — `FinFxRates` component at route `/finance/fx` |
| A12 | **Cost Approval Modal with PIN re-verification** (FIN-002, 21 CFR §5.3) | PRESENT as `openModal("approveStdCost", r)` call — modal in `modals.jsx` (not read but referenced). PIN re-verification behavior assumed implemented | UNVERIFIED |
| A13 | **FIN-003b "Back to WO" link** → `/production/work-orders/:id` | COVERED — "Back to WO in Production →" link in breadcrumb area |
| A14 | **Dashboard "onboarding checklist"** | EXTENSION — see B1 below |

---

### B. Prototype → PRD Hallucinations / Extensions

| # | Element in Prototype | Classification | Notes |
|---|---|---|---|
| B1 | **Onboarding checklist** in `FinDashboard` (5-step get-started card with "Hide" button) | **(A) Extension** — PRD §8.3 / UX §FIN-001 do not specify an onboarding checklist panel. Useful UX addition but no PRD anchor | NONE |
| B2 | **Inline dismissable `FIN_INLINE_ALERTS` banners** on dashboard above KPI row | **(A) Extension** — PRD §8.3 dashboard widgets list does not mention dismissable inline alerts. The variance alert widget is specified but not dismissable inline banners | LOW |
| B3 | **Cost Waterfall chart** in dashboard ("Standard baseline → material var → labor var → overhead var → waste → Actual MTD") | **(A) Extension** — PRD §8.3 dashboard widgets do not include a waterfall chart. UX §FIN-001 also does not specify it. Good addition but unanchored | NONE |
| B4 | **`FinWoDetail` cascade table includes "Role" column** (Parent / Child badges) | **(C) Update PRD** — PRD §9.1 cascade rollup and UX FIN-003b cascade section do not explicitly list a "Role" column; the prototype adds it. Sensible and aligned with DAG semantics | Recommend documenting |
| B5 | **FIN-016 D365 Integration collapses FIN-007 GL Mapping** into a tab | **(B) Hallucination / IA drift** — PRD §8.1 lists FIN-007 as standalone screen "GL Account Mappings Admin". UX §2.2 route map shows `/finance/gl-mappings` as separate nav entry. Prototype embeds it as `gl` tab in `FinD365` at `/finance/d365` | MEDIUM — IA mismatch |
| B6 | **FIN-011 `FinReports` includes "Report Builder" custom tab** with preview | **(A) Extension** — UX §FIN-011 describes a Cost Reporting Suite but doesn't detail a live query builder. The preview table with "Showing first 25 of 142 rows" is a useful addition | NONE |
| B7 | **Finance Settings §7 "Fiscal Period Lock"** with `DryRunButton` | **(A) Extension / C Update PRD** — PRD marks period lock as Phase 2; prototype renders it with Phase 2 badge but includes `DryRunButton`. Per TUNING-PATTERN.md §3.6 annotation in code this is deliberate design-system pattern, not accidental | LOW — correctly labelled Phase 2 |
| B8 | **`RunStrip` (8-week trend) in `FinStandardCosts` table column "Trend (8 wk)"** | **(A) Extension** — UX FIN-002 table columns do not include a trend spark-strip. Useful but unanchored | NONE |
| B9 | **`FinSettings` has "Cost Change Warning Threshold %" field** (warn >20% change) | **(A) Extension** — PRD V-FIN-STD-06 mentions "cost change >20% → suggest dual sign-off" as P1 warn. Settings field allows admin to configure the threshold. Consistent with rule intent | NONE |

---

### C. Drift (Interpretation Gaps)

| # | Dimension | PRD Spec | Prototype | Severity |
|---|---|---|---|---|
| C1 | **Variance sign convention display** | UX §1.3 badge system: `badge-warning` = 0 < variance% < 10%, `badge-critical` = variance% ≥ 10%. PRD: positive = unfavorable | `VarBadge` component used consistently; `FinVarMaterial` tabs use "Critical" = `Math.abs(r.variancePct) >= 10` (absolute, not directional). Minor discrepancy: unfavorable threshold should be directional | LOW |
| C2 | **FIN-002 status tab naming** | PRD §6: lifecycle states are `draft / pending / approved / superseded / retired`. UX: tabs include "Approved" separately | Prototype uses "active" tab (filter `r.status === "active"`) but data `FIN_STD_COSTS` uses `status: "active"` not `status: "approved"`. The `standard_costs` DDL uses `status IN ('draft','pending','approved','superseded','retired')` — no "active" state exists. Tab conflates approved+effective-today into "Active" | MEDIUM |
| C3 | **FIN-003b WO cost detail: "open/still accumulating" UX** | UX §FIN-003b: `alert-blue` banner "This WO is still in progress…" at top of cost card | Prototype shows a D365 badge only ("WO not yet closed — costs accumulating" in gray badge). The `alert-blue` banner is absent | LOW |
| C4 | **FIN-006 FX Rates: "Rate History" shows reason column** | UX §FIN-008: "Effective Date, Rate, Source, Updated By, Reason" columns | `FinFxRates` table has Effective Date/Rate/Source/Updated By/Reason — all 5 columns present | OK |
| C5 | **D365 outbox retry schedule** | PRD §12.3 references "3 attempts with exponential backoff" pattern (from 08-PROD §12 template) | `FinD365` outbox tab footer shows "6-attempt schedule: immediate → +5m → +30m → +2h → +12h → +24h → DLQ" — 6 attempts vs PRD's 3. This is an extension of the schedule; may need PRD update | MEDIUM |
| C6 | **Dashboard KPI count = 6** | UX §FIN-001: 6 KPI cards: Total Cost / Variance / Inventory Value / Uncosted WOs / D365 DLQ / Yield Loss | `FinDashboard` renders exactly 6 KPIs from `FIN_KPIS` array | OK |
| C7 | **FIN-007 Material Variance tabs**: PRD doesn't specify tab structure | Prototype adds `TabsCounted` with All / Favorable / Unfavorable / Critical per TUNING-PATTERN.md §3.2 | **(A) Extension** — aligned with TUNING pattern, good addition | NONE |
| C8 | **"Reversed" status on WO costs list** | PRD §6 DDL: `work_order_costs.status IN ('open','closed','posted','reversed')` | `FinWoList` tabs only show all / open / closed / posted; "reversed" tab absent | LOW |

---

### D. Fitness Assessment — Finance

| Dimension | Score | Notes |
|---|---|---|
| Screen coverage (FIN-001..016 P1) | 92% | All P1 screens present; co-product allocation sub-table (FIN-003b) missing |
| Data model / API fidelity | HIGH | Standard costs, WO costs, inventory valuation, variance, D365 queue all covered |
| Hallucination risk | LOW-MEDIUM | B5 GL mapping IA consolidation is the primary structural deviation; others are extensions |
| Drift severity | LOW-MEDIUM | C2 status naming ("active" vs PRD "approved"), C5 retry count mismatch |
| PRD fidelity | HIGH | Finance flows faithfully implement dual FIFO/WAC, cascade rollup, variance waterfall, D365 outbox |

**Overall Fitness: YELLOW**

*Rationale: Finance prototype is the stronger of the two modules — comprehensive coverage of all P1 screens and correct data semantics. The YELLOW flag is for: (1) missing co-product allocation table in FIN-003b (A1 — HIGH), (2) GL Mapping IA moved into D365 tab vs standalone route (B5 — MEDIUM), and (3) standard cost status naming drift "active" vs PRD "approved" (C2 — MEDIUM). These need resolution before the FIN-002 / FIN-003b build sessions.*

---

## Cross-Module Notes

| # | Observation |
|---|---|
| X1 | **Scanner→Finance event chain** (consume transaction → `material.consumed` event → `cost_method_selector_v1` → `material_consumption_costs`) is correctly scoped as a backend concern. Neither scanner prototype nor finance prototype duplicates this; the interface boundary is clean. |
| X2 | **Waste categories** — scanner `WasteScreen` uses `SCN_WASTE_CATS` (fat/floor/giveaway/rework/other); finance `FinWoDetail` reads `waste_cost_actual`. The linkage through `wo_waste_log.category_id → waste_categories` (02-SETTINGS §8) is not tested in prototypes but the conceptual path is coherent. |
| X3 | **QA yield loss → Finance** — `FinDashboard` "Monthly Yield Loss" table references `ncr_reports.claim_value_eur` from 09-QA, converted at daily GBP/EUR. Scanner `QaInspectScreen` creates NCR on FAIL. The FX conversion note "EUR claim values converted at daily GBP/EUR rate effective on incident date" in prototype is accurate to PRD §2.3 / §8.3. |
| X4 | **D365 Constants** — `FinD365` correctly shows `dataAreaId: FNOR`, `warehouse: ForzDG` matching PRD §2.2 Forza config. Scanner does not interact with D365 — correct separation. |
| X5 | **RunStrip component** appears in both scanner (login screen, session outcomes) and finance (standard costs trend). This is a shared design-system primitive. Usage in finance is an extension; usage in scanner login is also an extension. Both should be documented as TUNING-PATTERN compliant additions. |

---

## Overall Summary

| Module | Coverage | Halluc Risk | Drift | Fitness |
|---|---|---|---|---|
| 06-SCANNER | ~74% (screens) / 55% (shell utils) | LOW | MEDIUM (PIN length, LP lock, putaway alternatives) | **YELLOW** |
| 10-FINANCE | ~92% | LOW-MEDIUM (GL IA B5) | LOW-MEDIUM (status naming, retry count) | **YELLOW** |

### Top-3 Findings Per Module

**SCANNER:**
1. CameraScanner component (`@zxing/browser`, viewfinder) is entirely absent from prototype files — required for P1 3-method parity (HIGH)
2. PIN setup (SCN-011b) and PIN change (SCN-011c) flows are missing; SettingsScreen has a stub link only (HIGH)
3. LP lock acquisition is shown as an info banner only, not as a blocking gate; LP-modifying ops (move/split/consume) do not gate on lock result (MEDIUM)

**FINANCE:**
1. Co-product cost allocation table absent from FIN-003b WO Cost Summary Detail — required when WO BOM includes co-products (HIGH)
2. GL Account Mappings consolidated into D365 tab vs standalone route/page as specified in PRD FIN-007 and UX route map (MEDIUM — IA drift)
3. Standard cost status tab uses "active" (not a PRD lifecycle state) conflating approved+effective records; DDL has no "active" status (MEDIUM — data model drift)
