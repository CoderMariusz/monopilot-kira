# OEE — dostępność × wydajność × jakość / migawki / andon / pulpity linii (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde twierdzenie poniżej jest zakotwiczone w
> rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie jest zmyślone.
> Moduł żyje w **jednej grupie tras** — ekrany **OEE** na desktopie pod
> `…/(modules)/oee/**` (łącze nawigacyjne `/oee`, zarejestrowane w
> `lib/navigation/module-registry.ts:255-269`) — z dwoma powierzchniami: **pulpit
> OEE** (`/oee`, kafelki KPI + tabela A/P/J na linię + lista ostatnich migawek) oraz
> **tablica Andon** (`/oee/andon`, siatka żywego statusu na linię →
> `/oee/andon/[lineId]` pełnoekranowy kiosk odpytujący trasę JSON ze statusem).
>
> **GRANICA WŁAŚCICIELA KANONICZNEGO (D-OEE-1, najważniejszy fakt dotyczący tego
> modułu):** 15-oee jest **wyłącznie konsumentem do odczytu** `oee_snapshots`.
> **08-production jest JEDYNYM producentem/zapisującym** — wiersz migawki jest
> zapisywany przez `apps/web/lib/production/oee-snapshot-producer.ts` wewnątrz
> transakcji zakończenia ZP, nigdy tutaj. Migracja schematu 15-oee
> (`packages/db/migrations/203-oee-schema-foundation.sql:25-36`) **kończy się
> niepowodzeniem preflight**, jeśli `public.oee_snapshots` (własność 08, mig 184)
> jest nieobecna, i **nie tworzy bazowej tabeli `oee_snapshots`/`downtime_events`**
> — tylko zmaterializowane widoki i tabele referencyjne na podstawie tabel
> producenta należących do 08. Każdy odczyt 15-oee to `SELECT`; w `oee/**` nie ma
> **żadnej Server Action, żadnego route handlera ani żadnej mutacji**, która
> zapisywałaby jakąkolwiek tabelę OEE.
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatni przegląd na podstawie
> niezatwierdzonego drzewa roboczego (żywy pulpit + żywa tablica Andon; kopia
> „graceful andon stub" z epoki R4 jest już nieaktualna — zob. Znane braki).

---

## a. Przegląd

Moduł OEE **odczytuje** dane o efektywności produkcji wytwarzane przez
08-production i prezentuje je na trzy sposoby: **pulpit z oknem czasowym**
(średnie OEE zakładu + mikro-statystyki A/P/J, zestawienie na linię, rejestr
ostatnich migawek) oraz **tablica Andon na hali produkcyjnej** (jedna karta na
linię produkcyjną pokazująca żywy status pracy linii, bieżące ZP, dobre/złomowane
kg oraz OEE% z ostatniej migawki). Moduł **nie posiada żadnej operacyjnej ścieżki
zapisu** — jego jedynym zadaniem jest agregacja i wyświetlanie danych z
`oee_snapshots` oraz kilka żywych odczytów z produkcji dla tablicy Andon.

**Sama matematyka OEE nie jest obliczana tutaj.** Wartości `availability_pct`,
`performance_pct`, `quality_pct` migawki są obliczane raz, przez producenta w
08-production (`oee-snapshot-producer.ts`), w momencie zakończenia ZP; `oee_pct`
jest **kolumną GENERATED** (`A×P×Q/10000 STORED`,
`184-production-changeover-allergen-oee.sql:162-164`), której producent w ogóle
nie zapisuje. 15-oee wykonuje wyłącznie `avg()` / `round()` na tych
przechowywanych wartościach procentowych. Kontrakt zakłada **uczciwe NULL**: każdy
komponent, który nie może zostać obliczony (brak źródła czasu standardowego →
`performance_pct` NULL; zerowy mianownik jakości → `quality_pct` NULL) jest
przechowywany jako NULL, `oee_pct` propaguje NULL, a UI wyświetla `—` zamiast
zmyślonej liczby (`oee/_components/oee-tables.tsx:20-23`).

Odczyt pulpitu jest chroniony po stronie serwera uprawnieniem **`oee.dashboard.read`**
(`oee/_actions/oee-data.ts:28,141-142`); tablica Andon **nie jest w ogóle bramkowana
uprawnieniami** (wyłącznie zakres RLS — zob. Znane braki). Wartości procentowe
pozostają **tekstem od końca do końca** na wyjściu loadera pulpitu (SQL `round(...)::text`),
aby uniknąć rundtrip przez liczbę zmiennoprzecinkową JS (`oee-data.ts:154-164`).

Warstwa odczytu składa się z dwóch plików: `oee/_actions/oee-data.ts`
(`getOeeScreen` — loader pulpitu) oraz `oee/andon/andon-data.ts`
(`getAllLinesLiveStatus` / `getLineLiveStatus` — żywe odczyty dla Andona).
Warstwa prezentacji to `oee/_components/oee-tables.tsx` (tabele pulpitu),
`oee/andon/page.tsx` + `oee/andon/andon-live-card.tsx` (kiosk) oraz endpoint
JSON do odpytywania `oee/andon/[lineId]/status/route.ts`.

---

## b. Inwentarz funkcji

> Odczyty wskazują dotykane tabele/widoki Postgres. **Brak kolumny zapisu** —
> żaden element tego modułu nie mutuje stanu (D-OEE-1). „Bramka" to uprawnienie
> sprawdzane po stronie serwera; brak uprawnienia zwraca typizowane
> `{ ok:false, reason:'forbidden' }` (pulpit), nigdy 500. Wszystkie odczyty działają
> wewnątrz `withOrgContext` (RLS `org_id = app.current_org_id()` jako `app_user`).

### Odczyt pulpitu — `oee/_actions/oee-data.ts`

| Funkcja | Co robi | Odczytuje | Bramka |
|---|---|---|---|
| `getOeeScreen({siteId?,window?})` | Cały pulpit `/oee` w jednym wywołaniu. Wykonuje **trzy SELECT** na `oee_snapshots`: (1) **Kafelki KPI** — `count(*)` + `round(avg(oee_pct/availability_pct/performance_pct/quality_pct),1)::text`; `avg()` pomija NULL-e, kolumna samych NULL-i → NULL → kafelek `—`. (2) **Agregat na linię** — grupowanie po `line_id`, `count(distinct active_wo_id)` jako liczba ZP, średnia A/P/J/OEE, `left join production_lines on pl.id::text = s.line_id` w celu rozwiązania kodu/nazwy (fallback `'unassigned'`), `order by avg(oee_pct) desc nulls last limit 50`. (3) **Ostatnie migawki** — 15 najnowszych, łącząc `production_lines` po kod linii i `work_orders` po numer ZP. Opcjonalny `siteId` jest wiązany we **wszystkich trzech** odczytach; opcjonalny `window` (z selektora okresu raportowego) jest wiązany jako znaczniki czasu (`oee-data.ts:144-258`). | `oee_snapshots`, `production_lines`, `work_orders`, `user_roles`/`roles`/`role_permissions` (sprawdzenie uprawnienia) | `oee.dashboard.read` |

### Żywe odczyty dla Andona — `oee/andon/andon-data.ts`

| Funkcja | Co robi | Odczytuje | Bramka |
|---|---|---|---|
| `getAllLinesLiveStatus(orgId)` | Jeden wiersz **na rekord `production_lines`**: linia + jej bieżące aktywne ZP (wybór `lateral` ZP linii o statusie `RELEASED`/`IN_PROGRESS`/`ON_HOLD`, w toku jako pierwsze), dobre/złomowane **kg** zsumowane na żywo z `wo_outputs` (`qa_status<>'FAILED'` vs `=FAILED`) + `wo_waste_log`, **najnowsze** `oee_pct` z migawki (wybór `lateral` po `oee_snapshots` od najnowszych), oraz `last_activity_at` = `max()` z dat migawek/ZP/wykonania/wyników/odpadów. Status wyprowadzany (`deriveStatus`) na podstawie czasu pracy + `production_lines.status`. Posortowane po kodzie linii. | `production_lines`, `work_orders`, `wo_executions`, `items`, `wo_outputs`, `wo_waste_log`, `oee_snapshots` | **brak** (wyłącznie RLS — zob. braki) |
| `getLineLiveStatus(lineId,orgId)` | Ta sama projekcja dla pojedynczej linii (`pl.id = $2::uuid`); `andon_line_not_found` (→ 404 / `notFound()`) gdy UUID jest nieprawidłowy lub nieznaleziony. | jak powyżej | **brak** (wyłącznie RLS) |

Obie funkcje owijają odczyt w `withOrgContext` i `assertOrgScope` (strona przekazuje
wartownik `CURRENT_ORG_ID = 'current'`, który zawsze pasuje do rozwiązanego
`app.current_org_id()`; prawdziwa niezgodność org-id rzuca `andon_org_scope_mismatch`,
`andon-data.ts:121-125`).

### Endpoint odpytywania Andona — `oee/andon/[lineId]/status/route.ts`

| Handler | Co robi | Odczytuje | Bramka |
|---|---|---|---|
| `GET /oee/andon/[lineId]/status` | Odświeżanie JSON dla klienta kiosku (`{ data }`, `cache-control: no-store`). Wywołuje `getLineLiveStatus`; `404 {error:'not_found'}` przy `andon_line_not_found`, `500 {error:'persistence_failed'}` w pozostałych przypadkach. Klient (`andon-live-card.tsx:63-83`) odpytuje ten endpoint co **15 s** i zachowuje ostatni dobry stan przy przejściowym błędzie. | przez `getLineLiveStatus` | **brak** (wyłącznie RLS) |

**Zinwentaryzowana liczba funkcji: 4** (1 loader pulpitu, 2 żywe odczyty Andona, 1
handler route do odpytywania) — **wszystkie odczyty, zero zapisów**. W `oee/**`
nie ma **żadnych Server Action** (brak modułu `'use server'`; loader pulpitu jest
wywoływany podczas renderowania RSC, `oee-data.ts:17`). Jedyny *zapis* OEE w
całej bazie kodu należy do 08-production: `recordWoCompletionSnapshot`
(`lib/production/oee-snapshot-producer.ts`), opisany poniżej jako kanoniczny
producent.

---

## c. Model obliczania OEE (gdzie faktycznie żyje matematyka)

Wartość złożona to podręcznikowe **OEE = Dostępność × Wydajność × Jakość**, jednak
każdy czynnik jest obliczany **raz, przez 08-production**, w
`recordWoCompletionSnapshot` (`oee-snapshot-producer.ts`), wywoływanym z
`completeWo` wewnątrz transakcji zakończenia ZP. 15-oee nigdy nie przelicza —
uśrednia przechowywany wynik.

### Matematyka producenta (`oee-snapshot-producer.ts`, własność 08-production)

```
runtime      = completed_at − started_at           (minuty; brakujące/zero ⇒ BRAK wiersza)
downtime     = scalona suma nakładających się przestojów tego ZP przyciętych do okna
                 (nakładające się zdarzenia SCALONE, otwarte zdarzenia przycięte do końca okna)
expected     = SUM(wo_operations.expected_duration_minutes)        (NULL gdy brak)

Availability = (runtime − downtime) / runtime × 100                obcięcie [0,100]
Performance  = expected / (runtime − downtime) × 100               UCZCIWY NULL gdy
                 expected jest NULL/0 lub czas rzeczywistej pracy wynosi 0; >100 obcinane do 100
Quality      = good / (good + rejected + waste) × 100              UCZCIWY NULL przy
                 zerowym mianowniku
                   good     = Σ wo_outputs.qty_kg WHERE qa_status <> 'FAILED'
                   rejected = Σ wo_outputs.qty_kg WHERE qa_status  = 'FAILED'
                   waste    = Σ wo_waste_log.qty_kg
OEE          = A × P × Q / 10000      ← kolumna GENERATED, propaguje NULL
```

Zakotwiczenia: dostępność `computeAvailabilityPct` (`oee-snapshot-producer.ts:114-119`),
wydajność `computePerformancePct` (`:121-134`), jakość `computeQualityPct`
(`:136-146`), wartość złożona `computeOeePct` (`:148-156` — odwzorowuje kolumnę
GENERATED na potrzeby testów jednostkowych), scalanie przestojów `totalDowntimeMinutes`
(`:77-112`). Udokumentowany wybór projektowy dotyczący jakości: wyniki o statusie
PENDING/PASSED/RELEASED/ON_HOLD **są liczone jako dobre**, dopóki QA faktycznie ich
nie zakwestionuje (`:30-36`).

### Ziarnistość migawek i idempotentność

- **Ziarnistość:** jeden wiersz na zakończone ZP, `snapshot_minute = date_trunc('minute', completed_at)`.
- **V-PROD-10 czwórka unikalna** `(org_id, line_id, shift_id, snapshot_minute)`
  (`184-…oee.sql:174`) — dwa różne ZP zakończone na tej samej linii+zmianie+minucie
  sprowadzają się do jednego wiersza (wygrywa pierwszy zapisujący; udokumentowane
  ograniczenie ziarnistości, `mig 287:27-29`).
- **Idempotentność na ZP:** częściowy unikalny indeks `(org_id, active_wo_id)`
  (`287-oee-snapshot-wo-complete-producer.sql:40-42`) **plus** klauzula `WHERE NOT EXISTS`
  + `ON CONFLICT DO NOTHING` w producentcie — ponowne odtworzenie COMPLETE w R14 jest
  cichą operacją no-op, nigdy przerwaną transakcją (`oee-snapshot-producer.ts:267-298`).
- **Kontekst:** `line_id = work_orders.production_line_id::text` (fallback
  `'unassigned'`); `shift_id` = ostatni niepusty `downtime_events.shift_id` dla ZP
  (fallback `'unspecified'` — brak podłączonego kalendarza zmian do ścieżki zakończenia);
  `site_id = work_orders.site_id` (`oee-snapshot-producer.ts:193-213`).
- **Relaksacja NULL:** mig 184 stworzył `performance_pct`/`quality_pct` jako `NOT NULL`
  (projekt agregatora per-minutę); mig 287 **usuwa oba NOT NULL**
  (`287:31-32`), aby producent ziarnistości ZP mógł przechowywać uczciwe NULL-e.
  Ograniczenia CHECK zakresu 0..100 nadal obowiązują (CHECK przepuszcza NULL).

### Co 15-oee robi z przechowanymi liczbami

- **KPI pulpitu / linie:** `round(avg(<pct>),1)::text` w oknie — komponent NULL po
  prostu wypada ze średniej; kolumna samych NULL-i → NULL → `—`
  (`oee-data.ts:153-205`).
- **Ostatnie wiersze + Andon:** `round(<pct>,1)::text` na migawkę (`oee-data.ts:239-242`);
  karta Andona odczytuje **pojedyncze najnowsze** `oee_pct` na linię i formatuje je
  `toFixed(1)` po stronie klienta (`andon-data.ts:42-50`, `andon/page.tsx:57`).

### Maszyna stanów statusu linii Andon (`andon-data.ts:143-157`)

```
deriveStatus(line.status, wo.runtime_status):
  runtime 'in_progress'                       → Running  (szmaragdowy)
  runtime 'paused'                            → Paused   (bursztynowy)
  line.status inactive/maintenance/down       → Down     (czerwony)
  line.status setup                           → Paused   (bursztynowy)
  w pozostałych przypadkach                  → Idle     (bursztynowy)
```

`runtime_status` to `wo_executions.status` z rezerwowym mapowaniem po
`work_orders.status` (`RELEASED→planned`, `IN_PROGRESS→in_progress`,
`ON_HOLD→paused`, `andon-data.ts:54-61`) — tzn. odzwierciedla cykl życia
wykonania ZP z 08-production, tylko do odczytu.

<!-- screenshot: oee dashboard (KPI tiles + OEE-by-line table + recent snapshots) -->
<!-- screenshot: oee/andon board (per-line status cards) -->
<!-- screenshot: oee/andon/[lineId] kiosk (full-screen line status, 15s poll) -->

---

## d. Instrukcje obsługi dla użytkownika

> Tekst przycisków/etykiet poniżej to dosłowna treść angielska z przestrzeni nazw
> `oee.*` next-intl (`apps/web/i18n/en.json`); `data-testid`-y w nawiasach to
> stabilne kotwice w kodzie komponentów.

### (i) Odczyt pulpitu OEE

1. Otwórz **OEE** z paska bocznego (`/oee`, `module-landing-oee`). Nagłówek strony
   wyświetla **"OEE"** z podtytułem *"Overall Equipment Effectiveness — availability,
   performance and quality from completed work orders"*.
2. **Selektor okresu** (ponownie użyty z Raportowania — `period-selector.client.tsx`,
   `oee-period-selector`) ustawia okno (Today / This week / This month /
   This quarter / Last 7 days / Last 30 days / Custom); filtry linii i wyszukiwania są
   tu **celowo ukryte** (`showLineFilter={false}`, `oee/page.tsx:242-243`).
   Domyślne okno = ostatnie 7 dni.
3. **Kafelki KPI** (`oee-kpi-oee` / `-availability` / `-quality` / `-snapshots`)
   pokazują średnie OEE, dostępność, jakość i liczbę migawek w oknie; NULL w średniej
   wyświetla się jako `—` (`oee/page.tsx:191-211`).
4. **"OEE by line — last 7 days"** (`oee-lines-table`): jeden wiersz na linię z
   liczbą ZP + OEE/A/P/J %, najlepsza OEE jako pierwsza; komórka linii wyświetla
   mono **kod** nad przyciemioną **nazwą** (lub `Unassigned`).
5. **"Recent snapshots"** (`oee-snapshots-table`): 15 najnowszych — czas zakończenia,
   linia, zmiana, numer ZP, A/P/J/OEE %, wynik kg, przestój min, odpady kg; każda
   brakująca wartość to `—`.
6. **Stan pusty** (`oee-empty`): *"No snapshots yet — OEE snapshots are produced
   when a work order is completed. Complete a work order in Production…"*. To uczciwy
   stan dla organizacji, która nigdy nie zakończyła ZP.
7. **Odmowa dostępu** (`oee-denied`) przy braku `oee.dashboard.read`; **błąd**
   (`oee-error`) przy awarii odczytu.

### (ii) Tworzenie migawki (odbywa się w Produkcji, nie tutaj)

W OEE **nie ma akcji „utwórz migawkę"**. Migawka jest tworzona przy **zakończeniu
zlecenia produkcyjnego** w 08-production (Produkcja → Zlecenia produkcyjne → otwórz
uruchomione ZP → **Zakończ**). `completeWo` wywołuje `recordWoCompletionSnapshot`
wewnątrz transakcji zakończenia; nowy wiersz pojawia się następnie w KPI pulpitu
OEE, tabeli linii i ostatniej liście, a także jako najnowszy OEE% linii na tablicy
Andon. Jeśli ZP nie posiada `wo_operations.expected_duration_minutes`, wartość
**Wydajność** będzie `—` (uczciwy NULL) — podobnie jak OEE.

### (iii) Obserwacja tablicy Andon (status linii na hali produkcyjnej)

1. Przejdź do **`/oee/andon`** (`module-landing-oee-andon`), nagłówek **"Andon board"**.
   Każda **karta linii** pokazuje kod/nazwę linii, kolorową **plakietkę statusu**
   (`andon-status-badge`: Running/Paused/Idle/Down), bieżące **ZP**, najnowszy
   **OEE %**, **Dobre** + **Złom** kg oraz czas **Ostatniej aktywności**.
   `andon-empty` ("No production lines are configured yet.") gdy nie istnieją żadne linie.
2. Kliknij kartę → **`/oee/andon/[lineId]`** otwiera pełnoekranowy **kiosk**
   (`andon-kiosk`) — duży mono kod linii, plakietka statusu, bieżące ZP + produkt
   oraz kafelki metryk Dobre/Złom/OEE, wygląd zależny od statusu (powłoki
   szmaragdowe/bursztynowe/czerwone).
3. Kiosk **automatycznie odświeża się co 15 s** odpytując
   `/[locale]/oee/andon/[lineId]/status` (`andon-live-card.tsx:63-83`); przy
   przejściowym błędzie odpytywania utrzymuje na ekranie ostatni znany stan.

> **Uwaga (uczciwa):** tablica Andon działa aktualnie w oparciu o **normalną
> autentykację aplikacji** — stopka informuje: *"Kiosk access currently uses normal
> app authentication. Token auth will be added later."* (`oee.andon.tokenAuthTodo`,
> `andon-live-card.tsx:136-137`, `andon/page.tsx:103-104`). Brak tokenu kiosku i
> bramki uprawnień (zob. Znane braki).

