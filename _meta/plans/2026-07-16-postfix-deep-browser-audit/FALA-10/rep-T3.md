# FALA-10 / Tor T3 — Raport (maszyna stanów produkcji: czas)

## PF-R13-02 (P1) — anulowane WO: elapsed rośnie w nieskończoność

### Przyczyna źródłowa
`elapsedMin` liczono jako `now() − started_at` gdy `completed_at` było `NULL`. Anulowane zlecenia mają `cancelled_at` (maszyna stanów w `wo-state-machine.ts:164`), ale **nie** `completed_at` — więc licznik nigdy nie zatrzymywał się na momencie anulowania.

Formuła była zduplikowana w dwóch miejscach:
- `get-work-order-detail.ts:763-767` (ekran szczegółu WO)
- `get-wo-runtime-state.ts:158-162` (runtime state API)

### Zmiany

| Plik | Linie | Co i dlaczego |
|---|---|---|
| `apps/web/lib/production/wo-elapsed.ts` | 1-52 | **Nowy moduł kanoniczny** `computeWoElapsedMin` / `resolveWoElapsedEndMs`. Koniec okna: `completed_at → cancelled_at → closed_at`; zegar na żywo tylko dla `in_progress` / `paused`. |
| `apps/web/app/.../production/_actions/get-work-order-detail.ts` | 32, 331-332, 370-371, 765-772 | Import helpera; SELECT dołącza `e.cancelled_at`, `e.closed_at`; elapsed przez `computeWoElapsedMin`. |
| `apps/web/lib/production/get-wo-runtime-state.ts` | 27, 72-78, 160-167 | Ten sam helper; SELECT rozszerzony o `cancelled_at` / `closed_at`. |

Brak migracji — `cancelled_at` / `closed_at` już istnieją na `wo_executions` (RECON-FACTS §1, linie 195-196).

### Testy dodane

| Plik | Test | Co by go wywróciło bez poprawki |
|---|---|---|
| `apps/web/lib/production/__tests__/wo-elapsed.test.ts` | `freezes elapsed at cancelled_at for cancelled WOs` | Drugie wywołanie z `nowMs + 1h` zwróciłoby 69 zamiast 9. |
| `apps/web/lib/production/__tests__/wo-elapsed.test.ts` | `uses live clock only for in_progress and paused` | `planned` dostałby żywy zegar zamiast `null`. |
| `apps/web/app/.../production/_actions/get-work-order-detail.test.ts` | `freezes elapsedMin at cancelled_at for cancelled WOs` | Dwa kolejne odczyty detail zwróciłyby różne `elapsedMin` (stary kod używa `Date.now()`). |

---

## PF-R13-03 (P2) — wznowienie zapisuje przestój 0 min

### Przyczyna źródłowa
1. **UI** (`shared.tsx:262-265`): niepoprawna wartość (0, −1, ułamek) była cicho zamieniana na `null` → tryb timestamp → `ended_at ≈ started_at` → GENERATED `duration_min = 0`.
2. **Serwer** (`pause-resume-wo.ts:158`): `actualDurationMin >= 0` akceptowało zero.
3. **Schemat** (`downtime-events.ts:47-48`): `duration_min` to GENERATED `::integer` z różnicy epoch — sub-minutowe pauzy obcinają się do zera (nie da się zapisać NULL przy ustawionym `ended_at`).

### Zmiany

| Plik | Linie | Co i dlaczego |
|---|---|---|
| `apps/web/app/.../production/wos/_components/modals/shared.tsx` | 258-274 | `parseActualDurationMin`: puste pole → `null` (timestamp OK); niepuste i ≤0 lub niecałkowite → błąd `invalid_input`, bez POST. |
| `apps/web/lib/production/pause-resume-wo.ts` | 157-163 | Walidacja serwera: `actualDurationMin` musi być **dodatnią** liczbą całkowitą (`> 0`). |
| `apps/web/lib/production/pause-resume-wo.ts` | 191-201 | Po zamknięciu przestoju: jeśli GENERATED `duration_min === 0`, **DELETE** wiersza — sub-minutowa pauza nie zostaje kanonicznym faktem analitycznym. |

Route `resume/route.ts:8` już miał `z.number().int().positive()` — nie wymagał zmiany.

Brak migracji — `ended_at` pozostaje nullable; zero-minutowy fakt eliminujemy przez usunięcie wiersza, nie przez NULL w GENERATED kolumnie.

### Testy dodane / zaktualizowane

| Plik | Test | Co by go wywróciło bez poprawki |
|---|---|---|
| `apps/web/lib/production/__tests__/pause-resume-wo.test.ts` | `rejects zero actualDurationMin` (zastąpił `accepts zero`) | `resumeWo({ actualDurationMin: 0 })` zwróciłoby `ok: true`. |
| `apps/web/lib/production/__tests__/pause-resume-wo.test.ts` | `discards sub-minute downtime rows...` | Brak DELETE — `downtimeEventId` byłby `'dt-1'`, `durationMin` = 0. |
| `apps/web/lib/production/__tests__/pause-resume-wo.test.ts` | `keeps positive-duration downtime rows` | Regresja: dodatni czas nadal zamyka wiersz. |
| `apps/web/app/.../modals/__tests__/wo-actions.test.tsx` | `Resume rejects zero... client-side` | Fetch zostałby wywołany z `actualDurationMin: null` po wpisaniu `0`. |
| `apps/web/app/.../modals/__tests__/wo-actions.test.tsx` | `Resume posts null actualDurationMin when blank` | Regresja: puste pole nadal = tryb timestamp. |

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `downtime_events.duration_min` GENERATED | Nie da się zapisać NULL przy zamkniętym evencie; DELETE sub-minutowych wierszy to właściwa semantyka „brak pomiaru”. |
| Istniejące wiersze `duration_min = 0` w bazie | Backfill poza zakresem; naprawa dotyczy nowych wznowień. |
| `work-orders/[id]/resume/route.ts` | Schema już wymusza `.positive()`; problem był w UI (ciche null) i serwisie (`>= 0`). |
| Migracja `535-*.sql` | Niepotrzebna — brak zmian schematu. |
| i18n pl/ro/uk | Komunikat błędu używa istniejącego `errors.invalid_input`. |
| `finance/wo-cost-actions.ts` elapsed | Inny kontekst (koszt WO, bigint ms); poza torrem produkcji execution. |

---

## Znaleziska poza zakresem (nie naprawiane)

| ID | Opis |
|---|---|
| PF-R13-01 | Dashboard produkcji: `dashboard-data.ts:347` łapie każdy błąd SQL i zwraca ogólny `reason: 'error'` — cały dashboard pada zamiast pokazać per-tile błąd. |
| B-3 (RECON-FACTS backlog) | `work_orders.status` (WERSALIKI) vs `wo_executions.status` (małe litery) — dwie maszyny stanów; myślenie o `completed_at` na `work_orders` vs `wo_executions` wymaga świadomości tego rozdwojenia. |
