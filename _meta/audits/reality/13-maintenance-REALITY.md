# 13-maintenance — Reality Audit (2026-06-02)

## Counts
- task files: 30 | manifest task_count: 30 | STATUS rows: 0 (no STATUS.md existed)
- Reconciliation: counts match. No STATUS.md previously existed — this audit creates it.

## Task reality

| Task | Title (abbrev) | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Lock mnt.*.* permission enum | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` — no `mnt.` strings present, no `MAINTENANCE_PERMISSIONS` group, no `ALL_MAINTENANCE_PERMISSIONS` export | P0 blocker; enum file exists but 17 mnt.*.* strings absent entirely |
| T-002 | maintenance_settings + technician_profiles + equipment DDL+RLS | T1-schema | ⛔ MISSING | No migration in `packages/db/migrations/` references these tables; no Drizzle schema under `packages/db/src/schema/maintenance/`; no `maintenance-a-base.test.ts` | Full schema unimplemented |
| T-003 | maintenance_schedules + mwo_checklist_templates DDL+RLS | T1-schema | ⛔ MISSING | No migration or Drizzle file for `maintenance_schedules` or `mwo_checklist_templates` | Depends on T-002 |
| T-004 | maintenance_work_orders + mwo_checklists + mwo_loto_checklists DDL+RLS | T1-schema | ⛔ MISSING | No migration or Drizzle file for MWO tables | Depends on T-002, T-003 |
| T-005 | spare_parts + stock + transactions + mwo_spare_parts DDL+RLS | T1-schema | ⛔ MISSING | No migration or Drizzle file for spare parts tables | Depends on T-002 |
| T-006 | calibration_instruments + calibration_records + sanitation_checklists + maintenance_history DDL+RLS | T1-schema | ⛔ MISSING | No migration or Drizzle file for these tables | Depends on T-002 |
| T-007 | Register 6 P1 DSL rules in rules registry | T5-seed | ⛔ MISSING | No maintenance rules found in `packages/db/seeds/cascade-rules.sql`; `reference_schemas.seed` has `maintenance_alert_thresholds` schema def but not the 6 DSL rule entries (pm_schedule_due_engine_v1, mwo_state_machine_v1 etc.) | Depends on T-002 schema + 02-Settings rule_registry (039-rule-registry.sql exists) |
| T-008 | maintenance_kpis MV + pg_cron daily refresh | T1-schema | ⛔ MISSING | No `maintenance_kpis` materialized view in any migration | Depends on T-002..T-006 |
| T-009 | PM schedule due engine worker | T2-api | ⛔ MISSING | No worker file for `pm_schedule_due_engine_v1`, `calibration_expiry_alert_v1`, or `spare_parts_reorder_alert_v1` in `apps/web` or `packages/` | Depends on T-003, T-005, T-006, T-008 |
| T-010 | MWO state machine Server Actions | T2-api | ⛔ MISSING | No `_actions/` directory under any maintenance route; no actions for request/approve/assign/start/complete/cancel | Depends on T-004 |
| T-011 | Spare parts Server Actions | T2-api | ⛔ MISSING | No spare parts Server Actions file anywhere in `apps/web` | Depends on T-005 |
| T-012 | Maintenance outbox publisher (8 events) | T2-api | ⛔ MISSING | No outbox publisher for maintenance events; no Zod payload contracts for maintenance | Depends on T-002..T-006 |
| T-013 | Reference table seeds + GDPR erasure + i18n PL/EN keys | T5-seed | 🟡 STUB | `packages/db/seeds/reference-schemas.sql` includes `reference.maintenance_alert_thresholds` schema definition and technician skill levels/spare part categories; but no full i18n keys for PL/EN locale confirmed, no GDPR erase fn for maintenance PII | Partial seed only; i18n/GDPR unverifiable without T-002 tables |
| T-014 | LOTO apply/clear Server Actions + dual e-sign | T2-api | ⛔ MISSING | No LOTO Server Actions; depends on Wave1 T-124 (e-sign primitive) which is itself not yet implemented per foundation audit | Blocked by T-004 + 00-foundation T-124 |
| T-015 | Calibration record + cert upload Server Actions + SHA-256 | T2-api | ⛔ MISSING | No calibration Server Actions in `apps/web` | Depends on T-006 |
| T-016 | Sanitation checklist + ATP gate + allergen dual e-sign | T2-api | ⛔ MISSING | No sanitation Server Actions | Depends on T-006 + 00-foundation T-124 |
| T-017 | Auto-MWO from downtime consumer | T2-api | ⛔ MISSING | No downtime event consumer in maintenance | Depends on T-004 + 08-production downtime_events table |
| T-018 | UI: Maintenance Dashboard | T3-ui | ⛔ MISSING | `apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx` exists but is a `ModuleStubNotice` placeholder with no real data, no KPI components, no Supabase queries | Stub shell page only |
| T-019 | UI: Asset Registry List + Detail | T3-ui | ⛔ MISSING | No asset registry sub-route or `_components/` under maintenance; only the stub root page exists | |
| T-020 | UI: PM Schedule List + Wizard + Calendar | T3-ui | ⛔ MISSING | No PM schedule sub-route or components | |
| T-021 | UI: Work Request + MWO List + Create/Triage | T3-ui | ⛔ MISSING | No WR/MWO list or modal components | |
| T-022 | UI: MWO Detail (7-tab + state stepper) | T3-ui | ⛔ MISSING | No MWO detail page or components | |
| T-023 | UI: Spare Parts List + Detail + Reorder | T3-ui | ⛔ MISSING | No spare parts UI components | |
| T-024 | UI: Calibration List + Detail + Cert Upload | T3-ui | ⛔ MISSING | No calibration UI components | |
| T-025 | UI: LOTO Procedures List + Apply/Clear modals | T3-ui | ⛔ MISSING | No LOTO UI — safety-critical; absent | |
| T-026 | UI: Technicians List + Detail + Skill Edit (GDPR PII) | T3-ui | ⛔ MISSING | No technician UI components | |
| T-027 | UI: Analytics Hub + Settings page | T3-ui | ⛔ MISSING | No analytics or maintenance settings page | |
| T-028 | Rate-limit + observability wiring | T4-wiring-test | ⛔ MISSING | No maintenance Server Actions exist to wire; foundation T-121/T-116..T-118 also pending | Blocked by T-009..T-017 |
| T-029 | Register MNT-001..014 in dashboards_catalog | T5-seed | ⛔ MISSING | `reference.dashboards_catalog` schema registered in reference-schemas.sql but no MNT-* rows seeded anywhere | |
| T-030 | E2E spine: WR→approve→start→consume spare→complete | T4-wiring-test | ⛔ MISSING | No maintenance E2E spec; `apps/web/e2e/` has no maintenance specs; `en-maintenance.png` is shell-only screenshot | |

## Phantom / carry-forward backlog

None declared in existing STATUS.md (did not exist). However the manifest cross-references the following unimplemented 00-foundation wave1 tasks which are blockers:
- `00-foundation T-124` — e-sign primitive (required by T-014 LOTO + T-016 sanitation dual e-sign)
- `00-foundation T-125` — `app.current_org_id()` (required by T-002..T-006 RLS policies)
- `00-foundation T-111/T-112` — outbox+worker primitive (required by T-012 outbox publisher)
- `00-foundation T-121` — rate-limit primitive (required by T-028)
- `00-foundation T-116..T-118` — observability primitives (required by T-028)
- `00-foundation T-123` — Playwright primitive (required by T-030)

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx` — stub placeholder page; likely satisfies the shell/navigation requirement from Wave 0 skeleton only; not assigned to any 13-maintenance task but is 🧩 EXTRA as a walking-skeleton artifact.
- `apps/web/e2e/parity-evidence/shell/en-maintenance.png` — shell-level screenshot; confirms route is reachable in nav but no task covers this beyond skeleton.
- `packages/db/seeds/reference-schemas.sql` lines 34, 75, 120-122 — partial maintenance reference schema entries (`maintenance_alert_thresholds`, technician skill levels, spare part categories); covered by T-013 intent but T-013 is not implemented.

