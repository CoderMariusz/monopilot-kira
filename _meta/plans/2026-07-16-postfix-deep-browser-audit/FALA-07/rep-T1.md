# FALA 7 / TOR T1 — raport (R07-01, R07-07 + hydration #418)

Branch `main`, bez uruchamiania testów/builda/tsc (bramka po stronie orchestratora).

## Decyzja: ODRZUCENIE, nie zaokrąglanie

Zgodnie z rekomendacją. Uzasadnienie w trzech punktach:

1. **Serwer już to waliduje poprawnie.** `PurchaseOrderLineInput.unitPrice` =
   `numeric4Schema` (`procurement-shared.ts:50`, regex `^\d+(?:\.\d{1,4})?$`).
   `0.005432` zostałoby odrzucone jako `invalid_input` — **klient zdążył podmienić
   wartość na `'0'` zanim serwer ją zobaczył**. Defekt był wyłącznie po stronie
   klienta, więc naprawa jest po stronie klienta; nie dodawałem drugiej warstwy
   walidacji tam, gdzie już jest.
2. Zaokrąglenie `0.005432` → `0.0054` też zmienia kwotę handlową bez zgody
   użytkownika, tylko ciszej (0,6 % na tej linii). Odmowa jest jedynym wariantem,
   który niczego nie przepisuje za operatora.
3. Wzorzec był obok: `qty` i `taxPct` na tych samych formularzach odmawiają.
   Cena była jedynym polem koercowanym.

### Co dokładnie się dzieje teraz

| wejście | przed | teraz |
|---|---|---|
| `0.005432`, `6.20000`, `1,50`, `-3` | cicho `£0.0000` | błąd **przy polu**, przycisk zablokowany, brak zapisu |
| `0.0199` (4 miejsca) | OK | OK (bez zmian — antyregresja) |
| jawnie wpisane `0` | `0` | `0` — realne zero, przechodzi |
| **puste pole** | `'0'` | `'0'` (bez zmian, patrz niżej) |

