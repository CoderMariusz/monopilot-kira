# FALA-08 / TOR T4 — rep-FIX-SHELF (postfix po cross-review)

**Lane:** dashboard przydatności (R08-08) + rewizyta przyjętej linii PO (R17-01)  
**Autor:** postfix po recenzji T4  
**Weryfikacja:** orchestrator (zakaz `vitest`/`build` w tej sesji)

---

## Podsumowanie

| ID | Sev | Status | Co zrobiono |
|---|---|---|---|
| T4-1 | P1 | ✅ | `Number()` → `toMicro`/`microToDecimal` w ekranach skanera (wspólny `scanner-po-decimal.ts`) |
| T4-2 | P1 | ✅ | Fetch lokalizacji i guard `destinationRequired` dopiero po załadowaniu PO i tylko w `receiveMode` |
| T4-3 | P1 | ✅ | Anty-regresja zapisu ustawia `poStatus: 'received'`; mock respektuje `OPEN_PO_STATUSES` |
| T4-4 | P2 | ✅ | `lp.qa_status` w SELECT + mapowaniu; filtr statusów rozszerzony o `blocked`; badge QA w UI |
| T4-5 | P2 | ✅ | Lateral join zwraca `receipt_qty`; read-only pokazuje qty ostatniego LP, nie sumę linii |
| T4-6 | P2 | ✅ | Testy dopisane/zaktualizowane zgodnie z raportem T4 (patrz sekcja Testy) |

**Nietknięte:** `OPEN_PO_STATUSES` w `receive-po-line-core.ts` — bez zmian.

---

## T4-1 — Porównanie NUMERIC

**Problem:** `compareDecimal` / `remainingQty` / `overReceive` / `percent` używały `Number()`, co przy `NUMERIC(18,6)` mogło błędnie uznać linię za kompletną (float / utrata precyzji).

**Fix:**
- Nowy moduł `scanner/receive-po/_components/scanner-po-decimal.ts` — `compareDecimal`, `remainingQty`, `receiptPercent` na `toMicro`/`microToDecimal` z `apps/web/lib/shared/decimal.ts`.
- `receive-po-item-screen.tsx` — import helpers + `toMicro` dla over-receive.
- `receive-po-lines-screen.tsx` — import helpers, usunięte lokalne `Number()` helpers.

---

## T4-2 — Guard lokalizacji za wcześnie

**Problem:** `useEffect` na `/api/warehouse/scanner/location` startował przy `alreadyReceived === false` zanim PO się załadowało; test rewizyty oczekiwał braku fetcha lokalizacji, a efekt już leciał. `destinationRequired` blokował Receive w trakcie ładowania PO (brak kontekstu linii).

**Fix w `receive-po-item-screen.tsx`:**
- `poLoaded`, `receiveMode = poLoaded && line && !readOnlyReceipt`.
- Fetch lokalizacji: `if (!ready || !session || !receiveMode) return`.
- `destinationRequired` tylko gdy `receiveMode` (nie podczas load PO / read-only).

---

## T4-3 — Anty-regresja zapisu na `received`

**Problem:** Test używał `lineMissing: true` — symulował brak wiersza, nie zamknięte PO. Przechodziłby też po zakomentowaniu guardu `po.status = any(OPEN_PO_STATUSES)` w `loadLineForUpdate`, bo mock i tak zwracał pusty wynik niezależnie od statusu.

**Fix:**
- `makeReceiveClient` przyjmuje `poStatus`; mock `purchase_order_lines` zwraca wiersz **tylko** gdy `params[2]` (statusy) zawiera `poStatus`.
- Test ustawia `poStatus: 'received'` (poza `OPEN_PO_STATUSES`), wywołuje `receiveScannerPoLine`, asertuje `po_line_not_found` + brak `insert into license_plates`.

**Dlaczego teraz nie przejdzie bez guardu:** Gdyby `OPEN_PO_STATUSES` obejmowało `'received'` lub WHERE był usunięty, mock zwróciłby linię (`confirmed` default / `received` w zbiorze), `executeReceivePoLineCore` poszedłby dalej i test zobaczyłby insert LP — FAIL. Obecny test jest sprzężony z rzeczywistą bramką statusu PO.

---

## T4-4 — QA status na dashboardzie przydatności

**Fix:**
- `expiry-actions.ts`: `lp.qa_status` w SELECT; filtr `lp.status in (..., 'blocked')`.
- `shared.ts` `ExpiryDashboard`: pole `qaStatus`.
- `expiry/page.tsx` + `expiry-dashboard.client.tsx`: badge QA obok statusu LP.
- `_meta/i18n-staging/warehouse-d.json`: `expiryPage.qaStatus.*` (en/pl).

---

## T4-5 — Suma przyjęć na ostatnim LP

**Problem:** Read-only revisit pokazywał `line.receivedQty` (suma `grn_items`) przy `receiptLpNumber` z ostatniego LP.

**Fix:**
- `receive-po.ts` lateral join: `gi.received_qty::text as receipt_qty`.
- Typ `ScannerPoLine.receiptLpQty`; mapowanie `receiptLpQty`.
- `receive-po-item-screen.tsx` read-only: `{line.receiptLpQty ?? line.receivedQty}`.

---

## T4-6 — Testy vs raport T4

Raport T4 deklarował testy „written, not run”. Po postfixie:

| Plik testu | Stan |
|---|---|
| `warehouse/_actions/expiry-actions.test.ts` | ✅ rozszerzony (qa_status, blocked w filtrze) |
| `expiry/_components/__tests__/expiry-dashboard.test.tsx` | ✅ badge QA + batch/status |
| `lib/warehouse/scanner/receive-po.test.ts` | ✅ lookup + write-path `received` + `receiptLpQty` |
| `receive-po-item-screen.test.tsx` | ✅ revisit LP qty + brak fetch lokalizacji |

---

## Zmienione pliki

```
apps/web/app/[locale]/(scanner)/scanner/receive-po/_components/scanner-po-decimal.ts (new)
apps/web/app/[locale]/(scanner)/scanner/receive-po/_components/types.ts
apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/_components/receive-po-lines-screen.tsx
apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.tsx
apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.test.tsx
apps/web/lib/warehouse/scanner/receive-po.ts
apps/web/lib/warehouse/scanner/receive-po.test.ts
apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/expiry-actions.ts
apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/expiry-actions.test.ts
apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/shared.ts
apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/page.tsx
apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/_components/expiry-dashboard.client.tsx
apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/_components/__tests__/expiry-dashboard.test.tsx
_meta/i18n-staging/warehouse-d.json
```

---

## Komendy dla orchestratora

```bash
pnpm --filter web exec vitest run apps/web/app/\[locale\]/\(app\)/\(modules\)/warehouse/_actions/expiry-actions.test.ts
pnpm --filter web exec vitest run --config vitest.ui.config.ts "apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/_components/__tests__/expiry-dashboard.test.tsx"
pnpm --filter web exec vitest run apps/web/lib/warehouse/scanner/receive-po.test.ts
pnpm --filter web exec vitest run --config vitest.ui.config.ts "apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.test.tsx"
```
