# Cross-Module Plan & Assumptions Audit — MonoPilot Kira

**Run:** SIDE-CAR (read-only), alongside active 01-npd sign-off
**Date:** 2026-06-04
**Scope:** 16 modules (00-foundation … 15-oee); `docs/workflow/**`, `docs/prd/**`,
`_meta/atomic-tasks/*/{manifest.json,STATUS.md,tasks/*.json}`, `_meta/plans/EXECUTION-PLAN.md`,
`_meta/runs/01-npd-RUN-LEDGER.md`, `_meta/runs/consensus/codex-01npd-verdict.md`.
**Method:** static read + grep/JSON extraction of cross-module references in task prompts
(deps are prose in `prompt`/`pipeline_inputs.details`/`prd_refs`, NOT structured fields).
**Constraint honored:** no files in the main working tree or 01-npd were modified.

---

## Built-state baseline (what the plan must now reconcile against)

| Module | Built? | Evidence |
|---|---|---|
| 00-foundation | substantial / signed off | `_meta/runs/00-foundation-SIGNOFF.md` |
| 02-settings | signed off | `_meta/runs/02-settings-SIGNOFF.md` |
| 01-npd | in sign-off NOW (~all non-D365/Sensory done) | `01-npd/STATUS.md`, mig 075→147 |
| 03-technical | **~0% — every task ⬜ NOT STARTED** | `03-technical/STATUS.md` (all rows ⬜/⏸) |
| 04 … 15 | not started | per-module STATUS.md |

Highest migration on branch: **147** (`packages/db/migrations/147-restore-fa-edit-outbox-event.sql`).
**Zero migrations contain `site_id`** (`grep -c site_id packages/db/migrations/* = 0`).

---

## PRIORITIZED FINDINGS

### P0 — Architectural / will-bite-soon

#### F-1. `site_id` "day-1 universal column" assumption is FALSE in built reality
- **Claim in plan:** `docs/prd/14-MULTI-SITE-PRD.md` §6.4 line 239 and D-MS-1 (line 282) state
  *"Wszystkie operational tables już mają `site_id UUID NULL` (retroaktywnie dodane w Foundation phase)"*
  — i.e. every operational table is assumed to already carry `site_id UUID NULL`, added in Foundation.
- **Reality:** Foundation PRD never mandates it (`docs/prd/00-FOUNDATION-PRD.md` defers multi-site to
  "Phase C/D", line 54); **no foundation task adds site_id** (`grep site_id 00-foundation/tasks/*.json` = empty);
  **no migration adds site_id** (0 hits in `packages/db/migrations/`). 01-npd and 02-settings tables have none.
- **Real plan vs prose:** `14-multi-site/tasks/T-030.json` ("ALTER + backfill **21 operational tables**")
  shows the *retrofit* path is the actual plan — but it **hardcodes "21 tables"**. The operational-table
  count grows with every module 04–13; nobody is tracking which new tables are site-scoped vs org-only.
  When 14 runs last, T-030's list will be stale/incomplete and the ALTER+backfill will miss tables.
- **Risk:** Either (a) a hard rule "every new operational table ships `site_id UUID NULL` + a registry entry"
  must be added to CLAUDE.md now and applied to 04–13 as they are built, or (b) 14-MS T-030 must
  dynamically discover operational tables (catalog-driven) instead of a fixed 21-table list. Doing neither
  guarantees a painful, error-prone retrofit and silent multi-site RLS gaps later.
- **→ DECISION D-1; proposed task `plan-site-id-policy`.**

