# Bidirectional PRD ↔ Design Coverage Audit (Modules 03-15)

**Date:** 2026-04-30
**Scope:** 13 modules (03-TECHNICAL through 15-OEE) — bidirectional sweep PRD ↔ UX-spec ↔ Prototype-JSX
**Predecessor:** `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` (covers 00/01/02)
**Method:**
- Direction A: enumerate PRD screen codes / modal contracts / workflow sections → confirm presence in `design/<NN>-*-UX.md` + `_meta/prototype-labels/prototype-index-*.json`
- Direction B: enumerate prototype labels → confirm referenced (by code or feature name) in PRD
- Direction C: spot-check ~3 sections per module for PRD↔UX narrative consistency

---

## 1. Executive Summary

### Coverage matrix per module

| Module | PRD ScreenIDs | UX screens | Prototypes | PRD-coded coverage | Orphan prototypes (B) | Headline finding |
|---|---|---|---|---|---|---|
| 03-TECHNICAL | 33 (TEC-010..073) | ~17 (TEC-001..016, 070..073) | 47 | ~55% (PRD codes ≠ UX codes — divergent numbering) | ~12 | **PRD/UX screen-ID schemas don't match** (PRD `TEC-010` vs UX `TEC-001`). Schema drift > coverage gap |
| 04-PLANNING-BASIC | 0 (no screen-ID column) | 12 (SCREEN-01..12) | 33 | ~70% (named, not coded) | ~5 | PRD has zero screen IDs — all screens referenced by descriptive names only |
| 05-WAREHOUSE | 0 (FR-WH-* only) | 20 (WH-001..020) | 32 | ~75% (concept-level) | ~5 | UX uses WH-NNN, PRD uses FR-WH-NNN — orthogonal axes; concept coverage strong |
| 06-SCANNER-P1 | 14 (SCN-010..090) | 16 (SCN-010..084 incl. variants) | 41 | ~95% — best-aligned module | 2 | Tightly aligned. Sub-screens consistent. PIN setup variants (SCN-011b/c) UX-only |
| 07-PLANNING-EXT | 0 (MODAL-07-NN only) | ~10 (SCR-07-01..N) | 25 | ~65% | ~6 | PRD enumerates 13 modals (MODAL-07-01..13) but only ~9 are prototyped |
| 08-PRODUCTION | 7 (SCR-08-01..07) | 14 (PROD-001..014) | 33 | ~50% | ~7 | UX has 14 screens, PRD specs only 7. UX expanded (line_detail, waste_analytics, dlq) without PRD anchor |
| 09-QUALITY | 18 (QA-001..070 + SCN-070..073) | ~17 (QA-001..014) | 32 | ~85% | ~3 | Strong alignment; UX matches PRD numbering. Some SCN-bridge prototypes orphan |
| 10-FINANCE | 8 (FIN-001..008) | 16 (FIN-001..016 + Settings) | 25 | ~50% | ~8 | UX has FIN-009..016 P2 placeholders not in PRD §8.1 P1 list |
| 11-SHIPPING | 14 (SHP-001..014 + ADMIN-SHP-01/02) | 35+ (SHIP-001..025+) | 41 | ~40% | ~12 | **UX & prototype dramatically over-built vs PRD**. SHIP-022 dashboard, SHIP-019 PackScanner, RMA list missing PRD detail |
| 12-REPORTING | 13 (RPT-001..010 + RPT-HOME/EXPORTS/SAVED) | 14+ (RPT-001..010 + admin) | 28 | ~80% | ~5 | Well-aligned. `regulatory_signoff_modal`, `recipient_group_modal`, `error_log_modal` orphaned |
| 13-MAINTENANCE | 14 dashboards (MNT-001..014) | 17 screens (MAINT-001..017) | 37 | ~60% | ~7 | **PRD enumerates dashboards only**; UX has full screen set (asset list, mWO list, technicians). PRD silent on screen-level UI |
| 14-MULTI-SITE | 10 dashboards (MS-001..010) | 14 screens (MS-NET, MS-SIT, MS-IST, MS-LANE, MS-REP, MS-PRM, MS-ANA, MS-CFG, MS-ACT) | 27 | ~50% | ~10 | **Schema mismatch**: PRD MS-NNN dashboards vs UX MS-XXX (3-letter slugs). Lanes & rate cards prototyped but unspecified in PRD |
| 15-OEE | 5 (OEE-001..003 + OEE-ADM-001/002) | 11 (incl. P2 placeholders) | 27 | ~75% | ~4 | Tight P1 alignment; P2 prototype set (anomaly, equipment health, TV) ahead of PRD detail |

### Key aggregate signals

1. **Schema-ID drift** is the most pervasive issue: 7 of 13 modules use a different screen-numbering schema between PRD and UX (03/04/05/13/14 most severe).
2. **Prototype over-build** (Direction B orphans): 11-SHIPPING, 14-MULTI-SITE, 13-MAINTENANCE most affected — feature surfaces prototyped without PRD anchor.
3. **PRD under-spec for UI** (Direction A gaps): 04-PLANNING-BASIC, 05-WAREHOUSE, 13-MAINTENANCE, 14-MULTI-SITE describe features in narrative + DDL but never enumerate screens.
4. **Best-aligned**: 06-SCANNER-P1 (~95%), 09-QUALITY (~85%), 12-REPORTING (~80%), 15-OEE (~75%).
5. **Worst-aligned**: 11-SHIPPING (~40%), 08-PRODUCTION (~50%), 10-FINANCE (~50%), 14-MULTI-SITE (~50%).

---

## 2. Per-module findings

### Module 03-TECHNICAL

**Evidence:**
- PRD UI surfaces tables: `03-TECHNICAL-PRD.md:459-468` (TEC-010..014, 042); `:535-540` (TEC-020..025); `:661-662` (TEC-030/031); `:761-766` (TEC-040..045); `:808-810` (TEC-050..052); `:852-855` (TEC-060..063); `:943-946` (TEC-070..073). **Total 33 PRD screen IDs**.
- UX file: `design/03-TECHNICAL-UX.md:132-1051` lists `TEC-001..017` + `TEC-070..073`. **Numbering schema differs.**
- Prototype index: `_meta/prototype-labels/prototype-index-technical.json` — 47 entries, including 15 modals.

**Direction A (PRD → design) gaps — HIGH severity:**

