# Faza 1 — werdykty przeliczenia 55 FAIL

Zasada: werdykt tylko z **twardym dowodem uruchomieniowym**. „Nieosiągalne na dzisiejszych
danych" i „zablokowane bramką" są akceptowalnymi werdyktami. Renderowanie ekranu nie jest dowodem.

Środowisko dowodowe: izolowana baza (klon `monopilot_t2`, pełny łańcuch 506 migracji + mig 544).

---

## Partia 1 — 6 ID (`PRD-001/008/009/014`, `SFQ-164/166`)

**Stan wyjściowy:** oba pliki testowe były **niewykonalne** — padały na tworzeniu organizacji
(patrz `BLOKER-TWORZENIA-ORGANIZACJI.md`). Po migracji 544: 17 testów wykonanych, 7 zielonych.
Po triage'u fixture'ów: **16 zielonych, 1 czerwony**.

| ID | 19.07 | dziś | podstawa |
|---|---|---|---|
| `SFQ-164` | FAIL | **PASS** | fixture nie nadawał `mnt.mwo.execute`; `mwo-actions.ts:1528-1532` sprawdza je PRZED bramką LOTO, więc `forbidden` maskował asercję o podpisach |
| `SFQ-166` | FAIL | **PASS** | jw. — kontrakt dwuosobowego podpisu i SoD nietknięty, przeszedł po naprawie grantu |
| `PRD-001` | FAIL | **PASS** | test oczekiwał `in_progress`; schemat (`packages/db/schema/work-orders.ts:119-121`) i `wo-state-machine.ts:55-63` używają `IN_PROGRESS` |
| `PRD-009` | FAIL | **PASS** | fixture nie zapisywał zużycia; `complete-cancel-wo.ts:180-216` wymaga dodatniego zużycia i bilansu w tolerancji 2% |
| `PRD-014` | FAIL | **PASS** | fixture używał roli `admin`, a `has-permission.ts:14,26-35` nadaje takim rolom **wszystkie** uprawnienia — usunięcie pojedynczego grantu nie mogło dać `forbidden`. Zastąpione rolą niesuperuserową |
| `PRD-008` | FAIL | **FAIL — potwierdzony defekt kodu** | `wo-state-machine.ts:208-218` rozpoznaje replay, ale `start-wo.ts:218-234,302-315` mimo to zapisuje outbox; `shared.ts:141-156` nie deduplikuje → **dwa** zdarzenia `production.wo.started` zamiast jednego |

**Bilans partii: 5 PASS, 1 FAIL.** Cztery z pięciu PASS-ów to były defekty fixture'ów, nie kodu —
czyli werdykty z 19.07 były nieaktualne albo od początku mierzyły co innego.

### Wzorzec z tej partii
**Testowanie z roli `admin` maskuje bramki uprawnień**, a brakujący grant w fixture'ze maskuje
*inną* bramkę, którą test miał sprawdzać. Pięć testów LOTO wyglądało na sprawdzające podpisy,
a w rzeczywistości zatrzymywało się na uprawnieniu do wykonania zlecenia.
To jest dokładnie powód, dla którego Faza 0.3 (persony bez wybranych uprawnień) była konieczna.

### `PRD-008` — dlaczego to znaczy więcej, niż wygląda
Duplikat zdarzenia w outboxie dziś nie boli, bo **outbox nigdy się nie opróżnia** (trzy crony
eksportowały tylko POST, a Vercel woła GET — naprawione w commicie `739f9223`).
Po wdrożeniu tej naprawy duplikaty zaczną docierać do konsumentów.
Kolejność wdrożenia ma tu znaczenie.

---

## Pozostało: 49 z 55 ID
Rozkład domenowy pozostałych i przewidywania w `FAZA-1-FAIL-RECHECK.md`.

**Ograniczenie, które trzeba znać przy planowaniu reszty:** kontrakty wymagające dowodu
**w przeglądarce** są dziś nieosiągalne — React nie hydratuje pod lokalnym harnessem, więc żadna
akcja serwerowa wywoływana z `onClick` nie jest wykonalna. Dotyczy to zwłaszcza 11 kontraktów `UI-*`.
Diagnoza w toku. Kontrakty dowodliwe na poziomie akcji serwerowych (jak ta partia) idą normalnie.

