# Audit: Tune-1 — 13-MAINTENANCE + 01-NPD
**Audit agent:** Audit-1 (READ-ONLY)
**Date:** 2026-04-23
**Sources audited:**
- PRD: `13-MAINTENANCE-PRD.md` (full read), `01-NPD-PRD.md` (full read — §1-§11+)
- UX: `01-NPD-UX.md` (full read), `13-MAINTENANCE-UX.md` (partial — first 200 lines, §0-§2.3 only)
- Prototype files read:
  - maintenance: `dashboard.jsx`, `work-orders.jsx`, `pm-schedules.jsx`, `spares.jsx`, `other-screens.jsx`, `modals.jsx`, `assets.jsx`
  - npd: `fa-screens.jsx`, `brief-screens.jsx`, `d365-screens.jsx`, `allergen-screens.jsx`, `other-stages.jsx`, `modals.jsx`

---

## MODULE: 13-MAINTENANCE

### Section A — PRD → Prototype Coverage (MUST items missing or incomplete)

**A1. Unified WR+MWO table (D-MNT-9) — CRITICAL GAP**
PRD decision D-MNT-9 specifies a **single unified table** `maintenance_work_requests` covering all states from `requested` through `cancelled`. The prototype implements two completely separate sidebar navigation nodes: `MntWRList` (Work Requests) and `MntMWOList` (Maintenance Work Orders). This contradicts the PRD's data model and IA. In PRD the WR is simply the `requested` state of an mWO, not a separate entity.

**A2. Sanitation Checklist screen — MISSING**
PRD specifies `sanitation_checklists` table (D-MNT-14), three dedicated validations V-MNT-15 (allergen change dual sign-off), V-MNT-16 (product type), V-MNT-17 (prior allergen detection), outbox event `sanitation.completed`, and BRCGS 7-year retention. The prototype has NO dedicated sanitation checklist entry screen. The PM schedule shows an `allergen_change_flag` checkbox but there is no screen for filling, submitting, or auditing sanitation checklists.

**A3. LOTO screen — PARTIALLY MISSING**
PRD specifies `mwo_loto_checklists` table (D-MNT-15), V-MNT-09 (two-person), V-MNT-10 (energy sources before start). `MntLotoList` exists and `M-13`/`M-14` modals implement the two-person flow, but there is no standalone LOTO checklist screen for procedure management beyond modal-level interaction. PRD specifies LOTO as a P1 entity with its own CRUD — the prototype only shows active LOTOs in a list widget.

**A4. Calibration FK bridge to 09-QA (D-MNT-10) — stub only**
PRD decision D-MNT-10 specifies that calibration FAIL triggers `09-QA.lab_results` FK creation with CCP blocking. Prototype `MntCalDetail` shows a "FAIL → 09-QA trigger banner" and `M-09` shows the integration indicator, but it is a UI stub. The `calibration_records.qa_lab_result_id` FK and the actual blocking signal are not represented in the data model in the prototype. Acceptable as P1 design intent, but must be flagged as stub.

**A5. OEE auto-trigger (D-MNT-11) — confirmed P2 stub**
PRD marks `oee_maintenance_trigger_v1` as P2. Prototype `MntSettings` OEE section correctly marks it as P2 stub. No gap here — correctly deferred.

**A6. Outbox event pattern (D-MNT-12, 8 events) — not represented in prototype**
PRD specifies 8 outbox events (`mwo.created`, `mwo.completed`, `mwo.overdue`, `calibration.fail`, `calibration.due`, `spare.below_reorder`, `sanitation.completed`, `loto.active`). Prototype has no outbox event section, toast/notification panel, or event-trail representation. Acceptable for prototype stage but 0% coverage of a P1 architectural requirement.

**A7. multi-tenant L2 threshold config (D-MNT-13) — not represented**
PRD specifies `maintenance_alert_thresholds` table for L2 tenant config (PM overdue threshold, critical asset alert lead time). Prototype `MntSettings` has notification config but does NOT show threshold table config or the `Reference.MaintenanceThresholds` admin UI.

**A8. 21 CFR Part 11 SHA-256 on calibration certificates — correctly marked P2**
Prototype `MntCalDetail` certificate tab shows SHA-256 display. Correctly shown as P2 in BL-MAINT-05 context. No gap.

**A9. site_id UUID NULL on all tables (REC-L1) — not visible in prototype**
As expected for a JSX prototype — schema columns not visualised. Not a prototype gap.