| PRD ID | PRD §line | UX equivalent | Prototype | Status |
|---|---|---|---|---|
| TEC-010 Item List | `:463` | TEC-001 (`UX:174`) | `materials_list_screen` (`other-screens.jsx:432`) | NUMBERING MISMATCH |
| TEC-011 Item Create Wizard | `:464` | TEC-002 modal (`UX:231`) | `product_create_modal` (`modals.jsx:22-136`) | NUMBERING MISMATCH |
| TEC-014 Bulk Import CSV | `:468` | (absent) | (absent — no bulk-import-csv prototype) | **BLOCKER** PRD-only, no design |
| TEC-023 BOM Version Diff | `:538` | (absent) | `bom_versions_tab` partial diff (`bom-detail.jsx:373-468`) | MED — diff UI implicit, no dedicated screen |
| TEC-025 BOM Snapshots Viewer | `:540` | (absent) | (absent) | **BLOCKER** |
| TEC-031 Regulatory Compliance Dashboard | `:662` | (absent) | (absent) | **BLOCKER** |
| TEC-043 Contamination Risk Matrix | `:765` | (mentioned 10) | `allergen_matrix_screen` (`other-screens.jsx:111-159`) | OK (label↔concept) |
| TEC-044 Allergen Manual Override Audit | `:766` | (absent) | (absent — only `allergen_declaration_modal`) | HIGH |
| TEC-045 Lab Results Log | `:766` | (absent) | (absent) | **BLOCKER** |
| TEC-052 Cost Import from D365 | `:810` | (absent) | (absent) | **BLOCKER** |
| TEC-060/061/062/063 Routing | `:852-855` | TEC-007/008/008a (`UX:516-647`) | `routings_screen`, `routing_step_add_modal` | OK |
| TEC-072 Sync Audit Log / TEC-073 DLQ | `:945-946` | TEC-070..073 panel (`UX:950`) | `d365_log_screen`, `d365_drift_screen` | NUMBERING MISMATCH (PRD 070..073 ≠ proto 070..073-as-screens) |

**Direction B (design → PRD) orphans — HIGH severity:**

| Prototype label | File:lines | Concept in PRD? |
|---|---|---|
| `eco_change_request_modal` | `modals.jsx:352-414` | **PRD §4.4 line 108: "ECO… Phase 2"** — out-of-scope marker; orphan in P1 |
| `eco_approval_modal` | `modals.jsx:417-455` | Same — Phase 2 only |
| `tooling_screen` | `other-screens.jsx:314-352` | **NOT IN PRD** at all — orphan |
| `material_detail_screen` | `other-screens.jsx:483-605` | Concept yes (§5.1 items), but no UX-detail anchor |
| `nutrition_screen` (in 03-TECH index) | `other-screens.jsx:608-661` | Belongs to 01-NPD per §10 cascade — INDEX MIS-TAG candidate |
| `costing_screen` (in 03-TECH index) | `other-screens.jsx:664-712` | Belongs to 10-FINANCE per §11 dual ownership — INDEX MIS-TAG |
| `cost_history_screen` | `other-screens.jsx:761-820` | OK (§11 cost_per_kg history TEC-050) |
| `traceability_screen` | `other-screens.jsx:823-901` | NOT IN 03-TECH PRD; lives in 05-WAREHOUSE §8 lot genealogy |

**Direction C — sample contradictions:**
- §6.5 PRD has TEC-011 as "Item Create Wizard 4-step"; prototype `product_create_modal` (`modals.jsx:22-136`) implements it as a modal not a page. UX TEC-002 calls it "Product Detail / Modal". OK functionally, mismatch in surface type.
- §10 PRD allergen cascade lists ATP swab tracking; UX TEC-010..012 has Allergen panel but no ATP. ATP UX in 09-QUALITY only.

---

### Module 04-PLANNING-BASIC

**Evidence:**
- PRD: `04-PLANNING-BASIC-PRD.md` — **zero screen-ID column** in any table. Components named only by descriptive name (e.g., `:570 SupplierForm`, `:851 WOForm`, `:860 CascadePreviewModal`).
- UX: `design/04-PLANNING-BASIC-UX.md:191-928` — 12 SCREEN-01..12.
- Prototype index: 33 entries.

**Direction A gaps — MED:**

| PRD reference | UX | Prototype | Status |
|---|---|---|---|
| §6.2 PO 3-step fast flow (`PRD:508-541`) | SCREEN-02/03 | `po_fast_flow_wizard` (`modals.jsx:21-179`) | OK |
| §7 TO `TOForm` (`PRD:644`) | SCREEN-04/05 | `to_create_edit_modal` (`modals.jsx:697-845`) | OK |
| §9 `CascadePreviewModal` (`PRD:860`) | SCREEN-09 cascade DAG | `cascade_preview_modal` + `plan_cascade_dag` | OK |
| §10 `OverrideReservationModal` (`PRD:924`) | SCREEN-10 reservation panel | `reservation_override_modal` (`modals.jsx:505-549`) | OK |
| §11 `SequencingPreviewModal` (`PRD:998`) | SCREEN-11 sequencing | `sequencing_apply_confirm_modal` + `plan_sequencing` | OK |
| §6.4 PO → 05-WH handoff (`PRD:551`) | (absent — flow narrative) | (absent — relies on 05-WH) | OK boundary |

**Direction B orphans — LOW:**

| Prototype | Concept in PRD? |
|---|---|
| `ship_to_modal` | §6 PO ship-to addresses — implicit yes |
| `draft_wo_review_modal` (`modals.jsx:937-1046`) | **NOT explicit** — PRD §9.1 mentions "draft" status but no review modal contract |
| `cycle_check_warning_modal` | §9 cycle detection cited; modal contract absent in PRD |
| `hard_lock_release_confirm_modal` | §10 hard-lock concept, but release UI not specified |
| `plan_d365_queue` (`other-screens.jsx:510-648`) | §13 INTEGRATIONS stage 1 — referenced; D365 queue UI orphan |

**Direction C — sample contradictions:**
- PRD §9 WO state machine — UX SCREEN-07 implements all states; OK.
- PRD §11 sequencing "before/after comparison + changeover count delta"; prototype `sequencing_apply_confirm_modal` (`modals.jsx:1053-1100`) renders a single-list confirm. **CONTRADICTION** — delta widget missing.

---

### Module 05-WAREHOUSE

**Evidence:**
- PRD: `05-WAREHOUSE-PRD.md` — uses **`FR-WH-001..030+`** (functional requirements), **NOT screen IDs**. UX surfaces named: `:557 LPSplitModal`, `:668 GRNFromPOWizard`, etc.
- UX: `design/05-WAREHOUSE-UX.md:132-1156` — `WH-001..020`.
- Prototype index: 32 entries (haiku variant). `prototype-index-warehouse-sonnet.json` is parallel re-translation of same prototypes.

**Direction A gaps — MED:**

| PRD ref | UX | Prototype | Status |
|---|---|---|---|
| `FR-WH-001` LP numbering (`:489`) | WH-001/003 | `warehouse_dashboard`, `lp_detail_page` | OK |
| `FR-WH-006` GRN 3-step (`:583`) | WH-004-PO | `grn_from_po_wizard_3step` | OK |
| `FR-WH-008` GS1 GRN line filling | (implicit WH-004-PO) | (no dedicated GS1 picker prototype) | LOW — auto-fill behavior, not a screen |
| `FR-WH-013` Location capacity (P2) | WH-018 hierarchy (read-only) | `locations_hierarchy_browser` (read-only) | OK (P2) |
| `FR-WH-019` EPCIS events (P2) | (absent) | (absent) | OK (P2) |
| `FR-WH-024` Shelf life rules / customer | (absent — concept buried in 11-SHIPPING) | (absent in 05-WH proto) | HIGH — owned by 05-WH per `:1135` but no UI surface |

