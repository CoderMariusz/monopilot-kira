# 13-Maintenance Atomic Tasks Bootstrap Report

Date: 2026-05-14
Generator: prd-decompose-13-maintenance-bootstrap
Audit input: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §13-MAINTENANCE 9 priority slices
PRD: `docs/prd/13-MAINTENANCE-PRD.md` v3.1 (Manufacturing Operations + UI surface catalog amendment, 2026-04-30, 1074 lines)
UX: `prototypes/design/13-MAINTENANCE-UX.md` (1379 lines, MAINT-001..021 screens)
Prototype index: `_meta/prototype-labels/prototype-index-maintenance.json` (35 labeled entries)
Translation notes: `_meta/prototype-labels/translation-notes-maintenance.md`

## Result

| Metric | Value |
|---|---|
| Total atomic tasks generated | **30** (T-001..T-030) |
| JSON validation | all 30 files pass `json.load()` |
| Target range hit | within 18-36 brief target |
| Manifest | `manifest.json` (30 task refs + cross-module deps) |
| Coverage doc | `coverage.md` (sub-module map + AC closure + P2 deferral) |
| P0 blockers | 1 (T-001 permission enum, priority 90) |

## Sub-module distribution

| Sub-module | Tasks | Count |
|---|---|---|
| 13-a (settings + asset registry + RBAC/GDPR/i18n) | T-001, T-002, T-013, T-019, T-026 | 5 |
| 13-b (PM schedules + engine + calendar) | T-003, T-020 (+ T-009 PM portion) | 2 (+1 shared) |
| 13-c (MWO core + LOTO + dashboard + analytics + e2e) | T-004, T-007, T-008, T-010, T-014, T-017, T-018, T-021, T-022, T-025, T-028, T-029, T-030 | 13 |
| 13-d (spare parts) | T-005, T-011, T-023 (+ T-009 reorder portion) | 3 (+1 shared) |
| 13-e (calibration + sanitation + outbox + settings UI) | T-006, T-012, T-015, T-016, T-024, T-027 | 6 |
| **Cross-cutting workers (T-009 spans 13-b and 13-d)** | T-009 | 1 |

Total 30 unique tasks. T-009 counted once (sub-module 13-b primary).

## P0 blockers

| Task | Priority | Labels | Description |
|---|---|---|---|
| **T-001** | 90 | `p0-blocker`, `auth`, `permissions`, `T1-schema` | Lock 17 mnt.*.* permission strings into `packages/rbac/src/permissions.enum.ts` per PRD §4 RBAC + Auditor A cross-cutting gap #4 |

## Cross-module dependencies declared

In `manifest.json` and per-task `pipeline_inputs.cross_module_dependencies` / `dependencies`:

- **00-foundation Wave1**: T-111/T-112 (outbox+worker), T-113/T-114 (GDPR), T-116..T-118 (observability), T-121 (rate-limit), T-122 (CI/CD), T-123 (Playwright), T-124 (e-sign — used by T-014 LOTO + T-016 sanitation), T-125 (`app.current_org_id()` — used by every migration RLS policy)
- **02-settings**: `rule_definitions` registry (used by T-007), `manufacturing_operations` ref table (used by T-003 V-MNT-23 operation_context validation), `reference_tables_registry` pattern (used by T-013)
- **03-technical**: equipment.parent_line_id soft reference; asset hierarchy ltree expansion deferred to 14-multi-site
- **05-warehouse**: spare_parts_stock.warehouse_id soft reference; no FEFO per D-MNT-6
- **08-production**: `downtime_events` FK target (T-017 auto-MWO consumer), `production_lines` FK target (equipment.parent_line_id), `allergen_changeover_gate_v1` consumer of `sanitation.allergen_change.completed` (D-MNT-14 — T-016 emits)
- **09-quality**: `lab_results.equipment_id` FK target documented (D-MNT-10 forward-compat comment in T-006); `calibration.failed` outbox consumer (V-MNT-10 — T-015 emits)
- **12-reporting**: `dashboards_catalog` seed (T-029 — 6 P1 + 8 P2 dashboards); `mwo.*` outbox consumer (T-012 routing)
- **15-oee**: `oee_shift_metrics` read-only consumer for MTBF/MTTR (D-MNT-3 — T-018 dashboard + T-027 analytics); `oee_maintenance_trigger_v1` P2 stub registered in T-007 (evaluation lives in 15-OEE)

## Auditor A 9 priority slices coverage

All 9 slices closed by 30 tasks. Mapping table in `coverage.md` §Auditor A priority slices → atomic task mapping.

## Foundation gaps closed (Auditor A cross-cutting)

