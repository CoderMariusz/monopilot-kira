# FALA 7 / TOR T2 — raport (R07-02, R07-05)

Status: **zaimplementowane**. Testy **napisane, NIE uruchamiane** (bramkę odpala orchestrator).

---

## 1. R07-02 — sześciomiejscowe ilości dają się w pełni przyjąć

Zwężenie do 3 miejsc było w **dwóch** UI (zgodnie ze zwiadem) — oba naprawione tak samo.
Baza i serwer były po 6 miejscach cały czas; nie było czego bronić.

### Jak liczę pozostałą ilość bez `Number`

Nie napisałem nowej arytmetyki — użyłem helperów, które już są w repo
(`apps/web/lib/shared/decimal.ts`, ten sam micro-bigint scale 6, którego używa serwer).

Modal PO (`receive-po-line-modal.tsx`):

```ts
function remaining(line: ReceiveLineSeed): string {
  const rem = toMicro(line.qty) - toMicro(line.receivedQty);
  return rem > 0n ? microToDecimal(rem) : '';
}
```

Ekran magazynowy (`po-receive.client.tsx`):

```ts
function outstandingQty(ordered: string, received: string): string {
  const rem = toMicro(ordered) - toMicro(received);
  return rem > 0n ? microToDecimal(rem) : '0';
}

function lineReceiptStatus(ordered: string, received: string): 'open' | 'partial' | 'full' | 'over' {
  const o = toMicro(ordered);
  const r = toMicro(received);
  if (r <= 0n) return 'open';
  if (r > o) return 'over';
  if (r >= o) return 'full';
  return 'partial';
}
```

`toMicro` parsuje **string → bigint** (1 jednostka = 1 000 000 mikro), więc `12.345600 − 12.345000`
to `12345600n − 12345000n = 600n` → `microToDecimal` → `"0.0006"`. Żadnej wartości nie przepuszczam
przez `Number`, żadnego `toFixed`. Ten sam zabieg objął `wouldOverReceive`
(`toMicro(qty) > toMicro(outstanding)`) i lokalną walidację (`toMicro(trimmedQty) <= 0n`).

Skutki (dokładnie te z audytu):
- prefill `12.345600 kg` → **`12.3456`** (było `12.346`, czyli **więcej niż zamówiono**);
- pozostałe `0.000600` → prefill **`0.0006`** (było `0.001`);
- **prefill z definicji nie może przekroczyć pozostałej ilości** — jest równy dokładnej różnicy,
  a nie jej zaokrągleniu w górę;
