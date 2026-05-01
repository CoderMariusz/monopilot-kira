# 15-OEE PRD — Monopilot MES

**Wersja:** 3.2.1 | **Data:** 2026-04-30 | **Status:** Standardized for multi-industry manufacturing operations pattern + PRD↔UX reconciliation pass (2026-04-30)
**Poprzednia wersja:** 3.2 (2026-04-30, multi-industry standardization), 3.1 (2026-04-21, Stakeholder decisions locked)

---

## 1. Executive Summary

Modul **15-OEE** jest warstwa **analytics & visualization dla Overall Equipment Effectiveness** — standardowej metryki efektywnosci produkcyjnej (A × P × Q, industry world-class 85%, Apex P1 target 70% — ramp-up baseline, configurable via 02-SETTINGS `oee_alert_thresholds.oee_target_pct`). Zakres P1: read per-minute `oee_snapshots` produkowane przez 08-PROD §13 (D7 per-minute aggregation Q4 A decision) + 3 core sub-dashboards (per-line 24h trend, per-shift heatmap, per-day summary rollup), 2 nowe materialized views (`oee_daily_summary` + `oee_shift_metrics`), 2 DSL rules registered w 02-SETTINGS §7.8. Zakres P2: anomaly detection (EWMA), real-time TV dashboard (plant-floor screens), per-site multi-tenant rollup (14-MULTI-SITE), maintenance trigger rule (13-MAINT consumer).

**Pozycja w Module Map (per 00-FOUNDATION §4.2):** 15-OEE jest **primary consumer** 08-PRODUCTION (`oee_snapshots` per-minute table + `downtime_events` + `changeover_events`). **Producer** dla 12-REPORTING (`oee_daily_summary` MV czytana przez Factory Overview + Shift Performance dashboards, zgodne z D-RPT-9 consumer integration), 13-MAINTENANCE (P2 `oee_shift_metrics` MTBF/MTTR consumer + `oee_maintenance_trigger_v1` rule generuje PM work orders jesli availability trends down), 14-MULTI-SITE (P2 per-site OEE rollup — `oee_snapshots.site_id` UUID nullable). **No reverse dependency** z 12-REPORTING (OEE pisze do MV, Reporting czyta).

**Kluczowe wyrozniki v3.0 (baseline, first release):**
- **D-OEE-1 Per-minute aggregation consumer (from 08-PROD D7):** 15-OEE NIE implementuje swojej wlasnej aggregation logic — czyta `oee_snapshots` (BIGSERIAL, per-minute row per line × shift). Zero duplicate aggregation. Single source of truth: 08-PROD cron job (`oee_aggregator` runs co 60s).
- **D-OEE-2 Shift aggregation DSL rule `shift_aggregator_v1` (P1 active):** konfigurowalne shift boundaries (Apex baseline 3 shifts: 00:00-08:00 / 08:00-16:00 / 16:00-00:00 UTC, per tenant L2 variation ADR-030). Rule wraps `oee_snapshots` → `oee_shift_metrics` MV. Registered w 02-SETTINGS §7.8.
- **D-OEE-3 Anomaly detection EWMA P2 (from 08-PROD D15):** `oee_anomaly_detector_v1` DSL rule (P2 stub) — Exponentially Weighted Moving Average na rolling 30-min window, alert gdy current snapshot > baseline_ewma + 2σ. Alpha=0.3 (standard food-mfg tuning). Registered w 02-SETTINGS §7.8 jako P2 stub.
- **D-OEE-4 Real-time TV dashboard P2:** plant-floor screens (1920×1080 TVs), auto-refresh 30s, full-screen mode. P1 MVP ma tylko desktop dashboards (operator laptops). P2 adds TV-specific route z hidden controls, large font, color-blind safe.
- **D-OEE-5 Downtime categorization consumer 02-SET:** 15-OEE czyta `downtime_categories` ref table z 02-SETTINGS §8.1 (admin-configurable, zgodne z 08-PROD D6). **NIE** ML classification P1 (wycofane — wymaga >6 miesiecy training data). P3+ backlog.
- **D-OEE-6 Shift comparison P1 fixed 3 shifts:** Apex baseline (AM/PM/Night). L2 variation per tenant P2 — custom shift configs (2-shift, 4-shift, 24h continuous, etc.) via `shift_configs` reference table w 02-SET §8.1.
- **D-OEE-7 Maintenance trigger rule P2 (13-MAINT consumer):** `oee_maintenance_trigger_v1` — IF availability_pct < threshold dla 3 consecutive days → auto-create PM work order (13-MAINTENANCE consumer). Registered P2 stub w 02-SET §7.8.

**Markers:** [UNIVERSAL] = core MES contract | [APEX-CONFIG] = konkretny fit Apex UK | [EVOLVING] = areas in iteration | [LEGACY-D365] = bridge until D365 retirement.

---

## 2. Objectives & Metrics

### Cel glowny

Dostarczyc operatorom, line supervisors i maintenance technicians natychmiastowy wglad w OEE na linia produkcyjnej (update co 60s), z drill-down w Availability / Performance / Quality components i downtime categorization. Eliminacja Excel-based OEE tracking (Apex reality: daily spreadsheet filled post-shift manual) z real-time feedback enabling operators to react in-shift.

### Metryki sukcesu Phase 1 (MVP)

| Metryka | Cel P1 | Pomiar | Zrodlo |
|---|---|---|---|
| Dashboard load P95 | < 2 s | APM (OEE dashboards) | frontend trace |
| OEE data freshness | < 90 s od actual event | `(now() - max(snapshot_minute))` | `oee_snapshots` |
| Per-minute aggregation job success rate | 99.9% | `oee_aggregator_log.status='completed'` | 08-PROD cron job log |
| Shift rollup MV refresh time | < 10 s | `mv_refresh_log.duration_ms` dla `oee_shift_metrics` | `mv_refresh_log` |
| Dashboard accuracy vs manual calc | 100% | Manual quarterly audit (compare to Excel OEE calc) | QA sign-off |
| Weekly Active Users (OEE dashboards) | > 80% line supervisors, > 40% operators | PostHog | analytics |
| API response P95 | < 400 ms | APM | `/api/oee/*` |
| MV query time (oee_daily_summary) | < 200 ms dla 7-day range | pg_stat_statements | DB |

### Metryki sukcesu Phase 2 (po P1 stabilny)

| Metryka | Cel P2 | Uwagi |
|---|---|---|
| Anomaly detection alert latency | < 60 s od anomaly event | EWMA z 30-min window |
| False positive rate (anomaly) | < 10% | Tuning alpha, sigma threshold |
| TV dashboard uptime | 99.5% | Auto-recovery jeśli browser crash |
| Maintenance trigger accuracy | > 70% triggered PMs confirmed as needed | 13-MAINT follow-up audit |
| Multi-site rollup perf | < 500 ms per-site dashboard load | 14-MULTI-SITE consumer |

---

## 3. Personas & Roles

| Persona | Role w OEE | Typowe workflows | Urzadzenie |
|---|---|---|---|
| **Line Operator** | Shift-level awareness, react to real-time drops | Line dashboard (24h trend), drill-down when OEE dips below target, changeover efficiency | Desktop (station PC) / Tablet / Scanner home screen |
| **Shift Supervisor** | Monitor all lines in shift, compare AM/PM/Night | Shift heatmap, per-line performance comparison, downtime breakdown | Desktop / Tablet |
| **Production Manager** | Daily/weekly OEE review, trend analysis | Per-day summary rollup, 7-day trend chart, best/worst line/shift | Desktop |
| **Maintenance Tech** | Availability trends, MTBF/MTTR analysis | P2 Equipment Health dashboard, auto-triggered PMs (13-MAINT) | Desktop / Mobile (PWA) |
| **Plant Director** | Factory-level OEE KPI, world-class comparison | 15-OEE Factory rollup, year-over-year trends | Desktop / TV dashboard (P2) |
| **Continuous Improvement Engineer** | Pareto analysis of losses, Six Big Losses breakdown | Downtime heatmap, changeover optimization, Lean analysis | Desktop |

**RBAC mapping (extends 02-SETTINGS §14):**
- `oee_viewer` — read all OEE dashboards + export CSV/PDF
- `oee_operator` — oee_viewer + annotate downtime reasons (fill in `reason_notes` from dashboard)
- `oee_supervisor` — oee_operator + override downtime category (with audit)
- `oee_admin` — oee_supervisor + configure anomaly thresholds, shift boundaries (tenant L2 config via 02-SET)

**DSL rule consumption:** 15-OEE rejestruje `shift_aggregator_v1` (P1) i `oee_anomaly_detector_v1` (P2 stub) w 02-SETTINGS §7.8. Konsumuje `oee_maintenance_trigger_v1` (P2 stub, 13-MAINT producer).

---

## 4. Scope

### 4.1 In Scope — Phase 1 (MVP, 3 core dashboards + MV infra)

| # | Obszar | Zakres | Priorytet |
|---|---|---|---|
| 1 | **Per-line 24h OEE Trend Dashboard** | D3.js line chart z A/P/Q components + combined OEE, toggle 1h/6h/24h window, target line overlay (tenant-configurable via `oee_alert_thresholds.oee_target_pct`, Apex P1 baseline: **70%**) | Must |
| 2 | **Per-shift Heatmap Dashboard** | Matrix view: lines (rows) × shifts × days (cols), color scale OEE red-yellow-green, click cell → drill-down | Must |
| 3 | **Per-day OEE Summary Dashboard** | Per-line daily rollup table: OEE%, A%, P%, Q%, best/worst shift, top downtime reason; 7-day trend sparklines | Must |
| 4 | **MV infrastructure: `oee_daily_summary`** | Daily rollup per (tenant, site, line, date) — aggregates `oee_snapshots` | Must |
| 5 | **MV infrastructure: `oee_shift_metrics`** | Per-shift rollup per (tenant, site, line, date, shift_id) — MTBF/MTTR ready (P2 13-MAINT consumer) | Must |
| 6 | **DSL rule `shift_aggregator_v1`** | Configurable shift boundaries, L2 tenant variation, Apex baseline 3-shift 00/08/16 UTC | Must |
| 7 | **Downtime drill-down integration** | Click OEE dip → reveal `downtime_events` rows z category + duration + reason_notes (cross-module navigation to 08-PROD) | Must |
| 8 | **Changeover analysis P1 basic** | Changeover duration per line (consumer `changeover_events` 08-PROD §9.7), per allergen risk level. Target duration sourced from 02-SETTINGS `changeover_target_duration_min` per line (with optional per-FG override). Default null — no breach detection if unset. | Should |
| 9 | **Six Big Losses basic view** | Aggregat per classification admin-configurable per tenant (mapping editor in OEE-ADM-001: `downtime_reason_code` → Big Loss category; default seeded from industry standard). | Should |
| 10 | **Refresh indicator** | "Last aggregation: HH:MM:SS" widget + staleness warning if > 120s | Must |
| 11 | **Export CSV/PDF P1** | Per dashboard, reuse 12-REPORTING export engine (API `/api/reporting/export`) | Must |
| 12 | **RLS multi-tenant** | `tenant_id` + `site_id` (nullable) enforcement via service layer (MVs same constraint as 12-REPORTING) | Must |

### 4.2 In Scope — Phase 2 (deferred)