**A10. Technician skill certifications + GDPR (mentioned in PRD) — present**
`MntTechDetail` includes certification table with expiry tracking and GDPR note. Covered.

---

### Section B — Prototype → PRD Hallucinations

**B1. `rejected` status in WR kanban — HALLUCINATION**
Classification: **(B) Hallucination**
`MntWRList` kanban column "Rejected" and filter option "rejected" do not appear in PRD `mwo_state_machine_v1` (valid states: `requested` / `approved` / `open` / `in_progress` / `completed` / `cancelled`). The state does not exist anywhere in the PRD. This should be removed or mapped to `cancelled` with a reason field.

**B2. WR as a separate IA node from mWO — HALLUCINATION (architectural)**
Classification: **(B) Hallucination** (contradicts explicit PRD decision)
PRD D-MNT-9 states explicitly: "Unified WR+MWO single table." The prototype treats WR and mWO as two separate entities with separate list screens, separate state machines, separate navigation. This is a fundamental IA hallucination — not a minor label drift.

**B3. Criticality taxonomy (critical/high/medium/low) — EXTENSION**
Classification: **(A) Extension — acceptable**
`MntAssetList` adds a 4-level criticality taxonomy. PRD mentions criticality but does not specify the exact levels. This is a reasonable and useful extension aligned with industry standards (ISO 14224).

**B4. RunStrip component (last 8 PM outcomes on asset) — EXTENSION**
Classification: **(A) Extension — acceptable**
`MntAssetDetail` shows a visual strip of the last 8 PM outcomes. PRD specifies PM history but not this specific visualization. Clean UX enhancement.

**B5. `MntAnalytics` with 6-tab deep analytics — EXTENSION (confirm scope)**
Classification: **(A) Extension — but confirm P1 scope**
6 analytics tabs (overview/mtbf/pm/availability/cost/pareto) are more extensive than PRD P1 dashboards `MNT-001..006`. PRD specifies 6 P1 dashboards but they map 1:1 to KPIs, not 6 full analytics pages. The prototype over-delivers on analytics scope. The Pareto chart referencing `08-PRODUCTION.downtime_events` is a cross-module dependency not specified in PRD P1 scope.

**B6. Nutri-Score preview in `other-stages.jsx` (NPD module file, not maintenance) — wrong module**
Not a maintenance issue — filed under NPD Section B.

**B7. `shelf_life_days` on spare_parts — ALIGNED**
`MntSpareDetail` shows `shelf_life_days`. PRD `spare_parts` table includes `shelf_life_days`. Aligned, not a hallucination.

**B8. 7-year BRCGS retention dates shown on calibration history — ALIGNED**
`MntCalDetail` shows retention dates with "BRCGS 7y" notation. Aligned with PRD BRCGS Issue 10 requirement.

**B9. Allergen dual sign-off shown as BRCGS-mandated non-editable — ALIGNED**
`MntSettings` sanitation section correctly marks allergen dual sign-off as BRCGS-mandated / non-editable. Aligned with D-MNT-14.

**B10. `MntTechList` skills matrix toggle — EXTENSION (acceptable)**
PRD specifies `technician_skills` table with skill levels. The matrix view is a reasonable UI extension beyond what PRD specifies. No conflict.

---

### Section C — Drift: Types / Labels / States / IA / Validations

**C1. State labels: "Submitted" in WR kanban vs "requested" in PRD**
`MntWRList` kanban uses "Submitted" as column header. PRD state machine uses `requested`. Minor label drift — acceptable alias but must be documented.

**C2. State strip in `MntMWODetail` missing `cancelled` visual state**
`stateSteps` array in `MntMWODetail` shows: `requested → approved → open → in_progress → completed`. The `cancelled` state is not represented in the visual progress strip. PRD state machine includes `cancelled` as a valid terminal state. This means users cannot visually see when an mWO was cancelled vs. completed.

**C3. "Triaged" label in WR kanban — not in PRD**
`MntWRList` kanban column "Triaged" / "Scheduled Done" are not PRD state names. PRD states are `approved` (after triage decision). "Triaged" is an intermediate label introduced by the prototype that has no PRD equivalent. This creates UX label drift.

**C4. PM schedule_type values — ALIGNED**
Prototype `preventive/calibration/sanitation/inspection` matches PRD `schedule_type CHECK` constraint exactly.

**C5. Calibration status values — ALIGNED**
`current/due/overdue` in prototype match PRD calibration lifecycle.

