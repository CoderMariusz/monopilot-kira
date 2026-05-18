# 12-REPORTING Bootstrap Report — 2026-05-14

Bootstrap of `_meta/atomic-tasks/12-reporting/` from zero. Source audit: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A) §"Modules without Atomic-Tasks (10-15) — Priority Slices" §12-REPORTING (8 slices RPT-001..008).

## Totals

- **Total tasks**: 27 (T-001 through T-027)
- **T-ID range**: T-001..T-027 (manifest task_count=27)
- **All JSON validated**: `python3 -c "import json; json.load(...)"` passes for all 27 files.

## Sub-module counts (per PRD §16 + this bootstrap split)

| Sub-module | Count | Tasks |
|---|---:|---|
| 12-REPORTING-a (Core Production + foundation) | 10 | T-001, T-002, T-003, T-004, T-005, T-009, T-010, T-015, T-016, T-017 |
| 12-REPORTING-b (Quality + OEE Consumer) | 5 | T-006, T-011, T-012, T-018, T-019 |
| 12-REPORTING-c (Operational dashboards) | 2 | T-007, T-020 |
| 12-REPORTING-d (Admin dashboards + Export P1) | 5 | T-013, T-014, T-021, T-022, T-026 |
| 12-REPORTING-e (Catalog + support + modals + admin settings) | 4 | T-008, T-023, T-024, T-025 |
| E2E (P1 acceptance spine) | 1 | T-027 |

Task type breakdown:
- T1-schema: 10 (T-001, T-002, T-003, T-004, T-006, T-007, T-008, T-010, T-014; plus T-008 is partially T2 since it includes Server Actions)
- T2-api: 6 (T-005, T-009, T-011, T-012, T-013, plus T-008 mixed)
- T3-ui: 12 (T-015..T-026)
- T4-wiring-test: 1 (T-027)

## P0 blockers

| Task | Priority | Reason |
|---|---:|---|
| **T-001** | 90 | Permission enum (rpt.* baseline, 14 strings). Per Auditor A: Foundation T-046 ESLint enum-lock guard will block downstream module compile until rpt.* strings are added. Tagged `p0-blocker`. |

T-002 (KPI glossary), T-003 (yield MVs), T-004 (support tables) and T-008 (catalog + presets) are priority 80 — high but not P0. T-001 is the only true p0-blocker per spec instructions ("One permission-enum task priority 90, p0-blocker").

## Cross-module dependencies declared

All declared in `manifest.json` `cross_module_dependencies` array. Highlights:

- **00-FOUNDATION**: T-046 (enum-lock for T-001), T-111 (apps/worker for T-005/T-013), T-112 (outbox consumer for T-005/T-011), T-116 (OTel for T-005), T-117 (pino), T-121 (rate-limit for V-RPT-EXPORT-6), T-123 (Playwright for T-027), T-125 (`app.current_org_id()` for all RLS).
- **02-SETTINGS**: users (FK target), dsl_rules registry (T-009), rule_evaluations audit (T-014), organization_settings.fiscal_calendar_type (T-010), feature flags storage (T-008/T-015), downtime_categories ref (T-006), audit_log (T-024), Resend sender (T-025), i18n next-intl (all UI).
- **03-TECHNICAL**: items_outbox_events (T-014 stage 1).
- **05-WAREHOUSE**: license_plates source (T-007); `/warehouse/license-plates/<lp>` route (T-020).
- **08-PRODUCTION**: wo_outputs + wo_consumptions (T-003), work_orders + wo_executions (T-007), downtime_events (T-006), production_outbox_events (T-014), `/production/work-orders/<wo>` route (T-017/T-020).
- **09-QUALITY**: quality_holds + hold_items (T-006/T-012), `/quality/holds/<uuid>` route (T-012/T-018).
- **10-FINANCE** (0 tasks today): finance_outbox_events stage 5, IF EXISTS guard in T-014.
- **11-SHIPPING** (0 tasks today): shipments + sales_orders (T-007 IF EXISTS), shipping_outbox_events stage 3 (T-014 IF EXISTS), `/shipping/shipments/<ship>` route (T-020 disabled if absent).
- **15-OEE** (0 tasks today): oee_daily_summary (T-011 consumer, graceful degradation per D-RPT-9), oee.snapshot.aggregated outbox event (T-011 subscriber), `/oee` route (T-019 disabled if absent).
- **External**: Vercel Blob (T-013/T-025), PostHog API (T-025), packages/ui shadcn Dialog (T-024/T-026).

## Reporting-specific red lines enforced (translation-notes §)

Every task explicitly enforces the reporting-domain red lines:

1. **Read-model views, not transactional joins** — every MV task (T-003/T-006/T-007/T-014) plus D-RPT-1 cited in risk red lines.
2. **Refresh cadence per report** — T-005 cron jobs (2-min prod / 5-min QC).
3. **RBAC at view level (RLS-via-service)** — T-003/T-006/T-007/T-009/T-011/T-012/T-014 all use service-layer `app.current_org_id()` filter (MVs cannot host policies per §5 Techniczne).
4. **No raw PII in exports** — T-013 + T-022 PII redaction + §13.5 GDPR.
5. **KPI definitions in version-controlled glossary** — T-002 creates `_foundation/contracts/reporting-kpi-glossary.md` + `packages/reporting/src/kpi-glossary.ts` SSOT.
6. **Dashboards parameterized by tenant** — T-009 middleware + every service helper enforces org+site filter.
7. **Long-running queries on apps/worker** — T-005 refresh worker, T-013 export worker; Server Actions enqueue only.
8. **Consumer pattern** — T-011 OEE (D-RPT-9 con-clause), T-012 quality holds (read-only ESLint guard).

