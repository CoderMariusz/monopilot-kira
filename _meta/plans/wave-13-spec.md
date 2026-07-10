# Wave 13 — Scheduler & MRP correctness (from 2026-07-10 hunt, h5)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
These are scheduling ALGORITHM bugs — add tests that pin the exact numeric/temporal behavior. No float-money here but time math must be exact (ms/minute buckets).

## Bug 1 (P1) — changeovers calculated between WOs on DIFFERENT production lines
`scheduler/_actions/sequence-solver.ts:258` builds ONE GLOBAL WO sequence; :277 takes the preceding item in that global sequence as `previous`; :281 computes a changeover from it WITHOUT checking both WOs use the same line; :286 adds that changeover to the destination line's start; :291 includes it in cumulative changeover cost.
Failure: WO-A on Line 1 globally precedes WO-B on Line 2 → Line 2 charged an allergen cleanup from a job that never ran there, and the real preceding job on Line 2 is ignored → wrong start times + changeover.
FIX: derive `previous` from a PER-LINE tail (the last WO already scheduled on the SAME line) and compute changeover only against that same-line predecessor. Sequence each line's changeover independently. Add a test: two WOs on different lines incur NO cross-line changeover; two on the same line do.

## Bug 2 (P1) — a WO longer than daily capacity silently bypasses capacity enforcement
`sequence-solver.ts:183` checks the ENTIRE run duration against ONE day's remaining capacity; :187 pushes the WO to the next day whenever duration > daily capacity; :172 loops only 400×; :200 returns the original `earliestMs` after exhausting the guard — WITHOUT reserving capacity or erroring.
Failure: an 8h WO with 6h daily capacity never passes → after 400 iterations it's scheduled at the original time, potentially over other work, capacity NOT recorded.
FIX: define an explicit multi-day policy — either SPLIT the WO's load across consecutive daily buckets (reserve the overlap in each, spanning as many days as needed) OR REJECT the run as infeasible with a typed error (never fall back to an unchecked start). Prefer split-across-buckets if the board model supports multi-day bars; else reject. Remove the silent 400-iter fallthrough. Add a test: an 8h WO on a 6h/day line either splits across 2 days (reserving 6h+2h) or returns infeasible — never schedules unchecked.

## Bug 3 (P1) — cross-midnight WOs consume capacity only from their starting day
`sequence-solver.ts:184` chooses ONE capacity bucket from the proposed start; :187 compares the whole duration to that one bucket; :193 records the whole duration in the start-day bucket. The board's REPORTING (`planning/schedule/_lib/board.ts:210`) correctly splits intervals at UTC day boundaries — the solver does not.
Failure: a 4h WO starting 23:00 is charged 4h on day one, 0h on day two → later jobs use full day-two capacity though the line is busy until 03:00 → solver capacity disagrees with displayed utilization.
FIX: intersect each WO interval with EVERY affected capacity-day bucket (reuse the board.ts:210 day-boundary-split logic — extract a shared helper if clean), validating AND reserving the overlap in each bucket. Add a test: a 4h WO at 23:00 reserves 1h on day one and 3h on day two.

## Bug 4 (P1) — repeated WIP components link dependencies to the first matching material row
`planning/work-orders/_actions/create-work-order-chain.ts:211` creates a distinct child WO per WIP BOM line; :213 computes each line's required qty independently; but :504-505 later re-identifies the FG material only by `productId` via `find()`; :518 persists that ambiguous material id + qty into the dependency.
Failure: an FG BOM with the SAME WIP item on two lines (different qty/scrap) → two child WOs, but both dependencies point to the FIRST matching wo_materials row and carry ITS qty → stage genealogy + readiness wrong for the second WO.
FIX: retain the BOM-line / material identity when creating each child and link the dependency by `bom_item_id` / BOM line id (not productId alone). Thread the line identity through :211→:504. Add a test: an FG BOM with the same WIP item on two lines produces two dependencies each carrying its OWN material row + qty.

## Bug 5 (P2) — capacity-block wall-clock times always interpreted as UTC (DST drift)
Capacity reservations store separate `date` + tz-free `time` (`423-planning-capacity-blocks.sql:12`). `board.ts:122` builds an instant by appending `Z` → :123-124 force every block into UTC without the site timezone. A 09:00-11:00 Europe/London reservation renders 10:00-12:00 local during BST; the offset shifts across DST → seasonal conflicts with timestamptz WO bars.
FIX: interpret capacity-block wall times in the SITE's IANA timezone and convert to instants server-side (use the existing tz/site-timezone helper if one exists — grep; the app already handles site tz somewhere). Handle nonexistent/duplicated DST wall times explicitly (pick the standard resolution). Add a test: a 09:00 London block in BST maps to 08:00Z, in GMT to 09:00Z.

## Requirements
- Read every touched file fully; grep callers; reuse existing time/tz + day-bucket helpers (board.ts:210 for day split, and whatever handles site timezone) — do NOT duplicate.
- Tests per bug pinning exact numeric/temporal behavior (existing __tests__ patterns). `.ts` default vitest, `.tsx` under `--config vitest.ui.config.ts`.
- NO new dependencies (no new date lib — use what's installed; the repo likely has a tz utility). Avoid migrations unless strictly required (next free number 477+; say so LOUDLY). Any new SQL PREPAREs on real PG.
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green.
- Summary per bug → `_meta/plans/wave-13-summary.md`.
