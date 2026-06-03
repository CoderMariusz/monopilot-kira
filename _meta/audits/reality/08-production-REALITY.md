# 08-production — Reality Audit (2026-06-02)

## Counts
- task files on disk: **56** (T-001..T-056)
- manifest `task_count`: **56** (manifest lists all 56)
- STATUS.md: **ABSENT** (created by this audit)
- UPGRADE-REPORT-2026-05-14.md says "55 tasks" — T-056 was added after the upgrade pass; manifest was updated but the report was not. **Count reconciliation: 56 task files = 56 manifest entries = 56 STATUS rows. No phantom gap.**

Note: every task JSON has `task_type`, `scope_files`, dependencies, acceptance_criteria, and routing_hints embedded inside `pipeline_inputs` (not at root level). The Python extractor using `d.get('task_type')` returns `?` because the field is nested; actual types are correct inside JSON.

## Task reality

| Task | Title (short) | Type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Factory release runtime preflight guard | T2-api | ⛔ MISSING | `apps/web/lib/production/` — dir does not exist | `factory-release-runtime-guards.ts` absent; no tests |
| T-002 | wo_material_consumption migration + RLS | T1-schema | ⛔ MISSING | `packages/db/schema/production/` — dir does not exist; no matching migration | No Drizzle schema, no migration, no test |
| T-003 | wo_outputs migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Critical: canonical owner of `wo_outputs`; absent |
| T-004 | wo_waste_log migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-005 | downtime_events migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-006 | changeover_events migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-007 | allergen_changeover_validations migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-008 | oee_snapshots migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent; 15-OEE is read-only consumer — blocks 15-OEE entirely |
| T-009 | production_outbox_events migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-010 | d365_push_dlq migration + RLS | T1-schema | ⛔ MISSING | Same as T-002 | Absent |
| T-011 | operator_kpis_monthly materialized view + cron | T1-schema | ⛔ MISSING | No matching migration or cron job found | Absent |
| T-012 | Register DSL rule wo_state_machine_v1 | T2-api | ⛔ MISSING | No match in rule-registry seed/migrations | Absent |
| T-013 | Register DSL rule closed_production_strict_v1 | T2-api | ⛔ MISSING | No match in rule-registry seed/migrations | Absent |
| T-014 | Register DSL rules output_yield_gate_v1 + allergen_changeover_gate_v1 | T2-api | ⛔ MISSING | No match in rule-registry seed/migrations | `allergen_changeover_gate` appears in test fixtures for 02-settings rules but NOT as a registered production DSL rule; absent |
| T-015 | Idempotency helper: transaction_id cache | T2-api | ⛔ MISSING | No `apps/web/lib/production/idempotency*` file | Absent |
| T-016 | POST start WO endpoint | T2-api | ⛔ MISSING | No production `_actions/` dir; no API route | Absent |
| T-017 | POST pause WO endpoint | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-018 | POST resume WO endpoint | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-019 | POST complete WO endpoint | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-020 | POST cancel WO endpoint | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-021 | GET WO full runtime state | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-022 | Optimistic locking on wo_executions | T2-api | ⛔ MISSING | No wo_executions table or locking logic | Absent |
| T-023 | POST scanner consume-to-WO | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-024 | Over-consumption detection + approval endpoint | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-025 | Genealogy write on consumption | T2-api | ⛔ MISSING | No lp_genealogy table or write logic | Absent |
| T-026 | FEFO compliance check + deviation capture | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-027 | GET material-status (FEFO context) | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-028 | POST primary output registration | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-029 | POST by-products output | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-030 | POST waste-record | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-031 | Genealogy write on output | T2-api | ⛔ MISSING | Same as T-025 | Absent |
| T-032 | Catch-weight variance soft-warning | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-033 | Browser PDF label generation (pdf-lib) | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-034 | output_yield_gate_v1 evaluator | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-035 | Seed downtime_categories (10 Apex 4P+1M) | T5-seed | ⛔ MISSING | No `seeds/downtime-categories.sql` or equivalent | Absent |
| T-036 | POST downtime-events (manual entry) | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-037 | GET downtime-events with filters + analytics | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-038 | Shift attribution helper | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-039 | shift_handovers + shift_assignments tables + Server Actions | T1-schema/T2-api | ⛔ MISSING | Settings `shifts` page is a `SettingsRouteStub`; no schema | Absent; settings/shifts/page.tsx is a stub |
| T-040 | Shift end sign-off Server Action | T2-api | ⛔ MISSING | Same as T-039 | Absent |
| T-041 | D365 outbox dispatcher + JournalLines adapter | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-042 | D365 DLQ routes (list/replay/resolve/payload) | T2-api | ⛔ MISSING | `settings/d365-dlq/page.tsx` is a `SettingsRouteStub`; no real API | Stub page only |
| T-043 | Allergen changeover runtime endpoints + gate | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-044 | OEE per-minute aggregation + SSE stream | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-045 | Production settings + OEE target Server Actions | T2-api | ⛔ MISSING | Same as T-016 | Absent |
| T-046 | UI: production dashboard + WO list/detail + Start WO modal | T3-ui | 🟡 STUB | `apps/web/app/[locale]/(app)/(modules)/production/page.tsx` | Page exists but is a skeleton record-count panel, not the WO dashboard; no prototype parity; no WO list/modal |
| T-047 | UI: WO detail tabs (consumption/output/waste/genealogy/history) | T3-ui | ⛔ MISSING | No sub-routes under `/production/[id]` | Absent |
| T-048 | UI: allergen changeover screen | T3-ui | ⛔ MISSING | Same as T-047 | Absent |
| T-049 | UI: waste analytics + downtime + OEE screens | T3-ui | ⛔ MISSING | `oee/page.tsx` is `ModuleStubNotice`; no downtime/waste screens | OEE page is a stub |
| T-050 | UI: shifts + line detail + analytics hub + prod settings | T3-ui | ⛔ MISSING | Settings stubs only | Absent |
| T-051 | UI: D365 DLQ admin screen | T3-ui | 🟡 STUB | `settings/d365-dlq/page.tsx` (SettingsRouteStub) | Routing exists; content is a stub — no DLQ table/modals |
| T-052 | E2E happy path: WO start → consume → output → complete → D365 | T4-test | ⛔ MISSING | No E2E spec for production happy path | Absent |
| T-053 | E2E scanner-linked desktop cards | T4-test | ⛔ MISSING | Same as T-052 | Absent |
| T-054 | E2E exception gates | T4-test | ⛔ MISSING | Same as T-052 | Absent |
| T-055 | E2E operations closeout | T4-test | ⛔ MISSING | Same as T-052 | Absent |
| T-056 | Add production permission strings to enum | T2-api | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` has no `production.*` entries | `Permission` ends at `TECHNICAL_PRODUCT_SPEC_APPROVE`; 17 production strings absent; `ALL_PRODUCTION_PERMISSIONS` absent |

## Summary counts
- Declared: 56
- IMPLEMENTED: 0
- STUB: 2 (T-046, T-051)
- MISSING: 54 (T-001 through T-045, T-047–T-050, T-052–T-056)
- PHANTOM: 0
- BROKEN: 0
- EXTRA (code without a task): see below

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/production/page.tsx` — Skeleton record-count stub using `work_order` R13 placeholder table. This is Wave 0 skeleton work, not owned by T-046. It satisfies the Walking Skeleton DoD but not T-046.
- `apps/web/app/[locale]/(app)/(modules)/oee/page.tsx` — `ModuleStubNotice` placeholder; Wave 0 skeleton work, not T-049.
- `apps/web/app/[locale]/(app)/(admin)/settings/d365-dlq/page.tsx` — `SettingsRouteStub`; placeholder routing, not T-051.
- `apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx` — `SettingsRouteStub`; placeholder routing, not T-039/T-050.
- `apps/web/e2e/parity-evidence/shell/en-production.png` + `en-oee.png` — Shell-level parity evidence from Wave 0; not task-specific production evidence.

