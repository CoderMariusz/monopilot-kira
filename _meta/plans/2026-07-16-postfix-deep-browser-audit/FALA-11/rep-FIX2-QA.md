# FALA-11 / FIX2-QA — fail-closed guard zawężony do werdyktu

## Problem

`enforceSpecBoundsOnParameters` wołał `validateSpecParameterCompleteness` przy **każdym** `recordInspectionResult` i `submitInspectionDecision`. Skutek:

- zapis wyniku z parametrem spoza szablonu spec (np. `Temperature` przy aktywnym spec `Visual`) → `{ ok:false, reason:'error' }` zamiast legalnego zapisu;
- `decision=hold` z pustymi `parameters` przy aktywnym spec → odmowa mimo że hold nie wymaga kompletności;
- test jednostkowy `rejects renamed or unknown parameters` dostawał `missing_spec_parameters` zamiast `unknown_spec_parameters` (kolejność sprawdzeń).

## Root-cause fix

| Plik | Zmiana | Dlaczego |
|---|---|---|
| `inspection-actions.ts` → `enforceSpecBoundsOnParameters` | Flaga `requireSpecCompleteness`: `true` tylko gdy `decision === 'pass'`; inaczej tylko `applySpecBoundsToParameters` na **dopasowanych** nazwach spec | Kompletność (brakujący / nieznany parametr) jest wymagana do **werdyktu PASS**, nie do zapisu cząstkowego ani hold/fail |
| `inspection-actions.ts` → `recordInspectionResult` | `requireSpecCompleteness: false` | Operator może zapisać dowolne wiersze; granice numeryczne nadal egzekwowane dla parametrów obecnych w spec |
| `inspection-actions.ts` → `submitInspectionDecision` | `requireSpecCompleteness: parsed.decision === 'pass'` | Hold/fail nie blokowane przez brak pełnego pokrycia spec |
| `evaluate-inspection-parameter.ts` → `validateSpecParameterCompleteness` | Sprawdzenie `unknown` **przed** `missing` | Przemianowany parametr (`pH result` vs `NIGHT-R16 pH`) zwraca `unknown_spec_parameters` — sygnał fail-closed z audytu Fali |

## Testy — co by padło bez poprawki / co zaktualizowano

| Plik | Test | Mechanizm |
|---|---|---|
| `quality/__tests__/inspection-actions.test.ts` | *records parameter results…* | Bez zawężenia guarda: `Temperature` vs spec `Visual` → completeness error |
| `quality/__tests__/inspection-actions.test.ts` | *submits hold decisions…* | Mock `select qi.id::text…for update` dodany; bez `requireSpecCompleteness:false` na hold → odmowa przy pustych parametrach + spec |
| `evaluate-inspection-parameter.test.ts` | *rejects renamed or unknown parameters…* | Kolejność unknown→missing; bez zmiany test nadal byłby czerwony (zły `reason`) |
| `_actions/__tests__/inspection-actions.test.ts` | paginacja + filtr `page2only` | `expectedListItem()` — pełne 12 pól `InspectionListRow` zamiast samego `inspectionNumber` |
| `_actions/__tests__/inspection-actions.test.ts` | *rejects payloads that omit…* | Przeniesiony na `submitInspectionDecision({ decision:'pass' })` — completeness przy werdykcie, nie przy record |
| `_actions/__tests__/inspection-actions.test.ts` | *persists pass=false when actual is out of spec* | Wejście `pass:false` (nie koliduje z testem odrzucenia `pass:true` + OOS) |

### Kontrola „bez guarda test by nie padł”

`evaluate-inspection-parameter.test.ts` → *rejects renamed or unknown parameters when an active spec exists*:

- **Z guardem (validateSpecParameterCompleteness):** `{ ok:false, reason:'unknown_spec_parameters', names:['pH result'] }` ✓
- **Bez guarda (gdyby usunąć wywołanie):** `{ ok:true }` — test **by padł** → ochrona zachowana.

## Dry-run eksportów (przed importem w testach)

```
grep -n "export" evaluate-inspection-parameter.ts  → validateSpecParameterCompleteness, applySpecBoundsToParameters, …
grep -n "export" inspection-actions.ts              → recordInspectionResult, submitInspectionDecision, listInspections, …
```

## Świadomie NIE ruszone

- Egzekwowanie `parameter_out_of_spec` przy `recordInspectionResult` gdy klient wysyła `pass:true` dla pomiaru poza granicami spec (test PF-R16-01) — bez zmian.
- `ambiguous_active_spec` — nadal blokuje wszystkie ścieżki z aktywnym spec.
- Migracje / i18n / UI inspekcji.

## Diff stat (ten tor)

```
 apps/web/lib/quality/evaluate-inspection-parameter.ts          | kolejność unknown/missing
 apps/web/.../quality/_actions/inspection-actions.ts            | requireSpecCompleteness
 apps/web/.../quality/__tests__/inspection-actions.test.ts      | mock FOR UPDATE
 apps/web/.../quality/_actions/__tests__/inspection-actions.test.ts | expectedListItem + werdykt PASS
```
