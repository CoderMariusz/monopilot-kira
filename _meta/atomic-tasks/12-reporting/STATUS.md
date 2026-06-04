# 12-reporting — Task Status

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

> **Reality audit date:** 2026-06-02
> **Auditor:** kira:audit Phase 0
> **Result:** 0 implemented, 1 stub (T-015 skeleton landing only), 26 missing. No prior STATUS.md existed.
> **Audit detail:** `_meta/audits/reality/12-reporting-REALITY.md`

## Foundation / permissions (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | Lock reporting permission enum (rpt.* baseline) | ⬜ | `permissions.enum.ts` exists but zero rpt.* strings present; ALL_REPORTING_CORE_PERMISSIONS absent; p0-blocker |

## Contract / KPI glossary (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-002 | KPI glossary (16 P1 KPIs, version-controlled formulas) | ⬜ | `packages/reporting/` package does not exist; `_foundation/contracts/reporting-kpi-glossary.md` absent |

## DB schema — materialized views (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-003 | Yield + Factory KPI MVs (mv_yield_by_line_week, mv_yield_by_sku_week, mv_factory_kpi_week) | ⬜ | Migration 0080 absent; blocked also by missing 08-PROD source tables |
| T-006 | mv_qc_holds_summary + mv_downtime_by_line MVs | ⬜ | Migration 0083 absent; blocked by T-005 missing + 09-QUALITY source tables absent |
| T-007 | mv_inventory_aging + mv_wo_status_summary + mv_shipment_otd_weekly MVs | ⬜ | Migration 0084 absent; blocked by 05-WAREHOUSE ⬜ + 08-PROD + 11-SHIPPING not audited |
| T-010 | Fiscal calendar engine (generate_fiscal_periods + fiscal_periods consumer) | ⬜ | Migration 0087 absent; blocked by 02-SETTINGS fiscal_calendar_type column |
| T-014 | mv_integration_health + mv_rules_usage cross-outbox UNION MVs | ⬜ | Migration 0088 absent; blocked by T-003/T-005 and multiple outbox source tables absent |

## DB schema — support tables (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-004 | mv_refresh_log + report_exports + report_access_audits | ⬜ | Migration 0081 absent; no Drizzle schema; no RLS policies |
| T-008 | saved_filter_presets + dashboards_catalog schema | ⬜ | Migration 0085 absent |

## API / server actions (T2-api)

| ID | Title | Status | Note |
|---|---|---|---|
| T-005 | MV refresh worker job (pg_cron + Edge Function fallback) | ⬜ | **Blocked: Foundation T-111 apps/worker ⬜ PENDING** — apps/worker dir absent; no pg_cron migration 0082; no Edge Function |
| T-009 | report_access_gate_v1 DSL rule + middleware enforcement | ⬜ | No report-access-gate.ts; no DSL rule seed migration 0086; apps/web/middleware.ts not modified |
| T-011 | OEE consumer read-model (oee_daily_summary via 15-OEE) | ⬜ | Blocked: 15-OEE oee_daily_summary absent; Foundation T-112 ⬜ PENDING |
| T-012 | Quality Hold consumer service helper for RPT-004 | ⬜ | Blocked: quality_holds table absent (09-QUALITY not audited) |
| T-013 | Export engine (PDF Edge Function + CSV stream + report_exports writer) | ⬜ | Blocked: Foundation T-111 (worker) ⬜ + T-121 (rate-limit) ⬜ + T-003/T-004/T-005 missing |

## UI — dashboard pages (T3-ui)