| # | Obszar | Uwagi |
|---|---|---|
| 1 | **Anomaly detection EWMA** | `oee_anomaly_detector_v1` DSL rule, alert when current snapshot > baseline_ewma + 2σ |
| 2 | **Real-time TV dashboard** | Plant-floor screens, 1920×1080, auto-refresh 30s, full-screen mode, color-blind safe palette |
| 3 | **Streaming aggregation P3** | Kafka/Redpanda stream vs current per-minute batch (defer — current 1-min latency sufficient) |
| 4 | **Multi-site OEE rollup** | 14-MULTI-SITE consumer — per-site dashboards + factory-level aggregate |
| 5 | **Custom shift configs L2** | 2-shift / 4-shift / 24h continuous / custom per tenant (02-SET §8.1 `shift_configs` reference table) |
| 6 | **Maintenance trigger rule** | `oee_maintenance_trigger_v1` — availability < threshold 3 consecutive days → auto-create PM WO (13-MAINT consumer) |
| 7 | **ML classification downtime** | P3+ — ML model classifies uncategorized downtime events (R12 consumer) |
| 8 | **Per-product OEE** | Drill-down OEE per FG/SKU (needs `oee_snapshots.active_wo_id` join products) |
| 9 | **OEE forecasting** | Prophet internal microservice consumer (07-EXT Q3 A) — predict next shift/day OEE |
| 10 | **Pareto chart losses** | Pareto-80/20 analysis top downtime causes, drill-down RCA |
| 11 | **Shift comparison advanced** | AM vs PM best-practice sharing, operator skill gap analysis |
| 12 | **Equipment Health dashboard** | 13-MAINT cross-module: OEE trend + MTBF + last maintenance + upcoming PM |
| 13 | **OEE benchmark vs industry** | External benchmark data (MESA, WEF Lighthouse) — "Your OEE: 78%. Industry average: 65-85%" |
| 14 | **P2 e-sig regulatory** | BRCGS audit export OEE data (non-standard — audit requests usually focus on quality) |

### 4.3 Exclusions (Nigdy w 15-OEE)

- **Custom OEE formula per tenant** — standard A × P × Q enforced (deviations break industry benchmarking). P2 L2 variation allowed tylko dla target threshold (`oee_target_pct`), nie formula.
- **Real-time streaming dashboards (WebSocket push)** — 60s batch sufficient. Kafka/Redpanda wycofane z P1 scope (koszt infra vs benefit).
- **OEE calculation in frontend** — wszystkie kalkulacje backend (Postgres MVs). Frontend tylko render.
- **Cross-tenant OEE comparison** — RLS enforced. Benchmark via external industry data only (P2).
- **Historical OEE back-fill > 90 days** — `oee_snapshots` retention 90 days hot + archive cold (separate data warehouse). Dashboards show max 90-day window live.

---

## 5. Constraints

### Techniczne

- **Source of truth:** `oee_snapshots` (08-PROD §9.9) BIGSERIAL table, populated przez 08-PROD cron job `oee_aggregator` co 60s. 15-OEE NIE writes to `oee_snapshots` — read-only consumer.
- **MV refresh policy:** `oee_daily_summary` co 15 min (hourly drift tolerable dla daily rollup). `oee_shift_metrics` post-shift-end batch (triggered 5min po shift_end_time via pg_cron, ensures all late events captured).
- **RLS na MV:** Same constraint jak 12-REPORTING (Postgres limitation) — service-layer filter `WHERE tenant_id = :tenant AND (site_id = :current_site OR site_id IS NULL)`.
- **D3.js client-side:** Line charts (trend), heatmaps (shift × line × day), combo charts (A/P/Q stacked bar + OEE line).
- **Dashboard refresh:** Client-side setInterval 60s poll `/api/oee/*` endpoints. NOT WebSocket P1.
- **Data retention:** `oee_snapshots` 90 days hot (indexed, queryable). >90 days → archive to cold storage (S3/GCS Glacier tier) via nightly cron. `oee_daily_summary` kept 7 years (BRCGS audit trail consumer).
- **Shift boundary validation:** DSL rule `shift_aggregator_v1` enforces consistent shift_id across `oee_snapshots.shift_id` = `shift_configs.shift_id`. Mismatches logged + operator alert.

### Biznesowe

- 08-PRODUCTION sub-module f (dashboard + OEE aggregation) MUST complete przed 15-OEE impl (`oee_snapshots` table exists + cron job running)
- `downtime_categories` reference table (02-SET §8.1) populated z min 10 Apex categories (People/Process/Plant → 10 sub-cats per 08-PROD D6)
- `shift_configs` reference table w 02-SET §8.1 musi miec minimum 1 shift dla tenant (inaczej `shift_aggregator_v1` fails)
- `target_kpis` reference table (02-SET §8.1) zawiera per-line `oee_target_pct` (Apex P1 default: **70%** ramp-up baseline, world-class threshold: 85%; configurable via `oee_alert_thresholds.oee_target_pct`)
- 12-REPORTING integration (D-RPT-9 consumer): 15-OEE produces `oee_daily_summary` MV PRZED 12-REPORTING sub-module b (OEE Summary dashboard)

### Regulacyjne

- **BRCGS Issue 10 Food Safety:** OEE data NIE jest regulowana direct (quality holds sa). Ale `oee_daily_summary` retention 7 years jeśli operational data stanowi evidence dla audit responses ("availability issue prevented timely recall execution").
- **GDPR:** `oee_snapshots` nie zawiera PII. Operator attribution (P2 leaderboards) via 08-PROD `operator_kpis_monthly` (consumer 12-REPORTING), per-tenant anonymize flag applicable.
- **21 CFR Part 11:** NIE applicable — OEE to operational metric, nie electronic record wymagajacy e-sig.
- **Food-mfg operator KPIs:** consumer 08-PROD D11 `operator_kpis_monthly` (fefo_compliance_pct, consumption_speed). 15-OEE dashboards mogą wskazywać operator performance, ale nie generate formal evaluations.

---

## 6. Decisions D-OEE-1..7

### D-OEE-1. Per-minute aggregation consumer (from 08-PROD D7) [UNIVERSAL]

**Decyzja:** 15-OEE NIE implementuje wlasnej aggregation logic. Consumer `oee_snapshots` table produced by 08-PROD `oee_aggregator` cron job (every 60s).

**Rationale:** Single source of truth (consistent OEE calc), zero duplicate code, 08-PROD owns kalkulacje bo tam sa events source. 15-OEE jest pure analytics/visualization layer.

**Consequences:**
- Pro: No drift between modules, simpler 15-OEE maintenance, shared perf tuning
- Con: 15-OEE dependent on 08-PROD cron job health (graceful degradation if job fails — "OEE data stale" warning)

**Reference:** 08-PROD §13 D7 per-minute aggregation (Q4 A choice, Postgres batch not streaming)

### D-OEE-2. Shift aggregation DSL rule `shift_aggregator_v1` (P1 active) [UNIVERSAL]

**Decyzja:** DSL rule `shift_aggregator_v1` registered w 02-SETTINGS §7.8 (P1 active). Rule:
1. Reads `shift_configs` reference table per tenant (Apex baseline: 3 shifts 00:00-08:00 / 08:00-16:00 / 16:00-00:00 UTC)
2. Triggered post-shift-end (5min buffer po `shift_end_time` via pg_cron)
3. Aggregates `oee_snapshots` WHERE snapshot_minute BETWEEN shift_start AND shift_end
4. Writes row do `oee_shift_metrics` MV (refreshed, not inserted)
5. Emits outbox event `oee.shift.aggregated` → 12-REPORTING cache invalidation + 13-MAINT consumer (P2)

**Rationale:** Workflow-as-data pattern (consistent z 02-SET §7 principle). Admin UI dla shift_configs = L2 variation (02-SET ADR-030). Apex P1 fixed 3-shift; other tenants P2 2-shift / 4-shift / 24h continuous.

**Config example (shift_configs row):**
```json
{
  "tenant_id": "apex-uk",
  "shift_id": "AM",
  "shift_label": "Morning Shift",
  "start_time": "00:00",
  "end_time": "08:00",
  "timezone": "UTC",
  "active_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
```

### D-OEE-3. Anomaly detection EWMA P2 (from 08-PROD D15) [UNIVERSAL]

**Decyzja:** `oee_anomaly_detector_v1` DSL rule (P2 stub) — EWMA on rolling 30-min window:
- `ewma_t = α × current_t + (1-α) × ewma_{t-1}`, α = 0.3 (standard food-mfg tuning)
- `baseline_std_dev` computed last 7 days per (line_id, shift_id)
- Alert IF `current_oee_pct < baseline_ewma - 2 × std_dev`
- Output: row in `oee_anomalies` table + notification (email/Slack via P2)

**P1 stub:** Rule registered as P2 w 02-SET §7.8, implementation deferred. P1 dashboards provide manual threshold alerts (simple: OEE < 65% red).

**Rationale:** EWMA = simple, MVP-friendly anomaly detection. Avoids ML complexity (R12 defer P3+). Tunable per-tenant (α, σ threshold) via 02-SET L2 config.

### D-OEE-4. Real-time TV dashboard P2 [UNIVERSAL] + [APEX-CONFIG]

**Decyzja:** P2 scope — plant-floor TVs (1920×1080, mounted above lines):
- Dedicated route `/oee/tv/[line_id]` (full-screen, hidden header/nav)
- Auto-refresh 30s (aggressive vs 60s dashboard, ensures minimum latency visible)
- Large font (operator readable from 3-5 m away)
- Color-blind safe palette (ColorBrewer divergent)
- No interactions (read-only)
- Auto-recovery: if browser crash, OS launches URL via kiosk mode

**P1 MVP:** NOT available — operators use desktop/tablet dashboards only. P2 requires hardware provisioning (Apex ma 5 lines → 5 TVs budget).

**Rationale:** TV dashboards = best-practice food-mfg (world-class manufacturing principle), but require hardware investment + kiosk OS setup. Defer P2 post-P1 pilot validation.

### D-OEE-5. Downtime categorization consumer 02-SET (NOT ML P1) [UNIVERSAL]

**Decyzja:** 15-OEE czyta `downtime_categories` reference table z 02-SETTINGS §8.1 (admin-configurable per 08-PROD D6). **NIE ML classification P1.**

**P1 logic:** Operator manually selects category when recording downtime (08-PROD §8.1 UI → 08-PROD `downtime_events.category_id` FK). 15-OEE dashboards display category breakdown z hierarchy (parent_id chain: Equipment → Motor → Bearing failure).

**P3+ backlog:** ML classification — train model on labeled `downtime_events` (>6 miesiecy training data), classify future uncategorized events. Dependent on R12 (AI/ML roadmap).

**Rationale:** P1 = admin-configurable taxonomy is sufficient. ML wymaga training data (none available z new system). Defer per R12.

### D-OEE-6. Shift comparison P1 fixed 3 shifts, P2 custom L2 [UNIVERSAL]

**Decyzja:** P1 = Apex baseline 3-shift pattern hard-coded w `shift_configs` reference (00:00-08:00 AM / 08:00-16:00 PM / 16:00-00:00 Night UTC+0).

**P2 L2 variation:** Per tenant custom shift configs via 02-SET §8.1 `shift_configs` CRUD. Supported patterns:
- 2-shift (12h each)
- 4-shift (6h each)
- Continuous 24h (single shift, no rollup)
- Custom (operator-defined breaks)

**Rationale:** Apex P1 simplicity. P2 multi-tenant reality requires flexibility (ADR-030 configurable depts pattern extended do shifts).

### D-OEE-7. Maintenance trigger rule P2 (13-MAINT consumer) [UNIVERSAL]

**Decyzja:** `oee_maintenance_trigger_v1` DSL rule (P2 stub) — IF availability_pct < threshold dla 3 consecutive days na tym samym line_id → auto-create preventive maintenance work order.

**Logic (P2 draft):**
1. Daily cron (post-EOD) reads `oee_daily_summary` last 3 days per line
2. IF all 3 days `availability_pct < 70%` (default threshold, tenant-configurable) → fire event
3. Generate 13-MAINT `maintenance_work_orders` row: priority=medium, reason="OEE availability degradation (3-day trend)", related_line_id, suggested_action="inspect motor/bearings/belt"
4. Notify maintenance_manager via email (02-SET §13 Resend consumer)
5. Log audit entry w `oee_maintenance_triggers`

**P1:** Rule registered as P2 w 02-SET §7.8. P1 = manual. Cron logic deferred until 13-MAINT sub-module is implemented.

### D-summary table

