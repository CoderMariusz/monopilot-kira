# 07-planning-ext — Reality Audit (2026-06-02)

Auditor: kira:audit (reality pass)

## Counts

- task files: 58 | manifest task_count: 58 | STATUS rows: 58 → reconciliation: exact match
- Existing audits/reality files before this run: 0 (none for this module)

## Summary verdict

ALL 58 tasks are ⛔ MISSING. Zero implementation in repo.

The only scheduler-related code is a Wave 0 stub landing page:
`apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx` — renders `ModuleStubNotice`; no data, no actions.
No migrations (0070+), no Drizzle schemas, no API routes, no Python solver service, no UI components.

---

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | scheduler_runs table + RLS + indexes | T1-schema | ⛔ MISSING | packages/db/migrations/0070_scheduler_runs.sql — does not exist | No migration, no Drizzle schema, no RLS test |
| T-002 | scheduler_assignments table + RLS + indexes | T1-schema | ⛔ MISSING | — | — |
| T-003 | changeover_matrix + changeover_matrix_versions tables | T1-schema | ⛔ MISSING | — | — |
| T-004 | demand_forecasts table + RLS + supersession index | T1-schema | ⛔ MISSING | — | — |
| T-005 | forecast_actuals table + RLS | T1-schema | ⛔ MISSING | — | — |
| T-006 | scheduler_scenarios table (P2 what-if) | T1-schema | ⛔ MISSING | — | P2 gated |
| T-007 | matrix_review_request table (PLE-010) | T1-schema | ⛔ MISSING | — | — |
| T-008 | scheduler_config table (PLE-005) | T1-schema | ⛔ MISSING | — | — |
| T-009 | changeover_matrix_drafts staging table (PLE-012) | T1-schema | ⛔ MISSING | — | — |
| T-010 | seed default changeover_matrix (14 EU + Mustard + NONE) | T5-seed | ⛔ MISSING | — | Blocked by T-003 |
| T-011 | seed override_reason_codes reference table | T5-seed | ⛔ MISSING | — | — |
| T-012 | POST /api/scheduler/run endpoint + queue dispatch | T2-api | ⛔ MISSING | apps/web/src/app/api/scheduler/run/route.ts — does not exist (src/ dir absent) | Blocked by T-001, T-024; also cross-dep 04-planning-basic T-001, 01-npd T-097 |
| T-013 | GET /api/scheduler/runs/:id and /:id/status endpoints | T2-api | ⛔ MISSING | — | Blocked by T-001 |
| T-014 | POST /api/scheduler/assignments/:id/approve | T2-api | ⛔ MISSING | — | Blocked by T-002 |
| T-015 | POST /api/scheduler/assignments/:id/override | T2-api | ⛔ MISSING | — | Blocked by T-002 |
| T-016 | POST /api/scheduler/assignments/:id/reject | T2-api | ⛔ MISSING | — | Blocked by T-002 |
| T-017 | POST /api/scheduler/assignments/bulk_approve | T2-api | ⛔ MISSING | — | Blocked by T-002 |
| T-018 | GET/POST /api/scheduler/changeover-matrix endpoints | T2-api | ⛔ MISSING | — | Blocked by T-003 |
| T-019 | POST /api/scheduler/forecasts/upload (manual CSV) | T2-api | ⛔ MISSING | — | Blocked by T-004 |
| T-020 | GET /api/scheduler/forecasts (filter + pagination) | T2-api | ⛔ MISSING | — | Blocked by T-004 |
| T-021 | Python solver microservice scaffold (FastAPI) | T2-api | ⛔ MISSING | services/planner-solver/ — directory does not exist | Entirely absent; no Python in repo |
| T-022 | Greedy assignment algorithm in solver service | T2-api | ⛔ MISSING | — | Blocked by T-021 |
| T-023 | Local search refinement (swap pairs, move between lines) | T2-api | ⛔ MISSING | — | Blocked by T-022 |
| T-024 | Idempotency: UUID v7 + 1h cache for scheduler_runs | T2-api | ⛔ MISSING | — | Blocked by T-001 |
| T-025 | DSL rule finite_capacity_solver_v1 in 02-SETTINGS | T1-schema | ⛔ MISSING | packages/db/migrations/0080_rule_finite_capacity_solver_v1.sql — absent | — |
| T-026 | DSL rule allergen_sequencing_optimizer_v2 | T1-schema | ⛔ MISSING | — | — |
| T-027 | DSL rule disposition_bridge_v1 (P2 standby) | T1-schema | ⛔ MISSING | — | P2 gated |
| T-028 | Outbox emitters: scheduler.run.completed + assignment.approved | T2-api | ⛔ MISSING | — | Blocked by T-012, T-014 |
| T-029 | Outbox emitters: matrix.version.published + overridden + bulk_approved | T2-api | ⛔ MISSING | — | Blocked by T-018, T-015, T-017 |
| T-030 | SCR-07-01 Scheduler Dashboard Gantt (read-only) | T3-ui | ⛔ MISSING | apps/web/src/components/scheduler/GanttBoard.tsx — does not exist (src/ absent) | Prototype anchor: dashboard.jsx:9-363 (file has 505 lines — range valid) |
| T-031 | Assignment Side Panel (open on Gantt block click) | T3-ui | ⛔ MISSING | — | Prototype anchor: dashboard.jsx:365-451 (valid) |
| T-032 | Run Scheduler modal (run_scheduler_modal) | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:21-95 (file has 753 lines — valid) |
| T-033 | Override Assignment Modal | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:98-212 (valid) |
| T-034 | Reschedule WO Modal | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:214-287 (valid) |
| T-035 | Approve All modal | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:289-320 (valid) |
| T-036 | SCR-07-02 Changeover Matrix Editor (heatmap + tabs) | T3-ui | ⛔ MISSING | — | Prototype anchor: matrix-screens.jsx:12-245 (file has 247 lines — valid) |
| T-037 | Matrix Cell Edit Modal | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:322-378 (valid) |
| T-038 | Matrix Publish Modal | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:380-412 (valid) |
| T-039 | Matrix CSV Import Modal (3-stage state machine) | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:414-470 (valid) |
| T-040 | Matrix Diff Modal (cross-version compare) | T3-ui | ⛔ MISSING | — | Prototype anchor: modals.jsx:472-496 (valid) |
| T-041 | Request Review Modal (PLE-010) | T3-ui | ⛔ MISSING | — | — |
| T-042 | Forecast Upload screen and manual forecast management UI | T3-ui | ⛔ MISSING | — | — |
| T-043 | Scheduler Run History index UI | T3-ui | ⛔ MISSING | — | — |
| T-044 | Scheduler Run Detail page | T3-ui | ⛔ MISSING | — | — |
| T-045 | Re-run Confirmation Modal | T3-ui | ⛔ MISSING | — | — |
| T-046 | Capacity Projection screen | T3-ui | ⛔ MISSING | — | — |
| T-047 | Pending Assignment Queue full page | T3-ui | ⛔ MISSING | — | — |
| T-048 | Scheduler Settings screen | T3-ui | ⛔ MISSING | — | — |
| T-049 | Scheduler Rule Registry viewer | T3-ui | ⛔ MISSING | — | — |
| T-050 | Sequencing v2 preview and commit overlay | T3-ui | ⛔ MISSING | — | — |
| T-051 | Disable Optimizer v2 Modal | T3-ui | ⛔ MISSING | — | — |
| T-052 | What-If Simulation screen (P2 gated) | T3-ui | ⛔ MISSING | — | P2 gated |
| T-053 | Disposition Bridge P2 backend and decision modal | T4-wiring-test | ⛔ MISSING | — | P2 gated |
| T-054 | Prophet forecaster microservice and forecast actuals jobs (P2) | T2-api | ⛔ MISSING | — | P2 gated |
| T-055 | Factory release and D365 posture guard for scheduler inputs | T2-api | ⛔ MISSING | — | Cross-dep: 01-npd T-097, 03-technical T-081 (also absent) |
| T-056 | Scheduler end-to-end flow and prototype label marker tests | T4-wiring-test | ⛔ MISSING | apps/web/e2e/scheduler/ — directory absent | — |
| T-057 | 07-EXT ACP/readiness closeout report task | docs | ⛔ MISSING | _meta/atomic-tasks/07-planning-ext/coverage.md not yet written as closeout | coverage.md file exists but is not the closeout artifact |
| T-058 | Add planning-ext permission strings to enum (§3.1, §3.2) | T1-schema | ⛔ MISSING | packages/rbac/src/permissions.enum.ts exists but has NO scheduler/planner permissions | File exists — zero-dependency, unblocked |

