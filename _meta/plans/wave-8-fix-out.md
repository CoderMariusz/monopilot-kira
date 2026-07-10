Implemented Bug 1 and Bug 3 fixes from the adversarial review. Summary:

## Bug 1 — Snapshot-authoritative cancel restore

`lockShipmentLps` now drives from `shipped_license_plates` via a `restore_set` CTE. Mutable `shipment_box_contents` is used only as a **legacy fallback when the snapshot array is empty** — not when an LP is missing from current contents.

Replaced the copied UPDATE pg test with **real `cancelShipment` action tests** covering:
- Full restore (LP `shipped` → `available`, qty restored)
- Partial restore (LP stays `available`, qty 4+6=10)
- Snapshot/content divergence (LP in snapshot, no box contents → still restores)
- Repeat cancellation idempotency (second call `{ ok: true }`, no double-restore)
- Legacy no-snapshot fallback (box contents only)

## Bug 3 — Consistent quantity grain

**Sales order read model** (`so-actions.ts` / `so-actions-types.ts`):
- `qty` / `uom` = entered order quantity
- `inventory_qty` / `inventory_uom` = canonical (`quantity_ordered` / `uom_base`)
- `allocation_status` computed from **canonical** ordered vs allocated
- `allocated_qty` converted to entered UoM via `SALES_ORDER_LINE_ALLOCATED_TO_ORDER_SQL`

**MRP** (`mrp.ts`):
- Open-SO demand uses one grain: `quantity_ordered - sum(shipped base qty)` labelled with `i.uom_base`
- Removed entered-UoM conversion in the shipped subquery

## Verification

- `tsc --noEmit` — clean
- Touched vitest — **100 passed** (pg suite skips without `DATABASE_URL`)
- **No migration** required
- Committed on `fix/wave8-shipping`
- Appended **"## Fix round 1"** to `_meta/plans/wave-8-summary.md`
