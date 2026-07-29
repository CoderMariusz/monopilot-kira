# rep-FIX3-MRP — P0-01 / P0-02 / P1-Z-01 (Fala 9 prod findings)

**Data:** 2026-07-29  
**Tor:** FIX3 (post E2E-PROD-FALA-9)  
**Zakaz uruchamiania bramki w tym torze** — orchestrator odpala `make verify` po merge.

---

## Podsumowanie

| ID | Status | Pliki |
|---|---|---|
| **P0-01** Save this run (`42P01 missing FROM-clause entry for table "s"`) | ✅ Naprawione | `apps/web/lib/procurement/resolve-item-supplier.ts` |
| **P0-02** Historia przebiegów MRP niewidoczna przy wybranym zakładzie | ✅ Naprawione | `apps/web/app/.../planning/_actions/mrp.ts` (+ siostrzane filtry PO/planned orders) |
| **P1 / Z-01** Edit progu globalnego tworzy duplikat | ✅ Naprawione | `reorder-thresholds.ts`, `thresholds-view.tsx`, i18n |

---

## P0-01 — alias dostawcy w `resolve-item-supplier`

### Przyczyna
Stała `NON_BLOCKED_SUPPLIER_FILTER = \`s.status <> 'blocked'\`` była interpolowana do zapytań z aliasami `s_by_id` / `s_by_code` → Postgres `42P01` przy zapisie MRP (`persistPlannedOrders` → `resolveProcurementSuppliersForItems`).

### Naprawa
Zastąpiono stałą funkcją parametryzującą alias:

```ts
export function nonBlockedSupplierFilter(alias: string): string {
  return `${alias}.status <> 'blocked'`;
}
```

Wywołania: `nonBlockedSupplierFilter('s')`, `nonBlockedSupplierFilter('s_by_id')`, `nonBlockedSupplierFilter('s_by_code')`.

### Anty-regresja
`apps/web/lib/procurement/resolve-item-supplier.test.ts`:
- Rozszerzony test gałęzi `supplier_specs` — asercje na `s_by_id.status` / `s_by_code.status`, brak `\bs.status`.
- Nowy test `supplier_specs fallback rejects a hardcoded s alias` — symuluje `42P01`, gdyby alias `s` wrócił w zapytaniu `distinct on (ss.item_id)`.

Test **nie przeszedłby** przed poprawką (stary SQL zawierał `s.status` w JOIN-ach `s_by_id`/`s_by_code`).

---

## P0-02 — filtr `site_id IS NULL` w module planowania

### Przyczyna
`listMrpRuns` / `getMrpRunRequirements` używały:

```sql
(app.current_site_id() is null or site_id = app.current_site_id())
```

bez `site_id is null or`, podczas gdy siostrzane ekrany (`forecasts.ts:234`, `reorder-thresholds.ts:158`) mają pełny wzorzec. Wszystkie 3 przebiegi prod miały `site_id IS NULL` → niewidoczne przy Main Factory.

### Naprawa (`mrp.ts`)
Ujednolicono wzorzec tam, gdzie `NULL site_id` = wiersz org-globalny:

| Miejsce | Tabela / alias |
|---|---|
| `listMrpRuns` (~854) | `mrp_runs.site_id` |
| `getMrpRunRequirements` run gate (~895) | `mrp_runs.site_id` |
| `getMrpRunRequirements` ledger (~925) | `mrp_requirements.r.site_id` |
| `markPlannedOrdersReleased` (~1112) | `mrp_planned_orders.site_id` |
| Konwersja / anulowanie planned PO (~813, 1025, 1147, 1186) | `purchase_orders.po.site_id` |

**Nie zmieniano** `v_inventory_available` (~277) — `license_plates.site_id` jest zawsze konkretny (brak semantyki org-global).

