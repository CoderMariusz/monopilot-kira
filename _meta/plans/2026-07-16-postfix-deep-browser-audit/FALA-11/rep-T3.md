# FALA-11 / TOR T3 — Raport (jakość: komunikaty UI)

## Źródło zadań

- PF-R16-05 — pusty wynik inspekcji pokazuje surowy JSON Zod
- PF-R16-06 — zamknięty NCR powtarza komunikat o podpisie SHA-256

## Katalog tłumaczeń

Ekrany jakości (inspekcje + NCR) **nie** czytają z `apps/web/i18n/` ani `apps/web/messages/`. Używają staged bundle:

- `_meta/i18n-staging/quality-inspections.json` → `qa-inspections-labels.ts`
- `_meta/i18n-staging/quality-ncrs.json` → `qa-ncrs-labels.ts`

Zmiany i18n wprowadzono wyłącznie w staged bundle + rozszerzono loadery o `ro`/`uk` (fallback na `en` dla pozostałych kluczy).

---

## PF-R16-05 — surowy JSON walidacji przy pustym wyniku

### Przyczyna źródłowa

1. `recordInspectionResult` wywoływał `recordSchema.parse()` i w `catch` zwracał `err.message` — dla `ZodError` to serializowany tablicowy JSON issue (`code`, `path`, `origin`…).
2. Klient (`inspection-detail.client.tsx`) wstawiał ten tekst wprost do szablonu `saveError: "Could not save results: {message}"`.

To nie był problem wyświetlacza — serwer wysyłał wewnętrzny format walidacji jako `message`.

### Zmiany

| Plik | Linia (ok.) | Co i dlaczego |
|------|-------------|---------------|
| `quality/_actions/inspection-actions.ts` | ~190–207, 1073–1076 | `safeParse` + `mapRecordInspectionValidationCode()` → stabilne kody (`actual_required`, `parameters_required`, …) zamiast `ZodError.message` |
| `inspections/[inspectionId]/_components/inspection-detail.client.tsx` | ~85–88, 156–168, 227 | `formatRecordSaveError()` mapuje kody na etykiety; guard przed surowym JSON (`"code"`, `"path"`, `[`) |
| `inspections/_components/labels.ts` | ~154–159 | Eksport `saveErrors.actualRequired` / `parametersRequired` |
| `_meta/i18n-staging/quality-inspections.json` | en/pl/ro/uk `detail.params` | Komunikaty operatorskie we wszystkich 4 językach; `saveError` bez `{message}` |
| `qa-inspections-labels.ts` | ~23–30, 48–50 | Obsługa locale `ro`/`uk` |

### Testy dodane

| Plik | Test | Co by go wywróciło bez poprawki |
|------|------|----------------------------------|
| `quality/__tests__/inspection-actions.test.ts` | `rejects blank actual values with a stable validation code…` | Gdyby akcja nadal zwracała `ZodError.message`, asercja `message: 'actual_required'` i brak `"too_small"`/`"path"` padłyby |
| `inspections/_components/__tests__/inspections.test.tsx` | `shows a friendly message instead of raw Zod JSON…` | Gdyby klient interpolował surowy kod/JSON, alert zawierałby `too_small` lub `"code"` zamiast `saveErrors.actualRequired` |

Testów **nie uruchamiano** (zakaz orchestratora).

---

## PF-R16-06 — podwójny komunikat SHA-256 na zamkniętym NCR

### Przyczyna źródłowa

`detail.closedBanner` w staging bundle **już zawierał** tekst „SHA-256 signature stored.”, a `ncr-detail.client.tsx:243–244` doklejał `closedBannerSigned` gdy `closureSignatureHash` istnieje → ten sam komunikat dwa razy.

### Zmiany

| Plik | Linia (ok.) | Co i dlaczego |
|------|-------------|---------------|
| `_meta/i18n-staging/quality-ncrs.json` | en/pl `detail.closedBanner` | Usunięto fragment o SHA-256 z głównego banera |
| `_meta/i18n-staging/quality-ncrs.json` | en/pl/ro/uk `detail.closedBannerSigned` | Osobny klucz tylko dla przypadku z hashem podpisu |
| `qa-ncrs-labels.ts` | ~23–30, 48–50 | Obsługa locale `ro`/`uk` |