**Direction B orphans — LOW:**

| Prototype | PRD concept |
|---|---|
| `force_unlock_scanner_modal` (`modals.jsx:1140-1159`) | §6.6 LP locking; admin override UI not explicit in PRD |
| `criticality_override_modal` | belongs to 13-MAINTENANCE per §11 maintenance — INDEX MIS-TAG check |
| `state_transition_confirm_modal` | §6.1 LP state machine — generic; PRD doesn't enumerate confirm UI |
| `cycle_count_quick_adjustment` | §6 mentions cycle count; PRD says "P2 cycle count execute" — orphan-in-P1 |

**Direction C:**
- §6.1 LP lifecycle workflow-as-data; UX WH-003 LP detail correctly shows all states. OK.
- §6.4 LP split: PRD says split is operator+optional destination; prototype `lp_split_modal` (`modals.jsx:447-506`) requires destination input. **CONTRADICTION** — destination should be optional per PRD.

---

### Module 06-SCANNER-P1

**Evidence:**
- PRD: `06-SCANNER-P1-PRD.md:518-548` — explicit screen catalog (SCN-010..090). 14 IDs.
- UX: `design/06-SCANNER-P1-UX.md:181-690` — fully aligned schema (SCN-010..084 + sub-screens).
- Prototype index: 41 entries — `flow-receive`, `flow-pick`, `flow-consume`, `flow-register`, `flow-other`, etc.

**Direction A — best-aligned module. Minimal gaps:**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| SCN-010..012 | UX:212-289 | `login_screen`, `pin_screen`, `site_select_screen` | OK |
| SCN-020/030/040 (E2 Receive) | UX:327-453 | `po_list_screen`..`po_done_screen`, `to_*`, `putaway_*` | OK |
| SCN-031 / SCN-060 | UX:454-506 | `move_screen`, `split_scan_screen`, `split_qty_screen` | OK |
| SCN-050 (Pick) | UX:507-545 | `pick_wo_list_screen`, `pick_list_screen`, `pick_scan_screen` | OK |
| SCN-080/081 Consume-to-WO | UX:546-609 | `wo_list_screen`, `wo_detail_screen`, `wo_execute_screen`, `consume_scan_screen` | OK |
| SCN-082/083/084 | UX:610-672 | `output_screen`, `coproduct_screen`, `waste_screen` | OK |
| SCN-090 Offline (P2) | (absent) | (absent — Phase 2) | OK (P2 deferred) |
| SCN-070..073 QA | UX boundary to 09-QA | `qa_list_screen`, `qa_inspect_screen`, `qa_fail_reason_screen` | OK |

**Direction B orphans — LOW:**

| Prototype | PRD coverage |
|---|---|
| `pin_screen` SCN-011b/c First-time setup + change | UX:240-261 covers; PRD `:524` mentions "PIN button" not setup variants. **PRD UPDATE NEEDED** to enumerate SCN-011b/c |
| `language_sheet` (`modals.jsx:182-212`) | §FR-SC-FE-010 (`:587`) i18n — **OK** |
| `inquiry_screen` (`flow-other.jsx:391-438`) | NOT IN PRD — full inquiry workflow orphan |
| `block_fullscreen` (`modals.jsx:277-298`) | §D9 error recovery (`:428`) per-severity blocker — **OK** |

**Direction C:** PRD §D5 3-method input parity; prototypes consistently expose camera + keypad + manual — OK.

---

### Module 07-PLANNING-EXT

**Evidence:**
- PRD: `07-PLANNING-EXT-PRD.md` — no screen IDs. References modals: `MODAL-07-01..07-04` (`:543`, `:1295`). Sections: `:248 SCR-07-01 Scheduler Dashboard`.
- UX: `design/07-PLANNING-EXT-UX.md:248-700+` — uses SCR-07-NN.
- Prototype index: 25 entries.

**Direction A gaps — HIGH:**

| PRD ref | UX | Prototype | Status |
|---|---|---|---|
| MODAL-07-01 Run Scheduler (`UX:428`) | yes | `run_scheduler_modal` (`modals.jsx:21-95`) | OK |
| MODAL-07-03 Assignment Override (`PRD:543`) | yes | `override_assignment_modal` | OK |
| MODAL-07-04 Disposition timeout extend (`PRD:1297`) | yes | `disposition_decision_modal` | OK |
| §1.4 Forecast bridge (P2) | UX has forecast screen | `pext_forecasts_screen` | OK |
| §7.2 Allergen Optimizer | UX:N/A explicit | `pext_matrix_editor` | OK |
| §7.4 Disposition Bridge (P2) | UX present | `disposition_decision_modal` + `pext_pending_full_page` | OK |
| **Scenario planning** (mentioned `PRD:11`) | UX has scenarios screen | `pext_scenarios` (`scenario-screens.jsx:3-211`) | LOW — scenario UI not specced beyond "what-if deferred P2" |

**Direction B orphans:**

| Prototype | PRD coverage |
|---|---|
| `pext_run_history` (`runhistory-screens.jsx:3-115`) | OQ-EXT-09 dry-run runs as `scheduler_run` row — UI for browsing absent in PRD |
| `pext_run_detail` (`runhistory-screens.jsx:119-260`) | Same — orphan |
| `pext_capacity_projection` (`optimizer-screens.jsx:113-206`) | Hinted §1.4 line capacity but not specified |
| `pext_sequencing` (`sequencing-screens.jsx:3-179`) | Overlaps 04-PLANNING-BASIC sequencing — boundary unclear |
| `request_review_modal` (`modals.jsx:677-696`) | **OQ-EXT-04 (`PRD:401-411`)** mentions "Request Review" button; OK — referenced |
| `forecast_upload_modal` | §7.3 Forecast Bridge — OK |
| `matrix_publish_modal`/`matrix_diff_modal`/`matrix_import_modal` | OQ-EXT-08 single Planner Advanced publish — partial |

**Direction C:** PRD `:203` Gantt drag-drop descoped; UX confirms read-only; prototype `pext_dashboard_gantt` is read-only. OK.

---

### Module 08-PRODUCTION

**Evidence:**
- PRD: `08-PRODUCTION-PRD.md:639-735` — explicit `SCR-08-01..07` (7 screens).
- UX: `design/08-PRODUCTION-UX.md:144-906` — `PROD-001..014` (14 screens).
- Prototype index: 33 entries.

**Direction A gaps — HIGH (UX over-built vs PRD):**

