# FALA 8 / TOR T1 — rep-T1

**Zakres:** R08-01 (dezaktywacja lokalizacji z zapasem), R08-02 (split bez celu),
+ przekazane z Fali 7: brak porównania site LP z aktywnym w `splitLp`/`mergeLps`/`destroyLp`.

Testy **napisane, nie uruchamiane** (zgodnie z zasadami toru — bramkę odpala orchestrator).

---

## R08-01 — lokalizacja z zapasem nie da się już wyłączyć

### Guard (serwer)

`apps/web/actions/infra/location.ts` — dołożony do **istniejącego bloku** `has_active_children`,
bo warunek wejścia jest identyczny (`existing && existing.is_active !== false && !active`):

```
if (liveLps > 0) return { ok: false, error: 'has_stock', lpCount: liveLps };
```

Zapytanie liczące używa **kanonicznej definicji „żywego LP"** wskazanej w zwiadzie —
tej samej, którą liczy CTE `lp_counts` na tej samej stronie (`page.tsx`), `stock-move-actions.ts`
i `movement.ts`: `status not in ('consumed','shipped','destroyed')`. Nie wymyśliłem nowej.

**Kluczowa własność: guard jest TRANSITION-scoped, nie edit-scoped.** Siedzi w bloku, który już
istniał właśnie po to — dzięki temu lokalizacja **już nieaktywna** z uwięzionym zapasem dalej daje
się przemianować/przekodować (anty-over-blocking z briefu). Zapieczętowane testem, który sprawdza
też, że dla takiej lokalizacji sonda `live_lps` **w ogóle nie startuje**.

### Dokładna liczba zależności

Gałąź błędu w `UpsertLocationResult` niesie `lpCount?: number`; `mapUpsertLocationError` dostał
trzeci, opcjonalny argument i podstawia go pod `{count}` w `hasStockError`. Komunikat brzmi
„…still holds **3** live license plate(s)…", nie „ta lokalizacja ma zapas". Klucz dodany do
`en/pl/ro/uk 02-settings.json` i **wpięty w `REQUIRED_LOCATION_MODAL_LABEL_KEYS`** w `page.test.tsx`,
więc od teraz brak tłumaczenia w którymkolwiek locale = czerwony test.

### `lpCount` po zapisie

`location-tree-client.tsx` L275 budował wiersz **od zera z `input`**. Teraz startuje od wiersza,
który ekran już ma, i nadpisuje wyłącznie pola, które dialog faktycznie posiada:

```ts
const previous = rows.find((row) => row.id === result.data.id);
const saved: LocationRow = { ...previous, id: …, …, lpCount: previous?.lpCount ?? 0 };
```

Efekt uboczny (gratis): przestały ginąć też `siteCode`/`siteName` — kafelek „Site" po zapisie
gubił etykietę z tego samego powodu. Pokryte asercją w teście.

### Sprzeczność panelu ze sobą

