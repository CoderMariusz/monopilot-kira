# 15-OEE Atomic Tasks Bootstrap Report — 2026-05-14

## Summary

- **Module**: `15-oee`
- **PRD**: `docs/prd/15-OEE-PRD.md` v3.2.1 (1,351 lines, 19 top-level sections, amendments OEE-PRD-AMEND-01..05)
- **Audit input**: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` — Auditor A priority slices OEE-001..008
- **Output**: 25 atomic tasks `T-001.json`..`T-025.json` + `manifest.json` + `coverage.md` + `_validate.py`
- **Validator**: `PASS: 25 task files validated, coverage.md clean` (01-NPD validator copied + pattern matched)

## Task numbering range

`T-001` → `T-025` (25 tasks total).

## Sub-module breakdown

| Sub-module | Task range | Count | Scope |
|---|---|---|---|
| **15-OEE-a** | T-001..T-005 | 5 | Permissions enum + read-only consumer surface + reference tables (shift_configs, oee_alert_thresholds, shift_patterns, org_non_production_days) + Nakajima Big Loss taxonomy + role-permission seed |
| **15-OEE-b** | T-006..T-009 | 4 | Materialized views (oee_shift_metrics, oee_daily_summary) + `shift_aggregator_v1` DSL rule + apps/worker 15-min refresh job |
| **15-OEE-c** | T-010..T-013 | 4 | oee_outbox_events + 5-event publisher dispatcher + API endpoints (line trend, heatmap, summary + export) |
| **15-OEE-d** | T-014..T-019 | 6 | P1 UI dashboards: OEE-001 line trend, OEE-002 heatmap, OEE-003 summary + 3 tabs + A/P/Q drilldowns + P1 modal suite |
| **15-OEE-e** | T-020..T-022 | 3 | Admin UIs: OEE-ADM-001 settings + OEE-ADM-002 shift-configs viewer + OEE-ADM-003 shift patterns + non-production calendar |
| **15-OEE-f** | T-023..T-025 | 3 | P2 stubs scaffold + cross-module integration test + Playwright E2E |

## Auditor A 8 priority slices — all covered

| Slice | Task(s) |
|---|---|
| OEE-001 | T-002 |
| OEE-002 | T-006, T-007 |
| OEE-003 | T-008 (P1 active), T-023 (P2 stubs) |
| OEE-004 | T-014, T-015, T-016 (+ supporting T-018, T-019) |
| OEE-005 | T-018 (P1 interim Pareto home per §15.5), T-023 (`/oee/pareto` P2 placeholder) |
| OEE-006 | T-017 |
| OEE-007 | T-020, T-021, T-022 |
| OEE-008 | T-001 (p0-blocker) |

## P0 blockers

- **T-001** — `oee.*.*` permission enum (13 strings); priority `90`, labels include `p0-blocker`. Gates Server Action RBAC across T-011..T-022.

## Cross-module dependencies declared (manifest.json:cross_module_dependencies)

- **00-foundation**: app.current_org_id (T-125), outbox+worker (T-111/T-112), observability (T-116/T-117/T-118), rate-limit (T-121), CI/CD (T-122), Playwright (T-123). e-sign (T-124) and GDPR (T-113/T-114) noted as deferred/unwired in P1.
- **02-settings**: rule_definitions (`shift_aggregator_v1` + P2 stubs), reference_tables_registry (shift_configs/oee_alert_thresholds/big_loss_categories surfaced read-only), feature_flags, role→permission mapping.
- **08-production**: PRIMARY producer of `oee_snapshots`; consumer reads of `downtime_events`, `changeover_events`, `production_lines`, `work_orders`.
- **09-quality**: P1 Alert cross-link to `/quality/holds` from OEE-001c (feature-flag gated); P2 consumer of `reject_kg/reject_units`.
- **12-reporting**: `report_access_gate_v1` reused (V-OEE-ACCESS-2), `report_exports` audit rows source='15-oee', `enqueueExportJob` reused by OEE-M-002, outbox cache-invalidate consumer.
- **13-maintenance**: D-MNT-3 MTBF/MTTR feed via `oee.shift.aggregated` outbox event; `oee_shift_metrics` mttr_min/mtbf_min stubs; OEE-P2-B Equipment Health page reads 13-MAINTENANCE equipment_health when flag-on; P2 `oee.maintenance.triggered` → auto-MWO.
- **14-multi-site**: REC-L1 `site_id` day-1 on every OEE table per §6.3; RLS site filter via `site_user_access` (V-OEE-ACCESS-4).
- **Reverse dep — 12-reporting**: dashboards consume `oee_shift_metrics`/`oee_daily_summary` MVs; cache invalidation driven by OEE outbox events.

## Non-negotiables — compliance checklist

- All PRD §X.Y refs are real (verified against PRD heading list § grep).
- Prototype line ranges sourced from `_meta/prototype-labels/prototype-index-oee.json` (verbatim `file` + `lines` fields) for every UI task.
- OEE red lines (canonical formula, producer/consumer split per D-OEE-1, downtime classification, ideal-cycle baseline, rolling compute on apps/worker, append-only rollups, what-if deferred, shift calendar in 02-SETTINGS but writes via OEE-ADM-003) encoded across T-002/T-005/T-006/T-007/T-008/T-009/T-018/T-020/T-022 prompts + coverage.md Notes section.
- RLS via `app.current_org_id()` function (Wave1 T-125) on every RLS-bearing table; explicit AC asserts policy text contains the function and no `current_setting()` GUC reads (T-002, T-003, T-004, T-006, T-007, T-010, T-023).
- Compute jobs (T-008 aggregator, T-009 daily refresh) registered with apps/worker per Wave1 T-111; event bus via outbox per Wave1 T-111+T-112; observability traces (T-117) + structured logs (T-116) + metrics (T-118) on every compute path.
- UI tasks (T-014..T-022) all carry `prototype_match: true` + `ui_evidence_policy` + a parity AC with literal prototype path + `:NN-NN` line-range pattern (validator-enforced).

## Files written

```
_meta/atomic-tasks/15-oee/
├── manifest.json                       (task_count=25, sub_modules + cross_module_dependencies declared)
├── coverage.md                         (coverage matrix + Auditor A slice mapping + foundation primitives audit)
├── _validate.py                        (01-NPD validator copy — PASS 25/25)
├── BOOTSTRAP-REPORT-2026-05-14.md      (this file)
└── tasks/
    ├── T-001.json  permission enum (p0-blocker)
    ├── T-002.json  oee_snapshots site_id extension
    ├── T-003.json  shift_configs + oee_alert_thresholds
    ├── T-004.json  shift_patterns + org_non_production_days
    ├── T-005.json  big_loss_categories + role-permission seed
    ├── T-006.json  oee_shift_metrics MV
    ├── T-007.json  oee_daily_summary MV
    ├── T-008.json  shift_aggregator_v1 DSL rule + worker handler
    ├── T-009.json  apps/worker 15-min MV refresh
    ├── T-010.json  oee_outbox_events + 5-event publisher
    ├── T-011.json  /api/oee/line/[id]/trend loader
    ├── T-012.json  /api/oee/heatmap loader + cell-drill
    ├── T-013.json  /api/oee/summary + export action
    ├── T-014.json  OEE-001 Per-line 24h Trend page
    ├── T-015.json  OEE-002 Per-shift Heatmap page + cell_drill_modal
    ├── T-016.json  OEE-003 Per-day Summary page + 3 tabs host
    ├── T-017.json  A/P/Q drilldown <OeeFactorDrillPage> + 3 RSC pages
    ├── T-018.json  Six Big Losses + Changeover tab components
    ├── T-019.json  P1 modal suite (M-001/002/006/008/009/012)
    ├── T-020.json  OEE-ADM-001 settings + admin modals (M-003/004/005)
    ├── T-021.json  OEE-ADM-002 shift_configs viewer
    ├── T-022.json  OEE-ADM-003 shift patterns + non-production calendar
    ├── T-023.json  P2 stubs (tables + rules active=FALSE + placeholders)
    ├── T-024.json  Integration test shift_aggregator→MV→outbox→consumers
    └── T-025.json  Playwright E2E + seed fixtures
```

## Validator output

```
$ python3 _meta/atomic-tasks/15-oee/_validate.py
PASS: 25 task files validated, coverage.md clean
```

## Caveats

- Reference tables `shift_configs`/`oee_alert_thresholds` are 15-OEE-owned writes (T-021/T-022) but surface as read-only viewer rows in 02-SETTINGS reference_tables_registry per §15.3 OEE-ADM-003 + amendment OEE-PRD-AMEND-01 default. Coordination with 02-SETTINGS team needed if they choose to relocate the canonical owner.
- T-002 ALTER on `oee_snapshots` requires the table to exist (08-PRODUCTION migration must land first). Task prompt fails fast with a clear error if missing.
- Compare Weeks (OEE-M-010) and Acknowledge Anomaly (OEE-M-011) modals are intentionally deferred (P1.5 / P2). P2 placeholder shells ship in T-023.
- `pg_cron` lines in PRD §9.5 are illustrative; production uses Wave1 T-111 worker — T-009 documents this explicitly.
- Wave1 e-sign primitive (T-124) and GDPR primitives (T-113/T-114) listed in manifest as not-actively-used by P1 OEE; reserved for future P2 anomaly workflows + operator attribution consumer respectively.