| # | Decision | Status | Rule/ADR |
|---|---|---|---|
| D-OEE-1 | Per-minute aggregation consumer (not own aggregation) | Locked | 08-PROD D7 |
| **D-OEE-2** | **DSL `shift_aggregator_v1` P1 active** | **Locked** | 02-SET §7.8 |
| **D-OEE-3** | **DSL `oee_anomaly_detector_v1` P2 stub (EWMA)** | **Locked (P2)** | 02-SET §7.8 |
| D-OEE-4 | Real-time TV dashboard P2 | Locked (P2) | - |
| D-OEE-5 | Downtime categories consumer 02-SET (NIE ML P1) | Locked | 02-SET §8.1 |
| D-OEE-6 | Shift comparison fixed 3-shift P1, L2 custom P2 | Locked | 02-SET §8.1 `shift_configs` |
| **D-OEE-7** | **DSL `oee_maintenance_trigger_v1` P2 stub (13-MAINT)** | **Locked (P2)** | 02-SET §7.8 |

---

## 7. Rule Registry (registered w 02-SETTINGS §7)

15-OEE rejestruje 2 DSL rules w 02-SETTINGS §7.8 rules registry (1 P1 active + 1 P2 stub). Dodatkowo 1 P2 stub rule (D-OEE-7) jako consumer link do 13-MAINT.

### 7.1 `shift_aggregator_v1` (P1 active) [UNIVERSAL]

**Trigger:** pg_cron fires 5 min after each `shift_end_time` (per `shift_configs` tenant rows).

**Input:**
```json
{
  "tenant_id": "uuid",
  "shift_id": "AM | PM | Night",
  "shift_start_time": "2026-04-20T00:00:00Z",
  "shift_end_time": "2026-04-20T08:00:00Z"
}
```

**Logic:**
1. Fetch `oee_snapshots` WHERE tenant_id=:tenant AND snapshot_minute >= shift_start_time AND snapshot_minute < shift_end_time
2. Aggregate per (line_id): AVG(availability_pct), AVG(performance_pct), AVG(quality_pct), AVG(oee_pct), SUM(output_qty_delta), SUM(downtime_min_delta), SUM(waste_qty_delta), COUNT(*) as snapshot_count
3. Compute MTTR/MTBF stubs (P2 13-MAINT consumer):
   - MTBF = total_uptime / num_downtime_events
   - MTTR = total_downtime_min / num_downtime_events
4. UPSERT `oee_shift_metrics` row per (tenant_id, site_id, line_id, shift_date, shift_id)
5. Emit outbox event `oee.shift.aggregated` z payload `{tenant_id, line_id, shift_date, shift_id, oee_pct, availability_pct, ...}`

**Output:** Updated `oee_shift_metrics` MV + outbox event dla downstream consumers (12-REPORTING, 13-MAINT P2).

**Reference:** 02-SETTINGS §7.8 (baseline pattern from 05-WH `fefo_strategy_v1`). Config stored in rule_definitions table, admin read-only (per 02-SET §7 Q2 decision).

### 7.2 `oee_anomaly_detector_v1` (P2 stub) [UNIVERSAL]

**Trigger:** pg_cron fires every 5 min (detection cadence — balance between latency and compute cost).

**Logic (P2 draft):**
1. Fetch `oee_snapshots` last 30 min per (tenant_id, line_id, shift_id)
2. Compute `ewma_current = 0.3 × current_oee + 0.7 × ewma_previous` (stored in `oee_ewma_state` table, per line/shift)
3. Compute `baseline_std_dev` — rolling 7-day std dev of oee_pct per (line_id, shift_id)
4. Anomaly IF `current_oee_pct < ewma_current - 2 × baseline_std_dev`:
   - Insert `oee_anomalies` row (line_id, shift_id, detected_at, oee_pct, expected_pct, deviation_sigma, severity)
   - Emit outbox event `oee.anomaly.detected`
   - Notify via email (02-SET §13 Resend) / Slack (02-SET §10 flag `oee.anomaly_notifications`)
5. Auto-resolve: IF no anomaly for 15 min → mark `oee_anomalies.resolved_at = now()`

**Output:** P2 stub — pelna implementacja w sesji impl 15-b lub osobnej P2 sesji.

**Reference:** 08-PROD D15 original spec + industry standard EWMA tuning (α=0.3, 2σ threshold) per SEMI E10.

### 7.3 `oee_maintenance_trigger_v1` (P2 stub, 13-MAINT consumer link) [UNIVERSAL]

**Trigger:** pg_cron daily (post-EOD, e.g., 02:00 UTC).

**Logic (P2 draft):**
1. Fetch `oee_daily_summary` last 3 days per (tenant_id, line_id)
2. IF all 3 days `availability_pct < threshold` (default 70%, configurable via 02-SET L2):
   - Call 13-MAINT API `POST /api/maintenance/work-orders` (creates PM WO)
   - Emit outbox event `oee.maintenance.triggered`
   - Notify maintenance_manager (email)
   - Log `oee_maintenance_triggers` audit row (line_id, trigger_date, avg_availability_pct, created_wo_id)

**Output:** P2 stub — wymaga 13-MAINT API impl. Rule registered jako P2 w 02-SET §7.8.

### 7.4 Rules consumed (read-only)

| Rule | Owner | Consumer context |
|---|---|---|
| `allergen_changeover_gate_v1` | 08-PROD | Changeover duration analysis (15-OEE Changeover dashboard consumer) |
| `wo_state_machine_v1` | 04-PLAN | active_wo_id lookup w oee_snapshots → display WO status on 15-OEE dashboards |

---

## 8. Core Flows (OEE Aggregation → Visualization)

### 8.1 Per-minute aggregation flow (producer 08-PROD, NOT 15-OEE)

Reference only — 15-OEE consumer:

```
pg_cron fires every 60s → 08-PROD `oee_aggregator` job
  ↓
For each active line:
  [1] Compute availability_pct = (planned_min - downtime_min) / planned_min
  [2] Compute performance_pct = (output_qty × ideal_cycle_sec) / (run_time_min × 60)
  [3] Compute quality_pct = good_qty / total_output_qty
  [4] INSERT oee_snapshots (line_id, shift_id, snapshot_minute, A, P, Q, OEE=A*P*Q/10000)
  ↓
Emit outbox event: wo.production.aggregated (consumer 15-OEE cache invalidation)
```

### 8.2 Per-line 24h Trend Dashboard flow (Dashboard #1 P1)

```
User → /oee/line/[line_id]?window=24h
  ↓
/api/oee/line/[line_id]/trend?window=24h&shift_filter=all
  ↓
[1] DSL `report_access_gate_v1` (reused 12-REPORTING rule) evaluates → ALLOW
  ↓
[2] Query oee_snapshots WHERE tenant_id=:tenant AND line_id=:line_id AND snapshot_minute >= now() - interval '24 hours'
      (index idx_oee_line_time: line_id, snapshot_minute DESC)
  ↓
[3] Downsample if > 500 points (1440 points dla 24h × 60s → aggregate to 5-min buckets = 288 points OK)
  ↓
[4] Fetch latest oee_daily_summary per comparison (target line, best/worst shift)
  ↓
Response JSON: {trend: [{minute, A, P, Q, OEE}], latest: {A, P, Q, OEE}, target_pct, best_shift, worst_shift}
  ↓
D3.js: 4-line chart (A blue, P green, Q amber, OEE black), target line dashed red
  ↓
Client setInterval 60s → repeat step [2] incremental (WHERE snapshot_minute > last_fetched)
```

### 8.3 Per-shift Heatmap Dashboard flow (Dashboard #2 P1)

```
User → /oee/heatmap?week=2026-W16
  ↓
/api/oee/heatmap?week=2026-W16&site_id=:current_site
  ↓
[1] Query oee_shift_metrics JOIN lines
    WHERE tenant_id=:tenant AND shift_date BETWEEN '2026-04-13' AND '2026-04-19'
    ORDER BY line_id, shift_date, shift_id
  ↓
Response: matrix [{line_id, shift_date, shift_id, oee_pct}] — lines (rows) × (date × shift) (cols) = e.g., 5 lines × 7 days × 3 shifts = 105 cells
  ↓
D3.js heatmap: color scale red (0-60%) / yellow (60-85%) / green (85-100%)
  ↓
Click cell → navigate to per-line 24h trend (drill-down)
```

### 8.4 Shift aggregation flow (post-shift-end)

```
pg_cron fires 5 min after shift_end_time (e.g., 08:05 UTC for AM shift)
  ↓
DSL `shift_aggregator_v1` evaluates per (tenant, shift_id)
  ↓
[1] Fetch oee_snapshots WHERE snapshot_minute BETWEEN shift_start AND shift_end
  ↓
[2] Aggregate per line_id: AVG(A), AVG(P), AVG(Q), AVG(OEE), SUM(output, downtime, waste)
  ↓
[3] UPSERT oee_shift_metrics
  ↓
[4] Emit outbox oee.shift.aggregated
  ↓
Consumers: 12-REPORTING cache refresh, 13-MAINT (P2) MTBF/MTTR update
```

### 8.5 Per-day summary rollup flow (Dashboard #3 P1)

```
User → /oee/summary?date=2026-04-20
  ↓
/api/oee/daily?date=2026-04-20
  ↓
[1] Query oee_daily_summary WHERE tenant_id=:tenant AND date='2026-04-20'
  ↓
[2] Per row: oee_pct, A, P, Q, best_shift (highest OEE shift of day), worst_shift, top_downtime_reason (via JOIN downtime_events aggregated)
  ↓
[3] Additional: 7-day trend sparkline per line (from oee_daily_summary ORDER BY date DESC LIMIT 7)
  ↓
Response: table rows + 7-day sparklines
  ↓
React table component z sparkline cells (Recharts)
```

### 8.6 Anomaly detection flow (P2)

```
pg_cron fires every 5 min → rule oee_anomaly_detector_v1
  ↓
Per (line_id, shift_id):
  [1] Compute ewma = 0.3 × current + 0.7 × previous (stored in oee_ewma_state)
  [2] Compute baseline_std_dev from last 7 days
  [3] IF current < ewma - 2 × std_dev:
        INSERT oee_anomalies
        Emit outbox oee.anomaly.detected
        Notify via email (Resend)
  ↓
User sees alert in dashboard header + email notification
  ↓
Anomaly auto-resolves if no re-trigger in 15 min
```

### 8.7 Maintenance trigger flow (P2)

```
pg_cron fires daily 02:00 UTC → rule oee_maintenance_trigger_v1
  ↓
Per tenant:
  [1] Fetch oee_daily_summary last 3 days per line
  [2] IF all 3 days availability_pct < threshold:
        POST /api/maintenance/work-orders {line_id, reason, priority, suggested_action}
        INSERT oee_maintenance_triggers (audit)
        Notify maintenance_manager via email
        Emit outbox oee.maintenance.triggered
  ↓
13-MAINT receives WO creation request, writes to maintenance_work_orders
```

---

## 9. Data Model

### 9.1 Primary source (consumer from 08-PROD)

**`oee_snapshots`** (08-PROD §9.9, already defined — 15-OEE reads only):
```sql
CREATE TABLE oee_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  line_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  snapshot_minute TIMESTAMPTZ NOT NULL,
  availability_pct NUMERIC(5,2),
  performance_pct NUMERIC(5,2),
  quality_pct NUMERIC(5,2),
  oee_pct NUMERIC(5,2) GENERATED ALWAYS AS (availability_pct * performance_pct * quality_pct / 10000) STORED,
  active_wo_id UUID,
  output_qty_delta NUMERIC(12,3),
  downtime_min_delta INTEGER,
  waste_qty_delta NUMERIC(12,3),
  ideal_cycle_time_sec NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, line_id, shift_id, snapshot_minute)
);

-- REC-L1 site_id extension (added in 15-OEE scope)
ALTER TABLE oee_snapshots ADD COLUMN site_id UUID;
CREATE INDEX idx_oee_site_line_time ON oee_snapshots(site_id, line_id, snapshot_minute DESC);
```

### 9.2 Materialized views P1

**`oee_shift_metrics`** (per-shift rollup, populated przez `shift_aggregator_v1`):