---

## Partia 2 — 8 ID (domeny `WH`, `TEC`)

Dowody na klonie `monopilot_t3`. **Żaden werdykt PASS nie został przyznany na podstawie
zielonego testu opartego wyłącznie na mockach** — to była świadoma decyzja, nie brak wyniku.

| ID | 19.07 | dziś | podstawa |
|---|---|---|---|
| `TEC-049` | FAIL | **FAIL — defekt kodu** | `blocked→active` zwraca `{ok:true}` zamiast `invalid_transition`; walidator w ogóle nie przyjmuje `draft` (`technical/items/_actions/shared.ts:501`). **Zweryfikowane przeze mnie niezależnie.** |
| `WH-066` | FAIL | **FAIL — defekt kodu + ANTY-TEST** | akcja rzuca `stock_changed_recount_required` przed podpisem i zapisami zamiast przeliczyć wariancję (`counts/_actions/count-actions.ts:1190`). Test jest ZIELONY, bo asertuje zachowanie **sprzeczne z kontraktem** (`count-actions.test.ts:593`) |
| `WH-125` | FAIL | **ANTY-TEST** | test oczekuje BRAKU `v_inventory_available` i `pickableQty=100`; kontrakt wymaga uwzględnienia rezerwacji (60). Akcja sumuje całe `lp.quantity` (`inventory-actions.ts:64`) |
| `WH-045` | FAIL | **PASS (poziom akcji)** | defekt `42P08` naprawiony w `739f9223`; drugi test miał zaszytą starą numerację `$4` — poprawiony. 3/3 testy `listStockMoves` + paginacja zielone. Dowód w przeglądarce niedostępny (brak hydracji) |
| `WH-121` | FAIL | **brak testu kontraktowego** | istnieje tylko kontrola `received/pending→available/released`; brak przypadku `destroyed`. Produkcyjna lista terminalna nadal pomija `destroyed` (`lib/warehouse/lp-qa-transition-core.ts:14`) |
| `TEC-275` | FAIL | **brak testu kontraktowego** | test gałęzi dodatniej asertuje wadliwe `href="../routings"`; nie sprawdza nawigacji ani HTTP 200 |
| `TEC-334` | FAIL | **brak testu kontraktowego** | brak gałęzi usunięcia źródła w kaskadzie alergenów; kod nadal tylko UPSERT-uje (`lib/technical/allergens/cascade.ts:102`) |
| `TEC-374` | FAIL | **brak testu kontraktowego** | test empty-state dostaje gotowe `rows=[]`; nie uruchamia `listLabResults` ani JOIN-a |

**Bilans partii: 1 PASS, 2 FAIL (defekty kodu), 5 bez testu kontraktowego.**

### 🔴 Najważniejsze z tej partii: ANTY-TESTY
**Trzy zielone testy certyfikują zachowanie sprzeczne z kontraktem** (`WH-066`, `WH-125`,
oraz `TEC-275` w gałęzi dodatniej). To jest **gorsze od braku testu**: brak testu jest widoczny
w pokryciu, a zielony anty-test daje fałszywą gwarancję i blokuje wykrycie defektu przez CI.

Odpowiedź na pytanie kontrolne *„czy ten test przeszedłby także bez sprawdzanego zachowania?"*
brzmi tu gorzej niż „tak" — te testy przechodzą **wyłącznie dlatego**, że zachowania nie ma.

### Znalezisko poboczne
`warehouse-list-site-actions.test.ts` → `listGrns` jest czerwony (oczekuje `g.site_id = $5::uuid`,
kod generuje `$4`). Zweryfikowane jako **czerwień zastana** (był w zbiorze bazowym), nie regresja.
Ta sama klasa co `WH-045`: rozjazd numeracji parametrów COUNT vs zapytanie o dane.

---

## Bilans Fazy 1 po dwóch partiach: 14 z 55 ID

