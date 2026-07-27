# FALA-04 / FIX-T5 — poprawki po cross-review (snapshot BOM przy tworzeniu WO)

## [P1-1] Błąd snapshotu zostawiał osierocony nagłówek WO

### Co zmieniono
- `create-work-order-core.ts`: usunięto `try/catch` wokół `createBomSnapshot` — `BomSnapshotError` propaguje się w górę.
- `createWorkOrder.ts`: bez zmian — już ma zewnętrzny `catch` mapujący każdy throw na `{ ok: false, error: 'persistence_failed' }`.

### Dlaczego to naprawia
Zweryfikowano implementację `withOrgContext` (`apps/web/lib/auth/with-org-context.ts:352-365`):

```typescript
await client.query('begin');
const result = await action({ userId, orgId, sessionToken, client, actAsOrg });
await client.query('commit');  // ← normalny return = COMMIT
return result;
} catch (err) {
  await client.query('rollback');  // ← throw = ROLLBACK
  throw err;
}
```

Poprzedni kod łapał `BomSnapshotError` i **zwracał** `{ ok: false }` wewnątrz transakcji → `withOrgContext` robił **COMMIT** → w bazie zostawał `work_orders` bez `bom_snapshots`, materiałów, harmonogramu ani historii.

Teraz błąd snapshotu **przerywa** transakcję; mapowanie na `persistence_failed` dzieje się w `createWorkOrder` **po** rollbacku.

### Testy (nie uruchamiane)
- `create-work-order-core.bom-snapshot.test.ts`: `rethrows BomSnapshotError so withOrgContext can roll back the WO header`
- `createWorkOrder.test.ts`: `maps BomSnapshotError to persistence_failed and rolls back the WO header` — mock `withOrgContext` symuluje commit tylko przy normalnym return; przy throw `persistedWoInserts === 0`.

---

## [P1-2] Ostrzeżenie `no_active_bom` było martwe w UI

### Co zmieniono
- `create-wo-modal.tsx`: usunięto lokalny stan `warning` i banner `create-wo-warning`; modal zamyka się od razu po sukcesie.
- `wo-list-view.tsx`: `onCreated` ustawia trwały `createNotice` dla `result.warning === 'no_active_bom'` i `'no_approved_factory_spec'` (ten sam mechanizm co łańcuch WIP).

### Dlaczego to naprawia
Modal wołał `setWarning(...)`, potem `onOpenChange(false)`; efekt resetu przy zamknięciu (`useEffect` na `open`) **czyścił** ostrzeżenie zanim użytkownik je zobaczył. Rodzic obsługiwał tylko `result.chain`, ignorując `result.warning`.

Przeniesienie do `createNotice` w `wo-list-view` gwarantuje widoczny komunikat **po** zamknięciu modala (`data-testid="wo-list-create-notice"`).

### Testy (nie uruchamiane)
- `work-orders.test.tsx`: po submit sprawdza `wo-list-create-notice` z `enWo.create.noBomWarning`, brak `create-wo-warning`, modal zamknięty.

**Uzasadnienie wyboru:** toast/`createNotice` rodzica zamiast otwartego modala — spójne z istniejącym wzorcem łańcucha WIP; nie blokuje odświeżenia listy.

---

## [P1-3] Drugi planowany WO tego samego BOM-u błędnie oznaczany `closed`

### Co zmieniono
- `technical/boms/snapshots/_actions/shared.ts`:
  - `LIST_SNAPSHOTS_SQL`: usunięto window `is_latest`; dodano `wo.status as wo_status`.
  - `deriveSnapshotStatus()` + eksportowane stałe statusów WO.
  - `mapSnapshotRow()` deleguje do `deriveSnapshotStatus`.

### Listy stanów WO (z kodu, nie zgadywane)
Źródło: `wo-state-machine.ts:27-28,56-62` (planning vocabulary, migration 176) + `warehouse.ts:439` (open WO query).

| Klasa | Stany |
|-------|-------|
| **Otwarte → `in_use`** | `DRAFT`, `RELEASED`, `IN_PROGRESS`, `ON_HOLD` |
| **Terminalne → `closed`** | `COMPLETED`, `CLOSED`, `CANCELLED` |
| **`orphaned`** | brak kanonicznego `bom_headers` (`header_exists = false`) **lub** brak powiązanego WO (`wo_status IS NULL`) |

### Dlaczego to naprawia
Poprzednia logika: tylko najnowszy snapshot per `bom_header_id` = `in_use`, starsze = `closed` — **bez czytania stanu WO**. Dwa WO w `DRAFT` na tym samym BOM v3 dawało: nowszy `in_use`, starszy `closed`.

Teraz każdy snapshot jest klasyfikowany według **swojego** `work_orders.status` — dwa otwarte WO → oba `in_use`.

### Testy (nie uruchamiane)
- `snapshots/__tests__/snapshot-status.test.ts`: dwa wiersze z `wo_status: 'DRAFT'` → oba `in_use`; pokrycie open/terminal/orphaned.

---

## [P1-4] Idempotencja snapshotu nie była bezpieczna współbieżnie

