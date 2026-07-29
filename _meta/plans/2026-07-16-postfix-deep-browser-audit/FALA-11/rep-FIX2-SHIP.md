# Fala 11 — RUNDA 2 FIX (wysyłki)

Data: 2026-07-29  
Zakres: trzy czerwone testy z bramki wysyłek po T4/T5.

---

## 1. `shipment-pack-completeness.test.ts` — import do nieistniejącego modułu

### Przyczyna
Test leżał w `apps/web/lib/shipping/` ale importował `../shipment-pack-completeness` → rozwiązywał się do `apps/web/lib/shipment-pack-completeness` (poza katalogiem `shipping/`). Moduł z logiką (`assessPackCompleteness`, `fetchShipmentPackCompleteness`) żyje w `apps/web/lib/shipping/shipment-pack-completeness.ts` i jest już używany przez `pack-actions.ts` / `ship-actions.ts`.

### Rozstrzygnięcie
**Nie usuwamy testu** — moduł istnieje i jest kanonicznym źródłem prawdy dla plombowania. Poprawiono import:

```ts
import { assessPackCompleteness, formatShipmentQtyByUom } from './shipment-pack-completeness';
```

Zweryfikowano eksporty (`grep export` na pliku źródłowym): `assessPackCompleteness`, `formatShipmentQtyByUom`, `fetchShipmentPackCompleteness`.

### Dlaczego test ma wartość
Pokrywa PF-R18-04 (partial pack 1.000/3.625 kg), pusty pick mimo boxów, grupowanie pozostałości per UoM — regresja bez tego pliku przechodziłaby „na sucho" przez mocki akcji, ale nie łapałaby błędów arytmetyki `toMicro`/`microToFixed(3)`.

---

## 2. `customer-allergen-actions.test.ts` — asercja na kruchy string SQL

### Przyczyna
Po migracji 541 akcje czytają `Reference."Allergens"` i mapują `(org_id, allergen_code)` → `uuid` przez `public.shipping_allergen_reference_id()`. Stary test:
- mockował `reference_tables` / `reference.allergens_reference` (już nieużywane),
- asercja `toContain('reference."allergens"')` na `queryLog[0]` — kruche (wrażliwe na quoting, kolejność zapytań, refaktor SELECT).

### Zmiany
| Co | Dlaczego |
|----|----------|
| `ALLERGEN_ID = shippingAllergenReferenceId(ORG_ID, 'milk')` | Ten sam kontrakt co migracja 541 / `customer-allergen-reference.test.ts` |
| Mock: `reference."allergens"` **lub** `reference.allergens` | Obsługuje quoted i unquoted identyfikatory po `normalize()` |
| `listAllergenReferenceOptions`: asercja na **zwrócone id** + regex `shipping_allergen_reference_id(ra.org_id, ra.allergen_code)` w zapytaniu listy | Sprawdza most uuid↔kanon, nie nazwę tabeli w stringu |
| `rejects unknown allergen`: weryfikacja, że **przed INSERT** poszło zapytanie resolvera z `params[0] === ALLERGEN_ID` | Zachowanie: nieznany id nie przechodzi walidacji |

### Dlaczego nowa asercja jest mocniejsza
Stara: „SQL zawiera literal `reference."allergens"`" — przechodziłby przy joinie do dowolnej tabeli o tej nazwie; padałby przy poprawnym kodzie z innym quotingiem; nie wykrywałaby użycia równoległego słownika (`reference_tables`).

Nowa: (1) zwrócone `id` musi być deterministycznym UUID z tej samej funkcji co Postgres, (2) SELECT listy musi wywołać resolver na `(ra.org_id, ra.allergen_code)`, (3) create odrzuca nieznany id dopiero po sprawdzeniu przez resolver — to jest **kontrakt biznesowy** (customer restrictions → kanoniczny EU-14 master), nie implementacja szczegółu SQL.

---

## 3. `pack-actions.test.ts` — `getShipment` / kształt `packing`

### Przyczyna
T5 podpiął `fetchShipmentPackCompleteness` do `getShipment`. Pola `packing.requiredQty` / `packedQty` / `remainingQty` mapują teraz `*Display` (np. `"10.000 kg"`), nie gołe `numeric` bez jednostki. Dodano `skippedLineCount`. Test nie mockował zapytań kompletności → `packing` wracał zerowy / niekompletny.

### Zmiana (zamierzona w T5)
| Pole | Było (test) | Jest (produkcja) |
|------|-------------|------------------|
| `requiredQty` | `'10.000'` | `'10.000 kg'` (`requiredDisplay`) |
| `packedQty` | `'10.000'` | `'10.000 kg'` (`packedDisplay`) |
| `remainingQty` | `'0'` | `'0'` (complete → literal `'0'`) |
| `skippedLineCount` | brak | `0` |
| `boxId` | brak w matcherze | `BOX_ID` (już w odpowiedzi) |

Dodano mocki dla:
- `select sh.sales_order_id … from public.shipments sh`
- `select sol.id … quantity_picked` (+ `uom: 'kg'`)
- `select sbc.sales_order_line_id … sum(sbc.quantity)`

Zmiana **zamierzona** — UI i i18n T5 pokazują ilości z jednostką magazynową; sumowanie per UoM wymaga display stringów, nie jednego skalarnego totalu.

---

## Pliki dotknięte

| Plik | Akcja |
|------|-------|
| `apps/web/lib/shipping/shipment-pack-completeness.test.ts` | import `./shipment-pack-completeness` |
| `apps/web/app/.../customers/_actions/customer-allergen-actions.test.ts` | mock + asercje behawioralne |
| `apps/web/app/.../shipping/_actions/pack-actions.test.ts` | mock kompletności + oczekiwany kształt `packing` |

## Weryfikacja (orchestrator)

```bash
pnpm --filter web exec vitest run apps/web/lib/shipping/shipment-pack-completeness.test.ts
pnpm --filter web exec vitest run "apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.test.ts"
pnpm --filter web exec vitest run "apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.test.ts"
```