| PRD ID | UX equivalent | Prototype | Status |
|---|---|---|---|
| SCR-08-01 Dashboard | PROD-001 | `production_dashboard`, `line_card` | OK |
| SCR-08-02 WO Detail | PROD-002, PROD-003, PROD-004 | `wo_detail`, `consumption_tab`, `output_tab`, `genealogy_tab`, `history_tab` | OK |
| SCR-08-03 Allergen Changeover Gate | PROD-005 | `changeover_gate_modal`, `changeover_screen` | OK |
| SCR-08-04 Waste Analytics | PROD-010 | `waste_analytics_screen` | OK (renamed) |
| SCR-08-05 Downtime Analytics | PROD-007 | `downtime_screen` | OK |
| SCR-08-06 D365 DLQ | PROD-012 | `dlq_screen`, `dlq_inspect_modal` | OK |
| SCR-08-07 OEE (defers to 15-OEE) | PROD-006 | `oee_screen`, `oee_target_edit_modal` | **BOUNDARY** — UX builds it locally; PRD says 15-OEE owns |
| (no PRD ID) | PROD-008 Shift Mgmt | `shifts_screen`, `shift_start_modal`, `shift_end_modal`, `assign_crew_modal` | **HIGH** orphan — full shift mgmt UX, no PRD anchor |
| (no PRD ID) | PROD-009 Analytics Hub | `analytics_screen` | HIGH orphan |
| (no PRD ID) | PROD-011 Settings | `settings_screen` | HIGH orphan |
| (no PRD ID) | PROD-013 Line Detail | `line_detail` (`new-screens.jsx:212-478`) | HIGH orphan |
| (no PRD ID) | PROD-014 Scanner Reference Cards | (no JSX label match) | MED |

**Direction B orphans — HIGH:**

| Prototype | PRD anchor? |
|---|---|
| `tweaks_panel` (`modals.jsx:389-428`) | No — operator tweaks UI absent in PRD |
| `over_consume_modal` | §D2 over-consumption approval flow — OK |
| `catch_weight_modal` | §D13 catch weight — OK |
| `assign_crew_modal` | NOT IN PRD — orphan |
| `pause_line_modal` / `resume_line_modal` | implicit in WO state machine — OK |

**Direction C:** PRD `:680-697` SCR-08-03 specifies dual sign-off PIN flow + ATP threshold; prototype `changeover_gate_modal` (`modals.jsx:344-364`) is a 20-line stub — **CONTRADICTION**, prototype underbuilt.

---

### Module 09-QUALITY

**Evidence:**
- PRD: `09-QUALITY-PRD.md:947-974` — 16 screen IDs (QA-001..070 + bridges to SCN-070..073, SCN-081).
- UX: `design/09-QUALITY-UX.md:160-738` — QA-001..014.
- Prototype index: 32 entries.

**Direction A gaps — LOW:**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| QA-001..012 | UX:164-674 | full coverage in `dashboard.jsx`, `ncr-screens.jsx`, `holds-screens.jsx`, `inspection-screens.jsx`, `specs-screens.jsx`, `haccp-screens.jsx` | OK |
| QA-013/014 (P2 placeholders) | UX:684-700 placeholders | (absent — P2 OK) | OK |
| QA-022 Sampling plans | QA-008 | `sampling_plans` (`other-screens.jsx:57-114`) | OK |
| QA-052 Complaint+Incident | (absent) | (absent — PRD:31 says stub P1) | LOW |
| QA-070 Allergen Changeover gate evidence view | (absent in QA UX) | — partially in `allergen_dual_sign_modal` | MED |
| SCN-070..073 bridges | yes (06-SCN UX) | `qa_list_screen`, `qa_inspect_screen`, `qa_fail_reason_screen` | OK |

**Direction B orphans — LOW:**

| Prototype | PRD anchor |
|---|---|
| `audit_export_modal` | §5.3 signature evidence — OK |
| `delete_with_reason_modal` | generic destructive — OK |
| `inspection_assign_modal` | implicit in QA-030; PRD doesn't spec assignment UI |
| `audit_trail` page | §5.3 — OK |

**Direction C:** PRD §8.2 spec wizard 3-step (`:953`); UX QA-003a 3-step wizard — OK.

---

### Module 10-FINANCE

**Evidence:**
- PRD: `10-FINANCE-PRD.md:510-525` — explicit FIN-001..008 (8 P1 screens).
- UX: `design/10-FINANCE-UX.md:162-757` — FIN-001..016 + Settings (17 screens, FIN-009..016 marked P2 placeholders).
- Prototype index: 25 entries.

**Direction A gaps — MED (mostly P2 ahead):**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| FIN-001 Dashboard | FIN-001 | `fin_dashboard` | OK |
| FIN-002 Standard Costs | FIN-002 | `fin_standard_costs_list`, `std_cost_create_modal`, `approve_std_cost_modal`, `cost_history_modal`, `supersede_std_cost_modal` | OK |
| FIN-003 WO Cost Summary | FIN-003 | `fin_wo_list`, `fin_wo_detail` | OK |
| FIN-004 Inventory Valuation | FIN-005 | `fin_inventory_valuation`, `fifo_layers_modal` | OK (numbering mismatch) |
| FIN-005 Variance Dashboard | FIN-007/008/010 | `fin_material_variance`, `fin_labor_variance`, `fin_variance_drilldown` | OK split |
| FIN-006 D365 Export Queue+DLQ | FIN-016 | `fin_d365_integration`, `dlq_replay_modal`, `dlq_resolve_modal` | OK |
| FIN-007 Cost Centers / GL mapping | (absent dedicated screen) | `cost_center_gl_mapping_modal` | MED — admin UI scoped to modal only |
| FIN-008 Currency / FX | FIN-006 | `fin_fx_rates`, `fx_rate_override_modal` | OK |
| (no PRD ID) FIN-004 BOM Costing P2 | yes UX | (absent) | OK (P2) |
| (no PRD ID) FIN-009..015 P2 placeholders | yes UX | partial | OK P2 |

**Direction B orphans — MED:**

| Prototype | PRD anchor |
|---|---|
| `bulk_import_csv_modal` | §6 NOT EXPLICITLY but plausible — orphan |
| `period_lock_modal` | **NOT IN PRD** — period locking concept missing entirely from PRD |
| `variance_note_modal` | §FIN-005 root-cause notes — OK |
| `export_report_modal` | §8.2 export — OK |
| `fin_reports` (`other-screens.jsx:1-142`) | §FIN-005 / not explicit — partial |
| `fin_settings` (`other-screens.jsx:362-458`) | "Finance Settings" UX section but no PRD code | LOW |

**Direction C:** PRD §8.1 FIN-002 says "approval modal z PIN re-verification, signature capture"; prototype `approve_std_cost_modal` (`modals.jsx:103-175`) — verify PIN field present (skipped detailed read).

