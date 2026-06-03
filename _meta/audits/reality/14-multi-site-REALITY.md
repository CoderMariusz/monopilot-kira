# 14-multi-site — Reality Audit (2026-06-02)

## Counts
- task files: 31 | manifest task_count: 31 | STATUS rows: 0 (no STATUS.md existed)
- Reconciliation: manifest and file count match exactly. No STATUS.md was present before this audit.

## Task reality

| Task | Title (abbrev) | Type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Foundation: app.current_site_id() + withSiteContext HOF | T2-api | ⛔ MISSING | packages/db/migrations/0040_site_context.sql — absent; packages/db/src/with-site-context.ts — absent; apps/web/lib/auth/with-site-context-route.ts — absent; packages/db/__tests__/with-site-context.test.ts — absent | P0-blocker. Zero code. 8-module transitive dep. |
| T-002 | sites table + RLS + indexes | T1-schema | ⛔ MISSING | packages/db/migrations/0041_sites.sql — absent; packages/db/src/schema/sites.ts — absent | No migration, no Drizzle schema, no RLS policy, no zod, no test. |
| T-003 | site_user_access table + 1-primary constraint | T1-schema | ⛔ MISSING | packages/db/migrations/0042_site_user_access.sql — absent; packages/db/src/schema/site-user-access.ts — absent | |
| T-004 | site_settings + L2 override | T1-schema | ⛔ MISSING | packages/db/migrations/0043_site_settings.sql — absent | |
| T-005 | sites_hierarchy_config + site_capacity | T1-schema | ⛔ MISSING | packages/db/migrations/0044_hierarchy_capacity.sql — absent | |
| T-006 | site_access_policy_v1 DSL rule + RLS generator | T2-api | ⛔ MISSING | packages/db/migrations/0045_site_access_policy_v1_rule.sql — absent; packages/db/src/policies/site-access-policy-v1.ts — absent | |
| T-007 | x-site-id Next.js middleware + JWT claim wiring | T2-api | ⛔ MISSING | apps/web/lib/auth/site-context-middleware.ts — absent; apps/web/middleware.ts — no x-site-id code | |
| T-008 | transfer_orders ALTER for inter-site | T1-schema | ⛔ MISSING | packages/db/migrations/0046_transfer_orders_inter_site.sql — absent; packages/db/src/schema/transfer-orders.ts — absent (no src/schema/ dir exists) | |
| T-009 | to_state_machine_v1 IN_TRANSIT extension | T2-api | ⛔ MISSING | packages/domain/ — package does not exist; packages/db/migrations/0047_to_state_machine_in_transit.sql — absent | packages/domain not created. |
| T-010 | Cross-site dual-approval gate + 3 outbox events | T2-api | ⛔ MISSING | packages/domain/src/transfer-orders/actions.ts — absent (package missing) | |
| T-011 | Inter-site TO cost allocation + worker handler | T2-api | ⛔ MISSING | packages/domain/src/transfer-orders/cost-allocation.ts — absent; apps/worker/ — package does not exist | packages/domain + apps/worker both missing. |
| T-012 | transport_lanes table + RLS org-scoped | T1-schema | ⛔ MISSING | packages/db/migrations/0048_transport_lanes.sql — absent | |
| T-013 | transport_lane_rate_cards + audit + supersede chain | T1-schema | ⛔ MISSING | packages/db/migrations/0049_lane_rate_cards.sql — absent; packages/domain/src/transport-lanes/ — absent | |
| T-014 | Lane suggestion API + IST freight-cost auto-suggest | T2-api | ⛔ MISSING | apps/web/app/api/lanes/suggest/route.ts — absent; packages/domain/src/transport-lanes/cost-estimator.ts — absent | |
| T-015 | Lane list + detail UI | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/lanes/ — directory does not exist | prototype_match=true; prototypes/design/Monopilot Design System/multi-site/sites-screens.jsx (415 lines) exists but no impl. |
| T-016 | Rate card upload 4-step wizard modal | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/lanes/[laneId]/_components/rate-card-upload-modal.tsx — absent | prototype_match=true |
| T-017 | Outbox event extensions + replication queue schema | T1-schema | ⛔ MISSING | packages/db/migrations/0050_ms_outbox_and_replication.sql — absent; packages/db/src/schema/replication-jobs.ts — absent | |
| T-018 | Master-data Conflict Resolve modal + V-MS-30 e-sig | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/conflicts/ — absent | prototype_match=true; BL-MS-02 p1-bug-fix |
| T-019 | Replication retry / Run Sync modal | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/_components/replication-retry-modal.tsx — absent | prototype_match=true |
| T-020 | Site switcher UX (SiteCrumb global header) | T3-ui | 🟡 STUB | apps/web/components/shell/site-crumb.tsx EXISTS — but is text-only placeholder with data-todo="multi-site-T-020"; declared path apps/web/components/site-switcher.tsx is MISSING; apps/web/components/_actions/set-site-context.ts MISSING | SiteCrumb renders static orgName with explicit TODO marker. No live switching. Path mismatch vs declared scope_files. Test at apps/web/components/shell/__tests__/site-crumb.test.tsx covers the stub contract only. |
| T-021 | Sites list page (ms_sites_list) | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/sites/page.tsx — absent (only apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx stub exists as module landing) | prototype_match=true |
| T-022 | Site detail 8-tab page | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/sites/[siteId]/page.tsx — absent | prototype_match=true |
| T-023 | Activation 3-step wizard page | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/activate/page.tsx — absent | prototype_match=true |
| T-024 | Site decommission modal + V-MS-21 gates | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/sites/[siteId]/_components/site-decommission-modal.tsx — absent | prototype_match=true |
| T-025 | Site permissions matrix UI + bulk CSV | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/permissions/page.tsx — absent | prototype_match=true |
| T-026 | Site config override modal MS-102 | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/sites/[siteId]/_components/site-config-override-modal.tsx — absent | prototype_match=true |
| T-027 | cross_site_summary materialized view + pg_cron | T1-schema | ⛔ MISSING | packages/db/migrations/0052_cross_site_summary_mv.sql — absent | |
| T-028 | MS-001 Site Overview dashboard page | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/dashboard/page.tsx — absent | prototype_match=true |
| T-029 | MS-002 Inter-site TO Tracker dashboard | T3-ui | ⛔ MISSING | apps/web/app/(multi-site)/transfers/page.tsx — absent | prototype_match=true |
| T-030 | site_id activation migration: ALTER + backfill 21 tables | T1-schema | ⛔ MISSING | packages/db/migrations/0053_site_id_activation.sql — absent; apps/worker/src/jobs/site-id-activation.ts — absent (worker package missing) | P0-blocker. |
| T-031 | Add multi_site permission strings to enum (26 strings) | T1-schema | ⛔ MISSING | packages/rbac/src/permissions.enum.ts EXISTS (181 lines) but zero multi_site.* entries; packages/rbac/src/__tests__/permissions.test.ts EXISTS but no multi_site assertions | P0-blocker. The file exists; the 26 strings are absent. |

