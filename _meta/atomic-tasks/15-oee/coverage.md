# 15-OEE Atomic Task Coverage

PRD: `docs/prd/15-OEE-PRD.md` (v3.2.1 + 2026-04-30 PRD↔UX reconciliation pass + amendments OEE-PRD-AMEND-01..05)
Audit input: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A — OEE-001..008 priority slices)
Generated: 2026-05-14 — bootstrap batch (T-001..T-025)

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **15-OEE-a** | Permissions enum + read-only consumer surface + reference tables + taxonomy + role-permission seed | T-001..T-005 |
| **15-OEE-b** | Materialized views + DSL shift aggregator + worker refresh job | T-006..T-009 |
| **15-OEE-c** | API/Server endpoints + outbox publisher dispatcher | T-010..T-013 |
| **15-OEE-d** | P1 UI dashboards (OEE-001/002/003 + tabs + drilldowns + P1 modal suite) | T-014..T-019 |
| **15-OEE-e** | Admin UIs (OEE-ADM-001/002/003) | T-020..T-022 |
| **15-OEE-f** | P2 stubs scaffold + cross-module integration test + Playwright E2E | T-023..T-025 |

## Coverage by PRD section

| PRD ref | Requirement | Task file | Sub-module | Type | Status |
|---|---|---|---|---|---|
| §3, §15.3 | oee.*.* permission enum lock (Auditor A OEE-008) | tasks/T-001.json | 15-OEE-a | T1-schema | covered (p0-blocker) |
| §9.1, §6.3, §14.5 | oee_snapshots site_id REC-L1 extension + read-only consumer index (Auditor A OEE-001) | tasks/T-002.json | 15-OEE-a | T1-schema | covered |
| §9.4, §11 V-OEE-SHIFT-1..4 | shift_configs + oee_alert_thresholds reference tables + 02-SET §8.1 registry | tasks/T-003.json | 15-OEE-a | T1-schema | covered |
| §15.3 OEE-ADM-003, §9.4 | shift_patterns + org_non_production_days backing tables (amendment OEE-PRD-AMEND-01 default) | tasks/T-004.json | 15-OEE-a | T1-schema | covered |
| §3, §13.3, §15.4 OEE-M-005 | big_loss_categories Nakajima seed + role→oee.*.* permission seed | tasks/T-005.json | 15-OEE-a | T5-seed | covered |
| §9.2, §11 V-OEE-AGG, D-OEE-1 | oee_shift_metrics MV (Auditor A OEE-002 first MV) | tasks/T-006.json | 15-OEE-b | T1-schema | covered |
| §9.2, §9.5 | oee_daily_summary MV with 90-day rolling window (Auditor A OEE-002 second MV) | tasks/T-007.json | 15-OEE-b | T1-schema | covered |
| §7.1, §8.4, §11 V-OEE-AGG, D-OEE-2 | shift_aggregator_v1 registry + worker handler (Auditor A OEE-003 first rule, P1 active) | tasks/T-008.json | 15-OEE-b | T2-api | covered |
| §9.5, §11 V-OEE-AGG-5 | apps/worker 15-min CONCURRENTLY refresh job + observability | tasks/T-009.json | 15-OEE-b | T2-api | covered |
| §12.2, §12.3, R1 | oee_outbox_events table + 5-event publisher dispatcher (to 12-REPORTING + 13-MAINTENANCE) | tasks/T-010.json | 15-OEE-c | T2-api | covered |
| §10.1, §11 V-OEE-ACCESS, §12.1 | /api/oee/line/[id]/trend Server loader + rate-limit + report_access_gate | tasks/T-011.json | 15-OEE-c | T2-api | covered |
| §10.2, §11, §12.1 | /api/oee/heatmap Server loader + cell-drill action + p95 < 2s perf gate | tasks/T-012.json | 15-OEE-c | T2-api | covered |
| §10.3, §15.4 OEE-M-002, §11 | /api/oee/summary + export action (reuses 12-REPORTING engine) | tasks/T-013.json | 15-OEE-c | T2-api | covered |
| §10.1, §15.1, §15.7 | OEE-001 Per-line 24h Trend page + ArcGauge + TrendChart (Auditor A OEE-004 first) | tasks/T-014.json | 15-OEE-d | T3-ui | covered |
| §10.2, §15.1, §15.4 OEE-M-007 | OEE-002 Per-shift Heatmap page + cell_drill_modal (Auditor A OEE-004 second) | tasks/T-015.json | 15-OEE-d | T3-ui | covered |
| §10.3, §15.1, §15.5 | OEE-003 Per-day Summary page + 3 tabs host (Auditor A OEE-004 third) | tasks/T-016.json | 15-OEE-d | T3-ui | covered |
| §15.3 OEE-001a/b/c, §15.7 | A/P/Q drilldown shared `<OeeFactorDrillPage>` + 3 RSC pages (Auditor A OEE-006) | tasks/T-017.json | 15-OEE-d | T3-ui | covered |
| §15.5, §13.3, §15.4 OEE-M-005 | OEE-003.T2 Six Big Losses + OEE-003.T3 Changeover tab components (Auditor A OEE-005 — P1 interim Pareto) | tasks/T-018.json | 15-OEE-d | T3-ui | covered |
| §15.4, §11 V-OEE-DATA | P1 modal suite (OEE-M-001/002/006/008/009/012) + annotateDowntime / escalateDowntimeEdit Server Actions | tasks/T-019.json | 15-OEE-d | T3-ui | covered |
| §15.3 OEE-ADM-001, §15.4 OEE-M-003/004/005, §15.7 | OEE-ADM-001 settings + line override + delete override + big-loss mapping modals (Auditor A OEE-007 first) | tasks/T-020.json | 15-OEE-e | T3-ui | covered |
| §15.3 OEE-ADM-002, §15.7 | OEE-ADM-002 read-only shift_configs viewer + DSL rule status (Auditor A OEE-007 second) | tasks/T-021.json | 15-OEE-e | T3-ui | covered |
| §15.3 OEE-ADM-003, §11 V-OEE-SHIFT-1..4, amendment OEE-PRD-AMEND-01 | OEE-ADM-003 shift patterns + non-production calendar editor + atomic Server Action save + outbox emission (Auditor A OEE-007 third) | tasks/T-022.json | 15-OEE-e | T3-ui | covered |
| §7.2, §7.3, §9.3, §15.2, §15.6 | P2 stubs: oee_anomalies + oee_ewma_state + oee_maintenance_triggers + 2 rules active=FALSE + 4 placeholder routes (Auditor A OEE-003 P2 stubs) | tasks/T-023.json | 15-OEE-f | T1-schema | covered |
| §8.4, §12.1, §12.2, D-OEE-2 | Cross-module integration test (shift_aggregator → MV → outbox → 12-REPORTING + 13-MAINTENANCE) | tasks/T-024.json | 15-OEE-f | T4-wiring-test | covered |
| §10.1, §10.2, §10.3, §11, §15.1 | Playwright E2E (OEE-001/002/003 + admin RBAC) + seed fixtures | tasks/T-025.json | 15-OEE-f | T4-wiring-test | covered |

