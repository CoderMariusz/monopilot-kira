# Finanse — rzeczywiste koszty ZP, koszt/kg, schemat wyceny (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde twierdzenie poniżej jest zakorzenione w
> rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie jest wymyślone.
> Finanse to **moduł 10** (`10-finance` w `.claude/skills/MON-project-overview/SKILL.md`;
> kanoniczny prefiks zdarzeń `finance.*`). Jest to instancja odpowiedzialna za
> kalkulację kosztów i wycenę: **rzeczywiste koszty ZP**, **koszt standardowy**,
> **wycena zapasów FIFO/WAC**, **odchylenia standard–rzeczywiste** oraz
> **eksport wyłącznie na etap 5 D365** przez skrzynkę nadawczą (zabezpieczenie
> antykorupcyjne R15).
>
> **Żywa powierzchnia jest niewielka**: jeden ekran desktopowy pod `/finance`
> (`apps/web/app/[locale]/(app)/(modules)/finance/`), który renderuje
> **koszty rzeczywiste ZP tylko do odczytu**. Pełne DDL wyceny / kosztu
> standardowego / odchyleń jest dostarczane w bazie danych
> (`packages/db/migrations/199-finance-schema-and-rbac-seed.sql` +
> `packages/db/schema/finance.ts`), ale **nie jest jeszcze podpięte do żadnej
> akcji serwera ani strony** (patrz Znane luki). Trasy są pisane bez prefiksu
> `[locale]`. Ostatni przegląd względem drzewa roboczego (odświeżenie finansów
> R4d, commit `ec5a3ef3`).
>
> **Własność, na której obraca się cały moduł:** główny **koszt/kg na pozycję
> jest współwłasnością** — Techniczny (03) jest **jedynym autorem zapisu**
> `items.cost_per_kg` + `item_cost_history` (przez `writeItemCostLedger`);
> Finanse są **czystym czytelnikiem** tego rejestru wzorcowego oraz kanonicznych
> tabel 08-production / 05-warehouse i nigdy ich nie zapisują
> (`packages/db/schema/finance.ts:36-44`,
> `finance/_actions/wo-cost-actions.ts:3-25`).

---

## a. Przegląd

Finanse **wyceniają to, co produkcja już wykonała**. Jedyna żywa akcja,
`listCompletedWoCosts` (`finance/_actions/wo-cost-actions.ts:341`), pobiera
ostatnio **zakończone/zamknięte** zlecenia produkcji i sumuje każde z nich do
**kosztu rzeczywistego**: materiały (skonsumowane kg × `cost_per_kg` pozycji),
procesy robocizny/maszyny/przygotowania (rozwiązywane z wiersza
`reference_tables.processes`), straty (wyceniane po średnim ważonym koszcie
materiałów ZP) oraz **koszt/kg wyrobu gotowego**. Jest to ściśle
**tylko do odczytu**: „brak księgowań, brak nowych tabel, brak migawek wyceny,
brak D365" (`wo-cost-actions.ts:25`). Każda wartość jest **dokładna NUMERIC** —
koszty przepływają jako ciągi dziesiętne przez jądro arytmetyczne na
mikroskali z liczbami całkowitymi
(`finance/_actions/wo-cost-math.ts`, `lib/shared/decimal`), nigdy jako
float JavaScript.

Finanse czytają cztery źródła kosztów, każde udokumentowane w nagłówku akcji
(`wo-cost-actions.ts:6-24`):

- **Materiały** — `wo_material_consumption.qty_consumed` złączone z `items` po
  `component_id`; `items.cost_per_kg` to wzorcowy rejestr współwłasnościowy
  Techniczny/Finanse.
- **Procesy** (robocizna / maszyna / przygotowanie) — wiersze procesów w JSON
  w `reference_tables` gdzie `table_code='processes'` (mig 269/276); ZP nie ma
  klucza obcego procesu, więc rozwiązanie jest zachowawcze: `wo_operations`
  o najniższej sekwencji dopasowuje się bez rozróżnienia wielkości liter do
  `row_key` / `row_data.name` / `row_data.process_code` wiersza referencyjnego.
  Brak dopasowania → robocizna jest uczciwie `null`.
