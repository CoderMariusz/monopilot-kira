# HANDOFF — Phase C5 Sesja 1 CLOSE → C5 Sesja 2 bootstrap

**From:** Phase C5 Sesja 1 (2026-04-20) — 12-REPORTING writing + 15-OEE writing (from scratch) + 02-SETTINGS v3.2 bundled delta
**To:** Phase C5 Sesja 2 — 13-MAINTENANCE + 14-MULTI-SITE bundled
**Phase:** C4 CLOSED → **C5 Sesja 1 CLOSED** → C5 Sesja 2 NEXT

---

## 🏁 Phase C5 Sesja 1 COMPLETE

### Deliverables primary (2 PRDs)

**`12-REPORTING-PRD.md` v3.0** — ~930 linii, 19 sekcji (Phase D convention), **10 P1 dashboards** + 20 P2 dashboards/features. Rewrite baseline v1.0 (554 linii, 6 epics) → Phase D full convention. **10 D-RPT decisions** (D-RPT-1..8 retained + D-RPT-9 OEE Consumer Integration NEW + D-RPT-10 Feature Flag Rollout NEW). 2 DSL rules registered w 02-SET §7.8: `report_access_gate_v1` (P1 active), `scheduled_report_distribution_v1` (P2 stub). 25 V-RPT validation rules (access/query/export/refresh/schedule/site/metadata). 5 sub-modules build 12-a..e (17-22 sesji impl P1) + 11 P2 sub-modules 12-F..12-O (33-43 sesji impl). BRCGS 7y retention, 21 CFR Part 11 e-sig P2, FSMA 204 P2, EU 1169/2011 P2, GDPR anonymize toggle, R7 data residency enforced.

**`15-OEE-PRD.md` v3.0** — ~1020 linii, 19 sekcji (Phase D convention), **new PRD from scratch** (baseline: brak, tylko placeholder w 00-FOUNDATION §4.2 + 08-PROD §13 D7 per-minute aggregation spec). **3 P1 dashboards** (Per-line 24h Trend, Per-shift Heatmap, Per-day Summary) + 10 P2 dashboards scoped. **7 D-OEE decisions** (D-OEE-1..7). 3 DSL rules registered w 02-SET §7.8: `shift_aggregator_v1` (P1 active), `oee_anomaly_detector_v1` (P2 stub), `oee_maintenance_trigger_v1` (P2 stub — 13-MAINT consumer link). 20 V-OEE validation rules. 3 sub-modules build 15-a..c (9-12 sesji impl P1) + 10 P2 sub-modules 15-D..15-M (18-24 sesji impl). 2 materialized views P1: `oee_shift_metrics`, `oee_daily_summary`. 3 P2 tables: `oee_anomalies`, `oee_ewma_state`, `oee_maintenance_triggers`. 1 outbox table `oee_outbox_events`. 2 reference tables extracted do 02-SET §8.1.

### Deliverable secondary (bundled)

**`02-SETTINGS-PRD.md` v3.2 delta** — frontmatter bump v3.1 → v3.2 + 5 nowych rules w §7.8 (tabela 17→22) + 3 nowe reference tables w §8.1 (tabela 17→20) + Changelog v3.2 entry. Zmiany:
- **§7.8 Rules Registry:** 17 rules → **22 rules** (16 P1 active + 6 P2 stub). Dodane: `report_access_gate_v1` (12-REP P1), `scheduled_report_distribution_v1` (12-REP P2), `shift_aggregator_v1` (15-OEE P1), `oee_anomaly_detector_v1` (15-OEE P2), `oee_maintenance_trigger_v1` (15-OEE P2). Producer modules: 7 → **9** (dodane 12-REPORTING, 15-OEE).
- **§8.1 Reference Tables:** 17 → **20 tabel**. Dodane: `dashboards_catalog` (12-REP metadata-driven access), `shift_configs` (15-OEE L2 ADR-030), `oee_alert_thresholds` (15-OEE per-line L2 ADR-031).
- **§11.8 INTEGRATIONS stages summary:** bez zmian (12-REPORTING = read-only consumer, 15-OEE = internal outbox only, brak new D365 stages).
- **Changelog:** v3.2 entry dodana. Bundled revision pattern consistent z v3.1 (C4 Sesja 3 close) — oszczędność 1 sesji vs separate revision.

