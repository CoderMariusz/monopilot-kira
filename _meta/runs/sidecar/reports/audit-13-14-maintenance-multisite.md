# Forward-Looking PLAN/TASK Audit — 13-maintenance + 14-multi-site

> READ-ONLY audit. No code modified. Date: 2026-06-04. Auditor: sidecar agent.
> Goal: make tasks CLEAR + complete BEFORE build. Both modules are 0% built (pre-implementation).
> Evidence base: PRDs (`docs/prd/13-*`, `14-*`), manifests, STATUS.md, coverage.md, reality audits
> (`_meta/audits/reality/`), task JSONs, prototype-index files, live grep of `packages/db/migrations/`.

---

## Ground-truth snapshot (verified live)

| Fact | Value | How verified |
|---|---|---|
| 13-maintenance task files | 30 (T-001..T-030) | `manifest.json` + `find tasks/` |
| 14-multi-site task files | 31 (T-001..T-031) | `manifest.json` + `find tasks/` |
| Both modules implemented | **0 tasks** (13: 0/30, 14: 0/31; 14 has 1 STUB = T-020 SiteCrumb) | reality audits + STATUS.md |
| Migration files in repo | 140 files; highest number **149** | `find packages/db/migrations -name '*.sql'` |
| Migrations containing `site_id` | **0** | `grep -rl site_id packages/db/migrations/` = 0 |
| `work_orders` table built yet | No (08-production unbuilt) | grep migrations |
| Prototypes present | 13: 11 JSX + html/css; 14: 11 JSX + html/css | `prototypes/design/Monopilot Design System/{maintenance,multi-site}/` |
| Prototype-index (labeled) | 13: 1240 lines; 14: 1009 lines, both with `entries` | `_meta/prototype-labels/prototype-index-*.json` |
| Domain skill | 13: **MON-domain-maintenance** ✅; 14: **none dedicated** (relies on generic MON-multi-tenant-site) | `.claude/skills/` |

The single most important finding (F-1 from prior sidecar `cross-module-plan-audit.md`) is **independently re-confirmed live**: both PRDs claim every operational table already carries `site_id UUID NULL` "from Foundation day 1", but **zero migrations contain `site_id`** and no foundation task adds it. The real plan is a retrofit (14/T-030), and it hardcodes a stale table count. This is a P0 cross-cutting architectural decision (D-1) that gates both modules and modules 04–15.

---

# MODULE 13-MAINTENANCE

## Task count / status
- **30 tasks, 0 implemented.** 1 partial seed stub (T-013 reference schemas in `reference-schemas.sql`).
- Sub-modules (manifest): 13-a settings/equipment/RBAC; 13-b PM schedules+engine; 13-c MWO core lifecycle; 13-d spare parts; 13-e calibration/sanitation/outbox.
- STATUS.md and coverage.md are **complete and accurate** — both were written by the 2026-06-02 reality audit and match the task set. Manifest is the *richer* of the two modules (full `cross_module_dependencies`, `sub_modules`, `wave1_foundation_primitives_used`).

## Clarity verdict: **MOSTLY CLEAR — build-ready after 4 fixes below.**
Sampled tasks (T-017 auto-downtime consumer, others) are high quality: explicit file lists, RED-first test strategy, ACs in Given/When/Then, risk red-lines, cross-module deps enumerated, prototype anchors for UI tasks. This is the better-decomposed of the two modules.