- **Czas pracy** — ponownie wykorzystuje regułę scalania przestojów producenta
  OEE (`totalDowntimeMinutes` z `lib/production/oee-snapshot-producer`); czas
  pracy = czas od uruchomienia do zakończenia minus scalony przestój. Finanse
  **nie odczytują ani nie zapisują** `oee_snapshots`.
- **Straty** — `wo_waste_log.qty_kg` wyceniane po średnim ważonym koszcie
  materiałów ZP; `0.0000` zamiast wymyślonej wyceny, gdy nie istnieje podstawa
  materiałowa.
- **Wyroby gotowe** — `wo_outputs.qty_kg` jest mianownikiem; `costPerKgOutput`
  wynosi `null`, gdy kg wyjściowych jest zero.

**Sam rejestr wzorcowy koszt/kg znajduje się w module Techniczny**: jest
zapisywany przez moduł kalkulacji kosztów Technicznego
(`technical/cost/_actions/write-cost-ledger.ts`) i prezentowany jako historia
kosztów + rozwinięcia receptury pod `/technical/cost`. Koszty z faktur/ZZ i
import D365 przepływają przez ten sam rejestr (źródła `supplier_update` /
`d365_sync`), **nie** przez żadną tabelę Finansów (patrz f. Znane luki #3).

Głębszy DDL Finansów — `standard_costs`, `wo_actual_costing`,
`inventory_cost_layers`, `item_wac_state`, `cost_variances`,
`finance_outbox_events`, `d365_finance_dlq` — istnieje wyłącznie jako
**fundament schematyczny** (`packages/db/schema/finance.ts`, migracja 199);
żadna akcja serwera jeszcze go nie zapisuje ani nie odczytuje.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wymieniają dotknięte tabele Postgres. „Bramka" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brakujące uprawnienie zwraca
> typowane `{ ok:false, reason:'forbidden' }`, nigdy 500). Cała rodzina `fin.*`
> jest przypisana do grupy ról org-admin + grupy ról operatora/analityka finansów
> przez migrację 199 §(C) — naprawa #1 błędu „403 wszędzie"
> (`199-finance-schema-and-rbac-seed.sql:527-667`).

### Rzeczywiste koszty ZP (jedyne żywe akcje) — `finance/_actions/wo-cost-actions.ts`

| Akcja (plik) | Co robi | Odczyty / zapisy | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `listCompletedWoCosts({days?})` (`wo-cost-actions.ts:341`) | Ładownik strony `/finance`. Wyświetla **25 ostatnich** ZP o statusie `COMPLETED`/`CLOSED` (lub `wo_executions.status in (completed,closed)`) w oknie czasowym (`days` ograniczone do 1..365, domyślnie 30), a następnie oblicza każde przez `computeWoActualCostInContext`. **Czysty odczyt** — nic nie zapisuje. | odczytuje `work_orders`, `wo_executions`, `wo_outputs`, `wo_waste_log`, `wo_material_consumption`, `items`, `wo_operations`, `reference_tables` (`processes`), `downtime_events`; **nic nie zapisuje** | `fin.costs.read` | — (tylko odczyt) |
| `computeWoActualCost(woId)` (`wo-cost-actions.ts:329`) | Wersja dla jednego ZP: waliduje, że ZP jest zakończone/zamknięte (`not_found` w przeciwnym razie), pobiera materiały / proces / przestoje, oblicza sumy. Ten sam kontrakt RBAC + tylko odczyt. | te same odczyty co powyżej dla jednego ZP | `fin.costs.read` | — (tylko odczyt) |
| `computeWoActualCostTotals(input)` (`wo-cost-math.ts:62`) | Czyste jądro NUMERIC (brak DB, brak `'use server'`). Materiały Σ(ilość×koszt), robocizna = godziny_pracy × obsada × stawka_godzinowa, straty = kg_strat × śr_koszt_materiałów, suma = materiały+robocizna+maszyna+przygotowanie+straty, `costPerKgOutput = suma/kg_wyjściowych`. Arytmetyka bigint na mikroskali, zaokrąglanie half-up bez banker's rounding (`divMicro`). | — (w pamięci) | — (wywoływana wewnątrz akcji pod bramką) | — |

