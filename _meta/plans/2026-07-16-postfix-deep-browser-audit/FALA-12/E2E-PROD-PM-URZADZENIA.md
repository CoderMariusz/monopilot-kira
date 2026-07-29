# E2E PROD — harmonogram PM / rozwiązywanie urządzenia

**Commit:** `3e5d0159` · **Deployment:** `dpl_9RY1hAAVPHgRG2B9ZbfjwCQ9eDs7` (production, READY, alias `monopilot-kira.vercel.app`)
**Data:** 2026-07-29 ~04:03–04:05 UTC · **Org:** Apex 22 (`00000000-0000-0000-0000-000000000002`) · **Użytkownik:** admin@monopilot.test
**Baza:** wyłącznie SELECT-y. Wszystkie zapisy wykonane przez interfejs.

## Stan wyjściowy (przed testem)

| obiekt | stan |
|---|---|
| `public.equipment` (Apex 22) | **3** wiersze: `LINE1`, `NIGHT-R20-…-AST`, `REGR-FINAL-A1` |
| `public.production_lines` (Apex 22) | 13 wierszy, w tym `BAKE` = `6191e588-4c7c-4951-a325-d998b9646afc` |
| `BAKE` w `public.equipment` | **NIE ISTNIAŁO** |
| `public.maintenance_schedules` | 1 wiersz |
| `public.maintenance_work_orders` | 3 wiersze (do `MWO-2026-00003`) |

Lista urządzeń w modalu sortuje `order by equipment_code` (UNION `equipment` + `production_lines`),
więc pozycją domyślną jest `BAKE` — wiersz z `production_lines`, nie z `equipment`.
Dropdown MWO pokazał **12 pozycji**, co zgadza się z opisem poprawki (3 realne `equipment`).

## Wynik

| punkt | status | twardy dowód |
|---|---|---|
| **1. Domyślny wybór urządzenia działa** | **PASS** | Modal otwarty z domyślnym `BAKE — BAKE`, **urządzenia nie zmieniano**; wypełniono tylko „First due date" = 2026-10-15. Po „Save schedule" modal zamknął się, **brak `equipment not found`** na ekranie, wiersz `BAKE / Preventive / 30 days / 2026-10-15 / Active` pojawił się w tabeli. Dowód trwały poniżej (Q1 + Q2). |
| **2. Sąsiednia ścieżka (MWO) nie ucierpiała** | **PASS** | MWO utworzone przez interfejs na **tej samej linii BAKE**: `MWO-2026-00004`, id `bd93fd70-e32b-4163-9f91-17f0a679444c`, `equipment_id = 6191e588-…`, `state = open`, `due_date = 2026-10-20`, `created_at = 2026-07-29 04:04:24.660435+00`. |
| **3. Brak regresji na `/en/maintenance`** | **PASS** | HTTP **200**; 0 błędów i 0 ostrzeżeń w konsoli; wszystkie żądania sieciowe 200; brak wyrenderowanego error boundary (widoczny normalny app shell). |

### Punkt 1 — zapytania i wyniki

**Q1 — wiersz w `public.maintenance_schedules`:**

```sql
select id, equipment_id, schedule_type, interval_value, next_due_date, active, created_at
  from public.maintenance_schedules
 where org_id = '00000000-0000-0000-0000-000000000002'
 order by created_at;
```

```
id                                    equipment_id                          schedule_type  interval_value  next_due_date  active  created_at
21f47bbf-5c7d-4ec3-83f9-a5f9df95d3b1  948c099f-8054-49ae-99a1-dd5bb9410cd4  preventive     21              2026-09-01     t       2026-07-29 03:37:04.366939+00
2b55ab84-fa8a-41be-a9e3-387dddaba0bf  6191e588-4c7c-4951-a325-d998b9646afc  preventive     30              2026-10-15     t       2026-07-29 04:03:27.483804+00   <-- NOWY
```

**Q2 — czy `equipment_id` istnieje w `public.equipment` (auto-provisioning):**

```sql
select id, equipment_code, name, equipment_type, parent_line_id, active, created_at
  from public.equipment
 where id = '6191e588-4c7c-4951-a325-d998b9646afc';
```

```
id                                    equipment_code  name  equipment_type   parent_line_id                        active  created_at
6191e588-4c7c-4951-a325-d998b9646afc  BAKE            BAKE  production_line  6191e588-4c7c-4951-a325-d998b9646afc  t       2026-07-29 04:03:27.483804+00
```

