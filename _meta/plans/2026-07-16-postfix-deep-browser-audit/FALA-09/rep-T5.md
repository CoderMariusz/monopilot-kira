# FALA-09 / Tor T5 — WO chains + scheduler (PF-R11-01, PF-R12-01)

## Przyczyna źródłowa (wspólna)

`wo_dependencies` modeluje relację **parent (FG, konsument) → child (WIP, producent)**. Oba znaleziska to ten sam brak respektowania tej relacji przy planowaniu czasu:

| Ścieżka | Objaw | Brakująca logika |
|---|---|---|
| Ręczna (PF-R11-01) | Edycja `scheduled_start_time` rodzica FG nie przesuwa dziecka WIP | Propagacja delty daty na dzieci w `updateWorkOrder` |
| Automatyczna (PF-R12-01) | Scheduler planuje WIP i FG w tym samym oknie | Solver nie ładuje `wo_dependencies` i nie wymusza `parent.start ≥ child.end` |

## Zmiany (plik:linia) i dlaczego to root cause

### 1. Propagacja daty przy edycji WO (PF-R11-01)

| Plik | Zmiana | Dlaczego root cause |
|---|---|---|
| `apps/web/lib/planning/wo-chain-date-sync.ts` (nowy) | `shiftScheduledTimeByParentDelta` + `propagateParentWoChainScheduledDates` | Izoluje kontrakt „zachowaj offset parent−child” (delta, nie kopia daty) i blokuje z `chain_child_not_editable` gdy dziecko nie jest DRAFT/RELEASED |
| `apps/web/lib/planning/wo-chain-qty-sync.ts:50-58,220-252` | `ChainEdgeSnapshot` rozszerzony o `childScheduledStartTime/End`; SELECT ładuje je pod `FOR UPDATE` | Ten sam lock co przy qty-sync — snapshot daty dziecka **przed** mutacją rodzica |
| `apps/web/app/.../update-work-order.ts:277-284,393-400` | Łańcuch ładowany także przy `scheduledStartTime !== undefined`; po UPDATE rodzica wywołanie `propagateParentWoChainScheduledDates` | Wcześniej (`:277-281`) edges były ładowane **tylko** przy `plannedQuantity` — edycja samej daty omijała propagację |

### 2. Kolejność w schedulerze (PF-R12-01)

| Plik | Zmiana | Dlaczego root cause |
|---|---|---|
| `apps/web/lib/planning/wo-dependency-scheduling.ts` (nowy) | `planDependencyConstrainedScheduling` (topo: child przed parent) + `dependencyEarliestStartMs` | Wspólna, czysta logika grafu z zabezpieczeniem przed cyklem (baza przepuszcza A→B→A) |
| `apps/web/app/.../scheduler/_actions/scheduler-actions.ts:444-463,1070-1077` | `loadWoDependenciesForScheduling` + `solverConfig.dependencyEdges` | Solver wcześniej (`runScheduler ~1049`) nie ładował `wo_dependencies` w ogóle |
| `apps/web/app/.../scheduler/_actions/sequence-solver.ts:454-476,523-620` | Placement order z topo; `placeSequencedWorkOrder` dostaje `dependencyEarliestMs`; `plannedEndByWoId` | Bez kolejności child→parent i constraintu na końcu dziecka, FG na innej linii startował równolegle z WIP |
| `apps/web/app/.../scheduler/_actions/scheduler-types.ts:157-161,176,203` | `WoSchedulingDependencyEdge`, `dependencyEdges` w config, reason `dependency_cycle` | Kontrakt typów dla solvera i raportowania cykli |

**Wspólne miejsce:** `wo-dependency-scheduling.ts` jest kanonicznym odczytem semantyki `wo_dependencies` (parent=FG, child=WIP); scheduler go używa, a date-sync operuje na tym samym kierunku krawędzi w `loadAndLockParentChainEdges`.

## Testy dodane — co by je wywróciło bez poprawki

| Test | Plik | Bez poprawki padłoby na |
|---|---|---|
| `shiftScheduledTimeByParentDelta` — delta + offset | `wo-chain-date-sync.test.ts` | Child zostaje na `2026-07-25` gdy parent idzie na `2026-07-26` |
| `propagateParentWoChainScheduledDates` — UPDATE child | `wo-chain-date-sync.test.ts` | Brak SQL `scheduled_start_time = $2` na child |
| `PF-R11-01: propagates chain child scheduled dates…` | `update-work-order.test.ts` | Brak child UPDATE po edycji samej daty rodzica |
| `PF-R11-01: blocks scheduled-date edit when chain child is not editable` | `update-work-order.test.ts` | Parent UPDATE commitowałby się mimo IN_PROGRESS child |
| `planDependencyConstrainedScheduling` — child przed parent | `wo-dependency-scheduling.test.ts` | Kolejność `[FG, WIP]` zamiast `[WIP, FG]` |
| `PF-R12-01: parent FG starts after upstream WIP child ends` | `sequence-solver.test.ts` | `fg.planned_start_at < wip.planned_end_at` (overlap −60 min jak w audycie) |
| `omits WOs on dependency cycles` | `sequence-solver.test.ts` | Solver wszedłby w nieskończoną pętlę / równoległy placement |

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `planned_start_date` / `planned_end_date` na `work_orders` | PF-R11-01 dotyczy pola edytowanego w UI (`scheduled_start_time`); `update-work-order.ts` nigdy nie pisał `planned_*` |
| `rescheduleWorkOrder` (schedule board) | Osobna ścieżka drag-board; poza zakresem PF-R11-01 (modal planning WO) |
| Migracja `532-*.sql` | Brak zmiany schematu — fix wyłącznie warstwy aplikacji |
| PF-R11-02 (brak child `update` w `wo_status_history`) | P2, osobny tor |
| PF-R12-02 (podwójna occupancy capacity) | P1, ale inny root cause (assignments + bieżący slot) |
| Changeover-optimal ordering przy zależnościach | Przy `dependencyEdges.length > 0` solver używa topo zamiast allergen-greedy — świadomy trade-off: poprawność łańcucha > koszt changeoveru |

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)

| ID | Opis |
|---|---|
| PF-R11-02 | Automatyczna propagacja qty nie zapisuje `wo_status_history` action=`update` na dziecku |
| PF-R12-02 | Capacity liczy bieżący slot WO + draft assignment schedulera podwójnie |
| `rescheduleWorkOrder` | Nie propaguje daty na dzieci łańcucha (analogiczny gap jak PF-R11-01, inna akcja) |

## Migracja

Nie wymagana.
