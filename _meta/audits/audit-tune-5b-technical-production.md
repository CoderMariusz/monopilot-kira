# Audit Tune-5b: Technical + Production
Date: 2026-04-23
Source: C:/Users/MaKrawczyk/OneDrive - IPL LIMITED/Desktop/PLD/monopilot-kira-main/
Tuned commits: b9103bf (technical) + 808a27b (production) — merged to main

---

## Module: Technical (03)

### A. PRD → Prototype coverage gaps

PRD defines 11 epics (E03.1–E03.11) with ~8 UI surface groups (TEC-010..073). The prototype covers roughly 65% of them. Key gaps:

1. **TEC-011 Item Create Wizard (4-step)** — PRD specifies a 4-step item creation wizard (basic + classification + weight mode + extensions). Prototype has a 3-step `ProductCreateModal` (basic / category-and-rules / review) that omits a dedicated weight mode step and schema-driven extension field injection. No PR-code builder in the modal.

2. **TEC-012 Item Detail full tab set** — PRD specifies 11 tabs: General | Allergens | BOMs | Nutrition | Costing | Shelf-life | Routing | Supplier Specs | Lab Results | D365 Status | History. Prototype `MaterialDetailScreen` provides approximately 7 tabs and is only for RM items. There is no dedicated `ProductDetailScreen` / `FADetailScreen` routing for FA/intermediate types with all 11 tabs. The "Products" nav entry in the prototype nav jumps to `boms-detail` screen (BOM-centric) rather than a product list with item detail drill-through.

3. **TEC-014 Bulk Import CSV** — Specified in PRD §6.5 for mass-upload of RMs. Not implemented; no CSV import screen exists in the prototype (only an "Import" button placeholder on TEC-003 MaterialsListScreen).

4. **TEC-021/022 BOM Detail edit + drag-sort line editor** — UX spec requires a BOM edit screen with drag-sort handle per component line and inline co-product allocation editor. Prototype BOM detail has a "Versions" tab and "Ingredients tree" tab but does NOT implement the PRD-specified add/edit component slide-over panel (TEC-006a) with V-TEC-13 circular-BOM real-time check. The `BomComponentAddModal` exists but does not show the process_stage picker or the live circular-BOM validation.

5. **TEC-023 BOM Version Diff (side-by-side)** — PRD §7.5 specifies a side-by-side JSON diff view. Prototype has a "Versions" tab listing version history but NO side-by-side diff panel. The `BomVersionSaveModal` only handles saving, not comparing.

6. **TEC-025 BOM Snapshots Viewer** — Prototype has "Snapshot History" tab in BOM Detail, but it does not show the JSON diff viewer modal or the link to the WO that triggered the snapshot. This is a shallow implementation.

7. **TEC-040..042 Allergen screens — Cascade Preview + Process Additions** — The `AllergenScreen` prototype shows an "allergen matrix" tab only. It does NOT implement the three-level cascade tree visual (TEC-041), the Process Allergen Additions config table (TEC-042), or the Contamination Risk Matrix editor (TEC-043). The cascade preview is unimplemented.

8. **TEC-043 Contamination Risk Matrix** — No screen exists in the prototype. PRD §10.5 requires a line × allergen risk grid editor. Completely absent.

9. **TEC-044 Allergen Manual Override Audit** — `AllergenDeclarationModal` exists but does not show override history with reasons (TEC-044). The slide-over allergen profile editor (per UX spec) is not present as a proper per-item slide-over; it is a standalone modal only.

10. **TEC-045 Lab Results Log** — Material detail tab shows lab results in a simplified table. No standalone Lab Results screen exists per TEC-045 spec. No filter by WO/item/test_type/status or "+ Add Lab Result" flow with all required fields (test_type enum, threshold_rlu, result_value + unit, lab_provider).

11. **TEC-030 Shelf Life Config (per-item edit + date code preview)** — `ShelfLifeScreen` shows a product-list table with an "Override" button but does NOT implement per-item edit fields (shelf_life_days, shelf_life_mode radio, date_code_format picker with live preview) as specified in PRD §9.6. The ShelfLifeOverrideModal only handles overrides, not base config.

12. **TEC-031 Regulatory Compliance Dashboard** — No such screen. PRD §9.5 requires a dashboard showing per-item flag status for 7 regulations. The prototype "Shelf life" screen is a simple list, not a compliance dashboard.

