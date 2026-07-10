# Static Bug Hunt — lib/technical & lib/planning money paths, register-disassembly-output, catch-weight-variance

## P1 findings

### 1. P1 — Correction-asymmetric cost basis in disassembly allocation (inflated output WAC)
`apps/web/lib/production/output/register-disassembly-output.ts:335` vs `:207-262`

- `loadInputConsumptionWacSnapshot` (line 329-335) sums `wac_value`/`wac_qty_kg` **only from rows with `correction_of_id is null`** — i.e. original consumption rows, *including ones that were later reversed*.
- `loadConsumedQtyKg` (line 207-262) has **no correction filter** — it nets original + negative counter-rows.
- `reverseConsumption` (`apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:1151-1205`) inserts a counter-row with negative `qty_consumed` and writes **positive** `wac_qty_kg`/`wac_value` reversal deltas into the counter-row's ext_jsonb (line 1198-1200; `computeWacDebitReversalDelta` in `apps/web/lib/finance/upsert-wac.ts:262-276` returns the snapshot un-negated).

Consequence: consume LP twice (rows A, B), reverse A, then register disassembly outputs — `consumedQty` = qty(B) but `totalInputCost` = wac(A)+wac(B). The reversed consumption's full cost is allocated across the co-product outputs, then pushed into `upsertWac` (line 655) and `item_cost_history` (line 664) → permanently inflated output cost & WAC. (Full reversal is caught by the `input-not-consumed` gate at line 550; only partial reversal leaks.)

### 2. P1 — Recipe/portfolio cost multiplies quantities in arbitrary UoM by per-kg (or per-pack) prices
`apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/list-recipe-cost.ts:190,250` and `.../portfolio/_actions/list-portfolio-cost.ts:42`

`sum(bl.quantity * vec.amount)` with no UoM conversion. Ground truth: `bom_lines.uom` is free text (`packages/db/migrations/090-shared-bom-ssot-npd-origin.sql:75-108` — any uom, e.g. each/box/l), while `v_item_effective_cost.amount` (`packages/db/migrations/405-effective-cost-reads-supplier-spec.sql:15`) coalesces **cost_per_kg** (per kg), **supplier_specs.unit_price** (per supplier price unit — not per kg), and **list_price_gbp**. A BOM line of `12 each` × a per-kg cost yields a nonsense line_cost that is silently summed into `totalMaterialCost`. Compare `loadConsumedQtyKg` in disassembly which refuses unsupported UoMs — here nothing refuses.

### 3. P1 — Uncosted BOM lines silently excluded from the cost total
`list-recipe-cost.ts:198` and `list-portfolio-cost.ts:50` — the `and vec.amount is not null` predicate drops any line whose component has no cost from `totalMaterialCost`/`total_recipe_cost`. The UI receives a single total with no excluded-line count; a recipe where 5 of 6 components are uncosted shows a confident (tiny) "total material cost". Per-line nulls exist in the breakdown, but the header total is the KPI. Understates standard cost fed to margin decisions.

### 4. P1 — Cross-currency sum in recipe/portfolio cost totals
`list-recipe-cost.ts:190-207`, `list-portfolio-cost.ts:42-59` — the total is `sum(quantity*amount)` over all costed lines regardless of `vec.currency`; a separate subquery only relabels the unit as `'MIXED'` when >1 currency. So GBP and PLN amounts are arithmetically added into one number and displayed. (Distinct location from the previously-reported WAC currency asymmetry — this is the Technical recipe roll-up.)

### 5. P1 — Routing cost preview: non-GBP or missing labor rates silently price crew at 0/hr
`apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/cost-preview.ts:98,152` — the lateral rate lookup hardcodes `lr.currency = 'GBP'`; line 85/139 `coalesce(lr.rate_per_hour, 0)`. A role_group whose labor_rates rows are PLN-only, or simply missing, contributes **0** to `rate_per_hour`, and because a non-empty `crew` array wins over `cost_per_hour` (lines 75-82), the op cost is silently 0.00 in both per-op rows and the total. No warning surfaces.

## P2 findings

### 6. P2 — Disassembly ledger currency: silent GBP fallback + relabel-without-conversion
`register-disassembly-output.ts:304` — input-LP currency is `coalesce(trim(ch.currency), 'GBP')` from the item's *current* cost-history row; `:670` writes `input.currency ?? inputLp.currency ?? 'GBP'` to the ledger. The allocated value itself comes from consumption-time `wac_value` snapshots whose currency is never stored; a caller-supplied `currency` (schema line 42) relabels the same number in another currency with no conversion.

