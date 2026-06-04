---
name: MON-domain-planning
description: "Use when implementing 04-planning-basic + 07-planning-ext tasks: MRP, WO scheduling, wo_dependencies, schedule_outputs (NOT wo_outputs — that's 08-production canonical), V-PLAN-WO-CYCLE validation rule, capacity planning."
version: 1.0.0
model: opus
canonical_spec: docs/prd/04-PLANNING-BASIC-PRD.md
---

# MON-domain-planning — Planning (Basic + Extended) Playbook

**Purpose:** implementation guidance for every task in `_meta/atomic-tasks/04-planning-basic/` (66 tasks) and `_meta/atomic-tasks/07-planning-ext/` (57+1 tasks) and any cross-module task that produces planning inputs or consumes a planning read-model. Planning is a projection layer — it never owns runtime production state.

**Why this skill exists:** the canonical-ownership question for `wo_outputs` was already resolved on 2026-05-14 (Fixer F5) and re-introducing a duplicate planning-side `wo_outputs` table is the single highest-cost regression for this domain. Cycle detection (V-PLAN-WO-CYCLE) and capacity-window respect (PM / lab / shipping windows) are likewise easy to silently bypass. Re-deriving these contracts per task wastes Opus tokens and reintroduces drift.

## When to use

- Implementing any T-NNN in `_meta/atomic-tasks/04-planning-basic/tasks/` or `_meta/atomic-tasks/07-planning-ext/tasks/`
- Adding a new MRP/MPS pass, WO scheduler run, capacity projection, or what-if scenario
- Touching `schedule_outputs`, `wo_dependencies`, `wo_material_reservations`, `scheduler_runs`, `scheduler_assignments`, `changeover_matrix*`, `demand_forecasts`
- Wiring 03-tech BOM/routings, 02-settings calendars, 01-NPD FG, 11-shipping SO, 09-quality lab leads, or 13-maintenance PM windows into a scheduling input
- Emitting any `planning.*` outbox event consumed by 08-production / 06-scanner / 12-reporting

## Do NOT use when

- Touching the canonical runtime `wo_outputs` table — that lives in 08-production (use [[MON-domain-production]])
- Pure foundation primitive work — use [[MON-foundation-primitives]]
- T1-schema for a non-planning table with only `org_id` + RLS — use [[MON-t1-schema]] + [[MON-multi-tenant-site]]

## Required reading (load every time)

1. [[MON-project-overview]] §"Modules glossary" + §"Wave0 + critical locks" — esp. the `wo_outputs canonical = 08-production` lock
2. `_meta/atomic-tasks/prd-decompose-hybrid/` SKILL (the FORMAT skill) — pipeline_inputs shape
3. `_meta/atomic-tasks/04-planning-basic/coverage.md` + `manifest.json`
4. `_meta/atomic-tasks/07-planning-ext/coverage.md` + `manifest.json` + `UPGRADE-REPORT-2026-05-14.md`
5. `_meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md` — canonical `wo_outputs` vs `schedule_outputs` decision
6. `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md` — Wave0 sweep (org_id, `app.current_org_id()`, foundation citations, PRD anchor corrections)
7. `docs/prd/04-PLANNING-BASIC-PRD.md` + `docs/prd/07-PLANNING-EXT-PRD.md`
8. The target task JSON itself — its `scope_files`, `acceptance_criteria`, `risk_red_lines`, `cross_module_dependencies` are normative

## CRITICAL ownership rule

The 2026-05-14 user decision is binding. Violating it = immediate revert.

| Concern | Owner | Lives in |
|---|---|---|
| **`schedule_outputs`** (planning projection: planned_wo_id, output_role, expected_qty, allocation_pct, disposition, downstream_wo_id) | **04-planning-basic T-005** | `packages/db/schema/planning/schedule_outputs_dag.ts` + `0005_planning_schedule_outputs_dag.sql` |
| **`wo_outputs`** (canonical runtime: batch_number, qa_status, V-PROD-24, catch_weight_details, allergen cascade, R13 audit) | **08-production T-003** | `packages/db/schema/production/wo_outputs.ts` |

