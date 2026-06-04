# STATUS — 04-planning-basic

**Legend:** ✅ Done | 🔄 In Progress | ⏸ Blocked/Stub | ⬜ Not Started

**Audit date:** 2026-06-02 | **Auditor:** kira:audit (reality pass)
**Reality verdict:** ALL 66 tasks are ⬜ NOT STARTED — zero implementation in repo.

> See full evidence: `_meta/audits/reality/04-planning-basic-REALITY.md`

---

## Schema (T1-schema)

| Task | Title | Status | Note |
|---|---|---|---|
| T-002 | Drizzle schema: purchase_orders + po_lines | ⬜ | No migration, no Drizzle file, no RLS |
| T-003 | Drizzle schema: transfer_orders + to_lines + to_line_lps | ⬜ | — |
| T-004 | Drizzle schema: work_orders + wo_materials + wo_operations | ⬜ | — |
| T-005 | Drizzle schema: schedule_outputs + wo_dependencies + wo_status_history | ⬜ | Canonical ownership confirmed correct: planning→schedule_outputs only |
| T-006 | Drizzle schema: wo_material_reservations + planning_settings | ⬜ | — |
| T-041 | Schema amendment: suppliers + supplier_products | ⬜ | — |
| T-066 | Add planning permission strings to permissions.enum.ts | ⬜ | Zero-dependency, unblocked; recommend doing first |

## API / Services (T2-api)

| Task | Title | Status | Note |
|---|---|---|---|
| T-001 | Factory release read-model consumer guards | ⬜ | Blocked by 01-npd T-097 + 03-technical T-080/T-081 |
| T-007 | Workflow rule definitions: po/to/wo state machines | ⬜ | `rules/` dir exists at root but has no planning subdir |
| T-008 | Supplier CRUD + supplier_products assignment | ⬜ | — |
| T-009 | PO numbering service | ⬜ | — |
| T-010 | PO 3-step fast flow + smart defaults | ⬜ | — |
| T-011 | Bulk PO creation grouped by default supplier | ⬜ | — |
| T-012 | PO state transition via rule registry | ⬜ | Blocked by T-007 |
| T-013 | PO approval / rejection | ⬜ | — |
| T-014 | TO CRUD + numbering + state transitions | ⬜ | — |
| T-015 | TO ship + receive (partial shipments) + 05-WAREHOUSE handoff | ⬜ | Cross-dep: 05-warehouse CONTRACT |
| T-016 | LP picker + FEFO suggestion | ⬜ | Cross-dep: 05-warehouse CONTRACT |
| T-017 | WO numbering | ⬜ | — |
| T-018 | WO create + BOM snapshot → wo_materials | ⬜ | Blocked by T-001, T-004 |
| T-019 | Cascade DAG generation rule | ⬜ | Blocked by T-001, T-018 |
| T-020 | Cycle detection service for wo_dependencies | ⬜ | — |
| T-021 | WO release transition + hard-lock reservation creation | ⬜ | Blocked by T-001, T-018 |
| T-022 | WO cancel + reservation release | ⬜ | — |
| T-023 | Release-to-warehouse flag toggle | ⬜ | — |
| T-024 | Reservation override (admin-only) + audit | ⬜ | — |
| T-025 | Allergen sequencing heuristic rule | ⬜ | Blocked by T-001 |
| T-026 | Finite-capacity scheduling stub (greedy) | ⬜ | — |
| T-027 | Planning dashboard data + Redis cache | ⬜ | — |
| T-028 | planning_settings CRUD + status display + field visibility | ⬜ | — |
| T-030 | D365 SO pull worker [LEGACY-D365] | ⬜ | Cross-dep: 03-technical/D365-CONTRACT |
| T-031 | D365 drift detection daily diff job | ⬜ | — |
| T-032 | Outbox event emitter helper + transactional consistency | ⬜ | Cross-dep: 00-foundation T-112 (exists) |
| T-042 | Supplier + Supplier-Product Server Actions (CRUD) | ⬜ | Blocked by T-041 |

## Wiring Tests (T4)

| Task | Title | Status | Note |
|---|---|---|---|
| T-033 | RBAC matrix wiring for planning permissions | ⬜ | Blocked by T-066 (no permission strings yet) |

## Seed (T5)

| Task | Title | Status | Note |
|---|---|---|---|
| T-029 | Seed: planning_settings defaults + status_display | ⬜ | Blocked by T-006 |

## UI (T3-ui)