---

## e. Źródła danych (tabele / widoki Supabase)

Konsumowane wyłącznie do odczytu (kanoniczny producent to 08-production):

- `oee_snapshots` — **kanoniczne 08-production** (mig 184; producent
  `lib/production/oee-snapshot-producer.ts`). 15-oee wykonuje wyłącznie `SELECT`:
  `availability_pct` / `performance_pct` / `quality_pct` / generowane `oee_pct`,
  plus `output_qty_delta` / `downtime_min_delta` / `waste_qty_delta`,
  `line_id` (text) / `shift_id` (text) / `snapshot_minute` / `active_wo_id` /
  `site_id`. Wymuszony RLS; `app_user` ma uprawnienia DML na poziomie tabeli, ale
  **żaden kod 15-oee ich nie używa** — jedynym zapisującym jest producent w 08-production.
- `production_lines` — łącze `id::text = oee_snapshots.line_id` po kod/nazwę linii
  (pulpit + Andon).
- `work_orders` / `wo_executions` — numer ZP + status wykonania (wybór bieżącego ZP
  dla Andona; numer ZP w ostatnim wierszu pulpitu).
- `wo_outputs` / `wo_waste_log` — żywe zestawienie dobrych/złomowanych **kg** dla
  karty Andona (tablice kanoniczne 08-production; odczytywane tutaj).
