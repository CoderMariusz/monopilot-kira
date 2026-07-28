# FALA 08 / FIX-UI — trzy regresje RTL (expiry, scanner receive-po, LP print)

**Data:** 2026-07-29  
**Kontekst:** Bramka szeregowa wykryła 3 czerwone testy UI, które były zielone przed falą. Zakaz uruchamiania vitest w tej sesji — naprawy na podstawie analizy kodu + struktury DOM.

---

## 1. `expiry-dashboard.test.tsx` — „null batch → em dash"

**Werdykt: za luźny test** (nie defekt komponentu)

**Objaw:** `Found multiple elements with the text: —` przy `within(rowWithoutBatch).getByText(EN.none)`.

**Analiza:** Wiersz `b2` ma `batchNumber: null` **oraz** `status: ''`. Komponent (`expiry-dashboard.client.tsx`) słusznie renderuje `labels.none` (em dash) w **dwóch osobnych kolumnach**:
- kolumna Batch (`row.batchNumber ?? labels.none`, L178),
- kolumna Status (`labels.none` gdy brak statusu LP, L194).

Operator widzi dwa myślniki w jednym wierszu, ale w różnych kolumnach tabeli — to poprawne zachowanie (pusta partia ≠ brak statusu magazynowego). Status QA (`pending`) jest osobnym badge’em (`expiry-qa-b2`).

**Naprawa:** Test zawężony do komórki Batch (`cells[2]` w układzie 8-kolumnowym), status LP nadal asercja przez `expiry-status-b2`.

**Pliki:**
- `warehouse/expiry/_components/__tests__/expiry-dashboard.test.tsx` — asercja batch przez indeks komórki + komentarz

---

## 2. `receive-po-item-screen.test.tsx` — „Purchase order not found." ×2

**Werdykt: defekt komponentu**

**Objaw:** `Found multiple elements with the text: Purchase order not found.`

**Analiza:** `Banner` (`scanner-primitives.tsx` L599–602) renderuje **zarówno** `title`, **jak i** `children` w osobnych węzłach. W `receive-po-item-screen.tsx` stan `not_found` (i analogicznie `denied`, `error`, brak linii) przekazywał **ten sam tekst** w obu slotach:

```tsx
<Banner kind="err" title={L.poNotFound}>{L.poNotFound}</Banner>
```

Operator skanera widział zdublowany komunikat błędu (nagłówek + treść) — realny defekt UX, nie problem testu.

**Naprawa:** Bannery błędów stanu ekranu używają wyłącznie `title` (bez duplikujących `children`). Ten sam wzorzec zastosowany do inline błędu receive (`receive-po-error`).

**Pliki:**
- `scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.tsx` — L257–260, L370–373

---

## 3. `lp-detail.test.tsx` — brak `lp-print-printer-trigger` (3 testy)

**Werdykt: defekt komponentu** (warstwa UI Select, nie modal LP)

**Objaw:** `Unable to find an element by: [data-testid="lp-print-printer-trigger"]` w helperze `selectPrintPrinter()`.

**Analiza:** Modal `lp-print-label-modal.client.tsx` **jest** renderowany (test `lp-print-label-modal` przechodziłby) i zawiera `Select` z drukarkami gdy `sitePrinters.length > 0`. Problem: `@monopilot/ui/Select` — `SelectTrigger` i `SelectItem` **nie przekazywały** `data-testid` na elementy DOM (props były deklarowane w modalu, ale ignorowane przez prymityw). Kombobox był dostępny przez `role="combobox"`, ale kontrakt testowy i obserwowalność modala (oraz scenariusze druku z `printerId`) wymagały jawnych `data-testid`.

Modal sam w sobie jest kompletny: walidacja kopii, wymuszony wybór drukarki po submit (R08-05 / T2-4), `printAction` z `printerId`.

**Naprawa:** `packages/ui/src/Select.tsx` — `SelectTrigger` i `SelectItem` akceptują i emitują `data-testid` na `<button>` / `<div role="option">`.

**Pliki:**
- `packages/ui/src/Select.tsx` — `data-testid` na triggerze i pozycji listy
- (bez zmian w teście — helper `selectPrintPrinter()` pozostaje; testids są teraz realnie w DOM)

---

## Podsumowanie

| # | Ekran | Werdykt | Działanie |
|---|--------|---------|-----------|
| 1 | Expiry dashboard | Za luźny test | Zawężenie asercji do kolumny Batch |
| 2 | Scanner receive PO | Defekt komponentu | Usunięcie zduplikowanego tekstu w `Banner` |
| 3 | LP detail print modal | Defekt komponentu (Select) | Forward `data-testid` w prymitywie Select |

## Testy

Nie uruchamiano (zakaz sesji: vitest / pnpm test / build).
