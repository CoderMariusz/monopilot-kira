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
