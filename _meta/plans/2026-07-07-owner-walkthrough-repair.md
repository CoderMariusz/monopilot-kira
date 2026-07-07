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

## Wave R2 — #11 QA bug (reproduce-first) + gating #9

- R2.1 **#11 "Unable to update output QA"**: reproduce on prod with server logs (Vercel runtime logs);
  prime suspect ruled out (v_active_holds.reference_text EXISTS on live). Candidates: holdsGuard LP-branch
  exception, zod `invalid_input`, org-context. Fix + regression test. (S once reproduced)
- R2.2 **#9 WO-create gate**: `searchFgProducts` additionally requires the NPD product to be RELEASED to
  production — gate on `factory_release_status.release_status='released_to_factory'` OR handoff-stage
  completion (decide in-wave from data; pilot WOs exempt — pilot path creates its own WO and must keep
  working). Server-side gate in createWorkOrderCore too (defense in depth), clear UI message. (M)

## Wave R3 — UoM: meters + explicit output UoM at brief (#4, #10)

- R3.1 **Meters app-wide** (checklist from audit §4): migration (064 category CHECK + seed m/cm + org
  backfill), manage-units zod, UOM_VALUES, CANONICAL_UOMS, wizard labels + i18n, items table. (M)
- R3.2 **Output UoM at brief**: new brief field "Output unit" (kg / pieces / boxes) + `npd_projects` column;
  materialize uses the EXPLICIT choice (fallback to today's inference); `update-project-brief` re-syncs
  net_qty_per_each + output_uom (+ base→each upgrade) when pack weight/output unit change post-handoff —
  closes both failure paths from audit §4. (M-L)
- R3.3 (rider) unify piece-code chaos ea/pcs/szt → one canonical code with display labels (audit found 3
  vocabularies). If too big for the wave: document + defer, do NOT silently skip. (M, stretch)

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
- R4.3 **Materialization**: routing op per process with ITS line (today: one line for all ops); carry
  setup_cost + duration to routing (today dropped); wire per-process consumption into BOM/WIP
  materialization: a process with line+consumption becomes a stage — either (a) auto-WIP per stage
  (creates_wip_item path finally produces BOM WIP lines), or (b) stage-tagged wo_materials. DECISION IN-WAVE
  with evidence; (a) matches the existing chain machinery best.
- R4.4 **Chain wiring**: planning "New WO" uses `createWorkOrderChain` when the FG BOM has WIP lines
  (today: modal NEVER chains — audit §2A); child WOs get per-stage consumption; station view already
  op-aware from P0/P1 closure.
- R4.5 E2E: pizza-style 3-stage product → 3 stage-WOs on 3 lines, each with its own consumption, visible
  per station on scanner. THIS is the acceptance test of the whole wave.

## Wave R5 — Full E2E acceptance run + report

Clean walkthrough on prod: brief (output UoM!) → processes (per-line, per-consumption) → costing (formulas
audit §6) → pilot → handoff → planning WO (gated, chained) → stations → PO. Compare costs by hand.
Owner-facing report of every fix with evidence.

## Sequencing & risks

R1 ∥ R2 (disjoint) → R3 (touches items/wizard — after R1.3/R1.4 merge) → R4 (biggest; schema first,
UI+materialize+chain in sub-waves with cross-review each) → R5. R4 touches materialize-npd-bom +
create-work-order-chain — same files as P0 fixes; rebase discipline + invariance tests on existing
chain/costing suites. Migrations: R3.1, R3.2, R4.1 — all additive; backup + apply-after-deploy as usual.

## Open decisions for the owner (answer before/at GO)
1. **R1.2**: labor-rate edit-in-place (mutates history) vs correction-by-supersede (audit-clean)?
2. **R2.2**: WO-create unlock point — handoff stage complete, or explicit "release to factory" action?
3. **R4.3**: per-stage WOs via auto-WIP items per process (real intermediate stock between stages) vs
   stage-tagged materials on one WO (lighter, no inter-stage stock)? Owner's pizza narrative implies (a).
4. **R3.3**: unify piece codes now or defer?
