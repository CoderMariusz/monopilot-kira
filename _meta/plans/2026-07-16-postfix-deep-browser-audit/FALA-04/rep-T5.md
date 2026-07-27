# FALA-04 / TOR T5 — PF-R06-11: BOM snapshot przy tworzeniu WO

## Zmiana

Snapshot BOM (`bom_snapshots`) jest teraz tworzony **przy tworzeniu WO**, zgodnie z kontraktem ADR-002 w `apps/web/lib/technical/bom/snapshot.ts` i testem wiring `bom-snapshot.test.ts`.

| Plik | Zmiana |
|------|--------|
| `planning/work-orders/_actions/create-work-order-core.ts` | Po INSERT `work_orders`, gdy jest aktywny BOM → `createBomSnapshot(ctx, { woId, bomHeaderId })` |
| `planning/_actions/mrp.ts` | Po INSERT WO w `convertPlannedToWo` → ten sam wywołanie (ścieżka MRP omija core) |
| `lib/production/start-wo.ts` | Komentarz: START korzysta z idempotentnego `createBomSnapshot` (zwraca istniejący wiersz) |

`start-wo.ts` **nie** tworzy duplikatu — serwis sprawdza `(org, work_order_id, bom_header_id)` i zwraca istniejący wiersz bez INSERT.

---

## Wszystkie ścieżki tworzenia WO

| Ścieżka | Wejście | Podpięte? |
|---------|---------|-----------|
| **Ręczne WO** | `createWorkOrder` → `createWorkOrderCore` | ✅ przez core |
| **Planning New WO (łańcuch)** | `createWorkOrderFromPlanning` → `createWorkOrderChainForContext` → `createWorkOrderCore` (FG + każdy WIP) | ✅ przez core |
| **Import CSV** | `import-wo.ts` → `createWorkOrderCore` | ✅ przez core |
| **MRP convert** | `convertPlannedToWo` — bezpośredni INSERT `work_orders` | ✅ jawne wywołanie w `mrp.ts` |
| **NPD pilot** | `createPilotWorkOrder` → `createWorkOrderChainForContext` | ✅ przez core (łańcuch) |

**Nie dotyczy:** `maintenance_work_orders` (osobna tabela MWO).

Ścieżki **nie** tworzące WO produkcyjnego: scheduler read-only, release bundle (modyfikuje istniejące WO).

---

## Decyzja: `NO_ACTIVE_BOM`

**Zachowanie:** WO **może** powstać bez aktywnego BOM, ale **bez** snapshotu — jawny `warning: 'no_active_bom'` w odpowiedzi `createWorkOrderCore` (bez zmian semantycznych).

**Uzasadnienie:**
1. Istniejący kontrakt planowania: brak BOM = WO szkicowe z pustymi materiałami, nie blokada biznesowa.
2. Łańcuch WIP (`createWorkOrderChain`) **nadal** wymaga aktywnego BOM FG i zwraca `no_active_bom` — tam snapshot jest obowiązkowy.
3. Snapshot wołamy z **jawnym `bomHeaderId`** (ten sam, co trafia do `active_bom_header_id`), więc `resolveActiveBomHeaderId` / `NO_ACTIVE_BOM` **nie** jest wywoływane na ścieżce z BOM — nie ma cichego pominięcia przypięcia gdy BOM jest znany.
4. Gdy BOM jest znany, ale `createBomSnapshot` rzuci `BOM_NOT_FOUND` → `persistence_failed` i rollback transakcji (nie commituje WO bez snapshotu).

---

## Ścieżka osiągalności: „Utwórz WO" → INSERT `bom_snapshots`

**Ręczne WO (najczęstszy UI):**

1. UI Planning → `createWorkOrder` / `createWorkOrderFromPlanning` (`page` / formularz).
2. `withOrgContext` otwiera transakcję org (`app.current_org_id()`).
3. `createWorkOrderCore`:
   - walidacja RBAC, site, factory-release gate;
   - SELECT aktywnego `bom_headers` → `bom`;
   - INSERT `work_orders` z `active_bom_header_id = bom.id`;
   - **`createBomSnapshot(ctx, { woId, bomHeaderId: bom.id })`** → INSERT `bom_snapshots` (lub SELECT istniejącego);
   - INSERT `wo_materials`, `wo_operations`, `schedule_outputs`, `wo_status_history`.
