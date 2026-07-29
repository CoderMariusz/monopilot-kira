# Defekty do decyzji po Fazie 1

Data analizy: 2026-07-29  
Zakres: werdykty z `FAZA-1-WERDYKTY.md`, bez ponownego przeliczania katalogu i bez
uruchamiania testów, buildu, przeglądarki ani bazy.

## Wniosek dla ownera

Końcowe **27 wpisów FAIL** nie oznacza 27 napraw:

1. Po złączeniu wpisów wskazujących tę samą funkcję zostają **23 miejsca w kodzie**:
   - `NSA-145` + `E2E-055-05` + `E2E-055-06` → jedna akcja `completeOnboarding`;
   - `SFQ-075` + `E2E-056-05` → jedno mapowanie błędów desktopowego receipt;
   - `UI-011` + `UI-012` → jeden wspólny komponent etykiet alertów.
2. Dwa z tych 23 miejsc nie są żywymi defektami: `TEC-049` jest błędnym werdyktem,
   a `PRD-083` opisuje wartość zabronioną przez aktualny CHECK po migracji 280.
3. Zostaje **21 unikalnych, realnych przyczyn źródłowych reprezentowanych przez 27 wpisów
   werdyktów**: **8 trywialnych, 8 średnich i 5 dużych**.
4. `UI-039` jest niespójnie zaksięgowane w źródle: wchodzi do końcowych 27 FAIL, ale źródło
   jednocześnie nazywa je znaleziskiem spoza katalogu. Poniżej liczę je **raz**, jako przyczynę
   nr 21, i dodatkowo odsyłam do niej w wymaganej sekcji znalezisk pobocznych.
5. Spośród czterech znalezisk poza katalogiem jedno dodaje nowe otwarte miejsce
   (`cancelWo`/netting WAC), dwa są już naprawione w bieżącym drzewie (g→kg i tworzenie
   organizacji), a `UI-039` jest już w powyższych 21. Cały aktualny dossier zawiera zatem
   **22 otwarte unikalne miejsca**: 8 trywialnych, 9 średnich i 5 dużych.

Koszt oznacza:

- **trywialny** — 1–5 linii, bez migracji;
- **średni** — jeden moduł, ewentualnie jedna migracja;
- **duży** — wiele modułów, zmiana żywych danych albo decyzja produktowa o szerokim skutku.

## Unikalne przyczyny źródłowe

