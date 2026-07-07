# REPAIR PLAN — owner walkthrough findings #1–#12 (+ process-model rebuild)

**Date:** 2026-07-07 · **Basis:** `_meta/audits/2026-07-07-as-built-production-model.md` (file:line evidence).
**Session budget:** ~8h autonomous orchestration after owner GO.
**Method:** same engine flow as P0/P1 closure — git-worktree per track, Composer-2.5 impl → Codex review →
arbitrate → fix → tsc 0 + targeted vitest → serialized rebase+merge → deploy → browser E2E on prod per wave.
Migrations authored in-wave, applied manually with backup; deploy-order respected. NO silent shortcuts;
every gate reported honestly.

---

## Wave R1 — Quick UX + display truth (parallel S/M items, 1 engine batch)

| # | Finding | Fix | Effort |
|---|---|---|---|
| R1.1 | #1 lines not editable | Edit affordance on lines screen reusing `upsertLine` (already supports id-update, line.ts:50-88): row Edit → prefilled dialog | S-M |
| R1.2 | #2 labor rates not editable | Add per-row "Correct" flow: EDIT-IN-PLACE for same effective_from (typo fix) + keep append-for-new-date. (If owner prefers pure append: duplicate-with-correction shortcut.) | M |
| R1.3 | #3 shelf-life tickbox | "Has shelf life" checkbox in wizard step 3; unchecked → disable+clear shelfLifeDays+mode (already nullable end-to-end) | S |
| R1.4 | #6 edit-item modal mirrored vs create | Align edit-modal field order/layout with the create wizard steps (locate both, unify) | M |
| R1.5 | #5 pricing clarity | Item Overview "Commercial" card: ADD "Supplier price (buy)" row reading the active supplier_specs.unit_price; relabel rows (Sell price / Standard cost / Effective cost w/ source); make spec-insert failure at create LOUD (currently savepoint+warn-only silently drops the buy price) | M |
| R1.6 | #7 residual | Better `already_exists` UX: error names the existing item + link; (root F5 double-call already fixed 2026-07-01) | S |
| R1.7 | #12a total yield | Overview shows compound yield Π(process yield_pct) — reuse `compoundedYieldPctForComponent` math | S |
| R1.8 | #8 prefill bug | `handlePick` + wip-process-chain-editor: copy yield_pct/throughput_per_hour/throughput_uom/setup_cost from process defaults (payload already carries them; today hardcoded 100/0/'kg'/0) | S |

## Wave R2 — #11 QA bug (reproduce-first) + gating #9 + release-to-factory lifecycle

- R2.1 **#11 "Unable to update output QA"**: reproduce on prod with server logs (Vercel runtime logs);
  prime suspect ruled out (v_active_holds.reference_text EXISTS on live). Candidates: holdsGuard LP-branch
  exception, zod `invalid_input`, org-context. Fix + regression test. (S once reproduced)
- R2.2 **#9 WO-create gate — OWNER DECIDED: explicit "Release to factory"; only PILOT WOs may exist
  earlier.** This dovetails with audit findings NN-TEC-1/2 (factory-spec lifecycle is unwired:
  `released_to_factory` is NEVER written; `recallFactorySpec` permanently unreachable) — so build the
  real mechanism, not a hack: (a) an explicit "Release to factory" action on the NPD handoff stage that
  writes `factory_release_status.release_status='released_to_factory'` (and fixes the spec lifecycle so
  recall becomes reachable — NN-TEC-1); (b) `searchFgProducts` + `createWorkOrderCore` (defense in depth)
  require released status; (c) pilot WO path exempt and untouched; (d) clear UI message on gated items. (M-L)

## Wave R3 — UoM: meters + explicit output UoM at brief (#4, #10)

- R3.1 **Meters app-wide** (checklist from audit §4): migration (064 category CHECK + seed m/cm + org
  backfill), manage-units zod, UOM_VALUES, CANONICAL_UOMS, wizard labels + i18n, items table. (M)