### Co zmieniono
1. **Migracja** `packages/db/migrations/524-bom-snapshots-unique-wo-header.sql` (+ mirror `packages/db/src/migrations/`):
   - `UNIQUE (org_id, work_order_id, bom_header_id)` — idempotentna (`DROP IF EXISTS` + `ADD`).
   - Post-check: zagnieżdżony `BEGIN … EXCEPTION WHEN unique_violation` (wzorzec mig. 523), próba duplikatu INSERT → wymagany `23505`.

2. **`snapshot.ts`**: `INSERT … ON CONFLICT (org_id, work_order_id, bom_header_id) DO NOTHING RETURNING …`; gdy conflict — ponowny `SELECT` istniejącego wiersza.

### Dlaczego `DO NOTHING` + re-read (nie `DO UPDATE`)
Snapshoty są **niemutowalne** (trigger mig. 159 + brak grantów UPDATE/DELETE). `DO UPDATE` naruszyłby kontrakt ADR-002 i trigger. `DO NOTHING` pozwala przegranemu wyścigowi odczytać wiersz zwycięzcy bez mutacji.

### Migracja 159 — kolizje
- Trigger `bom_snapshots_reject_mutation`: blokuje tylko **UPDATE/DELETE** — nie koliduje z `ALTER TABLE ADD CONSTRAINT`.
- Granta: `SELECT, INSERT` dla `app_user` — UNIQUE nie wymaga dodatkowych uprawnień.
- Post-check INSERT duplikatu: odrzucony przez constraint, nie przez trigger (to INSERT, nie UPDATE).

### Produkcja (audyt użytkownika)
Zero duplikatów na `(org_id, work_order_id, bom_header_id)`, zero `work_order_id IS NULL` — constraint bezpieczny bez backfillu.

---

## [P2-5] Testy ZIELONE przed naprawą (fałszywe)

### `start-wo.bom-snapshot-reuse.test.ts` — przepisany
**Stary test:** mockował `createBomSnapshot` tak, że sam zwracał „istniejący” snapshot — START przechodził nawet gdy tworzenie WO nie wołało serwisu.

**Nowy test:** przepływ `createWorkOrderCore` (prawdziwy `createBomSnapshot`) → współdzielony in-memory store → `startWo`.
- Asercja: po create `store.snapshots.length === 1`.
- Po start: nadal 1 wiersz, ten sam `id` w `applyTransition.context.bomSnapshotId`.

**Co wywala na kodzie sprzed rundy:** gdyby hook snapshotu w `createWorkOrderCore` usunięto, `store.snapshots` po create byłby pusty → test pada na `toHaveLength(1)`.

### `delete-guard-planned-wo.test.ts` — przepisany
**Stary test:** wstrzykiwał `{ n: 1 }` do mocka SQL bez tworzenia WO ani snapshotu.

**Nowy test:** `createWorkOrderCore` (prawdziwy snapshot) → `getVersionDeleteGuard` → `deleteBomVersion` na v3 ze `snapshotCount: 1`.
- Po create: 1 wiersz w store powiązany z `BOM_V3_ID`.
- Guard: `snapshotCount: 1`.
- Delete draft v3: `snapshot_referenced`.

**Co wywala na kodzie sprzed rundy:** bez `createBomSnapshot` w create, store pusty → guard `snapshotCount: 0`, delete nie trafia `snapshot_referenced`.

---

## Pliki dotknięte

| Plik | FIX |
|------|-----|
| `planning/work-orders/_actions/create-work-order-core.ts` | P1-1 |
| `planning/work-orders/_actions/createWorkOrder.test.ts` | P1-1 test |
| `planning/work-orders/_actions/create-work-order-core.bom-snapshot.test.ts` | P1-1 test |
| `planning/work-orders/_components/create-wo-modal.tsx` | P1-2 |
| `planning/work-orders/_components/wo-list-view.tsx` | P1-2 |
| `planning/work-orders/__tests__/work-orders.test.tsx` | P1-2 test |
| `technical/boms/snapshots/_actions/shared.ts` | P1-3 |
| `technical/boms/snapshots/__tests__/snapshot-status.test.ts` | P1-3 test |
| `lib/technical/bom/snapshot.ts` | P1-4 |
| `packages/db/migrations/524-bom-snapshots-unique-wo-header.sql` | P1-4 |
| `packages/db/src/migrations/524-bom-snapshots-unique-wo-header.sql` | P1-4 |
| `lib/production/__tests__/start-wo.bom-snapshot-reuse.test.ts` | P2-5 |
| `technical/bom/_actions/__tests__/delete-guard-planned-wo.test.ts` | P2-5 |

---

## Czego NIE jestem pewien

1. **Post-check mig. 524 na pustej bazie** — gdy `bom_snapshots` nie ma żadnego wiersza widocznego w sesji migracji, probe jest pomijany (`RAISE NOTICE`). Na produkcji (7 wierszy) probe się wykona; na świeżym lokalnym Postgresie bez seedów — nie.
2. **UNIQUE + `work_order_id NULL`** — PostgreSQL traktuje NULL-e jako rozróżnialne w UNIQUE; audyt produkcyjny mówi „zero NULL”, ale przyszły wiersz z `work_order_id IS NULL` nadal mógłby duplikować się teoretycznie (poza obecnym kontraktem ADR-002).
3. **Nie uruchamiano testów ani migracji** w tej rundzie — orchestrator ma potwierdzić GREEN i `pnpm db:test` / deploy migrate gate.
