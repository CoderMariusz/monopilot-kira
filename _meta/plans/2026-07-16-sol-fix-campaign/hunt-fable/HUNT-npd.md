# HUNT — NPD + Technical + BOM + recipes + costing/nutrition (Fable)

Area: `apps/web/app/(npd)/**`, `apps/web/app/[locale]/(app)/(modules)/technical/**`,
`apps/web/lib/npd/**`, `apps/web/lib/costing/**`, BOM/recipe/WIP-cost/nutrition flows.
Method: read real code, traced flows, verified each claim against source + migrations.
Dedup baseline: FULL-REPORT C001–C120 + LEDGER W1–W8 (all C-items fixed/in-wave). Only NEW defects below.

## Summary table (ranked)

| ID | Sev | file:line | one-line | failure scenario | why not in C001–C120 |
|---|---|---|---|---|---|
| NEW-P01 | P2 | `apps/web/lib/costing/wip-cost.ts:26-33` + `compute-waterfall.ts:397-408` + `costing/_actions/compute.ts:864-877` | WIP standalone unit cost silently drops process `setup_cost` | A WIP intermediate with a per-run setup cost gets a `cost_per_kg` / `item_cost_history` / `v_item_effective_cost` that omits the amortised setup → any FG that lists that WIP as a BOM line, plus the technical recipe cost rollup, under-cost it and overstate margin | C033/C034 were labour double-count + yield-division; setup_cost is a *third*, distinct cost component never mentioned there. mig 429 explicitly designed setup to amortise. |
| NEW-P02 | P3 | `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:681-688` | `costReady` gate check is recipe-version-agnostic | Compute target cost on recipe v1, then edit recipe → v2 locked; the `costing_nutrition → trial` soft gate still reports cost "ready" from the stale v1 breakdown, while `nutritionReady` (same function) correctly re-checks the locked version | C025/C028/C033 touched gate model + price precision + WIP yield; none touch this cost-vs-locked-version staleness asymmetry. |
| NEW-P03 | P3 | `apps/web/lib/costing/wip-cost.ts:203-207` | `computeWipTreeUnitCost` reports a cyclic WIP tree as complete (not `missing`) | A WIP-in-WIP cycle edge is skipped with `continue` and `missing` stays `false`, so the returned unit cost is under-counted **and** flagged honest-complete — a real data defect is hidden behind a plausible-looking cost | C030 was live-nutrition WIP recursion parity; this is the *cost* recursion safety-net returning a false-complete. |
| NEW-P04 | P3 | `apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/recipe-cost-rollup-sql.ts:31-35` | Technical recipe/portfolio material rollup ignores `bom_lines.scrap_pct` | PM (packaging) lines carry scrap_pct; the rollup sums `quantity * amount` with no scrap factor, while the NPD waterfall `sumPackaging` inflates by `1 + wastePct/100`. Same BOM → two different packaging costs between the Technical Cost screen and the NPD costing waterfall | Not a C-item; C047/C042 were NUMERIC column precision, not scrap application. (Include with uncertainty: may be an intended "standard material cost" definition.) |

---

## Details

### NEW-P01 (P2) — WIP standalone unit cost drops `setup_cost`

**Root type.** `WipProcessCostInput` in `apps/web/lib/costing/wip-cost.ts:26-33` has fields
`roles / durationHours / additionalCost / throughputPerHour / throughputUom` — **no `setupCost`**.
Every WIP unit-cost path builds this DTO and therefore cannot include setup:

