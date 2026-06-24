# Harmonogramowanie — sekwencjonowanie produkcji z uwzględnieniem przezbrojeń (przewodnik modułu)

> Szczegółowy przewodnik dla modułu. Każde twierdzenie poniżej jest zakotwiczone
> w rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie jest zmyślone.
> Moduł to wycinek **planowania rozszerzonego** (`07-planning-ext` w słowniku;
> rodzina uprawnień `scheduler.*.*`) i zamieszkuje **jedną grupę tras** pod
> `/scheduler` — **tablica sekwencjonowania** (`/scheduler`) oraz **edytor
> macierzy przezbrojeń** (`/scheduler/changeover-matrix`). Cała logika zapisu
> zawarta jest w jednym pliku Server Action (`scheduler/_actions/scheduler-actions.ts`)
> wywołującym czysty zachłanny solver (`sequence-solver.ts`); strony to cienkie
> powłoki RSC.
>
> Harmonogramowanie **proponuje**, operator **zatwierdza**. Przebieg nigdy nie
> dotyka zlecenia produkcyjnego samodzielnie — zapisuje wersję roboczą
> `scheduler_runs` oraz N wierszy `scheduler_assignments`; dopiero jawne
> **Zastosowanie** (Apply) przenosi proponowaną sekwencję / linię /
> planowany-start z powrotem na otwarte ZP. Lifecycle wykonania ZP należy do
> **08-production** — ten moduł harmonogramuje wyłącznie ZP w statusie
> `DRAFT`/`RELEASED`, nigdy te już uruchomione.
>
> Trasy zapisane są bez prefiksu `[locale]`. Ostatni przegląd przeprowadzony
> względem niepushowanego drzewa roboczego po poprawkach audytu przeglądarkowego
> z 2026-06-24 (seed uprawnień mig 324 + poprawka `MATRIX_SELECT_CM` 42702).

---

## a. Przegląd

Harmonogramowanie przekształca zaległości otwartych zleceń produkcyjnych w
**sekwencję minimalizującą koszty przezbrojeń**. Planista wybiera **horyzont
planowania** (1–30 dni, domyślnie 7) i opcjonalny **filtr linii**, a następnie
**Uruchamia** harmonogramowanie. Backend ładuje wszystkie otwarte ZP
(`status in DRAFT/RELEASED`), których planowany/tworzony start mieści się w
horyzoncie, ładuje **aktywną wersję macierzy przezbrojeń** i przekazuje je do
**zachłannego solvera najbliższego sąsiada** (`sequence-solver.ts`, optymalizator
`e8-greedy-v1`). Solver zasiewa sekwencję najwcześniej wymagalnym ZP, a następnie
cyklicznie dołącza kandydata o **najniższym koszcie przezbrojenia** od bieżącego
końca (remisy rozstrzygane przez datę wymagalności, a następnie id), fazuje
każde ZP w czasie dla danej linii
(`planned_start = max(now, poprzednie zakończenie na tej linii)`) i narastająco
sumuje koszty przezbrojeń.

Wynik jest zapisywany jako **ukończony wiersz `scheduler_runs`** + jeden **wiersz
`scheduler_assignments` ze statusem `draft` dla każdego ZP** i emitowane jest
zdarzenie `outbox_events` `scheduler.run.completed`. Na ZP nic się jeszcze nie
zmieniło — tablica renderuje propozycję zgrupowaną w pasy (lanes) per linia
produkcyjna z łącznym kosztem przezbrojeń.

**Zastosowanie** (`applySchedule`) to zatwierdzenie: dla każdego przypisania
przeprowadza zapis CAS `scheduled_start_time` / `scheduled_end_time` /
`production_line_id` + `ext_jsonb.scheduler_run_id` na ZP **wyłącznie gdy jest
ono nadal w statusie `DRAFT`/`RELEASED`** (ZP, które w międzyczasie zostało
uruchomione, pozostaje niezmienione → raportowane jako **przestarzałe** / stale),
naznacza przypisanie jako `approved`, naznacza przebieg
`output_summary.applied_at`/`applied_by` i emituje
`planning.schedule.published`. Zastosowanie jest **idempotentne** — ponowne
zastosowanie już zastosowanego przebiegu jest operacją zerową (`applied:false`).

