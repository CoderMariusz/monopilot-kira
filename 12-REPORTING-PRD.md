# 12-REPORTING PRD — Monopilot MES

**Wersja:** 3.0 | **Data:** 2026-04-20 | **Status:** Baseline (Phase C5 Sesja 1)
**Poprzednia wersja:** v1.0 (2026-02-18, pre-Phase-D) — retained D-RPT-1..8 baseline decisions; przepisano do v3.0 convention (19 sekcji, markers, rule registry, INTEGRATIONS stages summary, Phase D numbering)

---

## 1. Executive Summary

Modul **12-REPORTING** dostarcza warstwe **universal dashboards + metadata-driven reports** dla Monopilot MES. Zakres P1: 10 core dashboards (Factory Overview, Yield-by-Line, Yield-by-SKU, QC Holds, OEE Summary consumer, Inventory Aging, WO Status, Shipment OTD, Integration Health, Rules Usage) + **materialized views z refreshem co 2 min** (pg_cron lub Edge Function fallback), export CSV/PDF P1, export Excel/JSON P2, scheduled reports email delivery P2 (Resend consumer z 02-SETTINGS §13). Metadata-driven per Strategic Decision #6 ("custom reports = universal templates + metadata-driven") — admin UI filters + column picker P1, SQL-like DSL query builder P2, visual query builder wycofany.

**Pozycja w Module Map (per 00-FOUNDATION §4.2):** 12-REPORTING jest **read-only consumer** praktycznie wszystkich modulow. Primary sources: 08-PRODUCTION (wo_outputs, wo_consumptions, downtime_events, oee_snapshots), 09-QUALITY (quality_holds, ncr_reports, quality_inspections), 05-WAREHOUSE (license_plates, lot_genealogy), 11-SHIPPING (shipments, sales_orders, otd metrics), 10-FINANCE (wip_balances, cost layers P2), 15-OEE (oee_daily_summary, oee_shift_metrics materialized views), 02-SETTINGS (rule registry + reference tables dla dashboard metadata + grade_thresholds + fiscal_periods + target_kpis). **Producer** tylko `report_exports` audit trail i `report_executions` metrics (brak push do D365 — reports to internal BI layer). **No reverse dependency** z 15-OEE: 12-REPORTING reads OEE outputs, OEE nie reads reports.

**Kluczowe wyrozniki v3.0 (nowe vs v1.0 baseline):**
- **D-RPT-9 OEE Consumer Integration (NEW):** 12-REPORTING Factory Overview i Shift Performance dashboards embedded OEE KPI card czytajaca `oee_daily_summary` materialized view owned by 15-OEE (NIE duplicate aggregation logic). Shared cache invalidation via outbox event subscriber.
- **D-RPT-10 Feature Flag Rollout (NEW):** PostHog self-host (per R6) gates dashboards: `reporting.v2_dashboards` (Phase 2 E3 rollout), `reporting.external_bi_embed` (Metabase/Grafana P2 escape hatch), `reporting.scheduled_delivery` (P2 email cron).
- **Rule registry:** 2 DSL rules registered w 02-SETTINGS §7.8: `report_access_gate_v1` (P1 active — RBAC per report_id) + `scheduled_report_distribution_v1` (P2 stub — cron cadence + recipient list).
- **INTEGRATIONS stage summary dashboard:** new "Integration Health" dashboard (10. pozycja P1 catalog) czyta cumulative stats z `production_outbox_events`, `shipping_outbox_events`, `finance_outbox_events` (stages 2/3/5 P1 active), `warehouse_outbox_events` (stage 4 P2), `items_outbox_events` (stage 1 D365 pull status). Dashboard columns: stage, target_system, pending_count, failed_count, dlq_depth, avg_latency_5min. Consumer 02-SETTINGS §11.8 stages summary.
- **Export audit + 21 CFR Part 11 ready:** `report_exports.sha256_hash` NOT NULL GENERATED (export content fingerprint), `exported_by` + `exported_at` + `retention_until` 7-year (BRCGS Issue 10 consumer-facing reports archive). E-signature NOT required P1 (reports = read-only) — P2 dla regulatory exports (FDA 483 response, BRCGS audit package).

**Markers:** [UNIVERSAL] = core MES contract | [APEX-CONFIG] = konkretny fit Apex UK | [EVOLVING] = areas in iteration | [LEGACY-D365] = bridge until D365 retirement.

---

## 2. Objectives & Metrics

### Cel glowny

Dostarczyc menedzerom, liderom produkcji, dyrekcji i QA natychmiastowy wglad w KPI fabryki (yield, giveaway, efficiency, downtime, quality, OEE, OTD) poprzez materialized-view-backed dashboards z refreshem < 3 min. Eliminacja Excel-based reporting (Apex reality: 40+ plikow xlsx) z zachowaniem accuracy ±0% vs manual calculation.

### Metryki sukcesu Phase 1 (MVP)

| Metryka | Cel P1 | Pomiar | Zrodlo |
|---|---|---|---|
| Dashboard load P95 | < 2 s | APM / Lighthouse | frontend trace |
| MV refresh time | < 30 s per view | `mv_refresh_log.duration_ms` | `mv_refresh_log` |
| Data freshness | < 3 min od ostatniego WO commit | `(now() - last_refresh_at)` | `mv_refresh_log` |
| API response P95 | < 500 ms | APM | `/api/reporting/*` |
| Chart render time | < 500 ms | Client-side `performance.mark()` | browser |
| Weekly Active Users (Reporting) | > 60% org users | PostHog page views | analytics |
| Report accuracy vs Excel | 100% (zero discrepancies) | Manual quarterly audit | QA sign-off |
| Time-to-insight vs Excel | -80% (from ~15min → <3min) | User survey (Apex pilot) | survey |
| RLS isolation | 0 cross-tenant leaks | Test suite + pg_audit | `cross_tenant_leak_test` |
| Export success rate | > 99.9% | `report_exports.status='completed'` / total | `report_exports` |

### Metryki sukcesu Phase 2 (po P1 stabilny)

| Metryka | Cel P2 | Uwagi |
|---|---|---|
| Scheduled reports delivery | > 99% email delivery within 5min of cron trigger | Consumer Resend 02-SET §13 |
| Custom report builder adoption | > 30% admins create ≥1 custom report | Admin UI telemetry |
| External BI embed usage | Feature flag-gated, tracked per tenant | PostHog `external_bi_embed` |
| Operator Leaderboard views | > 20% supervisors weekly | E3 dashboard P2 |
| Period Report export rate | > 5 exports per org per period (P1-P13) | `report_exports.report_type='period'` |

---

## 3. Personas & Roles

| Persona | Role w Reporting | Typowe workflows | Urzadzenie |
|---|---|---|---|
| **Plant Director** | Read-only, weekly/period review, KPI sign-off | Factory Overview, Period Reports 4-4-5, Year-over-Year, Export PDF dla zarzadu | Desktop/tablet |
| **Production Manager** | Daily review, drill-down, variance investigation | Factory Overview, Yield-by-Line, Shift Performance (P2), Top 3 Issues, Daily Issues Analysis (P2) | Desktop |
| **Shift Lead** | Ocena wlasnej zmiany, porownanie AM/PM | Shift Performance (P2), Daily Issues, Yield-by-SKU | Desktop/tablet |
| **Supervisor** | Leader scorecards, team comparison (P2) | Leader Scorecard (P2), Supervisor Comparison (P2), Giveaway Analysis (P2) | Desktop |
| **QA Manager** | QC holds review, NCR trends, regulatory exports | QC Holds Dashboard, NCR Trend (P2), Regulatory Export Package (BRCGS audit) | Desktop |
| **Warehouse Manager** | Inventory aging, LP lifecycle reports | Inventory Aging, Lot Genealogy report (FSMA 204 consumer) | Desktop |
| **Sales Manager** | OTD, fulfillment rate, customer performance | Shipment OTD, Customer Fulfillment (P2) | Desktop |
| **Finance Manager** | WIP balance, variance analysis (P2) | WIP Dashboard (P2 consumer 10-FIN), Cost Variance (P2) | Desktop |
| **Admin** | Dashboard config, feature flag toggles, integration health | Integration Health Dashboard, Rules Usage Analytics, Custom Report Builder (P2) | Desktop |

**RBAC mapping (extends 02-SETTINGS §14):**
- `reporting_viewer` — read dashboards + export CSV/PDF (P1)
- `reporting_operator` — reporting_viewer + Copy-to-Clipboard + drill-down navigation
- `reporting_manager` — reporting_operator + schedule reports (P2) + custom report builder (P2)
- `reporting_admin` — reporting_manager + integration health dashboards + external BI embed config (P2)

