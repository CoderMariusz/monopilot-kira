# FALA 11 — RUNDA 3 FIX (alergeny klienta)

Data: 2026-07-29  
Zakres: `customer-allergen-actions.ts` + `customer-allergen-actions.test.ts`  
Status: **DOMKNIĘTE**

---

## Diagnoza (przyczyna czerwonych testów)

Runda 2 zaktualizowała **zarówno** implementację (od `reference_tables` → `Reference."Allergens"` + `shipping_allergen_reference_id`), **jak i** test — ale mock w teście nie dopasowywał znormalizowanego SQL, więc orchestrator raportował „pustą listę” i `ok: false` mimo poprawnego kodu akcji.

### Dowód na mismatch mocka

Po `normalize()` (lowercase + collapse whitespace) zapytanie listy wygląda tak:

```sql
from "reference"."allergens" ra
```

Mock z FIX2 szukał:

- `reference."allergens"` — **brak** (schema też jest w cudzysłowie → `"reference"."allergens"`)
- `reference.allergens` — **brak** (między `reference` a `.allergens` jest `"` )

Efekt w teście:

| Krok | Oczekiwane | Faktyczne (zepsuty mock) |
|------|------------|---------------------------|
| `listAllergenReferenceOptions` | wiersze EU-14 | `{ rows: [] }` → `data: []` |
| `assertAllergenReferenceExists` | `true` | `false` → `Unknown allergen reference` |
| `create` / `update` | `ok: true` | `ok: false` przed INSERT/UPDATE lub po błędnym `loadRestrictionById` |

Dodatkowo: zapytanie `loadRestrictionById` zawiera **i** `customer_allergen_restrictions car` **i** join do `Reference."Allergens"`. Mock musi obsłużyć `car` **przed** gałęzią alergenów — inaczej zwraca `{ ok: true }` zamiast `restrictionRow()`.

---

## Migracja 541 — co robi funkcja (przeczytane, nie założone)

Plik: `packages/db/migrations/541-shipping-allergen-reference-id.sql`

```sql
create or replace function public.shipping_allergen_reference_id(p_org_id uuid, p_allergen_code text)
returns uuid
```

- Operuje na **pojedynczym** `(org_id, allergen_code)` — deterministyczny UUID z `sha256('shipping.allergen_ref:' || org_id || ':' || lower(trim(code)))`.
- **Nie** jest tabelą lookup; kanon to `"Reference"."Allergens"` (PK: `org_id, allergen_code`, migracja 082).
- Backfill istniejących `customer_allergen_restrictions` mapuje stare overlay UUID → kanoniczny id przez tę funkcję.

### Czy funkcja wystarcza do listy?

**Tak.** Lista nie potrzebuje osobnej funkcji „daj wszystkie”:

```sql
select public.shipping_allergen_reference_id(ra.org_id, ra.allergen_code)::text as id, …
  from "Reference"."Allergens" ra
 where ra.org_id = app.current_org_id()
 order by name asc
```

To jest poprawny wzorzec: pełny słownik z tabeli kanonicznej + resolver per wiersz. Brakuje tylko danych w `Reference."Allergens"` jeśli org nie dostał seeda — migracja 541 woła `seed_allergens_eu14_for_org` dla każdej organizacji.

---

## Implementacja (`customer-allergen-actions.ts`) — stan po rundzie 3

| Akcja | Zapytanie / zachowanie |
|-------|------------------------|
| `listAllergenReferenceOptions` | `Reference."Allergens"` + `shipping_allergen_reference_id(ra.org_id, ra.allergen_code)` jako `id` |
| `assertAllergenReferenceExists` | ten sam resolver `= $1::uuid`, org przez `app.current_org_id()` |
| `loadRestrictionById` | join `car` → `ra` po `ra.org_id = car.org_id` i resolver = `car.allergen_id` (bez `reference_tables`) |
| `createCustomerAllergenRestriction` | INSERT org-scoped (`app.current_org_id()`), walidacja alergenu przed zapisem, audit `ship.customer.allergen_created` |
| `updateCustomerAllergenRestriction` | UPDATE z `org_id = app.current_org_id()` w WHERE, audit `ship.customer.allergen_updated` |

Zapis audytowy (`writeAllergenAudit`): `audit_events` z `resource_type = 'customer_allergen_restriction'`, `before_state` z `customer_id`, `after_state` z `allergen_id` + `restriction_type`.

**Zmiana względem HEAD (main):** pełna migracja z `reference_tables` / `reference.allergens_reference` na kanon 541 — już obecna w drzewie roboczym; runda 3 nie wymagała dalszych zmian SQL w akcjach.

---

## Poprawka testu (runda 3)

Plik: `customer-allergen-actions.test.ts`

1. `referencesCanonicalAllergens()` — dopasowuje `"reference"."allergens"` po `normalize()`.
2. Kolejność mocka: `from public.customer_allergen_restrictions car` **przed** gałęzią alergenów (poprawny `restrictionRow` po create/update).
3. `ALLERGEN_ID = shippingAllergenReferenceId(ORG_ID, 'milk')` — ten sam kontrakt co Postgres (vector: `05b4bd55-a303-4fa3-a16c-fb3c57d072a5`).

Eksporty zweryfikowane (`grep export`):

- `listAllergenReferenceOptions`, `createCustomerAllergenRestriction`, `updateCustomerAllergenRestriction`, `deleteCustomerAllergenRestriction`
- `shippingAllergenReferenceId` z `./customer-allergen-reference`

---

## Pliki dotknięte

| Plik | Akcja |
|------|-------|
| `customers/_actions/customer-allergen-actions.ts` | Bez zmian w rundzie 3 — implementacja 541 już kompletna w drzewie roboczym |
| `customers/_actions/customer-allergen-actions.test.ts` | Naprawa mocka (pattern + kolejność gałęzi) |

---

## Weryfikacja (orchestrator)

```bash
pnpm --filter web exec vitest run \
  "apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.test.ts"
```

Oczekiwane: 5/5 zielone (list, create + reject unknown, update, delete).

---

## Ryzyko resztkowe

- Org bez wierszy w `Reference."Allergens"` (seed nie poszedł) → pusta lista w UI; to problem danych/migracji, nie akcji.
- Stare UUID spoza backfillu 541 → `Unknown allergen reference` przy edycji; backfill w migracji powinien to wyłapać (`raise exception` przy orphanach).
