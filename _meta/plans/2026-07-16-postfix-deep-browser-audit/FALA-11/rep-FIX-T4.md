# FALA 11 / TOR T4 — rep-FIX-T4

**Zakres:** poprawki po recenzji `out-rev-t4.md` (PF-R18-01 alergeny + PF-R18-02 idempotencja SO).

Testy **napisane/zmienione, nie uruchamiane** (zasada toru — bramkę odpala orchestrator).

---

## [P1] Migracja — kanoniczny słownik + backfill istniejących ograniczeń

### Przyczyna źródłowa

`Reference."Allergens"` jest kanonem (PK: `org_id, allergen_code`), ale `customer_allergen_restrictions.allergen_id` to `uuid`. Poprzednia implementacja T4 wprowadziła funkcję `shipping_allergen_reference_id` bez **backfillu** wierszy zapisanych ze starym UUID z overlay `reference_tables` — po wdrożeniu JOIN-y zwracały pustą nazwę alergenu i `Unknown allergen reference` przy edycji.

### Zmiany

| Plik | Co / dlaczego |
|---|---|
| `packages/db/migrations/541-shipping-allergen-reference-id.sql:44-99` | UPDATE z `reference_tables` (mapowanie po `row_data->>'id'` / `row_key` → `allergen_code` → `shipping_allergen_reference_id`). Drugi UPDATE dla wierszy zapisanych tekstowo jako kod. `DO $$` post-check: każde aktywne ograniczenie musi rozwiązywać się do `Reference."Allergens"`. |
| `packages/db/src/migrations/541-shipping-allergen-reference-id.sql` | Lustrzana kopia (repo ma oba katalogi migracji). |

**Świadomy wybór:** nie dodano osobnej tabeli `shipping_allergen_reference` — funkcja SQL jest deterministycznym mostem uuid↔`(org_id, allergen_code)`, bo kanon nie ma kolumny `id uuid`. Overlay `reference_tables` pozostaje opcjonalny dla `/settings/reference`; shipping czyta wyłącznie `Reference."Allergens"`.

---

## [P1] Idempotencja SO — kolizja klucza między organizacjami

### Przyczyna źródłowa

`idempotency_keys.transaction_id` to globalny PK, a zapis używał go bezpośrednio jako `client_op_id`. Org B z tym samym `client_op_id` nie widział rekordu org A (RLS), tworzył SO, a `ON CONFLICT DO NOTHING` cicho przegrywał na globalnym PK — fail-open.

### Zmiany

| Plik | Co / dlaczego |
|---|---|
| `shipping/_actions/so-create-idempotency.ts:65-71` | `soCreateIdempotencyTransactionId(orgId, clientOpId)` — deterministyczny UUID namespacowany orgiem (ten sam algorytm slice co migracja 541). |
| `shipping/_actions/so-actions.ts:621-633,851-871` | Odczyt/zapis idempotencji po `idempotencyTransactionId`, nie po surowym `client_op_id`. Po `ON CONFLICT DO NOTHING` weryfikacja `org_id` + `request_hash` — fail-closed przy wątpliwości. |

---

## [P1] Test importujący nieistniejący moduł

| Plik | Co / dlaczego |
|---|---|
| `customers/_actions/customer-allergen-reference.test.ts:3` | Import `./customer-allergen-reference` (ten sam katalog) zamiast błędnego `../customer-allergen-reference`. |

---

## [P1] Czerwony test double-submit (RTL)

### Przyczyna źródłowa

Test klikał submit zanim forma była ważna (brak `await` na auto-wypełnioną cenę linii) **oraz** `client_op_id` był ustawiany w `useEffect` (po pierwszym paint). Efekt: walidacja kończyła się przed wywołaniem akcji → `toHaveBeenCalledTimes(0)`.

### Zmiany

| Plik | Co / dlaczego |
|---|---|
| `shipping/_components/create-so-modal.tsx:205-230,313-318` | `useLayoutEffect` dla `clientOpId` + fallback `mintClientOpId()` w `onSubmit`. |
| `shipping/__tests__/sales-orders.test.tsx:500-503` | `waitFor` na `create-so-line-price` przed podwójnym klikiem — test padałby bez poprawki modala **i** bez tego wait. |

---

## [P2] UUID SQL vs TypeScript

### Przyczyna źródłowa

TS używał `hex.slice(13,16)` / `slice(17,20)` (0-indeksowane), podczas gdy Postgres `substring(h,13,3)` to znaki 13–15 (1-indeksowane) → inne UUID w mockach vs produkcja.

### Zmiany

| Plik | Co / dlaczego |
|---|---|
| `customers/_actions/customer-allergen-reference.ts:11-12` | `slice(12,15)` / `slice(16,19)` na pełnym 64-znakowym hex SHA-256. |
| `customers/_actions/customer-allergen-reference.test.ts:18-21` | Asercja wektora `05b4bd55-a303-4fa3-a16c-fb3c57d072a5` — test padnie przy powrocie do błędnych slice. |

---

## [P2] Test idempotencji — współbieżność

| Plik | Co / dlaczego |
|---|---|
| `shipping/_actions/__tests__/so-actions.test.ts:81-82,134-158,969-985` | Mock advisory lock serializuje równoległe wywołania; nowy `it` `Promise.all([create, create])` → `soInsertCount === 1`. Bez locka mock zwracałby 2 inserty przy równoległym starcie. |
| `shipping/_actions/__tests__/so-create-idempotency.test.ts:58-66` | Różne `soCreateIdempotencyTransactionId` dla tego samego `client_op_id` w dwóch org — wykrywa regresję do globalnego PK. |

---

## Świadomie NIE ruszone

| Obszar | Dlaczego |
|---|---|
| PF-R18-03 / PF-R18-04 | Poza zakresem T4 |
| Dual-read `reference_tables` w runtime po migracji | Backfill + post-check w 541; runtime już czyta tylko `Reference."Allergens"` |
| Zmiana schematu `idempotency_keys` (composite PK) | Namespacowany `transaction_id` rozwiązuje kolizję bez migracji tabeli |
| TTL / cleanup `idempotency_keys` | Poza minimalnym fixem double-submit |

---

## Znaleziska poza zakresem (zgłoszenie)

| ID | Opis |
|---|---|
| PF-R18-03 | Suma linii SO (2 dp) vs total nagłówka (4 dp) — `sales-line-price.ts` |
| PF-R18-04 | Partial pack po refresh + seal — `shipment-pack-view.tsx` / `ship-actions.ts` |