```sql
CREATE MATERIALIZED VIEW oee_shift_metrics AS
SELECT
  o.tenant_id,
  o.site_id,
  o.line_id,
  DATE(o.snapshot_minute AT TIME ZONE sc.timezone) AS shift_date,
  o.shift_id,
  sc.shift_label,
  AVG(o.availability_pct) AS availability_pct,
  AVG(o.performance_pct) AS performance_pct,
  AVG(o.quality_pct) AS quality_pct,
  AVG(o.oee_pct) AS oee_pct,
  SUM(o.output_qty_delta) AS total_output_qty,
  SUM(o.downtime_min_delta) AS total_downtime_min,
  SUM(o.waste_qty_delta) AS total_waste_qty,
  COUNT(*) AS snapshot_count,
  COUNT(DISTINCT o.active_wo_id) FILTER (WHERE o.active_wo_id IS NOT NULL) AS wo_count,
  -- MTBF/MTTR stubs for P2 13-MAINT consumer
  COUNT(DISTINCT de.id) AS downtime_event_count,
  CASE WHEN COUNT(DISTINCT de.id) > 0
    THEN SUM(o.downtime_min_delta) / COUNT(DISTINCT de.id)
    ELSE NULL
  END AS mttr_min,
  CASE WHEN COUNT(DISTINCT de.id) > 0
    THEN (COUNT(*) - SUM(o.downtime_min_delta)) / COUNT(DISTINCT de.id)
    ELSE NULL
  END AS mtbf_min,
  MAX(o.snapshot_minute) AS last_snapshot_at
FROM oee_snapshots o
LEFT JOIN downtime_events de ON de.line_id = o.line_id
  AND de.started_at BETWEEN o.snapshot_minute - interval '1 minute' AND o.snapshot_minute
LEFT JOIN shift_configs sc ON sc.tenant_id = o.tenant_id AND sc.shift_id = o.shift_id
GROUP BY o.tenant_id, o.site_id, o.line_id, DATE(o.snapshot_minute AT TIME ZONE sc.timezone), o.shift_id, sc.shift_label;

CREATE UNIQUE INDEX idx_oee_shift_pk ON oee_shift_metrics(tenant_id, site_id, line_id, shift_date, shift_id);
CREATE INDEX idx_oee_shift_date ON oee_shift_metrics(shift_date DESC);
```

**`oee_daily_summary`** (daily rollup, refresh co 15 min):

```sql
CREATE MATERIALIZED VIEW oee_daily_summary AS
SELECT
  tenant_id,
  site_id,
  line_id,
  DATE(snapshot_minute AT TIME ZONE 'UTC') AS date,
  AVG(availability_pct) AS availability_pct,
  AVG(performance_pct) AS performance_pct,
  AVG(quality_pct) AS quality_pct,
  AVG(oee_pct) AS oee_pct,
  MAX(oee_pct) AS best_oee_pct,
  MIN(oee_pct) AS worst_oee_pct,
  SUM(output_qty_delta) AS total_output,
  SUM(downtime_min_delta) AS total_downtime_min,
  SUM(waste_qty_delta) AS total_waste,
  COUNT(*) AS snapshot_count,
  (
    SELECT shift_id FROM oee_shift_metrics osm
    WHERE osm.tenant_id = oee_snapshots.tenant_id
      AND osm.line_id = oee_snapshots.line_id
      AND osm.shift_date = DATE(oee_snapshots.snapshot_minute AT TIME ZONE 'UTC')
    ORDER BY osm.oee_pct DESC LIMIT 1
  ) AS best_shift_id,
  (
    SELECT shift_id FROM oee_shift_metrics osm
    WHERE osm.tenant_id = oee_snapshots.tenant_id
      AND osm.line_id = oee_snapshots.line_id
      AND osm.shift_date = DATE(oee_snapshots.snapshot_minute AT TIME ZONE 'UTC')
    ORDER BY osm.oee_pct ASC LIMIT 1
  ) AS worst_shift_id
FROM oee_snapshots
WHERE snapshot_minute > now() - interval '90 days'
GROUP BY tenant_id, site_id, line_id, DATE(snapshot_minute AT TIME ZONE 'UTC');

CREATE UNIQUE INDEX idx_oee_daily_pk ON oee_daily_summary(tenant_id, site_id, line_id, date);
CREATE INDEX idx_oee_daily_date ON oee_daily_summary(date DESC);
```

### 9.3 P2 tables

**`oee_anomalies`** (P2):

```sql
CREATE TABLE oee_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  line_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  oee_pct_actual NUMERIC(5,2) NOT NULL,
  oee_pct_expected NUMERIC(5,2) NOT NULL,
  deviation_sigma NUMERIC(4,2) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX idx_anomalies_open ON oee_anomalies(tenant_id, line_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_anomalies_time ON oee_anomalies(detected_at DESC);
```

**`oee_ewma_state`** (P2, EWMA running state per line/shift):

```sql
CREATE TABLE oee_ewma_state (
  tenant_id UUID NOT NULL,
  line_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  ewma_oee_pct NUMERIC(5,2) NOT NULL,
  baseline_std_dev NUMERIC(5,2) NOT NULL,
  alpha NUMERIC(3,2) NOT NULL DEFAULT 0.3,
  sigma_threshold NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, line_id, shift_id)
);
```

**`oee_maintenance_triggers`** (P2, audit log dla 13-MAINT consumer):

```sql
CREATE TABLE oee_maintenance_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  line_id TEXT NOT NULL,
  trigger_date DATE NOT NULL,
  avg_availability_pct NUMERIC(5,2) NOT NULL,
  threshold_pct NUMERIC(5,2) NOT NULL,
  consecutive_days INTEGER NOT NULL,
  created_wo_id UUID, -- FK to 13-MAINT maintenance_work_orders
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notification_sent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_maint_trigger_line_date ON oee_maintenance_triggers(line_id, trigger_date DESC);
```

### 9.4 Supporting tables (02-SETTINGS §8.1 reference tables)

**`shift_configs`** (new reference table w 02-SETTINGS §8.1):

```sql
CREATE TABLE shift_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  shift_id TEXT NOT NULL, -- 'AM', 'PM', 'Night', 'S1', 'S2', etc.
  shift_label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  active_days TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, shift_id)
);
```

**`oee_alert_thresholds`** (new reference table w 02-SETTINGS §8.1, L2 per-line):

```sql
CREATE TABLE oee_alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  line_id TEXT, -- nullable, NULL = tenant default
  oee_target_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,  -- Apex P1 ramp-up baseline (OQ-OEE-02 decision 2026-04-21; industry world-class = 85%)
  availability_min_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,
  performance_min_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  quality_min_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
  anomaly_alpha NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  anomaly_sigma_threshold NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  maintenance_trigger_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,
  maintenance_trigger_consecutive_days INTEGER NOT NULL DEFAULT 3,
  UNIQUE (tenant_id, line_id)
);
```

### 9.5 Refresh cron jobs

```sql
-- Refresh oee_daily_summary every 15 min
SELECT cron.schedule('mv-refresh-oee-daily-15min', '*/15 * * * *', $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY oee_daily_summary;
$$);

-- Refresh oee_shift_metrics post-shift-end
-- Triggered by shift_aggregator_v1 rule (not pg_cron static)
-- Fires 5 min after each shift_configs.end_time per tenant

-- P2: Anomaly detection every 5 min
SELECT cron.schedule('oee-anomaly-detection-5min', '*/5 * * * *', $$
  SELECT oee_anomaly_detector_v1();
$$);

-- P2: Maintenance trigger daily 02:00 UTC
SELECT cron.schedule('oee-maintenance-trigger-daily', '0 2 * * *', $$
  SELECT oee_maintenance_trigger_v1();
$$);
```

---

## 10. Dashboard Specifications

### 10.1 Per-line 24h OEE Trend Dashboard (#1 P1)

**Route:** `/oee/line/[line_id]`

**Layout:**
- Header: line name, current shift, last aggregation timestamp
- Top row: 4 KPI cards (Availability / Performance / Quality / OEE) — current values + Δ vs previous hour
- Main chart: D3.js multi-line chart (x: time, y: %) — 4 lines: A (blue), P (green), Q (amber), OEE (black bold). Target OEE dashed red.
- Controls: window toggle (1h / 6h / 24h), shift filter
- Bottom row: "Top 3 Downtime Causes" list (from downtime_events last N hours) — category + duration + reason_notes

**Auto-refresh:** setInterval 60s (incremental fetch).

### 10.2 Per-shift Heatmap Dashboard (#2 P1)

**Route:** `/oee/heatmap`

**Layout:**
- Week selector (W/E DD/MM/YYYY)
- Heatmap grid: rows = lines (up to 10), cols = (date × shift) = 7 days × 3 shifts = 21 cols
- Cell color scale: red <60%, amber 60-85%, green >85% (world-class threshold)
- Cell content: `OEE%` label + micro-bar (A/P/Q ratio)
- Hover tooltip: full metrics (A, P, Q, OEE, output, downtime)
- Click cell: navigate to per-line 24h trend (drill-down)

**Perf requirement:** <2s P95 dla max 10 lines × 21 cells = 210 cells.

### 10.3 Per-day OEE Summary Dashboard (#3 P1)

**Route:** `/oee/summary`

**Layout:**
- Date selector (calendar)
- Summary table per line: OEE%, A%, P%, Q%, best shift, worst shift, top downtime reason
- 7-day trend sparklines per line (inline, Recharts)
- Summary cards: factory avg OEE, best line, worst line, total output, total downtime
- Export buttons: PDF / CSV / Copy

