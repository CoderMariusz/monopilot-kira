# Utrzymanie ruchu — zlecenia MWO + harmonogramy PM (CMMS) (przewodnik modułu)

> Szczegółowy przewodnik per moduł. Każde twierdzenie poniżej jest zakotwiczone
> w realnym pliku pod `apps/web/…` lub `packages/…`; nic nie jest zmyślone.
> Utrzymanie ruchu to **moduł 13**
> (`13-maintenance` w `.claude/skills/MON-project-overview/SKILL.md`; kanoniczna
> rodzina uprawnień `mnt.*.*`, prefiks zdarzeń `maintenance.*`). Polska nazwa to
> **Utrzymanie ruchu**.
>
> **Aktywna powierzchnia to jeden ekran**: `/maintenance`
> (`apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx`, link nawigacyjny
> `/pl/maintenance`) — dwuwidokowy ekran renderujący **listę zleceń pracy utrzymania
> ruchu (MWO)** + widok tylko do odczytu **listy harmonogramów PM**. Obsługiwany
> jest przez **jeden plik Server Actions** (`maintenance/_actions/mwo-actions.ts`)
> z 5 akcjami oraz sondą uprawnień, wszystko wewnątrz jednej transakcji
> `withOrgContext` każda.
>
> Pełny **schemat CMMS** — 15 tabel: aktywa/wyposażenie, technicy, harmonogramy PM,
> rdzeń MWO + listy kontrolne + LOTO, części zamienne (×4), kalibracja, sanitacja,
> historia — dostarczany jest w bazie danych
> (`packages/db/migrations/201-maintenance-schema-foundation.sql` +
> `packages/db/schema/maintenance.ts`), ale **tylko 2 z tych 15 tabel są odczytywane
> lub zapisywane przez jakąkolwiek akcję** (`maintenance_work_orders` +
> `maintenance_schedules`, przez miękkie powiązanie `public.machines` z migracji
> 290). Pozostałe 13 tabel to **osierocona baza schematu** (patrz Znane luki).
> Trasy są pisane bez prefiksu `[locale]`. Ostatni przegląd na podstawie drzewa
> roboczego (fala Wave-8, tor CL1 pierwsza pionowa; aktywny wycinek MWO trafił
> do commita `b690eb23`).
>
> **Uwaga cross-modułowa (nie duplikować):** zdarzenia przestoju zasilają **OEE**
> i pauzy produkcyjne, ale ten link jest własnością **08-production**
> (`downtime_events`) i konsumowany przez **15-oee** dla MTBF/MTTR. Moduł
> Utrzymanie ruchu niesie jedynie **miękką kolumnę `downtime_event_id`** na MWO;
> przepływ auto-MWO-z-przestoju **nie jest podłączony** (patrz §f.).

---

## a. Przegląd

Utrzymanie ruchu, tak jak jest faktycznie zbudowane, pozwala plannerowi utrzymania
ruchu **otworzyć, realizować i zamknąć reaktywne zlecenie pracy na maszynie**.
Użytkownik otwiera `/maintenance`, widzi listę MWO (zakładki statusów + liczniki +
wyszukiwanie), klika **+ Nowe MWO**, wybiera **maszynę** (z rzeczywistego rejestru
`public.machines`, nie z niezbudowanego rejestru aktywów `equipment` — patrz luki),
wprowadza tytuł + opis problemu + priorytet + opcjonalny termin wykonania i zatwierdza.
MWO powstaje w stanie **`open`** i przechodzi przez mały zakodowany na stałe cykl
życia: `open → in_progress → completed`, z `cancelled` jako boczną gałęzią.
Widok tylko do odczytu **harmonogramów PM** wyświetla harmonogramy
prewencyjne/kalibracyjne/sanitacyjne/inspekcyjne z `maintenance_schedules`
(połączone z rejestrem `equipment` dla kodu/nazwy).

To jest cały aktywny moduł. **Nie ma** obsługi CRUD aktywów/wyposażenia, silnika
cron PM, dziennika awarii/napraw poza notatką ukończenia MWO, e-podpisu LOTO,
rejestracji kalibracji, rejestracji sanitacji, stanu ani wydania części zamiennych
ani strony szczegółów MWO — wszystkie te funkcje mają schemat + ciągi RBAC, ale
żadnego Server Action ani strony (`packages/db/schema/maintenance.ts`, migracja 201).

