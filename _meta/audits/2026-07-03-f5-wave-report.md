# Wave F5 — NPD-core rebuild — wave report

Date: 2026-07-03 (overnight run ~00:30–01:20) · Orchestrator: Fable · Charter: `_meta/plans/2026-07-02-npd-rebuild-wave-plan.md`
Result: **COMPLETE, deployed READY, live-E3 verified.** main `08a475c6` → deploy `mny9g8q7r`. Migs **421, 422** live (applied via MCP + re-run cleanly by the Vercel runner after the re-entrancy fix).

## Lanes (8 + 2 fix lanes)

| Lane | Engine | Delivered |
|---|---|---|
| N1 | Codex | mig 421: `npd_departments.stage_code` (+backfill from assignment-level mode), HARD delete cascades (`npd_delete_department/field`, SECURITY INVOKER, value scrub on fg_npd_ext, gate-dep cleanup), drop phantom `npd_department_field.stage_code`, grants, seed fn update |
| N2 | Composer | Settings npd-fields: dept-level stage picker, stage-grouped dept table, reactive refresh, type-to-confirm cascade delete dialogs, `cannot_delete_core` inline |
| N3 | Codex | Stage-section engine: stage-filtered loader + `getStageRequiredFieldsStatus`, `<StageDeptSections>` (save via existing `updateFaCell`), wired on brief/packaging/trial/sensory/pilot |
| N4 | Codex (REGULATORY, **Opus review: SHIP-WITH-FIXES → applied**) | ONE stage-gate: required-fields (soft) + auto checks + e-sign (hard); D16 soft override-with-note audited (`npd.stage.gate_overridden` in-txn); ESIGN_REQUIRED surfaced (BREAK#3); `done_mrp` dual-path collapsed; `checkCostingNutritionReady` fail-closed |
| N5 | Composer | Merged **Costing+Nutrition** stage (route `costing-nutrition`, dot #4, kanban column, old /costing /nutrition redirect); D10 negative-margin save UNBLOCKED with amber warning (root cause: default 20% target vs cost > implied revenue → hard-fail gate) |
| N6 | Composer | FG dashboard rebuilt (active depts, stage-grouped, catalog-derived completeness, read-only + stage links); FG-detail edit retired (read-only + "edit on stage" hints); close-dept moved onto stage sections; WIP editor relocated to Recipe stage (D14) |
| N7 | Composer | Projects-table NPD-xxx link (D6); wizard auto-creates formulation v1 (BREAK#1); submit-to-trial enabled after version lock, seeds trial draft, no stage jump (D7/BREAK#2) |
| N8 | kira-mechanical | closeSection label threaded through i18n on 6 stage pages; tree-grep proof: 0 `stage_code`/`done_mrp` leftovers |
| fix | kira-easy ×2 | D4 test contract (613 green); Opus-mandated e-sign non-override tests (17 server) + modal RTL (20); 8 stale RTL files updated to F5 contracts |

Spine (orchestrator): mig 422 + STAGE_ORDER/G3/GATE_BY_STAGE insertion of `costing_nutrition` (avoided N4×N5 file collision).

## Gate evidence
tsc 0 · build GREEN ×3 · NPD server tests 112/113 (1 pre-existing red: `search-items.unit.test.ts` supplier_specs drift — NOT wave) · RTL 3434/3450 (16 red pre-existing, zero intersection with wave files — proven by diff-intersect) · Opus REGULATORY verdict: no bypass (override cannot skip e-sign/hard blockers), audit atomic in-txn, RLS clean, launch reachable post-done_mrp collapse.

## Deploy incident (fixed forward)
First deploy ERROR: mig 421 was not re-entrant — backfill read `npd_department_field.stage_code` which the same file drops; the Vercel runner (own checksum ledger) re-runs MCP-pre-applied migrations. Fix `08a475c6`: backfill wrapped in column-existence guard + dynamic EXECUTE; re-run simulated live (RERUN_OK) before push. **Rule for future waves: any MCP-pre-applied migration must be fully re-entrant INCLUDING DML that reads columns the migration itself drops.**

## Live-E3 (production, PL locale)
Verified: kanban 10 columns w/ „Koszt i żywienie" · wizard → project NPD-018 + auto formulation v1 draft · brief renders Core catalog section (read-only pre-FG, notice) · advance w/ missing required → SOFT_GATE_BLOCKED lists `Core: Product Name/Pack Size/Recipe Components`, override disabled until note, override advances + **audit_log row confirmed in DB** · manual checklist advisory-only · costing-nutrition merged page renders both panels; `/costing` redirects · Settings: stage-grouped depts, hard-delete UX, updated catalog copy · FG dashboard dynamic + catalog-derived alerts + project links · FG0002 renders post-retirement · cleanup: E2E-F5-SPINE + E2E-NPD-WALK1(NPD-017) + FG0004 deleted (0 leftover projects).

## Escapes / follow-ups (small)
1. EN-on-PL: `StageDeptSections` noFgLinked/readOnly chip labels not threaded per-page (keys exist in pl.json) — mechanical follow-up.
2. Advance modal renders the soft-block missing list twice (duplicate alert block).
3. Settings stage-group header says „Opis wstępny" while pipeline says „Brief" — unify.
4. `launch_alerts` still reads legacy `missing_required_cols` view (N6 decoupled per-dept table only).
5. Pre-existing: empty ingredient-library dead-end on recipe add-ingredient (07-01 F6 finding, untouched).
6. Pre-existing red tests: search-items supplier_specs + 16 RTL files (catalog known).
7. D16 Settings per-stage hardness toggle: DEFERRED by owner ruling.

## Next: F6 (charter §5) — M1 cascade tree, M2 component substitutes (REGULATORY), M3 trial→planning capacity block, M4 pilot WO mask. F7 = ex-backlog.
