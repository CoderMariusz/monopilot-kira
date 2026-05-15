# 14-MULTI-SITE Bootstrap Report — 2026-05-14

Bootstrap target: `_meta/atomic-tasks/14-multi-site/`
Audit source: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §14-MULTI-SITE slice (8 priority slices MS-001..MS-008)
PRD: `docs/prd/14-MULTI-SITE-PRD.md` v3.2 (Phase D + Direction-B Transport Lanes reconciliation, 1184 lines)
UX: `prototypes/design/14-MULTI-SITE-UX.md` (1675 lines)
Prototype index: `_meta/prototype-labels/prototype-index-multi-site.json` (28 entries)
Translation notes: `_meta/prototype-labels/translation-notes-multi-site.md` (506 lines, 25 components + cross-cutting rules)

---

## Summary

- **Tasks emitted:** 31 (range T-001..T-031)
- **Sub-modules:** 7 (14-a..14-g)
- **P0 blockers:** 3 (T-001 foundation extension, T-030 activation migration, T-031 permission enum)
- **Audit slices closed:** 8/8 (MS-001..MS-008)
- **Validation rules cross-referenced:** all 30 (V-MS-01..V-MS-30)
- **Cross-module dependencies declared:** 9 modules (00-foundation, 02-settings, 05-warehouse, 08-production, 09-quality, 10-finance, 11-shipping, 12-reporting, 13-maintenance, 15-oee)
- **UI tasks with `prototype_match: true`:** 11 (T-015, T-016, T-018, T-019, T-021..T-026, T-028, T-029) — all with `ui_evidence_policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
- **Foundation extension flagged:** T-001 (`app.current_site_id()` + `withSiteContext` HOF; carry-forward extension on top of 00-foundation T-125 `withOrgContext`)

## Sub-module counts

| Sub-module | Scope | Task count | Task range |
|---|---|---:|---|
| 14-a | Core schema + RLS + foundation extension + middleware | 7 | T-001..T-007 |
| 14-b | Inter-site TO state machine + outbox + cost allocation | 4 | T-008..T-011 |
| 14-c | Transport Lanes + Rate Cards (Direction-B) | 5 | T-012..T-016 |
| 14-d | Master-data sync + replication queue + conflict resolve | 3 | T-017..T-019 |
| 14-e | Site management UI (switcher, list, detail, wizard, decom, permissions, config) | 7 | T-020..T-026 |
| 14-f | Cross-site dashboards + MV + activation migration | 4 | T-027..T-030 |
| 14-g | Permission enum addition | 1 | T-031 |

## Task-by-task index

| ID | Title (truncated) | Type | Priority | Labels |
|---|---|---|---:|---|
| T-001 | Foundation extension: app.current_site_id() + withSiteContext HOF | T2-api | 30 | p0-blocker, auth, rls, platform-primitive |
| T-002 | sites table + RLS + indexes | T1-schema | 40 | data, schema |
| T-003 | site_user_access + 1-primary constraint | T1-schema | 40 | data, schema |
| T-004 | site_settings + L2 override pattern | T1-schema | 50 | data, schema |
| T-005 | sites_hierarchy_config + site_capacity | T1-schema | 50 | data, schema |
| T-006 | site_access_policy_v1 DSL rule + generator | T2-api | 40 | data, rls |
| T-007 | x-site-id middleware + JWT claim wiring | T2-api | 40 | auth, middleware |
| T-008 | transfer_orders ALTER for inter-site | T1-schema | 50 | data, schema |
| T-009 | to_state_machine_v1 IN_TRANSIT extension | T2-api | 50 | domain, state-machine |
| T-010 | Dual-approval gate + 3 outbox events | T2-api | 50 | domain, approval, outbox |
| T-011 | Cost allocation + 10-FIN handoff | T2-api | 60 | domain, cost-allocation |
| T-012 | transport_lanes table + V-MS-24 | T1-schema | 50 | data, schema |
| T-013 | rate_cards + audit + supersede chain | T1-schema | 60 | data, schema |
| T-014 | Lane suggestion API + IST cost auto-suggest | T2-api | 60 | api, lane-suggestion |
| T-015 | Lane list + detail UI (BL-MS-05 Recharts) | T3-ui | 70 | ui, lane (proto_match) |
| T-016 | Rate card upload 4-step wizard | T3-ui | 70 | ui, rate-card (proto_match) |
| T-017 | Outbox events + replication queue schema | T1-schema | 50 | data, outbox |
| T-018 | Conflict resolve modal + V-MS-30 e-sig fix | T3-ui | 50 | ui, p1-bug-fix (BL-MS-02 fix; proto_match) |
| T-019 | Replication retry / run-sync modal | T3-ui | 60 | ui, replication (proto_match) |
| T-020 | Site switcher (SiteCrumb global header) | T3-ui | 60 | ui, switcher |
| T-021 | Sites list page | T3-ui | 70 | ui, sites-list (proto_match) |
| T-022 | Site detail 8-tab page (BL-MS-04 mobile) | T3-ui | 70 | ui, site-detail (proto_match) |
| T-023 | Activation 3-step wizard page (D-MS-14) | T3-ui | 80 | ui, activation (proto_match) |
| T-024 | Site decommission modal + V-MS-21 gates | T3-ui | 70 | ui, decommission (proto_match) |
| T-025 | Permissions matrix UI 3 views + bulk CSV | T3-ui | 70 | ui, permissions-matrix (proto_match) |
| T-026 | Site config override modal | T3-ui | 70 | ui, config-override (proto_match) |
| T-027 | cross_site_summary MV + pg_cron | T1-schema | 60 | data, materialized-view |
| T-028 | MS-001 Site Overview dashboard | T3-ui | 80 | ui, dashboard (proto_match) |
| T-029 | MS-002 IST Tracker dashboard | T3-ui | 80 | ui, ist-tracker (proto_match) |
| T-030 | site_id activation migration (ALTER+backfill 20 tables) | T1-schema | 90 | p0-blocker, migration, activation |
| T-031 | multi_site permission enum (26 strings) | T1-schema | 90 | p0-blocker, auth, permissions |

## Audit slices closed (MS-001..MS-008)

| Slice | Tasks |
|---|---|
| MS-001 sites table + RLS | T-001..T-007 (7 tasks) |
| MS-002 Inter-site TO state machine | T-008..T-011 + T-029 |
| MS-003 Transport lanes + rate cards (BLOCKER #2) | T-012..T-016 |
| MS-004 Master data sync | T-017 |
| MS-005 Replication queue + conflicts | T-017..T-019 |
| MS-006 Activation wizard + decommission | T-023, T-024, T-030 |
| MS-007 UI parity (dashboard + sites list + lanes list) | T-021, T-022, T-015, T-028, T-029 |
| MS-008 Permission enum delta | T-031 |

## Foundation extension declaration (T-001)

**T-001 creates a 00-foundation carry-forward extension.** It introduces:

- New SQL: `app.session_site_contexts` trust table, `app.set_site_context(session_token, site)` SECURITY DEFINER setter, `app.current_site_id()` SECURITY DEFINER STABLE LEAKPROOF reader.
- New TS: `packages/db/src/with-site-context.ts` `withSiteContext` HOF (composes on T-125 `withOrgContext`).
- New TS: `apps/web/lib/auth/with-site-context-route.ts` Next.js wrapper (enforces V-MS-15/V-MS-16/V-MS-17).

This is a foundation primitive consumed by 8 modules (05-WH/08-PROD/09-QA/10-FIN/11-SHIP/12-REP/13-MAINT/15-OEE) for site-scoped RLS. Foundation `coverage.md` needs a new section `## Tenant-context extension — site_id (14-multi-site dependency T-001)` registering the cross-module carry-forward (T-001's `scope_files` includes `_meta/atomic-tasks/00-foundation/coverage.md [modify]`).