**Materialization contract:** on `wo.start` event, 08-production projects each `schedule_outputs` row into the canonical `wo_outputs` row, populating production-only columns at runtime. Planning NEVER writes to `wo_outputs`. Production NEVER writes to `schedule_outputs`.

**Mandatory risk red line on every planning task that touches outputs:**

> "Do NOT create the `wo_outputs` table or any migration of it in 04 or 07 modules — `wo_outputs` is canonically owned by 08-production T-003 (user decision 2026-05-14, see `_meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md`). Planning writes to `schedule_outputs` only; production materializes on WO start."

Cross-module dep entry on planning-output-touching tasks: `{"module":"08-production","task_id":"T-003","reason":"Canonical wo_outputs owner — planning materializes via schedule_outputs at WO start"}`.

## V-PLAN-WO-CYCLE rule

The `wo_dependencies` graph models predecessor/successor edges with optional lag (offset hours). It MUST be a DAG.

- **Where the rule lives:** validation triggered on every `wo_dependencies` insert/update.
- **Detection algorithm:** depth-first traversal from the inserted edge's successor; if traversal reaches the predecessor, the edge would close a cycle → reject with `V-PLAN-WO-CYCLE` validation error.
- **UI surface:** `cycle_check_warning_modal` (PLN-024) in 04-PB T-055 — surfaces violations during cascade preview before commit.
- **Cascade preview consumer:** 04-PB T-019 + T-053 (`cascade_preview_modal`) MUST run the cycle check before allowing user to commit a multi-WO cascade.
- **Test contract:** every wo_dependencies write path must have a RED test attempting to introduce a 2-node cycle and a 3-node cycle, asserting both rejected with V-PLAN-WO-CYCLE.

**Risk red line for any wo_dependencies write path:**

> "Every `wo_dependencies` insert/update MUST run V-PLAN-WO-CYCLE acyclicity check before commit. Bypassing this validator = silent infinite scheduling loop at solver time. Cycle detection lives in the planning DSL rule + Server Action layer; UI surface is `cycle_check_warning_modal`."

## Sub-modules

| Sub-module | Scope | Task range |
|---|---|---|
| **04-PB** Planning Basic | Suppliers, supplier_products, PO + lines, TO + lines + line_lps, MRP basic, WO baseline schema, `schedule_outputs`, `wo_dependencies`, `wo_material_reservations`, planning_settings, status history, D365 SO pull + draft WO review, cascade preview, hard-lock reservation, allergen-aware sequencing (basic), finite-capacity stub, planning dashboard, RBAC perm-enum | T-001..T-066 |
| **07-PE** Planning Extended | `scheduler_runs`, `scheduler_assignments`, `changeover_matrix` + versions + drafts, `demand_forecasts`, `forecast_actuals`, `scheduler_scenarios`, `matrix_review_request`, `scheduler_config`, Python solver microservice (FastAPI), greedy + local search algos, idempotency, DSL rules (`finite_capacity_solver_v1`, `allergen_sequencing_optimizer_v2`, `disposition_bridge_v1`), Gantt dashboard, run history/detail, capacity projection, pending review, settings, rule viewer, sequencing v2 overlay, what-if scenarios (P2), Prophet forecaster (P2), disposition bridge (P2), factory-release input guard, E2E + perm-enum | T-001..T-058 |

## Key concepts glossary

