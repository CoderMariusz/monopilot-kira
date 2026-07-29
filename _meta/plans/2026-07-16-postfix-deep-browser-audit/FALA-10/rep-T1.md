# FALA-10 / T1 — łańcuchy WO: historia propagacji qty + site-scope na detail

Dowody wejściowe: `run-11/REPORT.md` §PF-R11-02, §PF-R11-03.

## Zmiany (przyczyna źródłowa)

### PF-R11-02 — brak wpisu historii na dziecku przy propagacji qty

| Plik | Zmiana | Dlaczego root cause |
|---|---|---|
| `apps/web/lib/planning/wo-chain-qty-sync.ts:407-456` | Przed `UPDATE work_orders` odczyt `planned_quantity` + `status` dziecka; po udanej aktualizacji `INSERT INTO wo_status_history` z `action='update'`, `from_status=to_status` (status się nie zmienia), `context_jsonb.propagation='parent_planned_quantity'` + `parent_wo_id`, `planned_quantity_old/new`, `material_link_id`, `required_qty` | Propagacja qty żyje wyłącznie w `propagateParentWoChainQuantities` — ten moduł aktualizował `work_orders` / `wo_dependencies` / `schedule_outputs` bez żadnego zapisu audytowego. Ręczna edycja rodzica (`update-work-order.ts:412-428`) już zapisywała historię tylko na rodzicu; dziecko zmieniało się „cicho". |
| `apps/web/lib/planning/wo-chain-qty-sync.ts:14-15` | Stała `CHAIN_QTY_SYNC_APP_VERSION` w `context_jsonb` | Spójność z innymi ścieżkami historii WO (`app_version` w kontekście). |

Wpis historii jest pomijany, gdy `planned_quantity_old === planned_quantity_new` (relink bez zmiany ilości) — unika szumu audytowego.

**Brak migracji** — `wo_status_history` i kolumny używane w `INSERT` istnieją (mig 177); `from_status`/`to_status` bez CHECK-a (RECON-FACTS P6) — używamy faktycznego statusu dziecka, nie wymyślonego tekstu.

### PF-R11-03 — detail WO omija filtr site z listy

| Plik | Zmiana | Dlaczego root cause |
|---|---|---|
| `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/getPlanningWorkOrder.ts:3,27-28,52-53` | `getActiveSiteId({ client })` + predykat `($2::uuid is null or coalesce(wo.site_id, pl.site_id) = $2::uuid)` w zapytaniu nagłówka | Lista (`listPlanningWorkOrders.ts:65-67,27`) już filtrowała po aktywnym site; loader detail brał tylko `org_id + id`. Wzorzec skopiowany z naprawy LP (PF-R08-09, `warehouse/_actions/lp-actions.ts:148-160,230`), z tą różnicą, że WO używa `coalesce(wo.site_id, pl.site_id)` jak lista — nie surowego `wo.site_id`. |

Gdy WO jest poza aktywnym site, nagłówek zwraca 0 wierszy → `{ ok: false, error: 'not_found' }` bez odczytu materiałów/historii (jedno zapytanie, jak w teście LP).

## Testy dodane

| Plik | Test | Co by go wywróciło bez poprawki |
|---|---|---|
| `apps/web/lib/planning/wo-chain-qty-sync.test.ts` | `B1a: relinks…` rozszerzony o asercje `insert into wo_status_history` z `propagation`, `planned_quantity_old/new` | Bez `INSERT` asercja `historyInsert` byłaby `undefined`; stary kod nie wysyłał żadnego `insert into public.wo_status_history` z propagacji. |
| `apps/web/lib/planning/wo-chain-qty-sync.test.ts` | `PF-R11-02: skips child history when propagated qty is unchanged` | Gdyby kod zawsze insertował historię, `calls.some(…wo_status_history…)` zwróciłoby `true` przy qty `10.370→10.370`. |
| `apps/web/app/.../getPlanningWorkOrder.test.ts` | `PF-R11-03: scopes the detail read…` | Bez filtra site mock zwracałby wiersz nagłówka i `result.ok === true` przy `SITE_ID` spoza WO. |
| `apps/web/app/.../getPlanningWorkOrder.test.ts` | `PF-R11-03: binds NULL for All sites…` | Regresja: nadmierne filtrowanie przy `activeSiteId=null` zwróciłoby `not_found` zamiast pełnego payloadu. |
| `apps/web/app/.../getPlanningWorkOrder.test.ts` | `PF-R11-03: resolves active site with the org client…` | Wywołanie `getActiveSiteId()` bez `{ client }` dałoby inną semantykę niż lista (cookie vs fallback org-default). |

Testów nie uruchamiano (zakaz orchestratora).

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `updateWorkOrder`, `releaseWorkOrder`, `deleteDraftWorkOrder` | PF-R11-03 dotyczył odczytu detail URL; mutacje planning WO nadal nie weryfikują site (ten sam gap co LP przed hardeningiem akcji — osobny finding). |
| `apps/web/lib/planning/wo-chain-date-sync.ts` | PF-R11-01 (propagacja dat) — poza zakresem T1. |
| Moduł production (`get-work-order-detail.ts`) | Inna trasa (`/production/wos/[id]`); ten sam wzorzec bypassu możliwy, ale nie w PF-R11-03. |
| UI etykiet historii (`wo-detail-view`) | `context_jsonb.propagation` jest zapisane; wyświetlanie „Propagacja z rodzica" to osobne zadanie UI/i18n. |
| Migracja `533-*.sql` | Niepotrzebna — brak zmian schematu. |

## Znaleziska poza zakresem (nie naprawiane)

1. **Production WO detail** — `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-work-order-detail.ts` nie stosuje `getActiveSiteId`; deeplink z modułu produkcji może nadal pokazać WO z innego site.
2. **Mutacje planning WO bez guarda site** — po zamknięciu odczytu detail użytkownik z znanym UUID nadal mógłby wywołać `updateWorkOrder` / `releaseWorkOrder` cross-site (audyt Run-11: nie testowano mutacji).
3. **Propagacja dat bez historii** — `propagateParentWoChainScheduledDates` zmienia `scheduled_*` na dziecku bez wpisu `wo_status_history` (klasa PF-R11-02 dla dat).
