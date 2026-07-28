# FALA-08 / FIX-WAC2 — regresja `toMicro` w ścieżce zapisu produkcji

**Lane:** postfix po bramce regresji WAC / `registerOutput`  
**Autor:** FIX-WAC2  
**Weryfikacja:** orchestrator (zakaz `vitest`/`build` w tej sesji)

---

## Podsumowanie

| ID | Sev | Status | Co zrobiono |
|---|---|---|---|
| WAC2-1 | P0 | ✅ | `toMicro(null \| undefined)` → `0n` zgodnie z kontraktem defensywnym |
| WAC2-2 | P0 | ✅ | `upsert-wac.ts` — `?? '0'` na `base.totalQtyKg` / `base.totalValue` (spójność z `available*`) |
| WAC2-3 | P1 | ✅ | Testy `toMicro(undefined)` / `toMicro(null)` w `decimal.test.ts` |
| WAC2-4 | — | ℹ️ | `parseDecimal` / `microToDecimal` — bez zmian (patrz sekcja Analiza) |

---

## WAC2-1 — Crash `Cannot read properties of undefined (reading 'trim')`

**Stack:**

```
TypeError: Cannot read properties of undefined (reading 'trim')
    at toMicro (apps/web/lib/shared/decimal.ts:35)
    at upsertWac (apps/web/lib/finance/upsert-wac.ts:204)
    at registerOutput (apps/web/lib/production/output/register-output.ts:1129)
```

**Przyczyna:** `upsert-wac.ts:199` ustawia fallback obiektu tylko gdy `rows[0]` jest falsy. Gdy mock (lub niepełny wiersz SQL) zwraca obiekt bez `totalQtyKg` / `totalValue`, `toMicro(undefined)` woła `.trim()` na `undefined`.

**Fix w `apps/web/lib/shared/decimal.ts`:**
- Sygnatura: `toMicro(value: string | number | null | undefined)`.
- Wczesny return `0n` gdy `value == null`.
- Komentarz kontraktu rozszerzony o `null`/`undefined` obok „garbage” i notacji naukowej.

Semantyka dla poprawnych wejść (`string` / `number`) — bez zmian.

---

## WAC2-2 — Defensywa w `upsert-wac.ts`

**Fix:** linie 204–205 — `toMicro(base.totalQtyKg ?? '0')` i `toMicro(base.totalValue ?? '0')`, analogicznie do już istniejących `availableQtyKg ?? '0'` / `availableValue ?? '0'`.

Podwójna ochrona: nawet jeśli inny caller przekaże niepełny wiersz, WAC nie crashuje ścieżki produkcji.

---

## WAC2-3 — Testy

**Plik:** `apps/web/lib/shared/__tests__/decimal.test.ts`

Dopisane w istniejącym bloku „zeroes unparseable input”:

```ts
expect(toMicro(undefined)).toBe(0n);
expect(toMicro(null)).toBe(0n);
```

Istniejące asercje (`'abc'`, `''`, `NaN`, poprawne stringi/liczby) — bez zmian.

---

## Analiza — `parseDecimal` / `microToDecimal`

| Funkcja | Lokalizacja | Werdykt |
|---|---|---|
| `parseDecimal` | `apps/web/lib/warehouse/receive-po-line-core.ts:843` | **Bez zmian** — kontrakt walidacyjny (`string` only); invalid → `throw ReceivePoLineCoreError`, nie defensywny parse. Deleguje do `toMicro` po przejściu regexu. |
| `microToDecimal` | `apps/web/lib/shared/decimal.ts:63` | **Bez zmian** — przyjmuje `bigint` (wynik arytmetyki micro); brak `.trim()` na stringu; `null`/`undefined` to błąd typu u call site, nie „śmieciowy NUMERIC string”. |

---

## Zmienione pliki

```
apps/web/lib/shared/decimal.ts
apps/web/lib/shared/__tests__/decimal.test.ts
apps/web/lib/finance/upsert-wac.ts
```

---

## Komendy dla orchestratora

```bash
pnpm --filter web exec vitest run apps/web/lib/shared/__tests__/decimal.test.ts
pnpm --filter web exec vitest run apps/web/lib/production/output/__tests__/register-output-catch-weight-a1.test.ts
```
