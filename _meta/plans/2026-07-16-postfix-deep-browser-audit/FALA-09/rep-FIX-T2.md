# Fala 9 — tor T2 — naprawa po cross-review (rep-FIX-T2)

## Podsumowanie

Wszystkie znaleziska **P1** zostały zaadresowane. **P2** — oba naprawione.

---

## P1

### 1. Forecasty i progi nie zapisują wybranego zakładu
**NAPRAWIONE** — `forecasts.ts`, `reorder-thresholds.ts`

- CRUD przełączony z `withOrgContext` na `withSiteContext` (read: `{ mode: 'read' }`, write: domyślny).
- INSERT zapisuje `site_id` przez `app.current_site_id()`.
- SELECT/LIST filtruje `site_id is not distinct from app.current_site_id()` (lub brak filtra w all-sites).
- DELETE ograniczony do bieżącego site (`site_id is not distinct from app.current_site_id()`).

### 2. Widok i kopiowanie forecastu zafałszowują ilości (wiele zakładów)
**NAPRAWIONE** — `forecasts.ts:220-256, 402-415`

- Lista grupuje wiersze po kluczu `item_id + site_id` (nie nadpisuje komórek między site'ami).
- `ForecastItemRow` ma opcjonalne `siteId`.
- `copyForecastWeek` kopiuje tylko wiersze bieżącego site (`src.site_id is not distinct from app.current_site_id()`).

### 3. Widok „All sites” losowo wybiera jeden próg
**NAPRAWIONE** — `mrp-compute.ts` (`collapseThresholdsForAllSites`), `mrp.ts:419-448`

- Przed `computeMrpPhased` w trybie all-sites (`siteId === null`) progi są zwijane do jednego wiersza/item z **najwyższym `min_qty`** (tie-break: `site_id` leksykograficznie).
- Zapytanie MRP dołącza `rt.site_id` do wiersza progu.
- Test: `mrp.test.ts` „all-sites MRP collapses duplicate thresholds…” + `mrp-compute.test.ts` unit na `collapseThresholdsForAllSites`.

### 4. Filtry site wycinają legalne SO/PO z `site_id IS NULL`
**NAPRAWIONE** — `mrp.ts:298, 347, 368`

- SO i PO w ścieżce `runMrp`: `(current_site_id() is null or site_id is null or site_id = current_site_id())`.
- Prognozy i progi reorder **pozostają ścisłe** (bez `site_id is null` przy wybranym site) — to zamierzone po PF-R09-03.
- Test PF-R09-03 zaktualizowany: SO/PO oczekują `site_id is null` w filtrze.

### 5. Persistowanie MRP przypisuje nieaktywnego dostawcę
**NAPRAWIONE** — `resolve-item-supplier.ts` (`fetchActiveSupplierIds`), `mrp.ts:675`

- `persistPlannedOrders` używa `fetchActiveSupplierIds` (`status = 'active'`) zamiast `fetchNonBlockedSupplierIds` (`<> 'blocked'`).
- Compute path bez zmian (już fail-closed na `active`).

### 6. Zmiana nazw constraintów — okno błędów przy rollout
**NAPRAWIONE** — `528-mrp-forecast-threshold-site-unique.sql`, `forecasts.ts`, `reorder-thresholds.ts`, `planning-mrp.ts`

- Migracja **zachowuje stare nazwy** constraintów (`demand_forecasts_org_item_week_unique`, `reorder_thresholds_org_item_unique`) przy nowej definicji z `site_id`.
- Kod aplikacji odwołuje się do tych samych nazw — stary i nowy proces po migracji używają jednego klucza ON CONFLICT.

### 7. Test MRP deterministycznie czerwony (`preferred_supplier_status`)
**NAPRAWIONE** — `mrp.test.ts:836-868`

- Fixture progu uzupełniony o `preferred_supplier_status: 'active'`.
- Mock `suppliers` obsługuje zapytanie `status = 'active'` dla persist path.

---

## P2

### 8. Drizzle bez `NULLS NOT DISTINCT`
**NAPRAWIONE** — `planning-mrp.ts:275-278`

- `.nullsNotDistinct()` na `reorder_thresholds_org_item_unique`.

### 9. Test site-scoped forecastu bezwartościowy
**NAPRAWIONE** — `mrp-compute.test.ts`

- Usunięty test „nets only the site-specific forecast row passed by caller”.
- Zastąpiony testem `collapseThresholdsForAllSites` (wywróci się bez agregacji all-sites).

### 10. Post-check migracji bez seedów
**NAPRAWIONE** — `528-mrp-forecast-threshold-site-unique.sql:63-65`

- Zamiast `NOTICE` + `RETURN` → `RAISE EXCEPTION` gdy brak org/item do probe (migracja nie przechodzi „na pusto”).

---

## Świadomie poza zakresem / bez zmian

- **`forecasts-view.tsx`** — opcjonalne `siteId` w typie; UI all-sites z wieloma wierszami per item wymaga osobnego toru UI (nie blokuje site-scoped write/read).
- **Inne filtry PO w convert/cancel** (`mrp.ts` ~775+) — pozostają site-strict; dotyczą operacji na planned orders, nie netowania legacy NULL SO/PO.

---

## Pliki zmienione

| Plik | Zmiana |
|---|---|
| `forecasts.ts` | withSiteContext, site_id w CRUD, composite list key, stare nazwy constraint |
| `reorder-thresholds.ts` | j.w. |
| `mrp.ts` | SO/PO NULL fallback, collapse thresholds, fetchActiveSupplierIds |
| `mrp-compute.ts` | `collapseThresholdsForAllSites`, `site_id` na `MrpThresholdRow` |
| `resolve-item-supplier.ts` | `fetchActiveSupplierIds` |
| `528-mrp-forecast-threshold-site-unique.sql` | stare nazwy constraint, fail-hard post-check |
| `planning-mrp.ts` | `.nullsNotDistinct()` |
| `mrp.test.ts`, `mrp-compute.test.ts`, `reorder-thresholds.test.ts`, `resolve-item-supplier.test.ts` | testy |

Testy nie uruchamiane w torze (zakaz orchestratora).