---

### Module 11-SHIPPING

**Evidence:**
- PRD: `11-SHIPPING-PRD.md:971-1001` — 14 SHP-001..014 + 2 admin (ADMIN-SHP-01/02).
- UX: `design/11-SHIPPING-UX.md:166-820+` — 25+ SHIP-NNN screens.
- Prototype index: 41 entries (largest after NPD).

**Direction A gaps — HIGH (numbering schema mismatch + over-build):**

| PRD ID | UX equivalent | Prototype | Status |
|---|---|---|---|
| SHP-001 Customer List | SHIP-001 | `customer_list_page` | OK (numbering off-by-one) |
| SHP-002 Customer Detail | SHIP-002 | `customer_detail_page` | OK |
| SHP-003 SO List | SHIP-005 | `so_list_page` | OK |
| SHP-004 SO Create Wizard | SHIP-006 | `so_create_wizard_modal` | OK |
| SHP-005 SO Detail | SHIP-007 | `so_detail_page` | OK |
| SHP-006 Allergen Conflict Modal | SHIP-009 | `allergen_restriction_modal`, `allergen_override_modal` | OK |
| SHP-007 Allocation Wizard | SHIP-008 | `allocation_global_page`, `allocation_override_modal` | MED — UX is a page, PRD says wizard |
| SHP-008 Wave Picking Builder | SHIP-013 | `wave_builder_page`, `wave_release_modal` | OK |
| SHP-009 Pick List Table | SHIP-012 | `pick_list_page` | OK |
| SHP-010 Packing Workbench | SHIP-017 | `packing_station_workbench_page` | OK |
| SHP-011 Shipment Detail | (no direct SHIP-NNN match) | (split across pages) | MED |
| SHP-012 BOL Preview + Print | (no SHIP code) | `bol_preview_page`, `bol_sign_upload_modal`, `packing_slip_preview_page` | OK |
| SHP-013 RMA List + Detail | SHIP-024/025 | `rma_list_page` | OK |
| SHP-014 Shipping Dashboard | SHIP-022 | `shipping_dashboard` | OK |
| (no PRD) SHIP-003 Shipping Addresses | yes UX:294 | `address_modal` | HIGH orphan |
| (no PRD) SHIP-004 Allergen Restrictions per Customer | yes UX:322 | `allergen_restriction_modal` | OK addressed via SHP-006 |
| (no PRD) SHIP-010 Partial Fulfillment | UX | `partial_fulfillment_modal` | HIGH orphan |
| (no PRD) SHIP-011 SO Cancellation | UX | `so_cancel_modal` | HIGH orphan |
| (no PRD) SHIP-014 Pick Desktop | UX | `pick_detail_supervisor_page` | HIGH orphan |
| (no PRD) SHIP-016 Short Pick | UX | `short_pick_resolve_modal` | HIGH orphan |
| (no PRD) SHIP-018 Pack Scanner | UX | `pack_close_carton_modal` | HIGH orphan |
| (no PRD) Documents Hub | UX SHIP-NNN | `documents_hub_page` | HIGH orphan |
| (no PRD) Carriers list+CRUD | (absent UX section) | `carriers_list_page`, `carrier_create_edit_modal` | HIGH orphan |
| (no PRD) Shipments Delivery Tracker | (absent) | `shipments_delivery_tracker_page` | HIGH orphan |

**Direction B orphans (count):** 12+ prototypes with no PRD anchor (above).

**Direction C:** PRD §10 quality hold soft gate (`:559`); prototype `hold_place_modal` + `hold_release_modal` exist — OK.
PRD `:973` SHP-003 "bulk actions"; UX SHIP-005 has bulk actions; prototypes show table but bulk-action menu unclear — MED.

---

### Module 12-REPORTING

**Evidence:**
- PRD: `12-REPORTING-PRD.md:872-883` — 10 P1 dashboards (RPT-001..010) + RPT-EXPORTS, RPT-SAVED, RPT-SETTINGS.
- UX: `design/12-REPORTING-UX.md:184-784` — full coverage including RPT-HOME catalog screen.
- Prototype index: 28 entries.

**Direction A gaps — LOW:**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| RPT-001..010 | UX | `rpt_factory_overview`, `rpt_yield_by_line`, `rpt_yield_by_sku`, `rpt_qc_holds`, `rpt_oee_summary`, `rpt_inventory_aging`, `rpt_wo_status`, `rpt_shipment_otd`, `rpt_integration_health`, `rpt_rules_usage` | OK 100% |
| RPT-HOME | UX:188 | `rpt_home_dashboard_catalog` | OK |
| RPT-EXPORTS | UX:627 | `rpt_exports_history` | OK |
| RPT-SAVED | UX:666 | `rpt_saved_filters` | OK |
| RPT-SETTINGS | UX:693 | `rpt_settings_tabbed` | OK |
| Scheduled reports (P2 D-RPT-10) | UX:786 modals | `rpt_scheduled_list`, `rpt_scheduled_edit`, `schedule_report_modal` | OK P2 |

**Direction B orphans — LOW:**

| Prototype | PRD anchor |
|---|---|
| `regulatory_signoff_modal` (`modals.jsx:332-378`) | **NOT IN PRD** — regulatory sign-off concept missing |
| `recipient_group_modal` | scheduled reports recipient list — implicit P2 |
| `error_log_modal` | RPT-009 Integration Health — implicit |
| `share_report_modal` | NOT IN PRD — sharing feature orphan |
| `access_denied_modal` | OK — RBAC catch-all |
| `p2_toast_modal` | placeholder |

**Direction C:** PRD §15 dashboards include "Last refresh indicator: Data as of: HH:MM"; prototype includes refresh button — OK.

---

### Module 13-MAINTENANCE

**Evidence:**
- PRD: `13-MAINTENANCE-PRD.md:609-627` — **dashboards only** (MNT-001..014). **Zero mentions of MAINT-NNN screen IDs.**
- UX: `design/13-MAINTENANCE-UX.md:167-740+` — full screen set MAINT-001..017 (asset list, asset detail, WR, mWO, PM, calibration, spares, technicians, LOTO).
- Prototype index: 37 entries.

