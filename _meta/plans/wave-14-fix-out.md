Added real-Postgres rollback integration tests on `fix/wave14-imports` (commit `ahead 6`). No changes to import implementation or cores.

### New test files

**PO** — `purchase-orders/_actions/__tests__/import-po-rollback.pg.test.ts`
- Seeds org, site, active/blocked suppliers, items, RBAC (`planning.po.manage`)
- **all_or_nothing**: group 1 valid (SUP-A), group 2 hits **blocked supplier** at runtime → asserts failure response, `count(purchase_orders WHERE po_number = group1) = 0`, zero `import_export_jobs`
- **skip_invalid** contrast: group 1 committed in DB, group 2 in `failed[]`, import job persisted

**TO** — `transfer-orders/_actions/__tests__/import-to-rollback.pg.test.ts`
- Same seed shape (warehouses, items, `planning.to.manage`)
- Order 1 uses real `createTransferOrderCore` writes; order 2 forced `persistence_failed` via call-2 spy (TO core has no blocked-supplier analogue like PO)
- Same post-txn assertions for `transfer_orders` + `import_export_jobs`, plus `skip_invalid` contrast

Both gate on `const runPg = process.env.DATABASE_URL ? describe : describe.skip`.

### Verification

```text
# Without DATABASE_URL — parse + skip cleanly
Test Files  2 skipped (2)
Tests       4 skipped (4)

# Existing mock tests — still green
Test Files  2 passed (2)
Tests       18 passed (18)

# tsc
TypeScript: No errors found
```

Docker/Postgres wasn’t available locally, so the integration tests weren’t executed against a live DB here; they’ll run in CI when `DATABASE_URL` is set.

### Summary doc

Appended **## Fix round 1** to `_meta/plans/wave-14-summary.md`.
