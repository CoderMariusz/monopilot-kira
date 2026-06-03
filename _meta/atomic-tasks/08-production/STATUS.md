# 08-production — STATUS

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

Last updated: 2026-06-02 (Reality audit — ground-truth pass)

> **Reality verdict:** 0 of 56 tasks implemented. 54 MISSING, 2 STUB (routing exists, content absent). No STATUS.md existed before this audit — all prior state claims are unverified.

## Schema tasks (T-002 – T-011)

| # | Task | Status | Note |
|---|---|---|---|
| T-002 | wo_material_consumption migration + RLS | ⬜ | No schema file, no migration, no test |
| T-003 | wo_outputs migration + RLS | ⬜ | Canonical owner of wo_outputs — absent |
| T-004 | wo_waste_log migration + RLS | ⬜ | Absent |
| T-005 | downtime_events migration + RLS | ⬜ | Absent |
| T-006 | changeover_events migration + RLS | ⬜ | Absent |
| T-007 | allergen_changeover_validations migration + RLS | ⬜ | Absent |
| T-008 | oee_snapshots migration + RLS | ⬜ | Absent — blocks 15-OEE read side |
| T-009 | production_outbox_events migration + RLS | ⬜ | Absent |
| T-010 | d365_push_dlq migration + RLS | ⬜ | Absent |
| T-011 | operator_kpis_monthly matview + cron | ⬜ | Absent |

## Rule registry tasks (T-012 – T-014)

| # | Task | Status | Note |
|---|---|---|---|
| T-012 | Register wo_state_machine_v1 | ⬜ | No matching rule seed/migration |
| T-013 | Register closed_production_strict_v1 | ⬜ | No matching rule seed/migration |
| T-014 | Register output_yield_gate_v1 + allergen_changeover_gate_v1 | ⬜ | allergen_changeover_gate present only in test fixture for 02-settings, not registered as production DSL rule |

## API / service tasks (T-001, T-015 – T-045)

| # | Task | Status | Note |
|---|---|---|---|
| T-001 | Factory release runtime preflight guard | ⬜ | apps/web/lib/production/ does not exist; cross-dep 01-NPD T-097 + 03-TECHNICAL T-080/T-081 unresolved |
| T-015 | Idempotency helper (transaction_id cache) | ⬜ | Absent |
| T-016 | POST /work-orders/:id/start | ⬜ | No production _actions dir |
| T-017 | POST /work-orders/:id/pause | ⬜ | Absent |
| T-018 | POST /work-orders/:id/resume | ⬜ | Absent |
| T-019 | POST /work-orders/:id/complete | ⬜ | Absent |
| T-020 | POST /work-orders/:id/cancel | ⬜ | Absent |
| T-021 | GET /work-orders/:id runtime state | ⬜ | Absent |
| T-022 | Optimistic locking on wo_executions | ⬜ | Absent — wo_executions table not created |
| T-023 | POST scanner consume-to-WO | ⬜ | Absent |
| T-024 | Over-consumption detection + approval | ⬜ | Absent |
| T-025 | Genealogy write on consumption | ⬜ | Absent |
| T-026 | FEFO compliance check + deviation capture | ⬜ | Absent |
| T-027 | GET material-status (FEFO context) | ⬜ | Absent |
| T-028 | POST primary output registration | ⬜ | Absent |
| T-029 | POST by-products output | ⬜ | Absent |
| T-030 | POST waste-record | ⬜ | Absent |
| T-031 | Genealogy write on output | ⬜ | Absent |
| T-032 | Catch-weight variance soft-warning | ⬜ | Absent |
| T-033 | Browser PDF label generation (pdf-lib) | ⬜ | Absent |
| T-034 | output_yield_gate_v1 evaluator | ⬜ | Absent |
| T-035 | Seed downtime_categories (10 Apex 4P+1M) | ⬜ | Absent |
| T-036 | POST downtime-events (manual entry) | ⬜ | Absent |
| T-037 | GET downtime-events with filters + analytics | ⬜ | Absent |
| T-038 | Shift attribution helper | ⬜ | Absent |
| T-039 | shift_handovers + shift_assignments + Server Actions | ⬜ | settings/shifts/page.tsx is SettingsRouteStub only |
| T-040 | Shift end sign-off Server Action | ⬜ | Absent |
| T-041 | D365 outbox dispatcher + JournalLines adapter | ⬜ | Absent |
| T-042 | D365 DLQ list/replay/resolve routes | ⬜ | Absent (see T-051 stub note) |
| T-043 | Allergen changeover endpoints + START gate | ⬜ | Absent |
| T-044 | OEE per-minute aggregation + SSE stream | ⬜ | Absent |
| T-045 | Production settings + OEE target Server Actions | ⬜ | Absent |

## UI tasks (T-046 – T-051)

| # | Task | Status | Note |
|---|---|---|---|
| T-046 | UI: production dashboard + WO list/detail + Start WO modal | ⏸ | `production/page.tsx` exists as skeleton count panel only; not the WO dashboard; no prototype parity |
| T-047 | UI: WO detail tabs (consumption/output/waste/genealogy/history) | ⬜ | No sub-routes under /production/[id] |
| T-048 | UI: allergen changeover screen + gate modal | ⬜ | Absent |
| T-049 | UI: waste analytics + downtime + OEE screens | ⏸ | `oee/page.tsx` is ModuleStubNotice; no downtime/waste screens |
| T-050 | UI: shifts + line detail + analytics hub + prod settings | ⬜ | Settings stubs only |
| T-051 | UI: D365 DLQ admin screen | ⏸ | `settings/d365-dlq/page.tsx` routes exist as SettingsRouteStub; no DLQ table/modals/parity |

## E2E test tasks (T-052 – T-055)

| # | Task | Status | Note |
|---|---|---|---|
| T-052 | E2E happy path: WO start→consume→output→complete→D365 | ⬜ | No spec exists |
| T-053 | E2E scanner-linked desktop cards | ⬜ | No spec exists |
| T-054 | E2E exception gates | ⬜ | No spec exists |
| T-055 | E2E operations closeout | ⬜ | No spec exists |

## RBAC task (T-056)

| # | Task | Status | Note |
|---|---|---|---|
| T-056 | Add production permission strings to enum | ⬜ | `permissions.enum.ts` has zero `production.*` strings; ALL_PRODUCTION_PERMISSIONS absent |

## Cross-module blockers (must resolve before 08-production Wave 1 starts)

- 01-NPD T-097 — canonical factory release read model (blocks T-001)
- 03-TECHNICAL T-080 — factory_spec+BOM approval transitions (blocks T-001)
- 03-TECHNICAL T-081 — factory-use adapter + badge/blocker mapping (blocks T-001)
- 04-PLANNING-BASIC T-001 — WO snapshot with active_bom_header_id + active_factory_spec_id (blocks T-016+)
- 02-SETTINGS T-020/T-122/T-126/T-127 — machine/line registry, RBAC helpers, D365 connection config (blocks T-016+, T-041+)

## Wave 0 skeleton extras (code present, no owning task)

- `apps/web/app/[locale]/(app)/(modules)/production/page.tsx` — real Supabase count of `work_order` R13 placeholder; satisfies DoD Walking Skeleton for module landing
- `apps/web/app/[locale]/(app)/(modules)/oee/page.tsx` — ModuleStubNotice placeholder
- `apps/web/app/[locale]/(app)/(admin)/settings/d365-dlq/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx` — SettingsRouteStub
