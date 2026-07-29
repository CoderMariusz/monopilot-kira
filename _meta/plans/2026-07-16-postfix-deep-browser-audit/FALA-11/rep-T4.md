# FALA 11 / TOR T4 — rep-T4

**Zakres:** PF-R18-01 (alergeny klienta bez danych referencyjnych), PF-R18-02 (podwójny submit SO).

Testy **napisane, nie uruchamiane** (zasada toru — bramkę odpala orchestrator).

---

## PF-R18-01 — ograniczenia alergenowe bez słownika

### Przyczyna źródłowa

Ekran i akcje serwerowe czytały wyłącznie `public.reference_tables` (`table_code = 'reference.allergens_reference'`). Ten overlay jest opcjonalny — wypełnia się ręcznie z `/settings/reference`, podczas gdy kanoniczny słownik EU-14 żyje w `"Reference"."Allergens"` i jest seedowany dla każdej org przez `seed_allergens_eu14_for_org` (migracja 082). Na produkcji Apex 22 miał wiersze w `Reference.Allergens`, ale **zero** w `reference_tables` → pusty Select i wyłączony submit.

### Zmiany

| Plik | Co / dlaczego |
|---|---|
| `packages/db/migrations/541-shipping-allergen-reference-id.sql` | Funkcja `shipping_allergen_reference_id(org_id, allergen_code)` — deterministyczne UUID dla `customer_allergen_restrictions.allergen_id` (kolumna `uuid`, nie `allergen_code`). Backfill `seed_allergens_eu14_for_org` dla wszystkich org. |
| `customers/_actions/customer-allergen-reference.ts` | Lustrzana implementacja TS (testowalna „na sucho"). |
| `customers/_actions/customer-allergen-actions.ts:104-169` | `listAllergenReferenceOptions`, `assertAllergenReferenceExists`, `loadRestrictionById` — odczyt z `"Reference"."Allergens"` + `shipping_allergen_reference_id`, nie `reference_tables`. |
| `customers/_actions/customer-action-schemas.ts:376-387` | `ALLERGEN_RESTRICTION_SELECT` — join tylko do `Reference.Allergens`. |
| `customers/_actions/customer-actions.ts:207-216` | Ten sam join w `getCustomer`. |
| `customers/_components/customer-allergen-modal.tsx:125-141,193` | Jawny alert `referenceUnavailable` zamiast cichego disabled Select. |
| `customers/_components/customer-detail-labels.ts` + `i18n/{en,pl,ro,uk}.json` | Teksty alertu. |

### Testy dodane / zaktualizowane

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `customer-allergen-reference.test.ts` | Stabilność `shippingAllergenReferenceId` | Zmiana algorytmu UUID bez aktualizacji SQL |
| `customer-allergen-actions.test.ts` | Mock `Reference.Allergens` + `shipping_allergen_reference_id` w SELECT | Test nadal mockowałby `reference_tables` i nie wykryłby regresji źródła danych |

---

## PF-R18-02 — podwójny submit tworzy dwa SO

### Przyczyna źródłowa

`createSalesOrder` wykonywał bezwarunkowy `INSERT` bez klucza idempotencji. Klient ustawiał `pending` dopiero po `await` — dwa synchroniczne kliki wysyłały dwa autorytatywne żądania.

### Zmiany (ładunek + client_op_id, lekcja Fali 8)

| Plik | Co / dlaczego |
|---|---|
| `shipping/_actions/so-create-idempotency.ts` | Kanoniczny hash SHA-256 znormalizowanego payloadu (customer, daty, linie z qty/ceną/rabatami). |
| `shipping/_actions/so-actions.ts:599-791` | Wymagany `client_op_id` (UUID). Advisory lock na `(org_id, client_op_id)`. Odczyt/zapis `idempotency_keys`: replay gdy `request_hash` zgodny, `invalid_input` gdy ten sam `client_op_id` z innym ładunkiem. |
| `shipping/_components/create-so-modal.tsx:197-218,296-351` | `clientOpId` mintowany raz na otwarcie modala; `submittingRef` blokuje re-entry przed pierwszym `setPending`. |
| `shipping/_components/so-list-view.tsx:138` | Typ kontraktu z `client_op_id`. |

**Świadomy wybór:** klucz transakcji = `client_op_id` (świeży na otwarcie modala), **hash** = pełny znormalizowany ładunek. Dwa kliki w tym samym otwarciu → ten sam id + ten sam hash → jeden SO. Zmiana formularza i ponowienie z tym samym id → odrzucenie (nie fałszywy `ok` ze starym stanem).

### Testy dodane / zaktualizowane

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `so-create-idempotency.test.ts` | Hash identyczny dla znormalizowanych duplikatów; różny przy zmianie qty | Idempotencja oparta tylko na `client_op_id` lub surowym JSON |
| `so-actions.test.ts` (3 nowe `it`) | Brak `client_op_id` → brak INSERT; replay → `soInsertCount === 1`; zmiana payloadu pod tym samym id → błąd | Drugi `createSalesOrder` z tym samym payloadem nadal insertowałby drugi nagłówek |
| `sales-orders.test.tsx` | Payload zawiera `client_op_id`; synchroniczny double-click → `toHaveBeenCalledTimes(1)` | Drugi klik wywołałby action drugi raz |

---

## Świadomie NIE ruszone

| Obszar | Dlaczego |
|---|---|
| **PF-R18-03** (suma linii vs total SO) | Poza zakresem T4 |
| **PF-R18-04** (partial pack / seal) | Poza zakresem T4 |
| Synchronizacja `reference_tables.allergens_reference` z `Reference.Allergens` | Overlay settings pozostaje osobny; shipping czyta kanon. Migracja 541 re-seeduje EU-14, nie kopiuje do `reference_tables`. |
| Wygaszanie starych wierszy `idempotency_keys` | Tabela bez TTL w prod; poza minimalnym fixem double-submit |

---

## Znaleziska poza zakresem (zgłoszenie)

| ID | Opis |
|---|---|
| PF-R18-03 | Wyświetlane sumy linii SO (2 dp) nie zgadzają się z total nagłówka (suma 4 dp) — `sales-line-price.ts` |
| PF-R18-04 | Partial pack po refresh + seal bez pełnej ilości — `shipment-pack-view.tsx` / `ship-actions.ts` |
