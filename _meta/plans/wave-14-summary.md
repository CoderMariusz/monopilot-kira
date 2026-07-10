# Wave 14 — Implementation summary (2026-07-10)

Branch: `fix/wave14-imports`

## Bug 1 (N-30, P1) — PO all_or_nothing import commits partial success

**Problem:** Runtime failures inside the write txn only accumulated into `failed[]` and returned normally, so `withOrgContext` committed earlier PO groups.

**Fix:** `commitPoImport` re-validates inside the write txn and throws `PoImportAllOrNothingError` on the first runtime failure when `mode === 'all_or_nothing'`. The error is caught at the action boundary and returned as `{ created: [], skipped: [], failed }` after rollback.

**Files:** `import-po.ts`, `po-import-errors.ts`, `import-po.test.ts`

**Test:** `commitPoImport all_or_nothing rolls back group 1 when group 2 fails at runtime` — group 2 `createPurchaseOrderCore` failure yields zero created POs and no import job row.

---

## Bug 2 (N-31, P1) — TO import used nested transactions

**Problem:** `import-to.ts` called public `createTransferOrder`, which opened its own `withOrgContext`, so the outer import txn could not roll back committed orders.

**Fix:** Extracted `createTransferOrderCore(ctx, input)` in `create-transfer-order-core.ts` (non-`'use server'` sibling). `createTransferOrder` wraps the core; the importer calls the core on the shared txn. Same `ToImportAllOrNothingError` throw pattern as PO.

**Files:** `create-transfer-order-core.ts`, `actions.ts`, `import-to.ts`, `to-import-errors.ts`, `import-to.test.ts`

**Test:** `commitToImport all_or_nothing rolls back order 1 when order 2 fails at runtime`.

---

## Bug 3 (N-32, P1) — PO import bypassed single-create zod limits

**Problem:** Import grouped payloads were not validated against `CreatePurchaseOrderInput` before `createPurchaseOrderCore`, allowing unbounded notes / line counts.

**Fix:** `import-po-schema.ts` runs `CreatePurchaseOrderInput.safeParse` per group and maps zod issues back to source row numbers/columns before calling the core.

**Files:** `import-po-schema.ts`, `import-po.ts`, `import-po.test.ts`

**Tests:**
- `commitPoImport rejects overlong notes via CreatePurchaseOrderInput with row-mapped errors` (3000-char note → `notes` column error, no insert).
- `commitPoImport rejects groups over 200 lines via CreatePurchaseOrderInput`.

---

## Bug 4 (N-55, P2) — Supplier block TOCTOU during PO create

**Problem:** `createPurchaseOrderCore` read supplier status without locking; a concurrent block could race the insert.

**Fix:** Supplier status check now uses `SELECT … FOR UPDATE` with non-reserved alias `supplier_row`.

**Files:** `create-purchase-order-core.ts`, `create-purchase-order-core.test.ts`

**Test:** `locks the supplier row with FOR UPDATE during the status check`.

---

## Bug 5 (N-62, P2) — Catch-weight variance blended multi-site rows

**Problem:** Roll-up grouped by `item_id` only and pinned `min(site_id)`, merging two-site items into one unrecoverable `(org,item,day)` row.

**Fix:**
- SQL aggregates `GROUP BY item_id, site_id`.
- Upsert conflict key is `(org_id, item_id, site_id, day)`.
- **Migration 477** (`477-catch-weight-variance-site-day-key.sql`) drops `catch_weight_variance_daily_org_item_day_uq` and adds `catch_weight_variance_daily_org_item_site_day_uq` with `NULLS NOT DISTINCT`. **Auto-applies on Vercel deploy.**

**Files:** `catch-weight-variance.ts`, migration 477, integration + unit tests.

**Test:** `two-site catch-weight item produces separate variance rows per site`.

---

## Bug 6 (N-63, P2) — Zero/missing nominal weighings silently dropped

**Problem:** Items with null/zero nominal were excluded from variance with no visibility.

**Fix:** Pre-query collects skipped `(item_id, site_id)` with reason `missing_nominal` | `zero_nominal`; returned on `CatchWeightVarianceSummary.skipped` and propagated through the cron route.

**Files:** `catch-weight-variance.ts`, `route.ts`, tests.

**Test:** `zero-nominal catch-weight weighings are reported as skipped, not silently omitted`.

---

## Verification

```bash
pnpm --filter web exec vitest run <import-po|import-to|create-purchase-order-core|catch-weight-variance.unit>.test.ts
pnpm --filter web exec tsc --noEmit
pnpm --filter web run build   # required after 'use server' export changes
```

Integration catch-weight tests skip without `DATABASE_URL`.

## Fix round 1

Reviewer gap (N-30 / N-31): mock-only rollback tests could not prove persisted rollback. Added real-Postgres integration tests gated on `DATABASE_URL`:

- `purchase-orders/_actions/__tests__/import-po-rollback.pg.test.ts` — group 1 valid, group 2 hits **blocked supplier** at runtime; `all_or_nothing` asserts zero `purchase_orders` rows for group 1 and zero `import_export_jobs`; `skip_invalid` contrast asserts group 1 committed + import job persisted.
- `transfer-orders/_actions/__tests__/import-to-rollback.pg.test.ts` — order 1 performs real inserts; order 2 forced `persistence_failed` via call-2 spy (TO core has no blocked-supplier analogue); same post-txn assertions for `transfer_orders` + `import_export_jobs`; `skip_invalid` contrast included.

No implementation changes to `import-po.ts`, `import-to.ts`, or cores. PG tests parse and skip cleanly without `DATABASE_URL`.
