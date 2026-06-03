# 15-oee — Reality Audit (2026-06-02)

## Counts
- task files: 25 | manifest task_count: 25 | STATUS rows: 0 (no prior STATUS.md existed) → reconciliation: full creation required.

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Lock OEE permission enum (oee.*.* RBAC baseline) | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` (181 lines) contains ZERO oee.* strings | 13 oee.*.* strings absent; ALL_OEE_PERMISSIONS not exported; no oee assertions in `packages/rbac/src/__tests__/permissions.test.ts`; p0-blocker gates T-011..T-022 RBAC imports |
| T-002 | oee_snapshots site_id extension + read-only consumer indexes | T1-schema | ⛔ MISSING | No migration `*_oee_a_snapshots_site_id.sql` in `packages/db/migrations/`; no `packages/db/src/schema/oee/snapshots.ts` | Also blocked: 08-production T-008 (oee_snapshots CREATE) is itself ⛔ MISSING — source table does not exist; T-002 cannot be applied |
| T-003 | shift_configs + oee_alert_thresholds reference tables DDL + RLS | T1-schema | ⛔ MISSING | No migration `*_oee_a_shift_configs_thresholds.sql`; no Drizzle schema files; no RLS tests | Seeds reference `reference.shift_configs` and `reference.oee_alert_thresholds` in `packages/db/seeds/reference-schemas.sql` (schema-driven seed only, not a migration) |
| T-004 | shift_patterns + org_non_production_days DDL + RLS | T1-schema | ⛔ MISSING | No migration; no `packages/db/src/schema/oee/shift-patterns.ts`; no `packages/db/src/schema/oee/non-production-days.ts` | Blocked by T-003 |
| T-005 | big_loss_categories taxonomy + role→oee.*.* permission seed | T5-seed | ⛔ MISSING | No migration `*_oee_a_big_loss_seed.sql`; no `packages/db/src/schema/oee/big-loss-categories.ts`; no RLS test | Blocked by T-001 (no oee.*.* strings to seed against) |
| T-006 | oee_shift_metrics materialized view + MTBF/MTTR stub columns | T1-schema | ⛔ MISSING | No migration `*_oee_b_oee_shift_metrics_mv.sql`; no MV exists | Blocked by T-002 (oee_snapshots absent) + T-003; MTBF/MTTR stub columns for 13-MAINTENANCE absent |
| T-007 | oee_daily_summary materialized view + 15-min refresh | T1-schema | ⛔ MISSING | No migration `*_oee_b_oee_daily_summary_mv.sql`; no MV exists in DB | Blocked by T-002/T-006; also blocks 12-reporting T-011 (OEE consumer read-model) |
| T-008 | shift_aggregator_v1 DSL rule registration + worker handler | T2-api | ⛔ MISSING | No `apps/web/app/**/rules/shift-aggregator-v1.ts`; no rule-registry row for shift_aggregator_v1; no DSL rule seed migration | `apps/worker/` does not exist (Foundation T-111 ⬜ PENDING); blocked by T-003/T-004 |
| T-009 | apps/worker job registration: 15-min oee_daily_summary refresh + observability | T2-api | ⛔ MISSING | `apps/worker/` directory does NOT exist; no JobRegistry; no oee-daily-summary-refresh.ts | Blocked by T-007 + Foundation T-111 ⬜ PENDING |
| T-010 | OEE outbox publisher (5 events) + Zod payload contracts | T2-api | ⛔ MISSING | No `packages/oee/` or `apps/web/app/**/oee/outbox/`; no oee_outbox_events table migration; no Zod schemas for 5 OEE events | Blocked by T-002; Foundation T-111/T-112 outbox primitives ⬜ PENDING |
| T-011 | /api/oee/line/[id]/trend Server endpoint + rate-limit | T2-api | ⛔ MISSING | `apps/web/app/api/` has no `oee/` subdirectory | Blocked by T-001/T-002/T-003; Foundation T-121 (rate-limit) ⬜ PENDING |
| T-012 | /api/oee/heatmap Server endpoint + per-week MV read | T2-api | ⛔ MISSING | No `app/api/oee/heatmap/` route | Blocked by T-003/T-006 |
| T-013 | /api/oee/summary + export Server endpoints | T2-api | ⛔ MISSING | No `app/api/oee/summary/` or `app/api/oee/export/` routes | Blocked by T-001/T-007; 12-reporting enqueueExportJob ⬜ MISSING |
| T-014 | UI: OEE-001 Per-line 24h Trend page | T3-ui | ⛔ MISSING | Only `apps/web/app/[locale]/(app)/(modules)/oee/page.tsx` exists — skeleton stub (ModuleStubNotice); no `/oee/line/[id]/` route | Blocked by T-011 |
| T-015 | UI: OEE-002 Per-shift Heatmap page + cell_drill_modal | T3-ui | ⛔ MISSING | No `/oee/heatmap/` route or components | Blocked by T-012 |
| T-016 | UI: OEE-003 Per-day OEE Summary page + 3 tabs | T3-ui | ⛔ MISSING | No `/oee/summary/` route or components | Blocked by T-013 |
| T-017 | UI: OEE-001a/b/c A/P/Q Drilldown shared OeeFactorDrillPage | T3-ui | ⛔ MISSING | No shared drilldown component; no `/oee/line/[id]/availability/` etc. routes | Blocked by T-005/T-007 |
| T-018 | UI: Six Big Losses tab + Changeover Analysis tab | T3-ui | ⛔ MISSING | No tabs or tab components; no Big Losses Pareto | Blocked by T-005/T-013 |
| T-019 | UI: P1 modal suite (OEE-M-001/002/006/008/009/012) | T3-ui | ⛔ MISSING | No `apps/web/components/oee/` directory | Blocked by T-001/T-010 |
| T-020 | UI: OEE-ADM-001 OEE Settings page | T3-ui | ⛔ MISSING | No `/oee/settings/` route or admin components | Blocked by T-001/T-003 |
| T-021 | UI: OEE-ADM-002 Shift Configs read-only viewer | T3-ui | 🟡 STUB | `apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx` renders SettingsRouteStub; no data, no real viewer | Stub only — no Drizzle query, no shift_configs table, no prototype parity evidence; blocked by T-003/T-008 |
| T-022 | UI: OEE-ADM-003 Shift Patterns + Non-Production Calendar | T3-ui | ⛔ MISSING | No `/settings/shift-patterns/` or `/settings/non-production-days/` route | Blocked by T-001/T-003 |
| T-023 | P2 stubs: anomaly + maintenance trigger DSL rules + tables | T1-schema | ⛔ MISSING | No `*_oee_c_p2_tables.sql` migration; no `packages/db/src/schema/oee/anomalies.ts` or `ewma-state.ts` or `maintenance-triggers.ts` | Blocked by T-002/T-008 |
| T-024 | Integration test: shift_aggregator → MV → outbox → 12-REPORTING/13-MAINT | T4-wiring-test | ⛔ MISSING | No `apps/web/__tests__/integration/oee-shift-to-consumers.test.ts`; `apps/web/__tests__/integration/` dir absent | Blocked by T-006/T-008 |
| T-025 | Playwright E2E + seed fixtures: OEE-001/002/003 happy path | T4-wiring-test | ⛔ MISSING | No `apps/web/e2e/oee/` directory; no specs | Blocked by T-014/T-015 |

## Phantom / carry-forward backlog
- 08-production T-008 (oee_snapshots CREATE migration) — ⛔ MISSING per 08-production audit; 15-OEE T-002 is a read-only ALTER on this table; cannot proceed until 08-production T-008 is done
- Foundation T-111 (apps/worker scaffold) — ⬜ PENDING; blocks T-008/T-009 worker handler
- Foundation T-112 (outbox worker consumer) — ⬜ PENDING; blocks T-010 publisher dispatch + T-009 subscriber job
- Foundation T-121 (rate-limit middleware) — ⬜ PENDING; blocks T-011 rate-gate
- Foundation T-116/T-117/T-118 (logger/tracer/metrics) — ⬜ PENDING; blocks T-009 observability wiring
- Foundation T-125 (app.current_org_id() function) — status uncertain; referenced as Wave1 T-125; T-002..T-006 migrations all depend on it
- 13-maintenance MTBF/MTTR consumer — T-006 declares stub columns mttr_min/mtbf_min for 13-MAINT to read via oee.shift.aggregated outbox event; neither the stub columns nor the outbox event exist yet
- 12-reporting enqueueExportJob — T-013 reuses this; 12-reporting T-013 is itself ⛔ MISSING

## Extra (code without a task)
- `apps/web/app/[locale]/(app)/(modules)/oee/page.tsx` — skeleton stub landing; renders ModuleStubNotice; partially covers T-014 route scaffold only, satisfies no T-014 acceptance criteria (labeled 🟡 STUB above against T-021 for shifts; ⛔ MISSING for T-014 through T-022 deep routes)
- `apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx` — SettingsRouteStub stub; superficially maps to T-021 scope but has zero implementation
- `apps/web/e2e/parity-evidence/shell/en-oee.png` — skeleton screenshot of OEE stub landing; no owning E2E task in 15-oee covers it (Wave 0 artefact)
- `packages/db/seeds/reference-schemas.sql` — registers `reference.shift_configs` and `reference.oee_alert_thresholds` columns in the schema-driven seed; this is an anticipated stub seeded ahead of the actual DDL migration; no owning 15-oee task created this (it was added as part of the 02-SETTINGS reference-tables seed)

## Top integration risks
1. **08-production T-008 (oee_snapshots CREATE) is itself MISSING** — 15-OEE's entire read-model depends on `oee_snapshots` existing and being produced by 08-production. Neither the CREATE migration nor any data producer exists. Any attempt to implement 15-OEE T-002 onward will fail or be vacuous until 08-production ships its snapshot pipeline (D-OEE-1 canonical ownership).
2. **13-maintenance MTBF/MTTR coupling** — T-006 declares `mttr_min` and `mtbf_min` stub columns on `oee_shift_metrics` and the outbox event `oee.shift.aggregated` as the feed mechanism for 13-maintenance. Neither the MV, the columns, nor the outbox event exist. The 13-maintenance D-MNT-3 MTBF/MTTR producer cannot be wired until these 15-OEE atoms are done; this is a circular dependency risk if both modules start concurrently without coordinating on the interface contract first.
3. **14-multi-site site_id REC-L1 day-1 requirement** — T-002, T-003, T-004 all declare `site_id UUID NULL` as a day-1 column (REC-L1 per PRD §6 D-OEE-1). If 14-multi-site's `sites` + `site_user_access` tables are absent when these migrations run, the FK constraints and RLS `site_user_access` clauses cannot be validated. T-003/T-004 policy uses `site_id IN (SELECT site_id FROM site_user_access WHERE user_id = auth.uid())` — this will silently return 0 rows for all site-filtered queries until 14-multi-site ships.

## Skeleton contribution (if any)
- OEE module route `/oee` is registered in `apps/web/lib/navigation/app-nav.ts` and renders a skeleton stub page; sidebar navigation to OEE works in the Walking Skeleton (Wave 0 ✅ DoD met).
- No OEE-specific data is shown; the skeleton stub satisfies DoD#1-5 (clickable menu item) but does not contribute to any OEE task acceptance criteria.
- The `15-oee` module row is present in `packages/db/seeds/modules.sql` (disabled by default, PREMIUM + BETA tier flags set in the features page).
- No OEE code is skeleton-relevant beyond route registration; all 25 tasks remain ⬜/⏸ pending Wave 1.