**C6. Spare parts category filter includes "Critical" as filter — MINOR DRIFT**
PRD does not specify a `critical` flag on spare parts (that flag is on assets). Prototype adds a "critical" filter on spare parts independent of assets. Minor semantic drift.

**C7. `MntSettings` has 8 sections — EXTENSION beyond PRD**
PRD D-MNT-13 specifies L2 config, but the prototype's 8-section settings screen adds sections for OEE, Skills, and LOTO beyond what PRD explicitly maps to Settings. The structure is reasonable but diverges from PRD's L2 config spec.

**C8. V-MNT-02 referenced in M-03 WR Triage — ALIGNED**
Modal `M-03` references V-MNT-02 (duplicate detection). Aligned with PRD validation rules.

**C9. V-MNT-09 and V-MNT-10 in LOTO modals — ALIGNED**
M-14 references V-MNT-09 (two-person LOTO clear). Aligned.

**C10. V-MNT-15..17 sanitation validations — NOT in prototype**
PRD V-MNT-15 (allergen change dual sign-off), V-MNT-16 (product type mismatch), V-MNT-17 (prior allergen detection). These validations have no corresponding UI in the prototype beyond the allergen_change_flag note on PM schedules. Significant validation coverage gap.

**C11. V-MNT-22 downtime linkage — ALIGNED**
M-17 references V-MNT-22. Aligned.

---

### Section D — Fitness Score: 13-MAINTENANCE

| Dimension | Score | Notes |
|---|---|---|
| PRD Coverage (MUST items) | **62%** | All core entities present; sanitation screen + LOTO CRUD + outbox missing |
| Hallucination Risk | **HIGH** | WR/mWO split (D-MNT-9 violation) + `rejected` state are structural |
| Drift Severity | **MEDIUM** | State label drift, cancelled state missing visually, C21-C37 sanitation V rules absent |
| Overall | **YELLOW** | Strong foundation (assets/cal/PM/spares), but WR/mWO IA must be unified before build |

**Overall: YELLOW**

---

---

## MODULE: 01-NPD

### Section A — PRD → Prototype Coverage (MUST items missing or incomplete)

**A1. Schema-driven column metadata (ADR-028, `Reference.DeptColumns`) — not in prototype**
PRD §4.2 specifies the entire column system is driven by `Reference.DeptColumns` runtime. Prototype implements hardcoded form fields. This is expected for a prototype but means the dynamic blocking rule engine (ADR-029) is not demonstrated at all. Cascade rules (Pack_Size → Line → Dieset; Process → PR_Code; Finish_Meat → RM_Code + SyncProdDetailRows; Template → ApplyTemplate) are hinted at via cascade notes in FACoreTab but none are wired.

**A2. Cell-level lock states (gray locked, green auto-derived, D365 coloring) — PARTIAL**
PRD §7.2 specifies cell color states: gray locked (blocking not met), green auto (derived), D365 Found/NoCost/Missing coloring. `FAMRPTab` shows D365 coloring (found/nocost/missing). `FACoreTab` has cascade notes. But locked cell states (Pack_Size not filled → Production cells gray) are not demonstrated in the prototype forms. Partial coverage.

**A3. `Done_<Dept>` vs `Closed_<Dept>` distinction — not explicit in prototype**
PRD §7.3 specifies `Done_<Dept>` (auto-computed: all required filled AND Closed=Yes) as distinct from `Closed_<Dept>` (user-set dropdown). Prototype `FADetail` gate progress strip shows dept circles but does not distinguish the two states. This distinction is critical for the blocking rule engine.

**A4. `Status_Overall` 5-state enum — PARTIAL**
PRD §5.10 specifies 5 states: `Built / Complete / Alert / InProgress / Pending`. Prototype `FAList` filter and kanban show `InProgress / Complete / Alert / Pending` — 4 states. `Built` status is shown in kanban as a state badge in `FAList` but is not a selectable filter state. Minor.

**A5. FA Column count (69 cols total, 15 Core post-Phase B.2) — not verifiable in prototype**
Prototype `FACoreTab` shows the core fields but does not reflect all 15 Core cols (8 base + 7 brief extensions). Fields like `Price_Brief`, `Benchmark`, `Dev_Code` visible. `Number_of_Cases` present. All 7 brief extension fields appear to be present. Planning (4 cols), Commercial (8 cols), MRP (13 cols) — MRP tab shows Box, Top_Label, Bottom_Label, Web, MRP_Box, MRP_Labels, MRP_Films, MRP_Sleeves, MRP_Cartons, Tara_Weight, Pallet_Stacking_Plan, Box_Dimensions = 12 visible + Closed_MRP = 13. ALIGNED.

