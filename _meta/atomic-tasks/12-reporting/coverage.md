# 12-REPORTING Atomic Task Coverage

PRD: `docs/prd/12-REPORTING-PRD.md` (v3.2 + 2026-04-30 audit reconciliation)

Source bootstrap audit: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §"Modules without Atomic-Tasks (10-15) — Priority Slices" §12-REPORTING (8 slices: RPT-001..008).

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **12-REPORTING-a** | Core production dashboards + foundation (Factory Overview + Yield by Line/SKU; KPI glossary; permissions; MV base; refresh worker; fiscal calendar; DSL rule) | T-001..T-005, T-009, T-010, T-015, T-016, T-017 |
| **12-REPORTING-b** | Quality + OEE consumer (QC Holds + OEE Summary; cross-module consumer helpers) | T-006, T-011, T-012, T-018, T-019 |
| **12-REPORTING-c** | Operational dashboards (Inventory Aging + WO Status + Shipment OTD) | T-007, T-020 |
| **12-REPORTING-d** | Admin dashboards + Export P1 (Integration Health + Rules Usage + Export engine + action modals) | T-013, T-014, T-021, T-022, T-026 |
| **12-REPORTING-e** | Catalog + support + P1 modals + Admin settings (RPT-HOME + RPT-EXPORTS + RPT-SAVED + RPT-SETTINGS + 5 P1 modals) | T-008, T-023, T-024, T-025 |
| **E2E** | P1 acceptance spine (10 dashboards + export + cross-org + audit + perf) | T-027 |

## Coverage rows (T-001..T-027)

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §3 (RBAC mapping) + §11 V-RPT-ACCESS-* | tasks/T-001.json | 12-REPORTING-a | T1-schema | covered |
| §6 D-RPT-3, §6 D-RPT-9, §9.1, §10 | tasks/T-002.json | 12-REPORTING-a | T1-schema | covered |
| §9.1 (mv_yield_*+factory), §5 Techniczne, §6 D-RPT-1/D-RPT-3 | tasks/T-003.json | 12-REPORTING-a | T1-schema | covered |
| §9.2, §11 V-RPT-REFRESH-*/EXPORT-2/3/ACCESS-2/3, §14.1 | tasks/T-004.json | 12-REPORTING-a | T1-schema | covered |
| §9.4, §6 D-RPT-6, §11 V-RPT-REFRESH-1..4 | tasks/T-005.json | 12-REPORTING-a | T2-api | covered |
| §9.1 (qc_holds + downtime), §10.1, §6 D-RPT-7 | tasks/T-006.json | 12-REPORTING-b | T1-schema | covered |
| §9.1 (inventory+wo+shipment), §4.1 #6/#7/#8 | tasks/T-007.json | 12-REPORTING-c | T1-schema | covered |
| §15.1a RPT-018, §9.3 dashboards_catalog, §15.2 RPT-HOME | tasks/T-008.json | 12-REPORTING-e | T1-schema | covered |
| §7.1 report_access_gate_v1, §11 V-RPT-ACCESS-1..5 | tasks/T-009.json | 12-REPORTING-a | T2-api | covered |
| §6 D-RPT-2 fiscal calendar, §11 V-RPT-QUERY-4/5 | tasks/T-010.json | 12-REPORTING-a | T1-schema | covered |
| §6 D-RPT-9 OEE consumer, §4.1 #5 | tasks/T-011.json | 12-REPORTING-b | T2-api | covered |
| §10.1 QC Holds dashboard, §4.1 #4 | tasks/T-012.json | 12-REPORTING-b | T2-api | covered |
| §8.4 export flow, §11 V-RPT-EXPORT-1..7, §14.1 | tasks/T-013.json | 12-REPORTING-d | T2-api | covered |
| §12.1/§12.2 integration health + §9.1 rules_usage, §4.1 #9/#10 | tasks/T-014.json | 12-REPORTING-d | T1-schema | covered |
| §15.2 RPT-HOME, §9.3, §6 D-RPT-10, §13.1 | tasks/T-015.json | 12-REPORTING-e | T3-ui | covered |
| §15.1 RPT-001 Factory Overview, §4.1 #1, §8.1, §13.1, §6 D-RPT-9 | tasks/T-016.json | 12-REPORTING-a | T3-ui | covered |
| §15.1 RPT-002 + RPT-003, §4.1 #2/#3 | tasks/T-017.json | 12-REPORTING-a | T3-ui | covered |
| §15.1 RPT-004, §10.1, §4.1 #4 | tasks/T-018.json | 12-REPORTING-b | T3-ui | covered |
| §15.1 RPT-005, §4.1 #5, §6 D-RPT-9 | tasks/T-019.json | 12-REPORTING-b | T3-ui | covered |
| §15.1 RPT-006/RPT-007/RPT-008, §4.1 #6/#7/#8 | tasks/T-020.json | 12-REPORTING-c | T3-ui | covered |
| §15.1 RPT-009, §4.1 #9, §12.2 | tasks/T-021.json | 12-REPORTING-d | T3-ui | covered |
| §15.1 RPT-010, §4.1 #10 | tasks/T-022.json | 12-REPORTING-d | T3-ui | covered |
| §15.2 RPT-EXPORTS + RPT-SAVED, §14.1 | tasks/T-023.json | 12-REPORTING-e | T3-ui | covered |
| §15.1a RPT-014/RPT-015/RPT-017/RPT-019/RPT-020 | tasks/T-024.json | 12-REPORTING-e | T3-ui | covered |
| §15.2 RPT-SETTINGS, §9.4, §13 | tasks/T-025.json | 12-REPORTING-e | T3-ui | covered |
| §8.4, §15.1a RPT-011, §15.1a RPT-018 | tasks/T-026.json | 12-REPORTING-d | T3-ui | covered |
| §2 Metryki P1 + §11 V-RPT-ACCESS/EXPORT/REFRESH spine | tasks/T-027.json | E2E | T4-wiring-test | covered |

