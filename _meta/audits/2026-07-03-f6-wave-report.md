# Wave F6 — NPD-materials + planning integration — wave report

Date: 2026-07-03 (overnight, ~01:20–04:40) · Orchestrator: Fable · Charter: `_meta/plans/2026-07-02-npd-rebuild-wave-plan.md` §5 F6
Result: **COMPLETE, deployed READY (`j43u1thpw`), live-E3 spot-checked.** main `4e27832b`. Migs **423, 424** live (re-entrancy-reviewed pre-apply; deploy runner re-ran clean). Next free mig = **425**.

## Lanes

| Lane | Engine | Delivered |
|---|---|---|
| M1 | Codex | Recipe cascade tree (D15): `load-recipe-cascade` (sub-recipe detection via locked/active formulation of the ingredient's item, cost from canonical `v_item_effective_cost`, nutrition from RawMaterials), depth-3 + cycle guard, lazy expandable read-only sub-rows in the ingredients table |
| M2 | Codex (REGULATORY, **Opus review SHIP-WITH-FIXES → applied**) | Component substitutes (D17): mig 424 `substitute_item_id` on formulation_ingredients + bom_lines; declaration picker with **fail-closed allergen guard** (item_allergen_profiles — substitute may not ADD allergens vs primary); handover carries the column; consume acceptance **scoped to the declaring BOM line** across desktop + scanner + both reverse paths; ALL gates unchanged (T-064 holdsGuard, qa_status, site); genealogy/ledger record the ACTUAL consumed item |
| M3 | Codex (backend) + Composer (UI) + orchestrator repair | Trial→planning capacity block (D8/D18): mig 423 `planning_capacity_blocks` (FORCE RLS, `app.current_org_id()`, unique org+trial → upsert), planning-owned `upsertCapacityBlock`, board window render, trial-stage "Book line time" modal (line/date/start/end, re-book, loud errors) |
| M4 | Composer | Pilot WO (D9): `WO-pilot-{FG####}` via canonical planning `createWorkOrder` + post-create rename, idempotent (private_jsonb link + wo_number lookup), closeout evidence via `npd_project_pilot_wo_id`, WO link on the Pilot screen |

## Incidents (both handled)
1. **Codex bridge deaths (recurring class):** BOTH M2 and M3 bridge subagents backgrounded their codex child (despite explicit blocking instruction) and exited; children died mid-run (M2 at test-updates stage, M3 mid-UI). Salvage: verify-by-tree — M2's owned files were complete (109/109 tests, tsc clean after my 2-import fix in M3's half-written file); M3's missing UI finished by a Composer lane. **Rule-6 hardening needed: the codex-rescue agent definition still prefers backgrounding — fix the agent def, not just briefs.**
2. Opus found the one collateral break M2's death left: `materialize-npd-bom.test.ts:149` positional param assert (quantity idx 4→5 after substitute column insert) — fixed, green.

## Opus REGULATORY verdict (M2)
All six adversarial traces PASS: no gate bypass for substitute LPs (identical `assertLpConsumableForProduction` + holdsGuard chokepoint); allergen guard fail-closed on the canonical source with NO alternate write path; acceptance bound to `wm.bom_item_id` (a substitute declared on line A cannot serve line B); CORR-1 dup-component reverse scoping intact (keyed by `ext_jsonb.materialId`); mig 424 re-entrant, grants inherited; genealogy actual-item. LOW notes: allergen guard treats a profile-less item as allergen-free (pre-existing SSOT property, symmetric with primary); handover copies substitutes from the LOCKED formulation snapshot (no TOCTOU).

## Gate evidence
tsc 0 · build GREEN · M1 loader 3/3 + cascade RTL 1/1 · M2 owned suites 109/109 + materialize fix · M3 schedule-board 20/20 + trial-screen 24/24 · pilot action 3/3 · changeover 5 reds proven PRE-EXISTING via clean-tree stash run (zero intersection with wave).

## Live-E3 spot-check (production, PL)
Trial stage: „Czas na linii" column + booking modal → **booked LINE01 2026-07-04 08:00–10:00 → row CONFIRMED in `planning_capacity_blocks` → test block deleted**. Pilot stage: „Utwórz zlecenie pilotażowe" section+button live (server contract unit-proven; not clicked to avoid minting a prod WO). Costing-nutrition + redirects re-verified in F5's walk. Cascade tree: no processed-component recipe exists in prod data to expand (loader unit-tested; UI verified in RTL).

## Follow-ups (carry to F7)
1. `createWorkOrderCore`: add optional documentNumber override → drop M4's cross-owner `wo_number` rename (burns 1 sequence slot per pilot WO).
2. Thread M1's hardcoded EN cascade labels through `npd.formulationEditor.cascade*` keys (keys already in all 4 locales).
3. Trial booking needs `npd.planning.write` in addition to `npd.trial.write` — confirm role bundles for technologists.
4. F5 escapes list (report §Escapes) still open: StageDeptSections label threading, dup soft-block list, „Opis wstępny" vs „Brief", launch_alerts legacy view, empty ingredient-library dead-end.
5. Allergen-profile completeness guarantee (profile-less item = allergen-free in guards) — owner decision candidate.
6. codex-rescue agent definition: remove the background-preference line (bridge-death class hit 2× this wave).

## NPD rebuild status after F5+F6
All owner decisions D1-D18 implemented end-to-end. F7 = ex-backlog (WAC integrity, real-DB gate infra, 28 B-gaps, rule-13 ESLint) + the follow-ups above.