## Top integration risks

1. **All T-001..T-030 are unstarted; T-001 (permission enum) is a P0 blocker** that gates every Server Action RBAC check and should be the first task executed. Without it, any downstream T2-api implementation that imports `Permission.MNT_*` will fail to compile.

2. **Hard dependency on 00-foundation wave1 primitives that are themselves unimplemented** (T-124 e-sign, T-125 app.current_org_id(), T-111 outbox): T-002 through T-017 and T-030 cannot be completed until those foundation tasks land. This creates a sequential bottleneck across the entire module.

3. **OEE + Quality cross-module integration is completely untasked on the production side**: T-017 (auto-MWO from downtime_events produced by 08-production) requires 08-production to exist; T-006/T-015 calibration.failed→quality hold candidate (V-MNT-10) requires 09-quality to exist; and T-008 (maintenance_kpis MV reading oee_shift_metrics) requires 15-oee. None of these producer tables exist yet, meaning the maintenance module cannot be tested end-to-end in integration until multiple other modules advance.

## Skeleton contribution

- The maintenance route is navigable in the walking skeleton (`/en/maintenance` renders, confirmed by `en-maintenance.png` screenshot + stub page.tsx).
- The page shows only a `ModuleStubNotice` — no real Supabase data, no KPIs, no components. This is intentional per Wave 0.
- No maintenance-specific schema, actions, or UI components exist. The module is 100% pre-implementation.
