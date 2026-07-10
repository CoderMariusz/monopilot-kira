# Finance/costing static audit

## Findings

### P1 — Recipe and portfolio totals add unlike currencies without conversion

Evidence:

- [`list-recipe-cost.ts:190`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/list-recipe-cost.ts:190) computes `sum(bl.quantity * vec.amount)` across all components.
- [`list-recipe-cost.ts:199`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/list-recipe-cost.ts:199) separately detects multiple currencies and merely labels the result `MIXED`.
- [`list-portfolio-cost.ts:42`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/portfolio/_actions/list-portfolio-cost.ts:42) repeats the same raw summation.
- [`405-effective-cost-reads-supplier-spec.sql:15`](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/405-effective-cost-reads-supplier-spec.sql:15) confirms the effective-cost view can return cost-history, supplier-price, or GBP fallback amounts.
- [`405-effective-cost-reads-supplier-spec.sql:16`](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/405-effective-cost-reads-supplier-spec.sql:16) carries each amount’s actual currency.

A BOM containing `10 GBP` and `10 EUR` is reported as numeric total `20 MIXED`. That number is not a monetary value and can feed incorrect recipe comparisons and portfolio decisions.

Suggested fix: require a single currency or convert every component through an effective-dated FX rate into an explicit reporting currency before aggregation. Do not emit a summed amount when currencies remain mixed.

---

### P1 — WO actual costing silently combines non-GBP material costs with GBP labor/setup

Evidence:

- [`wo-cost-actions.ts:303`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:303) selects only `cost_per_kg`, discarding the associated `item_cost_history.currency`.
- [`wo-cost-actions.ts:309`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:309) reads the currency-bearing cost ledger without selecting currency.
- [`wo-cost-actions.ts:364`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:364) explicitly selects GBP labor rates.
- [`wo-cost-actions.ts:428`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:428) declares the process cost currency as GBP.
- [`wo-cost-math.ts:101`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-math.ts:101) adds material, labor, setup, machine, and waste figures as if they shared one currency.

For example, a material ledger value of `25 PLN/kg` is added directly to GBP labor. The resulting WO total and cost/kg have no valid currency basis.

Suggested fix: resolve all components, labor, setup, and waste into an explicit WO/reporting currency using effective-dated FX, or block the calculation on currency mismatch.

---

### P1 — Historical WO costs are repriced using today’s active material cost

Evidence:

- [`wo-cost-actions.ts:309`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:309) queries `item_cost_history`.
- [`wo-cost-actions.ts:313`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:313) restricts the lookup to `effective_to is null`.
- [`wo-cost-actions.ts:314`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:314) orders active rows by effective date, but never compares them with the WO or consumption date.

Reopening a completed WO cost report after a new standard-cost roll changes its “actual” material cost retroactively. This also makes historical variance non-reproducible.

Suggested fix: prefer the immutable cost/WAC snapshot stored with each consumption entry. If a fallback is required, select the history interval containing the consumption or WO accounting date.

---

### P1 — Backdated cost insertion creates incorrect history intervals

Evidence:

- [`write-cost-ledger.ts:75`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:75) updates whichever row is currently open.
- [`write-cost-ledger.ts:76`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:76) sets its end date with `greatest(new_date - 1 day, effective_from)`.
- [`write-cost-ledger.ts:90`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:90) then inserts the backdated row without an `effective_to`.

If an active cost begins July 10 and a user inserts a July 1 cost, the July 10 row is closed on July 10 while the July 1 row becomes open indefinitely. The older insertion incorrectly becomes the current cost, and July 10 overlaps both ranges.

Suggested fix: locate the immediately preceding and following history records around the requested date; close the predecessor at `new_date - 1`, set the new row’s end to `next_date - 1`, and enforce non-overlapping intervals with a database exclusion constraint.

---

### P2 — Accepted cost precision exceeds ledger precision and creates divergent values

Evidence:

- [`shared.ts:85`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/shared.ts:85) accepts an arbitrary number of decimal places.
- [`160-item-cost-history.sql:21`](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/160-item-cost-history.sql:21) stores only `numeric(10,4)`.
- [`write-cost-ledger.ts:93`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:93) inserts the unquantized input, allowing PostgreSQL to round it to four decimals.
- [`write-cost-ledger.ts:102`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:102) writes the same input to `items.cost_per_kg`, whose schema is `numeric(18,6)`.
- [`write-cost-ledger.ts:117`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger.ts:117) audits and returns the original, unrounded input.

Submitting `1.234567` records `1.2346` in history, `1.234567` in the item cache, and reports `1.234567` to the caller/audit trail.

Suggested fix: define one canonical scale, reject excess precision or quantize once in SQL, and use the returned stored value for the cache, audit event, and response.

---

### P2 — Portfolio monetary totals are converted from exact NUMERIC text to binary float

Evidence:

- [`list-portfolio-cost.ts:42`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/portfolio/_actions/list-portfolio-cost.ts:42) correctly computes the total in PostgreSQL `NUMERIC`.
- [`list-portfolio-cost.ts:71`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/portfolio/_actions/list-portfolio-cost.ts:71) converts that exact decimal to JavaScript `Number`.
- [`portfolio/page.tsx:104`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/portfolio/page.tsx:104) formats the resulting float with `toFixed(2)`.

Large totals or values near half-cent boundaries can display or sort incorrectly after binary-float conversion.

Suggested fix: keep totals as decimal strings and use the existing fixed-point/BigInt decimal helpers for formatting and comparisons.

## Clean areas verified

- `lib/finance/upsert-wac.ts` performs quantity/value mutations in PostgreSQL `NUMERIC`, not JavaScript floats.
- WAC credit and debit reversals use negated decimal strings and prefer immutable contribution snapshots.
- Receipt price multiplication is performed by PostgreSQL `NUMERIC`.
- `wo-cost-math.ts` uses micro-scaled `bigint` arithmetic with explicit rounding.
- The NPD waterfall core uses its decimal abstraction rather than native float arithmetic for persisted calculations.
- Inventory valuation totals aggregate fixed-point `bigint` values per currency instead of combining currencies.
- Cost-history and item cost columns are `NUMERIC`, not floating-point database types.
- No files were modified. Existing untracked workspace files were left untouched.
- The excluded known WAC currency-pool asymmetry was not re-reported.

## Not covered

- Live Supabase contents, triggers, and deployed migration state.
- D365 integration behavior beyond the local cost/pricing read paths.
- Tax, invoicing, payment, GL export, and customer-specific price-list logic.
- Full browser/UI behavior and localization.
- Runtime concurrency tests for simultaneous cost rolls or WAC updates.
- Exhaustive supplier/PO pricing outside paths feeding effective item cost.
- Previously listed known bugs from the request.
