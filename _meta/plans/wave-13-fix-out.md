Fix round 1 is committed on `fix/wave13-scheduler` (`a1b2c3d` — `fix(wave13): integer-ms capacity buckets, strict BOM linking, DST wall-clock`).

### Cross-cutting — integer-ms capacity buckets
`sequence-solver.ts` now stores per-day usage as **integer milliseconds** in `dayUsageMs`. Hours conversion is only in `__dayUsageHoursForTests` for assertions. Test: 360 one-minute WOs fill a 6 h bucket exactly; the 361st bumps to the next UTC day (no float drift over-capacity).

### Bug 4 — strict BOM-line material linking
Removed the `productId` `find()` fallback. New `resolveMaterialForWipEntry`:
- Matches by `bomItemId` only
- Legacy product-only match only when material + WIP chain are provably unique (single row, no `bomItemId`)
- Otherwise throws `wip_material_link_ambiguous`

Test: two WIP lines same product, B2 missing `bomItemId` → explicit failure, not silent link to B1.

### Bug 5 — DST wall-clock validation
`wallClockMatches` now compares formatted time against **requested** date + hour/minute. Policies:
- **Spring gap:** advance wall-clock minute-by-minute to next valid instant (`2026-03-29 01:30 London` → `02:00` local = `01:00Z`)
- **Fall-back ambiguity:** sort by offset ascending → standard-time occurrence (`2026-10-25 01:30 London` → `01:30Z`)

### Gates
- `tsc --noEmit` — clean
- Vitest — 39 tests green (`wall-clock-time`, `board-capacity`, `sequence-solver`, `create-work-order-chain`)
- `_meta/plans/wave-13-summary.md` updated with **Fix round 1** section
