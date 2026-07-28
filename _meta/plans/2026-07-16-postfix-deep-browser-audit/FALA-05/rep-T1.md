# FALA 5 / TOR T1 — Item master: niespójne dane przechodzą walidację (R03-01, R03-02, R03-03)

## Podsumowanie

Wszystkie trzy reguły międzypolowe wylądowały w **jednym** miejscu — `refineItemInvariants`
w `items/_actions/shared.ts` — podpiętym pod `.superRefine` obu schematów wejściowych.
Kreator dostał lustrzane guardy klienckie (blokada „Next" + komunikat przy polu) oraz
**brakujące pola** `Gross weight max` / `Tare weight`. Migracji brak — kolumny już były.

Bramki nie uruchamiałem (zgodnie z zasadami toru) — testy napisane, nie odpalone.

---

## Gdzie dokładnie jest wspólna reguła i dlaczego łapie też import CSV

**Plik:** `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts`
**Funkcja:** `refineItemInvariants(value, ctx)` (nowa, tuż nad `OptionalGs1Gtin`).

Podpięcie — dokładnie dwie linie, obie zamienione z `refinePackHierarchy`:

| Schemat | Było | Jest |
|---|---|---|
| `CreateItemInput` | `.superRefine(refinePackHierarchy)` | `.superRefine(refineItemInvariants)` |
| `UpdateItemInput` | `.superRefine(refinePackHierarchy)` | `.superRefine(refineItemInvariants)` |

`refinePackHierarchy` **została nietknięta** i jest wołana jako pierwsza linia
`refineItemInvariants` — reguła opakowań (mig 267) działa bez zmian. Nie ma drugiej
ścieżki walidacji do utrzymania.

**Dlaczego import CSV jest objęty tym samym diffem:** `items/import/_actions/commit-import.ts`
nie ma własnej walidacji zapisu — commituje wiersze wołając **`createItem` / `updateItem`**
(linie 90 i 110), a te robią `CreateItemInput.safeParse` / `UpdateItemInput.safeParse`.
Import przechodzi więc przez ten sam `superRefine`. Potwierdzenie w kodzie: jedynymi
konsumentami obu schematów w całym repo są `create-item.ts:36`, `update-item.ts:44`
(+ test `settings/units/length-uom.test.ts`, który tylko czyta) — nie ma trzeciej furtki.

Test `„CSV bulk import hits the SAME rule"` dowodzi tego bez bazy: bierze **prawdziwy**
`parseItemsCsv('rm', …)`, z CSV `uom_base=g, uom_secondary=g`, i wsadza jego output do
`CreateItemInput` dokładnie tak, jak robi to `commit-import.ts` → odrzucone, błąd na
`uomSecondary`.

---

## Reguły — dokładny kształt

### R03-01 — identyczne base/secondary UoM
- `uomSecondary` musi być **puste albo różne** od `uomBase`; błąd na `path: ['uomSecondary']`.
- Porównanie działa na **wartościach po normalizacji** (`z.preprocess` → `normalizePieceUom`),
  więc łapie też `pcs` + `szt` (dwie pisownie tej samej jednostki). Jest na to test.
- Krok **Review pokazuje teraz Secondary UoM** (wiersz zaraz pod Base UoM) — wcześniej go
  w ogóle nie było, przez co sprzeczność była niewidoczna aż do zapisu.
- Kreator blokuje „Next" na kroku **classification** (tam żyją oba selecty) i renderuje
  komunikat **inline pod polem** (`Field help`, `var(--red-700)`), nie tylko w pasku alertu.

### R03-02 — niezmiennik catch-weight
Przy `weightMode === 'catch'` wymagane (błędy przypisane do pól):

| Pole | Reguła | Uzasadnienie |
|---|---|---|
| `nominalWeight` | wymagane, **> 0** | to jest `reference` bramki wariancji |
| `grossWeightMax` | wymagane, **> 0** | górna granica; bez niej „catch" nie ma sufitu |
| `varianceTolerancePct` | **wymagane (sama obecność)** | 0 % = świadoma polityka zero-tolerancji, wymuszanie `> 0` byłoby over-blockingiem |
| `tareWeight` | **NIE wymagane** | opcjonalne w każdym trybie (bulk bez opakowania) |

`nominalWeight > 0`, a nie „obecne": jawne `0` odtwarza dokładnie ten sam błąd, co `NULL`
(`reference = 0`), więc dopuszczenie zera nie naprawiłoby niczego.

**`fixed` nietknięty** — żadnego pola wagowego nie wymaga (jest na to jawny test anty-regresyjny).

### R03-03 — shelf life
- Zapalnik: `shelfLifeDays !== undefined || shelfLifeMode !== undefined` (czyli „włączony").
- Wtedy: dni **dodatnie** ORAZ tryb wymagany. Wyłączony (oba puste) → przechodzi.
- Ujednolicone z `ShelfLifeOverrideInput` (`technical/shelf-life/_actions/shared.ts`:
  `int().positive()` + wymagany `z.enum(SHELF_LIFE_MODES)`). Oba ekrany pisały w te same
  dwie kolumny z różnymi regułami — teraz nie mogą się już rozjechać.
- CHECK-i w bazie **nietknięte** (dane historyczne z `0` mogą istnieć); egzekwowanie na
  granicy zapisu — stary wiersz z `0` dni wymusi poprawkę przy najbliższej edycji.
- `min={0}` → **`min={1}`** na inpucie dni.

---

## Decyzja ws. `grossWeightMax >= nominalWeight`

**Przyjęta**, ale w najsłabszej sensownej formie: `grossWeightMax >= nominalWeight`
(dopuszczam równość), błąd na `grossWeightMax`.

Fizycznie ścisła reguła to `gross >= nominal + tare` (brutto zawiera tarę). **Świadomie jej
NIE wziąłem**, bo `tareWeight` zostaje opcjonalne — ostrzejsza wersja blokowałaby itemy,
które podają brutto i nominał, ale nie mają zapisanej tary, czyli karałaby za brak pola,
którego sami nie wymagamy. Wersja przyjęta łapie realny przypadek (przestawiona para
liczb / literówka rzędu wielkości) i nie blokuje nikogo poza nim.

Równość dopuszczona celowo: `gross == nominal` to legalny brzeg (zerowa tara i zerowa
tolerancja górna); odrzucanie go byłoby zgadywaniem intencji.

---

## Czy `?? '0'` w `register-output.ts` powinno zniknąć (OPIS — nie ruszałem pliku)

`apps/web/lib/production/output/register-output.ts` (~L850-882):
`const reference = item.nominal_weight ?? '0'`.

**Tak, powinno zniknąć — ale jako jawny błąd, nie jako cichy default.** Uzasadnienie:

1. `?? '0'` nie jest wartością domyślną, tylko **wyłącznikiem bramki**. Odniesienie 0
   sprawia, że `computeCatchWeightSummary` raportuje `variance_pct = '0.0000'` niezależnie
   od tego, co pokazała waga — kontrola tolerancji przestaje mierzyć cokolwiek, a wygląda
   na zieloną. To najgorszy możliwy tryb awarii: fail-open udający sukces.
2. Po tym torze master danych jest pilnowany, więc `nominal_weight IS NULL` przy
   `weight_mode='catch'` **nie może już powstać przez UI ani import**. Zostaje wyłącznie
   dług historyczny — wiersze sprzed tej zmiany.
3. Dlatego właściwy kształt to: przy `weight_mode='catch'` i `nominal_weight IS NULL`
   **odmówić rejestracji outputu** błędem domenowym (np. `item_master_incomplete`),
   wskazującym item do poprawienia — zamiast po cichu mierzyć względem zera.
   Fail-closed jest tu tani: dotyczy tylko wierszy, które i tak są niepoprawne.

**Czego NIE proponuję:** zostawienia `?? '0'` „bo teraz i tak nie wystąpi". Właśnie dlatego,
że nie powinien wystąpić, jego wystąpienie jest sygnałem błędu i ma być głośne.

**Zalecana kolejność:** najpierw raport ilu jest zaległych wierszy
(`weight_mode='catch' AND nominal_weight IS NULL`), potem zamiana `?? '0'` na twardy błąd.
Zamiana bez tego zliczenia może wywrócić rejestrację produkcji na istniejących SKU.

---

## Efekt uboczny, który trzeba świadomie zaakceptować (WAŻNE)

**CSV z `weight_mode=catch` będzie od teraz odrzucany wiersz po wierszu.** Format CSV
(`OPTIONAL_HEADERS` w `lib/import/parse-items-csv.ts`) **nie ma kolumn** `nominal_weight`,
`gross_weight_max` ani `variance_tolerance_pct` — nie da się w nim wyrazić poprawnego
itemu catch-weight.

Uważam to za zachowanie **poprawne, nie over-blocking**: dotychczas taki import tworzył
dokładnie te niemierzalne SKU, o których mówi R03-02. Odmowa jest widoczna (import raportuje
błędy per wiersz), a nie cicha. Dodatkowo `weight_mode` jest nagłówkiem opcjonalnym —
pominięty daje `fixed`, więc **zwykłe pliki klientów są nietknięte**; ucierpią wyłącznie te,
które jawnie deklarują `catch`.

**Follow-up (poza tym torem):** dołożyć do CSV opcjonalne kolumny `nominal_weight`,
`gross_weight_max`, `variance_tolerance_pct`, żeby import znów mógł zakładać itemy
catch-weight — już poprawne.

---

## Znaleziony przy okazji błąd utraty danych (naprawiony)

`updateItem` nadpisuje **wszystkie** kolumny wagowe bezwarunkowo
(`tare_weight = $13`, `gross_weight_max = $14`, z `input.X ?? null`), a payload kreatora
**nigdy nie zawierał** `tareWeight` ani `grossWeightMax` — bo kreator nie miał takich pól.

Skutek: **każdy zapis z kreatora zerował `tare_weight` i `gross_weight_max`** na NULL.
To najprawdopodobniej współtłumaczy, dlaczego audyt zastał itemy catch-weight z pustymi
polami mimo że kolumny istnieją od dawna.

Naprawione trzema elementami: pola w kreatorze, `tareWeight`/`grossWeightMax` w payloadzie
`common`, oraz **seedowanie z wiersza** w obu builderach formularza edycji
(`items-manager.client.tsx:rowToForm`, `[item_code]/_components/item-detail-actions.tsx:detailToForm`).
Bez tego trzeciego elementu edycja dalej gubiłaby wartości. Jest na to asercja w teście edycji.

---

## Pliki

| Plik | Zmiana |
|---|---|
| `items/_actions/shared.ts` | **wspólny szew** `refineItemInvariants` + przepięcie obu `.superRefine` |
| `items/_components/item-create-wizard.tsx` | pola gross/tare, guardy klienckie, inline error, `min={1}`, wiersze Review |
| `items/_components/item-wizard-labels.ts` | 3 nowe klucze błędów + `get()` w builderze |
| `items/_components/items-manager.client.tsx` | seed `tareWeight`/`grossWeightMax` |
| `items/[item_code]/_components/item-detail-actions.tsx` | seed `tareWeight`/`grossWeightMax` |
| `i18n/{en,pl,ro,uk}.json` | 3 klucze dopisane punktowo po `priceNonNegative` (nie przestawiałem kluczy) |
| `items/__tests__/items-validation.test.ts` | +nowy blok inwariantów + 2 istniejące case'y zaktualizowane |
| `items/__tests__/items-crud.integration.test.ts` | `varianceTolerancePct` w 2 payloadach catch |
| `items/_components/__tests__/item-create-wizard.test.tsx` | +8 testów, odwrócone asercje gross/tare, 2 flow catch uzupełnione |

**Nie dotykałem** `settings/units/**`, `actions/users/**`, `settings/users/**`,
`settings/invitations/**`, `items/[item_code]/_components/item-data-tabs.tsx`.
Migracji ani zmian CHECK — zero.

---

## Testy (napisane, NIE uruchamiane)

Pokrycie listy z zadania:

| Przypadek z zadania | Gdzie |
|---|---|
| `uomBase === uomSecondary` → odrzucone, błąd na `uomSecondary` | `items-validation` (asercja `toEqual(['uomSecondary'])`) |
| `uomSecondary` puste → przechodzi | `items-validation` (ANTI-REGRESSION) |
| catch bez `grossWeightMax` → odrzucone; z kompletem → przechodzi | `items-validation` ×2 |
| `weightMode='fixed'` bez pól → przechodzi | `items-validation` + `item-create-wizard` (ANTI-REGRESSION) |
| shelf life `0` → odrzucone; `19` + `best_before` → przechodzi | `items-validation` ×2, `item-create-wizard` |
| shelf life wyłączony → przechodzi | `items-validation` + wizard (ANTI-REGRESSION) |
| import CSV używa tej samej reguły | `items-validation` (przez prawdziwy `parseItemsCsv`) |

**Zaktualizowane istniejące testy** (dotychczasowe zachowanie było zabetonowane w asercjach):

1. `items-validation`: pętla po `WEIGHT_MODES` szła `catch` **bez pól** — dołożony komplet.
2. `items-validation`: `shelfLifeDays: 30` bez trybu miało przechodzić — dołożony tryb.
3. `item-create-wizard`: **asercje `queryByRole(tareWeight/grossWeightMax).not.toBeInTheDocument()`
   odwrócone** — to był zapis buga w teście (a `catchHint` od zawsze obiecywał te pola).
4. `item-create-wizard` ×2 + `items-crud.integration` ×2: flow catch uzupełnione o brakujące pola.

---

## Czego NIE jestem pewien

1. **Zaległe dane na prodzie.** Nie odpytywałem bazy (zakaz psql). Nie wiem, ile jest wierszy
   `weight_mode='catch' AND nominal_weight IS NULL` ani `shelf_life_days = 0`. Każdy taki
   wiersz **zablokuje edycję itemu** (nawet zmianę samej nazwy), dopóki użytkownik nie
   uzupełni wag / nie odznaczy shelf life. Uważam to za pożądane (wymuszone czyszczenie
   z komunikatem przy polu), ale **jeśli tych wierszy są setki, to jest to decyzja
   produktowa, nie techniczna** — warto policzyć przed deployem.
2. **`varianceTolerancePct` nie ma preprocessa na pusty string.** W przeciwieństwie do
   `OptionalNumeric`, to gołe `z.coerce.number().min(0).max(100).optional()`, więc `''`
   skoerciłoby się do **0**, a nie `undefined` — czyli przeszłoby jako „obecne". Kreator
   wysyła `undefined` (`numOrUndefined`), więc realnie nie występuje; zostawiłem bez zmian,
   bo to pre-existing i poza zakresem, ale to ostra krawędź dla przyszłych callerów.
3. **Krok Review nie pokazuje shelf life.** Dołożyłem Secondary UoM (wymagane) oraz
   gross/tare/variance przy catch. Shelf life świadomie pominąłem — zadanie tego nie
   wymagało, a Review i tak nie da się już osiągnąć z niespójnym shelf life.
4. **Zachowanie `Select` w jsdom.** Testy R03-01 seedują kolizję przez `initialForm`
   zamiast klikać w dropdown, bo obie listy UoM renderują opcję `kg` i `getAllByRole`
   trafiałby w niewłaściwy select. Reguła jest testowana wprost, ale **ścieżka „user
   fizycznie wybiera kg w drugim selectcie" nie jest przeklikana** w RTL.
5. **Nie uruchamiałem `tsc` ani testów** (zasada toru). Ryzyko typowe: nowe pola
   `tareWeight`/`grossWeightMax` w `WizardFormState` są **wymagane**, więc każdy pominięty
   konstruktor tego typu wywali typecheck. Znalazłem i uzupełniłem wszystkie trzy
   (`emptyWizardForm`, `rowToForm`, `detailToForm`) — grep po `WizardFormState` nie pokazał
   innych — ale to jest miejsce, gdzie bramka odezwie się najpierw, jeśli coś przeoczyłem.
