# 03-technical — Reality Audit (2026-06-02)

## Counts
- task files: 91 | manifest task_count: 91 | STATUS rows: 0 (STATUS.md created now)
- reconciliation: no discrepancy between file count and manifest

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Migration: items table | T1-schema | ⛔ MISSING | No migration file for `items` table in `packages/db/migrations/` | No Drizzle schema either |
| T-002 | Migration: bom_headers/lines/co_products/snapshots | T1-schema | ⛔ MISSING | No migration file; only `bom_item` R13 placeholder (014-r13-placeholder-tables.sql) exists | Placeholder is identity-columns only, not the BOM schema |
| T-003 | Migration: item_cost_history | T1-schema | ⛔ MISSING | No migration or schema file | |
| T-004 | Migration: allergen profile tables | T1-schema | 🟡 STUB | `public.allergens` reference table exists (042-infra-master.sql, schema/infra-master.ts); EU-14 seed exists (seeds/eu-14-allergens.sql) | Per-item `allergen_profiles`, `manufacturing_op_additions`, `contamination_risk_matrix` tables absent |
| T-005 | Migration: lab_results and supplier_specs | T1-schema | ⛔ MISSING | No migration file | |
| T-006 | Migration: routings and routing_operations | T1-schema | ⛔ MISSING | No migration file | |
| T-007 | Migration: d365_sync_jobs and d365_sync_dlq | T1-schema | ⛔ MISSING | No migration file | |
| T-008 | API: Items list | T2-api | ⛔ MISSING | No `apps/web/app/api/technical/` directory; no `_actions` for items | |
| T-009 | API: Item create | T2-api | ⛔ MISSING | Same as T-008 | |
| T-010 | API: Item detail and update | T2-api | ⛔ MISSING | Same as T-008 | |
| T-011 | API: Item deactivate | T2-api | ⛔ MISSING | Same as T-008 | |
| T-012 | API: BOM list and detail | T2-api | ⛔ MISSING | No BOM Server Actions anywhere | |
| T-013 | API: BOM create draft | T2-api | ⛔ MISSING | Same as T-012 | |
| T-014 | API: BOM approve and publish | T2-api | ⛔ MISSING | Same as T-012 | |
| T-015 | API: BOM version diff | T2-api | ⛔ MISSING | Same as T-012 | |
| T-016 | API: BOM Generator batch | T2-api | ⛔ MISSING | Same as T-012 | |
| T-017 | API: Allergen profile CRUD | T2-api | ⛔ MISSING | No allergen profile Server Actions | |
| T-018 | API: Manufacturing op allergen additions CRUD | T2-api | ⛔ MISSING | Same | |
| T-019 | API: Allergen contamination risk matrix CRUD | T2-api | ⛔ MISSING | Same | |
| T-020 | API: Technical lab-results read model | T2-api | ⛔ MISSING | No lab_results Server Actions | |
| T-021 | API: Cost history endpoints | T2-api | ⛔ MISSING | No cost_history Server Actions | |
| T-022 | API: Routings + routing_operations CRUD | T2-api | ⛔ MISSING | No routing Server Actions | |
| T-023 | API: Routing cost preview | T2-api | ⛔ MISSING | Same | |
| T-024 | Wiring: Allergen cascade rule deployment | T5-wiring | ⛔ MISSING | No wiring code; rule_definitions table exists foundation-side but no allergen cascade rules wired | |
| T-025 | Wiring: BOM snapshot at WO creation | T5-wiring | ⛔ MISSING | No BOM schema means no snapshot wiring possible | |
| T-026 | Wiring: ATP swab auto-fail trigger | T5-wiring | ⛔ MISSING | No lab_results table; no trigger | |
| T-027 | Wiring: Schema-driven L3 extension propagation | T5-wiring | ⛔ MISSING | No item extension schema; L3 extension system (02-Settings side) exists but technical wiring absent | |
| T-028 | API + worker: D365 sync job | T2-api | ⛔ MISSING | No `/api/technical/d365/sync` route; `actions/d365/` has connection-test/get/set-constant but not import/export sync job | |
| T-029 | Wiring: D365 push worker + DLQ retry | T5-wiring | ⛔ MISSING | No sync job worker; no d365_sync_dlq table | |
| T-030 | API: D365 connection test + feature flag | T2-api | 🟡 STUB | `actions/d365/test-connection.ts` with `withOrgContext` exists; `actions/d365/get.ts`, `set-constant.ts`, `rotate-secret.ts` exist; D365 connection UI at `settings/integrations/d365/page.tsx` (263 lines, prototype-anchored, test file present) | No `/api/technical/d365/health` route as spec requires; implemented under settings admin not technical module; missing feature-flag gate per task spec |
| T-031 | API: Variance tracking nightly job | T2-api | ⛔ MISSING | No nightly job; no catch-weight variance tracking | |
| T-032 | UI: TEC-010 Item List page | T3-ui | ⛔ MISSING | No `apps/web/app/[locale]/(app)/(modules)/technical/items/` route | |
| T-033 | UI: TEC-011 Item Create Wizard modal | T3-ui | ⛔ MISSING | Same | |
| T-034 | UI: TEC-012 Item Detail page | T3-ui | ⛔ MISSING | Same | |
| T-035 | UI: TEC-081 Item Deactivate modal | T3-ui | ⛔ MISSING | Same | |
| T-036 | UI: TEC-080 Technical Dashboard | T3-ui | ⛔ MISSING | `technical/page.tsx` is a skeleton count-panel (`bom_item` table count), not the dashboard per spec (5-KPI strip, Recent Changes, Quick Actions, D365 Health). Prototype anchor `other-screens.jsx:370-429` not cited | |
| T-037 | UI: TEC-020 BOM List screen | T3-ui | ⛔ MISSING | No BOM list route in /technical | |
| T-038 | UI: TEC-021 BOM Detail page | T3-ui | ⛔ MISSING | Same | |
| T-039 | UI: TEC-022 BOM Edit modals | T3-ui | ⛔ MISSING | Same | |
| T-040 | UI: TEC-023 BOM Version Diff | T3-ui | ⛔ MISSING | Same | |
| T-041 | UI: TEC-024 BOM Generator modal | T3-ui | ⛔ MISSING | Same | |
| T-042 | UI: TEC-082 BOM Version Delete modal | T3-ui | ⛔ MISSING | Same | |
| T-043 | UI: TEC-083 BOM Graph (where-used) | T3-ui | ⛔ MISSING | Same | |
| T-044 | UI: TEC-084 Recipe Sheet print view | T3-ui | ⛔ MISSING | Same | |
| T-045 | UI: TEC-089 BOM Change History | T3-ui | ⛔ MISSING | Same | |
| T-046 | UI: TEC-030 Shelf Life Config | T3-ui | ⛔ MISSING | No shelf-life route in /technical | |
| T-047 | UI: TEC-040 Allergen Profile Editor | T3-ui | ⛔ MISSING | Same | |
| T-048 | UI: TEC-042 Manufacturing Op Allergen Additions | T3-ui | ⛔ MISSING | Same | |
| T-049 | UI: TEC-044 Allergen Manual Override Audit | T3-ui | ⛔ MISSING | Same | |
| T-050 | UI: TEC-050 Cost History + Cost Edit | T3-ui | ⛔ MISSING | No cost routes in /technical | |
| T-051 | UI: TEC-060 Routing List + Edit modal | T3-ui | ⛔ MISSING | No routing routes in /technical | |
| T-052 | UI: TEC-062 Routing Cost Preview + Resource Util | T3-ui | ⛔ MISSING | Same | |
| T-053 | UI: TEC-087 Tooling/Equipment Setup List | T3-ui | ⛔ MISSING | Same | |
| T-054 | UI: TEC-088 Maintenance Cross-Link Panel | T3-ui | ⛔ MISSING | Same | |
| T-055 | UI: TEC-070 D365 Sync Dashboard + Manual Trigger | T3-ui | 🟡 STUB | D365 sync UI exists at `settings/integrations/d365/sync/page.tsx` (96 lines, prototype-anchored); D365 connection at `settings/integrations/d365/page.tsx` | Route is `/settings/integrations/d365/sync` NOT `/technical/d365/*` as spec requires; no `/api/technical/d365/health` polling; parity evidence absent |
| T-056 | UI: TEC-072 D365 Sync Audit Log | T3-ui | 🟡 STUB | `settings/integrations/d365/audit/page.tsx` (173 lines, prototype-anchored, `withOrgContext`, test file) | Wrong route namespace: `/settings/integrations/d365/audit` not `/technical/d365/log` |
| T-057 | UI: TEC-090 D365 Field Mapping admin | T3-ui | 🟡 STUB | `settings/integrations/d365/mapping/page.tsx` (201 lines, prototype-anchored, test file) | Wrong route; D365 mapping is in settings admin, not technical module |
| T-058 | UI: TEC-073 DLQ Manager | T3-ui | 🟡 STUB | `settings/d365-dlq/page.tsx` is a `SettingsRouteStub`; no real DLQ UI | No d365_sync_dlq table; DLQ screen is a stub |
| T-059 | UI: TEC-091 D365 Drift Resolution | T3-ui | ⛔ MISSING | No `/technical/d365/drift` route | |
| T-060 | UI: TEC-085 factory_specs Review modal | T3-ui | ⛔ MISSING | No factory_spec schema or UI | |
| T-061 | UI: TEC-093 Nutrition Panel (cross-tagged NPD) | T3-ui | ⛔ MISSING | No nutrition panel in /technical | |
| T-062 | UI: TEC-094 Recipe Costing preview (cross-tagged Finance) | T3-ui | ⛔ MISSING | No recipe costing UI in /technical | |
| T-063 | UI: TEC-095 Traceability Search foundation | T3-ui | ⛔ MISSING | No traceability route in /technical | |
| T-064 | Docs: TEC-014 Bulk Import CSV gap brief | T5-docs | ⛔ MISSING | No artifact found in docs/ or _meta/ | |
| T-065 | Docs: TEC-025 BOM Snapshots Viewer gap brief | T5-docs | ⛔ MISSING | Same | |
| T-066 | Docs: TEC-031 Regulatory Compliance Dashboard gap brief | T5-docs | ⛔ MISSING | Same | |
| T-067 | Docs: TEC-045 Lab Results Log gap brief | T5-docs | ⛔ MISSING | Same | |
| T-068 | Docs: TEC-052 Cost Import from D365 gap brief | T5-docs | ⛔ MISSING | Same | |
| T-069 | Docs: TEC-092 ECO Phase-2 marker | T5-docs | ⛔ MISSING | No ECO Phase-2 marker doc found | |
| T-070 | Seed: manufacturing_operations + alert_thresholds + iso4217 | T5-seed | 🟡 STUB | `seeds/manufacturing-operations.sql` exists (16 ops, bakery/pharma/fmcg/generic); `seeds/eu-14-allergens.sql` exists | alert_thresholds seed portion not found; iso4217 seed not found; partial delivery |
| T-071 | Docs: ADR-002 + ADR-008 + ADR-028 + ADR-029 cross-reference | T5-docs | ⛔ MISSING | ADRs exist in docs/ but cross-reference note artifact absent | |
| T-072 | Docs gap: supplier_specs governance brief | T5-docs | ⛔ MISSING | No supplier_specs governance doc found | |
| T-073 | Shared BOM SSOT + clone-on-write enforcement | T2-api | ⛔ MISSING | No BOM schema, no SSOT service | |
| T-074 | RM usability validation shared decision service | T2-api | ⛔ MISSING | No validation service | |
| T-075 | supplier_specs Phase 1 governance migration | T1-schema | ⛔ MISSING | No supplier_specs table | |
| T-076 | PO actuals NC trigger contract | T4-wiring-test | ⛔ MISSING | No PO actuals NC handler | |
| T-077 | TO actuals NC trigger contract | T4-wiring-test | ⛔ MISSING | No TO actuals NC handler | |
| T-078 | UX red-lines: factory_spec, BOM SSOT, RM usability | T3-ui | ⛔ MISSING | No factory_spec/BOM SSOT UI red-lines artifact | |
| T-079 | Migration/API: factory_specs Technical-owned version | T1-schema | ⛔ MISSING | No factory_specs table | |
| T-080 | FactorySpec+BOM bundle approval API | T2-api | ⛔ MISSING | No approval API; no factory_specs schema | |
| T-081 | Technical release adapter for NPD T-097 | T2-api | ⛔ MISSING | No release adapter | |
| T-082 | NonConformance event contract for Technical triggers | T2-api | ⛔ MISSING | No NC event contract | |
| T-083 | Local UI prototype copy red-lines | T3-ui | ⛔ MISSING | No red-lines artifact | |
| T-084 | Technical sensory evaluation contract/read model | T2-api | ⛔ MISSING | No sensory evaluation read model | |
| T-085 | UI: TEC-014 Bulk Import CSV spec-driven | T3-ui | ⛔ MISSING | No bulk import UI | |
| T-086 | UI: TEC-025 BOM Snapshots Viewer spec-driven | T3-ui | ⛔ MISSING | No snapshots viewer UI | |
| T-087 | UI: TEC-031 Regulatory Compliance Dashboard | T3-ui | ⛔ MISSING | No regulatory compliance UI | |
| T-088 | UI: TEC-045 Lab Results Log spec-driven | T3-ui | ⛔ MISSING | No lab results UI | |
| T-089 | UI: TEC-052 Cost Import from D365 spec-driven | T3-ui | ⛔ MISSING | No cost import UI | |
| T-090 | UI: FactorySpec+BOM bundle approval panel | T3-ui | ⛔ MISSING | No factory_spec UI; no BOM approval panel | |
| T-091 | Add technical permission strings to enum | T1-schema | 🟡 STUB | `packages/rbac/src/permissions.enum.ts` has 1/10 strings (`technical.product_spec.approve`); no `ALL_TECHNICAL_PERMISSIONS` export | 9 of 10 required strings missing; export missing |

