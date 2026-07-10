# Wave 8 — Shipping stock integrity & traceability (2026-07-10)

## Bug 1 (P1) — Partial-LP cancel could not restore stock

**Root cause:** `shipShipment` correctly leaves a partial LP in its prior status (`available`) with reduced quantity, but `cancelShipment` only restored LPs with `status = 'shipped'`. Partial-ship cancels matched zero rows → `persistence_failed` and the shipped delta was lost.

**Fix:** `cancelShipment.ts` restores using the immutable shipment snapshot (`shipped_license_plates` / box contents) and a status predicate that accepts both full-ship (`shipped`) and partial-ship (`status = prior_status`) LPs. LP transition audit now records the real current status, not a hard-coded `shipped`.

**Tests:**
- `cancelShipment.test.ts` — partial ship keeps LP `available`; cancel restores qty 10 from 4+6.
- `wave8-shipping-integrity.pg.test.ts` — real Postgres cancel-restore UPDATE on a partial LP.

## Bug 2 (P1) — Shipping one SO released other SOs' allocations on the same LP

**Root cause:** Ship-time allocation release joined `inventory_allocations` to packed contents by `license_plate_id` only, releasing every live allocation on that LP.

**Fix:** `ship-actions.ts` now joins `ia.sales_order_line_id = sbc.sales_order_line_id` and constrains the line to the shipment's `sales_order_id` via `shipments` + `sales_order_lines`.

**Tests:**
- `ship-actions.test.ts` — SQL assertion for line-scoped join.
- `wave8-shipping-integrity.pg.test.ts` — shared LP: SO-A ship releases only SO-A allocation; SO-B stays `allocated`.

## Bug 3 (P1) — Case/pallet order qty treated as base inventory qty

**Root cause:** SO creation stored entered qty in `quantity_ordered` while UoM lived only in `ext_data.order_uom`. Allocation compared raw `quantity_ordered` to LP qty without pack-factor conversion.

**Fix:**
- New `apps/web/lib/shipping/order-line-uom.ts` — SQL `ORDER_QTY_TO_INVENTORY_SQL` + `resolveOrderQtyToInventoryQty()` using exact NUMERIC pack factors (`each_per_box`, `boxes_per_pallet`, `net_qty_per_each`).
- `createSalesOrder` — `quantity_ordered` = inventory qty; `ext_data.order_qty` + `order_uom` preserved for documents/UI.
- `allocateSalesOrder` — resolves inventory need from `order_qty`/`order_uom` before FEFO netting.
- `fetchSalesOrder` — displays `order_qty` when present.
- Typed `unresolved_uom` error when hierarchy is incomplete (mirrors receiving hard-block).

**Tests:**
- `so-actions.test.ts` — 3 cases × `each_per_box=12` → allocates 36; unresolved UoM rejected.
- `order-line-uom.test.ts` — case/carton label normalization.
- `wave8-shipping-integrity.pg.test.ts` — SQL conversion 3 case → 36 on real Postgres.

## Migration note

No migration added. Allocation uniqueness remains the existing non-unique index; the ship-time join fix is sufficient.

## Gates

- `pnpm --filter web exec tsc --noEmit` — clean
- Touched vitest — 75 passed (pg suite skips without `DATABASE_URL`)

## Fix round 1

### Bug 1 (PARTIAL → FIXED) — Snapshot-authoritative cancel restore

**Root cause:** `lockShipmentLps` drove LP membership from mutable `shipment_box_contents` and only left-joined `shipped_license_plates`. An LP present in the immutable snapshot but absent from current box contents was never restored.

**Fix:** `restore_set` CTE drives from `shipped_license_plates` as authoritative membership; legacy `shipment_lps` fallback applies only when the snapshot array is empty. Quantity always comes from the snapshot (or legacy contents aggregate).

**Tests:** Replaced copied UPDATE pg test with real `cancelShipment` action tests — full restore, partial restore, snapshot/content divergence, repeat idempotency, and legacy no-snapshot fallback.

### Bug 3 (BROKEN → FIXED) — Entered vs canonical grain across consumers

**Root cause:** `fetchSalesOrder` aliased entered `order_qty` to `quantity_ordered` while `quantity_allocated` stayed canonical, so allocation status compared 3 cases to 36 each. MRP open-SO demand subtracted entered-UoM-converted shipped qty from canonical `quantity_ordered`.

**Fix:**
- `SalesOrderLine` now exposes both entered (`qty`/`uom`) and canonical (`inventory_qty`/`inventory_uom`) fields; allocation status computed from canonical; `allocated_qty` converted to entered UoM via `SALES_ORDER_LINE_ALLOCATED_TO_ORDER_SQL`.
- MRP open-SO demand uses one grain: `quantity_ordered - shipped_base_qty` labelled with `i.uom_base`.

**Tests:**
- `so-actions.test.ts` — case order reports `partially_allocated` at 12/36 canonical, displays 1/3 cases.
- `mrp.test.ts` — canonical remainder regression for partially-shipped case and pallet orders; updated P2-05 SQL parity assertions.

### Migration note

No migration added.

### Gates (fix round 1)

- `pnpm --filter web exec tsc --noEmit` — clean
- Touched vitest — 100 passed (pg suite skips without `DATABASE_URL`)