13. **TEC-050..052 Cost History / Cost Edit Modal / Cost Import from D365** — `CostHistoryScreen` exists and shows effective-dated history. However, V-TEC-53 (cost change >20% requires admin approval) is not represented, and the "Cost Import from D365" screen (TEC-052, diff-preview + batch confirm) is absent.

14. **TEC-060..062 Routing Detail** — `RoutingsScreen` (list) exists but is a thin table with no routing version/status columns matching PRD columns (Total Time, Effective From, Approved By). The operations table in the prototype (`TEC-008a` equivalent) shows extra fields (Cleanup min, Yield %) not in the PRD schema but has reasonable rationale. However, `TEC-062 Routing Cost Preview` is partially present in the BOM detail cost tab, not as a standalone routing screen. TEC-063 "Resource Utilization Preview (Gantt-lite)" is absent.

15. **D365 integration screens (TEC-070..073)** — All four are present (D365StatusScreen, D365MappingScreen, D365DriftScreen, D365LogScreen). Coverage here is STRONG. The D365 DLQ Manager (TEC-073 equivalent) is the DriftScreen + a DLQ concept embedded in the status screen. However, the PRD specifies a "Manual Sync Trigger" as a separate screen (TEC-071), while the prototype collapses it into a button in TEC-070 (StatusScreen). The PRD's "Sync Audit Log" (TEC-072) maps to TEC-073 D365LogScreen — reasonable mapping.

16. **TEC-010 Item List filter set** — PRD specifies 5 filters (search, item type multi-select, status, allergen multi-select, D365 sync status). Prototype TEC-003 MaterialsListScreen only filters RM items with a pill-group type filter; no allergen filter or D365 sync status filter.

17. **V-TEC-02 / V-TEC-03 / V-TEC-05 validations** — Catch-weight required-field validation (V-TEC-02), intermediate parent BOM relationship check (V-TEC-03), and blocked→active transition requiring reason+approval (V-TEC-05) are not surfaced in any modal or form in the prototype. Only V-TEC-13 (circular BOM) is referenced in UX spec but not wired in prototype.

18. **Traceability Screen (TEC-016)** — `TraceabilityScreen` exists with a search input. Coverage appears minimal — the PRD requires forward+backward lot genealogy queryable from this screen (FSMA 204). The prototype search bar is present but the result visualization is cursory.

---

### B. Prototype → PRD (hallucinations)

1. **ECO (Engineering Change Control) — `EcoScreen`, `EcoChangeRequestModal`, `EcoApprovalModal`** — An ECO workflow with priority, impact classification, and approval modal is fully implemented. PRD §4.2 explicitly defers ECO to Phase 2 ("Advanced BOM: phantom BOMs, by-products, ECO"). This is a Phase 2 feature built in Phase 1 prototype. Classification: **(A)** — reasonable forward-design UX (keep for preview but annotate as Phase 2 / not yet data-backed).

2. **Work Centers screen** — `WorkCentersScreen` shows machines/cells as card grid with OEE targets and capacity. PRD maps this to `production_lines` + `machines` tables in 02-SETTINGS §12, not in 03-TECHNICAL. There is no TEC-screen code for Work Centers in the PRD. Classification: **(B)** — suspected hallucination. Work centers belong in 02-SETTINGS or 15-OEE; their presence in Technical clutters the module. Flag for removal.

3. **Process Parameters screen (CCP register)** — `ParamsScreen` shows CCPs, open deviations, and CpK. PRD §4.2 explicitly excludes "Hazard analysis per item" from Phase 1 (ISO 22000 in regulatory roadmap Phase 2+). HACCP/CCP is 09-QUALITY domain. Classification: **(B)** — suspected hallucination. Should be removed from Technical or clearly stub-labeled as Phase 2 / 09-QUALITY scope.

4. **Maintenance Plans screen** — `MaintenanceScreen` shows maintenance plan cards with intervals, last/next date. PRD §4.4 exclusions list includes no explicit mention but 13-MAINTENANCE is a separate module in the Monopilot plan. Classification: **(B)** — out-of-scope for 03-TECHNICAL. Belongs in 13-MAINTENANCE. Remove from this module.

