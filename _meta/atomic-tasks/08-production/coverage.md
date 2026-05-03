# PRD Coverage — 08-PRODUCTION full module readiness hardening

Source PRD: `docs/prd/08-PRODUCTION-PRD.md` v3.1.1 + Wave0/Wave Next 2026-05-03 decisions.

Readiness target: >95% docs/meta/prototype/task readiness before ACP import/execution. This coverage file supersedes the earlier release-contract-only slice and covers the whole Production module: schema, APIs, state/rule gates, D365 side effects, UI parity, prototype labels, screenshot/trace evidence, local dependencies, and cross-module contracts.

## Locked contracts applied

- Production is a runtime consumer only. 04-PLANNING owns WO definition and snapshots canonical `active_bom_header_id`, `active_factory_spec_id`, `factory_release_event_id`, and release status metadata onto the WO.
- START / material consumption / output registration must admit only WOs whose canonical factory release read model is `approved_for_factory` or `released_to_factory` with non-null active BOM/spec IDs.
- `pending_npd_release`, `pending_technical_approval`, `blocked`, missing active IDs, or stale release rows are typed blockers and do not mutate runtime state.
- D365 SO/Built/export/sync/push is optional integration metadata/side effect only; it never unlocks factory use and never replaces the canonical release read model.
- `release_wo_modal` is deprecated/stale and must not be implemented in Production; any release/readying UI belongs to Planning.
- UI tasks require parity against `prototypes/design/Monopilot Design System/production/*`, literal `data-prototype-label`/equivalent markers, screenshots/artifacts, and Playwright traces/artifacts.

## Task coverage table

| Area / PRD ref | Requirement | Task files | Status |
|---|---|---|---|
| §1.1A Factory release read-model contract | Runtime preflight consumes only approved canonical WO snapshot with `active_bom_header_id` + `active_factory_spec_id`; no D365 source-of-truth | `tasks/T-001.json` | tasked |
| §7 data model | Consumption/output/waste/downtime/changeover/OEE/outbox/DLQ schemas, RLS and org scope | `T-002`..`T-010` | tasked |
| KPI/materialized views | Operator KPI monthly view and refresh | `T-011` | tasked |
| 02-SETTINGS rule registry coupling | `wo_state_machine_v1`, `closed_production_strict_v1`, `output_yield_gate_v1`, `allergen_changeover_gate_v1` | `T-012`..`T-014` | tasked |
| R14 idempotency | transaction_id cache/helper for mutation endpoints | `T-015` | tasked |
| §8.2.1 WO execution API | start/pause/resume/complete/cancel/detail, optimistic locking | `T-016`..`T-022` | tasked |
| §8.2.2 Consumption API | scanner consume-to-WO, over-consumption approval, genealogy, FEFO, material status | `T-023`..`T-027` | tasked |
| §8.2.3 Output/waste API | primary/co/by-product output, waste record, genealogy, catch-weight, PDF labels, yield gate | `T-028`..`T-034` | tasked |
| Downtime and shifts | downtime taxonomy, manual events, analytics, shift attribution, handovers, sign-off gates | `T-035`..`T-040` | tasked |
| §8.2.7 / D365 outbox | D365 JournalLines anti-corruption adapter, dispatcher, DLQ creation; D365 remains side effect only | `T-041` | tasked |
| PROD-012 DLQ management | DLQ list/replay/resolve/payload APIs with audit | `T-042` | tasked |
| SCR-08-03 / MODAL-08-11 | allergen changeover endpoints, ATP evidence, dual sign-off, START gate wiring | `T-043` | tasked |
| SCR-08-07 / SCR-08-11 | OEE snapshots, line event stream, line-detail aggregation | `T-044` | tasked |
| SCR-08-10 / MODAL-08-15 | production settings, OEE target windows, downtime/waste taxonomies, D365 push flags via Settings | `T-045` | tasked |
| SCR-08-01/02 + MODAL-08-02 | dashboard, line cards, WO list/detail, Start WO modal with release blockers and no Release WO modal | `T-046` | tasked |
| SCR-08-02/12 | consumption/output/waste/genealogy/history tabs and scanner-linked cards | `T-047` | tasked |
| SCR-08-03 | full allergen changeover UI parity beyond prototype stub | `T-048` | tasked |
| SCR-08-04/05/07 | waste analytics, downtime, OEE UI parity | `T-049` | tasked |
| SCR-08-08/09/10/11 | shifts, analytics hub, settings, line detail UI parity | `T-050` | tasked |
| SCR-08-06 / PROD-012 | D365 DLQ admin UI + inspect/replay/resolve modals | `T-051` | tasked |
| End-to-end evidence | approved WO happy path to D365 enqueue with screenshots/traces | `T-052` | tasked |
| Scanner integration evidence | signed scanner cards and scanner endpoint contracts | `T-053` | tasked |
| Exception gates evidence | blocked release, allergen, over-consumption, completion gate failures | `T-054` | tasked |
| Operations closeout evidence | shift sign-off, OEE, downtime, DLQ replay/resolve | `T-055` | tasked |

