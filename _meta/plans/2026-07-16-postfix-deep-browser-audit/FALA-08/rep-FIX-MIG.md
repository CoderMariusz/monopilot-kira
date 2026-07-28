# FALA-08 / FIX-MIG — postfix po cross-review T3 (reprint + daty przydatności)

Data: 2026-07-29  
Tor: T3 (R08-06 reprint, R08-07 civil days_left)  
Autor: lane FIX po recenzji Codex

## Zakres naprawy

| ID | Sev | Znalezisko | Status |
|----|-----|------------|--------|
| T3-4 | P1 | Migracja 527: `NOT NULL DEFAULT 'pdf'` fałszywie oznacza ZPL z okna wdrożenia | ✅ |
| T3-5 | P2 | Backfill osieroconych zakończonych ZPL → pdf | ✅ |
| T3-2 | P1 | Test dat importuje nieistniejący `../civil-days-left` | ✅ |
| T3-3 | P1 | Asercje reprintu nie przechodzą typechecku | ✅ |

---

## T3-4 + T3-5 — Migracja `527-print-jobs-printer-type.sql`

### Problem
Kolumna `printer_type text NOT NULL DEFAULT 'pdf'` + heurystyczny backfill osieroconych wierszy:
- Wiersze zapisane przez **stary kod** między migracją a deployem dostawały `pdf` z DEFAULT.
- Backfill krok 3: `sent` bez `result_url` → `pdf` — nadpisywał historyczne ZPL.

### Naprawa (wzorzec migracji 526)
1. **Kolumna NULLable**, `DROP DEFAULT` — brak zgadywania.
2. **Backfill tylko z żywego FK** `printers.printer_type` (znana prawda).
3. **Usunięty** krok 3 backfillu osieroconych — historyczne wiersze bez sygnału zostają `NULL`.
4. **Trigger `print_jobs_sync_printer_type`** (BEFORE INSERT OR UPDATE):
   - jawny `printer_type` → bez zmian;
   - `printer_id` → `printers.printer_type`;
   - `result_url IS NOT NULL` → `pdf`;
   - `status = 'queued'` → `zpl`;
   - inaczej → `NULL` (nie `pdf`).
5. **Post-check** (self-built + unwind): jawny PDF przetrwa orphan; insert bez `printer_type` (stary app) z drukarką ZPL + `queued` → `zpl`.

### App-layer
- `PrintJobRow.printer_type`: `PrinterType | null`.
- `resolvePrintJobPrinterType()` w `reprintFromHistory` — fallback tylko dla `result_url` / `queued`; legacy `sent` bez sygnału → `print_job_printer_type_unknown` (nie domyślne pdf).

### Pliki
- `packages/db/migrations/527-print-jobs-printer-type.sql`
- `packages/db/src/migrations/527-print-jobs-printer-type.sql` (kopia)
- `apps/web/.../printers/_actions/printers.ts`

---

## T3-2 — Test dat przydatności

### Problem
`civil-expiry-days.test.ts` importował `../civil-days-left` — plik **nie istnieje**.

### Naprawa
Test przepisany przeciw **istniejącym eksportom** (zweryfikowane `grep -n export`):

| Moduł | Eksporty użyte |
|-------|----------------|
| `apps/web/lib/planning/civil-date.ts` | `utcIsoToCivilDate` |
| `apps/web/lib/shared/wall-clock-time.ts` | `wallClockToInstant`, `instantToDatetimeLocalInput` |
| `apps/web/.../warehouse/_actions/expiry-actions.ts` | `getExpiryDashboard` |

- Sekcja `getExpiryDashboard civil days_left`: asercja kształtu SQL (`date(expiry at UTC) - date(now() at site TZ)`) + mapowanie `daysLeft`.
- Sekcja parity: helper `civilDaysUntilExpiry` złożony **wyłącznie** z powyższych eksportów (semantyka SQL, bez nowego modułu produkcyjnego).

### Plik
- `apps/web/.../warehouse/expiry/_lib/__tests__/civil-expiry-days.test.ts`

---

## T3-3 — Typecheck reprintu

### Problem
`ActionsModule.reprintFromHistory` zwracał `{ id, status, payload }` — testy odwoływały się do `result_url` (i implikowanego `printer_type`).

### Naprawa
Wspólny typ `ReprintResult` z polami zgodnymi z `PrintJobRow`:
`id`, `status`, `printer_type`, `result_url`, `payload`.

### Plik
- `apps/web/.../printers/_actions/printers.test.ts`

---

## Weryfikacja (nie uruchamiana w tej lane — zakaz orchestratora)

```bash
pnpm --filter web exec vitest run \
  "apps/web/app/[locale]/(app)/(admin)/settings/infra/printers/_actions/printers.test.ts"

pnpm --filter web exec vitest run \
  "apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/_lib/__tests__/civil-expiry-days.test.ts" \
  --config vitest.ui.config.ts

pnpm db:up && pnpm db:test   # migracja 527 + trigger post-check
```

---

## Ryzyko resztkowe

- **Legacy reprint** `sent` + brak `result_url` + `printer_type IS NULL` — celowo rzuca `print_job_printer_type_unknown` zamiast zgadywać pdf (zgodnie z T3-5).
- **Scanner print-label** — poza scope; trigger pokrywa insert bez `printer_type` (queued → zpl, sent+url → pdf).
- **Warehouse dashboard** (`page.tsx` `daysFromNow`) — nadal instant-diff; poza T3.