- `items` — nazwa produktu w kiosku Andona.
- `user_roles` / `roles` / `role_permissions` — sprawdzenie uprawnienia `oee.dashboard.read`
  w `getOeeScreen` (`oee-data.ts:113-131`).

Schemat należący do 15-oee (tworzony przez `203-oee-schema-foundation.sql`) —
**obecny, ale jeszcze niekonsumowany przez żaden kod aplikacji `oee/**`** (zaległości,
zob. braki):

- `shift_configs` — definicje zmian na organizację (jedynym zapisującym/odczytującym
  jest dziś Ustawienia → Zmiany, `(admin)/settings/shifts/_actions/shifts.ts` — nie
  ekrany OEE).
- `oee_alert_thresholds` — cel OEE na linię/organizację + parametry anomalii/konserwacji.
- `shift_patterns`, `org_non_production_days` — tabele administracyjne kalendarza zmian.
- `big_loss_categories` — powszechna taksonomia Sześciu Wielkich Strat Nakajimy (brak
  `org_id`, dostępna dla wszystkich; zasiana w mig 203).
- Widok zmaterializowany `oee_shift_metrics` (zestawienie per-zmiana + kolumny stub
  MTTR/MTBF) oraz `oee_daily_summary` (dzienne zestawienie 90-dniowe + najlepsza/najgorsza
  zmiana) — oba stworzone `WITH NO DATA`; `REFRESH … CONCURRENTLY` ma być uruchamiane
  z `apps/worker` (T-009), który **nie działa**.
