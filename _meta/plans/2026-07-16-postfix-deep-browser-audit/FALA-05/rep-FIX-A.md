# FALA 5 / FIX-A — item master + import CSV (runda po cross-review)

Zakres: 5 zarbitrażowanych findingów [A-1]…[A-5]. Testy **napisane, nie uruchamiane**
(bramkę odpala orchestrator). Nie ruszałem `actions/users/**`, `settings/**`,
`technical/routings/**`, `technical/items/[item_code]/**`.

---

## [A-1 · P1] Poprawka unieważniała samą siebie — wartości poniżej skali zapisywały się jako zero

**Pliki:** `technical/items/_actions/shared.ts`, `_components/item-create-wizard.tsx`

### Co było
`nominalWeight/tareWeight/grossWeightMax` szły przez `OptionalNumeric`
(`z.coerce.number()`), a `refineItemInvariants` sprawdzał tylko `> 0`. Kolumny to
`numeric(10,4)`. `0.00001` → float dodatni → `> 0` przechodzi → Postgres zapisuje
`0.0000`. Czyli dokładnie to zerowe odniesienie, które R03-02 miało wyeliminować
(`register-output.ts` czyta `item.nominal_weight ?? '0'`).

### Co zmieniłem — **z użyciem istniejącego wzorca, nie nowego**
W tym samym pliku istniał już `NetQtyPerEachInput` + prywatny helper
`hasAtMostDecimalPlaces(value, maxDp)` (dla `numeric(18,6)`). Nowy `WeightInput`
jest **kopią tego kształtu**, tylko z inną skalą — ten sam helper, ten sam układ
`union → transform(String) → refine(regex) → refine(hasAtMostDecimalPlaces)`:

```ts
const MAX_WEIGHT_DP = 4;
export const WeightInput = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: 'weight must be a non-negative decimal' })
  .refine((v) => hasAtMostDecimalPlaces(v, MAX_WEIGHT_DP), { message: '…at most 4 decimal places…' });
```

`hasAtMostDecimalPlaces` jest teraz wołany z **dwóch** miejsc (net_qty 6 dp, wagi
4 dp) — jeden wzorzec walidacji miejsc dziesiętnych, nie dwa.

### Dlaczego to faktycznie naprawia
1. **Wartość poniżej skali staje się niereprezentowalna.** Przy ≤ 4 miejscach
   najmniejsza dodatnia wartość *to* `0.0001`. Osobna reguła „odrzuć < 0.0001" nie
   jest potrzebna — jest konsekwencją limitu miejsc, więc nie da się jej rozjechać
   z limitem. `0.00001` (5 dp) leci nazwanym błędem, `1e-7` nie przechodzi regexu.
2. **Wagi są teraz stringami dziesiętnymi end-to-end.** Kreator wysyła
   `decimalStringOrUndefined(...)` (dokładny tekst użytkownika) zamiast
   `numOrUndefined(...)`; schemat zwraca string; `create-item.ts`/`update-item.ts`
   bindują `$n::numeric`. Nigdzie nie ma round-tripu przez float.
3. **Porównanie dokładne.** `grossWeightMax < nominalWeight` liczone przez
   `toMicro()` z `lib/shared/decimal.ts` (bigint mikro-jednostki — istniejący
   moduł repo, nie nowy), nie przez `<` na floatach. Kreator używa tego samego
   `toMicro` po stronie klienta.
4. **Klient nie wpuszcza już sub-skalowej wagi do Review** (`isWeight` =
   `/^\d+(\.\d{1,4})?$/` + `> 0`), więc użytkownik nie dostaje generycznego
   `invalid_input` po round-tripie.

**Test:** `items-validation.test.ts` — `0.00001` (string i number, Create i Update)
odrzucone, z asercją na **konkretną treść** komunikatu; `0.0001` (dokładnie 4 dp)
przechodzi. `item-create-wizard.test.tsx` — `0.00001` blokuje Next do Review.

