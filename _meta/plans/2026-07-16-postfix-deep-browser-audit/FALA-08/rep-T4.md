# FALA 8 / TOR T4 — rep-T4

**Scope:** R08-08 (expiry dashboard batch/status), R17-01 (scanner revisit already-received PO line)

## R08-08 · Expiry dashboard batch + status

### Fix
- `getExpiryDashboard` SQL now selects `lp.batch_number` and `lp.status as lp_status` alongside existing tier/expiry fields.
- Row mapping projects `batchNumber` and `status` from the read — no fabrication; null batch stays null (UI shows `—`).

### Files
- `warehouse/_actions/expiry-actions.ts` — SELECT + mapping (`batchNumber: row.batch_number`, `status: row.lp_status`)
- `warehouse/_actions/shared.ts` — `ExpiryDashboard` row type already carried `batchNumber` / `status` (T3 lane)
- `warehouse/expiry/page.tsx` — mapper already passes `r.batchNumber` / `r.status` (T3 lane; `daysFromNow` untouched)

### Tests (written, not run)
- `warehouse/_actions/expiry-actions.test.ts` — asserts SQL contains `lp.batch_number` / `lp.status as lp_status` and mapped rows
- `expiry/_components/__tests__/expiry-dashboard.test.tsx` — batch badge + status badge rendering

---

## R17-01 · Scanner revisit fully received PO

### Route chosen: **separate `alreadyReceived` response** (not widening `OPEN_PO_STATUSES` on read)

**Why:** `OPEN_PO_STATUSES` is shared with the write path (`receive-po-line-core.ts` `for update` lookup at L336). Adding `'received'` there would let `executeReceivePoLineCore` lock lines on closed POs and risk duplicate receipts. Read-only completed PO access uses a **second query** with `['received']` only inside `getScannerCompletedPurchaseOrder`, orchestrated by `lookupScannerPurchaseOrder`.

### Write path proof (untouched)
- `OPEN_PO_STATUSES` remains `['sent', 'confirmed', 'partially_received']` in `receive-po-line-core.ts:7`.
- `loadPoLineForUpdate` still filters `po.status = any($3)` with `OPEN_PO_STATUSES` at L336–339 — **no change**.
- `receiveScannerPoLine` → `executeReceivePoLineCore` — **no change** to status gates.
- Test: `receive-po.test.ts` — `write path still rejects receive on a fully received PO` asserts `po_line_not_found` and `lineLookup.params[2] === OPEN_PO_STATUSES`.

### API
- `lookupScannerPurchaseOrder`: open PO → `{ kind: 'open' }`; fully received → `{ kind: 'already_received', po }` with per-line `receiptLpNumber` from latest `grn_items` lateral join; missing → `{ kind: 'not_found' }`.
- `GET /api/warehouse/scanner/pos/[id]`: `alreadyReceived: true` on 200 for completed PO; `po_not_found` 404 only when neither open nor completed exists.

### UI
- `receive-po-lines-screen.tsx` — distinguishes `not_found` vs network `error` vs `already_received` (info banner + LP on lines).
- `receive-po-item-screen.tsx` — `readOnlyReceipt` view with LP + received qty; Receive disabled; skips destination-location fetch when `alreadyReceived`.

### Tests (written, not run)
- `lib/warehouse/scanner/receive-po.test.ts` — `lookupScannerPurchaseOrder (R17-01)` + write-path antiregression
- `receive-po-item-screen.test.tsx` — already-received revisit shows LP/qty, no Receive, no location fetch

---

## Not verified here
- Live browser revisit on Vercel after deploy (orchestrator gate).
- Partially received PO where individual line is complete but PO status is still `partially_received` — line-level read-only is driven by `receivedQty >= qty` on open PO response, not `alreadyReceived` flag.
- `warehouse/page.tsx` dashboard top-5 expiry strip still maps `batchNumber: null` — out of T4 file scope; expiry **page** is fixed.

## Commands for orchestrator
```bash
pnpm --filter web exec vitest run apps/web/app/\[locale\]/\(app\)/\(modules\)/warehouse/_actions/expiry-actions.test.ts
pnpm --filter web exec vitest run --config vitest.ui.config.ts "apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/_components/__tests__/expiry-dashboard.test.tsx"
pnpm --filter web exec vitest run apps/web/lib/warehouse/scanner/receive-po.test.ts
pnpm --filter web exec vitest run --config vitest.ui.config.ts "apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.test.tsx"
```
