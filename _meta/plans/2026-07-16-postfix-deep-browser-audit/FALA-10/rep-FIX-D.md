# FALA-10 / FIX-D — capacity draft z active run + bucketing na linii WO

**Data:** 2026-07-29  
**Korekta:** FIX-C (przeblokowanie w drugą stronę — obłożenie 0 zamiast 2 h)

---

## Werdykt

| Finding | Status |
|---|---|
| `uses the latest completed run draft…` — `occupiedHours` 0 zamiast 2 | Naprawione |
| FIX-C SQL `active_run` + `sa.run_id` | Zachowane (poprawne zawężenie do latest completed run) |

Testów nie uruchamiano (zakaz orchestratora).

---

## Przyczyna

FIX-C poprawnie:

1. Ograniczył `scheduler_assignments` do `sa.run_id = (select run_id from active_run)` — tylko szkice z **najnowszego completed runu**, bez starych przebiegów.
2. Wykluczył slot WO, gdy istnieje szkic dla tego `wo_id` (`selectedDrafts`).

Regresja: wybrany szkic był wrzucany do `byLine` pod **`sa.line_id`** (propozycja schedulera). Gdy najnowszy run przenosi WO na inną linię (test: WO na `LINE_ID`, szkic na `LINE_ID_NEW`), slot WO na linii zatwierdzonej był usunięty, a godziny szkicu lądowały na linii docelowej — **poza wierszem siatki** (mock zwraca tylko `LINE_ID`). Wynik: `occupiedHours = 0`, `sourceDraftHours = 0` → planista widzi linię jako całkowicie wolną.

To nie jest „wszystkie szkice odfiltrowane w SQL” — szkic był w wyniku zapytania, ale **nigdy nie trafiał do komórki wiersza wyświetlanej linii**.

---

## Poprawka

| Plik | Linie | Co |
|---|---|---|
| `capacity-loaders.ts` | 226–268 | `committedWoLineByKey` z wierszy WO; po wyborze szkicu z latest run przypisz occupancy na **linię zatwierdzonego WO** (`production_line_id`), z **czasem z szkicu** |
| j.w. | 5–7 | Komentarz: szkic zastępuje slot WO na linii zatwierdzonej |

SQL `active_run` CTE i `sa.run_id = (select run_id from active_run)` **bez zmian** — stare runy nadal nie wchodzą do occupancy; gdy brak completed runu → subquery NULL → liczy się sam slot WO.

### Zachowanie (test `uses the latest completed run draft…`)

| Scenariusz | occupancy SQL | `occupiedHours` na `lines[0]` (`LINE_ID`) |
|---|---|---|
| Bez filtra runu (mock zwraca stale 8 h + fresh 2 h) | wszystkie szkice | **8** — wygrywa najdłuższy stale, czas na linii WO |
| Z filtrem `active_run` (tylko fresh 2 h) | latest run | **2** — szkic latest run, czas na linii WO |
| Stale tylko (brak latest w SQL) | — | **1** — slot WO (stale runs keep committed slot) |

---

## Pliki dotknięte

- `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.ts`
- `_meta/plans/2026-07-16-postfix-deep-browser-audit/FALA-10/rep-FIX-D.md` (ten raport)

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `capacity-loaders.test.ts` | Asercje poprawne — kod dopasowany do testu |
| Usunięcie filtra `active_run` | Przywróciłoby zawyżanie ze starych runów |

## Weryfikacja (orchestrator)

```bash
pnpm --filter web exec vitest run apps/web/app/\[locale\]/\(app\)/\(modules\)/scheduler/capacity/_actions/capacity-loaders.test.ts
```
