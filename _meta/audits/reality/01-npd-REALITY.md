# 01-npd — Reality Audit (2026-06-02)

## Counts
- task files: 139 | manifest task_count: 139 | STATUS rows: 0 (no prior STATUS.md) → reconciliation: clean, first audit

### Task type breakdown
| Type | Count |
|---|---|
| T1-schema | 25 |
| T2-api | 36 |
| T3-ui | 40 |
| T4-wiring-test | 25 |
| T5-seed | 4 |
| T0-root | 8 |
| docs | 1 |
| **Total** | **139** |

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | product table + fa compat view DDL | T1-schema | ⛔ MISSING | packages/db/migrations/0010_product_and_fa_view.sql absent | No product table; no fa view; no Drizzle schema; no RLS test |
| T-002 | prod_detail table + indexes | T1-schema | ⛔ MISSING | packages/db/src/schema/prod_detail.ts absent | All downstream cascade tasks blocked |
| T-003 | Reference.DeptColumns metadata table | T1-schema | ⛔ MISSING | No migration; no schema file | |
| T-004 | Reference.ManufacturingOperations table | T1-schema | ⛔ MISSING | No NPD-specific migration | Note: 012-manufacturing-ops.sql exists as foundation migration but does NOT contain DeptColumns or the Reference schema required by T-004 |
| T-005 | Reference lookup tables (PackSizes, Templates, etc.) | T1-schema | ⛔ MISSING | | |
| T-006 | Reference.RolePermissions schema + Apex seed | T1-schema | ⛔ MISSING | Partial: RBAC pkg has FG_CREATE/FG_EDIT/BRIEF_CONVERT_TO_NPD_PROJECT but no RolePermissions seed migration; T-101 explicitly calls out the gap | Partial RBAC perms in packages/rbac/src/permissions.enum.ts |
| T-007 | outbox_events emitter wrapper for fa.* events | T2-api | 🟡 STUB | packages/outbox/src/events.enum.ts: FG_CREATED alias exists + LegacyEventAlias maps fa.created→FG_CREATED | No emitFaEvent wrapper function; no fa-specific emit helper; event type present but action layer absent |
| T-008 | Server Action createFa | T2-api | ⛔ MISSING | apps/web/app/(npd)/fa/actions/create-fa.ts absent | No fa actions directory at all |
| T-009 | Server Action updateFaCell + reset_built trigger | T2-api | ⛔ MISSING | | |
| T-010 | Cascade Chain 1: Pack_Size → Line → Equipment_Setup | T2-api | ⛔ MISSING | | |
| T-011 | Cascade Chain 2: Manufacturing_Operation → Intermediate | T2-api | ⛔ MISSING | | |
| T-012 | Cascade Chain 3: Recipe_Components → Ingredient_Code | T2-api | ⛔ MISSING | | |
| T-013 | Cascade Chain 4: Template → ApplyTemplate to ProdDetail | T2-api | ⛔ MISSING | | |
| T-014 | Schema-driven Zod runtime from Reference.DeptColumns | T2-api | ⛔ MISSING | | Depends on T-003/T-005 which are missing |
| T-015 | IsAllRequiredFilled + Done_<Dept> + Status_Overall view | T1-schema | ⛔ MISSING | | |
| T-016 | Reference.DeptColumns Apex baseline seed (69 cols) | T5-seed | ⛔ MISSING | | |
| T-017 | Server Action closeDeptSection | T2-api | ⛔ MISSING | | |
| T-018 | Autofilter logic + reopenDeptSection Server Action | T2-api | ⛔ MISSING | | |
| T-019 | UI: FA list page (fa_list prototype) | T3-ui | ⛔ MISSING | apps/web/app/(npd)/fa/page.tsx absent | No FA list page exists (only detail page shell) |
| T-020 | ROOT: FA detail page shell group | T0-root | 🟡 STUB | apps/web/app/(npd)/fa/[productCode]/page.tsx exists + fa-tabs.tsx + fa-right-panel.tsx | Page renders "deferred-empty" tab content; no real data; no listFaByDept wiring; props are hardcoded/mocked; no parity evidence |
| T-021 | UI: FA Create modal | T3-ui | ⛔ MISSING | | |
| T-022 | UI: Dept Close modal | T3-ui | ⛔ MISSING | | |
| T-023 | UI: FA Core tab (schema-driven form) | T3-ui | ⛔ MISSING | | Tab stub exists in fa-tabs.tsx but renders "deferred-empty" |
| T-024 | UI: FA Production tab + ProdDetail rows editor | T3-ui | ⛔ MISSING | | Same stub |
| T-025 | ROOT: FA planning/commercial tabs group | T0-root | ⛔ MISSING | | |
| T-026 | UI: FA Technical tab shell | T3-ui | ⛔ MISSING | | |
| T-027 | UI: FA History tab + audit_events timeline | T3-ui | ⛔ MISSING | | |
| T-028 | V03/V04 validators (Pack_Size in Reference; D365 mapping) | T2-api | ⛔ MISSING | | |
| T-029 | Server Action deleteFa | T2-api | ⛔ MISSING | | |
| T-030 | brief + brief_lines tables (NPD-b schema) | T1-schema | ⛔ MISSING | | |
| T-031 | Server Actions: createBrief + saveBriefDraft | T2-api | ⛔ MISSING | | |
| T-032 | Reference.BriefFieldMapping seed | T5-seed | ⛔ MISSING | | |
| T-033 | Server Action convertBriefToFa | T2-api | ⛔ MISSING | | |
| T-034 | ROOT: Brief module UI group | T0-root | ⛔ MISSING | | |
| T-035 | UI: Brief Create + Brief Convert modals | T3-ui | ⛔ MISSING | | |
| T-036 | Reference.Allergens + Allergens_by_RM + Allergens_agg tables | T1-schema | ⛔ MISSING | | |
| T-037 | fa_allergen_overrides table + audit chain | T1-schema | ⛔ MISSING | | |
| T-038 | Allergen cascade engine + fa_allergen_cascade view | T2-api | ⛔ MISSING | | |
| T-039 | Server Actions: setAllergenOverride + V07 validator | T2-api | ⛔ MISSING | | |
| T-040 | UI: Allergen Cascade widget + Override modal | T3-ui | ⛔ MISSING | | |
| T-041 | Reference.D365_Constants table + Apex seed | T1-schema | ⛔ MISSING | | |
| T-042 | exceljs Builder generator: 8 tabs per FA | T2-api | ⛔ MISSING | | |
| T-043 | fa_builder_outputs storage + signed URL service | T2-api | ⛔ MISSING | | |
| T-044 | Server Action buildD365/export | T2-api | ⛔ MISSING | | |
| T-045 | fa_bom_view + bom_export_csv Server Action | T2-api | ⛔ MISSING | | |
| T-046 | ROOT: D365 integration UI group | T0-root | ⛔ MISSING | | |
| T-047 | Wizard step Server Actions (validate/dataPreview/build) | T2-api | ⛔ MISSING | | |
| T-048 | dashboard_summary + launch_alerts + missing_requirements view | T1-schema | ⛔ MISSING | | |
| T-049 | Reference.AlertThresholds + d365_import_cache tables | T1-schema | ⛔ MISSING | | |
| T-050 | Reference.AlertThresholds default seed | T5-seed | ⛔ MISSING | | |
| T-051 | Dashboard Server Actions: getDashboardSummary + getAlerts | T2-api | ⛔ MISSING | | |
| T-052 | ROOT: NPD Dashboard page group | T0-root | 🟡 STUB | apps/web/app/(npd)/_components/dashboard-counters.tsx + dashboard-pipeline-preview.tsx | Components accept props but no page.tsx wiring them; no real Supabase data; hardcoded mock prop shapes; no dashboard route at /(npd)/dashboard |
| T-053 | E2E: dashboard refresh + alert thresholds smoke | T4-wiring-test | ⛔ MISSING | | |
| T-054 | npd_projects + gate_checklist_items + gate_approvals tables | T1-schema | ⛔ MISSING | | |
| T-055 | Reference.GateChecklistTemplates table | T1-schema | ⛔ MISSING | | |
| T-056 | Default G0-G4 GateChecklistTemplates seed | T5-seed | ⛔ MISSING | | |
| T-057 | createProject + listProjects + getProject Server Actions | T2-api | ⛔ MISSING | | |
| T-058 | advanceProjectGate + approveProjectGate + rollbackGate | T2-api | ⛔ MISSING | | |
| T-059 | UI: Pipeline Kanban view | T3-ui | ⛔ MISSING | | |
| T-060 | ROOT: Pipeline views group (TableView + SplitView) | T0-root | ⛔ MISSING | | |
| T-061 | ROOT: Gate screen components group | T0-root | ⛔ MISSING | | |
| T-062 | E2E: project create → advance G0..G2 → approve G3 | T4-wiring-test | ⛔ MISSING | | |
| T-063 | formulations + formulation_versions + formulation_ingredients tables | T1-schema | ⛔ MISSING | | |
| T-064 | Formulation lifecycle Server Actions | T2-api | ⛔ MISSING | | |
| T-065 | Formulation pure-function compute (cost/nutrition/allergen) | T2-api | ⛔ MISSING | | |
| T-066 | UI: FormulationEditor (RecipeScreen prototype) | T3-ui | ⛔ MISSING | | |
| T-067 | ROOT: FormulationEditor live panels | T0-root | ⛔ MISSING | | |
| T-068 | E2E: formulation edit → submit-for-trial → lock + verify | T4-wiring-test | ⛔ MISSING | | |
| T-069 | nutrition_profiles + nutrition_allergens + nutri_score tables | T1-schema | ⛔ MISSING | | |
| T-070 | costing_breakdowns + costing_waterfall_steps tables | T1-schema | ⛔ MISSING | | |
| T-071 | DEFERRED/CROSS-MODULE: Sensory schema | T1-schema | ⛔ MISSING | | Deferred by design (Technical-owned) |
| T-072 | Nutrition computation Server Action + Nutri-Score | T2-api | ⛔ MISSING | | |
| T-073 | Costing 9-step waterfall + scenario Server Action | T2-api | ⛔ MISSING | | |
| T-074 | UI: NutritionScreen | T3-ui | ⛔ MISSING | | |
| T-075 | UI: CostingScreen | T3-ui | ⛔ MISSING | | |
| T-076 | DEFERRED/CROSS-MODULE: Sensory UI | docs | ⛔ MISSING | | Deferred by design |
| T-077 | Reference.ApprovalChainTemplates table | T1-schema | ⛔ MISSING | | |
| T-078 | Approval criteria (C1-C7) evaluator Server Action | T2-api | ⛔ MISSING | | |
| T-079 | UI: ApprovalScreen | T3-ui | ⛔ MISSING | | |
| T-080 | risks table + V18 built-blocker trigger | T1-schema | ⛔ MISSING | | |
| T-081 | risks CRUD + lifecycle Server Actions | T2-api | ⛔ MISSING | | |
| T-082 | UI: RiskRegisterScreen + RiskAddModal | T3-ui | ⛔ MISSING | | |
| T-083 | compliance_docs table + storage policy | T1-schema | ⛔ MISSING | | |
| T-084 | Compliance docs upload + signed URL + soft-delete | T2-api | ⛔ MISSING | | |
| T-085 | compliance_docs_expiry_scan SECURITY DEFINER cron | T2-api | ⛔ MISSING | | |
| T-086 | UI: ComplianceDocsScreen + DocUploadModal | T3-ui | ⛔ MISSING | | |
| T-087 | E2E: V18 built-blocker (high-risk → cannot build) | T4-wiring-test | ⛔ MISSING | | |
| T-088 | E2E: compliance doc upload → expiry job → dashboard | T4-wiring-test | ⛔ MISSING | | |
| T-089 | GDPR right-to-erasure function | T1-schema | ⛔ MISSING | | |
| T-090 | d365_import_cache_meta view + scheduled sync worker | T2-api | ⛔ MISSING | | |
| T-091 | E2E: dashboard interactive controls | T4-wiring-test | ⛔ MISSING | | |
| T-092 | Shared BOM SSOT schema | T1-schema | ⛔ MISSING | | |
| T-093 | API/backfill: NPD Builder writes initial shared BOM | T2-api | ⛔ MISSING | | |
| T-094 | FG canonical terminology compatibility pass (UI/i18n) | T3-ui | ⛔ MISSING | | |
| T-095 | G3 create/map FG candidate for NPD project | T3-ui | ⛔ MISSING | | |
| T-096 | releaseNpdProjectToFactory canonical NPD Builder release | T2-api | ⛔ MISSING | | |
| T-097 | Shared factory release status/read model and events | T2-api | ⛔ MISSING | | |
| T-098 | Full Brief→Project→G3 FG→G4 release→Technical approval E2E | T4-wiring-test | ⛔ MISSING | | |
| T-099 | Allergens cascade bulk-rebuild worker | T4-wiring-test | ⛔ MISSING | | |
| T-100 | Stage-Gate G4 Launched closeout + Trial/Pilot/Handover | T4-wiring-test | ⛔ MISSING | | |
| T-101 | Add npd permission strings to enum | T1-schema | 🟡 STUB | packages/rbac/src/permissions.enum.ts: FG_CREATE/FG_EDIT/BRIEF_CONVERT_TO_NPD_PROJECT/NPD_RELEASED_PRODUCT_EDIT_* exist | Missing: fa.close_dept, fa.delete, fa.build_d365, allergen.override, risk.*, compliance.*, brief.save_draft, formulation.*, approval.*, gate.advance; incomplete |
| T-102 | UI: FA Procurement tab | T3-ui | ⛔ MISSING | | Tab button in fa-tabs.tsx but no content component |
| T-103 | UI: FA Commercial tab | T3-ui | ⛔ MISSING | | Same |
| T-104 | UI: FA Planning tab | T3-ui | ⛔ MISSING | | Same |
| T-105 | WIRING: FA planning/commercial tabs | T4-wiring-test | ⛔ MISSING | | |
| T-106 | PARITY: FA planning/commercial tabs | T4-wiring-test | ⛔ MISSING | | |
| T-107 | UI: GateChecklistPanel | T3-ui | ⛔ MISSING | | |
| T-108 | UI: AdvanceGateModal | T3-ui | ⛔ MISSING | | |
| T-109 | UI: GateApprovalModal | T3-ui | ⛔ MISSING | | |
| T-110 | UI: ApprovalHistoryTimeline | T3-ui | ⛔ MISSING | | |
| T-111 | WIRING: Gate screen | T4-wiring-test | ⛔ MISSING | | |
| T-112 | PARITY: Gate screen components | T4-wiring-test | ⛔ MISSING | | |
| T-113 | UI: NutritionPanel (per-100g traffic-light bars) | T3-ui | ⛔ MISSING | | |
| T-114 | UI: CostPanel (material + labour + overhead + margin) | T3-ui | ⛔ MISSING | | |
| T-115 | UI: AllergenPanel (EU14 presence badges) | T3-ui | ⛔ MISSING | | |
| T-116 | UI: CompositionBar (horizontal stacked %-by-ingredient) | T3-ui | ⛔ MISSING | | |
| T-117 | WIRING: FormulationEditor panels | T4-wiring-test | ⛔ MISSING | | |
| T-118 | PARITY: FormulationEditor panels | T4-wiring-test | ⛔ MISSING | | |
| T-119 | UI: Brief list page | T3-ui | ⛔ MISSING | | |
| T-120 | UI: Brief detail page | T3-ui | ⛔ MISSING | | |
| T-121 | WIRING: Brief list→detail navigation | T4-wiring-test | ⛔ MISSING | | |
| T-122 | PARITY: Brief list + detail Playwright screenshot | T4-wiring-test | ⛔ MISSING | | |
| T-123 | UI: D365 Build modal | T3-ui | ⛔ MISSING | | fa-right-panel.tsx renders a "D365 Build" button but no modal exists |
| T-124 | UI: D365 Wizard modal — steps 1-4 | T3-ui | ⛔ MISSING | | |
| T-125 | UI: D365 Wizard modal — steps 5-8 + SSE | T3-ui | ⛔ MISSING | | |
| T-126 | WIRING: D365 modals wire into FA detail | T4-wiring-test | ⛔ MISSING | | |
| T-127 | PARITY: D365 modals Playwright | T4-wiring-test | ⛔ MISSING | | |
| T-128 | UI: Pipeline TableView | T3-ui | ⛔ MISSING | | |
| T-129 | UI: Pipeline SplitView + ProjectDetailPanel | T3-ui | ⛔ MISSING | | |
| T-130 | WIRING: Pipeline page tabbed view switcher | T4-wiring-test | ⛔ MISSING | | |
| T-131 | PARITY: Pipeline views Playwright + axe | T4-wiring-test | ⛔ MISSING | | |
| T-132 | UI: Dashboard KPI counters region | T3-ui | 🟡 STUB | apps/web/app/(npd)/_components/dashboard-counters.tsx | Component renders 5 tiles from props; no page wiring; no real data; no parity evidence; duplicate at [locale]/(app)/(npd)/... |
| T-133 | UI: Dashboard Pipeline preview region | T3-ui | 🟡 STUB | apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx | Same: UI primitive exists, no page, no real data, no parity evidence |
| T-134 | WIRING: NPD Dashboard page assembly | T4-wiring-test | ⛔ MISSING | | No dashboard page.tsx exists under (npd) |
| T-135 | PARITY: NPD Dashboard Playwright + axe | T4-wiring-test | ⛔ MISSING | | |
| T-136 | UI: FA detail page shell + tabs container | T3-ui | 🟡 STUB | apps/web/app/(npd)/fa/[productCode]/page.tsx + fa-tabs.tsx | Exists but all tab content is "deferred-empty"; no real data; no parity evidence vs fa_detail prototype |
| T-137 | UI: FA right panel sidebar | T3-ui | 🟡 STUB | apps/web/app/(npd)/fa/[productCode]/_components/fa-right-panel.tsx | Component renders mock props; onOpenModal no-ops; no actual modal connections; no parity evidence |
| T-138 | WIRING: FA detail shell + right panel + tabs layout | T4-wiring-test | ⛔ MISSING | | page.tsx doesn't compose fa-right-panel; no layout grid |
| T-139 | PARITY: FA detail shell Playwright + axe | T4-wiring-test | ⛔ MISSING | | |

