# Wave 16 — Implementation Summary

**Branch:** `fix/wave16-formulation-calib`  
**Date:** 2026-07-10  
**Scope:** Bugs N-17, N-41, N-45, N-64 from `_meta/plans/wave-16-spec.md`

**Explicitly EXCLUDED (feature-scope, not this wave):**
- **N-39** — LOTO enforcement on calibration (unbuilt; needs owner decision)
- **N-40** — Calibration e-sign / dual-sign (T-015 follow-up; unbuilt)

---

## Bug 1 (N-17, P1) — formulation "Add version" silently drops persisted business columns

**Root cause:** `create-version.ts` INSERT…SELECT clones only a subset of `formulation_versions` / `formulation_ingredients` columns. Migrations 342, 397, 424, 430, 450 added business fields that were omitted on clone.

**Fix:**
- Version header now clones `processing_overhead_pct` (mig 342) alongside existing batch/yield/price fields.
- Ingredient rows now clone `cost_currency` (397), `substitute_item_id` (424), `wip_definition_id` (430), `npd_wip_process_id` (450).
- `create-version-clone-columns.ts` documents the full required column list for drift detection (not exported from `'use server'`).

**Files:** `apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/create-version.ts`, `create-version-clone-columns.ts`, `__tests__/create-version.test.ts`

**Test:** Unit test asserts both INSERT statements include every column in `VERSION_CLONE_BUSINESS_COLUMNS` / `INGREDIENT_CLONE_BUSINESS_COLUMNS`.

---

## Bug 2 (N-41, P1) — calibration OUT_OF_SPEC treated as success (safety)

**Root cause:** `recordCalibration` only deactivated instruments on `FAIL`. `OUT_OF_SPEC` advanced `next_due_date` by a full interval and emitted `maintenance.calibration.completed`, leaving out-of-tolerance instruments active.

**Fix:**
- `OUT_OF_SPEC` shares failure disposition with `FAIL`: instrument deactivated, `maintenance.calibration.failed` outbox event.
- Failure results set `next_due_date` to the calibration date only (no interval advance) — instrument stays due for follow-up immediately when reactivated.

**Files:** `apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_actions/calibration-actions.ts`, `calibration-actions.test.ts`

**Test:** `OUT_OF_SPEC` deactivates instrument, emits failed outbox, `nextDueDate` is `2026-06-01` not `2026-11-28` (180-day success advance).

---

## Bug 3 (N-45, P2) — formulation deletion orphans nutrition records

**Root cause:** `nutrition_profiles`, `nutrition_allergens`, `nutri_score_results` stored `formulation_version_id` as bare UUID (mig 086) with no FK, while `formulation_versions` CASCADE-delete via formulations (mig 093).

**Fix — migration `481-nutrition-formulation-version-fk-cascade.sql`:**
1. **DELETE orphaned rows first** (all three tables) where `formulation_version_id` no longer exists in `formulation_versions` — **required** or `ADD CONSTRAINT` fails on live DBs with historical orphans.
2. Pre-flight `DO` block raises if any orphans remain (idempotent re-run safety).
3. Add `ON DELETE CASCADE` FKs on all three `formulation_version_id` columns (guarded `IF NOT EXISTS`).

**LOUD:** Deploying without step 1 would fail FK creation on any database that already deleted formulation versions while nutrition rows remained. The migration is additive and dry-run-safe; orphan DELETE is scoped to dangling version IDs only.

**Files:** `packages/db/migrations/481-nutrition-formulation-version-fk-cascade.sql`, `packages/db/__tests__/nutrition-formulation-version-cascade.test.ts`

**Test:** Migration contract test + integration test (when `DATABASE_URL` set) proves deleting a version removes linked nutrition rows.

---

## Bug 4 (N-64, P2) — calibration validation gaps

**Root cause:** `recordCalibration` did not validate instrument active state, allowed future `calibratedAt` (pushing due dates arbitrarily forward), and PASS could not reactivate an instrument deactivated by FAIL (required separate `mnt.asset.edit`).

**Fix:**
- Reject `calibratedAt` in the future (`validation_error`).
- Reject `FAIL` / `OUT_OF_SPEC` on inactive instruments.
- On `PASS` for a previously-deactivated instrument, set `active = true` (reactivation path without extra permission).

**Files:** Same calibration action + test file as Bug 2.

**Tests:** Future date rejected; FAIL on inactive rejected; PASS on inactive reactivates and emits completed outbox.

---

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter web exec vitest run` (create-version + calibration-actions) | PASS (19) |
| `pnpm --filter web exec tsc --noEmit` | clean |
| `pnpm --filter web run build` | `BUILD_EXIT=0` |
| `packages/db` nutrition cascade contract test | PASS (integration skips without `DATABASE_URL`) |

## Fix round 1

**N-17 review gap:** Unit test only substring-checked INSERT…SELECT column names; mocks cannot prove Postgres value carry-over.

**Fix (test-only):** Added `create-version.pg.test.ts` — seeds a source `formulation_version` + ingredient with non-default `processing_overhead_pct` (12.75), `batch_size_kg` / `target_yield_pct` / `target_price_eur`, `cost_currency` (`PLN`), and non-null `substitute_item_id` / `wip_definition_id` / `npd_wip_process_id`; runs real `createFormulationVersion` via `withOrgContext`; asserts cloned header + ingredient values match source and new version is `draft` with `version_number` 2. Skips without `DATABASE_URL` (`const run = process.env.DATABASE_URL ? describe : describe.skip`). Production `create-version.ts` unchanged.
