# FALA-08 / TOR T3 — R08-06 + R08-07

## R08-06 — Reprint gubi tryb wyjścia Direct PDF

### Przyczyna
`reprintFromHistory` wnioskował `printer_type` z `LEFT JOIN printers` i przy braku wiersza (usunięta drukarka / `printer_id` null po `ON DELETE SET NULL`) domyślał `'zpl'` → status `queued`, brak `result_url`, brak wyjścia.

### Naprawa
- Migracja **527-print-jobs-printer-type.sql**: kolumna `print_jobs.printer_type` (`zpl`|`pdf`, NOT NULL, default `pdf`).
- Backfill: z `printers.printer_type` gdy FK żyje; osierocone wiersze (`printer_id` null): `result_url` present → `pdf`, `status = queued` → `zpl`, inaczej `pdf`.
- `insertPrintJob` / `printLabel` / `reprintFromHistory` zapisują i czytają `pj.printer_type` — reprint nie polega na joinie `printers` dla trybu wyjścia.

### Post-check migracji
Self-built row w transakcji testowej (bez `SAVEPOINT` — zagnieżdżony `BEGIN…EXCEPTION…END`):
1. `INSERT` drukarki `pdf` + job `sent` z `printer_type = pdf`.
2. Odczyt `printer_type` z joba.
3. Symulacja osierocenia (`printer_id = null`) — `printer_type` musi zostać `pdf`.
4. Unwind przez `raise exception 'mig527_unwind'`.

Post-check **nie** używa `LIMIT 1` na arbitralnym wierszu produkcyjnym — tworzy własny obiekt i wycofuje.

### Testy (pisane, nie uruchamiane w tej lane)
- `printers.test.ts`: reprint PDF (`sent` + data URL), reprint ZPL (`queued`), persystencja `printer_type` na `insert`.

---

## R08-07 — Off-by-one w „Days left"

### Przyczyna
`daysFromNow` w `expiry/page.tsx` liczył `Math.floor((expiryInstant - Date.now()) / 86400000)` — różnica chwil, nie dni cywilnych.

### Wybrana strefa: **site (`sites.timezone`), per LP**
- Expiry w DB to gołe daty cywilne (UTC północ w konwencji `lib/planning/civil-date.ts`).
- LP ma `site_id`; magazyn operuje w strefie lokacji fizycznej (`sites.timezone`, mig 215).
- Fallback łańcuch: `coalesce(st.timezone, org.timezone, 'UTC')` — LP bez site dziedziczy strefę org, nie lokalną strefę przeglądarki.
- **Nie** org-only — multi-site org może mieć LPs w różnych strefach; site jest najbliższym właścicielem biznesowemu.

### Naprawa
- `getExpiryDashboard` (SQL): tier red/amber i `days_left` liczone na granicach dnia cywilnego:
  `date(expiry at time zone 'UTC')` vs `date(now() at time zone coalesce(st.timezone, org.timezone, 'UTC'))`.
- `expiry/page.tsx`: używa `r.daysLeft` z akcji (bez lokalnego `daysFromNow`).
- `expiry/_lib/civil-expiry-days.ts` + testy: helper TS (`utcIsoToCivilDate` + `instantToDatetimeLocalInput` z `wall-clock-time.ts`) dokumentuje tę samą semantykę dla testów jednostkowych (DST, granica UTC/lokalna).

### Testy (pisane, nie uruchamiane)
- `civil-expiry-days.test.ts`: civil 2026-07-17 → expiry 2026-07-24 = **7** (00:01/12:00/23:59); expiry 2026-07-16 = **-1**; granica UTC/lokalna (Warsaw); DST spring/fall.

---

## Czego NIE jestem pewien
- **Scanner print-label** (`api/scanner/print-label`) — poza scope T3; po migracji insert bez jawnego `printer_type` dostanie default `pdf` (OK dla Direct PDF), ścieżka ZPL ze skanera wymaga osobnej synchronizacji.
- **Warehouse dashboard** (`warehouse/page.tsx`) ma własny `daysFromNow` — nie ruszany; ten sam off-by-one może tam występować.
- Backfill osieroconych jobów `sent` bez `result_url` → `pdf` to heurystyka; historyczne anomalie mogłyby być źle sklasyfikowane (mało prawdopodobne w produkcji).
- SQL `days_left` i helper TS mogą się rozjechać o ±0 przy skrajnych strefach jeśli Intl i Postgres `AT TIME ZONE` różnią się dla egzotycznych aliasów TZ (dla `Europe/Warsaw` / `UTC` powinny być zgodne).

## Pliki
| Plik | Zmiana |
|------|--------|
| `packages/db/migrations/527-print-jobs-printer-type.sql` | kolumna + backfill + post-check |
| `packages/db/src/migrations/527-print-jobs-printer-type.sql` | kopia |
| `settings/infra/printers/_actions/printers.ts` | persystencja + reprint z `pj.printer_type` |
| `settings/infra/printers/_actions/printers.test.ts` | reprint PDF/ZPL |
| `warehouse/_actions/expiry-actions.ts` | civil-day tier + `days_left` + `site_timezone` |
| `warehouse/_actions/shared.ts` | typ `daysLeft`, `siteTimezone` |
| `warehouse/expiry/_lib/civil-expiry-days.ts` | helper (istniejący) |
| `warehouse/expiry/_lib/__tests__/civil-expiry-days.test.ts` | testy cywilne |
| `warehouse/expiry/page.tsx` | `r.daysLeft` zamiast `daysFromNow` |