| # | co jest zepsute (jedno zdanie) | plik:linia | które ID katalogu to pokrywają | klasa defektu | ryzyko dla użytkownika | szacowany koszt naprawy |
|---:|---|---|---|---|---|---|
| 1 | Replay `startWo` jest rozpoznany przez maszynę stanów, ale caller nie wie, że to replay, i ponownie emituje `production.wo.started`. | `apps/web/lib/production/wo-state-machine.ts:208-218`<br>`apps/web/lib/production/start-wo.ts:218-234,302-315`<br>`apps/web/lib/production/shared.ts:141-156` | `PRD-008` | idempotencja rdzenia, nieidempotentny skutek uboczny; fail-open na replayu | Po uruchomieniu outbox crona konsumenci dostaną dwa zdarzenia startu i mogą podwójnie wykonać dalszą rezerwację, integrację lub materializację. | **Średni.** Jeden przepływ produkcyjny musi przekazać informację `replayed` albo deduplikować emisję; bez migracji, ale kontrakt wyniku i test replayu obejmują kilka funkcji w module. |
| 2 | Approval counta odrzuca zmianę live stock zamiast rozstrzygnąć, czy wariancję przeliczyć względem aktualnego stanu. | `apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1190-1204` (rzut w `:1196`) | `WH-066` | **guard chroniący jeden przypadek zamraża sąsiedni** | Operator nie może zatwierdzić counta po dowolnym ruchu magazynowym i musi zaczynać recount; wariant automatycznego przeliczenia niesie z kolei ryzyko zatwierdzenia starego pomiaru względem nowego zapasu. | **Średni, po decyzji produktowej.** Kod jest w jednym module, lecz trzeba zdefiniować politykę konfliktu i zmienić anty-test utrwalający dzisiejsze fail-closed. |
| 3 | Rollup NPD wystawia `raw_cost_eur` jako `totalCost`, pomijając pozostałe składniki waterfallu. | `apps/web/app/[locale]/(app)/(npd)/_actions/get-costing-rollup.ts:35-54` | `NSA-067` | **ekran ≠ baza** / pole o nazwie „total” zawiera tylko część | Product owner widzi koszt surowców jako koszt całkowity, więc marża i decyzja o cenie wyglądają lepiej niż w pełnym kosztorysie. | **Średni.** Trzeba w jednym module odczytać lub złożyć kanoniczny total według tego samego ziarna co waterfall; bez migracji, ale nie jest to zmiana samej etykiety. |
| 4 | `completeOnboarding` nie sprawdza ani wymaganych kroków, ani uprawnienia, choć bliźniaczy `advanceOnboarding` sprawdza autoryzację. | `apps/web/actions/onboarding/complete-onboarding.ts:39-60`<br>`apps/web/actions/onboarding/advance.ts:68-83` | `NSA-145`, `E2E-055-05`, `E2E-055-06` | **fail-open** + **rodzeństwo o tej samej wadzie, naprawione tylko w jednym miejscu** | Użytkownik bez prawa administracyjnego może wywołać akcję poza UI, pominąć konfigurację i oznaczyć organizację jako wdrożoną. | **Średni.** Jedna akcja wymaga wspólnej bramki uprawnień i serwerowej walidacji stanu kroków przed UPDATE; bez migracji. |
| 5 | GDPR UPDATE widoku `public.product` raportuje trafione wiersze, ale trigger `INSTEAD OF UPDATE` nie przenosi zmiany `created_by_user` do `items.created_by`. | `packages/db/migrations/359-product-as-items-view-cut.sql:369,433-472,508-510`<br>wywołanie: `packages/db/migrations/243-drop-brief-tables.sql:45-50` | `NSA-150` | **fałszywy zapis / ekran ≠ baza** | Po wykonaniu prawa do usunięcia trzy rekordy nadal wskazują pierwotnego użytkownika, więc organizacja ma niezamknięty wyciek RODO mimo odpowiedzi sugerującej sukces. | **Duży.** Nie wolno edytować zastosowanej migracji 359: potrzebna jest nowa migracja triggera oraz kontrolowany repair żywych danych dla erasure wykonanych po cutoverze. |
| 6 | Race między precheckiem a insertem kategorii mapuje przegrane `23505` na `persistence_failed`, nie `duplicate_code`. | `apps/web/actions/reference/product-categories/create.ts:28-36,59-60`<br>UNIQUE: `packages/db/migrations/437-w5-product-categories.sql:18` | `NSA-161` | check-then-write race / utrata semantyki błędu | Przy równoległym utworzeniu tego samego kodu jeden użytkownik dostaje niezrozumiały błąd techniczny zamiast informacji o duplikacie. | **Trywialny.** W catchu wystarczy rozpoznać `23505` właściwego constraintu; 1–5 linii, bez migracji. |
| 7 | SCIM insert do `users` nie podaje wymaganej kolumny `name`, mimo że ma już obliczone `displayName`. | `apps/web/app/api/scim/v2/Users/route.ts:145-148` | `XC-018` | drift API ↔ schemat | Każde provisionowanie użytkownika przez SCIM kończy się błędem NOT NULL i konto nie powstaje. | **Trywialny.** Dodanie `name` do listy kolumn i wartości to około dwie linie, bez migracji; wdrożenie świadomie odłożone decyzją ownera nr 4. |
| 8 | Słowniki PL/RO/UK i drugi zestaw `messages` nie mają pełnego parytetu liści z EN, a allowlisty pozwalają testom przejść. | przykładowo `apps/web/i18n/en.json:1434` (brak odpowiedników RO/UK)<br>`apps/web/app/__tests__/i18n.test.ts:41-55`<br>`apps/web/messages/__tests__/02-settings.namespace.test.ts:9` | `XC-047` | **rodzeństwo o tej samej wadzie** + trzy katalogi tłumaczeń + anty-test | Operator na krytycznych ekranach widzi surowe klucze albo angielski fallback, m.in. w Shipping, bramce zakończenia produkcji i Technical. | **Duży.** To praca w wielu słownikach i testach parytetu, wymagająca prawdziwych tłumaczeń i decyzji copy; mechaniczne skopiowanie EN nie zamyka defektu. |
| 9 | Create WO dopuszcza 4 miejsca dziesiętne, podczas gdy update, modal i `numeric(15,3)` dopuszczają tylko 3. | `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/shared.ts:272-276`<br>`.../_actions/update-work-order.ts:66-70`<br>`.../_components/create-wo-modal.tsx:173`<br>`packages/db/schema/work-orders.ts:49` | `PLN-015` | **rodzeństwo o tej samej wadzie** / rozjazd precyzji na granicy modułów | Create przyjmuje np. cztery miejsca, po czym baza zaokrągla lub odrzuca ilość inaczej niż update; planista nie dostaje jednolitego kontraktu ilości. | **Trywialny.** Dwa regexy/komunikaty create trzeba zrównać z 3 dp; 1–5 linii, bez migracji. |
| 10 | Wspólny preflight blokuje priced receipt z nierozwiązywalnym UoM przed zapisem GRN/LP, choć katalog oczekuje przyjęcia towaru z wyłączeniem tylko WAC. | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/receive-po-line.ts:55-57`<br>`apps/web/lib/finance/book-receipt-wac.ts:168-187` (rzut w `:185`)<br>sibling scanner: `apps/web/lib/warehouse/scanner/receive-po.ts:366` | `SFQ-072` (ta sama czerwień w scannerze nie jest nową przyczyną) | **guard chroniący jeden przypadek zamraża sąsiedni** | Towar fizycznie dostarczony nie może zostać przyjęty; odwrotna polityka bez procesu rekonsyliacji zostawi zapas bez wyceny. | **Średni, po decyzji produktowej.** Jedna wspólna funkcja obsługuje desktop i scanner, ale polityka księgowa musi określić trwały status wyłączenia i późniejsze domknięcie wyceny. |
| 11 | Desktop zmienia kanoniczne `unsupported_currency` na `wac_unsupported_currency`, a `unknown_currency` gubi do generycznego `error`. | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/receive-po-line.ts:103-113` (mapowania w `:106-110`)<br>poprawny sibling: `apps/web/lib/warehouse/scanner/receive-po.ts:467-468` | `SFQ-075`, `E2E-056-05` | **rodzeństwo o tej samej wadzie** / drift słownika błędów API | Operator desktopu dostaje inny lub nieakcyjny komunikat niż operator skanera dla tego samego błędu waluty. | **Duży.** Sama zmiana catcha jest mała, ale publiczny union, dwie kopie typów, dwa UI, cztery locale i testy asertują dziś prefiksowany kod — zmiana przechodzi przez wiele modułów. |
| 12 | Pole globalnego wyszukiwania w topbarze jest tylko readonly atrapą bez formularza, wyników i nawigacji. | `apps/web/components/shell/app-topbar.tsx:105-113`<br>intencja „static”: `apps/web/components/shell/__tests__/app-topbar.test.tsx:149-157` | `UI-003` | **przycisk/pole, które udaje, że działa** | Użytkownik widzi affordance wyszukiwania, ale nie może wyszukać żadnego WO, LP, produktu ani dokumentu. | **Duży, po decyzji produktowej.** Pełny global search wymaga decyzji o indeksowanych encjach, uprawnieniach, wynikach i nawigacji w wielu modułach; usunięcie atrapy byłoby trywialne, ale nie spełnia kontraktu funkcji. |
| 13 | Menu użytkownika nie zawiera linków do istniejących stron profilu i zmiany PIN-u. | `apps/web/components/shell/user-menu.tsx:93-124`<br>cele: `apps/web/app/[locale]/(app)/(admin)/account/profile/page.tsx`, `.../account/pin/page.tsx` | `UI-005` | funkcja istnieje, ale jest niedostępna z nawigacji | Użytkownik nie znajduje miejsca zmiany danych profilu ani PIN-u bez ręcznego wpisania URL. | **Średni.** Jeden komponent plus klucze czterech locale i test nawigacji; bez migracji. |
| 14 | KPI low-stock ma poprawną wartość live, lecz jego zwykły hint nadal brzmi „Stock thresholds not live yet”. | `apps/web/app/[locale]/(app)/(modules)/dashboard/page.tsx:124-130`<br>`apps/web/i18n/en.json:8452` i odpowiedniki locale | `UI-008` | naprawione dane, niezmienione copy / **ekran ≠ baza** | Operator widzi aktualny licznik, ale tekst pod nim mówi, że mechanizm nie działa, więc nie wie, czy ufać alertowi. | **Trywialny.** Zmiana czterech wartości tłumaczeń, bez migracji. |
| 15 | Jeden zestaw `empty/view` jest przekazywany do paneli WO, PO i TO, więc PO/TO są opisane jako work order. | `apps/web/app/[locale]/(app)/(modules)/planning/_components/alert-panels.tsx:116-123`<br>`.../planning/page.tsx:202-212`<br>`apps/web/i18n/en.json:8624-8625` | `UI-011`, `UI-012` | **rodzeństwo o tej samej wadzie** / naprawiony link, niezmienione copy | Planner klika poprawny PO/TO, ale etykieta „View WO” i empty-state „No work-order alerts” sugerują inny obiekt. | **Średni.** Jeden moduł UI wymaga osobnych etykiet per encja oraz kluczy we wszystkich locale; bez migracji. |
| 16 | Dwie różne pozycje nawigacji warehouse mają identyczną etykietę „Stock adjustments”. | `apps/web/app/[locale]/(app)/(modules)/warehouse/page.tsx:58-75,314-322` | `UI-017` | naprawiona akcja, niezmienione copy / niejednoznaczna nawigacja | Operator nie wie, który link otwiera nowe księgowanie, a który historię korekt. | **Trywialny.** Zmiana jednej etykiety albo usunięcie duplikatu; 1–5 linii, bez migracji. |
| 17 | Notatki deweloperskie z trzeciego katalogu i18n są renderowane jako `sr-only`, więc trafiają do accessibility tree i `innerText`. | `_meta/i18n-staging/warehouse-d.json:45-47`<br>`apps/web/app/[locale]/(app)/(modules)/warehouse/_components/warehouse-dashboard.client.tsx:211-219` | `UI-018` | wyciek notatki implementacyjnej do UI / trzeci katalog tłumaczeń | Użytkownik czytnika ekranu słyszy techniczne informacje o brakujących KPI i telemetrii zamiast treści operacyjnej. | **Trywialny.** Usunięcie tych akapitów lub prawdziwe `hidden` to 1–2 linie, bez migracji. |
| 18 | „Spend by supplier” formatuje poprawną wartość GBP jako USD. | `apps/web/app/[locale]/(app)/(modules)/reporting/_components/reporting-overview.client.tsx:235,822-840` | `UI-020` | **ekran ≠ baza** / poprawna liczba, zła waluta | Użytkownik widzi `$260.00` dla wydatku 260 GBP i może podjąć decyzję zakupową na błędnej interpretacji waluty. | **Trywialny.** Domena WAC jest dziś GBP-only, więc zmiana formattera USD→GBP to jedna linia, bez migracji. |
| 19 | Network inventory pokazuje surowy numeric z sześcioma miejscami zamiast uzgodnionego zaokrąglenia wyświetlania. | `apps/web/app/[locale]/(app)/(modules)/multi-site/_lib/network-inventory-kpi.ts:7-10`<br>gotowy helper: `apps/web/lib/shared/decimal.ts:53-61,77-86` | `UI-021` | naprawione dane, niezmienione formatowanie | Operator widzi `25.000500 kg` zamiast spójnej, czytelnej ilości i może pomylić precyzję magazynową z precyzją ekranu. | **Trywialny.** Import wspólnego formattera i zmiana jednej mapy; 1–5 linii, bez migracji. |
| 20 | Create/update site przyjmuje dowolny tekst kraju i nie normalizuje ISO-3166 alpha-2, mimo że copy obiecuje ten format. | `apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts:240,267`<br>`packages/db/schema/multi-site.ts:51` | `UI-022` | walidacja tylko na ekranie / niespójne dane referencyjne | `PL`, `uk` i nazwy krajów mogą współistnieć, przez co filtrowanie, raportowanie i przyszłe integracje traktują ten sam kraj jako różne wartości. | **Duży.** Potrzebna jest walidacja create/update, normalizacja i migracja żywych danych; niejednoznaczne legacy nazwy wymagają raportu lub mapowania przed dodaniem constraintu. |
| 21 | `setCoreFlag` najpierw aktualizuje nieistniejącą kolumnę `updated_by`, a po tej poprawce wstawiłby NULL do NOT NULL `outbox_events.aggregate_id`; oba błędy są spłaszczane do `persistence_failed`. | `apps/web/actions/flags/set-core.ts:77-116` (błędy `:80` i `:94`)<br>`packages/db/migrations/067-feature-flags-core.sql:1-35`<br>`packages/db/schema/baseline.ts:94` | `UI-039` — znalezisko poza oczekiwanym zakresem kontraktu, ale wliczone przez źródło do 27 FAIL | **defekt maskowany przez inny defekt** + drift akcji względem schematu | Administrator nie może przełączyć żadnej flagi rdzeniowej w żadnym środowisku; transakcja cofa także sam UPDATE i pokazuje tylko generyczny alert. | **Średni.** Oba błędy trzeba naprawić atomowo w jednej akcji i zachować audyt/outbox; bez migracji, lecz wymaga weryfikacji transakcyjnej całego modułu settings. |

