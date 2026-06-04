# Side-car consolidated findings — all unbuilt modules (2026-06-04)

Read-only plan/task audit of every not-yet-built module so each `/kira:run-module` starts with a clear,
correct task set. Per-module detail + proposed task stubs live in `_meta/runs/sidecar/reports/` and
`_meta/runs/sidecar/proposed-tasks/`. **Good news first:** per-task JSON quality is uniformly high
(gold-standard atomic tasks, RED-first TDD, PRD+prototype anchors, typed cross-module deps). **No missing
P1 feature epics were found in any module.** Everything below is infra-staleness, ownership leaks, or
pre-build decisions — not missing decomposition.

## A. Cross-cutting patterns (apply as STANDARDS to every future module)

| # | Pattern | Affected | Fix standard |
|---|---|---|---|
| **X-1** | **RBAC unseeded** — modules add permission enum STRINGS but no migration GRANTS them to roles → every page builds green then 403s on the live deploy (the class that hit 02-settings + 01-npd; fixed via 146/148/149/150). | ALL (03,04,05,06,07,08,09,11,13,14 confirmed 0 grants) | Every module ships a `NNN-<module>-permission-seed.sql` (mirror 116/146/148) granting its perms to the org-admin family + operator roles. Make it a wave-1 p0 task, not buried at the end. |
| **X-2** | **Migration numbering staleness** — tasks hardcode `0NN_`/`0040_`/`0060_` which sort BEFORE the real HEAD (149/151) and silently never run (the 01-npd deploy gotcha). | 05,06,07,13,14 | Renumber every module's migrations to ≥ current HEAD at run start; runner regex is `^(\d{3})-[a-z0-9-]+\.sql$`. |
| **X-3** | **Path mismatch** — `scope_files` target `apps/web/app/<module>/` or `apps/web/src/`, but the live app is `apps/web/app/[locale]/(app)/(modules)/<module>/`. Orphans routes / breaks next-intl. (08 is correct — use as template.) | 04,07,09,10,12,15,06 | Re-map all UI task paths to the locale tree before build. |
| **X-4** | **Canonical-owner leaks** — consumer tasks write a producer's table. | scanner T-042→`wo_outputs` (08); 15-oee T-002 ALTERs `oee_snapshots` (08) | Move the DDL to the producer module; consumers delegate via Server Action / read-only. |
| **X-5** | **Phantom packages/apps** — referenced but no task creates them. | `packages/domain` (14), `apps/worker` (07,13,14 — though foundation T-111/112 outbox DONE), `apps/scanner` vs built `(scanner)` route-group (06), `packages/integrations-d365`+`packages/events` (11) | Add a scaffold task OR re-home to the existing primitive (e.g. use `apps/worker`+outbox, not Postgres NOTIFY). |
| **X-6** | **Missing domain skills** (required before each module's Codex consensus gate). | `MON-domain-technical`, `MON-domain-scanner`, `MON-domain-reporting` | Author before Wave-B (the others — npd/settings/planning/production/finance/oee/planning — exist). |
| **X-7** | **Stale PRD prose** — PRD bodies still say `tenant_id` (12-rep 21×, 15-oee 35×) but task JSONs already remediate to `org_id`/`app.current_org_id()`. Cosmetic — tasks are Wave0-compliant; optionally fix PRDs. | 12,15,05 (+others) | Docs-only; no task risk. |

## B. Per-module readiness (one-liner + key blockers)

| Module | Tasks | Verdict | Top blockers (before build) |
|---|---|---|---|
| **03-technical** (next) | 91, 0 built | NOT ready — 5 blockers | MON-domain-technical skill; T-091 RBAC enum (9/10 missing); D365 route namespace (/settings vs /technical); Sensory UI no owning task; D365 mapping authority. `items` (T-001) is critical-path for 04/05/08/10/11; `factory_specs` (T-079) blocks 04. |
| **04-planning-basic** | 66, 0 built | Needs 4 fixes | RBAC grant-seed; path remap (src/); T-045 MRP scope (PRD defers it — decide); start-gate on 03 T-080/T-081 + 05-warehouse. |
| **07-planning-ext** | 58, 0 built | NOT buildable yet | Solver hosting undefined (FastAPI can't run on Vercel); solver dispatch uses Postgres NOTIFY not outbox/apps/worker (no DLQ/retry); no RBAC seed/wiring at all. |
| **08-production** | 56, 0 built | Cleanest — buildable once upstreams land | RBAC grant-seed; start-gate on 03 T-080/T-081, 05-warehouse (consume/output/genealogy), 09 T-064 (consume gate). Canonical cores all tasked + correct. |
| **05-warehouse** | 58, 0 built | Nearly ready | RBAC grant-seed; migration renumber; GS1 parser 3 conflicting homes (consolidate to packages/gs1). SSCC-18 correctly P2-deferred. Settings-vs-05 boundary clean. |
| **06-scanner-p1** | 49, 0 built | BLOCKED | Workspace contradiction: foundation built `apps/web/(scanner)/` but tasks say `apps/scanner`; T-042 canonical-owner leak (wo_outputs); no MON-domain-scanner skill; RBAC seed; migration renumber. |
| **09-quality** | 65, 0 built | Build-ready, minor | RBAC enum (T-065) buried — make wave-1 p0; path bug (apps/web/src/); T-050 null x-deps; nav-wiring owner. Quality-hold→production-consume seam fully contracted ✓. |
| **11-shipping** | 32, 0 built | Build-ready, minor | T-029 (D365 outbox+DLQ+dispatcher) compound/high-risk — split + needs apps/worker+packages; allergen-label validators (V-SHIP-LBL) unowned; split T-026/T-027. |
| **10-finance** | 32, 0 built | Excellent decomposition | NUMERIC precision conflict (skill `(18,4)`/`(14,3)` vs PRD/tasks `(15,4)`/`(12,3)`) — reconcile before 10-a; path remap. Costing cleanly separate from NPD waterfall. |
| **12-reporting** | 27, 0 built | Excellent | No MON-domain-reporting skill; path remap. Pure read-sink, no owner violations. |
| **15-oee** | 25, 0 built | Excellent | F-5: T-002 ALTERs 08-owned oee_snapshots (read-only + PRD-authorized, but schema-ownership crossing) — move DDL to 08; path remap. A/P/Q calc correctly in 08, not 15. |
| **13-maintenance** | 30, 0 built | Build-ready | RBAC enum (T-001=17 mnt.*) wave-1; apps/worker phantom; downtime.created event contract unowned. MWO vs work_order — NO collision (clean). |
| **14-multi-site** | 31, 0 built | Architectural blocker | **site_id strategy (D-1)** — PRD claims day-1 site_id column that DOESN'T EXIST (0/149 migrations); T-030 retrofits a hardcoded 21-table list that goes stale. Phantom packages/domain; thin manifest; no skill; migration renumber; T-001 (withSiteContext) belongs in foundation. |

## C. Consolidated DECISIONS needed from the human

1. **site_id strategy (D-1, P0, dominant)** — (A) add a day-1 rule + checked-in `operational_tables` registry now (foundation), T-030 iterates it; or (B) catalog-driven discovery retrofit. Both converge on building the registry; only 01-npd + 02-settings need backfill. Also: who owns the `oee_snapshots.site_id` ALTER — 08 (producer) or 14 (activation)?
2. **03-technical D365 route namespace** — relocate D365 pages to `/technical/d365/*` or accept the current `/settings/integrations/d365/*`?
3. **D365 field-mapping authority (D-4)** — runtime admin screen (03-tech T-057) vs fixed PRD mapping (covers 01-npd deferred Builder + 10/11).
4. **04 MRP scope** — T-045 ships an MRP feature + reorder_thresholds the PRD explicitly defers; accept-into-PRD or defer-to-P2?
5. **07 solver hosting** — where does the FastAPI optimization solver run (not Vercel)? + switch dispatch from Postgres NOTIFY to the canonical outbox/apps/worker.
6. **10-finance NUMERIC precision** — skill `(18,4)`/`(14,3)` vs PRD/tasks `(15,4)`/`(12,3)` — pick the canonical scale.
7. **06-scanner workspace** — standardize on the built `apps/web/(scanner)` route-group; re-path the module's 31 UI tasks.
8. **RBAC seed standard** — adopt "permission-seed migration per module (wave-1 p0)" as the canonical pattern so the 403-everywhere class never recurs.

## D. Proposed new/refined tasks
~40 stubs in `_meta/runs/sidecar/proposed-tasks/` (m03..m15 + plan-*). These are refinements (RBAC seeds, path remaps, task splits, ownership delegations, skill/scaffold tasks, the site_id registry) — to fold into each module's manifest at its run start, NOT applied now.

## E. Module start-gate (build order dependencies)
03-technical T-080/T-081 (factory_specs+release adapter) block 04/07/08 entry tasks. 05-warehouse (100% unbuilt) blocks 04 ship/receive + all 08 consume/output/genealogy — **largest latent risk**. 09-quality T-064 blocks 08 consumption. → suggests order after 03: **05-warehouse → 08-production → 09-quality** before 04/07 planning, OR resolve the start-gates as external gaps.
