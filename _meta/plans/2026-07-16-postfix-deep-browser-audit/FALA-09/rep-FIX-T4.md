# FALA-09 / Tor T4 — cross-review FIX round

## [P1] Guard pozwala zamknąć TO jako `received` mimo short line bez junction

**NAPRAWIONE** — `actions.ts` ~1367–1380

Guard `shortWithoutAllocation` był owinięty w `if (!anyPending)`, więc przy linii A short (received=4, pending=0) i linii B z pending=5 anulowanie B omijało kontrolę A. Warunek przeniesiony przed ścieżkę cancel — odrzuca każdą linię z `receivedMicro < lineMicro && pendingMicro === 0n`, niezależnie od pending innych linii. Legalny cancel remainder (received=6, pending=6, line=12) nadal przechodzi, bo pending pokrywa brak.

## [P1] Anulowanie TO z konwersją UoM przywraca ilość junction bez przeliczenia do UoM LP

**NAPRAWIONE** — `actions.ts` ~1208–1310

`cancelInTransitTransferOrder` joinuje `transfer_order_lines` + `items`, pobiera `lp.uom`, przelicza `junction qty` → base micro-6 → `restoreLpMicro` w UoM LP przez `qtyToBaseMicro6` / `baseMicro6ToQty`. Agregacja i `stock_moves` używają `lpUom`. Niekonwertowalna para rzuca `TransferOrderConservationError` przed zapisem.

## [P1] Test anulowania reszty deterministycznie czerwony

**NAPRAWIONE** — `actions.test.ts` ~192–220, ~312–318

- Mock junction cancel zwraca `qty: linePendingQty` (6, nie 12).
- `DELETE FROM transfer_order_line_lps` ustawia `remainderCancelled = true`, żeby drugi odczyt `loadTransferOrderLineReceiveState` zwracał pending=0 i status `received`.
- Mock matter balance (`mockMatterOnHand` / `mockMatterInTransit`) utrzymuje stałą sumę onHand+inTransit przez receive/cancel.

## [P1] Test etykiety bez kluczy i18n w staging

**NAPRAWIONE** — `_meta/i18n-staging/transfer-orders.json` (en + pl)

Dodano `cancelRemainder` i `confirmCancelRemainder` w `detail.transitions` — test RTL czyta staging bundle.

## [P2] Reversal blokuje status źródłowego LP mimo braku kredytu source

**NAPRAWIONE** — `reverse-receive.ts` ~459–465 (usunięty guard `SOURCE_REVERSE_BLOCKED_STATUSES`)

Reversal po PF-R10-02 dotyka tylko destination LP i junction (`dest_lp_id = NULL`). Status source LP (consumed/destroyed) nie wpływa na materializację reszty. Testy `reverse-receive.test.ts` zaktualizowane: consumed/destroyed → `ok: true`, brak UPDATE source LP.

## [P2] Ukraiński locale bez nowych kluczy

**NAPRAWIONE** — `apps/web/i18n/uk.json` ~8348

Dodano `cancelRemainder` i `confirmCancelRemainder` (spójne z en/pl/ro).

## [P2] Test PF-R10-02 nie sprawdza podłączenia guarda do Server Action

**NAPRAWIONE** — `actions.test.ts` — nowy test `refuses receive when a line is short-received with no pending junction (PF-R10-02)`

Wywołuje `transitionTransferOrderStatus(…, 'received')` z received=6, pending=0, line=12 → `ok: false`, `error: 'invalid_state'`, message zawiera `not fully received`. Usunięcie `assertAllLinesFullyReceived` z `receiveTransferOrder` złamałoby ten test.

---

## Pliki zmienione

| Plik | Zmiana |
|------|--------|
| `transfer-orders/_actions/actions.ts` | UoM cancel restore; guard short line |
| `transfer-orders/_actions/reverse-receive.ts` | Usunięty blok source consumed/destroyed |
| `transfer-orders/_actions/actions.test.ts` | Mocki cancel/receive/conservation; test PF-R10-02 action |
| `transfer-orders/_actions/__tests__/reverse-receive.test.ts` | consumed/destroyed → legal reversal |
| `_meta/i18n-staging/transfer-orders.json` | cancelRemainder keys |
| `apps/web/i18n/uk.json` | cancelRemainder keys |

## Świadomie poza tym torrem

- `ship-mixed-uom.test.ts` — naprawiony w tej samej rundzie bramki (patrz `rep-FIX-TO.md`); tor T3 origin, ale czerwony test blokował bramkę TO.