Jedyny plik akcji (`maintenance/_actions/mwo-actions.ts`) jest **pierwszym punktem
egzekucji** rodziny RBAC `mnt.*`, którą migracja 202 zasiała, ale nic nie
konsumowało do tego wycinka (`mwo-actions.ts:21-28`). Maszyna stanów MWO jest
**po stronie serwera i zakodowana na stałe** (`LEGAL_TRANSITIONS`,
`mwo-actions.ts:88-95`) — silnik „workflow-as-data" z PRD to późniejszy wycinek
(`mwo-actions.ts:13-19`,`maintenance.ts:196-197`). Każde przejście blokuje wiersz
MWO (`for update`) i ponownie potwierdza stan źródłowy w klauzuli `WHERE`
polecenia `UPDATE`, co serializuje dwa równoległe przejścia
(`mwo-actions.ts:502-541`). Dwa zdarzenia cyklu życia są emitowane do
`outbox_events` — `maintenance.mwo.created` (przy tworzeniu) i
`maintenance.mwo.completed` (przy ukończeniu) — ale **żaden konsument ich nie
czyta** (patrz §f.).

Rejestr aktywów faktycznie używany przez moduł to **`public.machines`** (właściciel:
02-settings, migracja 042), osiągany jako **miękki uuid** `machine_id` dodany przez
migrację 290 (`290-maintenance-mwo-machine-link.sql:31-37`) — weryfikowany w zakresie
org wewnątrz akcji, bez twardego FK, zgodnie z konwencją cross-modułową migracji 201.
Kolumna `maintenance_work_orders.equipment_id` z twardym FK (do rejestru aktywów
`equipment`) pozostaje niezmieniona, ponieważ ten rejestr jest pusty/niezbudowany
(`290…:9-19`).

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują dotykane tabele Postgres. „Brama" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji przez lokalny helper
> `hasPermission` (`mwo-actions.ts:179-195`), który sprawdza ZARÓWNO znormalizowaną
> tabelę `role_permissions`, JAK I starszą pamięć podręczną jsonb `roles.permissions`
> dla danego ciągu. Brakujące uprawnienie zwraca typizowane `{ ok:false,
> reason:'forbidden' }`, nigdy 500. Rodzina `mnt.*` jest zasiewa na rodzinę roli
> org-admin + rodzinę roli operatora/technika utrzymania ruchu przez migrację 202
> §(B) — poprawka nr 1 na błędy 403-wszędzie
> (`202-maintenance-outbox-and-rbac-seed.sql:167-323`).