## Auditor A priority-slice mapping

Auditor A enumerated 8 priority slices (`_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §"Modules without Atomic-Tasks — 12-REPORTING"). Mapping below:

| Auditor slice | Atomized as | Notes |
|---|---|---|
| RPT-001 MV base (`mv_yield_by_line`, `mv_yield_by_sku`, `mv_inventory_aging`, `mv_wo_status`, `mv_shipment_otd`, `mv_oee_summary` consumer) | T-003 (yield+factory) + T-006 (qc+downtime) + T-007 (inventory+wo+shipment) + T-011 (oee consumer) | Split per source-table dependency boundary for parallelism. |
| RPT-002 pg_cron refresh + Edge Function fallback | T-005 | Worker job under Foundation T-111 JobRegistry. |
| RPT-003 Dashboard catalog + 10 core dashboards | T-008 (catalog schema + Server Actions) + T-015 (RPT-HOME UI) + T-016..T-022 (10 dashboard pages) | Auditor's single slice atomized into 1 schema + 1 catalog UI + 7 dashboard tasks. |
| RPT-004 Export CSV/PDF P1 + saved-filter + share APIs | T-013 (export engine) + T-008 (saved_filter_presets schema + Server Actions) + T-026 (modals) | Three-task split for clarity. |
| RPT-005 Scheduled reports email delivery (P2 stub) | DEFERRED to P2 — explicit out-of-scope; ephemeral share link in T-026 (P1 only) | RPT-013 / RPT-016 / RPT-SCHED / RPT-SCHED-EDIT all P2. |
| RPT-006 Quality hold consumer dashboards | T-006 (mv_qc_holds_summary) + T-012 (consumer helper) + T-018 (RPT-004 UI) | Cross-module consumer pattern. |
| RPT-007 rpt_integration_health UI + D365 / outbox DLQ inspector | T-014 (MV) + T-021 (UI) | DLQ replay deferred to admin/integrations module. |
| RPT-008 Permissions enum delta (rpt.dashboard.view, rpt.export.*, rpt.schedule.*, rpt.preset.save) | T-001 (priority 90, p0-blocker) | 14 strings: rpt.dashboard.view, rpt.export.{csv,pdf}, rpt.preset.{save,share,delete}, rpt.schedule.{create,run_now,delete}, rpt.settings.{read,edit}, rpt.mv.refresh, rpt.integration.read, rpt.rules_usage.read. xlsx/bi_embed reserved for P2. |

Additionally — beyond Auditor A's 8 slices, this bootstrap atomized:
- **T-002 KPI glossary** — `_foundation/contracts/reporting-kpi-glossary.md` + TS export. Translation-notes red line "KPI definitions in version-controlled glossary". Single SSOT cited by all dashboards.
- **T-009 report_access_gate_v1 DSL rule + middleware** — PRD §7.1 + V-RPT-ACCESS-1..5; not in Auditor's slice list but P1 mandatory.
- **T-010 fiscal calendar engine** — PRD §6 D-RPT-2; P1 scaffold for P2 Period Reports + V-RPT-QUERY-5.
- **T-004 support tables (mv_refresh_log + report_exports + report_access_audits)** — PRD §9.2; required by T-005 refresh worker + T-013 export engine + T-009 access audit.
- **T-024 P1 modals batch** — 5 modals (error_log + refresh_confirm + delete_confirm + p2_toast + access_denied) for the support surface.
- **T-027 P1 E2E spine** — covers §2 acceptance metrics (0 cross-tenant leaks, P95 < 2s, export success, audit trail) end-to-end.

## P2 / deferred coverage (NOT in P1 task set, explicit out-of-scope)

| PRD ref | Phase | Reason |
|---|---|---|
| §4.2 #1..#20 (E3 Giveaway, Leader Scorecard, Daily Issues, Shift Performance; E4 Supervisor Comparison, Period Reports, Multi-granularity; NCR Trend, Lot Genealogy, WIP, Cost Variance, Customer Fulfillment, Operator Leaderboard, Regulatory Export, Custom DSL Builder, Scheduled Reports, External BI Embed, xlsx/json exports) | P2 | All gated by flags; some `[NO-PROTOTYPE-YET]` |
| §15.1a RPT-012 regulatory_signoff_modal | P2 | 21 CFR Part 11 e-sig; gated by 21 CFR mode |
| §15.1a RPT-013 recipient_group_modal | P2 | Scheduled reports dependency |
| §15.1a RPT-016 run_now_confirm_modal | P2 | Scheduled reports dependency |
| §15.1b RPT-SCHED + RPT-SCHED-EDIT | P2 | Scheduled reports list/edit |
| schedule_report_modal (modals.jsx:151-255) | P2 | Scheduled reports wizard |
| §10.2 NCR Trend Dashboard | P2 | Requires 09-QUALITY 09-d epic (un-atomized per Auditor A) |
| §10.3 Regulatory Export Package | P2 | Multi-PDF bundle + 21 CFR e-sig |

## Cross-module dependencies declared

See `manifest.json` `cross_module_dependencies` for the full list. Highlights:

- **15-OEE (0 atomic tasks today)**: T-011 graceful degradation pattern + T-019 placeholder. Per D-RPT-9 reporting is a consumer; never duplicates aggregation.
- **11-SHIPPING (0 atomic tasks today)**: T-007 IF EXISTS guard on `mv_shipment_otd_weekly`; T-020 graceful degradation banner on /reporting/shipment-otd.
- **10-FINANCE (0 atomic tasks today)**: T-014 IF EXISTS guard on stage-5 outbox UNION.
- **09-QUALITY** (Holds covered; NCR/HACCP P2): T-006 / T-012 / T-018 read-only consumer.
- **08-PRODUCTION**: T-003 / T-006 / T-007 / T-014 source consumers; never writes.
- **05-WAREHOUSE**: T-007 (`mv_inventory_aging`).
- **02-SETTINGS**: rule registry / users / fiscal_calendar_type / downtime_categories / feature flags / audit_log / Resend / i18n.
- **00-FOUNDATION**: T-046 (enum-lock), T-111 (worker), T-112 (outbox), T-116 (OTel), T-121 (rate-limit), T-123 (Playwright), T-125 (app.current_org_id).

## Reporting-specific red lines enforced (translation-notes)

| Red line | Enforced in |
|---|---|
| Read-model views (not transactional joins) | T-003, T-006, T-007, T-014 (D-RPT-1) |
| Refresh cadence per report (2-min prod / 5-min QC / 15-min period) | T-005 cron jobs |
| RBAC at view level (RLS-via-service for MVs) | T-003, T-006, T-007, T-009, T-011, T-012, T-014 |
| No data-warehouse export of raw PII | T-013 export engine sanitisation; T-022 PII redaction; §13.5 GDPR |
| KPI definitions in version-controlled glossary | T-002 `_foundation/contracts/reporting-kpi-glossary.md` |
| Dashboards parameterized by tenant | T-009 middleware + service helpers org+site filter |
| Long-running queries on worker, not UI | T-005 refresh worker; T-013 export worker |
| Consumer pattern (no aggregation duplication) | T-011 OEE consumer; T-012 quality holds consumer |

## Notes

- Wave0 v4.3 lock: ALL business-scope columns use `org_id` even though PRD §9.2/§12.2 use `tenant_id` label. Per NPD T-006 red-flag #7 in `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md`.
- IF EXISTS guards apply for 10-FINANCE / 11-SHIPPING / 15-OEE source tables — those modules have 0 atomic tasks at this writing; graceful degradation is the contract.
- next-intl wrapping is mandatory for ALL user-visible strings (translation-notes red line) — every UI task includes `reporting.{...}.*` keys + `apps/web/messages/{en,pl}/reporting-*.json` files.
- BL-PROD-05 (.btn-danger fix) is resolved in T-024 RPT-017 by using `Button variant='destructive'` per packages/ui shadcn primitive.
- BL-RPT-02 (D3 → Recharts) applied in all chart components (T-016/T-017/T-019/T-020/T-021/T-022).
- BL-RPT-04 (@media print CSS for Puppeteer PDF) applied in T-013 export engine + T-016 combo chart wrapper.
