# Wave 8 — Shipping stock integrity & traceability (from 2026-07-10 hunt, h8)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
All qty/UoM math in SQL numeric or the Dec helper — NEVER JS float. These touch physical-goods traceability — add DB-faithful tests.

## Bug 1 (P1) — cancelling a partial-LP shipment cannot restore its stock
`shipping/_actions/ship-actions.ts:362,369` — shipping subtracts the shipped qty but KEEPS the LP's prior status when qty remains (partial ship → status stays 'available'). `cancelShipment.ts:619,628` restores stock ONLY when `status='shipped'`, and requires exactly one updated row (:633) else rolls back with persistence_failed.
Failure: LP qty 10, ship 6 → LP qty 4, status 'available'. Cancel matches 0 LP rows → persistence_failed → the 6 units are lost, shipment can't reverse.
Also `cancelShipment.test.ts:460,467` wrongly expects the LP to become 'shipped' — masking the bug.
FIX: restore from the IMMUTABLE shipment snapshot (the shipped quantities recorded on the shipment/contents), using a lock/version predicate that works for BOTH full and partial shipments — do NOT gate on current status='shipped'. Add the shipped qty back to the LP and reconcile status. Fix the misleading test + add a DB-faithful partial-LP cancel test proving the 6 units return.

## Bug 2 (P1) — shipping one order releases OTHER orders' allocations on the same LP
Schema allows multiple allocation rows per LP (non-unique index, `211-shipping-schema-foundation.sql:298,323`). The ship-time allocation UPDATE joins allocations to packed contents by `license_plate_id` ALONE (`ship-actions.ts:424,430,435`) — it does not restrict `ia.sales_order_line_id` to the packed content's line or the shipment's SO.
Failure: LP-1 has allocations for SO-A and SO-B. Shipping SO-A marks BOTH 'released'; only SO-A's qty leaves reserved_qty → SO-B left with a dead allocation, stale line totals, ghost-reserved stock.
FIX: add `ia.sales_order_line_id = sbc.sales_order_line_id` to the join AND ensure the allocation belongs to the shipment's sales order. Add a test asserting SO-B's allocation is untouched when SO-A ships from a shared LP.

## Bug 3 (P1) — case/pallet order quantities treated as raw base quantities
SO creation accepts any registered UoM incl. `case`/`pallet` but stores UoM only in JSON while writing the entered number straight to `quantity_ordered` (`so-actions.ts:571,611,615`). Allocation compares that number directly to LP qty without reading `order_uom` / pack factors (`so-actions.ts:669,697,708`). Pack factors exist: `267-items-pack-hierarchy.sql:5` (`net_qty_per_each`, `each_per_box`, `boxes_per_pallet`).
Failure: order for 3 cases×12 → allocated/shipped as 3, not 36 each → contents, LP depletion, BOL qty, traceability all understate physical goods.
FIX: normalize the order quantity to the item's canonical inventory UoM using EXACT numeric pack factors (SQL numeric) BEFORE allocation, retaining the entered qty+UoM for documents. REJECT unsupported/incomplete-hierarchy conversions with a typed error (mirror how receiving hard-blocks unresolved UoM). Add a test: 3 cases of each_per_box=12 allocates 36 base units.

## Requirements
- Read every touched file fully; grep all callers; reuse existing pack-factor/UoM helpers (find them — do not duplicate).
- Tests per bug proving the fix, DB-faithful where the finding calls for it (use the existing shipping __tests__ + pg-test patterns). `.ts` default vitest config, `.tsx` under `--config vitest.ui.config.ts`.
- NO new dependencies. Avoid migrations unless strictly required; if the allocation-uniqueness needs a constraint, add an additive migration (next free number — check max, two files share 459) and say so LOUDLY (auto-applies on Vercel).
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green.
- Summary per bug → `_meta/plans/wave-8-summary.md`.