| Werdykt | Ile |
|---|---|
| PASS | 6 |
| FAIL — potwierdzony defekt kodu | 3 (`PRD-008`, `TEC-049`, `WH-066`) |
| brak testu kontraktowego | 5 |
| Pozostało | 41 (w tym 18 zablokowanych brakiem hydracji) |

---

## Partia 3 — 11 ID (domeny `NSA`, `XC`, `PLN`)

| ID | 19.07 | dziś | podstawa |
|---|---|---|---|
| `XC-008` | FAIL (GET 405) | **PASS** | 11/11 zielonych na izolowanej bazie po naprawie cronów z `739f9223` |
| `NSA-067` | FAIL | **FAIL — defekt kodu** | akcja pobiera wyłącznie `raw_cost_eur` i wystawia je jako `totalCost` (`get-costing-rollup.ts:37,54`). Jedyny test rollupu dostaje gotowe `totalCost: 4.25` — nie wywołuje akcji ani bazy |
| `NSA-145` | FAIL | **FAIL — defekt kodu + ANTY-TEST** | onboarding kończy się bez sprawdzenia wymaganych kroków: akcja czyta tylko `onboarding_completed_at` i bezwarunkowo ustawia datę (`complete-onboarding.ts:47,54`). Test **mockuje organizację bez kroków i oczekuje sukcesu** (`test:102`) |
| `NSA-150` | FAIL (3 przecieki FK) | **FAIL — defekt kodu, potwierdzony uruchomieniem** | `AssertionError: expected 3 to be +0` — usuwanie danych osobowych zostawia **3 nieprzepseudonimizowane odwołania FK**. Zweryfikowane przeze mnie na izolowanej bazie |
| `NSA-161` | FAIL | **FAIL — defekt kodu** | precheck przed insertem, a `23505` z UNIQUE `(org_id, code)` trafia do ogólnego `persistence_failed` zamiast komunikatu o duplikacie (`create.ts:28,59`) |
| `XC-018` | FAIL | **FAIL — potwierdzony uruchomieniem** | `null value in column "name" of relation "users" violates not-null constraint` w `Users/route.ts:138`. **SCIM odłożony decyzją ownera nr 4** — nie naprawiane |
| `XC-047` | FAIL (21 kluczy) | **FAIL — defekt słowników + ANTY-TEST** | 624/624 testy i18n zielone, ale **allowlista wyklucza krytyczne klucze**. Pełne porównanie liści: PL brakuje **32**, UK i RO po **119** względem EN — m.in. paginacja Shipping, bramka zakończenia produkcji, edycja pozycji Technical |
| `PLN-015` | FAIL | **FAIL — defekt kodu** | create dopuszcza 4 miejsca dziesiętne, update i modal tylko 3 (`shared.ts:275`, `update-work-order.ts:69`, `create-wo-modal.tsx:173`). 37/37 testów zielonych, bo asertują ten rozjazd |
| `NSA-066` | FAIL | **brak testu kontraktowego** | 42/42 zielone, ale testy osobno utrwalają `setup=0` i realny setup; brak tego samego wejścia + zapisu + komunikatu |
| `XC-003` | FAIL (405) | **brak testu kontraktowego** | wszystkie 5 tras eksportuje dziś GET (naprawa `739f9223`), ale testy są mockowane; `drift`/`outbox` nie mają testów wcale |
| `XC-010` | FAIL (405) | **brak testu kontraktowego** | test GET zielony, ale mockuje połączenie i odświeżanie — nie dowodzi widoku zmaterializowanego ani izolacji dwóch organizacji |

**Bilans partii: 1 PASS, 7 FAIL (defekty kodu), 3 bez testu kontraktowego.**

### 🔴 `XC-047` — anty-test na skalę
624 zielone testy i18n przy **119 brakujących kluczach** w UK i RO. Allowlista sprawia,
że suita mierzy własną allowlistę, nie kompletność tłumaczeń. To najdroższy wariant anty-testu:
duża liczba zielonych testów buduje fałszywe zaufanie proporcjonalne do swojej liczby.