## Auditor A slice → task mapping

| Auditor A slice | Task(s) |
|---|---|
| OEE-001 `oee_snapshots` per-minute schema (08-PROD §13 producer contract) | T-002 (site_id extension + read-only consumer surface; producer contract stays in 08-PROD) |
| OEE-002 `oee_daily_summary` + `oee_shift_metrics` materialized views | T-006, T-007 |
| OEE-003 DSL rules registered in 02-SET §7.8 | T-008 (P1 `shift_aggregator_v1` active), T-023 (P2 `oee_anomaly_detector_v1`, `oee_maintenance_trigger_v1` active=FALSE stubs) |
| OEE-004 `oee_daily_summary_page` + `oee_line_trend_page` + `oee_shift_heatmap_page` UI parity | T-014, T-015, T-016 (+ T-019 modal suite, T-018 tab components) |
| OEE-005 Downtime Pareto + six-big-losses dashboard | T-018 (P1 interim home per §15.5) + T-023 (`/oee/pareto` P2 placeholder) |
| OEE-006 Availability/Performance/Quality drilldown pages | T-017 (shared `<OeeFactorDrillPage>` + 3 RSC pages) |
| OEE-007 `oee_settings_page` + `oee_shift_configs_page` + line override modal | T-020, T-021, T-022 |
| OEE-008 Permissions enum delta | T-001 (p0-blocker, priority 90) |

## Cross-module dependencies — declared

