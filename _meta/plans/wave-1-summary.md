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
  app/[locale]/(app)/(modules)/warehouse/_actions/receipt-corrections-actions.test.ts
```
