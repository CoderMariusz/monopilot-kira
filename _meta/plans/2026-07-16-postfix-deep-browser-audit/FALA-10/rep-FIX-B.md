# FALA-10 / FIX-B — naprawa po cross-review (tory T3 + T5)

**Data:** 2026-07-29  
**Recenzje:** `out-rev-t3.md`, `out-rev-t5.md`

---

## T3 — PF-R13-03: rozdzielenie jawnego zera od sub-minutowej pauzy

### Przyczyna źródłowa

Poprzednia poprawka traktowała **dwa różne przypadki** jako jeden: gdy GENERATED `duration_min` wynosiło `0`, kod **kasował** wiersz `downtime_events`. To było poprawne tylko dla hipotetycznego „braku pomiaru”, ale **nie** dla realnej sub-minutowej pauzy (pause → natychmiast resume bez `actualDurationMin`), gdzie zero to skutek obcięcia `::integer` w migracji 183, a nie decyzja operatora.

PF-R13-03 dotyczy **jawnego wpisania 0** przez operatora — to nadal odrzucamy. Sub-minutowa pauza to inny kontrakt: fakt przestoju (kategoria, powód, outbox `opened`→`closed`) musi zostać w ewidencji.

### Decyzja semantyczna

| Scenariusz | Zachowanie |
|---|---|
| Operator wpisuje `actualDurationMin = 0` (lub ujemne / ułamek) | Odrzucenie `invalid_input` **przed** zapisem (bez zmian) |
| Timestamp mode, realna pauza < 1 min → GENERATED `duration_min = 0` | **Zachowaj wiersz**; dopisz do `ext_jsonb`: `durationBelowMinute: true`, `actualDurationSec` (floor epoch diff) |

Nie dodano migracji — `duration_min` pozostaje GENERATED; sekundy w `ext_jsonb` dają analityce prawdziwy czas bez udawania kanonicznego pomiaru minutowego. Raportowanie MV (`mv_reporting_downtime_by_line`) nadal sumuje `duration_min`; sub-minutowe zdarzenia liczą się jako 0 min w agregacie minutowym, ale **nie znikają** z licznika częstotliwości / zakładki Downtime.

### Zmiany

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/lib/production/pause-resume-wo.ts` | 143–151, 191–248 | Usunięto `DELETE` przy `duration_min === 0`. Dodano drugi `UPDATE` adnotujący `ext_jsonb`; rozszerzono `ResumeWoData` i outbox o opcjonalne `durationBelowMinute` / `actualDurationSec`. |
| `apps/web/lib/production/__tests__/pause-resume-wo.test.ts` | 93–120 | Test „discards…” → „keeps sub-minute…”: bez poprawki oczekiwał `downtimeEventId: null` i `DELETE`; teraz wymaga zachowania wiersza + adnotacji. |
| `apps/web/app/.../modals/__tests__/wo-actions.test.tsx` | 316–360 | Rozbito test „zero or negative” na trzy: `0`, `-1`, `1.5` — każdy blokuje POST; stary test przechodziłby przy mapowaniu `-1`→`null`. |

### Test integracyjny pełnego cyklu WO

`wo-lifecycle.integration.test.ts:361–372` (pause → resume bez `actualDurationMin` → `closedDt.rowCount === 1`) **nie wymagał zmiany** — kontrakt testu jest właściwy; kod musiał przestać kasować wiersz. Po usunięciu `DELETE` sub-minutowa pauza w teście pozostaje zamkniętym rekordem.

### Świadomie NIE ruszone (T3)

- `instrument-form-modal` / i18n — poza zakresem FIX-B.
- Backfill istniejących wierszy skasowanych przez błędną wersję — poza zakresem.
- Odczyt `actualDurationSec` w UI Downtime — konsumenci `ext_jsonb` nie byli w recenzji.

---

## T5 — PF-R20-04: precyzja zakresu kalibracji vs `numeric(12,4)`

### Przyczyna źródłowa

`refineInstrumentMeasurementRange` porównywał granice przez `toMicro()` (6 dp), ale kolumny `calibration_instruments.range_min` / `range_max` to **`numeric(12,4)`** (migracja 201). Wartość `0.000049` przechodziła walidację jako rosnący zakres względem `0.00004`, lecz Postgres zapisywał obie jako `0.0000` — ta sama klasa co Fala 7 przy przyjęciu ZZ.

### Zmiany

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/app/.../calibration/_types/calibration-schemas.ts` | 13–28 | `CALIBRATION_RANGE_MAX_DP = 4`; `numericStringSchema` odrzuca >4 miejsca dziesiętne jawnym komunikatem przed `toMicro()` / SQL. |
| `calibration-schemas.test.ts` | 43–55 | `0.00004` / `0.000049` → `safeParse` fail na obu polach; bez poprawki `success: true`. |
| `calibration-actions.test.ts` | 261–276 | `createInstrument` z nadprecyzyjnym zakresem → `validation_error`, brak `INSERT`; bez poprawki mock insert by się wykonał. |

### Świadomie NIE ruszone (T5)

- `instrument-form-modal.tsx` — recenzja wymagała granicy serwera; formularz dostanie `validation_error`.
- Migracja CHECK `range_min <= range_max` — bez zmian (jak w rep-T5).

---

## Testy (nie uruchamiane w torze — zgodnie z zakazem)

| Plik | Co by wywróciło bez poprawki |
|---|---|
| `pause-resume-wo.test.ts` — keeps sub-minute… | `downtimeEventId === null`, wywołanie `DELETE` |
| `pause-resume-wo.test.ts` — rejects zero… | `resumeWo({ actualDurationMin: 0 })` → `ok: true` |
| `wo-actions.test.tsx` — negative / fractional | POST z `actualDurationMin: null` po `-1` lub `1.5` |
| `wo-lifecycle.integration.test.ts` — full happy path | `closedDt.rowCount === 0` po resume |
| `calibration-schemas.test.ts` — over-precise bounds | `success: true` dla 5–6 dp |
| `calibration-actions.test.ts` — over-precise… | `ok: true` + SQL insert |

Importy zweryfikowane (`grep export`): `resumeWo`, `createInstrumentSchema`, `toMicro`.

---

## Znaleziska poza zakresem (nie naprawiane)

| ID | Opis |
|---|---|
| PF-R13-01 | Dashboard: ogólny `reason: 'error'` przy SQL failure |
| MV downtime sum | Sub-minutowe zdarzenia nadal `0` w `sum(duration_min)` — wymaga osobnej decyzji produktowej o odczycie `actualDurationSec` |
