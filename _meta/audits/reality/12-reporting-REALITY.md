# 12-reporting — Reality Audit (2026-06-02)

## Counts
- task files: 27 | manifest task_count: 27 | STATUS rows: 0 (no prior STATUS.md existed) → reconciliation: full creation required.

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Lock reporting permission enum (rpt.* baseline) | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` exists but contains ZERO rpt.* strings | 14 rpt.* strings absent; ALL_REPORTING_CORE_PERMISSIONS not exported; no test assertions for rpt.* in `packages/rbac/src/__tests__/permissions.test.ts` |
| T-002 | KPI glossary (yield/GA/efficiency/OEE-consumer formulas) | T1-schema | ⛔ MISSING | `packages/reporting/` does NOT exist; `_foundation/contracts/reporting-kpi-glossary.md` absent | No KpiDefinition type, no KPI_GLOSSARY export, no test |
| T-003 | Yield + Factory KPI materialized views DDL | T1-schema | ⛔ MISSING | Migration `0080_reporting_mv_yield.sql` absent; `packages/db/src/schema/reporting-views.ts` absent | No MVs: mv_yield_by_line_week, mv_yield_by_sku_week, mv_factory_kpi_week |
| T-004 | Reporting support tables (refresh log, exports, access audits) | T1-schema | ⛔ MISSING | Migration `0081_reporting_support_tables.sql` absent | mv_refresh_log, report_exports, report_access_audits all absent; no RLS policies |
| T-005 | MV refresh worker job (pg_cron + Edge Function fallback) | T2-api | ⛔ MISSING | `apps/worker/` directory does NOT exist (Foundation T-111 ⬜ PENDING) | No JobRegistry, no reporting-mv-refresh.ts, no Edge Function, no pg_cron migration 0082 |
| T-006 | mv_qc_holds_summary + mv_downtime_by_line MVs DDL | T1-schema | ⛔ MISSING | Migration `0083_reporting_mv_qc_downtime.sql` absent | Also blocked: dep T-005 missing; source tables quality_holds + downtime_events absent from DB |
| T-007 | mv_inventory_aging + mv_wo_status_summary + mv_shipment_otd_weekly MVs DDL | T1-schema | ⛔ MISSING | Migration `0084_reporting_mv_operational.sql` absent | Source tables license_plates (05-WAREHOUSE ⬜) + work_orders (08-PROD not audited) + shipments (11-SHIPPING not audited) all absent |
| T-008 | saved_filter_presets + dashboards_catalog schema | T1-schema | ⛔ MISSING | Migrations 0085 absent; no schema files | `packages/db/src/schema/reporting-presets.ts` absent |
| T-009 | report_access_gate_v1 DSL rule + middleware enforcement | T2-api | ⛔ MISSING | `packages/reporting/src/rules/` absent; `apps/web/middleware.ts` not modified for reporting | No report-access-gate.ts, no DSL rule seed migration 0086, no with-reporting-access.ts |
| T-010 | Fiscal calendar engine | T1-schema | ⛔ MISSING | Migration `0087_reporting_fiscal_calendar.sql` absent | No generate_fiscal_periods function; also blocked: 02-SETTINGS fiscal_calendar_type column existence unconfirmed |
| T-011 | OEE consumer read-model (oee_daily_summary view via 15-OEE) | T2-api | ⛔ MISSING | `packages/reporting/src/queries/oee-consumer.ts` absent | Blocked: 15-OEE module has no STATUS.md and oee_daily_summary does not exist in migrations; graceful degradation path unreachable |
| T-012 | Quality Hold consumer service helper for RPT-004 | T2-api | ⛔ MISSING | `packages/reporting/src/queries/quality-holds.ts` absent | Blocked: quality_holds table absent (09-QUALITY has no STATUS.md) |
| T-013 | Export engine (PDF Edge Function + CSV stream) | T2-api | ⛔ MISSING | No export actions, no reporting-export worker job, no Edge Function | Also blocked: T-003/T-004/T-005 all missing; Foundation T-111 ⬜ PENDING; Foundation T-121 (rate-limit) ⬜ PENDING |
| T-014 | mv_integration_health + mv_rules_usage cross-outbox UNION MVs | T1-schema | ⛔ MISSING | Migration `0088_reporting_mv_integration_health.sql` absent | Blocked: depends on outbox tables from 08-PROD/03-TECHNICAL/11-SHIPPING/10-FINANCE — none audited/confirmed |
| T-015 | UI: RPT-HOME Dashboard Catalog (/reporting) | T3-ui | 🟡 STUB | `apps/web/app/[locale]/(app)/(modules)/reporting/page.tsx` exists — renders ModuleStubNotice only | No catalog-client.tsx, no freshness-badge.tsx, no i18n keys, no real data, no prototype parity evidence. Blocked: T-001/T-008/T-009 all ⛔. |
| T-016 | UI: RPT-001 Factory Overview (/reporting/factory-overview) | T3-ui | ⛔ MISSING | `/reporting/factory-overview/` route absent | All sub-components absent; blocked by T-002/T-003/T-009/T-011/T-015 |
| T-017 | UI: RPT-002 Yield by Line + RPT-003 Yield by SKU | T3-ui | ⛔ MISSING | Routes `/reporting/yield-by-line/` and `/reporting/yield-by-sku/` absent | Blocked by T-016 |
| T-018 | UI: RPT-004 QC Holds Dashboard | T3-ui | ⛔ MISSING | `/reporting/qc-holds/` absent | Blocked by T-006/T-009/T-012/T-016 |
| T-019 | UI: RPT-005 OEE Summary (/reporting/oee-summary) | T3-ui | ⛔ MISSING | `/reporting/oee-summary/` absent | Blocked by T-009/T-011/T-016; 15-OEE has no atoms implemented |
| T-020 | UI: RPT-006 Inventory Aging + RPT-007 WO Status + RPT-008 Shipment OTD | T3-ui | ⛔ MISSING | Three routes absent | Blocked by T-007/T-009/T-016 |
| T-021 | UI: RPT-009 Integration Health | T3-ui | ⛔ MISSING | `/reporting/integration-health/` absent | Blocked by T-009/T-014/T-016 |
| T-022 | UI: RPT-010 Rules Usage Analytics | T3-ui | ⛔ MISSING | `/reporting/rules-usage/` absent | Blocked by T-009/T-014/T-016 |
| T-023 | UI: RPT-EXPORTS history + RPT-SAVED saved-filter | T3-ui | ⛔ MISSING | `/reporting/exports/` and `/reporting/saved-views/` absent | Blocked by T-004/T-008/T-009/T-013/T-016 |
| T-024 | UI: P1 modals batch (5 modals) | T3-ui | ⛔ MISSING | `apps/web/components/reporting/` does NOT exist | No modal components, no i18n keys, no tests |
| T-025 | UI: RPT-SETTINGS tabbed admin (/reporting/settings) | T3-ui | ⛔ MISSING | `/reporting/settings/` absent | Blocked by T-001/T-005/T-009/T-016/T-024 |
| T-026 | UI: export_report_modal + save_preset_modal + share_report_modal | T3-ui | ⛔ MISSING | `apps/web/components/reporting/modals/` absent | Blocked by T-008/T-013/T-024 |
| T-027 | E2E: P1 reporting acceptance spine | T4-wiring-test | ⛔ MISSING | `apps/web/e2e/reporting/` absent (no `p1-spine.spec.ts`) | Blocked by 23 upstream tasks; Foundation T-123 ✅ so Playwright harness is available |

## Phantom / carry-forward backlog
- `packages/reporting/` — referenced in T-002..T-014 as a workspace package (`@monopilot/reporting`) — no package directory exists; must be scaffolded before T-002
- Foundation T-111 (apps/worker scaffold) — ⬜ PENDING; blocks T-005, T-013, T-011 subscriber job
- Foundation T-112 (outbox worker consumer) — ⬜ PENDING; blocks T-005 auto-disable outbox emit, T-011 subscriber
- Foundation T-116 (OpenTelemetry tracer) — ⬜ PENDING; blocks T-005 OTel spans
- Foundation T-117 (pino logger) — ⬜ PENDING; blocks T-005 structured logging
- Foundation T-121 (rate-limit middleware) — ⬜ PENDING; blocks T-013 export dedup
- 08-PRODUCTION wo_outputs + wo_consumptions + downtime_events — no migration exists in `packages/db/migrations/`; no STATUS.md for 08-production; blocks T-003, T-006, T-007
- 09-QUALITY quality_holds + hold_items — no migration exists; no STATUS.md; blocks T-006, T-012
- 05-WAREHOUSE license_plates — T-002 ⬜ per 05-warehouse STATUS.md; blocks T-007
- 11-SHIPPING shipments + sales_orders — no STATUS.md; no migrations found; blocks T-007 (IF EXISTS guard required)
- 15-OEE oee_daily_summary — no STATUS.md; not audited; oee_daily_summary absent; blocks T-011, T-019

## Extra (code without a task)
- `apps/web/e2e/parity-evidence/shell/en-reporting.png` — screenshot of reporting stub landing; captured during Wave 0 skeleton run; no corresponding 12-reporting task covers this (it is a skeleton artefact)
- `apps/web/app/[locale]/(app)/(modules)/reporting/page.tsx` — skeleton stub landing page; partially covers T-015 scope but does not satisfy T-015 acceptance criteria (labeled as 🟡 STUB above)

## Top integration risks
1. **Zero source tables exist in DB for any reporting MV** — 08-PRODUCTION (wo_outputs, wo_consumptions, downtime_events), 09-QUALITY (quality_holds, hold_items), 05-WAREHOUSE (license_plates), 11-SHIPPING (shipments) are all absent from migrations. T-003, T-006, T-007, T-012 cannot be tested against real data. The IF EXISTS guards mandated in some tasks are the only mitigation; MVs will be empty until source modules ship.
2. **apps/worker does not exist (Foundation T-111 ⬜ PENDING)** — T-005 (MV refresh cron), T-013 (export worker), T-011 (OEE subscriber job) all require this scaffold. Without it the entire refresh pipeline and export engine are impossible to implement. This is marked P0 blocker in the Foundation STATUS.md.
3. **packages/reporting workspace package is entirely absent** — 12 tasks declare files under `packages/reporting/src/` or reference `@monopilot/reporting`. The package does not exist; package.json, tsconfig, vitest config must all be created before any T-002..T-014 implementation can begin. This is a hidden prerequisite not listed as a dependency in any individual task JSON.

## Skeleton contribution
- The reporting module contributes a single stub page (ModuleStubNotice) at `/reporting`. This page IS reachable via sidebar nav and constitutes the skeleton navigation requirement for this module — it was delivered in Wave 0 (commit 42258d53).
- No real Supabase data is queried by reporting in the current state — the stub page renders static i18n strings only.
- No action is needed from this module for the Walking Skeleton DoD (login + clickable menu + real data). The module is correctly stubbed. Implementation begins at Wave 1 with T-001 as the p0-blocker.
