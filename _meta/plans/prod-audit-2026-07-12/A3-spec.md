# Wave A3 — WO creation & scheduling + production-summary display (P1). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
DISCIPLINE (hard-learned): every NEW raw SQL must PREPARE on real Postgres — verify column names against migrations, NO reserved bare aliases. withOrgContext COMMITS unless you THROW. NEVER export a non-async binding from a 'use server' module (RSC build blocker) — shared types/helpers go in a non-server sibling. All qty/UoM math SQL numeric/Dec; DISPLAY rounding only at render, never before persistence and never integer-round a kg mass. Next free migration = 486 (max 485) — say so LOUDLY if used.

Files: `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/*`, `_components/create-wo-modal.tsx`, `page.tsx`, `apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts`, production-summary display component (grep the WO detail summary that renders "N / M kg").

## S1 (P1) — WO create ignores selected line; assigns cross-site line
Create WO with a chosen line (or None) can attach a line from ANOTHER site to a warehouse-1 WO. Root: create action doesn't validate the production_line_id belongs to the WO's site/warehouse, and may auto-assign an arbitrary line. FIX: validate the selected line belongs to the WO's site; if None selected, persist NULL (don't auto-pick a cross-site line); reject a line whose site ≠ WO site with a typed error. Test: creating with a cross-site line is rejected; None stays NULL.

## S2 (P1) — planned/scheduled date disappears on create AND edit
The scheduled_start entered in the modal is dropped on both create and edit. Root: field not wired into the action payload / not persisted / not reloaded on edit. FIX: thread scheduled_start through create + edit + detail reload. Test: create with a date persists it; edit preserves/updates it.

## S3 (P1) — qty_entered / qty_entered_uom empty despite box entry
Entering qty in `box` UoM leaves qty_entered/qty_entered_uom NULL (only base qty stored). FIX: persist the entered qty + its UoM alongside the normalized base qty (retain both, like receiving does). Test: entering 100 box persists qty_entered=100, qty_entered_uom='box'.

## S4 (P2) — WO list & detail don't refresh after create/edit/delete
Mutations don't refresh the list/detail (stale UI until full reload). FIX: revalidate the correct paths (revalidatePath/router.refresh) after create/edit/delete/release. Test/assert the revalidate call fires for the touched routes.

## S9 (P1) — scheduler includes draft non-releasable WOs + cross-site lines despite site filter
sequence-solver pulls WOs/lines outside the requested site and includes DRAFT/unreleasable WOs. FIX: filter the solver input to the requested site's lines and to schedulable statuses only. (Overlaps prior wave-13 — confirm the prod repro is a real gap and fix at the query/input boundary.) Test: a cross-site line and a draft WO are excluded from the solve.

## S10 (P1) — applying schedule ends in sod_violation invisible in UI
Apply-schedule returns a sod_violation (segregation-of-duties) that the UI never shows. FIX: surface the typed sod_violation to the user with an actionable message. Test: an apply that violates SoD shows a user-visible error, not a silent no-op.

## N1 (P1) — production-summary display rounding (7.800 kg shown as 8 kg)
The WO production summary renders a kg mass integer-rounded (DB 7.800 → screen "8 / 300 kg"); the percentage is correct. FIX: the summary formatter must render the real numeric precision (e.g. 7.8 / 300 kg), display-only, never integer-round a kg quantity. Grep the summary component for the qty formatter. Test/assert 7.8 renders as "7.8", not "8".

## Requirements
- Read touched files FULLY; grep callers; fix at shared choke points (UI action + API route).
- Tests per finding (existing __tests__; `.ts` vitest, `.tsx` under vitest.ui.config.ts). Any new SQL must PREPARE on real PG.
- Gates: tsc --noEmit clean + touched vitest green; FULL build if any 'use server' export shape changes.
- Summary → `_meta/plans/prod-audit-2026-07-12/A3-summary.md` (root cause + diff + repro per finding). Do NOT git add -A, no commit.