**Macierz przezbrojeń** to model kosztów odczytywany przez solver: jeden wiersz
na `(allergen_from, allergen_to[, line])` zawierający `changeover_minutes`,
`requires_cleaning` (mycie), `requires_atp` i `risk_level`. Wiersze macierzy
powiązane są z **wersjonowanym** rodzicem (`changeover_matrix_versions`); solver
i ścieżka upsert rozpoznają **jedyną aktywną wersję dla organizacji**
(`is_active = true`, z najwyższym `version_number`).

Akcje zapisu/odczytu rezydują w
`scheduler/_actions/scheduler-actions.ts`; solver to czyste
`scheduler/_actions/sequence-solver.ts`; bramka odczytu + ładowacz etykiet
wyświetlania to `scheduler/_lib/scheduler-labels.ts` (`loadSchedulerAccess`);
model widoku spłaszczony do pasów to `scheduler/_components/scheduler-view-model.ts`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują dotykane tabele Postgres. „Bramka" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji przez `hasPermission(ctx, …)`
> (brak uprawnienia zwraca `{ ok:false, error:'forbidden' }`, nigdy 500).
> Wszystkie akcje działają w ramach `withOrgContext` (RLS przez `app.current_org_id()`).

### Uruchomienie / propozycja / zastosowanie — `scheduler/_actions/scheduler-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Cofanie / korekta |
|---|---|---|---|---|
| `runScheduler({lineId?,horizonDays?})` | **Propozycja.** Waliduje dane wejściowe (`horizonDays` 1–30, `lineId` UUID lub null → inaczej `invalid_input`). Ładuje otwarte ZP w horyzoncie (`loadOpenWorkOrders`) + macierz przezbrojeń z **aktywnej** wersji (`loadChangeoverMatrixForRun`), uruchamia `sequenceWorkOrders`, a następnie **zapisuje `ukończony` wiersz `scheduler_runs`** (`run_type='schedule'`, `optimizer_version='e8-greedy-v1'`, JSON `input_snapshot`/`output_summary`, `solve_duration_ms`) + jeden **`draft` `scheduler_assignments`** na ZP (masowy insert `jsonb_to_recordset`). Emituje `scheduler.run.completed`. **Nie dotyka ZP.** | odczyt `work_orders`, `items`, `item_allergen_profiles`, `changeover_matrix`, `changeover_matrix_versions`; zapis `scheduler_runs`, `scheduler_assignments`, `outbox_events` | `scheduler.run.dispatch` | Ponowne uruchomienie (każdy przebieg to nowy wiersz); `applySchedule` do zatwierdzenia |
| `applySchedule(runId)` | **Zastosowanie / publikacja.** Waliduje, że `runId` to UUID. Ładuje przebieg + jego przypisania nieodrzucone/niezanulowane. Jeśli już zastosowane (`output_summary.applied_at` ustawione) → idempotentna operacja zerowa (`applied:false`). W przeciwnym razie, dla każdego przypisania: zapis CAS `scheduled_start_time`/`_end_time`/`production_line_id`/`ext_jsonb` na ZP **tylko jeśli jest nadal `DRAFT`/`RELEASED`** (inaczej → **przestarzałe**), naznacza przypisanie `status='approved'` + `approved_by`/`approved_at`. Naznacza przebieg `output_summary.applied_at`/`applied_by`/`applied_assignment_count`. Emituje `planning.schedule.published` (`{applied, stale}`). | odczyt `scheduler_runs`, `scheduler_assignments`; zapis `work_orders` (`scheduled_*`, `production_line_id`, `ext_jsonb`), `scheduler_assignments` (znacznik zatwierdzenia), `scheduler_runs` (znacznik zastosowania), `outbox_events` | `scheduler.run.dispatch` (**brak odrębnego SoD dla zatwierdzającego — patrz luki; `TODO` w `scheduler-actions.ts:609`**) | Jednokierunkowe (brak „cofnij zastosowanie"); przestarzałe ZP są po cichu pomijane, nigdy nadpisywane |

### Macierz przezbrojeń — `scheduler/_actions/scheduler-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Cofanie / korekta |
|---|---|---|---|---|
| `listChangeoverMatrix()` | Wylistowuje **wszystkie** wiersze macierzy dla organizacji (każda wersja, posortowane `line_id nulls first, allergen_from, allergen_to`) na potrzeby siatki edytora. | odczyt `changeover_matrix` | `scheduler.matrix.read` | — (odczyt) |
| `upsertChangeoverMatrixEntry(entry)` | **Edycja komórki.** Jeśli `entry.id` jest podane → `updateMatrixById` (aktualizacja jednego wiersza po id; `coalesce`/`case`, żeby nieustawione pola były zachowane). W przeciwnym razie → `upsertMatrixByPair`: rozpoznaje **aktywną wersję** (`loadActiveVersionId`) chyba że podano `version_id`, waliduje `allergen_from`/`allergen_to`/`changeover_minutes≥0` (→ `invalid_input`), a następnie **aktualizuje lub wstawia** po naturalnym kluczu `(version_id, line_id, allergen_from, allergen_to)`. | odczyt `changeover_matrix_versions` (aktywna wersja); zapis `changeover_matrix` | `scheduler.matrix.edit` | Ponowna edycja tej samej komórki (każdy upsert jest w miejscu; brak wiersza audytu) |

### Odczyt / dostęp — `scheduler/_lib/scheduler-labels.ts`

| Akcja | Co robi | Odczytuje | Bramka |
|---|---|---|---|
| `loadSchedulerAccess()` | **Bramka odczytu** tablicy + mapy etykiet wyświetlania: kod/nazwa aktywnej linii produkcyjnej po id, numer otwartego ZP po id (≤500). Niepowodzenie renderuje panel odmowy/błędu tablicy, nigdy 500. | `production_lines`, `work_orders` | `scheduler.run.read` |

### Czysty solver — `scheduler/_actions/sequence-solver.ts` (bez DB, bez bramki)

| Funkcja | Co robi | Odczytuje / zapisuje |
|---|---|---|
| `sequenceWorkOrders(wos, matrix)` | **Zachłanny sekwencer.** Buduje **klucz profilu** alergenowego dla każdego ZP (posortowane, złączone `\|` `allergen_ids`), tabelę przeglądową kosztów `(od→do) → minuty` z macierzy, zasiewa od ZP z najwcześniejszą datą wymagalności, a następnie dołącza kandydata o **minimalnym koszcie przezbrojenia** metodą najbliższego sąsiada (remis → data wymagalności, następnie id). Następnie fazuje w czasie dla linii (`planned_start = max(now, poprzednie zakończenie na tej linii)`, `planned_end = start + czas trwania` z dat zaplanowanych/planowych) i narastająco sumuje `cumulative_changeover_cost`. Zwraca `SequencedAssignment[]`. Czysty i deterministyczny — importowany przez `runScheduler` i testowany jednostkowo bezpośrednio. | brak (operacje w pamięci) |

**Zinwentaryzowana liczba akcji: 6** — 2 uruchomienie/zastosowanie (`runScheduler`, `applySchedule`),
2 macierz (`listChangeoverMatrix`, `upsertChangeoverMatrixEntry`), 1 bramka odczytu
(`loadSchedulerAccess`), 1 czysty solver (`sequenceWorkOrders`). Rdzeń to
`runScheduler` (propozycja) + `applySchedule` (zatwierdzenie) + solver.

---

## c. Maszyna stanów

### Cykl życia przebiegu harmonogramowania (propozycja → zastosowanie)

```
              runScheduler (scheduler.run.dispatch)
                       │
   open WOs ───────────┼──────────► scheduler_runs  (status='completed')
   active matrix       │            scheduler_assignments × N (status='draft')
                       │            outbox: scheduler.run.completed
                       ▼
                  PROPOZYCJA na tablicy (ZP jeszcze niezmienione)
                       │
                applySchedule (scheduler.run.dispatch)
                       │
        dla każdego przypisania, ZP nadal DRAFT/RELEASED?
            ├─ tak ─► ZP.scheduled_start/end + linia zapisane
            │         przypisanie → status='approved' (+approved_by/at)
            │         → ZASTOSOWANE
            └─ nie ─► ZP pozostaje niezmienione → PRZESTARZAŁE (przypisanie zostaje 'draft')
                       │
                       ▼
       run.output_summary.applied_at oznaczony (idempotentny od tej chwili)
       outbox: planning.schedule.published {applied, stale}
```

| Stan | Gdzie | Dozwolony następny | Kto zapisuje | Uwagi |
|---|---|---|---|---|
| `scheduler_runs.status = 'completed'` | wiersz przebiegu | zastosowane (znacznik) | `runScheduler` wstawia już jako `completed` (synchroniczne rozwiązanie; stany enumeracji `queued`/`running`/`failed`/`cancelled` istnieją w schemacie, ale żaden asynchroniczny worker ich nie napędza — patrz luki) | `output_summary` zawiera `assignment_count` + `total_changeover_cost`; zastosowany przebieg dodatkowo zawiera `applied_at`/`applied_by`/`applied_assignment_count`. |
| przypisanie `draft` | `scheduler_assignments.status` | `approved` (przy zastosowaniu) | `runScheduler` (masowy insert) | Wszystkie przypisania rodzą się jako `draft`. |
| przypisanie `approved` | to samo | — | `applySchedule` (dla każdego zastosowanego ZP) | Oznaczane dopiero po pomyślnym zapisie ZP. |
| przypisanie **przestarzałe** (zostaje `draft`) | to samo | ponowne uruchomienie | — | Nie jest statusem w DB — kategoria uruchomieniowa dla ZP, które opuściły `DRAFT`/`RELEASED` między propozycją a zastosowaniem; ZP nigdy nie jest nadpisywane. |
| przebieg „zastosowany" | `output_summary.applied_at` jest ustawione | — (terminal) | `applySchedule` (`markRunApplied`) | Drugie zastosowanie to idempotentna operacja zerowa. Status przebiegu pozostaje `'completed'` — **zastosowanie oznaczane jest znacznikiem `applied_at`, nie statusem** (`scheduler-view-model.ts:80-94`). |

DB dopuszcza także statusy przypisań `'rejected'` / `'overridden'`
(`scheduler_assignments_status_check`, mig 204:138-140); `loadAssignments`
filtruje `rejected`/`cancelled`, ale żadna akcja ich aktualnie nie ustawia
(nadpisanie / odrzucenie to tylko wartości enumeracji — patrz luki).

### Wersjonowanie macierzy przezbrojeń

```
changeover_matrix_versions
   version_number 1,2,3…  (UNIQUE per org)
   status: draft → pending_review → active → archived
   is_active boolean  ── partial UNIQUE: ONE is_active=true row per org
                          (idx_changeover_active_per_org, mig 204:204-205)
        │
        └──< changeover_matrix rows  (FK version_id)
             one per (version_id, line_id, allergen_from, allergen_to)  [UNIQUE]
             line_id NULL = org-wide default; non-null = per-line override
```

| Pojęcie | Gdzie | Uwagi |
|---|---|---|
| **Aktywna wersja** | `changeover_matrix_versions.is_active = true` | Solver (`loadChangeoverMatrixForRun`) i `upsertMatrixByPair` (`loadActiveVersionId`) wiążą się z **najnowszą aktywną wersją** (`order by version_number desc limit 1`). Częściowy unikalny indeks DB wymusza **co najwyżej jedną aktywną wersję na organizację**. |
| **Status wersji** | `status in (draft, pending_review, active, archived)` | Zadeklarowany i sprawdzany w schemacie, ale **żadna akcja go nie przełącza** — w tym module nie ma akcji Server Action do tworzenia, publikowania ani archiwizowania wersji (patrz luki). Edytor macierzy modyfikuje komórki aktywnej wersji. |
| **Nadpisanie per linia** | `changeover_matrix.line_id` | `NULL` = domyślny dla organizacji; niezerowe `line_id` nadpisuje dla tej linii. Zapytanie solvera pobiera `line_id IS NULL OR line_id = $lineId`; **tabela przeglądowa kosztów jest kluczowana tylko po `(from,to)`**, więc wiersz nadpisania per linia może zastąpić wartość domyślną dla organizacji dla tego klucza (wygrywa ostatni zapis w `Map`) — udokumentowane ograniczenie. |

Maszyna stanów jest wymuszana **po stronie serwera**: `runScheduler`/`applySchedule`/
upsert macierzy każdorazowo ponownie sprawdzają uprawnienia i walidują dane
wejściowe; bramka odczytu strony (`loadSchedulerAccess` → `scheduler.run.read`)
decyduje, czy tablica w ogóle jest renderowana.

<!-- screenshot: scheduler board (run control + proposed per-line sequence + total changeover cost) -->
<!-- screenshot: scheduler/changeover-matrix grid (N×N FROM\TO heatmap + cell editor modal) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków poniżej to dosłowna angielska treść z pakietu i18n
> `Scheduler.*` (`apps/web/i18n/en.json`); `data-testid` w nawiasach to stabilne
> kotwice w kodzie komponentów (`scheduler-board-view.tsx` /
> `changeover-matrix-editor.tsx`).

### (i) Uruchamianie / proponowanie harmonogramu

1. Przejdź do **Scheduler** (`/scheduler`). Strona (`scheduler-page`) ładuje się
   za bramką odczytu `scheduler.run.read` — bez niej widoczny jest komunikat
   **"You do not have permission to view the scheduler."** (`scheduler-denied`).
2. W panelu sterowania **Run scheduler** (`scheduler-run-control`) ustaw **Horyzont
   planowania** (`scheduler-horizon`, 1–30 dni, domyślnie 7).
3. Kliknij **"Run scheduler"** (`scheduler-run-button`). Po zatwierdzeniu →
   `runScheduler` ładuje otwarte ZP w horyzoncie + aktywną macierz przezbrojeń,
   rozwiązuje sekwencję i zapisuje `completed` przebieg + `draft` przypisania.
4. **Proponowana sekwencja** (`scheduler-proposal`) renderuje jeden pas dla każdej
   linii produkcyjnej (`scheduler-lane-<code>`), z ZP posortowanymi według
   planowanego startu, alergenowym **Profilem** i plakietką **Changeover**
   (`scheduler-changeover-badge`) tam, gdzie stosuje się koszt mycia/czyszczenia.
   Nagłówek pokazuje **"Total changeover cost: …"** (`scheduler-total-cost`).
5. Jeśli przebieg nie wygenerował żadnych przypisań (brak otwartych ZP w horyzoncie),
   widoczny jest komunikat **"The run produced no assignments…"**
   (`scheduler-no-assignments`); przed pierwszym uruchomieniem tablica wyświetla
   pusty stan bezczynności (`scheduler-empty`).

### (ii) Przeglądanie i zastosowanie harmonogramu

1. Na świeżej propozycji kliknij **"Apply schedule"** (`scheduler-apply-button`).
2. Pojawia się okno dialogowe potwierdzenia — **"Apply this schedule?"** z treścią:
   *"This writes the proposed sequence, line and planned start onto the work
   orders. It changes production planning and cannot be undone automatically."*
   Kliknij **"Apply schedule"** (`scheduler-apply-confirm`), aby zatwierdzić,
   lub **Cancel**.
3. Po zatwierdzeniu → `applySchedule`: każde ZP, które jest **nadal w statusie
   `DRAFT`/`RELEASED`**, otrzymuje zapisany zaplanowany start/koniec + linię;
   ZP, które w międzyczasie zostało uruchomione, jest **pomijane (przestarzałe)**
   i nigdy nie zostaje nadpisane. Przebieg otrzymuje znacznik zastosowania i pojawia
   się plakietka **"Applied"** (`scheduler-applied-badge`).
4. Zastosowanie jest **idempotentne** — ponowne kliknięcie na już zastosowanym
   przebiegu jest operacją zerową. Nie istnieje opcja „cofnij zastosowanie":
   aby ponownie zaplanować, **Uruchom** harmonogramowanie, aby wygenerować nową
   propozycję.

### (iii) Edycja macierzy przezbrojeń

1. Na tablicy harmonogramowania kliknij **"Changeover matrix"**
   (`scheduler-matrix-link`) → `/scheduler/changeover-matrix`
   (`changeover-matrix-page`). Strona ładuje się za bramką `scheduler.matrix.read`
   (odmowa → **"You do not have permission to view the changeover matrix."**).
2. Edytor renderuje **siatkę N×N OD\DO** (`changeover-matrix`) profili
   alergenowych, pokolorowaną termicznie według kosztu (0 = brak / 1–15 niski /
   16–45 średni / >45 wysoki) z legendą **wash** (mycie). Komórki przekątnej
   (ten sam profil → brak przezbrojenia) to wyszarzone **„—"** bez akcji.
3. Kliknij dowolną komórkę poza przekątną (`matrix-cell-<from>-<to>`), aby otworzyć
   modal edycji **{from} → {to}**. Ustaw **"Changeover cost (minutes)"**
   (`matrix-cost-input`, ≥0) i przełącz **"Wash required"** (`matrix-wash-toggle`).
4. Kliknij **"Save"** (`matrix-cell-save`) → `upsertChangeoverMatrixEntry`. Bez
   podanego `id` **upsert odbywa się po `(aktywna wersja, linia, from, to)`**:
   aktualizuje istniejący wiersz lub wstawia nowy względem **aktywnej wersji
   macierzy**. Siatka odświeża się.
5. Jeśli żadne profile alergenowe jeszcze nie istnieją, siatka pokazuje
   **"No changeover profiles yet"** (`matrix-empty`) — *"Changeover profiles
   appear here once allergen profiles are defined for your items."* (osie
   wynikają z profili alergenowych pozycji, więc najpierw zdefiniuj je w
   module Technical).