### 7. P2 — Catch-weight variance daily row misattributes site
`apps/web/lib/cron/catch-weight-variance.ts:113,118` — aggregation is `group by item_id` only; `min(site_id::text)::uuid` picks the lexicographically smallest site. An item weighed at two sites gets one blended row pinned to an arbitrary site; per-site variance is unrecoverable, and the upsert key `(org_id, item_id, day)` (line 138) makes this schema-level.

### 8. P2 — Catch-weight items with missing/zero nominal silently excluded from variance monitoring
`catch-weight-variance.ts:109` — `where nominal is not null and nominal > 0` drops those weighings from `scored`; the item produces no daily row and can never alert. Reasonable mathematically, but nothing (log, summary counter, exception row) surfaces "N samples skipped: no nominal" — a misconfigured item is invisible to the very control meant to watch it.

### 9. P2 — Portfolio cost converts NUMERIC money to JS float at the boundary
`list-portfolio-cost.ts:71` — `total_recipe_cost: Number(row.total_recipe_cost ?? '0')`. Violates the module's own "NUMERIC stays a string end-to-end" rule (`list-recipe-cost.ts:24`, `numeric.ts` header) which the sibling recipe screen honors; float display artifacts on large totals.

### 10. P2 — OR-join in cost roll-ups can fan out and double-count a line
`list-recipe-cost.ts:194,255`, `list-portfolio-cost.ts:46` — `(ci.id = bl.item_id or ci.item_code = bl.component_code)` matches up to two `items` rows when `bl.item_id` points at item A while another item B carries the same `item_code` (e.g. re-created item). The line then appears twice in the `sum(...)` and the breakdown.

### 11. P2 — V-TEC-53 20% guard compares cost values across currencies
`.../technical/cost/_actions/write-cost-ledger.ts:59-70` — `abs(new - current)/current` compares raw `cost_per_kg` numbers ignoring the currency column; a legitimate GBP→PLN repricing (≈5x number) hard-requires an approver, and conversely a same-number different-currency change (real ~5x value move) passes.

### 12. P2 — MRP planned-order release computes the WO material scalar in JS floats
`apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:1361-1368,1399` — `computeWoMaterialScalar({ plannedBaseQty: Number(quantity), eachPerBox: Number(...), netQtyPerEach: Number(...) })` then `materialScalar.toFixed(6)` feeds `required_qty = round(bl.quantity * $2::numeric / ..., 3)`. Bounded error (≤1e-9 relative) but breaks the bigint micro-unit discipline the same feature enforces in `mrp-compute.ts` (header lines 35-39); also `mrp.ts:631` `Number(row.suggestedAction?.qty)` (whole units, safe today, fragile).

## Verified CLEAN (in scope)

- `mrp-compute.ts` netting core: exact bigint micro-units end-to-end (`toMicro`/`mulMicro`), unconvertible UoMs surfaced in `excludedUoms` (never silently mixed), coverage % via integer math with half-up rounding — clean.
- `register-disassembly-output.ts` allocation arithmetic itself: fixed-point bigint (scale 6), half-up `multiplyFixed`/`divideFixed`, remainder-to-last-output conserves `totalInputCost` exactly, zero-divisor guarded, allocation-sum tolerance 0.01pp, mass-balance check in bigint — clean.
- `register-output.ts` `computeCatchWeightSummary` (lines 165-228): micro-unit bigint avg/variance, tolerance correctly converted pct→fraction at the caller (line 663-666) — clean.
- `technical/cost/_components/numeric.ts` (`formatCost`, `deltaPctExact`): exact BigInt half-up, no float — clean.
- `write-cost-ledger.ts` write path: all values bound as strings into `::numeric`, denormalized `items.cost_per_kg` from the same string — clean (aside finding 11).
- `planning/_actions/freight-actions.ts`: Dec-based arithmetic; `Number()` only at the display edge for percentages — clean.
- `lib/finance/upsert-wac.ts` reversal helpers (lines 240-348): decimal-string negation, snapshot-first with logged fallback, no float — clean.
- PO create (`create-purchase-order-core.ts`): `unit_price`/`qty` stay strings into `::numeric`; no JS money math found.

## NOT covered

- `lib/production/complete-cancel-wo.ts`, `lib/finance/book-receipt-wac.ts`, shipping WAC debit/cancel paths (`ship-actions.ts`) — touched only to verify reversal snapshot semantics.
- The catch-weight cron **route handler** (org iteration, day/timezone selection, auth) — only the lib compute module reviewed.
- NPD costing screens, transfer orders, scheduler duration math, purchase-order totals UI rendering.
- Any runtime/E2E verification — static read-only review; no queries executed against live data.