- `apps/web/lib/costing/compute-waterfall.ts:397-408` `mapWipProcesses()` maps the WIP's processes
  into `WipProcessCostInput` and omits `setupCost`. So the waterfall's WIP-labour stage
  (`yieldedWipLabourPerPack`, line 255) carries zero setup.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts:864-877`
  `persistWipUnitCosts()` builds the same DTO (no setup) and writes the result to
  `item_cost_history` + `items.cost_per_kg` for the WIP intermediate item.

**Why it's a real cost error.** `packages/db/migrations/429-npd-cost-engine-inputs.sql:63-64`
documents the column: *"NPD costing D25: setup cost per run; amortised as
`setup_cost * runs_per_week / weekly_volume_packs`."* The FG-level waterfall honours this exactly
(`compute-waterfall.ts:271` `sumSetup(input.processes).mul(runsPerWeek).div(weeklyVolumePacks)`),
so setup is amortised for **FG-direct** processes but **never** for a WIP's own carried cost.

**Failure scenario.** WIP `WIP-DOUGH` has a process with `setup_cost = 50`, no per-run amortisation
reaches its `cost_per_kg`. That understated `cost_per_kg` flows through `v_item_effective_cost` into:
(1) `recipe-cost-rollup-sql.ts` material totals, and (2) any *other* FG whose BOM lists `WIP-DOUGH`
as a component line (its effective cost is read, not recomputed). Both under-cost and overstate margin.

**Fix direction (root, one place).** Add optional `setupCost` (+ the runs/volume amortiser inputs) to
`WipProcessCostInput` and fold it into `computeWipProcessLaborPerOutputUnitDec`, then pass `setup_cost`
through `mapWipProcesses` and `persistWipUnitCosts`. Single shared function → both callers fixed.

Note: type says `row.setup_cost: string | null` (`compute.ts:156`) and `sumSetup` does
`Dec.from(process.setupCost)` — fine today only because the DB column is `NOT NULL DEFAULT 0`.

---

### NEW-P02 (P3) — `checkCostingNutritionReady` cost check ignores the locked recipe version

`gate-helpers.ts:654-705`. The `cost_ready` CTE:

```sql
exists (select 1 from public.costing_breakdowns cb
        join project_row p on p.product_code = cb.product_code
       where cb.org_id = app.current_org_id() and lower(cb.scenario) = 'target')
```

has **no** join to `locked_recipe`, whereas `nutrition_ready` (same query) joins
`nutri_score_results.formulation_version_id = locked_recipe.locked_version_id`.
Consumed at `advance-project-gate.ts:260` as a **soft** gate on `costing_nutrition → trial`
(overridable), so severity is P3 — but the readiness signal is dishonest: a target-cost breakdown
computed against a now-superseded recipe passes "cost ready". Fix: add the same locked-version guard
the nutrition branch already has (breakdown must reference the current locked formulation version).

---

### NEW-P03 (P3) — WIP cost tree hides a cycle as complete

`wip-cost.ts:203-207`, inside `computeWipTreeUnitCost`:

```ts
if (line.isIntermediate && line.childItemId && input.resolveChild) {
  if (visited.has(line.childItemId)) {
    // ponytail: cycle edge → zero contribution, do not explode
    continue;            // <-- missing is NOT set true here
  }
  ...
```

The top-of-function depth-ceiling break *does* set `missing` (line 192), but this cycle-edge break
does not. Result: a genuine WIP-in-WIP cycle yields a cost that (a) omits the cyclic branch's real
contribution and (b) is returned with `missing: false`, i.e. presented as a trustworthy complete cost.
A cost safety-net that silently under-reports on a data defect is worse than an honest `missing`.
Cycles are mostly blocked by V-TEC-13 at BOM activation, hence P3, but this helper is exactly the
belt-and-braces path. Fix: set `missing = true` on the cycle-edge `continue` (one line).

---

### NEW-P04 (P3, uncertain) — Technical recipe cost rollup ignores scrap; diverges from waterfall

`recipe-cost-rollup-sql.ts:31-35` (and the portfolio variant 57-63) computes
`sum(bl.quantity * vec.amount)` with no scrap factor. `bom_lines.scrap_pct` is populated for PM
(packaging) lines by `materialize-npd-bom.ts` (`clampScrapPct`). The NPD waterfall instead inflates
packaging by `1 + wastePct/100` (`compute-waterfall.ts:420-424 sumPackaging`). Same BOM therefore
yields two different packaging/material costs on the Technical Cost screen vs the NPD costing screen.
Flagged uncertain: this may be an intentional "standard material cost excludes scrap" definition —
but the two surfaces should at least agree or label the difference.

---

## Areas checked and found clean (no new finding)

- `delete-project.ts` — throw-to-rollback after linked-FG archive is correct (C027 path solid).
- `clone-project.ts` — resets gate/stage to G0/brief, copies checklist *definitions* only, org-scoped;
  `allocateProjectCode` exhaustion at 999 handled. Clean.
- `gate-helpers.ts` state machine (`assertHonestGateAdvance` / `resolveAdvanceTransition`) —
  blocks multi-gate skips; G3/G4 e-sign asserts present. C025 model holds.
- `coalesceProductColumn` dynamic-column UPDATE — identifiers are regex-filtered *and* intersected
  with `information_schema` product columns before `quoteIdentifier`; no injection.
- `buildExpectedBomLines` / `computeBomLineQty` — JS `Number` math at `toFixed(6)`; precision loss is
  below 6dp for realistic ingredient magnitudes (not raised).
