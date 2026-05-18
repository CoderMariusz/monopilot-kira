---
name: MON-domain-oee
description: "Use when implementing 15-oee tasks: OEE snapshots (READ-ONLY — 08-production owns producer per D-OEE-1), MVs, DSL rule definitions, dashboards + drilldowns + modals, integration with 09-QA reject_kg (P2), 13-MNT MTBF/MTTR feed, 14-MS site_id REC-L1 day-1."
version: 1.0.0
model: opus
canonical_spec: _meta/atomic-tasks/15-oee/BOOTSTRAP-REPORT-2026-05-14.md
---

# MON Domain — 15-OEE (Overall Equipment Effectiveness — MVs, DSL, dashboards, drilldowns)

**Read FIRST:** [[MON-project-overview]] (repo map, tech stack, glossary). Then this skill. Then the per-area MON-* skill ([[MON-t1-schema]], [[MON-t2-api]], [[MON-t3-ui]], [[MON-t4-test]]) for the specific surface you are implementing.

15-OEE is the **analytics + drilldown module** for Overall Equipment Effectiveness (OEE = Availability × Performance × Quality). It builds materialized views on top of `oee_snapshots`, exposes drilldown/heatmap/trend dashboards, owns shift-pattern + admin UIs, and emits cache-invalidation/MTBF-MTTR events to downstream modules (12-reporting, 13-maintenance). PRD: `docs/prd/15-OEE-PRD.md` v3.2.1. Bootstrap: `_meta/atomic-tasks/15-oee/BOOTSTRAP-REPORT-2026-05-14.md` (25 tasks T-001..T-025).

## CRITICAL ownership rule

This is a **user-locked decision** (D-OEE-1, 2026-05-14). Violating it = immediate revert.

- **`oee_snapshots` PRIMARY producer = 08-production.** 08-production owns the table, columns, formula (`oee_pct GENERATED ALWAYS AS (availability_pct * performance_pct * quality_pct / 10000) STORED`), and per-minute write path. See [[MON-domain-production]].
- **15-OEE is a READ-ONLY consumer of `oee_snapshots`.** 15-OEE reads rows to build MVs (`oee_shift_metrics`, `oee_daily_summary`), drives drilldowns, and surfaces UIs. 15-OEE **NEVER writes to `oee_snapshots`**.
- **Risk red line MANDATORY** on every 15-OEE task touching the table: prompts in T-002/T-006/T-007/T-008/T-018 already encode this; new tasks must do the same.
- **Rolling compute on `apps/worker` only** (T-008 aggregator, T-009 MV refresh). No synchronous OEE compute in the request path.
- **Ideal-cycle baseline** lives on `oee_snapshots.ideal_cycle_time_sec` (08-production-owned, P1) and 03-technical per-item reference (P2 cross-module). 15-OEE only reads these values.

## Sub-modules

Source: `_meta/atomic-tasks/15-oee/coverage.md`, 25 tasks total.

| Sub-module | Scope | Tasks |
|---|---|---|
| **15-OEE-a** | Permission enum (`oee.*.*` 13 strings, p0-blocker T-001) + `oee_snapshots` REC-L1 `site_id` extension + reference tables (`shift_configs`, `oee_alert_thresholds`, `shift_patterns`, `org_non_production_days`) + Nakajima Big Loss seed + role→permission seed | T-001..T-005 |
| **15-OEE-b** | Materialized views (`oee_shift_metrics`, `oee_daily_summary` 90-day rolling) + `shift_aggregator_v1` DSL rule + apps/worker 15-min CONCURRENTLY refresh job | T-006..T-009 |
| **15-OEE-c** | `oee_outbox_events` table + 5-event publisher dispatcher + API loaders (`/api/oee/line/[id]/trend`, `/api/oee/heatmap`, `/api/oee/summary` + export) | T-010..T-013 |
| **15-OEE-d** | P1 UI dashboards: OEE-001 Per-line 24h Trend, OEE-002 Heatmap + cell-drill, OEE-003 Summary + 3 tabs + A/P/Q drilldowns + P1 modal suite (OEE-M-001/002/006/008/009/012) | T-014..T-019 |
| **15-OEE-e** | Admin UIs: OEE-ADM-001 settings + line override + big-loss mapping, OEE-ADM-002 shift_configs viewer, OEE-ADM-003 shift patterns + non-production calendar | T-020..T-022 |
| **15-OEE-f** | P2 stubs (`oee_anomalies`, `oee_ewma_state`, `oee_maintenance_triggers` + 2 rules `active=FALSE`) + cross-module integration test + Playwright E2E | T-023..T-025 |

## Key concepts

