# E2E PROD — FALA 9 (MRP / transfery / łańcuchy WO / scheduler)

- **Wdrożenie:** commit `20988b30`, deployment `dpl_3qC4Gby7YwZWuPGhmF8LWsymhWxm`, branch `main`, migracja 528
- **Data weryfikacji:** 2026-07-29 (00:32–00:52 UTC)
- **Środowisko:** https://monopilot-kira.vercel.app, org **Apex 22** `00000000-0000-0000-0000-000000000002`
- **Metoda:** akcje przez interfejs + weryfikacja stanu trwałego w bazie (`psql`, wyłącznie SELECT) + logi runtime Vercel
- **Drzewo lokalne = commit wdrożony** (`git rev-parse --short HEAD` → `20988b30`), więc odwołania do kodu są zgodne z produkcją

---

## Tabela wyników

| punkt | status | twardy dowód |
|---|---|---|
| **0. Bramka wdrożeniowa — widoczność wierszy `site_id IS NULL`** | **UDOWODNIONE (bramka zdana)** | Prognoza `da3886c6…` (W40, `site_id` NULL) widoczna przy filtrze **Main Factory** jako `12.345` w komórce „FG-R09-144638 2026-W40 kg". Próg `a2fb7624…` (`site_id` NULL) widoczny: `15.875000 kg` / `4.000000 kg` + aktywne przyciski Edit i Delete. Filtry odczytu jawnie dopuszczają NULL: `forecasts.ts:234` i `reorder-thresholds.ts:158` mają `... or f.site_id is null or ...` |
| **0b. Edycja wiersza NULL (próg)** | **NIEUDOWODNIONE — defekt (P1)** | Edycja progu globalnego **nie aktualizuje go, tylko tworzy duplikat**. Przed: 1 wiersz `a2fb7624…` site NULL min `15.875`. Po zmianie min→`16.5` i zapisie: **2 wiersze** — `a2fb7624…` NULL `15.875000` (bez zmian) + **nowy** `c30620fa…` site `7b72b4af…` (Main Factory) `16.500000`. Ekran pokazał dwa nierozróżnialne wiersze `RM-R09-144638`. Szczegóły niżej (Z-01) |
| **0c. Kasowanie wiersza** | **UDOWODNIONE** | Delete na wierszu `c30620fa…` → potwierdzenie „Delete RM-R09-144638?" → w bazie zostaje 1 wiersz `a2fb7624…`. Predykat `reorder-thresholds.ts:273` `and (site_id is null or site_id is not distinct from app.current_site_id())` dopuszcza też wiersze NULL |
| **1. „Save this run" w MRP** | **NIEUDOWODNIONE — P0, NIE NAPRAWIONE** | Przebieg z zaznaczonym „Save this run" → na ekranie alert **„MRP run failed. Try again."**, w bazie **0 nowych wierszy** (`select count(*) from mrp_runs` = 3 przed i po). Log runtime Vercel 00:39:35: `[planning/mrp] runMrp failed error: missing FROM-clause entry for table "s"`, `code: '42P01'`, `position: '312'`, `routine: 'errorMissingRTE'`. Przebieg read-only (bez zaznaczenia) **działa** — 10 pozycji, 6 z niedoborem, pokrycie 33.3%. Root cause niżej (P0-01) |
| **2. Prognoza/próg zapisują wybrany zakład** | **UDOWODNIONE** | Przy filtrze **Main Factory** wpisano 77.5 w „FG-R09-144638 2026-W31" → w bazie `426010d4…` `site_id = 7b72b4af-48d5-4da2-a3fe-d191d9e6ec19` (**nie NULL**). Próg zapisany w tej samej sesji dostał `site_id = 7b72b4af…`. Źródło: `forecasts.ts:310` i `reorder-thresholds.ts:216` wstawiają `app.current_site_id()` |
| **2b. Dwie prognozy: ta sama pozycja + tydzień, różne zakłady** | **UDOWODNIONE (sens migracji 528 potwierdzony)** | Po przełączeniu na **makery** komórka W31 była pusta (poprawna izolacja), wpisano 33.3. W bazie **dwa wiersze** dla `FG-R09-144638` / `2026-W31`: `426010d4…` Main Factory `77.500000` oraz `026540e8…` makery `33.300000`. Klucz `demand_forecasts_org_item_week_unique` = `(org_id, item_id, iso_week, site_id) NULLS NOT DISTINCT` — poprawnie, duplikaty globalne niemożliwe |
| **3. MRP nie rekomenduje zablokowanego dostawcy** | **NIEOSIĄGALNE NA DZISIEJSZYCH DANYCH + zablokowane przez P0-01** | W org jest 1 zablokowany dostawca (`a0000005…0007` `E2E-A-SUP-BLOCKED`, status `blocked`), ale **nie jest** preferowanym dostawcą żadnego progu ani `supplier_specs` pozycji planowanej przez MRP — sztucznie go nie tworzyłem. Niezależnie: cała logika wyboru dostawcy (`fetchActiveSupplierIds`, `pickProcurementSupplierId`) uruchamia się **wyłącznie w ścieżce zapisu**, która jest zepsuta (P0-01) — więc filtr zablokowanych dostawców na produkcji **nigdy się nie wykonuje** |
| **4. Łańcuch WO — propagacja daty rodzic→dziecko** | **UDOWODNIONE (poziom 1), brak regresji cyklu** | `WO-202607-0039` (DRAFT) → dziecko `WO-202607-0039-W1` (DRAFT), oba `scheduled_start_time = 2026-07-27 00:00+00`. Zmiana daty rodzica na `2026-08-03` przez modal Edit → w bazie **oba** wiersze `2026-08-03 00:00:00+00`, identyczny `updated_at = 2026-07-29 00:43:37.783895+00` (jedna transakcja), odstęp 0 dni zachowany. Powrót na `2026-07-27` → oba znów `2026-07-27`. **Żadnego błędu o cyklu** — brak zgłaszanej regresji |
| **4b. Propagacja przez cały łańcuch (2+ poziomy)** | **NIEOSIĄGALNE NA DZISIEJSZYCH DANYCH** | `select … from wo_dependencies d1 join wo_dependencies d2 on d2.parent_wo_id = d1.child_wo_id` → **0 wierszy**. W produkcji istnieją wyłącznie łańcuchy jednopoziomowe (rodzic→dziecko). Kod jest tranzytywny — `walkDescendantChainEdges` (`wo-chain-qty-sync.ts:263-289`) rekurencyjnie schodzi w głąb, a `loadAndLockParentChainEdges` zbiera pełny graf potomków — ale **na żywo nieudowodnione** |
| **5. Transfer `in_transit → received`** | **UDOWODNIONE** | W danych nie było transferu `in_transit` (tylko `received` 1 + `cancelled` 2), więc przeprowadzono pełną legalną ścieżkę przez interfejs. Utworzono `TO-202607-0005` (`ae76873b…`) WH1→BAKERY, status `draft`. „Ship" → w bazie `in_transit` (`updated_at 00:46:57`). **„Receive" → w bazie `status = received`** (`updated_at 00:47:24`), ekran: „No further status actions available.", linia dostała paletę docelową `LP-1785286044717-679T`. Brak przeblokowania |
| **6. Skan regresji — ekrany fali** | **CZĘŚCIOWO UDOWODNIONE — 1 ekran w stanie błędu** | Bez błędów: prognozy, progi zapasu, MRP (read-only), transfery (lista + szczegóły), zlecenia produkcyjne lista `/en/production/wos` (31 zleceń, progres liczony poprawnie), scheduler (`/en/scheduler` renderuje się i wykonuje przebieg). **Ekran `/en/production` (dashboard produkcji) zwraca stan błędu**: „Live production data is currently unavailable. Please retry shortly." — szczegóły Z-04. Konsola przeglądarki na ekranach w zakresie: **0 błędów** |