**DSL rule `report_access_gate_v1`:** per dashboard `report_id` w metadata catalog — rule evaluates (user.role, dashboard.required_role) → allow/deny + audit log w `report_access_audits`.

---

## 4. Scope

### 4.1 In Scope — Phase 1 (MVP, 10 core dashboards)

| # | Dashboard | Kluczowe KPIs | Source | Priorytet |
|---|---|---|---|---|
| 1 | **Factory Overview** | Yield%, GA%, Efficiency%, Cases, Variance GBP (weighted); 13-week trend; Top 3 Gains/Losses; OEE summary card (consumer 15-OEE) | 08-PROD + 15-OEE | Must |
| 2 | **Yield by Line** | Per-line tabela z W/W change, sparklines, factory avg footer | 08-PROD `wo_outputs` + `wo_consumptions` | Must |
| 3 | **Yield by SKU** | Per-SKU drill-down z contribution%, 13-week trend, line summary header | 08-PROD + 03-TECH products | Must |
| 4 | **QC Holds Dashboard** | Holds by line/product/reason, boxes held, labour hours, AM vs PM split | 09-QA `quality_holds` + `hold_items` | Must |
| 5 | **OEE Summary (consumer 15-OEE)** | OEE% last 24h per-line trend + today-so-far summary + best/worst shift | 15-OEE `oee_daily_summary` MV | Must |
| 6 | **Inventory Aging** | LP age buckets (0-7d / 7-14d / 14-30d / >30d), use-by alerts, slow-moving SKU | 05-WH `license_plates` + expiry data | Must |
| 7 | **WO Status** | WOs by status (draft/released/running/paused/completed), WIP count, avg duration per line | 08-PROD `work_orders` + `wo_executions` | Must |
| 8 | **Shipment OTD** | OTD%, fulfillment rate, on-time vs late breakdown per customer, avg pack time | 11-SHIP `shipments` + `sales_orders` | Must |
| 9 | **Integration Health** | Outbox depth per stage (1/2/3/5 P1 + 4 P2), DLQ count, avg dispatch latency, failed events last 24h | 02-SET §11.8 + outbox tables | Should |
| 10 | **Rules Usage Analytics** | DSL rule eval count per day, trigger rate per rule, avg eval latency, rules that never triggered | 02-SET §7 + `rule_evaluations` audit | Should |

**Infrastructure P1:**
- **Data Aggregation Pipeline** (M12-DP):
  - Materialized views (11 MVs podstawowych, rozszerzenia per-dashboard)
  - Fiscal calendar engine (4-4-5 / 4-5-4 / 5-4-4 / calendar months, per tenant per 02-SET §8)
  - Refresh logic (pg_cron co 2min prod MVs, co 5min QC holds, co 15min period aggregates)
  - KPI aggregation engine (weighted avg, sum, W/W comparison, P/P comparison)
- **Report Export P1** (M12-EX):
  - PDF export via edge function (Puppeteer / html-pdf, print-optimized CSS `@media print`)
  - CSV export streaming (Excel-compatible, UTF-8 BOM)
  - Copy-to-Clipboard (tab-separated)
- **Custom Report Builder P1 (simple):**
  - Admin UI: filter composer (date range, line, shift, product category) + column picker (z metadata-driven catalog)
  - Saved custom reports per user (`custom_reports` table)
- **Feature flags gate (PostHog self-host per R6):**
  - `reporting.v2_dashboards` → E3 Advanced Analytics rollout
  - `reporting.scheduled_delivery` → P2 cron email
  - `reporting.external_bi_embed` → P2 Metabase/Grafana escape hatch
  - `reporting.custom_dsl_builder` → P2 SQL-like DSL

### 4.2 In Scope — Phase 2 (deferred, ~15 dashboards + export + features)

| # | Obszar | Uwagi |
|---|---|---|
| 1 | **Giveaway Analysis** | GA by Line, SKU drill-down, factory GA trend, GA by Manager/Supervisor (E3) |
| 2 | **Leader Scorecard A/B/C/D** | Per-leader KPIs z grade (E3, D-RPT-5 grading system) |
| 3 | **Daily Issues Analysis** | Top 3 downtime, People/Process/Plant breakdown, AM/PM split (E3) |
| 4 | **Shift Performance Overview** | 7 primary KPIs, hourly efficiency trend, line heatmap (E3) |
| 5 | **Supervisor Team Comparison** | Multi-team trends, potential savings calc (E4) |
| 6 | **Period Reports 4-4-5** | P1-P13 tabela, P/P i Y/Y comparison, year-end summary (E4) |
| 7 | **Multi-granularity time selection** | Global Day/Week/Period/Year selector (E4) |
| 8 | **NCR Trend Dashboard** | Consumer 09-QA `ncr_reports`, root cause trends |
| 9 | **Lot Genealogy Report** | Consumer 05-WH §11 FSMA 204 recursive CTE, export PDF dla recall |
| 10 | **WIP Dashboard** | Consumer 10-FIN `wip_balances`, per-line / per-product WIP value |
| 11 | **Cost Variance Analysis** | Consumer 10-FIN yield variance + waste cost |
| 12 | **Customer Fulfillment** | Consumer 11-SHIP per-customer OTD, backorders |
| 13 | **Operator Leaderboard** | Consumer 08-PROD `operator_kpis_monthly` MV (D11) |
| 14 | **Regulatory Export Package** | BRCGS audit bundle (HACCP + allergens + CCPs + batch records), FDA 483 response |
| 15 | **Custom Report Builder DSL (SQL-like)** | Visual filter + custom SQL via safe query engine (tenant-isolated) |
| 16 | **Scheduled Reports + Email** | Cron cadence (daily/weekly/monthly/period-end) + recipients + Resend consumer |
| 17 | **External BI Embed** | Metabase/Grafana iframe dla orgs preferujace SaaS BI (feature flag `external_bi_embed`) |
| 18 | **Excel export (XLSX)** | Multi-sheet workbooks z formatting + charts embedded |
| 19 | **JSON/Parquet export** | Data science friendly formats, batch exports to S3/GCS |
| 20 | **Per-org dashboard customization** | Per-tenant dashboard config (ADR-031 L2 variation) — widget arrangement, custom KPIs |

### 4.3 Exclusions (Nigdy w 12-REPORTING)

- **Real-time streaming dashboards** (WebSocket push) — materialized views z refreshem 2-5min wystarczaja, koszt infra vs benefit nie uzasadnia
- **Ad-hoc SQL queries dla end users** — bezpieczenstwo multi-tenant wyklucza (RLS bypass ryzyko)
- **ML/AI predictive analytics** — defer P3+ (R12 per MES-TRENDS), separate modul
- **Push notifications dashboards** — native OS notifications → separate modul (jeśli potrzeba)
- **Excel in-browser editing** — eksport only, edycja nie
- **Report writer code w dashboardach** — wszystkie kalkulacje backend (Postgres + materialized views), frontend tylko render

---

## 5. Constraints

### Techniczne

- **Materialized views refresh policy:** 2 min dla prod (yield, factory KPI), 5 min dla QC holds, 15 min dla period aggregates. `REFRESH MATERIALIZED VIEW CONCURRENTLY` (zero downtime). pg_cron Supabase Pro; fallback Edge Function (Supabase Scheduled Functions free tier).
- **RLS na MV constraint (Postgres limitation):** Materialized views NIE obsluguja RLS natywnie → filtr `WHERE org_id = :tenant` w service layer (app role connection, NOT security invoker). Każde MV query explicit WHERE filter enforced w API handlers.
- **D3.js client-side** dla heavy charts (trend lines, heatmaps, stacked bar, combo). **Recharts** dla prostych KPI cards (łatwiejsza integracja). Bundle target < 100KB Gzip dla dashboard chunk.
- **REC-L1 — site_id na wszystkich tabelach/MV:** `site_id UUID NULL` na WSZYSTKICH MV i support tables. Filter `WHERE site_id = :current_site OR site_id IS NULL`. Przygotowanie na 14-MULTI-SITE. NULL = factory-level aggregate.
- **Export PDF edge function limit:** 30s timeout (Supabase Edge Functions) → jeśli raport > 500 wierszy, chunked export lub background worker (BullMQ) w P2.
- **Chart perf guardrail:** > 10k punktow danych na wykresie → enforced aggregation server-side (weekly/monthly buckets), error jeśli client próbuje request full granularity.

### Biznesowe

