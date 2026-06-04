# 03-technical — Phase-0 Readiness Audit (2026-06-04, read-only)

**VERDICT: NOT ready for a clean `/kira:run-module 03-technical` — 5 blockers to resolve first.**
91 tasks, 0 IMPLEMENTED (9 STUB, 82 NOT STARTED). All declared IN-dependencies (from 00/01/02) EXIST in built code.

## Blockers (resolve before run start)
- **B-1 — `MON-domain-technical` skill MISSING.** Required before the Codex consensus gate (like MON-domain-npd was). Author first.
- **B-2 — T-091 RBAC enum STUB (p0).** 9/10 `technical.*` permission strings missing; `ALL_TECHNICAL_PERMISSIONS` export absent; the 1 existing string misclassified under `ALL_SETTINGS_EXT_PERMISSIONS`. Every technical Server Action's gate is blocked until this lands. (`packages/rbac/src/permissions.enum.ts`)
- **B-3 — D365 route namespace conflict.** 4 D365 stub pages live at `/settings/integrations/d365/*` but tasks target `/technical/d365/*` → duplicate-route/rework risk. Decide: relocate vs accept settings namespace.
- **B-4 — Sensory UI has no owning task.** 01-npd deferred T-076 (sensory UI) here; manifest has T-084 (schema/contract, excludes UI). Proposed `plan-sensory-ui.md` NOT added to manifest → UI never built unless a task is inserted.
- **B-5 — D365 field-mapping authority (D-4) unresolved.** T-057 admin screen vs fixed PRD mapping; affects 01-npd deferred D365 Builder + 10/11.

## Critical OWNED outputs others wait on
- **`items` master table (T-001) MISSING** — consumed by 04/05/08/10/11. BOM lines currently reference `component_code TEXT` (no typed FK) because `items` doesn't exist. Critical-path root.
- **`factory_specs` table (T-079) MISSING** — `01-npd factory_release_status.active_factory_spec_id` is a dangling soft-uuid awaiting it; **04-planning T-001 hard-depends on technical T-080/T-081** (FactorySpec+BOM bundle approval + release adapter) → 04 blocked until 03 delivers these.
- BOM SSOT Technical-approval transition (draft→technical_approved→active) Server Actions MISSING (schema exists from 01-npd mig 090).
- `routings`/`routing_operations` (T-006), `item_cost_history` (T-003), per-item allergen tables (T-004), `d365_sync_jobs`/`d365_sync_dlq` (T-007, distinct from Settings' `d365_sync_runs` mig 065), `supplier_specs` (T-075) — all MISSING.

## Canonical owners: CLEAN (owns none of wo_outputs/schedule_outputs/oee_snapshots).

## Prototypes: present (technical/{other-screens,modals,bom-detail,bom-list,spec-driven-screens}.jsx). NOTE: PRD/coverage cite snake_case labels that don't match the PascalCase component names — use line-range anchors (label string-match tooling will fail).

## Parallel-safe Wave-A (can start once B-1/B-2 resolved): T-001 items, T-003 cost-history, T-005 lab/supplier-specs, T-006 routings, T-007 d365 jobs, T-091 enum, T-070 seed; then T-002 (item_id FK + bom_co_products/snapshots), T-004 (per-item allergen), T-079 (factory_specs).
