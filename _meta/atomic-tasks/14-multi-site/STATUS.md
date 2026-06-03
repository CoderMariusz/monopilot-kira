# 14-multi-site — STATUS

> Legend: ✅ Done | 🔄 In Progress | ⏸ Blocked/Stub | ⬜ Not Started
>
> Reality-audited 2026-06-02 by kira:audit (Phase 0). All 31 tasks confirmed
> MISSING or STUB — zero implementation in repo. See
> `_meta/audits/reality/14-multi-site-REALITY.md` for full evidence.

## Sub-module 14-a — Core schema + RLS + foundation extension + middleware (T-001..T-007)

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | Foundation: app.current_site_id() + withSiteContext HOF | ⬜ | P0-blocker. 0 files exist. Migration 0040_site_context.sql absent. packages/domain dependency also phantom. |
| T-002 | sites table + RLS + indexes | ⬜ | 0 files exist. Migration 0041_sites.sql absent. |
| T-003 | site_user_access + 1-primary constraint + RLS | ⬜ | 0 files exist. |
| T-004 | site_settings + L2 override | ⬜ | 0 files exist. |
| T-005 | sites_hierarchy_config + site_capacity | ⬜ | 0 files exist. |
| T-006 | site_access_policy_v1 DSL rule + RLS generator | ⬜ | 0 files exist. |
| T-007 | x-site-id Next.js middleware + JWT claim wiring | ⬜ | 0 files exist. middleware.ts has no x-site-id code. |

## Sub-module 14-b — Inter-site TO state machine + outbox + cost allocation (T-008..T-011)

| ID | Title | Status | Note |
|---|---|---|---|
| T-008 | transfer_orders ALTER for inter-site cols | ⬜ | 0 files exist. packages/db/src/schema/ has no transfer-orders.ts. |
| T-009 | to_state_machine_v1 IN_TRANSIT extension | ⬜ | 0 files exist. packages/domain package does not exist. |
| T-010 | Cross-site dual-approval gate + 3 outbox events | ⬜ | 0 files exist. packages/domain package does not exist. |
| T-011 | Inter-site TO cost allocation + worker handler | ⬜ | 0 files exist. packages/domain + apps/worker both absent. |

## Sub-module 14-c — Transport Lanes + Rate Cards (T-012..T-016)

| ID | Title | Status | Note |
|---|---|---|---|
| T-012 | transport_lanes table + RLS org-scoped | ⬜ | 0 files exist. |
| T-013 | transport_lane_rate_cards + audit + supersede chain | ⬜ | 0 files exist. packages/domain absent. |
| T-014 | Lane suggestion API + IST freight-cost auto-suggest | ⬜ | 0 files exist. packages/domain absent. |
| T-015 | Lane list + detail UI | ⬜ | 0 files exist. prototype_match=true, prototype exists at 415 lines. |
| T-016 | Rate card upload 4-step wizard modal | ⬜ | 0 files exist. prototype_match=true. |

## Sub-module 14-d — Master-data sync + replication queue + conflict resolve (T-017..T-019)

| ID | Title | Status | Note |
|---|---|---|---|
| T-017 | Outbox events + replication queue schema | ⬜ | 0 files exist. |
| T-018 | Conflict Resolve modal + V-MS-30 e-sig (BL-MS-02 fix) | ⬜ | 0 files exist. prototype_match=true. p1-bug-fix label. |
| T-019 | Replication retry / Run Sync modal | ⬜ | 0 files exist. prototype_match=true. |

## Sub-module 14-e — Site management UI (T-020..T-026)

| ID | Title | Status | Note |
|---|---|---|---|
| T-020 | Site switcher UX (SiteCrumb global header) | ⏸ | STUB: apps/web/components/shell/site-crumb.tsx exists as text-only placeholder with TODO(multi-site/T-020) marker; test covers stub contract only. Declared path (apps/web/components/site-switcher.tsx) MISSING. No live switching. |
| T-021 | Sites list page (ms_sites_list) | ⬜ | 0 files exist. Module landing stub at apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx is skeleton artifact, not this task. prototype_match=true. |
| T-022 | Site detail 8-tab page | ⬜ | 0 files exist. prototype_match=true. |
| T-023 | Activation 3-step wizard page | ⬜ | 0 files exist. prototype_match=true. |
| T-024 | Site decommission modal + V-MS-21 gates | ⬜ | 0 files exist. prototype_match=true. |
| T-025 | Site permissions matrix UI + bulk CSV | ⬜ | 0 files exist. prototype_match=true. |
| T-026 | Site config override modal MS-102 | ⬜ | 0 files exist. prototype_match=true. |

## Sub-module 14-f — Cross-site dashboards + MV + activation migration (T-027..T-030)

| ID | Title | Status | Note |
|---|---|---|---|
| T-027 | cross_site_summary materialized view + pg_cron | ⬜ | 0 files exist. |
| T-028 | MS-001 Site Overview dashboard page | ⬜ | 0 files exist. prototype_match=true. |
| T-029 | MS-002 Inter-site TO Tracker dashboard | ⬜ | 0 files exist. prototype_match=true. |
| T-030 | site_id activation migration: ALTER + backfill 21 tables | ⬜ | P0-blocker. 0 files exist. apps/worker package absent. |

## Sub-module 14-g — Permission enum addition (T-031)

| ID | Title | Status | Note |
|---|---|---|---|
| T-031 | Add 26 multi_site.*.* permission strings to enum | ⬜ | P0-blocker. packages/rbac/src/permissions.enum.ts exists (181 lines) but contains ZERO multi_site.* entries. 26 strings from T-031.pipeline_inputs.permission_strings all absent. |

## Progress summary

| Sub-module | Tasks | Done | In-progress | Blocked/Stub | Not started |
|---|---:|---:|---:|---:|---:|
| 14-a | 7 | 0 | 0 | 0 | 7 |
| 14-b | 4 | 0 | 0 | 0 | 4 |
| 14-c | 5 | 0 | 0 | 0 | 5 |
| 14-d | 3 | 0 | 0 | 0 | 3 |
| 14-e | 7 | 0 | 0 | 1 | 6 |
| 14-f | 4 | 0 | 0 | 0 | 4 |
| 14-g | 1 | 0 | 0 | 0 | 1 |
| **TOTAL** | **31** | **0** | **0** | **1** | **30** |

## Phantom packages (no owning task)
- `packages/domain` — referenced by T-009, T-010, T-011, T-013, T-014. Does not exist. Must be created/scaffolded before 14-b and 14-c can proceed.
- `apps/worker` — referenced by T-011, T-030. Does not exist.

## Migration naming risk
Existing migrations use pattern `NNN-name.sql` (three-digit + hyphen, max currently `050-settings-manage-permissions.sql`). All 14-multi-site T1-schema tasks declare migrations with pattern `NNNN_name.sql` (four-digit + underscore). Numbers must be re-sequenced to 051+ before implementation begins.

## Carry-forwards to 00-foundation
- T-001 creates a foundation extension (app.current_site_id() + withSiteContext). The `00-foundation/coverage.md` section `## Tenant-context extension — site_id (14-multi-site dependency T-001)` is declared in T-001 but not yet written.