## Summary counts
- IMPLEMENTED: 0
- STUB: 1 (T-020 — SiteCrumb placeholder, wrong path, no switching logic)
- MISSING: 30 (T-001..T-019, T-021..T-030, T-031)
- PHANTOM: 0
- BROKEN: 0
- EXTRA (code without a task): 1 — apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx (Walking Skeleton module landing stub; belongs to wave-0 skeleton not a 14-multi-site task); apps/web/components/shell/site-crumb.tsx (partial T-020 placeholder, wrong path)

## Phantom / carry-forward backlog
- T-001 is a declared 00-foundation carry-forward: app.current_site_id() + withSiteContext HOF. Foundation coverage.md section not yet created. This is a registered cross-module dependency (14-multi-site T-001 → 00-foundation T-125).
- packages/domain — no task creates this package; referenced by T-009, T-010, T-011, T-013, T-014. PHANTOM package with no owning task in either 14-multi-site or any foundation module.
- apps/worker — no task creates this package; referenced by T-011, T-030. PHANTOM package with no owning task.

## Extra (code without a task)
- apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx — Walking Skeleton stub page (ModuleStubNotice). Created in Wave 0 (commit 42258d53). No 14-multi-site task owns it; it is correctly a skeleton artifact.
- apps/web/components/shell/site-crumb.tsx — partial T-020 work. Path declared in T-020 is apps/web/components/site-switcher.tsx (absent). The crumb file is a pre-implemented stub at a different path.
- apps/web/e2e/parity-evidence/shell/en-multi-site.png — parity screenshot for SiteCrumb only (Walking Skeleton shell acceptance); not T-020 parity evidence.

## Top integration risks
1. **packages/domain does not exist** — T-009, T-010, T-011, T-013, T-014 all target packages/domain/src/transfer-orders/ and packages/domain/src/transport-lanes/. No task in this module or 00-foundation creates this package. Before any of these tasks can start, the package must be scaffolded. This is an untracked phantom dependency blocking the entire IST + lanes sub-modules (14-b and 14-c).
2. **T-001 (app.current_site_id() + withSiteContext) is P0-blocker for 8 cross-module consumers** — five modules (05-WH, 08-PROD, 09-QA, 10-FIN, 11-SHIP, 12-REP, 13-MAINT, 15-OEE) have declared cross-module deps on this primitive. Until T-001 is implemented, none of those modules can wire site-scoped RLS. The migration number collision risk also exists: existing migrations go up to 050, and T-001 claims 0040 (integer vs. zero-padded naming convention mismatch — existing files use three-digit `000-050` while T-001 declares four-digit `0040_*`).
3. **Migration naming convention conflict** — existing migrations use the pattern `NNN-name.sql` (e.g., `040-tenant-l2.sql`). All 14-multi-site T1-schema tasks declare migrations with the pattern `NNNN_name.sql` (four-digit + underscore). Migration runner behavior on this mismatch is untested and could silently skip or double-apply. The existing `040-tenant-l2.sql` already occupies the 040 slot, so `0040_site_context.sql` would need renaming to `051_site_context.sql` or higher. All 13 multi-site migration numbers must be re-sequenced before implementation.

## Skeleton contribution
- The module landing page at apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx is a functioning Walking Skeleton stub — it renders with the ModuleStubNotice component, passes navigation, and is reachable. This is wave-0 complete.
- SiteCrumb (apps/web/components/shell/site-crumb.tsx) is a static text placeholder with explicit TODO(multi-site/T-020) marker — skeleton DoD satisfied (visible in shell, non-broken). Full switcher blocked on T-001/T-002/T-003/T-007.
- No real Supabase data query is in place for 14-multi-site screens. The stub landing page returns translated strings only.
- No 14-multi-site schema tables exist in the DB layer. The `sites` table, site-scoped RLS, and all supporting tables are fully unimplemented.
