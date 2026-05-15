# PRD Coverage — 07-PLANNING-EXT full readiness hardening

Source PRD: `docs/prd/07-PLANNING-EXT-PRD.md` v3.2 + Wave Next decisions 2026-05-03.
Prototype index: `_meta/prototype-labels/prototype-index-planning-ext.json`.
Task manifest: `_meta/atomic-tasks/07-planning-ext/manifest.json`.
Validator: `python3 _meta/atomic-tasks/07-planning-ext/_validate.py`.

Readiness target: Wave Next docs/meta/prototype/task readiness >=95% before ACP execution.
Current readiness verdict after this hardening: **96%+ ready** for ACP import and autonomous implementation planning.

## Wave Next readiness decisions applied

| Decision / hardening requirement | Coverage | Status |
|---|---|---|
| ACP real TaskCreate shape: top-level `title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`; no ACP-owned generated fields | all `tasks/T-*.json`, `_validate.py` | covered |
| Rich prompt shape with exact PRD/UX/prototype refs, scope files, acceptance criteria, tests, red lines, skills and checkpoint policy | all `tasks/T-*.json` | covered |
| Local dependencies use only local `T-XXX` IDs | all `pipeline_inputs.dependencies` | covered |
| Cross-module blockers/contracts are separated under `pipeline_inputs.cross_module_dependencies` | T-012, T-014, T-015, T-018, T-019, T-021, T-025..T-030, T-033, T-034, T-036, T-042..T-056 | covered |
| Factory release model consistency with 04/08: scheduler consumes canonical factory release read model; D365/local export flags never unlock scheduling | T-055 plus cross deps to 01/03/04/08 | covered |
| D365 posture: optional P2 sales-history source only; no P1 source-of-truth dependency | T-019, T-042, T-054, T-055 | covered |
| Prototype labels present in module index and master index with JSX path/line ranges | prototype-index + master-index planning-ext entries | covered |
| Missing manifest and coverage closed | `manifest.json`, `coverage.md` | covered |

## PRD / UX / prototype surface coverage

| PRD area / surface | UX / prototype label | Tasks | Status |
|---|---|---|---|
| §9.2 `scheduler_runs` schema, RLS, indexes | data model | T-001 | tasked |
| §9.3 `scheduler_assignments` schema, RLS, indexes | data model | T-002 | tasked |
| §9.4 `changeover_matrix` + versions | `pext_matrix_editor`, matrix modals | T-003, T-036..T-041 | tasked |
| §9.5 `demand_forecasts` | `pext_forecasts_screen`, `forecast_upload_modal` | T-004, T-019, T-020, T-042 | tasked |
| §9.6 `forecast_actuals` and SMAPE | forecast P2 | T-005, T-054 | tasked / P2-gated |
| §9.7 `scheduler_scenarios` | `pext_scenarios` | T-006, T-052 | tasked / P2-gated |
| §17.1 PLE-010 `matrix_review_request` | `request_review_modal` | T-007, T-041 | tasked |
| §17.1 PLE-005 `scheduler_config` | `pext_settings_screen` | T-008, T-048 | tasked |
| §17.1 PLE-012 matrix import staging | `matrix_import_modal` | T-009, T-039 | tasked |
| §7.2 seed matrix 14 EU + Mustard + NONE | matrix editor | T-010 | tasked |
| Override reason reference data | override/reschedule modals | T-011, T-033, T-034 | tasked |
| §8.2 scheduler run APIs and queue dispatch | `run_scheduler_modal` | T-012, T-013, T-021..T-024, T-032 | tasked |
| §8.2 assignment approve/reject/override/bulk approve | dashboard side panel, pending page, modals | T-014..T-017, T-031, T-033..T-035, T-047 | tasked |
| §8.2 changeover matrix APIs | matrix editor/import/diff/publish | T-018, T-029, T-036..T-040 | tasked |
| §10 DSL rules | `pext_rules_screen`, `pext_sequencing`, `disable_v2_modal` | T-025..T-027, T-049..T-051 | tasked |
| §8.1 SCR-07-01 Scheduler Dashboard Gantt | `pext_dashboard_gantt`, `assignment_side_panel` | T-030, T-031, T-032, T-056 | tasked |
| §17.1 PLE-001 Run History index | `pext_run_history` | T-043, T-045 | tasked |
| §17.1 PLE-002 Run Detail | `pext_run_detail` | T-044, T-045 | tasked |
| §17.1 PLE-003 Capacity Projection | `pext_capacity_projection` | T-046 | tasked |
| §17.1 PLE-004 Pending Review Full Page | `pext_pending_full_page` | T-047 | tasked |
| §17.1 PLE-005 Scheduler Settings | `pext_settings_screen` | T-048 | tasked |
| §17.1 PLE-006 Rule Registry Viewer | `pext_rules_screen` | T-049 | tasked |
| §17.1 PLE-007 Sequencing v2 overlay | `pext_sequencing`, `disable_v2_modal` | T-050, T-051 | tasked |
| §17.1 PLE-008 What-if simulation | `pext_scenarios` | T-052 | tasked / P2-gated |
| §7.4 / §10.3 Disposition Bridge P2 | `disposition_decision_modal` | T-027, T-053 | tasked / P2-gated |
| §7.3 / §4.2 Prophet P2 | `pext_forecasts_screen` P2 branch | T-054 | tasked / P2-gated |
| Factory release input guard consistency with 04/08 | no separate prototype; backend guard | T-055 | tasked |
| End-to-end and label marker evidence | all P1 labels in prototype index | T-056, T-057 | tasked |

