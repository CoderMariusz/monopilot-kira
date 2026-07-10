# Wave 13 — Scheduler & MRP correctness summary

## Bug 1 (P1) — Cross-line changeover
**Problem:** Global WO sequence used `sequence[index - 1]` as the changeover predecessor, so a WO on Line 2 inherited allergen cleanup from a Line 1 job that never ran there.

**Fix:** Track `lastWoByLine` during time-phasing; compute `changeoverBetween` only against the same-line tail.

**Test:** `sequence-solver.test.ts` — two lines with a segregating global order: Line B second WO gets `nuts→soy` (15 min), not `milk→soy`; same-line pair still gets 20 min gap.

## Bug 2 (P1) — WO longer than daily capacity bypass
**Problem:** Whole run duration was checked against one day's bucket; oversized runs looped 400× then fell through to unchecked `earliestMs`.

**Fix:** `canReserveCapacity` / `reserveCapacity` validate per-day overlaps; retry advances via `nextCapacityRetryStart`; exhausted search throws `SequenceCapacityInfeasibleError`.

**Test:** 8 h WO on 6 h/day line schedules at `18:00Z` (6 h + 2 h split); 400 fully-booked days throw `SequenceCapacityInfeasibleError`.

## Bug 3 (P1) — Cross-midnight capacity on start day only
**Problem:** Solver recorded full duration in the start-day bucket; board reporting already split at UTC midnight.

**Fix:** Reuse shared `utcDayOverlapsForInterval` / `overlapMsWithUtcDay` from `board.ts` in `resolvePlannedStart`.

**Test:** `__resolvePlannedStartForTests` — 4 h at `23:00Z` reserves 1 h on `2026-06-24` and 3 h on `2026-06-25`; `board-capacity.test.ts` — utilization split matches.

## Bug 4 (P1) — Duplicate WIP BOM lines share first material row
**Problem:** `linkDependencies` used `fgMaterials.find(row => row.productId === wip.productId)`, collapsing two BOM lines for the same WIP item.

**Fix:** Thread `bomLineId` from each WIP BOM line through `WipChainEntry`; match `row.bomItemId === wipEntry.bomLineId` (productId fallback retained for legacy rows).

**Test:** `create-work-order-chain.test.ts` — two WIP lines same `item_id` produce distinct `material_link` + `required_qty` (300 vs 700).

## Bug 5 (P2) — Capacity blocks forced to UTC
**Problem:** `capacityBlockInterval` appended `Z`, ignoring site IANA timezone → BST blocks shifted +1 h.

**Fix:** New `wallClockToInstant` (`lib/shared/wall-clock-time.ts`, Intl-only); `getScheduleBoard` loads `sites.timezone`; `capacityBlockInterval(block, siteTimezone)`.

**Test:** `wall-clock-time.test.ts` + `board-capacity.test.ts` — `09:00 Europe/London` → `08:00Z` (Jul BST), `09:00Z` (Jan GMT).

## Gates
- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (35 tests): `wall-clock-time`, `board-capacity`, `sequence-solver`, `create-work-order-chain` — green
