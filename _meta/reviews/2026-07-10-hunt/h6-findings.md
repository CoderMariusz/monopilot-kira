# Production execution static bug hunt

No P0 findings. I found two P1 inventory/traceability defects.

## Findings

### P1 — Registering output into a caller-supplied LP does not update or validate LP inventory

Evidence:

- The public output endpoint forwards the request body unchanged: [outputs/route.ts:41](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts:41).
- `lp_id` is accepted from the caller: [register-output.ts:85](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:85).
- It is written directly onto `wo_outputs`: [register-output.ts:698](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:698).
- LP creation and quantity initialization happen only when `lpId` is absent: [register-output.ts:762](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:762).
- For a supplied LP, the only subsequent validation reads its location; it does not check product, UOM, status, QA state, WO ownership, or quantity: [register-output.ts:790](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:790).
- A receipt `stock_moves` row is nevertheless posted for the output quantity: [register-output.ts:803](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:803).

Failure scenario: a direct API caller supplies an existing LP belonging to another product or an already-consumed LP. The system records output and a positive receipt ledger entry against it, but `license_plates.quantity` remains unchanged. The authoritative LP balance and stock ledger then disagree, and the output may be linked to the wrong product/UOM.

Suggested fix: either reject caller-supplied output LPs, or lock the LP and enforce matching product/site/UOM/state before atomically incrementing its quantity. Add tests for wrong-product, consumed/blocked LP, UOM mismatch, and an existing-LP quantity increase.

### P1 — Output genealogy includes fully reversed consumption and records false per-parent quantities

Evidence:

- Parent selection groups every consumption row by `lp_id`, without excluding correction rows or requiring a positive net consumed quantity: [register-output.ts:345](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:345).
- Consumption reversals are represented as negative counter-rows rather than deleting the original: [reverse-consume/route.ts:284](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts:284).
- Every selected parent gets a genealogy edge whose `qty` is the complete output quantity, not that LP’s consumed contribution: [register-output.ts:566](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:566).

Failure scenarios:

1. Consume 10 kg from LP-A, reverse all 10 kg, then register output. LP-A remains an output parent even though its net contribution is zero.
2. Consume 2 kg from LP-A and 8 kg from LP-B, then register 9 kg of output. Both genealogy edges claim `qty=9 kg`, falsely representing 18 kg of parental contribution.

This corrupts recall and genealogy queries even though the LP inventory restoration itself succeeds.

Suggested fix: aggregate `sum(qty_consumed)` per LP, retain only parents with a positive net amount, and store a clearly defined contribution quantity on each edge. If output allocation across multiple parents cannot be inferred safely, omit edge quantity or introduce an explicit allocation rule rather than copying total output quantity to every parent.

## Clean areas verified

- Scanner consume serializes retries with an advisory transaction lock and checks the server replay record before mutation.
- Scanner consumption decrements LP stock conditionally and prevents `quantity` falling below `reserved_qty`.
- Scanner consumption requires LP product/substitute and UOM to match the WO material.
- Desktop consumption uses a deterministic transaction ID, advisory locking, and a unique consumption-ledger key.
- LP schema enforces nonnegative quantity, nonnegative reservations, and `reserved_qty <= quantity`.
- Scanner start, output, and waste actions use operation-scoped replay records.
- Output creation, generated LP creation, stock-move insertion, and outbox emission occur in one transaction.
- Scanner output pack/each conversion uses the WO’s snapshotted conversion factors and rejects missing factors.
- Reverse consumption locks the original consumption and LP, prevents negative `wo_materials.consumed_qty`, and uses correction uniqueness to prevent a second reversal.
- No files were modified. Existing untracked workspace files were left untouched.

## Not covered

- Live Supabase schema/trigger inspection; this was a static migration-grounded review.
- Runtime or targeted test execution.
- Planning, quality, finance/WAC internals, warehouse allocation, shipping, and technical/BOM modules except where directly called by production execution.
- UI presentation, accessibility, localization, and general RBAC beyond inventory mutation reachability.
- Changeover, labor, downtime, analytics, and OEE behavior.
- Disassembly output internals beyond identifying them as a separate path.
- Previously listed known bugs, which were intentionally not re-reported.