> `hasFinancePermission` (`wo-cost-actions.ts:147`) to lokalny pomocnik RBAC:
> sprawdza ZARÓWNO znormalizowaną tabelę `role_permissions`, JAK I pamięć podręczną
> jsonb `roles.permissions` dla `fin.costs.read`, z zakresem do
> `(user_id, org_id)` pod RLS — ten sam wzorzec podwójnego przechowywania, którego
> używają akcje kosztowe modułu Technicznego.

### Rejestr wzorcowy koszt/kg — własność Technicznego, odczyt Finansów (`technical/cost/_actions/*`)

> To **nie są akcje Finansów** — żyją w module 03. Są tu wymienione, ponieważ
> są **jedynymi autorami zapisu** rejestru wzorcowego koszt/kg, który Finanse
> odczytują, a przewodnik musi być jednoznaczny co do granicy współwłasności.

| Akcja (plik) | Co robi | Odczyty / zapisy | Bramka | Właściciel |
|---|---|---|---|---|
| `postCost(input)` (`technical/cost/_actions/post-cost.ts:42` → `write-cost-ledger.ts:31`) | Publikuje nowy wpis kosztowy: zamyka poprzedni aktywny wiersz `item_cost_history` (`effective_to`), wstawia nowy (`source` ∈ `manual`/`d365_sync`/`supplier_update`/`variance_roll`), **denormalizuje** `items.cost_per_kg`. V-TEC-53: delta >20% przy `manual`/`supplier_update` wymaga zatwierdzającego → `approver_required` (test >20% jest oceniany w przestrzeni SQL NUMERIC, `write-cost-ledger.ts:59-70`). | zapisuje `item_cost_history`, `items.cost_per_kg`, `audit_log` (`item_cost.recorded`) | `technical.cost.edit` | **03-technical** (Finanse nigdy nie zapisują) |
| `listCostHistory({itemId})` (`technical/cost/_actions/list-cost-history.ts:56`) | Historia wpisów kosztowych dla pozycji, `effective_from DESC`. Koszt pozostaje ciągiem (dokładność NUMERIC). | odczytuje `item_cost_history` | `technical.cost.edit` | 03-technical |
| `getRecipeCost(productCode)` / `listCostedProducts()` (`technical/cost/_actions/list-recipe-cost.ts:169` / `:110`) | **Rozwinięcie kosztu standardowego** napędzane przez BOM = Σ(`bom_lines.quantity` × `items.cost_per_kg` składnika), obliczane w SQL. Cena docelowa/sprzedaży są prezentowane jako **N/A** — schemat Technicznego nie ma ceny sprzedaży (`list-recipe-cost.ts:20-24`). | odczytuje `bom_headers`, `bom_lines`, `items`, `npd_projects` | odczyt z zakresem RLS | 03-technical |
| `triggerCostImport({reason})` (`settings/integrations/d365/cost-import/_actions/trigger-cost-import.ts:50`) | Import kosztów D365: **kolejkuje** idempotentne zadanie pobierania (tylko dołączanie; nigdy nie nadpisuje lokalnego kosztu w miejscu). Zastosowana różnica trafia później przez `postCost` z `source='d365_sync'`. | kolejkuje zadanie pobierania D365 | `technical.d365.sync_trigger` + `assertD365Enabled` | 03-technical / integracje |

**Zinwentaryzowana liczba akcji: 3 żywe akcje Finansów** (`listCompletedWoCosts`,
`computeWoActualCost`, jądro `computeWoActualCostTotals`) — wszystkie tylko do
odczytu — plus **4 autorzy zapisu** rejestru wzorcowego będące własnością
Technicznego, od których Finanse zależą. W drzewie roboczym **nie ma akcji zapisu
Finansów**: zatwierdzenie kosztu standardowego, zamknięcie wyceny, finalizacja
odchylenia i wysyłka eksportu D365 mają schemat + ciągi RBAC, ale
**brak akcji serwera** (patrz f. Znane luki).