---

## P0-01 — „Save this run" w MRP: root cause (potwierdzony)

**Plik:** `apps/web/lib/procurement/resolve-item-supplier.ts:19`

```js
const NON_BLOCKED_SUPPLIER_FILTER = `s.status <> 'blocked'`;
```

Alias `s` jest **zaszyty na stałe** w stałej, która jest interpolowana do czterech różnych zapytań o różnych aliasach:

| linia | alias tabeli w zapytaniu | wynik |
|---|---|---|
| 46 | `s` | OK |
| **73** | **`s_by_id`** | **42P01 — `missing FROM-clause entry for table "s"`** |
| **78** | **`s_by_code`** | **42P01** |
| 128 | `s` | OK |

Linie 73/78 są w drugim zapytaniu `resolveProcurementSuppliersForItems` (odczyt `supplier_specs`), które wykonuje się zawsze, gdy pierwsze zapytanie (otwarte PO) nie rozwiązało wszystkich pozycji — czyli w normalnym przypadku. Ten helper jest wołany **wyłącznie** z `persistPlannedOrders` (`planning/_actions/mrp.ts:712`), dlatego przebieg read-only działa, a zapis pada. Zgadza się z `position: '312'` w logu.

**Zasięg:** ograniczony — `resolve-item-supplier` importuje tylko `planning/_actions/mrp.ts`. Inne ekrany nietknięte.

