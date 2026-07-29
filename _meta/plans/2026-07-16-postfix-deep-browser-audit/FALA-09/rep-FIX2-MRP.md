# FALA-09 RUNDA 2 — MRP: kształt wiersza podsumowania + atrapa `NoActiveSiteError`

## Diagnoza (poprzednia runda poszła w złą stronę)

Runda 1 **dodała pola do kodu** i częściowo przesunęła oczekiwania testów, ale nie rozstrzygnęła semantyki `dueDate` vs `bucketDate`. Testy padały dalej, bo:

1. **`dueDate` ≠ `bucketDate`** — `buildSuggestedAction` clampuje `dueDate` do `today`, gdy poniedziałek kubełka jest w przeszłości; `bucketDate` pozostaje faktycznym startem kubełka (poniedziałek ISO).
2. **`scheduledReceiptsAtBucket`** — pole tylko w testach; UI (`mrp-view.tsx`) go nie czyta.
3. **Mock `with-site-context`** — `mrp.ts` importuje `NoActiveSiteError`; atrapa go nie eksportowała → vitest padał przy ładowaniu modułu.

Matematyka qty (`12`, `20`) była poprawna — **nie ruszana**.

---

## Audyt pól `MrpSuggestedAction` na wierszu podsumowania (`actionScope: 'next_bucket'`)

| Pole | Kto czyta | Decyzja |
|---|---|---|
| `type` | UI (`mrp-view`), testy, routing planned order (`po`/`wo`) | **Zostaje** |
| `qty` | UI, testy, `mrp_planned_orders.quantity` | **Zostaje** |
| `dueDate` | UI (`mrp-due-*`), testy, planned order `due_date` | **Zostaje** — clamp do `today` gdy kubełek w przeszłości |
| `releaseDate` | UI (`mrp-release-*`), testy | **Zostaje** |
| `isLate` | UI (badge Late), testy | **Zostaje** |
| `supplierId` | testy, planned order `supplier_id` | **Zostaje** |
| `preferredSupplierIneligible` | testy PF-R09-04 (`blocked`/`inactive`) | **Zostaje** (nie na summary phased, ale na single-bucket) |
| `bucketDate` | UI (`mrp-bucket-*` „Need by bucket”), testy | **Zostaje** — zawsze poniedziałek kubełka akcji |
| `actionScope` | UI (`mrp-action-scope-*`), testy | **Zostaje** |
| `horizonSuggestedQty` | UI (`mrp-horizon-suggested-*`), test PF-R09-02 | **Zostaje** |
| `netAtBucket` | UI (`mrp-calc-*` hint `{net}`), testy | **Zostaje** |
| `gapAtBucket` | UI (`mrp-calc-*` hint `{gap}`), testy | **Zostaje** |
| `reorderLotAtBucket` | UI (`mrp-calc-*` hint `{lot}`), testy | **Zostaje** |
| `leadTimeDays` | UI (przy `earliestReceiptDate`), testy | **Zostaje** |
| `earliestReceiptDate` | UI (`mrp-earliest-*`), testy | **Zostaje** |
| `scheduledReceiptsAtBucket` | **tylko testy** — brak w `mrp-view.tsx` | **USUNIĘTE** z typu i `computeMrpPhased` |

`qty` na summary = qty **pierwszego kubełka z sugestią**; `horizonSuggestedQty` = suma horyzontu gdy większa (PF-R09-02).

---

## Zmiany w kodzie

### `mrp-compute.ts`
- Usunięto `scheduledReceiptsAtBucket` z typu `MrpSuggestedAction` i z budowy `summaryAction`.
- Bez zmian w nettingu / `ceilGapToLotMultiple` / qty.

### `mrp.test.ts` (mock)
- Dodano `MockNoActiveSiteError` (`vi.hoisted`) — klasa z `reason: 'no_active_site'`, `name: 'NoActiveSiteError'`, zgodnie z `lib/auth/with-site-context.ts:78-85`.
- Eksport w `vi.mock('…/with-site-context')` obok `withSiteContext`.

---

## Zmiany w testach (pełny kontrakt, bez rozluźniania qty)

### `mrp-compute.test.ts` — PF-R09-05
- `dueDate: today` (clamp), `bucketDate: week1` (poniedziałek kubełka).
- Dodano `releaseDate`, `isLate`, `earliestReceiptDate` (lead 9d, late).
- Usunięto `scheduledReceiptsAtBucket`.
- Zachowane: `qty: '12'`, `bucket1.qty === '12'`, `summary.net === '12.375'`, `minQty === '15.875'`.

### `mrp.test.ts` — `feeds reorder thresholds…`
- `bucketDate: bucketStart` (nie `dueDate`).
- Usunięto `scheduledReceiptsAtBucket`.
- Dodano asercję `earliestReceiptDate` w gałęzi late.
- Zachowane: `qty: '20'`, `netAtBucket`, `gapAtBucket`, warunkowe `releaseDate`/`isLate`.

### `mrp.test.tsx` (fixture PF-R09-05)
- Usunięto `scheduledReceiptsAtBucket`; dodano `gapAtBucket` / `reorderLotAtBucket` dla spójności z hintem UI.

---

## Werdykt

Jedna decyzja: **summary `suggestedAction` ma 12 pól używanych** (type, qty, dueDate, releaseDate?, isLate?, supplierId, bucketDate, actionScope, netAtBucket, gapAtBucket, reorderLotAtBucket, leadTimeDays?, earliestReceiptDate?, horizonSuggestedQty?) — opcjonalne zależnie od lead time / multi-bucket. Jedno pole (`scheduledReceiptsAtBucket`) usunięte jako martwe. Testy dopasowane do rzeczywistej semantyki dat, nie do błędnego założenia `bucketDate === dueDate`.
