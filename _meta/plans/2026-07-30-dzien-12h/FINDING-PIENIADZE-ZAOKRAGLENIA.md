# Audyt pieniędzy: zaokrąglenia i waluty — 30.07, 19:12

**12 miejsc sprawdzonych · 9 liczy POPRAWNIE · 3 defekty, wszystkie z JEDNEJ rodziny.**

Ta proporcja jest częścią wyniku, nie tłem. Arytmetyka pieniężna w tym repo jest
w większości zbudowana dobrze — defekt jest skupiony w jednym miejscu i ma jedną przyczynę.

## Defekty — wszystkie to ślepe sumowanie różnych walut

Dowód uruchomiony na `monopilot_t3` (insert → dokładne zapytanie z kodu → ROLLBACK).
Dwa zaległe zamówienia tego samego dostawcy: **1000 EUR + 500 GBP**.

```
AGING bucket=31-60 count=2 total_value=1500.0000
SPEND supplier total_spend=1500.0000000000 line_count=2
PER-CURRENCY EUR = 1000.0000000000  ·  GBP = 500.0000000000
```

**1500 to ani euro, ani funty.** Formatter interfejsu podpisuje tę liczbę tak:

```
UI (formatUsd) pokaze: $1,500.00
```

Dolarem — **w aplikacji, która nie ma ani jednej kwoty w dolarach**.

| # | miejsce | osiągalne z ekranu? | jak kłamie |
|---|---|---|---|
| 1 | `planning/actions/get-po-aging.ts:49-64` | TAK — pulpit Planowania (`PoAgingReport.tsx`) | goła liczba bez waluty |
| 2 | `reporting/_actions/report-read-actions.ts:1039-1054` | TAK — `/reporting` | **ranking dostawców sortuje po mieszance**, więc kolejność też kłamie |
| 3 | `reporting/_components/reporting-overview.client.tsx:234-239, 840` | TAK | `formatUsd` — **każda** kwota na ekranie, także jednowalutowa |

**Warunek wyzwolenia jest realistyczny, nie egzotyczny:** domyślna wartość kolumny `currency`
to `'GBP'`, a istniejące dane są w euro — wystarczy **jedno** zamówienie utworzone z domyślną
walutą. Szkoda rośnie z liczbą zamówień i nic nie krzyczy.

To **bliźniak defektu naprawionego dziś rano** (suma zamówienia sprzedaży w mieszanych walutach
pokazywana jako funty, commit `c316d6c9`). Ta sama rodzina, inna powierzchnia.

## Wzorzec naprawy istnieje w repo

`so-actions.ts:862-873`, naprawione dziś:
```sql
case when count(*) filter (where currency <> 'GBP') > 0 then null ...
```
**Kwota w mieszanych walutach to NULL, nie zmyślona liczba.** Ekran pokazuje brak wartości
zamiast fałszywej. Przeliczenie **nie jest opcją** — kursów walut w systemie nie ma w ogóle
(brak jakichkolwiek tabel przeliczeniowych; istnieją tylko `currencies` i `labor_rates`).

## Sprawdzone i liczące poprawnie — 9 miejsc

1. `po-line-price.ts` — netto/VAT/brutto: jedno zaokrąglenie do 4 miejsc, brutto = netto + VAT
   dokładnie → **suma nagłówka równa się sumie pozycji z konstrukcji**, nie przez przypadek
2. `sales-line-price.ts` — konwencja fakturowa, spójna z SQL
3. `so-actions.ts:860-876, 1177-1193` — mieszane waluty → **NULL** (naprawa z dziś, potwierdzona)
4. `lib/shared/decimal.ts` — bigint w mikro-jednostkach, half-away-from-zero, **zero floatów**
5. `book-receipt-wac.ts` — `numeric` w bazie, waluta inna niż GBP → **twardy wyjątek**;
   jednostka zawsze z linii zamówienia w obu ścieżkach (biurko i skaner)
6. `register-disassembly-output.ts:647-660` — podział kosztu: **ostatni wynik dostaje resztę**
   → suma części równa się całości z konstrukcji (kształt „podział bez reszty" obsłużony)
7. `receipt-corrections-actions.ts:507-512` — odwrócenie neguje pełny stempel, symetrycznie
8. `compute-waterfall.ts:312-356` — łańcuch kumulowany na **pełnej precyzji**, obcięcie tylko
   na wyjściu; bramka marży też na pełnej precyzji (kumulacja błędu obsłużona)
9. **Typy kolumn**: żadna kolumna kwotowa nie jest `real`/`double precision` — wszystkie
   `numeric`. Jedyne `int`/`bigint` to liczniki sztuk i minut. Ta klasa jest czysta na poziomie bazy.

## Czego audyt NIE ustalił

- Osiągalności gałęzi awaryjnej w SQL nagłówka zamówienia sprzedaży (podwójne zaokrąglenie,
  możliwa różnica **1 grosz**) — nie znaleziono ścieżki zapisu zostawiającej NULL, więc teoretyczne
- Szkody z `parseFloat` w `wip-cost.ts:63` — błąd rzędu 1e-10, **poniżej grosza**, nie wykazano
  widocznej różnicy. Odnotowane, nie zgłoszone jako defekt
- **Nie sprawdzone z braku czasu**: zwroty i reklamacje (`rma-actions.ts`), wycena MRP,
  wnętrze `upsert-wac.ts` (874 linie; testy sugerują arytmetykę na bigintach)
