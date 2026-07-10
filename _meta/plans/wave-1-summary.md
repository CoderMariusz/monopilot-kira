# Wave 1 — WAC / money correctness summary

Branch: `fix/wave1-wac`  
Gates: `pnpm --filter web exec tsc --noEmit` ✅ | touched vitest files 78/78 ✅  
Schema migrations: **none** (no `exchange_rates` table exists; non-GBP PO receipts are rejected at booking time)

---

## Bug 1 (P0) — WAC currency pool asymmetry

**Root cause:** `bookReceiptWacAfterGrnItem` credited the PO currency pool while all debits defaulted to GBP (`WAC_VALUATION_CURRENCY_CODE`), so EUR receipts never drained on consumption.

**Fix:** Value all WAC in org base currency (GBP). Receipt booking now:
- Validates PO currency is seeded and equals `GBP`
- Rejects non-GBP POs with typed `unsupported_currency` (no FX data in schema to convert)
- Always calls `upsertWac` with `currencyCode: WAC_VALUATION_CURRENCY_CODE`
- Stores `wac_currency_code: 'GBP'` on `grn_items.ext_jsonb`

**Files:** `book-receipt-wac.ts`, `receive-po-line.ts`, `receive-po-line.types.ts` (warehouse + planning), `scanner/receive-po.ts`, `receipt-corrections-actions.ts`

**Tests:** `book-receipt-wac.test.ts` (GBP books to GBP pool; EUR → `unsupported_currency`), `upsert-wac.test.ts` (receive integration uses GBP; EUR PO → `wac_unsupported_currency`), `receipt-corrections-actions.test.ts` (void uses GBP pool)

---

## Bug 2 (P1) — silent GBP fallback on receipt

**Root cause:** `normalizeCurrencyCode` silently defaulted missing/invalid PO currency to `'GBP'`.

**Fix:** Replaced with `parsePoCurrencyCode` that throws `BookReceiptWacError('unknown_currency')` when currency is missing or not a 3-letter code.

**Files:** `book-receipt-wac.ts`

**Tests:** `book-receipt-wac.test.ts` (`unknown_currency` for empty/invalid/unknown seeded codes)

---

## Bug 3 (P1) — reversals always hit GBP pool

**Root cause:** `applyConsumptionWacReversal` and `applyShipmentWacCancelCredits` omitted `currencyCode`, relying on the GBP default while receipts could land in foreign pools.

**Fix:** After Bug 1, all flows use GBP by construction. Explicitly pass `currencyCode: WAC_VALUATION_CURRENCY_CODE` on reversal upserts and on fallback debit lookup. Receipt void path (`receipt-corrections-actions.ts`) always reverses the GBP pool.

**Files:** `upsert-wac.ts`, `receipt-corrections-actions.ts`

**Tests:** `upsert-wac.test.ts` — `receipt credit and consumption debit share the same GBP pool`; `consumption reversal credits the same GBP pool as the original debit`

---

## Bug 4 (P1) — kg for WAC computed in JS float

**Root cause:** `resolveQtyKg` used `toBaseQty(...Number(qtyUnits)...).toFixed(3)` (binary float).

**Fix:** When `qtyUnits` + `unitsUom` are provided, `registerOutput` now calls `resolveWacDeltaQtyKg` (SQL `::numeric` conversion) and rejects with `uom_conversion_unavailable` when unresolved.

**Files:** `register-output.ts`

**Tests:** `register-output-uom.test.ts` (box→kg via SQL mock; unavailable box conversion rejects)

---

## Bug 5 (P1) — un-costed lines silently dropped from cost

**Root cause:** `material_costed` SQL used `else null` in the UoM CASE, so non-convertible consumption lines vanished from `SUM`.

**Fix:** `loadUnCostedConsumptionLines` preflight finds lines lacking `wac_value` that cannot be costed (UoM not convertible to kg or no `cost_per_kg`). Any hit returns `{ applied: false, excluded: 'un_costed', unCostedLines: [...] }`. `registerOutput` persists `wac_un_costed_lines` on `wo_outputs.ext_jsonb` when present. Piece aliases (`pcs`/`szt`/`ea`) included in costed CASE.

**Files:** `resolve-output-wac.ts`, `register-output.ts`

**Tests:** `resolve-output-wac.test.ts` (`reports un_costed consumption lines instead of silently understating WO cost`)

---

## Bug 6 (P2) — `pcs` not recognized by `resolveWacDeltaQtyKg`

**Root cause:** SQL only matched `each`/`box`/`kg`; canonical piece code is `pcs`.

**Fix:** Added `pieceUomToWacEach()` in `lib/uom/piece.ts` (reuses `normalizePieceUom` for `szt`/`ea` → `pcs` → `each`). `resolveWacDeltaQtyKg` normalizes UoM before the SQL query.

**Files:** `piece.ts`, `upsert-wac.ts`

