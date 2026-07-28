# FALA 7 / TOR T3 — rep-T3

**[R07-03 · P1] Linie wycenione w `g` i `pcs` można zamówić, ale nie da się przyjąć**

Status: **naprawione**. Testy napisane, **nie uruchamiane** (bramka orchestratora po mnie).

---

## 1. Decyzja o `g` i o precyzji po konwersji

**`g` rozwiązuje się przez dokładne `÷1000` w `numeric` Postgresa, zaokrąglone do 6 miejsc.**

```sql
when lower($2::text) = 'g' then round($1::numeric / 1000, 6)
```

Dodane w **obu** resolverach w `apps/web/lib/finance/upsert-wac.ts` — item-master
(`resolveWacDeltaQtyKg`, źródło logów z prod) **oraz** snapshot WO
(`WAC_SNAPSHOT_QTY_KG_SQL`). Ten sam błąd siedział w obu; poprawka w jednym zostawiłaby
bliźniaka.

Dzielenie przez 1000 w `numeric` to przesunięcie przecinka — jest **dokładne**, nigdy
float. Liczby:

| wejście | kg (zwracane) | w puli `item_wac_state` |
|---|---|---|
| `100.125 g` (padło na prod) | `0.100125` | `0.100` |
| `789.125 g` (ilość z PO) | `0.789125` | `0.789` |
| `100.123456 g` (6 miejsc) | `0.100123` | `0.100` |

### Co przy wejściu z 6 miejscami → 9 po konwersji: **zaokrąglam, nie odrzucam**

Uzasadnienie — i **korekta założenia ze specu**:

1. **Kolumna docelowa to NIE `numeric(18,6)`.** `item_wac_state.total_qty_kg` jest
   `numeric(14,3)` (migracja 199:187, nigdy nie zmieniana — sprawdziłem wszystkie
   migracje). `(18,6)` mają *źródła*: `purchase_order_lines.qty` (mig 506) i
   `items.net_qty_per_each` (mig 502). **Realny sufit puli WAC to 3 miejsca = 1 gram**,
   nie 6.
2. Wobec tego pytanie „co przy 9 miejscach" jest wtórne: **nawet 6 miejsc nie dożywa do
   zapisu**. Odrzucanie przyjęcia z powodu ułamka miligrama, którego pula i tak nie
   przechowuje, odtworzyłoby dokładnie ten defekt, który naprawiam (da się zamówić, nie
   da się przyjąć).
3. **Zaokrąglenie jest spójne z tym, co produkcja robi dziś.** Ścieżka `each` już teraz
   generuje więcej miejsc niż kolumna: `7.5 each × 0.333333 kg = 2.4999975` → zapis
   `2.500`. Kwantyzacja przy zapisie to zastane, sprawdzone zachowanie — gramy nie są
   wyjątkiem, są tylko częściej używane do małych ilości.
4. `round(…, 6)` daje **deterministyczny łańcuch** (`'0.100125'`, zawsze 6 miejsc)
   zamiast `0.10012500000000000000` z gołego dzielenia. To ma znaczenie, bo ten łańcuch
   ląduje jako tekst w `grn_items.ext_jsonb.wac_qty_kg` i wraca przy odwracaniu.

**Explicite: 6 dp = 1 mg. Zaokrąglenie w dół/górę do miligrama, bez komunikatu, bez
odrzucenia.** Poniżej 0.5 mg gram-przyjęcie zwróci `0.000000` — patrz §5, punkt 2.

**Nie ruszałem** gałęzi `kg`, `each`, `box` — ani znaku. Dodałem tylko jedną gałąź `when`
przed nimi (dopasowanie po dokładnej równości `'g'`, nie może przechwycić `'kg'`).

---

## 2. Decyzja o `pcs` i gdzie dokładnie odrzucam

**Wybrałem odrzucenie przy PO, nie strategię WAC per-UoM.**

Dlaczego nie per-UoM WAC: `item_wac_state` jest z definicji pulą w kg (`total_qty_kg`,
`avg_cost` = wartość/kg, wszystkie rozchody liczą się w kg). Osobna pula per-UoM to
przebudowa całej wyceny — nieproporcjonalna do problemu i wprost sprzeczna z regułą
anty-regresji.

**Gdzie odrzucam:** `transitionPurchaseOrderStatus`
(`…/planning/purchase-orders/_actions/actions.ts`), przy przejściach **`sent` i
`confirmed`**, po sprawdzeniu dostawcy, **przed** `update … set status`.

Gatuję również `sent`, nie tylko `confirmed`, bo w tym stanie automacie `sent` = zamówienie
poszło do dostawcy (`draft → sent → confirmed`; `draft → confirmed` jest nielegalne).
`sent` to najwcześniejszy moment, w którym towar jest realnie zamawiany.

Nowy kod błędu: **`line_uom_not_convertible`**, `message` nazywa linię, item i **brakujące
pole kartoteki**:

```
line 2 (PKG-001): UoM "pcs" needs items.net_qty_per_each to convert to kg
line 3 (OIL-001): UoM "l" has no conversion to kg for costing
```

`missingField` rozróżnia `net_qty_per_each` / `each_per_box` / `kg_conversion` (brak
reguły przeliczenia w ogóle, np. litry — brak gęstości).

Etykieta i18n dodana we wszystkich 4 lokalizacjach + wpięta w `[id]/page.tsx`, żeby
komunikat **nie degradował się** do generycznego `persistence_failed` (`po-detail-view.tsx`
robi `labels.errors[error] ?? labels.errors.persistence_failed` — bez wpisu użytkownik
zobaczyłby „coś poszło nie tak"). `pl` przetłumaczone, `uk`/`ro` po angielsku — zgodnie z
tym, co już jest w tym bloku.

### Dowód, że to nie jest over-blocking

Bramka **wywołuje ten sam `resolveWacDeltaQtyKg`**, którego używa przyjęcie. Nie ma
zduplikowanego predykatu. Z tego wynika wprost: **bramka może odrzucić wyłącznie te linie,
które i tak zostałyby odrzucone przy przyjęciu.** Nie da się nią zablokować UoM, który
dziś działa. Dlatego reużyłem resolvera zamiast pisać zbiorcze SQL — rozjazd między
„można zamówić" a „można przyjąć" jest właśnie tym błędem.

Linie **bez ceny (`unit_price = 0`) są całkowicie pominięte** — `where pol.unit_price > 0`.

---

## 3. Rozjazd dokumentacji z kodem — **NIE jest zamierzony, naprawiony**

Komentarz przy `preflightReceiptWacResolvability` twierdził *„No-op when the PO line has no
unit price"*, a jedyną bramką było `if (!line) return`. Ponieważ `unit_price` jest
**NOT NULL DEFAULT 0**, `loadLineUnitPrice` zawsze zwraca wiersz → **no-op nigdy się nie
wykonywał**, a linia darmowa/zerowa była blokowana.

**Werdykt: defekt, nie intencja.** Rozstrzygający argument jest liczbowy: wkład takiej
linii do WAC to `qty × 0 = 0` wartości, a przy nierozwiązywalnym UoM również `0` ilości.
**Blokada broniła wyceny, która i tak by się nie zmieniła** — kosztem tego, że fizycznego
towaru nie dało się zaksięgować. To ten sam defekt co R07-03, tylko dla linii darmowych.

Naprawa (`book-receipt-wac.ts`): warunek rzucenia to teraz
`!resolved && !isZeroDecimalString(unitPrice)`. Dodatkowo w `bookReceiptWacAfterGrnItem`
linia darmowa z nierozwiązywalnym UoM zapisuje `ext_jsonb.wac_excluded = 'unresolved_uom'`
— istniejącą już konwencję, którą czyta `isWacExcluded`, żeby odwracanie wiedziało, że nie
ma czego cofać.

⚠️ **Czego świadomie NIE zmieniłem:** linia z ceną `0` i UoM **rozwiązywalnym** dalej
księguje ilość przy zerowej wartości, czyli **darmowy towar dalej rozcieńcza `avg_cost`**.
To poprawne zachowanie WAC i działająca ścieżka produkcyjna — nie tykam.

---

## 4. Ścieżki, których NIE ruszyłem (dowód braku over-blockingu)

- `kg` — wyrażenie i łańcuch wynikowy bez zmian (`'10.5'` → `'10.5'`).
- tożsamość `base`/`uom_base='kg'` — bez zmian.
- `each` (← `pcs`/`szt`/`ea`) z `net_qty_per_each` — bez zmian.
- `box` z `net_qty_per_each` + `each_per_box` — bez zmian.
- `normalizePieceUom` / `pieceUomToWacEach` (`lib/uom/piece.ts`) — **plik nietknięty**;
  `'g'` przechodzi przez nie bez zmian, więc trafia do SQL jako `g`.
- Zerowanie/klamry w `upsertWac`, `debitWac`, `creditWacAtAvgCost`, ścieżki odwrotek —
  nietknięte.
- Pliki zabronione (`create-po-modal.tsx`, `po-detail-view.tsx`, `receive-po-line-modal.tsx`,
  `receive-po-line.types.ts`, `receipt-corrections-actions.ts`, `grn-*`, `lp-actions.ts`) —
  **nietknięte**. Nie dodawałem też żadnej migracji.
- Przejścia `received` / `partially_received` / `cancelled` / `reopen` — **poza** zbiorem
  bramkowanym, bez zmian (bramka dotyczy tylko `sent`/`confirmed`).

**Znaleziona i naprawiona regresja w testach:** mock w `_actions/actions.test.ts` łapie
`from public.purchase_order_lines` i nie umiał odpowiedzieć na zapytanie resolvera →
istniejący test `draft → sent` **zacząłby padać** (resolver bez wiersza = `resolved:false`
= blokada). Dołożyłem do mocka gałąź sondy WAC + przełącznik `wacUomResolvable`, i test na
samą blokadę. To był jedyny istniejący test, który przechodzi przez nową bramkę
(`supplier_blocked` i nielegalne przejścia zwracają wcześniej).

---

## 5. Czego nie jestem pewien / co zostaje na osobny tor

1. **`total_qty_kg numeric(14,3)` to realne ograniczenie wyceny, nie tylko kosmetyka.**
   Przyjęcie `100.125 g` wchodzi do puli jako `0.100 kg`, ale wartość liczona jest z
   **pełnej** ilości (`100.125 × 0.0199 = 1.9925`) → `avg_cost` wychodzi `19.92` zamiast
   `19.90` (**+0.125 %**). Ten sam efekt istnieje dziś dla `each`/`box`. Rekomendacja:
   osobna migracja `numeric(18,6)` na `total_qty_kg` — **nie robiłem jej** (zakaz migracji
   w tym torze + kolizja numeracji z równoległymi torami + Vercel aplikuje migracje na
   żywej bazie w buildzie).
2. **Urwisko poniżej 0.5 g.** Gram-przyjęcie < 0.5 g da po zaokrągleniu `0.000000` przy
   niezerowej wartości. Strażnik w `upsertWac` porównuje łańcuch **przed** kwantyzacją, więc
   dla wejścia typu `0.4 g` (→ `0.000400`) się nie odpali: kolumna zapisze `0.000`, a
   wartość zostanie w puli bez ilości → generowany `avg_cost` = 0. **Nie naprawiałem** —
   wymaga strażnika świadomego skali kolumny, co dotyka wszystkich ścieżek (kg/each/box),
   czyli dokładnie tego, czego ten tor ma nie ruszać. Realność: trzeba przyjąć poniżej
   pół grama. Warto zrobić razem z punktem 1.
3. **Snapshot vs kolumna.** `grn_items.ext_jsonb.wac_qty_kg` trzyma wartość *przed*
   kwantyzacją do 3 miejsc, a pula *po*. Odwrotka odejmuje wartość ze snapshotu →
   mikro-dryf (klamra `greatest(…, 0)` go maskuje). Zastane i systemowe (dotyczy `each`/`box`
   tak samo), nie moje w tym torze.
4. **`uom_base = 'g'`** dalej nie jest obsługiwane dla `uom = 'base'` (gałąź `base` pyta
   tylko o `kg`). Nie wiem, czy takie itemy w ogóle istnieją — nie mogłem odpytać bazy
   (zakaz psql). Jeśli istnieją, to osobny, ten sam klasowo defekt.
5. **`l` / `L`** zostają nierozwiązywalne — bez gęstości nie ma poprawnej konwersji.
   Różnica jest taka, że teraz **odbijają się przy `sent`/`confirmed` z nazwanym powodem**,
   zamiast na rampie. Świadoma decyzja, nie przeoczenie.
6. **Nie uruchamiałem niczego** — ani testów, ani `tsc`, ani builda. Poprawności składni
   SQL i typów nie zweryfikowałem wykonaniem; bramka jest po stronie orchestratora.
   Największe ryzyko typów: nowy `import` w `'use server'` actions.ts i nowy klucz błędu w
   unii `PurchaseOrderError`.

---

## 6. Zmienione pliki

**Kod**
- `apps/web/lib/finance/upsert-wac.ts` — gałąź `g` w obu resolverach, stałe konwersji,
  eksport `isZeroDecimalString`.
- `apps/web/lib/finance/book-receipt-wac.ts` — no-op dla linii z zerową ceną, marker
  `wac_excluded`, wspólny `writeGrnItemWacExt`, bramka
  `findUnvaluablePricedPoLines` + `describeUnvaluablePoLines`.
- `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts` —
  kod `line_uom_not_convertible`, `WAC_RESOLVABLE_UOM_REQUIRED_TRANSITIONS`, bramka.
- `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/[id]/page.tsx` — etykieta.
- `apps/web/i18n/{en,pl,uk,ro}.json` — `errors.line_uom_not_convertible`.

**Testy (napisane, nieuruchomione)**
- `apps/web/lib/finance/__tests__/upsert-wac.pg.test.ts` — realny Postgres: dokładna
  arytmetyka `g` (3 przypadki, w tym wejście 6-miejscowe), anty-regresja `kg`/`each`/`box`,
  `l` dalej nierozwiązywalne, dowód kwantyzacji do `0.100` w puli.
- `apps/web/lib/finance/__tests__/book-receipt-wac.test.ts` — przyjęcie w `g`, no-op ceny
  zerowej (preflight + book + marker), anty-regresja darmowej linii w `kg`, 4 testy bramki
  PO z nazwanym brakującym polem.
- `apps/web/app/…/purchase-orders/_actions/actions.test.ts` — sonda WAC w mocku (naprawa
  regresji) + test blokady `draft → sent`.