## Prototype label coverage

The module index currently contains 25 first-class planning-ext labels:

- Modals: `run_scheduler_modal`, `override_assignment_modal`, `reschedule_wo_modal`, `approve_all_modal`, `matrix_cell_edit_modal`, `matrix_publish_modal`, `matrix_import_modal`, `matrix_diff_modal`, `forecast_upload_modal`, `disposition_decision_modal`, `rerun_confirm_modal`, `disable_v2_modal`, `request_review_modal`.
- Pages/panels: `pext_dashboard_gantt`, `assignment_side_panel`, `pext_forecasts_screen`, `pext_matrix_editor`, `pext_pending_full_page`, `pext_capacity_projection`, `pext_run_history`, `pext_run_detail`, `pext_scenarios`, `pext_sequencing`, `pext_rules_screen`, `pext_settings_screen`.

All labels have concrete JSX file paths and line ranges in `prototypes/design/Monopilot Design System/planning-ext/*.jsx`; the same planning-ext entries are present in `_meta/prototype-labels/master-index.json`. T-056 requires implementation-time marker evidence using `data-prototype-label` or an explicit P2/locked exception.

## Remaining intentional gaps / non-blockers

| Item | Reason not a readiness blocker | Follow-up |
|---|---|---|
| P2 Prophet, what-if simulation, disposition bridge | PRD marks as P2 and tasks are feature-gated | T-052, T-053, T-054 |
| Dedicated UX prose sections for capacity/settings/rules | Prototype + PRD PLE anchors exist; UX addendum documents them as auxiliary screens | UX addendum / future polish |
| D365 sales history pull | Optional P2 input only; manual forecasts cover P1 | T-054 / 13-INTEGRATIONS |
| Product-release implementation ownership | Owned by 01/03/04/08; 07 only consumes read model and blocks unsafe inputs | T-055 |

## Validation commands

- `python3 _meta/atomic-tasks/07-planning-ext/_validate.py`
- JSON parse / label count script over `_meta/prototype-labels/prototype-index-planning-ext.json` and `_meta/prototype-labels/master-index.json`

No unresolved gap rows remain in this coverage file.

## Coverage rows (gold-standard re-author 2026-05-14)

