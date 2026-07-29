# FALA-10 / FIX-C — cross-review T1 + T2 + regresja B1a

**Data:** 2026-07-29  
**Recenzje:** `out-rev-t1.md`, `out-rev-t2.md`

---

## Werdykt

| Finding | Status |
|---|---|
| [P1] T2 — stary draft zastępuje prawdziwe obłożenie WO | Naprawione |
| [P2] T1 — test gałęzi „bez zmiany ilości" bezwartościowy | Naprawione |
| Czerwony test B1a (`update-work-order.test.ts`) | Naprawione |

Testów nie uruchamiano (zakaz orchestratora).

---

## [P1] T2 — drafty tylko z aktywnego przebiegu schedulera

### Przyczyna

`capacity-loaders.ts` pobierał **wszystkie** `scheduler_assignments` ze statusem `draft`, a `selectedDrafts` wybierał najdłuższy przedział. Stary, niezaaplikowany run (np. R1, 8h na LINE02) mógł zastąpić zapisany slot WO (1h na LINE01), mimo że nowszy run R2 proponował 2h na LINE03 — obłożenie nadal fałszywe, tylko z innego powodu niż double-count.

### Poprawka

| Plik | Linie | Co |
|---|---|---|
| `capacity-loaders.ts` | 5–7 | Komentarz: draft z **ostatniego completed run** zastępuje slot WO |
| j.w. | 158–207 | CTE `active_run` (ten sam wybór co `getLatestSchedulerRun`: `status='completed'`, `order by completed_at desc`) + `sa.run_id = (select run_id from active_run)` |

Gdy brak completed run → subquery zwraca NULL → żaden draft nie trafia do occupancy → liczy się wyłącznie slot WO (bez regresji).

Logika JS `selectedDrafts` / wykluczenia WO zostaje — deduplikuje warianty **w obrębie jednego runu** (PF-R12-01).

### Testy

| Plik | Test | Co by go wywróciło |
|---|---|---|
| `capacity-loaders.test.ts` | rozszerzony `counts mutually exclusive…` | Asercje `with active_run as` i `sa.run_id = (select run_id from active_run)` — bez filtra SQL test pada na strukturze |
| j.w. | `uses the latest completed run draft instead of stale drafts…` | Mock zwraca 8h stale + 2h latest **tylko gdy SQL zawiera `active_run`**; bez filtra occupiedHours = 8, z filtrem = 2 |

---

## [P2] T1 — test historii propagacji qty

### Przyczyna

`PF-R11-02: skips child history when propagated qty is unchanged` sprawdzał wyłącznie brak `INSERT INTO wo_status_history`. Kod, który nigdy nie zapisywał historii, przechodził ten test.

### Poprawka

Zastąpiony testem `writes child history only when propagated qty changes (two children, one pass)`:

- Dwa dzieci w jednym wywołaniu `propagateParentWoChainQuantities`
- Dziecko A: `10.370 → 10.710` → **dokładnie jeden** wpis historii z `planned_quantity_old/new`
- Dziecko B: `5.000 → 5.000` → brak drugiego wpisu, ale oba dostają `UPDATE work_orders`

Zakomentowanie całego bloku historii w `wo-chain-qty-sync.ts` → `historyInserts.toHaveLength(1)` pada.

---

## Regresja B1a — `update-work-order.test.ts`

### Objaw

```
B1a: propagates chain child quantities when planned quantity changes
  ✗ expected false to be true
```

### Kod błędu

`chain_child_not_editable` — zwracany przez `updateWorkOrder` catch na `ChainQtySyncRollbackError` (nie `chain_dependency_cycle`; guard cyklu Fali 9 nietknięty).

### Przyczyna (nie cofnięcie FIX2-CHAIN)

Fala 10 T1 dodała w `propagateParentWoChainQuantities` odczyt `planned_quantity` + `status` dziecka **przed** UPDATE (`wo-chain-qty-sync.ts:409-422`). Gdy brak wiersza → `chain_child_not_editable`.

Mock w `update-work-order.test.ts` nie obsługiwał tego SELECT — zwracał `{ rows: [] }` → propagacja padała po udanym UPDATE rodzica.

Kolejność guardów w `update-work-order.ts` bez zmian (preflight → `throwIfChainDependencyCycle`) — regresja to brakujący mock, nie cofnięcie detektora cyklu.

### Poprawka

| Plik | Linie | Co |
|---|---|---|
| `update-work-order.test.ts` | ~158–167 | Mock `select planned_quantity::text … where id = $1` dla `CHILD_WO_ID` zwraca `{ planned_quantity: '10.370', status: chainChildStatus }` |

---

## Pliki dotknięte

- `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.ts`
- `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.test.ts`
- `apps/web/lib/planning/wo-chain-qty-sync.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/update-work-order.test.ts`
- `_meta/plans/2026-07-16-postfix-deep-browser-audit/FALA-10/rep-FIX-C.md` (ten raport)

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `capacity-loaders.ts` — parametr `runId` z URL | Widok globalny capacity nie przyjmuje runId; wystarczy latest completed (jak board). Osobny tor gdyby UI dostał selector runu. |
| `wo-chain-qty-sync.ts` (implementacja) | Tylko test + mock integracyjny; logika historii z T1 poprawna |
| `getPlanningWorkOrder` site-scope | Poza FIX-C |

## Weryfikacja (orchestrator)

```bash
pnpm --filter web exec vitest run apps/web/app/\[locale\]/\(app\)/\(modules\)/scheduler/capacity/_actions/capacity-loaders.test.ts
pnpm --filter web exec vitest run apps/web/lib/planning/wo-chain-qty-sync.test.ts
pnpm --filter web exec vitest run "apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/update-work-order.test.ts"
```