**Direction A gaps — HIGH (PRD only enumerates dashboards):**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| MNT-001 MWO Worklist | MAINT-007 mWO List | `mwo_list_page` | OK by concept |
| MNT-002 PM Schedule Calendar | MAINT-009/010 | `pm_schedules_list_page`, `pm_month_calendar`, `pm_week_calendar` | OK |
| MNT-003 Calibration Health | MAINT-011 | `calibration_list_page` | OK |
| MNT-004 Spare Parts Stock | MAINT-013 | `spares_list_page` | OK |
| MNT-005 Equipment Health (MTBF/MTTR) | (absent — consumed from 15-OEE) | (absent) | OK boundary |
| MNT-006 Manager Overview | (absent dedicated UX) | `maintenance_dashboard` | OK approx |
| **(no PRD)** MAINT-002 Asset List | UX:209 | `asset_list_page` | **BLOCKER** — full asset master CRUD with no PRD enumeration |
| (no PRD) MAINT-003 Asset Detail | UX:265 | `asset_detail_page` | **BLOCKER** |
| (no PRD) MAINT-004 WR List | UX:302 | `wr_list_page` | HIGH |
| (no PRD) MAINT-005 WR Create Modal | UX:336 | `wr_create_modal` | HIGH |
| (no PRD) MAINT-006 WR Triage Modal | UX:367 | `wr_triage_modal` | HIGH |
| (no PRD) MAINT-008 mWO Detail | UX:437 | `mwo_detail_page` | HIGH |
| (no PRD) MAINT-012 Calibration Detail | UX:615 | `calibration_detail_page` | HIGH |
| (no PRD) MAINT-014 Spare Detail | UX:671 | `spare_detail_page` | HIGH |
| (no PRD) MAINT-015 Technicians List | UX:689 | `technicians_list_page` | HIGH |
| (no PRD) MAINT-016 Technician Detail | UX:717 | `technician_detail_page` | HIGH |
| (no PRD) MAINT-017 LOTO list | UX:730 | `loto_list_page`, `loto_apply_modal`, `loto_clear_modal` | HIGH |

**Direction B orphans:**

| Prototype | PRD anchor |
|---|---|
| `mwo_complete_signoff_modal` | OK §11 V-MNT-04 |
| `task_checkoff_modal` | implicit checklist; PRD §9.6 mwo_checklists — OK |
| `criticality_override_modal` | OK §9.3 equipment.criticality — referenced |
| `downtime_linkage_modal` | §D-MNT-4 auto-MWO from downtime — OK |
| `spare_adjust_modal` | §11 V-MNT-19 — OK |
| `pm_occurrence_skip_modal` | NOT IN PRD — orphan |
| `calibration_cert_upload_modal` | §9.13 calibration_records.certificate — OK |

**Direction C:** PRD §10 §10.1 P1 dashboards — UX maintenance_dashboard renders 6 KPIs aligned with `maintenance_kpis` MV. OK.

---

### Module 14-MULTI-SITE

**Evidence:**
- PRD: `14-MULTI-SITE-PRD.md:545-563` — 10 dashboards MS-001..010.
- UX: `design/14-MULTI-SITE-UX.md:213-1266` — 14 named screens with 3-letter slugs (MS-NET, MS-SIT, MS-IST, MS-LANE, MS-REP, MS-PRM, MS-ANA, MS-CFG, MS-ACT).
- Prototype index: 27 entries.

**Direction A gaps — HIGH (schema mismatch + lanes/rate-cards orphan):**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| MS-001 Sites Overview | MS-NET / MS-SIT | `ms_dashboard`, `ms_sites_list` | OK by concept |
| MS-002 Inter-site TO Status | MS-IST | `ms_ist_list`, `ms_ist_detail`, `ms_ist_create` | OK |
| MS-003 Master Data Sync | MS-MDS | `ms_master_data_sync` | OK |
| MS-004 Replication Queue | MS-REP | `ms_replication_queue` | OK |
| MS-005 Cross-site Benchmark (P2) | MS-ANA | `ms_analytics` | OK P2 |
| MS-006..009 P2 dashboards | (mostly absent) | (absent) | OK P2 |
| MS-010 Site Activation Dashboard | MS-ACT | `ms_activation_wizard` | OK |
| **(no PRD)** Transport Lanes | MS-LANE / MS-LANE-D | `ms_lanes_list`, `ms_lane_detail`, `lane_create_modal`, `rate_card_upload_modal` | **BLOCKER** — full lanes module orphan |
| (no PRD) Site Permissions | MS-PRM | `ms_permissions`, `permission_bulk_assign_modal` | HIGH — D-MS-11 hints, no UI spec |
| (no PRD) Site Config Overrides | MS-SIT-CFG | `site_config_override_modal` | HIGH |
| (no PRD) Conflict Resolution | MS-CONF modal | `conflict_resolve_modal` | HIGH |
| (no PRD) Site Decommission | (UX not enum.) | `site_decommission_modal` | HIGH |
| (no PRD) Promote env modal | (absent UX) | `promote_env_modal` | HIGH — environment promote orphan |
| (no PRD) Activation/Rollback confirm | (covered by MS-ACT) | `activation_confirm_modal`, `rollback_confirm_modal` | OK by D-MS-14 (`:300`) |

**Direction B orphans:** 8+ as above.

**Direction C:** PRD §6.4 site_id NULL = default site backward compat; UX MS-ACT activation wizard properly handles 3-step migration — OK.

---

### Module 15-OEE

**Evidence:**
- PRD: `15-OEE-PRD.md:948-966` — 3 P1 screens (OEE-001..003) + 2 admin support routes + 7 P2 routes.
- UX: `design/15-OEE-UX.md:250-1011` — OEE-001..003, OEE-ADM-001/002, OEE-M-001/002, OEE-P2-A..D placeholders.
- Prototype index: 27 entries.

**Direction A — well aligned:**

| PRD ID | UX | Prototype | Status |
|---|---|---|---|
| OEE-001 Per-line trend | OEE-001 | `oee_line_trend_page` | OK |
| OEE-002 Per-shift heatmap | OEE-002 | `oee_shift_heatmap_page` | OK |
| OEE-003 Per-day summary | OEE-003 | `oee_daily_summary_page` | OK |
| OEE-ADM-001 Alert Thresholds | OEE-ADM-001 | `oee_settings_page` | OK |
| OEE-ADM-002 Shift Configs | OEE-ADM-002 | `oee_shift_configs_page` | OK |
| OEE-M-001/002 modals | UX | `annotate_downtime_modal`, `export_oee_modal` | OK |
| /oee/anomalies (P2) | OEE-P2-A | `oee_anomaly_detection_page` | OK P2 |
| /oee/equipment-health (P2) | OEE-P2-B | `oee_equipment_health_page` | OK P2 |
| /oee/pareto (P2) | OEE-P2-C | `oee_downtime_pareto_page` (P1 placement?), `six_big_losses_tab` | MED — pareto in P1 dashboard.jsx tab |
| /oee/tv (P2) | OEE-P2-D | `oee_tv_dashboard_page` | OK P2 |
| /oee/forecast (P3) | (absent) | (absent) | OK |
| /oee/benchmark (P2) | (absent) | (absent) | OK |
| /oee/rules-config (P2) | (absent UX) | (absent prototype) | LOW — admin UI absent both sides |

**Direction B orphans — LOW:**