- Wiersze rejestru reguł DSL w `rule_definitions` (tabela należąca do 02-settings):
  przepływ pracy `shift_aggregator_v1` to aktywna reguła P1; `oee_anomaly_detector_v1`
  i `oee_maintenance_trigger_v1` są zasiane jako **nieaktywne** zaślepki P2
  (`mig 203:426-454`).

Zarządzanie / zdarzenia:

- `outbox_events` — mig 203 dopuszcza pięć typów zdarzeń producenta do CHECK
  (`oee.alert.threshold_breached`, `oee.anomaly.detected`, `oee.dsl_rule.updated`,
  `oee.shift.aggregated`, `oee.snapshot.refreshed`, `mig 203:521-525`) — są one
  **emitowane przez niedziałający jeszcze silnik worker/DSL, nie przez żaden kod `oee/**`**.
- RBAC: rodzina 13 łańcuchów `oee.*` jest zasiana dla rodziny org-admin +
  ról `oee_admin`/`oee_supervisor`/`oee_viewer` zarówno w `role_permissions`, jak i
  w pamięci podręcznej `roles.permissions` (mig 203 §10, poprawiony przez mig 219).
  Enum deklaruje wszystkie 13 (`packages/rbac/src/permissions.enum.ts:394-418`).

---

## f. Znane braki / TODO

