# Fala 9 — tor T2 (PF-R09-03 + PF-R09-04)

## PF-R09-03 — site-filtered supply vs global forecast/threshold

### Przyczyna źródłowa

MRP stosował **niespójny grain site**:
- podaż (on-hand, WO, schedule_outputs) była ściśle filtrowana do `site_id = app.current_site_id()`;
- prognoza, SO, PO i progi reorder używały `site_id IS NULL OR site_id = current_site`, więc wiersz org-globalny (`site_id IS NULL`) wchodził do **każdego** uruchomienia per-site → fałszywy popyt i fałszywe BUY (np. `tester1` bez zapasu, ale z globalną prognozą 24.345 kg).

Dodatkowo klucze UNIQUE na `demand_forecasts` i `reorder_thresholds` **nie zawierały `site_id`** (RECON-FACTS P5), więc nawet poprawny filtr SELECT nie pozwalał zapisać osobnych wartości per site.

### Zmiany

| Plik | Linie (orientacyjnie) | Co i dlaczego |
|---|---|---|
| `packages/db/migrations/528-mrp-forecast-threshold-site-unique.sql` | cały plik | Rozszerza UNIQUE do `(org_id, item_id, iso_week, site_id)` i `(org_id, item_id, site_id)` z `NULLS NOT DISTINCT` — `NULL` = jeden wiersz org-globalny widoczny tylko w trybie All sites. Post-check `DO $$` wstawia dwa wiersze różniące się tylko `site_id` i wymusza `unique_violation` przy duplikacie w tym samym site. **Bez kasowania danych.** |
| `apps/web/.../planning/_actions/mrp.ts` | ~272, 297, 346, 366, 432 | Usunięto `… site_id is null or …` z prognozy, SO, PO i progów. Reguła: **site wybrany** → tylko `site_id = app.current_site_id()`; **All sites** (`current_site_id() IS NULL`) → brak filtra site (w tym wiersze globalne). |
| `apps/web/.../planning/_actions/forecasts.ts` | ~9–10, 301, 409 | `ON CONFLICT` → `demand_forecasts_org_item_week_site_unique` (mig 528). |
| `apps/web/.../planning/_actions/reorder-thresholds.ts` | ~7–8, 216 | `ON CONFLICT` → `reorder_thresholds_org_item_site_unique` (mig 528). |
| `packages/db/schema/planning-mrp.ts` | ~253, 275 | Drizzle unique zgodny z mig 528. |

**Semantyka `site_id IS NULL`:** org-globalny wiersz (nieprzypisany do site). Widoczny wyłącznie gdy `app.current_site_id()` jest NULL (All sites). Istniejące wiersze z `NULL` pozostają bez zmian.

## PF-R09-04 — BUY u zablokowanego dostawcy

### Przyczyna źródłowa

`mrp-compute.ts` kopiował `preferred_supplier_id` do `suggestedAction.supplierId` **bez sprawdzenia** `suppliers.status`. Filtrowanie `status <> 'blocked'` istniało dopiero w `persistMrpRun` / `resolve-item-supplier.ts` — ścieżka niedostępna w read-first UI.

Stan blocked w prod: `suppliers.status` CHECK `('active','inactive','blocked')` (mig 261, RECON-FACTS).

### Zmiany

| Plik | Linie (orientacyjnie) | Co i dlaczego |
|---|---|---|
| `apps/web/.../planning/_actions/mrp-compute.ts` | ~153–156, 567–635, 475–486 | Helpery `preferredSupplierEligibilityIssue` / `resolveSuggestedSupplierId` / `resolveSuggestedLeadDays`: tylko `status === 'active'` dostaje `supplierId` i lead time. `blocked` / `inactive` → `supplierId: null`, `dueDate: null`, flaga `preferredSupplierIneligible`. `preferredSupplier` metadata (badge „Blocked”) bez zmian — UI może pokazać problem. |

## Testy dodane (nie uruchamiane w torze — „na sucho")

| Test | Plik | Co by wywróciło bez poprawki |
|---|---|---|
| `PF-R09-03: site-scoped MRP excludes org-global …` | `mrp.test.ts` | Stary SQL z `f.site_id is null` / `rt.site_id is null` / `po.site_id is null` / `so.site_id is null` |
| `PF-R09-03: nets only the site-specific forecast row …` | `mrp-compute.test.ts` | Dokumentuje kontrakt warstwy compute (caller musi przekazać już przefiltrowane dane) |
| `PF-R09-04: omits supplierId … blocked` | `mrp-compute.test.ts` | `supplierId: SUPPLIER`, `dueDate: '2026-06-18'` zamiast `null` + `preferredSupplierIneligible: 'blocked'` |
| `PF-R09-04: flags inactive preferred suppliers …` | `mrp-compute.test.ts` | `supplierId` ustawione mimo `inactive` |
| Aktualizacja `preferred_supplier_status: 'active'` w teście lead time | `mrp-compute.test.ts` | Jawne `active` — bez poprawki status `undefined` też byłby nieeligibilny |
| `on conflict … reorder_thresholds_org_item_site_unique` | `reorder-thresholds.test.ts` | Stara nazwa constraintu po mig 528 |

## Świadomie NIE ruszone

- **`mrp-view.tsx`** — badge „Blocked” na `preferredSupplier` już istnieje; osobny komunikat „select replacement” dla `preferredSupplierIneligible` to PF-R09-05 / UI polish (poza T2).
- **Upsert `site_id` w forecasts/reorder-thresholds CRUD** — nadal zapisuje `site_id = NULL` (org-global). Po mig 528 można dodać `app.current_site_id()` w osobnym torze; MRP read path jest już spójny.
- **`persistMrpRun` supplier resolution** — już używa `fetchNonBlockedSupplierIds`; bez zmian.
- **PF-R09-01, PF-R09-02, PF-R09-05** — inne tory.
- **`planning-mrp.migration.test.ts`** — testuje izolowaną mig 178; post-check w 528 weryfikuje nowe klucze.

## Znaleziska poza zakresem

- **All-sites MRP + wiele progów per item:** `computeMrpPhased` mapuje `thresholdByItem` przez `set(item_id, t)` — przy wielu site’ach w jednym przebiegu wygrywa ostatni wiersz. Po mig 528 to realne przy agregacji; wymaga osobnej reguły (suma / max min_qty / odmowa all-sites).
- **SO/PO z `site_id IS NULL` w prod:** po tej zmianie nie wchodzą do MRP per-site (zgodnie z intencją); mogą wymagać backfillu site na istniejących dokumentach (tor warehouse/procurement).