### (iv) Wersjonowanie macierzy przezbrojeń

W tym module **nie istnieje żadna kontrola tworzenia / publikowania / archiwizowania
wersji w aplikacji** (patrz *Znane luki*). Model danych jest w pełni
wersjonowany — `changeover_matrix_versions` (status
`draft → pending_review → active → archived`, jedno `is_active=true` na
organizację) jest rodzicem wierszy `changeover_matrix` — i uprawnienie
`scheduler.matrix.publish` istnieje w enumeracji RBAC, jednak żadna Server
Action nie przełącza wersji. W praktyce dziś:

- Edycje trafiają na **aktualnie aktywną wersję** (rozpoznawaną przez
  `loadActiveVersionId`); edytor nigdy nie pyta o wersję.
- Tworzenie nowej wersji, oznaczanie jej jako aktywnej lub archiwizowanie
  starej to **operacja bezpośrednio na DB / migracja / przyszła akcja**, a nie
  jeszcze przepływ w UI. Gdy ta akcja zostanie dodana, musi sprawdzać
  `scheduler.matrix.publish` i przełączać `is_active` (częściowy unikalny indeks
  gwarantuje tylko jedną aktywną wersję w danej chwili).

---

## e. Źródła danych (tabele Supabase)

Przebieg / propozycja harmonogramowania (odczyt/zapis — własność `07-planning-ext`):

