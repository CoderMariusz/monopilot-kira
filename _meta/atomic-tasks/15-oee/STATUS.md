# 15-oee — Task Status

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

> **Reality audit date:** 2026-06-02
> **Auditor:** kira:audit Phase 0
> **Result:** 0 implemented, 1 stub (T-021 settings/shifts SettingsRouteStub), 24 missing.
> **Audit detail:** `_meta/audits/reality/15-oee-REALITY.md`

## Permissions / RBAC (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | Lock OEE permission enum (oee.*.* RBAC baseline) | ⬜ | `permissions.enum.ts` has ZERO oee.* strings; p0-blocker gates T-011..T-022 |

## DB schema — consumer surface + reference tables (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-002 | oee_snapshots site_id extension + read-only consumer indexes | ⬜ | Hard-blocked: 08-production T-008 (oee_snapshots CREATE) is itself ⛔ MISSING |
| T-003 | shift_configs + oee_alert_thresholds reference tables DDL + RLS | ⬜ | No migration; seed stubs exist in reference-schemas.sql but DDL absent |
| T-004 | shift_patterns + org_non_production_days DDL + RLS | ⬜ | Blocked by T-003 |

## DB schema — seed / taxonomy (T5-seed)

| ID | Title | Status | Note |
|---|---|---|---|
| T-005 | big_loss_categories taxonomy + role→oee.*.* permission seed | ⬜ | Blocked by T-001 (no oee.*.* strings exist to seed against) |

## DB schema — materialized views (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-006 | oee_shift_metrics materialized view + MTBF/MTTR stub columns | ⬜ | Blocked by T-002 (oee_snapshots absent) + T-003 |
| T-007 | oee_daily_summary materialized view + 15-min refresh | ⬜ | Blocked by T-002/T-006; also blocks 12-reporting T-011 |
| T-023 | P2 stubs: anomaly + maintenance trigger DSL rules + tables | ⬜ | Blocked by T-002/T-008 |

## API / server actions (T2-api)

| ID | Title | Status | Note |
|---|---|---|---|
| T-008 | shift_aggregator_v1 DSL rule registration + worker handler | ⬜ | Blocked by T-003/T-004; apps/worker absent (Foundation T-111 ⬜) |
| T-009 | apps/worker: 15-min oee_daily_summary refresh + observability | ⬜ | Blocked by T-007 + Foundation T-111 ⬜ |
| T-010 | OEE outbox publisher (5 events) + Zod payload contracts | ⬜ | Blocked by T-002; Foundation T-111/T-112 ⬜ |
| T-011 | /api/oee/line/[id]/trend endpoint + rate-limit | ⬜ | Blocked by T-001/T-002/T-003; Foundation T-121 ⬜ |
| T-012 | /api/oee/heatmap endpoint + per-week MV read | ⬜ | Blocked by T-003/T-006 |
| T-013 | /api/oee/summary + export endpoints | ⬜ | Blocked by T-001/T-007; 12-reporting enqueueExportJob ⬜ |

## UI — dashboards + drilldowns (T3-ui)

| ID | Title | Status | Note |
|---|---|---|---|
| T-014 | UI: OEE-001 Per-line 24h Trend page | ⬜ | Only skeleton stub /oee page.tsx exists; no line/[id] route; blocked by T-011 |
| T-015 | UI: OEE-002 Per-shift Heatmap page + cell_drill_modal | ⬜ | Blocked by T-012 |
| T-016 | UI: OEE-003 Per-day OEE Summary page + 3 tabs | ⬜ | Blocked by T-013 |
| T-017 | UI: OEE-001a/b/c A/P/Q Drilldown shared OeeFactorDrillPage | ⬜ | Blocked by T-005/T-007 |
| T-018 | UI: Six Big Losses tab + Changeover Analysis tab | ⬜ | Blocked by T-005/T-013 |
| T-019 | UI: P1 modal suite (OEE-M-001/002/006/008/009/012) | ⬜ | Blocked by T-001/T-010; apps/web/components/oee/ absent |

## UI — admin screens (T3-ui)

| ID | Title | Status | Note |
|---|---|---|---|
| T-020 | UI: OEE-ADM-001 OEE Settings page | ⬜ | Blocked by T-001/T-003; no /oee/settings/ route |
| T-021 | UI: OEE-ADM-002 Shift Configs read-only viewer | ⏸ | `settings/shifts/page.tsx` renders SettingsRouteStub only; no data, no parity evidence; blocked by T-003/T-008 |
| T-022 | UI: OEE-ADM-003 Shift Patterns + Non-Production Calendar | ⬜ | Blocked by T-001/T-003; no route |

## Tests (T4-wiring-test)

| ID | Title | Status | Note |
|---|---|---|---|
| T-024 | Integration test: shift_aggregator → MV → outbox → consumers | ⬜ | Blocked by T-006/T-008; apps/web/__tests__/integration/ absent |
| T-025 | Playwright E2E + seed fixtures: OEE-001/002/003 happy path | ⬜ | Blocked by T-014/T-015; apps/web/e2e/oee/ absent |


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-026 | Seed oee.* permissions onto roles (NNN-oee-permission-seed.sql) | ⬜ PENDING | X-1 RBAC-seed. **wave-1 p0**, after T-001 enum. |

Decisions / refinements (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| oee_snapshots schema ownership (S-1, F-5) | 🔒 DECISION (gated on D-1) | BLOCKED | T-002 currently ALTERs + re-policies producer-owned `oee_snapshots` (D-OEE-1 violation, though PRD §9.1 authorizes it to 15-OEE). Move the site_id ALTER+index+RLS to **08-production** (table owner); reduce T-002 to a pre-flight existence assertion + read-only Drizzle Select schema. Hard-blocked anyway until 08 T-008 creates the table. |
| RLS graceful degrade (S-2, F-1) | refinement | ⬜ TODO | T-002/003/004 RLS reference `site_user_access`/`sites` (14-multi-site) which may not exist yet. Gate the site sub-select behind `IF EXISTS` or ship as a 14-triggered follow-up; org-level isolation must still apply pre-14. |
| UI route path (X-3) | consolidation pass | ⬜ TODO | Rewrite oee T3-ui paths (`apps/web/app/(oee)/...` in T-023 etc.) → `apps/web/app/[locale]/(app)/(modules)/oee/...`. |
