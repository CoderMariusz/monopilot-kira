# PRD Coverage — 07-PLANNING-EXT full readiness hardening

Source PRD: `07-PLANNING-EXT-PRD.md` v3.2 + Wave Next decisions 2026-05-03.
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

All labels have concrete JSX file paths and line ranges in `design/Monopilot Design System/planning-ext/*.jsx`; the same planning-ext entries are present in `_meta/prototype-labels/master-index.json`. T-056 requires implementation-time marker evidence using `data-prototype-label` or an explicit P2/locked exception.

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