## Phantom / carry-forward backlog

None in the task manifest itself. However the following cross-module dependencies are prose-only (no `cross_module_dependencies` array in 85/91 tasks — per R4 review P1 finding):
- T-025 depends on 08-production WO creation event (BOM snapshot)
- T-024 depends on 00-foundation rule_definitions table (cascade rules)
- T-062 cross-tagged to 10-finance
- T-063 cross-tagged to 05-warehouse (traceability)
- T-061 cross-tagged to 01-NPD (nutrition)
- T-076/T-077 depend on warehouse PO/TO actuals producers (05-warehouse scope)
- T-081 depends on NPD T-097 canonical release model

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/technical/page.tsx` — skeleton count panel querying `bom_item` table; belongs conceptually to T-036 (Technical Dashboard) but is only a walking-skeleton stub, not the dashboard spec
- `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx` (263 lines) + `d365-connection-form.client.tsx` — D365 connection form; should be T-030/T-055 scope but lives in settings admin route, not `/technical/d365`
- `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/` — D365 audit log (T-056 scope) under settings admin
- `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/mapping/` — D365 field mapping (T-057 scope) under settings admin
- `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/sync/` — D365 sync config (T-055 scope) under settings admin
- `apps/web/actions/d365/test-connection.ts`, `get.ts`, `rotate-secret.ts`, `set-constant.ts` — D365 Server Actions with `withOrgContext`; relate to T-030 partial scope

## Top integration risks

1. **Zero domain schema = zero domain API = 100% of T1/T2/T3 tasks blocked**: Items, BOMs, allergen_profiles, routings, lab_results, supplier_specs, factory_specs tables are ALL missing. Every T2-api and T3-ui task (T-008..T-031, T-032..T-063, T-073..T-091) cannot be delivered until T-001..T-007 + T-075 + T-079 migrations land. This is the singular, total blocker for the module.

2. **D365 UI route namespace mismatch**: Implemented D365 UI lives in `/settings/integrations/d365/*` (admin settings route), but T-055..T-059 specify routes under `/technical/d365/*`. The 4 implemented settings pages are functional and prototype-anchored but will not satisfy the task acceptance criteria. Either the task route specs must be revised, or the pages must be relocated. Until resolved, no T3-ui D365 task can be marked DONE.

3. **T-091 permission enum incomplete (p0-blocker label)**: `ALL_TECHNICAL_PERMISSIONS` export is absent; only 1 of 10 required permission strings exists in the enum. RBAC gates on items/BOM/allergen/cost/D365 sync cannot be wired to Server Actions until T-091 is complete. Given it carries a `p0-blocker` label, this blocks all RBAC-gated T2-api tasks.

## Skeleton contribution

- Technical module IS in the sidebar navigation (`module-registry.ts`) and renders at `/[locale]/technical/`.
- The `technical/page.tsx` queries `bom_item` (R13 placeholder table) via `getModuleCount` — real Supabase call, org-scoped via RLS.
- DoD#1-5 from Wave 0 is satisfied for the technical entry point (navigable, real data badge shown).
- The `bom_item` placeholder has correct RLS (`app.current_org_id()`), `org_id` column, and audit pattern.
- No real technical domain data is behind the landing page; the count will always be 0 until the domain schema is built.