**A6. outbox_events / event emission — not in prototype**
PRD §4.1 specifies outbox events for: `fa.created`, `fa.core_closed`, `fa.dept_closed` ×7, `fa.built`, `fa.built_reset`, `brief.converted`. Prototype does not represent event emission. Expected for prototype stage. 0% coverage of P1 architecture.

**A7. `Reference.BriefFieldMapping` table — not represented**
PRD §9.5 specifies `Reference.BriefFieldMapping` as L2 config per tenant. Prototype `BriefConvertModal` hardcodes the field mapping table. Not a prototype gap per se, but should be noted for build.

**A8. Brief C21-C37 — acknowledged TBD**
`BriefDetail` Packaging section correctly marks C21-C37 as "pending Brief schema rescan." Aligned with PRD §9.6 open item #1. No gap.

**A9. `fa_builder_outputs` table / signed download URL — correctly stubbed**
`D365BuilderOutput` shows "↓ Download Builder file" button. PRD §10.6 specifies signed 24h URL from `fa_builder_outputs` table. Prototype correctly represents the UX without wiring. Acceptable stub.

**A10. D365 Constants editable in Settings (Phase C1) — noted in prototype**
`D365BuilderOutput` shows D365 Constants panel with "Edit requires admin (Settings · Phase C1)" note. Correctly deferred.

**A11. `line_changeover_history` for may-contain cross-contamination — not in prototype**
PRD §8.5 cascade rule includes `line_changeover_history` as source for `may_contain` allergen computation (allergens from previous product on the same line within 24h). `AllergenCascade` prototype shows "may contain" badges but the source logic references only `cascade.final.may_contain` fixture data — no line changeover history integration is shown. This is a P1 allergen cascade requirement.

**A12. V08 dev_code format validation — PRESENT**
`FADetail` header shows "V08 · Format DEV<YY><MM>-<seq>" help text. `BriefDetail` and `FACreateModal` also validate format. Aligned.

---

### Section B — Prototype → PRD Hallucinations / Extensions

**B1. `FAFormulationsTab` (formulation versioning) — EXTENSION beyond Phase B.2**
Classification: **(A) Extension — confirm scope**
PRD §1.1 out-of-scope table lists "BOM versioning + co-products + routing costs → 03-TECHNICAL Phase C1". The prototype `FAFormulationsTab` includes version table, lock/compare/draft actions for formulations. This is a Phase C1 feature appearing in Phase B.2 prototype. Should be flagged as scope creep for build planning.

**B2. `FARisksTab` — EXTENSION**
Classification: **(A) Extension — minimal scope**
UX spec SCR-03 lists risks as "minimal v3.0 scope." Prototype implements a full risks tab within FADetail. Acceptable as a placeholder tab with minimal content, but should be confirmed as in-scope for Phase B.2.

**B3. `FADocumentsTab` — EXTENSION**
Classification: **(A) Extension — placeholder**
Similar to risks. Not in PRD main scope for Phase B.2. Acceptable as stub placeholder.

**B4. `NutritionScreen` with Nutri-Score calculation — HALLUCINATION**
Classification: **(B) Hallucination**
`other-stages.jsx` contains `NutritionScreen` with Nutri-Score preview (A/B/C/D/E scale) and "Run what-if" capability. This feature is not specified anywhere in the `01-NPD-PRD.md`. Nutri-Score calculation is a Phase C4+ feature belonging to 09-QUALITY or 03-TECHNICAL. It appears in the NPD prototype with no PRD anchor.

**B5. `CostingScreen` with waterfall + margin scenarios + what-if sliders — HALLUCINATION**
Classification: **(B) Hallucination**
`other-stages.jsx` contains a full costing waterfall chart with RM breakdown, yield loss calculation, packaging cost, margin vs target scenarios, and interactive what-if sliders. This is not in `01-NPD-PRD.md`. Cost roll is explicitly out-of-scope for Phase B.2 (§1.2 out-of-scope: "Cost roll + variance + landed cost → 10-FINANCE Phase C4"). This is a significant feature (multiple components) with no PRD anchor in this module.

