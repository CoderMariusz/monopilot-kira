# STATUS — 07-planning-ext

**Legend:** ✅ Done | 🔄 In Progress | ⏸ Blocked/Stub | ⬜ Not Started

**Audit date:** 2026-06-02 | **Auditor:** kira:audit (reality pass)
**Reality verdict:** ALL 58 tasks are ⬜ NOT STARTED — zero implementation in repo.

> See full evidence: `_meta/audits/reality/07-planning-ext-REALITY.md`

---

## Schema (T1-schema)

| Task | Title | Status | Note |
|---|---|---|---|
| T-001 | scheduler_runs table + RLS + indexes | ⬜ | No migration 0070, no Drizzle file, no RLS test |
| T-002 | scheduler_assignments table + RLS + indexes | ⬜ | — |
| T-003 | changeover_matrix + changeover_matrix_versions tables | ⬜ | — |
| T-004 | demand_forecasts table + RLS + supersession index | ⬜ | — |
| T-005 | forecast_actuals table + RLS | ⬜ | — |
| T-006 | scheduler_scenarios table (P2 what-if) | ⬜ | P2 gated |
| T-007 | matrix_review_request table (PLE-010) | ⬜ | — |
| T-008 | scheduler_config table (PLE-005) | ⬜ | — |
| T-009 | changeover_matrix_drafts staging table (PLE-012) | ⬜ | — |
| T-025 | DSL rule finite_capacity_solver_v1 in 02-SETTINGS | ⬜ | Migration 0080 absent |
| T-026 | DSL rule allergen_sequencing_optimizer_v2 | ⬜ | — |
| T-027 | DSL rule disposition_bridge_v1 (P2 standby) | ⬜ | P2 gated |
| T-058 | Add planning-ext permission strings to enum (§3.1, §3.2) | ⬜ | Zero-dependency; permissions.enum.ts exists but missing scheduler entries; unblocked, do first |

## Seeds (T5-seed)

| Task | Title | Status | Note |
|---|---|---|---|
| T-010 | seed default changeover_matrix (14 EU + Mustard + NONE) | ⬜ | Blocked by T-003 |
| T-011 | seed override_reason_codes reference table | ⬜ | — |

## API / Services (T2-api)

| Task | Title | Status | Note |
|---|---|---|---|
| T-012 | POST /api/scheduler/run endpoint + queue dispatch | ⬜ | Blocked by T-001, T-024; cross-dep 04-planning-basic T-001; apps/web/src/ path wrong (no src/ dir) |
| T-013 | GET /api/scheduler/runs/:id and /:id/status endpoints | ⬜ | Blocked by T-001 |
| T-014 | POST /api/scheduler/assignments/:id/approve | ⬜ | Blocked by T-002 |
| T-015 | POST /api/scheduler/assignments/:id/override | ⬜ | Blocked by T-002 |
| T-016 | POST /api/scheduler/assignments/:id/reject | ⬜ | Blocked by T-002 |
| T-017 | POST /api/scheduler/assignments/bulk_approve | ⬜ | Blocked by T-002 |
| T-018 | GET/POST /api/scheduler/changeover-matrix endpoints | ⬜ | Blocked by T-003 |
| T-019 | POST /api/scheduler/forecasts/upload (manual CSV) | ⬜ | Blocked by T-004 |
| T-020 | GET /api/scheduler/forecasts (filter + pagination) | ⬜ | Blocked by T-004 |
| T-021 | Python solver microservice scaffold (FastAPI) | ⬜ | services/planner-solver/ absent entirely; no Python in repo |
| T-022 | Greedy assignment algorithm in solver service | ⬜ | Blocked by T-021 |
| T-023 | Local search refinement (swap pairs, move between lines) | ⬜ | Blocked by T-022 |
| T-024 | Idempotency: UUID v7 + 1h cache for scheduler_runs | ⬜ | Blocked by T-001 |
| T-028 | Outbox emitters: scheduler.run.completed + assignment.approved | ⬜ | Blocked by T-012, T-014 |
| T-029 | Outbox emitters: matrix.version.published + overridden + bulk_approved | ⬜ | Blocked by T-018, T-015, T-017 |
| T-054 | Prophet forecaster microservice and forecast actuals jobs (P2) | ⬜ | P2 gated |
| T-055 | Factory release and D365 posture guard for scheduler inputs | ⬜ | Cross-dep 01-npd T-097, 03-technical T-081 (both absent) |

## UI (T3-ui)