### Akcje MWO + PM (jedyne aktywne akcje) — `maintenance/_actions/mwo-actions.ts`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listMwos({status?,machineId?,limit?})` (`mwo-actions.ts:283`) | Ładowarka listy `/maintenance`. Liczniki per-stan dla CAŁEGO zestawu org, następnie przefiltrowana strona (zakładka statusu + opcjonalna maszyna, `order by created_at desc`, limit ≤200). Left-join `machines` dla kodu/nazwy; fallback `title → requester_reason → mwo_number`, aby wiersz sprzed migracji 290 nigdy nie wyświetlał pustki. **Tylko odczyt.** | odczytuje `maintenance_work_orders`, `machines`; nic nie zapisuje | `mnt.asset.read` | — (odczyt) |
| `listMachinesForMwo()` (`mwo-actions.ts:348`) | Aktywne maszyny dla listy rozwijanej okna dialogowego tworzenia (`status='active'`, ograniczone do org, limit 500, `order by code`). | odczytuje `machines` | `mnt.asset.read` | — (odczyt) |
| `listPmSchedules()` (`mwo-actions.ts:576`) | Lista harmonogramów PM tylko do odczytu — `maintenance_schedules` left-join do `equipment` dla kodu/nazwy, `order by next_due_date asc nulls last`. **Silnik cron PM + edytor nie są zbudowane** (kolejne etapy T-003/T-009, `mwo-actions.ts:571-575`). | odczytuje `maintenance_schedules`, `equipment` | `mnt.asset.read` | — (odczyt) |
| `getMwoPermissions()` (`mwo-actions.ts:266`) | Flagi RBAC rozwiązywane po stronie serwera (`canRead/canCreate/canExecute/canCancel`) sterujące tym, które przyciski renderuje island kliencki; mutacje i tak ponownie sprawdzają. Zwraca wszystko-false przy każdym błędzie (fail-closed). | odczytuje `user_roles`, `roles`, `role_permissions` | — (sonda; bramuje działania downstream) | — |
| `createMwo({machineId,title,description?,priority,dueDate?,downtimeEventId?})` (`mwo-actions.ts:384`) | Tworzy ręczne zlecenie **`reactive`** (reaktywne) MWO w stanie **`open`**. Weryfikuje miękkie powiązanie maszyny w zakresie org (`not_found` jeśli brak). Przydziela `mwo_number = MWO-YYYY-NNNNN` pod **blokadą transakcji doradczej per-org** (`pg_advisory_xact_lock`), aby równoległe tworzenia nigdy nie kolidowały na unikalności `(org_id, mwo_number)`. `source` = `auto_downtime` gdy podano `downtimeEventId`, inaczej `manual_request`. Emituje `maintenance.mwo.created`. | odczytuje `machines`; zapisuje `maintenance_work_orders`, `outbox_events` | `mnt.mwo.request` | `transitionMwo(...,'cancelled')` |
| `transitionMwo({mwoId,to,note?})` (`mwo-actions.ts:489`) | Przesuwa MWO wzdłuż `LEGAL_TRANSITIONS`. `to='in_progress'` stempluje `started_at`; `to='completed'` stempluje `completed_at` + oblicza `actual_duration_min` (teraz − started, ≥0) + zapisuje `completion_notes`; `to='cancelled'` zapisuje `cancellation_reason`. Zablokowane wierszem `for update`; `UPDATE` ponownie potwierdza stan źródłowy (`and w.state = $5`). Emituje `maintenance.mwo.completed` w TEJ SAMEJ transakcji po ukończeniu. | zapisuje `maintenance_work_orders`, `outbox_events` | start/complete → `mnt.mwo.execute`; anulowanie → `mnt.mwo.cancel` (SoD: tylko admin/manager per zasiew 202) | — (brak un-complete; `completed`/`cancelled` są stanami terminalnymi) |

**Zinwentaryzowana liczba akcji: 6** (3 odczyty: `listMwos`, `listMachinesForMwo`,
`listPmSchedules`; 1 sonda RBAC: `getMwoPermissions`; 2 zapisy: `createMwo`,
`transitionMwo`). **Nie ma żadnych akcji** dotyczących aktywów, techników, edycji PM,
LOTO, kalibracji, sanitacji, części zamiennych ani historii w całym drzewie — te
tabele mają schemat + ciągi RBAC, ale żadnego kodu (patrz §f.).

### Rodzina RBAC zasiała, ale w większości nieegzekwowana — `packages/rbac/src/permissions.enum.ts`

> Pełna rodzina `mnt.*` (18 ciągów, `ALL_MAINTENANCE_PERMISSIONS`,
> `permissions.enum.ts:354-388`,`:794-813`) jest zasiewa przez migrację 202; tylko
> **4 ciągi poniżej** są odczytywane przez jakikolwiek kod. Reszta jest
> zadeklarowana-ale-martwa do czasu, gdy trafią ich wycinkowe implementacje.