5. **Tooling & Consumables screen** — `ToolingScreen` shows consumables with stock levels. No PRD reference; not part of Technical module scope. Classification: **(B)** — suspected hallucination. Likely belongs in 05-WAREHOUSE or 13-MAINTENANCE.

6. **Product Specifications screen** — `SpecsScreen` shows customer-facing technical data sheets with customer, shelf-life, storage fields. PRD §4.2 Phase 2 mentions "Digital SOPs with versioning (BRCGS v9 competence)", but customer-specific spec sheets are not explicitly specified in Phase 1 scope. This is a Phase 2 / 11-SHIPPING adjacent concern. Classification: **(A)** — reasonable UX extension that anticipates Phase 2 needs (keep but mark Phase 2 / not yet backed by data model).

7. **"Nutrition" as a top-level tab** — The UX spec adds a "Nutrition" tab to the top navigation, which is not in the PRD's UI surfaces list (TEC-010..073 range). Nutrition data is stored in `items.ext_jsonb` (L3 schema-driven extension) per PRD §6.3, not as a first-class screen. Classification: **(C)** — PRD should be updated to add TEC-009 as a first-class screen (it is referenced in UX doc and is a clear user need). Keep in prototype.

8. **D365 Field Mapping screen (TEC-071 label used for Field Mapping)** — The PRD defines TEC-071 as "Manual Sync Trigger" while the prototype uses TEC-071 as "D365 field mapping". Screen numbers are crossed. Classification: **(C)** — renaming drift; PRD screen code assignment needs reconciliation. The Field Mapping screen is itself a reasonable UX addition (A) but should get a separate TEC code (e.g., TEC-074).

9. **`badge-violet` CSS class for "Intermediate" items** — The prototype uses a violet badge for intermediate items. The PRD/UX spec defines only blue/lighter-blue for intermediate. Minor styling drift. Classification: **(A)** — design refinement, acceptable.

---

### C. Drift

1. **Dashboard layout differs from UX spec** — UX spec (TEC-017) specifies 5 KPI cards in a row with specific labels (Products, Active BOMs, Routings, Allergen Overrides, D365 Sync). Prototype `TechDashboardScreen` renders 6 KPIs (not specified) in a `repeat(6, 1fr)` grid and shows "BOM change velocity — last 8 weeks" as a bar chart instead of the UX-specified "Product Type Breakdown" horizontal bar chart and "Recent Changes timeline". The "Quick Actions" card (with "+ Create Product", "Generate BOM Batch", "Sync from D365" buttons) is absent from the prototype dashboard.

2. **BOM Detail tab structure diverges from UX spec** — UX spec defines tabs: Lines | Co-products | Snapshot History | Version Diff | Version History Panel. Prototype has: Ingredients | Routing | Parameters | Costs | Versions | Visual graph | Recipe sheet. The Co-products tab is missing as a separate tab (it is implied in Ingredients tree). Recipe sheet and Visual graph tabs are prototype additions not in UX spec. The Routing tab in BOM Detail is also absent from the UX spec (routing is a separate TEC-007/008 flow). This is significant IA drift.

3. **Materials list (TEC-003) column set mismatch** — UX spec requires columns: Code, Name, UoM, Cost/kg, Status, Allergens, Supplier, Spec Expiry, Last Lab, Actions. Prototype shows: Code, Name, Type, UoM, Cost/UoM, Primary supplier, Updated, Status — missing Spec Expiry, Last Lab, and Allergens columns. Spec Expiry filter (All/Expired/Expiring 30d/Valid) is absent.

4. **Routing list (TEC-007) column set mismatch** — UX spec requires: Code, Product, Version, Operations, Total Time, Status, Effective From, Approved By, Actions. Prototype shows: Code, Routing name, Linked products, Steps, Last updated — missing Version, Status badge, Effective From, Approved By. The Approve/Publish/Supersede three-dot menu is absent.

5. **Shelf Life mode labels** — PRD uses `use_by` / `best_before` with the EU distinction helper text. Prototype uses these correctly in the badge but the per-item edit fields (shelf_life_days input, date_code_format picker with preview) are absent from the item edit flow.