## Phantom / carry-forward backlog
None found via grep (no STATUS.md existed previously to carry forward from).

Cross-module blockers that must complete before 08-production can start:
- 01-NPD T-097 (canonical factory release read model)
- 03-TECHNICAL T-080 / T-081 (factory spec approval adapter)
- 04-PLANNING-BASIC T-001 (WO snapshot with active BOM/spec IDs)
- 02-SETTINGS T-020/T-122/T-126/T-127 (machine/line registry, RBAC helpers)

## Top integration risks

1. **Cross-module dependency chain blocks T-001 entirely.** The factory release runtime preflight (T-001) depends on 01-NPD T-097 (canonical read model) AND 03-TECHNICAL T-080/T-081 (adapter). Neither module is visibly implemented. T-001 is the gateway for every WO start/consume/output endpoint (T-016–T-034). Without T-001, no production runtime is safe to implement.

2. **oee_snapshots ownership is load-bearing for 15-OEE.** The playbook declares 08-production as the SOLE writer of `oee_snapshots` (D-OEE-1), and 15-OEE is read-only. T-008 (migration) is missing, which means 15-OEE has no table to read. Any out-of-order implementation of 15-OEE that creates its own snapshot table creates a canonical ownership conflict.

3. **T-056 (production permission strings) must precede ALL T2-api tasks.** Every production server action needs RBAC gate. The `Permission` enum has zero `production.*` strings and no `ALL_PRODUCTION_PERMISSIONS` export. If any API task ships before T-056, RBAC calls will either be absent or use raw strings outside the type-safe enum, violating the ESLint enum-lock guard.

## Skeleton contribution
- The production page (`/production`) renders a real Supabase org-scoped count of `public.work_order` R13 placeholder rows (Wave 0 skeleton). This satisfies the Walking Skeleton DoD for production module landing. The `work_order` table is NOT the full `wo_executions`/`wo_outputs` production schema — it is the R13 placeholder table from migration 014.
- OEE page (`/oee`) is a `ModuleStubNotice` stub — no Supabase data, just a badge.
- No production-specific data (WO state machine, consumption, outputs, downtime, OEE snapshots) exists in the DB yet — all T-002–T-010 migrations are absent.