See `manifest.json:cross_module_dependencies` for the structured list. Highlights:
- **08-PRODUCTION** owns `oee_snapshots` producer (D-OEE-1); 15-OEE is read-only consumer.
- **13-MAINTENANCE** consumes `oee.shift.aggregated` outbox event for D-MNT-3 MTBF/MTTR feed; `oee_shift_metrics` exposes `mttr_min`/`mtbf_min` stub columns.
- **12-REPORTING** owns `report_access_gate_v1` (reused by V-OEE-ACCESS-2), `report_exports` audit table (15-OEE writes rows source='15-oee'), and `enqueueExportJob` (reused by OEE-M-002).
- **02-SETTINGS** owns rule_definitions registry (`shift_aggregator_v1` + P2 stubs) + reference_tables_registry (shift_configs, oee_alert_thresholds, big_loss_categories surfaced read-only) + feature_flags.
- **14-MULTI-SITE** owns `sites` + `site_user_access`; 15-OEE adds REC-L1 `site_id` day-1 on every table per §6.3.
- **Reverse dep**: 12-REPORTING dashboards consume `oee_shift_metrics` / `oee_daily_summary` MVs as data source; cache invalidation driven by 15-OEE outbox events.

## P0 blockers

| Task | Why p0 |
|---|---|
| T-001 — `oee.*.*` permission enum | Gates RBAC strings imported by every Server Action in T-011..T-022; closes Auditor A OEE-008; priority=90, labels include `p0-blocker`. |

## Foundation primitives used (Wave 1)

Per the prompt non-negotiables, all 15-OEE tasks consume only Wave 1 foundation primitives:
- `app.current_org_id()` / `withOrgContext` (T-125) — every RLS-bearing table + every API loader/Server Action.
- Outbox+worker (T-111/T-112) — T-008 aggregator handler, T-009 MV refresh job, T-010 dispatcher.
- Observability (T-116 logger / T-117 tracer / T-118 metrics) — T-008, T-009, T-011, T-012, T-013.
- Rate-limit (T-121) — T-011, T-012, T-013.
- CI/CD (T-122) — T-025 e2e:ci job hook.
- Playwright (T-123) — T-025 specs.
- e-sign (T-124) — not used by P1 OEE; reserved for P2 anomaly acknowledgment workflows (T-023 scaffold leaves the hook unwired).
- GDPR (T-113/T-114) — only operator attribution surfaces (12-REPORTING `operator_kpis_monthly` consumer); 15-OEE itself stores no PII per §14.4.

## Notes

- Compare Weeks modal OEE-M-010 (P1.5, BL-OEE-05, amendment OEE-PRD-AMEND-03) is intentionally deferred; not covered by this bootstrap batch.
- Acknowledge Anomaly modal OEE-M-011 (P2) ships as a placeholder under T-023; full activation belongs to a future P2 build wave that flips `oee.anomaly_detection_enabled`.
- `tenant_id` in PRD DDL is consistently mapped to `org_id` per Wave0 v4.3 lock (`_meta/decisions/2026-05-03-wave0-readiness-answers.md` §1).
- `pg_cron` lines in PRD §9.5 are illustrative; production scheduling uses Wave1 T-111 worker primitive per R1 contract (T-009 wires this).
- OEE = Availability × Performance × Quality with canonical formula enforced via `oee_pct GENERATED ALWAYS AS (availability_pct * performance_pct * quality_pct / 10000) STORED` on `oee_snapshots` (08-PRODUCTION-owned column); 15-OEE never writes to this column.
- Rolling computation is on `apps/worker` only (T-008/T-009); no synchronous OEE compute in request path (D-OEE-1).
- Historical rollups are append-only via MV refresh; ad-hoc what-if queries are out of P1 scope (P2 deferred).
- Downtime classification by reason code (planned vs unplanned) is enforced by Big Loss Mapping (T-005 taxonomy + T-020 OEE-M-005 editor); impact_dimension column on `big_loss_categories` drives A/P/Q routing.
- Ideal-cycle baseline per (machine, item) is stored on 08-PRODUCTION `oee_snapshots.ideal_cycle_time_sec` (P1) and 03-TECHNICAL per-item reference (P2 cross-module); 15-OEE only reads these values.
- Shift calendar lives in 02-SETTINGS (`shift_configs` registry row) but OEE-ADM-003 (T-022) owns writes to `shift_patterns` + `org_non_production_days` per amendment OEE-PRD-AMEND-01 default decision.
- Per Foundation R1 contract: every outbox event has `event_version='v1'` + `idempotency_key` UUID v7; T-010 enforces this in Zod schemas.