- **MRP** (Materials Requirements Planning) — backward-chain explosion from MPS demand through BOM levels to derive component net requirements per planning period. Inputs: BOM (03-tech), on-hand inventory (05-WH), open PO/TO supply (04-PB), forecast (07-PE). Output: planned PO/TO/WO suggestions + exception messages.
- **MPS** (Master Production Schedule) — top-level FG demand plan, derived from D365 SO pull (when enabled) + manual orders + forecast. Inputs flow from 11-shipping (SO) and 07-PE (`demand_forecasts`).
- **`schedule_outputs`** — planning-time projection of expected WO outputs (one row per primary/co-product/byproduct). Partial-unique index `schedule_outputs_one_primary_per_wo` on `(org_id, planned_wo_id) WHERE output_role='primary'`. Columns: `planned_wo_id`, `output_role` enum, `expected_qty`, `allocation_pct`, `disposition` enum (default `to_stock`), `downstream_wo_id`. RLS via `app.current_org_id()`.
- **`wo_dependencies`** — predecessor/successor edges with optional lag. Acyclic (V-PLAN-WO-CYCLE). Drives cascade preview (`cascade_preview_modal` / `plan_cascade_dag`).
- **`wo_material_reservations`** — hard-lock reservation of an LP/quantity for a planned WO. Released on WO cancel; never deletes already-materialized canonical `wo_outputs` rows.
- **Capacity planning** — projecting load (planned + in-flight WOs) against capacity windows (work calendars from 02-settings, PM unavailability from 13-maintenance, lab lead times from 09-quality). Two horizons: rough-cut (04-PB) and finite (07-PE).
- **Finite vs infinite scheduling** — *infinite* = ignore capacity, place at earliest WO due-date offset (04-PB stub, §11). *Finite* = solver respects capacity windows + changeover matrix + sequencing rules (07-PE T-021..T-023).
- **Alternate routings** — multiple routing variants on a single product (e.g., line A vs line B with different cycle times). Scheduler may pick best routing in finite mode (07-PE).
- **Changeover matrix** — `changeover_matrix` + `changeover_matrix_versions` (07-PE T-003): from→to product allergen-aware changeover duration in minutes. Seeded with 14 EU allergen classes + Mustard + NONE (T-010).
- **What-if scenario** — copy of a `scheduler_run` with parameter overrides, evaluated without committing (07-PE T-006, T-052; P2-gated).
- **Demand forecast** — manual CSV upload P1 (07-PE T-019, T-042); Prophet auto-forecast P2 (T-054). Supersession by `forecast_id` chains.

## Outbox events (Planning emits)

| Event | Producer task | Consumers | Trigger |
|---|---|---|---|
| `planning.wo.scheduled` | 04-PB T-018 (WO create) | 08-prod, 06-scanner, 12-reporting | New WO placed in plan |
| `planning.wo.rescheduled` | 04-PB T-026 / 07-PE T-014..T-017 | 08-prod, 06-scanner | WO planned_start_at / planned_end_at moved |
| `planning.wo.cancelled` | 04-PB T-022 | 08-prod, 05-WH (release reservations) | WO cancelled before start |
| `planning.schedule.published` | 07-PE T-028 | **08-prod** (primary consumer) | Scheduler run results committed |
| `planning.mrp.run_completed` | 04-PB T-032 (MRP outbox emitter) | 12-reporting, 04-PB dashboard | MRP pass finished |
| `scheduler.run.completed` | 07-PE T-028 | 12-reporting, planning dashboard | 07-PE run terminal status |
| `scheduler.assignment.approved` | 07-PE T-028 | 08-prod (becomes WO commit) | Approver accepts solver assignment |
| `scheduler.assignment.overridden` | 07-PE T-029 | 08-prod, 12-reporting (audit) | Manual override of solver output |
| `scheduler.assignment.bulk_approved` | 07-PE T-029 | 08-prod | Bulk approve action |
| `matrix.version.published` | 07-PE T-029 | Solver (cache invalidate), 12-reporting | New changeover matrix version active |

All emissions go through the foundation outbox (T-112) — never write directly to a queue.

## Cross-module dependencies

### Consumer (planning reads from)

| Source module | What planning consumes | Pin |
|---|---|---|
| **01-NPD** | FG SSOT, factory release read model, allergen cascade snapshot | T-018 (WO create), T-052 (wo_create_wizard), 07-PE T-055 (factory-release input guard) |
| **02-settings** | Work calendars, status/field visibility, planning_settings, DSL rule registry | 04-PB T-006, T-007, T-028, T-029; 07-PE T-008, T-025..T-027 |
| **03-technical** | BOM (active version pinned at WO create), routings, equipment, items, cost-per-kg | 04-PB T-018, T-019, T-052; 07-PE T-026 (allergen optimizer reads taxonomy) |

