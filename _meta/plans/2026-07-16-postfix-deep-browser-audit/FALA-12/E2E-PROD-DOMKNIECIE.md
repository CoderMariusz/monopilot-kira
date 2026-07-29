# E2E PROD — domknięcie dwóch ostatnich poprawek

**Data:** 2026-07-29 · **Środowisko:** żywa produkcja `https://monopilot-kira.vercel.app`
**Wdrożenie:** `dpl_4QEVJAhw2XbkUmbHgrftDN4QZAHV` — commit `df07daa7`, target `production`, stan **READY**
(potwierdzone przed rozpoczęciem testów; commit `53ea8a73` z PUNKTU 2 był READY już wcześniej).
**Organizacja:** Apex 22 `00000000-0000-0000-0000-000000000002` · **Użytkownik:** `admin@monopilot.test`
**Baza:** wyłącznie SELECT-y przez `DATABASE_URL_OWNER`. Zero zapisów przez psql — wszystkie zapisy przez UI.

---

## Tabela wyników

| punkt | status | twardy dowód |
|---|---|---|
| **1** — tworzenie harmonogramu PM (bloker) | ✅ **DZIAŁA** | Wiersz zapisany w bazie: `id=21f47bbf-5c7d-4ec3-83f9-a5f9df95d3b1`, `equipment_id=948c099f-8054-49ae-99a1-dd5bb9410cd4` (LINE1 · Packing Line 1), `schedule_type=preventive`, `interval_value=14`, `warning_days=3`, `next_due_date=2026-08-15`, `active=t`. Baseline przed testem: `select count(*) from public.maintenance_schedules` = **0 w całej bazie**. Ekran **nie** wpadł w error boundary — po zapisie modal się zamknął, a lista wyrenderowała wiersz `LINE1 / Packing Line 1 · Preventive · 14 days · 2026-08-15 · Active · Edit`. |
| **1b** — gałąź edycji tego samego modala | ✅ **DZIAŁA** | Modal otwarty jako „Edit PM schedule" z poprawnym prefillem (`interval=14`, `warning=3`, `due=2026-08-15`, `active=on`). Po zmianie i zapisie w bazie: `interval_value=21`, `warning_days=5`, `next_due_date=2026-09-01`, `updated_at=2026-07-29 03:37:45.224611+00`. Lista pokazuje `21 days · 2026-09-01`. |
| **1c** — brak `TypeError` w konsoli | ✅ **CZYSTO** | Osobny, czysty przebieg kontrolny: świeża nawigacja na `/en/maintenance` → zakładka PM → „+ Create PM schedule" → **Submit** → `browser_console_messages(level=error)` = **0 błędów, 0 ostrzeżeń**. To jest dokładnie ta linia, która przed poprawką rzucała wyjątkiem (payload budowany bezwarunkowo przed rozgałęzieniem create/edit). Bufor konsoli zawiera 2 wpisy `TypeError: Cannot read properties of undefined (reading 'id')`, ale są **rezydualne z wcześniejszej sesji przeglądarki** — leżą pomiędzy 404-kami z `/en/settings/printers` i `/en/warehouse/receive-po`, czyli stron, których w tej sesji nie odwiedzałem. Licznik `all=true` przed i po całym skanie: **22 → 22** (mój przebieg nie dorzucił ani jednego wpisu). |
| **2** — komunikat błędu zapisu wyniku | ✅ **DZIAŁA** | Dosłowny tekst na ekranie: **„Enter a measured value for every parameter before saving."** Zamiast surowego `Could not save results: {message}` / `Actual Required`. Odtworzone na INSP-00000015 (pole zmierzonej wartości puste → „Save results"). |
| **2b** — odmowa przy podpisie z brakującym parametrem specyfikacji | ✅ **DZIAŁA** | Dosłowny tekst w modalu e-podpisu: **„Measure every parameter required by the active specification before signing a Pass decision."** Zamiast `Missing_spec_parameters`. Bramka **nie została obejściona** — wywołana legalnie (Decision → Pass → Sign & submit z prawidłowym hasłem, bez zapisanych wyników) i utrzymała się. Dowód trwałości w bazie: `quality_inspections` id `03095315-abb8-41c1-aec1-de8901a03dc9` → `status=pending`, `decided_by=∅`, `decided_at=∅`, `signature_hash=∅`, `parameters=[]`. Żadna decyzja nie została zapisana. |
| **3** — zakładka PM nie zaprzecza sama sobie | ✅ **SPÓJNA** | Cytat z żywej strony: podtytuł zakładki **„Define calendar-day recurrence; due schedules feed the PM engine and can generate MWOs."**, przycisk **„+ Create PM schedule"**, stan pusty **„No PM schedules yet. Create one to start preventive planning."** Ani śladu po „Preventive maintenance schedules (read-only list)" i „the schedule editor arrive in a later slice" — również w drzewie kodu (grep na `read-only list` / `later slice` nie trafia w moduł Maintenance). |
| **4** — szybki skan bez regresji | ✅ **CZYSTO** | Wszystkie 4 strony: HTTP **200**, brak error boundary, licznik konsoli niezmieniony (22 → 22 przez cały skan). Szczegóły niżej. |

### PUNKT 4 — szczegóły skanu