## PRD / UX / prototype traceability

| PRD ID | UX section | Prototype label(s) | Implementation task(s) | Readiness note |
|---|---|---|---|---|
| SCR-08-01 Dashboard | PROD-001 | `production_dashboard`, `line_card` | `T-046`, `T-052` | OK; release blocker badges and D365 side-effect status included. |
| SCR-08-02 WO detail | PROD-002..004 | `wo_detail`, `consumption_tab`, `output_tab`, `genealogy_tab`, `history_tab` | `T-046`, `T-047`, `T-052`..`T-054` | OK; tabs backed by runtime APIs and scanner contracts. |
| SCR-08-03 Changeover gate | PROD-005 | `changeover_screen`, `changeover_gate_modal` | `T-043`, `T-048`, `T-054` | Hardened; prototype stub explicitly expanded by tasks. |
| SCR-08-04 Waste analytics | PROD-010 | `waste_analytics_screen`, `waste_modal` | `T-030`, `T-049`, `T-055` | OK. |
| SCR-08-05 Downtime | PROD-007 | `downtime_screen`, `pause_line_modal`, `resume_line_modal` | `T-017`, `T-018`, `T-036`, `T-037`, `T-049`, `T-055` | OK. |
| SCR-08-06 D365 DLQ | PROD-012 | `dlq_screen`, `dlq_inspect_modal` | `T-041`, `T-042`, `T-051`, `T-055` | OK; D365 is delivery side effect only. |
| SCR-08-07 OEE | PROD-006 | `oee_screen`, `oee_target_edit_modal` | `T-044`, `T-045`, `T-049` | OK; advanced analytics remain 15-OEE boundary. |
| SCR-08-08 Shifts | PROD-008 | `shifts_screen`, `shift_start_modal`, `shift_end_modal`, `assign_crew_modal` | `T-039`, `T-040`, `T-050`, `T-055` | OK. |
| SCR-08-09 Analytics hub | PROD-009 | `analytics_screen` | `T-050` | OK. |
| SCR-08-10 Settings | PROD-011 | `settings_screen`, `oee_target_edit_modal` | `T-045`, `T-050` | OK; Settings/global flag ownership respected. |
| SCR-08-11 Line detail | PROD-013 | `line_detail` | `T-044`, `T-050`, `T-055` | OK; SSE and OEE mini-dashboard tasked. |
| SCR-08-12 Scanner reference cards | PROD-014 | `scanner_modal` pattern | `T-047`, `T-053` | OK; 06-SCANNER owns actual operator UX. |
| SCR-08-13 Tweaks panel | no UX | `tweaks_panel` | out-of-scope P1; keep hidden behind feature flag / migrate to 02-SETTINGS | Explicit non-blocker; not factory runtime P1. |
| MODAL-08-01 Release WO | deprecated | `release_wo_modal` removal note | none | Explicitly deprecated; do not implement in Production. |
| MODAL-08-02..15 | UX modal section | all non-deprecated modal labels | `T-046`..`T-051` | OK; UI tasks require screenshot + trace evidence. |

## Cross-module dependencies recorded

- 01-NPD `T-097`: canonical factory release read-model owner.
- 03-TECHNICAL `T-080`/`T-081`: active factory spec/BOM approval, allergen profile, factory-use adapters.
- 04-PLANNING-BASIC `T-001`: WO snapshot with active BOM/spec IDs before Production runtime.
- 05-WAREHOUSE: LP availability/status, putaway, inventory adjustment, warehouse LP state.
- 06-SCANNER-P1: scanner execute/consume/output/waste flows and signed deep-link handoff.
- 02-SETTINGS: rule registry, permissions, flags, production lines/machines/operators, D365 capability registry.
- 09-QUALITY: QA holds, inspection requests, ATP / quality sign-off seam; exact task IDs are pending Quality decomposition and are captured as typed external contracts in relevant tasks.

## Validation status

- `_meta/atomic-tasks/08-production/_validate.py`: PASS after hardening (`55 tasks validated`).
- `manifest.json`: references all `T-001`..`T-055` task files.
- No unresolved P1 PRD/UX/prototype coverage gaps remain. Remaining non-P1 item: `tweaks_panel` internal/devtools surface is explicitly hidden/migration candidate and not a readiness blocker.
