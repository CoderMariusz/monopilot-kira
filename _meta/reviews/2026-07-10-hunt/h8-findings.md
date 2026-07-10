# Warehouse + shipping static bug hunt

No P0 findings. Three P1 traceability/stock-integrity defects found.

## Findings

### P1 — Cancelling a partial-LP shipment cannot restore its stock

- Shipping subtracts the shipped quantity but retains the LP’s prior status whenever quantity remains: [ship-actions.ts:362](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:362), [ship-actions.ts:369](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:369).
- Cancellation then restores stock only when `status = 'shipped'`: [cancelShipment.ts:619](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:619), [cancelShipment.ts:628](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:628).
- It requires exactly one updated row and rolls the cancellation back otherwise: [cancelShipment.ts:633](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:633).

Failure scenario: an available LP has quantity 10 and shipment quantity 6. Shipping leaves quantity 4 and status `available`. Cancelling the shipped shipment matches zero LP rows, returns `persistence_failed`, and cannot reverse the shipment or restore the six units.

The existing test models this scenario but incorrectly expects the LP to become `shipped`, masking the SQL behavior: [cancelShipment.test.ts:460](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.test.ts:460), [cancelShipment.test.ts:467](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.test.ts:467).

Suggested fix: restore using the immutable shipment snapshot and a lock/version predicate compatible with both full and partial shipments; do not require current status `shipped`. Add a database-faithful partial-LP cancellation test.

### P1 — Shipping one order releases other orders’ allocations on the same LP

- The schema permits multiple allocation rows for one LP; it has only a non-unique LP index: [211-shipping-schema-foundation.sql:298](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:298), [211-shipping-schema-foundation.sql:323](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:323).
- The ship-time allocation update joins allocations to packed contents solely by `license_plate_id`: [ship-actions.ts:424](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:424), [ship-actions.ts:430](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:430), [ship-actions.ts:435](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:435).
- It does not restrict `ia.sales_order_line_id` to the packed content’s line or the shipment’s sales order.

Failure scenario: LP-1 has allocations for SO-A and SO-B. Shipping SO-A marks both allocation rows `released`. Only SO-A’s shipped quantity is removed from `reserved_qty`, leaving SO-B with a non-live allocation, stale line allocation totals, and potentially ghost-reserved stock.

Suggested fix: join `ia.sales_order_line_id = sbc.sales_order_line_id` and ensure the allocation belongs to the shipment’s sales order. Assert affected allocation quantities/rows against packed contents.

### P1 — Case/pallet order quantities are treated as raw LP base quantities

- Sales-order creation accepts arbitrary registered UOMs, including `case` and `pallet`, but stores the UOM only in JSON while writing the entered numeric quantity directly to `quantity_ordered`: [so-actions.ts:571](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:571), [so-actions.ts:611](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:611), [so-actions.ts:615](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:615).
- Allocation compares that number directly against LP quantity without reading `order_uom` or applying pack factors: [so-actions.ts:669](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:669), [so-actions.ts:697](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:697), [so-actions.ts:708](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:708).
- The DB ground truth provides `net_qty_per_each`, `each_per_box`, and `boxes_per_pallet`: [267-items-pack-hierarchy.sql:5](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/267-items-pack-hierarchy.sql:5).

Failure scenario: an order for 3 cases of 12 each is allocated and shipped as quantity 3 rather than 36 each—or its corresponding base weight. Shipment contents, LP depletion, BOL quantities, and traceability records all understate the physical goods.

Suggested fix: normalize order quantities to the item’s canonical inventory UOM using exact numeric pack factors before allocation, while retaining entered quantity/UOM for documents. Reject unsupported or incomplete hierarchy conversions.

## CLEAN areas verified

- SSCC minting uses an atomic per-org counter and validates prefix/capacity before increment: [459-generate-sscc-validate-before-increment.sql:17](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/459-generate-sscc-validate-before-increment.sql:17), [459-generate-sscc-validate-before-increment.sql:33](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/459-generate-sscc-validate-before-increment.sql:33).
- Stored SSCCs are constrained to 18 digits, unique per organization, and server-side mod-10 validated: [211-shipping-schema-foundation.sql:484](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:484), [211-shipping-schema-foundation.sql:486](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:486), [211-shipping-schema-foundation.sql:632](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:632).
- POD recording requires `ship.bol.sign`, validates signature input, calls the e-sign service before mutation, and permits only `shipped → delivered`: [ship-actions.ts:621](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:621), [ship-actions.ts:628](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:628), [ship-actions.ts:649](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:649), [ship-actions.ts:653](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:653).
- Pre-ship cancellation releases allocations and soft-voids box contents/boxes within the org-scoped transaction.
- Pack and ship both recheck active holds, QA release, and expiry.
- No `tenant_id` leakage found in the reviewed mutation paths.

## Not covered

- Scanner authentication/session internals beyond its reuse of the shared pack core.
- Carrier APIs, label-printer firmware, external SSCC registries, and physical scan validation.
- Finance/WAC correctness, including the excluded known currency-pool bug.
- UI parity, accessibility, translations, and pagination behavior.
- Live Supabase trigger inspection or runtime concurrency testing; this was a read-only static review and no test suite was executed.
- Unrelated warehouse receiving, counts, adjustments, transfers, and production genealogy except where directly involved in shipment traceability.