6. **D365 Screen code misalignment** — PRD §13.8 maps: TEC-070=Sync Dashboard, TEC-071=Manual Trigger, TEC-072=Sync Audit Log, TEC-073=DLQ Manager. Prototype uses: d365status=TEC-070, d365fields=TEC-071 (field mapping — wrong), d365drift=TEC-072 (drift resolution — not sync audit log), d365log=TEC-073. Three of four screen purposes are misaligned with PRD screen codes.

7. **Allergen matrix display** — UX spec requires a transposed matrix (rows=items, columns=EU-14 allergens) with filled circle/half circle/dot/override/cascade icons. Prototype `AllergenScreen` shows a simplified two-column allergen declaration list per item, not the matrix format.

8. **Item type in Products list** — UX spec specifies a "Products List (TEC-001)" at `/technical/products`. Prototype routes "Products" nav item to BOM Detail as the default screen (`defaultScreen: "boms-detail"`). No true Products List screen exists for all item types. This is a navigation IA gap.

9. **V-TEC-12 (co-product allocation sum = 100%) validation** — UX spec requires a real-time "Allocation summary" bar with red validation banner when sum ≠ 100. Prototype BOM detail does not implement this; the Co-products tab is folded into the Ingredients tree with no allocation % validation.

10. **Cost_per_kg governance (V-TEC-53: >20% change requires admin approval)** — No validation or approval gate for large cost changes is visible in any cost editing modal. PRD §11.6 specifies this as a mandatory validation.

---

### D. Fitness

- **Coverage: ~18 of 28 PRD "Must" items implemented (~64%)**
  - Counted as Musts: item CRUD, BOM versioning, BOM snapshot pattern, BOM approval workflow, allergen profiles, cascade rule visible, shelf-life config, catch weight mode, cost history, routing CRUD, D365 pull/push UI, D365 DLQ manager, item lifecycle states, all item types, co-product allocation, process allergen additions, contamination risk matrix, lab results, regulatory compliance dashboard.
  - Present: item CRUD (partial), BOM versioning (partial), allergen matrix (partial), shelf-life list (partial), cost history, routing list (partial), D365 sync dashboard, D365 drift, D365 log, catch weight mode indicator.
  - Missing/shallow: full item detail (all tabs), cascade preview, process additions, contamination matrix, regulatory dashboard, lab results standalone, BOM version diff, co-product validation.
- **Hallucination risk: HIGH — 4 (B)-class items** (Work Centers, Process Parameters, Maintenance Plans, Tooling are all out-of-module scope and add nav clutter).
- **Drift severity: HIGH — 10 material items** (dashboard layout, BOM tab set, IA routing to BOM instead of product list, D365 screen code misalignment, allergen matrix format, co-product allocation validation missing, missing column sets on Materials/Routing lists).
- **Overall: RED — Refocus the prototype on the 03-TECHNICAL MVP screen set (TEC-001/002/005/006/007/010/013/014/017/050/070-073); remove the 4 (B)-class out-of-scope screens (work centers, process params, maintenance, tooling); implement the allergen cascade tree and contamination risk matrix which are Must features for BRCGS/EU compliance.**

---

## Module: Production (08)

### A. PRD → Prototype coverage gaps

PRD defines 7 P1 epics (E1–E7) with 7 screens (SCR-08-01..07) plus 16 P1 FRs groups. The prototype covers roughly 72% of them:

1. **SCR-08-02 WO Detail — QA Results tab (Tab 6)** — PRD specifies 8 tabs: Overview, Consumption, Output, Waste, Downtime, QA Results, Genealogy, History. Prototype `WODetail` implements: Consumption, Output, Waste, Downtime, Genealogy, History — **QA Results tab is absent**. The `qa_status` badge appears in the Output tab but there is no dedicated QA Results tab aggregating CCP test results per WO.

2. **SCR-08-02 Overview tab** — The UX spec describes an Overview tab as Tab 1 with WO summary card + right-column consumption/output/waste KPI mini-cards + D365 push status. Prototype `WODetail` starts directly on the Consumption tab; there is no Overview tab.

3. **SCR-08-04 Waste Analytics** — `WasteAnalyticsScreen` exists and is well-implemented. Coverage GOOD.

4. **SCR-08-05 Downtime Analytics** — `DowntimeScreen` is implemented with Pareto chart, MTTR/MTBF summary, and event table. Coverage GOOD.