### Anty-regresja
`mrp.test.ts`:
- `listMrpRuns` — oczekuje `site_id is null or site_id = app.current_site_id()`.
- `getMrpRunRequirements` — asercja na run-check SQL.
- Zaktualizowane asercje konwersji PO / release update.

---

## P1 / Z-01 — edycja progu globalnego

### Decyzja produktowa
**„Edit" aktualizuje istniejący wiersz po `id`** (zachowuje `site_id` — globalny zostaje globalny).  
**„Add"** nadal tworzy wiersz w kontekście bieżącego zakładu (`app.current_site_id()`), zgodnie z migracją 528 (override per-site jest możliwy przez dodanie nowego progu na innym zakładzie, nie przez przypadkowy duplikat przy edycji).

Uzasadnienie: przycisk „Edit" sugeruje mutację wiersza, który użytkownik widzi; rozwidlenie per-site bez jawnej intencji było źródłem dwóch identycznych wierszy `RM-R09-144638` na prod.

### Naprawa serwerowa
- `UpsertThresholdInput` + opcjonalne `id`.
- Gdy `id` podane → `UPDATE ... WHERE id = $1` (predykat site jak przy delete).
- Gdy brak `id` → dotychczasowy `INSERT ... ON CONFLICT`.

### Naprawa UI (widoczność przy legitym rozwidleniu)
- Kolumna **Site** w tabeli (`siteName` lub etykieta „All sites").
- `data-testid` oparte o `row.id` (`threshold-edit-{id}`, `threshold-delete-{id}`, `threshold-row-{id}`).
- Potwierdzenie kasowania: `Delete {item} ({site})?`.

### i18n
`Planning.reorderThresholds.columns.site` / `allSites` — en, pl, ro, uk.

### Anty-regresja
- `reorder-thresholds.test.ts` — `updates an existing threshold by id when editing`.
- `thresholds.test.tsx` — payload upsert z `id`, testidy po `row.id`, kolumna site.

---

## Pliki zmienione

```
apps/web/lib/procurement/resolve-item-supplier.ts
apps/web/lib/procurement/resolve-item-supplier.test.ts
apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts
apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.test.ts
apps/web/app/[locale]/(app)/(modules)/planning/_actions/reorder-thresholds.ts
apps/web/app/[locale]/(app)/(modules)/planning/_actions/reorder-thresholds.test.ts
apps/web/app/[locale]/(app)/(modules)/planning/reorder-thresholds/_components/thresholds-view.tsx
apps/web/app/[locale]/(app)/(modules)/planning/reorder-thresholds/__tests__/thresholds.test.tsx
apps/web/app/[locale]/(app)/(modules)/planning/reorder-thresholds/page.tsx
apps/web/i18n/{en,pl,ro,uk}.json
```

---

## Weryfikacja dla orchestratora

```bash
pnpm --filter web exec vitest run apps/web/lib/procurement/resolve-item-supplier.test.ts
pnpm --filter web exec vitest run apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.test.ts
pnpm --filter web exec vitest run apps/web/app/[locale]/(app)/(modules)/planning/_actions/reorder-thresholds.test.ts
pnpm --filter web exec vitest run --config vitest.ui.config.ts apps/web/app/[locale]/(app)/(modules)/planning/reorder-thresholds/__tests__/thresholds.test.tsx
```

**Smoke prod po deploy:**
1. MRP + „Save this run" → nowy wiersz w `mrp_runs`, brak alertu.
2. MRP przy Main Factory → „Previous runs" pokazuje przebiegi z `site_id IS NULL`.
3. Edit progu globalnego przy wybranym zakładzie → **jeden** wiersz zaktualizowany, kolumna Site = „All sites".

---

## Świadomie poza zakresem

- **Z-02** (brak kasowania prognoz w UI) — nie dotykane.
- **Z-04** (dashboard `/production`) — osobny tor.
- **Forecasts edit duplikat** — ten sam wzorzec co stary thresholds upsert; nie naprawiano w tym torze (brak findingu P0/P1 w Fali 9).