#### F-2. Rollout order is internally inconsistent AND was not followed; 03-technical (a declared upstream of 01-npd) is unbuilt
- `docs/workflow/07-MODULE-EXECUTION.md` spine (line 24): `00-foundation → (02-settings, **03-technical**) → 01-npd → 04-planning-basic`.
- `_meta/plans/EXECUTION-PLAN.md` rollout table (lines 27–29) orders **01-npd (#3) BEFORE 03-technical (#4)** — the two authoritative docs disagree on 03 vs 01 order.
- **Reality:** 01-npd was built first (brownfield "most-built first" directive); 03-technical is 0% built.
  Consequence: 01-npd's cross-module deferrals (Sensory, factory-spec/BOM approval adapter) point at a
  module that *should have been built before it* per the spine. This is a real plan-vs-execution divergence,
  not just a deferral.
- **→ DECISION D-2.**

#### F-3. Sensory **UI** has no owning task anywhere (orphaned deferral)
- 01-npd deferred BOTH `T-071` (Sensory **schema**) and `T-076` (Sensory **UI**) to 03-technical
  (`01-npd/STATUS.md` lines 85, 90 — "canonical owner = 03-technical").
- 03-technical owns the schema/contract via `T-084` ("Technical sensory evaluation contract/read model")
  — but T-084 **explicitly excludes UI**: *"Include schema/API contract and tests only; no UI/prototype implementation."*
  (`03-technical/tasks/T-084.json`).
- `EXECUTION-PLAN.md` line 205 confirms npd `T-076` is typed `docs`/`plan` — a deferral marker, never an impl task.
- **Result:** no module has an impl task for the **Sensory evaluation UI**. It will silently never get built.
- **→ proposed task `plan-sensory-ui`.**

### P1 — Missing cross-module tasks / mis-scoped deps

#### F-4. NPD `pilot_wo_id` soft-link to `work_order` has no 08-production hardening task
- npd mig 144 added `pilot_wo_id uuid` as a **soft link (plain uuid, no FK)** and
  `grant select on public.work_order to app_user`, with the comment
  *"08-production owns work_order writes/RLS"* (`packages/db/migrations/144-npd-legacy-closeout.sql` lines 104, 127, 165–167).
- **No 08-production task** formalizes this contract (`grep pilot_wo 08-production/tasks/*.json` = empty).
  When 08 builds `work_order`, nobody is tasked to (a) decide FK vs soft-link, (b) own the `app_user` grant,
  or (c) provide a read adapter for npd's pilot/trial WO. Mirror of the 09-quality T-064 "contract pin" pattern,
  which 08 *does* have for holds but not for the npd pilot link.
- **→ proposed task `plan-prod-npd-pilot-wo`.**

#### F-5. 15-oee alters `oee_snapshots` (08-owned table) — canonical-owner collision risk
- D-OEE-1 / CLAUDE.md: `oee_snapshots` written **only by 08-production**; 15-oee is read-only.
- 08-production correctly owns the producer (`08-production/tasks/T-008.json` — "oee_snapshots table + V-PROD-10 + RLS").
- But `15-oee/tasks/T-002.json` is "**oee_snapshots site_id extension** + read-only consumer indexes" — i.e. the
  *consumer* (15) issues an `ALTER TABLE oee_snapshots ADD site_id`. A consumer altering the producer's table is
  exactly the kind of cross-owner edit the canonical rule exists to prevent (and it overlaps F-1's site_id problem).
  The site_id column on oee_snapshots should be owned by 08 (producer) or 14 (multi-site activation), not 15.
- **→ DECISION D-1 covers this; proposed task `plan-oee-snapshot-siteid-owner`.**

#### F-6. 08-production WO-consume-block depends on 09-quality T-064, which is built AFTER it
- Consume gate contract = `09-quality/tasks/T-064.json` ("Cross-module contract pin: 08-PROD/05-WH WO consume
  gate on v_active_holds"). MON-domain-production: "Consumes T-064 quality consume gate."
- Rollout order (both docs): `08-production → 09-quality`. So 08's hold-consume-block is an **EXPECTED EXTERNAL GAP**
  until 09 lands. This is legal per the workflow, but must be explicitly recorded as 08's known external gap so
  it isn't mistaken for "done" at 08 sign-off, and 09 must re-verify the 08 seam when it lands.
- **→ no new task; flag for 08 sign-off + 09 re-verify checklist (DECISION D-3).**

### P2 — Decisions deferred from 01-npd that downstream modules inherit

#### F-7. D365 field-mapping deferral is broader than 01-npd
- 01-npd deferred its D365 Builder/Export/Wizard (T-042/044/046/047/123–127, 9 tasks) pending **PRD-TBD field
  mappings** (`01-npd-RUN-LEDGER.md`: "PRD-TBD blocking T-042/044: D365 mappings QUANTITY/PROCESSTIME/
  LOADPERCENTAGE/PRODUCTGROUPID_PR").
- The same D365 surface is **far larger elsewhere**: 03-technical (91 D365 mentions incl. the sync engine
  `T-007/T-028/T-029` and a **D365 Field Mapping admin UI** `T-057`), 10-finance (19), 11-shipping (9),
  04-planning (37 mentions). 03-tech `T-057` ("D365 Field Mapping admin") suggests mappings may be intended as
  **runtime-configurable**, not PRD-fixed — which would *unblock* the npd Builder deferral if that screen is the SSOT.
- **Risk:** the npd D365 deferral was framed as "needs PRD field mappings," but if 03-tech T-057 is the mapping
  authority, the dependency is on a *module*, not a *PRD edit* — and every D365-exporting module (10/11) inherits
  the same unresolved question. Need one decision that covers all D365 modules, not a per-module re-litigation.
- **→ DECISION D-4.**

#### F-8. Allergen/FG terminology + materialized read model — downstream pin needed
- 01-npd's allergen cascade is no longer purely "derived": T-038 now **materializes** to
  `product.allergens` / `product.may_contain` and emits `fa.allergens_changed`
  (`01-npd-RUN-LEDGER.md` MODULE-CLOSE TODO #7).
- Consumers exist downstream: 03-technical (7 tasks reference allergen cascade / fa_allergen / product.allergens),
  09-quality (allergen gates `T-055/T-061/T-064`), 08-production (1). These read the npd read model.
- **Risk:** the MON-domain-npd skill still calls it "derived"; consumers wired against a "derived view" assumption
  may miss the materialized columns + change event. The contract (materialized cols + `fa.allergens_changed`)
  should be pinned for 03/09 before they build. (Skill reconciliation is module-close TODO #7 but **not yet done** —
  it is on the 01-npd branch, out of side-car scope.)
- **→ flag for 01-npd sign-off (skill update) + 03/09 consumer contract note (DECISION D-3 checklist).**

---

## Verified-CLEAN (no action — recorded so they aren't re-investigated)

- **`wo_outputs` canonical owner** = 08-production `T-003` (`08-production/tasks/T-003.json`). Planning (04)
  consistently writes only `schedule_outputs` and references wo_outputs as "owned by 08-production T-003,
  materialized on WO start" (`04-planning-basic/tasks/T-005,T-018,T-019.json`). No planning task creates wo_outputs. ✅
- **`schedule_outputs`** owned by planning; 08 materializes from it. ✅
- **`oee_snapshots` producer** = 08-production only; 15-oee tasks are read-only consumers + MVs
  (`15-oee/tasks/T-002` typed read-only mirror, T-006/T-007 are materialized views). Only caveat = F-5 (site_id ALTER). ✅
- **product per-org composite PK** (the mission's "do downstream modules assume a global product PK?" question):
  mig 142 migrated PK→`(org_id, product_code)` + 14 composite FKs (`01-npd-RUN-LEDGER.md` "RESUMED" section).
  Spot-check of downstream refs found no single-column `product(product_code)` FK assumption in 03/04/08
  (the one 04 hit was `supplier_product_code`, unrelated). ✅
- **`fa.edit` outbox P0** (Codex verdict BLOCK, `codex-01npd-verdict.md`): FIXED by mig 147
  (`147-restore-fa-edit-outbox-event.sql`). ✅
- **D365 export-only / R15 anti-corruption** present in 10/11 task prompts (9 files reference R15/export-only/stage-5). ✅

---

## DECISIONS NEEDED (human) — each as a concrete question

**D-1 — site_id strategy (P0, blocks clean multi-site; touches every module 04–15).**
The multi-site PRD assumes operational tables already carry `site_id UUID NULL` from Foundation; they do not
(0 in built schema). Which path?
- **(A)** Add a hard rule now: *every new operational table ships `site_id UUID NULL` + registers in an
  `operational_tables` registry*; apply to 04–13 as built. (Cheapest long-term; needs a CLAUDE.md rule + registry.)
- **(B)** Keep retrofit-only, but make 14-MS T-030 **catalog-driven** (discover site-scoped tables dynamically)
  instead of a hardcoded 21-table list. (No per-module burden; risk of mis-classifying a table.)
- **(C)** Do nothing now; accept a large, manual, error-prone retrofit at module 14. (Not recommended.)
Also decide who owns `site_id` on `oee_snapshots`: **08-production (producer)**, **14-multi-site (activation)**,
or leave with 15-oee (current, violates owner rule)? (F-5)

**D-2 — module order correction (P0).**
07-MODULE-EXECUTION puts 03-technical before 01-npd; EXECUTION-PLAN puts 01-npd before 03-technical; reality
built 01-npd first and 03-technical is empty. Do you want to: **(A)** reconcile the two docs to the as-built order
(01 before 03) and proceed to 03-technical next (it now unblocks the npd Sensory/factory-spec deferrals), or
**(B)** insert 03-technical as the *next* module before 04-planning (04-planning T-001 hard-depends on
03-tech T-080/T-081, currently ⬜ — see below)? Note: **04-planning cannot fully complete before 03-technical**
because `04-planning-basic/tasks/T-001.json` requires Technical `T-080/T-081` (FactorySpec+BOM approval +
release adapter), both ⬜.

**D-3 — cross-module seam re-verification policy (P1).**
Accept that 08-production's WO-consume-block (needs 09-quality T-064) and the npd allergen materialized read model
(consumed by 03/09) are **expected external gaps**, and require: 08 sign-off explicitly lists the 09-quality
consume-gate as an external gap; 09 and 03 sign-offs include a "re-verify upstream seam" checklist item.
Approve this as standing policy? (Y/N)

**D-4 — D365 mapping authority (P2, unblocks npd Builder + governs 03/10/11).**
Is the D365 field-mapping the responsibility of **(A)** a runtime admin screen (03-technical T-057 "D365 Field
Mapping admin") that becomes the SSOT — in which case the npd Builder deferral is blocked on *module 03*, not a
PRD edit, and should be re-scheduled after 03; or **(B)** a fixed PRD-defined mapping you will author
(QUANTITY/PROCESSTIME/LOADPERCENTAGE/PRODUCTGROUPID_PR …), unblocking npd T-042/044 independently of 03? This one
answer should govern all D365-exporting modules (01/03/10/11), not be re-decided per module.

---

## PROPOSED TASK STUBS (written to `_meta/runs/sidecar/proposed-tasks/`)

| Stub | Owning module | Addresses | Gate |
|---|---|---|---|
| `plan-site-id-policy.md` | 00/14 (policy) | F-1, F-5 | D-1 |
| `plan-sensory-ui.md` | 03-technical | F-3 | — |
| `plan-prod-npd-pilot-wo.md` | 08-production | F-4 | — |
| `plan-oee-snapshot-siteid-owner.md` | 08 or 14 | F-5 | D-1 |

(Stubs are proposals only — not added to any manifest/STATUS; that is the orchestrator's call after the decisions land.)
