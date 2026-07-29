# FALA-12 / Z-02 — raport FIX (resztkowy fail-open przy zapisie wyników kontroli)

**Data:** 2026-07-29  
**Źródło:** `FALA-11/E2E-PROD-FALA-11.md` §Z-02 (prod `d5c2319f`)

---

## Werdykt

| Znalezisko | Status |
|---|---|
| Z-02 — `recordInspectionResult` przepuszcza parametry spoza aktywnej specyfikacji (np. `Moistur` zamiast `Moisture`) z `pass:true` | **NAPRAWIONE** |

---

## Przyczyna źródłowa

`enforceSpecBoundsOnParameters` przy `requireSpecCompleteness: false` (ścieżka zapisu wyników) egzekwowała granice numeryczne **tylko** dla parametrów, których znormalizowana nazwa pasowała do mapy specyfikacji (`specMatched`). Nazwy spoza specyfikacji przechodziły w merge **bez zmian**, wraz z flagą `pass` od klienta.

Bramka decyzji (`requireSpecCompleteness: true`) wołała `validateSpecParameterCompleteness`, która odrzucała niekompletne/zmienione nazwy — ale dopiero przy podpisie, więc w bazie zostawał zielony wiersz historii.

---

## Zmiana

| Plik | Co / dlaczego |
|---|---|
| `apps/web/lib/quality/evaluate-inspection-parameter.ts` | Nowa funkcja `validateKnownSpecParameters` — odrzuca duplikaty nazw i parametry spoza aktywnej specyfikacji (`unknown_spec_parameters`). **Nie** wymaga obecności wszystkich parametrów specyfikacji (zapis przyrostowy nadal dozwolony). |
| `apps/web/app/.../quality/_actions/inspection-actions.ts` | W gałęzi `requireSpecCompleteness: false` wołanie `validateKnownSpecParameters` **przed** merge specMatched. Gałąź decyzji (`requireSpecCompleteness: true`) bez zmian — zachowana semantyka `missing_spec_parameters` gdy payload w ogóle nie pasuje do specyfikacji. |

Zachowanie spójne z bramką decyzji dla przypadku mieszanki (znana + nieznana nazwa) i kodem `unknown_spec_parameters`. Gdy aktywnej specyfikacji **nie ma** (`status: 'none'`) lub brak `productId` — wcześniejszy early-return bez egzekucji (jak dotąd).

---

## Testy dodane

| Plik | Co weryfikuje | Czy padłby bez poprawki? |
|---|---|---|
| `evaluate-inspection-parameter.test.ts` — `rejects a typo parameter name…` | `Moistur` → `unknown_spec_parameters` | **TAK** — bez guarda zwraca `{ ok: true }` |
| `evaluate-inspection-parameter.test.ts` — `allows a partial payload…` | tylko `Moisture` przy spec z dwoma parametrami → OK | nie (regresja przeblokowania) |
| `evaluate-inspection-parameter.test.ts` — `allows any payload when the spec defines no parameters` | brak spec → OK | nie (regresja przeblokowania) |
| `inspection-actions.test.ts` — `rejects save when a parameter name is not defined…` | `recordInspectionResult` + typo → odmowa, brak UPDATE | **TAK** — bez guarda zapis przeszedłby z `pass:true` |
| `inspection-actions.test.ts` — `persists a parameter whose name matches…` | `Moisture` w spec → zapis OK | nie (ścieżka podstawowa) |
| `inspection-actions.test.ts` — `allows save when no active specification exists` | pusty spec → zapis dowolnej nazwy OK | nie (regresja przeblokowania) |

Importy zweryfikowane (`grep export`): `recordInspectionResult`, `validateKnownSpecParameters`.

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| Bramka decyzji (`validateSpecParameterCompleteness`) | Zachowana dotychczasowa kolejność `missing` vs `unknown` dla payloadu w 100% spoza specyfikacji |
| i18n `unknown_spec_parameters` (Z-01) | Osobny tor staging — logika serwerowa już zwraca poprawny kod |

---

## Pliki zmienione

- `apps/web/lib/quality/evaluate-inspection-parameter.ts`
- `apps/web/lib/quality/__tests__/evaluate-inspection-parameter.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/__tests__/inspection-actions.test.ts`
