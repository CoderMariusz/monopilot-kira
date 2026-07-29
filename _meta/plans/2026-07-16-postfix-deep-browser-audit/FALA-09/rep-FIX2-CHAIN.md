# FALA-09 / RUNDA 2 — detektor cyklu łańcucha WO (rep-FIX2-CHAIN)

## Werdykt: naprawione

---

## Objaw (6 czerwonych testów)

Wspólny mianownik: `loadAndLockParentChainEdges` rzucał `chain_dependency_cycle` na **legalnym**
łańcuchu FG→WIP (jeden poziom), zanim doszło do guardów edytowalności. Skutki:

| Plik | Test | Błąd |
|---|---|---|
| `wo-chain-qty-sync.test.ts` | captures material identity… | `chain_dependency_cycle` |
| `update-work-order.test.ts` | B1a: propagates chain child quantities… | `expected false to be true` |
| `update-work-order.test.ts` | B1a: returns chain_child_not_editable… | zły kod błędu |
| `update-work-order.test.ts` | PF-R11-01: propagates chain child scheduled dates… | `expected false to be true` |
| (+ 2 kolejne PF-R11-01) | | |

---

## Przyczyna

1. **Fałszywy cykl na self-loop mocku:** Po załadowaniu bezpośredniego dziecka walker rekurencyjnie
   wołał `loadDirectParentChainEdges(childWoId)`. Mocki testowe (i ewentualnie „głuche" zapytania bez
   rozróżnienia `parent_wo_id`) zwracały tę samą krawędź `child→child`. Węzeł był już na stosie DFS
   (`loading`) → fałszywy `chain_dependency_cycle`. Baza **nie dopuszcza** self-loopa
   (`wo_dependencies_no_self_loop_check`), więc taka krawędź nie powinna być śledzona.

2. **Zła kolejność guardów:** `loadAndLockParentChainEdges` rzucał cykl **przed**
   `preflightParentChainEditability` / `preflightParentChainEdges`. Przy `IN_PROGRESS` dziecku
   zwracany był `chain_dependency_cycle` zamiast `chain_child_not_editable`.

---

## Poprawka

### `apps/web/lib/planning/wo-chain-qty-sync.ts`

- `walkDescendantChainEdges`: pomija krawędzie `edge.childWoId === childWoId` (self-loop niemożliwy w DB).
- Cykl zgłaszany przez callback `onCycle()` (flaga `hasCycle`), nie throw w trakcie walka.
- `loadAndLockParentChainEdges` zwraca `{ edges, hasCycle }` (`ParentChainLoadResult`).
- Nowy `throwIfChainDependencyCycle(result)` — do wywołania **po** guardach edytowalności.

### `apps/web/app/.../update-work-order.ts`

Kolejność:

1. `loadAndLockParentChainEdges` → `{ edges, hasCycle }`
2. `preflightParentChainEdges` (qty) lub `preflightParentChainEditability` (date-only)
3. `throwIfChainDependencyCycle(chainLoad)`

### Testy

- `wo-chain-qty-sync.test.ts`: dostosowany do nowego API; cykl A→B→A nadal `hasCycle: true`.
- `update-work-order.test.ts`: mock `wo_dependencies` zwraca krawędź tylko gdy `parent_wo_id = WO_ID`
  (leaf WO nie ma dzieci — zgodnie z produkcją).

---

## Zachowanie po poprawce

| Scenariusz | Wynik |
|---|---|
| Prosty łańcuch FG→WIP (1 poziom) | Przechodzi; brak fałszywego cyklu |
| Łańcuch wielopoziomowy FG→WIP→WIP | Transitive walk bez zmian |
| Rzeczywisty cykl A→B→A | `hasCycle: true` → `chain_dependency_cycle` |
| Dziecko `IN_PROGRESS` przy edycji rodzica | `chain_child_not_editable` (przed cyklem) |

---

## Migracja

Nie wymagana.

## Weryfikacja (orchestrator)

```bash
pnpm --filter web exec vitest run apps/web/lib/planning/wo-chain-qty-sync.test.ts
pnpm --filter web exec vitest run "apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/update-work-order.test.ts"
```
