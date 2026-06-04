# 01-npd — Task Status Tracker

First populated by reality audit 2026-06-02. No prior STATUS.md existed.

## Legend
- ✅ DONE — implementation merged, review passed
- 🔄 IN PROGRESS — agent currently working
- ⏸ BLOCKED — stub exists but incomplete; or failing test; or dependency unmet
- ⬜ PENDING — not started

## Status

| Task | Title | Status | Notes |
|---|---|---|---|
| T-001 | product table + fa compat view DDL | ✅ DONE | **DONE 2026-06-03** (run-module Wave A0). mig **075** (renamed from stale 0010). product table (69 cols+ext/private jsonb+schema_version+R13 audit), org_id Wave0 scope, RLS `app.current_org_id()`+FORCE RLS, partial idx WHERE built=false. fa view security_invoker=true + INSTEAD OF trigger = structurally read-only. Codex impl → Opus review (REWORK: fake read-only AC / orphan src/schema shim / index drift) → fixed → 4/4 green on local canon DB. Merged 5253a0f4. Unblocks all downstream T1-schema. |
| T-002 | prod_detail table + indexes | ✅ DONE | DONE 2026-06-03 (Wave A1). prod_detail (mig 076) — Codex→Opus, merged |
| T-003 | Reference.DeptColumns metadata table | ✅ DONE | DONE 2026-06-03 (Wave A1 rework). Reference.DeptColumns EXTENDED (mig 077 ALTER of existing 009 table, not a new one) + Drizzle pgSchema(Reference); 2/2 green — merged |
| T-004 | Reference.ManufacturingOperations table | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.ManufacturingOperations reshape (mig 078) — merged; nit: drop redundant 012 unique (wave-close) |
| T-005 | Reference lookup tables (PackSizes, Templates, LineTypes) | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference lookups PackSizes/Templates/Lines/Equip/CloseConfirm (mig 079) — merged; AlertThresholds removed (owned by T-049) |
| T-006 | Reference.RolePermissions schema + Apex seed | ✅ DONE | DONE 2026-06-03 (Wave A1 rework). RolePermissions seed → npd.* namespace per T-101 + legacy-string cleanup; matrix per PRD §2.2; merged. NOTE: re-verify vs T-101 final enum when T-101 built |
| T-007 | outbox_events emitter wrapper for fa.* events | ✅ DONE | DONE 2026-06-04 (Wave B). outbox emitFaEvent wrapper for fa.*/brief.* events (mig 102) — tx-scoped, idempotent, app_user insert org-RLS-checked; 25+4 green. merged |
| T-008 | Server Action createFa | ✅ DONE | DONE 2026-06-04 (Wave C). createFa Server Action + V01/V02 validators — REAL integration test (mutation-verified non-vacuous), single-tx product+outbox. merged. Nit: product_code is GLOBAL PK (multi-tenant concern, see module-close) |
| T-009 | Server Action updateFaCell + reset_built trigger | ✅ DONE | DONE 2026-06-04 (Wave C). updateFaCell + reset_built trigger (mig 141) — V18-reconciled with T-080: cell edit auto-resets built->false via audited tx-local flag (allowed past downgrade-guard); built->true still BLOCKED under open High risk; fa.built_reset emitted. REAL integration 6/6. current_setting uses are custom control flags (NOT org-context). merged |
| T-010 | Cascade Chain 1: Pack_Size → Line → Equipment_Setup | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 1 Pack_Size→Line→Equipment (mig 127, packages/cascade-engine) + fa.cascade event — merged |
| T-011 | Cascade Chain 2: Manufacturing_Operation → Intermediate | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 2 Manufacturing_Operation→Intermediate (packages/cascade-engine/chain2 + V06 suffix-match validator) — merged (scaffold conflict resolved) |
| T-012 | Cascade Chain 3: Recipe_Components → Ingredient_Code | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 3 Recipe_Components→Ingredient_Code (mig 129, cascade-engine/chain3) + fa.recipe_changed event — merged (type-fixed post-merge) |
| T-013 | Cascade Chain 4: Template → ApplyTemplate to ProdDetail | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 4 Template→ApplyTemplate (mig 131, cascade-engine/chain4) + fa.template_applied event — merged (post-merge type-fixed) |
| T-014 | Schema-driven Zod runtime from Reference.DeptColumns | ✅ DONE | DONE 2026-06-04 (Wave C). Schema-driven Zod runtime from Reference.DeptColumns (mig 123, packages/schema-runtime) — Codex+rework (getAppConnection RLS, boolean/formula handling). merged |
| T-015 | IsAllRequiredFilled + Done_<Dept> + Status_Overall view | ✅ DONE | DONE 2026-06-04 (Wave B). IsAllRequiredFilled + Done_<Dept> + fa_status_overall view (mig 097, security_invoker, schema-driven) — merged |
| T-016 | Reference.DeptColumns Apex baseline seed (69 cols) | ✅ DONE | DONE 2026-06-04 (Wave B). DeptColumns Apex baseline seed 69 cols (mig 095, Sonnet, 6/6, idempotent) — merged |
| T-017 | Server Action closeDeptSection | ✅ DONE | DONE 2026-06-04 (Wave C). closeDeptSection Server Action — merged |
| T-018 | Autofilter logic + reopenDeptSection Server Action | ✅ DONE | DONE 2026-06-04 (Wave C). Autofilter logic + reopenDeptSection Server Action (mig 136) + fa.dept_reopened event — merged |
| T-019 | UI: FA list page (fa_list prototype) | ✅ DONE | DONE 2026-06-04 (Wave D pilot). FA list page — prototype parity (fa-screens.jsx:177-297, structural mapping), real product data via withOrgContext, 12 RTL, tsc0/lint0, i18n en/pl/ro/uk, 4 states+permission-denied. kira-ui (Opus). Codex-review + live axe deferred to Gate-5. Deviations: kanban omitted (scope), didnt use listFaByDept (insufficient cols), product.deleted_at absent (list-fa-by-dept helper latent bug) |
| T-020 | ROOT: FA detail page shell group | ⏸ BLOCKED | page.tsx + fa-tabs.tsx + fa-right-panel.tsx exist but all tab content is "deferred-empty"; no real data; no parity evidence |
| T-021 | UI: FA Create modal | ✅ DONE | DONE 2026-06-04 (parallel ramp). FA Create modal — wired to createFa (T-008), V01/V02 feedback, parity (modals.jsx:9-43), real action, RTL, tsc0, i18n npd.faCreate. kira-ui |
| T-022 | UI: Dept Close modal | ✅ DONE | DONE 2026-06-04 (parallel ramp). Dept Close modal — readiness via Reference.DeptColumns required-check, wired closeDeptSection (T-017), parity (modals.jsx:143-191), RTL, tsc0, i18n npd.deptClose. kira-ui |
| T-023 | UI: FA Core tab (schema-driven form) | ⬜ PENDING | Blocked by T-009, T-010, T-012, T-014, T-020 |
| T-024 | UI: FA Production tab + ProdDetail rows editor | ⬜ PENDING | Blocked by T-002, T-004, T-010, T-011, T-020 |
| T-025 | ROOT: FA planning/commercial tabs group | ⬜ PENDING | Blocked by T-009, T-014, T-016, T-020 |
| T-026 | UI: FA Technical tab shell | ⬜ PENDING | Blocked by T-014, T-020, T-025 |
| T-027 | UI: FA History tab + audit_events timeline | ✅ DONE | DONE 2026-06-04 (parallel ramp). FA History tab + audit timeline — union outbox_events∪audit_events org-scoped, parity (fa-screens.jsx:938-968), packages/queries listFaHistory, RTL, tsc0, i18n npd.faHistory. kira-ui |
| T-028 | V03/V04 validators (Pack_Size; D365 mapping) | ✅ DONE | DONE 2026-06-04 (Wave C). V03/V04 validators (mig 111, packages/validation) — merged |
| T-029 | Server Action deleteFa | ✅ DONE | DONE 2026-06-04 (Wave C). deleteFa soft-delete (mig 132) + fa.deleted event — merged |
| T-030 | brief + brief_lines tables (NPD-b schema) | ✅ DONE | DONE 2026-06-03 (Wave A1). brief + brief_lines (mig 081) — merged; npd_project_id now nullable no-FK (npd_projects owned by T-054; FK deferred to Wave C) |
| T-031 | Server Actions: createBrief + saveBriefDraft | ✅ DONE | DONE 2026-06-04 (Wave C). createBrief + saveBriefDraft Server Actions — Codex+rework (mock→REAL integration tests, transactional idempotency-resume). merged |
| T-032 | Reference.BriefFieldMapping seed | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.BriefFieldMapping table + Apex seed (mig 100) — merged |
| T-033 | Server Action convertBriefToFa | ✅ DONE | DONE 2026-06-04 (Wave C). convertBriefToFa Server Action (mig 137 brief-to-fa-audit) + brief.completed_for_project event + V08 mapping validator — REAL integration test. merged |
| T-034 | ROOT: Brief module UI group | ⬜ PENDING | Blocked by T-030, T-031 |
| T-035 | UI: Brief Create + Brief Convert modals | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). Brief Create + Complete modals — createBrief(T-031)+convertBriefToFa(T-033), ?modal= host (T-119 pattern), parity (modals.jsx:46-140), RTL, tsc0, i18n npd.briefModals. kira-ui |
| T-036 | Reference.Allergens + Allergens_by_RM + Allergens_agg tables | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.Allergens + by_RM + agg, EU14 (mig 082) — merged |
| T-037 | fa_allergen_overrides table + audit chain | ✅ DONE | DONE 2026-06-04 (Wave B). fa_allergen_overrides + append-only audit chain (mig 094) — Codex+rework (revoke UPD/DEL, SECURITY DEFINER supersede trigger, 9/9), merged |
| T-038 | Allergen cascade engine + fa_allergen_cascade view | ✅ DONE | DONE 2026-06-04 (Wave C). Allergen cascade ENGINE + fa_allergen_cascade view (mig 114) — Opus+rework (product.allergens/may_contain cols, update_fa_allergen_set fn+action, may_contain separate, conditional only-confirmed, fa.allergens_changed event-on-change, 18 tests). Codex review. NEW perm npd.allergen.write needs seed (module-close) |
| T-039 | Server Actions: setAllergenOverride + V07 validator | ✅ DONE | DONE 2026-06-04 (Wave C). setAllergenOverride + V07 validator (packages/validation) + REAL action integration test — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-040 | UI: Allergen Cascade widget + Override modal | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). Allergen Cascade widget + Override modal — real fa_allergen_cascade view (T-038) derived/published/may_contain, override via T-039, EU14 badges, parity (allergen-screens.jsx:5-118 + modals.jsx:389-428), RTL, tsc0, i18n npd.allergenWidget. kira-ui |
| T-041 | Reference.D365_Constants table + Apex seed | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.D365_Constants + Apex seed (mig 083) — merged |
| T-042 | exceljs Builder generator: 8 tabs per FA | ⬜ PENDING | Blocked by T-001, T-002, T-041 |
| T-043 | fa_builder_outputs storage + signed URL service | ✅ DONE | DONE 2026-06-04 (Wave C). fa_builder_outputs storage + signed URL (mig 112, packages/storage) — merged |
| T-044 | Server Action buildD365/export | ⬜ PENDING | Blocked by T-006, T-007, T-039, T-042, T-043, T-080, T-081 |
| T-045 | fa_bom_view + bom_export_csv Server Action | ✅ DONE | DONE 2026-06-04 (Wave C). fa_bom_view + bom_export_csv Server Action (mig 133) — merged |
| T-046 | ROOT: D365 integration UI group | ⬜ PENDING | Blocked by T-044 |
| T-047 | Wizard step Server Actions (validate/dataPreview/build) | ⬜ PENDING | Blocked by T-042, T-043, T-044, T-045, T-080, T-081 |
| T-048 | dashboard_summary + launch_alerts + missing_requirements view | ✅ DONE | DONE 2026-06-04 (Wave C). dashboard_summary/launch_alerts/missing_required_cols views (mig 106, security_invoker) — merged |
| T-049 | Reference.AlertThresholds + d365_import_cache tables | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.AlertThresholds + d365_import_cache (mig 084) — merged (canonical AlertThresholds owner) |
| T-050 | Reference.AlertThresholds default seed | ✅ DONE | DONE 2026-06-04 (Wave B). AlertThresholds default seed (mig 096, Sonnet, 9/9, matches T-049 threshold_key) — merged |
| T-051 | Dashboard Server Actions: getDashboardSummary + getAlerts | ✅ DONE | DONE 2026-06-04 (Wave C). Dashboard Server Actions getDashboardSummary+getAlerts + d365.cache.refreshed event (mig 118) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-052 | ROOT: NPD Dashboard page group | ✅ DONE | DONE 2026-06-04 (parallel ramp). NPD Dashboard page — KPI counters + dept progress + launch alerts via T-051 actions, parity (fa-screens.jsx:32-174), RTL, tsc0, i18n npd.dashboard. kira-ui |
| T-053 | E2E: dashboard refresh + alert thresholds smoke | ⬜ PENDING | Blocked by T-051, T-052 |
| T-054 | npd_projects + gate_checklist_items + gate_approvals tables | ✅ DONE | DONE 2026-06-03 (Wave A1). npd_projects + gate_checklist_items + gate_approvals (mig 085) — merged; brief FK deferred |
| T-055 | Reference.GateChecklistTemplates table | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.GateChecklistTemplates (mig 092) — merged |
| T-056 | Default G0-G4 GateChecklistTemplates seed | ✅ DONE | DONE 2026-06-04 (Wave B). Default G0-G4 GateChecklistTemplates seed (mig 101, Sonnet, 9/9 idempotent) — merged |
| T-057 | createProject + listProjects + getProject Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). createProject/list/get Server Actions + npd.project.created event (mig 103) — Codex+rework (typecheck fix, code constraint→(org_id,code) fixing T-054 global-unique bug, real integration tests). merged |
| T-058 | advanceProjectGate + approveProjectGate + rollbackGate | ✅ DONE | DONE 2026-06-04 (parallel ramp). advanceProjectGate/approveProjectGate/rollbackGate (mig 143) — gate transitions + checklist gating + e-sign G3/G4 + rollback. Codex+Opus review PASS-WITH-NITS. REAL integration 6/6. merged |
| T-059 | UI: Pipeline Kanban view | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). Pipeline Kanban (G0-G4 columns) — real npd_projects via T-057, advance via T-058, parity (pipeline.jsx:19-52), RTL, tsc0, i18n npd.pipelineKanban. kira-ui |
| T-060 | ROOT: Pipeline views group | ⬜ PENDING | Blocked by T-057, T-059 |
| T-061 | ROOT: Gate screen components group | ⬜ PENDING | Blocked by T-057, T-058 |
| T-062 | E2E: project create → advance G0..G2 → approve G3 | ⬜ PENDING | Blocked by T-057, T-058, T-059, T-061, T-095, T-096, T-097 |
| T-063 | formulations + formulation_versions + formulation_ingredients tables | ✅ DONE | DONE 2026-06-04 (Wave B). formulations+versions+ingredients+audit+cache (mig 093, 5 tables, NUMERIC, DEFERRABLE circular FK) — merged. Nit: audit_log org-link FK (T-064 follow) |
| T-064 | Formulation lifecycle Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). Formulation lifecycle actions (draft/trial/lock) + mig 104 (formulation.* outbox events + locked-ingredient immutability trigger) — Codex+rework (replaced mock-only tests with REAL DB integration). merged |
| T-065 | Formulation pure-function compute (cost/nutrition/allergen) | ✅ DONE | DONE 2026-06-04 (Wave C). Formulation pure compute (cost/nutrition/allergen) @monopilot/domain + recompute/compare actions — Opus impl-hard + rework (nutrition load via NEW Reference.RawMaterials mig 107, money string-only, version existence checks, seq-keyed diff). Codex review. NUMERIC-exact. merged |
| T-066 | UI: FormulationEditor (RecipeScreen prototype) | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). FormulationEditor (RecipeScreen) — real formulation+ingredients (T-063), saveDraft(T-064)+recompute(T-065), debounced, NUMERIC-exact, parity (recipe.jsx:124-264), RTL, tsc0, i18n npd.formulationEditor. kira-ui. panels=slots(T-113-115) |
| T-067 | ROOT: FormulationEditor live panels | ⬜ PENDING | Blocked by T-065, T-066 |
| T-068 | E2E: formulation edit → submit-for-trial → lock | ⬜ PENDING | Blocked by T-064, T-065, T-066, T-067 |
| T-069 | nutrition_profiles + nutrition_allergens + nutri_score tables | ✅ DONE | DONE 2026-06-03 (Wave A1 rework). nutrition + unique NULLS NOT DISTINCT fix (mig 086); 6/6 green — merged |
| T-070 | costing_breakdowns + costing_waterfall_steps tables | ✅ DONE | DONE 2026-06-03 (Wave A1). costing_breakdowns + waterfall_steps (mig 087, NUMERIC-exact) — merged |
| T-071 | DEFERRED/CROSS-MODULE: Sensory schema (Technical-owned) | ⬜ PENDING | Deferred by design; owned by 03-technical |
| T-072 | Nutrition computation Server Action + Nutri-Score | ✅ DONE | DONE 2026-06-04 (Wave C). Nutrition compute Server Action + Nutri-Score (mig 110, @monopilot/domain) — Codex, REAL integration tests, NUMERIC-exact. merged. Nit: Nutri-Score fiber/FVN=0 (RM schema lacks cols, deviation) |
| T-073 | Costing 9-step waterfall + scenario Server Action | ✅ DONE | DONE 2026-06-04 (Wave C). Costing 9-step waterfall + scenario action (apps/web/lib/costing) + mig 108 (scenario params jsonb) — Opus impl-hard + rework (exact margin gate, persist params, bounds). Codex review. NUMERIC-exact. merged |
| T-074 | UI: NutritionScreen | ✅ DONE | DONE 2026-06-04 (Wave D). NutritionScreen (per-100g traffic-light + Nutri-Score) — real data (nutrition_profiles+Reference.Nutrients+nutri_score_results), prototype parity (other-stages.jsx:4-80), 16 RTL, tsc0, i18n npd.nutrition x4, parity-evidence harness. kira-ui. axe/Codex-review deferred to Gate-5 |
| T-075 | UI: CostingScreen | ✅ DONE | DONE 2026-06-04 (Wave D). CostingScreen — 9-step waterfall + margin-warn, real costing data (composite-PK join), NUMERIC-exact, new @monopilot/ui Slider, parity (other-stages.jsx:83-163), 20 RTL, tsc0, i18n npd.costing x4. kira-ui. axe deferred Gate-5 |
| T-076 | DEFERRED/CROSS-MODULE: Sensory UI (Technical-owned) | ⬜ PENDING | Deferred by design; owned by 03-technical |
| T-077 | Reference.ApprovalChainTemplates table | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.ApprovalChainTemplates (mig 098, zod) — merged |
| T-078 | Approval criteria (C1-C7) evaluator Server Action | ✅ DONE | DONE 2026-06-04 (Wave C). Approval criteria C1-C7 evaluator Server Action — merged |
| T-079 | UI: ApprovalScreen | ✅ DONE | DONE 2026-06-04 (ramp 3). ApprovalScreen — C1-C7 criteria via T-078, e-sign submit via T-058, parity (other-stages.jsx:412-473), RTL, tsc0, i18n npd.approvalScreen. kira-ui |
| T-080 | risks table + V18 built-blocker trigger | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). risks + V18 built-blocker trigger (mig 088) — trigger verified blocks+allows; merged. Note: downgrade-guard may interact w/ T-009 reset_built (Wave C) |
| T-081 | risks CRUD + lifecycle Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). risks CRUD Server Actions + risk.created event (mig 105) — merged |
| T-082 | UI: RiskRegisterScreen + RiskAddModal | ✅ DONE | DONE 2026-06-04 (Wave D). RiskRegisterScreen + RiskAddModal — real risks data via T-081 listRisks, V18 built-blocker advisory, §18 reason-gated transitions, prototype parity (docs-screens.jsx:56-106 + modals.jsx:297-346), 15 RTL, tsc0, i18n npd.risks x4. kira-ui. axe/Codex-review deferred |
| T-083 | compliance_docs table + storage policy | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). compliance_docs + storage policy + expiry/soft-delete (mig 089) — merged; ready for T-085 expiry cron |
| T-084 | Compliance docs upload + signed URL + soft-delete | ✅ DONE | DONE 2026-06-04 (Wave C). Compliance docs upload + signed URL + soft-delete + compliance_doc.* events (mig 119) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-085 | compliance_docs_expiry_scan SECURITY DEFINER cron | ✅ DONE | DONE 2026-06-04 (Wave C). compliance_docs expiry-scan cron (mig 124, apps/worker) + compliance_doc.expired/expiring events — merged |
| T-086 | UI: ComplianceDocsScreen + DocUploadModal | ✅ DONE | DONE 2026-06-04 (Wave D). ComplianceDocsScreen + DocUploadModal — real compliance_docs (T-084), expiry status badges (T-085 thresholds), signed-URL download, §19 MIME/20MB validation, parity (docs-screens.jsx:6-53 + modals.jsx:667-689), 17 RTL, tsc0, i18n npd.compliance x4. kira-ui. axe deferred |
| T-087 | E2E: V18 built-blocker (high-risk → cannot build) | ⬜ PENDING | Blocked by T-080, T-081, T-082 |
| T-088 | E2E: compliance doc upload → expiry job → dashboard | ⬜ PENDING | Blocked by T-084, T-085, T-086 |
| T-089 | GDPR right-to-erasure function | ✅ DONE | DONE 2026-06-04 (Wave C). NPD GDPR right-to-erasure (mig 115/116) — Opus+rework (production cron registration, gdpr.erasure.execute enum+baseline+seed, prod_detail branch). Codex review. SATISFIES foundation T-115 |
| T-090 | d365_import_cache_meta view + scheduled sync worker | ✅ DONE | DONE 2026-06-04 (Wave C). d365_import_cache_meta view + scheduled sync worker (mig 120, apps/worker) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-091 | E2E: dashboard interactive controls | ⬜ PENDING | Blocked by T-052, T-051 |
| T-092 | Shared BOM SSOT schema | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). Shared BOM SSOT bom_headers+bom_lines (mig 090, NUMERIC-exact, versioned) — Codex+rework (INSERT immutability guard), merged. Existing bom_item(014) is R13 placeholder, no collision |
| T-093 | API/backfill: NPD Builder writes initial shared BOM | ✅ DONE | DONE 2026-06-04 (Wave B). NPD Builder writes initial shared BOM + bom.* events (mig 099) — merged; immutability/idempotency/RLS verified |
| T-094 | FG canonical terminology compatibility pass (UI/i18n) | ⬜ PENDING | Blocked by T-056, T-058, T-095 |
| T-095 | G3 create/map FG candidate for NPD project | ✅ DONE | DONE 2026-06-04 (parallel ramp). G3 create/map FG candidate — creates product/FG row (composite PK) on G2→G3 transition, linked to npd_project. coupled with T-058. merged |
| T-096 | releaseNpdProjectToFactory | ⬜ PENDING | Blocked by T-056, T-058, T-092, T-093, T-095, T-097 |
| T-097 | Shared factory release status/read model and events | ✅ DONE | DONE 2026-06-04 (Wave C). Shared factory release status read-model (mig 125) + events — Opus review PASS (canonical boundaries clean, Technical-approval gate at DB trigger, D365 no-op). merged |
| T-098 | Full Brief→Project→G3 FG→G4 release→Technical E2E | ⬜ PENDING | Blocked by most of the above |
| T-099 | Allergens cascade bulk-rebuild worker | ✅ DONE | DONE 2026-06-04 (Wave C). Allergen cascade bulk-rebuild worker (mig 139) — merged (post-merge import-path fixed) |
| T-100 | Stage-Gate G4 Launched closeout + Trial/Pilot/Handover | ⬜ PENDING | Blocked by T-058, T-093, T-095, T-096, T-097, T-098 |
| T-101 | Add npd permission strings to enum | ✅ DONE | DONE 2026-06-04 (Wave B). npd.* permission enum + eslint baseline (no migration — code) — 10/10; T-006 seed verified FULLY consistent. merged |
| T-102 | UI: FA Procurement tab | ⬜ PENDING | Tab button in fa-tabs.tsx; no content component; blocked by T-009, T-014, T-016, T-020 |
| T-103 | UI: FA Commercial tab | ⬜ PENDING | Same situation as T-102 |
| T-104 | UI: FA Planning tab | ⬜ PENDING | Same situation as T-102 |
| T-105 | WIRING: FA planning/commercial tabs | ⬜ PENDING | Blocked by T-101, T-102, T-103, T-104 |
| T-106 | PARITY: FA planning/commercial tabs | ⬜ PENDING | Blocked by T-101–T-105 |
| T-107 | UI: GateChecklistPanel | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). GateChecklistPanel — real gate_checklist_items via T-057, per-gate progress, toggle via T-058, parity (gate-screens.jsx:106-258), RTL, tsc0, i18n npd.gateChecklist. kira-ui |
| T-108 | UI: AdvanceGateModal | ✅ DONE | DONE 2026-06-04 (ramp 3). AdvanceGateModal — advanceProjectGate(T-058), checklist completeness gate, parity (gate-screens.jsx:261-373), RTL, tsc0, i18n npd.advanceGateModal. kira-ui |
| T-109 | UI: GateApprovalModal | ✅ DONE | DONE 2026-06-04 (ramp 3). GateApprovalModal — approveProjectGate(T-058) e-sign, parity (gate-screens.jsx:378-522), RTL, tsc0, i18n npd.gateApprovalModal. kira-ui. FLAG: T-058 reject requires password but UI omits it on reject — T-111 wiring must reconcile |
| T-110 | UI: ApprovalHistoryTimeline | ✅ DONE | DONE 2026-06-04 (ramp 3). ApprovalHistoryTimeline — real gate_approvals (packages/queries listApprovalHistory), e-sign disclosure, parity (gate-screens.jsx:525-616), RTL+integration, tsc0, i18n npd.approvalHistory. kira-ui |
| T-111 | WIRING: Gate screen | ⬜ PENDING | Blocked by T-107–T-110 |
| T-112 | PARITY: Gate screen components | ⬜ PENDING | Blocked by T-111 |
| T-113 | UI: NutritionPanel (per-100g traffic-light bars) | ⬜ PENDING | Blocked by T-065 |
| T-114 | UI: CostPanel | ⬜ PENDING | Blocked by T-065 |
| T-115 | UI: AllergenPanel (EU14 presence badges) | ⬜ PENDING | Blocked by T-065 |
| T-116 | UI: CompositionBar (horizontal stacked %) | ⬜ PENDING | Blocked by T-065 |
| T-117 | WIRING: FormulationEditor panels | ⬜ PENDING | Blocked by T-066, T-113–T-116 |
| T-118 | PARITY: FormulationEditor panels | ⬜ PENDING | Blocked by T-113–T-117 |
| T-119 | UI: Brief list page | ✅ DONE | DONE 2026-06-04 (parallel ramp). Brief list page — real brief rows org-scoped, Linked-Project column (e2e-spine), parity (brief-screens.jsx:7-82), RTL, tsc0, i18n npd.briefList. kira-ui |
| T-120 | UI: Brief detail page | ✅ DONE | DONE 2026-06-04 (parallel ramp). Brief detail page — brief+brief_lines (Section A/B), wired saveBriefDraft (T-031), parity (brief-screens.jsx:84-231), RTL, tsc0, i18n npd.briefDetail. kira-ui |
| T-121 | WIRING: Brief list→detail navigation | ⬜ PENDING | Blocked by T-119, T-120 |
| T-122 | PARITY: Brief list + detail Playwright | ⬜ PENDING | Blocked by T-119–T-121 |
| T-123 | UI: D365 Build modal | ⬜ PENDING | Button exists in fa-right-panel but no modal; blocked by T-044 |
| T-124 | UI: D365 Wizard modal — steps 1-4 | ⬜ PENDING | Blocked by T-044 |
| T-125 | UI: D365 Wizard modal — steps 5-8 + SSE | ⬜ PENDING | Blocked by T-044, T-124 |
| T-126 | WIRING: D365 modals wire into FA detail | ⬜ PENDING | Blocked by T-123, T-124, T-125 |
| T-127 | PARITY: D365 modals Playwright | ⬜ PENDING | Blocked by T-123–T-126 |
| T-128 | UI: Pipeline TableView | ✅ DONE | DONE 2026-06-04 (ramp 3). Pipeline TableView — real npd_projects(T-057), sortable + bulk toolbar, parity (pipeline.jsx:54-88), RTL, tsc0, i18n npd.pipelineTable. kira-ui |
| T-129 | UI: Pipeline SplitView + ProjectDetailPanel | ✅ DONE | DONE 2026-06-04 (ramp 3). Pipeline SplitView + ProjectDetailPanel — real projects(T-057), URL ?selected, <1280px fallback, parity (pipeline.jsx:89-131), RTL, tsc0, i18n npd.pipelineSplit. kira-ui |
| T-130 | WIRING: Pipeline page tabbed view switcher | ⬜ PENDING | Blocked by T-059, T-128, T-129 |
| T-131 | PARITY: Pipeline views Playwright + axe | ⬜ PENDING | Blocked by T-128–T-130 |
| T-132 | UI: Dashboard KPI counters region | ⏸ BLOCKED | dashboard-counters.tsx exists but no page wiring, no real data, no parity evidence; duplicate route tree issue |
| T-133 | UI: Dashboard Pipeline preview region | ⏸ BLOCKED | dashboard-pipeline-preview.tsx exists but same gaps as T-132 |
| T-134 | WIRING: NPD Dashboard page assembly | ⬜ PENDING | Blocked by T-132, T-133 |
| T-135 | PARITY: NPD Dashboard Playwright + axe | ⬜ PENDING | Blocked by T-132–T-134 |
| T-136 | UI: FA detail page shell + tabs container | ✅ DONE | DONE 2026-06-04 (parallel ramp 2). FA detail shell + tabs container — real product core (composite PK), 8 dept tabs, history tab preserved (T-027), parity (fa-screens.jsx:300-401), RTL, tsc0, i18n npd.faDetail. kira-ui |
| T-137 | UI: FA right panel sidebar | ⏸ BLOCKED | fa-right-panel.tsx exists with mock data; no real data; no modal wiring; no parity evidence |
| T-138 | WIRING: FA detail shell + right panel + tabs layout | ⬜ PENDING | Blocked by T-136, T-137; page.tsx does not compose fa-right-panel |
| T-139 | PARITY: FA detail shell Playwright + axe | ⬜ PENDING | Blocked by T-136–T-138 |
