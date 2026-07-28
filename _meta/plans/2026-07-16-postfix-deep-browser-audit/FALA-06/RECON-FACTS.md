# FALA 6 — fakty ustalone przez orchestratora przed delegacją

## PF-R02-01 — rozjazd kolumn POTWIERDZONY NA PRODZIE
```
production_lines.default_location_id         uuid NULL   -- czyta ekran (lines/page.tsx:223)
production_lines.default_output_location_id  uuid NULL   -- pisze akcja (line.ts:92)

default_location_id        ustawione w 0 z 13 wierszy
default_output_location_id ustawione w 1 z 13 wierszy
```
**Obie kolumny istnieją.** Jest **żywy dowód rozjazdu**: jedna linia ma skonfigurowane wyjście,
którego ekran nigdy nie pokaże. Administrator dostaje baner „Production line updated", a pole
wraca do `— none —`.

⚠️ Naprawa musi **zdecydować, która kolumna jest kanoniczna**, i przenieść istniejącą wartość.
Audyt sugeruje, że `default_output_location_id` czytają „legacy readers/scanner flows" —
**to trzeba zweryfikować grepem przed wyborem**, bo zmiana strony zapisu zerwałaby tamten odczyt.

## Baseline regresji (main @ 124e6b71, czyste drzewo)
core **39** plików failed · UI **25** plików failed

## Fixture'y — UWAGA
Po E2E Fali 4 organizacja **nie ma już żadnego draftu routingu** (skasowany przy dowodzeniu R06-06).
Tor, który go potrzebuje, musi utworzyć własny.

## PF-R02-01 — KTÓRA KOLUMNA JEST KANONICZNA (rozstrzygnięte grepem, odwrotnie niż zgadywał audyt)

**`default_location_id` = KANONICZNA.** Czytają ją realne ścieżki produkcyjne:
| Konsument | Plik |
|---|---|
| ekran linii | `settings/infra/lines/page.tsx` |
| **skaner magazynowy** | `app/api/warehouse/scanner/pick/route.ts` |
| **rejestracja produkcji** | `lib/production/output/register-output.ts` |
| **rejestracja rozbioru** | `lib/production/output/register-disassembly-output.ts` |
| akcje sites | `settings/sites/_actions/sites.ts` |

**`default_output_location_id`** dotyka praktycznie **wyłącznie akcja zapisu**
(`actions/infra/line.ts`) + `sites.ts` + migracja 337. **Żaden odczyt produkcyjny.**

→ **Naprawa: zapis ma celować w `default_location_id`.** Audyt sugerował odwrotnie
(„legacy readers/scanner flows" rzekomo czytają `default_output_location_id`) — **to nieprawda**,
sprawdzone grepem po źródłach.
→ Trzeba przenieść **1 istniejącą wartość** z `default_output_location_id` do `default_location_id`
(migracja danych) albo świadomie ją porzucić — **decyzja do podjęcia w torze, z uzasadnieniem**.