| Prototype | PRD anchor |
|---|---|
| `changeover_tab` (`dashboard.jsx:308-390`) | §1 changeover events (read 08-PROD); §15 PRD doesn't enumerate changeover-specific dashboard | LOW |
| `cell_drill_modal`, `request_edit_modal`, `delete_override_modal` | implicit admin overrides |
| `compare_weeks_modal`, `acknowledge_anomaly_modal`, `auto_refresh_pause_modal` | UX-only ergonomics |
| `oee_availability_drilldown_page`, `oee_performance_drilldown_page`, `oee_quality_drilldown_page` | drill-down depth not enumerated in PRD §15 |

**Direction C:** PRD `:18` D-OEE-4 TV dashboard P2; prototype `oee_tv_dashboard_page` is a placeholder shell — OK alignment.

---

## 3. Cross-cutting findings

### CC-1: Screen-ID schema drift between PRD and UX (7/13 modules)
PRDs emerged before UX specs in many cases; UX team chose its own numbering schema. Modules with conflicting numbering: 03-TECHNICAL (TEC-010+ vs TEC-001+), 11-SHIPPING (SHP- vs SHIP-), 13-MAINTENANCE (MNT- dashboards only vs MAINT- screens), 14-MULTI-SITE (MS-NNN vs 3-letter MS-XXX). Resolution: pick one schema per module and update the other.

### CC-2: PRD enumerates dashboards only (4/13 modules)
13-MAINTENANCE and 14-MULTI-SITE PRDs only enumerate dashboards (MNT-001..014, MS-001..010). The actual screen-level UI (asset CRUD, mWO detail, lanes, permissions, configs) is fully prototyped + UX-spec'd but never anchored in PRD. Resolution: extend PRD §screens with screen-level catalog.

### CC-3: Prototype over-build vs PRD (Direction B orphans)
11-SHIPPING (~12 orphans), 14-MULTI-SITE (~10), 13-MAINTENANCE (~7), 08-PRODUCTION (~7), 10-FINANCE (~8). Risk: build-and-discard or PRD-vs-implementation drift in Phase E.

### CC-4: PRD-only with no design (Direction A blockers)
Bulk Import CSV (TEC-014), BOM Snapshots Viewer (TEC-025), Cost Import from D365 (TEC-052), Lab Results Log (TEC-045), Regulatory Compliance Dashboard (TEC-031). Phase E will need to either spec these screens or remove from PRD.

### CC-5: Mis-tagged prototypes
- `nutrition_screen` and `costing_screen` exist in both `prototype-index-technical.json` and `prototype-index-npd.json` (NPD has actual specced screens). 03-TECH likely mis-tagged (analogous to D8 finding for 02-SETTINGS).
- `traceability_screen` in `prototype-index-technical.json` belongs to 05-WAREHOUSE genealogy.

### CC-6: Modal contracts under-specified
07-PLANNING-EXT enumerates `MODAL-07-01..04` in PRD. Other modules use prototype labels or generic names. Same MODAL-SCHEMA contract gap noted in `2026-04-30-ux-prd-plan-gap-backlog.md` Cross-cutting #1 — applies to **all 13 modules audited here too**.

### CC-7: Boundary blurring (PROD vs OEE; PEXT vs PLN-BASIC; QA vs PROD changeover)
- 08-PRODUCTION UX builds OEE locally (PROD-006 + `oee_screen` + `oee_target_edit_modal`) while PRD defers to 15-OEE.
- 07-PLANNING-EXT prototypes sequencing while 04-PLANNING-BASIC also has sequencing.
- Allergen changeover gate spans 08-PROD §SCR-08-03 + 09-QA §QA-070 + scanner SCN-081. Triple ownership unclear.

---

## 4. Severity-ranked top-20 issues

| # | Severity | Module | Issue | Evidence |
|---|---|---|---|---|
| 1 | BLOCKER | 13-MAINTENANCE | PRD has zero screen-level IDs (only dashboards MNT-001..014). 9+ MAINT-NNN screens (asset, WR, mWO, calibration, spares, technicians, LOTO) prototyped without PRD anchor | `13-MAINTENANCE-PRD.md:605-627` vs `design/13-MAINTENANCE-UX.md:167-740` |
| 2 | BLOCKER | 14-MULTI-SITE | Transport Lanes + Rate Cards fully prototyped (4 entities) — zero PRD coverage | `prototype-index-multi-site.json` lines `lane_*`, `rate_card_*`; `14-MULTI-SITE-PRD.md` no lane mention |
| 3 | BLOCKER | 11-SHIPPING | UX/prototype carries 12+ screens beyond PRD §15 catalog: SHIP-003 Addresses, SHIP-010 Partial Fulfillment, SHIP-011 SO Cancel, SHIP-014 Pick Desktop, SHIP-016 Short Pick, SHIP-018 Pack Scanner, Carriers CRUD, Shipments Tracker | `11-SHIPPING-PRD.md:971-1001` (14 IDs) vs `design/11-SHIPPING-UX.md:166-820` (25+) |
| 4 | BLOCKER | 03-TECHNICAL | TEC-014 Bulk Import CSV, TEC-025 BOM Snapshots, TEC-031 Regulatory Compliance Dashboard, TEC-045 Lab Results Log, TEC-052 D365 Cost Import — all in PRD, no UX, no prototype | `03-TECHNICAL-PRD.md:468,540,662,766,810` |
| 5 | BLOCKER | 03-TECHNICAL | Numbering schema diverges: PRD `TEC-010..073` vs UX `TEC-001..017+070..073`. No bidirectional traceability | `03-TECHNICAL-PRD.md:463-946` vs `design/03-TECHNICAL-UX.md:132-1051` |
| 6 | HIGH | 08-PRODUCTION | Shift Mgmt (PROD-008), Analytics (PROD-009), Settings (PROD-011), Line Detail (PROD-013) prototyped + UX-spec'd, no PRD SCR-08-NN ID | `design/08-PRODUCTION-UX.md:658-906` vs `08-PRODUCTION-PRD.md:639-735` (only SCR-08-01..07) |
| 7 | HIGH | 08-PRODUCTION | SCR-08-03 Allergen Changeover Gate PRD specs full dual sign-off + ATP + checklist; prototype `changeover_gate_modal` is 20-line stub | `08-PRODUCTION-PRD.md:680-697` vs `production/modals.jsx:344-364` |
| 8 | HIGH | 04-PLANNING-BASIC | PRD has zero screen IDs at all; 12 SCREEN-01..12 in UX with no PRD code mapping | `design/04-PLANNING-BASIC-UX.md:191-928`; PRD uses descriptive component names only |
| 9 | HIGH | 07-PLANNING-EXT | `pext_run_history` + `pext_run_detail` orphan — OQ-EXT-09 says runs persist as `scheduler_run` row, but PRD never specs the run-history browser UI | `prototype-index-planning-ext.json` lines `pext_run_*`; `07-PLANNING-EXT-PRD.md:1295-1297` |
| 10 | HIGH | 03-TECHNICAL | `eco_change_request_modal` + `eco_approval_modal` prototyped despite PRD §4.4 line 108 declaring ECO out-of-scope Phase 2 | `prototype-index-technical.json`; `03-TECHNICAL-PRD.md:108` |
| 11 | HIGH | 14-MULTI-SITE | `promote_env_modal`, `permission_bulk_assign_modal`, `site_config_override_modal`, `conflict_resolve_modal`, `site_decommission_modal` all orphans vs PRD | `prototype-index-multi-site.json:472-688` |
| 12 | HIGH | 10-FINANCE | `period_lock_modal` orphan — period-locking concept missing entirely from PRD | `finance/modals.jsx:615-647`; absent from `10-FINANCE-PRD.md` |
| 13 | HIGH | 03-TECHNICAL | `tooling_screen` orphan — tooling concept absent from PRD | `prototype-index-technical.json` `tooling_screen`; PRD never mentions tooling |
| 14 | HIGH | 13-MAINTENANCE | `pm_occurrence_skip_modal` orphan — PM skip flow not in PRD §9.4 | `prototype-index-maintenance.json` `pm_occurrence_skip_modal` |
| 15 | MED | 05-WAREHOUSE | `lp_split_modal` requires destination but PRD `FR-WH-002` says destination optional | `05-WAREHOUSE-PRD.md:495` vs `warehouse/modals.jsx:447-506` |
| 16 | MED | 08-PRODUCTION | UX builds OEE locally (PROD-006 + `oee_screen` + `oee_target_edit_modal`) while PRD §SCR-08-07 defers to 15-OEE | `08-PRODUCTION-PRD.md:733-735` vs `design/08-PRODUCTION-UX.md:562-611` |
| 17 | MED | 04-PLANNING-BASIC | `sequencing_apply_confirm_modal` lacks before/after delta widget specified in PRD §11 | `04-PLANNING-BASIC-PRD.md:998` vs `planning/modals.jsx:1053-1100` |
| 18 | MED | 12-REPORTING | `regulatory_signoff_modal` + `share_report_modal` orphan vs PRD | `reporting/modals.jsx:332-378, 258-282`; PRD never mentions regulatory sign-off |
| 19 | MED | 03-TECHNICAL | `traceability_screen`, `nutrition_screen`, `costing_screen` mis-tagged in `prototype-index-technical.json` | belongs to 05-WH/01-NPD/10-FIN respectively |
| 20 | LOW | 15-OEE | Pareto loss chart appears in P1 dashboard tab `six_big_losses_tab` while PRD lists `/oee/pareto` as P2 only | `15-OEE-PRD.md:962` vs `oee/dashboard.jsx:200-306` |

