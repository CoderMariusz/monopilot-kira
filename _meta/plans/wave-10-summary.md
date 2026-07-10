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

---

## Fix round 1

**BUG 1 — build blocker:** Removed `export { MIXED_CURRENCY_ROLLUP_MARKER }` from `'use server'` `list-portfolio-cost.ts`; marker stays in non-server `recipe-cost-rollup-sql.ts` for import-only use.

**BUG 2 + 3 — consumption grain:** WO materials SQL now uses `bool_or(cost_currency is distinct from 'GBP')` (not `max(currency)`) and `sum(qty_kg × cost_per_kg) / sum(qty_kg)` weighted cost (not `max(cost_per_kg)`). Tests: mixed EUR+GBP same item → `unsupported_currency`; two GBP consumptions at £3+£5 → £8 total not £10.

**BUG 4 — concurrency:** `writeItemCostLedger` takes `pg_advisory_xact_lock(hashtext(org||'::'||item||'::costledger'))` before anchor reads. Migration `467-item-cost-history-one-open-per-item.sql` adds partial unique index on `(org_id, item_id) where effective_to is null`. Tests: unit between-closed-intervals + lock ordering; integration between-closed + concurrent forward writes → one open row, no overlap.

**Gates:** `tsc --noEmit` clean; 20 targeted vitest tests green.