---

## c. Maszyny stanów

Finanse **nie mają żywej maszyny stanów** — jedyna podpięta akcja to złożenie
odczytu już zakończonych ZP. Słownictwo stanów poniżej jest **zadeklarowane
w schemacie** (ograniczenia CHECK w `packages/db/schema/finance.ts`, odzwierciedlone
w migracji 199) i będzie napędzać przepływy kalkulacji/wyceny kosztów, gdy zostaną
podpięte; żaden kod nie wykonuje dziś tych przejść.

### Wybór kosztu rzeczywistego ZP (żywy filtr odczytu)

```
work_orders.status ∈ {COMPLETED, CLOSED}
   OR wo_executions.status ∈ {completed, closed}      (wo-cost-actions.ts:207-210)
        │  AND completed_at ≥ now() − days·interval     (okno, domyślnie 30, ≤365)
        ▼
   listCompletedWoCosts → top 25 → computeWoActualCost per WO (read-only)
```

### Zadeklarowane stany cyklu życia (tylko schemat, brak przejść)

| Tabela (`finance.ts`) | CHECK `status` | Zamierzone znaczenie | Autor zapisu dziś |
|---|---|---|---|
| `standard_costs` (`:102-105`) | `draft → approved → superseded → archived` | Koszt docelowy z datą obowiązywania; zatwierdzenie niesie migawkę e-podpisu SHA-256 zgodną z 21 CFR Part 11 (`approval_signature_sha256`, `:82`). Zatwierdzone wiersze są niezmienne (wyzwalacz zaplanowany na przyszłą migrację, `200-finance-reserved.sql:1-9`). | **brak** |
| `wo_actual_costing` (`:159-162`) | `open → closed → reversed` | Koszt rzeczywisty na ZP, miękkie odniesienie do kanonicznego `wo_outputs` (`wo_output_id`, nigdy niepisane przez Finanse, `:128-131`). | **brak** |
| `cost_variances` (`:338-341`) | `open → finalized` | Odchylenie standard–rzeczywisty na `(wo, category)`; `category ∈ material|labour|overhead|yield|waste` (`:330-332`); `variance_amount` to GENERATED `actual − standard` (mig `199:227`). | **brak** |
| `inventory_cost_layers` (`:214-217`) | `source_type ∈ po_receipt|wo_output|adjustment` — **brak `d365_import`** (zabezpieczenie antykorupcyjne R15, `:212-213`) | Rejestr FIFO partii na LP; częściowy indeks FIFO dla `(org,item,currency,receipt_date asc) where not exhausted` (mig `199:170-173`). | **brak** |
| `item_wac_state` (`:267-277`) | — (stan bieżący) | Średni ważony koszt; `avg_cost` to GENERATED `round(total_value/total_qty_kg,6)` STORED (mig `199:189-194`). | **brak** |
| `finance_outbox_events` (`:393-396`) | `pending → processing → sent | failed → dead_lettered` | Równoległa skrzynka nadawcza **tylko do eksportu** D365 etap 5 (R15); identyfikatory D365 żyją tylko w metadanych `d365_external_ids`, nigdy jako klucz RLS (`:367-368`). | **brak** |
| `d365_finance_dlq` (`:439-442`) | `dead_lettered → replaying → resolved` | DLQ trwałych błędów eksportu; powtórka jest dostępna tylko dla administratora (V-FIN-INT-05). | **brak** |

<!-- screenshot: strona główna finansów (/finance) — tabela kosztów rzeczywistych ZP + Odśwież -->
<!-- screenshot: rozwinięty wiersz ZP — podział materiałowy + koszty przygotowania/maszyny/strat -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków to dosłowna treść angielska z pakietu i18n `Finance.woCosts.*`
> (`apps/web/i18n/en.json`); `data-testid`y w nawiasach to stabilne kotwice
> w `finance/_components/wo-cost-table.client.tsx`.

### (i) Przeglądanie rzeczywistych kosztów ZP