## Wave0 lock applied

PRD §9.2/§12.2/§9.3 use `tenant_id` label. Per NPD T-006 red-flag #7 (`_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md`) and Wave0 v4.3 decision #1, every task uses `org_id` even when PRD says tenant_id. Risk red lines per task call this out explicitly.

## Foundation primitives consumed (not redefined)

- `app.current_org_id()` (T-125) used by all RLS / RLS-via-service helpers.
- `withOrgContext` (T-125) used by Server Actions.
- Outbox dispatcher (T-111/T-112) consumed by T-005, T-011 oee subscriber, T-013 export completion event.
- GDPR registry (T-113/T-114) — T-022 audit log redaction + future regulatory_signoff (P2).
- Observability (T-116-T-118) — T-005 OTel spans + T-117 pino refresh error logs + T-118 Sentry.
- Rate-limit (T-121) — V-RPT-EXPORT-6 dedup window.
- CI/CD (T-122) — implicit (all tests run in pipeline).
- Playwright harness (T-123) — T-027 E2E spec.
- E-sign (T-124) — explicit out-of-scope; consumed by P2 regulatory_signoff_modal only.

## Deferred to P2

Explicit out-of-scope per PRD §4.2 — 15 P2 dashboards + scheduled reports + custom DSL builder + external BI embed + xlsx/json exports + regulatory sign-off + recipient groups + run-now confirm. Stub schemas (dashboards_catalog P2 rows) seeded in T-008 with `feature_flag='reporting.v2_dashboards'` for forward compatibility.

## File list

```
_meta/atomic-tasks/12-reporting/
├── BOOTSTRAP-REPORT-2026-05-14.md  (this file)
├── coverage.md                      (PRD ↔ task matrix + auditor slice mapping + red lines)
├── manifest.json                    (27 tasks; cross-module deps; sub-module map)
└── tasks/
    ├── T-001.json  Permission enum (rpt.*) — priority 90 p0-blocker
    ├── T-002.json  KPI glossary contract
    ├── T-003.json  Yield + Factory KPI MVs
    ├── T-004.json  Support tables (refresh log + exports + access audits)
    ├── T-005.json  MV refresh worker (pg_cron + Edge fallback)
    ├── T-006.json  QC Holds + Downtime MVs
    ├── T-007.json  Inventory Aging + WO Status + Shipment OTD MVs
    ├── T-008.json  saved_filter_presets + dashboards_catalog
    ├── T-009.json  report_access_gate_v1 rule + middleware
    ├── T-010.json  Fiscal calendar engine
    ├── T-011.json  OEE consumer (15-OEE wrapper + graceful degradation)
    ├── T-012.json  Quality Hold consumer (read-only)
    ├── T-013.json  Export engine (PDF Edge Function + CSV stream)
    ├── T-014.json  Integration Health + Rules Usage MVs
    ├── T-015.json  RPT-HOME catalog UI
    ├── T-016.json  RPT-001 Factory Overview UI
    ├── T-017.json  RPT-002 + RPT-003 Yield by Line/SKU UI
    ├── T-018.json  RPT-004 QC Holds UI
    ├── T-019.json  RPT-005 OEE Summary UI
    ├── T-020.json  RPT-006/007/008 Operational dashboards UI
    ├── T-021.json  RPT-009 Integration Health UI (admin)
    ├── T-022.json  RPT-010 Rules Usage UI (admin)
    ├── T-023.json  RPT-EXPORTS + RPT-SAVED support UIs
    ├── T-024.json  P1 modals batch (5 modals)
    ├── T-025.json  RPT-SETTINGS tabbed admin UI
    ├── T-026.json  Export + Save Preset + Share Report modals
    └── T-027.json  P1 E2E acceptance spine
```

## Notes for future waves

- 11-SHIPPING / 10-FINANCE / 15-OEE bootstrap (zero atomic tasks today) should land BEFORE running T-020 / T-014 / T-019 production paths. Tasks are written to degrade gracefully, but full E2E coverage in T-027 only asserts placeholder paths for those modules until they exist.
- P2 wave will need RPT-012/013/016 modal tasks + RPT-SCHED + RPT-SCHED-EDIT pages + scheduled_reports / report_deliveries / recipient_groups schemas + scheduled_report_distribution_v1 DSL rule + Trigger.dev integration + xlsx/json export tasks + the 13 P2 dashboard tasks.
- 21 CFR Part 11 regulatory sign-off (P2 RPT-012) consumes 09-QUALITY §5.3 PIN reverify pattern — must coordinate with 09-QUALITY P2 epic for HACCP/CCP/incidents/complaints.
- Custom Report Builder DSL (P2 BL-RPT-08) blocks on safe-SQL allowlist design (OQ-RPT-06).