| ID | Title | Status | Note |
|---|---|---|---|
| T-015 | RPT-HOME Dashboard Catalog (/reporting) | ⏸ | **Stub only** — page.tsx renders ModuleStubNotice; no catalog-client, no i18n keys, no real data; prototype parity evidence absent. Blocked by T-001/T-008/T-009. |
| T-016 | RPT-001 Factory Overview (/reporting/factory-overview) | ⬜ | Route absent; all components absent; blocked by T-002/T-003/T-009/T-011/T-015 |
| T-017 | RPT-002 Yield by Line + RPT-003 Yield by SKU | ⬜ | Routes absent; blocked by T-016 |
| T-018 | RPT-004 QC Holds Dashboard | ⬜ | Route absent; blocked by T-006/T-009/T-012/T-016 |
| T-019 | RPT-005 OEE Summary (/reporting/oee-summary) | ⬜ | Route absent; blocked by T-009/T-011/T-016 |
| T-020 | RPT-006 Inventory Aging + RPT-007 WO Status + RPT-008 Shipment OTD | ⬜ | Three routes absent; blocked by T-007/T-009/T-016 |
| T-021 | RPT-009 Integration Health (/reporting/integration-health) | ⬜ | Route absent; blocked by T-009/T-014/T-016 |
| T-022 | RPT-010 Rules Usage Analytics (/reporting/rules-usage) | ⬜ | Route absent; blocked by T-009/T-014/T-016 |
| T-023 | RPT-EXPORTS history + RPT-SAVED saved-filter pages | ⬜ | Two routes absent; blocked by T-004/T-008/T-009/T-013/T-016 |

## UI — modals + settings (T3-ui)

| ID | Title | Status | Note |
|---|---|---|---|
| T-024 | P1 modals batch (error_log, refresh_confirm, delete_confirm, p2_toast, access_denied) | ⬜ | `apps/web/components/reporting/` absent; all 5 modals absent |
| T-025 | RPT-SETTINGS tabbed admin (/reporting/settings) | ⬜ | Route absent; blocked by T-001/T-005/T-009/T-016/T-024 |
| T-026 | export_report_modal + save_preset_modal + share_report_modal | ⬜ | All 3 modals absent; blocked by T-008/T-013/T-024 |

## E2E / acceptance tests (T4-wiring-test)

| ID | Title | Status | Note |
|---|---|---|---|
| T-027 | E2E: P1 reporting acceptance spine | ⬜ | `apps/web/e2e/reporting/` absent; blocked by all 23 upstream tasks; Foundation T-123 Playwright harness ✅ available |

## Carry-forward items (pre-requisites not yet tasks)
- `packages/reporting` workspace package scaffold — no package.json/tsconfig/vitest.config; must exist before T-002..T-014 can run
- Foundation T-111 apps/worker scaffold — **P0 blocker** for T-005, T-011 subscriber, T-013 export worker
- Foundation T-112 outbox worker consumer — **P0 blocker** for T-005 auto-disable, T-011
- Foundation T-116 OpenTelemetry — blocks T-005 OTel spans
- Foundation T-117 pino logger — blocks T-005 structured logging
- Foundation T-121 rate-limit middleware — blocks T-013 export dedup
- 08-PRODUCTION wo_outputs, wo_consumptions, downtime_events — absent from DB migrations; blocks T-003, T-006, T-007
- 09-QUALITY quality_holds, hold_items — absent; blocks T-006, T-012
- 05-WAREHOUSE license_plates — T-002 ⬜ per module STATUS; blocks T-007
- 15-OEE oee_daily_summary — module not audited; absent; blocks T-011, T-019


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-028 | Seed rpt.* permissions onto roles (NNN-reporting-permission-seed.sql) | ⬜ PENDING | X-1 RBAC-seed. **wave-1 p0**, after T-001 enum. |

Refinements / gaps (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| MON-domain-reporting skill (S-1, X-6) | skill gap | ⬜ TODO | Author `.claude/skills/MON-domain-reporting/SKILL.md` (read-only sink, MV discipline, KPI glossary SoT, export+retention, org_id, access gate, catalog metadata, parity) + register in MON-INDEX. Run /kira:skills-overhaul. |
| Upstream site_id pre-flight (S-2, F-1) | pre-flight gate | ⬜ TODO | Add to T-003/006/007: assert upstream site_id exists before MV creation, else block on day-1 retrofit OR degrade to org-only grouping with tracked follow-up ALTER (CONCURRENTLY refresh hinges on the unique-index shape). |
| UI route path (X-3) | consolidation pass | ⬜ TODO | Rewrite reporting T3-ui paths `apps/web/app/reporting/...` → `apps/web/app/[locale]/(app)/(modules)/reporting/...`. |
