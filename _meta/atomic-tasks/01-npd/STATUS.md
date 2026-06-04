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
| T-009 | Server Action updateFaCell + reset_built trigger | ⬜ PENDING | Blocked by T-001, T-003, T-006, T-007 |
| T-010 | Cascade Chain 1: Pack_Size → Line → Equipment_Setup | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 1 Pack_Size→Line→Equipment (mig 127, packages/cascade-engine) + fa.cascade event — merged |
| T-011 | Cascade Chain 2: Manufacturing_Operation → Intermediate | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 2 Manufacturing_Operation→Intermediate (packages/cascade-engine/chain2 + V06 suffix-match validator) — merged (scaffold conflict resolved) |
| T-012 | Cascade Chain 3: Recipe_Components → Ingredient_Code | ✅ DONE | DONE 2026-06-04 (Wave C). Cascade Chain 3 Recipe_Components→Ingredient_Code (mig 129, cascade-engine/chain3) + fa.recipe_changed event — merged (type-fixed post-merge) |
| T-013 | Cascade Chain 4: Template → ApplyTemplate to ProdDetail | ⬜ PENDING | Blocked by T-001, T-002, T-005, T-011 |
| T-014 | Schema-driven Zod runtime from Reference.DeptColumns | ✅ DONE | DONE 2026-06-04 (Wave C). Schema-driven Zod runtime from Reference.DeptColumns (mig 123, packages/schema-runtime) — Codex+rework (getAppConnection RLS, boolean/formula handling). merged |
| T-015 | IsAllRequiredFilled + Done_<Dept> + Status_Overall view | ✅ DONE | DONE 2026-06-04 (Wave B). IsAllRequiredFilled + Done_<Dept> + fa_status_overall view (mig 097, security_invoker, schema-driven) — merged |
| T-016 | Reference.DeptColumns Apex baseline seed (69 cols) | ✅ DONE | DONE 2026-06-04 (Wave B). DeptColumns Apex baseline seed 69 cols (mig 095, Sonnet, 6/6, idempotent) — merged |
| T-017 | Server Action closeDeptSection | ⬜ PENDING | Blocked by T-001, T-006, T-007, T-015 |
| T-018 | Autofilter logic + reopenDeptSection Server Action | ⬜ PENDING | Blocked by T-001, T-006, T-017 |
| T-019 | UI: FA list page (fa_list prototype) | ⬜ PENDING | Blocked by T-001, T-018; no fa/page.tsx |
| T-020 | ROOT: FA detail page shell group | ⏸ BLOCKED | page.tsx + fa-tabs.tsx + fa-right-panel.tsx exist but all tab content is "deferred-empty"; no real data; no parity evidence |
| T-021 | UI: FA Create modal | ⬜ PENDING | Blocked by T-008 |
| T-022 | UI: Dept Close modal | ⬜ PENDING | Blocked by T-015, T-017 |
| T-023 | UI: FA Core tab (schema-driven form) | ⬜ PENDING | Blocked by T-009, T-010, T-012, T-014, T-020 |
| T-024 | UI: FA Production tab + ProdDetail rows editor | ⬜ PENDING | Blocked by T-002, T-004, T-010, T-011, T-020 |
| T-025 | ROOT: FA planning/commercial tabs group | ⬜ PENDING | Blocked by T-009, T-014, T-016, T-020 |
| T-026 | UI: FA Technical tab shell | ⬜ PENDING | Blocked by T-014, T-020, T-025 |
| T-027 | UI: FA History tab + audit_events timeline | ⬜ PENDING | Blocked by T-001, T-007, T-020 |
| T-028 | V03/V04 validators (Pack_Size; D365 mapping) | ✅ DONE | DONE 2026-06-04 (Wave C). V03/V04 validators (mig 111, packages/validation) — merged |
| T-029 | Server Action deleteFa | ⬜ PENDING | Blocked by T-001, T-006, T-007 |
| T-030 | brief + brief_lines tables (NPD-b schema) | ✅ DONE | DONE 2026-06-03 (Wave A1). brief + brief_lines (mig 081) — merged; npd_project_id now nullable no-FK (npd_projects owned by T-054; FK deferred to Wave C) |
| T-031 | Server Actions: createBrief + saveBriefDraft | ✅ DONE | DONE 2026-06-04 (Wave C). createBrief + saveBriefDraft Server Actions — Codex+rework (mock→REAL integration tests, transactional idempotency-resume). merged |
| T-032 | Reference.BriefFieldMapping seed | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.BriefFieldMapping table + Apex seed (mig 100) — merged |
| T-033 | Server Action convertBriefToFa | ⬜ PENDING | Blocked by T-001, T-002, T-008, T-030, T-031, T-032 |
| T-034 | ROOT: Brief module UI group | ⬜ PENDING | Blocked by T-030, T-031 |
| T-035 | UI: Brief Create + Brief Convert modals | ⬜ PENDING | Blocked by T-031, T-033, T-095 |
| T-036 | Reference.Allergens + Allergens_by_RM + Allergens_agg tables | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.Allergens + by_RM + agg, EU14 (mig 082) — merged |
| T-037 | fa_allergen_overrides table + audit chain | ✅ DONE | DONE 2026-06-04 (Wave B). fa_allergen_overrides + append-only audit chain (mig 094) — Codex+rework (revoke UPD/DEL, SECURITY DEFINER supersede trigger, 9/9), merged |
| T-038 | Allergen cascade engine + fa_allergen_cascade view | ✅ DONE | DONE 2026-06-04 (Wave C). Allergen cascade ENGINE + fa_allergen_cascade view (mig 114) — Opus+rework (product.allergens/may_contain cols, update_fa_allergen_set fn+action, may_contain separate, conditional only-confirmed, fa.allergens_changed event-on-change, 18 tests). Codex review. NEW perm npd.allergen.write needs seed (module-close) |
| T-039 | Server Actions: setAllergenOverride + V07 validator | ✅ DONE | DONE 2026-06-04 (Wave C). setAllergenOverride + V07 validator (packages/validation) + REAL action integration test — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-040 | UI: Allergen Cascade widget + Override modal | ⬜ PENDING | Blocked by T-026, T-038, T-039 |
| T-041 | Reference.D365_Constants table + Apex seed | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.D365_Constants + Apex seed (mig 083) — merged |
| T-042 | exceljs Builder generator: 8 tabs per FA | ⬜ PENDING | Blocked by T-001, T-002, T-041 |
| T-043 | fa_builder_outputs storage + signed URL service | ✅ DONE | DONE 2026-06-04 (Wave C). fa_builder_outputs storage + signed URL (mig 112, packages/storage) — merged |
| T-044 | Server Action buildD365/export | ⬜ PENDING | Blocked by T-006, T-007, T-039, T-042, T-043, T-080, T-081 |
| T-045 | fa_bom_view + bom_export_csv Server Action | ⬜ PENDING | Blocked by T-001, T-006, T-028 |
| T-046 | ROOT: D365 integration UI group | ⬜ PENDING | Blocked by T-044 |
| T-047 | Wizard step Server Actions (validate/dataPreview/build) | ⬜ PENDING | Blocked by T-042, T-043, T-044, T-045, T-080, T-081 |
| T-048 | dashboard_summary + launch_alerts + missing_requirements view | ✅ DONE | DONE 2026-06-04 (Wave C). dashboard_summary/launch_alerts/missing_required_cols views (mig 106, security_invoker) — merged |
| T-049 | Reference.AlertThresholds + d365_import_cache tables | ✅ DONE | DONE 2026-06-03 (Wave A1). Reference.AlertThresholds + d365_import_cache (mig 084) — merged (canonical AlertThresholds owner) |
| T-050 | Reference.AlertThresholds default seed | ✅ DONE | DONE 2026-06-04 (Wave B). AlertThresholds default seed (mig 096, Sonnet, 9/9, matches T-049 threshold_key) — merged |
| T-051 | Dashboard Server Actions: getDashboardSummary + getAlerts | ✅ DONE | DONE 2026-06-04 (Wave C). Dashboard Server Actions getDashboardSummary+getAlerts + d365.cache.refreshed event (mig 118) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-052 | ROOT: NPD Dashboard page group | ⏸ BLOCKED | dashboard-counters.tsx + dashboard-pipeline-preview.tsx exist as stubs; no dashboard page.tsx; no real data |
| T-053 | E2E: dashboard refresh + alert thresholds smoke | ⬜ PENDING | Blocked by T-051, T-052 |
| T-054 | npd_projects + gate_checklist_items + gate_approvals tables | ✅ DONE | DONE 2026-06-03 (Wave A1). npd_projects + gate_checklist_items + gate_approvals (mig 085) — merged; brief FK deferred |
| T-055 | Reference.GateChecklistTemplates table | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.GateChecklistTemplates (mig 092) — merged |
| T-056 | Default G0-G4 GateChecklistTemplates seed | ✅ DONE | DONE 2026-06-04 (Wave B). Default G0-G4 GateChecklistTemplates seed (mig 101, Sonnet, 9/9 idempotent) — merged |
| T-057 | createProject + listProjects + getProject Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). createProject/list/get Server Actions + npd.project.created event (mig 103) — Codex+rework (typecheck fix, code constraint→(org_id,code) fixing T-054 global-unique bug, real integration tests). merged |
| T-058 | advanceProjectGate + approveProjectGate + rollbackGate | ⬜ PENDING | Blocked by T-054, T-057, T-095 |
| T-059 | UI: Pipeline Kanban view | ⬜ PENDING | Blocked by T-057, T-058 |
| T-060 | ROOT: Pipeline views group | ⬜ PENDING | Blocked by T-057, T-059 |
| T-061 | ROOT: Gate screen components group | ⬜ PENDING | Blocked by T-057, T-058 |
| T-062 | E2E: project create → advance G0..G2 → approve G3 | ⬜ PENDING | Blocked by T-057, T-058, T-059, T-061, T-095, T-096, T-097 |
| T-063 | formulations + formulation_versions + formulation_ingredients tables | ✅ DONE | DONE 2026-06-04 (Wave B). formulations+versions+ingredients+audit+cache (mig 093, 5 tables, NUMERIC, DEFERRABLE circular FK) — merged. Nit: audit_log org-link FK (T-064 follow) |
| T-064 | Formulation lifecycle Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). Formulation lifecycle actions (draft/trial/lock) + mig 104 (formulation.* outbox events + locked-ingredient immutability trigger) — Codex+rework (replaced mock-only tests with REAL DB integration). merged |
| T-065 | Formulation pure-function compute (cost/nutrition/allergen) | ✅ DONE | DONE 2026-06-04 (Wave C). Formulation pure compute (cost/nutrition/allergen) @monopilot/domain + recompute/compare actions — Opus impl-hard + rework (nutrition load via NEW Reference.RawMaterials mig 107, money string-only, version existence checks, seq-keyed diff). Codex review. NUMERIC-exact. merged |
| T-066 | UI: FormulationEditor (RecipeScreen prototype) | ⬜ PENDING | Blocked by T-064 |
| T-067 | ROOT: FormulationEditor live panels | ⬜ PENDING | Blocked by T-065, T-066 |
| T-068 | E2E: formulation edit → submit-for-trial → lock | ⬜ PENDING | Blocked by T-064, T-065, T-066, T-067 |
| T-069 | nutrition_profiles + nutrition_allergens + nutri_score tables | ✅ DONE | DONE 2026-06-03 (Wave A1 rework). nutrition + unique NULLS NOT DISTINCT fix (mig 086); 6/6 green — merged |
| T-070 | costing_breakdowns + costing_waterfall_steps tables | ✅ DONE | DONE 2026-06-03 (Wave A1). costing_breakdowns + waterfall_steps (mig 087, NUMERIC-exact) — merged |
| T-071 | DEFERRED/CROSS-MODULE: Sensory schema (Technical-owned) | ⬜ PENDING | Deferred by design; owned by 03-technical |
| T-072 | Nutrition computation Server Action + Nutri-Score | ✅ DONE | DONE 2026-06-04 (Wave C). Nutrition compute Server Action + Nutri-Score (mig 110, @monopilot/domain) — Codex, REAL integration tests, NUMERIC-exact. merged. Nit: Nutri-Score fiber/FVN=0 (RM schema lacks cols, deviation) |
| T-073 | Costing 9-step waterfall + scenario Server Action | ✅ DONE | DONE 2026-06-04 (Wave C). Costing 9-step waterfall + scenario action (apps/web/lib/costing) + mig 108 (scenario params jsonb) — Opus impl-hard + rework (exact margin gate, persist params, bounds). Codex review. NUMERIC-exact. merged |
| T-074 | UI: NutritionScreen | ⬜ PENDING | Blocked by T-072 |
| T-075 | UI: CostingScreen | ⬜ PENDING | Blocked by T-073 |
| T-076 | DEFERRED/CROSS-MODULE: Sensory UI (Technical-owned) | ⬜ PENDING | Deferred by design; owned by 03-technical |
| T-077 | Reference.ApprovalChainTemplates table | ✅ DONE | DONE 2026-06-04 (Wave B). Reference.ApprovalChainTemplates (mig 098, zod) — merged |
| T-078 | Approval criteria (C1-C7) evaluator Server Action | ⬜ PENDING | Blocked by T-064, T-072, T-073, T-077 |
| T-079 | UI: ApprovalScreen | ⬜ PENDING | Blocked by T-061, T-078 |
| T-080 | risks table + V18 built-blocker trigger | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). risks + V18 built-blocker trigger (mig 088) — trigger verified blocks+allows; merged. Note: downgrade-guard may interact w/ T-009 reset_built (Wave C) |
| T-081 | risks CRUD + lifecycle Server Actions | ✅ DONE | DONE 2026-06-04 (Wave C). risks CRUD Server Actions + risk.created event (mig 105) — merged |
| T-082 | UI: RiskRegisterScreen + RiskAddModal | ⬜ PENDING | Blocked by T-081 |
| T-083 | compliance_docs table + storage policy | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). compliance_docs + storage policy + expiry/soft-delete (mig 089) — merged; ready for T-085 expiry cron |
| T-084 | Compliance docs upload + signed URL + soft-delete | ✅ DONE | DONE 2026-06-04 (Wave C). Compliance docs upload + signed URL + soft-delete + compliance_doc.* events (mig 119) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-085 | compliance_docs_expiry_scan SECURITY DEFINER cron | ✅ DONE | DONE 2026-06-04 (Wave C). compliance_docs expiry-scan cron (mig 124, apps/worker) + compliance_doc.expired/expiring events — merged |
| T-086 | UI: ComplianceDocsScreen + DocUploadModal | ⬜ PENDING | Blocked by T-084 |
| T-087 | E2E: V18 built-blocker (high-risk → cannot build) | ⬜ PENDING | Blocked by T-080, T-081, T-082 |
| T-088 | E2E: compliance doc upload → expiry job → dashboard | ⬜ PENDING | Blocked by T-084, T-085, T-086 |
| T-089 | GDPR right-to-erasure function | ✅ DONE | DONE 2026-06-04 (Wave C). NPD GDPR right-to-erasure (mig 115/116) — Opus+rework (production cron registration, gdpr.erasure.execute enum+baseline+seed, prod_detail branch). Codex review. SATISFIES foundation T-115 |
| T-090 | d365_import_cache_meta view + scheduled sync worker | ✅ DONE | DONE 2026-06-04 (Wave C). d365_import_cache_meta view + scheduled sync worker (mig 120, apps/worker) — merged (batch-3: red-line+real-test self-review at time-boundary, not full subagent) |
| T-091 | E2E: dashboard interactive controls | ⬜ PENDING | Blocked by T-052, T-051 |
| T-092 | Shared BOM SSOT schema | ✅ DONE | DONE 2026-06-04 (Wave A1 batch-2). Shared BOM SSOT bom_headers+bom_lines (mig 090, NUMERIC-exact, versioned) — Codex+rework (INSERT immutability guard), merged. Existing bom_item(014) is R13 placeholder, no collision |
| T-093 | API/backfill: NPD Builder writes initial shared BOM | ✅ DONE | DONE 2026-06-04 (Wave B). NPD Builder writes initial shared BOM + bom.* events (mig 099) — merged; immutability/idempotency/RLS verified |
| T-094 | FG canonical terminology compatibility pass (UI/i18n) | ⬜ PENDING | Blocked by T-056, T-058, T-095 |
| T-095 | G3 create/map FG candidate for NPD project | ⬜ PENDING | Blocked by T-031, T-054, T-057, T-058 |
| T-096 | releaseNpdProjectToFactory | ⬜ PENDING | Blocked by T-056, T-058, T-092, T-093, T-095, T-097 |
| T-097 | Shared factory release status/read model and events | ✅ DONE | DONE 2026-06-04 (Wave C). Shared factory release status read-model (mig 125) + events — Opus review PASS (canonical boundaries clean, Technical-approval gate at DB trigger, D365 no-op). merged |
| T-098 | Full Brief→Project→G3 FG→G4 release→Technical E2E | ⬜ PENDING | Blocked by most of the above |
| T-099 | Allergens cascade bulk-rebuild worker | ⬜ PENDING | Blocked by T-011, T-012, T-013 |
| T-100 | Stage-Gate G4 Launched closeout + Trial/Pilot/Handover | ⬜ PENDING | Blocked by T-058, T-093, T-095, T-096, T-097, T-098 |
| T-101 | Add npd permission strings to enum | ✅ DONE | DONE 2026-06-04 (Wave B). npd.* permission enum + eslint baseline (no migration — code) — 10/10; T-006 seed verified FULLY consistent. merged |
| T-102 | UI: FA Procurement tab | ⬜ PENDING | Tab button in fa-tabs.tsx; no content component; blocked by T-009, T-014, T-016, T-020 |
| T-103 | UI: FA Commercial tab | ⬜ PENDING | Same situation as T-102 |
| T-104 | UI: FA Planning tab | ⬜ PENDING | Same situation as T-102 |
| T-105 | WIRING: FA planning/commercial tabs | ⬜ PENDING | Blocked by T-101, T-102, T-103, T-104 |
| T-106 | PARITY: FA planning/commercial tabs | ⬜ PENDING | Blocked by T-101–T-105 |
| T-107 | UI: GateChecklistPanel | ⬜ PENDING | Blocked by T-057, T-058 |
| T-108 | UI: AdvanceGateModal | ⬜ PENDING | Blocked by T-057, T-058 |
| T-109 | UI: GateApprovalModal | ⬜ PENDING | Blocked by T-057, T-058 |
| T-110 | UI: ApprovalHistoryTimeline | ⬜ PENDING | Blocked by T-057, T-058 |
| T-111 | WIRING: Gate screen | ⬜ PENDING | Blocked by T-107–T-110 |
| T-112 | PARITY: Gate screen components | ⬜ PENDING | Blocked by T-111 |
| T-113 | UI: NutritionPanel (per-100g traffic-light bars) | ⬜ PENDING | Blocked by T-065 |
| T-114 | UI: CostPanel | ⬜ PENDING | Blocked by T-065 |
| T-115 | UI: AllergenPanel (EU14 presence badges) | ⬜ PENDING | Blocked by T-065 |
| T-116 | UI: CompositionBar (horizontal stacked %) | ⬜ PENDING | Blocked by T-065 |
| T-117 | WIRING: FormulationEditor panels | ⬜ PENDING | Blocked by T-066, T-113–T-116 |
| T-118 | PARITY: FormulationEditor panels | ⬜ PENDING | Blocked by T-113–T-117 |
| T-119 | UI: Brief list page | ⬜ PENDING | Blocked by T-030, T-031 |
| T-120 | UI: Brief detail page | ⬜ PENDING | Blocked by T-030, T-031 |
| T-121 | WIRING: Brief list→detail navigation | ⬜ PENDING | Blocked by T-119, T-120 |
| T-122 | PARITY: Brief list + detail Playwright | ⬜ PENDING | Blocked by T-119–T-121 |
| T-123 | UI: D365 Build modal | ⬜ PENDING | Button exists in fa-right-panel but no modal; blocked by T-044 |
| T-124 | UI: D365 Wizard modal — steps 1-4 | ⬜ PENDING | Blocked by T-044 |
| T-125 | UI: D365 Wizard modal — steps 5-8 + SSE | ⬜ PENDING | Blocked by T-044, T-124 |
| T-126 | WIRING: D365 modals wire into FA detail | ⬜ PENDING | Blocked by T-123, T-124, T-125 |
| T-127 | PARITY: D365 modals Playwright | ⬜ PENDING | Blocked by T-123–T-126 |
| T-128 | UI: Pipeline TableView | ⬜ PENDING | Blocked by T-057, T-059 |
| T-129 | UI: Pipeline SplitView + ProjectDetailPanel | ⬜ PENDING | Blocked by T-057, T-059 |
| T-130 | WIRING: Pipeline page tabbed view switcher | ⬜ PENDING | Blocked by T-059, T-128, T-129 |
| T-131 | PARITY: Pipeline views Playwright + axe | ⬜ PENDING | Blocked by T-128–T-130 |
| T-132 | UI: Dashboard KPI counters region | ⏸ BLOCKED | dashboard-counters.tsx exists but no page wiring, no real data, no parity evidence; duplicate route tree issue |
| T-133 | UI: Dashboard Pipeline preview region | ⏸ BLOCKED | dashboard-pipeline-preview.tsx exists but same gaps as T-132 |
| T-134 | WIRING: NPD Dashboard page assembly | ⬜ PENDING | Blocked by T-132, T-133 |
| T-135 | PARITY: NPD Dashboard Playwright + axe | ⬜ PENDING | Blocked by T-132–T-134 |
| T-136 | UI: FA detail page shell + tabs container | ⏸ BLOCKED | fa/[productCode]/page.tsx + fa-tabs.tsx exist but all content "deferred-empty"; no prototype parity |
| T-137 | UI: FA right panel sidebar | ⏸ BLOCKED | fa-right-panel.tsx exists with mock data; no real data; no modal wiring; no parity evidence |
| T-138 | WIRING: FA detail shell + right panel + tabs layout | ⬜ PENDING | Blocked by T-136, T-137; page.tsx does not compose fa-right-panel |
| T-139 | PARITY: FA detail shell Playwright + axe | ⬜ PENDING | Blocked by T-136–T-138 |
