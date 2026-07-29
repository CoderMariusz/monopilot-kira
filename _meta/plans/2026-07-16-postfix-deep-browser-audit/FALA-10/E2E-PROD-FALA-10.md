# E2E PROD — FALA 10 + domknięcie P0 Fali 9

- **Wdrożenie:** commit `ce072fdf`, deployment `dpl_87CxVN57P9A3snQ2QcTgVujDuyyq`, branch `main`, stan **READY**
- **Data weryfikacji:** 2026-07-29 (01:12–01:30 UTC)
- **Środowisko:** https://monopilot-kira.vercel.app, org **Apex 22** `00000000-0000-0000-0000-000000000002`
- **Zakład w pasku:** **Main Factory** `7b72b4af-48d5-4da2-a3fe-d191d9e6ec19` (celowo — wszystkie regresje Fali 9 dotyczyły wybranego zakładu)
- **Metoda:** akcje przez interfejs + stan trwały w bazie (`psql`, wyłącznie SELECT) + logi runtime Vercel + log sieciowy przeglądarki
- **Drzewo lokalne = commit wdrożony** (`ce072fdf`), więc odwołania do kodu są zgodne z produkcją

## Bramka wdrożeniowa (przed startem)

Deployment odpytany do stanu `READY`. Potwierdzenie **behawioralne**, że serwowany jest nowy build:
`/en/production` renderuje treść, podczas gdy na poprzednim commicie był w stanie błędu
(„Live production data is currently unavailable. Please retry shortly."). Dodatkowo ekran progów
zapasu ma **nową kolumnę SITE**, której poprzedni build nie miał.

---

## Tabela wyników

| punkt | status | twardy dowód |
|---|---|---|
| **1a. „Save this run" w MRP** | **UDOWODNIONE** | `mrp_runs` **3 → 4**. Nowy wiersz `a496e680-7db0-40ae-9953-27e39b02c8ff`, `run_number = MRP-20260729-97CB4D75`, **`status = completed`**, `error_message` NULL, `site_id = 7b72b4af…` (Main Factory), `requirement_count = 11`, `planned_order_count = 8`, `exception_count = 7`. `mrp_requirements` **37 → 48**, z czego **11 wierszy** wisi na nowym przebiegu. Ekran: „Last run: 29/07/2026, 02:15:25 · **saved as MRP-20260729-97CB4D75**" — **bez alertu** „MRP run failed. Try again.". Logi runtime Vercel z okna przebiegu: **zero** wpisów error/fatal/warning (poprzednio `42P01 missing FROM-clause entry for table "s"`) |
| **1b. Historia przebiegów przy wybranym zakładzie** | **UDOWODNIONE** | Przy `select[aria-label="Site"].value = 7b72b4af-48d5-4da2-a3fe-d191d9e6ec19` („Main Factory") sekcja „Previous runs" pokazuje **wszystkie trzy stare przebiegi** (`MRP-20260712-C760F191`, `MRP-20260712-36568933`, `MRP-20260711-49A7A7BC`) — a `select id, site_id from mrp_runs` potwierdza, że **wszystkie trzy mają `site_id IS NULL`**. Poprzednio: „No persisted runs yet". Przebieg **da się otworzyć**: „Details" na `MRP-20260712-C760F191` rozwija tabelę z **14 wierszami pozycji** (`WIP-20260707-0006 … 189.000000 / 0.000000 / -189.000000 / 189.000000 kg` itd.). Po odświeżeniu lista ma 4 pozycje — nowy przebieg też jest widoczny |
| **1c. `/en/production` renderuje treść** | **UDOWODNIONE** | Dosłownie z ekranu: `WOS IN PROGRESS · ● · 4 / 5 · Running / active`, `OUTPUT · TODAY · ● · 0.001 kg · Registered output (kg)`, `OEE · CURRENT · No data`, `OPEN DOWNTIME · 0 · Events not yet ended`, `OVER-PRODUCED WOS · ● · 1 · Flagged work orders`, plus tabela `Work orders (25)` z 25 wierszami. **Zero** stanu błędu. Konsola przeglądarki na tym ekranie: **0 błędów** |
| **1d. Edycja globalnego progu bez duplikatu** | **UDOWODNIONE** | **Przed:** 1 wiersz `a2fb7624-727d-4008-b40b-4a208122bbb0`, `site_id` NULL, min `15.875000`. Edycja min → `16.5` przy wybranym **Main Factory**. **Po:** nadal **1 wiersz**, **ten sam `id`**, **`site_id` nadal NULL**, min `16.500000`, `updated_at` przebity. Zero duplikatów. Zachowanie i rozróżnianie — patrz sekcja niżej |
| **2. Czas anulowanego WO nie rośnie** | **UDOWODNIONE** | `WO-202607-0036-W1` (`314d0661-9f09-43fd-aa91-1b539d90d1f3`, CANCELLED). Trzy odczyty po pełnym przeładowaniu strony: `01:19:46.579Z → "Elapsed 9 min"`, `01:20:32.768Z → "Elapsed 9 min"`, `01:26:02.739Z → "Elapsed 9 min"` — rozpiętość **6 min 16 s**, wartość **bez zmian**. Zgadza się z bazą: `wo_executions.started_at = 2026-07-18 06:24:34.989786+00`, `cancelled_at = 2026-07-18 06:33:44.791596+00` → 549,8 s = 9,16 min → **9**. Gdyby żył stary licznik, byłoby ~15 500 min i rosłoby. **Kontrola przeciwna:** WO `E2E-A-N1-DISPLAY` w stanie IN_PROGRESS w tej samej sesji przeszedł `23371 → 23372 min` — zegar dla aktywnych WO nadal tyka, więc nie jest to globalne zamrożenie |
| **3a. Jawne zero minut odrzucone** | **UDOWODNIONE z zastrzeżeniem** | Pauza WO `E2E-A-N1-DISPLAY` (reason „Operator break") → `downtime_events` `17736c50…` otwarty (`ended_at` NULL), WO `ON_HOLD`. „Resume" z wpisanym **0** → modal: **„Check the fields and try again."**, WO **zostaje `ON_HOLD`**, przestój **nadal otwarty** (`ended_at` NULL, `duration_min` NULL). **Zastrzeżenie:** blokada zadziałała **po stronie klienta** — w logu sieciowym **nie ma POST-a** dla resume (jest tylko POST `/pause`). Serwerowa bramka istnieje w kodzie (`pause-resume-wo.ts`: `actualDurationMin <= 0` → `invalid_input`, `code: 'invalid_actual_duration_min'`), ale **na prodzie się nie wykonała** i nie mam na nią dowodu behawioralnego. Powód **nie jest nazwany operatorowi** — komunikat jest rodzajowy (patrz Z10-02) |
| **3b. Sub-minutowa przerwa zachowana** | **UDOWODNIONE** | Pauza 01:25:28.716658 → resume 01:25:39.508642 = **10,79 s**. Wiersz `fbb8ffd5-b807-4feb-8032-70b048531386` **ZACHOWANY**, `duration_min = 0` (obcięcie w kolumnie GENERATED), a fakt przerwy uratowany w `ext_jsonb`: `{"actualDurationSec": 10, "pauseTransactionId": "971d37ee…", "durationBelowMinute": true}`. Zwykłe wznowienie też zachowuje wiersz: `17736c50…`, 94,8 s, `ended_at = 2026-07-29 01:24:59.159044+00`, `duration_min = 2`. `downtime_events` **5 → 7** |
| **4. Kalibracja odrzuca odwrócony zakres** | **UDOWODNIONE (serwerowo)** | „Add instrument": kod `E2E-F10-INVRANGE`, **Range min = 100**, **Range max = 5**, uom `kg` → modal: **„Could not save the instrument."**. Żądanie **doszło do serwera**: log sieciowy pokazuje `POST https://monopilot-kira.vercel.app/en/maintenance/calibration => [200]` (server action zwraca 200 z ładunkiem błędu), więc odrzucił **serwer**, nie formularz. Baza: `calibration_instruments` nadal **3** wiersze, `where instrument_code like 'E2E-F10%'` → **0 wierszy** |
| **5. Widok wielooddziałowy nie sumuje różnych jednostek** | **UDOWODNIONE** | Cytat z ekranu `/en/multi-site`: **`AGGREGATED INVENTORY 2589.787601 kg · 700.000000 pcs`** — suma **rozbita per jednostka**, nie zsumowana. Kontrola w bazie tym samym predykatem co kod: `select lp.uom, sum(lp.quantity) … group by lp.uom` → `kg | 2589.787601`, `pcs | 700.000000` — **zgodność co do cyfry** |
| **6. Skan ogólny ekranów fal 9 i 10** | **UDOWODNIONE** | 14 ekranów, wszystkie **HTTP 200**, wszystkie z realną treścią, **żaden w stanie błędu**: `/en/planning/mrp`, `/en/planning/forecasts`, `/en/planning/reorder-thresholds`, `/en/planning/transfer-orders`, `/en/planning/work-orders`, `/en/production`, `/en/production/wos`, `/en/production/downtime`, `/en/scheduler`, `/en/scheduler/capacity`, `/en/scheduler/runs`, `/en/maintenance`, `/en/maintenance/calibration`, `/en/multi-site`. Konsola na ekranach w zakresie: **0 błędów**. Logi runtime Vercel za całe okno weryfikacji (35 min, poziomy error/fatal/warning): **brak wpisów** |

---

## 1d — jakie zachowanie zastałem

**Zastałem aktualizację globalną w miejscu, nie ciche nadpisanie per-zakład.** Edycja wiersza
`site_id IS NULL` przy wybranym zakładzie **aktualizuje ten sam wiersz i zachowuje `site_id = NULL`**
(`reorder-thresholds.ts` — gałąź `if (input.id)` robi `update … where id = $1` zamiast `insert … on conflict`).

**Ekran je rozróżnia — sprawdzone na dwóch wierszach jednocześnie.** Żeby to udowodnić, utworzyłem
przez „+ Add threshold" jawny override na Main Factory dla tej samej pozycji i zobaczyłem:

| wiersz | kolumna SITE | min | `data-testid` |
|---|---|---|---|
| `a2fb7624…` (`site_id` NULL) | **All sites** | 16.500000 kg | `threshold-site-a2fb7624-727d-4008-b40b-4a208122bbb0` |
| `819f7b4b…` (`site_id` = Main Factory) | **Main Factory** | 99.250000 kg | `threshold-site-819f7b4b-5dbb-4d9c-ba54-6d21ab4d3a9c` |

Trzy rzeczy, których poprzednio brakowało, są na miejscu: **kolumna SITE**, **`data-testid` per `row.id`**
(zamiast per `itemCode`, co dawało kolizje) oraz **potwierdzenie kasowania z nazwą zakładu** —
dosłownie `Delete RM-R09-144638 (Main Factory)?`. Override skasowałem, stan przywrócony do wyjściowego.

Czyli: „Edit" edytuje, a jawny override per-zakład powstaje tylko świadomym „+ Add threshold" —
i oba są na ekranie odróżnialne.

---

## Znalezione przy okazji

**Z10-01 (P2) — KPI dashboardu produkcji nie respektuje filtra zakładu, a listy WO tak.**
Przy wybranym **Main Factory** kafelek `/en/production` pokazuje **`WOS IN PROGRESS 4 / 5`**, podczas gdy
`/en/production/wos` pokazuje **„In progress 3"**, a `/en/planning/work-orders` też **„In progress 3"**.
Baza rozstrzyga na korzyść list: `count(*) filter (where site_id = '7b72b4af…')` = **3**, `count(*)` = **4**.
`dashboard-data.ts` nie zawiera **ani jednego** odwołania do `app.current_site_id()`, a zapytanie listy
(`production/_lib/dashboard-queries.ts:54`) filtruje wyłącznie po `w.org_id = app.current_org_id()`.
Podpowiedź w pasku mówi wprost „Filters work orders, license plates and OEE only", więc dashboard
produkcji jest niezgodny z własną obietnicą. To ten sam wzorzec co P0-02 Fali 9 (brakujący człon
site-owy), tyle że po drugiej stronie — tu filtra brakuje **w całości**. Uwaga: `Work orders (25)`
to nie to samo co 31 z listy — w zapytaniu jest twarde `limit 25` (linia 57), więc licznik nagłówka
jest myślący jako „25 najnowszych", nie „25 istniejących".

**Z10-02 (P2) — odrzucenie jawnego zera nie nazywa powodu.**
Operator wpisujący `0` dostaje **„Check the fields and try again."** — komunikat rodzajowy dla całej klasy
`invalid_input`. Serwer ma powód nazwany (`invalid_actual_duration_min`, „actualDurationMin must be a
positive integer"), ale nigdy nie dojeżdża do ekranu, bo blokada klienta (`parseActualDurationMin` +
`min="1"` na inpucie) ucina żądanie wcześniej. Punkt zadania mówił „odrzucona **z nazwanym powodem**" —
odrzucenie jest, nazwania powodu nie ma.

**Z10-03 (P3) — `work_orders.paused_at` nie jest czyszczone przy wznowieniu.**
Po pełnym cyklu pauza→wznowienie WO `E2E-A-N1-DISPLAY` ma `status = IN_PROGRESS`, ale
`paused_at = 2026-07-29 01:25:28.716658+00`. To samo widać na `E2E-A-S8-TIMESTAMPS` z poprzednich sesji,
więc zachowanie jest starsze niż ta fala. Dziś nieszkodliwe — źródłem prawdy jest `status`, a parowanie
pauz siedzi w `wo_executions` (`paused_at`/`resumed_at`) — ale każdy przyszły predykat typu
`paused_at is not null` = „wstrzymane" będzie kłamał.

**Z10-04 (P3) — `/en/settings/printers` zwraca 404.**
Trasa nie istnieje, a coś w interfejsie do niej prowadzi. Przy okazji: w konsoli wisiały **stare** 500-tki
dla `/en/settings/units` i `/en/pipeline/…/brief` — sprawdziłem je na żywo na tym buildzie i **oba zwracają
200**. To były wpisy sprzed tego wdrożenia, nie regresja; nie należy ich raportować jako żywych.

**Z10-05 (informacja) — zagadka Z-04 z Fali 9 jest domknięta w kodzie.**
Nierozstrzygnięty wtedy root cause `42883 operator does not exist: text / numeric` widać teraz wprost:
`dashboard-queries.ts:60-64` trzyma fixture regresyjny
`PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL`, który odtwarza awarię przez
`coalesce(sum(o.qty_kg), 0)::text as qty_kg` — czyli lateral rzutował sumę na `text`, a potem dzielił
`text / numeric`. Bliźniaczy `/production/wos` działał, bo nie miał tego rzutowania. Zagadka „to samo
wyrażenie w psql zwraca poprawne wyniki" rozwiązana: w psql testowane było wyrażenie **bez** `::text`.

**Z10-06 (P3) — `mrp_runs.completed_at` wcześniejsze niż `started_at`.**
Nowy wiersz ma `started_at = 2026-07-29 01:15:25.148+00`, a `completed_at = 01:15:25.053718+00` —
domknięcie o ~94 ms **przed** startem; `completed_at` jest równe `created_at`, więc wygląda na wstawiane
domyślną wartością zamiast realnym czasem zakończenia. Nie psuje przebiegu, ale każda metryka
„czas trwania przebiegu MRP" wyjdzie ujemna.

**PF-R12-02 (obłożenie: slot + wariant roboczy) — NIEOSIĄGALNE NA DANYCH.**
`/en/scheduler/capacity` renderuje się poprawnie, ale w horyzoncie 7 dni (07-29…08-04) **wszystkie
komórki to `0h`** dla wszystkich czterech linii, a `/en/scheduler` zgłasza „The run produced no
assignments — there are no open work orders in the horizon.". Nie ma czego liczyć podwójnie, więc
poprawki podwójnego liczenia **nie da się dziś potwierdzić ani obalić**.

---

## Rezydua danych testowych (zapisy wyłącznie przez interfejs)

| obiekt | stan | uwaga |
|---|---|---|
| `mrp_runs` `a496e680-7db0-40ae-9953-27e39b02c8ff` (`MRP-20260729-97CB4D75`) | **zostaje** | interfejs nie ma kasowania przebiegów; licznik 3 → **4** |
| `mrp_requirements` — 11 wierszy tego przebiegu | **zostaje** | jw.; licznik 37 → **48** |
| `downtime_events` `17736c50-e4b1-4c21-b81c-83b9f34cbf2c` (94,8 s, `duration_min = 2`) | **zostaje** | WO `E2E-A-N1-DISPLAY`; brak kasowania w interfejsie |
| `downtime_events` `fbb8ffd5-b807-4feb-8032-70b048531386` (10,8 s, `duration_min = 0`, `durationBelowMinute`) | **zostaje** | jw.; licznik 5 → **7** |
| `work_orders` `E2E-A-N1-DISPLAY` | **status przywrócony** (`IN_PROGRESS`) | ale `paused_at` został na `2026-07-29 01:25:28…` — aplikacja go nie czyści (Z10-03). W `wo_executions` / „Event log" doszły **2 cykle** pauza-wznowienie |
| `reorder_thresholds` | **przywrócone do stanu wyjściowego** | 1 wiersz `a2fb7624…`, `site_id` NULL, min `15.875000`, reorder `4.000000`. Override `819f7b4b…` utworzony i **skasowany przez interfejs** |
| `calibration_instruments` | **bez zmian** (3 wiersze) | próba `E2E-F10-INVRANGE` odrzucona, nic nie powstało |

Zgodnie z zasadą „zapisy tylko przez interfejs" nie usuwałem niczego przez `psql`.

---

## Podsumowanie

- **Wszystkie cztery regresje P0 z Fali 9 są zamknięte i udowodnione behawioralnie.** „Save this run"
  zapisuje (`mrp_runs` 3→4, status `completed`), historia przebiegów jest widoczna i otwieralna przy
  wybranym zakładzie, `/en/production` wstał, edycja progu globalnego nie rozwidla danych.
- **Fala 10: cztery punkty w zakresie udowodnione**, w tym najtrudniejszy — sub-minutowa przerwa
  **zachowana** z sekundami w `ext_jsonb`, a nie skasowana.
- **Jedno zastrzeżenie, mówię wprost:** odrzucenie jawnego zera zadziałało **tylko po stronie klienta** —
  serwerowej bramki na prodzie **nie wykonałem** i jej nie udowodniłem. Kod ją ma, log sieciowy pokazuje,
  że żądanie nigdy nie wyszło.
- **Jedno nowe znalezisko tej samej rodziny co P0-02:** dashboard produkcji w ogóle nie filtruje po
  zakładzie, choć listy WO obok — filtrują (Z10-01).
- **Nierozstrzygnięte na dzisiejszych danych:** podwójne liczenie obłożenia (PF-R12-02) — horyzont pusty.