1. Otwórz **Finance** z bocznego paska nawigacji (`/finance`). Wpis nawigacyjny
   jest chroniony przez `fin.costs.read` (`lib/navigation/module-registry.ts:15`,`:181-193`);
   sama strona ponownie weryfikuje `fin.costs.read` wewnątrz `listCompletedWoCosts`.
2. Strona (`module-landing-finance`) renderuje tabelę **„WO actual costs"**
   (`finance-wo-costs`): jeden wiersz na zakończone ZP z ostatnich **30 dni**
   (strona wywołuje `listCompletedWoCosts({days:30})`, `finance/page.tsx:54`),
   z kolumnami **WO / Product / Output kg / Materials / Labor / Total / Cost / kg**.
3. Kolumna **Labor** wyświetla **„No process cost"**, gdy żaden wiersz
   `reference_tables.processes` nie pasował do pierwszej operacji ZP;
   **Cost / kg** wyświetla **„n/a"**, gdy kg wyjściowych wynosi zero.

### (ii) Podgląd szczegółów kosztu ZP

1. Kliknij numer ZP (element rozwijany `<details>`, `wo-cost-table.client.tsx:130`).
   Panel **„Material breakdown"** (`finance-breakdown-<woId>`) wyświetla każdą
   skonsumowaną pozycję z kolumnami **Qty kg / Cost / kg / Cost**, plus siatkę 3
   pól dla kosztów **Setup / Machine / Waste**.
2. Wszystkie wartości to ciągi NUMERIC obliczone po stronie serwera renderowane
   dosłownie (czcionka monospace); klient nie wykonuje żadnych obliczeń.

### (iii) Odświeżanie kosztów (R4d)

1. Kliknij **„Refresh"** (`finance-refresh`). Wywołuje `router.refresh()` wewnątrz
   `useTransition`, ponownie uruchamiając komponent serwera i odczytując Supabase
   (`wo-cost-table.client.tsx:96`). W trakcie oczekiwania przycisk wyświetla
   **„Refreshing…"** i pojawia się baner `finance-optimistic`.
2. Zostało to naprawione w **R4d** (commit `ec5a3ef3`): przycisk wcześniej
   zwiększał stan sieroty `refreshCount`, który niczego nie pobierał ponownie
   (martwy koniec S2-13); teraz faktycznie ponownie pobiera dane z serwera.

### (iv) Gdzie faktycznie edytuje się koszt/kg (Techniczny, nie Finanse)

Finanse tylko **odczytują** `items.cost_per_kg`. Aby **zmienić** koszt, przejdź
do **Technical → Cost** (`/technical/cost`) i opublikuj wpis (`postCost`,
`technical.cost.edit`) — ręczny, aktualizacja od dostawcy lub różnica importu
D365. Nowa wartość jest denormalizowana na `items.cost_per_kg` i natychmiast
zmienia to, co strona kosztów ZP w Finansach oblicza przy następnym **Refresh**.
Patrz przewodnik Technicznego
(`docs/guide/modules/03-technical.md` §"Cost-per-kg (dual-owned with Finance)").

---

## e. Źródła danych (tabele Supabase)

Odczyty żywych rzeczywistych kosztów ZP (własnościowe 08-production / 03-technical
/ 05-warehouse — Finanse nigdy żadnej z nich nie zapisują):

- `work_orders`, `wo_executions` — nagłówek ZP + status czasu pracy; filtr
  zakończonych/zamkniętych i okno `started_at`/`completed_at`.
- `wo_outputs` — **kanoniczne (08-production)**; `qty_kg` to mianownik wyjściowy.
- `wo_material_consumption` — **kanoniczne (08-production)**; `qty_consumed` × koszt.
- `wo_waste_log` — **kanoniczne (08-production)**; `qty_kg` wyceniane po koszcie
  WAC materiałów.
- `downtime_events` — **kanoniczne (08-production)**; scalane dla okna czasu pracy.
- `wo_operations` — nazwa pierwszej operacji → rozwiązanie procesu.
- `items` — `cost_per_kg` (wzorcowy rejestr współwłasnościowy) + `item_code`/`name`
  wyrobu.
- `reference_tables` (`table_code='processes'`) — wiersze procesów JSON (`cost_mode`,
  `cost_rate`, `currency`, `staffing_count`, `setup_cost`); mig 269/276.