| Task | Title | Status | Note |
|---|---|---|---|
| T-034 | PLN-001 Planning Dashboard | ⬜ | Blocked by T-002..T-006, T-027; prototype anchor VALID |
| T-035 | PLN-002 PO List | ⬜ | Blocked by T-002, T-009..T-013; prototype anchor VALID |
| T-036 | PLN-003 PO Detail | ⬜ | Blocked by T-035; prototype anchor VALID |
| T-037 | PLN-013 D365 SO Queue + Draft WO Review | ⬜ | Blocked by T-030; prototype anchor VALID |
| T-038 | PLN-014 PO Fast-Flow Wizard modal | ⬜ | Blocked by T-010; prototype anchor VALID |
| T-039 | PLN-015 Add PO Line modal | ⬜ | Blocked by T-010; prototype anchor VALID |
| T-040 | PLN-016 PO Approval modal | ⬜ | Blocked by T-013; prototype anchor VALID |
| T-043 | PLN-040/041 Supplier List + Detail | ⬜ | Blocked by T-042; prototype anchor VALID |
| T-044 | PLN-042 Supplier-Product sub-table | ⬜ | Blocked by T-042; prototype anchor VALID |
| T-045 | Material Demand dashboard | ⬜ | Has schema scope (reorder-thresholds.ts) + UI; both absent |
| T-046 | PLN-004 TO List | ⬜ | Blocked by T-003, T-014; prototype anchor VALID |
| T-047 | PLN-005 TO Detail | ⬜ | Blocked by T-046; prototype anchor VALID |
| T-048 | PLN-018 TO Create/Edit modal | ⬜ | Blocked by T-014; prototype anchor VALID |
| T-049 | PLN-019 LP Picker modal | ⬜ | Blocked by T-016; prototype anchor VALID |
| T-050 | PLN-006 WO List | ⬜ | Blocked by T-004, T-017..T-018; prototype anchor VALID |
| T-051 | PLN-007 WO Detail shell | ⬜ | Blocked by T-050; prototype anchor VALID |
| T-052 | PLN-021 WO Create wizard | ⬜ | Blocked by T-018, T-019; prototype anchor VALID |
| T-053 | PLN-022 Cascade Preview modal | ⬜ | Blocked by T-019; prototype anchor VALID |
| T-054 | PLN-008 WO Gantt View | ⬜ | Blocked by T-004, T-026; prototype anchor VALID |
| T-055 | PLN-009 Cascade DAG View | ⬜ | Blocked by T-019; prototype anchor VALID |
| T-056 | PLN-010 Reservation Panel | ⬜ | Blocked by T-006, T-021; prototype anchor VALID |
| T-057 | PLN-011 Sequencing View | ⬜ | Blocked by T-025; prototype anchor VALID |
| T-058 | PLN-012 Planning Settings | ⬜ | Blocked by T-028, T-029; prototype anchor VALID |
| T-059 | PLN-017 PO Bulk Import modal | ⬜ | Blocked by T-011; prototype anchor VALID |
| T-060 | PLN-020 Ship/Receive TO modals | ⬜ | Blocked by T-015; prototype anchor lines valid (ref string format malformed in JSON, actual lines 852-931 + 1341-1474 are within `modals.jsx` 1564 lines) |
| T-061 | PLN-025 D365 SO Trigger Confirm modal | ⬜ | Blocked by T-030; prototype anchor VALID |
| T-062 | PLN-026 Sequencing Apply Confirm modal | ⬜ | Blocked by T-025; prototype anchor VALID |
| T-063 | PLN-028/029 Destructive confirmation modals | ⬜ | Blocked by T-021; prototype anchor VALID |
| T-064 | PLN-030 Allergen Override modal | ⬜ | Blocked by T-025; prototype anchor in UX.md VALID |
| T-065 | PLN-031 Workflow Rule Dry-Run modal | ⬜ | Blocked by T-028; prototype anchor in UX.md VALID |

---

## Recommended start order
1. **T-066** (permissions enum — zero-dep, unblocked)
2. **T-002, T-003, T-004, T-005, T-006, T-041** (schema — unblocked after T-066)
3. **T-032, T-007, T-020** (outbox helper, rule registry, cycle detection — mostly unblocked)
4. **T-009, T-017** (numbering services — unblocked after schema)
5. **T-001** after 01-npd T-097 + 03-technical T-080/T-081 are confirmed DONE
6. Everything else follows topological order per `dependencies` field in each task JSON.

> ⚠️ STRUCTURAL NOTE: All task scope_files use `src/` paths that do not exist in this monorepo.
> Implementer must remap to: `packages/db/` (schema/migrations), `apps/web/actions/planning/` (actions),
> `apps/web/app/[locale]/(app)/(modules)/planning/` (pages), `apps/web/components/planning/` (components).


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-067 | Seed planning.* permissions onto roles (NNN-planning-permission-seed.sql) | ⬜ PENDING | X-1 RBAC-seed. **wave-1 p0**, after T-066 enum. Mirrors mig 146/148/149. |

Refinements / decisions (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| Path remap (X-3) | consolidation pass | ⬜ TODO | Remap all `src/` scope_files to `packages/db/` + `apps/web/app/[locale]/(app)/(modules)/planning/...`; fix malformed T-060 ref-string. Run during kira:consolidate, NOT a build task. Already flagged in STATUS structural note above. |
| T-045 MRP scope drift | 🔒 DECISION | BLOCKED | PRD §"Decyzje odroczone" defers MRP/reorder-points; T-045 ships `reorder_thresholds` + netting against a synthetic `§MRP-gap` anchor. Decide: (A) accept-into-PRD (add §4.x + follow-up T-068, keep P1, seed `planning.material_demand.read`/`thresholds.write`) or (B) defer T-045 to P2. Do not ship the schema to P1 without A or B. |