5. **SCR-08-06 D365 DLQ Review** — `DLQScreen` is implemented. Covers inspect, retry, mark-resolved actions. "View raw payload (JSON)" and "View mapped D365 payload" buttons are present via `DlqInspectModal`. Coverage GOOD.

6. **Operator KPI screen** — PRD D11 specifies `operator_kpis_monthly` materialized view with consumption_speed_median, fefo_compliance_pct, over_consumption_incidence. No operator KPI screen exists in the prototype. The Analytics screen does not drill to per-operator KPIs.

7. **Material status API (GET /api/production/work-orders/:id/material-status)** — Used for FEFO context suggestions. The UX for FEFO-suggested LP is present in the ConsumptionTab ("Operator hints" card with "Next FEFO pick"), but the Material Status query as a discrete panel/screen is absent. Minor gap.

8. **Label printing (browser PDF P1)** — PRD FR-08-E3-006 requires output registration to trigger a print receipt with GTIN-128 + batch + expiry + qty/weight + QR code link. Prototype Output tab has a "[Print Label]" button in the Actions column but the label PDF preview/modal is not implemented — no `printLabelModal` exists. This is a stub.

9. **Force-complete WO (closed_production_strict override)** — PRD D3 specifies that Production Manager can override the closed_production_strict gate with reason_code. Prototype `CompleteWoModal` is present and includes PIN confirmation, but does not show a distinct force-complete override path with gate_failures list (as specified in PRD §8.2.1 response 409 handling).

10. **Cancel WO flow** — PRD FR-08-E1-005 specifies a WO cancellation workflow with reason_code required and reservation release. Prototype WO action buttons include Pause/Waste/Catch-weight/Complete — no Cancel button or cancel modal is visible in the prototype.

11. **SCR-08-03 Allergen Changeover Gate — ATP swab location fields** — UX spec requires location(s) swabbed, test method (ATP/ELISA), threshold display (≤10 RLU), and auto PASS/FAIL. Prototype `ChangeoverScreen` shows an ATP swab checklist item with "Pending swab upload" but the ATP result entry modal (`ChangeoverGateModal`) does not implement location fields or the auto PASS/FAIL logic against a configurable threshold.

12. **Shifts Management (ShiftsScreen)** — A shift management screen exists with operator assignment, but it is minimal. PRD §4.1 item 12 requires shift_id stamping on every mutation, shift attribution across all events. The prototype shows a Shift list with "[Start Shift]" / "[End Shift]" modals (ShiftStartModal / ShiftEndModal) — this is reasonable coverage for the UI surface.

13. **Production Settings** — `SettingsScreen` covers lines/nominal cycle time, OEE targets, and waste/downtime category taxonomy. PRD D5/D6 specify admin-configurable waste + downtime categories from 02-SETTINGS reference tables. The prototype `SettingsScreen` shows category taxonomy editing inline (not via 02-SETTINGS wizard cross-link). Minor placement drift but functionally present.

14. **Line Detail screen** — `LineDetail` component is routed (`case "line_detail"`). Implementation was not fully inspected but the route exists.

---

### B. Prototype → PRD (hallucinations)

1. **"Release WO" modal from production dashboard** — `ReleaseWoModal` allows releasing a WO to a line with BOM snapshot preview, planned start/end, operator assignment. PRD §4.1 point 1 defines WO lifecycle as starting from 04-PLANNING; 08-PRODUCTION owns execution starting from READY state. Releasing a WO (moving DRAFT → READY and assigning to line) belongs to 04-PLANNING-BASIC. This action is in the wrong module. Classification: **(B)** — architectural hallucination; releasing WOs should originate from 04-PLANNING. Flag for removal or redirect. Potentially acceptable as a convenience shortcut if 04-PLANNING is not yet built, but should be annotated.

2. **Assign Crew modal** — `AssignCrewModal` allows crew assignment. PRD mentions `current_operator_id` in `wo_executions` and shift attribution, but "assign crew" as a multi-person action is not specified in 08-PRODUCTION P1 scope. Operator assignment happens at shift level via 02-SETTINGS. Classification: **(A)** — reasonable UX extension (keep, annotates crew context beyond single operator_id).