---

## Phantom / carry-forward backlog

- Cross-dep: **04-planning-basic T-001** (factory release read-model consumer guards) — ALL ⬜ per 04-planning-basic audit. T-012/T-055 both depend on this.
- Cross-dep: **01-npd T-097** (canonical factory release read model owner) — not audited yet; assumed missing.
- Cross-dep: **03-technical T-081** (active factory spec/BOM guard data) — not audited; assumed missing.
- Cross-dep: **00-foundation T-111** (async worker infra) — required by T-012 dispatch path.
- Cross-dep: **00-foundation T-121** (rate-limit primitive) — required by T-012.

---

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx` — Wave 0 skeleton stub landing page. Renders `ModuleStubNotice`. No dedicated 07-planning-ext task owns it; it is the skeleton shell placeholder (🧩 EXTRA, intentional).

---

## Top integration risks

1. **Python solver service entirely absent** (T-021..T-023): No `services/planner-solver/` directory exists. This is the compute core; blocking T-012 dispatch and all downstream approval flows. Requires separate service scaffolding outside the Next.js monorepo.
2. **apps/web/src/ directory does not exist**: All T2-api and T3-ui scope_files reference `apps/web/src/app/...` and `apps/web/src/components/...`, but the project uses `apps/web/app/` (no `src/`). Every scope file path in tasks T-012..T-051 has the wrong base directory. This is a systematic scope-file path error across ~40 tasks and will cause confusion during implementation.
3. **Full dependency chain on 04-planning-basic (all ⬜)**: T-012's cross-module dependencies include 04-planning-basic T-001 (WO read model) and 01-npd T-097, both completely absent. Scheduling cannot read or validate WOs without these. Planning-ext cannot begin core scheduler execution until at least 04-planning-basic schema (T-004: work_orders) is in place.

---

## Skeleton contribution

- **Scheduler stub page exists** (`apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx`) — renders correctly, shows in navigation, counts as skeleton DoD navigation coverage.
- No real data wired; no Supabase queries in this module.
- The stub landing is sufficient for Wave 0 (click-through navigation). Full implementation begins in Wave 1+.
- **Prototype anchors validated**: All referenced prototype files exist and line-count ranges are valid (dashboard.jsx 505 lines, modals.jsx 753 lines, matrix-screens.jsx 247 lines). Prototype parity evidence is absent — correct for unstarted tasks.
