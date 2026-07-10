All three Wave 8 fixes are implemented on `fix/wave8-shipping` in four logical commits. Summary is in `_meta/plans/wave-8-summary.md`.

### Bug 1 — Partial-LP cancel restore
- `cancelShipment.ts` no longer requires `status = 'shipped'` to restore stock.
- Restores from the shipment snapshot using `(status = 'shipped' OR status = prior_status)` so partial ships (LP stays `available`) cancel cleanly.
- Fixed `cancelShipment.test.ts` (partial ship expects `available`, not `shipped`).

### Bug 2 — Scoped allocation release
- `ship-actions.ts` allocation release now joins `ia.sales_order_line_id = sbc.sales_order_line_id` and ties the line to the shipment's SO.
- Other orders' allocations on a shared LP are left alone.

### Bug 3 — Order UoM normalization
- New `apps/web/lib/shipping/order-line-uom.ts` with SQL pack-factor conversion.
- `createSalesOrder` stores inventory qty in `quantity_ordered` and entered qty in `ext_data.order_qty` / `order_uom`.
- `allocateSalesOrder` resolves inventory need before FEFO.
- `unresolved_uom` error for incomplete pack hierarchy.

### Tests & gates
- **75 vitest tests** green (unit + mock).
- **`wave8-shipping-integrity.pg.test.ts`** — DB-faithful proofs (skips without `DATABASE_URL`; docker unavailable here).
- **`pnpm --filter web exec tsc --noEmit`** — clean.

### Commits
1. `f9d481d0` — partial-LP cancel restore  
2. `424dd637` — scoped allocation release  
3. `0f08879b` — order UoM normalization  
4. `3c829fa0` — pg tests + `_meta/plans/wave-8-summary.md`

No migration was added (join fix is sufficient per spec). Run pg tests locally with `pnpm db:up` and `DATABASE_URL` set when you have Postgres available.
