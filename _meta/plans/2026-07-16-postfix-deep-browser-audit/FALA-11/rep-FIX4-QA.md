# FALA-11 / FIX4-QA — rozdzielenie `missing_spec_parameters` vs `unknown_spec_parameters`

## Problem

Test `inspection-actions.test.ts:848` — *rejects payloads that omit a required active-spec parameter*:

| | |
|---|---|
| Setup | spec = `NIGHT-R16 pH`; zapisane `parameters = [{ name:'Visual', … }]`; `decision:'pass'` |
| Oczekiwane | `{ ok:false, reason:'error', message:'missing_spec_parameters' }` + `signEvent` **nie** wołany |
| Faktyczne (przed fix) | `message:'unknown_spec_parameters'` — bo `Visual` nie jest w spec, a guard sprawdzał `unknown` przed `missing` |

Guard działał (odmowa + brak e-sign), ale operator dostawał zły komunikat: „nieznany parametr" zamiast „nie zmierzyłeś wymaganego pH".

## Root-cause

`validateSpecParameterCompleteness` (FIX2) zwracał `unknown_spec_parameters` dla **każdego** wiersza spoza spec, zanim sprawdził brakujące parametry spec. Gdy ładunek zawierał wyłącznie nazwy spoza aktywnej specyfikacji (stary wiersz `Visual` przy spec tylko z `NIGHT-R16 pH`), błąd „pominięty pomiar" był maskowany przez „nieznana nazwa".

## Fix

| Plik | Zmiana |
|---|---|
| `evaluate-inspection-parameter.ts` → `validateSpecParameterCompleteness` | Oblicz `missing` i `unknown` osobno. Gdy **żaden** wiersz ładunku nie pasuje do spec (`hasSpecMatch === false`) → `missing` ma pierwszeństwo. Gdy co najmniej jeden wiersz pasuje, a inne nie → `unknown` (przemianowany parametr, np. `pH result` przy obecnym `Visual`). Duplikaty nazw → nadal `unknown`. |
| `evaluate-inspection-parameter.test.ts` | Nowy case: spec tylko `NIGHT-R16 pH`, payload `[Visual]` → `missing_spec_parameters` |
| `_meta/i18n-staging/quality-inspections.json` | `detail.esign.submitErrors.missing_spec_parameters` + `unknown_spec_parameters` w **en / pl / ro / uk** |
| `inspections/_components/labels.ts` | Mapowanie `submitErrors` do `InspectionDetailLabels` |
| `inspection-detail.client.tsx` | `formatSubmitDecisionError` — operator widzi przetłumaczony komunikat zamiast surowego kodu |

### Tabela decyzyjna (po fix)

| Sytuacja operatora | Przykład | Kod |
|---|---|---|
| Pominął pomiar wymagany przez spec | spec=`NIGHT-R16 pH`, payload=`[Visual]` (Visual ∉ spec) | `missing_spec_parameters` |
| Przysłał nazwę spoza spec przy częściowo poprawnym ładunku | spec=`NIGHT-R16 pH`+`Visual`, payload=`[pH result, Visual]` | `unknown_spec_parameters` |
| Pominął jeden z wielu wymaganych, reszta OK | spec=`NIGHT-R16 pH`+`Visual`, payload=`[Visual]` | `missing_spec_parameters` |

Oba przypadki nadal kończą się odmową **bez** `signEvent` (`enforceSpecBoundsOnParameters` → early return przed `signEvent` w `submitInspectionDecision`).

## i18n — który katalog?

Moduł inspekcji rozwiązuje etykiety przez `qa-inspections-labels.ts` → **`_meta/i18n-staging/quality-inspections.json`** (nie `apps/web/i18n/*.json`, które jeszcze nie zawierają tego namespace). Klucze dodane we wszystkich czterech locale.

## Dry-run eksportów (przed importem w testach)

```
grep -n "export" evaluate-inspection-parameter.ts
  → validateSpecParameterCompleteness, applySpecBoundsToParameters, …

grep -n "export" inspection-actions.ts
  → submitInspectionDecision, recordInspectionResult, …
```

## Kontrola „czy test przeszedłby bez poprawki"

| Test | Bez fix (unknown→missing z FIX2) | Po fix |
|---|---|---|
| `inspection-actions` omit required param | **FAIL** (`unknown_spec_parameters`) | **PASS** (`missing_spec_parameters`) |
| `evaluate-inspection-parameter` renamed `pH result` | PASS (`unknown`) | PASS (bez zmiany) |
| `evaluate-inspection-parameter` omit `NIGHT-R16 pH` z `Visual` w spec | PASS (`missing`) | PASS (bez zmiany) |
| Nowy unit case `[Visual]` vs spec tylko pH | **FAIL** | **PASS** |

Nowy test unitowy **nie przeszedłby** bez zmiany kolejności — nie jest bezwartościowy.

## Diff stat (ten tor)

```
 apps/web/lib/quality/evaluate-inspection-parameter.ts              | logika missing/unknown
 apps/web/lib/quality/__tests__/evaluate-inspection-parameter.test.ts | +1 case
 _meta/i18n-staging/quality-inspections.json                        | submitErrors × 4 locale
 apps/web/.../inspections/_components/labels.ts                       | submitErrors wiring
 apps/web/.../inspection-detail.client.tsx                            | formatSubmitDecisionError
 _meta/plans/.../FALA-11/rep-FIX4-QA.md                               | ten raport
```

`inspection-actions.test.ts` — **bez zmian** (zgodnie z instrukcją).