**Tests:** `piece.test.ts` (`pieceUomToWacEach`), `upsert-wac.test.ts` (`maps canonical pcs` and `legacy szt/ea` to `each`)

---

## Test evidence (stdout tail)

```
Test Files  7 passed (7)
     Tests  78 passed (78)
```

Commands run:
```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec vitest run \
  lib/finance/__tests__/book-receipt-wac.test.ts \
  lib/finance/__tests__/upsert-wac.test.ts \
  lib/finance/__tests__/resolve-output-wac.test.ts \
  lib/uom/piece.test.ts \
  lib/production/output/__tests__/register-output-uom.test.ts \
  lib/production/output/__tests__/register-output-wac-valuation.test.ts \
  lib/production/output/__tests__/register-output-wac-un-costed.test.ts \
  app/[locale]/(app)/(modules)/warehouse/_actions/receipt-corrections-actions.test.ts \
  app/[locale]/(app)/(modules)/planning/purchase-orders/__tests__/po-receive-line.test.tsx \
  app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.test.tsx
```

---

## Fix round 1

Adversarial review verdict: **fail** → three required changes implemented.

### 1. Localized `wac_unsupported_currency` desktop/scanner receipt error

**Review finding:** Desktop receive returned `wac_unsupported_currency` but the modal label map and locales had no key, so users saw a generic error.

**Fix:** Added `wac_unsupported_currency` to `ReceivePoLineLabels.errors` and wired it through planning PO detail (`[id]/page.tsx`), warehouse desktop receive (`wh-receive-labels.ts` + `receive-po/[poId]/page.tsx`), and all four `i18n` locales (`en`/`pl`/`ro`/`uk`). Message explains that valuation requires GBP and that foreign-currency POs may be created/edited but cannot be received until FX is supported. Scanner `receive-po-item-screen` maps API `unsupported_currency` / `unknown_currency` codes to localized `scanner-labels` strings; RTL test added.

**EUR/PLN PO policy (documented):** Non-GBP PO creation/import remains allowed; receipt is blocked at WAC booking with an actionable error until FX conversion exists.

### 2. Bug 4 — retain `wo.uom_snapshot` for pack→kg conversion

**Review finding:** `resolveWacDeltaQtyKg` read current `items` pack metadata instead of the immutable WO snapshot.

**Fix:** Added `resolveWacDeltaQtyKgFromSnapshot` in `upsert-wac.ts` (SQL `::numeric`, snapshot params only). `registerOutput.resolveQtyKg` uses `snapshotFromItemRow(wo.uom_snapshot)` + the new helper. Tests: snapshot-vs-item-master regression (item master has different factors), decimal precision case (`7 × 3 × 0.3333 = 6.999`), mock asserts item-master SQL is never called for qty resolution.

### 3. Bug 5 — observable caller block for un-costed consumption

**Review finding:** `registerOutput` persisted `wac_un_costed_lines` in `ext_jsonb` after writes and returned success; no caller could warn or block.

**Fix:** Preflight `resolveOutputWacContribution` before any output/LP/stock writes; when `excluded === 'un_costed'` with lines, throw `ProductionActionError('wac_un_costed', 422, { unCostedLines })` so the transaction rolls back. Added `register-output-wac-un-costed.test.ts` proving no `wo_outputs` insert occurs. Updated valuation test: no-cost-basis path still succeeds without WAC booking (empty `unCostedLines` is not a hard block).

**Fix-round gates:** `pnpm --filter web exec tsc --noEmit` ✅ | 101/101 touched vitest tests ✅

---

## Fix round 2

Re-review verdict: **fail** → two remaining items implemented.

### 1. Romanian and Ukrainian `wac_unsupported_currency` translations

**Review finding:** `ro.json` and `uk.json` still contained the English message verbatim at `receive.modal.errors.wac_unsupported_currency`.

**Fix:** Replaced with native Romanian and Ukrainian strings preserving the actionable policy (GBP required for valuation; foreign-currency POs may be created/edited but cannot be received until FX conversion exists).

### 2. Lossless WO snapshot NUMERIC binds for pack→kg

**Review finding:** `resolveQtyKg` still routed snapshot factors through `snapshotFromItemRow` → `Number()` before SQL bind, and the precision test emulated PostgreSQL with JS float math.

**Fix:** Added `snapshotDecimalString` + `woSnapshotWacQtyFields` in `convert.ts`; `registerOutput.resolveQtyKg` now passes raw decimal strings directly to `resolveWacDeltaQtyKgFromSnapshot`. Updated `register-output-uom.test.ts` to capture and assert exact SQL bind parameters with a high-precision `net_qty_per_each` that changes under a JS-number round-trip; mock no longer uses `Number` arithmetic for snapshot conversion.

**Fix-round 2 gates:** `pnpm --filter web exec tsc --noEmit` ✅ | touched vitest (38 `.ts` + 20 `.tsx`) ✅