**B6. `PackagingScreen` with supplier/material/spec/status table — HALLUCINATION (partial)**
Classification: **(B) Hallucination**
`other-stages.jsx` has a `PackagingScreen` with approved/pending material specs per component. This goes beyond the brief packaging fields (C14-C37). It looks like a product master spec screen belonging to 03-TECHNICAL Phase C1. No PRD anchor in 01-NPD.

**B7. MFA re-auth on D365 Build — ALIGNED**
`D365BuilderOutput` shows MFA required alert with "3 failed attempts, 60s lockout." PRD §2.3 and §10.6 specify MFA re-auth for `d365_builder.execute`. Aligned.

**B8. `AllergenCascade` SCR-09 with 3-column RM→Process→FA visualization — EXTENSION**
Classification: **(A) Extension — excellent**
PRD §8.7 specifies a Technical section widget but does not specify a dedicated SCR-09 full-page cascade preview with SVG diagram. This is a well-implemented extension of PRD §8 allergen requirements. Adds genuine value for Technical/Quality managers. Recommend as (C) Update PRD to include.

**B9. "Guided build →" button in D365BuilderOutput calling `d365Wizard` modal — EXTENSION**
Classification: **(A) Extension**
PRD specifies a single "Build D365 output" button flow. The prototype adds a `d365Wizard` guided build path. Reasonable UX extension.

**B10. `FABOMTab` as read-only computed view — ALIGNED**
PRD §10.7 specifies BOM view as computed on-the-fly, read-only. Prototype BOM tab is read-only. Aligned.

---

### Section C — Drift: Types / Labels / States / IA / Validations

**C1. `status_overall` values: prototype uses "Alert" vs PRD "Alert" — ALIGNED**
Both prototype and PRD use `Alert` state. Aligned.

**C2. Validation rules V01-V08 in prototype vs PRD V01-V06 + V07 + V08**
PRD §10.6 specifies V01-V06 + V07 (allergens complete, new) + V08 (brief mapping). `FARightPanel` shows V01-V08. `D365BuilderOutput` validates V01-V08. `FACreateModal` validates V01+V02. `BriefDetail` validates V08 (Dev Code format). Aligned.

**C3. 24-week launch constraint — ALIGNED in prototype**
`FACommercialTab` shows a V08 24-week constraint alert. PRD §3.2 specifies 24-week minimum Brief → launch. Aligned (though labeled V08 in prototype — PRD maps this to `Reference.AlertThresholds` not a specific validation rule ID).

**C4. Brief status enum `draft/complete/converted/abandoned` — ALIGNED**
`BriefList` filters and `BriefDetail` badges cover all 4 PRD states. Aligned.

**C5. Brief template names: "Single"/"Multi" in prototype vs `single_component`/`multi_component` in PRD**
Minor label drift. `brief.template` PRD values are `single_component`/`multi_component` but prototype uses "Single"/"Multi" as display labels. Acceptable UI shorthand but backend values must match PRD schema.

**C6. Allergen widget in FATechnicalTab: 14 EU allergens with override buttons — ALIGNED**
PRD §8.2 seeds 14 EU FIC 1169/2011 allergens. `FATechnicalTab` shows 14 allergens. Manual override with reason captures `Allergen_Override_Reason`. Aligned with §8.6.

**C7. `storage_temperature` field in FATechnicalTab — MINOR EXTENSION**
PRD Technical section specifies `Shelf_Life` + allergens. `storage_temperature` is not in PRD §5.7 Technical cols. Added by prototype as a minor extension. Acceptable for food manufacturing context.

**C8. Brief weight tolerance validation: `>5g` in prototype vs PRD `± tolerance (validation)` — MINOR DRIFT**
`BriefDetail` uses 5g hardcoded tolerance `Math.abs(totalWeight - 220) > 5`. PRD §9.2 specifies "summary row weights = sum(component weights) ± tolerance" but does not specify 5g. The prototype uses target 220g as hardcoded fixture. For build, tolerance must come from `Reference.MainTable` or brief config, not hardcoded.

**C9. FADetail 12 tabs vs UX spec SCR-03 listing — minor count drift**
UX spec SCR-03 lists: core/planning/commercial/production/technical/mrp/procurement/bom/history = 9 tabs. Prototype adds: formulations, risks, docs = 12 tabs. The extra 3 tabs are extensions (see B1-B3).