## Werdykty niebyłe po weryfikacji

### `TEC-049` — fałszywe oskarżenie

Anchor `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts:501`
jest aktualny, lecz interpretacja werdyktu jest błędna. Macierz w `:501-506` jawnie i celowo
dopuszcza:

- `draft → active`,
- `active → deprecated`,
- `deprecated → active`,
- `blocked → active`.

Właściwy kontrakt katalogu odrzuca `draft → deprecated`, a aktualna macierz właśnie to robi.
`blocked → active` jest udokumentowaną reaktywacją po deaktywacji, nie defektem. **Brak naprawy
i brak kosztu.**

### `PRD-083` — brak żywego stanu, który miałby ujawnić defekt

Akcja faktycznie filtruje dokładnie po `dual_sign_off_status = $2`
(`changeover-actions.ts:360-370`). Jednak migracja
`packages/db/migrations/280-changeover-signoff-hardening.sql:21-32`:

1. przepisała wszystkie `completed` na `complete`;
2. dodała i zwalidowała CHECK dopuszczający wyłącznie
   `pending | first_signed | complete`.

Po migracji 280 żaden żywy ani nowy wiersz nie może mieć wartości `completed`. To luka
defense-in-depth tylko wtedy, gdy produkt ma wspierać odczyt z bazy sprzed migracji 280 albo
z zewnętrznego źródła omijającego CHECK. W obecnym systemie nie ma naprawialnego defektu.
Jeśli owner mimo to ustanowi taki kontrakt kompatybilności, koszt tolerancyjnego filtra byłby
**trywialny**.

