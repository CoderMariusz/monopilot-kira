# Wave 10 — Money roll-ups summary (2026-07-10)

## Bug 1 — Recipe & portfolio mixed-currency bogus sums

**Problem:** `list-recipe-cost` and `list-portfolio-cost` summed `quantity × amount` across BOM lines even when `v_item_effective_cost` returned GBP, EUR, PLN, etc., then labelled the total `MIXED` — a non-monetary number (e.g. `20 MIXED`).

**Fix:** Shared roll-up SQL (`recipe-cost-rollup-sql.ts`). When `count(distinct vec.currency) > 1`, total is `null` and currency is `mixed_currency`. Per-line breakdown unchanged. Portfolio page shows `—` for null totals.

**Tests:** `list-recipe-cost.test.ts` (mixed → null total), `where-used-and-portfolio-cost.test.ts` (portfolio null + SQL guard).

---

## Bug 2 — WO actual cost silently mixed PLN material with GBP labor

**Problem:** `wo-cost-actions` read `cost_per_kg` without currency and added material + GBP labor/setup in one total.

**Fix:** Material query selects `cost_currency` (WAC snapshot → GBP; else `item_cost_history.currency`). Before `computeWoActualCostTotals`, any resolved material with `cost_currency ≠ GBP` returns `{ ok: false, reason: 'unsupported_currency' }` (aligned with W1 / no FX table).

**Tests:** `wo-cost-actions.test.ts` — `PLN_WO_ID` returns `unsupported_currency`.

---

## Bug 3 — Historical WO material cost repriced from today's open history row

**Problem:** Materials lateral join used `effective_to is null` (current open cost), so a later standard-cost roll changed completed WO reports.

**Fix:** Prefer immutable `wo_material_consumption.ext_jsonb.wac_avg_cost` from consume-time WAC debit. Fallback: `item_cost_history` row whose interval contains `coalesce(consumed_at::date, wo_start_date)` — not the open row.

**Tests:** `wo-cost-actions.test.ts` — SQL asserts `wac_avg_cost` + interval predicate; `HISTORIC_WO_ID` uses snapshot cost in totals.

---

## Bug 4 — Backdated cost insertion broke history intervals

**Problem:** `write-cost-ledger` closed whichever row was open and inserted backdated rows with no `effective_to`, making older rows "current" and overlapping ranges.

**Fix:** Interval surgery: forward inserts close only when `effective_from` is after the open row; backdated inserts set `effective_to = next.effective_from - 1 day`; same-date row deleted before insert; `items.cost_per_kg` denormalized only when the new row is the latest (open).

**Tests:** `write-cost-ledger.test.ts` (unit mocks); `cost.integration.test.ts` (real DB — July-1 backdate slots before July-10 open without changing denorm).

---

## Gates

- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (22 tests): recipe cost, portfolio cost, write-cost-ledger, wo-cost-actions — all green