- Dane zrodlowe z 08-PROD musza istniec przed M12-E1 (Factory Overview, Yield by Line/SKU)
- Dane QC z 09-QA musza istniec przed M12-E2 (QC Holds Dashboard)
- Fiscal calendar config (02-SET §8 `fiscal_periods`) wymagany przed E4 Period Reports P2
- Target KPI config (02-SET `target_kpis`) wymagany przed E1 (fallback: hardcoded defaults yield=95%, GA=1.5%, eff=80%)
- Grade thresholds config (02-SET `grade_thresholds`) wymagany przed E3 P2 Leader Scorecard
- 15-OEE `oee_daily_summary` MV wymagana przed OEE Summary Card w Factory Overview (dashboard #5 P1)

### Regulacyjne

- **BRCGS Issue 10 audit trail:** `report_exports.retention_until` GENERATED 7 years dla eksportow consumer-facing (BOL, COA, shipping manifests, HACCP records). Archive nightly do S3/GCS compliance tier.
- **FSMA 204 traceability reports:** Lot Genealogy Report (P2) czyta 05-WH §11 recursive CTE <30s baseline, PDF export dla USA 2028 deadline.
- **EU 1169/2011 allergen reports:** Allergen Compliance Report (P2) z products.allergens + batch lot info.
- **21 CFR Part 11 e-sig:** NIE required dla read-only dashboards P1. P2 dla regulatory exports (FDA 483 response package, audit trail sign-off) — SHA-256 content hash + PIN reverify reuse 09-QA §5.3 pattern.
- **GDPR / PII:** Operator leaderboards (P2) — display full name OR initials per tenant L2 config (`reporting.leaderboard_anonymize`). Data retention 2 years for HR compliance.
- **Data residency (R7 EU cluster default):** Report exports nie cross-region (per tenant residency config w 02-SET §12). EU tenant exports → EU storage only.

---

## 6. Decisions D-RPT-1..10

### D-RPT-1. Materialized Views vs Real-Time Queries [RETAINED v1.0]

**Decyzja:** Materialized views dla wszystkich agregatow. Real-time queries tylko dla statusow biezacych (np. aktywne WO w WO Status dashboard).

**Uzasadnienie:** Zapytania agregujace na duzych tabelach (`wo_outputs`, `wo_consumptions`, `oee_snapshots`) sa zbyt wolne dla interaktywnych dashboardow (>5s na production volume 100k rows/month). MV z refreshem < 3 min = akceptowalny kompromis.

**Implementacja:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` (bez blokowania odczytow) przez pg_cron co 2 min dla prod, 5 min dla QC, 15 min dla period aggregates.

### D-RPT-2. Kalendarz fiskalny 4-4-5 [RETAINED v1.0]

**Decyzja:** Tabela `fiscal_periods` generowana na podstawie `organization_settings.fiscal_calendar_type` (4-4-5 / 4-5-4 / 5-4-4 / calendar_months).

**Implementacja:** Funkcja PG `generate_fiscal_periods(org_id, year)` generuje P1-P13 z datami start/end. Wywolywana przy zmianie konfiguracji lub przy pierwszym uzyciu roku. Stored in `fiscal_periods` (02-SETTINGS §8 reference table).

**Fallback:** Jesli org nie skonfigurowal → domyslnie `calendar_months` (P1=Jan, P2=Feb, ..., P12=Dec, P13=null).

### D-RPT-3. Zrodla KPI [RETAINED v1.0]

**Decyzja:** Yield %, Giveaway %, Efficiency % — z `wo_outputs` + `wo_consumptions` (08-PROD). QC Holds — z `quality_holds` (09-QA). Variance GBP — `(actual_yield - target_yield) × kg_usage × cost_per_kg`. OEE — z `oee_daily_summary` (15-OEE MV, NIE duplicate calculation).

**Wagi:** Yield % i GA % liczone jako weighted average po KG Usage (nie prosta srednia). Factory-level aggregate weights per-line KG output.

### D-RPT-4. Multi-Granularity Time Selection [RETAINED v1.0, P2 E4]

**Decyzja:** Globalny selektor w headerze: Day | Week | Period | Year. Stan persystowany w URL query params. P2 E4 deployment.

**Zachowanie:** Zmiana granularnosci przelicza smart default (np. Week 7 → Period 2, Year 2026). Wszystkie dashboardy reaguja na zmiane granularnosci.

### D-RPT-5. Grading System A/B/C/D [RETAINED v1.0, P2 E3]

**Decyzja:** Ocena wieloskladnikowa: Yield % + GA % + Efficiency %. Progi konfigurowane w 02-SETTINGS `grade_thresholds`. Domyslne: A (>=95%, <=1.5%, >=80%), B (>=92%, <=2.0%, >=75%), C (>=90%, <=2.5%, >=70%), D (poniżej).

**Wymaganie:** Najgorsza skladowa determinuje ocene (np. Yield A + GA D = **D**).

### D-RPT-6. Refresh Strategy [RETAINED v1.0, enhanced]

**Decyzja:** pg_cron co 2 min dla prod MVs. Edge Function fallback jesli pg_cron niedostepny (Supabase free tier). Timestamp ostatniego refresha widoczny w UI ("Dane z: 14:32"). Monitoring alert jesli refresh > 5 min opozniony.

**Enhancement v3.0:** Outbox event subscriber `production.wo.completed` → increment `mv_refresh_counter` → smart cache invalidation (jeśli counter > threshold, early refresh trigger). Reduces staleness w peak periods.

### D-RPT-7. Downtime Categories [RETAINED v1.0, enhanced]

**Decyzja:** Consumer `downtime_categories` ref table (02-SETTINGS §8.1, admin-configurable per 08-PROD D6). Baseline 3-group `big_loss_classification`: People / Process / Plant. Minuty sumowane per kategoria per linia per zmiana w `mv_downtime_by_line`.

**Enhancement v3.0:** Hierarchical categories (parent_id FK w `downtime_categories`) → dashboard allows drill-down z "Equipment" → "Motor" → "Bearing failure" tree view (P2 Daily Issues Analysis).

### D-RPT-8. Chart Library [RETAINED v1.0]

**Decyzja:** **D3.js** dla wszystkich zaawansowanych wykresow (trend lines, bar charts, heatmapy, combo charts, Gantt-style dashboards dla Shift Performance). **Recharts** jako fallback dla prostych KPI cards + quick bars. Brak ciezkich BI frameworkow (Highcharts, AG Charts wycofane licencyjnie).

**Export compatibility:** D3.js SVG → html2canvas → PDF (edge function). Recharts → native SVG preserved.

### D-RPT-9. OEE Consumer Integration (NEW v3.0) [UNIVERSAL]

**Decyzja:** 12-REPORTING dashboards (Factory Overview card + Shift Performance P2) embedded OEE KPI — czytaja `oee_daily_summary` materialized view **owned by 15-OEE** (single source of truth). 12-REPORTING NIE duplicate OEE aggregation logic. Shared cache invalidation: 15-OEE outbox event `oee.snapshot.aggregated` → 12-REPORTING subscriber increments local cache counter.

**Rationale:** Zero-duplicate aggregation, consistent OEE calc cross-dashboard, 15-OEE owns full drill-down (per-line trend, anomaly detection). 12-REPORTING pokazuje summary cards.

**Consequences:**
- Pro: No drift between dashboards (same view), simpler 12-REPORTING maintenance
- Con: 12-REPORTING zalezy od 15-OEE dostepnosci MV — graceful degradation: "OEE data unavailable" placeholder if MV missing

### D-RPT-10. Feature Flag Rollout (NEW v3.0) [UNIVERSAL]

**Decyzja:** PostHog self-host (per R6 consumer 02-SETTINGS §11.8) gates:

| Flag | Default | Purpose |
|---|---|---|
| `reporting.v2_dashboards` | `false` | E3 Advanced Analytics rollout (Giveaway, Leader Scorecard, Daily Issues, Shift Performance) |
| `reporting.scheduled_delivery` | `false` | P2 cron email reports (Resend consumer) |
| `reporting.external_bi_embed` | `false` | P2 Metabase/Grafana iframe escape hatch |
| `reporting.custom_dsl_builder` | `false` | P2 SQL-like query builder admin UI |
| `reporting.leaderboard_anonymize` | `true` (Apex: `false`) | GDPR: display initials vs full name |
| `reporting.ml_anomaly_detection` | `false` | P3+ AI/ML predictions (R12) |

**Rationale:** Gradual rollout per tenant, A/B testing capability, safe rollback. Admin UI w 02-SET §10 module toggles.

### D-summary table

| # | Decision | Status | Rule/ADR |
|---|---|---|---|
| D-RPT-1 | Materialized views baseline | Locked | - |
| D-RPT-2 | Fiscal calendar 4-4-5 | Locked | 02-SET §8 `fiscal_periods` |
| D-RPT-3 | Yield/GA weighted avg; OEE consumer 15-OEE | Locked (v3.0: OEE consumer) | - |
| D-RPT-4 | Multi-granularity Day/Week/Period/Year | Locked (P2) | - |
| D-RPT-5 | Grade A/B/C/D (worst component) | Locked (P2) | 02-SET §8 `grade_thresholds` |
| D-RPT-6 | Refresh 2min prod + outbox-driven | Locked | - |
| D-RPT-7 | Downtime categories consumer 02-SET | Locked | 02-SET §8 `downtime_categories` |
| D-RPT-8 | D3.js + Recharts fallback | Locked | - |
| **D-RPT-9** | **OEE consumer 15-OEE MV (NEW)** | **Locked** | `oee_daily_summary` |
| **D-RPT-10** | **Feature flag rollout PostHog (NEW)** | **Locked** | PostHog self-host |

---

## 7. Rule Registry (registered w 02-SETTINGS §7)

12-REPORTING rejestruje 2 DSL rules w 02-SETTINGS §7.8 rules registry (P1 active + P2 stub).

### 7.1 `report_access_gate_v1` (P1 active) [UNIVERSAL]

**Trigger:** Each API call to `/api/reporting/*` endpoint. Evaluated before query execution.

**Input:**
```json
{
  "user_id": "uuid",
  "user_role": "reporting_viewer | reporting_manager | ...",
  "dashboard_id": "factory-overview | yield-by-line | ...",
  "tenant_id": "uuid",
  "site_id": "uuid | null"
}
```

**Logic:**
1. Lookup `dashboards_catalog` (02-SET §8 reference) per `dashboard_id` → fetch `required_role`, `enabled_for_tenants` (allowlist, empty = all), `feature_flag` (optional)
2. IF `user_role` NOT IN allowed_roles (per hierarchy viewer ≤ operator ≤ manager ≤ admin) → **DENY** + audit
3. IF `feature_flag` SET AND NOT enabled_for_tenant → **DENY** (dashboard not rolled out)
4. IF `site_id` SET AND user.accessible_sites DOESN'T include `site_id` → **DENY** (multi-site RLS)
5. ELSE **ALLOW** + write `report_access_audits` row (user, dashboard, timestamp, result)

**Output:** `{allow: bool, audit_id: uuid, deny_reason?: string}`

**Reference:** 02-SETTINGS §7.8 (baseline pattern from 05-WH `fefo_strategy_v1`)

### 7.2 `scheduled_report_distribution_v1` (P2 stub) [UNIVERSAL]

**Trigger:** pg_cron fires per `scheduled_reports.cron_expression` (daily/weekly/monthly/period-end cadence).

**Logic (P2 draft):**
1. Fetch scheduled_reports z `enabled=true`, `next_run_at <= now()`
2. Per row: evaluate `filter_dsl` (date range, line, shift — metadata-driven)
3. Render report (reuse export engine PDF/CSV)
4. Compose email via Resend: recipients list, attachment, subject template `{{report_name}} — {{period}}`
5. Update `scheduled_reports.last_run_at` + `scheduled_reports.last_status` + enqueue `report_deliveries` row

**Output:** P2 stub — wydobedzie w sesji impl 12-c

**Reference:** Clone pattern from 02-SETTINGS §13 EmailConfig (Resend baseline)

### 7.3 Rules consumed (read-only from 02-SET §7.8)

| Rule | Owner | Consumer context |
|---|---|---|
| `fefo_strategy_v1` | 05-WH | Rules Usage dashboard #10 analytics |
| `wo_state_machine_v1` | 04-PLAN | WO Status dashboard #7 state transitions |
| `allergen_changeover_gate_v1` | 08-PROD | P2 Allergen Compliance report |
| `so_state_machine_v1` | 11-SHIP | Shipment OTD dashboard #8 state transitions |
| `cost_method_selector_v1` | 10-FIN | P2 WIP Dashboard FIFO/WAC display mode |

---

## 8. Core Flows (Dashboard Request → MV Query → Export)

### 8.1 Factory Overview flow (Dashboard #1)

```
User → Browser /reporting/factory-overview?week=2026-W16
  ↓
Next.js Server Component → /api/reporting/factory-overview
  ↓
[1] DSL rule `report_access_gate_v1` evaluates → ALLOW
  ↓
[2] Query mv_factory_kpi_week WHERE org_id=:tenant AND week_ending='2026-04-18' AND (site_id=:current_site OR site_id IS NULL)
  ↓
[3] Query oee_daily_summary WHERE org_id=:tenant AND date >= now() - interval '1 day' → aggregate OEE%
  ↓
[4] Query mv_yield_by_line_week LIMIT 3 ORDER BY variance_gbp DESC (top gains)
  ↓
[5] Query mv_yield_by_line_week LIMIT 3 ORDER BY variance_gbp ASC (top losses)
  ↓
[6] Query mv_factory_kpi_week past 13 weeks → trend data
  ↓
Response JSON: {kpis, oee_summary, top_gains, top_losses, trend, last_refresh_at}
  ↓
Next.js Client Component renders: 5 KPI cards + OEE card + D3.js trend chart + Top 3 panels + bar chart
  ↓
User clicks "Export PDF" → POST /api/reporting/export
  ↓
Edge function: Puppeteer renders print-optimized view → PDF blob → download
  ↓
Write row to report_exports (audit trail, retention_until 7y)
```

### 8.2 QC Holds Dashboard flow (Dashboard #4)

```
User → /reporting/qc-holds?date=2026-04-20
  ↓
/api/reporting/qc-holds → rule_gate → query mv_qc_holds_summary
  ↓
Query quality_holds JOIN hold_items WHERE org_id=:tenant AND created_at::date = '2026-04-20'
  ↓
Aggregate per (line_id, product_id, reason_code): boxes_held, boxes_rejected, labour_hours, AM vs PM split
  ↓
Response: table rows + summary card + AM/PM split
  ↓
D3.js horizontal bar chart: boxes held per line
```

### 8.3 Integration Health flow (Dashboard #9, NEW v3.0)

```
User → /reporting/integration-health
  ↓
/api/reporting/integration-health
  ↓
Query cross-outbox summary (UNION):
  SELECT 'stage_1' AS stage, 'd365_items_pull' AS target, COUNT(*) FILTER (WHERE status='pending') AS pending, ... FROM items_outbox_events
  UNION ALL
  SELECT 'stage_2', 'd365_wo_confirm', ... FROM production_outbox_events
  UNION ALL
  SELECT 'stage_3', 'd365_so_confirm', ... FROM shipping_outbox_events
  UNION ALL
  SELECT 'stage_5', 'd365_cost_post', ... FROM finance_outbox_events
  ↓
Query DLQ depth cross-dlq (UNION): d365_push_dlq + shipping_push_dlq + finance_push_dlq + items_push_dlq
  ↓
Response: stage × target × {pending, dispatching, failed, dlq_depth, avg_latency_5min}
  ↓
Render: stacked bar chart (per stage depth) + table z status pillules (green/yellow/red)
```

### 8.4 Export flow (PDF/CSV)

```
User → Click "Export PDF" button on dashboard
  ↓
POST /api/reporting/export {dashboard_id, filters, format: 'pdf'|'csv'|'xlsx'(P2)}
  ↓
[1] DSL `report_access_gate_v1` ALLOW
  ↓
[2] IF format='csv' → streaming response (Readable stream, chunked)
    IF format='pdf' → edge function Puppeteer render print route → PDF blob
    IF format='xlsx' (P2) → xlsx library SheetJS multi-sheet workbook
  ↓
[3] Write report_exports row:
    - user_id, tenant_id, dashboard_id, format, date_range
    - sha256_hash GENERATED (file fingerprint)
    - exported_at, retention_until GENERATED (now() + interval '7 years')
  ↓
[4] Return file blob / download URL
```

### 8.5 Scheduled Report flow (P2)

```
pg_cron fires → scheduled_report_distribution_v1 evaluates
  ↓
FOR each scheduled_report WHERE next_run_at <= now() AND enabled=true:
  ↓
  [1] Render report (reuse export engine from 8.4)
  ↓
  [2] Compose email: Resend.emails.send({
         from: 'reports@monopilot-mes.com',
         to: recipients,
         subject: render_template(scheduled_report.subject_template),
         attachments: [{filename, content}]
       })
  ↓
  [3] Write report_deliveries row (recipient, status, message_id)
  ↓
  [4] Update scheduled_report.last_run_at, next_run_at (compute via cron_expression)
  ↓
  [5] IF delivery failed → retry schedule (5min/30min/2h/12h/24h, DLQ after 5 attempts)
```

---

## 9. Data Model

### 9.1 Materialized Views (P1)

| View | Zrodlo | Kolumny kluczowe | Refresh | RLS filter |
|---|---|---|---|---|
| `mv_yield_by_line_week` | `wo_outputs` + `wo_consumptions` | org_id, site_id, line_id, week_ending, kg_output, kg_usage, yield_pct, target_yield_pct, variance_pct, variance_gbp | 2 min | `org_id` service-layer |
| `mv_yield_by_sku_week` | `wo_outputs` + `products` | org_id, site_id, line_id, product_id, fg_code, week_ending, kg_output, yield_pct, target_yield_pct, variance_gbp | 2 min | `org_id` |
| `mv_factory_kpi_week` | `mv_yield_by_line_week` (agregat) | org_id, site_id, week_ending, weighted_yield_pct, weighted_ga_pct, avg_efficiency_pct, total_cases, total_variance_gbp | 2 min | `org_id` |
| `mv_downtime_by_line` | `downtime_events` (08-PROD §9.6) | org_id, site_id, line_id, date, shift_id, people_mins, process_mins, plant_mins, total_mins | 2 min | `org_id` |
| `mv_qc_holds_summary` | `quality_holds` (09-QA) + `hold_items` | org_id, site_id, date, line_id, product_id, reason_code, boxes_held, boxes_rejected, labour_hours, am_pm | 5 min | `org_id` |
| `mv_inventory_aging` | `license_plates` (05-WH) | org_id, site_id, warehouse_id, product_id, age_bucket, lp_count, total_kg, oldest_expiry | 5 min | `org_id` |
| `mv_wo_status_summary` | `work_orders` + `wo_executions` | org_id, site_id, line_id, status, wo_count, wip_count, avg_duration_min | 2 min | `org_id` |
| `mv_shipment_otd_weekly` | `shipments` + `sales_orders` (11-SHIP) | org_id, site_id, customer_id, week_ending, otd_pct, fulfillment_rate, avg_pack_min | 5 min | `org_id` |
| `mv_integration_health` | cross-outbox UNION | stage, target_system, tenant_id, pending_count, failed_count, dlq_depth, avg_latency_5min | 2 min | `tenant_id` |
| `mv_rules_usage` | `rule_evaluations` audit (02-SET) | rule_id, tenant_id, eval_count_24h, trigger_rate_pct, avg_latency_ms | 5 min | `tenant_id` |

### 9.2 Support tables

```sql
CREATE TABLE mv_refresh_log (
  id BIGSERIAL PRIMARY KEY,
  view_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  rows_affected BIGINT,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 END
  ) STORED,
  status TEXT CHECK (status IN ('started', 'completed', 'failed')),
  error_message TEXT
);

CREATE INDEX idx_mv_refresh_view_time ON mv_refresh_log(view_name, started_at DESC);

CREATE TABLE report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  user_id UUID NOT NULL REFERENCES users(id),
  dashboard_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  date_range JSONB NOT NULL,
  filters JSONB,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'csv', 'xlsx', 'json')),
  file_size_bytes BIGINT,
  sha256_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'failed')) DEFAULT 'generating',
  error_message TEXT,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until DATE NOT NULL GENERATED ALWAYS AS ((exported_at + interval '7 years')::date) STORED,
  archived_to_cold_storage BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_export_user_time ON report_exports(user_id, exported_at DESC);
CREATE INDEX idx_export_retention ON report_exports(retention_until) WHERE archived_to_cold_storage = false;

CREATE TABLE report_access_audits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  dashboard_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('allow', 'deny')),
  deny_reason TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_access_audit_user ON report_access_audits(user_id, accessed_at DESC);
CREATE INDEX idx_access_audit_dashboard ON report_access_audits(dashboard_id, accessed_at DESC);
```

### 9.3 P2 tables (Scheduled Reports, Custom Report Builder)

```sql
-- P2: scheduled reports
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  dashboard_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  filter_dsl JSONB NOT NULL,
  recipients JSONB NOT NULL, -- [{email, name, role}]
  format TEXT NOT NULL CHECK (format IN ('pdf', 'csv', 'xlsx')),
  subject_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_next_run ON scheduled_reports(next_run_at) WHERE enabled = true;

CREATE TABLE report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID NOT NULL REFERENCES scheduled_reports(id),
  tenant_id UUID NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'bounced', 'failed')),
  message_id TEXT, -- Resend message_id
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

-- P2: custom reports
CREATE TABLE custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  base_dashboard_id TEXT NOT NULL,
  filters JSONB NOT NULL,
  columns JSONB NOT NULL, -- [{column_id, display_name, aggregate_fn}]
  is_shared BOOLEAN NOT NULL DEFAULT false,
  shared_with_roles JSONB, -- [role1, role2, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- P2: dashboards catalog metadata (02-SET reference table)
CREATE TABLE dashboards_catalog (
  id TEXT PRIMARY KEY, -- 'factory-overview', 'yield-by-line', etc.
  name TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('P1', 'P2', 'P3')),
  required_role TEXT NOT NULL,
  feature_flag TEXT, -- nullable, PostHog flag if gated
  metadata_schema JSONB, -- available filters + columns
  enabled_for_tenants UUID[], -- allowlist, empty = all
  version TEXT NOT NULL DEFAULT 'v3.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.4 Refresh cron jobs

```sql
-- pg_cron jobs (Supabase Pro) — 2 min prod MVs
SELECT cron.schedule('mv-refresh-prod-2min', '*/2 * * * *', $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_yield_by_line_week;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_yield_by_sku_week;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_factory_kpi_week;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_downtime_by_line;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_wo_status_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_integration_health;
$$);

