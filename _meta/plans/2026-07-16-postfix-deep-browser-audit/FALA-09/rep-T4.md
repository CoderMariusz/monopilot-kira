# FALA-09 / Tor T4 — Transfer Orders: reversal + partial cancel

## PF-R10-02 (P1) — Re-receive after reversal falsely closed TO as Received

### Przyczyna źródłowa (nie objaw)

Dwa niezależne defekty w łańcuchu ship → receive → reverse → receive:

1. **`reverseToReceiveLine` usuwał wiersz `transfer_order_line_lps` i kredytował LP źródłowy** (`reverse-receive.ts` ok. 535–607). Po wycofaniu przyjęcia nie było wiersza junction z `dest_lp_id IS NULL`, więc `receiveTransferOrder()` nie miał czego materializować — `lpCount = 0`, no-op.
2. **`transitionTransferOrderStatus` zawsze ustawiał nagłówek na żądany status** (`actions.ts` ok. 1318–1327), bez porównania `sum(materialized line qty)` z `sum(TO line qty)`.

### Naprawa

| Plik | Zmiana | Dlaczego to źródło |
|------|--------|---------------------|
| `reverse-receive.ts` ~535–607 | Po void dest LP: **`UPDATE dest_lp_id = NULL`** na junction; **brak kredytu source LP** i **brak DELETE** | Ilość wraca do modelu „w tranzycie” na junction (jak po ship), `receive()` widzi pending rows; cancel nie podwaja kredytu źródła |
| `to-conservation.ts` | `loadTransferOrderLineReceiveState`, `assertAllLinesFullyReceived`, `resolveTransferOrderStatusFromLines` | Status i walidacja na junction + qty linii, nie na liczniku akcji |
| `actions.ts` `receiveTransferOrder` koniec | `assertAllLinesFullyReceived` → throw `TransferOrderConservationError` | Transakcja rollbackuje przy próbie zamknięcia bez pełnej materializacji |
| `actions.ts` `transitionTransferOrderStatus` | `nextStatus` z materializacji; receive łączy `in_transit` i `partially_received` | Nagłówek `received` tylko gdy każda linia: `receivedMicro === lineMicro` i `pendingMicro === 0` |

Arytmetyka: porównania na `bigint` micro (skala 6) przez `toMicro6` / `toMicro` — bez `Number()` na NUMERIC.

### Testy dodane / zmienione

| Test | Co wywróciłoby się bez poprawki |
|------|----------------------------------|
| `to-receive-status.test.ts` — `refuses header close when a line is short-received with no pending junction` | Przechodziłby z `ok: true` na niepełnym stanie (stary nagłówek `received`) |
| `reverse-receive.test.ts` — junction `dest_lp_id = null`, brak DELETE | Oczekiwał DELETE i kredytu source |
| `to-duplicate-line-conservation.integration.test.ts` — po reverse `inTransit: 3` | Stary model: `inTransit: 0` po kredycie source |

---

## PF-R10-03 (P2) — Cancel na Partially received był martwy

### Decyzja produktowa

**Anulowanie reszty** (nie ukrywanie przycisku): na `partially_received` operator może zamknąć nieprzyjętą część; już przyjęty zapas **pozostaje** w magazynie docelowym; dla wierszy z `dest_lp_id IS NULL` działa istniejący `cancelInTransitTransferOrder` (przywrócenie source + DELETE junction). Dokument zamyka się jako **`received`** (częściowa realizacja), nie `cancelled`.

FK `transfer_order_line_lps` (mig. 283): `ON DELETE CASCADE` na `to_id`/`to_line_id`, `dest_lp_id ON DELETE SET NULL` — anulowanie reszty to DELETE junction (nie TO), bez kaskady na przyjęte dest LP.

### Naprawa

| Plik | Zmiana |
|------|--------|
| `actions.ts` ~1286–1310 | Usunięty guard `received_count > 0 → error partially_received`; cancel remainder + `resolveTransferOrderStatusFromLines` |
| `to-detail-view.tsx` | Przycisk **Cancel remainder** + `confirmCancelRemainder`; błąd z `result.message` |
| `i18n` en/pl/ro/uk | `cancelRemainder`, `confirmCancelRemainder`; zaktualizowany `errors.partially_received` |

Guard: jeśli brak pending junction ale linia jest short (`received < line qty`) → `invalid_state` (legacy po starym DELETE junction — nie fałszywe `received`).

### Testy

| Test | Co wywróciłoby się bez poprawki |
|------|----------------------------------|
| `actions.test.ts` — `cancels only the outstanding remainder...` | Zwracał `partially_received` error, status nie `received` |
| `to-stock.integration.test.ts` — partial cancel | Oczekiwał `ok: false` |
| `transfer-orders.test.tsx` | Label „Cancel” zamiast „Cancel remainder” |

---

## Świadomie NIE ruszone

- **Migracja 531** — nie potrzebna; junction schema z mig. 283 wystarcza (`dest_lp_id` nullable).
- **`procurement-shared` enum** — `partially_received` error pozostaje w typie (legacy); cancel remainder już go nie zwraca.
- **Duplikat `toMicro6` w `actions.ts`** — poza minimalnym zakresem; RECON-FACTS wskazuje konsolidację z `lib/shared/decimal.ts` na inny tor.
- **Partial ship / over-receipt UI** — poza PF-R10-03 (zgłoszone poniżej).

---

## Znaleziska poza zakresem

1. **PF-R10-01 mixed-UoM** — `transfer_order_lines.uom` bez CHECK (RECON-FACTS P10 / linia 125).
2. **TO z już usuniętymi junction po starym reversal** — wymaga ręcznej korekty lub ponownego ship; guard `invalid_state` zamiast cichego zamknięcia.
3. **`partially_received` w CHECK** — dodany w mig. 337; spójny z kodem.

---

## Pliki w zakresie

- `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/reverse-receive.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/to-conservation.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_components/to-detail-view.tsx`
- `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/[id]/page.tsx`
- Testy pod `transfer-orders/_actions/__tests__/` i `__tests__/`
- `apps/web/i18n/{en,pl,ro,uk}.json` (sekcja `Planning.transferOrders`)