**Kierunek naprawy (najmniejszy diff):** zamienić stałą na funkcję aliasu, np. `const nonBlocked = (a: string) => \`${a}.status <> 'blocked'\`` i wołać `nonBlocked('s_by_id')` / `nonBlocked('s_by_code')`. Test regresyjny musi wymusić gałąź `unresolved.length > 0` (pozycja bez otwartego PO), bo tylko ona odpala zepsute zapytanie.

---

## P0-02 — Historia przebiegów MRP znika przy wybranym zakładzie

**Plik:** `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:854` (lista) i `:895` (szczegóły)

```sql
and (app.current_site_id() is null or site_id = app.current_site_id())
```

Brakuje członu `site_id is null or`, który mają siostrzane ekrany (`forecasts.ts:234`, `reorder-thresholds.ts:158`). Efekt: wszystkie istniejące przebiegi (wszystkie 3 mają `site_id IS NULL`) są **niewidoczne i nieotwieralne**, gdy w pasku wybrany jest jakikolwiek zakład.

**Dowód behawioralny:**
- Site = **Main Factory** → „Previous runs: *No persisted runs yet — enable „Save this run" before running.*"
- Site = **All sites** → pojawiają się wszystkie trzy: `MRP-20260712-C760F191`, `MRP-20260712-36568933`, `MRP-20260711-49A7A7BC`
- Baza niezmiennie: `select count(*) from mrp_runs` = 3

To dokładnie ten wzorzec, przed którym ostrzegała recenzja — wylądował na `mrp_runs` zamiast na prognozach/progach.

---

## Znalezione przy okazji

**Z-01 (P1) — „Edit" na wierszu globalnym rozwidla dane zamiast je edytować.**
`reorder-thresholds.ts:213-222` robi `insert … on conflict on constraint reorder_thresholds_org_item_unique`, a klucz to `(org_id, item_id, site_id) NULLS NOT DISTINCT`. Wiersz globalny ma `site_id = NULL`, a wstawka używa `app.current_site_id()`, więc przy wybranym zakładzie **konfliktu nie ma** i powstaje drugi wiersz. Dla operatora wygląda to jak „zapisałem zmianę, a wartość została stara" plus nagły duplikat. Pogarsza to brak kolumny **Site** w tabeli progów — dwa wiersze `RM-R09-144638` są wizualnie identyczne, a potwierdzenie kasowania brzmi tylko „Delete RM-R09-144638?", więc nie da się poznać, który wiersz się usuwa. Dodatkowo oba wiersze mają **ten sam `data-testid`** (`threshold-edit-RM-R09-144638` / `threshold-delete-RM-R09-144638`) — Playwright wymaga zawężenia do wiersza. Jeśli rozwidlanie jest zamierzone (override per zakład), potrzebna jest kolumna Site + osobny przycisk „Utwórz override", a nie „Edit".

**Z-02 (P2) — prognozy nie mają w ogóle kasowania w interfejsie.**
Akcja serwerowa `deleteForecast` (`forecasts.ts:359`) jest wyeksportowana, ale **jedyne jej wywołania to testy** (`forecasts/__tests__/forecasts-actions.test.tsx:46,110`) — żaden komponent jej nie woła. W siatce: wyczyszczenie komórki do pustej wartości jest odrzucane walidacją (pole dostaje `[invalid]`, brak zapisu), a wpisanie `0` **zostawia wiersz z `qty = 0.000000`** zamiast go skasować (zweryfikowane w bazie na `026540e8…`). Skutek: raz wpisanej prognozy nie da się usunąć z aplikacji.

**Z-03 (P2) — prognozy sprzed bieżącego tygodnia są niewidoczne i nieedytowalne.**
Siatka pokazuje okno W31–W42 (bieżący tydzień + 11), bez nawigacji wstecz. Wiersze `c704f1e9…` (2026-W29, 8.4) i `a73df21e…` (2026-W30, 3.6) istnieją w bazie, ale nie są dostępne z interfejsu. Wygląda na zamierzony horyzont, nie na regresję Fali 9 — odnotowane, bo dotyczy 2 z 4 wierszy z bramki punktu 0.

