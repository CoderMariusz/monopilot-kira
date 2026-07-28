# FALA 7 / FIX-T1 — raport (cross-review P1×2 + P2×2)

Branch `main`. Testy **napisane, nieuruchomione** (zakaz w specu).

## P-1 — puste pole ceny odrzucone (nie ciche `'0'`)

**Decyzja:** puste pole na **rozpoczętej** linii = błąd `priceRequired`, przycisk zablokowany, brak zapisu.
Jawne `0` nadal przechodzi (świadomy wybór linii gratisowej).

Zmiana w `po-line-form-validation.ts`: na rozpoczętej linii `unitPrice.trim() === ''` →
`{ field: 'unitPrice', reason: 'required' }`. Usunięto `l.unitPrice.trim() || '0'` z payloadu
w `create-po-modal.tsx` i `po-line-modal.tsx`.

## P-2 — `validLines` nie wycina linii po cichu

**Źródło:** `po-line-form-validation.ts` + `getAllPoLineFieldErrors()` / `getCompletePoLines()`.

| mechanizm | rola |
|---|---|
| `isPoLineStarted()` | rozróżnia wiersz pusty vs wypełniany |
| `getPoLineFieldErrors()` | zwraca listę `{ field, lineNo, reason }` per rozpoczęta linia |
| `hasInvalidStartedPoLine()` | `disabled` na przycisku create/save |
| `getCompletePoLines()` | **tylko** kompletne, poprawne linie trafiają do akcji |
| `if (hasInvalidStartedLine) return` | anty-bypass Enter przy wyłączonym przycisku |

Komunikaty przy polach (`data-testid="create-po-line-*-error"`) z numerem linii
(`Line {line}: …` w i18n).

### Jak rozróżniam „wiersz pusty" od „wypełniony błędnie"

Wiersz jest **rozpoczęty** (`isPoLineStarted`), gdy operator dotknął **jakiegokolwiek**
pola poza domyślnymi wartościami fabrycznymi:

- wybrano pozycję (`item`), **lub**
- `qty` niepuste, **lub**
- `uom` niepuste, **lub**
- `unitPrice` niepuste, **lub**
- `taxPct` ≠ `''` i ≠ `'0'`

Wiersz **pusty** (domyślny `makeLine()`: brak itemu, puste qty/uom/cena, tax=`'0'`)
**nie jest walidowany** i nie blokuje submitu. Trailing pusty wiersz po kompletnej
linii 1 → create przechodzi tylko z linią 1 (test antyregresji).

Wiersz **wypełniony błędnie** = rozpoczęty + choć jedno pole nie spełnia reguł →
błąd przy polu + `hasInvalidStartedLine` blokuje przycisk.

## P-3 — cena jednostkowa zawsze 4 miejsca

`po-detail-view.tsx`: osobny `formatUnitPrice()` z
`minimumFractionDigits: 4, maximumFractionDigits: 4` tylko dla kolumny unit price.
`formatMoney()` (min 2 / max 4) zostaje dla line total i sum.

## P-4 — plik testów

`__tests__/po-price-precision.test.tsx` — **13 testów** (było 11; dodano blank-price,
invalid-qty, trailing-blank-row, blank-price w PoLineModal; zaktualizowano 4-dp padding).

Scenariusze ze specu:

- puste pole ceny → odrzucone ✓
- błędne qty → przycisk zablokowany, komunikat z linią i polem ✓
- pusty nierozpoczęty wiersz → nie blokuje ✓
- `0.0199` i jawne `0` → przechodzą ✓

## Czy zostaje ścieżka, którą wadliwa linia może cicho zniknąć?

**Nie w UI create/edit.** `getCompletePoLines()` wysyła wyłącznie kompletne linie;
przycisk jest zablokowany, dopóki jakakolwiek rozpoczęta linia ma błąd — więc
operator nie może „myśleć, że zamówił" linię z błędnym qty/UoM/ceną/podatkiem.

Jedyna droga do PO bez takiej linii: operator **sam** poprawia lub usuwa wiersz
(przycisk remove) — to jawna akcja, nie cicha filtracja przy submit.

**Poza zakresem tego patcha** (nie dotykane): import PO (`import-po.ts` → `price ?? 0`),
serwer przy braku ceny w payloadzie — to osobne tory.

## Zmienione pliki

- `_components/po-line-form-validation.ts` — **nowy**, wspólna walidacja
- `_components/create-po-modal.tsx` — P-1 + P-2, błędy per pole
- `_components/po-line-modal.tsx` — P-1, ta sama walidacja jednoliniowa
- `_components/po-detail-view.tsx` — P-3 `formatUnitPrice`
- `page.tsx`, `[id]/page.tsx` — nowe klucze i18n
- `i18n/{en,pl,uk,ro}.json` — `priceRequired`, `linePriceInvalid`, `line*Invalid/Required`
- `__tests__/po-price-precision.test.tsx` — kompletny zestaw testów

Nie tknąłem: `warehouse/**`, `lib/finance/**`, `receive-po*`.

## Czego NIE jestem pewien

1. **Testów nie uruchamiałem** — harness ItemPicker/Select może wymagać drobnych
   poprawek przy pierwszym runie orchestratora.
2. **`purchase-orders.test.tsx`** ma uproszczone `errors: { …, ...errors }` bez nowych
   kluczy `linePriceInvalid` itd. — może wymagać uzupełnienia przy typecheck, jeśli
   ten plik kompiluje się ściśle z `CreatePoLabels`.
3. **Prefill ceny z supplier spec** nadal może zostawić pole puste, gdy brak ceny
   w masterze — wtedy operator musi wpisać cenę (lub `0`); to zamierzone, nie ciche zero.