## Wymaga decyzji produktowej, nie naprawy

Są **cztery tematy decyzyjne**. Trzy należą do 21 przyczyn z końcowych 27 wpisów; czwarty
łączy `E2E-054-10` ze znalezionym poza katalogiem nettingiem WAC.

| temat | sprzeczne racje | decyzja potrzebna przed kodem | rekomendacja analityczna |
|---|---|---|---|
| `E2E-054-10` + netting WAC po anulowaniu | Maszyna stanów, komentarz i kod odwrócenia wspierają `completed → cancelled`, ale katalog zabrania przejścia, a wcześniejszy guard czyni odwrócenie nieosiągalnym. | Czy ukończony WO wolno anulować, gdy output LP nie był jeszcze konsumowany ani dzielony? | Zachować przejście tylko jako kontrolowane odwrócenie nieużytego outputu albo całkowicie je usunąć; nie poprawiać nettingu przed wyborem jednej z tych polityk. |
| `WH-066` | Katalog chce przeliczyć wariancję na live stock; kod i test fail-closed żądają recountu, aby podpis nie zatwierdzał pomiaru wykonanego dla innego stanu. | Czy approval ma rebase'ować stary pomiar, czy konflikt zapasu zawsze unieważnia count? | Domyślnie zachować fail-closed i zmienić kontrakt, chyba że operacja magazynowa potrafi jednoznacznie dowieść, że nie dotknęła liczonego ziarna. |
| `SFQ-072` | Katalog priorytetyzuje przyjęcie fizycznego towaru i osobne wyłączenie WAC; kod priorytetyzuje zakaz powstania wycenionego na zero zapasu. | Czy priced receipt z nierozwiązanym UoM ma być blokowany, czy zapisany z trwałym stanem „valuation pending”? | Nie otwierać receipt bez osobnej kolejki/statusu rekonsyliacji finansowej; samo pominięcie WAC byłoby fail-open. |
| `UI-003` | Katalog opisuje działający global search; bieżący test nazywa pole „static” i jawnie utrwala readonly. | Czy finansujemy global search, czy topbar ma przestać obiecywać tę funkcję? | Do czasu finansowania usunąć lub jednoznacznie oznaczyć atrapę; pełną funkcję traktować jako duży feature, nie bugfix. |