---

## 5. Effort estimate

### Spec-only effort (PRD + UX reconciliation, no implementation)

| Module | Spec-only effort | Spec+impl effort |
|---|---|---|
| 03-TECHNICAL | 2.5 pd (renumber + add 5 missing screens to UX or remove from PRD; fix mis-tags) | 8-10 pd (build TEC-014/025/031/045/052) |
| 04-PLANNING-BASIC | 1 pd (add screen IDs to PRD §screens table) | 1.5 pd (delta widgets, draft-WO modal contract) |
| 05-WAREHOUSE | 0.75 pd (reconcile FR-WH ↔ WH-NNN; add shelf-life/customer rules screen) | 2 pd |
| 06-SCANNER-P1 | 0.25 pd (add SCN-011b/c sub-screens to PRD; document SCN-inquiry) | 0.5 pd |
| 07-PLANNING-EXT | 1 pd (add run-history/scenarios/capacity-projection sections) | 3 pd |
| 08-PRODUCTION | 1.5 pd (add SCR-08-08..14 for shift/analytics/settings/line-detail) | 5 pd (spec sign-off rebuild + boundary cleanup) |
| 09-QUALITY | 0.5 pd (QA-070 evidence view; complaint detail) | 1 pd |
| 10-FINANCE | 1 pd (add period_lock spec; FIN-007 dedicated CC/GL screen) | 2 pd |
| 11-SHIPPING | 2.5 pd (add 12+ missing PRD entries OR rationalize UX scope) | 8-12 pd |
| 12-REPORTING | 0.5 pd (regulatory_signoff + share + recipient_group spec) | 1 pd |
| 13-MAINTENANCE | 2.5 pd (add §screens with MAINT-001..017 enumeration) | 6-8 pd (PRD-impl alignment) |
| 14-MULTI-SITE | 2 pd (add Lanes + Rate Cards + Permissions + Configs sections) | 6-8 pd (lanes module is sub-module's worth of work) |
| 15-OEE | 0.5 pd (move Pareto P1↔P2 decision; rules-config UI scope) | 1 pd |
| **TOTAL** | **~16.5 pd spec-only** | **~45-60 pd spec+impl** |

### Recommended sequencing
1. **Wave 0 (decisions, ~1 pd):** resolve schema-ID drift policy globally; decide build-vs-rationalize for 11-SHIPPING + 14-MULTI-SITE + 13-MAINTENANCE over-built screens.
2. **Wave 1 (PRD reconciliation, ~16 pd parallelizable):** 13 PRD writers × 0.5–2.5 pd each.
3. **Wave 2 (impl gaps):** prioritize blockers from §4 top-20 (rows 1–5).

---

## 6. Open questions

1. **Schema-ID policy** — adopt UX numbering as canonical, or PRD numbering? Affects 7 modules.
2. **11-SHIPPING over-build** — keep 25-screen UX (and expand PRD) vs prune to PRD's 14? Estimated 8-12 pd swing.
3. **13-MAINTENANCE PRD scope** — does PRD intentionally enumerate dashboards only and defer screen catalog to UX, or is this an oversight? If intentional, document the convention.
4. **14-MULTI-SITE Transport Lanes** — is this in scope for Phase E or P2-deferred? Major gap if P1.
5. **Mis-tagged prototypes in 03-TECHNICAL** — confirm `nutrition_screen`, `costing_screen`, `traceability_screen` should move to NPD/FIN/WH index files.
6. **08-PRODUCTION ↔ 15-OEE boundary** — does 08 host its own OEE screens or pure cross-link?

---

## 7. Verification of pre-existing 00/01/02 findings

Sample-checked claims from `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md`:
- D8 mis-tag claim (`sites_screen` in settings index) — confirmed via `prototype-index-settings.json` line `sites_screen | design/Monopilot Design System/settings/org-screens.jsx | 103-189` — also belongs to 14-MULTI-SITE.
- N-A2 claim that NPD `recipe.jsx`, `other-stages.jsx`, `docs-screens.jsx` are unanchored — confirmed via `prototype-index-npd.json`. Findings consistent.
- F-A3 claim about 5+5 primitives — confirmed via `_shared/MODAL-SCHEMA.md`.

The 00/01/02 audit is accurate. This document extends the same methodology to the remaining 13 modules.