**Responsive:** desktop 12-col (line per row), tablet stacked cards, mobile hidden (redirect to per-line dashboard #1).

### 10.4 P2 Dashboards

- `/oee/tv/[line_id]` — plant-floor TV (D-OEE-4)
- `/oee/pareto` — Pareto chart losses (top downtime causes)
- `/oee/anomalies` — anomaly history + acknowledgment workflow
- `/oee/equipment-health` — cross-13-MAINT: OEE + MTBF + MTTR + last PM + next PM
- `/oee/benchmark` — industry comparison
- `/oee/forecast` — Prophet predictions P3+

---

## 11. Validation Rules (V-OEE-*)

20 validation rules enforcing OEE data integrity, access control, aggregation correctness:

### V-OEE-DATA (integrity)

- **V-OEE-DATA-1:** `oee_snapshots.oee_pct` GENERATED constraint (A × P × Q / 10000) — nie INSERT bezposrednio
- **V-OEE-DATA-2:** `availability_pct`, `performance_pct`, `quality_pct` MUST BE 0-100 (CHECK constraint na 08-PROD table)
- **V-OEE-DATA-3:** `shift_id` MUST match existing `shift_configs.shift_id` per tenant — mismatch → warning log
- **V-OEE-DATA-4:** Missing snapshots dla > 5 min (gaps w timeline) → alert (aggregator job failure)
- **V-OEE-DATA-5:** Retroactive snapshots (snapshot_minute < now() - 10 min) → reject (data integrity)

### V-OEE-ACCESS (dostep)

- **V-OEE-ACCESS-1:** Request `/api/oee/*` bez session → 401
- **V-OEE-ACCESS-2:** user_role NOT IN allowed_roles (reuse `report_access_gate_v1` z 12-REPORTING) → 403
- **V-OEE-ACCESS-3:** RLS enforced — service-layer `WHERE tenant_id=:current` auto-applied
- **V-OEE-ACCESS-4:** site_id filter — user can access sites z `user_sites` many-to-many

### V-OEE-AGG (agregacja)

- **V-OEE-AGG-1:** `shift_aggregator_v1` fires 5 min post `shift_end_time` — not earlier (ensures late events captured)
- **V-OEE-AGG-2:** UPSERT `oee_shift_metrics` (not INSERT) — idempotent (safe if re-run)
- **V-OEE-AGG-3:** `oee_shift_metrics.snapshot_count` > 0 required — empty shift → skip row (no placeholder)
- **V-OEE-AGG-4:** MTBF/MTTR NULL if `downtime_event_count = 0` (no division by zero)
- **V-OEE-AGG-5:** `oee_daily_summary` refresh CONCURRENTLY (no lock on reads)

### V-OEE-SHIFT (shift boundaries)

- **V-OEE-SHIFT-1:** `shift_configs` MUST cover 24h per day (no gaps) — validation at UPSERT
- **V-OEE-SHIFT-2:** `shift_configs` start_time != end_time (no zero-duration)
- **V-OEE-SHIFT-3:** Overlap detection — shifts on same day MUST NOT overlap
- **V-OEE-SHIFT-4:** timezone MUST be valid IANA timezone (validated w Zod)

### V-OEE-ANOMALY (P2)

- **V-OEE-ANOMALY-1:** `oee_ewma_state` bootstrap — if no prior state, use first 30 min avg as baseline
- **V-OEE-ANOMALY-2:** Anomaly auto-resolve after 15 min no re-trigger

### V-OEE-MAINT (P2)

- **V-OEE-MAINT-1:** Trigger requires `oee_maintenance_trigger_v1` rule enabled in 02-SET §7.8
- **V-OEE-MAINT-2:** Deduplicate — single WO per line per 7-day window (avoid PM spam)

---

## 12. INTEGRATIONS (read-only consumer, event producer)

### 12.1 Consumer relationships

15-OEE konsumuje:
- **08-PRODUCTION:** `oee_snapshots` (PRIMARY source), `downtime_events`, `changeover_events`, `work_orders` (active_wo_id lookup)
- **02-SETTINGS:** `shift_configs` (L2 config), `oee_alert_thresholds` (per-line targets), `downtime_categories` (taxonomy), `target_kpis` (oee_target_pct fallback), rule registry §7.8
- **03-TECHNICAL (P2):** products/items dla per-product OEE drill-down

### 12.2 Event producer (outbox pattern per R1)

15-OEE emituje events via outbox pattern (consumer 12-REPORTING, 13-MAINT P2):

**Emitted events:**
- `oee.shift.aggregated` — po `shift_aggregator_v1` completion
- `oee.daily.refreshed` — po `oee_daily_summary` refresh (każde 15 min)
- `oee.anomaly.detected` (P2) — po anomaly detection
- `oee.anomaly.resolved` (P2) — po auto-resolve
- `oee.maintenance.triggered` (P2) — po maintenance trigger rule fires

**Payload schema (example `oee.shift.aggregated`):**
```json
{
  "event_id": "uuid-v7",
  "event_type": "oee.shift.aggregated",
  "tenant_id": "uuid",
  "site_id": "uuid | null",
  "occurred_at": "2026-04-20T08:05:00Z",
  "payload": {
    "line_id": "LINE_01",
    "shift_id": "AM",
    "shift_date": "2026-04-20",
    "oee_pct": 82.5,
    "availability_pct": 95.0,
    "performance_pct": 90.5,
    "quality_pct": 96.0,
    "total_output_qty": 1200.5,
    "total_downtime_min": 24
  }
}
```

**Outbox table:** `oee_outbox_events` (same schema as 08-PROD §9.10, different table name):

```sql
CREATE TABLE oee_outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_id TEXT, -- line_id for aggregated events
  payload JSONB NOT NULL,
  target_system TEXT NOT NULL, -- 'internal' for 12-REPORTING/13-MAINT cache invalidation
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oee_outbox_dispatch ON oee_outbox_events(status, next_retry_at) WHERE status IN ('pending', 'failed');
```

### 12.3 No D365 Push (OEE stays internal)

15-OEE NIE push do D365 (OEE to operational metric, nie accounting entry). Wszystkie events internal (target_system='internal'). Shared outbox dispatcher `@monopilot/outbox-dispatcher` polls oee_outbox_events z reszta outbox tables.

---

## 13. Labels & Formatting Conventions

### 13.1 OEE color coding (industry standard)

| OEE Range | Label | Color | Hex |
|---|---|---|---|
| ≥ 85% | World-class | green-500 | #22C55E |
| 65–84.9% | Typical food-mfg | amber-500 | #F59E0B |
| < 65% | Poor (requires action) | red-500 | #EF4444 |
| 100% | Unrealistic (data error — investigate) | purple-500 | #A855F7 |

Note: P1 Apex target is **70%** (shown as target reference line on charts). P1 color scale uses fixed industry thresholds 65/85 (OQ-OEE-07 decision 2026-04-21). P2 color scale becomes tenant-configurable via `oee_alert_thresholds.oee_target_pct`.

### 13.2 A/P/Q component colors

- **Availability** (uptime): blue-500 (#3B82F6)
- **Performance** (speed): green-500 (#22C55E)
- **Quality** (good output): amber-500 (#F59E0B)
- **OEE** (combined): black (#000000) — emphasize

### 13.3 Downtime category colors

- **People** (breaks, missing, training): blue-500
- **Process** (material wait, upstream delay, downstream blocked, quality hold): amber-500
- **Plant** (machine fault, cleaning, changeover): red-500

### 13.4 Shift labels (Apex baseline)

- **AM** — 00:00-08:00 UTC
- **PM** — 08:00-16:00 UTC
- **Night** — 16:00-00:00 UTC (UTC+1 summer adjusted)

---

## 14. Regulatory Alignment

### 14.1 BRCGS Issue 10

- `oee_daily_summary` retention 7 years (BRCGS audit trail evidence — "operational excellence program")
- Archive to cold storage nightly (same pattern as 12-REPORTING `report_exports`)
- NOT direct BRCGS requirement, but best-practice for audit responses

### 14.2 FSMA 204

- OEE nie direct FSMA 204 scope (traceability focus). Jednak `oee_snapshots` może być evidence dla "availability issues affected recall response time"
- No direct 15-OEE implementation requirement

### 14.3 EU 1169/2011 + 21 CFR Part 11

- NOT applicable — OEE is operational metric, nie electronic record regulated by food labeling or FDA e-sig

### 14.4 GDPR

- `oee_snapshots.active_wo_id` nie zawiera PII (WO to operational ID)
- Operator attribution via 08-PROD `operator_kpis_monthly` — per-tenant anonymize flag applicable via `reporting.leaderboard_anonymize` (12-REPORTING D-RPT-10)

### 14.5 Data residency (R7)

- `oee_snapshots` + derived MVs follow tenant `data_residency` config (02-SET §12)
- EU tenant OEE data → EU storage only

---

## 15. Screens (Desktop + TV P2)

### 15.1 P1 Screens (3 dashboards) [UNIVERSAL]

| # | Screen ID | Route | Dashboard | Sub-module |
|---|---|---|---|---|
| 1 | OEE-001 | `/oee/line/[line_id]` | Per-line 24h Trend | 15-a |
| 2 | OEE-002 | `/oee/heatmap` | Per-shift Heatmap | 15-a |
| 3 | OEE-003 | `/oee/summary` | Per-day OEE Summary | 15-b |

**Support routes (admin):**
- `/oee/settings` — OEE-ADM-001 admin UI dla `oee_alert_thresholds` (per-line config) — requires `oee_admin` role
- `/oee/shift-configs` — OEE-ADM-002 admin UI dla `shift_configs` — cross-link do 02-SET §8.1

### 15.2 P2 Screens [UNIVERSAL]

| Screen ID | Route | Dashboard |
|---|---|---|
| OEE-P2-A | `/oee/anomalies` | Anomaly History + acknowledgment (D-OEE-3) |
| OEE-P2-B | `/oee/equipment-health` | Equipment Health (D-OEE-7, cross-13-MAINT) |
| OEE-P2-C | `/oee/pareto` | Pareto Loss Analysis |
| OEE-P2-D | `/oee/tv/[line_id]` | Plant-floor TV (D-OEE-4) |
| (no UX) | `/oee/benchmark` | Industry comparison `[NO-PROTOTYPE-YET]` |
| (no UX) | `/oee/forecast` | Prophet predictions (P3+) `[NO-PROTOTYPE-YET]` |
| (no UX) | `/oee/rules-config` | Tenant-admin UI dla anomaly/maintenance thresholds `[NO-PROTOTYPE-YET]` |

### 15.3 P1 Admin / Settings Screens (post-reconciliation, 2026-04-30) [UNIVERSAL] [ORG-CONFIG]

The audit `_meta/audits/2026-04-30-design-prd-coverage.md` §Module 15-OEE flagged 4 prototype-orphan screens. The labeling fix (2026-04-30) moved `settings_shifts_screen` from `prototype-index-settings.json` into `prototype-index-oee.json` (it is the OEE shifts management screen, not a tenant settings screen). The following screen IDs anchor those prototypes into the PRD without changing UX content.

#### SCREEN OEE-ADM-003 — Shift Patterns + Non-Production Calendar (operational shift management) [UNIVERSAL] [ORG-CONFIG]

**Screen ID:** OEE-ADM-003
**Route:** `/oee/shifts` (alias `/settings/shifts` redirect for legacy bookmarks)
**UX source:** `design/15-OEE-UX.md:805-834` (cross-link from OEE-ADM-002 Shift Config Viewer; the shifts management surface itself was previously laid out in 02-SETTINGS UX and is being absorbed by 15-OEE per the 2026-04-30 prototype labeling fix).
**Prototype:** `settings_shifts_screen` (`design/Monopilot Design System/settings/org-screens.jsx:255-306`) — **moved from `prototype-index-settings.json` to `prototype-index-oee.json` 2026-04-30** during the prototype labeling correction pass (the screen edits operational `shift_patterns` rows and the org-level non-production calendar consumed by `shift_aggregator_v1`, not generic tenant settings).
**Role:** `oee_admin` (extends existing `oee_admin` matrix in §3); read-only `oee_supervisor`.
**Purpose:** CRUD UI for `shift_patterns` (per-line / per-tenant shift definitions) and inline calendar editor for `org_non_production_days` (factory-wide closures, public holidays, planned shutdowns). Both feed the `shift_aggregator_v1` rule (§7.1) so a missing shift pattern or an un-marked closure produces incorrect `oee_shift_metrics` rows. **This screen is the single place where ops-admins curate the shift universe consumed by every OEE rollup.**
**Data model dependencies:**
- `shift_patterns` (existing, 02-SETTINGS §8.1 reference table) — read+write here.
- `org_non_production_days` (TODO OEE-PRD-AMEND-01: confirm canonical owner — most likely 02-SETTINGS §8.1 alongside `shift_configs`, but write-path lives in this screen).
- Cross-read of `shift_configs` (already covered by OEE-ADM-002 read-only viewer).
**Layout (per prototype `org-screens.jsx:255-306`):**
- Left pane: `<table>` of shift patterns (id, label, start, end, days_active, line scope). Inline `[Edit]` / `[Delete]` per row + top-right `[+ Add shift pattern]`.
- Right pane: 7-column CSS-grid month calendar; clicking a date toggles non-production-day status with optional `reason` tag (Holiday / Maintenance / Plant Closure / Custom). Holidays seeded from country-level pack (`[INDUSTRY-CONFIG]` per ADR-034 — UK pack ships 2026 Apex defaults, EU/US tenants get separate seed packs).
**Validations (V-OEE additions):**
- Shift overlap detection per line (cross-pattern + cross-day) → reuses existing OEE-ADM-002 V-OEE-12 wording.
- 24h coverage warning if patterns + non-production calendar leave > 4h gap on a planned production day.
- `[Save]` writes `shift_patterns` + `org_non_production_days` in one transaction; emits outbox event `oee.shift_pattern.changed` (consumer 12-REPORTING cache-bust + future 13-MAINT scheduling).
**Cross-links:**
- `[View Shift Config Viewer →]` → OEE-ADM-002 (read-only DSL/rule status).
- `[Open in 02-SETTINGS Reference Tables →]` → `/settings/reference-tables/shift-configs` (RBAC permitting).
**Boundary clarification with 02-SETTINGS:** `shift_configs` (the abstract DSL-rule input) lives in 02-SETTINGS §8.1; this screen edits the operational `shift_patterns` and `org_non_production_days` rows that the rule consumes. Per ADR-034 markers, the 02-SET viewer remains `[UNIVERSAL]` (reference tables) while OEE-ADM-003 is `[ORG-CONFIG]` (per-tenant operational rota).
**TODO OEE-PRD-AMEND-01:** Decide canonical write-owner of `org_non_production_days` (15-OEE here vs. 02-SETTINGS §8.1). Default for P1: this screen owns writes, 02-SETTINGS exposes read-only viewer.

#### SCREEN OEE-001a — Availability Drill-down (A factor) [UNIVERSAL]

**Screen ID:** OEE-001a (sub-route under OEE-001 family)
**Route:** `/oee/availability?date=YYYY-MM-DD` (drill-down — entered from any OEE-001/002/003 KPI tile labelled "A").
**UX source:** the OEE-001 §15.3 spec describes A/P/Q drill-down in §15.4 PRD bullets but does not enumerate the dedicated page; UX file `design/15-OEE-UX.md` references the drilldown via OEE-001 cross-links (lines 1025, 1054).
**Prototype:** `oee_availability_drilldown_page` (`design/Monopilot Design System/oee/screens.jsx:471-543`).
**Purpose:** Decompose factory-level availability% into per-line breakdown + 7-day trend + availability-only loss categories + cross-link to 13-MAINT equipment health (P2). Renders as a focused detail view rather than a multi-tab dashboard.
**Layout:** Factory A% header card → per-line table with sparklines (data: `oee_snapshots` rolling 7-day) → loss categories table filtered to `impact_dimension = 'A'` → 7-day multi-line trend chart.
**Permissions:** `oee_viewer+` read; same RLS as OEE-001.

#### SCREEN OEE-001b — Performance Drill-down (P factor) [UNIVERSAL]

**Screen ID:** OEE-001b
**Route:** `/oee/performance?date=YYYY-MM-DD`
**UX source:** mirrored to OEE-001a; UX file does not yet enumerate as standalone screen.
**Prototype:** `oee_performance_drilldown_page` (`design/Monopilot Design System/oee/screens.jsx:546-598`).
**Purpose:** Per-line micro-stops, ideal cycle time deviation, P-only loss categories, P-dimension 7-day sparklines.
**Layout & Permissions:** mirrors OEE-001a, parameterised by `factor='P'`. The prototype translation note explicitly calls out a shared `<OeeFactorDrillPage>` layout component (parameter A|P|Q).

#### SCREEN OEE-001c — Quality Drill-down (Q factor) [UNIVERSAL]

**Screen ID:** OEE-001c
**Route:** `/oee/quality?date=YYYY-MM-DD`
**UX source:** mirrored; cross-link from OEE-003 Q column.
**Prototype:** `oee_quality_drilldown_page` (`design/Monopilot Design System/oee/screens.jsx:600-655`).
**Purpose:** Per-line rejects (`reject_kg`/`reject_units` from `production_output_events`), Q-only loss categories, optional 09-QUALITY holds cross-link.
**Layout & Permissions:** identical to OEE-001a/b with `factor='Q'`.

**Build placement:** OEE-001a/b/c are P1 sub-screens of OEE-001 family — already built in prototype, slotted into Sub-module 15-a (per Build Roadmap §16) without affecting the 9-12 sesji P1 estimate (shared `<OeeFactorDrillPage>` component).

### 15.4 Modal Contracts (P1 + P2) [UNIVERSAL]

The PRD §15.1 previously enumerated only OEE-M-001 / OEE-M-002 (UX file does the same). The audit flagged 7 additional prototype modals without PRD anchor. These are added here as numbered modal IDs; payloads remain governed by the shared `_shared/MODAL-SCHEMA.md` contract used across modules.

| Modal ID | Title | Trigger | UX line | Prototype | Phase |
|---|---|---|---|---|---|
| OEE-M-001 | Downtime Note Annotation | OEE-003 Six Big Losses tab `[Add note]` | `15-OEE-UX.md:836-865` | `annotate_downtime_modal` (`oee/modals.jsx:19-93`) | P1 |
| OEE-M-002 | Export OEE Snapshot | Any `[Export ▼]` on OEE-001/002/003 | `15-OEE-UX.md:887-927` | `export_oee_modal` (`oee/modals.jsx:95-161`) | P1 |
| OEE-M-003 | Per-line Threshold Override (create/edit) | OEE-ADM-001 inline `[Edit override]` | `15-OEE-UX.md:719-761` (admin overrides table area) | `line_override_modal` (`oee/modals.jsx:163-204`) | P1 |
| OEE-M-004 | Delete Per-line Override (type-to-confirm) | OEE-ADM-001 row `[Delete]` | (admin overrides table area) | `delete_override_modal` (`oee/modals.jsx:350-370`) | P1 |
| OEE-M-005 | Big Loss Mapping Editor (full-page) | OEE-ADM-001 `[Edit Six Big Losses Mapping]` | `15-OEE-UX.md:762-803` | `big_loss_mapping_modal` (`oee/modals.jsx:206-259`) | P1 |
| OEE-M-006 | Changeover Detail | OEE-003 Changeover tab row `[View]` | `15-OEE-UX.md:1004-1006` (cross-link "View changeover record") | `changeover_detail_modal` (`oee/modals.jsx:261-298`) | P1 |
| OEE-M-007 | Heatmap Cell Drill-down | OEE-002 cell hover/click pre-navigation | `15-OEE-UX.md:476-486` (drill behaviour) | `cell_drill_modal` (`oee/modals.jsx:300-326`) | P1 |
| OEE-M-008 | Request Edit Escalation | OEE-M-001 after 1h edit window expires | `15-OEE-UX.md:865` (OQ-OEE-04 decision) | `request_edit_modal` (`oee/modals.jsx:328-348`) | P1 |
| OEE-M-009 | Copy KPIs to Clipboard | OEE-001/003 `[Copy ▼]` micro-share | (referenced as P1 ergonomics, no dedicated UX line) `[NO-UX-YET]` | `copy_clipboard_modal` (`oee/modals.jsx:372-408`) | P1 |
| OEE-M-010 | Compare Weeks (heatmap) | OEE-002 `[Compare weeks]` | `15-OEE-UX.md:1292` (P1.5 backlog reference) | `compare_weeks_modal` (`oee/modals.jsx:410-446`) | P1.5 (BL-OEE-05) |
| OEE-M-011 | Acknowledge Anomaly | OEE-P2-A row `[Ack]` | (P2 placeholder area) | `acknowledge_anomaly_modal` (`oee/modals.jsx:448-484`) | P2 |
| OEE-M-012 | Auto-refresh Pause | OEE-001/002/003 header `[Pause refresh]` | (P1 ergonomics — UX silent) `[NO-UX-YET]` | `auto_refresh_pause_modal` (`oee/modals.jsx:486-509`) | P1 |

**TODO OEE-PRD-AMEND-02:** Add UX surface lines for OEE-M-009 (Copy clipboard) and OEE-M-012 (Auto-refresh pause) — they currently exist only as prototypes; PRD acknowledges them as P1 ergonomics, but UX file does not enumerate. Non-blocking for P1 because both are pure-client ergonomics with no server contract.
**TODO OEE-PRD-AMEND-03:** OEE-M-010 (Compare Weeks) is currently P1.5 backlog (BL-OEE-05) — confirm whether the diff view ships with 15-a or slips to 15-c. Default: 15-c stub modal that links to OEE-002 with `?compareWeekA=` URL params.

### 15.5 Tabs / sub-views inside OEE-003 [UNIVERSAL]

OEE-003 (Per-day Summary) hosts three tabs that the prototype implements as separate components but PRD §4.1 #9 / §15.1 references only as "tabs". Anchoring them so prototypes are not orphaned:

| Tab ID | Tab Name | UX line | Prototype | Notes |
|---|---|---|---|---|
| OEE-003.T1 | Summary (default) | `15-OEE-UX.md:528-674` | `oee_daily_summary_page` (`oee/dashboard.jsx:1-198`) | Sortable table + factory avg footer row |
| OEE-003.T2 | Six Big Losses | `15-OEE-UX.md:1037` | `six_big_losses_tab` (`oee/dashboard.jsx:200-306`) | Pareto bar chart; classification driven by OEE-M-005 mapping |
| OEE-003.T3 | Changeover Analysis | `15-OEE-UX.md:1041` | `changeover_tab` (`oee/dashboard.jsx:308-390`) | Consumer 08-PROD `changeover_events`; opens OEE-M-006 |

OEE-003.T2 (Six Big Losses) is also the **P1 interim home for the Pareto loss view** while OEE-P2-C (`/oee/pareto`) remains a P2 placeholder shell — see Severity #20 in the audit. The decomposition is intentional and locked.

### 15.6 P2 Placeholder Shell pattern [UNIVERSAL]

OEE-P2-A..D placeholders share a generic `<P2Placeholder>` shell (prototype `p2_placeholder_shell`, `oee/screens.jsx:902-948`). PRD-level expectation: every P2 route renders the shell with feature-flag check (`oee.anomaly_detection_enabled`, `oee.equipment_health_enabled`, `oee.tv_dashboard_enabled`) and an explicit cross-link to the P1 interim equivalent (e.g., OEE-P2-C → `[Go to Six Big Losses tab →]` per UX:960). This pattern is **not a separate screen ID** — it is a shared layout primitive used by OEE-P2-A/B/C/D and by `[NO-PROTOTYPE-YET]` rows above.

### 15.7 UI surfaces traceability matrix (bidirectional PRD ↔ UX ↔ prototype) [UNIVERSAL]

| PRD ID | UX line | Prototype label | Phase | Status |
|---|---|---|---|---|
| OEE-001 | `15-OEE-UX.md:254-393` | `oee_line_trend_page` (`oee/screens.jsx:3-209`) | P1 | OK |
| OEE-001a | (cross-link from OEE-001 §15.4 PRD bullet, no standalone UX yet) `[NO-UX-YET]` | `oee_availability_drilldown_page` (`oee/screens.jsx:471-543`) | P1 | Anchored 2026-04-30 (TODO: add to UX §3) |
| OEE-001b | `[NO-UX-YET]` | `oee_performance_drilldown_page` (`oee/screens.jsx:546-598`) | P1 | Anchored 2026-04-30 (TODO: add to UX §3) |
| OEE-001c | `[NO-UX-YET]` | `oee_quality_drilldown_page` (`oee/screens.jsx:600-655`) | P1 | Anchored 2026-04-30 (TODO: add to UX §3) |
| OEE-002 | `15-OEE-UX.md:395-525` | `oee_shift_heatmap_page` (`oee/screens.jsx:211-377`) | P1 | OK |
| OEE-003 | `15-OEE-UX.md:526-717` | `oee_daily_summary_page` (`oee/dashboard.jsx:1-198`) | P1 | OK |
| OEE-003.T1 | `15-OEE-UX.md:528-674` | `oee_daily_summary_page` | P1 | OK |
| OEE-003.T2 | `15-OEE-UX.md:1037` | `six_big_losses_tab` (`oee/dashboard.jsx:200-306`) | P1 | OK |
| OEE-003.T3 | `15-OEE-UX.md:1041` | `changeover_tab` (`oee/dashboard.jsx:308-390`) | P1 | OK |
| OEE-ADM-001 | `15-OEE-UX.md:719-803` | `oee_settings_page` (`oee/screens.jsx:698-833`) | P1 | OK |
| OEE-ADM-002 | `15-OEE-UX.md:805-834` | `oee_shift_configs_page` (`oee/screens.jsx:836-900`) | P1 | OK (read-only viewer) |
| OEE-ADM-003 | `15-OEE-UX.md:805-834` (cross-link, dedicated UX section pending) `[NO-UX-YET]` | `shifts_screen` (`settings/org-screens.jsx:255-306`, **moved to `prototype-index-oee.json` 2026-04-30**) | P1 | Anchored 2026-04-30 (TODO OEE-PRD-AMEND-01) |
| OEE-M-001 | `15-OEE-UX.md:836-885` | `annotate_downtime_modal` (`oee/modals.jsx:19-93`) | P1 | OK |
| OEE-M-002 | `15-OEE-UX.md:887-927` | `export_oee_modal` (`oee/modals.jsx:95-161`) | P1 | OK |
| OEE-M-003 | `15-OEE-UX.md:719-761` | `line_override_modal` (`oee/modals.jsx:163-204`) | P1 | Anchored 2026-04-30 |
| OEE-M-004 | `15-OEE-UX.md:719-761` | `delete_override_modal` (`oee/modals.jsx:350-370`) | P1 | Anchored 2026-04-30 |
| OEE-M-005 | `15-OEE-UX.md:762-803` | `big_loss_mapping_modal` (`oee/modals.jsx:206-259`) | P1 | Anchored 2026-04-30 |
| OEE-M-006 | `15-OEE-UX.md:1004-1006` | `changeover_detail_modal` (`oee/modals.jsx:261-298`) | P1 | Anchored 2026-04-30 |
| OEE-M-007 | `15-OEE-UX.md:476-486` | `cell_drill_modal` (`oee/modals.jsx:300-326`) | P1 | Anchored 2026-04-30 |
| OEE-M-008 | `15-OEE-UX.md:865` | `request_edit_modal` (`oee/modals.jsx:328-348`) | P1 | Anchored 2026-04-30 |
| OEE-M-009 | `[NO-UX-YET]` | `copy_clipboard_modal` (`oee/modals.jsx:372-408`) | P1 | Anchored 2026-04-30 (TODO OEE-PRD-AMEND-02) |
| OEE-M-010 | `15-OEE-UX.md:1292` | `compare_weeks_modal` (`oee/modals.jsx:410-446`) | P1.5 | Backlog (BL-OEE-05) |
| OEE-M-011 | (P2 placeholder area) | `acknowledge_anomaly_modal` (`oee/modals.jsx:448-484`) | P2 | Anchored 2026-04-30 |
| OEE-M-012 | `[NO-UX-YET]` | `auto_refresh_pause_modal` (`oee/modals.jsx:486-509`) | P1 | Anchored 2026-04-30 (TODO OEE-PRD-AMEND-02) |
| OEE-P2-A | `15-OEE-UX.md:932-947` | `oee_anomaly_detection_page` (`oee/screens.jsx:950-995`) + `p2_placeholder_shell` shell | P2 | OK |
| OEE-P2-B | `15-OEE-UX.md:948-953` | `oee_equipment_health_page` (`oee/screens.jsx:997-1036`) + shell | P2 | OK |
| OEE-P2-C | `15-OEE-UX.md:954-961` | `oee_downtime_pareto_page` (`oee/screens.jsx:379-469`) + shell | P2 (P1 interim via OEE-003.T2) | OK |
| OEE-P2-D | `15-OEE-UX.md:962-975` | `oee_tv_dashboard_page` (`oee/screens.jsx:1038-1080`) + shell | P2 | OK (BL-OEE-06 OS open) |
| `/oee/benchmark` | `[NO-UX-YET]` | `[NO-PROTOTYPE-YET]` | P2 | TODO OEE-PRD-AMEND-04 (industry benchmark spec) |
| `/oee/forecast` | `[NO-UX-YET]` | `[NO-PROTOTYPE-YET]` | P3+ | OK (R12 ML roadmap dependency) |
| `/oee/rules-config` | `[NO-UX-YET]` | `[NO-PROTOTYPE-YET]` | P2 | TODO OEE-PRD-AMEND-05 (tenant-admin anomaly/maintenance threshold UI) |

**Markers:** `[UNIVERSAL]` / `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` per ADR-034 (generic product lifecycle naming and industry configuration). `[APEX-CONFIG]` retained on legacy bullets for traceability — read as `[ORG-CONFIG]` exemplar bound to launch tenant Apex UK. No content removed during this 2026-04-30 reconciliation pass.

---

## 16. Build Roadmap & Sub-modules 15-a..c

### Sub-module 15-a — Core Dashboards (4-5 sesji impl) [P1]

**Scope:**
- 2 dashboards: Per-line 24h Trend (OEE-001), Per-shift Heatmap (OEE-002)
- API endpoints: `/api/oee/line/[id]/trend`, `/api/oee/heatmap`
- D3.js components: multi-line chart, heatmap grid
- `oee_shift_metrics` MV + `shift_aggregator_v1` DSL rule (P1 active)
- `shift_configs` reference table (02-SET extension)
- Site_id extension dla `oee_snapshots` (ALTER TABLE)
- Rule `report_access_gate_v1` reuse (z 12-REPORTING)

**Blocking:** Wymaga 08-PROD sub-module f (`oee_snapshots` + cron job) + 02-SET sub-module b (reference tables)
**Unblocks:** 15-b, 12-REPORTING sub-module b (OEE Summary consumer)

### Sub-module 15-b — Daily Summary + Export (3-4 sesji impl) [P1]

**Scope:**
- Dashboard: Per-day OEE Summary (OEE-003)
- `oee_daily_summary` MV + refresh cron
- API endpoint: `/api/oee/daily`
- Sparkline components (Recharts)
- Export reuse 12-REPORTING export engine
- `oee_alert_thresholds` reference table (02-SET extension, L2 per-line)
- `oee_outbox_events` table + outbox dispatcher integration

**Blocking:** Wymaga 15-a + 12-REPORTING sub-module d (export engine)
**Unblocks:** 15-c P2 stub

### Sub-module 15-c — P2 Stubs + Integration Hooks (2-3 sesji impl) [P1 scaffold]

**Scope:**
- `oee_anomalies` + `oee_ewma_state` tables (P2 stubs)
- `oee_anomaly_detector_v1` DSL rule registered as P2 stub w 02-SET §7.8
- `oee_maintenance_triggers` + `oee_maintenance_trigger_v1` rule registered P2 stub
- P2 dashboard placeholder routes (feature flag gated)
- Changeover analysis basic view (consumer `changeover_events` from 08-PROD)

**Blocking:** 15-b
**Unblocks:** Full P1 deployment, unblocks 13-MAINT consumer (when implemented)

### Total P1 estimate: 9-12 sesji

### P2 Build (post-P1)

| Sub-module | Scope | Est. sesji |
|---|---|---|
| 15-D | Anomaly Detection full impl (EWMA, alerts, acknowledgment workflow) | 3-4 |
| 15-E | Real-time TV Dashboard (plant-floor kiosk) | 2-3 |
| 15-F | Custom Shift Configs L2 (non-3-shift patterns) | 2 |
| 15-G | Maintenance Trigger full impl (13-MAINT consumer) | 2-3 |
| 15-H | Per-product OEE + active_wo_id drill-down | 2 |
| 15-I | Pareto Analysis + Six Big Losses expansion | 2-3 |
| 15-J | Equipment Health dashboard (cross-13-MAINT) | 3-4 |
| 15-K | OEE Forecasting (Prophet P3+) | TBD |
| 15-L | Industry Benchmark comparison | 2 |
| 15-M | ML Downtime Classification (R12 P3+) | TBD |

**Total P2 estimate:** 18-24 sesji

---

## 17. Resolved Decisions (formerly Open Questions — OQ-OEE-*)

9 z 10 pytań zamknięte na sesji stakeholderów 2026-04-21. 1 pytanie (OQ-OEE-03, TV OS) pozostaje otwarte — nie blokuje P1.

| ID | Pytanie | Status | Decyzja / Follow-up | Data |
|---|---|---|---|---|
| OQ-OEE-01 | Per-product OEE drill-down? | CLOSED — deferred P2 | Pozostaje P2, sub-module 15-H | 2026-04-21 |
| OQ-OEE-02 | Target OEE — 85% vs Apex ramp-up baseline? | CLOSED | P1 target = **70%**. `oee_alert_thresholds.oee_target_pct = 70`. Amber 55–70%, red <55% (proportional). Color scale fixed 65/85 (per OQ-OEE-07). | 2026-04-21 |
| OQ-OEE-03 | TV dashboard kiosk OS? | **OPEN** | Brak decyzji. Raspberry Pi / Windows kiosk / ChromeOS — wymaga Apex IT. Nie blokuje P1. | — |
| OQ-OEE-04 | Operator annotation edit window? | CLOSED | **1 godzina post-event**. Po 1h — read-only + `[Request Edit]` escalation do supervisora. | 2026-04-21 |
| OQ-OEE-05 | Changeover target duration — skad konfiguracja? | CLOSED | **02-SETTINGS `changeover_target_duration_min`** per line (optional per-FG override). Default null — brak breach detection jesli nie skonfigurowane. | 2026-04-21 |
| OQ-OEE-06 | Six Big Losses mapping — admin-configurable? | CLOSED | **Admin-configurable per tenant**. Mapping editor w OEE-ADM-001. Default seeded z industry standard. | 2026-04-21 |
| OQ-OEE-07 | Heatmap color scale — fixed 65/85 vs tenant-configurable? | CLOSED | **P1 fixed 65/85 industry thresholds**. P2 tenant-configurable via `oee_alert_thresholds`. | 2026-04-21 |
| OQ-OEE-08 | Push notifications — scope? | CLOSED | **P2 simplified**: in-app toast (12-REPORTING alert system) + daily email digest (OEE <60% sustained). Brak browser push, service worker, PWA, SMS. Opt-in per user. Triggers: OEE <60% sustained 15min, line DOWN >15min, changeover breach. | 2026-04-21 |
| OQ-OEE-09 | Sidebar — ANALYTICS czy OPERATIONS? | CLOSED | **OPERATIONS** (z 08-PRODUCTION). | 2026-04-21 |
| OQ-OEE-10 | OEE-003 default date — today czy yesterday? | CLOSED | **Yesterday** (morning review persona). Quick-switch `[Today]` / `[Yesterday]`. Ostatni wybor persisted w localStorage. | 2026-04-21 |

**1 otwarte pytanie (TV OS, OQ-OEE-03). Wszystkie pytania blokujące P1 zamknięte.**

---

## 18. Changelog

### v3.2.1 — 2026-04-30 (PRD↔UX reconciliation pass)

**Source:** `_meta/audits/2026-04-30-design-prd-coverage.md` §Module 15-OEE (~75% coverage flagged) + `_meta/audits/2026-04-30-prd-amendments-15-oee.md`.

**Additions to §15 Screens (no deletions, only ADD / RE-ORDER):**
- §15.3 — added OEE-ADM-003 (Shift Patterns + Non-Production Calendar; absorbs `settings_shifts_screen` moved 2026-04-30 from `prototype-index-settings.json` to `prototype-index-oee.json`).
- §15.3 — added OEE-001a / OEE-001b / OEE-001c (A/P/Q drill-down sub-screens) anchoring `oee_availability_drilldown_page`, `oee_performance_drilldown_page`, `oee_quality_drilldown_page`.
- §15.4 — enumerated OEE-M-003..OEE-M-012 modal contracts (previously only OEE-M-001/002 named) anchoring 10 prototype modals: `line_override_modal`, `delete_override_modal`, `big_loss_mapping_modal`, `changeover_detail_modal`, `cell_drill_modal`, `request_edit_modal`, `copy_clipboard_modal`, `compare_weeks_modal`, `acknowledge_anomaly_modal`, `auto_refresh_pause_modal`.
- §15.5 — anchored OEE-003 tabs (T1/T2/T3) for `oee_daily_summary_page` / `six_big_losses_tab` / `changeover_tab`.
- §15.6 — documented `p2_placeholder_shell` as a shared layout primitive (not a new screen ID).
- §15.7 — added bidirectional UI surfaces traceability matrix (PRD ↔ UX line ↔ prototype label ↔ phase ↔ status) covering all 27 entries in `prototype-index-oee.json`.

**TODOs created (5):**
- TODO OEE-PRD-AMEND-01: confirm canonical owner of `org_non_production_days` (15-OEE OEE-ADM-003 vs 02-SETTINGS §8.1).
- TODO OEE-PRD-AMEND-02: add UX surface lines for OEE-M-009 (Copy clipboard) + OEE-M-012 (Auto-refresh pause).
- TODO OEE-PRD-AMEND-03: confirm OEE-M-010 (Compare Weeks) ships with 15-a or slips to 15-c stub.
- TODO OEE-PRD-AMEND-04: spec `/oee/benchmark` (currently `[NO-PROTOTYPE-YET]` P2).
- TODO OEE-PRD-AMEND-05: spec `/oee/rules-config` (currently `[NO-PROTOTYPE-YET]` P2).

**ADR-034 hygiene:**
- New §15 sections tagged with `[UNIVERSAL]` / `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` per ADR-034 generic-product-lifecycle-naming convention.
- Holiday seed packs (UK / EU / US) tagged `[INDUSTRY-CONFIG]`; per-tenant rota tagged `[ORG-CONFIG]`; reference tables tagged `[UNIVERSAL]`.
- Existing `[APEX-CONFIG]` markers retained for traceability with read-as-`[ORG-CONFIG]` equivalence note (matches 08-PRODUCTION v3.1.1 pattern).

**Coverage delta (per audit + amendment doc):**
- Before: ~75% PRD-coded coverage; 4 prototype orphans flagged (`shifts_screen` mis-tag, `oee_availability_drilldown_page`, `oee_performance_drilldown_page`, `oee_quality_drilldown_page`) plus 8 unanchored modals.
- After: ≥ 90% — all 27 entries in `prototype-index-oee.json` referenced by a PRD screen/modal/tab ID; only `[NO-PROTOTYPE-YET]` rows remain (`/oee/benchmark`, `/oee/forecast`, `/oee/rules-config`) with explicit TODOs.

**No changes to:**
- §1–§14 (executive summary, decisions, rules, flows, data model, APIs, KPIs, integrations, regulatory).
- §16 Build Roadmap (sesji estimate unchanged — new screens slot into existing sub-modules 15-a/b without changing 9-12 sesji P1 budget).
- §17 Open Questions (still 1 open: OQ-OEE-03 TV OS).
- DSL rule list (still 3: shift_aggregator_v1 P1, oee_anomaly_detector_v1 P2 stub, oee_maintenance_trigger_v1 P2 stub).

### v3.2 — 2026-04-30 (Standardization for multi-industry manufacturing operations pattern)

**Naming convention updates (UNIVERSAL):**
- **FA → FG:** Updated all finished goods references (§4.1 #8, §4.2 #8, §16-build roadmap)
  - Changeover target duration: "with optional per-FG override" (was per-FA)
  - Per-product OEE drill-down scope: "per FG/SKU" (was per FA/SKU)
- **PR → WIP:** All production run / intermediate product references already use operational-level metrics (no PR-specific code examples in OEE context; WIP tracking via `oee_snapshots.active_wo_id` from work order system)
- **Process_X → Manufacturing_Operation_X:** No direct process-level references in OEE scope (OEE aggregated per-line, not per-operation; operations tracked in 02-SETTINGS Reference.ManufacturingOperations)
- **WIP code pattern:** Validated against format WIP-<2-letter-suffix>-<7-digit-sequence> (applicable to operational WO codes; OEE measures aggregates across line-level operations)

**Per-operation metrics clarification:**
- OEE in 15-OEE scope operates at **line level** (not individual operation level). Per-operation metrics enabled through:
  - `oee_snapshots.active_wo_id` → join to 04-PLAN work orders → operation reference
  - §9.4 per-line `oee_alert_thresholds` (line_id TEXT, not operation_id)
  - P2 extension (15-H sub-module 15-H) enables per-product drill-down (which may reference FG code + manufacturing operations)

**Cross-reference validation:**
- ✓ 01-NPD v3.2: intermediate codes, manufacturing operations (OEE doesn't directly encode; reads from 04-PLAN/03-TECHNICAL)
- ✓ 02-SETTINGS v3.4 §8.9: Reference.ManufacturingOperations (informational; OEE line_id is independent identifier)
- ✓ 08-PRODUCTION v3.1: changeover gate metrics (consumer 15-OEE, allergen_changeover_gate_v1 rule)
- ✓ 12-REPORTING v3.1: dashboard example alignment (oee_daily_summary consumer, OEE-003 summary dashboard)
- ✓ 00-FOUNDATION v4.0 §9.1: Manufacturing Operations pattern (OEE architecture unchanged; per-operation OEE deferred P2)

**No changes to:**
- OEE calculation formula (A×P×Q ÷ 10000 remains; §9.1 GENERATED ALWAYS constraint preserved)
- Digital twin architecture (§8 data flows unchanged)
- Real-time streaming logic (60s per-minute batch aggregation by 08-PROD)
- ML feature engineering (EWMA anomaly detection, P2 rule spec)
- Time-series aggregation (shift_aggregator_v1 rule logic, P1 DSL)
- Dashboard architecture (example KPI names use line_id + shift_id + metric, consistent with v3.1)

**Version bump rationale:**
- Standardization is metadata/documentation alignment (no breaking changes)
- All code examples and references already use line-level identifiers
- Minor clarification: per-operation OEE deferred to P2 sub-module 15-H (not in v3.2 scope)
- No database schema migration required

### v3.1 — 2026-04-21 (Stakeholder decisions session — 9/10 OQ resolved)

**Decisions applied (no breaking changes — refinements only):**
- **OQ-OEE-01 CLOSED:** Per-product OEE deferred P2 (sub-module 15-H). No spec change.
- **OQ-OEE-02 CLOSED:** P1 OEE target = **70%** (Apex ramp-up baseline). `oee_alert_thresholds.oee_target_pct` default updated from 85 → 70. §9.4 SQL default updated. §4.1 scope table updated. §13.1 color table note added. Conflict noted: target 70% vs fixed color scale 65/85 (intentional per OQ-OEE-07).
- **OQ-OEE-03 OPEN:** TV OS — no decision. No change.
- **OQ-OEE-04 CLOSED:** Annotation edit window = **1 hour post-event**. Read-only after 1h + `[Request Edit]` escalation.
- **OQ-OEE-05 CLOSED:** Changeover target = **02-SETTINGS `changeover_target_duration_min`** per line. §4.1 scope entry #8 updated. 02-SETTINGS-PRD new field added.
- **OQ-OEE-06 CLOSED:** Six Big Losses mapping = **admin-configurable per tenant**. OEE-ADM-001 mapping editor added (in UX spec). §4.1 scope entry #9 updated.
- **OQ-OEE-07 CLOSED:** Heatmap color scale = **fixed 65/85 P1**; P2 tenant-configurable. §13.1 note added.
- **OQ-OEE-08 CLOSED:** Notifications = **P2 simplified** (in-app toast + email digest only). No browser push / PWA / SMS. Triggers: OEE <60% sustained 15min, line DOWN >15min, changeover breach.
- **OQ-OEE-09 CLOSED:** Sidebar = **OPERATIONS** group.
- **OQ-OEE-10 CLOSED:** OEE-003 default = **yesterday**. `[Today]`/`[Yesterday]` quick-switch. localStorage persist.
- §17 Open Questions → converted to Resolved Decisions table.

### v3.0 — 2026-04-20 (Phase C5 Sesja 1, new PRD from scratch)

**Creation:**
- First-ever 15-OEE PRD. Module identified w 00-FOUNDATION §4.2 (module #15 z 15-module Phase D map) + placeholder spec w 08-PRODUCTION §13 (D7 per-minute aggregation).
- 3 P1 dashboards + 10 P2 dashboards scoped
- 7 D-OEE decisions
- 2 DSL rules registered w 02-SETTINGS §7.8 (1 P1 active + 1 P2 stub + 1 P2 consumer link)
- 20 V-OEE validation rules
- 3 sub-modules P1 (15-a..c est. 9-12 sesji impl)
- 2 nowe reference tables dla 02-SETTINGS §8.1: `shift_configs`, `oee_alert_thresholds`
- 1 nowa outbox table: `oee_outbox_events`
- 2 materialized views P1: `oee_shift_metrics`, `oee_daily_summary`
- 3 support tables P2: `oee_anomalies`, `oee_ewma_state`, `oee_maintenance_triggers`

**Cross-PRD impact:**
- 02-SETTINGS v3.1 → v3.2 delta (2 nowe rules, 2 nowe ref tables — bundled w C5 Sesja 1 close)
- 12-REPORTING v3.0 D-RPT-9 consumer relationship established (reads `oee_daily_summary`)
- 08-PRODUCTION v3.0 `oee_snapshots` site_id ALTER TABLE addition
- 13-MAINTENANCE P2 consumer hook established (via `oee_maintenance_trigger_v1` rule)

---

## 19. References

### Dependencies (upstream PRDs)

- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — R1 event-first, R4 Zod, R6 PostHog, R7 data residency, R12 ML roadmap
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.1 (→v3.2 post-this-session) — §7.8 rules registry (shift_aggregator_v1, oee_anomaly_detector_v1, oee_maintenance_trigger_v1), §8.1 reference tables (shift_configs, oee_alert_thresholds, downtime_categories, target_kpis), §10 feature flags (`oee.anomaly_detection_enabled`, `oee.tv_dashboard_enabled`), §13 EmailConfig (Resend dla alerts)
- [`08-PRODUCTION-PRD.md`](./08-PRODUCTION-PRD.md) v3.0 — §9.9 oee_snapshots (PRIMARY source), §9.6 downtime_events, §9.7 changeover_events, §13 D7 per-minute aggregation, §9.12 operator_kpis_monthly, D6 downtime taxonomy, D15 EWMA anomaly spec
- [`12-REPORTING-PRD.md`](./12-REPORTING-PRD.md) v3.0 — D-RPT-9 OEE consumer integration, report_access_gate_v1 reuse, export engine reuse

### Downstream consumers

- [`12-REPORTING-PRD.md`](./12-REPORTING-PRD.md) v3.0 — reads `oee_daily_summary` dla Factory Overview card (dashboard #1) + OEE Summary dashboard (#5 P1)
- [`13-MAINTENANCE-PRD.md`](./13-MAINTENANCE-PRD.md) (Phase C5 Sesja 2 deliverable, not yet written) — P2 consumer `oee_shift_metrics` dla MTBF/MTTR + `oee_maintenance_trigger_v1` rule creates PM WOs
- [`14-MULTI-SITE-PRD.md`](./14-MULTI-SITE-PRD.md) (Phase C5 Sesja 2 deliverable) — P2 per-site OEE rollup consumer

### ADRs

- ADR-028 (schema-driven L1-L4) — L2 tenant shift_configs + oee_alert_thresholds
- ADR-029 (rule engine DSL + workflow-as-data) — `shift_aggregator_v1`, `oee_anomaly_detector_v1`, `oee_maintenance_trigger_v1`
- ADR-030 (configurable depts/modules) — per-tenant shift config variation
- ADR-031 (schema variation per org) — OEE thresholds per line (L2)

### Research

- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) — §9 "15-OEE", R12 ML roadmap, §6 analytics stack

### Industry standards referenced

- **SEMI E10** (Semiconductor Equipment Metrics) — OEE calculation standard applied across industries
- **Nakajima (1988) "Introduction to TPM"** — original OEE definition: Availability × Performance × Quality
- **World-class threshold** — OEE ≥ 85% (industry accepted food-mfg benchmark)
- **EWMA control chart** — simple anomaly detection technique, standard in statistical process control

### Strategic Decisions (Phase 0)

- Decision #5: Multi-tenant from day 1 — OEE dashboards support per-tenant config via 02-SETTINGS L2
- Decision #6: Universal templates + metadata-driven — OEE dashboards metadata-driven via 02-SET `dashboards_catalog` registry
- Decision #7: Custom workflows = data — shift_aggregator_v1 rule = workflow-as-data

### Cross-PRD rules registry (reference, 02-SET §7.8)

| Rule | Owner | Type | Status |
|---|---|---|---|
| **`shift_aggregator_v1`** | **15-OEE** | **P1 active** | **Registered (this session)** |
| **`oee_anomaly_detector_v1`** | **15-OEE** | **P2 stub** | **Registered (this session)** |
| **`oee_maintenance_trigger_v1`** | **15-OEE** | **P2 stub (13-MAINT consumer)** | **Registered (this session)** |
| `report_access_gate_v1` | 12-REPORTING | P1 active | Consumed (RBAC reuse) |

---

_PRD 15-OEE v3.2 — 3 P1 dashboards + 10 P2 dashboards scoped, 7 D-OEE decisions, 3 DSL rules registered (1 P1 active + 2 P2 stub), 20 V-OEE validation rules, 3 sub-modules P1 (15-a..c est. 9-12 sesji impl), 10 P2 sub-modules (15-D..15-M est. 18-24 sesji), BRCGS 7y retention, consumer 08-PROD per-minute aggregation, producer 12-REPORTING (D-RPT-9) + 13-MAINT P2 trigger + 14-MULTI-SITE P2 rollup. Standardized for multi-industry manufacturing operations: FA→FG, all code examples use line-level aggregation (per-operation OEE deferred P2)._