Rejestr wzorcowy koszt/kg (własność 03-technical — Finanse czytają tylko
`items.cost_per_kg`):

- `item_cost_history` — rejestr wpisów kosztowych
  (`packages/db/migrations/160-item-cost-history.sql`);
  `source ∈ manual|d365_sync|supplier_update|variance_roll`; z datą obowiązywania;
  zapisywany przez `write-cost-ledger.ts`, **współwłasność z Finansami** (`160:4-5`).
- `items.cost_per_kg` — denormalizacja `NUMERIC` aktywnego wiersza historii.

Schemat własny Finansów (utworzony przez migrację 199 — **zdefiniowany, jeszcze
nie odczytywany/zapisywany przez żadną akcję**):

- `standard_costs` — wersjonowany koszt docelowy na `(org,item,currency)` (T-009).
- `wo_actual_costing` — koszt rzeczywisty na ZP, miękkie odniesienie do `wo_outputs`
  (T-015).
- `inventory_cost_layers` — rejestr FIFO partii na LP (T-021).
- `item_wac_state` — bieżący stan średniego ważonego kosztu (T-021).
- `cost_variances` — odchylenie standard–rzeczywisty na `(wo, category)` (T-021).
- `finance_outbox_events`, `d365_finance_dlq` — eksport wyłącznie etap 5 D365
  (T-027, R15).

Zarządzanie / przekrojowe:

- `role_permissions` + `roles.permissions` — rodzina `fin.*` (podwójne przechowywanie),
  przypisana przez migrację 199 §(C) do grup ról org-admin + operator-finansów.
- `audit_log` — wpisy kosztowe lądują tutaj (`item_cost.recorded`); w drzewie
  roboczym **nie ma** emisji przez skrzynkę nadawczą specyficzną dla Finansów
  (patrz luki).
- CHECK `outbox_events` — dopuszcza 5 typów zdarzeń `finance.*`
  (`199:422-426`: `finance.consumption.valued`, `finance.cost_per_kg.changed`,
  `finance.standard_cost.approved`, `finance.valuation.closed_monthly`,
  `finance.variance.computed`), ale **żaden ich jeszcze nie emituje**.

---

## f. Znane luki / TODO

Oparte na odczytanym kodzie — bez domysłów:

1. **Podpięta jest tylko kalkulacja kosztów rzeczywistych ZP; reszta Finansów
   to tylko schemat.** Żywy moduł to jedna strona tylko do odczytu + 3 akcje
   odczytu (`finance/_actions/wo-cost-actions.ts`). Tabele `standard_costs`,
   `wo_actual_costing`, `inventory_cost_layers`, `item_wac_state`, `cost_variances`,
   `finance_outbox_events`, `d365_finance_dlq` istnieją w
   `packages/db/schema/finance.ts` + migracji 199 z pełnymi ograniczeniami CHECK,
   RLS i indeksami, ale **żadna akcja serwera ich nie odczytuje ani nie zapisuje**.
   Zatwierdzanie kosztu standardowego, zamknięcie wyceny, finalizacja odchyleń
   i eksport D365 są niezaimplementowane.

2. **5 zdarzeń `finance.*` skrzynki nadawczej jest zadeklarowanych, ale nigdy
   nieemitowanych.** Są w enum SoT (`packages/outbox/src/events.enum.ts:56-60`)
   i dopuszczone przez CHECK `outbox_events` (`199:422-426`), ale przeszukiwanie
   kodu nie znajduje żadnego emitera poza artefaktami build `.next/`.
   Konsumenci podrzędni nie mogą subskrybować zmian kosztów/wyceny/odchyleń Finansów.