| Task | Title | Status | Note |
|---|---|---|---|
| T-030 | SCR-07-01 Scheduler Dashboard Gantt (read-only) | ⬜ | apps/web/src/ path wrong; prototype anchor dashboard.jsx:9-363 valid |
| T-031 | Assignment Side Panel (open on Gantt block click) | ⬜ | Prototype anchor dashboard.jsx:365-451 valid |
| T-032 | Run Scheduler modal (run_scheduler_modal) | ⬜ | Prototype anchor modals.jsx:21-95 valid |
| T-033 | Override Assignment Modal | ⬜ | Prototype anchor modals.jsx:98-212 valid |
| T-034 | Reschedule WO Modal | ⬜ | Prototype anchor modals.jsx:214-287 valid |
| T-035 | Approve All modal | ⬜ | Prototype anchor modals.jsx:289-320 valid |
| T-036 | SCR-07-02 Changeover Matrix Editor (heatmap + tabs) | ⬜ | Prototype anchor matrix-screens.jsx:12-245 valid |
| T-037 | Matrix Cell Edit Modal | ⬜ | Prototype anchor modals.jsx:322-378 valid |
| T-038 | Matrix Publish Modal | ⬜ | Prototype anchor modals.jsx:380-412 valid |
| T-039 | Matrix CSV Import Modal (3-stage state machine) | ⬜ | Prototype anchor modals.jsx:414-470 valid |
| T-040 | Matrix Diff Modal (cross-version compare) | ⬜ | Prototype anchor modals.jsx:472-496 valid |
| T-041 | Request Review Modal (PLE-010) | ⬜ | — |
| T-042 | Forecast Upload screen and manual forecast management UI | ⬜ | — |
| T-043 | Scheduler Run History index UI | ⬜ | — |
| T-044 | Scheduler Run Detail page | ⬜ | — |
| T-045 | Re-run Confirmation Modal | ⬜ | — |
| T-046 | Capacity Projection screen | ⬜ | — |
| T-047 | Pending Assignment Queue full page | ⬜ | — |
| T-048 | Scheduler Settings screen | ⬜ | — |
| T-049 | Scheduler Rule Registry viewer | ⬜ | — |
| T-050 | Sequencing v2 preview and commit overlay | ⬜ | — |
| T-051 | Disable Optimizer v2 Modal | ⬜ | — |
| T-052 | What-If Simulation screen (P2 gated) | ⬜ | P2 gated |

## Tests (T4-wiring-test)

| Task | Title | Status | Note |
|---|---|---|---|
| T-053 | Disposition Bridge P2 backend and decision modal | ⬜ | P2 gated |
| T-056 | Scheduler end-to-end flow and prototype label marker tests | ⬜ | apps/web/e2e/scheduler/ absent |

## Docs (docs)

| Task | Title | Status | Note |
|---|---|---|---|
| T-057 | 07-EXT ACP/readiness closeout report task | ⬜ | coverage.md exists but is not the closeout artifact yet |

---

## Extra (unowned code)

- `apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx` — Wave 0 skeleton stub. No owning task; intentional skeleton placeholder.

## Scope-file path warning

Tasks T-012..T-051 use `apps/web/src/app/...` and `apps/web/src/components/...` but the repo uses `apps/web/app/...` (no `src/` layer). Implementers must resolve this path discrepancy before starting — likely adjust to `apps/web/app/` and `apps/web/components/`.


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-059 | Wire scheduler.* RBAC across routes/pages | ⬜ PENDING | X-1 + 07-F2. **wave-1**, mirror 04 T-033; after T-058 enum + T-060 seed. |
| T-060 | Seed scheduler.* permissions onto roles (NNN-scheduler-permission-seed.sql) | ⬜ PENDING | X-1 + 07-F2. **wave-1 p0**, after T-058 enum. |
| T-061 | Provision + wire planner-solver host + env contract + circuit breaker | ⬜ PENDING | 07-F1. Blocks the whole scheduler. **Contains a hosting DECISION** (see 🔒 below). After T-021/T-012/T-062. |
| T-062 | Reconcile solver dispatch to outbox/worker | ⬜ PENDING | 07-F3. Replace Postgres NOTIFY/LISTEN with outbox + apps/worker (T-111/T-112). Before/with T-061. |

Decisions / refinements (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| Solver hosting target | 🔒 DECISION | BLOCKED | Where does the FastAPI solver run (NOT Vercel — Fly.io/Render/Cloud Run/Railway)? Carried inside T-061; same host covers P2 forecaster T-054. |
| Path remap (X-3) | consolidation pass | ⬜ TODO | Remap T-012..T-052 `apps/web/src/...` → `apps/web/app/...` / `apps/web/components/...` before build. Already flagged in STATUS path warning above. |