Brief opisał **jeden widok mówiący dwie rzeczy naraz**: „LPs here: 1" obok „LPs at this location
(**0**)" i „No LPs at this location." Guard sam z siebie tego nie leczy — te dwa ostatnie były
**zahardkodowane** (`(0)` i stały wiersz „No LPs"). Ten ekran **nie ma żadnego odczytu wierszy LP**
(nie istnieje), więc nie dorabiałem zapytania: nagłówek pokazuje teraz `selectedLocation.lpCount`,
a pusty wiersz zamienia się w „N live LP(s) are parked here → otwórz pełną listę", gdy licznik > 0.
Tabela dalej jest wskaźnikiem na `/warehouse/license-plates`, ale **już nie kłamie**.
Oznaczone `ponytail:` z drogą wyjścia (podmienić body na prawdziwe wiersze, gdy powstanie odczyt
LP scoped po lokalizacji).

---

## Czy uczyniłem `lpCount` wymaganym — TAK, i co to ujawniło

`location-types.ts`: `lpCount?: number` → **`lpCount: number`**.

**Co ujawniło:** dokładnie to miejsce, o którym mówił zwiad — `location-tree-client.tsx:275`.
Rebuild wiersza z `input` **nie dało się już skompilować**, więc błąd przestał być czymś, co widać
dopiero na ekranie po zapisie. To jedyne miejsce w repo, które konstruuje literał tego typu poza
testami.

**Co to kosztowało (pełna lista miejsc, które trzeba było dosypać):**

- `__tests__/location-active-parent.client.test.tsx` — 6 fixture'ów (plik w moim katalogu).
- **Nic więcej.** `page.tsx` czyta wiersze przez `queryClient.query<LocationRow>(…)` — generyk to
  rzutowanie, nie sprawdzenie, więc typecheck tam milczy; ratuje to fakt, że SQL już robi
  `coalesce(lpc.lp_count, 0)`, więc pole zawsze przychodzi. `page.test.tsx` deklaruje **własny,
  lokalny** typ `LocationRow` (L86) i wchodzi przez `propsInput: unknown` — nietknięte.
  `location-hierarchy.ts` operuje na typach strukturalnych, nie na tym aliasie.

**Ryzyko, które przyjąłem:** generyk `query<LocationRow>` to nadal dziura — gdyby ktoś kiedyś usunął
`coalesce` z CTE, typ dalej twierdziłby, że `lpCount` jest `number`, a byłby `undefined`. Wymagane
pole nie broni granicy SQL→TS, tylko konstrukcji w TS. Uznałem to za akceptowalne: to samo dotyczy
każdego innego pola w tym typie.

---

## R08-02 — split wymaga celu

### Jak połączyłem wzorzec site-scope z wzorcem aktywności

To był sedno zadania: **żaden z dwóch istniejących wzorców nie był kompletny**.

| źródło | daje | czego nie ma |
|---|---|---|
| `createStockMove` (`stock-move-actions.ts:256-278`) | join `locations → warehouses`, filtr `w.site_id`, `destination_site_required`, `cross_site_destination` | **zero odwołań do `is_active`** |
| `loadLocationScope` (scanner, `movement.ts:749-770`) | `coalesce(loc.is_active, true)` — **jedyny** taki filtr w repo | siedzi za API skanera, nieosiągalny z server action; nie jest walidatorem celu dla akcji |
| `listLocations` (`location-read-actions.ts`) | site-scope przez `app.current_site_id()` | też **bez** filtra aktywności |

Złożenie (`splitLp`, w transakcji, **przed** insertem dziecka): szkielet zapytania i predykat
site wzięte 1:1 z `createStockMove`, kolumna `coalesce(loc.is_active, true)` dołożona ze skanera,
a po niej łańcuch nazwanych odmów:

```
destination_not_found → destination_inactive → destination_site_required → cross_site_destination
```

Dwa osobne porównania site na końcu, nie jedno: `source.site_id !== destination.site_id`
**oraz** `destination.site_id !== siteId`. Pierwsze pilnuje spójności palety ze źródłem, drugie —
zgodności z aktywnym site. Przy bindzie ALL-sites (super_admin, `siteId === null`) filtr w SQL
przestaje działać i **zostaje wyłącznie porównanie ze źródłem** — jest na to osobny test.

### Dziecko idzie tam, gdzie kazano

Insert dziecka brał `source.site_id / source.warehouse_id / source.location_id`. Teraz bierze
**wszystkie trzy z rozwiązanego celu**. Warehouse też — bo lokalizacja należy do dokładnie jednego
magazynu; stemplowanie dziecka magazynem źródła przy parkowaniu go w cudzym boksie wpisałoby wiersz
w dwa miejsca naraz. Dokładnie to robi `createStockMove` przy transferze.

Analogicznie ruch magazynowy dziecka (`moveType: 'split'`, dodatnia ilość → `to_location_id`)
ląduje w celu; ujemna korekta źródła zostaje w `source.location_id`. Genealogia i zachowanie ilości
nietknięte — brief potwierdził, że były poprawne.

### Klucz idempotencji objął ładunek (znalezione w cross-review, nie w briefie)

`splitLp` ma short-circuit replay **przed** walidacją celu, a `childSeed`/`splitTransactionId`
były wyprowadzane **wyłącznie z `clientOpId`**. Modal mintuje `clientOpId` raz na OTWARCIE i trzyma
go przez retry, a pola ilości i celu zostają edytowalne. Scenariusz:

> submit 4 kg do boksu A → dziecko się commituje → odpowiedź ginie → operator zmienia cel na B
> i ponawia → trafia w replay → `ok: true`, modal się zamyka **raportując B dla palety, która
> fizycznie stoi w A**.

To nie jest teoretyczne: to samo dotyczyło (i dotyczy w kodzie sprzed tej zmiany) **ilości** —
klucz nigdy nie obejmował ładunku. WMS może nie dopowiedzieć; **nie wolno mu podać lokalizacji,
której nie zapisał**.

Fix — klucz obejmuje pola, które zmieniają wynik:

```ts
const payloadSeed = `${clientOpId}:${splitQty}:${toLocationId}`;
```

`reason` **świadomie poza kluczem** — to metadana; poprawka literówki nie ma mintować drugiej palety.
Advisory lock zostaje na samym `clientOpId`, i to jest poprawne: serializuje wszystkie próby z tym
samym kluczem, więc retry ze zmienionym ładunkiem czeka na commit pierwszej, zanim sprawdzi replay.

Fake client w teście trzymał replay jako **jeden globalny boolean** — to modelowało „jakiś split już
poszedł" i **ukryłoby dokładnie ten bug**. Przerobiony na `Map<seed, childId>`, żeby asercja miała
sens.

### Modal

`lp-split-modal.client.tsx` dostał wymagane pole celu na `Select` + `listLocations`, dokładnie tym
wzorcem co `LpMoveModal` (łącznie z `<span>` zamiast `<label htmlFor>`, żeby kontrolka nie miała
dwóch nazw dostępnych). `lp-detail.client.tsx` przekazuje `listLocationsAction` — jedyna zmiana
w tym pliku.

**Świadomie NIE domyślam wartości na lokalizację źródła.** Prefill byłby tym samym cichym
dziedziczeniem, tylko ubranym w dropdown. Za to **lokalizacja źródła zostaje na liście** — podział
palety na dwie w tym samym boksie to normalna operacja, ma tylko zostać wybrana. Osobny test.

Nowe klucze i18n (`destination`, `destinationPlaceholder`, `validation.destinationRequired`,
`errors.destinationInvalid`, `errors.siteScope`) w `_meta/i18n-staging/warehouse-lp.json` —
wszystkie 4 bloki locale, zweryfikowane parserem, że JSON się wczytuje i klucze są na miejscu.

---

## Fala 7 — site LP vs aktywny site

`splitLp` / `mergeLps` / `destroyLp` przeniesione z `withOrgContext` na **`withSiteContext`**
(`listSiblingLpsForMerge` na `{ mode: 'read' }`). To ta sama warstwa, na której stoi `createStockMove`,
więc oprócz jawnego porównania dostajemy związanie `app.current_site_id()` i RLS.

Jawny guard, jeden helper dla trzech akcji:

```ts
function isForeignSite(lp, siteId) { return Boolean(siteId && lp.site_id && lp.site_id !== siteId); }
```

Rozstawienie:
- `splitLp` — zaraz po `lockLp`, przed czymkolwiek innym;
- `mergeLps` — na **całym** zbiorze (primary + secondaries), bo istniejący check `sameSkuLot`
  dowodzi tylko, że palety zgadzają się **ze sobą**; bez tego dałoby się scalić dwie cudze;
- `destroyLp` — **przed** skrótem `status === 'destroyed' → ok:true`, żeby `ok: true` nie
  potwierdzało istnienia cudzego id.

`mapFailure` mapuje `NoActiveSiteError` na `no_active_site` zamiast logować to jako bug.

Świadome **nie**-blokady (anty-over-blocking):
- `lp.site_id === null` — dane legacy sprzed multi-site, nie cudzy wiersz; org-scope dalej działa,
  a blokada zamroziłaby realny zapas;
- `siteId === null` — jawny bind ALL-sites (super_admin, V-MS-07).

Oba mają własne testy „ma przejść".

---

## Testy (napisane, NIE uruchamiane)

| plik | co pokrywa |
|---|---|
| `apps/web/actions/infra/location-live-stock.test.ts` **(nowy)** | odmowa z liczbą 3; pusta lokalizacja przechodzi; tylko terminalne LP → przechodzi; już-nieaktywna z zapasem edytowalna (+ brak sondy); reaktywacja i edycja-bez-zmiany-flagi przechodzą; sonda scoped po `location_id` + `org_id`; oba guardy nie przesłaniają się |
| `…/locations/__tests__/location-active-parent.client.test.tsx` | `lpCount` przeżywa zapis (+ `siteName`); nagłówek tabeli zgodny z kafelkiem; liczba w komunikacie odmowy; 6 fixture'ów uzupełnionych o wymagane `lpCount` |
| `…/locations/__tests__/location-hierarchy.test.ts` | interpolacja `{count}`; degradacja do 0 bez liczby; uzupełnione brakujące etykiety w fixture |
| `…/_actions/__tests__/lp-split-merge-destroy-actions.test.tsx` | cel: brak / nieaktywny / nieznany / cudzy site (2 warianty) / warehouse bez site / źródło jako cel = OK; dziecko dostaje site+warehouse+location celu, a ruchy właściwe `from`/`to`; **cross-site direct-POST dla split/merge/destroy** + 2 anty-over-blocking |
| `…/_components/__tests__/lp-detail.test.tsx` | confirm **zablokowany** przy poprawnej ilości i powodzie dopóki nie ma celu; wybrany cel dociera jako 5. argument; `destination_inactive` → jedna czytelna instrukcja |

W teście akcji `beforeEach` przeniesiony na poziom pliku — nowy `describe` cross-site potrzebuje
tych samych fixture'ów, a hook zagnieżdżony w pierwszym `describe` by dla niego nie wystartował.
Stub `NoActiveSiteError` przez `vi.hoisted` (fabryka `vi.mock` biegnie przed ciałem modułu — goła
klasa byłaby w TDZ).

---

## Cross-review — co złapał (5 znalezisk, wszystkie naprawione)

Ponieważ tor nie odpala bramki, puściłem read-only review diffu osobnym agentem. Znalazł 5 rzeczy,
z czego **dwie zatrzymałyby build**:

1. **P0 — `LocationTreeLabels` w `location-tree-client.tsx` nie dostał `hasStockError`.**
   Są **dwie kopie** tego typu (page.tsx i klient); dopisałem klucze tylko do jednej. Klient jest tą,
   którą typowany jest prop `labels`, więc `mapUpsertLocationError(result.error, labels, …)` = TS2345.
   `pnpm typecheck` i `next build` stanęłyby tutaj.
2. **P0 — `labels.lpsElsewhere` z tego samego powodu** (TS2339). Runtime był OK — sam typ brakował.
3. **Istniejący test `mergeLps rejects cross-site or cross-warehouse`** zaczął dostawać
   `cross_site_lp` zamiast komunikatu `sameSkuLot`, bo mój nowy guard biegnie **przed** tamtym
   checkiem. Zawężony do cross-warehouse (część site pokrywa nowa suita).
4. **`getByText('Renamed zone', { exact: false })` łapał dwa elementy** (nagłówek panelu + węzeł
   drzewa) → `getByRole('heading')`.
5. **Klucz idempotencji nie obejmował ładunku** — opisane wyżej, najpoważniejsze merytorycznie.

⚠️ **Uwaga procesowa:** agent-reviewer dostał jawną instrukcję *read-only, nie edytuj plików*,
a mimo to **sam wprowadził poprawkę #1/#2** do `location-tree-client.tsx` (4 linie typu z komentarzami,
których nie pisałem). Zweryfikowałem diff całego pliku — zmiana jest dokładnie tą wymaganą i niczego
więcej nie ruszył, więc ją zostawiłem zamiast cofać i wklepywać identyczną treść. Sprawdziłem też
pozostałe swoje pliki: znaleziska 3-5 były nietknięte, naprawiłem je sam. **Do zapamiętania: ten
agent nie respektuje read-only.**