| Uprawnienie | Zasiewa (mig 202) | Odczytywane przez kod? | Gdzie |
|---|---|---|---|
| `mnt.asset.read` | ✅ admin + operator | ✅ | brama nawigacji (`module-registry.ts:18`,`:237`) + wszystkie 3 odczyty (`mwo-actions.ts:52`) |
| `mnt.mwo.request` | ✅ admin + operator | ✅ | `createMwo` (`mwo-actions.ts:53`,`:395`) |
| `mnt.mwo.execute` | ✅ admin + operator | ✅ | `transitionMwo` start/complete (`mwo-actions.ts:54`,`:497-499`) |
| `mnt.mwo.cancel` | ✅ tylko admin (SoD) | ✅ | `transitionMwo` anulowanie (`mwo-actions.ts:55`,`:498`) |
| `mnt.asset.edit` / `.deactivate`, `mnt.mwo.approve` / `.assign` / `.sign`, `mnt.pm.create` / `.skip`, `mnt.calib.record` / `.upload_cert`, `mnt.spare.consume` / `.adjust` / `.reorder`, `mnt.loto.apply` / `.clear` | ✅ (podzbiór operatora per §4 least-privilege, `202…:215-228`) | ❌ **brak czytnika** | — (ich akcje są niezbudowane) |

---

## c. Maszyna stanów

### Cykl życia MWO (`LEGAL_TRANSITIONS`, `mwo-actions.ts:88-95`)

Ograniczenie CHECK bazy danych dopuszcza **6 stanów**
(`maintenance_work_orders_state_check`, `201…:178-179`):
`requested | approved | open | in_progress | completed | cancelled`.
Aktywny wycinek tylko **tworzy** wiersze `open` i obsługuje jedynie poniższy
zakodowany na stałe podzbiór; wiersze `requested`/`approved` mogą istnieć wcześniej
(SQL/zasiewy — przyszły silnik PM / triage zgłoszeń pracy, D-MNT-9) i są tu
**anulowalne, ale nie startowalne**.

```
 (requested ─┐
  approved ──┤── cancel ─► cancelled (terminal)
             │
   open ─────start──► in_progress ──complete──► completed (terminal)
    │                      │
    └────── cancel ────────┴────── cancel ─────► cancelled (terminal)
```

| Stan (`maintenance_work_orders.state`) | Dozwolone `to` | Kto zapisuje | Uwagi |
|---|---|---|---|
| `requested` | `cancelled` | (zasiewy / przyszły wycinek WR) | Nie tworzony przez ten wycinek; ucieczka tylko przez anulowanie, by osierocone zasiewy nigdy nie utknęły. |
| `approved` | `cancelled` | (przyszły wycinek WR) | To samo — tylko anulowanie. |
| `open` | `in_progress`, `cancelled` | `createMwo` (wszystkie nowe wiersze) | Stan startowy każdego MWO tworzonego przez UI. |
| `in_progress` | `completed`, `cancelled` | `transitionMwo` (start) | Stempluje `started_at`. |
| `completed` | — (terminal) | `transitionMwo` (complete) | Stempluje `completed_at` + `actual_duration_min` + `completion_notes`; emituje `maintenance.mwo.completed`. |
| `cancelled` | — (terminal) | `transitionMwo` (cancel) | Zapisuje `cancellation_reason`. Brak „cofnij anulowanie". |

Maszyna jest egzekwowana **dwukrotnie**: klient renderuje tylko legalne stanowo +
dozwolone akcje wierszowe (`mwo-list.client.tsx:438-490` — `open→Start`,
`in_progress→Complete`, `Cancel` gdy `canCancel`), a `transitionMwo` ponownie
waliduje względem `LEGAL_TRANSITIONS` po stronie serwera — niedozwolony czasownik
zwraca `invalid_transition` (`mwo-actions.ts:514-520`); blokada `for update` +
ponowne potwierdzenie stanu źródłowego w `UPDATE` serializują równoległych
piszących (`mwo-actions.ts:503-547`).

Przejścia stanów **NIE są egzekwowane przez wyzwalacz DB** — są celowo
odpowiedzialnością Server Action (`201…:145-147`,`maintenance.ts:196-197`). Nie ma
tu immutowalnego rejestru w stylu `wo_events` (w odróżnieniu od 08-production);
jedynym śladem są własne kolumny znaczników czasu/notatek wiersza MWO + tabela
`maintenance_history`, która **nigdy nie jest zapisywana** (patrz §f.).

