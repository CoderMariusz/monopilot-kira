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

## Fix round 1

Adversarial review follow-up (Bugs 4/5 + cross-cutting float drift).

### Cross-cutting — integer-ms bucket usage
**Problem:** Per-day capacity buckets stored floating-point hours; 360× one-minute reservations drifted to 5.999… h and admitted a 361st WO.

**Fix:** `dayUsageMs` map stores integer milliseconds end-to-end; `__dayUsageHoursForTests` converts to hours for assertions only.

**Test:** `sequence-solver.test.ts` — 360 one-minute WOs fill a 6 h bucket exactly; the 361st bumps to the next UTC day.

### Bug 4 — ambiguous product-ID fallback removed
**Problem:** `linkDependencies` fell back to `fgMaterials.find(row => row.productId === …)`, silently linking duplicate WIP lines to the first material row when `bomItemId` was missing.

**Fix:** `resolveMaterialForWipEntry` matches strictly by `bomItemId`; legacy product-only match allowed only when both material and WIP chain are provably unique (single row, no `bomItemId`); otherwise throws `wip_material_link_ambiguous`.

**Test:** `create-work-order-chain.test.ts` — two WIP lines same product, B2 material missing `bomItemId` → explicit `{ ok: false, planningError: 'wip_material_link_ambiguous' }`.

### Bug 5 — DST wall-clock validation
**Problem:** `wallClockMatches` compared formatted time to itself, accepting nonexistent spring-forward times (e.g. `2026-03-29 01:30 Europe/London`).

**Fix:** Compare formatted wall time against requested date + hour/minute (and second when present). Spring-gap policy: advance wall-clock minute-by-minute to next valid instant. Fall-back ambiguity: sort candidates by offset ascending → standard (later-offset) occurrence.

**Tests:** `wall-clock-time.test.ts` — spring gap `01:30` → `02:00` local (`01:00Z`); fall-back `01:30` → standard `01:30Z`.

### Gates (fix round)
- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (39 tests): `wall-clock-time`, `board-capacity`, `sequence-solver`, `create-work-order-chain` — green