---

## [A-2 · P1] Import aktualizacyjny zerował poprawną kopertę catch-weight

**Plik:** `technical/items/import/_actions/commit-import.ts`

### Co było
Import pobierał z itemu tylko `id/kod/typ/nazwa/status`, a `updateItem` pisze
**wszystkie** kolumny bezwarunkowo. CSV bez `weight_mode` → przekazywane `fixed`
i brak wag → `nominal/tare/gross/variance` = NULL. Analogicznie kasowane były
shelf life, hierarchia opakowań, GTIN, opis, kategoria, cena.

### Co zmieniłem
`select` istniejących itemów rozszerzony o **wszystkie kolumny, które zapisuje
`updateItem`**, a payload update'u budowany jako patch: `CSV ?? stored`.

Naprawiam po stronie **callera** (`commit-import`), nie zmieniając semantyki
`updateItem` — kreator/edycja itemu wysyłają pełny stan formularza i mają
polegać na tym, że pusty = wyczyść. Zmiana `updateItem` na PATCH złamałaby
kasowanie pól z UI (i dotknęłaby `[item_code]/**`, którego nie wolno mi ruszać).

Efekty uboczne, świadome:
- `status: CSV ?? prior.status` (było `?? 'active'`) — import bez kolumny `status`
  nie próbuje już awansować draftu na active i nie generuje fałszywego
  `invalid_transition`.
- `weightMode: CSV ?? prior.weight_mode` — brak kolumny nie degraduje `catch` do `fixed`.

