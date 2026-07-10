# Wave 13 Codex re-review — fix round 1

Reviewed commit `3867eae1`, the full current implementations and callers, the fix-round summary, and the targeted runnable tests. Bugs 1–3 remain fixed. Bug 5 and the integer-ms accumulation defect are fixed. Bug 4 remains partial because the requested strict BOM-line identity contract was not fully implemented.

## Cross-cutting capacity arithmetic — FIXED

`apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:171-255` now carries `dayUsageMs` through lookup, admission, retry calculation, reservation, and the sequencing run. Reservations add `overlap.overlapMs` directly at `:200`; accumulated bucket state is never converted to hours. The only ms-to-hours conversion is the test-only presentation helper `__dayUsageHoursForTests` at `:372-376`, outside the capacity decision path.

The capacity configuration still originates as hours and is converted once to milliseconds at `:233-235`. That is a limit conversion, not repeated bucket accumulation; for the tested 6-hour capacity it is the exact integer `21,600,000`. No float-hours bucket state or repeated float accumulation remains on the admission path.

`sequence-solver.test.ts:593-612` places 360 one-minute reservations, asserts the first UTC-day bucket equals exactly `21,600,000` ms, then proves the 361st starts at `2026-06-25T00:00:00.000Z` and consumes one minute in the next bucket.

## Bug 4 — PARTIAL / FAIL

Finding:

```text
{severity: high, file: apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:517, claim: The direct find()-by-productId expression was removed, but the behavioral productId fallback remains. When strict bomItemId matching fails, the function filters materials and WIP entries by productId and returns productMatches[0] when each side is unique and the material bomItemId is absent. Therefore a missing bomItemId does not always fail explicitly, contrary to the requested strict identity contract; a single-line chain can still silently link by product. A mismatched non-null bomItemId does reject, and duplicate-product ambiguity rejects. suggested-fix: Delete lines 517-529 and throw a typed missing/mismatched BOM-link error whenever the exact bomItemId lookup at lines 514-515 fails; add a single-product missing-bomItemId negative test as well as retaining the duplicate-product test.}
```

The requested duplicate-product negative test does exist at `create-work-order-chain.test.ts:467-681`: B1 and B2 use the same product, B2 has `bomItemId: null`, and the result exposes typed `planningError: 'wip_material_link_ambiguous'` without inserting B2's dependency. The production `createWorkOrderChain` lets the thrown `WorkOrderChainError` escape `withOrgContext` before mapping it, so this failure rolls back rather than committing the already inserted B1 dependency. However, that test covers only the ambiguous duplicate case and does not prove the broader stated rule that every missing BOM identity fails.

## Bug 5 — FIXED

`apps/web/lib/shared/wall-clock-time.ts:121-136` compares the formatted candidate's hour/minute (and optional second) to parsed requested parts; it no longer compares a formatted string with itself. The exact-candidate helper uses this predicate at `:160-162`, so both the initial candidate set and every minute of the gap probe route through the corrected comparison.

For a nonexistent time, `wallClockToInstant` advances requested wall-clock parts minute-by-minute at `:177-183` until a valid local instant exists. The London `2026-03-29 01:30` test proves advancement to local `02:00` / `01:00Z`. For ambiguous times, valid candidates are sorted by UTC offset ascending at `:185`, choosing the standard-time occurrence; the London `2026-10-25 01:30` test proves `01:30Z`, not the BST occurrence `00:30Z`.

## Regression sweep

- Bug 1 remains fixed: actual predecessor and charged changeover are still tracked per production line via `lastWoByLine`.
- Bug 2 remains fixed: finite-capacity placement still throws `SequenceCapacityInfeasibleError` after bounded exhaustion; there is no unchecked placement return.
- Bug 3 remains fixed: validation and reservation still share half-open UTC-day overlap splitting, including exact-midnight boundaries.
- No float-hours accumulation remains in scheduler capacity bucket state. Board utilization converts exact overlaps to hours only for display/read-back aggregation, not solver admission.
- No `... + 'Z'`, template-literal `Z` append, or equivalent UTC-forcing construction remains in the capacity-block wall-clock conversion path. The unrelated schedule UI's explicit UTC day-label construction is not a capacity-block parser.
- No SQL reserved-keyword alias was introduced by the fix round.

## Verification evidence

Targeted test command:

```text
pnpm --filter web exec vitest run 'lib/shared/wall-clock-time.test.ts' 'app/[locale]/(app)/(modules)/planning/schedule/_lib/board-capacity.test.ts' 'app/[locale]/(app)/(modules)/scheduler/_actions/__tests__/sequence-solver.test.ts' 'app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.test.ts'
```

Raw stdout tail:

```text
 RUN  v4.1.5 /Users/mariuszkrawczyk/Projects/monopilot-worktrees/wave13/apps/web

 Test Files  4 passed (4)
      Tests  39 passed (39)
   Start at  13:27:07
   Duration  213ms (transform 188ms, setup 0ms, import 231ms, tests 50ms, environment 0ms)
```

Tree proof (`git diff --stat origin/main..HEAD -- . ':(exclude)_meta/**'`):

```text
.../planning/schedule/__tests__/schedule.test.tsx  |   1 +
.../planning/schedule/_actions/schedule-board.ts   |  12 +
.../planning/schedule/_lib/board-capacity.test.ts  |  75 +++-
.../(modules)/planning/schedule/_lib/board.ts      |  45 ++-
.../_actions/create-work-order-chain.test.ts       | 440 +++++++++++++++++++++
.../_actions/create-work-order-chain.ts            |  61 ++-
.../_actions/__tests__/sequence-solver.test.ts     | 165 +++++++-
.../scheduler/_actions/sequence-solver.ts          | 129 ++++--
apps/web/lib/shared/wall-clock-time.test.ts        |  25 ++
apps/web/lib/shared/wall-clock-time.ts             | 190 +++++++++
10 files changed, 1098 insertions(+), 45 deletions(-)
```

VERDICT: fail
