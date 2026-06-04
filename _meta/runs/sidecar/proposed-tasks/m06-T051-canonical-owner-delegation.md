# PROPOSED STUB — m06 T-051: Make scanner production writes delegate to 08-production (canonical-owner fix)

> Status: PROPOSAL (not in manifest). Closes BLOCKER B4 for 06-scanner-p1.
> Type: retag of existing T-042 (+ verify T-039), not necessarily a new task.
> Depends: 08-production output/co-product/waste + consume services (cross-module contract).

## Why (HARD RULE violation)
Canonical owner: `wo_outputs` + `wo_waste_log` → **08-production**. Scanner T-042 AC currently says its endpoints directly "create … `wo_outputs` row" and "create `wo_waste_log`" (service `lib/services/production/scanner-output.ts`). That makes the scanner a SECOND writer of 08-production-owned tables → drift, double-write, broken cost-per-kg/OEE producer chain. Scanner is the UI trigger; 08-production owns the write.

Similarly T-039 consume-to-WO must restrict its own writes to the 05-warehouse LP side (LP transition + `stock_moves(consume_to_wo)` + `lp_genealogy(consume)` + `warehouse.material.consumed` outbox, after 09-quality **T-064** consume gate). WO-side counters (`wo_material_consumption`) belong to the WO owner (04/08) — delegate, don't own.

## Goal
Retag T-042 (and audit T-039) so scanner endpoints CALL the 08-production service for any wo_outputs/wo_waste_log/wo_material_consumption write, never INSERT/UPDATE those tables directly.

## Implementation contract
1. Rewrite T-042 implementation contract + ACs: output/co-product call `08-production` output service; waste calls `08-production` waste service. Scanner service only orchestrates (validate WO state, build payload, emit scanner audit) and delegates the canonical write.
2. Add red-line to T-042 + T-039: "Do not INSERT/UPDATE wo_outputs / wo_waste_log / wo_material_consumption directly — delegate to 08-production via its cross-module contract."
3. Verify 08-production task set EXPOSES the consumable services (output/co-product/waste/consume). If absent, raise a cross-module gap against 08.

## Acceptance criteria
1. Given scanner output runs, when inspected, then the wo_outputs row is created by the 08-production service (single writer), and scanner only created the LP + genealogy + scanner_audit_log + outbox.
2. Given scanner waste runs, when inspected, then wo_waste_log is written by 08-production, no LP created, no direct scanner INSERT into wo_waste_log.
3. Given consume-to-WO (T-039), when inspected, then warehouse owns the LP transition/stock_moves/genealogy + warehouse.material.consumed (post T-064 gate), and the WO-side counter update is delegated, not owned by scanner.

## Risk red lines
- Scanner must NOT own any wo_* canonical table write.
- material.consumed outbox emitted ONLY after 09-quality T-064 consume gate passes.
