# 03-technical — STATUS
<!-- Legend: ✅ IMPLEMENTED | 🔄 IN PROGRESS | ⏸ STUB/BROKEN | ⬜ NOT STARTED -->
<!-- Refreshed by reality audit 2026-06-04 (HEAD df7f2036, Supabase @175). Reality: 36 ✅ / 11 ⏸ / 46 ⬜. -->
<!-- Detail + evidence: _meta/audits/reality/03-technical-REALITY.md -->

| Task | Title (short) | Status | Note |
|---|---|---|---|
| T-001 | Migration: items table | ✅ | mig 153-items-master + schema/items.ts; org_id+RLS |
| T-002 | Migration: bom_headers/lines/co_products/snapshots | ✅ | mig 159 (item_id FK + co_products + snapshots; headers/lines from 090) |
| T-003 | Migration: item_cost_history | ✅ | mig 160; NUMERIC-exact + RLS |
| T-004 | Migration: allergen tables (profiles, mfg_op_additions, risk_matrix) | ✅ | mig 161; 4 tables + override ledger |
| T-005 | Migration: lab_results and supplier_specs | ✅ | mig 162; lab Quality-owned read-only, supplier_specs |
| T-006 | Migration: routings and routing_operations | ✅ | mig 163; NUMERIC cost rates |
| T-007 | Migration: d365_sync_jobs and d365_sync_dlq | ✅ | mig 164; idempotency unique |
| T-008 | API: Items list | ✅ | technical/items/_actions/list-items.ts |
| T-009 | API: Item create | ✅ | create-item.ts; zod + RBAC technical.items.create + audit |
| T-010 | API: Item detail and update | ✅ | update-item.ts |
| T-011 | API: Item deactivate | ✅ | deactivate-item.ts (status='blocked') |
| T-012 | API: BOM list and detail | ✅ | bom/_actions/queries.ts |
| T-013 | API: BOM create draft | ✅ | create-draft.ts + cycle-detection.ts; V-TEC-12/13/14 |
| T-014 | API: BOM approve and publish | ✅ | workflow.ts; V-TEC-10 atomic supersede |
| T-015 | API: BOM version diff | ✅ | diff.ts + diff-action.ts |
| T-016 | API: BOM Generator batch | ✅ | generate-batch.ts → mig 169 bom_generator_jobs queue |
| T-017 | API: Allergen profile CRUD | ✅ | api/technical/items/[item_code]/allergens/route.ts |
| T-018 | API: Manufacturing op allergen additions | ✅ | api/technical/manufacturing-operations/allergens/route.ts |
| T-019 | API: Allergen contamination risk matrix CRUD | ✅ | api/technical/allergens/contamination-risk/route.ts |
| T-020 | API: Technical lab-results read model | ✅ | lib/technical/lab/read-model.ts (read-only + Quality bridge) |
| T-021 | API: Cost history endpoints | ✅ | technical/cost/_actions; V-TEC-50/52/53, NUMERIC-exact |
| T-022 | API: Routings + routing_operations CRUD | ✅ | technical/routings/_actions; V-TEC-60/61/62/63 |
| T-023 | API: Routing cost preview | ✅ | routings/_actions/cost-preview.ts |
| T-024 | Wiring: Allergen cascade rule deployment | ✅ | mig 170 rule_definitions + lib/technical/allergens/cascade.ts |
| T-025 | Wiring: BOM snapshot at WO creation | ✅ | BOM-snapshot service lib/technical/bom/snapshot.ts + test (commit d642fb7c) |
| T-026 | Wiring: ATP swab auto-fail trigger | ✅ | ATP auto-fail trigger mig 187 + outbox event; 8 tests |
| T-027 | Wiring: Schema-driven L3 extension propagation | ⬜ | items schema-cache listener absent |
| T-028 | API + worker: D365 sync job | ✅ | lib/integrations/d365/pull.ts + idempotency + cron route |
| T-029 | Wiring: D365 push worker + DLQ retry | ✅ | push.ts + dlq/[id]/retry route; backoff 1s/5s/25s |
| T-030 | API: D365 connection test + feature flag | ✅ | gate.ts assertD365Enabled (V-TEC-70/72/73) + test-connection.ts |
| T-031 | API: Variance tracking nightly job | ✅ | catch-weight variance daily mig 188 + cron; 9 tests |
| T-032 | UI: TEC-010 Item List page | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-033 | UI: TEC-011 Item Create Wizard modal | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-034 | UI: TEC-012 Item Detail page | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-035 | UI: TEC-081 Item Deactivate modal | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-036 | UI: TEC-080 Technical Dashboard | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-037 | UI: TEC-020 BOM List screen | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-038 | UI: TEC-021 BOM Detail page with 7 tabs | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-039 | UI: TEC-022 BOM Edit modals | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-040 | UI: TEC-023 BOM Version Diff | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-041 | UI: TEC-024 BOM Generator modal | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-042 | UI: TEC-082 BOM Version Delete modal | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-043 | UI: TEC-083 BOM Graph (where-used) | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-044 | UI: TEC-084 Recipe Sheet print view | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-045 | UI: TEC-089 BOM Change History timeline | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-046 | UI: TEC-030 Shelf Life Config | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-047 | UI: TEC-040 Allergen Profile Editor | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-048 | UI: TEC-042 Manufacturing Op Allergen Additions | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-049 | UI: TEC-044 Allergen Manual Override Audit | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-050 | UI: TEC-050 Cost History + Cost Edit | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-051 | UI: TEC-060 Routing List + Edit modal | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-052 | UI: TEC-062 Routing Cost Preview + Resource Util | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-053 | UI: TEC-087 Tooling/Equipment Setup List | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-054 | UI: TEC-088 Maintenance Cross-Link Panel | ⬜ | absent; cross-dep 13-maintenance |
| T-055 | UI: TEC-070 D365 Sync Dashboard + Manual Trigger | 🔄 | D365 sync UI at settings/ (D-1 resolved); pending live Gate-5 |
| T-056 | UI: TEC-072 D365 Sync Audit Log | 🔄 | D365 audit UI at settings/ (D-1 resolved); pending live Gate-5 |
| T-057 | UI: TEC-090 D365 Field Mapping admin | 🔄 | D365 mapping UI at settings/ (D-1 resolved); pending live Gate-5 |
| T-058 | UI: TEC-073 DLQ Manager | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-059 | UI: TEC-091 D365 Drift Resolution | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-060 | UI: TEC-085 factory_specs Review modal | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-061 | UI: TEC-093 Nutrition Panel (cross-tagged NPD) | ⬜ | absent; cross-dep 01-NPD |
| T-062 | UI: TEC-094 Recipe Costing preview (cross-tagged Finance) | ⬜ | absent; cross-dep 10-finance |
| T-063 | UI: TEC-095 Traceability Search foundation | ⬜ | absent; cross-dep 05-warehouse |
| T-064 | Docs: TEC-014 Bulk Import CSV gap brief | ✅ | design/specs/TEC-014 brief |
| T-065 | Docs: TEC-025 BOM Snapshots Viewer gap brief | ✅ | design/specs/TEC-025 brief |
| T-066 | Docs: TEC-031 Regulatory Compliance Dashboard gap brief | ✅ | design/specs/TEC-031 brief |
| T-067 | Docs: TEC-045 Lab Results Log gap brief | ✅ | design/specs/TEC-045 brief |
| T-068 | Docs: TEC-052 Cost Import from D365 gap brief | ✅ | design/specs/TEC-052 brief |
| T-069 | Docs: TEC-092 ECO Phase-2 marker | ✅ | design/specs/TEC-092 brief |
| T-070 | Seed: manufacturing_operations + alert_thresholds + iso4217 | ✅ | seed-baseline.test.ts added (8 tests) |
| T-071 | Docs: ADR-002/008/028/029 cross-reference note | ✅ | ADR cross-ref note |
| T-072 | Docs gap: supplier_specs governance brief | ✅ | supplier_specs Phase1 brief |
| T-073 | Shared BOM SSOT + clone-on-write enforcement | ✅ | mig 168 bom_request_version_edit + state-machine triggers |
| T-074 | RM usability validation shared decision service | ✅ | lib/technical/rm-usability.ts; 7-check chain + tests |
| T-075 | supplier_specs Phase 1 governance migration | ⏸ | mig 174 DB governance done BUT apps/web/actions/technical/supplier-specs/ API absent (AC5 unmet) |
| T-076 | PO actuals NC trigger contract | ⬜ | absent; cross-dep 05-warehouse PO actuals (also unbuilt) — RISK |
| T-077 | TO actuals NC trigger contract | ⬜ | absent; cross-dep 05-warehouse TO actuals — RISK |
| T-078 | UX red-lines: factory_spec, BOM SSOT, RM usability | ⏸ | prototypes/design/03-TECHNICAL-UX.md exists; no "applied/signed-off" evidence |
| T-079 | Migration/API: factory_specs Technical-owned version | ✅ | mig 165; versioned + clone-on-write trigger + release guards |
| T-080 | FactorySpec+BOM bundle approval API | ✅ | actions/technical/release-bundles + release-bundle-service; emits technical.factory_spec.approved |
| T-081 | Technical release adapter for NPD T-097 | ✅ | lib/technical/release-state-adapters.ts (no dup release enum) |
| T-082 | NonConformance event contract for Technical triggers | ⬜ | absent; blocked by T-076/077 |
| T-083 | Local UI prototype copy red-lines | ⏸ | 03-TECHNICAL-UX.md red-lines exist; no formal applied/sign-off |
| T-084 | Technical sensory evaluation contract/read model | ✅ | mig 166 + lib/technical/sensory/sensory-read-model.ts |
| T-085 | UI: TEC-014 Bulk Import CSV spec-driven | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-086 | UI: TEC-025 BOM Snapshots Viewer spec-driven | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-087 | UI: TEC-031 Regulatory Compliance Dashboard | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-088 | UI: TEC-045 Lab Results Log spec-driven | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-089 | UI: TEC-052 Cost Import from D365 spec-driven | 🔄 | 2026-06-04 gap-fill: UI built+RTL, pending live Gate-5 |
| T-090 | UI: FactorySpec+BOM bundle approval panel | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-091 | Add technical permission strings to enum (p0-blocker) | ✅ | permissions.enum.ts ALL_TECHNICAL_PERMISSIONS (11 strings) |
| T-092 | UI: TEC Sensory Evaluation screen (consumes T-084) | 🔄 | Wave-C 2026-06-04: UI built, prototype-anchored + RTL green; pending live Gate-5 |
| T-093 | Seed: grant technical.* to org-admin role family | ✅ | mig 154-technical-permission-seed (org-admin family, both stores + trigger + backfill) |
