# Static bug hunt: planning procurement/imports

## Findings

### P1 — PO `all_or_nothing` imports can commit successful groups alongside runtime failures

`all_or_nothing` aborts only when the preliminary validation reports an error. Validation runs in a separate `withOrgContext` transaction at [import-po.ts:85](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:85), followed by the write transaction at [import-po.ts:109](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:109).

Inside the write transaction, runtime lookup/create failures are appended to `runtimeFailed` and execution continues at [import-po.ts:133](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:133) and [import-po.ts:183](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:183). The callback then returns normally at [import-po.ts:199](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:199), committing previously created POs.

Failure scenario: validation succeeds; before commit, an item becomes inactive or a supplier disappears/becomes blocked. An earlier group is inserted, the later group becomes `failed`, and `all_or_nothing` returns a mixed created/failed result instead of rolling everything back.

Suggested fix: revalidate inside the write transaction and, in `all_or_nothing` mode, throw on any runtime failure so `withOrgContext` rolls back. Convert the thrown domain error to the import result outside the transaction.

### P1 — TO `all_or_nothing` imports commit each order in an independent transaction

The outer import transaction begins at [import-to.ts:107](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/import-to.ts:107), but each group calls the public `createTransferOrder` action at [import-to.ts:168](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/import-to.ts:168). That action opens its own `withOrgContext` transaction at [actions.ts:438](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:438) and returns after committing at [actions.ts:492](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:492).

Later group failures are merely accumulated at [import-to.ts:182](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/import-to.ts:182), and the import returns normally at [import-to.ts:199](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/import-to.ts:199). Rolling back the outer transaction cannot undo already committed TO transactions.

Failure scenario: group one commits successfully; group two hits a concurrent duplicate, deleted warehouse, or persistence failure. The caller selected `all_or_nothing` but group one remains permanently committed.

Suggested fix: extract a transaction-aware `createTransferOrderCore(ctx, input)` analogous to the PO core, use the outer import client for every group, and throw on the first runtime failure in `all_or_nothing` mode.

### P1 — PO import bypasses the runtime schema used by single-create

Single-create validates with `CreatePurchaseOrderInput.safeParse` at [actions.ts:456](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:456). That schema limits PO numbers to 80 characters, currency to exactly three characters, notes to 2,000 characters, and lines to 200 at [procurement-shared.ts:72](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/_actions/procurement-shared.ts:72).

Import validation checks none of those limits: after validating price/date, it returns success at [import-po.ts:257](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:257). Notes from every grouped row are concatenated without a length limit at [import-po.ts:400](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:400). The import then invokes `createPurchaseOrderCore` directly at [import-po.ts:168](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/import-po.ts:168); its TypeScript input type provides no runtime validation before insertion at [create-purchase-order-core.ts:158](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.ts:158).

The database columns are unconstrained `text` fields at [262-planning-purchase-orders.sql:10](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/262-planning-purchase-orders.sql:10), so malformed currencies, oversized references/notes, and groups exceeding 200 lines are persisted.

Suggested fix: construct the grouped payload and run `CreatePurchaseOrderInput.safeParse` before calling the core, mapping schema issues back to source rows.

### P2 — Blocking a supplier races with PO creation

PO creation checks supplier status using an unlocked read at [create-purchase-order-core.ts:169](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.ts:169), then inserts the PO later at [create-purchase-order-core.ts:183](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.ts:183).

Supplier status changes likewise read without `FOR UPDATE` at [suppliers/actions.ts:276](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_actions/actions.ts:276) and update at [suppliers/actions.ts:283](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_actions/actions.ts:283). The PO schema has only a supplier FK, not a blocked-status guard, at [262-planning-purchase-orders.sql:11](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/262-planning-purchase-orders.sql:11).

Failure scenario: PO creation reads `active`; another transaction changes the supplier to `blocked` and commits; PO creation then inserts successfully against the now-blocked supplier.

Suggested fix: lock the supplier row during the status check and coordinate supplier blocking with that lock, or enforce the invariant in a database trigger/function that checks the current supplier status atomically.

## CLEAN areas verified

- PO header edits lock the row and restrict both the pre-check and update to `draft`: [actions.ts:486](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:486), [actions.ts:505](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:505).
- PO status transitions use a server-side transition table, lock the header, and enforce receipt guards: [actions.ts:787](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:787), [actions.ts:885](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:885).
- PO reopening combines its receipt check with an atomic `NOT EXISTS` update guard: [actions.ts:821](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:821).
- Database uniqueness constraints close ordinary duplicate-number insertion races for PO and TO numbers: [262-planning-purchase-orders.sql:21](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/262-planning-purchase-orders.sql:21), [263-planning-transfer-orders.sql:22](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/263-planning-transfer-orders.sql:22).
- Supplier create/update inputs have runtime validation and supplier updates lock the row: [procurement-shared.ts:54](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/_actions/procurement-shared.ts:54), [suppliers/actions.ts:191](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_actions/actions.ts:191).
- Import lookups and writes consistently scope data through `app.current_org_id()`.

## Not covered

- UI rendering, accessibility, localization, pagination, and prototype parity.
- Receiving/GRN behavior beyond the status guards directly called by PO actions.
- Planning modules outside purchase orders, suppliers, `import-po`, and `import-to`.
- Live Supabase trigger inspection or concurrency execution; this was read-only static analysis.
- Test execution; no files or repository state were modified.
