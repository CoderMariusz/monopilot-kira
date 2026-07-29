# FALA-09 — naprawa czerwonych testów MRP (kształt `suggestedAction`)

## Problem z bramki

Oba testy padały na `toMatchObject`: ilości (`qty`) OK, ale **obiekt summary `suggestedAction` miał ~9 pól**, a oczekiwania tylko 2–5.

## Pola dodane w compute (wszyste zasadne — nie duplikaty)

Pola na `MrpSuggestedAction` dla **wiersza podsumowania** (`actionScope: 'next_bucket'`), żeby planista widział kontekst pierwszego kubełka vs pełny horyzont (PF-R09-02 / PF-R09-05):

| Pole | Znaczenie | Usunąć? |
|---|---|---|
| `actionScope` | Jawne: qty = następny kubełek, nie cały horyzont | Nie |
| `bucketDate` | Kubełek akcji | Nie |
| `netAtBucket` | PAB przed sugestią w tym kubełku | Nie |
| `gapAtBucket` | Głębokość niedoboru / luka do min (steruje lotem) | Nie |
| `reorderLotAtBucket` | `reorder_qty` użyty do zaokrąglenia | Nie |
| `scheduledReceiptsAtBucket` | Receipts w kubełku (np. PO w week2 przy BUY w week1) | Nie |
| `leadTimeDays` | Lead preferowanego dostawcy (`active`) | Nie |
| `earliestReceiptDate` | Gdy `isLate` — fizyczny przyjazd po clamp release | Nie |
| `horizonSuggestedQty` | Suma sugestii horyzontu gdy > pierwszy kubełek | Nie (osobny test PF-R09-02) |

**Żadne pole nie duplikuje `qty`** — `qty` pozostaje qty **pierwszego kubełka**; `horizonSuggestedQty` to suma.

## Naprawa testów (bez rozluźniania asercji)

### `mrp-compute.test.ts` — `PF-R09-05`

- Fixture: `preferred_supplier_status: 'active'` (bez tego `leadTimeDays` = null → czerwony test).
- `toMatchObject` rozszerzony o wszystkie pola summary powyżej + `dueDate`, `supplierId`.
- Nadal sprawdza: `bucket1.qty === '12'`, `summary.net === '12.375'`, `minQty === '15.875'`.

### `mrp.test.ts` — `feeds reorder thresholds…`

- Mock `reorder_thresholds` zwraca `preferred_supplier_status: 'active'` gdy jest `preferred_supplier_id` (domyślne dla fixture).
- `toMatchObject` rozszerzony o: `actionScope`, `bucketDate`, `netAtBucket`, `gapAtBucket`, `reorderLotAtBucket`, `scheduledReceiptsAtBucket`, `leadTimeDays`.
- Zachowane asercje: `type`, `qty: '20'`, `dueDate`, `supplierId`, warunkowe `releaseDate` / `isLate`.

### Dodatkowe (P2 cross-review)

- `expect(fgPlannedInsert[4]).toBe('9.000000')` — INSERT param, nie ręczny `conversionRows`.
- Nowy test `persists sub-thousand…` — `0.000001` kg przez `plannedInserts[4]`.

## Werdykt

Nie usuwaliśmy pól z kodu — są potrzebne do PF-R09-02/05. Testy zostały dopasowane do **pełnego kontraktu** `MrpSuggestedAction` na summary row, z zachowaniem dotychczasowych wartości ilości i dat.