### 🔴 `NSA-150` — defekt zgodności z RODO
Usuwanie danych osobowych zostawia trzy odwołania. To nie jest defekt kosmetyczny.

---

## Bilans Fazy 1 po trzech partiach: 25 z 55 ID

| Werdykt | Ile |
|---|---|
| **PASS** | 7 |
| **FAIL — potwierdzony defekt kodu** | 10 |
| **brak testu kontraktowego** | 8 |
| Pozostało | 30 (w tym 11 `UI-*` w toku w przeglądarce) |

**Anty-testy wykryte łącznie: 6** (`WH-066`, `WH-125`, `TEC-275`, `NSA-145`, `XC-047`, oraz
`PLN-015` w wariancie „testy asertują rozjazd").

---

## Partia 4 — 12 ID (domeny `SFQ`, `PRD`)

**Bilans: 0 PASS, 3 FAIL (defekty kodu), 9 bez testu kontraktowego.**
Żaden PASS nie przyznany na testach opartych wyłącznie na atrapach.

| ID | dziś | podstawa |
|---|---|---|
| `PRD-083` | **FAIL — defekt kodu** | filtr `complete` wykonuje dokładne `dual_sign_off_status = $2`, nie toleruje legacy `completed` (`changeover-actions.ts:361`). Suita 21 PASS/1 skip nie sprawdza tego wariantu |
| `SFQ-072` | **FAIL — defekt kodu + ANTY-TEST** | kod woła preflight przed GRN/LP i rzuca `unresolved_uom`; kontrakt wymaga **zapisać receipt** i wykluczyć tylko WAC (`receive-po-line.ts:55`, `book-receipt-wac.ts:176`). Zielony test wymaga odrzucenia przed zapisami — utrwala defekt |
| `SFQ-075` | **FAIL — defekt kodu** | akcja mapuje `unsupported_currency` na prefiksowany `wac_unsupported_currency`, a `unknown_currency` na generyczne `error` — oba sprzeczne z katalogiem (`receive-po-line.ts:103`) |
| `PRD-058`, `PRD-061`, `SFQ-043`, `SFQ-050`, `SFQ-067`, `SFQ-069`, `SFQ-102`, `SFQ-107`, `SFQ-116` | **brak testu kontraktowego** | testy istnieją i są zielone (160 zielonych łącznie), ale oparte na atrapach SQL; nie dowodzą stanu trwałego, pełnego łańcucha bramek ani site-scope na prawdziwych użytkownikach |

### 🔴 Dwa defekty ZNALEZIONE POZA KATALOGIEM — przez uruchomienie testów real-DB
Silnik nie mógł ich uruchomić (sandbox blokuje bazę). Uruchomiłem sam na klonie `t2`:

```
× upsert-wac.pg.test.ts > output then completed-cancel nets WAC back to the pre-output state
  AssertionError: expected false to be true

× upsert-wac.pg.test.ts > converts g to kg by exact decimal division and leaves kg/each/box untouched
  expected { qtyKg: '0', resolved: false } to deeply equal { qtyKg: '0.100125', resolved: true }
```

**Konwersja gramów na kilogramy zwraca `0` i `resolved: false`.** 100,125 g powinno dać
0,100125 kg. Skutek: średni koszt ważony liczony na zerowej ilości — **po cichu, bez błędu**.
Drugi defekt: WAC nie wraca do stanu sprzed outputu po anulowaniu.

**Tego nie wykryły testy na atrapach. Wykryło uruchomienie przeciw prawdziwemu Postgresowi.**
To jest, w jednym zdaniu, uzasadnienie całej tej kampanii.

---

## Bilans Fazy 1 po czterech partiach: 37 z 55 ID

| Werdykt | Ile |
|---|---|
| **PASS** | 7 |
| **FAIL — potwierdzony defekt kodu** | 13 |
| **brak testu kontraktowego** | 17 |
| Pozostało | 18 (11 `UI-*` w toku + 7 `E2E`) |

**Anty-testy wykryte łącznie: 8.**
**Defekty znalezione poza katalogiem: 2** (konwersja g→kg, netting WAC po anulowaniu).

---

## Partia 5 — 11 ID domeny `UI` (dowody W PRZEGLĄDARCE)

Pierwsza partia dowodzona **pełnym E2E**: realne kliknięcia, hydracja potwierdzona asercją
`__reactContainer$`, stan sprawdzany w bazie. **11/11 rozstrzygniętych, 0 nieosiągalnych.**

| ID | dziś | dowód |
|---|---|---|
| `UI-003` | **FAIL — brak funkcji** | pole wyszukiwania ma `readonly=""`, `fill()` → `TimeoutError`, brak opakowującego `<form>`. Nie ma czego testować (`app-topbar.tsx:106-113`) |
| `UI-005` | **FAIL (profil/PIN) + PASS (logout)** | menu otwarte realnym klikiem; **0 linków**, brak profilu i zmiany PIN-u. Logout: → `/en/login`, back-button → `/en/login`, cookies `auth` = `[]` |
| `UI-008` | **FAIL — defekt kodu** | próg ING-SUGAR utworzony → licznik KPI `1`→`2` **dokładnie o +1**, ale podpis nadal „Stock thresholds not live yet" (`dashboard/page.tsx:129` renderuje hint także przy `notLive===false`) |
| `UI-011` | **FAIL — defekt kodu** | link karty PO prowadzi poprawnie (`/planning/purchase-orders/<id>`, h1 „Purchase order"), 2 przeterminowane PO = 2 wiersze — ale **etykieta to „View WO →"** (`planning/page.tsx:211`) |
| `UI-012` | **FAIL — defekt kodu** | klik → `transfer_orders.status='cancelled'` w bazie → alerty TO `1`→`0`, a empty-state mówi **„No work-order alerts"**. Obie strony kontroli zaobserwowane |
| `UI-017` | **FAIL (etykieta) + PASS (akcja)** | dwie pozycje nawigacji o **identycznej** etykiecie `Stock adjustments`. Akcja działa: +25,0005 kg → `stock_adjustments`=1, LP widoczne w historii (`warehouse/page.tsx:314-322` — zahardkodowany `<li>` poza pętlą) |
| `UI-018` | **FAIL — wyciek notatek deweloperskich do UI** | na `/en/warehouse` w **`innerText`**: „KPI omitted", „no valuation/costing field is exposed", „FEFO-override telemetry". Źródło: **`_meta/i18n-staging/warehouse-d.json:46-47`** — trzeci katalog tłumaczeń |
| `UI-020` | **FAIL — defekt kodu** | „Spend by supplier" = `$260.00`; `sum(qty*unit_price)` = 260.0000 (liczba poprawna), ale symbol `$` przy domenie GBP (`Intl.NumberFormat('en-US',{currency:'USD'})`) |
| `UI-021` | **FAIL (zaokrąglenie) + PASS (UoM)** | po dodaniu LP 25,0005 kg agregat = `25.000500 kg`, `SELECT` potwierdza. Rozbicie per UoM **naprawione**, 6 miejsc po przecinku **nie** (`network-inventory-kpi.ts:9`) |
| `UI-022` | **FAIL (country) + PASS (timezone)** | `country='uk'` **przyjęte bez normalizacji** → w bazie `PL` i `uk` obok siebie (`sites.ts:269` free text). `timezone='CET+1'` **odrzucone** z czytelnym komunikatem |
| `UI-039` | **FAIL — defekt kodu, nowy** | przełączenie `scanner.pwa.enabled` → alert `persistence_failed`, **wiersz w bazie NIEZMIENIONY** |

### 🔴 `UI-039` — przełączanie flag funkcji jest niemożliwe NIGDZIE, nie tylko lokalnie
Dwa błędy w łańcuchu, odtworzone na SQL (`apps/web/actions/flags/set-core.ts`):
1. `:80` — `set … updated_by = $2::uuid`, a `public.feature_flags_core` **nie ma kolumny `updated_by`**;
   żadna z 506 zastosowanych migracji jej nie dodaje → `42703`
2. `:94` — `insert into public.outbox_events (… aggregate_id …) values (…, null, …)`,
   a kolumna jest `NOT NULL` → `23502`; odpali się natychmiast po naprawie (1)

Oba w `try` zwracającym `persistence_failed` (`:116`), a `withOrgContext` robi ROLLBACK —
ginie także sam UPDATE flagi. **Objaw generyczny, przyczyna podwójna.**

### Wzorzec tej partii: „naprawione dane, niezmienione copy"
Inny niż anty-test z partii 2-4. Warstwa danych została naprawiona, tekst dla użytkownika nie:
licznik KPI reaguje o +1, a podpis kłamie; link prowadzi poprawnie, a etykieta mówi o innym
obiekcie; UoM naprawione, zaokrąglenie nie; timezone waliduje, `country` nie.

### Uczciwe ograniczenia
- `UI-005` „stary cookie → 401": **nieosiągalne** — fałszywy GoTrue nie unieważnia tokenów,
  więc odpowiedź 401 nic by nie znaczyła.
- **E-podpis przy korektach (`UI-017`/`UI-021`) nie posłużył jako dowód czegokolwiek** —
  lokalny serwer auth przyjmuje dowolne hasło. Użyty wyłącznie do przepuszczenia mutacji;
  dowodem są wiersze `stock_adjustments`/`license_plates`.

### Znaleziska poboczne
- `/en/settings/features` renderuje **surowy klucz** `settings.features.planNotice` —
  ta sama klasa `FORMATTING_ERROR` co `/en/dashboard`; dotyczy też `XC-047`
- org Apex miała **0 wierszy w `public.locations`** (jedyna należała do sentinela GDPR)
- `public.modules` jest **puste** → `/settings/features` może pokazać tylko empty-state

**Uwaga o artefaktach:** `faza1-ui-recheck-b/-c.spec.ts` są **nieidempotentne** — zużywają stan.
`-a` jest read-only i bezpieczny do powtórzeń.

---

## Bilans Fazy 1 po pięciu partiach: 48 z 55 ID

| Werdykt | Ile |
|---|---|
| **PASS** | 7 (+3 częściowe: `UI-005`, `UI-017`, `UI-021`, `UI-022` mają stronę PASS) |
| **FAIL — potwierdzony defekt kodu** | 24 |
| **brak testu kontraktowego** | 17 |
| Pozostało | **7** (domena `E2E`) |

**Anty-testy: 8. Defekty poza katalogiem: 3** (konwersja g→kg, netting WAC, `UI-039` flagi).

---

## Partia 6 — 7 ID domeny `E2E` (ostatnia)

| ID | dziś | podstawa |
|---|---|---|
| `E2E-055-05` | **FAIL — defekt kodu + ANTY-TEST** | ukończenie onboardingu bez weryfikacji wymaganych kroków; akcja sprawdza tylko istniejący timestamp i bezwarunkowo wykonuje `UPDATE` (`complete-onboarding.ts:47`). Zielone mocki **wołają ukończenie bez kroków i oczekują sukcesu** (`test:95`). To ten sam defekt co `NSA-145` |
| `E2E-055-06` | **FAIL — defekt kodu** | `completeOnboarding` **nie sprawdza uprawnień** (`:39`), podczas gdy bliźniaczy `advanceOnboarding` robi to przed odczytem i mutacją (`advance.ts:68`). Klasyczne „rodzeństwo o tej samej wadzie, naprawione tylko w jednym miejscu" |
| `E2E-056-05` | **FAIL — defekt kodu + ANTY-TEST** | helper poprawnie rzuca `unsupported_currency`, ale desktop mapuje to na `wac_unsupported_currency`; **zielony test wymaga właśnie błędnego prefiksu** (`upsert-wac.test.ts:918`). Ten sam defekt co `SFQ-075` |
| `E2E-054-10` | **ROZBIEŻNOŚĆ KONTRAKTU — do decyzji ownera** | maszyna stanów **celowo** dopuszcza `completed → cancelled` (`wo-state-machine.ts:46`), katalog mówi inaczej. 5/5 zielonych, bo test jawnie oczekuje sukcesu. Tor słusznie **odmówił** zaklasyfikowania jako defekt kodu |
| `E2E-049-02` | **brak testu kontraktowego** | po naprawie fixture'u 6/6 receiving przechodzi, ale brak testu łączącego scanner receive → pick → porównanie z desktopem i stan trwały |
| `E2E-049-07` | **brak testu kontraktowego** | fixture oczekiwał starego `status='available'`, poprawiono na `received/pending`. FEFO, blokada konsumpcji i release testowane osobno na atrapach — brak trwałego łańcucha |
| `E2E-051-01` | **NIEROZSTRZYGNIĘTY — błąd fixture'u** | uruchomiłem po zastosowaniu mig 544: `insert or update on table "warehouses" violates foreign key constraint "warehouses_site_id_fkey"` — fixture wstawia magazyn z nieistniejącym zakładem. Test się nie wykonał, więc **nie przyznaję żadnego werdyktu o kontrakcie** |

**Bilans partii: 0 PASS, 3 FAIL, 2 bez testu, 1 rozbieżność kontraktu, 1 nierozstrzygnięty.**

### Trzy defekty tej partii są POWTÓRZENIAMI już znanych
`E2E-055-05` = `NSA-145` (onboarding), `E2E-056-05` = `SFQ-075` (mapowanie waluty),
`E2E-055-06` = wzorzec „rodzeństwo o tej samej wadzie". Katalog liczy je jako osobne ID,
ale **do naprawy są to trzy miejsca, nie sześć**.

---

# 🏁 FAZA 1 ZAMKNIĘTA — 55 z 55 kontraktów

| Werdykt | Ile | % |
|---|---:|---:|
| **FAIL — potwierdzony defekt kodu** | **27** | 49% |
| **brak testu kontraktowego** | **19** | 35% |
| **PASS** | 7 | 13% |
| rozbieżność kontraktu (decyzja ownera) | 1 | 2% |
| nierozstrzygnięty (błąd fixture'u) | 1 | 2% |

## Co to znaczy
Werdykt „FAIL" z 19.07 był **trafny w 49% przypadków** — tam kod jest realnie zepsuty.
Ale w **35%** problem był inny, niż zapisano: **nie ma testu, który sprawdzałby kontrakt**,
a istniejący jest zielony i mierzy coś obok. Tylko 13% werdyktów było nieaktualnych.

## Anty-testy: 11 wystąpień
Zielony test utrwalający zachowanie **sprzeczne** z kontraktem. Skrajny `XC-047`:
**624 zielone testy i18n przy 119 brakujących kluczach** — allowlista sprawia, że suita
mierzy własną allowlistę.

## Defekty znalezione POZA katalogiem: 4
1. **konwersja g→kg zwraca `0` i `resolved:false`** zamiast `0.100125` — średni koszt ważony
   liczony na zerowej ilości, po cichu
2. **WAC nie wraca do stanu sprzed outputu** po anulowaniu
3. **`UI-039`: przełączanie flag funkcji niemożliwe w KAŻDYM środowisku** (brak kolumny
   `updated_by`, `aggregate_id` NOT NULL) — dwa błędy zduszone do jednego generycznego komunikatu
4. **tworzenie organizacji niemożliwe** (naprawione: mig 543 + 544) — blokowało **5 niezależnych
   plików testowych**, w standardowej bramce niewidoczne, bo testy były pomijane

## Naprawione i wdrożone w tej kampanii (commity lokalne)
trzy crony nigdy się nie wykonujące · `42P08` w liście ruchów magazynowych ·
`email_delivery_log` zapisujący `sent` dla niewysłanych listów · tworzenie organizacji ·
hydracja w harnessie E2E · wybór persony · 5 defektów fixture'ów

## Świadomie NIENAPRAWIONE
**27 potwierdzonych defektów kodu.** Zlecenie brzmiało „przelicz katalog", nie „napraw".
Każdy jest opisany z `plik:linia` i gotowy do decyzji.