| URL | status | error boundary | pierwsza treść |
|---|---|---|---|
| `/en/maintenance` | 200 | nie | `Maintenance / Work orders / Maintenance work orders on registered machines / Assets / Calibration / Work orders / PM schedules / + New MWO` |
| `/en/quality` | 200 | nie | `Quality / Holds, NCRs, inspections and specifications. / Active holds 3 / Open NCRs 1 / Inspection pass rate 56%` |
| `/en/quality/inspections` | 200 | nie | `Incoming Inspections / Incoming, in-process and final inspection records. / TOTAL INSPECTIONS 8 / PASSED 5` |
| `/en/production` | 200 | nie | `Production / Live shift view — work orders, output, OEE and downtime. / WOS IN PROGRESS 3 / 3` |

Status odczytany z `performance.getEntriesByType('navigation')[0].responseStatus`.
Błędy konsoli: `browser_console_messages(level=error)` po ostatniej nawigacji = **0**;
zbiorczy licznik `all=true` niezmieniony 22 → 22 przez cały skan (same wpisy rezydualne z poprzedniej sesji:
8× 404, 4× 500 na `/en/settings/units`, 6× zminifikowany React #418, 2× stary `TypeError`).

---

## NOWE ZNALEZISKO (poza zakresem obu poprawek) — P1

**Domyślny wybór w polu „Equipment" modala PM zawsze kończy się błędem „equipment not found".**

Pierwsze kliknięcie „Save schedule" bez ręcznej zmiany urządzenia dało w modalu komunikat
`equipment not found` i nic się nie zapisało. Ekran się nie wywrócił (to nie jest regresja poprawki
z `df07daa7`) — ale dla operatora ścieżka „otwórz i zapisz" jest domyślnie martwa.

Przyczyna — dwa różne rozwiązywacze na tej samej liście rozwijanej:

* `listEquipmentForMwo()` (`_actions/mwo-actions.ts:852`) zwraca **UNION**
  `public.equipment` **+** `public.production_lines`. Ta sama lista karmi modal MWO i modal PM.
* `createPmSchedule()` (`_actions/mwo-actions.ts:~1630`) waliduje **tylko** `public.equipment`
  i przy braku trafienia zwraca `{ ok:false, reason:'not_found', message:'equipment not found' }`.
* `createMwo()` (`:925-950`) robi to poprawnie — przy braku wiersza w `equipment` sięga do
  `production_lines` i auto-provisionuje wiersz `equipment`. Ścieżka PM tego fallbacku **nie ma**.

Skutek na żywej produkcji dla Apex 22: z 12 pozycji na liście tylko **3** są realnymi wierszami
`public.equipment` (`LINE1 — Packing Line 1`, `NIGHT-R20-…-AST`, `REGR-FINAL-A1`).
Pozostałe 9 to `production_lines` i każda z nich odbija się o „equipment not found".
Modal ustawia domyślnie `equipment[0]`, czyli alfabetycznie `BAKE — BAKE` — a to production line.
**Każdy użytkownik, który nie zmieni ręcznie urządzenia, dostanie błąd przy pierwszym zapisie.**

Dowód: `6191e588-4c7c-4951-a325-d998b9646afc` (opcja „BAKE — BAKE") nie istnieje w `public.equipment`;
skan wszystkich tabel z kolumną `id` znalazł go w `public.production_lines`.

Najkrótsza naprawa: przenieść fallback `production_lines` z `createMwo` do wspólnego helpera
i użyć go też w `createPmSchedule` (jeden guard w miejscu, przez które przechodzą oba wywołania).
Alternatywnie — zawęzić `listEquipmentForMwo()` dla modala PM do samego `public.equipment`.

---

## Rezydua danych testowych (do posprzątania lub zostawienia świadomie)

| tabela | id | opis | jak powstało |
|---|---|---|---|
| `public.quality_inspections` | `03095315-abb8-41c1-aec1-de8901a03dc9` | INSP-00000015, `status=pending`, referencja `LP-7A6E5C1FE645` · RM-BUTTER, nieprzypisana, bez terminu | utworzone przez UI — wszystkie istniejące inspekcje były już zamknięte i niezmienne (21 CFR Part 11), więc do wywołania błędu zapisu wyniku trzeba było otworzyć nową. **Bez decyzji, bez podpisu, `parameters=[]`.** |
| `public.maintenance_schedules` | `21f47bbf-5c7d-4ec3-83f9-a5f9df95d3b1` | harmonogram PM dla `LINE1 · Packing Line 1`, `preventive`, co 21 dni, okno ostrzeżenia 5 dni, następny termin `2026-09-01`, aktywny | utworzone i następnie edytowane przez UI — to jest właśnie dowód dla PUNKTU 1. **Uwaga: jest to jedyny wiersz w całej tabeli i realnie zasili silnik PM** (może wygenerować MWO ok. 2026-08-27, tj. 5 dni przed terminem). Jeśli to niepożądane, ustawić `active=false` przez UI („Edit"). |

Żadnych innych zapisów nie wykonano. Zero INSERT/UPDATE/DELETE przez psql.
Nie uruchamiano żadnych `*.pg.test.ts` przeciw produkcji.

---

## Wniosek

**Obie poprawki działają na produkcji: harmonogram PM tworzy się i edytuje z trwałym zapisem
w bazie bez wywracania ekranu, a komunikaty jakości są pełnymi zdaniami po ludzku zamiast
surowych kluczy — przy czym modal PM ma osobną, niezależną wadę: domyślnie wybrane urządzenie
pochodzi z `production_lines` i odbija się o „equipment not found".**