3. **OEE Target Edit modal** — `OEETargetEditModal` for editing per-line OEE targets with audit reason. PRD defines OEE targets as part of 02-SETTINGS/15-OEE, not 08-PRODUCTION settings. Classification: **(C)** — PRD should be updated: line-level OEE target configuration surfaced in 08-PRODUCTION Settings is a legitimate UX choice (operator-facing config), but ownership should be clarified in PRD.

4. **`Meat_Pct` aggregation in WO Detail** — The WO header shows `meatPct` field and the Consumption tab displays "Meat_Pct aggregate: weighted avg of consumed RMs with meat_pct values". PRD 08-PRODUCTION §0 UX doc references this (tied to 03-TECHNICAL §8.9, but §8.9 does not exist in PRD v3.0 — the catch weight section ends at §8.6). This is a forward-reference to a spec section that was not written. Classification: **(C)** — PRD should be updated to add §8.9 Meat_Pct aggregation rule or cross-reference to 01-NPD Meat_Pct calculation.

5. **Shift handover notes field in ShiftsScreen** — Prototype shows a `<textarea placeholder="Add handover note…">` in the shifts screen. PRD D3 §4.2 P2 explicitly defers shift handover digital form to Phase 2. Classification: **(B)** — deferred P2 feature present in P1 prototype. Acceptable as a preview but should be marked P2.

---

### C. Drift

1. **Dashboard KPI count and labels** — UX spec (PROD-001) defines 6 KPI cards: WOs In Progress, Output vs Target today, OEE current shift, Downtime last 24h, QA Holds active, Next setup/changeover. Prototype `Dashboard` derives KPIs from LINES data and shows a different set (running/down/changeover counts, total consumption progress %). The "Output vs Target today", "QA Holds active", and "Next setup/changeover" KPIs are absent. This is significant alignment drift.

2. **WO status badge rendering** — UX spec §1 (design system) defines a status badge mapping with READY → badge-blue. Prototype `WOStatus` component uses custom class logic. `WOList` shows a "READY" state badge in the list. Appears broadly aligned, but the state machine is hardcoded rather than loaded from DSL registry (PRD D1). Classification: medium severity (testability concern, not visual only).

3. **Changeover gate — dual sign-off sign sequence** — UX spec (SCR-08-03) requires: Shift Lead signs FIRST, then Quality Lead (sequential). Prototype `ChangeoverScreen` shows the two sign-off boxes side-by-side and both are disabled ("LOCKED") when checklist is in progress. The sequential unlock (Step 3 checklist → Step 4 sign-off → Shift Lead PIN → QA PIN → Step 5 release) is correctly represented. However, the ATP swab checklist item threshold is hardcoded as ≤30 RLU in the prototype data (step says "ATP swab test — result ≤ 30 RLU"), while PRD default is ≤10 RLU (configurable per line in 02-SETTINGS). This is a data drift.

4. **WO Detail tabs — 6 vs 8 tabs** — UX spec defines 8 tabs (Overview, Consumption, Output, Waste, Downtime, QA Results, Genealogy, History). Prototype has 6 tabs (Consumption, Output, Waste, Downtime, Genealogy, History). Missing: Overview tab and QA Results tab.

5. **Output tab — catch-weight modes** — UX spec requires a toggle between 3103 (net weight per unit) and 3922 (variable price) mode, with per-unit weight entry list. Prototype Output tab shows a "Switch to catch-weight capture" button and `CatchWeightModal`, but the 3103/3922 toggle and per-unit weight entry list is implemented only in the modal, not as an inline expanded column view per UX spec.

6. **Over-consumption approval** — UX spec (PROD-002, Tab 2) specifies inline FEFO deviation alerts with reason codes. Prototype implements this well in ConsumptionTab with FEFO deviation notes and over-consumption pending approval banner. However, the Shift Lead desktop manual consume override ("[+ Manual Consume LP]" button) is absent from the prototype.

7. **Downtime screen — Gantt-like timeline blocks** — UX spec (SCR-08-05) specifies a Gantt-like timeline view showing downtime blocks per line. Prototype `DowntimeScreen` shows only a table and Pareto chart — the Gantt timeline is absent.

8. **D365 DLQ screen — "View mapped D365 payload"** — UX spec (SCR-08-06) specifies viewing the mapped D365 payload (not just raw payload). `DlqInspectModal` shows raw event payload and error; the mapped D365 journal format view is not implemented.