Coordination with 00-foundation owners: confirmed in T-001's `cross_module_dependencies` array referencing T-125 + T-007.

## Cross-module deps highlights

The site_id activation migration (T-030) is the highest cross-module surface in the module:

- 5 tables owned by 05-warehouse (warehouses, license_plates, grn_items, stock_movements, transfer_orders)
- 5 tables owned by 08-production (work_orders, wo_outputs, wo_consumptions, wo_dependencies, downtime_events)
- 4 tables owned by 09-quality (quality_holds, quality_inspections, ncr_reports, haccp_plans)
- 2 tables owned by 10-finance (inventory_cost_layers, wip_balances)
- 2 tables owned by 11-shipping (shipments, sales_orders)
- 3 tables owned by 13-maintenance (maintenance_work_orders, spare_parts_stock, calibration_instruments)
- 1 table owned by 15-oee (oee_snapshots, P2 activation)
- Worker scaffold from 00-foundation T-112

`CODEOWNERS` review will be required on T-030 due to file-touch breadth.

## Notes & follow-ups

- All schema tasks reference `app.current_org_id()` + `app.current_site_id()` foundation helpers; no raw `current_setting()` GUC reads anywhere (RLS contract per Wave0 v4.3 + this module's T-001 foundation extension).
- Direction-A items (MS-007/MS-008/MS-009 P2 dashboards with no design) **NOT** included in this bootstrap — deferred to Phase E P2 wave per PRD §10C status table.
- `OQ-MS-11` (V-MS-30 e-sig wiring) resolved in T-018 → reuse 02-SET `reauthenticate` API (not bespoke component).
- `OQ-MS-12` (MS-110 vs 12-REP overlap) NOT addressed in this bootstrap — Phase E decision required.
- `OQ-MS-13` (`sites_screen` mis-tag in prototype-index) NOT addressed — prototype-index hygiene out of bootstrap scope.
- `BL-MS-02` (conflict-resolve e-sig wiring gap) **FIXED** by T-018.
- `BL-MS-04` (IST detail mobile accordion) addressed in T-022 acceptance criteria.
- `BL-MS-05` (chart placeholders) addressed in T-015 (Recharts BarChart for lane history).
- `BL-MS-01` (Map View library decision) deferred per translation notes — T-028 explicitly renders placeholder with no map library import.
- `BL-MS-06` (heartbeat pinger) explicitly P2 per translation notes — not in scope.
- `BL-MS-07` (hierarchy depth migration wizard) explicitly P2 — T-005 only creates the schema; UI wizard deferred.

## Validation performed

- 31/31 task JSONs parse as valid JSON (verified via `python3 -m json.tool`).
- All UI tasks (`proto_match: true`) include `prototype_index_entry` + `ui_evidence_policy`.
- All schema tasks reference real PRD `§X.Y` anchors (no fabricated sections; cross-checked against PRD heading list lines 21-1180).
- All prototype `file:lines` references checked against `prototype-index-multi-site.json` line ranges.
- Manifest `task_count: 31` matches file count.
- `coverage.md` matrix has 1 row per task (31 rows + sub-module map).
- 30/30 V-MS validation rules cross-referenced (V-MS-01 in T-002; V-MS-02..V-MS-04 in T-002; V-MS-05/06 in T-003; V-MS-07 in T-007 super_admin handling; V-MS-08 in T-006; V-MS-09..V-MS-14 in T-008..T-011; V-MS-15..V-MS-17 in T-001/T-007; V-MS-18..V-MS-20 in T-023/T-030; V-MS-21 in T-024; V-MS-22 in T-019; V-MS-23 in T-009 + AC of T-018; V-MS-24 in T-012; V-MS-25..V-MS-28 in T-013; V-MS-29 in T-015; V-MS-30 in T-018).

## Deliverables

- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/14-multi-site/manifest.json`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/14-multi-site/coverage.md`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/14-multi-site/tasks/T-001.json` .. `T-031.json`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/14-multi-site/BOOTSTRAP-REPORT-2026-05-14.md` (this file)