> **⚠️ 03-technical dependency status (2026-06-04):** the Technical **Wave-A schema** is MERGED — `items` (mig 153), shared BOM SSOT + `item_id` FK + `bom_co_products`/`bom_snapshots` (mig 159), routings (mig 163), `item_cost_history` (mig 160) all EXIST. BUT planning's hard-dep on **T-080 (FactorySpec+BOM bundle approval API)** and **T-081 (Technical release adapter for NPD T-097)** is **still PENDING — those are Wave-B**, not yet implemented (see `_meta/atomic-tasks/03-technical/STATUS.md` T-080/T-081 ⬜). Per Gate-3, no 04-PB WO-create task that pins an active/approved BOM via the release path may start until T-080/T-081 are ✅ DONE. (Note: the 03-technical STATUS.md header is **stale** — it still shows T-001/T-002/T-003 as ⬜ though migs 153/159/160 shipped; trust the migrations + commit `e9f30796`/`3420ffad`, not that STATUS row, until it is re-audited.)
| **05-warehouse** | LP availability, on-hand inventory, disposition source | 04-PB T-021..T-024, T-049, T-056; 07-PE T-053 (disposition bridge P2) |
| **09-quality** | Lab lead times (inspections + sampling plans), spec approval, hold blocking before scheduling | 04-PB T-025, T-057, T-064; 07-PE T-053 |
| **11-shipping** | SO demand (D365 SO pull), customer due dates | 04-PB T-030, T-031, T-037, T-061; 07-PE T-019 (forecast) |
| **13-maintenance** | PM windows → unavailable capacity blocks | 07-PE T-021..T-023 solver inputs |
| **Foundation** | T-111 worker (long solver runs), T-112 outbox, T-121 rate-limit, T-124 e-sign, T-125 `withOrgContext` HOF | All Server Actions + outbox emitters |

### Producer (planning emits to)

| Target module | What planning produces | Pin |
|---|---|---|
| **08-production** | `schedule_outputs` rows materialized at WO start; `planning.schedule.published`; `scheduler.assignment.approved` | 04-PB T-005, 07-PE T-028 |
| **06-scanner** | Operator schedules + planned WO list | `planning.wo.scheduled` consumer |
| **12-reporting** | Schedule events, MRP run completion, KPI inputs | All planning outbox |
| **15-OEE** | Capacity utilisation cross-checks | 07-PE T-046 (capacity projection) |

## Forbidden patterns

1. **Creating a `wo_outputs` table or migration in 04 or 07.** Violation of canonical 08-production ownership (2026-05-14 user decision). Use `schedule_outputs` only — see Fixer F5.
2. **Bypassing V-PLAN-WO-CYCLE on `wo_dependencies` writes.** Every insert/update path must run the acyclicity check; cascade preview UI must surface violations via `cycle_check_warning_modal`.
3. **Mutating finalized `schedule_outputs`.** Once a row is materialized into canonical `wo_outputs` (08-production), planning may not edit it. Cancel/rebuild via a new schedule revision instead.
4. **Ignoring capacity windows from 13-maintenance.** Solver inputs (07-PE T-021..T-023) MUST subtract PM windows from available capacity. Schedules placed inside PM windows = silent maintenance conflict at runtime.
5. **Bypassing the 09-quality consume gate (T-064) for planning-time reservation checks.** Reservations against held LPs must not pre-allocate; release path must re-check on hard-lock release.
6. **Reading `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` directly.** Use foundation `app.current_org_id()` function (Wave0 v4.3 lock).
7. **Using `tenant_id` as a column name.** Wave0 v4.3 column lock = `org_id`. F1 already swept 04 T-002/T-003/T-005/T-006.
8. **Direct queue writes for any `planning.*` / `scheduler.*` event.** Route through foundation outbox (T-112).
9. **Letting D365 / local export flags unlock scheduling.** 07-PE T-055 factory-release input guard pins this — D365 posture is P2 sales-history source only, never P1 source-of-truth.
10. **Duplicating basic planning APIs in 07-PE.** Ext consumes the basic Planning WO read model; basic-side WO state writes belong in 04-PB.

