# FALA 7 / FIX-NUM — raport (precyzja przyjęcia + WAC, 11 findingów)

Branch `main`. Testy **napisane, NIE uruchomione** (zakaz w specu — bramkę odpala orchestrator).
Nie uruchamiałem `tsc`, builda, migracji ani psql.

Zamknięte: N-1, N-2, N-3, N-4, N-5, N-6, N-7, N-8, N-9, N-11.
**Niezamknięte: N-10** — wymaga pliku należącego do równoległej rundy FIX-T1 (szczegóły niżej).

> ## ⚠️ DLA ORCHESTRATORA — bliźniak N-1 w plikach FIX-T1 (bramka będzie CZERWONA)
>
> Niezależny przegląd diffu znalazł **ten sam bug N-1 drugi raz**, na ekranie planowania:
>
> `planning/purchase-orders/_components/receive-po-line-modal.tsx:196`
> ```ts
> labels.errors[result.error]
>   .replace('{item}', line.itemCode ?? line.itemName ?? '—')
>   .replace('{uom}', line.uom),
> ```
>
> Szablon `wac_unresolved_uom` nazywa `{uom}` dwa razy → drugie wystąpienie leci do
> użytkownika jako dosłowne `{uom}`. **To realny bug produktowy**, nie tylko testowy.
>
> **Czerwony test:** `planning/purchase-orders/__tests__/po-receive-line.test.tsx:419`
> (`expect(alert.textContent ?? '').not.toMatch(/\{item\}|\{uom\}/)`). Test jest **poprawny** —
> czerwony jest komponent. Test korzysta z własnej atrapy etykiet (`:85`), więc czerwień jest
> **niezależna od moich zmian** (istniała przed nimi).
>
> **NIE naprawiłem** — `_components/**` to jawnie zakazany katalog rundy FIX-T1, a w drzewie
> roboczym widać, że FIX-T1 właśnie te pliki edytuje (doszły wymagane
> `PoLineModalLabels.errors.priceInvalid/priceRequired`). Edycja = konflikt.
>
> **Nie „naprawiłem" też testu** — osłabienie asercji, która łapie żywy bug, byłoby dokładnie
> antywzorcem z N-3, tylko w drugą stronę.
>
> **Łatka (identyczna z moim `fill()` z `po-receive.client.tsx:38`):**
> ```ts
> const values: Record<string, string> = {
>   item: line.itemCode ?? line.itemName ?? '—',
>   uom: line.uom,
> };
> setError(labels.errors[result.error].replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m));
> ```
> Spec N-1 mówi „napraw globalnie" — globalnie **w moim zakresie** jest zrobione (cały ekran
> magazynowy, wszystkie szablony). Ten jeden call-site leży u sąsiada.

---

## N-5 · Serwer NAPRAWDĘ importuje wspólny regex

To był sedno buga, więc pokazuję import dosłownie.

`apps/web/lib/warehouse/receive-po-line-core.ts` — nagłówek:

```ts
import { DECIMAL_QTY_RE, microToDecimal, toMicro } from '../shared/decimal';
```

i `parseDecimal` (dawniej trzymał własną kopię wzorca):

```ts
export function parseDecimal(input: string): bigint {
  if (!DECIMAL_QTY_RE.test(input)) throw new ReceivePoLineCoreError('invalid_qty', 400);
  return toMicro(input);
}

export const formatDecimal = microToDecimal;
```

Usunięte przy okazji: prywatne `DECIMAL_SCALE`/`DECIMAL_FACTOR` i ręczna implementacja
`formatDecimal` (ta lokalna renderowała liczby ujemne błędnie: `-1.5` → `1.-5`; wspólna
`microToDecimal` robi to poprawnie). Diff netto to **usunięcie kodu**, nie dopisanie.

**Dlaczego to nie kosmetyka:** dwie kopie były równe *dzisiaj*, ale dryf to zdarzenie
przyszłe. Dlatego test nie sprawdza tylko równoważności zachowań, ale też **strukturalnie**,
że w module nie ma już żadnego własnego wzorca dziesiętnego, który mógłby odjechać:

```ts
expect(SOURCE).toMatch(/import\s*\{[^}]*\bDECIMAL_QTY_RE\b[^}]*\}\s*from\s*'\.\.\/shared\/decimal'/);
expect(SOURCE.match(/\/\^.*\\d\{1,\d\}.*\$\//g) ?? []).toEqual([]);
```

**Uwaga o zakresie:** w repo jest jeszcze ~30 prywatnych kopii wzorców dziesiętnych
(`planning/work-orders`, `shipping`, `transfer-orders`, …) w skalach 3/4/6. **Nie ruszałem ich** —
część różni się skalą świadomie (kolumny mają różne `numeric`), a to nie para, która wywołała
R07-02. Zgłaszam do backlogu jako osobny tor.

---

## N-8 · Decyzja o zerowej ilości przy niezerowej wartości

### Fakty ze schematu (zweryfikowane w migracji, nie z pamięci)

`packages/db/migrations/199-finance-schema-and-rbac-seed.sql` — jedyna definicja tabeli,
**zero późniejszych `ALTER`**:

```sql
total_qty_kg  numeric(14, 3) not null default 0,
total_value   numeric(18, 4) not null default 0,
avg_cost      numeric(18, 6)
  generated always as (
    case when total_qty_kg = 0 then 0
         else round(total_value / total_qty_kg, 6)
    end
  ) stored,
```

