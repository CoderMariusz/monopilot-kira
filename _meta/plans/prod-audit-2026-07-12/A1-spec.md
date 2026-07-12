# Wave A1 — Consume & genealogy integrity (P0). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
KEY: withOrgContext COMMITS on any non-throw return — all-or-nothing paths must THROW to roll back. All qty/UoM math in SQL numeric or the Dec helper — NEVER JS float/round. New SQL: non-reserved aliases (must PREPARE on real PG). NEVER export non-async from a 'use server' module (RSC build blocker) — shared helpers go in non-server siblings. Next free migration number = 486 (max on disk 485) — say so LOUDLY if you add one.

Primary file for C1+C2+S6: `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts`.
Also read: `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`, `.../reverse-consume/route.ts`, `apps/web/lib/production/` consume/output helpers, `corrections-actions.ts`.

## C1 (P0) — consume from nonexistent material (zero-UUID LP)
Repro: recorded 2.52 kg WIP consumption with a **zero-UUID LP** (`00000000-...`), no LP row, no stock, yet `fefo_adherence=true` was written.
Root hypothesis: the "consume without selecting an LP" branch (manual/reason-code path) inserts a `wo_consumptions`/stock row with a placeholder/zero lp_id and never validates that a real LP exists with sufficient qty.
FIX: reject any consume whose resolved lp_id is null/zero/absent OR whose LP does not exist for this org/WO material with `SELECT ... FOR UPDATE` and sufficient available qty. No placeholder/zero UUID may ever be persisted. `fefo_adherence` must reflect reality (false/omit when no FEFO LP was chosen), never hardcoded true. Typed error mirroring existing consume errors; NOTHING written on failure.
Test: consume with no existing LP → rejected, zero rows written; `fefo_adherence` never true without a real chosen LP.

## C2 (P0) — hold bypass via "no LP + reason code"
Repro: an LP on QA hold is correctly hidden from FEFO candidates, but the "no LP + reason code" consume option let the user record consumption of that held material; LP qty unchanged → phantom consumption.
Root: same manual/reason-code branch bypasses the hold/QA-status check that the FEFO selection path enforces.
FIX: the reason-code / no-explicit-LP path must resolve the SAME available-inventory + hold/QA filter the FEFO path uses, and decrement a real LP's qty under lock. If no eligible (released, not-held) LP exists, REJECT — never record consumption without a corresponding stock decrement.
Test: material whose only LP is on hold → reason-code consume rejected; no phantom consumption row.

## S6 (P0-adjacent) — dangerous operational rounding
Repro: 2.52 kg → 3, 0.48 kg → **0**, 12.632 pcs → 13 — material silently lost/created by integer rounding.
FIX: grep the consume/output path for any `Math.round`/`toFixed`/`parseInt`/`::int` on quantities; keep quantities as SQL numeric / Dec end-to-end. Rounding, if any, only at DISPLAY, never before persistence, and never to whole units for a kg material. Preserve entered precision.
Test: consuming 2.52 kg persists 2.52 (not 3); 0.48 persists 0.48 (not 0).

## S17 — catch-weight nominal loss
Repro: catch-weight output with nominal 1 kg saved only 0.95 kg, with no `qty_units` and no `catch_weight_details`.
FIX: for catch-weight items the per-unit weights + unit count must persist to `catch_weight_details` and `qty_units`; the recorded qty must be the summed actual weight, and nominal vs actual reconciliation preserved. Do not drop the detail rows. (Reuse existing catch-weight helpers — grep, don't duplicate; see prior wave-8 catch-weight work.)
Test: 1 unit nominal 1 kg actual 0.95 persists qty_units=1, catch_weight_details row, and the variance is derivable.

## C5 (P0) — deletable production-chain history
Repro: after the parent FG WO completed, the UI allowed deleting its child WIP WO; the delete removed the `wo_dependencies` row → genealogy destroyed.
Files: `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/` (delete action) + `create-work-order-chain.ts`.
FIX: block deletion of any WO that (a) is referenced by a `wo_dependencies` row (as parent OR child) whose counterpart is not itself cancelled, or (b) is part of a chain where any linked WO has progressed beyond draft (started/completed) or produced outputs. Return a typed "cannot delete — part of active/complete production chain" error. Cancellation (state=cancelled, preserving history) is the allowed path, not hard delete.
Test: completing a FG then attempting to delete its WIP child → rejected, `wo_dependencies` intact.

## Requirements
- Read every touched file FULLY; grep all callers (server action + scanner route may share a lib — fix at the shared choke point, not per-caller).
- Tests per bug (existing __tests__ patterns; `.ts` default vitest, `.tsx` under `--config vitest.ui.config.ts`). DB-faithful where the bug is a persistence bug. Integration tests skip cleanly without DATABASE_URL.
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green. Run FULL `pnpm --filter web run build` if you add/move any 'use server' export.
- Summary per bug → `_meta/plans/prod-audit-2026-07-12/A1-summary.md` with root cause, exact diff locations, and the reproduction each test pins.