- **OEE = Availability × Performance × Quality.** Canonical formula enforced via `oee_pct GENERATED` STORED column on `oee_snapshots` (08-production-owned). 15-OEE never writes to this column.
- **`oee_snapshots`** — per-minute or near-realtime rows aggregated per **shift × machine × org × site** (REC-L1 site-aware day-1). Includes `availability_pct`, `performance_pct`, `quality_pct`, `oee_pct`, `ideal_cycle_time_sec`, and 08-production downtime/throughput context.
- **Materialized views (MVs):** `oee_shift_metrics` (per shift × machine), `oee_daily_summary` (90-day rolling per day × machine). Refreshed CONCURRENTLY every 15 min by apps/worker (T-009). Surface `mttr_min`/`mtbf_min` stub columns for D-MNT-3 13-maintenance feed.
- **DSL rule definitions:** declarative rule engine for downtime classification, reject categorization, performance baseline. Stored in 02-settings `rule_definitions` registry. Engine: `packages/rule-engine/`. 15-OEE-owned rules: `shift_aggregator_v1` (P1 active, T-008), `oee_anomaly_detector_v1` + `oee_maintenance_trigger_v1` (P2, `active=FALSE` stubs T-023).
- **Big Loss taxonomy (Nakajima).** Stored in `big_loss_categories` (T-005 seed). `impact_dimension` column routes losses to A / P / Q drilldowns. Editable via OEE-M-005 admin modal (T-020).
- **Drilldowns:** shared `<OeeFactorDrillPage>` RSC component (T-017) serves Availability / Performance / Quality drill pages. Pareto / Six Big Losses interim home is the OEE-003 T2/T3 tab pair (T-018) — P2 dedicated `/oee/pareto` deferred.
- **Append-only rollups.** Historical aggregates flow via MV refresh; no in-place mutation. What-if / ad-hoc queries deferred to P2.

## Outbox events (15-OEE producer)

Per Foundation R1 contract — every event carries `event_version='v1'` + `idempotency_key` UUID v7. Emitted via T-010 publisher dispatcher (5 events total).

| Event | Consumer | Notes |
|---|---|---|
| `oee.snapshot.refreshed` | 12-reporting | MV-refresh cache-invalidate. Fires on every successful T-009 refresh. |
| `oee.dsl_rule.updated` | audit + 02-settings rules registry | Versioned rule promotion / activation flip. |
| `oee.shift.aggregated` | 13-maintenance (D-MNT-3 MTBF/MTTR feed), 12-reporting | Emitted by `shift_aggregator_v1` (T-008) on shift close. |
| `oee.alert.threshold_breached` | 12-reporting, in-app notifications | Alert thresholds defined in `oee_alert_thresholds`. |
| `oee.anomaly.detected` | 13-maintenance (P2 auto-MWO trigger) | P2 stub; emits only when `oee.anomaly_detection_enabled` flag on. |

## Consumed events

| Event | Source | Effect |
|---|---|---|
| `production.wo.completed` (`wo.*.*`) | 08-production | Triggers snapshot refresh window (catch-up MV refresh). |
| `production.downtime.recorded` | 08-production | Classified via `shift_aggregator_v1` DSL → routed by `impact_dimension` to A/P/Q drilldown. |
| `quality.ncr.opened` (`qa.*.*`) | 09-quality | P2 cross-link — feeds `reject_kg`/`reject_units` for Quality factor. **Flag-gated** (`oee.quality_ncr_link_enabled`). |
| `maintenance.mwo.completed` (`mnt.*.*`) | 13-maintenance | MTBF/MTTR feed (D-MNT-3). Updates stub columns on `oee_shift_metrics`. |

## DSL rule pattern

- **Storage:** `rule_definitions` table owned by 02-settings registry (consumer relationship — 15-OEE registers rows, never owns the table).
- **Engine flow:** input event → match predicate → classify (e.g., downtime → big-loss category) → output (column write to MV / outbox emit).
- **Versioning:** each rule revision is **immutable**. New revision = new row, supersede via `active=TRUE` flag flip. Production rule activation requires CFR-21 e-sign (foundation T-124) for any rule that touches OEE numbers (`shift_aggregator_v1`, downtime classifiers).
- **P1 active:** `shift_aggregator_v1` (T-008). **P2 stubs (`active=FALSE`):** `oee_anomaly_detector_v1`, `oee_maintenance_trigger_v1` (T-023) — wire-ready but disabled until `oee.anomaly_detection_enabled` flag flips.

## Multi-site (REC-L1 day-1)

Per 14-MS T-030 + D-OEE-1 site-aware decision — every OEE table (and the consumer-side `oee_snapshots` `site_id` extension in T-002) gets `site_id` **day-1**, no backfill task.

- All RLS policies: `org_id = app.current_org_id() AND site_id = ANY(app.current_site_ids())` per [[MON-multi-tenant-site]] HOFs.
- **Composite indexes:** `(org_id, site_id, machine_id, shift_id)` on `oee_shift_metrics`, `(org_id, site_id, day, machine_id)` on `oee_daily_summary`, equivalent shape on every reference + admin table.
- Site filter is enforced via `site_user_access` (V-OEE-ACCESS-4). Users without site grant get zero rows — no error, no leak.

## Cross-module deps