- R3.2 **Output UoM at brief**: new brief field "Output unit" (kg / pieces / boxes) + `npd_projects` column;
  materialize uses the EXPLICIT choice (fallback to today's inference); `update-project-brief` re-syncs
  net_qty_per_each + output_uom (+ base→each upgrade) when pack weight/output unit change post-handoff —
  closes both failure paths from audit §4. (M-L)
- R3.3 **OWNER DECIDED: MANDATORY NOW** — unify piece-code chaos ea/pcs/szt → ONE canonical code
  ("they are one and the same"): pick `pcs` as canonical (EN-neutral), migrate items.uom_base values
  (`szt`→`pcs`) + unit_of_measure seed (`ea`→`pcs`) + UOM_VALUES + CANONICAL_UOMS + labels showing
  localized display ("pcs (each)" / "szt"); data migration for existing rows + inventory/uom equality
  matches (scanner movement matches on uom string equality — migrate stored strings consistently). (M-L)

## Wave R4 — THE CORE: per-process line + consumption model (#8, #12b) — LARGE

Target (owner's vision): **add process → pick line → pick consumed ingredients → repeat; packaging is a
process too; WO fans out per stage with the right components.**

- R4.1 **Schema**: `npd_wip_processes.line_id uuid null REFERENCES production_lines` +
  `formulation_ingredients.npd_wip_process_id uuid null` (ingredient→process assignment; nullable =
  backward compatible, unassigned behaves like today). Migration + drizzle mirrors.
- R4.2 **Production-tab UI rebuild**: per-process card = line picker + consumption picker (multi-select
  from the formulation's ingredients w/ qty share) + prefabbed throughput/yield/setup (R1.8). Remove/retire
  the legacy noise: project-level single line picker becomes default-only; hide Dieset/free-text
  Staffing/Closed_Production from the production grid (they duplicate the real model — audit §1).
  Packaging stage: allow attaching a process (staffing/line-load) to packaging.
- R4.3 **Materialization — OWNER DECIDED: option (a), separate stage-WOs via WIP items** (real
  inter-stage stock; matches existing chain machinery). Routing op per process with ITS line (today: one
  line for all ops); carry setup_cost + duration to routing (today dropped); a process with
  line+consumption becomes a stage: creates_wip_item path finally produces BOM WIP lines, stage's
  consumption = its assigned ingredients.
- R4.4 **Chain wiring + OVERLAPPING STAGES (hard requirement)**: planning "New WO" uses
  `createWorkOrderChain` when the FG BOM has WIP lines (today: modal NEVER chains — audit §2A); child WOs
  get per-stage consumption. **Stages MUST overlap:** a long run does not wait for the upstream stage to
  COMPLETE — the downstream WO can START as soon as SOME upstream WIP output exists (stock/LP-based
  availability, NOT status-based gating). Owner's scenario (acceptance): 6000 pizzas; dough WO starts
  06:00; first 100 kg WIP LP registered 07:00 → pizza WO starts 07:00 consuming that 100 kg while dough
  keeps producing. Verify `wo_dependencies` imposes no complete-before-start rule (deps are
  material_link+required_qty; consumption is LP/stock-based — confirm and test, remove any status gate
  found). Station view already op-aware from P0/P1 closure.
- R4.5 E2E: pizza-style 3-stage product → 3 stage-WOs on 3 lines, each with its own consumption, visible
  per station on scanner, **including the partial-overlap scenario above** (start downstream on first
  upstream LP). THIS is the acceptance test of the whole wave.

## Wave R5 — Full E2E acceptance run + report

Clean walkthrough on prod: brief (output UoM!) → processes (per-line, per-consumption) → costing (formulas
audit §6) → pilot → handoff → planning WO (gated, chained) → stations → PO. Compare costs by hand.
Owner-facing report of every fix with evidence.

## Sequencing & risks

R1 ∥ R2 (disjoint) → R3 (touches items/wizard — after R1.3/R1.4 merge) → R4 (biggest; schema first,
UI+materialize+chain in sub-waves with cross-review each) → R5. R4 touches materialize-npd-bom +
create-work-order-chain — same files as P0 fixes; rebase discipline + invariance tests on existing
chain/costing suites. Migrations: R3.1, R3.2, R4.1 — all additive; backup + apply-after-deploy as usual.

## Owner decisions (LOCKED 2026-07-07)
1. **R1.2**: correction-by-SUPERSEDE (audit-clean; no in-place mutation of rate history).
2. **R2.2**: explicit **"Release to factory"** action unlocks WO creation; ONLY pilot WOs may exist earlier.
3. **R4.3**: option (a) — separate stage-WOs via WIP items (real inter-stage stock), WITH the hard
   overlapping-stages requirement (downstream starts on first partial upstream output — see R4.4).
4. **R3.3**: piece-code unification (ea/pcs/szt → pcs) is MANDATORY NOW, in this wave.

---

# CONTINUATION after R1–R5: fleet-audit P2/P3 + roadmap Phases 4/5 (owner directive 2026-07-07)

When R1–R5 are merged + E2E-verified, proceed WITHOUT further GO into these, same engine flow:

## Wave C1 — P2 net-new correctness (fleet-audit §3 P2, still open after P0/P1 closure)
- NN-TEC-1 recallFactorySpec unreachable (partially addressed by R2.2's release action — finish recall path).
- NN-TEC-2 factory-spec lifecycle unwired past in_review (approve/release actions; R2.2 lays the base).
- NN-TEC-3 ECO change orders decorative — implement apply-on-implement (version/clone the referenced BOM/spec).
- NN-TEC-4 createActiveNpdBom diverges from canonical publishBom (no cycle/RM re-validation, no supersede,
  no outbox) — route through publishBom or replicate its guards.
- NN-TEC-5 hardcoded npd_manager allergen bypass (accept-declaration.ts:157) — replace with role_permissions.
- NN-PLAN-4 MRP nets NO sales-order demand — add confirmed-SO demand to netting.
- NN-SET-4 enforced-permissions.ts hand-maintained array — add CI drift guard.
- (NN-SET-3 per-customer pricing stub — goes with Phase 5 invoicing, see C4.)

## Wave C2 — Phase-0/1 leftovers that owner-block production trust
- 0.3 recall forward-trace + mass-balance (the #1 compliance build).
- 0.4 CCP-deviation resolve; 0.5 hold release e-sign (warehouse LP).
- 1.1 NPD promote-to-production revert wedge (NPD_RELEASE_LOCKED, no revert).
- 1.9 partial-commit sweep (registerDisassemblyOutput family) + ESLint guard.

## Wave C3 — roadmap Phase 4: screen wire-ups + operator loops
- 4.4 PM→MWO detail loop (bridge built in P0/P1 OPS track — finish the UI loop + daily cron generation).
- Remaining Phase-4 screen wire-ups per `2026-07-02-ROADMAP-master.md` items (verify each against HEAD —
  several may be partially done by the last two days of waves; re-audit before building).

## Wave C4 — roadmap Phase 5: big rocks (as much as the session allows, in this order)
- 5.2 scheduler/APS repair completion (P0/P1 fixed changeover/duration/config basics; finish
  finite-capacity day bucketing + PM windows — documented limitation from PLAN track).
- 5.1 time-phased MRP (with the C1 SO-demand netting as base).
- 5.3 finance backbone (mig-199 tables) + 5.11 invoicing/AR + NN-SET-3 per-customer pricing.

## Continuation guardrails
Same as R-waves: worktree per track, Composer impl → Codex review → arbitrate → fix → tsc 0 → targeted
tests → merge → deploy → browser E2E of the affected flow per wave; migrations authored then applied
manually with backup; honest gate reporting; priority order C1→C2→C3→C4 if time runs short.