## Missing tasks / gaps (stubs proposed)
1. **`apps/worker` package has no owning creation task** (shared phantom with 14). T-009 (PM cron engine) and T-017 (auto-downtime consumer) target `apps/worker/src/maintenance/*` but no task scaffolds `apps/worker`. The reality audit for 14 flagged this as a PHANTOM package; it equally blocks 13-b/13-c/13-e workers. → stub `m13-worker-package-scaffold.md` (likely belongs to 00-foundation alongside T-111/T-112).
2. **`packages/events` Zod contract for `downtime.created` is undefined.** T-017 says "if absent, import a minimal local schema and add a STUB comment requiring 08-production to publish canonical." That is a deferred, unowned contract — same anti-pattern as F-4 (npd pilot_wo). No task pins the downtime event contract. → stub `m13-downtime-event-contract.md`.
3. **`oee_maintenance_trigger_v1` (D-MNT-11) is P2-stub only** — correctly deferred (registered as stub in T-007, evaluated by 15-OEE). No gap, but the *consumer wiring* (auto-PM MWO on availability breach) has no P1 task and no explicit P2 task file; it lives only in coverage.md "P2/deferred". Acceptable, flagged for traceability.
4. **MTBF/MTTR read-model dependency direction:** T-008 (`maintenance_kpis` MV) + T-027 analytics must READ `oee_shift_metrics` from 15-OEE (D-MNT-3, read-only). 15-OEE is built AFTER 13-maintenance per build order. So `maintenance_kpis` MV and the analytics tab have an **expected external gap** until 15-OEE lands — this is legal but is NOT recorded as a known external gap in STATUS.md (only as a generic note in coverage.md line 116). Recommend STATUS.md add an explicit external-gap row. (No new task; documentation fix.)

## Missing logic / inconsistencies
- **Naming-collision risk (maintenance WO vs production work_order): LOW / well-handled.** PRD §9.5 names the table `maintenance_work_orders` with its own `mwo_number` (MWO-YYYY-NNNNN) and full 6-state machine `mwo_state_machine_v1` (D-MNT-9 unified Work-Request+WO). It is a fully distinct table from 08-production `work_orders` (the production WO). No FK from MWO to production WO; the only link is the soft `downtime_event_id` → 08-PROD `downtime_events`. **Verdict: no collision** — the two "work order" concepts are cleanly separated by table name, number prefix, owner module, and state machine. The naming is verbose but unambiguous. One residual: 14/T-030's §9.8 list site-scopes BOTH `work_orders` (08) and `maintenance_work_orders` (13) — correct, but reviewers must not conflate them.
- **Downtime → OEE feeds:** maintenance does NOT write downtime. 08-production owns `downtime_events` (producer); 13 only *consumes* via outbox (T-017) and creates an MWO. OEE availability is computed by 15-OEE from 08's downtime, NOT from maintenance. So "maintenance downtime → OEE" is indirect: MWO completion emits `mwo.completed` which triggers 15-OEE MTBF/MTTR recalc (§6.2 flow). Correctly modeled; no canonical-owner breach.
- **`maintenance_kpis` MV SQL in PRD §9.16 is non-runnable** (`completed_at::date <= (schedule_id IS NOT NULL AND <scheduled_date>::date)` is pseudo-code with a literal `<scheduled_date>` placeholder). T-008 must reify the on-time calculation against a real scheduled-date source (`maintenance_schedules.next_due_date` snapshot at MWO creation). T-008 prompt should call this out explicitly; currently it inherits the broken PRD SQL. → minor task-clarity fix noted; not a blocker.
- **`equipment` IS the asset registry** (no separate `assets` table) — correctly resolved in coverage.md notes; reviewers should not expect an `assets` table.

## Cross-module dependency / canonical-owner table (13-maintenance)

