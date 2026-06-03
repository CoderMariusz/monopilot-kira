# 04-planning-basic — Reality Audit (2026-06-02)

## Counts
- task files: 66 | manifest task_count: 66 | STATUS rows: 0 (new) → reconciliation: match; coverage.md references 65 tasks (T-001..T-065); T-066 added post-coverage-freeze via fixer-F4 (2026-05-14)

## Summary verdict
**ALL 66 tasks are ⛔ MISSING** — the 04-planning-basic module has zero implementation.
The only planning-related file in the entire repo is a one-screen stub:
`apps/web/app/[locale]/(app)/(modules)/planning/page.tsx` which renders a `<ModuleStubNotice>` badge — no real data, no actions, no schema.

## Canonical ownership check
- `schedule_outputs` declared in T-005 — CORRECT, planning owns planning-time projections only.
- `wo_outputs` is owned by 08-production T-003 — T-005 explicitly excludes it. No cross-ownership violation found.

## Task reality
| Task | Title (abbreviated) | Type | Verdict | Evidence (path) | Gap |
|---|---|---|---|---|---|
| T-001 | Factory release read-model consumer guards | T2-api | ⛔ MISSING | `apps/web/lib/planning/factory-release-guards.ts` absent | All scope_files absent; no `src/` root at all |
| T-002 | Drizzle schema: purchase_orders + po_lines | T1-schema | ⛔ MISSING | `src/db/schema/planning/purchase_orders.ts` absent | No migration, no Drizzle table, no RLS |
| T-003 | Drizzle schema: transfer_orders | T1-schema | ⛔ MISSING | `src/db/schema/planning/transfer_orders.ts` absent | Same as T-002 |
| T-004 | Drizzle schema: work_orders | T1-schema | ⛔ MISSING | `src/db/schema/planning/work_orders.ts` absent | Same as T-002 |
| T-005 | Drizzle schema: schedule_outputs + wo_dependencies | T1-schema | ⛔ MISSING | `src/db/schema/planning/schedule_outputs_dag.ts` absent | Canonical check: planning→schedule_outputs CORRECT per 2026-05-14 decision |
| T-006 | Drizzle schema: wo_material_reservations + planning_settings | T1-schema | ⛔ MISSING | `src/db/schema/planning/reservations.ts` absent | Same as T-002 |
| T-007 | Workflow rule definitions: po/to/wo state machines | T2-api | ⛔ MISSING | `src/rules/planning/v1/` absent | `rules/` directory exists at root but has no planning subdir |
| T-008 | API: supplier CRUD + supplier_products | T2-api | ⛔ MISSING | `apps/web/actions/planning/` absent | No planning action subdirectory |
| T-009 | API: PO numbering service | T2-api | ⛔ MISSING | `src/server/services/` absent | — |
| T-010 | API: PO 3-step fast flow | T2-api | ⛔ MISSING | — | — |
| T-011 | API: bulk PO creation | T2-api | ⛔ MISSING | — | — |
| T-012 | API: PO state transition | T2-api | ⛔ MISSING | — | — |
| T-013 | API: PO approval / rejection | T2-api | ⛔ MISSING | — | — |
| T-014 | API: TO CRUD + numbering | T2-api | ⛔ MISSING | — | — |
| T-015 | API: TO ship + receive + warehouse handoff | T2-api | ⛔ MISSING | — | — |
| T-016 | API: LP picker + FEFO suggestion | T2-api | ⛔ MISSING | — | — |
| T-017 | API: WO numbering | T2-api | ⛔ MISSING | — | — |
| T-018 | API: WO create + BOM snapshot | T2-api | ⛔ MISSING | — | — |
| T-019 | API: cascade DAG generation rule | T2-api | ⛔ MISSING | — | — |
| T-020 | API: cycle detection service | T2-api | ⛔ MISSING | — | — |
| T-021 | API: WO release + hard-lock reservation | T2-api | ⛔ MISSING | — | — |
| T-022 | API: WO cancel + reservation release | T2-api | ⛔ MISSING | — | — |
| T-023 | API: release-to-warehouse flag toggle | T2-api | ⛔ MISSING | — | — |
| T-024 | API: reservation override (admin) + audit | T2-api | ⛔ MISSING | — | — |
| T-025 | API: allergen sequencing heuristic rule | T2-api | ⛔ MISSING | — | — |
| T-026 | API: finite-capacity scheduling stub | T2-api | ⛔ MISSING | — | — |
| T-027 | API: planning dashboard data + Redis cache | T2-api | ⛔ MISSING | — | — |
| T-028 | API: planning_settings CRUD | T2-api | ⛔ MISSING | — | — |
| T-029 | Seed: planning_settings defaults | T5-seed | ⛔ MISSING | `src/server/services/planning-settings-seed.ts` absent | — |
| T-030 | API: D365 SO pull worker | T2-api | ⛔ MISSING | — | — |
| T-031 | API: D365 drift detection daily diff job | T2-api | ⛔ MISSING | — | — |
| T-032 | API: outbox event emitter helper | T2-api | ⛔ MISSING | `src/server/lib/outbox.ts` absent | Note: cross-dep on 00-foundation T-112 (exists) |
| T-033 | API: RBAC matrix wiring | T4-wiring-test | ⛔ MISSING | `src/server/lib/rbac.ts` absent | — |
| T-034 | UI: PLN-001 Planning Dashboard | T3-ui | ⛔ MISSING | `src/app/(planning)/planning/page.tsx` absent | Prototype anchor `dashboard.jsx:3-261` VALID (262 lines) |
| T-035 | UI: PLN-002 PO List | T3-ui | ⛔ MISSING | `src/app/(planning)/planning/purchase-orders/page.tsx` absent | Prototype anchor `po-screens.jsx:3-139` VALID |
| T-036 | UI: PLN-003 PO Detail | T3-ui | ⛔ MISSING | absent | Prototype anchor `po-screens.jsx:143-353` VALID |
| T-037 | UI: PLN-013 D365 SO Queue | T3-ui | ⛔ MISSING | absent | Prototype anchor `other-screens.jsx:510-648` VALID |
| T-038 | UI: PLN-014 PO Fast-Flow Wizard | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:21-179` VALID |
| T-039 | UI: PLN-015 Add PO Line modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:182-225` VALID |
| T-040 | UI: PLN-016 PO Approval modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:228-264` VALID |
| T-041 | Schema amendment: suppliers + supplier_products | T1-schema | ⛔ MISSING | `src/db/schema/planning/suppliers.ts` absent | — |
| T-042 | API: Supplier + Supplier-Product Server Actions | T2-api | ⛔ MISSING | absent | — |
| T-043 | UI: PLN-040/041 Supplier List + Detail | T3-ui | ⛔ MISSING | absent | Prototype anchor `suppliers.jsx:25-401` VALID |
| T-044 | UI: PLN-042 Supplier-Product sub-table | T3-ui | ⛔ MISSING | absent | Prototype anchor `suppliers.jsx:153-512` VALID |
| T-045 | UI: Material Demand dashboard | T3-ui | ⛔ MISSING | absent | Prototype anchor `dashboard.jsx:3-261` VALID; T-045 also has a schema scope (`reorder-thresholds.ts`) that is MISSING |
| T-046 | UI: PLN-004 TO List | T3-ui | ⛔ MISSING | absent | Prototype anchor `to-screens.jsx:3-99` VALID |
| T-047 | UI: PLN-005 TO Detail | T3-ui | ⛔ MISSING | absent | Prototype anchor `to-screens.jsx:103-281` VALID |
| T-048 | UI: PLN-018 TO Create/Edit modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:697-845` VALID |
| T-049 | UI: PLN-019 LP Picker modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:269-341` VALID |
| T-050 | UI: PLN-006 WO List | T3-ui | ⛔ MISSING | absent | Prototype anchor `wo-list.jsx:3-177` VALID |
| T-051 | UI: PLN-007 WO Detail shell | T3-ui | ⛔ MISSING | absent | Prototype anchor `wo-detail.jsx:3-526` VALID |
| T-052 | UI: PLN-021 WO Create wizard | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:399-500` VALID |
| T-053 | UI: PLN-022 Cascade Preview modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:346-396` VALID |
| T-054 | UI: PLN-008 WO Gantt View | T3-ui | ⛔ MISSING | absent | Prototype anchor `gantt.jsx:7-162` VALID |
| T-055 | UI: PLN-009 Cascade DAG View | T3-ui | ⛔ MISSING | absent | Prototype anchor `cascade.jsx:3-239` VALID |
| T-056 | UI: PLN-010 Reservation Panel | T3-ui | ⛔ MISSING | absent | Prototype anchor `other-screens.jsx:3-120` VALID |
| T-057 | UI: PLN-011 Sequencing View | T3-ui | ⛔ MISSING | absent | Prototype anchor `other-screens.jsx:124-252` VALID |
| T-058 | UI: PLN-012 Planning Settings | T3-ui | ⛔ MISSING | absent | Prototype anchor `other-screens.jsx:256-490` VALID |
| T-059 | UI: PLN-017 PO Bulk Import modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:1102-1339` VALID |
| T-060 | UI: PLN-020 Ship/Receive TO modals | T3-ui | ⛔ MISSING | absent | Prototype anchor has concatenated ref string (malformed) but lines 852-931 and 1341-1474 in `modals.jsx` (1564 lines) are VALID |
| T-061 | UI: PLN-025 D365 SO Trigger Confirm | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:586-606` VALID |
| T-062 | UI: PLN-026 Sequencing Apply Confirm | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:1053-1100` VALID |
| T-063 | UI: PLN-028/029 Destructive confirm modals | T3-ui | ⛔ MISSING | absent | Prototype anchor `modals.jsx:609-671` VALID |
| T-064 | UI: PLN-030 Allergen Override modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `04-PLANNING-BASIC-UX.md:1366-1382` VALID (1707 lines) |
| T-065 | UI: PLN-031 Workflow Rule Dry-Run modal | T3-ui | ⛔ MISSING | absent | Prototype anchor `04-PLANNING-BASIC-UX.md:1415-1425` VALID |
| T-066 | Add planning permission strings to enum | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` has 0 planning.* strings | grep confirmed 0 matches for PLAN/PLN/planning in enum file |

## Phantom / carry-forward backlog
None — all cross-module dependencies (01-npd T-097, 03-technical T-080/T-081, 00-foundation T-112, 08-production T-003, 02-settings T-001/T-130) resolve to existing task files. No phantom task IDs.

CONTRACT references (02-settings/CONTRACT, 03-technical/D365-CONTRACT, 05-warehouse/CONTRACT, 06-scanner-p1/CONTRACT) are symbolic cross-module contracts, not task files — expected.

## Extra (code without a task)
- `apps/web/app/[locale]/(app)/(modules)/planning/page.tsx` — skeleton stub, no owning task; this is the Walking Skeleton landing page, legitimately task-free and expected per Wave 0.

## Scope path discrepancy (structural risk)
All 66 tasks declare scope_files under `src/db/…`, `src/rules/…`, `src/server/…`, `src/app/(planning)/…`, `src/components/planning/…`. **No `src/` directory exists at project root.** The actual monorepo layout is:
- Schema/migrations → `packages/db/schema/` + `packages/db/migrations/`
- Server actions → `apps/web/actions/<domain>/`
- Pages → `apps/web/app/[locale]/…`
- Components → `apps/web/components/…` or co-located `_components/`

The implementing agent **must remap scope paths** before writing any files. This is the single largest structural risk for the module.

## Top integration risks
1. **`src/` path remapping required for all 66 tasks** — task scope_files use a flat `src/` prefix that does not match the pnpm monorepo structure. Every task will need its target paths translated to `packages/db/` (schema/migrations), `apps/web/actions/planning/` (server actions), and `apps/web/app/[locale]/(app)/(modules)/planning/` (pages/components) before any code is written. Implementing without remapping will scatter files incorrectly.
2. **5 cross-module T1-schema blockers gate the entire module** — T-001 depends on 01-npd T-097 (canonical factory release read model) and 03-technical T-080/T-081 (approval adapter). If those modules are also unimplemented, the factory-release guard (T-001) cannot be green, which blocks WO create (T-018), cascade (T-019), and WO release (T-021) — roughly 15 downstream T2/T3 tasks. Must verify 01-npd T-097 and 03-technical T-080/T-081 status before starting planning.
3. **T-066 permission enum addition is unblocked and zero-dependency** — it modifies `packages/rbac/src/permissions.enum.ts` (which exists) and is the safest first-commit candidate; however, if not done first, every planning action that calls `assertPermission()` will fail to compile once actions are written.

## Skeleton contribution
- Planning module contributes a stub page only (`ModuleStubNotice`) — no real DB data, no actions. This is Wave 0 / DoD#1-5 compliant (menu-driven clickable skeleton).
- No planning tables exist in any migration — the route `/planning` loads but shows zero domain data. This is expected and correct for the current Wave 0 state.
- No skeleton-blocking gaps in planning — the stub renders and nav works (confirmed by `e2e/parity-evidence/shell/en-planning.png` evidence file present).