## Kolejność naprawy

### 1. `PRD-008` przed lub atomowo z wdrożeniem cronów z `739f9223`

To jest twarda zależność wdrożeniowa. Przed naprawą GET cronów outbox nie był opróżniany,
więc duplikaty pozostawały niewidoczne w tabeli. Po wdrożeniu `739f9223` zaczną docierać do
konsumentów. Jeśli commit jest już na produkcji, `PRD-008` należy traktować jako aktywny
incydent, nie zwykły backlog. Nie wolno „rozwiązać” tego przez ponowne zatrzymanie crona.

### 2. `NSA-150` — zatrzymać nowe niepełne erasure, potem naprawić historię

To jedyny potwierdzony defekt regulacyjny z trwałym wyciekiem referencji. Kolejność wewnętrzna:
nowa migracja poprawiająca trigger widoku (bez edycji zastosowanej 359), wdrożenie poprawki,
identyfikacja erasure wykonanych po cutoverze i kontrolowany repair danych. Samo poprawienie
przyszłych wywołań nie zamyka istniejących trzech referencji ani innych organizacji.

### 3. `NSA-145` / `E2E-055-05` / `E2E-055-06` — zamknąć onboarding fail-open

Jedna średnia naprawa zamyka trzy wpisy katalogu i granicę uprawnień. Walidacja kroków oraz
permission muszą zajść przed UPDATE; to także najwyższy zwrot liczony jako liczba kontraktów
na jedno miejsce.