**Kluczowy dowód auto-provisioningu:** `created_at` wiersza `equipment` (`04:03:27.483804+00`) jest
**identyczny co do mikrosekundy** z `created_at` harmonogramu — oba wiersze powstały w tej samej
transakcji. Ten sam `id` był nieobecny w `public.equipment` w stanie wyjściowym, a licznik
`equipment` dla Apex 22 wzrósł **3 → 4**. To jest dowód, że helper rozwiązał linię produkcyjną
i dociągnął ją do `equipment`, zamiast zwrócić `equipment not found`.

**Kontrola integralności — każdy harmonogram wskazuje na istniejące urządzenie:**

```
schedule_id                           equipment_id                          equipment_exists  equipment_code  equipment_type
21f47bbf-5c7d-4ec3-83f9-a5f9df95d3b1  948c099f-8054-49ae-99a1-dd5bb9410cd4  t                 LINE1           production_line
2b55ab84-fa8a-41be-a9e3-387dddaba0bf  6191e588-4c7c-4951-a325-d998b9646afc  t                 BAKE            production_line
```

### Punkt 3 — szczegóły

- `GET /en/maintenance` → **200**, 661 110 bajtów.
- Konsola: **0 komunikatów** (0 errors, 0 warnings).
- Sieć: wszystkie żądania (w tym prefetch RSC czterech MWO, łącznie z nowym `bd93fd70-…`) → 200.
- Wzorzec „Something went wrong" wystąpił w payloadzie **26×**, ale to **fałszywy alarm**:
  wszystkie trafienia to łańcuchy i18n (`errorGeneric: "Something went wrong. Please try again."`)
  wbudowane w słownik tłumaczeń, nie wyrenderowany error boundary. Zweryfikowane przez kontekst
  dopasowania i `document.body.innerText` (normalny app shell: „MonoPilot MES / Apex 22 / …").

## Rezydua

1. **Niespójność domyślnej wartości między dwoma modalami (kosmetyka/UX).** Modal PM startuje z
   realnie wybraną pierwszą pozycją (`BAKE — BAKE`), a modal MWO z pozycją-zaślepką
   („Equipment Placeholder"), która wymusza świadomy wybór. To właśnie brak zaślepki w PM sprawił,
   że pierwotny błąd trafiał w użytkownika przy pierwszym kliknięciu. Po poprawce nie jest to już
   usterka funkcjonalna, ale dwa sąsiadujące modale wciąż zachowują się różnie.
2. **`parent_line_id` wskazuje na samego siebie.** Auto-provisionowane urządzenie ma
   `id == parent_line_id == 6191e588-…`. Zachowanie odziedziczone po `createMwo` (identycznie
   wygląda starszy wiersz `LINE1`), **nie wprowadzone przez tę poprawkę** — ale jest to samoreferencja
   w kolumnie rodzica i warto ją kiedyś ocenić.
3. **Zduplikowane kody linii w danych Apex 22.** Trzy różne linie mają kod `LINE01`
   (`line01`, `LINE 1 BAKE`, `LINE 1`), przez co dropdown pokazuje trzy nieodróżnialne po kodzie
   pozycje. Problem danych/uniqueness, nie tej poprawki.
4. **Nie testowano gałęzi „linia nieaktywna".** Helper wymaga `status = 'active'` przy rozwiązywaniu
   linii; org ma dwie linie `inactive` (`N17R02L1`, `SOL-R02-LINE-0539`) oraz jedną `draft` (`CR14L`),
   ale nie występują one na liście, więc ścieżka odrzucenia nie została wywołana. **Nieudowodnione.**
5. **Nie odtworzono błędu sprzed poprawki na żywym prodzie.** Stan „przed" udokumentowany
   wyłącznie zapytaniem do bazy (brak `BAKE` w `equipment`) i lekturą diffa; świadomie nie klikano
   „Save schedule" na starym buildzie, żeby przełączenie aliasu w trakcie akcji nie zafałszowało wyniku.
   **Nieudowodnione behawioralnie**, choć różnica stanu bazy 3 → 4 jest jednoznaczna.

## Artefakty zapisane na produkcji (dane testowe)

- `maintenance_schedules` `2b55ab84-fa8a-41be-a9e3-387dddaba0bf` (BAKE, preventive, next due 2026-10-15)
- `equipment` `6191e588-4c7c-4951-a325-d998b9646afc` (BAKE, auto-provisioned)
- `maintenance_work_orders` `bd93fd70-e32b-4163-9f91-17f0a679444c` = `MWO-2026-00004` (state `open`)

## Werdykt

**Poprawka działa:** harmonogram PM zapisuje się przy nietkniętym domyślnym urządzeniu, linia
produkcyjna `BAKE` została automatycznie dociągnięta do `public.equipment` w tej samej transakcji,
a sąsiednia ścieżka tworzenia MWO na tej samej linii nadal działa bez regresji.