-- 5 min QC + inventory + shipment
SELECT cron.schedule('mv-refresh-qc-5min', '*/5 * * * *', $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_qc_holds_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_aging;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_shipment_otd_weekly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_rules_usage;
$$);
```

---

## 10. Quality Hold Integration (consumer dashboards)

### 10.1 QC Holds Dashboard (#4, P1)

**Consumer:** `quality_holds` + `hold_items` (09-QA §6). Bez gate — pure read-only dashboard.

**Display:**
- Tabela: Line, Product, Reason (z ref `quality_hold_reasons`), Boxes Held, Boxes Rejected, Staff count, Time Taken, Labour Hours, AM/PM
- Summary card: total boxes held, total labour hours, critical holds count
- Toggle AM/PM/All
- Drill-down: klik row → dedicated `quality_holds` detail view (owned by 09-QA, cross-module navigation)

**Empty state:** "No QC holds today" success message (green checkmark).

### 10.2 NCR Trend Dashboard (P2)

**Consumer:** `ncr_reports` (09-QA §6.3 basic, P2 full workflow EPIC 8G).

**Display:**
- Trend: NCRs per month, 13 months rolling
- Breakdown: by root cause category, by severity (minor/major/critical)
- MTTR: avg time-to-resolution per NCR severity

### 10.3 Regulatory Export Package (P2)

**Consumer:** 09-QA HACCP plans + CCP monitoring + allergen_changeover_validations (08-PROD §9.8) + batch records (05-WH lot_genealogy).

**Output:** Multi-PDF bundle dla BRCGS audit / FDA 483 response / EU health authority request:
1. HACCP plan summary
2. CCP monitoring log (past 12 months)
3. Allergen changeover validations (dual sign-off chain)
4. Batch records + lot genealogy FSMA 204 CTE
5. Quality holds + NCRs z resolution chain

**E-sig P2:** 21 CFR Part 11 — SHA-256 hash + reviewer PIN reverify (reuse 09-QA §5.3 pattern).

---

## 11. Validation Rules (V-RPT-*)

25 validation rules enforcing report integrity, access control, export audit:

### V-RPT-ACCESS (dostep)

- **V-RPT-ACCESS-1:** Request to `/api/reporting/*` BEZ user session → 401 Unauthorized
- **V-RPT-ACCESS-2:** user_role NOT IN allowed_roles for dashboard_id → 403 Forbidden + audit (`report_access_audits.result='deny'`)
- **V-RPT-ACCESS-3:** tenant_id z session != tenant_id query param → 403 (RLS bypass attempt)
- **V-RPT-ACCESS-4:** site_id query param NOT IN user.accessible_sites → 403
- **V-RPT-ACCESS-5:** Dashboard feature_flag SET but tenant NOT IN enabled_for_tenants → 404 Not Found (hide existence)

### V-RPT-QUERY (zapytania)

- **V-RPT-QUERY-1:** Date range span > 2 years → 400 + error "Max 2 years per query, use period aggregates"
- **V-RPT-QUERY-2:** Limit per API call: max 10k rows → 400 if exceeded
- **V-RPT-QUERY-3:** Non-UUID tenant_id → 400 validation error
- **V-RPT-QUERY-4:** Week param NOT Saturday (ISO 8601) → 400 (week_ending convention)
- **V-RPT-QUERY-5:** Fiscal period number 1-13 → 400 if outside

### V-RPT-EXPORT (eksport)

- **V-RPT-EXPORT-1:** Export request > 10k rows → automatic chunked response (multi-file ZIP P2) or 400 error P1
- **V-RPT-EXPORT-2:** sha256_hash NOT NULL enforced at insert (DB constraint)
- **V-RPT-EXPORT-3:** retention_until GENERATED, NOT NULL (7-year BRCGS)
- **V-RPT-EXPORT-4:** file_size_bytes > 100MB → 400 "Export too large, contact admin"
- **V-RPT-EXPORT-5:** Format NOT IN ('pdf', 'csv', 'xlsx'(P2), 'json'(P2)) → 400
- **V-RPT-EXPORT-6:** Duplicate export request (same user, dashboard, filters, within 10s) → 429 (rate limit, deduplicate)
- **V-RPT-EXPORT-7:** Export PDF timeout > 30s (edge function limit) → fail + suggest CSV alternative

### V-RPT-REFRESH (odswiezanie)

- **V-RPT-REFRESH-1:** MV refresh duration > 30s → warning log + Slack alert
- **V-RPT-REFRESH-2:** MV refresh failure 3 consecutive times → critical alert + auto-disable outbox subscriber
- **V-RPT-REFRESH-3:** mv_refresh_log.status='failed' age > 10 min → critical
- **V-RPT-REFRESH-4:** Stale MV detected (last_refresh_at > 15 min, threshold 2× refresh interval) → UI shows "Data stale" indicator

### V-RPT-SCHEDULE (P2 scheduled reports)

- **V-RPT-SCHEDULE-1:** cron_expression invalid syntax → 400 (validate pre-save)
- **V-RPT-SCHEDULE-2:** recipients empty → 400
- **V-RPT-SCHEDULE-3:** recipient email invalid → 400 per email
- **V-RPT-SCHEDULE-4:** Delivery failure 5 attempts → move to DLQ (same pattern as outbox stages)
- **V-RPT-SCHEDULE-5:** scheduled_report.enabled=true BUT next_run_at IS NULL → auto-compute next_run_at from cron

### V-RPT-SITE (multi-site)

- **V-RPT-SITE-1:** MV query WHERE site_id IS NOT DISTINCT FROM :current_site OR site_id IS NULL enforced (REC-L1)
- **V-RPT-SITE-2:** Cross-site aggregation allowed ONLY dla role `reporting_admin` + explicit flag `&allow_cross_site=true`

### V-RPT-METADATA (P2 custom reports)

- **V-RPT-METADATA-1:** custom_reports.columns MUST reference valid column_id from dashboards_catalog.metadata_schema
- **V-RPT-METADATA-2:** custom_reports.filters JSON validates against Zod schema (R4)

---

## 12. INTEGRATIONS (Read-only Consumer, No Push) [LEGACY-D365]

### 12.1 Outbox Consumer Pattern

12-REPORTING **NIE produkuje** eventow do D365 ani innych external systems. Jest pure internal analytics layer. Jednak czyta status WSZYSTKICH outbox tables dla **Integration Health Dashboard (#9)**.

**Read-only queries (no locking, no write):**
- `items_outbox_events` (stage 1 D365 pull status)
- `production_outbox_events` (stage 2 D365 WO confirm)
- `shipping_outbox_events` (stage 3 D365 SO confirm)
- `warehouse_outbox_events` (stage 4 P2 EPCIS, if enabled)
- `finance_outbox_events` (stage 5 D365 cost posting)
- `rma_outbox_events` (stage 6 P2 credit memo, if enabled)
- DLQ tables: `d365_push_dlq`, `shipping_push_dlq`, `finance_push_dlq`, `items_push_dlq`

### 12.2 Integration Health MV

```sql
CREATE MATERIALIZED VIEW mv_integration_health AS
SELECT
  'stage_1_items' AS stage,
  'd365_items_pull' AS target_system,
  tenant_id,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'dispatching') AS dispatching_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'in_dlq') AS dlq_depth,
  AVG(EXTRACT(EPOCH FROM (delivered_at - enqueued_at)))
    FILTER (WHERE delivered_at > now() - interval '5 min') AS avg_latency_5min_sec
FROM items_outbox_events
WHERE enqueued_at > now() - interval '24 hours'
GROUP BY tenant_id

UNION ALL
SELECT 'stage_2_wo', 'd365_wo_confirm', tenant_id,
  COUNT(*) FILTER (WHERE status = 'pending'),
  COUNT(*) FILTER (WHERE status = 'dispatching'),
  COUNT(*) FILTER (WHERE status = 'failed'),
  COUNT(*) FILTER (WHERE status = 'in_dlq'),
  AVG(EXTRACT(EPOCH FROM (delivered_at - enqueued_at))) FILTER (WHERE delivered_at > now() - interval '5 min')
FROM production_outbox_events
WHERE enqueued_at > now() - interval '24 hours'
GROUP BY tenant_id

UNION ALL
SELECT 'stage_3_so', 'd365_so_confirm', tenant_id, ... FROM shipping_outbox_events ...

UNION ALL
SELECT 'stage_5_cost', 'd365_cost_post', tenant_id, ... FROM finance_outbox_events ...
;

-- P2: add stage_4 EPCIS, stage_6 RMA
```

### 12.3 Dashboard alerts (DSL, P2)

Potential P2 DSL rule `integration_alert_gate_v1`:
- IF `dlq_depth > 10` dla danego stage → Slack/Teams alert + email admin
- IF `avg_latency_5min_sec > 300` (5min threshold) → warning alert
- IF `failed_count > 50 / hour` → critical alert

Rule registered w 02-SET §7.8 (P2 stub).

### 12.4 No D365 Push (reports stay internal)

Reports NIE sa pushowane do D365. Jest to zgodne z Strategic Decision: D365 retirement w horyzoncie — nowy BI layer w Monopilot zastępuje Excel-from-D365 exports.

**Only producer:** `report_exports` (audit trail), `report_deliveries` (P2 email status), `report_access_audits` (RLS audit). Wszystkie internal tables, NIE outbox external.

---

## 13. Labels & Formatting Conventions

### 13.1 Dashboard layout standards

- **Responsive grid:** Desktop 12-col (xl ≥1280px), Tablet 8-col (md ≥768px), Mobile 4-col (sm ≥640px)
- **KPI cards:** 5 per row desktop, 3+2 tablet, 2 per row mobile
- **Trend charts:** aspect ratio 16:9, min height 300px, responsive width
- **Heatmaps:** square cells, min 40×40px, max 80×80px
- **Tables:** sticky header, horizontal scroll mobile, row hover highlight

### 13.2 Color coding standards

| Usage | Color | Hex |
|---|---|---|
| KPI positive (green) | green-600 | #16A34A |
| KPI negative (red) | red-600 | #DC2626 |
| KPI neutral (gray) | gray-500 | #6B7280 |
| Target line (dashed) | blue-500 | #3B82F6 |
| Grade A | green-500 | #22C55E |
| Grade B | blue-500 | #3B82F6 |
| Grade C | amber-500 | #F59E0B |
| Grade D | red-500 | #EF4444 |
| Downtime People | blue-500 | #3B82F6 |
| Downtime Process | amber-500 | #F59E0B |
| Downtime Plant | red-500 | #EF4444 |
| OEE > 85% world-class | green-500 | #22C55E |
| OEE 65-85% typical | amber-500 | #F59E0B |
| OEE < 65% poor | red-500 | #EF4444 |

### 13.3 Number formatting (locale-aware)

- **Percentage:** 1 decimal place (`95.3%`)
- **KG weight:** thousands separator, no decimal (`1,234 kg`)
- **GBP currency:** thousands separator, 2 decimals (`£12,345.67`)
- **Date:** ISO 8601 display `YYYY-MM-DD` (tenant-configurable: `DD/MM/YYYY` UK, `MM/DD/YYYY` US)
- **Week:** `W/E DD/MM/YYYY` format (week ending Saturday)
- **Period:** `Pnn YYYY` (e.g., `P02 2026`)

### 13.4 Accessibility (WCAG 2.1 AA)

- Color contrast ratio ≥ 4.5:1 text, ≥ 3:1 UI elements
- Chart color-blind safe palette (ColorBrewer schemes)
- Keyboard navigation: all dashboards navigable Tab/Shift-Tab
- Screen reader: ARIA labels on KPI cards, chart descriptions
- Focus indicators visible on all interactive elements

---

## 14. Regulatory Alignment

### 14.1 BRCGS Issue 10 (Food Safety)

- **Audit trail 7-year retention:** `report_exports.retention_until` GENERATED `(exported_at + interval '7 years')::date`
- **Archive to cold storage:** nightly cron moves `archived_to_cold_storage=false AND retention_until > now()` to S3/GCS Glacier tier
- **Regulatory Export Package (P2):** complete BRCGS audit bundle (see §10.3)

### 14.2 FSMA 204 (USA, 2028 deadline)

- **Lot Genealogy Report (P2):** consumer 05-WH §11 recursive CTE, <30s render, PDF export for recall response
- **Traceability matrix:** per-batch forward (where-did-it-go) + backward (where-did-it-come-from)

### 14.3 EU 1169/2011 (Allergen Labelling)

- **Allergen Compliance Report (P2):** per-SKU allergen declarations + cascade chain validation (03-TECH ADR-029)
- **Display in reports:** allergens bold on any customer-facing export (BOL, packing slip, COA)

### 14.4 21 CFR Part 11 (FDA Electronic Records)

- **P2 only** (read-only dashboards nie wymagaja e-sig P1)
- **Regulatory export packages:** SHA-256 hash + reviewer PIN reverify + immutable archive
- Reuse 09-QA §5.3 pattern

### 14.5 GDPR

- **Operator leaderboards (P2):** per-tenant L2 config `reporting.leaderboard_anonymize` (default true, Apex: false — internal ops)
- **PII in exports:** user_id hashed in `report_exports.exported_by_hash`, full name only via `users` join (RLS enforced)
- **Data retention:** HR data (leaderboards) max 2 years unless explicit consent

### 14.6 Data Residency (R7)

- EU tenant exports → EU storage only (S3 eu-west-1 / GCS europe-west2)
- Region enforcement in export edge function (tenant region from `organizations.data_residency`)

---

## 15. Screens (Desktop)

### 15.1 P1 Dashboards (10 screens)

| # | Screen ID | Route | Dashboard | Sub-module |
|---|---|---|---|---|
| 1 | RPT-001 | `/reporting/factory-overview` | Factory Overview | 12-a |
| 2 | RPT-002 | `/reporting/yield-by-line` | Yield by Line | 12-a |
| 3 | RPT-003 | `/reporting/yield-by-sku` | Yield by SKU | 12-a |
| 4 | RPT-004 | `/reporting/qc-holds` | QC Holds | 12-b |
| 5 | RPT-005 | `/reporting/oee-summary` | OEE Summary (consumer 15-OEE) | 12-b |
| 6 | RPT-006 | `/reporting/inventory-aging` | Inventory Aging | 12-c |
| 7 | RPT-007 | `/reporting/wo-status` | WO Status | 12-c |
| 8 | RPT-008 | `/reporting/shipment-otd` | Shipment OTD | 12-c |
| 9 | RPT-009 | `/reporting/integration-health` | Integration Health | 12-d |
| 10 | RPT-010 | `/reporting/rules-usage` | Rules Usage Analytics | 12-d |

**Common UI elements across dashboards:**
- Global header: tenant selector, site selector (if multi-site), user menu
- Time selector: Week selector P1 (W/E DD/MM/YYYY dropdown), Day/Week/Period/Year toggle P2
- Filter bar: context-dependent (line, shift, product category, supervisor)
- Export button: PDF / CSV / Copy-to-Clipboard dropdown
- Last refresh indicator: "Data as of: HH:MM" + refresh icon
- Empty state: "No data for selected period" with suggested action

### 15.2 P1 Support screens

- `/reporting/exports` — user's export history (z `report_exports` table) + download links dla not-yet-archived exports
- `/reporting/saved-views` — P1 simple: saved filter presets per user (lightweight, przed full custom builder P2)

### 15.3 P2 Dashboards + Admin (15+ screens)

- E3 Advanced Analytics: Giveaway, Leader Scorecard, Daily Issues, Shift Performance (4 dashboards)
- E4 Period & Comparison: Supervisor Comparison, Period Reports 4-4-5, Multi-granularity time (3 dashboards + global selector)
- NCR Trend, Lot Genealogy, WIP Dashboard, Cost Variance, Customer Fulfillment, Operator Leaderboard, Regulatory Export Package (7 dashboards)
- Admin screens: Custom Report Builder DSL, Scheduled Reports config, External BI Embed config (3 screens)

---

## 16. Build Roadmap & Sub-modules 12-a..e

### Sub-module 12-a — Core Production Dashboards (5-6 sesji impl) [P1]

**Scope:**
- 3 dashboards: Factory Overview (RPT-001), Yield by Line (RPT-002), Yield by SKU (RPT-003)
- Data pipeline: mv_yield_by_line_week, mv_yield_by_sku_week, mv_factory_kpi_week, mv_refresh_log
- API endpoints: factory-overview, yield-by-line, yield-by-sku, refresh-status
- Fiscal calendar engine (`generate_fiscal_periods` function)
- Chart library integration D3.js + Recharts
- Rule `report_access_gate_v1` implementation
- Base layout components (KPI cards, trend chart, top 3 panels, week selector)
- Tests: MV accuracy vs manual Excel calc

**Blocking:** Wymaga 08-PROD sub-modules a-c (execution + consumption + downtime baseline) + 02-SETTINGS sub-module b (reference tables)
**Unblocks:** 12-b (QC Holds, OEE Summary)

### Sub-module 12-b — Quality + OEE Consumer (3-4 sesji impl) [P1]

**Scope:**
- 2 dashboards: QC Holds (RPT-004), OEE Summary (RPT-005 consumer 15-OEE)
- MV: mv_qc_holds_summary, (consumer) oee_daily_summary z 15-OEE
- API endpoints: qc-holds, oee-summary
- Cross-module navigation: drill-down do 09-QA quality hold detail

**Blocking:** Wymaga 09-QUALITY sub-module a + 15-OEE sub-module a
**Unblocks:** 12-c (inventory + WO + shipment dashboards)

### Sub-module 12-c — Operational Dashboards (4-5 sesji impl) [P1]

**Scope:**
- 3 dashboards: Inventory Aging (RPT-006), WO Status (RPT-007), Shipment OTD (RPT-008)
- MV: mv_inventory_aging, mv_wo_status_summary, mv_shipment_otd_weekly
- API endpoints

**Blocking:** Wymaga 05-WAREHOUSE + 11-SHIPPING sub-modules a
**Unblocks:** 12-d (integration + rules)

### Sub-module 12-d — Admin Dashboards + Export P1 (3-4 sesji impl) [P1]

**Scope:**
- 2 dashboards: Integration Health (RPT-009), Rules Usage Analytics (RPT-010)
- MV: mv_integration_health (cross-outbox UNION), mv_rules_usage
- Export engine: PDF edge function (Puppeteer), CSV streaming
- report_exports table + retention logic + nightly archive cron

**Blocking:** Wymaga outbox tables z 08/11/10 (stages 2/3/5) + 02-SETTINGS §7.8 rules registry
**Unblocks:** Full P1 deployment, unblocks 12-e (operator scorecards P2 stub)

### Sub-module 12-e — Operator KPI Scorecards P2 stub (2-3 sesji impl) [P1 scaffold]

**Scope:**
- Operator Leaderboard scaffolding (consumer 08-PROD `operator_kpis_monthly` MV, z D11)
- Feature flag `reporting.v2_dashboards` gate
- P2 full implementation w osobnej fazie (E3 Advanced Analytics)

**Blocking:** 08-PROD sub-module f (dashboard+OEE)
**Unblocks:** nothing w P1 (P2 E3 unblocks Giveaway, Daily Issues, Shift Performance)

### Total P1 estimate: 17-22 sesji

### P2 Build (post-P1)

| Sub-module | Scope | Est. sesji |
|---|---|---|
| 12-F | E3 Advanced Analytics (Giveaway, Leader Scorecard, Daily Issues, Shift Performance) | 6-8 |
| 12-G | E4 Period & Comparison (Supervisor, Period Reports, Multi-granularity) | 4-5 |
| 12-H | Additional dashboards (NCR Trend, Lot Genealogy, WIP, Cost Variance, Customer Fulfillment) | 5-6 |
| 12-I | Custom Report Builder DSL + Saved Views advanced | 4-5 |
| 12-J | Scheduled Reports + Email Delivery (Resend consumer) | 3-4 |
| 12-K | External BI Embed (Metabase/Grafana) | 2-3 |
| 12-L | Excel (XLSX) + JSON/Parquet exports | 2-3 |
| 12-M | Regulatory Export Package (BRCGS + FDA 483 bundle) + 21 CFR e-sig | 3-4 |
| 12-N | Per-org dashboard customization (ADR-031 L2) | 4-5 |
| 12-O | ML anomaly detection (R12) | TBD |

**Total P2 estimate:** 33-43 sesji

---

## 17. Open Questions (OQ-RPT-*)

| ID | Pytanie | Status | Follow-up |
|---|---|---|---|
| OQ-RPT-01 | Czy orgy preferujace SaaS BI (Metabase/Grafana) maja quota na tenant API calls? | P2 | Define rate limits per tenant tier |
| OQ-RPT-02 | Scheduled reports — czy ma byc trigger "on event" (np. WO completed) obok cron? | P3 | Event-triggered reports backlog |
| OQ-RPT-03 | Real-time dashboards (WebSocket) — czy ma byc future escape hatch? | Wycofane | Exclusion §4.3 |
| OQ-RPT-04 | Mobile-native dashboards (React Native) — czy worth investment? | P3 | PWA responsive P1 wystarcza dla 95% cases |
| OQ-RPT-05 | Dashboard print-to-PDF via browser (user-initiated) vs edge function — which default? | P1 | Start z edge function, browser jako fallback |
| OQ-RPT-06 | Custom report builder — czy admin moze tworzyc reports na cudzych tabelach (cross-module joins)? | P2 | Safe SQL generator z allowlist tables |
| OQ-RPT-07 | Report sharing — czy shared custom_reports widoczne w catalog? | P2 | Permission model per custom_report |
| OQ-RPT-08 | Tenant-specific color branding (logo, palette override) w exportach | P2 | ADR-031 L2 variation |
| OQ-RPT-09 | Offline report caching (PWA dla audit access w terenie) | P3 | Service Worker cache strategy |
| OQ-RPT-10 | Cost reporting attribution — czy MV refresh cost attributable per tenant? | P2 | Cost-per-tenant dashboard internal |

Wszystkie OQ — P2/P3 / post-launch / nie blokuja P1.

---

## 18. Changelog

### v3.0 — 2026-04-20 (Phase C5 Sesja 1)

**Breaking changes vs v1.0:**
- Rozszerzenie z 6 epics do 10 core P1 dashboards + 20 P2 dashboards/features
- Rename sekcji do Phase D convention (19 sekcji)
- Markers [UNIVERSAL]/[APEX-CONFIG]/[EVOLVING]/[LEGACY-D365] przez caly dokument
- Dodano §5 Regulatory (BRCGS 7y, FSMA 204, EU 1169/2011, 21 CFR Part 11 P2)
- Dodano §7 Rule Registry (2 rules: `report_access_gate_v1` P1, `scheduled_report_distribution_v1` P2)
- Dodano §11 Validation rules V-RPT-* (25 rules access/query/export/refresh/schedule/site/metadata)
- Dodano §12 INTEGRATIONS read-only consumer pattern (NIE push)
- Dodano §14 Regulatory Alignment (BRCGS/FSMA/EU/21 CFR/GDPR/Data Residency)
- Dodano §16 Build Roadmap (5 sub-modules 12-a..e, est. 17-22 sesji P1)

**Retained od v1.0:**
- D-RPT-1..8 (decisions baseline)
- 11 materialized views baseline (yield, factory, downtime, qc holds)
- Fiscal calendar 4-4-5 engine
- Chart library D3.js + Recharts
- Personas baseline (Plant Director, Production Manager, Shift Lead, Supervisor, QA Manager)

**New v3.0:**
- D-RPT-9 OEE Consumer Integration (15-OEE MV consumer)
- D-RPT-10 Feature Flag Rollout (PostHog self-host)
- Integration Health Dashboard (#9) z cross-outbox UNION view
- Rules Usage Analytics Dashboard (#10)
- OEE Summary card embedded w Factory Overview (consumer 15-OEE)
- report_exports z sha256_hash + 7-year retention GENERATED
- report_access_audits dla RBAC + RLS enforcement
- dashboards_catalog metadata-driven access control
- Scheduled Reports + Custom Reports P2 schema scaffolding

---

## 19. References

### Dependencies (upstream PRDs)

- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — 6 principles, R4 Zod validation, R6 PostHog, R12 ML roadmap, R14 idempotency
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.1 — §7.8 rules registry, §8.1 reference tables (`fiscal_periods`, `grade_thresholds`, `target_kpis`, `downtime_categories`, `dashboards_catalog`), §10 feature flags, §11.8 INTEGRATIONS stages summary, §13 EmailConfig (Resend)
- [`08-PRODUCTION-PRD.md`](./08-PRODUCTION-PRD.md) v3.0 — §9.1-9.4 wo_outputs/wo_consumptions, §9.6 downtime_events, §9.9 oee_snapshots (consumer via 15-OEE), §9.10 production_outbox_events, §9.12 operator_kpis_monthly MV
- [`09-QUALITY-PRD.md`](./09-QUALITY-PRD.md) v3.0 — §6 quality_holds + hold_items, §8 ncr_reports (P2 trend), §10 batch_release_gate_v1 rule (P2 consumer)
- [`05-WAREHOUSE-PRD.md`](./05-WAREHOUSE-PRD.md) v3.0 — §6 license_plates (inventory aging), §11 lot_genealogy FSMA 204 (P2 lot genealogy report)
- [`11-SHIPPING-PRD.md`](./11-SHIPPING-PRD.md) v3.0 — §9 shipments + sales_orders (OTD dashboard), §12 shipping_outbox_events (integration health)
- [`10-FINANCE-PRD.md`](./10-FINANCE-PRD.md) v3.0 — §6 wip_balances (P2 WIP dashboard), §9 inventory_cost_layers (P2 cost variance)
- [`15-OEE-PRD.md`](./15-OEE-PRD.md) v3.0 — `oee_daily_summary` MV (primary consumer Factory Overview card), D-OEE-* decisions

### ADRs

- ADR-028 (schema-driven L1-L4) — dashboards_catalog metadata, custom_reports builder
- ADR-029 (rule engine DSL + workflow-as-data) — report_access_gate_v1, scheduled_report_distribution_v1
- ADR-030 (configurable depts/modules) — feature flags per tenant
- ADR-031 (schema variation per org) — per-org dashboard customization P2

### Research

- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) — §9 "12-REPORTING" + "15-OEE", R6 PostHog, R12 ML roadmap, §6 analytics stack (buy vs build decision)

### Strategic Decisions (Phase 0)

- Decision #6: "Custom reports = universal templates + metadata-driven content" — D-RPT-1..10 foundation
- Decision #10: Testing framework Vitest — applies to MV accuracy tests

### Cross-PRD Integration Stages

- Stage 1 (items/BOM D365 pull): 03-TECHNICAL §13
- Stage 2 (WO confirm D365 push): 08-PRODUCTION §12 — consumer w Integration Health Dashboard
- Stage 3 (SO confirm D365 push): 11-SHIPPING §12 — consumer w Integration Health Dashboard
- Stage 4 (EPCIS P2): 05-WAREHOUSE §13.7 — P2 consumer
- Stage 5 (cost posting D365): 10-FINANCE §12 — consumer w Integration Health Dashboard
- Stage 6 (RMA credit P2): 11-SHIPPING P2 — P2 consumer

---

_PRD 12-REPORTING v3.0 — 10 P1 dashboards + 20 P2 dashboards/features, 10 D-RPT decisions, 2 DSL rules registered, 25 V-RPT validation rules, 5 sub-modules P1 (12-a..e est. 17-22 sesji impl), 11 P2 sub-modules (12-F..12-O est. 33-43 sesji), BRCGS 7y audit retention, 21 CFR e-sig P2, FSMA 204 P2, EU 1169/2011 P2, GDPR anonymize toggle, R7 data residency enforced._