### 4. `UI-039` — naprawić oba błędy w jednym wdrożeniu

Pierwsza korekta (`updated_by`) tylko odsłoni drugą (`aggregate_id = NULL`). Obie muszą wejść
razem, inaczej administrator nadal nie przełączy flagi, a diagnoza zmieni tylko kod SQLSTATE.

### 5. Jedna fala receipt/WAC po decyzji o `SFQ-072`

W tej samej fali należy:

- wdrożyć wybraną politykę priced unresolved-UoM dla wspólnego desktop/scanner preflightu;
- ujednolicić `SFQ-075`/`E2E-056-05` ze słownikiem błędów scannera;
- nie mieszać z nettingiem anulowanego WO, dopóki owner nie rozstrzygnie `E2E-054-10`.

Rozdzielenie tych dwóch pierwszych zmian grozi kolejnym rozjazdem rodzeństwa w tym samym
łańcuchu przyjęcia.

### 6. Pakiet trywialnych napraw o dużej widoczności

W jednej krótkiej fali, ale jako osobne commity/kontrakty: `UI-020` (GBP), `PLN-015`
(3 dp), `NSA-161` (`23505`), `UI-008` (fałszywy hint), `UI-017` (dwie etykiety),
`UI-018` (notatki deweloperskie) i `UI-021` (format ilości). `XC-018` jest równie małe,
ale pozostaje odłożone razem z całym SCIM.