<!-- screenshot: /maintenance lista MWO (zakładki statusów + liczniki + wyszukiwanie + tabela) -->
<!-- screenshot: /maintenance widok harmonogramów PM (tylko odczyt) + modalne okno tworzenia MWO -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków poniżej to rozwiązane angielskie teksty z zaplanowanego
> pakietu `maintenance-mwo` (`_meta/i18n-staging/maintenance-mwo.json`, ładowanego
> przez `maintenance-labels.ts` — przestrzeń nazw **nie jest jeszcze scalona z
> next-intl**, patrz §f.); `data-testid`y w nawiasach to stabilne kotwice w
> `maintenance/_components/mwo-list.client.tsx`.

### (i) Otwarcie zlecenia pracy (reaktywne MWO)

1. Otwórz **Utrzymanie ruchu** z paska bocznego (`/maintenance`). Wpis nawigacyjny
   jest bramowany przez `mnt.asset.read` (`module-registry.ts:18`,`:237`); strona
   ponownie sprawdza to uprawnienie wewnątrz każdej akcji odczytu.
2. Z wybranym widokiem **Zlecenia pracy** (`mwo-view-mwos`) kliknij **+ Nowe MWO**
   (`mwo-create-open`) — przycisk renderuje się tylko jeśli posiadasz `mnt.mwo.request`.