Ugruntowane w przeczytanym kodzie — bez domysłów:

1. **Tablica Andon NIE ma bramki uprawnień.** `andon/page.tsx`,
   `andon/[lineId]/page.tsx`, endpoint odpytywania `status/route.ts` oraz
   `andon-data.ts` działają pod `withOrgContext` (zakres RLS org), ale **nigdy nie
   wywołują `hasPermission`** — każdy uwierzytelniony użytkownik w organizacji może
   otworzyć kiosk. Zasiane uprawnienie **`oee.tv.kiosk_view`**
   (`permissions.enum.ts:418`, nadane w mig 203) **nie jest odczytywane przez żaden
   kod**. Należy podłączyć `oee.tv.kiosk_view` do stron Andona + trasy statusu.

2. **Brak uwierzytelniania tokenu kiosku.** Kiosk Andon jawnie działa pod normalnym
   uwierzytelnianiem aplikacji z `// TODO: kiosk token auth` i komunikatem
   `tokenAuthTodo` widocznym dla użytkownika (`andon-live-card.tsx:136`,
   `andon/page.tsx:103-104`). Prawdziwy telewizor na hali produkcyjnej wymaga
   ograniczonego zakresu tokenu, a nie zalogowanej sesji.

3. **Treści „graceful andon stub" są teraz osierocone.** Naprawa z epoki R4
   (commit `ec5a3ef3`) dodała `oee.andon.stubBadge` ("Coming soon") +
   `oee.andon.stubNotice` ("The live Andon kiosk … ships in a later OEE wave …")
   do `i18n/en.json`. Aktualne drzewo robocze renderuje tablicę Andon z **prawdziwymi
   danymi na żywo** i **żaden komponent nie odwołuje się do tych dwóch kluczy** —
   treść zaślepki to martwy i18n do usunięcia (lub tablica jest zamiennikiem
   zaślepki, a klucze są przestarzałe). Uczciwe stwierdzenie: **tablica Andon jest
   ŻYWA, a nie zaślepką; *łańcuchy* zaślepki to pozostałość.**