**Puste pole zostawiłem jako `'0'`** — to udokumentowane zachowanie
(`create-po-modal.tsx:299` „blank → '0' submit fallback preserved"), a finding
dotyczy *podmiany wpisanej wartości*. Nic nie zostało wpisane, więc nic nie jest
przekłamane. Gdyby cena miała być obowiązkowa, to osobna decyzja produktowa
(jedna linia w tym samym miejscu).

## Czy `validLines` faktycznie blokuje przycisk?

**Tak, ale nie przez sam `validLines`** — i to było celowe.

`validLines` to `filter`. Gdyby walidacja ceny weszła **wyłącznie** tam, linia z
błędną ceną zostałaby **po cichu wyrzucona** z zamówienia (przy ≥1 innej poprawnej
linii PO powstałoby bez niej) — czyli ta sama klasa cichej korupcji, tylko innym
kanałem. Dlatego zrobione są **trzy** rzeczy:

- `!isPriceInvalid(l.unitPrice)` **jest** w predykacie `validLines` (zgodnie ze specem),
- `hasInvalidPrice = lines.some(...)` → `disabled={pending || createBlocked || hasInvalidPrice}`
  — przycisk realnie zablokowany, dopóki *jakakolwiek* linia ma złą cenę,
- `if (hasInvalidPrice) return;` na wejściu do `onSubmit` — bo submit przez Enter
  potrafi ominąć wyłączony przycisk.

Analogicznie w `po-line-modal.tsx` (formularz jednoliniowy): `priceInvalid`
wyłącza `po-line-submit` i wychodzi z `onSubmit` przed jakimkolwiek zapisem.

Komunikat jest **przy polu** (`data-testid="create-po-line-price-error"` /
`po-line-price-error`, `role="alert"`, `aria-invalid` na inpucie), nie w banerze
u góry — baner byłby dodatkowym szumem przy komunikacie, który i tak jest widoczny
w wierszu. Błąd pojawia się **na bieżąco przy pisaniu**, nie dopiero po submitcie.

## R07-07 — precyzja na szczegółach PO

`po-detail-view.tsx` miał **dwie** funkcje formatujące pieniądze: `money()`
(`max 2`) użytą tylko dla ceny jednostkowej i `formatMoney()` (`max 4`) dla reszty.
Po ujednoliceniu skali `money()` stała się duplikatem — **usunięta**, wywołanie
`:519` przepięte na `formatMoney(l.unitPrice)`. `0.0199` renderuje się jako
`0.0199 GBP`, `3.4567` jako `3.4567 GBP`; `minimumFractionDigits: 2` dalej trzyma
`2.5 → 2.50`, więc zwykłe kwoty wyglądają jak kwoty.

## Hydration #418 (zadanie doniesione z innego toru)

Ta sama zmiana to naprawia. Oba miejsca (`:205-207` i `:363-365`) wołały
`toLocaleString(undefined, …)` w komponencie `'use client'`, który Next renderuje
też na serwerze — domyślny locale ICU Node'a rozjeżdżał się z locale przeglądarki
przy **każdej** komórce kwotowej. Po usunięciu `money()` zostało jedno miejsce
formatujące i dostaje **jawny `locale`** (prop komponentu), dokładnie jak `fmtDate`
tuż obok. Grep po pliku: zero pozostałych `toLocaleString`/`toLocaleDateString`
bez jawnego locale.

## Zmienione pliki

- `_components/create-po-modal.tsx` — `isPriceInvalid()`, `hasInvalidPrice`, gate w `onSubmit`,
  predykat `validLines`, payload `l.unitPrice.trim() || '0'`, błąd przy polu, `disabled`.
- `_components/po-line-modal.tsx` — to samo dla formularza jednoliniowego.
- `_components/po-detail-view.tsx` — usunięta `money()`, `formatMoney` z jawnym locale, 4 miejsca.
- `page.tsx`, `[id]/page.tsx` — przekazanie `create.errors.priceInvalid` do obu obiektów etykiet.
- `i18n/{en,pl,uk,ro}.json` — nowy klucz `Planning.purchaseOrders.create.errors.priceInvalid`
  (pl przetłumaczone; uk/ro dostały angielski, bo cały ten blok jest tam nieprzetłumaczony).
- `__tests__/po-price-precision.test.tsx` — **nowy**, 11 testów, **nieuruchomione**.

Nie tknąłem plików zajętych przez równoległe tory (`receive-po-line*`, `grn-*`,
`upsert-wac.ts`, `book-receipt-wac.ts`, `receipt-corrections-actions.ts`, `lp-actions.ts`).

## Czego NIE jestem pewien

1. **Nie uruchomiłem testów** (zakaz w specu). Ryzyko w moim nowym pliku jest w
   harnessie (ItemPicker/Select), nie w asercjach — wzorowałem się 1:1 na
   `purchase-orders.test.tsx:421-471`, ale to nadal kod niewykonany ani razu.
2. **`po-edit.test.tsx` wygląda na wcześniej czerwony, niezależnie ode mnie**:
   asercje `:247` i `:266` robią `toHaveBeenCalledWith({… unitPrice: '5.50' })`
   bez `taxPct`, a modal wysyła `taxPct` zawsze. Dlatego moje testy poszły do
   **osobnego pliku** — żeby nie mieszać. Warto to zweryfikować niezależnie.
3. **Skala 4 vs zaokrąglanie w Postgresie**: `numeric(12,4)` *zaokrągla* przy
   zapisie, nie rzuca błędem. Serwerowy `numeric4Schema` odrzuca wcześniej, więc
   dziś nikt tam nie dojdzie — ale gdyby jakaś inna ścieżka zapisu (import,
   API, akcja innego modułu) omijała ten schemat, cicha korupcja wróci inną drogą.
   Nie audytowałem pozostałych zapisów do `purchase_order_lines`.
4. **Sąsiedni bug, którego NIE naprawiałem** (poza zakresem findingu, celowo
   zgłaszam zamiast po cichu poszerzać diff): w `create-po-modal.tsx` linia z
   **błędnym qty / bez UoM / ze złym taxPct** nadal wypada z `validLines` po
   cichu — jeśli inna linia jest poprawna, PO powstaje **bez niej**, bez
   ostrzeżenia. To ta sama klasa co R07-01, innym polem. Kandydat na osobny finding.
5. **`toLocaleString(locale, …)` zakłada pełne ICU w Node**. Jeśli runtime
   Vercela nie ma danych dla `pl`/`uk`/`ro`, fallback na `en` wróci jako
   rozjazd hydracji — dokładnie to samo ryzyko, które od zawsze ma `fmtDate`
   obok. Zweryfikować w prod-konsoli po deployu (brak #418 na szczegółach PO).