| Direction | Counterpart | Contract | Owner | Status |
|---|---|---|---|---|
| IN | 00-foundation T-125 | `app.current_org_id()` for RLS | foundation | unbuilt (blocks T-002..T-006) |
| IN | 00-foundation T-111/T-112 | outbox + worker primitive | foundation | unbuilt (blocks T-009/T-012/T-017) |
| IN | 00-foundation T-124 | e-sign primitive | foundation | unbuilt (blocks T-014 LOTO, T-016 sanitation) |
| IN | 00-foundation T-121/T-116..118/T-123 | rate-limit/observability/Playwright | foundation | unbuilt (blocks T-028, T-030) |
| IN | 02-settings §7.8 | `rule_definitions` registry (6 P1 DSL rules) | 02-settings (BUILT ✅) | available |
| IN | 02-settings §8.9 | Reference.ManufacturingOperations (operation-scoped PM) | 02-settings | partial — verify §8.9 delta landed |
| IN | 08-production | `downtime_events` producer + `downtime.created` outbox event | **08-production (canonical)** | unbuilt — expected external gap for T-017 |
| IN | 08-production | `production_lines` (equipment.parent_line_id soft ref) | 08-production | unbuilt — soft ref, no FK, OK |
| IN | 15-OEE | `oee_shift_metrics` MTBF/MTTR (READ-ONLY per D-MNT-3) | **15-OEE (canonical)** | unbuilt — built AFTER 13; external gap |
| OUT | 08-production | emit `sanitation.allergen_change.completed` → `allergen_changeover_gate_v1` | 13 emits, 08 consumes | event-only |
| OUT | 09-quality | `calibration.failed` → hold candidate; `calibration_instruments.id` = FK target for `lab_results.equipment_id` (D-MNT-10) | FK added by 09-QA migration (fwd-compat comment in T-006) | event + doc-only |
| OUT | 12-reporting | seed MNT-001..014 in `dashboards_catalog` (T-029) | 12-reporting owns catalog | unbuilt — T-029 blocks until catalog exists |
| OUT | 14-multi-site | `maintenance_work_orders`/`spare_parts_stock`/`calibration_instruments` site-scoped by T-030 | 14 activation | see D-1 |

**Canonical-owner verdict: CLEAN.** 13 never writes `downtime_events`, `wo_outputs`, `oee_snapshots`, or `oee_shift_metrics`. It owns its own `maintenance_*`, `mwo_*`, `spare_parts*`, `calibration_*`, `sanitation_*` tables. No cross-owner DDL.

## RBAC / reachability / nav
- **T-001 permission enum (17 `mnt.*.*` strings) is P0-blocker** — `packages/rbac/src/permissions.enum.ts` has zero `mnt.` strings; every Server Action RBAC check + ESLint enum-lock guard fails until it lands. Must execute first.
- Personas + RLS write scopes fully specified in PRD §4 (operator/technician/maintenance_manager/production_manager/quality_manager/admin). RLS pattern = `org_id = current_org_id() AND (site_id IS NULL OR site_id IN site_user_access)` — note this **already references site_user_access** (a 14-multi-site table), so 13's RLS as written has a forward dependency on 14. Until 14 lands, the `site_id` clause must be a no-op (site_id always NULL). T-002..T-006 prompts should clarify the site_id clause is dormant pre-14.
- Nav: maintenance route reachable in walking skeleton (`/[locale]/(app)/(modules)/maintenance/page.tsx` ModuleStubNotice; `en-maintenance.png` parity screenshot). UI tasks T-018..T-027 replace the stub.

## Build-readiness gaps (13)
- ✅ Domain skill present (MON-domain-maintenance, opus, 151 lines).
- ✅ Prototypes present (11 JSX) + labeled prototype-index (1240 lines).
- ❌ `apps/worker` package phantom (stub proposed).
- ❌ Foundation Wave-1 primitives (T-111/112/124/125/121/116-118/123) all unbuilt — hard sequential gate.
- ⚠️ Migration numbering: 13 task JSONs were not re-sampled for migration numbers, but per the 14 pattern they likely declare low/legacy numbers; real sequence is at 149 with `NNN-name.sql`. **Re-sequence check required before build** (same risk as 14, below).

---

# MODULE 14-MULTI-SITE