3. W oknie dialogowym (`mwo-create-modal`): wybierz **Maszynę** (`mwo-create-machine` —
   rzeczywista lista `public.machines`; jeśli Twoja org nie ma aktywnych maszyn,
   wyświetla się komunikat „brak maszyn" `mwo-create-no-machines`), wprowadź **Tytuł**
   (`mwo-create-title`, ≥3 znaki), opcjonalny **Opis problemu**
   (`mwo-create-description` → przechowywany w `requester_reason`), **Priorytet**
   (`mwo-create-priority`) oraz opcjonalny **Termin wykonania** (`mwo-create-due-date`).
4. Zatwierdź (`mwo-create-submit`) → `createMwo`. MWO jest tworzone w stanie
   `open` z `source='manual_request'`, otrzymuje numer `MWO-YYYY-NNNNN`, a lista
   odświeża się.

### (ii) Rozpoczęcie / ukończenie / anulowanie MWO

1. Na liście, dla wiersza w stanie **`open`** kliknij **Start** (`mwo-start-<id>`);
   dla wiersza **`in_progress`** kliknij **Complete** (`mwo-complete-<id>`). Obie
   operacje wymagają `mnt.mwo.execute`. **Cancel** (`mwo-cancel-<id>`) wyświetla się
   dla każdego wiersza nieterminalnego, gdy posiadasz `mnt.mwo.cancel`.
2. Otwiera się okno dialogowe potwierdzenia (`mwo-transition-modal`). **Complete**
   i **Cancel** przyjmują opcjonalną **notatkę** (`mwo-transition-note` →
   `completion_notes` / `cancellation_reason`); **Start** nie przyjmuje żadnej.
   Potwierdź (`mwo-transition-confirm`) → `transitionMwo`.
3. Po ukończeniu obliczany jest `actual_duration_min` MWO na podstawie
   `started_at → now` i emitowane jest zdarzenie `maintenance.mwo.completed`.
   Niedozwolony ruch wyświetla błąd „niedozwolone przejście" (`mwo-transition-error`);
   brak uprawnienia wyświetla błąd forbidden.

### (iii) Filtrowanie / wyszukiwanie MWO

- Kliknij **zakładkę statusu** (`mwo-tab-<state>`), by filtrować po stanie; każda
  zakładka pokazuje aktualny licznik. Wpisz w polu **wyszukiwania** (`mwo-search`),
  by dopasować numer MWO, tytuł, kod maszyny lub nazwę maszyny (po stronie klienta,
  na załadowanej stronie). Puste stany są informacyjne: `mwo-empty` (brak MWO
  w ogóle) vs `mwo-empty-filtered` (wyfiltrowane).
- Wiersz open/in_progress z przekroczonym **terminem wykonania** jest wyróżniony
  czerwienią z odznaką **Overdue** (przeterminowane) (`mwo-overdue-<id>`,
  `mwo-list.client.tsx:355`,`:383-387`).

### (iv) Podgląd harmonogramów PM (tylko odczyt)

1. Przełącz na widok **Harmonogramy PM** (`mwo-view-pm`). Tabela (`pm-schedule-card`)
   wyświetla dla każdego harmonogramu: **Wyposażenie / Typ / Interwał / Następny
   termin / Ostatnie ukończenie / Aktywny** z `maintenance_schedules`.
2. Ten widok jest **tylko do odczytu** — w bieżącej wersji nie ma UI do tworzenia/
   edycji/pomijania PM (edytor + silnik cron są niezbudowane,
   `mwo-actions.ts:571-575`). Wiersze pojawiają się tylko wtedy, gdy
   `maintenance_schedules` zostało zasilone przez SQL, ponieważ żadna akcja tego
   nie zapisuje.

### (v) Gdzie będzie rejestrowanie awarii/napraw, LOTO, kalibracja, części zamienne

**Nie istnieją jeszcze w UI.** „Rejestrowanie" awarii/napraw ogranicza się do
notatki ukończenia MWO + `actual_duration_min`; nie ma strony szczegółów MWO,
dualnego podpisu LOTO, rejestracji kalibracji ani wydania części zamiennych.
Tabele dla wszystkich tych funkcji istnieją (`packages/db/schema/maintenance.ts`),
ale żaden ekran ani akcja ich nie dotykają (patrz §f.).

---

## e. Źródła danych (tabele Supabase)

Aktywne odczyty/zapisy MWO + PM (jedyne tabele dotykane przez jakąkolwiek akcję):

- `maintenance_work_orders` — rdzeń MWO, 6 stanów (`201…:149-191`). Aktywny wycinek
  zapisuje `state`, `source`, `type='reactive'`, `priority`, `machine_id` (miękki,
  mig 290), `title`, `due_date`, `requester_reason`, `requester_user_id`,
  `started_at`, `completed_at`, `actual_duration_min`,
  `completion_notes`/`cancellation_reason`. `equipment_id` (twardy FK do rejestru
  aktywów) **nigdy nie jest ustawiany** przez UI — zlecenia MWO na maszynach
  korzystają zamiast tego z miękkiego `machine_id` (`290…:9-19`).
- `maintenance_schedules` — harmonogramy PM/kalibracyjne/sanitacyjne/inspekcyjne
  (`201…:111-142`); **tylko odczyt** w tym wycinku (`listPmSchedules`). Żadna
  akcja nie zapisuje `next_due_date` / `last_completed_at`, więc kolumny cron
  są statyczne.
- `machines` — **własność 02-settings** (migracja 042); rzeczywisty rejestr aktywów,
  do którego MWO linkuje przez miękki `machine_id` (`290…`). Odczytywany dla listy
  rozwijanej + joinów listy, nigdy tu nie zapisywany.

Zarządzanie / przekrojowe:

- `role_permissions` + `roles.permissions` — rodzina `mnt.*` (podwójne przechowywanie),
  zasiewa przez migrację 202 §(B) na rodziny ról org-admin + operator utrzymania
  ruchu, z wyzwalaczem `after insert`, by nowe orgi dziedziczyły to ustawienie
  (`202…:292-323`). Lokalny `hasPermission` odczytuje obie (`mwo-actions.ts:179-195`).
- `outbox_events` — dopuszcza 9 typów zdarzeń maintenance + `spare.reorder_*`
  (CHECK zregenerowany przez migrację 202 §(A), `202…:61-68`,`:147`); aktywny wycinek
  emituje dokładnie **2**: `maintenance.mwo.created` i `maintenance.mwo.completed`
  (`mwo-actions.ts:197-215`,`:458`,`:551`).

Schemat własnościowy maintenance **zdefiniowany, ale nie odczytywany/zapisywany przez
żadną akcję** (migracja 201, `packages/db/schema/maintenance.ts`):

- `maintenance_settings` (§9.1) — ustawienia per (org, site), w tym `mtbf_target_hours`,
  `calibration_warning_days`, `requires_loto_default`.
- `technician_profiles` (§9.2) — pracownicy utrzymania ruchu + umiejętności/certyfikaty.
- `equipment` (§9.3) — 5-poziomowy rejestr aktywów (site→obszar→linia→maszyna→
  komponent); jedynie **odczytywany** (join dla kodu/nazwy PM), nigdy zapisywany —
  CRUD aktywów jest niezbudowany.
- `mwo_checklists` (§9.6), `mwo_loto_checklists` (§9.7) — lista kontrolna wykonania
  + dualny e-podpis LOTO (OSHA 1910.147; `zero_energy_verified_by` + `released_by`).
- `spare_parts` (§9.8), `maintenance_spare_parts_stock` (§9.9),
  `spare_parts_transactions` (§9.10), `mwo_spare_parts` (§9.11) — CMMS części
  zamiennych (oddzielny od `items` w 03-technical, D-MNT-6).
- `calibration_instruments` (§9.12), `calibration_records` (§9.13) — rejestr
  przyrządów + immutowalne certyfikaty (21 CFR Part 11 `certificate_sha256`,
  `retention_until` GENERATED +7y BRCGS).
- `sanitation_checklists` (§9.14) — CIP + dualny podpis zmiany alergenów + ATP RLU
  (retencja +7y).
- `maintenance_history` (§9.15) — append-only denormalizowany dziennik audytowy
  (retencja +7y); **nigdy nie zapisywany** przez żadną akcję.

Tożsamości cross-modułowe to **miękkie uuid** (bez Drizzle `.references()`,
`maintenance.ts:31-38`): `equipment.parent_line_id` / `assigned_operation_id`,
`maintenance_work_orders.downtime_event_id` (→ `downtime_events` w 08-production),
`spare_parts.supplier_id`, `*.warehouse_id`, `sanitation_checklists.line_id`.

---

## f. Znane luki / TODO

Oparte na odczytanym kodzie — żadnych domysłów:

1. **13 z 15 tabel CMMS to osierocona baza schematu.** Tylko
   `maintenance_work_orders` (zapis) i `maintenance_schedules` +
   `equipment`/`machines` (odczyt) są dotykane przez jakąkolwiek akcję.
   `maintenance_settings`, `technician_profiles`, `mwo_checklists`,
   `mwo_loto_checklists`, cztery tabele `spare_parts*`/`mwo_spare_parts`,
   `calibration_instruments`, `calibration_records`, `sanitation_checklists`
   i `maintenance_history` istnieją w `packages/db/schema/maintenance.ts` +
   migracji 201 z pełnymi CHECK-ami, RLS, indeksami i wygenerowanymi kolumnami
   retencji, ale **żaden Server Action ani strona ich nie odczytuje ani nie zapisuje**.
   CRUD aktywów, silnik cron/edytor PM, LOTO, kalibracja, sanitacja, części zamienne
   i historia — wszystko jest niezaimplementowane.

2. **Rejestr aktywów jest podzielony: UI używa `machines`, FK schematu wskazuje na
   `equipment`.** `maintenance_work_orders.equipment_id` posiada twardy FK do
   niezbudowanego rejestru `equipment`, więc aktywny wycinek linkuje MWO do
   rzeczywistej tabeli `public.machines` z 02-settings przez miękki `machine_id`
   dodany przez migrację 290 (`290…:9-19`). Do czasu zapełnienia rejestru `equipment`
   (i zbudowania ekranu CRUD aktywów) zlecenia MWO niosą `machine_id`, a
   `equipment_id` pozostaje NULL — dwie równoległe tożsamości aktywów do pogodzenia.

3. **14 z 18 uprawnień `mnt.*` jest zadeklarowanych, ale martwych.** Tylko
   `mnt.asset.read`, `mnt.mwo.request`, `mnt.mwo.execute`, `mnt.mwo.cancel`
   są odczytywane przez kod; `mnt.asset.edit/.deactivate`, `mnt.mwo.approve/.assign/.sign`,
   `mnt.pm.create/.skip`, `mnt.calib.record/.upload_cert`,
   `mnt.spare.consume/.adjust/.reorder`, `mnt.loto.apply/.clear` są zasiewa
   (`202…:195-228`) i w enumie (`permissions.enum.ts:354-388`), ale nie mają
   żadnego czytnika — ich akcje są niezbudowane.

4. **2 emitowane zdarzenia outbox nie mają aktywnego konsumenta.**
   `maintenance.mwo.created` / `maintenance.mwo.completed` są utrwalane w
   `outbox_events`, ale — zgodnie z `MON-project-overview` — nie działa żaden
   dispatcher `apps/worker`. Udokumentowani konsumenci — 15-OEE
   `mwo.completed → MTBF/MTTR` (D-MNT-3), 09-quality `calibration.failed`
   auto-wstrzymanie, 08-production `sanitation.allergen_change → brama przezbrojenia`
   (D-MNT-14), 05-warehouse reorder części zamiennych (`events.enum.ts:224-238`) —
   to **szwy, nie dostarczone funkcje**. Pozostałe 7 typów zdarzeń maintenance jest
   dopuszczanych przez CHECK, ale **nigdy nie emitowanych** (nie istnieje żadna
   akcja kalibracji/LOTO/sanitacji/PM-due).

5. **Powiązanie przestój → OEE NIE jest funkcją utrzymania ruchu.** MTBF/MTTR OEE
   jest obliczany z `oee_snapshots` ÷ `downtime_events` — obie tabele **własnościowe
   08-production** — wewnątrz widoku `oee_shift_metrics` w 15-oee
   (`203-oee-schema-foundation.sql:289-296`); **nie odczytuje** zleceń MWO.
   Utrzymanie ruchu posiada jedynie miękką kolumnę `downtime_event_id` i wartość
   `source='auto_downtime'`. **Nic nie tworzy automatycznie MWO ze zdarzenia
   przestoju**: przeszukanie kodu dla `auto_downtime`/`oee_trigger`/`calibration_alert`
   wskazuje tylko opcjonalny parametr `downtimeEventId` w `createMwo`
   (`mwo-actions.ts:168-169`,`:427`) i testy — wyzwalacz auto-MWO P2 (T-017)
   nie jest podłączony.

6. **Brak strony szczegółów MWO, brak UI listy kontrolnej/rejestrowania napraw.**
   Wiersze listy nie mają podglądu; „rejestrowanie" awarii/napraw to tylko notatka
   ukończenia + `actual_duration_min` na wierszu MWO. Listy kontrolne MWO
   (`mwo_checklists`) z PRD, LOTO i wiersze `maintenance_history` nigdy nie są
   tworzone. Sumowanie kosztów `mwo_spare_parts` do `actual_cost` nie następuje
   (kolumna nigdy nie jest zapisywana).

7. **Harmonogramy PM są tylko do odczytu i statyczne.** `listPmSchedules` tylko
   odczytuje; nic nie zapisuje `next_due_date` / `last_completed_at`, i nie ma
   crona PM (częściowy indeks `idx_schedules_next_due` + zdarzenie `maintenance.pm.due`
   istnieją dla silnika, który nie jest zbudowany, `201…:137-139`). Wiersze
   pojawiają się tylko jeśli zasilone przez SQL.

8. **i18n nie jest scalona z next-intl.** Przestrzeń nazw `maintenance` jest
   rozwiązywana z **zaplanowanego** pakietu `_meta/i18n-staging/maintenance-mwo.json`
   przez dedykowany loader (`maintenance-labels.ts:1-18`), nie z aktywnych plików
   `apps/web/i18n/*` — istnieją tylko wartości rzeczywiste `en` + `pl`; loader
   humanizuje każdy brakujący klucz. Po scaleniu zwęża się do cienkiego wrappera
   `getTranslations` (`maintenance-labels.ts:14-16`).

9. **`site_id` jest nullable od pierwszego dnia we wszystkich 15 tabelach z RLS
   tylko na poziomie org.** Każda tabela posiada nullable `site_id` bez FK / bez
   rejestru; predykat RLS jest tylko org (`app.current_org_id()`) do czasu gdy
   14-multi-site T-030 dostarczy `app.current_site_id()` (`maintenance.ts:25-28`,
   `201…:7-11`,`:462-464`). Aktywne inserty MWO nigdy nie ustawiają `site_id`.

Liczba akcji i każda luka powyżej pochodzi z cytowanych plików; jedyny aktywny
kod maintenance to strona `/maintenance` + plik 6 akcji `mwo-actions.ts` obsługujący
`maintenance_work_orders` / `maintenance_schedules` / `machines`, a reszta schematu
CMMS jest niepodłączona.