4. **Potok agregacji zmaterializowanych widoków istnieje tylko jako schemat.**
   `oee_shift_metrics` i `oee_daily_summary` istnieją `WITH NO DATA` (mig 203 §6/§7)
   i są odświeżane wyłącznie przez `apps/worker` (T-009), który **nie działa** (zgodnie
   z `MON-project-overview`). Pulpit odczytuje zatem bezpośrednio bazową
   `oee_snapshots`, a nie widoki zmaterializowane — zestawienia na poziomie zmiany,
   najlepsza/najgorsza zmiana i 90-dniowe dzienne podsumowanie udostępniane przez te
   widoki **nie mają jeszcze interfejsu**.

5. **Większość zasianych uprawnień `oee.*` jest nieużywana.** Z rodziny 13 łańcuchów
   egzekwowane jest wyłącznie **`oee.dashboard.read`** (loader pulpitu). Uprawnienia
   `oee.target.edit`, `oee.override.create/delete`, `oee.export.csv/pdf`,
   `oee.anomaly.acknowledge`, `oee.big_loss.map_edit`, `oee.shift_pattern.edit/read`,
   `oee.downtime.annotate`, `oee.downtime.escalate`, `oee.tv.kiosk_view` nie mają
   **żadnego kodu konsumującego** — stoją za niewybudowanymi jeszcze ekranami
   administracji/eksportu/anomalii (mig 203 §10 / PRD T-014..T-026).