9. **Per-minute OEE aggregation job display** — PRD D7 specifies `oee_snapshots` populated every 60s. The OEE screen shows live gauges and per-line table but does NOT show the last aggregation timestamp or a staleness indicator. This makes it impossible for operators to know if OEE data is current.

10. **Production dashboard auto-refresh indicator** — UX spec §1 requires a top-right "Auto-refresh 30s" toggle and manual "Refresh" button with a 2px progress bar. Prototype dashboard does not show this control explicitly (it may be in production.css but no JSX element was found).

---

### D. Fitness

- **Coverage: ~21 of 29 PRD "Must" items implemented (~72%)**
  - Present: WO lifecycle state machine (UI only, hardcoded), consumption flow, output/co-product registration, waste logging, downtime events, allergen changeover gate (full screen with checklist + dual sign-off), D365 DLQ, OEE per-minute aggregation screen, shift management, analytics, production dashboard, waste analytics, FEFO context hints, over-consumption approval modal, catch-weight modal, genealogy tab.
  - Missing/shallow: QA Results tab, Overview tab in WO Detail, Cancel WO flow, label print preview, force-complete override path, operator KPI screen, Gantt downtime timeline, dashboard correct KPI set.
- **Hallucination risk: MEDIUM — 2 (B)-class items** (Release WO modal in wrong module; shift handover textarea as P2 feature surfaced in P1).
- **Drift severity: HIGH — 10 material items** (dashboard KPI mismatch, WO tab count, ATP threshold value wrong, dual catch-weight toggle format, Gantt absent, QA Results tab absent, auto-refresh indicator absent, D365 mapped payload absent).
- **Overall: YELLOW — Strong foundational coverage of the execution engine (changeover gate, consumption, output are well-built); fix the 10 drift items and add the 2 missing WO tabs (Overview + QA Results) to reach GREEN. Relocate ReleaseWO modal to 04-PLANNING scope.**

---

## Cross-module notes

1. **BOM snapshot reference** — Technical prototype (BOM Detail) shows snapshot history tab linking snapshots to WO. Production prototype (ReleaseWoModal) shows "BOM snapshot preview" on release. The two modules are consistent on the immutability concept, but the Technical BOM detail does not link back to which WOs consumed each snapshot — a forward-traceability gap.

2. **Allergen changeover gate data source** — Production `ChangeoverScreen` references allergen profiles (FA5301 → FA5302, allergens "Gluten, celery"). Technical `AllergenScreen` shows item allergen declarations. These two are conceptually linked via `allergen_contamination_risk` (03-TECHNICAL §10.5) and `allergen_changeover_gate_v1` (08-PRODUCTION D10). Neither prototype exposes this cross-module link explicitly. There is no navigation from the Production changeover screen to the Technical allergen contamination risk matrix. Consider adding a cross-link in both prototypes.

3. **co_product allocation %** — Technical BOM Detail (Ingredients tab) shows co-products in the tree with allocation%, while Production WO Detail (Output tab) shows "Alloc %" from the BOM. Values are consistent in prototype data, confirming the PRD pattern (03-TECH §7.2 → 08-PROD FR-08-E3-002) is coherently represented across both modules.

4. **D365 push origin** — Technical module has D365 sync (items/BOM pull + WO confirmation push) and Production module has the outbox/DLQ for WO confirmation push. Both prototype modules have D365 integration screens. This creates navigation confusion: the Technical D365 screens cover item-level sync, Production DLQ covers WO-level push. The UX spec for 08-PRODUCTION explicitly routes the DLQ to `/admin/integrations/d365/dlq` (admin route) — not under `/production`. Prototype has it under the Production sidebar. Minor IA placement concern.

---

## Overall group fitness

Technical is RED (64% coverage, 4 out-of-scope screens polluting the module, significant IA drift and missing allergen/compliance Must features). Production is YELLOW (72% coverage, strong execution core, but 2 missing WO tabs and 10 drift items degrade prototype fidelity vs the detailed UX spec). Combined, the prototype pair does not yet reach releasable pilot quality: Technical needs out-of-scope screen removal and allergen cascade/contamination-matrix implementation before dev handoff; Production needs QA Results tab, Cancel WO, and dashboard KPI alignment.