3. **Przechwytywanie kosztów z ZZ/faktur nie jest przepływem Finansów.** Nie
   istnieje żadna akcja Finansów do przechwytywania kosztów z ZZ lub faktur.
   Zmiany kosztów napędzane przez dostawcę/ZZ i D365 trafiają do rejestru
   **Technicznego** przez `postCost`/`writeItemCostLedger` z
   `source='supplier_update'` / `'d365_sync'`
   (`technical/cost/_actions/write-cost-ledger.ts`,
   `settings/integrations/d365/cost-import/_actions/trigger-cost-import.ts:18-20`).
   Finanse jedynie ponownie odczytują wynikowy `items.cost_per_kg`. Tabela
   `inventory_cost_layers` (miejsce, gdzie warstawa wyceny **przyjęcia** ZZ
   powinna być zapisana, `source_type='po_receipt'`) nigdy nie jest zapisywana.

4. **Dwa nakładające się uprawnienia do odczytu kosztów; żywa strona używa
   tego spoza PRD.** Strona + bramka nawigacji opierają się na **`fin.costs.read`**
   (`wo-cost-actions.ts:36`, `module-registry.ts:15`), ciągu z „minimalnej rodziny
   RBAC sitemapy, audyt 2026-06-09" (`permissions.enum.ts:325-326`), **a nie**
   kanonicznym według PRD `fin.actual_cost.view` (`:323-324`) — który migracja 199
   przypisuje, ale żaden kod nie sprawdza. Ten sam duplikat istnieje dla
   `fin.valuation.read` vs `.valuation.view` i `fin.variance.read` vs `.variance.view`
   (`:329-338`). Duplikaty to szew do uzgodnienia.

5. **Kalkulacja kosztów procesów to dopasowanie nazw według zasady dobrej wiary,
   nie prawdziwy model kosztowy.** ZP nie ma klucza obcego procesu;
   robocizna/maszyna/przygotowanie są rozwiązywane przez dopasowanie bez
   rozróżnienia wielkości liter **pierwszej** operacji ZP do wiersza JSON
   `reference_tables.processes` (`wo-cost-actions.ts:8-16`,`:232-260`). ZP,
   którego nazwa operacji nie pasuje do żadnego aktywnego wiersza referencyjnego,
   otrzymuje **uczciwe `null` za robociznę** i `0` za przygotowanie/maszynę —
   nie jest to błąd, ale kalkulacja jest po cichu niekompletna. ZP
   wielooperacyjne wyceniają tylko operację o najniższej sekwencji.

6. **`site_id` jest nullable od pierwszego dnia we wszystkich 7 tabelach
   finansowych, bez jeszcze zakresu per-zakład.** Każda tabela finansowa niesie
   nullable `site_id` bez klucza obcego / bez rejestru; predykat RLS jest
   tylko org (`app.current_org_id()`) do momentu, gdy 14-MS T-030 dostarczy
   `app.current_site_id()` (`finance.ts:26-29`, `199:26-27`). Rejestry wyceny
   są udokumentowane jako per-zakład, ale jeszcze nie są tak skonfigurowane.

7. **Migracja 200 to zarezerwowany no-op.** `200-finance-reserved.sql` to
   celowy placeholder (`select 1 where false`) rezerwujący slot; przyszłe
   wykluczenie GIST bez nakładania się na zatwierdzonych `standard_costs`,
   wyzwalacz niezmienności zatwierdzonych wierszy i tabela zamrożenia
   zamknięcia miesięcznego są jawnie odroczone do migracji `≥ 201`, nigdy
   przez edytowanie 199/200 (`200:1-9`).

8. **Brak wyzwalacza audytu na poziomie wiersza DB; audyt jest emitowany
   przez akcję serwera.** Podobnie jak planning 176/177 i production 181,
   schemat finansów ma **kolumny** audytu + wyzwalacz `updated_at` tylko;
   wiersze `audit_events` akcji mutujących to zadanie warstwy akcji
   (`199:325-331`). Ponieważ nie istnieją żadne akcje zapisu Finansów,
   jedynym audytem przyległym do Finansów dziś jest wiersz
   `item_cost.recorded` modułu Technicznego.

Liczba akcji i każda luka powyżej są wywiedzione z przywołanych plików;
jedyna logika kalkulacji kosztów ZP w module to para tylko do odczytu
`wo-cost-actions.ts` + `wo-cost-math.ts`, a rejestr wzorcowy koszt/kg jest
zapisywany wyłącznie przez rejestr kosztów 03-technical.