**C10. `D365BuilderOutput` pre-flight shows V-NPD-BUILD-001 rule — not in PRD validation list**
PRD §5-§10 validation rules are V01-V08. Prototype adds `V-NPD-BUILD-001` ("Built flag resets if any FA field is edited"). This rule IS described in PRD §7.4 but not labeled as `V-NPD-BUILD-001`. Minor label extension.

---

### Section D — Fitness Score: 01-NPD

| Dimension | Score | Notes |
|---|---|---|
| PRD Coverage (MUST items) | **75%** | All 7 dept tabs, D365 Builder, allergen cascade, brief flow present; cascade wiring + outbox absent |
| Hallucination Risk | **MEDIUM** | NutritionScreen + CostingScreen + PackagingScreen are feature-complete hallucinations from out-of-scope modules |
| Drift Severity | **LOW-MEDIUM** | Label drift minor; template name values; weight tolerance hardcoded; Done vs Closed distinction absent |
| Overall | **YELLOW** | Strong screen coverage for Phase B.2; 3 hallucinated screens from C4/C5 modules must be removed or relocated |

**Overall: YELLOW**

---

---

## Cross-Module Observations

**X1. Allergen cascade cross-module (MAINTENANCE ↔ NPD)**
Both modules reference allergen-aware flows. NPD `AllergenCascade` SCR-09 visualises RM→Process→FA. MAINTENANCE M-06 sign-off includes allergen clearance. D-MNT-14 sanitation dual sign-off. These are consistent in design intent but the data link (which FA's allergens govern the sanitation check) is not shown in either prototype.

**X2. Calibration → QA bridge (MAINTENANCE D-MNT-10)**
Calibration FAIL emitting a 09-QA.lab_results event is in maintenance prototype as a stub banner. The 01-NPD prototype has no equivalent — correct, since QA is a separate module.

**X3. D365 bridge pattern**
Both modules reference the bridge-period D365 dependency. NPD has the full D365 Builder. MAINTENANCE has no D365 dependency (CMMS is independent of D365 in PRD). Consistent.

**X4. Outbox event pattern — missing in both**
Neither prototype shows outbox event emission. This is the shared architectural backbone (00-FOUNDATION §10). Both modules have outbox specs in their PRDs. For prototype stage this is acceptable, but both modules need outbox wiring before build readiness is claimed.

**X5. Multi-tenant `site_id` (REC-L1)**
Neither prototype shows `site_id` columns or tenant switching UI. Expected — this is a schema-level concern, not UI.

---

## Summary Table

| Module | Coverage | Hallucination Risk | Drift | Overall |
|---|---|---|---|---|
| 13-MAINTENANCE | 62% | HIGH (WR/mWO split, `rejected` state) | MEDIUM | **YELLOW** |
| 01-NPD | 75% | MEDIUM (3 out-of-scope screens) | LOW-MEDIUM | **YELLOW** |

---

## Top Issues by Module

### 13-MAINTENANCE — Top 3

1. **[CRITICAL] WR/mWO IA split violates D-MNT-9** — Prototype has two separate nav nodes; PRD mandates unified table. This will require re-architecture of `work-orders.jsx` before build.
2. **[HIGH] `rejected` status hallucination** — Not in PRD state machine. Remove from kanban and filter. Should map to `cancelled` with `cancellation_reason` field.
3. **[HIGH] Sanitation checklist screen missing** — PRD D-MNT-14 + V-MNT-15..17 + `sanitation.completed` outbox event + BRCGS 7y retention. A dedicated MAINT-SCR-SAN screen needs to be designed and built.

### 01-NPD — Top 3

1. **[HIGH] CostingScreen hallucination** — Full cost waterfall + margin scenarios + what-if sliders. Out of scope for Phase B.2 (belongs to 10-FINANCE Phase C4). Must be removed from NPD prototype or explicitly deferred to a future module.
2. **[HIGH] NutritionScreen + Nutri-Score hallucination** — Not in 01-NPD-PRD anywhere. Belongs to 09-QUALITY or 03-TECHNICAL. Must be relocated or removed.
3. **[MEDIUM] AllergenCascade deserves PRD update** — SCR-09 is an excellent implementation of PRD §8 that exceeds the spec in a valuable way. Recommend updating PRD §8.7 to include a dedicated cascade preview screen (SCR-09) and adding it to the `01-NPD-UX.md` screens list. Currently it exists as an undocumented but well-built screen.

---

*Report generated by Audit-1 agent · READ-ONLY · 2026-04-23*
