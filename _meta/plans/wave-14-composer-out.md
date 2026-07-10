All six Wave 14 fixes are implemented on `fix/wave14-imports` in five logical commits. Summary:

### Bug 1 — PO `all_or_nothing` partial commit
`commitPoImport` re-validates inside the write txn and throws `PoImportAllOrNothingError` on the first runtime failure so `withOrgContext` rolls back. Test: group 2 failure leaves zero created POs.

### Bug 2 — TO import nested transactions
Extracted `createTransferOrderCore` (mirrors PO core). `import-to.ts` calls it on the shared txn; `createTransferOrder` wraps it. Same throw-on-failure pattern via `ToImportAllOrNothingError`.

### Bug 3 — PO import schema bypass
`import-po-schema.ts` runs `CreatePurchaseOrderInput.safeParse` per group and maps zod issues to source rows (notes 2000-char limit, 200-line cap, etc.) before calling the core.

### Bug 4 — Supplier block TOCTOU
`createPurchaseOrderCore` now uses `SELECT … FOR UPDATE` on the supplier row (`supplier_row` alias).

### Bug 5 — Catch-weight site blending
Variance SQL groups by `(item_id, site_id)`. **Migration 477** swaps the unique key to `(org_id, item_id, site_id, day)` with `NULLS NOT DISTINCT` — auto-applies on Vercel.

### Bug 6 — Silent zero-nominal drop
`CatchWeightVarianceSummary.skipped` reports `missing_nominal` / `zero_nominal` items; cron route propagates it.

### Verification
- 24 unit tests green (import-po, import-to, PO core, catch-weight unit)
- `pnpm --filter web exec tsc --noEmit` clean
- `pnpm --filter web run build` passed

### Commits
1. `aedf488a` — PO import throw + zod gate  
2. `2c748758` — `createTransferOrderCore`  
3. `1c065945` — supplier `FOR UPDATE`  
4. `07291bef` — catch-weight + migration 477  
5. `91ca1487` — `_meta/plans/wave-14-summary.md`

Per-bug detail is in [`_meta/plans/wave-14-summary.md`](_meta/plans/wave-14-summary.md).