### 7. Prawda kosztowa i nawigacja

Następnie `NSA-067`, `UI-011/UI-012` i `UI-005`: wszystkie są średnie, bez migracji,
i korygują informacje lub drogi używane codziennie, ale nie niosą takiego ryzyka trwałych
skutków jak outbox, RODO i onboarding.

### 8. Zmiany danych i szerokie katalogi

Na końcu, w osobnych falach:

1. `UI-022` — najpierw kod tolerujący/normalizujący, potem raport i backfill żywych wartości,
   na końcu constraint; nie odwrotnie.
2. `XC-047` — najpierw pełny test parytetu liści bez allowlisty, potem tłumaczenia w
   `i18n`, `messages` i stagingu; kopiowanie EN nie jest zamknięciem.
3. `UI-003` — dopiero po decyzji i specyfikacji global search.

## Defekty spoza katalogu

| znalezisko | zweryfikowane miejsce i stan bieżący | klasa | praktyczne ryzyko | koszt / decyzja |
|---|---|---|---|---|
| Konwersja g→kg zwracała `0`, `resolved:false` | Bieżący kod ma już dokładne dzielenie Postgres `numeric / 1000` w `apps/web/lib/finance/upsert-wac.ts:319` i `resolved=true` w `:331`; linie pochodzą z commita `5b1a5187`, wcześniejszego niż końcowy werdykt Fazy 1. | **utrata ilości / fail-open** | Na starszym wdrożeniu dodatnia ilość gramów mogła wejść do WAC jako zero i po cichu zafałszować koszt. | **Już naprawione w drzewie; brak nowej naprawy.** Wynik Fazy 1 wskazuje na stary proces/runtime lub niespójne środowisko i wymaga ponownego real-DB potwierdzenia po czystym starcie, nie kolejnej zmiany kodu. |
| WAC nie wraca po anulowaniu completed WO | `apps/web/lib/production/complete-cancel-wo.ts:476-492` odrzuca completed WO z każdym żywym output LP; przez to kod odwrócenia w `:524-575` jest dla takiego outputu nieosiągalny. | **guard chroniący jeden przypadek zamraża sąsiedni** | Anulowany output pozostaje w puli WAC, więc ilość i wartość zapasu są zawyżone; dziś użytkownik zwykle nie dochodzi nawet do anulowania. | **Średni, ale dopiero po decyzji `E2E-054-10`.** Jeśli completed cancel pozostaje legalny, jeden moduł musi dopuścić bezpieczne LP i wykonać już istniejące odwrócenie; jeśli nie, test i martwy flow trzeba wycofać zamiast „naprawiać” WAC. |
| `UI-039` — flagi funkcji | To ta sama przyczyna nr 21: `set-core.ts:80` używa nieistniejącego `updated_by`, a `:94` zapisuje NULL do NOT NULL `aggregate_id`. Źródło zaliczyło ID do 27 FAIL i równocześnie do znalezisk poza katalogiem; nie liczę go drugi raz. | **defekt maskowany przez inny defekt** | Żadnej flagi rdzeniowej nie da się przełączyć, a administrator widzi tylko `persistence_failed`. | **Średni.** Obie korekty atomowo w jednej akcji; priorytet 4. |
| Tworzenie organizacji | Naprawione przez `packages/db/migrations/543-npd-field-catalog-semantic-index-fix.sql:1-132` i `544-npd-field-catalog-seed-dedup.sql:1-416`: 543 poprawia kolejność normalizacji, 544 scala `Runs_Per_Week` z `runs_per_week`, przepina referencje i redefiniuje seeder. | **defekt maskowany przez inny defekt** + bramka pomijająca testy ukrywa awarię | Przed poprawką onboarding nowej organizacji był niemożliwy; naprawa samej 543 tylko odsłaniała drugi konflikt seedu. | **Już naprawione, koszt faktyczny duży.** Migracja 544 zmienia żywe dane i według dowodu przepinała 39 powiązań; dokumenty potwierdzają próby `BEGIN…ROLLBACK` na produkcji, ale nie są dowodem, że migracje zostały już wdrożone produkcyjnie. |