4. `withOrgContext` COMMIT — WO i snapshot atomowo.

**MRP:**

1. `mrp-view.tsx` → `convertPlannedToWo(ids)`.
2. `withSiteContext` → pętla po planned orders.
3. SKIP jeśli brak active BOM; inaczej INSERT `work_orders` → **`createBomSnapshot`** → materiały/operacje/schedule.

**START (planowane WO już ze snapshotem):**

1. `startWo` → preflight `active_bom_header_id` z wiersza WO.
2. `createBomSnapshot` — idempotencja zwraca ten sam `id`.
3. `applyTransition(..., { bomSnapshotId })` + outbox `production.wo.started`.

---

## `delete-guard` i widok snapshotów

- **`delete-guard.ts`:** liczy `bom_snapshots` po `bom_header_id` — po tej zmianie planowane WO (DRAFT) z aktywnym BOM podbijają `snapshotCount` i blokują kasowanie wersji w UI (dla `draft` + `snapshotCount > 0` modal pokazuje guard). **Bez zmian kodu guarda.**
- **`list-snapshots.ts` / `LIST_SNAPSHOTS_SQL`:** status `in_use | closed | orphaned` po `bom_header_id`, nie po statusie WO — snapshot planowanego WO z `wo_number` z JOIN jest poprawnie widoczny jako `in_use` (najnowszy dla nagłówka). **Bez zmian.**

---

## Migracja danych (opis — NIE wykonana)

**Problem:** historyczne WO w `DRAFT`/`RELEASED` utworzone przed tą zmianą mogą mieć `active_bom_header_id` ustawione, ale **brak** wiersza `bom_snapshots`.

**Opcja backfill (do decyzji):**
```sql
-- Pseudokod: dla każdego WO z active_bom_header_id IS NOT NULL
-- i brakiem bom_snapshots dla (org_id, work_order_id, bom_header_id)
-- wywołać createBomSnapshot w batch job (nie surowy INSERT — potrzebny snapshot_json z mapperów).
```

Ryzyko bez backfillu: stare planowane WO nadal `snapshotCount: 0` w guardzie do momentu START (który tworzył snapshot) lub ręcznej naprawy.

**Rekomendacja:** jednorazowy skrypt serwisowy (nie migracja SQL), uruchomiony po deploy, jeśli audyt pokaże istotną liczbę osieroconych WO.

---

## Testy (napisane, nie uruchamiane)

| Plik | Co sprawdza |
|------|-------------|
| `create-work-order-core.bom-snapshot.test.ts` | WO + BOM → `createBomSnapshot`; brak BOM → warning, brak wywołania |
| `start-wo.bom-snapshot-reuse.test.ts` | START → jedno wywołanie, `bomSnapshotId` z istniejącego snapshotu |
| `delete-guard-planned-wo.test.ts` | `snapshotCount > 0` gdy snapshot istnieje (planowane WO) |
| `mrp.test.ts` (`convertPlannedToWo`) | MRP inline WO → `createBomSnapshot` z `bomHeaderId` aktywnego BOM |

Istniejące testy planowania (`createWorkOrder.test.ts`, `create-work-order-core.test.ts`, NPD/chain fixtures) dostały mock `createBomSnapshot`, żeby nie wołać realnego serwisu w dispatcherze SQL.

---

## Czego NIE jestem pewien

1. Czy product owner chce **twardo blokować** tworzenie WO bez BOM (zamiast `warning`) — obecnie zachowano istniejący kontrakt planowania.
2. Skala historycznych WO bez snapshotu — wymaga zapytania na prod/staging przed backfillem.
3. Czy MRP batch powinien przy błędzie snapshotu **skipować** pojedynczy wiersz zamiast rollback całej konwersji — obecnie: throw → rollback całej transakcji `convertPlannedToWo` (bezpieczniejsze, spójne z core).
