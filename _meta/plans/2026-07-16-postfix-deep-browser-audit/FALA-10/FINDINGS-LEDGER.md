# FALA 10 — rejestr znalezisk cross-review

Wszystkie pięć torów: **FIX-FIRST**, 13 znalezisk (9×P1, 4×P2).

### Tor T1
- [P2] Test gałęzi bez zmiany ilości przechodzi również bez implementacji historii

### Tor T2
- [P1] Dowolny stary draft może zastąpić prawdziwe obłożenie WO

### Tor T3
- [P1] Automatyczne `DELETE` usuwa prawdziwy przestój bez decyzji operatora
- [P1] Zmiana wywraca istniejący test integracyjny pełnego cyklu WO
- [P2] Test UI deklaruje obsługę wartości ujemnych, ale sprawdza wyłącznie zero

### Tor T4
- [P1] Wyścig Complete↔void nadal pozwala zostawić WO jako Completed po utracie wyjścia
- [P1] Brak `wo_executions` powoduje fail-open dla terminalnego WO
- [P1] Reopen pozostawia trwale fałszywy snapshot OEE
- [P1] `closed` zostaje cofnięte bez kompensacji finansowego close
- [P1] Test UI jest deterministycznie czerwony przez nieistniejący selector
- [P2] Eskalacja FEFO przeblokowuje późniejszy legalny wybór LP
- [P2] Nowy workflow jest angielski w trzech obsługiwanych locale
- [P2] Migracja pozostawia deterministyczny schema-drift
- [P2] Test FEFO nie wykonuje deklarowanego wyboru niesugerowanego LP
- [P2] Nowy test ścieżki `in_progress` przechodzi również bez poprawki

### Tor T5
- [P1] Walidator dopuszcza precyzję, którą baza po cichu traci

### Czerwone testy wykryte przez bramkę (niezależnie od recenzji)
- `lib/production/__tests__/wo-state-machine.timestamps.test.ts` — „clears completed_at on reopen" → `expected undefined to be defined`
- `planning/work-orders/_actions/update-work-order.test.ts` — „propagates chain child quantities" → `expected false to be true`
- `production/wos/[id]/_components/__tests__/wo-consume-modal.test.tsx` — brak selektora `wo-consume-record`

### Uwaga orchestratora — tor T4 rozszerzył zakres poza finding
PF-R15-01 mówił: „zakończone WO traci podpisane wyjście bez bramki wydajności". Tor odpowiedział
na to **nowym przejściem `reopen`** (migracja 536, nowa wartość w `WO_TRANSITIONS`). To poważna
decyzja projektowa, nie poprawka — i recenzja natychmiast pokazała jej koszt: cofnięcie stanu
`closed` **bez kompensacji domknięcia finansowego** oraz trwale fałszywy snapshot OEE.

Cofanie stanu terminalnego w module produkcyjnym dotyka rozliczeń i wskaźników. Jeśli runda
poprawek nie domknie kompensacji **i** snapshotu OEE w sposób, który da się udowodnić testem —
przejście `reopen` wypada z tej fali, a PF-R15-01 zostaje naprawione węziej (samo zachowanie
podpisanego wyjścia przy zamknięciu).

## Domknięcia z weryfikacji Fali 9 (wciągnięte do tego commita)

### P0-01 — „Save this run" — PRZYCZYNA ZNALEZIONA I USUNIĘTA
`apps/web/lib/procurement/resolve-item-supplier.ts` trzymał filtr dostawców jako stałą
z **zaszytym aliasem tabeli** `s`, wstawianą do zapytań, w których ta tabela nazywa się
`s_by_id` i `s_by_code` → `42P01`. Helper wołany jest wyłącznie przez `persistPlannedOrders`,
dlatego przebieg read-only działał, a zapis padał — objaw identyczny z pierwotnym findingiem.
Naprawione przez sparametryzowanie aliasu (`nonBlockedSupplierFilter('s_by_id')`) + komentarz
ostrzegawczy przy definicji.

**Konsekwencja, której nie widać z diffu:** cały filtr zablokowanych dostawców (PF-R09-04) żyje
w tej samej, zepsutej ścieżce zapisu. Dopóki P0-01 nie był naprawiony, **na produkcji nigdy się
nie wykonywał**. Naprawa jednego findingu była warunkiem drugiego.

### P0-02 — historia przebiegów MRP niewidoczna przy wybranym zakładzie
`mrp.ts:854` i `:895` miały filtr site bez członu `site_id is null or`, który mają ekrany
siostrzane. Ten sam wzorzec, którego szukała recenzja — w miejscu, którego nikt nie sprawdził.

### Żywa awaria poza zakresem fal — `/en/production` (42883)
Ekran był w stanie błędu na produkcji (`operator does not exist: text / numeric`), podczas gdy
bliźniaczy `/production/wos` działał. Zapytanie wyciągnięte do wspólnego modułu
`production/_lib/dashboard-queries.ts`, dzielonego przez oba ekrany — jedno źródło zamiast dwóch
rozjeżdżających się kopii.

**Dowód (read-only, na produkcji):** `PREPARE` tego zapytania na owner-prodzie przechodzi `rc=0`.
Stary wariant wywalał się w tym samym miejscu `42883`. Zero zapisów do bazy.

## GOTCHA — mój błąd, wart zapisania
Nowy test `dashboard-data.pg.test.ts` **tworzy własne dane** (wstawia organizację). Uruchomiłem go
z `DATABASE_URL` wskazującym na **owner-proda**, żeby „udowodnić naprawę". Insert padł na setupie,
więc nic nie powstało (sprawdziłem: 0 organizacji pasujących do fixture'a) — ale intencja była zła.

**Zasada: testy `*.pg.test.ts` tworzą fixture'y i NIGDY nie wolno kierować ich na produkcję.**
Do dowodzenia na prodzie służy `PREPARE` w transakcji z `rollback` albo czysty SELECT.
Ten test wymaga lokalnego Postgresa (`pnpm db:up && pnpm db:test`) i w bramce pada głośno bez bazy —
to świadomy wzorzec repo (lepszy niż ciche pomijanie), nie regresja.
