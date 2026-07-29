# FALA-09 / Tor T5 — naprawa po cross-review (rep-FIX-T5)

## Werdykt: wszystkie P1 naprawione; P2 naprawione

---

### [P1] Propagacja tworzy dziecku zerowe okno harmonogramu

**Status: NAPRAWIONE**

**Plik:** `apps/web/lib/planning/wo-chain-date-sync.ts:47-56`

**Przyczyna:** `shiftScheduledTimeByParentDelta` zwracało `toIso(parentNewMs)` gdy `childOldMs === null`, więc `scheduled_end_time = NULL` (typowy stan po materializerze) było nadpisywane startem rodzica.

**Poprawka:** Brakujący timestamp dziecka pozostaje `null`. Gdy rodzic nie miał poprzedniego startu, dziecko z istniejącym czasem pozostaje bez zmian (`toIso(childOldMs)`), nie jest wyrównywane do rodzica.

**Test:** `wo-chain-date-sync.test.ts` — `preserves null child timestamp…`; `propagateParentWoChainScheduledDates` zapisuje `[nextStart, null]` gdy `childScheduledEndTime: null`. Bez poprawki asercja na `null` w `$3` padłaby.

---

### [P1] Scheduler gubi zależność, gdy dziecko nie jest kandydatem RELEASED

**Status: NAPRAWIONE**

**Pliki:**
- `scheduler-actions.ts:451-456` — SQL ładuje krawędzie gdy `parent_wo_id ∈ candidates` (usunięty filtr `child_wo_id = any($1)`)
- `scheduler-actions.ts:464-481` — `buildDependencyAnchoredEnds` + `workOrderPlannedEndMs`
- `scheduler-types.ts:181-183` — `dependencyAnchoredEnds` w config solvera
- `sequence-solver.ts:712-733,619-621` — seed `plannedEndByWoId` z kotwic; `wo-dependency-scheduling.ts:36-37` — krawędź liczy się gdy parent ∈ candidates (child może być poza zbiorem)

**Przyczyna:** Oba końce krawędzi musiały być w zbiorze RELEASED; WIP `IN_PROGRESS` znikał z grafu, FG dostawał start bez constraintu.

**Test:** `sequence-solver.test.ts` — `anchors parent FG to IN_PROGRESS upstream child outside candidates` z `dependencyAnchoredEnds`. Bez poprawki FG startowałby o `NOW_MS`, nie po `wipEndMs`.

---

### [P1] Niewykonalne dziecko nie blokuje rodzica

**Status: NAPRAWIONE**

**Pliki:**
- `wo-dependency-scheduling.ts:84-98` — `dependencyEarliestStartMs` zwraca `null` gdy brak `plannedEnd` dziecka
- `sequence-solver.ts:619-627,660-665` — `dependency_unresolved` → defer/omit rodzica
- `scheduler-types.ts:203-207` — nowy reason `dependency_unresolved`

**Przyczyna:** Brak końca dziecka dawał `earliest = 0`; rodzic był planowany mimo że WIP trafił do `deferred`/`omitted`.

**Test:** `sequence-solver.test.ts` — `omits parent FG when upstream child cannot be placed` (WIP `no_feasible_capacity`, FG `dependency_unresolved`). Bez poprawki FG miałby assignment w `result.assignments`.

---

### [P1] Zmiana daty obejmuje tylko pierwszy poziom łańcucha

**Status: NAPRAWIONE**

**Plik:** `wo-chain-qty-sync.ts:211-305`

**Przyczyna:** `loadAndLockParentChainEdges` pobierał tylko `parent_wo_id = $1`.

**Poprawka:** Rekurencyjny walk z `visited`/`loading` + `chain_dependency_cycle` przy cyklu. `preflightParentChainEditability` i propagacja dat widzą cały podgraf.

**Test:** `wo-chain-qty-sync.test.ts` — `walks transitive descendants beyond the first chain level`; `rejects dependency cycles while walking descendants`. Bez poprawki drugi poziom (grandchild) nie byłby w `edges`.

---

### [P1] Date-only edit uruchamia niezwiązany guard konwersji opakowań

**Status: NAPRAWIONE**

**Pliki:**
- `wo-chain-qty-sync.ts:308-314` — `preflightParentChainEditability` (tylko status)
- `update-work-order.ts:281-288` — qty → pełny `preflightParentChainEdges`; date-only → tylko editability

**Przyczyna:** `scheduledStartTime !== undefined` wołało pełny preflight z `validateChildPackHierarchy`.

**Test:** `update-work-order.test.ts` — `date-only edit skips pack-hierarchy preflight on chain children` (zero zapytań `bom_headers`). Bez poprawki mock BOM byłby wołany mimo `linkProductId` na dziecku.

---

### [P2] Jedna zależność przełącza wszystkie WO na kolejność UUID

**Status: NAPRAWIONE**

**Pliki:**
- `wo-dependency-scheduling.ts:31-34,60-74` — opcjonalny `compareAvailableIds` w topo-queue
- `sequence-solver.ts:556-561,581-586` — przekazanie `compareByDueDateThenId` z mapy WO

**Przyczyna:** `localeCompare(id)` ignorował `due_date` wśród węzłów o `inDegree === 0`.

**Test:** `wo-dependency-scheduling.test.ts` — `prefers earlier due dates among simultaneously available nodes`. Bez poprawki `EARLY` (due=1) byłby po `LATE` (due=2) przy sortowaniu UUID.

---

## Testy zaktualizowane / dodane (sucho zweryfikowane eksporty)

| Plik | Co weryfikuje |
|---|---|
| `wo-chain-date-sync.test.ts` | null end preservation; propagate z `childScheduledEndTime: null` |
| `wo-chain-qty-sync.test.ts` | rekurencja łańcucha; cykl → `chain_dependency_cycle` |
| `wo-dependency-scheduling.test.ts` | external child w `childrenByParent`; `null` earliest; due-date w topo |
| `sequence-solver.test.ts` | anchored IN_PROGRESS child; parent `dependency_unresolved` |
| `update-work-order.test.ts` | date-only bez BOM preflight |

## Świadomie pominięte

Brak — wszystkie znaleziska P1 i P2 z review zostały zaadresowane.

## Poza zakresem (bez zmian)

- PF-R11-02 (`wo_status_history` na dziecku przy qty)
- PF-R12-02 (podwójna occupancy capacity)
- `rescheduleWorkOrder` (brak propagacji daty)

## Migracja

Nie wymagana.
