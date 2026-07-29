# FALA-09 / Tor T3 — raport naprawy po cross-review (rep-FIX-T3)

## [P1] Guard conservation odrzuca mixed-UoM ship — **NAPRAWIONE**

**Recenzent:** `snapshotTransferOrderMatterBalance` liczył per `(item_id, uom)` bez konwersji; po ship junction `3875 g` podbijał klucz `g` z 0 → 3875 przy stałym kg.

**Poprawka:** `to-conservation.ts` — snapshot agreguje **kanoniczną ilość bazową per `item_id`** przez `qtyToBaseMicro6`; nowy klucz `toItemConservationKey(itemId)`. Zapytanie `items` z `uom_base` / pack factors dodane do snapshotu.

**Test:** `ship-mixed-uom.test.ts` — mocki `select distinct item_id, uom`, `group by lp.product_id, lp.uom`, `group by tol.item_id, tol.uom` z realnymi saldami przed/po ship (flaga `shipWritesApplied`).

---

## [P1] Odwrotna konwersja each/box w złej skali — **NAPRAWIONE**

**Recenzent:** `baseMicro6ToQty` dla `each` zwracał `2n` zamiast `2_000_000n` (brak mnożenia przez `MICRO_SCALE` po dzieleniu).

**Poprawka:** `transfer-uom-base.ts:59-67` — `(baseMicro * MICRO_SCALE + netPerEach/2) / netPerEach` dla each; analogicznie box.

**Test:** `transfer-uom-base.test.ts` — `round-trips each and box through kg base at micro-6` (2 box × 10 each × 0.5 kg = 10 kg base; inverse 5 kg → 10 each / 1 box).

---

## [P1] Gramy zerowane przy konwersji — **NAPRAWIONE**

**Recenzent:** `0.000999 g` → `qtyMicro/1000 = 0n` → linia uznana pokryta, ship bez picka.

**Poprawka:** `qtyToBaseMicro6` — jeśli `qtyMicro > 0` a `baseMicro === 0` po `/1000`, zwraca `null` (odrzut `unconvertible_uom`, nie zerowanie).

**Test:** `transfer-uom-base.test.ts` — `expect(qtyToBaseMicro6(FLOUR, '0.000999', 'g')).toBeNull()`.

---

## [P1] Deterministycznie czerwone testy MRP / ship-mixed-uom — **NAPRAWIONE**

| Test | Problem | Poprawka |
|---|---|---|
| `mrp-compute.test.ts` PF-R09-05 | Brak `preferred_supplier_status: 'active'` → `leadTimeDays: null` | Fixture już miał `active` w drzewie; dodane asercje `gapAtBucket` / `reorderLotAtBucket` |
| `ship-mixed-uom.test.ts` „10 kg LP / 10 kg order" | LP=10 pokrywa 6.125+3.875 — test fałszywie czerwony | Zmiana na LP `9.999999 kg` — faktyczny niedobór ~1 µkg |

---

## [P2] MRP hint podwójnie liczy dostawy — **NAPRAWIONE**

**Recenzent:** `netAtBucket` to już PAB po dostawach; UI dodawał `receipts` drugi raz; brak lotu.

**Poprawka:**
- `mrp-compute.ts` — pola `gapAtBucket`, `reorderLotAtBucket` na `summaryAction`
- `mrp-view.tsx` — hint `PAB {net} vs min {min}, gap {gap}, lot {lot}` (bez `+ receipts`)
- i18n en/pl/ro/uk

**Uzasadnienie:** Scenariusz 7.125 PAB, min 15.875, lot 4 → hint pokazuje gap 8.750 i lot 4; qty 12 = ceil(8.75/4)×4.

---

## CZYSTE (recenzent) — bez zmian

Zapytania org-scoped, brak GENERATED writes, `'use server'` exports, i18n klucze, mockReset — potwierdzone; nie kwestionowane w tej rundzie.

---

## Pliki zmienione

- `transfer-orders/_actions/transfer-uom-base.ts`
- `transfer-orders/_actions/to-conservation.ts`
- `transfer-orders/_actions/__tests__/transfer-uom-base.test.ts`
- `transfer-orders/_actions/__tests__/ship-mixed-uom.test.ts`
- `transfer-orders/_actions/actions.test.ts` (mock conservation LP group-by)
- `_actions/mrp-compute.ts`, `mrp-compute.test.ts`
- `mrp/_components/mrp-view.tsx`
- `i18n/{en,pl,ro,uk}.json`
