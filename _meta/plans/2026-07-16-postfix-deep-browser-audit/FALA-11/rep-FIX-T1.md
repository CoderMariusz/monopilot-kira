# FALA-11 / TOR T1 — raport FIX (PF-R16-01 + PF-R16-02)

**Data:** 2026-07-29  
**Recenzja wejściowa:** `out-rev-t1.md` (6× P1 FIX-FIRST)

---

## Zmiany i przyczyna źródłowa

### P1-1 — Porównanie dziesiętne zapisywało OOS jako PASS

| Plik | Co / dlaczego |
|---|---|
| `apps/web/lib/shared/decimal.ts:129-165` | Dodano `compareDecimalStrings()` — pełna precyzja string→bigint, bez `Number()` i bez 6dp `toMicro()` truncation. |
| `apps/web/lib/quality/evaluate-inspection-parameter.ts:24-48` | `isWithinSpecBounds` używa `compareDecimalStrings` + `DECIMAL_QTY_RE`; nienumeryczny `actual` → **fail** (nie `0n`). |
| **Decyzja granic:** **włączne (inclusive)** — wartość równa `min` lub `max` przechodzi; `5.5001` przy `max=5.5000` → fail; `5.5000` przy `max=5.5000` → pass. |

### P1-2 — FAIL-OPEN: pominięty parametr omijał guard

| Plik | Co / dlaczego |
|---|---|
| `apps/web/lib/quality/evaluate-inspection-parameter.ts:63-99` | `validateSpecParameterCompleteness()` — każdy parametr aktywnej specyfikacji musi być w payloadzie (dokładna nazwa po normalizacji); nieznane nazwy odrzucane. |
| `inspection-actions.ts:489-521` | `enforceSpecBoundsOnParameters` woła completeness **przed** derivacją; zwraca `missing_spec_parameters` / `unknown_spec_parameters`. |

### P1-3 — Kontrole final/in-process używały tylko incoming

| Plik | Co / dlaczego |
|---|---|
| `resolve-inspection-parameters.ts:52-57, 98-143` | `specAppliesToCandidates()`: `lp`/`grn` → `incoming,all`; `wo_output` → `final,in_process,all`. SQL filtruje `applies_to = any($2::text[])`. |
| `inspection-actions.ts:457-481` | `resolveInspectionContext` przekazuje `reference_type` do loadera granic. |

### P1-4 — Wiele aktywnych specyfikacji → arbitralny werdykt

| Plik | Co / dlaczego |
|---|---|
| `resolve-inspection-parameters.ts:98-143` | CTE `winner`: deterministyczny wybór `version DESC, effective_from DESC NULLS LAST, id DESC`. Jeśli `tied_spec_count > 1` (ta sama wersja + effective_from) → `ambiguous_active_spec` (odmowa, nie zgadywanie). |

### P1-5 — Podpisany Fail WO output nie tworzył blokady/NCR

| Plik | Co / dlaczego |
|---|---|
| `inspection-actions.ts:546-607` | Gałąź `wo_output` + `decision=fail`: `transitionWoOutputQaForContext(FAILED)` **po** `signEvent`, potem `createInspectionHoldIfMissing` na powiązanym LP + `createInspectionFailureNcrIfMissing`. |

### P1-6 — Blokada fałszowała ilość/jednostkę LP

| Plik | Co / dlaczego |
|---|---|
| `apps/web/lib/quality/lp-hold-qty.ts` | `resolveLpQtyHeldKg()`: catch-weight → `catch_weight_kg`; kg → quantity obcięte do 3dp (`formatDecimalString`, bez zaokrąglenia w górę); pcs/each bez catch-weight → `null` (nie zapisuje 100 pcs jako 100 kg). |
| `hold-actions.ts:330-361` | `createHoldCore` używa helpera zamiast surowego `lp.quantity`. |

### Dodatkowe

| Plik | Co |
|---|---|
| `inspection-actions.ts:1233-1239` | Kolejność guardów: `inspection_parameters_required` przed `allParametersPass([])`. |

---

## Testy dodane / poprawione

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `lib/quality/__tests__/evaluate-inspection-parameter.test.ts` | `0.000050` > `0.000049` → fail; `abc` → fail; completeness missing/unknown | `toMicro()` truncation / coercion to `0n` |
| `lib/quality/__tests__/lp-hold-qty.test.ts` | catch-weight, truncate 1.234567→1.234, pcs→null | surowe `lp.quantity` w hold |
| `quality/_actions/__tests__/inspection-actions.test.ts` | OOS+pass:true zapisuje pass:false; sub-micro OOS reject; missing param; WO fail→hold+NCR; offset w paginacji | stary `toMicro` guard; wo_output fail no-op |
| `lib/quality/__tests__/resolve-inspection-parameters.test.ts` | `applies_to = any($2::text[])` bind | stały `incoming` filter |

Importy zweryfikowane grep-em: `compareDecimalStrings`, `resolveLpQtyHeldKg`, `validateSpecParameterCompleteness`, `recordInspectionResult`.

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `app/api/quality/scanner/inspect/route.ts` | Osobna ścieżka fast-path; poza repro PF-R16-02 desktop |
| Migracja `538-*.sql` | Werdykt w akcji serwerowej; brak zmiany schematu |
| UI `inspection-detail.client.tsx` | Granica zaufania = serwer |
| Scanner hold qty (`route.ts:70-81`) | Ten sam wzorzec co stary `hold-actions`; backlog — poza minimalnym fixem `createHoldCore` |

---

## Znaleziska poza zakresem

| ID | Opis |
|---|---|
| Scanner inspect | `route.ts` nadal mapuje `quantity`→`qty_held_kg` bez `resolveLpQtyHeldKg` |
| PF-R16-03..06 | Inne tory Fali 11 (NCR UI, stale detail, i18n) |

---

## Pliki zmienione

```
apps/web/lib/shared/decimal.ts
apps/web/lib/quality/evaluate-inspection-parameter.ts
apps/web/lib/quality/resolve-inspection-parameters.ts
apps/web/lib/quality/lp-hold-qty.ts
apps/web/lib/quality/__tests__/evaluate-inspection-parameter.test.ts
apps/web/lib/quality/__tests__/lp-hold-qty.test.ts
apps/web/lib/quality/__tests__/resolve-inspection-parameters.test.ts
apps/web/app/.../quality/_actions/inspection-actions.ts
apps/web/app/.../quality/_actions/hold-actions.ts
apps/web/app/.../quality/_actions/__tests__/inspection-actions.test.ts
apps/web/app/.../quality/_actions/__tests__/hold-actions.test.ts
apps/web/app/.../quality/__tests__/inspection-actions.test.ts
_meta/plans/.../FALA-11/rep-FIX-T1.md
```
