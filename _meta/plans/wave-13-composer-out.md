Wave 13 is implemented on `fix/wave13-scheduler` in three commits, with the per-bug write-up in `_meta/plans/wave-13-summary.md`.

### Bug 1 — Cross-line changeover
Changeover is computed from each line’s tail (`lastWoByLine`), not the global sequence predecessor. Tests pin no `milk→soy` charge on Line B when Line A ran first globally.

### Bug 2 — Oversized WO capacity bypass
`canReserveCapacity` / `reserveCapacity` split load across UTC day buckets. Failed placement advances via `nextCapacityRetryStart`; after 400 attempts it throws `SequenceCapacityInfeasibleError` (no silent `earliestMs` fallback). An 8h WO on a 6h/day line schedules at `18:00Z` (6h + 2h split).

### Bug 3 — Cross-midnight capacity
Shared `utcDayOverlapsForInterval` in `board.ts` is used by the solver. A 4h WO at `23:00Z` reserves 1h on day one and 3h on day two.

### Bug 4 — Duplicate WIP BOM lines
`WipChainEntry` threads `bomLineId`; dependencies match `fgMaterials` by `bomItemId`. Test: two lines with the same WIP item get distinct `material_link` + qty (300 vs 700).

### Bug 5 — Capacity block timezone
`wallClockToInstant` (Intl-only) interprets wall times in the site IANA zone. `getScheduleBoard` loads `sites.timezone`. BST `09:00 London` → `08:00Z`; GMT → `09:00Z`.

### Gates
- `pnpm --filter web exec tsc --noEmit` — clean
- 35 vitest tests — green

### Commits
1. `fix(scheduler): per-line changeover and cross-day capacity reservation`
2. `fix(planning): link WO chain dependencies by BOM line id`
3. `fix(planning): interpret capacity-block wall times in site timezone` (+ summary)