**Korekta do treści findingu:** dzielenia przez zero **nie ma** — kolumna generowana ma
strażnika `case`. (Komentarz nad DDL i `packages/db/schema/finance.ts` twierdzą, że jest tam
`NULLIF`, co jest nieprawdą — przy zerowej ilości wychodzi `0`, nie `NULL`. Kod czytający
`avg_cost IS NULL` jako „brak puli" zobaczy prawdziwie wyglądające `0.000000`.)

Szkoda jest więc inna, ale **nie mniejsza**, i ma dwa etapy:

1. wartość osierocona przy `total_qty_kg = 0` raportuje się jako **koszt zerowy** — pula trzyma
   pieniądze i mówi, że nic nie waży;
2. **eksplozja przy następnym przyjęciu**: te same pieniądze dzielą się przez pierwszy gram,
   jaki wpadnie.

### Root cause

`WAC_COHERENT_FINAL_CTE` liczył spójność na **niezaokrąglonej** sumie:

```sql
case when coerced_qty = 0 then 0 else coerced_value end   -- coerced_qty = greatest(raw_qty_kg, 0)
```

a kolumna zaokrągla do 3 miejsc **po** CTE. Dla `raw_qty_kg = 0.0004`: `coerced_qty ≠ 0`
→ wartość zostaje → zapis kwantyzuje ilość do `0.000` → **qty 0, value 4.0000**.
Strażnik istniał i był napisany z dobrą intencją, tylko pytał o **złą liczbę**.

### Decyzja: NIEZMIENNIK „zero ilości ⇒ zero wartości", nie odrzucanie przyjęcia

Wybrałem drugą opcję ze specu. Uzasadnienie:

- **Niezmiennik jest jedynym, który chroni wszystkich wołających.** `upsertWac` woła nie tylko
  przyjęcie, ale też konsumpcja, wysyłka, inwentaryzacja, korekty i odwrócenia. Bramka
  na samym przyjęciu zostawiłaby pozostałe ścieżki nadal zdolne do osierocenia wartości.
  Jedna poprawka we wspólnej funkcji zamiast strażnika w każdym wołającym.
- **Odrzucanie przyjęć to droga, którą to repo już przerabiało i cofało.** `book-receipt-wac.ts`
  nosi komentarz z R07-03: blokada wolnej linii „protected nothing and only made the goods
  unreceivable". Blokowanie towaru stojącego na rampie z powodu 0,4 g to ten sam błąd.
- **Nie jest cicho.** Zaokrąglenie do skali składowania włączyłem także do flagi `clamped`,
  więc taki przypadek podnosi `FINANCE_WAC_UNDERFLOW` w outboxie z pełnym kontekstem
  (`delta_*`, `attempted_post_*`). Utracona wartość jest **zaraportowana**, nie połknięta.

Zmiana (3 fragmenty SQL, ta sama stała):

```sql
greatest(round(raw_qty_kg, 3), 0) as coerced_qty
```

Co **nie** uległo zmianie: zapisana ilość. `round(x, 3)` daje dokładnie to, co i tak zrobiłby
cast na `numeric(14,3)`. Zmienia się wyłącznie odpowiedź na pytanie „czy ilość jest zerowa?"
oraz flaga `clamped` — czyli obie rzeczy, które kłamały.

⚠️ Migracji `total_qty_kg → numeric(18,6)` **nie pisałem**, zgodnie ze specem.

---

## N-7 · Odwrócenie wie, czy wkład FAKTYCZNIE wszedł do puli

### Jak to naprawdę pękało

`warehouse/_actions/receipt-corrections-actions.ts:506-532` (plik **cudzej rundy — tylko czytałem**):

```
readWacContributionSnapshot(line.ext_jsonb)
  ├── snapshot jest      → odejmij snapshot                    ✔
  └── snapshotu brak     → FALLBACK: resolveWacDeltaQtyKg(dzisiejsza kartoteka)
                           × unit_price  → odejmij            ✘
```

`isWacExcluded` **nie jest tam wołane w ogóle** — stąd „marker martwy dla anulowania".
Przyjęcie zaksięgowane jako `{ wac_excluded: 'unresolved_uom' }` nie ma `wac_qty_kg`/`wac_value`,
więc leci w fallback, który przelicza jednostkę **wg kartoteki z dnia anulowania**. Jeśli ktoś
w międzyczasie uzupełnił `net_qty_per_each`, fallback **się udaje** i odejmuje wkład, którego
pula nigdy nie dostała. Bug staje się z czasem **coraz bardziej prawdopodobny**, nie mniej.

### Naprawa u źródła (w moich plikach, bez dotykania cudzego)

Nie da się tego naprawić w ścieżce anulowania — należy do FIX-T1. Ale da się **u źródła
snapshotu**, i spec sam na to wskazuje („snapshot w `grn_items.ext_jsonb` jest do tego
właściwym miejscem"). Reguła: **`bookReceiptWacAfterGrnItem` zawsze zapisuje snapshot i zawsze
mówi w nim prawdę o tym, co weszło do puli — choćby zero.**

```ts
// wkład nieksięgowany (wolna linia, nieprzeliczalna jednostka)
{ wac_excluded: 'unresolved_uom', wac_qty_kg: '0', wac_value: '0' }
```

Zero sprawia, że ścieżka anulowania **wchodzi w gałąź snapshotu** (bo oba pola są obecne),
neguje `0` i nie odejmuje nic. Fallback jest nieosiągalny. Marker zostaje dla `isWacExcluded`.

Drugi element: `upsertWac` raportuje teraz, **ile faktycznie wzięła pula**:

```ts
appliedQtyKg: microToDecimal(toMicro(base.totalQtyKg) - toMicro(base.availableQtyKg ?? '0')),
appliedValue: microToDecimal(toMicro(base.totalValue) - toMicro(base.availableValue ?? '0')),
```

(post − pre, w mikro-jednostkach; obie kolumny mieszczą się w skali 6, więc bez floata)
i `bookReceiptWacAfterGrnItem` snapshotuje `applied*`, nie to, o co prosił.

**Efekt uboczny — złapany dodatkowy wyciek:** przyjęcie 0.100125 kg zapisuje się w puli jako
`0.100`. Stary kod snapshotował `0.100125`, więc anulowanie odejmowało **więcej, niż kiedykolwiek
dodano**. Teraz snapshot to `0.1`.

---

## N-9 · Dlaczego cisza jest tu akceptowalna (z jednym wyjątkiem, który już nie jest cichy)

Zaokrągleń jest dwa, nie jedno:

| miejsce | skala | co się dzieje |
|---|---|---|
| `round($1/1000, 6)` w resolwerze | 1 mg | konwersja g→kg, wejście ≤6 dp nie traci nic |
| zapis `total_qty_kg` | 1 g | **tu ginie precyzja** |

**Przypadek zerujący ilość jest teraz GŁOŚNY** — po N-8 podnosi `FINANCE_WAC_UNDERFLOW`.

**Przypadek niezerowy zostawiam cichy** i uzasadniam:

1. To zaokrąglenie dotyczy wyłącznie **puli wyceny**, nie stanu magazynowego. Fizyczny towar
   siedzi na LP w `numeric(18,6)` — dokładnie. Użytkownik przyjmujący 100.125 g **ma** 100.125 g.
2. Nie ma żadnej akcji do podjęcia. Komunikat „zaokrąglono wycenę o 0,000125 kg" nie prowadzi
   do niczego, czego magazynier mógłby użyć — a jest to ekran, na którym każdy dodatkowy
   komunikat konkuruje o uwagę z ostrzeżeniami, które akcję mają.
3. Błąd nie kumuluje się kierunkowo: `round()` jest half-up, więc odchyłki znoszą się
   statystycznie zamiast dryfować w jedną stronę. Wartość (`numeric(18,4)`) nie jest
   zaokrąglana wcale — przesuwa się tylko `avg_cost` o ułamek grama na kilogram.
4. Prawdziwym rozwiązaniem jest poszerzenie kolumny do `numeric(18,6)` — osobny tor w backlogu.
   Dokładanie teraz komunikatu do UI utrwaliłoby narrację, którą ta migracja i tak usunie.

---

## N-1 · Interpolacja globalna

`po-receive.client.tsx` używał `String.replace('{uom}', …)` — **wzorzec stringowy podmienia
jedno wystąpienie**. Komunikat `wac_unresolved_uom` nazywa `{uom}` **dwa razy**, więc drugi
docierał do magazyniera jako dosłowne `{uom}`.

Naprawa globalna — jedna funkcja dla całego ekranu, nie łatka na jednym wywołaniu:

```ts
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
```

Przepięte **wszystkie** interpolacje na tym ekranie (`errors[*]`, `form.success`, `form.qtyHelp`,
`linesTitle`), nie tylko ta, która pękła — żeby dołożenie drugiego placeholdera do dowolnego
z tych szablonów nie odtworzyło buga.

---

## N-2 · Szablony ICU pobierane bez wartości

Zweryfikowane programowo (`json.load` + ścieżka klucza), nie greppem: przeskanowałem wszystkie
`t('…')` bez drugiego argumentu na `purchase-orders/[id]/page.tsx` i rozwiązałem je względem
`Planning.purchaseOrders` **we wszystkich czterech lokalizacjach**. Wynik: **10 wywołań**,
każde z placeholderami w en/pl/ro/uk:

| linia | klucz | placeholdery |
|---|---|---|
| 161 | `detail.receivedSummary.lines` | `{received}`, `{total}` |
| 171 | `detail.transitions.confirmPrompt` | `{po}`, `{status}` |
| 172 | `detail.transitions.cancelConfirmTitle` | `{po}` |
| 180 | `detail.reopen.confirmPrompt` | `{po}` |
| 181 | `detail.reopen.confirmTitle` | `{po}` |
| 210 | `edit.deleteLinePrompt` | `{line}` |
| 280 | `receive.modal.forLine` | `{item}` |
| 282 | `receive.modal.qtyHelp` | `{ordered}`, `{received}` |
| 292 | `receive.modal.success` | `{grn}`, `{lp}`, `{qty}`, `{uom}` |
| 306 | `receive.modal.errors.wac_unresolved_uom` | `{item}`, `{uom}` |

Wszystkie 10 → `t.raw(...)`. To **nie** jest obejście: te etykiety są celowo wypełniane dopiero
po stronie klienta (`labels.transitions.confirmPrompt.replace('{po}', …)`), bo wartości są znane
dopiero w momencie kliknięcia. `t()` odpala formatter ICU natychmiast, a szablon wywołany bez
wartości to błąd ICU — next-intl raportuje go i zwraca **ścieżkę klucza**, więc użytkownik
zobaczyłby `Planning.purchaseOrders.detail.transitions.confirmPrompt` w oknie potwierdzenia.
`t.raw()` (`use-intl@4.13.0`, `raw<TargetKey>(key): any`) zwraca szablon nietknięty.

`detail.transitions.cancelConfirmBody` **nie** wymaga zmiany — nie ma placeholderów w żadnej
lokalizacji, więc `.replace('{po}', …)` na nim w komponencie jest nieszkodliwym no-opem.

---

## N-6 · ro/uk ożywione dla ekranu magazynowego (weryfikacja programowa)

Sprawdzone `json.load`-em, ścieżką klucza tak, jak czyta ją strona:

- `Warehouse.receivePo.*` **nie istnieje w żadnym** z `i18n/{en,pl,ro,uk}.json`. Ekran
  magazynowy nie czyta JSON-ów w ogóle — czyta zaszyty `BUNDLE` w `wh-receive-labels.ts`.
- Tłumaczenia ro/uk tych komunikatów **istnieją**, ale pod
  `Planning.purchaseOrders.receive.modal.errors.*` — czyli dla **modala planowania**.
- `getWhReceiveTranslator` miał `locale === 'pl' ? BUNDLE.pl : BUNDLE.en` → dla `ro`/`uk`
  zawsze angielski.

Naprawa: `BUNDLE` dostał `ro` i `uk`, a wybór lokalizacji przestał być zaszyty:

```ts
const primary = (BUNDLE as unknown as Record<string, MsgTree | undefined>)[locale] ?? BUNDLE.en;
```

Bundle ro/uk są **celowo częściowe** — tylko te stringi, które w `i18n/{ro,uk}.json` są
naprawdę przetłumaczone (dwa komunikaty WAC). Reszta spada na `en` istniejącym mechanizmem
fallbacku per-klucz, dokładnie tak, jak repo trzyma częściowo przetłumaczone lokalizacje
(większość `ro`/`uk` w tych plikach to angielskie placeholdery).

**Świadomie NIE skopiowałem** ro/uk `over_receive_confirm_required` z planowania: ta treść mówi
„potwierdź w ekranie Magazyn → Przyjęcie zamówienia", co na samym ekranie magazynowym byłoby
instrukcją zapętloną.

---

## N-3 · Czerwony test statusu `full` — poprawiona ATRAPA, nie osłabiona asercja

**Dlaczego był gwarantowanie czerwony:** przy jednej linii, w pełni przyjętej, komponent
podmienia **całą tabelę** na akapit stanu pustego:

```jsx
{openLines.length === 0 ? <p data-testid="po-receive-empty">…</p> : <Table>…</Table>}
```

`po-receive-status-line-1` nie może wtedy istnieć — `getByTestId` rzuca, zanim jakakolwiek
asercja się wykona. **Test utrwalał stan ekranu, którego komponent nie potrafi wyprodukować.**
Błąd był w atrapie danych, nie w oczekiwaniach.

**Nic nie osłabiłem.** Wszystkie trzy oryginalne asercje zostają — plakietka FULL, brak przycisku
przyjęcia, wykluczenie z licznika otwartych — tylko na jedynym kształcie ZZ, w którym plakietka
jest w ogóle osiągalna (jedna linia pełna + jedna otwarta). Dołożone: otwarta linia **nadal ma**
przycisk, co dowodzi, że licznik mierzy otwartość, a nie pustkę. Wariant jednoliniowy dostał
własny test na stan pusty, więc oryginalne `Lines to receive (0)` też nie zginęło.

---

## N-4 · Prawdziwy powód odrzucenia

`1.1234567` to liczba **dodatnia**, a dostawała „Enter a quantity greater than zero."
Rozdzieliłem gałęzie i nazwałem prawdziwy powód (za dużo miejsc dziesiętnych):

```ts
const OVER_PRECISE_QTY_RE = /^\d+\.\d{7,}$/;
```

Nowy klucz `receivePo.errors.qtyTooManyDecimals` (en + pl; ro/uk przez fallback).
Test pilnuje obu kierunków: `1.1234567` → „6 decimal places" i **nie** „greater than zero";
`0` → nadal „greater than zero".

---

## N-11 · Test gramów, który dowodził odwrotności — przepisany

**Na czym polegało kłamstwo.** Atrapa resolwera odbijała ilość bez zmian:

```ts
return { rows: [{ qty_kg: String(params?.[0] ?? '0'), resolved: true }] };
```

więc test nazwany „books a gram-priced receipt" księgował do puli **100.125 kg** — tysiąckrotne
zawyżenie i dokładna odwrotność naprawy. Asercje sprawdzały tylko, że string `'g'` dotarł do
resolwera i że doszło do jednego upserta — **żadna nie dotykała przeliczonej ilości**, więc test
przeszedłby bramkę „dowodząc" czegoś przeciwnego.

**Jak jest teraz.** Atrapa wykonuje konwersję, ale **wyprowadza ją z SQL-a poddawanego testowi**,
więc nie jest to tautologia:

```ts
const declaresGramConversion = normalized.includes("= 'g' then round($1::numeric / 1000, 6)");
if (uom === 'g' && declaresGramConversion) {
  return { rows: [{ qty_kg: gramsToKgText(qty), resolved: true }] };
}
```

Jeśli ktoś usunie gałąź `g` z produkcyjnego zapytania, atrapa **przestaje konwertować** i test
pada — zamiast po cichu odbić surową liczbę i przejść. Na kodzie sprzed naprawy (gdy gałęzi `g`
nie było) `declaresGramConversion` jest `false` → `deltaQtyKg` to `'100.125'` → nowa asercja
`toBe('0.100125')` **failuje**. Dokładnie tak, jak wymaga spec.

Asercje dołożone: `deltaQtyKg === '0.100125'`, jawne `not.toBe('100.125')`, wartość
**nieprzeliczana** (≈ £1.99 = 100.125 g × £0.0199/g, nie £0.00199) oraz snapshot `wac_qty_kg`.

**Ta sama pułapka, dwa razy więcej miejsc — domknięta:**
- `BookReceiptWacMockClient` zwracał sumy puli bez kwantyzacji → dodałem `quantize(v, 3/4)`,
  bo inaczej moja własna asercja snapshotu twierdziłaby coś, czego prawdziwy Postgres nie robi;
- `coerceWacTotals` w `upsert-wac.test.ts` emulował klamrę spójności w JS **bez** zaokrąglenia
  do 3 miejsc → po N-8 atrapa rozjechałaby się z SQL-em. Dorobiłem `roundToPoolQtyScale`.

Niezmiennik N-8 testuję na **prawdziwym Postgresie** (`upsert-wac.pg.test.ts`), nie na atrapie —
to gwarancja SQL-owa i atrapa nie ma prawa być jej świadkiem.

---

## N-10 · Komunikat bramki PO — OSIĄGALNOŚĆ i dlaczego NIE zamknąłem

### Ścieżka osiągalności (potwierdzona)

1. Pozycja z jednostką bez przelicznika na kg — `l`/`ml`/`pallet`, albo `pcs` z pustym
   `net_qty_per_each`. Rozwijana lista jednostek linii ZZ oferuje wszystkie te kody
   (`purchase-orders/[id]/page.tsx:115`), a `items.net_qty_per_each` jest nullowalne.
2. Linia ZZ z tą pozycją i `unit_price > 0` (bramka celowo omija linie gratisowe).
3. ZZ w `draft`, użytkownik klika „Wyślij".
4. `WAC_RESOLVABLE_UOM_REQUIRED_TRANSITIONS = new Set(['sent', 'confirmed'])`
   (`_actions/actions.ts:428`) → `findUnvaluablePricedPoLines` zwraca linię.
5. Akcja zwraca (`actions.ts:1100-1105`):
   `{ ok:false, error:'line_uom_not_convertible', code:…, message: describeUnvaluablePoLines(…) }`
   np. `line 3 (OIL-001): UoM "l" has no conversion to kg for costing`.
6. **`_components/po-detail-view.tsx:427`:**
   ```ts
   setError(… labels.errors[result.error] ?? labels.errors.persistence_failed);
   ```
   `result.message` **nie jest czytane** — ani dla tego kodu, ani dla żadnego innego.

Bramka jest więc w pełni osiągalna i **ma** pokrycie testowe
(`actions.test.ts:555` — „refuses draft → sent when a priced line UoM cannot be converted to kg”).
Użytkownik dostaje sensowny, przetłumaczony komunikat ogólny; ginie wyłącznie **szczegół**
(numer linii, kod pozycji, brakujące pole kartoteki).

### Dlaczego nie „podpiąłem" ani nie „usunąłem"

- **Podpiąć** = edytować `planning/purchase-orders/_components/po-detail-view.tsx`. To katalog
  **jawnie zakazany** w specu (`_components/**`, runda FIX-T1). Nie ruszam.
- **Usunąć** = skasować `message` z tej jednej ścieżki. Odradzam i nie zrobiłem, bo:
  `message` **nie jest artefaktem tej bramki** — to ustalona konwencja, zwracana w **13 miejscach**
  `actions.ts` (`invalid_input`, `supplier_blocked`, `last_line`, `not_found`, …). Martwe jest
  **renderowanie**, nie ten jeden komunikat. Skasowanie akurat tego wywołania byłoby niespójne
  z dwunastoma pozostałymi, usunęłoby przetestowaną diagnostykę i zmusiło następną rundę do
  napisania jej od nowa — czyli byłoby regresją, nie sprzątaniem.

### Gotowa łatka dla właściciela FIX-T1 (jedna linia, `po-detail-view.tsx:427`)

```ts
const base = result.error === 'po_has_receipts' && to === 'cancelled'
  ? labels.transitions.cancelPoHasReceipts
  : labels.errors[result.error] ?? labels.errors.persistence_failed;
setError(result.message ? `${base} (${result.message})` : base);
```

Przetłumaczone zdanie zostaje zdaniem głównym (szczegół z `describeUnvaluablePoLines` jest
angielski i techniczny), a namiary na linię dochodzą w nawiasie. Rozwiązuje to `message`
dla **wszystkich** kodów naraz, nie tylko dla tej bramki.

---

## Testy (napisane, NIE uruchomione)

| plik | co przybyło |
|---|---|
| `lib/warehouse/receive-po-line-core.test.ts` | zgodność `parseDecimal` ↔ `DECIMAL_QTY_RE` na 23 wejściach w obie strony; `0.000600` (wejście R07-02); **strukturalny** brak własnego wzorca |
| `…/__tests__/po-receive-client.test.tsx` | oba `{uom}` wypełnione (licznik wystąpień); N-4 w obie strony; poprawiony test `full` + nowy test stanu pustego |
| `lib/finance/__tests__/book-receipt-wac.test.ts` | przepisany test gramów (`0.100125`, nie `100.125`); snapshot = wkład faktyczny; anulowanie wkładu nieksięgowanego odejmuje **zero**; anty-regresja: wkład realny nadal odwracany w pełni |
| `lib/finance/__tests__/upsert-wac.pg.test.ts` | **prawdziwy PG**: przyjęcie podgramowe → `0.000 / 0.0000 / 0.000000` + `clamped`; następny gram wycenia się na `10.000000/kg`, a nie `4010.000000/kg`; przyjęcie normalne nietknięte |
| `lib/finance/__tests__/upsert-wac.test.ts` | atrapa klamry dostała kwantyzację do 3 miejsc (zgodność atrapy z SQL-em) |

---

## Niezależny przegląd diffu — co z niego wyszło

Zamówiłem osobny, czytający przegląd całego diffu (typecheck / regresje testów / logika).
Typecheck: **czysto** — importy względne poprawne, brak osieroconych symboli po usunięciu
`DECIMAL_SCALE`/`DECIMAL_FACTOR`, a `PoReceiveLabels` konstruowany jest w **dokładnie dwóch**
miejscach i oba dostały `qtyTooManyDecimals`.

Przyjęte i naprawione:

| uwaga | co zrobiłem |
|---|---|
| `OVER_PRECISE_QTY_RE` łapał `01.1234567` (odrzucone za **wiodące zero**, nie za miejsca) | zawężony do `/^(?:0\|[1-9]\d*)\.\d{7,}$/` + test, że taki przypadek **nie** dostaje komunikatu o miejscach. To ten sam błąd co N-4, w miniaturze |
| komentarz przy klamrze mówił tylko, że flaga „mówi prawdę", przemilczając, że **wartość przepada** | komentarz przepisany: nazywa kompromis wprost i wskazuje migrację `numeric(18,6)` jako jego usunięcie |

Odnotowane, **świadomie nienaprawione** (poza 11 findingami, zmiana zachowania bez zlecenia):

- **`unit_price > 0` w bramce PO a `unit_price <> 0`** — recenzent sugerował, że ujemna cena
  omija bramkę. **Nieosiągalne:** migracja 262 ma
  `constraint purchase_order_lines_unit_price_nonnegative_check check (unit_price >= 0)`.
  Zostawiam `> 0`.
- **Wolna linia omija kontrolę waluty** (`book-receipt-wac.ts`): gałąź `!resolved` wychodzi
  przed `parsePoCurrencyCode`, więc gratisowa linia na ZZ w EUR przechodzi, gdy jednostka jest
  nieprzeliczalna, a jest odrzucana `unsupported_currency`, gdy jest przeliczalna. Niespójność
  **sprzed** mojej zmiany (dotknąłem tylko zapisu ext). Do backlogu.
- **`missingWacPackFactor` zgaduje `each_per_box` z kolumny, której nie SELECT-uje** — przy
  całkowicie brakującym wierszu pozycji poda mylące pole. Dotyczy wyłącznie tekstu
  diagnostycznego, który… i tak nigdy nie trafia na ekran (patrz N-10). Do backlogu razem z N-10.

## Czego NIE jestem pewien

1. **Nie uruchamiałem niczego.** Bramka to zweryfikuje. Największe ryzyko regresji widzę w
   `upsert-wac.test.ts` — dołożenie `roundToPoolQtyScale` do `coerceWacTotals` zmienia atrapę
   dzieloną przez ~40 testów. Przejrzałem oczekiwania: wszystkie ilości to `0` albo ≥ `0.001`,
   więc zaokrąglenie do 3 miejsc ich nie rusza, ale to przegląd wzrokowy, nie przebieg.
2. **`appliedQtyKg`/`appliedValue` liczę jako post − pre** z tego samego zapytania. Opieram się
   na tym, że CTE `existing` (`for update`, `materialized`) widzi stan sprzed upserta w tej samej
   migawce. Jestem tego pewien dla Postgresa, ale to założenie warte spojrzenia w review.
3. **`t.raw()` a `PoDetailLabels`** — `raw()` zwraca `any`, więc przypisania do pól `string`
   kompilują się bez tarcia, ale też bez kontroli typu. Gdyby któryś z tych 10 kluczy był
   w JSON-ie obiektem, a nie stringiem, dostaniemy obiekt do `.replace()` dopiero w runtime.
   Sprawdziłem programowo, że wszystkie 10 to stringi we wszystkich 4 lokalizacjach.
4. **Edytowałem dwa pliki spoza listy „Twoje pliki"**: `purchase-orders/[id]/page.tsx` (N-2 —
   nigdzie indziej tych wywołań nie ma) i `warehouse/receive-po/[poId]/page.tsx` (nowy klucz
   etykiety). Żaden nie jest na liście „NIE DOTYKAJ", ale pierwszy sąsiaduje z `_components/**`
   rundy FIX-T1 — jeśli tamta runda zmienia kształt propsów modala, warto zerknąć na styk.
5. **Skala 3 jest zaszyta jako `WAC_QTY_STORED_SCALE = 3`** w kodzie, a prawda leży w DDL.
   Gdy ruszy tor poszerzający kolumnę do `numeric(18,6)`, **trzeba zmienić tę stałą razem
   z migracją** — inaczej niezmiennik zacznie kwantyzować ostrzej niż kolumna. Zostawiłem to
   w komentarzu przy stałej.
6. **Nie sprawdziłem w przeglądarce**, że ro/uk faktycznie renderują nowe stringi — to wymaga
   uruchomionej apki. Weryfikacja była programowa (ścieżka klucza + mechanizm fallbacku).