6. **Brak celów OEE, alertów o anomaliach, Sześciu Wielkich Strat, eksportów ani
   widoków szczegółowych w interfejsie.** Strona pulpitu dokumentuje uczciwy podzbiór,
   który dostarcza, i jawnie odracza zakładki (Sześć Wielkich Strat / Przezbrojenia),
   mapę ciepła, sparkline'y, banery alertów, pasek eksportu i stronicowanie dat do
   zaległości 15-OEE (T-014..T-019, `oee/page.tsx:8-12`; `oee-tables.tsx:6-9`).
   Tabele `oee_alert_thresholds`, `big_loss_categories`, `shift_patterns` i
   `org_non_production_days` nie mają ekranu.

7. **Reguły DSL P2 to nieaktywne zaślepki.** `oee_anomaly_detector_v1` i
   `oee_maintenance_trigger_v1` są zasiane z `active:false` i `active_to` ustawionym
   na „teraz" (tzn. natychmiast nieaktywne) w oczekiwaniu na flagi funkcji
   `oee.anomaly_detection_enabled` / `oee.maintenance_trigger_enabled`
   (`mig 203:426-454`). Kanał MTBF/MTTR 13-MNT i integracja reject_kg z 09-QA
   wspomniana w `MON-domain-oee` są P2 i niepodłączone (kolumny `mttr_min`/`mtbf_min`
   widoku zmaterializowanego to uproszczone formuły zaślepek, `mig 203:289-296`).

8. **Zastrzeżenia dotyczące ziarnistości migawek odziedziczone po producencie.**
   W obrębie jednej linii+zmiany+minuty dwa różne zakończone ZP sprowadzają się do
   jednego wiersza migawki (V-PROD-10 czwórka unikalna, wygrywa pierwszy zapisujący,
   `mig 287:27-29`); `shift_id` spada do `'unspecified'`, ponieważ żaden kalendarz
   zmian nie jest podłączony do ścieżki zakończenia
   (`oee-snapshot-producer.ts:204-213`); `line_id` spada do `'unassigned'` dla ZP
   bez linii. Pulpit wyświetla te wartości rezerwowe jako `Unassigned` i dosłowny
   łańcuch `unspecified` dla zmiany.

W warstwie odczytu OEE nie istnieją żadne surowe znaczniki `// TODO` poza dwoma
`// TODO: kiosk token auth` cytowanymi powyżej; pozostałe braki wynikają z
obserwowanego w kodzie rozjazdu między schematem a brakiem interfejsu oraz zasianym
uprawnieniem a brakiem konsumenta, a także z jawnych not o „uczciwym podzbiorze"
zawartych w kodzie strony/loadera.