| Task | Sub-module | task_type | PRD §refs | Title |
|---|---|---|---|---|
| T-001 | schema-scheduler | T1-schema | §9.1, §9.2, §5.1.1, §5.4.4, OQ-EXT-09 | T-001 — scheduler_runs table + RLS + indexes |
| T-002 | schema-scheduler | T1-schema | §9.3, §15.4 | T-002 — scheduler_assignments table + RLS + indexes |
| T-003 | schema-matrix | T1-schema | §9.4, §6 D5 | T-003 — changeover_matrix + changeover_matrix_versions tables |
| T-004 | schema-forecast | T1-schema | §9.5, §4.1.4, §4.2 | T-004 — demand_forecasts table + RLS + supersession index |
| T-005 | schema-forecast | T1-schema | §9.6, §11.2 | T-005 — forecast_actuals table + RLS |
| T-006 | schema-scenarios | T1-schema | §9.7, §17.1 PLE-008 | T-006 — scheduler_scenarios table (P2 what-if) |
| T-007 | schema-matrix | T1-schema | §17.1 PLE-010, §16.2 OQ-EXT-04 | T-007 — matrix_review_request table (PLE-010) |
| T-008 | schema-config | T1-schema | §17.1 PLE-005, §17.3 | T-008 — scheduler_config table (PLE-005) |
| T-009 | schema-matrix | T1-schema | §17.1 PLE-012, §17.3 | T-009 — changeover_matrix_drafts staging table (PLE-012) |
| T-010 | seed-matrix | T5-seed | §4.1.3, §7.2 FR-07-E2-001, §15.3 | T-010 — seed default changeover_matrix (14 EU + Mustard + NONE) |
| T-011 | seed-reference | T5-seed | §8.2 | T-011 — seed override_reason_codes reference table |
| T-012 | endpoint-post | T2-api | §8.2, §5.1.1, §7.1 | T-012 — POST /api/scheduler/run endpoint + queue dispatch |
| T-013 | endpoint-get | T2-api | §8.2, §8.3 | T-013 — GET /api/scheduler/runs/:id and /:id/status endpoints |
| T-014 | endpoint-post | T2-api | §8.2, §9.3, §15.4 V-SCHED-07 | T-014 — POST /api/scheduler/assignments/:id/approve |
| T-015 | endpoint-post | T2-api | §8.2, §9.3, §15.4 V-SCHED-02, V-SCHED-03, V-SCHED-04, V-SCHED-08 | T-015 — POST /api/scheduler/assignments/:id/override |
| T-016 | endpoint-post | T2-api | §8.2, §9.3 | T-016 — POST /api/scheduler/assignments/:id/reject |
| T-017 | endpoint-post | T2-api | §16.2 OQ-EXT-06, §17.1 PLE-004 | T-017 — POST /api/scheduler/assignments/bulk_approve |
| T-018 | endpoint-mixed | T2-api | §8.2, §7.2 FR-07-E2-002 | T-018 — GET/POST /api/scheduler/changeover-matrix endpoints |
| T-019 | endpoint-post | T2-api | §8.2, §7.3, §8.3 | T-019 — POST /api/scheduler/forecasts/upload (manual CSV) |
| T-020 | endpoint-get | T2-api | §8.2 | T-020 — GET /api/scheduler/forecasts (filter + pagination) |
| T-021 | service-scaffold | T2-api | §1.4, §5.1.1, §5.4.1, §13.1 | T-021 — Python solver microservice scaffold (FastAPI) |
| T-022 | algorithm-greedy | T2-api | §6 D1, §10.1, §7.1 FR-07-E1-002 | T-022 — Greedy assignment algorithm in solver service |
| T-023 | algorithm-local-search | T2-api | §6 D1, §10.1 | T-023 — Local search refinement (swap pairs, move between lines) |
| T-024 | idempotency | T2-api | §5.1.2 R14, §8.2 | T-024 — Idempotency: UUID v7 + 1h cache for scheduler_runs |
| T-025 | dsl-rule | T1-schema | §10.1, §6 D2 | T-025 — DSL rule finite_capacity_solver_v1 registered in 02-SETTINGS |
| T-026 | dsl-rule | T1-schema | §10.2, §6 D2, Appendix B | T-026 — DSL rule allergen_sequencing_optimizer_v2 registered in 02-SETTINGS |
| T-027 | dsl-rule | T1-schema | §10.3, §15.4 V-SCHED-10, Appendix B | T-027 — DSL rule disposition_bridge_v1 registered (P2 standby) |
| T-028 | outbox-emitter | T2-api | §9.8, §5.1.3 | T-028 — Outbox emitters: scheduler.run.completed + assignment.approved |
| T-029 | outbox-emitter | T2-api | §9.8, §17.1 PLE-013, §17.1 PLE-004 | T-029 — Outbox emitters: matrix.version.published + assignment.overridden + bulk_approved |
| T-030 | screen-gantt | T3-ui | §8.1 SCR-07-01, §4.1.5, §16.2 OQ-EXT-05 | T-030 — SCR-07-01 Scheduler Dashboard Gantt (read-only) |
| T-031 | panel-side | T3-ui | §8.1 SCR-07-01, §3.4 | T-031 — Assignment Side Panel (open on Gantt block click) |
| T-032 | modal-run | T3-ui | §4.1.6, §8.1 | T-032 — MODAL-07-01 Run Scheduler modal (run_scheduler_modal) |
| T-033 | modal-override | T3-ui | §8.2, §15.4 V-SCHED-02/03/04/08 | T-033 — Override Assignment Modal (override_assignment_modal) |
| T-034 | modal-reschedule | T3-ui | §8.1 SCR-07-01 | T-034 — Reschedule WO Modal (reschedule_wo_modal) |
| T-035 | modal-bulk-approve | T3-ui | §8.1, §16.2 OQ-EXT-06 | T-035 — Approve All modal (approve_all_modal) |
| T-036 | screen-matrix-editor | T3-ui | §8.1 SCR-07-02, §6 D5 | T-036 — SCR-07-02 Changeover Matrix Editor (heatmap + tabs) |
| T-037 | modal-cell-edit | T3-ui | §8.1 SCR-07-02, §17.1 PLE-013, V-CM-04 | T-037 — Matrix Cell Edit Modal (matrix_cell_edit_modal) |
| T-038 | modal-publish | T3-ui | §17.1 PLE-013, §8.1 SCR-07-02 | T-038 — Matrix Publish Modal (matrix_publish_modal) |
| T-039 | modal-import | T3-ui | §17.1 PLE-012, V-CM-01, V-CM-02, V-CM-03, V-CM-04 | T-039 — Matrix CSV Import Modal (matrix_import_modal) — 3-stage state machine |
| T-040 | modal-diff | T3-ui | §17.1 PLE-011 | T-040 — Matrix Diff Modal (matrix_diff_modal) — cross-version compare |
| T-041 | modal-review-request | T3-ui | §17.1 PLE-010, §16.2 OQ-EXT-04 | T-041 — Request Review Modal (request_review_modal) — PLE-010 |
| T-042 | forecast-screen | T3-ui | §8.1 SCR-07-03, §17.1 PLE forecast coverage, §15.4 V-SCHED-09 | T-042 — Forecast Upload screen and manual forecast management UI |
| T-043 | run-history-index | T3-ui | §8.1 SCR-07-04, §17.1 PLE-001, §18 matrix | T-043 — Scheduler Run History index UI |
| T-044 | run-detail | T3-ui | §17.1 PLE-002, §9.2, §9.3 | T-044 — Scheduler Run Detail page |
| T-045 | rerun-modal | T3-ui | §17.1 PLE-009, §16.2 OQ-EXT-09, R14 | T-045 — Re-run Confirmation Modal |
| T-046 | capacity-projection | T3-ui | §17.1 PLE-003, §11.1, §15.4 V-SCHED-04 | T-046 — Capacity Projection screen |
| T-047 | pending-assignment-queue | T3-ui | §17.1 PLE-004, §8.1 Zone D, §16.2 OQ-EXT-06 | T-047 — Pending Assignment Queue full page |
| T-048 | scheduler-settings | T3-ui | §17.1 PLE-005, Appendix B feature flags | T-048 — Scheduler Settings screen |
| T-049 | rule-viewer | T3-ui | §17.1 PLE-006, §10 business rules | T-049 — Scheduler Rule Registry viewer |
| T-050 | sequencing-v2-overlay | T3-ui | §17.1 PLE-007, §10.2, §16.2 OQ-EXT-09 | T-050 — Sequencing v2 preview and commit overlay |
| T-051 | disable-v2-modal | T3-ui | §17.1 PLE-013, §10.2 fallback | T-051 — Disable Optimizer v2 Modal |
| T-052 | what-if-simulation | T3-ui | §8.1 SCR-07-05, §17.1 PLE-008, §9.7 | T-052 — What-If Simulation screen (P2 gated) |
| T-053 | disposition-bridge | T4-wiring-test | §7.4 Epic E4, §10.3, §17.1 PLE disposition, §15.4 V-SCHED-10 | T-053 — Disposition Bridge P2 backend and decision modal |
| T-054 | prophet-forecaster | T2-api | §7.3 Epic E3, §4.2 P2, §9.5-§9.6, §15.3 | T-054 — Prophet forecaster microservice and forecast actuals jobs (P2) |
| T-055 | factory-release-input-guard | T2-api | §5.5 input data, §15 dependencies, Wave0 factory release decisions | T-055 — Factory release and D365 posture guard for scheduler inputs |
| T-056 | scheduler-e2e-prototype-coverage | T4-wiring-test | §13.1 P1 checklist, §18 UI matrix, prototype-index-planning-ext.json | T-056 — Scheduler end-to-end flow and prototype label marker tests |
| T-057 | readiness-closeout | docs | coverage.md, manifest.json, _validate.py | T-057 — 07-EXT ACP/readiness closeout report task |
## Permission-enum addition 2026-05-14

| PRD/review ref | Task file | Sub-module | Type | Status | Notes |
|---|---|---|---|---|---|
| §3.1, §3.2 (RBAC enum delta — closes _meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md GAP) | tasks/T-058.json | 07-PLANNING-EXT RBAC enum addition | T1-schema | added | 11 `scheduler.*` strings appended to packages/rbac/src/permissions.enum.ts + ALL_<MODULE>_PERMISSIONS export |