## Summary counts
- ✅ IMPLEMENTED: **0**
- 🟡 STUB: **8** (T-007, T-020, T-052, T-101, T-132, T-133, T-136, T-137)
- ⛔ MISSING: **130**
- 👻 PHANTOM: 0
- 🔴 BROKEN: 0
- 🧩 EXTRA: 1 (see below)

## Phantom / carry-forward backlog
- None from prior STATUS (no prior STATUS.md existed).
- T-089 references cross-module dependency `00-foundation/T-113` (GDPR erasure needs foundation RLS hook) — that task is in foundation's list; marked ⛔ here independently.

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/npd/page.tsx` — Module stub/landing page. No task owns it; it is a Walking Skeleton contribution from Wave 0. Not an NPD feature task. Verdict: **🧩 EXTRA** — belongs to skeleton/wave0 work.
- Duplicate NPD route trees: code exists at both `apps/web/app/(npd)/...` AND `apps/web/app/[locale]/(app)/(npd)/...`. The `[locale]/(app)/(npd)/...` tree appears to be the canonical route per the project's locale-aware layout; the `(npd)/...` tree is vestigial or test-only. No task owns either. Both are stubs. **Integration risk** — live routes may resolve to the wrong tree.

## Top integration risks

1. **Zero schema = zero everything.** T-001 (product table) is the root of 130+ downstream tasks. Nothing in 01-npd can start without migrations 0010–0015 and their Drizzle schemas. The foundation migrations (000–050) are in place but none cover the `product`, `prod_detail`, `brief`, `npd_projects`, `formulations`, `risks`, or `compliance_docs` tables. First task to unblock the entire module: T-001.

2. **Duplicate route tree ambiguity.** FA detail page, dashboard components, and NPD skeleton landing exist at two different route paths: `(npd)/fa/[productCode]` (legacy/test tree) and `[locale]/(app)/(npd)/fa/[productCode]` (locale-aware, canonical). If both trees are active on the deployed app, Next.js may serve either. When real data wiring begins, this ambiguity will cause inconsistent hydration bugs and is a merge hazard.

3. **RBAC permissions enum is incomplete (T-101 unresolved).** The outbox events enum has partial fa.* aliases (FG_CREATED maps from fa.created) but is missing `fa.close_dept`, `fa.delete`, `fa.build_d365`, `allergen.override`, `risk.*`, `compliance.*`, `formulation.*`, `gate.advance`, and `approval.*`. Any T2-api task that needs server-side RBAC gating will fail at compile/runtime when those Permission constants are missing. T-101 must land before any T2-api task runs.

## Skeleton contribution

- The NPD module landing page (`apps/web/app/[locale]/(app)/(modules)/npd/page.tsx`) renders a `ModuleStubNotice` — this is the skeleton delivery for Wave 0: clicking "NPD" in the sidebar navigates to a page that exists and shows real i18n text (from Supabase-backed locale strings). This satisfies the skeleton's "menu-driven product" requirement for this module.
- The FA detail shell + tabs (`fa-tabs.tsx`, `fa-right-panel.tsx`, page.tsx) were added in Wave 0 as shell components; they navigate but show no real data. They contribute structural routing only.
- Dashboard components (`dashboard-counters.tsx`, `dashboard-pipeline-preview.tsx`) are pure UI primitives with no data wiring — skeleton contribution is shape/contract only.
- **Skeleton verdict for 01-npd:** The module is reachable from the shell navigation. No real Supabase NPD data is displayed. All FA detail, brief, pipeline, formulation, allergen, compliance, risk, and stage-gate features are 0% implemented.
