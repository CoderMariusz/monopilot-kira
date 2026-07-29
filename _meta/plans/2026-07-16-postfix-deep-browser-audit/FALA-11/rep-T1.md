# FALA-11 / TOR T1 — raport (wynik poza specyfikacją + podpisany Fail)

**Zakres:** PF-R16-01 (pomiar OOS zapisany jako PASS), PF-R16-02 (podpisany Fail bez hold/NCR)  
**Data:** 2026-07-29

---

## Zmiany i przyczyna źródłowa

### PF-R16-01 — serwer ufał `pass` z klienta zamiast granic specyfikacji

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/lib/quality/evaluate-inspection-parameter.ts` | 1–73 | **Przyczyna źródłowa:** brak warstwy serwerowej liczącej werdykt z `min_value`/`max_value`. Dodano `isWithinSpecBounds` (porównanie przez `toMicro()` z `lib/shared/decimal.ts`, nie `Number()`), `applySpecBoundsToParameters` (nadpisuje `pass` dla parametrów z granicami numerycznymi) oraz `allParametersPass`. |
| `apps/web/lib/quality/resolve-inspection-parameters.ts` | 7–10, 92–94, 119–147 | Wydzielono `ACTIVE_SPEC_PARAMETERS_SQL` i `loadActiveSpecParameterBounds()` — jedno źródło granic aktywnej specyfikacji incoming/all (jak przy resolve szablonu). |
| `apps/web/app/.../quality/_actions/inspection-actions.ts` | 437–478, 1081–1087, 1159–1173 | `recordInspectionResult`: przed zapisem woła `enforceSpecBoundsOnParameters` — odrzuca `parameter_out_of_spec` gdy klient wysyła `pass:true` przy wartości poza `[min,max]`; zapisuje pochodny `pass` w JSONB. `submitInspectionDecision`: przed e-sign blokuje `decision=pass` gdy po derivacji którykolwiek parametr nie przechodzi (`inspection_parameters_not_passing`). |

**Decyzja: granice włączne (inclusive).** Wartość równa `min` lub `max` **przechodzi** (`compareMicro`: `< min` fail, `> max` fail, równość OK). Przypadek audytu: `5.5001` przy `max=5.5000` → **fail**; `5.5000` przy `max=5.5000` → **pass**.

**Odwrócony zakres:** `quality_spec_parameters` ma CHECK `min_value <= max_value` (`packages/db/__expected__/schema.sql:9989`) — baza nie przechowuje odwróconych granic. Kod nie duplikuje walidacji Fali 10 (kalibracja); zakłada poprawny układ z DB.

**Parametry bez granic numerycznych** (np. Visual): `pass` pozostaje pod kontrolą inspektora.

**Ścieżka decyzji vs zapis wyników:** `recordInspectionResult` odrzuca `parameter_out_of_spec` gdy klient wysyła `pass:true` OOS. `submitInspectionDecision` tylko normalizuje werdykt (nie blokuje Fail na legacy danych z błędnym `pass:true` w JSONB) — inspektor musi móc podpisać Fail na istniejącym rekordzie audytu.

**Migracja 538:** świadomie **nie dodana** — werdykt liczony w akcji serwerowej; constraint DB nie jest wymagany na P1.

### PF-R16-02 — gałąź LP `decision=fail` nie tworzyła obiecanej blokady ani NCR

| Plik | Linie | Co / dlaczego |
|---|---|---|
| `apps/web/app/.../quality/_actions/inspection-actions.ts` | 304–331, 341–431, 597–619, 1181–1189 | **Przyczyna źródłowa:** `applyLpDecisionSideEffects` dla `reference_type='lp'` wołała `createInspectionHoldIfMissing` tylko przy `decision='hold'`, a GRN-fail już miał hold — LP-fail tylko ustawiał `qa_status=rejected`. Teraz `fail` i `hold` tworzą hold (idempotentnie, ten sam reason key); `fail` dodatkowo woła `createInspectionFailureNcrIfMissing` (`reference_type='inspection'`, `linked_hold_id`, outbox `quality.ncr.opened`) **po** e-sign, w tej samej transakcji `withOrgContext`. |

Konsekwencje następują po prawidłowym `signEvent` — bramka e-sign nietknięta.

---

## Testy dodane (nie uruchamiane w torze)

| Plik testu | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `lib/quality/__tests__/evaluate-inspection-parameter.test.ts` | `5.5001` vs max `5.5000` → fail; `5.5000` na granicy → pass; `applySpecBoundsToParameters` odrzuca client `pass:true` OOS | Stary kod nie miał modułu — testy by nie istniały; przy starym `isWithinSpecBounds` zawsze true lub `Number()` drift na granicy |
| `quality/_actions/__tests__/inspection-actions.test.ts` | `recordInspectionResult` odrzuca OOS+pass:true; zapisuje pass:false; akceptuje `5.5000` na max; `submitInspectionDecision` pass blokowany przy OOS; **fail tworzy hold + NCR** | Stary test explicite oczekiwał „fail does NOT open a hold”; `recordInspectionResult` zapisywałby `pass:true` dla `5.5001` |
| `quality/__tests__/inspection-actions.test.ts` | Mock `coalesce(product_id)` + pusty spec — regresja istniejącego zapisu bez granic | Brak mocka → `enforceSpecBoundsOnParameters` zwracałby pusty product lookup i test by nie odzwierciedlał ścieżki |

Importy zweryfikowane: `toMicro` w `lib/shared/decimal.ts:34`; `loadActiveSpecParameterBounds` eksport w `resolve-inspection-parameters.ts`; `recordInspectionResult` importowany w teście akcji.

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `inspection-detail.client.tsx` (UI `pass` toggle) | Granica zaufania = serwer; UI może nadal wysyłać `pass`, serwer go nadpisuje/odrzuca. Client-side derive = duplikat. |
| `app/api/quality/scanner/inspect/route.ts` | Osobna ścieżka fast-path bez e-sign; PF-R16 dotyczy desktop inspection detail. Scanner fail nadal nie tworzy NCR — poza repro audytu. |
| PF-R16-03..06 (NCR create UI, stale detail, Zod text, i18n) | Inne tory Fali 11. |
| Migracja `538-*.sql` | Brak zmiany schematu; CHECK na werdykt nie jest konieczny przy walidacji w akcji. |
| `wo_output` / `grn` fail → NCR auto | GRN już ma hold; NCR auto dodany tylko dla LP fail zgodnie z repro PF-R16-02. |

---

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)

| ID | Opis |
|---|---|
| PF-R16-03 | Ręczne tworzenie NCR bez linków do inspekcji/LP — luka UI, nie DB. |
| PF-R16-04 | NCR detail stale po close — client island state. |
| PF-R16-05 | Raw Zod w błędzie inspekcji — częściowo zaadresowane równolegle (`mapRecordInspectionValidationCode` już w pliku); pełny UX poza T1. |
| Scanner inspect fail | `route.ts:134-142` — fail nie tworzy hold/NCR (tylko `hold` decision); ta sama klasa co PF-R16-02, inna ścieżka wejścia. |

---

## Pliki zmienione

```
apps/web/lib/quality/evaluate-inspection-parameter.ts                    (nowy)
apps/web/lib/quality/__tests__/evaluate-inspection-parameter.test.ts     (nowy)
apps/web/lib/quality/resolve-inspection-parameters.ts
apps/web/app/.../quality/_actions/inspection-actions.ts
apps/web/app/.../quality/_actions/__tests__/inspection-actions.test.ts
apps/web/app/.../quality/__tests__/inspection-actions.test.ts
_meta/plans/.../FALA-11/rep-T1.md                                        (ten plik)
```