## PRD anchor sweep history (07-PE)

Fixer F1 corrected 6 broken PRD anchors in 07-PE on 2026-05-14. Real headings: §5.1 (Architecture), §5.4 (Performance), §4.1 (Phase 1 MVP). No sub-numbered §5.1.1 / §5.1.2 / §5.1.3 / §5.4.1 / §5.4.4 / §4.1.3 exist in the PRD.

| Task | Broken | Replaced with |
|---|---|---|
| T-001 | §5.1.1, §5.4.4 | §5.1, §5.4 |
| T-010 | §4.1.3 | §4.1 |
| T-012 | §5.1.1 | §5.1 |
| T-021 | §5.1.1, §5.4.1 | §5.1, §5.4 |
| T-024 | §5.1.2 R14 | §5.1 R14 |
| T-028 | §5.1.3 | §5.1 |

04-PB also had 2 anchor corrections: T-033 (§3.2/§3.3 → §3) and T-045 (§MRP-gap → §4).

**Always verify §X.Y exists in the PRD before citing it.** Use `grep -E '^### §?[0-9.]+ ' docs/prd/07-PLANNING-EXT-PRD.md` (or the basic PRD) to enumerate real headings. See [[MON-project-overview]] §"Wave0 + critical locks" for the broader anchor-discipline policy.

## Recurring live-bugs (pass vitest+tsc, break live — full checklist: `docs/workflow/02-QUALITY-GATES.md` §Recurring live-bug checklist)

Before any 04/07 sign-off, run the canonical Gate-5 checklist (classes 1-12). Planning-specific traps:
1. **RBAC seed (class 1, #1 live bug).** Ship a wave-1 P0 `NNN-planning-permission-seed.sql` granting `planning.*` / `scheduler.*` to the org-admin family (`org.access.admin`/`org.platform.admin`/`owner`/`admin`/`org_admin`) AND planner roles, in BOTH `role_permissions` + legacy jsonb, with org-insert trigger + backfill. The page-CHECK strings must byte-match the seed-GRANT strings. Model on `packages/db/migrations/149-npd-permissions-org-admin-seed.sql`.
2. **Outbox enum (class 5).** Every `planning.*`/`scheduler.*` event MUST be in `packages/outbox/src/events.enum.ts` + CHECK before emit; pass `check-drift.test.ts`.
3. **Canonical owner (class 8).** NEVER create/write `wo_outputs` here — use `schedule_outputs` (08-production owns `wo_outputs`). See Forbidden patterns #1/#3.
4. **Schema task names its consumer (class 10).** A `schedule_outputs`/`scheduler_runs` migration is not "done" until its consuming WO-create/run-dispatch Server Action + UI ship.
5. **Regenerate `__expected__/schema.sql` after each migration; never edit an applied migration; 3-digit name ≥ HEAD (class 4).**

## Cross-links

- [[MON-project-overview]] — repo map, Wave0 locks, module glossary (read FIRST)
- [[MON-t1-schema]] — Drizzle schema authoring for `schedule_outputs`, `scheduler_runs`, `changeover_matrix*`, etc.
- [[MON-t2-api]] — Server Actions / API for run dispatch, approve/reject/override, MRP, cascade preview
- [[MON-foundation-primitives]] — outbox (T-112), worker (T-111) for long solver runs, rate-limit (T-121), e-sign (T-124), `withOrgContext` HOF (T-125)
- [[MON-multi-tenant-site]] — `org_id` + `app.current_org_id()` + `site_id` rollout
- [[MON-domain-production]] — **canonical `wo_outputs` owner**; consumer of `planning.schedule.published`; materialization handover
- [[MON-domain-warehouse]] — LP availability + on-hand for MRP + reservations
- [[MON-domain-quality]] — `v_active_holds` consume gate (T-064); lab lead times for capacity windows
- [[MON-domain-maintenance]] — PM windows = unavailable capacity for solver
- [[MON-domain-shipping]] — SO demand input (D365 SO pull); customer due dates feed MPS