Komponent `ncr-detail.client.tsx` **bez zmian** — logika warunkowa była poprawna; błąd leżał w treści tłumaczenia.

Istniejący test `CLOSED NCR is immutable: shows the signed banner only when a receipt hash exists` (`ncrs.test.tsx:473–501`) weryfikuje ten kontrakt.

---

## Świadomie NIE ruszono

| Obszar | Powód |
|--------|-------|
| `recordInspectionResult` → `enforceSpecBoundsOnParameters` (PF-R16-01) | Inny tor / logika serwerowa |
| `submitInspectionDecision`, tworzenie hold/NCR (PF-R16-02) | Inny tor |
| Formularz tworzenia NCR / linki (PF-R16-03) | Inny tor |
| Odświeżanie stanu po zamknięciu NCR (PF-R16-04) | Inny tor |
| `apps/web/i18n/*.json`, `apps/web/messages/**` | Moduł jakości nie korzysta z tych katalogów dla tych ekranów |
| `rootCauseHelp` („Required before close”) na zamkniętym NCR | Poza zakresem PF-R16-06 (raport dotyczy duplikatu SHA-256, nie tego help-textu) |

---

## Znaleziska poza zakresem (ta sama klasa błędu: surowy `message` w UI)

Wzorzec `.replace('{message}', result.message ?? result.reason)` bez mapowania kodów — ryzyko wycieku JSON/kodów wewnętrznych:

| Plik | Kontekst |
|------|----------|
| `inspection-detail.client.tsx:~619` | Błąd e-sign decyzji (`detail.esign.error`) |
| `ncr-detail.client.tsx:177` | Błąd zapisu analizy (`investigation.error`) |
| `ncr-create-modal.client.tsx:148` | Tworzenie NCR |
| `ncr-close-modal.client.tsx` | Częściowo mapuje `policy` — inne kody nadal verbatim |
| `spec-create-modal.client.tsx:246` | Tworzenie specyfikacji |
| `spec-detail.client.tsx:173,186` | Submit/supersede spec |
| `spec-sign-modal.client.tsx:100` | Podpis spec |
| `spec-param-row-actions.client.tsx:261,276` | Edycja parametrów spec |
| `hold-create-modal.client.tsx:282` | Tworzenie hold |
| `hold-release-modal.client.tsx` | Częściowo mapuje `policy` |
| `ccp-record-modal.client.tsx:110` | Zapis odczytu CCP |
| `ccp-create-modal.client.tsx:130` | Tworzenie CCP |
| `deviation-resolve-modal.client.tsx:89` | Rozwiązanie odchylenia CCP |
| `haccp/*-modal.client.tsx`, `plan-list.client.tsx` | Plany HACCP |
| `inspection-create-modal.client.tsx:110` | Create — mapuje tylko `siteErrors`, reszta verbatim |

**Uwaga:** `inspection-create-modal` ma wzorzec `formatCreateError` dla kodów site — dobry wzór do replikacji w pozostałych modalach.

---

## Pliki zmienione (podsumowanie)

```
apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts
apps/web/app/[locale]/(app)/(modules)/quality/inspections/[inspectionId]/_components/inspection-detail.client.tsx
apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/labels.ts
apps/web/app/[locale]/(app)/(modules)/quality/qa-inspections-labels.ts
apps/web/app/[locale]/(app)/(modules)/quality/qa-ncrs-labels.ts
_meta/i18n-staging/quality-inspections.json
_meta/i18n-staging/quality-ncrs.json
apps/web/app/[locale]/(app)/(modules)/quality/__tests__/inspection-actions.test.ts
apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/__tests__/inspections.test.tsx
_meta/plans/2026-07-16-postfix-deep-browser-audit/FALA-11/rep-T3.md
```