**Consumers (15-OEE reads from):**
- **08-production** — primary producer of `oee_snapshots` + WO events + downtime events + waste (`wo_outputs`, `wo_waste_log`, `downtime_events`, `changeover_events`, `production_lines`, `work_orders`). See [[MON-domain-production]].
- **09-quality** — `reject_kg` / `reject_units` P2 cross-link (flag-gated). P1 alert cross-link to `/quality/holds` from OEE-001c. See [[MON-domain-quality]].
- **13-maintenance** — MTBF/MTTR feed reverse direction (consumes 13-MNT `equipment_health` for OEE-P2-B Equipment Health page when flag on). See [[MON-domain-maintenance]].
- **02-settings** — `rule_definitions` registry (`shift_aggregator_v1` + P2 stubs), `reference_tables_registry` (shift_configs/oee_alert_thresholds/big_loss_categories surfaced read-only), `feature_flags`, role→permission mapping.
- **12-reporting** — `report_access_gate_v1` reused (V-OEE-ACCESS-2), `report_exports` audit rows (`source='15-oee'`), `enqueueExportJob` reused by OEE-M-002.
- **14-multi-site** — `sites` + `site_user_access` for RLS.

**Producers (15-OEE emits to):**
- **12-reporting** — MV consumer + reverse-dep: dashboards consume `oee_shift_metrics` / `oee_daily_summary` directly; cache invalidation driven by `oee.snapshot.refreshed` outbox.
- **13-maintenance** — `oee.shift.aggregated` (D-MNT-3), `oee.anomaly.detected` (P2 auto-MWO).
- **Audit** — `oee.dsl_rule.updated` for rule promotion.

## Forbidden patterns

- **WRITE to `oee_snapshots` from 15-OEE** — VIOLATES D-OEE-1. 08-production is the canonical producer.
- **Bypass DSL rule engine** on downtime classification — every classification must route through `shift_aggregator_v1` (or its successor revision). Inline if/switch on `category_code` in a Server Action = revert.
- **Skip `site_id`** on any OEE table — REC-L1 day-1 lock (14-MS T-030). No ALTER-later patches.
- **Synchronous OEE compute** in a request handler — all rolling math runs on `apps/worker` (T-008/T-009).
- **Bypass `report_access_gate_v1`** on export endpoints — V-OEE-ACCESS-2 invariant.
- **Mutate historical rollups in place** — append-only via MV refresh.
- **Hardcode shift calendar / non-production days** — must live in `shift_patterns` + `org_non_production_days` (T-022 OEE-ADM-003).
- **Use raw `current_setting('app.tenant_id')` in RLS** — must use `app.current_org_id()` reader function (Wave1 T-125).

## PRD-to-foundation remappings (per bootstrap report)

- **PRD `tenant_id` → `org_id`** per Wave0 v4.3 lock (`_meta/decisions/2026-05-03-wave0-readiness-answers.md` §1). Applies across all OEE DDL. See [[MON-multi-tenant-site]].
- **PRD `pg_cron`** lines in §9.5 are illustrative; production scheduling uses **Wave1 worker T-111** primitive (T-009 wires the 15-min `REFRESH MATERIALIZED VIEW CONCURRENTLY` job). See [[MON-foundation-primitives]] §worker.
- **`app.current_org_id()` validator-enforced** — every RLS-bearing table (T-002/T-003/T-004/T-006/T-007/T-010/T-023) has explicit AC asserting policy text contains the function and forbids raw `current_setting()` GUC reads.
- **UI parity:** literal `:NN-NN` line-range pattern enforced — every T-014..T-022 UI task carries `prototype_match: true` + `ui_evidence_policy` + literal `jsx:NN-NN` line-range citation sourced from `_meta/prototype-labels/prototype-index-oee.json`. See [[MON-t3-ui]].
- **e-sign (T-124)** noted as deferred/unwired in P1; reserved for P2 anomaly acknowledgment workflows. **GDPR (T-113/T-114)** noted as deferred — 15-OEE itself stores no PII per PRD §14.4; operator attribution surfaces via 12-reporting `operator_kpis_monthly` consumer.

## Cross-links

- [[MON-project-overview]] — repo map, tech stack, modules glossary
- [[MON-t1-schema]] — Drizzle schema + migration authoring (MVs, REC-L1 site_id, RLS)
- [[MON-t2-api]] — Server Actions + API loaders (`/api/oee/*`), rate-limit, `report_access_gate`
- [[MON-foundation-primitives]] — outbox, worker, rate-limit, e-sign, GDPR, observability (T-111/T-112/T-116/T-117/T-118/T-121/T-122/T-123)
- [[MON-multi-tenant-site]] — `org_id`, `site_id`, `app.current_org_id()`, `withOrgContext`, `withSiteContext`, site-aware RLS
- [[MON-domain-production]] — `oee_snapshots` PRODUCER (CRITICAL — 15-OEE consumes read-only)
- [[MON-domain-quality]] — `reject_kg` P2 cross-link (flag-gated), `/quality/holds` P1 alert link
- [[MON-domain-maintenance]] — MTBF/MTTR feed (D-MNT-3), Equipment Health page (P2 reverse-consume)
- [[MON-t3-ui]] — prototype parity literal `jsx:NN-NN` line-range pattern
- [[MON-t4-test]] — integration + Playwright wiring (T-024 / T-025)
