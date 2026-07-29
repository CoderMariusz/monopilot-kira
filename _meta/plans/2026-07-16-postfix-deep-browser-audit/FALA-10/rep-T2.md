# FALA-10 / T2 — Scheduler capacity double-count + Production dashboard unavailable

**Tor:** T2 (scheduler + production dashboard)  
**Findings:** PF-R12-02 (P1), PF-R13-01 (P1)  
**Data:** 2026-07-29

---

## PF-R12-02 — Capacity double-counts WO slot + draft alternative

### Przyczyna źródłowa

`loadSchedulerCapacity` budowało occupancy jako **sumę** dwóch niezależnych źródeł (UNION ALL):

1. bieżący slot `work_orders` (RELEASED/IN_PROGRESS),
2. draft `scheduler_assignments` dla tego samego `wo_id`.

Deduplikacja draftów (`selectedDrafts`, linie 218–236) usuwała tylko **wiele wariantów draftu** tego samego WO, ale **nigdy nie wykluczała** odpowiadającego mu wiersza WO. Draft to alternatywne umiejscowienie tego samego zlecenia, nie dodatkowa praca fizyczna — sumowanie obu dawało +100% obłożenia na linii.

### Zmiana

| Plik | Linie | Co i dlaczego |
|---|---|---|
| `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.ts` | 5–7 | Komentarz modułu: draft **zastępuje** slot WO, nigdy nie dodaje się obok. |
| j.w. | 165–166 | WO branch SQL: `wo.id::text as alternative_key` — wspólny klucz `wo_id` do dopasowania draft↔WO. |
| j.w. | 217–247 | Dwufazowe budowanie occupancy: (1) wybierz najlepszy draft per `wo_id`, (2) dodaj WO **tylko gdy brak draftu** dla tego `wo_id`, potem dodaj wybrane drafty. |

**Uzasadnienie wyboru „draft zamiast WO”:** Po uruchomieniu schedulera użytkownik ogląda **propozycję** nowego planu. Draft reprezentuje zamierzone umiejscowienie; bieżący slot WO to stan przed apply. Liczenie obu jednocześnie fałszuje widok capacity właśnie w momencie, gdy planista decyduje o wykonalności. Gdy draftu nie ma, liczony jest wyłącznie slot WO (bez zmiany zachowania).

### Testy dodane

| Plik | Test | Co by go wywróciło bez poprawki |
|---|---|---|
| `capacity-loaders.test.ts` | `replaces the WO slot with its draft alternative instead of double-counting` | Mock zwraca WO+draft (ten sam `alternative_key`, po 1h każdy). Bez fixa `occupiedHours === 2`, `sourceWoHours === 1`; po fixie `1 / 0 / 1`. |
| j.w. | `counts mutually exclusive draft variants…` (rozszerzony) | Asercja `wo.id::text as alternative_key` w SQL — bez niej WO nie da się skorelować z draftem. |

---

## PF-R13-01 — Production dashboard niedostępny, `/production/wos` działa

### Diagnoza (wykluczone pułapki kampanii)

| Hipoteza | Wynik |
|---|---|
| `export type { X }` bez `from` w `'use server'` | **Nie** — `dashboard-data.ts` eksportuje typy inline (`export type Foo = …`), nie re-eksporty runtime. Strona renderuje banner błędu, więc moduł się ewaluuje. |
| Brakujący klucz i18n (`MISSING_MESSAGE`) | **Nie** — `production.dashboard.*` (w tym `nav.changeovers`, `error`, KPI, `woStatus`) istnieje w `apps/web/i18n/en.json:7448–7540`. Banner to `t('error')` z `reason: 'error'`, nie crash tłumaczeń. |

### Przyczyna źródłowa

Zapytanie WO-list w `getProductionDashboard` (linie 294–303) rzucało błąd SQL przy **każdym** wierszu z outputem:

```sql
-- lateral subquery (PRZED):
select coalesce(sum(o.qty_kg), 0)::text as qty_kg  -- typ text

-- progress_pct w tym samym SELECT:
round(produced.qty_kg / w.planned_quantity * 100, 0)  -- text / numeric → brak operatora
```

Postgres nie ma operatora `text / numeric`. Cała funkcja łapie wyjątek w `catch` (linia 347) i zwraca `{ ok: false, reason: 'error' }` → pełnoekranowy banner.

`/production/wos` używa `list-work-orders.ts`, który trzyma `qty_kg` jako **numeric** w lateral (`coalesce(sum(o.qty_kg), 0) as qty_kg`, linia 239) — stąd sub-trasa działała.

### Zmiana

| Plik | Linie | Co i dlaczego |
|---|---|---|
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts` | 295 | Usunięto `::text` z lateral subquery — `qty_kg` pozostaje numeric do dzielenia w `progress_pct`. Zewnętrzny `produced.qty_kg::text as produced_quantity` (linia 279) nadal dostarcza string do UI. |

### Testy dodane

| Plik | Test | Co by go wywróciło bez poprawki |
|---|---|---|
| `dashboard-data.test.ts` | `keeps produced qty numeric in the lateral subquery so progress_pct division is valid` | Asercja że SQL WO-list zawiera `coalesce(sum(o.qty_kg), 0) as qty_kg` i **nie** zawiera `::text as qty_kg` w lateral. Przy starym kodzie druga asercja pada. |

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| Per-tile error isolation na dashboardzie (suggested fix z run-13) | PF-R13-01 root cause to crash SQL, nie brak degradacji — naprawa zapytania przywraca dashboard; izolacja KPI to osobny enhancement poza P1. |
| `capacity-loaders.ts` arytmetyka ms→h przez `Number()` | Obłożenie liczone w milisekundach slotów czasowych (nie kwoty NUMERIC z DB); poza zakresem PF-R12-02 i bez ryzyka driftu pieniężnego. |
| Migracja `534-*.sql` | Oba bugi w warstwie aplikacji (SQL w Server Action), schemat DB poprawny. |
| PF-R13-02 (elapsed po cancel), PF-R13-03 (zero-min downtime) | Inne tory / findings. |

---

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)

| ID | Opis | Lokalizacja |
|---|---|---|
| PF-R13-02 | Elapsed rośnie po cancel — `Date.now()` gdy `completed_at IS NULL` | `production/_actions/get-work-order-detail.ts:751-755` |
| PF-R13-03 | Resume akceptuje 0-min downtime | run-13/REPORT.md |
| PF-R12-01 | Brak unique na `scheduler_assignments` — wiele draftów per WO | RECON-FACTS §3 (deduplikacja w kodzie łagodzi, ale nie na poziomie DB) |

---

## Pliki dotknięte

- `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.ts`
- `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.test.ts`
- `_meta/plans/2026-07-16-postfix-deep-browser-audit/FALA-10/rep-T2.md` (ten raport)

**Testy nie uruchamiane** (zakaz orchestratora) — napisane „na sucho" z weryfikacją istnienia eksportów i kształtu mocków.