## Task count / status
- **31 tasks, 0 implemented, 1 STUB** (T-020 SiteCrumb — text-only placeholder at WRONG path: built `apps/web/components/shell/site-crumb.tsx`, task declares `apps/web/components/site-switcher.tsx`).
- Sub-modules (STATUS.md): 14-a core schema+RLS+foundation extension+middleware (T-001..07); 14-b inter-site TO (T-008..11); 14-c transport lanes+rate cards (T-012..16); 14-d master-data sync+replication (T-017..19); 14-e site management UI (T-020..26); 14-f cross-site dashboards+MV+activation (T-027..30); 14-g permission enum (T-031).
- STATUS.md is **excellent** (per-sub-module, phantom-package section, migration-naming-risk section, carry-forward section). coverage.md is thorough. **Manifest.json is THIN** — unlike 13, it has NO `cross_module_dependencies`, NO `sub_modules`, NO `wave1_foundation_primitives_used` block (the rich dep data lives only in coverage.md + per-task JSON). → recommend enriching manifest to 13's standard for orchestrator parity.

## Clarity verdict: **CLEAR per-task, but BLOCKED on 3 architectural decisions + 2 phantom packages.**
Individual task JSONs (T-001 foundation extension, T-030 activation) are very high quality — detailed contracts, idempotency, batched backfill, atomic policy swap, V-MS validation queries, fail-closed red-lines. The PROBLEM is not task prose; it is unresolved cross-cutting architecture (site_id strategy) + missing scaffolding packages + migration renumbering.

## Missing tasks / gaps (stubs proposed)
1. **`packages/domain` package has no owning creation task (PHANTOM).** Referenced by T-009, T-010, T-011, T-013, T-014 (`packages/domain/src/transfer-orders/`, `.../transport-lanes/`). No task in 14 or foundation scaffolds it. Blocks all of 14-b and 14-c. → stub `m14-domain-package-scaffold.md`.
2. **`apps/worker` package phantom (shared with 13).** T-011, T-030 target `apps/worker/src/jobs/*`. → covered by `m13-worker-package-scaffold.md` (cross-listed).
3. **site_id strategy decision (D-1) is unresolved** — T-030 hardcodes 21 tables; the day-1 assumption is false. This is the dominant gap. → stub `m14-site-id-strategy.md` (supersedes/extends prior `plan-site-id-policy.md` with concrete recommendation, see below).
4. **`oee_snapshots.site_id` ownership (F-5)** — T-030 §9.8 list includes `oee_snapshots`, and separately 15-OEE/T-002 declares an `ALTER oee_snapshots ADD site_id` (consumer altering producer-owned table — violates D-OEE-1). Must be assigned to 08-production (producer) or to 14/T-030 (central activation), NOT 15-OEE. → stub `m14-oee-snapshots-siteid-owner.md`.
5. **Migration renumbering task** — all 14 T1-schema tasks declare `NNNN_name.sql` (e.g., `0040_site_context.sql`, `0053_site_id_activation.sql`); real repo uses `NNN-name.sql` and is at 149. Every 14 migration must be re-sequenced to 150+. No task owns this renumber. → stub `m14-migration-renumber.md`.

