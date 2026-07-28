# FALA 7 / TOR T5 — raport GRN (R07-06, R08-04, R07-08)

## Zmiany w kodzie

| Plik | Zmiana |
|------|--------|
| `grn-actions.ts` | `rows.map((r) => mapGrn(r))` — naprawa R08-04; SELECT `coalesce(gi.supplier_batch_number, lp.supplier_batch_number)`; mapowanie `supplierBatchNumber` |
| `shared.ts` | Pole `supplierBatchNumber` w typie pozycji `GrnDetail` |
| `grn-detail.client.tsx` | Kolumna Supplier batch czyta `supplierBatchNumber ?? —`; nagłówek `Receipt lines ({count})` używa `grn.itemCount` zamiast `grn.items.length`; CSV eksportuje `supplierBatchNumber` |
| `grn-display.test.ts` | Testy akcji: itemCount z SQL (nie indeks), supplier batch, zgodność itemCount szczegółów |
| `grn-detail.test.tsx` | Testy UI: supplier batch `—` vs wartość, nagłówek z `itemCount` |

Testy **napisane, nie uruchamiane** (zgodnie z instrukcją toru).

---

## R07-06 — Supplier batch

### Czy LP/GRN mają kolumnę na batch dostawcy?

**Tak.** Oba mają `supplier_batch_number text`:

- `public.grn_items.supplier_batch_number` — schema `packages/db/schema/warehouse-waveb.ts:161`, migracja `193-warehouse-lp-transitions-grn-stock-spare-parts.sql:195`
- `public.license_plates.supplier_batch_number` — schema `packages/db/schema/warehouse-lp.ts:64`, migracja `191-warehouse-license-plates-fefo.sql:53`

### Co było złe

- `grn-detail.client.tsx` renderował `it.batchNumber` w **obu** kolumnach (Batch i Supplier batch).
- `getGrnDetail` nie czytał `supplier_batch_number` z bazy.
- Przepływ przyjęcia (`receive-po-line-core.ts`) **nigdy nie zapisuje** `supplier_batch_number` do `grn_items` ani `license_plates` — poza zakresem T5 (osobne zadanie: osobne pole w formularzu przyjęcia).

### Naprawa (minimum: przestać kłamać)

- SELECT: `coalesce(gi.supplier_batch_number, lp.supplier_batch_number)`.
- UI i CSV: `supplierBatchNumber ?? —` gdy brak osobnej wartości.
- Gdy tylko batch wewnętrzny istnieje → Batch pokazuje go, Supplier batch pokazuje `—` (zgodnie z LP detail i istniejącym eksportem CSV).

### Osobne zadanie (nie robione)

Dodać pole „Supplier batch / lot” do formularza przyjęcia PO i zapisywać do `grn_items.supplier_batch_number` + `license_plates.supplier_batch_number`.

---

## R08-04 — Licznik pozycji na liście GRN

### Przyczyna

`dataResult.rows.map(mapGrn)` przekazywał **indeks tablicy** jako drugi argument `itemCountOverride`. Dla wiersza o indeksie `0`: `0 ?? parseGrnItemCount(...)` → **`0`** (nullish coalescing nie pomija zera).

SQL lateral join był poprawny (`cancelled_at is null`).

### Kontrakt (która strona ma rację)

**Licznik = tylko aktywne (nieanulowane) linie** — to jest kontrakt już zapisany w:

- `shared.ts` komentarz przy `itemCount` (linie 181–185)
- SQL listy: `gi.cancelled_at is null`
- `getGrnDetail`: `liveItemCount = items.filter(cancelled_at == null).length`

Szczegóły **nadal renderują wszystkie wiersze** (w tym anulowane — audit trail), ale **nagłówek** `Receipt lines (N)` teraz używa `grn.itemCount` (aktywne), nie `grn.items.length`.

### Naprawa

Jeden token: `.map((r) => mapGrn(r))`.

Lista, szczegóły **i druk** (`grn-document.ts` / `mapGrnTotalsRows`) liczą aktywne linie spójnie (`cancelled_at is null` / `liveLineCount`). Recenzent potwierdził brak rozjazdu — wcześniejsza uwaga o `grn-print-view.tsx` była błędna.

---

## R07-08 — Hydracja React #418

### Pliki GRN (zakres T5)

Przeszukane `grns/**`, `grn-actions.ts`, `grn-list.client.tsx`:

- **Brak** `toLocaleString`, `Intl.*` bez locale, `Date.now()`, `Math.random()` w renderze.
- Daty: `receiptDate.slice(0, 10)` na ISO stringach — deterministyczne SSR/CSR.

**Wnioski:** komponenty GRN **nie są** źródłem #418. Nie wprowadzono poprawki hydracji w plikach GRN (brak jednoznacznego winowajcy w zakresie).

### Jednoznaczny winowajca poza zakresem T5 → przekazać do T1

`planning/purchase-orders/_components/po-detail-view.tsx` (`'use client'`, SSR-owany):

| Linia | Kod | Problem |
|-------|-----|---------|
| 206 | `value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` | `undefined` locale → Node en-US vs przeglądarka pl-PL |
| 364 | `Number(amount).toLocaleString(undefined, { … })` | to samo dla kwot linii PO |

Wzorzec poprawny w tym samym pliku (linie 199–203): `new Intl.DateTimeFormat(locale, { …, timeZone: 'UTC' })`.  
`po-list-view.tsx:184–186` — daty OK; tylko kwoty używają `undefined`.

**Mechanizm:** przeglądarka `pl-PL` → `1 234,56`; serwer Node → `1,234.56` → React #418 (text mismatch).

### Kandydaci wtórni (nie naprawiane, nie w torze PO-detail)

| Plik | Linie | Uwaga |
|------|-------|-------|
| `warehouse/_components/warehouse-dashboard.client.tsx` | 124, 241, 252 | `toLocaleString()` bez locale |
| `warehouse/expiry/_components/expiry-dashboard.client.tsx` | 222, 229 | to samo |

Nie występują na trasach PO/GRN z raportu audytu; możliwe osobne findingi.

### Co zrobić, żeby domknąć #418

1. **T1:** w `po-detail-view.tsx` zastąpić `toLocaleString(undefined, …)` helperem z jawnym `locale` (prop z RSC) — wzorzec jak `formatPoDate` w tym pliku.
2. Opcjonalnie: dev build bez minifikacji + `suppressHydrationWarning` tylko jeśli po T1 nadal są mismatchy.
3. E2E z locale `pl` na trasie `/planning/purchase-orders/[id]` i `/warehouse/grns/[id]` — GRN powinien być czysty po T1.

### Hazardy zgłoszone (nie naprawiane — poza diffem T5)

`po-detail-view.tsx:369–374` — porównanie `Number(l.receivedQty) >= Number(l.qty)` na `numeric(18,6)` oraz procent przez `Math.round` (precyzja float). Tor T1.

---

## Czego NIE jestem pewien

1. Czy #418 na trasie GRN wynika **wyłącznie** z nawigacji przez link PO w nagłówku GRN (ten sam bundle co PO) — stack produkcyjny tego nie rozróżnia; statycznie GRN sam w sobie jest czysty.
2. Kolejność wdrożenia pola supplier batch w formularzu przyjęcia vs migracja danych historycznych (obecnie wszystkie rekordy mają `supplier_batch_number = NULL`).