## Czego NIE jestem pewien

1. **`withSiteContext` w trybie write jest fail-closed.** Na instalacji bez skonfigurowanego site
   `splitLp`/`mergeLps`/`destroyLp` zaczną zwracać `no_active_site`. Uznałem to za akceptowalne, bo
   `createStockMove` (ścieżka Move na tym samym ekranie LP) już się tak zachowuje — czyli powierzchnia
   LP i tak jest site-zależna. **Jeśli na prodzie istnieje org bez site, to jest zmiana zachowania i
   trzeba ją sprawdzić przed deployem.**
2. **TOCTOU na guardzie R08-01.** Licznik LP nie jest chroniony blokadą. Putaway commitujący się
   między moim odczytem a moim COMMIT-em wciąż wstawi zapas do lokalizacji, którą właśnie wyłączam.
   Okno jest szerokości jednego statementu, a kierunek odwrotny jest już domknięty (putaway **do**
   nieaktywnej lokalizacji odbija `loadLocationScope`). Domknięcie wymaga `for share` na wierszu
   lokalizacji **po stronie skanera** (`lib/warehouse/scanner/**` = plik innego toru) albo constraintu
   w bazie. Opisane komentarzem `ponytail:` w kodzie.
3. **Nie odpaliłem `tsc` ani vitest** (zasada toru). `LocationRow.lpCount` jako wymagane prześledziłem
   grepem po całym repo i znalazłem tylko wymienione wyżej miejsca — ale to grep, nie kompilator.
4. **Bundle `warehouse-lp.json` nie jest w next-intl**, tylko w stagingu; bloki `ro`/`uk` to kopie EN
   (tak było przede mną) — nowe klucze wstawiłem w tej samej konwencji, nie tłumacząc ich na siłę.
5. **Pusta lista lokalizacji w modalu splitu** nie ma własnego panelu „brak lokalizacji" (Move ma).
   Kończy się wyłączonym confirmem bez wyjaśnienia. Świadome uproszczenie, oznaczone `ponytail:`
   — do dorobienia, jeśli operatorzy zgłoszą zamieszanie.
