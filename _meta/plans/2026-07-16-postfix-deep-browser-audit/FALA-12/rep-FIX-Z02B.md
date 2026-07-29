# FALA-12 / Z-02B — raport FIX (regresja podstawowej ścieżki zapisu wyników)

**Data:** 2026-07-29  
**Poprzednik:** `rep-FIX-Z02.md` (guard `validateKnownSpecParameters`)

---

## Werdykt

| Test | Status po poprawce |
|---|---|
| `records parameter results and marks the inspection in progress` (`quality/__tests__/inspection-actions.test.ts`) | **DOMKNIĘTE** — mock nie wstrzykuje już fałszywej aktywnej specyfikacji |
| `rejects save when a parameter name is not defined in the active spec (Z-02)` (`_actions/__tests__/inspection-actions.test.ts`) | **DOMKNIĘTE** — logika guarda bez zmian |

---

## Przyczyna regresji (nie bug w guardzie)

Padający test wysyłał parametr `Temperature`, podczas gdy atrapka `client.query` **zawsze** zwracała wiersz aktywnej specyfikacji z parametrem `Visual`:

```typescript
// quality/__tests__/inspection-actions.test.ts (przed poprawką)
if (q.includes('from public.quality_specifications qs')) {
  return { rows: [{ parameter_name: 'Visual', ... }] };
}
```

`enforceSpecBoundsOnParameters` poprawnie ładował spec (`status: 'loaded'`), wołał `validateKnownSpecParameters`, który odrzucał `Temperature` jako `unknown_spec_parameters` → `{ ok: false, reason: 'error', message: 'unknown_spec_parameters' }`.

To **nie** jest przypadek „brak specyfikacji — nie wolno blokować”. To przypadek „spec istnieje, nazwa spoza specyfikacji — blokuj” — guard zachowywał się zgodnie ze zleceniem Z-02.

Podstawowa ścieżka testowa była napisana pod świat **bez** aktywnej specyfikacji (ad-hoc pomiar), ale mock symulował odwrotnie.

---

## Zmiana

| Plik | Co / dlaczego |
|---|---|
| `quality/__tests__/inspection-actions.test.ts` | `activeSpecRows` domyślnie `[]` — atrapa spec zwraca pusty wynik jak produkcyjny brak aktywnej specyfikacji. Test podstawowej ścieżki znów przechodzi bez osłabiania guarda. |

**Logika serwerowa (`evaluate-inspection-parameter.ts`, `inspection-actions.ts`) — bez zmian.** Zachowanie:

| Stan | `recordInspectionResult` (`validateKnownSpecParameters`) | `submitInspectionDecision` pass (`validateSpecParameterCompleteness`) |
|---|---|---|
| Brak aktywnej specyfikacji (`status: 'none'`) | przepuszcza | przepuszcza (brak `bounds`) |
| Spec istnieje, nazwa w spec | przepuszcza (zapis przyrostowy OK) | wymaga kompletności przy pass |
| Spec istnieje, literówka (`Moistur` / `Moisture`) | `unknown_spec_parameters` | `missing_spec_parameters` (stored params z bazy) — oba **odrzucają**, różne kody jak w FALA-11 |

Spójność z bramką decyzji: gdy **nie ma** czego egzekwować (`boundsByName.size === 0` / `status === 'none'`), obie ścieżki przepuszczają. Gdy spec **istnieje**, zapis odrzuca nieznane nazwy natychmiast (Z-02); bramka pass nadal łapie brakujące parametry i stare wiersze spoza spec.

---

## Weryfikacja „na sucho"

```text
grep export evaluate-inspection-parameter.ts → validateKnownSpecParameters, validateSpecParameterCompleteness
grep export inspection-actions.ts → recordInspectionResult
```

Test Z-02 w `_actions/__tests__/inspection-actions.test.ts` ustawia `recordSpecBoundsRows` z `Moisture` i wysyła `Moistur` — padłby bez guarda (zapis z `pass:true`), przechodzi z guardem.

Test podstawowy wysyła `Temperature` przy pustym `activeSpecRows` — padłby **z** guardem gdyby mock nadal zwracał `Visual`; po poprawce mocka przechodzi bez fałszywego odrzucenia.

---

## Pliki zmienione

- `apps/web/app/[locale]/(app)/(modules)/quality/__tests__/inspection-actions.test.ts`