- `scheduler_runs` — jeden wiersz na przebieg (`status`, `horizon_days`, `line_ids`,
  `optimizer_version`, `run_type`, JSON `input_snapshot`/`output_summary`,
  `solve_duration_ms`, `applied_at` wewnątrz `output_summary`). mig 204.
- `scheduler_assignments` — jeden wiersz na ZP na przebieg (`sequence_index`,
  `planned_start_at`/`_end_at`, `changeover_minutes`, `optimizer_score`,
  `status` draft→approved, `approved_by`/`approved_at`, `override_*`, `ext`).
  Kontrola statusu dopuszcza `draft/approved/rejected/overridden`; kontrola
  kolejności czasowej `planned_start_at ≤ planned_end_at`. mig 204.
- `scheduler_config` — konfiguracja solvera per organizacja/linia (horyzont,
  strategia, wagi changeover/duedate/utilization, zdolność produkcyjna h/dzień).
  mig 204. **Zdefiniowane, ale jeszcze nie odczytywane przez `runScheduler`**
  (patrz luki).

Macierz przezbrojeń (odczyt/zapis):

- `changeover_matrix_versions` — wersjonowany rodzic (`version_number` UNIQUE
  per org, `status`, `is_active` z częściowym unikalnym indeksem „jeden aktywny
  na org", `published_by`/`published_at`). mig 204.
- `changeover_matrix` — wiersze `(version_id, line_id, allergen_from, allergen_to)`:
  `changeover_minutes`, `requires_cleaning`, `requires_atp`, `risk_level`,
  `notes`. UNIQUE na tym kluczu naturalnym. mig 204.

Wejścia odczytywane przez solver/tablicę (własność innych modułów):

- `work_orders` — otwarte ZP (`DRAFT`/`RELEASED`) w horyzoncie; zastosowanie
  zapisuje z powrotem `scheduled_start_time`/`scheduled_end_time`/
  `production_line_id`/`ext_jsonb` (własność 08-production / 04-planning-basic).
- `item_allergen_profiles` — kody alergenów per pozycja → klucz profilu
  alergenowego ZP, na podstawie którego solver sekwencjonuje (własność
  03-technical).
- `items` — rozpoznawanie kodu/nazwy pozycji (odczyt).
- `production_lines` — mapy kodu/nazwy linii + rozpoznawanie filtru linii (odczyt).

Zarządzanie:

- `outbox_events` — `scheduler.run.completed` (przy propozycji),
  `planning.schedule.published` (przy zastosowaniu). Żaden aktywny dispatcher
  ich jeszcze nie konsumuje (patrz luki).
- `role_permissions` / `roles` — granty `scheduler.*` zasiane przez migi 260 +
  324 (patrz luki).

---

## f. Znane luki / TODO

Ugruntowane w odczytanym kodzie — zasilają kolejkę poprawek:

1. **(NAPRAWIONE, wcześniej render-then-403) Trzy wymuszone uprawnienia istniały
   tylko jako seed.** Audyt przeglądarkowy z 2026-06-24 wykrył, że
   `runScheduler`/`applySchedule` wymuszają **`scheduler.run.dispatch`**, a akcje
   macierzy wymuszają **`scheduler.matrix.read`/`.edit`**, jednak mig **260**
   zawsze zasiał wyłącznie **`scheduler.run.read`** — przez co przycisk **Run**
   i **macierz przezbrojeń** były na stałe martwe dla każdej roli włącznie z
   administratorem organizacji, a przycisk nadal **renderował się jako aktywny
   i następnie zwracał 403** (antywzorzec „widoczne, ale 403"; audyt
   `2026-06-24-per-page-logic-audit.md` / `…-browser-audit-findings.md`).
   Naprawione przez **mig 324**
   (`324-scheduler-dispatch-matrix-perms-seed.sql`), który zasiewa trzy ciągi
   do rodziny ról administratora. **Pozostała luka L2:** strona nadal renderuje
   przycisk Run / link macierzy **bez** uprzedniego sprawdzenia
   `scheduler.run.dispatch` / `scheduler.matrix.read` — polega na odrzuceniu
   przez serwer, więc użytkownik niemający tych uprawnień (każda rola
   nieadministratorska dziś) nadal widzi aktywną kontrolkę, która kończy się
   niepowodzeniem. Bramka odczytu to `scheduler.run.read`, która **nie** jest
   uprawnieniem wymuszanym przez uruchomienie, więc użytkownik może zobaczyć
   tablicę, ale nie uruchomić harmonogramowania.

2. **Brak SoD między propozycją a zastosowaniem.** `applySchedule` korzysta z
   tego samego `scheduler.run.dispatch` co `runScheduler`, z jawnym komentarzem
   `// TODO: enforce separate approver-role SoD once scheduler roles are split.`
   (`scheduler-actions.ts:609`). Dedykowane uprawnienia `scheduler.assignment.approve` /
   `scheduler.assignment.bulk_approve` / `scheduler.assignment.reject` /
   `scheduler.assignment.override` **istnieją w enumeracji, ale żadna akcja ich
   nie odczytuje** — nie ma przepływu zatwierdzania/odrzucania/nadpisywania
   per przypisanie; zastosowanie jest operacją „wszystko albo nic" w ramach
   jednego uprawnienia.

3. **Wersjonowanie macierzy przezbrojeń istnieje tylko w modelu danych.**
   Schemat jest w pełni wersjonowany (`changeover_matrix_versions` z
   `draft/pending_review/active/archived` + jeden-aktywny-na-org), a
   **`scheduler.matrix.publish`** jest w enumeracji, ale **żadna Server Action
   nie tworzy, nie publikuje ani nie archiwizuje wersji** — edycje zawsze trafiają
   na aktywną wersję (`loadActiveVersionId`). Sam nagłówek komponentu edytora
   macierzy dokumentuje odstępstwo: *brak zakładki nadpisań per linia / historii
   wersji / kolejki recenzji* (`changeover-matrix-editor.tsx:6-13`).
   Wersjonowanie to operacja na DB/migracji do czasu podłączenia akcji publikowania.

4. **`scheduler_config` nie jest zapisywany przez żadną akcję ani przez nią
   odczytywany.** Konfiguracja solvera per linia (domyślny horyzont,
   `sequencing_strategy`, `changeover_weight`/`duedate_weight`/
   `utilization_weight`, zdolność produkcyjna h/dzień, `respect_pm_windows`,
   `allow_alternate_routings`) istnieje jako tabela + typowany `SchedulerConfigRow`,
   ale `runScheduler` koduje na stałe domyślnie 7 dni, strategię `e8-greedy-v1`
   i ignoruje wszystkie wagi. Solver jest **czystym zachłannym najbliższym
   sąsiadem na minutach przezbrojeń tylko** — bez zdolności produkcyjnych, bez
   ważenia terminów poza rozstrzyganiem remisów, bez okien PM, bez alternatywnych
   marszrut.

5. **Nadpisania przezbrojeń per linia są gubione w przebiegu dla całej
   organizacji.** Tabela przeglądowa kosztów solvera jest kluczowana tylko po
   `(allergen_from → allergen_to)` (`sequence-solver.ts:28-34`), więc gdy
   zapytanie przebiegu zwraca zarówno domyślną dla organizacji (`line_id NULL`),
   jak i wiersz nadpisania per linia dla tej samej pary alergenów, **ostatni
   wygrywa w `Map`** — nadpisanie per linia może zastąpić wartość domyślną
   (lub odwrotnie) niezależnie od tego, na której linii jest ZP. Udokumentowane
   w audycie per strona („org-wide run collapses per-line changeover overrides").

6. **Dryft statusów enumeracji przypisań.** `SchedulerAssignmentStatus`
   (`scheduler-types.ts:6`) i zapytania `loadAssignments`/`approveSchedulerAssignment`
   odwołują się do **`'cancelled'`**, ale kontrola DB
   `scheduler_assignments_status_check` (mig 204:138-140) dopuszcza tylko
   `draft/approved/rejected/overridden` — zapis `'cancelled'` naruszyłby
   tę kontrolę. Dziś jest tylko **filtrowany podczas odczytu** (nigdy zapisywany),
   więc jest to luka utajona, ale typ i DB są niezgodne.

7. **`runScheduler` wstawia przebieg już jako `completed`; asynchroniczne stany
   przebiegu są nieużywane.** `scheduler_runs.status` obsługuje
   `queued/running/completed/failed/cancelled` i istnieje kształt
   `requested_by`/`queued_at`/`started_at` dla kolejki, ale rozwiązanie jest
   **synchroniczne wewnątrz Server Action** — przebieg jest wstawiany ze
   `status='completed'`, `started_at`/`completed_at = now()`. Nie ma żadnego
   workera, żadnej ścieżki `dry_run`/`what_if` (obie wartości enumeracji są
   nieużywane), a `include_forecast` / uprawnienia `scheduler.forecast.*` są
   martwe. Nieudane rozwiązanie zwraca `persistence_failed`, a nie zapisuje
   wiersza przebiegu ze statusem `failed`.

8. **`site_id` ma wartość NULL na wyjściach harmonogramowania.** Przebiegi
   i przypisania posiadają nullable `site_id`, a inserty nie wypełniają go
   z kontekstu lokalizacji (mig 204 odnotowuje zakres per lokalizacja „zostanie
   dodany później"); przypisanie 14-multi-site nie jest tutaj podłączone.

9. **Zdarzenia outbox są emitowane, ale nie konsumowane.** `scheduler.run.completed`
   i `planning.schedule.published` trafiają do `outbox_events`, ale zgodnie
   z `MON-project-overview` nie ma aktywnego dispatchera `apps/worker` — dalszy
   ciąg (publikacja harmonogramu / raportowanie) to szew, jeszcze niedostarczony.

10. **Upsert macierzy nie zapisuje żadnego wiersza audytu.**
    `upsertChangeoverMatrixEntry` modyfikuje `changeover_matrix` w miejscu bez
    wpisu `audit_events` (w odróżnieniu od ścieżek przezbrojenia/korekty
    w 08-production) — zmiana kosztu przezbrojenia w macierzy istotnej dla
    bezpieczeństwa żywności jest nieśledzona. Należy rozważyć dodanie zapisu audytu.

Żadne surowe markery `// TODO` poza SoD w `scheduler-actions.ts:609` nie zostały
znalezione w kodzie harmonogramowania; lista luk pochodzi w pozostałej części
z dryftu enumeracja-vs-migracja / typ-vs-DB i ograniczeń możliwości
zaobserwowanych w kodzie, skrzyżowanych z audytem przeglądarkowym z 2026-06-24.