### Kluczowe decyzje C5 Sesja 1 (recommended defaults user-approved 2026-04-20)

#### 12-REPORTING (Q1-Q6)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 Engine** | **A** Postgres MVs P1 + Metabase/Grafana external embed P2 feature-flag `external_bi.enabled` | D-RPT-8 baseline, MES-TRENDS buy/build (custom dla differentiation), gotowe pg_cron MV refresh |
| **Q2 Catalog P1** | **Minimal 10 dashboards** (Factory Overview, Yield-by-Line, Yield-by-SKU, QC Holds, OEE Summary, Inventory Aging, WO Status, Shipment OTD, Integration Health, Rules Usage) | Unblock build; P2 rozszerzenie do 20+ (Giveaway, Leader Scorecard, Budget) |
| **Q3 Custom Builder** | **P1 simple** (filters + column picker metadata-driven) + **P2 DSL SQL-like**. P3 visual (Looker-like) **wycofane** | Prostsze P1, metadata-driven per ADR-028 |
| **Q4 Export P1** | **A** CSV + PDF P1 (html2pdf edge function). Excel/XLSX + JSON/Parquet → P2 | Minimal P1, export audit w `report_exports` sha256_hash + 7y retention |
| **Q5 Scheduled** | **P1 manual trigger** + P2 cron+email (Resend z 02-SET §13). P3 Slack/Teams **wycofane** | Unblock P1, email infra ready |
| **Q6 Per-org dash** | **P1 fixed templates** + P2 per-org customization (ADR-031 L2) | Phase 2 post-multi-tenant maturity |

#### 15-OEE (Q7-Q10)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q7 Timing** | **P1 per-minute Postgres batch** (consumer 08-PROD D7 Q4 A, zero new infra) + P2 streaming (Kafka/Redpanda) **wycofane** z P1 | Template reuse, 60s granularity sufficient food-mfg |
| **Q8 Visualization** | **P1 desktop dashboards** (per-line 24h trend + per-shift heatmap + per-day summary) + **P2 real-time TV** plant-floor screens (auto-refresh 30s, full-screen, kiosk mode) | MVP P1 operator-friendly, TV P2 post-hardware provisioning |
| **Q9 Downtime** | **P1 consumer** `downtime_categories` ref table (02-SET §8.1 admin-configurable per 08-PROD D6) + **P2 ML classification wycofane** do P3+ | Zero-new-infra P1, ML wymaga >6 mo training data |
| **Q10 Shift comparison** | **P1 Forza 3-shift fixed** (AM 00:00-08:00 / PM 08:00-16:00 / Night 16:00-00:00 UTC) + **P2 custom shift configs** per tenant L2 variation (ADR-030) | Forza reality P1, L2 variation standard pattern |