## Missing logic / inconsistencies
- **T-030 internal table-count inconsistency:** title + several ACs say "21 tables"; body prose says "20 tables"; the enumerated list has **21 entries** (warehouses, license_plates, grn_items, stock_movements, work_orders, wo_outputs, wo_consumptions, wo_dependencies, downtime_events, quality_holds, quality_inspections, ncr_reports, haccp_plans, shipments, sales_orders, inventory_cost_layers, wip_balances, oee_snapshots, maintenance_work_orders, spare_parts_stock, calibration_instruments). PRD §9.8 lists 21 rows too. The "20" references are stale (a Fixer F14a AC-consolidation artifact). **More importantly, the count is brittle** — modules 04–13 will add operational tables (e.g., 13 alone owns 3 site-scoped tables that are correctly in the list, but future tables won't be). This is exactly F-1's failure mode. The fix is catalog-driven discovery (D-1 option B) or a day-1 registry (option A), not patching the number.
- **T-001 RLS layering is sound** but it is labeled a "14-multi-site task" while functionally being a **00-foundation primitive** (consumed by 8 modules). STATUS.md + coverage.md both flag it as a "foundation extension / carry-forward" and require a `00-foundation/coverage.md` section that does NOT yet exist. Recommend MOVING T-001 ownership to 00-foundation (or formally registering it as a foundation carry-forward before any other module wires site-scoped RLS) — otherwise 8 modules depend on a primitive owned by a module built near-last (#14).
- **production_shifts site-scoping (D-MS-9) is split** — PRD §9.7 puts the `ALTER production_shifts ADD site_id` in "14-a migration", but T-030 out_of_scope explicitly excludes it ("D-MS-9 covered by 08-PROD / 15-OEE downstream"). So production_shifts site-scoping has NO clear owning task. → flagged; likely belongs in the D-1 registry/activation scope.
- **transfer_orders is 05-warehouse-owned** — T-008 ALTERs it (adds from_site_id/to_site_id/cost/approval cols). This is a consumer altering another module's table, BUT it is explicitly sanctioned (D-MS-3, the inter-site TO extension is 14's defining feature and 05-WH owns only the base). Acceptable cross-owner ALTER *if* 05-WH `transfer_orders` exists first (05-WH unbuilt → external gap). Reviewers must confirm 05-WH builds `transfer_orders` before 14-b.

## site_id STRATEGY ANALYSIS + RECOMMENDATION (the P0 finding)

### The contradiction (evidence)
- **PRD claim (both modules):** 14 §6.4 line 239 + D-MS-1 line 282: *"Wszystkie operational tables już mają site_id UUID NULL (retroaktywnie dodane w Foundation phase)."* 13 §6.3 line 171 + D-MNT-8: "site_id UUID NULL na 14 tabelach od day 1 (nie retrofit per REC-L1)."
- **Built reality:** 140 migrations, **0 contain `site_id`**; `00-FOUNDATION-PRD` defers multi-site to Phase C/D; no foundation task adds site_id; 01-npd and 02-settings (both built) have zero site_id columns.
- **Actual plan:** 14/T-030 retrofits via `ALTER + backfill 21 operational tables` — a **hardcoded list** that will be stale by the time 14 runs (it is built #14, after 04–13 each add operational tables).
- **Consequence if unaddressed:** when 14 runs last, T-030's fixed 21-table list silently misses operational tables added by 04–13 → multi-site RLS gaps (cross-site data leakage) that pass tests (tests only check the 21 listed tables).

### Options (from cross-module-plan-audit D-1)
- **(A) Day-1 rule + registry:** add a hard CLAUDE.md rule — *every new operational table ships `site_id UUID NULL` and registers in an `operational_tables` registry (checked-in JSON or DB table)*. Apply to 04–13 as built; retrofit the already-built 01-npd/02-settings operational tables. T-030 then drives off the registry.
- **(B) Catalog-driven retrofit:** keep retrofit-only, but rewrite T-030 to DISCOVER site-scoped tables dynamically (from a registry/classification artifact) instead of a fixed list. Lower per-module burden; risk of mis-classifying a table as master vs operational.
- **(C) Do nothing:** large manual error-prone retrofit at module 14. Not recommended.

### RECOMMENDATION: **(A) day-1 rule + a checked-in `operational_tables` classification registry, COMBINED with making T-030 registry-driven (the discovery half of B).**
Rationale:
1. **Correctness SSOT.** A single registry that every schema task must update is the only way to *prove* 14 activation covers 100% of operational tables. Option B alone (pure catalog query) cannot distinguish "operational" from "master" without a classification artifact — so B necessarily needs the registry too. So A and B converge on "build the registry."
2. **Cheapest long-term.** 04–13 are mostly unbuilt — adding `site_id UUID NULL` at table-creation time is a one-line cost per table now, versus an error-prone bulk ALTER later. Only 01-npd + 02-settings need retrofit (small, known surface).
3. **Activation stays as a real migration** (T-030 keeps its idempotent ALTER/backfill/policy-swap machinery) but iterates over the registry, not a hardcoded list — eliminating the stale-count failure mode.
Concrete deliverables (see stub `m14-site-id-strategy.md`):
- Add CLAUDE.md hard rule + update MON-multi-tenant-site / MON-t1-schema skills.
- Create `operational_tables` registry (recommend checked-in JSON `_meta/operational-tables.json` mirrored to a seed table) classifying every table operational vs master, with `site_id` status.
- Retrofit 01-npd + 02-settings operational tables with `site_id UUID NULL` (small migrations, numbered 150+).
- Rewrite 14/T-030 to drive off the registry; assert registry = pg_catalog operational tables (no drift).
- **Also resolve F-5:** assign `oee_snapshots.site_id` to **08-production** (producer, per D-OEE-1) since under option A the owning module adds its own site_id column; de-scope the ALTER out of 15-OEE/T-002 (reduce to read-only mirror + indexes). See stub `m14-oee-snapshots-siteid-owner.md`.

This is a **human decision (D-1)** — the stubs are proposals only, gated on that decision.

## Cross-module dependency / canonical-owner table (14-multi-site)

| Direction | Counterpart | Contract | Owner | Status |
|---|---|---|---|---|
| IN | 00-foundation T-125 / T-007 | `withOrgContext` / `app.current_org_id()` (T-001 composes on top) | foundation | unbuilt |
| IN | 00-foundation T-111/T-112 | outbox + worker (T-010/T-017/T-019/T-030) | foundation | unbuilt |
| IN | 00-foundation T-113 | GDPR retention (T-024 decommission 7y) | foundation | unbuilt |
| IN | 00-foundation T-124 | e-sign primitive (T-018 conflict-resolve V-MS-30) | foundation | unbuilt |
| IN | 00-foundation T-117 | observability redact (T-014/T-016 rate pricing) | foundation | unbuilt |
| IN | 02-settings §7.8 / §9 / ADR-031 / T-046 | rules registry, L2 feature-flag orchestration, config_schema, enum-lock guard | 02-settings (BUILT ✅) | available |
| IN | 05-warehouse | `transfer_orders` base table (T-008 ALTERs it) + `to_state_machine_v1` v1 (T-009 extends) + `warehouse_outbox_events` | **05-WH (canonical owner of transfer_orders)** | unbuilt — external gap for 14-b |
| IN | 08-production | `work_orders` (T-022 site detail view) | 08-production | unbuilt |
| IN | 10-finance | `inventory_cost_layers` (T-011 cost allocation consumer) | 10-finance | unbuilt |
| OUT/ACTIVATE | 05/08/09/10/11/13/15 | T-030 site_id activation ALTERs 21 operational tables across these 7 modules | see D-1 | gated on D-1 |
| OUT | 12-reporting | register MS-001/MS-002 in `dashboards_catalog` (T-027/T-028) | 12-reporting owns catalog | unbuilt |
| CONFLICT | 15-OEE | `oee_snapshots.site_id` — 15-OEE/T-002 ALTERs producer-owned table (F-5) | **should be 08-PROD or 14, NOT 15** | needs D-1 resolution |

**Canonical-owner findings:**
- ✅ `transfer_orders` ALTER by 14 is sanctioned (D-MS-3) but requires 05-WH base first.
- ❌ **F-5 LIVE:** 15-OEE/T-002 ALTERing `oee_snapshots` (08-owned, D-OEE-1) is a canonical-owner breach. Must move to 08 or 14.
- ⚠️ T-030 touches 21 tables across 7 modules — highest cross-module surface in the project. Requires the registry SSOT (D-1) to be correct.

## RBAC / reachability / nav (14)
- **T-031 permission enum (26 `multi_site.*.*` strings) is P0-blocker** — `permissions.enum.ts` (181 lines) has zero `multi_site.*` entries; ESLint enum-lock guard (02-SET T-046, BUILT) will block any UI/Server Action referencing them.
- **T-001 + T-007 gate all reachability** — site-scoped RLS (T-001 helper) + x-site-id middleware (T-007) must exist before any site-scoped screen returns correct data. T-020 site switcher is a stub at the wrong path with no live switching.
- Nav: multi-site route reachable in skeleton (`/[locale]/(app)/(modules)/multi-site/page.tsx` ModuleStubNotice). SiteCrumb visible in shell (static text). UI tasks T-021..T-029 build the real screens; all carry `prototype_match=true`.

## Build-readiness gaps (14)
- ❌ **No dedicated MON-domain-multisite skill.** 13 has MON-domain-maintenance; 14 relies on the generic MON-multi-tenant-site ("THE LAW" RLS skill). Given 14's complexity (IST state machine, transport lanes, rate cards, replication queue, activation migration), a dedicated domain skill is warranted. → stub `m14-domain-skill.md`.
- ❌ `packages/domain` phantom (stub).
- ❌ `apps/worker` phantom (stub, shared with 13).
- ❌ Migration renumbering required (0040→150+; underscore→hyphen pattern) (stub).
- ❌ Thin manifest.json (no cross_module_dependencies / sub_modules block) — enrich to 13's standard.
- ❌ site_id strategy (D-1) unresolved (dominant stub).
- ✅ Prototypes present (11 JSX) + labeled prototype-index (1009 lines).
- ✅ Per-task JSONs high quality.
- ✅ 02-settings (the key upstream for feature-flag orchestration + enum guard) is BUILT.

---

## CONSOLIDATED VERDICT

| | 13-maintenance | 14-multi-site |
|---|---|---|
| Tasks / built | 30 / 0 | 31 / 0 (1 stub) |
| Per-task clarity | High | High |
| Coverage vs PRD | Complete | Complete |
| Manifest quality | Rich ✅ | Thin ⚠️ |
| Domain skill | ✅ MON-domain-maintenance | ❌ none dedicated |
| Prototypes + index | ✅ | ✅ |
| Canonical-owner cleanliness | Clean ✅ | F-5 breach (oee_snapshots) ❌ |
| Phantom packages | apps/worker | packages/domain + apps/worker |
| Naming collision (MWO vs WO) | Resolved ✅ (distinct tables) | n/a |
| Migration numbering | Re-check needed ⚠️ | Re-sequence required ❌ |
| **P0 blockers before build** | T-001 enum; foundation Wave-1 primitives; apps/worker scaffold | D-1 site_id strategy; T-031 enum; T-001→foundation; packages/domain + apps/worker scaffold; migration renumber; F-5 owner |

**Bottom line:**
- **13-maintenance is the cleaner module** — build-ready once (a) 00-foundation Wave-1 primitives land, (b) `apps/worker` is scaffolded, (c) the downtime-event Zod contract is pinned, (d) T-001 enum runs first. No architectural decision required.
- **14-multi-site is well-decomposed at the task level but architecturally BLOCKED** on the site_id strategy (D-1), the F-5 oee_snapshots owner, two phantom packages, migration renumbering, and a missing domain skill. It cannot be built correctly until D-1 is decided, and T-001 should be re-homed to 00-foundation.

## Proposed-task stubs written (proposals only — not added to any manifest/STATUS)
- `_meta/runs/sidecar/proposed-tasks/m13-worker-package-scaffold.md`
- `_meta/runs/sidecar/proposed-tasks/m13-downtime-event-contract.md`
- `_meta/runs/sidecar/proposed-tasks/m14-site-id-strategy.md`  ← D-1, dominant
- `_meta/runs/sidecar/proposed-tasks/m14-oee-snapshots-siteid-owner.md`  ← F-5
- `_meta/runs/sidecar/proposed-tasks/m14-domain-package-scaffold.md`
- `_meta/runs/sidecar/proposed-tasks/m14-migration-renumber.md`
- `_meta/runs/sidecar/proposed-tasks/m14-domain-skill.md`
</content>
</invoke>
