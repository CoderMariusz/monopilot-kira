# FALA-10 / TOR T5 — raport (kalibracja + sumowanie wielooddziałowe)

**Zakres:** PF-R20-04 (odwrócony zakres kalibracji), PF-R20-07 (unitless inventory total na Multi-Site)  
**Data:** 2026-07-29

---

## Zmiany i przyczyna źródłowa

### PF-R20-04 — odwrócony zakres pomiaru (`rangeMin > rangeMax`)

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_types/calibration-schemas.ts` | 3, 26–49, 52–55 | **Przyczyna źródłowa:** schemat Zod walidował `rangeMin` i `rangeMax` osobno, bez relacji między polami — serwer (`createInstrument` / `updateInstrument` w `calibration-actions.ts`) przyjmował dowolny układ granic. Dodano `refineInstrumentMeasurementRange` na granicy zaufania (`createInstrumentSchema` / `updateInstrumentSchema`) z porównaniem przez `toMicro()` z `lib/shared/decimal.ts` (nie `Number()`). |
| `apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_actions/calibration-actions.ts` | *(bez zmian)* | Akcje już wołają `.parse()` na schemacie — walidacja uruchamia się automatycznie przed `INSERT`/`UPDATE`. |

**Decyzja: równość granic (`rangeMin === rangeMax`)** — **dozwolona**. To poprawny zakres punktowy (zerowy rozpiętości) dla przyrządów kalibrowanych w jednym punkcie odniesienia. Odrzucany jest wyłącznie przypadek `rangeMin > rangeMax`. Gdy podana jest tylko jedna granica, cross-field check jest pomijany (nullable kolumny `numeric(12,4)` w `calibration_instruments`).

**Migracja DB (537):** świadomie **nie dodana**. CHECK `range_min <= range_max` wymagałby naprawy ewentualnych odwróconych wierszy z audytu Run 20 zanim constraint przejdzie na produkcji; granica zaufania serwera (Zod przed zapisem) wystarcza na P1 bez ryzyka blokady deployu.

### PF-R20-07 — unitless suma zapasów Multi-Site

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx` | 5–8, 27–30, 37–40, 93–120, 134–135, 165–167 | **Przyczyna źródłowa:** `sum(lp.quantity)` po wszystkich LP bez `GROUP BY uom` dawało liczbę bez wymiaru (kg + pcs + l). Zapytanie zastąpione agregacją `GROUP BY lp.uom`; KPI renderuje jawne sumy per jednostka. |
| `apps/web/app/[locale]/(app)/(modules)/multi-site/_lib/network-inventory-kpi.ts` | 1–10 | Helper `formatInventoryQtyByUom` — format `qty uom · qty uom` (wzorzec jak `reporting/_components/reporting-overview.client.tsx:356–357` i `qty_by_uom` w `report-read-actions.ts`). |

**Decyzja konwersji vs grupowanie:** wybrano **grupowanie po `license_plates.uom`** (opcja A z zadania), nie normalizację do bazy wspólnej. Sieciowy KPI LP obejmuje wiele produktów z różnymi `UomSnapshot`; `toBaseQtyFromDecimal` wymaga kontekstu pozycji (`item` + `outputUom`) per LP — ślepa konwersja na poziomie samego `uom` tekstowego LP byłaby błędna dla aliasów (`pcs`/`each`/`box`) bez joinu do `items`. Warehouse Reporting już dokumentuje ten sam honest gap (`shared.ts:148–156`).

---

## Testy dodane (nie uruchamiane w torze)

| Plik testu | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `calibration/_types/calibration-schemas.test.ts` | `10.0000 > 0.0000` → `safeParse` fail na `rangeMax`; akceptacja `-0.5000..100.0100`, równości granic, pojedynczej granicy | Stary schemat przepuszczał odwrócony zakres — test failowałby na `success: true` |
| `calibration/_actions/calibration-actions.test.ts` | `createInstrument` / `updateInstrument` z odwróconym zakresem → `validation_error`, brak wywołania `INSERT`/`UPDATE` SQL | Bez refine akcja insertowała i test widziałby `ok: true` + mock insert |
| `multi-site/_lib/network-inventory-kpi.test.ts` | `formatInventoryQtyByUom` nie zwraca gołej sumy `300` dla kg+pcs | Stary formatter (goła suma) dałby `300` bez etykiet UoM |
| `multi-site/page.test.tsx` | KPI pokazuje `120.500 kg · 45 pcs`, nie `165.5` | Stary mock `inventory_total_qty: '100'` i render bez UoM — test szukałby unitless liczby |

Importy zweryfikowane: `decimal.ts` eksportuje `toMicro` (L34); `network-inventory-kpi.ts` eksportuje `formatInventoryQtyByUom` (L7).

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `instrument-form-modal.tsx` (walidacja klienta) | Zadanie wymaga granicy zaufania **serwera**; formularz i tak dostanie `validation_error` z akcji. Client-side refine = duplikat, nie root cause. |
| Migracja `537-calibration-range-order.sql` | Ryzyko fail na istniejących odwróconych wierszach; serwer blokuje nowe. |
| Konwersja do `uom_base` na Multi-Site KPI | Wymaga joinu LP→items i per-row `UomSnapshot`; poza minimalnym fixem P1; grupowanie jest zgodne z kontraktem Warehouse Reporting. |
| i18n (`en/pl/ro/uk`) dla KPI inventory | Etykieta „Aggregated inventory” była już hardcoded po angielsku (jak pozostałe KPI na stronie); nie rozszerzano zakresu. |
| `packages/db/schema/maintenance.ts` | Brak zmiany schematu Drizzle — constraint tylko w migracji, której nie dodano. |

---

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)

| ID | Opis |
|---|---|
| PF-R20-02 (P0) | LOTO apply jednym signerem — `mwo-actions.ts`, tor bezpieczeństwa LOTO |
| PF-R20-05 (P1) | Calibration reviewer UUID dead-end — naprawione w FALA-01 (T5), poza tym torem |
| PF-R20-01/03/06 (P2) | Asset register bez akcji, PM stub, D365 inbound UI — inne tory Fali 10 |
| B-1/B-2/B-3 z RECON-FACTS | UTC `registered_year`, cykle `wo_dependencies`, dual status machines — nie dotyczy T5 |

---

## Pliki zmienione (diff stat)

```
apps/web/app/.../calibration/_types/calibration-schemas.ts
apps/web/app/.../calibration/_types/calibration-schemas.test.ts   (nowy)
apps/web/app/.../calibration/_actions/calibration-actions.test.ts
apps/web/app/.../multi-site/page.tsx
apps/web/app/.../multi-site/page.test.tsx
apps/web/app/.../multi-site/_lib/network-inventory-kpi.ts       (nowy)
apps/web/app/.../multi-site/_lib/network-inventory-kpi.test.ts    (nowy)
_meta/plans/.../FALA-10/rep-T5.md                                (ten plik)
```