## Audyt anchorów `plik:linia`

**Osiem anchorów było nieaktualnych, zbyt wąskich albo wskazywało konsumenta zamiast
przyczyny źródłowej:**

| ID | anchor źródłowy | wynik weryfikacji |
|---|---|---|
| `WH-066` | `count-actions.ts:1190` | `:1190` zaczyna live reread; blokujący throw jest w `:1196`. |
| `NSA-150` | recheck: migracja 115 | Definicję funkcji nadpisała migracja 243, a od migracji 359 `product` jest widokiem; aktualna przyczyna to pomijający `created_by_user` trigger w `359:369,433-472`. |
| `XC-018` | `Users/route.ts:138` | `:138` jest początkiem zapytania; wadliwy INSERT bez `name` jest w `:145-148`. |
| `SFQ-072` | `book-receipt-wac.ts:176` | `:176` jest warunkiem; rzeczywisty throw jest dziś w `:185`. Anchor `receive-po-line.ts:55` pozostaje poprawny. |
| `SFQ-075` | `receive-po-line.ts:103` | `:103` zaczyna inny branch; złe mapowania walut są w `:106-110`. |
| `UI-008` | `dashboard/page.tsx:129` | Warunek jest poprawny: dla `notLive=false` renderuje zwykły hint. Kłamstwo jest w treści tego hintu, `apps/web/i18n/en.json:8452`, nie w warunku. |
| `UI-022` | `sites.ts:269` | Aktualny schema anchor jest w `:267`. |
| `E2E-054-10` | `wo-state-machine.ts:46` | `:46` deklaruje tabelę; konkretne `completed → cancelled` jest w `:50`. |

Pięć werdyktów (`NSA-150`, `XC-047`, `UI-005`, `UI-012`, `UI-020`) nie podało w finalnej
tabeli pełnego anchoru przyczyny źródłowej; powyżej zostały uzupełnione. Anchor
`_meta/i18n-staging/warehouse-d.json:46-47` dla `UI-018` jest aktualny jako źródło tekstu,
ale dopiero `warehouse-dashboard.client.tsx:211-219` wyjaśnia, dlaczego tekst trafia do UI.

## Rekomendowana pierwsza trójka

1. **`PRD-008`** — przed/razem z cronami `739f9223`, bo ich wdrożenie aktywuje skutek
   duplikatów.
2. **`NSA-150`** — RODO oraz konieczność zatrzymania nowych przecieków przed naprawą historii.
3. **`NSA-145` + `E2E-055-05` + `E2E-055-06`** — jedna średnia zmiana zamyka trzy wpisy
   i krytyczny fail-open autoryzacji/onboardingu.