**Z-04 (P0/P1, poza zakresem fali) — dashboard produkcji `/en/production` jest w stanie błędu na żywej produkcji.**
Ekran renderuje komunikat „Live production data is currently unavailable. Please retry shortly." (konsola przeglądarki czysta — błąd łapany po stronie serwera). Log runtime Vercel 00:48:41:

```
[production/dashboard] KPI aggregate read failed: error: operator does not exist: text / numeric
code: '42883', position: '1033', hint: 'No operator matches the given name and argument types…'
```

**Nie udało mi się domknąć root cause i mówię to wprost.** Ustalenia częściowe: komunikat pochodzi z `catch` w `production/_actions/dashboard-data.ts:348`; jedyny literał SQL ≥1033 znaków w tym pliku to zapytanie listy WO z linii 259, a pozycja 1033 wypada dokładnie na `round(produced.qty_kg / w.planned_quantity * 100, 0)` (linia 282). Jednak: (a) `wo_outputs.qty_kg` i `work_orders.planned_quantity` są w bazie typu `numeric`, (b) to samo wyrażenie odtworzone w psql na danych produkcyjnych **zwraca poprawne wyniki**, (c) bliźniacze zapytanie w `list-work-orders.ts:230` z identycznym wyrażeniem **działa na żywo** — `/en/production/wos` renderuje 31 zleceń z policzonym progresem (2%, 3%, 9%). Wniosek: albo błąd jest w innym zapytaniu wykonywanym w tym samym bloku `try` (wtedy offset 1033 dotyczy innego literału), albo w grę wchodzi coś zależnego od sesji. Wymaga osobnego dochodzenia.

**Z-05 (P2) — transfer nie zapisuje zakładu.**
`TO-202607-0005` utworzony przy filtrze **Main Factory** dostał `site_id = NULL`, mimo że `transfer_orders` ma kolumnę `site_id` z FK do `sites`. Wszystkie 4 transfery w bazie mają `site_id` NULL. Lista transferów nie filtruje po zakładzie (wszystkie 3 były widoczne przy wybranym zakładzie), więc dziś nic to nie psuje — ale jeśli ktoś dołoży filtr site'u analogiczny do MRP, powtórzy się P0-02.

---

## Rezydua danych testowych (zapisy wyłącznie przez interfejs)

| obiekt | stan | uwaga |
|---|---|---|
| `reorder_thresholds` | **przywrócone do stanu wyjściowego** | 1 wiersz `a2fb7624…`, site NULL, min `15.875000`, reorder `4.000000` |
| `work_orders` WO-202607-0039 (+ dziecko) | **przywrócone** | `scheduled_start_time = 2026-07-27 00:00:00+00` na obu |
| `mrp_runs` | bez zmian | 3 wiersze (zapis nie przeszedł) |
| `demand_forecasts` `426010d4…` | **zostaje** — W31 / Main Factory / `77.500000` | nie da się skasować z interfejsu (Z-02) |
| `demand_forecasts` `026540e8…` | **zostaje** — W31 / makery / `0.000000` | jw. |
| `transfer_orders` `ae76873b…` `TO-202607-0005` | **zostaje** — status `received` | ścieżka statusów jest jednokierunkowa, brak cofnięcia w interfejsie |

Zgodnie z zasadą „zapisy tylko przez interfejs" nie usuwałem tych wierszy przez psql.

---

## Podsumowanie

- **Bramka punktu 0 zdana** — migracja 528 nie wygasiła ekranów prognoz ani progów; wiersze `site_id IS NULL` są widoczne, edytowalne i kasowalne.
- **Główny finding fali NIE jest naprawiony** — „Save this run" nadal pada (P0-01), root cause zlokalizowany co do linii.
- **Nowy P0 tego samego typu, którego szukała recenzja** — historia przebiegów MRP znika przy wybranym zakładzie (P0-02).
- **Sens migracji 528 potwierdzony na żywo** — dwie prognozy dla tej samej pozycji i tygodnia w różnych zakładach zapisują się obie.
- **Propagacja dat i ścieżka statusów transferu działają**; brak regresji wykrywania cyklu.
- **Nierozstrzygnięte:** wielopoziomowa propagacja łańcucha i blokowany dostawca w MRP — obu nie da się udowodnić na dzisiejszych danych, a blokowanego dostawcy dodatkowo blokuje P0-01.