### Core innovations 12-REPORTING v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **OEE Consumer Integration (D-RPT-9)** — Factory Overview + Shift Performance P2 embed OEE KPI card reading `oee_daily_summary` MV owned by 15-OEE (zero-duplicate aggregation) | §6, §9, §10 | [UNIVERSAL] |
| 2 | **Integration Health Dashboard (#9)** — cross-outbox UNION view z `items_outbox_events` + `production_outbox_events` + `shipping_outbox_events` + `finance_outbox_events` + DLQs. Per stage: pending/failed/dlq_depth/avg_latency_5min | §9, §12 | [LEGACY-D365] |
| 3 | **Rules Usage Analytics Dashboard (#10)** — consumer `rule_evaluations` audit (02-SET §7) — eval_count_24h, trigger_rate_pct, avg_latency_ms, rules never triggered | §9 | [UNIVERSAL] |
| 4 | **Feature Flag Rollout (D-RPT-10)** — PostHog self-host (R6) gates 6 flags (v2_dashboards, scheduled_delivery, external_bi_embed, custom_dsl_builder, leaderboard_anonymize, ml_anomaly_detection) | §6, §10 | [UNIVERSAL] |
| 5 | **Export audit + 21 CFR Part 11 ready** — `report_exports.sha256_hash` NOT NULL GENERATED + `retention_until` 7-year BRCGS + archive nightly cold storage | §9, §14 | [UNIVERSAL] |
| 6 | **10 P1 core dashboards + 25 V-RPT validation rules** (access/query/export/refresh/schedule/site/metadata) | §4, §11 | [UNIVERSAL] |
| 7 | **Metadata-driven catalog** — `dashboards_catalog` reference table (02-SET §8.1) z per-dashboard `required_role`, `feature_flag`, `enabled_for_tenants[]`, `metadata_schema` | §9, 02-SET §8.1 | [UNIVERSAL] |
| 8 | **No D365 Push** — reports stay internal, read-only consumer wszystkich stages | §12 | [UNIVERSAL] |
| 9 | **5 sub-modules build 12-a..e P1 (17-22 sesji impl)** + 11 P2 sub-modules 12-F..12-O (33-43 sesji impl) | §16 | [UNIVERSAL] |
| 10 | **GDPR anonymize toggle + R7 data residency enforced** | §5, §14 | [UNIVERSAL] |

### Core innovations 15-OEE v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Per-minute aggregation consumer (D-OEE-1)** — 15-OEE NIE implementuje własnej aggregation, czyta `oee_snapshots` produced by 08-PROD cron job (D7 Q4 A) | §6, §9 | [UNIVERSAL] |
| 2 | **`shift_aggregator_v1` DSL rule (P1 active)** — post-shift-end aggregation, configurable boundaries via `shift_configs` ref table (L2 ADR-030), emit outbox `oee.shift.aggregated` event | §7, §9, §10 | [UNIVERSAL] |
| 3 | **`oee_anomaly_detector_v1` DSL rule (P2 stub)** — EWMA α=0.3, 2σ threshold, rolling 30-min window (08-PROD D15 spec), alerts via Resend + Slack | §7, §10 | [UNIVERSAL] |
| 4 | **`oee_maintenance_trigger_v1` DSL rule (P2 stub, 13-MAINT consumer)** — availability < threshold 3 consecutive days → auto-create PM WO | §7, §10 | [UNIVERSAL] |
| 5 | **Real-time TV dashboard (D-OEE-4, P2)** — plant-floor 1920×1080 screens, kiosk mode, auto-refresh 30s, color-blind safe, no interactions | §6, §10 | [UNIVERSAL] + [FORZA-CONFIG] |
| 6 | **Shift comparison P1 fixed 3-shift** (Forza AM/PM/Night UTC baseline) + P2 custom shift configs L2 (2-shift/4-shift/24h) | §6, §13 | [UNIVERSAL] + [FORZA-CONFIG] |
| 7 | **3 P1 dashboards** (Per-line 24h Trend, Per-shift Heatmap, Per-day Summary) + 10 P2 dashboards | §10, §16 | [UNIVERSAL] |
| 8 | **2 P1 materialized views** — `oee_shift_metrics` (MTBF/MTTR ready 13-MAINT consumer) + `oee_daily_summary` (consumer 12-REPORTING D-RPT-9) | §9 | [UNIVERSAL] |
| 9 | **3 sub-modules build 15-a..c P1 (9-12 sesji impl)** + 10 P2 sub-modules 15-D..15-M (18-24 sesji impl) | §16 | [UNIVERSAL] |
| 10 | **Internal outbox only** — `oee_outbox_events` table (no D365 push, OEE = operational metric not accounting) | §12 | [UNIVERSAL] |
| 11 | **Industry-standard OEE color coding** (green ≥85% world-class / amber 65-85% / red <65% / purple 100% data error) + Six Big Losses basic view P1 | §13 | [UNIVERSAL] |
| 12 | **BRCGS 7y retention** `oee_daily_summary` + archive nightly (operational excellence evidence dla audit) | §14 | [UNIVERSAL] |
| 13 | **Downtime categorization consumer 02-SET** (NIE ML P1, P3+ backlog per R12) + hierarchical drill-down (parent_id chain) | §6, §9 | [UNIVERSAL] |

### Cross-PRD consistency enforced (C5 Sesja 1)

**12-REPORTING ↔ 15-OEE:**
- D-RPT-9 OEE Consumer Integration: 12-REPORTING Factory Overview (#1) + OEE Summary (#5) czytają `oee_daily_summary` MV owned by 15-OEE (single source of truth) ✅
- Shared cache invalidation: 15-OEE emit `oee.daily.refreshed` + `oee.shift.aggregated` → 12-REPORTING subscriber increments local cache counter ✅
- Export engine reuse: 15-OEE dashboards używają 12-REPORTING `/api/reporting/export` endpoint (code reuse, zero duplicate) ✅
- DSL rule reuse: 15-OEE API endpoints evaluują `report_access_gate_v1` (12-REPORTING owner) dla RBAC ✅

**12-REPORTING + 15-OEE ↔ 02-SETTINGS v3.2:**
- 12-REPORTING rejestruje 2 DSL rules w §7.8 (`report_access_gate_v1` P1, `scheduled_report_distribution_v1` P2) ✅
- 12-REPORTING dodaje 1 reference table §8.1: `dashboards_catalog` (metadata-driven access) ✅
- 15-OEE rejestruje 3 DSL rules w §7.8 (`shift_aggregator_v1` P1, `oee_anomaly_detector_v1` P2, `oee_maintenance_trigger_v1` P2) ✅
- 15-OEE dodaje 2 reference tables §8.1: `shift_configs`, `oee_alert_thresholds` ✅
- Total v3.2: 22 rules + 20 ref tables (16 P1 + 6 P2 rules) ✅

**12-REPORTING ↔ 08-PRODUCTION:**
- Consumer `wo_outputs` + `wo_consumptions` + `downtime_events` dla prod MVs ✅
- Consumer `production_outbox_events` dla Integration Health Dashboard ✅
- Consumer `operator_kpis_monthly` MV (D11) dla P2 Operator Leaderboard ✅

**12-REPORTING ↔ 09-QUALITY + 05-WAREHOUSE + 11-SHIPPING + 10-FINANCE:**
- QC Holds Dashboard (#4) consumer `quality_holds` + `hold_items` ✅
- Inventory Aging (#6) consumer `license_plates` (05-WH) ✅
- Shipment OTD (#8) consumer `shipments` + `sales_orders` + `shipping_outbox_events` ✅
- P2 WIP Dashboard consumer `wip_balances` (10-FIN) ✅
- P2 Lot Genealogy Report consumer `lot_genealogy` FSMA 204 CTE (05-WH §11) ✅

**15-OEE ↔ 08-PRODUCTION:**
- Primary consumer `oee_snapshots` (per-minute baseline, 08-PROD §9.9 + D7) ✅
- Consumer `downtime_events` (§9.6) + `changeover_events` (§9.7) ✅
- `oee_snapshots` site_id ALTER TABLE addition planowana (REC-L1 prep, ALTER DDL w 15-a sub-module) ✅

**15-OEE ↔ 13-MAINTENANCE (future consumer):**
- `oee_shift_metrics` MV wypełnia MTBF/MTTR stubs — 13-MAINT (C5 Sesja 2) będzie consumer ✅
- `oee_maintenance_trigger_v1` rule (P2) auto-creates PM WOs w 13-MAINT `maintenance_work_orders` ✅

**15-OEE ↔ 14-MULTI-SITE (future consumer):**
- `oee_snapshots.site_id` + MV filtering — 14-MULTI-SITE (C5 Sesja 2) będzie consumer dla per-site rollup ✅

### Resolved action items z C4 Sesja 3

- ✅ **C5 Sesja 1 bundled 02-SETTINGS v3.2 delta** — per pattern z v3.1 (C4 Sesja 3), wszystkie rules + ref tables z 12-REP + 15-OEE applied atomically w 1 edit batch
- ✅ **No new INTEGRATIONS stages** introduced — 12-REPORTING = read-only consumer, 15-OEE = internal outbox only. Stages summary §11.8 unchanged.

### New open items (OQ-RPT-01..10, OQ-OEE-01..10)

20 open items cumulative (10 per PRD), wszystkie P2 / P3 / post-launch. Nie blokuja C5 Sesja 2.

**Notable:**
- OQ-RPT-02: Event-triggered reports (wo.completed → auto-report) — P3
- OQ-RPT-04: Mobile-native dashboards (React Native) — P3 (PWA wystarcza)
- OQ-OEE-03: Target OEE 85% — Forza może mieć lower realistic baseline (np. 70%) — P1 config via `oee_alert_thresholds.oee_target_pct`
- OQ-OEE-05: TV dashboard kiosk OS (RPi / Windows / ChromeOS) — Forza IT consultation P2

---

## Phase C5 progress (updated)

| Batch | Status | Moduły | Sesji actual |
|---|---|---|---|
| **C5 Sesja 1** | ✅ **COMPLETE** | **12-REPORTING v3.0 + 15-OEE v3.0 + 02-SETTINGS v3.2 delta** | **1 (2026-04-20)** |
| **C5 Sesja 2** | ⏭ NEXT | 13-MAINTENANCE v3.0 + 14-MULTI-SITE v3.0 + potential 02-SETTINGS v3.3 delta | ~1-2 |
| **C5 CLOSED** | est. | batch 2-3 sesji (C5 Sesja 3 buffer if needed) | ~2-3 |

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) + C4 (3) + **C5 Sesja 1 (1)** = **10 sesji** (est. ~5-7, 3-5 over z Q&A thoroughness + cross-module integration + bundled revisions).

**Pozostało writing Phase C:** C5 Sesja 2 + (potentially Sesja 3 buffer) = **1-2 sesje**.

---

## Kumulatywne deliverables Phase B+C (post-C5 Sesja 1)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031 |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief + Allergens RM→FA + D365 Builder N+1 |
| 3 | **02-SETTINGS** | **v3.2** | **~1490** | **Schema admin wizard L1-L4, rules registry (22 rules cumulative), reference CRUD (20 tabel), D365 Constants baseline + 6 P2 ext, INTEGRATIONS stages summary (6 stages)** |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL, multi-LP GRN, lot genealogy |
| 7 | 06-SCANNER-P1 | v3.0 | 1504 | SCN-080 intermediate consume, 3-method input parity, PIN auth, LP lock |
| 8 | 07-PLANNING-EXT | v3.0 | 1368 | Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2 |
| 9 | 08-PRODUCTION | v3.0 | 2088 | Allergen changeover gate, INTEGRATIONS stage 2, per-minute OEE, BRCGS 7y audit |
| 10 | 09-QUALITY | v3.0 | 1739 | 3 DSL rules, 08-PROD E7 consumer, SCN-070..073 backend |
| 11 | 10-FINANCE | v3.0 | 1318 | Cascade cost rollup, FIFO+WAC parallel, INTEGRATIONS stage 5, 2 DSL rules |
| 12 | 11-SHIPPING | v3.0 | 1143 | Quality hold soft gate, INTEGRATIONS stage 3, EU 1169 labels, FSMA 204, EUDR P2 |
| 13 | **12-REPORTING** | **v3.0** | **~930** | **10 P1 dashboards + 20 P2 scoped, metadata-driven `dashboards_catalog`, OEE consumer integration, Integration Health + Rules Usage dashboards, export 7y retention** |
| 14 | **15-OEE** | **v3.0** | **~1020** | **Per-minute aggregation consumer (08-PROD D7), 3 P1 dashboards, `shift_aggregator_v1` + `oee_anomaly_detector_v1` + `oee_maintenance_trigger_v1` DSL rules, industry-standard A×P×Q, 7y retention operational evidence** |

**Total Phase B+C done:** **~19,276 linii PRD w 14 modułach** fundamentowych + operation + scheduling + quality + finance + shipping + reporting + OEE. **Phase C5 Sesja 1 CLOSED — 14/15 modułów PRD complete (93%).**

---

## Phase C5 Sesja 2 scope + bootstrap

### Scope C5 Sesja 2 (2 moduly, est. 1-2 sesji)

**Primary deliverables:**
- `13-MAINTENANCE-PRD.md` v3.0 — equipment calibration (09-QA §6 Q6 FK stub consumer), preventive maintenance, work requests, parts inventory, TPM (Total Productive Maintenance), MTBF/MTTR (15-OEE `oee_shift_metrics` consumer), IoT sensor integration P2 (cold chain BRCGS), `oee_maintenance_trigger_v1` rule consumer (P2), calibration_equipment reference table addition
- `14-MULTI-SITE-PRD.md` v3.0 — multi-site orchestration, inter-site transfers (05-WH TO), cross-site sales/production scheduling, hierarchy site→plant→line, multi-tenant L2 variation per site (ADR-030/031 consumer), `site_id` column activation across wszystkich modules (audit addition strategy), per-site OEE rollup (15-OEE consumer), per-tenant data residency (R7) consolidation

**Secondary deliverable:** Potentially 02-SETTINGS v3.3 bundled delta (if C5 Sesja 2 modules rejestrują new rules / reference tables — likely 13-MAINT `calibration_equipment` + `maintenance_priority_levels` + 14-MULTI-SITE `sites_hierarchy_config`).

**Est.** 1-2 sesje bundled (per C3 Sesja 1 precedent — 07-EXT + 08-PROD bundled w 1 sesji).

### Bootstrap C5 Sesja 2 (13-MAINT + 14-MULTI-SITE)

1. Read `_meta/handoffs/2026-04-20-c5-sesja1-close.md` (this file)
2. Read baseline `13-MAINTENANCE-PRD.md` pre-Phase-D (if exists, check size + structure)
3. Read baseline `14-MULTI-SITE-PRD.md` pre-Phase-D (if exists)
4. Read `15-OEE-PRD.md` v3.0 §7.3 `oee_maintenance_trigger_v1` (13-MAINT consumer) + §9.2 `oee_shift_metrics` MTBF/MTTR (13-MAINT consumer)
5. Read `09-QUALITY-PRD.md` v3.0 §6 Q6 equipment_calibration FK stub
6. Read `05-WAREHOUSE-PRD.md` v3.0 §6-10 (TO logic + LP lifecycle) — 14-MULTI-SITE consumer dla inter-site transfers
7. Read `00-FOUNDATION-PRD.md` v3.0 §4 module map positions 13/14
8. Read `_foundation/research/MES-TRENDS-2026.md` §9 "13-MAINTENANCE" + "14-MULTI-SITE" (R-decisions + regulatory)
9. Read `02-SETTINGS-PRD.md` v3.2 §9 (multi-tenant L2 config ADR-030/031 — 14-MULTI-SITE foundation)
10. Propose outlines per PRD → user Q&A → full write bundled (per C3 Sesja 1 pattern)
11. Apply potential 02-SETTINGS v3.3 delta (any new rules / ref tables)
12. Update memory + close HANDOFF → Phase C6 lock OR Phase E Build bootstrap (no C5 Sesja 3 if unneeded)

### Key dependencies handoff C5 Sesja 1 → C5 Sesja 2

| C5 Sesja 1 deliverable | C5 Sesja 2 consumer context |
|---|---|
| 15-OEE `oee_shift_metrics` MV (MTBF/MTTR stubs) | 13-MAINTENANCE primary consumer — MTBF/MTTR dashboards, PM scheduling optimization |
| 15-OEE `oee_maintenance_trigger_v1` rule (P2 stub) | 13-MAINTENANCE P2 activation — auto-PM WO generation endpoint |
| 12-REPORTING `dashboards_catalog` | 13-MAINT + 14-MULTI-SITE dashboards rejestrowane w catalog (cross-PRD RBAC) |
| 12-REPORTING export engine reuse | 13-MAINT calibration records export, 14-MULTI-SITE cross-site reports |
| 02-SETTINGS v3.2 §7.8 22 rules registry | Consumer context dla 13-MAINT (calibration_schedule_gate?) + 14-MULTI-SITE (site_access_policy?) new rules potential |
| 02-SETTINGS v3.2 §8.1 20 ref tables | Consumer context dla 13-MAINT (calibration_equipment, maintenance_priority_levels, spare_parts_categories) + 14-MULTI-SITE (sites_hierarchy_config) new tables potential |

### Key questions do rozstrzygnięcia w C5 Sesja 2 (13-MAINTENANCE + 14-MULTI-SITE)

**13-MAINTENANCE:**
- **Q1** Equipment calibration: P1 manual calendar + alerts / P2 IoT sensor auto-trigger?
- **Q2** PM scheduling engine: P1 calendar-based (interval days) / P2 usage-based (hours/cycles) / P3 condition-based (ML vibration analysis)?
- **Q3** Parts inventory tracking: P1 basic (qty_on_hand) / P2 consumption forecasting / P3 predictive (ML)?
- **Q4** TPM (Total Productive Maintenance) scope: P1 basic (reactive + preventive) / P2 comprehensive (5S + autonomous + planned + predictive)?
- **Q5** IoT sensor integration: P1 deferred / P2 basic (Modbus TCP / OPC UA wymagane dla Forza) / P3 full (vision + vibration + thermal)?
- **Q6** Work request vs work order: separate tables (WR needs approval → WO) / unified (WO lifecycle z state 'requested')?

**14-MULTI-SITE:**
- **Q7** Hierarchy depth: site → plant → line (3 levels Forza baseline) / 4 levels (site → building → plant → line) / configurable per tenant?
- **Q8** Inter-site transfers: P1 extension 05-WH TO (same pattern different site_id) / P2 dedicated cross-site workflow z customs / compliance (EU vs non-EU)?
- **Q9** Per-site data residency: single tenant = single region all sites / per-site residency (Forza UK + Forza EU site independent)?
- **Q10** Cross-site RBAC: user has access to multiple sites / single primary site + cross-site read-only / per-site separate tenants (multi-org)?
- **Q11** Consolidation reports: P1 per-site + factory aggregate / P2 cross-site comparison (benchmarking)?
- **Q12** `site_id` activation across modules: ALTER TABLE w 14-MULTI-SITE DDL script? / gradual activation w sub-modules per PRD? / assume all tables have nullable site_id z day 1 (REC-L1 already enforced)?

### Open items carry-forward

**12-REPORTING OQ-RPT-01..10:** 10 items, wszystkie P2 / post-launch. Nie blockery.
**15-OEE OQ-OEE-01..10:** 10 items, wszystkie P2 / P3 / post-launch. Nie blockery.

Total cumulative open items Phase B+C: ~100+ across 14 modules (~5-10 per PRD avg).

---

## Phase C progress forecast

**Est. Phase C5 total:** 2-3 sesji (C5 Sesja 1 ✅ + Sesja 2 est. 1-2 + optional Sesja 3 buffer).

**Estimated Phase C overall completion:** 10 sesji done + 1-2 C5 Sesja 2 + optional 1 buffer = **11-13 sesji total** (original est. 12-15, w budżecie).

**Post-Phase-C milestones:**
1. Phase C complete — 15/15 modułów PRD v3.0 baseline (post-C5 Sesja 2)
2. Phase D lock confirmation — ADRs finalized, SKILL-MAP complete, no further architectural decisions (check post-C5)
3. Phase E kickoff — **Build** starts per 00-FOUNDATION §4.2 build order (01-NPD-a → 15-OEE-c)
4. Est. build timeline: 18-25 sesji × 15 modules = ~250-350 sesji implementation (pre-compression, assumes no major discoveries)

---

## Kumulatywne statystyki Phase B+C (post-C5 Sesja 1)

- **14 PRD modules v3.0+ + 02-SETTINGS v3.2:** ~19,276 linii (+930 12-REPORTING +1020 15-OEE +~65 02-SET delta vs post-C4 Sesja 3)
- **~207 D-* decyzji** dokumentowanych (avg ~15 per moduł)
- **22 DSL rules registered** (16 P1 active + 6 P2 stub) across **9 producer modules**
- **20 reference tables** cumulative (02-SETTINGS §8.1)
- **6 INTEGRATIONS stages** (4 active P1: 1, 2, 3, 5; 2 P2: 4 EPCIS, 6 RMA credit) — bez zmian post-C5 Sesja 1
- **ADR coverage:** ADR-028 (schema-driven L1-L4) + ADR-029 (rule engine DSL) + ADR-030 (configurable depts) + ADR-031 (schema variation per org) — all applied cross-PRD
- **Tempo:** 10 sesji / 3 dni (2026-04-18/19/20) — average ~1 sesja per module dla mid/small, 2 per large. Bundled revision pattern proven 2× (v3.1 C4 Sesja 3, v3.2 C5 Sesja 1).

---

## Closing note

C5 Sesja 1 zamknęła 12-REPORTING + 15-OEE + 02-SETTINGS v3.2 delta w 1 sesji (est. 1-2 sesje, w budżecie). Bundled pattern proven — 2 modules mid-size + delta w 1 sesji (precedent C3 Sesja 1).

Kluczowe czynniki sukcesu C5 Sesja 1:
1. **Explore agent bootstrap** — ~4000-word summary zastąpił reading 6 full PRDów (08-PROD §13, 00-FOUND §4-6, 07-EXT §10, MES-TRENDS §9, baseline 12-REPORTING, cross-PRD consumer hooks). Context usage efficient.
2. **Baseline 12-REPORTING v1.0 solid** (554 linii, 6 epics, 8 D-RPT decisions retained) — rewrite do Phase D convention, nie from scratch.
3. **15-OEE from scratch** — zero legacy debt, clean v3.0 design od początku, 19 sekcji enforced.
4. **Template reuse discipline:**
   - Outbox pattern consumer (08-PROD §9.10 schema) = `oee_outbox_events` clone zero redesign
   - DSL rule registration pattern (02-SET §7.8) = 5 new rules straightforward additions
   - Reference table pattern (02-SET §8.1) = 3 new tables straightforward additions
   - Sub-module breakdown 12-a..e / 15-a..c = proven pattern from C4 sessions
5. **Cross-PRD consistency enforced** — 12-REPORTING D-RPT-9 OEE Consumer Integration (read `oee_daily_summary` owned by 15-OEE) = architectural pattern consistent z 10-FIN cost_per_kg dual ownership + 05-WH FEFO DSL ownership.
6. **Bundled revision efficiency** — 02-SETTINGS v3.2 delta w 4 edits (frontmatter + §7.8 table + §8.1 table + changelog) zamiast separate sessions.
7. **Pre-write Q&A discipline** — 10 Q-decisions (Q1-Q10) user-approved upfront defaults, zero rewrites, smooth writing flow.

**Phase C5 Sesja 1 COMPLETE.** Reporting + OEE layer ready do build. **14/15 modułów PRD v3.0+ complete (93%).**

**Next session:** C5 Sesja 2 — 13-MAINTENANCE + 14-MULTI-SITE bundled (per C3 Sesja 1 precedent bundled 07-EXT + 08-PROD). Session reset recommended. Fresh context dla maintenance + multi-site orchestration (both consumer-heavy vs producer-heavy). Potential 02-SETTINGS v3.3 bundled delta (calibration_equipment + maintenance_priority_levels + sites_hierarchy_config refs, equipment_schedule_gate + site_access_policy rules potential). Total C5 est. 2-3 sesji overall.

---

## Related

- [`12-REPORTING-PRD.md`](../../12-REPORTING-PRD.md) v3.0 — primary deliverable (~930 linii)
- [`15-OEE-PRD.md`](../../15-OEE-PRD.md) v3.0 — primary deliverable (~1020 linii, new from scratch)
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.2 — secondary deliverable (bundled delta, +5 rules, +3 ref tables, +changelog)
- [`2026-04-20-c4-sesja3-close.md`](./2026-04-20-c4-sesja3-close.md) — input HANDOFF (C4 Sesja 3 close)
- [`08-PRODUCTION-PRD.md`](../../08-PRODUCTION-PRD.md) v3.0 §13 D7 per-minute aggregation (PRIMARY source for 15-OEE consumer)
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R6 PostHog, R12 ML roadmap, R7 data residency (all consumed by 12-REP + 15-OEE)
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 12-REPORTING + 15-OEE R-decisions