**Test:** prawdziwy `commitItemsImport` (zmockowany klient SQL) na istniejącym
itemie `catch` z pełną kopertą; CSV zmienia **tylko nazwę** → asercje na
parametrach realnego `update public.items`: `$6 weight_mode='catch'`,
`$12/$13/$14` wagi nietknięte, `$15` tolerancja, `$16/$17` shelf life, `$11` GTIN,
`$7` opis. Druga sprawa: CSV **z** `nominal_weight/gross_weight_max` faktycznie je
nadpisuje (patch nie jest „ignoruj CSV").

---

## [A-3 · P1] Jawny `catch` w CSV kończył się zielonym „Applied" bez błędu wiersza

**Pliki:** `lib/import/parse-items-csv.ts`, `import/_actions/{preview,commit}-import.ts`,
`import/_components/bulk-import-wizard.client.tsx`, `design/specs/TEC-014-bulk-import-csv.md`,
`apps/web/i18n/{en,pl,ro,uk}.json`

### 1. Kolumny
`OPTIONAL_HEADERS` + `ParsedItemRow` dostały `nominal_weight`, `gross_weight_max`,
`variance_tolerance_pct` (trzymane jako **tekst dziesiętny**). Spec TEC-014 §2
zaktualizowany: trzy nowe wiersze tabeli + reguła „update = PATCH" + reguła
„kompletność catch waliduje się w kroku 2, nie przy commicie".

### 2. Walidacja per wiersz PRZED Confirm
Nowe `validateCatchEnvelope(row, prior)` w parserze, wołane z `validateRow`:
- nieznany `weight_mode` → błąd na kolumnie `weight_mode` (wcześniej w ogóle
  niewalidowany — leciał do `createItem` jako cichy licznik);
- komórka wagi spoza `numeric(10,4)` → błąd **na tej kolumnie** (lustro [A-1]);
- tolerancja spoza [0,100] → błąd na `variance_tolerance_pct`;
- jeśli **scalony** wiersz jest `catch`: wymagane nominal > 0, gross > 0, obecna
  tolerancja, oraz gross ≥ nominal (porównanie na skalowanych bigintach).

**Kluczowe: walidacja idzie po widoku scalonym** (`CSV ?? stored`), tym samym
którym commituje [A-2]. Dlatego zmiana samej nazwy na istniejącym itemie `catch`
**nie** jest błędem (import zachowa kopertę), a wyzerowanie `nominal_weight` w CSV
**jest**. To nie jest over-blocking — preview odrzuca dokładnie to, co odrzuciłby
zapis. `diffItemsAgainstExisting` dostaje więc snapshot z kopertą
(`ExistingItemSnapshot`), a oba callery (`preview-import`, `commit-import`)
selectują `weight_mode, nominal_weight, gross_weight_max, variance_tolerance_pct`.

### 3. Dowód osiągalności — którędy błąd wiersza dociera do UI

| krok | co się dzieje |
|---|---|
| 1 | `updateItem`/`createItem` zwraca `{ok:false, error, message}` (`message` = JSON issues zod) |
| 2 | `commit-import` → `reject(row, res.error, res.message)` — **każda** odmowa, nie tylko transition |
| 3 | `describeRefusal()` parsuje JSON zod i wyciąga `path[0]` → `column` oraz `message` |
| 4 | push do `rowErrors` jako `{rowNumber, itemCode, column, code:'row_rejected', message}` |
| 5 | akcja zwraca `rowErrors` w `CommitImportResult` |
| 6 | klient: `setCommitRowErrors(res.rowErrors)` + `if (committed.errors > 0) setStep('validate')` |
| 7 | `validationRows` = issues preview **+** `commitRowErrors` zmapowane na ten sam kształt |
| 8 | tabela „Validation issues" renderuje `#{rowNumber}` · badge `error` · `column` · `message` |

Wcześniej łańcuch urywał się na kroku 2 (był tylko `errors += 1`), a krok 6 zależał
od `rowErrors.length`, które dla walidacji zawsze było puste.

Dodatkowo baner: `errors > 0` → `role="alert"`, `alert-red`, ⚠ i tytuł
`appliedWithErrors` („Import zastosowany z odrzuconymi wierszami") zamiast
zielonego „Applied". Klucz dodany do wszystkich 4 locale'i.

**Test:** parser — jawny `catch` bez koperty daje błędy na trzech nazwanych
kolumnach; sub-skalowa komórka, tolerancja 101, nieznany `weight_mode`,
przestawiona para gross/nominal — każde jako błąd preview; patch po nazwie na
stored-`catch` → **0 błędów**. UI — commit z `errors: 1` daje baner
`data-has-errors="true"`, bez klasy `alert-green`, plus wiersz `#7` z kolumną
`nominalWeight` i treścią błędu.

---

## [A-4 · P2] Pusty tekst tolerancji uznawany za świadome 0 %

**Plik:** `technical/items/_actions/shared.ts`

`z.coerce.number()` zamienia `''` na `0`, więc puste pole spełniało wymóg
obecności z R03-02 („`!== undefined`"). Wydzielony `emptyToUndefined` i nowy
`OptionalTolerancePct = z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional())`
— `''` staje się `undefined` **przed** ograniczeniem zakresu, więc R03-02 znów
widzi brak wartości.

**Anty-regresja:** jawne `0` **i** `'0'` przechodzą (0 % to legalna polityka) —
osobny test na Create i Update.

**Dodatkowo (ta sama pułapka, nieproszone, 1 linia):** `shelfLifeDays` miał
identyczny problem — `''` → `0` → R03-03 rzucał „0 dni" na itemie bez shelf life.
Ten sam preprocess. Test: `shelfLifeDays: ''` przechodzi; jawne `0` dalej odrzucane.

---

## [A-5 · P2] Kreator wpuszczał do Review tolerancję spoza zakresu serwera

**Plik:** `technical/items/_components/item-create-wizard.tsx` (+ `item-wizard-labels.ts`)

`catchComplete` sprawdzał dla tolerancji tylko `trim().length > 0`; `min`/`max` na
`<input type="number">` nic nie robi, bo Next nie odpala natywnej walidacji formularza.

Nowy `tolerancePctValid` wymaga **skończonej liczby w [0,100]** (kolejność
sprawdzeń chroni przed `Number('') === 0`). Komunikat leci **przy polu** —
`<Field help={...}>` nad inputem tolerancji (`data-testid="wiz-variance-error"`),
renderowany od razu po wpisaniu złej wartości, jeszcze przed kliknięciem Next.
`goNext`/`submit` pokazują ten sam, konkretny komunikat (`errors.tolerancePctRange`)
zamiast generycznego `catchHint`, gdy pole jest wypełnione, ale poza zakresem.

Nowy klucz labela ma angielski fallback przez istniejący helper
`get('create.errors.tolerancePctRange', D.errors.…)`, więc nie wymaga wpisu w i18n.

**Test:** `101` → komunikat przy polu, alert po Next, brak panelu Review, brak
wywołania `createItem`. Anty-regresja: `0` przechodzi do Review i **nie** pokazuje
błędu przy polu.

---

## Czego NIE jestem pewien

1. **Nie uruchamiałem niczego** — ani testów, ani `tsc`, ani builda (zgodnie z
   zasadami). Wszystkie „testy przechodzą" poniżej są *napisane*, nie zweryfikowane.
   Największe ryzyko typów: dyskryminowana unia `CommitImportRowError` w mapowaniu
   po stronie klienta oraz `z.preprocess(…, WeightInput.optional())`.
2. **Zmieniłem publiczny typ wyjścia schematów**: `nominalWeight/tareWeight/
   grossWeightMax` to teraz `string`, nie `number`. Przeszedłem grepem wszystkich
   konsumentów w `apps/web` + `packages` (kreator, create/update/list/get-item,
   testy) i poprawiłem asercje, ale konsument poza tym grepem (np. skrypt, seed)
   dostanie stringa.
3. **Testy RTL wpisujące ułamki w `<input type="number">`** — jsdom sanityzuje
   wartości pośrednie („0."). Asercję payloadu przepisałem na
   `typeof === 'string'` + `Number(...) === 0.25`, żeby nie zależeć od zachowanych
   zer końcowych, ale nowe testy typujące `0.00001` zakładają, że jsdom zachowa
   pełny tekst (istniejące testy sugerują, że tak).
4. **Luka „nieświeży preview"**: jeśli między preview a commitem dane w bazie się
   zmienią, serwerowy re-parse może znaleźć błąd wiersza, którego nie ma w preview
   klienta — baner będzie wtedy czerwony i uczciwy, ale bez wiersza w tabeli
   (nie pchałem błędów preview do `rowErrors`, bo w normalnym przepływie
   duplikowałyby wiersze już widoczne). Nie zamykam tego świadomie.
5. **Legacy rows a patch**: item ze stored `shelf_life_days = 0` albo
   `uom_secondary = uom_base` (dane sprzed reguł) przy imporcie zmieniającym samą
   nazwę zostanie teraz **odrzucony** przez R03-01/R03-03, zamiast — jak wcześniej
   — po cichu wyczyszczony. To głośna odmowa zamiast cichej utraty danych, ale
   jest to zmiana zachowania dla brudnych danych produkcyjnych. Nie wiem, ile
   takich wierszy jest na prodzie.
6. **`variance_tolerance_pct` (`numeric(5,2)`) nie dostało limitu miejsc
   dziesiętnych** — `0.001` dalej zaokrągli się do `0.00`. Zostawiłem świadomie:
   0 % jest legalną polityką, więc zaokrąglenie w dół nie tworzy niemierzalnego
   odniesienia (inaczej niż przy wagach). Jeśli arbitraż uzna inaczej, to jedna
   linia — `hasAtMostDecimalPlaces(v, 2)`.
7. Nie sprawdziłem, czy jakiś **test parity/snapshot HTML** w `_meta/parity-evidence`
   fotografuje baner „Applied" na zielono.