- wpisanie `0.0006` przechodzi (było fałszywe `Enter a quantity greater than zero.` dla wartości > 0);
- linia domyka się do `full` co do ostatniego mikro (`lineReceiptStatus` porównuje bigint,
  więc pełne przyjęcie nie zostaje „partial" przez float).

### Wzorzec ilości — jedno źródło zamiast dwóch dryfujących kopii

Root cause tego buga to nie sam regex, tylko **dwie prywatne kopie** wzorca, które odjechały od
kolumny i od serwera (do tego z nieaktualnym komentarzem „mirrors the line modal's qty pattern" —
modal linii `create-po-modal.tsx:193` ma **6 miejsc**). Dlatego wzorzec wylądował raz, obok
helperów, których używa serwer:

```ts
// apps/web/lib/shared/decimal.ts
export const DECIMAL_QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
```

Jest **znak w znak** ten sam co serwerowy `parseDecimal`
(`lib/warehouse/receive-po-line-core.ts:836`) — odrzuca `01.5`, `.5`, `1.`, znak i >6 miejsc.
Formularz nie może już przyjąć wartości, którą serwer odrzuci, ani odrzucić takiej, którą by przyjął.
Serwera **nie tknąłem**.

### Nazwana odmowa nadmiarowego przyjęcia (to samo „Something went wrong")

Przyczyna okazała się tą samą chorobą co R07-05, nie osobnym bugiem:
`warehouse/_actions/receive-po-line.ts:54` ustawia `requireOverReceiveConfirm: true`
**bezwarunkowo**, a modal PO nigdy nie wysyła `confirmOverReceive` — więc **każde** nadprzyjęcie
z ekranu PO wraca jako `over_receive_confirm_required`. Tego klucza **nie było**
w `ReceivePoLineLabels.errors`, więc dynamiczna mapa nie trafiała i leciał generyczny
„Something went wrong receiving. Please retry.". Klucz dodany do kontraktu i do 4 bundli;
komunikat mówi prawdę (przyjęcie > pozostałej ilości) i kieruje tam, gdzie nadprzyjęcie da się
potwierdzić (Magazyn → Przyjęcie ZZ). Checkboxa do modala PO **nie dokładałem** — to decyzja
produktowa, nie naprawa buga.

---

## 2. R07-05 — `wac_unresolved_uom` nazwany, nie zamaskowany

Klucz dodany do: obu kontraktów etykiet, obu stron budujących labels, bundla magazynowego (en+pl)
i **wszystkich czterech** bundli locale. Komunikat **nazywa item i UoM**, mówi czego brakuje
w danych podstawowych i **wprost mówi, że ponawianie nie pomoże**:

> Receipt is blocked: {item} has no unit conversion defined for {uom}, so this receipt can't be
> valued. Add a conversion for {uom} (or set the item's base unit) in the item's master data —
> retrying will not help until that is fixed.

`{item}`/`{uom}` interpolowane są w kliencie z linii, którą użytkownik właśnie wysłał (serwer nie
zwraca payloadu przy `ok:false`). Interpolacja jest bezwarunkowa dla wszystkich komunikatów — dla
pozostałych to no-op, więc nie ma tu gałęzi specjalnej.

### Dowód osiągalności (ścieżka od danych do renderu)

1. **Warunek w danych:** linia PO z `unit_price > 0` i itemem, którego UoM nie da się przeliczyć
   na kg — `resolveWacDeltaQtyKg` zwraca `resolved: false`.
2. **Rzut:** `lib/finance/book-receipt-wac.ts:168` →
   `throw new BookReceiptWacError('unresolved_uom', { uom, qty })`, wewnątrz `assertWacUomResolvable`.
3. **Kiedy:** wołane z `preflightReceiptWacResolvability` (`:64→:72`), wpiętego jako
   `preflightBeforeReceiptWrites` (`receive-po-line.ts:55`) — czyli **przed** zapisami GRN/LP.
   Słowo „blocked" w komunikacie jest dosłownie prawdziwe: nic się nie zapisuje.
4. **Propagacja:** `withOrgContext` robi `rollback` i **re-throw** oryginalnego błędu
   (`lib/auth/with-org-context.ts:361-365`, komentarz :308 „the original error is always re-thrown").
5. **Mapowanie:** `receive-po-line.ts:103-105` łapie `BookReceiptWacError` z `code === 'unresolved_uom'`
   i zwraca `{ ok:false, error:'wac_unresolved_uom' }` — **przed** generycznym
   `console.error(...) → { error:'error' }` (:113-114), więc nie jest połykane.
6. **Render:** w obu klientach `if (!result.ok)` → `labels.errors[result.error]` → interpolacja
   `{item}`/`{uom}` → `setFormError` → `<div role="alert" data-testid="po-receive-error">`.

Ogniwem, które było przerwane, był **wyłącznie krok 6** (brak klucza → fallback). Kroki 1-5 działały
i działają bez zmian — niczego po stronie serwera nie ruszałem.

### Rzutowanie usunięte

`as Record<string, string>` (`receive-po-line-modal.tsx:190-191`) **usunięte**, a kontrakty etykiet
przepisane na typ zamknięty:

```ts
errors: Record<DesktopReceiveError, string> & { qtyRequired: string };
```

To samo w `PoReceiveLabels` (było gołe `Record<string, string>` — ta sama dziura, inny plik).
Od teraz brak klucza to **błąd typecheck**, nie cichy fallback. Efekt uboczny natychmiastowy:
typ wymusił uzupełnienie `over_receive_confirm_required`, `location_inactive` i `invalid_state`,
których brakowało w fixture testowym i w stronie magazynowej.

---

## 3. Zmienione pliki

| Plik | Co |
|---|---|
| `apps/web/lib/shared/decimal.ts` | + `DECIMAL_QTY_RE` (kopia serwerowego `parseDecimal`) |
| `.../planning/purchase-orders/_components/receive-po-line-modal.tsx` | 6 miejsc, exact `remaining()`, typ etykiet, usunięty cast, interpolacja `{item}`/`{uom}` |
| `.../warehouse/receive-po/[poId]/_components/po-receive.client.tsx` | j.w. + exact `outstandingQty`/`lineReceiptStatus`/`wouldOverReceive` |
| `.../planning/purchase-orders/[id]/page.tsx` | + `over_receive_confirm_required`, `wac_unresolved_uom` |
| `.../warehouse/receive-po/[poId]/page.tsx` | + `invalid_state`, `wac_unresolved_uom` |
| `.../warehouse/receive-po/wh-receive-labels.ts` | + oba klucze w bundlu en i pl |
| `apps/web/i18n/{en,pl,ro,uk}.json` | + `over_receive_confirm_required`, `wac_unresolved_uom` (4/4, JSON zwalidowany, 13 kluczy w każdym) |
| `.../purchase-orders/__tests__/po-receive-line.test.tsx` | fixture + 7 nowych testów |
| `.../receive-po/[poId]/_components/__tests__/po-receive-client.test.tsx` | **nowy** — 6 testów drugiego UI |

Plików z listy „NIE DOTYKAJ" nie ruszałem.

## 4. Testy (napisane, nieuruchomione)

Pokrywają wszystkie cztery pozycje z briefu, dla **obu** UI:
prefill `12.345600` → `12.3456` (nigdy > pozostałej); prefill i przyjęcie dokładnego `0.0006`
przy pozostałych `0.000600` + brak alertu + domknięcie linii do `full`; odrzucenie 7. miejsca
i kształtów odrzucanych przez serwer (`01.5`, `.5`, `1.`); nadmiarowe przyjęcie → **nazwana**
odmowa z asercją `not.toHaveTextContent('save failed')`; `wac_unresolved_uom` → alert
zawierający `RM-001`, `kg`, „master data", bez „Please retry" i bez surowych `{item}`/`{uom}`.

---

## 5. Zgłoszenia i czego NIE jestem pewien

**Cap 110% — potwierdzam obserwację ze zwiadu, NIE zmieniałem.**
`receive-po-line-core.ts:145`: `const cap = (ordered * 110n) / 100n` — dzielenie bigint ucina
w dół, więc cap jest zaokrąglany w dół do pełnego mikro (strata < 1 mikro; przy linii 1-mikrowej
cap wychodzi == ordered, czyli nadprzyjęcie jest niemożliwe). Poza tym 110 % jest zahardkodowane —
brak konfiguracji per-org/per-item. Praktycznie nieszkodliwe, ale to decyzja produktowa, nie moja.

**`po-detail-view.tsx:376-378` nadal liczy `receiptOf` przez `Number()`** (plik na liście
„NIE DOTYKAJ"). Dla realnych danych to bezpieczne — obie strony porównania to ten sam dokładny
NUMERIC z bazy, a Postgres sumuje dokładnie, więc równość na floatach wychodzi poprawnie.
Ryzyko istnieje dopiero powyżej ~15 cyfr znaczących (kolumna dopuszcza 18). Nie naprawiałem,
bo poza torem — zgłaszam jako resztkę tej samej klasy.

**Czego nie jestem pewien:**
1. **Nie uruchamiałem niczego** (zakaz z briefu): ani vitest, ani `tsc`, ani builda. Typy zamknięte
   (`Record<DesktopReceiveError, string>`) dotykają 4 miejsc konstruujących etykiety — uzupełniłem
   wszystkie, które znalazłem po `grep 'wac_unsupported_currency:'`, ale **weryfikacja to bramka**.
2. **Fixture testowy w `po-receive-line.test.tsx` nie miał `location_inactive`**, mimo że stary typ
   go wymagał — to sugeruje, że pliki `__tests__` mogą nie wchodzić do projektu typecheck.
   Jeśli tak, zamknięty typ złapie braki w kodzie produkcyjnym, ale niekoniecznie w fixture'ach.
3. **Tłumaczenia ro/uk**: w tej sekcji `en`-owe teksty stoją jako placeholdery dla większości kluczy
   (przetłumaczone jest tylko `wac_unsupported_currency`). Dodałem **realne** tłumaczenia ro/uk
   zamiast kopii angielskiego — jeśli konwencja bundla jest inna (świadome placeholdery do
   późniejszej lokalizacji), to do zamiany; polskie i angielskie są pewne.
4. **Tekst `over_receive_confirm_required` w modalu PO kieruje do ekranu Magazyn → Przyjęcie ZZ.**
   Zakładam, że użytkownik z uprawnieniem `warehouse.grn.receive` ma do niego dostęp — nie
   weryfikowałem tego przez RBAC/nawigację. Alternatywa (checkbox potwierdzenia także w modalu PO)
   to zmiana produktowa, świadomie pominięta.
5. **Nie sprawdzałem E2E** (`apps/web/e2e/planning-po-receive-desktop.spec.ts`) pod kątem asercji
   zakładających 3 miejsca — jeśli bramka tam zaświeci, to najpewniej oczekiwanie prefilla.