| Gap | Closure |
|---|---|
| Permissions.enum.ts delta | T-001 (p0-blocker priority 90) |
| GDPR right-to-erasure | T-013 (pseudonymise technician_profiles via Wave1 T-114 orchestrator) |
| i18n PL/EN keys | T-013 (`maintenance.*` namespace covering UI + error codes) |
| RLS via `app.current_org_id()` no GUC reads | T-002..T-006 (every migration ACs assert policy text) |
| Outbox publisher | T-012 (8 events + Zod contracts + DLQ + cross-module routing) |
| `apps/worker` per-tenant cron | T-009 (3 cron engines) + T-017 (auto-downtime consumer) using Wave1 T-111/T-112 |
| Rate-limit + observability wrappers | T-028 (Wave1 T-121 + T-116..T-118 wired into all 6 Server Action modules; safety bucket 10/min on LOTO) |
| Empty/loading/error/permission UI states | required by UI parity policy on every UI task (T-018..T-027) |
| Playwright artifacts in closeout | T-030 dedicated E2E trace + UI-PROTOTYPE-PARITY-POLICY.md cited on all UI tasks |
| Cross-module integration test (CIG-3) | T-030 E2E asserts WR→complete + outbox routing to 12-reporting/15-OEE/09-quality consumer queues |

## Maintenance-specific red lines locked

Each task carries 4-6 risk red lines covering at minimum:
- Asset registry = `equipment` table (no parallel assets table) per §9.3 / D-MNT-3
- Work Request = MWO state='requested' (no parallel work_requests table) per D-MNT-9
- PM schedules driven by calendar_days in P1 (usage_hours/cycles schema-present but engine-deferred to P2)
- CMMS work orders distinct from production WOs (`maintenance_work_orders` table)
- Downtime events feed OEE (read-only consumer per D-MNT-3) — maintenance does NOT compute MTBF/MTTR
- Mechanic e-sign on close via Wave1 T-124 (T-014 LOTO + T-016 sanitation + T-022 MWO complete signoff)
- Parts/spares inventory link to 05-warehouse is `warehouse_id` soft reference only; no LP/FEFO per D-MNT-6
- Safety LOTO e-sign mandatory + two-person policy enforced server-side (T-014 + T-025)
- Predictive ML out-of-scope for P1 (D-MNT-16, OQ-MNT-05 P3)
- BRCGS 7y retention via GENERATED `retention_until` columns (T-006 calibration_records / sanitation_checklists / maintenance_history) — column is GENERATED ALWAYS AS STORED, cannot be mutated
- 21 CFR Part 11 SHA-256 immutability on certs (T-015 — server-side compute, single-write enforcement)
- ATP RLU threshold config-driven via `maintenance_alert_thresholds` L2 (T-013 seed)

## Validation performed

- All 30 task JSON files validated with `python3 -c "import json; json.load(open(f))"` — all pass.
- Each task title matches `T-XXX — <goal> (<PRD-anchor>)` exemplar shape.
- Each task carries full `pipeline_inputs` envelope per exemplars (01-npd T-001/T-052, 02-settings T-001/T-041): prd_refs, category, subcategory, task_type, parent_feature, description, details, scope_files, out_of_scope, dependencies, parallel_safe_with, acceptance_criteria, test_strategy, risk_red_lines, skills, checkpoint_policy (RED→GREEN→REVIEW→CLOSEOUT), routing_hints.
- 10 UI tasks (T-018..T-027) carry `prototype_match: true`, `prototype_index_entry`, and `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.
- All PRD §X.Y references verified against actual PRD headings.
- All prototype `file:lines` references verified against `_meta/prototype-labels/prototype-index-maintenance.json`.
- `manifest.json` lists all 30 task refs + cross_module_dependencies + wave1_foundation_primitives_used.
- `coverage.md` provides per-PRD-§ row matrix + sub-module map + cross-cutting closures + P2 deferral list.

## Files written

- `_meta/atomic-tasks/13-maintenance/manifest.json`
- `_meta/atomic-tasks/13-maintenance/coverage.md`
- `_meta/atomic-tasks/13-maintenance/BOOTSTRAP-REPORT-2026-05-14.md`
- `_meta/atomic-tasks/13-maintenance/tasks/T-001.json` … `T-030.json` (30 files)

## Known follow-ups (deferred to later waves or other modules)

- 09-quality must add the live FK `lab_results.equipment_id → calibration_instruments.id` (D-MNT-10) — currently only documented as SQL comment in T-006.
- 08-production `allergen_changeover_gate_v1` consumer of the `sanitation.allergen_change.completed` event (D-MNT-14) — 08-production task.
- 08-production `downtime_events` producer must emit canonical `downtime.created` outbox payload; T-017 currently uses minimal local Zod schema with TODO.
- 12-reporting `dashboards_catalog` table must exist for T-029 seed to run.
- 15-OEE `oee_shift_metrics` MTBF/MTTR materialized view producer is a 15-OEE task; maintenance reads only.
- 14-multi-site `sites` + `site_user_access` tables: maintenance migrations include `site_id` REC-L1 day-1 columns but RLS policy joining `site_user_access` requires that table to exist (Foundation/14-multi-site dependency).
- Calibration spine and sanitation allergen-change spine are deferred to a follow-up T-030.b if budget allows (T-030 covers MWO spine only).
